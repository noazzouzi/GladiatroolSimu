/**
 * Soins, boucliers, seuil de PV et résurrection (ETUDE §9.8, N70 §4.4) :
 * 3001 (et soins élémentaires) : jet boosté par la caractéristique (Force pour le neutre, pas la Puissance) + Soins,
 * dégressivité, × soins finaux du lanceur, plafond aux PV manquants ; 1109 : % des PV max de la cible (non boosté) ;
 * 2020 : % des dommages de l'événement déclencheur ; 1040 : bouclier (valeur fixe, ni boosté ni dégressif) ;
 * 2872 : seuil de PV ; 147 : résurrection (``spells.ultimeEspoirRespawnCell``).
 */
import { distance } from '../../geometry/index.js';
import { addBuff, removeBuffsWhere } from '../buffs.js';
import { applyHeal } from '../damage.js';
import { senderDamage, shieldAmount, targetBasedRaw } from '../formulas.js';
import type { Fighter } from '../fighter.js';
import { teleportTo } from '../movement.js';
import { matchesMask } from '../targeting.js';
import type { FightState } from '../state.js';
import { makeBuff, rollOf, withAoe } from './common.js';
import type { EffectHandlerFn } from './types.js';

export const healHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const e = app.effect;
  const roll = rollOf(app);
  let v = targetBasedRaw(roll, e.effectId, target);
  if (v === null) v = senderDamage(roll, e.effectId, app.caster, { criticalEffect: e.critical, fallbackElement: e.element });
  v = withAoe(app, target, v);
  applyHeal(app.state, app.caster, target, v, e.effectId, {
    spellLevelId: app.spell.id,
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
  });
};

/** 2020 : soin de #1 % des dommages (finaux) de l'événement déclencheur. */
export const splashHealHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const td = app.cctx.triggerDamage;
  if (!td || td.final <= 0) return;
  const v = withAoe(app, target, Math.trunc((rollOf(app) * td.final) / 100));
  applyHeal(app.state, app.caster, target, v, app.effect.effectId, {
    spellLevelId: app.spell.id,
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
  });
};

export const shieldHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const v = shieldAmount(rollOf(app), app.effect.effectId, app.caster);
  if (v <= 0) return;
  addBuff(app.state, target, makeBuff(app, 'shield', v));
};

export const thresholdHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  addBuff(app.state, target, makeBuff(app, 'threshold', rollOf(app)));
};

/** Case libre la plus proche (Manhattan, puis id) d'une case donnée, elle comprise ; −1 si aucune. */
export function nearestFreeCell(state: FightState, cell: number): number {
  const free = state.freePredicate();
  if (cell >= 0 && free(cell)) return cell;
  let best = -1;
  let bd = Infinity;
  for (const c of state.ctx.grid.walkableCells) {
    if (!free(c)) continue;
    const d = cell >= 0 ? distance(cell, c) : 0;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * 147 : ressuscite le DERNIER allié mort (N1M §5 : Ultime Espoir) parmi les cibles de l'effet, avec ``value`` % de ses
 * PV max, sur sa case de mort ou la plus proche libre (``spells.ultimeEspoirRespawnCell``). Une seule résurrection
 * par application de l'effet ; une invocation morte a quitté le combat (règle DOFUS) et n'est pas ressuscitée.
 */
export const resurrectHandler: EffectHandlerFn = (app, target) => {
  if (!target || target.alive || target.isSummon || app.execCount > 0) return;
  const state = app.state;
  for (const f of state.fighters) {
    if (f.alive || f.isSummon || f === target || f.deathSeq <= target.deathSeq) continue;
    // un allié mort plus récemment et visé par le même effet passe avant
    if (f.team === target.team && matchesMask(state, app.caster, f, app.effect.mask)) return;
  }
  const pct = app.effect.data.value || rollOf(app);
  const cell = nearestFreeCell(state, target.deathCell);
  if (cell < 0) return;
  app.execCount++;
  resurrect(state, target, cell, pct, app.caster.id, app.castId);
};

/** Remet ``f`` en jeu sur ``cell`` avec ``pct`` % de ses PV max (buffs de sa vie précédente retirés). */
export function resurrect(state: FightState, f: Fighter, cell: number, pct: number, sourceId: number, castId = 0): void {
  removeBuffsWhere(state, f, () => true, 'résurrection');
  f.alive = true;
  f.hp = Math.max(1, Math.trunc((f.maxHp * pct) / 100));
  f.cell = -1;
  f.apUsed = 0;
  f.mpUsed = 0;
  teleportTo(state, f, cell, sourceId, 'resurrect', castId);
  state.ctx.hooks.onFighterAdded?.(state, f, 'resurrect');
}
