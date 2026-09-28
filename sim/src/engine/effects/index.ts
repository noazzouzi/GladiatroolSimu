/**
 * Registre des gestionnaires d'effets du noyau : un gestionnaire par nom de ``handler`` du catalogue ``effects``
 * (sim/data). Les étapes suivantes peuvent remplacer ou ajouter des gestionnaires dans ``EngineContext.handlers``.
 *
 * Gestionnaires « une fois par effet » (ONCE_HANDLERS) : appliqués une seule fois, sans cible, même si la zone ne
 * contient personne (téléportation du lanceur, invocation, pose de marque, choix d'équipe).
 * Gestionnaires « durables » (DURABLE_HANDLERS) : ils posent un buff et gèrent eux-mêmes le délai ; pour les autres,
 * un effet à délai est posé comme buff 'delayed' et exécuté par l'étape « tours » à la fin du délai.
 */
import {
  disableStateHandler,
  dispelHandler,
  markerHandler,
  multiplierHandler,
  removeSpellEffectsHandler,
  setStateHandler,
  spellBaseDamageBonusHandler,
  statBuffHandler,
  unsetStateHandler,
} from './buffEffects.js';
import {
  damageHandler,
  hpMalusHandler,
  killHandler,
  splashFinalDamageHandler,
  splashInitialDamageHandler,
} from './damageEffects.js';
import {
  healHandler,
  resurrectHandler,
  shieldHandler,
  splashHealHandler,
  thresholdHandler,
} from './healEffects.js';
import { casterAdvanceHandler, exchangeHandler, pullHandler, pushHandler, teleportHandler } from './moveEffects.js';
import {
  dispelGlyphsHandler,
  executeSubSpellHandler,
  forgetSpellHandler,
  globalChoiceHandler,
  individualChoiceHandler,
  learnSpellHandler,
  markHandler,
  noopHandler,
  summonHandler,
} from './spellEffects.js';
import type { EffectHandlerFn } from './types.js';

export { DURABLE_HANDLERS, ONCE_HANDLERS } from './kinds.js';

/**
 * Gestionnaires par défaut. interceptDamage (765) n'a pas d'effet propre à l'exécution : l'interception est appliquée
 * par ``applyDamage`` (damage.ts) tant que le buff déclenché est porté.
 */
export function defaultHandlers(): Map<string, EffectHandlerFn> {
  const m = new Map<string, EffectHandlerFn>();
  // dégâts
  m.set('damage', damageHandler);
  m.set('lifeSteal', damageHandler);
  m.set('damageCasterHpPct', damageHandler);
  m.set('hpMalusPct', hpMalusHandler);
  m.set('damageTargetErodedHpPct', damageHandler);
  m.set('damageCasterErodedHpPct', damageHandler);
  m.set('splashInitialDamage', splashInitialDamageHandler);
  m.set('splashFinalDamage', splashFinalDamageHandler);
  m.set('kill', killHandler);
  // soins, boucliers
  m.set('heal', healHandler);
  m.set('healMaxHpPct', healHandler);
  m.set('splashHeal', splashHealHandler);
  m.set('resurrect', resurrectHandler);
  m.set('shield', shieldHandler);
  m.set('hpThreshold', thresholdHandler);
  // envoûtements
  m.set('statBuff', statBuffHandler);
  m.set('setState', setStateHandler);
  m.set('unsetState', unsetStateHandler);
  m.set('disableState', disableStateHandler);
  m.set('receivedDamageMultiplier', multiplierHandler);
  m.set('spellBaseDamageBonus', spellBaseDamageBonusHandler);
  m.set('removeSpellEffects', removeSpellEffectsHandler);
  m.set('dispel', dispelHandler);
  m.set('passTurn', markerHandler);
  m.set('turnDuration', markerHandler);
  // déplacements
  m.set('push', pushHandler);
  m.set('pushNoDamage', pushHandler);
  m.set('pull', pullHandler);
  m.set('casterAdvance', casterAdvanceHandler);
  m.set('teleport', teleportHandler);
  m.set('exchange', exchangeHandler);
  // sorts, choix, invocations, marques
  m.set('executeSubSpell', executeSubSpellHandler);
  m.set('learnSpell', learnSpellHandler);
  m.set('forgetSpell', forgetSpellHandler);
  m.set('individualChoice', individualChoiceHandler);
  m.set('globalChoice', globalChoiceHandler);
  m.set('summon', summonHandler);
  m.set('glyphTurnStart', markHandler);
  m.set('glyphTurnEnd', markHandler);
  m.set('glyphAura', markHandler);
  m.set('glyphImmediate', markHandler);
  m.set('dispelGlyphs', dispelGlyphsHandler);
  m.set('noop', noopHandler);
  m.set('interceptDamage', noopHandler);
  return m;
}

export type { CastContext, EffectApplication, EffectHandlerFn } from './types.js';
export { makeCastContext } from './types.js';
