import { describe, expect, it } from 'vitest';
import * as G from '../src/geometry/grid.js';
import { Mismatches, eqArr, loadGeometryFixture } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('grid.json');
const N = G.CELL_COUNT;

describe('géométrie — grille (validation croisée avec geometry.py / mapgeom.py)', () => {
  it('conversions cellId <-> MapPoint sur les 560 cases', () => {
    const mm = new Mismatches();
    for (let c = 0; c < N; c++) {
      const [x, y] = G.cellToXY(c);
      mm.check(x === fx.x[c] && y === fx.y[c], () => `xy(${c}) = ${x},${y} attendu ${fx.x[c]},${fx.y[c]}`);
      mm.check(G.xyToCell(x, y) === c, () => `xyToCell(${x},${y}) != ${c}`);
      mm.check(G.cellX(c) === x && G.cellY(c) === y, () => `cellX/cellY(${c})`);
      const [row, col] = G.cellToRowCol(c);
      mm.check(G.rowColToCell(row, col) === c && row === Math.floor(c / 14) && col === c % 14, () => `rowcol(${c})`);
      const [px, py] = G.cellToPixel(c);
      mm.check(px === fx.pixel[c][0] && py === fx.pixel[c][1], () => `pixel(${c})`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('isValidCoord et xyToCell exacts sur une boîte élargie', () => {
    const { x0, x1, y0, y1 } = fx.box;
    const mm = new Mismatches();
    let k = 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++, k++) {
        const valid = fx.validCoord[k] === '1';
        mm.check(G.isValidCoord(x, y) === valid, () => `isValidCoord(${x},${y})`);
        mm.check(G.xyToCell(x, y) === fx.xyToCell[k], () => `xyToCell(${x},${y}) = ${G.xyToCell(x, y)}`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('cellule suivante (8 directions), voisins 4 et 8, cas invalides', () => {
    const mm = new Mismatches();
    for (let c = 0; c < N; c++) {
      for (let d = 0; d < 8; d++) {
        mm.check(G.nextCell(c, d) === fx.next[c * 8 + d], () => `nextCell(${c},${d})`);
      }
      mm.check(eqArr(G.neighbours4(c), fx.neighbours4[c]), () => `neighbours4(${c})`);
      mm.check(eqArr(G.neighbours(c), fx.neighbours4[c]), () => `neighbours(${c})`);
      mm.check(eqArr(G.neighbours8(c), fx.neighbours8[c]), () => `neighbours8(${c})`);
      mm.check(eqArr(G.neighbours(c, G.ALL_DIRECTIONS), fx.neighbours8[c]), () => `neighbours(${c}, 8)`);
    }
    expect(mm.summary()).toBe('aucun écart');
    expect([G.nextCell(-1, 0), G.nextCell(560, 1), G.nextCell(300, -1), G.nextCell(300, 8)]).toEqual(fx.nextInvalid);
  });

  it('orientations dir4 / dir4Exact / dir4Diag / dir4DiagExact / dir8Exact / dir8 (toutes les cibles)', () => {
    const fns: Record<string, (a: number, b: number) => number> = {
      dir4: G.dir4,
      dir4Exact: G.dir4Exact,
      dir4Diag: G.dir4Diag,
      dir4DiagExact: G.dir4DiagExact,
      dir8Exact: G.dir8Exact,
      dir8: G.dir8,
    };
    const mm = new Mismatches();
    fx.dirOrigins.forEach((o: number, i: number) => {
      for (const [name, fn] of Object.entries(fns)) {
        const exp: string = fx.dirs[name][i];
        for (let c = 0; c < N; c++) {
          const e = exp[c] === '-' ? -1 : Number(exp[c]);
          const v = fn(o, c);
          if (v !== e) mm.add(`${name}(${o},${c}) = ${v} attendu ${e}`);
        }
      }
    });
    expect(mm.summary()).toBe('aucun écart');
  });

  it('orientations par coordonnées (y compris coordonnées hors carte)', () => {
    const mm = new Mismatches();
    for (const [x1, y1, x2, y2, ...exp] of fx.byCoord as number[][]) {
      const got = [
        G.dir4ByCoord(x1!, y1!, x2!, y2!),
        G.dir4ExactByCoord(x1!, y1!, x2!, y2!),
        G.dir4DiagByCoord(x1!, y1!, x2!, y2!),
        G.dir4DiagExactByCoord(x1!, y1!, x2!, y2!),
        G.dir8ExactByCoord(x1!, y1!, x2!, y2!),
        G.dir8ByCoord(x1!, y1!, x2!, y2!),
      ];
      mm.check(eqArr(got, exp), () => `byCoord(${x1},${y1},${x2},${y2}) = ${got} attendu ${exp}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('distances, adjacence, alignements, symétrique', () => {
    const mm = new Mismatches();
    fx.relOrigins.forEach((o: number, i: number) => {
      for (let c = 0; c < N; c++) {
        mm.check(G.distance(o, c) === fx.rel.distance[i][c], () => `distance(${o},${c})`);
        mm.check(G.areAdjacent(o, c) === (fx.rel.adjacent[i][c] === '1'), () => `adjacent(${o},${c})`);
        mm.check(G.inLine(o, c) === (fx.rel.inLine[i][c] === '1'), () => `inLine(${o},${c})`);
        mm.check(G.inDiagonal(o, c) === (fx.rel.inDiag[i][c] === '1'), () => `inDiag(${o},${c})`);
        const dx = Math.abs(G.cellX(o) - G.cellX(c));
        const dy = Math.abs(G.cellY(o) - G.cellY(c));
        mm.check(G.chebyshevDistance(o, c) === Math.max(dx, dy), () => `chebyshev(${o},${c})`);
        mm.check(G.isAligned(o, c) === (G.inLine(o, c) || G.inDiagonal(o, c)), () => `isAligned(${o},${c})`);
      }
    });
    for (const [a, b, s] of fx.symmetric as number[][]) {
      mm.check(G.symmetricCell(a!, b!) === s, () => `symmetric(${a},${b})`);
    }
    expect(mm.summary()).toBe('aucun écart');
    expect(G.distance(-1, 3)).toBe(-1);
    expect(G.distance(3, 560)).toBe(-1);
  });

  it('constantes de direction conformes au SPEC (rules.directions)', () => {
    expect(G.DIRECTION_VECTORS).toEqual([[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]);
    expect(G.AXIS_DIRECTIONS).toEqual([1, 3, 5, 7]);
    expect(G.DIAGONAL_DIRECTIONS).toEqual([0, 2, 4, 6]);
    for (let d = 0; d < 8; d++) {
      expect(G.oppositeDirection(G.oppositeDirection(d))).toBe(d);
      expect(G.distance(300, G.nextCell(300, d))).toBe(G.isAxisDirection(d) ? 1 : 2);
      expect(G.nextCell(G.nextCell(300, d), G.oppositeDirection(d))).toBe(300);
    }
    expect(G.cellsInDirection(300, 7, 3)).toEqual([287, 273, 260]);
    expect(G.cellInDirection(300, 3, 2)).toBe(327);
    const full = G.cellsInDirection(300, 1);
    expect(G.nextCell(full[full.length - 1]!, 1)).toBe(G.INVALID_CELL);
    expect(() => G.cellToXY(560)).toThrow(RangeError);
  });
});
