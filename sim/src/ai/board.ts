/**
 * « Plateau » de l'IA : copie légère et rapide (tableaux typés) de ce qui compte pour évaluer un tour de monstre —
 * cases, PV (en espérance), boucliers, érosion, vie, présence dans les pics, multiplicateurs de pics (aura, sortie),
 * Inébranlable, bonus de dommages finaux / d'érosion acquis pendant la simulation, occupation des cases, et
 * compteurs de lancers du combattant qui joue.
 *
 * Le plateau est construit en LECTURE SEULE depuis un ``FightState`` (jamais modifié) ; les combattants réels servent
 * de référence immuable (caractéristiques, états, masques, drapeaux). Les simulations de sorts (simulate.ts) et de
 * marche modifient uniquement le plateau. Copie ≈ 1 µs : l'IA en évalue des centaines par tour.
 *
 * Pics (ETUDE §9.13, lus dans les sorts compilés, voir env.ts) : entrée → dégâts d'entrée (multipliés par les 1163
 * déjà portés, dont une vulnérabilité de sortie encore active) puis ×2 d'aura pour le camp visé (Def ; Atq aussi si
 * ``spikes.playersDoubledInside``) ; sortie → aura retirée et ×2 de sortie si le combattant porte le passif 30700
 * (joueurs, Troolls ; pas la Mama) ; ``spikes.stackExitAndInside`` faux : la vulnérabilité de sortie est retirée à la
 * ré-entrée ; ``spikes.retriggerOnMoveInside`` : ré-entrée d'une case de pics à une autre.
 */
import type { Camp } from '../data/index.js';
import { CELL_COUNT, type CellPredicate } from '../geometry/index.js';
import {
  receiveDamage,
  senderDamage,
  SPELL_IDS,
  Stat,
  StatsView,
  isInvulnerableTo,
  type DamageStats,
  type Fighter,
  type FightState,
  type MultiplierLike,
  type StatIndex,
} from '../engine/index.js';
import { aiEnv, EXIT_PASSIVE_SPELL_ID, type AiEnv } from './env.js';

/** Estimation du jet : espérance (défaut) ou valeur du mode ``average`` du moteur (floor((min+max)/2)). */
export type RollEstimate = 'expected' | 'average';

export interface BoardOptions {
  /** Jet estimé (défaut : espérance). */
  roll?: RollEstimate;
  /** Critiques comptés en espérance (défaut vrai) ; faux = jamais de critique. */
  critExpectation?: boolean;
}

export const TEAM_PLAYERS = 0;
export const TEAM_MONSTERS = 1;
export const TEAM_SCENARIO = 2;

/** Parties immuables d'un plateau, partagées par toutes ses copies. */
export interface BoardStatic {
  readonly env: AiEnv;
  readonly state: FightState;
  readonly n: number;
  readonly fighters: readonly Fighter[];
  readonly team: Uint8Array;
  readonly camp: readonly Camp[];
  readonly isSummon: Uint8Array;
  /** Porte le passif de sortie des pics (30700). */
  readonly exitPassive: Uint8Array;
  /** Multiplicateurs 1163 actifs hors pics (aura 30390, sortie 30701). */
  readonly baseMults: ReadonlyArray<readonly MultiplierLike[]>;
  /** Entité de scénario (poseur des pics), −1 si absente. */
  readonly scenarioId: number;
  readonly roll: RollEstimate;
  readonly critExpectation: boolean;
}

const NO_MULTS: readonly MultiplierLike[] = [];
const ZERO_CASTER = new StatsView({ level: 200, isPlayer: false, hp: 1, maxHp: 1 });

/** Vue des caractéristiques d'un combattant du plateau (PV, érosion, bouclier et bonus du plateau). */
export class BoardView implements DamageStats {
  constructor(
    private readonly b: Board,
    private readonly i: number,
  ) {}

  get level(): number {
    return this.b.s.fighters[this.i]!.level;
  }

  get isPlayer(): boolean {
    return this.b.s.fighters[this.i]!.isPlayer;
  }

  get hp(): number {
    return this.b.hp[this.i]!;
  }

  get maxHp(): number {
    return this.b.maxHp(this.i);
  }

  get erodedHp(): number {
    return this.b.eroded[this.i]!;
  }

  get shield(): number {
    return this.b.shield[this.i]!;
  }

