/**
 * Déplacement volontaire : cases atteignables, plus court chemin, tacle.
 * Port de movement.reachable / shortest_path / evade_ratio / tackle_losses / walk (``FightReachableCellsMaker``,
 * ``Pathfinding`` sans diagonales ni traversée d'entité, ``TackleUtil``), plus une variante qui évite les pics.
 * Voir research/notes/70_formules_dofus.md §6 et ETUDE §9.11.
 *
 * Règles : 4 voisins MapPoint (directions 1, 3, 5, 7, dans cet ordre), 1 PM par pas, cases jouables et libres ;
 * les pics (glyphes) ne bloquent pas le déplacement. La case de départ n'est jamais testée.
 */

import { AXIS_DIRECTIONS, CELL_COUNT, INVALID_CELL, NEVER, NEXT_CELL, type CellPredicate } from './grid.js';
import type { MapGrid } from './mapGrid.js';

export interface PathOptions {
  /**
   * Choisit, pour chaque destination, le chemin qui traverse le moins de cases de pics (destination comprise),
   * puis le plus court (dans la limite des PM). Défaut false : plus court chemin BFS (ordre du port Python).
   */
  avoidSpikes?: boolean;
  /** Prédicat « case de pics » (défaut : grid.isSpike). */
  isSpike?: CellPredicate;
}

const UNREACHED = -1;
const AXES = Int8Array.from(AXIS_DIRECTIONS);

/** Résultat de reachableCells : cases atteignables, coût, chemin et indicateurs de pics. */
export class Reachability {
  /** Cases atteignables, case de départ comprise (en tête), dans l'ordre de découverte. */
  readonly cells: readonly number[];

  /**
   * @param costs PM dépensés par le chemin retenu (-1 = inatteignable)
   * @param spikeCount cases de pics sur le chemin retenu (départ exclu, destination comprise)
   * @param parents parents par couche : parents[L * 560 + c] = case précédente quand c est atteinte en L pas
   *   (mode BFS : une seule couche, parents[c])
   * @param layered vrai si ``parents`` est indexé par couche (variante « éviter les pics »)
   */
  constructor(
    readonly start: number,
    readonly mp: number,
    cells: number[],
    private readonly costs: Int16Array,
    private readonly spikeCount: Int16Array,
    private readonly parents: Int16Array,
    private readonly layered: boolean,
    private readonly isSpike: CellPredicate,
  ) {
    this.cells = cells;
  }

  isReachable(cell: number): boolean {
    return cell >= 0 && cell < CELL_COUNT && this.costs[cell]! !== UNREACHED;
  }

  /** PM dépensés par le chemin retenu (-1 si inatteignable). */
  cost(cell: number): number {
    return cell >= 0 && cell < CELL_COUNT ? this.costs[cell]! : UNREACHED;
  }

  /** Chemin retenu, case de départ EXCLUE, destination comprise ([] pour le départ, null si inatteignable). */
  path(cell: number): number[] | null {
    if (!this.isReachable(cell)) return null;
    const out: number[] = [];
    let c = cell;
    for (let L = this.costs[cell]!; L > 0; L--) {
      out.push(c);
      c = this.parents[(this.layered ? L * CELL_COUNT : 0) + c]!;
    }
    return out.reverse();
  }

  /** Nombre de cases de pics sur le chemin retenu (départ exclu, destination comprise). */
  spikeCells(cell: number): number {
    return this.isReachable(cell) ? this.spikeCount[cell]! : 0;
  }

  /** La destination est une case de pics (faux pour la case de départ). */
  endsInSpikes(cell: number): boolean {
    return this.isReachable(cell) && cell !== this.start && this.isSpike(cell);
  }

  /** Le chemin traverse des pics avant la destination (cases intermédiaires). */
  crossesSpikes(cell: number): boolean {
    return this.spikeCells(cell) - (this.endsInSpikes(cell) ? 1 : 0) > 0;
  }

