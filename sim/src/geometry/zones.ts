/**
 * Zones d'effet des sorts : port exact de tools/mechanics/zones.py (``mapTools.SpellZone`` du client DOFUS 2.73.3,
 * mêmes formes dans DOFUS 3). Voir research/notes/70_formules_dofus.md §3 et ETUDE §9.3.
 *
 * - ``cells(target, caster)`` = ``SpellZone.getCells`` : liste ORDONNÉE (ordre du client ; sert à l'affichage et
 *   à la téléportation « première case libre »). Comme le client, peut contenir -1 (pas hors carte non filtré par
 *   certaines formes : cône V, centre de U/B/X…) : filtrer avec isValidCell si nécessaire.
 * - ``contains(cell, target, caster)`` = ``SpellZone.isCellInZone`` : test utilisé pour choisir les cibles.
 *   Coïncide avec ``cells`` sauf cas limites documentés (fourche F non alignée, B/V en diagonale, l avec min != 1,
 *   damier D).
 * - ``aoeMalus(target, caster, cell)`` = ``SpellZone.getAoeMalus`` : réduction de dégressivité en % (0..100).
 * Les zones orientées utilisent dir8Exact(lanceur, cible) ; si le lanceur n'est pas aligné, direction -1.
 */

import {
  AXIS_DIRECTIONS,
  ALL_DIRECTIONS,
  CELL_COUNT,
  CELL_X,
  CELL_Y,
  DIAGONAL_DIRECTIONS,
  INVALID_CELL,
  distance,
  dir4,
  dir8Exact,
  isValidCell,
  isValidCoord,
  nextCell,
  xyToCell,
} from './grid.js';

export const DEFAULT_RADIUS = 1;
export const DEFAULT_MIN_RADIUS = 0;
export const DEFAULT_DEGRESSION = 10;
export const DEFAULT_MAX_DEGRESSION_TICKS = 4;
export const GLOBAL_RADIUS = 63;
/** Au-delà de ce rayon, jamais de dégressivité (zones « infinies » C63, X63…). */
export const MAX_RADIUS_DEGRESSION = 50;

/** Formes dont le 2e paramètre du rawZone est le rayon minimal (``SpellZone.hasMinSize``). */
export const MIN_SIZE_SHAPES = '#+CQRXl';
const KNOWN_SHAPES = ' ;#*+-/ABCDFGILOPQRTUVWXZal';

/** Libellés français des formes (UI, journaux). */
export const SHAPE_NAMES_FR: Readonly<Record<string, string>> = {
  ' ': 'vide',
  ';': 'liste explicite de cellules',
  A: 'toute la carte (y compris morts)',
  a: 'toute la carte (vivants, y compris portés)',
  B: 'boomerang',
  C: 'cercle (losange Manhattan)',
  D: 'damier',
  F: 'fourche',
  G: 'carré plein (Chebyshev)',
  I: 'cercle inversé (tout sauf le cercle)',
  L: 'ligne (depuis la cible, dans le sens lanceur->cible)',
  O: 'anneau (bord du cercle)',
  P: 'point',
  Q: 'croix orthogonale sans centre',
  R: 'rectangle (largeur 2r+1, profondeur 1+min)',
  T: 'ligne perpendiculaire (T)',
  U: 'demi-cercle',
  V: 'cône',
  W: 'carré sans diagonales',
  X: 'croix orthogonale (axes MapPoint)',
  Z: 'cercle euclidien inversé',
  l: 'ligne depuis le lanceur',
  '#': 'croix cardinale sans centre',
  '*': 'étoile (8 directions)',
  '+': 'croix cardinale (diagonales MapPoint)',
  '-': 'ligne perpendiculaire (identique à T)',
  '/': 'ligne (identique à L)',
};

/** ``zoneDescr`` DofusDB / données DOFUS 3. */
export interface ZoneDescr {
  shape?: number | null;
  param1?: number | null;
  param2?: number | null;
  damageDecreaseStepPercent?: number | null;
  maxDamageDecreaseApplyCount?: number | null;
  isStopAtTarget?: boolean | null;
  cellIds?: readonly number[] | null;
}

