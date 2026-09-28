/**
 * Vérification adversariale, sort par sort, des sorts des archétypes (ETUDE §4, notes 1x_archetype_*, research/data/
 * archetype_*.json : expectedDamage, simModel, workedExamples) : pour chaque sort (normal ET amélioré), chaque sort
 * unique et Pense Vite, un scénario minimal sur la carte réelle vérifie PA, portée, zone touchée, dégâts (bornes min /
 * max, critique), poussées (case finale), états, buffs, soins, boucliers, sous-sorts et relances.
 *
 * Les valeurs attendues sont recopiées des notes (et non des données) ; un écart signifie qu'il faut trancher
 * (données du jeu > formules du client > notes) : voir docs/VERIFICATION.md.
 */
import { describe, expect, it } from 'vitest';
import {
  addBuff,
  enterMarksAt,
  flushTriggers,
  addFighter,
  applyDamage,
  Buff,
  canCast,
  killFighter,
  nextTurn,
  resolveSpell,
  setTimeline,
  spellBaseDamageBonus,
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
  sum,
  verifyCastRules,
  vulnerable,
  type CastExpect,
  type RollName,
} from './helpers/spellCheck.js';

const TROOLLIBRE = 7981;
const MAMA = 7984;

const enemy = (s: FightState, c: number): Fighter => mon(s, TROOLLIBRE, c);
const withSpell = (key: 'acrobate' | 'dompteur' | 'magicien', sl: number) => (s: FightState, c: number) => arch(s, key, c, [sl]);

/** Avance jusqu'au début du tour de ``f``. */
function untilTurnOf(s: FightState, f: Fighter, max = 60): void {
  for (let i = 0; i < max; i++) {
    const r = nextTurn(s);
    if (r.status === 'turnStarted' && r.fighterId === f.id) return;
    if (r.status !== 'turnStarted') throw new Error(`nextTurn : ${r.status}`);
  }
  throw new Error(`tour de ${f.name} non atteint`);
}

// =============================================================================================
// 1. Conditions de lancer : table recopiée de l'ÉTUDE §4.1-§4.4 et des notes N1A / N1D / N1M
// =============================================================================================

type Row = [number, 'acrobate' | 'dompteur' | 'magicien', CastExpect];
const E = (ap: number, min: number, max: number, line: boolean, los: boolean, perTurn: number, perTarget: number, interval: number, crit: number, extra: Partial<CastExpect> = {}): CastExpect => ({
  ap, min, max, line, los, perTurn, perTarget, interval, crit, ...extra,
});

const CAST_TABLE: Row[] = [
  // commun
  [80499, 'acrobate', E(3, 1, 6, false, true, 2, 0, 0, 30, { mod: true })],
  // Acrobate (ETUDE §4.2, N1A §2 : « m » = PO modifiable)
  [80507, 'acrobate', E(4, 1, 5, true, true, 2, 0, 0, 30, { mod: true })],
  [80766, 'acrobate', E(4, 1, 5, true, true, 2, 0, 0, 30, { mod: true })],
  [80513, 'acrobate', E(3, 1, 3, true, true, 1, 0, 0, 0, { mod: true })],
  [80784, 'acrobate', E(3, 1, 3, true, true, 1, 0, 0, 0, { mod: true })],
  [80510, 'acrobate', E(4, 1, 5, false, true, 2, 1, 0, 0, { mod: true, taken: true })],
  [80775, 'acrobate', E(4, 1, 7, false, true, 2, 1, 0, 0, { mod: true })],
  [80522, 'acrobate', E(3, 1, 5, false, false, 0, 0, 1, 0, { mod: true, free: true })],
  [80778, 'acrobate', E(3, 1, 5, false, false, 0, 0, 1, 0, { mod: true, free: true })],
  [80511, 'acrobate', E(2, 0, 0, false, false, 0, 0, 2, 0)],
  [80780, 'acrobate', E(2, 0, 0, false, false, 0, 0, 2, 0)],
  [80509, 'acrobate', E(3, 1, 8, false, false, 0, 0, 1, 0, { mod: true, free: true })],
  [80773, 'acrobate', E(3, 1, 8, false, false, 0, 0, 1, 0, { mod: true, free: true })],
  [80512, 'acrobate', E(2, 1, 6, true, true, 2, 1, 0, 0, { mod: true })],
  [80782, 'acrobate', E(2, 1, 6, true, true, 2, 1, 0, 0, { mod: true })],
  // Dompteur (ETUDE §4.3, N1D §4 : « toutes les portées sont modifiables »)
  [80500, 'dompteur', E(4, 1, 5, false, true, 2, 0, 0, 30, { mod: true })],
  [80748, 'dompteur', E(4, 1, 5, false, true, 3, 0, 0, 30, { mod: true })],
  [80501, 'dompteur', E(4, 1, 6, false, true, 0, 0, 2, 30, { mod: true })],
  [80751, 'dompteur', E(4, 1, 6, false, true, 0, 0, 2, 30, { mod: true })],
  [80502, 'dompteur', E(3, 1, 6, false, false, 3, 2, 0, 30, { mod: true })],
  [80754, 'dompteur', E(3, 1, 6, false, false, 4, 3, 0, 30, { mod: true })],
  [80503, 'dompteur', E(4, 1, 6, true, true, 1, 0, 0, 30, { mod: true })],
  [80756, 'dompteur', E(4, 1, 6, true, true, 1, 0, 0, 30, { mod: true })],
  [80504, 'dompteur', E(4, 1, 5, false, true, 0, 0, 2, 0, { mod: true })],
  [80758, 'dompteur', E(4, 1, 5, false, true, 0, 0, 2, 0, { mod: true })],
  [80505, 'dompteur', E(5, 1, 5, false, true, 0, 0, 3, 0, { mod: true })],
  [80760, 'dompteur', E(5, 1, 5, false, true, 0, 0, 3, 0, { mod: true })],
  [80506, 'dompteur', E(2, 1, 5, true, true, 0, 0, 1, 0, { mod: true })],
  [80762, 'dompteur', E(2, 1, 5, true, true, 0, 0, 1, 0, { mod: true })],
  // Magicien (ETUDE §4.4, N1M §3 tableau des conditions)
  [80514, 'magicien', E(3, 0, 5, false, true, 2, 0, 0, 30, { mod: true })],
  [80786, 'magicien', E(3, 0, 5, false, true, 2, 0, 0, 30, { mod: true })],
  [80515, 'magicien', E(2, 0, 0, false, false, 0, 0, 4, 0)],
  [80788, 'magicien', E(2, 0, 0, false, false, 0, 0, 4, 0)],
  [80516, 'magicien', E(2, 0, 8, false, true, 2, 1, 0, 0, { mod: true })],
  [80791, 'magicien', E(2, 0, 8, false, true, 2, 1, 0, 0, { mod: true })],
  [80519, 'magicien', E(2, 0, 6, false, true, 2, 1, 0, 0, { mod: true })],
  [80800, 'magicien', E(2, 0, 6, false, true, 2, 1, 0, 0, { mod: true })],
  [80521, 'magicien', E(2, 1, 6, true, true, 1, 0, 0, 0, { mod: true })],
  [80802, 'magicien', E(2, 1, 6, true, true, 3, 1, 0, 0, { mod: true })],
  [80517, 'magicien', E(3, 1, 8, false, true, 1, 0, 0, 30, { mod: true })],
  [80793, 'magicien', E(3, 1, 8, false, true, 1, 0, 0, 30, { mod: true })],
  [80518, 'magicien', E(2, 1, 7, false, true, 0, 0, 2, 20, { mod: true })],
  [80795, 'magicien', E(2, 1, 7, false, true, 0, 0, 2, 20, { mod: true })],
  // Uniques (ETUDE §4.2-§4.4 : 5 PA, usage unique, sans critique sauf Relâchement 30 %)
  [80828, 'acrobate', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80829, 'acrobate', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80844, 'acrobate', E(5, 1, 63, false, false, 0, 0, 0, 0, { taken: true })],
  [80845, 'acrobate', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80846, 'acrobate', E(5, 1, 63, false, false, 0, 0, 0, 0)],
  [80847, 'acrobate', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80826, 'dompteur', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80827, 'dompteur', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80839, 'dompteur', E(5, 1, 63, false, false, 0, 0, 0, 30, { mod: false })],
  [80840, 'dompteur', E(5, 1, 63, false, false, 0, 0, 0, 0, { mod: false })],
  [80841, 'dompteur', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80842, 'dompteur', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80830, 'magicien', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80832, 'magicien', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80848, 'magicien', E(5, 1, 63, false, false, 0, 0, 0, 0)],
  [80849, 'magicien', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80850, 'magicien', E(5, 0, 0, false, false, 0, 0, 0, 0)],
  [80851, 'magicien', E(5, 0, 63, false, false, 0, 0, 0, 0)],
  [80843, 'magicien', E(5, 0, 0, false, false, 0, 0, 0, 0)],
];

describe('conditions de lancer de chaque niveau de sort (données compilées + comportement de canCast)', () => {
  it.each(CAST_TABLE)('niveau %i (%s)', (sl, key, exp) => {
    // les sorts « sur une case occupée » ou qui visent un allié acceptent n'importe quel combattant pour ces contrôles
    verifyCastRules(sl, exp, withSpell(key, sl), enemy);
  });

  it('Aïronemane normal interdit en état Pesanteur (7) ; l’amélioré ne l’est plus (N1A §2, données)', () => {
    for (const [sl, forbidden] of [[80522, true], [80778, false]] as const) {
      const s = fight();
      const a = arch(s, 'acrobate', 300, [sl]);
      const b = new Buff();
      b.kind = 'state';
      b.stateId = 7;
      b.casterId = a.id;
      b.duration = -1;
      addBuff(s, a, b);
      expect(a.hasState(7)).toBe(true);
      const r = canCast(s, a.id, sl, step(300, 1, 2));
      if (forbidden) expect(r.code).toBe('STATE_FORBIDDEN');
      else expect(r.ok).toBe(true);
    }
  });

  it('un sort à 0 % de critique ne critique jamais, même en critMode always (Voltige, Coup de Sang, uniques)', () => {
    for (const sl of [80510, 80504, 80826]) {
      const s = fight('minCrit');
      const key = sl === 80510 ? 'acrobate' : 'dompteur';
      const c = arch(s, key, 300, [sl]);
      const t = enemy(s, step(300, 1, 2));
      const r = cast(s, c, sl, sl === 80826 ? c.cell : t.cell);
      expect(r.critical).toBe(false);
    }
  });
});

// =============================================================================================
// 2. Frappe Repoussoir (commun)
// =============================================================================================

