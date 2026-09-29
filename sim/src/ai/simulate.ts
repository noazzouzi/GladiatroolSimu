/**
 * Simulation ANALYTIQUE d'un lancer de sort sur le plateau de l'IA (board.ts), sans toucher à l'état du combat.
 *
 * Même logique que le moteur (cast.ts, targeting.ts, effects/*) pour les gestionnaires utilisés par les monstres,
 * mais en ESPÉRANCE : jet moyen, et, si ``critExpectation``, mélange (1 − p) × normal + p × critique quand la liste
 * critique a la même structure que la liste normale (même suite d'effectId) — sinon liste normale seule. Les
 * formules (``senderDamage``, ``receiveDamage``, ``healAmount``, ``collisionDamages``, ``computeForcedMove``,
 * ``comparePositions``, ``matchesMask``, ``SpellZone``) sont celles du moteur et de la géométrie.
 *
 * Gestionnaires modélisés : damage, lifeSteal, heal, push, pushNoDamage, pull, teleport, exchange, setState
 * (Inébranlable), statBuff (dommages finaux, érosion), executeSubSpell (792 / 2792 / 1160 / 2160 / 2960 : exécuteurs
 * « cible de l'effet » et « lanceur d'origine »). Ignorés (sans incidence sur les décisions des monstres) : autres
 * états, boucliers posés, déclencheurs différés (effets non immédiats), marques.
 *
 * La validation (``boardCanCast``) reprend validation.ts : PA, relance initiale, intervalle, lancers par tour, portée,
 * case jouable, case libre / occupée, ligne de vue (combattants du plateau), lancers par cible, cumul maximal.
 */
import { allowsAoeMalus, applyAoeMalus, effectiveElement, healAmount, receiveDamage, senderDamage, targetBasedRaw } from '../engine/formulas.js';
import {
  areAdjacent,
  collisionDamages,
  computeForcedMove,
  effectiveMaxRange,
  hasLineOfSight,
  isInCastRange,
  teleportDestination,
} from '../geometry/index.js';
import {
  comparePositions,
  criticalChance,
  isInvulnerableTo,
  matchesMask,
  pushLevel,
  SE_UNSHAKABLE,
  spellBaseDamageBonus,
  stackCount,
  Stat,
  STAT_KEY_INDEX,
  type CompiledEffect,
  type CompiledSpellLevel,
  type DamageResult,
  type Fighter,
} from '../engine/index.js';
import type { StatKey } from '../data/index.js';
import { TEAM_SCENARIO, type Board } from './board.js';

/** Poussées avec dommages de collision (moteur : 5, 1041). */
const COLLISION_PUSH = new Set([5, 1041]);
/** Poussées / attirances forcées (ignorent Inébranlable). */
const FORCED_MOVE = new Set([1021, 1022]);
const RASSEMBLEMENT_SPELL = 30432;
const MAX_SUB_DEPTH = 4;