export interface SpellZoneInit {
  shape?: string;
  radius?: number;
  minRadius?: number;
  degression?: number;
  maxDegressionTicks?: number;
  stopAtTarget?: boolean;
  cellIds?: readonly number[];
}

function mod8(n: number): number {
  return ((n % 8) + 8) % 8;
}

function isCardinalDir(d: number): boolean {
  return (d & 1) === 0;
}

/** Division entière façon Python (plancher) pour des entiers. */
function floorDiv(a: number, b: number): number {
  return Math.floor(a / b);
}

export class SpellZone {
  readonly shape: string;
  readonly radius: number;
  readonly minRadius: number;
  readonly degression: number;
  readonly maxDegressionTicks: number;
  readonly stopAtTarget: boolean;
  readonly cellIds: readonly number[];
  private cellIdSet: Set<number> | null = null;

  /** Construction directe, SANS normalisation (comme le dataclass Python). */
  constructor(init: SpellZoneInit = {}) {
    this.shape = init.shape ?? 'P';
    this.radius = init.radius ?? DEFAULT_RADIUS;
    this.minRadius = init.minRadius ?? DEFAULT_MIN_RADIUS;
    this.degression = init.degression ?? DEFAULT_DEGRESSION;
    this.maxDegressionTicks = init.maxDegressionTicks ?? DEFAULT_MAX_DEGRESSION_TICKS;
    this.stopAtTarget = init.stopAtTarget ?? false;
    this.cellIds = init.cellIds ? [...init.cellIds] : [];
  }

  /** ``SpellZone.fromRawZone`` : lettre + "p0,p1,p2,p3,p4". */
  static fromRaw(raw?: string | null): SpellZone {
    if (!raw) raw = 'P';
    const shape = raw[0]!;
    const params = raw
      .slice(1)
      .split(',')
      .filter((p) => p.length > 0)
      .map((p) => parseIntStrict(p));
    if (shape === ';') return new SpellZone({ shape, cellIds: params });
    if (shape === 'l' && params.length >= 2) {
      const t = params[0]!;
      params[0] = params[1]!;
      params[1] = t;
    }
    const z: Required<Omit<SpellZoneInit, 'cellIds'>> = {
      shape,
      radius: DEFAULT_RADIUS,
      minRadius: DEFAULT_MIN_RADIUS,
      degression: DEFAULT_DEGRESSION,
      maxDegressionTicks: DEFAULT_MAX_DEGRESSION_TICKS,
      stopAtTarget: false,
    };
    if (params.length > 0) z.radius = params[0]!;
    if (MIN_SIZE_SHAPES.includes(shape)) {
      if (params.length > 1) z.minRadius = params[1]!;
      if (params.length > 2) z.degression = params[2]!;
    } else {
      if (params.length > 1) z.degression = params[1]!;
      if (params.length > 2) z.maxDegressionTicks = params[2]!;
    }
    if (params.length > 3) z.maxDegressionTicks = params[3]!;
    if (params.length > 4) z.stopAtTarget = params[4] !== 0;
    return new SpellZone(normalise(z));
  }

