/**
 * Exécution des buffs déclenchés (ETUDE §9.10, N70 §3.5, notes 30 §1) : pour chaque événement de la file
 * (triggers.ts), les buffs « déclenchés » (genre 'triggered' : effets à déclencheurs ≠ I) dont un jeton correspond
 * sont exécutés, dans l'ordre de pose, avec pour LANCEUR le poseur du buff et pour CIBLE son porteur
 * (``executeBuffEffect``) ; un sous-sort 792 / 1017 / 1018 / 1019… choisit ensuite son lanceur et sa case selon
 * ``solveSpellExecution``.
 *
 * Règles :
 * - un buff n'est déclenché que s'il est actif (délai écoulé), posé AVANT l'événement (``seq``), porté par un
 *   combattant vivant (sauf jetons de mort X / XD / XPD, exécutés sur le mort, case de sa mort) et s'il lui reste des
 *   déclenchements (``triggersLeft``) ;
 * - anti-boucle : un buff ne se redéclenche pas sur un événement produit (directement ou non) par sa propre
 *   exécution (chaîne ``TriggerEvent.chain``) ;
 * - un coup mortel ne déclenche pas D (le porteur est mort) mais XD (hypothèse : XD = mort par dommages hors poussée,
 *   XPD = mort par dommages de poussée ; les deux reçoivent les dommages du coup mortel pour 1123 / 1223 / 2020) ;
 * - compteurs : ``triggerCount`` (remis à zéro au début de tour du porteur), ``totalTriggers`` ; un buff dont
 *   ``triggersLeft`` tombe à 0 est retiré.
 * Exceptions paramétrées (sorts uniques, logique serveur) : ``spells.maledictionMouvanteOnGlyphDamage`` (les
 * dommages de glyphe ne déclenchent pas 30617), ``spells.maledictionCollateraleChains`` (un renvoi de 30613 ne
 * déclenche pas un autre 30613 s'il vaut false), ``spells.bienfaiteurOverflowLost`` (dommages au-delà du seuil de
 * 30620 appliqués après ses effets TR s'il vaut false).
 */
import { buffTriggers, removeBuff, type Buff } from './buffs.js';
import { executeBuffEffect } from './cast.js';
import { applyDirectLifeLoss } from './damage.js';
import type { Fighter } from './fighter.js';
import { marksOnDeath } from './marks.js';
import { SPELL_IDS } from './spells.js';
import type { FightState } from './state.js';
import { chainHas, chainHasSpell, EMPTY_CHAIN, type TriggerChain, type TriggerEvent } from './triggers.js';
import {
  matchesCasterDamage,
  matchesDamage,
  matchesDeath,
  matchesHeal,
  matchesMove,
  TE_CASTER_CRIT,
  TE_CASTER_DAMAGE,
  TE_CASTER_HEAL,
  TE_CASTER_MOVE,
  TE_CAST,
  TE_DAMAGE,
  TE_DEATH,
  TE_HEAL,
  TE_KILL,
  TE_MOVE,
  TE_STATE_OFF,
  TE_STATE_ON,
  TE_THRESHOLD,
  TE_TURN_BEGIN,
  TE_TURN_END,
  tokenIn,
  type DamageTokenContext,
} from './triggerTokens.js';

export interface FireOptions {
  /** Jeton déclencheur (journal). */
  token: string;
  /** Chaîne de l'événement déclencheur. */
  chain: TriggerChain;
  /** Combattant à l'origine de l'événement (attaquant pour D, tueur pour X, victime pour K…), −1 sinon. */
  triggerSourceId: number;
  /** Dommages de l'événement (1123, 1223, 2020). */
  triggerDamage?: { initial: number; final: number } | null;
  /** Exécution sur un porteur mort (jetons de mort). */
  allowDead?: boolean;
}

/** Le buff peut-il être déclenché par l'événement (chaîne anti-boucle, buff posé avant l'événement) ? */
function eligible(b: Buff, chain: TriggerChain | undefined, seq = Infinity): boolean {
  return (
    b.active &&
    b.kind === 'triggered' &&
    b.triggersLeft !== 0 &&
    b.uid <= seq &&
    b.handler !== 'interceptDamage' && // 765 : appliqué par applyDamage (redirection), pas par déclenchement
    !chainHas(chain, b.uid)
  );
}

/**
 * Exécute un buff déclenché porté par ``carrier`` (compteurs, journal, chaîne anti-boucle, retrait si épuisé).
 * Renvoie vrai si l'effet a été exécuté.
 */
