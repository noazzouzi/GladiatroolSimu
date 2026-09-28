/**
 * Scénario — objectifs (ETUDE §7, N30 §5.3, SPEC §11.5) : conditions déclaratives des 21 objectifs, récompense
 * (sort du palier appris par chaque joueur, Faveur −1 cran), votes (listes 11–15), limites.
 */
import { describe, expect, it } from 'vitest';
import type { ObjectiveId } from '../src/data/index.js';
import { canCast, castSpell, enterMarksAt, placeFighter, type Fighter, type TriggerEvent } from '../src/engine/index.js';
import { activateObjective, flushScenario, type GladiatroolFight } from '../src/scenario/index.js';
import { objectivesOnTrigger, objectivesOnTurnEnd, objectivesOnTurnStart } from '../src/scenario/objectives.js';
import { advanceUntil, DET, kill, newFight, QUIET, troolls, untilPlayerTurn } from './helpers/scenarioSetup.js';

/** Objectif rendu actif directement (test) pendant le tour courant. */
function force(fight: GladiatroolFight, id: ObjectiveId): void {
  activateObjective(fight.state, id);
}

/**
 * Objectif rendu actif comme s'il avait été voté AVANT le début du tour du joueur courant : ses déclencheurs de début
 * de tour (TB) sont posés (suivi « pendant le tour » installé, marquages du début de tour).
 */
function forceAtTurnStart(fight: GladiatroolFight, id: ObjectiveId): void {
  activateObjective(fight.state, id);
  const f = fight.getCurrentFighter();
  if (f) objectivesOnTurnStart(fight.state, fight.scenario, f);
}

function done(fight: GladiatroolFight): string[] {
  return fight.scenario.completed.map((c) => c.objectiveId);
}

/** Événement synthétique passé au suivi des objectifs, puis point sûr. */
function feed(fight: GladiatroolFight, ev: TriggerEvent): void {
  objectivesOnTrigger(fight.state, fight.scenario, ev);
  flushScenario(fight.state);
}

function deathEv(target: Fighter, killerId: number, cause: 'damage' | 'pushDamage' = 'damage'): TriggerEvent {
  return { type: 'death', targetId: target.id, killerId, cause, castId: 0, originBuffUid: -1 };
}

describe('Empalé (palier 1, imposé)', () => {
  it('un Trooll Vulnérable meurt → chaque joueur apprend son sort de palier 1, Faveur −5 %, vote du palier 2 (2 objectifs)', () => {
    const fight = newFight(DET);
    const acro = fight.getCurrentFighter()!;
    const t = fight.state.fighterAt(242)!;
    t.hp = 100;
    expect(fight.playerCast(80507, 256).ok).toBe(true); // Videur : 242 → 199 (pics), 2 000 d'entrée
    expect(t.alive).toBe(false);
    expect(done(fight)).toEqual(['empale']);
    const learned = fight.getPlayers().map((p) => p.spells.at(-1)!.spellLevelId);
    expect(learned).toEqual([80513, 80501, 80501, 80515]); // Hanedimane, Grondement ×2, Regain
    expect(fight.getMama()!.hasState(5974)).toBe(true);
    const vote = fight.getPendingChoice()!;
    expect(vote.scope).toBe('global');
    expect(vote.choiceListId).toBe(11);
    expect(vote.options).toHaveLength(2);
    for (const o of vote.options) expect(o.kind === 'objective' && o.tier).toBe(2);
    expect(fight.getStatus().kind).toBe('choice');
    // actions refusées tant que le vote attend
    expect(fight.playerCast(80499, 300).code).toBe('PENDING_CHOICE');
    const chosen = vote.options[1]!;
    expect(fight.resolveChoice(vote.uid, 1).ok).toBe(true);
    expect(chosen.kind === 'objective' && fight.getActiveObjective()?.id === chosen.objectiveId).toBe(true);
    // le sort appris est utilisable dans le même tour (spells.newSpellUsableSameTurn)
    expect(fight.getStatus()).toEqual({ kind: 'playerTurn', fighterId: acro.id });
    expect(fight.canCast(80513, 300).code).not.toBe('LEARNED_THIS_TURN');
  });

  it('spells.newSpellUsableSameTurn faux : le sort appris pendant le tour est grisé jusqu’au tour suivant', () => {
    const fight = newFight({ ...DET, spells: { newSpellUsableSameTurn: false } });
    const acro = fight.getCurrentFighter()!;
    fight.debugCompleteObjective(acro.id);
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    expect(canCast(fight.state, acro.id, 80513, 300).code).toBe('LEARNED_THIS_TURN');
  });

  it('mort d’un ennemi non Vulnérable : pas de validation', () => {
    const fight = newFight(DET);
    kill(fight, [troolls(fight)[0]!]);
    expect(done(fight)).toEqual([]);
    expect(fight.getActiveObjective()?.id).toBe('empale');
  });
});

