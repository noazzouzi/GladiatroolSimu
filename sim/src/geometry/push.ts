/**
 * Déplacements forcés : poussée, attirance, avance/recul, chaîne de collision, dommages de poussée, téléportation.
 * Port de movement.py (``PushUtils``, ``Teleport``, ``TargetManagement.comparePositions`` du client 2.73.3).
 * Voir research/notes/70_formules_dofus.md §5 et ETUDE §9.9.
 *
 * Ce module ne connaît pas les combattants : l'occupation est fournie par prédicat et les conditions liées aux
 * états (Enraciné, Inébranlable, canBePushed, poussées forcées…) sont vérifiées par le moteur avant l'appel.
 * Les glyphes et auras (dont les pics) n'arrêtent PAS une poussée ; seuls les pièges/murs (``stopAt``) le font.
 */

import {
  CELL_COUNT,
  INVALID_CELL,
  NEVER,
  distance,
  dir4,
  dir4DiagExact,
  dir8,
  inDiagonal,
  isDiagonalDirection,
  nextCell,
  oppositeDirection,
  type CellPredicate,
} from './grid.js';
import type { MapGrid } from './mapGrid.js';
import type { SpellZone } from './zones.js';

export type DragStopReason = 'COLLISION' | 'COMPLETE' | 'ACTIVE_OBJECT';

/**
 * ``PushUtils.getPushDirection`` : depuis le LANCEUR si la cible est sur la case ciblée, sinon depuis la CASE
 * CIBLÉE (centre de zone) ; diagonale exacte (|dx| = |dy|) -> direction paire, sinon axe dominant (dir4).
 * -1 (pas de poussée) si cible = case ciblée = lanceur (ou si !allowSameCell et cible = case ciblée).
 * Le moteur passe les positions d'AVANT le sort.
 */
export function pushDirection(
  casterCell: number,
  targetedCell: number,
  targetCell: number,
  allowSameCell = true,
): number {
  if (targetCell === targetedCell && (targetCell === casterCell || !allowSameCell)) return -1;
  const origin = targetedCell === targetCell ? casterCell : targetedCell;
  if (inDiagonal(origin, targetCell)) return dir4DiagExact(origin, targetCell);
  return dir4(origin, targetCell);
}

/** Attirance : opposée de la poussée (le moteur passe la position COURANTE du lanceur). */
export function pullDirection(
  casterCell: number,
  targetedCell: number,
  targetCell: number,
  allowSameCell = true,
): number {
  const d = pushDirection(casterCell, targetedCell, targetCell, allowSameCell);
  return d === -1 ? -1 : oppositeDirection(d);
}

/**
 * ``PushUtils.isPathBlocked`` + ``MapTools.adjacentCellsAllowAccess`` : la case d'arrivée doit être libre ; un pas
 * diagonal (direction paire) exige en plus que les DEUX cases latérales (dir ± 1 depuis la case de départ) soient libres.
 */
export function isPathBlocked(isFree: CellPredicate, fromCell: number, toCell: number, direction: number): boolean {
  if (!isFree(toCell)) return true;
  if (!isDiagonalDirection(direction)) return false;
  const a = nextCell(fromCell, (direction + 1) % 8);
  const b = nextCell(fromCell, (direction + 7) % 8);
  return !(isFree(a) && isFree(b));
}

export interface DragResult {
  start: number;
  /** Case finale. */
  cell: number;
  /** Cases parcourues (départ exclu, case finale comprise). */
  path: number[];
  /** Pas non parcourus (en pas : déjà divisés par 2 si la direction est diagonale). */
  remainingSteps: number;
  stopReason: DragStopReason;
  direction: number;
}

/**
 * ``PushUtils.getDragCellDest`` : glissement case par case de ``steps`` pas (déjà divisés par 2 si diagonale).
 * ``isFree`` doit être faux hors carte ; ``stopAt`` : pièges / murs (arrêt SUR la case, sans collision).
 */
export function dragDestination(
  isFree: CellPredicate,
  start: number,
  direction: number,
  steps: number,
  stopAt: CellPredicate = NEVER,
): DragResult {
  let cur = start;
  const path: number[] = [];
  for (let i = 0; i < steps; i++) {
    const prev = cur;
    cur = nextCell(cur, direction);
    if (isPathBlocked(isFree, prev, cur, direction)) {
      return { start, cell: prev, path, remainingSteps: steps - i, stopReason: 'COLLISION', direction };
    }
    path.push(cur);
    if (stopAt(cur)) {
      return { start, cell: cur, path, remainingSteps: steps - i - 1, stopReason: 'ACTIVE_OBJECT', direction };
    }
  }
  return { start, cell: cur, path, remainingSteps: 0, stopReason: 'COMPLETE', direction };
}

/**
 * ``PushUtils.getCollateralTargets`` : cases des combattants alignés derrière l'obstacle, à partir de la case
 * suivant ``finalCell`` dans la direction, au plus ``remaining`` (reste effectif, doublé si diagonale).
 */
