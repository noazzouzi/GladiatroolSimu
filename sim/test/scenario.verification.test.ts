/**
 * Vérification adversariale du scénario (docs/VERIFICATION.md, section « Scénario ») : contrôles indépendants,
 * point par point, contre ETUDE §2 (déroulé, timeline, vagues), §3 (carte), §4.1 / §4.5 (sorts, Acclamations), §6
 * (Mama), §7 (objectifs), §8 (cadeaux) et SPEC §10-§12. Chaque attendu est écrit à partir de l'étude ou des données
 * brutes, pas relu dans le code du scénario.
 */
import { describe, expect, it } from 'vitest';
import { gameData, loadConfig, type ArchetypeKey, type ObjectiveId } from '../src/data/index.js';
import {
  applyDamage,
  castSpell,
  enterMarksAt,
  finishAction,
  learnSpell,
  placeFighter,
  resolveSpell,
  Stat,
  type Fighter,
  type FightEvent,
} from '../src/engine/index.js';
import { cellToXY, distance, xyToCell } from '../src/geometry/index.js';
import {
  activateObjective,
  computeTimeline,
  createGladiatroolFight,
  flushScenario,
  giftCells,
  resolveAllChoices,
  spawnWave,
  trackingStartsAtActivation,
  type ChoiceOption,
  type GladiatroolFight,
} from '../src/scenario/index.js';
import { advanceUntil, DET, kill, newFight, QUIET, troolls, untilPlayerTurn } from './helpers/scenarioSetup.js';

const TROOLLIBRE = 7981;
const ARTROOLLEUR = 7982;
const NITROOLL = 7983;

function done(fight: GladiatroolFight): string[] {
  return fight.scenario.completed.map((c) => c.objectiveId);
}

/** Case (x, y) du repère MapPoint (ETUDE §3.2). */
function xy(x: number, y: number): number {
  return xyToCell(x, y);
}

/** Tue un combattant par des dommages directs de ``source`` (vraie résolution du moteur : déclencheurs, crochets). */
function strike(fight: GladiatroolFight, source: Fighter, target: Fighter, amount: number, collision = false): void {
  applyDamage(fight.state, source, target, amount, { actionId: 100, collision, melee: false });
  finishAction(fight.state);
  flushScenario(fight.state);
}

/** Place les joueurs (dans l'ordre de jeu) sur ``cells`` sans conflit de case (passage par des cases libres). */
function placeAll(fight: GladiatroolFight, cells: readonly number[]): void {
  const ps = fight.getPlayers();
  for (const p of ps) {
    const free = fight.ctx.grid.walkableCells.find((c) => !fight.state.isOccupied(c) && !cells.includes(c) && !fight.ctx.grid.isSpike(c))!;
    placeFighter(fight.state, p, free);
  }
  ps.forEach((p, i) => placeFighter(fight.state, p, cells[i]!));
}

/** Met un combattant sur une case et applique les marques (pics) comme une arrivée. */
function moveInto(fight: GladiatroolFight, f: Fighter, cell: number): void {
  placeFighter(fight.state, f, cell);
  enterMarksAt(fight.state, f);
  flushScenario(fight.state);
}

// =============================================================================================
// Timeline (ETUDE §2.4, Q1)
// =============================================================================================

describe('timeline (ETUDE §2.4)', () => {
  it('modèle par défaut : Mama, J1, M1, J2, M2, J3, M3, J4, M4, M5… (Troolls par ordre d’apparition)', () => {
    const fight = newFight(QUIET);
    const sc = fight.scenario;
    const [j1, j2, j3, j4] = sc.playerIds;
    const [t1, t2] = troolls(fight).map((t) => t.id);
    // T1 : V1 = 2 Troollibres (242 puis 358)
    expect(fight.state.fighters[t1!]!.cell).toBe(242);
    expect(fight.getTimeline().ids).toEqual([sc.mamaId, j1, t1, j2, t2, j3, j4]);
    untilPlayerTurn(fight, 2, 0);
    const v2 = sc.waves.find((w) => w.wave === 2)!.fighterIds;
    // V2 dans l'ordre de la composition des données (1 Troollibre puis 2 Artroolleurs)
    expect(v2.map((id) => fight.state.fighters[id]!.monsterId)).toEqual([TROOLLIBRE, ARTROOLLEUR, ARTROOLLEUR]);
    expect(fight.getTimeline().ids).toEqual([sc.mamaId, j1, t1, j2, t2, j3, v2[0], j4, v2[1], v2[2]]);
  });

  it('la Mama joue en tête même quand son tour est annulé ; un monstre mort libère sa place au tour global suivant', () => {
    const fight = newFight(QUIET);
    const sc = fight.scenario;
    const [t1, t2] = troolls(fight);
    kill(fight, [t1!]);
    // pendant le tour : la timeline du tour en cours n'est pas réordonnée
    expect(fight.getTimeline().ids).toContain(t1!.id);
    untilPlayerTurn(fight, 2, 0);
    const ids = fight.getTimeline().ids;
    expect(ids[0]).toBe(sc.mamaId);
    expect(ids).not.toContain(t1!.id);
    expect(ids[2]).toBe(t2!.id); // M1 = le premier Trooll vivant
  });

  it('les joueurs jouent dans l’ordre de la mise en place ; un joueur mort garde sa place (timeline.deadPlayersKeepSlot) ou la perd', () => {
    for (const keep of [true, false]) {
      const fight = newFight({ ...QUIET, timeline: { deadPlayersKeepSlot: keep } }, {
        players: (['magicien', 'acrobate', 'dompteur', 'acrobate'] as ArchetypeKey[]).map((archetype) => ({ archetype })),
      });
      const ps = fight.getPlayers();
      expect(ps.map((p) => p.archetype)).toEqual(['magicien', 'acrobate', 'dompteur', 'acrobate']);
      kill(fight, [ps[2]!]);
      untilPlayerTurn(fight, 2, 0);
      expect(fight.getTimeline().ids.includes(ps[2]!.id)).toBe(keep);
    }
  });

  it('alternate_initiative : Troolls triés par Force (Troollibre 4 000 > Nitrooll 3 500 > Artroolleur 3 000)', () => {
    const fight = newFight({ ...QUIET, timeline: { model: 'alternate_initiative' } });
    untilPlayerTurn(fight, 4, 0);
    const monsters = fight.getTimeline().ids.map((id) => fight.state.fighters[id]!).filter((f) => f.team === 'monsters' && f.id !== fight.scenario.mamaId);
    const str = monsters.map((m) => m.stat(Stat.STRENGTH));
    expect(str).toEqual([...str].sort((a, b) => b - a));
    expect(new Set(monsters.map((m) => m.monsterId))).toEqual(new Set([TROOLLIBRE, ARTROOLLEUR, NITROOLL]));
  });

  it('invocation (Poutch de Soutien Stratégique) : joue juste après son invocateur, y compris aux tours globaux suivants', () => {
    const fight = newFight(QUIET);
    const acro = fight.getCurrentFighter()!;
    learnSpell(fight.state, acro, 80509);
    const cell = fight.getCastableCells(80509).find((c) => !fight.state.isOccupied(c))!;
    expect(fight.playerCast(80509, cell).ok).toBe(true);
    const poutch = fight.state.fighters.find((f) => f.isSummon && f.summonerId === acro.id)!;
    expect(poutch).toBeDefined();
    const ids = fight.getTimeline().ids;
    expect(ids[ids.indexOf(acro.id) + 1]).toBe(poutch.id);
    untilPlayerTurn(fight, 2, 1);
    const ids2 = fight.getTimeline().ids;
    expect(ids2[ids2.indexOf(acro.id) + 1]).toBe(poutch.id);
    expect(computeTimeline(fight.state, fight.scenario)).toEqual(ids2);
  });
});

