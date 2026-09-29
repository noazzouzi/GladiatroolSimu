/**
 * Campagne d'expériences comparatives du rapport docs/RESULTATS.md (NODE UNIQUEMENT).
 *
 *   npx tsx sim/src/cli/campaign.ts liste
 *   npx tsx sim/src/cli/campaign.ts <expérience>[,<expérience>…] [--graines 1001-1200] [--coeurs 4]
 *        [--sortie sim/results] [--cache fichier.jsonl]
 *
 * Les combats (variante × graine) sont répartis à la demande sur ``--coeurs`` processus enfants (``fork`` + IPC ;
 * chaque enfant charge le code TypeScript par ``--import tsx``). Chaque combat est joué par le runner (planificateur
 * en mode fast, déterministe : budget de nœuds seul) puis, si l'expérience le demande, analysé par rejeu de sa
 * trace (``analyzeTrace``). Un cache JSONL facultatif (``--cache`` ; clé : variante hors nom + graine) évite de
 * rejouer les combats déjà faits (par exemple ADDM / AADM, communs à plusieurs expériences). Résultat : ``<sortie>/<id>.json`` (statistiques,
 * comparaisons appariées, analyses agrégées, enregistrements compacts) et un tableau français sur la sortie.
 */
import { fork, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CAMPAIGN,
  compactRun,
  runAnalyzedJob,
  runCacheKey,
  summarizeCampaign,
  type CampaignExperiment,
  type CompactRun,
  type ExperimentReport,
} from '../analysis/campaigns.js';
import type { FightAnalysis } from '../analysis/fightAnalysis.js';
import { parseSeeds } from '../runner/index.js';
import type { Variant } from '../runner/index.js';

const HERE = fileURLToPath(import.meta.url);
const ROOT = resolvePath(dirname(HERE), '../../..');

interface Job {
  index: number;
  variant: Variant;
  seed: number;
  analyze: boolean;
  mode: 'fast' | 'deep' | 'greedy';
}

interface CacheEntry {
  key: string;
  run: CompactRun;
  analysis: FightAnalysis | null;
}

type ChildMsg = { type: 'ready' } | { type: 'done'; index: number; run: CompactRun; analysis: FightAnalysis | null } | { type: 'error'; index: number; message: string };

// ---------------------------------------------------------------------------------------------
// Enfant
// ---------------------------------------------------------------------------------------------

function childMain(): void {
  process.on('message', (m: { type: 'job'; job: Job } | { type: 'stop' }) => {
    if (m.type === 'stop') {
      process.exit(0);
    }
    const { job } = m;
    try {
      const r = runAnalyzedJob(job.variant, job.seed, { mode: job.mode, analyze: job.analyze });
      process.send!({ type: 'done', index: job.index, run: compactRun(job.variant.name, r.run), analysis: r.analysis } satisfies ChildMsg);
    } catch (e) {
      process.send!({ type: 'error', index: job.index, message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) } satisfies ChildMsg);
    }
  });
  process.send!({ type: 'ready' } satisfies ChildMsg);
}

// ---------------------------------------------------------------------------------------------
// Parent
// ---------------------------------------------------------------------------------------------

function loadCache(file: string): Map<string, CacheEntry> {
  const m = new Map<string, CacheEntry>();
  if (!existsSync(file)) return m;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as CacheEntry;
      const prev = m.get(e.key);
      if (!prev || (!prev.analysis && e.analysis)) m.set(e.key, e);
    } catch {
      // ligne tronquée (interruption) : ignorée
    }
  }
  return m;
}

async function runJobs(jobs: Job[], workers: number, onDone: (j: Job, run: CompactRun, a: FightAnalysis | null) => void): Promise<void> {
  if (!jobs.length) return;
  const n = Math.max(1, Math.min(workers, jobs.length));
  let next = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    let failed: Error | null = null;
    for (let w = 0; w < n; w++) {
      const child: ChildProcess = fork(HERE, ['__enfant'], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      alive++;
      const feed = () => {
        if (failed || next >= jobs.length) {
          child.send({ type: 'stop' });
          return;
        }
        child.send({ type: 'job', job: jobs[next++]! });
      };
      child.on('message', (m: ChildMsg) => {
        if (m.type === 'ready') feed();
        else if (m.type === 'done') {
          onDone(jobs.find((j) => j.index === m.index)!, m.run, m.analysis);
          feed();
        } else {
          const j = jobs.find((x) => x.index === m.index)!;
          failed = new Error(`combat ${j.variant.name} graine ${j.seed} : ${m.message}`);
          child.send({ type: 'stop' });
        }
      });
      child.on('exit', () => {
        alive--;
        if (alive === 0) {
          if (failed) reject(failed);
          else resolve();
        }
      });
    }
  });
}

const pct = (x: number): string => `${(100 * x).toFixed(1).replace('.', ',')} %`;
const num = (x: number, d = 2): string => x.toFixed(d).replace('.', ',');

