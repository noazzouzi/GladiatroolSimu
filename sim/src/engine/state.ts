/**
 * État de combat (machine à états, sans I/O) : combattants, occupation des cases (tableau typé), marques (glyphes,
 * auras), tour global, timeline, PRNG, journal, choix en attente, file de déclenchements, états d'extension
 * (scénario…). ``clone()`` est explicite et rapide (aucune sérialisation) : le planificateur clone des milliers de fois.
 */
import type { CritMode, MaskData, RollDistribution, RollMode } from '../data/index.js';
import { CELL_COUNT, type CellPredicate } from '../geometry/index.js';
import type { EngineContext } from './context.js';
import { EventLog, formatEvent, type FightEvent, type MoveKind, type NameResolver } from './events.js';
import { createFighter, Fighter, type FighterSpec, type Team } from './fighter.js';
import { Rng } from './rng.js';
import { EMPTY_CHAIN, type TriggerChain, type TriggerEvent } from './triggers.js';

/** Choix de joueur en attente (Acclamation, cadeau, vote d'objectif, archétype…), résolu par l'appelant. */
export interface PendingChoice {
  uid: number;
  scope: 'individual' | 'global';
  /** Liste de choix des données (``scenario.choices``) : 16, 17, 10, 11–15… */
  choiceListId: number;
  /** Joueur concerné (−1 pour un choix d'équipe). */
  fighterId: number;
  casterId: number;
  spellLevelId: number;
  castId: number;
  turn: number;
  /** Lancer racine (déduplication : un même lancer racine ne propose qu'une fois la même liste au même joueur). */
  rootCastId?: number;
  /** Options proposées (remplies par l'étape Scénario). */
  options?: readonly unknown[];
}

/** État d'extension clonable (scénario, glyphes…) stocké dans ``FightState``. */
export interface ExtensionState {
  clone(): ExtensionState;
}

export type MarkType = 'glyphTurnStart' | 'glyphTurnEnd' | 'aura' | 'glyphImmediate';

/**
 * Marque au sol (glyphe 401 / 402 / 1165, aura 1091). Comportement : marks.ts (début / fin de tour, entrée / sortie
 * d'aura, glyphe immédiat).
 */
export class Mark {
  uid = 0;
  type: MarkType = 'aura';
  effectId = 0;
  casterId = -1;
  /** Sort lancé par la marque (sous-sort de l'effet). */
  spellId = 0;
  spellLevelId = 0;
  /** Sort qui a posé la marque. */
  sourceSpellId = 0;
  sourceSpellLevelId = 0;
  castId = 0;
  centerCell = -1;
  /** Cases couvertes (partagées, ne pas modifier). */
  cells: readonly number[] = [];
  /** Masque des cases (partagé, ne pas modifier). */
  cellMask: Uint8Array = new Uint8Array(0);
  /** Tours restants (tours du poseur) ; −1 = permanent. */
  duration = -1;
  color = 0;
  critical = false;
  /** Masque de l'effet de pose (qui déclenche la marque : ``a,A`` pour les pics, ``Atq,A`` pour un cadeau). */
  mask: MaskData | null = null;
  /** Aura : combattants « dedans » (effets d'entrée appliqués) et lancer racine de leur application. */
  occupants: number[] = [];
  occupantRoots: number[] = [];
  /** Tour global de pose ; posée avant le premier tour de son poseur (décompte, voir turns.ts). */
  turnAdded = 0;
  beforeCasterFirstTurn = false;

  contains(cell: number): boolean {
    return cell >= 0 && cell < this.cellMask.length && this.cellMask[cell] === 1;
  }

