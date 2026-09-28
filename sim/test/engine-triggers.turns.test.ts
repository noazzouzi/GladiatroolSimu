/**
 * Cycle de tour et durées (ETUDE §9.10, N70 §7.2) : décompte au début des tours du LANCEUR, délais, règle du premier
 * tour, TB / TE, durée 0 (« reste du tour »), tour annulé (140), timeline (invocations), choix en attente, actions.
 * Sorts : Regain Vigoureux, Amplification, Protection Prolongée, Grondement Grandissant, Relâchement de Fureur, Pense
 * Vite, arrivée de la Mama (30430 : passe-tour 6, délai 7), Catastrooll, Soutien Stratégique (Poutch).
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import {
  addFighter,
  castSpell,
  endTurn,
  getCastableCells,
  learnSpell,
  nextTurn,
  obtainSpell,
  performAction,
  removeFromTimeline,
  resolveSpell,
  Rng,
  spellBaseDamageBonus,
  Stat,
  startTurn,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { CELL_COUNT, reachableCells } from '../src/geometry/index.js';
import { cellInDirectionOrThrow, M, SL } from './helpers/engineSetup.js';
import { arena, damagesOf, mob, player, timeline } from './helpers/fightSetup.js';

const MIN = { rollMode: 'min', critMode: 'never' } as const;

/** Avance jusqu'au début du tour de ``f`` (au plus ``max`` tours de combattants). */
function untilTurnOf(s: FightState, f: Fighter, max = 50): void {
  for (let i = 0; i < max; i++) {
    const r = nextTurn(s);
    if (r.status === 'turnStarted' && r.fighterId === f.id) return;
    if (r.status !== 'turnStarted') throw new Error(`nextTurn : ${r.status}`);
  }
  throw new Error(`tour de ${f.name} non atteint`);
}

/** Donne l'état d'archétype Dompteur (5899) comme le choix 16 (passif 30644). */
function dompteurState(s: FightState, d: Fighter): void {
  resolveSpell(s, d, s.ctx.getSpell(80911), d.cell);
  expect(d.hasState(5899)).toBe(true);
}

describe('décompte au début des tours du lanceur', () => {
  it('Regain Vigoureux (+2 PA / +2 PM, 2 tours du Magicien) : actif aux tours 2 et 3 de l’allié, retiré au T3 du Magicien', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300);
    const mag = player(s, 'magicien', cellInDirectionOrThrow(300, 1, 2));
    timeline(s, [d, mag]);
    untilTurnOf(s, mag);
    expect(castSpell(s, mag.id, SL.regain, mag.cell).ok).toBe(true);
    expect([d.ap, d.mp]).toEqual([10, 6]);
    const seen: Array<[number, number, number]> = [];
    for (let t = 2; t <= 4; t++) {
      untilTurnOf(s, d);
      seen.push([s.turn, d.ap, d.mp]);
    }
    expect(seen).toEqual([
      [2, 10, 6],
      [3, 10, 6],
      [4, 8, 4],
    ]);
    const regain = d.buffs.filter((b) => b.spellId === 30410);
    expect(regain).toEqual([]);
  });

  it('Amplification : cibles figées (masque e5968), DF +20 / +30 % critique 3 tours du Magicien, état 4 tours ; relance sans effet tant qu’il est Amplifié', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300);
    const mag = player(s, 'magicien', cellInDirectionOrThrow(300, 1, 2));
    dompteurState(s, d);
    timeline(s, [d, mag]);
    untilTurnOf(s, mag);
    expect(castSpell(s, mag.id, SL.amplification, d.cell).ok).toBe(true);
    expect(d.hasState(5968)).toBe(true);
    expect([d.stat(Stat.FINAL_DAMAGE), d.stat(Stat.CRIT)]).toEqual([20, 10 + 30]);
    const snap = (): [number, boolean, number] => [s.turn, d.hasState(5968), d.stat(Stat.FINAL_DAMAGE)];
    const seen: Array<[number, boolean, number]> = [];
    for (let t = 2; t <= 5; t++) {
      untilTurnOf(s, mag);
      seen.push(snap());
      if (t === 2) {
        const before = d.buffs.length;
        expect(castSpell(s, mag.id, SL.amplification, d.cell).ok).toBe(true);
        expect(d.buffs.length).toBe(before);
      }
    }
    expect(seen).toEqual([
      [2, true, 20],
      [3, true, 20],
      [4, true, 0],
      [5, false, 0],
    ]);
  });

  it('Protection Prolongée : bouclier jusqu’au prochain tour du Magicien ; soin TB au début des 2 tours suivants de l’allié', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300);
    const mag = player(s, 'magicien', cellInDirectionOrThrow(300, 1, 2));
    timeline(s, [d, mag]);
    d.hp = 20000;
    untilTurnOf(s, mag);
    expect(castSpell(s, mag.id, SL.protection, d.cell).ok).toBe(true);
    expect(d.shield).toBe(3000);
    const hps: number[] = [];
    for (let t = 2; t <= 4; t++) {
      untilTurnOf(s, d);
      hps.push(d.hp);
      if (t === 2) expect(d.shield).toBe(3000);
      untilTurnOf(s, mag);
      if (t === 2) expect(d.shield).toBe(0);
    }
    // 44 × 61 = 2 684 à chaque déclenchement (TB)
    expect(hps).toEqual([22684, 25368, 25368]);
    expect(s.log!.ofType('triggered').filter((e) => e.carrierId === d.id && e.token === 'TB')).toHaveLength(2);
  });

  it('Protection Prolongée sur soi : 1 soin (décompte avant TB) ; spells.protectionProlongeeSelfHeals = 2', () => {
    for (const [heals, exp] of [
      [1, 1],
      [2, 2],
    ] as const) {
      const { s } = arena({ rng: MIN, spells: { protectionProlongeeSelfHeals: heals } });
      const mag = player(s, 'magicien', 300);
      timeline(s, [mag]);
      mag.hp = 10000;
      untilTurnOf(s, mag);
      castSpell(s, mag.id, SL.protection, mag.cell);
      for (let t = 0; t < 3; t++) untilTurnOf(s, mag);
      expect(s.log!.ofType('triggered').filter((e) => e.token === 'TB' && e.carrierId === mag.id)).toHaveLength(exp);
      expect(mag.hp).toBe(10000 + exp * 2684);
    }
  });
});

