/**
 * Scénario du Gladiatrool (voir docs/ARCHITECTURE.md, section « Scénario ») : mise en place, tour global (vagues,
 * cadeaux, fenêtres de choix), Mama, objectifs, victoire / défaite et API de pilotage (machine à états).
 *
 * Point d'entrée : ``createGladiatroolFight(data?, config?, { players, seed, options })`` → ``GladiatroolFight``.
 */
export * from './types.js';
export { GladiatroolFight, passiveMonsterController, resolveAllChoices, type MonsterTurnFn } from './fight.js';
export { createGladiatroolFight, createScenarioContext, DEFAULT_AUTO_PLACEMENT } from './setup.js';
export { ScenarioState, scenarioOf, requireScenario, type PendingCompletion } from './scenarioState.js';
export { installScenarioHooks, hasScenarioHooks, flushScenario, checkEnd, endFight, scenarioCast } from './hooks.js';
export { fillPendingChoices, resolveChoice, getChoiceOptions, pendingChoicesOf, choiceContent } from './choices.js';
export {
  activateObjective,
  completeActiveObjective,
  objectiveById,
  objectivesOfTier,
  challengerOf,
  isPlayerCharacter,
  isEnemy,
  trackingStartsAtActivation,
  ENEMY_IN_SPIKES_STATE,
} from './objectives.js';
export { spawnWave, waveForTurn, nearestSafeFreeCell } from './waves.js';
export { maybeSpawnGift, giftCells } from './gifts.js';
export { computeTimeline, insertNewMonsters, initiativeOf } from './timeline.js';
export { derivedRng, mixSeed, pickDistinct, RNG_TAG } from './random.js';
export {
  simpleMonsterController,
  createRandomController,
  playUntilEnd,
  type PlayOptions,
  type TurnController,
} from './controllers.js';
