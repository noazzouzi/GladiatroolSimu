/**
 * Simulation des macro-actions et anticipation, UNIQUEMENT par l'API publique du combat (``GladiatroolFight`` :
 * ``clone``, ``playerMove``, ``playerCast``, ``endTurn``, ``stepMonsterTurn``, ``resolveChoice``) : le planificateur
 * ne modifie jamais un état autrement que par des actions légales.
 */
import type { CritMode, RollMode } from '../data/index.js';
import type { GladiatroolFight, MonsterController, MonsterTurnFn, TurnController } from '../scenario/index.js';
import type { MacroAction } from './actions.js';
import { resolveChoicesWith, type ChoicePolicy } from './choicePolicy.js';
import type { AssumedChoice, LookaheadMode } from './types.js';

/** Horloge (ms) disponible dans Node comme dans un navigateur / Web Worker. */
export function now(): number {
  const p = (globalThis as { performance?: { now(): number } }).performance;
  return p ? p.now() : Date.now();
}

/** Copie de travail : sans journal, jets et critiques de planification. */
export function planningClone(fight: GladiatroolFight, rollMode: RollMode, critMode: CritMode): GladiatroolFight {
  const c = fight.clone({ keepLog: false });
  c.state.rollMode = rollMode;
  c.state.critMode = critMode;
  return c;
}

export interface MacroOutcome {
  ok: boolean;
  fight: GladiatroolFight;
  choices: AssumedChoice[];
}

/** Applique une macro-action sur une COPIE (déplacement puis lancer ; choix résolus par la politique). */
export function applyMacro(fight: GladiatroolFight, macro: MacroAction, policy: ChoicePolicy): MacroOutcome {
  const f = fight.clone({ keepLog: false });
  const choices: AssumedChoice[] = [];
  const actor = fight.getCurrentFighter();
  const actorId = actor ? actor.id : -1;
  if (macro.path.length) {
    const r = f.playerMove(macro.path);
    if (!r.ok) return { ok: false, fight: f, choices };
    if (!resolveChoicesWith(f, policy, choices)) return { ok: false, fight: f, choices };
  }
  if (macro.spellLevelId !== null) {
    const cur = f.getCurrentFighter();
    if (!f.isPlayerTurn() || !cur || cur.id !== actorId) return { ok: false, fight: f, choices };
    const r = f.playerCast(macro.spellLevelId, macro.cell);
    if (!r.ok) return { ok: false, fight: f, choices };
    if (!resolveChoicesWith(f, policy, choices)) return { ok: false, fight: f, choices };
  }
  return { ok: true, fight: f, choices };
}

/** Le tour de ``actorId`` est-il toujours en cours (vivant, pas de fin de combat) ? */
export function actorStillPlaying(fight: GladiatroolFight, actorId: number): boolean {
  if (!fight.isPlayerTurn()) return false;
  const f = fight.getCurrentFighter();
  return !!f && f.id === actorId;
}

export interface LookaheadConfig {
  mode: LookaheadMode;
  monsters: MonsterController | MonsterTurnFn;
  policy: ChoicePolicy;
  teammate: TurnController | null;
}

/**
 * Anticipation depuis une feuille (tour du joueur en cours, avant sa fin) : fin du tour, puis tours des monstres
 * (contrôleur injecté) jusqu'au prochain joueur (``nextPlayer``) ou jusqu'au début du tour global suivant
 * (``globalTurn`` : coéquipiers joués par ``teammate``). Travaille sur une copie ; renvoie l'état atteint.
 */
export function runLookahead(leaf: GladiatroolFight, actorId: number, cfg: LookaheadConfig): GladiatroolFight {
  const f = leaf.clone({ keepLog: false });
  const startTurn = f.turn;
  resolveChoicesWith(f, cfg.policy);
  let st = f.getStatus();
  if (st.kind === 'playerTurn' && st.fighterId === actorId) st = f.endTurn();
  for (let guard = 0; guard < 400; guard++) {
    switch (st.kind) {
      case 'ended':
        return f;
      case 'choice':
        if (!resolveChoicesWith(f, cfg.policy)) return f;
        st = f.getStatus();
        if (st.kind === 'idle') st = f.advance();
        break;
      case 'monsterTurn':
        st = f.stepMonsterTurn(cfg.monsters);
        break;
      case 'playerTurn': {
        if (cfg.mode !== 'globalTurn' || f.turn > startTurn || !cfg.teammate) return f;
        const id = st.fighterId;
        cfg.teammate.playTurn(f, id);
        resolveChoicesWith(f, cfg.policy);
        st = f.getStatus();
        if (st.kind === 'playerTurn' && st.fighterId === id) st = f.endTurn();
        else if (st.kind === 'idle') st = f.advance();
        break;
      }
      case 'idle':
        st = f.advance();
        break;
    }
  }
  return f;
}

/** Empreinte rapide d'un état (déduplication des transpositions : A puis B = B puis A). */
export function stateHash(fight: GladiatroolFight): number {
  const s = fight.state;
  let h = 2166136261 >>> 0;
  const mix = (v: number): void => {
    h ^= v & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= (v >>> 16) & 0xffff;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const f of s.fighters) {
    mix(f.alive ? f.cell + 1 : 0);
    mix(f.hp);
    mix(f.buffs.length);
  }
  const cur = s.turnStage === 'active' ? s.fighters[s.currentFighterId] : undefined;
  if (cur) {
    mix(cur.apUsed);
    mix(cur.mpUsed);
    mix(cur.spells.length);
    let casts = 0;
    for (const r of cur.casts) casts = casts * 7 + r.turnCasts;
    mix(casts);
  }
  const sc = fight.scenario;
  mix(sc.completed.length);
  mix(sc.counter);
  mix(sc.giftsTaken);
  mix(s.pendingChoices.length);
  return h >>> 0;
}
