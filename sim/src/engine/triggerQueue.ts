/**
 * Vidage de la file des déclenchements (``FightState.triggerQueue``) : chaque événement est traité par le moteur
 * (``processTrigger`` : buffs déclenchés, voir triggerProcessing.ts) puis passé à l'observateur ``hooks.onTrigger``.
 *
 * Vidages imbriqués : l'exécution d'un buff déclenché résout des effets qui vident eux-mêmes la file après chaque
 * application (effet × cible). Un vidage imbriqué ne traite QUE les événements produits depuis son ouverture
 * (``state.flushMark``) : les événements encore en attente du niveau englobant sont traités ensuite, dans l'ordre
 * FIFO, par le vidage englobant. Ainsi, dans un sous-sort déclenché, un état gagné à l'effet 0 (EON) est traité avant
 * l'effet 1, comme dans un lancer direct.
 * Garde-fou contre les boucles infinies de déclenchements.
 */
import type { FightState } from './state.js';
import { processTrigger } from './triggerProcessing.js';

/** Nombre maximal d'événements traités par vidage (garde-fou). */
export const MAX_TRIGGER_EVENTS_PER_FLUSH = 100_000;

export function flushTriggers(state: FightState): void {
  const q = state.triggerQueue;
  const mark = state.flushMark;
  if (q.length <= mark) return;
  const hook = state.ctx.hooks.onTrigger;
  let n = 0;
  while (q.length > mark) {
    const ev = mark === 0 ? q.shift()! : q.splice(mark, 1)[0]!;
    state.flushMark = q.length;
    try {
      processTrigger(state, ev);
      if (hook) hook(state, ev);
    } finally {
      state.flushMark = mark;
    }
    if (++n > MAX_TRIGGER_EVENTS_PER_FLUSH) {
      q.length = mark;
      throw new Error('Boucle de déclenchements : plus de 100 000 événements traités sans fin');
    }
  }
}
