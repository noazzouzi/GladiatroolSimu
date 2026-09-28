/** État de combat : clonage indépendant et rapide, déterminisme (PRNG à graine), modes de jet, journal en français. */
import { describe, expect, it } from 'vitest';
import {
  castSpell,
  createFight,
  formatEvent,
  moveAlongPath,
  resolveSpell,
  rollCritical,
  rollValue,
  Rng,
  type FightState,
} from '../src/engine/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, scenarioEntity, SL, testContext, testFight } from './helpers/engineSetup.js';

function populated(overrides = {}): FightState {
  const s = testFight(overrides);
  const sce = scenarioEntity(s);
  archetype(s, 'acrobate', 314);
  archetype(s, 'dompteur', 286);
  archetype(s, 'dompteur', 287);
  archetype(s, 'magicien', 315);
  monster(s, M.troollibre, 242);
  monster(s, M.troollibre, 358);
  monster(s, M.artroolleur, cellInDirectionOrThrow(300, 7, 5));
  monster(s, M.mama, 152);
  resolveSpell(s, sce, s.ctx.getSpell(SL.spikesGlyph), -1);
  return s;
}

function fingerprint(s: FightState): string {
  return JSON.stringify({
    f: s.fighters.map((f) => [f.cell, f.hp, f.erodedHp, f.apUsed, f.mpUsed, f.alive, f.states, f.buffs.map((b) => [b.kind, b.value, b.duration])]),
    occ: Array.from(s.occupancy),
    rng: s.rng.state,
    marks: s.marks.length,
    uid: s.uidSeq,
  });
}

describe('PRNG', () => {
  it('reproductible, clonable, bornes respectées', () => {
    const a = new Rng(123);
    const seq = Array.from({ length: 20 }, () => a.next());
    const b = new Rng(123);
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seq);
    const c = new Rng(5);
    c.next();
    const d = c.clone();
    expect(d.next()).toBe(c.next());
    for (let i = 0; i < 1000; i++) {
      const v = c.int(3, 7);
      expect(v >= 3 && v <= 7 && Number.isInteger(v)).toBe(true);
    }
  });

  it('modes de jet et de critique', () => {
    const r = new Rng(1);
    expect(rollValue(r, 16, 20, 'min', 'uniform')).toBe(16);
    expect(rollValue(r, 16, 20, 'max', 'uniform')).toBe(20);
    expect(rollValue(r, 16, 21, 'average', 'uniform')).toBe(18);
    expect(rollValue(r, 42, 0, 'random', 'uniform')).toBe(42);
    const counts = new Map<number, number>();
    for (let i = 0; i < 6000; i++) {
      const v = rollValue(r, 1, 3, 'random', 'clientPreview');
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // aperçu client : bornes sous-pondérées (1/4, 1/2, 1/4)
    expect(counts.get(2)! / 6000).toBeGreaterThan(0.45);
    expect(rollCritical(r, 0, 'always')).toBe(false);
    expect(rollCritical(r, 40, 'always')).toBe(true);
    expect(rollCritical(r, 40, 'never')).toBe(false);
  });
});

describe('clonage', () => {
  it('le clone est indépendant de l’original (combattants, buffs, occupation, marques, PRNG, journal)', () => {
    const s = populated({ rng: { rollMode: 'random', critMode: 'random' } });
    const before = fingerprint(s);
    const logLen = s.log!.length;
    const c = s.clone();
    expect(fingerprint(c)).toBe(before);
    castSpell(c, 1, SL.videur, 256);
    castSpell(c, 1, SL.frappe, 358);
    moveAlongPath(c, 3, [cellInDirectionOrThrow(287, 5, 1)]);
    c.fighter(5).hp = 1;
    c.fighter(1).restoreApMp();
    expect(castSpell(c, 1, SL.pugnace, c.fighter(1).cell).ok).toBe(true);
    expect(c.fighter(1).buffs.length).toBe(2);
    expect(s.fighter(1).buffs.length).toBe(0);
    expect(s.fighter(1).hasState(157)).toBe(false);
    c.marks.pop();
    expect(fingerprint(c)).not.toBe(before);
    expect(fingerprint(s)).toBe(before);
    expect(s.log!.length).toBe(logLen);
    expect(c.clone({ keepLog: false }).log).toBeNull();
  });

  it('déterminisme : même graine et mêmes actions → même état ; un clone rejoue à l’identique', () => {
    const run = (s: FightState) => {
      castSpell(s, 1, SL.videur, 256);
      castSpell(s, 2, SL.impact, 358, { ignoreConditions: true });
      castSpell(s, 3, SL.impact, 242, { ignoreConditions: true });
      return fingerprint(s);
    };
    const o = { rng: { rollMode: 'random', critMode: 'random', seed: 99 } };
    const a = populated(o);
    const b = populated(o);
    expect(run(a)).toBe(run(b));
    const base = populated(o);
    const c1 = base.clone();
    const c2 = base.clone();
    expect(run(c1)).toBe(run(c2));
    const other = populated({ rng: { rollMode: 'random', critMode: 'random', seed: 100 } });
    expect(run(other)).not.toBe(run(populated(o)));
  });

  it('performance : clonage rapide (tableaux typés, aucune sérialisation)', () => {
    const s = populated();
    s.setEventLog(false);
    const t0 = performance.now();
    const N = 20000;
    let x = 0;
    for (let i = 0; i < N; i++) x += s.clone().fighters.length;
    const per = ((performance.now() - t0) / N) * 1000;
    expect(x).toBe(N * s.fighters.length);
    // ordre de grandeur attendu : quelques µs par clone (seuil large pour les machines lentes)
    expect(per).toBeLessThan(50);
  });
});

describe('journal', () => {
  it('messages en français et journal désactivable', () => {
    const s = populated();
    castSpell(s, 1, SL.videur, 256);
    const msgs = s.describeLog();
    expect(msgs).toContain('Acrobate lance Videur sur la case 256 (4 PA).');
    expect(msgs).toContain('Troollibre est repoussé : 242 → 199.');
    expect(msgs.some((m) => /^Troollibre perd 2 ?000 PV/.test(m.replace(' ', ' ')))).toBe(true);
    // (étape « glyphes ») 199 est dans les pics : 2 000 à l'entrée, puis 3 239 × 2 (aura : ×2 du camp Def)
    expect(msgs.some((m) => /^Troollibre perd 6 ?478 PV/.test(m.replace(' ', ' ')))).toBe(true);
    const quiet = createFight(testContext({ engine: { eventLog: false } }));
    expect(quiet.log).toBeNull();
    const ev = s.log!.events.find((e) => e.type === 'cast' && e.casterId === 1)!;
    expect(formatEvent(ev, s.names)).toMatch(/^Acrobate lance Videur/);
  });
});
