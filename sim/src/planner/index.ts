/**
 * Planificateur du Gladiatrool (pur TypeScript, sans API Node : utilisable dans un Web Worker).
 *
 * - ``planPlayerTurn(fight, options)`` : meilleur tour du joueur dont c'est le tour (actions sérialisables, score,
 *   explication française, bilan, alternatives) ;
 * - ``planTeamTurn(fight, options)`` : tour global de l'équipe (joueurs successifs, monstres simulés, beam d'équipe) ;
 * - ``executePlan`` / ``createPlannerController`` : application d'un plan par l'API publique du combat ;
 * - ``evaluateState`` / ``DEFAULT_WEIGHTS`` : évaluation statique à poids paramétrables.
 */
export * from './types.js';
export { DEFAULT_WEIGHTS, mergeWeights, type PlannerWeights, type UniqueHoldValue } from './weights.js';
export {
  evaluateState,
  evaluateWithDetail,
  damageMultiplier,
  spikeDistance,
  mamaInfo,
  monsterInSpikes,
  playerInSpikes,
  targetableEnemies,
  penseViteCastsLeft,
  cellPositionScore,
  positionContext,
  type EvalDetail,
  type ThreatDetail,
  type MamaInfo,
} from './evaluate.js';
export { generateCastActions, generateEndMoves, castPositions, type MacroAction, type GenerateOptions } from './actions.js';
export { spellProfile, monsterSpellReach, type SpellProfile } from './spellInfo.js';
export {
  defaultChoicePolicy,
  resolveChoicesWith,
  OBJECTIVE_PREFERENCE,
  GIFT_PREFERENCE,
  ACCLAMATION_ORDER,
  type ChoicePolicy,
} from './choicePolicy.js';
export { applyMacro, runLookahead, planningClone, stateHash, now, type LookaheadConfig, type MacroOutcome } from './simulate.js';
export {
  BUDGETS,
  planPlayerTurn,
  lookaheadDanger,
  leafCheckpoints,
  matchesCheckpoint,
  fightSignature,
  searchPlayerTurn,
  outcomeToPlan,
  leafToAlternative,
  leafActions,
  executePlan,
  createPlannerController,
  resolveOptions,
  type PlannerControllerOptions,
  type ResolvedOptions,
  type SearchOutcome,
  type Leaf,
} from './search.js';
export { describeMacro, summarize, explanationText, diffFighters } from './explain.js';
export { planTeamTurn, advanceToNextPlayer } from './team.js';
export {
  createChoicePolicy,
  configChoicePolicy,
  scoreChoice,
  bestOption,
  objectiveFeasibility,
  acclamationValue,
  turnPotential,
  choiceKindLabel,
  objectiveName,
  ACCLAMATION_EVAL,
  type PolicyOptions,
  type ScoredOption,
  type Feasibility,
  type AcclamationPolicyName,
  type VotePolicyName,
  type GiftPolicyName,
} from './policies.js';
