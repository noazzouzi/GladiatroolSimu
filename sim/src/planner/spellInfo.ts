/**
 * Profil d'un niveau de sort pour la génération d'actions du planificateur : à qui il sert (ennemis, alliés, soi),
 * comment il se cible (case occupée, case libre, zone, soi, n'importe où), ce qu'il fait (dégâts, soins, poussée,
 * échange, téléportation du lanceur, avance, invocation) et l'étendue de ses zones. Calculé une fois par contexte
 * moteur à partir des effets COMPILÉS (sous-sorts compris) : aucun sort n'est codé en dur.
 */
import { distance, SpellZone, cellInDirection } from '../geometry/index.js';
import type { CompiledEffect, CompiledSpellLevel, EngineContext } from '../engine/index.js';

/** Gestionnaires de dégâts (ÉTUDE §9.5). */
const DAMAGE_HANDLERS: ReadonlySet<string> = new Set([
  'damage',
  'lifeSteal',
  'damageCasterHpPct',
  'damageTargetErodedHpPct',
  'damageCasterErodedHpPct',
  'splashInitialDamage',
  'splashFinalDamage',
  'kill',
]);
const HEAL_HANDLERS: ReadonlySet<string> = new Set(['heal', 'healMaxHpPct', 'splashHeal', 'resurrect']);
const PROTECT_HANDLERS: ReadonlySet<string> = new Set(['shield', 'hpThreshold', 'interceptDamage']);
const BUFF_HANDLERS: ReadonlySet<string> = new Set(['statBuff', 'setState', 'spellBaseDamageBonus', 'receivedDamageMultiplier']);
const DISPEL_HANDLERS: ReadonlySet<string> = new Set(['dispel', 'unsetState', 'removeSpellEffects']);
const SUB_SPELL_HANDLERS: ReadonlySet<string> = new Set(['executeSubSpell']);

/** Lettre de masque visant des ennemis (majuscule hors lanceur ``C``). */
function hasEnemyLetter(include: readonly string[]): boolean {
  for (const l of include) if (l !== 'C' && l >= 'A' && l <= 'Z') return true;
  return false;
}

/** Lettre de masque visant des alliés (minuscule hors lanceur ``c``). */
function hasAllyLetter(include: readonly string[]): boolean {
  for (const l of include) if (l !== 'c' && l >= 'a' && l <= 'z') return true;
  return false;
}

/** Masque qui ne vise que le lanceur. */
function casterOnly(include: readonly string[]): boolean {
  return include.length > 0 && include.every((l) => l === 'C' || l === 'c');
}

export interface SpellProfile {
  readonly id: number;
  readonly spellId: number;
  readonly name: string;
  readonly ap: number;
  /** Sort unique (usage unique). */
  readonly unique: boolean;
  /** PO maximale 0 : lancé sur la case du lanceur. */
  readonly selfCast: boolean;
  /** PO ≥ 63 sans ligne de vue : la position du lanceur n'importe pas pour la portée. */
  readonly anywhere: boolean;
  /** Toutes les zones qui choisissent des cibles sont globales (forme ``a`` / ``A`` ou rayon ≥ 63). */
  readonly globalZone: boolean;
  readonly needFreeCell: boolean;
  readonly needTakenCell: boolean;
  /** Toutes les zones qui choisissent des cibles sont ponctuelles (``P``) : on vise une entité. */
  readonly pointTarget: boolean;
  /** Un effet agit sur les ennemis (dégâts, déplacement, malus, désenvoûtement). */
  readonly enemyRelevant: boolean;
  /** Un effet bénéfique agit sur les alliés (soin, protection, boost, échange). */
  readonly allyRelevant: boolean;
  /** Seul le lanceur est visé (boost personnel). */
  readonly selfOnly: boolean;
  readonly damages: boolean;
  readonly heals: boolean;
  readonly pushes: boolean;
  readonly pulls: boolean;
  /** La poussée est portée par un sous-sort lancé sur la case de chaque cible : direction depuis le lanceur. */
  readonly pushFromCaster: boolean;
  readonly swaps: boolean;
  readonly teleportsCaster: boolean;
  readonly advancesCaster: boolean;
  readonly summons: boolean;
  /** Zones des effets racines qui choisissent des cibles (hors effets sur le lanceur seul). */
  readonly zones: readonly SpellZone[];
  /** Une zone au moins dépend de l'orientation lanceur → case ciblée. */
  readonly directional: boolean;
  /** Distance maximale (Manhattan) entre la case ciblée et une case de zone. */
  readonly zoneReach: number;
  /** Jet moyen des dégâts directs (dégâts, vol de vie), sous-sorts compris, avant la Force. */
  readonly avgDamageRoll: number;
  /** % des PV courants du lanceur infligés (Coup de Sang). */
  readonly casterHpPct: number;
  readonly pushForce: number;
  readonly pullForce: number;
  readonly advanceForce: number;
}

