/**
 * Glyphes et auras (ETUDE §9.10, §9.13 ; N70 §7.3 ; notes 30 §2-§3) : comportement des marques posées par 401, 402,
 * 1091 et 1165 (``state.marks``). Branché sur les arrivées / départs de case du noyau (movement.ts appelle
 * ``marksOnEnter`` / ``marksOnLeave`` avant les crochets utilisateur) et sur le cycle de tour (turns.ts).
 *
 * - AURA (1091, pics = 30390 niv. 2) : à l'ENTRÉE d'un combattant que le masque de pose accepte (``a,A`` : tous sauf
 *   l'entité de scénario) — marche, poussée, attirance, avance, téléportation, échange, résurrection — le poseur
 *   lance le sort de l'aura sur la case d'arrivée (dommages « de glyphe », ``fromMark``) ; le combattant devient
 *   « occupant ». À la SORTIE, les buffs produits par cette application (même lancer racine) sont retirés : les
 *   états perdus déclenchent EOFF (→ passif 30700 → 30701 : ×2 de sortie, joueurs et Troolls, pas la Mama). Passer
 *   d'une case de l'aura à une autre ne redéclenche rien (``spikes.retriggerOnMoveInside``). Paramètres (valables
 *   pour toute aura ; la seule des données est celle des pics) : ``spikes.triggerWhenWalkingThrough``,
 *   ``spikes.walkThroughInterruptsMovement``, ``spikes.retriggerOnMoveInside``, ``spikes.stackExitAndInside``
 *   (false : la vulnérabilité de sortie 30701 encore active est retirée à la ré-entrée), ``spikes.auraAppliesMidSpell``
 *   (movement.ts), ``boss.invulnerabilityLiftedBeforeEntryDamage`` (false : les états d'entrée — 5902, donc l'EON
 *   qui lève l'invulnérabilité de la Mama — sont posés APRÈS les dommages d'entrée).
 * - GLYPHE DE DÉBUT / FIN DE TOUR (401 / 402, pics = 30390 niv. 3) : quand un combattant accepté par le masque
 *   commence / finit son tour sur une case de la marque, le poseur lance le sort sur sa case.
 * - GLYPHE IMMÉDIAT (1165, cadeau) : à chaque entrée d'un combattant accepté (marche, y compris en traversée ;
 *   déplacement forcé seulement si ``gifts.pushedPlayerTriggers``), le poseur lance le sort sur la case. La marque
 *   n'est pas retirée par l'entrée elle-même (le sort du cadeau la dissipe par 2018).
 * - Durée des marques : tours du poseur (décomptée au début de ses tours, turns.ts) ; −1 = permanente. Un combattant
 *   qui apparaît sur une marque ne la déclenche pas (``enterMarksAt`` pour le scénario s'il le faut).
 */
import type { MaskData } from '../data/index.js';
import { removeBuffsWhere } from './buffs.js';
import { resolveSpell } from './cast.js';
import type { CellMoveCause } from './context.js';
import type { MarkTriggerReason } from './events.js';
import type { Fighter } from './fighter.js';
import { SPELL_IDS } from './spells.js';
import type { FightState, Mark } from './state.js';
import { matchesMask } from './targeting.js';
import { flushTriggers } from './triggerQueue.js';

/** Poseur d'une marque (null s'il n'existe plus). */
function markCaster(state: FightState, m: Mark): Fighter | null {
  return state.fighters[m.casterId] ?? null;
}

/** Le combattant déclenche-t-il la marque (masque de l'effet de pose, évalué pour le poseur) ? */
export function markAccepts(state: FightState, m: Mark, f: Fighter): boolean {
  if (!f.alive) return false;
  const caster = markCaster(state, m);
  if (!caster) return false;
  const mask: MaskData | null = m.mask;
  return mask === null || matchesMask(state, caster, f, mask);
}

function emitMark(state: FightState, m: Mark, f: Fighter, reason: MarkTriggerReason): void {
  if (state.logging) state.emit({ type: 'markTriggered', markUid: m.uid, fighterId: f.id, spellLevelId: m.spellLevelId, reason });
}

