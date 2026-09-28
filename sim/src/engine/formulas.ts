/**
 * Formules pures de dégâts, soins, boucliers et multiplicateurs : port exact de tools/mechanics/damage.py
 * (``DamageSender`` / ``DamageReceiver`` du client DOFUS 2.73.3, identiques dans le portage C# de DOFUS 3).
 * ETUDE §9.5-§9.8, research/notes/70_formules_dofus.md §4.
 *
 * Arrondis : chaque multiplication est tronquée (``int()`` Python = Math.trunc), avec les MÊMES expressions
 * flottantes que la référence (ex. ``d * ((100 + bonus) * 0.01)``) pour obtenir des résultats identiques au bit près.
 * Seule différence assumée : la dégressivité de zone est appliquée en entier, ``trunc(d × (100 − malus) / 100)``
 * (formule du client citée par N70 §3.3), au lieu du coefficient flottant de ``compute_hit``.
 *
 * Aucune dépendance à l'état de combat : les caractéristiques sont lues via l'interface ``DamageStats`` (implémentée
 * par ``Fighter`` et par ``StatsView`` pour les tests).
 */
import {
  EL_AIR,
  EL_BEST,
  EL_EARTH,
  EL_FIRE,
  EL_NEUTRAL,
  EL_WATER,
  EL_WORST,
  Stat,
  elementOfAction,
  mainStatOfElement,
  type StatIndex,
} from './stats.js';

// ---------------------------------------------------------------------------------------------
// Classification des actions (ActionIdHelper, client 2.73)
// ---------------------------------------------------------------------------------------------

export const CASTER_LIFE_PERCENT: ReadonlySet<number> = new Set([85, 86, 87, 88, 89, 90, 671]);
export const CASTER_LIFE_MISSING: ReadonlySet<number> = new Set([275, 276, 277, 278, 279]);
export const CASTER_ERODED_LIFE: ReadonlySet<number> = new Set([1118, 1119, 1120, 1121, 1122]);
export const CASTER_MIDLIFE: ReadonlySet<number> = new Set([672]);
export const TARGET_LIFE_PERCENT: ReadonlySet<number> = new Set([1067, 1068, 1069, 1070, 1071, 1048]);
export const TARGET_MAX_LIFE: ReadonlySet<number> = new Set([1109]);
export const TARGET_ERODED_LIFE: ReadonlySet<number> = new Set([1092, 1093, 1094, 1095, 1096]);
export const SPLASH_FINAL: ReadonlySet<number> = new Set([1223, 1224, 1225, 1226, 1227, 1228]);
export const SPLASH_RAW: ReadonlySet<number> = new Set([1123, 1124, 1125, 1126, 1127, 1128]);
export const SPLASH_HEAL: ReadonlySet<number> = new Set([2020, 2973]);
export const LIFE_STEAL: ReadonlySet<number> = new Set([82, 91, 92, 93, 94, 95, 2828, 2890]);
export const HEAL_ACTIONS: ReadonlySet<number> = new Set([
  81, 90, 108, 143, 407, 786, 1037, 1109, 2020, 2973, 2998, 2999, 3000, 3001, 3002,
]);
export const SHIELD_ACTIONS: ReadonlySet<number> = new Set([1020, 1039, 1040]);
/** Faux dommages : pas d'absorption par le bouclier ni de dégressivité (90, 1047, 1048). */
export const FAKE_DAMAGE: ReadonlySet<number> = new Set([90, 1047, 1048]);
export const NOT_BOOSTABLE_EXPLICIT: ReadonlySet<number> = new Set([80, 82, 144, 1063, 1064, 1065, 1066]);
/** Soins non multipliés par les soins finaux du lanceur. */
export const DEALT_HEAL_MULT_NOT_APPLICABLE: ReadonlySet<number> = new Set([90, 407, 1109, 2020, 2973]);
/** Action « dommages de poussée » du client. */
export const PUSH_DAMAGE_ACTION = 80;

