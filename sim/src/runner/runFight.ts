/**
 * Combat complet piloté (``runFight``) : joueurs joués par le planificateur (mode ``fast`` / ``deep`` /
 * ``greedy``), monstres par l'IA du module ``ai`` (défaut), choix résolus par les politiques (policies.ts),
 * jusqu'à la fin du combat ou au-delà de ``maxTurn``. Renvoie un résultat complet (victoire, tour atteint, morts,
 * objectifs, PV ennemis détruits, Mama…), avec en option un journal français et une trace rejouable.
 *
 * Pur TypeScript sans API Node : utilisable dans un worker Node comme dans un Web Worker du navigateur. Tout passe
 * par l'API publique du combat (actions légales uniquement).
 */
import { gameData, type ConfigOverrides, type GameData } from '../data/index.js';
import type { EngineContext } from '../engine/index.js';
import { ANTICIPATION_OPTIONS, anticipationMonsterAi, createMonsterAi, monsterAi } from '../ai/index.js';
import {
  bestOption,
  choiceKindLabel,
  createChoicePolicy,
  executePlan,
  now,
  planPlayerTurn,
  scoreChoice,
  type ChoicePolicy,
  type PlanOptions,
  type PlannerMode,
} from '../planner/index.js';
import {
  createGladiatroolFight,
  createScenarioContext,
  passiveMonsterController,
  simpleMonsterController,
  type FightStatus,
  type GladiatroolFight,
  type MonsterController,
  type PlayerSetup,
  type ScenarioChoice,
} from '../scenario/index.js';
import { compositionOf, parseComposition } from './compositions.js';
import { buildJournal, JournalNotes } from './journal.js';
import { installRecorder } from './trace.js';
import type { ChoiceRecord, FightRunResult, MonsterControllerName, RunOptions, RunSetup, TraceStep } from './types.js';

// ---------------------------------------------------------------------------------------------
// Contextes (compilation des sorts partagée entre combats de même configuration)
// ---------------------------------------------------------------------------------------------

const contexts = new Map<string, EngineContext>();

/** Contexte moteur (crochets du scénario installés) pour ces surcharges ; mis en cache (même configuration). */
export function contextFor(overrides: ConfigOverrides = {}): EngineContext {
  const key = JSON.stringify(overrides);
  let ctx = contexts.get(key);
  if (!ctx) {
    ctx = createScenarioContext({ data: gameData, overrides });
    contexts.set(key, ctx);
  }
  return ctx;
}

/** Contrôleur des monstres par nom. */
export function monsterControllerFor(name: MonsterControllerName = 'ai'): MonsterController {
  switch (name) {
    case 'simple':
      return simpleMonsterController;
    case 'passive':
      return passiveMonsterController;
    default:
      return monsterAi;
  }
}

/** PV ennemis de tout le combat : monstres de toutes les vagues (Mama comprise, vague 8), PV de base des données. */
export function totalEnemyHp(data: GameData = gameData): number {
  let total = 0;
  for (const w of data.scenario.waves) {
    for (const c of w.composition) total += (data.monsters[String(c.monsterId)]?.stats.hp ?? 0) * c.count;
  }
  return total;
}

/** PV ennemis détruits : pour chaque monstre apparu (hors invocations), PV de base − PV restants (mort : PV de base). */
export function destroyedEnemyHp(fight: GladiatroolFight): number {
  const data = fight.ctx.data;
  let d = 0;
  for (const f of fight.state.fighters) {
    if (f.team !== 'monsters' || f.isSummon) continue;
    const base = data.monsters[String(f.monsterId)]?.stats.hp ?? f.maxHp;
    d += f.alive ? Math.max(0, base - Math.min(base, f.hp)) : base;
  }
  return d;
}

function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

/** Cause d'une mort en français (tueur, poussée, pics). */
function deathCause(fight: GladiatroolFight, killerId: number, cause: string): string {
  const k = killerId >= 0 ? fight.state.fighters[killerId] : undefined;
  const who = !k ? 'inconnu' : k.team === 'scenario' ? 'les pics' : k.name;
  return cause === 'pushDamage' ? `dommages de poussée (${who})` : who;
}

