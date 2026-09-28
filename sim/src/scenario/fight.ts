/**
 * API de pilotage du combat (machine à états) pour le runner, le planificateur et l'interface.
 *
 * Invariant : hors d'un appel de méthode, le combat est à un POINT DE DÉCISION (``getStatus()``) :
 * - ``choice`` : un choix attend une réponse (``resolveChoice``) — Acclamation, cadeau, vote d'objectif ;
 * - ``playerTurn`` : un joueur agit (``playerCast``, ``playerMove``, ``endTurn``) ;
 * - ``monsterTurn`` : un monstre agit (``stepMonsterTurn(ia)`` ; ou ``runUntilPlayerInput(ia)``) ;
 * - ``ended`` : victoire, défaite ou limite de tours (``getResult()``).
 * Toute la logique (tours annulés, vagues, cadeaux, objectifs, fin) s'exécute pendant ces appels. L'état complet
 * (moteur + scénario) se clone avec ``clone()`` (pas de sérialisation) : le planificateur explore sur des copies.
 */
import {
  canCast,
  endTurn as engineEndTurn,
  getCastableCells,
  nextTurn,
  performAction,
  Stat,
  type ActionResult,
  type CastCheck,
  type CloneOptions,
  type EngineContext,
  type FightAction,
  type Fighter,
  type FightState,
} from '../engine/index.js';
import { pendingChoicesOf, resolveChoice as resolveChoiceIn } from './choices.js';
import { endFight, flushScenario } from './hooks.js';
import { completeActiveObjective, isPlayerCharacter, objectiveById } from './objectives.js';
import { requireScenario, type ScenarioState } from './scenarioState.js';
import type {
  ChoiceAnswer,
  ChoiceResult,
  FightResult,
  FightStatus,
  MonsterController,
  ScenarioChoice,
} from './types.js';

/** Forme fonctionnelle d'un contrôleur de monstres. */
export type MonsterTurnFn = (fight: GladiatroolFight, fighterId: number) => void;

/** IA minimale : le monstre ne fait rien (son tour est terminé par le scénario). */
export const passiveMonsterController: MonsterController = { playTurn() {} };

/** Garde-fou des boucles d'avancement. */
const MAX_STEPS = 100_000;

export class GladiatroolFight {
  readonly state: FightState;
  /** Contrôleur des monstres utilisé quand aucun n'est passé en argument. */
  monsterController: MonsterController;

  constructor(state: FightState, monsterController: MonsterController = passiveMonsterController) {
    requireScenario(state);
    this.state = state;
    this.monsterController = monsterController;
  }

  /** Copie indépendante (moteur + scénario ; contexte partagé). ``keepLog: false`` : sans journal (plus rapide). */
  clone(opts: CloneOptions = {}): GladiatroolFight {
    return new GladiatroolFight(this.state.clone(opts), this.monsterController);
  }

  get ctx(): EngineContext {
    return this.state.ctx;
  }

  get scenario(): ScenarioState {
    return requireScenario(this.state);
  }

  /** Tour global courant (0 avant le premier). */
  get turn(): number {
    return this.state.turn;
  }

  // ------------------------------------------------------------------ lecture

  /** Combattant dont le tour est en cours (null : aucun). */
  getCurrentFighter(): Fighter | null {
    const s = this.state;
    return s.turnStage === 'active' ? s.fighters[s.currentFighterId] ?? null : null;
  }

  /** Tour d'un joueur (personnage) en cours. */
  isPlayerTurn(): boolean {
    const f = this.getCurrentFighter();
    return !!f && f.alive && isPlayerCharacter(f) && this.state.phase !== 'ended';
  }

  /** Tour d'un monstre en cours. */
  isMonsterTurn(): boolean {
    const f = this.getCurrentFighter();
    return !!f && f.alive && f.team === 'monsters' && this.state.phase !== 'ended';
  }

  isEnded(): boolean {
    return this.state.phase === 'ended';
  }

  /** Premier choix en attente (options remplies), null sinon. */
  getPendingChoice(): ScenarioChoice | null {
    return pendingChoicesOf(this.state)[0] ?? null;
  }

  getPendingChoices(): ScenarioChoice[] {
    return pendingChoicesOf(this.state);
  }

