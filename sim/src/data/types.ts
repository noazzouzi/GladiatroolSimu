/**
 * Types des données consolidées du simulateur (sim/data/gladiatrool.data.json) et de sa configuration
 * (sim/config/default.config.json). Les deux fichiers sont générés par tools/simdata/build_sim_data.py ;
 * la spécification est research/SPEC_DONNEES_SIMULATEUR.md.
 *
 * Conventions :
 * - identifiants DOFUS partout (sorts, niveaux de sort, états, monstres, cellules) ;
 * - les clés des dictionnaires JSON sont des chaînes (ex. spells["80507"]) ;
 * - `{ $config: "chemin" }` = valeur qui dépend d'une hypothèse, à lire dans la configuration.
 *
 * Les listes `as const` permettent de valider les données à l'exécution (tests) avec les mêmes unions.
 */

// ---------------------------------------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------------------------------------

export const ARCHETYPE_KEYS = ['acrobate', 'dompteur', 'magicien'] as const;
export type ArchetypeKey = (typeof ARCHETYPE_KEYS)[number];

export const ELEMENTS = ['neutral', 'earth', 'fire', 'water', 'air'] as const;
export type Element = (typeof ELEMENTS)[number];

export const CAMPS = ['Atq', 'Def', 'Sce'] as const;
/** Camps DOFUS 3 : Atq = joueurs, Def = monstres, Sce = entité de scénario (hypothèse, Q36). */
export type Camp = (typeof CAMPS)[number];

export const ZONE_SHAPES = [
  ' ', ';', '#', '*', '+', '-', '/', 'A', 'B', 'C', 'D', 'F', 'G', 'I', 'L', 'O', 'P', 'Q', 'R', 'T', 'U', 'V', 'W',
  'X', 'Z', 'a', 'l',
] as const;
/** Lettre de forme de zone (`zoneDescr.shape` du client, catalogue : ETUDE §9.3). */
export type ZoneShape = (typeof ZONE_SHAPES)[number];

export const SPELL_FAMILIES = [
  'common', 'archetype', 'upgraded', 'unique', 'choice', 'acclamation', 'subspell', 'monster', 'passive', 'boss',
  'scenario', 'objective', 'display',
] as const;
export type SpellFamily = (typeof SPELL_FAMILIES)[number];

export const EFFECT_CATEGORIES = [
  'teleport', 'push', 'pull', 'exchange', 'damage', 'heal', 'shield', 'threshold', 'buff', 'state', 'dispel',
  'multiplier', 'turn', 'death', 'spellModifier', 'summon', 'glyph', 'temporarySpell', 'choice', 'display', 'stat',
  'subSpell',
] as const;
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

export const EFFECT_HANDLERS = [
  'teleport', 'push', 'pull', 'exchange', 'damageCasterHpPct', 'lifeSteal', 'damage', 'hpMalusPct',
  'damageTargetErodedHpPct', 'damageCasterErodedHpPct', 'splashInitialDamage', 'splashFinalDamage', 'heal',
  'healMaxHpPct', 'splashHeal', 'resurrect', 'shield', 'hpThreshold', 'interceptDamage', 'casterAdvance',
  'pushNoDamage', 'setState', 'unsetState', 'disableState', 'removeSpellEffects', 'dispel', 'receivedDamageMultiplier',
  'passTurn', 'kill', 'turnDuration', 'spellBaseDamageBonus', 'summon', 'glyphTurnStart', 'glyphTurnEnd', 'glyphAura',
  'glyphImmediate', 'dispelGlyphs', 'learnSpell', 'forgetSpell', 'individualChoice', 'globalChoice', 'noop',
  'statBuff', 'executeSubSpell',
] as const;
/** Gestionnaire du moteur associé à un effectId (catalogue `effects`). */
export type EffectHandler = (typeof EFFECT_HANDLERS)[number];

export const STAT_KEYS = [
  'ap', 'mp', 'range', 'critPct', 'critDamage', 'pushDamage', 'vitality', 'power', 'resPct', 'resPctMelee',
  'resPctRanged', 'erosionPct', 'finalDamagePct', 'finalHealPct',
] as const;
/** Caractéristique modifiée par un effet de type `statBuff` (et par les Acclamations). */
export type StatKey = (typeof STAT_KEYS)[number];

export const SUBSPELL_CASTERS = ['effectTarget', 'originalCaster', 'buffCarrier', 'eventSource'] as const;
export type SubSpellCaster = (typeof SUBSPELL_CASTERS)[number];
export const SUBSPELL_CELLS = [
  'effectTargetCell', 'eventSourceCell', 'buffCarrierCell', 'parentTargetedCell', 'targetedCell',
] as const;
export type SubSpellCell = (typeof SUBSPELL_CELLS)[number];

export const STATE_FLAGS = [
  'preventsSpellCast', 'preventsFight', 'cantBeMoved', 'cantBePushed', 'cantDealDamage', 'invulnerable',
  'cantSwitchPosition', 'incurable', 'invulnerableMelee', 'invulnerableRange', 'cantTackle', 'cantBeTackled',
] as const;
export type StateFlag = (typeof STATE_FLAGS)[number];

export const OBJECTIVE_EVENTS = [
  'enemyDeath', 'enemyDeathByPushDamage', 'spellCast', 'enemyEntersSpikes', 'allyExitsSpikes', 'enemyTakesPushDamage',
  'allyTurnStart', 'allyTurnEnd', 'globalTurnEnd', 'rassemblement', 'mamaDamagesAlly',
] as const;
/** Événements du moteur auxquels un objectif réagit (SPEC §11.5). */
export type ObjectiveEvent = (typeof OBJECTIVE_EVENTS)[number];

