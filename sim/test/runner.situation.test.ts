/**
 * Situations JSON (sim/src/runner/situation.ts, docs/FORMAT_SITUATION.md) : construction des exemples de
 * sim/examples, fidélité (cases, PV, états, grimoires, objectifs, ordre de jeu), validation, planification.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planPlayerTurn } from '../src/planner/index.js';
import { buildSituation, validateSituation, type Situation } from '../src/runner/index.js';

const EXAMPLES = resolve(__dirname, '../examples');
const load = (name: string): Situation => JSON.parse(readFileSync(resolve(EXAMPLES, name), 'utf8')) as Situation;

describe('situations JSON', () => {
  it('tous les exemples se construisent au tour du personnage courant', () => {
    const files = readdirSync(EXAMPLES).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const sit = load(f);
      expect(validateSituation(sit)).toEqual([]);
      const { fight, warnings } = buildSituation(sit);
      expect(warnings, f).toEqual([]);
      const st = fight.getStatus();
      expect(st.kind, f).toBe('playerTurn');
      expect(fight.turn, f).toBe(sit.turn);
      sit.players.forEach((p, i) => {
        const pf = fight.state.fighters[fight.scenario.playerIds[i]!]!;
        if (p.cell !== undefined) expect(pf.cell, `${f} ${pf.name}`).toBe(p.cell);
        if (p.hp !== undefined) expect(pf.hp, `${f} ${pf.name}`).toBe(p.hp);
      });
      const trolls = fight.getLivingMonsters().filter((m) => m.id !== fight.scenario.mamaId);
      expect(trolls.map((m) => m.cell).sort(), f).toEqual(
        sit.monsters.filter((m) => m.type !== 'mama' && !m.dead).map((m) => m.cell!).sort(),
      );
      expect(fight.scenario.completed.map((c) => c.objectiveId), f).toEqual(sit.objectives?.completed ?? []);
    }
  });

  it('T3 : états (Vulnérable dans les pics, sortie des pics), Acclamations, grimoires, ordre de jeu', () => {
    const { fight } = buildSituation(load('t3_dompteur_vulnerable.json'));
    const s = fight.state;
    const byName = (n: string) => s.fighters.find((f) => f.alive && f.name === n)!;
    expect(fight.getCurrentFighter()!.name).toBe('Dompteur 1');
    expect(byName('Dompteur 1').maxAp).toBe(9); // +1 PA
    expect(byName('Acrobate').range).toBe(1); // +1 PO
    expect(byName('Troollibre 1').hasState(5994)).toBe(true); // dans les pics (199)
    expect(byName('Troollibre 1').hp).toBe(15000);
    expect(byName('Artroolleur 1').hasState(5994)).toBe(true); // vulnérabilité de sortie demandée
    expect(byName('Nitrooll 1').hasState(5994)).toBe(false);
    // grimoire : 2 objectifs réalisés → sorts des paliers 1 et 2
    expect(byName('Magicien').spells.map((x) => x.spellLevelId)).toEqual([80499, 80514, 80515, 80516]);
    expect(fight.getActiveObjective()!.id).toBe('stop_projectiles');
    // alternance J1 M1 J2 M2… (Mama en tête)
    const names = fight.getTimeline().ids.map((id) => s.fighters[id]!.name);
    expect(names).toEqual(['Mama Troollette', 'Acrobate', 'Troollibre 1', 'Dompteur 1', 'Artroolleur 1', 'Dompteur 2', 'Nitrooll 1', 'Magicien']);
    // le planificateur frappe les cibles Vulnérables (ÉTUDE §10.2 n° 3)
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    expect(plan.summary.kills.length).toBeGreaterThanOrEqual(1);
    expect(plan.summary.targets.some((t) => t.name === 'Nitrooll 1' && t.damage > 0)).toBe(false);
  });

  it('T1 : ouverture de référence retrouvée par le planificateur (deux Troollibres dans les pics)', () => {
    const { fight } = buildSituation(load('t1_ouverture.json'));
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    expect(plan.summary.enteredSpikes.sort()).toEqual(['Troollibre 1', 'Troollibre 2']);
  });

  it('T8 : Mama arrivée, uniques et améliorations ; T7 : Mama en attente', () => {
    const t8 = buildSituation(load('t8_mama.json')).fight;
    const mama = t8.getMama()!;
    expect(mama.cell).toBe(301);
    expect(t8.state.fighters[t8.scenario.playerIds[0]!]!.knowsSpell(80766)).toBe(true); // Videur amélioré
    expect(t8.state.fighters[t8.scenario.playerIds[0]!]!.knowsSpell(80507)).toBe(false);
    expect(t8.state.fighters[t8.scenario.playerIds[1]!]!.knowsSpell(80839)).toBe(true); // Relâchement
    const t7 = buildSituation(load('t7_placement.json')).fight;
    expect(t7.getMama()!.cell).toBe(152);
    expect(t7.getCurrentFighter()!.name).toBe('Magicien');
  });

  it('validation : erreurs en français', () => {
    expect(validateSituation({})).not.toEqual([]);
    const bad = validateSituation({
      turn: 0,
      players: [{ archetype: 'sacrieur' }],
      monsters: [{ type: 'troollibre', cell: 199 }, { type: 'nitrooll', cell: 199 }],
    });
    expect(bad.join('\n')).toMatch(/turn/);
    expect(bad.join('\n')).toMatch(/archetype/);
    expect(bad.join('\n')).toMatch(/199/);
    expect(() => buildSituation({ turn: 1, players: [{ archetype: 'acrobate' }], monsters: [], current: 'J3' })).toThrow(/courant/);
  });
});
