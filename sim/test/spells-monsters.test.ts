/**
 * Vérification adversariale, sort par sort, des sorts des monstres (ETUDE §5-§6, note 20_monstres_boss, research/data/
 * monsters.json : damageTable) : Troollibre, Artroolleur, Nitrooll, Mama Troollette (+ Rassemblement Troollesque,
 * Faveur de la foule, invulnérabilité) — conditions de lancer, zone, dégâts (bornes min / max et critiques), poussées,
 * attirances, soins, états.
 *
 * Valeurs attendues recopiées de monsters.json (damageTable, variantes « finalXXX_effYY ») et de l'ÉTUDE.
 */
import { describe, expect, it } from 'vitest';
import {
  addFighter,
  canCast,
  castSpell,
  createEngineContext,
  createFight,
  resolveSpell,
  Stat,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { distance } from '../src/geometry/index.js';
import {
  arch,
  cast,
  collisions,
  fight,
  heals,
  hits,
  manyAp,
  mob,
  mon,
  player,
  rel,
  step,
  verifyCastRules,
  vulnerable,
  type CastExpect,
} from './helpers/spellCheck.js';

const M = { troollibre: 7981, artroolleur: 7982, nitrooll: 7983, mama: 7984 } as const;
/** Faveur de la foule V (30724 : +25 % DF permanents, état 5973), sans le reste du script (passe-tour, Enraciné…). */
const FAVOUR = 81098;

const E = (ap: number, min: number, max: number, line: boolean, los: boolean, perTurn: number, perTarget: number, interval: number, crit: number, extra: Partial<CastExpect> = {}): CastExpect => ({
  ap, min, max, line, los, perTurn, perTarget, interval, crit, ...extra,
});

const target = (s: FightState, c: number): Fighter => arch(s, 'dompteur', c, []);
const caster = (monsterId: number) => (s: FightState, c: number): Fighter => mon(s, monsterId, c);

/** Mama « active » (après son arrivée) : Faveur V seulement. */
function mama(s: FightState, cell: number): Fighter {
  const m = mon(s, M.mama, cell);
  resolveSpell(s, m, s.ctx.getSpell(FAVOUR), m.cell);
  return m;
}

// =============================================================================================
// 1. Conditions de lancer (ETUDE §5.3-§5.5, §6.8)
// =============================================================================================

const CAST_TABLE: Array<[number, number, CastExpect]> = [
  [80483, M.troollibre, E(4, 0, 0, false, false, 1, 0, 0, 40)],
  [80484, M.troollibre, E(3, 1, 2, false, true, 3, 1, 0, 30)],
  [80485, M.troollibre, E(2, 0, 0, false, false, 0, 0, 3, 0)],
  [80486, M.artroolleur, E(3, 1, 8, false, true, 2, 1, 0, 30)],
  [80487, M.artroolleur, E(4, 1, 8, false, true, 0, 0, 2, 40)],
  [80490, M.nitrooll, E(3, 1, 2, false, true, 3, 1, 0, 60)],
  [80493, M.nitrooll, E(2, 1, 6, true, true, 2, 1, 0, 0)],
  [80494, M.nitrooll, E(3, 1, 6, false, true, 2, 1, 0, 30)],
  [80496, M.nitrooll, E(3, 1, 6, false, true, 0, 0, 2, 0)],
  [80488, M.mama, E(1, 1, 6, false, true, 2, 0, 0, 30, { free: true })],
  [80495, M.mama, E(1, 1, 2, false, true, 3, 1, 0, 30)],
  [80497, M.mama, E(1, 1, 8, false, true, 1, 0, 0, 30)],
  [80498, M.mama, E(1, 0, 0, false, false, 0, 0, 2, 0)],
];

describe('conditions de lancer des sorts de monstres', () => {
  it.each(CAST_TABLE)('niveau %i (monstre %i)', (sl, monsterId, exp) => {
    verifyCastRules(sl, exp, caster(monsterId), target);
  });

  it('Trooll de Magie : PO 1–6, donc PAS de soin sur soi (l’ÉTUDE §5.5 écrit « à un allié ou lui-même »)', () => {
    const s = fight('min');
    const n = mon(s, M.nitrooll, 300);
    expect(canCast(s, n.id, 80494, 300).code).toBe('OUT_OF_RANGE');
  });
});

// =============================================================================================
// 2. Troollibre
// =============================================================================================

describe('Troollpoline (30380)', () => {
  it.each([
    ['min', 4100, 3690],
    ['max', 4756, 4280],
    ['minCrit', 4920, 4428],
    ['maxCrit', 5699, 5129],
  ] as const)('%s : anneau C2,1 — %i à 1 case, %i à 2 cases ; poussée de 3 depuis le Troollibre', (mode, d1, d2) => {
    const s = fight(mode);
    const t = mon(s, M.troollibre, 300);
    const p1 = player(s, 'dompteur', step(300, 1, 1));
    const pDiag = player(s, 'acrobate', step(300, 0, 1));
    const p2 = player(s, 'magicien', step(300, 5, 2));
    const pOut = player(s, 'magicien', step(300, 3, 3));
    const ally = mon(s, M.artroolleur, step(300, 3, 1));
    cast(s, t, 80483, 300);
    expect([hits(s, p1.id), hits(s, pDiag.id), hits(s, p2.id), hits(s, pOut.id), hits(s, ally.id)]).toEqual([[d1], [d2], [d2], [], []]);
    expect(hits(s, t.id)).toEqual([]);
    expect(p1.cell).toBe(step(300, 1, 4));
    expect(p2.cell).toBe(step(300, 5, 5));
    // diagonale exacte : ceil(3 / 2) = 2 pas diagonaux
    expect(pDiag.cell).toBe(step(300, 0, 3));
    expect(ally.cell).toBe(step(300, 3, 1));
  });

  it('avec Patroolleur (+15 % DF) : 4 715 ; sur Pugnace (−25 %) : 3 075 ; sur Vulnérable : 8 200', () => {
    const s = fight('min');
    const t = mon(s, M.troollibre, 300);
    manyAp(t);
    const p = player(s, 'acrobate', step(300, 1, 1));
    cast(s, t, 80485, 300);
    expect(t.stat(Stat.FINAL_DAMAGE)).toBe(15);
    expect(t.unshakable).toBe(true);
    cast(s, t, 80483, 300);
    expect(hits(s, p.id)).toEqual([4715]);
    const s2 = fight('min');
    const t2 = mon(s2, M.troollibre, 300);
    const p2 = player(s2, 'acrobate', step(300, 1, 1), [80511]);
    cast(s2, p2, 80511, p2.cell);
    cast(s2, t2, 80483, 300);
    expect(hits(s2, p2.id)).toEqual([3075]);
    expect(p2.cell).toBe(step(300, 1, 1));
    const s3 = fight('min');
    const t3 = mon(s3, M.troollibre, 300);
    const p3 = player(s3, 'magicien', step(300, 1, 1));
    vulnerable(s3, p3);
    cast(s3, t3, 80483, 300);
    expect(hits(s3, p3.id)).toEqual([8200]);
  });
});

describe('Aspiratrooll (30381)', () => {
  it.each([
    ['min', 2665],
    ['max', 3075],
    ['minCrit', 3198],
    ['maxCrit', 3690],
  ] as const)('%s : attire de 2 (au contact), puis vol de vie %i (soin 50 %%), puis +10 %% d’érosion 1 tour', (mode, dmg) => {
    const s = fight(mode);
    const t = mon(s, M.troollibre, 300);
    t.hp = 10000;
    const p = player(s, 'dompteur', step(300, 1, 2));
    cast(s, t, 80484, p.cell);
    expect(p.cell).toBe(step(300, 1, 1));
    expect(hits(s, p.id)).toEqual([dmg]);
    // l'érosion (+10 %) est posée APRÈS la frappe : ce coup n'érode qu'à 10 %
    expect(p.erodedHp).toBe(Math.floor(dmg / 10));
    expect(p.stat(Stat.EROSION)).toBe(20);
    expect(heals(s, t.id, true)).toEqual([Math.trunc(dmg / 2)]);
  });

  it('attire depuis la diagonale exacte (1 pas diagonal = 2 cases) : bloqué au contact', () => {
    const s = fight('min');
    const t = mon(s, M.troollibre, 300);
    const p = player(s, 'dompteur', step(300, 0, 1));
    cast(s, t, 80484, p.cell);
    expect(p.cell).toBe(step(300, 0, 1));
    expect(hits(s, p.id)).toEqual([2665]);
  });
});

describe('Patroolleur (30382)', () => {
  it('+15 % DF 2 tours et Inébranlable 1 tour sur soi (désenvoûtables)', () => {
    const s = fight('min');
    const t = mon(s, M.troollibre, 300);
    cast(s, t, 80485, 300);
    const df = t.buffs.find((b) => b.stat === Stat.FINAL_DAMAGE)!;
    const st = t.buffs.find((b) => b.stateId === 157)!;
    expect([df.value, df.duration, df.dispellable]).toEqual([15, 2, 1]);
    expect([st.duration, st.dispellable]).toEqual([1, 1]);
  });
});

// =============================================================================================
// 3. Artroolleur
// =============================================================================================

describe('Tir d’Artroollerie (30383)', () => {
  it.each([
    ['min', 1736],
    ['max', 2015],
    ['minCrit', 2077],
    ['maxCrit', 2387],
  ] as const)('%s : %i puis poussée de 2 ; collision 33 par case (niveau 200, 0 DoPou) ; ×2 sur Vulnérable', (mode, dmg) => {
    const s = fight(mode);
    const a = mon(s, M.artroolleur, 300);
    const p = player(s, 'dompteur', step(300, 1, 5));
    cast(s, a, 80486, p.cell);
    expect(hits(s, p.id)).toEqual([dmg]);
    expect(p.cell).toBe(step(300, 1, 7));
    const s2 = fight(mode);
    const a2 = mon(s2, M.artroolleur, 300);
    const p2 = player(s2, 'dompteur', step(300, 1, 7));
    vulnerable(s2, p2);
    cast(s2, a2, 80486, p2.cell);
    expect(hits(s2, p2.id)).toEqual([2 * dmg]);
    // 8 cases jouables sur l'axe : poussée de 2 depuis la 7e → 1 case, collision 33 (non doublée)
    expect(collisions(s2, p2.id)).toEqual([33]);
  });
});

describe('Mortrooll (30384)', () => {
  it.each([
    ['min', [2511, 2259, 2008, 1757]],
    ['max', [2945, 2650, 2356, 2061]],
    ['minCrit', [3131, 2817, 2504, 2191]],
    ['maxCrit', [3627, 3264, 2901, 2538]],
  ] as const)('%s : cercle C3, 100/90/80/70 %% ; ennemis seulement', (mode, exp) => {
    const s = fight(mode);
    const a = mon(s, M.artroolleur, 300);
    const T = step(300, 1, 5);
    const ps = [0, 1, 2, 3].map((k) => player(s, k % 2 ? 'acrobate' : 'magicien', k === 0 ? T : step(T, 7, k)));
    const ally = mon(s, M.troollibre, step(T, 3, 1));
    const out = player(s, 'dompteur', step(T, 3, 4));
    cast(s, a, 80487, T);
    expect(ps.map((p) => hits(s, p.id))).toEqual(exp.map((x) => [x]));
    expect([hits(s, ally.id), hits(s, out.id)]).toEqual([[], []]);
  });
});

// =============================================================================================
// 4. Nitrooll
// =============================================================================================

describe('Double Trooll (30385)', () => {
  it.each([
    ['min', [1152, 1152]],
    ['max', [1368, 1368]],
    ['minCrit', [1512, 1512]],
    ['maxCrit', [1512, 1512]],
  ] as const)('%s : deux coups de 32–38 (critique 42 + 42) puis poussée de 3', (mode, exp) => {
    const s = fight(mode);
    const n = mon(s, M.nitrooll, 300);
    const p = player(s, 'dompteur', step(300, 1, 1));
    cast(s, n, 80490, p.cell);
    expect(hits(s, p.id)).toEqual(exp);
    expect(p.cell).toBe(step(300, 1, 4));
  });

  it('jets indépendants : deux effets, deux tirages (mode random)', () => {
    let differ = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = fight('min', { rng: { rollMode: 'random', critMode: 'never', seed } });
      const n = mon(s, M.nitrooll, 300);
      const p = player(s, 'dompteur', step(300, 1, 1));
      cast(s, n, 80490, p.cell);
      const h = hits(s, p.id);
      expect(h).toHaveLength(2);
      for (const x of h) expect(x >= 1152 && x <= 1368 && x % 36 === 0).toBe(true);
      if (h[0] !== h[1]) differ++;
    }
    expect(differ).toBeGreaterThan(10);
  });
});