  clone(): Mark {
    const m = new Mark();
    m.uid = this.uid;
    m.type = this.type;
    m.effectId = this.effectId;
    m.casterId = this.casterId;
    m.spellId = this.spellId;
    m.spellLevelId = this.spellLevelId;
    m.sourceSpellId = this.sourceSpellId;
    m.sourceSpellLevelId = this.sourceSpellLevelId;
    m.castId = this.castId;
    m.centerCell = this.centerCell;
    m.cells = this.cells;
    m.cellMask = this.cellMask;
    m.duration = this.duration;
    m.color = this.color;
    m.critical = this.critical;
    m.mask = this.mask;
    m.turnAdded = this.turnAdded;
    m.beforeCasterFirstTurn = this.beforeCasterFirstTurn;
    m.occupants = this.occupants.length ? this.occupants.slice() : [];
    m.occupantRoots = this.occupantRoots.length ? this.occupantRoots.slice() : [];
    return m;
  }
}

export interface FightStateOptions {
  /** Graine du PRNG (défaut : ``config.rng.seed``). */
  seed?: number;
  /** Journal d'événements (défaut : ``config.engine.eventLog``). */
  eventLog?: boolean;
}

export interface CloneOptions {
  /** Copier le journal (défaut : oui s'il existe). false = le clone n'a pas de journal. */
  keepLog?: boolean;
}

export class FightState {
  ctx!: EngineContext;
  fighters: Fighter[] = [];
  /** Occupation : fighterId + 1 par case (0 = libre). Tableau typé de 560 cases. */
  occupancy!: Int16Array;
  marks: Mark[] = [];
  /** Tour global (0 = avant le combat). */
  turn = 0;
  /** Ordre de jeu (ids) et index du combattant courant (−1 : aucun). */
  timeline: number[] = [];
  timelineIndex = -1;
  /**
   * Étape du tour (turns.ts) : 'none' = aucun tour en cours ; 'pending' = ``timelineIndex`` désigne le prochain
   * combattant, dont le tour n'a pas encore commencé ; 'active' = tour de ``currentFighterId`` en cours.
   */
  turnStage: 'none' | 'pending' | 'active' = 'none';
  /** Combattant dont le tour est en cours (−1 : aucun). */
  currentFighterId = -1;
  phase: 'setup' | 'fighting' | 'ended' = 'setup';
  winner: Team | null = null;
  rng!: Rng;
  rollMode: RollMode = 'random';
  critMode: CritMode = 'random';
  rollDistribution: RollDistribution = 'uniform';
  log: EventLog | null = null;
  pendingChoices: PendingChoice[] = [];
  /** Déclenchements à traiter (voir ``flushTriggers``). */
  triggerQueue: TriggerEvent[] = [];
  /** Début des événements du niveau de vidage courant (vidages imbriqués, triggerQueue.ts). */
  flushMark = 0;
  /** Chaîne des buffs déclenchés en cours d'exécution (anti-boucle), estampillée sur chaque événement. */
  triggerChain: TriggerChain = EMPTY_CHAIN;
  /** Un buff à jeton « côté lanceur » (CD…, CH, PO, CC) a été posé : ces jetons sont évalués. */
  hasCasterTriggers = false;
  /** Arrivées sur case différées jusqu'à la fin du sort (``spikes.auraAppliesMidSpell`` = false). */
  deferredEnters: { fighterId: number; cell: number; from: number; kind: MoveKind; sourceId: number; castId: number }[] = [];
  /** Dernier tour global de lancer par (équipe, sort) pour ``globalCooldown``. */
  globalCooldowns: { team: Team; spellId: number; turn: number }[] = [];
  /** État du scénario (étape Scénario). */
  scenario: ExtensionState | null = null;
  /** Autres états d'extension (glyphes, objectifs…), clonés avec l'état. */
  ext: Record<string, ExtensionState> = {};
  /** Profondeur de résolution courante (lancers imbriqués). */
  castDepth = 0;
  /** Séquence d'identifiants (buffs, marques, lancers, choix). */
  uidSeq = 0;
  private occPred: CellPredicate | null = null;
  private freePred: CellPredicate | null = null;