export function collateralCells(
  isOccupied: CellPredicate,
  finalCell: number,
  direction: number,
  remaining: number,
): number[] {
  const out: number[] = [];
  let c = nextCell(finalCell, direction);
  while (remaining > 0 && c !== INVALID_CELL && isOccupied(c)) {
    out.push(c);
    c = nextCell(c, direction);
    remaining -= 1;
  }
  return out;
}

/**
 * ``PushUtils.getCollisionDamage`` :
 *   max(0, int(reste × (floor(niveau/2) + 32 + DoPou_lanceur − RéPou_victime) / (4 × 2^index)))
 * ``remaining`` = pas non parcourus × 2 si la poussée était diagonale ; index 0 = cible poussée, 1, 2… = percutés en
 * chaîne ; niveau = celui du lanceur (de l'invocateur pour une invocation). 0 si le lanceur est pacifiste.
 */
export function collisionDamage(
  remaining: number,
  casterLevel: number,
  pushDamage: number,
  targetPushResistance: number,
  index = 0,
  casterPacifist = false,
): number {
  if (casterPacifist) return 0;
  const d = Math.trunc(
    (remaining * (Math.floor(casterLevel / 2) + 32 + (pushDamage - targetPushResistance))) / (4 * Math.pow(2, index)),
  );
  return Math.max(0, d);
}

/**
 * Types de déplacement forcé :
 * - ``push`` : poussée (effets 5, 1021, 1103…) : direction pushDirection(lanceur, case ciblée, cible) ;
 * - ``pull`` : attirance (6, 1022) : direction opposée ;
 * - ``advance`` : le LANCEUR avance vers la cible (1042) : attirance du lanceur par la cible (HYPOTHÈSE de port) ;
 * - ``retreat`` : le LANCEUR recule depuis la cible (1041) : poussée du lanceur par la cible (HYPOTHÈSE de port).
 */
export type ForcedMoveKind = 'push' | 'pull' | 'advance' | 'retreat';

export interface ForcedMoveRequest {
  kind: ForcedMoveKind;
  /** Case du lanceur (position d'avant le sort pour une poussée, courante pour une attirance). */
  casterCell: number;
  /** Case ciblée par le sort (centre de zone). */
  targetedCell: number;
  /** Case de la cible (position d'avant le sort). */
  targetCell: number;
  /** Nombre de cases demandé (avant division par 2 en diagonale). */
  force: number;
  /** Case de départ réelle du déplacé (défaut : targetCell, ou casterCell pour advance/retreat). */
  fromCell?: number;
  /** Refuser une poussée quand la cible est sur la case ciblée (allowSameCell = false). */
  disallowSameCell?: boolean;
  /** Pièges / murs : arrêtent le glissement sur la case (sans dommages de collision). */
  stopAt?: CellPredicate;
}

export interface ForcedMoveResult {
  /** Direction du déplacement (-1 : aucun déplacement possible). */
  direction: number;
  /** Case de départ du déplacé. */
  start: number;
  /** Case finale. */
  cell: number;
  /** Cases parcourues (départ exclu, arrivée comprise). */
  path: number[];
  moved: boolean;
  /** Pas demandés (ceil(force/2) en diagonale). */
  steps: number;
  /** Pas non parcourus. */
  remainingSteps: number;
  /** Reste pour les dommages de collision (remainingSteps × 2 en diagonale). */
  remainingForDamage: number;
  stopReason: DragStopReason;
  /** Arrêt par collision (reste > 0, cause autre qu'un piège/mur). */
  collision: boolean;
  /** Case occupée percutée (case suivante occupée) ou -1 (bord, case non marchable, cases latérales). */
  hitCell: number;
  /** Cases des combattants percutés en chaîne (index 1, 2, … pour collisionDamage), au plus remainingForDamage. */
  collisionChain: number[];
  /** Le trajet passe par au moins une case de pics (arrivée comprise). */
  pathTouchesSpikes: boolean;
  /** La case finale est une case de pics. */
  endsInSpikes: boolean;
}

/**
 * Trajectoire d'un déplacement forcé (``movement.push`` / ``movement.pull`` sans les conditions d'état).
 * ``isOccupied`` : présence d'un combattant (le déplacé sur sa propre case n'a pas d'effet sur le calcul).
 */