export const OBJECTIVE_IDS = [
  'empale', 'soleil', 'sol_glissant', 'meurtres_serie', 'productivite', 'sauvez_le', 'ebranlable', 'stop_projectiles',
  'toi_par_ici', 'prendre_sa_place', 'faire_le_mur', 'pas_le_temps', 'distance_insecurite', 'attirance',
  'trous_troolls', 'pierre_trois_coups', 'tout_va_bien', 'solitude', 'quintuple', 'au_coin', 'meme_pas_mal',
] as const;
export type ObjectiveId = (typeof OBJECTIVE_IDS)[number];

// ---------------------------------------------------------------------------------------------
// Commun
// ---------------------------------------------------------------------------------------------

/** Référence à un paramètre de configuration (chemin pointé, ex. "spikes.playerTurnStartDamage"). */
export interface ConfigRef {
  $config: string;
}

/** Provenance courte : clés de citation de l'étude (DB sl…, DPLN, VOD, N40…), statut V / R / Robs / H. */
export interface ProvData {
  src: string[];
  status: string;
  conf?: string;
  note?: string;
}

export type ElementValues = Record<Element, number>;

// ---------------------------------------------------------------------------------------------
// Racine
// ---------------------------------------------------------------------------------------------

export interface GameData {
  schemaVersion: string;
  meta: MetaData;
  map: MapData;
  rules: RulesData;
  /** Catalogue des effectId utilisés, clé = effectId. */
  effects: Record<string, EffectCatalogEntry>;
  /** États utiles, clé = id d'état. */
  states: Record<string, StateData>;
  /** Niveaux de sort, clé = spellLevelId. */
  spells: Record<string, SpellLevelData>;
  /** spellId → niveaux de sort par grade croissant (grade g = index g − 1). */
  spellIndex: Record<string, number[]>;
  archetypes: Record<ArchetypeKey, ArchetypeData>;
  /** Monstres (7981–7986) et corps des joueurs (7980), clé = id de monstre. */
  monsters: Record<string, MonsterData>;
  boss: BossData;
  scenario: ScenarioData;
  tests: ReferenceTest[];
}

export interface MetaData {
  title: string;
  gameVersion: string;
  betaChecked: string;
  dofusdbExtractedAt: string;
  monstersUpdatedAt: string;
  generatedBy: string;
  spec: string;
  sources: Record<string, string>;
  provenance: Record<string, string>;
  statusLegend: Record<string, string>;
  conventions: Record<string, string>;
  counts: {
    cells: number;
    playable: number;
    spikes: number;
    spells: number;
    spellLevels: number;
    effectsNormal: number;
    effectsCritical: number;
    effectIds: number;
    states: number;
    monsters: number;
    waves: number;
    objectives: number;
  };
}

// ---------------------------------------------------------------------------------------------
// Carte (SPEC §3, ETUDE §3)
// ---------------------------------------------------------------------------------------------

export interface CellData {
  id: number;
  /** Coordonnées MapPoint. */
  x: number;
  y: number;
  /** Jouable en combat (`mov && !nonWalkableDuringFight`). */
  walkable: boolean;
  /** Drapeau de ligne de vue de la carte (faux seulement autour de 152). */
  los: boolean;
  /** Case de pics (glyphe 30390) jouable. */
  spikes: boolean;
  /** Distance de Manhattan à la première case non jouable ; null hors zone jouable. */
  edgeDepth: number | null;
  /** Voisines jouables (4-connexité), triées. */
  neighbours: number[];
}

export interface MapData {
  mapId: number;
  grid: { width: number; rows: number; cellCount: number; toXY: string; fromXY: string };
  /** 560 cellules, index = id. */
  cells: CellData[];
  /** 241 ids jouables, triés. */
  playable: number[];
  spikes: {
    /** 96 cases de pics jouables. */
    cells: number[];
    /** Liste brute du sort 80489 (102 ids, doublons 351 et 455). */
    rawList: number[];
    duplicatesInRawList: number[];
    listedNotWalkable: number[];
    sourceSpellLevel: number;
  };
  startCells: number[];
  center: number;
  bossWaitCell: number;
  giftCells: number[];
  losBlocking: number[];
  staticObstacles: number[];
  dynamicObstacles: ConfigRef;
  _prov: ProvData;
}

// ---------------------------------------------------------------------------------------------
// Règles (SPEC §4, ETUDE §9) : documentaires, avec les constantes numériques utiles au moteur
// ---------------------------------------------------------------------------------------------

export interface SubSpellExecutorRule {
  caster: SubSpellCaster;
  cell: SubSpellCell;
  maxExecutions?: 'value';
}

