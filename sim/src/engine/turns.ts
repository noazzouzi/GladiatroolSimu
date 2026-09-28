/**
 * Cycle de tour (ETUDE §9.10, N70 §7.2, ``rules.turnStart`` / ``rules.turnEnd``) et timeline simple.
 *
 * Début du tour de X (``startTurn``) :
 *   1. décompte des envoûtements LANCÉS par X (sur tous les porteurs) : délai −1 (à 0 : activation, ou exécution de
 *      l'effet différé), sinon durée −1 (à 0 : retrait → EOFF) ; −1 / ≥ 63 = permanent ; règle du premier tour
 *      (``engine.firstTurnDecrementSkip``) ; marques posées par X ; durée de vie de ses invocations
 *      (``spells.poutchLifetimeTurns``) ;
 *   2. remise à zéro des compteurs de déclenchement des buffs portés par X ;
 *   3. effets TB des buffs portés par X (``engine.turnStartTriggersBeforeDecrement`` : avant le décompte) ;
 *   4. glyphes de début de tour (401) contenant sa case (``boss.invulnerabilityBackBeforeTurnStartSpikes`` = false :
 *      avant le décompte) ;
 *   5. restauration des PA / PM ; durée du tour (3407, lue avant le décompte).
 *   Puis : mort pendant le début de tour → fin du tour ; « Tour annulé » (140) ou monstre qui ne peut pas jouer →
 *   ``turnCancelled`` et fin du tour.
 * Fin du tour (``endTurn``) : effets TE, glyphes de fin de tour (402), remise à zéro des lancers par tour, retrait des
 * envoûtements de durée 0 (« reste du tour »).
 *
 * Machine à états : ``nextTurn`` enchaîne fin du tour courant → combattant suivant de la timeline (morts sautés) →
 * début de tour global (``hooks.onGlobalTurn``) → début de tour ; il s'arrête dès qu'un choix est en attente et
 * reprend à l'appel suivant. ``performAction`` = action du combattant dont c'est le tour (lancer, déplacement, fin).
 * La timeline complète (ordre, vagues) relève du scénario : ici ``setTimeline``, ``insertInTimeline``,
 * ``insertSummonInTimeline`` (une invocation joue juste après son invocateur et ses invocations précédentes).
 */
import { activateBuff, isPermanentDuration, removeBuff, type Buff } from './buffs.js';
import { castSpell, executeBuffEffect, finishAction, type CastResult } from './cast.js';
import { killFighter } from './damage.js';
import { FLAG_CAN_PLAY, type Fighter } from './fighter.js';
import { castTurnGlyphs, decrementMarks } from './marks.js';
import { moveAlongPath, moveTo, type WalkResult } from './movement.js';
import type { FightState } from './state.js';
import { runTurnTriggers } from './triggerProcessing.js';

// ---------------------------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------------------------

/** Remplace la timeline (ids dans l'ordre de jeu) ; aucun tour en cours. */
export function setTimeline(state: FightState, ids: readonly number[]): void {
  state.timeline = ids.slice();
  state.timelineIndex = -1;
  state.turnStage = 'none';
  state.currentFighterId = -1;
}

/** Insère ``fighterId`` après ``afterId`` (en fin si absent ou −1) ; l'index courant reste sur le même combattant. */
export function insertInTimeline(state: FightState, fighterId: number, afterId = -1): number {
  if (state.timeline.includes(fighterId)) return state.timeline.indexOf(fighterId);
  const a = afterId >= 0 ? state.timeline.indexOf(afterId) : -1;
  const at = a >= 0 ? a + 1 : state.timeline.length;
  return insertAt(state, fighterId, at);
}

function insertAt(state: FightState, fighterId: number, at: number): number {
  state.timeline.splice(at, 0, fighterId);
  if (state.timelineIndex >= at) state.timelineIndex += 1;
  return at;
}

/** Retire un combattant de la timeline (l'index courant reste cohérent). */
export function removeFromTimeline(state: FightState, fighterId: number): void {
  const i = state.timeline.indexOf(fighterId);
  if (i < 0) return;
  state.timeline.splice(i, 1);
  // 'pending' : l'index désigne le prochain combattant à jouer, qui est désormais celui qui suivait
  if (state.timelineIndex > i || (state.timelineIndex === i && state.turnStage !== 'pending')) state.timelineIndex -= 1;
}

