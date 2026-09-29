/**
 * Visualisation d'actions (worker) : lecture du journal typé du moteur pour en tirer des actions affichables
 * (lancer + zone, déplacement + chemin, poussées / attirances prévues, dégâts, morts, entrées dans les pics), et
 * simulation d'un plan sur une copie de planification (jets moyens) pour le tracer sur la carte.
 */
import type { FightEvent } from '../../../sim/src/engine/index.js';
import {
  advanceToNextPlayer,
  executePlan,
  planningClone,
  resolveOptions,
  spellProfile,
  type ChoicePolicy,
  type PlanAlternative,
  type PlannedAction,
  type PlanOptions,
} from '../../../sim/src/planner/index.js';
import { ENEMY_IN_SPIKES_STATE, type GladiatroolFight } from '../../../sim/src/scenario/index.js';
import type { ActionVisual, PlanCard } from '../model/types.js';

const zoneCache = new Map<string, number[]>();

/** Cases touchées par un lancer (zones des effets qui choisissent des cibles ; zones globales omises). */
export function zoneCells(fight: GladiatroolFight, spellLevelId: number, casterCell: number, target: number): number[] {
  const key = `${spellLevelId}:${casterCell}:${target}`;
  const hit = zoneCache.get(key);
  if (hit) return hit;
  const grid = fight.ctx.grid;
  const out = new Set<number>();
  try {
    const prof = spellProfile(fight.ctx, spellLevelId);
    for (const z of prof.zones) {
      const cells = z.containedCells(target, casterCell).filter((c) => grid.isWalkable(c));
      if (cells.length > 60) continue; // zone globale : rien d'utile à dessiner
      for (const c of cells) out.add(c);
    }
  } catch {
    /* sort sans profil : pas de zone */
  }
  if (!out.size && target >= 0) out.add(target);
  const res = [...out];
  if (zoneCache.size > 5000) zoneCache.clear();
  zoneCache.set(key, res);
  return res;
}

/** Positions courantes des combattants vivants placés. */
export function positions(fight: GladiatroolFight): Map<number, number> {
  const m = new Map<number, number>();
  for (const f of fight.state.fighters) if (f.alive && f.cell >= 0) m.set(f.id, f.cell);
  return m;
}

/**
 * Découpe une suite d'événements en actions : un lancer direct (profondeur 0) ou une marche volontaire ouvre une
 * action ; déplacements forcés, dégâts, morts et entrées dans les pics qui suivent lui sont rattachés. Les débuts
 * et fins de tour ferment l'action en cours. ``pos`` (positions avant le premier événement) est mis à jour.
 */
export function parseActions(fight: GladiatroolFight, events: readonly FightEvent[], pos: Map<number, number>): ActionVisual[] {
  const out: ActionVisual[] = [];
  const name = (id: number) => fight.state.fighters[id]?.name ?? `#${id}`;
  const grid = fight.ctx.grid;
  let cur: ActionVisual | null = null;
  const open = (a: ActionVisual) => {
    cur = a;
    out.push(a);
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'turnStart':
      case 'turnEnd':
      case 'globalTurn':
        cur = null;
        break;
      case 'cast': {
        if (ev.depth !== 0) break;
        const from = pos.get(ev.casterId) ?? -1;
        const spellName = fight.ctx.spellName(ev.spellLevelId);
        open({
          actorId: ev.casterId,
          actorName: name(ev.casterId),
          kind: 'cast',
          label: `${name(ev.casterId)} : ${spellName} sur ${ev.cell}${ev.critical ? ' (critique)' : ''}`,
          from,
          castCell: ev.cell,
          spellName,
          zone: zoneCells(fight, ev.spellLevelId, from, ev.cell),
          forced: [],
          damage: [],
          deaths: [],
          enteredSpikes: [],
        });
        break;
      }
      case 'move': {
        const voluntary = ev.kind === 'walk' && ev.fighterId === ev.sourceId;
        if (voluntary) {
          const path = [ev.from, ...ev.path.filter((c, i) => i > 0 || c !== ev.from)];
          open({
            actorId: ev.fighterId,
            actorName: name(ev.fighterId),
            kind: 'move',
            label: `${name(ev.fighterId)} : déplacement ${ev.from} → ${ev.to} (${Math.max(0, path.length - 1)} PM)`,
            from: ev.from,
            path,
            forced: [],
            damage: [],
            deaths: [],
            enteredSpikes: [],
          });
        } else if (ev.kind !== 'place') {
          const target: ActionVisual =
            cur ??
            (() => {
              const a: ActionVisual = {
                actorId: ev.sourceId,
                actorName: name(ev.sourceId),
                kind: 'info',
                label: `${name(ev.fighterId)} déplacé (${kindLabel(ev.kind)}) ${ev.from} → ${ev.to}`,
                from: ev.from,
                forced: [],
                damage: [],
                deaths: [],
                enteredSpikes: [],
              };
              open(a);
              return a;
            })();
          target.forced.push({
            id: ev.fighterId,
            name: name(ev.fighterId),
            kind: ev.kind,
            from: ev.from,
            to: ev.to,
            path: [ev.from, ...ev.path.filter((c, i) => i > 0 || c !== ev.from)],
            intoSpikes: grid.isSpike(ev.to) && !grid.isSpike(ev.from),
            collision: ev.collision,
          });
        }
        pos.set(ev.fighterId, ev.to);
        break;
      }
      case 'damage': {
        const a = cur as ActionVisual | null;
        if (!a || ev.amount <= 0) break;
        const d = a.damage.find((x) => x.id === ev.targetId);
        if (d) d.amount += ev.amount;
        else a.damage.push({ id: ev.targetId, name: name(ev.targetId), amount: ev.amount, killed: false });
        break;
      }
      case 'death': {
        pos.delete(ev.fighterId);
        const a = cur as ActionVisual | null;
        if (!a) break;
        a.deaths.push(name(ev.fighterId));
        const d = a.damage.find((x) => x.id === ev.fighterId);
        if (d) d.killed = true;
        break;
      }
      case 'stateAdded': {
        const a = cur as ActionVisual | null;
        if (a && ev.stateId === ENEMY_IN_SPIKES_STATE && !a.enteredSpikes.includes(name(ev.targetId))) a.enteredSpikes.push(name(ev.targetId));
        break;
      }
      case 'spawn':
        pos.set(ev.fighterId, ev.cell);
        break;
      default:
        break;
    }
  }
  return out;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case 'push':
      return 'poussée';
    case 'pull':
      return 'attirance';
    case 'advance':
      return 'avance';
    case 'swap':
      return 'échange';
    case 'teleport':
      return 'téléportation';
    default:
      return kind;
  }
}