  stat(s: StatIndex): number {
    const f = this.b.s.fighters[this.i]!;
    let v = f.stat(s);
    if (s === Stat.FINAL_DAMAGE) v += this.b.df[this.i]!;
    else if (s === Stat.EROSION) v += this.b.ero[this.i]!;
    return v;
  }
}

export class Board {
  readonly s: BoardStatic;
  cell: Int16Array;
  hp: Float64Array;
  eroded: Float64Array;
  shield: Float64Array;
  alive: Uint8Array;
  inSpikes: Uint8Array;
  /** Multiplicateur d'aura des pics (%, 100 = aucun). */
  aura: Float64Array;
  /** Multiplicateur de sortie des pics (%, 100 = aucun). */
  exit: Float64Array;
  unshakable: Uint8Array;
  /** Dommages finaux acquis pendant la simulation (Patroolleur, Catastrooll). */
  df: Float64Array;
  /** Érosion acquise pendant la simulation (Aspiratrooll). */
  ero: Float64Array;
  /** Occupation : id + 1 par case. */
  occ: Int16Array;
  /** Dégâts subis par les pics (entrée, début de tour) pendant la simulation. */
  spikeDmg: Float64Array;
  /** Entrées dans les pics pendant la simulation. */
  entered: Uint8Array;
  /** Combattant qui joue (−1 : aucun), ses PA / PM, son nombre de tours commencés. */
  actor = -1;
  ap = 0;
  mp = 0;
  turnCount = 0;
  /** Compteurs de lancers de l'acteur, par sort (spellId). */
  recSpell: number[] = [];
  recTurnCasts: number[] = [];
  recLastTurn: number[] = [];
  recTargets: number[][] = [];
  /** Cumuls (maxStack) ajoutés pendant la simulation : paires (spellId, cible). */
  stackAdds: number[] = [];
  /** Prédicats d'occupation / de case libre sur ce plateau. */
  readonly isOccupied: CellPredicate;
  readonly isFree: CellPredicate;

  private constructor(s: BoardStatic, src: Board | null) {
    this.s = s;
    const n = s.n;
    this.cell = src ? src.cell.slice() : new Int16Array(n);
    this.hp = src ? src.hp.slice() : new Float64Array(n);
    this.eroded = src ? src.eroded.slice() : new Float64Array(n);
    this.shield = src ? src.shield.slice() : new Float64Array(n);
    this.alive = src ? src.alive.slice() : new Uint8Array(n);
    this.inSpikes = src ? src.inSpikes.slice() : new Uint8Array(n);
    this.aura = src ? src.aura.slice() : new Float64Array(n);
    this.exit = src ? src.exit.slice() : new Float64Array(n);
    this.unshakable = src ? src.unshakable.slice() : new Uint8Array(n);
    this.df = src ? src.df.slice() : new Float64Array(n);
    this.ero = src ? src.ero.slice() : new Float64Array(n);
    this.occ = src ? src.occ.slice() : new Int16Array(CELL_COUNT);
    this.spikeDmg = src ? src.spikeDmg.slice() : new Float64Array(n);
    this.entered = src ? src.entered.slice() : new Uint8Array(n);
    if (src) this.copyActor(src);
    const occ = this.occ;
    this.isOccupied = (c: number) => c >= 0 && c < CELL_COUNT && occ[c] !== 0;
    this.isFree = s.env.grid.freePredicate(this.isOccupied);
  }

