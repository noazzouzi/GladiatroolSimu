/**
 * Combattant : identité (équipe, camp, archétype ou monstre), position, PV / érosion / boucliers, caractéristiques
 * (base + buffs), PA / PM, états, buffs, grimoire et historique des lancers. Clonage explicite et rapide.
 *
 * Équipes : 'players' (camp Atq), 'monsters' (camp Def), 'scenario' (camp Sce : entité invisible qui lance les
 * glyphes, objectifs et managers ; hypothèse Q36). Une invocation hérite de l'équipe et du camp de son invocateur.
 */
import type { ArchetypeData, ArchetypeKey, Camp, FighterStatsData, MonsterData } from '../data/index.js';
import type { Buff } from './buffs.js';
import type { EngineContext } from './context.js';
import type { DamageStats } from './formulas.js';
import { baseStatsFromData, Stat, STAT_COUNT, type StatIndex } from './stats.js';

export type Team = 'players' | 'monsters' | 'scenario';
export type FighterKind = 'archetype' | 'monster' | 'scenario';

export const CAMP_OF_TEAM: Readonly<Record<Team, Camp>> = { players: 'Atq', monsters: 'Def', scenario: 'Sce' };

/** Drapeaux de monstre (DofusDB) : bits de ``Fighter.flags``. */
export const FLAG_CAN_BE_PUSHED = 1;
export const FLAG_CAN_SWITCH_POS = 2;
export const FLAG_CAN_TACKLE = 4;
export const FLAG_CAN_PLAY = 8;
export const FLAG_CAN_BE_CARRIED = 16;
export const FLAG_CAN_SWITCH_POS_ON_TARGET = 32;
export const DEFAULT_FLAGS =
  FLAG_CAN_BE_PUSHED | FLAG_CAN_SWITCH_POS | FLAG_CAN_TACKLE | FLAG_CAN_PLAY | FLAG_CAN_BE_CARRIED | FLAG_CAN_SWITCH_POS_ON_TARGET;

/** Effets d'état DOFUS (bits de ``Fighter.stateMask``, N70 §5.6). */
export const SE_UNSHAKABLE = 0;
export const SE_CANT_BE_TACKLED = 1;
export const SE_CANT_TACKLE = 2;
export const SE_ROOTED = 3;
export const SE_CANT_BE_CARRIED = 4;
export const SE_INCURABLE = 5;
export const SE_PACIFIST = 6;
export const SE_INVULNERABLE = 7;
export const SE_NO_SWITCH = 18;
export const SE_INVULNERABLE_MELEE = 19;
export const SE_INVULNERABLE_RANGED = 20;
/** 21-25 : invulnérable Feu / Air / Eau / Terre / Neutre. */
export const SE_INVULNERABLE_FIRE = 21;
export const SE_INVULNERABLE_AIR = 22;
export const SE_INVULNERABLE_WATER = 23;
export const SE_INVULNERABLE_EARTH = 24;
export const SE_INVULNERABLE_NEUTRAL = 25;
export const SE_INVULNERABLE_PUSH = 26;
export const SE_INVULNERABLE_CRIT = 27;
export const SE_INVULNERABLE_WEAPON = 28;
export const SE_INVULNERABLE_SUMMONS = 31;

/** Sort du grimoire. */
export interface SpellSlot {
  readonly spellLevelId: number;
  readonly spellId: number;
  /** Emplacement 0-7 de l'archétype, −1 pour un sort hors emplacement (unique, temporaire, monstre). */
  readonly slot: number;
  /** Niveau amélioré (famille 'upgraded'). */
  readonly upgraded: boolean;
  /** Sort unique (à usage unique : il s'oublie lui-même par 3406). */
  readonly unique: boolean;
  /** Tour global où le sort a été appris (−1 : dès le départ). */
  readonly learnedTurn: number;
  /** Appris pendant le tour n° ``learnedDuring`` de ce combattant (``spells.newSpellUsableSameTurn``), sinon absent. */
  readonly learnedDuring?: number;
}

