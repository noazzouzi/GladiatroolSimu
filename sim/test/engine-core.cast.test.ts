/** Validation de lancer, cases ciblables, coût, compteurs, critique et résolution (sous-sorts, critique). */
import { describe, expect, it } from 'vitest';
import { addBuff, Buff, canCast, castSpell, getCastableCells, Stat, type Fighter, type FightState } from '../src/engine/index.js';
import { CELL_COUNT, distance } from '../src/geometry/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, SL, testFight } from './helpers/engineSetup.js';

function giveState(s: FightState, f: Fighter, stateId: number): void {
  const b = new Buff();
  b.kind = 'state';
  b.stateId = stateId;
  b.casterId = f.id;
  b.duration = -1;
  addBuff(s, f, b);
}

function newTurn(f: Fighter): void {
  f.turnCount += 1;
  f.restoreApMp();
  f.resetCastCounters();
}

describe('validation de lancer', () => {
  it('PA, lancers par tour, coût et compteurs', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
    newTurn(acro);
    expect(acro.ap).toBe(8);
    expect(castSpell(s, acro.id, SL.frappe, t.cell).ok).toBe(true);
    expect(acro.ap).toBe(5);
    expect(castSpell(s, acro.id, SL.frappe, t.cell).ok).toBe(true);
    expect(acro.ap).toBe(2);
    expect(canCast(s, acro.id, SL.frappe, t.cell).code).toBe('NOT_ENOUGH_AP');
    acro.apUsed = 0;
    const r = canCast(s, acro.id, SL.frappe, t.cell);
    expect(r.code).toBe('MAX_PER_TURN');
    expect(r.reason).toMatch(/déjà lancé 2 fois ce tour/);
    acro.apUsed = 6;
    expect(canCast(s, acro.id, SL.videur, cellInDirectionOrThrow(300, 1, 2)).code).toBe('NOT_ENOUGH_AP');
    expect(canCast(s, acro.id, SL.videur, cellInDirectionOrThrow(300, 1, 2)).reason).toBe('PA insuffisants (4 requis, 2 disponibles)');
    newTurn(acro);
    expect(canCast(s, acro.id, SL.frappe, cellInDirectionOrThrow(300, 7, 2)).ok).toBe(true);
    const failed = castSpell(s, acro.id, SL.frappe, 0);
    expect(failed.ok).toBe(false);
    expect(s.describeLog().at(-1)).toMatch(/^Acrobate ne peut pas lancer Frappe Repoussoir : case invalide|hors de portée|non jouable/);
  });

  it('portée (+ bonus de PO si modifiable), en ligne, ligne de vue, case libre / occupée', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    newTurn(acro);
    const far = cellInDirectionOrThrow(300, 1, 7);
    expect(canCast(s, acro.id, SL.frappe, far).code).toBe('OUT_OF_RANGE');
    const po = new Buff();
    po.kind = 'stat';
    po.stat = Stat.RANGE;
    po.value = 1;
    po.casterId = acro.id;
    addBuff(s, acro, po);
    expect(canCast(s, acro.id, SL.frappe, far).ok).toBe(true);
    // Videur : en ligne seulement
    const offLine = cellInDirectionOrThrow(cellInDirectionOrThrow(300, 1, 2), 7, 1);
    expect(canCast(s, acro.id, SL.videur, offLine).code).toBe('OUT_OF_RANGE');
    expect(canCast(s, acro.id, SL.videur, offLine).reason).toMatch(/en ligne/);
    // ligne de vue bloquée par un combattant intermédiaire (pas par la cible)
    const blocker = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    expect(canCast(s, acro.id, SL.frappe, cellInDirectionOrThrow(300, 1, 4)).code).toBe('NO_LINE_OF_SIGHT');
    expect(canCast(s, acro.id, SL.frappe, blocker.cell).ok).toBe(true);
    // Aïronemane : case libre requise ; Voltige : case occupée requise
    expect(canCast(s, acro.id, SL.aironemane, blocker.cell).code).toBe('CELL_OCCUPIED');
    expect(canCast(s, acro.id, SL.voltige, cellInDirectionOrThrow(300, 7, 2)).code).toBe('CELL_EMPTY');
    expect(canCast(s, acro.id, SL.voltige, blocker.cell).ok).toBe(true);
  });

  it('lancers par cible, intervalle de relance, états interdits, cumul maximal', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const domp = archetype(s, 'dompteur', cellInDirectionOrThrow(300, 5, 2));
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    newTurn(acro);
    newTurn(domp);
    // Voltige : 1 fois par cible
    expect(castSpell(s, acro.id, SL.voltige, t.cell).ok).toBe(true);
    const swapped = s.fighterAt(300)!;
    expect(swapped).toBe(t);
    expect(canCast(s, acro.id, SL.voltige, t.cell).code).toBe('MAX_PER_TARGET');
    // Pugnace : intervalle 2 (tours du lanceur)
    expect(castSpell(s, acro.id, SL.pugnace, acro.cell).ok).toBe(true);
    newTurn(acro);
    expect(canCast(s, acro.id, SL.pugnace, acro.cell).code).toBe('COOLDOWN');
    expect(canCast(s, acro.id, SL.pugnace, acro.cell).reason).toBe('sort en recharge (encore 1 tour)');
    newTurn(acro);
    expect(canCast(s, acro.id, SL.pugnace, acro.cell).ok).toBe(true);
    // Aïronemane : interdit sous l'état 7 (HS!7)
    const free = cellInDirectionOrThrow(300, 3, 2);
    expect(canCast(s, acro.id, SL.aironemane, free).ok).toBe(true);
    giveState(s, acro, 7);
    expect(canCast(s, acro.id, SL.aironemane, free).code).toBe('STATE_FORBIDDEN');
    // Prélèvement : cumul maximal 3 (buff d'érosion de 2 tours), 2 par cible et par tour
    const tgt = s.fighterAt(t.cell) ?? t;
    expect(castSpell(s, domp.id, SL.prelevement, tgt.cell).ok).toBe(true);
    expect(castSpell(s, domp.id, SL.prelevement, tgt.cell).ok).toBe(true);
    domp.apUsed = 0;
    expect(canCast(s, domp.id, SL.prelevement, tgt.cell).code).toBe('MAX_PER_TARGET');
    newTurn(domp);
    expect(castSpell(s, domp.id, SL.prelevement, tgt.cell).ok).toBe(true);
    newTurn(domp);
    expect(canCast(s, domp.id, SL.prelevement, tgt.cell).code).toBe('MAX_STACK');
  });

  it('lanceur mort, sort absent du grimoire, choix en attente', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300, [SL.frappe]);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    expect(canCast(s, acro.id, SL.videur, t.cell).code).toBe('UNKNOWN_SPELL');
    s.pendingChoices.push({ uid: 1, scope: 'global', choiceListId: 17, fighterId: -1, casterId: 0, spellLevelId: 0, castId: 0, turn: 0 });
    expect(canCast(s, acro.id, SL.frappe, t.cell).code).toBe('PENDING_CHOICE');
    s.pendingChoices.length = 0;
    acro.alive = false;
    expect(canCast(s, acro.id, SL.frappe, t.cell).code).toBe('DEAD');
  });
});