describe('Coup de Trooll (30386)', () => {
  it('poussée de 3 en ligne, aucun dégât hors collision (33 par case restante)', () => {
    const s = fight('min');
    const n = mon(s, M.nitrooll, 300);
    const p = player(s, 'dompteur', step(300, 1, 2));
    player(s, 'acrobate', step(300, 1, 4));
    cast(s, n, 80493, p.cell);
    expect(hits(s, p.id)).toEqual([]);
    expect(p.cell).toBe(step(300, 1, 3));
    expect(collisions(s, p.id)).toEqual([66]);
  });
});

describe('Trooll de Magie (30387)', () => {
  it.each([
    ['min', 2016],
    ['max', 2340],
    ['minCrit', 2412],
    ['maxCrit', 2772],
  ] as const)('%s : soin %i à un allié (boosté par la Force ×36)', (mode, v) => {
    const s = fight(mode);
    const n = mon(s, M.nitrooll, 300);
    const t = mon(s, M.troollibre, step(300, 1, 4));
    t.hp = 10000;
    cast(s, n, 80494, t.cell);
    expect(heals(s, t.id)).toEqual([v]);
  });
});

describe('Troollement de Tambour (30388)', () => {
  it('échange avec un allié (pas un joueur) puis le rend Inébranlable 1 tour', () => {
    const s = fight('min');
    const n = mon(s, M.nitrooll, 300);
    const t = mon(s, M.troollibre, step(300, 1, 4));
    cast(s, n, 80496, t.cell);
    expect([n.cell, t.cell]).toEqual([step(300, 1, 4), 300]);
    expect(t.unshakable).toBe(true);
    const s2 = fight('min');
    const n2 = mon(s2, M.nitrooll, 300);
    const p = player(s2, 'dompteur', step(300, 1, 4));
    cast(s2, n2, 80496, p.cell);
    expect([n2.cell, p.cell, p.unshakable]).toEqual([300, step(300, 1, 4), false]);
  });

  it('sur la Mama pré-combat (5971 : pas d’échange) : pas d’échange mais Inébranlable posé (ETUDE §5.5 « Mama Inébranlable »)', () => {
    const s = fight('min');
    const n = mon(s, M.nitrooll, 300);
    const m = mob(s, M.mama, step(300, 1, 3));
    cast(s, n, 80496, m.cell);
    expect([n.cell, m.cell]).toEqual([300, step(300, 1, 3)]);
    expect(m.hasState(157)).toBe(true);
  });
});

