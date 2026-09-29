/**
 * Décision d'un monstre pour son tour (ou le reste de son tour) : recherche sur le plateau de l'IA (board.ts), sans
 * toucher à l'état du combat.
 *
 * Forme d'un tour : [déplacement] → lancers → [déplacement final avec les PM restants]. Pour chaque case de départ
 * candidate (atteignable dans les PM, sans entrer dans les pics si ``avoidSpikes``), la séquence de lancers est
 * construite :
 *
 * - ``ai.sequenceMode = profile`` (défaut) : règles du profil dans l'ordre (``ai.profiles.<profil>.spells`` :
 *   ``when``, ``times``, ``maxTargets``, ``count``), chaque règle lancée tant qu'elle est applicable et utile, sur la
 *   meilleure case selon l'utilité (utility.ts) ;
 * - ``greedy`` : à chaque pas, le lancer d'utilité maximale parmi tous les sorts ; les sorts sans effet immédiat
 *   (Patroolleur) sont essayés en tête.
 *
 * Puis déplacement final vers la distance préférée du profil. La meilleure séquence (utilité maximale, égalités :
 * moins de PM, puis ordre de découverte des cases) est retenue. ``moveBeforeCast`` faux : le monstre ne se déplace
 * avant de lancer que s'il ne peut rien lancer depuis sa case.
 *
 * Tours passés (``TurnMemo``, calculé au début du tour) : dans les pics avec ``skipIfInSpikes`` → ne bouge pas (lance
 * seulement ce qui est possible depuis sa case) ; aucun ennemi à portée d'engagement (``engageRadius``, défaut PM +
 * portée maximale) avec ``skipIfNoTargetReachable`` → idem ; sinon il avance.
 */
import { CELL_COUNT, distance, reachableCells, type Reachability } from '../geometry/index.js';
import type { CompiledSpellLevel } from '../engine/index.js';
import type { Board } from './board.js';
import type { AiSettings, ResolvedRule } from './settings.js';
import { boardCanCastOn, boardCanCastSpell, boardCast, spellInfo, type SpellInfo } from './simulate.js';
import { chooseFocus, FORBIDDEN, isThreatened, positionDeviation, targetWeights, utility, type EvalContext } from './utility.js';

/** Action d'un plan. */
export type PlanStep = { readonly kind: 'move'; readonly path: readonly number[] } | { readonly kind: 'cast'; readonly spellLevelId: number; readonly cell: number };

/** Mode de tour décidé au début du tour. */
export type TurnMode = 'act' | 'stayInSpikes' | 'noTarget' | 'advance';

/** Décisions prises au début du tour (focalisation, tour passé), gardées pour les re-planifications du tour. */
export interface TurnMemo {
  readonly focusId: number;
  readonly startedInSpikes: boolean;
  readonly mode: TurnMode;
}

export interface PlanOptions {
  /** Nombre maximal de cases de départ évaluées (les plus proches de la cible) ; null = toutes. */
  readonly maxStartCells?: number | null;
  /** Nombre de séquences retenues pour l'optimisation du déplacement final (défaut 3). */
  readonly finalMoveCandidates?: number;
}

export interface MonsterPlan {
  readonly actorId: number;
  readonly steps: PlanStep[];
  /** Cases prévues de chaque combattant après chaque action (−1 : mort). */
  readonly predicted: (readonly number[])[];
  /** Utilité du plan (PV équivalents). */
  readonly value: number;
  readonly mode: TurnMode;
  /** Plateau prévu à la fin du plan. */
  readonly board: Board;
}

const EPS = 1e-6;
/** Gain minimal (PV équivalents) pour qu'un lancer soit jugé utile. */
const MIN_GAIN = 1;

interface Seq {
  board: Board;
  steps: PlanStep[];
  predicted: (readonly number[])[];
  value: number;
  mpUsed: number;
  order: number;
}

/** Portée maximale (PO + zone) des sorts offensifs (et de soutien si ``support``) du monstre, bonus de PO compris. */
function maxReach(b: Board, spells: readonly CompiledSpellLevel[], support: boolean): number {
  const f = b.fighter(b.actor);
  let r = 0;
  for (const sp of spells) {
    const info = spellInfo(b, sp);
    if (!info.offensive && !(support && (info.heals || info.swapsAlly))) continue;
    r = Math.max(r, info.maxRange + (sp.castSpec.rangeCanBeBoosted ? Math.max(0, f.range) : 0) + info.areaRadius);
  }
  return r;
}

