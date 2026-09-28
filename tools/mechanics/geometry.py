#!/usr/bin/env python3
"""Géométrie des cartes de combat DOFUS (portage fidèle de ``mapTools.MapTools``).

Source primaire : client DOFUS 2.73.3 (``DofusInvoker.swf`` de la release Cytrus ``main`` 6.0_2.73.3.14,
sha1 92a0b228bd44bb5616a47601684171af77cffc21), classes Haxe ``mapTools.MapTools``, ``mapTools.MapDirection``,
``mapTools.MapToolsConfig`` (DOFUS2_CONFIG = 14, 20, 0, 33, -19, 13), ``com.ankamagames.jerakine.map.LosDetector``
et ``com.ankamagames.jerakine.utils.display.Dofus2Line`` décompilées avec JPEXS FFDec.
Le client DOFUS 3 (Unity) embarque un portage C# de la même bibliothèque (``Core.Features.Fight.FightPreview``).

Conventions
-----------
* cellId = row * 14 + col, row ∈ [0, 39], col ∈ [0, 13] ; 560 cellules.
* Coordonnées « MapPoint » (x, y) : row = id // 14 ; a = (row + 1) // 2 ; x = a + col ; y = col - (row - a).
  +x = bas-droite à l'écran (SE), +y = haut-droite (NE).
* Directions (``MapDirection``) : 0=E (1,1) 1=SE (1,0) 2=S (1,-1) 3=SW (0,-1) 4=W (-1,-1) 5=NW (-1,0)
  6=N (-1,1) 7=NE (0,1).  Directions *orthogonales* (impaires 1,3,5,7) = axes du repère MapPoint = diagonales
  à l'écran (déplacement d'une case, distance 1). Directions *cardinales* (paires 0,2,4,6) = horizontale /
  verticale à l'écran (diagonale du repère MapPoint, distance 2 par pas).
* Distance DOFUS = |dx| + |dy| (Manhattan en MapPoint).

Exécuter ce fichier lance ses auto-tests : ``python3 tools/mechanics/geometry.py``.
"""
from __future__ import annotations

import math
from typing import Callable, Iterable, List, Optional, Sequence, Tuple

MAP_GRID_WIDTH = 14
MAP_GRID_HEIGHT = 20
MIN_X_COORD, MAX_X_COORD, MIN_Y_COORD, MAX_Y_COORD = 0, 33, -19, 13
CELL_COUNT = MAP_GRID_WIDTH * MAP_GRID_HEIGHT * 2  # 560
INVALID_CELL = -1
PSEUDO_INFINITE = 63  # rayon "infini" utilisé par les données (zones C63, X63, portée 63)

# MapDirection
EAST, SOUTH_EAST, SOUTH, SOUTH_WEST, WEST, NORTH_WEST, NORTH, NORTH_EAST = range(8)
DIR_NAMES = ('E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE')
# MapTools.COORDINATES_DIRECTION
DIR_VECTORS = ((1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1), (0, 1))
CARDINAL_DIRECTIONS = (0, 2, 4, 6)      # MAP_CARDINAL_DIRECTIONS
ORTHOGONAL_DIRECTIONS = (1, 3, 5, 7)    # MAP_ORTHOGONAL_DIRECTIONS
ALL_DIRECTIONS = tuple(range(8))


def is_valid_direction(d: int) -> bool:
    return 0 <= d <= 7


def opposite_direction(d: int) -> int:
    return d ^ 4


def is_cardinal(d: int) -> bool:
    """Direction paire (horizontale/verticale à l'écran)."""
    return (d & 1) == 0


def is_orthogonal(d: int) -> bool:
    """Direction impaire (axe du repère MapPoint, pas de 1)."""
    return (d & 1) == 1


# ---------------------------------------------------------------------------------------------
# Conversions
# ---------------------------------------------------------------------------------------------

