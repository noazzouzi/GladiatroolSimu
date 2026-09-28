#!/usr/bin/env python3
"""Construit les données de cellules des cartes du Gladiatrool à partir du client DOFUS 3.

Chaîne complète (reproductible) :
  1. cytrus.json -> version courante de la release 'dofus3' (jeu 'dofus', windows)
  2. manifeste Cytrus v6 (FlatBuffers) -> fichiers du client
  3. Content/Map/Data/catalog_1.0.bin (Addressables) -> bundle contenant map_<id>
  4. mapdata_assets_world_<N>.bundle (Unity, UnityPy) -> MonoBehaviour map_<id> -> cellsData
  5. API DofusDB : spell-level 80489 ('Glyphe de combat', 30390) -> liste des cellules du glyphe des pics
                   spell-level 80837 ('Rassemblement Troollesque', 30609 grade 3) -> cellule 300
  6. Écrit research/data/map_<id>.json, research/figures/*_grid.txt et les PNG.

Usage :
  python3 tools/map/build_gladiatrool_map.py --cache <dossier_temp> [--repo /home/user/GladiatroolSimu]
             [--release dofus3] [--no-png]
Dépendances : pip install UnityPy pillow numpy
"""
import argparse, hashlib, json, math, os, sys, urllib.request, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cytrus  # noqa: E402
import d3_mapdata  # noqa: E402
from mapgeom import cell_to_xy, xy_to_cell, cell_to_pixel, cell_to_rowcol, DIRS  # noqa: E402

FIGHT_MAP = 139988488   # carte de combat (instance) — « Arène du Gladiatrool », posX/posY 0,0 dans DofusDB
LOBBY_MAP = 139988485   # hall de l'arène [-9,-41] (worldMap -1) : PNJ Monsieur Layool, trône en bois
GLYPH_SPELL_LEVEL = 80489       # Glyphe de combat (30390) grade 1 : effets 401 + 1091, zone ';' (liste de cellules)
RASSEMBLEMENT_SPELL_LEVEL = 80837  # Rassemblement Troollesque (30609) grade 3 : effet 2960 sur la cellule 300
HOLED_TILES = {807985, 807987, 807989, 807991}  # dalles « trouées » d'où sortent les pics
SPIKE_GFX = 807993
DOFUSDB = 'https://api.dofusdb.fr'
# Calibration du rendu DofusDB https://api.dofusdb.fr/img/maps/1/<id>.jpg (1910x970) :
#   image_x = S * px + OX ; image_y = S * py + OY   (px, py = centre DOFUS 2 de mapgeom.cell_to_pixel)
# ajustée en maximisant le gradient le long des arêtes de la grille (voir notes 41_carte_donnees.md)
IMG_CALIB = dict(S=1.0, OX=332.5, OY=4.0)


def http_json(url, cache_path):
    if os.path.exists(cache_path):
        return json.load(open(cache_path))
    with urllib.request.urlopen(url, timeout=120) as r:
        data = json.load(r)
    json.dump(data, open(cache_path, 'w'))
    return data


def http_file(url, path):
    if not os.path.exists(path):
        with urllib.request.urlopen(url, timeout=300) as r:
            open(path, 'wb').write(r.read())
    return path


def sha1(path):
    return hashlib.sha1(open(path, 'rb').read()).hexdigest()