  /** Point de décision courant (sans effet de bord). */
  getStatus(): FightStatus {
    const s = this.state;
    if (s.phase === 'ended') return { kind: 'ended', winner: s.winner, reason: this.scenario.endReason };
    const c = this.getPendingChoice();
    if (c) return { kind: 'choice', choice: c };
    const f = this.getCurrentFighter();
    if (f && f.alive) {
      if (isPlayerCharacter(f)) return { kind: 'playerTurn', fighterId: f.id };
      if (f.team === 'monsters') return { kind: 'monsterTurn', fighterId: f.id };
    }
    return { kind: 'idle' };
  }

  /** Joueurs (ordre de jeu, morts compris). */
  getPlayers(): Fighter[] {
    return this.scenario.playerIds.map((id) => this.state.fighters[id]!);
  }

  /** Monstres vivants (Troolls et Mama). */
  getLivingMonsters(): Fighter[] {
    return this.state.fighters.filter((f) => f.alive && f.team === 'monsters');
  }

  /** Mama Troollette (null si absente du combat). */
  getMama(): Fighter | null {
    const id = this.scenario.mamaId;
    return id >= 0 ? this.state.fighters[id] ?? null : null;
  }

  /** Ordre de jeu du tour global courant et index du combattant courant. */
  getTimeline(): { ids: readonly number[]; index: number } {
    return { ids: this.state.timeline, index: this.state.timelineIndex };
  }

  /** Objectif en cours et son suivi (case marquée, allié désigné, compteur du tour). */
  getActiveObjective(): {
    id: string;
    name: string;
    tier: number;
    summary: string;
    counter: number;
    markedCell: number;
    designatedId: number;
    globalKills: number;
  } | null {
    const sc = this.scenario;
    if (!sc.active) return null;
    const o = objectiveById(this.ctx.data, sc.active);
    return {
      id: o.id,
      name: o.name,
      tier: o.tier,
      summary: o.summary,
      counter: sc.counter,
      markedCell: sc.markedCell,
      designatedId: sc.designatedId,
      globalKills: sc.globalKills,
    };
  }

  /** Le combattant courant peut-il lancer ce sort sur cette case ? (raison en français sinon) */
  canCast(spellLevelId: number, cell: number): CastCheck {
    const f = this.getCurrentFighter();
    if (!f) return { ok: false, code: 'UNKNOWN_FIGHTER', reason: 'aucun tour en cours' };
    return canCast(this.state, f.id, spellLevelId, cell);
  }

  /** Cases ciblables par le combattant courant pour ce sort. */
  getCastableCells(spellLevelId: number): number[] {
    const f = this.getCurrentFighter();
    return f ? getCastableCells(this.state, f.id, spellLevelId) : [];
  }

  /** Messages français du journal. */
  describeLog(): string[] {
    return this.state.describeLog();
  }

  /** Résultats (tour, PV, morts, objectifs réalisés, victoire). */
  getResult(): FightResult {
    const s = this.state;
    const sc = this.scenario;
    const players = this.getPlayers().map((f) => ({
      id: f.id,
      name: f.name,
      archetype: f.archetype!,
      alive: f.alive,
      hp: f.alive ? f.hp : 0,
      maxHp: f.maxHp,
      cell: f.cell,
      spells: f.spells.map((x) => x.spellLevelId),
    }));
    let monstersAlive = 0;
    for (const f of s.fighters) if (f.alive && f.team === 'monsters') monstersAlive++;
    const mama = this.getMama();
    return {
      ended: s.phase === 'ended',
      winner: s.winner,
      reason: sc.endReason,
      turn: s.turn,
      players,
      playersAlive: players.filter((p) => p.alive).length,
      monstersAlive,
      monstersKilled: sc.deaths.filter((d) => d.team === 'monsters').length,
      mama: mama
        ? {
            id: mama.id,
            alive: mama.alive,
            hp: mama.alive ? mama.hp : 0,
            maxHp: mama.maxHp,
            cell: mama.alive ? mama.cell : mama.deathCell,
            arrived: (mama.alive ? mama.cell : mama.deathCell) !== this.ctx.data.boss.waitCell,
            finalDamageBonus: mama.stat(Stat.FINAL_DAMAGE),
          }
        : null,
      objectivesCompleted: sc.completed.slice(),
      activeObjective: sc.active,
      deaths: sc.deaths.slice(),
      waves: sc.waves.slice(),
      giftsSpawned: sc.giftsSpawned,
      giftsTaken: sc.giftsTaken,
    };
  }

