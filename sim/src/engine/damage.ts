/**
 * Application des dégâts et des soins sur l'état (ETUDE §9.5-§9.8) : interception (765), invulnérabilités,
 * multiplicateurs 1163 portés, boucliers, seuil de PV (2872, événement ``threshold`` → jeton TR#), érosion, vol de
 * vie, mort. Les formules elles-mêmes sont dans formulas.ts.
 */
import { areAdjacent } from '../geometry/index.js';
import { buffTriggers, consumeShields, REALLY_NOT_DISPELLABLE, removeBuffsWhere, type Buff } from './buffs.js';
import { chainHas } from './triggers.js';
import { damageTokenMatches, TE_DAMAGE, type DamageTokenContext } from './triggerTokens.js';
import type { DeathCause } from './events.js';
import {
  effectiveElement,
  erodedDamage,
  healAmount,
  receiveDamage,
  type DamageResult,
} from './formulas.js';
import {
  SE_INVULNERABLE,
  SE_INVULNERABLE_AIR,
  SE_INVULNERABLE_CRIT,
  SE_INVULNERABLE_EARTH,
  SE_INVULNERABLE_FIRE,
  SE_INVULNERABLE_MELEE,
  SE_INVULNERABLE_NEUTRAL,
  SE_INVULNERABLE_PUSH,
  SE_INVULNERABLE_RANGED,
  SE_INVULNERABLE_SUMMONS,
  SE_INVULNERABLE_WATER,
  type Fighter,
} from './fighter.js';
import type { FightState } from './state.js';
import { EL_AIR, EL_EARTH, EL_FIRE, EL_NEUTRAL, EL_WATER } from './stats.js';

/** Action « dommages de poussée ». */
export const COLLISION_ACTION = 80;

export interface DamageOptions {
  /** Action (effectId) : classification (boostable, faux dommages, vol de vie…) et élément. */
  actionId: number;
  /** Élément de repli si l'action n'est pas dans la table du client. */
  fallbackElement?: number;
  /** Effet de la liste critique. */
  critical?: boolean;
  /** Mêlée : par défaut, lanceur adjacent à la cible au moment du coup. */
  melee?: boolean;
  collision?: boolean;
  pushIndex?: number;
  /** Dommages de glyphe (déclencheurs DG). */
  glyph?: boolean;
  /** Érosion appliquée (défaut vrai). */
  erosion?: boolean;
  spellId?: number;
  spellLevelId?: number;
  castId?: number;
  originBuffUid?: number;
  /** Dommages déjà interceptés (765) : pas de nouvelle interception. */
  intercepted?: boolean;
}

export interface DamageOutcome extends DamageResult {
  /** La cible est morte de ce coup. */
  killed: boolean;
  /** Combattant qui a réellement subi les dommages (intercepteur 765), sinon la cible. */
  receiverId?: number;
}

const NO_DAMAGE: DamageOutcome = {
  raw: 0,
  afterResist: 0,
  final: 0,
  shieldAbsorbed: 0,
  lifeLoss: 0,
  eroded: 0,
  lifeStealHeal: 0,
  invulnerable: false,
  killed: false,
};

const ELEMENT_INVULNERABILITY: Record<number, number> = {
  [EL_FIRE]: SE_INVULNERABLE_FIRE,
  [EL_AIR]: SE_INVULNERABLE_AIR,
  [EL_WATER]: SE_INVULNERABLE_WATER,
  [EL_EARTH]: SE_INVULNERABLE_EARTH,
  [EL_NEUTRAL]: SE_INVULNERABLE_NEUTRAL,
};

/** ``HaxeFighter.isInvulnerableTo`` : effets d'état 7, 19/20 (mêlée/distance), 21-25 (élément), 26, 27, 31. */
export function isInvulnerableTo(
  target: Fighter,
  source: Fighter,
  o: { melee: boolean; element: number; collision: boolean; critical: boolean },
): boolean {
  const m = target.stateMask;
  if (m === 0) return false;
  if (target.hasStateEffect(SE_INVULNERABLE)) return true;
  if (o.collision) return target.hasStateEffect(SE_INVULNERABLE_PUSH);
  if (target.hasStateEffect(o.melee ? SE_INVULNERABLE_MELEE : SE_INVULNERABLE_RANGED)) return true;
  const se = ELEMENT_INVULNERABILITY[o.element];
  if (se !== undefined && target.hasStateEffect(se)) return true;
  if (o.critical && target.hasStateEffect(SE_INVULNERABLE_CRIT)) return true;
  if (source.isSummon && target.hasStateEffect(SE_INVULNERABLE_SUMMONS)) return true;
  return false;
}