// =============================================================================================
// 5. Mama Troollette
// =============================================================================================

describe('Mama : script de départ (30430)', () => {
  it('Faveur V (+25 % DF, état 5973), Invulnérable (56), pré-combat 5971 (Enraciné, pas d’échange) et tour annulé 6 tours', () => {
    const s = fight('min');
    const m = mob(s, M.mama, 152);
    expect(m.stat(Stat.FINAL_DAMAGE)).toBe(25);
    expect([m.hasState(5973), m.hasState(56), m.hasState(5971)]).toEqual([true, true, true]);
    expect([m.invulnerable, m.rooted, m.canSwitch]).toEqual([true, true, false]);
    const pass = m.buffs.find((b) => b.effectId === 140)!;
    expect(pass.duration).toBe(6);
    const arrival = m.buffs.filter((b) => b.spellId === 30609 && b.kind === 'delayed');
    expect(arrival.map((b) => b.delay)).toEqual([7, 7]);
    // la case d'attente 152 (gradins) n'est pas jouable : aucun sort ne peut l'y viser
    const p = player(s, 'dompteur', 300, [80839]);
    expect(canCast(s, p.id, 80839, 152).code).toBe('NOT_WALKABLE');
    // invulnérable (état 56) : 0 dommage, même sur une case jouable
    const s2 = fight('min');
    const m2 = mob(s2, M.mama, 300);
    const p2 = player(s2, 'dompteur', step(300, 1, 5), [80839]);
    cast(s2, p2, 80839, m2.cell);
    expect(hits(s2, m2.id)).toEqual([0]);
    expect(m2.hp).toBe(150000);
  });
});