  /** Plateau lu depuis l'état (qui n'est pas modifié). */
  static fromState(state: FightState, opts: BoardOptions = {}): Board {
    const env = aiEnv(state.ctx);
    const fighters = state.fighters;
    const n = fighters.length;
    const team = new Uint8Array(n);
    const isSummon = new Uint8Array(n);
    const exitPassive = new Uint8Array(n);
    const camp: Camp[] = [];
    const baseMults: MultiplierLike[][] = [];
    let scenarioId = -1;
    const aura = new Float64Array(n).fill(100);
    const exit = new Float64Array(n).fill(100);
    for (let i = 0; i < n; i++) {
      const f = fighters[i]!;
      team[i] = f.team === 'players' ? TEAM_PLAYERS : f.team === 'monsters' ? TEAM_MONSTERS : TEAM_SCENARIO;
      if (f.team === 'scenario' && scenarioId < 0) scenarioId = i;
      camp.push(f.camp);
      isSummon[i] = f.isSummon ? 1 : 0;
      let mults: MultiplierLike[] | null = null;
      for (const b of f.buffs) {
        if (b.spellId === EXIT_PASSIVE_SPELL_ID) exitPassive[i] = 1;
        if (!b.active || b.kind !== 'multiplier') continue;
        if (b.spellId === SPELL_IDS.spikes) aura[i] = Math.trunc((aura[i]! * b.value) / 100);
        else if (b.spellId === SPELL_IDS.spikesExit) exit[i] = Math.trunc((exit[i]! * b.value) / 100);
        else (mults ??= []).push({ value: b.value, triggers: b.triggers });
      }
      baseMults.push(mults ?? (NO_MULTS as MultiplierLike[]));
    }
    const s: BoardStatic = {
      env,
      state,
      n,
      fighters,
      team,
      camp,
      isSummon,
      exitPassive,
      baseMults,
      scenarioId,
      roll: opts.roll ?? 'expected',
      critExpectation: opts.critExpectation ?? true,
    };
    const b = new Board(s, null);
    const grid = env.grid;
    for (let i = 0; i < n; i++) {
      const f = fighters[i]!;
      const on = f.alive && f.cell >= 0;
      b.cell[i] = on ? f.cell : -1;
      b.alive[i] = f.alive ? 1 : 0;
      b.hp[i] = f.alive ? f.hp : 0;
      b.eroded[i] = f.erodedHp;
      b.shield[i] = f.alive ? f.shield : 0;
      b.inSpikes[i] = on && grid.isSpike(f.cell) ? 1 : 0;
      b.unshakable[i] = f.alive && !f.canBePushed ? 1 : 0;
    }
    b.aura.set(aura);
    b.exit.set(exit);
    b.occ.set(state.occupancy);
    return b;
  }

  /** Copie indépendante (parties immuables partagées). */
  clone(): Board {
    return new Board(this.s, this);
  }

  /** Recopie ``o`` dans ce plateau (même origine), sans allocation des tableaux. */
  copyFrom(o: Board): this {
    this.cell.set(o.cell);
    this.hp.set(o.hp);
    this.eroded.set(o.eroded);
    this.shield.set(o.shield);
    this.alive.set(o.alive);
    this.inSpikes.set(o.inSpikes);
    this.aura.set(o.aura);
    this.exit.set(o.exit);
    this.unshakable.set(o.unshakable);
    this.df.set(o.df);
    this.ero.set(o.ero);
    this.occ.set(o.occ);
    this.spikeDmg.set(o.spikeDmg);
    this.entered.set(o.entered);
    this.copyActor(o);
    return this;
  }

  private copyActor(o: Board): void {
    this.actor = o.actor;
    this.ap = o.ap;
    this.mp = o.mp;
    this.turnCount = o.turnCount;
    this.recSpell = o.recSpell.slice();
    this.recTurnCasts = o.recTurnCasts.slice();
    this.recLastTurn = o.recLastTurn.slice();
    this.recTargets = o.recTargets.map((t) => t.slice());
    this.stackAdds = o.stackAdds.slice();
  }

  // ------------------------------------------------------------------ lecture

  get env(): AiEnv {
    return this.s.env;
  }

  fighter(i: number): Fighter {
    return this.s.fighters[i]!;
  }

  view(i: number): BoardView {
    return new BoardView(this, i);
  }

  maxHp(i: number): number {
    const f = this.s.fighters[i]!;
    return f.maxHp + f.erodedHp - this.eroded[i]!;
  }

  isOn(i: number): boolean {
    return this.alive[i] === 1 && this.cell[i]! >= 0;
  }

  /** Ennemis l'un de l'autre (le scénario n'est l'ennemi de personne). */
  areEnemies(a: number, b: number): boolean {
    const ta = this.s.team[a]!;
    const tb = this.s.team[b]!;
    return ta !== tb && ta !== TEAM_SCENARIO && tb !== TEAM_SCENARIO;
  }

  areAllies(a: number, b: number): boolean {
    return this.s.team[a] === this.s.team[b] && this.s.team[a] !== TEAM_SCENARIO;
  }

  /** Occupant d'une case (−1 : libre). */
  at(cell: number): number {
    return cell >= 0 && cell < CELL_COUNT ? this.occ[cell]! - 1 : -1;
  }

