/** Aides des tests du moteur : contexte, combat et placement rapides sur la carte réelle. */
import type { ArchetypeKey, ConfigOverrides } from '../../src/data/index.js';
import { cellInDirection } from '../../src/geometry/index.js';
import {
  addFighter,
  createEngineContext,
  createFight,
  type EngineContext,
  type EngineHooks,
  type Fighter,
  type FightState,
  type Team,
} from '../../src/engine/index.js';

/** Contexte avec jets déterministes par défaut (rollMode min, jamais de critique) ; surcharges fusionnées. */
export function testContext(overrides: ConfigOverrides = {}, hooks?: EngineHooks): EngineContext {
  const rng = { rollMode: 'min', critMode: 'never', ...(overrides.rng ?? {}) } as ConfigOverrides['rng'];
  return createEngineContext({ overrides: { ...overrides, rng }, hooks });
}

export function testFight(overrides: ConfigOverrides = {}, hooks?: EngineHooks): FightState {
  return createFight(testContext(overrides, hooks));
}

export function archetype(state: FightState, key: ArchetypeKey, cell: number, spells: number[] | 'all' = 'all'): Fighter {
  return addFighter(state, { kind: 'archetype', archetype: key, spells }, cell);
}

export function monster(state: FightState, monsterId: number, cell: number, team?: Team): Fighter {
  return addFighter(state, { kind: 'monster', monsterId, team }, cell);
}

export function scenarioEntity(state: FightState): Fighter {
  return addFighter(state, { kind: 'scenario' }, -1);
}

/** Troollibre (7981), Artroolleur (7982), Nitrooll (7983), Mama (7984), Poutch (7985). */
export const M = { troollibre: 7981, artroolleur: 7982, nitrooll: 7983, mama: 7984, poutch: 7985 } as const;

/** Niveaux de sort utilisés dans les tests. */
export const SL = {
  frappe: 80499,
  impact: 80500,
  grondement: 80501,
  prelevement: 80502,
  coupDeSang: 80504,
  videur: 80507,
  soutien: 80509,
  voltige: 80510,
  pugnace: 80511,
  vaTenGuerre: 80512,
  hanedimane: 80513,
  aironemane: 80522,
  pulsation: 80514,
  regain: 80515,
  amplification: 80516,
  ventsContraires: 80517,
  protection: 80519,
  delivrance: 80521,
  relachement: 80839,
  relachementGrowth: 80976,
  tirArtroollerie: 80486,
  aspiratrooll: 80484,
  troollpoline: 80483,
  spikesEntry: 80492,
  spikesTurnStart: 81026,
  spikesGlyph: 80489,
  exitSpikes: 81025,
  playerPassive: 80897,
} as const;

/** Case à ``n`` pas dans la direction ``dir`` ; lève une erreur hors carte. */
export function cellInDirectionOrThrow(cell: number, dir: number, n: number): number {
  const c = cellInDirection(cell, dir, n);
  if (c < 0) throw new Error(`hors carte : ${cell} + ${n} × dir ${dir}`);
  return c;
}
