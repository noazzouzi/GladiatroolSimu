/**
 * Robustesse du scénario (docs/VERIFICATION.md, section « Scénario ») : 200 combats complets, graines différentes,
 * joueurs pilotés par une IA aléatoire LÉGALE (déplacements et sorts tirés parmi les actions valides), monstres pilotés
 * par l'IA disponible (``simpleMonsterController`` ; l'IA des monstres du module ``ai`` n'existe pas encore), plus des
 * variantes (monstres aléatoires ou passifs, configurations non standard, 1 à 4 joueurs). Invariants vérifiés après
 * CHAQUE action et à chaque point de décision : aucune exception, aucune entité hors carte ou superposée, PV dans
 * [0, PV max], PA / PM ≥ 0, états des pics et de la Mama cohérents, timeline cohérente, objectifs dans l'ordre des
 * paliers, grimoire conforme, choix toujours résolubles, fin de combat conforme.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig, type ArchetypeKey, type ConfigOverrides } from '../src/data/index.js';
import { placeFighter, Rng, type Fighter } from '../src/engine/index.js';
import { reachableCells } from '../src/geometry/index.js';
import {
  createGladiatroolFight,
  createRandomController,
  createScenarioContext,
  giftCells,
  passiveMonsterController,
  simpleMonsterController,
  type FightStatus,
  type GladiatroolFight,
  type MonsterController,
} from '../src/scenario/index.js';

const FAVOUR_STATES = [5973, 5974, 5975, 5976, 5977];

/** Collecte des violations (message français avec la graine et le tour). */
class Violations {
  list: string[] = [];
  add(msg: string): void {
    if (this.list.length < 50) this.list.push(msg);
  }
}

interface Options {
  /** Cadeaux dissipés un par un (engine.dispelGlyphsTriggeringMarkOnly) : contrôle du nombre de cadeaux au sol. */
  giftCount: boolean;
}

