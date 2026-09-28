/**
 * Scénario — vagues (ETUDE §2.3, Q5) et ordre de jeu (ETUDE §2.4, Q1) : compositions des 10 vagues, tours
 * d'apparition, cases tirées (modes de ``spawn.mode``), timeline recalculée à chaque tour global.
 */
import { describe, expect, it } from 'vitest';
import { gameData, type ConfigOverrides } from '../src/data/index.js';
import type { GladiatroolFight } from '../src/scenario/index.js';
import { advanceUntil, checkInvariants, DET, kill, newFight, troolls, untilPlayerTurn } from './helpers/scenarioSetup.js';

const spikes = new Set(gameData.map.spikes.cells);

/** Joue (joueurs et monstres passifs) jusqu'au tour de J1 au tour ``turn``. */
function toTurn(fight: GladiatroolFight, turn: number): void {
  untilPlayerTurn(fight, turn, 0);
}

function composition(ids: readonly number[], fight: GladiatroolFight): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of ids) {
    const m = fight.state.fighters[id]!.monsterId;
    out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

describe('vagues : compositions et moments d’apparition', () => {
  it('10 vagues : V1 à la mise en place, V2–V7 aux T2–T7, pas d’apparition au T8 (Mama), V9 au T9, V10 au T10', () => {
    const fight = newFight(DET, { seed: 5 });
    advanceUntil(fight, (f) => f.turn === 10 && f.isPlayerTurn());
    const recs = fight.scenario.waves;
    expect(recs.map((r) => [r.wave, r.turn])).toEqual([
      [1, 0],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
      [7, 7],
      [9, 9],
      [10, 10],
    ]);
    for (const r of recs) {
      const w = gameData.scenario.waves.find((x) => x.n === r.wave)!;
      const expected: Record<number, number> = {};
      for (const c of w.composition) expected[c.monsterId] = (expected[c.monsterId] ?? 0) + c.count;
      expect(composition(r.fighterIds, fight), `V${r.wave}`).toEqual(expected);
      for (const c of r.cells) {
        expect(gameData.map.playable.includes(c), `V${r.wave} case ${c}`).toBe(true);
        expect(spikes.has(c), `V${r.wave} case ${c} dans les pics`).toBe(false);
      }
    }
    // 31 Troolls + la Mama (832 000 PV)
    const all = recs.flatMap((r) => r.fighterIds);
    expect(all).toHaveLength(31);
    const hp = all.reduce((s, id) => s + fight.state.fighters[id]!.maxHp, 0) + fight.getMama()!.maxHp;
    expect(hp).toBe(832000);
    checkInvariants(fight);
  });

  it('cases tirées parmi les candidats de la vague et du type (weighted_observed) quand ils sont libres', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const fight = newFight(DET, { seed });
      // on vide la carte à chaque tour pour que les candidats restent libres
      for (let t = 2; t <= 10; t++) {
        advanceUntil(fight, (f) => f.turn === t && f.isPlayerTurn());
        const w = gameData.scenario.waves.find((x) => x.turn === t && !x.boss);
        const r = fight.scenario.waves.find((x) => x.turn === t);
        if (w && r) {
          r.fighterIds.forEach((id, i) => {
            const m = fight.state.fighters[id]!.monsterId;
            const cands = [
              ...(w.spawn!.candidatesByType[String(m)] ?? []).map((x) => x.cell),
              ...(w.spawn!.groups ?? []).filter((g) => g.monsterId === m).flatMap((g) => g.candidates.map((x) => x.cell)),
            ];
            expect(cands, `graine ${seed}, V${w.n}, ${m}`).toContain(r.cells[i]);
          });
        }
        kill(fight, troolls(fight));
      }
    }
  });

  it('V2 : un Artroolleur dans {187, 188}, un dans {411, 412} (groupes structurés), le Troollibre dans {242, 358, 246}', () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const fight = newFight(DET, { seed });
      kill(fight, troolls(fight));
      advanceUntil(fight, (f) => f.turn === 2 && f.isPlayerTurn());
      const r = fight.scenario.waves[1]!;
      const byType = r.fighterIds.map((id, i) => [fight.state.fighters[id]!.monsterId, r.cells[i]!] as const);
      const art = byType.filter(([m]) => m === 7982).map(([, c]) => c);
      expect(art.filter((c) => c === 187 || c === 188)).toHaveLength(1);
      expect(art.filter((c) => c === 411 || c === 412)).toHaveLength(1);
      const tl = byType.find(([m]) => m === 7981)![1];
      expect([242, 358, 246]).toContain(tl);
      for (const c of r.cells) seen.add(c);
    }
    // les deux cases de chaque coin sont tirées sur 30 graines
    for (const c of [187, 188, 411, 412]) expect(seen.has(c)).toBe(true);
  });

  it('spawn.mode most_frequent (déterministe) : V2 = Troollibre sur 246 (242 et 358 occupées par V1), Artroolleurs sur 188 et 412', () => {
    const fight = newFight({ ...DET, spawn: { mode: 'most_frequent' } });
    advanceUntil(fight, (f) => f.turn === 2 && f.isPlayerTurn());
    const r = fight.scenario.waves[1]!;
    expect(r.fighterIds.map((id) => fight.state.fighters[id]!.monsterId)).toEqual([7981, 7982, 7982]);
    expect(r.cells).toEqual([246, 188, 412]);
  });

  it('spawn.mode structured_slots et uniform_slots : cases dans les emplacements du type', () => {
    for (const mode of ['structured_slots', 'uniform_slots'] as const) {
      const fight = newFight({ ...DET, spawn: { mode } }, { seed: 9 });
      advanceUntil(fight, (f) => f.turn === 4 && f.isPlayerTurn());
      const w4 = gameData.scenario.waves[3]!;
      const r = fight.scenario.waves.find((x) => x.wave === 4)!;
      r.fighterIds.forEach((id, i) => {
        const m = String(fight.state.fighters[id]!.monsterId);
        const pool = mode === 'structured_slots' ? w4.spawn!.slotsByType[m]! : w4.spawn!.candidatesByType[m]!.map((x) => x.cell);
        const c = r.cells[i]!;
        // case du type, ou repli (case libre la plus proche) si toutes sont prises
        expect(pool.includes(c) || !spikes.has(c)).toBe(true);
      });
    }
  });

  it('mêmes graines → mêmes cases, quelles que soient les actions des joueurs (tirages dérivés)', () => {
    const a = newFight(DET, { seed: 11 });
    const b = newFight(DET, { seed: 11 });
    // dans b, J1 se déplace (hors des cases candidates) au T1
    expect(b.playerMove(313).ok).toBe(true);
    advanceUntil(a, (f) => f.turn === 3 && f.isPlayerTurn());
    advanceUntil(b, (f) => f.turn === 3 && f.isPlayerTurn());
    expect(b.scenario.waves.map((w) => w.cells)).toEqual(a.scenario.waves.map((w) => w.cells));
    const c = newFight(DET, { seed: 12 });
    advanceUntil(c, (f) => f.turn === 3 && f.isPlayerTurn());
    expect(c.scenario.waves.slice(1).map((w) => w.cells)).not.toEqual(a.scenario.waves.slice(1).map((w) => w.cells));
  });
});

