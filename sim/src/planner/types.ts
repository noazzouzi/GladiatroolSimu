/**
 * Types publics du planificateur. Les résultats (plans, explications, statistiques) sont des objets simples
 * SÉRIALISABLES (JSON) : ils peuvent traverser un ``postMessage`` de Web Worker.
 */
import type { CritMode, RollMode } from '../data/index.js';
import type { MonsterController, MonsterTurnFn, TurnController } from '../scenario/index.js';
import type { ChoicePolicy } from './choicePolicy.js';
import type { PlannerWeights } from './weights.js';

/** Action élémentaire d'un plan (appliquée par ``executePlan`` via l'API publique du combat). */
export type PlannedAction =
  | { type: 'cast'; spellLevelId: number; cell: number }
  | { type: 'move'; path: number[] }
  | { type: 'end' };

/** ``fast`` : ≤ 150 ms par tour de joueur (Monte Carlo) ; ``deep`` : ≤ 3 s (interface). */
export type PlannerMode = 'fast' | 'deep' | 'greedy';

/**
 * Anticipation des meilleures feuilles : ``none`` (évaluation statique seule), ``nextPlayer`` (tours des monstres
 * jusqu'au prochain joueur), ``globalTurn`` (jusqu'à la fin du tour global, coéquipiers joués par une politique
 * gloutonne).
 */
export type LookaheadMode = 'none' | 'nextPlayer' | 'globalTurn';

export interface SearchBudget {
  /** Nœuds gardés à chaque profondeur (beam). */
  beamWidth: number;
  /** Macro-actions simulées au plus par nœud (après tri a priori). */
  maxCandidates: number;
  /** Candidats garantis par sort (diversité). */
  perSpellQuota: number;
  /** Macro-actions (lancers) au plus par tour. */
  maxDepth: number;
  /** Positions de fin de tour essayées par nœud gardé. */
  endPositions: number;
  /** Feuilles anticipées (les meilleures selon l'évaluation statique). */
  lookaheadLeaves: number;
  lookahead: LookaheadMode;
  /** Plafond de temps (ms) ; null : aucun (résultat entièrement déterministe). */
  timeLimitMs: number | null;
  /** Nombre d'alternatives renvoyées. */
  alternatives: number;
}

export interface PlanOptions {
  mode?: PlannerMode;
  /** Surcharges du budget du mode. */
  budget?: Partial<SearchBudget>;
  /** Surcharges des poids de l'évaluation. */
  weights?: Partial<PlannerWeights>;
  /** IA des monstres pendant l'anticipation (défaut : ``simpleMonsterController`` du scénario). */
  monsterController?: MonsterController | MonsterTurnFn;
  /** Réponse aux choix qui apparaissent pendant une simulation (défaut : ``defaultChoicePolicy``). */
  choicePolicy?: ChoicePolicy;
  /** Coéquipiers pendant l'anticipation ``globalTurn`` (défaut : planificateur glouton). */
  teammateController?: TurnController;
  /** Jets simulés (défaut ``average``) et critiques (défaut ``never``). */
  rollMode?: RollMode;
  critMode?: CritMode;
  /** Construire les explications (défaut : vrai). */
  explain?: boolean;
  /** Ignorer le plafond de temps (résultat indépendant de la machine). */
  deterministic?: boolean;
}

/** Choix supposé pendant la simulation (politique de choix). */
export interface AssumedChoice {
  choiceListId: number;
  fighterId: number;
  label: string;
}

export interface TargetDamage {
  id: number;
  name: string;
  /** PV retirés (soins déduits). */
  damage: number;
  killed: boolean;
  enteredSpikes: boolean;
}

/** Résumé structuré d'un plan (interface). */
export interface PlanSummary {
  damageDealt: number;
  targets: TargetDamage[];
  /** Ennemis entrés dans les pics pendant le tour. */
  enteredSpikes: string[];
  kills: string[];
  playerDeaths: string[];
  objectivesCompleted: string[];
  giftTaken: boolean;
  finalCell: number;
  finalInSpikes: boolean;
  apLeft: number;
  mpLeft: number;
  risks: string[];
  lookahead: {
    untilFighter: string | null;
    turn: number;
    playerHpLost: number;
    playerDeaths: string[];
    monsterDeaths: string[];
    objectivesCompleted: string[];
  } | null;
}

export interface PlanAlternative {
  actions: PlannedAction[];
  /** Score final (après anticipation si elle a eu lieu). */
  score: number;
  /** Score statique de la feuille (avant anticipation). */
  staticScore: number;
  /** Explication en français (plusieurs lignes). */
  explanation: string;
  summary: PlanSummary;
}

export interface SearchStats {
  /** Nœuds développés. */
  nodes: number;
  /** Macro-actions simulées. */
  simulations: number;
  /** Macro-actions générées (avant plafonnement). */
  candidates: number;
  leaves: number;
  lookaheads: number;
  depthReached: number;
  timeMs: number;
  /** Recherche interrompue par le plafond de temps. */
  truncated: boolean;
}

export interface PlayerPlan extends PlanAlternative {
  fighterId: number;
  fighterName: string;
  turn: number;
  mode: PlannerMode;
  alternatives: PlanAlternative[];
  assumedChoices: AssumedChoice[];
  stats: SearchStats;
}

export interface TeamPlanStep {
  fighterId: number;
  fighterName: string;
  plan: PlayerPlan;
}

export interface TeamPlanOptions extends PlanOptions {
  /** États d'équipe gardés après chaque joueur (beam d'équipe ; 1 = planification successive). */
  teamBeamWidth?: number;
}

export interface TeamPlan {
  turn: number;
  steps: TeamPlanStep[];
  /** Score de l'état atteint à la fin du tour global (ou au dernier point de décision simulé). */
  score: number;
  explanation: string;
  timeMs: number;
}

export interface ExecuteResult {
  ok: boolean;
  /** Actions appliquées. */
  executed: number;
  reason?: string;
  choices: AssumedChoice[];
}