describe('sorts à relance croissante', () => {
  it('Grondement Grandissant : +20 de base (délai 2, durée 1) à la relance 2 tours plus tard, non cumulatif', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300);
    const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 7, 3));
    timeline(s, [d]);
    const hits: number[] = [];
    for (let turn = 1; turn <= 5; turn++) {
      untilTurnOf(s, d);
      t.hp = t.maxHp;
      const r = castSpell(s, d.id, SL.grondement, t.cell);
      if (turn % 2 === 0) expect(r.code).toBe('COOLDOWN');
      else hits.push(damagesOf(s, t.id).at(-1)!);
      expect(spellBaseDamageBonus(d, 30396)).toBe(turn % 2 === 1 && turn > 1 ? 20 : 0);
    }
    expect(hits).toEqual([82 * 61, 102 * 61, 102 * 61]);
  });

  it('Relâchement de Fureur : obtenu (3405) → +25 de base aux 4 débuts de tour suivants ; T12 : 35 014 sur la Mama Vulnérable', () => {
    const { s } = arena({ rng: MIN });
    const d = player(s, 'dompteur', 300, [SL.frappe, SL.impact]);
    const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, cellInDirectionOrThrow(300, 5, 4));
    timeline(s, [d]);
    untilTurnOf(s, d);
    obtainSpell(s, d, SL.relachement);
    expect(d.knowsSpell(SL.relachement)).toBe(true);
    const growth = d.buffs.find((b) => b.spellId === 30624 && b.kind === 'triggered')!;
    expect([growth.triggersLeft, growth.duration]).toEqual([4, -1]);
    const bonus: number[] = [];
    for (let t = 2; t <= 6; t++) {
      untilTurnOf(s, d);
      bonus.push(spellBaseDamageBonus(d, 30611));
    }
    expect(bonus).toEqual([25, 50, 75, 100, 100]);
    expect(d.buffs.includes(growth)).toBe(false);
    resolveSpell(s, mama, s.ctx.getSpell(SL.exitSpikes), mama.cell);
    expect(castSpell(s, d.id, SL.relachement, mama.cell).ok).toBe(true);
    expect(damagesOf(s, mama.id).at(-1)).toBe(35014);
  });

  it('Relâchement : spells.relachementGrowthStart = immediate (+25 aussitôt) ; relachementMaxStacks', () => {
    const { s } = arena({ rng: MIN, spells: { relachementGrowthStart: 'immediate', relachementMaxStacks: 2 } });
    const d = player(s, 'dompteur', 300, [SL.frappe]);
    timeline(s, [d]);
    untilTurnOf(s, d);
    obtainSpell(s, d, SL.relachement);
    expect(spellBaseDamageBonus(d, 30611)).toBe(25);
    for (let t = 0; t < 3; t++) untilTurnOf(s, d);
    expect(spellBaseDamageBonus(d, 30611)).toBe(50);
  });
});

