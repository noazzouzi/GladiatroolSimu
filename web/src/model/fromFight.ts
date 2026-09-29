/**
 * Conversion d'un état de combat en SITUATION (docs/FORMAT_SITUATION.md) : l'état exact d'une simulation ou d'un
 * plan appliqué devient éditable et exportable. Conversion avec pertes, comme le format : les envoûtements autres que
 * Vulnérable / Inébranlable, les relances et les compteurs de l'objectif en cours ne sont pas décrits.
 */
import type { Fighter } from '../../../sim/src/engine/index.js';
import { giftCells, type GladiatroolFight } from '../../../sim/src/scenario/index.js';
import type { Situation } from './types.js';

const VULNERABLE = 5994;
const UNSHAKABLE = 157;
const MONSTER_TYPES: Record<number, 'troollibre' | 'artroolleur' | 'nitrooll' | 'mama'> = {
  7981: 'troollibre',
  7982: 'artroolleur',
  7983: 'nitrooll',
  7984: 'mama',
};

type SPlayer = Situation['players'][number];
type SMonster = Situation['monsters'][number];

function statesOf(f: Fighter, spike: boolean): ('vulnerable' | 'inebranlable')[] | undefined {
  const out: ('vulnerable' | 'inebranlable')[] = [];
  // dans les pics, Vulnérable vient de l'entrée (reposé par la reconstruction) : on ne le décrit que hors des pics
  if (!spike && f.hasState(VULNERABLE)) out.push('vulnerable');
  if (f.hasState(UNSHAKABLE)) out.push('inebranlable');
  return out.length ? out : undefined;
}

/** Troolls de la situation : monstres vivants hors Mama et invocations, dans l'ordre des ids. */
export function situationTrolls(fight: GladiatroolFight): Fighter[] {
  const mamaId = fight.scenario.mamaId;
  return fight.state.fighters.filter((f) => f.team === 'monsters' && f.alive && f.cell >= 0 && f.id !== mamaId && !f.isSummon && MONSTER_TYPES[f.monsterId]);
}

/** Situation décrivant l'état ``fight`` (personnage courant : joueur dont c'est le tour, sinon J1). */
export function situationFromFight(fight: GladiatroolFight, o: { seed?: number; description?: string } = {}): Situation {
  const state = fight.state;
  const sc = fight.scenario;
  const data = fight.ctx.data;
  const grid = fight.ctx.grid;
  const st = fight.getStatus();
  const players: SPlayer[] = sc.playerIds.map((id) => {
    const f = state.fighters[id]!;
    const a = data.archetypes[f.archetype!]!;
    const p: SPlayer = { archetype: f.archetype!, name: f.name };
    if (!f.alive) return { ...p, dead: true };
    p.cell = f.cell;
    if (f.hp !== f.maxHp) p.hp = f.hp;
    if (f.erodedHp) p.eroded = f.erodedHp;
    const upgradedFrom = new Map(Object.entries(a.upgrades).map(([base, u]) => [u.to, Number(base)]));
    const spells: number[] = [];
    const upgrades: number[] = [];
    const uniques: number[] = [];
    for (const s of f.spells) {
      if (s.unique) uniques.push(s.spellLevelId);
      else if (upgradedFrom.has(s.spellLevelId)) {
        spells.push(upgradedFrom.get(s.spellLevelId)!);
        upgrades.push(upgradedFrom.get(s.spellLevelId)!);
      } else spells.push(s.spellLevelId);
    }
    p.spells = spells;
    if (upgrades.length) p.upgrades = upgrades;
    if (uniques.length) p.uniques = uniques;
    // Acclamations : une carte = un envoûtement de caractéristique du sort « réel » de la carte
    const bonuses: Record<string, number> = {};
    for (const card of a.acclamations) {
      const n = f.buffs.filter((b) => b.kind === 'stat' && b.spellLevelId === card.realSpellLevel).length;
      if (n) bonuses[card.stat] = (bonuses[card.stat] ?? 0) + n;
    }
    if (Object.keys(bonuses).length) p.bonuses = bonuses;
    const states = statesOf(f, grid.isSpike(f.cell));
    if (states) p.states = states;
    if (st.kind === 'playerTurn' && st.fighterId === id) {
      if (f.ap !== f.maxAp) p.ap = f.ap;
      if (f.mp !== f.maxMp) p.mp = f.mp;
    }
    return p;
  });
  const monsters: SMonster[] = situationTrolls(fight).map((f) => {
    const m: SMonster = { type: MONSTER_TYPES[f.monsterId]!, cell: f.cell };
    if (f.hp !== f.maxHp) m.hp = f.hp;
    if (f.erodedHp) m.eroded = f.erodedHp;
    const states = statesOf(f, grid.isSpike(f.cell));
    if (states) m.states = states;
    return m;
  });
  const mama = sc.mamaId >= 0 ? state.fighters[sc.mamaId] : undefined;
  if (mama) {
    if (!mama.alive) monsters.push({ type: 'mama', dead: true });
    else {
      // en attente sur 152 (avant le T8) : case non jouable, non décrite
      const m: SMonster = mama.cell === data.boss.waitCell ? { type: 'mama' } : { type: 'mama', cell: mama.cell };
      if (mama.hp !== mama.maxHp) m.hp = mama.hp;
      if (mama.erodedHp) m.eroded = mama.erodedHp;
      const states = statesOf(mama, grid.isSpike(mama.cell));
      if (states) m.states = states;
      monsters.push(m);
    }
  }
  const currentIdx = st.kind === 'playerTurn' ? sc.playerIds.indexOf(st.fighterId) : players.findIndex((p) => !p.dead);
  const gifts = giftCells(state, sc);
  return {
    version: 1,
    description: o.description ?? `État au tour ${fight.turn}`,
    seed: o.seed ?? 1,
    turn: fight.turn,
    players,
    monsters,
    current: `J${Math.max(0, currentIdx) + 1}`,
    objectives: { completed: sc.completed.map((c) => c.objectiveId), active: sc.active },
    ...(gifts.length ? { gifts: [...new Set(gifts)].sort((a, b) => a - b) } : {}),
  };
}
