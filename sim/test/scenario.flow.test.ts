/**
 * Scénario — déroulé complet (ETUDE §2.1, §2.6) : victoire après V10 (combatCanFinish), défaite, limite de tours,
 * machine à états (choix pendant le tour d'un monstre), déterminisme, clonage, combats de bout en bout avec des IA
 * triviales des deux côtés (invariants).
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig } from '../src/data/index.js';
import {
  createGladiatroolFight,
  createRandomController,
  createScenarioContext,
  playUntilEnd,
  resolveAllChoices,
  simpleMonsterController,
  type GladiatroolFight,
  type MonsterController,
} from '../src/scenario/index.js';
import { advanceUntil, checkInvariants, DET, kill, newFight, QUIET, troolls, untilPlayerTurn } from './helpers/scenarioSetup.js';

describe('fin du combat', () => {
  it('victoire : tous les ennemis morts après V10 (état 5965 posé au T10) ; les actions sont ensuite refusées', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 10, 0);
    const sce = fight.state.fighters[fight.scenario.sceId]!;
    expect(sce.hasState(5965)).toBe(true);
    expect(fight.scenario.waves.at(-1)!.wave).toBe(10);
    kill(fight, fight.getLivingMonsters());
    expect(fight.getStatus()).toEqual({ kind: 'ended', winner: 'players', reason: 'victory' });
    const r = fight.getResult();
    expect([r.ended, r.winner, r.reason, r.turn, r.monstersAlive, r.monstersKilled]).toEqual([true, 'players', 'victory', 10, 0, 32]);
    expect(fight.playerCast(80499, 300).code).toBe('FIGHT_ENDED');
    expect(fight.isPlayerTurn()).toBe(false);
    expect(fight.state.log!.ofType('fightEnded')).toHaveLength(1);
  });

  it('tuer la Mama et tous les Troolls avant le T10 ne termine pas le combat : les vagues continuent', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 5, 0);
    kill(fight, fight.getLivingMonsters());
    expect(fight.isEnded()).toBe(false);
    untilPlayerTurn(fight, 6, 0);
    expect(troolls(fight)).toHaveLength(3);
    expect(fight.getMama()!.alive).toBe(false);
  });

  it('victory.canFinishFromTurn = 11 : tout tuer au T10 ne suffit pas ; victoire au début du T11', () => {
    const fight = newFight({ ...QUIET, victory: { canFinishFromTurn: 11 } });
    untilPlayerTurn(fight, 10, 0);
    kill(fight, fight.getLivingMonsters());
    expect(fight.isEnded()).toBe(false);
    advanceUntil(fight, (f) => f.isEnded());
    expect(fight.getStatus()).toEqual({ kind: 'ended', winner: 'players', reason: 'victory' });
    expect(fight.turn).toBe(11);
  });

  it('défaite : tous les joueurs morts ; un joueur mort pendant son tour passe la main', () => {
    const fight = newFight(QUIET);
    const [j1, j2, j3, j4] = fight.getPlayers();
    j1!.hp = 1000;
    // J1 marche dans les pics (1 000 < 2 000 d'entrée) : il meurt, son tour se termine
    j1!.mpUsed = -10;
    expect(fight.playerMove(395).ok).toBe(true);
    expect(j1!.alive).toBe(false);
    expect(fight.getStatus().kind).toBe('monsterTurn');
    kill(fight, [j1!, j2!, j3!]);
    expect(fight.isEnded()).toBe(false);
    kill(fight, [j4!]);
    expect(fight.getStatus()).toEqual({ kind: 'ended', winner: 'monsters', reason: 'defeat' });
  });

  it('victory.turnLimit : fin du combat (sans vainqueur) au début du tour qui dépasse la limite', () => {
    const fight = newFight({ ...QUIET, victory: { turnLimit: 3 } });
    advanceUntil(fight, (f) => f.isEnded(), () => 0, 5000);
    expect(fight.getStatus()).toEqual({ kind: 'ended', winner: null, reason: 'turnLimit' });
    expect(fight.turn).toBe(4);
  });
});

describe('machine à états', () => {
  it('un choix qui apparaît pendant le tour d’un monstre suspend son tour ; il reprend après la réponse', () => {
    const calls: number[] = [];
    const ctl: MonsterController = {
      playTurn(f, id) {
        calls.push(id);
        if (calls.length === 1) f.debugCompleteObjective();
      },
    };
    const fight = newFight(QUIET, { options: { monsterController: ctl } });
    const st = fight.endTurn();
    expect(st.kind).toBe('monsterTurn');
    const m = (st as { fighterId: number }).fighterId;
    const s2 = fight.stepMonsterTurn();
    expect(s2.kind).toBe('choice');
    expect(fight.getCurrentFighter()?.id).toBe(m);
    resolveAllChoices(fight);
    expect(fight.getStatus()).toEqual({ kind: 'monsterTurn', fighterId: m });
    const s3 = fight.stepMonsterTurn();
    expect(calls).toEqual([m, m]);
    expect(s3.kind).toBe('playerTurn');
  });

  it('les tours des monstres ne sont joués que par stepMonsterTurn / runUntilPlayerInput', () => {
    const fight = newFight(QUIET);
    expect(fight.endTurn().kind).toBe('monsterTurn');
    expect(fight.advance().kind).toBe('monsterTurn');
    expect(fight.runUntilPlayerInput().kind).toBe('playerTurn');
    expect(fight.getCurrentFighter()!.id).toBe(fight.scenario.playerIds[1]);
  });
});

describe('déterminisme et clonage', () => {
  function play(seed: number, eventLog = true): GladiatroolFight {
    const fight = createGladiatroolFight(gameData, loadConfig({ gifts: { spawnProbability: 0.72 } }), {
      seed,
      options: { eventLog, monsterController: simpleMonsterController },
    });
    playUntilEnd(fight, { players: createRandomController(seed * 31 + 1, 8, 0.25), maxTurn: 9 });
    return fight;
  }

  it('même graine (et mêmes contrôleurs) = même combat ; autre graine = autre combat', () => {
    const a = play(21);
    const b = play(21);
    expect(b.describeLog()).toEqual(a.describeLog());
    expect(b.getResult()).toEqual(a.getResult());
    const c = play(22);
    expect(c.describeLog()).not.toEqual(a.describeLog());
  });

  it('clone : copie indépendante ; rejouer la même suite sur la copie donne le même résultat', () => {
    const fight = createGladiatroolFight(gameData, loadConfig(DET), { seed: 3 });
    const copy = fight.clone();
    const j1 = fight.getCurrentFighter()!;
    const t = copy.state.fighterAt(242)!;
    t.hp = 100;
    copy.playerCast(80507, 256);
    expect(copy.scenario.completed).toHaveLength(1);
    expect(fight.scenario.completed).toHaveLength(0);
    expect(fight.state.fighterAt(242)!.hp).toBe(25000);
    expect(fight.getStatus()).toEqual({ kind: 'playerTurn', fighterId: j1.id });
    // deux copies du même point jouées pareil
    const x = fight.clone();
    const y = fight.clone();
    for (const f of [x, y]) {
      f.playerCast(80507, 256);
      playUntilEnd(f, { monsters: simpleMonsterController, players: createRandomController(5), maxTurn: 6 });
    }
    expect(y.getResult()).toEqual(x.getResult());
  });

  it('performance : clonage d’un état en cours de combat (≈ 20 combattants) et combat complet', () => {
    const ctx = createScenarioContext({ overrides: { engine: { eventLog: false } } });
    const fight = createGladiatroolFight(undefined, undefined, { seed: 8, options: { ctx, monsterController: simpleMonsterController } });
    advanceUntil(fight, (f) => f.turn === 5 && f.isPlayerTurn(), () => 0);
    const n = 2000;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fight.clone({ keepLog: false });
    const us = ((performance.now() - t0) * 1000) / n;
    expect(us).toBeLessThan(100);
    const t1 = performance.now();
    const g = createGladiatroolFight(undefined, undefined, { seed: 9, options: { ctx, monsterController: simpleMonsterController } });
    playUntilEnd(g, { players: createRandomController(9), maxTurn: 12 });
    expect(performance.now() - t1).toBeLessThan(5000);
  });
});

describe('combats de bout en bout (IA triviales des deux côtés)', () => {
  it('plusieurs graines, compositions A-D-D-M et A-A-D-M : sans exception, invariants à chaque point de décision', () => {
    let steps = 0;
    const comps = [
      ['acrobate', 'dompteur', 'dompteur', 'magicien'],
      ['acrobate', 'acrobate', 'dompteur', 'magicien'],
    ] as const;
    for (let seed = 1; seed <= 8; seed++) {
      const players = comps[seed % 2]!.map((archetype) => ({ archetype }));
      const monsters = seed % 3 === 0 ? createRandomController(seed * 7) : simpleMonsterController;
      const fight = createGladiatroolFight(gameData, loadConfig({ gifts: { spawnProbability: 1 } }), {
        seed,
        players,
        options: { eventLog: false, monsterController: monsters },
      });
      const st = playUntilEnd(fight, {
        players: createRandomController(seed * 13 + 5, 8, 0.3),
        choose: (c) => (c.scope === 'global' ? { votes: c.options.map((_, i) => i % c.options.length) } : c.options.length - 1),
        maxTurn: 12,
        onStep: (f, s) => {
          steps++;
          checkInvariants(f, `graine ${seed}, tour ${f.turn}, ${s.kind}`);
        },
      });
      expect(['ended', 'playerTurn', 'monsterTurn', 'choice']).toContain(st.kind);
      const r = fight.getResult();
      expect(r.turn).toBeGreaterThanOrEqual(2);
      if (r.ended) expect(r.winner === 'monsters' ? r.playersAlive : 1).toBeGreaterThanOrEqual(0);
    }
    expect(steps).toBeGreaterThan(100);
  });

  it('joueurs « scriptés » (ouverture de référence au T1) contre l’IA simple : Empalé au T1, objectifs suivants votés', () => {
    const fight = createGladiatroolFight(gameData, loadConfig({ rng: { critMode: 'never' } }), {
      seed: 2,
      options: { monsterController: simpleMonsterController },
    });
    // T1 : l'Acrobate envoie les deux Troollibres dans les pics (ETUDE §10.4)
    fight.playerCast(80507, 256);
    fight.playerCast(80507, 372);
    const [t1, t2] = troolls(fight);
    expect([t1!.cell, t2!.cell]).toEqual([199, 402]);
    fight.endTurn();
    fight.runUntilPlayerInput();
    // les Dompteurs finissent les Troolls Vulnérables avec Impact
    for (let k = 0; k < 2; k++) {
      const d = fight.getCurrentFighter()!;
      if (!fight.isPlayerTurn()) break;
      for (const t of troolls(fight)) {
        for (let i = 0; i < 2 && t.alive && fight.isPlayerTurn(); i++) {
          const cells = fight.getCastableCells(80500).filter((c) => c === t.cell);
          if (cells.length) fight.playerCast(80500, cells[0]!);
          resolveAllChoices(fight);
        }
      }
      if (fight.getCurrentFighter() === d) fight.endTurn();
      fight.runUntilPlayerInput();
      resolveAllChoices(fight);
    }
    expect(fight.scenario.completed.map((c) => c.objectiveId)[0]).toBe('empale');
    expect(fight.getPlayers().every((p) => p.spells.length >= 3)).toBe(true);
  });
});