export interface RulesData {
  distance: 'manhattan';
  directions: {
    names: string[];
    axes: number[];
    diagonals: number[];
    vectors: Record<string, [number, number]>;
  };
  los: { algorithm: string; entityBlocksIntermediateOnly: boolean; mapLosFlagBlocksTarget: boolean; glyphsBlock: boolean };
  castCells: { lineAndDiagonal: string; lineOnly: string; diagonalOnly: string; else: string };
  cooldown: { rule: string };
  rollBounds: string;
  zone: {
    defaultDegression: number;
    defaultMaxTicks: number;
    noDegressionIfRadiusAbove: number;
    pseudoInfiniteRadius: number;
    minSizeShapes: string;
    distanceByShape: Record<string, string>;
    degressionUsesPositionBeforeSpell: boolean;
    appliesToHeals: boolean;
    appliesToShields: boolean;
    appliesToPushDamage: boolean;
    targetSelection: string;
    cellListing: string;
    normalisation: string;
  };
  targeting: {
    targetsFrozenAtCast: boolean;
    positionsBeforeSpell: boolean;
    order: { push: string; other: string; tieBreak: string[] };
    casterIncludedOnlyVia: string[];
    additionalTargets: string[];
    maskConditionPattern: string;
    meleeTestedAtEffectTime: boolean;
  };
  damage: {
    pipeline: string[];
    truncateEachMultiplication: boolean;
    resistCap: { player: number; monster: number };
    elementCharacteristic: Record<Element, 'strength' | 'intelligence' | 'chance' | 'agility'>;
    powerAppliesToHeals: boolean;
    finalDamage: string;
    nonBoostableActions: number[];
    erosion: { base: number; cap: number; formula: string };
    lifeSteal: { ratio: number; capToMissingHp: boolean };
    deathAtHpLE: number;
  };
  heal: { pipeline: string[]; finalHeal: string };
  shield: { boosted: boolean; degression: boolean; absorbsBeforeHp: boolean; absorbsGlyphDamage: boolean };
  crit: {
    rate: string;
    cap: number;
    oneRollPerCast: boolean;
    criticalEffectsReplaceEffects: boolean;
    subSpellsInherit: boolean;
    critDamageOnlyOnCriticalEffects: boolean;
  };
  multiplier1163: { formula: string; stack: string; triggerD: string; triggerDBA: string };
  push: {
    origin: string;
    direction: string;
    diagonalSteps: string;
    diagonalNeedsBothSideCellsFree: boolean;
    stopsOn: string[];
    glyphsStopPush: boolean;
    collision: {
      formula: string;
      levelDivisor: number;
      base: number;
      diagonalFactor: number;
      divisorBase: number;
      chain: string;
    };
    collisionIgnores: string[];
    noCollisionActions: number[];
    blockedBy: Record<string, string[]>;
  };
  swap: { blockedBy: string[]; unshakableDoesNotBlock: boolean };
  teleport: { pointZone: string; nonPointZone: string };
  durations: {
    decrementAt: string;
    permanent: string;
    permanentThreshold: number;
    delayCountsCasterTurns: boolean;
    castsBeforeFirstTurnNotDecrementedAtFirstTurnStart: boolean;
  };
  turnStart: string[];
  turnEnd: string[];
  aura1091: { applyOnEnter: string[]; removeOnExit: boolean; emitsEONEOFF: boolean; appliesOnArrivalCellOnly: boolean };
  /** effectId (sous-sort) → lanceur et case ciblée du sous-sort (CLI273 solveSpellExecution). */
  subSpellExecutors: Record<string, SubSpellExecutorRule>;
  subSpellCastConditions: ConfigRef;
  triggeredBuffCaster: string;
  tackle: { enabled: boolean; why: string };
  _prov: ProvData;
}

// ---------------------------------------------------------------------------------------------
// Effets (SPEC §5)
// ---------------------------------------------------------------------------------------------

export interface EffectCatalogEntry {
  effectId: number;
  /** Nom de l'action DOFUS 3 (enum ActionIds du client). */
  action: string;
  /** Gabarit français du client (#1 = min, #2 = max, #3 = value). */
  label: string;
  category: EffectCategory;
  handler: EffectHandler;
  /** 'must' = à implémenter en v1 ; 'noop' = sans effet moteur (affichage). */
  v1: 'must' | 'noop';
  /** Pour `statBuff` : caractéristique et signe (+1 bonus, −1 malus). */
  stat?: StatKey;
  sign?: 1 | -1;
  /** Pour `executeSubSpell` : lanceur et case ciblée du sous-sort ; globalLimit = au plus `value` exécutions par lancer. */
  executor?: { caster: SubSpellCaster; cell: SubSpellCell; globalLimit: boolean };
  element?: Element;
  /** Dégâts et soins : boostés par la caractéristique, la Puissance et les dommages finaux. */
  boostable?: boolean;
  /** Sens des paramètres bruts min (diceNum), max (diceSide), value. */
  params: { min?: string; max?: string; value?: string };
  occurrences: { total: number; exec: number };
  confidence: string | null;
}

// ---------------------------------------------------------------------------------------------
// États (SPEC §6)
// ---------------------------------------------------------------------------------------------

export interface StateData {
  id: number;
  name: string;
  /** Effets d'état DOFUS (0 inébranlable, 1 intaclable, 2 ne tacle pas, 3 enraciné, 7 invulnérable, 18 pas d'échange…). */
  stateEffects: number[];
  flags: StateFlag[];
  silent: boolean;
  displayTurnRemaining: boolean;
  note?: string;
}

// ---------------------------------------------------------------------------------------------
// Sorts (SPEC §7)
// ---------------------------------------------------------------------------------------------

export interface StatesCriterion {
  raw: string;
  /** États que le lanceur doit porter (HS=#). */
  required: number[];
  /** États que le lanceur ne doit pas porter (HS!#). */
  forbidden: number[];
}

