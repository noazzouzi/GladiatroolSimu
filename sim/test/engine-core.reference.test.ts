/**
 * Valeurs de référence de SPEC §13 qui relèvent du noyau du moteur, reproduites par de VRAIS lancers sur la carte
 * réelle (données sim/data, pipeline complet : sélection des cibles, poussées, dégâts, 1163…).
 * T1, T2, T3 (avec une aura de pics minimale branchée sur les crochets), T4 (formule), T6, T8, T11, T12, T13, T16.
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import {
  applyDamage,
  castSpell,
  computeHit,
  resolveSpell,
  StatsView,
  Stat,
  type EngineHooks,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, scenarioEntity, SL, testFight } from './helpers/engineSetup.js';

function lastDamage(state: FightState, targetId: number, collision = false): number {
  const evs = state.log!.ofType('damage').filter((e) => e.targetId === targetId && e.collision === collision);
  return evs.length ? evs[evs.length - 1]!.amount : NaN;
}

function damages(state: FightState, targetId: number): number[] {
  return state.log!.ofType('damage').filter((e) => e.targetId === targetId).map((e) => e.amount);
}

/** Rend un combattant Vulnérable comme à la sortie des pics : il lance 30701 (état 5994 + 1163 ×200 'D') sur lui. */
function makeVulnerable(state: FightState, f: Fighter): void {
  resolveSpell(state, f, state.ctx.getSpell(SL.exitSpikes), f.cell);
}

const MODES: Array<[string, ConfigOverrides['rng']]> = [
  ['min', { rollMode: 'min', critMode: 'never' }],
  ['max', { rollMode: 'max', critMode: 'never' }],
  ['min critique', { rollMode: 'min', critMode: 'always' }],
  ['max critique', { rollMode: 'max', critMode: 'always' }],
];

