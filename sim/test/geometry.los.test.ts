import { describe, expect, it } from 'vitest';
import { CELL_COUNT, nextCell } from '../src/geometry/grid.js';
import { cellsBetween, computeCellsBetween, gridLineOfSight, hasLineOfSight, lineBetween, losCells } from '../src/geometry/los.js';
import { Mismatches, eqArr, gridFromSpec, loadGeometryFixture, setOf } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('los.json');

describe('géométrie — ligne de vue (validation croisée avec geometry.py)', () => {
  it('getCellsIdBetween exact (tracé de rayon, passage par les coins)', () => {
    const mm = new Mismatches();
    for (const [a, b, exp] of fx.lines as [number, number, number[]][]) {
      mm.check(eqArr(computeCellsBetween(a, b), exp), () => `cellsBetween(${a},${b}) = ${computeCellsBetween(a, b)} attendu ${exp}`);
      mm.check(eqArr(lineBetween(a, b), exp), () => `lineBetween(${a},${b}) (cache)`);
      mm.check(eqArr(cellsBetween(a, b), exp), () => `cellsBetween(${a},${b}) (copie)`);
    }
    expect(mm.summary()).toBe('aucun écart');
    expect(cellsBetween(300, 300)).toEqual([]);
    expect(cellsBetween(-1, 300)).toEqual([]);
  });

  it('hasLineOfSight : toutes les cibles pour des configurations aléatoires (carte réelle et carte ouverte)', () => {
    const mm = new Mismatches();
    let checked = 0;
    for (const cfg of fx.configs) {
      const grid = gridFromSpec(cfg.grid);
      const occ = setOf(cfg.occupied);
      for (let c = 0; c < CELL_COUNT; c++) {
        const exp = cfg.los[c] === '1';
        const got = hasLineOfSight(cfg.origin, c, occ, grid.blocksLos);
        checked++;
        if (got !== exp) mm.add(`LdV ${cfg.origin}->${c} = ${got} attendu ${exp}`);
        if (gridLineOfSight(grid, cfg.origin, c, occ) !== got) mm.add(`gridLineOfSight ${cfg.origin}->${c}`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
    expect(checked).toBeGreaterThan(100_000);
  });

  it('losCells : algorithme liste du client (LosDetector, tri + cache), même ordre de sortie', () => {
    const mm = new Mismatches();
    for (const cfg of fx.configs) {
      const grid = gridFromSpec(cfg.grid);
      const got = losCells(cfg.origin, cfg.candidates, setOf(cfg.occupied), grid.blocksLos);
      mm.check(eqArr(got, cfg.losCells), () => `losCells(${cfg.origin}) = ${got.length} cases, attendu ${cfg.losCells.length}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('un combattant ne bloque que les cases intermédiaires', () => {
    const mid = nextCell(300, 1);
    const far = nextCell(mid, 1);
    expect(hasLineOfSight(300, far, (c) => c === mid)).toBe(false);
    expect(hasLineOfSight(300, far, (c) => c === far)).toBe(true);
    expect(hasLineOfSight(300, far, (c) => c === 300)).toBe(true);
    // la carte bloque aussi sur la cible
    expect(hasLineOfSight(300, far, undefined, (c) => c === far)).toBe(false);
    expect(hasLineOfSight(300, 300, () => true, () => true)).toBe(true);
  });
});
