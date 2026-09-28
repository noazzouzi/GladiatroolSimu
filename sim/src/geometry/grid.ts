/**
 * Grille des cartes de combat DOFUS : identifiants de cellules, repère MapPoint, directions, distances.
 *
 * Port exact de tools/mechanics/geometry.py (lui-même porté de mapTools.MapTools du client DOFUS 2.73.3,
 * repris à l'identique par DOFUS 3). Voir research/notes/70_formules_dofus.md §1 et ETUDE §3.2.
 *
 * Conventions :
 * - cellId = row * 14 + col, row ∈ [0, 39], col ∈ [0, 13] ; 560 cellules.
 * - MapPoint : a = (row + 1) >> 1 ; x = a + col ; y = col - (row - a). +x = bas-droite écran, +y = haut-droite.
 * - Directions 0..7 = E, SE, S, SW, W, NW, N, NE (vecteurs DIRECTION_VECTORS).
 *   Impaires (1, 3, 5, 7) = « axes » MapPoint (client : « orthogonales ») : un pas = distance 1.
 *   Paires (0, 2, 4, 6) = « diagonales » MapPoint (client : « cardinales ») : un pas = distance 2.
 * - Distance DOFUS = |dx| + |dy| (Manhattan en MapPoint).
 *
 * Toutes les tables sont précalculées au chargement du module (tableaux typés).
 */

export const MAP_WIDTH = 14;
export const MAP_HEIGHT = 20;
export const MAP_ROWS = MAP_HEIGHT * 2;
export const CELL_COUNT = MAP_WIDTH * MAP_HEIGHT * 2; // 560
export const INVALID_CELL = -1;
export const MIN_X = 0;
export const MAX_X = 33;
export const MIN_Y = -19;
export const MAX_Y = 13;
/** Rayon / portée « infini » utilisé par les données (zones C63, X63, portée 63). */
export const PSEUDO_INFINITE = 63;

/** Prédicat sur une cellule (occupation, blocage de ligne de vue, pics…). */
export type CellPredicate = (cell: number) => boolean;
/** Prédicat toujours faux (aucun blocage). */
export const NEVER: CellPredicate = () => false;
/** Prédicat toujours vrai. */
export const ALWAYS: CellPredicate = () => true;

// ---------------------------------------------------------------------------------------------
// Directions (MapDirection / MapTools.COORDINATES_DIRECTION)
// ---------------------------------------------------------------------------------------------

export const DIR_EAST = 0;
export const DIR_SOUTH_EAST = 1;
export const DIR_SOUTH = 2;
export const DIR_SOUTH_WEST = 3;
export const DIR_WEST = 4;
export const DIR_NORTH_WEST = 5;
export const DIR_NORTH = 6;
export const DIR_NORTH_EAST = 7;

export const DIRECTION_NAMES = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const;
/** Libellés français (orientation écran) pour les journaux. */
export const DIRECTION_LABELS_FR = [
  'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est',
] as const;

/** Vecteurs (dx, dy) en MapPoint, identiques à rules.directions.vectors du SPEC. */
export const DIRECTION_VECTORS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1],
];
export const DIR_DX: Int8Array = Int8Array.from(DIRECTION_VECTORS, (v) => v[0]);
export const DIR_DY: Int8Array = Int8Array.from(DIRECTION_VECTORS, (v) => v[1]);

/** Directions impaires : axes MapPoint (déplacement, croix X, lancer en ligne). Client : MAP_ORTHOGONAL_DIRECTIONS. */
export const AXIS_DIRECTIONS: readonly number[] = [1, 3, 5, 7];
/** Directions paires : diagonales MapPoint (horizontale/verticale écran). Client : MAP_CARDINAL_DIRECTIONS. */
export const DIAGONAL_DIRECTIONS: readonly number[] = [0, 2, 4, 6];
export const ALL_DIRECTIONS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

export function isValidDirection(d: number): boolean {
  return d >= 0 && d <= 7;
}

export function oppositeDirection(d: number): number {
  return d ^ 4;
}

/** Direction impaire (axe MapPoint, pas de distance 1). Client : isOrthogonal. */
export function isAxisDirection(d: number): boolean {
  return (d & 1) === 1;
}

/** Direction paire (diagonale MapPoint, pas de distance 2). Client : isCardinal. */
export function isDiagonalDirection(d: number): boolean {
  return (d & 1) === 0;
}

// ---------------------------------------------------------------------------------------------
// Tables précalculées
// ---------------------------------------------------------------------------------------------

