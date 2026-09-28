/**
 * Résolution d'un lancer (ETUDE §9.12, N70 §9) :
 *
 *   vérifier (PA, portée, LdV, limites) → PA dépensés, compteurs → tirage critique (un par lancer, hérité par les
 *   sous-sorts) → liste critique si critique (elle REMPLACE la liste normale) ; effets exec seulement →
 *   positions figées (snapshot) → cibles de CHAQUE effet calculées d'avance → pour chaque effet dans l'ordre :
 *     déclencheurs ≠ I : buff déclenché posé sur chaque cible ;
 *     délai > 0 (effet non durable) : buff différé ;
 *     sinon : gestionnaire appliqué à chaque cible (ordre §9.4) puis vidage des déclenchements.
 *
 * ``castSpell`` = lancer d'un combattant (validation, coût) ; ``resolveSpell`` = résolution seule (sous-sorts,
 * scénario, déclenchements) ; ``executeBuffEffect`` = exécution de l'effet porté par un buff (fin de délai ou
 * déclenchement), pour l'étape « tours et déclencheurs ».
 */
import type { Buff } from './buffs.js';
import { addBuff, isPermanentDuration, removeBuff } from './buffs.js';
import { makeBuff } from './effects/common.js';
import { DURABLE_HANDLERS, ONCE_HANDLERS } from './effects/kinds.js';
import { makeCastContext, type CastContext, type EffectApplication } from './effects/types.js';
import type { Fighter } from './fighter.js';
import { flushDeferredEnters } from './movement.js';
import { criticalChance, rollCritical } from './rng.js';
import { SPELL_IDS, type CompiledEffect, type CompiledSpellLevel } from './spells.js';
import type { FightState } from './state.js';
import { Stat } from './stats.js';
import { selectTargets, type TargetSelection } from './targeting.js';
import { flushTriggers } from './triggerQueue.js';
import { canCast, type CastFailCode } from './validation.js';

export interface CastOptions {
  /** Ne pas vérifier les conditions de lancer (scénario, tests). Implique par défaut : pas de coût, pas de compteur. */
  ignoreConditions?: boolean;
  /** Dépenser les PA (défaut : !ignoreConditions). */
  payAp?: boolean;
  /** Compter le lancer (par tour, par cible, relance) (défaut : !ignoreConditions). */
  countCast?: boolean;
  /** Imposer le résultat du tirage critique. */
  critical?: boolean;
  /** Le sort doit être dans le grimoire (défaut vrai). */
  requireKnown?: boolean;
  /** Filtre d'effets. */
  effectFilter?: (e: CompiledEffect) => boolean;
}

export interface CastResult {
  ok: boolean;
  code?: CastFailCode;
  reason?: string;
  castId: number;
  critical: boolean;
}

/** Lancer d'un sort par un combattant sur une case (validation, PA, compteurs, résolution, déclenchements). */
export function castSpell(
  state: FightState,
  casterId: number,
  spellLevelId: number,
  cell: number,
  o: CastOptions = {},
): CastResult {
  const caster = state.fighters[casterId];
  if (!o.ignoreConditions) {
    const chk = canCast(state, casterId, spellLevelId, cell, { requireKnown: o.requireKnown });
    if (!chk.ok) {
      if (caster && state.logging) {
        state.emit({ type: 'castFailed', casterId, spellLevelId, cell, code: chk.code!, reason: chk.reason! });
      }
      return { ok: false, code: chk.code, reason: chk.reason, castId: 0, critical: false };
    }
  } else if (!caster || !state.ctx.hasSpell(spellLevelId)) {
    return { ok: false, code: caster ? 'UNKNOWN_SPELL' : 'UNKNOWN_FIGHTER', reason: 'lanceur ou sort inconnu', castId: 0, critical: false };
  }
  const spell = state.ctx.getSpell(spellLevelId);
  const apCost = (o.payAp ?? !o.ignoreConditions) ? spell.cast.ap : 0;
  if (apCost > 0) caster!.apUsed += apCost;
  if (o.countCast ?? !o.ignoreConditions) recordCast(state, caster!, spell, cell);
  const castId = state.newUid();
  const expiring = untilNextCastBuffs(state, caster!.id);
  const res = resolveSpell(
    state,
    caster!,
    spell,
    cell,
    { depth: 0, castId, rootCastId: castId, critical: o.critical ?? null, effectFilter: o.effectFilter ?? null },
    apCost,
  );
  finishAction(state);
  if (expiring) {
    for (const b of expiring) {
      const t = state.fighters[b.targetId];
      if (t) removeBuff(state, t, b, 'consommé par le lancer suivant');
    }
    finishAction(state);
  }
  return { ok: true, castId, critical: res.critical };
}