def fetch_client_maps(cache, release):
    os.makedirs(cache, exist_ok=True)
    meta = http_json(f'{cytrus.CDN}/cytrus.json', os.path.join(cache, 'cytrus.json'))
    version = meta['games']['dofus']['platforms']['windows'][release]
    man_path = http_file(f'{cytrus.CDN}/dofus/releases/{release}/windows/{version}.manifest',
                         os.path.join(cache, f'dofus_{release}_windows_{version}.manifest'))
    frags = cytrus.parse_manifest(man_path)
    base = 'Dofus_Data/StreamingAssets/Content/Map/Data/'
    cat = os.path.join(cache, f'{release}_map_catalog.bin')
    if not os.path.exists(cat):
        cytrus.get_file(frags, base + 'catalog_1.0.bin', cat)
    bundles = {}
    for mid in (FIGHT_MAP, LOBBY_MAP):
        key = d3_mapdata.find_bundle_for_map(cat, mid)          # ex. mapdata_assets_world_534_<hash>.bundle
        fname = key.rsplit('_', 1)[0] + '.bundle'                # -> mapdata_assets_world_534.bundle
        local = os.path.join(cache, f'{release}_{fname}')
        if not os.path.exists(local):
            cytrus.get_file(frags, base + fname, local)
        bundles[mid] = dict(catalogKey=key, clientFile=base + fname, local=local, sha1=sha1(local))
    return dict(release=release, version=version, manifest=os.path.basename(man_path),
                catalogSha1=sha1(cat), bundles=bundles)


def holed_tile_cells(extracted, cells_mov):
    """Associe chaque dalle trouée (fond de carte) à une cellule.

    Les positions monde (x, y) des éléments de fond suivent le réseau 43 x 21.5 px. On cherche la
    translation (et le sens de l'axe vertical) qui envoie le plus de dalles de sol sur des cellules
    marchables, puis on retourne les cellules des dalles trouées. Les deux orientations testées
    donnent exactement le même ensemble (motif symétrique) — vérifié dans le script.
    """
    ground = {71291, 71365, 71292, 71289, 71290, 71364} | HOLED_TILES
    els = [e for e in extracted['backgroundElements'] if e['gfxId'] in ground]

    def cell_of(ii, jj):
        r = jj - 1
        if r < 0 or r >= 40:
            return None
        t = ii - 1 - (r % 2)
        if t % 2:
            return None
        c = t // 2
        return r * 14 + c if 0 <= c < 14 else None

    results = {}
    for sy in (1, -1):
        best = None
        for I0 in range(-60, 60):
            for J0 in range(-80, 80):
                cells = [cell_of(math.floor(e['x'] / 43) - I0, sy * (math.floor(e['y'] / 21.5) - J0)) for e in els]
                hit = sum(1 for c in cells if c in cells_mov)
                if best is None or hit > best[0]:
                    best = (hit, I0, J0, cells)
        hit, I0, J0, cells = best
        holed = sorted({c for c, e in zip(cells, els) if e['gfxId'] in HOLED_TILES})
        results[sy] = dict(hits=hit, total=len(els), I0=I0, J0=J0, holed=holed)
    out = dict(results[-1])  # axe vertical inversé (convention Unity, meilleur accord avec les éléments à cellId)
    out['orientationIndependent'] = results[1]['holed'] == results[-1]['holed']
    return out


def edge_depth(fight_cells):
    """Distance (Manhattan, repère MapPoint) à la plus proche cellule non jouable / hors carte."""
    depth = {}
    frontier = []
    for c in fight_cells:
        x, y = cell_to_xy(c)
        if any(xy_to_cell(x + dx, y + dy) not in fight_cells for dx, dy in DIRS):
            depth[c] = 1
            frontier.append(c)
    d = 1
    while frontier:
        nxt = []
        for c in frontier:
            x, y = cell_to_xy(c)
            for dx, dy in DIRS:
                n = xy_to_cell(x + dx, y + dy)
                if n in fight_cells and n not in depth:
                    depth[n] = d + 1
                    nxt.append(n)
        frontier = nxt
        d += 1
    return depth


