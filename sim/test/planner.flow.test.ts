/**
 * Planificateur de bout en bout : combats complets, joueurs pilotés par ``createPlannerController`` (mode fast,
 * déterministe), monstres par ``simpleMonsterController`` (en attendant l'IA du module ``ai``). Invariants du scénario
 * à chaque point de décision, budget de temps, et aucun joueur qui finit son tour dans les pics en y entrant.
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig } from '../src/data/index.js';
import { createGladiatroolFight, playUntilEnd, simpleMonsterController, type TurnController } from '../src/scenario/index.js';
import { createPlannerController, defaultChoicePolicy } from '../src/planner/index.js';
import { checkInvariants } from './helpers/scenarioSetup.js';

const ARCH = { A: 'acrobate', D: 'dompteur', M: 'magicien' } as const;

function runFight(comp: 'ADDM' | 'AADM', seed: number) {
  const fight = createGladiatroolFight(gameData, loadConfig({}), {
    players: comp.split('').map((c, i) => ({ archetype: ARCH[c as keyof typeof ARCH], ...(i === 0 ? { startCell: 314 } : {}) })),
    seed,
    options: { monsterController: simpleMonsterController },
  });
  const inner = createPlannerController({ mode: 'fast', deterministic: true });
  const times: number[] = [];
  let enteredSpikes = 0;
  const players: TurnController = {
    playTurn(f, id) {
      const startSpike = f.ctx.grid.isSpike(f.state.fighters[id]!.cell);
      const t = performance.now();
      inner.playTurn(f, id);
      times.push(performance.now() - t);
      const p = f.state.fighters[id]!;
      if (p.alive && !startSpike && f.ctx.grid.isSpike(p.cell) && f.getCurrentFighter()?.id === id) enteredSpikes++;
    },
  };
  let steps = 0;
  const st = playUntilEnd(fight, {
    players,
    choose: defaultChoicePolicy,
    maxTurn: 14,
    onStep: (f) => {
      if (steps++ % 5 === 0) checkInvariants(f, `tour ${f.turn}`);
    },
  });
  times.sort((a, b) => a - b);
  return { fight, st, times, enteredSpikes };
}

describe('combats complets pilotés par le planificateur', () => {
  for (const [comp, seed] of [['ADDM', 1], ['AADM', 2]] as const) {
    it(`${comp}, graine ${seed} : combat terminé, invariants, budget`, () => {
      const { fight, st, times, enteredSpikes } = runFight(comp, seed);
      expect(st.kind).toBe('ended');
      expect(fight.turn).toBeLessThanOrEqual(14);
      expect(enteredSpikes).toBe(0);
      const median = times[times.length >> 1]!;
      // anticipation « fullRound » (tour 3) : ≈ 2 × plus coûteuse qu’« globalTurn » ; reste sous le budget fast (300 ms)
      expect(median).toBeLessThan(250);
      expect(fight.scenario.completed.length).toBeGreaterThan(0);
    }, 30000);
  }
});
