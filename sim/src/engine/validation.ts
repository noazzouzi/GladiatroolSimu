/**
 * Validation d'un lancer (ETUDE §9.2, N70 §2.3) avec raisons lisibles en français, et liste des cases ciblables.
 *
 * Contrôles, dans l'ordre : lanceur vivant et placé, choix en attente, sort connu (et utilisable : obtenu pendant ce
 * tour, ``spells.newSpellUsableSameTurn`` / ``gifts.upgradedSpellGreyedUntilNextTurn``), PA, états requis / interdits
 * (``statesCriterion``), relance initiale, intervalle de relance (tours du lanceur), relance globale, lancers par tour,
 * case valide, portée (+ bonus de PO si modifiable ; ligne / diagonale), case jouable, case libre / occupée /
 * entité visible, ligne de vue (seuls les combattants bloquent, sur les cases intermédiaires), lancers par cible,
 * cumul maximal (``maxStack`` : lancers distincts du sort dont des buffs restent sur la cible).
 */
import { canCastOn, castCells, effectiveMaxRange, hasLineOfSight, isInCastRange, isValidCell } from '../geometry/index.js';
import { stackCount } from './buffs.js';
import type { Fighter } from './fighter.js';
import type { CompiledSpellLevel } from './spells.js';
import type { FightState } from './state.js';

export type CastFailCode =
  | 'UNKNOWN_FIGHTER'
  | 'DEAD'
  | 'OFF_MAP'
  | 'PENDING_CHOICE'
  | 'UNKNOWN_SPELL'
  | 'LEARNED_THIS_TURN'
  | 'NOT_ENOUGH_AP'
  | 'STATE_REQUIRED'
  | 'STATE_FORBIDDEN'
  | 'INITIAL_COOLDOWN'
  | 'COOLDOWN'
  | 'GLOBAL_COOLDOWN'
  | 'MAX_PER_TURN'
  | 'INVALID_CELL'
  | 'OUT_OF_RANGE'
  | 'NOT_WALKABLE'
  | 'CELL_OCCUPIED'
  | 'CELL_EMPTY'
  | 'NO_VISIBLE_ENTITY'
  | 'NO_LINE_OF_SIGHT'
  | 'MAX_PER_TARGET'
  | 'MAX_STACK';

export interface CastCheck {
  ok: boolean;
  code?: CastFailCode;
  /** Raison en français. */
  reason?: string;
}

export interface CastCheckOptions {
  /** Le sort doit être dans le grimoire du lanceur (défaut vrai). */
  requireKnown?: boolean;
  /** Ignorer le coût en PA. */
  ignoreAp?: boolean;
  /** Ignorer un choix en attente. */
  ignorePendingChoice?: boolean;
}

const OK: CastCheck = { ok: true };

function fail(code: CastFailCode, reason: string): CastCheck {
  return { ok: false, code, reason };
}

/** Contrôles indépendants de la case ciblée (lanceur, grimoire, PA, états, relances, lancers par tour). */
export function checkCaster(
  state: FightState,
  caster: Fighter,
  spell: CompiledSpellLevel,
  o: CastCheckOptions = {},
): CastCheck {
  if (!caster.alive) return fail('DEAD', 'le lanceur est mort');
  if (caster.cell < 0) return fail('OFF_MAP', "le lanceur n'est pas sur la carte");
  if (!o.ignorePendingChoice && state.pendingChoices.length) return fail('PENDING_CHOICE', 'un choix est en attente');
  if (o.requireKnown ?? true) {
    const slot = caster.spells.find((x) => x.spellLevelId === spell.id);
    if (!slot) return fail('UNKNOWN_SPELL', `${spell.name} n'est pas dans le grimoire`);
    if (slot.learnedDuring !== undefined && slot.learnedDuring === caster.turnCount) {
      const cfg = state.ctx.config;
      if (!cfg.spells.newSpellUsableSameTurn || (slot.upgraded && cfg.gifts.upgradedSpellGreyedUntilNextTurn)) {
        return fail('LEARNED_THIS_TURN', `${spell.name} a été obtenu pendant ce tour : utilisable au prochain tour`);
      }
    }
  }
  const c = spell.cast;
  if (!o.ignoreAp && caster.ap < c.ap) return fail('NOT_ENOUGH_AP', `PA insuffisants (${c.ap} requis, ${caster.ap} disponibles)`);
  const sc = c.statesCriterion;
  if (sc) {
    for (const s of sc.required) {
      if (!caster.hasState(s)) return fail('STATE_REQUIRED', `état requis : ${state.ctx.stateName(s)}`);
    }
    for (const s of sc.forbidden) {
      if (caster.hasState(s)) return fail('STATE_FORBIDDEN', `état interdit : ${state.ctx.stateName(s)}`);
    }
  }
  if (c.initialCooldown > 0 && caster.turnCount <= c.initialCooldown) {
    return fail('INITIAL_COOLDOWN', `relance initiale (lançable au tour ${c.initialCooldown + 1} du lanceur)`);
  }
  const rec = caster.castRecord(spell.spellId);
  if (rec && c.interval > 0 && rec.lastTurn >= 0 && caster.turnCount < rec.lastTurn + c.interval) {
    const left = rec.lastTurn + c.interval - caster.turnCount;
    return fail('COOLDOWN', `sort en recharge (encore ${left} tour${left > 1 ? 's' : ''})`);
  }
  if (c.globalCooldown > 0) {
    const g = state.globalCooldowns.find((x) => x.team === caster.team && x.spellId === spell.spellId);
    if (g && state.turn < g.turn + c.globalCooldown) return fail('GLOBAL_COOLDOWN', 'relance globale en cours');
  }
  if (c.maxPerTurn > 0 && rec && rec.turnCasts >= c.maxPerTurn) {
    return fail('MAX_PER_TURN', `déjà lancé ${rec.turnCasts} fois ce tour (maximum ${c.maxPerTurn})`);
  }
  return OK;
}

