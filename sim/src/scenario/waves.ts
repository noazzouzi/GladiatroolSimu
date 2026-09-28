/**
 * Vagues (ETUDE §2.3, N40 §4.3, SPEC §11.2, Q5) : V1 (2 Troollibres sur 242 et 358) à la mise en place, V2–V7, V9,
 * V10 au début des tours globaux (données ``scenario.waves`` ; V8 = arrivée de la Mama, gérée par ses sorts).
 *
 * Cases d'apparition selon ``spawn.mode`` (candidats des DONNÉES, par vague et par type de monstre) :
 * - ``weighted_observed`` (défaut) : cases fixes (V1), sinon groupes structurés de V2/V3 (une case par groupe, poids
 *   observés), sinon candidats du type pondérés par le nombre d'observations ;
 * - ``structured_slots`` : groupes (uniformes), sinon emplacements structurels du type (``slotsByType``), uniformes ;
 * - ``uniform_slots`` : candidats du type, uniformes ;
 * - ``most_frequent`` : candidat le plus observé (déterministe ; égalité : ordre des données).
 * ``spawn.allowUnassigned`` ajoute les candidats sans type (jamais une case de pics : aucune apparition n'y a été
 * observée) ; ``spawn.excludeOccupied`` exclut les cases occupées
 * (sinon une case tirée occupée est remplacée par la case libre la plus proche). Deux monstres d'une vague n'ont jamais
 * la même case ; sans candidat libre : case libre hors pics la plus proche du premier candidat (repli documenté).
 * Chaque monstre lance son sort de départ (30694 « Trooler ») à l'apparition.
 */
import type { WaveData, WeightedCell } from '../data/index.js';
import { distance } from '../geometry/index.js';
import { addFighter, resolveSpell, type Fighter, type FightState, type Rng } from '../engine/index.js';
import { derivedRng, RNG_TAG } from './random.js';
import { requireScenario, type ScenarioState } from './scenarioState.js';
import { insertNewMonsters } from './timeline.js';

/** Vague qui apparaît au tour global ``turn`` (hors V8, arrivée de la Mama), ou null. */
export function waveForTurn(state: FightState, turn: number): WaveData | null {
  if (!state.ctx.data.scenario.timeline.waveSpawnTurns.includes(turn)) return null;
  return state.ctx.data.scenario.waves.find((w) => w.turn === turn && !w.boss && w.n > 1) ?? null;
}