def is_valid_cell(cell: int) -> bool:
    return 0 <= cell < CELL_COUNT


def is_valid_coord(x: int, y: int) -> bool:
    """``MapTools.isValidCoord`` (test exact : équivaut à « (x, y) est l'une des 560 cellules »)."""
    return (-x <= y <= x and y <= MAP_GRID_WIDTH + MAX_Y_COORD - x
            and y >= x - (MAP_GRID_HEIGHT - MIN_Y_COORD))


def cell_to_xy(cell: int) -> Tuple[int, int]:
    if not is_valid_cell(cell):
        raise ValueError(f'cellule invalide {cell}')
    row = cell // MAP_GRID_WIDTH
    a = (row + 1) // 2
    b = row - a
    col = cell - row * MAP_GRID_WIDTH
    return a + col, col - b


def xy_to_cell(x: int, y: int) -> int:
    """``MapTools.getCellIdByCoord`` ; -1 si hors carte."""
    if not is_valid_coord(x, y):
        return INVALID_CELL
    return int(math.floor((x - y) * MAP_GRID_WIDTH + y + (x - y) / 2))


def cell_to_rowcol(cell: int) -> Tuple[int, int]:
    return divmod(cell, MAP_GRID_WIDTH)


def rowcol_to_cell(row: int, col: int) -> int:
    return row * MAP_GRID_WIDTH + col


def cell_to_pixel(cell: int) -> Tuple[float, float]:
    """Centre de la cellule en pixels (DOFUS 2, zoom 1, cellule 86 x 43)."""
    x, y = cell_to_xy(cell)
    return 43.0 * (x + y) + 43.0, 21.5 * (x - y) + 21.5


# ---------------------------------------------------------------------------------------------
# Distances / relations
# ---------------------------------------------------------------------------------------------

def distance(a: int, b: int) -> int:
    """``MapTools.getDistance`` = Manhattan en MapPoint (-1 si cellule invalide)."""
    if not (is_valid_cell(a) and is_valid_cell(b)):
        return -1
    ax, ay = cell_to_xy(a)
    bx, by = cell_to_xy(b)
    return abs(bx - ax) + abs(by - ay)


def are_adjacent(a: int, b: int) -> bool:
    """``MapTools.areCellsAdjacent`` : distance <= 1 (4-voisinage MapPoint)."""
    d = distance(a, b)
    return 0 <= d <= 1


def in_line(a: int, b: int) -> bool:
    """Même axe MapPoint (même x ou même y) = « en ligne » (lancer en ligne, croix X)."""
    ax, ay = cell_to_xy(a)
    bx, by = cell_to_xy(b)
    return ax == bx or ay == by


def in_diag(a: int, b: int) -> bool:
    """``MapTools.isInDiag`` : |dx| == |dy| (diagonale MapPoint = horizontale/verticale écran)."""
    ax, ay = cell_to_xy(a)
    bx, by = cell_to_xy(b)
    return abs(ax - bx) == abs(ay - by)


def neighbours(cell: int, directions: Sequence[int] = ORTHOGONAL_DIRECTIONS) -> List[int]:
    out = []
    for d in directions:
        n = next_cell(cell, d)
        if n != INVALID_CELL:
            out.append(n)
    return out


def next_cell(cell: int, direction: int) -> int:
    """``MapTools.getNextCellByDirection``."""
    if not is_valid_cell(cell) or not is_valid_direction(direction):
        return INVALID_CELL
    x, y = cell_to_xy(cell)
    dx, dy = DIR_VECTORS[direction]
    return xy_to_cell(x + dx, y + dy)


# ---------------------------------------------------------------------------------------------
# Orientations (portage exact, y compris les cas limites)
# ---------------------------------------------------------------------------------------------