describe('Frappe Repoussoir (30416)', () => {
  it('pousse de 2 un allié sans le blesser ; frappe une invocation alliée (masque j) : 976 × 50 % (Poutch, DBA)', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300);
    const ally = player(s, 'dompteur', step(300, 1, 2));
    cast(s, a, 80499, ally.cell);
    expect(ally.cell).toBe(step(300, 1, 4));
    expect(hits(s, ally.id)).toEqual([]);
    const poutch = addFighter(s, { kind: 'monster', monsterId: 7985, team: 'players', summonerId: a.id }, step(300, 5, 2));
    resolveSpell(s, poutch, s.ctx.getSpell(poutch.startingSpellLevelId), poutch.cell);
    cast(s, a, 80499, poutch.cell);
    expect(poutch.cell).toBe(step(300, 5, 4));
    expect(hits(s, poutch.id)).toEqual([488]);
  });

  it('critique 40 % effectif (30 + 10)', () => {
    const s = fight();
    const a = player(s, 'acrobate', 300);
    expect(a.stat(Stat.CRIT)).toBe(10);
    expect(s.ctx.getSpell(80499).cast.critRate + a.stat(Stat.CRIT)).toBe(40);
  });
});

// =============================================================================================
// 3. Acrobate
// =============================================================================================

describe('Videur (30402 → 30567)', () => {
  /** Acrobate en 300, case ciblée à 3 pas (dir 1) ; ennemis au centre et sur la barre du T, allié sur la barre. */
  function setup(sl: number, mode: RollName) {
    const s = fight(mode);
    const a = arch(s, 'acrobate', 300, [sl]);
    const T = step(300, 1, 3);
    const center = enemy(s, T);
    const l1 = enemy(s, step(T, 7, 1));
    const l2 = enemy(s, step(T, 7, 2));
    const ally = player(s, 'dompteur', step(T, 3, 1));
    const l3 = sl === 80766 ? enemy(s, step(T, 3, 3)) : null;
    const far = enemy(s, step(T, 7, 3)); // hors du T2 ; dans le T3 amélioré
    return { s, a, T, center, l1, l2, ally, l3, far };
  }

  it.each([
    ['min', 3599, 3239, 2879],
    ['max', 3843, 3458, 3074],
    ['minCrit', 4392, 3952, 3513],
    ['maxCrit', 4697, 4227, 3757],
  ] as const)('T2 %s : centre %i, barre à 1 case %i, à 2 cases %i ; tout le T poussé de 3 parallèlement à l’axe', (mode, c0, c1, c2) => {
    const { s, a, T, center, l1, l2, ally, far } = setup(80507, mode);
    const before = [l1.cell, l2.cell, ally.cell, far.cell];
    const r = cast(s, a, 80507, T);
    expect(r.critical).toBe(mode.endsWith('Crit'));
    expect(a.apUsed).toBe(4);
    expect([hits(s, center.id), hits(s, l1.id), hits(s, l2.id)]).toEqual([[c0], [c1], [c2]]);
    expect(hits(s, ally.id)).toEqual([]);
    expect(hits(s, far.id)).toEqual([]);
    // « bulldozer » : chaque combattant du T est poussé de 3 selon l'axe dominant lanceur → cible (dir 1)
    expect(center.cell).toBe(step(T, 1, 3));
    expect([l1.cell, l2.cell, ally.cell]).toEqual(before.slice(0, 3).map((c) => step(c, 1, 3)));
    expect(far.cell).toBe(before[3]);
  });

  it('T3 amélioré : 7 cases, poussée de 4, 70 % à 3 cases de la case ciblée', () => {
    const { s, a, T, center, l1, l3, far } = setup(80766, 'min');
    const farBefore = far.cell;
    cast(s, a, 80766, T);
    expect(hits(s, center.id)).toEqual([3599]);
    expect(hits(s, l1.id)).toEqual([3239]);
    expect(hits(s, l3!.id)).toEqual([2519]);
    expect(hits(s, far.id)).toEqual([2519]);
    expect(center.cell).toBe(step(T, 1, 4));
    // la case à 3 cases de la barre est en diagonale EXACTE du lanceur (|dx| = |dy| = 3) : poussée diagonale de
    // ceil(4 / 2) = 2 pas (ETUDE §9.9), et non parallèle à l'axe
    expect(far.cell).toBe(step(farBefore, 0, 2));
  });

  it.each([
    // [portée, décalage latéral, direction attendue, pas attendus] (N1A §2.3 : tableau de la barre du T)
    [1, 1, 'diag', 2],
    [1, 2, 'perp', 3],
    [2, 1, 'axis', 3],
    [2, 2, 'diag', 2],
    [3, 1, 'axis', 3],
    [3, 2, 'axis', 3],
  ] as const)('N1A §2.3 : portée %i, case latérale ±%i → poussée %s de %i pas', (range, lat, kind, n) => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [80507]);
    const T = step(300, 1, range);
    const up = enemy(s, rel(range, lat));
    const down = enemy(s, rel(range, -lat));
    cast(s, a, 80507, T);
    const expUp = kind === 'axis' ? rel(range + n, lat) : kind === 'perp' ? rel(range, lat + n) : rel(range + n, lat + n);
    const expDown = kind === 'axis' ? rel(range + n, -lat) : kind === 'perp' ? rel(range, -lat - n) : rel(range + n, -lat - n);
    expect([up.cell, down.cell]).toEqual([expUp, expDown]);
  });

  it('workedExample T1 (N1A §7.2) : depuis 287, Videur sur 229 et 345 envoie 242 → 199 et 358 → 402', () => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 287, [80507]);
    for (const c of [286, 314, 315]) arch(s, 'magicien', c);
    const t1 = enemy(s, 242);
    const t2 = enemy(s, 358);
    cast(s, a, 80507, 229);
    cast(s, a, 80507, 345);
    expect([t1.cell, t2.cell]).toEqual([199, 402]);
  });
});

describe('Hanedimane (30408 → 30574)', () => {
  it.each([
    [80513, 4, 10],
    [80784, 6, 13],
  ] as const)('niveau %i : fourche (%i cases de poussée / attirance, %i cases de zone) ; ennemis repoussés, alliés attirés vers le lanceur', (sl, n, cells) => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [sl]);
    const T = step(300, 1, 1);
    const zone = s.ctx.getSpell(sl).effects[0]!.zone.cells(T, 300).filter((c) => c >= 0);
    expect(zone).toHaveLength(cells);
    // un ennemi sur la case ciblée, un allié sur la dent latérale (3, 2) du repère du lanceur
    const e = enemy(s, T);
    expect(zone).toContain(rel(3, 2));
    const ally = player(s, 'dompteur', rel(3, 2));
    cast(s, a, sl, T);
    expect(a.apUsed).toBe(3);
    expect(e.cell).toBe(step(T, 1, n));
    expect(hits(s, e.id)).toEqual([]);
    // attirance depuis le lanceur : axe dominant (dir 1), donc parallèle à l'axe, de n cases
    expect(ally.cell).toBe(rel(3 - n, 2));
  });

  it('allié dans l’axe : attiré de 4 jusqu’au contact du lanceur', () => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [80513]);
    const ally = player(s, 'dompteur', step(300, 1, 3));
    cast(s, a, 80513, step(300, 1, 1));
    expect(ally.cell).toBe(step(300, 1, 1));
  });
});

describe('Voltige (30404 → 30570)', () => {
  it.each([
    ['min', 3538],
    ['max', 3782],
    ['minCrit', 3538],
  ] as const)('%s : échange avec un ennemi puis %i (critique impossible : taux 0)', (mode, dmg) => {
    const s = fight(mode);
    const a = arch(s, 'acrobate', 300, [80510]);
    const e = enemy(s, step(300, 1, 4));
    const r = cast(s, a, 80510, e.cell);
    expect(r.critical).toBe(false);
    expect([a.cell, e.cell]).toEqual([step(300, 1, 4), 300]);
    expect(hits(s, e.id)).toEqual([dmg]);
  });

  it('allié : échange sans dégâts ; ×2 sur Vulnérable (7 076) ; amélioré : PO 7, case vide acceptée sans effet', () => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [80510, 80775]);
    const ally = player(s, 'magicien', step(300, 5, 2));
    cast(s, a, 80510, ally.cell);
    expect([a.cell, ally.cell]).toEqual([step(300, 5, 2), 300]);
    expect(hits(s, ally.id)).toEqual([]);
    const s2 = fight('min');
    const a2 = arch(s2, 'acrobate', 300, [80510, 80775]);
    const e = enemy(s2, step(300, 1, 7));
    vulnerable(s2, e);
    expect(canCast(s2, a2.id, 80510, e.cell).code).toBe('OUT_OF_RANGE');
    cast(s2, a2, 80775, e.cell);
    expect(hits(s2, e.id)).toEqual([7076]);
    expect([a2.cell, e.cell]).toEqual([step(300, 1, 7), 300]);
    const empty = step(a2.cell, 5, 2);
    cast(s2, a2, 80775, empty);
    expect(a2.cell).toBe(step(300, 1, 7));
  });
});

describe('Aïronemane (30405 → 30571)', () => {
  it.each([
    [80522, 2],
    [80778, 4],
  ] as const)('niveau %i : téléporte le lanceur puis repousse de %i les 4 voisins (alliés compris) depuis le centre', (sl, n) => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [sl]);
    const T = step(300, 1, 3);
    const around = [1, 3, 5, 7].map((d) => ({ d, f: d === 5 ? player(s, 'dompteur', step(T, d, 1)) : enemy(s, step(T, d, 1)) }));
    cast(s, a, sl, T);
    expect(a.cell).toBe(T);
    for (const { d, f } of around) expect(f.cell, `voisin dir ${d}`).toBe(step(T, d, 1 + n));
    for (const { f } of around) expect(hits(s, f.id)).toEqual([]);
  });

  it('sans ligne de vue : téléportation derrière un combattant', () => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [80522]);
    enemy(s, step(300, 1, 1));
    cast(s, a, 80522, step(300, 1, 3));
    expect(a.cell).toBe(step(300, 1, 3));
  });
});

describe('Pugnace (30406 → 30572)', () => {
  it.each([
    [80511, 25, 3075],
    [80780, 50, 2050],
  ] as const)('niveau %i : Inébranlable + %i %% de résistance 1 tour ; Troollpoline min (4 100) réduite à %i', (sl, res, troll) => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [sl]);
    cast(s, a, sl, 300);
    expect(a.hasState(157)).toBe(true);
    expect(a.unshakable).toBe(true);
    expect(a.stat(Stat.RES_ALL)).toBe(res);
    const t = enemy(s, step(300, 1, 1));
    cast(s, t, 80483, t.cell);
    expect(hits(s, a.id)).toEqual([troll]);
    expect(a.cell).toBe(300);
  });

  it('durée : jusqu’au début du prochain tour de l’Acrobate', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300);
    const d = player(s, 'dompteur', 286);
    setTimeline(s, [a.id, d.id]);
    untilTurnOf(s, a);
    cast(s, a, 80511, 300);
    untilTurnOf(s, d);
    expect(a.unshakable).toBe(true);
    untilTurnOf(s, a);
    expect(a.unshakable).toBe(false);
    expect(a.stat(Stat.RES_ALL)).toBe(0);
  });
});