const X_SPAN = MAX_X - MIN_X + 1;
const Y_SPAN = MAX_Y - MIN_Y + 1;

/** Coordonnée x MapPoint de chaque cellule (index = cellId). Ne pas modifier. */
export const CELL_X = new Int8Array(CELL_COUNT);
/** Coordonnée y MapPoint de chaque cellule (index = cellId). Ne pas modifier. */
export const CELL_Y = new Int8Array(CELL_COUNT);
const COORD_TO_CELL = new Int16Array(X_SPAN * Y_SPAN).fill(INVALID_CELL);
/** Cellule suivante : NEXT_CELL[cell * 8 + dir] (-1 si hors carte). Ne pas modifier. */
export const NEXT_CELL = new Int16Array(CELL_COUNT * 8);
const NEIGHBOURS_4: number[][] = [];
const NEIGHBOURS_8: number[][] = [];

/** ``MapTools.isValidCoord`` (test exact : équivaut à « (x, y) est l'une des 560 cellules »). */
export function isValidCoord(x: number, y: number): boolean {
  return -x <= y && y <= x && y <= MAP_WIDTH + MAX_Y - x && y >= x - (MAP_HEIGHT - MIN_Y);
}

(function buildTables(): void {
  for (let c = 0; c < CELL_COUNT; c++) {
    const row = Math.floor(c / MAP_WIDTH);
    const a = (row + 1) >> 1;
    const b = row - a;
    const col = c - row * MAP_WIDTH;
    const x = a + col;
    const y = col - b;
    CELL_X[c] = x;
    CELL_Y[c] = y;
    COORD_TO_CELL[(x - MIN_X) * Y_SPAN + (y - MIN_Y)] = c;
  }
  for (let c = 0; c < CELL_COUNT; c++) {
    const n4: number[] = [];
    const n8: number[] = [];
    for (let d = 0; d < 8; d++) {
      const n = xyToCell(CELL_X[c]! + DIR_DX[d]!, CELL_Y[c]! + DIR_DY[d]!);
      NEXT_CELL[c * 8 + d] = n;
      if (n !== INVALID_CELL) n8.push(n);
    }
    for (const d of AXIS_DIRECTIONS) {
      const n = NEXT_CELL[c * 8 + d]!;
      if (n !== INVALID_CELL) n4.push(n);
    }
    NEIGHBOURS_4.push(n4);
    NEIGHBOURS_8.push(n8);
  }
})();

// ---------------------------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------------------------

export function isValidCell(cell: number): boolean {
  return Number.isInteger(cell) && cell >= 0 && cell < CELL_COUNT;
}

/** ``MapTools.getCellIdByCoord`` ; -1 si hors carte. */
export function xyToCell(x: number, y: number): number {
  if (x < MIN_X || x > MAX_X || y < MIN_Y || y > MAX_Y) return INVALID_CELL;
  return COORD_TO_CELL[(x - MIN_X) * Y_SPAN + (y - MIN_Y)]!;
}

/** Coordonnées MapPoint [x, y] ; lève une RangeError pour une cellule invalide. */
export function cellToXY(cell: number): [number, number] {
  if (!isValidCell(cell)) throw new RangeError(`cellule invalide ${cell}`);
  return [CELL_X[cell]!, CELL_Y[cell]!];
}

/** x MapPoint (sans contrôle : la cellule doit être valide). */
export function cellX(cell: number): number {
  return CELL_X[cell]!;
}

/** y MapPoint (sans contrôle : la cellule doit être valide). */
export function cellY(cell: number): number {
  return CELL_Y[cell]!;
}

export function cellToRowCol(cell: number): [number, number] {
  const row = Math.floor(cell / MAP_WIDTH);
  return [row, cell - row * MAP_WIDTH];
}

export function rowColToCell(row: number, col: number): number {
  return row * MAP_WIDTH + col;
}

/** Centre de la cellule en pixels (DOFUS 2, zoom 1, cellule 86 x 43), pour l'affichage. */
export function cellToPixel(cell: number): [number, number] {
  const [x, y] = cellToXY(cell);
  return [43.0 * (x + y) + 43.0, 21.5 * (x - y) + 21.5];
}

// ---------------------------------------------------------------------------------------------
// Distances et relations
// ---------------------------------------------------------------------------------------------