// =============================================================================================
// Moments du tour global (ETUDE §2.1, §2.2)
// =============================================================================================

interface TurnDigest {
  acclamations: number;
  waves: number[];
  gifts: number;
  firstTurnStart: number;
  mamaCell: number;
  canFinish: boolean;
  order: string[];
}

/** Joue T1 → T11 (joueurs passifs, monstres passifs) et résume chaque tour global à partir du journal. */
function digestTurns(overrides = {}): { fight: GladiatroolFight; digest: Map<number, TurnDigest> } {
  const fight = newFight({ ...DET, gifts: { spawnProbability: 1 }, ...overrides });
  const digest = new Map<number, TurnDigest>();
  advanceUntil(fight, (f) => f.turn === 11 && f.isPlayerTurn(), () => 0, 5000);
  let cur: TurnDigest | null = null;
  const sc = fight.scenario;
  let turn = 0;
  for (const e of fight.state.log!.events as FightEvent[]) {
    if (e.type === 'globalTurn') {
      turn = e.turn;
      cur = { acclamations: 0, waves: [], gifts: 0, firstTurnStart: -1, mamaCell: -1, canFinish: false, order: [] };
      digest.set(turn, cur);
      continue;
    }
    if (!cur) continue;
    if (e.type === 'choice' && e.choiceListId === 17) {
      cur.acclamations++;
      if (!cur.order.includes('acclamations')) cur.order.push('acclamations');
    } else if (e.type === 'waveSpawned') {
      cur.waves.push(e.wave);
      cur.order.push('wave');
    } else if (e.type === 'giftSpawned') {
      cur.gifts++;
      cur.order.push('gift');
    } else if (e.type === 'stateAdded' && e.stateId === 5965 && e.targetId === sc.sceId) {
      cur.canFinish = true;
      cur.order.push('canFinish');
    } else if (e.type === 'turnStart' && cur.firstTurnStart < 0) {
      cur.firstTurnStart = e.fighterId;
      cur.order.push('turns');
    } else if (e.type === 'move' && e.fighterId === sc.mamaId) {
      cur.mamaCell = e.to;
    }
  }
  return { fight, digest };
}

describe('déroulé du tour global (ETUDE §2.1, §2.2)', () => {
  it('T1 : ni Acclamation ni cadeau ; T2–T9 : Acclamations (4 fenêtres) puis vague puis cadeau ; V8 absente ; T10 : V10 puis 30577', () => {
    const { fight, digest } = digestTurns();
    const sc = fight.scenario;
    for (let t = 1; t <= 11; t++) {
      const d = digest.get(t)!;
      expect(d.firstTurnStart, `T${t} : la Mama joue en premier`).toBe(sc.mamaId);
      expect(d.acclamations, `T${t} : fenêtres d'Acclamation`).toBe(t >= 2 && t <= 9 ? 4 : 0);
      const wave = [2, 3, 4, 5, 6, 7, 9, 10].includes(t) ? [t] : [];
      expect(d.waves, `T${t} : vague`).toEqual(wave);
      expect(d.gifts > 0, `T${t} : cadeau (probabilité 1)`).toBe(t >= 2 && t <= 9 && d.gifts > 0);
      expect(d.canFinish, `T${t} : combatCanFinish`).toBe(t === 10);
      const expectedOrder = [
        ...(t >= 2 && t <= 9 ? ['acclamations'] : []),
        ...(wave.length ? ['wave'] : []),
        ...(d.gifts ? ['gift'] : []),
        ...(t === 10 ? ['canFinish'] : []),
        'turns',
      ];
      expect(d.order, `T${t} : ordre`).toEqual(expectedOrder);
    }
    // arrivée de la Mama au début de SON tour du T8 (le premier du tour global), sur 300
    expect(digest.get(8)!.mamaCell).toBe(300);
    for (let t = 1; t <= 7; t++) expect(digest.get(t)!.mamaCell).toBe(-1);
    expect(sc.waves.map((w) => w.wave)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10]);
    expect(sc.waves.map((w) => w.turn)).toEqual([0, 2, 3, 4, 5, 6, 7, 9, 10]);
    // 31 Troolls + la Mama (ETUDE §2.3 : 11 Troollibres, 11 Artroolleurs, 9 Nitroolls)
    const all = sc.waves.flatMap((w) => w.fighterIds.map((id) => fight.state.fighters[id]!.monsterId));
    expect([TROOLLIBRE, ARTROOLLEUR, NITROOLL].map((m) => all.filter((x) => x === m).length)).toEqual([11, 11, 9]);
  });

  it('30710 en fin de tour global : validation datée du tour qui s’achève ; le vote précède la fenêtre d’Acclamation suivante', () => {
    const fight = newFight({ ...DET, gifts: { spawnProbability: 0 } });
    activateObjective(fight.state, 'stop_projectiles');
    const seen: number[] = [];
    advanceUntil(
      fight,
      (f) => f.turn === 2 && f.isPlayerTurn(),
      (c) => {
        seen.push(c.choiceListId);
        return 0;
      },
    );
    expect(fight.scenario.completed.map((c) => [c.objectiveId, c.turn])).toEqual([['stop_projectiles', 1]]);
    // vote (liste 13 : palier 3 → 4) puis les 4 fenêtres d'Acclamation du T2
    expect(seen).toEqual([13, 17, 17, 17, 17]); // vote de la liste 10 + palier (3 → objectifs du palier 4)
  });

  it('Mama : tours T1–T6 annulés (140), T7 passé sur 152 sans 5971, arrivée au T8 ; invulnérable (56) jusqu’à son entrée dans les pics', () => {
    const fight = newFight(QUIET);
    const mama = fight.getMama()!;
    const states: [number, boolean, boolean, number][] = [];
    for (let t = 1; t <= 8; t++) {
      untilPlayerTurn(fight, t, 0);
      states.push([t, mama.hasState(5971), mama.hasState(56), mama.cell]);
    }
    expect(states).toEqual([
      [1, true, true, 152],
      [2, true, true, 152],
      [3, true, true, 152],
      [4, true, true, 152],
      [5, true, true, 152],
      [6, true, true, 152],
      [7, false, true, 152],
      [8, false, true, 300],
    ]);
    const cancelled = fight.state.log!.ofType('turnCancelled').filter((e) => e.fighterId === mama.id).length;
    expect(cancelled).toBe(6);
    // invulnérable hors des pics : 0 dommage
    const dom = fight.getPlayers()[1]!;
    strike(fight, dom, mama, 5000);
    expect(mama.hp).toBe(150000);
    // entrée dans les pics : fenêtre d'un tour (2 000 d'entrée subis, puis ×2)
    moveInto(fight, mama, 131);
    expect(mama.hasState(5902)).toBe(true);
    expect(mama.hp).toBe(148000);
    strike(fight, dom, mama, 1000);
    expect(mama.hp).toBe(146000);
    // au début de son tour suivant : de nouveau invulnérable (glyphe de début de tour absorbé)
    advanceUntil(fight, (f) => f.turn === 9 && f.getCurrentFighter()?.id === mama.id);
    expect(mama.hp).toBe(146000);
    strike(fight, dom, mama, 1000);
    expect(mama.hp).toBe(146000);
  });

  it('victoire seulement si tous les ennemis sont morts ET 5965 posé ; défaite quand plus aucun joueur ; la mort de la Mama ne termine rien', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 9, 0);
    kill(fight, fight.getLivingMonsters());
    expect(fight.isEnded()).toBe(false);
    untilPlayerTurn(fight, 10, 0);
    expect(troolls(fight)).toHaveLength(6);
    kill(fight, troolls(fight).slice(0, 5));
    expect(fight.isEnded()).toBe(false);
    kill(fight, troolls(fight));
    expect(fight.getStatus()).toEqual({ kind: 'ended', winner: 'players', reason: 'victory' });
    // un seul survivant suffit
    const g = newFight(QUIET);
    untilPlayerTurn(g, 10, 0);
    kill(g, g.getPlayers().slice(1));
    kill(g, g.getLivingMonsters());
    expect(g.getStatus()).toEqual({ kind: 'ended', winner: 'players', reason: 'victory' });
  });
});

