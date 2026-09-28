/**
 * Scénario — fenêtres de choix (ETUDE §2.7, §4.5, §8 ; Q13, Q14) : Acclamations aux T2–T9, cadeaux (apparition,
 * déclenchement, cartes, application : unique ou amélioration).
 */
import { describe, expect, it } from 'vitest';
import { STAT_KEY_INDEX, type PendingChoice } from '../src/engine/index.js';
import { fillPendingChoices, giftCells, type ChoiceOption, type GladiatroolFight } from '../src/scenario/index.js';
import { advanceUntil, DET, newFight, untilPlayerTurn } from './helpers/scenarioSetup.js';

/** Ajoute un choix synthétique (liste 10) avec ses options, pour tester l'application d'une carte. */
function pushChoice(fight: GladiatroolFight, fighterId: number, options: ChoiceOption[]): PendingChoice {
  const c: PendingChoice = {
    uid: fight.state.newUid(),
    scope: 'individual',
    choiceListId: 10,
    fighterId,
    casterId: fight.scenario.sceId,
    spellLevelId: 0,
    castId: 0,
    turn: fight.turn,
    options,
  };
  fight.state.pendingChoices.push(c);
  return c;
}

describe('Acclamations (choix 17)', () => {
  it('une fenêtre par joueur vivant au début des tours T2 à T9 (pas au T1 ni au T10) : 3 cartes distinctes de son archétype', () => {
    const fight = newFight({ ...DET, gifts: { spawnProbability: 0 } });
    const byTurn = new Map<number, number>();
    advanceUntil(
      fight,
      (f) => f.turn === 10 && f.isPlayerTurn(),
      (c, f) => {
        if (c.choiceListId === 17) {
          byTurn.set(f.turn, (byTurn.get(f.turn) ?? 0) + 1);
          const p = f.state.fighters[c.fighterId]!;
          const cards = p.archetypeData!.acclamations.map((a) => a.choiceSpellLevelId);
          expect(c.options).toHaveLength(3);
          const ids = c.options.map((o) => (o.kind === 'acclamation' ? o.cardSpellLevelId : -1));
          expect(new Set(ids).size).toBe(3);
          for (const id of ids) expect(cards).toContain(id);
        }
        return 0;
      },
    );
    expect([...byTurn.entries()]).toEqual([2, 3, 4, 5, 6, 7, 8, 9].map((t) => [t, 4]));
  });

  it('application : bonus permanent de la carte (accumulateur) ; bonuses.doubleApplication : deux fois', () => {
    for (const double of [false, true]) {
      const fight = newFight({ ...DET, gifts: { spawnProbability: 0 }, bonuses: { doubleApplication: double } });
      advanceUntil(fight, (f) => f.turn === 2 && f.getPendingChoices().length === 4);
      for (const c of fight.getPendingChoices()) {
        const p = fight.state.fighters[c.fighterId]!;
        const o = c.options[0]!;
        if (o.kind !== 'acclamation') throw new Error('carte attendue');
        const idx = STAT_KEY_INDEX[o.stat as keyof typeof STAT_KEY_INDEX];
        const before = p.stat(idx);
        expect(fight.resolveChoice(c.uid, 0).ok).toBe(true);
        expect(p.stat(idx) - before).toBe(o.value * (double ? 2 : 1));
      }
      expect(fight.getStatus().kind).not.toBe('choice');
    }
  });
});