/** Historique des lancers d'un sort (par spellId, comme le client). */
export class CastRecord {
  spellId: number;
  /** Lancers pendant le tour courant du lanceur. */
  turnCasts = 0;
  /** ``turnCount`` du lanceur lors du dernier lancer (−1 : jamais). */
  lastTurn = -1;
  /** Cibles (ids) des lancers du tour courant, avec répétitions. */
  targets: number[] = [];

  constructor(spellId: number) {
    this.spellId = spellId;
  }

  clone(): CastRecord {
    const r = new CastRecord(this.spellId);
    r.turnCasts = this.turnCasts;
    r.lastTurn = this.lastTurn;
    r.targets = this.targets.slice();
    return r;
  }

  castsOn(targetId: number): number {
    let n = 0;
    for (const t of this.targets) if (t === targetId) n++;
    return n;
  }
}

/** Tableaux partagés par défaut (jamais modifiés : ``createFighter`` alloue les siens). */
const EMPTY_STATS = new Int32Array(STAT_COUNT);
const ZERO_BONUS: number[] = new Array<number>(STAT_COUNT).fill(0);

export class Fighter implements DamageStats {
  id = -1;
  name = '';
  team: Team = 'monsters';
  camp: Camp = 'Def';
  kind: FighterKind = 'monster';
  archetype: ArchetypeKey | null = null;
  /** Id de monstre (7980 pour le corps des joueurs, 0 pour l'entité de scénario). */
  monsterId = 0;
  level = 200;
  /** Personnage joueur (plafond de résistance 50 %). */
  isPlayer = false;
  summonerId = -1;
  /** Case courante (−1 : hors carte ou mort). */
  cell = -1;
  /** Case de la mort (résurrection, zones 'A'). */
  deathCell = -1;
  /** Ordre des morts (uid de l'état au moment de la mort, 0 = jamais mort) : « dernier allié mort » (147). */
  deathSeq = 0;
  alive = true;
  hp = 1;
  /** PV max de base (hors vitalité et érosion). */
  baseMaxHp = 1;
  erodedHp = 0;
  /** Caractéristiques de base (partagées entre clones : copie à l'écriture via ``setBaseStat``). */
  base: Int32Array = EMPTY_STATS;
  private baseShared = true;
  /**
   * Somme des buffs de caractéristique actifs (tableau ordinaire de STAT_COUNT entiers : bien plus rapide à copier
   * qu'un petit tableau typé, ce qui compte pour le clonage).
   */
  bonus: number[] = ZERO_BONUS;
  apUsed = 0;
  mpUsed = 0;
  buffs: Buff[] = [];
  /** États effectifs (actifs et non désactivés). */
  states: number[] = [];
  /** Masque des effets d'état des états effectifs. */
  stateMask = 0;
  spells: SpellSlot[] = [];
  casts: CastRecord[] = [];
  /** Nombre de tours commencés par ce combattant (incrémenté par ``startTurn``, turns.ts). */
  turnCount = 0;
  /** Durée du tour en cours (s) : dernier effet 3407 actif au début du tour (60, 10 après Pense Vite), 0 = inconnue. */
  turnSeconds = 0;
  /** Invocation à durée de vie limitée : tours de l'invocateur restants (−1 : illimitée). */
  lifetimeLeft = -1;
  flags = DEFAULT_FLAGS;
  startingSpellLevelId = 0;
  /** Données sources (partagées). */
  monster: MonsterData | null = null;
  archetypeData: ArchetypeData | null = null;
  /** Ordre d'apparition (timeline). */
  spawnOrder = 0;

  // ------------------------------------------------------------------ caractéristiques

  stat(i: StatIndex): number {
    return this.base[i]! + this.bonus[i]!;
  }

  /** Marque ``base`` comme propre à ce combattant (après allocation). */
  setOwnBase(): void {
    this.baseShared = false;
  }

  setBaseStat(i: StatIndex, v: number): void {
    if (this.baseShared) {
      this.base = this.base.slice();
      this.baseShared = false;
    }
    this.base[i] = v;
  }