// =============================================================================================
// Vagues : tirage des cases (ETUDE §2.3, SPEC §11.2, Q5)
// =============================================================================================

describe('apparitions (ETUDE §2.3)', () => {
  it('V2 : fréquences des groupes conformes aux poids observés (187:188 = 5:6, 411:412 = 3:8, 242:358:246 = 3:4:2)', () => {
    const fight = newFight(QUIET);
    const wave = gameData.scenario.waves.find((w) => w.n === 2)!;
    const counts = new Map<number, number>();
    const n = 1500;
    for (let i = 0; i < n; i++) {
      const c = fight.clone({ keepLog: false });
      kill(c, troolls(c)); // 242 et 358 libres
      c.scenario.seed = 1000 + i;
      for (const f of spawnWave(c.state, wave)) counts.set(f.cell, (counts.get(f.cell) ?? 0) + 1);
    }
    const p = (cell: number) => (counts.get(cell) ?? 0) / n;
    const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.05);
    close(p(187), 5 / 11);
    close(p(188), 6 / 11);
    close(p(411), 3 / 11);
    close(p(412), 8 / 11);
    close(p(242), 3 / 9);
    close(p(358), 4 / 9);
    close(p(246), 2 / 9);
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([187, 188, 242, 246, 358, 411, 412]);
  });

  it('cases occupées exclues (spawn.excludeOccupied), jamais dans les pics, jamais deux monstres sur la même case, types respectés', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const fight = newFight(QUIET, { seed, options: { scenarioSeed: seed } });
      // on occupe les cases les plus probables de V2 avec les joueurs
      const [a, b, c, d] = fight.getPlayers();
      placeFighter(fight.state, a!, 188);
      placeFighter(fight.state, b!, 412);
      placeFighter(fight.state, c!, 246);
      placeFighter(fight.state, d!, 187);
      kill(fight, troolls(fight));
      untilPlayerTurn(fight, 2, 0);
      const w2 = fight.scenario.waves.find((w) => w.wave === 2)!;
      expect(w2.cells.every((cell) => ![188, 412, 246, 187].includes(cell))).toBe(true);
      // Artroolleur 1 forcé sur 411 ; le second sur la case libre hors pics la plus proche de son groupe (repli)
      const arts = w2.fighterIds.map((id) => fight.state.fighters[id]!).filter((f) => f.monsterId === ARTROOLLEUR);
      expect(arts.map((f) => f.cell)).toContain(411);
      for (let t = 3; t <= 10; t++) {
        if (t === 8) continue;
        untilPlayerTurn(fight, t, 0);
      }
      const cells = fight.scenario.waves.flatMap((w) => w.cells);
      for (const w of fight.scenario.waves) {
        const data = gameData.scenario.waves.find((x) => x.n === w.wave)!;
        const types = w.fighterIds.map((id) => fight.state.fighters[id]!.monsterId).sort();
        const expected = data.composition.flatMap((c2) => new Array<number>(c2.count).fill(c2.monsterId)).sort();
        expect(types).toEqual(expected);
      }
      for (const cell of cells) expect(fight.ctx.grid.isSpike(cell)).toBe(false);
      for (const w of fight.scenario.waves) expect(new Set(w.cells).size).toBe(w.cells.length);
    }
  });

  it('mêmes graines de scénario → mêmes vagues et mêmes cadeaux, quels que soient les jets de combat', () => {
    const a = newFight({ ...DET, gifts: { spawnProbability: 0.72 } }, { seed: 5, options: { scenarioSeed: 77 } });
    const b = newFight({ ...DET, gifts: { spawnProbability: 0.72 } }, { seed: 6, options: { scenarioSeed: 77 } });
    for (const f of [a, b]) advanceUntil(f, (x) => x.turn === 10 && x.isPlayerTurn(), () => 0, 5000);
    expect(b.scenario.waves.map((w) => w.cells)).toEqual(a.scenario.waves.map((w) => w.cells));
    expect(b.state.log!.ofType('giftSpawned')).toEqual(a.state.log!.ofType('giftSpawned'));
  });
});

// =============================================================================================
// Rassemblement (ETUDE §6.5, Q10) en situation de combat
// =============================================================================================

