/**
 * Cas de référence sur la carte de combat réelle (research/data/map_139988488.json) :
 * ETUDE §3 (carte, pics, distances), §9.9 (poussée), SPEC §13 (T5–T8) et l'exemple chiffré Videur (T6)
 * de research/data/archetype_acrobate.json.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AXIS_DIRECTIONS,
  CELL_COUNT,
  cellToXY,
  cellsInDirection,
  distance,
  neighbours4,
  nextCell,
} from '../src/geometry/grid.js';
import { hasLineOfSight } from '../src/geometry/los.js';
import { castCells } from '../src/geometry/castCells.js';
import { SpellZone } from '../src/geometry/zones.js';
import {
  collisionDamage,
  collisionDamages,
  computeForcedMove,
  pushDirection,
  pushToEdgeDistance,
  sortTargetsForEffect,
} from '../src/geometry/push.js';
import { MapGrid } from '../src/geometry/mapGrid.js';
import { arenaGrid, loadArenaJson } from './helpers/geometryFixtures.js';

const grid = arenaGrid();
const START_CELLS = [286, 287, 314, 315];

/** Plateau minimal pour enchaîner des déplacements (case -> identifiant). */
class Board {
  readonly at = new Map<number, string>();
  constructor(entries: Array<[string, number]>) {
    for (const [id, c] of entries) this.at.set(c, id);
  }
  occupied = (c: number): boolean => this.at.has(c);
  cellOf(id: string): number {
    for (const [c, f] of this.at) if (f === id) return c;
    return -1;
  }
  move(id: string, to: number): void {
    const from = this.cellOf(id);
    this.at.delete(from);
    this.at.set(to, id);
  }
}