describe('timeline (Q1)', () => {
  function tlAtTurn2(over: ConfigOverrides, prepare?: (f: GladiatroolFight) => void): { fight: GladiatroolFight; ids: number[] } {
    const fight = newFight({ ...DET, ...over });
    prepare?.(fight);
    advanceUntil(fight, (f) => f.turn === 2 && f.isPlayerTurn());
    return { fight, ids: fight.getTimeline().ids.slice() };
  }

  it('défaut (alternate_spawn_order, append) : Mama, J1, M1, J2, M2, J3, M3, J4, M4, M5', () => {
    const { fight, ids } = tlAtTurn2({});
    const [j1, j2, j3, j4] = fight.scenario.playerIds;
    const [m1, m2] = fight.scenario.waves[0]!.fighterIds;
    const [m3, m4, m5] = fight.scenario.waves[1]!.fighterIds;
    expect(ids).toEqual([fight.scenario.mamaId, j1, m1, j2, m2, j3, m3, j4, m4, m5]);
  });

  it('un monstre mort libère sa place ; un joueur mort garde la sienne (timeline.deadPlayersKeepSlot)', () => {
    const { fight, ids } = tlAtTurn2({}, (f) => kill(f, [f.state.fighters[f.scenario.waves[0]!.fighterIds[0]!]!, f.getPlayers()[1]!]));
    const [j1, j2, j3, j4] = fight.scenario.playerIds;
    const m2 = fight.scenario.waves[0]!.fighterIds[1]!;
    const [m3, m4, m5] = fight.scenario.waves[1]!.fighterIds;
    expect(ids).toEqual([fight.scenario.mamaId, j1, m2, j2, m3, j3, m4, j4, m5]);
    const other = tlAtTurn2({ timeline: { deadPlayersKeepSlot: false } }, (f) => kill(f, [f.getPlayers()[1]!]));
    const p = other.fight.scenario.playerIds;
    const [n1, n2] = other.fight.scenario.waves[0]!.fighterIds;
    const [n3, n4, n5] = other.fight.scenario.waves[1]!.fighterIds;
    expect(other.ids).toEqual([other.fight.scenario.mamaId, p[0], n1, p[2], n2, p[3], n3, n4, n5]);
  });

  it('monsters_after_mama ; alternate_initiative (Force : Troollibre > Nitrooll > Artroolleur) ; insertion after_mama / by_initiative', () => {
    const a = tlAtTurn2({ timeline: { model: 'monsters_after_mama' } });
    const ps = a.fight.scenario.playerIds;
    const mons = [...a.fight.scenario.waves[0]!.fighterIds, ...a.fight.scenario.waves[1]!.fighterIds];
    expect(a.ids).toEqual([a.fight.scenario.mamaId, ...mons, ...ps]);

    const b = newFight({ ...DET, timeline: { model: 'alternate_initiative' } });
    advanceUntil(b, (f) => f.turn === 3 && f.isPlayerTurn());
    const forces = b.getTimeline().ids
      .map((id) => b.state.fighters[id]!)
      .filter((f) => f.team === 'monsters' && f.id !== b.scenario.mamaId)
      .map((f) => f.monsterId);
    const rank: Record<number, number> = { 7981: 0, 7983: 1, 7982: 2 };
    expect(forces.map((m) => rank[m])).toEqual([...forces.map((m) => rank[m]!)].sort((x, y) => x - y));

    const c = tlAtTurn2({ timeline: { newMonstersInsertion: 'after_mama' } });
    const [c1, c2] = c.fight.scenario.waves[0]!.fighterIds;
    const [c3, c4, c5] = c.fight.scenario.waves[1]!.fighterIds;
    const cp = c.fight.scenario.playerIds;
    expect(c.ids).toEqual([c.fight.scenario.mamaId, cp[0], c3, cp[1], c4, cp[2], c5, cp[3], c1, c2]);

    const d = tlAtTurn2({ timeline: { newMonstersInsertion: 'by_initiative' } });
    const dm = d.ids.map((id) => d.fight.state.fighters[id]!).filter((f) => f.team === 'monsters' && f.id !== d.fight.scenario.mamaId);
    // V2 : le Troollibre (4 000) s'insère avec ceux de V1, les Artroolleurs (3 000) après
    expect(dm.map((f) => f.monsterId)).toEqual([7981, 7981, 7981, 7982, 7982]);
  });

  it('explicit : ordre fourni par FightOptions.timelineOrder', () => {
    const fight = newFight({ ...DET, timeline: { model: 'explicit' } }, {
      options: { timelineOrder: ({ mamaId, playerIds, monsterIds }) => [mamaId, ...monsterIds, ...[...playerIds].reverse()] },
    });
    const ps = fight.scenario.playerIds;
    const ms = fight.scenario.waves[0]!.fighterIds;
    expect(fight.getTimeline().ids).toEqual([fight.scenario.mamaId, ...ms, ps[3], ps[2], ps[1], ps[0]]);
    expect(fight.getStatus()).toEqual({ kind: 'monsterTurn', fighterId: ms[0] });
  });
});
