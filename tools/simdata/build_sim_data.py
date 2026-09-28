#!/usr/bin/env python3
"""Génère les données consolidées du simulateur du Gladiatrool.

Entrées (lecture seule) :
  research/raw/dofusdb/*.json   données du client DOFUS 3 (extraction DofusDB)
  research/data/*.json          données consolidées par la recherche (carte, annotations VOD, archétypes,
                                monstres, scripts de combat)
  tools/mechanics/zones.py      normalisation des zones (implémentation de référence)

Sorties :
  sim/data/gladiatrool.data.json    faits (spec : research/SPEC_DONNEES_SIMULATEUR.md §1-§11, §13)
  sim/config/default.config.json    hypothèses et choix (spec §12), chaque paramètre documenté dans `_doc`

Le script est déterministe (aucun horodatage de génération) et vérifie de nombreux invariants par
assertions. Python 3 stdlib uniquement.

Usage : python3 tools/simdata/build_sim_data.py [--check]
  --check : ne réécrit rien, échoue si les fichiers sur disque diffèrent de ce qui serait généré.
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'research' / 'raw' / 'dofusdb'
RDATA = ROOT / 'research' / 'data'
OUT_DATA = ROOT / 'sim' / 'data' / 'gladiatrool.data.json'
OUT_CONFIG = ROOT / 'sim' / 'config' / 'default.config.json'

sys.path.insert(0, str(ROOT / 'tools' / 'mechanics'))
sys.path.insert(0, str(ROOT / 'tools' / 'map'))
import zones as Z  # noqa: E402  (tools/mechanics/zones.py)
import damage as DMG  # noqa: E402  (tools/mechanics/damage.py)
import mapgeom as MG  # noqa: E402  (tools/map/mapgeom.py)

SCHEMA_VERSION = '1.0.0'


def load(path: Path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def fr(o, field='name') -> str:
    v = (o or {}).get(field) or {}
    return (v.get('fr') if isinstance(v, dict) else v) or ''


# ----------------------------------------------------------------------------------------------
# Sources
# ----------------------------------------------------------------------------------------------
SP = load(RAW / 'spells.json')
SL = load(RAW / 'spell_levels.json')
STATES_RAW = load(RAW / 'spell_states.json')
MONSTERS_RAW = load(RAW / 'monsters.json')
EFFECTS_RAW = load(RAW / 'effects.json')
SUMMARY = load(RAW / 'summary.json')
PROV = load(RAW / 'provenance.json')
PARAM_CLASS = {int(k): v for k, v in PROV['effect_param_classification'].items()}

MAP = load(RDATA / 'map_139988488.json')
ANNOT = load(RDATA / 'map_annotations.json')
FIGHT = load(RDATA / 'fight_scripts.json')
MON = load(RDATA / 'monsters.json')
SEM = load(RDATA / 'effects_semantics.json')
ACTIONS = load(RDATA / 'action_ids_dofus3.json')['actionIds']
ARCH_JSON = {k: load(RDATA / f'archetype_{k}.json') for k in ('acrobate', 'dompteur', 'magicien')}

ARCHETYPES = ('acrobate', 'dompteur', 'magicien')
ARCH_STATE = {'dompteur': 5899, 'acrobate': 5900, 'magicien': 5901}
ARCH_DISPLAY = {'acrobate': 'Acrobate', 'dompteur': 'Dompteur', 'magicien': 'Magicien'}
ARCH_FS_KEY = {'acrobate': 'Acrobate', 'dompteur': 'Dompteur', 'magicien': 'Magicien'}  # clés de fight_scripts
MISSING_LEVEL_SUBSTITUTES = {80750: 80760}  # 30475 « Amélioration : Jaillissement » apprend 80750 (404)


def level(lid: int) -> dict:
    return SL[str(lid)]


def spell(sid: int) -> dict:
    return SP[str(sid)]


def spell_levels_of(sid: int) -> list[int]:
    return list(spell(sid)['spellLevels'])


def level_of(sid: int, grade: int = 1) -> int:
    lv = spell_levels_of(sid)
    assert 1 <= grade <= len(lv), (sid, grade)
    lid = lv[grade - 1]
    assert level(lid)['grade'] == grade, (sid, grade, lid)
    return lid


def effects_of(lid: int, crit: bool = False) -> list[dict]:
    return level(lid)['criticalEffect' if crit else 'effects']


# ----------------------------------------------------------------------------------------------
# Carte
# ----------------------------------------------------------------------------------------------

def build_map() -> dict:
    cells_src = MAP['cells']
    assert len(cells_src) == 560 and MAP['mapId'] == 139988488
    spike_level = level(80489)
    glyph_effects = [e for e in spike_level['effects'] if e['effectId'] in (401, 1091)]
    assert len(glyph_effects) == 2
    raw_list = list(glyph_effects[0]['zoneDescr']['cellIds'])
    assert raw_list == list(glyph_effects[1]['zoneDescr']['cellIds'])
    assert len(raw_list) == 102 and len(set(raw_list)) == 100
    dups = sorted(c for c, n in Counter(raw_list).items() if n > 1)
    assert dups == [351, 455], dups

    playable = []
    cells = []
    for c in cells_src:
        cid = c['id']
        x, y = MG.cell_to_xy(cid)
        assert (x, y) == (c['x'], c['y']), cid
        walkable = bool(c['fightWalkable'])
        assert walkable == (bool(c['walkable']) and not c['nonWalkableDuringFight'])
        spikes = walkable and cid in raw_list
        assert spikes == (bool(c['glyph']) and walkable) == bool(c['spikeTile']) or not walkable, cid
        if walkable:
            playable.append(cid)
            neigh = sorted(n for n in MG.neighbours(cid) if cells_src[n]['fightWalkable'])
            assert neigh == sorted(c['neighbours']), (cid, neigh, c['neighbours'])
        else:
            neigh = []
            assert c['edgeDepth'] is None
        cells.append(OrderedDict([
            ('id', cid), ('x', x), ('y', y), ('walkable', walkable), ('los', bool(c['los'])),
            ('spikes', spikes), ('edgeDepth', c['edgeDepth']), ('neighbours', neigh),
        ]))

    spike_cells = sorted(c['id'] for c in cells if c['spikes'])
    listed_not_walkable = sorted(set(raw_list) - set(playable))
    assert len(playable) == 241, len(playable)
    assert len(spike_cells) == 96
    assert listed_not_walkable == [250, 293, 321, 362]
    assert spike_cells == ANNOT['spikeGlyphCells'] == FIGHT['spikeGlyph']['cells']['playable']
    edge_hist = Counter(c['edgeDepth'] for c in cells if c['walkable'])
    assert dict(sorted(edge_hist.items())) == {1: 48, 2: 44, 3: 40, 4: 32, 5: 28, 6: 24, 7: 16, 8: 8, 9: 1}
    spike_depth = Counter(c['edgeDepth'] for c in cells if c['spikes'])
    assert dict(spike_depth) == {1: 48, 2: 44, 3: 4}
    assert sorted(c['id'] for c in cells if c['spikes'] and c['edgeDepth'] == 3) == [160, 295, 305, 440]
    los_blocking = sorted(c['id'] for c in cells if not c['los'])
    assert los_blocking == [124, 137, 138, 151, 153, 165, 166, 180], los_blocking

    special = MAP['specialCells']
    start_cells = sorted(special['playerPlacementRed'])
    assert start_cells == [286, 287, 314, 315] == sorted(ANNOT['playerStartCells'])
    center = special['arenaCenter']
    assert center == 300 and cells[300]['edgeDepth'] == 9
    assert cells[300]['neighbours'] == start_cells
    boss_wait = special['blueCells'][0]
    assert boss_wait == 152 == ANNOT['mamaWaitingCell'] and not cells[152]['walkable']
    gift_cells = sorted(ANNOT['eventGlyphCells'])
    assert gift_cells == [272, 273, 299, 301, 327, 328, 329]
    assert all(cells[c]['walkable'] and not cells[c]['spikes'] for c in gift_cells + start_cells)
    assert ANNOT['obstacles']['staticInFight'] == []

    return OrderedDict([
        ('mapId', 139988488),
        ('grid', OrderedDict([
            ('width', 14), ('rows', 40), ('cellCount', 560),
            ('toXY', 'row=id//14; col=id%14; x=(row+1)//2+col; y=col-(row-(row+1)//2)'),
            ('fromXY', 'id=(x-y)*14+y+(x-y)//2'),
        ])),
        ('cells', cells),
        ('playable', playable),
        ('spikes', OrderedDict([
            ('cells', spike_cells), ('rawList', raw_list), ('duplicatesInRawList', dups),
            ('listedNotWalkable', listed_not_walkable), ('sourceSpellLevel', 80489),
        ])),
        ('startCells', start_cells),
        ('center', center),
        ('bossWaitCell', boss_wait),
        ('giftCells', gift_cells),
        ('losBlocking', los_blocking),
        ('staticObstacles', []),
        ('dynamicObstacles', {'$config': 'map.dynamicObstacles'}),
        ('_prov', prov(['CLI3 mapdata_assets_world_534.bundle (D:map)', 'DB sl80489', 'VOD (D:annot)'], 'V', 'haute',
                       'cases de cadeau : observation VOD (Robs)')),
    ])


def prov(src, status, conf=None, note=None) -> OrderedDict:
    p = OrderedDict([('src', list(src)), ('status', status)])
    if conf:
        p['conf'] = conf
    if note:
        p['note'] = note
    return p


# ----------------------------------------------------------------------------------------------
# Fermeture des niveaux de sorts
# ----------------------------------------------------------------------------------------------
# Sorts racines (tous leurs niveaux) : archétypes, améliorés, uniques, choix, Acclamations, monstres, boss, scénario,
# objectifs. Les sous-sorts, glyphes et sorts appris/désappris sont ajoutés par fermeture récursive.
SEED_SPELLS = sorted(set(
    [30416]                                                     # Frappe Repoussoir (commun)
    + list(range(30395, 30416))                                 # sorts des 3 archétypes
    + [30558] + list(range(30560, 30566)) + [30567] + list(range(30569, 30577)) + [30578, 30579, 30580, 30584, 30585]
    + list(range(30602, 30608)) + list(range(30611, 30624))     # uniques (+ Pense Vite 30615)
    + [30469] + list(range(30471, 30477)) + list(range(30478, 30492))  # « Amélioration : X »
    + list(range(30589, 30601)) + list(range(30629, 30638))     # Acclamations (accumulateurs + cartes)
    + [30644, 30648, 30649, 30639, 30608]                       # choix d'archétype, passif des joueurs
    + list(range(30380, 30395)) + [30694, 30421, 30568]         # monstres, passif Trooler, Poutch
    + [30430, 30432, 30609, 30750, 30724, 30659, 30723, 30718]  # Mama
    + [30390, 30443, 30566, 30657, 30658, 30626, 30710, 30577, 30700, 30701, 30754]  # scénario
    + [30624, 30420]                                            # posés par le serveur / jamais référencés
    + [30428, 30434, 30463, 30497, 30542, 30462, 30496, 30520, 30528, 30450, 30500, 30512, 30531,
       30449, 30505, 30511, 30524, 30439, 30510, 30515, 30535]  # les 21 objectifs
))
# autres attractions de la Foire du Trool (hors Gladiatrool) : ne doivent jamais être atteintes par la fermeture
EXCLUDED_SPELLS = set(sum((o['spellIds'] for o in FIGHT['otherSystemSpells']
                           if re.search(r'dagues|larves|Rugissement', o['name'])), []))
assert {30373, 30692, 30422} <= EXCLUDED_SPELLS


def sub_spell_ref(e: dict):
    """Référence de sort portée par un effet (règles d'extraction de tools/dofusdb/extract.py)."""
    eid = e['effectId']
    cls = PARAM_CLASS.get(eid, {})
    if eid in (3405, 3406):
        lid = e['value']
        if str(lid) in SL:
            L = level(lid)
            return OrderedDict([('spellId', L['spellId']), ('grade', L['grade']), ('spellLevelId', lid)])
        sub = MISSING_LEVEL_SUBSTITUTES.get(lid)
        assert sub is not None, ('niveau de sort absent non documenté', lid)
        L = level(sub)
        return OrderedDict([('spellId', L['spellId']), ('grade', L['grade']), ('spellLevelId', lid),
                            ('missing', True), ('substituteSpellLevelId', sub)])
    if eid == 406:
        assert e['value'] > 0 and e['diceSide'] == 0
        return OrderedDict([('spellId', e['value']), ('grade', None), ('spellLevelId', None)])
    if eid in (293, 2018):
        if e['diceNum'] <= 0:
            return None
        return OrderedDict([('spellId', e['diceNum']), ('grade', None), ('spellLevelId', None)])
    if cls.get('diceNum') == 'spell' and cls.get('diceSide') == 'spell_level_grade':
        sid, grade = e['diceNum'], e['diceSide']
        assert sid > 0 and grade > 0, (eid, sid, grade)
        return OrderedDict([('spellId', sid), ('grade', grade), ('spellLevelId', level_of(sid, grade))])
    for p, kind in cls.items():
        if kind in ('spell', 'spell_level') and isinstance(e.get(p), int) and e.get(p) > 0:
            raise AssertionError(f'référence de sort non gérée : effet {eid} paramètre {p}')
    return None


def compute_closure() -> list[int]:
    levels: set[int] = set()
    queue: list[int] = []

    def add_spell(sid):
        assert sid not in EXCLUDED_SPELLS, sid
        for lid in spell_levels_of(sid):
            if lid not in levels:
                levels.add(lid)
                queue.append(lid)

    for sid in SEED_SPELLS:
        add_spell(sid)
    while queue:
        lid = queue.pop()
        for crit in (False, True):
            for e in effects_of(lid, crit):
                ref = sub_spell_ref(e)
                if ref is None:
                    continue
                sid = ref['spellId']
                if ref.get('missing'):
                    continue
                add_spell(sid)
    return sorted(levels)


# ----------------------------------------------------------------------------------------------
# Normalisation d'un effet
# ----------------------------------------------------------------------------------------------
ELEMENTS = {0: 'neutral', 1: 'earth', 2: 'fire', 3: 'water', 4: 'air'}
MASK_CONDITION = re.compile(r'^(\*?)([bBeEfFzZKoOPpTWUvVrRQq])(\d*)$')  # masques « exclusifs » du client
CAMPS = ('Atq', 'Def', 'Sce')
DAMAGE_OR_HEAL = {89, 95, 100, 1048, 1092, 1109, 1118, 1123, 1223, 2020, 3001}


def parse_mask(mask: str) -> OrderedDict:
    include, exclude, camp = [], [], None
    for tok in (mask or '').split(','):
        tok = tok.strip()
        if not tok:
            continue
        if tok in CAMPS:
            assert camp is None, mask
            camp = tok
            continue
        m = MASK_CONDITION.match(tok)
        if m:
            exclude.append(OrderedDict([('key', m.group(2)), ('value', int(m.group(3)) if m.group(3) else None),
                                        ('onCaster', bool(m.group(1)))]))
            continue
        assert re.fullmatch(r'[A-Za-z]', tok), (mask, tok)
        include.append(tok)
    return OrderedDict([('include', include), ('exclude', exclude), ('camp', camp)])


def build_zone(zd: dict) -> OrderedDict:
    z = Z.SpellZone.from_zone_descr(zd)
    out = OrderedDict([('shape', z.shape), ('radius', z.radius), ('minRadius', z.min_radius),
                       ('degression', z.degression), ('maxTicks', z.max_degression_ticks)])
    if z.stop_at_target:
        out['stopAtTarget'] = True
    if zd.get('forcedDirection'):
        out['forcedDirection'] = True
    if z.shape == ';':
        out['cellIds'] = list(z.cell_ids)
    return out


def element_of(e: dict):
    eid = e['effectId']
    el = DMG.element_of(eid)
    if el in ELEMENTS:
        return ELEMENTS[el]
    if eid in DAMAGE_OR_HEAL and e.get('effectElement', -1) in ELEMENTS:
        return ELEMENTS[e['effectElement']]
    return None


def build_effect(e: dict) -> OrderedDict:
    eid = e['effectId']
    assert not e.get('random') and not e.get('group'), ('effets aléatoires non gérés', eid)
    out = OrderedDict([
        ('order', e.get('order', 0)), ('effectId', eid), ('exec', not e.get('forClientOnly', False)),
        ('min', e.get('diceNum', 0)), ('max', e.get('diceSide', 0)), ('value', e.get('value', 0)),
    ])
    el = element_of(e)
    if el:
        out['element'] = el
    out['targetMask'] = e.get('targetMask', '')
    out['mask'] = parse_mask(out['targetMask'])
    out['triggers'] = [t for t in (e.get('triggers') or '').split('|') if t]
    out['duration'] = e.get('duration', 0)
    out['delay'] = e.get('delay', 0)
    out['triggerDuration'] = e.get('effectTriggerDuration', 0)
    out['dispellable'] = e.get('dispellable', 0)
    out['zone'] = build_zone(e['zoneDescr'])
    ref = sub_spell_ref(e)
    if ref is not None:
        out['subSpell'] = ref
    if eid in (950, 951, 952):
        assert e['value'] > 0
        out['stateId'] = e['value']
    if eid == 181:
        out['summon'] = OrderedDict([('monsterId', e['diceNum']), ('grade', e['diceSide'])])
    return out


def parse_states_criterion(crit: str):
    if not crit:
        return None
    required = [int(x) for x in re.findall(r'HS\s*=\s*(\d+)', crit)]
    forbidden = [int(x) for x in re.findall(r'HS\s*!\s*(\d+)', crit)]
    assert required or forbidden, crit
    return OrderedDict([('raw', crit), ('required', required), ('forbidden', forbidden)])


# Famille / propriétaire d'un sort à partir de son type (research/raw/dofusdb/spell_types.json)
TYPE_FAMILY = {
    3797: ('common', 'common'),
    3888: ('archetype', 'acrobate'), 3889: ('archetype', 'dompteur'), 3887: ('archetype', 'magicien'),
    3902: ('upgraded', 'acrobate'), 3901: ('upgraded', 'dompteur'), 3903: ('upgraded', 'magicien'),
    3874: ('unique', 'acrobate'), 3873: ('unique', 'dompteur'), 3875: ('unique', 'magicien'), 3872: ('unique', 'common'),
    3842: ('choice', 'acrobate'), 3841: ('choice', 'dompteur'), 3843: ('choice', 'magicien'),
    3884: ('choice', 'acrobate'), 3885: ('choice', 'dompteur'), 3886: ('choice', 'magicien'),
    3870: ('acclamation', 'acrobate'), 3869: ('acclamation', 'dompteur'), 3871: ('acclamation', 'magicien'),
    3867: ('acclamation', 'acrobate'), 3866: ('acclamation', 'dompteur'), 3868: ('acclamation', 'magicien'),
    3862: ('subspell', 'acrobate'), 3879: ('subspell', 'acrobate'), 3844: ('subspell', 'dompteur'),
    3878: ('subspell', 'dompteur'), 3900: ('subspell', 'magicien'),
    3793: ('monster', '7981'), 3794: ('monster', '7982'), 3795: ('monster', '7983'),
    3919: ('passive', 'troolls'), 3920: ('passive', 'troolls'),
    3796: ('boss', '7984'), 3876: ('boss', '7984'), 3877: ('boss', '7984'), 3915: ('boss', '7984'),
    3834: ('scenario', 'scenario'), 3883: ('scenario', 'scenario'),
    3860: ('display', 'common'), 3880: ('display', 'magicien'), 3882: ('display', 'scenario'),
}
SPELL_FAMILY_OVERRIDE = {
    30639: ('passive', 'common'),      # passif des joueurs (corps 7980)
    30608: ('scenario', 'scenario'),   # Choix d'Archétype
    30577: ('scenario', 'scenario'),   # Finish Fight Trigger
    30739: ('display', 'common'),      # animation de transformation
    30687: ('display', 'scenario'),    # animation du cadeau
    30700: ('passive', 'scenario'),    # vulnérabilité de sortie des pics (joueurs et Troolls)
    30701: ('passive', 'scenario'),
    30421: ('passive', '7985'),        # sort de départ du Poutch
    30568: ('passive', '7986'),        # sort de départ du Poutch amélioré
}


def spell_family(sid: int):
    if sid in SPELL_FAMILY_OVERRIDE:
        return SPELL_FAMILY_OVERRIDE[sid]
    t = spell(sid)['typeId']
    if t in TYPE_FAMILY:
        return TYPE_FAMILY[t]
    if 3804 <= t <= 3829 or 3831 <= t <= 3859:
        return ('objective', 'scenario')
    raise AssertionError(f'famille inconnue pour le sort {sid} (type {t})')


def build_level(lid: int) -> OrderedDict:
    L = level(lid)
    s = spell(L['spellId'])
    for k in ('maxGlobalCastPerTurn', 'maxGlobalCastPerTarget'):
        assert not L.get(k), (lid, k)
    family, owner = spell_family(L['spellId'])
    cast = OrderedDict([
        ('ap', L['apCost']), ('range', [L['minRange'], L['range']]), ('rangeModifiable', bool(L['rangeCanBeBoosted'])),
        ('inLine', bool(L['castInLine'])), ('inDiagonal', bool(L['castInDiagonal'])), ('los', bool(L['castTestLos'])),
        ('needFreeCell', bool(L['needFreeCell'])), ('needTakenCell', bool(L['needTakenCell'])),
        ('needVisibleEntity', bool(L.get('needVisibleEntity', False))),
        ('maxPerTurn', L['maxCastPerTurn']), ('maxPerTarget', L['maxCastPerTarget']),
        ('interval', L['minCastInterval']), ('initialCooldown', L['initialCooldown']),
        ('globalCooldown', L['globalCooldown']), ('critRate', L['criticalHitProbability']),
        ('maxStack', L['maxStack']), ('statesCriterion', parse_states_criterion(L.get('statesCriterion'))),
    ])
    return OrderedDict([
        ('spellLevelId', lid), ('spellId', L['spellId']), ('grade', L['grade']),
        ('name', fr(s)), ('adminName', s.get('adminName') or ''), ('typeId', s['typeId']),
        ('family', family), ('owner', owner),
        ('cast', cast),
        ('effects', [build_effect(e) for e in L['effects']]),
        ('critEffects', [build_effect(e) for e in L['criticalEffect']]),
    ])


# ----------------------------------------------------------------------------------------------
# États
# ----------------------------------------------------------------------------------------------
STATE_FLAGS = ('preventsSpellCast', 'preventsFight', 'cantBeMoved', 'cantBePushed', 'cantDealDamage', 'invulnerable',
               'cantSwitchPosition', 'incurable', 'invulnerableMelee', 'invulnerableRange', 'cantTackle', 'cantBeTackled')
STATE_NOTES = {
    5994: 'marqueur sans effet propre : le ×2 vient des effets 1163 posés à côté (aura des pics, sortie 30701)',
    56: 'invulnérable (effet d\'état 7) : 0 dommage',
    157: 'inébranlable (effet d\'état 0) : ni poussée ni attirance ; échange et téléportation possibles',
    5970: 'joueurs : ne tacle pas, ne peut pas être taclé (aucun tacle dans le Gladiatrool)',
    5971: 'Mama avant son arrivée : non déplaçable, pas d\'échange ; exclue des masques e5971',
    5902: 'a déclenché le glyphe de combat (camp Def) : présent tant que l\'entité est dans les pics',
    5903: 'a déclenché le glyphe de combat (camp Atq) : présent tant que l\'entité est dans les pics',
    5918: 'Grabbed : attrapé par le Rassemblement Troollesque',
    5965: 'combatCanFinish (posé sur l\'entité de scénario par 30577)',
    5899: 'archétype Dompteur (interne Gladiateur)', 5900: 'archétype Acrobate (interne Baroudeur)',
    5901: 'archétype Magicien (interne Guérisseur)',
}
# États indispensables (spec §6) en plus des états référencés par les sorts retenus
REQUIRED_STATES = ([56, 157, 5898, 5899, 5900, 5901, 5902, 5903] + list(range(5904, 5912)) + [5913]
                   + list(range(5915, 5919)) + [5942] + list(range(5944, 5964)) + [5965, 5967, 5968, 5970, 5971]
                   + list(range(5973, 5978)) + [5979, 5980, 5981, 5994] + list(range(5996, 6017)) + [6024]
                   + list(range(6026, 6035)))


def referenced_states(spells: dict) -> set[int]:
    out = set()
    for L in spells.values():
        crit = L['cast']['statesCriterion']
        if crit:
            out.update(crit['required'] + crit['forbidden'])
        for e in L['effects'] + L['critEffects']:
            if 'stateId' in e:
                out.add(e['stateId'])
            for c in e['mask']['exclude']:
                if c['key'] in 'Ee' and c['value'] is not None:
                    out.add(c['value'])
            for t in e['triggers']:
                m = re.match(r'^EO(?:N|FF)(\d+)$', t)
                if m:
                    out.add(int(m.group(1)))
    return out


def build_states(spells: dict) -> OrderedDict:
    ids = referenced_states(spells) | {s for s in REQUIRED_STATES if str(s) in STATES_RAW}
    missing = sorted(i for i in ids if str(i) not in STATES_RAW)
    assert not missing, ('états référencés absents', missing)
    out = OrderedDict()
    for sid in sorted(ids):
        s = STATES_RAW[str(sid)]
        st = OrderedDict([
            ('id', sid), ('name', fr(s)), ('stateEffects', list(s['effectsIds'])),
            ('flags', [f for f in STATE_FLAGS if s.get(f)]),
            ('silent', bool(s.get('isSilent'))), ('displayTurnRemaining', bool(s.get('displayTurnRemaining'))),
        ])
        if sid in STATE_NOTES:
            st['note'] = STATE_NOTES[sid]
        out[str(sid)] = st
    assert out['5994']['stateEffects'] == [] and out['56']['stateEffects'] == [7] and out['157']['stateEffects'] == [0]
    assert 'invulnerable' in out['56']['flags'] and 'cantBePushed' in out['157']['flags']
    return out


# ----------------------------------------------------------------------------------------------
# Catalogue des effets (gestionnaires du moteur)
# ----------------------------------------------------------------------------------------------
# effectId -> (catégorie, gestionnaire, priorité v1, extras)
STAT_EFFECTS = {
    111: ('ap', 1), 128: ('mp', 1), 117: ('range', 1), 115: ('critPct', 1), 418: ('critDamage', 1),
    414: ('pushDamage', 1), 125: ('vitality', 1), 153: ('vitality', -1), 138: ('power', 1), 1076: ('resPct', 1),
    2803: ('resPctMelee', 1), 2807: ('resPctRanged', 1), 776: ('erosionPct', 1), 169: ('mp', -1),
    1171: ('finalDamagePct', 1), 1172: ('finalDamagePct', -1), 2971: ('finalHealPct', 1),
}
SUBSPELL_EXECUTORS = {
    792: ('effectTarget', 'effectTargetCell', False),
    2792: ('effectTarget', 'effectTargetCell', True),
    1160: ('originalCaster', 'effectTargetCell', False),
    2160: ('originalCaster', 'effectTargetCell', True),
    1017: ('buffCarrier', 'eventSourceCell', False),
    2017: ('buffCarrier', 'eventSourceCell', True),
    1018: ('eventSource', 'buffCarrierCell', False),
    1019: ('eventSource', 'eventSourceCell', False),
    2794: ('effectTarget', 'parentTargetedCell', False),
    2960: ('originalCaster', 'targetedCell', False),
}
EFFECT_HANDLERS = {
    4: ('teleport', 'teleport', 'must'), 5: ('push', 'push', 'must'), 6: ('pull', 'pull', 'must'),
    8: ('exchange', 'exchange', 'must'),
    89: ('damage', 'damageCasterHpPct', 'must'), 95: ('damage', 'lifeSteal', 'must'), 100: ('damage', 'damage', 'must'),
    1048: ('damage', 'hpMalusPct', 'must'), 1092: ('damage', 'damageTargetErodedHpPct', 'must'),
    1118: ('damage', 'damageCasterErodedHpPct', 'must'), 1123: ('damage', 'splashInitialDamage', 'must'),
    1223: ('damage', 'splashFinalDamage', 'must'),
    3001: ('heal', 'heal', 'must'), 1109: ('heal', 'healMaxHpPct', 'must'), 2020: ('heal', 'splashHeal', 'must'),
    147: ('heal', 'resurrect', 'must'),
    1040: ('shield', 'shield', 'must'), 2872: ('threshold', 'hpThreshold', 'must'), 765: ('buff', 'interceptDamage', 'must'),
    1042: ('pull', 'casterAdvance', 'must'), 1103: ('push', 'pushNoDamage', 'must'),
    950: ('state', 'setState', 'must'), 951: ('state', 'unsetState', 'must'), 952: ('state', 'disableState', 'must'),
    406: ('dispel', 'removeSpellEffects', 'must'), 132: ('dispel', 'dispel', 'must'),
    1163: ('multiplier', 'receivedDamageMultiplier', 'must'),
    140: ('turn', 'passTurn', 'must'), 141: ('death', 'kill', 'must'), 3407: ('turn', 'turnDuration', 'must'),
    293: ('spellModifier', 'spellBaseDamageBonus', 'must'),
    181: ('summon', 'summon', 'must'),
    401: ('glyph', 'glyphTurnStart', 'must'), 402: ('glyph', 'glyphTurnEnd', 'must'), 1091: ('glyph', 'glyphAura', 'must'),
    1165: ('glyph', 'glyphImmediate', 'must'), 2018: ('glyph', 'dispelGlyphs', 'must'),
    3405: ('temporarySpell', 'learnSpell', 'must'), 3406: ('temporarySpell', 'forgetSpell', 'must'),
    3008: ('choice', 'individualChoice', 'must'), 3404: ('choice', 'globalChoice', 'must'),
    335: ('display', 'noop', 'noop'), 666: ('display', 'noop', 'noop'), 3400: ('display', 'noop', 'noop'),
    3401: ('display', 'noop', 'noop'), 3792: ('display', 'noop', 'noop'), 3793: ('display', 'noop', 'noop'),
}
PARAM_MEANINGS = {
    'push': {'min': 'nombre de cases'}, 'pull': {'min': 'nombre de cases'},
    'teleport': {'min': 'inutilisé (zone : case d\'arrivée)'},
    'damage': {'min': 'jet minimal (ou pourcentage)', 'max': 'jet maximal (0 = fixe)'},
    'heal': {'min': 'jet minimal (ou pourcentage)', 'max': 'jet maximal (0 = fixe)', 'value': 'pourcentage (147)'},
    'shield': {'min': 'valeur du bouclier'}, 'threshold': {'min': 'seuil de PV'},
    'stat': {'min': 'valeur (max : fourchette éventuelle)'},
    'state': {'value': 'id d\'état (stateId)'},
    'dispel': {'value': 'id du sort dont les effets sont retirés (406, subSpell.spellId)'},
    'multiplier': {'min': 'pourcentage (200 = ×2)'},
    'turn': {'value': 'secondes (3407)'},
    'spellModifier': {'min': 'id du sort modifié (subSpell.spellId)', 'value': 'bonus de dégâts de base'},
    'summon': {'min': 'id du monstre', 'max': 'grade'},
    'glyph': {'min': 'id du sort de la marque (subSpell)', 'max': 'grade', 'value': 'couleur RGB (2018 : min = sort des glyphes à dissiper, 0 = tous)'},
    'temporarySpell': {'value': 'id de niveau de sort appris / désappris (subSpell.spellLevelId)'},
    'choice': {'value': 'id de la liste de choix'},
    'subSpell': {'min': 'id du sous-sort', 'max': 'grade du sous-sort', 'value': 'nombre maximal d\'exécutions par lancer (variantes GlobalLimitation)'},
    'display': {}, 'death': {}, 'exchange': {}, 'buff': {},
}


def build_effects_catalogue(spells: dict) -> OrderedDict:
    used = Counter()
    exec_used = Counter()
    for L in spells.values():
        for e in L['effects'] + L['critEffects']:
            used[e['effectId']] += 1
            if e['exec']:
                exec_used[e['effectId']] += 1
    out = OrderedDict()
    for eid in sorted(used):
        sem = SEM.get(str(eid))
        assert sem is not None, ('effet sans sémantique', eid)
        action = ACTIONS.get(str(eid))
        assert action, ('effet absent des ActionIds DOFUS 3', eid)
        action = action[0]
        assert action == sem['action_dofus3'], (eid, action, sem['action_dofus3'])
        entry = OrderedDict([('effectId', eid), ('action', action), ('label', sem['nom_fr'])])
        if eid in STAT_EFFECTS:
            stat, sign = STAT_EFFECTS[eid]
            entry.update([('category', 'stat'), ('handler', 'statBuff'), ('v1', 'must'), ('stat', stat), ('sign', sign)])
            params = PARAM_MEANINGS['stat']
        elif eid in SUBSPELL_EXECUTORS:
            caster, cell, limited = SUBSPELL_EXECUTORS[eid]
            entry.update([('category', 'subSpell'), ('handler', 'executeSubSpell'), ('v1', 'must'),
                          ('executor', OrderedDict([('caster', caster), ('cell', cell), ('globalLimit', limited)]))])
            params = PARAM_MEANINGS['subSpell']
        else:
            assert eid in EFFECT_HANDLERS, ('effet sans gestionnaire', eid)
            cat, handler, v1 = EFFECT_HANDLERS[eid]
            entry.update([('category', cat), ('handler', handler), ('v1', v1)])
            params = PARAM_MEANINGS[cat]
        el = DMG.element_of(eid)
        if el not in ELEMENTS and entry['category'] in ('damage', 'heal'):
            el = EFFECTS_RAW[str(eid)].get('elementId', -1)  # ex. 1118, 1109 : élément porté par /effects
        if el in ELEMENTS:
            entry['element'] = ELEMENTS[el]
        if entry['category'] in ('damage', 'heal'):
            entry['boostable'] = bool(DMG.is_boostable(eid)) and eid != 147  # 147 : résurrection (% des PV max)
        entry['params'] = OrderedDict(params)
        entry['occurrences'] = OrderedDict([('total', used[eid]), ('exec', exec_used[eid])])
        entry['confidence'] = sem.get('confiance')
        out[str(eid)] = entry
    # contrôles de cohérence avec la sémantique de recherche
    assert out['100']['boostable'] and out['3001']['boostable'] and out['95']['boostable']
    assert not out['89']['boostable'] and not out['1118']['boostable'] and not out['1092']['boostable']
    assert not out['1123']['boostable'] and not out['1223']['boostable'] and not out['1109']['boostable']
    return out


# ----------------------------------------------------------------------------------------------
# Statistiques de combattant
# ----------------------------------------------------------------------------------------------
BASE_EROSION = 10  # érosion de base (N70 §4.3, fiches en jeu)


def monster_stats(mid: int, **over) -> OrderedDict:
    m = MONSTERS_RAW[str(mid)]
    assert len(m['grades']) >= 1
    g = m['grades'][0]
    assert g['grade'] == 1
    res = OrderedDict([('neutral', g['neutralResistance']), ('earth', g['earthResistance']), ('fire', g['fireResistance']),
                       ('water', g['waterResistance']), ('air', g['airResistance'])])
    st = OrderedDict([
        ('level', g['level']), ('hp', g['lifePoints']), ('ap', g['actionPoints']), ('mp', g['movementPoints']),
        ('rangeBonus', g.get('bonusRange', 0)), ('strength', g['strength']), ('intelligence', g['intelligence']),
        ('chance', g['chance']), ('agility', g['agility']), ('power', 0), ('critPct', 0), ('critDamage', 0),
        ('pushDamage', 0), ('pushResist', 0), ('resPct', res), ('resPctMelee', 0), ('resPctRanged', 0),
        ('dodgeAp', g['paDodge']), ('dodgeMp', g['pmDodge']), ('tackle', 0), ('flee', 0), ('erosionPct', BASE_EROSION),
    ])
    assert g.get('vitality', 0) == 0 and g.get('damageReflect', 0) == 0
    for k, v in over.items():
        assert k in st, k
        st[k] = v
    return st


# ----------------------------------------------------------------------------------------------
# Archétypes
# ----------------------------------------------------------------------------------------------
CHOICE_TYPE = {'acrobate': 3842, 'dompteur': 3841, 'magicien': 3843}
UNIQUE_TYPE = {'acrobate': 3874, 'dompteur': 3873, 'magicien': 3875}
ACCUMULATOR = {'dompteur': 30589, 'acrobate': 30590, 'magicien': 30591}
ACCLAMATION_TYPE = {'dompteur': 3869, 'acrobate': 3870, 'magicien': 3871}
STATE_ARCH = {v: k for k, v in ARCH_STATE.items()}
PENSE_VITE = 80843


def build_archetypes(spells: dict) -> OrderedDict:
    body = MONSTERS_RAW['7980']
    gb = body['grades'][0]
    assert body['spells'] == [30416] and gb['startingSpellId'] == 80897
    passive = effects_of(80897)
    # bonus conditionnels du passif 30639 (non appliqués par défaut : config archetypes.hpMode / dompteurPower)
    cond = {}
    for e in passive:
        mask = parse_mask(e['targetMask'])
        on_caster = [c['value'] for c in mask['exclude'] if c['key'] == 'E' and c['onCaster']]
        if on_caster:
            cond[STATE_ARCH[on_caster[0]]] = (e['effectId'], e['diceNum'])
    assert cond == {'dompteur': (138, 3000), 'magicien': (153, 5000), 'acrobate': (125, 5000)}, cond
    turn_seconds = [e['value'] for e in passive if e['effectId'] == 3407]
    assert turn_seconds == [60]

    # emplacements : sort de départ (serveur) + Spell Manager 30626 niveaux 1..6 (effet 3405 filtré par l'état)
    slots = {k: [] for k in ARCHETYPES}
    for tier, lid in enumerate(spell_levels_of(30626), start=1):
        for e in effects_of(lid):
            if e['effectId'] != 3405:
                continue
            mask = parse_mask(e['targetMask'])
            req = [c['value'] for c in mask['exclude'] if c['key'] == 'E' and not c['onCaster']]
            assert len(req) == 1, e['targetMask']
            slots[STATE_ARCH[req[0]]].append((tier + 1, e['value'], f'tier{tier}', lid))

    out = OrderedDict()
    for key in ARCHETYPES:
        aj = ARCH_JSON[key]
        a = aj['archetype']
        state = ARCH_STATE[key]
        assert a['stateId'] == state
        choice_sid = a['choiceSpell']['id']
        choice_lid = level_of(choice_sid)
        assert any(e['effectId'] == 950 and e['value'] == state for e in effects_of(choice_lid))
        fs_order = FIGHT['spellUnlockOrder']['byArchetype'][ARCH_FS_KEY[key]]
        start = [x for x in fs_order if x['slot'] == 1][0]
        spell_slots = [OrderedDict([('slot', 0), ('spellLevelId', 80499), ('unlock', 'common')]),
                       OrderedDict([('slot', 1), ('spellLevelId', start['spellLevelId']), ('unlock', 'start')])]
        for slot, lid, unlock, mgr in sorted(slots[key]):
            spell_slots.append(OrderedDict([('slot', slot), ('spellLevelId', lid), ('unlock', unlock),
                                            ('managerSpellLevel', mgr)]))
        assert [s['slot'] for s in spell_slots] == list(range(8))
        assert [(s['slot'], s['spellLevelId']) for s in spell_slots[1:]] == [(x['slot'], x['spellLevelId']) for x in fs_order]
        for s in spell_slots:
            assert spells[str(s['spellLevelId'])]['family'] in ('archetype', 'common'), s

        # améliorations : sorts « Amélioration : X » (950 boostedSpell, 3406 désapprend, 3405 apprend)
        upgrades = OrderedDict()
        choice_spells = sorted(s for s in SEED_SPELLS if spell(s)['typeId'] == CHOICE_TYPE[key])
        assert len(choice_spells) == 7
        slot_levels = [s['spellLevelId'] for s in spell_slots[1:]]
        for sid in choice_spells:
            lid = level_of(sid)
            effs = effects_of(lid)
            forget = [e['value'] for e in effs if e['effectId'] == 3406 and not e['forClientOnly']]
            learn = [e['value'] for e in effs if e['effectId'] == 3405 and not e['forClientOnly']]
            boosted = [e['value'] for e in effs if e['effectId'] == 950]
            assert len(forget) == len(learn) == len(boosted) == 1, sid
            base, to = forget[0], learn[0]
            assert base in slot_levels, (sid, base)
            u = OrderedDict([('to', to), ('choiceSpellId', sid), ('choiceSpellLevelId', lid), ('boostedStateId', boosted[0])])
            if to in MISSING_LEVEL_SUBSTITUTES:
                u['to'] = MISSING_LEVEL_SUBSTITUTES[to]
                u['dataLearnsSpellLevelId'] = to
                u['brokenIf'] = {'$config': 'spells.jaillissementUpgradeBroken'}
            assert spells[str(u['to'])]['family'] == 'upgraded'
            fs = FIGHT['spellImprovements']['list'][str(sid)]
            assert fs['forgets']['spellLevelId'] == base and fs['learns']['spellLevelId'] == to
            upgrades[str(base)] = u
        upgrades = OrderedDict(sorted(upgrades.items(), key=lambda kv: slot_levels.index(int(kv[0]))))
        assert len(upgrades) == 7

        # sorts uniques (6 + Pense Vite) : usage unique (3406 sur leur propre niveau)
        unique_spells = [x['spellId'] for x in FIGHT['uniqueSpells']['byArchetype'][ARCH_FS_KEY[key]]]
        assert sorted(unique_spells) == sorted(s for s in SEED_SPELLS if spell(s)['typeId'] == UNIQUE_TYPE[key])
        uniques = [level_of(s) for s in unique_spells] + [PENSE_VITE]
        for lid in uniques:
            L = level(lid)
            assert L['apCost'] == 5 and L['criticalHitProbability'] in (0, 30), lid
            assert any(e['effectId'] == 3406 and e['value'] == lid for e in L['effects']), ('usage unique', lid)
        research_uniques = {sp2['levels']['normal']['spellLevelId'] for sp2 in aj['spells'] if sp2.get('unique')}
        assert research_uniques == set(uniques), (key, research_uniques, uniques)

        # Acclamations : carte (affichage + 792) → niveau de l'accumulateur (effet réel)
        accl = []
        cards = [x for x in FIGHT['bonusesByArchetype'][ARCH_FS_KEY[key]]['options']]
        assert len(cards) == 6
        research = {b['choiceSpellId']: b for b in aj['bonuses']}
        for c in cards:
            sid = c['cardSpellId']
            assert spell(sid)['typeId'] == ACCLAMATION_TYPE[key]
            clid = level_of(sid)
            subs = [build_effect(e)['subSpell'] for e in effects_of(clid) if e['effectId'] == 792 and not e['forClientOnly']]
            assert len(subs) == 1 and subs[0]['spellId'] == ACCUMULATOR[key]
            real = subs[0]['spellLevelId']
            stat_eff = [e for e in effects_of(real) if e['effectId'] in STAT_EFFECTS and not e['forClientOnly']]
            assert len(stat_eff) == 1 and stat_eff[0]['duration'] == -1
            eid, val = stat_eff[0]['effectId'], stat_eff[0]['diceNum']
            card_display = [e for e in effects_of(clid) if e['effectId'] == eid]
            assert card_display and all(e['forClientOnly'] for e in card_display), ('affichage de la carte', sid)
            assert (eid, val) == (c['effectId'], c['value']) == (research[sid]['effectId'], research[sid]['value'])
            assert research[sid]['realEffect']['spellLevelId'] == real
            accl.append(OrderedDict([
                ('choiceSpellId', sid), ('choiceSpellLevelId', clid), ('name', fr(spell(sid))),
                ('stat', STAT_EFFECTS[eid][0]), ('effectId', eid), ('value', val), ('realSpellLevel', real),
            ]))

        bs = aj['baseStats']
        stats = monster_stats(7980, critPct=10, pushDamage=1000)
        assert (bs['hp'], bs['ap'], bs['mp'], bs['strength'], bs['power'], bs['pushDamage'], bs['critPercent'], bs['level']) == \
            (stats['hp'], stats['ap'], stats['mp'], stats['strength'], stats['power'], stats['pushDamage'], stats['critPct'], stats['level'])
        hp_by_mode = OrderedDict([('flat30000', stats['hp'])])
        eid, val = cond[key]
        if eid == 125:
            hp_by_mode['passiveApplies'] = stats['hp'] + val
        elif eid == 153:
            hp_by_mode['passiveApplies'] = stats['hp'] - val
        else:
            hp_by_mode['passiveApplies'] = stats['hp']
        entry = OrderedDict([
            ('key', key), ('displayName', ARCH_DISPLAY[key]), ('internalName', a['internalName']), ('stateId', state),
            ('passiveSpellId', choice_sid), ('passiveSpellLevelId', choice_lid),
            ('body', OrderedDict([('monsterId', 7980), ('startingSpellLevel', 80897)])),
            ('baseStats', stats), ('turnSeconds', turn_seconds[0]),
            ('hpByMode', hp_by_mode), ('hpMode', {'$config': 'archetypes.hpMode'}),
            ('passiveBonus', OrderedDict([('effectId', eid), ('value', val), ('appliedIf', {'$config': 'archetypes.hpMode'})])),
            ('commonSpell', 80499), ('startingSpell', start['spellLevelId']), ('startingSpellSource', 'server'),
            ('spellSlots', spell_slots), ('upgrades', upgrades), ('uniques', uniques), ('acclamations', accl),
        ])
        if key == 'dompteur':
            entry['passiveBonus']['appliedIf'] = {'$config': 'archetypes.dompteurPower'}
            # Relâchement de Fureur : le buff de montée 30624 est posé par le serveur à l'obtention (aucun sort ne le lance)
            entry['onObtain'] = OrderedDict([('80839', OrderedDict([
                ('castSpellLevel', level_of(30624, 1)), ('target', 'caster'),
                ('timing', {'$config': 'spells.relachementGrowthStart'}),
                ('_prov', prov(['DB sl80852', 'DB sl80976', 'N1D §6'], 'H', 'haute',
                               'logique serveur : moment de pose non documenté (Q17)')),
            ]))])
        entry['_prov'] = prov([f'research/data/archetype_{key}.json', 'DB sp30626', 'DB sl80897', 'D:fight.spellUnlockOrder',
                               'DPLN (stats, départ)'], 'V', 'haute',
                              'sort de départ (emplacement 1) donné par le serveur (R) ; stats DPLN + DB mo7980')
        out[key] = entry
    return out


# ----------------------------------------------------------------------------------------------
# Monstres et boss
# ----------------------------------------------------------------------------------------------
MONSTER_ROLE = {7981: 'wave', 7982: 'wave', 7983: 'wave', 7984: 'boss', 7985: 'summon', 7986: 'summon', 7980: 'playerBody'}
AI_PROFILE = {7981: 'troollibre', 7982: 'artroolleur', 7983: 'nitrooll', 7984: 'mama', 7985: None, 7986: None, 7980: None}
MONSTER_PASSIVES = {
    7981: [(30700, 'exitSpikesVulnerability'), (30754, 'empaleCheck')],
    7982: [(30700, 'exitSpikesVulnerability'), (30754, 'empaleCheck')],
    7983: [(30700, 'exitSpikesVulnerability'), (30754, 'empaleCheck')],
    7984: [],
    7985: [(30421, 'poutchPassive')], 7986: [(30568, 'poutchPassive')],
    7980: [(30700, 'exitSpikesVulnerability')],
}


def build_monsters(spells: dict) -> OrderedDict:
    out = OrderedDict()
    for mid in (7981, 7982, 7983, 7984, 7985, 7986, 7980):
        m = MONSTERS_RAW[str(mid)]
        g = m['grades'][0]
        res_json = MON['monsters'][str(mid)]
        lvls = []
        for sid in m['spells']:
            assert len(spell_levels_of(sid)) == 1, sid
            lvls.append(level_of(sid))
        start = g['startingSpellId']
        assert str(start) in spells, (mid, start)
        stats = monster_stats(mid, **({'critPct': 10, 'pushDamage': 1000} if mid == 7980 else {}))
        rs = res_json['stats']
        assert (rs['hp'], rs['ap'], rs['mp'], rs['strength'], rs['level']) == \
            (stats['hp'], stats['ap'], stats['mp'], stats['strength'], stats['level']), mid
        flags = OrderedDict((k, bool(m[k])) for k in ('canPlay', 'canTackle', 'canBePushed', 'canSwitchPos',
                                                      'canSwitchPosOnTarget', 'canBeCarried', 'useSummonSlot'))
        passives = []
        for sid, role in MONSTER_PASSIVES[mid]:
            passives.append(OrderedDict([('spellId', sid), ('role', role)]))
        entry = OrderedDict([
            ('id', mid), ('name', fr(m)), ('nameEn', (m.get('name') or {}).get('en', '')), ('race', m['race']),
            ('role', MONSTER_ROLE[mid]), ('stats', stats), ('flags', flags),
            ('spells', lvls), ('startingSpellLevel', start), ('passives', passives),
            ('aiProfile', AI_PROFILE[mid]),
            ('_prov', prov([f'DB mo{mid}', 'D:mon'], 'V', 'haute',
                           'érosion 10 % : fiches en jeu (R) ; profil d\'IA : hypothèse (config ai.profiles)')),
        ])
        out[str(mid)] = entry
    # contrôles (étude §5.1)
    exp = {7981: (25000, 11, 6, 4000), 7982: (19000, 11, 5, 3000), 7983: (22000, 12, 5, 3500),
           7984: (150000, 20, 6, 4500), 7985: (5500, 0, 0, 0), 7986: (5500, 0, 0, 0), 7980: (30000, 8, 4, 6000)}
    for mid, (hp, ap, mp, st) in exp.items():
        s = out[str(mid)]['stats']
        assert (s['hp'], s['ap'], s['mp'], s['strength']) == (hp, ap, mp, st), mid
    assert out['7984']['stats']['level'] == 1000 and out['7984']['stats']['dodgeAp'] == 20
    assert out['7981']['spells'] == [80483, 80484, 80485]
    assert out['7984']['spells'] == [80488, 80495, 80497, 80498]
    assert out['7985']['startingSpellLevel'] == 80525 and out['7986']['startingSpellLevel'] == 80768
    for mid in (7981, 7982, 7983):
        assert out[str(mid)]['startingSpellLevel'] == 81002
    return out


def first_effect(lid: int, eid: int, crit: bool = False) -> dict:
    lst = [e for e in effects_of(lid, crit) if e['effectId'] == eid]
    assert lst, (lid, eid)
    return lst[0]


def build_boss(monsters: dict) -> OrderedDict:
    mama = monsters['7984']
    assert mama['startingSpellLevel'] == 80586
    start_subs = [build_effect(e)['subSpell']['spellId'] for e in effects_of(80586)]
    assert start_subs == [30750, 30609, 30724, 30723, 30718], start_subs
    pre = level_of(30750)
    pass_turn = first_effect(pre, 140)
    pre_state = [e for e in effects_of(pre) if e['effectId'] == 950]
    assert pass_turn['duration'] == 6 and pre_state and pre_state[0]['value'] == 5971 and pre_state[0]['duration'] == 6
    arr = spell_levels_of(30609)
    assert arr == [80835, 80836, 80837, 81100]
    delays = {e['delay'] for e in effects_of(arr[0])}
    assert delays == {7}
    target_cell = first_effect(arr[2], 2960)['zoneDescr']['cellIds']
    assert target_cell == [300]
    tp = first_effect(arr[3], 4)
    tp_zone = build_zone(tp['zoneDescr'])
    assert (tp_zone['shape'], tp_zone['radius']) == ('C', 63)
    ras = spell_levels_of(30432)
    assert ras == [80591, 80931, 80934, 80935]
    ras_trig = effects_of(ras[0])[0]
    assert ras_trig['triggers'] == 'TB' and ras_trig['effectTriggerDuration'] == 63
    ras_zone = build_zone(first_effect(ras[3], 1103)['zoneDescr'])
    assert (ras_zone['shape'], ras_zone['radius'], ras_zone['minRadius']) == ('X', 63, 1)
    ras_order = [e['effectId'] for e in effects_of(ras[3])]
    assert ras_order == [950, 6, 1103, 792]
    inv = spell_levels_of(30723)
    assert inv == [81097, 81099]
    inv_trig = [e for e in effects_of(inv[0]) if e['effectId'] == 792][0]
    assert inv_trig['triggers'] == 'EON5902'
    lift = first_effect(inv[1], 952)
    assert lift['value'] == 56 and lift['duration'] == 1
    fav0 = spell_levels_of(30724)
    fav_start = first_effect(fav0[0], 1171)['diceNum']
    fav_lv = spell_levels_of(30659)
    fav_step = first_effect(fav_lv[1], 1172)['diceNum']
    assert (fav_start, fav_step) == (25, 5)
    fav_states = [5973, 5974, 5975, 5976, 5977]
    death = spell_levels_of(30718)
    death_state = [e['value'] for lid in death for e in effects_of(lid) if e['effectId'] == 950]
    assert 6024 in death_state

    return OrderedDict([
        ('monsterId', 7984),
        ('stats', OrderedDict((k, mama['stats'][k]) for k in ('hp', 'ap', 'mp', 'strength', 'level', 'dodgeAp', 'dodgeMp'))),
        ('startingSpellLevel', 80586),
        ('waitCell', 152),
        ('preFight', OrderedDict([('stateId', 5971), ('turnCancelledDuration', 6), ('spellLevel', pre),
                                  ('actsBeforeArrival', {'$config': 'boss.actsBeforeArrival'})])),
        ('arrival', OrderedDict([
            ('delayTurns', 7), ('resultingGlobalTurn', 8), ('targetCell', 300),
            ('fallback', {'$config': 'boss.arrivalFallback'}), ('teleportZone', 'C63'),
            ('spellLevels', arr),
            ('observed', OrderedDict([('cell300', 5), ('cell287When300Occupied', 3)])),
        ])),
        ('rassemblement', OrderedDict([
            ('trigger', 'TB'), ('zone', ras_zone), ('startsAtArrival', True),
            ('steps', [
                OrderedDict([('op', 'setState'), ('stateId', 5918), ('on', 'enemies'), ('duration', 1)]),
                OrderedDict([('op', 'pull'), ('distance', 63), ('on', 'allies(g)')]),
                OrderedDict([('op', 'pushNoDamage'), ('distance', 63), ('on', 'enemies')]),
                OrderedDict([('op', 'objectiveCheck'), ('spellId', 30448), ('ifState', 5915)]),
            ]),
            ('spellLevels', ras),
            ('blockedByUnshakable', {'$config': 'boss.rassemblementBlockedByUnshakable'}),
            ('pullThenPush', {'$config': 'boss.rassemblementPullThenPush'}),
            ('giftCancels', {'$config': 'boss.giftCancelsRassemblement'}),
            ('pushLines', OrderedDict([('300', ANNOT['mamaPushLines']['fromCell300']),
                                       ('287', ANNOT['mamaPushLines']['fromCell287'])])),
        ])),
        ('invulnerability', OrderedDict([
            ('stateId', 56), ('liftedOn', 'EON5902'), ('liftDurationTurns', 1), ('spellLevels', inv),
            ('liftedBeforeEntryDamage', {'$config': 'boss.invulnerabilityLiftedBeforeEntryDamage'}),
            ('backBeforeTurnStartSpikes', {'$config': 'boss.invulnerabilityBackBeforeTurnStartSpikes'}),
        ])),
        ('favour', OrderedDict([
            ('startFinalDamageBonus', fav_start), ('perObjective', -fav_step), ('states', fav_states),
            ('cap', {'$config': 'boss.favourCap'}), ('onlyIfAlive', True),
            ('spellLevels', fav0 + fav_lv),
        ])),
        ('hasExitSpikesPassive', False),
        ('onDeath', OrderedDict([('stateOnPlayers', 6024), ('endsFight', False), ('spellLevels', death)])),
        ('spells', mama['spells']),
        ('levelForPushDamage', {'$config': 'boss.levelForPushDamage'}),
        ('aiProfile', 'mama'),
        ('_prov', prov(['DB mo7984', 'DB sl80586', 'DB sl81182', 'DB sl80835-80837', 'DB sl81100', 'DB sl80591',
                        'DB sl80931', 'DB sl80934', 'DB sl80935', 'DB sl81097', 'DB sl81099', 'DB sl81098',
                        'DB sl80932', 'DB sl80933', 'VOD 11/11 (arrivée T8)'], 'V', 'haute',
                       'arrivée au T8 : décompte client (H) confirmé par la VOD ; repli 287 : Robs')),
    ])


# ----------------------------------------------------------------------------------------------
# Scénario : timeline, vagues, cadeaux, choix, objectifs, victoire
# ----------------------------------------------------------------------------------------------
MONSTER_BY_NAME = {'Troollibre': 7981, 'Artroolleur': 7982, 'Nitrooll': 7983, 'Mama Troollette': 7984}
TYPE_KEY = {'troollibre': 7981, 'artroolleur': 7982, 'nitrooll': 7983}
WAVE_TIMING = {1: 'afterPlacement', 8: 'bossArrival', 10: 'globalTurnStart'}
# Structure observée des vagues 2 et 3 (N40 §4.3, D:annot.monsterSpawnCells.wave2/3.structure)
WAVE_GROUPS = {
    2: [(7982, 1, [187, 188]), (7982, 1, [411, 412]), (7981, 1, [242, 358, 246])],
    3: [(7983, 2, [290, 311, 255, 318, 283, 262]), (7982, 1, [187, 188, 411, 412])],
}


def build_waves() -> list:
    comp_src = FIGHT['waves']['composition']
    spawn = ANNOT['monsterSpawnCells']
    model = ANNOT['monsterSpawnModel']['slotsByType']
    per_fight = ANNOT['perFightWaveSpawns']
    all_slots = {TYPE_KEY[t]: sorted({c for cells in cats.values() for c in cells}) for t, cats in model.items()}
    waves = []
    for n in range(1, 11):
        comp = [OrderedDict([('monsterId', MONSTER_BY_NAME[name]), ('count', cnt)])
                for name, cnt in comp_src[str(n)].items()]
        comp.sort(key=lambda c: c['monsterId'])
        w = OrderedDict([('n', n), ('turn', n), ('timing', WAVE_TIMING.get(n, 'globalTurnStartAfterBonus')),
                         ('composition', comp)])
        if n == 8:
            assert comp == [{'monsterId': 7984, 'count': 1}]
            w['boss'] = True
            w['spawn'] = None
            w['_prov'] = prov(['DPLN II', 'VOD 11/11', 'DB sl80835'], 'V', 'haute', 'la Mama arrive par son sort retardé 30609')
            waves.append(w)
            continue
        src = spawn[f'wave{n}']
        cands = [(c['cell'], c['fights']) for c in src['candidates']]
        types = [c['monsterId'] for c in comp]
        by_type = OrderedDict()
        slots_by_type = OrderedDict()
        assigned = set()
        for mid in types:
            lst = [OrderedDict([('cell', cell), ('weight', wt)]) for cell, wt in cands if cell in all_slots[mid]]
            by_type[str(mid)] = lst
            assigned.update(c['cell'] for c in lst)
            cats = model[[k for k, v in TYPE_KEY.items() if v == mid][0]]
            structural = sorted({c for label, cells in cats.items() if n in [int(x) for x in re.findall(r'V(\d+)', label)]
                                 for c in cells})
            assert structural, (n, mid)
            slots_by_type[str(mid)] = structural
        unassigned = [OrderedDict([('cell', cell), ('weight', wt)]) for cell, wt in cands if cell not in assigned]
        observed = [sorted(v[f'wave{n}']) for _, v in per_fight.items() if f'wave{n}' in v]
        sp = OrderedDict()
        if n == 1:
            sp['fixedCells'] = list(src['fixedCells'])
            assert sp['fixedCells'] == [242, 358]
        if n in WAVE_GROUPS:
            groups = []
            weights = dict(cands)
            for mid, count, cells in WAVE_GROUPS[n]:
                assert all(c in weights for c in cells), (n, cells)
                groups.append(OrderedDict([('monsterId', mid), ('count', count),
                                           ('candidates', [OrderedDict([('cell', c), ('weight', weights[c])]) for c in cells])]))
            for c in comp:
                assert sum(g['count'] for g in groups if g['monsterId'] == c['monsterId']) == c['count'], n
            sp['groups'] = groups
        sp['candidatesByType'] = by_type
        sp['unassigned'] = unassigned
        sp['slotsByType'] = slots_by_type
        sp['observed'] = observed
        sp['observedFights'] = src['observedFights']
        w['spawn'] = sp
        conf = src.get('confidence', 'moyenne')
        w['_prov'] = prov(['DPLN II (composition)', 'VOD 2852548819 (D:annot.monsterSpawnCells)', 'N40 §4.3'],
                          'Robs', conf, 'attribution des cases par type : hypothèse (slotsByType)'
                          + (' ; V10 relevée en 480p' if n == 10 else ''))
        waves.append(w)
    # contrôles (étude §2.3)
    counts = Counter()
    for w in waves:
        for c in w['composition']:
            counts[c['monsterId']] += c['count']
    assert dict(counts) == {7981: 11, 7982: 11, 7983: 9, 7984: 1}, counts
    expected = {1: {7981: 2}, 2: {7981: 1, 7982: 2}, 3: {7983: 2, 7982: 1}, 4: {7983: 1, 7982: 1, 7981: 1}, 5: {7981: 3},
                6: {7982: 3}, 7: {7983: 3}, 8: {7984: 1}, 9: {7983: 1, 7981: 2, 7982: 2}, 10: {7983: 2, 7981: 2, 7982: 2}}
    for w in waves:
        assert {c['monsterId']: c['count'] for c in w['composition']} == expected[w['n']], w['n']
    return waves


OBJECTIVE_DEFS = {
    # spellId : (id, événement(s), condition, compteur, résumé FR)
    30428: ('empale', 'enemyDeath', {'kind': 'victimHasState', 'stateId': 5994}, None,
            'un ennemi meurt en portant l\'état Vulnérable (quel que soit le tueur)'),
    30434: ('soleil', 'globalTurnEnd', {'kind': 'allPlayersEndTurnOnStartCell', 'requiresFullGlobalTurn': True}, None,
            'chaque joueur vivant finit son tour sur sa case de début de tour, pendant un tour global complet'),
    30497: ('sol_glissant', 'enemyDeathByPushDamage', {'kind': 'victimKilledByPushDamage'}, None,
            'un ennemi meurt de dommages de poussée'),
    30463: ('meurtres_serie', 'enemyDeath',
            {'kind': 'killsBySameKillerInOwnTurn', 'count': 2, 'pushKillsCount': {'$config': 'objectives.pushKillsCount'},
             'glyphKillsCreditPlayer': {'$config': 'objectives.glyphKillsCreditPlayer'}},
            {'holder': 'killer', 'reset': 'allyTurnEnd'}, 'le même allié achève 2 ennemis pendant son tour'),
    30542: ('productivite', 'spellCast', {'kind': 'castsInOwnTurn', 'count': 3},
            {'holder': 'challenger', 'reset': 'allyTurnEnd'}, 'un allié lance 3 sorts pendant son tour'),
    30462: ('sauvez_le', 'globalTurnEnd',
            {'kind': 'designatedAllyFullHp', 'designationThresholdsPct': [10, 20, 30, 40, 50, 60, 70, 80, 90],
             'checkThenDesignate': True, 'designationStateId': 5942, 'fullHp': {'$config': 'objectives.v100MeansFull'}},
            None, 'l\'allié désigné (le plus blessé à la fin du tour global précédent) a 100 % de ses PV'),
    30496: ('ebranlable', 'enemyDeath', {'kind': 'victimHasState', 'stateId': 157}, None,
            'un ennemi meurt en état Inébranlable'),
    30520: ('stop_projectiles', 'globalTurnEnd', {'kind': 'noAliveMonster', 'monsterId': 7982}, None,
            'aucun Artroolleur vivant à la fin du tour global'),
    30528: ('toi_par_ici', ['enemyEntersSpikes', 'allyExitsSpikes'],
            {'kind': 'enemyEntersAndAllyExitsSpikesInTurn', 'enemyStateId': 5902, 'allyStateId': 5903},
            {'holder': 'challenger', 'reset': 'allyTurnEnd', 'stateIds': [5958, 5959]},
            'pendant le tour d\'un allié, un ennemi entre dans les pics et un allié en sort'),
    30450: ('prendre_sa_place', 'allyTurnEnd',
            {'kind': 'endTurnOnMarkedCell', 'mark': 'farthestEnemyAtTurnStart', 'excludeStateId': 5971,
             'tieBreak': 'clientOrder'}, None,
            'l\'allié finit son tour sur la case de l\'ennemi le plus éloigné au début de son tour'),
    30500: ('faire_le_mur', 'enemyTakesPushDamage', {'kind': 'distinctEnemiesPushDamagedInTurn', 'count': 3},
            {'holder': 'challenger', 'reset': 'allyTurnEnd'}, '3 ennemis différents subissent des dommages de poussée pendant le tour d\'un allié'),
    30512: ('pas_le_temps', 'enemyDeath', {'kind': 'killEnemyFullHpAtTurnStart'},
            {'holder': 'challenger', 'reset': 'allyTurnEnd'}, 'tuer pendant son tour un ennemi qui avait 100 % de ses PV au début de ce tour'),
    30531: ('distance_insecurite', 'allyTurnEnd',
            {'kind': 'eachMonsterNearAlly', 'monsterId': 7982, 'maxDistance': 3, 'vacuousTruth': True}, None,
            'à la fin du tour d\'un allié, chaque Artroolleur est à 3 cases au plus d\'un allié'),
    30449: ('attirance', 'rassemblement', {'kind': 'allPlayersGrabbedBySameRassemblement', 'stateId': 5918}, None,
            'tous les joueurs vivants sont attrapés par un même Rassemblement'),
    30505: ('trous_troolls', 'enemyEntersSpikes', {'kind': 'distinctEnemiesEnterSpikesInTurn', 'count': 4},
            {'holder': 'challenger', 'reset': 'allyTurnEnd'}, '4 ennemis différents entrent dans les pics pendant le tour d\'un allié'),
    30511: ('pierre_trois_coups', 'enemyDeath', {'kind': 'deathsBetweenCasts', 'count': 3},
            {'holder': 'challenger', 'reset': ['spellCast', 'allyTurnEnd']}, '3 ennemis meurent entre deux lancers de sort de l\'allié actif'),
    30524: ('tout_va_bien', 'globalTurnEnd', {'kind': 'noPlayerAtOrBelowHpPct', 'pct': 50}, None,
            'à la fin du tour global, aucun joueur n\'est à 50 % de ses PV ou moins'),
    30439: ('solitude', 'globalTurnEnd',
            {'kind': 'bossAliveWithoutAllies', 'monsterId': 7984, 'beforeArrival': {'$config': 'objectives.solitudeBeforeArrival'}},
            None, 'à la fin du tour global, la Mama est vivante sans aucun allié'),
    30510: ('quintuple', 'enemyDeath', {'kind': 'killsByPlayersInGlobalTurn', 'count': 5},
            {'holder': 'team', 'reset': 'globalTurnEnd'}, '5 ennemis tués par des joueurs dans un même tour global'),
    30515: ('au_coin', 'allyTurnEnd',
            {'kind': 'allEnemiesInSpikes', 'stateId': 5902, 'excludeStateId': 5971,
             'bossCountsFromTurn': {'$config': 'objectives.mamaCountsFromTurn'}}, None,
            'à la fin du tour d\'un allié, tous les ennemis vivants (hors Mama pré-combat) sont dans les pics'),
    30535: ('meme_pas_mal', 'mamaDamagesAlly', {'kind': 'playerHitByBossWithoutHpLoss', 'monsterId': 7984}, None,
            'un joueur subit un sort de la Mama sans perdre de PV'),
}


def orientation_of(text: str) -> str:
    t = text.lower()
    for k in ('dompteur', 'acrobate', 'magicien'):
        if k in t:
            return k
    return 'general'


def build_objectives() -> OrderedDict:
    src = FIGHT['objectives']
    lst = []
    for o in src['list']:
        sid = o['ids']['general']
        assert sid in OBJECTIVE_DEFS, sid
        oid, on, cond, counter, summary = OBJECTIVE_DEFS[sid]
        entry = OrderedDict([
            ('id', oid), ('name', o['name']), ('tier', o['tier']), ('orientation', orientation_of(o['orientation'])),
            ('imposed', o['tier'] == 1),
            ('spellId', sid), ('spellLevel', level_of(sid)), ('rewardSpellId', o['ids']['reward']),
            ('rewardSpellLevel', level_of(o['ids']['reward'])), ('subSpellIds', list(o['ids']['subSpells'])),
            ('notificationId', o['ids']['notification']), ('doneStateId', o['ids']['objectiveDoneState']),
            ('on', on), ('condition', OrderedDict(cond)),
        ])
        if counter:
            entry['counter'] = OrderedDict(counter)
        entry['summary'] = summary
        entry['_prov'] = prov([f'DB sp{sid}', f'DB sp{o["ids"]["reward"]}', 'D:fight.objectives.list', 'DPLN IV'],
                              'V', o.get('confidence', 'haute'), 'jetons CAP, V#/v#, Atq/Def : hypothèse (Q36)')
        lst.append(entry)
    assert len(lst) == 21
    tiers = Counter(o['tier'] for o in lst)
    assert dict(tiers) == {1: 1, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4}
    for t in range(2, 7):
        assert sorted(o['orientation'] for o in lst if o['tier'] == t) == ['acrobate', 'dompteur', 'general', 'magicien'], t
    # récompense commune : Spell Manager au niveau du palier et Faveur de la Mama
    for o in lst:
        subs = [build_effect(e).get('subSpell') for e in effects_of(o['rewardSpellLevel'])]
        subs = [s for s in subs if s and s.get('spellLevelId')]
        mgr = [s for s in subs if s['spellId'] == 30626]
        assert mgr and mgr[0]['grade'] == o['tier'], (o['id'], mgr)
        assert any(s['spellId'] == 30659 for s in subs), o['id']
    lst.sort(key=lambda o: (o['tier'], ['general', 'acrobate', 'dompteur', 'magicien'].index(o['orientation'])))
    mgr_levels = spell_levels_of(30443)
    votes = OrderedDict()
    for lid in mgr_levels:
        for e in effects_of(lid):
            if e['effectId'] == 3404:
                votes[str(level(lid)['grade'] - 1)] = e['value']
    assert votes == {'1': 11, '2': 12, '3': 13, '4': 14, '5': 15}, votes
    check = level_of(30710)
    manager = OrderedDict([
        ('spellId', 30443), ('spellLevels', mgr_levels), ('first', 'empale'), ('oneActiveAtATime', True),
        ('maxCount', {'$config': 'objectives.maxCount'}),
        ('doneStates', [5906, 5907, 5908, 5909, 5910, 5911]),
        ('voteChoiceIdAfterObjective', votes),
        ('reward', OrderedDict([
            ('spellManagerSpellId', 30626), ('spellManagerLevelByTier', spell_levels_of(30626)),
            ('mamaFavourSpellLevels', spell_levels_of(30659)), ('nextVote', True),
        ])),
        ('endOfGlobalTurnCheck', OrderedDict([('spellId', 30710), ('spellLevel', check),
                                              ('checks', ['soleil', 'stop_projectiles', 'sauvez_le', 'tout_va_bien',
                                                          'quintuple', 'solitude'])])),
        ('_prov', prov(['DB sp30443', 'DB sp30626', 'DB sp30659', 'DB sl81060'], 'V', 'haute',
                       'moment de 30710 (fin du tour global) : hypothèse forte')),
    ])
    return OrderedDict([('manager', manager), ('list', lst)])


def build_scenario() -> OrderedDict:
    turns_2_9 = list(range(2, 10))
    timeline = OrderedDict([
        ('bossPlaysFirst', True),
        ('playerOrder', {'$config': 'timeline.playerOrder'}),
        ('model', {'$config': 'timeline.model'}),
        ('newMonstersInsertion', {'$config': 'timeline.newMonstersInsertion'}),
        ('fightStart', [
            OrderedDict([('op', 'placement'), ('cells', [286, 287, 314, 315]), ('bossCell', 152)]),
            OrderedDict([('op', 'archetypeChoice'), ('choiceId', 16), ('spellLevel', level_of(30608))]),
            OrderedDict([('op', 'startingSpells'), ('players', 80897), ('troolls', 81002), ('boss', 80586)]),
            OrderedDict([('op', 'scenarioCast'), ('spellLevel', 80489), ('what', 'pics (Glyphe de combat)')]),
            OrderedDict([('op', 'scenarioCast'), ('spellLevel', level_of(30443)), ('what', 'Objectif (Empalé imposé)')]),
            OrderedDict([('op', 'spawnWave'), ('wave', 1)]),
        ]),
        ('globalTurnSequence', ['bonusWindow', 'waveSpawn', 'giftSpawn', 'turns', 'objectiveCheck']),
        ('bonusWindowTurns', turns_2_9),
        ('waveSpawnTurns', [2, 3, 4, 5, 6, 7, 9, 10]),
        ('giftTurns', turns_2_9),
        ('bossArrivalTurn', 8),
        ('finishTriggerTurn', {'$config': 'victory.canFinishFromTurn'}),
        ('_prov', prov(['DPLN VI', 'VOD 2852548819', 'correctif 14/01/2025', 'DB sl81060'], 'R', 'moyenne',
                       'place des Troolls dans la timeline : hypothèse (Q1)')),
    ])
    gifts = OrderedDict([
        ('spellId', 30566), ('spellLevel', level_of(30566)), ('markEffectId', 1165),
        ('triggerSpellId', 30657), ('triggerSpellLevels', spell_levels_of(30657)), ('choiceId', 10),
        ('cells', sorted(ANNOT['eventGlyphCells'])),
        ('observedCounts', OrderedDict(sorted(((k, v) for k, v in ANNOT['eventGlyphCounts'].items()), key=lambda kv: int(kv[0])))),
        ('neverObserved', list(ANNOT['eventGlyphNeverObserved'])),
        ('window', OrderedDict([('firstTurn', 2), ('lastTurn', 9)])),
        ('observed', OrderedDict([('spawned', sum(1 for g in ANNOT['giftTable'] if g['newGift'])),
                                  ('turns', len(ANNOT['giftTable']))])),
        ('triggeredBy', 'players'), ('pushedPlayerTriggers', {'$config': 'gifts.pushedPlayerTriggers'}),
        ('persistsUntilTaken', True), ('canStack', True),
        ('cardPool', OrderedDict([('uniques', 'uniques de l\'archétype + Pense Vite, non encore obtenus'),
                                  ('upgrades', 'sorts possédés non encore améliorés')])),
        ('_prov', prov(['DB sp30566', 'DB sp30657', 'VOD (63/88)', 'DPLN IV'], 'V/Robs/R', 'haute',
                       'cases et fréquence : observation VOD ; contenu des cartes : DPLN ; tirage : config gifts.*')),
    ])
    assert gifts['observed'] == {'spawned': 63, 'turns': 88}
    assert gifts['markEffectId'] == first_effect(gifts['spellLevel'], 1165)['effectId']
    choices = OrderedDict([
        ('16', OrderedDict([('scope', 'individual'), ('effectId', 3008), ('castBySpellLevel', level_of(30608)),
                            ('content', 'archetype'), ('when', 'fightStart'),
                            ('options', [OrderedDict([('archetype', k), ('passiveSpellLevel', level_of(sid))])
                                         for k, sid in (('dompteur', 30644), ('acrobate', 30648), ('magicien', 30649))])])),
        ('17', OrderedDict([('scope', 'individual'), ('effectId', 3008), ('castBySpellLevel', level_of(30658, 2)),
                            ('content', 'acclamation'), ('when', 'globalTurnStart'), ('turns', turns_2_9),
                            ('offerCount', {'$config': 'bonuses.offerCount'})])),
        ('10', OrderedDict([('scope', 'individual'), ('effectId', 3008), ('castBySpellLevel', level_of(30657, 3)),
                            ('content', 'giftCards'), ('when', 'giftTriggered'), ('cardCount', {'$config': 'gifts.cardCount'})])),
    ])
    mgr_levels = spell_levels_of(30443)
    for tier in range(2, 7):
        lid = mgr_levels[tier - 1]
        vid = [e['value'] for e in effects_of(lid) if e['effectId'] == 3404][0]
        choices[str(vid)] = OrderedDict([('scope', 'global'), ('effectId', 3404), ('castBySpellLevel', lid),
                                         ('content', 'objectiveVote'), ('tier', tier), ('when', 'objectiveDone'),
                                         ('offerCount', {'$config': 'objectives.offerCount'}), ('tieBreak', 'random')])
    for cid, lid in (('16', level_of(30608)), ('17', level_of(30658, 2)), ('10', level_of(30657, 3))):
        assert any(e['effectId'] == 3008 and e['value'] == int(cid) for e in effects_of(lid)), cid
    bonuses = OrderedDict([
        ('choiceId', 17), ('spellLevels', spell_levels_of(30658)),
        ('firstTurn', {'$config': 'bonuses.firstTurn'}), ('lastTurn', {'$config': 'bonuses.lastTurn'}),
        ('offerCount', {'$config': 'bonuses.offerCount'}), ('permanent', True), ('stackable', True),
        ('_prov', prov(['DB sp30658', 'DB sp30589-30591', 'VOD'], 'V', 'haute', 'moments T2–T9 : Robs ; tirage : H (Q13)')),
    ])
    finish = level_of(30577)
    assert first_effect(finish, 950)['value'] == 5965
    victory = OrderedDict([
        ('allEnemiesDead', True), ('requiresState', 5965), ('stateSetBySpell', 30577), ('stateSetBySpellLevel', finish),
        ('canFinishFromTurn', {'$config': 'victory.canFinishFromTurn'}), ('killingBossEndsFight', False),
        ('turnLimit', {'$config': 'victory.turnLimit'}),
        ('_prov', prov(['DB sl80790', 'GD 53:00', 'vidéos'], 'V/R', 'haute', 'moment de 30577 : hypothèse (Q19)')),
    ])
    defeat = OrderedDict([('allPlayersDead', True), ('_prov', prov(['règle DOFUS', 'Fielon', 'Huz'], 'R', 'haute'))])
    entities = OrderedDict([
        ('scenario', OrderedDict([('camp', 'Sce'), ('visible', False), ('plays', False),
                                  ('casts', [30390, 30443, 30566, 30710, 30577]),
                                  ('_prov', prov(['D:fight.entities.Sce'], 'H', 'moyenne'))])),
    ])
    return OrderedDict([
        ('timeline', timeline), ('entities', entities), ('waves', build_waves()), ('gifts', gifts),
        ('bonuses', bonuses), ('choices', choices), ('objectives', build_objectives()),
        ('victory', victory), ('defeat', defeat),
    ])


# ----------------------------------------------------------------------------------------------
# Règles (formules non contestées ; spec §4, étude §9)
# ----------------------------------------------------------------------------------------------

def build_rules() -> OrderedDict:
    return OrderedDict([
        ('distance', 'manhattan'),
        ('directions', OrderedDict([
            ('names', ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']),
            ('axes', [1, 3, 5, 7]), ('diagonals', [0, 2, 4, 6]),
            ('vectors', OrderedDict((str(i), list(v)) for i, v in enumerate(((1, 1), (1, 0), (1, -1), (0, -1),
                                                                                (-1, -1), (-1, 0), (-1, 1), (0, 1))))),
        ])),
        ('los', OrderedDict([('algorithm', 'getCellsIdBetween'), ('entityBlocksIntermediateOnly', True),
                             ('mapLosFlagBlocksTarget', True), ('glyphsBlock', False)])),
        ('castCells', OrderedDict([('lineAndDiagonal', 'star'), ('lineOnly', 'axisCross'),
                                   ('diagonalOnly', 'diagonalCross'), ('else', 'manhattanRing')])),
        ('cooldown', OrderedDict([('rule', 'currentTurn >= lastCastTurn + interval')])),
        ('rollBounds', 'min = diceNum (ou value si diceNum = diceSide = 0) ; max = diceSide si != 0, sinon min'),
        ('zone', OrderedDict([
            ('defaultDegression', Z.DEFAULT_DEGRESSION), ('defaultMaxTicks', Z.DEFAULT_MAX_DEGRESSION_TICKS),
            ('noDegressionIfRadiusAbove', Z.MAX_RADIUS_DEGRESSION), ('pseudoInfiniteRadius', Z.GLOBAL_RADIUS),
            ('minSizeShapes', ''.join(sorted(Z.MIN_SIZE_SHAPES))),
            ('distanceByShape', OrderedDict([('GRW', 'chebyshev'), ('#+-/U', 'manhattan>>1'), ('FV', 'projectionOnCastAxis'),
                                             (';AIa', 'zero'), ('default', 'manhattan')])),
            ('degressionUsesPositionBeforeSpell', True), ('appliesToHeals', True), ('appliesToShields', False),
            ('appliesToPushDamage', False), ('targetSelection', 'isCellInZone'), ('cellListing', 'getCells'),
            ('normalisation', 'valeurs de SpellZone.from_zone_descr (tools/mechanics/zones.py) : P → rayon 0 ; I → min = rayon, rayon = 63 ; O → min = rayon ; R → rayon ≥ 1 et min ≥ 1'),
        ])),
        ('targeting', OrderedDict([
            ('targetsFrozenAtCast', True), ('positionsBeforeSpell', True),
            ('order', OrderedDict([('push', 'farthestFromTargetCellFirst'), ('other', 'nearestFirst'),
                                   ('tieBreak', ['direction', 'cellId'])])),
            ('casterIncludedOnlyVia', ['a', 'c', 'C']), ('additionalTargets', ['C', 'O', 'K']),
            ('maskConditionPattern', MASK_CONDITION.pattern),
            ('meleeTestedAtEffectTime', True),
        ])),
        ('damage', OrderedDict([
            ('pipeline', ['roll', 'spellBaseBonus(293)', '×(100+charac+power)/100', '+fixedDamage(+critDamage)',
                          '×(100-zoneMalus)/100', '-fixedRes', '×(1-res%/100)', 'invulnerable→0',
                          '×spell/weapon & melee/range multipliers', '×finalDamage/100', '×Π(1163 matching trigger)',
                          'shield', 'erosion', 'lifeSteal']),
            ('truncateEachMultiplication', True),
            ('resistCap', OrderedDict([('player', 50), ('monster', 100)])),
            ('elementCharacteristic', OrderedDict([('neutral', 'strength'), ('earth', 'strength'), ('fire', 'intelligence'),
                                                   ('water', 'chance'), ('air', 'agility')])),
            ('powerAppliesToHeals', False),
            ('finalDamage', '100 + Σ1171 − Σ1172'),
            ('nonBoostableActions', [80, 82, 89, 1048, 1092, 1118, 1123, 1223, 1109, 2020]),
            ('erosion', OrderedDict([('base', BASE_EROSION), ('cap', 50), ('formula', 'floor(min(hpLost*erosion/100, hp-1))')])),
            ('lifeSteal', OrderedDict([('ratio', 0.5), ('capToMissingHp', True)])),
            ('deathAtHpLE', 0),
        ])),
        ('heal', OrderedDict([('pipeline', ['roll', '×(100+charac)/100', '+heals', '×finalHeal/100', '×(100-zoneMalus)/100',
                                            'capToMissingHp']),
                              ('finalHeal', '100 + Σ2971')])),
        ('shield', OrderedDict([('boosted', False), ('degression', False), ('absorbsBeforeHp', True),
                                ('absorbsGlyphDamage', True)])),
        ('crit', OrderedDict([('rate', '0 if spell.critRate==0 else clamp(spell.critRate + caster.critPct, 0, 100)'),
                              ('cap', 100), ('oneRollPerCast', True), ('criticalEffectsReplaceEffects', True),
                              ('subSpellsInherit', True), ('critDamageOnlyOnCriticalEffects', True)])),
        ('multiplier1163', OrderedDict([('formula', 'm = int(m * pct / 100)'), ('stack', 'multiplicative'),
                                        ('triggerD', 'all damage except push damage'), ('triggerDBA', 'damage from an ally')])),
        ('push', OrderedDict([
            ('origin', 'caster if target on targeted cell else targeted cell'),
            ('direction', 'dir4(origin,target); exact diagonal if |dx|==|dy|'),
            ('diagonalSteps', 'ceil(n/2)'), ('diagonalNeedsBothSideCellsFree', True),
            ('stopsOn', ['nonWalkable', 'fighter', 'trap', 'wall']), ('glyphsStopPush', False),
            ('collision', OrderedDict([
                ('formula', 'max(0,int(rest*k*(floor(level/2)+32+pushDamage-pushResist)/(4*2**i)))  # k=2 if diagonal else 1'),
                ('levelDivisor', 2), ('base', 32), ('diagonalFactor', 2), ('divisorBase', 4),
                ('chain', 'i = 0 pour la cible, puis chaque entité percutée (au plus rest entités), /2 par maillon'),
            ])),
            ('collisionIgnores', ['resistances', 'finalDamage', '1163 with trigger D']),
            ('noCollisionActions', [6, 1021, 1022, 1103, 1042]),
            ('blockedBy', OrderedDict([('unshakable(stateEffect0)', ['push', 'pull']),
                                       ('rooted(stateEffect3)', ['push', 'pull', 'teleport', 'swap'])])),
        ])),
        ('swap', OrderedDict([('blockedBy', ['rooted', 'noSwapStateEffect18', 'carried']), ('unshakableDoesNotBlock', True)])),
        ('teleport', OrderedDict([('pointZone', 'targetedCellIfFree'), ('nonPointZone', 'firstFreeCellOfZone(getCells order)')])),
        ('durations', OrderedDict([('decrementAt', 'startOfCasterTurn'), ('permanent', '-1 or >=63'), ('permanentThreshold', 63),
                                   ('delayCountsCasterTurns', True),
                                   ('castsBeforeFirstTurnNotDecrementedAtFirstTurnStart', True)])),
        ('turnStart', ['decrementBuffsCastByFighter', 'resetTriggerCounters', 'TB triggers', 'startTurnGlyphs(401)',
                       'restoreApMp']),
        ('turnEnd', ['TE triggers', 'endTurnGlyphs(402)', 'resetCastCounters']),
        ('aura1091', OrderedDict([('applyOnEnter', ['walk', 'push', 'pull', 'teleport', 'swap']), ('removeOnExit', True),
                                  ('emitsEONEOFF', True), ('appliesOnArrivalCellOnly', True)])),
        ('subSpellExecutors', OrderedDict(
            (str(eid), OrderedDict([('caster', c), ('cell', cell)] + ([('maxExecutions', 'value')] if lim else [])))
            for eid, (c, cell, lim) in sorted(SUBSPELL_EXECUTORS.items()))),
        ('subSpellCastConditions', {'$config': 'engine.subSpellsIgnoreCastConditions'}),
        ('triggeredBuffCaster', 'buff setter; target = carrier; no re-trigger by own effects'),
        ('tackle', OrderedDict([('enabled', False), ('why', 'état 5970 des joueurs (DB sl80897)')])),
        ('_prov', prov(['CLI273 (tools/mechanics, 62 contrôles)', 'N70 §1-§7', 'ETUDE §9'], 'V', 'haute',
                       'ordre serveur du début de tour : hypothèse (moyenne)')),
    ])


# ----------------------------------------------------------------------------------------------
# Tests de référence (spec §13), recalculés quand c'est possible
# ----------------------------------------------------------------------------------------------

def dmg(roll: int, mult_pct: int) -> int:
    return int(roll * mult_pct / 100)


def roll_range(lid: int, eid: int, crit: bool = False):
    e = first_effect(lid, eid, crit)
    return DMG.roll_bounds(e['diceNum'], e['diceSide'], e['value'])


def build_tests(maps: dict) -> list:
    x61, x31 = 6100, 3100   # (100 + Force) : archétypes Force 6000, Artroolleur 3000
    lo, hi = roll_range(80499, 100)
    clo, chi = roll_range(80499, 100, True)
    t1 = OrderedDict([('spellLevelId', 80499), ('hit', [dmg(lo, x61), dmg(hi, x61)]),
                      ('crit', [dmg(clo, x61), dmg(chi, x61)]), ('vulnerableFactor', 2)])
    assert t1['hit'] == [976, 1220] and t1['crit'] == [1281, 1525], t1
    lo, hi = roll_range(80500, 100)
    by_dist = [[dmg(dmg(lo, 6100), 100 - 10 * d), dmg(dmg(hi, 6100), 100 - 10 * d)] for d in range(3)]
    assert by_dist == [[4148, 4514], [3733, 4062], [3318, 3611]], by_dist
    clo, chi = roll_range(80507, 100, True)
    assert clo == 72
    videur_crit_one_cell = dmg(dmg(72, 6100), 90)
    assert videur_crit_one_cell == 3952
    glo, ghi = roll_range(80501, 100, True)
    assert glo <= 99 <= ghi and dmg(99, 6100) * 2 == 12078
    rlo, rhi = roll_range(80839, 100)
    rclo, rchi = roll_range(80839, 100, True)
    t12 = OrderedDict([('spellLevelId', 80839), ('baseBonus', 100), ('target', 'Mama Vulnérable (×2)'),
                       ('hit', [dmg(rlo + 100, 6100) * 2, dmg(rhi + 100, 6100) * 2]),
                       ('crit', [dmg(rclo + 100, 6100) * 2, dmg(rchi + 100, 6100) * 2])])
    assert t12['hit'] == [35014, 36844] and t12['crit'] == [41114, 42944], t12
    alo, ahi = roll_range(80486, 100)
    aclo, achi = roll_range(80486, 100, True)
    t16 = OrderedDict([('spellLevelId', 80486), ('hit', [dmg(alo, x31), dmg(ahi, x31)]), ('crit', [dmg(aclo, x31), dmg(achi, x31)])])
    assert t16['hit'] == [1736, 2015] and t16['crit'] == [2077, 2387], t16
    hlo, hhi = roll_range(80514, 3001)
    hclo, hchi = roll_range(80514, 3001, True)
    heal90 = [dmg(dmg(hlo, 6100), 90), dmg(dmg(hhi, 6100), 90)]
    mean_n = (dmg(hlo, 6100) + dmg(hhi, 6100)) / 2 * 0.9
    mean_c = (dmg(hclo, 6100) + dmg(hchi, 6100)) / 2 * 0.9
    expected_heal = round(0.6 * mean_n + 0.4 * mean_c)
    assert abs(expected_heal - 2734) <= 2, expected_heal
    collision = int(1 * (200 // 2 + 32 + 1000) / 4)
    chained = int(1 * (200 // 2 + 32 + 1000) / 8)
    assert (collision, chained) == (283, 141)
    turn_start_monster = first_effect(81026, 100)['diceNum'] * 2
    entry = first_effect(80492, 100)['diceNum']
    assert (entry, turn_start_monster) == (2000, 2000)
    eff_hp = OrderedDict((str(m), (hp - entry) // 2) for m, hp in ((7981, 25000), (7982, 19000), (7983, 22000), (7984, 150000)))
    assert list(eff_hp.values()) == [11500, 8500, 10000, 74000]
    assert maps['cells'][300]['neighbours'] == [286, 287, 314, 315]
    worked = {r['acrobateCell']: r for r in ARCH_JSON['acrobate']['workedExamples']['T1_wave1_videur']['results']}
    t6_moves = {c['targetCell']: [[x['from'], x['to']] for x in c['results']] for c in worked[314]['videurCastsPuttingATrollInPics']}
    assert t6_moves == {372: [[358, 402]], 256: [[242, 199]]}, t6_moves
    assert all(maps['cells'][c]['spikes'] for c in (199, 402))
    for c in (416, 408, 184, 192):
        assert maps['cells'][c]['spikes'] and maps['cells'][c]['edgeDepth'] == 1, c

    def t(tid, title, expected, source, status='V'):
        return OrderedDict([('id', tid), ('title', title), ('expected', expected), ('source', source), ('status', status)])

    return [
        t('T1', 'Frappe Repoussoir (archétype) sur un Trooll ; ×2 sur Vulnérable', t1, 'CLI273 + DPLN « 1 200 » ; N70 §4.7'),
        t('T2', 'Impact au centre / à 1 case / à 2 cases', OrderedDict([('spellLevelId', 80500), ('byDistance', by_dist)]), 'N70 §4.6'),
        t('T3', 'Videur critique, cible à 1 case du centre de T, poussée dans les pics',
          OrderedDict([('spellLevelId', 80507), ('critRoll', 72), ('entryDamage', 2000), ('hitBeforeVulnerable', videur_crit_one_cell),
                       ('hitOnVulnerable', videur_crit_one_cell * 2), ('vodTotal', 2000 + videur_crit_one_cell * 2)]),
          'N1D §12 (VOD s289_07)', 'Robs'),
        t('T4', 'Grondement critique, jet 99, sur un Trooll Vulnérable',
          OrderedDict([('spellLevelId', 80501), ('roll', 99), ('critical', True), ('damage', 12078)]), 'N1D §12 (VOD s295_05)', 'Robs'),
        t('T5', 'Carte : voisins de 300', OrderedDict([('cell', 300), ('neighbours', [286, 287, 314, 315])]), 'tools/map/mapgeom.py'),
        t('T6', 'T1 : Acrobate sur 314, Videur sur 256 puis 372',
          OrderedDict([('casterCell', 314), ('spellLevelId', 80507), ('troolls', [242, 358]), ('allies', [286, 287, 315]),
                       ('casts', [OrderedDict([('targetCell', 256), ('moves', [[242, 199]])]),
                                  OrderedDict([('targetCell', 372), ('moves', [[358, 402]])])]),
                       ('allEndInSpikes', True)]),
          'N1A §7.2 (D:acro.workedExamples)'),
        t('T7', 'Poussée d\'un Trooll depuis 300 jusqu\'au bord, sur un axe',
          OrderedDict([('from', 300), ('stopsAtEdgeDepth', 1), ('inSpikes', True), ('examples', [416, 408, 184, 192])]), 'N70 §5.2'),
        t('T8', 'Collision d\'un archétype, 1 case restante',
          OrderedDict([('level', 200), ('pushDamage', 1000), ('rest', 1), ('damage', collision), ('chainedEntityDamage', chained)]),
          'N70 §5.3'),
        t('T9', 'Monstre commençant son tour dans les pics', OrderedDict([('rawDamage', 1000), ('multiplier', 2), ('damage', 2000)]),
          'DB sl81026 + vidéos'),
        t('T10', 'Arrivée de la Mama',
          OrderedDict([('turn', 8), ('cell', 300), ('fallbackCell', 287), ('alignedPlayersPushedToEdge', True),
                       ('pushCollisionDamage', 0)]), 'DB sl80835-80837 + VOD', 'V/Robs'),
        t('T11', 'PV effectifs dans les pics ((PV − 2 000) / 2)', eff_hp, 'N20 §3.1, §4.3'),
        t('T12', 'Relâchement de Fureur +100 sur la Mama Vulnérable', t12, 'N1D §6'),
        t('T13', 'Pulsation d\'Énergie centrée sur 300 : soins sur les 4 cases de départ (à 1 case, 90 %)',
          OrderedDict([('spellLevelId', 80514), ('targetCell', 300), ('healedCells', [286, 287, 314, 315]),
                       ('healNormalAt90', heal90), ('expectedPerAlly', expected_heal)]), 'N1M §3.2'),
        t('T14', 'Faveur de la foule : DF de la Mama', OrderedDict([('start', 125), ('perObjective', -5), ('after5', 100),
                                                                     ('after6', 95)]), 'DB sl81098, sl80933'),
        t('T15', 'Apparition de la vague 1', OrderedDict([('cells', [242, 358]), ('monsterId', 7981)]), 'VOD 11/11', 'Robs'),
        t('T16', 'Tir d\'Artroollerie sur un joueur hors des pics', t16, 'N20 §3.3'),
    ]


# ----------------------------------------------------------------------------------------------
# Méta
# ----------------------------------------------------------------------------------------------

def build_meta(counts: dict) -> OrderedDict:
    return OrderedDict([
        ('title', 'Données consolidées du simulateur du Gladiatrool'),
        ('gameVersion', '3.6.12.16'), ('betaChecked', '3.7.2.2'),
        ('dofusdbExtractedAt', SUMMARY['generated_at']), ('monstersUpdatedAt', '2026-06-23'),
        ('generatedBy', 'tools/simdata/build_sim_data.py'),
        ('spec', 'research/SPEC_DONNEES_SIMULATEUR.md'),
        ('sources', OrderedDict([
            ('dofusdb', 'https://api.dofusdb.fr (research/raw/dofusdb, extraction du ' + SUMMARY['generated_at'][:10] + ')'),
            ('mapBundle', 'mapdata_assets_world_534.bundle sha1 ' + MAP['source']['bundleSha1']),
            ('client273', 'DofusInvoker.swf sha1 92a0b228bd44bb5616a47601684171af77cffc21 (tools/mechanics)'),
            ('vod', 'https://www.twitch.tv/videos/2852548819'),
            ('dpln', 'https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026)'),
        ])),
        ('provenance', OrderedDict([
            ('spells', 'DB sl<clé> : https://api.dofusdb.fr/spell-levels/<clé> (research/raw/dofusdb/spell_levels.json)'),
            ('states', 'DB st<clé> : https://api.dofusdb.fr/spell-states/<clé>'),
            ('effects', 'research/data/effects_semantics.json + research/data/action_ids_dofus3.json'),
        ])),
        ('statusLegend', OrderedDict([('V', 'FAIT vérifié (données du client)'), ('R', 'FAIT rapporté (guide, vidéo, forum)'),
                                      ('Robs', 'observation mesurée (VOD)'), ('H', 'HYPOTHÈSE (paramètre de config)')])),
        ('conventions', OrderedDict([
            ('effectParams', 'min = diceNum, max = diceSide, value = value (paramètres bruts du client) ; voir rules.rollBounds'),
            ('exec', 'seuls les effets exec = true (non forClientOnly) sont appliqués'),
            ('durations', 'en tours du lanceur ; -1 ou >= 63 = permanent'),
            ('configRef', '{"$config": "chemin"} : la valeur dépend d\'une hypothèse, lire sim/config/default.config.json'),
        ])),
        ('counts', counts),
    ])


# ----------------------------------------------------------------------------------------------
# Configuration par défaut (spec §12 + paramètres du moteur)
# ----------------------------------------------------------------------------------------------

def doc(type_, why, question=None, values=None, alternatives=None, source=None, status='H', **extra) -> OrderedDict:
    d = OrderedDict([('type', type_)])
    if values is not None:
        d['values'] = values
    if alternatives is not None:
        d['alternatives'] = alternatives
    if question:
        d['question'] = question
    d['status'] = status
    if source:
        d['source'] = source
    d['why'] = why
    d.update(extra)
    return d


def build_config(monsters: dict) -> OrderedDict:
    ms = {k: v['spells'] for k, v in monsters.items()}
    tl_trampo, tl_aspi, tl_patro = ms['7981']
    art_tir, art_mortr = ms['7982']
    nit_double, nit_magie, nit_tambour, nit_coup = ms['7983']
    mama_tp, mama_upper, mama_mitr, mama_cata = ms['7984']
    assert (tl_trampo, tl_aspi, tl_patro) == (80483, 80484, 80485)
    assert (nit_double, nit_magie, nit_tambour, nit_coup) == (80490, 80494, 80496, 80493), ms['7983']
    assert (mama_tp, mama_upper, mama_mitr, mama_cata) == (80488, 80495, 80497, 80498)

    def rule(lid, when, **kw):
        return OrderedDict([('spellLevelId', lid), ('when', when)] + list(kw.items()))

    profiles = OrderedDict([
        ('troollibre', OrderedDict([('moveBeforeCast', True), ('preferredDistance', [1, 2]), ('spells', [
            rule(tl_patro, 'enemyReachable'), rule(tl_aspi, 'targetAtDistance2'), rule(tl_trampo, 'enemyInRing1to2'),
            rule(tl_aspi, 'anyTarget')])])),
        ('artroolleur', OrderedDict([('moveBeforeCast', False), ('preferredDistance', [3, 8]), ('spells', [
            rule(art_mortr, 'maxTargets'), rule(art_tir, 'pushTowardSpikes', maxTargets=2)])])),
        ('nitrooll', OrderedDict([('moveBeforeCast', False), ('preferredDistance', [1, 6]), ('healThresholdPct', 80), ('spells', [
            rule(nit_magie, 'mostInjuredAlly'), rule(nit_tambour, 'threatenedAlly'), rule(nit_double, 'pushTowardSpikes'),
            rule(nit_coup, 'pushTowardSpikes')])])),
        ('mama', OrderedDict([('moveBeforeCast', False), ('preferredDistance', [1, 8]), ('spells', [
            rule(mama_cata, 'playersInZoneAtLeast', count=2), rule(mama_mitr, 'maxTargets'),
            rule(mama_upper, 'anyTarget', times=3), rule(mama_tp, 'nearLowestHpPlayer', times=2)])])),
    ])

    cfg = OrderedDict([
        ('timeline', OrderedDict([
            ('model', 'alternate_spawn_order'), ('newMonstersInsertion', 'append'),
            ('playerOrder', ['acrobate', 'dompteur', 'dompteur', 'magicien']),
            ('deadPlayersKeepSlot', True),
        ])),
        ('ai', OrderedDict([
            ('focus', 'maxDamage'), ('skipIfInSpikes', True), ('skipIfNoTargetReachable', True), ('engageRadius', None),
            ('avoidSpikes', True), ('moveBeforeCast', True), ('monstersCanTargetAllies', False),
            ('mamaFocusSingleTarget', True), ('profiles', profiles),
        ])),
        ('spikes', OrderedDict([
            ('entryDamage', first_effect(80492, 100)['diceNum']), ('monsterTurnStartDamageRaw', first_effect(81026, 100)['diceNum']),
            ('playerTurnStartDamage', 1000), ('playersDoubledInside', False), ('stackExitAndInside', True),
            ('exitVulnerabilityTurns', 1), ('triggerWhenWalkingThrough', True), ('walkThroughInterruptsMovement', False),
            ('retriggerOnMoveInside', False), ('auraAppliesMidSpell', True),
        ])),
        ('spawn', OrderedDict([('mode', 'weighted_observed'), ('seed', None), ('excludeOccupied', True),
                               ('allowUnassigned', False)])),
        ('boss', OrderedDict([
            ('arrivalCell', 300), ('arrivalFallback', [287, 'axisTowardWaitCell', 'nearestFree']), ('actsBeforeArrival', False),
            ('rassemblementBlockedByUnshakable', True), ('rassemblementPullThenPush', True), ('giftCancelsRassemblement', False),
            ('invulnerabilityLiftedBeforeEntryDamage', True), ('invulnerabilityBackBeforeTurnStartSpikes', True),
            ('catastroollBonusScope', 'restOfTurn'), ('levelForPushDamage', 1000), ('favourCap', None),
        ])),
        ('objectives', OrderedDict([
            ('maxCount', 6), ('offerCount', 2), ('offerDraw', 'uniform'), ('tier6Offered', True), ('votePolicy', 'planner'),
            ('pushKillsCount', True), ('glyphKillsCreditPlayer', False), ('solitudeBeforeArrival', True),
            ('mamaCountsFromTurn', 7), ('v100MeansFull', True),
        ])),
        ('bonuses', OrderedDict([
            ('offerCount', 3), ('draw', 'uniform_distinct'), ('firstTurn', 2), ('lastTurn', 9), ('doubleApplication', False),
            ('policy', 'planner'),
        ])),
        ('gifts', OrderedDict([
            ('spawnProbability', 0.72), ('cells', sorted(ANNOT['eventGlyphCells'])), ('firstTurn', 2), ('lastTurn', 9),
            ('cellDraw', 'uniform_free'), ('cardCount', 2),
            ('cardMix', OrderedDict([('twoUniques', 1), ('twoUpgrades', 1), ('oneEach', 1)])),
            ('monstersTrigger', False), ('pushedPlayerTriggers', True), ('upgradedSpellGreyedUntilNextTurn', False),
        ])),
        ('spells', OrderedDict([
            ('newSpellUsableSameTurn', True),
            ('penseVite', OrderedDict([('maxCasts', 3), ('turnSeconds', first_effect(80843, 3407)['value'])])),
            ('relachementGrowthStart', 'nextTurnStartAfterObtain'), ('relachementMaxStacks', 4),
            ('voltigeUpgradedMaxPerTurn', level(80775)['maxCastPerTurn']), ('ggUpgradedKeepsRecastBonus', False),
            ('jaillissementUpgradeBroken', False),
            ('maledictionCollateraleChains', True), ('maledictionCollateraleHitsCarrier', False),
            ('maledictionRegenerantePercent', 100), ('maledictionRegeneranteZone', 'C2'),
            ('maledictionMouvanteOnGlyphDamage', False),
            ('pulsationChaotiqueBounceRange', None), ('chamboulementBounceTarget', 'nearest'),
            ('poutchLifetimeTurns', None), ('protectionProlongeeSelfHeals', 1), ('bienfaiteurOverflowLost', True),
            ('ultimeEspoirRespawnCell', 'deathCellOrNearest'), ('delivranceWorks', True),
            ('coupDeSangCreatesErosion', False), ('impactCritHitsPoutch', False),
        ])),
        ('archetypes', OrderedDict([('hpMode', 'flat30000'), ('dompteurPower', 0)])),
        ('rng', OrderedDict([('seed', 1), ('rollMode', 'random'), ('critMode', 'random'), ('rollDistribution', 'uniform'),
                             ('rollPerTarget', False)])),
        ('engine', OrderedDict([('subSpellsIgnoreCastConditions', True), ('pushLevelForArchetypes', 200), ('eventLog', True),
                                ('maxSubSpellDepth', 16), ('removeBuffsOfDeadCaster', True),
                                ('unshakableBlocksCasterAdvance', True), ('firstTurnDecrementSkip', 'preFight'),
                                ('turnStartTriggersBeforeDecrement', False), ('dispelGlyphsTriggeringMarkOnly', True)])),
        ('victory', OrderedDict([('canFinishFromTurn', 10), ('turnLimit', None)])),
        ('map', OrderedDict([('dynamicObstacles', False)])),
    ])
    assert cfg['spikes']['entryDamage'] == 2000 and cfg['spikes']['monsterTurnStartDamageRaw'] == 1000
    assert cfg['spells']['penseVite']['turnSeconds'] == 10 and cfg['spells']['voltigeUpgradedMaxPerTurn'] == 2

    D = OrderedDict()
    D['timeline.model'] = doc('enum', 'règle DOFUS d\'alternance des équipes, l\'équipe monstre en tête (Mama) ; Troolls par ordre d\'apparition',
                              'Q1', ['alternate_spawn_order', 'alternate_initiative', 'monsters_after_mama', 'explicit'],
                              ['alternate_initiative (Troolls triés par Force)', 'monsters_after_mama', 'explicit (liste fournie)'],
                              'règle DOFUS + vidéos (« tuer le Trooll qui joue juste après soi »)')
    D['timeline.newMonstersInsertion'] = doc('enum', 'les nouveaux venus sont ajoutés à la fin de la sous-liste des monstres', 'Q1',
                                             ['append', 'after_mama', 'by_initiative'], ['after_mama', 'by_initiative'])
    D['timeline.playerOrder'] = doc('enum[]', 'ordre d\'entrée des joueurs (J1..J4) et composition de l\'équipe ; A-D-D-M par défaut',
                                    'Q40', ARCHETYPES, 'toute permutation / composition de 1 à 4 archétypes',
                                    'correctif officiel du 14/01/2025 (ordre d\'entrée) ; vidéos', 'R', minLength=1, maxLength=4)
    D['timeline.deadPlayersKeepSlot'] = doc('boolean', 'un joueur mort garde sa place dans l\'alternance joueurs / monstres '
                                            '(il est sauté) ; un monstre mort libère la sienne (Q1)', 'Q1', alternatives=[False])
    D['ai.focus'] = doc('enum', 'cible atteignable ce tour qui maximise les dégâts', 'Q2', ['maxDamage', 'lowestHp', 'nearest'],
                        ['lowestHp', 'nearest'])
    D['ai.skipIfInSpikes'] = doc('boolean', 'les Troolls passent leur tour dans les pics sans sortie utile (vidéos)', 'Q2',
                                 alternatives=[False], source='cardxc 12:30, 14:30 ; sspritenL ; Zephiron 11:00', status='R')
    D['ai.skipIfNoTargetReachable'] = doc('boolean', 'les Troolls passent leur tour quand les joueurs sont loin (vidéos)', 'Q2',
                                          alternatives=[False], status='R')
    D['ai.engageRadius'] = doc('integer|null', 'null = PM + PO maximale du meilleur sort', 'Q2', alternatives=['entier (cases)'])
    D['ai.avoidSpikes'] = doc('boolean', 'un monstre n\'entre jamais volontairement dans les pics', 'Q2', alternatives=[False])
    D['ai.moveBeforeCast'] = doc('boolean', 'la mêlée se déplace avant de lancer (profil par défaut)', 'Q2', alternatives=[False])
    D['ai.monstersCanTargetAllies'] = doc('boolean', 'les masques a,A permettraient de viser un autre Trooll ; non observé', 'Q37',
                                          alternatives=[True])
    D['ai.mamaFocusSingleTarget'] = doc('boolean', 'la Mama concentre ses sorts sur un joueur (−20 000 / −21 000 observés)', 'Q2',
                                        alternatives=[False], source='Huz 18:30 ; Matspyder4', status='R')
    D['ai.profiles'] = doc('object', 'ordres de priorité des sorts par profil (N20 §9, étude §5.8) ; `when` = règle de déclenchement ; '
                           'preferredDistance et healThresholdPct (soin si l\'allié le plus blessé est sous ce seuil) : valeurs indicatives',
                           'Q2', source='D:mon.aiModel', whenValues=['enemyReachable', 'targetAtDistance2', 'enemyInRing1to2',
                                                                    'anyTarget', 'maxTargets', 'pushTowardSpikes', 'mostInjuredAlly',
                                                                    'threatenedAlly', 'playersInZoneAtLeast', 'nearLowestHpPlayer'])
    D['spikes.entryDamage'] = doc('integer', 'dégâts d\'entrée dans les pics (fait des données)', None, source='DB sl80492', status='V')
    D['spikes.monsterTurnStartDamageRaw'] = doc('integer', 'dégâts bruts de début de tour dans les pics (×2 pour un monstre par le 1163 d\'aura)',
                                                None, source='DB sl81026', status='V')
    D['spikes.playerTurnStartDamage'] = doc('integer', 'données : 1 000 (DPLN : 2 000)', 'Q4', alternatives=[2000],
                                            source='DB sl81026 contre DPLN')
    D['spikes.playersDoubledInside'] = doc('boolean', 'le ×2 de l\'aura ne vise que le camp Def selon les données', 'Q3',
                                           alternatives=[True], source='DB sl80492 (lecture Atq/Def : H forte)')
    D['spikes.stackExitAndInside'] = doc('boolean', 'les 1163 se multiplient : ×4 pour un monstre ré-entré avant son tour', 'Q7',
                                         alternatives=[False], source='client 2.73')
    D['spikes.exitVulnerabilityTurns'] = doc('integer', '×2 de sortie jusqu\'au début du prochain tour du porteur', 'Q8',
                                             source='DB sl81025', status='V')
    D['spikes.triggerWhenWalkingThrough'] = doc('boolean', 'traverser des pics en marchant déclenche l\'entrée puis la sortie', 'Q6',
                                                alternatives=[False])
    D['spikes.walkThroughInterruptsMovement'] = doc('boolean', 'la traversée n\'interrompt pas le déplacement', 'Q6', alternatives=[True])
    D['spikes.retriggerOnMoveInside'] = doc('boolean', 'passer d\'une case de pics à une autre ne redéclenche rien', 'Q6',
                                            alternatives=[True], source='Huz 08:30 (« ça a croqué plusieurs fois »)')
    D['spikes.auraAppliesMidSpell'] = doc('boolean', 'l\'aura s\'applique dès l\'arrivée, avant les effets suivants du sort', 'Q6',
                                          alternatives=[False], source='VOD −9 904 = 2 000 + 2 × 3 952', status='Robs')
    D['spawn.mode'] = doc('enum', 'chaque monstre tiré parmi les candidats de son type, poids = nombre d\'observations', 'Q5',
                          ['weighted_observed', 'structured_slots', 'most_frequent', 'uniform_slots'],
                          ['structured_slots', 'most_frequent (déterministe)', 'uniform_slots'])
    D['spawn.seed'] = doc('integer|null', 'null = dérivée de rng.seed', None, alternatives=['entier'])
    D['spawn.excludeOccupied'] = doc('boolean', 'une case occupée n\'est pas tirée', 'Q5', alternatives=[False])
    D['spawn.allowUnassigned'] = doc('boolean', 'autoriser les candidats sans type attribué (scenario.waves[].spawn.unassigned)', 'Q5',
                                     alternatives=[True])
    D['boss.arrivalCell'] = doc('integer', 'case d\'arrivée codée en dur (2960 sur [300])', 'Q9', source='DB sl80837', status='V')
    D['boss.arrivalFallback'] = doc('list', 'repli si 300 est occupée : 287 (observé 3 fois), puis axe x = 17 vers 152, puis case libre la plus proche',
                                    'Q9', values=['axisTowardWaitCell', 'nearestFree'], source='VOD (Robs) + H')
    D['boss.actsBeforeArrival'] = doc('boolean', 'aucune action de la Mama avant T8 (le décompte client la rendrait active au T7 sur 152)',
                                      'Q21', alternatives=[True])
    D['boss.rassemblementBlockedByUnshakable'] = doc('boolean', '1103 n\'est pas une poussée forcée : Inébranlable la bloque', 'Q10',
                                                     alternatives=[False])
    D['boss.rassemblementPullThenPush'] = doc('boolean', 'ordre des effets de 80935 : attirer les Troolls puis repousser les joueurs',
                                              'Q10', alternatives=[False], source='DB sl80935', status='V')
    D['boss.giftCancelsRassemblement'] = doc('boolean', 'bug rapporté (joueur poussé sur un cadeau) désactivé par défaut', 'Q10',
                                             alternatives=[True], source='cardxc 19:30, sspritenL', status='R')
    D['boss.invulnerabilityLiftedBeforeEntryDamage'] = doc('boolean', '5902 est le premier effet de l\'entrée : levée avant les 2 000',
                                                           'Q11', alternatives=[False])
    D['boss.invulnerabilityBackBeforeTurnStartSpikes'] = doc('boolean', 'décompte des buffs avant les glyphes de début de tour',
                                                             'Q11', alternatives=[False])
    D['boss.catastroollBonusScope'] = doc('enum', 'effet 1171 de durée 0 : reste du tour de la Mama', 'Q24',
                                          ['restOfTurn', 'nextCastOnly', 'none'], ['nextCastOnly', 'none'])
    D['boss.levelForPushDamage'] = doc('integer', 'niveau 1000 des données (fiche en jeu : 200) → 133 par case', 'Q25',
                                       alternatives=[200], source='DB mo7984', status='V')
    D['boss.favourCap'] = doc('integer|null', 'null = −5 % par objectif sans plafond (95 % au 6e) ; DPLN : 5', 'Q35',
                              alternatives=[5], source='DB sl80933 contre DPLN')
    D['objectives.maxCount'] = doc('integer', '6 objectifs au maximum (30443 niv.1–6)', 'Q12', alternatives=[5], source='DB sp30443',
                                   status='V')
    D['objectives.offerCount'] = doc('integer', '2 objectifs proposés par vote (vidéos)', 'Q12', alternatives=[3, 4],
                                     source='Khytrayer 02:47, cardxc 04:00', status='R')
    D['objectives.offerDraw'] = doc('enum', 'tirage uniforme parmi les 4 objectifs du palier', 'Q12', ['uniform'])
    D['objectives.tier6Offered'] = doc('boolean', 'le palier 6 existe dans les données (Zephiron : rien après le palier 5)', 'Q12',
                                       alternatives=[False])
    D['objectives.votePolicy'] = doc('enum', 'le vote est choisi par le planificateur (ou une liste fixe d\'identifiants)', None,
                                     ['planner', 'fixed'], ['fixed'])
    D['objectives.pushKillsCount'] = doc('boolean', 'une mort par poussée est attribuée au lanceur (client : X pour toute mort)', 'Q18',
                                         alternatives=[False], source='client contre sspritenL')
    D['objectives.glyphKillsCreditPlayer'] = doc('boolean', 'une mort par les pics est attribuée à l\'entité de scénario', 'Q18',
                                                 alternatives=[True])
    D['objectives.solitudeBeforeArrival'] = doc('boolean', 'la Mama sur 152 compte comme « vivante sans allié » avant T8', 'Q34',
                                                alternatives=[False])
    D['objectives.mamaCountsFromTurn'] = doc('integer', 'la Mama n\'est plus « pré-combat » au T7 (décompte client)', 'Q34',
                                             alternatives=[8])
    D['objectives.v100MeansFull'] = doc('boolean', 'masque v100 interprété comme « PV pleins »', 'Q34', alternatives=[False])
    D['bonuses.offerCount'] = doc('integer', '3 cartes proposées parmi 6', 'Q13', source='DPLN', status='R')
    D['bonuses.draw'] = doc('enum', 'cartes distinctes tirées uniformément, indépendamment à chaque fenêtre', 'Q13', ['uniform_distinct'])
    D['bonuses.firstTurn'] = doc('integer', 'première fenêtre d\'Acclamation', 'Q13', source='VOD', status='Robs')
    D['bonuses.lastTurn'] = doc('integer', 'dernière fenêtre d\'Acclamation', 'Q13', source='VOD', status='Robs')
    D['bonuses.doubleApplication'] = doc('boolean', 'la carte n\'applique son bonus qu\'une fois (l\'effet propre de la carte est forClientOnly)',
                                         'Q23', alternatives=[True], source='DB (effet de carte forClientOnly) + vidéos')
    D['bonuses.policy'] = doc('enum', 'choix de l\'Acclamation par le planificateur', 'Q13', ['planner', 'PO_first', 'PA_first', 'DF_first'],
                              ['PO_first', 'PA_first', 'DF_first'], 'vidéos (deux écoles)', 'R')
    D['gifts.spawnProbability'] = doc('number', 'nouveau cadeau à 63 débuts de tour sur 88 (T2–T9)', 'Q14', alternatives=['0..1'],
                                      source='VOD 63/88', status='Robs', min=0, max=1)
    D['gifts.cells'] = doc('integer[]', 'cases observées des cadeaux', 'Q14', source='VOD (N40 §6)', status='Robs')
    D['gifts.firstTurn'] = doc('integer', 'premier tour avec cadeau', 'Q14', source='VOD', status='Robs')
    D['gifts.lastTurn'] = doc('integer', 'dernier tour avec cadeau', 'Q14', source='VOD', status='Robs')
    D['gifts.cellDraw'] = doc('enum', 'case tirée uniformément parmi les cases libres (sans entité ni cadeau)', 'Q14',
                              ['uniform_free', 'weighted_observed'], ['weighted_observed'])
    D['gifts.cardCount'] = doc('integer', '2 cartes par cadeau', 'Q14', source='DPLN', status='R')
    D['gifts.cardMix'] = doc('object', 'poids relatifs des tirages {2 uniques, 2 améliorations, 1 + 1}', 'Q14')
    D['gifts.monstersTrigger'] = doc('boolean', 'masque Atq,A : seuls les joueurs déclenchent le cadeau', 'Q14', alternatives=[True],
                                     source='DB sp30566', status='V')
    D['gifts.pushedPlayerTriggers'] = doc('boolean', 'un joueur poussé sur un cadeau le déclenche', 'Q14', alternatives=[False],
                                          source='sspritenL', status='R')
    D['gifts.upgradedSpellGreyedUntilNextTurn'] = doc('boolean', 'bug rapporté (partiellement corrigé) désactivé par défaut', 'Q15',
                                                      alternatives=[True], source='Koza 07:30, sspritenL', status='R')
    D['spells.newSpellUsableSameTurn'] = doc('boolean', 'un sort appris en cours de tour est utilisable aussitôt', 'Q15',
                                             alternatives=[False], source='vidéos (Productivité au T1)', status='R')
    D['spells.penseVite.maxCasts'] = doc('integer', 'lancers réellement jouables pendant le tour de 10 s qui suit Pense Vite', 'Q16',
                                         alternatives=['2..6'], source='Houmilito 2:55:30 ; Huz 19:14', status='R', min=1)
    D['spells.penseVite.turnSeconds'] = doc('integer', 'durée du tour qui suit Pense Vite', 'Q16', alternatives=[15],
                                            source='DB sl80843', status='V')
    D['spells.relachementGrowthStart'] = doc('enum', '+25 aux 4 débuts de tour du porteur qui suivent l\'obtention', 'Q17',
                                             ['nextTurnStartAfterObtain', 'immediate'], ['immediate'])
    D['spells.relachementMaxStacks'] = doc('integer', '4 déclenchements (triggerDuration 4 de 30624 niv.1) : +100 au plus', 'Q17',
                                           source='DB sl80852', status='V')
    D['spells.voltigeUpgradedMaxPerTurn'] = doc('integer', 'données : 2 lancers (DPLN : 3)', 'Q26', alternatives=[3], source='DB sl80775',
                                                status='V')
    D['spells.ggUpgradedKeepsRecastBonus'] = doc('boolean', 'l\'effet 406 en tête de 30560 retire le +20 avant la frappe', 'Q27',
                                                 alternatives=[True])
    D['spells.jaillissementUpgradeBroken'] = doc('boolean', '30475 apprend 80750 (inexistant) ; on suppose 80760', 'Q28',
                                                 alternatives=[True])
    D['spells.maledictionCollateraleChains'] = doc('boolean', 'les renvois de Malédiction Collatérale se propagent', 'Q29',
                                                   alternatives=[False])
    D['spells.maledictionCollateraleHitsCarrier'] = doc('boolean', 'le porteur n\'est pas touché par son propre renvoi', 'Q29',
                                                        alternatives=[True])
    D['spells.maledictionRegenerantePercent'] = doc('integer', 'données : 100 % (description, DPLN : 50 %)', 'Q29', alternatives=[50],
                                                    source='DB sl80849', status='V')
    D['spells.maledictionRegeneranteZone'] = doc('enum', 'données : alliés à 2 cases au plus (DPLN : tous)', 'Q29', ['C2', 'all'], ['all'])
    D['spells.maledictionMouvanteOnGlyphDamage'] = doc('boolean', 'les dégâts de glyphe (sans attaquant joueur) ne repoussent pas', 'Q29',
                                                       alternatives=[True])
    D['spells.pulsationChaotiqueBounceRange'] = doc('integer|null', 'null = rebonds sans limite de portée', 'Q29', alternatives=[5])
    D['spells.chamboulementBounceTarget'] = doc('enum', 'rebond vers l\'ennemi non marqué le plus proche', 'Q29', ['nearest'])
    D['spells.poutchLifetimeTurns'] = doc('integer|null', 'null = durée de vie illimitée (30420 « Mort » jamais référencé)', 'Q30',
                                          alternatives=[1])
    D['spells.protectionProlongeeSelfHeals'] = doc('integer', 'lancée sur soi : 1 soin de début de tour (décompte avant déclenchement)',
                                                   'Q31', alternatives=[2])
    D['spells.bienfaiteurOverflowLost'] = doc('boolean', 'les dégâts au-delà du seuil sont perdus', 'Q31', alternatives=[False])
    D['spells.ultimeEspoirRespawnCell'] = doc('enum', 'case de mort si libre, sinon case libre la plus proche', 'Q31',
                                              ['deathCellOrNearest'])
    D['spells.delivranceWorks'] = doc('boolean', 'Délivrance désenvoûte les effets dispellable = 1', 'Q31', alternatives=[False],
                                      source='données contre Willseir')
    D['spells.coupDeSangCreatesErosion'] = doc('boolean', 'le malus de PV (1048) ne crée pas d\'érosion', 'Q32', alternatives=[True])
    D['spells.impactCritHitsPoutch'] = doc('boolean', 'masque A,J de l\'Impact critique : le Poutch allié n\'est pas touché', 'Q32',
                                           alternatives=[True])
    D['archetypes.hpMode'] = doc('enum', 'bonus de PV du passif 30639 non appliqués (VOD, capture DPLN)', 'Q20',
                                 ['flat30000', 'passiveApplies'], ['passiveApplies (Acrobate 35 000, Magicien 25 000)'],
                                 'VOD + DPLN', 'Robs')
    D['archetypes.dompteurPower'] = doc('integer', 'Puissance du Dompteur : 0 (4 relevés VOD exacts à ×61)', 'Q20', alternatives=[3000],
                                        source='VOD (N1D §12)', status='Robs')
    D['rng.seed'] = doc('integer', 'graine du PRNG stocké dans l\'état (déterminisme)', None, status='engine')
    D['rng.rollMode'] = doc('enum', 'jets de dés : aléatoires, moyens (arrondi inférieur), minimaux ou maximaux (planificateur)', None,
                            ['random', 'average', 'min', 'max'], ['average', 'min', 'max'], status='engine')
    D['rng.critMode'] = doc('enum', 'coups critiques : tirés, jamais ou toujours (planificateur)', None, ['random', 'never', 'always'],
                            ['never', 'always'], status='engine')
    D['rng.rollDistribution'] = doc('enum', 'loi du jet aléatoire : uniforme (serveur supposé) ou aperçu client (bornes sous-pondérées)',
                                    'Q22', ['uniform', 'clientPreview'], ['clientPreview'])
    D['rng.rollPerTarget'] = doc('boolean', 'un seul jet par effet et par lancer, commun à toutes les cibles de la zone', None,
                                 alternatives=[True], status='H')
    D['engine.subSpellsIgnoreCastConditions'] = doc('boolean', 'un sous-sort exécuté ignore PA, PO et LdV', 'Q33', alternatives=[False])
    D['engine.pushLevelForArchetypes'] = doc('integer', 'niveau du monstre 7980 pour la collision (283 par case)', 'Q38',
                                             alternatives=['niveau réel du personnage'], source='DB mo7980', status='V')
    D['engine.eventLog'] = doc('boolean', 'journal d\'événements typé (désactivable pour la vitesse du planificateur)', None,
                               alternatives=[False], status='engine')
    D['engine.maxSubSpellDepth'] = doc('integer', 'garde-fou contre les boucles de sous-sorts et de déclencheurs', None, status='engine',
                                       min=1)
    D['engine.removeBuffsOfDeadCaster'] = doc('boolean', 'à la mort d\'un combattant, les envoûtements qu\'il a lancés sur les '
                                              'autres sont retirés (client : BuffManager.removeLinkedBuff à la mort)', None,
                                              alternatives=[False], source='CLI273 (mémoire du code, non relu)', status='H')
    D['engine.unshakableBlocksCasterAdvance'] = doc('boolean', 'Inébranlable (effet d\'état 0) bloque aussi l\'avance du lanceur '
                                                    '(1042), traitée comme une attirance du lanceur (canBePushed du déplacé)',
                                                    None, alternatives=[False], status='H')
    D['engine.firstTurnDecrementSkip'] = doc('enum', 'un envoûtement posé avant le premier tour global (passifs de début de '
                                             'combat, passe-tour de la Mama) n\'est pas décompté au premier début de tour de '
                                             'son lanceur (client : spellBuffsToIgnore) ; délai 7 de la Mama → T8',
                                             None, ['preFight', 'casterFirstTurn', 'none'], ['casterFirstTurn', 'none'],
                                             source='N70 §7.2, ETUDE §6.3', status='H')
    D['engine.turnStartTriggersBeforeDecrement'] = doc('boolean', 'début de tour : décompte des buffs lancés par le combattant '
                                                       'PUIS effets TB de ses buffs (ordre supposé ETUDE §9.10) ; true : TB '
                                                       'd\'abord (un TB de durée 1 posé sur soi se déclencherait)', None,
                                                       alternatives=[True], source='N70 §7.2', status='H')
    D['engine.dispelGlyphsTriggeringMarkOnly'] = doc('boolean', '2018 exécuté par le sort d\'une marque (cadeau ramassé) ne '
                                                     'dissipe que cette marque, pas les autres cadeaux posés', 'Q14',
                                                     alternatives=[False], source='DB sl80986 + « plusieurs cadeaux '
                                                     'peuvent coexister »', status='H')
    D['victory.canFinishFromTurn'] = doc('integer', '30577 lancé à l\'apparition de V10', 'Q19', alternatives=[11], source='GD 53:00',
                                         status='R')
    D['victory.turnLimit'] = doc('integer|null', 'aucune limite de tours connue', 'Q19', alternatives=['entier'])
    D['map.dynamicObstacles'] = doc('boolean', 'aucun obstacle dynamique observé (non implémentés selon les GD)', 'Q39',
                                    alternatives=[True], source='GD 51:30 + VOD', status='R')
    cfg['_doc'] = D
    check_config_doc(cfg)
    return cfg


def iter_leaves(obj, prefix=''):
    for k, v in obj.items():
        if k == '_doc':
            continue
        path = f'{prefix}.{k}' if prefix else k
        if isinstance(v, dict):
            yield from iter_leaves(v, path)
        else:
            yield path, v


def get_path(obj, path):
    for part in path.split('.'):
        obj = obj[part]
    return obj


def check_config_doc(cfg) -> None:
    D = cfg['_doc']
    object_params = [p for p, d in D.items() if d['type'] == 'object']
    leaves = dict(iter_leaves(cfg))
    for path in leaves:
        if any(path.startswith(p + '.') for p in object_params):
            continue
        assert path in D, ('paramètre non documenté', path)
    for path, d in D.items():
        v = get_path(cfg, path)
        t = d['type']
        ok = {
            'boolean': lambda v: isinstance(v, bool),
            'integer': lambda v: isinstance(v, int) and not isinstance(v, bool),
            'number': lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
            'integer|null': lambda v: v is None or (isinstance(v, int) and not isinstance(v, bool)),
            'enum': lambda v: v in d['values'],
            'enum[]': lambda v: isinstance(v, list) and all(x in d['values'] for x in v),
            'integer[]': lambda v: isinstance(v, list) and all(isinstance(x, int) for x in v),
            'list': lambda v: isinstance(v, list) and all(isinstance(x, int) or x in d['values'] for x in v),
            'object': lambda v: isinstance(v, dict),
        }[t](v)
        assert ok, ('type de paramètre', path, t, v)


def collect_config_refs(obj, out):
    if isinstance(obj, dict):
        if set(obj.keys()) == {'$config'}:
            out.add(obj['$config'])
        for v in obj.values():
            collect_config_refs(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_config_refs(v, out)
    return out


# ----------------------------------------------------------------------------------------------
# Écriture (JSON lisible : un enregistrement par ligne pour les gros tableaux)
# ----------------------------------------------------------------------------------------------
WIDTH = 120
FORCE_INLINE = {('spells', '*'), ('map', 'cells', '*'), ('effects', '*'), ('states', '*')}


def _compact(v) -> str:
    return json.dumps(v, ensure_ascii=False, separators=(',', ':'))


def _forced(path) -> bool:
    for pat in FORCE_INLINE:
        if len(pat) == len(path) and all(p == '*' or p == q for p, q in zip(pat, path)):
            return True
    return False


def dumps(v, path=(), indent=0) -> str:
    if not isinstance(v, (dict, list)) or not v:
        return _compact(v)
    c = _compact(v)
    if _forced(path) or (len(c) + indent <= WIDTH and path):
        return c
    pad = ' ' * (indent + 1)
    if isinstance(v, dict):
        items = [f'{pad}{json.dumps(k, ensure_ascii=False)}: {dumps(x, path + (k,), indent + 1)}' for k, x in v.items()]
        return '{\n' + ',\n'.join(items) + '\n' + ' ' * indent + '}'
    items = [f'{pad}{dumps(x, path + ("*",), indent + 1)}' for x in v]
    return '[\n' + ',\n'.join(items) + '\n' + ' ' * indent + ']'


# ----------------------------------------------------------------------------------------------
# Assemblage et contrôles globaux
# ----------------------------------------------------------------------------------------------

def build() -> tuple[OrderedDict, OrderedDict]:
    maps = build_map()
    level_ids = compute_closure()
    spells = OrderedDict((str(lid), build_level(lid)) for lid in level_ids)
    spell_index = OrderedDict()
    for L in spells.values():
        spell_index.setdefault(str(L['spellId']), []).append(L['spellLevelId'])
    spell_index = OrderedDict(sorted(spell_index.items(), key=lambda kv: int(kv[0])))
    for sid, lids in spell_index.items():
        assert lids == spell_levels_of(int(sid)), sid
    effects = build_effects_catalogue(spells)
    states = build_states(spells)
    archetypes = build_archetypes(spells)
    monsters = build_monsters(spells)
    boss = build_boss(monsters)
    scenario = build_scenario()
    config = build_config(monsters)

    # tous les niveaux et sous-sorts référencés existent
    for L in spells.values():
        for e in L['effects'] + L['critEffects']:
            assert str(e['effectId']) in effects
            ref = e.get('subSpell')
            if ref:
                assert str(ref['spellId']) in spell_index, (L['spellLevelId'], ref)
                if ref['spellLevelId'] is not None:
                    target = ref.get('substituteSpellLevelId', ref['spellLevelId'])
                    assert str(target) in spells, (L['spellLevelId'], ref)
            if 'stateId' in e:
                assert str(e['stateId']) in states
            if 'summon' in e:
                assert str(e['summon']['monsterId']) in monsters
    for a in archetypes.values():
        for lid in [s['spellLevelId'] for s in a['spellSlots']] + a['uniques'] + [a['commonSpell'], a['passiveSpellLevelId']]:
            assert str(lid) in spells, lid
        for base, u in a['upgrades'].items():
            assert base in spells and str(u['to']) in spells and str(u['choiceSpellLevelId']) in spells
        for c in a['acclamations']:
            assert str(c['choiceSpellLevelId']) in spells and str(c['realSpellLevel']) in spells
    for m in monsters.values():
        for lid in m['spells'] + [m['startingSpellLevel']]:
            assert str(lid) in spells, lid
    assert sum(len(a['acclamations']) for a in archetypes.values()) == 18

    counts = OrderedDict([
        ('cells', len(maps['cells'])), ('playable', len(maps['playable'])), ('spikes', len(maps['spikes']['cells'])),
        ('spells', len(spell_index)), ('spellLevels', len(spells)),
        ('effectsNormal', sum(len(L['effects']) for L in spells.values())),
        ('effectsCritical', sum(len(L['critEffects']) for L in spells.values())),
        ('effectIds', len(effects)), ('states', len(states)), ('monsters', len(monsters)),
        ('waves', len(scenario['waves'])), ('objectives', len(scenario['objectives']['list'])),
    ])
    data = OrderedDict([
        ('schemaVersion', SCHEMA_VERSION),
        ('meta', build_meta(counts)),
        ('map', maps),
        ('rules', build_rules()),
        ('effects', effects),
        ('states', states),
        ('spells', spells),
        ('spellIndex', spell_index),
        ('archetypes', archetypes),
        ('monsters', monsters),
        ('boss', boss),
        ('scenario', scenario),
        ('tests', build_tests(maps)),
    ])
    refs = collect_config_refs(data, set())
    leaves = {p for p, _ in iter_leaves(config)}
    missing = sorted(r for r in refs if r not in leaves)
    assert not missing, ('références $config absentes de la config', missing)
    return data, config


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    check = '--check' in argv
    data, config = build()
    outputs = [(OUT_DATA, dumps(data) + '\n'), (OUT_CONFIG, dumps(config) + '\n')]
    status = 0
    for path, text in outputs:
        size = len(text.encode('utf-8'))
        assert size < 6_000_000, (path, size)
        rel = path.relative_to(ROOT)
        if check:
            same = path.exists() and path.read_text(encoding='utf-8') == text
            print(f'{rel} : {"à jour" if same else "DIFFÉRENT"} ({size / 1024:.0f} Kio)')
            status |= 0 if same else 1
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text, encoding='utf-8')
            print(f'{rel} : {size / 1024:.0f} Kio écrits')
    c = data['meta']['counts']
    print(f"niveaux de sorts : {c['spellLevels']} ({c['spells']} sorts), effets : {c['effectsNormal']} + {c['effectsCritical']} critiques, "
          f"effectId : {c['effectIds']}, états : {c['states']}")
    return status


if __name__ == '__main__':
    sys.exit(main())