describe('Troollooportation (30389 + 30391)', () => {
  it.each([
    ['min', 3105],
    ['max', 3622],
    ['minCrit', 3725],
    ['maxCrit', 4346],
  ] as const)('%s (Faveur V) : téléportation puis %i aux ennemis au contact (X1, 90 %%)', (mode, dmg) => {
    const s = fight(mode);
    const m = mama(s, 300);
    const T = step(300, 1, 4);
    const a = player(s, 'dompteur', step(T, 1, 1));
    const b = player(s, 'acrobate', step(T, 7, 1));
    const far = player(s, 'magicien', step(T, 7, 2));
    const ally = mon(s, M.troollibre, step(T, 3, 1));
    cast(s, m, 80488, T);
    expect(m.cell).toBe(T);
    expect([hits(s, a.id), hits(s, b.id), hits(s, far.id), hits(s, ally.id)]).toEqual([[dmg], [dmg], [], []]);
  });

  it('sans Faveur : 2 484 (damageTable final100_eff90) ; case libre obligatoire', () => {
    const s = fight('min');
    const m = mon(s, M.mama, 300);
    const T = step(300, 1, 4);
    const a = player(s, 'dompteur', step(T, 1, 1));
    expect(canCast(s, m.id, 80488, a.cell).code).toBe('CELL_OCCUPIED');
    cast(s, m, 80488, T);
    expect(hits(s, a.id)).toEqual([2484]);
  });
});