describe('géométrie — cas de référence sur la carte du Gladiatrool', () => {
  it('T5 : repère et voisins de 300 (centre de l’arène)', () => {
    expect(cellToXY(300)).toEqual([17, -4]);
    expect([...neighbours4(300)].sort((a, b) => a - b)).toEqual([286, 287, 314, 315]);
    expect(cellToXY(0)).toEqual([0, 0]);
    expect(cellToXY(14)).toEqual([1, 0]);
    expect(cellToXY(559)).toEqual([33, -6]);
  });

  it('carte : 241 cases jouables, 96 pics (liste de l’ÉTUDE §3.4), LdV bloquée seulement autour de 152', () => {
    expect(grid.mapId).toBe(139988488);
    expect(grid.walkableCells.length).toBe(241);
    expect(grid.spikeCells).toEqual([
      131, 132, 133, 144, 145, 146, 147, 148, 149, 157, 158, 159, 160, 161, 162, 163, 171, 172, 177, 178, 184, 185, 191, 192,
      198, 199, 206, 207, 211, 212, 220, 221, 225, 226, 235, 236, 239, 249, 253, 264, 266, 267, 277, 278, 281, 292, 294, 295,
      305, 306, 309, 320, 322, 323, 333, 334, 337, 348, 351, 361, 365, 366, 375, 376, 379, 380, 388, 389, 394, 395, 402, 403,
      408, 409, 415, 416, 423, 424, 429, 430, 437, 438, 439, 440, 441, 442, 443, 452, 453, 454, 455, 456, 457, 467, 468, 469,
    ]);
    const blocking: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) if (grid.blocksLos(c)) blocking.push(c);
    expect(blocking).toEqual([124, 137, 138, 151, 153, 165, 166, 180]);
    // aucune case jouable ne bloque la vue : seules les entités bloquent dans l'arène
    expect(grid.walkableCells.every((c) => !grid.blocksLos(c))).toBe(true);
    expect(grid.isWalkable(152)).toBe(false); // nonWalkableDuringFight
    expect([250, 293, 321, 362].some((c) => grid.isWalkable(c) || grid.isSpike(c))).toBe(false);
  });

  it('profondeur de bord : identique au champ edgeDepth des données et à la répartition de l’ÉTUDE', () => {
    const json = loadArenaJson();
    for (const c of json.cells as unknown as Array<{ id: number; edgeDepth: number | null; fightWalkable: boolean }>) {
      if (c.fightWalkable) expect(grid.edgeDepth(c.id)).toBe(c.edgeDepth);
    }
    const byDepth = new Map<number, number>();
    const spikesByDepth = new Map<number, number>();
    for (const c of grid.walkableCells) {
      const d = grid.edgeDepth(c);
      byDepth.set(d, (byDepth.get(d) ?? 0) + 1);
      if (grid.isSpike(c)) spikesByDepth.set(d, (spikesByDepth.get(d) ?? 0) + 1);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => byDepth.get(d) ?? 0)).toEqual([48, 44, 40, 32, 28, 24, 16, 8, 1]);
    expect([1, 2, 3, 4].map((d) => spikesByDepth.get(d) ?? 0)).toEqual([48, 44, 4, 0]);
    expect(grid.edgeDepth(300)).toBe(9);
  });

  it('ÉTUDE §3.8 : k = cases à parcourir en ligne jusqu’au premier pic (145 cases sûres)', () => {
    const counts = new Map<number, number>();
    for (const c of grid.walkableCells) {
      if (grid.isSpike(c)) continue;
      let k = Infinity;
      for (const d of AXIS_DIRECTIONS) {
        const line = cellsInDirection(c, d);
        const i = line.findIndex((x) => grid.isSpike(x));
        if (i >= 0) k = Math.min(k, i + 1);
      }
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect([1, 2, 3, 4, 5, 6, 7].map((k) => counts.get(k) ?? 0)).toEqual([36, 32, 28, 24, 16, 8, 1]);
  });

  it('T7 : un Trooll poussé depuis 300 jusqu’au bord s’arrête dans les pics, à profondeur 1', () => {
    const free = grid.freePredicate(() => false);
    for (let d = 0; d < 8; d++) {
      // lanceur sur la case opposée, adjacente (axe) ou diagonale
      const caster = nextCell(300, (d + 4) % 8);
      const res = computeForcedMove(grid, (c) => c === caster || c === 300, {
        kind: 'push', casterCell: caster, targetedCell: 300, targetCell: 300, force: 63,
      });
      expect(res.direction).toBe(d);
      expect(grid.isSpike(res.cell)).toBe(true);
      expect(grid.edgeDepth(res.cell)).toBe(1);
      expect(res.path.length).toBe(d % 2 === 1 ? 8 : 6);
      expect(res.collision).toBe(true);
      // le 7e pas axial (5e pas diagonal) entre dans les pics
      const firstSpike = res.path.findIndex((c) => grid.isSpike(c));
      expect(firstSpike + 1).toBe(d % 2 === 1 ? 7 : 5);
      expect(pushToEdgeDistance(free, 300, d)).toBe(d % 2 === 1 ? 8 : 6);
    }
    const toSe = computeForcedMove(grid, (c) => c === 286 || c === 300, {
      kind: 'push', casterCell: 286, targetedCell: 300, targetCell: 300, force: 63,
    });
    expect(toSe.cell).toBe(416);
  });

  it('T8 et verify_mechanics : collision au bord, poussée diagonale, chaîne 566 / 283 / 141', () => {
    // Frappe Repoussoir (2 cases) sur une cible adjacente
    const target = nextCell(300, 1);
    const r2 = computeForcedMove(grid, (c) => c === 300 || c === target, {
      kind: 'push', casterCell: 300, targetedCell: target, targetCell: target, force: 2,
    });
    expect(r2.path.length).toBe(2);
    expect(distance(300, r2.cell)).toBe(3);
    // contre le bord : 3 cases restantes x 283 = 849, cible dans les pics
    const free = grid.freePredicate((c) => c === 300);
    const toEdge = pushToEdgeDistance(free, target, 1);
    const r3 = computeForcedMove(grid, (c) => c === 300 || c === target, {
      kind: 'push', casterCell: 300, targetedCell: target, targetCell: target, force: toEdge + 3,
    });
    expect(r3.remainingForDamage).toBe(3);
    expect(collisionDamages(r3, 200, 1000, [0])).toEqual([849]);
    expect(grid.isSpike(r3.cell)).toBe(true);
    // T8 : 1 case restante -> 283 ; entité percutée 141
    expect(collisionDamage(1, 200, 1000, 0, 0)).toBe(283);
    expect(collisionDamage(1, 200, 1000, 0, 1)).toBe(141);
    // diagonale : ceil(3/2) = 2 pas
    const open = MapGrid.open();
    const t2 = nextCell(300, 0);
    const rd = computeForcedMove(open, (c) => c === 300 || c === t2, {
      kind: 'push', casterCell: 300, targetedCell: t2, targetCell: t2, force: 3,
    });
    expect(rd.direction).toBe(0);
    expect(rd.path.length).toBe(2);
    // chaîne T <- U <- V
    const t = nextCell(300, 1);
    const u = nextCell(t, 1);
    const v = nextCell(u, 1);
    const occ = (c: number) => c === 300 || c === t || c === u || c === v;
    const rc = computeForcedMove(open, occ, { kind: 'push', casterCell: 300, targetedCell: t, targetCell: t, force: 2 });
    expect(rc.collisionChain).toEqual([u, v]);
    expect(rc.hitCell).toBe(u);
    expect(collisionDamages(rc, 200, 1000, [0, 0, 0])).toEqual([566, 283, 141]);
    // directions : cible hors de la case ciblée -> depuis la case ciblée ; tout sur la même case -> pas de poussée
    expect(pushDirection(286, 300, nextCell(300, 7))).toBe(7);
    expect(pushDirection(300, 300, 300)).toBe(-1);
    // ordre : la plus éloignée d'abord pour une poussée
    const cells = [nextCell(300, 1), nextCell(nextCell(300, 1), 1)];
    expect(sortTargetsForEffect(300, true, cells)[0]).toBe(cells[1]);
    expect(sortTargetsForEffect(300, false, cells)[0]).toBe(cells[0]);
  });

  it('ÉTUDE §3.6 : lignes de poussée de la Mama et poussées observées (Rassemblement, repousse jusqu’au bord)', () => {
    const line = (from: number, d1: number) => {
      const out = [from];
      for (const d of [d1, (d1 + 4) % 8]) {
        for (const c of cellsInDirection(from, d)) if (grid.isWalkable(c)) out.push(c);
      }
      return out.sort((a, b) => a - b);
    };
    expect(line(300, 7)).toEqual([192, 206, 219, 233, 246, 260, 273, 287, 300, 314, 327, 341, 354, 368, 381, 395, 408]);
    expect(line(300, 1)).toEqual([184, 199, 213, 228, 242, 257, 271, 286, 300, 315, 329, 344, 358, 373, 387, 402, 416]);
    expect(line(287, 1)).toEqual([171, 185, 200, 214, 229, 243, 258, 272, 287, 301, 316, 330, 345, 359, 374, 388, 403]);
    const rassemblement = SpellZone.fromRaw('X63,1');
    for (const [mama, from, to] of [[287, 300, 408], [287, 272, 171], [300, 246, 192], [287, 301, 403], [300, 329, 416]] as const) {
      expect(rassemblement.contains(from, mama, mama)).toBe(true);
      const res = computeForcedMove(grid, (c) => c === mama || c === from, {
        kind: 'push', casterCell: mama, targetedCell: mama, targetCell: from, force: 63,
      });
      expect(res.cell).toBe(to);
      expect(res.endsInSpikes).toBe(true);
    }
  });

  it('T6 : Videur au tour 1 (vague 1 en 242 et 358) — identique à l’exemple chiffré de archetype_acrobate.json', () => {
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const acro = JSON.parse(readFileSync(`${root}research/data/archetype_acrobate.json`, 'utf-8'));
    const expected = acro.workedExamples.T1_wave1_videur.results as Array<{
      acrobateCell: number;
      videurCastsPuttingATrollInPics: Array<{ targetCell: number; results: Array<{ fighter: string; from: number; to: number; enteredPics: boolean; collisionDamage: number[] }> }>;
    }>;
    const t2 = SpellZone.fromRaw('T2');
    const got = START_CELLS.map((acroCell) => {
      const entries: Array<[string, number]> = [['ACRO', acroCell]];
      START_CELLS.filter((c) => c !== acroCell).forEach((c, i) => entries.push([`ALLY${i}`, c]));
      for (const c of [242, 358]) entries.push([`TROLL${c}`, c]);
      const base = new Board(entries);
      const casts: Array<{ targetCell: number; results: Array<{ fighter: string; from: number; to: number; enteredPics: boolean; collisionDamage: number[] }> }> = [];
      const targets = castCells(grid, acroCell, { minRange: 1, range: 5, castInLine: true, castTestLos: true }, {
        isOccupied: base.occupied, requireWalkable: false,
      });
      for (const t of targets) {
        const b = new Board([...base.at].map(([c, id]) => [id, c] as [string, number]));
        const zone = t2.cells(t, acroCell);
        const hit = [...b.at.keys()].filter((c) => zone.includes(c) && c !== acroCell);
        const res = [];
        for (const c of sortTargetsForEffect(t, true, hit)) {
          const id = b.at.get(c)!;
          // sous-sort 30689 (1160) : chaque cible devient la case ciblée -> poussée de 3 depuis le lanceur
          const mv = computeForcedMove(grid, b.occupied, { kind: 'push', casterCell: acroCell, targetedCell: c, targetCell: c, force: 3 });
          if (mv.moved) b.move(id, mv.cell);
          res.push({
            fighter: id, from: c, to: mv.cell,
            enteredPics: mv.pathTouchesSpikes,
            collisionDamage: collisionDamages(mv, 200, 1000, []),
          });
        }
        if (res.some((r) => r.enteredPics)) casts.push({ targetCell: t, results: res });
      }
      return { acrobateCell: acroCell, videurCastsPuttingATrollInPics: casts };
    });
    expect(got).toEqual(expected.map((r) => ({
      acrobateCell: r.acrobateCell,
      videurCastsPuttingATrollInPics: r.videurCastsPuttingATrollInPics.map((c) => ({ targetCell: c.targetCell, results: c.results })),
    })));
    // SPEC §13 T6 : Acrobate sur 314, Videur sur 256 puis 372 -> 242 -> 199 et 358 -> 402, dans les pics
    const on314 = got.find((r) => r.acrobateCell === 314)!;
    const byTarget = new Map(on314.videurCastsPuttingATrollInPics.map((c) => [c.targetCell, c.results]));
    expect(byTarget.get(256)).toEqual([{ fighter: 'TROLL242', from: 242, to: 199, enteredPics: true, collisionDamage: [] }]);
    expect(byTarget.get(372)).toEqual([{ fighter: 'TROLL358', from: 358, to: 402, enteredPics: true, collisionDamage: [] }]);
    expect(grid.isSpike(199) && grid.isSpike(402)).toBe(true);
    expect(hasLineOfSight(314, 256, base314Occupied())).toBe(true);
  });
});

