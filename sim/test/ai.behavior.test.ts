/**
 * IA des monstres — comportements ciblés (profils de ``ai.profiles``, règles ``ai.*``) : Troollibre au contact,
 * Artroolleur à distance, Nitrooll qui soigne, tours passés (pics, cibles hors de portée), Mama au T8, mode glouton,
 * focalisation, entrée volontaire dans les pics.
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import { distance, inLine } from '../src/geometry/index.js';
import { Board, boardCanCastOn, boardCast, chooseFocus, aiSettingsFor, createMonsterAi, monsterAi } from '../src/ai/index.js';
import { newFight, QUIET } from './helpers/scenarioSetup.js';
import { damageBy, freeCellAt, freeNeighbour, relocate, sendPlayersAway, untilMonsterTurn } from './helpers/aiSetup.js';

const TROOLLPOLINE = 80483;
const ASPIRATROOLL = 80484;
const TIR = 80486;
const MORTROOLL = 80487;
const TROOLL_DE_MAGIE = 80494;
const MAMA_SPELLS = [80488, 80491, 80495, 80497, 80498];

function casts(fight: ReturnType<typeof newFight>, casterId: number, since: number) {
  return fight.state.log!.events.slice(since).filter((e) => e.type === 'cast' && e.casterId === casterId && e.depth === 0) as { spellLevelId: number; cell: number }[];
}

function walks(fight: ReturnType<typeof newFight>, id: number, since: number) {
  return fight.state.log!.events.slice(since).filter((e) => e.type === 'move' && e.fighterId === id && e.kind === 'walk') as { from: number; to: number }[];
}

describe('Troollibre (mêlée)', () => {
  it('au contact d’un joueur : Patroolleur puis frappe (Troollpoline / Aspiratrooll)', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const acro = fight.getPlayers()[0]!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeNeighbour(fight, t.cell));
    const hp0 = acro.hp;
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    const ids = casts(fight, t.id, since).map((c) => c.spellLevelId);
    expect(ids).toContain(80485); // Patroolleur : un ennemi est atteignable
    expect(ids.some((x) => x === TROOLLPOLINE || x === ASPIRATROOLL)).toBe(true);
    expect(acro.hp).toBeLessThan(hp0 - 3000);
    expect(damageBy(fight, t.id, since)).toBeGreaterThan(3000);
  });

  it('se rapproche (PM) pour frapper un joueur à 4 cases, sans entrer dans les pics', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const acro = fight.getPlayers()[0]!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeCellAt(fight, t.cell, 4, 4));
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    const w = walks(fight, t.id, since);
    expect(w.length).toBeGreaterThan(0);
    expect(damageBy(fight, t.id, since)).toBeGreaterThan(0);
    for (const m of fight.state.log!.events.slice(since)) {
      if (m.type === 'move' && m.fighterId === t.id && m.kind === 'walk') for (const c of m.path) expect(fight.ctx.grid.isSpike(c)).toBe(false);
    }
  });

  it('mode glouton (ai.sequenceMode = greedy) : frappe aussi', () => {
    const fight = newFight({ ...QUIET, ai: { sequenceMode: 'greedy' } } as ConfigOverrides, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const acro = fight.getPlayers()[0]!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeNeighbour(fight, t.cell));
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    expect(damageBy(fight, t.id, since)).toBeGreaterThan(3000);
  });
});

describe('Artroolleur (artillerie)', () => {
  it('tire à distance depuis sa case (moveBeforeCast faux) sans venir au contact', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const a = untilMonsterTurn(fight, 'Artroolleur', 2);
    const dom = fight.getPlayers()[1]!;
    sendPlayersAway(fight, [a.cell], 14, [dom]);
    relocate(fight, dom, freeCellAt(fight, a.cell, 5, 6, true));
    const start = a.cell;
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    const cs = casts(fight, a.id, since);
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.every((c) => c.spellLevelId === TIR || c.spellLevelId === MORTROOLL)).toBe(true);
    // premier lancer depuis sa case de départ : aucune marche avant
    const firstCast = fight.state.log!.events.findIndex((e, k) => k >= since && e.type === 'cast' && e.casterId === a.id);
    const firstWalk = fight.state.log!.events.findIndex((e, k) => k >= since && e.type === 'move' && e.fighterId === a.id && e.kind === 'walk');
    expect(firstWalk === -1 || firstWalk > firstCast).toBe(true);
    expect(damageBy(fight, a.id, since)).toBeGreaterThan(1500);
    expect(distance(a.cell, dom.cell)).toBeGreaterThanOrEqual(2);
    void start;
  });
});

describe('Nitrooll (soutien)', () => {
  it('soigne un allié blessé (Trooll de Magie)', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const n = untilMonsterTurn(fight, 'Nitrooll', 3);
    sendPlayersAway(fight, [n.cell], 14);
    const ally = fight.getLivingMonsters().find((m) => m.id !== n.id && m.id !== fight.scenario.mamaId)!;
    relocate(fight, ally, freeCellAt(fight, n.cell, 2, 3, true));
    ally.hp = Math.floor(ally.maxHp / 2);
    const hp0 = ally.hp;
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    const heals = fight.state.log!.events.slice(since).filter((e) => e.type === 'heal' && e.sourceId === n.id && e.targetId === ally.id);
    expect(heals.length).toBeGreaterThan(0);
    expect((heals[0] as { spellLevelId: number }).spellLevelId).toBe(TROOLL_DE_MAGIE);
    expect(ally.hp).toBeGreaterThan(hp0);
  });
});

describe('poussées vers les pics (ai.spikePushWeight)', () => {
  it('Nitrooll : pousse un joueur dans les pics quand une poussée le permet', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const n = untilMonsterTurn(fight, 'Nitrooll', 3);
    sendPlayersAway(fight, [n.cell], 14);
    const grid = fight.ctx.grid;
    const coup = fight.ctx.getSpell(80493);
    const dom = fight.getPlayers()[1]!;
    // case d'où Coup de Trooll (repousse 3) enverrait le joueur dans les pics, d'après le plateau
    let target = -1;
    for (const c of grid.walkableCells) {
      if (grid.isSpike(c) || fight.state.fighterAt(c) || !inLine(c, n.cell) || distance(c, n.cell) > 6) continue;
      const clone = fight.clone({ keepLog: false });
      relocate(clone, clone.state.fighters[dom.id]!, c);
      const b = Board.fromState(clone.state);
      b.setActor(n.id);
      if (!boardCanCastOn(b, coup, c)) continue;
      boardCast(b, coup, c);
      if (b.entered[dom.id]) {
        target = c;
        break;
      }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    relocate(fight, dom, target);
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    expect(grid.isSpike(dom.cell) || fight.state.log!.events.slice(since).some((e) => e.type === 'damage' && e.targetId === dom.id && e.amount >= 2000 && e.sourceId !== n.id)).toBe(true);
  });
});

describe('tours passés', () => {
  function inSpikesSetup(overrides: ConfigOverrides) {
    const fight = newFight({ ...QUIET, ...overrides } as ConfigOverrides, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const spike = fight.ctx.data.map.spikes.cells.find((c) => fight.ctx.grid.isWalkable(c) && !fight.state.fighterAt(c) && distance(c, t.cell) <= 3)!;
    relocate(fight, t, spike);
    expect(fight.ctx.grid.isSpike(t.cell)).toBe(true);
    const acro = fight.getPlayers()[0]!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeCellAt(fight, t.cell, 4, 5));
    return { fight, t };
  }

  it('dans les pics (ai.skipIfInSpikes) : ne bouge pas ; message « dans les pics »', () => {
    const { fight, t } = inSpikesSetup({});
    const cell = t.cell;
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    expect(walks(fight, t.id, since)).toHaveLength(0);
    expect(t.cell).toBe(cell);
    expect(fight.describeLog().some((l) => l.includes('dans les pics : ne se déplace pas'))).toBe(true);
  });

  it('dans les pics sans la règle : sort et attaque', () => {
    const { fight, t } = inSpikesSetup({ ai: { skipIfInSpikes: false } } as ConfigOverrides);
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    expect(walks(fight, t.id, since).length).toBeGreaterThan(0);
    expect(damageBy(fight, t.id, since)).toBeGreaterThan(0);
  });

  it('aucun joueur à portée d’engagement (ai.skipIfNoTargetReachable) : ne bouge pas ; sinon il avance', () => {
    for (const skip of [true, false]) {
      const fight = newFight({ ...QUIET, ai: { skipIfNoTargetReachable: skip } } as ConfigOverrides, { seed: 3 });
      const t = untilMonsterTurn(fight, 'Troollibre', 1);
      sendPlayersAway(fight, [t.cell], 11);
      const near0 = Math.min(...fight.getPlayers().map((p) => distance(p.cell, t.cell)));
      const since = fight.state.log!.events.length;
      fight.stepMonsterTurn(monsterAi);
      const near1 = Math.min(...fight.getPlayers().map((p) => distance(p.cell, t.cell)));
      if (skip) {
        expect(walks(fight, t.id, since)).toHaveLength(0);
        expect(fight.describeLog().some((l) => l.includes('aucune cible à portée'))).toBe(true);
      } else expect(near1).toBeLessThan(near0);
    }
  });

  it('ai.engageRadius : rayon d’engagement explicite', () => {
    const fight = newFight({ ...QUIET, ai: { engageRadius: 2 } } as ConfigOverrides, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const acro = fight.getPlayers()[0]!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeCellAt(fight, t.cell, 4, 4));
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    expect(walks(fight, t.id, since)).toHaveLength(0);
    expect(damageBy(fight, t.id, since)).toBe(0);
  });
});

describe('Mama Troollette', () => {
  it('au T8 (après son arrivée et le Rassemblement) : frappe au moins un joueur avec ses sorts', () => {
    const fight = newFight(QUIET, { seed: 5 });
    const mama = untilMonsterTurn(fight, 'Mama', 8);
    expect(mama.cell).not.toBe(fight.ctx.data.boss.waitCell);
    const since = fight.state.log!.events.length;
    fight.stepMonsterTurn(monsterAi);
    const cs = casts(fight, mama.id, since);
    expect(cs.length).toBeGreaterThan(0);
    const dmg = fight.state.log!.events
      .slice(since)
      .filter((e) => e.type === 'damage' && e.sourceId === mama.id && MAMA_SPELLS.includes(e.spellLevelId))
      .reduce((s, e) => s + (e as { amount: number }).amount, 0);
    expect(dmg).toBeGreaterThan(3000);
  });

  it('en attente sur 152 (T1-T7) : l’IA n’est pas consultée', () => {
    const fight = newFight(QUIET, { seed: 5 });
    let called = 0;
    const ai = createMonsterAi({ onPlan: () => called++ });
    const mama = untilMonsterTurn(fight, 'Mama', 7);
    expect(mama.cell).toBe(fight.ctx.data.boss.waitCell);
    fight.stepMonsterTurn(ai);
    expect(called).toBe(0);
  });
});

describe('focalisation (ai.focus)', () => {
  it('lowestHp : PV effectifs les plus bas ; nearest : le plus proche ; maxDamage : aucune (sauf la Mama)', () => {
    for (const focus of ['lowestHp', 'nearest', 'maxDamage'] as const) {
      const fight = newFight({ ...QUIET, ai: { focus } } as ConfigOverrides, { seed: 3 });
      const t = untilMonsterTurn(fight, 'Troollibre', 1);
      const [acro, d1] = fight.getPlayers();
      d1!.hp = 5000;
      const b = Board.fromState(fight.state);
      b.setActor(t.id);
      const f = chooseFocus(b, t.id, aiSettingsFor(fight.ctx, t));
      if (focus === 'lowestHp') expect(f).toBe(d1!.id);
      else if (focus === 'nearest') {
        const best = Math.min(...fight.getPlayers().map((p) => distance(p.cell, t.cell)));
        expect(distance(fight.state.fighters[f]!.cell, t.cell)).toBe(best);
      } else expect(f).toBe(-1);
      void acro;
    }
  });
});
