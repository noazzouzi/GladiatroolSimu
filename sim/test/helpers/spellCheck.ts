/**
 * Aides de la vérification adversariale sort par sort (spells-archetypes / spells-monsters) : combats minimaux sur la
 * carte réelle, modes de jet, lecture du journal, et vérification GÉNÉRIQUE des conditions de lancer d'un niveau de sort
 * (PA, portée, PO modifiable, ligne, LdV, case libre / occupée, lancers par tour / par cible, intervalle) contre une
 * table attendue écrite à la main depuis l'ÉTUDE et les notes (et non depuis les données).
 *
 * Repère : la case 213 (6 pas au nord-ouest du centre 300, sur l'axe de direction 1) permet 14 cases jouables
 * successives vers le sud-est (213 → 416), ce qui couvre toutes les portées finies de l'arène (≤ 8) et au-delà.
 */
import { expect } from 'vitest';
import type { ConfigOverrides } from '../../src/data/index.js';
import { cellInDirection, cellToXY, xyToCell } from '../../src/geometry/index.js';
import {
  addFighter,
  canCast,
  castSpell,
  resolveSpell,
  Stat,
  type CastResult,
  type Fighter,
  type FightState,
  type Team,
} from '../../src/engine/index.js';
import { testFight } from './engineSetup.js';

export type RollName = 'min' | 'max' | 'minCrit' | 'maxCrit';

export const RNG: Readonly<Record<RollName, ConfigOverrides['rng']>> = {
  min: { rollMode: 'min', critMode: 'never' },
  max: { rollMode: 'max', critMode: 'never' },
  minCrit: { rollMode: 'min', critMode: 'always' },
  maxCrit: { rollMode: 'max', critMode: 'always' },
};

/** Combat vide (sans pics) avec un mode de jet. */
export function fight(mode: RollName = 'min', overrides: ConfigOverrides = {}): FightState {
  return testFight({ ...overrides, rng: { ...RNG[mode], ...(overrides.rng ?? {}) } });
}

/** Case relative au centre 300 (17, −4) en coordonnées MapPoint. */
export function rel(dx: number, dy: number): number {
  const c = xyToCell(17 + dx, -4 + dy);
  if (c < 0) throw new Error(`hors carte : (${dx}, ${dy})`);
  return c;
}

/** Case à ``n`` pas dans la direction ``dir`` depuis ``cell`` (erreur hors carte). */
export function step(cell: number, dir: number, n: number): number {
  const c = cellInDirection(cell, dir, n);
  if (c < 0) throw new Error(`hors carte : ${cell} + ${n} × dir ${dir}`);
  return c;
}

export function xy(cell: number): [number, number] {
  return cellToXY(cell);
}

export function arch(s: FightState, key: 'acrobate' | 'dompteur' | 'magicien', cell: number, spells: number[] | 'all' = 'all', team?: Team): Fighter {
  return addFighter(s, { kind: 'archetype', archetype: key, spells, team }, cell);
}

export function mon(s: FightState, monsterId: number, cell: number, team?: Team): Fighter {
  return addFighter(s, { kind: 'monster', monsterId, team }, cell);
}

/** Sort de départ (passif) lancé sur soi, comme le serveur. */
export function passive(s: FightState, f: Fighter): void {
  if (f.startingSpellLevelId && s.ctx.hasSpell(f.startingSpellLevelId)) {
    resolveSpell(s, f, s.ctx.getSpell(f.startingSpellLevelId), f.cell);
  }
}

/** Choix d'archétype (30644 / 30648 / 30649 : état 5899 / 5900 / 5901), comme le choix n° 16 du serveur. */
export const CHOICE_SPELL = { dompteur: 80911, acrobate: 80912, magicien: 80913 } as const;

/**
 * Joueur complet comme au début d'un combat : archétype, passif 30639 (lancé AVANT le choix : ses critères *E589x
 * échouent, ETUDE §4.1), puis sort de choix d'archétype (état 5899 / 5900 / 5901, requis par Amplification, le Poutch…).
 */
export function player(s: FightState, key: 'acrobate' | 'dompteur' | 'magicien', cell: number, spells: number[] | 'all' = 'all'): Fighter {
  const f = arch(s, key, cell, spells);
  passive(s, f);
  resolveSpell(s, f, s.ctx.getSpell(CHOICE_SPELL[key]), f.cell);
  return f;
}

/** Monstre avec son sort de départ (Trooler 30694, Mama 30430, Poutch 30421…). */
export function mob(s: FightState, monsterId: number, cell: number): Fighter {
  const f = mon(s, monsterId, cell);
  passive(s, f);
  return f;
}

/** Rend un combattant Vulnérable comme à la sortie des pics (30701 : état 5994 + 1163 ×200 'D', 1 tour). */
export function vulnerable(s: FightState, f: Fighter): void {
  resolveSpell(s, f, s.ctx.getSpell(81025), f.cell);
}

/** PA et PM « illimités » pour enchaîner les lancers d'un test. */
export function manyAp(f: Fighter, ap = 200): void {
  f.setBaseStat(Stat.AP, ap);
}