  get maxHp(): number {
    return this.baseMaxHp + this.stat(Stat.VITALITY) - this.erodedHp;
  }

  /** Total des boucliers actifs. */
  get shield(): number {
    let s = 0;
    for (const b of this.buffs) if (b.active && b.kind === 'shield') s += b.value;
    return s;
  }

  get maxAp(): number {
    return this.stat(Stat.AP);
  }

  get maxMp(): number {
    return this.stat(Stat.MP);
  }

  /** PA disponibles (max − utilisés, ≥ 0). */
  get ap(): number {
    return Math.max(0, this.stat(Stat.AP) - this.apUsed);
  }

  /** PM disponibles. */
  get mp(): number {
    return Math.max(0, this.stat(Stat.MP) - this.mpUsed);
  }

  get range(): number {
    return this.stat(Stat.RANGE);
  }

  /** % de PV (0-100, flottant). */
  get hpPercent(): number {
    return this.maxHp > 0 ? (this.hp * 100) / this.maxHp : 0;
  }

  get isSummon(): boolean {
    return this.summonerId >= 0;
  }

  /** Placé sur la carte et vivant. */
  get onMap(): boolean {
    return this.alive && this.cell >= 0;
  }

  // ------------------------------------------------------------------ états

  hasState(stateId: number): boolean {
    return this.states.includes(stateId);
  }

  hasStateEffect(n: number): boolean {
    return (this.stateMask & (1 << n)) !== 0;
  }

  get rooted(): boolean {
    return this.hasStateEffect(SE_ROOTED);
  }

  get unshakable(): boolean {
    return this.hasStateEffect(SE_UNSHAKABLE);
  }

  get invulnerable(): boolean {
    return this.hasStateEffect(SE_INVULNERABLE);
  }

  get pacifist(): boolean {
    return this.hasStateEffect(SE_PACIFIST);
  }

  get incurable(): boolean {
    return this.hasStateEffect(SE_INCURABLE);
  }

  /** ``HaxeFighter.canBePushed`` : ni Inébranlable, ni Enraciné, drapeau de monstre canBePushed. */
  get canBePushed(): boolean {
    return (this.flags & FLAG_CAN_BE_PUSHED) !== 0 && !this.unshakable && !this.rooted;
  }

  /** Peut être échangé : ni Enraciné, ni « pas d'échange » (18), drapeau canSwitchPos. */
  get canSwitch(): boolean {
    return (this.flags & FLAG_CAN_SWITCH_POS) !== 0 && !this.rooted && !this.hasStateEffect(SE_NO_SWITCH);
  }

  // ------------------------------------------------------------------ grimoire et lancers

  knowsSpell(spellLevelId: number): boolean {
    for (const s of this.spells) if (s.spellLevelId === spellLevelId) return true;
    return false;
  }

  castRecord(spellId: number): CastRecord | null {
    for (const r of this.casts) if (r.spellId === spellId) return r;
    return null;
  }

  castRecordOrCreate(spellId: number): CastRecord {
    let r = this.castRecord(spellId);
    if (!r) {
      r = new CastRecord(spellId);
      this.casts.push(r);
    }
    return r;
  }

  /** Remise à zéro des compteurs de lancers par tour (fin de tour). */
  resetCastCounters(): void {
    for (const r of this.casts) {
      r.turnCasts = 0;
      if (r.targets.length) r.targets = [];
    }
  }

  /** Restauration des PA et PM (début de tour). */
  restoreApMp(): void {
    this.apUsed = 0;
    this.mpUsed = 0;
  }

  // ------------------------------------------------------------------ clonage

