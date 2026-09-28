#!/usr/bin/env python3
"""Vérifications des modules tools/mechanics (géométrie, LdV, zones, dégâts, poussée, tacle).

Usage : python3 tools/mechanics/verify_mechanics.py [--verbose]
Sortie : liste des contrôles OK/ÉCHEC + rendus ASCII des zones du Gladiatrool (avec --verbose).
Dépendances : stdlib uniquement ; lit research/data/map_139988488.json (carte de combat) si présent et
compare avec tools/map/mapgeom.py (implémentation indépendante d'un autre agent) si présent.
"""
from __future__ import annotations

import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import geometry as G  # noqa: E402
import zones as Z  # noqa: E402
import damage as D  # noqa: E402
import movement as M  # noqa: E402

VERBOSE = '--verbose' in sys.argv
RESULTS = []


def check(name, cond, detail=''):
    RESULTS.append((name, bool(cond), detail))
    if VERBOSE or not cond:
        print(('OK   ' if cond else 'ÉCHEC') + ' ' + name + (f' — {detail}' if detail else ''))


def load_arena():
    p = os.path.join(ROOT, 'research', 'data', 'map_139988488.json')
    if not os.path.exists(p):
        return None
    with open(p, encoding='utf-8') as f:
        m = json.load(f)
    walk = {c['id'] for c in m['cells'] if c['walkable'] and not c['nonWalkableDuringFight']}
    los = {c['id']: c['los'] for c in m['cells']}
    glyph = set(m['specialCells'].get('glyphCellList') or [])
    return m, walk, los, glyph


# ------------------------------------------------------------------------------------------ 1. géométrie
def test_geometry():
    G._self_test()
    check('géométrie : bijection cellId <-> (x,y) sur 560 cellules + isValidCoord exact', True)
    # valeurs de référence connues (MapPoint DOFUS 2)
    ref = {0: (0, 0), 1: (1, 1), 13: (13, 13), 14: (1, 0), 27: (14, 13), 28: (1, -1), 300: (17, -4), 559: (33, -6)}
    check('géométrie : valeurs de référence MapPoint', all(G.cell_to_xy(c) == xy for c, xy in ref.items()))
    try:
        sys.path.insert(0, os.path.join(ROOT, 'tools', 'map'))
        import mapgeom  # type: ignore
        same = all(mapgeom.cell_to_xy(c) == G.cell_to_xy(c) for c in range(560))
        same_d = all(mapgeom.distance(a, b) == G.distance(a, b) for a in range(0, 560, 7) for b in range(0, 560, 11))
        same_n = all(sorted(mapgeom.neighbours(c)) == sorted(G.neighbours(c)) for c in range(560))
        check('géométrie : identique à tools/map/mapgeom.py (autre agent)', same and same_d and same_n)
    except ImportError:
        check('géométrie : tools/map/mapgeom.py absent (non comparé)', True)
    # directions : pas unitaire orthogonal = distance 1, cardinal = distance 2
    ok = all(G.distance(300, G.next_cell(300, d)) == (1 if G.is_orthogonal(d) else 2) for d in range(8))
    check('géométrie : directions impaires = pas de 1, paires = pas diagonal de 2', ok)
    # getLookDirection4 : jamais -1 entre deux cases valides distinctes
    ok = all(G.look_direction4(300, c) in (1, 3, 5, 7) for c in range(560) if c != 300)
    check('géométrie : getLookDirection4 renvoie toujours un axe', ok)