/** Buffs « jusqu'au prochain lancer » posés par ``casterId`` (``boss.catastroollBonusScope`` = nextCastOnly). */
function untilNextCastBuffs(state: FightState, casterId: number): Buff[] | null {
  let out: Buff[] | null = null;
  for (const f of state.fighters) {
    for (const b of f.buffs) {
      if (b.untilNextCast && b.casterId === casterId) (out ??= []).push(b);
    }
  }
  return out;
}

/** Compteurs de lancers (par tour, par cible, dernier tour, relance globale). */
export function recordCast(state: FightState, caster: Fighter, spell: CompiledSpellLevel, cell: number): void {
  const rec = caster.castRecordOrCreate(spell.spellId);
  rec.turnCasts += 1;
  rec.lastTurn = caster.turnCount;
  const t = state.fighterAt(cell);
  if (t) rec.targets.push(t.id);
  if (spell.cast.globalCooldown > 0) {
    const g = state.globalCooldowns.find((x) => x.team === caster.team && x.spellId === spell.spellId);
    if (g) g.turn = state.turn;
    else state.globalCooldowns.push({ team: caster.team, spellId: spell.spellId, turn: state.turn });
  }
}

/** Fin d'une action de premier niveau : déclenchements, arrivées différées (``spikes.auraAppliesMidSpell``). */
export function finishAction(state: FightState): void {
  flushTriggers(state);
  if (state.castDepth === 0 && state.deferredEnters.length) flushDeferredEnters(state);
  flushTriggers(state);
}

export interface ResolveResult {
  critical: boolean;
  castId: number;
  /** Faux si la profondeur maximale est dépassée. */
  resolved: boolean;
}

/** Positions de tous les combattants (case de mort pour un mort, −1 hors carte). */
export function takeSnapshot(state: FightState): Int16Array {
  const n = state.fighters.length;
  const s = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const f = state.fighters[i]!;
    s[i] = f.alive ? f.cell : f.deathCell;
  }
  return s;
}

/**
 * Résout un niveau de sort lancé par ``caster`` sur ``targetedCell`` (sans validation ni coût). Utilisé pour les
 * sous-sorts, les sorts du scénario et des marques, et par ``castSpell``.
 */