  /** Le chemin touche des pics (traversée ou arrivée). */
  touchesSpikes(cell: number): boolean {
    return this.spikeCells(cell) > 0;
  }
}

/**
 * Cases atteignables avec ``mp`` PM depuis ``start`` (``movement.reachable`` : BFS 4-connexe sur cases jouables
 * libres). ``isOccupied`` : présence d'un combattant (le déplacé lui-même peut y figurer sur ``start``).
 */
export function reachableCells(
  grid: MapGrid,
  start: number,
  mp: number,
  isOccupied: CellPredicate = NEVER,
  options: PathOptions = {},
): Reachability {
  const isSpike = options.isSpike ?? grid.isSpike;
  const walk = grid.walkableMask;
  const free = (c: number): boolean => c !== INVALID_CELL && walk[c] === 1 && !isOccupied(c);
  if (options.avoidSpikes) return reachableAvoidingSpikes(start, mp, free, isSpike);

  const costs = new Int16Array(CELL_COUNT).fill(UNREACHED);
  const parent = new Int16Array(CELL_COUNT).fill(INVALID_CELL);
  const spikes = new Int16Array(CELL_COUNT);
  const order: number[] = [start];
  costs[start] = 0;
  for (let head = 0; head < order.length; head++) {
    const c = order[head]!;
    const dc = costs[c]!;
    if (dc >= mp) continue;
    const base = c * 8;
    for (let k = 0; k < 4; k++) {
      const n = NEXT_CELL[base + AXES[k]!]!;
      if (n !== INVALID_CELL && costs[n] === UNREACHED && free(n)) {
        costs[n] = dc + 1;
        parent[n] = c;
        spikes[n] = spikes[c]! + (isSpike(n) ? 1 : 0);
        order.push(n);
      }
    }
  }
  return new Reachability(start, mp, order, costs, spikes, parent, false, isSpike);
}

/**
 * Variante « éviter les pics » : programmation dynamique par nombre de pas (0..mp) ; pour chaque destination,
 * minimise (cases de pics sur le chemin, longueur) dans la limite des PM. Le chemin optimal est toujours simple
 * (retirer une boucle ne peut que réduire les deux critères).
 */
function reachableAvoidingSpikes(start: number, mp: number, free: CellPredicate, isSpike: CellPredicate): Reachability {
  const layers = Math.max(0, mp) + 1;
  const INF = 0x7fff;
  const best = new Int16Array(layers * CELL_COUNT).fill(INF);
  const par = new Int16Array(layers * CELL_COUNT).fill(INVALID_CELL);
  // état de passage mis en cache : 0 inconnu, 1 libre, 2 libre avec pics, 3 bloqué
  const pass = new Uint8Array(CELL_COUNT);
  const costs = new Int16Array(CELL_COUNT).fill(UNREACHED);
  const spikes = new Int16Array(CELL_COUNT);
  const order: number[] = [start];
  best[start] = 0;
  costs[start] = 0;
  pass[start] = 3;
  let frontier: number[] = [start];
  for (let L = 0; L + 1 < layers && frontier.length > 0; L++) {
    const next: number[] = [];
    const off = L * CELL_COUNT;
    const noff = off + CELL_COUNT;
    for (const c of frontier) {
      const v = best[off + c]!;
      const base = c * 8;
      for (let k = 0; k < 4; k++) {
        const n = NEXT_CELL[base + AXES[k]!]!;
        if (n === INVALID_CELL) continue;
        let p = pass[n]!;
        if (p === 0) {
          p = !free(n) ? 3 : isSpike(n) ? 2 : 1;
          pass[n] = p;
        }
        if (p === 3) continue;
        const nv = v + (p === 2 ? 1 : 0);
        const cur = best[noff + n]!;
        if (nv < cur) {
          if (cur === INF) next.push(n);
          best[noff + n] = nv;
          par[noff + n] = c;
        }
      }
    }
    // couche L + 1 terminée : meilleur (pics, longueur) par case
    for (const n of next) {
      const v = best[noff + n]!;
      if (costs[n] === UNREACHED) {
        costs[n] = L + 1;
        spikes[n] = v;
        order.push(n);
      } else if (v < spikes[n]!) {
        costs[n] = L + 1;
        spikes[n] = v;
      }
    }
    frontier = next;
  }
  return new Reachability(start, mp, order, costs, spikes, par, true, isSpike);
}

