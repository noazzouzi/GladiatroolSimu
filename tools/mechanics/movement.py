#!/usr/bin/env python3
"""Déplacements forcés et volontaires de DOFUS : poussée, attirance, collisions, téléportation, échange,
tacle, pathfinding.  Portage de ``damageCalculation.damageManagement.PushUtils`` / ``Teleport`` et de
``com.ankamagames.dofus.logic.game.fight.miscs.TackleUtil`` / ``FightReachableCellsMaker`` /
``jerakine.pathfinding.Pathfinding`` (client DOFUS 2.73.3 décompilé).

Le plateau (``Board``) est volontairement minimal : cellules marchables + occupants + attributs utiles.
"""
from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple

try:
    from . import geometry as G
except ImportError:
    import geometry as G  # type: ignore

COLLISION, COMPLETE, PORTAL, ACTIVE_OBJECT = 'COLLISION', 'COMPLETE', 'PORTAL', 'ACTIVE_OBJECT'


@dataclass
class Fighter:
    fid: str
    cell: int
    team: int
    level: int = 200
    push_damage: int = 0        # stat 84
    push_res: int = 0           # stat 85
    alive: bool = True
    can_be_pushed: bool = True  # propriété de monstre canBePushed
    unmovable: bool = False     # état à effet 3 « Enraciné » : ni poussée, ni téléportation, ni échange
    steadfast: bool = False     # état à effet 0 « Inébranlable » : pas de poussée/attirance (sauf forcée)
    no_switch: bool = False     # état à effet 18 (« Pesanteur »-like) : pas d'échange/téléport. symétrique
    pacifist: bool = False      # état à effet 6 : n'inflige aucun dommage (collision incluse)
    invulnerable_push: bool = False  # état à effet 26 : insensible aux dommages de poussée
    tackle: int = 0             # stat 79 Tacle
    evade: int = 0              # stat 78 Fuite
    cant_tackle: bool = False
    cant_be_tackled: bool = False
    summoner_level: Optional[int] = None  # si invocation : niveau de l'invocateur (utilisé pour la poussée)


@dataclass
class Board:
    walkable: Set[int]                              # cellules marchables en combat (mov && !nonWalkableDuringFight)
    fighters: Dict[str, Fighter] = field(default_factory=dict)
    obstacles: Set[int] = field(default_factory=set)  # obstacles temporaires (cellules bloquées)

    def fighter_at(self, cell: int) -> Optional[Fighter]:
        for f in self.fighters.values():
            if f.alive and f.cell == cell:
                return f
        return None

    def is_empty_for_movement(self, cell: int) -> bool:
        """``FightContext.isCellEmptyForMovement`` : pas de combattant, pas d'invocation en attente,
        cellule marchable."""
        if not G.is_valid_cell(cell):
            return False
        if cell in self.obstacles or cell not in self.walkable:
            return False
        return self.fighter_at(cell) is None


# ---------------------------------------------------------------------------------------------
# Directions de poussée / attirance
# ---------------------------------------------------------------------------------------------

def push_direction(caster_cell: int, targeted_cell: int, target_cell: int, allow_same_cell: bool = True) -> int:
    """``PushUtils.getPushDirection``.

    * si la cible est sur la case ciblée (centre de zone), on pousse depuis la case du LANCEUR ;
      sinon depuis la CASE CIBLÉE (centre de zone) ;
    * si l'origine et la cible sont sur une même diagonale MapPoint (|dx| = |dy|) : direction cardinale
      (horizontale/verticale à l'écran) ``getLookDirection4DiagExact`` ; sinon ``getLookDirection4``
      (axe MapPoint dominant ; en cas d'égalité impossible ici).
    * -1 (pas de poussée) si cible = case ciblée = lanceur (ou si ``allow_same_cell`` est faux et cible =
      case ciblée).
    """
    if target_cell == targeted_cell and (target_cell == caster_cell or not allow_same_cell):
        return -1
    origin = caster_cell if targeted_cell == target_cell else targeted_cell
    if G.in_diag(origin, target_cell):
        return G.look_direction4_diag_exact(origin, target_cell)
    return G.look_direction4(origin, target_cell)


def pull_direction(caster_cell: int, targeted_cell: int, target_cell: int, allow_same_cell: bool = True) -> int:
    d = push_direction(caster_cell, targeted_cell, target_cell, allow_same_cell)
    return -1 if d == -1 else G.opposite_direction(d)


# ---------------------------------------------------------------------------------------------
# Glissement (drag)
# ---------------------------------------------------------------------------------------------

