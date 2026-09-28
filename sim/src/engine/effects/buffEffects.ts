/**
 * Gestionnaires d'envoûtements : caractéristiques (statBuff : 111, 128, 117, 115, 418, 414, 125, 153, 138, 1076,
 * 2803, 2807, 776, 169, 1171, 1172, 2971), états (950 pose, 951 retire, 952 désactive), multiplicateur de dommages
 * reçus (1163, déclencheurs = filtres), bonus de dégâts de base d'un sort (293), retrait des effets d'un sort (406),
 * désenvoûtement (132, dispellable = 1), marqueurs (140 tour annulé, 3407 durée de tour).
 */
import { addBuff, removeBuffsWhere } from '../buffs.js';
import { STAT_KEY_INDEX } from '../stats.js';
import { makeBuff, rollOf } from './common.js';
import type { EffectHandlerFn } from './types.js';

export const statBuffHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const cat = app.effect.catalog;
  if (!cat?.stat) return;
  const b = makeBuff(app, 'stat', rollOf(app) * (cat.sign ?? 1));
  b.stat = STAT_KEY_INDEX[cat.stat];
  addBuff(app.state, target, b);
};

function stateIdOf(app: Parameters<EffectHandlerFn>[0]): number {
  return app.effect.data.stateId ?? app.effect.data.value;
}

export const setStateHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const b = makeBuff(app, 'state', 0);
  b.stateId = stateIdOf(app);
  addBuff(app.state, target, b);
};

export const unsetStateHandler: EffectHandlerFn = (app, target) => {
  if (!target) return;
  const id = stateIdOf(app);
  removeBuffsWhere(app.state, target, (b) => b.kind === 'state' && b.stateId === id, 'état retiré');
};

export const disableStateHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const b = makeBuff(app, 'disableState', 0);
  b.stateId = stateIdOf(app);
  addBuff(app.state, target, b);
};

export const multiplierHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  addBuff(app.state, target, makeBuff(app, 'multiplier', rollOf(app)));
};

/** 293 : +value dégâts de base au sort ``subSpell.spellId`` (min) du porteur. */
export const spellBaseDamageBonusHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const d = app.effect.data;
  const b = makeBuff(app, 'spellModifier', d.value);
  b.modSpellId = d.subSpell?.spellId ?? d.min;
  addBuff(app.state, target, b);
};

/** 406 : retire du porteur les buffs créés par le sort ``value``. */
export const removeSpellEffectsHandler: EffectHandlerFn = (app, target) => {
  if (!target) return;
  const d = app.effect.data;
  const spellId = d.subSpell?.spellId ?? d.value;
  removeBuffsWhere(app.state, target, (b) => b.spellId === spellId, `effets du sort ${spellId} retirés`);
};

/** 132 : désenvoûtement (buffs dispellable = 1). */
export const dispelHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  removeBuffsWhere(app.state, target, (b) => b.dispellable === 1, 'désenvoûté');
};

/** Marqueur générique (140, 3407…) : buff sans contribution, interprété par les étapes suivantes. */
export const markerHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  addBuff(app.state, target, makeBuff(app, 'marker', app.effect.data.value || rollOf(app)));
};
