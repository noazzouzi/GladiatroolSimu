/** Aides des tests du scénario : création d'un combat, avancée contrôlée, mises à mort directes, invariants. */
import { expect } from 'vitest';
import { gameData, loadConfig, type ConfigOverrides } from '../../src/data/index.js';
import { finishAction, killFighter, type Fighter } from '../../src/engine/index.js';
import {
  createGladiatroolFight,
  flushScenario,
  resolveAllChoices,
  type ChoiceAnswer,
  type FightSetup,
  type GladiatroolFight,
  type ScenarioChoice,
} from '../../src/scenario/index.js';

/** Jets déterministes par défaut (minimum, jamais de critique). */
export const DET: ConfigOverrides = { rng: { rollMode: 'min', critMode: 'never' } };

/** Sans fenêtre d'Acclamation ni cadeau (pour isoler un mécanisme). */
export const QUIET: ConfigOverrides = { ...DET, bonuses: { firstTurn: 99, lastTurn: 99 }, gifts: { spawnProbability: 0 } };

export function newFight(overrides: ConfigOverrides = DET, setup: FightSetup = {}): GladiatroolFight {
  return createGladiatroolFight(gameData, loadConfig(overrides), { ...setup, options: { eventLog: true, ...(setup.options ?? {}) } });
}

/**
 * Avance en terminant les tours des joueurs et en jouant les monstres (IA du combat) jusqu'à ``pred`` (vérifié à
 * chaque point de décision) ; les choix sont résolus par ``choose`` (défaut : première option).
 */
export function advanceUntil(
  fight: GladiatroolFight,
  pred: (f: GladiatroolFight) => boolean,
  choose: (c: ScenarioChoice, f: GladiatroolFight) => ChoiceAnswer = () => 0,
  max = 2000,
): void {
  for (let i = 0; i < max; i++) {
    if (pred(fight)) return;
    const st = fight.getStatus();
    switch (st.kind) {
      case 'ended':
        throw new Error(`combat terminé avant la condition (tour ${fight.turn})`);
      case 'choice':
        resolveAllChoices(fight, choose);
        break;
      case 'playerTurn':
        fight.endTurn();
        break;
      case 'monsterTurn':
        fight.stepMonsterTurn();
        break;
      case 'idle':
        fight.advance();
        break;
    }
  }
  throw new Error('condition non atteinte');
}

/** Début du tour du joueur ``index`` (rang dans l'ordre de jeu) au tour global ``turn``. */
export function untilPlayerTurn(fight: GladiatroolFight, turn: number, index = 0, choose?: (c: ScenarioChoice, f: GladiatroolFight) => ChoiceAnswer): Fighter {
  const id = fight.scenario.playerIds[index]!;
  advanceUntil(fight, (f) => f.turn === turn && f.getStatus().kind === 'playerTurn' && f.getCurrentFighter()?.id === id, choose);
  return fight.getCurrentFighter()!;
}

/** Tue directement des combattants (outil de test) puis traite les déclenchements et le scénario. */
export function kill(fight: GladiatroolFight, fighters: Fighter[], killerId = -1): void {
  for (const f of fighters) if (f.alive) killFighter(fight.state, f, killerId, 'other');
  finishAction(fight.state);
  flushScenario(fight.state);
}

/** Troolls vivants (hors Mama). */
export function troolls(fight: GladiatroolFight): Fighter[] {
  return fight.getLivingMonsters().filter((f) => f.id !== fight.scenario.mamaId);
}

/** Invariants de l'état (après chaque point de décision / action). */
export function checkInvariants(fight: GladiatroolFight, label = ''): void {
  const s = fight.state;
  const grid = s.ctx.grid;
  const waitCell = s.ctx.data.boss.waitCell;
  const occ = new Map<number, number>();
  for (const f of s.fighters) {
    if (f.alive) {
      expect(f.hp, `${label} PV de ${f.name}`).toBeGreaterThan(0);
      expect(f.hp, `${label} PV max de ${f.name}`).toBeLessThanOrEqual(f.maxHp);
      if (f.cell >= 0) {
        expect(occ.has(f.cell), `${label} case ${f.cell} occupée deux fois`).toBe(false);
        occ.set(f.cell, f.id);
        expect(s.occupancy[f.cell], `${label} occupation de ${f.cell}`).toBe(f.id + 1);
        const allowed = grid.isWalkable(f.cell) || (f.id === fight.scenario.mamaId && f.cell === waitCell);
        expect(allowed, `${label} ${f.name} sur la case non jouable ${f.cell}`).toBe(true);
      } else {
        expect(f.team, `${label} ${f.name} hors carte`).toBe('scenario');
      }
    } else {
      expect(f.cell, `${label} mort ${f.name} sur la carte`).toBe(-1);
    }
    expect(f.ap).toBeGreaterThanOrEqual(0);
    expect(f.mp).toBeGreaterThanOrEqual(0);
  }
  for (let c = 0; c < s.occupancy.length; c++) {
    const o = s.occupancy[c]!;
    if (o !== 0) expect(occ.get(c), `${label} occupation fantôme en ${c}`).toBe(o - 1);
  }
  for (const id of s.timeline) expect(s.fighters[id], `${label} timeline`).toBeDefined();
  for (const c of s.pendingChoices) expect(c.options, `${label} choix sans options`).toBeDefined();
}
