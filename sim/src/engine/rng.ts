/**
 * Générateur pseudo-aléatoire à graine, stocké dans l'état de combat et clonable en O(1).
 *
 * Algorithme : mulberry32 (état = un entier de 32 bits). Tout l'aléatoire du moteur passe par ici (jets, critiques,
 * tirages du scénario) : deux états clonés évoluent de façon identique.
 *
 * Modes (configuration `rng.*`, ETUDE §9.5-§9.6) :
 * - rollMode : 'random' (tirage), 'average' (moyenne arrondie à l'inférieur), 'min', 'max' ;
 * - rollDistribution (Q22) : 'uniform' (entier uniforme dans [min, max], serveur supposé) ou 'clientPreview'
 *   (floor(min + r × (max − min) + 0,5), aperçu du client) ;
 * - critMode : 'random' (tirage r × 100 < taux), 'never', 'always' (seulement si le taux est > 0).
 */
import type { CritMode, RollDistribution, RollMode } from '../data/index.js';

export class Rng {
  /** État interne (entier non signé 32 bits). */
  state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  clone(): Rng {
    const r = new Rng(0);
    r.state = this.state;
    return r;
  }

  /** Flottant dans [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Entier uniforme dans [lo, hi] (bornes comprises). */
  int(lo: number, hi: number): number {
    if (hi <= lo) return lo;
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }

  /** Élément uniforme d'une liste non vide. */
  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length - 1)]!;
  }

  /** Index tiré selon des poids positifs (−1 si la somme est nulle). */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return -1;
    let r = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]!);
      if (r < 0) return i;
    }
    return weights.length - 1;
  }
}

/** Jet d'un effet dans [lo, hi] selon le mode (hi < lo est ramené à lo). */
export function rollValue(rng: Rng, lo: number, hi: number, mode: RollMode, dist: RollDistribution): number {
  if (hi < lo) hi = lo;
  if (hi === lo) return lo;
  switch (mode) {
    case 'min':
      return lo;
    case 'max':
      return hi;
    case 'average':
      return Math.floor((lo + hi) / 2);
    default:
      if (dist === 'clientPreview') return Math.floor(lo + rng.next() * (hi - lo) + 0.5);
      return rng.int(lo, hi);
  }
}

/**
 * ``SpellWrapper.criticalHitProbability`` : 0 si le taux du sort est nul ; sinon min(100, max(0, sort + stat)).
 */
export function criticalChance(spellCritRate: number, critStat: number): number {
  if (spellCritRate <= 0) return 0;
  return Math.trunc(Math.min(Math.max(0, spellCritRate + critStat), 100));
}

/** Tirage du coup critique d'un lancer (un seul tirage par lancer). */
export function rollCritical(rng: Rng, rate: number, mode: CritMode): boolean {
  if (rate <= 0) return false;
  switch (mode) {
    case 'never':
      return false;
    case 'always':
      return true;
    default:
      return rng.next() * 100 < rate;
  }
}