describe('Rassemblement à l’arrivée (ETUDE §6.4, §6.5)', () => {
  /** Fin du T7 : Troolls tués, joueurs et Trooll placés, puis début du T8 (arrivée + Rassemblement). */
  function arrive(cells: number[], trollCell: number | null, over = {}): { fight: GladiatroolFight; troll: Fighter | null } {
    const fight = newFight({ ...QUIET, ...over });
    untilPlayerTurn(fight, 7, 3);
    const ts = troolls(fight);
    const troll = trollCell === null ? null : ts[0]!;
    kill(fight, ts.filter((t) => t !== troll));
    if (troll) placeFighter(fight.state, troll, trollCell!);
    placeAll(fight, cells);
    fight.endTurn();
    expect(fight.turn).toBe(8);
    return { fight, troll };
  }

  it('attirer PUIS repousser (boss.rassemblementPullThenPush) : le Trooll attiré arrête le joueur ; ordre inverse sinon', () => {
    // axe y = −4 vers l'est : 315 (joueur), 358 (Trooll) ; les autres joueurs hors des lignes
    const off = [244, 230, 216];
    const pullFirst = arrive([315, ...off], 358);
    const p1 = pullFirst.fight.getPlayers()[0]!;
    // le Trooll est attiré jusqu'au joueur (329), le joueur ne peut plus reculer : il reste sur 315
    expect(pullFirst.troll!.cell).toBe(329);
    expect(p1.cell).toBe(315);
    expect(p1.hp).toBe(30000);
    const pushFirst = arrive([315, ...off], 358, { boss: { rassemblementPullThenPush: false } });
    const p2 = pushFirst.fight.getPlayers()[0]!;
    // le joueur est repoussé jusqu'au Trooll (344), qui ne peut plus être attiré
    expect(p2.cell).toBe(344);
    expect(pushFirst.troll!.cell).toBe(358);
  });

  it('aucun dommage de collision pour les joueurs (1103) ; seuls les 2 000 d’entrée dans les pics ; Grabbed (5918)', () => {
    const { fight } = arrive([314, 286, 244, 230], null);
    const [a, b, c, d] = fight.getPlayers();
    expect([a!.cell, b!.cell]).toEqual([408, 184]);
    for (const p of [a!, b!]) {
      expect(p.hp).toBe(28000);
      expect(p.hasState(5918)).toBe(true);
      expect(p.hasState(5994)).toBe(true);
    }
    for (const p of [c!, d!]) {
      expect(p.hp).toBe(30000);
      expect(p.hasState(5918)).toBe(false);
    }
  });
});

// =============================================================================================
// Faveur de la foule (ETUDE §6.7)
// =============================================================================================

describe('Faveur de la foule (ETUDE §6.7)', () => {
  it('un objectif réussi alors que la Mama est morte ne lève pas d’erreur et ne change rien (masque F7984)', () => {
    const fight = newFight(QUIET);
    const mama = fight.getMama()!;
    kill(fight, [mama]);
    expect(fight.debugCompleteObjective()).toBe(true);
    expect(fight.scenario.completed).toHaveLength(1);
    expect(mama.stat(Stat.FINAL_DAMAGE)).toBe(25);
    expect(fight.getPendingChoice()?.choiceListId).toBe(11);
  });
});

// =============================================================================================
// Récompenses : ordre des sorts (ETUDE §4.1, Spell Manager 30626)
// =============================================================================================

describe('récompenses (ETUDE §4.1, N30 §7.1)', () => {
  /** Ordre de l'étude (§4.1), en ids de SORT. */
  const ORDER: Record<ArchetypeKey, number[]> = {
    dompteur: [30416, 30395, 30396, 30397, 30398, 30399, 30400, 30401],
    acrobate: [30416, 30402, 30408, 30404, 30405, 30406, 30403, 30407],
    magicien: [30416, 30409, 30410, 30411, 30414, 30415, 30412, 30413],
  };
  const STATE: Record<ArchetypeKey, number> = { dompteur: 5899, acrobate: 5900, magicien: 5901 };

  it('chaque objectif apprend à chaque joueur le sort suivant de son archétype : ordre de l’étude et des niveaux du Spell Manager', () => {
    const fight = newFight(QUIET, {
      players: (['acrobate', 'dompteur', 'magicien', 'acrobate'] as ArchetypeKey[]).map((archetype) => ({ archetype })),
    });
    const managerLevels = gameData.scenario.objectives.manager.reward.spellManagerLevelByTier;
    for (let k = 1; k <= 6; k++) {
      fight.debugCompleteObjective();
      for (const p of fight.getPlayers()) {
        const key = p.archetype!;
        const ids = p.spells.map((s) => fight.ctx.getSpell(s.spellLevelId).spellId);
        expect(ids, `${p.name} après ${k} objectif(s)`).toEqual(ORDER[key].slice(0, 2 + k));
        // niveau appris = effet 3405 du Spell Manager de ce palier filtré par l'état d'archétype
        const lvl = gameData.spells[String(managerLevels[k - 1])]!;
        const learn = lvl.effects.filter((e) => e.effectId === 3405 && e.targetMask.includes(`E${STATE[key]}`));
        expect(learn).toHaveLength(1);
        expect(p.spells.at(-1)!.spellLevelId).toBe(learn[0]!.value);
      }
      const v = fight.getPendingChoice();
      if (v) fight.resolveChoice(v.uid, 0);
    }
  });

  it('un joueur mort au moment de la récompense n’apprend pas le sort (Spell Manager : alliés vivants) ; les autres oui', () => {
    const fight = newFight(QUIET);
    const [a, b] = fight.getPlayers();
    kill(fight, [b!]);
    fight.debugCompleteObjective(a!.id);
    expect(a!.spells).toHaveLength(3);
    expect(b!.spells).toHaveLength(2);
  });
});

// =============================================================================================
// Cadeaux : cartes proposées (ETUDE §8, Q14)
// =============================================================================================

