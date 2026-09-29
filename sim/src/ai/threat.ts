/**
 * Estimation de la menace : dégâts attendus que chaque joueur (et invocation des joueurs) peut subir au prochain
 * passage des monstres, pour le planificateur.
 *
 * Méthode : sur UN plateau partagé (board.ts, jets en espérance), chaque monstre vivant qui jouera avant que la ronde
 * ne revienne (ordre de la timeline à partir du combattant courant ; le monstre courant finit son tour avec ses PA /
 * PM restants) commence son tour (glyphe de début de tour s'il est dans les pics ; Rassemblement Troollesque pour la
 * Mama arrivée) puis joue le plan de l'IA (mêmes réglages, mêmes règles de tours passés). Les poussées et les
 * morts s'enchaînent donc comme en jeu ; les joueurs sont supposés ne rien faire entre-temps.
 *
 * Limites : les vagues, cadeaux et fenêtres du tour global suivant, l'arrivée de la Mama (T8) et les déclencheurs
 * différés ne sont pas simulés ; les dégâts sont des espérances (pas de variance).
 */
import type { FightState } from '../engine/index.js';
import type { GladiatroolFight } from '../scenario/index.js';
import { Board, TEAM_PLAYERS, type BoardOptions } from './board.js';
import { applyPlan, planTurn, turnMemo, type PlanOptions } from './plan.js';
import { aiSettingsFor } from './settings.js';
import { resolveOnBoard } from './simulate.js';
import { spikeMult } from './utility.js';

export interface PlayerThreat {
  readonly fighterId: number;
  readonly name: string;
  readonly hp: number;
  /** PV perdus attendus (plafonnés aux PV actuels). */
  readonly expectedDamage: number;
  readonly expectedHpAfter: number;
  /** Mort attendue (PV en espérance ≤ 0). */
  readonly killed: boolean;
  /** Dégâts dus aux pics (entrées). */
  readonly spikeDamage: number;
  /** Poussé dans les pics pendant le passage des monstres. */
  readonly pushedIntoSpikes: boolean;
  /** Multiplicateur des pics porté après le passage (%, 100 = aucun ; 200 = Vulnérable ×2). */
  readonly vulnerabilityAfter: number;
  /** Case prévue après le passage (−1 : mort). */
  readonly cellAfter: number;
}

export interface MonsterThreat {
  readonly monsterId: number;
  readonly name: string;
  /** PV retirés aux joueurs pendant son tour. */
  readonly damageDealt: number;
  /** Nombre d'actions prévues. */
  readonly actions: number;
}

export interface ThreatEstimate {
  readonly players: readonly PlayerThreat[];
  readonly monsters: readonly MonsterThreat[];
  /** Somme des dégâts attendus sur les joueurs. */
  readonly total: number;
  /** Plateau prévu après le passage des monstres. */
  readonly board: Board;
}

export interface ThreatOptions extends BoardOptions, PlanOptions {}

/** Options rapides (planificateur) : jet moyen, sans critique, recherche élaguée. */
export const FAST_THREAT_OPTIONS: ThreatOptions = { roll: 'average', critExpectation: false, maxStartCells: 12, finalMoveCandidates: 2 };

/** Monstres qui joueront avant que la main revienne, dans l'ordre (le monstre courant d'abord). */
function upcomingMonsters(state: FightState): { id: number; current: boolean }[] {
  const tl = state.timeline;
  const out: { id: number; current: boolean }[] = [];
  const cur = state.currentFighterId;
  const waitCell = state.ctx.data.boss.waitCell;
  const start = state.timelineIndex >= 0 ? state.timelineIndex : 0;
  const seen = new Set<number>();
  for (let k = 0; k < tl.length; k++) {
    const id = tl[(start + k) % tl.length]!;
    if (seen.has(id)) continue;
    seen.add(id);
    const f = state.fighters[id];
    if (!f || !f.alive || f.cell < 0 || f.team !== 'monsters' || f.isSummon) continue;
    if (f.cell === waitCell && f.monsterId === state.ctx.data.boss.monsterId) continue;
    const isCurrent = id === cur && state.turnStage === 'active';
    if (k === 0 && !isCurrent && state.turnStage === 'active') continue;
    out.push({ id, current: isCurrent });
  }
  return out;
}

/** Dégâts attendus sur chaque joueur au prochain passage des monstres (voir l'en-tête). */
export function estimateThreat(fight: GladiatroolFight | FightState, opts: ThreatOptions = {}): ThreatEstimate {
  const state = 'state' in fight ? fight.state : fight;
  const b0 = Board.fromState(state, opts);
  let b = b0.clone();
  const env = b.env;
  const monsters: MonsterThreat[] = [];
  const bossId = state.ctx.data.boss.monsterId;
  for (const { id, current } of upcomingMonsters(state)) {
    if (!b.isOn(id)) continue;
    const f = state.fighters[id]!;
    const before = b.hp.slice();
    if (current) b.setActor(id, false);
    else {
      b.startTurn(id);
      if (f.monsterId === bossId && env.rassemblement && b.isOn(id)) {
        resolveOnBoard(b, id, env.rassemblement, b.cell[id]!, 0, 0);
      }
      if (!b.isOn(id)) continue;
    }
    const settings = aiSettingsFor(state.ctx, f);
    const memo = turnMemo(b, settings);
    const plan = planTurn(b, settings, memo, opts);
    b = applyPlan(b, plan);
    let dealt = 0;
    for (let i = 0; i < b.s.n; i++) if (b.s.team[i] === TEAM_PLAYERS) dealt += Math.max(0, before[i]! - Math.max(0, b.hp[i]!));
    monsters.push({ monsterId: id, name: f.name, damageDealt: dealt, actions: plan.steps.length });
  }
  const players: PlayerThreat[] = [];
  let total = 0;
  for (let i = 0; i < b.s.n; i++) {
    if (b.s.team[i] !== TEAM_PLAYERS || !b0.alive[i]) continue;
    const f = state.fighters[i]!;
    const hp0 = b0.hp[i]!;
    const hp1 = Math.max(0, b.hp[i]!);
    const dmg = Math.max(0, hp0 - hp1);
    total += dmg;
    players.push({
      fighterId: i,
      name: f.name,
      hp: hp0,
      expectedDamage: dmg,
      expectedHpAfter: hp1,
      killed: !b.alive[i],
      spikeDamage: b.spikeDmg[i]! - b0.spikeDmg[i]!,
      pushedIntoSpikes: b.entered[i] === 1,
      vulnerabilityAfter: b.alive[i] ? spikeMult(b, i) : 100,
      cellAfter: b.alive[i] ? b.cell[i]! : -1,
    });
  }
  return { players, monsters, total, board: b };
}