export function isBasedOnCasterLife(a: number): boolean {
  return CASTER_LIFE_PERCENT.has(a) || CASTER_LIFE_MISSING.has(a) || CASTER_ERODED_LIFE.has(a) || CASTER_MIDLIFE.has(a);
}

export function isBasedOnTargetLife(a: number): boolean {
  return TARGET_LIFE_PERCENT.has(a) || TARGET_MAX_LIFE.has(a) || TARGET_ERODED_LIFE.has(a);
}

export function isSplash(a: number): boolean {
  return SPLASH_FINAL.has(a) || SPLASH_RAW.has(a) || SPLASH_HEAL.has(a);
}

/** ``ActionIdHelper.isBoostable`` : carac, Puissance, Dommages et multiplicateurs infligés s'appliquent. */
export function isBoostable(a: number): boolean {
  if (NOT_BOOSTABLE_EXPLICIT.has(a)) return false;
  return !(isBasedOnCasterLife(a) || isBasedOnTargetLife(a) || isSplash(a));
}

export function isHealAction(a: number): boolean {
  return HEAL_ACTIONS.has(a);
}

// ---------------------------------------------------------------------------------------------
// Caractéristiques lues par les formules
// ---------------------------------------------------------------------------------------------

/** Vue minimale d'un combattant pour les formules (voir ``StatsView`` et ``Fighter``). */
export interface DamageStats {
  readonly level: number;
  /** Plafond de résistance % : 50 pour un personnage joueur (HUMAN), 100 sinon. */
  readonly isPlayer: boolean;
  readonly hp: number;
  readonly maxHp: number;
  /** PV max perdus par érosion. */
  readonly erodedHp: number;
  /** Total des boucliers actifs. */
  readonly shield: number;
  /** Valeur effective d'une caractéristique (base + bonus). */
  stat(i: StatIndex): number;
}

/** Implémentation autonome (tests, fixtures) : caractéristiques à plat. */
export class StatsView implements DamageStats {
  level = 200;
  isPlayer = true;
  hp = 10000;
  maxHp = 10000;
  erodedHp = 0;
  shield = 0;
  readonly values: Int32Array;

  constructor(init: Partial<Omit<StatsView, 'values' | 'stat' | 'set'>> = {}, stats: Partial<Record<StatIndex, number>> = {}) {
    Object.assign(this, init);
    this.values = new Int32Array(64);
    this.values[Stat.EROSION] = 10;
    for (const [k, v] of Object.entries(stats)) this.values[Number(k)] = v as number;
  }

  stat(i: StatIndex): number {
    return this.values[i]!;
  }

  set(i: StatIndex, v: number): this {
    this.values[i] = v;
    return this;
  }
}

function bestElement(s: DamageStats): number {
  // ordre du dictionnaire Python (terre, feu, eau, air) : premier maximum
  let best = EL_EARTH;
  let v = s.stat(Stat.STRENGTH);
  const cand: Array<[number, number]> = [
    [EL_FIRE, s.stat(Stat.INTELLIGENCE)],
    [EL_WATER, s.stat(Stat.CHANCE)],
    [EL_AIR, s.stat(Stat.AGILITY)],
  ];
  for (const [e, x] of cand) {
    if (x > v) {
      v = x;
      best = e;
    }
  }
  return best;
}

/** Élément effectif d'une action pour un lanceur (6 = meilleur élément, 7 = pire : traité comme −1). */
export function effectiveElement(actionId: number, caster: DamageStats, fallback = -1): number {
  let el = elementOfAction(actionId);
  if (el === -1) el = fallback;
  if (el === EL_BEST) el = bestElement(caster);
  if (el === EL_WORST) el = -1;
  return el;
}

function mainStat(s: DamageStats, el: number): number {
  const i = mainStatOfElement(el);
  return i === -1 ? 0 : s.stat(i);
}

function elemIndex(el: number): number {
  return el >= EL_NEUTRAL && el <= EL_AIR ? el : -1;
}

