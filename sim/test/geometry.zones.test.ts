import { describe, expect, it } from 'vitest';
import { isValidCell, nextCell, inLine } from '../src/geometry/grid.js';
import { SpellZone, validZoneCells, type SpellZoneInit } from '../src/geometry/zones.js';
import { Mismatches, decodeCells, eqArr, loadGeometryFixture } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('zones.json');

interface ZoneEval {
  t: number;
  c: number;
  cells: number[];
  in: string | number[];
  malus: number[];
  eff: number[];
}

function fieldsOf(z: SpellZone): SpellZoneInit {
  return {
    shape: z.shape,
    radius: z.radius,
    minRadius: z.minRadius,
    degression: z.degression,
    maxDegressionTicks: z.maxDegressionTicks,
    stopAtTarget: z.stopAtTarget,
    cellIds: [...z.cellIds],
  };
}

function checkEval(mm: Mismatches, label: string, z: SpellZone, e: ZoneEval): void {
  const cells = z.cells(e.t, e.c);
  mm.check(eqArr(cells, e.cells), () => `${label} cells(${e.t},${e.c}) = [${cells}] attendu [${e.cells}]`);
  const inz = z.containedCells(e.t, e.c);
  const expIn = decodeCells(e.in);
  mm.check(eqArr(inz, expIn), () => `${label} contains(·,${e.t},${e.c}) = [${inz}] attendu [${expIn}]`);
  const union = [...new Set([...e.cells.filter((c) => isValidCell(c)), ...expIn])].sort((a, b) => a - b);
  const malus = union.map((c) => z.aoeMalus(e.t, e.c, c));
  mm.check(eqArr(malus, e.malus), () => `${label} aoeMalus(${e.t},${e.c}) = [${malus}] attendu [${e.malus}]`);
  const eff = union.slice(0, 3).map((c) => z.efficiency(e.t, e.c, c));
  mm.check(eqArr(eff, e.eff), () => `${label} efficiency(${e.t},${e.c}) = [${eff}] attendu [${e.eff}]`);
}

describe('géométrie — zones (validation croisée avec zones.py)', () => {
  it('toutes les formes, rayons 0..5, orientations variées : getCells (ordre), isCellInZone, dégressivité', () => {
    const mm = new Mismatches();
    const shapes = new Set<string>();
    for (const e of fx.cases as Array<ZoneEval & { raw?: string; init?: SpellZoneInit }>) {
      const z = e.raw !== undefined ? SpellZone.fromRaw(e.raw) : new SpellZone(e.init);
      shapes.add(z.shape);
      checkEval(mm, e.raw !== undefined ? `raw « ${e.raw} »` : `init ${JSON.stringify(e.init)}`, z, e);
    }
    expect(mm.summary()).toBe('aucun écart');
    // les 26 formes du client + P de repli
    expect([...shapes].sort().join('')).toBe(' #*+-/ABCDFGILOPQRTUVWXZal');
    expect(fx.cases.length).toBeGreaterThan(1000);
  });

  it('zoneDescr réels (DofusDB) : normalisation et évaluation', () => {
    const mm = new Mismatches();
    for (const d of fx.descr) {
      const z = SpellZone.fromZoneDescr(d.descr);
      mm.check(JSON.stringify(fieldsOf(z)) === JSON.stringify(d.fields), () =>
        `fromZoneDescr(${JSON.stringify(d.descr)}) = ${JSON.stringify(fieldsOf(z))} attendu ${JSON.stringify(d.fields)}`);
      for (const e of d.evals) checkEval(mm, `descr ${JSON.stringify(d.descr).slice(0, 60)}`, z, e);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('analyse des rawZone (fromRaw) et raw()', () => {
    const mm = new Mismatches();
    for (const p of fx.parsed) {
      const z = SpellZone.fromRaw(p.raw);
      mm.check(JSON.stringify(fieldsOf(z)) === JSON.stringify(p.fields), () =>
        `fromRaw(« ${p.raw} ») = ${JSON.stringify(fieldsOf(z))} attendu ${JSON.stringify(p.fields)}`);
      mm.check(z.raw() === p.rawOut, () => `raw(« ${p.raw} ») = ${z.raw()} attendu ${p.rawOut}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('cas de référence (verify_mechanics.py)', () => {
    const caster = nextCell(nextCell(300, 5), 5);
    const sizes = ['C2', 'X1', 'T2', 'G1', 'W1', '*1', 'R1,1'].map((r) => SpellZone.fromRaw(r).cells(300, caster).length);
    expect(sizes).toEqual([13, 5, 5, 9, 4, 9, 6]);
    expect(SpellZone.fromRaw('X1').cells(300, 286).sort((a, b) => a - b)).toEqual([286, 287, 300, 314, 315]);
    const c2 = SpellZone.fromRaw('C2');
    const one = nextCell(300, 1);
    const two = nextCell(one, 1);
    expect([300, one, two].map((c) => c2.aoeMalus(300, 286, c))).toEqual([0, 10, 20]);
    const noDeg = SpellZone.fromZoneDescr({ shape: 67, param1: 2, param2: 0, damageDecreaseStepPercent: 0, maxDamageDecreaseApplyCount: 0 });
    expect(noDeg.aoeMalus(300, 286, one)).toBe(0);
    expect(SpellZone.fromRaw('C63').aoeMalus(300, 286, 0)).toBe(0);
    const x63 = SpellZone.fromRaw('X63,1').cells(300, 300);
    expect(x63.includes(300)).toBe(false);
    expect(x63.every((c) => inLine(300, c))).toBe(true);
    // fourche F2 alignée : fill == isIn (profondeur radius + 1 = 3)
    const f2 = SpellZone.fromRaw('F2');
    expect(f2.cells(300, caster).sort((a, b) => a - b)).toEqual(f2.containedCells(300, caster));
    // Impact C2 : 80 % à 2 cases
    expect(c2.efficiency(300, 286, two)).toBe(0.8);
    expect(validZoneCells([1, -1, 3])).toEqual([1, 3]);
  });
});
