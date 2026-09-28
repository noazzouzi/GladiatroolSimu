/**
 * Déplacements sur l'état (ETUDE §9.9, §9.11 ; N70 §5-§6) : poussée (5, 1103), attirance (6, 1022), avance du lanceur
 * (1042), téléportation (4), échange (8), dommages de collision en chaîne, marche volontaire le long d'un chemin
 * (PM, tacle optionnel), placement.
 *
 * La trajectoire vient de geometry/push.ts ; ce module vérifie les états (Inébranlable = effet d'état 0, Enraciné = 3,
 * pas d'échange = 18, drapeaux de monstre), met à jour l'occupation, applique les dommages de collision (sans
 * résistances, DF ni 1163 'D' : action 80) et appelle les crochets ``onLeaveCell`` / ``onEnterCell`` après chaque
 * arrivée (case d'arrivée seulement pour un déplacement forcé, chaque pas pour la marche).
 */
import {
  areAdjacent,
  collisionDamages,
  computeForcedMove,
  evadeRatio,
  shortestPath,
  tackleLosses,
  teleportDestination,
  neighbours4,
  type SpellZone,
} from '../geometry/index.js';
import type { CellMoveCause } from './context.js';
import { applyDamage, COLLISION_ACTION, pushLevel } from './damage.js';
import type { MoveKind } from './events.js';
import { FLAG_CAN_BE_PUSHED, FLAG_CAN_TACKLE, SE_CANT_BE_TACKLED, SE_CANT_TACKLE, type Fighter } from './fighter.js';
import { marksOnEnter, marksOnLeave } from './marks.js';
import type { FightState } from './state.js';
import { flushTriggers } from './triggerQueue.js';
import { Stat } from './stats.js';

// ---------------------------------------------------------------------------------------------
// Arrivées et départs (crochets)
// ---------------------------------------------------------------------------------------------

/**
 * Notifie le départ de ``from`` puis l'arrivée sur ``to`` : marques du moteur (marks.ts : sortie / entrée d'aura,
 * glyphe immédiat) puis crochets ``onLeaveCell`` / ``onEnterCell``. Pendant un sort, si ``spikes.auraAppliesMidSpell``
 * est faux, l'arrivée est différée à la fin du lancer racine. Renvoie vrai si la marche doit s'interrompre.
 */
export function notifyMove(
  state: FightState,
  f: Fighter,
  from: number,
  to: number,
  cause: CellMoveCause,
  leave = true,
): boolean {
  const hooks = state.ctx.hooks;
  if (leave && from >= 0) {
    marksOnLeave(state, f, from, cause);
    if (hooks.onLeaveCell) hooks.onLeaveCell(state, f, from, cause);
  }
  if (to < 0 || !f.alive || f.cell !== to) return false;
  if (state.castDepth > 0 && !state.ctx.config.spikes.auraAppliesMidSpell) {
    state.deferredEnters.push({ fighterId: f.id, cell: to, from, kind: cause.kind, sourceId: cause.sourceId, castId: cause.castId });
    return false;
  }
  return enterCell(state, f, to, from, cause);
}

/** Arrivée effective : marques du moteur puis crochet ``onEnterCell``. */
function enterCell(state: FightState, f: Fighter, to: number, from: number, cause: CellMoveCause): boolean {
  let stop = marksOnEnter(state, f, to, from, cause);
  const hook = state.ctx.hooks.onEnterCell;
  if (hook && f.alive && f.cell === to) stop = hook(state, f, to, from, cause) === true || stop;
  return stop;
}

/** Applique les arrivées différées (fin d'un lancer racine) pour les combattants restés sur la case. */
export function flushDeferredEnters(state: FightState): void {
  while (state.deferredEnters.length) {
    const d = state.deferredEnters.shift()!;
    const f = state.fighters[d.fighterId];
    if (!f || !f.alive || f.cell !== d.cell) continue;
    enterCell(state, f, d.cell, d.from, { kind: d.kind, sourceId: d.sourceId, castId: d.castId, final: true });
    flushTriggers(state);
  }
}

function emitMove(
  state: FightState,
  f: Fighter,
  sourceId: number,
  kind: MoveKind,
  from: number,
  to: number,
  path: readonly number[],
  collision: boolean,
  castId: number,
  originBuffUid: number,
): void {
  if (state.logging) state.emit({ type: 'move', fighterId: f.id, sourceId, kind, from, to, collision, path });
  state.queueTrigger({ type: 'moved', targetId: f.id, sourceId, kind, from, to, castId, originBuffUid });
}

function emitBlocked(state: FightState, f: Fighter, sourceId: number, kind: MoveKind, reason: string): void {
  if (state.logging) state.emit({ type: 'moveBlocked', fighterId: f.id, sourceId, kind, reason });
}

