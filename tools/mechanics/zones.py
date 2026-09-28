#!/usr/bin/env python3
"""Zones d'effet des sorts (portage fidèle de ``mapTools.SpellZone`` du client DOFUS 2.73.3).

Chaque zone se calcule à partir de :
* ``target`` : cellule ciblée par le sort (centre de la zone, ``fightContext.targetedCell``) ;
* ``caster`` : cellule du lanceur (sert à orienter les zones directionnelles L, T, V, F, R, U, B, l, -).

Deux API existent dans le client et sont reproduites ici :
* ``cells(target, caster)`` = ``SpellZone.getCells`` (fill*) : liste des cellules (affichage, téléportations) ;
* ``contains(cell, target, caster)`` = ``SpellZone.isCellInZone`` (isCellIn*) : test utilisé pour choisir
  les combattants touchés (``FightContext.getFightersFromZone``). Les deux coïncident pour toutes les formes
  SAUF la fourche ``F`` (fill utilise la direction exacte et la profondeur radius+1, isIn la direction
  approchée ``getLookDirection4``), voir notes/70_formules_dofus.md §3.
* ``aoe_malus(target, caster, cell)`` = ``SpellZone.getAoeMalus`` : pourcentage de réduction (0..100).

Construction depuis DofusDB : ``SpellZone.from_zone_descr(effect['zoneDescr'])``.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

try:
    from . import geometry as G
except ImportError:  # exécution directe
    import geometry as G  # type: ignore

DEFAULT_RADIUS = 1
DEFAULT_MIN_RADIUS = 0
DEFAULT_DEGRESSION = 10
DEFAULT_MAX_DEGRESSION_TICKS = 4
GLOBAL_RADIUS = 63
MAX_RADIUS_DEGRESSION = 50

# formes pour lesquelles le 2e paramètre du rawZone est le rayon minimal (SpellZone.hasMinSize)
MIN_SIZE_SHAPES = set('#+CQRXl')

SHAPE_NAMES = {
    ' ': 'vide', ';': 'liste explicite de cellules', 'A': 'toute la carte (y compris morts)',
    'a': 'toute la carte (vivants, y compris portés)', 'B': 'boomerang', 'C': 'cercle (losange Manhattan)',
    'D': 'damier', 'F': 'fourche', 'G': 'carré plein (Chebyshev)', 'I': 'cercle inversé (tout sauf le cercle)',
    'L': 'ligne (depuis la cible, dans le sens lanceur->cible)', 'O': 'anneau (bord du cercle)',
    'P': 'point', 'Q': 'croix orthogonale sans centre', 'R': 'rectangle (largeur 2r+1, profondeur 1+min)',
    'T': 'ligne perpendiculaire (T)', 'U': 'demi-cercle', 'V': 'cône', 'W': 'carré sans diagonales',
    'X': 'croix orthogonale (axes MapPoint)', 'Z': 'cercle euclidien inversé', 'l': 'ligne depuis le lanceur',
    '#': 'croix cardinale sans centre', '*': 'étoile (8 directions)', '+': 'croix cardinale (diagonales MapPoint)',
    '-': 'ligne perpendiculaire (identique à T)', '/': 'ligne (identique à L)',
}


@dataclass
class SpellZone:
    shape: str = 'P'
    radius: int = DEFAULT_RADIUS
    min_radius: int = DEFAULT_MIN_RADIUS
    degression: int = DEFAULT_DEGRESSION
    max_degression_ticks: int = DEFAULT_MAX_DEGRESSION_TICKS
    stop_at_target: bool = False
    cell_ids: List[int] = field(default_factory=list)  # forme ';'

    # ------------------------------------------------------------------ construction
    @classmethod
    def from_raw(cls, raw: Optional[str]) -> 'SpellZone':
        """``SpellZone.fromRawZone`` (format client : lettre + "p0,p1,p2,p3,p4")."""
        if not raw:
            raw = 'P'
        z = cls()
        z.shape = raw[0]
        params = [p for p in raw[1:].split(',') if p]
        if z.shape == ';':
            z.cell_ids = [int(p) for p in params]
            return z
        if z.shape == 'l' and len(params) >= 2:
            params[0], params[1] = params[1], params[0]
        if params:
            z.radius = int(params[0])
        if z.shape in MIN_SIZE_SHAPES:
            if len(params) > 1:
                z.min_radius = int(params[1])
            if len(params) > 2:
                z.degression = int(params[2])
        else:
            if len(params) > 1:
                z.degression = int(params[1])
            if len(params) > 2:
                z.max_degression_ticks = int(params[2])
        if len(params) > 3:
            z.max_degression_ticks = int(params[3])
        if len(params) > 4:
            z.stop_at_target = int(params[4]) != 0
        z._normalise()
        return z

    @classmethod
    def from_zone_descr(cls, zd: dict) -> 'SpellZone':
        """Depuis ``zoneDescr`` DofusDB (données DOFUS 3) :
        {shape (code ASCII), param1, param2, damageDecreaseStepPercent, maxDamageDecreaseApplyCount,
        isStopAtTarget, cellIds}.  param1/param2 = 1er/2e nombre du rawZone ; pour 'l' ils sont
        (rayon minimal, longueur) et sont inversés comme dans le client."""
        code = zd.get('shape', 80) or 0
        z = cls()
        z.shape = chr(code) if code else ' '
        if z.shape == ';':
            z.cell_ids = list(zd.get('cellIds') or [])
            return z
        p1 = int(zd.get('param1', 1) or 0)
        p2 = int(zd.get('param2', 0) or 0)
        if z.shape == 'l':
            p1, p2 = p2, p1
        z.radius = p1
        z.min_radius = p2 if z.shape in MIN_SIZE_SHAPES else 0
        z.degression = int(zd.get('damageDecreaseStepPercent', DEFAULT_DEGRESSION) or 0)
        z.max_degression_ticks = int(zd.get('maxDamageDecreaseApplyCount', DEFAULT_MAX_DEGRESSION_TICKS) or 0)
        z.stop_at_target = bool(zd.get('isStopAtTarget', False))
        z._normalise()
        return z

    def _normalise(self) -> None:
        s = self.shape
        if s == 'I':
            self.min_radius = self.radius
            self.radius = GLOBAL_RADIUS
        elif s == 'O':
            self.min_radius = self.radius
        elif s == 'P':
            self.radius = 0
        elif s == 'R':
            self.radius = max(self.radius, 1)
            self.min_radius = max(self.min_radius, 1)
        elif s not in ' ;#*+-/ABCDFGILOPQRTUVWXZal':
            self.shape, self.radius = 'P', 0

    def raw(self) -> str:
        if self.shape == ';':
            return ';' + ','.join(map(str, self.cell_ids))
        return f'{self.shape}{self.radius},{self.min_radius},{self.degression},{self.max_degression_ticks}'

    def is_aoe(self) -> bool:
        return self.radius >= 1

    # ------------------------------------------------------------------ cellules
    def cells(self, target: int, caster: int) -> List[int]:
        s = self.shape
        if s == ';':
            return list(self.cell_ids)
        if s == ' ':
            return []
        if s in 'Aa':
            return list(range(G.CELL_COUNT))
        if s == 'P':
            return [target] if G.is_valid_cell(target) else []
        if s in 'CIO':
            return _fill_circle(self, target)
        if s == 'D':
            return _fill_checkerboard(self, target)
        if s in 'L/':
            return _fill_line(self, False, target, caster)
        if s == 'l':
            return _fill_line(self, True, target, caster)
        if s == 'X':
            return _fill_cross(self, G.ORTHOGONAL_DIRECTIONS, False, target)
        if s == 'Q':
            return _fill_cross(self, G.ORTHOGONAL_DIRECTIONS, True, target)
        if s == '+':
            return _fill_cross(self, G.CARDINAL_DIRECTIONS, False, target)
        if s == '#':
            return _fill_cross(self, G.CARDINAL_DIRECTIONS, True, target)
        if s == '*':
            return _fill_cross(self, G.ALL_DIRECTIONS, False, target)
        if s in 'T-':
            return _fill_perp_line(self, target, caster)
        if s == 'V':
            return _fill_cone(self, target, caster)
        if s == 'F':
            return _fill_fork(self, target, caster)
        if s == 'G':
            return _fill_square(self, False, target)
        if s == 'W':
            return _fill_square(self, True, target)
        if s == 'R':
            return _fill_rectangle(self, target, caster)
        if s == 'U':
            return _fill_half_circle(self, target, caster)
        if s == 'B':
            return _fill_boomerang(self, target, caster)
        if s == 'Z':
            return _fill_reversed_true_circle(self, target)
        return [target]

    def contains(self, cell: int, target: int, caster: int) -> bool:
        s = self.shape
        if s == ';':
            return cell in self.cell_ids
        if s == ' ':
            return False
        if s in 'Aa':
            return True
        if s == 'P':
            return cell == target
        if s in 'CIO':
            d = G.distance(target, cell)
            return self.min_radius <= d <= self.radius
        if s == 'D':
            return _in_checkerboard(self, cell, target)
        if s in 'L/':
            return _in_line(self, False, cell, target, caster)
        if s == 'l':
            return _in_line(self, True, cell, target, caster)
        if s == 'X':
            return _in_cross(self, G.ORTHOGONAL_DIRECTIONS, False, cell, target)
        if s == 'Q':
            return _in_cross(self, G.ORTHOGONAL_DIRECTIONS, True, cell, target)
        if s == '+':
            return _in_cross(self, G.CARDINAL_DIRECTIONS, False, cell, target)
        if s == '#':
            return _in_cross(self, G.CARDINAL_DIRECTIONS, True, cell, target)
        if s == '*':
            return _in_cross(self, G.ALL_DIRECTIONS, False, cell, target)
        if s in 'T-':
            return _in_perp_line(self, cell, target, caster)
        if s == 'V':
            return _in_cone(self, cell, target, caster)
        if s == 'F':
            return _in_fork(self, cell, target, caster)
        if s == 'G':
            return _in_square(self, False, cell, target)
        if s == 'W':
            return _in_square(self, True, cell, target)
        if s == 'R':
            return _in_rectangle(self, cell, target, caster)
        if s == 'U':
            return _in_half_circle(self, cell, target, caster)
        if s == 'B':
            return _in_boomerang(self, cell, target, caster)
        if s == 'Z':
            return _in_reversed_true_circle(self, cell, target)
        return cell == target

    # ------------------------------------------------------------------ dégressivité
    def aoe_malus(self, target: int, caster: int, cell: int) -> int:
        """``SpellZone.getAoeMalus`` : réduction en % (0..100) pour un combattant situé en ``cell``.

        La distance mesurée dépend de la forme :
        * ';', 'A', 'a', 'I' : 0 ;  'G', 'R', 'W' : Chebyshev max(|dx|,|dy|) ;
        * '#', '+', '-', '/', 'U' : Manhattan >> 1 ;  'F', 'V' : distance projetée selon la direction ;
        * autres (P, C, X, L, T, O, Q, *, D, B, Z, l) : Manhattan.
        malus = min(min(dist - rmin, ticks) * degression, 100) avec rmin = 0 pour R, sinon min_radius.
        """
        if self.radius > MAX_RADIUS_DEGRESSION:
            return 0
        s = self.shape
        if s in ';AIa':
            dist = 0
        elif s in 'GRW':
            ax, ay = G.cell_to_xy(target)
            bx, by = G.cell_to_xy(cell)
            dist = max(abs(ax - bx), abs(ay - by))
        elif s in '#+-/U':
            dist = G.distance(target, cell) >> 1
        elif s in 'FV':
            d = G.look_direction8_exact(caster, target)
            tx, ty = G.cell_to_xy(target)
            cx, cy = G.cell_to_xy(cell)
            if d in (0, 4):
                dist = int(abs(abs(tx - ty) + abs(cx - cy)))  # tel quel dans le client (probable bogue)
            elif d in (1, 5):
                dist = abs(tx - cx)
            elif d in (2, 6):
                dist = int(abs(abs(tx - ty) - abs(cx - cy)))
            elif d in (3, 7):
                dist = abs(ty - cy)
            else:
                dist = 0
        else:
            dist = G.distance(target, cell)
        rmin = 0 if s == 'R' else self.min_radius
        if dist < 0:
            dist = 0
        return int(min(min(dist - rmin, self.max_degression_ticks) * self.degression, 100))

    def efficiency(self, target: int, caster: int, cell: int) -> float:
        """Coefficient multiplicateur appliqué aux dégâts/soins (1 - malus/100) si la zone est une AoE."""
        if self.radius < 1:
            return 1.0
        return (100 - self.aoe_malus(target, caster, cell)) / 100


# ---------------------------------------------------------------------------------------------
# Implémentations (noms et logique calqués sur SpellZone.as)
# ---------------------------------------------------------------------------------------------

def _fill_circle(z: SpellZone, target: int) -> List[int]:
    x0, y0 = G.cell_to_xy(target)
    out = []
    for i in range(-z.radius, z.radius + 1):
        for j in range(-z.radius, z.radius + 1):
            d = abs(i) + abs(j)
            if G.is_valid_coord(x0 + i, y0 + j) and z.min_radius <= d <= z.radius:
                out.append(G.xy_to_cell(x0 + i, y0 + j))
    return out


def _fill_checkerboard(z: SpellZone, target: int) -> List[int]:
    x0, y0 = G.cell_to_xy(target)
    even = z.radius % 2 == 0
    out = []
    for i in range(-z.radius, z.radius + 1):
        for j in range(-z.radius, z.radius + 1):
            d = abs(i) + abs(j)
            if not (G.is_valid_coord(x0 + i, y0 + j) and z.min_radius <= d <= z.radius):
                continue
            jm = int(math.fmod(j, 2))
            if (even and int(math.fmod(i + jm, 2)) == 0) or (not even and int(math.fmod(i + 1 + jm, 2)) == 0):
                out.append(G.xy_to_cell(x0 + i, y0 + j))
    return out


def _in_checkerboard(z: SpellZone, cell: int, target: int) -> bool:
    # reproduit isCellInCheckerboardZone : parité ABSOLUE des coordonnées de la cellule testée et
    # seulement le rayon minimal (le client ne teste pas le rayon max ici ; fill utilise une parité RELATIVE)
    d = G.distance(target, cell)
    even = z.radius % 2 == 0
    x, y = G.cell_to_xy(cell)
    if d < z.min_radius:
        return False
    if even and int(math.fmod(x + int(math.fmod(y, 2)), 2)) == 0:
        return True
    if not even:
        return int(math.fmod(x + 1 + int(math.fmod(y, 2)), 2)) == 0
    return False


def _fill_line(z: SpellZone, from_caster: bool, target: int, caster: int) -> List[int]:
    start = caster if from_caster else target
    length = z.radius + z.min_radius - 1 if from_caster else z.radius
    d = G.look_direction8_exact(caster, target)
    if from_caster and z.stop_at_target:
        dist = G.distance(caster, target)
        if dist < length:
            length = dist
    c = start
    for _ in range(z.min_radius):
        c = G.next_cell(c, d)
    out = []
    for _ in range(z.min_radius, length + 1):
        if G.is_valid_cell(c):
            out.append(c)
        c = G.next_cell(c, d)
    return out


def _in_line(z: SpellZone, from_caster: bool, cell: int, target: int, caster: int) -> bool:
    if cell == caster:
        return False
    d_ct = G.look_direction8_exact(caster, target)
    limit = z.radius
    if from_caster:
        d_cell = G.look_direction8_exact(caster, cell)
        dist = G.distance(caster, cell)
        if z.stop_at_target:
            limit = min(limit, G.distance(caster, target))
    else:
        d_cell = G.look_direction8_exact(target, cell)
        dist = G.distance(target, cell)
    if G.is_cardinal(d_cell) and dist > 1:
        dist >>= 1
    return (d_ct == d_cell or dist == 0) and dist >= z.min_radius and dist <= limit


def _fill_cross(z: SpellZone, dirs: Sequence[int], no_center: bool, target: int) -> List[int]:
    out = []
    first = z.min_radius
    if z.min_radius == 0:
        first = 1
        if not no_center:
            out.append(target)
    cur = [target] * len(dirs)
    for r in range(1, z.radius + 1):
        for k, d in enumerate(dirs):
            cur[k] = G.next_cell(cur[k], d)
            if r >= first and G.is_valid_cell(cur[k]):
                out.append(cur[k])
    return out


def _in_cross(z: SpellZone, dirs: Sequence[int], no_center: bool, cell: int, target: int) -> bool:
    d = G.look_direction8_exact(target, cell)
    dist = G.distance(target, cell)
    if G.is_cardinal(d) and dist > 1:
        dist >>= 1
    need = z.min_radius + (1 if (no_center and z.min_radius == 0) else 0)
    return (d in dirs or dist == 0) and dist >= need and dist <= z.radius


def _fill_perp_line(z: SpellZone, target: int, caster: int) -> List[int]:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 2) % 8, (d - 2 + 8) % 8
    out = []
    first = z.min_radius
    if z.min_radius == 0:
        first = 1
        if G.is_valid_cell(target):
            out.append(target)
    a = b = target
    for _ in range(first, z.radius + 1):
        a = G.next_cell(a, d1)
        b = G.next_cell(b, d2)
        if G.is_valid_cell(a):
            out.append(a)
        if G.is_valid_cell(b):
            out.append(b)
    return out


def _in_perp_line(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 2) % 8, (d - 2 + 8) % 8
    dc = G.look_direction8_exact(target, cell)
    dist = G.distance(target, cell)
    if G.is_cardinal(dc) and dist > 1:
        dist >>= 1
    return (dc == d1 or dc == d2 or dist == 0) and z.min_radius <= dist <= z.radius


def _fill_cone(z: SpellZone, target: int, caster: int) -> List[int]:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 2) % 8, (d - 2 + 8) % 8
    out = []
    c = target
    for i in range(z.radius + 1):
        out.append(c)
        a = b = c
        for _ in range(i):
            a = G.next_cell(a, d1)
            b = G.next_cell(b, d2)
            if G.is_valid_cell(a):
                out.append(a)
            if G.is_valid_cell(b):
                out.append(b)
        c = G.next_cell(c, d)
    return out


def _in_cone(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    d = G.look_direction4(caster, target)
    tx, ty = G.cell_to_xy(target)
    cx, cy = G.cell_to_xy(cell)
    dx, dy = cx - tx, cy - ty
    if d == 1:
        return 0 <= dx <= z.radius and abs(dy) <= dx
    if d == 3:
        return -z.radius <= dy <= 0 and abs(dx) <= -dy
    if d == 5:
        return -z.radius <= dx <= 0 and abs(dy) <= -dx
    if d == 7:
        return 0 <= dy <= z.radius and abs(dx) <= dy
    return False


def _fill_fork(z: SpellZone, target: int, caster: int) -> List[int]:
    tx, ty = G.cell_to_xy(target)
    d = G.look_direction8_exact(caster, target)
    sign = -1 if d in (5, 3) else 1
    along_x = d in (5, 1)
    depth = z.radius + 1
    out = []
    if G.is_valid_coord(tx, ty):
        out.append(G.xy_to_cell(tx, ty))
    for i in range(1, depth + 1):
        for lateral in (-1, 0, 1):
            if along_x:
                x, y = tx + i * sign, ty + lateral * i
            else:
                x, y = tx + (i if lateral == 1 else (-i if lateral == -1 else 0)), ty + i * sign
            if G.is_valid_coord(x, y):
                out.append(G.xy_to_cell(x, y))
    return out


def _in_fork(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    tx, ty = G.cell_to_xy(target)
    cx, cy = G.cell_to_xy(cell)
    d = G.look_direction4(caster, target)
    depth = z.radius + 1
    sign = -1 if d in (5, 3) else 1
    if d in (5, 1):
        a = (cx - tx) * sign
        lat = cy - ty
    else:
        a = (cy - ty) * sign
        lat = cx - tx
    if 0 <= a <= depth:
        return lat == a or lat == 0 or lat == -a
    return False


def _fill_square(z: SpellZone, remove_diagonals: bool, target: int) -> List[int]:
    x0, y0 = G.cell_to_xy(target)
    out = []
    for i in range(-z.radius, z.radius + 1):
        for j in range(-z.radius, z.radius + 1):
            if G.is_valid_coord(x0 + i, y0 + j) and (not remove_diagonals or abs(i) != abs(j)):
                out.append(G.xy_to_cell(x0 + i, y0 + j))
    return out


def _in_square(z: SpellZone, remove_diagonals: bool, cell: int, target: int) -> bool:
    tx, ty = G.cell_to_xy(target)
    cx, cy = G.cell_to_xy(cell)
    ax, ay = abs(cx - tx), abs(cy - ty)
    return ((not remove_diagonals or ax != ay) and ax <= z.radius and ay <= z.radius
            and ax >= z.min_radius and ay >= z.min_radius)


def _fill_rectangle(z: SpellZone, target: int, caster: int) -> List[int]:
    tx, ty = G.cell_to_xy(target)
    d = G.look_direction8_exact(caster, target)
    sign = -1 if d in (5, 3) else 1
    along_y = d in (7, 3)
    width = 1 + z.radius * 2
    depth = 1 + z.min_radius
    out = []
    for k in range(depth):
        for w in range(width):
            if along_y:
                x, y = tx + w - width // 2, ty + k * sign
            else:
                x, y = tx + k * sign, ty + w - width // 2
            if G.is_valid_coord(x, y):
                out.append(G.xy_to_cell(x, y))
    return out


def _in_rectangle(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    tx, ty = G.cell_to_xy(target)
    cx, cy = G.cell_to_xy(cell)
    d = G.look_direction8_exact(caster, target)
    sign = -1 if d in (5, 3) else 1
    width = 1 + z.radius * 2
    depth = 1 + z.min_radius
    if d in (7, 3):
        lat, k = abs(cx - tx), (cy - ty) * sign
    else:
        lat, k = abs(cy - ty), (cx - tx) * sign
    return lat <= width // 2 and 0 <= k < depth


def _fill_half_circle(z: SpellZone, target: int, caster: int) -> List[int]:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 3) % 8, (d - 3 + 8) % 8
    out = []
    first = z.min_radius
    if z.min_radius == 0:
        first = 1
        out.append(target)
    a = b = target
    for _ in range(first, z.radius + 1):
        a = G.next_cell(a, d1)
        b = G.next_cell(b, d2)
        if G.is_valid_cell(a):
            out.append(a)
        if G.is_valid_cell(b):
            out.append(b)
    return out


def _in_half_circle(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d - 3 + 8) % 8, (d + 3) % 8
    dc = G.look_direction8_exact(target, cell)
    dist = G.distance(target, cell)
    if G.is_cardinal(dc) and dist > 1:
        dist >>= 1
    return (dc in (d1, d2) or dist == 0) and z.min_radius <= dist <= z.radius


def _fill_boomerang(z: SpellZone, target: int, caster: int) -> List[int]:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 2) % 8, (d + 3) % 8
    d3, d4 = (d - 2 + 8) % 8, (d - 3 + 8) % 8
    out = []
    first = z.min_radius
    if z.min_radius == 0:
        first = 1
        out.append(target)
    a = b = target
    for _ in range(first, z.radius):
        a = G.next_cell(a, d1)
        b = G.next_cell(b, d3)
        if G.is_valid_cell(a):
            out.append(a)
        if G.is_valid_cell(b):
            out.append(b)
    if z.radius != 0:
        a = G.next_cell(a, d2)
        b = G.next_cell(b, d4)
        if G.is_valid_cell(a):
            out.append(a)
        if G.is_valid_cell(b):
            out.append(b)
    return out


def _in_boomerang(z: SpellZone, cell: int, target: int, caster: int) -> bool:
    d = G.look_direction8_exact(caster, target)
    d1, d2 = (d + 2) % 8, (d - 2 + 8) % 8
    dc = G.look_direction8_exact(target, cell)
    dist = G.distance(target, cell)
    if G.is_cardinal(dc) and dist > 1:
        dist >>= 1
    if (dc in (d1, d2) or dist == 0) and z.min_radius <= dist < z.radius:
        return True
    # 2e test du client : la CELLULE testée est décalée d'un pas dans la direction lanceur->cible
    shifted = G.next_cell(cell, d)
    if not G.is_valid_cell(shifted):
        return False
    dc = G.look_direction8_exact(target, shifted)
    dist = G.distance(target, shifted)
    if G.is_cardinal(dc) and dist > 1:
        dist >>= 1
    return dc in (d1, d2) and dist != 0 and dist >= z.min_radius and dist == z.radius


def _fill_reversed_true_circle(z: SpellZone, target: int) -> List[int]:
    tx, ty = G.cell_to_xy(target)
    out = []
    for c in range(G.CELL_COUNT):
        x, y = G.cell_to_xy(c)
        if math.sqrt((x - tx) ** 2 + (y - ty) ** 2) >= z.radius:
            out.append(c)
    return out


def _in_reversed_true_circle(z: SpellZone, cell: int, target: int) -> bool:
    tx, ty = G.cell_to_xy(target)
    x, y = G.cell_to_xy(cell)
    return math.sqrt((x - tx) ** 2 + (y - ty) ** 2) >= z.radius


# ---------------------------------------------------------------------------------------------

def ascii_render(cells: Sequence[int], center: int, caster: Optional[int] = None, span: int = 7) -> str:
    """Rendu ASCII dans le repère MapPoint (x vers la droite, y vers le haut) autour de ``center``."""
    cx, cy = G.cell_to_xy(center)
    s = set(cells)
    lines = []
    for y in range(cy + span, cy - span - 1, -1):
        row = []
        for x in range(cx - span, cx + span + 1):
            c = G.xy_to_cell(x, y)
            if c == G.INVALID_CELL:
                ch = ' '
            elif caster is not None and c == caster:
                ch = '@'
            elif c == center:
                ch = 'O' if c in s else 'o'
            elif c in s:
                ch = '#'
            else:
                ch = '.'
            row.append(ch)
        lines.append(' '.join(row))
    return '\n'.join(lines)


def ascii_render_screen(cells: Sequence[int], center: int, caster: Optional[int] = None,
                        rows: int = 6, cols: int = 4) -> str:
    """Rendu ASCII en orientation ÉCRAN (rangées en quinconce, comme en jeu) autour de ``center``.
    O/o = case ciblée (dans / hors zone), @ = lanceur, # = case de la zone, . = autre case."""
    r0, c0 = G.cell_to_rowcol(center)
    s = set(cells)
    lines = []
    for r in range(r0 - rows, r0 + rows + 1):
        if not 0 <= r < 2 * G.MAP_GRID_HEIGHT:
            continue
        row = [' ' if r % 2 else '']
        for c in range(c0 - cols, c0 + cols + 1):
            if not 0 <= c < G.MAP_GRID_WIDTH:
                row.append('  ')
                continue
            cid = G.rowcol_to_cell(r, c)
            if caster is not None and cid == caster:
                ch = '@'
            elif cid == center:
                ch = 'O' if cid in s else 'o'
            elif cid in s:
                ch = '#'
            else:
                ch = '.'
            row.append(ch + ' ')
        lines.append(''.join(row).rstrip())
    return '\n'.join(lines)


if __name__ == '__main__':
    z = SpellZone.from_raw('C2')
    assert len(z.cells(300, 286)) == 13
    z = SpellZone.from_raw('X1')
    assert sorted(z.cells(300, 286)) == sorted([300, 286, 287, 314, 315])
    print(ascii_render(SpellZone.from_raw('T2').cells(300, G.next_cell(300, 5)), 300, G.next_cell(300, 5)))
    print('zones self-test OK')
