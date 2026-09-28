#!/usr/bin/env python3
"""Exporte des jeux de cas de géométrie calculés par les modules Python de RÉFÉRENCE (geometry, zones, movement,
tools/map/mapgeom) pour valider le port TypeScript ``sim/src/geometry`` (tests ``sim/test/geometry*.test.ts``).

Usage : python3 tools/mechanics/export_geometry_fixtures.py
Sortie : sim/test/fixtures/geometry/{grid,los,zones,castCells,path,push}.json (JSON compact, tirages à graine fixe).
Carte réelle : research/data/map_139988488.json (cases jouables = fightWalkable, pics = glyph ∩ fightWalkable).

Formats (communs) :
* « grid » d'un cas : "arena" (carte réelle) ou {"losBlocking": [...]} (carte ouverte : 560 cases marchables,
  cases listées bloquant la LdV) ;
* masque de cellules : chaîne hexadécimale de 140 caractères, chiffre k = cellules 4k..4k+3 (bit 0 = 4k).
"""
from __future__ import annotations

import heapq
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, 'tools', 'map'))

import geometry as G  # noqa: E402
import zones as Z  # noqa: E402
import movement as M  # noqa: E402
import mapgeom as MG  # noqa: E402

OUT = os.path.join(ROOT, 'sim', 'test', 'fixtures', 'geometry')
SEED = 20260928
N = G.CELL_COUNT


# ------------------------------------------------------------------------------------------------ utilitaires
def load_arena():
    with open(os.path.join(ROOT, 'research', 'data', 'map_139988488.json'), encoding='utf-8') as f:
        m = json.load(f)
    walk = {c['id'] for c in m['cells'] if c['walkable'] and not c['nonWalkableDuringFight']}
    los_block = {c['id'] for c in m['cells'] if not c['los']}
    spikes = {c['id'] for c in m['cells'] if c['glyph']} & walk
    assert len(walk) == 241 and len(spikes) == 96 and len(los_block) == 8
    return walk, los_block, spikes


WALK, LOS_BLOCK, SPIKES = load_arena()
ALL = set(range(N))


