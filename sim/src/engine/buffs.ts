/**
 * Buffs (envoûtements) : structure, pose, activation, retrait, états dérivés.
 *
 * Un buff est posé par un effet de sort sur une cible (le porteur) : caractéristique (statBuff), état (950), état
 * désactivé (952), multiplicateur de dommages reçus (1163), bouclier (1040), seuil de PV (2872), bonus de dégâts de
 * base d'un sort (293), effet déclenché (déclencheurs ≠ I : TB, TE, D, X, EON#…), effet différé (delay > 0) ou
 * marqueur générique (140, 3407…).
 *
 * Ce module POSE, ACTIVE et RETIRE les buffs et tient à jour les agrégats (bonus de caractéristiques, états actifs,
 * masque des effets d'état). Le DÉCOMPTE des durées / délais (début de tour du lanceur) est dans turns.ts,
 * l'exécution des buffs déclenchés dans triggerProcessing.ts.
 *
 * Durée de vie d'un buff (en tours de son LANCEUR, ETUDE §9.10) :
 * - effet immédiat (déclencheur I) : ``duration`` des données ; −1 ou ≥ 63 = permanent ; 0 = « reste du tour »
 *   (retiré à la fin du tour en cours, ``untilTurnEnd`` ; cf. ``boss.catastroollBonusScope``) ;
 * - effet à déclencheurs (TB, D, EOFF#…, y compris les filtres d'un 1163) : ``triggerDuration`` des données (63 =
 *   tout le combat) ; ``duration`` est alors la durée de l'effet PRODUIT à chaque déclenchement ;
 * - ``delay`` : tours du lanceur avant activation (le décompte de la durée commence ensuite).
 * Empilement : au-delà de ``maxStack`` lancers distincts du même sort portés par la cible, un nouveau lancer n'ajoute
 * pas de buff (le cas des lancers validés est déjà refusé par ``canCast``) — indispensable pour les sous-sorts
 * relancés à chaque tour (objectifs, ``maxStack`` 1).
 */
import type { EffectHandler } from '../data/index.js';
import type { CompiledEffect } from './spells.js';
import { parseTriggers, TE_CASTER_SIDE, type ParsedTriggers } from './triggerTokens.js';
import type { Fighter } from './fighter.js';
import type { FightState } from './state.js';
import { Stat } from './stats.js';

export type BuffKind =
  | 'stat'
  | 'state'
  | 'disableState'
  | 'multiplier'
  | 'shield'
  | 'threshold'
  | 'spellModifier'
  | 'triggered'
  | 'delayed'
  | 'marker';

export class Buff {
  /** Identifiant unique dans l'état (séquence de ``FightState.newUid``). */
  uid = 0;
  kind: BuffKind = 'marker';
  /** Porteur. */
  targetId = -1;
  /** Lanceur (poseur) : c'est au début de SES tours que la durée est décomptée. */
  casterId = -1;
  /** Sort (et niveau) dont l'effet a créé le buff. */
  spellId = 0;
  spellLevelId = 0;
  /** Sort du lancer racine (premier lancer de la chaîne de sous-sorts / déclenchements). */
  rootSpellId = 0;
  /** Lancer ayant créé le buff. */
  castId = 0;
  /** Effet porté (effet compilé partagé : ``effect.data`` = données brutes, jamais modifiées). */
  effect: CompiledEffect | null = null;
  effectId = 0;
  handler: EffectHandler | '' = '';
  /**
   * Valeur : écart signé de caractéristique (stat), % du multiplicateur (1163), points de bouclier restants (1040),
   * seuil (2872), bonus de dégâts de base (293) ; jet pour un effet différé ou déclenché.
   */
  value = 0;
  /** Index de caractéristique (``Stat``) pour kind = 'stat', sinon −1. */
  stat = -1;
  /** État posé / désactivé (kind = 'state' | 'disableState'), sinon −1. */
  stateId = -1;
  /** Sort modifié (293), sinon −1. */
  modSpellId = -1;
  /** Tours restants (tours du lanceur) ; −1 = permanent. */
  duration = 0;
  /** Tours de délai restants avant activation. */
  delay = 0;
  /** Déclencheurs de l'effet (filtres pour 1163, événements pour 'triggered'). */
  triggers: readonly string[] = [];
  dispellable = 1;
  critical = false;
  /** Contribution appliquée (délai écoulé). */
  active = false;
  /** Posé avant le premier tour de son lanceur (non décompté à son premier début de tour, ETUDE §9.10). */
  beforeCasterFirstTurn = false;
  /** Tour global de pose. */
  turnAdded = 0;
  /** Déclenchements depuis le dernier début de tour du porteur. */
  triggerCount = 0;
  /** Déclenchements au total. */
  totalTriggers = 0;
  /** Déclenchements restants (−1 : illimité ; le buff est retiré à 0). */
  triggersLeft = -1;
  /** Buff déclenché à l'origine de la chaîne qui a créé ce buff (anti-boucle), −1 sinon. */
  originBuffUid = -1;
  /** Case ciblée du lancer d'origine (sous-sorts 2794 déclenchés). */
  targetedCell = -1;
  /** Lancer racine (lancer direct, application d'une marque, exécution d'un buff) ayant créé le buff. */
  rootCastId = 0;
  /** Durée 0 : retiré à la fin du tour en cours. */
  untilTurnEnd = false;
  /** Retiré après le prochain lancer direct de son lanceur (``boss.catastroollBonusScope`` = nextCastOnly). */
  untilNextCast = false;
  /** Jetons de déclenchement analysés (null : à analyser depuis ``triggers``). */
  parsed: ParsedTriggers | null = null;