/** Tableau français d'une expérience. */
export function formatReport(rep: ExperimentReport): string {
  const out = [`## ${rep.title} (${rep.id}, graines ${rep.seeds})`, ''];
  out.push('| Variante | Combats | Victoires | IC 95 % Wilson | Progression | Tour | Objectifs | Morts/combat | Mama tuée | s/combat |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const v of rep.variants) {
    out.push(
      `| ${v.name} | ${v.runs} | ${v.wins} (${pct(v.winRate)}) | ${pct(v.winRateCi95.low)} – ${pct(v.winRateCi95.high)} | ${pct(v.progress.mean)} | ${num(v.turnReached.mean)} | ${num(v.objectives.mean)} | ${num(v.playerDeaths.mean)} | ${pct(v.mamaKilledRate)} | ${num(v.msPerFight / 1000, 1)} |`,
    );
  }
  if (rep.comparisons.length) {
    out.push('', '| A contre B (apparié) | Graines | A seul gagne | B seul gagne | McNemar p | Δ progression (pts, IC 95 %) | Δ tour |');
    out.push('|---|---|---|---|---|---|---|');
    for (const c of rep.comparisons) {
      out.push(
        `| ${c.a} / ${c.b} | ${c.seeds} | ${c.aOnly} | ${c.bOnly} | ${num(c.mcnemarP, 3)} | ${num(100 * c.progressDiff.mean, 2)} [${num(100 * c.progressDiff.ci95.low, 2)} ; ${num(100 * c.progressDiff.ci95.high, 2)}] | ${num(c.turnDiff.mean)} |`,
      );
    }
  }
  return out.join('\n');
}

async function runCampaign(exp: CampaignExperiment, seedsSpec: string, workers: number, outDir: string, cacheFile: string | null): Promise<ExperimentReport> {
  const seeds = parseSeeds(seedsSpec);
  const cache = cacheFile ? loadCache(cacheFile) : new Map<string, CacheEntry>();
  const mode = exp.mode ?? 'fast';
  const runs: (CompactRun | undefined)[] = [];
  const analyses: (FightAnalysis | null | undefined)[] = [];
  const jobs: Job[] = [];
  let index = 0;
  for (const seed of seeds) {
    for (const v of exp.variants) {
      const key = runCacheKey(v, seed, mode);
      const hit = cache.get(key);
      if (hit && (!exp.analyze || hit.analysis)) {
        runs[index] = { ...hit.run, v: v.name };
        analyses[index] = hit.analysis ? { ...hit.analysis, compo: v.name } : null;
      } else {
        const { ref: _r, group: _g, ...variant } = v as Variant & { ref?: string; group?: string };
        jobs.push({ index, variant, seed, analyze: exp.analyze, mode });
      }
      index++;
    }
  }
  const total = index;
  process.stderr.write(`${exp.id} : ${total} combats (${total - jobs.length} en cache), ${Math.min(workers, jobs.length)} processus\n`);
  const t0 = Date.now();
  let done = 0;
  await runJobs(jobs, workers, (j, run, a) => {
    runs[j.index] = run;
    analyses[j.index] = a;
    done++;
    if (cacheFile) appendFileSync(cacheFile, `${JSON.stringify({ key: runCacheKey(j.variant, j.seed, mode), run, analysis: a } satisfies CacheEntry)}\n`);
    if (done % 10 === 0 || done === jobs.length) {
      const el = (Date.now() - t0) / 1000;
      process.stderr.write(`  [${done}/${jobs.length}] ${el.toFixed(0)} s écoulées, reste ~${((el / done) * (jobs.length - done)).toFixed(0)} s\n`);
    }
  });
  // un enfant mort sans message (mémoire, signal) laisserait des trous : jamais de synthèse sur un échantillon incomplet
  let missing = 0;
  for (let i = 0; i < total; i++) if (!runs[i]) missing++;
  if (missing) throw new Error(`${exp.id} : ${missing} combat(s) sans résultat (processus enfant interrompu ?)`);
  const rep = summarizeCampaign(
    exp,
    seedsSpec,
    runs.filter((r): r is CompactRun => !!r),
    analyses.filter((a): a is FightAnalysis => !!a),
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolvePath(outDir, `${exp.id}.json`), JSON.stringify(rep));
  return rep;
}

function opt(argv: readonly string[], key: string): string | undefined {
  const i = argv.indexOf(`--${key}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv: readonly string[]): Promise<number> {
  const cmd = argv[0] ?? 'liste';
  if (cmd === 'liste' || cmd === 'aide') {
    process.stdout.write('Expériences disponibles :\n');
    for (const e of CAMPAIGN) process.stdout.write(`  ${e.id.padEnd(14)} ${e.title} — ${e.variants.length} variantes, graines ${e.seeds}${e.analyze ? ', analyse détaillée' : ''}\n`);
    process.stdout.write('Usage : npx tsx sim/src/cli/campaign.ts <id>[,<id>…] [--graines a-b] [--coeurs 4] [--sortie sim/results] [--cache fichier.jsonl]\n');
    return 0;
  }
  const ids = cmd === 'tout' ? CAMPAIGN.map((e) => e.id) : cmd.split(',');
  const workers = Number(opt(argv, 'coeurs') ?? availableParallelism());
  const outDir = resolvePath(opt(argv, 'sortie') ?? resolvePath(ROOT, 'sim/results'));
  const cacheOpt = opt(argv, 'cache');
  const cacheFile = cacheOpt ? resolvePath(cacheOpt) : null;
  if (cacheFile) mkdirSync(dirname(cacheFile), { recursive: true });
  for (const id of ids) {
    const exp = CAMPAIGN.find((e) => e.id === id);
    if (!exp) {
      process.stderr.write(`Expérience inconnue : « ${id} » (voir « liste »)\n`);
      return 2;
    }
    const rep = await runCampaign(exp, opt(argv, 'graines') ?? exp.seeds, workers, outDir, cacheFile);
    process.stdout.write(`${formatReport(rep)}\n\n`);
  }
  return 0;
}

if (process.argv[2] === '__enfant') childMain();
else if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`Erreur : ${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    },
  );
}