function* activeMultipliers(target: Fighter): Generator<Buff> {
  for (const b of target.buffs) if (b.active && b.kind === 'multiplier') yield b;
}

/** Mêlée : lanceur ≠ cible et cases adjacentes au moment du coup. */
export function isMelee(source: Fighter, target: Fighter): boolean {
  return source !== target && source.cell >= 0 && target.cell >= 0 && areAdjacent(source.cell, target.cell);
}

/** Seuil de PV actif le plus élevé (2872) : le buff, ou null. */
function thresholdBuff(f: Fighter): Buff | null {
  let best: Buff | null = null;
  for (const b of f.buffs) if (b.active && b.kind === 'threshold' && (!best || b.value > best.value)) best = b;
  return best;
}

/**
 * Interception (765, Immortalité du Courageux) : buff déclenché actif du porteur dont un jeton de dommages
 * correspond au coup et dont le lanceur (l'intercepteur) est vivant et distinct du porteur ; null sinon.
 */
function findInterception(state: FightState, target: Fighter, h: DamageTokenContext): Buff | null {
  for (const b of target.buffs) {
    if (!b.active || b.kind !== 'triggered' || b.effectId !== 765 || b.casterId === target.id) continue;
    const p = buffTriggers(b);
    if ((p.mask & TE_DAMAGE) === 0 || chainHas(state.triggerChain, b.uid)) continue;
    const who = state.fighters[b.casterId];
    if (!who || !who.alive) continue;
    for (const t of p.tokens) if (damageTokenMatches(t, h)) return b;
  }
  return null;
}

/**
 * Applique des dégâts SORTANTS (déjà boostés et dégressés) à ``target`` : réception complète (résistances,
 * invulnérabilité, multiplicateurs, 1163, bouclier, seuil, érosion), vol de vie, mort. Événements et déclencheurs.
 */