/**
 * Distances de marche (BFS 4-connexe sur cases jouables libres) depuis ``start`` : Int16Array, -1 = inatteignable.
 * ``maxDist`` borne l'exploration.
 */
export function walkDistances(
  grid: MapGrid,
  start: number,
  isOccupied: CellPredicate = NEVER,
  maxDist = CELL_COUNT,
): Int16Array {
  const dist = new Int16Array(CELL_COUNT).fill(UNREACHED);
  const walk = grid.walkableMask;
  const queue = new Int16Array(CELL_COUNT);
  let head = 0;
  let tail = 0;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++]!;
    const dc = dist[c]!;
    if (dc >= maxDist) continue;
    const base = c * 8;
    for (let k = 0; k < 4; k++) {
      const n = NEXT_CELL[base + AXES[k]!]!;
      if (n !== INVALID_CELL && dist[n] === UNREACHED && walk[n] === 1 && !isOccupied(n)) {
        dist[n] = dc + 1;
        queue[tail++] = n;
      }
    }
  }
  return dist;
}

/**
 * Plus court chemin de ``start`` à ``goal`` (``movement.shortest_path``) : liste de cases, départ COMPRIS ;
 * null si inatteignable. ``goal`` doit être libre. Avec avoidSpikes : minimise (cases de pics, longueur).
 */
export function shortestPath(
  grid: MapGrid,
  start: number,
  goal: number,
  isOccupied: CellPredicate = NEVER,
  options: PathOptions = {},
): number[] | null {
  const walk = grid.walkableMask;
  const free = (c: number): boolean => c !== INVALID_CELL && walk[c] === 1 && !isOccupied(c);
  if (options.avoidSpikes) {
    return shortestPathAvoidingSpikes(start, goal, free, options.isSpike ?? grid.isSpike);
  }
  const prev = new Int16Array(CELL_COUNT).fill(-2); // -2 = non visité
  const queue = new Int16Array(CELL_COUNT);
  let head = 0;
  let tail = 0;
  prev[start] = -1;
  queue[tail++] = start;
  while (head < tail) {
    const c = queue[head++]!;
    if (c === goal) break;
    const base = c * 8;
    for (let k = 0; k < 4; k++) {
      const n = NEXT_CELL[base + AXES[k]!]!;
      if (n !== INVALID_CELL && prev[n] === -2 && free(n)) {
        prev[n] = c;
        queue[tail++] = n;
      }
    }
  }
  if (goal < 0 || goal >= CELL_COUNT || prev[goal] === -2) return null;
  const path = [goal];
  while (path[path.length - 1] !== start) path.push(prev[path[path.length - 1]!]!);
  return path.reverse();
}