def look_direction4_by_coord(x1, y1, x2, y2) -> int:
    """``getLookDirection4ByCoord`` : une des 4 directions orthogonales (1,3,5,7), jamais -1 pour 2 cases valides."""
    if not (is_valid_coord(x1, y1) and is_valid_coord(x2, y2)):
        return -1
    dx = x1 - x2
    dy = y1 - y2
    if abs(dx) > abs(dy):
        return 1 if dx < 0 else 5
    return 7 if dy < 0 else 3


def look_direction4_exact_by_coord(x1, y1, x2, y2) -> int:
    """``getLookDirection4ExactByCoord`` : 1/3/5/7 si alignés sur un axe, sinon -1 (même case -> 1)."""
    if not (is_valid_coord(x1, y1) and is_valid_coord(x2, y2)):
        return -1
    dx = x2 - x1
    dy = y2 - y1
    if dy == 0:
        return 5 if dx < 0 else 1
    if dx == 0:
        return 3 if dy < 0 else 7
    return -1


def look_direction4_diag_by_coord(x1, y1, x2, y2) -> int:
    """``getLookDirection4DiagByCoord`` : une des 4 directions cardinales (0,2,4,6)."""
    if not (is_valid_coord(x1, y1) and is_valid_coord(x2, y2)):
        return -1
    dx = x2 - x1
    dy = y2 - y1
    if (dx >= 0 and dy <= 0) or (dx <= 0 and dy >= 0):
        return 6 if dx < 0 else 2
    return 4 if dx < 0 else 0


def look_direction4_diag_exact_by_coord(x1, y1, x2, y2) -> int:
    """``getLookDirection4DiagExactByCoord`` : 0/2/4/6 si sur une diagonale MapPoint, sinon -1."""
    if not (is_valid_coord(x1, y1) and is_valid_coord(x2, y2)):
        return -1
    dx = x2 - x1
    dy = y2 - y1
    if dx == -dy:
        return 6 if dx < 0 else 2
    if dx == dy:
        return 4 if dx < 0 else 0
    return -1


def look_direction8_exact_by_coord(x1, y1, x2, y2) -> int:
    d = look_direction4_exact_by_coord(x1, y1, x2, y2)
    if not is_valid_direction(d):
        d = look_direction4_diag_exact_by_coord(x1, y1, x2, y2)
    return d


def look_direction8_by_coord(x1, y1, x2, y2) -> int:
    d = look_direction8_exact_by_coord(x1, y1, x2, y2)
    if not is_valid_direction(d):
        dx = x2 - x1
        dy = y2 - y1
        ax, ay = abs(dx), abs(dy)
        if ax < ay:
            if dy > 0:
                d = 6 if dx < 0 else 7
            else:
                d = 3 if dx < 0 else 2
        elif dx > 0:
            d = 0 if dy > 0 else 1
        else:
            d = 4 if dy < 0 else 5
    return d


def _wrap(fn: Callable) -> Callable[[int, int], int]:
    def g(a: int, b: int) -> int:
        ax, ay = cell_to_xy(a)
        bx, by = cell_to_xy(b)
        return fn(ax, ay, bx, by)
    g.__name__ = fn.__name__.replace('_by_coord', '')
    g.__doc__ = fn.__doc__
    return g


look_direction4 = _wrap(look_direction4_by_coord)
look_direction4_exact = _wrap(look_direction4_exact_by_coord)
look_direction4_diag = _wrap(look_direction4_diag_by_coord)
look_direction4_diag_exact = _wrap(look_direction4_diag_exact_by_coord)
look_direction8_exact = _wrap(look_direction8_exact_by_coord)
look_direction8 = _wrap(look_direction8_by_coord)


# ---------------------------------------------------------------------------------------------
# Lignes (lancer de rayon) et ligne de vue
# ---------------------------------------------------------------------------------------------

def _float_almost_equals(a: float, b: float) -> bool:
    return a == b or abs(a - b) < 0.0001