/** Case libre (marchable, inoccupée, hors pics, hors ``used``) la plus proche de ``ref`` ; égalité : ordre des cases. */
export function nearestSafeFreeCell(state: FightState, ref: number, used: ReadonlySet<number>): number {
  const grid = state.ctx.grid;
  let best = -1;
  let bd = Infinity;
  for (const c of grid.walkableCells) {
    if (used.has(c) || state.isOccupied(c) || grid.isSpike(c)) continue;
    const d = ref >= 0 ? distance(ref, c) : 0;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

interface GroupCursor {
  monsterId: number;
  left: number;
  candidates: WeightedCell[];
}

/** Candidats d'un monstre de la vague (hors cases fixes) selon ``spawn.mode``. */
function candidatesFor(state: FightState, wave: WaveData, monsterId: number, groups: GroupCursor[] | null): { cells: WeightedCell[]; uniform: boolean } {
  const cfg = state.ctx.config.spawn;
  const sp = wave.spawn!;
  const g = groups?.find((x) => x.monsterId === monsterId && x.left > 0);
  const extra = cfg.allowUnassigned ? sp.unassigned : [];
  if (g && cfg.mode !== 'uniform_slots') {
    g.left -= 1;
    return { cells: g.candidates, uniform: cfg.mode === 'structured_slots' };
  }
  const key = String(monsterId);
  switch (cfg.mode) {
    case 'structured_slots': {
      const slots = sp.slotsByType[key] ?? [];
      return { cells: [...slots.map((cell) => ({ cell, weight: 1 })), ...extra], uniform: true };
    }
    case 'uniform_slots':
      return { cells: [...(sp.candidatesByType[key] ?? []), ...extra], uniform: true };
    default:
      return { cells: [...(sp.candidatesByType[key] ?? []), ...extra], uniform: false };
  }
}

function drawCell(state: FightState, cands: WeightedCell[], uniform: boolean, used: Set<number>, rng: Rng): number {
  const cfg = state.ctx.config.spawn;
  const grid = state.ctx.grid;
  // jamais dans les pics (ETUDE §2.3) : les candidats « sans type » des données en contiennent (V1 : 171, 402)
  const ok = (c: number) => grid.isWalkable(c) && !grid.isSpike(c) && !used.has(c) && (!cfg.excludeOccupied || !state.isOccupied(c));
  const pool = cands.filter((w) => ok(w.cell));
  let cell = -1;
  if (pool.length) {
    if (cfg.mode === 'most_frequent') {
      let best = pool[0]!;
      for (const w of pool) if (w.weight > best.weight) best = w;
      cell = best.cell;
    } else {
      const i = uniform ? rng.int(0, pool.length - 1) : rng.weightedIndex(pool.map((w) => w.weight));
      cell = pool[Math.max(0, i)]!.cell;
    }
  }
  if (cell >= 0 && !state.isOccupied(cell)) return cell;
  // case tirée occupée (excludeOccupied faux) ou aucun candidat : case libre la plus proche
  return nearestSafeFreeCell(state, cell >= 0 ? cell : cands[0]?.cell ?? state.ctx.data.map.center, used);
}

/** Nom affiché : nom du monstre numéroté par type (« Troollibre 3 »). */
function monsterName(state: FightState, monsterId: number): string {
  const m = state.ctx.data.monsters[String(monsterId)];
  let n = 1;
  for (const f of state.fighters) if (f.monsterId === monsterId && !f.isSummon) n++;
  return `${m?.name ?? `Monstre ${monsterId}`} ${n}`;
}

/** Fait apparaître la vague ``wave`` : cases tirées, monstres créés, sorts de départ, sous-liste de la timeline. */
export function spawnWave(state: FightState, wave: WaveData): Fighter[] {
  const sc: ScenarioState = requireScenario(state);
  const rng = derivedRng(sc.seed, RNG_TAG.spawn, wave.n);
  const sp = wave.spawn;
  const groups: GroupCursor[] | null = sp?.groups
    ? sp.groups.map((g) => ({ monsterId: g.monsterId, left: g.count, candidates: g.candidates }))
    : null;
  const used = new Set<number>();
  const out: Fighter[] = [];
  const cells: number[] = [];
  let k = 0;
  for (const { monsterId, count } of wave.composition) {
    for (let i = 0; i < count; i++, k++) {
      let cell = -1;
      const fixed = sp?.fixedCells?.[k];
      if (fixed !== undefined && state.ctx.grid.isWalkable(fixed) && !state.isOccupied(fixed) && !used.has(fixed)) cell = fixed;
      else if (sp) {
        const { cells: cands, uniform } = candidatesFor(state, wave, monsterId, groups);
        cell = drawCell(state, cands, uniform, used, rng);
      } else cell = nearestSafeFreeCell(state, state.ctx.data.map.center, used);
      if (cell < 0) continue;
      used.add(cell);
      const f = addFighter(state, { kind: 'monster', monsterId, name: monsterName(state, monsterId) }, cell);
      out.push(f);
      cells.push(cell);
    }
  }
  for (const f of out) {
    if (f.alive && f.startingSpellLevelId && state.ctx.hasSpell(f.startingSpellLevelId)) {
      resolveSpell(state, f, state.ctx.getSpell(f.startingSpellLevelId), f.cell, { depth: 1 });
    }
  }
  insertNewMonsters(state, sc, out.map((f) => f.id));
  const rec = { wave: wave.n, turn: state.turn, fighterIds: out.map((f) => f.id), cells };
  sc.waves = [...sc.waves, rec];
  if (state.logging) state.emit({ type: 'waveSpawned', wave: wave.n, turn: state.turn, fighterIds: rec.fighterIds, cells });
  return out;
}
