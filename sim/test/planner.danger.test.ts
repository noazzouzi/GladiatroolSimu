/**
 * Tour 4 de la boucle d'amélioration (AMELIORATIONS.md) :
 * - « piège des pics » : un joueur resté dans les pics à portée d'un Troollibre (Aspiratrooll le sort : Vulnérable ×2,
 *   frappe, Troollpoline le renvoie dedans : 2 000 × 2) subit une menace ``spikeTrapThreat`` fois plus forte ;
 * - anticipation élargie dans les tours critiques (``lookaheadExtraLeaves``) : ``lookaheadDanger`` détecte une
 *   anticipation qui perd un joueur ou en laisse un très bas ;
 * - boucle fermée : points de contrôle du plan (vivants, cases après chaque lancer) ; ``executePlan`` s'arrête dès
 *   que l'état réel s'en écarte.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  evaluateWithDetail,
  executePlan,
  lookaheadDanger,
  matchesCheckpoint,
  planPlayerTurn,
} from '../src/planner/index.js';
import { buildSituation, type Situation } from '../src/runner/index.js';

/** Dompteur 2 dans les pics (case 442) avec un Troollibre à portée (case 413) ; le Magicien joue. */
function trap(dompteurHp = 20000, dompteurCell = 442): Situation {
  return {
    version: 1,
    seed: 5,
    turn: 4,
    players: [
      { archetype: 'acrobate', cell: 300 },
      { archetype: 'dompteur', cell: 286 },
      { archetype: 'dompteur', cell: dompteurCell, hp: dompteurHp },
      { archetype: 'magicien', cell: 315 },
    ],
    monsters: [{ type: 'troollibre', cell: 413, hp: 20000 }],
    current: 'J4',
    objectives: { completed: ['empale', 'productivite', 'ebranlable'], active: 'distance_insecurite' },
  } as Situation;
}

function threatOn(s: Situation, name: string, weights = DEFAULT_WEIGHTS): number {
  const { fight } = buildSituation(s);
  const { detail } = evaluateWithDetail(fight, weights);
  const p = fight.state.fighters.find((f) => f.name === name)!;
  return detail.threats.find((t) => t.playerId === p.id)!.expectedDamage;
}

describe('piège des pics (Troollibre contre un joueur resté dans les pics)', () => {
  it('la menace du Troollibre sur le joueur dans les pics est multipliée par spikeTrapThreat', () => {
    const w1 = { ...DEFAULT_WEIGHTS, spikeTrapThreat: {} };
    const plain = threatOn(trap(), 'Dompteur 2', w1);
    const trapped = threatOn(trap(), 'Dompteur 2');
    const factor = DEFAULT_WEIGHTS.spikeTrapThreat['7981']!;
    expect(factor).toBeGreaterThan(1);
    expect(plain).toBeGreaterThan(0);
    expect(trapped / plain).toBeCloseTo(factor, 1);
  });

  it('hors des pics, pas de facteur de piège', () => {
    const w1 = { ...DEFAULT_WEIGHTS, spikeTrapThreat: {} };
    // case 399 : hors des pics, à portée du Troollibre
    expect(threatOn(trap(20000, 399), 'Dompteur 2')).toBe(threatOn(trap(20000, 399), 'Dompteur 2', w1));
  });
});

describe('anticipation élargie dans les tours critiques', () => {
  it('lookaheadDanger : joueur très bas ou mort → vrai ; PV confortables → faux', () => {
    const root = buildSituation(trap()).fight;
    expect(lookaheadDanger(root, buildSituation(trap(20000)).fight)).toBe(false);
    expect(lookaheadDanger(root, buildSituation(trap(3000)).fight)).toBe(true);
    const dead = buildSituation({ ...trap(), players: trap().players.map((p, i) => (i === 2 ? { ...p, dead: true } : p)) } as Situation).fight;
    expect(lookaheadDanger(root, dead)).toBe(true);
  });

  it('les feuilles supplémentaires ne sont anticipées que dans un tour critique', () => {
    const calm = buildSituation(trap(28000, 399)).fight;
    const a = planPlayerTurn(calm, { mode: 'fast', deterministic: true, budget: { lookaheadExtraLeaves: 4 } });
    const b = planPlayerTurn(calm, { mode: 'fast', deterministic: true, budget: { lookaheadExtraLeaves: 0 } });
    // tour calme : même nombre d'anticipations avec ou sans feuilles supplémentaires
    expect(a.stats.lookaheads).toBe(b.stats.lookaheads);
    const critical = buildSituation(trap(2500)).fight;
    const c = planPlayerTurn(critical, { mode: 'fast', deterministic: true, budget: { lookaheadExtraLeaves: 4 } });
    const d = planPlayerTurn(critical, { mode: 'fast', deterministic: true, budget: { lookaheadExtraLeaves: 0 } });
    expect(c.stats.lookaheads).toBeGreaterThan(d.stats.lookaheads);
  });
});

describe('boucle fermée : points de contrôle du plan', () => {
  it('un point de contrôle après chaque lancer ; jets moyens → aucun écart ; état modifié → arrêt', () => {
    const { fight } = buildSituation(trap(28000, 399));
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    const casts = plan.actions.map((a, i) => (a.type === 'cast' ? i : -1)).filter((i) => i >= 0);
    expect(plan.checkpoints.map((c) => c.action)).toEqual(casts);
    expect(casts.length).toBeGreaterThan(0);
    // mêmes jets que la planification : l'exécution suit la prévision
    const same = fight.clone();
    same.state.rollMode = 'average';
    same.state.critMode = 'never';
    const r = executePlan(same, plan.actions, { endTurn: false, checkpoints: plan.checkpoints });
    expect(r.ok).toBe(true);
    // point de contrôle falsifié (une case différente) : arrêt juste après le lancer concerné
    const cp = plan.checkpoints[0]!;
    const bad = { ...cp, cells: cp.cells.map((c, i) => (i === 0 ? c + 1 : c)) };
    const other = fight.clone();
    other.state.rollMode = 'average';
    other.state.critMode = 'never';
    const r2 = executePlan(other, plan.actions, { endTurn: false, checkpoints: [bad] });
    expect(r2.ok).toBe(false);
    expect(r2.deviated).toBe(true);
    expect(r2.executed).toBe(cp.action + 1);
    expect(matchesCheckpoint(other, cp)).toBe(true);
  });
});
