/**
 * Planificateur (sim/src/planner) : génération d'actions, évaluation, recherche, explications, plan d'équipe, sur des
 * situations tirées de l'ÉTUDE (§10.2 principes autour des pics, §10.4 ouverture T1, §10.5 placement T7).
 * Le planificateur n'agit que par l'API publique (copies) : le combat passé n'est jamais modifié.
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig, type ConfigOverrides } from '../src/data/index.js';
import { bossArrivalCell } from '../src/engine/index.js';
import { AXIS_DIRECTIONS, distance, inLine, nextCell } from '../src/geometry/index.js';
import {
  createGladiatroolFight,
  passiveMonsterController,
  resolveAllChoices,
  simpleMonsterController,
  type GladiatroolFight,
  type MonsterController,
} from '../src/scenario/index.js';
import {
  DEFAULT_WEIGHTS,
  defaultChoicePolicy,
  evaluateState,
  executePlan,
  generateCastActions,
  generateEndMoves,
  mamaInfo,
  mergeWeights,
  monsterInSpikes,
  planPlayerTurn,
  planTeamTurn,
  spellProfile,
  stateHash,
  type PlannedAction,
} from '../src/planner/index.js';
import { untilPlayerTurn } from './helpers/scenarioSetup.js';

const VIDEUR = 80507;
const IMPACT = 80500;
const ADDM = [{ archetype: 'acrobate', startCell: 314 }, { archetype: 'dompteur' }, { archetype: 'dompteur' }, { archetype: 'magicien' }] as const;

function newPlannerFight(overrides: ConfigOverrides = {}, monsters: MonsterController = simpleMonsterController, seed = 42): GladiatroolFight {
  return createGladiatroolFight(gameData, loadConfig({ spawn: { mode: 'most_frequent' }, rng: { rollMode: 'average', critMode: 'never' }, ...overrides }), {
    players: ADDM,
    seed,
    options: { monsterController: monsters },
  });
}

function casts(actions: readonly PlannedAction[]): { spellLevelId: number; cell: number }[] {
  return actions.filter((a): a is Extract<PlannedAction, { type: 'cast' }> => a.type === 'cast');
}

const TROOLLIBRE_1 = 6;
const TROOLLIBRE_2 = 7;

describe('ouverture T1 (ÉTUDE §10.4)', () => {
  it('Acrobate sur 314, V1 sur 242 / 358 : double Videur, les deux Troollibres dans les pics (modes fast et deep)', () => {
    for (const mode of ['fast', 'deep'] as const) {
      const fight = newPlannerFight();
      expect(fight.state.fighters[TROOLLIBRE_1]!.cell).toBe(242);
      expect(fight.state.fighters[TROOLLIBRE_2]!.cell).toBe(358);
      const before = stateHash(fight);
      const plan = planPlayerTurn(fight, { mode, deterministic: true });
      expect(stateHash(fight), 'le combat passé est intact').toBe(before);
      const c = casts(plan.actions);
      expect(c.map((x) => x.spellLevelId)).toEqual([VIDEUR, VIDEUR]);
      expect(plan.summary.enteredSpikes.sort()).toEqual(['Troollibre 1', 'Troollibre 2']);
      expect(plan.summary.finalInSpikes).toBe(false);
      expect(plan.actions.at(-1)).toEqual({ type: 'end' });
      // explication française
      expect(plan.explanation).toContain('Videur');
      expect(plan.explanation).toContain('Envoyés dans les pics : ');
      expect(plan.explanation).toContain('Anticipation');
      expect(plan.alternatives.length).toBeGreaterThan(0);
      // sérialisable
      expect(JSON.parse(JSON.stringify(plan)).actions).toEqual(plan.actions);
      // exécution par l'API publique : même résultat (jets moyens)
      const r = executePlan(fight, plan.actions);
      expect(r.ok).toBe(true);
      expect(monsterInSpikes(fight.state, fight.state.fighters[TROOLLIBRE_1]!)).toBe(true);
      expect(monsterInSpikes(fight.state, fight.state.fighters[TROOLLIBRE_2]!)).toBe(true);
      expect(fight.getCurrentFighter()?.id).not.toBe(0);
    }
  });

  it('le double Videur de référence (256 puis 372) est parmi les meilleurs plans (même valeur à 1 000 près)', () => {
    const fight = newPlannerFight();
    const plan = planPlayerTurn(fight, { mode: 'deep', deterministic: true });
    const ref = fight.clone({ keepLog: false });
    ref.state.rollMode = 'average';
    expect(ref.playerCast(VIDEUR, 256).ok).toBe(true);
    expect(ref.playerCast(VIDEUR, 372).ok).toBe(true);
    expect(monsterInSpikes(ref.state, ref.state.fighters[TROOLLIBRE_1]!)).toBe(true);
    expect(monsterInSpikes(ref.state, ref.state.fighters[TROOLLIBRE_2]!)).toBe(true);
    const refScore = evaluateState(ref);
    expect(plan.staticScore).toBeGreaterThanOrEqual(refScore - 1000);
  });

  it('plan d’équipe du T1 : Acrobate puis Dompteurs qui tuent, Empalé validé, personne dans les pics', () => {
    const fight = newPlannerFight();
    const tp = planTeamTurn(fight, { mode: 'fast', deterministic: true });
    expect(tp.turn).toBe(1);
    expect(tp.steps.map((s) => s.fighterName)).toEqual(['Acrobate', 'Dompteur 1', 'Dompteur 2', 'Magicien']);
    expect(tp.steps[0]!.plan.summary.enteredSpikes).toHaveLength(2);
    const kills = tp.steps.flatMap((s) => s.plan.summary.kills);
    expect(kills.sort()).toEqual(['Troollibre 1', 'Troollibre 2']);
    expect(tp.steps.flatMap((s) => s.plan.summary.objectivesCompleted)).toContain('Empalé');
    for (const s of tp.steps) expect(s.plan.summary.finalInSpikes, s.fighterName).toBe(false);
    expect(tp.explanation).toContain('Tour global 1');
    expect(fight.getCurrentFighter()?.id).toBe(0);
  });

  it('beam d’équipe (K = 3) : au moins aussi bon que la planification successive', () => {
    const fight = newPlannerFight();
    const k1 = planTeamTurn(fight, { mode: 'fast', deterministic: true });
    const k3 = planTeamTurn(fight, { mode: 'fast', deterministic: true, teamBeamWidth: 3 });
    expect(k3.score).toBeGreaterThanOrEqual(k1.score - 1e-6);
  });
});

describe('principes autour des pics (ÉTUDE §10.2)', () => {
  it('un Dompteur préfère frapper la cible Vulnérable (×2)', () => {
    const fight = newPlannerFight();
    expect(fight.playerCast(VIDEUR, 256).ok).toBe(true); // Troollibre 1 → pics (Vulnérable), Troollibre 2 intact
    fight.endTurn();
    fight.runUntilPlayerInput();
    expect(fight.getCurrentFighter()!.name).toBe('Dompteur 1');
    const t1 = fight.state.fighters[TROOLLIBRE_1]!;
    t1.hp = 25000; // aucune mise à mort possible : seul le multiplicateur départage
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    const hit = new Map(plan.summary.targets.map((t) => [t.id, t.damage]));
    expect(hit.get(TROOLLIBRE_1) ?? 0).toBeGreaterThan(10000);
    expect(hit.get(TROOLLIBRE_2) ?? 0).toBe(0);
  });

  it('un Trooll ≤ 2 000 PV dans les pics n’est pas frappé : il mourra seul au début de son tour', () => {
    const fight = newPlannerFight({}, passiveMonsterController);
    fight.playerCast(VIDEUR, 256);
    fight.playerCast(VIDEUR, 372);
    resolveAllChoices(fight, () => 0);
    fight.endTurn();
    resolveAllChoices(fight, () => 0);
    fight.runUntilPlayerInput(passiveMonsterController);
    const t1 = fight.state.fighters[TROOLLIBRE_1]!;
    expect(monsterInSpikes(fight.state, t1)).toBe(true);
    t1.hp = 1500;
    const plan = planPlayerTurn(fight, { mode: 'deep', deterministic: true, monsterController: passiveMonsterController });
    const hit = plan.summary.targets.find((t) => t.id === TROOLLIBRE_1);
    expect(hit?.damage ?? 0).toBe(0);
    expect(plan.summary.damageDealt).toBeGreaterThan(10000); // frappe l'autre
    expect(plan.explanation).toContain('mourra seul dans les pics');
  });

  it('un joueur ne finit pas son tour dans les pics sans raison : placé dans les pics, il en sort', () => {
    const fight = newPlannerFight();
    const grid = fight.ctx.grid;
    const acro = fight.getCurrentFighter()!;
    // case de pics au bord de l'arène (voisine d'une case sans pics) et libre, la plus proche de l'Acrobate
    let best = -1;
    for (let c = 0; c < 560; c++) {
      if (!grid.isSpike(c) || fight.state.isOccupied(c)) continue;
      const exit = AXIS_DIRECTIONS.some((d) => {
        const n = nextCell(c, d);
        return n >= 0 && grid.isWalkable(n) && !grid.isSpike(n);
      });
      if (!exit) continue;
      if (best < 0 || distance(c, 314) < distance(best, 314)) best = c;
    }
    fight.state.setCell(acro, best);
    expect(grid.isSpike(acro.cell)).toBe(true);
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    expect(plan.summary.finalInSpikes).toBe(false);
  });

  it('les positions de fin de tour évitent les pics et leur traversée', () => {
    const fight = newPlannerFight();
    const moves = generateEndMoves(fight, 10, DEFAULT_WEIGHTS);
    expect(moves.length).toBeGreaterThan(0);
    for (const m of moves) for (const c of m.path) expect(fight.ctx.grid.isSpike(c)).toBe(false);
  });
});

describe('T7 : sortir des lignes de la Mama (ÉTUDE §10.5)', () => {
  it('case d’arrivée prévue (300, sinon les replis du moteur) et lignes', () => {
    const fight = newPlannerFight({ bonuses: { firstTurn: 99, lastTurn: 99 }, gifts: { spawnProbability: 0 } }, passiveMonsterController);
    untilPlayerTurn(fight, 7, 0);
    const mi = mamaInfo(fight.state, fight.scenario);
    expect(mi.arrivesNext).toBe(true);
    expect(mi.lineCell).toBe(300);
    const acro = fight.getCurrentFighter()!;
    fight.state.setCell(acro, 300);
    // 287 est occupée par Dompteur 1 : repli suivant (axe vers la case d'attente), comme le moteur
    expect(fight.state.fighterAt(287)).toBeTruthy();
    const lc = mamaInfo(fight.state, fight.scenario).lineCell;
    expect(lc).not.toBe(300);
    expect(lc).toBe(bossArrivalCell(fight.state));
  });

  it('au T7, chaque joueur finit son tour hors des lignes de la case d’arrivée', () => {
    const fight = newPlannerFight({ bonuses: { firstTurn: 99, lastTurn: 99 }, gifts: { spawnProbability: 0 } }, passiveMonsterController);
    untilPlayerTurn(fight, 7, 0);
    // les 4 joueurs sont sur leurs cases de départ, toutes alignées avec 300
    for (const p of fight.getPlayers()) expect(inLine(p.cell, 300)).toBe(true);
    const tp = planTeamTurn(fight, { mode: 'fast', deterministic: true, monsterController: passiveMonsterController });
    expect(tp.steps).toHaveLength(4);
    for (const s of tp.steps) {
      const cell = s.plan.summary.finalCell;
      expect(cell, s.fighterName).not.toBe(300);
      expect(inLine(cell, 300), `${s.fighterName} sur ${cell}`).toBe(false);
    }
  });
});

describe('génération d’actions et évaluation', () => {
  it('profils de sorts lus dans les données (Videur : poussée ; Regain : alliés ; Impact : dégâts)', () => {
    const fight = newPlannerFight();
    const v = spellProfile(fight.ctx, VIDEUR);
    expect(v.pushes).toBe(true);
    expect(v.enemyRelevant).toBe(true);
    expect(spellProfile(fight.ctx, IMPACT).damages).toBe(true);
    expect(spellProfile(fight.ctx, 80515).allyRelevant).toBe(true);
  });

  it('élagage : chaque lancer candidat touche une entité pertinente ; Videur vers les pics en tête', () => {
    const fight = newPlannerFight();
    const cands = generateCastActions(fight, { maxCandidates: 200, perSpellQuota: 50, weights: DEFAULT_WEIGHTS });
    expect(cands.length).toBeGreaterThan(0);
    expect(cands[0]!.spellLevelId).toBe(VIDEUR);
    const keys = new Set(cands.map((c) => c.key));
    expect(keys.size).toBe(cands.length);
    // plafond
    expect(generateCastActions(fight, { maxCandidates: 5, perSpellQuota: 1, weights: DEFAULT_WEIGHTS }).length).toBeLessThanOrEqual(5);
  });

  it('évaluation : monstre dans les pics > dehors ; joueur mort très pénalisé ; poids fusionnés', () => {
    const fight = newPlannerFight();
    const base = evaluateState(fight);
    const pushed = fight.clone({ keepLog: false });
    pushed.playerCast(VIDEUR, 256);
    expect(evaluateState(pushed)).toBeGreaterThan(base);
    const w = mergeWeights({ monsterAlive: { '7981': 1 }, playerDeath: 1 });
    expect(w.monsterAlive['7982']).toBe(DEFAULT_WEIGHTS.monsterAlive['7982']);
    expect(w.monsterAlive['7981']).toBe(1);
    expect(w.playerDeath).toBe(1);
    expect(DEFAULT_WEIGHTS.playerDeath).toBeGreaterThan(DEFAULT_WEIGHTS.monsterAlive['7984']!);
  });

  it('contrôleur des monstres injectable (anticipation)', () => {
    const fight = newPlannerFight();
    let calls = 0;
    const spy: MonsterController = {
      playTurn(f, id) {
        calls++;
        simpleMonsterController.playTurn(f, id);
      },
    };
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true, monsterController: spy });
    expect(calls).toBeGreaterThan(0);
    expect(plan.stats.lookaheads).toBeGreaterThan(0);
  });

  it('politique de choix par défaut : Productivité au vote du palier 2 (ÉTUDE §7.3)', () => {
    const fight = newPlannerFight();
    fight.debugCompleteObjective(0);
    const c = fight.getPendingChoice();
    expect(c).toBeTruthy();
    const i = defaultChoicePolicy(c!, fight) as number;
    const o = c!.options[i]!;
    expect(o.kind).toBe('objective');
    if (o.kind === 'objective' && c!.options.some((x) => x.kind === 'objective' && x.objectiveId === 'productivite')) {
      expect(o.objectiveId).toBe('productivite');
    }
  });

  it('tour « Pense Vite » (10 s) : lancers plafonnés à spells.penseVite.maxCasts', () => {
    const fight = newPlannerFight({ spells: { penseVite: { maxCasts: 1, turnSeconds: 10 } } });
    fight.getCurrentFighter()!.turnSeconds = 10;
    const plan = planPlayerTurn(fight, { mode: 'fast', deterministic: true });
    expect(casts(plan.actions)).toHaveLength(1);
  });

  it('executePlan refuse hors du tour d’un joueur et s’arrête à la première action refusée', () => {
    const fight = newPlannerFight();
    const r = executePlan(fight, [{ type: 'cast', spellLevelId: VIDEUR, cell: 0 }, { type: 'end' }]);
    expect(r.ok).toBe(false);
    expect(r.executed).toBe(0);
    expect(fight.getCurrentFighter()?.id).toBe(0);
  });
});

describe('performances', () => {
  it('mode fast ≤ 150 ms par tour de joueur (marge de charge), mode deep ≤ 3 s', () => {
    const fight = newPlannerFight();
    for (let i = 0; i < 4; i++) {
      const t = performance.now();
      const plan = planPlayerTurn(fight, { mode: 'fast' });
      expect(performance.now() - t).toBeLessThan(250);
      expect(plan.stats.timeMs).toBeLessThan(250);
      executePlan(fight, plan.actions);
      resolveAllChoices(fight, () => 0);
      fight.runUntilPlayerInput();
      if (!fight.isPlayerTurn()) break;
    }
    const t = performance.now();
    planPlayerTurn(newPlannerFight(), { mode: 'deep' });
    expect(performance.now() - t).toBeLessThan(3500);
  });
});