  /** Multiplicateurs 1163 actifs du combattant ``i`` (hors pics + pics du plateau). */
  multipliers(i: number): readonly MultiplierLike[] {
    const base = this.s.baseMults[i]!;
    const a = this.aura[i]!;
    const x = this.exit[i]!;
    if (a === 100 && x === 100) return base;
    const env = this.s.env;
    const out = base.slice();
    if (a !== 100) out.push({ value: a, triggers: env.aura?.triggers ?? ['D'] });
    if (x !== 100) out.push({ value: x, triggers: env.exit?.triggers ?? ['D'] });
    return out;
  }

  /** Peut être poussé / attiré (plateau : Inébranlable acquis pendant la simulation). */
  canBePushed(i: number): boolean {
    return this.unshakable[i] === 0 && this.s.fighters[i]!.canBePushed;
  }

  // ------------------------------------------------------------------ acteur

  /**
   * Désigne le combattant qui joue. ``newTurn`` : début d'un nouveau tour (PA / PM pleins, compteurs par tour remis
   * à zéro, tour du lanceur + 1) ; sinon PA / PM et compteurs courants de l'état.
   */
  setActor(i: number, newTurn = false): void {
    const f = this.s.fighters[i]!;
    this.actor = i;
    this.ap = newTurn ? Math.max(0, f.maxAp) : f.ap;
    this.mp = newTurn ? Math.max(0, f.maxMp) : f.mp;
    this.turnCount = f.turnCount + (newTurn ? 1 : 0);
    this.recSpell = [];
    this.recTurnCasts = [];
    this.recLastTurn = [];
    this.recTargets = [];
    for (const r of f.casts) {
      this.recSpell.push(r.spellId);
      this.recTurnCasts.push(newTurn ? 0 : r.turnCasts);
      this.recLastTurn.push(r.lastTurn);
      this.recTargets.push(newTurn ? [] : r.targets.slice());
    }
  }

  /** Index du compteur de lancers du sort pour l'acteur (−1 : jamais lancé). */
  recIndex(spellId: number): number {
    return this.recSpell.indexOf(spellId);
  }

  /** Enregistre un lancer de l'acteur (compteurs par tour, par cible, dernier tour). */
  recordCast(spellId: number, targetId: number): void {
    let k = this.recIndex(spellId);
    if (k < 0) {
      this.recSpell.push(spellId);
      this.recTurnCasts.push(0);
      this.recLastTurn.push(-1);
      this.recTargets.push([]);
      k = this.recSpell.length - 1;
    }
    this.recTurnCasts[k]!++;
    this.recLastTurn[k] = this.turnCount;
    if (targetId >= 0) this.recTargets[k]!.push(targetId);
  }

  addedStacks(spellId: number, target: number): number {
    let n = 0;
    for (let k = 0; k < this.stackAdds.length; k += 2) if (this.stackAdds[k] === spellId && this.stackAdds[k + 1] === target) n++;
    return n;
  }

  // ------------------------------------------------------------------ déplacements

  /** Déplace un combattant (occupation seulement). */
  place(i: number, to: number): void {
    const from = this.cell[i]!;
    if (from >= 0 && this.occ[from] === i + 1) this.occ[from] = 0;
    this.cell[i] = to;
    if (to >= 0 && this.alive[i]) this.occ[to] = i + 1;
  }

  /** Retire un mort du plateau. */
  kill(i: number): void {
    const c = this.cell[i]!;
    if (c >= 0 && this.occ[c] === i + 1) this.occ[c] = 0;
    this.alive[i] = 0;
    this.hp[i] = 0;
    this.cell[i] = -1;
  }

  /**
   * Marche de l'acteur (ou d'un autre) le long de ``path`` (cases successives, départ exclu) : entrées / sorties des
   * pics à chaque pas si ``spikes.triggerWhenWalkingThrough`` (sinon seulement à l'arrivée), arrêt dans les pics si
   * ``spikes.walkThroughInterruptsMovement``. Renvoie le nombre de pas faits (PM dépensés pour l'acteur).
   */
  walk(i: number, path: readonly number[]): number {
    const cfg = this.s.env.config.spikes;
    const grid = this.s.env.grid;
    let steps = 0;
    for (let k = 0; k < path.length; k++) {
      if (!this.alive[i]) break;
      const from = this.cell[i]!;
      const to = path[k]!;
      this.place(i, to);
      steps++;
      const last = k === path.length - 1;
      if (cfg.triggerWhenWalkingThrough || last) {
        const enteredNow = this.arrive(i, from, to);
        if (enteredNow && !last && cfg.walkThroughInterruptsMovement) break;
      } else if (grid.isSpike(from) !== grid.isSpike(to)) {
        // traversée sans déclenchement : l'état « dans les pics » suit la case
        this.inSpikes[i] = grid.isSpike(to) ? 1 : 0;
      }
    }
    if (i === this.actor) this.mp = Math.max(0, this.mp - steps);
    return steps;
  }