describe('Soutien Stratégique (30403 → 30569)', () => {
  it.each([
    [80509, 7985, 4, 5],
    [80773, 7986, 6, 7],
  ] as const)('niveau %i : invoque %i (5 500 PV) puis attire de %i vers lui les ennemis de la croix X%i et « + »', (sl, poutchId, pull, r) => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [sl]);
    const T = step(300, 1, 2);
    const eAxis = enemy(s, step(T, 1, 5));
    const eDiag = enemy(s, step(T, 0, 3));
    const eFar = enemy(s, step(T, 5, r + 1 > 3 ? 3 : r + 1)); // dans la croix, côté lanceur (derrière lui)
    const ally = player(s, 'dompteur', step(T, 3, 3));
    cast(s, a, sl, T);
    const p = s.fighters.find((f) => f.monsterId === poutchId)!;
    expect(p).toBeDefined();
    expect([p.cell, p.hp, p.maxHp, p.team, p.summonerId]).toEqual([T, 5500, 5500, 'players', a.id]);
    // axe : 5 pas, attiré de 4 (6) → au contact (bloqué par le Poutch)
    expect(eAxis.cell).toBe(step(T, 1, Math.max(1, 5 - pull)));
    // diagonale : 3 pas diagonaux, attiré de ceil(n/2) pas diagonaux → au contact diagonal
    expect(eDiag.cell).toBe(step(T, 0, 1));
    expect(ally.cell).toBe(step(T, 3, 3));
    // l'ennemi derrière le lanceur est bloqué par le lanceur
    expect(distance(eFar.cell, T)).toBeGreaterThan(0);
    expect(hits(s, eAxis.id)).toEqual([]);
  });

  it('Poutch : frappé par un Dompteur (Impact), renvoie 50 % des dommages initiaux aux ennemis à 1–2 cases (×2 sur Vulnérable) ; un 2e Poutch tue le 1er', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80509]);
    const T = step(300, 1, 2);
    const d = player(s, 'dompteur', step(T, 7, 4));
    cast(s, a, 80509, T);
    const p = s.fighters.find((f) => f.monsterId === 7985)!;
    const e1 = enemy(s, step(T, 1, 2));
    const e2 = enemy(s, step(T, 3, 1));
    vulnerable(s, e2);
    const far = enemy(s, step(T, 1, 3));
    // Impact centré sur le Poutch : Poutch 4 148 × 50 % ; e2 (1 case, 90 %) ; e1 (2 cases, 80 %)
    cast(s, d, 80500, T);
    expect(hits(s, p.id)).toEqual([2074]);
    // renvoi : 50 % des dommages INITIAUX (4 148) = 2 074 aux ennemis en C2,1 autour du Poutch ; le Poutch (case
    // ciblée) est frappé en premier et son déclencheur passe avant les cibles suivantes de l'Impact
    expect(hits(s, e1.id)).toEqual([2074, 3318]);
    expect(hits(s, e2.id)).toEqual([4148, 7466]);
    expect(hits(s, far.id)).toEqual([]);
    // second Soutien : le premier Poutch meurt (141, masque g,F7985)
    a.turnCount += 1;
    a.resetCastCounters();
    manyAp(a);
    cast(s, a, 80509, step(300, 3, 3));
    expect(p.alive).toBe(false);
    expect(s.fighters.filter((f) => f.monsterId === 7985 && f.alive)).toHaveLength(1);
  });
});

describe('Va-t-en-guerre (30407 → 30573)', () => {
  it.each([
    [80512, 2],
    [80782, 4],
  ] as const)('niveau %i : le lanceur avance de %i vers la cible (ennemi ou allié), sans dégâts', (sl, n) => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [sl]);
    const e = enemy(s, step(300, 1, 6));
    cast(s, a, sl, e.cell);
    expect(a.cell).toBe(step(300, 1, n));
    expect(e.cell).toBe(step(300, 1, 6));
    const ally = player(s, 'magicien', step(a.cell, 5, 3));
    cast(s, a, sl, ally.cell);
    expect(a.cell).toBe(step(ally.cell, 1, 1));
  });

  it('bloqué par Inébranlable (Pugnace) : engine.unshakableBlocksCasterAdvance', () => {
    const s = fight('min');
    const a = arch(s, 'acrobate', 300, [80512, 80511]);
    cast(s, a, 80511, 300);
    const e = enemy(s, step(300, 1, 5));
    cast(s, a, 80512, e.cell);
    expect(a.cell).toBe(300);
  });
});

// =============================================================================================
// 4. Dompteur
// =============================================================================================

describe('Impact (30395 → 30558)', () => {
  it.each([
    ['min', [4148, 3733, 3318]],
    ['max', [4514, 4062, 3611]],
    ['minCrit', [5002, 4501, 4001]],
    ['maxCrit', [5429, 4886, 4343]],
  ] as const)('%s : centre / 1 / 2 cases (ETUDE §4.3, N1D §5.1)', (mode, exp) => {
    const s = fight(mode);
    const d = arch(s, 'dompteur', 300, [80500]);
    const T = step(300, 1, 4);
    const a0 = enemy(s, T);
    const a1 = enemy(s, step(T, 7, 1));
    const a2 = enemy(s, step(T, 0, 1));
    const out = enemy(s, step(T, 1, 3));
    cast(s, d, 80500, T);
    expect([hits(s, a0.id), hits(s, a1.id), hits(s, a2.id)]).toEqual(exp.map((x) => [x]));
    expect(hits(s, out.id)).toEqual([]);
  });

  it('ne blesse jamais un allié joueur ; case ciblée libre autorisée ; ×2 sur Vulnérable (8 296)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80500]);
    const T = step(300, 1, 4);
    const ally = player(s, 'magicien', step(T, 1, 1));
    const e = enemy(s, step(T, 3, 1));
    vulnerable(s, e);
    cast(s, d, 80500, T);
    expect(hits(s, ally.id)).toEqual([]);
    expect(hits(s, e.id)).toEqual([7466]);
    const s2 = fight('min');
    const d2 = arch(s2, 'dompteur', 300, [80500]);
    const e2 = enemy(s2, step(300, 1, 3));
    vulnerable(s2, e2);
    cast(s2, d2, 80500, e2.cell);
    expect(hits(s2, e2.id)).toEqual([8296]);
  });

  it('amélioré : C3 (70 % à 3 cases, 2 903–3 159) ; 3 lancers par tour', () => {
    for (const [mode, exp] of [['min', 2903], ['max', 3159]] as const) {
      const s = fight(mode);
      const d = arch(s, 'dompteur', 300, [80748]);
      const T = step(300, 1, 3);
      const e3 = enemy(s, step(T, 7, 3));
      cast(s, d, 80748, T);
      expect(hits(s, e3.id)).toEqual([exp]);
    }
  });

  it('critique normal : masque A,J (spells.impactCritHitsPoutch=false) ; le Poutch allié n’est touché que hors critique', () => {
    for (const [mode, touched] of [['min', true], ['minCrit', false]] as const) {
      const s = fight(mode);
      const d = arch(s, 'dompteur', 300, [80500]);
      const p = addFighter(s, { kind: 'monster', monsterId: 7985, team: 'players', summonerId: d.id }, step(300, 1, 3));
      cast(s, d, 80500, p.cell);
      expect(hits(s, p.id).length > 0).toBe(touched);
    }
    const s = fight('minCrit', { spells: { impactCritHitsPoutch: true } });
    const d = arch(s, 'dompteur', 300, [80500]);
    const p = addFighter(s, { kind: 'monster', monsterId: 7985, team: 'players', summonerId: d.id }, step(300, 1, 3));
    cast(s, d, 80500, p.cell);
    expect(hits(s, p.id)).toEqual([5002]);
  });
});

describe('Grondement Grandissant (30396 → 30560)', () => {
  it.each([
    ['min', 80501, [5002, 4501]],
    ['max', 80501, [5612, 5050]],
    ['minCrit', 80501, [5978, 5380]],
    ['maxCrit', 80501, [6710, 6039]],
    ['min', 80751, [5002, 4501, 4001, 3501]],
  ] as const)('%s niveau %i : croix, centre puis −10 %%/case', (mode, sl, exp) => {
    const s = fight(mode);
    const d = arch(s, 'dompteur', 300, [sl]);
    const T = step(300, 1, 4);
    const targets = exp.map((_, k) => enemy(s, k === 0 ? T : step(T, 3, k)));
    const diag = enemy(s, step(T, 0, 1)); // hors croix
    cast(s, d, sl, T);
    expect(targets.map((t) => hits(s, t.id))).toEqual(exp.map((x) => [x]));
    expect(hits(s, diag.id)).toEqual([]);
  });

  it('relance exactement 2 tours plus tard : +20 de base (6 222) ; amélioré : le 406 en tête retire le bonus (5 002), sauf spells.ggUpgradedKeepsRecastBonus', () => {
    for (const [sl, over, exp] of [
      [80501, {}, 6222],
      [80751, {}, 5002],
      [80751, { spells: { ggUpgradedKeepsRecastBonus: true } }, 6222],
    ] as const) {
      const s = fight('min', over);
      const d = player(s, 'dompteur', 300, [sl]);
      const m = player(s, 'magicien', 286);
      setTimeline(s, [d.id, m.id]);
      const t = enemy(s, step(300, 1, 3));
      t.hp = t.baseMaxHp = 1_000_000;
      untilTurnOf(s, d);
      cast(s, d, sl, t.cell);
      untilTurnOf(s, d);
      expect(canCast(s, d.id, sl, t.cell).code).toBe('COOLDOWN');
      untilTurnOf(s, d);
      expect(spellBaseDamageBonus(d, s.ctx.getSpell(sl).spellId)).toBe(20);
      cast(s, d, sl, t.cell);
      expect(hits(s, t.id)).toEqual([5002, exp]);
    }
  });
});

