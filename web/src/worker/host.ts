/**
 * Hôte du simulateur pour l'interface : reçoit les requêtes (worker, ou fil principal en repli) et les exécute avec
 * ``sim/src`` — ``buildSituation``, ``planPlayerTurn`` / ``planTeamTurn``, ``executePlan``, ``runFight``,
 * ``replayTrace`` —, sans aucune règle de jeu propre. Garde l'état courant (combat de base, dernier plan, dernière
 * simulation) entre les requêtes.
 */
import { monsterAi } from '../../../sim/src/ai/index.js';
import type { Fighter } from '../../../sim/src/engine/index.js';
import {
  createChoicePolicy,
  executePlan,
  planPlayerTurn,
  planTeamTurn,
  scoreChoice,
  bestOption,
  choiceKindLabel,
  type ChoicePolicy,
  type PlanOptions,
  type PlayerPlan,
  type TeamPlan,
} from '../../../sim/src/planner/index.js';
import {
  buildSituation,
  installRecorder,
  replayTrace,
  resultLine,
  runFight,
  type FightTrace,
  type TraceStep,
} from '../../../sim/src/runner/index.js';
import type { GladiatroolFight } from '../../../sim/src/scenario/index.js';
import { buildCatalog } from '../model/catalog.js';
import { situationFromFight, situationTrolls } from '../model/fromFight.js';
import type {
  ApplyResult,
  BestTurnResult,
  Catalog,
  LoadResult,
  PlanCard,
  Progress,
  SimResult,
  SimSpec,
  Situation,
  WorkerRequest,
} from '../model/types.js';
import { fightView } from '../model/view.js';
import { ReplayBuilder } from './replay.js';
import { planCard, simulateInterlude, simulateSteps, visualClone } from './visual.js';

type ProgressFn = (p: Progress) => void;

export class SimHost {
  private catalog: Catalog | null = null;
  private base: GladiatroolFight | null = null;
  private situation: Situation | null = null;
  private lastPlan: { plan: PlayerPlan; team: TeamPlan | null } | null = null;
  private lastSim: { trace: FightTrace; spec: SimSpec; frames: { step: number; playerTurn: boolean; turn: number }[] } | null = null;
  /** Combats dont les actions réussies sont observées (application d'un plan). */
  private readonly recorded = new WeakSet<GladiatroolFight>();
  private recordTo: ((s: TraceStep, i: number) => void) | null = null;

  handle(req: WorkerRequest, progress: ProgressFn): unknown {
    switch (req.type) {
      case 'init':
        this.catalog ??= buildCatalog();
        return this.catalog;
      case 'load':
        return this.load(req.situation);
      case 'plan':
        return this.plan(req.mode, req.team, progress);
      case 'apply':
        return this.apply(req, progress);
      case 'simulate':
        return this.simulate(req.spec, progress);
      case 'point':
        return this.point(req.frame, progress);
      default:
        throw new Error('requête inconnue');
    }
  }

  // ------------------------------------------------------------------ situation

  private sitIndexOf(fight: GladiatroolFight, sit: Situation): (f: Fighter) => number | undefined {
    const trolls = situationTrolls(fight).map((f) => f.id);
    const trollIdx: number[] = [];
    sit.monsters.forEach((m, i) => {
      if (m.type !== 'mama' && !m.dead) trollIdx.push(i);
    });
    const mamaIdx = sit.monsters.findIndex((m) => m.type === 'mama');
    return (f) => {
      const pi = fight.scenario.playerIds.indexOf(f.id);
      if (pi >= 0) return pi;
      if (f.id === fight.scenario.mamaId) return mamaIdx >= 0 ? mamaIdx : undefined;
      const k = trolls.indexOf(f.id);
      return k >= 0 ? trollIdx[k] : undefined;
    };
  }

  private viewResult(warnings: string[]): LoadResult {
    const fight = this.base!;
    const sit = this.situation!;
    return { view: fightView(fight, this.sitIndexOf(fight, sit)), warnings, situation: sit };
  }