export function fireBuff(state: FightState, carrier: Fighter, b: Buff, o: FireOptions): boolean {
  if (b.triggersLeft === 0) return false;
  b.triggerCount += 1;
  b.totalTriggers += 1;
  if (b.triggersLeft > 0) b.triggersLeft -= 1;
  if (state.logging) {
    state.emit({
      type: 'triggered',
      carrierId: carrier.id,
      casterId: b.casterId,
      buffUid: b.uid,
      effectId: b.effectId,
      spellLevelId: b.spellLevelId,
      token: o.token,
    });
  }
  const prev = state.triggerChain;
  state.triggerChain = [...o.chain, { uid: b.uid, spellId: b.spellId }];
  try {
    executeBuffEffect(state, b, {
      triggerSourceId: o.triggerSourceId,
      triggerDamage: o.triggerDamage ?? null,
      allowDead: o.allowDead ?? false,
      depth: o.chain.length,
    });
  } finally {
    state.triggerChain = prev;
  }
  if (b.triggersLeft === 0 && carrier.buffs.includes(b)) removeBuff(state, carrier, b, 'déclenchements épuisés');
  return true;
}

/** Buffs d'un porteur (copie : la liste peut changer pendant les exécutions). */
function snapshotBuffs(f: Fighter): Buff[] | null {
  return f.buffs.length ? f.buffs.slice() : null;
}

/** Exceptions de configuration (sorts uniques) : faux si le buff ne doit pas être déclenché par cet événement. */
function exceptionAllows(state: FightState, b: Buff, ev: TriggerEvent): boolean {
  const spells = state.ctx.config.spells;
  if (b.spellId === SPELL_IDS.maledictionMouvante && ev.type === 'damage' && ev.glyph && !spells.maledictionMouvanteOnGlyphDamage) {
    return false;
  }
  if (
    b.spellId === SPELL_IDS.maledictionCollaterale &&
    !spells.maledictionCollateraleChains &&
    chainHasSpell(ev.chain, SPELL_IDS.maledictionCollaterale)
  ) {
    return false;
  }
  return true;
}

function damageContext(ev: Extract<TriggerEvent, { type: 'damage' }>): DamageTokenContext {
  return {
    collision: ev.collision,
    pushIndex: ev.pushIndex,
    element: ev.element,
    melee: ev.melee,
    allySource: ev.allySource,
    critical: ev.critical,
    glyph: ev.glyph,
    sourceIsSummon: ev.sourceIsSummon,
    fromTrigger: (ev.chain?.length ?? 0) > 0,
    lifeLoss: ev.amount,
    eroded: ev.eroded,
  };
}

/**
 * Parcourt les buffs posés PAR ``casterId`` (jetons côté lanceur : CD…, CH, PO, CC) et exécute ceux dont
 * ``match`` est vrai.
 */
function fireCasterSide(
  state: FightState,
  casterId: number,
  bit: number,
  ev: TriggerEvent,
  match: (b: Buff) => string | null,
  o: Omit<FireOptions, 'chain' | 'token'>,
): void {
  if (!state.hasCasterTriggers || casterId < 0) return;
  for (const f of state.fighters) {
    if (!f.alive || !f.buffs.length) continue;
    const list = snapshotBuffs(f)!;
    for (const b of list) {
      if (b.casterId !== casterId || !eligible(b, ev.chain, ev.seq) || !f.buffs.includes(b)) continue;
      if ((buffTriggers(b).mask & bit) === 0 || !exceptionAllows(state, b, ev)) continue;
      const token = match(b);
      if (token) fireBuff(state, f, b, { ...o, token, chain: ev.chain ?? EMPTY_CHAIN });
    }
  }
}

/** Exécute les buffs de ``carrier`` dont la catégorie ``bit`` et ``match`` correspondent à l'événement. */
function fireCarrier(
  state: FightState,
  carrier: Fighter,
  bit: number,
  ev: TriggerEvent,
  match: (b: Buff) => string | null,
  o: Omit<FireOptions, 'chain' | 'token'>,
): number {
  const list = snapshotBuffs(carrier);
  if (!list) return 0;
  let n = 0;
  for (const b of list) {
    if (!eligible(b, ev.chain, ev.seq) || !carrier.buffs.includes(b)) continue;
    if ((buffTriggers(b).mask & bit) === 0 || !exceptionAllows(state, b, ev)) continue;
    const token = match(b);
    if (!token) continue;
    if (!carrier.alive && !o.allowDead) break;
    if (fireBuff(state, carrier, b, { ...o, token, chain: ev.chain ?? EMPTY_CHAIN })) n++;
  }
  return n;
}

