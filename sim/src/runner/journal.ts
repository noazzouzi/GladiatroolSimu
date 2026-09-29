/**
 * Journal lisible en français d'un combat : événements utiles du moteur (tours, lancers, dégâts, soins,
 * déplacements, morts, vagues, cadeaux, objectifs) entrecoupés des notes du runner (plans expliqués, choix
 * motivés), placées à l'endroit du journal où elles ont été prises.
 */
import { formatEvent, type FightEvent, type FightState } from '../engine/index.js';

/** Notes du runner, indexées par la position dans le journal du moteur au moment où elles sont prises. */
export class JournalNotes {
  private readonly notes = new Map<number, string[]>();

  add(state: FightState, lines: string | readonly string[]): void {
    const at = state.log ? state.log.events.length : 0;
    const arr = this.notes.get(at) ?? [];
    if (typeof lines === 'string') arr.push(lines);
    else arr.push(...lines);
    this.notes.set(at, arr);
  }

  at(index: number): readonly string[] {
    return this.notes.get(index) ?? [];
  }

  get size(): number {
    return this.notes.size;
  }
}

/** États signalés dans le journal (le reste des envoûtements est omis). */
const SHOWN_STATES = new Set([5994 /* Vulnérable */, 157 /* Inébranlable */]);

/** Événement retenu dans le journal lisible (le reste — envoûtements, déclencheurs… — est omis). */
export function isJournalEvent(ev: FightEvent, state: FightState): boolean {
  switch (ev.type) {
    case 'globalTurn':
    case 'damage':
    case 'heal':
    case 'move':
    case 'death':
    case 'waveSpawned':
    case 'giftSpawned':
    case 'objectiveActivated':
    case 'objectiveCompleted':
    case 'objectiveInfo':
    case 'fightEnded':
    case 'info':
    case 'spellLearned':
    case 'turnCancelled':
      return true;
    case 'turnStart': {
      const f = state.fighters[ev.fighterId];
      return !!f && f.team !== 'scenario';
    }
    case 'cast':
      return ev.depth === 0;
    case 'stateAdded':
      return SHOWN_STATES.has(ev.stateId);
    default:
      return false;
  }
}

/**
 * Lignes du journal (événements filtrés + notes). ``at`` (facultatif) reçoit, pour chaque ligne, l'index du journal
 * du moteur auquel elle se rattache (événement, ou position de la note) : l'interface web aligne ainsi le journal
 * sur les pas de la trace.
 */
export function buildJournal(state: FightState, notes: JournalNotes, at?: number[]): string[] {
  const out: string[] = [];
  const n = state.names;
  const events = state.log?.events ?? [];
  for (let i = 0; i <= events.length; i++) {
    for (const line of notes.at(i)) {
      out.push(line);
      at?.push(i);
    }
    const ev = events[i];
    if (!ev || !isJournalEvent(ev, state)) continue;
    const text = formatEvent(ev, n);
    if (!text) continue;
    if (ev.type === 'globalTurn') {
      out.push('');
      out.push(`════════ Tour ${ev.turn} ════════`);
      at?.push(i, i);
    } else if (ev.type === 'turnStart') {
      out.push(`▶ ${text}`);
      at?.push(i);
    } else {
      out.push(`   ${text}`);
      at?.push(i);
    }
  }
  return out;
}