function base314Occupied(): (c: number) => boolean {
  const s = new Set([286, 287, 314, 315, 242, 358]);
  return (c) => s.has(c);
}

describe('géométrie — intégration avec sim/data/gladiatrool.data.json', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const path = `${root}sim/data/gladiatrool.data.json`;
  const present = existsSync(path);

  it.skipIf(!present)('MapGrid.fromMapData(data.map) = carte de recherche ; x, y, edgeDepth, voisins cohérents', () => {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    const g = MapGrid.fromMapData(data.map);
    expect(g.mapId).toBe(139988488);
    expect(g.walkableCells).toEqual(grid.walkableCells);
    expect(g.spikeCells).toEqual(grid.spikeCells);
    for (let c = 0; c < CELL_COUNT; c++) expect(g.blocksLos(c)).toBe(grid.blocksLos(c));
    for (const cell of data.map.cells as Array<{ id: number; x: number; y: number; edgeDepth: number | null; neighbours: number[] }>) {
      expect(cellToXY(cell.id)).toEqual([cell.x, cell.y]);
      if (g.isWalkable(cell.id)) {
        expect(g.edgeDepth(cell.id)).toBe(cell.edgeDepth);
        expect(neighbours4(cell.id).filter((n) => g.isWalkable(n)).sort((a, b) => a - b)).toEqual(cell.neighbours);
      }
    }
  });
});
