#!/usr/bin/env python3
"""Fiche normalisée de l'archétype DOMPTEUR du Gladiatrool -> research/data/archetype_dompteur.json

Sources primaires :
* research/raw/dofusdb/{spells,spell_levels,effects,spell_states}.json (DofusDB = données du client DOFUS 3,
  extraction du 2026-09-28) ;
* research/data/effects_semantics.json (sémantique des effectId, agent « formules ») ;
* tools/mechanics/{zones,damage,geometry}.py (portage des formules du client : zones, dégressivité, dégâts).

Sources rapportées (texte figé ci-dessous, avec URL) : guide Dofus pour les Noobs (DPLN, maj 21/05/2026),
captures d'infobulles DPLN, vidéos (notes/60_videos.md) et VOD Twitch 2852548819 (relevés de dégâts).

Stdlib seule. Usage :
    python3 tools/archetypes/build_archetype_dompteur.py          # écrit le JSON
    python3 tools/archetypes/build_archetype_dompteur.py --md     # imprime aussi les tableaux markdown (note 1x)
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from mechanics import damage as D  # noqa: E402
from mechanics import geometry as G  # noqa: E402
from mechanics import zones as Z  # noqa: E402

RAW = ROOT / 'research' / 'raw' / 'dofusdb'
OUT = ROOT / 'research' / 'data' / 'archetype_dompteur.json'
API = 'https://api.dofusdb.fr'
DPLN = 'https://www.dofuspourlesnoobs.com/gladiatrool.html'
IMG = 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/'
VOD = 'https://www.twitch.tv/videos/2852548819'


def _load(p: Path):
    with open(p, encoding='utf-8') as f:
        return json.load(f)


SPELLS = _load(RAW / 'spells.json')
LEVELS = _load(RAW / 'spell_levels.json')
EFFECTS = _load(RAW / 'effects.json')
STATES = _load(RAW / 'spell_states.json')
SEM = _load(ROOT / 'research' / 'data' / 'effects_semantics.json')

# ------------------------------------------------------------------------------------------------
# Constantes de l'archétype
# ------------------------------------------------------------------------------------------------
BASE = dict(hp=30000, ap=8, mp=4, strength=6000, power=0, push_damage=1000, crit=10, level=200)
P_CRIT_BASE = BASE['crit']
# repère des zones : case ciblée 300 (centre de l'arène), lanceur à 3 cases sur un axe (257)
TARGET_CELL = 300
CASTER_CELL = G.next_cell(G.next_cell(G.next_cell(300, 5), 5), 5)

SPELL_EXEC = {1160, 792, 2160, 2792, 1017, 1018, 1019, 2017, 2794, 2795, 2960, 793, 2793}
EXEC_MEANING = {
    1160: 'CasterExecuteSpell : le LANCEUR exécute le sous-sort sur la case de chaque cible de l\'effet',
    792: 'TargetExecuteSpell : chaque CIBLE de l\'effet exécute le sous-sort sur sa propre case (buff déclenché : le porteur)',
    2160: 'CasterExecuteSpellGlobalLimitation : comme 1160, limité à « value » exécution(s) par lancer',
    2792: 'TargetExecuteSpellGlobalLimitation : comme 792, limité à « value » exécution(s) par lancer',
}

MASK = {
    'A': ('ennemis du lanceur', 'haute'),
    'a': ('alliés du lanceur (lanceur inclus)', 'moyenne'),
    'g': ('alliés du lanceur, lanceur exclu', 'moyenne'),
    'C': ('le lanceur (cible additionnelle, même hors zone)', 'haute'),
    'c': ('le lanceur', 'haute'),
    'j': ('invocations alliées (ex. Poutch « Stratège Dompteur » 7985/7986 de l\'Acrobate) ; infobulle « (Invoc.) »', 'moyenne'),
    'J': ('invocations ennemies (aucune dans le Gladiatrool)', 'moyenne'),
    'O': ('le combattant déclencheur (buff déclenché)', 'moyenne'),
    'Atq': ('camp attaquant = joueurs (HYPOTHÈSE DOFUS 3)', 'moyenne'),
    'Def': ('camp défenseur = monstres (HYPOTHÈSE DOFUS 3)', 'moyenne'),
    'Sce': ('entité « scénario » (HYPOTHÈSE)', 'basse'),
}
TRIG = {
    'I': ('immédiat', 'haute'),
    'D': ('quand le porteur subit des dommages (hors dommages de poussée)', 'haute'),
    'XD': ('quand le porteur meurt par dommages (HYPOTHÈSE)', 'moyenne'),
    'X': ('à la mort du porteur', 'haute'),
    'K': ('quand le porteur (lanceur du buff) tue une entité', 'moyenne'),
    'TB': ('au début du tour du porteur', 'haute'),
    'TE': ('à la fin du tour du porteur', 'haute'),
    'DBA': ('quand le porteur subit des dommages d\'un allié', 'moyenne'),
}


def state_name(sid: int) -> str:
    s = STATES.get(str(sid))
    if not s:
        return f'état {sid}'
    n = s.get('name')
    return n.get('fr') if isinstance(n, dict) else str(n)


def spell_name(sid: int) -> str:
    s = SPELLS.get(str(sid))
    return s['name']['fr'] if s else f'sort {sid}'


def decode_mask(mask: str) -> List[dict]:
    out = []
    for tok in [t for t in (mask or '').split(',') if t]:
        on_caster = tok.startswith('*')
        t = tok[1:] if on_caster else tok
        m = re.fullmatch(r'([EeFf])(\d+)', t)
        if m:
            k, n = m.group(1), int(m.group(2))
            if k in 'Ee':
                meaning = ('possède' if k == 'E' else 'ne possède PAS') + f' l\'état {n} « {state_name(n)} »'
            else:
                meaning = ('est' if k == 'F' else 'n\'est PAS') + f' le monstre {n}'
            if on_caster:
                meaning = 'critère sur le LANCEUR : ' + meaning
            out.append({'token': tok, 'meaning': meaning, 'confidence': 'haute'})
            continue
        meaning, conf = MASK.get(t, (f'jeton {t} (non documenté)', 'basse'))
        out.append({'token': tok, 'meaning': meaning, 'confidence': conf})
    return out


def decode_trigger(tr: str) -> List[dict]:
    out = []
    for tok in [t for t in (tr or '').split('|') if t]:
        m = re.fullmatch(r'(EON|EOFF)(\d+)', tok)
        if m:
            out.append({'token': tok, 'meaning': ('gagne' if m.group(1) == 'EON' else 'perd') +
                        f' l\'état {m.group(2)} « {state_name(int(m.group(2)))} »', 'confidence': 'haute'})
            continue
        meaning, conf = TRIG.get(tok, (f'déclencheur {tok}', 'basse'))
        out.append({'token': tok, 'meaning': meaning, 'confidence': conf})
    return out


def zone_info(zd: dict) -> dict:
    z = Z.SpellZone.from_zone_descr(zd)
    shape = z.shape
    p1, p2 = zd.get('param1', 0), zd.get('param2', 0)
    raw = f'{chr(zd["shape"]) if zd.get("shape") else "-"}{p1}' + (f',{p2}' if p2 else '')
    info = {
        'raw': raw, 'shape': shape, 'shapeCode': zd.get('shape'),
        'shapeName': Z.SHAPE_NAMES.get(shape, shape),
        'radius': z.radius, 'minRadius': z.min_radius,
        'degressionPercent': zd.get('damageDecreaseStepPercent'),
        'maxDegressionTicks': zd.get('maxDamageDecreaseApplyCount'),
    }
    if shape in 'Aa':
        info['cellCount'] = 'toute la carte'
        info['degressionApplies'] = False
    else:
        info['cellCount'] = len(z.cells(TARGET_CELL, CASTER_CELL))
        info['degressionApplies'] = bool(z.radius >= 1 and z.degression and z.max_degression_ticks and z.radius <= 50)
    if shape in 'RFTLV':
        info['directional'] = True
    return info


def fmt_label(e: dict) -> Optional[str]:
    eid, n, s, v = e['effectId'], e['diceNum'], e['diceSide'], e['value']
    if eid in SPELL_EXEC:
        return f'exécute le sous-sort {n} « {spell_name(n)} » (niv. {s})'
    if eid == 293:
        return f'{spell_name(n)} ({n}) : +{v} dégâts de base'
    if eid == 406:
        return f'Enlève (au lanceur) les effets du sort {v} « {spell_name(v)} »'
    if eid in (950, 951):
        return ('État ' if eid == 950 else 'Enlève l\'état ') + f'{v} « {state_name(v)} »'
    if eid == 3406:
        return f'Désapprend le sort temporaire (spell-level {v})'
    if eid == 3405:
        return f'Apprend le sort temporaire (spell-level {v})'
    if eid == 3407:
        return f'Durée du prochain tour : {v} secondes'
    if eid == 3793:
        return f'Script visuel {v} (ExecuteSpellScriptUsageOnTarget, sans effet de jeu)'
    tpl = (EFFECTS.get(str(eid), {}).get('description') or {}).get('fr') or ''
    if not tpl:
        return None
    t = tpl
    t = re.sub(r'\{\{~1~2([^}]*)\}\}', (lambda m: m.group(1)) if s else (lambda m: ''), t)
    t = t.replace('#2', str(s) if s else '')
    t = t.replace('#1', str(n)).replace('#3', str(v))
    t = re.sub(r'\{\{~p?s\}\}', 's' if n > 1 else '', t)
    t = re.sub(r'\{\{~[pz]s?\}\}', '', t)
    t = re.sub(r'<sprite name="([^"]+)">', '', t)
    return re.sub(r'\s+', ' ', t).strip()


def sem(eid: int) -> dict:
    return SEM.get(str(eid), {})


def effect_obj(e: dict, with_sub: bool = True) -> dict:
    eid = e['effectId']
    s = sem(eid)
    o = {
        'order': e['order'], 'effectId': eid, 'action': s.get('action_dofus3'), 'kind': s.get('categorie'),
        'label': fmt_label(e),
        'real': not e['forClientOnly'], 'clientOnly': bool(e['forClientOnly']),
        'visibleInTooltip': bool(e['visibleInTooltip']),
        'diceNum': e['diceNum'], 'diceSide': e['diceSide'], 'value': e['value'],
        'targetMask': e['targetMask'], 'targets': decode_mask(e['targetMask']),
        'trigger': e['triggers'], 'triggerDecoded': decode_trigger(e['triggers']),
        'duration': e['duration'], 'delay': e['delay'], 'triggerDuration': e['effectTriggerDuration'],
        'dispellable': e['dispellable'], 'random': e['random'], 'group': e['group'],
        'element': D.ELEMENT_NAMES.get(D.element_of(eid)) if eid in (89, 95, 100, 1092, 1118) else None,
        'zone': zone_info(e['zoneDescr']),
    }
    if eid in (100, 95):
        lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
        o['min'], o['max'] = lo, hi
    if eid in SPELL_EXEC and with_sub:
        sub_id, grade = e['diceNum'], e['diceSide']
        sp = SPELLS.get(str(sub_id))
        if sp and 1 <= grade <= len(sp['spellLevels']):
            lid = sp['spellLevels'][grade - 1]
            o['subSpell'] = {'spellId': sub_id, 'grade': grade, 'spellLevelId': lid, 'name': sp['name']['fr'],
                             'adminName': sp.get('adminName'), 'executor': s.get('action_dofus3'),
                             'executorMeaning': EXEC_MEANING.get(eid), 'globalLimit': e['value'] or None,
                             'source': f'{API}/spell-levels/{lid}'}
    return o


def level_obj(lid: int) -> dict:
    sl = LEVELS[str(lid)]
    crit = sl['criticalHitProbability']
    o = {
        'spellLevelId': lid, 'spellId': sl['spellId'], 'grade': sl['grade'],
        'apCost': sl['apCost'],
        'range': {'min': sl['minRange'], 'max': sl['range'], 'modifiable': sl['rangeCanBeBoosted']},
        'castInLine': sl['castInLine'], 'castInDiagonal': sl['castInDiagonal'],
        'lineOfSight': sl['castTestLos'], 'needFreeCell': sl['needFreeCell'], 'needTakenCell': sl['needTakenCell'],
        'needFreeTrapCell': sl['needFreeTrapCell'], 'needVisibleEntity': sl['needVisibleEntity'],
        'maxCastPerTurn': sl['maxCastPerTurn'], 'maxCastPerTarget': sl['maxCastPerTarget'],
        'minCastInterval': sl['minCastInterval'], 'initialCooldown': sl['initialCooldown'],
        'globalCooldown': sl['globalCooldown'],
        'criticalHitProbability': crit,
        'effectiveCritChance': D.critical_chance(crit, P_CRIT_BASE),
        'statesCriterion': sl['statesCriterion'] or None, 'maxStack': sl['maxStack'],
        'source': f'{API}/spell-levels/{lid}',
        'effects': [effect_obj(e) for e in sl['effects']],
        'critEffects': [effect_obj(e) for e in sl.get('criticalEffect', [])],
    }
    return o


# ------------------------------------------------------------------------------------------------
# Dégâts attendus (tools/mechanics/damage.py)
# ------------------------------------------------------------------------------------------------
BIG = 10 ** 9


def caster_stats(power=0, final=100, crit_damage=0, hp=30000, max_hp=30000, eroded=0) -> D.Stats:
    return D.Stats(level=200, is_player=True, strength=BASE['strength'], power=power, final_damage=final,
                   crit_damage=crit_damage, hp=hp, max_hp=max_hp, eroded_hp=eroded, crit=P_CRIT_BASE)


def target_stats(eroded=0) -> D.Stats:
    return D.Stats(level=200, is_player=False, max_hp=BIG, hp=BIG, eroded_hp=eroded)


VULN = [D.Multiplier(200, ('D',))]


def hit(roll: int, action: int, *, critical=False, power=0, final=100, crit_damage=0, vuln=False,
        eff=1.0, base_bonus=0, caster_hp=30000, caster_eroded=0, target_eroded=0) -> int:
    c = caster_stats(power=power, final=final, crit_damage=crit_damage, hp=caster_hp, eroded=caster_eroded)
    t = target_stats(eroded=target_eroded)
    r = D.compute_hit(roll, action, c, t, melee=False, aoe_efficiency=eff, critical_effect=critical,
                      target_multipliers=VULN if vuln else (), spell=D.SpellCtx(base_damage_bonus=base_bonus))
    return r.final


def rng(lo: int, hi: int, action: int, **kw) -> dict:
    vals = [hit(r, action, **kw) for r in range(lo, hi + 1)]
    return {'min': min(vals), 'max': max(vals), 'mean': round(sum(vals) / len(vals), 1)}


def expected(n: dict, c: Optional[dict], p: int) -> float:
    if not c or p <= 0:
        return n['mean']
    return round((1 - p / 100) * n['mean'] + p / 100 * c['mean'], 1)


def eff_of(dist: int, deg: int, ticks: int) -> float:
    return (100 - min(min(dist, ticks) * deg, 100)) / 100


def dmg_block(lo, hi, clo, chi, action, *, crit_pct, deg=10, ticks=4, aoe=True, base_bonus=0,
              dists=(0, 1, 2, 3), extra: Optional[dict] = None) -> dict:
    """Bloc « expectedDamage » pour un effet de dommages à jets (100 / 95)."""
    p = D.critical_chance(crit_pct, P_CRIT_BASE)
    rows = []
    for d in (dists if aoe else (0,)):
        e = eff_of(d, deg, ticks) if aoe else 1.0
        row = {'distanceFromCenter': d, 'aoeCoef': e}
        for vuln in (False, True):
            key = 'vulnerable' if vuln else 'normal'
            n = rng(lo, hi, action, eff=e, vuln=vuln, base_bonus=base_bonus)
            c = rng(clo, chi, action, eff=e, vuln=vuln, base_bonus=base_bonus, critical=True) if clo else None
            row[key] = {'hit': n, 'crit': c, 'expected': expected(n, c, p)}
        rows.append(row)
    blk = {
        'formula': 'final = int((int((jet + bonus_base) × (100 + Force 6000 + Puissance) / 100) [+ Dommages critiques si coup critique]) × coefZone) '
                   '× dommages finaux/100 × Vulnérable (×2, 1163 déclencheur D) ; troncature à chaque étape',
        'casterStats': {'strength': BASE['strength'], 'power': 0, 'finalDamage': 100, 'critDamage': 0},
        'multiplier': '×61 (Force 6000, Puissance 0)',
        'critChance': p, 'baseBonus': base_bonus, 'byDistance': rows,
        'variantPower3000': {
            'note': 'HYPOTHÈSE écartée par les relevés vidéo : +3000 Puissance du passif 30639 (×91)',
            'center': {'hit': rng(lo, hi, action, power=3000, base_bonus=base_bonus),
                       'crit': rng(clo, chi, action, power=3000, critical=True, base_bonus=base_bonus) if clo else None}},
    }
    if extra:
        blk.update(extra)
    return blk


# ------------------------------------------------------------------------------------------------
# Métadonnées rapportées (DPLN, vidéos) et analyse
# ------------------------------------------------------------------------------------------------
DPLN_IMG = {
    30395: ('ark26gladia9_orig.png', 'ark26gladia21_orig.png'),
    30396: ('ark26gladia10_orig.png', 'ark26gladia100_orig.png'),
    30397: ('ark26gladia13_orig.png', 'ark26gladia23_orig.png'),
    30398: ('ark26gladia16_orig.png', 'ark26gladia17_orig.png'),
    30399: ('ark26gladia102_orig.png', 'ark26gladia106_orig.png'),
    30400: ('ark26gladia19_orig.png', 'ark26gladia20_orig.png'),
    30401: ('ark26gladia103_orig.png', 'ark26gladia104_orig.png'),
    30603: ('ark26gladia14_orig.png',), 30613: ('ark26gladia18_orig.png',), 30614: ('ark26gladia116_orig.png',),
    30611: ('ark26gladia12_orig.png',), 30615: ('ark26gladia24_orig.png',), 30612: ('ark26gladia99_orig.png',),
    30602: ('ark26gladia101_orig.png',), 30416: ('ark26gladia40_orig.png',),
}

CLASSIC = [
    # id, upgradedId, upgradeChoiceSpellId, unlockOrder, unlockedBy, dpln text, dpln upgrade, tooltip capture
    (30416, None, None, 0, 'départ (sort commun aux 3 archétypes)',
     '« Frappe Repoussoir » qui inflige 1200 de dégâts neutre et repousse la cible de 2 cases. Ce sort ne possède pas d\'amélioration.',
     None, 'Coût 3 PA ; Portée 1-6 (modifiable) ; Critique 40 % ; 2/tour ; Repousse de 2 cases ; 16 à 20 (crit 21 à 25)'),
    (30395, 30558, 30469, 1, 'départ (sort propre du Dompteur, proposé dans la fenêtre « Devenir Dompteur »)',
     'Impact (sort de départ) : Frappe environ du 4 500 dans l\'élément neutre en zone cercle de taille 2.',
     'Taille du cercle : 2 cases > 3 cases ; Lancer par tour : 2 > 3',
     'Coût 4 PA ; Portée 1-5 (modifiable) ; Critique 30 % ; cercle de 13 cases ; 2/tour ; 68 à 74 (crit 82 à 89) (Invoc.)'),
    (30396, 30560, 30471, 2, 'objectif n°1 (Spell Manager 30626 niv.1, spell-level 80855)',
     'Grondement Grandissant : Frappe environ du 6 200 dans l\'élément neutre en zone croix de taille 1 et augmente les dégâts du sort s\'il est réutilisé dans 2 tours.',
     'Taille de la croix : 1 case > 3 cases',
     'Coût 4 PA ; Portée 1-6 (modifiable) ; Critique 40 % ; croix de 5 cases ; intervalle 2 ; 82 à 92 (crit 98 à 110) ; +20 dégâts de base (dans 2 tours)'),
    (30397, 30561, 30472, 3, 'objectif n°2 (Spell Manager niv.2, spell-level 80856)',
     'Prélèvement : Érode un ennemi et le frappe en vol de vie dans l\'élément neutre.',
     'Taille du cercle en critique : 2 > 3 cases ; Érosion : 15% > 20% ; Lancers par tour : 3 > 4',
     'Coût 3 PA ; Portée 1-6 (modifiable) ; Critique 40 % ; sans LdV ; 2/tour/cible ; cumul max 3 ; 3/tour ; Érosion -15 % (2 tours) ; vol de vie 42 à 50 (crit 50 à 60)'),
    (30398, 30562, 30473, 4, 'objectif n°3 (Spell Manager niv.3, spell-level 80857)',
     'Détonation : Frappe neutre en zone. Plus il y a de monstres dans la zone, plus le sort frappe fort.',
     'Taille du rectangle : 3 par 2 cases > 5 par 2 cases',
     'Coût 4 PA ; Portée 1-6 (modifiable) ; Critique 70 % (capture avec bonus) ; rectangle 3 par 2 ; lancer en ligne ; 1/tour ; « Détonation : +10 dégâts de base » ; 38 à 42 (crit 46 à 50)'),
    (30399, 30563, 30474, 5, 'objectif n°4 (Spell Manager niv.4, spell-level 80858)',
     'Coup de Sang : Inflige des dégâts neutre correspondant à 20% des PV du lanceur mais lui fait perdre également 10% de PV.',
     'Taille du cercle : 2 cases > 3 cases',
     'Coût 4 PA ; Portée 1-5 (modifiable) ; cercle de 13 cases ; intervalle 2 ; Dommages : 20 % des PV de l\'attaquant ; PV (∞) -10 %'),
    (30400, 30564, 30475, 6, 'objectif n°5 (Spell Manager niv.5, spell-level 80859)',
     'Jaillissement : Frappe neutre en zone en fonction du nombre de PV érodés du lanceur.',
     'Taille du carré : 1 case > 2 cases',
     'Coût 5 PA ; Portée 1-5 (modifiable) ; carré de 9 cases ; intervalle 3 ; Dommages (Neutre) : 40 % PV érodés du lanceur'),
    (30401, 30565, 30476, 7, 'objectif n°6 (Spell Manager niv.6, spell-level 80860)',
     'Ombre Fracassante : Frappe neutre en fonction des PV érodés de la cible.',
     'Taille da la fourche : 4 cases > 5 cases',
     'Coût 2 PA ; Portée 1-5 (modifiable) ; fourche de 10 cases ; lancer en ligne ; intervalle 1 ; Dommages (Neutre) : 30 % PV érodés de la cible'),
]

UNIQUES = [
    (30603, 'Galvanisation : Donne 4PA pour deux tours à tous les personnages.',
     'Coût 5 PA ; Portée 0 ; PA (2 tours) +4'),
    (30614, 'Immortalité du Berserker : Applique un seuil de PV au lanceur pour un tour. Si pendant ce tour il tue une entité, réapplique le seuil au tour suivant.',
     'Coût 5 PA ; Portée 0 ; Cumul max. des effets 1 ; Seuil : PV (1 tour)'),
    (30613, 'Malédiction Collatérale : Quand un monstre subit des dégâts, il en renvoie la moitié à ses alliés.',
     'Coût 5 PA ; Portée 0 ; cercle de 13 cases ; « Renvoie 100% des dommages subis » (capture) ; description : 50 %'),
    (30611, 'Relâchement de Fureur : Frappe dans l\'élément neutre très fort, les dégâts du sort augmentent à chaque tour où il n\'est pas utilisé.',
     'Coût 5 PA ; Portée 1-63 ; Critique 30 % ; sans LdV ; 187 à 202 (crit 237 à 252) ; +25 dégâts de base (∞)'),
    (30612, 'Pulsation Chaotique : Frappe dans l\'élément neutre puis rebondit sur l\'ennemi le plus proche et ainsi de suite jusqu\'à ce que le sort ait tapé tous les ennemis. Chaque ennemi subit plus de dégâts que le précédent.',
     'Coût 5 PA ; Portée 1-63 ; sans LdV ; 35 à 42 ; +20 dégâts de base (1 tour)'),
    (30602, 'Punition Collective : Frappe tous les ennemis dans l\'élément neutre.',
     'Coût 5 PA ; Portée 0 ; 94 à 106'),
    (30615, 'Pense Vite : Au prochain tour, le lanceur gagne 999PA pour un tour mais n\'a que 15 secondes pour les utiliser. NOTE : Ce sort peut également être obtenu par le Magicien et l\'Acrobate.',
     'Coût 5 PA ; Portée 0 ; Durée du prochain tour : 15 secondes (1 tour) ; PA (dans 1 tour) +999'),
]

VIDEO_EVIDENCE = [
    {'observed': 12078, 'where': f'{VOD} combat 1 (t≈2 954 s, image 480p s295_05), T1, tour du Dompteur (compo 2 Acrobates + Dompteur + Magicien)',
     'interpretation': 'Grondement Grandissant CRITIQUE, jet 99, cible Vulnérable : int(99×61)=6039, ×2 = 12 078 (exact)',
     'rejects': 'Impact (max ×61 = 10 858) ; toute hypothèse ×91 (Puissance +3000) : aucun jet entier ne donne 12 078'},
    {'observed': 12688, 'where': f'{VOD} combat 3 (t≈7 238 s, image s723_09), T1',
     'interpretation': 'Grondement Grandissant CRITIQUE, jet 104, cible Vulnérable : 104×61 = 6344, ×2 = 12 688 (exact)',
     'rejects': 'Impact et ×91'},
    {'observed': 5124, 'where': f'{VOD} combat 3 (t≈7 285 s, image s728_06), cible hors pics',
     'interpretation': '84×61 = 5124 : Grondement Grandissant (jet 84) ou Impact critique (jet 84)',
     'rejects': '×91 (5124/91 non entier, aucune dégressivité ne convient)'},
    {'observed': 5185, 'where': f'{VOD} combat 3 (t≈7 287 s, image s728_08), cible hors pics',
     'interpretation': '85×61 = 5185 : Impact critique (jet 85) ou Grondement Grandissant (jet 85)',
     'rejects': '×91'},
    {'observed': '3 239 – 3 458 (3 952 – 4 227)', 'where': f'{VOD} combat 1 (image s289_03), aperçu d\'infobulle',
     'interpretation': 'Aperçu client d\'un Videur (Acrobate) sur une cible à 1 case du centre : 59-63 ×61 ×0,9 (crit 72-77) — confirme ×61 sans Puissance pour un archétype',
     'rejects': 'Puissance +3000 / +5000 Vitalité conditionnelles du passif 30639 (non appliquées)'},
]


# Résumé « moteur » (effets RÉELS, dans l'ordre) — FAIT vérifié sauf mention
SUMMARY = {
    30416: 'Repousse la cible de 2 cases (alliés ou ennemis), PUIS 16-20 neutre (crit 21-25) aux ennemis / invocations alliées. Collision : 283 par case restante.',
    30395: 'Un seul coup de 68-74 (crit 82-89) neutre à chaque ennemi (et invocation alliée) du cercle C2 ; dégressivité 10 %/case ; case ciblée libre autorisée. L\'effet masque « A » est l\'infobulle (forClientOnly).',
    30396: '82-92 (crit 98-110) neutre dans une croix X1 ; pose sur le lanceur un buff +20 dégâts de base au sort, DÉLAI 2 tours, durée 1 ⇒ actif au 2e tour après le lancer, le tour où l\'intervalle (2) permet de le relancer.',
    30397: 'Érosion +15 % (2 tours, cumul 3) puis vol de vie 42-50 sur la case ciblée ; en critique : érosion + vol 50-60 dans un cercle C2 (case vide possible). Sans ligne de vue.',
    30398: 'Pour chaque ennemi / invocation alliée du rectangle R1,1 (3×2) : +5 dégâts de base au sort (durée 1) ; PUIS 38-42 (crit 46-50) à tous ; lancer en ligne.',
    30399: 'Dommages neutres = 20 % des PV COURANTS du lanceur à chaque ennemi du cercle C2 (sans dégressivité, non boostable) ; PUIS le lanceur perd 10 % de ses PV courants (effet 1048, durée -1).',
    30400: 'Dommages = 40 % des PV érodés du lanceur à chaque ennemi du carré G1 (3×3), non boostable, sans dégressivité.',
    30401: 'Dommages neutres = 30 % des PV érodés de CHAQUE cible, fourche F2 (10 cases) orientée depuis le lanceur ; lancer en ligne ; non boostable.',
    30603: '+4 PA à tous les alliés (lanceur compris), 2 tours ; puis le sort est désappris.',
    30614: 'Exécute 30627 sur soi : seuil 1 PV (1 tour) + déclencheur « tue une entité » → 30628 → au début du tour suivant ré-exécute 30627 (chaîne tant qu\'on tue) ; état Endolori permanent ; désapprend le sort.',
    30613: 'Tous les ennemis (hors Mama pré-combat) : buff 1 tour « quand je subis des dommages (D) ou meurs (XD) : j\'exécute 30670 » = 50 % des dommages finaux subis infligés à mes alliés dans un cercle C2 (sans dégressivité) ; état 5979 1 tour ; désapprend le sort.',
    30611: '187-202 (crit 237-252) neutre sur l\'ennemi ciblé, PO 1-63 sans LdV ; les +25 dégâts de base viennent du buff 30624 (4 débuts de tour) ; désapprend le sort.',
    30612: 'Retire Marqué/Target à tous ; exécute 30667 sur la cible : Marqué 1 tour, choix du prochain ennemi non marqué le plus proche (Target), 35-42 neutre, +20 dégâts de base (1 tour) à 30667, rebond (30667 niv.5 → niv.1 sur Target) ; en fin de chaîne retire les +20 ; désapprend le sort.',
    30602: '94-106 neutre à tous les ennemis de la carte (hors Mama pré-combat), sans dégressivité ni critique ; désapprend le sort.',
    30615: 'Durée du prochain tour 10 s ; +999 PA (délai 1, durée 1) ; fin du tour suivant : retire ses effets ; désapprend le sort.',
}

PICS = {
    30416: {'canPutEnemyInPics': True, 'mechanism': 'seul déplacement du Dompteur : 2 cases depuis le lanceur ; la poussée s\'exécute avant les dommages ⇒ Trooll poussé dans les pics : 2000 (entrée) + dommages ×2 (relevé Acrobate 9 904 = 2000 + 2×3952 : Vulnérable appliqué dans le même sort).', 'confidence': 'haute'},
    30395: {'canPutEnemyInPics': False, 'mechanism': 'frappe ×2 les Troolls Vulnérables ; zone C2 idéale sur l\'anneau de pics où l\'Acrobate regroupe les Troolls.', 'confidence': 'haute'},
    30396: {'canPutEnemyInPics': False, 'mechanism': 'plus gros coup de base du Dompteur ; ×2 sur Vulnérable (relevés 12 078 / 12 688).', 'confidence': 'haute'},
    30397: {'canPutEnemyInPics': False, 'mechanism': '×2 sur Vulnérable (vol de vie doublé aussi, le soin suit les PV réellement retirés).', 'confidence': 'haute'},
    30398: {'canPutEnemyInPics': False, 'mechanism': '×2 sur Vulnérable ; rentable sur un paquet de Troolls alignés au bord.', 'confidence': 'haute'},
    30399: {'canPutEnemyInPics': False, 'mechanism': 'dommages non boostables mais ×2 sur Vulnérable (1163 s\'applique à tous les dommages hors poussée) : 12 000 par Trooll dans les pics à PV pleins.', 'confidence': 'haute'},
    30400: {'canPutEnemyInPics': False, 'mechanism': '×2 sur Vulnérable.', 'confidence': 'haute'},
    30401: {'canPutEnemyInPics': False, 'mechanism': '×2 sur Vulnérable ; finisher sur Mama érodée dans les pics.', 'confidence': 'haute'},
    30603: {'canPutEnemyInPics': False, 'mechanism': 'indirect : +4 PA pour l\'Acrobate = une poussée de plus.', 'confidence': 'haute'},
    30614: {'canPutEnemyInPics': False, 'mechanism': 'survie si Mama (T8) ou un Trooll pousse le Dompteur dans les pics (2000 + ×2 selon DPLN/vidéos).', 'confidence': 'moyenne'},
    30613: {'canPutEnemyInPics': False, 'mechanism': 'l\'entrée dans les pics (2000, déclencheur D) déclenche aussi le renvoi : 1000 aux voisins (2000 s\'ils sont Vulnérables).', 'confidence': 'moyenne'},
    30611: {'canPutEnemyInPics': False, 'mechanism': 'réservé à Mama Vulnérable (poussée dans les pics par l\'Acrobate, Voltige si elle est Inébranlable).', 'confidence': 'haute'},
    30612: {'canPutEnemyInPics': False, 'mechanism': 'chaque rebond ×2 sur les Troolls Vulnérables : tous dans les pics avant de lancer.', 'confidence': 'haute'},
    30602: {'canPutEnemyInPics': False, 'mechanism': 'après Dégagez ! (Acrobate, tous les monstres repoussés de 5 vers les bords) : 11 468-12 932 par Trooll.', 'confidence': 'haute'},
    30615: {'canPutEnemyInPics': False, 'mechanism': 'indirect.', 'confidence': 'haute'},
}

NOTES = {
    30416: [
        'FAIT (données) : effet 5 (poussée 2) masque a,A AVANT l\'effet 100 masque j,A ⇒ peut pousser un allié (sans le blesser) pour le sortir d\'une ligne dangereuse.',
        'Tactique (cardxc 14:00) : les Troolls déjà adjacents aux pics peuvent être poussés par les DPS avec Frappe Repoussoir.',
        'Commun aux 3 archétypes, pas d\'amélioration (DPLN).',
    ],
    30395: [
        'FAIT : deux effets de dommages identiques, l\'un forClientOnly (infobulle, masque A), l\'autre réel (masque A,j) ⇒ un seul coup par cible.',
        'FAIT : case ciblée libre autorisée, LdV requise, PO 1-5 modifiable (Acclamation optique +1) : viser la case qui maximise le nombre de Troolls Vulnérables dans le cercle.',
        'FAIT : ne touche jamais les alliés joueurs (masques A,j) ; touche le Poutch allié (j) ⇒ déclenche le renvoi « Stratège Dompteur » (voir synergies).',
        '2 lancers/tour (3 amélioré) : 8 PA = 2 Impacts ; DPLN « environ 4 500 » = 4 148-4 514 (×61).',
        'Amélioration : cercle C3 (25 cases) et 3/tour ; dégressivité jusqu\'à -30 % à 3 cases.',
    ],
    30396: [
        'Rythme optimal : relancer exactement tous les 2 tours (T, T+2, T+4…) : 6 222-6 832 (crit 7 198-7 930) au lieu de 5 002-5 612 ; DPLN « environ 6 200 » = valeur avec bonus.',
        'FAIT : 3793 (valeur 29045/29046) = script visuel, sans effet de jeu.',
        'Relevés VOD : 12 078 et 12 688 = coups critiques sur Trooll Vulnérable (jets 99 et 104 ×61 ×2).',
        'HYPOTHÈSE (moyenne) : la version améliorée retire le bonus (406 en ordre 0) avant de frapper ; elle gagne la croix X3 (13 cases) mais perd le +20.',
    ],
    30397: [
        'FAIT : pas de ligne de vue, case vide possible ; en critique (40 % de base) le vol de vie et l\'érosion passent en cercle C2 (C3 amélioré) ⇒ « tir à l\'aveugle » au milieu d\'un paquet (cardxc 13:30, Zephiron 27:00, Khytrayer 06:32-09:44).',
        'FAIT : 3/tour et 2/cible (4 et 3 amélioré) ; 3 PA ; érosion +15 % durée 2 (tours du lanceur), cumul 3 ⇒ érosion de la cible jusqu\'à 50 % (plafond de la formule).',
        'Soin du lanceur = 50 % des PV retirés : 1 281-1 525 par coup (2 562-3 050 sur Vulnérable) — seul soin propre du Dompteur (Khytrayer 11:21).',
        'Prépare Ombre Fracassante et l\'érosion de Mama au T8 (Huz 13:20).',
        'Amélioré : érosion 20 % PERMANENTE (durée -1) et cumul illimité (non annoncé).',
    ],
    30398: [
        'FAIT : lancer en ligne uniquement ; rectangle orienté (largeur 2r+1 perpendiculaire à l\'axe du lancer, profondeur 2 : case ciblée + 1 derrière).',
        'FAIT : +5 dégâts de base par ennemi (ou invocation alliée) dans la zone, appliqués AVANT les dommages (sous-sort 30417 / 30691) ; l\'infobulle affiche « +10 ».',
        'Rentable seulement sur ≥ 4 cibles ; 1/tour.',
    ],
    30399: [
        'FAIT : 20 % des PV courants du lanceur, NON boostable (ni Force, ni dommages finaux, ni critique : 0 %) mais ×2 sur Vulnérable ⇒ 6 000 / 12 000 par cible à 30 000 PV.',
        'FAIT (client) : le coût « -10 % PV » (1048, durée -1) est un buff « lifePointsMalus » qui réduit les PV COURANTS (pas les PV max) : soignable, ignore le bouclier, pas doublé par Vulnérable ; il ne nourrit PAS Jaillissement (pas d\'érosion, sauf 10 % d\'érosion éventuelle — HYPOTHÈSE).',
        'À lancer PV pleins, en début de combat (ne profite pas des bonus de dommages finaux / critique accumulés ensuite).',
        'Amélioré : C3 mais dégressivité 10 %/case ajoutée (non annoncée).',
    ],
    30400: [
        'FAIT : 40 % des PV érodés du lanceur ; érosion de base 10 % ⇒ environ 4 % des PV perdus cumulés (ex. 50 000 PV perdus ⇒ 5 000 érodés ⇒ 2 000, 4 000 sur Vulnérable).',
        '5 PA, intervalle 3 : sort de fin de combat, rarement prioritaire (Koza : les derniers sorts « pas trop forts »).',
        'Amélioré : carré G2 (25 cases) avec dégressivité 10 %/case ; ATTENTION : 30475 pointe vers un niveau de sort inexistant (80750).',
    ],
    30401: [
        'FAIT : 30 % des PV érodés de chaque cible ; fourche F2 (10 cases) orientée dans l\'axe du lancer ; en ligne ; 2 PA ; intervalle 1.',
        'Finisher : après Prélèvement (érosion 50 %) et les gros coups ; sur Mama au T8 en dernier (Huz 18:00).',
        'Amélioré : F3 (13 cases) avec dégressivité selon la distance projetée.',
    ],
    30603: [
        'FAIT : +4 PA (111) aux alliés (masque a, zone toute la carte), durée 2 (décompte au début des tours du lanceur) ⇒ chaque allié en profite sur ses 2 prochains tours : ceux qui jouent APRÈS le lanceur aux tours T et T+1, ceux qui jouent AVANT lui aux tours T+1 et T+2, le lanceur au tour T (reste) et T+1.',
        'Coût 5 PA : lanceur net -1 PA le tour du lancer (les PA d\'un buff 111 sont crédités immédiatement : StatBuff client, actionPointsCurrent += delta — FAIT client, confiance moyenne côté serveur).',
        'Cumulable (Koza 16:00 : 3 Galvanisations ⇒ 22 PA) ; idéal au T7 pour le burst du T8.',
    ],
    30614: [
        'FAIT : seuil 1 PV jusqu\'au début du prochain tour du lanceur ; si le lanceur tue une entité pendant ce temps (déclencheur K), le seuil est reposé au début de son tour suivant (chaîne).',
        'À lancer au T7 pour survivre à l\'arrivée de Mama (Huz : Dompteur tué d\'un coup à -20 000).',
        'FAIT : pose l\'état « Endolori » (5967) permanent, aussi posé par les Immortalités de l\'Acrobate et du Magicien : rôle non documenté (HYPOTHÈSE : exclusion des propositions).',
    ],
    30613: [
        'FAIT : buff 1 tour sur tous les ennemis ; déclencheurs D (dommages hors poussée) et XD (mort) ; renvoi = 50 % des dommages FINAUX subis, non boostable, sans dégressivité, aux alliés du porteur à ≤ 2 cases.',
        'La capture DPLN affiche « Renvoie 100 % » : les données actuelles (et la description) disent 50 %.',
        'HYPOTHÈSE : les renvois sont eux-mêmes des dommages et déclenchent le buff des Troolls touchés (chaîne) ; un Trooll Vulnérable renvoie alors 50 % de ×2 = 100 % du coup initial à ses voisins Vulnérables.',
        'À lancer AVANT les frappes de zone de l\'équipe sur un paquet ; la durée 1 couvre les coéquipiers qui jouent après, et ceux qui jouent avant le Dompteur au tour suivant.',
    ],
    30611: [
        'FAIT : 30 % de critique (40 % effectif), PO 1-63 sans LdV, cible unique, pas de dégressivité.',
        'FAIT : montée +25 dégâts de base au début de 4 tours (30624) ⇒ l\'obtenir au plus tard au T4 pour le +100 au T8 (cardxc 20:00 : « plus vous l\'avez tôt, mieux c\'est »).',
        'Mama Vulnérable, +100, sans autre bonus : 35 014-36 844 (crit 41 114-42 944) ; avec +40 % de dommages finaux : 49 018-51 580 (crit 57 558-60 120) ⇒ 2 Relâchements (2 Dompteurs) ≈ 100-120 k (vidéos : « plus de la moitié de ses PV », « plus de 100 000 »).',
    ],
    30612: [
        'FAIT : la cible doit être un ennemi (effets sur la case ciblée seulement) ; rebond vers l\'ennemi NON marqué le plus proche de la dernière cible ; +20 dégâts de base par cible déjà touchée ; chaque ennemi touché une fois.',
        'k-ième cible : (35-42 + 20×(k−1)) ×61 ; 6 ennemis Vulnérables ≈ 64 800 au total (moyenne), 10 ≈ 156 800.',
        'Tactique (cardxc 23:00) : commencer par le Trooll le plus faible / à une extrémité du paquet ⇒ les rebonds les plus forts tombent sur les plus gros PV ; tous dans les pics.',
        'Pas de critique (0 %). HYPOTHÈSE : les rebonds ignorent la PO (1-5) et la LdV du sous-sort 30667 (exécution par 2160).',
    ],
    30602: [
        'FAIT : zone « a » (toute la carte, rayon 63 ⇒ aucune dégressivité), pas de critique.',
        'Nettoyage V9-V10 après Dégagez ! (Acrobate) ; mettre les Troolls à mi-vie avant (cardxc 22:00) ; Khytrayer 11:35 / Koza 22:30.',
    ],
    30615: [
        'Sort unique commun aux 3 archétypes (type 3872).',
        'FAIT : 10 s au tour suivant (DPLN : 15 s) ; les plafonds de lancers par tour / intervalles restent ⇒ ~3 sorts utiles (vidéos) ; à lancer au T7 sur un Dompteur (Zephiron 20:30, Huz 14:22).',
    ],
}


def spell_meta(sid: int) -> dict:
    s = SPELLS[str(sid)]
    return {'name': s['name']['fr'], 'adminName': s.get('adminName'), 'typeId': s['typeId'],
            'description': (s.get('description') or {}).get('fr') if isinstance(s.get('description'), dict) else None,
            'icon': s.get('img'), 'source': f'{API}/spells/{sid}'}


def level_ids(sid: int) -> List[int]:
    return SPELLS[str(sid)]['spellLevels']


# ------------------------------------------------------------------------------------------------
# Construction des sorts
# ------------------------------------------------------------------------------------------------

def expected_for_classic(sid: int, lv: dict, upgraded: bool) -> dict:
    """Dégâts attendus selon le sort (fonctions ad hoc pour les effets non standard)."""
    eff = [e for e in lv['effects'] if e['real']]
    crit = [e for e in lv['critEffects'] if e['real']]
    dmg = [e for e in eff if e['effectId'] in (100, 95)]
    cdmg = [e for e in crit if e['effectId'] in (100, 95)]
    p = lv['criticalHitProbability']
    if sid in (30416,):
        e, c = dmg[0], cdmg[0]
        blk = dmg_block(e['min'], e['max'], c['min'], c['max'], 100, crit_pct=p, aoe=False)
        blk['pushCollision'] = {'formula': 'int(reste × (floor(200/2) + 32 + 1000) / 4) = 283 par case de poussée restante (non doublé par Vulnérable)',
                                'perRemainingCell': 283, 'maxForThisSpell': 566}
        return blk
    if sid in (30395, 30558):
        e, c = dmg[0], cdmg[0]
        z = e['zone']
        return dmg_block(e['min'], e['max'], c['min'], c['max'], 100, crit_pct=p, deg=z['degressionPercent'],
                         ticks=z['maxDegressionTicks'], dists=tuple(range(0, z['radius'] + 1)))
    if sid in (30396, 30560):
        e, c = dmg[0], cdmg[0]
        z = e['zone']
        blk = dmg_block(e['min'], e['max'], c['min'], c['max'], 100, crit_pct=p, deg=z['degressionPercent'],
                        ticks=z['maxDegressionTicks'], dists=tuple(range(0, z['radius'] + 1)))
        b = dmg_block(e['min'], e['max'], c['min'], c['max'], 100, crit_pct=p, deg=z['degressionPercent'],
                      ticks=z['maxDegressionTicks'], dists=(0,), base_bonus=20)
        blk['withRecastBonus20'] = {
            'note': ('relance exactement 2 tours après (bonus +20 actif 1 tour) ; VERSION AMÉLIORÉE : l\'effet 406 '
                     '(ordre 0) retire ce bonus AVANT les dommages ⇒ bonus probablement perdu (HYPOTHÈSE moyenne)')
            if upgraded else 'relance exactement 2 tours après le lancer précédent (bonus +20 actif pendant ce tour)',
            'center': b['byDistance'][0]}
        return blk
    if sid in (30397, 30561):
        e, c = dmg[0], cdmg[0]
        cz = c['zone']
        blk = dmg_block(e['min'], e['max'], c['min'], c['max'], 95, crit_pct=p, aoe=False)
        crit_rows = []
        for d in range(0, cz['radius'] + 1):
            ef = eff_of(d, cz['degressionPercent'], cz['maxDegressionTicks'])
            crit_rows.append({'distanceFromCenter': d, 'aoeCoef': ef,
                              'normal': rng(c['min'], c['max'], 95, eff=ef, critical=True),
                              'vulnerable': rng(c['min'], c['max'], 95, eff=ef, critical=True, vuln=True)})
        blk['critZone'] = {'zone': cz['raw'], 'byDistance': crit_rows,
                           'note': 'en coup critique, l\'érosion et le vol de vie s\'appliquent à tous les ennemis du cercle (même si la case ciblée est vide)'}
        ero = [x for x in eff if x['effectId'] == 776][0]
        blk['erosion'] = {'value': ero['diceNum'], 'duration': ero['duration'], 'maxStack': lv['maxStack'],
                          'note': 'stat 75 de la cible (base 10 %) ; érosion totale plafonnée à 50 % par la formule'}
        blk['lifeSteal'] = 'soin du lanceur = int(PV réellement retirés × 0,5), plafonné à ses PV manquants'
        return blk
    if sid in (30398, 30562):
        e, c = dmg[0], cdmg[0]
        z = e['zone']
        ncells = z['cellCount']
        rows = []
        for n in range(1, ncells + 1):
            nb = rng(e['min'], e['max'], 100, base_bonus=5 * n)
            cb = rng(c['min'], c['max'], 100, base_bonus=5 * n, critical=True)
            nv = rng(e['min'], e['max'], 100, base_bonus=5 * n, vuln=True)
            cv = rng(c['min'], c['max'], 100, base_bonus=5 * n, critical=True, vuln=True)
            pp = D.critical_chance(p, P_CRIT_BASE)
            rows.append({'enemiesInZone': n, 'baseBonus': 5 * n, 'normal': {'hit': nb, 'crit': cb, 'expected': expected(nb, cb, pp)},
                         'vulnerable': {'hit': nv, 'crit': cv, 'expected': expected(nv, cv, pp)},
                         'otherCellsCoef': 'Chebyshev : 0,9 à 1 case de la case ciblée (rangée arrière ET côtés), 0,8 à 2 cases (extrémités du 5×2)'})
        return {'formula': 'bonus de base = +5 par ennemi (et invocation alliée) dans la zone (sous-sort 30417/30691 exécuté sur chaque cible AVANT les dommages) ; '
                           'dégressivité R : distance de Chebyshev ⇒ seule la case ciblée est à 100 %, les autres à 90 % (80 % aux extrémités du 5×2) ; tableau = case ciblée',
                'critChance': D.critical_chance(p, P_CRIT_BASE), 'byEnemyCount': rows}
    if sid in (30399, 30563):
        z = [x for x in eff if x['effectId'] == 89][0]['zone']
        rows = []
        for hp in (30000, 25000, 20000, 15000, 10000, 5000):
            d0 = hit(20, 89, caster_hp=hp)
            rows.append({'casterHp': hp, 'center': d0, 'centerVulnerable': hit(20, 89, caster_hp=hp, vuln=True),
                         'ring1': hit(20, 89, caster_hp=hp, eff=eff_of(1, z['degressionPercent'], z['maxDegressionTicks'])),
                         'ring2': hit(20, 89, caster_hp=hp, eff=eff_of(2, z['degressionPercent'], z['maxDegressionTicks'])),
                         'ring3': hit(20, 89, caster_hp=hp, eff=eff_of(3, z['degressionPercent'], z['maxDegressionTicks'])) if z['radius'] >= 3 else None,
                         'selfCost': int(hp * 10 * 0.01)})
        return {'formula': 'int(20 × PV_courants_lanceur / 100) — NON boostable (ni Force, ni Puissance, ni dommages finaux, ni critique) ; '
                           'Vulnérable ×2 ; coût : -10 % des PV COURANTS du lanceur (effet 1048 « faux dommage » : ignore bouclier et Vulnérable, soignable)',
                'degression': f"{z['degressionPercent']} % × {z['maxDegressionTicks']}",
                'byCasterHp': rows}
    if sid in (30400, 30564):
        z = eff[0]['zone']
        rows = []
        for er in (1000, 2000, 3000, 5000, 8000, 12000):
            rows.append({'casterErodedHp': er, 'center': hit(40, 1118, caster_eroded=er),
                         'centerVulnerable': hit(40, 1118, caster_eroded=er, vuln=True),
                         'ring1': hit(40, 1118, caster_eroded=er, eff=eff_of(1, z['degressionPercent'], z['maxDegressionTicks'])),
                         'ring2': hit(40, 1118, caster_eroded=er, eff=eff_of(2, z['degressionPercent'], z['maxDegressionTicks'])) if z['radius'] >= 2 else None})
        return {'formula': 'int(40 × PV_érodés_lanceur / 100) — non boostable ; PV érodés ≈ 10 % (érosion de base) des PV perdus par le Dompteur depuis le début du combat',
                'degression': f"{z['degressionPercent']} % × {z['maxDegressionTicks']}", 'byCasterErodedHp': rows}
    if sid in (30401, 30565):
        rows = []
        for er in (1000, 2500, 5000, 10000, 20000, 50000, 75000):
            rows.append({'targetErodedHp': er, 'hit': hit(30, 1092, target_eroded=er),
                         'vulnerable': hit(30, 1092, target_eroded=er, vuln=True)})
        return {'formula': 'int(30 × PV_érodés_cible / 100) — non boostable ; Vulnérable ×2 ; érosion de la cible = floor(PV perdus × min(érosion%, 50)/100)',
                'byTargetErodedHp': rows,
                'note': 'Troollibre 25 000 PV à 50 % d\'érosion ayant perdu 20 000 PV ⇒ 10 000 érodés ⇒ 3 000 (6 000 Vulnérable). Mama (150 000 PV) ⇒ jusqu\'à 22 500 (45 000 Vulnérable) si 75 000 PV érodés.'}
    return {}


def build_classic(entry) -> dict:
    sid, up_id, choice_id, order, unlocked_by, dpln_text, dpln_up, capture = entry
    meta = spell_meta(sid)
    lids = level_ids(sid)
    normal = level_obj(lids[0])
    normal['expectedDamage'] = expected_for_classic(sid, normal, False)
    upgraded = None
    choice = None
    if up_id:
        upgraded = level_obj(level_ids(up_id)[0])
        upgraded['expectedDamage'] = expected_for_classic(up_id, upgraded, True)
        cm = spell_meta(choice_id)
        cl = LEVELS[str(level_ids(choice_id)[0])]
        learn = [e for e in cl['effects'] if e['effectId'] == 3405][0]['value']
        unlearn = [e for e in cl['effects'] if e['effectId'] == 3406][0]['value']
        state = [e for e in cl['effects'] if e['effectId'] == 950][0]['value']
        choice = {'spellId': choice_id, 'name': cm['name'], 'description': cm['description'],
                  'unlearnsSpellLevel': unlearn, 'learnsSpellLevel': learn,
                  'learnsSpellLevelExists': str(learn) in LEVELS,
                  'setsState': {'id': state, 'name': state_name(state), 'duration': -1},
                  'source': f'{API}/spells/{choice_id}'}
    imgs = DPLN_IMG.get(sid, ())
    return {
        'id': sid, 'upgradedId': up_id, 'upgradeChoiceSpellId': choice_id,
        'name': meta['name'], 'adminName': meta['adminName'], 'typeId': meta['typeId'],
        'category': 'commun' if sid == 30416 else 'classique',
        'unlockOrder': order, 'unlockedBy': unlocked_by, 'unique': False, 'sharedWithOtherArchetypes': sid == 30416,
        'description': meta['description'], 'icon': meta['icon'],
        'dpln': {'text': dpln_text, 'upgradeTable': dpln_up, 'tooltipCapture': capture,
                 'images': [IMG + i for i in imgs], 'source': DPLN},
        'upgradeChoice': choice,
        'levels': {'normal': normal, 'upgraded': upgraded},
        'effects': normal['effects'], 'critEffects': normal['critEffects'],
        'realEffectsSummary': SUMMARY.get(sid), 'pics': PICS.get(sid), 'notes': NOTES.get(sid, []),
        'sources': [meta['source'], normal['source']] + ([f'{API}/spells/{up_id}', upgraded['source']] if up_id else []),
    }


def build_unique(entry) -> dict:
    sid, dpln_text, capture = entry
    meta = spell_meta(sid)
    lv = level_obj(level_ids(sid)[0])
    ed: dict = {}
    if sid == 30602:
        n = rng(94, 106, 100)
        v = rng(94, 106, 100, vuln=True)
        ed = {'perTarget': {'normal': n, 'vulnerable': v}, 'critChance': 0,
              'note': 'zone « a » (toute la carte, rayon 63 > 50 ⇒ aucune dégressivité) ; tous les ennemis sauf Mama tant qu\'elle a l\'état 5971 (pré-combat)'}
    elif sid == 30611:
        rows = []
        for b in (0, 25, 50, 75, 100):
            nn = rng(187, 202, 100, base_bonus=b)
            cc = rng(237, 252, 100, base_bonus=b, critical=True)
            nv = rng(187, 202, 100, base_bonus=b, vuln=True)
            cv = rng(237, 252, 100, base_bonus=b, critical=True, vuln=True)
            rows.append({'turnsHeld': b // 25, 'baseBonus': b, 'normal': {'hit': nn, 'crit': cc, 'expected': expected(nn, cc, 40)},
                         'vulnerable': {'hit': nv, 'crit': cv, 'expected': expected(nv, cv, 40)}})
        mama = []
        for fd in (100, 120, 140, 160):
            mama.append({'finalDamagePercent': fd,
                         'vulnerable+100': {'hit': rng(187, 202, 100, base_bonus=100, vuln=True, final=fd),
                                            'crit': rng(237, 252, 100, base_bonus=100, vuln=True, final=fd, critical=True)}})
        ed = {'byBonus': rows, 'critChance': 40, 'onMamaWithFinalDamage': mama,
              'note': 'bonus de base : +25 par début de tour pendant 4 tours après l\'obtention (sous-sort 30624) ⇒ +100 max ; coup unique, cible unique'}
    elif sid == 30612:
        rows = []
        tot_n = tot_v = 0
        for k in range(1, 11):
            b = 20 * (k - 1)
            n = rng(35, 42, 100, base_bonus=b)
            v = rng(35, 42, 100, base_bonus=b, vuln=True)
            tot_n += n['mean']
            tot_v += v['mean']
            rows.append({'hitIndex': k, 'baseBonus': b, 'normal': n, 'vulnerable': v,
                         'cumulativeMeanNormal': round(tot_n, 1), 'cumulativeMeanVulnerable': round(tot_v, 1)})
        ed = {'byHit': rows, 'critChance': 0,
              'note': 'k-ième cible : (35..42 + 20×(k−1)) ×61 ; pas de critique ; chaque ennemi touché au plus une fois (état Marqué)'}
    elif sid == 30613:
        ed = {'splash': '50 % des dommages FINAUX subis par le porteur (après Vulnérable), non boostable, sans dégressivité (0 %×0), vers ses alliés dans un cercle de rayon 2',
              'example': 'Trooll A Vulnérable frappé pour 9 000 ⇒ chaque Trooll à ≤ 2 cases de A reçoit 4 500 (9 000 s\'il est lui-même Vulnérable) ; '
                         'chaîne possible de proche en proche (HYPOTHÈSE)'}
    elif sid == 30603:
        ed = {'apBonus': 4, 'duration': 2, 'targets': 'tous les alliés (lanceur compris), toute la carte'}
    elif sid == 30614:
        ed = {'threshold': '1 PV pendant 1 tour ; renouvelé au début du tour suivant si le lanceur a tué une entité pendant la durée'}
    elif sid == 30615:
        ed = {'apBonus': 999, 'nextTurnSeconds': 10,
              'note': 'plafonds de lancers/tour et intervalles inchangés ; animations ⇒ ~3 sorts en 10-15 s (vidéos)'}
    imgs = DPLN_IMG.get(sid, ())
    lv['expectedDamage'] = ed
    return {
        'id': sid, 'upgradedId': None, 'upgradeChoiceSpellId': None,
        'name': meta['name'], 'adminName': meta['adminName'], 'typeId': meta['typeId'],
        'category': 'unique', 'unlockOrder': None,
        'unlockedBy': 'Glyphe Évènementiel (« cadeau ») : choix entre 2 sorts uniques / améliorations (serveur)',
        'unique': True, 'sharedWithOtherArchetypes': sid == 30615,
        'description': meta['description'], 'icon': meta['icon'],
        'dpln': {'text': dpln_text, 'upgradeTable': None, 'tooltipCapture': capture,
                 'images': [IMG + i for i in imgs], 'source': DPLN},
        'upgradeChoice': None,
        'levels': {'normal': lv, 'upgraded': None},
        'effects': lv['effects'], 'critEffects': lv['critEffects'],
        'realEffectsSummary': SUMMARY.get(sid), 'pics': PICS.get(sid), 'notes': NOTES.get(sid, []),
        'sources': [meta['source'], lv['source']],
    }


SUBSPELLS = [30417, 30691, 30624, 30627, 30628, 30667, 30670, 30665, 30666, 30470, 30739]


def build_subspells() -> dict:
    out = {}
    for sid in SUBSPELLS:
        m = spell_meta(sid)
        out[str(sid)] = {'name': m['name'], 'adminName': m['adminName'], 'typeId': m['typeId'],
                         'description': m['description'], 'source': m['source'],
                         'levels': [level_obj(l) for l in level_ids(sid)]}
    return out


def build_bonuses() -> List[dict]:
    rows = [(30592, 'ap', 'PA'), (30593, 'mp', 'PM'), (30594, 'finalDamagePercent', 'Dommages finaux %'),
            (30632, 'range', 'Portée'), (30633, 'critDamage', 'Dommages critiques'), (30634, 'critPercent', 'Critique %')]
    dpln = {'ap': '1 PA', 'mp': '1 PM', 'finalDamagePercent': '10% Dommages finaux', 'range': '1 Portée',
            'critDamage': '500 Dommages critiques', 'critPercent': '20% Critique'}
    out = []
    for sid, stat, lab in rows:
        m = spell_meta(sid)
        sl = LEVELS[str(level_ids(sid)[0])]
        disp = [e for e in sl['effects'] if e['effectId'] != 792][0]
        real = [e for e in sl['effects'] if e['effectId'] == 792][0]
        rl = SPELLS['30589']['spellLevels'][real['diceSide'] - 1]
        re_ = LEVELS[str(rl)]['effects'][0]
        assert re_['effectId'] == disp['effectId'] and re_['diceNum'] == disp['diceNum']
        out.append({'choiceSpellId': sid, 'name': m['name'], 'adminName': m['adminName'], 'description': m['description'],
                    'stat': stat, 'statLabel': lab, 'value': re_['diceNum'], 'effectId': re_['effectId'],
                    'action': sem(re_['effectId']).get('action_dofus3'), 'duration': re_['duration'],
                    'permanent': re_['duration'] == -1, 'stackable': True,
                    'realEffect': {'spellId': 30589, 'grade': real['diceSide'], 'spellLevelId': rl},
                    'displayEffectClientOnly': bool(disp['forClientOnly']), 'dpln': dpln[stat],
                    'sources': [f'{API}/spells/{sid}', f'{API}/spell-levels/{rl}']})
    return out


def bonus_value_table() -> List[dict]:
    """Valeur marginale d'une acclamation sur Impact (centre, cible Vulnérable) — dégâts moyens attendus."""
    def e_impact(p, final=100, cd=0):
        n = rng(68, 74, 100, vuln=True, final=final)
        c = rng(82, 89, 100, vuln=True, final=final, critical=True, crit_damage=cd)
        return expected(n, c, min(p, 100))
    base = e_impact(40)
    rows = [{'case': 'base (40 % crit)', 'expected': base}]
    rows.append({'case': '+1 Acclamation puissante (+10 % dommages finaux)', 'expected': e_impact(40, final=110)})
    rows.append({'case': '+1 Acclamation chanceuse (+20 % critique ⇒ 60 %)', 'expected': e_impact(60)})
    rows.append({'case': '+1 Acclamation critique (+500 dommages critiques)', 'expected': e_impact(40, cd=500)})
    rows.append({'case': 'Amplification (+20 % finaux, +30 % crit ⇒ 70 %)', 'expected': e_impact(70, final=120)})
    rows.append({'case': 'Amplification + 1 puissante', 'expected': e_impact(70, final=130)})
    rows.append({'case': 'Amplification + 1 chanceuse (90 %)', 'expected': e_impact(90, final=120)})
    rows.append({'case': 'Amplification + 1 critique', 'expected': e_impact(70, final=120, cd=500)})
    return rows


