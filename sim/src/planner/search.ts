/**
 * Recherche du meilleur tour d'un joueur (ÉTUDE §10) :
 *
 * 1. **Beam search** sur les macro-actions du tour (actions.ts) : chaque nœud est une COPIE du combat (API publique :
 *    ``playerMove`` / ``playerCast``, choix résolus par la politique) évaluée statiquement (evaluate.ts) ; à chaque
 *    profondeur, les enfants de tous les nœuds du faisceau sont dédupliqués (empreinte d'état : A puis B = B puis A)
 *    et les ``beamWidth`` meilleurs sont développés.
 * 2. **Feuilles** : pour chaque nœud gardé (racine comprise) — « finir le tour ici » et « finir en se déplaçant vers
 *    m » (meilleures positions de fin de tour) — évaluées statiquement.
 * 3. **Anticipation** des meilleures feuilles : copie en ``rollMode`` moyen sans critique, fin du tour, tours des
 *    monstres par le contrôleur injecté jusqu'au prochain joueur (option : jusqu'à la fin du tour global, coéquipiers
 *    gloutons), puis évaluation statique de l'état atteint : c'est le score final.
 *
 * Modes : ``fast`` (≤ 150 ms par tour de joueur, simulations Monte Carlo), ``deep`` (≤ 3 s, interface), ``greedy``
 * (coéquipiers pendant l'anticipation). Le budget est d'abord un budget de nœuds (résultat déterministe) ; le plafond
 * de temps n'est qu'un garde-fou (``deterministic: true`` le supprime).
 */
import { simpleMonsterController, type GladiatroolFight, type TurnController } from '../scenario/index.js';
import { generateCastActions, generateEndMoves, type MacroAction } from './actions.js';
import { defaultChoicePolicy, resolveChoicesWith, type ChoicePolicy } from './choicePolicy.js';
import { evaluateState } from './evaluate.js';
import { describeMacro, explanationText, summarize } from './explain.js';
import {
  actorStillPlaying,
  applyMacro,
  now,
  planningClone,
  runLookahead,
  stateHash,
  type LookaheadConfig,
} from './simulate.js';
import type {
  AssumedChoice,
  ExecuteResult,
  PlanAlternative,
  PlannedAction,
  PlannerMode,
  PlanOptions,
  PlayerPlan,
  SearchBudget,
  SearchStats,
} from './types.js';
import { mergeWeights, type PlannerWeights } from './weights.js';

/** Budgets par mode (surchargeables par ``PlanOptions.budget``). */
export const BUDGETS: Readonly<Record<PlannerMode, Readonly<SearchBudget>>> = Object.freeze({
  fast: Object.freeze({
    beamWidth: 3,
    maxCandidates: 40,
    perSpellQuota: 6,
    maxDepth: 4,
    endPositions: 2,
    lookaheadLeaves: 4,
    lookahead: 'nextPlayer',
    timeLimitMs: 150,
    alternatives: 3,
  }),
  deep: Object.freeze({
    beamWidth: 8,
    maxCandidates: 220,
    perSpellQuota: 25,
    maxDepth: 6,
    endPositions: 5,
    lookaheadLeaves: 16,
    lookahead: 'nextPlayer',
    timeLimitMs: 3000,
    alternatives: 5,
  }),
  greedy: Object.freeze({
    beamWidth: 1,
    maxCandidates: 16,
    perSpellQuota: 3,
    maxDepth: 3,
    endPositions: 1,
    lookaheadLeaves: 0,
    lookahead: 'none',
    timeLimitMs: 40,
    alternatives: 0,
  }),
}) as Readonly<Record<PlannerMode, Readonly<SearchBudget>>>;

/** Options résolues (défauts appliqués). */
export interface ResolvedOptions {
  mode: PlannerMode;
  budget: SearchBudget;
  weights: PlannerWeights;
  lookahead: LookaheadConfig;
  policy: ChoicePolicy;
  rollMode: NonNullable<PlanOptions['rollMode']>;
  critMode: NonNullable<PlanOptions['critMode']>;
  explain: boolean;
}

