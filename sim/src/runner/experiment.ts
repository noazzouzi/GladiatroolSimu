/**
 * Expériences Monte Carlo (partie pure, sans API Node) : découpage en tâches variante × graine, exécution d'une
 * tâche (``runJob``), agrégation (statistiques, comparaisons appariées), tableaux français. L'exécution
 * multi-cœurs (worker_threads) est dans ``nodeExperiment.ts`` ; ``runExperimentSync`` exécute tout sur le fil courant
 * (tests, navigateur).
 */
import { now } from '../planner/index.js';
import { runFight } from './runFight.js';
import { pairedComparison, variantStats } from './stats.js';
import type { ExperimentResult, ExperimentSpec, FightRunResult, PairedComparison, VariantStats } from './types.js';

export interface ExperimentJob {
  /** Rang de la tâche (ordre graine × variante). */
  index: number;
  variantIndex: number;
  seed: number;
}

/** Tâches : pour chaque graine, chaque variante (les variantes d'une même graine sont voisines). */
export function experimentJobs(spec: ExperimentSpec): ExperimentJob[] {
  const jobs: ExperimentJob[] = [];
  for (const seed of spec.seeds) {
    spec.variants.forEach((_, variantIndex) => jobs.push({ index: jobs.length, variantIndex, seed }));
  }
  return jobs;
}

/** Exécute une tâche (combat sans journal ni trace). */
export function runJob(spec: ExperimentSpec, job: ExperimentJob): FightRunResult {
  const v = spec.variants[job.variantIndex]!;
  const r = runFight(
    { ...(v.players ? { players: v.players } : { compo: v.compo ?? v.name }), seed: job.seed },
    {
      mode: v.mode ?? spec.mode ?? 'fast',
      planner: v.planner,
      policies: v.policies,
      configOverrides: v.configOverrides,
      monsters: v.monsters,
      maxTurn: spec.maxTurn,
    },
  );
  r.compo = v.name;
  return r;
}

/** Agrège les résultats (``results[i]`` = tâche i de ``experimentJobs``). */
export function summarizeExperiment(spec: ExperimentSpec, results: readonly FightRunResult[], wallMs: number, workers: number): ExperimentResult {
  const jobs = experimentJobs(spec);
  const byVariant: FightRunResult[][] = spec.variants.map(() => []);
  const runs: ExperimentResult['runs'] = [];
  jobs.forEach((j, i) => {
    const r = results[i];
    if (!r) return;
    byVariant[j.variantIndex]!.push(r);
    runs.push({ variant: spec.variants[j.variantIndex]!.name, result: r });
  });
  const variants: VariantStats[] = spec.variants.map((v, i) => variantStats(v.name, byVariant[i]!));
  const comparisons: PairedComparison[] = [];
  for (let a = 0; a < spec.variants.length; a++) {
    for (let b = a + 1; b < spec.variants.length; b++) {
      comparisons.push(pairedComparison(spec.variants[a]!.name, byVariant[a]!, spec.variants[b]!.name, byVariant[b]!));
    }
  }
  return { spec, variants, comparisons, runs, wallMs, workers };
}

/** Exécution sur le fil courant (tests, navigateur). */
export function runExperimentSync(spec: ExperimentSpec, onProgress?: (done: number, total: number, r: FightRunResult) => void): ExperimentResult {
  const t0 = now();
  const jobs = experimentJobs(spec);
  const results: FightRunResult[] = [];
  for (const j of jobs) {
    const r = runJob(spec, j);
    results.push(r);
    onProgress?.(results.length, jobs.length, r);
  }
  return summarizeExperiment(spec, results, now() - t0, 1);
}

/** Liste de graines : « 1-100 », « 1,2,5-7 », « 42 ». */
export function parseSeeds(spec: string): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const m = /^(-?\d+)\s*-\s*(-?\d+)$/.exec(p);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b < a) throw new Error(`graines « ${p} » : intervalle décroissant`);
      for (let s = a; s <= b; s++) out.push(s);
    } else if (/^-?\d+$/.test(p)) out.push(Number(p));
    else throw new Error(`graines « ${p} » : entier ou intervalle « a-b » attendu`);
  }
  if (!out.length) throw new Error('aucune graine');
  return out;
}

const pct = (x: number): string => `${(100 * x).toFixed(1).replace('.', ',')} %`;
const num = (x: number, d = 2): string => x.toFixed(d).replace('.', ',');

function pad(s: string, n: number, right = false): string {
  const len = [...s].length;
  if (len >= n) return s;
  return right ? ' '.repeat(n - len) + s : s + ' '.repeat(n - len);
}

/** Tableau comparatif français (une ligne par variante) + comparaisons appariées. */
export function formatExperimentTable(res: ExperimentResult): string {
  const head = ['Variante', 'Combats', 'Victoires', 'IC 95 % (Wilson)', 'Tour moyen', 'Progression', 'Objectifs', 'Morts', 'Mama tuée', 'T Mama', 's/combat'];
  const rows = res.variants.map((v) => [
    v.name,
    String(v.runs),
    `${v.wins} (${pct(v.winRate)})`,
    `${pct(v.winRateCi95.low)} – ${pct(v.winRateCi95.high)}`,
    num(v.turnReached.mean),
    pct(v.progress.mean),
    num(v.objectives.mean),
    num(v.playerDeaths.mean),
    pct(v.mamaKilledRate),
    v.mamaKilledTurn ? num(v.mamaKilledTurn.mean) : '—',
    num(v.msPerFight / 1000, 1),
  ]);
  const widths = head.map((h, i) => Math.max([...h].length, ...rows.map((r) => [...r[i]!].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i]!, i > 0)).join(' │ ');
  const out = [line(head), widths.map((w) => '─'.repeat(w)).join('─┼─'), ...rows.map(line)];
  if (res.comparisons.length) {
    out.push('', 'Comparaisons appariées (mêmes graines) :');
    for (const c of res.comparisons) {
      out.push(
        `  ${c.a} contre ${c.b} : ${c.seeds} graines ; victoires propres ${c.aOnly} / ${c.bOnly} (McNemar p = ${num(c.mcnemarP, 3)}) ; ` +
          `progression ${c.progressDiff.mean >= 0 ? '+' : ''}${num(100 * c.progressDiff.mean, 1)} pts ` +
          `[${num(100 * c.progressDiff.ci95.low, 1)} ; ${num(100 * c.progressDiff.ci95.high, 1)}] ; tour ${c.turnDiff.mean >= 0 ? '+' : ''}${num(c.turnDiff.mean)}`,
      );
    }
  }
  const reasons = res.variants.map((v) => `${v.name} : ${Object.entries(v.reasons).map(([k, n]) => `${REASONS[k] ?? k} ${n}`).join(', ')}`);
  out.push('', `Fins de combat — ${reasons.join(' ; ')}`);
  out.push(`Durée : ${num(res.wallMs / 1000, 1)} s sur ${res.workers} cœur(s).`);
  return out.join('\n');
}

const REASONS: Readonly<Record<string, string>> = {
  victory: 'victoires',
  defeat: 'défaites',
  maxTurn: 'limites de tours',
  turnLimit: 'limites du scénario',
  noFighter: 'sans combattant',
};