function actorSpells(b: Board): CompiledSpellLevel[] {
  const f = b.fighter(b.actor);
  const ctx = b.env.ctx;
  const out: CompiledSpellLevel[] = [];
  for (const s of f.spells) if (ctx.hasSpell(s.spellLevelId)) out.push(ctx.getSpell(s.spellLevelId));
  return out;
}

/** Décisions du début de tour (le plateau a son acteur, au début de son tour). */
export function turnMemo(b: Board, settings: AiSettings): TurnMemo {
  const actor = b.actor;
  const focusId = chooseFocus(b, actor, settings);
  const inSpikes = b.inSpikes[actor] === 1;
  if (inSpikes && settings.skipIfInSpikes) return { focusId, startedInSpikes: true, mode: 'stayInSpikes' };
  const cell = b.cell[actor]!;
  let nearest = Infinity;
  for (let i = 0; i < b.s.n; i++) if (b.isOn(i) && b.areEnemies(actor, i)) nearest = Math.min(nearest, distance(cell, b.cell[i]!));
  const radius = settings.engageRadius ?? b.mp + maxReach(b, actorSpells(b), false);
  const engaged = nearest <= radius;
  const mode: TurnMode = engaged ? 'act' : settings.skipIfNoTargetReachable ? 'noTarget' : 'advance';
  return { focusId, startedInSpikes: inSpikes, mode };
}

/** Contexte d'évaluation d'une décision depuis le plateau ``b`` (acteur désigné). */
export function evalContext(b: Board, settings: AiSettings, memo: TurnMemo): EvalContext {
  return {
    actor: b.actor,
    settings,
    base: b,
    targetWeight: targetWeights(b, b.actor, settings, memo.focusId),
    focusId: memo.focusId,
    startedInSpikes: memo.startedInSpikes,
  };
}

// ---------------------------------------------------------------------------------------------
// Candidats
// ---------------------------------------------------------------------------------------------

/** Cases ciblées pertinentes pour ``spell`` depuis la case courante de l'acteur (lançables, filtrées). */
function candidateCells(b: Board, spell: CompiledSpellLevel, info: SpellInfo, settings: AiSettings): number[] {
  const actor = b.actor;
  const from = b.cell[actor]!;
  if (info.targeting === 'self') return boardCanCastOn(b, spell, from) ? [from] : [];
  const n = b.s.n;
  const out: number[] = [];
  if (info.targeting === 'single') {
    // cases des combattants concernés (ennemis ; alliés pour les soins / échanges), dans l'ordre des ids
    for (let t = 0; t < n; t++) {
      if (t === actor || !b.isOn(t)) continue;
      let ok = false;
      if (b.areEnemies(actor, t)) ok = info.offensive;
      else if (b.areAllies(actor, t)) ok = info.heals || info.swapsAlly || (settings.monstersCanTargetAllies && info.offensive);
      if (ok && boardCanCastOn(b, spell, b.cell[t]!)) out.push(b.cell[t]!);
    }
    return out;
  }
  // zone ou case libre : cases à portée de zone d'un ennemi (compteurs réutilisés, sans allocation)
  const grid = b.env.grid;
  const r = info.targeting === 'freeCell' ? Math.max(1, info.areaRadius) : info.areaRadius;
  const stamp = ++counterStamp;
  const touched: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!b.isOn(i) || !b.areEnemies(actor, i)) continue;
    const ec = b.cell[i]!;
    for (const c of cellsWithin(ec, r)) {
      if (counterGen[c] !== stamp) {
        counterGen[c] = stamp;
        counter[c] = 0;
        touched.push(c);
      }
      counter[c] += info.targeting === 'area' && c === ec ? 2 : 1;
    }
  }
  touched.sort((x, y) => x - y);
  for (const c of touched) {
    if (info.targeting === 'freeCell') {
      if (settings.avoidSpikes && grid.isSpike(c) && !b.inSpikes[actor]) continue;
    } else if (counter[c]! < 2) continue; // zone : case d'un ennemi, ou case couvrant au moins deux ennemis
    if (boardCanCastOn(b, spell, c)) out.push(c);
  }
  return out;
}