  clone(): Fighter {
    const f = new Fighter();
    f.id = this.id;
    f.name = this.name;
    f.team = this.team;
    f.camp = this.camp;
    f.kind = this.kind;
    f.archetype = this.archetype;
    f.monsterId = this.monsterId;
    f.level = this.level;
    f.isPlayer = this.isPlayer;
    f.summonerId = this.summonerId;
    f.cell = this.cell;
    f.deathCell = this.deathCell;
    f.deathSeq = this.deathSeq;
    f.alive = this.alive;
    f.hp = this.hp;
    f.baseMaxHp = this.baseMaxHp;
    f.erodedHp = this.erodedHp;
    f.base = this.base;
    f.baseShared = true;
    this.baseShared = true;
    f.bonus = this.bonus.slice();
    f.apUsed = this.apUsed;
    f.mpUsed = this.mpUsed;
    const n = this.buffs.length;
    const buffs = new Array<Buff>(n);
    for (let i = 0; i < n; i++) buffs[i] = this.buffs[i]!.clone();
    f.buffs = buffs;
    f.states = this.states.slice();
    f.stateMask = this.stateMask;
    f.spells = this.spells.slice();
    f.casts = this.casts.map((r) => r.clone());
    f.turnCount = this.turnCount;
    f.turnSeconds = this.turnSeconds;
    f.lifetimeLeft = this.lifetimeLeft;
    f.flags = this.flags;
    f.startingSpellLevelId = this.startingSpellLevelId;
    f.monster = this.monster;
    f.archetypeData = this.archetypeData;
    f.spawnOrder = this.spawnOrder;
    return f;
  }
}

// ---------------------------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------------------------

export type FighterSpec =
  | {
      kind: 'archetype';
      archetype: ArchetypeKey;
      name?: string;
      /** Niveaux de sort du grimoire (défaut : sort commun + sort de départ). 'all' = les 8 emplacements. */
      spells?: number[] | 'all';
      team?: Team;
    }
  | {
      kind: 'monster';
      monsterId: number;
      name?: string;
      spells?: number[];
      team?: Team;
      summonerId?: number;
    }
  | { kind: 'scenario'; name?: string }
  | {
      /** Combattant de test : fiche de caractéristiques libre. */
      kind: 'custom';
      name?: string;
      team: Team;
      stats: Partial<FighterStatsData>;
      isPlayer?: boolean;
      spells?: number[];
      monsterId?: number;
    };

const ZERO_STATS: FighterStatsData = {
  level: 200,
  hp: 1,
  ap: 0,
  mp: 0,
  rangeBonus: 0,
  strength: 0,
  intelligence: 0,
  chance: 0,
  agility: 0,
  power: 0,
  critPct: 0,
  critDamage: 0,
  pushDamage: 0,
  pushResist: 0,
  resPct: { neutral: 0, earth: 0, fire: 0, water: 0, air: 0 },
  resPctMelee: 0,
  resPctRanged: 0,
  dodgeAp: 0,
  dodgeMp: 0,
  tackle: 0,
  flee: 0,
  erosionPct: 10,
};

function monsterFlags(m: MonsterData): number {
  let f = 0;
  if (m.flags.canBePushed) f |= FLAG_CAN_BE_PUSHED;
  if (m.flags.canSwitchPos) f |= FLAG_CAN_SWITCH_POS;
  if (m.flags.canTackle) f |= FLAG_CAN_TACKLE;
  if (m.flags.canPlay) f |= FLAG_CAN_PLAY;
  if (m.flags.canBeCarried) f |= FLAG_CAN_BE_CARRIED;
  if (m.flags.canSwitchPosOnTarget) f |= FLAG_CAN_SWITCH_POS_ON_TARGET;
  return f;
}

function slotOf(ctx: EngineContext, spellLevelId: number, learnedTurn: number, a: ArchetypeData | null): SpellSlot {
  const lvl = ctx.data.spells[String(spellLevelId)];
  if (!lvl) throw new Error(`Niveau de sort inconnu : ${spellLevelId}`);
  let slot = -1;
  if (a) {
    const base = ctx.upgradeBase.get(spellLevelId) ?? spellLevelId;
    const s = a.spellSlots.find((x) => x.spellLevelId === base);
    if (s) slot = s.slot;
  }
  return {
    spellLevelId,
    spellId: lvl.spellId,
    slot,
    upgraded: lvl.family === 'upgraded',
    unique: lvl.family === 'unique',
    learnedTurn,
  };
}

