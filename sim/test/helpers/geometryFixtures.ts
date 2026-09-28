/** Aides des tests de géométrie : chargement des fixtures Python et de la carte réelle. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CELL_COUNT, type CellPredicate } from '../../src/geometry/grid.js';
import { MapGrid, type ResearchMapJson } from '../../src/geometry/mapGrid.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export function loadGeometryFixture<T = any>(name: string): T {
  return JSON.parse(readFileSync(`${ROOT}sim/test/fixtures/geometry/${name}`, 'utf-8')) as T;
}

let arenaJson: ResearchMapJson | null = null;
let arena: MapGrid | null = null;

export function loadArenaJson(): ResearchMapJson & Record<string, any> {
  if (!arenaJson) {
    arenaJson = JSON.parse(readFileSync(`${ROOT}research/data/map_139988488.json`, 'utf-8')) as ResearchMapJson;
  }
  return arenaJson as ResearchMapJson & Record<string, any>;
}

/** Carte de combat réelle du Gladiatrool (139988488). */
export function arenaGrid(): MapGrid {
  if (!arena) arena = MapGrid.fromResearchMap(loadArenaJson());
  return arena;
}

const openCache = new Map<string, MapGrid>();

/** « grid » d'un cas de fixture : "arena" ou {losBlocking: [...]} (carte ouverte). */
export function gridFromSpec(spec: 'arena' | { losBlocking: number[]; spikes?: number[] }): MapGrid {
  if (spec === 'arena') return arenaGrid();
  const key = JSON.stringify(spec);
  let g = openCache.get(key);
  if (!g) {
    const all: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) all.push(c);
    g = MapGrid.fromSets({ walkable: all, losBlocking: spec.losBlocking, spikes: spec.spikes ?? [] });
    openCache.set(key, g);
  }
  return g;
}

/** Masque hexadécimal (chiffre k = cellules 4k..4k+3, bit 0 = 4k) ou liste de cellules -> liste triée. */
export function decodeCells(v: string | number[]): number[] {
  if (Array.isArray(v)) return [...v].sort((a, b) => a - b);
  const out: number[] = [];
  for (let k = 0; k < v.length; k++) {
    const d = parseInt(v[k]!, 16);
    for (let b = 0; b < 4; b++) if (d & (1 << b)) out.push(4 * k + b);
  }
  return out;
}

export function setOf(cells: readonly number[]): CellPredicate {
  const m = new Uint8Array(CELL_COUNT);
  for (const c of cells) if (c >= 0 && c < CELL_COUNT) m[c] = 1;
  return (c: number) => c >= 0 && c < CELL_COUNT && m[c] === 1;
}

/** Accumule les écarts et renvoie un résumé lisible des premiers. */
export class Mismatches {
  readonly items: string[] = [];
  count = 0;
  add(msg: string): void {
    this.count++;
    if (this.items.length < 15) this.items.push(msg);
  }
  check(ok: boolean, msg: () => string): void {
    if (!ok) this.add(msg());
  }
  summary(): string {
    return this.count === 0 ? 'aucun écart' : `${this.count} écart(s) :\n` + this.items.join('\n');
  }
}

export function eqArr(a: ArrayLike<number> | null | undefined, b: ArrayLike<number> | null | undefined): boolean {
  if (a == null || b == null) return a == b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