  /**
   * Depuis ``zoneDescr`` (DofusDB / DOFUS 3) : {shape (code ASCII), param1, param2, damageDecreaseStepPercent,
   * maxDamageDecreaseApplyCount, isStopAtTarget, cellIds}. Pour 'l', param1/param2 sont inversés comme dans le client.
   * Les champs forcedDirection, includeCarried et onlyAffectIfInSightLine ne sont pas interprétés ici.
   */
  static fromZoneDescr(zd: ZoneDescr): SpellZone {
    const code = zd.shape === undefined ? 80 : zd.shape || 0;
    const shape = code ? String.fromCharCode(code) : ' ';
    if (shape === ';') return new SpellZone({ shape, cellIds: zd.cellIds ?? [] });
    let p1 = Math.trunc(zd.param1 === undefined ? 1 : zd.param1 || 0);
    let p2 = Math.trunc(zd.param2 === undefined ? 0 : zd.param2 || 0);
    if (shape === 'l') {
      const t = p1;
      p1 = p2;
      p2 = t;
    }
    return new SpellZone(
      normalise({
        shape,
        radius: p1,
        minRadius: MIN_SIZE_SHAPES.includes(shape) ? p2 : 0,
        degression: Math.trunc(
          zd.damageDecreaseStepPercent === undefined ? DEFAULT_DEGRESSION : zd.damageDecreaseStepPercent || 0,
        ),
        maxDegressionTicks: Math.trunc(
          zd.maxDamageDecreaseApplyCount === undefined
            ? DEFAULT_MAX_DEGRESSION_TICKS
            : zd.maxDamageDecreaseApplyCount || 0,
        ),
        stopAtTarget: Boolean(zd.isStopAtTarget),
      }),
    );
  }

  /**
   * Depuis une zone DÉJÀ normalisée (``ZoneData`` de sim/data : {shape, radius, minRadius, degression, maxTicks,
   * stopAtTarget?, cellIds?}) : aucune normalisation supplémentaire.
   */
  static fromZoneData(z: {
    shape: string;
    radius: number;
    minRadius: number;
    degression: number;
    maxTicks: number;
    stopAtTarget?: boolean;
    cellIds?: readonly number[];
  }): SpellZone {
    return new SpellZone({
      shape: z.shape,
      radius: z.radius,
      minRadius: z.minRadius,
      degression: z.degression,
      maxDegressionTicks: z.maxTicks,
      stopAtTarget: z.stopAtTarget ?? false,
      cellIds: z.cellIds ?? [],
    });
  }

  /** Représentation rawZone normalisée (pour les journaux et les clés de cache). */
  raw(): string {
    if (this.shape === ';') return ';' + this.cellIds.join(',');
    return `${this.shape}${this.radius},${this.minRadius},${this.degression},${this.maxDegressionTicks}`;
  }

  /** Zone d'effet (rayon >= 1) : la dégressivité s'applique. */
  isAoe(): boolean {
    return this.radius >= 1;
  }

  // ------------------------------------------------------------------ cellules (getCells)

  cells(target: number, caster: number): number[] {
    switch (this.shape) {
      case ';':
        return [...this.cellIds];
      case ' ':
        return [];
      case 'A':
      case 'a': {
        const out: number[] = new Array<number>(CELL_COUNT);
        for (let c = 0; c < CELL_COUNT; c++) out[c] = c;
        return out;
      }
      case 'P':
        return isValidCell(target) ? [target] : [];
      case 'C':
      case 'I':
      case 'O':
        return fillCircle(this, target);
      case 'D':
        return fillCheckerboard(this, target);
      case 'L':
      case '/':
        return fillLine(this, false, target, caster);
      case 'l':
        return fillLine(this, true, target, caster);
      case 'X':
        return fillCross(this, AXIS_DIRECTIONS, false, target);
      case 'Q':
        return fillCross(this, AXIS_DIRECTIONS, true, target);
      case '+':
        return fillCross(this, DIAGONAL_DIRECTIONS, false, target);
      case '#':
        return fillCross(this, DIAGONAL_DIRECTIONS, true, target);
      case '*':
        return fillCross(this, ALL_DIRECTIONS, false, target);
      case 'T':
      case '-':
        return fillPerpLine(this, target, caster);
      case 'V':
        return fillCone(this, target, caster);
      case 'F':
        return fillFork(this, target, caster);
      case 'G':
        return fillSquare(this, false, target);
      case 'W':
        return fillSquare(this, true, target);
      case 'R':
        return fillRectangle(this, target, caster);
      case 'U':
        return fillHalfCircle(this, target, caster);
      case 'B':
        return fillBoomerang(this, target, caster);
      case 'Z':
        return fillReversedTrueCircle(this, target);
      default:
        return [target];
    }
  }