/** Invariants de l'état complet (moteur + scénario). */
function checkState(fight: GladiatroolFight, v: Violations, label: string, o: Options): void {
  const s = fight.state;
  const grid = s.ctx.grid;
  const sc = fight.scenario;
  const cfg = s.ctx.config;
  const waitCell = s.ctx.data.boss.waitCell;
  const occ = new Map<number, number>();
  for (const f of s.fighters) {
    if (f.alive) {
      if (!(f.hp > 0 && f.hp <= f.maxHp)) v.add(`${label} : PV de ${f.name} hors bornes (${f.hp} / ${f.maxHp})`);
      if (f.cell >= 0) {
        if (occ.has(f.cell)) v.add(`${label} : deux combattants sur la case ${f.cell}`);
        occ.set(f.cell, f.id);
        if (s.occupancy[f.cell] !== f.id + 1) v.add(`${label} : occupation incohérente en ${f.cell}`);
        const onMap = grid.isWalkable(f.cell) || (f.id === sc.mamaId && f.cell === waitCell);
        if (!onMap) v.add(`${label} : ${f.name} hors de l'arène (${f.cell})`);
        if (f.team !== 'scenario' && grid.isWalkable(f.cell)) {
          const spike = grid.isSpike(f.cell);
          const mark = f.team === 'players' ? 5903 : 5902;
          if (f.hasState(mark) !== spike) v.add(`${label} : ${f.name} état ${mark}=${f.hasState(mark)} alors que pics=${spike}`);
          if (spike && !f.hasState(5994)) v.add(`${label} : ${f.name} dans les pics sans Vulnérable`);
        }
      } else if (f.team !== 'scenario') v.add(`${label} : ${f.name} vivant hors carte`);
    } else {
      if (f.cell !== -1) v.add(`${label} : ${f.name} mort mais sur la case ${f.cell}`);
      if (f.hp !== 0) v.add(`${label} : ${f.name} mort avec ${f.hp} PV`);
    }
    if (!(f.ap >= 0) || !(f.mp >= 0)) v.add(`${label} : PA / PM de ${f.name} négatifs ou invalides`);
    if (f.hasState(5971) && f.id !== sc.mamaId) v.add(`${label} : 5971 sur ${f.name}`);
  }
  for (let c = 0; c < s.occupancy.length; c++) {
    const x = s.occupancy[c]!;
    if (x !== 0 && occ.get(c) !== x - 1) v.add(`${label} : occupation fantôme en ${c}`);
  }
  // Mama : attente, arrivée, Faveur
  const mama = fight.getMama()!;
  if (mama.alive) {
    if (s.turn <= 6 && !mama.hasState(5971)) v.add(`${label} : Mama sans 5971 au T${s.turn}`);
    if (s.turn < 8 && mama.cell !== waitCell) v.add(`${label} : Mama arrivée avant le T8`);
    const mamaPlayed = s.turn >= 9 || (s.turn === 8 && s.turnStage === 'active' && s.currentFighterId !== mama.id);
    if (mamaPlayed && mama.cell === waitCell) v.add(`${label} : Mama toujours sur ${waitCell} au T${s.turn}`);
    const k = sc.completed.length;
    const expected = k < FAVOUR_STATES.length ? [FAVOUR_STATES[k]!] : [];
    const has = FAVOUR_STATES.filter((st) => mama.hasState(st));
    if (sc.deaths.every((d) => d.fighterId !== mama.id) && has.join() !== expected.join()) {
      v.add(`${label} : Faveur ${has} au lieu de ${expected} après ${k} objectif(s)`);
    }
  }
  // timeline
  const tl = s.timeline;
  if (new Set(tl).size !== tl.length) v.add(`${label} : doublon dans la timeline`);
  if (mama.alive && cfg.timeline.model !== 'explicit' && tl[0] !== mama.id) v.add(`${label} : la Mama n'est pas en tête`);
  for (const f of s.fighters) {
    if (f.alive && f.team !== 'scenario' && !tl.includes(f.id)) v.add(`${label} : ${f.name} vivant absent de la timeline`);
  }
  if (s.turnStage === 'active' && tl[s.timelineIndex] !== s.currentFighterId) v.add(`${label} : index de timeline incohérent`);
  // objectifs
  sc.completed.forEach((c, i) => {
    if (c.tier !== i + 1) v.add(`${label} : objectif ${c.objectiveId} (palier ${c.tier}) en position ${i + 1}`);
    if (c.turn > s.turn) v.add(`${label} : objectif ${c.objectiveId} daté du futur`);
  });
  if (sc.completed.length > cfg.objectives.maxCount) v.add(`${label} : plus de ${cfg.objectives.maxCount} objectifs`);
  if (sc.active) {
    if (sc.completed.some((c) => c.objectiveId === sc.active)) v.add(`${label} : objectif actif déjà réalisé`);
    const tier = s.ctx.data.scenario.objectives.list.find((x) => x.id === sc.active)!.tier;
    if (tier !== sc.completed.length + 1) v.add(`${label} : objectif actif de palier ${tier} après ${sc.completed.length} objectif(s)`);
  }
  // grimoire : sorts d'emplacement = préfixe de l'ordre du Spell Manager (joueur jamais mort)
  for (const p of fight.getPlayers()) {
    if (!p.alive || sc.deaths.some((d) => d.fighterId === p.id)) continue;
    const slots = p.spells.filter((x) => x.slot >= 0).map((x) => x.slot);
    const n = Math.min(8, 2 + sc.completed.length);
    if (slots.join() !== Array.from({ length: n }, (_, i) => i).join()) v.add(`${label} : ${p.name} emplacements ${slots} (attendu 0..${n - 1})`);
  }
  // choix
  for (const c of s.pendingChoices) {
    if (!c.options || c.options.length === 0) v.add(`${label} : choix ${c.choiceListId} sans option`);
    if (c.scope === 'individual' && !s.fighters[c.fighterId]?.alive) v.add(`${label} : choix d'un joueur mort`);
  }
  // cadeaux
  for (const cell of giftCells(s, sc)) if (!cfg.gifts.cells.includes(cell)) v.add(`${label} : cadeau hors des cases prévues (${cell})`);
  if (o.giftCount && giftCells(s, sc).length !== sc.giftsSpawned - sc.giftsTaken) v.add(`${label} : cadeaux au sol incohérents`);
  // fin
  if (s.phase === 'ended') {
    const players = fight.getPlayers().filter((p) => p.alive).length;
    const enemies = fight.getLivingMonsters().length;
    if (sc.endReason === 'victory' && (enemies > 0 || !s.fighters[sc.sceId]!.hasState(5965))) v.add(`${label} : victoire invalide`);
    if (sc.endReason === 'defeat' && players > 0) v.add(`${label} : défaite avec des joueurs vivants`);
  }
}