/** Lancer qui doit réussir (message d'échec lisible). */
export function cast(s: FightState, caster: Fighter, sl: number, cell: number): CastResult {
  const r = castSpell(s, caster.id, sl, cell);
  expect(r.ok, `${s.ctx.getSpell(sl).name} (${sl}) sur ${cell} : ${r.reason ?? ''}`).toBe(true);
  return r;
}

/** Dommages (hors collision) subis par ``id``, dans l'ordre du journal. */
export function hits(s: FightState, id: number): number[] {
  return s.log!.ofType('damage').filter((e) => e.targetId === id && !e.collision).map((e) => e.amount);
}

/** Dommages de collision subis par ``id``. */
export function collisions(s: FightState, id: number): number[] {
  return s.log!.ofType('damage').filter((e) => e.targetId === id && e.collision).map((e) => e.amount);
}

/** Soins reçus par ``id`` (vol de vie compris si demandé). */
export function heals(s: FightState, id: number, lifeSteal = false): number[] {
  return s.log!.ofType('heal').filter((e) => e.targetId === id && e.lifeSteal === lifeSteal).map((e) => e.amount);
}

export function sum(a: readonly number[]): number {
  let t = 0;
  for (const x of a) t += x;
  return t;
}

// ---------------------------------------------------------------------------------------------
// Conditions de lancer
// ---------------------------------------------------------------------------------------------

/** Conditions attendues (ÉTUDE §4-§6, notes 1x / 20). ``max`` = 63 pour une portée « infinie ». */
export interface CastExpect {
  ap: number;
  min: number;
  max: number;
  /** PO modifiable (undefined : non vérifié). */
  mod?: boolean;
  line: boolean;
  los: boolean;
  free?: boolean;
  taken?: boolean;
  perTurn: number;
  perTarget: number;
  interval: number;
  crit: number;
}

export type CasterMaker = (s: FightState, cell: number) => Fighter;

/** Case d'origine des vérifications et direction de l'axe utilisé. */
export const ORIGIN = 213;
const AXIS = 1;

/**
 * Compare la table attendue aux données compilées puis vérifie le COMPORTEMENT de ``canCast`` / ``castSpell``
 * (effets neutralisés par ``effectFilter`` pour isoler les règles de lancer).
 */