describe('Pense Vite (3407, +999 PA différés, 406 en fin de tour)', () => {
  it('tour suivant : 10 s et 1 007 PA ; le bonus est retiré à la fin de ce tour', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300, [SL.frappe, 80843]);
    timeline(s, [acro]);
    untilTurnOf(s, acro);
    expect(acro.turnSeconds).toBe(60);
    expect(castSpell(s, acro.id, 80843, acro.cell).ok).toBe(true);
    expect(acro.knowsSpell(80843)).toBe(false);
    expect(acro.ap).toBe(3);
    untilTurnOf(s, acro);
    expect([acro.turnSeconds, acro.ap]).toEqual([10, 8 + 999]);
    untilTurnOf(s, acro);
    expect([acro.turnSeconds, acro.ap]).toEqual([60, 8]);
    expect(acro.buffs.some((b) => b.spellId === 30615)).toBe(false);
  });
});

describe('Mama : passe-tour (140, durée 6) et arrivée différée (délai 7) — règle du premier tour', () => {
  function withMama(over: ConfigOverrides = {}, blockers: number[] = []) {
    const { s } = arena({ rng: MIN, ...over });
    const mama = mob(s, M.mama, 152);
    const acro = player(s, 'acrobate', 213);
    for (const c of blockers) addFighter(s, { kind: 'custom', team: 'players', stats: { hp: 1000 } }, c);
    timeline(s, [mama, acro]);
    return { s, mama, acro };
  }

  it('tours 1 à 6 annulés, T7 libre sur 152 (état 5971 expiré), T8 : téléportation sur 300 et Rassemblement', () => {
    const { s, mama } = withMama();
    const cancelled: number[] = [];
    const started: number[] = [];
    for (let i = 0; i < 40; i++) {
      const r = nextTurn(s);
      if (r.status === 'turnStarted' && r.fighterId === mama.id) started.push(s.turn);
      if (s.turn === 8 && s.activeFighterId === mama.id) break;
    }
    for (const e of s.log!.ofType('turnCancelled')) cancelled.push(e.fighterId);
    expect(cancelled).toEqual([mama.id, mama.id, mama.id, mama.id, mama.id, mama.id]);
    expect(started).toEqual([7, 8]);
    expect(mama.cell).toBe(300);
    expect(mama.hasState(5971)).toBe(false);
    // Rassemblement installé (TB permanent) et déclenché dès l'arrivée
    expect(s.log!.ofType('triggered').filter((e) => e.carrierId === mama.id && e.token === 'TB').length).toBeGreaterThanOrEqual(1);
  });

  it('300 occupée → 287 ; 300 et 287 occupées → 273 (axe vers 152, boss.arrivalFallback)', () => {
    for (const [blockers, cell] of [
      [[300], 287],
      [[300, 287], 273],
    ] as const) {
      const { s, mama } = withMama({}, [...blockers]);
      for (let i = 0; i < 40 && s.turn < 8; i++) nextTurn(s);
      while (s.activeFighterId !== mama.id || s.turn < 8) nextTurn(s);
      expect(mama.cell).toBe(cell);
    }
  });

  it('engine.firstTurnDecrementSkip = none : tout décalé d’un tour (arrivée au T7)', () => {
    const { s, mama } = withMama({ engine: { firstTurnDecrementSkip: 'none' } });
    for (let i = 0; i < 40 && s.turn <= 7; i++) nextTurn(s);
    expect(mama.cell).toBe(300);
    expect(s.log!.ofType('turnCancelled')).toHaveLength(5);
  });
});

describe('durée 0 : reste du tour (boss.catastroollBonusScope)', () => {
  it('Catastrooll : +20 % DF jusqu’à la fin du tour de la Mama (défaut) ; jusqu’au prochain lancer ; neutralisé', () => {
    for (const [scope, afterCast, afterTurn] of [
      ['restOfTurn', 20, 0],
      ['nextCastOnly', 0, 0],
      ['none', 0, 0],
    ] as const) {
      const { s } = arena({ rng: MIN, boss: { catastroollBonusScope: scope } });
      const mama = addFighter(s, { kind: 'monster', monsterId: M.mama }, 300);
      const p = player(s, 'dompteur', cellInDirectionOrThrow(300, 1, 3));
      timeline(s, [mama, p]);
      untilTurnOf(s, mama);
      expect(castSpell(s, mama.id, 80498, mama.cell).ok).toBe(true);
      expect(mama.stat(Stat.FINAL_DAMAGE)).toBe(scope === 'none' ? 0 : 20);
      castSpell(s, mama.id, 80497, p.cell);
      expect(mama.stat(Stat.FINAL_DAMAGE)).toBe(afterCast);
      endTurn(s);
      expect(mama.stat(Stat.FINAL_DAMAGE)).toBe(afterTurn);
    }
  });
});