const cache = new WeakMap<EngineContext, Map<number, SpellProfile>>();

/** Profil (mis en cache par contexte) d'un niveau de sort. */
export function spellProfile(ctx: EngineContext, spellLevelId: number): SpellProfile {
  let m = cache.get(ctx);
  if (!m) {
    m = new Map();
    cache.set(ctx, m);
  }
  let p = m.get(spellLevelId);
  if (!p) {
    p = buildProfile(ctx, ctx.getSpell(spellLevelId));
    m.set(spellLevelId, p);
  }
  return p;
}

interface Acc {
  damages: boolean;
  heals: boolean;
  enemy: boolean;
  ally: boolean;
  pushes: boolean;
  pulls: boolean;
  pushFromCaster: boolean;
  swaps: boolean;
  teleports: boolean;
  advances: boolean;
  summons: boolean;
  avgRoll: number;
  casterHpPct: number;
  pushForce: number;
  pullForce: number;
  advanceForce: number;
}

function walkEffects(ctx: EngineContext, effects: readonly CompiledEffect[], acc: Acc, depth: number, viaSubSpellOnTarget: boolean, seen: Set<number>): void {
  for (const e of effects) {
    if (e.disabled) continue;
    const h = e.handler;
    const inc = e.mask.include;
    const enemy = hasEnemyLetter(inc);
    const ally = hasAllyLetter(inc);
    if (DAMAGE_HANDLERS.has(h)) {
      if (enemy) {
        acc.damages = true;
        acc.enemy = true;
        if (h === 'damage' || h === 'lifeSteal') acc.avgRoll += (e.lo + e.hi) / 2;
        if (h === 'damageCasterHpPct') acc.casterHpPct += e.lo;
      }
    } else if (HEAL_HANDLERS.has(h) || PROTECT_HANDLERS.has(h)) {
      if (ally || casterOnly(inc)) {
        acc.heals = acc.heals || HEAL_HANDLERS.has(h);
        acc.ally = acc.ally || ally;
      }
    } else if (h === 'push' || h === 'pushNoDamage') {
      if (enemy) acc.enemy = true;
      acc.pushes = true;
      acc.pushForce = Math.max(acc.pushForce, e.lo);
      if (viaSubSpellOnTarget) acc.pushFromCaster = true;
    } else if (h === 'pull') {
      if (enemy) acc.enemy = true;
      acc.pulls = true;
      acc.pullForce = Math.max(acc.pullForce, e.lo);
    } else if (h === 'exchange') {
      acc.swaps = true;
      if (enemy) acc.enemy = true;
      if (ally) acc.ally = true;
    } else if (h === 'teleport') {
      acc.teleports = true;
    } else if (h === 'casterAdvance') {
      acc.advances = true;
      acc.advanceForce = Math.max(acc.advanceForce, e.lo);
    } else if (h === 'summon') {
      acc.summons = true;
    } else if (BUFF_HANDLERS.has(h)) {
      if (enemy) acc.enemy = true;
      if (ally) acc.ally = true;
    } else if (DISPEL_HANDLERS.has(h)) {
      if (h === 'dispel' && enemy) acc.enemy = true;
    }
    if (SUB_SPELL_HANDLERS.has(h) && depth < 3) {
      const sub = e.data.subSpell?.spellLevelId;
      if (sub && ctx.hasSpell(sub) && !seen.has(sub)) {
        seen.add(sub);
        const s = ctx.getSpell(sub);
        // 1160 / 2160 (lanceur d'origine, case de la cible) : les poussées du sous-sort partent du lanceur
        const onTarget = e.effectId === 1160 || e.effectId === 2160 || e.effectId === 1008;
        walkEffects(ctx, s.effects, acc, depth + 1, onTarget, seen);
        if (enemy) acc.enemy = acc.enemy || s.effects.some((x) => hasEnemyLetter(x.mask.include));
      }
    }
  }
}

function isGlobal(z: SpellZone): boolean {
  return z.shape === 'a' || z.shape === 'A' || z.radius >= 63;
}

/** Cases de test pour l'orientation et l'étendue des zones (centre de l'arène 300, lanceurs dans 8 directions). */
const PROBE_CENTER = 300;

