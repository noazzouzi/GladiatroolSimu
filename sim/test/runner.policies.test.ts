/**
 * Politiques de choix (sim/src/planner/policies.ts) : Acclamations (évaluées et ordres fixes), cartes de cadeau
 * (priorités corrigées par la situation), votes (faisabilité, liste fixe), archétype.
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig, type ObjectiveId } from '../src/data/index.js';
import { killFighter, finishAction } from '../src/engine/index.js';
import {
  acclamationValue,
  createChoicePolicy,
  objectiveFeasibility,
  scoreChoice,
  turnPotential,
} from '../src/planner/index.js';
import { createGladiatroolFight, flushScenario, type ChoiceOption, type GladiatroolFight, type ScenarioChoice } from '../src/scenario/index.js';

function newFight(overrides = {}): GladiatroolFight {
  return createGladiatroolFight(gameData, loadConfig(overrides), {
    players: [{ archetype: 'acrobate' }, { archetype: 'dompteur' }, { archetype: 'dompteur' }, { archetype: 'magicien' }],
    seed: 3,
  });
}

function choice(fighterId: number, options: ChoiceOption[], listId = 17): ScenarioChoice {
  return { uid: 1, scope: fighterId >= 0 ? 'individual' : 'global', choiceListId: listId, fighterId, casterId: -1, spellLevelId: 0, castId: 0, turn: 1, options };
}

function acclamations(fight: GladiatroolFight, id: number, stats: string[]): ChoiceOption[] {
  const f = fight.state.fighters[id]!;
  return stats.map((stat) => {
    const card = f.archetypeData!.acclamations.find((c) => c.stat === stat)!;
    return { kind: 'acclamation', cardSpellLevelId: card.choiceSpellLevelId, realSpellLevelId: card.realSpellLevel, stat, value: card.value, label: card.name };
  });
}

function objectives(ids: ObjectiveId[]): ChoiceOption[] {
  return ids.map((objectiveId) => ({ kind: 'objective', objectiveId, tier: 0, orientation: '', label: objectiveId }));
}

describe('politiques : Acclamations', () => {
  it('ordres fixes PO_first / PA_first / DF_first (ÉTUDE §10.6)', () => {
    const fight = newFight();
    const dompteur = fight.scenario.playerIds[1]!;
    const opts = acclamations(fight, dompteur, ['finalDamagePct', 'ap', 'range']);
    const c = choice(dompteur, opts);
    const pick = (acclamation: 'PO_first' | 'PA_first' | 'DF_first') => opts[createChoicePolicy({ acclamation })(c, fight) as number]!;
    expect((pick('PO_first') as { stat: string }).stat).toBe('range');
    expect((pick('PA_first') as { stat: string }).stat).toBe('ap');
    expect((pick('DF_first') as { stat: string }).stat).toBe('finalDamagePct');
  });

  it('choix évalué : valeurs marginales cohérentes, raison en français', () => {
    const fight = newFight();
    const [acro, dom, , mag] = fight.scenario.playerIds as number[];
    const s = fight.state;
    const pot8 = turnPotential(s, s.fighters[dom!]!, 8);
    const pot12 = turnPotential(s, s.fighters[dom!]!, 12);
    expect(pot8.value).toBeGreaterThan(0);
    expect(pot12.value).toBeGreaterThanOrEqual(pot8.value);
    // Dompteur : +10 % DF = 10 % de ses dégâts par tour
    const df = acclamationValue(s, s.fighters[dom!]!, 'finalDamagePct', 10);
    expect(df.value).toBeCloseTo(pot8.damage * 0.1, 3);
    expect(df.reason).toMatch(/DF/);
    // Acrobate : la PO vaut plus que pour le Magicien (placement, Videur 1-5)
    const poA = acclamationValue(s, s.fighters[acro!]!, 'range', 1).value / turnPotential(s, s.fighters[acro!]!, 8).value;
    const poM = acclamationValue(s, s.fighters[mag!]!, 'range', 1).value / turnPotential(s, s.fighters[mag!]!, 8).value;
    expect(poA).toBeGreaterThan(poM);
    const scored = scoreChoice(choice(dom!, acclamations(fight, dom!, ['critDamage', 'finalDamagePct', 'mp'])), fight, { acclamation: 'planner' });
    expect(scored).toHaveLength(3);
    const best = scored.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.label).toBe('Acclamation puissante');
    for (const x of scored) expect(x.reason.length).toBeGreaterThan(3);
  });
});

describe('politiques : votes', () => {
  it('faisabilité : Stop aux projectiles et Distance d’insécurité automatiques sans Artroolleur ; Productivité', () => {
    const fight = newFight();
    expect(objectiveFeasibility(fight, 'stop_projectiles').score).toBe(1);
    expect(objectiveFeasibility(fight, 'distance_insecurite').score).toBe(1);
    // T1 sans Regain : pas 3 sorts ; après Empalé (Regain Vigoureux appris), le Magicien lance 3 sorts
    expect(objectiveFeasibility(fight, 'productivite').score).toBeLessThan(0.5);
    fight.debugCompleteObjective();
    expect(objectiveFeasibility(fight, 'productivite').score).toBeGreaterThan(0.9);
    expect(objectiveFeasibility(fight, 'productivite').reason).toMatch(/3 sorts|[4-9] sorts/);
    expect(objectiveFeasibility(fight, 'soleil').score).toBeLessThan(0.5);
    // Solitude : impossible si la Mama est morte
    const mama = fight.state.fighters[fight.scenario.mamaId]!;
    killFighter(fight.state, mama, -1, 'other');
    finishAction(fight.state);
    flushScenario(fight.state);
    expect(objectiveFeasibility(fight, 'solitude').score).toBe(0);
    expect(objectiveFeasibility(fight, 'meme_pas_mal').score).toBe(0);
  });

  it('planner : préférence × faisabilité ; fixed : liste de la configuration ; raisons', () => {
    const fight = newFight();
    const c = choice(-1, objectives(['soleil', 'productivite']), 12);
    expect(createChoicePolicy({ vote: 'planner' })(c, fight)).toBe(1);
    const c2 = choice(-1, objectives(['toi_par_ici', 'stop_projectiles']), 13);
    expect(createChoicePolicy({ vote: 'planner' })(c2, fight)).toBe(1);
    // fixed : l'ordre de la configuration (surchargeable)
    expect(createChoicePolicy({ vote: 'fixed' })(c, fight)).toBe(1);
    expect(createChoicePolicy({ vote: 'fixed', fixedVoteOrder: ['soleil'] })(c, fight)).toBe(0);
    const f2 = createGladiatroolFight(gameData, loadConfig({ objectives: { votePolicy: 'fixed', fixedVoteOrder: ['soleil', 'productivite'] } }), { seed: 1 });
    expect(createChoicePolicy()(c, f2)).toBe(0);
    const scored = scoreChoice(c, fight);
    expect(scored[1]!.reason).toMatch(/faisabilité/);
  });
});

describe('politiques : cadeaux et archétype', () => {
  it('Relâchement de Fureur tôt, Ultime Espoir si un allié est mort, Démotivation inutile sans Mama', () => {
    const fight = newFight();
    const dom = fight.scenario.playerIds[1]!;
    const u = (id: number): ChoiceOption => ({ kind: 'unique', spellLevelId: id, label: String(id) });
    const c = choice(dom, [u(80827), u(80839)], 10);
    expect(createChoicePolicy()(c, fight)).toBe(1); // Relâchement (T1) > Galvanisation
    const mag = fight.scenario.playerIds[3]!;
    const cm = choice(mag, [u(80850), u(80851)], 10);
    const before = scoreChoice(cm, fight)[1]!.score;
    const acro = fight.state.fighters[fight.scenario.playerIds[0]!]!;
    killFighter(fight.state, acro, -1, 'other');
    finishAction(fight.state);
    flushScenario(fight.state);
    const after = scoreChoice(cm, fight)[1]!.score;
    expect(after).toBeGreaterThan(before);
    expect(scoreChoice(cm, fight)[1]!.reason).toMatch(/mort/);
    // amélioration : priorités ÉTUDE §8.3 (Videur > Aïronemane)
    const up = (base: number): ChoiceOption => ({ kind: 'upgrade', baseSpellLevelId: base, upgradedSpellLevelId: 0, cardSpellLevelId: 0, label: String(base) });
    expect(createChoicePolicy()(choice(acro.id, [up(80522), up(80507)], 10), fight)).toBe(1);
    expect(createChoicePolicy({ gift: 'preference' })(choice(acro.id, [up(80522), up(80507)], 10), fight)).toBe(1);
  });

  it('archétype : celui de la mise en place', () => {
    const fight = newFight();
    const dom = fight.scenario.playerIds[1]!;
    const opts: ChoiceOption[] = (['acrobate', 'dompteur', 'magicien'] as const).map((a) => ({ kind: 'archetype', archetype: a, passiveSpellLevelId: 0, label: a }));
    expect(createChoicePolicy()(choice(dom, opts, 16), fight)).toBe(1);
  });
});