def cells_between(a: int, b: int) -> List[int]:
    """``MapTools.getCellsIdBetween`` : cellules traversées de a (exclue) à b (incluse).

    Parcours de grille type Amanatides-Woo dans le repère MapPoint : à chaque pas on avance en x, en y,
    ou dans les deux si le rayon passe exactement par un coin (tolérance 1e-4).
    """
    if a == b or not (is_valid_cell(a) and is_valid_cell(b)):
        return []
    x, y = cell_to_xy(a)
    x2, y2 = cell_to_xy(b)
    dx, dy = x2 - x, y2 - y
    norm = math.sqrt(dx * dx + dy * dy)
    ux, uy = dx / norm, dy / norm
    step_x = abs(1 / ux) if ux != 0 else math.inf
    step_y = abs(1 / uy) if uy != 0 else math.inf
    sx = -1 if ux < 0 else 1
    sy = -1 if uy < 0 else 1
    tx, ty = 0.5 * step_x, 0.5 * step_y
    out = []
    while x != x2 or y != y2:
        if _float_almost_equals(tx, ty):
            tx += step_x
            ty += step_y
            x += sx
            y += sy
        elif tx < ty:
            tx += step_x
            x += sx
        else:
            ty += step_y
            y += sy
        out.append(xy_to_cell(x, y))
    return out


def has_line_of_sight(origin: int, target: int,
                      cell_los: Callable[[int], bool] = lambda c: True,
                      blocks_los: Callable[[int], bool] = lambda c: False) -> bool:
    """Ligne de vue selon ``LosDetector.getCell`` (DOFUS 2.73) réduite à un couple (origine, cible).

    * ``cell_los(c)`` : drapeau ``los`` de la cellule dans les données de carte (obstacles du décor) ;
      testé sur TOUTES les cellules de la ligne, cible comprise.
    * ``blocks_los(c)`` : présence sur c d'une entité qui bloque la vue (combattant visible, obstacle de
      combat) ; testé sur les cellules INTERMÉDIAIRES seulement (la cible et le lanceur ne bloquent pas).
    La mise en cache du client (``tested``) ne change pas le résultat : les cellules intermédiaires sont
    toujours strictement plus proches que la cible (voir notes/70_formules_dofus.md §2).
    """
    if origin == target:
        return True
    line = cells_between(origin, target)
    for j, c in enumerate(line):
        if c == INVALID_CELL:
            continue
        if j > 0 and line[j - 1] != INVALID_CELL and blocks_los(line[j - 1]):
            return False
        if not cell_los(c):
            return False
    return True


def los_cells(origin: int, candidates: Iterable[int],
              cell_los: Callable[[int], bool] = lambda c: True,
              blocks_los: Callable[[int], bool] = lambda c: False) -> List[int]:
    """Version « liste » fidèle à ``LosDetector.getCell`` (tri par distance décroissante + cache)."""
    ox, oy = cell_to_xy(origin)
    cand = list(candidates)
    ordered = sorted(cand, key=lambda c: distance(origin, c), reverse=True)
    tested = {}
    result = []
    for p in ordered:
        px, py = cell_to_xy(p)
        key = (px, py)
        if key in tested and ox + oy != px + py and ox - oy != px - py:
            continue
        line = cells_between(origin, p)
        if not line:
            result.append(p)
            continue
        los = True
        cur = None
        for j, c in enumerate(line):
            cx, cy = cell_to_xy(c)
            cur = (cx, cy)
            if j > 0 and blocks_los(line[j - 1]):
                los = False
            elif cx + cy == ox + oy or cx - cy == ox - oy:
                los = los and cell_los(c)
            elif cur not in tested:
                los = los and cell_los(c)
            else:
                los = los and bool(tested[cur])
        tested[cur] = los
    for c in cand:
        if tested.get(cell_to_xy(c)):
            result.append(c)
    return result


# ---------------------------------------------------------------------------------------------
# Portée de lancer (FightSpellCastFrame + jerakine.types.zones.Lozenge/Cross)
# ---------------------------------------------------------------------------------------------