/** Jet estimé d'un effet sur le plateau. */
export function rollEstimate(b: Board, e: CompiledEffect): number {
  const lo = e.lo;
  const hi = Math.max(e.hi, e.lo);
  if (lo === hi) return lo;
  return b.s.roll === 'average' ? Math.floor((lo + hi) / 2) : (lo + hi) / 2;
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** Contrôles indépendants de la case (PA, relances, lancers par tour) pour l'acteur du plateau. */
export function boardCanCastSpell(b: Board, spell: CompiledSpellLevel): boolean {
  const i = b.actor;
  if (i < 0 || !b.isOn(i)) return false;
  const c = spell.cast;
  if (b.ap < c.ap) return false;
  const f = b.fighter(i);
  const sc = c.statesCriterion;
  if (sc) {
    for (const st of sc.required) if (!f.hasState(st)) return false;
    for (const st of sc.forbidden) if (f.hasState(st)) return false;
  }
  if (c.initialCooldown > 0 && b.turnCount <= c.initialCooldown) return false;
  const k = b.recIndex(spell.spellId);
  if (k >= 0) {
    const last = b.recLastTurn[k]!;
    if (c.interval > 0 && last >= 0 && b.turnCount < last + c.interval) return false;
    if (c.maxPerTurn > 0 && b.recTurnCasts[k]! >= c.maxPerTurn) return false;
  }
  if (c.globalCooldown > 0) {
    const st = b.s.state;
    const g = st.globalCooldowns.find((x) => x.team === f.team && x.spellId === spell.spellId);
    if (g && st.turn < g.turn + c.globalCooldown) return false;
  }
  return true;
}

/** Contrôles de la case ciblée pour l'acteur du plateau (portée, case, LdV, limites par cible). */
export function boardCanCastOn(b: Board, spell: CompiledSpellLevel, cell: number, fromCell = b.cell[b.actor]!): boolean {
  if (cell < 0 || cell >= b.occ.length) return false;
  const spec = spell.castSpec;
  const caster = b.fighter(b.actor);
  const max = effectiveMaxRange(spec, caster.range);
  if (!isInCastRange(fromCell, cell, spec.minRange, max, spec.castInLine, spec.castInDiagonal)) return false;
  const grid = b.env.grid;
  if (!grid.isWalkable(cell)) return false;
  const t = b.at(cell);
  if (spec.needFreeCell && t >= 0) return false;
  if ((spec.needTakenCell || spec.needVisibleEntity) && t < 0) return false;
  if (spec.castTestLos && !hasLineOfSight(fromCell, cell, b.isOccupied, grid.blocksLos)) return false;
  if (t >= 0) {
    const c = spell.cast;
    if (c.maxPerTarget > 0) {
      const k = b.recIndex(spell.spellId);
      if (k >= 0) {
        let n = 0;
        for (const x of b.recTargets[k]!) if (x === t) n++;
        if (n >= c.maxPerTarget) return false;
      }
    }
    if (c.maxStack > 0 && stackCount(b.fighter(t), spell.spellId) + b.addedStacks(spell.spellId, t) >= c.maxStack) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Lancer
// ---------------------------------------------------------------------------------------------

/**
 * Lancer de l'acteur du plateau : coût en PA, compteurs, puis résolution. Ne valide pas (appeler ``boardCanCast*``).
 */
export function boardCast(b: Board, spell: CompiledSpellLevel, cell: number): void {
  const i = b.actor;
  const target = b.at(cell);
  b.ap -= spell.cast.ap;
  b.recordCast(spell.spellId, target);
  if (target >= 0 && spell.cast.maxStack > 0) b.stackAdds.push(spell.spellId, target);
  const f = b.fighter(i);
  const p = b.s.critExpectation ? criticalChance(spell.cast.critRate, f.stat(Stat.CRIT)) / 100 : 0;
  resolveOnBoard(b, i, spell, cell, p, 0);
}

interface Selection {
  ids: number[];
  additional: number[];
}

function selectOnBoard(b: Board, caster: Fighter, e: CompiledEffect, targetedCell: number, casterCellBefore: number, snap: readonly number[]): Selection {
  const zone = e.zone;
  const whole = zone.shape === 'A' || zone.shape === 'a';
  const st = b.s.state;
  const ids: number[] = [];
  const n = b.s.n;
  for (let id = 0; id < n; id++) {
    if (!b.alive[id]) continue;
    const c = snap[id]!;
    if (c < 0) continue;
    if (!whole && (targetedCell < 0 || !zone.contains(c, targetedCell, casterCellBefore))) continue;
    if (!matchesMask(st, caster, b.fighter(id), e.mask)) continue;
    ids.push(id);
  }
  if (ids.length > 1 && targetedCell >= 0) {
    ids.sort((x, y) => comparePositions(targetedCell, e.isPush, snap[x]!, snap[y]!));
  }
  const additional: number[] = [];
  if (e.mask.include.includes('C') && b.alive[caster.id] && !ids.includes(caster.id) && matchesMask(st, caster, caster, e.mask)) {
    ids.push(caster.id);
    additional.push(caster.id);
  }
  return { ids, additional };
}

/** Listes d'effets normale / critique appariées (même suite d'effectId), sinon null. */
function pairedCrit(spell: CompiledSpellLevel): readonly CompiledEffect[] | null {
  if (!spell.hasCritList || spell.critEffects.length !== spell.effects.length) return null;
  for (let k = 0; k < spell.effects.length; k++) if (spell.effects[k]!.effectId !== spell.critEffects[k]!.effectId) return null;
  return spell.critEffects;
}

/** Résolution d'un sort (sans coût) par ``casterId`` sur ``cell`` ; ``critP`` : probabilité de critique héritée. */
export function resolveOnBoard(b: Board, casterId: number, spell: CompiledSpellLevel, cell: number, critP: number, depth: number): void {
  if (depth > MAX_SUB_DEPTH || !b.alive[casterId]) return;
  const caster = b.fighter(casterId);
  const crit = critP > 0 ? pairedCrit(spell) : null;
  const p = crit ? critP : 0;
  const snap = b.cell.slice();
  const casterCellBefore = b.cell[casterId]!;
  const list = spell.effects;
  const sels = list.map((e) => selectOnBoard(b, caster, e, cell, casterCellBefore, snap));
  for (let k = 0; k < list.length; k++) {
    const e = list[k]!;
    if (e.disabled || !e.immediate || e.data.delay > 0) continue;
    const ce = crit ? crit[k]! : null;
    const sel = sels[k]!;
    switch (e.handler) {
      case 'damage':
      case 'lifeSteal':
        for (const t of sel.ids) {
          if (!b.alive[t]) continue;
          hitOnBoard(b, casterId, t, spell, e, ce, p, cell, casterCellBefore, snap, sel.additional.includes(t));
        }
        break;
      case 'heal':
        for (const t of sel.ids) {
          if (!b.alive[t]) continue;
          healOnBoard(b, casterId, t, e, ce, p, cell, casterCellBefore, snap, sel.additional.includes(t));
        }
        break;
      case 'push':
      case 'pushNoDamage':
        for (const t of sel.ids) if (b.alive[t]) forcedOnBoard(b, casterId, t, spell, e, 'push', cell, casterCellBefore, snap);
        break;
      case 'pull':
        for (const t of sel.ids) if (b.alive[t]) forcedOnBoard(b, casterId, t, spell, e, 'pull', cell, casterCellBefore, snap);
        break;
      case 'teleport':
        teleportOnBoard(b, casterId, e, cell);
        break;
      case 'exchange':
        for (const t of sel.ids) if (b.alive[t]) swapOnBoard(b, casterId, t);
        break;
      case 'setState': {
        const stateId = e.data.stateId ?? e.data.value;
        if ((b.env.ctx.stateEffectMask(stateId) & (1 << SE_UNSHAKABLE)) !== 0) {
          for (const t of sel.ids) if (b.alive[t]) b.unshakable[t] = 1;
        }
        break;
      }
      case 'statBuff': {
        const key = e.catalog?.stat as StatKey | undefined;
        if (!key) break;
        const idx = STAT_KEY_INDEX[key];
        const v = rollEstimate(b, e) * (e.catalog?.sign ?? 1);
        for (const t of sel.ids) {
          if (!b.alive[t]) continue;
          if (idx === Stat.FINAL_DAMAGE) b.df[t] += v;
          else if (idx === Stat.EROSION) b.ero[t] += v;
        }
        break;
      }
      case 'executeSubSpell':
        subSpellOnBoard(b, casterId, e, sel.ids, cell, critP, depth);
        break;
      default:
        break;
    }
  }
}

function subSpellOnBoard(b: Board, casterId: number, e: CompiledEffect, targets: number[], cell: number, critP: number, depth: number): void {
  const sub = e.data.subSpell;
  if (!sub || sub.spellLevelId === null || sub.spellLevelId === undefined) return;
  const ctx = b.env.ctx;
  if (!ctx.hasSpell(sub.spellLevelId)) return;
  const level = ctx.getSpell(sub.spellLevelId);
  const ex = e.catalog?.executor ?? ctx.data.rules.subSpellExecutors[String(e.effectId)];
  if (!ex) return;
  if (ex.cell === 'targetedCell') {
    resolveOnBoard(b, casterId, level, cell, critP, depth + 1);
    return;
  }
  for (const t of targets) {
    if (!b.alive[t]) continue;
    const tc = b.cell[t]!;
    if (ex.caster === 'effectTarget' && ex.cell === 'effectTargetCell') resolveOnBoard(b, t, level, tc, critP, depth + 1);
    else if (ex.caster === 'originalCaster' && ex.cell === 'effectTargetCell') resolveOnBoard(b, casterId, level, tc, critP, depth + 1);
    else if (ex.caster === 'effectTarget' && ex.cell === 'parentTargetedCell') resolveOnBoard(b, t, level, cell, critP, depth + 1);
  }
}

/** Dégâts d'un effet sur une cible du plateau (valeur en espérance), vol de vie compris. */
function hitOnBoard(
  b: Board,
  casterId: number,
  t: number,
  spell: CompiledSpellLevel,
  e: CompiledEffect,
  ce: CompiledEffect | null,
  p: number,
  cell: number,
  casterCellBefore: number,
  snap: readonly number[],
  additional: boolean,
): void {
  const rn = computeHitOnBoard(b, casterId, t, spell, e, cell, casterCellBefore, snap, additional);
  let loss = rn.lifeLoss;
  let shield = rn.shieldAbsorbed;
  let ero = rn.eroded;
  let steal = rn.lifeStealHeal;
  if (ce && p > 0) {
    const rc = computeHitOnBoard(b, casterId, t, spell, ce, cell, casterCellBefore, snap, additional);
    loss = (1 - p) * loss + p * rc.lifeLoss;
    shield = (1 - p) * shield + p * rc.shieldAbsorbed;
    ero = (1 - p) * ero + p * rc.eroded;
    steal = (1 - p) * steal + p * rc.lifeStealHeal;
  }
  b.applyLoss(t, loss, shield, ero);
  if (steal > 0 && b.alive[casterId]) b.applyHeal(casterId, steal);
}

function computeHitOnBoard(
  b: Board,
  casterId: number,
  t: number,
  spell: CompiledSpellLevel,
  e: CompiledEffect,
  cell: number,
  casterCellBefore: number,
  snap: readonly number[],
  additional: boolean,
): DamageResult {
  const cv = b.view(casterId);
  const tv = b.view(t);
  const caster = b.fighter(casterId);
  const target = b.fighter(t);
  const roll = rollEstimate(b, e);
  let raw = targetBasedRaw(roll, e.effectId, tv);
  if (raw === null) {
    raw = senderDamage(roll, e.effectId, cv, {
      criticalEffect: e.critical,
      baseDamageBonus: spellBaseDamageBonus(caster, spell.spellId),
      fallbackElement: e.element,
    });
  }
  if (allowsAoeMalus(e.effectId) && !additional && e.zone.radius >= 1 && cell >= 0 && snap[t]! >= 0) {
    raw = applyAoeMalus(raw, e.zone.aoeMalus(cell, casterCellBefore, snap[t]!));
  }
  const cc = b.cell[casterId]!;
  const tc = b.cell[t]!;
  const melee = casterId !== t && cc >= 0 && tc >= 0 && areAdjacent(cc, tc);
  const element = effectiveElement(e.effectId, cv, e.element);
  const inv = isInvulnerableTo(target, caster, { melee, element, collision: false, critical: e.critical });
  return receiveDamage(raw, e.effectId, cv, tv, {
    melee,
    criticalEffect: e.critical,
    multipliers: b.multipliers(t),
    invulnerable: inv,
    allySource: caster.team === target.team,
    casterIsSummon: caster.isSummon,
    fallbackElement: e.element,
    erosion: e.erosion,
    casterIncurable: caster.incurable,
  });
}

function healOnBoard(
  b: Board,
  casterId: number,
  t: number,
  e: CompiledEffect,
  ce: CompiledEffect | null,
  p: number,
  cell: number,
  casterCellBefore: number,
  snap: readonly number[],
  additional: boolean,
): void {
  const value = (eff: CompiledEffect): number => {
    const roll = rollEstimate(b, eff);
    let v = targetBasedRaw(roll, eff.effectId, b.view(t));
    if (v === null) v = senderDamage(roll, eff.effectId, b.view(casterId), { criticalEffect: eff.critical, fallbackElement: eff.element });
    if (allowsAoeMalus(eff.effectId) && !additional && eff.zone.radius >= 1 && snap[t]! >= 0) {
      v = applyAoeMalus(v, eff.zone.aoeMalus(cell, casterCellBefore, snap[t]!));
    }
    return healAmount(v, b.view(t), b.view(casterId), eff.effectId, b.fighter(t).incurable);
  };
  let amount = value(e);
  if (ce && p > 0) amount = (1 - p) * amount + p * value(ce);
  b.applyHeal(t, amount);
}

/** Poussée / attirance (positions d'avant le sort pour la poussée, case courante du lanceur pour l'attirance). */
function forcedOnBoard(
  b: Board,
  casterId: number,
  t: number,
  spell: CompiledSpellLevel,
  e: CompiledEffect,
  kind: 'push' | 'pull',
  cell: number,
  casterCellBefore: number,
  snap: readonly number[],
): void {
  const moved = b.fighter(t);
  const forced =
    FORCED_MOVE.has(e.effectId) ||
    (e.effectId === 1103 && spell.spellId === RASSEMBLEMENT_SPELL && !b.env.config.boss.rassemblementBlockedByUnshakable);
  if (!forced && !b.canBePushed(t)) return;
  const from = b.cell[t]!;
  if (from < 0) return;
  const grid = b.env.grid;
  const res = computeForcedMove(grid, b.isOccupied, {
    kind,
    casterCell: kind === 'push' ? casterCellBefore : b.cell[casterId]!,
    targetedCell: cell,
    targetCell: snap[t]! >= 0 ? snap[t]! : from,
    force: e.lo,
    fromCell: from,
  });
  if (res.direction === -1) return;
  const chain: number[] = [];
  for (const c of res.collisionChain) {
    const x = b.at(c);
    if (x >= 0) chain.push(x);
  }
  if (res.moved) b.place(t, res.cell);
  if (res.collision && kind === 'push' && COLLISION_PUSH.has(e.effectId)) {
    const source = b.fighter(casterId);
    const victims = [t, ...chain];
    const dmgs = collisionDamages(
      res,
      pushLevel(b.s.state, source),
      source.stat(Stat.PUSH_DAMAGE),
      victims.map((v) => b.fighter(v).stat(Stat.PUSH_RES)),
      source.pacifist,
    );
    for (let k = 0; k < victims.length; k++) {
      const v = victims[k]!;
      const amount = dmgs[k] ?? 0;
      if (amount <= 0 || !b.alive[v]) continue;
      const victim = b.fighter(v);
      const inv = isInvulnerableTo(victim, source, { melee: false, element: -1, collision: true, critical: false });
      const r = receiveDamage(amount, 80, b.view(casterId), b.view(v), {
        melee: false,
        collision: true,
        pushIndex: k,
        multipliers: b.multipliers(v),
        invulnerable: inv,
        allySource: source.team === victim.team,
      });
      b.applyLoss(v, r.lifeLoss, r.shieldAbsorbed, r.eroded);
    }
  }
  if (res.moved && b.alive[t]) b.arrive(t, from, res.cell);
  void moved;
}

function teleportOnBoard(b: Board, casterId: number, e: CompiledEffect, cell: number): void {
  const f = b.fighter(casterId);
  const from = b.cell[casterId]!;
  if (from < 0 || f.rooted) return;
  const dest = cell >= 0 && b.isFree(cell) ? cell : teleportDestination(e.zone, cell, from, b.isFree);
  if (dest < 0 || dest === from) return;
  b.place(casterId, dest);
  b.arrive(casterId, from, dest);
}

function swapOnBoard(b: Board, a: number, t: number): void {
  if (a === t) return;
  const fa = b.fighter(a);
  const ft = b.fighter(t);
  if (!fa.canSwitch || !ft.canSwitch) return;
  const ca = b.cell[a]!;
  const ct = b.cell[t]!;
  if (ca < 0 || ct < 0) return;
  b.cell[a] = ct;
  b.cell[t] = ca;
  b.occ[ct] = a + 1;
  b.occ[ca] = t + 1;
  b.arrive(a, ca, ct);
  b.arrive(t, ct, ca);
}

// ---------------------------------------------------------------------------------------------
// Classification des sorts (pour l'énumération des cibles)
// ---------------------------------------------------------------------------------------------

export type SpellTargeting = 'self' | 'freeCell' | 'area' | 'single';

/** Description d'un sort pour l'IA (en cache par niveau de sort). */
export interface SpellInfo {
  readonly spell: CompiledSpellLevel;
  readonly targeting: SpellTargeting;
  /** Rayon de zone maximal des effets offensifs (sous-sorts compris). */
  readonly areaRadius: number;
  /** Touche des ennemis (dégâts, poussée, attirance), sous-sorts compris. */
  readonly offensive: boolean;
  readonly damaging: boolean;
  /** Soigne un allié. */
  readonly heals: boolean;
  /** Échange avec un allié. */
  readonly swapsAlly: boolean;
  /** Seulement des effets sur soi (bonus, état). */
  readonly selfOnly: boolean;
  /** Portée maximale (sans bonus) + rayon de zone offensif. */
  readonly reach: number;
  readonly minRange: number;
  readonly maxRange: number;
  /** Les effets à masque ``a`` / ``A`` peuvent viser une case alliée (Aspiratrooll, Tir, Double Trooll). */
  readonly canHitAllyCell: boolean;
}

const infoCache = new WeakMap<CompiledSpellLevel, SpellInfo>();

const OFFENSIVE = new Set(['damage', 'lifeSteal', 'push', 'pushNoDamage', 'pull']);
const DAMAGE = new Set(['damage', 'lifeSteal']);

function scanEffects(b: Board, spell: CompiledSpellLevel, depth: number, acc: { off: boolean; dmg: boolean; heal: boolean; swap: boolean; radius: number; selfOnly: boolean; allyCell: boolean }): void {
  for (const e of spell.effects) {
    if (e.disabled) continue;
    const inc = e.mask.include;
    const onEnemy = inc.includes('A') || (inc.length === 0 && e.mask.camp !== null);
    const onSelfOnly = inc.every((l) => l === 'C' || l === 'c');
    if (!onSelfOnly && e.handler !== 'executeSubSpell') acc.selfOnly = false;
    if (OFFENSIVE.has(e.handler) && onEnemy) {
      acc.off = true;
      acc.radius = Math.max(acc.radius, e.zone.radius);
      if (inc.includes('a') && e.zone.radius < 1) acc.allyCell = true;
    }
    if (DAMAGE.has(e.handler) && onEnemy) acc.dmg = true;
    if (e.handler === 'heal' && (inc.includes('a') || inc.includes('g'))) acc.heal = true;
    if (e.handler === 'exchange' && (inc.includes('a') || inc.includes('g'))) acc.swap = true;
    if (e.handler === 'executeSubSpell' && depth < 2 && e.data.subSpell?.spellLevelId) {
      const id = e.data.subSpell.spellLevelId;
      if (b.env.ctx.hasSpell(id) && id !== spell.id) {
        const sub = b.env.ctx.getSpell(id);
        if (sub.spellId !== spell.spellId || true) scanEffects(b, sub, depth + 1, acc);
      }
    }
  }
}

/** Classification d'un sort pour l'IA. */
export function spellInfo(b: Board, spell: CompiledSpellLevel): SpellInfo {
  let info = infoCache.get(spell);
  if (info) return info;
  const acc = { off: false, dmg: false, heal: false, swap: false, radius: 0, selfOnly: true, allyCell: false };
  scanEffects(b, spell, 0, acc);
  const spec = spell.castSpec;
  const maxRange = spec.range;
  let targeting: SpellTargeting;
  if (maxRange === 0) targeting = 'self';
  else if (spec.needFreeCell) targeting = 'freeCell';
  else if (spell.effects.some((e) => e.zone.radius >= 1 && OFFENSIVE.has(e.handler))) targeting = 'area';
  else targeting = 'single';
  info = {
    spell,
    targeting,
    areaRadius: acc.radius,
    offensive: acc.off,
    damaging: acc.dmg,
    heals: acc.heal,
    swapsAlly: acc.swap,
    selfOnly: acc.selfOnly && !acc.off,
    reach: maxRange + acc.radius,
    minRange: spec.minRange,
    maxRange,
    canHitAllyCell: acc.allyCell,
  };
  infoCache.set(spell, info);
  return info;
}

/** Vrai si le combattant ``i`` est une cible « ennemie » valable pour l'acteur (vivant, sur la carte, pas le scénario). */
export function isEnemyOf(b: Board, actor: number, i: number): boolean {
  return b.isOn(i) && b.areEnemies(actor, i) && b.s.team[i] !== TEAM_SCENARIO;
}
