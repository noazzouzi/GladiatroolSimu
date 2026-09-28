/**
 * Scénario — Mama Troollette (ETUDE §6, SPEC T10 / T14) : attente sur 152 (tours annulés T1–T6, aucune action au T7),
 * arrivée au début de T8 sur 300 (repli 287), Rassemblement (joueurs alignés repoussés au bord sans dommages de
 * poussée), Faveur de la foule (125 % → 100 % après 5 objectifs).
 */
import { describe, expect, it } from 'vitest';
import type { ConfigOverrides } from '../src/data/index.js';
import { castSpell, placeFighter, Stat } from '../src/engine/index.js';
import { activateObjective, scenarioCast, type GladiatroolFight, type MonsterController } from '../src/scenario/index.js';
import { advanceUntil, checkInvariants, kill, newFight, QUIET, troolls, untilPlayerTurn } from './helpers/scenarioSetup.js';

/**
 * Amène le combat au dernier tour de joueur du T7, vide la carte des Troolls, place les joueurs sur ``cells`` puis
 * termine le tour : renvoie le combat au début du tour de la Mama au T8 (après son arrivée).
 */
function arrival(cells: number[], over: ConfigOverrides = {}): GladiatroolFight {
  const fight = newFight({ ...QUIET, ...over });
  untilPlayerTurn(fight, 7, 3);
  kill(fight, troolls(fight));
  fight.getPlayers().forEach((p, i) => placeFighter(fight.state, p, cells[i]!));
  fight.endTurn();
  expect(fight.turn).toBe(8);
  return fight;
}

describe('Mama : attente et arrivée (T10)', () => {
  it('tours T1–T6 annulés, T7 sans action (boss.actsBeforeArrival faux), arrivée au début de T8 sur 300', () => {
    const calls: number[] = [];
    const spy: MonsterController = {
      playTurn(f, id) {
        if (id === f.scenario.mamaId) calls.push(f.turn);
      },
    };
    const fight = newFight(QUIET, { options: { monsterController: spy } });
    const mama = fight.getMama()!;
    advanceUntil(fight, (f) => f.turn === 8 && f.getCurrentFighter()?.id === mama.id);
    const cancelled = fight.state.log!.ofType('turnCancelled').filter((e) => e.fighterId === mama.id);
    expect(cancelled).toHaveLength(6);
    expect(mama.cell).toBe(300);
    expect(mama.hasState(5971)).toBe(false);
    expect(calls).toEqual([]);
    expect(fight.getStatus()).toEqual({ kind: 'monsterTurn', fighterId: mama.id });
    fight.stepMonsterTurn();
    expect(calls).toEqual([8]);
    // actsBeforeArrival : l'IA est consultée au T7 (sur 152)
    const calls2: number[] = [];
    const f2 = newFight({ ...QUIET, boss: { actsBeforeArrival: true } }, {
      options: { monsterController: { playTurn: (f, id) => void (id === f.scenario.mamaId && calls2.push(f.turn)) } },
    });
    advanceUntil(f2, (f) => f.turn === 8 && f.isPlayerTurn());
    expect(calls2).toEqual([7, 8]);
  });

  it('Rassemblement : joueurs alignés repoussés jusqu’au bord (dans les pics) sans dommages de poussée ; les autres restent', () => {
    const fight = arrival([314, 329, 244, 246]);
    const mama = fight.getMama()!;
    expect(mama.cell).toBe(300);
    const [a, b, c, d] = fight.getPlayers();
    expect([a!.cell, b!.cell, c!.cell, d!.cell]).toEqual([408, 416, 244, 192]);
    for (const p of [a!, b!, d!]) {
      expect(p.hp).toBe(28000); // 2 000 d'entrée dans les pics seulement
      expect(p.hasState(5918)).toBe(true);
      expect(fight.ctx.data.map.spikes.cells).toContain(p.cell);
      expect(fight.ctx.grid.edgeDepth(p.cell)).toBe(1);
    }
    expect(c!.hp).toBe(30000);
    const collisions = fight.state.log!.ofType('damage').filter((e) => e.collision && fight.state.fighters[e.targetId]!.team === 'players');
    expect(collisions).toEqual([]);
    checkInvariants(fight);
  });

  it('300 occupée → arrivée sur 287 (boss.arrivalFallback) ; lignes x = 17 et y = −3', () => {
    const fight = arrival([300, 244, 330, 213]);
    const mama = fight.getMama()!;
    expect(mama.cell).toBe(287);
    const [a, b, c, d] = fight.getPlayers();
    // 300 est sur l'axe x = 17 de 287 : repoussé jusqu'en 408 ; 330 sur y = −3 : jusqu'en 403
    expect(a!.cell).toBe(408);
    expect(c!.cell).toBe(403);
    expect([b!.cell, d!.cell]).toEqual([244, 213]);
  });

  it('objectif « Attirance » : tous les joueurs vivants attrapés par un même Rassemblement', () => {
    const fight = arrival([314, 329, 244, 246]);
    expect(fight.scenario.completed.map((c) => c.objectiveId)).toEqual([]);
    const f2 = newFight(QUIET);
    untilPlayerTurn(f2, 7, 3);
    kill(f2, troolls(f2));
    // objectif « Attirance » activé directement (test), joueurs tous alignés avec 300
    activateObjective(f2.state, 'attirance');
    f2.getPlayers().forEach((p, i) => placeFighter(f2.state, p, [314, 329, 273, 286][i]!));
    f2.endTurn();
    expect(f2.scenario.completed.map((c) => c.objectiveId)).toEqual(['attirance']);
    expect(f2.getPendingChoice()?.choiceListId).toBe(15);
  });

  it('boss.giftCancelsRassemblement : un joueur poussé sur un cadeau par le Rassemblement fait passer son tour à la Mama', () => {
    for (const cancels of [false, true]) {
      const calls: number[] = [];
      const fight = newFight({ ...QUIET, boss: { giftCancelsRassemblement: cancels } }, {
        options: { monsterController: { playTurn: (f, id) => void (id === f.scenario.mamaId && calls.push(f.turn)) } },
      });
      untilPlayerTurn(fight, 7, 3);
      const [t1, t2] = troolls(fight);
      kill(fight, troolls(fight).filter((t) => t !== t1));
      // Trooll Inébranlable (Patroolleur) sur 341 : le joueur de 314 est arrêté sur 327, où l'on pose un cadeau
      placeFighter(fight.state, t1!, 341);
      expect(castSpell(fight.state, t1!.id, 80485, 341, { ignoreConditions: true }).ok).toBe(true);
      expect(t1!.unshakable).toBe(true);
      void t2;
      scenarioCast(fight.state, fight.scenario, fight.ctx.data.scenario.gifts.spellLevel, 327);
      fight.getPlayers().forEach((p, i) => placeFighter(fight.state, p, [314, 244, 213, 246][i]!));
      fight.endTurn();
      const [a] = fight.getPlayers();
      expect(a!.cell).toBe(327);
      expect(fight.getPendingChoices().filter((c) => c.choiceListId === 10)).toHaveLength(4);
      advanceUntil(fight, (f) => f.turn === 8 && f.isPlayerTurn());
      expect(calls).toEqual(cancels ? [] : [8]);
    }
  });
});

