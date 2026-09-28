/**
 * Outils communs aux gestionnaires d'effets : jet, position d'avant le sort, dégressivité, création de buffs.
 */
import { Buff, type BuffKind } from '../buffs.js';
import type { Fighter } from '../fighter.js';
import { applyAoeMalus, allowsAoeMalus } from '../formulas.js';
import { rollValue } from '../rng.js';
import type { EffectApplication } from './types.js';

/** Jet de l'effet : un par lancer et par effet (commun aux cibles) sauf ``rng.rollPerTarget``. */
export function rollOf(app: EffectApplication): number {
  const e = app.effect;
  if (app.roll === null || app.state.ctx.config.rng.rollPerTarget) {
    const s = app.state;
    app.roll = rollValue(s.rng, e.lo, e.hi, s.rollMode, s.rollDistribution);
  }
  return app.roll;
}

/** Position d'un combattant au début du lancer (sa case courante s'il est apparu depuis). */
export function positionBefore(app: EffectApplication, f: Fighter): number {
  return f.id < app.snapshot.length ? app.snapshot[f.id]! : f.cell;
}

/** Malus de zone (%) pour une cible : 0 pour une cible additionnelle ou une zone de rayon < 1. */
export function aoeMalusFor(app: EffectApplication, target: Fighter): number {
  const zone = app.effect.zone;
  if (app.additional || zone.radius < 1) return 0;
  const cell = positionBefore(app, target);
  if (cell < 0 || app.targetedCell < 0) return 0;
  return zone.aoeMalus(app.targetedCell, app.casterCellBefore, cell);
}

/** Valeur après dégressivité de zone (dégâts et soins ; ni boucliers ni collisions). */
export function withAoe(app: EffectApplication, target: Fighter, value: number): number {
  if (!allowsAoeMalus(app.effect.effectId)) return value;
  return applyAoeMalus(value, aoeMalusFor(app, target));
}

/**
 * Nouveau buff initialisé depuis l'effet courant (durée, délai, déclencheurs, lanceur, sort d'origine).
 * Durée de vie (buffs.ts) : ``triggerDuration`` pour un buff à déclencheurs (effet déclenché ou filtres d'un 1163),
 * ``duration`` sinon ; un effet PRODUIT par un buff (déclenché ou différé) prend ``duration`` et aucun délai (le délai
 * porte sur le buff déclencheur).
 */
export function makeBuff(app: EffectApplication, kind: BuffKind, value: number): Buff {
  const b = new Buff();
  const e = app.effect;
  const d = e.data;
  b.kind = kind;
  b.casterId = app.caster.id;
  b.spellId = app.spell.spellId;
  b.spellLevelId = app.spell.id;
  b.rootSpellId = app.cctx.rootSpellId || app.spell.spellId;
  b.castId = app.castId;
  b.effect = e;
  b.effectId = e.effectId;
  b.handler = e.handler === 'unknown' ? '' : e.handler;
  b.value = value;
  if (app.fromBuff) {
    b.duration = d.duration;
    b.delay = 0;
  } else if (kind === 'triggered' || hasEventOrFilterTriggers(d.triggers)) {
    b.duration = d.triggerDuration;
    b.delay = d.delay;
  } else {
    b.duration = d.duration;
    b.delay = d.delay;
  }
  b.triggers = d.triggers;
  b.parsed = e.triggerInfo;
  b.dispellable = d.dispellable;
  b.critical = app.critical;
  b.beforeCasterFirstTurn = app.caster.turnCount === 0;
  b.originBuffUid = app.cctx.originBuffUid;
  b.targetedCell = app.targetedCell;
  b.rootCastId = app.cctx.rootCastId || app.castId;
  b.untilNextCast = e.untilNextCast;
  return b;
}

function hasEventOrFilterTriggers(triggers: readonly string[]): boolean {
  for (const t of triggers) if (t !== 'I') return true;
  return false;
}