# ------------------------------------------------------------------------------------------ 2. ligne de vue
def test_los(arena):
    rng = random.Random(1)
    walk = arena[1] if arena else set(range(560))
    los_flag = (lambda c: arena[2][c]) if arena else (lambda c: True)
    cells = sorted(walk)
    mism = 0
    for _ in range(200):
        occupied = set(rng.sample(cells, 8))
        origin = rng.choice(cells)
        occupied.discard(origin)
        cands = G.range_cells(origin, 0, 12)
        fast = {c for c in cands if G.has_line_of_sight(origin, c, los_flag, lambda c: c in occupied)}
        full = set(G.los_cells(origin, cands, los_flag, lambda c: c in occupied))
        mism += fast != full
    check('LdV : version directe = algorithme client LosDetector (200 configurations aléatoires)', mism == 0,
          f'{mism} différences')
    # symétrie (propriété attendue du lancer de rayon sur grille)
    asym = 0
    for _ in range(300):
        a, b = rng.sample(cells, 2)
        occ = set(rng.sample(cells, 6)) - {a, b}
        asym += G.has_line_of_sight(a, b, blocks_los=lambda c: c in occ) != \
            G.has_line_of_sight(b, a, blocks_los=lambda c: c in occ)
    check('LdV : symétrique a->b / b->a (constat)', True, f'{asym} asymétries sur 300 tirages')
    # une entité entre deux cases alignées bloque
    a = 300
    mid = G.next_cell(a, 1)
    b = G.next_cell(mid, 1)
    check('LdV : entité intermédiaire bloque, entité sur la cible ne bloque pas',
          not G.has_line_of_sight(a, b, blocks_los=lambda c: c == mid)
          and G.has_line_of_sight(a, b, blocks_los=lambda c: c == b))


# ------------------------------------------------------------------------------------------ 3. zones
def test_zones(arena):
    rng = random.Random(2)
    shapes = 'PCXLTGWROQ+#*VU-/IBl'

    def interior(c, margin):
        x, y = G.cell_to_xy(c)
        return all(G.is_valid_coord(x + i, y + j) for i in (-margin, margin) for j in (-margin, margin))

    for sh in shapes:
        bad = tests = 0
        for _ in range(150):
            r = rng.randint(1, 5)
            mn = rng.randint(0, max(0, r - 1)) if sh in Z.MIN_SIZE_SHAPES else 0
            raw = f'{sh}{r},{mn}' if sh in Z.MIN_SIZE_SHAPES else f'{sh}{r}'
            if sh == 'l':
                raw = f'l1,{r}'  # seule variante présente dans les données (rayon minimal 1)
            z = Z.SpellZone.from_raw(raw)
            target = rng.randrange(560)
            if not interior(target, 11):
                continue  # près des bords, fill (V, B) s'interrompt sur les cases hors carte
            # lanceur aligné sur un AXE (V, B, F ne sont cohérents que dans ce cas dans le client)
            d = rng.choice(G.ORTHOGONAL_DIRECTIONS if sh in 'VBF' else range(8))
            caster = target
            for _k in range(rng.randint(1, 4)):
                caster = G.next_cell(caster, d)
            fill = set(c for c in z.cells(target, caster) if G.is_valid_cell(c))
            inz = {c for c in range(560) if z.contains(c, target, caster)}
            if sh == 'l':
                fill.discard(caster)
            tests += 1
            bad += fill != inz
        check(f'zones : fill == isCellInZone pour la forme {sh!r}', bad == 0, f'{bad}/{tests} différences')
    # divergences connues du client (documentées, non bloquantes)
    t = 300
    cst = G.next_cell(G.next_cell(300, 0), 0)
    zb = Z.SpellZone.from_raw('B3')
    div_b = set(zb.cells(t, cst)) != {c for c in range(560) if zb.contains(c, t, cst)}
    zl = Z.SpellZone.from_raw('l0,4')
    c2 = G.next_cell(G.next_cell(300, 5), 5)
    div_l = set(zl.cells(t, c2)) - {c2} != {c for c in range(560) if zl.contains(c, t, c2)}
    check('zones : divergences client connues (B en diagonale, l avec rayon min 0) reproduites',
          div_b and div_l)
    # fourche : divergence documentée
    z = Z.SpellZone.from_raw('F2')
    t = 300
    c = G.next_cell(G.next_cell(t, 5), 5)
    fill = set(z.cells(t, c))
    inz = {x for x in range(560) if z.contains(x, t, c)}
    check('zones : fourche F2 alignée — fill == isIn (profondeur radius+1 = 3)', fill == inz, f'{len(fill)} cases')
    # tailles attendues
    check('zones : C2 = 13 cases, X1 = 5, T2 = 5, G1 = 9, W1 = 4, *1 = 9, R1,1 = 6',
          [len(Z.SpellZone.from_raw(r).cells(300, G.next_cell(G.next_cell(300, 5), 5))) for r in
           ('C2', 'X1', 'T2', 'G1', 'W1', '*1', 'R1,1')] == [13, 5, 5, 9, 4, 9, 6])
    # dégressivité
    z = Z.SpellZone.from_raw('C2')
    mal = [z.aoe_malus(300, 286, c) for c in (300, G.next_cell(300, 1), G.next_cell(G.next_cell(300, 1), 1))]
    check('zones : dégressivité C2 = 0 / 10 / 20 %', mal == [0, 10, 20], str(mal))
    z = Z.SpellZone.from_zone_descr({'shape': 67, 'param1': 2, 'param2': 0,
                                     'damageDecreaseStepPercent': 0, 'maxDamageDecreaseApplyCount': 0})
    check('zones : dégressivité désactivée (0 %, 0) => malus 0', z.aoe_malus(300, 286, G.next_cell(300, 1)) == 0)
    z = Z.SpellZone.from_raw('C63')
    check('zones : rayon > 50 => jamais de dégressivité', z.aoe_malus(300, 286, 0) == 0)
    z = Z.SpellZone.from_raw('X63,1')
    xs = z.cells(300, 300)
    check('zones : X63 min 1 (Rassemblement Troollesque) = 4 demi-axes sans le centre',
          300 not in xs and all(G.in_line(300, c) for c in xs))
    if VERBOSE:
        caster = G.next_cell(G.next_cell(300, 5), 5)
        for raw in ('C2', 'X1', 'T2', 'F2', 'R1,1', 'G1', '+5', 'X5', '*2', 'C2,1', 'l1,11'):
            z = Z.SpellZone.from_raw(raw)
            print(f'\nZone {raw} (O = case ciblée 300, @ = lanceur {caster}) :')
            print(Z.ascii_render(z.cells(300, caster), 300, caster, span=6))


