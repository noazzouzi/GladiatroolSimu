/**
 * Mama restée dans les pics (AMELIORATIONS.md, tour 1) : invulnérable tant qu'elle n'en sort pas puis n'y ré-entre
 * (ÉTUDE §6.6). Le planificateur doit trouver « la sortir puis l'y remettre » dans le même tour.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, evaluateState, planPlayerTurn } from '../src/planner/index.js';
import { buildSituation, type Situation } from '../src/runner/index.js';
import { passiveMonsterController, resolveAllChoices, type GladiatroolFight } from '../src/scenario/index.js';

const SIT: Situation = {
  version: 1,
  seed: 3,
  turn: 14,
  players: [
    { archetype: 'acrobate', cell: 315, hp: 30000 },
    { archetype: 'acrobate', cell: 328, hp: 30000 },
    { archetype: 'dompteur', cell: 300, hp: 30000 },
    { archetype: 'magicien', cell: 245, hp: 30000 },
  ],
  monsters: [{ type: 'mama', cell: 221, hp: 18000 }],
  current: 'J1',
  objectives: { completed: ['empale', 'productivite', 'stop_projectiles', 'distance_insecurite', 'tout_va_bien'] },
} as Situation;

/** Mama dans les pics au T14 (fenêtre ouverte), puis tout le monde passe : au T15 elle est invulnérable dedans. */
function stuckMama(): GladiatroolFight {
  const { fight } = buildSituation(SIT);
  const j1 = fight.scenario.playerIds[0]!;
  for (let i = 0; i < 200; i++) {
    const st = fight.getStatus();
    if (st.kind === 'playerTurn' && st.fighterId === j1 && fight.turn === 15) return fight;
    if (st.kind === 'playerTurn') fight.endTurn();
    else if (st.kind === 'monsterTurn') fight.stepMonsterTurn(passiveMonsterController);
    else if (st.kind === 'choice') resolveAllChoices(fight);
    else if (st.kind === 'idle') fight.advance();
    else break;
  }
  throw new Error('T15 non atteint');
}

describe('Mama restée invulnérable dans les pics (ÉTUDE §6.6)', () => {
  it('la pénalité « Mama coincée » est levée quand elle sort des pics', () => {
    const fight = stuckMama();
    const mama = fight.state.fighters[fight.scenario.mamaId]!;
    expect(mama.invulnerable).toBe(true);
    const base = evaluateState(fight);
    const withoutPenalty = evaluateState(fight, { ...DEFAULT_WEIGHTS, mamaStuck: 0 });
    expect(withoutPenalty - base).toBeCloseTo(10000, -1);
  });

  it("l'Acrobate la sort puis l'y remet dans le même tour : fenêtre rouverte", () => {
    const fight = stuckMama();
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    const casts = plan.actions.filter((a) => a.type === 'cast');
    expect(casts.length).toBeGreaterThanOrEqual(2);
    const copy = fight.clone({ keepLog: false });
    for (const a of plan.actions) {
      if (a.type === 'move') copy.playerMove(a.path);
      else if (a.type === 'cast') copy.playerCast(a.spellLevelId, a.cell);
    }
    const mama = copy.state.fighters[copy.scenario.mamaId]!;
    expect(mama.invulnerable).toBe(false);
    expect(copy.ctx.grid.isSpike(mama.cell)).toBe(true);
    expect(mama.hp).toBeLessThan(18000);
  });
});

