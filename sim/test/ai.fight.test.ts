/**
 * IA des monstres — combats complets (joueurs aléatoires contre l'IA, sans erreur, invariants à chaque point de
 * décision, aucune entrée volontaire dans les pics), déterminisme, performances, mode anticipation, estimation de
 * menace (cohérence avec le passage réel des monstres, état intact).
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig } from '../src/data/index.js';
import { createGladiatroolFight, createRandomController, playUntilEnd, type GladiatroolFight, type MonsterController } from '../src/scenario/index.js';
import { anticipationMonsterAi, estimateThreat, FAST_THREAT_OPTIONS, monsterAi } from '../src/ai/index.js';
import { checkInvariants, newFight, QUIET } from './helpers/scenarioSetup.js';
import { freeNeighbour, relocate, sendPlayersAway } from './helpers/aiSetup.js';

const ADDM = [{ archetype: 'acrobate' }, { archetype: 'dompteur' }, { archetype: 'dompteur' }, { archetype: 'magicien' }] as const;
const AADM = [{ archetype: 'acrobate' }, { archetype: 'acrobate' }, { archetype: 'dompteur' }, { archetype: 'magicien' }] as const;

/** Enveloppe qui mesure la durée de chaque tour de monstre. */
function timed(ai: MonsterController, out: number[]): MonsterController {
  return {
    playTurn(fight, id) {
      const t0 = performance.now();
      ai.playTurn(fight, id);
      out.push(performance.now() - t0);
    },
  };
}

/**
 * Combat complet : joueurs aléatoires (graine dérivée), IA ``ai`` pour les monstres. ``tank`` : PV des joueurs
 * portés à 10⁶ (outil de test) pour atteindre les dernières vagues et la Mama.
 */
function play(seed: number, players: typeof ADDM | typeof AADM, ai: MonsterController, check = true, maxTurn = 12, tank = false): GladiatroolFight {
  const fight = createGladiatroolFight(gameData, loadConfig({}), { seed, players: players.map((p) => ({ ...p })), options: { eventLog: check, monsterController: ai } });
  if (tank) {
    for (const p of fight.getPlayers()) {
      p.baseMaxHp = 1_000_000;
      p.hp = 1_000_000;
    }
  }
  playUntilEnd(fight, {
    players: createRandomController(seed * 7 + 1),
    maxTurn,
    onStep: check ? (f) => checkInvariants(f, `graine ${seed} T${f.turn}`) : undefined,
  });
  return fight;
}

describe('combats complets contre l’IA', () => {
  it('ADDM et AADM, joueurs aléatoires : aucune erreur, invariants, aucune marche volontaire dans les pics', () => {
    for (const [seed, comp, tank] of [[1, ADDM, false], [2, AADM, false], [3, ADDM, true], [4, AADM, true]] as const) {
      const fight = play(seed, comp, monsterAi, true, 12, tank);
      if (tank) expect(fight.turn).toBeGreaterThanOrEqual(10);
      const s = fight.state;
      const grid = fight.ctx.grid;
      let monsterActions = 0;
      for (const e of s.log!.events) {
        if (e.type === 'cast' && e.depth === 0 && s.fighters[e.casterId]!.team === 'monsters') monsterActions++;
        if (e.type !== 'move' || e.kind !== 'walk') continue;
        const f = s.fighters[e.fighterId]!;
        if (f.team !== 'monsters' || grid.isSpike(e.from)) continue;
        for (const c of e.path) expect(grid.isSpike(c), `${f.name} marche dans les pics (${e.from} → ${e.to})`).toBe(false);
      }
      expect(monsterActions).toBeGreaterThan(5);
      expect(s.log!.events.some((e) => e.type === 'castFailed' && s.fighters[e.casterId]!.team === 'monsters')).toBe(false);
    }
  }, 30_000);

  it('déterminisme : même graine → même journal', () => {
    const a = play(4, ADDM, monsterAi, true, 5).describeLog();
    const b = play(4, ADDM, monsterAi, true, 5).describeLog();
    expect(a.length).toBeGreaterThan(100);
    expect(b).toEqual(a);
  });

  it('performances : tour de monstre < 5 ms en moyenne (mode anticipation plus rapide)', () => {
    const full: number[] = [];
    const fast: number[] = [];
    for (const seed of [5, 6]) {
      play(seed, ADDM, timed(monsterAi, full), false, 10, true);
      play(seed, ADDM, timed(anticipationMonsterAi, fast), false, 10, true);
    }
    const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(1, v.length);
    expect(full.length).toBeGreaterThan(150);
    expect(mean(full)).toBeLessThan(5);
    expect(mean(fast)).toBeLessThan(5);
  }, 30_000);

  it('le contrôleur passe par l’API publique : un clone joue comme l’original', () => {
    const fight = newFight(QUIET, { seed: 8 });
    for (let i = 0; i < 30 && fight.turn < 3; i++) {
      const st = fight.getStatus();
      if (st.kind === 'monsterTurn') break;
      if (st.kind === 'choice') fight.resolveChoice(st.choice.uid, 0);
      else if (st.kind === 'playerTurn') fight.endTurn();
      else fight.advance();
    }
    const clone = fight.clone();
    fight.runUntilPlayerInput(monsterAi);
    clone.runUntilPlayerInput(monsterAi);
    expect(clone.state.fighters.map((f) => [f.hp, f.cell])).toEqual(fight.state.fighters.map((f) => [f.hp, f.cell]));
  });
});

