import { describe, expect, it } from 'vitest';
import { buildSituation } from '../../sim/src/runner/index.js';
import { executePlan, planPlayerTurn } from '../../sim/src/planner/index.js';
import { situationFromFight } from '../src/model/fromFight.js';
import {
  addMonster,
  addPlayer,
  applyComposition,
  compoOf,
  currentIndex,
  exportSituation,
  moveFighter,
  occupantAt,
  openingSituation,
  parseSituationText,
  removeFighter,
  reorderPlayer,
  toggleGift,
  toggleState,
} from '../src/model/situationEdit.js';
import { fightView } from '../src/model/view.js';
import t3 from '../../sim/examples/t3_dompteur_vulnerable.json';
import t8 from '../../sim/examples/t8_mama.json';
import type { Situation } from '../src/model/types.js';

describe('édition de situation (pure)', () => {
  it('ouverture de référence, composition, occupants', () => {
    const s = openingSituation();
    expect(compoOf(s)).toBe('ADDM');
    expect(occupantAt(s, 242)).toEqual({ kind: 'monster', index: 0 });
    expect(occupantAt(s, 314)).toEqual({ kind: 'player', index: 0 });
    expect(occupantAt(s, 300)).toBeNull();
  });

  it('déplacement, échange, cadeaux', () => {
    let s = openingSituation();
    s = moveFighter(s, { kind: 'player', index: 0 }, 300);
    expect(s.players[0]!.cell).toBe(300);
    s = moveFighter(s, { kind: 'player', index: 0 }, 242); // échange avec le Troollibre
    expect(s.players[0]!.cell).toBe(242);
    expect(s.monsters[0]!.cell).toBe(300);
    s = toggleGift(s, 299);
    expect(s.gifts).toEqual([299]);
    expect(toggleGift(s, 242)).toBe(s); // case occupée
    s = moveFighter(s, { kind: 'monster', index: 1 }, 299); // le cadeau est retiré de la case d'arrivée
    expect(s.gifts).toEqual([]);
    expect(openingSituation().players[0]!.cell).toBe(314); // immuable
  });

  it('ajout, retrait, ordre de jeu, composition', () => {
    let s = addMonster(openingSituation(), 'nitrooll', 200);
    expect(s.monsters).toHaveLength(3);
    expect(addMonster(s, 'nitrooll', 200)).toBe(s);
    s = removeFighter(s, { kind: 'monster', index: 0 });
    expect(s.monsters.map((m) => m.cell)).toEqual([358, 200]);
    s = { ...s, current: 'J2' };
    s = reorderPlayer(s, 1, -1);
    expect(compoOf(s)).toBe('DADM');
    expect(currentIndex(s)).toBe(0); // le courant suit son joueur
    s = removeFighter(s, { kind: 'player', index: 3 });
    expect(compoOf(s)).toBe('DAD');
    s = addPlayer(s, 'magicien');
    expect(s.players[3]!.cell).toBe(315);
    const c = applyComposition(openingSituation(), 'aadm');
    expect(compoOf(c)).toBe('AADM');
    expect(new Set(c.players.map((p) => p.cell)).size).toBe(4);
    expect(() => applyComposition(s, 'ADXM')).toThrow(/composition/);
    expect(toggleState(undefined, 'vulnerable', true)).toEqual(['vulnerable']);
    expect(toggleState(['vulnerable'], 'vulnerable', false)).toBeUndefined();
  });

  it('import / export', () => {
    const s = openingSituation();
    expect(parseSituationText(exportSituation(s))).toEqual(s);
    expect(parseSituationText(JSON.stringify({ situation: s }))).toEqual(s);
    expect(() => parseSituationText('{')).toThrow(/JSON illisible/);
    expect(() => parseSituationText('{"turn": 1, "monsters": []}')).toThrow(/players/);
  });
});

describe('conversion combat → situation', () => {
  it('aller-retour : la situation reconstruite donne le même état', () => {
    for (const sit of [t3 as Situation, t8 as Situation, openingSituation()]) {
      const a = buildSituation(sit).fight;
      const back = situationFromFight(a, { seed: sit.seed });
      const b = buildSituation(back).fight;
      const va = fightView(a);
      const vb = fightView(b);
      const key = (v: typeof va) =>
        v.fighters
          .filter((f) => f.alive)
          .map((f) => [f.kind, f.archetype ?? f.monsterType, f.cell, f.hp, f.maxHp, f.vulnerable, f.unshakable, f.inSpikes, f.spells.slice().sort().join('|')].join(':'))
          .sort();
      expect(key(vb)).toEqual(key(va));
      expect(vb.turn).toBe(va.turn);
      expect(vb.status.fighterId !== undefined).toBe(true);
      expect(vb.objective?.id).toBe(va.objective?.id);
      expect(vb.completed.map((o) => o.id)).toEqual(va.completed.map((o) => o.id));
      expect(vb.gifts).toEqual(va.gifts);
    }
  });

  it('Acclamations, états et PA restants sont décrits', () => {
    const { fight } = buildSituation(t3 as Situation);
    const s = situationFromFight(fight);
    expect(s.players[0]!.bonuses).toEqual({ range: 1 });
    expect(s.players[1]!.bonuses).toEqual({ ap: 1 });
    expect(s.current).toBe('J2');
    expect(s.monsters.find((m) => m.type === 'artroolleur')!.states).toEqual(['vulnerable']);
    // après une action, PA / PM restants du courant
    const plan = planPlayerTurn(fight, { mode: 'greedy', deterministic: true });
    const cast = plan.actions.findIndex((a) => a.type === 'cast');
    executePlan(fight, plan.actions.slice(0, cast + 1), { endTurn: false });
    const after = situationFromFight(fight);
    expect(after.players[1]!.ap).toBeLessThan(fight.state.fighters[fight.scenario.playerIds[1]!]!.maxAp);
  });

  it('vue : jetons, statut, ordre de jeu', () => {
    const { fight } = buildSituation(openingSituation());
    const v = fightView(fight);
    expect(v.status.kind).toBe('playerTurn');
    expect(v.fighters.filter((f) => f.kind === 'player').map((f) => f.short)).toEqual(['J1', 'J2', 'J3', 'J4']);
    expect(v.fighters.filter((f) => f.kind === 'monster').map((f) => f.short)).toEqual(['T1', 'T2']);
    const mama = v.fighters.find((f) => f.kind === 'mama')!;
    expect(mama.waiting).toBe(true);
    expect(mama.cell).toBe(152);
    expect(v.fighters.find((f) => f.current)!.short).toBe('J1');
    expect(v.objective?.id).toBe('empale');
  });
});