/** Traitement moteur d'un événement de la file (appelé par ``flushTriggers`` avant ``hooks.onTrigger``). */
export function processTrigger(state: FightState, ev: TriggerEvent): void {
  const fighters = state.fighters;
  switch (ev.type) {
    case 'damage': {
      const t = fighters[ev.targetId];
      const h = damageContext(ev);
      const dmg = { initial: ev.initial, final: ev.final };
      if (t && t.alive && t.buffs.length) {
        fireCarrier(state, t, TE_DAMAGE, ev, (b) => matchesDamage(buffTriggers(b), h), {
          triggerSourceId: ev.sourceId,
          triggerDamage: dmg,
        });
      }
      fireCasterSide(state, ev.sourceId, TE_CASTER_DAMAGE, ev, (b) => matchesCasterDamage(buffTriggers(b), h), {
        triggerSourceId: ev.targetId,
        triggerDamage: dmg,
      });
      return;
    }
    case 'heal': {
      if (ev.amount <= 0) return;
      const t = fighters[ev.targetId];
      if (t && t.alive && t.buffs.length) {
        fireCarrier(state, t, TE_HEAL, ev, (b) => matchesHeal(buffTriggers(b)), { triggerSourceId: ev.sourceId });
      }
      fireCasterSide(state, ev.sourceId, TE_CASTER_HEAL, ev, (b) => tokenIn(buffTriggers(b), 'CH'), {
        triggerSourceId: ev.targetId,
      });
      return;
    }
    case 'death': {
      marksOnDeath(state, ev.targetId);
      const t = fighters[ev.targetId];
      const dmg = ev.final ? { initial: ev.initial ?? 0, final: ev.final } : null;
      if (t && !t.alive && t.buffs.length) {
        fireCarrier(state, t, TE_DEATH, ev, (b) => matchesDeath(buffTriggers(b), ev.cause), {
          triggerSourceId: ev.killerId,
          triggerDamage: dmg,
          allowDead: true,
        });
      }
      const k = ev.killerId >= 0 ? fighters[ev.killerId] : undefined;
      if (k && k.alive && k.buffs.length) {
        fireCarrier(state, k, TE_KILL, ev, (b) => tokenIn(buffTriggers(b), 'K') ?? tokenIn(buffTriggers(b), 'KWS'), {
          triggerSourceId: ev.targetId,
          triggerDamage: dmg,
        });
      }
      return;
    }
    case 'stateOn':
    case 'stateOff': {
      const t = fighters[ev.targetId];
      if (!t || !t.alive || !t.buffs.length) return;
      const on = ev.type === 'stateOn';
      fireCarrier(
        state,
        t,
        on ? TE_STATE_ON : TE_STATE_OFF,
        ev,
        (b) => ((on ? buffTriggers(b).eon : buffTriggers(b).eoff).includes(ev.stateId) ? `${on ? 'EON' : 'EOFF'}${ev.stateId}` : null),
        { triggerSourceId: ev.sourceId },
      );
      return;
    }
    case 'moved': {
      const t = fighters[ev.targetId];
      if (t && t.alive && t.buffs.length) {
        fireCarrier(state, t, TE_MOVE, ev, (b) => matchesMove(buffTriggers(b), ev.kind), { triggerSourceId: ev.sourceId });
      }
      if (ev.kind !== 'place' && ev.kind !== 'resurrect') {
        fireCasterSide(state, ev.targetId, TE_CASTER_MOVE, ev, (b) => tokenIn(buffTriggers(b), 'PO'), {
          triggerSourceId: ev.sourceId,
        });
      }
      return;
    }
    case 'cast': {
      const c = fighters[ev.casterId];
      if (ev.depth === 0 && c && c.alive && c.buffs.length) {
        fireCarrier(state, c, TE_CAST, ev, (b) => tokenIn(buffTriggers(b), 'CAP'), { triggerSourceId: c.id });
      }
      if (ev.critical) {
        fireCasterSide(state, ev.casterId, TE_CASTER_CRIT, ev, (b) => tokenIn(buffTriggers(b), 'CC'), {
          triggerSourceId: ev.casterId,
        });
      }
      return;
    }
    case 'threshold': {
      const t = fighters[ev.targetId];
      if (!t || !t.alive || !t.buffs.length) return;
      const fired = fireCarrier(state, t, TE_THRESHOLD, ev, (b) => (buffTriggers(b).tr.includes(ev.spellId) ? `TR${ev.spellId}` : null), {
        triggerSourceId: ev.sourceId,
      });
      if (fired > 0 && ev.overflow > 0 && !state.ctx.config.spells.bienfaiteurOverflowLost && t.alive) {
        const src = fighters[ev.sourceId] ?? t;
        applyDirectLifeLoss(state, src, t, ev.overflow, ev.castId);
      }
      return;
    }
  }
}

/** Effets TB (début de tour) ou TE (fin de tour) des buffs portés par ``f`` (ordre de pose). */
export function runTurnTriggers(state: FightState, f: Fighter, token: 'TB' | 'TE'): number {
  if (!f.alive || !f.buffs.length) return 0;
  const bit = token === 'TB' ? TE_TURN_BEGIN : TE_TURN_END;
  const list = f.buffs.slice();
  let n = 0;
  for (const b of list) {
    if (!f.alive) break;
    if (!eligible(b, EMPTY_CHAIN) || !f.buffs.includes(b) || (buffTriggers(b).mask & bit) === 0) continue;
    if (fireBuff(state, f, b, { token, chain: EMPTY_CHAIN, triggerSourceId: f.id })) n++;
  }
  return n;
}