// ---------------------------------------------------------------------------------------------
// Déplacements forcés
// ---------------------------------------------------------------------------------------------

export interface ForcedMoveOptions {
  kind: 'push' | 'pull' | 'advance';
  /** Nombre de cases demandé. */
  force: number;
  /** Case ciblée du sort (centre de zone). */
  targetedCell: number;
  /** Case du lanceur servant à la direction (avant le sort pour une poussée, courante pour une attirance). */
  casterCell: number;
  /** Case de la cible servant à la direction (avant le sort). */
  targetCell: number;
  /** Dommages de collision (5, 1041) ; faux pour 1103, 6, 1022, 1042. */
  collisionDamage: boolean;
  /** Poussée / attirance forcée (1021, 1022) : ignore Inébranlable, Enraciné et canBePushed. */
  forced?: boolean;
  castId?: number;
  originBuffUid?: number;
  spellLevelId?: number;
}

export interface ForcedMoveOutcome {
  moved: boolean;
  blocked: boolean;
  from: number;
  to: number;
  collision: boolean;
  /** Dommages de collision [cible, chaîne…] (avant réception). */
  collisionDamages: number[];
  /** Ids des combattants percutés en chaîne. */
  chain: number[];
}

const NO_MOVE: ForcedMoveOutcome = {
  moved: false,
  blocked: false,
  from: -1,
  to: -1,
  collision: false,
  collisionDamages: [],
  chain: [],
};

/**
 * Poussée / attirance / avance d'un combattant ``moved`` par ``source``. Pour 'advance' (1042), ``moved`` est le
 * lanceur et ``targetCell`` la case de la cible vers laquelle il avance.
 */
export function forcedMove(state: FightState, source: Fighter, moved: Fighter, o: ForcedMoveOptions): ForcedMoveOutcome {
  if (!moved.alive || moved.cell < 0) return NO_MOVE;
  const kind: MoveKind = o.kind;
  if (!o.forced) {
    let blocked = !moved.canBePushed;
    if (o.kind === 'advance' && !state.ctx.config.engine.unshakableBlocksCasterAdvance) {
      blocked = moved.rooted || (moved.flags & FLAG_CAN_BE_PUSHED) === 0;
    }
    if (blocked) {
      emitBlocked(state, moved, source.id, kind, moved.rooted ? 'enraciné' : 'inébranlable');
      return { ...NO_MOVE, blocked: true, from: moved.cell, to: moved.cell };
    }
  }
  const grid = state.ctx.grid;
  const res =
    o.kind === 'advance'
      ? computeForcedMove(grid, state.occupiedPredicate(), {
          kind: 'advance',
          casterCell: moved.cell,
          targetedCell: o.targetedCell,
          targetCell: o.targetCell,
          force: o.force,
          fromCell: moved.cell,
        })
      : computeForcedMove(grid, state.occupiedPredicate(), {
          kind: o.kind,
          casterCell: o.casterCell,
          targetedCell: o.targetedCell,
          targetCell: o.targetCell,
          force: o.force,
          fromCell: moved.cell,
        });
  if (res.direction === -1) return { ...NO_MOVE, from: moved.cell, to: moved.cell };
  const from = moved.cell;
  const chain: number[] = [];
  for (const c of res.collisionChain) {
    const x = state.fighterAt(c);
    if (x) chain.push(x.id);
  }
  if (res.moved) state.setCell(moved, res.cell);
  const castId = o.castId ?? 0;
  const origin = o.originBuffUid ?? -1;
  if (res.moved || res.collision) emitMove(state, moved, source.id, kind, from, res.cell, res.path, res.collision, castId, origin);
  let dmgs: number[] = [];
  if (res.collision && o.collisionDamage) {
    const victims = [moved, ...chain.map((id) => state.fighters[id]!)];
    dmgs = collisionDamages(
      res,
      pushLevel(state, source),
      source.stat(Stat.PUSH_DAMAGE),
      victims.map((v) => v.stat(Stat.PUSH_RES)),
      source.pacifist,
    );
    for (let i = 0; i < victims.length; i++) {
      const v = victims[i]!;
      const amount = dmgs[i] ?? 0;
      if (amount <= 0 || !v.alive) continue;
      applyDamage(state, source, v, amount, {
        actionId: COLLISION_ACTION,
        collision: true,
        pushIndex: i,
        melee: false,
        castId,
        originBuffUid: origin,
        spellLevelId: o.spellLevelId ?? 0,
      });
    }
  }
  if (res.moved) {
    notifyMove(state, moved, from, res.cell, { kind, sourceId: source.id, castId, final: true });
  }
  return { moved: res.moved, blocked: false, from, to: res.cell, collision: res.collision, collisionDamages: dmgs, chain };
}