DISCREPANCIES = [
    {'topic': 'Puissance +3000 du passif 30639 (Dompteur)',
     'data': 'spell-level 80897 : effet 138 +3000 Puissance, masque C,*E5899 (état Dompteur évalué sur le lanceur)',
     'dpln': '« Impact : environ 4 500 » (= 68-74 ×61, max 4 514) ; « Grondement : environ 6 200 »',
     'video': '4 relevés VOD 2852548819 (12 078, 12 688, 5 124, 5 185) tous exacts à ×61, aucun compatible ×91',
     'verdict': 'le passif est lancé au début du combat (sort de départ du monstre 7980), AVANT le choix d\'archétype (30608 → 30644 pose l\'état 5899) : le critère *E5899 échoue ⇒ PAS de +3000 Puissance. Simulateur : Puissance 0 (option ×91 conservée pour test).',
     'confidence': 'haute'},
    {'topic': 'Taux de critique affiché',
     'data': 'criticalHitProbability 30 % (Impact, Grondement, Prélèvement, Détonation, Relâchement, Frappe Repoussoir) ; 0 % ailleurs',
     'dpln': 'captures : Impact 30 %, Relâchement 30 %, Grondement 40 %, Prélèvement 40 %, Détonation 70 %',
     'verdict': 'l\'infobulle en combat ajoute la stat Critique du personnage (10 % de base ; +30 % d\'Amplification pour 70 %) ; hors combat / fenêtre de choix : valeur du sort. Taux effectif de base : 40 %.',
     'confidence': 'haute'},
    {'topic': 'Détonation — bonus par ennemi',
     'data': 'effet réel : sous-sort 30417 (+5 dégâts de base, durée 1) exécuté sur chaque cible de la zone avant les dommages ; l\'effet « +10 dégâts de base » est forClientOnly (infobulle)',
     'dpln': 'capture : « Détonation : +10 dégâts de base »',
     'verdict': 'simuler +5 par ennemi (et invocation alliée) présent dans la zone, cible comprise. Le 406 de la version normale vise 30398 (et non 30417) : les +5 restent jusqu\'au début du tour suivant du lanceur, sans conséquence (1 lancer/tour).',
     'confidence': 'moyenne'},
    {'topic': 'Grondement Grandissant amélioré — perte du bonus +20',
     'data': '30560 : effet 406 « Enlève les effets du sort 30560 » en ORDRE 0, avant les dommages (ordre 1) ; client : removeBuffBySpellId retire tous les buffs du sort, sans condition',
     'dpln': 'amélioration « Taille de la croix : 1 case > 3 cases » uniquement',
     'verdict': 'si le serveur applique les effets dans l\'ordre (comme l\'aperçu client), la relance à T+2 retire le +20 AVANT de frapper : la version améliorée ne profite jamais du bonus. HYPOTHÈSE (moyenne) ; paramètre simulateur ggUpgradedKeepsRecastBonus=false par défaut.',
     'confidence': 'moyenne'},
    {'topic': 'Prélèvement amélioré — changements non annoncés',
     'data': '30561 : érosion 20 % durée -1 (permanente) au lieu de 15 % 2 tours ; cumul max (maxStack) -1 au lieu de 3 ; lancers/cible 3 au lieu de 2 ; 4/tour',
     'dpln': 'Érosion 15 % > 20 % ; cercle critique 2 > 3 ; lancers/tour 3 > 4',
     'verdict': 'les données font foi : l\'érosion améliorée est permanente et cumulable (plafond 50 % par la formule d\'érosion).',
     'confidence': 'haute'},
    {'topic': 'Coup de Sang / Jaillissement / Ombre Fracassante améliorés — dégressivité ajoutée',
     'data': 'versions normales : dégressivité 0 %×0 ; versions améliorées (30563 C3, 30564 G2, 30565 F3) : 10 %×4 (valeur par défaut)',
     'dpln': 'seule la taille de zone est annoncée',
     'verdict': 'la zone agrandie s\'accompagne d\'un malus de 10 % par case d\'éloignement (probable oubli de paramétrage, mais les données font foi).',
     'confidence': 'haute (données) / basse (intention)'},
    {'topic': 'Amélioration : Jaillissement — niveau de sort manquant',
     'data': '30475 apprend le spell-level 80750, ABSENT de DofusDB (404) ; le sort amélioré 30564 a le niveau 80760',
     'dpln': 'amélioration listée (carré 1 > 2)',
     'verdict': 'anomalie de données (référence cassée côté client ou niveau serveur uniquement). Simulateur : amélioration → 30564 (80760), à signaler.',
     'confidence': 'moyenne'},
    {'topic': 'Malédiction Collatérale — pourcentage',
     'data': 'effet 1223 50 % (30670 réel et 30613 infobulle) ; description 50 %',
     'dpln': 'capture d\'infobulle : « Renvoie 100% des dommages subis »',
     'verdict': 'capture probablement antérieure à un rééquilibrage ; retenir 50 %.',
     'confidence': 'moyenne'},
    {'topic': 'Relâchement de Fureur — montée en puissance',
     'data': '30624 niv.1 : déclencheur TB, triggerDuration 4 → niv.2 : +25 dégâts de base permanents ; l\'effet 293 de 30611 est forClientOnly',
     'dpln': '« les dégâts du sort augmentent à chaque tour où il n\'est pas utilisé »',
     'verdict': '+25 par début de tour, au plus 4 fois (+100) ; 30624 n\'est lancé par aucun sort des données ⇒ posé par le serveur à l\'obtention (HYPOTHÈSE forte).',
     'confidence': 'moyenne'},
    {'topic': 'Pense Vite — durée du tour',
     'data': '3407 : 10 secondes',
     'dpln': '15 secondes (texte et capture)',
     'verdict': 'rééquilibrage probable (vidéos 3.6 : 10 s).',
     'confidence': 'moyenne'},
    {'topic': 'Impact critique — masque de cible',
     'data': 'effet réel normal : A,j ; effet réel critique : A,J (J majuscule) ; version améliorée : A,j dans les deux cas',
     'verdict': 'probable coquille : en critique, Impact normal ne toucherait pas le Poutch allié (pas de renvoi « Stratège Dompteur »). Sans effet sur les Troolls.',
     'confidence': 'basse'},
    {'topic': 'Vulnérable',
     'data': '1163 « Dommages subis x200% » (déclencheur D)',
     'dpln': '« 200 % de dégâts supplémentaires »',
     'verdict': '×2 (pas ×3) ; confirmé par les relevés 12 078 / 12 688 (jet ×61 ×2).',
     'confidence': 'haute'},
    {'topic': 'Ombre Fracassante — « taille de la fourche »',
     'data': 'F2 → F3 (10 → 13 cases)', 'dpln': '« 4 cases > 5 cases »',
     'verdict': 'cohérent : la « taille » affichée = longueur de la fourche (case ciblée + r+1 cases) = param + 2.',
     'confidence': 'haute'},
]


