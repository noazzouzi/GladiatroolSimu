/**
 * Cases ciblables d'un sort (``FightSpellCastFrame`` + ``jerakine.types.zones.Lozenge/Cross`` du client).
 * Port de geometry.range_cells (ordre de sortie identique) + filtres LdV / case libre / case occupée.
 * Voir research/notes/70_formules_dofus.md §2.3 et ETUDE §9.2.
 */

import { CELL_X, CELL_Y, INVALID_CELL, NEVER, xyToCell, type CellPredicate } from './grid.js';
import { hasLineOfSight } from './los.js';
import type { MapGrid } from './mapGrid.js';

/** Contraintes de lancer : mêmes noms de champs que les niveaux de sort DofusDB (spell-levels). */
export interface CastRangeSpec {
  minRange: number;
  /** Portée maximale de base (``range``). */
  range: number;
  rangeCanBeBoosted?: boolean;
  castInLine?: boolean;
  castInDiagonal?: boolean;
  castTestLos?: boolean;
  needFreeCell?: boolean;
  needTakenCell?: boolean;
  needVisibleEntity?: boolean;
}

export interface CastCellsOptions {
  /** Bonus de PO du lanceur (appliqué seulement si rangeCanBeBoosted). */
  rangeBonus?: number;
  /** Case occupée par un combattant (needFreeCell / needTakenCell). */
  isOccupied?: CellPredicate;
  /** Entité qui bloque la vue (par défaut : isOccupied). Testée sur les cases intermédiaires seulement. */
  blocksLos?: CellPredicate;
  /** Entité visible (needVisibleEntity ; par défaut : isOccupied). */
  isVisibleEntity?: CellPredicate;
  /**
   * La case ciblée doit être marchable en combat (défaut true). HYPOTHÈSE d'interface : le client n'affiche pas
   * de portée sur les cases non marchables ; mettre false pour reproduire range_cells brut.
   */
  requireWalkable?: boolean;
}

/**
 * Adaptateur depuis ``CastData`` de sim/data ({range: [min, max], rangeModifiable, inLine, inDiagonal, los,
 * needFreeCell, needTakenCell, needVisibleEntity}).
 */
export function castSpecFromCastData(c: {
  range: readonly [number, number] | readonly number[];
  rangeModifiable?: boolean;
  inLine?: boolean;
  inDiagonal?: boolean;
  los?: boolean;
  needFreeCell?: boolean;
  needTakenCell?: boolean;
  needVisibleEntity?: boolean;
}): CastRangeSpec {
  return {
    minRange: c.range[0] ?? 0,
    range: c.range[1] ?? 0,
    rangeCanBeBoosted: c.rangeModifiable ?? false,
    castInLine: c.inLine ?? false,
    castInDiagonal: c.inDiagonal ?? false,
    castTestLos: c.los ?? false,
    needFreeCell: c.needFreeCell ?? false,
    needTakenCell: c.needTakenCell ?? false,
    needVisibleEntity: c.needVisibleEntity ?? false,
  };
}

/** ``SpellWrapper.maxRange`` : portée + bonus (si modifiable), au moins la portée minimale. */
export function effectiveMaxRange(spec: CastRangeSpec, rangeBonus = 0): number {
  const max = spec.range + (spec.rangeCanBeBoosted ? rangeBonus : 0);
  return Math.max(max, spec.minRange);
}

const LINE_DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG_DIRS: ReadonlyArray<readonly [number, number]> = [[1, -1], [-1, 1], [1, 1], [-1, -1]];

/**
 * Cellules à portée, avant ligne de vue et case libre (port exact de geometry.range_cells, même ordre) :
 * - ni ligne ni diagonale : losange Manhattan min..max (anneaux du plus grand au plus petit) ;
 * - ligne : croix sur les axes MapPoint ; diagonale : croix diagonale (r = nombre de pas diagonaux) ; les deux : étoile.
 * ``maxRange`` doit déjà inclure le bonus de PO.
 */
