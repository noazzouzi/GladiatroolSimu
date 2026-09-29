/**
 * Revue planificateur (docs/VERIFICATION.md) : les copies de planification ne connaissent pas l'avenir aléatoire
 * (graine du scénario et PRNG de combat neutralisés), sauf en mode ``oracle`` (mesure de la tricherie).
 */
import { describe, expect, it } from 'vitest';
import { planningClone, planPlayerTurn } from '../src/planner/index.js';
import { buildSituation, type Situation } from '../src/runner/index.js';
import { spawnWave, waveForTurn } from '../src/scenario/waves.js';

const SITUATION = {
  version: 1,
  seed: 7,
  turn: 5,
  players: [
    { archetype: 'acrobate', cell: 219 },
    { archetype: 'acrobate', cell: 233 },
    { archetype: 'dompteur', cell: 312 },
    { archetype: 'magicien', cell: 256 },
  ],
  monsters: [{ type: 'troollibre', cell: 273, hp: 15000 }],
  current: 'J4',
} as Situation;

describe('information cachée', () => {
  it('planningClone : graine du scénario et PRNG neutralisés, original intact ; oracle : vrais flux', () => {
    const { fight } = buildSituation(SITUATION);
    const seed = fight.scenario.seed;
    const rngState = fight.state.rng.state;
    const c = planningClone(fight, 'average', 'never');
    expect(c.scenario.seed).not.toBe(seed);
    expect(c.state.rng.state).not.toBe(rngState);
    expect(fight.scenario.seed).toBe(seed);
    expect(fight.state.rng.state).toBe(rngState);
    // déterministe pour un tour donné
    expect(planningClone(fight, 'average', 'never').scenario.seed).toBe(c.scenario.seed);
    const o = planningClone(fight, 'average', 'never', true);
    expect(o.scenario.seed).toBe(seed);
    expect(o.state.rng.state).toBe(rngState);
  });

  it('les cases d’apparition imaginées ne sont pas les vraies (vagues 2 à 10)', () => {
    const { fight } = buildSituation(SITUATION);
    let differ = 0;
    let waves = 0;
    for (let t = 2; t <= 12; t++) {
      const real = fight.clone({ keepLog: false });
      const w = waveForTurn(real.state, t);
      if (!w) continue;
      waves++;
      const plan = planningClone(fight, 'average', 'never');
      const cells = (f: typeof real) => {
        const before = new Set(f.state.fighters.map((x) => x.id));
        spawnWave(f.state, w);
        return f.state.fighters.filter((x) => !before.has(x.id)).map((x) => x.cell).join(',');
      };
      if (cells(real) !== cells(plan)) differ++;
    }
    expect(waves).toBeGreaterThan(3);
    expect(differ).toBeGreaterThan(waves / 2);
  });

  it('planifier ne modifie pas le combat réel', () => {
    const { fight } = buildSituation(SITUATION);
    const seed = fight.scenario.seed;
    const rngState = fight.state.rng.state;
    const hp = fight.state.fighters.map((f) => `${f.cell}:${f.hp}`).join(';');
    planPlayerTurn(fight, { mode: 'greedy', deterministic: true, explain: false });
    expect(fight.scenario.seed).toBe(seed);
    expect(fight.state.rng.state).toBe(rngState);
    expect(fight.state.fighters.map((f) => `${f.cell}:${f.hp}`).join(';')).toBe(hp);
  });
});