/** IA aléatoire légale des joueurs : actions tirées parmi les déplacements et lancers valides ; invariants après chaque action. */
function randomPlayer(rng: Rng, greedy: boolean, after: () => void): MonsterController {
  return {
    playTurn(fight, id) {
      const s = fight.state;
      for (let k = 0; k < 10; k++) {
        const f: Fighter | undefined = s.fighters[id];
        if (!f || !f.alive || fight.getCurrentFighter() !== f || s.pendingChoices.length || s.phase === 'ended') return;
        if (rng.next() < 0.3 && f.mp > 0) {
          const cells = reachableCells(s.ctx.grid, f.cell, f.mp, s.occupiedPredicate()).cells.slice(1);
          if (cells.length) {
            const r = fight.playerMove(cells[rng.int(0, cells.length - 1)]!);
            if (!r.ok) throw new Error(`déplacement valide refusé : ${r.reason}`);
            after();
          }
          continue;
        }
        const spells = f.spells.filter((x) => s.ctx.getSpell(x.spellLevelId).cast.ap <= f.ap);
        if (!spells.length) return;
        let choice: [number, number] | null = null;
        if (greedy && rng.next() < 0.8) {
          const opts: [number, number][] = [];
          for (const x of spells) {
            for (const c of fight.getCastableCells(x.spellLevelId)) if (s.fighterAt(c)?.team === 'monsters') opts.push([x.spellLevelId, c]);
          }
          if (opts.length) choice = opts[rng.int(0, opts.length - 1)]!;
        }
        if (!choice) {
          const sp = spells[rng.int(0, spells.length - 1)]!;
          const cells = fight.getCastableCells(sp.spellLevelId);
          if (!cells.length) continue;
          choice = [sp.spellLevelId, cells[rng.int(0, cells.length - 1)]!];
        }
        const r = fight.playerCast(choice[0], choice[1]);
        if (!r.ok) throw new Error(`lancer valide refusé (${choice[0]} sur ${choice[1]}) : ${r.reason}`);
        after();
      }
    },
  };
}

/** Enveloppe un contrôleur de monstres pour vérifier les invariants après son tour. */
function checked(ctl: MonsterController, after: () => void): MonsterController {
  return {
    playTurn(fight, id) {
      ctl.playTurn(fight, id);
      after();
    },
  };
}

interface Batch {
  seeds: number;
  firstSeed: number;
  overrides: ConfigOverrides;
  monsters: 'simple' | 'random' | 'passive';
  greedy: boolean;
  maxTurn: number;
  teams: ArchetypeKey[][];
}

interface BatchResult {
  violations: string[];
  fights: number;
  ended: Record<string, number>;
  actions: number;
  avgMs: number;
  maxTurnReached: number;
  objectives: number;
  mamaArrivals: number;
}