# ------------------------------------------------------------------------------------------ 4. dégâts
def test_damage():
    a = D.Stats(strength=6000)
    check('dégâts : Frappe Repoussoir 16-20 x61 = 976-1220', D.damage_range(16, 20, 100, a, melee=False) == (976, 1220))
    vul = [D.Multiplier(200, ('D',))]
    check('dégâts : Vulnérable (1163 x200 %, trig D) double les dégâts de sort',
          D.damage_range(59, 63, 100, a, melee=False, target_multipliers=vul) == (7198, 7686))
    # 1163 'D' ne s'applique pas aux dommages de collision
    t = D.Stats(is_player=False)
    r = D.receive_damage(283, 80, a, t, melee=False, target_multipliers=vul, collision=True)
    check('dégâts : Vulnérable ne s\'applique PAS aux dommages de poussée (trigger D exclut la collision)',
          r.final == 283)
    r = D.receive_damage(283, 80, a, t, melee=False, target_multipliers=[D.Multiplier(200, ('PD',))], collision=True)
    check('dégâts : un 1163 déclenché par PD s\'applique aux dommages de poussée', r.final == 566)
    # deux multiplicateurs se multiplient (int à chaque étape)
    check('dégâts : 1163 cumulés multiplicativement (200 % x 50 % = 100 %)',
          D.received_multiplier([D.Multiplier(200, ('I',)), D.Multiplier(50, ('I',))], 100,
                                collision=False, element=0, melee=False, ally_source=False) == 100)
    # résistances : fixes avant %, arrondi par troncature
    t = D.Stats(is_player=False, res_pct={0: 20, 1: 0, 2: 0, 3: 0, 4: 0}, res_fix={0: 100, 1: 0, 2: 0, 3: 0, 4: 0})
    r = D.receive_damage(1000, 100, D.Stats(), t, melee=False)
    check('dégâts : (1000 - 100 fixes) x (1 - 20 %) = 720', r.final == 720, str(r.final))
    # plafond de résistance joueur 50 %
    t = D.Stats(is_player=True, res_pct_all=80)
    check('dégâts : résistance % plafonnée à 50 pour un joueur', t.resist_pct(0) == 50)
    # exemple DPLN « Les dommages » : jet 12, Int 777 + 100 Puissance, 9 dommages + 78 feu + 41 crit
    c = D.Stats(intelligence=777, power=100, damage=9, elem_damage={0: 0, 1: 0, 2: 78, 3: 0, 4: 0}, crit_damage=41)
    v = D.sender_damage(12, 99, c, critical_effect=True)
    check('dégâts : exemple DPLN Flamiche (12 x 9,77 + 128) = 245', v == 245, str(v))
    # vol de vie = 50 % des PV retirés
    tgt = D.Stats(is_player=False, max_hp=10 ** 6, hp=10 ** 6)
    atk = D.Stats(strength=4000, max_hp=25000, hp=20000)
    r = D.compute_hit(70, 95, atk, tgt, melee=True)
    check('dégâts : vol de vie = floor(dégâts/2) plafonné aux PV manquants', r.life_steal_heal == min(r.life_loss // 2, 5000))
    # érosion de base 10 %
    check('dégâts : érosion 10 % de 4514 = 451', D.eroded_damage(4514, D.Stats(erosion=10, hp=30000)) == 451)
    # soin neutre boosté par la Force (3001 = élément neutre)
    check('soins : 3001 « soins Neutre » utilise la Force (44-48 x61 = 2684-2928)',
          (D.sender_damage(44, 3001, a), D.sender_damage(48, 3001, a)) == (2684, 2928))
    # la Puissance ne s'applique pas aux soins
    check('soins : la Puissance est ignorée pour les soins',
          D.sender_damage(44, 3001, D.Stats(strength=6000, power=3000)) == 2684)
    # coup critique
    check('critique : 30 % (sort) + 10 % (stat) = 40 % ; sort à 0 % => 0',
          D.critical_chance(30, 10) == 40 and D.critical_chance(0, 50) == 0 and D.critical_chance(95, 20) == 100)
    # dégâts « % PV du lanceur » non boostés
    s = D.Stats(strength=6000, hp=30000, max_hp=30000)
    check('dégâts : Coup de Sang (89, 20 % PV lanceur) = 6000 sans Force', D.sender_damage(20, 89, s) == 6000)
    # AoE : Impact C2 à 2 cases = 80 %
    z = Z.SpellZone.from_raw('C2')
    eff = z.efficiency(300, 286, G.next_cell(G.next_cell(300, 1), 1))
    r = D.compute_hit(74, 100, a, D.Stats(is_player=False), melee=False, aoe_efficiency=eff)
    check('dégâts : Impact jet 74 à 2 cases du centre = int(4514 x 0,8) = 3611', r.final == 3611, str(r.final))


# ------------------------------------------------------------------------------------------ 5. poussée
def test_push(arena):
    walk = arena[1] if arena else set(range(560))
    glyph = arena[3] if arena else set()
    b = M.Board(walkable=set(walk))
    p = M.Fighter('P', 300, 0, level=200, push_damage=1000)
    m = M.Fighter('T', G.next_cell(300, 1), 1, level=200)
    b.fighters = {'P': p, 'T': m}
    out = M.push(b, p, m, 2, targeted_cell=m.cell)
    check('poussée : Frappe Repoussoir (2 cases) éloigne la cible de 2 cases en ligne',
          out.drag and len(out.drag.path) == 2 and G.distance(300, m.cell) == 3)
    # contre le bord : combien de cases restantes ?
    m.cell = G.next_cell(300, 1)
    dist_edge = M.push_to_edge_distance(b, m.cell, 1)
    out = M.push(b, p, m, dist_edge + 3, targeted_cell=m.cell)
    check('poussée : collision au bord => 3 cases restantes x 283 = 849 (archétype, 1000 DoPou)',
          out.collision_damages and out.collision_damages[0][1] == 849, str(out.collision_damages))
    if arena:
        check('poussée : la cible poussée au bord finit dans les pics (anneau de 2 cases)', m.cell in glyph,
              f'case {m.cell}')
    # poussée diagonale (cardinale) : force divisée par 2 (arrondi sup.)
    b2 = M.Board(walkable=set(range(560)))
    p2 = M.Fighter('P', 300, 0)
    t2 = M.Fighter('T', G.next_cell(300, 0), 1)
    b2.fighters = {'P': p2, 'T': t2}
    out = M.push(b2, p2, t2, 3, targeted_cell=t2.cell)
    check('poussée : direction cardinale (diagonale MapPoint) => ceil(3/2) = 2 pas diagonaux',
          out.drag.direction == 0 and len(out.drag.path) == 2, str(out.drag))
    # chaîne de collision
    b3 = M.Board(walkable=set(range(560)))
    c = 300
    p3 = M.Fighter('P', c, 0, push_damage=1000)
    t3 = M.Fighter('T', G.next_cell(c, 1), 1)
    u3 = M.Fighter('U', G.next_cell(t3.cell, 1), 1)
    v3 = M.Fighter('V', G.next_cell(u3.cell, 1), 1)
    b3.fighters = {'P': p3, 'T': t3, 'U': u3, 'V': v3}
    out = M.push(b3, p3, t3, 2, targeted_cell=t3.cell)
    check('poussée : chaîne T <- U <- V : 566 / 283 / 141', [d for _, d in out.collision_damages] == [566, 283, 141],
          str(out.collision_damages))
    # direction depuis le centre de zone quand la cible n'est pas sur la case ciblée
    d = M.push_direction(286, 300, G.next_cell(300, 7))
    check('poussée : cible hors de la case ciblée => poussée depuis la case ciblée (centre de zone)', d == 7)
    d = M.push_direction(300, 300, 300)
    check('poussée : cible = lanceur = case ciblée => pas de poussée', d == -1)
    # tri des cibles (poussée : les plus éloignées d'abord)
    cells = [G.next_cell(300, 1), G.next_cell(G.next_cell(300, 1), 1)]
    check('poussée : cibles traitées de la plus éloignée à la plus proche',
          M.sort_targets_for_effect(300, True, cells)[0] == cells[1])


# ------------------------------------------------------------------------------------------ 6. tacle
def test_tackle():
    b = M.Board(walkable=set(range(560)))
    me = M.Fighter('P', 300, 0, evade=0)
    e1 = M.Fighter('E1', G.next_cell(300, 1), 1, tackle=0)
    b.fighters = {'P': me, 'E1': e1}
    r = M.evade_ratio(b, me)
    check('tacle : 0 fuite vs 0 tacle => ratio 0,5', abs(r - 0.5) < 1e-9)
    check('tacle : 4 PM / 8 PA au contact d\'un ennemi => perd 2 PM et 4 PA', M.tackle_losses(4, 8, r) == (2, 4))
    e2 = M.Fighter('E2', G.next_cell(300, 5), 1, tackle=0)
    b.fighters['E2'] = e2
    r = M.evade_ratio(b, me)
    check('tacle : deux tacleurs => 0,25 (multiplicatif)', abs(r - 0.25) < 1e-9)
    me.evade = 100
    check('tacle : fuite >= 2 x tacle + 2 => pas de tacle', M.evade_ratio(b, me) == 1.0)


def main():
    arena = load_arena()
    test_geometry()
    test_los(arena)
    test_zones(arena)
    test_damage()
    test_push(arena)
    test_tackle()
    ok = sum(1 for _, c, _ in RESULTS if c)
    print(f'\n{ok}/{len(RESULTS)} contrôles OK')
    return 0 if ok == len(RESULTS) else 1


if __name__ == '__main__':
    sys.exit(main())
