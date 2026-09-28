/**
 * Moteur de combat (voir docs/ARCHITECTURE.md, sections « Moteur — noyau » et « Moteur — buffs, déclencheurs,
 * glyphes, tours »).
 *
 * Point d'entrée : ``createEngineContext`` (données, configuration, carte, gestionnaires, crochets) puis
 * ``createFight`` / ``FightState.create`` ; ``addFighter`` ; ``setTimeline`` / ``nextTurn`` / ``startTurn`` /
 * ``endTurn`` / ``performAction`` ; ``castSpell`` / ``canCast`` / ``getCastableCells`` ; ``moveAlongPath`` ;
 * ``applyDamage`` / ``applyHeal`` ; ``state.clone()``.
 */
import { EngineContext, type EngineContextOptions } from './context.js';
import { defaultHandlers } from './effects/index.js';
import { FightState, type FightStateOptions } from './state.js';

/** Contexte moteur avec les gestionnaires d'effets du noyau. */
export function createEngineContext(opts: EngineContextOptions = {}): EngineContext {
  return new EngineContext(opts, defaultHandlers());
}

/** Nouvel état de combat vide (sans combattant) sur un contexte (créé si absent). */
export function createFight(ctx: EngineContext = createEngineContext(), opts: FightStateOptions = {}): FightState {
  return FightState.create(ctx, opts);
}

export * from './buffs.js';
export * from './cast.js';
export * from './context.js';
export * from './damage.js';
export * from './effects/index.js';
export * from './events.js';
export * from './fighter.js';
export * from './formulas.js';
export * from './marks.js';
export * from './movement.js';
export * from './rng.js';
export * from './spells.js';
export * from './state.js';
export * from './stats.js';
export * from './targeting.js';
export * from './triggerProcessing.js';
export * from './triggerQueue.js';
export * from './triggerTokens.js';
export * from './triggers.js';
export * from './turns.js';
export * from './validation.js';
export { learnSpell, forgetSpell, obtainSpell } from './effects/spellEffects.js';
export { nearestFreeCell, resurrect } from './effects/healEffects.js';
export { rollOf, positionBefore, aoeMalusFor, withAoe, makeBuff } from './effects/common.js';
export { bossArrivalCell } from './effects/moveEffects.js';