  clone(): Buff {
    const b = new Buff();
    b.uid = this.uid;
    b.kind = this.kind;
    b.targetId = this.targetId;
    b.casterId = this.casterId;
    b.spellId = this.spellId;
    b.spellLevelId = this.spellLevelId;
    b.rootSpellId = this.rootSpellId;
    b.castId = this.castId;
    b.effect = this.effect;
    b.effectId = this.effectId;
    b.handler = this.handler;
    b.value = this.value;
    b.stat = this.stat;
    b.stateId = this.stateId;
    b.modSpellId = this.modSpellId;
    b.duration = this.duration;
    b.delay = this.delay;
    b.triggers = this.triggers;
    b.dispellable = this.dispellable;
    b.critical = this.critical;
    b.active = this.active;
    b.beforeCasterFirstTurn = this.beforeCasterFirstTurn;
    b.turnAdded = this.turnAdded;
    b.triggerCount = this.triggerCount;
    b.totalTriggers = this.totalTriggers;
    b.triggersLeft = this.triggersLeft;
    b.originBuffUid = this.originBuffUid;
    b.targetedCell = this.targetedCell;
    b.rootCastId = this.rootCastId;
    b.untilTurnEnd = this.untilTurnEnd;
    b.untilNextCast = this.untilNextCast;
    b.parsed = this.parsed;
    return b;
  }
}

/** Seuil de permanence des durées (≥ 63 ou −1 = tout le combat). */
export const PERMANENT_DURATION = 63;

/**
 * Durée permanente au sens du client (−1 ou ≥ 63). Une durée 0 signifie « reste du tour » pour un effet immédiat
 * (``Buff.untilTurnEnd``) ; un effet à déclencheurs utilise ``triggerDuration`` (voir l'en-tête).
 */
export function isPermanentDuration(d: number): boolean {
  return d < 0 || d >= PERMANENT_DURATION;
}

/** Jetons de déclenchement analysés d'un buff. */
export function buffTriggers(b: Buff): ParsedTriggers {
  if (!b.parsed) b.parsed = b.effect ? b.effect.triggerInfo : parseTriggers(b.triggers);
  return b.parsed;
}

/** Vrai si le lancer ``castId`` a déjà posé un buff du sort ``spellId`` sur ``target``. */
function hasCastBuff(target: Fighter, spellId: number, castId: number): boolean {
  for (const x of target.buffs) if (x.spellId === spellId && x.castId === castId) return true;
  return false;
}

/** Valeur de dispellable du client : 4 = jamais retiré, même à la mort du lanceur. */
export const REALLY_NOT_DISPELLABLE = 4;

/**
 * Pose un buff sur ``target`` (uid attribué) ; activé immédiatement si le délai est nul. Un buff au-delà du cumul
 * maximal du sort (``maxStack`` lancers distincts) n'est pas posé (renvoyé avec ``targetId`` = −1).
 */
export function addBuff(state: FightState, target: Fighter, b: Buff): Buff {
  if (b.spellLevelId > 0 && b.castId > 0 && state.ctx.hasSpell(b.spellLevelId)) {
    const maxStack = state.ctx.getSpell(b.spellLevelId).cast.maxStack;
    if (maxStack > 0 && !hasCastBuff(target, b.spellId, b.castId) && stackCount(target, b.spellId) >= maxStack) {
      b.targetId = -1;
      return b;
    }
  }
  if (b.uid === 0) b.uid = state.newUid();
  b.targetId = target.id;
  b.turnAdded = state.turn;
  if (b.duration === 0 && b.kind !== 'triggered' && b.kind !== 'delayed') b.untilTurnEnd = true;
  if (b.kind === 'triggered' && (buffTriggers(b).mask & TE_CASTER_SIDE) !== 0) state.hasCasterTriggers = true;
  target.buffs.push(b);
  if (state.logging) {
    state.emit({
      type: 'buffAdded',
      targetId: target.id,
      sourceId: b.casterId,
      buffUid: b.uid,
      kind: b.kind,
      effectId: b.effectId,
      value: b.value,
      duration: b.duration,
      delay: b.delay,
      stat: b.stat,
      spellLevelId: b.spellLevelId,
    });
  }
  if (b.delay <= 0) activateBuff(state, target, b);
  return b;
}

/** Applique la contribution d'un buff (fin de délai) : bonus de caractéristique, PV de vitalité, états. */
export function activateBuff(state: FightState, target: Fighter, b: Buff): void {
  if (b.active) return;
  b.active = true;
  b.delay = 0;
  switch (b.kind) {
    case 'stat':
      applyStatDelta(target, b.stat, b.value);
      break;
    case 'state':
    case 'disableState':
      refreshStates(state, target, b.casterId);
      break;
    default:
      break;
  }
}