def build_cells(extracted, glyph, spike_tiles, center):
    raw = extracted['cellsData']
    assert len(raw) == 560 and all(c['cellNumber'] == i for i, c in enumerate(raw))
    fight = {c['cellNumber'] for c in raw if c['mov'] and not c.get('nonWalkableDuringFight', 0)}
    depth = edge_depth(fight)
    cells = []
    for c in raw:
        i = c['cellNumber']
        row, col = cell_to_rowcol(i)
        x, y = cell_to_xy(i)
        px, py = cell_to_pixel(i)
        nb = [xy_to_cell(x + dx, y + dy) for dx, dy in DIRS]
        cells.append(dict(
            id=i, row=row, col=col, x=x, y=y, px=px, py=py,
            walkable=bool(c['mov']),
            los=bool(c['los']),
            nonWalkableDuringFight=bool(c.get('nonWalkableDuringFight', 0)),
            nonWalkableDuringRP=bool(c.get('nonWalkableDuringRP', 0)),
            farmCell=bool(c['farmCell']), visible=bool(c['visible']), havenbagCell=bool(c['havenbagCell']),
            red=bool(c['red']), blue=bool(c['blue']),
            floor=c.get('floor', c.get('altitude', 0)), speed=c['speed'], mapChangeData=c['mapChangeData'],
            moveZone=c['moveZone'], linkedZone=c['linkedZone'], arrow=c['arrow'],
            roleplayMonstersMovementBlocked=bool(c['roleplayMonstersMovementBlocked']),
            # --- dérivés ---
            fightWalkable=i in fight,
            glyph=i in glyph,
            spikeTile=i in spike_tiles,
            edgeDepth=depth.get(i),
            distCenter=(abs(x - cell_to_xy(center)[0]) + abs(y - cell_to_xy(center)[1])),
            neighbours=sorted(n for n in nb if n is not None and n in fight) if i in fight else [],
        ))
    return cells


def ascii_views(cells, title, notes):
    by = {c['id']: c for c in cells}

    def sym(c):
        if c['blue']:
            return 'B'
        if c['red']:
            return 'R'
        if c['fightWalkable']:
            return '^' if c['glyph'] else '.'
        if c['walkable']:
            return 'f'
        if c['glyph']:
            return '%'
        return '#' if c['los'] else 'X'

    out = [title, '=' * len(title), '']
    out += notes + ['',
            'Légende : ^ = cellule jouable DANS le glyphe des pics (liste officielle, sort 30390 / spell-level 80489)',
            '          . = cellule jouable hors glyphe     R = placement équipe rouge (joueurs)',
            '          B = cellule bleue (équipe monstres) — marchable mais nonWalkableDuringFight',
            '          f = marchable en RP mais pas en combat   % = cellule du glyphe NON marchable (sans effet)',
            '          # = non marchable (ne bloque pas la LdV)   X = non marchable ET bloque la LdV',
            '']
    # --- Vue 1 : écran, rangées en quinconce, avec ids
    out.append('VUE 1 — ÉCRAN (rangées 0..39 en quinconce, rangées impaires décalées d\'une demi-cellule)')
    out.append('Chaque cellule = <symbole><id sur 3 chiffres>. cellId = rangée*14 + colonne.')
    out.append('')
    out.append('     ' + ''.join(f'  c{col:<5d}' for col in range(14)))
    for row in range(40):
        pre = '    ' if row % 2 else ''
        toks = []
        for col in range(14):
            c = by[row * 14 + col]
            s = sym(c)
            toks.append(f'{s}{c["id"]:03d}   ' if s not in '#X' else f'{s}{c["id"]:03d}   ')
        out.append(f'r{row:02d}  ' + pre + ''.join(toks).rstrip())
    out.append('')
    # --- Vue 2 : MapPoint (x vers la droite, y vers le haut) restreinte à la zone utile
    fightc = [c for c in cells if c['walkable'] or c['glyph']]
    X = [c['x'] for c in fightc]
    Y = [c['y'] for c in fightc]
    x0, x1, y0, y1 = min(X) - 1, max(X) + 1, min(Y) - 1, max(Y) + 1
    out.append('VUE 2 — REPÈRE MapPoint (x vers la droite, y vers le haut ; rotation de 45° par rapport à l\'écran)')
    out.append('Dans cette vue, deux cellules adjacentes en DOFUS sont voisines horizontalement/verticalement ;')
    out.append('« en ligne » = même ligne ou même colonne ; distance = |dx|+|dy|. À l\'écran : +x = bas-droite, +y = haut-droite.')
    out.append('')
    out.append('  y\\x ' + ''.join(f'{x:>5d}' for x in range(x0, x1 + 1)))
    for y in range(y1, y0 - 1, -1):
        toks = []
        for x in range(x0, x1 + 1):
            cid = xy_to_cell(x, y)
            if cid is None:
                toks.append('     ')
            else:
                c = by[cid]
                s = sym(c)
                toks.append(f' {s}{cid:03d}' if (c['walkable'] or c['glyph']) else f'  {s}  ')
        out.append(f'{y:5d} ' + ''.join(toks).rstrip())
    out.append('')
    # --- Vue 3 : compacte (symboles seuls), repère MapPoint
    out.append('VUE 3 — COMPACTE (repère MapPoint, symboles seuls)')
    out.append('')
    for y in range(y1, y0 - 1, -1):
        line = ''
        for x in range(x0, x1 + 1):
            cid = xy_to_cell(x, y)
            line += ' ' if cid is None else sym(by[cid])
        out.append(f'{y:5d} ' + line)
    out.append('      ' + ''.join(str(abs(x) % 10) for x in range(x0, x1 + 1)) + '   (x mod 10)')
    out.append('')
    # --- Vue 4 : profondeur de bord
    out.append('VUE 4 — PROFONDEUR DE BORD (edgeDepth : 1 = cellule jouable touchant le bord/une case non jouable)')
    out.append('')
    for y in range(y1, y0 - 1, -1):
        line = ''
        for x in range(x0, x1 + 1):
            cid = xy_to_cell(x, y)
            c = by.get(cid) if cid is not None else None
            if c is None or not c['fightWalkable']:
                line += ' '
            else:
                d = c['edgeDepth']
                line += str(d) if d < 10 else '+'
        out.append(f'{y:5d} ' + line)
    return '\n'.join(out) + '\n'


