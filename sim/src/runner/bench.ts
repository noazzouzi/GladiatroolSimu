/**
 * Évaluation standard de la boucle d'amélioration (« bench ») : compositions ADDM et AADM, graines 1-24, mode fast,
 * mêmes graines pour les deux (comparaison appariée). Rapport JSON stable (``BenchReport``) + résumé français.
 */
import { meanStat, wilsonInterval } from './stats.js';
import type { ExperimentResult, ExperimentSpec, Interval, PairedComparison } from './types.js';

/** Spécification du bench (ne pas modifier sans changer ``BENCH_VERSION``). */
export const BENCH_SPEC: Readonly<ExperimentSpec> = Object.freeze({
  variants: [{ name: 'ADDM' }, { name: 'AADM' }],
  seeds: Array.from({ length: 24 }, (_, i) => i + 1),
  mode: 'fast',
  maxTurn: 20,
});

export const BENCH_VERSION = 1;

export interface BenchLine {
  fights: number;
  wins: number;
  winRate: number;
  winRateCi95: Interval;
  /** Fraction moyenne des PV ennemis détruits. */
  progress: number;
  turnReached: number;
  objectives: number;
  mamaKilledRate: number;
  playerDeaths: number;
  msPerFight: number;
}

export interface BenchReport {
  bench: 'gladiatrool';
  version: number;
  spec: ExperimentSpec;
  overall: BenchLine;
  byCompo: Record<string, BenchLine>;
  comparison: PairedComparison | null;
  wallMs: number;
  workers: number;
}

function line(runs: ExperimentResult['runs']): BenchLine {
  const rs = runs.map((r) => r.result);
  const n = rs.length;
  const wins = rs.filter((r) => r.victory).length;
  const totalMs = rs.reduce((s, r) => s + r.timing.totalMs, 0);
  return {
    fights: n,
    wins,
    winRate: n ? wins / n : 0,
    winRateCi95: wilsonInterval(wins, n),
    progress: meanStat(rs.map((r) => r.progress)).mean,
    turnReached: meanStat(rs.map((r) => r.turnReached)).mean,
    objectives: meanStat(rs.map((r) => r.objectivesCount)).mean,
    mamaKilledRate: n ? rs.filter((r) => r.mamaKilledTurn !== null).length / n : 0,
    playerDeaths: meanStat(rs.map((r) => r.playerDeaths.length)).mean,
    msPerFight: n ? totalMs / n : 0,
  };
}

/** Rapport du bench à partir du résultat de l'expérience. */
export function benchSummary(res: ExperimentResult): BenchReport {
  const byCompo: Record<string, BenchLine> = {};
  for (const v of res.spec.variants) byCompo[v.name] = line(res.runs.filter((r) => r.variant === v.name));
  return {
    bench: 'gladiatrool',
    version: BENCH_VERSION,
    spec: res.spec,
    overall: line(res.runs),
    byCompo,
    comparison: res.comparisons[0] ?? null,
    wallMs: res.wallMs,
    workers: res.workers,
  };
}

const pct = (x: number): string => `${(100 * x).toFixed(1).replace('.', ',')} %`;
const n2 = (x: number): string => x.toFixed(2).replace('.', ',');

/** Résumé français du bench. */
export function formatBench(r: BenchReport): string {
  const out: string[] = [];
  const fmt = (name: string, l: BenchLine) =>
    `${name.padEnd(8)} victoires ${String(l.wins).padStart(3)}/${l.fights} = ${pct(l.winRate)} [${pct(l.winRateCi95.low)} ; ${pct(l.winRateCi95.high)}]` +
    ` · progression ${pct(l.progress)} · tour ${n2(l.turnReached)} · objectifs ${n2(l.objectives)} · Mama tuée ${pct(l.mamaKilledRate)}` +
    ` · morts ${n2(l.playerDeaths)} · ${(l.msPerFight / 1000).toFixed(1).replace('.', ',')} s/combat`;
  out.push(`Bench v${r.version} — ${r.spec.variants.map((v) => v.name).join(', ')}, graines ${r.spec.seeds[0]}-${r.spec.seeds[r.spec.seeds.length - 1]}, mode ${r.spec.mode}`);
  out.push(fmt('Global', r.overall));
  for (const [k, l] of Object.entries(r.byCompo)) out.push(fmt(k, l));
  if (r.comparison) {
    const c = r.comparison;
    out.push(
      `Apparié ${c.a} − ${c.b} : victoires propres ${c.aOnly} / ${c.bOnly} (McNemar p = ${c.mcnemarP.toFixed(3).replace('.', ',')}), ` +
        `progression ${(100 * c.progressDiff.mean).toFixed(1).replace('.', ',')} pts`,
    );
  }
  out.push(`Durée totale : ${(r.wallMs / 1000).toFixed(1).replace('.', ',')} s sur ${r.workers} cœur(s).`);
  return out.join('\n');
}