describe('estimation de menace (estimateThreat)', () => {
  it('ne modifie pas l’état ; un joueur au contact d’un Troollibre est menacé', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const acro = fight.getPlayers()[0]!;
    const t = fight.getLivingMonsters().find((m) => m.name.startsWith('Troollibre'))!;
    sendPlayersAway(fight, [t.cell], 12, [acro]);
    relocate(fight, acro, freeNeighbour(fight, t.cell));
    const before = JSON.stringify(fight.state.fighters.map((f) => [f.hp, f.cell, f.ap, f.mp, f.buffs.length]));
    const th = estimateThreat(fight);
    expect(JSON.stringify(fight.state.fighters.map((f) => [f.hp, f.cell, f.ap, f.mp, f.buffs.length]))).toBe(before);
    const pa = th.players.find((p) => p.fighterId === acro.id)!;
    expect(pa.expectedDamage).toBeGreaterThan(3000);
    expect(th.total).toBeGreaterThanOrEqual(pa.expectedDamage);
    expect(th.monsters.length).toBe(2);
    expect(th.monsters[0]!.damageDealt).toBeGreaterThan(0);
  });

  it('mode rapide : égale le passage réel des monstres (IA d’anticipation, jet moyen, sans critique)', () => {
    for (const seed of [1, 2, 3]) {
      const fight = createGladiatroolFight(gameData, loadConfig({ ...QUIET, rng: { rollMode: 'average', critMode: 'never' } }), { seed });
      const th = estimateThreat(fight, FAST_THREAT_OPTIONS);
      const hp0 = fight.getPlayers().map((p) => p.hp);
      // passage : fin du tour de J1, joueurs passifs, monstres de l'IA d'anticipation, jusqu'au tour suivant de J1
      const j1 = fight.getCurrentFighter()!.id;
      fight.endTurn();
      for (let i = 0; i < 200; i++) {
        const st = fight.getStatus();
        if (st.kind === 'playerTurn' && st.fighterId === j1) break;
        if (st.kind === 'ended') break;
        if (st.kind === 'choice') fight.resolveChoice(st.choice.uid, 0);
        else if (st.kind === 'playerTurn') fight.endTurn();
        else if (st.kind === 'monsterTurn') fight.stepMonsterTurn(anticipationMonsterAi);
        else fight.advance();
      }
      const actual = fight.getPlayers().map((p, k) => hp0[k]! - (p.alive ? p.hp : 0));
      const predicted = fight.getPlayers().map((p) => th.players.find((x) => x.fighterId === p.id)!.expectedDamage);
      for (let k = 0; k < actual.length; k++) expect(Math.abs(predicted[k]! - actual[k]!), `graine ${seed} joueur ${k}`).toBeLessThanOrEqual(2);
    }
  });
});
