/**
 * IA des monstres du Gladiatrool (module ``ai``) : contrôleurs (``MonsterController`` du scénario), planification d'un
 * tour sur un plateau léger, estimation de menace. Aucune API Node (utilisable dans un Web Worker).
 */
export { Board, BoardView, TEAM_MONSTERS, TEAM_PLAYERS, TEAM_SCENARIO, type BoardOptions, type RollEstimate } from './board.js';
export { aiEnv, type AiEnv } from './env.js';
export { aiSettingsFor, type AiSettings, type AiWeights, type ResolvedRule } from './settings.js';
export { boardCanCastOn, boardCanCastSpell, boardCast, resolveOnBoard, spellInfo, type SpellInfo } from './simulate.js';
export { chooseFocus, effectiveHp, spikeMult, utility, type EvalContext } from './utility.js';
export { applyPlan, planTurn, turnMemo, type MonsterPlan, type PlanOptions, type PlanStep, type TurnMemo, type TurnMode } from './plan.js';
export {
  ANTICIPATION_OPTIONS,
  anticipationMonsterAi,
  createMonsterAi,
  monsterAi,
  playMonsterTurn,
  type MonsterAi,
  type MonsterAiOptions,
} from './controller.js';
export { estimateThreat, FAST_THREAT_OPTIONS, type MonsterThreat, type PlayerThreat, type ThreatEstimate, type ThreatOptions } from './threat.js';