describe('Prélèvement (30397 → 30561)', () => {
  it.each([
    ['min', 2562],
    ['max', 3050],
    ['minCrit', 3050],
    ['maxCrit', 3660],
  ] as const)('%s : érosion +15 %% puis vol de vie %i ; soin du lanceur = 50 %% des PV retirés', (mode, dmg) => {
    const s = fight(mode);
    const d = arch(s, 'dompteur', 300, [80502]);
    d.hp = 10000;
    const e = enemy(s, step(300, 1, 3));
    cast(s, d, 80502, e.cell);
    expect(hits(s, e.id)).toEqual([dmg]);
    expect(e.stat(Stat.EROSION)).toBe(25);
    expect(e.erodedHp).toBe(Math.floor((dmg * 25) / 100));
    expect(heals(s, d.id, true)).toEqual([Math.trunc(dmg * 0.5)]);
  });

  it('sans ligne de vue ; case vide : rien hors critique, zone C2 en critique (C3 amélioré)', () => {
    for (const [sl, mode, ring] of [[80502, 'min', 2], [80502, 'minCrit', 2], [80754, 'minCrit', 3]] as const) {
      const s = fight(mode);
      const d = arch(s, 'dompteur', 300, [sl]);
      enemy(s, step(300, 1, 1));
      const T = step(300, 1, 3);
      const near = enemy(s, step(T, 7, 1));
      const edge = enemy(s, step(T, 3, ring));
      cast(s, d, sl, T);
      if (mode === 'min') {
        expect(hits(s, near.id)).toEqual([]);
      } else {
        expect(hits(s, near.id)).toEqual([2745]);
        expect(hits(s, edge.id)).toEqual([Math.trunc(3050 * (1 - ring / 10))]);
      }
    }
  });

  it('érosion : cumul 3 (2 tours) en normal ; amélioré +20 % permanente, sans cumul maximal', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80502, 80754]);
    manyAp(d);
    const e = enemy(s, step(300, 1, 3));
    e.hp = e.baseMaxHp = 1_000_000;
    cast(s, d, 80502, e.cell);
    cast(s, d, 80502, e.cell);
    d.resetCastCounters();
    cast(s, d, 80502, e.cell);
    expect(e.stat(Stat.EROSION)).toBe(10 + 45);
    d.resetCastCounters();
    expect(canCast(s, d.id, 80502, e.cell).code).toBe('MAX_STACK');
    const up = e.buffs.filter((b) => b.spellId === 30561);
    expect(up).toHaveLength(0);
    cast(s, d, 80754, e.cell);
    const b = e.buffs.find((x) => x.spellId === 30561)!;
    expect(b.value).toBe(20);
    expect(b.duration).toBe(-1);
  });
});

describe('Détonation (30398 → 30562)', () => {
  it.each([
    ['min', 1, [2623]],
    ['max', 1, [2867]],
    ['minCrit', 1, [3111]],
    ['min', 2, [2928, 2635]],
    ['min', 3, [3233, 2909, 2909]],
  ] as const)('%s, %i ennemi(s) dans R1,1 : +5 de base par ennemi, 90 %% hors case ciblée', (mode, n, exp) => {
    const s = fight(mode);
    const d = arch(s, 'dompteur', 300, [80503]);
    setTimeline(s, [d.id]);
    untilTurnOf(s, d);
    const T = step(300, 1, 2);
    const cells = [T, step(T, 1, 1), step(T, 7, 1)];
    const es = cells.slice(0, n).map((c) => enemy(s, c));
    cast(s, d, 80503, T);
    expect(es.map((e) => hits(s, e.id))).toEqual(exp.map((x) => [x]));
    // le +5 par cible (sous-sort 30417, durée 1) reste porté jusqu'au prochain tour du Dompteur : le 406 de la
    // version normale vise 30398 et ne le retire pas (l'amélioré vise bien 30691) — sans effet en jeu (1 lancer / tour)
    expect(spellBaseDamageBonus(d, 30398)).toBe(5 * n);
    untilTurnOf(s, d);
    expect(spellBaseDamageBonus(d, 30398)).toBe(0);
  });

  it('amélioré : R2,1 (10 cases), 80 % aux extrémités ; une invocation alliée compte (masque j)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80756]);
    const T = step(300, 1, 2);
    const zone = s.ctx.getSpell(80756).effects[0]!.zone.cells(T, 300).filter((c) => c >= 0);
    expect(zone).toHaveLength(10);
    const e0 = enemy(s, T);
    const eEnd = enemy(s, step(T, 7, 2));
    const p = addFighter(s, { kind: 'monster', monsterId: 7985, team: 'players', summonerId: d.id }, step(T, 3, 1));
    cast(s, d, 80756, T);
    // 3 cibles (2 ennemis + Poutch) : (38 + 15) × 61 = 3 233 ; extrémité 80 % : 2 586
    expect(hits(s, e0.id)).toEqual([3233]);
    expect(hits(s, eEnd.id)).toEqual([2586]);
    expect(hits(s, p.id)).toEqual([2909]);
  });

  it('en ligne seulement (hors axe refusé)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80503]);
    expect(canCast(s, d.id, 80503, step(300, 0, 1)).code).toBe('OUT_OF_RANGE');
  });
});

describe('Coup de Sang (30399 → 30563)', () => {
  it('20 % des PV courants du lanceur à chaque ennemi du C2, sans dégressivité ni critique ; ×2 sur Vulnérable', () => {
    const s = fight('minCrit');
    const d = arch(s, 'dompteur', 300, [80504]);
    const T = step(300, 1, 3);
    const e0 = enemy(s, T);
    const e2 = enemy(s, step(T, 1, 2));
    const ev = enemy(s, step(T, 7, 1));
    vulnerable(s, ev);
    const r = cast(s, d, 80504, T);
    expect(r.critical).toBe(false);
    expect([hits(s, e0.id), hits(s, e2.id), hits(s, ev.id)]).toEqual([[6000], [6000], [12000]]);
  });

  it('coût : −10 % des PV courants du lanceur (3 000), ni bouclier, ni érosion (défaut), ni ×2 si le lanceur est Vulnérable (N1D §5.5)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80504]);
    const e = enemy(s, step(300, 1, 3));
    cast(s, d, 80504, e.cell);
    expect(d.hp).toBe(27000);
    expect(d.erodedHp).toBe(0);
    // lanceur Vulnérable : le malus 1048 n'est pas un dommage (StatBuff lifePointsMalus)
    const s2 = fight('min');
    const d2 = arch(s2, 'dompteur', 300, [80504]);
    const e2 = enemy(s2, step(300, 1, 3));
    vulnerable(s2, d2);
    cast(s2, d2, 80504, e2.cell);
    expect(hits(s2, e2.id)).toEqual([6000]);
    expect(d2.hp).toBe(27000);
  });

  it('PV courants réduits : 20 000 PV → 4 000 par cible, coût 2 000 ; amélioré C3 avec 10 % de dégressivité', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80758]);
    d.hp = 20000;
    const T = step(300, 1, 3);
    const e = [0, 1, 2, 3].map((k) => enemy(s, k === 0 ? T : step(T, 7, k)));
    cast(s, d, 80758, T);
    expect(e.map((x) => hits(s, x.id))).toEqual([[4000], [3600], [3200], [2800]]);
    expect(d.hp).toBe(18000);
  });
});

describe('Jaillissement (30400 → 30564)', () => {
  it('40 % des PV érodés du lanceur (5 000 → 2 000), carré G1 sans dégressivité, ×2 sur Vulnérable', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80505]);
    d.erodedHp = 5000;
    d.hp = 20000;
    const T = step(300, 1, 3);
    const e0 = enemy(s, T);
    const eCorner = enemy(s, step(T, 0, 1));
    const eOut = enemy(s, step(T, 1, 2));
    vulnerable(s, eCorner);
    cast(s, d, 80505, T);
    expect([hits(s, e0.id), hits(s, eCorner.id), hits(s, eOut.id)]).toEqual([[2000], [4000], []]);
  });

  it('amélioré : G2 (25 cases) avec dégressivité Chebyshev (1 800 / 1 600)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80760]);
    d.erodedHp = 5000;
    d.hp = 20000;
    const T = step(300, 1, 3);
    expect(s.ctx.getSpell(80760).effects[0]!.zone.cells(T, 300).filter((c) => c >= 0)).toHaveLength(25);
    const e1 = enemy(s, step(T, 0, 1));
    const e2 = enemy(s, step(T, 0, 2));
    cast(s, d, 80760, T);
    expect([hits(s, e1.id), hits(s, e2.id)]).toEqual([[1800], [1600]]);
  });

  it('Amélioration : Jaillissement (30475) : apprend le niveau 80750 inexistant → substitut 80760 par défaut, rien si spells.jaillissementUpgradeBroken', () => {
    for (const [broken, learnt] of [[false, true], [true, false]] as const) {
      const s = fight('min', { spells: { jaillissementUpgradeBroken: broken } });
      const d = player(s, 'dompteur', 300, [80505]);
      resolveSpell(s, d, s.ctx.getSpell(80636), d.cell);
      expect(d.knowsSpell(80760)).toBe(learnt);
      expect(d.knowsSpell(80505)).toBe(false);
    }
  });
});

describe('Ombre Fracassante (30401 → 30565)', () => {
  it('30 % des PV érodés de CHAQUE cible, fourche F2 sans dégressivité, en ligne ; ×2 sur Vulnérable', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80506]);
    const T = step(300, 1, 1);
    const a = enemy(s, T);
    a.erodedHp = 10000;
    const b = enemy(s, step(300, 1, 4));
    b.erodedHp = 5000;
    vulnerable(s, b);
    const c = enemy(s, step(300, 5, 1));
    c.erodedHp = 10000;
    cast(s, d, 80506, T);
    expect([hits(s, a.id), hits(s, b.id), hits(s, c.id)]).toEqual([[3000], [3000], []]);
  });

  it('amélioré : F3 avec dégressivité (2 400 à 2 pas de la pointe)', () => {
    const s = fight('min');
    const d = arch(s, 'dompteur', 300, [80762]);
    const T = step(300, 1, 1);
    const b = enemy(s, step(300, 1, 3));
    b.erodedHp = 10000;
    cast(s, d, 80762, T);
    expect(hits(s, b.id)).toEqual([2400]);
  });
});

// =============================================================================================
// 5. Magicien
// =============================================================================================

describe('Pulsation d’Énergie (30409 → 30575)', () => {
  it.each([
    ['min', 2684, 2684],
    ['max', 2928, 2928],
    ['minCrit', 3233, 3233],
    ['maxCrit', 3538, 3538],
  ] as const)('%s : dégâts à l’ennemi de la case ciblée %i ; soins des alliés du C2 (un seul tirage critique)', (mode, dmg, heal) => {
    const s = fight(mode);
    const m = arch(s, 'magicien', 300, [80514]);
    const T = step(300, 1, 3);
    const e = enemy(s, T);
    const ally0 = player(s, 'dompteur', step(T, 1, 1));
    const ally2 = player(s, 'acrobate', step(T, 7, 2));
    const e1 = enemy(s, step(T, 3, 1));
    for (const a of [ally0, ally2]) a.hp = 10000;
    cast(s, m, 80514, T);
    expect(hits(s, e.id)).toEqual([dmg]);
    expect(hits(s, e1.id)).toEqual([]);
    expect(heals(s, ally0.id)).toEqual([Math.trunc(heal * 0.9)]);
    expect(heals(s, ally2.id)).toEqual([Math.trunc(heal * 0.8)]);
  });

  it('amélioré : soin C3 (70 % à 3 cases) ; lançable sur soi (PO 0)', () => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [80786]);
    const ally = player(s, 'dompteur', step(300, 1, 3));
    ally.hp = 10000;
    m.hp = 10000;
    cast(s, m, 80786, 300);
    expect(heals(s, ally.id)).toEqual([1878]);
    expect(heals(s, m.id)).toEqual([2684]);
  });
});