/**
 * Téléportation (effet 4) du combattant ``f`` : la case ciblée si elle est libre (quelle que soit la zone : lecture
 * d'ETUDE §9.9 qui reproduit l'arrivée observée de la Mama sur 300 avec une zone C63), sinon, pour une zone non P,
 * première case libre de ``zone.cells`` (ordre getCells). Enraciné : impossible. Renvoie la case d'arrivée (−1 : aucune).
 */
export function teleport(
  state: FightState,
  f: Fighter,
  zone: SpellZone,
  targetedCell: number,
  castId = 0,
  originBuffUid = -1,
): number {
  if (!f.alive || f.cell < 0) return -1;
  if (f.rooted) {
    emitBlocked(state, f, f.id, 'teleport', 'enraciné');
    return -1;
  }
  const free = state.freePredicate();
  const dest = targetedCell >= 0 && free(targetedCell) ? targetedCell : teleportDestination(zone, targetedCell, f.cell, free);
  if (dest < 0 || dest === f.cell) return -1;
  return teleportTo(state, f, dest, f.id, 'teleport', castId, originBuffUid);
}

/** Place ``f`` sur ``cell`` (libre) comme une téléportation : événement, déclencheur, crochets. */
export function teleportTo(
  state: FightState,
  f: Fighter,
  cell: number,
  sourceId: number,
  kind: MoveKind = 'teleport',
  castId = 0,
  originBuffUid = -1,
): number {
  const from = f.cell;
  state.setCell(f, cell);
  emitMove(state, f, sourceId, kind, from, cell, [cell], false, castId, originBuffUid);
  notifyMove(state, f, from, cell, { kind, sourceId, castId, final: true });
  return cell;
}

/**
 * Échange de positions (effet 8) : impossible si l'un est Enraciné, sous « pas d'échange » (effet d'état 18) ou non
 * échangeable (canSwitchPos) ; Inébranlable ne l'empêche pas. Renvoie vrai si l'échange a eu lieu.
 */