  static create(ctx: EngineContext, opts: FightStateOptions = {}): FightState {
    const s = new FightState();
    s.ctx = ctx;
    s.occupancy = new Int16Array(CELL_COUNT);
    s.rng = new Rng(opts.seed ?? ctx.config.rng.seed);
    s.rollMode = ctx.config.rng.rollMode;
    s.critMode = ctx.config.rng.critMode;
    s.rollDistribution = ctx.config.rng.rollDistribution;
    if (opts.eventLog ?? ctx.config.engine.eventLog) s.log = new EventLog();
    return s;
  }

  /** Copie profonde et indépendante (le contexte est partagé). */
  clone(opts: CloneOptions = {}): FightState {
    const s = new FightState();
    s.ctx = this.ctx;
    const n = this.fighters.length;
    const fs = new Array<Fighter>(n);
    for (let i = 0; i < n; i++) fs[i] = this.fighters[i]!.clone();
    s.fighters = fs;
    s.occupancy = this.occupancy.slice();
    s.marks = this.marks.length ? this.marks.map((m) => m.clone()) : [];
    s.turn = this.turn;
    s.timeline = this.timeline.slice();
    s.timelineIndex = this.timelineIndex;
    s.turnStage = this.turnStage;
    s.currentFighterId = this.currentFighterId;
    s.phase = this.phase;
    s.winner = this.winner;
    s.rng = this.rng.clone();
    s.rollMode = this.rollMode;
    s.critMode = this.critMode;
    s.rollDistribution = this.rollDistribution;
    s.log = this.log && opts.keepLog !== false ? this.log.clone() : null;
    s.pendingChoices = this.pendingChoices.slice();
    s.triggerQueue = this.triggerQueue.slice();
    s.flushMark = this.flushMark;
    s.triggerChain = this.triggerChain;
    s.hasCasterTriggers = this.hasCasterTriggers;
    s.deferredEnters = this.deferredEnters.slice();
    s.globalCooldowns = this.globalCooldowns.length ? this.globalCooldowns.map((g) => ({ ...g })) : [];
    s.scenario = this.scenario ? this.scenario.clone() : null;
    const keys = Object.keys(this.ext);
    if (keys.length) {
      const ext: Record<string, ExtensionState> = {};
      for (const k of keys) ext[k] = this.ext[k]!.clone();
      s.ext = ext;
    }
    s.castDepth = this.castDepth;
    s.uidSeq = this.uidSeq;
    return s;
  }

  // ------------------------------------------------------------------ accès

  fighter(id: number): Fighter {
    const f = this.fighters[id];
    if (!f) throw new Error(`Combattant inconnu : ${id}`);
    return f;
  }

  /** Combattant vivant sur une case (null si libre). */
  fighterAt(cell: number): Fighter | null {
    if (cell < 0 || cell >= CELL_COUNT) return null;
    const o = this.occupancy[cell]!;
    return o === 0 ? null : this.fighters[o - 1]!;
  }

  isOccupied(cell: number): boolean {
    return cell >= 0 && cell < CELL_COUNT && this.occupancy[cell] !== 0;
  }

  /** Prédicat d'occupation (fermeture mise en cache, lit l'occupation courante). */
  occupiedPredicate(): CellPredicate {
    if (!this.occPred) {
      const occ = this.occupancy;
      this.occPred = (c: number) => c >= 0 && c < CELL_COUNT && occ[c] !== 0;
    }
    return this.occPred;
  }

  /** Prédicat « marchable et libre ». */
  freePredicate(): CellPredicate {
    if (!this.freePred) this.freePred = this.ctx.grid.freePredicate(this.occupiedPredicate());
    return this.freePred;
  }

  /** Combattant dont le tour est en cours ; à défaut, combattant désigné par la timeline (−1 : aucun). */
  get activeFighterId(): number {
    if (this.turnStage === 'active' && this.currentFighterId >= 0) return this.currentFighterId;
    return this.timelineIndex >= 0 && this.timelineIndex < this.timeline.length ? this.timeline[this.timelineIndex]! : -1;
  }