  // ------------------------------------------------------------------ choix

  /**
   * Répond au choix ``choiceUid`` (index d'option, ou ``{ votes }`` pour un vote d'équipe). Si plus aucun choix
   * n'attend et qu'aucun tour n'est en cours, le combat avance jusqu'au point de décision suivant.
   */
  resolveChoice(choiceUid: number, answer: ChoiceAnswer): ChoiceResult {
    const r = resolveChoiceIn(this.state, choiceUid, answer);
    if (r.ok) this.settle();
    return r;
  }

  // ------------------------------------------------------------------ actions

  /** Lancer du joueur dont c'est le tour. */
  playerCast(spellLevelId: number, cell: number): ActionResult {
    const f = this.getCurrentFighter();
    if (!f || !isPlayerCharacter(f)) return { ok: false, code: 'NOT_PLAYER_TURN', reason: "ce n'est pas le tour d'un joueur" };
    return this.act(f.id, { type: 'cast', spellLevelId, cell });
  }

  /** Déplacement du joueur dont c'est le tour : chemin (cases successives) ou case d'arrivée (plus court chemin). */
  playerMove(target: readonly number[] | number, opts: { avoidSpikes?: boolean } = {}): ActionResult {
    const f = this.getCurrentFighter();
    if (!f || !isPlayerCharacter(f)) return { ok: false, code: 'NOT_PLAYER_TURN', reason: "ce n'est pas le tour d'un joueur" };
    return this.move(f.id, target, opts);
  }

  /** Lancer d'un combattant dont c'est le tour (joueur ou monstre : utilisé par les IA). */
  cast(fighterId: number, spellLevelId: number, cell: number): ActionResult {
    return this.act(fighterId, { type: 'cast', spellLevelId, cell });
  }

  /** Déplacement d'un combattant dont c'est le tour. */
  move(fighterId: number, target: readonly number[] | number, opts: { avoidSpikes?: boolean } = {}): ActionResult {
    const action: FightAction =
      typeof target === 'number' ? { type: 'moveTo', cell: target, avoidSpikes: opts.avoidSpikes } : { type: 'move', path: target };
    return this.act(fighterId, action);
  }

  /** Termine le tour en cours puis avance jusqu'au point de décision suivant. */
  endTurn(): FightStatus {
    const f = this.getCurrentFighter();
    if (f && this.state.phase !== 'ended' && !this.state.pendingChoices.length) {
      performAction(this.state, f.id, { type: 'endTurn' });
      flushScenario(this.state);
    }
    return this.advance();
  }

  /**
   * Tour du monstre courant : ``ai.playTurn`` (sauf tour à passer : Mama pas encore arrivée si
   * ``boss.actsBeforeArrival`` est faux, tour annulé par le bug du cadeau), puis fin du tour et avancée. Si un choix
   * apparaît pendant le tour du monstre (objectif validé → vote), renvoie ``choice`` sans terminer le tour : après la
   * réponse, rappeler ``stepMonsterTurn`` pour qu'il finisse son tour.
   */
  stepMonsterTurn(ai: MonsterController | MonsterTurnFn = this.monsterController): FightStatus {
    let st = this.getStatus();
    if (st.kind === 'idle') st = this.advance();
    if (st.kind !== 'monsterTurn') return st;
    const id = st.fighterId;
    const f = this.state.fighters[id]!;
    const skip = this.monsterSkipReason(f);
    if (skip) {
      if (this.state.logging) this.state.emit({ type: 'info', message: `${f.name} passe son tour (${skip}).` });
    } else if (typeof ai === 'function') ai(this, id);
    else ai.playTurn(this, id);
    flushScenario(this.state);
    if (this.state.phase === 'ended') return this.getStatus();
    if (this.state.pendingChoices.length) return this.getStatus();
    if (this.state.turnStage === 'active' && this.state.currentFighterId === id) {
      performAction(this.state, id, { type: 'endTurn' });
      flushScenario(this.state);
    }
    return this.advance();
  }

