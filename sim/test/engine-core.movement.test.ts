/** Déplacements : poussées (blocages d'état, diagonales), attirance, avance, téléportation, échange, marche, crochets. */
import { describe, expect, it } from 'vitest';
import {
  addBuff,
  Buff,
  castSpell,
  moveAlongPath,
  moveTo,
  resolveSpell,
  type CellMoveCause,
  type EngineHooks,
  type Fighter,
  type FightState,
} from '../src/engine/index.js';
import { areAdjacent, cellInDirection, distance, inDiagonal, inLine } from '../src/geometry/index.js';
import { archetype, cellInDirectionOrThrow, M, monster, SL, testFight } from './helpers/engineSetup.js';

function giveState(s: FightState, f: Fighter, stateId: number): void {
  const b = new Buff();
  b.kind = 'state';
  b.stateId = stateId;
  b.casterId = f.id;
  b.duration = -1;
  addBuff(s, f, b);
}

function recorder() {
  const calls: string[] = [];
  const hooks: EngineHooks = {
    onLeaveCell: (_s, f, cell, cause: CellMoveCause) => void calls.push(`leave ${f.id} ${cell} ${cause.kind}`),
    onEnterCell: (_s, f, cell, from, cause: CellMoveCause) =>
      void calls.push(`enter ${f.id} ${from}->${cell} ${cause.kind}${cause.final ? '' : ' (pas)'}`),
  };
  return { calls, hooks };
}

describe('poussée', () => {
  it('Inébranlable (157, effet d’état 0) et Enraciné (effet 3) bloquent ; les dégâts s’appliquent quand même', () => {
    for (const stateId of [157, 5971]) {
      const s = testFight();
      const acro = archetype(s, 'acrobate', 300);
      const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
      giveState(s, t, stateId);
      const before = t.cell;
      castSpell(s, acro.id, SL.frappe, t.cell);
      expect(t.cell).toBe(before);
      expect(t.hp).toBe(25000 - 976);
      expect(s.log!.ofType('moveBlocked')).toHaveLength(1);
    }
  });

  it('Patroolleur (lancé par le Troollibre) le rend Inébranlable', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    expect(castSpell(s, t.id, 80485, t.cell).ok).toBe(true);
    expect(t.hasState(157) && t.unshakable && !t.canBePushed).toBe(true);
    castSpell(s, acro.id, SL.frappe, t.cell);
    expect(t.cell).toBe(cellInDirectionOrThrow(300, 1, 2));
  });

  it('poussée diagonale : ceil(n / 2) pas diagonaux', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 0, 1));
    expect(inDiagonal(300, t.cell)).toBe(true);
    castSpell(s, acro.id, SL.frappe, t.cell);
    expect(t.cell).toBe(cellInDirectionOrThrow(300, 0, 2));
  });

  it('crochets : départ puis arrivée sur la seule case finale', () => {
    const { calls, hooks } = recorder();
    const s = testFight({}, hooks);
    const acro = archetype(s, 'acrobate', 300);
    const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 2));
    const from = t.cell;
    castSpell(s, acro.id, SL.frappe, t.cell);
    expect(calls).toEqual([`leave ${t.id} ${from} push`, `enter ${t.id} ${from}->${t.cell} push`]);
  });
});

describe('attirance, avance, téléportation, échange', () => {
  it('Aspiratrooll attire le joueur de 2 cases vers le Troollibre (sans collision)', () => {
    const s = testFight();
    const tr = monster(s, M.troollibre, 300);
    const p = archetype(s, 'magicien', cellInDirectionOrThrow(300, 3, 2));
    castSpell(s, tr.id, SL.aspiratrooll, p.cell);
    expect(areAdjacent(tr.cell, p.cell)).toBe(true);
    expect(s.log!.ofType('damage').filter((e) => e.collision)).toHaveLength(0);
  });

  it('Hanedimane : les ennemis de la fourche sont repoussés, les alliés attirés', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    const x = cellInDirectionOrThrow(300, 1, 1);
    const fork = s.ctx.getSpell(SL.hanedimane).effects[0]!.zone;
    const side = fork
      .containedCells(x, 300)
      .filter((c) => s.ctx.grid.isWalkable(c) && !inLine(300, c) && distance(300, c) >= 3)
      .sort((a, b) => distance(300, b) - distance(300, a))[0]!;
    const enemy = monster(s, M.troollibre, cellInDirectionOrThrow(x, 1, 1));
    const ally = archetype(s, 'dompteur', side);
    const d0e = distance(300, enemy.cell);
    const d0a = distance(300, ally.cell);
    castSpell(s, acro.id, SL.hanedimane, x);
    expect(distance(300, enemy.cell)).toBeGreaterThan(d0e);
    expect(distance(300, ally.cell)).toBeLessThan(d0a);
  });

  it('Va-t-en-guerre : le lanceur avance de 2 vers la cible ; bloqué s’il est Inébranlable (configurable)', () => {
    for (const [blocks, unshakable, expectMove] of [
      [true, false, true],
      [true, true, false],
      [false, true, true],
    ] as const) {
      const s = testFight({ engine: { unshakableBlocksCasterAdvance: blocks } });
      const acro = archetype(s, 'acrobate', 300);
      const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 7, 5));
      if (unshakable) giveState(s, acro, 157);
      castSpell(s, acro.id, SL.vaTenGuerre, t.cell);
      expect(acro.cell).toBe(expectMove ? cellInDirectionOrThrow(300, 7, 2) : 300);
    }
  });

  it('Aïronemane : téléportation sur la case ciblée puis poussée des voisins depuis cette case', () => {
    const { calls, hooks } = recorder();
    const s = testFight({}, hooks);
    const acro = archetype(s, 'acrobate', 300);
    const dest = cellInDirectionOrThrow(300, 1, 3);
    const n = monster(s, M.troollibre, cellInDirectionOrThrow(dest, 7, 1));
    const n0 = n.cell;
    expect(castSpell(s, acro.id, SL.aironemane, dest).ok).toBe(true);
    expect(acro.cell).toBe(dest);
    expect(n.cell).toBe(cellInDirectionOrThrow(n0, 7, 2));
    expect(calls[0]).toBe(`leave ${acro.id} 300 teleport`);
    expect(calls[1]).toBe(`enter ${acro.id} 300->${dest} teleport`);
  });

  it('Voltige : échange de positions ; impossible sous Pesanteur (effet d’état 18) ; Inébranlable ne l’empêche pas', () => {
    for (const [stateId, swaps] of [
      [0, true],
      [7, false],
      [157, true],
    ] as const) {
      const { calls, hooks } = recorder();
      const s = testFight({}, hooks);
      const acro = archetype(s, 'acrobate', 300);
      const t = monster(s, M.troollibre, cellInDirectionOrThrow(300, 1, 3));
      const tc = t.cell;
      if (stateId) giveState(s, t, stateId);
      castSpell(s, acro.id, SL.voltige, tc);
      expect([acro.cell, t.cell]).toEqual(swaps ? [tc, 300] : [300, tc]);
      if (swaps) {
        expect(calls).toEqual([
          `leave ${acro.id} 300 swap`,
          `leave ${t.id} ${tc} swap`,
          `enter ${acro.id} 300->${tc} swap`,
          `enter ${t.id} ${tc}->300 swap`,
        ]);
      }
    }
  });
});