describe('cadeaux (choix 10)', () => {
  it('apparition aux T2–T9 sur les 7 cases (libres, sans cadeau), persistants jusqu’à ce qu’on les prenne', () => {
    const fight = newFight({ ...DET, gifts: { spawnProbability: 1 } });
    advanceUntil(fight, (f) => f.turn === 10 && f.isPlayerTurn());
    const evs = fight.state.log!.ofType('giftSpawned');
    for (const e of evs) {
      expect(e.turn).toBeGreaterThanOrEqual(2);
      expect(e.turn).toBeLessThanOrEqual(9);
      expect(fight.ctx.config.gifts.cells).toContain(e.cell);
    }
    expect(new Set(evs.map((e) => e.cell)).size).toBe(evs.length);
    expect(giftCells(fight.state, fight.scenario).sort()).toEqual(evs.map((e) => e.cell).sort());
    expect(fight.scenario.giftsSpawned).toBe(evs.length);
    expect(evs.length).toBeGreaterThanOrEqual(6);
    const none = newFight({ ...DET, gifts: { spawnProbability: 0 } });
    advanceUntil(none, (f) => f.turn === 10 && f.isPlayerTurn());
    expect(none.scenario.giftsSpawned).toBe(0);
  });

  it('un joueur marche sur le cadeau : chaque joueur choisit parmi 2 cartes ; seul ce cadeau disparaît ; application', () => {
    const fight = newFight({ ...DET, gifts: { spawnProbability: 1 } });
    const j1 = untilPlayerTurn(fight, 2, 0);
    const [cell] = giftCells(fight.state, fight.scenario);
    expect(cell).toBeDefined();
    expect(fight.playerMove(cell!).ok).toBe(true);
    const choices = fight.getPendingChoices().filter((c) => c.choiceListId === 10);
    expect(choices.map((c) => c.fighterId).sort()).toEqual([...fight.scenario.playerIds].sort());
    expect(fight.scenario.giftsTaken).toBe(1);
    expect(giftCells(fight.state, fight.scenario)).toEqual([]);
    for (const c of choices) {
      expect(c.options).toHaveLength(2);
      const p = fight.state.fighters[c.fighterId]!;
      const o = c.options[0]!;
      expect(fight.resolveChoice(c.uid, 0).ok).toBe(true);
      if (o.kind === 'unique') {
        expect(p.archetypeData!.uniques).toContain(o.spellLevelId);
        expect(p.knowsSpell(o.spellLevelId)).toBe(true);
      } else if (o.kind === 'upgrade') {
        expect(p.knowsSpell(o.baseSpellLevelId)).toBe(false);
        expect(p.knowsSpell(o.upgradedSpellLevelId)).toBe(true);
      } else throw new Error('carte inattendue');
    }
    expect(fight.getStatus()).toEqual({ kind: 'playerTurn', fighterId: j1.id });
  });

  it('gifts.cardMix : 2 uniques ; 2 améliorations (complétées par un unique faute d’amélioration disponible)', () => {
    const uniques = newFight({ ...DET, gifts: { spawnProbability: 1, cardMix: { twoUniques: 1, twoUpgrades: 0, oneEach: 0 } } });
    untilPlayerTurn(uniques, 2, 0);
    uniques.playerMove(giftCells(uniques.state, uniques.scenario)[0]!);
    for (const c of uniques.getPendingChoices().filter((x) => x.choiceListId === 10)) {
      expect(c.options.map((o) => o.kind)).toEqual(['unique', 'unique']);
    }
    const upgrades = newFight({ ...DET, gifts: { spawnProbability: 1, cardMix: { twoUniques: 0, twoUpgrades: 1, oneEach: 0 } } });
    untilPlayerTurn(upgrades, 2, 0);
    upgrades.playerMove(giftCells(upgrades.state, upgrades.scenario)[0]!);
    for (const c of upgrades.getPendingChoices().filter((x) => x.choiceListId === 10)) {
      // au T2 seul le sort de départ est améliorable (Frappe Repoussoir n'a pas d'amélioration)
      expect(c.options.map((o) => o.kind).sort()).toEqual(['unique', 'upgrade']);
      const up = c.options.find((o) => o.kind === 'upgrade')!;
      const p = upgrades.state.fighters[c.fighterId]!;
      expect(up.kind === 'upgrade' && up.baseSpellLevelId).toBe(p.archetypeData!.startingSpell);
    }
  });

  it('carte d’amélioration : nouveau sort (relance remise à zéro) ; unique : obtenu une seule fois (Relâchement : effet d’obtention)', () => {
    const fight = newFight(DET, { players: [{ archetype: 'dompteur' }, { archetype: 'acrobate' }] });
    const d = fight.getCurrentFighter()!;
    expect(d.archetype).toBe('dompteur');
    // Grondement Grandissant (intervalle 2) appris puis lancé : en recharge
    fight.debugCompleteObjective(d.id);
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    const cell = fight.getCastableCells(80501)[0]!;
    expect(fight.playerCast(80501, cell).ok).toBe(true);
    expect(fight.canCast(80501, cell).code).toBe('COOLDOWN');
    const up = d.archetypeData!.upgrades['80501']!;
    const c = pushChoice(fight, d.id, [
      { kind: 'upgrade', baseSpellLevelId: 80501, upgradedSpellLevelId: up.to, cardSpellLevelId: up.choiceSpellLevelId, label: 'Amélioration : Grondement Grandissant' },
    ]);
    expect(fight.resolveChoice(c.uid, 0).ok).toBe(true);
    expect(d.knowsSpell(80501)).toBe(false);
    expect(d.knowsSpell(up.to)).toBe(true);
    expect(d.hasState(up.boostedStateId)).toBe(true);
    expect(fight.canCast(up.to, fight.getCastableCells(up.to)[0]!).ok).toBe(true);
    // unique : Relâchement de Fureur (buff de croissance 30624 posé à l'obtention)
    const u = pushChoice(fight, d.id, [{ kind: 'unique', spellLevelId: 80839, label: 'Relâchement de Fureur' }]);
    fight.resolveChoice(u.uid, 0);
    expect(d.knowsSpell(80839)).toBe(true);
    expect(d.buffs.some((b) => b.spellId === 30624)).toBe(true);
    expect(fight.scenario.hasObtainedUnique(d.id, 80839)).toBe(true);
    // jamais reproposé ensuite (20 tirages de cartes)
    for (let k = 0; k < 20; k++) {
      fight.state.pendingChoices.push({ uid: fight.state.newUid(), scope: 'individual', choiceListId: 10, fighterId: d.id, casterId: 0, spellLevelId: 0, castId: 0, turn: 1 });
      fillPendingChoices(fight.state);
      const ch = fight.getPendingChoice()!;
      expect(ch.options.length).toBeGreaterThan(0);
      for (const o of ch.options) if (o.kind === 'unique') expect(o.spellLevelId).not.toBe(80839);
      fight.state.pendingChoices.length = 0;
    }
  });
});