@dataclass
class DragResult:
    start: int
    cell: int
    path: List[int]
    remaining_force: int       # force restante (en « pas » : déjà x2 si direction cardinale)
    stop_reason: str
    direction: int
    collateral: List[str] = field(default_factory=list)  # combattants percutés en chaîne (index 1, 2, …)


def is_path_blocked(board: Board, from_cell: int, to_cell: int, direction: int) -> bool:
    """``PushUtils.isPathBlocked`` + ``MapTools.adjacentCellsAllowAccess`` : un pas diagonal (direction
    cardinale) exige que les DEUX cases latérales (dir±1 depuis la case de départ) soient libres."""
    if not board.is_empty_for_movement(to_cell):
        return True
    if G.is_orthogonal(direction):
        return False
    a = G.next_cell(from_cell, (direction + 1) % 8)
    b = G.next_cell(from_cell, (direction + 7) % 8)
    return not (board.is_empty_for_movement(a) and board.is_empty_for_movement(b))


def drag_destination(board: Board, start: int, direction: int, force: int,
                     stop_cells: Iterable[int] = ()) -> DragResult:
    """``PushUtils.getDragCellDest`` (force déjà divisée par 2 si cardinale).

    Les glyphes / auras (dont les pics du Gladiatrool) n'arrêtent PAS la poussée ; seuls les pièges et
    murs (``stop_cells``) l'arrêtent (et le portail la redirige, non modélisé)."""
    stop = set(stop_cells)
    cur = start
    path: List[int] = []
    for i in range(force):
        prev = cur
        cur = G.next_cell(cur, direction)
        if is_path_blocked(board, prev, cur, direction):
            return DragResult(start, prev, path, force - i, COLLISION, direction)
        path.append(cur)
        if cur in stop:
            return DragResult(start, cur, path, force - i - 1, ACTIVE_OBJECT, direction)
    return DragResult(start, cur, path, 0, COMPLETE, direction)


def collision_damage(force: int, caster_level: int, push_bonus: int, target_push_res: int, index: int = 0,
                     caster_pacifist: bool = False) -> int:
    """``PushUtils.getCollisionDamage`` (client 2.73) :

        dmg = int( force * (floor(niv/2) + 32 + DoPou_lanceur - RéPou_cible) / (4 * 2**index) ), min 0

    ``force`` = cases non parcourues (x2 si la poussée était cardinale), ``index`` = 0 pour la cible poussée,
    1, 2, … pour les combattants percutés en chaîne ; niv = niveau du lanceur (de l'invocateur si
    invocation).  Aucun bonus de carac/Puissance/dommages finaux, aucune résistance élémentaire.
    """
    if caster_pacifist:
        return 0
    d = int(force * (math.floor(caster_level / 2) + 32 + (push_bonus - target_push_res)) / (4 * math.pow(2, index)))
    return max(0, d)


def collateral_targets(board: Board, final_cell: int, direction: int, remaining: int) -> List[Fighter]:
    """``PushUtils.getCollateralTargets`` : combattants alignés derrière l'obstacle (au plus ``remaining``)."""
    out = []
    c = G.next_cell(final_cell, direction)
    f = board.fighter_at(c)
    while remaining > 0 and f is not None and f.alive:
        out.append(f)
        c = G.next_cell(c, direction)
        f = board.fighter_at(c)
        remaining -= 1
    return out


@dataclass
class PushOutcome:
    moved: bool
    drag: Optional[DragResult]
    collision_damages: List[Tuple[str, int]]   # (fid, dégâts de poussée bruts avant 1163/invulnérabilité)