describe('Uppertrooll (30392)', () => {
  it.each([
    ['min', 2645],
    ['max', 3105],
    ['minCrit', 3220],
    ['maxCrit', 3737],
  ] as const)('%s (Faveur V) : vol de vie %i puis poussée de 6 ; collision 133 par case (niveau 1000)', (mode, dmg) => {
    const s = fight(mode);
    const m = mama(s, 300);
    m.hp = 100000;
    const p = player(s, 'dompteur', step(300, 1, 1));
    player(s, 'magicien', step(300, 1, 5));
    cast(s, m, 80495, p.cell);
    expect(hits(s, p.id)).toEqual([dmg]);
    expect(heals(s, m.id, true)).toEqual([Math.trunc(dmg / 2)]);
    expect(p.cell).toBe(step(300, 1, 4));
    // 3 cases non parcourues : 3 × int((500 + 32) / 4) = 3 × 133 (entité percutée : 3 × 133 / 2)
    expect(collisions(s, p.id)).toEqual([399]);
  });
});

describe('Mitroollette de Poings (30393)', () => {
  it.each([
    ['min', [5347, 4812, 4277, 3742]],
    ['max', [6210, 5588, 4967, 4346]],
    ['minCrit', [6382, 5743, 5105, 4467]],
    ['maxCrit', [7417, 6675, 5933, 5191]],
  ] as const)('%s (Faveur V) : C3 100/90/80/70 %%', (mode, exp) => {
    const s = fight(mode);
    const m = mama(s, 300);
    const T = step(300, 1, 5);
    const ps = [0, 1, 2, 3].map((k) => player(s, 'dompteur', k === 0 ? T : step(T, 3, k)));
    cast(s, m, 80497, T);
    expect(ps.map((p) => hits(s, p.id))).toEqual(exp.map((x) => [x]));
  });

  it('sans Faveur : 4 278–4 968 (DPLN « 4 500 » = hors Faveur) ; Démotivation (−35 %) : 2 780', () => {
    for (const [mode, exp] of [['min', 4278], ['max', 4968]] as const) {
      const s = fight(mode);
      const m = mon(s, M.mama, 300);
      const p = player(s, 'dompteur', step(300, 1, 5));
      cast(s, m, 80497, p.cell);
      expect(hits(s, p.id)).toEqual([exp]);
    }
    const s = fight('min');
    const m = mama(s, 300);
    const mag = player(s, 'magicien', step(300, 5, 3), [80832]);
    // 5 objectifs réussis : 125 − 25 = 100 % ; Démotivation −35 % → 65 %
    m.bonus[Stat.FINAL_DAMAGE] = m.bonus[Stat.FINAL_DAMAGE]! - 25;
    cast(s, mag, 80832, mag.cell);
    const p = player(s, 'dompteur', step(300, 1, 5));
    cast(s, m, 80497, p.cell);
    expect(hits(s, p.id)).toEqual([2780]);
  });
});