describe('objectifs suivis pendant le tour d’un allié', () => {
  it('Productivité : le Magicien lance 3 sorts dans son tour (Regain + 2 Pulsations)', () => {
    const fight = newFight(QUIET);
    const mag = untilPlayerTurn(fight, 1, 3);
    fight.debugCompleteObjective(mag.id); // Empalé → Regain appris
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    forceAtTurnStart(fight, 'productivite');
    expect(fight.playerCast(80515, mag.cell).ok).toBe(true);
    expect(fight.playerCast(80514, mag.cell).ok).toBe(true);
    expect(done(fight)).toEqual(['empale']);
    expect(fight.playerCast(80514, mag.cell).ok).toBe(true);
    expect(done(fight)).toEqual(['empale', 'productivite']);
    expect(fight.getPendingChoice()?.choiceListId).toBe(12);
    // palier 2 : Amplification apprise
    expect(mag.knowsSpell(80516)).toBe(true);
  });

  it('Au coin ! : à la fin du tour, tous les ennemis vivants (hors Mama pré-combat) sont dans les pics', () => {
    const fight = newFight(QUIET);
    force(fight, 'au_coin');
    expect(fight.playerCast(80507, 256).ok).toBe(true);
    expect(fight.playerCast(80507, 372).ok).toBe(true);
    expect(troolls(fight).every((t) => t.hasState(5902))).toBe(true);
    expect(done(fight)).toEqual([]);
    fight.endTurn();
    expect(done(fight)).toEqual(['au_coin']);
    const other = newFight(QUIET);
    force(other, 'au_coin');
    other.playerCast(80507, 256);
    other.endTurn();
    expect(done(other)).toEqual([]);
  });

  it('Toi, par ici, et toi, par là : Voltige depuis les pics (un ennemi entre, un allié sort)', () => {
    const fight = newFight(QUIET);
    const acro = fight.getCurrentFighter()!;
    fight.state.fighters[acro.id]!.spells = [...acro.spells, { spellLevelId: 80510, spellId: 30404, slot: 3, upgraded: false, unique: false, learnedTurn: 0 }];
    placeFighter(fight.state, acro, 199);
    enterMarksAt(fight.state, acro);
    expect(acro.hasState(5903)).toBe(true);
    forceAtTurnStart(fight, 'toi_par_ici');
    expect(fight.playerCast(80510, 242).ok).toBe(true);
    expect(acro.cell).toBe(242);
    expect(fight.state.fighterAt(199)!.hasState(5902)).toBe(true);
    expect(done(fight)).toEqual(['toi_par_ici']);
  });

  it('Distance d’insécurité : vraie par vacuité sans Artroolleur (fin du tour) ; fausse s’ils sont loin', () => {
    const a = newFight(QUIET);
    force(a, 'distance_insecurite');
    a.endTurn();
    expect(done(a)).toEqual(['distance_insecurite']);
    const b = newFight(QUIET);
    untilPlayerTurn(b, 2, 0);
    force(b, 'distance_insecurite');
    b.endTurn();
    expect(done(b)).toEqual([]);
  });

  it('Tout le monde veut prendre sa place : case de l’ennemi le plus éloigné marquée au début du tour, à occuper en fin de tour', () => {
    const fight = newFight(QUIET);
    force(fight, 'prendre_sa_place');
    const j1 = untilPlayerTurn(fight, 2, 0);
    const obj = fight.getActiveObjective()!;
    const enemies = fight.getLivingMonsters().filter((m) => !m.hasState(5971));
    const far = Math.max(...enemies.map((m) => distanceOf(m.cell, j1.cell)));
    const target = enemies.find((m) => m.cell === obj.markedCell)!;
    expect(distanceOf(target.cell, j1.cell)).toBe(far);
    kill(fight, [target]);
    placeFighter(fight.state, j1, obj.markedCell);
    fight.endTurn();
    expect(done(fight)).toEqual(['prendre_sa_place']);
  });

  it('Pas le temps de dire « Aïe » : tuer un ennemi à PV pleins au début du tour ; pas un ennemi déjà blessé', () => {
    const fight = newFight(QUIET);
    force(fight, 'pas_le_temps');
    const j1 = untilPlayerTurn(fight, 2, 0);
    const hurt = troolls(fight).at(-1);
    hurt!.hp -= 1; // blessé après le marquage : il comptait au début du tour
    kill(fight, [hurt!], j1.id);
    expect(done(fight)).toEqual(['pas_le_temps']);
    const other = newFight(QUIET);
    force(other, 'pas_le_temps');
    advanceUntil(other, (f) => f.turn === 2 && f.isMonsterTurn());
    const t = troolls(other)[0]!;
    t.hp -= 1; // blessé avant le début du tour de J1
    const k1 = untilPlayerTurn(other, 2, 1);
    kill(other, [t], k1.id);
    expect(done(other)).toEqual([]);
  });

  it('Meurtres en série : le même joueur achève 2 ennemis dans son tour ; morts par poussée selon objectives.pushKillsCount', () => {
    const fight = newFight(QUIET);
    force(fight, 'meurtres_serie');
    const j1 = fight.getCurrentFighter()!;
    const [a, b] = troolls(fight);
    feed(fight, deathEv(a!, j1.id));
    expect(done(fight)).toEqual([]);
    feed(fight, deathEv(b!, j1.id, 'pushDamage'));
    expect(done(fight)).toEqual(['meurtres_serie']);
    const other = newFight({ ...QUIET, objectives: { pushKillsCount: false } });
    force(other, 'meurtres_serie');
    const k = other.getCurrentFighter()!;
    const [c, d] = troolls(other);
    feed(other, deathEv(c!, k.id));
    feed(other, deathEv(d!, k.id, 'pushDamage'));
    // mort par les pics (lanceur = entité de scénario) : non attribuée (objectives.glyphKillsCreditPlayer faux)
    feed(other, deathEv(d!, other.scenario.sceId));
    expect(done(other)).toEqual([]);
  });

  it('D’une pierre trois coups : 3 morts entre deux lancers du joueur actif (compteur remis à zéro à chaque lancer)', () => {
    const fight = newFight(QUIET);
    forceAtTurnStart(fight, 'pierre_trois_coups');
    const [a, b, c] = [...troolls(fight), fight.getMama()!];
    feed(fight, deathEv(a!, -1));
    feed(fight, deathEv(b!, -1));
    const cell = fight.getCastableCells(80499)[0]!;
    expect(fight.playerCast(80499, cell).ok).toBe(true);
    feed(fight, deathEv(a!, -1));
    feed(fight, deathEv(b!, -1));
    expect(done(fight)).toEqual([]);
    feed(fight, deathEv(c!, -1));
    expect(done(fight)).toEqual(['pierre_trois_coups']);
  });

  it('Faire le mur (3 ennemis distincts subissent des dommages de poussée) et Trous dans les Troolls (4 entrées distinctes)', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 2, 0);
    const ms = fight.getLivingMonsters();
    force(fight, 'faire_le_mur');
    const dmg = (t: Fighter): TriggerEvent => ({
      type: 'damage', targetId: t.id, sourceId: fight.getCurrentFighter()!.id, amount: 283, initial: 283, final: 283, shieldAbsorbed: 0,
      eroded: 0, collision: true, pushIndex: 0, element: 0, melee: false, critical: false, allySource: false, glyph: false,
      sourceIsSummon: false, spellId: 0, castId: 0, originBuffUid: -1,
    });
    feed(fight, dmg(ms[1]!));
    feed(fight, dmg(ms[1]!));
    feed(fight, dmg(ms[2]!));
    expect(done(fight)).toEqual([]);
    feed(fight, dmg(ms[3]!));
    expect(done(fight)).toEqual(['faire_le_mur']);
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    forceAtTurnStart(fight, 'trous_troolls');
    for (const t of ms.slice(1, 4)) feed(fight, { type: 'stateOn', targetId: t.id, stateId: 5902, sourceId: fight.scenario.sceId });
    feed(fight, { type: 'stateOn', targetId: ms[1]!.id, stateId: 5902, sourceId: fight.scenario.sceId });
    expect(done(fight)).toEqual(['faire_le_mur']);
    feed(fight, { type: 'stateOn', targetId: ms[4]!.id, stateId: 5902, sourceId: fight.scenario.sceId });
    expect(done(fight)).toEqual(['faire_le_mur', 'trous_troolls']);
  });

  it('compteurs du tour remis à zéro en fin de tour (Productivité : 2 lancers par tour ne suffisent pas)', () => {
    const fight = newFight(QUIET);
    force(fight, 'productivite');
    const cells = fight.getCastableCells(80499);
    fight.playerCast(80499, cells[0]!);
    fight.playerCast(80499, cells[1]!);
    fight.endTurn();
    untilPlayerTurn(fight, 1, 1);
    const c2 = fight.getCastableCells(80499);
    fight.playerCast(80499, c2[0]!);
    expect(fight.getActiveObjective()?.counter).toBe(1);
    expect(done(fight)).toEqual([]);
  });
});