/** ``HaxeFighter.getElementMainResist`` : (rés. élément + rés. toutes) plafonnée (50 joueur / 100 sinon). */
export function resistPct(s: DamageStats, el: number): number {
  const cap = s.isPlayer ? 50 : 100;
  const i = elemIndex(el);
  let r = i === -1 ? 0 : s.stat((Stat.RES_NEUTRAL + i) as StatIndex);
  r += s.stat(Stat.RES_ALL);
  return Math.round(Math.min(r, cap));
}

export function resistFix(s: DamageStats, el: number): number {
  const i = elemIndex(el);
  return i === -1 ? 0 : s.stat((Stat.RESFIX_NEUTRAL + i) as StatIndex);
}

function elemDamage(s: DamageStats, el: number): number {
  const i = elemIndex(el);
  return i === -1 ? 0 : s.stat((Stat.ELEMDMG_NEUTRAL + i) as StatIndex);
}

/** Multiplicateur de dommages finaux infligés (100 = neutre) : 100 + Σ1171 − Σ1172. */
export function finalDamageOf(s: DamageStats): number {
  return 100 + s.stat(Stat.FINAL_DAMAGE);
}

/** Multiplicateur de soins finaux (100 = neutre) : 100 + Σ2971. */
export function finalHealOf(s: DamageStats): number {
  return 100 + s.stat(Stat.FINAL_HEAL);
}

// ---------------------------------------------------------------------------------------------
// Côté lanceur (DamageSender.getTotalDamage)
// ---------------------------------------------------------------------------------------------

export interface SenderOptions {
  /** L'effet appartient à la liste critique (ajoute les Dommages critiques). */
  criticalEffect?: boolean;
  /** Somme des effets 293 « +#3 dégâts de base » actifs sur ce sort. */
  baseDamageBonus?: number;
  /** Modificateurs « dommages fixes » du sort. */
  flatDamageBonus?: number;
  /** Élément à utiliser si l'action n'en a pas dans la table du client (−1 = aucun). */
  fallbackElement?: number;
}

/**
 * ``DamageSender.getTotalDamage`` pour un jet (valeur entière avant réception).
 * Boostables : d = trunc((jet + bonus 293) × (100 + max(0, carac + Puissance)) / 100) + Dommages (+ critiques) ;
 * soins boostables : sans Puissance, + Soins. % PV du lanceur (85-90, 671), % PV manquants (275-279), % PV érodés
 * du lanceur (1118-1122) : pourcentage appliqué au jet, non boosté.
 */
export function senderDamage(roll: number, actionId: number, caster: DamageStats, opts: SenderOptions = {}): number {
  const el = effectiveElement(actionId, caster, opts.fallbackElement ?? -1);
  let d = roll;
  if (CASTER_LIFE_PERCENT.has(actionId)) {
    d = Math.trunc(d * caster.hp * 0.01);
  } else if (CASTER_LIFE_MISSING.has(actionId)) {
    d = Math.trunc(d * (caster.maxHp - caster.hp) * 0.01);
  } else if (CASTER_ERODED_LIFE.has(actionId)) {
    if (caster.erodedHp >= 0) d = Math.trunc(d * (caster.erodedHp / 100));
  }
  if (isBoostable(actionId)) {
    const heal = isHealAction(actionId);
    d += opts.baseDamageBonus ?? 0;
    let bonus = (heal ? 0 : caster.stat(Stat.POWER)) + mainStat(caster, el);
    if (bonus < 0) bonus = 0;
    d = Math.trunc(d * ((100 + bonus) * 0.01));
    let flat: number;
    if (heal) flat = caster.stat(Stat.HEAL_BONUS);
    else flat = caster.stat(Stat.DAMAGE) + elemDamage(caster, el) + (opts.criticalEffect ? caster.stat(Stat.CRIT_DAMAGE) : 0);
    d += flat + (opts.flatDamageBonus ?? 0);
    // (arme [31] et combo de bombes [94] du client : sans objet dans le Gladiatrool)
  }
  return d;
}