const counter = new Int32Array(CELL_COUNT);
const counterGen = new Int32Array(CELL_COUNT);
let counterStamp = 0;

const withinCache = new Map<number, number[]>();

/** Cases de la carte à distance de Manhattan ≤ ``r`` de ``cell`` (en cache). */
function cellsWithin(cell: number, r: number): readonly number[] {
  const key = cell * 64 + r;
  let out = withinCache.get(key);
  if (!out) {
    out = [];
    for (let c = 0; c < CELL_COUNT; c++) if (distance(c, cell) <= r) out.push(c);
    withinCache.set(key, out);
  }
  return out;
}

/** Nombre d'ennemis touchés (PV perdus ou déplacés) entre ``before`` et ``after``. */
function enemiesAffected(before: Board, after: Board): number {
  let k = 0;
  const actor = before.actor;
  for (let i = 0; i < before.s.n; i++) {
    if (!before.isOn(i) || !before.areEnemies(actor, i)) continue;
    if (after.hp[i]! < before.hp[i]! - EPS || after.cell[i] !== before.cell[i]) k++;
  }
  return k;
}

interface Pick {
  board: Board;
  cell: number;
  value: number;
  hits: number;
}

/**
 * Meilleur lancer de ``spell`` parmi ``cells`` (``key`` : nombre d'ennemis touchés d'abord si ``byTargets``).
 * Renvoie null si aucun.
 */
