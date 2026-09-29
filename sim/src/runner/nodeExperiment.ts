/**
 * Exécution MULTI-CŒURS des expériences Monte Carlo en Node (worker_threads). NODE UNIQUEMENT (la partie pure est
 * dans ``experiment.ts``).
 *
 * Chaque worker démarre sur ``nodeWorkerBoot.mjs``, qui enregistre le chargeur TypeScript de tsx (API
 * ``tsx/esm/api``) puis importe ``nodeWorker.ts`` : fonctionne sous ``tsx``, sous vitest comme sous ``node`` (l'option
 * ``--import tsx`` ne s'applique pas au module d'entrée d'un worker, que Node 22 chargerait alors sans la
 * correspondance des imports ``.js`` → ``.ts``). Les tâches (variante ×
 * graine) sont distribuées à la demande ; les résultats sont remis dans l'ordre des tâches, donc l'agrégat ne
 * dépend pas du nombre de workers. Si les workers ne démarrent pas, repli sur une exécution dans le fil courant.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { now } from '../planner/index.js';
import { experimentJobs, runJob, summarizeExperiment, type ExperimentJob } from './experiment.js';
import type { ExperimentResult, ExperimentSpec, FightRunResult } from './types.js';

export interface NodeExperimentOptions {
  /** Nombre de workers (défaut : min(cœurs disponibles, tâches) ; 0 ou 1 : fil courant). */
  workers?: number;
  /** Progression (tâches terminées). */
  onProgress?: (done: number, total: number, r: FightRunResult, variant: string) => void;
  /** Avertissement (français) : workers indisponibles, repli sur le fil courant. */
  onWarning?: (message: string) => void;
}

type WorkerMsg = { type: 'ready' } | { type: 'result'; index: number; result: FightRunResult } | { type: 'error'; index: number; message: string };

/** Lance l'expérience sur ``workers`` workers (défaut : cœurs disponibles). */
export async function runExperiment(spec: ExperimentSpec, opts: NodeExperimentOptions = {}): Promise<ExperimentResult> {
  const t0 = now();
  const jobs = experimentJobs(spec);
  const results: (FightRunResult | undefined)[] = new Array(jobs.length);
  const n = Math.max(0, Math.min(opts.workers ?? availableParallelism(), jobs.length));
  let done = 0;
  const report = (j: ExperimentJob, r: FightRunResult) => {
    results[j.index] = r;
    done++;
    opts.onProgress?.(done, jobs.length, r, spec.variants[j.variantIndex]!.name);
  };
  if (n <= 1) {
    for (const j of jobs) report(j, runJob(spec, j));
    return summarizeExperiment(spec, results as FightRunResult[], now() - t0, 1);
  }
  let next = 0;
  let started = 0;
  await new Promise<void>((resolve, reject) => {
    let alive = 0;
    let failed: Error | null = null;
    const finish = () => {
      if (alive > 0) return;
      if (failed && !started) {
        // aucun worker n'a démarré : repli sur le fil courant
        opts.onWarning?.(`workers indisponibles (${(failed as Error).message.split('\n')[0]}) : exécution sur un seul cœur`);
        try {
          for (const j of jobs) if (!results[j.index]) report(j, runJob(spec, j));
          resolve();
        } catch (e) {
          reject(e);
        }
        return;
      }
      if (failed) reject(failed);
      else resolve();
    };
    for (let w = 0; w < n; w++) {
      const worker = new Worker(new URL('./nodeWorkerBoot.mjs', import.meta.url), { execArgv: [], workerData: { spec } });
      alive++;
      const feed = () => {
        if (failed || next >= jobs.length) {
          worker.postMessage({ type: 'stop' });
          return;
        }
        worker.postMessage({ type: 'job', job: jobs[next++]! });
      };
      worker.on('message', (m: WorkerMsg) => {
        if (m.type === 'ready') {
          started++;
          feed();
        } else if (m.type === 'result') {
          report(jobs[m.index]!, m.result);
          feed();
        } else {
          failed = new Error(`tâche ${m.index} (${spec.variants[jobs[m.index]!.variantIndex]!.name}, graine ${jobs[m.index]!.seed}) : ${m.message}`);
          worker.postMessage({ type: 'stop' });
        }
      });
      worker.on('error', (e) => {
        failed = failed ?? e;
      });
      worker.on('exit', () => {
        alive--;
        finish();
      });
    }
  });
  const missing = jobs.filter((j) => !results[j.index]);
  if (missing.length) throw new Error(`${missing.length} tâche(s) sans résultat`);
  return summarizeExperiment(spec, results as FightRunResult[], now() - t0, n);
}