/** Contrôles liés à la cible (lancers par cible, cumul). */
function checkTargetLimits(caster: Fighter, spell: CompiledSpellLevel, target: Fighter | null): CastCheck {
  if (!target) return OK;
  const c = spell.cast;
  if (c.maxPerTarget > 0) {
    const rec = caster.castRecord(spell.spellId);
    if (rec && rec.castsOn(target.id) >= c.maxPerTarget) {
      return fail('MAX_PER_TARGET', `déjà lancé ${c.maxPerTarget} fois sur cette cible ce tour`);
    }
  }
  if (c.maxStack > 0 && stackCount(target, spell.spellId) >= c.maxStack) {
    return fail('MAX_STACK', `cumul maximal atteint sur la cible (${c.maxStack})`);
  }
  return OK;
}

/** Vérifie qu'un lanceur peut lancer ``spellLevelId`` sur ``cell`` ; renvoie la première raison d'échec. */
export function canCast(
  state: FightState,
  casterId: number,
  spellLevelId: number,
  cell: number,
  o: CastCheckOptions = {},
): CastCheck {
  const caster = state.fighters[casterId];
  if (!caster) return fail('UNKNOWN_FIGHTER', `combattant inconnu : ${casterId}`);
  if (!state.ctx.hasSpell(spellLevelId)) return fail('UNKNOWN_SPELL', `niveau de sort inconnu : ${spellLevelId}`);
  const spell = state.ctx.getSpell(spellLevelId);
  const pre = checkCaster(state, caster, spell, o);
  if (!pre.ok) return pre;
  return checkCell(state, caster, spell, cell);
}

/** Contrôles de la case ciblée (portée, case, LdV, limites par cible). */
export function checkCell(state: FightState, caster: Fighter, spell: CompiledSpellLevel, cell: number): CastCheck {
  if (!isValidCell(cell)) return fail('INVALID_CELL', `case invalide : ${cell}`);
  const spec = spell.castSpec;
  const max = effectiveMaxRange(spec, caster.range);
  if (!isInCastRange(caster.cell, cell, spec.minRange, max, spec.castInLine, spec.castInDiagonal)) {
    const how = spec.castInLine ? ' en ligne' : spec.castInDiagonal ? ' en diagonale' : '';
    return fail('OUT_OF_RANGE', `hors de portée (${spec.minRange} à ${max}${how})`);
  }
  const grid = state.ctx.grid;
  if (!grid.isWalkable(cell)) return fail('NOT_WALKABLE', `case ${cell} non jouable`);
  const target = state.fighterAt(cell);
  if (spec.needFreeCell && target) return fail('CELL_OCCUPIED', `case ${cell} occupée`);
  if (spec.needTakenCell && !target) return fail('CELL_EMPTY', `case ${cell} vide (cible requise)`);
  if (spec.needVisibleEntity && !target) return fail('NO_VISIBLE_ENTITY', `aucune entité visible sur la case ${cell}`);
  if (spec.castTestLos && !hasLineOfSight(caster.cell, cell, state.occupiedPredicate(), grid.blocksLos)) {
    return fail('NO_LINE_OF_SIGHT', `pas de ligne de vue vers la case ${cell}`);
  }
  return checkTargetLimits(caster, spell, target);
}

/**
 * Cases ciblables par un sort (ordre de la géométrie, ``castCells``), après les contrôles du lanceur et les limites
 * par cible. Vide si le sort n'est pas lançable.
 */
export function getCastableCells(
  state: FightState,
  casterId: number,
  spellLevelId: number,
  o: CastCheckOptions = {},
): number[] {
  const caster = state.fighters[casterId];
  if (!caster || !state.ctx.hasSpell(spellLevelId)) return [];
  const spell = state.ctx.getSpell(spellLevelId);
  if (!checkCaster(state, caster, spell, o).ok) return [];
  const occ = state.occupiedPredicate();
  const cells = castCells(state.ctx.grid, caster.cell, spell.castSpec, { rangeBonus: caster.range, isOccupied: occ });
  const c = spell.cast;
  if (c.maxPerTarget <= 0 && c.maxStack <= 0) return cells;
  return cells.filter((cell) => checkTargetLimits(caster, spell, state.fighterAt(cell)).ok);
}

/** Test rapide d'une case (équivalent à ``getCastableCells(...).includes(cell)``). */
export function isCastableCell(state: FightState, caster: Fighter, spell: CompiledSpellLevel, cell: number): boolean {
  if (
    !canCastOn(state.ctx.grid, caster.cell, cell, spell.castSpec, {
      rangeBonus: caster.range,
      isOccupied: state.occupiedPredicate(),
    })
  ) {
    return false;
  }
  return checkTargetLimits(caster, spell, state.fighterAt(cell)).ok;
}
