#!/usr/bin/env python3
"""Géométrie d'une carte DOFUS (14 x 20 « doubles rangées » = 560 cellules).

Conventions (identiques au client DOFUS 2.x `com.ankamagames.jerakine.types.positions.MapPoint`
et reprises par DOFUS 3) :

* cellId = rangée * 14 + colonne, rangée (row) dans [0, 39], colonne (col) dans [0, 13].
  Les rangées impaires sont décalées d'une demi-cellule vers la droite à l'écran.
* Coordonnées « MapPoint » (x, y) : repère orthogonal tourné de 45°.
    a, r = divmod(cellId, 28)
    si r < 14 : x = a + r,           y = r - a
    sinon     : x = a + 1 + (r - 14), y = (r - 14) - a
  soit, pour l'inverse : cellId = (x - y) * 14 + y + (x - y) // 2
  Plage : x in [0, 33], y in [-19, 13]  (toutes les paires ne sont pas des cellules).
  À l'écran : +x = vers le bas-droite (sud-est), +y = vers le haut-droite (nord-est).
* Deux cellules sont adjacentes (distance 1) si |dx| + |dy| == 1 (4 voisines, diagonales écran).
  « En ligne » (lancer en ligne, poussées) = même x ou même y.
  Distance DOFUS (PO, PM) = distance de Manhattan |dx| + |dy| dans ce repère.
* Pixels (DOFUS 2, zoom 1, cellule 86 x 43 px), centre de cellule :
    px = col * 86 + 43 + (row % 2) * 43 = 43 * (x + y) + 43
    py = row * 21.5 + 21.5            = 21.5 * (x - y) + 21.5

Exécuter ce fichier lance les auto-tests :  python3 tools/map/mapgeom.py
"""

MAP_WIDTH = 14
MAP_HEIGHT = 20
CELL_COUNT = 560
CELL_W = 86
CELL_H = 43

# Directions dans le repère MapPoint (voisins orthogonaux) et nom à l'écran
DIRS = {
    (1, 0): 'SE',   # bas-droite
    (-1, 0): 'NW',  # haut-gauche
    (0, 1): 'NE',   # haut-droite
    (0, -1): 'SW',  # bas-gauche
}


def cell_to_rowcol(cell_id):
    return divmod(cell_id, MAP_WIDTH)


def rowcol_to_cell(row, col):
    return row * MAP_WIDTH + col


def cell_to_xy(cell_id):
    if not 0 <= cell_id < CELL_COUNT:
        raise ValueError(cell_id)
    a, r = divmod(cell_id, 2 * MAP_WIDTH)
    if r < MAP_WIDTH:
        return a + r, r - a
    return a + 1 + (r - MAP_WIDTH), (r - MAP_WIDTH) - a


def xy_to_cell(x, y):
    """Retourne le cellId ou None si (x, y) est hors carte."""
    d = x - y
    if d < 0:
        return None
    cid = d * MAP_WIDTH + y + d // 2
    if 0 <= cid < CELL_COUNT and cell_to_xy(cid) == (x, y):
        return cid
    return None


def cell_to_pixel(cell_id):
    """Centre de la cellule en pixels DOFUS 2 (zoom 1), origine en haut-gauche de la grille."""
    row, col = cell_to_rowcol(cell_id)
    return col * CELL_W + CELL_W / 2 + (row % 2) * CELL_W / 2, row * CELL_H / 2 + CELL_H / 2


def distance(a, b):
    ax, ay = cell_to_xy(a)
    bx, by = cell_to_xy(b)
    return abs(ax - bx) + abs(ay - by)


def in_line(a, b):
    ax, ay = cell_to_xy(a)
    bx, by = cell_to_xy(b)
    return ax == bx or ay == by


def neighbours(cell_id):
    x, y = cell_to_xy(cell_id)
    out = []
    for (dx, dy) in DIRS:
        n = xy_to_cell(x + dx, y + dy)
        if n is not None:
            out.append(n)
    return out


def _self_test():
    # bijection sur les 560 cellules
    seen = set()
    for c in range(CELL_COUNT):
        x, y = cell_to_xy(c)
        assert xy_to_cell(x, y) == c, c
        seen.add((x, y))
        px, py = cell_to_pixel(c)
        assert px == 43 * (x + y) + 43 and py == 21.5 * (x - y) + 21.5, c
    assert len(seen) == CELL_COUNT
    xs = [p[0] for p in seen]
    ys = [p[1] for p in seen]
    assert (min(xs), max(xs), min(ys), max(ys)) == (0, 33, -19, 13)
    # valeurs de référence (MapPoint DOFUS 2)
    assert cell_to_xy(0) == (0, 0)
    assert cell_to_xy(1) == (1, 1)
    assert cell_to_xy(13) == (13, 13)
    assert cell_to_xy(14) == (1, 0)
    assert cell_to_xy(27) == (14, 13)
    assert cell_to_xy(28) == (1, -1)
    assert cell_to_xy(559) == (33, -6)
    # cellule 0 : voisins 14 (SE) seulement vers l'intérieur + 1 n'est PAS voisin (distance 2)
    assert distance(0, 1) == 2 and distance(0, 14) == 1
    assert sorted(neighbours(0)) == [14]
    # Carte du Gladiatrool : centre 300 et ses 4 cases de placement (rouges)
    assert cell_to_xy(300) == (17, -4)
    assert sorted(neighbours(300)) == [286, 287, 314, 315]
    assert xy_to_cell(40, 0) is None and xy_to_cell(0, 5) is None
    return True


if __name__ == '__main__':
    print('mapgeom self-test OK' if _self_test() else 'FAIL')