  get pendingChoice(): PendingChoice | null {
    return this.pendingChoices[0] ?? null;
  }

  livingFighters(team?: Team): Fighter[] {
    return this.fighters.filter((f) => f.alive && (team === undefined || f.team === team));
  }

  newUid(): number {
    this.uidSeq += 1;
    return this.uidSeq;
  }

  // ------------------------------------------------------------------ journal et déclenchements

  /** Vrai si les événements sont observés (journal ou crochet ``onEvent``) : sinon inutile de les construire. */
  get logging(): boolean {
    return this.log !== null || this.ctx.hooks.onEvent !== undefined;
  }

  emit(ev: FightEvent): void {
    if (this.log) this.log.push(ev);
    this.ctx.hooks.onEvent?.(this, ev);
  }

  /** Met un événement en file, estampillé de la chaîne de déclenchement courante (anti-boucle) et de l'uid courant. */
  queueTrigger(ev: TriggerEvent): void {
    ev.chain = this.triggerChain;
    ev.seq = this.uidSeq;
    this.triggerQueue.push(ev);
  }

  /** Active ou désactive le journal. */
  setEventLog(enabled: boolean): void {
    if (enabled && !this.log) this.log = new EventLog();
    if (!enabled) this.log = null;
  }

  /** Résolveur de noms pour ``formatEvent``. */
  get names(): NameResolver {
    return {
      fighter: (id) => this.fighters[id]?.name ?? `#${id}`,
      spell: (id) => this.ctx.spellName(id),
      state: (id) => this.ctx.stateName(id),
    };
  }

  /** Messages français du journal. */
  describeLog(): string[] {
    if (!this.log) return [];
    const n = this.names;
    return this.log.events.map((e) => formatEvent(e, n));
  }

  // ------------------------------------------------------------------ occupation (bas niveau, sans crochets)

  /** Place ou déplace un combattant (occupation seulement). ``cell`` = −1 : retiré de la carte. */
  setCell(f: Fighter, cell: number): void {
    if (f.cell >= 0 && f.cell < CELL_COUNT && this.occupancy[f.cell] === f.id + 1) this.occupancy[f.cell] = 0;
    f.cell = cell;
    if (cell >= 0 && cell < CELL_COUNT && f.alive) {
      const o = this.occupancy[cell]!;
      if (o !== 0 && o !== f.id + 1) throw new Error(`Case ${cell} déjà occupée par ${this.fighters[o - 1]!.name}`);
      this.occupancy[cell] = f.id + 1;
    }
  }

  /** Échange deux combattants vivants (occupation seulement). */
  swapCells(a: Fighter, b: Fighter): void {
    const ca = a.cell;
    const cb = b.cell;
    a.cell = cb;
    b.cell = ca;
    if (cb >= 0) this.occupancy[cb] = a.id + 1;
    if (ca >= 0) this.occupancy[ca] = b.id + 1;
  }
}

/**
 * Ajoute un combattant au combat (id = rang dans ``fighters``) et le place sur ``cell`` (−1 : hors carte).
 * Émet ``spawn`` et appelle ``hooks.onFighterAdded``. Pas de crochet de case : l'apparition n'est pas une entrée
 * (le scénario décide s'il faut appliquer les auras).
 */
export function addFighter(
  state: FightState,
  specOrFighter: FighterSpec | Fighter,
  cell: number,
  cause: 'spawn' | 'summon' = 'spawn',
): Fighter {
  const f = specOrFighter instanceof Fighter ? specOrFighter : createFighter(state.ctx, specOrFighter);
  f.id = state.fighters.length;
  f.spawnOrder = f.id;
  f.alive = true;
  f.cell = -1;
  state.fighters.push(f);
  if (cell >= 0) state.setCell(f, cell);
  state.emit({ type: 'spawn', fighterId: f.id, cell, summonerId: f.summonerId });
  state.ctx.hooks.onFighterAdded?.(state, f, cause);
  return f;
}