/** ``MapTools.getDistance`` : Manhattan en MapPoint ; -1 si une cellule est invalide. */
export function distance(a: number, b: number): number {
  if (!(a >= 0 && a < CELL_COUNT && b >= 0 && b < CELL_COUNT)) return -1;
  return Math.abs(CELL_X[a]! - CELL_X[b]!) + Math.abs(CELL_Y[a]! - CELL_Y[b]!);
}

/** Distance de Chebyshev max(|dx|, |dy|) en MapPoint ; -1 si une cellule est invalide. */
export function chebyshevDistance(a: number, b: number): number {
  if (!(a >= 0 && a < CELL_COUNT && b >= 0 && b < CELL_COUNT)) return -1;
  return Math.max(Math.abs(CELL_X[a]! - CELL_X[b]!), Math.abs(CELL_Y[a]! - CELL_Y[b]!));
}

/** ``MapTools.areCellsAdjacent`` : distance <= 1 (4-voisinage MapPoint, une case est adjacente à elle-même). */
export function areAdjacent(a: number, b: number): boolean {
  const d = distance(a, b);
  return d >= 0 && d <= 1;
}

/** Même axe MapPoint (même x ou même y) : lancer « en ligne », croix X. */
export function inLine(a: number, b: number): boolean {
  return CELL_X[a] === CELL_X[b] || CELL_Y[a] === CELL_Y[b];
}

/** ``MapTools.isInDiag`` : |dx| == |dy| (diagonale MapPoint = horizontale/verticale écran). */
export function inDiagonal(a: number, b: number): boolean {
  return Math.abs(CELL_X[a]! - CELL_X[b]!) === Math.abs(CELL_Y[a]! - CELL_Y[b]!);
}

/** Aligné sur l'une des 8 directions (axe ou diagonale MapPoint). */
export function isAligned(a: number, b: number): boolean {
  return inLine(a, b) || inDiagonal(a, b);
}

/** ``MapTools.getNextCellByDirection`` ; -1 si cellule ou direction invalide, ou si hors carte. */
export function nextCell(cell: number, direction: number): number {
  if (!(cell >= 0 && cell < CELL_COUNT) || !(direction >= 0 && direction <= 7)) return INVALID_CELL;
  return NEXT_CELL[cell * 8 + direction]!;
}

/** Cellule à n pas dans une direction (-1 si l'on sort de la carte). */
export function cellInDirection(cell: number, direction: number, steps: number): number {
  let c = cell;
  for (let i = 0; i < steps && c !== INVALID_CELL; i++) c = nextCell(c, direction);
  return c;
}

/** Cellules successives dans une direction (case de départ exclue) jusqu'au bord de la carte ou maxSteps. */
export function cellsInDirection(cell: number, direction: number, maxSteps = CELL_COUNT): number[] {
  const out: number[] = [];
  let c = nextCell(cell, direction);
  while (c !== INVALID_CELL && out.length < maxSteps) {
    out.push(c);
    c = nextCell(c, direction);
  }
  return out;
}

/** 4 voisines (directions 1, 3, 5, 7, dans cet ordre), tableau partagé : ne pas modifier. */
export function neighbours4(cell: number): readonly number[] {
  return NEIGHBOURS_4[cell] ?? [];
}

/** 8 voisines (directions 0..7, dans cet ordre), tableau partagé : ne pas modifier. */
export function neighbours8(cell: number): readonly number[] {
  return NEIGHBOURS_8[cell] ?? [];
}

/** Voisines dans les directions données (ordre conservé), comme ``geometry.neighbours``. */
export function neighbours(cell: number, directions: readonly number[] = AXIS_DIRECTIONS): number[] {
  const out: number[] = [];
  for (const d of directions) {
    const n = nextCell(cell, d);
    if (n !== INVALID_CELL) out.push(n);
  }
  return out;
}

/** Symétrique de ``cell`` par rapport à ``center`` (-1 si hors carte). Téléportations 1104/1105/1106. */
export function symmetricCell(center: number, cell: number): number {
  return xyToCell(2 * CELL_X[center]! - CELL_X[cell]!, 2 * CELL_Y[center]! - CELL_Y[cell]!);
}

// ---------------------------------------------------------------------------------------------
// Orientations (port exact, cas limites compris)
// ---------------------------------------------------------------------------------------------

/** ``getLookDirection4ByCoord`` : axe dominant (1/3/5/7) ; égalité -> axe y. */
export function dir4ByCoord(x1: number, y1: number, x2: number, y2: number): number {
  if (!isValidCoord(x1, y1) || !isValidCoord(x2, y2)) return -1;
  const dx = x1 - x2;
  const dy = y1 - y2;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 5;
  return dy < 0 ? 7 : 3;
}