  // ------------------------------------------------------------------ appartenance (isCellInZone)

  contains(cell: number, target: number, caster: number): boolean {
    switch (this.shape) {
      case ';':
        if (!this.cellIdSet) this.cellIdSet = new Set(this.cellIds);
        return this.cellIdSet.has(cell);
      case ' ':
        return false;
      case 'A':
      case 'a':
        return true;
      case 'P':
        return cell === target;
      case 'C':
      case 'I':
      case 'O': {
        const d = distance(target, cell);
        return this.minRadius <= d && d <= this.radius;
      }
      case 'D':
        return inCheckerboard(this, cell, target);
      case 'L':
      case '/':
        return inLineZone(this, false, cell, target, caster);
      case 'l':
        return inLineZone(this, true, cell, target, caster);
      case 'X':
        return inCross(this, AXIS_DIRECTIONS, false, cell, target);
      case 'Q':
        return inCross(this, AXIS_DIRECTIONS, true, cell, target);
      case '+':
        return inCross(this, DIAGONAL_DIRECTIONS, false, cell, target);
      case '#':
        return inCross(this, DIAGONAL_DIRECTIONS, true, cell, target);
      case '*':
        return inCross(this, ALL_DIRECTIONS, false, cell, target);
      case 'T':
      case '-':
        return inPerpLine(this, cell, target, caster);
      case 'V':
        return inCone(this, cell, target, caster);
      case 'F':
        return inFork(this, cell, target, caster);
      case 'G':
        return inSquare(this, false, cell, target);
      case 'W':
        return inSquare(this, true, cell, target);
      case 'R':
        return inRectangle(this, cell, target, caster);
      case 'U':
        return inHalfCircle(this, cell, target, caster);
      case 'B':
        return inBoomerang(this, cell, target, caster);
      case 'Z':
        return inReversedTrueCircle(this, cell, target);
      default:
        return cell === target;
    }
  }

  /** Cellules pour lesquelles ``contains`` est vrai, triées (sélection des cibles). */
  containedCells(target: number, caster: number): number[] {
    const out: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) if (this.contains(c, target, caster)) out.push(c);
    return out;
  }

  // ------------------------------------------------------------------ dégressivité

  /**
   * ``SpellZone.getAoeMalus`` : réduction en % pour un combattant situé en ``cell`` (position AVANT le sort).
   * Distance selon la forme : ';AIa' -> 0 ; 'GRW' -> Chebyshev ; '#+-/U' -> Manhattan >> 1 ; 'FV' -> projection
   * selon dir8Exact(lanceur, cible) ; autres -> Manhattan. malus = min(min(dist - rmin, paliers) * pas, 100),
   * rmin = 0 pour R. Aucun malus si rayon > 50. Peut être négatif si dist < rayon minimal (comme le client).
   */
  aoeMalus(target: number, caster: number, cell: number): number {
    if (this.radius > MAX_RADIUS_DEGRESSION) return 0;
    const s = this.shape;
    let dist: number;
    if (s === ';' || s === 'A' || s === 'I' || s === 'a') {
      dist = 0;
    } else if (s === 'G' || s === 'R' || s === 'W') {
      dist = Math.max(Math.abs(CELL_X[target]! - CELL_X[cell]!), Math.abs(CELL_Y[target]! - CELL_Y[cell]!));
    } else if (s === '#' || s === '+' || s === '-' || s === '/' || s === 'U') {
      dist = distance(target, cell) >> 1;
    } else if (s === 'F' || s === 'V') {
      const d = dir8Exact(caster, target);
      const tx = CELL_X[target]!;
      const ty = CELL_Y[target]!;
      const cx = CELL_X[cell]!;
      const cy = CELL_Y[cell]!;
      if (d === 0 || d === 4) dist = Math.abs(Math.abs(tx - ty) + Math.abs(cx - cy)); // tel quel dans le client
      else if (d === 1 || d === 5) dist = Math.abs(tx - cx);
      else if (d === 2 || d === 6) dist = Math.abs(Math.abs(tx - ty) - Math.abs(cx - cy));
      else if (d === 3 || d === 7) dist = Math.abs(ty - cy);
      else dist = 0;
    } else {
      dist = distance(target, cell);
    }
    const rmin = s === 'R' ? 0 : this.minRadius;
    if (dist < 0) dist = 0;
    return Math.trunc(Math.min(Math.min(dist - rmin, this.maxDegressionTicks) * this.degression, 100));
  }

  /** Coefficient appliqué aux dégâts/soins : 1 - malus/100 si la zone est une AoE (rayon >= 1), sinon 1. */
  efficiency(target: number, caster: number, cell: number): number {
    if (this.radius < 1) return 1.0;
    return (100 - this.aoeMalus(target, caster, cell)) / 100;
  }
}

