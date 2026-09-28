/**
 * Ligne de vue : tracé de rayon ``MapTools.getCellsIdBetween`` et test ``LosDetector`` du client.
 * Port exact de tools/mechanics/geometry.py (cells_between, has_line_of_sight, los_cells).
 * Voir research/notes/70_formules_dofus.md §2 et ETUDE §9.1.
 */

import { CELL_COUNT, CELL_X, CELL_Y, INVALID_CELL, NEVER, distance, xyToCell, type CellPredicate } from './grid.js';
import type { MapGrid } from './mapGrid.js';

function floatAlmostEquals(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) < 0.0001;
}

/**
 * ``MapTools.getCellsIdBetween`` : cellules traversées de a (exclue) à b (incluse), calcul direct (sans cache).
 * Parcours de grille dans le repère MapPoint ; pas diagonal quand le rayon passe exactement par un coin (tolérance 1e-4).
 */
export function computeCellsBetween(a: number, b: number): number[] {
  if (a === b || !(a >= 0 && a < CELL_COUNT && b >= 0 && b < CELL_COUNT)) return [];
  let x = CELL_X[a]!;
  let y = CELL_Y[a]!;
  const x2 = CELL_X[b]!;
  const y2 = CELL_Y[b]!;
  const dx = x2 - x;
  const dy = y2 - y;
  const norm = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / norm;
  const uy = dy / norm;
  const stepX = ux !== 0 ? Math.abs(1 / ux) : Infinity;
  const stepY = uy !== 0 ? Math.abs(1 / uy) : Infinity;
  const sx = ux < 0 ? -1 : 1;
  const sy = uy < 0 ? -1 : 1;
  let tx = 0.5 * stepX;
  let ty = 0.5 * stepY;
  const out: number[] = [];
  while (x !== x2 || y !== y2) {
    if (floatAlmostEquals(tx, ty)) {
      tx += stepX;
      ty += stepY;
      x += sx;
      y += sy;
    } else if (tx < ty) {
      tx += stepX;
      x += sx;
    } else {
      ty += stepY;
      y += sy;
    }
    out.push(xyToCell(x, y));
  }
  return out;
}

const EMPTY_LINE = new Int16Array(0);
const LINE_CACHE: Array<Int16Array | null> = new Array<Int16Array | null>(CELL_COUNT * CELL_COUNT).fill(null);

/** Ligne a -> b (a exclue, b incluse) depuis un cache paresseux partagé. Ne pas modifier le tableau renvoyé. */
export function lineBetween(a: number, b: number): Int16Array {
  if (!(a >= 0 && a < CELL_COUNT && b >= 0 && b < CELL_COUNT) || a === b) return EMPTY_LINE;
  const key = a * CELL_COUNT + b;
  let line = LINE_CACHE[key];
  if (!line) {
    line = Int16Array.from(computeCellsBetween(a, b));
    LINE_CACHE[key] = line;
  }
  return line;
}

/** ``MapTools.getCellsIdBetween`` (copie modifiable). */
export function cellsBetween(a: number, b: number): number[] {
  return Array.from(lineBetween(a, b));
}

/**
 * Ligne de vue d'un couple (origine, cible) selon ``LosDetector.getCell`` :
 * - ``mapBlocks(c)`` : la carte bloque la vue sur c (drapeau los à faux) ; testé sur TOUTES les cases de la ligne,
 *   cible comprise ;
 * - ``entityBlocks(c)`` : une entité bloque la vue sur c (combattant visible) ; testé sur les cases INTERMÉDIAIRES
 *   seulement (ni le lanceur ni la cible ne bloquent).
 */
export function hasLineOfSight(
  origin: number,
  target: number,
  entityBlocks: CellPredicate = NEVER,
  mapBlocks: CellPredicate = NEVER,
): boolean {
  if (origin === target) return true;
  const line = lineBetween(origin, target);
  for (let j = 0; j < line.length; j++) {
    const c = line[j]!;
    if (c === INVALID_CELL) continue;
    if (j > 0) {
      const prev = line[j - 1]!;
      if (prev !== INVALID_CELL && entityBlocks(prev)) return false;
    }
    if (mapBlocks(c)) return false;
  }
  return true;
}

/** Ligne de vue sur une carte donnée (drapeaux los de la carte + entités bloquantes). */
export function gridLineOfSight(
  grid: MapGrid,
  origin: number,
  target: number,
  entityBlocks: CellPredicate = NEVER,
): boolean {
  return hasLineOfSight(origin, target, entityBlocks, grid.blocksLos);
}

/**
 * Version « liste » fidèle à ``LosDetector.getCell`` (tri par distance décroissante + cache par coordonnée).
 * Donne le même ensemble que ``hasLineOfSight`` appliqué à chaque candidat (vérifié) ; l'ordre de sortie est
 * celui du client : l'origine d'abord si elle est candidate, puis les candidats visibles dans l'ordre d'entrée.
 */
export function losCells(
  origin: number,
  candidates: readonly number[],
  entityBlocks: CellPredicate = NEVER,
  mapBlocks: CellPredicate = NEVER,
): number[] {
  const ox = CELL_X[origin]!;
  const oy = CELL_Y[origin]!;
  const ordered = [...candidates].sort((p, q) => distance(origin, q) - distance(origin, p));
  const tested = new Int8Array(CELL_COUNT).fill(-1); // indexé par cellule (bijection avec (x, y))
  const result: number[] = [];
  for (const p of ordered) {
    const px = CELL_X[p]!;
    const py = CELL_Y[p]!;
    if (tested[p] !== -1 && ox + oy !== px + py && ox - oy !== px - py) continue;
    const line = lineBetween(origin, p);
    if (line.length === 0) {
      result.push(p);
      continue;
    }
    let los = true;
    let cur = -1;
    for (let j = 0; j < line.length; j++) {
      const c = line[j]!;
      const cx = CELL_X[c]!;
      const cy = CELL_Y[c]!;
      cur = c;
      if (j > 0 && entityBlocks(line[j - 1]!)) {
        los = false;
      } else if (cx + cy === ox + oy || cx - cy === ox - oy) {
        los = los && !mapBlocks(c);
      } else if (tested[c] === -1) {
        los = los && !mapBlocks(c);
      } else {
        los = los && tested[c] === 1;
      }
    }
    tested[cur] = los ? 1 : 0;
  }
  for (const c of candidates) if (tested[c] === 1) result.push(c);
  return result;
}
