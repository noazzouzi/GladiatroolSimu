/**
 * Types partagés par l'interface et le worker (tous SÉRIALISABLES : ils traversent ``postMessage``).
 * Aucune logique de jeu ici : les valeurs sont calculées par le worker à partir de ``sim/src``.
 */
import type { ConfigOverrides } from '../../../sim/src/data/types.js';
import type { PlanSummary, PlannedAction, PlannerMode } from '../../../sim/src/planner/types.js';
import type { FightRunResult } from '../../../sim/src/runner/types.js';
import type { Situation } from '../../../sim/src/runner/situation.js';

export type { Situation, PlannedAction, PlanSummary, ConfigOverrides, PlannerMode };
export type ArchetypeKey = 'acrobate' | 'dompteur' | 'magicien';
export type MonsterType = 'troollibre' | 'artroolleur' | 'nitrooll' | 'mama';

// ---------------------------------------------------------------------------------------------
// Catalogue (données statiques lues dans sim/data et sim/config)
// ---------------------------------------------------------------------------------------------

export interface CellInfo {
  id: number;
  /** Coordonnées MapPoint du client. */
  x: number;
  y: number;
  playable: boolean;
  spike: boolean;
  start: boolean;
  gift: boolean;
  /** Obstacle (bloque la ligne de vue, non jouable). */
  obstacle: boolean;
}

export interface MapInfo {
  mapId: number;
  cells: CellInfo[];
  center: number;
  waitCell: number;
  startCells: number[];
  giftCells: number[];
  spikeCount: number;
}

export interface SpellInfo {
  id: number;
  name: string;
  ap: number;
}

export interface ArchetypeInfo {
  key: ArchetypeKey;
  name: string;
  letter: 'A' | 'D' | 'M';
  hp: number;
  /** Grimoire : sort commun, sort de départ, sorts appris par palier d'objectif. */
  slots: (SpellInfo & { unlock: string })[];
  upgrades: { base: number; to: number; name: string }[];
  uniques: SpellInfo[];
  acclamations: { stat: string; name: string; value: number }[];
}

export interface MonsterTypeInfo {
  type: MonsterType;
  monsterId: number;
  name: string;
  hp: number;
  /** Initiale affichée sur le jeton. */
  short: string;
}

export interface ObjectiveInfo {
  id: string;
  name: string;
  tier: number;
  summary: string;
}

export interface ParamInfo {
  path: string;
  label: string;
  kind: 'boolean' | 'integer' | 'number' | 'enum';
  default: boolean | number | string;
  values?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  question?: string;
  help: string;
}

export interface Catalog {
  map: MapInfo;
  archetypes: ArchetypeInfo[];
  monsters: MonsterTypeInfo[];
  objectives: ObjectiveInfo[];
  params: ParamInfo[];
  spells: Record<number, SpellInfo>;
  maxTurnDefault: number;
}

// ---------------------------------------------------------------------------------------------
// Vue d'un état de combat (carte, listes)
// ---------------------------------------------------------------------------------------------

export type FighterKindView = 'player' | 'monster' | 'mama' | 'summon';

/** Partie fixe d'un combattant (nom, type). */
export interface FighterStatic {
  id: number;
  name: string;
  /** Étiquette courte : J1…J4, T1, A2, N1, MAM, Inv. */
  short: string;
  kind: FighterKindView;
  archetype?: ArchetypeKey;
  monsterType?: MonsterType;
  /** Rang dans l'ordre de jeu des joueurs (0 = J1). */
  playerIndex?: number;
}

/** Partie variable d'un combattant. */
export interface FighterDyn {
  id: number;
  cell: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  vulnerable: boolean;
  unshakable: boolean;
  invulnerable: boolean;
  inSpikes: boolean;
  shield: number;
}

export type MapFighter = FighterStatic & FighterDyn & { current?: boolean; waiting?: boolean; sitIndex?: number };

export interface FighterView extends FighterStatic, FighterDyn {
  current: boolean;
  /** Mama en attente sur 152 (avant le T8). */
  waiting: boolean;
  ap: number;
  mp: number;
  maxAp: number;
  maxMp: number;
  /** Index dans ``situation.players`` / ``situation.monsters`` (édition). */
  sitIndex?: number;
  spells: string[];
}

export interface StatusView {
  kind: 'choice' | 'playerTurn' | 'monsterTurn' | 'ended' | 'idle';
  fighterId?: number;
  fighterName?: string;
  text: string;
}

export interface ObjectiveView {
  id: string;
  name: string;
  tier: number;
  summary: string;
  counter: number;
  markedCell: number;
  designated: string | null;
}