function parseIntStrict(p: string): number {
  const v = Number(p.trim());
  if (!Number.isInteger(v)) throw new Error(`rawZone : paramètre non entier « ${p} »`);
  return v;
}

function normalise(z: Required<Omit<SpellZoneInit, 'cellIds'>>): Required<Omit<SpellZoneInit, 'cellIds'>> {
  const s = z.shape;
  if (s === 'I') {
    z.minRadius = z.radius;
    z.radius = GLOBAL_RADIUS;
  } else if (s === 'O') {
    z.minRadius = z.radius;
  } else if (s === 'P') {
    z.radius = 0;
  } else if (s === 'R') {
    z.radius = Math.max(z.radius, 1);
    z.minRadius = Math.max(z.minRadius, 1);
  } else if (!KNOWN_SHAPES.includes(s) || s.length !== 1) {
    z.shape = 'P';
    z.radius = 0;
  }
  return z;
}

// ---------------------------------------------------------------------------------------------
// Implémentations (noms et logique calqués sur SpellZone.as / zones.py)
// ---------------------------------------------------------------------------------------------

function fillCircle(z: SpellZone, target: number): number[] {
  const x0 = CELL_X[target]!;
  const y0 = CELL_Y[target]!;
  const out: number[] = [];
  const r = z.radius;
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const d = Math.abs(i) + Math.abs(j);
      if (isValidCoord(x0 + i, y0 + j) && z.minRadius <= d && d <= r) out.push(xyToCell(x0 + i, y0 + j));
    }
  }
  return out;
}

function fillCheckerboard(z: SpellZone, target: number): number[] {
  const x0 = CELL_X[target]!;
  const y0 = CELL_Y[target]!;
  const even = z.radius % 2 === 0;
  const out: number[] = [];
  const r = z.radius;
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const d = Math.abs(i) + Math.abs(j);
      if (!(isValidCoord(x0 + i, y0 + j) && z.minRadius <= d && d <= r)) continue;
      const jm = j % 2;
      if ((even && (i + jm) % 2 === 0) || (!even && (i + 1 + jm) % 2 === 0)) out.push(xyToCell(x0 + i, y0 + j));
    }
  }
  return out;
}

function inCheckerboard(z: SpellZone, cell: number, target: number): boolean {
  // isCellInCheckerboardZone : parité ABSOLUE de la cellule testée, seul le rayon minimal est testé.
  const d = distance(target, cell);
  const even = z.radius % 2 === 0;
  const x = CELL_X[cell]!;
  const y = CELL_Y[cell]!;
  if (d < z.minRadius) return false;
  if (even && (x + (y % 2)) % 2 === 0) return true;
  if (!even) return (x + 1 + (y % 2)) % 2 === 0;
  return false;
}

function fillLine(z: SpellZone, fromCaster: boolean, target: number, caster: number): number[] {
  const start = fromCaster ? caster : target;
  let length = fromCaster ? z.radius + z.minRadius - 1 : z.radius;
  const d = dir8Exact(caster, target);
  if (fromCaster && z.stopAtTarget) {
    const dist = distance(caster, target);
    if (dist < length) length = dist;
  }
  let c = start;
  for (let k = 0; k < z.minRadius; k++) c = nextCell(c, d);
  const out: number[] = [];
  for (let k = z.minRadius; k < length + 1; k++) {
    if (isValidCell(c)) out.push(c);
    c = nextCell(c, d);
  }
  return out;
}

