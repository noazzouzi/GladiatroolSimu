/**
 * Worker Node (worker_threads) du runner : reçoit des tâches variante × graine, renvoie les résultats. Chargé par
 * ``nodeExperiment.ts`` avec le chargeur TypeScript de tsx (``--import tsx``). NODE UNIQUEMENT.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { runJob, type ExperimentJob } from './experiment.js';
import type { ExperimentSpec } from './types.js';

type Msg = { type: 'job'; job: ExperimentJob } | { type: 'stop' };

const spec = (workerData as { spec: ExperimentSpec }).spec;
const port = parentPort;
if (!port) throw new Error('nodeWorker.ts doit être lancé comme worker');

port.on('message', (msg: Msg) => {
  if (msg.type === 'stop') {
    port.close();
    return;
  }
  try {
    const result = runJob(spec, msg.job);
    port.postMessage({ type: 'result', index: msg.job.index, result });
  } catch (e) {
    port.postMessage({ type: 'error', index: msg.job.index, message: e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e) });
  }
});
port.postMessage({ type: 'ready' });
