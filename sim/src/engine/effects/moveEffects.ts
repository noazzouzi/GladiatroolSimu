/**
 * Gestionnaires de déplacement (ETUDE §9.9) : 5 poussée (collision), 1103 poussée sans dommages, 6 / 1022 attirance,
 * 1042 avance du lanceur vers la cible, 4 téléportation du lanceur (appliquée une fois par effet), 8 échange.
 * Positions : poussée depuis les positions d'avant le sort (lanceur et cible) ; attirance depuis la position
 * COURANTE du lanceur ; avance depuis les positions courantes.
 */
import { cellsInDirection, dir8 } from '../../geometry/index.js';
import { forcedMove, swap, teleport, teleportTo } from '../movement.js';
import { SPELL_IDS } from '../spells.js';
import type { FightState } from '../state.js';
import { nearestFreeCell } from './healEffects.js';
import { positionBefore, rollOf } from './common.js';
import type { EffectApplication, EffectHandlerFn } from './types.js';

/** Effets de poussée / attirance forcés (ignorent Inébranlable, Enraciné, canBePushed). */
const FORCED = new Set([1021, 1022]);
/** Poussées avec dommages de collision (``allowCollisionDamage``). */
const COLLISION = new Set([5, 1041]);

/**
 * Poussée forcée (ignore Inébranlable / Enraciné) : 1021 / 1022 ; exception ``boss.rassemblementBlockedByUnshakable``
 * = false : la poussée sans dommages (1103) du Rassemblement de la Mama (30432) est traitée comme forcée.
 */
function isForced(app: EffectApplication): boolean {
  const id = app.effect.effectId;
  if (FORCED.has(id)) return true;
  return id === 1103 && app.spell.spellId === SPELL_IDS.rassemblement && !app.state.ctx.config.boss.rassemblementBlockedByUnshakable;
}

export const pushHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  const id = app.effect.effectId;
  forcedMove(app.state, app.caster, target, {
    kind: 'push',
    force: rollOf(app),
    targetedCell: app.targetedCell,
    casterCell: app.casterCellBefore,
    targetCell: positionBefore(app, target),
    collisionDamage: COLLISION.has(id),
    forced: isForced(app),
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
    spellLevelId: app.spell.id,
  });
};

export const pullHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive || app.caster.cell < 0) return;
  forcedMove(app.state, app.caster, target, {
    kind: 'pull',
    force: rollOf(app),
    targetedCell: app.targetedCell,
    casterCell: app.caster.cell,
    targetCell: positionBefore(app, target),
    collisionDamage: false,
    forced: FORCED.has(app.effect.effectId),
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
    spellLevelId: app.spell.id,
  });
};

/** 1042 : le lanceur avance de #1 case vers la cible (attiré par elle). */
export const casterAdvanceHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive || target === app.caster || target.cell < 0) return;
  forcedMove(app.state, app.caster, app.caster, {
    kind: 'advance',
    force: rollOf(app),
    targetedCell: app.targetedCell,
    casterCell: app.caster.cell,
    targetCell: target.cell,
    collisionDamage: false,
    castId: app.castId,
    originBuffUid: app.cctx.originBuffUid,
    spellLevelId: app.spell.id,
  });
};

/**
 * 4 : le lanceur se téléporte sur la case ciblée (si libre) ou la première case libre de la zone. Exception
 * (logique serveur) : arrivée de la Mama (30609) sur ``boss.arrivalCell``, replis ``boss.arrivalFallback``.
 */
export const teleportHandler: EffectHandlerFn = (app) => {
  if (app.spell.spellId === SPELL_IDS.mamaArrival) {
    const dest = bossArrivalCell(app.state);
    if (dest >= 0 && dest !== app.caster.cell && !app.caster.rooted) {
      teleportTo(app.state, app.caster, dest, app.caster.id, 'teleport', app.castId, app.cctx.originBuffUid);
    }
    return;
  }
  teleport(app.state, app.caster, app.effect.zone, app.targetedCell, app.castId, app.cctx.originBuffUid);
};

/**
 * Case d'arrivée de la Mama : ``boss.arrivalCell`` si libre, sinon les replis de ``boss.arrivalFallback`` dans
 * l'ordre (case explicite ; ``axisTowardWaitCell`` : cases de la demi-droite vers la case d'attente ;
 * ``nearestFree`` : case libre la plus proche). −1 si aucune.
 */
export function bossArrivalCell(state: FightState): number {
  const cfg = state.ctx.config.boss;
  const free = state.freePredicate();
  const start = cfg.arrivalCell;
  if (free(start)) return start;
  for (const step of cfg.arrivalFallback) {
    if (typeof step === 'number') {
      if (free(step)) return step;
    } else if (step === 'axisTowardWaitCell') {
      for (const c of cellsInDirection(start, dir8(start, state.ctx.data.boss.waitCell))) if (free(c)) return c;
    } else if (step === 'nearestFree') {
      return nearestFreeCell(state, start);
    }
  }
  return -1;
}

/** 8 : échange de positions entre le lanceur et la cible. */
export const exchangeHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  swap(app.state, app.caster, target, app.castId, app.cctx.originBuffUid);
};