def mask_hex(cells):
    bits = [0] * N
    for c in cells:
        bits[c] = 1
    out = []
    for k in range(N // 4):
        v = bits[4 * k] | (bits[4 * k + 1] << 1) | (bits[4 * k + 2] << 2) | (bits[4 * k + 3] << 3)
        out.append('%x' % v)
    return ''.join(out)


def dchar(d):
    return '-' if d == -1 else str(d)


def grid_ctx(spec):
    """(walkable set, los-blocking set, spikes set) pour un « grid » de cas."""
    if spec == 'arena':
        return WALK, LOS_BLOCK, SPIKES
    return ALL, set(spec['losBlocking']), set(spec.get('spikes', []))


def dump(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(obj, f, separators=(',', ':'), ensure_ascii=False)
    print(f'{name:16s} {os.path.getsize(p):>9,d} octets')


# ------------------------------------------------------------------------------------------------ grid.json
def export_grid(rng):
    xs, ys = [], []
    for c in range(N):
        x, y = G.cell_to_xy(c)
        assert MG.cell_to_xy(c) == (x, y) and MG.cell_to_rowcol(c) == G.cell_to_rowcol(c)
        xs.append(x)
        ys.append(y)
    box = {'x0': -5, 'x1': 40, 'y0': -25, 'y1': 20}
    valid_bits, xy_cells = [], []
    for x in range(box['x0'], box['x1'] + 1):
        for y in range(box['y0'], box['y1'] + 1):
            valid_bits.append('1' if G.is_valid_coord(x, y) else '0')
            c = G.xy_to_cell(x, y)
            mg = MG.xy_to_cell(x, y)
            assert (mg if mg is not None else -1) == c, (x, y)
            xy_cells.append(c)
    origins = sorted(set([0, 13, 14, 27, 28, 300, 286, 152, 546, 559, 280, 279] + rng.sample(range(N), 16)))
    fns = {
        'dir4': G.look_direction4, 'dir4Exact': G.look_direction4_exact, 'dir4Diag': G.look_direction4_diag,
        'dir4DiagExact': G.look_direction4_diag_exact, 'dir8Exact': G.look_direction8_exact, 'dir8': G.look_direction8,
    }
    dirs = {k: [''.join(dchar(fn(o, c)) for c in range(N)) for o in origins] for k, fn in fns.items()}
    rel_origins = origins[:12]
    rel = {
        'distance': [[G.distance(o, c) for c in range(N)] for o in rel_origins],
        'adjacent': [''.join('1' if G.are_adjacent(o, c) else '0' for c in range(N)) for o in rel_origins],
        'inLine': [''.join('1' if G.in_line(o, c) else '0' for c in range(N)) for o in rel_origins],
        'inDiag': [''.join('1' if G.in_diag(o, c) else '0' for c in range(N)) for o in rel_origins],
    }
    by_coord = []
    for _ in range(400):
        x1, x2 = rng.randint(-3, 36), rng.randint(-3, 36)
        y1, y2 = rng.randint(-22, 16), rng.randint(-22, 16)
        by_coord.append([x1, y1, x2, y2,
                         G.look_direction4_by_coord(x1, y1, x2, y2), G.look_direction4_exact_by_coord(x1, y1, x2, y2),
                         G.look_direction4_diag_by_coord(x1, y1, x2, y2),
                         G.look_direction4_diag_exact_by_coord(x1, y1, x2, y2),
                         G.look_direction8_exact_by_coord(x1, y1, x2, y2), G.look_direction8_by_coord(x1, y1, x2, y2)])
    sym = []
    for _ in range(600):
        a, b = rng.randrange(N), rng.randrange(N)
        sym.append([a, b, M.symmetric_cell(a, b)])
    dump('grid.json', {
        'x': xs, 'y': ys,
        'next': [G.next_cell(c, d) for c in range(N) for d in range(8)],
        'nextInvalid': [G.next_cell(-1, 0), G.next_cell(560, 1), G.next_cell(300, -1), G.next_cell(300, 8)],
        'neighbours4': [G.neighbours(c) for c in range(N)],
        'neighbours8': [G.neighbours(c, G.ALL_DIRECTIONS) for c in range(N)],
        'pixel': [list(G.cell_to_pixel(c)) for c in range(N)],
        'box': box, 'validCoord': ''.join(valid_bits), 'xyToCell': xy_cells,
        'dirOrigins': origins, 'dirs': dirs,
        'relOrigins': rel_origins, 'rel': rel,
        'byCoord': by_coord, 'symmetric': sym,
    })


# ------------------------------------------------------------------------------------------------ los.json
def export_los(rng):
    lines = []
    for o in (300, 559):
        for c in range(N):
            lines.append([o, c, G.cells_between(o, c)])
    for _ in range(1100):
        a, b = rng.randrange(N), rng.randrange(N)
        lines.append([a, b, G.cells_between(a, b)])
    configs = []
    walk_list = sorted(WALK)
    for k in range(200):
        arena = k < 100
        if arena:
            gspec = 'arena'
            origin = rng.choice(walk_list)
            pool = walk_list
        else:
            gspec = {'losBlocking': sorted(rng.sample(range(N), rng.randint(0, 50)))}
            origin = rng.randrange(N)
            pool = list(range(N))
        _, los_block, _ = grid_ctx(gspec)
        occ = set(rng.sample(pool, rng.randint(0, 25))) - {origin}
        if k % 7 == 0:
            occ.add(origin)  # le lanceur occupe sa case : sans effet sur la LdV
        cell_los = (lambda c, lb=los_block: c not in lb)
        blocks = (lambda c, oc=occ: c in oc)
        expected = ''.join('1' if G.has_line_of_sight(origin, c, cell_los, blocks) else '0' for c in range(N))
        cands = G.range_cells(origin, 0, rng.choice((4, 6, 7)))
        if k % 3 == 1:
            rng.shuffle(cands)
        client = G.los_cells(origin, cands, cell_los, blocks)
        assert set(client) == {c for c in cands if expected[c] == '1'}
        configs.append({'grid': gspec, 'origin': origin, 'occupied': sorted(occ), 'los': expected,
                        'candidates': cands, 'losCells': client})
    dump('los.json', {'lines': lines, 'configs': configs})


# ------------------------------------------------------------------------------------------------ zones.json
def position_pool(rng):
    pos = []
    for d in range(8):
        for k in (1, 2, 3):
            c = 300
            for _ in range(k):
                c = G.next_cell(c, d)
            pos.append((300, c))
    for off in ((2, 1), (-1, 3), (3, -2), (-2, -1)):
        x, y = G.cell_to_xy(300)
        pos.append((300, G.xy_to_cell(x + off[0], y + off[1])))
    pos.append((300, 300))
    for t in (0, 13, 14, 27, 28, 280, 294, 532, 546, 559, 131, 469, 152):
        for _ in range(3):
            d = rng.randrange(8)
            c = t
            for _ in range(rng.randint(1, 3)):
                n = G.next_cell(c, d)
                if n != -1:
                    c = n
            pos.append((t, c))
        pos.append((t, rng.randrange(N)))
    for _ in range(40):
        pos.append((rng.randrange(N), rng.randrange(N)))
    return pos


def zone_fields(z):
    return {'shape': z.shape, 'radius': z.radius, 'minRadius': z.min_radius, 'degression': z.degression,
            'maxDegressionTicks': z.max_degression_ticks, 'stopAtTarget': z.stop_at_target, 'cellIds': list(z.cell_ids)}


def zone_eval(z, target, caster):
    cells = z.cells(target, caster)
    inz = [c for c in range(N) if z.contains(c, target, caster)]
    union = sorted(set(c for c in cells if G.is_valid_cell(c)) | set(inz))
    malus = [z.aoe_malus(target, caster, c) for c in union]
    eff = [z.efficiency(target, caster, c) for c in union[:3]]
    return {'t': target, 'c': caster, 'cells': cells, 'in': inz if len(inz) <= 40 else mask_hex(inz),
            'malus': malus, 'eff': eff}


def export_zones(rng):
    pool = position_pool(rng)
    center = [p for p in pool if p[0] == 300]
    fixed = [(300, G.next_cell(G.next_cell(300, d), d)) for d in range(8)] + [center[-2], (300, 300)]
    cases = []
    big = set('AaZI')
    shapes = list('PCXLTGWROQ+#*VU-/IBlFDZAa') + [' ', 'K']
    for sh in shapes:
        radii = (1, 3) if sh in big else range(0, 6)
        for r in radii:
            if sh in Z.MIN_SIZE_SHAPES:
                mins = (0, 1, 2) if sh != 'l' else (0, 1, 3)
            else:
                mins = (None,)
            for mn in mins:
                if sh == 'l':
                    raw = f'l{mn},{r}'
                elif mn is None:
                    raw = f'{sh}{r}'
                else:
                    raw = f'{sh}{r},{mn}'
                if rng.random() < 0.3:  # paramètres de dégressivité explicites
                    dg, tk = rng.choice((0, 10, 25, 30)), rng.choice((0, 1, 4, 6))
                    raw = raw + (f',{dg},{tk}' if sh in Z.MIN_SIZE_SHAPES else f',{dg},{tk}')
                    if sh in Z.MIN_SIZE_SHAPES and rng.random() < 0.5:
                        raw += f',{tk},{rng.choice((0, 1))}'
                if sh == ' ':
                    raw = ' ' + raw[1:]
                z = Z.SpellZone.from_raw(raw)
                few = sh in big or sh == 'D'
                positions = (fixed[:2] if few else rng.sample(fixed[:8], 3) + fixed[8:]) + \
                    rng.sample(pool, 2 if few else 3)
                for t, c in positions:
                    e = zone_eval(z, t, c)
                    e['raw'] = raw
                    cases.append(e)
    # constructions directes (sans normalisation) : rayon minimal non nul sur toutes les formes
    for sh in 'CXLTGWROQ+#*VU-/BlFD':
        for r in (2, 4):
            for mn in (1, 2):
                z = Z.SpellZone(shape=sh, radius=r, min_radius=mn, degression=rng.choice((10, 20)),
                                max_degression_ticks=rng.choice((2, 4)), stop_at_target=rng.random() < 0.5)
                for t, c in [fixed[1], fixed[2]] + rng.sample(pool, 3):
                    e = zone_eval(z, t, c)
                    e['init'] = zone_fields(z)
                    cases.append(e)
    # l avec arrêt sur la cible
    for r in (3, 6, 11):
        for mn in (0, 1, 2):
            z = Z.SpellZone(shape='l', radius=r, min_radius=mn, stop_at_target=True)
            for t, c in [fixed[1], fixed[4]] + rng.sample(center, 3):
                e = zone_eval(z, t, c)
                e['init'] = zone_fields(z)
                cases.append(e)
    # zoneDescr réels (DofusDB)
    with open(os.path.join(ROOT, 'research', 'raw', 'dofusdb', 'spell_levels.json'), encoding='utf-8') as f:
        levels = json.load(f)
    seen = {}
    for sl in levels.values():
        for eff in (sl.get('effects') or []) + (sl.get('criticalEffect') or []):
            zd = eff['zoneDescr']
            key = json.dumps({k: zd.get(k) for k in ('shape', 'param1', 'param2', 'damageDecreaseStepPercent',
                                                     'maxDamageDecreaseApplyCount', 'isStopAtTarget', 'cellIds')},
                             sort_keys=True)
            seen.setdefault(key, zd)
    descr_cases = []
    for key in sorted(seen):
        zd = json.loads(key)
        z = Z.SpellZone.from_zone_descr(zd)
        spots = [fixed[0]] if z.shape in 'AaZI;D' else [fixed[0], fixed[3]] + rng.sample(pool, 2)
        evals = [zone_eval(z, t, c) for t, c in spots]
        descr_cases.append({'descr': zd, 'fields': zone_fields(z), 'evals': evals})
    extra = [{'shape': 67, 'param1': 2}, {'shape': 108, 'param1': 1, 'param2': 5}, {'shape': None},
             {'param1': 3}, {}, {'shape': 82, 'param1': 0, 'param2': 0}, {'shape': 73, 'param1': 2},
             {'shape': 79, 'param1': 3, 'damageDecreaseStepPercent': None}, {'shape': 75, 'param1': 2}]
    for zd in extra:
        z = Z.SpellZone.from_zone_descr(zd)
        descr_cases.append({'descr': zd, 'fields': zone_fields(z), 'evals': [zone_eval(z, *fixed[1])]})
    # analyse de rawZone
    raws = ['C2', 'X63,1', 'l1,11', 'l0,4', 'R1,1', 'R0,0', 'T2', 'P', 'P3', '', 'I3', 'O2', 'C2,1,5,2,1', ';1,2,3',
            ';', 'K2', 'Q2,2', '#2,2,15', 'V3,30', 'G2,0,0', 'F2,0,0', 'C63', 'a', 'A', ' ', 'l3', 'X1,0,10,4,0,9',
            'U2,5,6,7,1', 'B3', 'D4', 'Z2', 'W2', '*6,0,0', '+5', '-2', '/3']
    parsed = [{'raw': r, 'fields': zone_fields(Z.SpellZone.from_raw(r)), 'rawOut': Z.SpellZone.from_raw(r).raw()}
              for r in raws]
    dump('zones.json', {'cases': cases, 'descr': descr_cases, 'parsed': parsed})


# ------------------------------------------------------------------------------------------------ castCells.json
def export_cast(rng):
    configs = []
    walk_list = sorted(WALK)
    for k in range(420):
        arena = k % 3 != 2
        gspec = 'arena' if arena else {'losBlocking': sorted(rng.sample(range(N), rng.randint(0, 40)))}
        walk, los_block, _ = grid_ctx(gspec)
        origin = rng.choice(walk_list) if arena else rng.randrange(N)
        pool = walk_list if arena else list(range(N))
        occ = set(rng.sample(pool, rng.randint(0, 20)))
        if rng.random() < 0.7:
            occ.add(origin)
        spec = {
            'minRange': rng.choice((0, 0, 1, 1, 2, 3)),
            'range': rng.choice((0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12)) if k % 40 else 63,
            'rangeCanBeBoosted': rng.random() < 0.5,
            'castInLine': rng.random() < 0.35,
            'castInDiagonal': rng.random() < 0.25,
            'castTestLos': rng.random() < 0.6,
            'needFreeCell': rng.random() < 0.3,
            'needTakenCell': rng.random() < 0.2,
        }
        bonus = rng.choice((0, 0, 1, 2, 4, 6, -2))
        req_walk = rng.random() < 0.8
        maxr = spec['range'] + (bonus if spec['rangeCanBeBoosted'] else 0)
        maxr = max(maxr, spec['minRange'])
        rc = G.range_cells(origin, spec['minRange'], maxr, spec['castInLine'], spec['castInDiagonal'])
        exp = [c for c in rc
               if (not req_walk or c in walk)
               and not (spec['needFreeCell'] and c in occ)
               and not (spec['needTakenCell'] and c not in occ)
               and (not spec['castTestLos'] or G.has_line_of_sight(origin, c, lambda x: x not in los_block,
                                                                   lambda x: x in occ))]
        configs.append({'grid': gspec, 'origin': origin, 'occupied': sorted(occ), 'spec': spec, 'rangeBonus': bonus,
                        'requireWalkable': req_walk, 'maxRange': maxr, 'rangeCells': rc, 'expected': exp})
    # rangeCells bruts (toutes combinaisons ligne/diagonale, rayons 0..8 et 63)
    raw = []
    for _ in range(250):
        o = rng.randrange(N)
        mn = rng.choice((-1, 0, 0, 1, 2, 3, 5))
        mx = rng.choice((0, 1, 2, 3, 5, 8, 63, -1))
        line, diag = rng.random() < 0.5, rng.random() < 0.5
        raw.append([o, mn, mx, line, diag, G.range_cells(o, mn, mx, line, diag)])
    dump('castCells.json', {'configs': configs, 'rangeCells': raw})


# ------------------------------------------------------------------------------------------------ path.json
def board_for(gspec, occ, mover_cell=None):
    walk, _, _ = grid_ctx(gspec)
    b = M.Board(walkable=set(walk))
    for i, c in enumerate(sorted(occ)):
        b.fighters[f'F{i}'] = M.Fighter(f'F{i}', c, 1)
    if mover_cell is not None and b.fighter_at(mover_cell) is None:
        b.fighters['MOVER'] = M.Fighter('MOVER', mover_cell, 0)
    return b


def brute_avoid(start, mp, free, spike):
    """Référence indépendante : énumération des chemins simples (<= mp pas) -> (pics min, longueur min)."""
    best = {start: (0, 0)}

    def dfs(c, length, sp, visited):
        if length == mp:
            return
        for n in G.neighbours(c):
            if n in visited or not free(n):
                continue
            s2 = sp + (1 if spike(n) else 0)
            key = (s2, length + 1)
            if n not in best or key < best[n]:
                best[n] = key
            visited.add(n)
            dfs(n, length + 1, s2, visited)
            visited.discard(n)
    dfs(start, 0, 0, {start})
    return best


def dijkstra_avoid(start, goal, free, spike):
    dist = {start: (0, 0)}
    pq = [((0, 0), start)]
    while pq:
        k, c = heapq.heappop(pq)
        if dist.get(c) != k:
            continue
        if c == goal:
            return k
        for n in G.neighbours(c):
            if not free(n):
                continue
            nk = (k[0] + (1 if spike(n) else 0), k[1] + 1)
            if n not in dist or nk < dist[n]:
                dist[n] = nk
                heapq.heappush(pq, (nk, n))
    return None


def export_path(rng):
    walk_list = sorted(WALK)
    ring = [c for c in walk_list if c not in SPIKES and any(G.distance(c, s) <= 3 for s in SPIKES)]
    reach = []
    for k in range(320):
        arena = k % 4 != 3
        gspec = 'arena' if arena else {'losBlocking': []}
        pool = walk_list if arena else list(range(N))
        start = rng.choice(pool)
        occ = set(rng.sample(pool, rng.randint(0, 30))) - {start}
        mp = rng.choice((0, 1, 2, 3, 4, 5, 6, 8, 12))
        b = board_for(gspec, occ, start)
        r = M.reachable(b, start, mp)
        reach.append({'grid': gspec, 'start': start, 'mp': mp, 'occupied': sorted(occ),
                      'cells': list(r.keys()), 'costs': list(r.values())})
    paths = []
    for k in range(320):
        arena = k % 4 != 3
        gspec = 'arena' if arena else {'losBlocking': []}
        pool = walk_list if arena else list(range(N))
        start, goal = rng.choice(pool), rng.choice(pool)
        occ = set(rng.sample(pool, rng.randint(0, 40))) - {start}
        if rng.random() < 0.8:
            occ.discard(goal)
        b = board_for(gspec, occ, start)
        paths.append({'grid': gspec, 'start': start, 'goal': goal, 'occupied': sorted(occ),
                      'path': M.shortest_path(b, start, goal)})
    avoid = []
    for k in range(120):
        start = rng.choice(ring)
        occ = set(rng.sample(walk_list, rng.randint(0, 12))) - {start}
        mp = rng.choice((1, 2, 3, 4, 5, 6))
        free = (lambda c, oc=occ: c in WALK and c not in oc)
        best = brute_avoid(start, mp, free, lambda c: c in SPIKES)
        b = board_for('arena', occ, start)
        assert set(best) == set(M.reachable(b, start, mp))
        avoid.append({'start': start, 'mp': mp, 'occupied': sorted(occ),
                      'best': [[c, s, ln] for c, (s, ln) in sorted(best.items())]})
    avoid_sp = []
    for k in range(150):
        start, goal = rng.choice(walk_list), rng.choice(walk_list)
        occ = set(rng.sample(walk_list, rng.randint(0, 25))) - {start, goal}
        free = (lambda c, oc=occ: c in WALK and c not in oc)
        res = dijkstra_avoid(start, goal, free, lambda c: c in SPIKES)
        avoid_sp.append({'start': start, 'goal': goal, 'occupied': sorted(occ),
                         'best': list(res) if res is not None else None})
    # tacle
    ratios = []
    for _ in range(300):
        ev = rng.choice((0, 0, 5, 20, 50, 100, -10))
        tk = [rng.choice((0, 0, 3, 10, 30, 60, -5)) for _ in range(rng.randint(0, 4))]
        cant = rng.random() < 0.1
        f = M.Fighter('P', 300, 0, evade=ev, cant_be_tackled=cant)
        b = M.Board(walkable=set(range(N)))
        b.fighters['P'] = f
        for i, (n, t) in enumerate(zip(G.neighbours(300), tk)):
            b.fighters[f'E{i}'] = M.Fighter(f'E{i}', n, 1, tackle=t)
        r = M.evade_ratio(b, f)
        mp, ap = rng.randint(0, 12), rng.randint(0, 14)
        ratios.append({'evade': ev, 'tackles': tk[:len(G.neighbours(300))], 'cantBeTackled': cant, 'ratio': r,
                       'mp': mp, 'ap': ap, 'losses': list(M.tackle_losses(mp, ap, r))})
    walks = []
    for _ in range(200):
        b = M.Board(walkable=set(WALK))
        me = M.Fighter('P', rng.choice(walk_list), 0, evade=rng.choice((0, 0, 10, 40)))
        b.fighters['P'] = me
        for i, c in enumerate(rng.sample(walk_list, rng.randint(0, 20))):
            if c != me.cell:
                b.fighters[f'E{i}'] = M.Fighter(f'E{i}', c, 1, tackle=rng.choice((0, 0, 5, 20, 60)))
        goal = rng.choice(walk_list)
        others = {f.cell for f in b.fighters.values() if f.fid != 'P'}
        if goal in others:
            continue
        path = M.shortest_path(b, me.cell, goal)
        if not path:
            continue
        mp, ap = rng.randint(1, 10), rng.randint(0, 12)
        rat = [M.evade_ratio(b, me, c) for c in path]
        res = M.walk(b, me, path, mp, ap)
        walks.append({'path': path, 'mp': mp, 'ap': ap, 'ratios': rat, 'result': list(res)})
    dump('path.json', {'reachable': reach, 'shortest': paths, 'avoidReach': avoid, 'avoidShortest': avoid_sp,
                       'tackle': ratios, 'walks': walks})


# ------------------------------------------------------------------------------------------------ push.json
def export_push(rng):
    dirs = []
    for _ in range(3000):
        c = rng.randrange(N)
        r = rng.random()
        if r < 0.1:
            t = c
        else:
            t = rng.randrange(N)
        td = t if rng.random() < 0.4 else (c if rng.random() < 0.1 else rng.randrange(N))
        dirs.append([c, td, t, M.push_direction(c, td, t), M.pull_direction(c, td, t),
                     M.push_direction(c, td, t, allow_same_cell=False)])
    moves = []
    walk_list = sorted(WALK)
    for k in range(1150):
        arena = k % 4 != 3
        gspec = 'arena' if arena else {'losBlocking': []}
        pool = walk_list if arena else list(range(N))
        kind = 'pull' if k % 5 == 4 else 'push'
        target = rng.choice(pool)
        near = [c for c in pool if 0 < G.distance(c, target) <= 6]
        caster = target if rng.random() < 0.05 else rng.choice(near or pool)
        if rng.random() < 0.55:
            targeted = target
        else:
            cand = [c for c in range(N) if G.distance(c, target) <= 3]
            targeted = rng.choice(cand)
        force = rng.choice((1, 2, 3, 3, 4, 5, 6, 8, 10, 63))
        others = set(rng.sample(pool, rng.randint(0, 25))) - {target, caster}
        # alignements de combattants derrière la cible (chaînes de collision)
        if rng.random() < 0.35:
            d = rng.randrange(8)
            c = target
            for _ in range(rng.randint(1, 5)):
                c = G.next_cell(c, d)
                if c == -1 or c == caster:
                    break
                others.add(c)
        stop = set(rng.sample(pool, rng.randint(0, 3))) if rng.random() < 0.15 else set()
        stop -= others | {target, caster}
        from_cell = target
        if rng.random() < 0.1:  # cible déjà déplacée par un effet précédent du même sort
            fc = [c for c in pool if c not in others and c != caster and G.distance(c, target) <= 3]
            from_cell = rng.choice(fc) if fc else target
        b = M.Board(walkable=set(grid_ctx(gspec)[0]))
        level = rng.choice((1, 50, 199, 200, 1000))
        dopou = rng.choice((0, 0, 200, 1000, 1500))
        pac = rng.random() < 0.05
        cst = M.Fighter('C', caster, 0, level=level, push_damage=dopou, pacifist=pac)
        tgt = cst if caster == target else M.Fighter('T', from_cell, 1, push_res=rng.choice((0, 0, 50, 300)))
        b.fighters['C'] = cst
        if tgt is not cst:
            b.fighters['T'] = tgt
        res_by_cell = {}
        for i, c in enumerate(sorted(others)):
            if c == from_cell:
                continue
            f = M.Fighter(f'O{i}', c, 1, push_res=rng.choice((0, 0, 50, 300)))
            b.fighters[f.fid] = f
            res_by_cell[c] = f.push_res
        if kind == 'push':
            out = M.push(b, cst, tgt, force, targeted_cell=targeted, target_cell_before_spell=target,
                         caster_cell_before_spell=caster, stop_cells=stop, apply=False)
        else:
            out = M.pull(b, cst, tgt, force, targeted_cell=targeted, target_cell_before_spell=target,
                         stop_cells=stop, apply=False)
        occupied = sorted({f.cell for f in b.fighters.values()})
        rec = {'grid': gspec, 'kind': kind, 'caster': caster, 'targeted': targeted, 'target': target,
               'from': tgt.cell, 'force': force, 'occupied': occupied, 'stopAt': sorted(stop),
               'level': level, 'pushDamage': dopou, 'pacifist': pac,
               'targetPushRes': tgt.push_res, 'pushRes': [res_by_cell.get(c, 0) for c in occupied]}
        if out.drag is None:
            rec['result'] = None
        else:
            dr = out.drag
            rec['result'] = {'dir': dr.direction, 'cell': dr.cell, 'path': dr.path, 'remaining': dr.remaining_force,
                             'stop': dr.stop_reason, 'moved': out.moved,
                             'chain': [b.fighters[fid].cell for fid in dr.collateral],
                             'damages': [d for _, d in out.collision_damages]}
        moves.append(rec)
    edge_cells = sorted(WALK)
    free_empty = (lambda c: c in WALK)
    bd = M.Board(walkable=set(WALK))
    edge = [[M.push_to_edge_distance(bd, c, d) for d in range(8)] for c in edge_cells]
    assert all(bd.is_empty_for_movement(c) == free_empty(c) for c in range(-1, N))
    sorts = []
    for _ in range(400):
        td = rng.randrange(N)
        near = [c for c in range(N) if G.distance(c, td) <= rng.choice((2, 3, 5))]
        cells = rng.sample(near, min(len(near), rng.randint(1, 9)))
        is_push = rng.random() < 0.5
        sorts.append([td, is_push, cells, M.sort_targets_for_effect(td, is_push, cells)])
    dmg = []
    for _ in range(400):
        args = [rng.randint(0, 12), rng.choice((1, 2, 50, 199, 200, 201, 1000)), rng.choice((0, 150, 1000, 2000)),
                rng.choice((0, 0, 100, 700, 5000)), rng.randint(0, 5), rng.random() < 0.05]
        dmg.append(args + [M.collision_damage(*args)])
    dump('push.json', {'directions': dirs, 'moves': moves, 'edgeCells': edge_cells, 'edge': edge,
                       'sorts': sorts, 'collisionDamage': dmg})


def main():
    rng = random.Random(SEED)
    export_grid(random.Random(rng.random()))
    export_los(random.Random(rng.random()))
    export_zones(random.Random(rng.random()))
    export_cast(random.Random(rng.random()))
    export_path(random.Random(rng.random()))
    export_push(random.Random(rng.random()))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT) if f.endswith('.json'))
    print(f'total            {total:>9,d} octets')
    return 0


if __name__ == '__main__':
    sys.exit(main())