function runBatch(b: Batch): BatchResult {
  const ctx = createScenarioContext({ config: loadConfig({ ...b.overrides, engine: { eventLog: false, ...(b.overrides.engine ?? {}) } }) });
  const o: Options = { giftCount: ctx.config.engine.dispelGlyphsTriggeringMarkOnly };
  const v = new Violations();
  const res: BatchResult = { violations: [], fights: 0, ended: {}, actions: 0, avgMs: 0, maxTurnReached: 0, objectives: 0, mamaArrivals: 0 };
  let total = 0;
  for (let seed = b.firstSeed; seed < b.firstSeed + b.seeds; seed++) {
    const team = b.teams[seed % b.teams.length]!;
    const rng = new Rng(seed * 7919 + 17);
    let fight!: GladiatroolFight;
    const label = () => `graine ${seed}, T${fight.turn}`;
    const after = () => {
      res.actions++;
      checkState(fight, v, label(), o);
    };
    const base = b.monsters === 'passive' ? passiveMonsterController : b.monsters === 'random' ? createRandomController(seed * 31) : simpleMonsterController;
    const t0 = performance.now();
    try {
      fight = createGladiatroolFight(undefined, undefined, {
        seed,
        players: team.map((archetype) => ({ archetype })),
        options: { ctx, monsterController: checked(base, () => checkState(fight, v, label(), o)) },
      });
      const players = randomPlayer(rng, b.greedy, after);
      let st: FightStatus = fight.getStatus();
      for (let i = 0; i < 20000; i++) {
        checkState(fight, v, `${label()} (${st.kind})`, o);
        if (st.kind === 'ended' || fight.turn > b.maxTurn) break;
        if (st.kind === 'choice') {
          const c = st.choice;
          const living = fight.getPlayers().filter((p) => p.alive).length;
          const answer = c.scope === 'global' && rng.next() < 0.5
            ? { votes: Array.from({ length: living }, () => rng.int(0, c.options.length - 1)) }
            : rng.int(0, c.options.length - 1);
          const r = fight.resolveChoice(c.uid, answer);
          if (!r.ok) {
            v.add(`${label()} : choix ${c.choiceListId} non résoluble (${r.reason})`);
            break;
          }
          st = fight.getStatus();
        } else if (st.kind === 'playerTurn') {
          const id = st.fighterId;
          players.playTurn(fight, id);
          st = fight.getStatus();
          if (st.kind === 'playerTurn' && st.fighterId === id) st = fight.endTurn();
        } else if (st.kind === 'monsterTurn') st = fight.stepMonsterTurn();
        else {
          v.add(`${label()} : point de décision « idle » inattendu`);
          st = fight.advance();
        }
      }
    } catch (e) {
      v.add(`${label()} : exception ${(e as Error).message}`);
    }
    total += performance.now() - t0;
    const r = fight.getResult();
    res.fights++;
    const key = r.reason ?? 'inachevé';
    res.ended[key] = (res.ended[key] ?? 0) + 1;
    res.maxTurnReached = Math.max(res.maxTurnReached, r.turn);
    res.objectives += r.objectivesCompleted.length;
    if (r.mama?.arrived) res.mamaArrivals++;
  }
  res.avgMs = total / res.fights;
  res.violations = v.list;
  // statistiques (durée moyenne d'un combat simulé…) : GLADIA_STATS=1 npx vitest run sim/test/scenario.robustness.test.ts
  if (process.env.GLADIA_STATS) console.log(JSON.stringify({ ...res, violations: res.violations.length }));
  return res;
}

const ADDM: ArchetypeKey[] = ['acrobate', 'dompteur', 'dompteur', 'magicien'];
const AADM: ArchetypeKey[] = ['acrobate', 'acrobate', 'dompteur', 'magicien'];

describe('robustesse : le contrôle des invariants détecte les incohérences', () => {
  it('états corrompus à la main → violations signalées', () => {
    const o: Options = { giftCount: true };
    const fresh = () => createGladiatroolFight(undefined, undefined, { seed: 1, options: { eventLog: false } });
    const cases: [string, (f: GladiatroolFight) => void][] = [
      ['Trooll dans les pics sans les états des pics', (f) => placeFighter(f.state, f.state.fighterAt(242)!, 199)],
      ['PV au-delà du maximum', (f) => void (f.getPlayers()[0]!.hp = 40000)],
      ['Mama arrivée trop tôt', (f) => placeFighter(f.state, f.getMama()!, 300)],
      ['combattant absent de la timeline', (f) => void f.state.timeline.pop()],
      ['objectif hors ordre', (f) => void (f.scenario.completed = [{ objectiveId: 'quintuple', name: 'Quintuplé', tier: 6, turn: 1, creditedId: 0 }])],
      ['choix sans option', (f) => void f.state.pendingChoices.push({ uid: 999, scope: 'global', choiceListId: 11, fighterId: -1, casterId: 0, spellLevelId: 0, castId: 0, turn: 1, options: [] })],
    ];
    for (const [what, corrupt] of cases) {
      const f = fresh();
      const clean = new Violations();
      checkState(f, clean, 'propre', o);
      expect(clean.list, what).toEqual([]);
      corrupt(f);
      const v = new Violations();
      checkState(f, v, what, o);
      expect(v.list.length, what).toBeGreaterThan(0);
    }
  });
});