export interface CastData {
  ap: number;
  /** [PO minimale, PO maximale]. */
  range: [number, number];
  rangeModifiable: boolean;
  inLine: boolean;
  inDiagonal: boolean;
  los: boolean;
  needFreeCell: boolean;
  needTakenCell: boolean;
  needVisibleEntity: boolean;
  /** 0 = illimité. */
  maxPerTurn: number;
  /** 0 = illimité. */
  maxPerTarget: number;
  /** Intervalle de relance (tours). */
  interval: number;
  initialCooldown: number;
  globalCooldown: number;
  /** Taux critique du sort (%) ; 0 = ne critique jamais. */
  critRate: number;
  maxStack: number;
  statesCriterion: StatesCriterion | null;
}

/** Zone normalisée comme `SpellZone.from_zone_descr` (tools/mechanics/zones.py). */
export interface ZoneData {
  shape: ZoneShape;
  radius: number;
  minRadius: number;
  /** Dégressivité par palier (%). */
  degression: number;
  /** Nombre maximal de paliers de dégressivité. */
  maxTicks: number;
  stopAtTarget?: boolean;
  forcedDirection?: boolean;
  /** Forme ';' : liste explicite de cellules. */
  cellIds?: number[];
}

/** Condition « exclusive » d'un masque de cible (E#, e#, F#, f#, V#, v#, P, O…), préfixe * = testée sur le lanceur. */
export interface MaskCondition {
  key: string;
  value: number | null;
  onCaster: boolean;
}

export interface MaskData {
  /** Lettres d'inclusion (au moins une doit correspondre) : A, a, g, c, C, j, J, h, H, l, L, x… */
  include: string[];
  /** Conditions (toutes doivent passer). */
  exclude: MaskCondition[];
  camp: Camp | null;
}

/**
 * Référence de sort portée par un effet.
 * - sous-sorts (792, 1160, 2160, 2792, 2794, 2960, 1017, 1018, 1019, 2017) et glyphes (401, 402, 1091, 1165) :
 *   spellId = min, grade = max, spellLevelId résolu ;
 * - 3405 / 3406 (apprend / désapprend) : `value` = spellLevelId ;
 * - 406 (retire les effets du sort), 293 (bonus de base du sort), 2018 (dissipe les glyphes du sort) :
 *   spellId seul (grade et spellLevelId null).
 */
export interface SubSpellRef {
  spellId: number;
  grade: number | null;
  spellLevelId: number | null;
  /** Le niveau référencé n'existe pas dans les données du client (80750). */
  missing?: true;
  /** Niveau retenu à la place (config spells.jaillissementUpgradeBroken). */
  substituteSpellLevelId?: number;
}

export interface EffectData {
  order: number;
  effectId: number;
  /** !forClientOnly : seuls les effets exec sont appliqués par le moteur. */
  exec: boolean;
  /** Paramètres bruts : min = diceNum, max = diceSide, value = value (voir rollBounds). */
  min: number;
  max: number;
  value: number;
  element?: Element;
  targetMask: string;
  mask: MaskData;
  /** Déclencheurs : I, D, DBA, PD, X, XPD, TB, TE, EON#, EOFF#, CAP, TR#… */
  triggers: string[];
  /** En tours du lanceur ; −1 = permanent. */
  duration: number;
  delay: number;
  triggerDuration: number;
  /** 1 = retirable par désenvoûtement, 3 = non. */
  dispellable: number;
  zone: ZoneData;
  subSpell?: SubSpellRef;
  /** Pour 950 / 951 / 952. */
  stateId?: number;
  /** Pour 181 (invocation). */
  summon?: { monsterId: number; grade: number };
}

export interface SpellLevelData {
  spellLevelId: number;
  spellId: number;
  grade: number;
  name: string;
  adminName: string;
  typeId: number;
  family: SpellFamily;
  /** Archétype, id de monstre, 'troolls', 'common' ou 'scenario'. */
  owner: string;
  cast: CastData;
  effects: EffectData[];
  critEffects: EffectData[];
}

// ---------------------------------------------------------------------------------------------
// Combattants : archétypes, monstres, boss (SPEC §8-§10)
// ---------------------------------------------------------------------------------------------

export interface FighterStatsData {
  level: number;
  hp: number;
  ap: number;
  mp: number;
  rangeBonus: number;
  strength: number;
  intelligence: number;
  chance: number;
  agility: number;
  power: number;
  critPct: number;
  critDamage: number;
  pushDamage: number;
  pushResist: number;
  resPct: ElementValues;
  resPctMelee: number;
  resPctRanged: number;
  dodgeAp: number;
  dodgeMp: number;
  tackle: number;
  flee: number;
  erosionPct: number;
}

export interface SpellSlotData {
  slot: number;
  spellLevelId: number;
  /** 'common' (Frappe Repoussoir), 'start' (donné par le serveur), 'tier1'…'tier6' (objectif du palier). */
  unlock: 'common' | 'start' | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5' | 'tier6';
  /** Niveau du Spell Manager (30626) qui apprend le sort. */
  managerSpellLevel?: number;
}

export interface UpgradeData {
  /** Niveau amélioré appris. */
  to: number;
  choiceSpellId: number;
  choiceSpellLevelId: number;
  boostedStateId: number;
  /** Niveau réellement appris par les données s'il est absent (80750). */
  dataLearnsSpellLevelId?: number;
  brokenIf?: ConfigRef;
}

export interface AcclamationData {
  choiceSpellId: number;
  choiceSpellLevelId: number;
  name: string;
  stat: StatKey;
  effectId: number;
  value: number;
  /** Niveau de l'accumulateur (30589 / 30590 / 30591) qui applique réellement le bonus. */
  realSpellLevel: number;
}