  private load(sit: Situation): LoadResult {
    const { fight, warnings } = buildSituation(sit);
    this.base = fight;
    this.situation = sit;
    this.lastPlan = null;
    return this.viewResult(warnings);
  }

  private setExact(fight: GladiatroolFight, seed: number, description: string): void {
    this.base = fight;
    this.situation = situationFromFight(fight, { seed, description });
    this.lastPlan = null;
  }

  private requireBase(): GladiatroolFight {
    if (!this.base) throw new Error('aucune situation chargée');
    return this.base;
  }

  // ------------------------------------------------------------------ meilleur tour

  private policy(): ChoicePolicy {
    return createChoicePolicy({});
  }

  private plan(mode: PlanOptions['mode'], team: boolean, progress: ProgressFn): BestTurnResult {
    const fight = this.requireBase();
    const st = fight.getStatus();
    if (st.kind !== 'playerTurn') throw new Error(`ce n'est pas le tour d'un joueur (${st.kind === 'ended' ? 'combat terminé' : st.kind})`);
    const actor = fight.state.fighters[st.fighterId]!;
    const policy = this.policy();
    const opts: PlanOptions = { mode, choicePolicy: policy };
    progress({ phase: `Recherche du meilleur tour de ${actor.name} (${mode === 'deep' ? 'recherche approfondie' : mode})…`, fraction: team ? 0.05 : 0.1 });
    const plan = planPlayerTurn(fight, opts);
    progress({ phase: 'Tracé du plan et des alternatives…', fraction: team ? 0.4 : 0.7 });
    const cardOpts = (key: string, title: string) => ({ key, title, actorId: actor.id, actorName: actor.name, policy, planOptions: opts, interlude: true });
    const best = planCard(fight, plan, cardOpts('best', 'Meilleur tour'));
    const alternatives = plan.alternatives.map((alt, i) => planCard(fight, alt, cardOpts(`alt${i}`, `Alternative ${i + 1}`)));
    let teamRes: BestTurnResult['team'] = null;
    let teamPlan: TeamPlan | null = null;
    if (team) {
      progress({ phase: 'Plan d\'équipe du tour global (joueurs suivants, monstres simulés)…', fraction: 0.5 });
      teamPlan = planTeamTurn(fight, opts);
      progress({ phase: 'Tracé du plan d\'équipe…', fraction: 0.92 });
      // même suite de copies que planTeamTurn : copie de départ, puis une copie de planification par joueur
      // (``searchPlayerTurn`` repart de ``planningClone`` : graines imaginées identiques, mêmes votes supposés)
      let c = visualClone(fight);
      const turn = c.turn;
      const cards: PlanCard[] = [];
      for (const [i, step] of teamPlan.steps.entries()) {
        c = visualClone(c);
        const s = c.getStatus();
        if (s.kind !== 'playerTurn' || s.fighterId !== step.fighterId) break;
        const steps = simulateSteps(c, step.plan.actions, policy);
        const interlude = simulateInterlude(c, step.fighterId, turn, opts);
        cards.push({
          key: `team${i}`,
          title: step.fighterName,
          actorId: step.fighterId,
          actorName: step.fighterName,
          score: step.plan.score,
          staticScore: step.plan.staticScore,
          explanation: step.plan.explanation.split('\n'),
          summary: step.plan.summary,
          actions: step.plan.actions,
          steps,
          interlude,
        });
      }
      teamRes = { explanation: teamPlan.explanation.split('\n'), score: teamPlan.score, steps: cards };
    }
    this.lastPlan = { plan, team: teamPlan };
    return {
      turn: fight.turn,
      actorId: actor.id,
      actorName: actor.name,
      best,
      alternatives,
      team: teamRes,
      timeMs: plan.stats.timeMs + (teamPlan?.timeMs ?? 0),
      stats: { nodes: plan.stats.nodes, simulations: plan.stats.simulations, leaves: plan.stats.leaves, lookaheads: plan.stats.lookaheads, truncated: plan.stats.truncated },
    };
  }