// ---------------------------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------------------------

interface RunContext {
  fight: GladiatroolFight;
  opts: RunOptions;
  policyOptions: NonNullable<RunOptions['policies']>;
  choices: ChoiceRecord[];
  notes: JournalNotes | null;
  steps: TraceStep[] | null;
}

function fighterLabel(fight: GladiatroolFight, choice: ScenarioChoice): string {
  return choice.fighterId >= 0 ? fight.state.fighters[choice.fighterId]?.name ?? `#${choice.fighterId}` : 'équipe';
}

/** Politique « enregistrante » : note le choix (raison) quand il est fait sur le VRAI combat (pas sur une copie). */
function recordingPolicy(rc: RunContext): ChoicePolicy {
  return (choice, fight) => {
    const scored = scoreChoice(choice, fight, rc.policyOptions);
    const best = bestOption(scored);
    const idx = best?.index ?? 0;
    if (fight === rc.fight) {
      const label = choice.options[idx]?.label ?? '?';
      const rec: ChoiceRecord = {
        turn: fight.turn,
        fighter: fighterLabel(fight, choice),
        kind: choiceKindLabel(choice),
        label,
        reason: best?.reason ?? '',
      };
      rc.choices.push(rec);
      if (rc.notes) {
        const others = scored
          .filter((s) => s.index !== idx)
          .map((s) => `${s.label} (${s.score.toFixed(1)})`)
          .join(' ; ');
        rc.notes.add(fight.state, `   ◆ ${rec.kind} — ${rec.fighter} : ${label} — ${rec.reason}${others ? ` [écartés : ${others}]` : ''}`);
      }
    }
    return idx;
  };
}

function resolvePending(rc: RunContext, policy: ChoicePolicy): FightStatus {
  const fight = rc.fight;
  for (let guard = 0; guard < 256; guard++) {
    const c = fight.getPendingChoice();
    if (!c) break;
    const r = fight.resolveChoice(c.uid, policy(c, fight));
    if (!r.ok && !fight.resolveChoice(c.uid, 0).ok) throw new Error(`choix ${c.uid} impossible à résoudre : ${r.reason}`);
  }
  let st = fight.getStatus();
  if (st.kind === 'idle') st = fight.advance();
  return st;
}

/**
 * Joue un combat complet et renvoie son résultat. ``setup`` : composition (ou joueurs) et graines ; ``opts`` :
 * mode du planificateur, politiques, surcharges de configuration, contrôleurs, journal, trace.
 */