export function rangeCells(
  origin: number,
  minRange: number,
  maxRange: number,
  castInLine = false,
  castInDiagonal = false,
): number[] {
  maxRange = Math.max(maxRange, minRange, 0);
  const ox = CELL_X[origin]!;
  const oy = CELL_Y[origin]!;
  const cells: number[] = [];
  if (!castInLine && !castInDiagonal) {
    for (let r = maxRange; r >= minRange; r--) {
      if (r === 0) {
        cells.push(origin);
        continue;
      }
      // anneau |i| + |j| = r, parcouru dans l'ordre (i croissant, puis j croissant) du port Python
      for (let i = -r; i <= r; i++) {
        const rest = r - Math.abs(i);
        const c1 = xyToCell(ox + i, oy - rest);
        if (c1 !== INVALID_CELL) cells.push(c1);
        if (rest !== 0) {
          const c2 = xyToCell(ox + i, oy + rest);
          if (c2 !== INVALID_CELL) cells.push(c2);
        }
      }
    }
    return cells;
  }
  if (minRange === 0) cells.push(origin);
  const dirs: Array<readonly [number, number]> = [];
  if (castInLine) dirs.push(...LINE_DIRS);
  if (castInDiagonal) dirs.push(...DIAG_DIRS);
  for (let r = maxRange; r > 0; r--) {
    if (r < minRange) continue;
    for (const [dx, dy] of dirs) {
      const c = xyToCell(ox + dx * r, oy + dy * r);
      if (c !== INVALID_CELL) cells.push(c);
    }
  }
  return cells;
}

/** Vrai si ``target`` est dans la figure de portée (même règle que rangeCells, sans énumération). */
export function isInCastRange(
  origin: number,
  target: number,
  minRange: number,
  maxRange: number,
  castInLine = false,
  castInDiagonal = false,
): boolean {
  maxRange = Math.max(maxRange, minRange, 0);
  const dx = Math.abs(CELL_X[target]! - CELL_X[origin]!);
  const dy = Math.abs(CELL_Y[target]! - CELL_Y[origin]!);
  if (!castInLine && !castInDiagonal) {
    const d = dx + dy;
    return d >= minRange && d <= maxRange;
  }
  if (dx === 0 && dy === 0) return minRange === 0;
  let r = -1;
  if (castInLine && (dx === 0 || dy === 0)) r = dx + dy;
  else if (castInDiagonal && dx === dy) r = dx;
  return r > 0 && r >= minRange && r <= maxRange;
}

function passesFilters(
  grid: MapGrid,
  origin: number,
  target: number,
  spec: CastRangeSpec,
  opts: CastCellsOptions,
): boolean {
  const isOccupied = opts.isOccupied ?? NEVER;
  if ((opts.requireWalkable ?? true) && !grid.isWalkable(target)) return false;
  if (spec.needFreeCell && isOccupied(target)) return false;
  if (spec.needTakenCell && !isOccupied(target)) return false;
  if (spec.needVisibleEntity && !(opts.isVisibleEntity ?? isOccupied)(target)) return false;
  if (spec.castTestLos && !hasLineOfSight(origin, target, opts.blocksLos ?? isOccupied, grid.blocksLos)) return false;
  return true;
}

/** Cases ciblables depuis ``origin`` (ordre de rangeCells). */
export function castCells(grid: MapGrid, origin: number, spec: CastRangeSpec, opts: CastCellsOptions = {}): number[] {
  const max = effectiveMaxRange(spec, opts.rangeBonus ?? 0);
  const out: number[] = [];
  for (const c of rangeCells(origin, spec.minRange, max, spec.castInLine, spec.castInDiagonal)) {
    if (passesFilters(grid, origin, c, spec, opts)) out.push(c);
  }
  return out;
}

/** Test unitaire d'une case ciblée (équivaut à castCells(...).includes(target), sans énumération). */
export function canCastOn(
  grid: MapGrid,
  origin: number,
  target: number,
  spec: CastRangeSpec,
  opts: CastCellsOptions = {},
): boolean {
  if (!(target >= 0 && target < CELL_X.length)) return false;
  const max = effectiveMaxRange(spec, opts.rangeBonus ?? 0);
  if (!isInCastRange(origin, target, spec.minRange, max, spec.castInLine, spec.castInDiagonal)) return false;
  return passesFilters(grid, origin, target, spec, opts);
}