def push(board: Board, caster: Fighter, target: Fighter, force: int, *, targeted_cell: int,
         caster_cell_before_spell: Optional[int] = None, target_cell_before_spell: Optional[int] = None,
         with_collision_damage: bool = True, forced: bool = False, apply: bool = True,
         stop_cells: Iterable[int] = ()) -> PushOutcome:
    """Poussée (effets 5 / 1103 / 1021).  Étapes du client :
    1. direction depuis les positions AVANT le sort (``getBeforeLastSpellPosition``) ;
    2. si direction cardinale : force = ceil(force/2) ;
    3. glissement case par case jusqu'à collision ;
    4. si collision (force restante > 0, cause != piège) : force restante x2 si cardinale, dégâts de poussée
       sur la cible (index 0) puis sur chaque combattant aligné derrière (index 1, 2, …) ;
    5. déclenchement des pièges de la case d'arrivée (non modélisé ici)."""
    ccell = caster.cell if caster_cell_before_spell is None else caster_cell_before_spell
    tcell = target.cell if target_cell_before_spell is None else target_cell_before_spell
    if not forced and (target.unmovable or not target.can_be_pushed or target.steadfast):
        return PushOutcome(False, None, [])
    d = push_direction(ccell, targeted_cell, tcell, True)
    if d == -1:
        return PushOutcome(False, None, [])
    if G.is_cardinal(d):
        force = int(math.ceil(force / 2))
    res = drag_destination(board, target.cell, d, force, stop_cells)
    moved = res.cell != target.cell
    dmg: List[Tuple[str, int]] = []
    if with_collision_damage and target.alive and res.remaining_force > 0 and res.stop_reason != ACTIVE_OBJECT:
        rem = res.remaining_force * (2 if G.is_cardinal(d) else 1)
        level = caster.summoner_level if caster.summoner_level is not None else caster.level
        dmg.append((target.fid, 0 if target.invulnerable_push else
                    collision_damage(rem, level, caster.push_damage, target.push_res, 0, caster.pacifist)))
        others = collateral_targets(board, res.cell, d, rem)
        res.collateral = [o.fid for o in others]
        for k, o in enumerate(others, start=1):
            dmg.append((o.fid, 0 if o.invulnerable_push else
                        collision_damage(rem, level, caster.push_damage, o.push_res, k, caster.pacifist)))
    if apply and moved:
        target.cell = res.cell
    return PushOutcome(moved, res, dmg)


def pull(board: Board, caster: Fighter, target: Fighter, force: int, *, targeted_cell: int,
         target_cell_before_spell: Optional[int] = None, forced: bool = False, apply: bool = True,
         stop_cells: Iterable[int] = ()) -> PushOutcome:
    """Attirance (effets 6 / 1022) : direction = opposée de la poussée calculée depuis la position
    COURANTE du lanceur ; jamais de dégâts de collision."""
    tcell = target.cell if target_cell_before_spell is None else target_cell_before_spell
    if not forced and (target.unmovable or not target.can_be_pushed or target.steadfast):
        return PushOutcome(False, None, [])
    d = pull_direction(caster.cell, targeted_cell, tcell, True)
    if d == -1:
        return PushOutcome(False, None, [])
    if G.is_cardinal(d):
        force = int(math.ceil(force / 2))
    res = drag_destination(board, target.cell, d, force, stop_cells)
    if apply and res.cell != target.cell:
        target.cell = res.cell
    return PushOutcome(res.cell != res.start, res, [])


def push_to_edge_distance(board: Board, cell: int, direction: int) -> int:
    """Nombre de cases libres avant obstacle dans une direction (utile pour « repousse jusqu'au bord »
    = poussée de force 63 sans dommages, effet 1103 du Rassemblement Troollesque)."""
    n = 0
    cur = cell
    while True:
        nxt = G.next_cell(cur, direction)
        if is_path_blocked(board, cur, nxt, direction):
            return n
        n += 1
        cur = nxt


def sort_targets_for_effect(targeted_cell: int, is_push: bool, cells: Sequence[int]) -> List[int]:
    """``TargetManagement.comparePositions`` : pour une poussée, on traite d'abord les cibles les plus
    ÉLOIGNÉES de la case ciblée (sinon les plus proches) ; égalité : direction 8 puis id de cellule."""
    import functools

    def cmp(a: int, b: int) -> int:
        da, db = G.distance(a, targeted_cell), G.distance(b, targeted_cell)
        if da == db:
            ra = G.look_direction8(targeted_cell, a)
            rb = G.look_direction8(targeted_cell, b)
            if ra == rb:
                rb = 0
                if ra in (0, 7, 6, 5):
                    ra = -1 if a < b else 1
                else:
                    ra = 1 if a < b else -1
            else:
                ra, rb = (ra + 1) % 8, (rb + 1) % 8
            da, db = ra, rb
        return (db - da) * (1 if is_push else -1)
    return sorted(cells, key=functools.cmp_to_key(cmp))


# ---------------------------------------------------------------------------------------------
# Téléportation / échange
# ---------------------------------------------------------------------------------------------

def can_teleport(f: Fighter, switch_like: bool = False) -> bool:
    return not f.unmovable and not (f.no_switch and switch_like)


def teleport(board: Board, f: Fighter, dest: int, apply: bool = True) -> bool:
    """Effet 4 (sur case ciblée) : réussit si la case est libre et marchable ; sinon (zone 'P') échec."""
    if not can_teleport(f) or not board.is_empty_for_movement(dest):
        return False
    if apply:
        f.cell = dest
    return True