/** Le poseur lance le sort de la marque sur ``cell`` (lancer racine ``rootCastId``). */
function castMarkSpell(
  state: FightState,
  m: Mark,
  cell: number,
  rootCastId: number,
  effectFilter: ((e: { handler: string }) => boolean) | null = null,
): void {
  const caster = markCaster(state, m);
  if (!caster || !m.spellLevelId || !state.ctx.hasSpell(m.spellLevelId)) return;
  // le sort de la marque ne traite que ses propres déclenchements (ex. EON5902 de la Mama entre l'état et les
  // 2 000) ; les événements antérieurs (collision qui a précédé l'arrivée…) sont traités ensuite par le vidage englobant
  const mark = state.flushMark;
  state.flushMark = state.triggerQueue.length;
  try {
    resolveSpell(state, caster, state.ctx.getSpell(m.spellLevelId), cell, {
      depth: 1,
      critical: m.critical,
      rootCastId,
      fromMark: true,
      markUid: m.uid,
      allowDeadCaster: true,
      effectFilter,
    });
  } finally {
    state.flushMark = mark;
  }
}

// ---------------------------------------------------------------------------------------------
// Auras
// ---------------------------------------------------------------------------------------------

/** Applique l'aura ``m`` à ``f`` (occupant enregistré, sort lancé sur ``cell``). */
function applyAura(state: FightState, m: Mark, f: Fighter, cell: number): void {
  const root = state.newUid();
  const i = m.occupants.indexOf(f.id);
  if (i >= 0) m.occupantRoots[i] = root;
  else {
    m.occupants.push(f.id);
    m.occupantRoots.push(root);
  }
  emitMark(state, m, f, 'enter');
  if (!state.ctx.config.boss.invulnerabilityLiftedBeforeEntryDamage) {
    // états d'entrée (950) posés après les autres effets (dommages) : EON5902 de la Mama après les 2 000
    castMarkSpell(state, m, cell, root, (e) => e.handler !== 'setState');
    if (f.alive && f.cell === cell) castMarkSpell(state, m, cell, root, (e) => e.handler === 'setState');
  } else {
    castMarkSpell(state, m, cell, root);
  }
}

/** Sortie de l'aura : retrait des buffs produits par l'application (EOFF des états perdus). */
function exitAura(state: FightState, m: Mark, f: Fighter, emit = true): void {
  const i = m.occupants.indexOf(f.id);
  if (i < 0) return;
  const root = m.occupantRoots[i]!;
  m.occupants.splice(i, 1);
  m.occupantRoots.splice(i, 1);
  if (emit) emitMark(state, m, f, 'exit');
  if (f.buffs.length) removeBuffsWhere(state, f, (b) => b.rootCastId === root, 'sortie de la zone');
}

function enterAura(state: FightState, m: Mark, f: Fighter, cell: number, cause: CellMoveCause): boolean {
  const cfg = state.ctx.config.spikes;
  const walkingThrough = cause.kind === 'walk' && !cause.final;
  if (walkingThrough && !cfg.triggerWhenWalkingThrough) return false;
  const i = m.occupants.indexOf(f.id);
  if (i >= 0) {
    if (!cfg.retriggerOnMoveInside) return false;
    // ré-application : les nouveaux effets d'abord, puis retrait des anciens (pas d'EOFF parasite)
    const old = m.occupantRoots[i]!;
    applyAura(state, m, f, cell);
    if (f.buffs.length) removeBuffsWhere(state, f, (b) => b.rootCastId === old, 'effets d’aura renouvelés');
    return walkingThrough && cfg.walkThroughInterruptsMovement;
  }
  if (!markAccepts(state, m, f)) return false;
  if (!cfg.stackExitAndInside && f.buffs.length) {
    removeBuffsWhere(state, f, (b) => b.spellId === SPELL_IDS.spikesExit, 'vulnérabilité de sortie remplacée');
  }
  applyAura(state, m, f, cell);
  return walkingThrough && cfg.walkThroughInterruptsMovement;
}

// ---------------------------------------------------------------------------------------------
// Glyphe immédiat (1165)
// ---------------------------------------------------------------------------------------------

function enterGlyph(state: FightState, m: Mark, f: Fighter, cell: number, cause: CellMoveCause): void {
  const voluntary = cause.kind === 'walk' || cause.kind === 'teleport';
  if (!voluntary && !state.ctx.config.gifts.pushedPlayerTriggers) return;
  if (!markAccepts(state, m, f)) return;
  emitMark(state, m, f, 'glyph');
  castMarkSpell(state, m, cell, state.newUid());
}

// ---------------------------------------------------------------------------------------------
// Points d'entrée (movement.ts, turns.ts, triggerProcessing.ts)
// ---------------------------------------------------------------------------------------------

