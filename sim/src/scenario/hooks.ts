/**
 * Branchement du scénario sur le moteur (``EngineContext.hooks``) et logique serveur du tour global :
 *
 * - ``onTrigger`` : historique des morts, cadeaux ramassés, suivi des objectifs, fin du combat ;
 * - ``onTurnStart`` / ``onTurnEnd`` : objectifs « pendant le tour d'un allié », bug du cadeau pendant le Rassemblement
 *   (``boss.giftCancelsRassemblement``), puis traitement des validations en attente ;
 * - ``onGlobalTurn`` (ETUDE §2.1) : fin du tour global précédent (contrôles de 30710 « Objectif Check »), limite de
 *   tours, fenêtre d'Acclamations (30658 lancé par l'entité de scénario, T2–T9), vague n, cadeau, « combatCanFinish »
 *   (30577, à partir de ``victory.canFinishFromTurn``), ordre de jeu du tour ;
 * - ``flushScenario`` : point sûr (hors résolution d'un sort) — récompense des objectifs validés (→ vote), options des
 *   choix, victoire / défaite.
 *
 * Les crochets sont partagés par tous les états du contexte (clones du planificateur) : ils ne lisent que l'état reçu.
 */
import {
  insertInTimeline,
  resolveSpell,
  type EngineContext,
  type Fighter,
  type FightState,
  type Team,
  type TriggerEvent,
} from '../engine/index.js';
import { fillPendingChoices } from './choices.js';
import { maybeSpawnGift } from './gifts.js';
import {
  isPlayerCharacter,
  objectivesOnGlobalTurnEnd,
  objectivesOnTrigger,
  objectivesOnTurnEnd,
  objectivesOnTurnStart,
  processPendingCompletion,
} from './objectives.js';
import { scenarioOf, type ScenarioState } from './scenarioState.js';
import { applyTimelineAtGlobalTurnStart, computeTimeline } from './timeline.js';
import type { EndReason } from './types.js';
import { spawnWave, waveForTurn } from './waves.js';

const installed = new WeakSet<EngineContext>();

/** Installe les crochets du scénario sur un contexte (idempotent ; les crochets existants sont conservés et appelés d'abord). */
export function installScenarioHooks(ctx: EngineContext): void {
  if (installed.has(ctx)) return;
  installed.add(ctx);
  const prev = { ...ctx.hooks };
  ctx.hooks.onTrigger = (s, ev) => {
    prev.onTrigger?.(s, ev);
    scenarioOnTrigger(s, ev);
  };
  ctx.hooks.onTurnStart = (s, f) => {
    prev.onTurnStart?.(s, f);
    scenarioOnTurnStart(s, f);
  };
  ctx.hooks.onTurnEnd = (s, f) => {
    prev.onTurnEnd?.(s, f);
    scenarioOnTurnEnd(s, f);
  };
  ctx.hooks.onGlobalTurn = (s, turn) => {
    prev.onGlobalTurn?.(s, turn);
    scenarioOnGlobalTurn(s, turn);
  };
  ctx.hooks.onFighterAdded = (s, f, cause) => {
    prev.onFighterAdded?.(s, f, cause);
    // joueur ressuscité absent de la timeline (timeline.deadPlayersKeepSlot faux) : il rejoue en fin de tour global
    if (cause === 'resurrect' && scenarioOf(s) && isPlayerCharacter(f) && !s.timeline.includes(f.id)) insertInTimeline(s, f.id);
  };
}

/** Le contexte porte-t-il les crochets du scénario ? */
export function hasScenarioHooks(ctx: EngineContext): boolean {
  return installed.has(ctx);
}

// ---------------------------------------------------------------------------------------------
// Fin du combat
// ---------------------------------------------------------------------------------------------

const END_TEXT: Record<EndReason, string> = {
  victory: 'tous les ennemis sont morts',
  defeat: 'tous les joueurs sont morts',
  turnLimit: 'limite de tours atteinte',
  noFighter: 'plus aucun combattant',
};

export function endFight(state: FightState, sc: ScenarioState, winner: Team | null, reason: EndReason): void {
  if (state.phase === 'ended') return;
  state.phase = 'ended';
  state.winner = winner;
  sc.endReason = reason;
  if (state.logging) state.emit({ type: 'fightEnded', winner, reason: END_TEXT[reason] });
}

/**
 * Victoire (ETUDE §2.6) : plus aucun ennemi vivant (Troolls et Mama) ET état « combatCanFinish » (5965) sur l'entité
 * de scénario ; défaite : plus aucun joueur vivant. Renvoie vrai si le combat est terminé.
 */
