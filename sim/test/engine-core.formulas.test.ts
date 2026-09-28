/**
 * Formules pures du moteur (sim/src/engine/formulas.ts) contre la référence Python tools/mechanics/damage.py
 * (fixtures : python3 tools/mechanics/export_engine_fixtures.py), plus les plages de référence de SPEC §13.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  Stat,
  StatsView,
  computeHit,
  criticalChance,
  healAmount,
  receiveDamage,
  receivedMultiplier,
  senderDamage,
  defaultHitContext,
  type StatIndex,
} from '../src/engine/index.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const fx = JSON.parse(readFileSync(`${ROOT}sim/test/fixtures/engine/damage.json`, 'utf-8')) as any;

function view(v: Record<string, any>): StatsView {
  const s = new StatsView({
    level: v.level ?? 0,
    isPlayer: v.isPlayer,
    hp: v.hp,
    maxHp: v.maxHp,
    erodedHp: v.erodedHp ?? 0,
    shield: v.shield ?? 0,
  });
  s.values.fill(0);
  for (const [k, x] of Object.entries(v)) {
    if (k in Stat) s.set(Stat[k as keyof typeof Stat] as StatIndex, x as number);
  }
  return s;
}

describe('formules (référence damage.py)', () => {
  it(`sender_damage : ${fx.sender.length} cas`, () => {
    const bad: string[] = [];
    for (const c of fx.sender) {
      const got = senderDamage(c.roll, c.action, view(c.caster), { criticalEffect: c.critical, baseDamageBonus: c.baseBonus });
      if (got !== c.expected) bad.push(`action ${c.action} jet ${c.roll} : ${got} ≠ ${c.expected}`);
    }
    expect(bad).toEqual([]);
  });

  it(`receive_damage : ${fx.receive.length} cas`, () => {
    const bad: string[] = [];
    for (const c of fx.receive) {
      const got = receiveDamage(c.raw, c.action, view(c.caster), view(c.target), {
        melee: c.melee,
        criticalEffect: c.critical,
        multipliers: c.multipliers,
        invulnerable: c.invulnerable,
        allySource: c.allySource,
        collision: c.collision,
      });
      const e = c.expected;
      const ok =
        got.raw === e.raw &&
        got.afterResist === e.afterResist &&
        got.final === e.final &&
        got.shieldAbsorbed === e.shieldAbsorbed &&
        got.lifeLoss === e.lifeLoss &&
        got.eroded === e.eroded &&
        got.lifeStealHeal === e.lifeStealHeal &&
        got.invulnerable === e.invulnerable;
      if (!ok) bad.push(`action ${c.action} brut ${c.raw} : ${JSON.stringify(got)} ≠ ${JSON.stringify(e)}`);
    }
    expect(bad).toEqual([]);
  });

  it(`chaîne complète (lanceur → dégressivité → réception) : ${fx.hit.length} cas`, () => {
    const bad: string[] = [];
    for (const c of fx.hit) {
      const got = computeHit(c.roll, c.action, view(c.caster), view(c.target), {
        melee: c.melee,
        criticalEffect: c.critical,
        aoeMalusPct: c.aoeMalus,
      });
      const e = c.expected;
      if (got.final !== e.final || got.lifeLoss !== e.lifeLoss || got.eroded !== e.eroded || got.lifeStealHeal !== e.lifeStealHeal) {
        bad.push(`action ${c.action} jet ${c.roll} malus ${c.aoeMalus} : ${JSON.stringify(got)} ≠ ${JSON.stringify(e)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it(`heal_amount : ${fx.heal.length} cas`, () => {
    const bad: string[] = [];
    for (const c of fx.heal) {
      const got = healAmount(c.value, view(c.target), view(c.caster), c.action, c.incurable);
      if (got !== c.expected) bad.push(`action ${c.action} valeur ${c.value} : ${got} ≠ ${c.expected}`);
    }
    expect(bad).toEqual([]);
  });

  it('plages de référence (T1, T2, T16) identiques à damage.py', () => {
    const arche = view({ STRENGTH: 6000, isPlayer: true, hp: 30000, maxHp: 30000, EROSION: 10 });
    const art = view({ STRENGTH: 3000, isPlayer: false, hp: 19000, maxHp: 19000, EROSION: 10 });
    const big = (player: boolean) => view({ isPlayer: player, hp: 1e9, maxHp: 1e9, EROSION: 10 });
    const range = (lo: number, hi: number, caster: StatsView, target: StatsView, o: any = {}) => [
      computeHit(lo, 100, caster, target, { melee: false, ...o }).final,
      computeHit(hi, 100, caster, target, { melee: false, ...o }).final,
    ];
    const ref = Object.fromEntries(fx.reference.map((r: any) => [r.name, r.range]));
    const vul = [{ value: 200, triggers: ['D'] }];
    expect(range(16, 20, arche, big(false))).toEqual(ref['T1 Frappe Repoussoir']);
    expect(range(21, 25, arche, big(false), { criticalEffect: true })).toEqual(ref['T1 Frappe Repoussoir critique']);
    expect(range(16, 20, arche, big(false), { multipliers: vul })).toEqual(ref['T1 Frappe Repoussoir Vulnérable']);
    expect(range(68, 74, arche, big(false))).toEqual(ref['T2 Impact centre']);
    expect(range(56, 65, art, big(true))).toEqual(ref["T16 Tir d'Artroollerie"]);
    expect(range(67, 77, art, big(true), { criticalEffect: true })).toEqual(ref["T16 Tir d'Artroollerie critique"]);
    // valeurs de SPEC §13
    expect(ref['T1 Frappe Repoussoir']).toEqual([976, 1220]);
    expect(ref['T1 Frappe Repoussoir critique']).toEqual([1281, 1525]);
    expect(ref["T16 Tir d'Artroollerie"]).toEqual([1736, 2015]);
    expect(ref["T16 Tir d'Artroollerie critique"]).toEqual([2077, 2387]);
    // T2 : dégressivité entière 10 % / 20 %
    expect(range(68, 74, arche, big(false), { aoeMalusPct: 10 })).toEqual([3733, 4062]);
    expect(range(68, 74, arche, big(false), { aoeMalusPct: 20 })).toEqual([3318, 3611]);
  });

  it('multiplicateurs 1163 : produit tronqué, D hors poussée, PMD seulement pour la cible poussée', () => {
    const h = defaultHitContext();
    expect(receivedMultiplier([{ value: 200, triggers: ['D'] }], 100, h)).toBe(200);
    expect(receivedMultiplier([{ value: 200, triggers: ['D'] }, { value: 200, triggers: ['D'] }], 100, h)).toBe(400);
    expect(receivedMultiplier([{ value: 200, triggers: ['D'] }, { value: 50, triggers: ['DBA'] }], 100, { ...h, allySource: true })).toBe(100);
    expect(receivedMultiplier([{ value: 50, triggers: ['DBA'] }], 100, h)).toBe(100);
    const col = defaultHitContext({ collision: true });
    expect(receivedMultiplier([{ value: 200, triggers: ['D'] }], 80, col)).toBe(100);
    expect(receivedMultiplier([{ value: 200, triggers: ['PD'] }], 80, col)).toBe(200);
    expect(receivedMultiplier([{ value: 200, triggers: ['PMD'] }], 80, col)).toBe(200);
    expect(receivedMultiplier([{ value: 200, triggers: ['PMD'] }], 80, { ...col, pushIndex: 1 })).toBe(100);
    expect(receivedMultiplier([{ value: 200, triggers: ['D'] }], 90, h)).toBe(100);
  });

  it('taux critique : 0 si le sort a 0 %, sinon sort + stat plafonné à 100', () => {
    expect(criticalChance(0, 50)).toBe(0);
    expect(criticalChance(30, 10)).toBe(40);
    expect(criticalChance(30, 90)).toBe(100);
    expect(criticalChance(30, -50)).toBe(0);
  });
});