function inLineZone(z: SpellZone, fromCaster: boolean, cell: number, target: number, caster: number): boolean {
  if (cell === caster) return false;
  const dCt = dir8Exact(caster, target);
  let limit = z.radius;
  let dCell: number;
  let dist: number;
  if (fromCaster) {
    dCell = dir8Exact(caster, cell);
    dist = distance(caster, cell);
    if (z.stopAtTarget) limit = Math.min(limit, distance(caster, target));
  } else {
    dCell = dir8Exact(target, cell);
    dist = distance(target, cell);
  }
  if (isCardinalDir(dCell) && dist > 1) dist >>= 1;
  return (dCt === dCell || dist === 0) && dist >= z.minRadius && dist <= limit;
}

function fillCross(z: SpellZone, dirs: readonly number[], noCenter: boolean, target: number): number[] {
  const out: number[] = [];
  let first = z.minRadius;
  if (z.minRadius === 0) {
    first = 1;
    if (!noCenter) out.push(target);
  }
  const cur = dirs.map(() => target);
  for (let r = 1; r <= z.radius; r++) {
    for (let k = 0; k < dirs.length; k++) {
      cur[k] = nextCell(cur[k]!, dirs[k]!);
      if (r >= first && isValidCell(cur[k]!)) out.push(cur[k]!);
    }
  }
  return out;
}

function inCross(z: SpellZone, dirs: readonly number[], noCenter: boolean, cell: number, target: number): boolean {
  const d = dir8Exact(target, cell);
  let dist = distance(target, cell);
  if (isCardinalDir(d) && dist > 1) dist >>= 1;
  const need = z.minRadius + (noCenter && z.minRadius === 0 ? 1 : 0);
  return (dirs.includes(d) || dist === 0) && dist >= need && dist <= z.radius;
}

function fillPerpLine(z: SpellZone, target: number, caster: number): number[] {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 2);
  const d2 = mod8(d - 2 + 8);
  const out: number[] = [];
  let first = z.minRadius;
  if (z.minRadius === 0) {
    first = 1;
    if (isValidCell(target)) out.push(target);
  }
  let a = target;
  let b = target;
  for (let k = first; k < z.radius + 1; k++) {
    a = nextCell(a, d1);
    b = nextCell(b, d2);
    if (isValidCell(a)) out.push(a);
    if (isValidCell(b)) out.push(b);
  }
  return out;
}

function inPerpLine(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 2);
  const d2 = mod8(d - 2 + 8);
  const dc = dir8Exact(target, cell);
  let dist = distance(target, cell);
  if (isCardinalDir(dc) && dist > 1) dist >>= 1;
  return (dc === d1 || dc === d2 || dist === 0) && z.minRadius <= dist && dist <= z.radius;
}

function fillCone(z: SpellZone, target: number, caster: number): number[] {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 2);
  const d2 = mod8(d - 2 + 8);
  const out: number[] = [];
  let c = target;
  for (let i = 0; i < z.radius + 1; i++) {
    out.push(c);
    let a = c;
    let b = c;
    for (let k = 0; k < i; k++) {
      a = nextCell(a, d1);
      b = nextCell(b, d2);
      if (isValidCell(a)) out.push(a);
      if (isValidCell(b)) out.push(b);
    }
    c = nextCell(c, d);
  }
  return out;
}

function inCone(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const d = dir4(caster, target);
  const dx = CELL_X[cell]! - CELL_X[target]!;
  const dy = CELL_Y[cell]! - CELL_Y[target]!;
  if (d === 1) return dx >= 0 && dx <= z.radius && Math.abs(dy) <= dx;
  if (d === 3) return dy >= -z.radius && dy <= 0 && Math.abs(dx) <= -dy;
  if (d === 5) return dx >= -z.radius && dx <= 0 && Math.abs(dy) <= -dx;
  if (d === 7) return dy >= 0 && dy <= z.radius && Math.abs(dx) <= dy;
  return false;
}

