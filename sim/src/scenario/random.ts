/**
 * Tirages du scénario (cases d'apparition, cadeaux, cartes, votes) : chaque tirage utilise un flux pseudo-aléatoire
 * DÉRIVÉ de la graine du scénario et de sa nature (vague n, tour t, joueur p…), indépendant des jets de combat.
 * Deux stratégies jouées sur la même graine voient donc les mêmes vagues, les mêmes cadeaux et les mêmes cartes
 * (« nombres aléatoires communs », ETUDE §10.7), aux cases occupées près.
 */
import { Rng } from '../engine/index.js';

/** Nature d'un tirage (entre dans la dérivation de la graine). */
export const RNG_TAG = {
  spawn: 1,
  gift: 2,
  acclamation: 3,
  giftCards: 4,
  vote: 5,
} as const;

/** Mélange d'entiers 32 bits (murmur3 fmix) : graine dérivée déterministe. */
export function mixSeed(...parts: number[]): number {
  let h = 0x9e3779b9;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Flux pseudo-aléatoire dérivé de ``seed`` et des parties (nature du tirage, indices). */
export function derivedRng(seed: number, ...parts: number[]): Rng {
  return new Rng(mixSeed(seed, ...parts));
}

/** ``n`` éléments distincts tirés uniformément (ordre du tirage ; tous si ``n`` ≥ taille). */
export function pickDistinct<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  const k = Math.min(n, pool.length);
  for (let i = 0; i < k; i++) {
    const j = rng.int(i, pool.length - 1);
    const t = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = t;
    out.push(pool[i]!);
  }
  return out;
}