describe('objectifs évalués à la mort d’un ennemi', () => {
  it('Attention, sol glissant (mort par dommages de poussée) ; Ébranlable (mort en état Inébranlable)', () => {
    const fight = newFight(QUIET);
    force(fight, 'sol_glissant');
    const [a, b] = troolls(fight);
    feed(fight, deathEv(a!, fight.getCurrentFighter()!.id));
    expect(done(fight)).toEqual([]);
    feed(fight, deathEv(a!, fight.getCurrentFighter()!.id, 'pushDamage'));
    expect(done(fight)).toEqual(['sol_glissant']);
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    force(fight, 'ebranlable');
    expect(castSpell(fight.state, b!.id, 80485, b!.cell, { ignoreConditions: true }).ok).toBe(true);
    expect(b!.hasState(157)).toBe(true);
    kill(fight, [b!]);
    expect(done(fight)).toEqual(['sol_glissant', 'ebranlable']);
  });

  it('Quintuplé : 5 ennemis tués par des joueurs dans le même tour global (remise à zéro à la fin du tour global)', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 2, 0);
    forceAtTurnStart(fight, 'quintuple');
    const j1 = fight.getCurrentFighter()!;
    const ms = troolls(fight);
    expect(ms).toHaveLength(5);
    kill(fight, ms.slice(0, 4), j1.id);
    expect(fight.getActiveObjective()?.globalKills).toBe(4);
    kill(fight, [ms[4]!], fight.scenario.sceId); // mort par les pics : non attribuée
    expect(done(fight)).toEqual([]);
    const other = newFight(QUIET);
    untilPlayerTurn(other, 2, 0);
    forceAtTurnStart(other, 'quintuple');
    kill(other, troolls(other), other.getCurrentFighter()!.id);
    expect(done(other)).toEqual(['quintuple']);
    // remise à zéro à la fin du tour global
    const third = newFight(QUIET);
    forceAtTurnStart(third, 'quintuple');
    kill(third, troolls(third), third.getCurrentFighter()!.id);
    untilPlayerTurn(third, 2, 0);
    expect(third.getActiveObjective()?.globalKills).toBe(0);
  });

  it('Même pas mal : pendant le tour de la Mama, un joueur touché sans aucune variation de PV depuis son début de tour (bouclier)', () => {
    const fight = newFight(QUIET);
    const mama = fight.getMama()!;
    const j1 = fight.getCurrentFighter()!;
    const hit = (amount: number): TriggerEvent => ({
      type: 'damage', targetId: j1.id, sourceId: mama.id, amount, initial: 4000, final: 4000, shieldAbsorbed: 4000 - amount,
      eroded: 0, collision: false, pushIndex: 0, element: 0, melee: false, critical: false, allySource: false, glyph: false,
      sourceIsSummon: false, spellId: 30393, castId: 1, originBuffUid: -1,
    });
    force(fight, 'meme_pas_mal');
    // hors du tour de la Mama (30539 posé à son début de tour) : rien
    objectivesOnTrigger(fight.state, fight.scenario, hit(0));
    flushScenario(fight.state);
    expect(done(fight)).toEqual([]);
    const sc = fight.scenario;
    objectivesOnTurnStart(fight.state, sc, mama);
    objectivesOnTrigger(fight.state, sc, hit(1500));
    flushScenario(fight.state);
    expect(done(fight)).toEqual([]);
    // même tour : PV déjà modifiés (5960 perdu) → un coup absorbé ensuite ne suffit pas
    objectivesOnTrigger(fight.state, sc, hit(0));
    flushScenario(fight.state);
    expect(done(fight)).toEqual([]);
    objectivesOnTurnEnd(fight.state, sc, mama);
    objectivesOnTurnStart(fight.state, sc, mama);
    objectivesOnTrigger(fight.state, sc, hit(0));
    flushScenario(fight.state);
    expect(done(fight)).toEqual(['meme_pas_mal']);
  });
});

