/** Sélection des cibles : masques d'inclusion / d'exclusion, camps, zone sur positions figées, ordre de traitement. */
import { describe, expect, it } from 'vitest';
import type { MaskData } from '../src/data/index.js';
import {
  addBuff,
  Buff,
  comparePositions,
  matchesMask,
  selectTargets,
  takeSnapshot,
  type CompiledEffect,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { cellInDirection, sortTargetsForEffect, SpellZone } from '../src/geometry/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, scenarioEntity, SL, testFight } from './helpers/engineSetup.js';

function mask(raw: string): MaskData {
  const include: string[] = [];
  const exclude: MaskData['exclude'] = [];
  let camp: MaskData['camp'] = null;
  for (const tok of raw.split(',')) {
    if (tok === 'Atq' || tok === 'Def' || tok === 'Sce') camp = tok;
    else {
      const m = /^(\*?)([A-Za-z])(\d*)$/.exec(tok)!;
      if (m[3] === '' && !m[1] && !'EeFfVvOoPpUu'.includes(m[2]!) ) include.push(m[2]!);
      else if (m[3] === '' && !m[1] && 'OoPpUu'.includes(m[2]!)) exclude.push({ key: m[2]!, value: null, onCaster: false });
      else exclude.push({ key: m[2]!, value: m[3] ? Number(m[3]) : null, onCaster: m[1] === '*' });
    }
  }
  return { include, exclude, camp };
}

function giveState(s: FightState, f: Fighter, stateId: number): void {
  const b = new Buff();
  b.kind = 'state';
  b.stateId = stateId;
  b.casterId = f.id;
  b.duration = -1;
  addBuff(s, f, b);
}

function setup() {
  const s = testFight();
  const acro = archetype(s, 'acrobate', 300);
  const domp = archetype(s, 'dompteur', 286);
  const trooll = monster(s, M.troollibre, 358);
  const art = monster(s, M.artroolleur, 242);
  const poutch = monster(s, M.poutch, 314, 'players');
  poutch.summonerId = acro.id;
  const enemySummon = monster(s, M.poutch, 372, 'monsters');
  enemySummon.summonerId = trooll.id;
  const sce = scenarioEntity(s);
  return { s, acro, domp, trooll, art, poutch, enemySummon, sce };
}

describe('masques', () => {
  it('lettres d’inclusion (A, a, g, c, C, j, J, h, H, m, M) et lettre inconnue', () => {
    const { s, acro, domp, trooll, art, poutch, enemySummon } = setup();
    const all = [acro, domp, trooll, art, poutch, enemySummon];
    const who = (m: string) => all.filter((f) => matchesMask(s, acro, f, mask(m))).map((f) => f.id);
    expect(who('A')).toEqual([trooll.id, art.id, enemySummon.id]);
    expect(who('a')).toEqual([acro.id, domp.id, poutch.id]);
    expect(who('g')).toEqual([domp.id, poutch.id]);
    expect(who('c')).toEqual([acro.id]);
    expect(who('C')).toEqual([acro.id]);
    expect(who('j')).toEqual([poutch.id]);
    expect(who('J')).toEqual([enemySummon.id]);
    expect(who('h')).toEqual([domp.id]);
    expect(who('H')).toEqual([]);
    expect(who('M')).toEqual([trooll.id, art.id]);
    expect(who('x')).toEqual([]);
    expect(who('A,a')).toEqual([acro.id, domp.id, trooll.id, art.id, poutch.id, enemySummon.id]);
    // du point de vue d'un monstre
    expect(all.filter((f) => matchesMask(s, trooll, f, mask('H'))).map((f) => f.id)).toEqual([acro.id, domp.id]);
  });

  it('exclusions : états (E / e, préfixe * sur le lanceur), monstre (F en OU, f), PV (V ≤, v >), O, P, U', () => {
    const { s, acro, domp, trooll, art, poutch } = setup();
    giveState(s, trooll, 5994);
    expect(matchesMask(s, acro, trooll, mask('A,E5994'))).toBe(true);
    expect(matchesMask(s, acro, art, mask('A,E5994'))).toBe(false);
    expect(matchesMask(s, acro, art, mask('A,e5994'))).toBe(true);
    expect(matchesMask(s, acro, trooll, mask('A,e5994'))).toBe(false);
    expect(matchesMask(s, acro, domp, mask('a,*E5900'))).toBe(false);
    giveState(s, acro, 5900);
    expect(matchesMask(s, acro, domp, mask('a,*E5900'))).toBe(true);
    expect(matchesMask(s, acro, domp, mask('a,*e5900'))).toBe(false);
    // F : OU entre plusieurs F ; f : ET
    expect(matchesMask(s, acro, art, mask('A,F7981,F7982'))).toBe(true);
    expect(matchesMask(s, acro, art, mask('A,F7981'))).toBe(false);
    expect(matchesMask(s, acro, art, mask('A,f7982'))).toBe(false);
    // PV : V# ≤ #%, v# > #% ; v100 = PV pleins (objectives.v100MeansFull)
    art.hp = art.maxHp / 2;
    expect(matchesMask(s, acro, art, mask('A,V50'))).toBe(true);
    expect(matchesMask(s, acro, art, mask('A,V49'))).toBe(false);
    expect(matchesMask(s, acro, art, mask('A,v49'))).toBe(true);
    expect(matchesMask(s, acro, art, mask('A,v50'))).toBe(false);
    expect(matchesMask(s, acro, trooll, mask('A,v100'))).toBe(true);
    expect(matchesMask(s, acro, art, mask('A,v100'))).toBe(false);
    // O : cible ADDITIONNELLE « combattant déclencheur » (ajoutée par selectTargets, étape « déclencheurs ») : ce
    // n'est pas un filtre ; o : n'est pas le déclencheur
    expect(matchesMask(s, acro, domp, mask('a,O'), { triggerSourceId: domp.id })).toBe(true);
    expect(matchesMask(s, acro, domp, mask('a,O'), { triggerSourceId: -1 })).toBe(true);
    expect(matchesMask(s, acro, domp, mask('a,o'), { triggerSourceId: domp.id })).toBe(false);
    // P : soi-même ou ses invocations
    expect(matchesMask(s, acro, poutch, mask('a,P'))).toBe(true);
    expect(matchesMask(s, acro, domp, mask('a,P'))).toBe(false);
    // U : en train d'apparaître (jamais)
    expect(matchesMask(s, acro, trooll, mask('A,U'))).toBe(false);
  });

  it('camps DOFUS 3 : Atq / Def / Sce ; l’entité de scénario n’est visée que par Sce', () => {
    const { s, acro, trooll, sce } = setup();
    expect(matchesMask(s, sce, acro, mask('Atq,A'))).toBe(true);
    expect(matchesMask(s, sce, trooll, mask('Atq,A'))).toBe(false);
    expect(matchesMask(s, sce, trooll, mask('Def,A'))).toBe(true);
    expect(matchesMask(s, sce, sce, mask('Sce'))).toBe(true);
    expect(matchesMask(s, sce, acro, mask('Sce'))).toBe(false);
    expect(matchesMask(s, acro, sce, mask('A'))).toBe(false);
    expect(matchesMask(s, acro, sce, mask('A,a'))).toBe(false);
    expect(matchesMask(s, sce, sce, mask('C'))).toBe(true);
  });
});

describe('sélection des cibles', () => {
  function effectOf(s: FightState, spellLevelId: number, index: number, over: Partial<CompiledEffect> = {}): CompiledEffect {
    return { ...s.ctx.getSpell(spellLevelId).effects[index]!, ...over };
  }

  it('zone évaluée sur les positions d’avant le sort ; C ajoute le lanceur hors zone (cible additionnelle)', () => {
    const s = testFight();
    const d = archetype(s, 'dompteur', 300);
    const x = cellInDirectionOrThrow(300, 1, 3);
    const t1 = monster(s, M.troollibre, x);
    const t2 = monster(s, M.troollibre, cellInDirectionOrThrow(x, 7, 1));
    const impact = effectOf(s, SL.impact, 0);
    const snap = takeSnapshot(s);
    // on déplace t2 hors de la zone APRÈS le snapshot : il reste ciblé
    s.setCell(t2, cellInDirectionOrThrow(300, 3, 5));
    const sel = selectTargets(s, d, impact, x, d.cell, snap);
    expect(sel.targets.map((f) => f.id)).toEqual([t1.id, t2.id]);
    // masque 'A,C' : le lanceur, hors zone, est ajouté en cible additionnelle
    const withC = { ...impact, mask: { include: ['A', 'C'], exclude: [], camp: null } };
    const sel2 = selectTargets(s, d, withC, x, d.cell, snap);
    expect(sel2.targets.at(-1)).toBe(d);
    expect(sel2.additional).toEqual([d.id]);
  });

  it('les morts ne sont ciblés que par une zone A (toute la carte, morts compris)', () => {
    const s = testFight();
    const d = archetype(s, 'dompteur', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    t.alive = false;
    t.deathCell = t.cell;
    s.setCell(t, -1);
    const e = effectOf(s, SL.impact, 0, { zone: SpellZone.fromRaw('C3') });
    expect(selectTargets(s, d, e, cellInDirectionOrThrow(300, 1, 1), d.cell, takeSnapshot(s)).targets).toEqual([]);
    const eA = { ...e, zone: SpellZone.fromRaw('A') };
    expect(selectTargets(s, d, eA, 300, d.cell, takeSnapshot(s)).targets).toEqual([t]);
  });

  it('ordre : poussée de la plus éloignée ; autres effets de la plus proche ; égalités comme la géométrie', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed / 2 ** 31);
    for (let k = 0; k < 200; k++) {
      const center = 300;
      const cells = new Set<number>();
      while (cells.size < 6) {
        const c = cellInDirection(center, Math.floor(rnd() * 8), 1 + Math.floor(rnd() * 3));
        if (c >= 0) cells.add(c);
      }
      const list = [...cells];
      for (const push of [true, false]) {
        const ours = [...list].sort((a, b) => comparePositions(center, push, a, b));
        expect(ours).toEqual(sortTargetsForEffect(center, push, list));
      }
    }
  });

  it('Impact : cibles traitées de la plus proche à la plus éloignée de la case ciblée', () => {
    const s = testFight();
    const d = archetype(s, 'dompteur', 300);
    const x = cellInDirectionOrThrow(300, 1, 3);
    const far = monster(s, M.troollibre, cellInDirectionOrThrow(x, 7, 2));
    const near = monster(s, M.troollibre, cellInDirectionOrThrow(x, 1, 1));
    const center = monster(s, M.troollibre, x);
    const sel = selectTargets(s, d, effectOf(s, SL.impact, 0), x, d.cell, takeSnapshot(s));
    expect(sel.targets).toEqual([center, near, far]);
  });
});
