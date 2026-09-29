/**
 * Géométrie d'affichage isométrique (pure) : centre écran d'une cellule, losange, cadre de la carte, case sous un
 * point (inverse exact), tracés de chemins. Même repère que le client DOFUS (``cellToPixel`` de la géométrie :
 * cellule de 86 × 43 px au zoom 1, lignes impaires décalées d'une demi-case).
 */
import { cellToXY, isValidCell, xyToCell } from '../../../sim/src/geometry/grid.js';

export const CELL_W = 86;
export const CELL_H = 43;
const HW = CELL_W / 2;
const HH = CELL_H / 2;

/** Centre écran d'une cellule (px, py). */
export function cellCenter(cell: number): [number, number] {
  const [x, y] = cellToXY(cell);
  return xyCenter(x, y);
}

/** Centre écran de coordonnées MapPoint. */
export function xyCenter(x: number, y: number): [number, number] {
  return [HW * (x + y) + HW, HH * (x - y) + HH];
}

/** Sommets du losange (droite, bas, gauche, haut), rétrécis de ``inset`` px, au format SVG ``points``. */
export function diamondPoints(cell: number, inset = 0): string {
  const [cx, cy] = cellCenter(cell);
  const w = HW - inset;
  const h = HH - inset / 2;
  return `${r(cx + w)},${r(cy)} ${r(cx)},${r(cy + h)} ${r(cx - w)},${r(cy)} ${r(cx)},${r(cy - h)}`;
}

function r(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Cadre englobant des losanges des cellules, avec une marge. */
export function mapBounds(cells: readonly number[], pad = 0): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const [cx, cy] = cellCenter(c);
    minX = Math.min(minX, cx - HW);
    maxX = Math.max(maxX, cx + HW);
    minY = Math.min(minY, cy - HH);
    maxY = Math.max(maxY, cy + HH);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
}

/**
 * Cellule sous le point écran (px, py) — inverse exact de ``cellCenter`` : le losange d'une cellule est le carré
 * unité autour de ses coordonnées MapPoint. Renvoie −1 hors carte ou hors de ``allowed`` (s'il est fourni).
 */
export function pickCell(px: number, py: number, allowed?: ReadonlySet<number>): number {
  const s = (px - HW) / HW; // x + y
  const d = (py - HH) / HH; // x − y
  const x = Math.round((s + d) / 2);
  const y = Math.round((s - d) / 2);
  const cell = xyToCell(x, y);
  if (cell < 0 || !isValidCell(cell)) return -1;
  if (allowed && !allowed.has(cell)) return -1;
  return cell;
}

/** Points écran d'un chemin de cellules (départ compris). */
export function pathPoints(cells: readonly number[]): [number, number][] {
  return cells.filter((c) => c >= 0).map((c) => cellCenter(c));
}

/** Attribut SVG ``points`` d'un chemin. */
export function polylinePoints(cells: readonly number[], lift = 0): string {
  return pathPoints(cells)
    .map(([x, y]) => `${r(x)},${r(y - lift)}`)
    .join(' ');
}

/** Ordre de dessin (peintre) : du haut de l'écran vers le bas, puis de gauche à droite. */
export function paintOrder(a: number, b: number): number {
  const [ax, ay] = cellCenter(a);
  const [bx, by] = cellCenter(b);
  return ay - by || ax - bx;
}