export interface OnObtainData {
  castSpellLevel: number;
  target: 'caster';
  timing: ConfigRef;
  _prov: ProvData;
}

export interface ArchetypeData {
  key: ArchetypeKey;
  displayName: string;
  internalName: string;
  stateId: number;
  passiveSpellId: number;
  passiveSpellLevelId: number;
  body: { monsterId: number; startingSpellLevel: number };
  baseStats: FighterStatsData;
  turnSeconds: number;
  hpByMode: { flat30000: number; passiveApplies: number };
  hpMode: ConfigRef;
  passiveBonus: { effectId: number; value: number; appliedIf: ConfigRef };
  commonSpell: number;
  startingSpell: number;
  startingSpellSource: 'server';
  /** Emplacements 0 à 7, dans l'ordre d'obtention. */
  spellSlots: SpellSlotData[];
  /** Niveau de base (clé) → amélioration. */
  upgrades: Record<string, UpgradeData>;
  /** 6 sorts uniques de l'archétype + Pense Vite (80843). */
  uniques: number[];
  /** Les 6 cartes d'Acclamation. */
  acclamations: AcclamationData[];
  /** Logique serveur à l'obtention d'un sort (clé = spellLevelId obtenu). */
  onObtain?: Record<string, OnObtainData>;
  _prov: ProvData;
}

export interface MonsterFlags {
  canPlay: boolean;
  canTackle: boolean;
  canBePushed: boolean;
  canSwitchPos: boolean;
  canSwitchPosOnTarget: boolean;
  canBeCarried: boolean;
  useSummonSlot: boolean;
}

export type AiProfileName = 'troollibre' | 'artroolleur' | 'nitrooll' | 'mama';

export interface MonsterData {
  id: number;
  name: string;
  nameEn: string;
  race: number;
  role: 'wave' | 'boss' | 'summon' | 'playerBody';
  stats: FighterStatsData;
  flags: MonsterFlags;
  /** Niveaux de sort utilisables (dans l'ordre des données). */
  spells: number[];
  /** Sort de départ (passifs, scripts). */
  startingSpellLevel: number;
  passives: { spellId: number; role: string }[];
  aiProfile: AiProfileName | null;
  _prov: ProvData;
}

export interface BossStep {
  op: 'setState' | 'pull' | 'pushNoDamage' | 'objectiveCheck';
  stateId?: number;
  on?: string;
  duration?: number;
  distance?: number;
  spellId?: number;
  ifState?: number;
}

export interface BossData {
  monsterId: number;
  stats: { hp: number; ap: number; mp: number; strength: number; level: number; dodgeAp: number; dodgeMp: number };
  startingSpellLevel: number;
  waitCell: number;
  preFight: { stateId: number; turnCancelledDuration: number; spellLevel: number; actsBeforeArrival: ConfigRef };
  arrival: {
    delayTurns: number;
    resultingGlobalTurn: number;
    targetCell: number;
    fallback: ConfigRef;
    teleportZone: string;
    spellLevels: number[];
    observed: { cell300: number; cell287When300Occupied: number };
  };
  rassemblement: {
    trigger: 'TB';
    zone: ZoneData;
    startsAtArrival: boolean;
    steps: BossStep[];
    spellLevels: number[];
    blockedByUnshakable: ConfigRef;
    pullThenPush: ConfigRef;
    giftCancels: ConfigRef;
    /** Case de la Mama → lignes de poussée (axes MapPoint), pour les tests et l'interface. */
    pushLines: Record<string, Record<string, number[]>>;
  };
  invulnerability: {
    stateId: number;
    liftedOn: string;
    liftDurationTurns: number;
    spellLevels: number[];
    liftedBeforeEntryDamage: ConfigRef;
    backBeforeTurnStartSpikes: ConfigRef;
  };
  favour: {
    startFinalDamageBonus: number;
    perObjective: number;
    states: number[];
    cap: ConfigRef;
    onlyIfAlive: boolean;
    spellLevels: number[];
  };
  hasExitSpikesPassive: boolean;
  onDeath: { stateOnPlayers: number; endsFight: boolean; spellLevels: number[] };
  spells: number[];
  levelForPushDamage: ConfigRef;
  aiProfile: 'mama';
  _prov: ProvData;
}

// ---------------------------------------------------------------------------------------------
// Scénario (SPEC §11)
// ---------------------------------------------------------------------------------------------

export interface FightStartStep {
  op: 'placement' | 'archetypeChoice' | 'startingSpells' | 'scenarioCast' | 'spawnWave';
  cells?: number[];
  bossCell?: number;
  choiceId?: number;
  spellLevel?: number;
  players?: number;
  troolls?: number;
  boss?: number;
  what?: string;
  wave?: number;
}

export interface TimelineData {
  bossPlaysFirst: boolean;
  playerOrder: ConfigRef;
  model: ConfigRef;
  newMonstersInsertion: ConfigRef;
  fightStart: FightStartStep[];
  globalTurnSequence: ('bonusWindow' | 'waveSpawn' | 'giftSpawn' | 'turns' | 'objectiveCheck')[];
  bonusWindowTurns: number[];
  waveSpawnTurns: number[];
  giftTurns: number[];
  bossArrivalTurn: number;
  finishTriggerTurn: ConfigRef;
  _prov: ProvData;
}

export interface WeightedCell {
  cell: number;
  /** Nombre de combats où la case a été observée (VOD). */
  weight: number;
}