describe('objectifs contrôlés à la fin du tour global (30710)', () => {
  it('Stop aux projectiles : aucun Artroolleur vivant (validé à la fin du T1 ; pas à la fin du T2)', () => {
    const a = newFight(QUIET);
    force(a, 'stop_projectiles');
    untilPlayerTurn(a, 2, 0, () => 0);
    expect(done(a)).toEqual(['stop_projectiles']);
    const b = newFight(QUIET);
    untilPlayerTurn(b, 2, 0);
    force(b, 'stop_projectiles');
    untilPlayerTurn(b, 3, 0);
    expect(done(b)).toEqual([]);
  });

  it('1,2,3, Soleil ! : chaque joueur finit son tour sur sa case de début de tour, pendant un tour global complet', () => {
    const fight = newFight(QUIET);
    force(fight, 'soleil'); // activé pendant le tour de J1 : le T1 ne compte pas
    untilPlayerTurn(fight, 2, 0);
    expect(done(fight)).toEqual([]);
    untilPlayerTurn(fight, 3, 0);
    expect(done(fight)).toEqual(['soleil']);
    const other = newFight(QUIET);
    untilPlayerTurn(other, 2, 0);
    force(other, 'soleil');
    untilPlayerTurn(other, 3, 1);
    // J2 se déplace au T3 : échec ; au T4 tout le monde reste : validé au début du T5
    expect(other.playerMove(other.getCurrentFighter()!.cell + 1).ok).toBe(true);
    untilPlayerTurn(other, 4, 0);
    expect(done(other)).toEqual([]);
    untilPlayerTurn(other, 5, 0);
    expect(done(other)).toEqual(['soleil']);
  });

  it('Sauvez-le ! : désignation à la fin du tour global (le plus blessé par paliers de 10 %), validé si le désigné a tous ses PV', () => {
    const fight = newFight(QUIET);
    force(fight, 'sauvez_le');
    const j3 = fight.getPlayers()[2]!;
    j3.hp = Math.floor(j3.maxHp * 0.25);
    untilPlayerTurn(fight, 2, 0);
    expect(fight.getActiveObjective()?.designatedId).toBe(j3.id);
    expect(done(fight)).toEqual([]);
    j3.hp = j3.maxHp;
    untilPlayerTurn(fight, 3, 0);
    expect(done(fight)).toEqual(['sauvez_le']);
  });

  it('Tout va bien : aucun joueur à 50 % de ses PV ou moins (strictement plus)', () => {
    const a = newFight(QUIET);
    force(a, 'tout_va_bien');
    a.getPlayers()[1]!.hp = 15000;
    untilPlayerTurn(a, 2, 0);
    expect(done(a)).toEqual([]);
    a.getPlayers()[1]!.hp = 15001;
    untilPlayerTurn(a, 3, 0);
    expect(done(a)).toEqual(['tout_va_bien']);
  });

  it('Solitude : la Mama vivante sans allié (avant son arrivée selon objectives.solitudeBeforeArrival)', () => {
    for (const before of [true, false]) {
      const fight = newFight({ ...QUIET, objectives: { solitudeBeforeArrival: before } });
      force(fight, 'solitude');
      kill(fight, troolls(fight));
      untilPlayerTurn(fight, 2, 0);
      expect(done(fight)).toEqual(before ? ['solitude'] : []);
    }
  });
});