export function resolveSpell(
  state: FightState,
  caster: Fighter,
  spell: CompiledSpellLevel,
  targetedCell: number,
  partial: Partial<CastContext> = {},
  apCost = 0,
): ResolveResult {
  const cctx = makeCastContext(partial);
  const maxDepth = state.ctx.config.engine.maxSubSpellDepth;
  if (cctx.depth > maxDepth) {
    if (state.logging) state.emit({ type: 'info', message: `Profondeur maximale de sous-sorts atteinte (${maxDepth}) : ${spell.name} ignoré.` });
    return { critical: false, castId: 0, resolved: false };
  }
  const castId = cctx.castId || state.newUid();
  cctx.castId = castId;
  if (!cctx.rootCastId) cctx.rootCastId = castId;
  if (!cctx.rootSpellId) cctx.rootSpellId = spell.spellId;
  let critical: boolean;
  if (cctx.critical !== null) critical = cctx.critical;
  else critical = rollCritical(state.rng, criticalChance(spell.cast.critRate, caster.stat(Stat.CRIT)), state.critMode);
  const list = critical && spell.hasCritList ? spell.critEffects : spell.effects;
  if (state.logging) {
    state.emit({
      type: 'cast',
      casterId: caster.id,
      spellLevelId: spell.id,
      spellId: spell.spellId,
      cell: targetedCell,
      critical,
      castId,
      depth: cctx.depth,
      apCost,
    });
  }
  state.queueTrigger({
    type: 'cast',
    casterId: caster.id,
    spellId: spell.spellId,
    spellLevelId: spell.id,
    cell: targetedCell,
    castId,
    depth: cctx.depth,
    originBuffUid: cctx.originBuffUid,
    critical,
  });
  const snapshot = takeSnapshot(state);
  const casterCellBefore = caster.cell;
  const mctx = { triggerSourceId: cctx.triggerSourceId, allowDeadCaster: cctx.allowDeadCaster };
  const selections: TargetSelection[] = list.map((e) =>
    selectTargets(state, caster, e, targetedCell, casterCellBefore, snapshot, mctx),
  );
  const handlers = state.ctx.handlers;
  state.castDepth++;
  try {
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.disabled || (cctx.effectFilter && !cctx.effectFilter(e))) continue;
      const sel = selections[i]!;
      const app: EffectApplication = {
        state,
        caster,
        spell,
        effect: e,
        targetedCell,
        casterCellBefore,
        snapshot,
        critical,
        castId,
        cctx,
        additional: false,
        roll: null,
        execCount: 0,
        fromBuff: false,
      };
      if (e.eventTriggers.length > 0) {
        for (const t of sel.targets) {
          if (!t.alive) continue;
          const b = makeBuff(app, 'triggered', 0);
          if (t === caster) selfTriggerException(state, spell, b);
          addBuff(state, t, b);
        }
      }
      if (!e.immediate) continue;
      const handler = handlers.get(e.handler);
      if (!handler) {
        if (state.logging) {
          state.emit({ type: 'effectIgnored', effectId: e.effectId, handler: e.handler, spellLevelId: spell.id, reason: 'gestionnaire absent' });
        }
        continue;
      }
      if (e.data.delay > 0 && !DURABLE_HANDLERS.has(e.handler)) {
        for (const t of sel.targets) if (t.alive) addBuff(state, t, makeBuff(app, 'delayed', 0));
        continue;
      }
      if (ONCE_HANDLERS.has(e.handler) || (e.handler === 'executeSubSpell' && isCellOnlyExecutor(state, e))) {
        handler(app, null);
        flushTriggers(state);
        continue;
      }
      for (const t of sel.targets) {
        // morts : résurrection, ou lanceur mort qui exécute un sous-sort sur lui-même (effet de mort X / XD)
        if (!t.alive && e.handler !== 'resurrect' && !(t === caster && cctx.allowDeadCaster && e.handler === 'executeSubSpell')) {
          continue;
        }
        app.additional = sel.additional.length > 0 && sel.additional.includes(t.id);
        handler(app, t);
        flushTriggers(state);
      }
    }
  } finally {
    state.castDepth--;
  }
  if (state.castDepth === 0) finishAction(state);
  return { critical, castId, resolved: true };
}

/**
 * Exception ``spells.protectionProlongeeSelfHeals`` : Protection Prolongée lancée sur soi. Le soin TB (durée de
 * déclenchement 2) est décompté au début du tour du lanceur-porteur, donc AVANT de se déclencher (ordre par défaut) :
 * 1 soin. La durée est ajustée pour obtenir le nombre de soins configuré, quel que soit l'ordre du début de tour.
 */