  // ------------------------------------------------------------------ appliquer

  private apply(req: Extract<WorkerRequest, { type: 'apply' }>, progress: ProgressFn): ApplyResult {
    const fight = this.requireBase();
    const lp = this.lastPlan;
    if (!lp) throw new Error('aucun plan à appliquer : lancer d\'abord la recherche');
    const queue: { fighterId: number; actions: PlayerPlan['actions'] }[] = [];
    if (req.source === 'best') queue.push({ fighterId: lp.plan.fighterId, actions: lp.plan.actions });
    else if (req.source === 'alt') {
      const alt = lp.plan.alternatives[req.index];
      if (!alt) throw new Error('alternative introuvable');
      queue.push({ fighterId: lp.plan.fighterId, actions: alt.actions });
    } else {
      if (!lp.team) throw new Error('pas de plan d\'équipe');
      const steps = req.wholeTeam ? lp.team.steps : lp.team.steps.slice(req.index, req.index + 1);
      for (const s of steps) queue.push({ fighterId: s.fighterId, actions: s.plan.actions });
    }
    progress({ phase: 'Application du plan et passage des monstres…', fraction: null });
    fight.state.setEventLog(true);
    const saved = { roll: fight.state.rollMode, crit: fight.state.critMode };
    if (req.rolls === 'average') {
      fight.state.rollMode = 'average';
      fight.state.critMode = 'never';
    }
    const builder = new ReplayBuilder(fight, 'Avant le plan');
    let stepIndex = 0;
    let pendingChoice: string | undefined;
    if (!this.recorded.has(fight)) {
      installRecorder(fight, [], (s, i) => this.recordTo?.(s, i));
      this.recorded.add(fight);
    }
    this.recordTo = (s) => {
      builder.step(fight, s, stepIndex++, s.k === 'choice' ? pendingChoice : undefined);
    };
    const base = createChoicePolicy({});
    const policy: ChoicePolicy = (choice, f) => {
      const idx = base(choice, f);
      if (f === fight) {
        const scored = scoreChoice(choice, f, {});
        const best = bestOption(scored);
        const who = choice.fighterId >= 0 ? f.state.fighters[choice.fighterId]?.name ?? '' : 'équipe';
        pendingChoice = `${choiceKindLabel(choice)} — ${who} : ${choice.options[typeof idx === 'number' ? idx : 0]?.label ?? '?'}${best?.reason ? ` (${best.reason})` : ''}`;
      }
      return idx;
    };
    const messages: string[] = [];
    const endStep = (id: number) => builder.step(fight, { k: 'end', f: id, t: fight.turn }, stepIndex++);
    const runMonsters = () => {
      for (let guard = 0; guard < 400; guard++) {
        const st = fight.getStatus();
        if (st.kind === 'monsterTurn') {
          const id = st.fighterId;
          const after = fight.stepMonsterTurn(monsterAi);
          if (after.kind !== 'choice') endStep(id);
        } else if (st.kind === 'choice') {
          const c = st.choice;
          fight.resolveChoice(c.uid, policy(c, fight));
          if (fight.getStatus().kind === 'idle') fight.advance();
        } else if (st.kind === 'idle') fight.advance();
        else return;
      }
    };
    try {
      for (const item of queue) {
        const st = fight.getStatus();
        if (st.kind !== 'playerTurn' || st.fighterId !== item.fighterId) {
          messages.push(`plan de ${fight.state.fighters[item.fighterId]?.name} non appliqué : ce n'est pas son tour`);
          break;
        }
        const name = fight.state.fighters[item.fighterId]!.name;
        const r = executePlan(fight, item.actions, { choicePolicy: policy, endTurn: false });
        if (!r.ok) messages.push(`${name} : action refusée après ${r.executed} action(s) (${r.reason ?? '?'})`);
        const now = fight.getStatus();
        if (now.kind === 'playerTurn' && now.fighterId === item.fighterId) {
          fight.endTurn();
          endStep(item.fighterId);
        }
        runMonsters();
        if (!r.ok) break;
      }
    } finally {
      this.recordTo = null;
      fight.state.rollMode = saved.roll;
      fight.state.critMode = saved.crit;
    }
    const replay = builder.build(fight);
    const seed = this.situation?.seed ?? 1;
    this.setExact(fight, seed, `État après application du plan (T${fight.turn})`);
    fight.state.setEventLog(false);
    const res = this.viewResult([]);
    const status = res.view.status.text;
    return {
      replay,
      view: res.view,
      situation: res.situation,
      message: [`Plan appliqué (${req.rolls === 'average' ? 'jets moyens' : 'jets aléatoires de la graine'}). ${status}.`, ...messages].join(' '),
    };
  }

