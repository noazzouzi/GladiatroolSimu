/**
 * Statistiques des expériences Monte Carlo : intervalle de Wilson (taux de victoire), moyennes avec IC à 95 %,
 * comparaisons APPARIÉES (mêmes graines) : test exact de McNemar sur les issues, différences de progression.
 */
import type { FightRunResult, Interval, MeanStat, PairedComparison, VariantStats } from './types.js';

/** Intervalle de Wilson (score) à ``z`` (défaut 1,96 : 95 %) pour ``k`` succès sur ``n``. */
export function wilsonInterval(k: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Moyenne, écart-type (n − 1) et IC normal à 95 % de la moyenne. */
export function meanStat(xs: readonly number[]): MeanStat {
  const n = xs.length;
  if (!n) return { mean: 0, sd: 0, ci95: { low: 0, high: 0 } };
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1)) : 0;
  const half = n > 1 ? (1.96 * sd) / Math.sqrt(n) : 0;
  return { mean, sd, ci95: { low: mean - half, high: mean + half } };
}

/** p-valeur bilatérale exacte du test de McNemar (binomiale ``b`` contre ``c``, p = 1/2). */
export function mcnemarExactP(b: number, c: number): number {
  const n = b + c;
  if (n === 0) return 1;
  const k = Math.min(b, c);
  // somme des probabilités binomiales P(X ≤ k), X ~ B(n, 1/2), doublée
  let logC = 0; // log C(n, 0)
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    if (i > 0) logC += Math.log(n - i + 1) - Math.log(i);
    sum += Math.exp(logC - n * Math.LN2);
  }
  return Math.min(1, 2 * sum);
}

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** Statistiques d'une variante. */
export function variantStats(name: string, runs: readonly FightRunResult[]): VariantStats {
  const n = runs.length;
  const wins = runs.filter((r) => r.victory).length;
  const reasons: Record<string, number> = {};
  for (const r of runs) {
    const k = r.reason ?? 'inconnu';
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  const mamaTurns = runs.filter((r) => r.mamaKilledTurn !== null).map((r) => r.mamaKilledTurn!);
  const totalMs = runs.reduce((s, r) => s + r.timing.totalMs, 0);
  const p95s = runs.map((r) => r.timing.planMsP95).sort((a, b) => a - b);
  return {
    name,
    runs: n,
    wins,
    winRate: n ? wins / n : 0,
    winRateCi95: wilsonInterval(wins, n),
    turnReached: meanStat(runs.map((r) => r.turnReached)),
    progress: meanStat(runs.map((r) => r.progress)),
    objectives: meanStat(runs.map((r) => r.objectivesCount)),
    playerDeaths: meanStat(runs.map((r) => r.playerDeaths.length)),
    mamaKilledRate: n ? mamaTurns.length / n : 0,
    mamaKilledTurn: mamaTurns.length ? meanStat(mamaTurns) : null,
    reasons,
    msPerFight: n ? totalMs / n : 0,
    totalMs,
    planMsP95: quantile(p95s, 0.5),
  };
}

/** Comparaison appariée de deux variantes jouées sur les mêmes graines (graines communes seulement). */
export function pairedComparison(aName: string, a: readonly FightRunResult[], bName: string, b: readonly FightRunResult[]): PairedComparison {
  const bySeed = new Map<number, FightRunResult>();
  for (const r of b) bySeed.set(r.seed, r);
  let aOnly = 0;
  let bOnly = 0;
  const dp: number[] = [];
  const dt: number[] = [];
  for (const ra of a) {
    const rb = bySeed.get(ra.seed);
    if (!rb) continue;
    if (ra.victory && !rb.victory) aOnly++;
    if (!ra.victory && rb.victory) bOnly++;
    dp.push(ra.progress - rb.progress);
    dt.push(ra.turnReached - rb.turnReached);
  }
  return {
    a: aName,
    b: bName,
    seeds: dp.length,
    aOnly,
    bOnly,
    mcnemarP: mcnemarExactP(aOnly, bOnly),
    progressDiff: meanStat(dp),
    turnDiff: meanStat(dt),
  };
}