  /** Avance (tours des monstres joués par ``ai``) jusqu'à un tour de joueur, un choix ou la fin du combat. */
  runUntilPlayerInput(ai: MonsterController | MonsterTurnFn = this.monsterController): FightStatus {
    let st = this.advance();
    for (let i = 0; i < MAX_STEPS && st.kind === 'monsterTurn'; i++) st = this.stepMonsterTurn(ai);
    return st;
  }

  /**
   * Avance la machine du moteur (fins et débuts de tour, tours globaux) jusqu'au prochain point de décision. Les
   * tours des monstres ne sont PAS joués (``monsterTurn`` est renvoyé) ; les tours des invocations des joueurs
   * (Poutch, sans PA ni PM) et d'un combattant mort sont terminés d'office.
   */
  advance(): FightStatus {
    const s = this.state;
    for (let i = 0; i < MAX_STEPS; i++) {
      flushScenario(s);
      if (s.phase === 'ended' || s.pendingChoices.length) return this.getStatus();
      if (s.turnStage === 'active') {
        const f = s.fighters[s.currentFighterId];
        if (f && f.alive && (isPlayerCharacter(f) || f.team === 'monsters')) return this.getStatus();
        engineEndTurn(s, s.currentFighterId);
        continue;
      }
      const r = nextTurn(s);
      if (r.status === 'noFighter') {
        flushScenario(s);
        endFight(s, this.scenario, null, 'noFighter');
        return this.getStatus();
      }
    }
    throw new Error('advance : trop d’étapes');
  }

  /**
   * Valide l'objectif en cours et applique sa récompense (outil de test / de débogage / d'exploration) ; renvoie faux
   * s'il n'y a pas d'objectif actif.
   */
  debugCompleteObjective(creditedId = -1): boolean {
    const ok = completeActiveObjective(this.state, creditedId);
    if (ok) this.settle();
    return ok;
  }

  // ------------------------------------------------------------------ interne

  private act(fighterId: number, action: FightAction): ActionResult {
    if (this.state.phase === 'ended') return { ok: false, code: 'FIGHT_ENDED', reason: 'le combat est terminé' };
    const r = performAction(this.state, fighterId, action);
    flushScenario(this.state);
    if (action.type === 'endTurn') this.advance();
    else this.settle();
    return r;
  }

  /** Après une action ou un choix : si plus rien n'attend (tour terminé, combattant courant mort), avancer. */
  private settle(): void {
    const s = this.state;
    flushScenario(s);
    if (s.phase === 'ended' || s.pendingChoices.length) return;
    const f = s.turnStage === 'active' ? s.fighters[s.currentFighterId] : undefined;
    if (!f || !f.alive) this.advance();
  }

  /** Tour à passer sans consulter l'IA (logique serveur) : raison en français, sinon null. */
  private monsterSkipReason(f: Fighter): string | null {
    const sc = this.scenario;
    if (f.id === sc.skipTurnOf) return 'un joueur a été poussé sur un cadeau pendant le Rassemblement';
    if (f.id === sc.mamaId && !this.ctx.config.boss.actsBeforeArrival && f.cell === this.ctx.data.boss.waitCell) {
      return `en attente sur la case ${f.cell}`;
    }
    return null;
  }
}

/**
 * Résout tous les choix en attente avec ``pick`` (index d'option, ou votes) jusqu'à ce qu'il n'en reste plus ;
 * renvoie le nombre de choix résolus. Pratique pour les tests et les politiques simples.
 */
export function resolveAllChoices(fight: GladiatroolFight, pick: (choice: ScenarioChoice, fight: GladiatroolFight) => ChoiceAnswer = () => 0): number {
  let n = 0;
  for (let c = fight.getPendingChoice(); c && n < 1000; c = fight.getPendingChoice()) {
    const r = fight.resolveChoice(c.uid, pick(c, fight));
    if (!r.ok) throw new Error(`Choix ${c.uid} (liste ${c.choiceListId}) : ${r.reason}`);
    n++;
  }
  return n;
}
