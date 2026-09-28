/**
 * Gestionnaires de dégâts : 100 et famille (95 vol de vie, 89 % PV du lanceur, 1118 % PV érodés du lanceur, 1092 %
 * PV érodés de la cible, 1048 malus de % PV), renvois 1123 / 1223 (% des dommages initiaux / finaux de l'événement
 * déclencheur), 141 (tue). Pipeline : formulas.ts (lanceur) → dégressivité → damage.ts (réception, application).
 */
import { spellBaseDamageBonus } from '../buffs.js';
import { applyDamage, applyDirectLifeLoss, killFighter } from '../damage.js';
import { senderDamage, targetBasedRaw } from '../formulas.js';
import { rollOf, withAoe } from './common.js';
import type { EffectHandlerFn } from './types.js';

/** Dégâts « classiques » et dérivés (le type de base vient de la classification de l'action). */
export const damageHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const e = app.effect;
  const caster = app.caster;
  const roll = rollOf(app);
  let raw = targetBasedRaw(roll, e.effectId, target);
  if (raw === null) {
    raw = senderDamage(roll, e.effectId, caster, {
      criticalEffect: e.critical,
      baseDamageBonus: spellBaseDamageBonus(caster, app.spell.spellId),
      fallbackElement: e.element,
    });
  }
  raw = withAoe(app, target, raw);
  applyDamage(app.state, caster, target, raw, {
    actionId: e.effectId,
    fallbackElement: e.element,
    critical: e.critical,
    erosion: e.erosion,
    glyph: app.cctx.fromMark,
    spellId: app.spell.spellId,
    spellLevelId: app.spell.id,
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
  });
};

/**
 * 1048 « −#1 % PV » (coût de Coup de Sang) : malus de PV COURANTS du porteur. Dans le client c'est un envoûtement
 * « lifePointsMalus » (StatBuff) et non un dommage (N1D §5.5, archetype_dompteur.json expectedDamage) : ni bouclier,
 * ni résistance, ni multiplicateur 1163 (Vulnérable), ni déclencheur de dommages ; les PV perdus restent soignables
 * (les PV max ne baissent pas) ; érosion seulement avec ``spells.coupDeSangCreatesErosion``. Seuil de PV (2872)
 * respecté.
 */
export const hpMalusHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const e = app.effect;
  const raw = targetBasedRaw(rollOf(app), e.effectId, target) ?? 0;
  applyDirectLifeLoss(app.state, app.caster, target, raw, app.castId, { erosion: e.erosion, spellLevelId: app.spell.id });
};

/** Renvois : #1 % des dommages initiaux (1123) ou finaux (1223) de l'événement déclencheur. */
function splash(kind: 'initial' | 'final'): EffectHandlerFn {
  return (app, target) => {
    if (!target || !target.alive) return;
    const td = app.cctx.triggerDamage;
    if (!td) return;
    const base = kind === 'initial' ? td.initial : td.final;
    if (base <= 0) return;
    const roll = rollOf(app);
    const raw = withAoe(app, target, Math.trunc((roll * base) / 100));
    if (raw <= 0) return;
    applyDamage(app.state, app.caster, target, raw, {
      actionId: app.effect.effectId,
      fallbackElement: app.effect.element,
      critical: app.effect.critical,
      glyph: app.cctx.fromMark,
      spellId: app.spell.spellId,
      spellLevelId: app.spell.id,
      castId: app.castId,
      originBuffUid: app.cctx.originBuffUid,
    });
  };
}

export const splashInitialDamageHandler = splash('initial');
export const splashFinalDamageHandler = splash('final');

/** 141 : tue la cible. */
export const killHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  killFighter(app.state, target, app.caster.id, 'kill', app.castId, app.cctx.originBuffUid);
};