describe('Regain Vigoureux (30410 → 30576)', () => {
  it('normal : +2 PA / +2 PM aux alliés du C3 autour du lanceur (lanceur compris), crédités aussitôt', () => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [80515]);
    const in3 = player(s, 'dompteur', step(300, 1, 3));
    const out4 = player(s, 'acrobate', step(300, 5, 4));
    const foe = enemy(s, step(300, 3, 1));
    cast(s, m, 80515, 300);
    expect([m.ap, m.mp]).toEqual([8, 6]);
    expect([in3.ap, in3.mp]).toEqual([10, 6]);
    expect([out4.ap, out4.mp]).toEqual([8, 4]);
    expect([foe.ap, foe.mp]).toEqual([11, 6]);
  });

  it('amélioré : +3 / +3 à tous les alliés de la carte', () => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [80788]);
    const far = player(s, 'acrobate', step(300, 5, 7));
    cast(s, m, 80788, 300);
    expect([far.ap, far.mp]).toEqual([11, 7]);
  });
});

describe('Amplification (30411 → 30578)', () => {
  it.each([
    [80516, 20, 30, 500, 20, 4977],
    [80791, 40, 50, 1000, 40, 5807],
  ] as const)('niveau %i : Dompteur +%i %% DF / +%i %% critique, Acrobate +%i DoPou, Magicien +%i %% soins ; Impact min → %i', (sl, df, crit, dopou, heal, impact) => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [sl]);
    manyAp(m);
    const d = player(s, 'dompteur', step(300, 1, 2));
    const a = player(s, 'acrobate', step(300, 5, 2));
    const m2 = player(s, 'magicien', step(300, 3, 2));
    cast(s, m, sl, d.cell);
    cast(s, m, sl, a.cell);
    m.resetCastCounters();
    cast(s, m, sl, m2.cell);
    expect([d.stat(Stat.FINAL_DAMAGE), d.stat(Stat.CRIT) - 10]).toEqual([df, crit]);
    expect(a.stat(Stat.PUSH_DAMAGE) - 1000).toBe(dopou);
    expect(m2.stat(Stat.FINAL_HEAL)).toBe(heal);
    // un seul bonus par archétype : pas de DF pour l'Acrobate, pas de DoPou pour le Dompteur
    expect([a.stat(Stat.FINAL_DAMAGE), d.stat(Stat.PUSH_DAMAGE)]).toEqual([0, 1000]);
    for (const f of [d, a, m2]) expect(f.hasState(5968)).toBe(true);
    const t = enemy(s, step(d.cell, 1, 3));
    cast(s, d, 80500, t.cell);
    expect(hits(s, t.id)).toEqual([impact]);
  });

  it('Acrobate amplifié : collision de Frappe Repoussoir 408 par case (DoPou 1 500)', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80516]);
    const a = player(s, 'acrobate', step(300, 5, 2));
    cast(s, m, 80516, a.cell);
    const e = enemy(s, step(a.cell, 5, 1));
    enemy(s, step(a.cell, 5, 2));
    cast(s, a, 80499, e.cell);
    // (floor(200 / 2) + 32 + 1 500) / 4 = 408 par case non parcourue, 2 cases
    expect(collisions(s, e.id)).toEqual([816]);
  });
});

describe('Protection Prolongée (30414 → 30584)', () => {
  it.each([
    [80519, 3000],
    [80800, 5000],
  ] as const)('niveau %i : bouclier %i qui absorbe les dégâts (y compris les 2 000 des pics) avant les PV', (sl, shield) => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [sl]);
    const d = player(s, 'dompteur', step(300, 1, 2));
    cast(s, m, sl, d.cell);
    expect(d.shield).toBe(shield);
    const t = mon(s, 7982, step(d.cell, 3, 4));
    cast(s, t, 80486, d.cell); // Tir d'Artroollerie min 1 736, puis poussée de 2 sans collision
    expect(d.shield).toBe(shield - 1736);
    expect(d.hp).toBe(30000);
    // les dommages de collision sont eux aussi absorbés (damage.py : seul le « faux dommage » 90/1047/1048 y échappe)
    const t2 = mon(s, 7982, step(d.cell, 3, 3));
    enemy(s, step(d.cell, 7, 1));
    cast(s, t2, 80486, d.cell);
    expect(d.shield).toBe(Math.max(0, shield - 1736 - 1736 - 66));
  });
});

describe('Délivrance (30415 → 30585)', () => {
  it('retire les envoûtements dispellable = 1 (Patroolleur, Inébranlable) mais pas Vulnérable (30701, dispellable 3)', () => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [80521]);
    const t = mob(s, TROOLLIBRE, step(300, 1, 3));
    cast(s, t, 80485, t.cell);
    vulnerable(s, t);
    expect(t.unshakable && t.hasState(5994)).toBe(true);
    expect(t.stat(Stat.FINAL_DAMAGE)).toBe(15);
    cast(s, m, 80521, t.cell);
    expect(t.unshakable).toBe(false);
    expect(t.stat(Stat.FINAL_DAMAGE)).toBe(0);
    expect(t.hasState(5994)).toBe(true);
  });

  it('ne retire pas les buffs de la Mama (tous non désenvoûtables) ; amélioré : 3 lancers, 1 par cible', () => {
    const s = fight('min');
    const m = arch(s, 'magicien', 300, [80802]);
    const mama = mob(s, MAMA, step(300, 1, 3));
    const n = mama.buffs.length;
    const states = mama.states.slice();
    cast(s, m, 80802, mama.cell);
    expect(mama.buffs.length).toBe(n);
    expect(mama.states).toEqual(states);
    expect(canCast(s, m.id, 80802, mama.cell).code).toBe('MAX_PER_TARGET');
  });
});

describe('Vents Contraires (30412 → 30579)', () => {
  it.each([
    ['min', 80517, 2806, 2, 1],
    ['max', 80517, 3172, 2, 1],
    ['minCrit', 80517, 3355, 2, 1],
    ['maxCrit', 80517, 3782, 2, 1],
    ['min', 80793, 2806, 3, 2],
  ] as const)('%s niveau %i : %i à l’ennemi de la case, −%i PM aux ennemis de la croix X%i', (mode, sl, dmg, pm, r) => {
    const s = fight(mode);
    const m = arch(s, 'magicien', 300, [sl]);
    const T = step(300, 1, 4);
    const e = enemy(s, T);
    const eR = enemy(s, step(T, 7, r));
    const eOut = enemy(s, step(T, 7, r + 1));
    const ally = player(s, 'dompteur', step(T, 3, 1));
    cast(s, m, sl, T);
    expect(hits(s, e.id)).toEqual([dmg]);
    expect(hits(s, eR.id)).toEqual([]);
    expect([e.mp, eR.mp, eOut.mp, ally.mp]).toEqual([6 - pm, 6 - pm, 6, 4]);
  });
});

describe('Vague de Dégradation (30413 → 30580)', () => {
  it.each([
    ['min', 80518, 1281, 15, 2],
    ['max', 80518, 1708, 15, 2],
    ['minCrit', 80518, 1525, 15, 2],
    ['maxCrit', 80518, 2074, 15, 2],
    ['min', 80795, 1281, 30, 3],
  ] as const)('%s niveau %i : %i à la case ciblée ; +%i %% érosion et −%i %% DF aux ennemis du C%i', (mode, sl, dmg, pct, r) => {
    const s = fight(mode);
    const m = arch(s, 'magicien', 300, [sl]);
    const T = step(300, 1, 4);
    const e = enemy(s, T);
    const eR = enemy(s, step(T, 7, r));
    const eOut = enemy(s, step(T, 7, r + 1));
    cast(s, m, sl, T);
    expect(hits(s, e.id)).toEqual([dmg]);
    // l'érosion est posée AVANT la frappe : elle s'applique déjà à ce coup
    expect(e.erodedHp).toBe(Math.floor((dmg * (10 + pct)) / 100));
    expect([e.stat(Stat.EROSION), eR.stat(Stat.EROSION), eOut.stat(Stat.EROSION)]).toEqual([10 + pct, 10 + pct, 10]);
    expect([e.stat(Stat.FINAL_DAMAGE), eR.stat(Stat.FINAL_DAMAGE), eOut.stat(Stat.FINAL_DAMAGE)]).toEqual([-pct, -pct, 0]);
  });
});

// =============================================================================================
// 6. Sorts uniques
// =============================================================================================

