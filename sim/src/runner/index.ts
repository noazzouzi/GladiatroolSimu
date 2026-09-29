/**
 * Runner du Gladiatrool (partie pure, sans API Node : utilisable dans un Web Worker) : combat complet piloté
 * (``runFight``), trace rejouable (``replayTrace``), situations JSON (``buildSituation``), expériences Monte Carlo
 * (``runExperimentSync``, statistiques), carte ASCII. L'exécution multi-cœurs Node est dans
 * ``nodeExperiment.ts`` (``runExperiment``), à importer séparément.
 */
export * from './types.js';
export { parseComposition, compositionOf, ARCHETYPE_LETTERS, REFERENCE_COMPOSITIONS, type ParsedComposition } from './compositions.js';
export { runFight, resultLine, contextFor, monsterControllerFor, totalEnemyHp, destroyedEnemyHp } from './runFight.js';
export { installRecorder, replayTrace, fightFromTrace, type ReplayUntil, type ReplayResult } from './trace.js';
export {
  buildSituation,
  validateSituation,
  MONSTER_TYPES,
  type Situation,
  type SituationPlayer,
  type SituationMonster,
  type SituationState,
  type BuiltSituation,
} from './situation.js';
export {
  experimentJobs,
  runJob,
  summarizeExperiment,
  runExperimentSync,
  parseSeeds,
  formatExperimentTable,
  type ExperimentJob,
} from './experiment.js';
export { wilsonInterval, meanStat, mcnemarExactP, variantStats, pairedComparison } from './stats.js';
export { renderMap, fighterLabels, type MapRenderOptions } from './asciiMap.js';
export { buildJournal, JournalNotes } from './journal.js';
export { BENCH_SPEC, BENCH_VERSION, benchSummary, formatBench, type BenchReport, type BenchLine } from './bench.js';