  // ------------------------------------------------------------------ simulation

  private simulate(spec: SimSpec, progress: ProgressFn): SimResult {
    let builder: ReplayBuilder | null = null;
    let fightRef: GladiatroolFight | null = null;
    progress({ phase: 'Mise en place du combat…', fraction: 0 });
    const result = runFight(
      { compo: spec.compo, seed: spec.seed },
      {
        mode: spec.mode,
        maxTurn: spec.maxTurn,
        monsters: spec.monsters,
        configOverrides: spec.overrides,
        journal: true,
        journalIndex: true,
        trace: true,
        hooks: {
          onPlayerTurn: (fight, id) => {
            fightRef = fight;
            builder ??= new ReplayBuilder(fight, 'Début du combat');
            const expected = Math.max(10, Math.min(spec.maxTurn, 12));
            progress({ phase: `Tour ${fight.turn} — ${fight.state.fighters[id]?.name ?? ''} planifie (${spec.mode})`, fraction: Math.min(0.97, (fight.turn - 1) / expected) });
          },
          onStep: (fight, step, index) => {
            fightRef = fight;
            builder ??= new ReplayBuilder(fight, 'Début du combat');
            builder.step(fight, step, index);
          },
        },
      },
    );
    progress({ phase: 'Préparation du rejeu…', fraction: 0.99 });
    const { journal, trace, journalAt, ...summary } = result;
    if (!builder || !fightRef || !trace) throw new Error('combat vide');
    const b = builder as ReplayBuilder;
    b.labelChoices(result.choices.map((c) => `${c.kind} — ${c.fighter} : ${c.label}`));
    const replay = b.build(fightRef, journal && journalAt ? { lines: journal, at: journalAt } : undefined);
    this.lastSim = { trace, spec, frames: replay.frames.map((f) => ({ step: f.step, playerTurn: f.playerTurn, turn: f.turn })) };
    return { spec, summary, replay, resultLine: resultLine(result) };
  }

  // ------------------------------------------------------------------ planifier depuis un point du rejeu

  private point(frame: number, progress: ProgressFn): LoadResult & { label: string } {
    const sim = this.lastSim;
    if (!sim) throw new Error('aucune simulation en mémoire');
    let j = frame;
    while (j < sim.frames.length && !sim.frames[j]!.playerTurn) j++;
    if (j >= sim.frames.length) throw new Error('plus aucun tour de joueur après ce point (combat terminé)');
    progress({ phase: 'Reconstruction exacte de l\'état (rejeu de la trace)…', fraction: null });
    const target = sim.frames[j]!;
    const { fight, status } = replayTrace(sim.trace, { step: target.step + 1 });
    if (status.kind !== 'playerTurn') throw new Error(`rejeu : point de décision « ${status.kind} » (tour de joueur attendu)`);
    const who = fight.state.fighters[status.fighterId]!.name;
    const label = `Simulation ${sim.spec.compo} graine ${sim.spec.seed} — T${fight.turn}, tour de ${who}${j !== frame ? ' (premier tour de joueur après le point choisi)' : ''}`;
    this.setExact(fight, sim.spec.seed, label);
    if (this.situation) this.situation = { ...this.situation, ...(Object.keys(sim.spec.overrides).length ? { configOverrides: sim.spec.overrides } : {}) };
    return { ...this.viewResult([]), label };
  }
}