def build() -> dict:
    classic = [build_classic(e) for e in CLASSIC]
    uniques = [build_unique(e) for e in UNIQUES]
    passive = spell_meta(30644)
    doc = {
        'archetype': {
            'name': 'Dompteur', 'internalName': 'Gladiateur',
            'role': 'Damage dealer (DPLN : 7 sorts de frappe, zones neutres, érosion) ; meilleur archétype à doubler',
            'stateId': 5899, 'stateName': state_name(5899),
            'choiceSpell': {'id': 30644, 'name': passive['name'], 'adminName': passive['adminName'],
                            'typeId': SPELLS['30644']['typeId'],
                            'level': level_obj(level_ids(30644)[0]),
                            'summary': 'appliqué au choix « Devenir Dompteur » (30608 « Choix d\'Archétype », effet 3008 choix 16) : '
                                       'animation 30739, état 5899 « Dompteur » (permanent), apparences 2740-2743'},
            'tooltipHeaderSpell': {'id': 30641, 'name': 'Gladiateur :', 'note': 'en-tête d\'infobulle utilisé par Amplification (30411/30578) pour lister les bonus reçus par un Dompteur'},
            'spellTypes': {'3889': 'Sorts Dompteur', '3901': 'Sorts améliorés Dompteur', '3841': 'Choix améliorations Dompteur',
                           '3873': 'Dompteur (sorts uniques)', '3869': 'Buffs individuels (acclamations)', '3866': 'Dompteur (acclamations, effets réels)',
                           '3844': 'Déclenchés Dompteur', '3885': 'Choix initial Dompteur'},
            'startingSpells': [30416, 30395],
            'unlockSequence': [30396, 30397, 30398, 30399, 30400, 30401],
            'sources': [f'{API}/spells/30644', f'{API}/spells/30626', f'{API}/spells/30608', DPLN],
        },
        'meta': {
            'generatedBy': 'tools/archetypes/build_archetype_dompteur.py',
            'dataSource': 'DofusDB (client DOFUS 3), extraction research/raw/dofusdb (2026-09-28)',
            'conventions': {
                'effects': 'real=true : effet exécuté ; clientOnly=true : effet d\'infobulle uniquement (forClientOnly). Exécuter les effets real dans l\'ordre « order » ; dérouler subSpell pour 1160/792/2160/2792.',
                'zones': f'cellCount calculé avec tools/mechanics/zones.py (case ciblée {TARGET_CELL}, lanceur {CASTER_CELL} à 3 cases sur un axe).',
                'damage': 'tools/mechanics/damage.py : Force 6000 ⇒ ×61 ; Puissance 0 (voir discrepancies[0]) ; troncature à chaque multiplication.',
                'critical': 'taux effectif = taux du sort + 10 % (stat Critique de base) ; sorts à 0 % : jamais de critique.',
                'durations': 'durée n = n tours du LANCEUR du buff (décompte au début de son tour) ; -1 = tout le combat ; delay = tours du lanceur avant activation.',
                'confidence': 'FAIT vérifié = donnée du client ; FAIT rapporté = guide/vidéo ; FAIT observé = relevé vidéo chiffré ; HYPOTHÈSE sinon.',
            },
        },
        'baseStats': {
            'hp': 30000, 'ap': 8, 'mp': 4, 'range': 0, 'strength': 6000, 'power': 0, 'pushDamage': 1000,
            'critPercent': 10, 'critDamage': 0, 'finalDamagePercent': 100, 'resPercent': 0, 'erosionPercent': 10,
            'level': 200, 'element': 'neutre (tous les sorts)', 'damageMultiplier': 61,
            'turnDurationSeconds': 60, 'tackle': 'état 5970 « Gladiatrooler » : ne tacle pas et ne peut pas être taclé',
            'powerVariantIfPassiveApplied': 3000,
            'sources': [
                {'claim': '30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 Dommages de poussée, 10 % Critique', 'source': DPLN, 'type': 'FAIT rapporté', 'confidence': 'haute'},
                {'claim': 'Monstre 7980 « Gladiatroolleur » : niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6000, sort 30416', 'source': f'{API}/monsters/7980', 'type': 'FAIT vérifié', 'confidence': 'haute'},
                {'claim': 'Passif 30639 : +3000 Puissance si état Dompteur (masque C,*E5899) — non appliqué en pratique', 'source': f'{API}/spell-levels/80897', 'type': 'FAIT vérifié (donnée) + FAIT observé (non-application)', 'confidence': 'haute'},
                {'claim': 'Multiplicateur ×61 confirmé par 4 relevés de dégâts du Dompteur', 'source': VOD, 'type': 'FAIT observé', 'confidence': 'haute'},
            ],
        },
        'bonuses': build_bonuses(),
        'bonusMechanism': {
            'offer': 'À chaque début de tour global, 3 des 6 acclamations de l\'archétype sont proposées (fenêtre « Choisis une amélioration permanente ! », combat en pause) ; choix permanent et cumulable.',
            'data': 'Le sort de choix (ex. 30594) porte un effet d\'affichage forClientOnly et exécute (792) le niveau correspondant de 30589 « Acclamations de la foule [Dompteur] » (durée -1). Le tirage des 3 propositions est serveur.',
            'dplnPriority': 'Dommages finaux, Critiques, Dommages Critiques (DPLN) ; vidéos : PA ou PO d\'abord, puis dommages finaux / critique.',
            'marginalValueOnImpact': bonus_value_table(),
            'otherArchetypesAcclamations': {
                'Acrobate (30590 ; cartes 30595-30597, 30635-30637)': ['robuste +10 % résistances', 'repoussante +200 dommages de poussée', 'résistante +10 % résistance mêlée', 'accélérante +1 PA', 'agile +1 PM', 'optique +1 PO'],
                'Magicien (30591 ; cartes 30598-30600, 30629-30631)': ['vitalesque +5000 Vitalité', 'soignante +20 % soins finaux', 'résistante +15 % résistance distance', 'accélérante +1 PA', 'agile +1 PM', 'optique +1 PO'],
                'note': 'non proposées au Dompteur (classification des données : FAIT ; tirage serveur limité aux 6 cartes de l\'archétype : HYPOTHÈSE forte, concordant avec DPLN)'},
        },
        'spells': classic + uniques,
        'subSpells': build_subspells(),
        'states': {str(s): {'name': state_name(s), 'source': f'{API}/spell-states/{s}'}
                   for s in (5899, 5996, 5997, 5998, 5999, 6000, 6001, 6002, 5916, 5966, 5967, 5979, 5971, 5994, 5968, 5970)},
        'synergies': [
            {'with': 'Acrobate — Soutien Stratégique (Poutch « Stratège Dompteur » 7985/7986)',
             'mechanism': 'quand un allié à l\'état Dompteur (5899) frappe le Poutch (masque j de ses sorts), le Poutch inflige 50 % des dommages INITIAUX reçus (1123) aux ennemis à ≤ 2 cases (3 amélioré) ; il ne subit que ×50 % des dommages alliés (1163 DBA).',
             'sources': [f'{API}/spell-levels/80526', f'{API}/spell-levels/80528', 'research/data/archetype_acrobate.json'], 'confidence': 'moyenne'},
            {'with': 'Magicien — Amplification (30411 / 30578)',
             'mechanism': 'sur un Dompteur : +20 % dommages finaux et +30 % critique pendant 3 tours (amélioré : +40 % / +50 %), une fois par cible tant que l\'état Amplifié (4 tours) dure.',
             'sources': [f'{API}/spell-levels/80516', f'{API}/spell-levels/80791'], 'confidence': 'haute'},
            {'with': 'Magicien — Regain Vigoureux',
             'mechanism': '+2 PA / +2 PM (3/3 amélioré) 2 tours : 8 → 10 PA ⇒ Impact ×2 + Ombre Fracassante, ou Impact + Prélèvement ×2, ou GG + Impact + Ombre Fracassante.',
             'sources': [f'{API}/spell-levels/80515'], 'confidence': 'haute'},
            {'with': 'Pics (glyphe 30390)',
             'mechanism': 'toute frappe du Dompteur (boostable ou non, y compris % PV, érosion et renvois) est ×2 sur un Trooll Vulnérable (dans les pics, ou 1 tour après en être sorti) ; les dommages de poussée ne le sont pas.',
             'sources': [f'{API}/spell-levels/80492', f'{API}/spell-levels/81025'], 'confidence': 'haute'},
        ],
        'videoEvidence': VIDEO_EVIDENCE,
        'discrepancies': DISCREPANCIES,
        'simulatorParameters': {
            'power': {'default': 0, 'alternative': 3000},
            'ggUpgradedKeepsRecastBonus': {'default': False, 'alternative': True},
            'malédictionCollatéraleHitsCarrier': {'default': False, 'alternative': True,
                                                  'note': 'masque « a » de 30670 inclut le lanceur dans le client ; description : « sur leurs alliés »'},
            'malédictionCollatéraleChains': {'default': True, 'note': 'les renvois sont des dommages (déclencheur D) : chaque Trooll touché renvoie à son tour 50 % (anti-boucle : un buff ne se redéclenche pas sur un effet qu\'il a produit)'},
            'pulsationChaotiqueBounceRange': {'default': None, 'alternative': 5, 'note': '30667 niv.1 a PO 1-5 et LdV, mais il est exécuté (2160), conditions de lancer a priori ignorées'},
            'penseViteMaxCasts': {'default': 3, 'note': 'limite pratique (animations, 10 s)'},
        },
    }
    return doc