def draw_png(cells, img_path, out_path, crop, scale, calib, overlay=True, title=None, show_glyph=True):
    from PIL import Image, ImageDraw, ImageFont
    S, OX, OY = calib['S'], calib['OX'], calib['OY']
    if overlay:
        base = Image.open(img_path).convert('RGBA')
    else:
        base = Image.new('RGBA', (1910, 970), (245, 243, 238, 255))
    layer = Image.new('RGBA', base.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    for c in cells:
        px, py = c['px'], c['py']
        poly = [((px) * S + OX, (py - 21.5) * S + OY), ((px + 43) * S + OX, py * S + OY),
                ((px) * S + OX, (py + 21.5) * S + OY), ((px - 43) * S + OX, py * S + OY)]
        if c['fightWalkable']:
            if c['red']:
                fill = (40, 200, 60, 150)
            elif c['glyph'] and show_glyph:
                fill = (230, 30, 30, 95) if overlay else (235, 120, 110, 255)
            else:
                fill = (0, 0, 0, 0) if overlay else (250, 236, 200, 255)
            dr.polygon(poly, fill=fill, outline=(20, 20, 160, 255))
        elif c['blue']:
            dr.polygon(poly, fill=(40, 90, 230, 160), outline=(20, 20, 160, 255))
        elif c['glyph'] and show_glyph:
            dr.polygon(poly, fill=(230, 30, 30, 40), outline=(230, 30, 30, 200))
        elif not overlay and c['walkable']:
            dr.polygon(poly, fill=(220, 220, 220, 255), outline=(150, 150, 150, 255))
    img = Image.alpha_composite(base, layer)
    x0, y0, x1, y1 = crop
    img = img.crop(crop).resize((int((x1 - x0) * scale), int((y1 - y0) * scale)), Image.LANCZOS)
    dr = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', int(10 * scale / 1.5))
        tfont = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    except OSError:
        font = tfont = ImageFont.load_default()
    for c in cells:
        if not (c['walkable'] or (c['glyph'] and show_glyph)):
            continue
        cx = (c['px'] * S + OX - x0) * scale
        cy = (c['py'] * S + OY - y0) * scale
        t = str(c['id'])
        bb = dr.textbbox((0, 0), t, font=font)
        w, h = bb[2] - bb[0], bb[3] - bb[1]
        dr.text((cx - w / 2 + 1, cy - h / 2 + 1 - bb[1]), t, font=font, fill=(255, 255, 255))
        dr.text((cx - w / 2, cy - h / 2 - bb[1]), t, font=font, fill=(0, 0, 0))
    if title:
        dr.rectangle((0, 0, img.size[0], 28), fill=(255, 255, 255, 220))
        dr.text((8, 4), title, font=tfont, fill=(0, 0, 0))
    img = img.convert('RGB')
    if overlay:  # palette 256 couleurs : fichier ~3x plus léger, lisibilité inchangée
        img = img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(out_path, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', required=True)
    ap.add_argument('--repo', default=os.path.abspath(os.path.join(HERE, '..', '..')))
    ap.add_argument('--release', default='dofus3')
    ap.add_argument('--no-png', action='store_true')
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    data_dir = os.path.join(a.repo, 'research', 'data')
    fig_dir = os.path.join(a.repo, 'research', 'figures')
    os.makedirs(data_dir, exist_ok=True)
    os.makedirs(fig_dir, exist_ok=True)

    client = fetch_client_maps(a.cache, a.release)
    sl = http_json(f'{DOFUSDB}/spell-levels/{GLYPH_SPELL_LEVEL}', os.path.join(a.cache, f'spell-level_{GLYPH_SPELL_LEVEL}.json'))
    glyph_lists = [e['zoneDescr']['cellIds'] for e in sl['effects'] if e['zoneDescr'].get('cellIds')]
    assert glyph_lists and all(g == glyph_lists[0] for g in glyph_lists)
    glyph_raw = glyph_lists[0]
    glyph = set(glyph_raw)
    rass = http_json(f'{DOFUSDB}/spell-levels/{RASSEMBLEMENT_SPELL_LEVEL}',
                     os.path.join(a.cache, f'spell-level_{RASSEMBLEMENT_SPELL_LEVEL}.json'))
    rass_cells = sorted({c for e in rass['effects'] for c in e['zoneDescr'].get('cellIds', [])})
    center = 300
    today = datetime.date.today().isoformat()

    outputs = {}
    for mid in (FIGHT_MAP, LOBBY_MAP):
        b = client['bundles'][mid]
        tt = d3_mapdata.load_map(b['local'], mid)
        ex = d3_mapdata.extract(tt, mid)
        mov = {c['cellNumber'] for c in ex['cellsData'] if c['mov']}
        tiles = holed_tile_cells(ex, mov)
        cells = build_cells(ex, glyph, set(tiles['holed']), center)
        fight = [c for c in cells if c['fightWalkable']]
        summary = dict(
            walkable=sum(c['walkable'] for c in cells),
            fightWalkable=len(fight),
            losBlocking=sum(not c['los'] for c in cells),
            red=[c['id'] for c in cells if c['red']],
            blue=[c['id'] for c in cells if c['blue']],
            nonWalkableDuringFight=[c['id'] for c in cells if c['nonWalkableDuringFight']],
            glyphCellsTotal=len(glyph),
            glyphCellsFightWalkable=sum(1 for c in fight if c['glyph']),
            glyphCellsNotWalkable=sorted(c['id'] for c in cells if c['glyph'] and not c['fightWalkable']),
            spikeTileCells=len(tiles['holed']),
            spikeTilesEqualGlyphWalkable=set(tiles['holed']) == {c['id'] for c in fight if c['glyph']},
            fightWalkableByEdgeDepth={str(d): sum(1 for c in fight if c['edgeDepth'] == d)
                                      for d in sorted({c['edgeDepth'] for c in fight})},
            glyphByEdgeDepth={str(d): sum(1 for c in fight if c['glyph'] and c['edgeDepth'] == d)
                              for d in sorted({c['edgeDepth'] for c in fight})},
            playableOutsideGlyph=sum(1 for c in fight if not c['glyph']),
        )
        doc = dict(
            mapId=mid,
            role=('CARTE DE COMBAT du Gladiatrool (instance)' if mid == FIGHT_MAP else
                  "HALL / ARÈNE RP [-9,-41] (PNJ Monsieur Layool, trône) — ce n'est PAS la carte de combat : "
                  f'voir map_{FIGHT_MAP}.json'),
            generatedOn=today,
            source=dict(
                primary='Client DOFUS 3 (Unity) téléchargé depuis le CDN Ankama Cytrus v6',
                release=client['release'], clientVersion=client['version'], manifest=client['manifest'],
                mapCatalogSha1=client['catalogSha1'], bundle=b['clientFile'], addressablesKey=b['catalogKey'],
                bundleSha1=b['sha1'], unityObject=f'MonoBehaviour map_{mid} (mapData.cellsData[560])',
                glyphCells=f'{DOFUSDB}/spell-levels/{GLYPH_SPELL_LEVEL} (sort 30390 « Glyphe de combat », '
                           'effets 401 « glyphe de début de tour » et 1091 « glyphe-aura », zoneDescr.shape=59 liste de cellules)',
                arenaCenter=f'{DOFUSDB}/spell-levels/{RASSEMBLEMENT_SPELL_LEVEL} (sort 30609 « Rassemblement Troollesque » '
                            f'grade 3, effet 2960, zone = cellules {rass_cells})',
                spikeTiles='éléments de fond gfx 807985/807987/807989/807991 (dalles trouées) + 807993 (pics, x266), '
                           'positions monde recalées sur la grille',
                crossChecks=['client 3.7.2.2 (release beta) : cellsData et dalles trouées identiques',
                             'client DOFUS 2 main 2.73.3.14 : ni 139988485 ni 139988488 dans maps*.d2p',
                             'rendu DofusDB img/maps/1/<id>.jpg + captures DPLN (tuto2k-5, tuto2k-46)'],
                tileFit=tiles,
            ),
            width=14, height=20, cellCount=560,
            coordinates=dict(
                rowCol='row = id // 14 (0..39), col = id % 14 ; rangées impaires décalées d\'une demi-cellule à droite',
                mapPoint='a,r = divmod(id,28) ; r<14 : (x,y)=(a+r, r-a) ; sinon (x,y)=(a+1+r-14, r-14-a) ; '
                         'inverse id = (x-y)*14 + y + (x-y)//2',
                axes='+x = bas-droite (SE) écran, +y = haut-droite (NE) ; voisins = (x±1,y),(x,y±1) ; distance = |dx|+|dy|',
                pixel='px = 43*(x+y)+43 = col*86+43+(row%2)*43 ; py = 21.5*(x-y)+21.5 = row*21.5+21.5 (DOFUS 2, zoom 1)',
                imageCalibration=dict(IMG_CALIB, image=f'{DOFUSDB}/img/maps/1/{mid}.jpg',
                                      formula='image_x = S*px + OX ; image_y = S*py + OY'),
                implementation='tools/map/mapgeom.py (auto-tests : python3 tools/map/mapgeom.py)',
            ),
            specialCells=dict(
                arenaCenter=center,
                playerPlacementRed=summary['red'],
                blueCells=summary['blue'],
                blueNote='cellule 152 : marchable mais nonWalkableDuringFight, zone liée isolée (linkedZone 32), '
                         'entourée de 8 cellules bloquant la LdV (124,137,138,151,153,165,166,180) — '
                         'HYPOTHÈSE : poste d\'observation de la Mama Troollette avant son entrée',
                rassemblementTroollesqueCells=rass_cells,
                glyphCellList=glyph_raw,
                fightWalkableCells=[c['id'] for c in fight],
                glyphFightWalkableCells=[c['id'] for c in fight if c['glyph']],
                safeFightCells=[c['id'] for c in fight if not c['glyph']],
                edgeCells=[c['id'] for c in fight if c['edgeDepth'] == 1],
                glyphDepth3Cells=[c['id'] for c in fight if c['glyph'] and c['edgeDepth'] == 3],
            ),
            summary=summary,
            cells=cells,
        )
        path = os.path.join(data_dir, f'map_{mid}.json')
        with open(path, 'w') as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        outputs[mid] = dict(json=path, summary=summary)

        if mid == FIGHT_MAP:
            notes = [f'Source : client DOFUS 3 {client["version"]} ({b["clientFile"]}, sha1 {b["sha1"]}),',
                     f'         glyphe : DofusDB spell-level {GLYPH_SPELL_LEVEL} ; généré le {today} par tools/map/build_gladiatrool_map.py',
                     f'Cellules jouables en combat : {summary["fightWalkable"]} ; dans le glyphe des pics : '
                     f'{summary["glyphCellsFightWalkable"]} ; hors glyphe : {summary["playableOutsideGlyph"]}',
                     f'Placement joueurs (rouge) : {summary["red"]} autour du centre {center} ; cellule bleue : {summary["blue"]}',
                     'Aucun obstacle ni cellule bloquant la LdV à l\'intérieur de l\'arène (seules les entités bloquent la LdV).']
            title = f'Carte de combat du Gladiatrool — map {mid}'
        else:
            notes = [f'ATTENTION : map {mid} = hall RP de l\'arène (PNJ Monsieur Layool sur le trône). Le combat se déroule',
                     f'sur la map {FIGHT_MAP} (voir map_{FIGHT_MAP}_grid.txt). Les symboles ^/% montrent ici la liste du',
                     f'glyphe 30390 projetée sur cette carte à titre de comparaison : mêmes ids donc même anneau, mais il',
                     f'n\'est PAS au bord de la zone marchable du hall (profondeur de bord 1 à 6, voir VUE 4) ;',
                     f'{summary["glyphCellsFightWalkable"]}/{len(glyph)} cellules du glyphe marchables ici ; placement rouge/bleu : aucun.']
            title = f'Hall de l\'arène du Gladiatrool (RP) — map {mid}'
        with open(os.path.join(fig_dir, f'map_{mid}_grid.txt'), 'w') as f:
            f.write(ascii_views(cells, title, notes))
        if not a.no_png:
            img = http_file(f'{DOFUSDB}/img/maps/1/{mid}.jpg', os.path.join(a.cache, f'img_{mid}.jpg'))
            if mid == FIGHT_MAP:
                draw_png(cells, img, os.path.join(fig_dir, f'map_{mid}_overlay.png'), (300, 150, 1560, 800), 1.5,
                         IMG_CALIB, overlay=True,
                         title=f'map {mid} — rouge : glyphe des pics (30390) ; vert : placement ; bleu : cellule bleue 152')
                draw_png(cells, img, os.path.join(fig_dir, f'map_{mid}_schematic.png'), (300, 150, 1560, 800), 1.5,
                         IMG_CALIB, overlay=False,
                         title=f'map {mid} (schéma, sans décor) — rouge : pics ; vert : placement ; bleu : 152')
            else:
                draw_png(cells, img, os.path.join(fig_dir, f'map_{mid}_overlay.png'), (250, 60, 1660, 900), 1.35,
                         IMG_CALIB, overlay=True, show_glyph=False,
                         title=f'map {mid} (hall RP, PAS la carte de combat) — calibration supposée identique')
    print(json.dumps({str(k): v for k, v in outputs.items()}, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