describe('votes et limites', () => {
  it('objectives.offerCount = 3 ; votes individuels (majorité, égalité tirée au sort) ; réponses invalides', () => {
    const fight = newFight({ ...QUIET, objectives: { offerCount: 3 } });
    fight.debugCompleteObjective();
    const vote = fight.getPendingChoice()!;
    expect(vote.options).toHaveLength(3);
    expect(fight.resolveChoice(vote.uid, 3).ok).toBe(false);
    expect(fight.resolveChoice(vote.uid, { votes: [0, 9] }).ok).toBe(false);
    expect(fight.getPendingChoice()?.uid).toBe(vote.uid);
    const clone = fight.clone();
    const r = fight.resolveChoice(vote.uid, { votes: [2, 1, 2, 0] });
    expect(r.option).toEqual(vote.options[2]);
    const tie = clone.resolveChoice(vote.uid, { votes: [0, 1, 0, 1] });
    expect([vote.options[0], vote.options[1]]).toContainEqual(tie.option);
  });

  it('objectives.maxCount = 5 et objectives.tier6Offered faux : pas de vote après le 5e objectif', () => {
    for (const over of [{ maxCount: 5 }, { tier6Offered: false }]) {
      const fight = newFight({ ...QUIET, objectives: over });
      for (let k = 1; k <= 5; k++) {
        fight.debugCompleteObjective();
        const v = fight.getPendingChoice();
        if (k < 5) fight.resolveChoice(v!.uid, 0);
        else expect(v).toBeNull();
      }
      expect(fight.getActiveObjective()).toBeNull();
      expect(fight.scenario.completed.map((c) => c.tier)).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

function distanceOf(a: number, b: number): number {
  const xy = (c: number): [number, number] => {
    const row = Math.floor(c / 14);
    const col = c % 14;
    return [((row + 1) >> 1) + col, col - (row - ((row + 1) >> 1))];
  };
  const [ax, ay] = xy(a);
  const [bx, by] = xy(b);
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
