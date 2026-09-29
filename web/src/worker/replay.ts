/**
 * Construction d'un rejeu pas à pas (worker) : une image (instantané des combattants, cadeaux, objectif, action
 * visualisée, tranche du journal) après chaque pas de trace — lancer, déplacement, réponse à un choix, fin de tour.
 * Sert à la simulation complète (crochets de ``runFight``) et à l'application d'un plan.
 */
import type { FightEvent } from '../../../sim/src/engine/index.js';
import { buildJournal, JournalNotes, type TraceStep } from '../../../sim/src/runner/index.js';
import { giftCells, type GladiatroolFight } from '../../../sim/src/scenario/index.js';
import type { ActionVisual, FighterStatic, Frame, LineKind, Replay } from '../model/types.js';
import { fighterDyn, fighterStatic, shownFighters } from '../model/view.js';
import { parseActions, positions } from './visual.js';

interface RawFrame extends Omit<Frame, 'lines'> {
  events: [number, number];
}

export class ReplayBuilder {
  private readonly statics = new Map<number, FighterStatic>();
  private readonly frames: RawFrame[] = [];
  private lastE: number;
  private pos: Map<number, number>;
  readonly startEvent: number;

  constructor(fight: GladiatroolFight, label = 'État initial') {
    this.lastE = fight.state.log?.events.length ?? 0;
    this.startEvent = this.lastE;
    this.pos = positions(fight);
    this.push(fight, -1, label, undefined, [this.lastE, this.lastE]);
  }

  private snapshot(fight: GladiatroolFight) {
    return shownFighters(fight).map((f) => {
      if (!this.statics.has(f.id)) this.statics.set(f.id, fighterStatic(fight, f));
      return fighterDyn(fight, f);
    });
  }

  private push(fight: GladiatroolFight, step: number, label: string, action: ActionVisual | undefined, events: [number, number]): void {
    const st = fight.getStatus();
    const obj = fight.getActiveObjective();
    this.frames.push({
      step,
      turn: fight.turn,
      activeId: st.kind === 'playerTurn' || st.kind === 'monsterTurn' ? st.fighterId : -1,
      playerTurn: st.kind === 'playerTurn',
      label,
      fighters: this.snapshot(fight),
      gifts: giftCells(fight.state, fight.scenario).slice().sort((a, b) => a - b),
      objective: obj ? obj.name : null,
      objectivesDone: fight.scenario.completed.length,
      ...(action ? { action } : {}),
      events,
    });
  }

  /** Image après le pas ``s`` (l'action est déjà appliquée ; pour une fin de tour, le combat a avancé). */
  step(fight: GladiatroolFight, s: TraceStep, index: number, choiceLabel?: string): void {
    const events = fight.state.log?.events ?? [];
    const e1 = events.length;
    const slice = events.slice(this.lastE, e1) as FightEvent[];
    const name = (id: number) => fight.state.fighters[id]?.name ?? `#${id}`;
    let label: string;
    let action: ActionVisual | undefined;
    if (s.k === 'cast' || s.k === 'move') {
      const parsed = parseActions(fight, slice, this.pos);
      action = parsed.find((a) => a.kind === s.k) ?? parsed[0];
      label = action?.label ?? (s.k === 'cast' ? `${name(s.f)} : ${fight.ctx.spellName(s.s)} sur ${s.c}` : `${name(s.f)} : déplacement`);
    } else if (s.k === 'end') {
      parseActions(fight, slice, this.pos);
      const st = fight.getStatus();
      const next = st.kind === 'playerTurn' || st.kind === 'monsterTurn' ? ` — au tour de ${name(st.fighterId)}` : st.kind === 'ended' ? ' — fin du combat' : '';
      label = `Fin du tour de ${name(s.f)}${next}`;
    } else {
      parseActions(fight, slice, this.pos);
      label = choiceLabel ? `Choix — ${choiceLabel}` : 'Choix résolu';
      action = { actorId: s.f, actorName: s.f >= 0 ? name(s.f) : 'équipe', kind: 'choice', label, from: -1, forced: [], damage: [], deaths: [], enteredSpikes: [] };
    }
    this.pos = positions(fight);
    this.push(fight, index, label, action, [this.lastE, e1]);
    this.lastE = e1;
  }

  /** Remplace les libellés des images de choix, dans l'ordre (simulation : choix motivés du runner). */
  labelChoices(labels: readonly string[]): void {
    let k = 0;
    for (const f of this.frames) {
      if (f.action?.kind !== 'choice') continue;
      const l = labels[k++];
      if (!l) break;
      f.label = `Choix — ${l}`;
      f.action.label = f.label;
    }
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /**
   * Rejeu final. ``journal`` / ``at`` : lignes du journal et index d'événement de chacune (runner) ; à défaut, le
   * journal des événements du combat depuis la première image (``buildJournal`` sans notes).
   */
  build(fight: GladiatroolFight, journal?: { lines: string[]; at: number[] }): Replay {
    let lines: string[];
    let at: number[];
    if (journal) ({ lines, at } = journal);
    else {
      at = [];
      const all = buildJournal(fight.state, new JournalNotes(), at);
      const first = at.findIndex((i) => i >= this.startEvent);
      lines = first < 0 ? [] : all.slice(first);
      at = first < 0 ? [] : at.slice(first);
      while (lines.length && lines[0] === '') {
        lines.shift();
        at.shift();
      }
    }
    const events = fight.state.log?.events ?? [];
    const frames: Frame[] = [];
    let li = 0;
    this.frames.forEach((raw, k) => {
      const last = k === this.frames.length - 1;
      const start = li;
      while (li < lines.length && (last || at[li]! < raw.events[1])) li++;
      const { events: _e, ...rest } = raw;
      frames.push({ ...rest, lines: [start, li] });
    });
    const turnStarts: Replay['turnStarts'] = [];
    frames.forEach((f, i) => {
      if (!turnStarts.length || turnStarts[turnStarts.length - 1]!.turn !== f.turn) turnStarts.push({ turn: f.turn, frame: i });
    });
    return { statics: [...this.statics.values()].sort((a, b) => a.id - b.id), frames, lines, kinds: lineKinds(lines, at, events), turnStarts };
  }
}

/** Catégorie de chaque ligne du journal (filtres de l'interface). */
export function lineKinds(lines: readonly string[], at: readonly number[], events: readonly FightEvent[]): LineKind[] {
  let inPlan = false;
  return lines.map((l, i) => {
    if (l === '') return 'blank';
    if (l.startsWith('════')) return 'turn';
    if (l.startsWith('▶')) return 'fighter';
    if (l.startsWith('   ◇')) {
      inPlan = true;
      return 'plan';
    }
    if (l.startsWith('      ') && inPlan) return 'plan';
    inPlan = false;
    if (l.startsWith('   ◆')) return 'choice';
    if (l.startsWith('   !')) return 'warn';
    if (!l.startsWith('   ')) return 'result';
    const ev = events[at[i] ?? -1];
    switch (ev?.type) {
      case 'cast':
        return 'cast';
      case 'damage':
      case 'heal':
      case 'death':
        return 'damage';
      case 'move':
        return 'move';
      case 'stateAdded':
        return 'state';
      default:
        return 'scenario';
    }
  });
}