describe('Uniques de l’Acrobate', () => {
  it('Dégagez ! : +1 000 DoPou (3 tours) PUIS poussée de 5 de tous les ennemis depuis le lanceur ; collision 533 par case ; Mama pré-combat exclue ; oubli', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80828]);
    const e1 = enemy(s, step(300, 1, 6)); // 387 : 2 pas jusqu'au bord (431 non jouable) → reste 3
    const e2 = enemy(s, step(300, 5, 2));
    const ally = player(s, 'dompteur', step(300, 3, 2));
    const mama = mob(s, MAMA, 152);
    cast(s, a, 80828, 300);
    expect(a.stat(Stat.PUSH_DAMAGE)).toBe(2000);
    expect(e1.cell).toBe(step(300, 1, 8));
    expect(collisions(s, e1.id)).toEqual([3 * 533]);
    expect(e2.cell).toBe(step(300, 5, 7));
    expect(ally.cell).toBe(step(300, 3, 2));
    expect(mama.cell).toBe(152);
    expect(a.knowsSpell(80828)).toBe(false);
  });

  it('Courage, fuyons : +4 PM à tous les alliés 2 tours', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80829]);
    const far = player(s, 'magicien', step(300, 5, 6));
    const foe = enemy(s, step(300, 1, 2));
    cast(s, a, 80829, 300);
    expect([a.mp, far.mp, foe.mp]).toEqual([8, 8, 6]);
    expect(a.knowsSpell(80829)).toBe(false);
  });

  it('Immortalité du Courageux : seuil 1 PV (2 tours) sur le lanceur, interception des alliés en C2 de la cible, avance de 63, Endolori sur la cible', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80844]);
    const ally = player(s, 'dompteur', step(300, 1, 6));
    const near = player(s, 'magicien', step(ally.cell, 7, 1));
    cast(s, a, 80844, ally.cell);
    expect(a.cell).toBe(step(300, 1, 5));
    expect(ally.hasState(5967)).toBe(true);
    const t = mon(s, 7982, step(near.cell, 7, 5));
    cast(s, t, 80486, near.cell);
    expect(hits(s, near.id)).toEqual([]);
    expect(hits(s, a.id)).toEqual([1736]);
    a.hp = 100;
    applyDamage(s, t, a, 5000, { actionId: 100 });
    expect([a.alive, a.hp]).toEqual([true, 1]);
  });

  it('Malédiction Mouvante : un ennemi frappé est repoussé de 2 par l’attaquant (1 tour)', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80845]);
    const e = enemy(s, step(300, 1, 3));
    const d = player(s, 'dompteur', step(e.cell, 5, 2));
    cast(s, a, 80845, 300);
    expect(e.hasState(5980)).toBe(true);
    // le Dompteur frappe (Frappe Repoussoir : poussée 2 puis dégâts) → la malédiction repousse encore de 2 depuis lui
    cast(s, d, 80499, e.cell);
    expect(e.cell).toBe(step(300, 1, 7));
  });

  it('Chamboulement : poussée de 5 depuis le lanceur, sans LdV ; rebond sur le plus proche non marqué s’il subit des dommages de poussée', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80846]);
    enemy(s, step(300, 1, 1)); // bloque la ligne de vue
    const e = enemy(s, step(300, 1, 3));
    const wall = enemy(s, step(300, 1, 5));
    cast(s, a, 80846, e.cell);
    expect(e.cell).toBe(step(300, 1, 4));
    expect(collisions(s, e.id)).toEqual([4 * 283]);
    // rebond : le plus proche non marqué (wall, au contact) est poussé de 5 depuis e
    expect(wall.cell).toBe(step(300, 1, 8));
  });

  it('Un pour un : dommages subis ×50 % et renvoi de 100 % des dommages finaux à l’attaquant (2 tours)', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80847]);
    cast(s, a, 80847, 300);
    const t = mon(s, 7982, step(300, 1, 4));
    cast(s, t, 80486, a.cell);
    expect(hits(s, a.id)).toEqual([868]);
    expect(hits(s, t.id)).toEqual([868]);
  });

  it('Pense Vite : tour suivant de 10 s, +999 PA au tour suivant seulement, oubli', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80843]);
    const d = player(s, 'dompteur', 286);
    setTimeline(s, [a.id, d.id]);
    untilTurnOf(s, a);
    cast(s, a, 80843, 300);
    expect(a.knowsSpell(80843)).toBe(false);
    expect(a.ap).toBe(3);
    untilTurnOf(s, a);
    expect([a.ap, a.turnSeconds]).toEqual([1007, 10]);
    untilTurnOf(s, a);
    expect([a.ap, a.turnSeconds]).toEqual([8, 60]);
  });
});

describe('Uniques du Dompteur', () => {
  it.each([
    ['min', 5734, 11468],
    ['max', 6466, 12932],
  ] as const)('Punition Collective %s : %i à tous les ennemis, %i sur Vulnérable ; Mama pré-combat exclue ; alliés épargnés', (mode, n, v) => {
    const s = fight(mode);
    const d = player(s, 'dompteur', 300, [80826]);
    const far = enemy(s, step(300, 1, 7));
    const vul = enemy(s, step(300, 5, 3));
    vulnerable(s, vul);
    const ally = player(s, 'magicien', step(300, 3, 2));
    const mama = mob(s, MAMA, 152);
    cast(s, d, 80826, 300);
    expect([hits(s, far.id), hits(s, vul.id), hits(s, ally.id), hits(s, mama.id)]).toEqual([[n], [v], [], []]);
    expect(d.knowsSpell(80826)).toBe(false);
  });

  it('Galvanisation : +4 PA à tous les alliés, crédités aussitôt (lanceur : 8 − 5 + 4)', () => {
    const s = fight('min');
    const d = player(s, 'dompteur', 300, [80827]);
    const far = player(s, 'acrobate', step(300, 5, 6));
    cast(s, d, 80827, 300);
    expect([d.ap, far.ap]).toEqual([7, 12]);
  });

  it.each([
    ['min', 11407],
    ['max', 12322],
    ['minCrit', 14457],
    ['maxCrit', 15372],
  ] as const)('Relâchement de Fureur sans bonus %s : %i (portée 1–63 sans LdV)', (mode, exp) => {
    const s = fight(mode);
    const d = player(s, 'dompteur', 213, [80839]);
    enemy(s, step(213, 1, 1));
    const e = enemy(s, step(213, 1, 12));
    e.hp = e.baseMaxHp = 100000;
    cast(s, d, 80839, e.cell);
    expect(hits(s, e.id)).toEqual([exp]);
  });

  it('Pulsation Chaotique : k-ième cible (35 + 20(k−1)) × 61, rebond sur l’ennemi non marqué le plus proche ; Mama pré-combat exclue', () => {
    const s = fight('min');
    const d = player(s, 'dompteur', 300, [80840]);
    const e1 = enemy(s, step(300, 1, 2));
    const e3 = enemy(s, step(e1.cell, 1, 4));
    const e2 = enemy(s, step(e1.cell, 3, 2)); // plus proche de e1 que e3
    const mama = mob(s, MAMA, 152);
    cast(s, d, 80840, e1.cell);
    expect([hits(s, e1.id), hits(s, e2.id), hits(s, e3.id), hits(s, mama.id)]).toEqual([[2135], [3355], [4575], []]);
    // fin de chaîne : bonus +20 et états Marqué retirés
    expect(spellBaseDamageBonus(d, 30667)).toBe(0);
    for (const e of [e1, e2, e3]) expect(e.hasState(5916)).toBe(false);
  });

  it('Malédiction Collatérale : 50 % des dommages finaux subis renvoyés aux alliés du porteur en C2 (pas au porteur), en chaîne sans boucle', () => {
    const s = fight('min');
    const d = player(s, 'dompteur', 300, [80841, 80500]);
    manyAp(d);
    const a = enemy(s, step(300, 1, 4));
    const b = enemy(s, step(a.cell, 1, 2));
    const c = enemy(s, step(a.cell, 1, 3));
    cast(s, d, 80841, 300);
    expect([a, b, c].every((x) => x.hasState(5979))).toBe(true);
    // Impact centré à 1 case de a (a seul dans le C2) : 3 733 ; a renvoie 1 866 à b (2 cases, sans dégressivité) ;
    // b renvoie 933 à c puis à a ; c renvoie 466 à b ; aucun buff ne se redéclenche sur sa propre chaîne
    cast(s, d, 80500, step(a.cell, 5, 1));
    expect([hits(s, a.id), hits(s, b.id), hits(s, c.id)]).toEqual([[3733, 933], [1866, 466], [933]]);
    // spells.maledictionCollateraleChains = false : un renvoi ne déclenche pas d'autre renvoi
    const s2 = fight('min', { spells: { maledictionCollateraleChains: false } });
    const d2 = player(s2, 'dompteur', 300, [80841, 80500]);
    manyAp(d2);
    const a2 = enemy(s2, step(300, 1, 4));
    const b2 = enemy(s2, step(a2.cell, 1, 2));
    cast(s2, d2, 80841, 300);
    cast(s2, d2, 80500, step(a2.cell, 5, 1));
    expect([hits(s2, a2.id), hits(s2, b2.id)]).toEqual([[3733], [1866]]);
  });

  it('Immortalité du Berserker : seuil 1 PV jusqu’au prochain tour, Endolori, cumul max 1', () => {
    const s = fight('min');
    const d = player(s, 'dompteur', 300, [80842]);
    cast(s, d, 80842, 300);
    expect(d.hasState(5967)).toBe(true);
    const t = enemy(s, step(300, 1, 1));
    applyDamage(s, t, d, 50000, { actionId: 100 });
    expect([d.alive, d.hp]).toEqual([true, 1]);
  });
});

describe('Uniques du Magicien', () => {
  it.each([
    ['min', 17324],
    ['max', 19032],
  ] as const)('Influx de Vitalité %s : %i à chaque allié de la carte, sans dégressivité', (mode, v) => {
    const s = fight(mode);
    const m = player(s, 'magicien', 300, [80830]);
    const far = player(s, 'acrobate', step(300, 5, 6));
    far.hp = 5000;
    m.hp = 25000;
    cast(s, m, 80830, 300);
    expect(heals(s, far.id)).toEqual([v]);
    expect(heals(s, m.id)).toEqual([5000]);
  });

  it('Démotivation des troupes : −35 % DF 2 tours aux ennemis (Mama pré-combat exclue)', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80832]);
    const e = enemy(s, step(300, 1, 7));
    const mama = mob(s, MAMA, 152);
    cast(s, m, 80832, 300);
    expect([e.stat(Stat.FINAL_DAMAGE), mama.stat(Stat.FINAL_DAMAGE)]).toEqual([-35, 25]);
  });

  it('Immortalité du Bienfaiteur : seuil 1 PV permanent sur l’allié ; au seuil : soin 50 % PV max puis dissipation', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80848]);
    const ally = player(s, 'dompteur', step(300, 1, 7));
    expect(canCast(s, m.id, 80848, 300).code).toBe('OUT_OF_RANGE');
    cast(s, m, 80848, ally.cell);
    const t = enemy(s, step(ally.cell, 5, 1));
    applyDamage(s, t, ally, 40000, { actionId: 100 });
    flushTriggers(s);
    expect(ally.alive).toBe(true);
    // 29 999 PV perdus jusqu'au seuil → 2 999 PV érodés (10 %) → PV max 27 001 → soin 50 % = 13 500
    expect(ally.maxHp).toBe(27001);
    expect(ally.hp).toBe(1 + 13500);
    expect(ally.buffs.some((b) => b.spellId === 30620 && b.kind === 'threshold')).toBe(false);
  });

  it('Malédiction Régénérante : chaque ennemi frappé soigne de 100 % des dommages subis les alliés à ≤ 2 cases de lui', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80849]);
    const e = enemy(s, step(300, 1, 3));
    const d = player(s, 'dompteur', step(e.cell, 7, 3), [80500]);
    const near = player(s, 'acrobate', step(e.cell, 1, 2));
    const far = player(s, 'acrobate', step(e.cell, 1, 3));
    near.hp = 10000;
    far.hp = 10000;
    cast(s, m, 80849, 300);
    expect(e.hasState(5981)).toBe(true);
    cast(s, d, 80500, e.cell);
    // Impact 4 148 sur e → soin de 100 % (non boosté) à l'allié à 2 cases de e (C2, dégressivité 10 %/case :
    // 80 %), rien à 3 cases
    expect(hits(s, e.id)).toEqual([4148]);
    expect(heals(s, near.id)).toEqual([Math.trunc(4148 * 0.8)]);
    expect(heals(s, far.id)).toEqual([]);
  });

  it('Muraille collective : bouclier 15 000 à tous les alliés', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80850]);
    const far = player(s, 'acrobate', step(300, 5, 6));
    cast(s, m, 80850, 300);
    expect([m.shield, far.shield]).toEqual([15000, 15000]);
  });

  it('Ultime Espoir sur un autre allié : soin de 100 % des PV max (non boosté)', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80851]);
    const ally = player(s, 'dompteur', step(300, 1, 7));
    ally.hp = 1000;
    cast(s, m, 80851, ally.cell);
    expect(ally.hp).toBe(30000);
    expect(m.knowsSpell(80851)).toBe(false);
  });

  it('Ultime Espoir sur soi : ressuscite le DERNIER allié mort, à 50 % de ses PV (N1M §5)', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300, [80851]);
    const first = player(s, 'acrobate', step(300, 1, 2));
    const last = player(s, 'dompteur', step(300, 5, 2));
    const k = enemy(s, step(300, 3, 3));
    killFighter(s, first, k.id, 'damage');
    killFighter(s, last, k.id, 'damage');
    cast(s, m, 80851, 300);
    expect([last.alive, last.hp, last.cell]).toEqual([true, 15000, step(300, 5, 2)]);
    expect(first.alive).toBe(false);
  });
});

