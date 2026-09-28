/**
 * Cadeaux (« Glyphes Évènementiels », ETUDE §3.7, §8.1 ; SPEC §11.3 ; Q14) : au début des tours ``gifts.firstTurn`` à
 * ``gifts.lastTurn``, avec la probabilité ``gifts.spawnProbability``, l'entité de scénario lance 30566 (glyphe 1165)
 * sur une case tirée parmi ``gifts.cells`` libres (sans combattant ni cadeau ; ``gifts.cellDraw`` : uniforme ou
 * pondérée par les observations). Le déclenchement (joueur qui entre, poussé si ``gifts.pushedPlayerTriggers``), le
 * choix n° 10 de chaque joueur et la dissipation du cadeau ramassé sont interprétés par le moteur (30657) ; le
 * contenu des cartes est tiré par choices.ts.
 */
import { resolveSpell, type FightState } from '../engine/index.js';
import { derivedRng, RNG_TAG } from './random.js';
import type { ScenarioState } from './scenarioState.js';

/** Cases portant un cadeau (marque 1165 posée par l'entité de scénario). */
export function giftCells(state: FightState, sc: ScenarioState): number[] {
  const giftSpellId = state.ctx.data.scenario.gifts.spellId;
  const out: number[] = [];
  for (const m of state.marks) {
    if (m.type === 'glyphImmediate' && m.casterId === sc.sceId && m.sourceSpellId === giftSpellId) out.push(...m.cells);
  }
  return out;
}

/** Tirage et pose du cadeau du tour ``turn`` ; renvoie sa case ou −1. */
export function maybeSpawnGift(state: FightState, sc: ScenarioState, turn: number): number {
  const cfg = state.ctx.config.gifts;
  if (turn < cfg.firstTurn || turn > cfg.lastTurn) return -1;
  const sce = state.fighters[sc.sceId];
  if (!sce) return -1;
  const rng = derivedRng(sc.seed, RNG_TAG.gift, turn);
  if (!(rng.next() < cfg.spawnProbability)) return -1;
  const taken = new Set(giftCells(state, sc));
  const grid = state.ctx.grid;
  const free = cfg.cells.filter((c) => grid.isWalkable(c) && !state.isOccupied(c) && !taken.has(c));
  if (!free.length) return -1;
  let cell: number;
  if (cfg.cellDraw === 'weighted_observed') {
    const counts = state.ctx.data.scenario.gifts.observedCounts;
    const i = rng.weightedIndex(free.map((c) => counts[String(c)] ?? 0));
    cell = free[i < 0 ? rng.int(0, free.length - 1) : i]!;
  } else cell = free[rng.int(0, free.length - 1)]!;
  resolveSpell(state, sce, state.ctx.getSpell(state.ctx.data.scenario.gifts.spellLevel), cell, { depth: 1 });
  sc.giftsSpawned += 1;
  if (state.logging) state.emit({ type: 'giftSpawned', cell, turn });
  return cell;
}