describe('cadeaux : cartes (ETUDE §8.1, Q14)', () => {
  /** Joueurs sur les cases de cadeau : ramasse un cadeau posé sur ``cell`` en y marchant. */
  function pickGift(fight: GladiatroolFight, cell: number): void {
    const f = fight.getCurrentFighter()!;
    const sc = fight.scenario;
    resolveSpell(fight.state, fight.state.fighters[sc.sceId]!, fight.ctx.getSpell(gameData.scenario.gifts.spellLevel), cell, { depth: 1 });
    finishAction(fight.state);
    const r = fight.playerMove(cell);
    expect(r.ok, r.reason).toBe(true);
    expect(f.cell).toBe(cell);
  }

  function validCards(fight: GladiatroolFight, p: Fighter, options: readonly ChoiceOption[]): void {
    const a = p.archetypeData!;
    for (const o of options) {
      if (o.kind === 'unique') {
        expect(a.uniques, `${p.name} : unique de son archétype ou Pense Vite`).toContain(o.spellLevelId);
        expect(p.knowsSpell(o.spellLevelId)).toBe(false);
        expect(fight.scenario.hasObtainedUnique(p.id, o.spellLevelId)).toBe(false);
      } else if (o.kind === 'upgrade') {
        const slot = p.spells.find((s) => s.spellLevelId === o.baseSpellLevelId);
        expect(slot, `${p.name} : amélioration d'un sort possédé`).toBeDefined();
        expect(slot!.upgraded).toBe(false);
        expect(a.upgrades[String(o.baseSpellLevelId)]!.to).toBe(o.upgradedSpellLevelId);
      } else throw new Error(`carte inattendue : ${o.kind}`);
    }
    const keys = options.map((o) => (o.kind === 'unique' ? `u${o.spellLevelId}` : o.kind === 'upgrade' ? `a${o.baseSpellLevelId}` : ''));
    expect(new Set(keys).size).toBe(keys.length);
  }

  it('2 cartes par joueur, valides (uniques + Pense Vite non obtenus, améliorations de sorts possédés non améliorés), jusqu’à épuisement', () => {
    const fight = newFight(QUIET);
    const acro = fight.getCurrentFighter()!;
    acro.mpUsed = -1000; // déplacements illimités (test)
    const pool = [272, 273, 299, 301, 327, 328, 329];
    let upgradesTaken = 0;
    let gifts = 0;
    for (let k = 0; k < 40; k++) {
      pickGift(fight, pool[k % pool.length]!);
      const choices = fight.getPendingChoices();
      expect(choices.every((c) => c.choiceListId === 10)).toBe(true);
      // un joueur sans aucune carte possible n'a pas de fenêtre (choix retiré) : on le vérifie
      for (const id of fight.scenario.playerIds) {
        const p = fight.state.fighters[id]!;
        const c = choices.find((x) => x.fighterId === id);
        const uniques = p.archetypeData!.uniques.filter((u) => !p.knowsSpell(u) && !fight.scenario.hasObtainedUnique(id, u));
        const upgrades = p.spells.filter((sl) => !sl.upgraded && p.archetypeData!.upgrades[String(sl.spellLevelId)]);
        if (!c) expect(uniques.length + upgrades.length, `${p.name} : fenêtre absente alors que des cartes existent`).toBe(0);
        else {
          expect(c.options.length).toBe(Math.min(2, uniques.length + upgrades.length));
          validCards(fight, p, c.options);
        }
      }
      if (!choices.length) break;
      gifts++;
      // amélioration en priorité quand il y en a une
      for (const c of fight.getPendingChoices()) {
        const i = c.options.findIndex((o) => o.kind === 'upgrade');
        if (i >= 0) upgradesTaken++;
        expect(fight.resolveChoice(c.uid, i >= 0 ? i : 0).ok).toBe(true);
      }
      if (k % 3 === 2 && fight.scenario.active) fight.debugCompleteObjective(acro.id);
      const v = fight.getPendingChoice();
      if (v && v.scope === 'global') fight.resolveChoice(v.uid, 0);
    }
    expect(gifts).toBeGreaterThan(7);
    expect(upgradesTaken).toBeGreaterThan(0);
    // aucun sort amélioré deux fois, aucun unique obtenu deux fois
    for (const p of fight.getPlayers()) {
      const upgraded = p.spells.filter((sl) => sl.upgraded).map((sl) => sl.spellId);
      expect(new Set(upgraded).size).toBe(upgraded.length);
      const obtained = fight.scenario.obtainedUniques.filter((_, i, a) => i % 2 === 1 && a[i - 1] === p.id);
      expect(new Set(obtained).size).toBe(obtained.length);
    }
  });

  it('seul le cadeau ramassé disparaît ; un monstre qui marche dessus ne le déclenche pas (masque Atq,A)', () => {
    const fight = newFight(QUIET);
    const sc = fight.scenario;
    const sce = fight.state.fighters[sc.sceId]!;
    for (const cell of [272, 329]) resolveSpell(fight.state, sce, fight.ctx.getSpell(gameData.scenario.gifts.spellLevel), cell, { depth: 1 });
    finishAction(fight.state);
    const t = troolls(fight)[0]!;
    moveInto(fight, t, 329);
    expect(fight.getPendingChoices()).toHaveLength(0);
    expect(giftCells(fight.state, sc).sort()).toEqual([272, 329]);
    const acro = fight.getCurrentFighter()!;
    acro.mpUsed = -100;
    expect(fight.playerMove(272).ok).toBe(true);
    expect(fight.getPendingChoices()).toHaveLength(4);
    expect(giftCells(fight.state, sc)).toEqual([329]);
  });
});

// =============================================================================================
// Installation du suivi des objectifs (lue dans les données : déclencheurs I / TB)
// =============================================================================================

describe('objectifs : installation du suivi à l’activation (déclencheurs I / TB des données)', () => {
  it('table lue dans les niveaux de sort des objectifs', () => {
    const immediate = gameData.scenario.objectives.list.filter((o) => trackingStartsAtActivation(gameData, o)).map((o) => o.id).sort();
    expect(immediate).toEqual(['au_coin', 'distance_insecurite', 'ebranlable', 'faire_le_mur', 'meurtres_serie', 'pas_le_temps', 'sol_glissant'].sort());
  });

  it('Productivité votée pendant le tour du Magicien : ses lancers ne comptent qu’à partir de son tour suivant (TB)', () => {
    const fight = newFight(QUIET);
    const mag = untilPlayerTurn(fight, 1, 3);
    fight.debugCompleteObjective(mag.id); // Empalé → Regain
    fight.resolveChoice(fight.getPendingChoice()!.uid, 0);
    activateObjective(fight.state, 'productivite');
    for (const sl of [80515, 80514, 80514]) expect(fight.playerCast(sl, mag.cell).ok).toBe(true);
    expect(done(fight)).toEqual(['empale']);
    untilPlayerTurn(fight, 2, 3);
    for (const sl of [80515, 80514]) expect(fight.playerCast(sl, mag.cell).ok || fight.playerCast(80499, fight.getCastableCells(80499)[0]!).ok).toBe(true);
    expect(done(fight)).toEqual(['empale']);
    const cells = fight.getCastableCells(80499);
    expect(fight.playerCast(80499, cells[0]!).ok).toBe(true);
    expect(done(fight)).toEqual(['empale', 'productivite']);
  });

  it('Pas le temps de dire « Aïe » voté pendant un tour (I|TB) : les ennemis à PV pleins sont marqués aussitôt', () => {
    const fight = newFight(QUIET);
    const j1 = fight.getCurrentFighter()!;
    const [t1, t2] = troolls(fight);
    strike(fight, j1, t2!, 100); // t2 blessé avant l'activation
    activateObjective(fight.state, 'pas_le_temps');
    strike(fight, j1, t2!, 50000);
    expect(done(fight)).toEqual([]);
    strike(fight, j1, t1!, 50000);
    expect(done(fight)).toEqual(['pas_le_temps']);
  });

  it('Quintuplé voté pendant un tour (TB) : les morts du tour en cours ne comptent pas', () => {
    const fight = newFight(QUIET);
    untilPlayerTurn(fight, 2, 0);
    activateObjective(fight.state, 'quintuple');
    const j1 = fight.getCurrentFighter()!;
    kill(fight, troolls(fight), j1.id);
    expect(fight.getActiveObjective()?.globalKills).toBe(0);
    expect(done(fight)).toEqual([]);
  });
});