describe('Catastrooll (30394)', () => {
  it('attire de 5 toutes les entités (a,A) d’une étoile *6 ; +20 % DF sur elle jusqu’à la fin du tour', () => {
    const s = fight('min');
    const m = mama(s, 300);
    const a = player(s, 'dompteur', step(300, 1, 6));
    const b = player(s, 'acrobate', step(300, 0, 3));
    const c = mon(s, M.troollibre, step(300, 5, 4));
    const off = player(s, 'magicien', rel(3, 1));
    cast(s, m, 80498, 300);
    expect(a.cell).toBe(step(300, 1, 1));
    expect(b.cell).toBe(step(300, 0, 1));
    expect(c.cell).toBe(step(300, 5, 1));
    expect(off.cell).toBe(rel(3, 1));
    expect(m.stat(Stat.FINAL_DAMAGE)).toBe(45);
    const bonus = m.buffs.find((x) => x.spellId === 30394)!;
    expect(bonus.untilTurnEnd).toBe(true);
    // Catastrooll + Mitroollette (Faveur V) : ×1,45 → 6 203 au centre (damageTable final145)
    cast(s, m, 80497, a.cell);
    expect(hits(s, a.id)).toEqual([6203]);
  });
});

describe('Rassemblement Troollesque (30432)', () => {
  it('croix X63 : Troolls attirés contre elle, joueurs repoussés jusqu’au bord sans dommages, état Grabbed (5918) ; un Trooll attiré peut bloquer un joueur', () => {
    const s = fight('min');
    const m = mama(s, 300);
    const blocked = player(s, 'dompteur', step(300, 1, 2));
    const t = mon(s, M.troollibre, step(300, 1, 5));
    const west = player(s, 'acrobate', step(300, 5, 3));
    const art = mon(s, M.artroolleur, step(300, 3, 6));
    const north = player(s, 'magicien', step(300, 7, 1));
    const off = player(s, 'magicien', rel(2, 1));
    resolveSpell(s, m, s.ctx.getSpell(80931), 300);
    expect(t.cell).toBe(step(300, 1, 3));
    expect(blocked.cell).toBe(step(300, 1, 2));
    expect(west.cell).toBe(step(300, 5, 8));
    expect(art.cell).toBe(step(300, 3, 1));
    expect(north.cell).toBe(step(300, 7, 8));
    expect(off.cell).toBe(rel(2, 1));
    for (const p of [blocked, west, north]) {
      expect(hits(s, p.id).concat(collisions(s, p.id))).toEqual([]);
      expect(p.hasState(5918)).toBe(true);
    }
    expect(off.hasState(5918)).toBe(false);
    // repoussés jusqu'au bord = dans les pics (les 2 dernières cases jouables de chaque axe)
    expect(s.ctx.grid.isSpike(west.cell) && s.ctx.grid.isSpike(north.cell)).toBe(true);
  });

  it('Inébranlable (Pugnace) bloque la poussée 1103 (boss.rassemblementBlockedByUnshakable), pas l’option inverse', () => {
    for (const [blocking, moved] of [[true, false], [false, true]] as const) {
      const s = fight('min', { boss: { rassemblementBlockedByUnshakable: blocking } });
      const m = mama(s, 300);
      const p = player(s, 'acrobate', step(300, 1, 2), [80511]);
      cast(s, p, 80511, p.cell);
      resolveSpell(s, m, s.ctx.getSpell(80931), 300);
      expect(p.cell !== step(300, 1, 2)).toBe(moved);
    }
  });

  it('déclenché au début de chaque tour de la Mama (buff TB permanent de 30432 niv. 1)', () => {
    const s = fight('min');
    const m = mama(s, 300);
    resolveSpell(s, m, s.ctx.getSpell(80591), 300);
    const b = m.buffs.find((x) => x.spellId === 30432 && x.kind === 'triggered')!;
    expect(b.triggers).toEqual(['TB']);
    const p = player(s, 'dompteur', step(300, 3, 2));
    const d = distance(p.cell, 300);
    expect(d).toBe(2);
  });
});