function selfTriggerException(state: FightState, spell: CompiledSpellLevel, b: Buff): void {
  const sid = spell.spellId;
  if (sid !== SPELL_IDS.protectionProlongee && sid !== SPELL_IDS.protectionProlongeeUpgraded) return;
  if (!b.triggers.includes('TB') || isPermanentDuration(b.duration)) return;
  const cfg = state.ctx.config;
  const natural = cfg.engine.turnStartTriggersBeforeDecrement ? b.duration : b.duration - 1;
  b.duration = Math.max(1, b.duration + cfg.spells.protectionProlongeeSelfHeals - natural);
}

function isCellOnlyExecutor(state: FightState, e: CompiledEffect): boolean {
  const ex = e.catalog?.executor ?? state.ctx.data.rules.subSpellExecutors[String(e.effectId)];
  return ex?.cell === 'targetedCell';
}

export interface BuffExecution {
  /** Combattant à l'origine de l'événement (attaquant pour D, tué pour K…), −1 sinon. */
  triggerSourceId?: number;
  /** Dommages de l'événement (1123, 1223, 2020). */
  triggerDamage?: { initial: number; final: number } | null;
  /** Case ciblée (défaut : case ciblée du lancer d'origine, sinon case du porteur). */
  targetedCell?: number;
  /** Profondeur de l'événement (défaut 0). */
  depth?: number;
  /** Exécuter même si le porteur est mort (déclencheurs de mort 'X', 'XD', 'XPD'). */
  allowDead?: boolean;
  /** L'effet vient d'une marque (glyphe, aura). */
  fromMark?: boolean;
}

/**
 * Exécute l'effet porté par un buff (effet déclenché, ou effet différé en fin de délai) : lanceur = poseur du buff,
 * cible = porteur (ETUDE §9.10, N70 §3.5) ; le buff est l'origine de la chaîne (anti-boucle : ``originBuffUid``).
 * Pour un buff durable (stat, état…) arrivé en fin de délai, utiliser plutôt ``activateBuff``.
 */
export function executeBuffEffect(state: FightState, buff: Buff, ex: BuffExecution = {}): void {
  const e = buff.effect;
  const carrier = state.fighters[buff.targetId];
  const caster = state.fighters[buff.casterId] ?? carrier;
  if (!e || !carrier || !caster) return;
  const handler = state.ctx.handlers.get(e.handler);
  if (!handler) return;
  const spell = state.ctx.getSpell(buff.spellLevelId);
  const castId = state.newUid();
  const cctx = makeCastContext({
    depth: (ex.depth ?? 0) + 1,
    critical: buff.critical,
    castId,
    rootCastId: castId,
    rootSpellId: buff.rootSpellId,
    originBuffUid: buff.uid,
    triggerSourceId: ex.triggerSourceId ?? -1,
    buffCarrierId: carrier.id,
    parentTargetedCell: buff.targetedCell,
    triggerDamage: ex.triggerDamage ?? null,
    fromMark: ex.fromMark ?? false,
    allowDeadCaster: ex.allowDead ?? false,
  });
  const app: EffectApplication = {
    state,
    caster,
    spell,
    effect: e,
    targetedCell: ex.targetedCell ?? (carrier.alive ? (carrier.cell >= 0 ? carrier.cell : buff.targetedCell) : carrier.deathCell),
    casterCellBefore: caster.cell,
    snapshot: takeSnapshot(state),
    critical: buff.critical,
    castId: cctx.castId,
    cctx,
    additional: true,
    roll: null,
    execCount: 0,
    fromBuff: true,
  };
  state.castDepth++;
  try {
    if (ONCE_HANDLERS.has(e.handler)) handler(app, null);
    else if (carrier.alive || ex.allowDead || e.handler === 'resurrect') handler(app, carrier);
  } finally {
    state.castDepth--;
  }
  if (state.castDepth === 0) finishAction(state);
  else flushTriggers(state);
}
