/**
 * IA des monstres — plateau et simulation analytique (board.ts, simulate.ts) confrontés au moteur : pour chaque sort
 * de monstre et chaque case lançable, avec des joueurs placés au hasard autour du lanceur, les PV et cases prévus
 * par le plateau (jet moyen du moteur, sans critique) sont ceux du moteur (``castSpell``, jet ``average``). Le
 * plateau ne modifie jamais l'état.
 */
import { describe, expect, it } from 'vitest';
import { castSpell, getCastableCells, Rng } from '../src/engine/index.js';
import { distance } from '../src/geometry/index.js';
import { Board, boardCanCastOn, boardCanCastSpell, boardCast } from '../src/ai/index.js';
import { newFight, QUIET } from './helpers/scenarioSetup.js';
import { relocate, untilMonsterTurn } from './helpers/aiSetup.js';
import { resolveAllChoices } from '../src/scenario/index.js';

describe('plateau de l’IA ↔ moteur', () => {
  it('sorts des Troolls et de la Mama : PV et cases identiques au moteur (jet moyen, sans critique)', () => {
    const fight = newFight(QUIET, { seed: 11 });
    untilMonsterTurn(fight, 'Troollibre', 9);
    resolveAllChoices(fight);
    const grid = fight.ctx.grid;
    const rng = new Rng(4);
    let n = 0;
    const seen = new Set<number>();
    for (let trial = 0; trial < 40; trial++) {
      const f = fight.clone({ keepLog: false });
      f.state.rollMode = 'average';
      f.state.critMode = 'never';
      const ms = f.getLivingMonsters();
      const m = ms[trial % ms.length]!;
      for (const p of f.getPlayers()) {
        if (!p.alive) continue;
        const cands = grid.walkableCells.filter((c) => distance(c, m.cell) >= 1 && distance(c, m.cell) <= 5 && !f.state.fighterAt(c) && !grid.isSpike(c));
        relocate(f, p, cands[rng.int(0, cands.length - 1)]!);
      }
      for (const slot of m.spells) {
        const cells = getCastableCells(f.state, m.id, slot.spellLevelId, { ignorePendingChoice: true });
        for (const cell of cells.slice(0, 12)) {
          const g = f.clone({ keepLog: false });
          const b = Board.fromState(g.state, { roll: 'average', critExpectation: false });
          b.setActor(m.id);
          const sp = g.ctx.getSpell(slot.spellLevelId);
          expect(boardCanCastSpell(b, sp) && boardCanCastOn(b, sp, cell), `${m.name} ${sp.name} → ${cell}`).toBe(true);
          const before = g.state.fighters.map((x) => [x.hp, x.cell]);
          boardCast(b, sp, cell);
          expect(g.state.fighters.map((x) => [x.hp, x.cell])).toEqual(before); // le plateau ne touche pas l'état
          expect(castSpell(g.state, m.id, slot.spellLevelId, cell).ok).toBe(true);
          for (const x of g.state.fighters) {
            if (x.team === 'scenario') continue;
            const label = `${m.name} ${sp.name} → ${cell} : ${x.name}`;
            expect(b.cell[x.id], label).toBe(x.alive ? x.cell : -1);
            expect(Math.abs(b.hp[x.id]! - (x.alive ? x.hp : 0)), label).toBeLessThanOrEqual(1);
          }
          n++;
          seen.add(sp.spellId);
        }
      }
    }
    expect(n).toBeGreaterThan(300);
    expect(seen.size).toBeGreaterThanOrEqual(12); // 3 + 2 + 4 sorts de Troolls, 4 de la Mama
  });

  it('marche : entrée dans les pics (−2 000, ×2) comme le moteur ; un monstre sorti des pics est Vulnérable', () => {
    const fight = newFight(QUIET, { seed: 3 });
    const t = untilMonsterTurn(fight, 'Troollibre', 1);
    const grid = fight.ctx.grid;
    const near = (c: number) => grid.walkableCells.find((x) => grid.isSpike(x) && distance(x, c) === 1 && !fight.state.fighterAt(x));
    const edge = grid.walkableCells.find((c) => !grid.isSpike(c) && !fight.state.fighterAt(c) && near(c) !== undefined)!;
    relocate(fight, t, edge);
    const spike = near(edge)!;
    const b = Board.fromState(fight.state);
    b.setActor(t.id);
    b.walk(t.id, [spike]);
    expect(b.hp[t.id]).toBe(t.hp - 2000);
    expect(b.aura[t.id]).toBe(200);
    expect(fight.move(t.id, [spike]).ok).toBe(true);
    expect(b.hp[t.id]).toBe(t.hp);
    b.walk(t.id, [edge]);
    expect(b.aura[t.id]).toBe(100);
    expect(b.exit[t.id]).toBe(200);
    expect(b.mp).toBe(t.mp - 1);
    expect(fight.move(t.id, [edge]).ok).toBe(true);
    expect(t.mp).toBe(b.mp);
    expect(t.hasState(5994)).toBe(true); // Vulnérable après la sortie
  });
});