describe('T1 — Frappe Repoussoir (archétype) sur un Trooll', () => {
  const expected = [976, 1220, 1281, 1525];
  MODES.forEach(([name, rng], i) => {
    it(`${name} : ${expected[i]}, ×2 sur Vulnérable`, () => {
      const s = testFight({ rng });
      const acro = archetype(s, 'acrobate', 300);
      const trooll = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
      const r = castSpell(s, acro.id, SL.frappe, trooll.cell);
      expect(r.ok).toBe(true);
      expect(lastDamage(s, trooll.id)).toBe(expected[i]);
      // poussée de 2 avant les dégâts (effet 0 puis effet 1)
      expect(trooll.cell).toBe(cellInDirectionOrThrow(300, 1, 4));
      const s2 = testFight({ rng });
      const a2 = archetype(s2, 'acrobate', 300);
      const t2 = monster(s2, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
      makeVulnerable(s2, t2);
      castSpell(s2, a2.id, SL.frappe, t2.cell);
      expect(lastDamage(s2, t2.id)).toBe(expected[i]! * 2);
    });
  });
});

describe('T2 — Impact au centre / à 1 case / à 2 cases', () => {
  it.each([
    ['min', { rollMode: 'min', critMode: 'never' }, [4148, 3733, 3318]],
    ['max', { rollMode: 'max', critMode: 'never' }, [4514, 4062, 3611]],
  ] as const)('%s', (_n, rng, exp) => {
    const s = testFight({ rng: rng as ConfigOverrides['rng'] });
    const domp = archetype(s, 'dompteur', 300);
    const x = cellInDirectionOrThrow(300, 1, 3);
    const center = monster(s, M.troollibre, x);
    const one = monster(s, M.troollibre, cellInDirectionOrThrow(x, 1, 1));
    const two = monster(s, M.troollibre, cellInDirectionOrThrow(x, 7, 2));
    expect(castSpell(s, domp.id, SL.impact, x).ok).toBe(true);
    expect([lastDamage(s, center.id), lastDamage(s, one.id), lastDamage(s, two.id)]).toEqual(exp);
  });
});

describe('T3 / T6 — Videur (Acrobate sur 314, Troolls sur 242 et 358)', () => {
  function setup(overrides: ConfigOverrides = {}, hooks?: EngineHooks) {
    const s = testFight(overrides, hooks);
    const acro = archetype(s, 'acrobate', 314);
    for (const c of [286, 287, 315]) archetype(s, 'dompteur', c);
    const t1 = monster(s, M.troollibre, 242);
    const t2 = monster(s, M.troollibre, 358);
    return { s, acro, t1, t2 };
  }

  it('T6 : Videur sur 256 puis 372 → 242 → 199 et 358 → 402, tous deux dans les pics', () => {
    const { s, acro, t1, t2 } = setup();
    expect(castSpell(s, acro.id, SL.videur, 256).ok).toBe(true);
    expect(castSpell(s, acro.id, SL.videur, 372).ok).toBe(true);
    expect([t1.cell, t2.cell]).toEqual([199, 402]);
    expect(s.ctx.grid.isSpike(199) && s.ctx.grid.isSpike(402)).toBe(true);
    // cible latérale du T (1 case du centre) : 59 × 61 − 10 %
    expect(lastDamage(s, t1.id)).toBe(3239);
  });

  /** Aura des pics minimale (test des crochets) : à l'entrée, l'entité de scénario lance 30390 niv. 2 sur la case. */
  function spikesHooks(): EngineHooks {
    return {
      onEnterCell(state, f, cell, from) {
        const grid = state.ctx.grid;
        if (!grid.isSpike(cell) || (from >= 0 && grid.isSpike(from))) return;
        const sce = state.fighters.find((x) => x.kind === 'scenario')!;
        resolveSpell(state, sce, state.ctx.getSpell(SL.spikesEntry), cell, { depth: 1 });
      },
    };
  }

  it('T3 : Videur critique (jet 72), poussée dans les pics : −2 000 puis −7 904 (3 952 × 2), total 9 904', () => {
    const { s, acro, t1 } = setup({ rng: { rollMode: 'min', critMode: 'always' } }, spikesHooks());
    scenarioEntity(s);
    const hp0 = t1.hp;
    expect(castSpell(s, acro.id, SL.videur, 256).critical).toBe(true);
    expect(t1.cell).toBe(199);
    expect(damages(s, t1.id)).toEqual([2000, 7904]);
    expect(hp0 - t1.hp).toBe(9904);
    expect(t1.hasState(5994) && t1.hasState(5902)).toBe(true);
  });

  it('T3 variante spikes.auraAppliesMidSpell = false : l’aura est appliquée après le sort (3 952 puis 2 000)', () => {
    const { s, acro, t1 } = setup(
      { rng: { rollMode: 'min', critMode: 'always' }, spikes: { auraAppliesMidSpell: false } },
      spikesHooks(),
    );
    scenarioEntity(s);
    castSpell(s, acro.id, SL.videur, 256);
    expect(damages(s, t1.id)).toEqual([3952, 2000]);
  });
});

describe('T4 — Grondement critique, jet 99, sur un Trooll Vulnérable : 12 078', () => {
  it('formule (jet imposé) et bornes du sort réel', () => {
    const caster = new StatsView({ isPlayer: true }, { [Stat.STRENGTH]: 6000 });
    const target = new StatsView({ isPlayer: false, hp: 25000, maxHp: 25000 });
    const hit = computeHit(99, 100, caster, target, { melee: false, criticalEffect: true, multipliers: [{ value: 200, triggers: ['D'] }] });
    expect(hit.final).toBe(12078);
    for (const [rng, exp] of [
      [{ rollMode: 'min', critMode: 'always' }, 98 * 61 * 2],
      [{ rollMode: 'max', critMode: 'always' }, 110 * 61 * 2],
    ] as const) {
      const s = testFight({ rng: rng as ConfigOverrides['rng'] });
      const d = archetype(s, 'dompteur', 300);
      const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 7, 3));
      makeVulnerable(s, t);
      castSpell(s, d.id, SL.grondement, t.cell);
      expect(lastDamage(s, t.id)).toBe(exp);
    }
  });
});

describe('T8 — collisions (archétype : 283 par case restante, entité percutée 141)', () => {
  it('cible poussée contre un Trooll avec 1 case restante : 283 puis 141 ; non doublé sur Vulnérable', () => {
    for (const vulnerable of [false, true]) {
      const s = testFight();
      const acro = archetype(s, 'acrobate', 300);
      const a = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 1));
      const b = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      if (vulnerable) makeVulnerable(s, a);
      castSpell(s, acro.id, SL.frappe, a.cell);
      expect(a.cell).toBe(cellInDirectionOrThrow(300, 1, 2));
      expect(lastDamage(s, a.id, true)).toBe(283);
      expect(lastDamage(s, b.id, true)).toBe(141);
      expect(lastDamage(s, a.id, false)).toBe(vulnerable ? 1952 : 976);
    }
  });

  it('2 cases restantes : 566 ; chaîne de 3 : 566 / 283 / 141', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const a = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 1));
    const b = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    const c = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    castSpell(s, acro.id, SL.frappe, a.cell);
    expect([lastDamage(s, a.id, true), lastDamage(s, b.id, true), lastDamage(s, c.id, true)]).toEqual([566, 283, 141]);
    expect(a.cell).toBe(cellInDirectionOrThrow(300, 1, 1));
  });

  it('poussée par un Trooll (niveau 200, 0 DoPou) : 33 par case restante', () => {
    const s = testFight();
    const art = monster(s, M.artroolleur, 300);
    const p = archetype(s, 'magicien', cellInDirectionOrThrow(300, 3, 3));
    archetype(s, 'dompteur', cellInDirectionOrThrow(300, 3, 4));
    castSpell(s, art.id, SL.tirArtroollerie, p.cell);
    expect(lastDamage(s, p.id, true)).toBe(66);
  });
});