export interface FightView {
  turn: number;
  status: StatusView;
  fighters: FighterView[];
  timeline: { id: number; short: string; name: string; current: boolean; alive: boolean }[];
  objective: ObjectiveView | null;
  completed: { id: string; name: string; tier: number; turn: number }[];
  gifts: number[];
  mama: { alive: boolean; hp: number; maxHp: number; arrived: boolean; favour: number } | null;
  seed: number;
}

// ---------------------------------------------------------------------------------------------
// Visualisation d'actions (plans, rejeu)
// ---------------------------------------------------------------------------------------------

export interface ForcedMove {
  id: number;
  name: string;
  kind: string;
  from: number;
  to: number;
  path: number[];
  intoSpikes: boolean;
  collision: boolean;
}

export interface ActionVisual {
  actorId: number;
  actorName: string;
  kind: 'move' | 'cast' | 'end' | 'choice' | 'info';
  label: string;
  /** Case du lanceur avant l'action. */
  from: number;
  path?: number[];
  castCell?: number;
  spellName?: string;
  zone?: number[];
  forced: ForcedMove[];
  damage: { id: number; name: string; amount: number; killed: boolean }[];
  deaths: string[];
  enteredSpikes: string[];
}

export interface PlanCard {
  key: string;
  title: string;
  actorId: number;
  actorName: string;
  score: number;
  staticScore: number;
  explanation: string[];
  summary: PlanSummary;
  actions: PlannedAction[];
  steps: ActionVisual[];
  /** Actions simulées des monstres qui jouent ensuite (plan d'équipe). */
  interlude: ActionVisual[];
}

export interface BestTurnResult {
  turn: number;
  actorId: number;
  actorName: string;
  best: PlanCard;
  alternatives: PlanCard[];
  team: { explanation: string[]; score: number; steps: PlanCard[] } | null;
  timeMs: number;
  stats: { nodes: number; simulations: number; leaves: number; lookaheads: number; truncated: boolean };
}

// ---------------------------------------------------------------------------------------------
// Rejeu pas à pas (simulation, application d'un plan)
// ---------------------------------------------------------------------------------------------

export type LineKind = 'turn' | 'fighter' | 'plan' | 'choice' | 'warn' | 'cast' | 'damage' | 'move' | 'state' | 'scenario' | 'result' | 'blank';

export interface Frame {
  /** Rang du pas de trace (−1 : état initial). */
  step: number;
  turn: number;
  /** Combattant dont c'est le tour après ce pas (−1 : aucun). */
  activeId: number;
  /** Point de décision « tour de joueur » après ce pas (on peut planifier depuis ici). */
  playerTurn: boolean;
  label: string;
  fighters: FighterDyn[];
  gifts: number[];
  objective: string | null;
  objectivesDone: number;
  /** Lignes du journal de ce pas : [début, fin[. */
  lines: [number, number];
  action?: ActionVisual;
}

export interface Replay {
  statics: FighterStatic[];
  frames: Frame[];
  lines: string[];
  kinds: LineKind[];
  /** Index de la première image de chaque tour global. */
  turnStarts: { turn: number; frame: number }[];
}

export interface SimSpec {
  compo: string;
  seed: number;
  mode: PlannerMode;
  maxTurn: number;
  monsters: 'ai' | 'simple';
  overrides: ConfigOverrides;
}

export type SimSummary = Omit<FightRunResult, 'journal' | 'trace' | 'journalAt'>;

export interface SimResult {
  spec: SimSpec;
  summary: SimSummary;
  replay: Replay;
  resultLine: string;
}

export interface ApplyResult {
  replay: Replay;
  view: FightView;
  situation: Situation;
  message: string;
}

export interface LoadResult {
  view: FightView;
  warnings: string[];
  situation: Situation;
}

// ---------------------------------------------------------------------------------------------
// Protocole du worker
// ---------------------------------------------------------------------------------------------

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'load'; situation: Situation }
  | { type: 'plan'; mode: PlannerMode; team: boolean }
  | { type: 'apply'; source: 'best' | 'alt' | 'team'; index: number; rolls: 'average' | 'random'; wholeTeam: boolean }
  | { type: 'simulate'; spec: SimSpec }
  | { type: 'point'; frame: number };

export interface WorkerResponseMap {
  init: Catalog;
  load: LoadResult;
  plan: BestTurnResult;
  apply: ApplyResult;
  simulate: SimResult;
  point: LoadResult & { label: string };
}

export interface Progress {
  phase: string;
  /** 0..1, ou null si indéterminé. */
  fraction: number | null;
}

export type WorkerMessage =
  | { id: number; kind: 'result'; result: unknown }
  | { id: number; kind: 'error'; error: string }
  | { id: number; kind: 'progress'; progress: Progress };