function bestOf(b: Board, spell: CompiledSpellLevel, cells: readonly number[], ctx: EvalContext, byTargets: boolean): Pick | null {
  let best: Pick | null = null;
  let scratch: Board | null = null;
  for (const c of cells) {
    const nb: Board = scratch ? scratch.copyFrom(b) : b.clone();
    scratch = null;
    boardCast(nb, spell, c);
    const v = utility(nb, ctx);
    const hits = byTargets ? enemiesAffected(b, nb) : 0;
    if (!best || hits > best.hits || (hits === best.hits && v > best.value + EPS)) {
      if (best) scratch = best.board; // ancien meilleur réutilisé comme brouillon
      best = { board: nb, cell: c, value: v, hits };
    } else scratch = nb;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------
// Règles du profil
// ---------------------------------------------------------------------------------------------

function enemyWithin(b: Board, lo: number, hi: number): boolean {
  const actor = b.actor;
  const cell = b.cell[actor]!;
  for (let i = 0; i < b.s.n; i++) {
    if (!b.isOn(i) || !b.areEnemies(actor, i)) continue;
    const d = distance(cell, b.cell[i]!);
    if (d >= lo && d <= hi) return true;
  }
  return false;
}

/** Un sort offensif (autre que ``except``) du monstre atteint un ennemi depuis sa case. */
function enemyReachable(b: Board, spells: readonly CompiledSpellLevel[], except: CompiledSpellLevel, settings: AiSettings): boolean {
  for (const sp of spells) {
    if (sp === except) continue;
    const info = spellInfo(b, sp);
    if (!info.offensive) continue;
    if (candidateCells(b, sp, info, settings).length) return true;
  }
  return false;
}

/** Choix d'une case pour une règle du profil (null : règle non applicable). */
function pickForRule(b: Board, rule: ResolvedRule, spell: CompiledSpellLevel, spells: readonly CompiledSpellLevel[], ctx: EvalContext): Pick | null {
  const settings = ctx.settings;
  const info = spellInfo(b, spell);
  const actor = b.actor;
  const cur = utility(b, ctx);
  let cells = candidateCells(b, spell, info, settings);
  if (!cells.length) return null;
  const gainOk = (p: Pick | null): Pick | null => (p && p.value > cur + MIN_GAIN ? p : null);
  switch (rule.when) {
    case 'enemyReachable': {
      if (!enemyReachable(b, spells, spell, settings)) return null;
      return bestOf(b, spell, cells, ctx, false);
    }
    case 'targetAtDistance2': {
      const from = b.cell[actor]!;
      cells = cells.filter((c) => {
        const t = b.at(c);
        return t >= 0 && b.areEnemies(actor, t) && distance(from, c) === 2;
      });
      return gainOk(bestOf(b, spell, cells, ctx, false));
    }
    case 'enemyInRing1to2':
      if (!enemyWithin(b, 1, 2)) return null;
      return gainOk(bestOf(b, spell, cells, ctx, false));
    case 'maxTargets': {
      const p = bestOf(b, spell, cells, ctx, true);
      return p && p.hits >= 1 && p.value > cur + MIN_GAIN ? p : null;
    }
    case 'playersInZoneAtLeast': {
      const p = bestOf(b, spell, cells, ctx, true);
      return p && p.hits >= rule.count ? p : null;
    }
    case 'mostInjuredAlly': {
      const threshold = settings.healThresholdPct;
      const hurt: number[] = [];
      for (let i = 0; i < b.s.n; i++) {
        if (!b.isOn(i) || !b.areAllies(actor, i)) continue;
        if ((b.hp[i]! * 100) / Math.max(1, b.maxHp(i)) < threshold) hurt.push(i);
      }
      hurt.sort((x, y) => b.hp[x]! / b.maxHp(x) - b.hp[y]! / b.maxHp(y) || x - y);
      for (const i of hurt) {
        const c = b.cell[i]!;
        const p = gainOk(bestOf(b, spell, cells.filter((x) => x === c || (info.targeting === 'area' && distance(x, c) <= info.areaRadius)), ctx, false));
        if (p) return p;
      }
      return null;
    }
    case 'threatenedAlly': {
      const dmax = settings.weights.threatenedAllyDistance;
      cells = cells.filter((c) => {
        const t = b.at(c);
        return t >= 0 && t !== actor && b.areAllies(actor, t) && !b.unshakable[t] && isThreatened(b, t, dmax);
      });
      return gainOk(bestOf(b, spell, cells, ctx, false));
    }
    case 'nearLowestHpPlayer': {
      const focus = ctx.focusId >= 0 && b.isOn(ctx.focusId) ? ctx.focusId : chooseFocus(b, actor, { ...settings, focus: 'lowestHp' });
      if (focus < 0) return null;
      const fc = b.cell[focus]!;
      return gainOk(bestOf(b, spell, cells.filter((c) => distance(c, fc) === 1), ctx, false));
    }
    case 'pushTowardSpikes':
    case 'anyTarget':
    default:
      return gainOk(bestOf(b, spell, cells, ctx, false));
  }
}

function snapshotCells(b: Board): number[] {
  const out = new Array<number>(b.s.n);
  for (let i = 0; i < b.s.n; i++) out[i] = b.alive[i] ? b.cell[i]! : -1;
  return out;
}

/** Le sort déplace son lanceur (téléportation, échange) : sa règle est facultative (variante sans elle). */
function movesCaster(spell: CompiledSpellLevel): boolean {
  return spell.effects.some((e) => !e.disabled && (e.handler === 'teleport' || e.handler === 'exchange'));
}

/** Une passe du profil (règles dans l'ordre), en sautant la règle ``skip`` (−1 : aucune). */
function profileRun(start: Board, ctx: EvalContext, seq: Seq, spells: readonly CompiledSpellLevel[], skip: number): void {
  const ectx = start.env.ctx;
  let b = start;
  const rules = ctx.settings.rules;
  for (let r = 0; r < rules.length; r++) {
    const rule = rules[r]!;
    if (r === skip || !ectx.hasSpell(rule.spellLevelId)) continue;
    const spell = ectx.getSpell(rule.spellLevelId);
    for (let k = 0; k < rule.times && k < 8; k++) {
      if (!b.alive[b.actor] || !boardCanCastSpell(b, spell)) break;
      const p = pickForRule(b, rule, spell, spells, ctx);
      if (!p) break;
      b = p.board;
      seq.steps.push({ kind: 'cast', spellLevelId: spell.id, cell: p.cell });
      seq.predicted.push(snapshotCells(b));
    }
  }
  seq.board = b;
}

/**
 * Séquence de lancers selon le profil (règles dans l'ordre). Les règles dont le sort déplace le lanceur (Troollement
 * de Tambour, Troollooportation) sont facultatives : la passe sans chacune d'elles est aussi évaluée et la meilleure
 * utilité finale est retenue (sinon un échange peut éloigner le Nitrooll de ses cibles de poussée).
 */
function profileSequence(start: Board, ctx: EvalContext, seq: Seq): void {
  const spells = actorSpells(start);
  const ectx = start.env.ctx;
  const rules = ctx.settings.rules;
  const run = (skip: number): Seq => {
    const v: Seq = { ...seq, steps: [...seq.steps], predicted: [...seq.predicted] };
    profileRun(start, ctx, v, spells, skip);
    return v;
  };
  let best = run(-1);
  let bestV = utility(best.board, ctx);
  for (let r = 0; r < rules.length; r++) {
    const id = rules[r]!.spellLevelId;
    if (!ectx.hasSpell(id) || !movesCaster(ectx.getSpell(id))) continue;
    if (!best.steps.some((st) => st.kind === 'cast' && st.spellLevelId === id)) continue;
    const v = run(r);
    const u = utility(v.board, ctx);
    if (u > bestV + EPS) {
      best = v;
      bestV = u;
    }
  }
  seq.steps = best.steps;
  seq.predicted = best.predicted;
  seq.board = best.board;
}

/** Séquence gloutonne : meilleur lancer utile à chaque pas. */
function greedyRun(start: Board, ctx: EvalContext, seq: Seq, spells: readonly CompiledSpellLevel[]): void {
  let b = start;
  for (let guard = 0; guard < 12; guard++) {
    if (!b.alive[b.actor]) break;
    const cur = utility(b, ctx);
    let best: Pick | null = null;
    let bestSpell: CompiledSpellLevel | null = null;
    for (const sp of spells) {
      if (!boardCanCastSpell(b, sp)) continue;
      const info = spellInfo(b, sp);
      const p = bestOf(b, sp, candidateCells(b, sp, info, ctx.settings), ctx, false);
      if (p && p.value > cur + MIN_GAIN && (!best || p.value > best.value + EPS)) {
        best = p;
        bestSpell = sp;
      }
    }
    if (!best || !bestSpell) break;
    b = best.board;
    seq.steps.push({ kind: 'cast', spellLevelId: bestSpell.id, cell: best.cell });
    seq.predicted.push(snapshotCells(b));
  }
  seq.board = b;
}

/** Mode glouton, avec essai des sorts « de préparation » (sur soi, sans effet offensif) en tête. */
function greedySequence(start: Board, ctx: EvalContext, seq: Seq): void {
  const spells = actorSpells(start);
  const variants: Seq[] = [];
  const plain: Seq = { ...seq, steps: [...seq.steps], predicted: [...seq.predicted] };
  greedyRun(start, ctx, plain, spells);
  variants.push(plain);
  for (const sp of spells) {
    const info = spellInfo(start, sp);
    if (!info.selfOnly || !boardCanCastSpell(start, sp) || !boardCanCastOn(start, sp, start.cell[start.actor]!)) continue;
    const nb = start.clone();
    boardCast(nb, sp, nb.cell[nb.actor]!);
    const v: Seq = { ...seq, steps: [...seq.steps, { kind: 'cast', spellLevelId: sp.id, cell: nb.cell[nb.actor]! }], predicted: [...seq.predicted, snapshotCells(nb)] };
    greedyRun(nb, ctx, v, spells);
    variants.push(v);
  }
  let best = variants[0]!;
  let bestV = utility(best.board, ctx);
  for (const v of variants.slice(1)) {
    const u = utility(v.board, ctx);
    if (u > bestV + EPS) {
      best = v;
      bestV = u;
    }
  }
  seq.steps = best.steps;
  seq.predicted = best.predicted;
  seq.board = best.board;
}

// ---------------------------------------------------------------------------------------------
// Déplacements
// ---------------------------------------------------------------------------------------------

/** Cases d'arrivée autorisées (pas d'entrée volontaire dans les pics si ``avoidSpikes``). */
function allowedDestinations(b: Board, reach: Reachability, settings: AiSettings): number[] {
  const grid = b.env.grid;
  const startIn = b.inSpikes[b.actor] === 1;
  const out: number[] = [];
  for (const c of reach.cells) {
    if (c !== reach.start && settings.avoidSpikes) {
      if (grid.isSpike(c)) continue;
      if (!startIn && reach.touchesSpikes(c)) continue;
      if (startIn && reach.spikeCells(c) > 0 && reach.crossesSpikes(c) && !grid.isSpike(reach.start)) continue;
    }
    out.push(c);
  }
  return out;
}

/**
 * Cases atteignables par l'acteur. Hors des pics avec ``avoidSpikes`` : parcours en largeur où les pics bloquent
 * (aucun chemin ne peut y passer) ; dans les pics : variante du moteur qui minimise les cases de pics traversées.
 */
function reachOf(b: Board, mp: number, settings: AiSettings): Reachability {
  const grid = b.env.grid;
  const start = b.cell[b.actor]!;
  if (settings.avoidSpikes && !b.inSpikes[b.actor] && !grid.isSpike(start)) {
    const occ = b.isOccupied;
    return reachableCells(grid, start, mp, (c) => occ(c) || grid.isSpike(c));
  }
  return reachableCells(grid, start, mp, b.isOccupied, { avoidSpikes: settings.avoidSpikes });
}

/** Déplacement final (PM restants) vers la distance préférée ; modifie ``seq``. */
function finalMove(seq: Seq, ctx: EvalContext): void {
  const b = seq.board;
  const actor = b.actor;
  if (!b.alive[actor] || b.mp <= 0 || b.fighter(actor).rooted) return;
  const reach = reachOf(b, b.mp, ctx.settings);
  const dests = allowedDestinations(b, reach, ctx.settings);
  const here = b.cell[actor]!;
  let best = here;
  let bestDev = positionDeviation(b, ctx, here);
  let bestCost = 0;
  for (const c of dests) {
    if (c === here) continue;
    const dev = positionDeviation(b, ctx, c);
    const cost = reach.cost(c);
    if (dev < bestDev - EPS || (Math.abs(dev - bestDev) < EPS && best !== here && cost < bestCost)) {
      best = c;
      bestDev = dev;
      bestCost = cost;
    }
  }
  if (best === here) return;
  const path = reach.path(best);
  if (!path || !path.length) return;
  const nb = b.clone();
  nb.walk(actor, path);
  const u = utility(nb, ctx);
  if (u <= utility(b, ctx) + EPS) return;
  seq.board = nb;
  seq.steps.push({ kind: 'move', path });
  seq.predicted.push(snapshotCells(nb));
  seq.mpUsed += path.length;
}

// ---------------------------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------------------------

function emptyPlan(b: Board, mode: TurnMode, value: number): MonsterPlan {
  return { actorId: b.actor, steps: [], predicted: [], value, mode, board: b };
}

function buildSequence(start: Board, ctx: EvalContext, seq: Seq): void {
  if (ctx.settings.sequenceMode === 'greedy') greedySequence(start, ctx, seq);
  else profileSequence(start, ctx, seq);
  seq.value = utility(seq.board, ctx);
}

function castCount(s: Seq): number {
  let k = 0;
  for (const st of s.steps) if (st.kind === 'cast') k++;
  return k;
}

/**
 * Plan du monstre ``b.actor`` depuis le plateau ``b`` (PA / PM courants de l'acteur). ``memo`` : décisions du début
 * du tour (``turnMemo``). Le plateau n'est pas modifié.
 */
export function planTurn(b: Board, settings: AiSettings, memo: TurnMemo, opts: PlanOptions = {}): MonsterPlan {
  const actor = b.actor;
  const ctx = evalContext(b, settings, memo);
  const baseValue = utility(b, ctx);
  if (!b.isOn(actor)) return emptyPlan(b, memo.mode, baseValue);
  const f = b.fighter(actor);
  const canMove = memo.mode !== 'stayInSpikes' && memo.mode !== 'noTarget' && b.mp > 0 && !f.rooted;

  const evalStart = (cell: number, path: readonly number[] | null, order: number): Seq => {
    const start = path && path.length ? b.clone() : b;
    const seq: Seq = { board: start, steps: [], predicted: [], value: baseValue, mpUsed: 0, order };
    if (path && path.length) {
      start.walk(actor, path);
      seq.steps.push({ kind: 'move', path });
      seq.predicted.push(snapshotCells(start));
      seq.mpUsed = path.length;
    }
    void cell;
    buildSequence(start, ctx, seq);
    return seq;
  };

  const seqs: Seq[] = [evalStart(b.cell[actor]!, null, 0)];
  if (canMove && memo.mode !== 'advance') {
    const moveFirst = settings.moveBeforeCast || castCount(seqs[0]!) === 0;
    if (moveFirst) {
      const reach = reachOf(b, b.mp, settings);
      let dests = allowedDestinations(b, reach, settings).filter((c) => c !== reach.start);
      // élagage : cases d'où une cible (ennemi, ou allié pour les soins / échanges) est à portée
      const spells = actorSpells(b);
      const r = maxReach(b, spells, true);
      const supports = spells.some((sp) => spellInfo(b, sp).heals || spellInfo(b, sp).swapsAlly);
      dests = dests.filter((c) => {
        for (let i = 0; i < b.s.n; i++) {
          if (i === actor || !b.isOn(i)) continue;
          if (!b.areEnemies(actor, i) && !(supports && b.areAllies(actor, i))) continue;
          if (distance(c, b.cell[i]!) <= r) return true;
        }
        return false;
      });
      if (opts.maxStartCells != null && dests.length > opts.maxStartCells) {
        const anchor = memo.focusId >= 0 && b.isOn(memo.focusId) ? b.cell[memo.focusId]! : -1;
        const key = (c: number): number => {
          if (anchor >= 0) return distance(c, anchor);
          let m = Infinity;
          for (let i = 0; i < b.s.n; i++) if (b.isOn(i) && b.areEnemies(actor, i)) m = Math.min(m, distance(c, b.cell[i]!));
          return m;
        };
        dests = dests
          .map((c, k) => ({ c, k, d: key(c) }))
          .sort((x, y) => x.d - y.d || x.k - y.k)
          .slice(0, opts.maxStartCells)
          .sort((x, y) => x.k - y.k)
          .map((x) => x.c);
      }
      let order = 1;
      for (const c of dests) seqs.push(evalStart(c, reach.path(c), order++));
    }
  }

  // déplacement final sur les meilleures séquences
  if (canMove) {
    const k = Math.max(1, opts.finalMoveCandidates ?? 3);
    const ranked = seqs.slice().sort((x, y) => y.value - x.value || x.mpUsed - y.mpUsed || x.order - y.order);
    const withCasts = ranked.filter((s) => castCount(s) > 0);
    const chosen = new Set<Seq>(ranked.slice(0, k));
    if (!withCasts.length) chosen.add(seqs[0]!);
    for (const s of chosen) {
      finalMove(s, ctx);
      s.value = utility(s.board, ctx);
    }
  }

  let best = seqs[0]!;
  for (const s of seqs) {
    if (s.value > best.value + EPS || (Math.abs(s.value - best.value) <= EPS && (s.mpUsed < best.mpUsed || (s.mpUsed === best.mpUsed && s.order < best.order)))) {
      best = s;
    }
  }
  if (best.value <= -FORBIDDEN / 2 || (best.value <= baseValue + EPS && !best.steps.some((st) => st.kind === 'cast'))) {
    return emptyPlan(b, memo.mode, baseValue);
  }
  return { actorId: actor, steps: best.steps, predicted: best.predicted, value: best.value, mode: memo.mode, board: best.board };
}

/** Applique un plan sur un plateau (estimation de menace) ; renvoie le plateau prévu. */
export function applyPlan(b: Board, plan: MonsterPlan): Board {
  const out = b.clone();
  const ectx = b.env.ctx;
  for (const st of plan.steps) {
    if (!out.isOn(out.actor)) break;
    if (st.kind === 'move') out.walk(out.actor, st.path);
    else {
      const sp = ectx.getSpell(st.spellLevelId);
      if (!boardCanCastSpell(out, sp) || !boardCanCastOn(out, sp, st.cell)) break;
      boardCast(out, sp, st.cell);
    }
  }
  return out;
}