export function applyDamage(
  state: FightState,
  source: Fighter,
  target: Fighter,
  raw: number,
  o: DamageOptions,
): DamageOutcome {
  if (!target.alive) return NO_DAMAGE;
  if (source.pacifist) return NO_DAMAGE;
  const collision = o.collision ?? false;
  const melee = o.melee ?? isMelee(source, target);
  const element = effectiveElement(o.actionId, source, o.fallbackElement ?? -1);
  const critical = o.critical ?? false;
  if (!collision && !o.intercepted && target.buffs.length) {
    const ib = findInterception(state, target, {
      collision,
      pushIndex: 0,
      element,
      melee,
      allySource: source.team === target.team,
      critical,
      glyph: o.glyph ?? false,
      sourceIsSummon: source.isSummon,
      fromTrigger: state.triggerChain.length > 0,
      lifeLoss: 1,
      eroded: 0,
    });
    if (ib) {
      // les dommages sont recalculés sur l'intercepteur (ses résistances, ses 1163) — hypothèse documentée
      const interceptor = state.fighters[ib.casterId]!;
      if (state.logging) {
        state.emit({ type: 'intercepted', interceptorId: interceptor.id, targetId: target.id, sourceId: source.id, buffUid: ib.uid });
      }
      const prev = state.triggerChain;
      state.triggerChain = [...prev, { uid: ib.uid, spellId: ib.spellId }];
      try {
        const out = applyDamage(state, source, interceptor, raw, { ...o, melee, intercepted: true });
        return { ...out, receiverId: interceptor.id };
      } finally {
        state.triggerChain = prev;
      }
    }
  }
  const invulnerable = isInvulnerableTo(target, source, { melee, element, collision, critical });
  const res = receiveDamage(raw, o.actionId, source, target, {
    melee,
    criticalEffect: critical,
    multipliers: activeMultipliers(target),
    invulnerable,
    allySource: source.team === target.team,
    glyph: o.glyph ?? false,
    casterIsSummon: source.isSummon,
    collision,
    pushIndex: o.pushIndex ?? 0,
    fallbackElement: o.fallbackElement ?? -1,
    erosion: o.erosion ?? true,
    casterIncurable: source.incurable,
  });
  let lifeLoss = res.lifeLoss;
  let eroded = res.eroded;
  let thresholdHit: Buff | null = null;
  let overflow = 0;
  if (lifeLoss > 0) {
    const tb = thresholdBuff(target);
    if (tb) {
      const maxLoss = Math.max(0, target.hp - tb.value);
      if (lifeLoss >= maxLoss) {
        thresholdHit = tb;
        overflow = lifeLoss - maxLoss;
        if (overflow > 0) {
          lifeLoss = maxLoss;
          eroded = o.erosion === false ? 0 : erodedDamage(lifeLoss, target);
        }
      }
    }
  }
  if (res.shieldAbsorbed > 0) consumeShields(state, target, res.shieldAbsorbed);
  target.hp -= lifeLoss;
  target.erodedHp += eroded;
  const castId = o.castId ?? 0;
  const originBuffUid = o.originBuffUid ?? -1;
  if (state.logging) {
    state.emit({
      type: 'damage',
      sourceId: source.id,
      targetId: target.id,
      amount: lifeLoss,
      shieldAbsorbed: res.shieldAbsorbed,
      eroded,
      final: res.final,
      element,
      critical,
      collision,
      pushIndex: o.pushIndex ?? 0,
      invulnerable: res.invulnerable,
      spellLevelId: o.spellLevelId ?? 0,
      hpAfter: Math.max(0, target.hp),
    });
  }
  if (res.final > 0) {
    state.queueTrigger({
      type: 'damage',
      targetId: target.id,
      sourceId: source.id,
      amount: lifeLoss,
      initial: raw,
      final: res.final,
      shieldAbsorbed: res.shieldAbsorbed,
      eroded,
      collision,
      pushIndex: o.pushIndex ?? 0,
      element,
      melee,
      critical,
      allySource: source.team === target.team,
      glyph: o.glyph ?? false,
      sourceIsSummon: source.isSummon,
      spellId: o.spellId ?? 0,
      castId,
      originBuffUid,
    });
  }
  if (thresholdHit) {
    state.queueTrigger({
      type: 'threshold',
      targetId: target.id,
      sourceId: source.id,
      spellId: thresholdHit.spellId,
      overflow,
      castId,
      originBuffUid,
    });
  }
  let stealHeal = 0;
  if (res.lifeStealHeal > 0 && source.alive) {
    // plafonné aux PV manquants du lanceur au moment du soin
    stealHeal = Math.min(res.lifeStealHeal, Math.max(0, source.maxHp - source.hp));
    if (stealHeal > 0) {
      source.hp += stealHeal;
      if (state.logging) {
        state.emit({
          type: 'heal',
          sourceId: source.id,
          targetId: source.id,
          amount: stealHeal,
          lifeSteal: true,
          spellLevelId: o.spellLevelId ?? 0,
          hpAfter: source.hp,
        });
      }
      state.queueTrigger({ type: 'heal', targetId: source.id, sourceId: source.id, amount: stealHeal, castId, originBuffUid });
    }
  }
  let killed = false;
  if (target.hp <= 0) {
    killFighter(state, target, source.id, collision ? 'pushDamage' : 'damage', castId, originBuffUid, {
      initial: raw,
      final: res.final,
    });
    killed = true;
  }
  return { ...res, lifeLoss, eroded, lifeStealHeal: stealHeal, killed };
}

/**
 * Perte de PV directe, déjà réduite (dommages au-delà d'un seuil, ``spells.bienfaiteurOverflowLost`` = false ; malus de
 * PV 1048) : seuil de PV restant respecté, journal, mort ; ni résistance, ni bouclier, ni multiplicateur 1163, ni
 * déclencheur de dommages ; érosion seulement si ``erosion`` (``spells.coupDeSangCreatesErosion`` pour 1048).
 */
