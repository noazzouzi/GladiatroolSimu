/**
 * Types publics du scénario du Gladiatrool : mise en place du combat, choix proposés aux joueurs, état de la machine
 * à états (``FightStatus``), résultats et interface des contrôleurs de monstres.
 */
import type { ArchetypeKey, ObjectiveId } from '../data/index.js';
import type { EngineContext, PendingChoice, Team } from '../engine/index.js';
import type { GladiatroolFight } from './fight.js';

// ---------------------------------------------------------------------------------------------
// Mise en place
// ---------------------------------------------------------------------------------------------

/** Joueur (dans l'ORDRE DE JEU : J1, J2…). */
export interface PlayerSetup {
  /** Nom affiché (défaut : nom de l'archétype, numéroté en cas de doublon). */
  name?: string;
  archetype: ArchetypeKey;
  /** Case de départ imposée (286, 287, 314 ou 315) ; sinon placement automatique. */
  startCell?: number;
}

/** Informations passées à ``FightOptions.timelineOrder`` (modèle de timeline ``explicit``). */
export interface TimelineInfo {
  /** Mama (−1 si morte). */
  mamaId: number;
  /** Joueurs dans l'ordre de jeu (morts compris si ``timeline.deadPlayersKeepSlot``). */
  playerIds: readonly number[];
  /** Monstres vivants (hors Mama) dans l'ordre de la sous-liste des monstres. */
  monsterIds: readonly number[];
  /** Tour global qui commence. */
  turn: number;
}

export interface FightOptions {
  /**
   * Contexte moteur à réutiliser (doit venir de ``createScenarioContext`` : crochets du scénario installés). Utile
   * pour enchaîner des combats sans recompiler les sorts ; ``data`` et ``config`` sont alors ignorés.
   */
  ctx?: EngineContext;
  /** Journal d'événements (défaut : ``engine.eventLog``). */
  eventLog?: boolean;
  /** Avancer jusqu'au premier point de décision (défaut : vrai). */
  autoStart?: boolean;
  /** Ordre de placement automatique des joueurs sans case imposée (défaut : 314, 287, 286, 315). */
  autoPlacementOrder?: readonly number[];
  /** Graine des tirages du scénario (cases d'apparition, cadeaux, cartes) ; défaut : ``spawn.seed``, sinon la graine du combat. */
  scenarioSeed?: number;
  /** Ordre de jeu pour ``timeline.model = explicit`` (ids ; la Mama en tête si on le souhaite). */
  timelineOrder?: (info: TimelineInfo) => number[];
  /** Contrôleur des monstres par défaut (``stepMonsterTurn`` / ``runUntilPlayerInput`` sans argument). */
  monsterController?: MonsterController;
}

export interface FightSetup {
  /** 1 à 4 joueurs dans l'ordre de jeu (défaut : ``timeline.playerOrder`` de la configuration). */
  players?: readonly PlayerSetup[];
  /** Graine du combat (jets, critiques) ; défaut : ``rng.seed``. */
  seed?: number;
  options?: FightOptions;
}

// ---------------------------------------------------------------------------------------------
// Choix
// ---------------------------------------------------------------------------------------------

/** Carte proposée dans un choix (liste 17 : Acclamation ; 10 : cadeau ; 11-15 : vote ; 16 : archétype). */
export type ChoiceOption =
  | {
      kind: 'acclamation';
      /** Niveau de la carte (lancé à l'application : exécute l'accumulateur). */
      cardSpellLevelId: number;
      /** Niveau de l'accumulateur qui applique le bonus. */
      realSpellLevelId: number;
      stat: string;
      value: number;
      label: string;
    }
  | { kind: 'unique'; spellLevelId: number; label: string }
  | {
      kind: 'upgrade';
      baseSpellLevelId: number;
      upgradedSpellLevelId: number;
      /** Niveau de la carte « Amélioration : X » (3406 + 3405 + état boostedSpell). */
      cardSpellLevelId: number;
      label: string;
    }
  | { kind: 'objective'; objectiveId: ObjectiveId; tier: number; orientation: string; label: string }
  | { kind: 'archetype'; archetype: ArchetypeKey; passiveSpellLevelId: number; label: string };

export type ChoiceOptionKind = ChoiceOption['kind'];

/**
 * Réponse à un choix : index de l'option ; pour un vote (choix global), soit l'index retenu par l'équipe, soit les
 * votes de chaque joueur (index d'option) — majorité, égalité tirée au sort (``tieBreak`` des données).
 */
export type ChoiceAnswer = number | { votes: readonly number[] };

export interface ChoiceResult {
  ok: boolean;
  /** Raison d'un refus (français). */
  reason?: string;
  option?: ChoiceOption;
}

/** Choix en attente avec ses options (toujours remplies quand le contrôle revient à l'appelant). */
export type ScenarioChoice = Omit<PendingChoice, 'options'> & { readonly options: readonly ChoiceOption[] };

// ---------------------------------------------------------------------------------------------
// Machine à états, résultats
// ---------------------------------------------------------------------------------------------

export type EndReason = 'victory' | 'defeat' | 'turnLimit' | 'noFighter';

/** Point de décision courant (hors appel de méthode, le combat est toujours à l'un d'eux, sauf ``idle``). */
export type FightStatus =
  | { kind: 'choice'; choice: ScenarioChoice }
  | { kind: 'playerTurn'; fighterId: number }
  | { kind: 'monsterTurn'; fighterId: number }
  | { kind: 'ended'; winner: Team | null; reason: EndReason | null }
  /** Aucun tour en cours ni choix : appeler ``advance()`` (seulement si ``autoStart`` est faux ou après une manipulation directe du moteur). */
  | { kind: 'idle' };

/** Contrôleur des monstres (IA) : joue le tour de ``fighterId`` via ``fight.cast`` / ``fight.move`` ; le scénario termine le tour. */
export interface MonsterController {
  playTurn(fight: GladiatroolFight, fighterId: number): void;
}

export interface PlayerSummary {
  id: number;
  name: string;
  archetype: ArchetypeKey;
  alive: boolean;
  hp: number;
  maxHp: number;
  cell: number;
  /** Niveaux de sort du grimoire. */
  spells: number[];
}

export interface CompletedObjective {
  readonly objectiveId: ObjectiveId;
  readonly name: string;
  readonly tier: number;
  readonly turn: number;
  /** Joueur crédité (lanceur de la récompense). */
  readonly creditedId: number;
}

export interface DeathRecord {
  readonly fighterId: number;
  readonly turn: number;
  readonly killerId: number;
  readonly cause: string;
  readonly team: Team;
}

export interface WaveRecord {
  readonly wave: number;
  readonly turn: number;
  readonly fighterIds: readonly number[];
  readonly cells: readonly number[];
}

export interface FightResult {
  ended: boolean;
  winner: Team | null;
  reason: EndReason | null;
  /** Tour global courant (ou de fin). */
  turn: number;
  players: PlayerSummary[];
  playersAlive: number;
  monstersAlive: number;
  monstersKilled: number;
  mama: { id: number; alive: boolean; hp: number; maxHp: number; cell: number; arrived: boolean; finalDamageBonus: number } | null;
  objectivesCompleted: CompletedObjective[];
  activeObjective: ObjectiveId | null;
  deaths: DeathRecord[];
  waves: WaveRecord[];
  giftsSpawned: number;
  giftsTaken: number;
}