// =============================================================================================
// Les 21 objectifs : un cas qui valide, un cas qui ne valide pas (ETUDE §7.2, N30 §5.3)
// =============================================================================================

/**
 * Active ``id`` (au tour du joueur ``activateAt`` = [tour, rang], défaut : tout de suite) puis amène le combat au tour du
 * joueur ``index`` au tour global ``turn`` (suivi « pendant le tour » installé).
 */
function armedAt(id: ObjectiveId, turn: number, index: number, over = {}, activateAt?: [number, number]): { fight: GladiatroolFight; p: Fighter } {
  const fight = newFight({ ...QUIET, ...over });
  if (activateAt) untilPlayerTurn(fight, activateAt[0], activateAt[1]);
  activateObjective(fight.state, id);
  const p = untilPlayerTurn(fight, turn, index);
  expect(fight.getActiveObjective()?.id).toBe(id);
  return { fight, p };
}

describe('les 21 objectifs (ETUDE §7.2)', () => {
  it('Empalé : mort d’un ennemi Vulnérable (pics, quel que soit le tueur) — oui ; mort hors pics — non', () => {
    const yes = newFight(QUIET);
    const t = yes.state.fighterAt(242)!;
    t.hp = 1500;
    expect(yes.playerCast(80507, 256).ok).toBe(true); // Videur : 242 → 199, 2 000 d'entrée
    expect(t.alive).toBe(false);
    expect(yes.state.log!.ofType('death').find((e) => e.fighterId === t.id)!.killerId).toBe(yes.scenario.sceId);
    expect(done(yes)).toEqual(['empale']);
    const no = newFight(QUIET);
    strike(no, no.getCurrentFighter()!, troolls(no)[0]!, 30000);
    expect(done(no)).toEqual([]);
  });

  it('1,2,3, Soleil ! : tous finissent leur tour sur leur case de départ pendant un tour global complet — oui ; un déplacement — non', () => {
    const yes = armedAt('soleil', 2, 0).fight;
    untilPlayerTurn(yes, 3, 0);
    expect(yes.scenario.completed.map((c) => [c.objectiveId, c.turn])).toEqual([['soleil', 2]]);
    const { fight: no } = armedAt('soleil', 2, 2);
    const p = no.getCurrentFighter()!;
    const dest = no.getCastableCells(80499).find((c) => !no.state.isOccupied(c) && distance(c, p.cell) === 1 && !no.ctx.grid.isSpike(c))!;
    expect(no.playerMove(dest).ok).toBe(true);
    untilPlayerTurn(no, 3, 0);
    expect(done(no)).toEqual([]);
  });

  it('Attention, sol glissant : ennemi achevé par des dommages de collision — oui ; par des dommages ordinaires — non', () => {
    const { fight: yes, p } = armedAt('sol_glissant', 2, 0);
    const t = troolls(yes)[0]!;
    t.hp = 300;
    strike(yes, p, t, 566, true);
    expect(done(yes)).toEqual(['sol_glissant']);
    const { fight: no, p: q } = armedAt('sol_glissant', 2, 0);
    strike(no, q, troolls(no)[0]!, 60000);
    expect(done(no)).toEqual([]);
  });

  it('Meurtres en série : le même joueur achève 2 ennemis dans son tour — oui ; 2 joueurs différents — non', () => {
    const { fight: yes, p } = armedAt('meurtres_serie', 2, 0);
    const [a, b] = troolls(yes);
    strike(yes, p, a!, 60000);
    expect(done(yes)).toEqual([]);
    strike(yes, p, b!, 60000);
    expect(done(yes)).toEqual(['meurtres_serie']);
    const { fight: no, p: q } = armedAt('meurtres_serie', 2, 0);
    const [c, d] = troolls(no);
    strike(no, q, c!, 60000);
    no.endTurn();
    no.runUntilPlayerInput();
    strike(no, no.getCurrentFighter()!, d!, 60000);
    expect(done(no)).toEqual([]);
  });

  it('Productivité : 3 sorts dans son tour — oui ; 2 — non', () => {
    const { fight: yes, p } = armedAt('productivite', 2, 1);
    p.apUsed = -10; // PA suffisants pour un 3e sort (test)
    for (let i = 0; i < 2; i++) expect(yes.playerCast(80499, yes.getCastableCells(80499)[0]!).ok).toBe(true);
    expect(done(yes)).toEqual([]);
    expect(yes.playerCast(80500, yes.getCastableCells(80500)[0]!).ok).toBe(true);
    expect(done(yes)).toEqual(['productivite']);
    const { fight: no } = armedAt('productivite', 2, 1);
    for (let i = 0; i < 2; i++) expect(no.playerCast(80499, no.getCastableCells(80499)[0]!).ok).toBe(true);
    no.endTurn();
    expect(done(no)).toEqual([]);
  });

  it('Ébranlable : ennemi mort en état Inébranlable (157) — oui ; sans — non', () => {
    const { fight: yes, p } = armedAt('ebranlable', 2, 0);
    const t = troolls(yes)[0]!;
    expect(castSpell(yes.state, t.id, 80485, t.cell, { ignoreConditions: true }).ok).toBe(true);
    expect(t.hasState(157)).toBe(true);
    strike(yes, p, t, 60000);
    expect(done(yes)).toEqual(['ebranlable']);
    const { fight: no, p: q } = armedAt('ebranlable', 2, 0);
    strike(no, q, troolls(no)[0]!, 60000);
    expect(done(no)).toEqual([]);
  });

  it('Toi, par ici, et toi, par là : Voltige depuis les pics — oui ; seul un ennemi entre dans les pics — non', () => {
    const run = (swap: boolean) => {
      const { fight, p } = armedAt('toi_par_ici', 2, 0);
      learnSpell(fight.state, p, 80510);
      const t = troolls(fight).find((x) => x.cell === 242) ?? troolls(fight)[0]!;
      placeFighter(fight.state, t, 242);
      moveInto(fight, p, 199);
      expect(p.hasState(5903)).toBe(true);
      if (swap) expect(fight.playerCast(80510, 242).ok).toBe(true);
      else moveInto(fight, t, 184);
      return fight;
    };
    expect(done(run(true))).toEqual(['toi_par_ici']);
    expect(done(run(false))).toEqual([]);
  });

  it('Stop aux projectiles : aucun Artroolleur à la fin du tour global — oui ; un Artroolleur vivant — non', () => {
    const { fight: yes } = armedAt('stop_projectiles', 2, 0, {}, [2, 0]);
    kill(yes, yes.getLivingMonsters().filter((m) => m.monsterId === ARTROOLLEUR));
    untilPlayerTurn(yes, 3, 0);
    expect(yes.scenario.completed.map((c) => [c.objectiveId, c.turn])).toEqual([['stop_projectiles', 2]]);
    const { fight: no } = armedAt('stop_projectiles', 2, 0, {}, [2, 0]);
    kill(no, no.getLivingMonsters().filter((m) => m.monsterId === ARTROOLLEUR).slice(1));
    untilPlayerTurn(no, 3, 0);
    expect(done(no)).toEqual([]);
  });

  it('Sauvez-le ! : le désigné (le plus blessé) a tous ses PV à la fin du tour global suivant — oui ; toujours blessé — non', () => {
    for (const heal of [true, false]) {
      const fight = newFight(QUIET);
      activateObjective(fight.state, 'sauvez_le');
      const [a, b] = fight.getPlayers();
      a!.hp = 20000; // 66 % : ≤ 70 %
      b!.hp = 5000; // 16 % : ≤ 20 % → désigné (premier palier atteint)
      untilPlayerTurn(fight, 2, 0);
      expect(fight.getActiveObjective()?.designatedId).toBe(b!.id);
      if (heal) b!.hp = b!.maxHp;
      untilPlayerTurn(fight, 3, 0);
      expect(done(fight)).toEqual(heal ? ['sauvez_le'] : []);
      if (!heal) expect(fight.getActiveObjective()?.designatedId).toBe(b!.id);
    }
  });

  it('Tout le monde veut prendre sa place : finir son tour sur la case marquée — oui ; ailleurs — non', () => {
    for (const onMark of [true, false]) {
      const { fight, p } = armedAt('prendre_sa_place', 2, 0);
      const mark = fight.getActiveObjective()!.markedCell;
      const enemies = fight.getLivingMonsters().filter((m) => !m.hasState(5971));
      expect(mark).toBe(enemies.reduce((best, m) => (distance(m.cell, p.cell) > distance(best.cell, p.cell) ? m : best)).cell);
      const target = fight.state.fighterAt(mark)!;
      kill(fight, [target]);
      placeFighter(fight.state, p, onMark ? mark : 300);
      fight.endTurn();
      expect(done(fight)).toEqual(onMark ? ['prendre_sa_place'] : []);
    }
  });

  it('Tout le monde veut prendre sa place au T7 : la Mama sur 152 (sans 5971) peut être l’ennemi marqué (objectives.mamaCountsFromTurn)', () => {
    for (const [from, expectMama] of [[7, true], [8, false]] as const) {
      const fight = newFight({ ...QUIET, objectives: { mamaCountsFromTurn: from } });
      untilPlayerTurn(fight, 6, 3);
      kill(fight, troolls(fight));
      activateObjective(fight.state, 'prendre_sa_place');
      untilPlayerTurn(fight, 7, 0);
      const t = troolls(fight)[0]!;
      placeFighter(fight.state, t, 300);
      untilPlayerTurn(fight, 7, 1);
      const mark = fight.getActiveObjective()!.markedCell;
      expect(mark === 152).toBe(expectMama);
    }
  });

  it('Faire le mur : 3 ennemis distincts subissent des dommages de collision dans le tour — oui ; 2 (dont un deux fois) — non', () => {
    const { fight: yes, p } = armedAt('faire_le_mur', 2, 0);
    const ms = troolls(yes);
    for (const t of ms.slice(0, 3)) strike(yes, p, t, 283, true);
    expect(done(yes)).toEqual(['faire_le_mur']);
    const { fight: no, p: q } = armedAt('faire_le_mur', 2, 0);
    const ns = troolls(no);
    for (const t of [ns[0]!, ns[1]!, ns[0]!]) strike(no, q, t, 283, true);
    strike(no, q, ns[2]!, 5000); // dommages ordinaires : ne comptent pas
    expect(done(no)).toEqual([]);
  });

  it('Pas le temps de dire « Aïe » : tuer un ennemi à PV pleins au début de son tour — oui ; blessé avant son tour — non', () => {
    const { fight: yes, p } = armedAt('pas_le_temps', 2, 0);
    const t = troolls(yes).at(-1)!;
    strike(yes, p, t, 1000);
    strike(yes, p, t, 60000);
    expect(done(yes)).toEqual(['pas_le_temps']);
    const { fight: no, p: j1 } = armedAt('pas_le_temps', 2, 0);
    const u = troolls(no).at(-1)!;
    strike(no, j1, u, 1000); // blessé pendant le tour de J1…
    const q = untilPlayerTurn(no, 2, 1);
    strike(no, q, u, 60000); // … tué par J2 : il n'était pas à PV pleins au début du tour de J2
    expect(done(no)).toEqual([]);
  });

  it('Distance d’insécurité : chaque Artroolleur à ≤ 3 cases d’un allié en fin de tour — oui ; un Artroolleur isolé — non', () => {
    for (const near of [true, false]) {
      const { fight, p } = armedAt('distance_insecurite', 2, 0, {}, [2, 0]);
      const arts = fight.getLivingMonsters().filter((m) => m.monsterId === ARTROOLLEUR);
      expect(arts).toHaveLength(2);
      const players = fight.getPlayers();
      for (let i = 0; i < arts.length; i++) {
        const a = arts[i]!;
        const [x, y] = cellToXY(a.cell);
        const c = [xy(x + 1, y), xy(x - 1, y), xy(x, y + 1), xy(x, y - 1)].find((cc) => cc >= 0 && fight.ctx.grid.isWalkable(cc) && !fight.state.isOccupied(cc))!;
        if (near || i === 0) placeFighter(fight.state, players[i]!, c);
      }
      if (!near) expect(Math.min(...players.map((q) => distance(q.cell, arts[1]!.cell)))).toBeGreaterThan(3);
      void p;
      fight.endTurn();
      expect(done(fight)).toEqual(near ? ['distance_insecurite'] : []);
    }
  });

  it('Attirance : tous les joueurs vivants attrapés par un même Rassemblement — oui ; un joueur hors des lignes — non', () => {
    for (const all of [true, false]) {
      const fight = newFight(QUIET);
      untilPlayerTurn(fight, 7, 3);
      kill(fight, troolls(fight));
      activateObjective(fight.state, 'attirance');
      const cells = all ? [314, 329, 273, 286] : [314, 329, 273, 244];
      placeAll(fight, cells);
      fight.endTurn();
      expect(fight.turn).toBe(8);
      expect(done(fight)).toEqual(all ? ['attirance'] : []);
    }
  });

  it('Trous dans les Troolls : 4 ennemis distincts entrent dans les pics pendant le tour — oui ; 3 (dont un deux fois) — non', () => {
    const spikes = [184, 198, 402, 416, 171];
    const { fight: yes } = armedAt('trous_troolls', 3, 0);
    const ms = troolls(yes);
    expect(ms.length).toBeGreaterThanOrEqual(4);
    ms.slice(0, 4).forEach((t, i) => moveInto(yes, t, spikes[i]!));
    expect(done(yes)).toEqual(['trous_troolls']);
    const { fight: no } = armedAt('trous_troolls', 3, 0);
    const ns = troolls(no);
    ns.slice(0, 3).forEach((t, i) => moveInto(no, t, spikes[i]!));
    moveInto(no, ns[0]!, 257); // sort des pics…
    moveInto(no, ns[0]!, spikes[4]!); // … et y rentre : ne compte qu'une fois
    expect(done(no)).toEqual([]);
  });

  it('D’une pierre trois coups : 3 morts entre deux lancers du joueur actif — oui ; 2 morts, un lancer, 1 mort — non', () => {
    const { fight: yes } = armedAt('pierre_trois_coups', 3, 0);
    expect(yes.playerCast(80499, yes.getCastableCells(80499)[0]!).ok).toBe(true);
    kill(yes, troolls(yes).slice(0, 3));
    expect(done(yes)).toEqual(['pierre_trois_coups']);
    const { fight: no } = armedAt('pierre_trois_coups', 3, 0);
    kill(no, troolls(no).slice(0, 2));
    expect(no.playerCast(80499, no.getCastableCells(80499)[0]!).ok).toBe(true);
    kill(no, troolls(no).slice(0, 1));
    expect(done(no)).toEqual([]);
  });

  it('Tout va bien : tous les joueurs à plus de 50 % en fin de tour global — oui ; un joueur à 50 % pile — non', () => {
    for (const hp of [15001, 15000]) {
      const fight = newFight(QUIET);
      activateObjective(fight.state, 'tout_va_bien');
      fight.getPlayers()[3]!.hp = hp;
      untilPlayerTurn(fight, 2, 0);
      expect(done(fight)).toEqual(hp > 15000 ? ['tout_va_bien'] : []);
    }
  });

  it('Solitude : la Mama seule en fin de tour global (avant son arrivée, défaut) — oui ; un Trooll vivant — non', () => {
    for (const alone of [true, false]) {
      const fight = newFight(QUIET);
      activateObjective(fight.state, 'solitude');
      kill(fight, alone ? troolls(fight) : troolls(fight).slice(1));
      untilPlayerTurn(fight, 2, 0);
      expect(done(fight)).toEqual(alone ? ['solitude'] : []);
    }
  });

  it('Quintuplé : 5 ennemis tués par des joueurs dans le même tour global — oui ; 4 au T3 et 1 au T4 — non', () => {
    const { fight: yes, p } = armedAt('quintuple', 3, 0);
    const ms = troolls(yes);
    expect(ms.length).toBeGreaterThanOrEqual(5);
    kill(yes, ms.slice(0, 3), p.id);
    const q = untilPlayerTurn(yes, 3, 1);
    kill(yes, troolls(yes).slice(0, 2), q.id);
    expect(done(yes)).toEqual(['quintuple']);
    const { fight: no, p: r } = armedAt('quintuple', 3, 0);
    kill(no, troolls(no).slice(0, 4), r.id);
    const s = untilPlayerTurn(no, 4, 0);
    kill(no, troolls(no).slice(0, 1), s.id);
    expect(done(no)).toEqual([]);
  });

  it('Au coin ! : tous les ennemis dans les pics en fin de tour — oui ; au T7 la Mama sur 152 compte (objectives.mamaCountsFromTurn) — non', () => {
    const { fight: yes } = armedAt('au_coin', 2, 0);
    const spikes = [184, 198, 402, 416, 171];
    troolls(yes).forEach((t, i) => moveInto(yes, t, spikes[i]!));
    yes.endTurn();
    expect(done(yes)).toEqual(['au_coin']);
    const no = newFight(QUIET);
    untilPlayerTurn(no, 6, 3);
    activateObjective(no.state, 'au_coin');
    untilPlayerTurn(no, 7, 0);
    troolls(no).forEach((t, i) => moveInto(no, t, spikes[i]!));
    no.endTurn();
    expect(done(no)).toEqual([]);
  });

  it('Même pas mal : pendant le tour de la Mama, un joueur touché dont le bouclier absorbe tout — oui ; sans bouclier — non', () => {
    for (const shield of [true, false]) {
      const fight = newFight(QUIET);
      untilPlayerTurn(fight, 7, 3);
      kill(fight, troolls(fight));
      activateObjective(fight.state, 'meme_pas_mal');
      // hors des lignes de la Mama (pas de Rassemblement), J1 à portée de Mitroollette (C3, PO 1–8)
      placeAll(fight, [343, 213, 230, 425]);
      const j1 = fight.getPlayers()[0]!;
      if (shield) {
        const mag = fight.getPlayers()[3]!;
        resolveSpell(fight.state, mag, fight.ctx.getSpell(80850), j1.cell, { depth: 1 }); // Muraille collective
        finishAction(fight.state);
        expect(j1.shield).toBeGreaterThan(0);
      }
      advanceUntil(fight, (f) => f.turn === 8 && f.getCurrentFighter()?.id === f.scenario.mamaId);
      const mama = fight.getMama()!;
      expect(mama.cell).toBe(300);
      expect(fight.cast(mama.id, 80497, j1.cell).ok).toBe(true);
      expect(j1.hp).toBe(shield ? 30000 : j1.hp);
      if (!shield) expect(j1.hp).toBeLessThan(30000);
      expect(done(fight)).toEqual(shield ? ['meme_pas_mal'] : []);
    }
  });
});