export function runFight(setup: RunSetup, opts: RunOptions = {}): FightRunResult {
  const t0 = now();
  const mode: PlannerMode = opts.mode ?? 'fast';
  const parsed = setup.players ? null : parseComposition(setup.compo ?? 'ADDM');
  const players: PlayerSetup[] = setup.players ? setup.players.map((p) => ({ ...p })) : parsed!.players;
  const compo = parsed ? parsed.name : compositionOf(players);
  const ctx = contextFor(opts.configOverrides);
  const monsters = monsterControllerFor(opts.monsters);
  const fight = createGladiatroolFight(undefined, undefined, {
    players,
    seed: setup.seed,
    options: {
      ctx,
      eventLog: !!opts.journal,
      monsterController: monsters,
      ...(setup.scenarioSeed !== undefined ? { scenarioSeed: setup.scenarioSeed } : {}),
    },
  });
  const rc: RunContext = {
    fight,
    opts,
    policyOptions: opts.policies ?? {},
    choices: [],
    notes: opts.journal ? new JournalNotes() : null,
    steps: opts.trace || opts.hooks?.onStep ? [] : null,
  };
  const onStep = opts.hooks?.onStep;
  if (rc.steps) installRecorder(fight, rc.steps, onStep ? (step, index) => { if (step.k !== 'end') onStep(fight, step, index); } : undefined);
  /** Fin de tour enregistrée : le crochet est appelé après la fin effective du tour (point de décision suivant). */
  const endStep = (id: number, turn: number): (() => void) => {
    if (!rc.steps) return () => {};
    const step: TraceStep = { k: 'end', f: id, t: turn };
    rc.steps.push(step);
    const index = rc.steps.length - 1;
    return () => onStep?.(fight, step, index);
  };
  const plannerPolicy = createChoicePolicy(rc.policyOptions);
  const recPolicy = recordingPolicy(rc);
  const planOpts: PlanOptions = {
    mode,
    budget: opts.planner?.budget,
    weights: opts.planner?.weights,
    // reproductibilité (Monte Carlo) : budget de nœuds seul en fast / greedy ; deep garde son plafond de temps
    deterministic: opts.planner?.deterministic ?? mode !== 'deep',
    monsterController: opts.planner?.anticipationAi ? createMonsterAi({ ...ANTICIPATION_OPTIONS, ...opts.planner.anticipationAi }) : anticipationMonsterAi,
    choicePolicy: plannerPolicy,
    explain: !!opts.journal,
    oracle: opts.planner?.oracle ?? false,
  };
  const maxReplans = opts.planner?.maxReplans ?? 2;
  // boucle fermée : replanifier quand l'état réel s'écarte de la prévision (tour 4 de la boucle d'amélioration)
  const maxDeviationReplans = opts.planner?.replanOnDeviation === false ? 0 : (opts.planner?.maxDeviationReplans ?? 4);
  const maxTurn = opts.maxTurn ?? 20;
  const planTimes: number[] = [];
  let monsterMs = 0;
  let replans = 0;
  let stoppedByTurn = false;

  let st = fight.getStatus();
  if (st.kind === 'idle') st = fight.advance();
  for (let guard = 0; guard < 1_000_000; guard++) {
    if (st.kind === 'ended') break;
    if (fight.turn > maxTurn) {
      stoppedByTurn = true;
      break;
    }
    switch (st.kind) {
      case 'choice':
        st = resolvePending(rc, recPolicy);
        break;
      case 'playerTurn': {
        const id = st.fighterId;
        opts.hooks?.onPlayerTurn?.(fight, id);
        if (opts.players !== 'passive') {
          const tp = now();
          let refused = 0;
          let deviations = 0;
          for (let attempt = 0; refused <= maxReplans && deviations <= maxDeviationReplans; attempt++) {
            resolvePending(rc, recPolicy);
            const cur = fight.getStatus();
            if (cur.kind !== 'playerTurn' || cur.fighterId !== id) break;
            const plan = planPlayerTurn(fight, planOpts);
            if (rc.notes) {
              const p = fight.state.fighters[id]!;
              const head = `   ◇ Plan de ${p.name} (${mode}, score ${Math.round(plan.score)}, ${Math.round(plan.stats.timeMs)} ms)${attempt ? ' — replanification' : ''} :`;
              rc.notes.add(fight.state, [head, ...plan.explanation.split('\n').map((l) => `      ${l}`)]);
            }
            const checkpoints = deviations < maxDeviationReplans ? plan.checkpoints : undefined;
            const r = executePlan(fight, plan.actions, { choicePolicy: recPolicy, endTurn: false, checkpoints });
            if (r.ok) break;
            replans++;
            if (r.deviated) {
              deviations++;
              if (rc.notes) rc.notes.add(fight.state, `   ! Écart : ${r.reason} — nouvelle planification.`);
            } else {
              refused++;
              if (rc.notes) rc.notes.add(fight.state, `   ! Action refusée (${r.reason}) : nouvelle planification.`);
            }
          }
          planTimes.push(now() - tp);
        }
        st = resolvePending(rc, recPolicy);
        if (st.kind === 'playerTurn' && st.fighterId === id) {
          const ended = endStep(id, fight.turn);
          st = fight.endTurn();
          ended();
        }
        break;
      }
      case 'monsterTurn': {
        const id = st.fighterId;
        const tm = now();
        st = fight.stepMonsterTurn(monsters);
        monsterMs += now() - tm;
        if (st.kind !== 'choice') endStep(id, fight.turn)();
        break;
      }
      case 'idle':
        st = fight.advance();
        break;
    }
  }

  // ------------------------------------------------------------------ résultat
  const res = fight.getResult();
  const sc = fight.scenario;
  const data = fight.ctx.data;
  const total = totalEnemyHp(data);
  const destroyed = destroyedEnemyHp(fight);
  const mamaDeath = sc.deaths.find((d) => d.fighterId === sc.mamaId);
  const playerDeaths = [];
  for (const d of sc.deaths) {
    const f = fight.state.fighters[d.fighterId];
    if (!f || d.team !== 'players' || f.archetype === null || f.isSummon) continue;
    playerDeaths.push({ name: f.name, archetype: f.archetype, turn: d.turn, cause: deathCause(fight, d.killerId, d.cause) });
  }
  planTimes.sort((a, b) => a - b);
  const result: FightRunResult = {
    compo,
    seed: setup.seed,
    mode,
    winner: res.winner,
    victory: res.winner === 'players',
    reason: stoppedByTurn ? 'maxTurn' : res.reason,
    turnReached: fight.turn,
    playersAlive: res.playersAlive,
    playerDeaths,
    objectives: res.objectivesCompleted.map((o) => ({ id: o.objectiveId, name: o.name, tier: o.tier, turn: o.turn })),
    objectivesCount: res.objectivesCompleted.length,
    enemyHpTotal: total,
    enemyHpDestroyed: destroyed,
    progress: total > 0 ? destroyed / total : 0,
    monstersSpawned: fight.state.fighters.filter((f) => f.team === 'monsters' && !f.isSummon && f.monsterId !== data.boss.monsterId).length + (sc.mamaId >= 0 ? 1 : 0),
    monstersKilled: res.monstersKilled,
    mamaArrived: !!res.mama?.arrived,
    mamaKilledTurn: mamaDeath ? mamaDeath.turn : null,
    mamaHpLeft: res.mama ? res.mama.hp : 0,
    giftsSpawned: res.giftsSpawned,
    giftsTaken: res.giftsTaken,
    choices: rc.choices,
    timing: {
      totalMs: now() - t0,
      playerTurns: planTimes.length,
      planMsMedian: quantile(planTimes, 0.5),
      planMsP95: quantile(planTimes, 0.95),
      planMsMax: planTimes.length ? planTimes[planTimes.length - 1]! : 0,
      monsterMs,
      replans,
    },
  };
  if (rc.notes) {
    rc.notes.add(fight.state, ['', resultLine(result)]);
    const at: number[] | undefined = opts.journalIndex ? [] : undefined;
    result.journal = buildJournal(fight.state, rc.notes, at);
    if (at) result.journalAt = at;
  }
  if (rc.steps && opts.trace) {
    result.trace = {
      version: 1,
      setup: { players, seed: setup.seed, ...(setup.scenarioSeed !== undefined ? { scenarioSeed: setup.scenarioSeed } : {}) },
      ...(opts.configOverrides ? { configOverrides: opts.configOverrides } : {}),
      info: { compo, mode, monsters: opts.monsters ?? 'ai' },
      steps: rc.steps,
    };
  }
  return result;
}

/** Bilan d'une ligne (français). */
export function resultLine(r: FightRunResult): string {
  const end =
    r.reason === 'victory'
      ? `VICTOIRE au tour ${r.turnReached}`
      : r.reason === 'defeat'
        ? `DÉFAITE au tour ${r.turnReached}`
        : r.reason === 'maxTurn'
          ? `arrêt au tour ${r.turnReached} (limite)`
          : `fin au tour ${r.turnReached} (${r.reason ?? '?'})`;
  const deaths = r.playerDeaths.length ? `, morts : ${r.playerDeaths.map((d) => `${d.name} (T${d.turn})`).join(', ')}` : ', aucun mort';
  const mama = r.mamaKilledTurn !== null ? `, Mama tuée au T${r.mamaKilledTurn}` : r.mamaArrived ? `, Mama vivante (${r.mamaHpLeft} PV)` : '';
  return `${r.compo} graine ${r.seed} : ${end} — progression ${(100 * r.progress).toFixed(1).replace('.', ',')} %, ${r.objectivesCount} objectif(s)${mama}${deaths} — ${(r.timing.totalMs / 1000).toFixed(1).replace('.', ',')} s`;
}