  /**
   * Arrivée de ``i`` sur ``to`` depuis ``from`` : transitions des pics (voir l'en-tête). Renvoie vrai si le
   * combattant vient d'entrer dans les pics.
   */
  arrive(i: number, from: number, to: number): boolean {
    if (!this.alive[i] || to < 0) return false;
    const env = this.s.env;
    const grid = env.grid;
    const wasIn = this.inSpikes[i] === 1;
    const nowIn = grid.isSpike(to);
    if (wasIn && !nowIn) {
      this.inSpikes[i] = 0;
      this.aura[i] = 100;
      if (this.s.exitPassive[i] && env.exit) this.exit[i] = env.exit.value;
      return false;
    }
    if (!wasIn && nowIn) {
      this.enterSpikes(i);
      return true;
    }
    if (wasIn && nowIn && from !== to && env.config.spikes.retriggerOnMoveInside) {
      this.aura[i] = 100;
      this.enterSpikes(i);
      return true;
    }
    return false;
  }

  private enterSpikes(i: number): void {
    const env = this.s.env;
    if (!env.config.spikes.stackExitAndInside) this.exit[i] = 100;
    const camp = this.s.camp[i]!;
    const raw = env.entryRaw[camp] ?? 0;
    if (raw > 0) this.glyphDamage(i, raw);
    this.inSpikes[i] = 1;
    this.entered[i] = 1;
    if (this.alive[i] && env.aura && (env.aura.camp === null || env.aura.camp === camp)) {
      this.aura[i] = Math.trunc((this.aura[i]! * env.aura.value) / 100);
    }
  }

  /** Dégâts de glyphe (pics) lancés par l'entité de scénario : réception complète, comptés dans ``spikeDmg``. */
  glyphDamage(i: number, rawRoll: number): number {
    const sc = this.s.scenarioId;
    const caster: DamageStats = sc >= 0 ? this.view(sc) : ZERO_CASTER;
    const raw = senderDamage(rawRoll, 100, caster);
    const f = this.s.fighters[i]!;
    const src = sc >= 0 ? this.s.fighters[sc]! : f;
    const inv = sc >= 0 ? isInvulnerableTo(f, src, { melee: false, element: 0, collision: false, critical: false }) : false;
    const res = receiveDamage(raw, 100, caster, this.view(i), {
      melee: false,
      multipliers: this.multipliers(i),
      invulnerable: inv,
      glyph: true,
    });
    const loss = this.applyLoss(i, res.lifeLoss, res.shieldAbsorbed, res.eroded);
    this.spikeDmg[i] += loss;
    return loss;
  }

  /** Applique une perte de PV (et de bouclier, d'érosion) ; mort à PV ≤ 0. Renvoie les PV perdus. */
  applyLoss(i: number, lifeLoss: number, shieldAbsorbed: number, eroded: number): number {
    if (!this.alive[i]) return 0;
    const loss = Math.min(lifeLoss, Math.max(0, this.hp[i]!));
    this.shield[i] = Math.max(0, this.shield[i]! - shieldAbsorbed);
    this.hp[i] -= lifeLoss;
    this.eroded[i] += eroded;
    if (this.hp[i]! <= 0.5) this.kill(i);
    return loss;
  }

  /** Soin plafonné aux PV manquants ; renvoie les PV rendus. */
  applyHeal(i: number, amount: number): number {
    if (!this.alive[i] || amount <= 0) return 0;
    const v = Math.max(0, Math.min(amount, this.maxHp(i) - this.hp[i]!));
    this.hp[i] += v;
    return v;
  }

  /**
   * Début de tour de ``i`` (estimation de menace) : glyphe de début de tour s'il est dans les pics (la vulnérabilité
   * de sortie, posée par lui-même, a expiré au décompte qui précède), puis acteur au début d'un nouveau tour.
   */
  startTurn(i: number): void {
    if (!this.isOn(i)) return;
    this.exit[i] = 100;
    if (this.inSpikes[i]) {
      const raw = this.s.env.turnStartRaw[this.s.camp[i]!] ?? 0;
      if (raw > 0) this.glyphDamage(i, raw);
    }
    if (this.alive[i]) this.setActor(i, true);
  }
}