export function applyDirectLifeLoss(
  state: FightState,
  source: Fighter,
  target: Fighter,
  amount: number,
  castId = 0,
  o: { erosion?: boolean; spellLevelId?: number } = {},
): number {
  if (!target.alive || amount <= 0) return 0;
  let loss = amount;
  const tb = thresholdBuff(target);
  if (tb) loss = Math.min(loss, Math.max(0, target.hp - tb.value));
  if (loss <= 0) return 0;
  const eroded = o.erosion ? erodedDamage(loss, target) : 0;
  target.hp -= loss;
  target.erodedHp += eroded;
  if (state.logging) {
    state.emit({
      type: 'damage',
      sourceId: source.id,
      targetId: target.id,
      amount: loss,
      shieldAbsorbed: 0,
      eroded,
      final: loss,
      element: -1,
      critical: false,
      collision: false,
      pushIndex: 0,
      invulnerable: false,
      spellLevelId: o.spellLevelId ?? 0,
      hpAfter: Math.max(0, target.hp),
    });
  }
  if (target.hp <= 0) killFighter(state, target, source.id, 'damage', castId);
  return loss;
}

/**
 * Soigne ``target`` d'une valeur déjà boostée et dégressée : × soins finaux du lanceur (sauf 90, 407, 1109, 2020,
 * 2973), plafond aux PV manquants, 0 si incurable. Renvoie les PV rendus.
 */
export function applyHeal(
  state: FightState,
  source: Fighter,
  target: Fighter,
  value: number,
  actionId: number,
  o: { spellLevelId?: number; castId?: number; originBuffUid?: number } = {},
): number {
  if (!target.alive) return 0;
  const v = healAmount(value, target, source, actionId, target.incurable);
  if (v <= 0) return 0;
  target.hp += v;
  if (state.logging) {
    state.emit({
      type: 'heal',
      sourceId: source.id,
      targetId: target.id,
      amount: v,
      lifeSteal: false,
      spellLevelId: o.spellLevelId ?? 0,
      hpAfter: target.hp,
    });
  }
  state.queueTrigger({
    type: 'heal',
    targetId: target.id,
    sourceId: source.id,
    amount: v,
    castId: o.castId ?? 0,
    originBuffUid: o.originBuffUid ?? -1,
  });
  return v;
}

/**
 * Mort d'un combattant : PV à 0, case libérée (``deathCell`` conservée), événement ``death`` et déclencheur
 * ``death`` (X / XD / XPD côté victime, K côté tueur) ; ses invocations meurent avec lui. Avec ``engine.removeBuffsOfDeadCaster``, les envoûtements
 * qu'il a lancés sur les AUTRES combattants sont retirés (sauf dispellable = 4) ; ses propres buffs restent
 * (inertes) pour que les déclencheurs de mort puissent être traités.
 */
export function killFighter(
  state: FightState,
  f: Fighter,
  killerId: number,
  cause: DeathCause,
  castId = 0,
  originBuffUid = -1,
  damage?: { initial: number; final: number },
): void {
  if (!f.alive) return;
  const cell = f.cell;
  f.hp = 0;
  f.alive = false;
  f.deathCell = cell;
  f.deathSeq = state.newUid();
  state.setCell(f, -1);
  if (state.logging) state.emit({ type: 'death', fighterId: f.id, killerId, cause, cell });
  state.queueTrigger({
    type: 'death',
    targetId: f.id,
    killerId,
    cause,
    castId,
    originBuffUid,
    initial: damage?.initial ?? 0,
    final: damage?.final ?? 0,
  });
  // les invocations meurent avec leur invocateur (règle DOFUS)
  for (const other of state.fighters) {
    if (other.alive && other.summonerId === f.id) killFighter(state, other, killerId, 'other', castId, originBuffUid);
  }
  if (state.ctx.config.engine.removeBuffsOfDeadCaster) {
    for (const other of state.fighters) {
      if (other === f || other.buffs.length === 0) continue;
      removeBuffsWhere(
        state,
        other,
        (b) => b.casterId === f.id && b.dispellable < REALLY_NOT_DISPELLABLE,
        'lanceur mort',
      );
    }
  }
}

/**
 * Niveau utilisé pour les dommages de collision (N70 §5.3) : archétype → ``engine.pushLevelForArchetypes`` (Q38) ;
 * Mama (7984) → ``boss.levelForPushDamage`` (Q25) ; invocation → niveau de son invocateur ; sinon niveau propre.
 */
export function pushLevel(state: FightState, source: Fighter): number {
  if (source.isSummon) {
    const s = state.fighters[source.summonerId];
    if (s) return pushLevel(state, s);
  }
  if (source.kind === 'archetype') return state.ctx.config.engine.pushLevelForArchetypes;
  if (source.monsterId === state.ctx.data.boss.monsterId) return state.ctx.config.boss.levelForPushDamage;
  return source.level;
}