describe('Faveur de la foule (T14)', () => {
  it('DF de la Mama : 125 % → 120 … → 100 % après 5 objectifs, 95 % au 6e ; chaque objectif apprend le sort du palier', () => {
    const fight = newFight(QUIET);
    const mama = fight.getMama()!;
    const df: number[] = [mama.stat(Stat.FINAL_DAMAGE)];
    const states: number[][] = [];
    for (let k = 1; k <= 6; k++) {
      expect(fight.debugCompleteObjective()).toBe(true);
      df.push(mama.stat(Stat.FINAL_DAMAGE));
      states.push([5973, 5974, 5975, 5976, 5977].filter((s) => mama.hasState(s)));
      const vote = fight.getPendingChoice();
      if (k < 6) {
        expect(vote?.choiceListId).toBe(10 + k);
        expect(vote!.options).toHaveLength(2);
        expect(fight.resolveChoice(vote!.uid, 0).ok).toBe(true);
      } else expect(vote).toBeNull();
    }
    expect(df).toEqual([25, 20, 15, 10, 5, 0, -5]);
    expect(states).toEqual([[5974], [5975], [5976], [5977], [], []]);
    for (const p of fight.getPlayers()) {
      expect(p.spells.map((s) => s.spellLevelId)).toEqual(p.archetypeData!.spellSlots.map((s) => s.spellLevelId));
    }
    expect(fight.debugCompleteObjective()).toBe(false);
  });

  it('boss.favourCap = 5 : la Faveur ne descend plus sous 100 %', () => {
    const fight = newFight({ ...QUIET, boss: { favourCap: 5 } });
    for (let k = 1; k <= 6; k++) {
      fight.debugCompleteObjective();
      const v = fight.getPendingChoice();
      if (v) fight.resolveChoice(v.uid, 0);
    }
    expect(fight.getMama()!.stat(Stat.FINAL_DAMAGE)).toBe(0);
    expect(fight.scenario.completed).toHaveLength(6);
  });
});
