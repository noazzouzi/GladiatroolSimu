/**
 * Anticipation « fullRound » (AMELIORATIONS.md, tour 3) : depuis le dernier joueur du tour global, l'anticipation va
 * jusqu'à SON prochain tour (les monstres qui jouent après le premier joueur au tour suivant sont simulés), alors
 * que « globalTurn » s'arrête au début du tour global suivant.
 */
import { describe, expect, it } from 'vitest';
import { anticipationMonsterAi } from '../src/ai/index.js';
import { createPlannerController, defaultChoicePolicy, planPlayerTurn, runLookahead } from '../src/planner/index.js';
import { buildSituation, type Situation } from '../src/runner/index.js';

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
  monsters: [
    { type: 'troollibre', cell: 273, hp: 15000 },
    { type: 'troollibre', cell: 285, hp: 18000 },
  ],
  current: 'J4',
  objectives: { completed: ['empale', 'meurtres_serie'], active: 'ebranlable' },
} as Situation;

function setup() {
  const { fight } = buildSituation(SITUATION);
  const st = fight.getStatus();
  expect(st.kind).toBe('playerTurn');
  const actorId = (st as { fighterId: number }).fighterId;
  const teammate = createPlannerController({ mode: 'greedy', deterministic: true, explain: false });
  return { fight, actorId, teammate };
}

describe('anticipation fullRound', () => {
  it('depuis le dernier joueur : va jusqu’à son prochain tour (globalTurn s’arrête au début du tour suivant)', () => {
    const { fight, actorId, teammate } = setup();
    const cfg = { monsters: anticipationMonsterAi, policy: defaultChoicePolicy, teammate };
    const g = runLookahead(fight, actorId, { ...cfg, mode: 'globalTurn' });
    const r = runLookahead(fight, actorId, { ...cfg, mode: 'fullRound' });
    expect(fight.turn).toBe(5);
    expect(g.turn).toBe(6);
    const gs = g.getStatus();
    expect(gs.kind === 'playerTurn' && gs.fighterId === actorId).toBe(false);
    expect(r.turn).toBe(6);
    const rs = r.getStatus();
    expect(rs.kind).toBe('playerTurn');
    expect((rs as { fighterId: number }).fighterId).toBe(actorId);
    // le combat réel n'a pas bougé (copies)
    expect(fight.getStatus().kind).toBe('playerTurn');
    expect(fight.turn).toBe(5);
  });

  it('le planificateur (fast, défaut fullRound) annonce une anticipation jusqu’au tour suivant du joueur', () => {
    const { fight } = setup();
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    expect(plan.summary.lookahead).not.toBeNull();
    expect(plan.summary.lookahead!.untilFighter).toBe('Magicien');
    expect(plan.summary.lookahead!.turn).toBe(6);
  }, 20000);
});
