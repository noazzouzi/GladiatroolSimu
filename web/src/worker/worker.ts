/**
 * Web Worker du simulateur : exécute les requêtes de l'interface (planificateur, simulation, rejeu) hors du fil
 * principal. Protocole : ``{ id, req }`` → messages ``progress`` puis ``result`` ou ``error`` (français).
 */
import type { WorkerMessage, WorkerRequest } from '../model/types.js';
import { SimHost } from './host.js';

interface WorkerScope {
  postMessage(msg: WorkerMessage): void;
  onmessage: ((e: MessageEvent<{ id: number; req: WorkerRequest }>) => void) | null;
}

const scope = self as unknown as WorkerScope;
const host = new SimHost();

scope.onmessage = (e) => {
  const { id, req } = e.data;
  try {
    const result = host.handle(req, (progress) => scope.postMessage({ id, kind: 'progress', progress }));
    scope.postMessage({ id, kind: 'result', result });
  } catch (err) {
    scope.postMessage({ id, kind: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
