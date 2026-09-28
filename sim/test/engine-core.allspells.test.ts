/**
 * Robustesse : chacun des 369 niveaux de sort des données est résolu (sans validation) par des lanceurs variés sur
 * plusieurs cases ; aucune exception, et les invariants de l'état tiennent (occupation, PV, états, buffs, clone).
 */
import { describe, expect, it } from 'vitest';
import { castSpell, resolveSpell, type FightState } from '../src/engine/index.js';
import { CELL_COUNT } from '../src/geometry/index.js';
import { archetype, M, monster, scenarioEntity, SL, testFight } from './helpers/engineSetup.js';

function base(): FightState {
  const s = testFight({ rng: { rollMode: 'random', critMode: 'random', seed: 11 } });
  const sce = scenarioEntity(s);
  archetype(s, 'acrobate', 314);
  archetype(s, 'dompteur', 286);
  archetype(s, 'dompteur', 287);
  archetype(s, 'magicien', 315);
  monster(s, M.troollibre, 242);
  monster(s, M.troollibre, 358);
  monster(s, M.artroolleur, 232);
  monster(s, M.nitrooll, 372);
  monster(s, M.mama, 152);
  resolveSpell(s, sce, s.ctx.getSpell(SL.spikesGlyph), -1);
  return s;
}

function checkInvariants(s: FightState, label: string): void {
  const seen = new Map<number, number>();
  for (let c = 0; c < CELL_COUNT; c++) {
    const o = s.occupancy[c]!;
    if (o) {
      const f = s.fighters[o - 1]!;
      expect(f.alive && f.cell === c, `${label} : occupation ${c}`).toBe(true);
      seen.set(f.id, c);
    }
  }
  for (const f of s.fighters) {
    if (f.alive && f.cell >= 0) expect(seen.get(f.id), `${label} : ${f.name} absent de l'occupation`).toBe(f.cell);
    if (!f.alive) expect(f.hp, `${label} : PV d'un mort`).toBe(0);
    if (f.alive) {
      expect(f.hp > 0 && f.hp <= f.maxHp, `${label} : PV de ${f.name} (${f.hp}/${f.maxHp})`).toBe(true);
    }
    for (const b of f.buffs) expect(b.targetId, `${label} : porteur du buff`).toBe(f.id);
  }
  expect(s.triggerQueue.length, `${label} : file de déclenchements vide`).toBe(0);
  expect(s.castDepth).toBe(0);
}

describe('tous les niveaux de sort', () => {
  it('résolution sans exception et invariants de l’état (lanceurs joueur, monstre, scénario)', () => {
    const s0 = base();
    const ids = Object.keys(s0.ctx.data.spells).map(Number);
    expect(ids.length).toBe(369);
    let casts = 0;
    for (const id of ids) {
      for (const [casterId, cell] of [
        [1, 242],
        [1, 314],
        [5, 314],
        [0, -1],
        [0, 300],
      ] as const) {
        const s = s0.clone({ keepLog: false });
        const r = castSpell(s, casterId, id, cell, { ignoreConditions: true });
        expect(r.ok, `sort ${id}`).toBe(true);
        casts++;
        checkInvariants(s, `sort ${id} par ${casterId} sur ${cell}`);
        const c = s.clone();
        checkInvariants(c, `clone après ${id}`);
      }
    }
    expect(casts).toBe(369 * 5);
  });
});