/**
 * Arrivée de ``f`` sur ``cell`` (depuis ``from``) : auras et glyphes immédiats contenant la case, dans l'ordre de pose.
 * Renvoie vrai si la marche doit s'interrompre (``spikes.walkThroughInterruptsMovement``).
 */
export function marksOnEnter(state: FightState, f: Fighter, cell: number, _from: number, cause: CellMoveCause): boolean {
  if (state.marks.length === 0) return false;
  let stop = false;
  for (const m of state.marks.slice()) {
    if (!f.alive || f.cell !== cell) break;
    if (!m.contains(cell) || !state.marks.includes(m)) continue;
    if (m.type === 'aura') stop = enterAura(state, m, f, cell, cause) || stop;
    else if (m.type === 'glyphImmediate') enterGlyph(state, m, f, cell, cause);
  }
  return stop;
}

/** Départ de ``f`` de ``cell`` (sa case courante est déjà la nouvelle) : sortie des auras quittées. */
export function marksOnLeave(state: FightState, f: Fighter, _cell: number, _cause: CellMoveCause): void {
  if (state.marks.length === 0) return;
  for (const m of state.marks.slice()) {
    if (m.type !== 'aura' || !m.occupants.includes(f.id)) continue;
    if (f.alive && f.cell >= 0 && m.contains(f.cell)) continue;
    exitAura(state, m, f);
  }
}

/** Mort : le combattant n'occupe plus les auras (ses buffs restent attachés, inertes). */
export function marksOnDeath(state: FightState, fighterId: number): void {
  for (const m of state.marks) {
    const i = m.occupants.indexOf(fighterId);
    if (i >= 0) {
      m.occupants.splice(i, 1);
      m.occupantRoots.splice(i, 1);
    }
  }
}

/** Applique les marques de la case courante de ``f`` comme une arrivée (apparition sur une marque : scénario). */
export function enterMarksAt(state: FightState, f: Fighter, kind: CellMoveCause['kind'] = 'place'): boolean {
  if (!f.alive || f.cell < 0) return false;
  const stop = marksOnEnter(state, f, f.cell, -1, { kind, sourceId: f.id, castId: 0, final: true });
  if (state.castDepth === 0) flushTriggers(state);
  return stop;
}

/** Glyphes de début (401) ou de fin (402) de tour sur la case de ``f`` : le poseur lance leur sort sur lui. */
export function castTurnGlyphs(state: FightState, f: Fighter, type: 'glyphTurnStart' | 'glyphTurnEnd'): number {
  if (state.marks.length === 0 || !f.alive || f.cell < 0) return 0;
  let n = 0;
  for (const m of state.marks.slice()) {
    if (!f.alive || f.cell < 0) break;
    if (m.type !== type || !m.contains(f.cell) || !state.marks.includes(m) || !markAccepts(state, m, f)) continue;
    emitMark(state, m, f, type === 'glyphTurnStart' ? 'turnStart' : 'turnEnd');
    castMarkSpell(state, m, f.cell, state.newUid());
    n++;
  }
  return n;
}

/** Retire une marque ; les occupants d'une aura en sortent (retrait des effets, EOFF). */
export function removeMark(state: FightState, m: Mark, reason: string): void {
  const i = state.marks.indexOf(m);
  if (i < 0) return;
  state.marks.splice(i, 1);
  for (const id of m.occupants.slice()) {
    const f = state.fighters[id];
    if (f) exitAura(state, m, f, false);
  }
  if (state.logging) state.emit({ type: 'markRemoved', markUid: m.uid, reason });
}

/**
 * Décompte des marques posées par ``casterId`` (début de son tour) : durée −1 ; retirée à 0. Marques posées pendant
 * ce début de tour (uid > ``sinceUid``) et règle du premier tour (``skipFirst``, turns.ts) : non décomptées.
 */
export function decrementMarks(
  state: FightState,
  casterId: number,
  sinceUid: number,
  skipFirst: (turnAdded: number, before: boolean) => boolean,
): void {
  if (state.marks.length === 0) return;
  for (const m of state.marks.slice()) {
    if (m.casterId !== casterId || m.uid > sinceUid || m.duration < 0 || m.duration >= 63) continue;
    if (skipFirst(m.turnAdded, m.beforeCasterFirstTurn)) continue;
    m.duration -= 1;
    if (m.duration <= 0) removeMark(state, m, 'expirée');
  }
}