def md_tables(doc: dict) -> str:
    out = []
    by = {s['id']: s for s in doc['spells']}

    def line(cells):
        return '| ' + ' | '.join(str(c) for c in cells) + ' |'

    def rr(x):
        return f"{x['min']}–{x['max']}" if x else '—'
    for sid in (30416, 30395, 30396, 30397, 30398, 30399, 30400, 30401):
        s = by[sid]
        for key in ('normal', 'upgraded'):
            lv = s['levels'][key]
            if not lv:
                continue
            ed = lv.get('expectedDamage') or {}
            out.append(f"\n### {s['name']} ({key}, {lv['spellLevelId']})")
            if 'byDistance' in ed:
                out.append(line(['dist.', 'coef', 'normal', 'crit', 'E (40 %)', 'Vuln. normal', 'Vuln. crit', 'E Vuln.']))
                out.append(line(['---'] * 8))
                for r in ed['byDistance']:
                    n, v = r['normal'], r['vulnerable']
                    out.append(line([r['distanceFromCenter'], r['aoeCoef'], rr(n['hit']), rr(n['crit']), n['expected'],
                                     rr(v['hit']), rr(v['crit']), v['expected']]))
                if 'withRecastBonus20' in ed:
                    r = ed['withRecastBonus20']['center']
                    out.append(line(['+20 (centre)', 1.0, rr(r['normal']['hit']), rr(r['normal']['crit']), r['normal']['expected'],
                                     rr(r['vulnerable']['hit']), rr(r['vulnerable']['crit']), r['vulnerable']['expected']]))
                if 'critZone' in ed:
                    out.append('\nZone critique : ' + ', '.join(f"d{r['distanceFromCenter']} {rr(r['normal'])} (V {rr(r['vulnerable'])})" for r in ed['critZone']['byDistance']))
            if 'byEnemyCount' in ed:
                out.append(line(['ennemis', 'bonus', 'normal', 'crit', 'E', 'Vuln. normal', 'Vuln. crit', 'E Vuln.']))
                out.append(line(['---'] * 8))
                for r in ed['byEnemyCount']:
                    n, v = r['normal'], r['vulnerable']
                    out.append(line([r['enemiesInZone'], r['baseBonus'], rr(n['hit']), rr(n['crit']), n['expected'], rr(v['hit']), rr(v['crit']), v['expected']]))
            if 'byCasterHp' in ed:
                out.append(line(['PV lanceur', 'centre', 'centre Vuln.', 'anneau 1', 'anneau 2', 'anneau 3', 'coût']))
                out.append(line(['---'] * 7))
                for r in ed['byCasterHp']:
                    out.append(line([r['casterHp'], r['center'], r['centerVulnerable'], r['ring1'], r['ring2'], r['ring3'] or '—', r['selfCost']]))
            if 'byCasterErodedHp' in ed:
                out.append(line(['PV érodés lanceur', 'centre', 'centre Vuln.', 'anneau 1', 'anneau 2']))
                out.append(line(['---'] * 5))
                for r in ed['byCasterErodedHp']:
                    out.append(line([r['casterErodedHp'], r['center'], r['centerVulnerable'], r['ring1'], r['ring2'] or '—']))
            if 'byTargetErodedHp' in ed:
                out.append(line(['PV érodés cible', 'dégâts', 'Vuln.']))
                out.append(line(['---'] * 3))
                for r in ed['byTargetErodedHp']:
                    out.append(line([r['targetErodedHp'], r['hit'], r['vulnerable']]))
    for sid in (30611, 30612, 30602):
        s = by[sid]
        ed = s['levels']['normal']['expectedDamage']
        out.append(f"\n### {s['name']}")
        if 'byBonus' in ed:
            out.append(line(['tours détenus', 'bonus', 'normal', 'crit', 'E', 'Vuln. normal', 'Vuln. crit', 'E Vuln.']))
            out.append(line(['---'] * 8))
            for r in ed['byBonus']:
                n, v = r['normal'], r['vulnerable']
                out.append(line([r['turnsHeld'], r['baseBonus'], rr(n['hit']), rr(n['crit']), n['expected'], rr(v['hit']), rr(v['crit']), v['expected']]))
            out.append(line(['dommages finaux', 'Vuln. +100 normal', 'Vuln. +100 crit']))
            out.append(line(['---'] * 3))
            for r in ed['onMamaWithFinalDamage']:
                out.append(line([r['finalDamagePercent'], rr(r['vulnerable+100']['hit']), rr(r['vulnerable+100']['crit'])]))
        if 'byHit' in ed:
            out.append(line(['k-ième cible', 'bonus', 'normal', 'Vuln.', 'cumul moyen', 'cumul moyen Vuln.']))
            out.append(line(['---'] * 6))
            for r in ed['byHit']:
                out.append(line([r['hitIndex'], r['baseBonus'], rr(r['normal']), rr(r['vulnerable']), r['cumulativeMeanNormal'], r['cumulativeMeanVulnerable']]))
        if 'perTarget' in ed:
            out.append(f"par cible : {rr(ed['perTarget']['normal'])} ; Vulnérable {rr(ed['perTarget']['vulnerable'])}")
    out.append('\n### Valeur marginale des acclamations (Impact, centre, Vulnérable, espérance)')
    for r in doc['bonusMechanism']['marginalValueOnImpact']:
        out.append(f"- {r['case']} : {r['expected']}")
    out.append('\n### Zones (repère MapPoint : x vers la droite = bas-droite à l\'écran, y vers le haut = haut-droite ; '
               'O = case ciblée 300, @ = lanceur 257 à 3 cases sur l\'axe x)')
    for raw in ('C2', 'C3', 'X1', 'X3', 'R1,1', 'R2,1', 'G1', 'G2', 'F2', 'F3'):
        z = Z.SpellZone.from_raw(raw)
        cells = z.cells(TARGET_CELL, CASTER_CELL)
        out.append(f'\n{raw} ({len(cells)} cases)\n```\n' + Z.ascii_render(cells, TARGET_CELL, CASTER_CELL, span=4) + '\n```')
    return '\n'.join(out)


def main() -> None:
    doc = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f'écrit : {OUT} ({OUT.stat().st_size} octets, {len(doc["spells"])} sorts)')
    if '--md' in sys.argv:
        print(md_tables(doc))


if __name__ == '__main__':
    main()