/** Emplacement du grimoire pour un niveau de sort (emplacement d'archétype déduit des améliorations). */
export function makeSpellSlot(ctx: EngineContext, fighter: Fighter, spellLevelId: number, learnedTurn: number): SpellSlot {
  return slotOf(ctx, spellLevelId, learnedTurn, fighter.archetypeData);
}

/**
 * Crée un combattant (sans le placer : voir ``addFighter`` de state.ts).
 * Archétype : fiche ``baseStats``, PV selon ``archetypes.hpMode``, Puissance du Dompteur = ``archetypes.dompteurPower``
 * (le passif 30639 n'a donc pas à réappliquer ses effets 125 / 153 / 138 : les filtrer au lancement du sort de départ).
 */
export function createFighter(ctx: EngineContext, spec: FighterSpec): Fighter {
  const f = new Fighter();
  let stats: FighterStatsData;
  let spells: number[] = [];
  switch (spec.kind) {
    case 'archetype': {
      const a = ctx.data.archetypes[spec.archetype];
      if (!a) throw new Error(`Archétype inconnu : ${spec.archetype}`);
      stats = a.baseStats;
      f.kind = 'archetype';
      f.archetype = spec.archetype;
      f.archetypeData = a;
      f.team = spec.team ?? 'players';
      f.monsterId = a.body.monsterId;
      f.monster = ctx.data.monsters[String(a.body.monsterId)] ?? null;
      f.isPlayer = true;
      f.name = spec.name ?? a.displayName;
      f.startingSpellLevelId = a.body.startingSpellLevel;
      if (spec.spells === 'all') spells = a.spellSlots.map((s) => s.spellLevelId);
      else spells = spec.spells ?? [a.commonSpell, a.startingSpell];
      break;
    }
    case 'monster': {
      const m = ctx.data.monsters[String(spec.monsterId)];
      if (!m) throw new Error(`Monstre inconnu : ${spec.monsterId}`);
      stats = m.stats;
      f.kind = 'monster';
      f.monster = m;
      f.monsterId = m.id;
      f.team = spec.team ?? 'monsters';
      f.name = spec.name ?? m.name;
      f.flags = monsterFlags(m);
      f.startingSpellLevelId = m.startingSpellLevel;
      f.summonerId = spec.summonerId ?? -1;
      spells = spec.spells ?? m.spells.slice();
      break;
    }
    case 'scenario':
      stats = ZERO_STATS;
      f.kind = 'scenario';
      f.team = 'scenario';
      f.name = spec.name ?? 'Scénario';
      f.flags = 0;
      break;
    case 'custom':
      stats = { ...ZERO_STATS, ...spec.stats, resPct: { ...ZERO_STATS.resPct, ...(spec.stats.resPct ?? {}) } };
      f.kind = spec.isPlayer ? 'archetype' : 'monster';
      f.team = spec.team;
      f.isPlayer = spec.isPlayer ?? false;
      f.name = spec.name ?? 'Combattant';
      f.monsterId = spec.monsterId ?? 0;
      spells = spec.spells ?? [];
      break;
  }
  f.camp = CAMP_OF_TEAM[f.team];
  f.level = stats.level;
  f.base = baseStatsFromData(stats, new Int32Array(STAT_COUNT));
  f.setOwnBase();
  f.bonus = new Array<number>(STAT_COUNT).fill(0);
  let hp = stats.hp;
  if (spec.kind === 'archetype') {
    const a = f.archetypeData!;
    hp = a.hpByMode[ctx.config.archetypes.hpMode];
    if (spec.archetype === 'dompteur') f.setBaseStat(Stat.POWER, f.base[Stat.POWER]! + ctx.config.archetypes.dompteurPower);
  }
  f.baseMaxHp = hp;
  f.hp = hp;
  f.spells = spells.map((id) => slotOf(ctx, id, -1, f.archetypeData));
  return f;
}