describe('timeline : invocations, tours annulés, choix en attente, actions', () => {
  it('Soutien Stratégique : le Poutch joue juste après l’Acrobate ; spells.poutchLifetimeTurns = 1 : il meurt au tour suivant de l’Acrobate', () => {
    for (const life of [null, 1] as const) {
      const { s } = arena({ rng: MIN, spells: { poutchLifetimeTurns: life } });
      const acro = player(s, 'acrobate', 300);
      const d = player(s, 'dompteur', 213);
      timeline(s, [acro, d]);
      untilTurnOf(s, acro);
      expect(castSpell(s, acro.id, SL.soutien, cellInDirectionOrThrow(300, 1, 2)).ok).toBe(true);
      const poutch = s.fighters.find((f) => f.monsterId === M.poutch)!;
      expect(s.timeline).toEqual([acro.id, poutch.id, d.id]);
      expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: poutch.id });
      untilTurnOf(s, acro);
      expect(poutch.alive).toBe(life === null);
    }
  });

  it('nextTurn s’arrête sur un choix en attente (crochet onGlobalTurn) et reprend après sa résolution', () => {
    const { s } = arena({ rng: MIN }, {
      onGlobalTurn(state, turn) {
        if (turn === 2) {
          state.pendingChoices.push({ uid: state.newUid(), scope: 'global', choiceListId: 17, fighterId: -1, casterId: -1, spellLevelId: 0, castId: 0, turn });
        }
      },
    });
    const d = player(s, 'dompteur', 300);
    timeline(s, [d]);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: d.id });
    expect(nextTurn(s)).toEqual({ status: 'pendingChoice' });
    expect([s.turn, s.turnStage, s.activeFighterId]).toEqual([2, 'pending', d.id]);
    expect(nextTurn(s)).toEqual({ status: 'pendingChoice' });
    s.pendingChoices.shift();
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: d.id });
    expect(d.turnCount).toBe(2);
  });

  it('performAction : seul le combattant dont c’est le tour agit (lancer, déplacement, fin de tour)', () => {
    const { s } = arena({ rng: MIN });
    const acro = player(s, 'acrobate', 300);
    const d = player(s, 'dompteur', 213);
    const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    timeline(s, [acro, d, t]);
    nextTurn(s);
    expect(performAction(s, d.id, { type: 'endTurn' })).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    expect(performAction(s, acro.id, { type: 'cast', spellLevelId: SL.frappe, cell: t.cell }).ok).toBe(true);
    expect(performAction(s, acro.id, { type: 'moveTo', cell: cellInDirectionOrThrow(300, 5, 1) }).ok).toBe(true);
    expect(performAction(s, acro.id, { type: 'endTurn' }).ok).toBe(true);
    expect(s.turnStage).toBe('none');
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: d.id });
    expect(acro.castRecord(30416)!.turnCasts).toBe(0);
  });

  it('spells.newSpellUsableSameTurn = false : un sort obtenu pendant son tour n’est lançable qu’au tour suivant', () => {
    for (const usable of [true, false]) {
      const { s } = arena({ rng: MIN, spells: { newSpellUsableSameTurn: usable } });
      const d = player(s, 'dompteur', 300, [SL.frappe]);
      const t = mob(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      timeline(s, [d]);
      untilTurnOf(s, d);
      obtainSpell(s, d, SL.impact);
      expect(castSpell(s, d.id, SL.impact, t.cell).code).toBe(usable ? undefined : 'LEARNED_THIS_TURN');
      untilTurnOf(s, d);
      expect(castSpell(s, d.id, SL.impact, t.cell).ok).toBe(true);
    }
  });

  it('removeFromTimeline : le combattant suivant joue quand même (tour en cours ou à venir retiré)', () => {
    const { s } = arena({ rng: MIN });
    const [a, b, c] = [player(s, 'acrobate', 300), player(s, 'dompteur', 213), player(s, 'magicien', 242)];
    timeline(s, [a, b, c]);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: a.id });
    removeFromTimeline(s, a.id);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: b.id });
    removeFromTimeline(s, c.id);
    expect(nextTurn(s)).toEqual({ status: 'turnStarted', fighterId: b.id });
    expect(s.turn).toBe(2);
  });

  it('startTurn / endTurn directs : un tour en cours est terminé avant le suivant ; turnCount et compteurs', () => {
    const { s } = arena({ rng: MIN });
    const a = player(s, 'acrobate', 300);
    const b = player(s, 'dompteur', 213);
    expect(startTurn(s, a.id)).toMatchObject({ ok: true, cancelled: false });
    expect(s.activeFighterId).toBe(a.id);
    startTurn(s, b.id);
    expect(s.log!.ofType('turnEnd').map((e) => e.fighterId)).toEqual([a.id]);
    expect([a.turnCount, b.turnCount, s.activeFighterId]).toEqual([1, 1, b.id]);
  });
});

