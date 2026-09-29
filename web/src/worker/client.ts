/**
 * Client du worker (fil principal) : requêtes typées avec promesse, progression, annulation (le worker est
 * terminé puis relancé : un calcul synchrone ne s'interrompt pas autrement). Repli : si le Web Worker ne peut pas
 * démarrer (cadre très restreint), l'hôte tourne dans le fil principal (l'interface se fige pendant les calculs).
 */
import SimWorker from './worker.ts?worker&inline';
import type { Progress, WorkerMessage, WorkerRequest, WorkerResponseMap } from '../model/types.js';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: Progress) => void;
}

export class CancelledError extends Error {
  constructor() {
    super('calcul annulé');
  }
}

export class SimClient {
  private worker: Worker | null = null;
  private inThread: import('./host.js').SimHost | null = null;
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  /** Mode d'exécution : worker (normal) ou fil principal (repli). */
  mode: 'worker' | 'thread' = 'worker';
  onRestart: (() => void) | null = null;

  constructor() {
    this.spawn();
  }

  private spawn(): void {
    try {
      const w = new SimWorker();
      w.onmessage = (e: MessageEvent<WorkerMessage>) => this.receive(e.data);
      w.onerror = (e) => {
        e.preventDefault?.();
        this.fallback(e.message || 'erreur du worker');
      };
      this.worker = w;
    } catch (err) {
      this.fallback(err instanceof Error ? err.message : String(err));
    }
  }

  private fallback(why: string): void {
    if (this.mode === 'thread') return;
    console.warn(`Worker indisponible (${why}) : calculs dans le fil principal.`);
    this.worker?.terminate();
    this.worker = null;
    this.mode = 'thread';
    const waiting = [...this.pending.entries()];
    this.pending.clear();
    // les requêtes en attente sont rejouées dans le fil principal
    for (const [, p] of waiting) p.reject(new Error('le worker a échoué ; relancer l\'action'));
    this.onRestart?.();
  }

  private receive(msg: WorkerMessage): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.kind === 'progress') p.onProgress?.(msg.progress);
    else {
      this.pending.delete(msg.id);
      if (msg.kind === 'result') p.resolve(msg.result);
      else p.reject(new Error(msg.error));
    }
  }

  request<K extends WorkerRequest['type']>(req: Extract<WorkerRequest, { type: K }>, onProgress?: (p: Progress) => void): Promise<WorkerResponseMap[K]> {
    const id = ++this.seq;
    if (this.mode === 'thread') return this.runInThread(req, onProgress) as Promise<WorkerResponseMap[K]>;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, ...(onProgress ? { onProgress } : {}) });
      this.worker!.postMessage({ id, req });
    });
  }

  private async runInThread(req: WorkerRequest, onProgress?: (p: Progress) => void): Promise<unknown> {
    if (!this.inThread) {
      const { SimHost } = await import('./host.js');
      this.inThread = new SimHost();
    }
    onProgress?.({ phase: 'Calcul dans le fil principal…', fraction: null });
    await new Promise((r) => setTimeout(r, 30));
    return this.inThread.handle(req, (p) => onProgress?.(p));
  }

  /** Nombre de calculs en cours. */
  get busy(): number {
    return this.pending.size;
  }

  /** Annule tous les calculs en cours (worker relancé : l'état du worker est perdu). */
  cancel(): void {
    if (this.mode !== 'worker' || !this.worker) return;
    this.worker.terminate();
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const p of waiting) p.reject(new CancelledError());
    this.spawn();
    this.onRestart?.();
  }
}