/**
 * ``DamageSender.getTotalShield`` : 1040 = valeur fixe ; 1039 = % des PV max du lanceur ; 1020 = % du niveau.
 */
export function shieldAmount(roll: number, actionId: number, caster: DamageStats): number {
  if (actionId === 1040) return roll;
  if (actionId === 1039) return Math.trunc(caster.maxHp * roll * 0.01);
  if (actionId === 1020) return Math.round(caster.level * roll * 0.01);
  return 0;
}

/** Valeur brute d'un effet dont la base dépend de la CIBLE (1109, 1048/1067-1071, 1092-1096). */
export function targetBasedRaw(roll: number, actionId: number, target: DamageStats): number | null {
  if (TARGET_MAX_LIFE.has(actionId)) return Math.trunc(roll * (target.maxHp / 100));
  if (TARGET_LIFE_PERCENT.has(actionId)) return Math.trunc(roll * target.hp * 0.01);
  if (TARGET_ERODED_LIFE.has(actionId)) return Math.trunc(roll * (target.erodedHp / 100));
  return null;
}

/** Dégressivité de zone : trunc(valeur × (100 − malus) / 100) (N70 §3.3). */
export function applyAoeMalus(value: number, malusPct: number): number {
  if (malusPct === 0) return value;
  return Math.trunc((value * (100 - malusPct)) / 100);
}

/** La dégressivité s'applique-t-elle à cette action (ni faux dommages, ni poussée, ni bouclier) ? */
export function allowsAoeMalus(actionId: number): boolean {
  return !FAKE_DAMAGE.has(actionId) && actionId !== PUSH_DAMAGE_ACTION && !SHIELD_ACTIONS.has(actionId);
}

// ---------------------------------------------------------------------------------------------
// Multiplicateurs 1163 (HaxeBuff.shouldBeTriggeredOnTargetDamage)
// ---------------------------------------------------------------------------------------------

/** Contexte d'un coup reçu, pour les déclencheurs des 1163. */
export interface HitContext {
  /** Dommages de poussée (collision). */
  collision: boolean;
  /** Rang dans la chaîne de collision (0 = cible poussée). */
  pushIndex: number;
  element: number;
  melee: boolean;
  /** Le lanceur est un allié de la cible. */
  allySource: boolean;
  glyph: boolean;
  trap: boolean;
  weapon: boolean;
  critical: boolean;
  casterIsSummon: boolean;
}

export function defaultHitContext(over: Partial<HitContext> = {}): HitContext {
  return {
    collision: false,
    pushIndex: 0,
    element: -1,
    melee: false,
    allySource: false,
    glyph: false,
    trap: false,
    weapon: false,
    critical: false,
    casterIsSummon: false,
    ...over,
  };
}

const ELEM_TRIGGER = ['DN', 'DE', 'DF', 'DW', 'DA'];

/**
 * Un buff 1163 (déclencheurs ``triggers``) s'applique-t-il à ce coup ? 'I' = toujours ; collision : seulement
 * 'PD' / 'PPD' (toute victime) ou 'PMD' (cible poussée, rang 0) ; sinon 'D' (tous sauf poussée), élément, glyphe,
 * piège, invocation, allié / ennemi (critique), mêlée / distance, arme / sort.
 */
export function multiplierApplies(triggers: readonly string[], h: HitContext): boolean {
  if (triggers.includes('I')) return true;
  if (h.collision) {
    return triggers.includes('PD') || triggers.includes('PPD') || (h.pushIndex === 0 && triggers.includes('PMD'));
  }
  if (triggers.includes('D')) return true;
  const et = h.element >= 0 && h.element <= 4 ? ELEM_TRIGGER[h.element]! : null;
  if (et && triggers.includes(et)) return true;
  if ((h.glyph && triggers.includes('DG')) || (h.trap && triggers.includes('DT')) || (h.casterIsSummon && triggers.includes('DI'))) {
    return true;
  }
  if (h.allySource && (triggers.includes('DBA') || (h.critical && triggers.includes('DCCBA')))) return true;
  if (!h.allySource && (triggers.includes('DBE') || (h.critical && triggers.includes('DCCBE')))) return true;
  if ((h.melee && triggers.includes('DM')) || (!h.melee && triggers.includes('DR'))) return true;
  if ((h.weapon && triggers.includes('DCAC')) || (!h.weapon && triggers.includes('DS'))) return true;
  return false;
}