/**
 * Une invocation joue juste après son invocateur (et après les invocations de celui-ci déjà présentes). Sans effet si
 * l'invocateur n'est pas dans la timeline. Renvoie vrai si l'invocation a été insérée.
 */
export function insertSummonInTimeline(state: FightState, f: Fighter): boolean {
  const tl = state.timeline;
  const i = tl.indexOf(f.summonerId);
  if (i < 0 || tl.includes(f.id)) return false;
  let j = i + 1;
  while (j < tl.length && state.fighters[tl[j]!]?.summonerId === f.summonerId) j++;
  insertAt(state, f.id, j);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Décompte
// ---------------------------------------------------------------------------------------------

/** Règle du premier tour : envoûtement non décompté au premier début de tour de son lanceur. */
function skipAtFirstTurn(state: FightState, turnAdded: number, beforeCasterFirstTurn: boolean): boolean {
  switch (state.ctx.config.engine.firstTurnDecrementSkip) {
    case 'preFight':
      return turnAdded === 0;
    case 'casterFirstTurn':
      return beforeCasterFirstTurn;
    default:
      return false;
  }
}

/**
 * Décompte des envoûtements lancés par ``caster`` (début de son tour) ; ``firstTurn`` : premier tour du lanceur.
 * Exécute les effets différés arrivés à échéance et active les buffs dont le délai s'achève. Les buffs et marques
 * créés pendant ce début de tour (uid > ``sinceUid`` : effets TB exécutés avant le décompte, effets différés) ne sont
 * pas décomptés.
 */
export function decrementBuffsOf(state: FightState, caster: Fighter, firstTurn: boolean, sinceUid = Infinity): void {
  const id = caster.id;
  for (const g of state.fighters) {
    if (g.buffs.length === 0) continue;
    const list = g.buffs.slice();
    for (const b of list) {
      if (b.casterId !== id || b.targetId !== g.id || b.uid > sinceUid || !g.buffs.includes(b)) continue;
      if (firstTurn && skipAtFirstTurn(state, b.turnAdded, b.beforeCasterFirstTurn)) continue;
      if (b.delay > 0) {
        b.delay -= 1;
        if (b.delay === 0) {
          if (b.kind === 'delayed') {
            removeBuff(state, g, b, 'effet différé exécuté');
            executeBuffEffect(state, b);
          } else activateBuff(state, g, b);
        }
        continue;
      }
      if (b.untilTurnEnd || b.duration === 0 || isPermanentDuration(b.duration)) continue;
      b.duration -= 1;
      if (b.duration <= 0) removeBuff(state, g, b, 'expiré');
    }
  }
  decrementMarks(state, id, sinceUid, (turnAdded, before) => firstTurn && skipAtFirstTurn(state, turnAdded, before));
  for (const g of state.fighters) {
    if (g.alive && g.summonerId === id && g.lifetimeLeft > 0) {
      g.lifetimeLeft -= 1;
      if (g.lifetimeLeft === 0) killFighter(state, g, -1, 'other');
    }
  }
}

/** Durée du tour (s) : dernier 3407 actif porté (0 si aucun). */
function currentTurnSeconds(f: Fighter): number {
  let v = 0;
  for (const b of f.buffs) if (b.active && b.effectId === 3407 && b.kind === 'marker') v = b.value;
  return v;
}

/** « Tour annulé » (140) actif. */
export function hasPassTurn(f: Fighter): boolean {
  for (const b of f.buffs) if (b.active && b.effectId === 140) return true;
  return false;
}

// ---------------------------------------------------------------------------------------------
// Début et fin de tour
// ---------------------------------------------------------------------------------------------

export interface TurnStartResult {
  ok: boolean;
  fighterId: number;
  /** Le tour a été annulé (140, monstre qui ne peut pas jouer) et déjà terminé. */
  cancelled: boolean;
  /** Le combattant est mort pendant le début de son tour (pics…) ; le tour est terminé. */
  died: boolean;
  reason?: string;
}

/** Début du tour du global courant (tour global +1), crochet ``onGlobalTurn``. */
export function startGlobalTurn(state: FightState): number {
  state.turn += 1;
  if (state.phase === 'setup') state.phase = 'fighting';
  if (state.logging) state.emit({ type: 'globalTurn', turn: state.turn });
  state.ctx.hooks.onGlobalTurn?.(state, state.turn);
  finishAction(state);
  return state.turn;
}

/** Début du tour de ``fighterId`` (procédure en tête du module). Un tour déjà en cours d'un autre est d'abord terminé. */
export function startTurn(state: FightState, fighterId: number): TurnStartResult {
  const f = state.fighters[fighterId];
  if (!f) return { ok: false, fighterId, cancelled: false, died: false, reason: `combattant inconnu : ${fighterId}` };
  if (!f.alive) return { ok: false, fighterId, cancelled: false, died: true, reason: `${f.name} est mort` };
  if (state.turnStage === 'active' && state.currentFighterId >= 0 && state.currentFighterId !== fighterId) {
    endTurn(state);
  }
  if (state.phase === 'setup') state.phase = 'fighting';
  state.currentFighterId = f.id;
  state.turnStage = 'active';
  const startUid = state.uidSeq;
  const first = f.turnCount === 0;
  f.turnCount += 1;
  f.turnSeconds = currentTurnSeconds(f);
  if (state.logging) state.emit({ type: 'turnStart', turn: state.turn, fighterId: f.id });
  const cfg = state.ctx.config;
  const tbFirst = cfg.engine.turnStartTriggersBeforeDecrement;
  const glyphsFirst = !cfg.boss.invulnerabilityBackBeforeTurnStartSpikes;
  for (const b of f.buffs) b.triggerCount = 0;
  if (glyphsFirst) {
    castTurnGlyphs(state, f, 'glyphTurnStart');
    finishAction(state);
  }
  if (tbFirst) {
    runTurnTriggers(state, f, 'TB');
    finishAction(state);
  }
  decrementBuffsOf(state, f, first, startUid);
  finishAction(state);
  if (!tbFirst) {
    runTurnTriggers(state, f, 'TB');
    finishAction(state);
  }
  if (!glyphsFirst) {
    castTurnGlyphs(state, f, 'glyphTurnStart');
    finishAction(state);
  }
  if (f.alive) f.restoreApMp();
  if (!f.alive) {
    endTurn(state, f.id);
    return { ok: true, fighterId: f.id, cancelled: false, died: true, reason: `${f.name} est mort au début de son tour` };
  }
  state.ctx.hooks.onTurnStart?.(state, f);
  finishAction(state);
  let cancel: string | null = null;
  if (hasPassTurn(f)) cancel = 'tour annulé';
  else if (f.kind !== 'archetype' && (f.flags & FLAG_CAN_PLAY) === 0) cancel = 'ne peut pas jouer';
  if (cancel) {
    if (state.logging) state.emit({ type: 'turnCancelled', fighterId: f.id, reason: cancel });
    endTurn(state, f.id);
    return { ok: true, fighterId: f.id, cancelled: true, died: false, reason: cancel };
  }
  return { ok: true, fighterId: f.id, cancelled: false, died: false };
}

/** Fin du tour du combattant courant (ou de ``fighterId``) : TE, glyphes 402, remises à zéro, durées 0. */
export function endTurn(state: FightState, fighterId = state.currentFighterId): { ok: boolean; reason?: string } {
  const f = state.fighters[fighterId];
  if (!f) return { ok: false, reason: 'aucun tour en cours' };
  if (f.alive) {
    runTurnTriggers(state, f, 'TE');
    finishAction(state);
    castTurnGlyphs(state, f, 'glyphTurnEnd');
    finishAction(state);
  }
  f.resetCastCounters();
  let expired: Buff[] | null = null;
  for (const g of state.fighters) {
    for (const b of g.buffs) if (b.untilTurnEnd) (expired ??= []).push(b);
  }
  if (expired) {
    for (const b of expired) {
      const g = state.fighters[b.targetId];
      if (g) removeBuff(state, g, b, 'fin du tour');
    }
    finishAction(state);
  }
  if (state.logging) state.emit({ type: 'turnEnd', turn: state.turn, fighterId: f.id });
  if (state.currentFighterId === f.id) {
    state.currentFighterId = -1;
    state.turnStage = 'none';
  }
  state.ctx.hooks.onTurnEnd?.(state, f);
  finishAction(state);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Enchaînement
// ---------------------------------------------------------------------------------------------

export type TurnAdvance =
  | { status: 'turnStarted'; fighterId: number }
  | { status: 'pendingChoice' }
  | { status: 'ended' }
  | { status: 'noFighter' };

/** Garde-fou : nombre maximal d'étapes d'un ``nextTurn`` (tours annulés enchaînés). */
const MAX_ADVANCE_STEPS = 10_000;

/**
 * Termine le tour en cours (s'il y en a un) et commence celui du prochain combattant vivant de la timeline (tour
 * global suivant en fin de liste). S'arrête (``pendingChoice``) si un choix est en attente, avant ou après un début de
 * tour global ; l'appel suivant reprend là où il s'était arrêté. Les tours annulés (140) et les morts au début de
 * leur tour sont enchaînés.
 */
export function nextTurn(state: FightState): TurnAdvance {
  for (let guard = 0; guard < MAX_ADVANCE_STEPS; guard++) {
    if (state.phase === 'ended') return { status: 'ended' };
    if (state.pendingChoices.length) return { status: 'pendingChoice' };
    if (state.turnStage === 'active') {
      endTurn(state);
      state.turnStage = 'none';
      continue;
    }
    if (state.turnStage === 'pending') {
      const id = state.timeline[state.timelineIndex];
      state.turnStage = 'none';
      const f = id === undefined ? undefined : state.fighters[id];
      if (!f || !f.alive) continue;
      const r = startTurn(state, f.id);
      if (r.cancelled || r.died || !r.ok) continue;
      return { status: 'turnStarted', fighterId: f.id };
    }
    if (state.timeline.length === 0) return { status: 'noFighter' };
    if (!state.timeline.some((id) => state.fighters[id]?.alive)) return { status: 'noFighter' };
    let idx = state.timelineIndex + 1;
    // nouveau tour global : fin de liste, ou tout premier tour du combat
    if (idx >= state.timeline.length || (state.timelineIndex < 0 && state.turn === 0)) {
      idx = 0;
      state.timelineIndex = 0;
      state.turnStage = 'pending';
      startGlobalTurn(state);
      continue;
    }
    state.timelineIndex = idx;
    state.turnStage = 'pending';
  }
  throw new Error('nextTurn : trop d’étapes (tours annulés en boucle ?)');
}

// ---------------------------------------------------------------------------------------------
// Actions du combattant dont c'est le tour
// ---------------------------------------------------------------------------------------------

export type FightAction =
  | { type: 'cast'; spellLevelId: number; cell: number }
  | { type: 'move'; path: readonly number[] }
  | { type: 'moveTo'; cell: number; avoidSpikes?: boolean }
  | { type: 'endTurn' };

export interface ActionResult {
  ok: boolean;
  code?: string;
  /** Raison d'un refus (français). */
  reason?: string;
  cast?: CastResult;
  walk?: WalkResult;
}

/** Action du combattant ``fighterId`` pendant son tour : lancer, déplacement ou fin de tour (validations comprises). */
export function performAction(state: FightState, fighterId: number, action: FightAction): ActionResult {
  const f = state.fighters[fighterId];
  if (!f) return { ok: false, code: 'UNKNOWN_FIGHTER', reason: `combattant inconnu : ${fighterId}` };
  if (state.phase === 'ended') return { ok: false, code: 'FIGHT_ENDED', reason: 'le combat est terminé' };
  if (state.turnStage !== 'active' || state.currentFighterId !== fighterId) {
    return { ok: false, code: 'NOT_YOUR_TURN', reason: `ce n'est pas le tour de ${f.name}` };
  }
  if (state.pendingChoices.length) return { ok: false, code: 'PENDING_CHOICE', reason: 'un choix est en attente' };
  switch (action.type) {
    case 'cast': {
      const r = castSpell(state, fighterId, action.spellLevelId, action.cell);
      return { ok: r.ok, code: r.code, reason: r.reason, cast: r };
    }
    case 'move': {
      const r = moveAlongPath(state, fighterId, action.path);
      return { ok: r.ok, code: r.code, reason: r.reason, walk: r };
    }
    case 'moveTo': {
      const r = moveTo(state, fighterId, action.cell, { avoidSpikes: action.avoidSpikes });
      return { ok: r.ok, code: r.code, reason: r.reason, walk: r };
    }
    case 'endTurn':
      endTurn(state, fighterId);
      return { ok: true };
  }
}

/** Tours (du lanceur) restants d'un envoûtement, délai compris : −1 = permanent, 0 = reste du tour. */
export function remainingTurns(b: Buff): number {
  if (b.untilTurnEnd) return 0;
  if (isPermanentDuration(b.duration)) return -1;
  return b.delay + b.duration;
}
