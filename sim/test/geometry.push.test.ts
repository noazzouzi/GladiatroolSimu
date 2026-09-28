import { describe, expect, it } from 'vitest';
import { MapGrid } from '../src/geometry/mapGrid.js';
import { CELL_COUNT, nextCell } from '../src/geometry/grid.js';
import {
  collisionDamage,
  collisionDamages,
  computeForcedMove,
  pullDirection,
  pushDirection,
  pushToEdgeDistance,
  sortTargetsForEffect,
  teleportDestination,
} from '../src/geometry/push.js';
import { SpellZone } from '../src/geometry/zones.js';
import { Mismatches, arenaGrid, eqArr, gridFromSpec, loadGeometryFixture, setOf } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('push.json');

describe('géométrie — poussées (validation croisée avec movement.py)', () => {
  it('directions de poussée et d’attirance', () => {
    const mm = new Mismatches();
    for (const [c, td, t, push, pull, pushNoSame] of fx.directions as number[][]) {
      const got = [pushDirection(c!, td!, t!), pullDirection(c!, td!, t!), pushDirection(c!, td!, t!, false)];
      mm.check(eqArr(got, [push!, pull!, pushNoSame!]), () => `direction(${c},${td},${t}) = ${got} attendu ${[push, pull, pushNoSame]}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('trajectoires : case finale, cases parcourues, reste, cause d’arrêt, chaîne et dommages de collision', () => {
    const mm = new Mismatches();
    let collisions = 0;
    let chains = 0;
    for (const m of fx.moves) {
      const grid = gridFromSpec(m.grid);
      const occ = setOf(m.occupied);
      const res = computeForcedMove(grid, occ, {
        kind: m.kind,
        casterCell: m.caster,
        targetedCell: m.targeted,
        targetCell: m.target,
        fromCell: m.from,
        force: m.force,
        stopAt: setOf(m.stopAt),
      });
      const label = `${m.kind}(lanceur ${m.caster}, ciblée ${m.targeted}, cible ${m.target} depuis ${m.from}, force ${m.force})`;
      if (m.result === null) {
        mm.check(res.direction === -1 && !res.moved && res.path.length === 0, () => `${label} : aucun déplacement attendu`);
        continue;
      }
      const e = m.result;
      mm.check(res.direction === e.dir, () => `${label} direction ${res.direction} attendu ${e.dir}`);
      mm.check(res.cell === e.cell, () => `${label} case ${res.cell} attendu ${e.cell}`);
      mm.check(eqArr(res.path, e.path), () => `${label} chemin [${res.path}] attendu [${e.path}]`);
      mm.check(res.remainingSteps === e.remaining, () => `${label} reste ${res.remainingSteps} attendu ${e.remaining}`);
      mm.check(res.stopReason === e.stop, () => `${label} arrêt ${res.stopReason} attendu ${e.stop}`);
      mm.check(res.moved === e.moved, () => `${label} moved`);
      if (m.kind === 'push') {
        mm.check(eqArr(res.collisionChain, e.chain), () => `${label} chaîne [${res.collisionChain}] attendu [${e.chain}]`);
        const resOf = new Map<number, number>();
        m.occupied.forEach((c: number, i: number) => resOf.set(c, m.pushRes[i]));
        const dmg = collisionDamages(res, m.level, m.pushDamage, [m.targetPushRes, ...res.collisionChain.map((c) => resOf.get(c) ?? 0)], m.pacifist);
        mm.check(eqArr(dmg, e.damages), () => `${label} dommages [${dmg}] attendu [${e.damages}]`);
        if (res.collision) collisions++;
        if (res.collisionChain.length > 0) {
          chains++;
          mm.check(res.hitCell === res.collisionChain[0], () => `${label} hitCell`);
        }
      }
      mm.check(res.endsInSpikes === (res.path.length > 0 && grid.isSpike(res.cell)), () => `${label} endsInSpikes`);
    }
    expect(mm.summary()).toBe('aucun écart');
    expect(collisions).toBeGreaterThan(100);
    expect(chains).toBeGreaterThan(20);
  });

  it('distance libre jusqu’au bord (carte réelle, 241 cases x 8 directions)', () => {
    const grid = arenaGrid();
    const free = grid.freePredicate(() => false);
    const mm = new Mismatches();
    fx.edgeCells.forEach((c: number, i: number) => {
      for (let d = 0; d < 8; d++) {
        const v = pushToEdgeDistance(free, c, d);
        mm.check(v === fx.edge[i][d], () => `pushToEdgeDistance(${c},${d}) = ${v} attendu ${fx.edge[i][d]}`);
      }
    });
    expect(mm.summary()).toBe('aucun écart');
  });

  it('ordre de traitement des cibles (comparePositions)', () => {
    const mm = new Mismatches();
    for (const [td, isPush, cells, exp] of fx.sorts as [number, boolean, number[], number[]][]) {
      const got = sortTargetsForEffect(td, isPush, cells);
      mm.check(eqArr(got, exp), () => `sort(${td}, ${isPush}, [${cells}]) = [${got}] attendu [${exp}]`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('formule des dommages de poussée', () => {
    const mm = new Mismatches();
    for (const [rem, lvl, dp, rp, idx, pac, exp] of fx.collisionDamage as [number, number, number, number, number, boolean, number][]) {
      const v = collisionDamage(rem, lvl, dp, rp, idx, pac);
      mm.check(v === exp, () => `collisionDamage(${rem},${lvl},${dp},${rp},${idx},${pac}) = ${v} attendu ${exp}`);
    }
    expect(mm.summary()).toBe('aucun écart');
    // références movement.py / N70 §5.3
    expect(collisionDamage(3, 200, 0, 0)).toBe(99);
    expect(collisionDamage(1, 200, 1000, 0)).toBe(283);
    expect(collisionDamage(2, 200, 1000, 0)).toBe(566);
    expect(collisionDamage(2, 200, 1000, 0, 1)).toBe(283);
  });

  it('avance / recul du lanceur et téléportation « première case libre »', () => {
    const grid = MapGrid.open();
    const target = nextCell(nextCell(nextCell(300, 1), 1), 1);
    const adv = computeForcedMove(grid, (c) => c === 300 || c === target, { kind: 'advance', casterCell: 300, targetedCell: target, targetCell: target, force: 5 });
    expect(adv.direction).toBe(1);
    expect(adv.cell).toBe(nextCell(nextCell(300, 1), 1)); // s'arrête contre la cible
    expect(adv.collision).toBe(true);
    const ret = computeForcedMove(grid, (c) => c === 300 || c === target, { kind: 'retreat', casterCell: 300, targetedCell: target, targetCell: target, force: 2 });
    expect(ret.direction).toBe(5);
    expect(ret.path).toEqual([nextCell(300, 5), nextCell(nextCell(300, 5), 5)]);
    const x1 = SpellZone.fromRaw('X1');
    const free = grid.freePredicate(setOf([300, 286]));
    const cells = x1.cells(300, 286);
    expect(teleportDestination(x1, 300, 286, free)).toBe(cells.find((c) => free(c)));
    expect(teleportDestination(SpellZone.fromRaw('P'), 300, 286, free)).toBe(-1);
    expect(teleportDestination(SpellZone.fromRaw('P'), 301, 286, free)).toBe(301);
    expect(CELL_COUNT).toBe(560);
  });
});