/** ``getLookDirection4ExactByCoord`` : 1/3/5/7 si alignés sur un axe, sinon -1 (même case -> 1). */
export function dir4ExactByCoord(x1: number, y1: number, x2: number, y2: number): number {
  if (!isValidCoord(x1, y1) || !isValidCoord(x2, y2)) return -1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dy === 0) return dx < 0 ? 5 : 1;
  if (dx === 0) return dy < 0 ? 3 : 7;
  return -1;
}

/** ``getLookDirection4DiagByCoord`` : une des 4 directions diagonales (0/2/4/6). */
export function dir4DiagByCoord(x1: number, y1: number, x2: number, y2: number): number {
  if (!isValidCoord(x1, y1) || !isValidCoord(x2, y2)) return -1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if ((dx >= 0 && dy <= 0) || (dx <= 0 && dy >= 0)) return dx < 0 ? 6 : 2;
  return dx < 0 ? 4 : 0;
}

/** ``getLookDirection4DiagExactByCoord`` : 0/2/4/6 si |dx| == |dy|, sinon -1 (même case -> 2). */
export function dir4DiagExactByCoord(x1: number, y1: number, x2: number, y2: number): number {
  if (!isValidCoord(x1, y1) || !isValidCoord(x2, y2)) return -1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === -dy) return dx < 0 ? 6 : 2;
  if (dx === dy) return dx < 0 ? 4 : 0;
  return -1;
}

/** Direction exacte sur 8 : axe, sinon diagonale exacte, sinon -1. Oriente les zones directionnelles. */
export function dir8ExactByCoord(x1: number, y1: number, x2: number, y2: number): number {
  const d = dir4ExactByCoord(x1, y1, x2, y2);
  if (isValidDirection(d)) return d;
  return dir4DiagExactByCoord(x1, y1, x2, y2);
}

/** Direction approchée sur 8 (``getLookDirection8``) : exacte si possible, sinon octant. */
export function dir8ByCoord(x1: number, y1: number, x2: number, y2: number): number {
  let d = dir8ExactByCoord(x1, y1, x2, y2);
  if (!isValidDirection(d)) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < ay) {
      if (dy > 0) d = dx < 0 ? 6 : 7;
      else d = dx < 0 ? 3 : 2;
    } else if (dx > 0) {
      d = dy > 0 ? 0 : 1;
    } else {
      d = dy < 0 ? 4 : 5;
    }
  }
  return d;
}

// Versions par cellule (-1 si une cellule est invalide ; le port Python lève une exception).

function validPair(a: number, b: number): boolean {
  return a >= 0 && a < CELL_COUNT && b >= 0 && b < CELL_COUNT;
}

export function dir4(a: number, b: number): number {
  if (!validPair(a, b)) return -1;
  const dx = CELL_X[a]! - CELL_X[b]!;
  const dy = CELL_Y[a]! - CELL_Y[b]!;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 5;
  return dy < 0 ? 7 : 3;
}

export function dir4Exact(a: number, b: number): number {
  if (!validPair(a, b)) return -1;
  const dx = CELL_X[b]! - CELL_X[a]!;
  const dy = CELL_Y[b]! - CELL_Y[a]!;
  if (dy === 0) return dx < 0 ? 5 : 1;
  if (dx === 0) return dy < 0 ? 3 : 7;
  return -1;
}

export function dir4Diag(a: number, b: number): number {
  if (!validPair(a, b)) return -1;
  return dir4DiagByCoord(CELL_X[a]!, CELL_Y[a]!, CELL_X[b]!, CELL_Y[b]!);
}

export function dir4DiagExact(a: number, b: number): number {
  if (!validPair(a, b)) return -1;
  const dx = CELL_X[b]! - CELL_X[a]!;
  const dy = CELL_Y[b]! - CELL_Y[a]!;
  if (dx === -dy) return dx < 0 ? 6 : 2;
  if (dx === dy) return dx < 0 ? 4 : 0;
  return -1;
}

export function dir8Exact(a: number, b: number): number {
  const d = dir4Exact(a, b);
  if (d >= 0) return d;
  return dir4DiagExact(a, b);
}

export function dir8(a: number, b: number): number {
  if (!validPair(a, b)) return -1;
  return dir8ByCoord(CELL_X[a]!, CELL_Y[a]!, CELL_X[b]!, CELL_Y[b]!);
}