export function computeForcedMove(
  grid: MapGrid,
  isOccupied: CellPredicate,
  req: ForcedMoveRequest,
): ForcedMoveResult {
  const allowSame = !req.disallowSameCell;
  let direction: number;
  let start: number;
  switch (req.kind) {
    case 'push':
      direction = pushDirection(req.casterCell, req.targetedCell, req.targetCell, allowSame);
      start = req.fromCell ?? req.targetCell;
      break;
    case 'pull':
      direction = pullDirection(req.casterCell, req.targetedCell, req.targetCell, allowSame);
      start = req.fromCell ?? req.targetCell;
      break;
    case 'advance':
      direction = pullDirection(req.targetCell, req.casterCell, req.casterCell, true);
      start = req.fromCell ?? req.casterCell;
      break;
    case 'retreat':
      direction = pushDirection(req.targetCell, req.casterCell, req.casterCell, true);
      start = req.fromCell ?? req.casterCell;
      break;
  }
  const empty: ForcedMoveResult = {
    direction,
    start,
    cell: start,
    path: [],
    moved: false,
    steps: 0,
    remainingSteps: 0,
    remainingForDamage: 0,
    stopReason: 'COMPLETE',
    collision: false,
    hitCell: INVALID_CELL,
    collisionChain: [],
    pathTouchesSpikes: false,
    endsInSpikes: false,
  };
  if (direction === -1) return empty;
  const diagonal = isDiagonalDirection(direction);
  const steps = diagonal ? Math.ceil(req.force / 2) : req.force;
  const isFree = grid.freePredicate(isOccupied);
  const drag = dragDestination(isFree, start, direction, steps, req.stopAt ?? NEVER);
  const collision = drag.stopReason === 'COLLISION' && drag.remainingSteps > 0;
  const remainingForDamage = drag.remainingSteps * (diagonal ? 2 : 1);
  let hitCell = INVALID_CELL;
  let chain: number[] = [];
  if (collision) {
    const n = nextCell(drag.cell, direction);
    if (n !== INVALID_CELL && isOccupied(n)) hitCell = n;
    chain = collateralCells(isOccupied, drag.cell, direction, remainingForDamage);
  }
  let touches = false;
  for (const c of drag.path) if (grid.isSpike(c)) touches = true;
  return {
    direction,
    start,
    cell: drag.cell,
    path: drag.path,
    moved: drag.cell !== start,
    steps,
    remainingSteps: drag.remainingSteps,
    remainingForDamage,
    stopReason: drag.stopReason,
    collision,
    hitCell,
    collisionChain: chain,
    pathTouchesSpikes: touches,
    endsInSpikes: drag.path.length > 0 && grid.isSpike(drag.cell),
  };
}

/**
 * Dommages de poussée d'une collision : [cible, percutés en chaîne…] (index 0, 1, 2…).
 * ``pushResistances[i]`` = RéPou de la i-ème victime (cible puis chaîne).
 */
export function collisionDamages(
  move: ForcedMoveResult,
  casterLevel: number,
  pushDamage: number,
  pushResistances: readonly number[],
  casterPacifist = false,
): number[] {
  if (!move.collision) return [];
  const out: number[] = [];
  const n = 1 + move.collisionChain.length;
  for (let i = 0; i < n; i++) {
    out.push(collisionDamage(move.remainingForDamage, casterLevel, pushDamage, pushResistances[i] ?? 0, i, casterPacifist));
  }
  return out;
}

/**
 * Nombre de pas libres avant obstacle dans une direction (``movement.push_to_edge_distance``), en PAS (un pas
 * diagonal compte 1). « Repousse jusqu'au bord » = poussée de force 63.
 */
export function pushToEdgeDistance(isFree: CellPredicate, cell: number, direction: number): number {
  let n = 0;
  let cur = cell;
  for (;;) {
    const nxt = nextCell(cur, direction);
    if (isPathBlocked(isFree, cur, nxt, direction)) return n;
    n += 1;
    cur = nxt;
  }
}

/**
 * ``TargetManagement.comparePositions`` : ordre de traitement des cibles d'un effet. Poussée : de la plus ÉLOIGNÉE à
 * la plus proche de la case ciblée ; autres effets : l'inverse ; égalité : direction 8 (dir8) puis id de cellule.
 * Tri stable (comme sorted() Python).
 */
export function sortTargetsForEffect(targetedCell: number, isPush: boolean, cells: readonly number[]): number[] {
  const sign = isPush ? 1 : -1;
  const cmp = (a: number, b: number): number => {
    let da = distance(a, targetedCell);
    let db = distance(b, targetedCell);
    if (da === db) {
      let ra = dir8(targetedCell, a);
      let rb = dir8(targetedCell, b);
      if (ra === rb) {
        rb = 0;
        if (ra === 0 || ra === 7 || ra === 6 || ra === 5) ra = a < b ? -1 : 1;
        else ra = a < b ? 1 : -1;
      } else {
        ra = (ra + 1) % 8;
        rb = (rb + 1) % 8;
      }
      da = ra;
      db = rb;
    }
    return (db - da) * sign;
  };
  return [...cells].sort(cmp);
}

/**
 * Destination d'une téléportation sur case ciblée (effet 4) : zone P -> la case ciblée si elle est libre, sinon -1 ;
 * autre zone -> première case libre dans l'ordre ``zone.cells`` (getCells). ``isFree`` : marchable et inoccupée.
 */
export function teleportDestination(
  zone: SpellZone,
  targetedCell: number,
  casterCell: number,
  isFree: CellPredicate,
): number {
  if (zone.shape === 'P') return isFree(targetedCell) ? targetedCell : INVALID_CELL;
  for (const c of zone.cells(targetedCell, casterCell)) {
    if (c >= 0 && c < CELL_COUNT && isFree(c)) return c;
  }
  return INVALID_CELL;
}