// =============================================================================================
// Choix : toujours résolubles
// =============================================================================================

describe('choix (ETUDE §2.7)', () => {
  it('un choix d’un joueur mort est retiré ; aucun choix n’est laissé sans option', () => {
    const fight = newFight({ ...DET, gifts: { spawnProbability: 0 } });
    kill(fight, [fight.getPlayers()[2]!]);
    advanceUntil(fight, (f) => f.turn === 2 && f.getPendingChoices().length > 0);
    const cs = fight.getPendingChoices();
    expect(cs.map((c) => c.fighterId)).not.toContain(fight.getPlayers()[2]!.id);
    expect(cs).toHaveLength(3);
    for (const c of fight.state.pendingChoices) expect((c.options ?? []).length).toBeGreaterThan(0);
    expect(resolveAllChoices(fight)).toBe(3);
  });

  it('config : createGladiatroolFight avec une configuration chargée explicitement', () => {
    const f = createGladiatroolFight(gameData, loadConfig(QUIET), { seed: 3 });
    expect(f.getStatus().kind).toBe('playerTurn');
  });
});

describe('apparitions : candidats sans type (spawn.allowUnassigned)', () => {
  it('les candidats « sans type » des données dans les pics (V1 : 171, 402 ; V9 : 402) ne sont jamais tirés', () => {
    const wave = gameData.scenario.waves.find((w) => w.n === 9)!;
    expect(wave.spawn!.unassigned.map((c) => c.cell)).toContain(402);
    const fight = newFight({ ...QUIET, spawn: { allowUnassigned: true, mode: 'uniform_slots' } });
    for (let i = 0; i < 300; i++) {
      const c = fight.clone({ keepLog: false });
      c.scenario.seed = 5000 + i;
      for (const f of spawnWave(c.state, wave)) expect(c.ctx.grid.isSpike(f.cell)).toBe(false);
    }
  });
});