export interface SpawnGroup {
  monsterId: number;
  count: number;
  candidates: WeightedCell[];
}

export interface WaveSpawnData {
  /** Vague 1 : cases fixes. */
  fixedCells?: number[];
  /** Vagues 2 et 3 : structure observée (une case par groupe). */
  groups?: SpawnGroup[];
  /** Candidats de la vague répartis par type (clé = id de monstre), poids = observations. */
  candidatesByType: Record<string, WeightedCell[]>;
  /** Candidats observés sans type attribué. */
  unassigned: WeightedCell[];
  /** Emplacements structurels du type pour cette vague (mode structured_slots). */
  slotsByType: Record<string, number[]>;
  /** Cases observées, un tableau par combat de la VOD. */
  observed: number[][];
  observedFights: number;
}

export interface WaveData {
  n: number;
  turn: number;
  timing: 'afterPlacement' | 'globalTurnStartAfterBonus' | 'bossArrival' | 'globalTurnStart';
  composition: { monsterId: number; count: number }[];
  boss?: true;
  spawn: WaveSpawnData | null;
  _prov: ProvData;
}

export interface GiftsData {
  spellId: number;
  spellLevel: number;
  markEffectId: number;
  triggerSpellId: number;
  triggerSpellLevels: number[];
  choiceId: number;
  cells: number[];
  observedCounts: Record<string, number>;
  neverObserved: number[];
  window: { firstTurn: number; lastTurn: number };
  observed: { spawned: number; turns: number };
  triggeredBy: 'players';
  pushedPlayerTriggers: ConfigRef;
  persistsUntilTaken: boolean;
  canStack: boolean;
  cardPool: { uniques: string; upgrades: string };
  _prov: ProvData;
}

export interface BonusesData {
  choiceId: number;
  spellLevels: number[];
  firstTurn: ConfigRef;
  lastTurn: ConfigRef;
  offerCount: ConfigRef;
  permanent: boolean;
  stackable: boolean;
  _prov: ProvData;
}

export interface ChoiceData {
  scope: 'individual' | 'global';
  effectId: 3008 | 3404;
  castBySpellLevel: number;
  content: 'archetype' | 'acclamation' | 'giftCards' | 'objectiveVote';
  when: 'fightStart' | 'globalTurnStart' | 'giftTriggered' | 'objectiveDone';
  options?: { archetype: ArchetypeKey; passiveSpellLevel: number }[];
  turns?: number[];
  offerCount?: ConfigRef;
  cardCount?: ConfigRef;
  tier?: number;
  tieBreak?: 'random';
}

/** Conditions déclaratives des objectifs (SPEC §11.5, ETUDE §7.2). */
export type ObjectiveCondition =
  | { kind: 'victimHasState'; stateId: number }
  | { kind: 'allPlayersEndTurnOnStartCell'; requiresFullGlobalTurn: boolean }
  | { kind: 'victimKilledByPushDamage' }
  | { kind: 'killsBySameKillerInOwnTurn'; count: number; pushKillsCount: ConfigRef; glyphKillsCreditPlayer: ConfigRef }
  | { kind: 'castsInOwnTurn'; count: number }
  | {
      kind: 'designatedAllyFullHp';
      designationThresholdsPct: number[];
      checkThenDesignate: boolean;
      designationStateId: number;
      fullHp: ConfigRef;
    }
  | { kind: 'noAliveMonster'; monsterId: number }
  | { kind: 'enemyEntersAndAllyExitsSpikesInTurn'; enemyStateId: number; allyStateId: number }
  | { kind: 'endTurnOnMarkedCell'; mark: 'farthestEnemyAtTurnStart'; excludeStateId: number; tieBreak: string }
  | { kind: 'distinctEnemiesPushDamagedInTurn'; count: number }
  | { kind: 'killEnemyFullHpAtTurnStart' }
  | { kind: 'eachMonsterNearAlly'; monsterId: number; maxDistance: number; vacuousTruth: boolean }
  | { kind: 'allPlayersGrabbedBySameRassemblement'; stateId: number }
  | { kind: 'distinctEnemiesEnterSpikesInTurn'; count: number }
  | { kind: 'deathsBetweenCasts'; count: number }
  | { kind: 'noPlayerAtOrBelowHpPct'; pct: number }
  | { kind: 'bossAliveWithoutAllies'; monsterId: number; beforeArrival: ConfigRef }
  | { kind: 'killsByPlayersInGlobalTurn'; count: number }
  | { kind: 'allEnemiesInSpikes'; stateId: number; excludeStateId: number; bossCountsFromTurn: ConfigRef }
  | { kind: 'playerHitByBossWithoutHpLoss'; monsterId: number };

export type ObjectiveConditionKind = ObjectiveCondition['kind'];

export interface ObjectiveCounter {
  /** Porteur du compteur : l'allié actif (Challenger), le tueur ou toute l'équipe. */
  holder: 'challenger' | 'killer' | 'team';
  /** Moment(s) de remise à zéro. */
  reset: 'allyTurnEnd' | 'globalTurnEnd' | ('spellCast' | 'allyTurnEnd')[];
  stateIds?: number[];
}

export interface ObjectiveData {
  id: ObjectiveId;
  name: string;
  tier: number;
  orientation: 'general' | ArchetypeKey;
  imposed: boolean;
  spellId: number;
  spellLevel: number;
  rewardSpellId: number;
  rewardSpellLevel: number;
  subSpellIds: number[];
  notificationId: number;
  doneStateId: number;
  on: ObjectiveEvent | ObjectiveEvent[];
  condition: ObjectiveCondition;
  counter?: ObjectiveCounter;
  /** Résumé en français. */
  summary: string;
  _prov: ProvData;
}