export function checkEnd(state: FightState): boolean {
  const sc = scenarioOf(state);
  if (!sc) return state.phase === 'ended';
  if (state.phase === 'ended') return true;
  let players = 0;
  let enemies = 0;
  for (const f of state.fighters) {
    if (!f.alive) continue;
    if (isPlayerCharacter(f)) players++;
    else if (f.team === 'monsters') enemies++;
  }
  if (players === 0 && sc.playerIds.length > 0) {
    endFight(state, sc, 'monsters', 'defeat');
    return true;
  }
  if (enemies === 0) {
    const sce = state.fighters[sc.sceId];
    if (sce && sce.hasState(state.ctx.data.scenario.victory.requiresState)) {
      endFight(state, sc, 'players', 'victory');
      return true;
    }
  }
  return false;
}

/**
 * Point sûr (entre deux actions) : récompense de l'objectif validé (qui ouvre le vote suivant), options des choix en
 * attente, fin du combat.
 */
export function flushScenario(state: FightState): void {
  const sc = scenarioOf(state);
  if (!sc) return;
  for (let guard = 0; sc.pendingCompletion && guard < 16; guard++) processPendingCompletion(state);
  if (state.pendingChoices.length) fillPendingChoices(state);
  checkEnd(state);
}

// ---------------------------------------------------------------------------------------------
// Crochets
// ---------------------------------------------------------------------------------------------

function scenarioOnTrigger(state: FightState, ev: TriggerEvent): void {
  const sc = scenarioOf(state);
  if (!sc) return;
  if (ev.type === 'death') {
    const f = state.fighters[ev.targetId];
    if (f) sc.deaths.push({ fighterId: f.id, turn: state.turn, killerId: ev.killerId, cause: ev.cause, team: f.team });
  } else if (ev.type === 'cast' && ev.spellLevelId === state.ctx.data.scenario.gifts.triggerSpellLevels[0]) {
    sc.giftsTaken += 1;
    sc.giftDuringTurnOf = state.turnStage === 'active' ? state.currentFighterId : -1;
  }
  if (state.phase === 'ended') return;
  objectivesOnTrigger(state, sc, ev);
  if (ev.type === 'death') checkEnd(state);
}

function scenarioOnTurnStart(state: FightState, f: Fighter): void {
  const sc = scenarioOf(state);
  if (!sc || state.phase === 'ended') return;
  objectivesOnTurnStart(state, sc, f);
  if (f.id === sc.mamaId && sc.giftDuringTurnOf === f.id && state.ctx.config.boss.giftCancelsRassemblement) sc.skipTurnOf = f.id;
  flushScenario(state);
}

function scenarioOnTurnEnd(state: FightState, f: Fighter): void {
  const sc = scenarioOf(state);
  if (!sc) return;
  if (state.phase !== 'ended') objectivesOnTurnEnd(state, sc, f);
  if (sc.giftDuringTurnOf === f.id) sc.giftDuringTurnOf = -1;
  if (sc.skipTurnOf === f.id) sc.skipTurnOf = -1;
  flushScenario(state);
}

/** Sort lancé par l'entité de scénario (profondeur 1 : pas un lancer de joueur). */
export function scenarioCast(state: FightState, sc: ScenarioState, spellLevelId: number, cell = -1): void {
  const sce = state.fighters[sc.sceId];
  if (!sce || !state.ctx.hasSpell(spellLevelId)) return;
  resolveSpell(state, sce, state.ctx.getSpell(spellLevelId), cell, { depth: 1 });
}

function scenarioOnGlobalTurn(state: FightState, turn: number): void {
  const sc = scenarioOf(state);
  if (!sc || state.phase === 'ended') return;
  const cfg = state.ctx.config;
  const scen = state.ctx.data.scenario;
  // fin du tour global précédent (30710 « Objectif Check »)
  if (turn > 1) {
    objectivesOnGlobalTurnEnd(state, sc);
    processPendingCompletion(state);
  }
  if (cfg.victory.turnLimit !== null && turn > cfg.victory.turnLimit) {
    endFight(state, sc, null, 'turnLimit');
    return;
  }
  // 1. fenêtre d'Acclamations (choix 17)
  if (turn >= cfg.bonuses.firstTurn && turn <= cfg.bonuses.lastTurn && scen.bonuses.spellLevels[0] !== undefined) {
    scenarioCast(state, sc, scen.bonuses.spellLevels[0]);
  }
  // 2. vague n
  const wave = waveForTurn(state, turn);
  if (wave) spawnWave(state, wave);
  // 3. cadeau
  maybeSpawnGift(state, sc, turn);
  // 30577 « Finish Fight Trigger » : la victoire devient possible
  const sce = state.fighters[sc.sceId];
  if (turn >= cfg.victory.canFinishFromTurn && sce && !sce.hasState(scen.victory.requiresState)) {
    scenarioCast(state, sc, scen.victory.stateSetBySpellLevel);
  }
  // 4. ordre de jeu du tour
  applyTimelineAtGlobalTurnStart(state, computeTimeline(state, sc));
  flushScenario(state);
}