/** Dijkstra lexicographique (pics, longueur) : coût encodé pics * 1024 + longueur. */
function shortestPathAvoidingSpikes(
  start: number,
  goal: number,
  free: CellPredicate,
  isSpike: CellPredicate,
): number[] | null {
  if (goal < 0 || goal >= CELL_COUNT) return null;
  const cost = new Float64Array(CELL_COUNT).fill(Infinity);
  const prev = new Int16Array(CELL_COUNT).fill(-2);
  const done = new Uint8Array(CELL_COUNT);
  const heap = new MinHeap();
  cost[start] = 0;
  prev[start] = -1;
  heap.push(0, start);
  while (heap.size > 0) {
    const [key, c] = heap.pop();
    if (done[c]) continue;
    if (key > cost[c]!) continue;
    done[c] = 1;
    if (c === goal) break;
    const base = c * 8;
    for (let k = 0; k < 4; k++) {
      const n = NEXT_CELL[base + AXES[k]!]!;
      if (n === INVALID_CELL || done[n] || !free(n)) continue;
      const nk = key + 1 + (isSpike(n) ? 1024 : 0);
      if (nk < cost[n]!) {
        cost[n] = nk;
        prev[n] = c;
        heap.push(nk, n);
      }
    }
  }
  if (prev[goal] === -2) return null;
  const path = [goal];
  while (path[path.length - 1] !== start) path.push(prev[path[path.length - 1]!]!);
  return path.reverse();
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, v: number): void {
    const keys = this.keys;
    const vals = this.vals;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! < k || (keys[p] === k && vals[p]! <= v)) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }
  pop(): [number, number] {
    const keys = this.keys;
    const vals = this.vals;
    const k0 = keys[0]!;
    const v0 = vals[0]!;
    const lk = keys.pop()!;
    const lv = vals.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        let m = l;
        if (r < n && (keys[r]! < keys[l]! || (keys[r] === keys[l] && vals[r]! < vals[l]!))) m = r;
        if (keys[m]! > lk || (keys[m] === lk && vals[m]! >= lv)) break;
        keys[i] = keys[m]!;
        vals[i] = vals[m]!;
        i = m;
      }
      keys[i] = lk;
      vals[i] = lv;
    }
    return [k0, v0];
  }
}

// ---------------------------------------------------------------------------------------------
// Tacle (TackleUtil) — désactivé dans le Gladiatrool (état 5970 des joueurs) mais fourni.
// ---------------------------------------------------------------------------------------------

/**
 * ``TackleUtil.getTackle`` : produit, sur les ennemis adjacents capables de tacler, de
 * min(1, (Fuite + 2) / (Tacle + 2) / 2). 1 = aucun tacle. ``cantBeTackled`` : état intaclable.
 */
export function evadeRatio(evade: number, adjacentEnemyTackles: Iterable<number>, cantBeTackled = false): number {
  if (cantBeTackled) return 1.0;
  const ev = Math.max(0, evade);
  let ratio = 1.0;
  for (const t of adjacentEnemyTackles) {
    const mod = (ev + 2) / (Math.max(0, t) + 2) / 2;
    if (mod < 1) ratio *= mod;
  }
  return ratio;
}

/** PM et PA perdus en quittant une case : int(x * (1 - ratio) + 0.5). */
export function tackleLosses(mp: number, ap: number, ratio: number): { mp: number; ap: number } {
  return {
    mp: Math.max(0, Math.trunc(mp * (1 - ratio) + 0.5)),
    ap: Math.max(0, Math.trunc(ap * (1 - ratio) + 0.5)),
  };
}

export interface WalkResult {
  /** Case d'arrivée. */
  cell: number;
  mp: number;
  ap: number;
  /** Nombre de pas effectués. */
  steps: number;
}

/**
 * ``movement.walk`` : applique le tacle le long d'un chemin (départ COMPRIS en tête). Le tacle est évalué à chaque
 * case quittée (départ compris) via ``ratioAt(case)`` ; arrêt quand les PM tombent à 0.
 */
export function walkWithTackle(
  path: readonly number[],
  mp: number,
  ap: number,
  ratioAt: (cell: number) => number,
): WalkResult {
  let cur = path[0]!;
  let steps = 0;
  for (let i = 1; i < path.length; i++) {
    const r = ratioAt(cur);
    const lost = tackleLosses(mp, ap, r);
    mp -= lost.mp;
    ap -= lost.ap;
    if (mp <= 0) break;
    mp -= 1;
    cur = path[i]!;
    steps += 1;
  }
  return { cell: cur, mp, ap, steps };
}
