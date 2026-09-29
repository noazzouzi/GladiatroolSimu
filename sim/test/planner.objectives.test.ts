/**
 * Objectifs difficiles pour le planificateur (AMELIORATIONS.md, tour 2) :
 * - « Attention, sol glissant » (un ennemi meurt de dommages de poussée) : la poussée qui tue par collision est
 *   générée en priorité et jouée ; un ennemi poussable presque mort vaut ``pushKillSetup`` tant que l'objectif court ;
 * - « 1, 2, 3, Soleil ! » : rester sur sa case de départ vaut la condition remplie, sauf si un joueur a déjà échoué.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WEIGHTS,
  evaluateWithDetail,
  executePlan,
  generateCastActions,
  planPlayerTurn,
} from '../src/planner/index.js';
import { buildSituation, type Situation } from '../src/runner/index.js';

const VIDEUR = 80507;

function solGlissant(hp: number): Situation {
  return {
    version: 1,
    seed: 5,
    turn: 3,
    players: [
      { archetype: 'acrobate', cell: 244 },
      { archetype: 'dompteur', cell: 330 },
      { archetype: 'dompteur', cell: 331 },
      { archetype: 'magicien', cell: 345 },
    ],
    // Artroolleur dans les pics (199) : poussé vers 184 puis bloqué par le bord → collision
    monsters: [
      { type: 'artroolleur', cell: 199, hp },
      { type: 'troollibre', cell: 402, hp: 20000 },
    ],
    current: 'J1',
    objectives: { completed: ['empale'], active: 'sol_glissant' },
  } as Situation;
}

describe('« Attention, sol glissant » (mort par dommages de poussée)', () => {
  it('la poussée qui tue par collision est en tête des candidats (estimation a priori)', () => {
    const { fight } = buildSituation(solGlissant(500));
    const cands = generateCastActions(fight, { maxCandidates: 40, perSpellQuota: 6, weights: DEFAULT_WEIGHTS });
    const best = cands[0]!;
    expect(best.prior).toBeGreaterThanOrEqual(DEFAULT_WEIGHTS.objectiveCompleted);
    expect(best.spellLevelId).toBe(VIDEUR);
  });

  it("l'Acrobate valide l'objectif en poussant l'ennemi affaibli contre le bord", () => {
    const { fight } = buildSituation(solGlissant(500));
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    const r = executePlan(fight, plan.actions, { endTurn: false });
    expect(r.ok).toBe(true);
    expect(fight.scenario.completed.map((o) => o.objectiveId)).toContain('sol_glissant');
  });

  it('un ennemi poussable presque mort vaut « pushKillSetup » pendant l’objectif', () => {
    const low = evaluateWithDetail(buildSituation(solGlissant(900)).fight).detail.terms['objectifs']!;
    const high = evaluateWithDetail(buildSituation(solGlissant(5000)).fight).detail.terms['objectifs']!;
    expect(low - high).toBeCloseTo(DEFAULT_WEIGHTS.pushKillSetup, 0);
  });
});

describe('« 1, 2, 3, Soleil ! » (finir son tour sur sa case de départ)', () => {
  const SIT: Situation = {
    version: 1,
    seed: 5,
    turn: 3,
    players: [
      { archetype: 'acrobate', cell: 300 },
      { archetype: 'dompteur', cell: 330 },
      { archetype: 'dompteur', cell: 331 },
      { archetype: 'magicien', cell: 345 },
    ],
    monsters: [{ type: 'troollibre', cell: 402, hp: 20000 }],
    current: 'J1',
    objectives: { completed: ['empale'], active: 'soleil' },
  } as Situation;

  it('rester sur sa case de départ vaut la condition remplie ; en partir la perd', () => {
    const { fight } = buildSituation(SIT);
    const stay = evaluateWithDetail(fight).detail.terms['objectifs']!;
    expect(fight.playerMove([315]).ok).toBe(true);
    const moved = evaluateWithDetail(fight).detail.terms['objectifs']!;
    expect(stay - moved).toBeCloseTo(2 * DEFAULT_WEIGHTS.objectiveCompleted * DEFAULT_WEIGHTS.objectivePendingFactor, 0);
  });
});
