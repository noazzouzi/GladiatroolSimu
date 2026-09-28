/**
 * Ordre de jeu (ETUDE §2.4, Q1 ; config ``timeline.*``), recalculé au début de chaque tour global (après les
 * apparitions) :
 * - la Mama joue en tête (``scenario.timeline.bossPlaysFirst``), même pendant ses tours annulés ;
 * - ``alternate_spawn_order`` (défaut) : alternance J1, M1, J2, M2… ; monstres dans l'ordre de leur sous-liste
 *   (apparition ; nouveaux venus selon ``timeline.newMonstersInsertion`` : ``append`` en fin, ``after_mama`` en tête,
 *   ``by_initiative`` insérés par initiative) ; quand une équipe est épuisée, l'autre termine ;
 * - ``alternate_initiative`` : idem, monstres triés par initiative (Force : Troollibre 4 000 > Nitrooll 3 500 >
 *   Artroolleur 3 000 ; égalité : ordre de la sous-liste) ;
 * - ``monsters_after_mama`` : Mama, tous les monstres, puis les joueurs ;
 * - ``explicit`` : ordre fourni par ``FightOptions.timelineOrder``.
 * Un monstre mort libère sa place ; un joueur mort garde la sienne si ``timeline.deadPlayersKeepSlot`` (il est sauté).
 * Les invocations (Poutch) jouent juste après leur invocateur.
 */
import { Stat, type Fighter, type FightState } from '../engine/index.js';
import type { ScenarioState } from './scenarioState.js';

/** Initiative d'un monstre (proxy : Force, seule caractéristique qui distingue les Troolls). */
export function initiativeOf(f: Fighter): number {
  return f.stat(Stat.STRENGTH);
}

/** Ajoute des monstres apparus à la sous-liste des monstres (``timeline.newMonstersInsertion``). */
export function insertNewMonsters(state: FightState, sc: ScenarioState, ids: readonly number[]): void {
  if (!ids.length) return;
  const mode = state.ctx.config.timeline.newMonstersInsertion;
  const order = sc.monsterOrder.slice();
  if (mode === 'after_mama') order.unshift(...ids);
  else if (mode === 'by_initiative') {
    for (const id of ids) {
      const ini = initiativeOf(state.fighters[id]!);
      const at = order.findIndex((o) => initiativeOf(state.fighters[o]!) < ini);
      if (at < 0) order.push(id);
      else order.splice(at, 0, id);
    }
  } else order.push(...ids);
  sc.monsterOrder = order;
}

function interleave(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i < a.length) out.push(a[i]!);
    if (i < b.length) out.push(b[i]!);
  }
  return out;
}

/** Ordre de jeu du tour global qui commence (ids). */
export function computeTimeline(state: FightState, sc: ScenarioState): number[] {
  const cfg = state.ctx.config.timeline;
  const fighters = state.fighters;
  const mama = sc.mamaId >= 0 ? fighters[sc.mamaId] : undefined;
  const bossFirst = state.ctx.data.scenario.timeline.bossPlaysFirst;
  const players = sc.playerIds.filter((id) => cfg.deadPlayersKeepSlot || fighters[id]!.alive);
  let monsters = sc.monsterOrder.filter((id) => fighters[id]!.alive);
  if (mama && mama.alive && !bossFirst) monsters.unshift(mama.id);
  if (cfg.model === 'alternate_initiative') {
    const rank = new Map(monsters.map((id, i) => [id, i]));
    monsters = monsters.slice().sort((x, y) => initiativeOf(fighters[y]!) - initiativeOf(fighters[x]!) || rank.get(x)! - rank.get(y)!);
  }
  const head = mama && mama.alive && bossFirst ? [mama.id] : [];
  let base: number[];
  switch (cfg.model) {
    case 'monsters_after_mama':
      base = [...head, ...monsters, ...players];
      break;
    case 'explicit': {
      if (!sc.timelineOrder) throw new Error('timeline.model = explicit : FightOptions.timelineOrder est requis');
      base = sc.timelineOrder({ mamaId: mama && mama.alive ? mama.id : -1, playerIds: players, monsterIds: monsters, turn: state.turn });
      break;
    }
    default:
      base = [...head, ...interleave(players, monsters)];
  }
  // invocations vivantes juste après leur invocateur (ordre d'apparition)
  const out: number[] = [];
  for (const id of base) {
    if (out.includes(id)) continue;
    out.push(id);
    for (const f of fighters) {
      if (f.alive && f.summonerId === id && !base.includes(f.id) && !out.includes(f.id)) out.push(f.id);
    }
  }
  return out;
}

/**
 * Remplace la timeline au début d'un tour global (appelé depuis ``onGlobalTurn``, où le moteur a placé l'index en
 * tête, étape 'pending') : le premier combattant du nouvel ordre jouera en premier.
 */
export function applyTimelineAtGlobalTurnStart(state: FightState, ids: number[]): void {
  state.timeline = ids;
  if (state.turnStage === 'pending') state.timelineIndex = 0;
}