describe('robustesse : combats complets aux actions aléatoires', () => {
  function invariants(s: FightState, label: string): void {
    expect([s.triggerQueue.length, s.castDepth, s.flushMark, s.triggerChain.length], label).toEqual([0, 0, 0, 0]);
    for (let c = 0; c < CELL_COUNT; c++) {
      const o = s.occupancy[c]!;
      if (o) expect(s.fighters[o - 1]!.alive && s.fighters[o - 1]!.cell === c, `${label} : case ${c}`).toBe(true);
    }
    for (const f of s.fighters) {
      if (f.alive) expect(f.hp > 0 && f.hp <= f.maxHp, `${label} : PV de ${f.name}`).toBe(true);
      for (const b of f.buffs) expect(b.targetId).toBe(f.id);
    }
    for (const m of s.marks) {
      for (const id of m.occupants) expect(s.fighters[id]!.alive && m.contains(s.fighters[id]!.cell), `${label} : occupant`).toBe(true);
    }
  }

  it('Mama, 4 archétypes (sorts et uniques), 4 Troolls, pics : 6 graines × 60 étapes sans exception ni incohérence', () => {
    let actions = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { s } = arena({ rng: { rollMode: 'random', critMode: 'random', seed }, engine: { eventLog: false } });
      const r = new Rng(seed * 7919);
      const mama = mob(s, M.mama, 152);
      const ps = [player(s, 'acrobate', 314), player(s, 'dompteur', 286), player(s, 'dompteur', 287), player(s, 'magicien', 315)];
      const ms = [mob(s, M.troollibre, 242), mob(s, M.troollibre, 358), mob(s, M.artroolleur, 232), mob(s, M.nitrooll, 372)];
      for (const p of ps) for (const u of p.archetypeData!.uniques) learnSpell(s, p, u);
      timeline(s, [mama, ps[0]!, ms[0]!, ps[1]!, ms[1]!, ps[2]!, ms[2]!, ps[3]!, ms[3]!]);
      for (let step = 0; step < 60; step++) {
        const adv = nextTurn(s);
        if (adv.status === 'pendingChoice') {
          s.pendingChoices.length = 0;
          continue;
        }
        if (adv.status !== 'turnStarted') break;
        invariants(s, `graine ${seed}, étape ${step}`);
        const f = s.fighters[adv.fighterId]!;
        for (let k = 0; k < 6 && f.alive && s.turnStage === 'active'; k++) {
          s.pendingChoices.length = 0;
          if (r.next() < 0.3 && f.mp > 0) {
            const cells = reachableCells(s.ctx.grid, f.cell, f.mp, s.occupiedPredicate()).cells.slice(1);
            if (cells.length) performAction(s, f.id, { type: 'moveTo', cell: cells[r.int(0, cells.length - 1)]! });
          } else {
            const spells = f.spells.filter((x) => s.ctx.getSpell(x.spellLevelId).cast.ap <= f.ap);
            if (!spells.length) break;
            const sp = spells[r.int(0, spells.length - 1)]!;
            const cells = getCastableCells(s, f.id, sp.spellLevelId);
            if (!cells.length) continue;
            performAction(s, f.id, { type: 'cast', spellLevelId: sp.spellLevelId, cell: cells[r.int(0, cells.length - 1)]! });
          }
          actions++;
          invariants(s, `graine ${seed}, étape ${step}, action ${k}`);
        }
      }
      expect(s.turn).toBeGreaterThan(3);
    }
    expect(actions).toBeGreaterThan(300);
  });
});