export function verifyCastRules(sl: number, exp: CastExpect, makeCaster: CasterMaker, makeTarget: CasterMaker): void {
  const probe = fight();
  const spell = probe.ctx.getSpell(sl);
  const c = spell.cast;
  const label = `${spell.name} (${sl})`;
  // 1. données compilées (après exceptions de configuration)
  expect({ ap: c.ap, min: c.range[0], max: c.range[1], line: c.inLine, los: c.los, perTurn: c.maxPerTurn, perTarget: c.maxPerTarget, interval: c.interval, crit: c.critRate }, label).toEqual({
    ap: exp.ap,
    min: exp.min,
    max: exp.max,
    line: exp.line,
    los: exp.los,
    perTurn: exp.perTurn,
    perTarget: exp.perTarget,
    interval: exp.interval,
    crit: exp.crit,
  });
  if (exp.mod !== undefined) expect(c.rangeModifiable, `${label} PO modifiable`).toBe(exp.mod);
  expect(c.needFreeCell, `${label} case libre`).toBe(exp.free ?? false);
  expect(c.needTakenCell, `${label} case occupée`).toBe(exp.taken ?? false);

  const noEffects = { effectFilter: () => false };
  const setup = (withTarget: boolean, dist: number) => {
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    const cell = dist === 0 ? ORIGIN : step(ORIGIN, AXIS, dist);
    const target = withTarget && dist > 0 ? makeTarget(s, cell) : null;
    return { s, caster, cell, target };
  };
  const needTarget = !exp.free;
  const reach = Math.min(exp.max, 13);
  const okDist = Math.max(exp.min, Math.min(reach, 2));

  // 2. PA : coût payé, refus s'il manque 1 PA
  {
    const { s, caster, cell } = setup(needTarget, okDist);
    const r = castSpell(s, caster.id, sl, cell, noEffects);
    expect(r.ok, `${label} lancer de base : ${r.reason}`).toBe(true);
    expect(caster.apUsed, `${label} PA`).toBe(exp.ap);
    const t = setup(needTarget, okDist);
    t.caster.setBaseStat(Stat.AP, exp.ap - 1);
    expect(canCast(t.s, t.caster.id, sl, t.cell).code, `${label} PA insuffisants`).toBe('NOT_ENOUGH_AP');
  }
  // 3. portée : max, max + 1, min − 1, bonus de PO
  if (exp.max > 0) {
    const a = setup(needTarget, reach);
    expect(canCast(a.s, a.caster.id, sl, a.cell).ok, `${label} portée ${reach}`).toBe(true);
    if (exp.max < 13) {
      const b = setup(needTarget, exp.max + 1);
      expect(canCast(b.s, b.caster.id, sl, b.cell).code, `${label} portée ${exp.max + 1}`).toBe('OUT_OF_RANGE');
      b.caster.setBaseStat(Stat.RANGE, 1);
      const withBonus = canCast(b.s, b.caster.id, sl, b.cell);
      if (exp.mod !== undefined) expect(withBonus.ok, `${label} +1 PO`).toBe(exp.mod);
    }
    if (exp.min >= 1) {
      const d = setup(false, 0);
      expect(canCast(d.s, d.caster.id, sl, ORIGIN).code, `${label} sur soi`).toBe('OUT_OF_RANGE');
    }
  } else {
    const a = setup(false, 0);
    expect(canCast(a.s, a.caster.id, sl, ORIGIN).ok, `${label} sur soi`).toBe(true);
    const b = setup(true, 1);
    expect(canCast(b.s, b.caster.id, sl, b.cell).code, `${label} à 1 case`).toBe('OUT_OF_RANGE');
  }
  // 4. lancer en ligne : case hors axe (1 pas diagonal = distance 2)
  if (exp.max >= 2) {
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    const cell = step(ORIGIN, 0, 1);
    if (needTarget) makeTarget(s, cell);
    const r = canCast(s, caster.id, sl, cell);
    if (exp.line) expect(r.code, `${label} hors ligne`).toBe('OUT_OF_RANGE');
    else expect(r.ok, `${label} hors ligne : ${r.reason}`).toBe(true);
  }
  // 5. ligne de vue : un combattant à 1 case bloque une cible à 2 cases ou plus
  if (exp.max >= 2) {
    const dist = Math.max(2, exp.min);
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    makeTarget(s, step(ORIGIN, AXIS, 1));
    const cell = step(ORIGIN, AXIS, dist);
    if (needTarget) makeTarget(s, cell);
    const r = canCast(s, caster.id, sl, cell);
    if (exp.los) expect(r.code, `${label} LdV`).toBe('NO_LINE_OF_SIGHT');
    else expect(r.ok, `${label} sans LdV : ${r.reason}`).toBe(true);
  }
  // 6. case libre / occupée
  if (exp.free && exp.max > 0) {
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    const cell = step(ORIGIN, AXIS, okDist);
    makeTarget(s, cell);
    expect(canCast(s, caster.id, sl, cell).code, `${label} case occupée`).toBe('CELL_OCCUPIED');
  }
  if (exp.taken) {
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    expect(canCast(s, caster.id, sl, step(ORIGIN, AXIS, okDist)).code, `${label} case vide`).toBe('CELL_EMPTY');
  }
  // 7. lancers par tour (cibles distinctes)
  if (exp.perTurn > 0) {
    const s = fight();
    const caster = makeCaster(s, ORIGIN);
    manyAp(caster);
    const cells: number[] = [];
    for (let k = 0; k <= exp.perTurn; k++) {
      let cell = ORIGIN;
      if (exp.max > 0) {
        // cases distinctes dans la portée : axe, puis axe opposé, puis perpendiculaires
        const dirs = [1, 5, 3, 7];
        const dir = dirs[k % 4]!;
        const n = Math.max(exp.min, 1) + Math.floor(k / 4);
        cell = step(ORIGIN, dir, n);
        if (needTarget && !s.fighterAt(cell)) makeTarget(s, cell);
      }
      cells.push(cell);
    }
    for (let k = 0; k < exp.perTurn; k++) {
      const r = castSpell(s, caster.id, sl, cells[k]!, noEffects);
      expect(r.ok, `${label} lancer ${k + 1}/${exp.perTurn} : ${r.reason}`).toBe(true);
    }
    expect(canCast(s, caster.id, sl, cells[exp.perTurn]!).code, `${label} lancers par tour`).toBe('MAX_PER_TURN');
  }
  // 8. lancers par cible
  if (exp.perTarget > 0 && (exp.perTurn === 0 || exp.perTurn > exp.perTarget)) {
    const { s, caster, cell } = setup(true, okDist);
    for (let k = 0; k < exp.perTarget; k++) expect(castSpell(s, caster.id, sl, cell, noEffects).ok).toBe(true);
    expect(canCast(s, caster.id, sl, cell).code, `${label} lancers par cible`).toBe('MAX_PER_TARGET');
  }
  // 9. intervalle de relance (tours du lanceur)
  if (exp.interval > 0) {
    const { s, caster, cell } = setup(needTarget, okDist);
    expect(castSpell(s, caster.id, sl, cell, noEffects).ok).toBe(true);
    caster.resetCastCounters();
    expect(canCast(s, caster.id, sl, cell).code, `${label} relance immédiate`).toBe('COOLDOWN');
    caster.turnCount += exp.interval - 1;
    if (exp.interval > 1) expect(canCast(s, caster.id, sl, cell).code, `${label} relance à ${exp.interval - 1} tour(s)`).toBe('COOLDOWN');
    caster.turnCount += 1;
    expect(canCast(s, caster.id, sl, cell).ok, `${label} relance à ${exp.interval} tour(s)`).toBe(true);
  }
}