/** Un multiplicateur 1163 : pourcentage et déclencheurs. */
export interface MultiplierLike {
  readonly value: number;
  readonly triggers: readonly string[];
}

/** ``HaxeFighter.getDamageMultiplicator`` : produit entier des 1163 applicables (100 = neutre ; 90 : jamais). */
export function receivedMultiplier(mults: Iterable<MultiplierLike>, actionId: number, h: HitContext): number {
  let m = 100;
  if (actionId === 90) return m;
  for (const b of mults) {
    if (multiplierApplies(b.triggers, h)) m = Math.trunc(m * b.value * 0.01);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Côté cible (DamageReceiver)
// ---------------------------------------------------------------------------------------------

export interface ReceiveOptions {
  melee: boolean;
  criticalEffect?: boolean;
  weapon?: boolean;
  /** Multiplicateurs 1163 portés par la cible. */
  multipliers?: Iterable<MultiplierLike>;
  armorReduction?: number;
  invulnerable?: boolean;
  allySource?: boolean;
  glyph?: boolean;
  trap?: boolean;
  casterIsSummon?: boolean;
  /** Dommages de poussée. */
  collision?: boolean;
  pushIndex?: number;
  /** Élément à utiliser si l'action n'en a pas dans la table du client. */
  fallbackElement?: number;
  /** L'érosion s'applique (faux pour 1048 sans ``spells.coupDeSangCreatesErosion``). */
  erosion?: boolean;
  /** Vol de vie : soin du lanceur plafonné, 0 si le lanceur est incurable. */
  casterIncurable?: boolean;
}

export interface DamageResult {
  /** Dégâts sortants (après dégressivité). */
  raw: number;
  /** Après résistances fixes et %. */
  afterResist: number;
  /** Après multiplicateurs (finaux, mêlée/distance, 1163). */
  final: number;
  shieldAbsorbed: number;
  /** PV réellement perdus (final − bouclier). */
  lifeLoss: number;
  /** PV max perdus (érosion). */
  eroded: number;
  /** Soin du lanceur (vol de vie). */
  lifeStealHeal: number;
  invulnerable: boolean;
}

/**
 * ``DamageReceiver.receiveDamage`` + ``applyDamage`` + ``applyDealtMultiplier`` (+ bouclier, érosion, vol de vie).
 * Hors collision : d = trunc((raw − rés. fixes) × (1 − rés%/100)), ≥ 0 ; puis (boostable) multiplicateurs infligés
 * du lanceur et reçus de la cible, dommages finaux ; puis toujours le produit des 1163 applicables.
 * Collision : aucune résistance ni multiplicateur infligé ; seuls les 1163 'PD'/'PPD'/'PMD' s'appliquent.
 */
export function receiveDamage(
  raw: number,
  actionId: number,
  caster: DamageStats,
  target: DamageStats,
  o: ReceiveOptions,
): DamageResult {
  const el = effectiveElement(actionId, caster, o.fallbackElement ?? -1);
  const collision = o.collision ?? false;
  let d = raw;
  if (!collision) {
    const flat = resistFix(target, el) + (o.criticalEffect ? target.stat(Stat.CRIT_RES) : 0);
    d = d - flat - (o.armorReduction ?? 0);
    d = Math.trunc(d * (1 - resistPct(target, el) / 100));
    d = Math.max(0, d);
  }
  const afterResist = d;
  d = Math.max(0, d);
  if (isBoostable(actionId) && !collision) {
    // Multiplicateurs du client dans l'ordre : sorts/armes infligés [123|122], mêlée/distance infligés [125|120],
    // sorts/armes reçus [141|142] (tous à 100 : aucun effet du Gladiatrool ne les modifie), puis mêlée/distance
    // reçus [124|121] = 100 − % résistance mêlée/distance (effets 2803 / 2807), puis dommages finaux [107].
    d = Math.trunc(d * ((100 - target.stat(o.melee ? Stat.RES_MELEE : Stat.RES_RANGED)) / 100));
    d = Math.trunc(d * (finalDamageOf(caster) / 100));
  }
  const h: HitContext = {
    collision,
    pushIndex: o.pushIndex ?? 0,
    element: el,
    melee: o.melee,
    allySource: o.allySource ?? false,
    glyph: o.glyph ?? false,
    trap: o.trap ?? false,
    weapon: o.weapon ?? false,
    critical: o.criticalEffect ?? false,
    casterIsSummon: o.casterIsSummon ?? false,
  };
  const mult = o.multipliers ? receivedMultiplier(o.multipliers, actionId, h) : 100;
  d = Math.trunc(d * (mult / 100));
  if (o.invulnerable) {
    return { raw, afterResist, final: 0, shieldAbsorbed: 0, lifeLoss: 0, eroded: 0, lifeStealHeal: 0, invulnerable: true };
  }
  const absorbed = FAKE_DAMAGE.has(actionId) ? 0 : Math.min(d, target.shield);
  const life = Math.max(0, d - absorbed);
  const eroded = o.erosion === false ? 0 : erodedDamage(life, target);
  let steal = 0;
  if (LIFE_STEAL.has(actionId) && life > 0) {
    steal = healAmount(Math.trunc(life * 0.5), caster, caster, actionId, o.casterIncurable ?? false);
  }
  return { raw, afterResist, final: d, shieldAbsorbed: absorbed, lifeLoss: life, eroded, lifeStealHeal: steal, invulnerable: false };
}

/** ``DamageReceiver.getPermanentDamage`` : floor(pertes × clamp(érosion, 0, 50) / 100), au plus PV courants − 1. */
export function erodedDamage(lifeLoss: number, target: DamageStats): number {
  const pct = Math.trunc(Math.floor(Math.max(0, Math.min(target.stat(Stat.EROSION), 50)))) / 100;
  return Math.trunc(Math.floor(Math.min(Math.floor(lifeLoss * pct), target.hp - 1)));
}

/**
 * ``DamageReceiver.executeLifePointsWin`` : soin (déjà boosté) × soins finaux du lanceur / 100 si applicable,
 * plafonné aux PV manquants de la cible ; 0 si la cible est incurable (effet d'état 5).
 */
export function healAmount(
  value: number,
  target: DamageStats,
  caster: DamageStats | null,
  actionId: number,
  incurable = false,
): number {
  if (incurable) return 0;
  let v = value;
  if (caster !== null && !DEALT_HEAL_MULT_NOT_APPLICABLE.has(actionId)) v = Math.trunc(v * (finalHealOf(caster) / 100));
  return Math.max(0, Math.min(v, target.maxHp - target.hp));
}

/**
 * Chaîne complète d'un effet de dégâts (``compute_hit``) : lanceur (ou base cible), dégressivité entière
 * ``aoeMalusPct``, réception.
 */
export function computeHit(
  roll: number,
  actionId: number,
  caster: DamageStats,
  target: DamageStats,
  o: ReceiveOptions & SenderOptions & { aoeMalusPct?: number },
): DamageResult {
  let raw = targetBasedRaw(roll, actionId, target);
  if (raw === null) raw = senderDamage(roll, actionId, caster, o);
  if (allowsAoeMalus(actionId)) raw = applyAoeMalus(raw, o.aoeMalusPct ?? 0);
  return receiveDamage(raw, actionId, caster, target, o);
}