export function swap(state: FightState, a: Fighter, b: Fighter, castId = 0, originBuffUid = -1): boolean {
  if (a === b || !a.alive || !b.alive || a.cell < 0 || b.cell < 0) return false;
  if (!a.canSwitch || !b.canSwitch) {
    const who = !a.canSwitch ? a : b;
    emitBlocked(state, who, a.id, 'swap', who.rooted ? 'enraciné' : 'échange impossible');
    return false;
  }
  const ca = a.cell;
  const cb = b.cell;
  state.swapCells(a, b);
  emitMove(state, a, a.id, 'swap', ca, cb, [cb], false, castId, originBuffUid);
  emitMove(state, b, a.id, 'swap', cb, ca, [ca], false, castId, originBuffUid);
  const hooks = state.ctx.hooks;
  const causeA: CellMoveCause = { kind: 'swap', sourceId: a.id, castId, final: true };
  marksOnLeave(state, a, ca, causeA);
  marksOnLeave(state, b, cb, causeA);
  if (hooks.onLeaveCell) {
    hooks.onLeaveCell(state, a, ca, causeA);
    hooks.onLeaveCell(state, b, cb, causeA);
  }
  notifyMove(state, a, ca, cb, causeA, false);
  notifyMove(state, b, cb, ca, causeA, false);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Marche volontaire
// ---------------------------------------------------------------------------------------------

export interface WalkOptions {
  /** Ne pas consommer de PM ni vérifier leur nombre (déplacements scriptés). */
  ignoreMp?: boolean;
  /** Tacle (désactivé dans le Gladiatrool : état 5970 ; ``rules.tackle.enabled``). */
  tackle?: boolean;
  /** Ignorer un choix en attente. */
  ignorePendingChoice?: boolean;
}

export interface WalkResult {
  ok: boolean;
  code?: string;
  reason?: string;
  /** Pas effectués. */
  steps: number;
  /** Case finale. */
  cell: number;
  /** Arrêt avant la fin (crochet, mort, tacle). */
  interrupted: boolean;
}

/**
 * Déplacement volontaire le long de ``path`` (cases successives adjacentes, départ exclu ; un départ en tête est
 * toléré). 1 PM par pas ; chaque case doit être jouable et libre. Crochets de case à chaque pas ; la marche s'arrête
 * si un crochet le demande ou si le combattant meurt.
 */
export function moveAlongPath(state: FightState, fighterId: number, path: readonly number[], o: WalkOptions = {}): WalkResult {
  const f = state.fighters[fighterId];
  const fail = (code: string, reason: string): WalkResult => ({ ok: false, code, reason, steps: 0, cell: f?.cell ?? -1, interrupted: false });
  if (!f) return fail('UNKNOWN_FIGHTER', 'combattant inconnu');
  if (!f.alive) return fail('DEAD', 'le combattant est mort');
  if (f.cell < 0) return fail('OFF_MAP', "le combattant n'est pas sur la carte");
  if (!o.ignorePendingChoice && state.pendingChoices.length) return fail('PENDING_CHOICE', 'un choix est en attente');
  const cells = path.length && path[0] === f.cell ? path.slice(1) : path.slice();
  if (cells.length === 0) return { ok: true, steps: 0, cell: f.cell, interrupted: false };
  if (!o.ignoreMp && cells.length > f.mp) return fail('NOT_ENOUGH_MP', `PM insuffisants (${cells.length} requis, ${f.mp} disponibles)`);
  const grid = state.ctx.grid;
  let prev = f.cell;
  for (const c of cells) {
    if (!areAdjacent(prev, c)) return fail('INVALID_PATH', `chemin invalide : ${prev} → ${c} ne sont pas adjacentes`);
    if (!grid.isWalkable(c)) return fail('NOT_WALKABLE', `case ${c} non marchable`);
    if (state.isOccupied(c)) return fail('CELL_OCCUPIED', `case ${c} occupée`);
    prev = c;
  }
  const start = f.cell;
  const walked: number[] = [];
  let interrupted = false;
  const tackle = o.tackle ?? state.ctx.data.rules.tackle.enabled;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]!;
    if (tackle) {
      const lost = tackleLoss(state, f);
      if (lost.mp > 0 || lost.ap > 0) {
        f.mpUsed += lost.mp;
        f.apUsed += lost.ap;
      }
      if (!o.ignoreMp && f.mp <= 0) {
        interrupted = true;
        break;
      }
    }
    const from = f.cell;
    state.setCell(f, c);
    if (!o.ignoreMp) f.mpUsed += 1;
    walked.push(c);
    const stop = notifyMove(state, f, from, c, { kind: 'walk', sourceId: f.id, castId: 0, final: i === cells.length - 1 });
    flushTriggers(state);
    if (!f.alive || (stop && i < cells.length - 1)) {
      interrupted = i < cells.length - 1;
      break;
    }
  }
  if (walked.length) emitMove(state, f, f.id, 'walk', start, walked[walked.length - 1]!, walked, false, 0, -1);
  flushTriggers(state);
  return { ok: true, steps: walked.length, cell: f.alive ? f.cell : -1, interrupted };
}

/** Plus court chemin vers ``cell`` puis ``moveAlongPath`` (null si inatteignable). */
export function moveTo(state: FightState, fighterId: number, cell: number, o: WalkOptions & { avoidSpikes?: boolean } = {}): WalkResult {
  const f = state.fighter(fighterId);
  if (f.cell === cell) return { ok: true, steps: 0, cell, interrupted: false };
  const p = shortestPath(state.ctx.grid, f.cell, cell, state.occupiedPredicate(), { avoidSpikes: o.avoidSpikes });
  if (!p) return { ok: false, code: 'UNREACHABLE', reason: `case ${cell} inatteignable`, steps: 0, cell: f.cell, interrupted: false };
  return moveAlongPath(state, fighterId, p, o);
}

/** Pertes de tacle en quittant la case courante (``TackleUtil``). */
function tackleLoss(state: FightState, f: Fighter): { mp: number; ap: number } {
  if (f.hasStateEffect(SE_CANT_BE_TACKLED) || f.rooted) return { mp: 0, ap: 0 };
  const tackles: number[] = [];
  for (const n of neighbours4(f.cell)) {
    const e = state.fighterAt(n);
    if (!e || e.team === f.team || (e.flags & FLAG_CAN_TACKLE) === 0 || e.hasStateEffect(SE_CANT_TACKLE)) continue;
    tackles.push(e.stat(Stat.TACKLE));
  }
  if (!tackles.length) return { mp: 0, ap: 0 };
  const ratio = evadeRatio(f.stat(Stat.FLEE), tackles, false);
  return tackleLosses(f.mp, f.ap, ratio);
}

/** Place un combattant (placement initial, scénario) : pas de crochet, pas de PM. */
export function placeFighter(state: FightState, f: Fighter, cell: number): void {
  const from = f.cell;
  state.setCell(f, cell);
  if (state.logging && from !== cell) state.emit({ type: 'move', fighterId: f.id, sourceId: -1, kind: 'place', from, to: cell, collision: false, path: [cell] });
}