/** Fusionne les actions d'un même pas de plan en une seule (le lancer l'emporte sur la marche). */
function mergeStep(parsed: ActionVisual[], fallback: ActionVisual): ActionVisual {
  if (!parsed.length) return fallback;
  const main = parsed.find((a) => a.kind === 'cast') ?? parsed[0]!;
  for (const a of parsed) {
    if (a === main) continue;
    main.forced.push(...a.forced);
    main.deaths.push(...a.deaths);
    main.enteredSpikes.push(...a.enteredSpikes);
    for (const d of a.damage) {
      const x = main.damage.find((y) => y.id === d.id);
      if (x) {
        x.amount += d.amount;
        x.killed ||= d.killed;
      } else main.damage.push({ ...d });
    }
  }
  return main;
}

/**
 * Joue ``actions`` (tour du joueur courant de ``f``, copie avec journal) une à une et renvoie leur visualisation ;
 * s'arrête au premier refus. La copie avance d'autant (tour non terminé).
 */
export function simulateSteps(f: GladiatroolFight, actions: readonly PlannedAction[], policy: ChoicePolicy): ActionVisual[] {
  const log = f.state.log!;
  const steps: ActionVisual[] = [];
  const actor = f.getCurrentFighter();
  const actorId = actor?.id ?? -1;
  const actorName = actor?.name ?? '?';
  for (const a of actions) {
    const cell = f.state.fighters[actorId]?.cell ?? -1;
    if (a.type === 'end') {
      steps.push({ actorId, actorName, kind: 'end', label: `Fin du tour sur la case ${cell}`, from: cell, forced: [], damage: [], deaths: [], enteredSpikes: [] });
      break;
    }
    const e0 = log.events.length;
    const pos = positions(f);
    const r = executePlan(f, [a], { choicePolicy: policy, endTurn: false });
    const parsed = parseActions(f, log.events.slice(e0), pos);
    const fallback: ActionVisual = {
      actorId,
      actorName,
      kind: a.type === 'move' ? 'move' : 'cast',
      label: a.type === 'move' ? `Déplacement vers ${a.path[a.path.length - 1]}` : `${f.ctx.spellName(a.spellLevelId)} sur ${a.cell}`,
      from: cell,
      ...(a.type === 'move' ? { path: [cell, ...a.path] } : { castCell: a.cell, zone: zoneCells(f, a.spellLevelId, cell, a.cell) }),
      forced: [],
      damage: [],
      deaths: [],
      enteredSpikes: [],
    };
    const step = mergeStep(parsed, fallback);
    if (!r.ok) step.label += ` — refusé (${r.reason ?? '?'})`;
    steps.push(step);
    if (!r.ok) break;
  }
  return steps;
}

/** Fin du tour de ``actorId`` puis monstres jusqu'au joueur suivant (jets moyens) : actions visualisées. */
export function simulateInterlude(f: GladiatroolFight, actorId: number, turn: number, opts: PlanOptions): ActionVisual[] {
  const log = f.state.log!;
  const e0 = log.events.length;
  const pos = positions(f);
  advanceToNextPlayer(f, actorId, turn, resolveOptions(opts));
  return parseActions(f, log.events.slice(e0), pos).filter((a) => a.actorId !== actorId || a.kind !== 'info');
}

/** Copie de planification (jets moyens, sans critique, graines neutralisées) avec journal. */
export function visualClone(fight: GladiatroolFight): GladiatroolFight {
  const c = planningClone(fight, 'average', 'never');
  c.state.setEventLog(true);
  return c;
}

/** Carte d'un plan : actions tracées et, en option, passage des monstres qui suivent. */
export function planCard(
  fight: GladiatroolFight,
  plan: PlanAlternative,
  o: { key: string; title: string; actorId: number; actorName: string; policy: ChoicePolicy; planOptions: PlanOptions; interlude: boolean },
): PlanCard {
  const c = visualClone(fight);
  const turn = c.turn;
  const steps = simulateSteps(c, plan.actions, o.policy);
  const interlude = o.interlude ? simulateInterlude(c, o.actorId, turn, o.planOptions) : [];
  return {
    key: o.key,
    title: o.title,
    actorId: o.actorId,
    actorName: o.actorName,
    score: plan.score,
    staticScore: plan.staticScore,
    explanation: plan.explanation.split('\n'),
    summary: plan.summary,
    actions: plan.actions,
    steps,
    interlude,
  };
}