describe('robustesse : 200 combats complets (IA aléatoire légale des joueurs)', () => {
  it('lot 1 — 50 combats, configuration par défaut, IA simple des monstres, A-D-D-M / A-A-D-M', () => {
    const r = runBatch({ seeds: 50, firstSeed: 1, overrides: {}, monsters: 'simple', greedy: false, maxTurn: 30, teams: [ADDM, AADM] });
    expect(r.violations).toEqual([]);
    expect(r.fights).toBe(50);
    expect(Object.values(r.ended).reduce((a, b) => a + b, 0)).toBe(50);
    expect(r.ended['inachevé'] ?? 0).toBe(0);
    expect(r.actions).toBeGreaterThan(1000);
  });

  it('lot 2 — 50 combats, joueurs « agressifs » (sorts sur les monstres), cadeaux à chaque tour, IA simple des monstres', () => {
    const r = runBatch({
      seeds: 50,
      firstSeed: 101,
      overrides: { gifts: { spawnProbability: 1 } },
      monsters: 'simple',
      greedy: true,
      maxTurn: 30,
      teams: [AADM, ADDM],
    });
    expect(r.violations).toEqual([]);
    expect(r.objectives).toBeGreaterThan(0);
  });

  it('lot 3 — 50 combats, monstres aléatoires, configuration non standard n° 1 (timeline par initiative, tirages uniformes…)', () => {
    const r = runBatch({
      seeds: 50,
      firstSeed: 201,
      overrides: {
        timeline: { model: 'alternate_initiative', newMonstersInsertion: 'by_initiative', deadPlayersKeepSlot: false },
        spawn: { mode: 'uniform_slots', excludeOccupied: false },
        spikes: { playersDoubledInside: true, playerTurnStartDamage: 2000 },
        boss: { actsBeforeArrival: true, giftCancelsRassemblement: true },
        bonuses: { doubleApplication: true },
        objectives: { offerCount: 3 },
        gifts: { spawnProbability: 1, cellDraw: 'weighted_observed' },
        victory: { canFinishFromTurn: 11, turnLimit: 16 },
      },
      monsters: 'random',
      greedy: true,
      maxTurn: 20,
      teams: [ADDM, AADM, ['magicien', 'dompteur', 'acrobate']],
    });
    expect(r.violations).toEqual([]);
    expect(r.mamaArrivals).toBeGreaterThan(0);
  });

  it('lot 4 — 50 combats longs (monstres passifs), configuration non standard n° 2 (1 à 4 joueurs, Mama et objectifs)', () => {
    const r = runBatch({
      seeds: 50,
      firstSeed: 301,
      overrides: {
        timeline: { model: 'monsters_after_mama', newMonstersInsertion: 'after_mama' },
        spawn: { mode: 'most_frequent' },
        objectives: { maxCount: 5, tier6Offered: false, solitudeBeforeArrival: false, mamaCountsFromTurn: 8, pushKillsCount: false },
        boss: { favourCap: 5, rassemblementPullThenPush: false },
        gifts: { spawnProbability: 0.72, pushedPlayerTriggers: false, cardMix: { twoUniques: 1, twoUpgrades: 0, oneEach: 0 } },
        spells: { newSpellUsableSameTurn: false },
        victory: { turnLimit: 14 },
      },
      monsters: 'passive',
      greedy: true,
      maxTurn: 16,
      teams: [ADDM, ['dompteur'], ['acrobate', 'magicien'], AADM, ['dompteur', 'dompteur', 'magicien']],
    });
    expect(r.violations).toEqual([]);
    expect(r.ended.turnLimit ?? 0).toBeGreaterThan(0);
    expect(r.mamaArrivals).toBeGreaterThan(10);
    expect(r.objectives).toBeGreaterThan(20);
  });
});