/** Retire la contribution d'un buff sans le supprimer. */
function deactivateBuff(state: FightState, target: Fighter, b: Buff): void {
  if (!b.active) return;
  b.active = false;
  switch (b.kind) {
    case 'stat':
      applyStatDelta(target, b.stat, -b.value);
      break;
    case 'state':
    case 'disableState':
      refreshStates(state, target, b.casterId);
      break;
    default:
      break;
  }
}

function applyStatDelta(target: Fighter, stat: number, delta: number): void {
  if (stat < 0 || delta === 0) return;
  target.bonus[stat] = target.bonus[stat]! + delta;
  if (stat === Stat.VITALITY && target.alive) {
    // la vitalité modifie les PV max et les PV courants du même montant (jamais sous 1 PV)
    target.hp = Math.max(1, Math.min(target.hp + delta, target.maxHp));
  }
}

/** Supprime un buff (contribution retirée, événement ``buffRemoved``). */
export function removeBuff(state: FightState, target: Fighter, b: Buff, reason: string): void {
  const i = target.buffs.indexOf(b);
  if (i < 0) return;
  target.buffs.splice(i, 1);
  deactivateBuff(state, target, b);
  if (state.logging) {
    state.emit({ type: 'buffRemoved', targetId: target.id, buffUid: b.uid, kind: b.kind, effectId: b.effectId, reason });
  }
}

/** Supprime les buffs de ``target`` qui satisfont ``pred`` ; renvoie leur nombre. */
export function removeBuffsWhere(state: FightState, target: Fighter, pred: (b: Buff) => boolean, reason: string): number {
  let n = 0;
  for (let i = target.buffs.length - 1; i >= 0; i--) {
    const b = target.buffs[i]!;
    if (pred(b)) {
      removeBuff(state, target, b, reason);
      n++;
    }
  }
  return n;
}

/**
 * Recalcule les états effectifs du porteur (buffs d'état actifs, moins les états désactivés par 952) et le masque
 * des effets d'état ; émet ``stateAdded`` / ``stateRemoved`` et les déclencheurs EON / EOFF correspondants.
 */
export function refreshStates(state: FightState, target: Fighter, sourceId: number): void {
  const before = target.states;
  const disabled: number[] = [];
  for (const b of target.buffs) if (b.active && b.kind === 'disableState') disabled.push(b.stateId);
  const now: number[] = [];
  for (const b of target.buffs) {
    if (b.active && b.kind === 'state' && !disabled.includes(b.stateId) && !now.includes(b.stateId)) now.push(b.stateId);
  }
  let mask = 0;
  for (const s of now) mask |= state.ctx.stateEffectMask(s);
  target.states = now;
  target.stateMask = mask;
  for (const s of now) {
    if (!before.includes(s)) {
      if (state.logging) state.emit({ type: 'stateAdded', targetId: target.id, stateId: s, sourceId });
      state.queueTrigger({ type: 'stateOn', targetId: target.id, stateId: s, sourceId });
    }
  }
  for (const s of before) {
    if (!now.includes(s)) {
      if (state.logging) state.emit({ type: 'stateRemoved', targetId: target.id, stateId: s });
      state.queueTrigger({ type: 'stateOff', targetId: target.id, stateId: s, sourceId });
    }
  }
}

/** Bonus de dégâts de base (effets 293 actifs du lanceur) pour un sort. */
export function spellBaseDamageBonus(caster: Fighter, spellId: number): number {
  let s = 0;
  for (const b of caster.buffs) if (b.active && b.kind === 'spellModifier' && b.modSpellId === spellId) s += b.value;
  return s;
}

/** Seuil de PV actif le plus élevé (2872), −1 sinon. */
export function activeThreshold(f: Fighter): number {
  let t = -1;
  for (const b of f.buffs) if (b.active && b.kind === 'threshold' && b.value > t) t = b.value;
  return t;
}

/** Nombre de lancers distincts d'un sort dont des buffs sont encore portés par ``target`` (``maxStack``). */
export function stackCount(target: Fighter, spellId: number): number {
  const casts: number[] = [];
  for (const b of target.buffs) if (b.spellId === spellId && !casts.includes(b.castId)) casts.push(b.castId);
  return casts.length;
}

/**
 * Absorbe des dommages par les boucliers actifs (dans l'ordre de pose) ; supprime les boucliers épuisés.
 * Renvoie la quantité absorbée.
 */
export function consumeShields(state: FightState, target: Fighter, amount: number): number {
  let left = amount;
  for (let i = 0; i < target.buffs.length && left > 0; i++) {
    const b = target.buffs[i]!;
    if (!b.active || b.kind !== 'shield' || b.value <= 0) continue;
    const take = Math.min(b.value, left);
    b.value -= take;
    left -= take;
  }
  removeBuffsWhere(state, target, (b) => b.kind === 'shield' && b.value <= 0, 'bouclier épuisé');
  return amount - left;
}