function fillFork(z: SpellZone, target: number, caster: number): number[] {
  const tx = CELL_X[target]!;
  const ty = CELL_Y[target]!;
  const d = dir8Exact(caster, target);
  const sign = d === 5 || d === 3 ? -1 : 1;
  const alongX = d === 5 || d === 1;
  const depth = z.radius + 1;
  const out: number[] = [];
  if (isValidCoord(tx, ty)) out.push(xyToCell(tx, ty));
  for (let i = 1; i <= depth; i++) {
    for (const lateral of [-1, 0, 1]) {
      let x: number;
      let y: number;
      if (alongX) {
        x = tx + i * sign;
        y = ty + lateral * i;
      } else {
        x = tx + (lateral === 1 ? i : lateral === -1 ? -i : 0);
        y = ty + i * sign;
      }
      if (isValidCoord(x, y)) out.push(xyToCell(x, y));
    }
  }
  return out;
}

function inFork(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const tx = CELL_X[target]!;
  const ty = CELL_Y[target]!;
  const cx = CELL_X[cell]!;
  const cy = CELL_Y[cell]!;
  const d = dir4(caster, target);
  const depth = z.radius + 1;
  const sign = d === 5 || d === 3 ? -1 : 1;
  let a: number;
  let lat: number;
  if (d === 5 || d === 1) {
    a = (cx - tx) * sign;
    lat = cy - ty;
  } else {
    a = (cy - ty) * sign;
    lat = cx - tx;
  }
  if (a >= 0 && a <= depth) return lat === a || lat === 0 || lat === -a;
  return false;
}

function fillSquare(z: SpellZone, removeDiagonals: boolean, target: number): number[] {
  const x0 = CELL_X[target]!;
  const y0 = CELL_Y[target]!;
  const out: number[] = [];
  const r = z.radius;
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      if (isValidCoord(x0 + i, y0 + j) && (!removeDiagonals || Math.abs(i) !== Math.abs(j))) {
        out.push(xyToCell(x0 + i, y0 + j));
      }
    }
  }
  return out;
}

function inSquare(z: SpellZone, removeDiagonals: boolean, cell: number, target: number): boolean {
  const ax = Math.abs(CELL_X[cell]! - CELL_X[target]!);
  const ay = Math.abs(CELL_Y[cell]! - CELL_Y[target]!);
  return (
    (!removeDiagonals || ax !== ay) && ax <= z.radius && ay <= z.radius && ax >= z.minRadius && ay >= z.minRadius
  );
}

function fillRectangle(z: SpellZone, target: number, caster: number): number[] {
  const tx = CELL_X[target]!;
  const ty = CELL_Y[target]!;
  const d = dir8Exact(caster, target);
  const sign = d === 5 || d === 3 ? -1 : 1;
  const alongY = d === 7 || d === 3;
  const width = 1 + z.radius * 2;
  const depth = 1 + z.minRadius;
  const half = floorDiv(width, 2);
  const out: number[] = [];
  for (let k = 0; k < depth; k++) {
    for (let w = 0; w < width; w++) {
      let x: number;
      let y: number;
      if (alongY) {
        x = tx + w - half;
        y = ty + k * sign;
      } else {
        x = tx + k * sign;
        y = ty + w - half;
      }
      if (isValidCoord(x, y)) out.push(xyToCell(x, y));
    }
  }
  return out;
}

function inRectangle(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const tx = CELL_X[target]!;
  const ty = CELL_Y[target]!;
  const cx = CELL_X[cell]!;
  const cy = CELL_Y[cell]!;
  const d = dir8Exact(caster, target);
  const sign = d === 5 || d === 3 ? -1 : 1;
  const width = 1 + z.radius * 2;
  const depth = 1 + z.minRadius;
  let lat: number;
  let k: number;
  if (d === 7 || d === 3) {
    lat = Math.abs(cx - tx);
    k = (cy - ty) * sign;
  } else {
    lat = Math.abs(cy - ty);
    k = (cx - tx) * sign;
  }
  return lat <= floorDiv(width, 2) && k >= 0 && k < depth;
}

