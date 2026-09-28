import { describe, expect, it } from 'vitest';
import { CELL_COUNT } from '../src/geometry/grid.js';
import {
  canCastOn,
  castCells,
  castSpecFromCastData,
  effectiveMaxRange,
  isInCastRange,
  rangeCells,
  type CastRangeSpec,
} from '../src/geometry/castCells.js';
import { MapGrid } from '../src/geometry/mapGrid.js';
import { SpellZone } from '../src/geometry/zones.js';
import { Mismatches, arenaGrid, eqArr, gridFromSpec, loadGeometryFixture, setOf } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('castCells.json');

describe('géométrie — cases de lancer (validation croisée avec geometry.range_cells + filtres)', () => {
  it('rangeCells : ordre exact (losange, croix, croix diagonale, étoile ; portées limites)', () => {
    const mm = new Mismatches();
    for (const [o, mn, mx, line, diag, exp] of fx.rangeCells as [number, number, number, boolean, boolean, number[]][]) {
      const got = rangeCells(o, mn, mx, line, diag);
      mm.check(eqArr(got, exp), () => `rangeCells(${o},${mn},${mx},${line},${diag}) = [${got}] attendu [${exp}]`);
      const set = new Set(exp);
      for (let c = 0; c < CELL_COUNT; c++) {
        if (isInCastRange(o, c, mn, mx, line, diag) !== set.has(c)) mm.add(`isInCastRange(${o},${c},${mn},${mx},${line},${diag})`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('castCells : portée + bonus, LdV, case libre / occupée, case marchable', () => {
    const mm = new Mismatches();
    for (const cfg of fx.configs) {
      const grid = gridFromSpec(cfg.grid);
      const spec = cfg.spec as CastRangeSpec;
      const opts = { rangeBonus: cfg.rangeBonus, isOccupied: setOf(cfg.occupied), requireWalkable: cfg.requireWalkable };
      mm.check(effectiveMaxRange(spec, cfg.rangeBonus) === cfg.maxRange, () => `effectiveMaxRange ${JSON.stringify(spec)}`);
      const got = castCells(grid, cfg.origin, spec, opts);
      mm.check(eqArr(got, cfg.expected), () =>
        `castCells(${cfg.origin}, ${JSON.stringify(spec)}) = [${got}] attendu [${cfg.expected}]`);
      const set = new Set<number>(cfg.expected);
      for (let c = -1; c <= CELL_COUNT; c++) {
        if (canCastOn(grid, cfg.origin, c, spec, opts) !== set.has(c)) mm.add(`canCastOn(${cfg.origin},${c}) ${JSON.stringify(spec)}`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('exemple : Videur (PO 1-5 en ligne, LdV) depuis 314 au tour 1', () => {
    const grid = arenaGrid();
    const occupied = setOf([286, 287, 314, 315, 242, 358]);
    const spec: CastRangeSpec = { minRange: 1, range: 5, castInLine: true, castTestLos: true };
    const cells = castCells(grid, 314, spec, { isOccupied: occupied });
    expect(cells).toContain(256);
    expect(cells).toContain(372);
    // 300 est libre et à 1 case ; 287/286 hors ligne ou occupées ne bloquent que derrière elles
    expect(cells).toContain(300);
    expect(cells).not.toContain(314);
    expect(cells.every((c) => grid.isWalkable(c))).toBe(true);
  });
});

describe('géométrie — adaptateurs vers le format sim/data', () => {
  it('castSpecFromCastData', () => {
    expect(castSpecFromCastData({ range: [1, 5], rangeModifiable: false, inLine: true, inDiagonal: false, los: true,
      needFreeCell: false, needTakenCell: false, needVisibleEntity: false })).toEqual({
      minRange: 1, range: 5, rangeCanBeBoosted: false, castInLine: true, castInDiagonal: false, castTestLos: true,
      needFreeCell: false, needTakenCell: false, needVisibleEntity: false,
    });
  });

  it('MapGrid.fromMapData et SpellZone.fromZoneData', () => {
    const arena = arenaGrid();
    const cells = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      cells.push({ id: c, x: 0, y: 0, walkable: arena.isWalkable(c), los: !arena.blocksLos(c), spikes: arena.isSpike(c), edgeDepth: null, neighbours: [] });
    }
    const g = MapGrid.fromMapData({ mapId: 139988488, cells });
    expect(g.walkableCells).toEqual(arena.walkableCells);
    expect(g.spikeCells).toEqual(arena.spikeCells);
    const z = SpellZone.fromZoneData({ shape: 'T', radius: 2, minRadius: 0, degression: 10, maxTicks: 4 });
    expect(z.cells(300, 286)).toEqual(SpellZone.fromRaw('T2').cells(300, 286));
    expect(z.raw()).toBe('T2,0,10,4');
  });
});