describe('T11 — PV effectifs dans les pics ((PV − 2 000) / 2)', () => {
  it.each([
    [M.troollibre, 11500],
    [M.artroolleur, 8500],
    [M.nitrooll, 10000],
    [M.mama, 74000],
  ])('monstre %i : %i', (monsterId, eff) => {
    const s = testFight();
    const sce = scenarioEntity(s);
    const acro = archetype(s, 'acrobate', 300);
    const m = monster(s, monsterId, s.ctx.data.map.spikes.cells[0]!);
    resolveSpell(s, sce, s.ctx.getSpell(SL.spikesEntry), m.cell);
    expect(m.hp).toBe(m.monster!.stats.hp - 2000);
    const survive = s.clone();
    applyDamage(survive, survive.fighter(acro.id), survive.fighter(m.id), eff - 1, { actionId: 100 });
    expect(survive.fighter(m.id).alive).toBe(true);
    expect(survive.fighter(m.id).hp).toBe(2);
    applyDamage(s, acro, m, eff, { actionId: 100 });
    expect(m.alive).toBe(false);
  });
});

describe('T12 — Relâchement de Fureur +100 sur la Mama Vulnérable', () => {
  it.each([
    ['min', 35014, { rollMode: 'min', critMode: 'never' }],
    ['max', 36844, { rollMode: 'max', critMode: 'never' }],
    ['min critique', 41114, { rollMode: 'min', critMode: 'always' }],
    ['max critique', 42944, { rollMode: 'max', critMode: 'always' }],
  ] as const)('%s : %i', (_n, exp, rng) => {
    const s = testFight({ rng: rng as ConfigOverrides['rng'] });
    const d = archetype(s, 'dompteur', 300, [SL.frappe, SL.impact, SL.relachement]);
    const mama = monster(s, M.mama, cellInDirectionOrThrow(300, 5, 4));
    makeVulnerable(s, mama);
    for (let k = 0; k < 4; k++) resolveSpell(s, d, s.ctx.getSpell(SL.relachementGrowth), d.cell);
    expect(castSpell(s, d.id, SL.relachement, mama.cell).ok).toBe(true);
    expect(lastDamage(s, mama.id)).toBe(exp);
    // sort unique : il s'oublie lui-même (3406)
    expect(d.knowsSpell(SL.relachement)).toBe(false);
  });
});

describe('T13 — Pulsation d’Énergie centrée sur 300 : soins à 90 % sur les 4 cases de départ', () => {
  it.each([
    ['min', 2415, { rollMode: 'min', critMode: 'never' }],
    ['max', 2635, { rollMode: 'max', critMode: 'never' }],
  ] as const)('%s : %i par allié', (_n, exp, rng) => {
    const s = testFight({ rng: rng as ConfigOverrides['rng'] });
    const mag = archetype(s, 'magicien', cellInDirectionOrThrow(300, 0, 1));
    const allies = [286, 287, 314, 315].map((c) => archetype(s, 'dompteur', c));
    for (const a of allies) a.hp = 20000;
    expect(castSpell(s, mag.id, SL.pulsation, 300).ok).toBe(true);
    expect(allies.map((a) => a.hp - 20000)).toEqual([exp, exp, exp, exp]);
    expect(mag.hp).toBe(mag.maxHp);
  });
});

describe('T16 — Tir d’Artroollerie sur un joueur hors des pics', () => {
  it.each([
    ['min', 1736, { rollMode: 'min', critMode: 'never' }],
    ['max', 2015, { rollMode: 'max', critMode: 'never' }],
    ['min critique', 2077, { rollMode: 'min', critMode: 'always' }],
    ['max critique', 2387, { rollMode: 'max', critMode: 'always' }],
  ] as const)('%s : %i', (_n, exp, rng) => {
    const s = testFight({ rng: rng as ConfigOverrides['rng'] });
    const art = monster(s, M.artroolleur, 300);
    const p = archetype(s, 'acrobate', cellInDirectionOrThrow(300, 3, 4));
    expect(castSpell(s, art.id, SL.tirArtroollerie, p.cell).ok).toBe(true);
    expect(lastDamage(s, p.id)).toBe(exp);
  });
});