describe('journal : un lancer produit des messages en français', () => {
  it('Videur : lancer, poussée, dégâts', () => {
    const s = fight('min');
    const a = player(s, 'acrobate', 300, [80507]);
    const e = enemy(s, step(300, 1, 3));
    cast(s, a, 80507, e.cell);
    const text = s.describeLog().join('\n');
    expect(text).toMatch(/Videur/);
    expect(sum(hits(s, e.id))).toBe(3599);
  });
});

// =============================================================================================
// 7. Améliorations (cadeaux), Acclamations, exemples chiffrés des fiches
// =============================================================================================

describe('Améliorations « Amélioration : X » (ETUDE §4.1, §8.2) : état boostedSpell, oubli du niveau de base, niveau amélioré appris', () => {
  const PAIRS: Array<[number, 'acrobate' | 'dompteur' | 'magicien', number, number, number]> = [
    [80630, 'dompteur', 80500, 80748, 5996],
    [80632, 'dompteur', 80501, 80751, 5997],
    [80633, 'dompteur', 80502, 80754, 5998],
    [80634, 'dompteur', 80503, 80756, 5999],
    [80635, 'dompteur', 80504, 80758, 6000],
    [80636, 'dompteur', 80505, 80760, 6001],
    [80637, 'dompteur', 80506, 80762, 6002],
    [80639, 'acrobate', 80507, 80766, 6003],
    [80640, 'acrobate', 80509, 80773, 6004],
    [80641, 'acrobate', 80510, 80775, 6005],
    [80642, 'acrobate', 80522, 80778, 6006],
    [80643, 'acrobate', 80511, 80780, 6007],
    [80644, 'acrobate', 80512, 80782, 6008],
    [80645, 'acrobate', 80513, 80784, 6009],
    [80646, 'magicien', 80514, 80786, 6010],
    [80647, 'magicien', 80515, 80788, 6011],
    [80648, 'magicien', 80516, 80791, 6012],
    [80649, 'magicien', 80517, 80793, 6013],
    [80650, 'magicien', 80518, 80795, 6014],
    [80651, 'magicien', 80519, 80800, 6015],
    [80652, 'magicien', 80521, 80802, 6016],
  ];
  it.each(PAIRS)('choix %i (%s) : %i → %i, état %i', (choice, key, base, up, state) => {
    const s = fight('min');
    const f = player(s, key, 300);
    expect(f.knowsSpell(base)).toBe(true);
    resolveSpell(s, f, s.ctx.getSpell(choice), f.cell);
    expect([f.knowsSpell(base), f.knowsSpell(up), f.hasState(state)]).toEqual([false, true, true]);
    // même emplacement du grimoire
    expect(f.spells.find((x) => x.spellLevelId === up)!.slot).toBeGreaterThanOrEqual(0);
  });

  it('nouveau sort : l’intervalle de relance repart de zéro (Grondement lancé puis amélioré dans le même tour)', () => {
    const s = fight('min');
    const d = player(s, 'dompteur', 300);
    manyAp(d);
    const e = enemy(s, step(300, 1, 3));
    cast(s, d, 80501, e.cell);
    expect(canCast(s, d.id, 80501, e.cell).code).toBe('COOLDOWN');
    resolveSpell(s, d, s.ctx.getSpell(80632), d.cell);
    expect(canCast(s, d.id, 80751, e.cell).ok).toBe(true);
  });
});

describe('Acclamations de la foule (ETUDE §4.5) : bonus permanent simple (pas de double application : l’effet de la carte est un affichage)', () => {
  const CARDS: Array<[number, 'acrobate' | 'dompteur' | 'magicien', number, number]> = [
    [80816, 'dompteur', Stat.AP, 1],
    [80817, 'dompteur', Stat.MP, 1],
    [80886, 'dompteur', Stat.RANGE, 1],
    [80818, 'dompteur', Stat.FINAL_DAMAGE, 10],
    [80887, 'dompteur', Stat.CRIT_DAMAGE, 500],
    [80888, 'dompteur', Stat.CRIT, 20],
    [80819, 'acrobate', Stat.AP, 1],
    [80820, 'acrobate', Stat.MP, 1],
    [80889, 'acrobate', Stat.RANGE, 1],
    [80821, 'acrobate', Stat.RES_ALL, 10],
    [80890, 'acrobate', Stat.PUSH_DAMAGE, 200],
    [80891, 'acrobate', Stat.RES_MELEE, 10],
    [80822, 'magicien', Stat.AP, 1],
    [80823, 'magicien', Stat.MP, 1],
    [80883, 'magicien', Stat.RANGE, 1],
    [80824, 'magicien', Stat.VITALITY, 5000],
    [80884, 'magicien', Stat.FINAL_HEAL, 20],
    [80885, 'magicien', Stat.RES_RANGED, 15],
  ];
  it.each(CARDS)('carte %i (%s) : stat %i +%i, cumulable, permanente', (card, key, stat, v) => {
    const s = fight('min');
    const f = player(s, key, 300);
    const before = f.stat(stat as never);
    resolveSpell(s, f, s.ctx.getSpell(card), f.cell);
    expect(f.stat(stat as never) - before).toBe(v);
    resolveSpell(s, f, s.ctx.getSpell(card), f.cell);
    expect(f.stat(stat as never) - before).toBe(2 * v);
    for (const b of f.buffs.filter((x) => x.stat === stat)) expect(b.duration).toBe(-1);
  });

  it('Acclamation critique : +500 dommages critiques seulement sur les effets critiques (Impact 5 002 → 5 502 ; hors critique 4 148)', () => {
    for (const [mode, exp] of [['min', 4148], ['minCrit', 5502]] as const) {
      const s = fight(mode);
      const d = player(s, 'dompteur', 300);
      resolveSpell(s, d, s.ctx.getSpell(80887), d.cell);
      const e = enemy(s, step(300, 1, 3));
      cast(s, d, 80500, e.cell);
      expect(hits(s, e.id)).toEqual([exp]);
    }
  });

  it('Acclamation vitalesque : +5 000 PV max ET PV courants', () => {
    const s = fight('min');
    const m = player(s, 'magicien', 300);
    resolveSpell(s, m, s.ctx.getSpell(80824), m.cell);
    expect([m.hp, m.maxHp]).toEqual([35000, 35000]);
  });
});

describe('exemples chiffrés des fiches (workedExamples)', () => {
  it.each([
    [286, [[242, 199]]],
    [287, [[229, 242, 199], [345, 358, 402]]],
    [314, [[256, 242, 199], [372, 358, 402]]],
    [315, [[358, 358, 402]]],
  ] as const)('Acrobate T1 (archetype_acrobate.json) : depuis %i', (from, casts) => {
    const s = fight('min');
    const others = [286, 287, 314, 315].filter((c) => c !== from);
    const a = arch(s, 'acrobate', from, [80507]);
    for (const c of others) arch(s, 'magicien', c);
    const trolls = new Map([242, 358].map((c) => [c, enemy(s, c)]));
    for (const cst of casts) {
      const [cell, troll, dest] = cst.length === 3 ? cst : [cst[0], cst[0], cst[1]];
      cast(s, a, 80507, cell);
      expect(trolls.get(troll)!.cell).toBe(dest);
      expect(s.ctx.grid.isSpike(dest)).toBe(true);
    }
    // les autres lignes sont bloquées par un allié (286 et 315) ou déjà utilisées
    if (from === 286) expect(canCast(s, a.id, 80507, 358).ok).toBe(false);
  });

  it('Magicien T1 (archetype_magicien.json) : sorts lançables sans bouger sur les Troolls en 199 et 402', () => {
    const NAMES: Record<number, string> = { 80499: 'Frappe Repoussoir', 80518: 'Vague de Dégradation', 80517: 'Vents Contraires', 80514: 'Pulsation' };
    const expected: Record<number, Record<number, string[]>> = {
      286: { 199: ['Frappe Repoussoir', 'Vague de Dégradation', 'Vents Contraires'], 402: [] },
      287: { 199: ['Vents Contraires'], 402: ['Vents Contraires'] },
      314: { 199: ['Vents Contraires'], 402: ['Vents Contraires'] },
      315: { 199: [], 402: ['Frappe Repoussoir', 'Vague de Dégradation', 'Vents Contraires'] },
    };
    for (const from of [286, 287, 314, 315]) {
      const s = fight('min');
      const m = arch(s, 'magicien', from, 'all');
      for (const c of [286, 287, 314, 315].filter((x) => x !== from)) arch(s, 'dompteur', c);
      enemy(s, 199);
      enemy(s, 402);
      for (const troll of [199, 402]) {
        const ok = [80499, 80514, 80518, 80517].filter((sl) => canCast(s, m.id, sl, troll).ok).map((sl) => NAMES[sl]);
        expect(ok, `${from} → ${troll}`).toEqual(expected[from]![troll]);
      }
      // « Pulsation +1 PO » : lançable avec une Acclamation optique quand la cible est à 6
      m.setBaseStat(Stat.RANGE, 1);
      const withPo = [199, 402].filter((t) => canCast(s, m.id, 80514, t).ok);
      const six = [199, 402].filter((t) => distance(from, t) === 6 && expected[from]![t]!.length > 0);
      expect(withPo).toEqual(six);
    }
  });

  it('Pulsation d’Énergie depuis/vers 286, 287, 300, 314, 315 : soigne les 4 cases de départ (geometry.pulsationHealsAll4StartCellsFromTargets)', () => {
    for (const T of [286, 287, 300, 314, 315]) {
      const s = fight('min');
      const m = arch(s, 'magicien', 286, [80514]);
      const others = [287, 314, 315].map((c) => arch(s, 'dompteur', c));
      for (const f of [m, ...others]) f.hp = 10000;
      cast(s, m, 80514, T);
      for (const f of [m, ...others]) expect(heals(s, f.id).length, `cible ${T}, allié ${f.cell}`).toBe(1);
    }
  });
});