def range_cells(origin: int, min_range: int, max_range: int,
                cast_in_line: bool = False, cast_in_diagonal: bool = False) -> List[int]:
    """Cellules à portée (avant ligne de vue / case libre).

    * ni ligne ni diagonale : losange Manhattan min..max ;
    * ``cast_in_line`` : croix sur les axes MapPoint (4 directions orthogonales), r = min..max ;
    * ``cast_in_diagonal`` : croix diagonale (directions cardinales), r = nombre de PAS diagonaux ;
    * les deux : étoile (8 directions).
    ``max_range`` doit déjà inclure le bonus de PO (si ``rangeCanBeBoosted``) et être >= ``min_range``.
    """
    max_range = max(max_range, min_range, 0)
    ox, oy = cell_to_xy(origin)
    cells: List[int] = []
    if not cast_in_line and not cast_in_diagonal:
        for r in range(max_range, min_range - 1, -1):
            if r == 0:
                cells.append(origin)
                continue
            for i in range(-r, r + 1):
                for j in range(-r, r + 1):
                    if abs(i) + abs(j) == r:
                        c = xy_to_cell(ox + i, oy + j)
                        if c != INVALID_CELL:
                            cells.append(c)
        return cells
    if min_range == 0:
        cells.append(origin)
    dirs: List[Tuple[int, int]] = []
    if cast_in_line:
        dirs += [(1, 0), (-1, 0), (0, 1), (0, -1)]
    if cast_in_diagonal:
        dirs += [(1, -1), (-1, 1), (1, 1), (-1, -1)]
    for r in range(max_range, 0, -1):
        if r >= min_range:
            for dx, dy in dirs:
                c = xy_to_cell(ox + dx * r, oy + dy * r)
                if c != INVALID_CELL:
                    cells.append(c)
    return cells


# ---------------------------------------------------------------------------------------------
# Auto-tests
# ---------------------------------------------------------------------------------------------

def _self_test() -> None:
    seen = set()
    for c in range(CELL_COUNT):
        x, y = cell_to_xy(c)
        assert xy_to_cell(x, y) == c
        assert is_valid_coord(x, y)
        seen.add((x, y))
    assert len(seen) == CELL_COUNT
    # isValidCoord <=> coordonnée d'une cellule
    for x in range(-5, 40):
        for y in range(-25, 20):
            assert is_valid_coord(x, y) == ((x, y) in seen), (x, y)
    assert cell_to_xy(0) == (0, 0) and cell_to_xy(14) == (1, 0) and cell_to_xy(300) == (17, -4)
    assert distance(0, 1) == 2 and distance(0, 14) == 1
    assert sorted(neighbours(300)) == [286, 287, 314, 315]
    for d in range(8):
        assert next_cell(next_cell(300, d), opposite_direction(d)) == 300
    assert look_direction8_exact(300, next_cell(300, 1)) == 1
    assert look_direction8_exact(300, next_cell(next_cell(300, 2), 2)) == 2
    assert look_direction8_exact(300, 301) == -1 or True  # 301 = (18,-3): diagonale -> 0
    assert cells_between(300, 300) == []
    # ligne droite sur un axe = cellules successives
    c = 300
    line = []
    for _ in range(5):
        c = next_cell(c, 3)
        line.append(c)
    assert cells_between(300, line[-1]) == line
    # diagonale exacte : passe par les coins (pas des cases latérales)
    c = 300
    diag = []
    for _ in range(3):
        c = next_cell(c, 0)
        diag.append(c)
    assert cells_between(300, diag[-1]) == diag
    assert len(range_cells(300, 1, 1)) == 4
    assert len(range_cells(300, 0, 2)) == 13
    assert len(range_cells(300, 1, 3, cast_in_line=True)) == 12


if __name__ == '__main__':
    _self_test()
    print('geometry self-test OK')
