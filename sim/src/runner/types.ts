/**
 * Types publics du runner (tous SÉRIALISABLES en JSON : résultats, traces, spécifications d'expérience — ils
 * traversent les ``postMessage`` des workers).
 */
import type { ConfigOverrides } from '../data/index.js';
import type { MonsterAiOptions } from '../ai/index.js';
import type { Team } from '../engine/index.js';
import type { PlannerMode, PlannerWeights, PolicyOptions, SearchBudget } from '../planner/index.js';
import type { EndReason, PlayerSetup } from '../scenario/index.js';

/** Contrôleur des monstres : IA du module ``ai`` (défaut), IA triviale du scénario, passifs. */
export type MonsterControllerName = 'ai' | 'simple' | 'passive';
/** Contrôleur des joueurs : planificateur (défaut), passifs (fin de tour immédiate). */
export type PlayerControllerName = 'planner' | 'passive';

/** Réglages sérialisables du planificateur pour le runner. */
export interface PlannerSettings {
  budget?: Partial<SearchBudget>;
  weights?: Partial<PlannerWeights>;
  /** Supprime le plafond de temps (résultat indépendant de la machine) ; défaut : vrai en fast / greedy, faux en deep. */
  deterministic?: boolean;
  /**
   * Options de l'IA des monstres pendant l'anticipation (fusionnées sur ``ANTICIPATION_OPTIONS`` du module ``ai``) ;
   * absentes : ``anticipationMonsterAi``.
   */
  anticipationAi?: Partial<MonsterAiOptions>;
  /** Replanifications au plus quand une action est refusée (jets réels ≠ jets moyens). Défaut 2. */
  maxReplans?: number;
  /**
   * Boucle fermée : replanifier dès que l'état réel s'écarte d'un point de contrôle du plan (vivants, cases), par
   * exemple quand un coup critique tue une cible plus tôt que prévu. Défaut vrai.
   */
  replanOnDeviation?: boolean;
  /** Replanifications au plus, par tour, pour écart avec la prévision. Défaut 4. */
  maxDeviationReplans?: number;
  /** TRICHE (mesure seulement) : le planificateur anticipe avec les vrais tirages futurs. Défaut faux. */
  oracle?: boolean;
}

/** Mise en place d'un combat du runner. */
export interface RunSetup {
  /** Composition compacte (« ADDM », « AADM@287,314,286,315 ») — ignorée si ``players`` est donné. */
  compo?: string;
  players?: PlayerSetup[];
  /** Graine du combat (jets, critiques). */
  seed: number;
  /** Graine des tirages du scénario (défaut : ``seed``). */
  scenarioSeed?: number;
}

export interface RunOptions {
  /** Mode du planificateur des joueurs (défaut ``fast``). */
  mode?: PlannerMode;
  planner?: PlannerSettings;
  /** Politiques de choix (défaut : configuration). */
  policies?: PolicyOptions;
  /** Surcharges de la configuration (hypothèses). */
  configOverrides?: ConfigOverrides;
  monsters?: MonsterControllerName;
  players?: PlayerControllerName;
  /** Arrêt au-delà de ce tour global (défaut 20) : résultat ``maxTurn``. */
  maxTurn?: number;
  /** Journal lisible en français (tour par tour, plans expliqués, choix motivés). */
  journal?: boolean;
  /** Trace d'actions rejouable (``replayTrace``). */
  trace?: boolean;
}

export interface ChoiceRecord {
  turn: number;
  /** Joueur concerné (nom), ou « équipe » pour un vote. */
  fighter: string;
  kind: string;
  label: string;
  reason: string;
}

export interface DeathSummary {
  name: string;
  archetype: string;
  turn: number;
  cause: string;
}

export interface TimingSummary {
  totalMs: number;
  playerTurns: number;
  planMsMedian: number;
  planMsP95: number;
  planMsMax: number;
  monsterMs: number;
  /** Replanifications (action refusée avec les jets réels). */
  replans: number;
}