export function resolveOptions(opts: PlanOptions = {}): ResolvedOptions {
  const mode = opts.mode ?? 'fast';
  const budget: SearchBudget = { ...BUDGETS[mode], ...(opts.budget ?? {}) };
  if (opts.deterministic) budget.timeLimitMs = null;
  const weights = mergeWeights(opts.weights);
  const policy = opts.choicePolicy ?? defaultChoicePolicy;
  const monsters = opts.monsterController ?? simpleMonsterController;
  let teammate: TurnController | null = opts.teammateController ?? null;
  if (!teammate && budget.lookahead === 'globalTurn') {
    teammate = createPlannerController({
      mode: 'greedy',
      weights: opts.weights,
      monsterController: monsters,
      choicePolicy: policy,
      deterministic: opts.deterministic,
      explain: false,
    });
  }
  return {
    mode,
    budget,
    weights,
    lookahead: { mode: budget.lookahead, monsters, policy, teammate },
    policy,
    rollMode: opts.rollMode ?? 'average',
    critMode: opts.critMode ?? 'never',
    explain: opts.explain ?? true,
  };
}

interface Node {
  fight: GladiatroolFight;
  parent: Node | null;
  macro: MacroAction | null;
  depth: number;
  score: number;
  hash: number;
  choices: AssumedChoice[];
  /** Le joueur joue encore (vivant, combat en cours, pas de fin de tour forcée). */
  alive: boolean;
}

/** Feuille : fin du tour après une suite de macro-actions (et un déplacement final éventuel). */
export interface Leaf {
  node: Node;
  endMove: MacroAction | null;
  /** État avant la fin du tour. */
  fight: GladiatroolFight;
  staticScore: number;
  /** Score final (anticipation si elle a eu lieu, sinon statique). */
  score: number;
  /** État atteint par l'anticipation (null : pas d'anticipation). */
  look: GladiatroolFight | null;
  choices: AssumedChoice[];
}

export interface SearchOutcome {
  root: GladiatroolFight;
  actorId: number;
  /** Feuilles classées (meilleure d'abord) : anticipées, puis les autres par score statique. */
  ranked: Leaf[];
  stats: SearchStats;
  options: ResolvedOptions;
}

/** Recherche brute (états internes compris) : utilisée par ``planPlayerTurn`` et ``planTeamTurn``. */
export function searchPlayerTurn(fight: GladiatroolFight, opts: PlanOptions | ResolvedOptions = {}): SearchOutcome {
  const t0 = now();
  const R = 'lookahead' in opts && typeof opts.lookahead === 'object' ? (opts as ResolvedOptions) : resolveOptions(opts as PlanOptions);
  const st = fight.getStatus();
  if (st.kind !== 'playerTurn') {
    throw new Error(`Planificateur : ce n'est pas le tour d'un joueur (point de décision « ${st.kind} »)`);
  }
  const actorId = st.fighterId;
  const B = R.budget;
  const w = R.weights;
  const limit = B.timeLimitMs;
  const expandDeadline = limit === null ? Infinity : t0 + 0.55 * limit;
  const leafDeadline = limit === null ? Infinity : t0 + 0.7 * limit;
  const deadline = limit === null ? Infinity : t0 + limit;
  const stats: SearchStats = {
    nodes: 0,
    simulations: 0,
    candidates: 0,
    leaves: 0,
    lookaheads: 0,
    depthReached: 0,
    timeMs: 0,
    truncated: false,
  };

  const root = planningClone(fight, R.rollMode, R.critMode);
  const rootNode: Node = {
    fight: root,
    parent: null,
    macro: null,
    depth: 0,
    score: evaluateState(root, w),
    hash: stateHash(root),
    choices: [],
    alive: true,
  };
  const kept: Node[] = [rootNode];
  const terminal: Node[] = [];
  const seen = new Set<number>([rootNode.hash]);
  let beam: Node[] = [rootNode];
  for (let depth = 0; depth < B.maxDepth && beam.length; depth++) {
    const children: Node[] = [];
    for (const node of beam) {
      if (now() > expandDeadline) {
        stats.truncated = true;
        break;
      }
      const cands = generateCastActions(node.fight, { maxCandidates: B.maxCandidates, perSpellQuota: B.perSpellQuota, weights: w });
      stats.nodes++;
      stats.candidates += cands.length;
      for (const macro of cands) {
        const out = applyMacro(node.fight, macro, R.policy);
        stats.simulations++;
        if (!out.ok) continue;
        const h = stateHash(out.fight);
        if (seen.has(h)) continue;
        seen.add(h);
        const child: Node = {
          fight: out.fight,
          parent: node,
          macro,
          depth: depth + 1,
          score: evaluateState(out.fight, w),
          hash: h,
          choices: out.choices,
          alive: actorStillPlaying(out.fight, actorId),
        };
        if (child.alive) children.push(child);
        else terminal.push(child);
      }
    }
    children.sort((a, b) => b.score - a.score);
    beam = children.slice(0, B.beamWidth);
    if (beam.length) stats.depthReached = depth + 1;
    kept.push(...beam);
  }

  // ------------------------------------------------------------------ feuilles
  const leaves: Leaf[] = [];
  const leafSeen = new Set<number>();
  const addLeaf = (node: Node, endMove: MacroAction | null, f: GladiatroolFight, choices: AssumedChoice[], score?: number): void => {
    const h = (stateHash(f) * 31 + (f.getCurrentFighter()?.cell ?? -1)) >>> 0;
    if (leafSeen.has(h)) return;
    leafSeen.add(h);
    const s = score ?? evaluateState(f, w);
    leaves.push({ node, endMove, fight: f, staticScore: s, score: s, look: null, choices });
  };
  for (const node of kept) {
    addLeaf(node, null, node.fight, [], node.score);
    if (now() > leafDeadline) {
      stats.truncated = true;
      continue;
    }
    for (const mv of generateEndMoves(node.fight, B.endPositions, w)) {
      const out = applyMacro(node.fight, mv, R.policy);
      stats.simulations++;
      if (out.ok) addLeaf(node, mv, out.fight, out.choices);
    }
  }
  for (const node of terminal) addLeaf(node, null, node.fight, [], node.score);
  leaves.sort((a, b) => b.staticScore - a.staticScore);
  stats.leaves = leaves.length;

  // ------------------------------------------------------------------ anticipation
  let ranked: Leaf[];
  if (B.lookahead === 'none' || B.lookaheadLeaves <= 0) {
    ranked = leaves;
  } else {
    const n = Math.min(leaves.length, B.lookaheadLeaves);
    const looked: Leaf[] = [];
    for (let i = 0; i < n; i++) {
      if (i > 0 && now() > deadline) {
        stats.truncated = true;
        break;
      }
      const leaf = leaves[i]!;
      leaf.look = runLookahead(leaf.fight, actorId, R.lookahead);
      leaf.score = evaluateState(leaf.look, w);
      stats.lookaheads++;
      looked.push(leaf);
    }
    looked.sort((a, b) => b.score - a.score);
    ranked = looked.concat(leaves.slice(looked.length));
  }
  stats.timeMs = now() - t0;
  return { root, actorId, ranked, stats, options: R };
}

