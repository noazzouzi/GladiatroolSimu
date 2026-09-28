/**
 * État du scénario, stocké dans ``FightState.scenario`` et cloné avec lui (clonage explicite et rapide : tableaux
 * copiés, enregistrements immuables partagés). Les crochets du scénario (hooks.ts) sont partagés par tous les états
 * d'un même contexte et ne lisent / n'écrivent que cet objet et l'état de combat qui le porte.
 */
import type { ObjectiveId } from '../data/index.js';
import type { ExtensionState, FightState } from '../engine/index.js';
import type { CompletedObjective, DeathRecord, EndReason, TimelineInfo, WaveRecord } from './types.js';

/** Objectif validé en attente de sa récompense (traitée au prochain point sûr : fin d'action, de tour…). */
export interface PendingCompletion {
  readonly objectiveId: ObjectiveId;
  readonly creditedId: number;
  /** Tour global de la validation (fin du tour global : le tour qui s'achève), sinon le tour courant. */
  readonly turn?: number;
}

export class ScenarioState implements ExtensionState {
  // --- fixés à la mise en place (partagés entre clones : jamais modifiés ensuite)
  /** Entité de scénario (camp Sce : pics, cadeaux, objectifs, fin de combat). */
  sceId = -1;
  mamaId = -1;
  /** Joueurs dans l'ordre de jeu. */
  playerIds: readonly number[] = [];
  /** Graine des tirages du scénario (random.ts). */
  seed = 1;
  /** Ordre explicite (``timeline.model = explicit``). */
  timelineOrder: ((info: TimelineInfo) => number[]) | null = null;

  // --- timeline et vagues
  /** Sous-liste des monstres (hors Mama), dans l'ordre d'insertion (``timeline.newMonstersInsertion``) ; morts compris. */
  monsterOrder: number[] = [];
  waves: WaveRecord[] = [];

  // --- objectifs
  active: ObjectiveId | null = null;
  activatedTurn = 0;
  completed: CompletedObjective[] = [];
  pendingCompletion: PendingCompletion | null = null;
  /** Suivi « pendant le tour d'un allié » : combattant dont le tour est suivi (−1 : aucun). */
  turnOf = -1;
  /**
   * Suivi de l'objectif actif installé : vrai dès l'activation si le sort de l'objectif pose son suivi immédiatement
   * (déclencheur ``I``), sinon au prochain début de tour d'un joueur (déclencheur ``TB``) ; voir objectives.ts.
   */
  armed = false;
  /** Compteur du tour suivi (lancers, morts, victimes). */
  counter = 0;
  /** Ennemis distincts du tour (poussés, entrés dans les pics) ou marqués au début du tour (PV pleins). */
  ids: number[] = [];
  /** Drapeaux du tour (bit 1 : un ennemi est entré dans les pics ; bit 2 : un allié en est sorti). */
  flags = 0;
  /** Case marquée au début du tour (« Tout le monde veut prendre sa place »), −1 sinon. */
  markedCell = -1;
  /** « 1,2,3, Soleil ! » : case de début de tour de chaque joueur (index = rang dans ``playerIds``), −1 sinon. */
  startCells: number[] = [];
  /** « 1,2,3, Soleil ! » : joueurs validés pendant le tour global courant. */
  soleilOk: number[] = [];
  /** « Sauvez-le ! » : allié désigné (−1 : aucun). */
  designatedId = -1;
  /** « Quintuplé » : ennemis tués par des joueurs pendant le tour global. */
  globalKills = 0;
  /**
   * « Même pas mal » : fenêtre du tour de la Mama (de son début à sa fin de tour, 30539) ; alliés touchés (5961
   * « Attaque subie ») et alliés dont les PV ont varié depuis le début de la fenêtre (5960 « Vie inchangée » perdu).
   */
  mppOpen = false;
  mppHit: number[] = [];
  mppLost: number[] = [];

  // --- cadeaux
  giftsSpawned = 0;
  giftsTaken = 0;
  /** Uniques déjà obtenus : paires aplaties [joueur, niveau, joueur, niveau…]. */
  obtainedUniques: number[] = [];
  /** Nombre de tirages de cartes de cadeau déjà faits par joueur (index = rang dans ``playerIds``). */
  giftDraws: number[] = [];
  /** Un cadeau a été déclenché pendant le tour de ce combattant (``boss.giftCancelsRassemblement``). */
  giftDuringTurnOf = -1;
  /** Tour à passer (Mama dont le Rassemblement a poussé un joueur sur un cadeau). */
  skipTurnOf = -1;

  // --- fin, historique
  endReason: EndReason | null = null;
  deaths: DeathRecord[] = [];

  clone(): ScenarioState {
    const s = new ScenarioState();
    s.sceId = this.sceId;
    s.mamaId = this.mamaId;
    s.playerIds = this.playerIds;
    s.seed = this.seed;
    s.timelineOrder = this.timelineOrder;
    s.monsterOrder = this.monsterOrder.slice();
    s.waves = this.waves.slice();
    s.active = this.active;
    s.activatedTurn = this.activatedTurn;
    s.completed = this.completed.slice();
    s.pendingCompletion = this.pendingCompletion;
    s.turnOf = this.turnOf;
    s.armed = this.armed;
    s.counter = this.counter;
    s.ids = this.ids.length ? this.ids.slice() : [];
    s.flags = this.flags;
    s.markedCell = this.markedCell;
    s.startCells = this.startCells.slice();
    s.soleilOk = this.soleilOk.length ? this.soleilOk.slice() : [];
    s.designatedId = this.designatedId;
    s.globalKills = this.globalKills;
    s.mppOpen = this.mppOpen;
    s.mppHit = this.mppHit.length ? this.mppHit.slice() : [];
    s.mppLost = this.mppLost.length ? this.mppLost.slice() : [];
    s.giftsSpawned = this.giftsSpawned;
    s.giftsTaken = this.giftsTaken;
    s.obtainedUniques = this.obtainedUniques.length ? this.obtainedUniques.slice() : [];
    s.giftDraws = this.giftDraws.slice();
    s.giftDuringTurnOf = this.giftDuringTurnOf;
    s.skipTurnOf = this.skipTurnOf;
    s.endReason = this.endReason;
    s.deaths = this.deaths.slice();
    return s;
  }

  /** Rang d'un joueur dans l'ordre de jeu (−1 si ce n'est pas un joueur). */
  playerIndex(fighterId: number): number {
    return this.playerIds.indexOf(fighterId);
  }

  hasObtainedUnique(playerId: number, spellLevelId: number): boolean {
    const u = this.obtainedUniques;
    for (let i = 0; i < u.length; i += 2) if (u[i] === playerId && u[i + 1] === spellLevelId) return true;
    return false;
  }
}

/** État du scénario d'un combat (null si le combat n'a pas été créé par le scénario). */
export function scenarioOf(state: FightState): ScenarioState | null {
  const s = state.scenario;
  return s instanceof ScenarioState ? s : null;
}

/** Comme ``scenarioOf`` mais lève une erreur (français) si l'état n'a pas de scénario. */
export function requireScenario(state: FightState): ScenarioState {
  const s = scenarioOf(state);
  if (!s) throw new Error("Ce combat n'a pas été créé par le scénario du Gladiatrool (createGladiatroolFight)");
  return s;
}