describe('marche volontaire', () => {
  it('1 PM par pas, crochets à chaque pas, erreurs lisibles', () => {
    const { calls, hooks } = recorder();
    const s = testFight({}, hooks);
    const acro = archetype(s, 'acrobate', 300);
    acro.restoreApMp();
    const p1 = cellInDirectionOrThrow(300, 1, 1);
    const p2 = cellInDirectionOrThrow(300, 1, 2);
    const r = moveAlongPath(s, acro.id, [p1, p2]);
    expect(r).toMatchObject({ ok: true, steps: 2, cell: p2, interrupted: false });
    expect(acro.mp).toBe(2);
    expect(calls).toEqual([
      `leave ${acro.id} 300 walk`,
      `enter ${acro.id} 300->${p1} walk (pas)`,
      `leave ${acro.id} ${p1} walk`,
      `enter ${acro.id} ${p1}->${p2} walk`,
    ]);
    expect(moveAlongPath(s, acro.id, [cellInDirectionOrThrow(p2, 1, 2)]).code).toBe('INVALID_PATH');
    expect(moveAlongPath(s, acro.id, [1, 2, 3]).code).toBe('NOT_ENOUGH_MP');
    monster(s, M.troollibre, cellInDirectionOrThrow(p2, 1, 1));
    expect(moveAlongPath(s, acro.id, [cellInDirectionOrThrow(p2, 1, 1)]).code).toBe('CELL_OCCUPIED');
    expect(s.describeLog().some((m) => m === `Acrobate se déplace : 300 → ${p2}.`)).toBe(true);
  });

  it('interruption par un crochet ; moveTo suit le plus court chemin', () => {
    const stopAt = cellInDirectionOrThrow(300, 7, 1);
    const s = testFight(
      {},
      {
        onEnterCell: (_s, _f, cell) => cell === stopAt,
      },
    );
    const acro = archetype(s, 'acrobate', 300);
    const r = moveAlongPath(s, acro.id, [stopAt, cellInDirectionOrThrow(300, 7, 2)]);
    expect(r).toMatchObject({ ok: true, steps: 1, cell: stopAt, interrupted: true });
    const goal = cellInDirectionOrThrow(stopAt, 1, 2);
    const r2 = moveTo(s, acro.id, goal);
    expect(r2.ok && acro.cell === goal && r2.steps === 2).toBe(true);
  });

  it('tacle optionnel (désactivé par défaut) : quitter le contact d’un Trooll coûte la moitié des PM', () => {
    const s = testFight();
    const acro = archetype(s, 'acrobate', 300);
    monster(s, M.troollibre, cellInDirectionOrThrow(300, 5, 1));
    const away = [cellInDirectionOrThrow(300, 1, 1)];
    const c1 = s.clone();
    expect(moveAlongPath(c1, acro.id, away).ok).toBe(true);
    expect(c1.fighter(acro.id).mp).toBe(3);
    const c2 = s.clone();
    moveAlongPath(c2, acro.id, away, { tackle: true });
    expect(c2.fighter(acro.id).mp).toBe(1);
    expect(c2.fighter(acro.id).ap).toBe(4);
  });

  it('résolution avec positions figées : un monstre poussé hors de la zone par l’effet 1 subit l’effet 2 (Troollpoline)', () => {
    const s = testFight();
    const tr = monster(s, M.troollibre, 300);
    const players = [1, 3, 5, 7].map((d) => archetype(s, 'dompteur', cellInDirection(300, d, 1)));
    resolveSpell(s, tr, s.ctx.getSpell(SL.troollpoline), 300);
    for (const p of players) expect(p.hp).toBe(30000 - Math.trunc((100 * 41 * 100) / 100));
  });
});