/** Chaîne de nœuds racine → feuille (racine exclue). */
function chain(leaf: Leaf): Node[] {
  const out: Node[] = [];
  for (let n: Node | null = leaf.node; n && n.parent; n = n.parent) out.push(n);
  return out.reverse();
}

/** Actions sérialisables d'une feuille. */
export function leafActions(leaf: Leaf): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const n of chain(leaf)) {
    const m = n.macro!;
    if (m.path.length) out.push({ type: 'move', path: m.path.slice() });
    if (m.spellLevelId !== null) out.push({ type: 'cast', spellLevelId: m.spellLevelId, cell: m.cell });
  }
  if (leaf.endMove && leaf.endMove.path.length) out.push({ type: 'move', path: leaf.endMove.path.slice() });
  if (leaf.node.alive) out.push({ type: 'end' });
  return out;
}

/** Choix supposés le long d'une feuille. */
function leafChoices(leaf: Leaf): AssumedChoice[] {
  const out: AssumedChoice[] = [];
  for (const n of chain(leaf)) out.push(...n.choices);
  out.push(...leaf.choices);
  return out;
}

/** Plan sérialisable (actions, score, explication, bilan) d'une feuille. */
export function leafToAlternative(outcome: SearchOutcome, leaf: Leaf): PlanAlternative {
  const R = outcome.options;
  const summary = summarize(outcome.root, leaf.fight, leaf.look, outcome.actorId, R.weights);
  let explanation = '';
  if (R.explain) {
    const lines: string[] = [];
    for (const n of chain(leaf)) lines.push(describeMacro(n.parent!.fight, n.fight, n.macro!, outcome.actorId, false));
    if (leaf.endMove) lines.push(describeMacro(leaf.node.fight, leaf.fight, leaf.endMove, outcome.actorId, true));
    explanation = explanationText(lines, summary, leaf.score);
  }
  return { actions: leafActions(leaf), score: leaf.score, staticScore: leaf.staticScore, explanation, summary };
}

