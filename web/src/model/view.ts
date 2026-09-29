/**
 * Vue sérialisable d'un combat pour l'interface (worker) : combattants (fixe + variable), statut, ordre de jeu,
 * objectifs, cadeaux, Mama. Lecture seule de l'état du moteur et du scénario.
 */
import type { Fighter } from '../../../sim/src/engine/index.js';
import { giftCells, type GladiatroolFight } from '../../../sim/src/scenario/index.js';
import type { FighterDyn, FighterStatic, FightView, MonsterType, StatusView } from './types.js';

const VULNERABLE = 5994;
const UNSHAKABLE_STATE = 157;
const MONSTER_TYPE: Record<number, MonsterType> = { 7981: 'troollibre', 7982: 'artroolleur', 7983: 'nitrooll', 7984: 'mama' };
const SHORT: Record<number, string> = { 7981: 'T', 7982: 'A', 7983: 'N' };

/** Combattant affichable (hors entité de scénario et corps sans rôle). */
export function isShown(fight: GladiatroolFight, f: Fighter): boolean {
  if (f.team === 'scenario') return false;
  if (fight.scenario.playerIds.includes(f.id)) return true;
  return f.team === 'monsters' || f.isSummon;
}

/** Partie fixe d'un combattant. */
export function fighterStatic(fight: GladiatroolFight, f: Fighter): FighterStatic {
  const pi = fight.scenario.playerIds.indexOf(f.id);
  if (pi >= 0) return { id: f.id, name: f.name, short: `J${pi + 1}`, kind: 'player', archetype: f.archetype ?? undefined, playerIndex: pi };
  if (f.isSummon) return { id: f.id, name: f.name, short: 'Inv', kind: 'summon' };
  const type = MONSTER_TYPE[f.monsterId];
  if (type === 'mama') return { id: f.id, name: f.name, short: 'MAM', kind: 'mama', monsterType: 'mama' };
  const num = /(\d+)\s*$/.exec(f.name)?.[1] ?? '';
  return { id: f.id, name: f.name, short: `${SHORT[f.monsterId] ?? 'M'}${num}`, kind: 'monster', ...(type ? { monsterType: type } : {}) };
}

/** Partie variable d'un combattant. */
export function fighterDyn(fight: GladiatroolFight, f: Fighter): FighterDyn {
  const grid = fight.ctx.grid;
  const on = f.alive && f.cell >= 0;
  return {
    id: f.id,
    cell: on ? f.cell : -1,
    hp: f.alive ? f.hp : 0,
    maxHp: f.maxHp,
    alive: f.alive,
    vulnerable: f.alive && f.hasState(VULNERABLE),
    unshakable: f.alive && (f.unshakable || f.hasState(UNSHAKABLE_STATE)),
    invulnerable: f.alive && f.invulnerable,
    inSpikes: on && grid.isSpike(f.cell),
    shield: f.alive ? f.shield : 0,
  };
}

/** Combattants affichables, dans l'ordre des ids (les ids ne changent jamais au cours d'un combat). */
export function shownFighters(fight: GladiatroolFight): Fighter[] {
  return fight.state.fighters.filter((f) => isShown(fight, f) && (f.alive || fight.scenario.playerIds.includes(f.id)));
}

export function statusView(fight: GladiatroolFight): StatusView {
  const st = fight.getStatus();
  const name = (id: number) => fight.state.fighters[id]?.name ?? `#${id}`;
  switch (st.kind) {
    case 'playerTurn':
      return { kind: st.kind, fighterId: st.fighterId, fighterName: name(st.fighterId), text: `Joue : ${name(st.fighterId)}` };
    case 'monsterTurn':
      return { kind: st.kind, fighterId: st.fighterId, fighterName: name(st.fighterId), text: `Joue : ${name(st.fighterId)} (monstre)` };
    case 'choice':
      return { kind: st.kind, text: `Choix en attente : ${st.choice.options.map((o) => o.label).join(' / ')}` };
    case 'ended':
      return {
        kind: st.kind,
        text: st.winner === 'players' ? 'Combat terminé : victoire' : st.winner === 'monsters' ? 'Combat terminé : défaite' : `Combat terminé (${st.reason ?? '?'})`,
      };
    default:
      return { kind: 'idle', text: 'Aucun tour en cours' };
  }
}

/**
 * Vue complète. ``sitIndexOf`` : index de chaque combattant dans la situation éditée (joueurs par rang, Troolls
 * dans l'ordre de la liste de la situation, Mama).
 */
export function fightView(fight: GladiatroolFight, sitIndexOf?: (f: Fighter) => number | undefined): FightView {
  const st = fight.getStatus();
  const currentId = st.kind === 'playerTurn' || st.kind === 'monsterTurn' ? st.fighterId : -1;
  const mamaId = fight.scenario.mamaId;
  const waitCell = fight.ctx.data.boss.waitCell;
  const fighters = shownFighters(fight).map((f) => {
    const sitIndex = sitIndexOf?.(f);
    return {
      ...fighterStatic(fight, f),
      ...fighterDyn(fight, f),
      current: f.id === currentId,
      waiting: f.id === mamaId && f.alive && f.cell === waitCell,
      ap: f.ap,
      mp: f.mp,
      maxAp: f.maxAp,
      maxMp: f.maxMp,
      ...(sitIndex !== undefined ? { sitIndex } : {}),
      spells: f.spells.map((s) => `${fight.ctx.spellName(s.spellLevelId)}${s.unique ? ' (unique)' : ''}`),
    };
  });
  const tl = fight.getTimeline();
  const obj = fight.getActiveObjective();
  const res = fight.getResult();
  return {
    turn: fight.turn,
    status: statusView(fight),
    fighters,
    timeline: tl.ids
      .map((id, i) => {
        const f = fight.state.fighters[id];
        if (!f || !isShown(fight, f)) return null;
        return { id, short: fighterStatic(fight, f).short, name: f.name, current: i === tl.index, alive: f.alive };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    objective: obj
      ? {
          id: obj.id,
          name: obj.name,
          tier: obj.tier,
          summary: obj.summary,
          counter: obj.counter,
          markedCell: obj.markedCell,
          designated: obj.designatedId >= 0 ? fight.state.fighters[obj.designatedId]?.name ?? null : null,
        }
      : null,
    completed: res.objectivesCompleted.map((o) => ({ id: o.objectiveId, name: o.name, tier: o.tier, turn: o.turn })),
    gifts: giftCells(fight.state, fight.scenario).slice().sort((a, b) => a - b),
    mama: res.mama ? { alive: res.mama.alive, hp: res.mama.hp, maxHp: res.mama.maxHp, arrived: res.mama.arrived, favour: res.mama.finalDamageBonus } : null,
    seed: fight.scenario.seed,
  };
}