describe('tailles de zone annoncées (ETUDE §4.2-§4.4, §8.2) : nombre de cases de la zone de chaque effet réel', () => {
  // [niveau, index de l'effet exécuté (liste normale), cases attendues]
  const ZONES: Array<[number, number, number, string]> = [
    [80507, 0, 5, 'Videur T2'],
    [80766, 0, 7, 'Videur T3'],
    [80513, 0, 10, 'Hanedimane F2'],
    [80784, 0, 13, 'Hanedimane F3'],
    [80522, 2, 5, 'Aïronemane X1'],
    [80509, 1, 21, 'Soutien X5'],
    [80509, 2, 21, 'Soutien +5 (41 avec X5, centre commun)'],
    [80773, 1, 29, 'Soutien X7'],
    // +7 : 29 cases en théorie (57 avec X7) ; autour de 300, l'extrémité (+7, +7) sort de la grille de 560 cases
    [80773, 2, 28, 'Soutien +7 (une extrémité hors grille)'],
    [80500, 0, 13, 'Impact C2'],
    [80748, 0, 25, 'Impact C3'],
    [80501, 0, 5, 'Grondement X1'],
    [80751, 1, 13, 'Grondement X3'],
    [80503, 0, 6, 'Détonation R1,1'],
    [80756, 0, 10, 'Détonation R2,1'],
    [80504, 0, 13, 'Coup de Sang C2'],
    [80758, 0, 25, 'Coup de Sang C3'],
    [80505, 0, 9, 'Jaillissement G1'],
    [80760, 0, 25, 'Jaillissement G2'],
    [80506, 0, 10, 'Ombre Fracassante F2'],
    [80762, 0, 13, 'Ombre Fracassante F3'],
    [80514, 0, 13, 'Pulsation soin C2'],
    [80786, 0, 25, 'Pulsation soin C3'],
    [80515, 0, 25, 'Regain C3'],
    [80517, 1, 5, 'Vents −PM X1'],
    [80793, 0, 9, 'Vents −PM X2'],
    [80518, 0, 13, 'Vague C2'],
    [80795, 0, 25, 'Vague C3'],
    [80844, 2, 13, 'Immortalité du Courageux : interception C2'],
    [80483, 0, 12, 'Troollpoline C2,1'],
    [80487, 0, 25, 'Mortrooll C3'],
    [80497, 0, 25, 'Mitroollette C3'],
    [80491, 0, 5, 'Troollooportation X1'],
  ];
  it.each(ZONES)('niveau %i, effet %i : %i cases (%s)', (sl, idx, n) => {
    const s = fight();
    const e = s.ctx.getSpell(sl).effects[idx]!;
    const cells = e.zone.cells(300, step(300, 5, 3)).filter((c) => c >= 0);
    expect(cells.length).toBe(n);
  });

  it('Prélèvement critique : C2 (13) → C3 (25)', () => {
    const s = fight();
    expect(s.ctx.getSpell(80502).critEffects[0]!.zone.cells(300, 257).filter((c) => c >= 0)).toHaveLength(13);
    expect(s.ctx.getSpell(80754).critEffects[0]!.zone.cells(300, 257).filter((c) => c >= 0)).toHaveLength(25);
  });
});

describe('N1A §7.1 : poussée axiale de n cases à k cases des pics → pics + (n − k − 1) × DoPou', () => {
  // axe 300 → dir 1 : cases 1 à 6 sûres, 7 et 8 = pics (402, 416), 9 hors arène
  const SPELLS: Array<[string, number, number, number, 'target' | 'self']> = [
    ['Frappe Repoussoir', 80499, 2, 283, 'target'],
    ['Videur', 80507, 3, 283, 'target'],
    ['Videur amélioré', 80766, 4, 283, 'target'],
    ['Aïronemane amélioré (depuis le centre de la croix)', 80778, 4, 283, 'target'],
    ['Hanedimane amélioré', 80784, 6, 283, 'target'],
    ['Dégagez ! (DoPou 2 000)', 80828, 5, 533, 'self'],
  ];
  for (const [name, sl, n, perCell, how] of SPELLS) {
    it.each([1, 2, 3, 4, 5])(`${name} (${n}) à k = %i`, (k) => {
      const s = fight('min');
      const targetCell = step(300, 1, 7 - k);
      const t = enemy(s, targetCell);
      let casterCell: number;
      let cell: number;
      if (how === 'self') {
        casterCell = step(targetCell, 5, 1);
        cell = casterCell;
      } else if (sl === 80778) {
        // Aïronemane : téléportation sur la case derrière la cible, poussée depuis le centre de la croix
        casterCell = step(targetCell, 5, 3);
        cell = step(targetCell, 5, 1);
      } else {
        casterCell = step(targetCell, 5, 1);
        cell = targetCell;
      }
      const a = arch(s, 'acrobate', casterCell, [sl]);
      if (how === 'self') resolveSpell(s, a, s.ctx.getSpell(80912), a.cell);
      cast(s, a, sl, cell);
      const dist = Math.min(7 - k + n, 8);
      expect(t.cell).toBe(step(300, 1, dist));
      const r = Math.max(0, n - (k + 1));
      expect(collisions(s, t.id)).toEqual(r > 0 ? [r * perCell] : []);
      expect(s.ctx.grid.isSpike(t.cell)).toBe(n >= k);
    });
  }
});

// =============================================================================================
// 8. Dans l'arène (pics posés par l'entité de scénario : aura 1091, glyphe de début de tour 401)
// =============================================================================================

describe('sorts dans l’arène : interaction avec les pics (ETUDE §9.13, §10.2)', () => {
  function arenaFight(mode: RollName = 'min'): FightState {
    const s = fight(mode);
    const sce = addFighter(s, { kind: 'scenario' }, -1);
    resolveSpell(s, sce, s.ctx.getSpell(80489), -1);
    return s;
  }

  it('Frappe Repoussoir à k = 2 : entrée dans les pics (2 000) PUIS frappe doublée (1 952)', () => {
    const s = arenaFight();
    const a = player(s, 'acrobate', step(300, 1, 4));
    const t = mob(s, TROOLLIBRE, step(300, 1, 5));
    cast(s, a, 80499, t.cell);
    expect(t.cell).toBe(step(300, 1, 7));
    expect(hits(s, t.id)).toEqual([2000, 1952]);
  });

  it('Dégagez ! : trois Troolls poussés dans les pics (2 000 chacun, collisions à 533) puis Punition Collective ×2 (11 468)', () => {
    const s = arenaFight();
    const a = player(s, 'acrobate', 300, [80828]);
    const d = player(s, 'dompteur', 286, [80826]);
    const t1 = mob(s, TROOLLIBRE, step(300, 1, 6));
    const t2 = mob(s, 7982, step(300, 3, 4));
    const t3 = mob(s, 7983, step(300, 7, 3));
    cast(s, a, 80828, 300);
    expect(hits(s, t1.id)).toEqual([2000]);
    expect(collisions(s, t1.id)).toEqual([1599]);
    expect([t2.cell, t3.cell]).toEqual([step(300, 3, 8), step(300, 7, 8)]);
    expect(hits(s, t2.id)).toEqual([2000]);
    expect(collisions(s, t2.id)).toEqual([533]);
    expect(hits(s, t3.id)).toEqual([2000]);
    expect(collisions(s, t3.id)).toEqual([]);
    cast(s, d, 80826, d.cell);
    for (const t of [t1, t2, t3]) expect(hits(s, t.id).at(-1)).toBe(11468);
  });

  it('Coup de Sang sur un Trooll dans les pics : 12 000 ; Jaillissement et Ombre Fracassante doublés aussi', () => {
    const s = arenaFight();
    const d = player(s, 'dompteur', step(300, 1, 3), [80504, 80506]);
    manyAp(d);
    const t = mob(s, TROOLLIBRE, step(300, 1, 7));
    enterMarksAt(s, t); // apparition sur une marque : entrée décidée par l'appelant
    expect(hits(s, t.id)).toEqual([2000]);
    cast(s, d, 80504, t.cell);
    expect(hits(s, t.id).at(-1)).toBe(12000);
    const eroded = t.erodedHp;
    cast(s, d, 80506, step(d.cell, 1, 1));
    expect(hits(s, t.id).at(-1)).toBe(2 * Math.trunc((30 * eroded) / 100));
  });

  it('Hanedimane : un allié attiré HORS des pics devient Vulnérable ×2 (30700 → 30701) ; l’ennemi repoussé DANS les pics prend 2 000', () => {
    const s = arenaFight();
    const a = player(s, 'acrobate', step(300, 1, 3), [80513]);
    const ally = player(s, 'dompteur', step(300, 1, 7)); // dans les pics, sur la pointe (4, 0) de la fourche
    enterMarksAt(s, ally);
    expect(ally.hasState(5903)).toBe(true);
    const e = mob(s, TROOLLIBRE, step(300, 5, 3));
    cast(s, a, 80513, step(a.cell, 1, 1));
    // allié dans l'axe : attiré de 4 jusqu'au contact du lanceur
    expect(ally.cell).toBe(step(a.cell, 1, 1));
    expect(ally.hasState(5994)).toBe(true);
    expect(ally.buffs.some((b) => b.kind === 'multiplier' && b.spellId === 30701 && b.value === 200)).toBe(true);
    // (l'ennemi est derrière le lanceur : hors de la fourche)
    expect(e.cell).toBe(step(300, 5, 3));
  });

  it('Voltige depuis les pics sur un Trooll : il entre (2 000) puis prend 3 538 × 2 ; l’Acrobate sort, Vulnérable ×2', () => {
    const s = arenaFight();
    const a = player(s, 'acrobate', step(300, 1, 7), [80510]);
    enterMarksAt(s, a);
    expect(hits(s, a.id)).toEqual([2000]);
    const t = mob(s, TROOLLIBRE, step(300, 1, 3));
    cast(s, a, 80510, t.cell);
    expect(t.cell).toBe(step(300, 1, 7));
    expect(hits(s, t.id)).toEqual([2000, 7076]);
    expect(a.hasState(5994)).toBe(true);
    expect(a.hasState(5903)).toBe(false);
  });

  it('Rassemblement : les joueurs repoussés au bord entrent dans les pics (2 000 chacun, sans collision)', () => {
    const s = arenaFight();
    const m = mon(s, MAMA, 300);
    const p1 = player(s, 'dompteur', step(300, 1, 2));
    const p2 = player(s, 'magicien', step(300, 7, 3));
    resolveSpell(s, m, s.ctx.getSpell(80931), 300);
    for (const p of [p1, p2]) {
      expect(s.ctx.grid.isSpike(p.cell)).toBe(true);
      expect(hits(s, p.id)).toEqual([2000]);
      expect(collisions(s, p.id)).toEqual([]);
    }
  });
});
