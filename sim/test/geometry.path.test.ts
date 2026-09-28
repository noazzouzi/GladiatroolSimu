import { describe, expect, it } from 'vitest';
import { CELL_COUNT, areAdjacent } from '../src/geometry/grid.js';
import {
  evadeRatio,
  reachableCells,
  shortestPath,
  tackleLosses,
  walkDistances,
  walkWithTackle,
} from '../src/geometry/path.js';
import { Mismatches, arenaGrid, eqArr, gridFromSpec, loadGeometryFixture, setOf } from './helpers/geometryFixtures.js';

const fx = loadGeometryFixture('path.json');

/** Vérifie qu'un chemin (départ exclu) est une suite de pas 4-connexes sur cases jouables libres. */
function validPath(start: number, path: number[], free: (c: number) => boolean): boolean {
  let prev = start;
  for (const c of path) {
    if (!areAdjacent(prev, c) || prev === c || !free(c)) return false;
    prev = c;
  }
  return true;
}

describe('géométrie — déplacements (validation croisée avec movement.py)', () => {
  it('reachableCells : cases atteignables, coûts et ordre BFS identiques à movement.reachable', () => {
    const mm = new Mismatches();
    for (const cfg of fx.reachable) {
      const grid = gridFromSpec(cfg.grid);
      const occ = setOf(cfg.occupied);
      const r = reachableCells(grid, cfg.start, cfg.mp, occ);
      mm.check(eqArr(r.cells, cfg.cells), () => `reachable(${cfg.start}, ${cfg.mp}) cellules`);
      mm.check(eqArr(r.cells.map((c) => r.cost(c)), cfg.costs), () => `reachable(${cfg.start}, ${cfg.mp}) coûts`);
      const dist = walkDistances(grid, cfg.start, occ, cfg.mp);
      for (let c = 0; c < CELL_COUNT; c++) {
        if (dist[c] !== r.cost(c)) mm.add(`walkDistances(${cfg.start}) case ${c}`);
      }
      const free = (c: number) => grid.isWalkable(c) && !occ(c);
      for (const c of r.cells) {
        const p = r.path(c)!;
        if (p.length !== r.cost(c) || !validPath(cfg.start, p, free)) mm.add(`path(${cfg.start}->${c}) invalide`);
        const sp = p.filter((x) => grid.isSpike(x)).length;
        if (r.spikeCells(c) !== sp) mm.add(`spikeCells(${cfg.start}->${c})`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('shortestPath : identique à movement.shortest_path (départ compris, null si inatteignable)', () => {
    const mm = new Mismatches();
    for (const cfg of fx.shortest) {
      const grid = gridFromSpec(cfg.grid);
      const got = shortestPath(grid, cfg.start, cfg.goal, setOf(cfg.occupied));
      mm.check(eqArr(got, cfg.path), () => `shortestPath(${cfg.start}->${cfg.goal}) = ${got} attendu ${cfg.path}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('éviter les pics (PM limités) : optimum (pics, longueur) = énumération exhaustive des chemins', () => {
    const grid = arenaGrid();
    const mm = new Mismatches();
    for (const cfg of fx.avoidReach) {
      const occ = setOf(cfg.occupied);
      const r = reachableCells(grid, cfg.start, cfg.mp, occ, { avoidSpikes: true });
      const plain = reachableCells(grid, cfg.start, cfg.mp, occ);
      mm.check(r.cells.length === cfg.best.length && r.cells.length === plain.cells.length,
        () => `avoid(${cfg.start}, ${cfg.mp}) : ${r.cells.length} cases, attendu ${cfg.best.length}`);
      const free = (c: number) => grid.isWalkable(c) && !occ(c);
      for (const [c, spikes, len] of cfg.best as number[][]) {
        const p = r.path(c!);
        if (!p) {
          mm.add(`avoid(${cfg.start}->${c}) inatteignable`);
          continue;
        }
        const sp = p.filter((x) => grid.isSpike(x)).length;
        if (r.spikeCells(c!) !== spikes || r.cost(c!) !== len || p.length !== len || sp !== spikes || !validPath(cfg.start, p, free)) {
          mm.add(`avoid(${cfg.start}->${c}) = (${r.spikeCells(c!)}, ${r.cost(c!)}) attendu (${spikes}, ${len})`);
        }
        if (r.endsInSpikes(c!) !== (c !== cfg.start && grid.isSpike(c!))) mm.add(`endsInSpikes(${c})`);
        if (r.crossesSpikes(c!) !== p.slice(0, -1).some((x) => grid.isSpike(x))) mm.add(`crossesSpikes(${c})`);
      }
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('éviter les pics (sans limite) : même optimum (pics, longueur) que Dijkstra', () => {
    const grid = arenaGrid();
    const mm = new Mismatches();
    for (const cfg of fx.avoidShortest) {
      const occ = setOf(cfg.occupied);
      const p = shortestPath(grid, cfg.start, cfg.goal, occ, { avoidSpikes: true });
      if (cfg.best === null) {
        mm.check(p === null, () => `avoidShortest(${cfg.start}->${cfg.goal}) devrait être null`);
        continue;
      }
      if (!p) {
        mm.add(`avoidShortest(${cfg.start}->${cfg.goal}) null`);
        continue;
      }
      const rest = p.slice(1);
      const got = [rest.filter((x) => grid.isSpike(x)).length, rest.length];
      const free = (c: number) => grid.isWalkable(c) && !occ(c);
      mm.check(eqArr(got, cfg.best) && p[0] === cfg.start && validPath(cfg.start, rest, free),
        () => `avoidShortest(${cfg.start}->${cfg.goal}) = ${got} attendu ${cfg.best}`);
    }
    expect(mm.summary()).toBe('aucun écart');
  });

  it('tacle : ratio, pertes de PM/PA, marche taclée', () => {
    const mm = new Mismatches();
    for (const t of fx.tackle) {
      const r = evadeRatio(t.evade, t.tackles, t.cantBeTackled);
      mm.check(r === t.ratio, () => `evadeRatio(${t.evade}, ${t.tackles}) = ${r} attendu ${t.ratio}`);
      const l = tackleLosses(t.mp, t.ap, r);
      mm.check(l.mp === t.losses[0] && l.ap === t.losses[1], () => `tackleLosses(${t.mp},${t.ap},${r})`);
    }
    for (const w of fx.walks) {
      const ratios = new Map<number, number>();
      w.path.forEach((c: number, i: number) => ratios.set(c, w.ratios[i]));
      const res = walkWithTackle(w.path, w.mp, w.ap, (c) => ratios.get(c)!);
      mm.check(eqArr([res.cell, res.mp, res.ap, res.steps], w.result), () =>
        `walk(${w.path}) = ${JSON.stringify(res)} attendu ${w.result}`);
    }
    expect(mm.summary()).toBe('aucun écart');
    // références verify_mechanics : 0 fuite / 0 tacle -> 0,5 ; 4 PM / 8 PA -> perd 2 PM et 4 PA ; deux tacleurs -> 0,25
    expect(evadeRatio(0, [0])).toBe(0.5);
    expect(tackleLosses(4, 8, 0.5)).toEqual({ mp: 2, ap: 4 });
    expect(evadeRatio(0, [0, 0])).toBe(0.25);
    expect(evadeRatio(100, [0, 0])).toBe(1);
  });

  it('les pics ne bloquent pas le déplacement ; une case occupée si', () => {
    const grid = arenaGrid();
    // 176 (sûre) est adjacente à 161 et 162 (pics)
    const r = reachableCells(grid, 176, 2);
    expect(r.isReachable(161)).toBe(true);
    expect(r.endsInSpikes(161)).toBe(true);
    expect(reachableCells(grid, 300, 1, setOf([286])).isReachable(286)).toBe(false);
    expect(reachableCells(grid, 300, 0).cells).toEqual([300]);
  });
});