describe('cases ciblables', () => {
  it('getCastableCells = cases où canCast réussit (sorts variés, positions variées)', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const domp = archetype(s, 'dompteur', 287);
    monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    monster(s, M.troollibre, cellInDirectionOrThrow(300, 7, 3));
    monster(s, M.artroolleur, cellInDirectionOrThrow(300, 3, 1));
    newTurn(acro);
    newTurn(domp);
    castSpell(s, acro.id, SL.voltige, cellInDirectionOrThrow(300, 1, 2));
    for (const f of [acro, domp]) {
      for (const slot of f.spells) {
        const fast = getCastableCells(s, f.id, slot.spellLevelId).sort((a, b) => a - b);
        const slow: number[] = [];
        for (let c = 0; c < CELL_COUNT; c++) if (canCast(s, f.id, slot.spellLevelId, c).ok) slow.push(c);
        expect(fast, `${f.name} ${slot.spellLevelId}`).toEqual(slow);
      }
    }
  });
});

describe('résolution', () => {
  it('taux critique nul : jamais de critique, même en mode « toujours »', () => {
    const s = testFight({ rng: { critMode: 'always' } });
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    expect(castSpell(s, acro.id, SL.voltige, t.cell).critical).toBe(false);
    expect(castSpell(s, acro.id, SL.frappe, t.cell).critical).toBe(true);
  });

  it('tirage critique aléatoire à ~40 % (30 % du sort + 10 % de base)', () => {
    const s = testFight({ rng: { rollMode: 'random', critMode: 'random', seed: 42 } });
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.mama, cellInDirectionOrThrow(300, 1, 4));
    let crits = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const c = s.clone({ keepLog: false });
      c.rng.state = (i * 2654435761) >>> 0;
      if (castSpell(c, acro.id, SL.frappe, t.cell, { ignoreConditions: true }).critical) crits++;
    }
    expect(crits / N).toBeGreaterThan(0.36);
    expect(crits / N).toBeLessThan(0.44);
  });

  it('jets aléatoires uniformes dans [min, max] ; un jet par effet, commun aux cibles (rng.rollPerTarget = false)', () => {
    const s = testFight({ rng: { rollMode: 'random', critMode: 'never', seed: 3 } });
    const d = archetype(s, 'dompteur', 300);
    const x = cellInDirectionOrThrow(300, 1, 3);
    const a = monster(s, M.mama, x);
    const b = monster(s, M.mama, cellInDirectionOrThrow(x, 7, 1));
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const c = s.clone({ keepLog: true });
      castSpell(c, d.id, SL.impact, x, { ignoreConditions: true });
      const da = a.hp - c.fighter(a.id).hp;
      const db = b.hp - c.fighter(b.id).hp;
      const roll = Math.round(da / 61);
      expect(da).toBe(roll * 61);
      expect(db).toBe(Math.trunc((roll * 61 * 90) / 100));
      seen.add(roll);
      s.rng.next();
    }
    expect([...seen].sort((p, q) => p - q)).toEqual([68, 69, 70, 71, 72, 73, 74]);
  });

  it('sous-sort 1160 (Videur) : la cible devient la case ciblée, poussée depuis le lanceur', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 314);
    const t = monster(s, M.troollibre, 242);
    castSpell(s, acro.id, SL.videur, 256);
    expect(t.cell).toBe(199);
    const casts = s.log!.ofType('cast');
    expect(casts.map((c) => [c.spellLevelId, c.depth, c.cell])).toEqual([
      [SL.videur, 0, 256],
      [80981, 1, 242],
    ]);
    expect(distance(acro.cell, t.cell)).toBeGreaterThan(distance(314, 242));
  });

  it('Amplification : cibles figées au lancement (masque e5968 alors que l’effet 0 pose 5968), bonus selon l’archétype', () => {
    const s = testFight();
    const mag = archetype(s, 'magicien', 300);
    const domp = archetype(s, 'dompteur', cellInDirectionOrThrow(300, 1, 2));
    const acro = archetype(s, 'acrobate', cellInDirectionOrThrow(300, 7, 2));
    giveState(s, domp, 5899);
    giveState(s, acro, 5900);
    newTurn(mag);
    expect(castSpell(s, mag.id, SL.amplification, domp.cell).ok).toBe(true);
    expect(domp.hasState(5968)).toBe(true);
    expect(domp.stat(Stat.FINAL_DAMAGE)).toBe(20);
    expect(domp.stat(Stat.CRIT)).toBe(40);
    expect(domp.stat(Stat.PUSH_DAMAGE)).toBe(1000);
    expect(castSpell(s, mag.id, SL.amplification, acro.cell).ok).toBe(true);
    expect(acro.stat(Stat.PUSH_DAMAGE)).toBe(1500);
    expect(acro.stat(Stat.FINAL_DAMAGE)).toBe(0);
    // relancé sur une cible déjà Amplifiée : rien ne se cumule (e5968)
    newTurn(mag);
    castSpell(s, mag.id, SL.amplification, domp.cell);
    expect(domp.stat(Stat.FINAL_DAMAGE)).toBe(20);
    expect(domp.buffs.filter((b) => b.kind === 'state' && b.stateId === 5968)).toHaveLength(1);
  });
});