export interface ObjectivesData {
  manager: {
    spellId: number;
    spellLevels: number[];
    first: ObjectiveId;
    oneActiveAtATime: boolean;
    maxCount: ConfigRef;
    doneStates: number[];
    /** Nombre d'objectifs validés → id du vote suivant (11 à 15). */
    voteChoiceIdAfterObjective: Record<string, number>;
    reward: {
      spellManagerSpellId: number;
      /** Niveau du Spell Manager par palier (index palier − 1). */
      spellManagerLevelByTier: number[];
      mamaFavourSpellLevels: number[];
      nextVote: boolean;
    };
    endOfGlobalTurnCheck: { spellId: number; spellLevel: number; checks: ObjectiveId[] };
    _prov: ProvData;
  };
  /** 21 objectifs, triés par palier puis orientation. */
  list: ObjectiveData[];
}

export interface ScenarioData {
  timeline: TimelineData;
  entities: { scenario: { camp: 'Sce'; visible: boolean; plays: boolean; casts: number[]; _prov: ProvData } };
  /** V1 à V10 (V8 = arrivée de la Mama). */
  waves: WaveData[];
  gifts: GiftsData;
  bonuses: BonusesData;
  /** Clé = id de liste de choix (16, 17, 10, 11–15). */
  choices: Record<string, ChoiceData>;
  objectives: ObjectivesData;
  victory: {
    allEnemiesDead: boolean;
    requiresState: number;
    stateSetBySpell: number;
    stateSetBySpellLevel: number;
    canFinishFromTurn: ConfigRef;
    killingBossEndsFight: boolean;
    turnLimit: ConfigRef;
    _prov: ProvData;
  };
  defeat: { allPlayersDead: boolean; _prov: ProvData };
}

// ---------------------------------------------------------------------------------------------
// Tests de référence (SPEC §13)
// ---------------------------------------------------------------------------------------------

export interface ReferenceTest {
  id: string;
  title: string;
  /** Valeurs attendues, structure propre à chaque test (voir le fichier de données). */
  expected: Record<string, unknown>;
  source: string;
  status: string;
}

// ---------------------------------------------------------------------------------------------
// Configuration (SPEC §12) : sim/config/default.config.json
// ---------------------------------------------------------------------------------------------

export type TimelineModel = 'alternate_spawn_order' | 'alternate_initiative' | 'monsters_after_mama' | 'explicit';
export type MonsterInsertion = 'append' | 'after_mama' | 'by_initiative';
export type AiFocus = 'maxDamage' | 'lowestHp' | 'nearest';
export type AiRuleWhen =
  | 'enemyReachable'
  | 'targetAtDistance2'
  | 'enemyInRing1to2'
  | 'anyTarget'
  | 'maxTargets'
  | 'pushTowardSpikes'
  | 'mostInjuredAlly'
  | 'threatenedAlly'
  | 'playersInZoneAtLeast'
  | 'nearLowestHpPlayer';
export type SpawnMode = 'weighted_observed' | 'structured_slots' | 'most_frequent' | 'uniform_slots';
export type ArrivalFallbackStep = number | 'axisTowardWaitCell' | 'nearestFree';
export type CatastroollScope = 'restOfTurn' | 'nextCastOnly' | 'none';
/** preFight : posés avant le 1er tour global ; casterFirstTurn : posés avant le 1er tour du lanceur ; none : aucun. */
export type FirstTurnDecrementSkip = 'preFight' | 'casterFirstTurn' | 'none';
export type BonusPolicy = 'planner' | 'PO_first' | 'PA_first' | 'DF_first';
export type RollMode = 'random' | 'average' | 'min' | 'max';
export type CritMode = 'random' | 'never' | 'always';
export type RollDistribution = 'uniform' | 'clientPreview';

export interface AiSpellRule {
  spellLevelId: number;
  when: AiRuleWhen;
  maxTargets?: number;
  count?: number;
  times?: number;
}

export interface AiProfileConfig {
  moveBeforeCast: boolean;
  /** [distance minimale, distance maximale] recherchée par rapport à la cible. */
  preferredDistance: [number, number];
  healThresholdPct?: number;
  spells: AiSpellRule[];
}

/** Documentation d'un paramètre (bloc `_doc`, clé = chemin pointé). */
export interface ParamDoc {
  type: 'boolean' | 'integer' | 'number' | 'integer|null' | 'enum' | 'enum[]' | 'integer[]' | 'list' | 'object';
  /** Valeurs admises (enum, enum[]) ou mots-clés admis (list). */
  values?: (string | number)[];
  alternatives?: unknown;
  /** Question de research/QUESTIONS_OUVERTES.md. */
  question?: string;
  status: string;
  source?: string;
  why: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  whenValues?: string[];
}