/** Résultat complet d'un combat. */
export interface FightRunResult {
  compo: string;
  seed: number;
  mode: PlannerMode;
  winner: Team | null;
  victory: boolean;
  /** Raison de fin (``maxTurn`` : arrêt du runner au-delà de ``maxTurn``). */
  reason: EndReason | 'maxTurn' | null;
  /** Tour global atteint (tour de fin). */
  turnReached: number;
  playersAlive: number;
  playerDeaths: DeathSummary[];
  objectives: { id: string; name: string; tier: number; turn: number }[];
  objectivesCount: number;
  /** PV ennemis de tout le combat (toutes les vagues + Mama, données). */
  enemyHpTotal: number;
  /** PV ennemis détruits (monstres apparus : PV de base − PV restants ; morts : PV de base). */
  enemyHpDestroyed: number;
  /** ``enemyHpDestroyed / enemyHpTotal``. */
  progress: number;
  monstersSpawned: number;
  monstersKilled: number;
  mamaArrived: boolean;
  /** Tour global de la mort de la Mama, sinon null. */
  mamaKilledTurn: number | null;
  mamaHpLeft: number;
  giftsSpawned: number;
  giftsTaken: number;
  choices: ChoiceRecord[];
  timing: TimingSummary;
  journal?: string[];
  trace?: FightTrace;
}

// ---------------------------------------------------------------------------------------------
// Trace rejouable
// ---------------------------------------------------------------------------------------------

/**
 * Pas d'une trace : action réussie d'un combattant (joueur ou monstre), fin de tour, réponse à un choix. Les
 * actions sont rejouées par l'API publique ; mêmes graine et configuration → même combat.
 */
export type TraceStep =
  | { k: 'cast'; f: number; s: number; c: number; t: number }
  /** ``p`` : chemin, ou case d'arrivée (plus court chemin ; ``a`` : sans traverser les pics). */
  | { k: 'move'; f: number; p: number[] | number; a?: boolean; t: number }
  | { k: 'end'; f: number; t: number }
  | { k: 'choice'; l: number; f: number; a: number | { votes: number[] }; t: number };

export interface FightTrace {
  version: 1;
  setup: { players: PlayerSetup[]; seed: number; scenarioSeed?: number };
  configOverrides?: ConfigOverrides;
  /** Informations (non utilisées au rejeu). */
  info: { compo: string; mode: PlannerMode; monsters: MonsterControllerName };
  steps: TraceStep[];
}

// ---------------------------------------------------------------------------------------------
// Expériences
// ---------------------------------------------------------------------------------------------

export interface Variant {
  name: string;
  /** Composition (``RunSetup.compo``) ou joueurs explicites. */
  compo?: string;
  players?: PlayerSetup[];
  configOverrides?: ConfigOverrides;
  policies?: PolicyOptions;
  planner?: PlannerSettings;
  /** Mode du planificateur de cette variante (défaut : celui de l'expérience). */
  mode?: PlannerMode;
  monsters?: MonsterControllerName;
}

export interface ExperimentSpec {
  variants: Variant[];
  /** Mêmes graines pour toutes les variantes (comparaison appariée). */
  seeds: number[];
  mode?: PlannerMode;
  maxTurn?: number;
}

export interface Interval {
  low: number;
  high: number;
}

export interface MeanStat {
  mean: number;
  sd: number;
  /** Intervalle de confiance à 95 % de la moyenne (normal). */
  ci95: Interval;
}

export interface VariantStats {
  name: string;
  runs: number;
  wins: number;
  winRate: number;
  /** Intervalle de Wilson à 95 %. */
  winRateCi95: Interval;
  turnReached: MeanStat;
  progress: MeanStat;
  objectives: MeanStat;
  playerDeaths: MeanStat;
  /** Fraction des combats où la Mama est tuée. */
  mamaKilledRate: number;
  mamaKilledTurn: MeanStat | null;
  /** Répartition des raisons de fin. */
  reasons: Record<string, number>;
  /** Durée de calcul moyenne d'un combat (ms) et totale. */
  msPerFight: number;
  totalMs: number;
  planMsP95: number;
}

/** Comparaison appariée (mêmes graines) de deux variantes. */
export interface PairedComparison {
  a: string;
  b: string;
  seeds: number;
  /** Graines où A gagne et B perd, et inversement (test de McNemar). */
  aOnly: number;
  bOnly: number;
  /** p-valeur exacte (binomiale bilatérale) du test de McNemar. */
  mcnemarP: number;
  /** Différence moyenne de progression (A − B) et son IC à 95 %. */
  progressDiff: MeanStat;
  turnDiff: MeanStat;
}

export interface ExperimentResult {
  spec: ExperimentSpec;
  variants: VariantStats[];
  comparisons: PairedComparison[];
  /** Résultats bruts (sans journal ni trace), dans l'ordre variante × graine. */
  runs: { variant: string; result: FightRunResult }[];
  wallMs: number;
  workers: number;
}