def exchange(board: Board, a: Fighter, b: Fighter, apply: bool = True) -> bool:
    """Effet 8 « Échange de positions » : impossible si l'un est Enraciné (effet d'état 3) ou sous un
    état « pas d'échange » (effet 18) ou porté."""
    if a.unmovable or b.unmovable or a.no_switch or b.no_switch:
        return False
    if apply:
        a.cell, b.cell = b.cell, a.cell
    return True


def symmetric_cell(center: int, cell: int) -> int:
    """Symétrique de ``cell`` par rapport à ``center`` (téléportations 1104/1105/1106)."""
    cx, cy = G.cell_to_xy(center)
    x, y = G.cell_to_xy(cell)
    return G.xy_to_cell(2 * cx - x, 2 * cy - y)


# ---------------------------------------------------------------------------------------------
# Tacle
# ---------------------------------------------------------------------------------------------

def evade_ratio(board: Board, f: Fighter, cell: Optional[int] = None) -> float:
    """``TackleUtil.getTackle`` : produit sur les ennemis adjacents (4-voisinage) de
    min(1, (Fuite + 2) / (Tacle + 2) / 2).  1.0 = aucun tacle."""
    if f.cant_be_tackled:
        return 1.0
    cell = f.cell if cell is None else cell
    evade = max(0, f.evade)
    ratio = 1.0
    for n in G.neighbours(cell):
        o = board.fighter_at(n)
        if o is None or o.team == f.team or o.cant_tackle or not o.alive:
            continue
        mod = (evade + 2) / (max(0, o.tackle) + 2) / 2
        if mod < 1:
            ratio *= mod
    return ratio


def tackle_losses(mp: int, ap: int, ratio: float) -> Tuple[int, int]:
    """PM et PA perdus en quittant une case (FightTurnFrame) : int(x * (1 - ratio) + 0.5)."""
    return max(0, int(mp * (1 - ratio) + 0.5)), max(0, int(ap * (1 - ratio) + 0.5))


# ---------------------------------------------------------------------------------------------
# Pathfinding (combat : 4 directions MapPoint, 1 PM par pas, pas de traversée d'entité)
# ---------------------------------------------------------------------------------------------

def reachable(board: Board, start: int, mp: int) -> Dict[int, int]:
    """Cases atteignables -> coût en PM (BFS, sans tacle)."""
    dist = {start: 0}
    q = deque([start])
    while q:
        c = q.popleft()
        if dist[c] >= mp:
            continue
        for n in G.neighbours(c):
            if n not in dist and board.is_empty_for_movement(n):
                dist[n] = dist[c] + 1
                q.append(n)
    return dist


def shortest_path(board: Board, start: int, goal: int) -> Optional[List[int]]:
    prev = {start: None}
    q = deque([start])
    while q:
        c = q.popleft()
        if c == goal:
            break
        for n in G.neighbours(c):
            if n not in prev and (board.is_empty_for_movement(n)):
                prev[n] = c
                q.append(n)
    if goal not in prev:
        return None
    path = [goal]
    while path[-1] != start:
        path.append(prev[path[-1]])
    return path[::-1]


def walk(board: Board, f: Fighter, path: Sequence[int], mp: int, ap: int) -> Tuple[int, int, int, int]:
    """Applique le tacle le long d'un chemin (liste de cases, départ inclus).  Retourne
    (case d'arrivée, PM restants, PA restants, nb de pas effectués).  Le tacle est évalué à chaque case
    QUITTÉE (position de départ comprise) ; on s'arrête quand les PM restants sont épuisés."""
    cur = path[0]
    steps = 0
    for nxt in path[1:]:
        r = evade_ratio(board, f, cur)
        lost_mp, lost_ap = tackle_losses(mp, ap, r)
        mp -= lost_mp
        ap -= lost_ap
        if mp <= 0:
            break
        mp -= 1
        cur = nxt
        steps += 1
    return cur, mp, ap, steps


if __name__ == '__main__':
    # Monstre niveau 200 (sans DoPou) : 3 cases restantes contre un mur -> int(3*(100+32)/4) = 99
    assert collision_damage(3, 200, 0, 0) == 99
    # Archétype Gladiatrool (niv 200, 1000 DoPou) : 283 par case restante
    assert collision_damage(1, 200, 1000, 0) == 283 and collision_damage(2, 200, 1000, 0) == 566
    # percuté en chaîne : /2, /4…
    assert collision_damage(2, 200, 1000, 0, 1) == 283
    print('movement self-test OK')