/**
 * Meilleur tour du joueur dont c'est le tour : séquence d'actions (sérialisable), score, explication en français,
 * bilan structuré et ``alternatives`` (les suivantes du classement). Le combat passé n'est PAS modifié (voir
 * ``executePlan``).
 */
export function planPlayerTurn(fight: GladiatroolFight, opts: PlanOptions = {}): PlayerPlan {
  const outcome = searchPlayerTurn(fight, opts);
  return outcomeToPlan(outcome);
}

/** Plan d'un joueur à partir du résultat brut de la recherche. */
export function outcomeToPlan(outcome: SearchOutcome, bestIndex = 0): PlayerPlan {
  const R = outcome.options;
  const best = outcome.ranked[bestIndex]!;
  const main = leafToAlternative(outcome, best);
  const alternatives: PlanAlternative[] = [];
  for (let i = 0; i < outcome.ranked.length && alternatives.length < R.budget.alternatives; i++) {
    if (i === bestIndex) continue;
    const l = outcome.ranked[i]!;
    if (l.look === null && best.look !== null) break;
    alternatives.push(leafToAlternative(outcome, l));
  }
  const actor = outcome.root.state.fighters[outcome.actorId]!;
  return {
    ...main,
    fighterId: actor.id,
    fighterName: actor.name,
    turn: outcome.root.turn,
    mode: R.mode,
    alternatives,
    assumedChoices: leafChoices(best),
    stats: { ...outcome.stats },
  };
}

// ---------------------------------------------------------------------------------------------
// Exécution d'un plan
// ---------------------------------------------------------------------------------------------

/**
 * Applique un plan au combat par l'API publique (``playerMove`` / ``playerCast`` / ``endTurn``) ; les choix qui
 * apparaissent sont résolus par ``choicePolicy``. S'arrête à la première action refusée (les jets réels peuvent
 * différer des jets moyens du plan : il faut alors replanifier). ``endTurn: false`` : l'action ``end`` est ignorée.
 */
export function executePlan(
  fight: GladiatroolFight,
  actions: readonly PlannedAction[],
  o: { choicePolicy?: ChoicePolicy; endTurn?: boolean } = {},
): ExecuteResult {
  const policy = o.choicePolicy ?? defaultChoicePolicy;
  const choices: AssumedChoice[] = [];
  let executed = 0;
  resolveChoicesWith(fight, policy, choices);
  const st = fight.getStatus();
  if (st.kind !== 'playerTurn') return { ok: false, executed, reason: "ce n'est pas le tour d'un joueur", choices };
  const actorId = st.fighterId;
  for (const a of actions) {
    if (a.type === 'end') {
      if ((o.endTurn ?? true) && actorStillPlaying(fight, actorId)) fight.endTurn();
      executed++;
      break;
    }
    if (!actorStillPlaying(fight, actorId)) return { ok: false, executed, reason: 'le tour du joueur est terminé', choices };
    const r = a.type === 'move' ? fight.playerMove(a.path) : fight.playerCast(a.spellLevelId, a.cell);
    if (!r.ok) return { ok: false, executed, reason: r.reason ?? r.code ?? 'action refusée', choices };
    executed++;
    resolveChoicesWith(fight, policy, choices);
  }
  return { ok: true, executed, choices };
}

export interface PlannerControllerOptions extends PlanOptions {
  /** Replanifications au plus quand une action du plan est refusée (jets réels ≠ jets moyens). Défaut 2. */
  maxReplans?: number;
}

/**
 * Contrôleur de joueur (``TurnController`` du scénario, pour ``playUntilEnd`` ou un runner) : planifie puis exécute
 * le tour (sans le terminer : l'appelant le termine) ; replanifie si une action est refusée.
 */
export function createPlannerController(opts: PlannerControllerOptions = {}): TurnController {
  const maxReplans = opts.maxReplans ?? 2;
  return {
    playTurn(fight, fighterId) {
      for (let attempt = 0; attempt <= maxReplans; attempt++) {
        resolveChoicesWith(fight, opts.choicePolicy ?? defaultChoicePolicy);
        if (!actorStillPlaying(fight, fighterId)) return;
        const plan = planPlayerTurn(fight, { ...opts, explain: opts.explain ?? false });
        const r = executePlan(fight, plan.actions, { choicePolicy: opts.choicePolicy, endTurn: false });
        if (r.ok) return;
      }
    },
  };
}