describe('Faveur de la foule (ETUDE §6.7) : un cran de moins et −5 % DF par objectif réussi (30659)', () => {
  it('V → IV → III → II → I → aucun ; DF 125 → 100, puis 95 au 6e (sans plafond)', () => {
    const s = fight('min');
    const m = mob(s, M.mama, 300);
    const favour = () => [5973, 5974, 5975, 5976, 5977].filter((st) => m.hasState(st));
    const seen: Array<[number[], number]> = [[favour(), m.stat(Stat.FINAL_DAMAGE)]];
    for (let k = 0; k < 6; k++) {
      resolveSpell(s, m, s.ctx.getSpell(80932), m.cell);
      seen.push([favour(), m.stat(Stat.FINAL_DAMAGE)]);
    }
    expect(seen).toEqual([
      [[5973], 25],
      [[5974], 20],
      [[5975], 15],
      [[5976], 10],
      [[5977], 5],
      [[], 0],
      [[], -5],
    ]);
  });
});

describe('critique des monstres : seul le taux du sort compte (stat Critique 0)', () => {
  it('Troollpoline 40 %, Double Trooll 60 %, Mortrooll 40 %, Uppertrooll 30 %', () => {
    const s = fight();
    for (const [id, sl, rate] of [[M.troollibre, 80483, 40], [M.nitrooll, 80490, 60], [M.artroolleur, 80487, 40], [M.mama, 80495, 30]] as const) {
      const f = mon(s, id, step(300, 1, [M.troollibre, M.nitrooll, M.artroolleur, M.mama].indexOf(id) + 1));
      expect(f.stat(Stat.CRIT)).toBe(0);
      expect(s.ctx.getSpell(sl).cast.critRate).toBe(rate);
    }
  });
});

describe('performance (ETUDE : le planificateur clone des milliers de fois par décision)', () => {
  /** État de milieu de combat : 4 joueurs (passifs, archétypes), 10 Troolls, la Mama, l'entité de scénario et les pics. */
  function midFight(): { s: FightState; domp: Fighter; acro: Fighter } {
    const ctx = createEngineContext({ overrides: { rng: { rollMode: 'random', critMode: 'random' }, engine: { eventLog: false } } });
    const s = createFight(ctx, { eventLog: false });
    const sce = addFighter(s, { kind: 'scenario' }, -1);
    resolveSpell(s, sce, ctx.getSpell(80489), -1);
    const acro = player(s, 'acrobate', 286);
    const domp = player(s, 'dompteur', 287);
    player(s, 'dompteur', 314);
    player(s, 'magicien', 315);
    const cells = [242, 358, 330, 344, 260, 341, 231, 370, 218, 386];
    const ids = [M.troollibre, M.troollibre, M.artroolleur, M.artroolleur, M.nitrooll, M.nitrooll, M.troollibre, M.artroolleur, M.nitrooll, M.troollibre];
    cells.forEach((c, i) => mob(s, ids[i]!, c));
    mob(s, M.mama, 300);
    return { s, domp, acro };
  }

  function perCallMicros(n: number, fn: () => void): number {
    for (let i = 0; i < Math.min(n, 500); i++) fn();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn();
    return ((performance.now() - t0) * 1000) / n;
  }

  it('clone d’un état à 16 combattants (≈ 8 µs mesurés) et lancer typique (≈ 5-15 µs) : bien sous 20 / 50 µs (seuils larges ici)', () => {
    const { s, domp, acro } = midFight();
    expect(s.fighters.length).toBe(16);
    const tClone = perCallMicros(5000, () => void s.clone());
    const tImpact = perCallMicros(3000, () => {
      const c = s.clone();
      castSpell(c, domp.id, 80500, 344);
    });
    const tVideur = perCallMicros(3000, () => {
      const c = s.clone();
      castSpell(c, acro.id, 80507, 242); // Troollibre 242 → 199 : entrée dans les pics puis frappe ×2
    });
    const probe = s.clone();
    castSpell(probe, acro.id, 80507, 242);
    expect(probe.fighterAt(199)?.monsterId).toBe(M.troollibre);
    // seuils volontairement larges (machines de CI lentes) : l'objectif reste < 20 µs et < 50 µs
    expect(tClone).toBeLessThan(80);
    expect(tImpact - tClone).toBeLessThan(200);
    expect(tVideur - tClone).toBeLessThan(200);
  });
});