function zoneReachOf(z: SpellZone): number {
  if (isGlobal(z)) return 63;
  if (z.shape === ';') return 63;
  let reach = 0;
  for (let dir = 0; dir < 8; dir++) {
    for (const d of [1, 2, 4]) {
      const caster = cellInDirection(PROBE_CENTER, dir, d);
      if (caster < 0) continue;
      for (const c of z.cells(PROBE_CENTER, caster)) if (c >= 0) reach = Math.max(reach, distance(PROBE_CENTER, c));
    }
  }
  return reach;
}

function isDirectional(z: SpellZone): boolean {
  if (isGlobal(z) || z.shape === 'P' || z.shape === ';') return false;
  let ref: string | null = null;
  for (let dir = 0; dir < 8; dir++) {
    const caster = cellInDirection(PROBE_CENTER, dir, 2);
    if (caster < 0) continue;
    const key = z
      .containedCells(PROBE_CENTER, caster)
      .filter((c) => c >= 0)
      .sort((a, b) => a - b)
      .join(',');
    if (ref === null) ref = key;
    else if (ref !== key) return true;
  }
  return false;
}

function buildProfile(ctx: EngineContext, s: CompiledSpellLevel): SpellProfile {
  const acc: Acc = {
    damages: false,
    heals: false,
    enemy: false,
    ally: false,
    pushes: false,
    pulls: false,
    pushFromCaster: false,
    swaps: false,
    teleports: false,
    advances: false,
    summons: false,
    avgRoll: 0,
    casterHpPct: 0,
    pushForce: 0,
    pullForce: 0,
    advanceForce: 0,
  };
  walkEffects(ctx, s.effects, acc, 0, false, new Set([s.id]));
  const zones: SpellZone[] = [];
  let allCaster = true;
  for (const e of s.effects) {
    if (e.disabled) continue;
    const h = e.handler;
    if (h === 'noop' || h === 'forgetSpell' || h === 'learnSpell' || h === 'turnDuration') continue;
    if (casterOnly(e.mask.include)) continue;
    allCaster = false;
    if (!zones.some((z) => z.raw() === e.zone.raw())) zones.push(e.zone);
  }
  const c = s.cast;
  const selfCast = c.range[1] === 0;
  const anywhere = c.range[1] >= 63 && !c.los;
  const globalZone = zones.length > 0 && zones.every(isGlobal);
  const pointTarget = zones.length > 0 && zones.every((z) => z.shape === 'P' || (z.radius === 0 && z.shape !== ';' && !isGlobal(z)));
  let reach = 0;
  let directional = false;
  for (const z of zones) {
    reach = Math.max(reach, zoneReachOf(z));
    directional = directional || isDirectional(z);
  }
  const data = ctx.data.spells[String(s.id)];
  return {
    id: s.id,
    spellId: s.spellId,
    name: s.name,
    ap: c.ap,
    unique: data?.family === 'unique',
    selfCast,
    anywhere,
    globalZone,
    needFreeCell: c.needFreeCell,
    needTakenCell: c.needTakenCell,
    pointTarget,
    enemyRelevant: acc.enemy,
    allyRelevant: acc.ally,
    selfOnly: allCaster,
    damages: acc.damages,
    heals: acc.heals,
    pushes: acc.pushes,
    pulls: acc.pulls,
    pushFromCaster: acc.pushFromCaster,
    swaps: acc.swaps,
    teleportsCaster: acc.teleports,
    advancesCaster: acc.advances,
    summons: acc.summons,
    zones,
    directional,
    zoneReach: reach,
    avgDamageRoll: acc.avgRoll,
    casterHpPct: acc.casterHpPct,
    pushForce: acc.pushForce,
    pullForce: acc.pullForce,
    advanceForce: acc.advanceForce,
  };
}

/** Portée d'attaque d'un monstre (PO maximale + rayon de zone de ses sorts offensifs), mise en cache par contexte. */
const monsterReachCache = new WeakMap<EngineContext, Map<number, number>>();

export function monsterSpellReach(ctx: EngineContext, monsterId: number): number {
  let m = monsterReachCache.get(ctx);
  if (!m) {
    m = new Map();
    monsterReachCache.set(ctx, m);
  }
  let r = m.get(monsterId);
  if (r === undefined) {
    r = 1;
    const mon = ctx.data.monsters[String(monsterId)];
    for (const id of mon?.spells ?? []) {
      if (!ctx.hasSpell(id)) continue;
      const p = spellProfile(ctx, id);
      if (!p.damages && !p.pushes) continue;
      const zr = p.globalZone ? 0 : Math.min(p.zoneReach, 6);
      r = Math.max(r, ctx.getSpell(id).cast.range[1] + zr);
    }
    m.set(monsterId, r);
  }
  return r;
}