export interface SimConfig {
  timeline: {
    model: TimelineModel;
    newMonstersInsertion: MonsterInsertion;
    /** Ordre d'entrée et composition de l'équipe (1 à 4 archétypes). */
    playerOrder: ArchetypeKey[];
    /** Un joueur mort garde sa place dans l'alternance (sauté) ; un monstre mort libère la sienne (Q1). */
    deadPlayersKeepSlot: boolean;
  };
  ai: {
    focus: AiFocus;
    skipIfInSpikes: boolean;
    skipIfNoTargetReachable: boolean;
    engageRadius: number | null;
    avoidSpikes: boolean;
    moveBeforeCast: boolean;
    monstersCanTargetAllies: boolean;
    mamaFocusSingleTarget: boolean;
    profiles: Record<AiProfileName, AiProfileConfig>;
  };
  spikes: {
    entryDamage: number;
    monsterTurnStartDamageRaw: number;
    playerTurnStartDamage: number;
    playersDoubledInside: boolean;
    stackExitAndInside: boolean;
    exitVulnerabilityTurns: number;
    triggerWhenWalkingThrough: boolean;
    walkThroughInterruptsMovement: boolean;
    retriggerOnMoveInside: boolean;
    auraAppliesMidSpell: boolean;
  };
  spawn: {
    mode: SpawnMode;
    seed: number | null;
    excludeOccupied: boolean;
    allowUnassigned: boolean;
  };
  boss: {
    arrivalCell: number;
    arrivalFallback: ArrivalFallbackStep[];
    actsBeforeArrival: boolean;
    rassemblementBlockedByUnshakable: boolean;
    rassemblementPullThenPush: boolean;
    giftCancelsRassemblement: boolean;
    invulnerabilityLiftedBeforeEntryDamage: boolean;
    invulnerabilityBackBeforeTurnStartSpikes: boolean;
    catastroollBonusScope: CatastroollScope;
    levelForPushDamage: number;
    favourCap: number | null;
  };
  objectives: {
    maxCount: number;
    offerCount: number;
    offerDraw: 'uniform';
    tier6Offered: boolean;
    votePolicy: 'planner' | 'fixed';
    pushKillsCount: boolean;
    glyphKillsCreditPlayer: boolean;
    solitudeBeforeArrival: boolean;
    mamaCountsFromTurn: number;
    v100MeansFull: boolean;
  };
  bonuses: {
    offerCount: number;
    draw: 'uniform_distinct';
    firstTurn: number;
    lastTurn: number;
    doubleApplication: boolean;
    policy: BonusPolicy;
  };
  gifts: {
    spawnProbability: number;
    cells: number[];
    firstTurn: number;
    lastTurn: number;
    cellDraw: 'uniform_free' | 'weighted_observed';
    cardCount: number;
    /** Poids relatifs des tirages de cartes. */
    cardMix: { twoUniques: number; twoUpgrades: number; oneEach: number };
    monstersTrigger: boolean;
    pushedPlayerTriggers: boolean;
    upgradedSpellGreyedUntilNextTurn: boolean;
  };
  spells: {
    newSpellUsableSameTurn: boolean;
    penseVite: { maxCasts: number; turnSeconds: number };
    relachementGrowthStart: 'nextTurnStartAfterObtain' | 'immediate';
    relachementMaxStacks: number;
    voltigeUpgradedMaxPerTurn: number;
    ggUpgradedKeepsRecastBonus: boolean;
    jaillissementUpgradeBroken: boolean;
    maledictionCollateraleChains: boolean;
    maledictionCollateraleHitsCarrier: boolean;
    maledictionRegenerantePercent: number;
    maledictionRegeneranteZone: 'C2' | 'all';
    maledictionMouvanteOnGlyphDamage: boolean;
    pulsationChaotiqueBounceRange: number | null;
    chamboulementBounceTarget: 'nearest';
    poutchLifetimeTurns: number | null;
    protectionProlongeeSelfHeals: number;
    bienfaiteurOverflowLost: boolean;
    ultimeEspoirRespawnCell: 'deathCellOrNearest';
    delivranceWorks: boolean;
    coupDeSangCreatesErosion: boolean;
    impactCritHitsPoutch: boolean;
  };
  archetypes: {
    hpMode: 'flat30000' | 'passiveApplies';
    dompteurPower: number;
  };
  rng: {
    seed: number;
    rollMode: RollMode;
    critMode: CritMode;
    rollDistribution: RollDistribution;
    /** Un jet par cible (true) ou un jet par effet commun à toutes les cibles (false, défaut). */
    rollPerTarget: boolean;
  };
  engine: {
    subSpellsIgnoreCastConditions: boolean;
    pushLevelForArchetypes: number;
    eventLog: boolean;
    maxSubSpellDepth: number;
    /** À la mort d'un combattant, retirer les envoûtements qu'il a lancés (hypothèse, client). */
    removeBuffsOfDeadCaster: boolean;
    /** Inébranlable bloque aussi l'avance du lanceur (1042). */
    unshakableBlocksCasterAdvance: boolean;
    /** Envoûtements non décomptés au premier début de tour de leur lanceur (client : spellBuffsToIgnore). */
    firstTurnDecrementSkip: FirstTurnDecrementSkip;
    /** Début de tour : effets TB avant le décompte des buffs (défaut : après). */
    turnStartTriggersBeforeDecrement: boolean;
    /** 2018 lancé par le sort d'une marque ne dissipe que cette marque. */
    dispelGlyphsTriggeringMarkOnly: boolean;
  };
  victory: {
    canFinishFromTurn: number;
    turnLimit: number | null;
  };
  map: {
    dynamicObstacles: boolean;
  };
  /** Documentation de chaque paramètre (chemin pointé → doc). */
  _doc: Record<string, ParamDoc>;
}

/** Surcharge partielle (profonde) de la configuration ; les tableaux sont remplacés, pas fusionnés. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type ConfigOverrides = DeepPartial<Omit<SimConfig, '_doc'>>;