function fillHalfCircle(z: SpellZone, target: number, caster: number): number[] {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 3);
  const d2 = mod8(d - 3 + 8);
  const out: number[] = [];
  let first = z.minRadius;
  if (z.minRadius === 0) {
    first = 1;
    out.push(target);
  }
  let a = target;
  let b = target;
  for (let k = first; k < z.radius + 1; k++) {
    a = nextCell(a, d1);
    b = nextCell(b, d2);
    if (isValidCell(a)) out.push(a);
    if (isValidCell(b)) out.push(b);
  }
  return out;
}

function inHalfCircle(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d - 3 + 8);
  const d2 = mod8(d + 3);
  const dc = dir8Exact(target, cell);
  let dist = distance(target, cell);
  if (isCardinalDir(dc) && dist > 1) dist >>= 1;
  return (dc === d1 || dc === d2 || dist === 0) && z.minRadius <= dist && dist <= z.radius;
}

function fillBoomerang(z: SpellZone, target: number, caster: number): number[] {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 2);
  const d2 = mod8(d + 3);
  const d3 = mod8(d - 2 + 8);
  const d4 = mod8(d - 3 + 8);
  const out: number[] = [];
  let first = z.minRadius;
  if (z.minRadius === 0) {
    first = 1;
    out.push(target);
  }
  let a = target;
  let b = target;
  for (let k = first; k < z.radius; k++) {
    a = nextCell(a, d1);
    b = nextCell(b, d3);
    if (isValidCell(a)) out.push(a);
    if (isValidCell(b)) out.push(b);
  }
  if (z.radius !== 0) {
    a = nextCell(a, d2);
    b = nextCell(b, d4);
    if (isValidCell(a)) out.push(a);
    if (isValidCell(b)) out.push(b);
  }
  return out;
}

function inBoomerang(z: SpellZone, cell: number, target: number, caster: number): boolean {
  const d = dir8Exact(caster, target);
  const d1 = mod8(d + 2);
  const d2 = mod8(d - 2 + 8);
  let dc = dir8Exact(target, cell);
  let dist = distance(target, cell);
  if (isCardinalDir(dc) && dist > 1) dist >>= 1;
  if ((dc === d1 || dc === d2 || dist === 0) && z.minRadius <= dist && dist < z.radius) return true;
  // 2e test du client : la cellule testée est décalée d'un pas dans la direction lanceur -> cible
  const shifted = nextCell(cell, d);
  if (!isValidCell(shifted)) return false;
  dc = dir8Exact(target, shifted);
  dist = distance(target, shifted);
  if (isCardinalDir(dc) && dist > 1) dist >>= 1;
  return (dc === d1 || dc === d2) && dist !== 0 && dist >= z.minRadius && dist === z.radius;
}

function fillReversedTrueCircle(z: SpellZone, target: number): number[] {
  const tx = CELL_X[target]!;
  const ty = CELL_Y[target]!;
  const out: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) {
    const dx = CELL_X[c]! - tx;
    const dy = CELL_Y[c]! - ty;
    if (Math.sqrt(dx * dx + dy * dy) >= z.radius) out.push(c);
  }
  return out;
}

function inReversedTrueCircle(z: SpellZone, cell: number, target: number): boolean {
  const dx = CELL_X[cell]! - CELL_X[target]!;
  const dy = CELL_Y[cell]! - CELL_Y[target]!;
  return Math.sqrt(dx * dx + dy * dy) >= z.radius;
}

/** Filtre les -1 éventuels d'une liste getCells. */
export function validZoneCells(cells: readonly number[]): number[] {
  return cells.filter((c) => c !== INVALID_CELL && isValidCell(c));
}
