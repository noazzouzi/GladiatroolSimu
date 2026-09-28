#!/usr/bin/env python3
"""Génère research/data/archetype_acrobate.json : fiche normalisée de l'archétype ACROBATE du Gladiatrool
(nom interne « Baroudeur ») pour le simulateur.

Sources :
* données du client DOFUS 3 via DofusDB (research/raw/dofusdb/*.json, extraction du 2026-09-28) = FAIT vérifié ;
* noms d'actions DOFUS 3 (research/data/action_ids_dofus3.json) ;
* formules de dégâts / poussée du moteur (tools/mechanics/damage.py, movement.py, zones.py : portage du client) ;
* guide DPLN https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026) = FAIT rapporté (comparaison).

Usage : python3 tools/archetypes/build_archetype_acrobate.py [--summary]
Stdlib uniquement. Idempotent (hors champ meta.generatedOn).
"""
from __future__ import annotations

import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'mechanics'))
import damage as D  # noqa: E402
import geometry as G  # noqa: E402
import movement as MV  # noqa: E402
import zones as Z  # noqa: E402

RAW = os.path.join(ROOT, 'research', 'raw', 'dofusdb')
OUT = os.path.join(ROOT, 'research', 'data', 'archetype_acrobate.json')
H, M, B = 'haute', 'moyenne', 'basse'
API = 'https://api.dofusdb.fr'
DPLN = 'https://www.dofuspourlesnoobs.com/gladiatrool.html'


def load(name):
    with open(os.path.join(RAW, name), encoding='utf-8') as f:
        return json.load(f)


SPELLS = load('spells.json')
LEVELS = load('spell_levels.json')
STATES = load('spell_states.json')
MONSTERS = load('monsters.json')
CATALOG = load('effects_catalog_fr.json')
with open(os.path.join(ROOT, 'research', 'data', 'action_ids_dofus3.json'), encoding='utf-8') as f:
    ACTIONS = json.load(f)['actionIds']

# ------------------------------------------------------------------------------------------------
# Légendes (masques, déclencheurs)
# ------------------------------------------------------------------------------------------------
MASK_LEGEND = {
    'a': ('alliés du lanceur (lanceur inclus)', M),
    'A': ('ennemis du lanceur', H),
    'g': ('alliés SAUF le lanceur', M),
    'j': ('invocations alliées (ex. le Poutch « Stratège Dompteur ») ; infobulle « (Invoc.) »', M),
    'C': ('le lanceur', H),
    'c': ('le lanceur (variante)', M),
    'O': ("l'auteur de l'événement déclencheur (l'attaquant)", M),
    'E#': ("la cible possède l'état #", H),
    'e#': ("la cible ne possède pas l'état #", H),
    '*E#': ("le LANCEUR possède l'état #", M),
    'F#': ('la cible est le monstre #', H),
    'f#': ("la cible n'est pas le monstre #", H),
}
TRIGGER_LEGEND = {
    'I': ('immédiat', H),
    'D': ('quand le porteur subit des dommages (hors poussée)', H),
    'DBA': ("quand le porteur subit des dommages d'un allié (de son camp)", M),
    'XD': ('à la mort du porteur (variante)', M),
    'X': ('à la mort du porteur', H),
    'TB': ('au début du tour du porteur', H),
    'TE': ('à la fin du tour du porteur', H),
    'PD': ('quand le porteur subit des dommages de poussée', M),
    'XPD': ('quand le porteur meurt de dommages de poussée', M),
}
EXECUTORS = {
    1160: ('CasterExecuteSpell', "le LANCEUR exécute le sous-sort sur chaque cible de l'effet (la cible devient la case ciblée du sous-sort)"),
    792: ('TargetExecuteSpell', "chaque CIBLE de l'effet exécute le sous-sort (ici la cible est souvent le lanceur : masque C)"),
    1018: ('SourceExecuteSpellOnTarget', "la SOURCE de l'événement déclencheur (l'attaquant) exécute le sous-sort sur la cible (le porteur)"),
    1017: ('TargetExecuteSpellOnSource', "la cible (le porteur) exécute le sous-sort sur la SOURCE de l'événement (l'attaquant)"),
    2160: ('CasterExecuteSpellGlobalLimitation', "le lanceur exécute le sous-sort ; value = nombre max d'exécutions par lancer"),
}


def action_name(eid):
    v = ACTIONS.get(str(eid))
    return v[0] if isinstance(v, list) and v else v


def state_name(sid):
    s = STATES.get(str(sid))
    return s['name']['fr'] if s else None


def decode_mask(mask):
    out = []
    for tok in [t for t in mask.split(',') if t]:
        key, arg = tok, None
        star = tok.startswith('*')
        core = tok[1:] if star else tok
        if len(core) > 1 and core[0] in 'EeFf' and core[1:].isdigit():
            key = ('*' if star else '') + core[0] + '#'
            arg = int(core[1:])
        desc, conf = MASK_LEGEND.get(key, ('non documenté', B))
        item = {'token': tok, 'meaning': desc, 'confidence': conf}
        if arg is not None:
            if core[0] in 'Ee':
                item['state'] = {'id': arg, 'name': state_name(arg)}
            else:
                m = MONSTERS.get(str(arg))
                item['monster'] = {'id': arg, 'name': m['name']['fr'] if m else None}
        out.append(item)
    return out


def decode_trigger(trig):
    return [{'token': t, 'meaning': TRIGGER_LEGEND.get(t, ('non documenté', B))[0],
             'confidence': TRIGGER_LEGEND.get(t, ('non documenté', B))[1]} for t in trig.split('|') if t]


REF_CASTER, REF_TARGET = 300, G.xy_to_cell(19, -4)   # lanceur au centre, cible à 2 cases en ligne (+x)


def theoretical_cells(shape, r, rmin):
    """Nombre de cases d'une zone sur une grille non bornée (formes utilisées par l'Acrobate)."""
    if shape == 'P':
        return 1
    if shape in 'X+*':
        arms = 8 if shape == '*' else 4
        return (0 if rmin > 0 else 1) + arms * (r - max(rmin - 1, 0))
    if shape == 'C':
        full = 1 + 2 * r * (r + 1)
        inner = 1 + 2 * (rmin - 1) * rmin if rmin > 0 else 0
        return full - inner
    if shape in 'T-':
        return 2 * r + 1
    if shape == 'F':
        return 1 + 3 * (r + 1)
    return None


def zone_info(zd):
    z = Z.SpellZone.from_zone_descr(zd)
    shape = z.shape
    info = {'raw': f"{shape}{zd['param1']}" + (f",{zd['param2']}" if zd.get('param2') else ''),
            'shape': shape, 'shapeCode': zd['shape'], 'shapeName': Z.SHAPE_NAMES.get(shape, '?'),
            'radius': z.radius, 'minRadius': z.min_radius}
    if shape not in 'Aa;':
        info['cellCount'] = len(set(z.cells(REF_TARGET, REF_CASTER)))
        theo = theoretical_cells(shape, z.radius, z.min_radius)
        if theo is not None:
            info['cellCount'] = theo   # nombre de cases hors bords de carte
        if z.radius >= 63:
            info['cellCount'] = 'toute la carte'
    elif shape == ';':
        info['cellIds'] = zd.get('cellIds')
    else:
        info['cellCount'] = 'toute la carte'
    if (zd.get('damageDecreaseStepPercent'), zd.get('maxDamageDecreaseApplyCount')) != (10, 4):
        info['aoeMalus'] = {'stepPercent': zd.get('damageDecreaseStepPercent'),
                            'maxSteps': zd.get('maxDamageDecreaseApplyCount')}
    return info


def kind_of(eid):
    return {100: 'dommages', 5: 'poussée', 6: 'attirance', 1042: 'rapprochement du lanceur', 4: 'téléportation',
            8: 'échange de positions', 950: 'état (ajout)', 951: 'état (retrait)', 1076: 'boost % résistance',
            111: 'boost PA', 128: 'boost PM', 117: 'boost PO', 414: 'boost dommages de poussée',
            2803: 'boost % résistance mêlée', 181: 'invocation', 1163: 'multiplicateur de dommages subis',
            1223: 'renvoi (% dommages finaux)', 1123: 'renvoi (% dommages initiaux)', 141: 'tue la cible',
            2872: 'seuil de PV', 765: 'interception des dommages (sacrifice)', 3406: 'oubli du sort (usage unique)',
            3405: 'apprend un sort temporaire', 406: 'dissipe les effets d\'un sort', 3407: 'durée du prochain tour',
            3792: 'script visuel (FX)', 3793: 'script visuel (FX) sur la cible', 666: 'aucun effet',
            335: 'apparence', 1160: 'exécution de sous-sort', 792: 'exécution de sous-sort',
            1017: 'exécution de sous-sort', 1018: 'exécution de sous-sort', 2160: 'exécution de sous-sort'}.get(eid, '?')


def effect_label(e):
    eid = e['effectId']
    if eid in (950, 951):
        return f"{'État' if eid == 950 else 'Enlève l état'} {state_name(e['value'])} ({e['value']})".replace('l état', "l'état")
    if eid == 181:
        mon = MONSTERS.get(str(e['diceNum']))
        return f"Invoque : {mon['name']['fr'] if mon else e['diceNum']} ({e['diceNum']}, grade {e['diceSide']})"
    if eid == 3406:
        lv = LEVELS.get(str(e['value']))
        own = lv is not None and lv['spellId'] == e['spellId']
        return (f"Désapprend le sort temporaire (spell-level {e['value']})"
                + (" : le sort s'oublie lui-même ⇒ usage unique" if own else ''))
    if eid == 3405:
        return f"Apprend le sort temporaire (spell-level {e['value']})"
    if eid == 3407:
        return f"Durée du prochain tour : {e['value']} secondes"
    if eid == 406:
        sp = SPELLS.get(str(e['value']))
        return f"Enlève les effets du sort {e['value']} ({sp['name']['fr'] if sp else '?'})"
    fr = (CATALOG.get(str(e['effectId'])) or {}).get('fr') or ''
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    lab = fr.replace('#1{{~1~2 à }}#2', f"{lo}" + (f" à {hi}" if hi != lo else '')).replace('#1', str(e['diceNum']))
    lab = lab.replace('#2', str(e['diceSide'])).replace('#3', str(e['value']))
    lab = lab.replace('{{~ps}}', 's' if lo > 1 else '').replace('{{~zs}}', '')
    return lab


SUBSPELL_EFFECTS = set(EXECUTORS)


def norm_effect(e, depth=0, seen=None):
    seen = set() if seen is None else seen
    eid = e['effectId']
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    out = {
        'order': e['order'], 'effectId': eid, 'action': action_name(eid), 'kind': kind_of(eid),
        'label': (effect_label(e) or kind_of(eid)) if eid not in SUBSPELL_EFFECTS else None,
        'real': not e['forClientOnly'], 'clientOnly': e['forClientOnly'], 'visibleInTooltip': e['visibleInTooltip'],
        'diceNum': e['diceNum'], 'diceSide': e['diceSide'], 'value': e['value'],
        'targetMask': e['targetMask'], 'targets': decode_mask(e['targetMask']),
        'trigger': e['triggers'], 'triggerDecoded': decode_trigger(e['triggers']),
        'duration': e['duration'], 'delay': e['delay'], 'triggerDuration': e['effectTriggerDuration'],
        'dispellable': e['dispellable'], 'random': e['random'], 'group': e['group'],
        'element': {0: 'neutre', -1: None, 5: None}.get(e['effectElement'], e['effectElement']),
        'zone': zone_info(e['zoneDescr']),
    }
    if eid in (100,):
        out['min'], out['max'] = lo, hi
    if eid in (5, 6, 1042, 1103):
        out['cells'] = e['diceNum']
    if eid in (950, 951):
        out['state'] = {'id': e['value'], 'name': state_name(e['value'])}
    if eid in (111, 128, 117, 414, 1076, 2803, 1163, 1223, 1123, 2872):
        out['amount'] = e['diceNum']
    if eid == 3407:
        out['seconds'] = e['value']
    if eid in (3405, 3406):
        lv = LEVELS.get(str(e['value']))
        out['spellLevel'] = {'id': e['value'], 'spellId': lv['spellId'] if lv else None,
                             'name': SPELLS[str(lv['spellId'])]['name']['fr'] if lv else None}
    if eid == 406:
        out['spell'] = {'id': e['value'], 'name': SPELLS.get(str(e['value']), {}).get('name', {}).get('fr')}
    if eid == 181:
        mon = MONSTERS.get(str(e['diceNum']))
        out['summon'] = {'monsterId': e['diceNum'], 'grade': e['diceSide'],
                         'name': mon['name']['fr'] if mon else None}
    if eid in SUBSPELL_EFFECTS:
        sid, grade = e['diceNum'], e['diceSide']
        sp = SPELLS.get(str(sid))
        lvl_id = sp['spellLevels'][grade - 1] if sp and 0 < grade <= len(sp['spellLevels']) else None
        sub = {'spellId': sid, 'grade': grade, 'spellLevelId': lvl_id,
               'name': sp['name']['fr'] if sp else None, 'adminName': sp.get('adminName') if sp else None,
               'executor': EXECUTORS[eid][0], 'executorMeaning': EXECUTORS[eid][1]}
        if eid == 2160:
            sub['maxExecutions'] = e['value']
        key = (sid, grade)
        if lvl_id and key not in seen and depth < 4:
            lv = LEVELS[str(lvl_id)]
            sub['castConditions'] = cast_conditions(lv)
            sub['effects'] = [norm_effect(x, depth + 1, seen | {key}) for x in lv['effects']]
        elif key in seen:
            sub['recursive'] = True
        out['subSpell'] = sub
    if eid in (3792, 3793):
        out['note'] = ("value = id de boundScriptUsageData du sort (script d'animation) : effet purement visuel "
                       "(HYPOTHÈSE haute)")
    return out


def cast_conditions(lv):
    crit = lv['criticalHitProbability']
    return {
        'spellLevelId': lv['id'], 'apCost': lv['apCost'],
        'range': {'min': lv['minRange'], 'max': lv['range'], 'modifiable': lv['rangeCanBeBoosted']},
        'castInLine': lv['castInLine'], 'castInDiagonal': lv['castInDiagonal'], 'lineOfSight': lv['castTestLos'],
        'needFreeCell': lv['needFreeCell'], 'needTakenCell': lv['needTakenCell'],
        'needVisibleEntity': lv.get('needVisibleEntity'),
        'maxCastPerTurn': lv['maxCastPerTurn'], 'maxCastPerTarget': lv['maxCastPerTarget'],
        'minCastInterval': lv['minCastInterval'], 'initialCooldown': lv['initialCooldown'],
        'globalCooldown': lv['globalCooldown'], 'criticalHitProbability': crit,
        'effectiveCritChance': D.critical_chance(crit, 10),
        'statesCriterion': lv['statesCriterion'] or None, 'maxStack': lv['maxStack'],
    }


# ------------------------------------------------------------------------------------------------
# Dégâts attendus
# ------------------------------------------------------------------------------------------------
ARCH = D.Stats(strength=6000, crit=10, push_damage=1000, max_hp=30000, hp=30000)
TROLL = D.Stats(is_player=False, max_hp=10 ** 9, hp=10 ** 9)
VULN = [D.Multiplier(200, ('D',))]


def mean_final(lo, hi, crit, mults, melee=False):
    vals = [D.compute_hit(r, 100, ARCH, TROLL, melee=melee, critical_effect=crit,
                          target_multipliers=mults).final for r in range(lo, hi + 1)]
    return min(vals), max(vals), round(sum(vals) / len(vals), 1)


def expected_damage(level):
    dmg = [e for e in level['effects'] if e['effectId'] == 100 and not e['forClientOnly']]
    cdmg = [e for e in level['criticalEffect'] if e['effectId'] == 100 and not e['forClientOnly']]
    if not dmg:
        return None
    e = dmg[0]
    p = D.critical_chance(level['criticalHitProbability'], ARCH.crit) / 100
    res = {'formula': 'int(jet × (100 + Force 6000 + Puissance 0) / 100) ; aucune résistance (Troolls : 0 %) ; '
                      'Vulnérable = multiplicateur 1163 ×200 % (déclencheur D)',
           'casterStats': {'strength': 6000, 'power': 0, 'crit%': 10, 'critDamage': 0},
           'critChance': round(p * 100)}
    for label, mults in (('vsNeutral', []), ('vsVulnerable', VULN)):
        lo, hi, avg = mean_final(e['diceNum'], e['diceSide'] or e['diceNum'], False, mults)
        block = {'normal': {'min': lo, 'max': hi, 'avg': avg}}
        exp = avg
        if cdmg:
            c = cdmg[0]
            clo, chi, cavg = mean_final(c['diceNum'], c['diceSide'] or c['diceNum'], True, mults)
            block['critical'] = {'min': clo, 'max': chi, 'avg': cavg, 'reachable': p > 0}
            exp = (1 - p) * avg + p * cavg
        block['expectedPerCast'] = round(exp)
        block['expectedPerAP'] = round(exp / level['apCost'], 1)
        res[label] = block
    return res


def push_damage_table():
    rows = []
    for dopou, label in ((1000, 'base archétype'), (1200, '+1 Acclamation repoussante'),
                         (1500, '+ Amplification (Magicien) +500'), (2000, '+ Dégagez ! (+1000)'),
                         (2000, '+ Amplification améliorée (+1000)'), (3000, 'Dégagez ! + Amplification améliorée')):
        per = [MV.collision_damage(n, 200, dopou, 0) for n in range(1, 7)]
        rows.append({'pushDamageStat': dopou, 'context': label,
                     'damageByRemainingCells': {str(n + 1): v for n, v in enumerate(per)},
                     'secondFighterInChain_1cell': MV.collision_damage(1, 200, dopou, 0, index=1)})
    return {
        'formula': 'dmg = int(reste × (floor(niv/2) + 32 + DoPou_lanceur − RéPou_cible) / (4 × 2^i)) ; niv = 200 '
                   '(Gladiatroolleur 7980) ; i = rang dans la chaîne (0 = cible poussée) ; poussée diagonale '
                   '(direction « cardinale ») : force = ceil(n/2) pas, reste ×2 pour le calcul',
        'source': 'tools/mechanics/movement.py collision_damage (portage PushUtils.getCollisionDamage, client 2.73)',
        'vulnerableApplies': False,
        'vulnerableNote': ("Selon le client (DamageReceiver) les dommages de collision ignorent résistances et "
                           "multiplicateurs sauf les 1163 déclenchés par PD/PMD/PPD ; Vulnérable (1163 ×200 %, "
                           "déclencheur D) ne s'appliquerait donc PAS aux dommages de poussée — HYPOTHÈSE moyenne, "
                           "à confirmer en vidéo."),
        'rows': rows,
    }


# ------------------------------------------------------------------------------------------------
# Catalogue des sorts de l'Acrobate
# ------------------------------------------------------------------------------------------------
CLASSIC = [
    # (base, amélioré, choix d'amélioration, ordre d'obtention, niveau du Spell Manager)
    (30402, 30567, 30478, 0, None),
    (30408, 30574, 30484, 1, 1),
    (30404, 30570, 30480, 2, 2),
    (30405, 30571, 30481, 3, 3),
    (30406, 30572, 30482, 4, 4),
    (30403, 30569, 30479, 5, 5),
    (30407, 30573, 30483, 6, 6),
]
UNIQUES = [30604, 30605, 30616, 30617, 30618, 30619, 30615]

DPLN_TEXT = {
    30402: "Videur (sort de départ) : Repousse et frappe environ du 4 000 dans l'élément neutre.",
    30408: 'Hanediman : Attire les alliés et repousse les ennemis en zone fourche de taille 3.',
    30404: "Voltige : Échange de position et frappe dans l'élément neutre.",
    30405: 'Aïrenoman : Se téléporte sur la case ciblée et repousse les cibles à son contact.',
    30406: "Pugnace : Applique l'état Inébranlable et donne 25% de résistance au lanceur pendant 1 tour.",
    30403: 'Soutien Stratégique : Invoque un Poutch qui attire les ennemis en ligne.',
    30407: "Va-t-en-guerre : Le lanceur s'attire sur la cible de 2 cases.",
    30416: "« Frappe Repoussoir » qui inflige 1200 de dégâts neutre et repousse la cible de 2 cases. Ce sort ne possède pas d'amélioration.",
    30618: 'Chamboulement : Repousse la cible, si elle subit des dommages de poussée, repousse également le monstre le plus proche.',
    30605: 'Courage, fuyons : Donne 4PM à tous les personnages pendant 2 tours.',
    30604: 'Dégagez ! : Repousse tous les monstres sur la carte de 5 cases et augmente les dommages de poussée du lanceur.',
    30616: "Immortalité du Courageux : Se téléporte au contact de l'allié ciblé et sacrifie les alliés dans une zone cercle de taille 2 pendant 2 tours. Le lanceur a un seuil équivalent à 1% de ses PV pendant la durée du sort.",
    30617: 'Malédiction Mouvante : Pendant 1 tour, quand un monstre subit des dommages, il est repoussé de 2 cases.',
    30619: 'Un pour un : Renvoie 50% des dommages reçus pendant 2 tours.',
    30615: "Pense Vite : Au prochain tour, le lanceur gagne 999PA pour un tour mais n'a que 15 secondes pour les utiliser.",
}
DPLN_UPGRADE = {
    30402: ['Taille de la ligne perpendiculaire : 5 cases > 7 cases', 'Distance de poussée : 3 cases > 4 cases'],
    30408: ['Taille de la Fourche : 3 cases > 4 cases', 'Distance de déplacement : 4 cases > 6 cases'],
    30404: ['Portée maximale : 5 > 7', 'Lancers par tours : 2 > 3'],
    30406: ['Résistances : 25% > 50%'],
    30405: ['Distance de poussée : 5 cases > 6 cases'],
    30403: ['Taille du cercle de renvoi : 2 cases > 3 cases', "Taille de la croix d'attirance : 5 cases > 7 cases",
            "Distance d'attirance : 4 cases > 6 cases"],
    30407: ['Distance de rapprochement : 2 cases > 4 cases'],
}
DPLN_IMAGES = {
    30402: ('ark26gladia2_orig.png', 'ark26gladia7_orig.png'), 30408: ('ark26gladia39_orig.png', 'ark26gladia6_orig.png'),
    30404: ('ark26gladia30_orig.png', 'ark26gladia31_orig.png'), 30405: ('ark26gladia32_orig.png', 'ark26gladia37_orig.png'),
    30406: ('ark26gladia35_orig.png', 'ark26gladia36_orig.png'), 30403: ('ark26gladia71_orig.png', 'ark26gladia114_orig.png'),
    30407: ('ark26gladia115_orig.png', 'ark26gladia117_orig.png'), 30416: ('ark26gladia40_orig.png', None),
    30618: ('ark26gladia44_orig.png', None), 30605: ('ark26gladia69_orig.png', None), 30604: ('ark26gladia4_orig.png', None),
    30616: ('ark26gladia25_orig.png', None), 30615: ('ark26gladia24_orig.png', None), 30617: ('ark26gladia5_orig.png', None),
    30619: ('ark26gladia26_orig.png', None),
}
# Relevé manuel des infobulles en jeu capturées par DPLN (images consultées le 2026-09-28)
DPLN_TOOLTIP = {
    30402: 'Coût 4 PA ; Portée 1-5 (modifiable) ; Critique 30 % ; Zone ligne perpendiculaire de 5 cases ; Lancer en ligne ; 2/tour ; Repousse de 3 cases ; Dommages (Neutre) 62 à 66 ; critique : Repousse de 3 cases, 74 à 79',
    30408: 'Coût 3 PA ; Portée 1-3 (modifiable) ; Zone fourche de 10 cases ; Lancer en ligne ; 1/tour ; Attire de 4 cases ; Repousse de 4 cases',
    30404: 'Coût 4 PA ; Portée 1-5 (modifiable) ; Case occupée ; 1/tour/cible ; 2/tour ; Échange de positions ; Dommages (Neutre) 58 à 62 ; critique 70 à 74 (aucune ligne « Critique » dans les conditions)',
    30405: 'Coût 3 PA ; Portée 1-5 (modifiable) ; Zone croix de 5 cases ; Ne nécessite pas de ligne de vue ; Case libre ; Intervalle de relance 1 ; État interdit Pesanteur ; Téléporte sur la case ciblée ; Repousse de 2 cases',
    30406: 'Coût 2 PA ; Portée 0 ; Intervalle de relance 2 ; État Inébranlable (1 tour) ; Résistance +25 % (1 tour)',
    30403: 'Coût 3 PA ; Portée 1-8 (modifiable) ; Zone croix de 21 cases ; Ne nécessite pas de ligne de vue ; Case libre ; Intervalle de relance 1 ; Attire de 4 cases ; Dommages subis 50 % ; Renvoie 50 % des dommages subis',
    30407: 'Coût 2 PA ; Portée 1-7 (modifiable) ; Lancer en ligne ; 1/tour/cible ; 2/tour ; Avance de 2 cases',
    30416: 'Coût 3 PA ; Portée 1-6 (modifiable) ; Critique 40 % ; 2/tour ; Repousse de 2 cases ; Dommages (Neutre)(Invoc.) 16 à 20 ; critique 21 à 25',
    30618: 'Coût 5 PA ; Portée 1-63 ; Ne nécessite pas de ligne de vue ; Repousse de 6 cases',
    30605: 'Coût 5 PA ; Portée 0 ; PM (2 tours) +4',
    30604: 'Coût 5 PA ; Portée 0 ; Dommages de Poussée (3 tours) +1000 ; Repousse de 5 cases',
    30616: 'Coût 5 PA ; Portée 1-63 ; Zone cercle de 13 cases ; pas de LdV ; Case occupée ; Entité visible nécessaire ; Cumul max 1 ; Seuil PV (2 tours) ; Interception des dommages ; Avance de 63 cases',
    30615: 'Coût 5 PA ; Portée 0 ; Durée du prochain tour : 15 secondes (1 tour) ; PA (dans 1 tour) +999',
    30617: 'Coût 5 PA ; Portée 0 ; Repousse de 2 cases',
    30619: 'Coût 5 PA ; Portée 0 ; Dommages subis ; Renvoie 50 % des dommages subis',
}


def spell_desc(sid):
    d = (SPELLS[str(sid)].get('description') or {}).get('fr')
    return d.replace('\n', ' ').replace('<b>', '').replace('</b>', '').strip() if d else None


def level_block(sid):
    sp = SPELLS[str(sid)]
    lv = LEVELS[str(sp['spellLevels'][0])]
    blk = cast_conditions(lv)
    blk['spellId'] = sid
    blk['typeId'] = sp['typeId']
    blk['adminName'] = sp.get('adminName')
    blk['effects'] = [norm_effect(e) for e in lv['effects']]
    blk['critEffects'] = [norm_effect(e) for e in lv['criticalEffect']]
    ed = expected_damage(lv)
    if ed:
        blk['expectedDamage'] = ed
    if sid in SIM:
        blk['simModel'] = SIM[sid]
    blk['source'] = f'{API}/spell-levels/{lv["id"]}'
    return blk


# Informations d'analyse (rédigées à partir des données + mécanique ; voir notes/1x_archetype_acrobate.md)
ANALYSIS = {
    30416: {
        'realEffectsSummary': 'Poussée 2 cases (effet 5 réel, direction lanceur→cible) PUIS 16-20 dommages neutres (21-25 en critique) aux ennemis et aux invocations alliées (masque j,A).',
        'pics': {'canPutEnemyInPics': True, 'mechanism': 'poussée 2 cases depuis le lanceur ; les dommages sont appliqués APRÈS la poussée (ordre des effets) : si la cible entre dans les pics, elle est déjà Vulnérable quand les dommages tombent (HYPOTHÈSE : cibles figées au lancer).',
                 'confidence': M},
        'notes': ['Sort commun aux 3 archétypes (monstre 7980 « Gladiatroolleur », sorts [30416]).',
                  "Peut frapper le Poutch allié (masque j) : c'est ce qui permet à un Dompteur de déclencher le renvoi du Soutien Stratégique.",
                  'Aucune amélioration (DPLN ; aucun sort « Amélioration : Frappe Repoussoir » dans les données).'],
    },
    30402: {
        'realEffectsSummary': "Zone T (ligne perpendiculaire à l'axe de lancer, centrée sur la case ciblée). Pour chaque combattant (allié ou ennemi) de la zone, le lanceur exécute 30689 « Videur [Poussée] » : poussée réelle de 3 cases (4 amélioré) depuis la position du LANCEUR. L'effet 5 du sort principal est forClientOnly (affichage). Puis 59-63 dommages neutres (72-77 critique) aux ennemis de la zone.",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Poussée depuis le lanceur : la cible centrale part dans l'axe ; les cibles latérales de la ligne T partent PARALLÈLEMENT à l'axe (axe dominant de lanceur→cible, getLookDirection4) ; si |dx|=|dy| (ex. lancer à 1 case sur une cible latérale) la poussée est diagonale : ceil(3/2)=2 pas diagonaux. Dommages appliqués après la poussée (HYPOTHÈSE : sur cible devenue Vulnérable → ×2).",
                 'confidence': M},
        'notes': ['Seul sort offensif « de base » de l\'Acrobate avec Voltige ; 2 lancers/tour = 8 PA = tout le budget de base.',
                  'Pousse AUSSI les alliés présents dans la ligne (masque a,A) : attention à ne pas envoyer un allié dans les pics.',
                  'Exemple vérifié par simulation (tools/mechanics) : vague 1 (Troollibres en 242 et 358), Acrobate en 314 : Videur sur 256 puis sur 372 (lignes T) envoie les DEUX Troollibres dans les pics sans déplacement (idem depuis 287 via 229 et 345).'],
    },
    30408: {
        'realEffectsSummary': "Zone fourche F2 (10 cases : case ciblée + 3 branches de 3 cases vers l'avant : axe et deux diagonales). Pour chaque combattant de la zone, le lanceur exécute 30693 « Hanedimane [Poussée] » : ennemis repoussés de 4 cases (6 amélioré), alliés attirés de 4 (6) vers le lanceur. Les effets 6/5 du sort principal sont forClientOnly (affichage).",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Poussée depuis le lanceur, dans l'axe dominant lanceur→cible : toute la fourche est « balayée » vers l'avant de 4 cases (6 amélioré). Portée 1-3 en ligne seulement : il faut être proche.",
                 'confidence': M},
        'notes': ['Le meilleur outil de masse de l\'Acrobate avec Videur (vidéos : « faites des zones »).',
                  "Attire les alliés vers le lanceur : erreur typique = attirer un allié vers les monstres (Koza 10:30).",
                  'Le sous-sort 30693 a PO 1-6 et LdV : si le client/serveur testait ces conditions à l\'exécution, une cible lointaine/masquée pourrait être ignorée (HYPOTHÈSE : conditions ignorées pour un sort exécuté).'],
    },
    30404: {
        'realEffectsSummary': 'Échange de positions avec la cible (alliée ou ennemie, case occupée requise) PUIS 58-62 dommages neutres si ennemie. Taux critique du sort = 0 % → les effets critiques (70-74) ne sont jamais tirés (règle client : sort à 0 % ne peut pas faire de critique).',
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Si l'Acrobate se tient DANS les pics, l'échange y place la cible (même Inébranlable : l'échange n'est pas une poussée) et l'Acrobate en sort. Les dommages tombent après l'échange (cible Vulnérable ⇒ ×2, HYPOTHÈSE). Coût : l'Acrobate subit l'entrée dans les pics (2000 + Vulnérable).",
                 'confidence': M},
        'notes': ['Solution connue contre la Mama Inébranlable (Houmilito 3:19:30) et les Troolls sous Patroolleur / Troollement de Tambour.',
                  "Sert aussi à sortir un allié des pics (objectif « Toi, par ici, et toi, par là »)."],
    },
    30405: {
        'realEffectsSummary': "Téléporte le lanceur sur la case ciblée (libre, PO 1-5, sans LdV) PUIS repousse de 2 cases (4 amélioré) les combattants (alliés sauf lanceur + ennemis) des 4 cases adjacentes, vers l'extérieur (direction case ciblée→cible). Le sous-sort 30419 est forClientOnly (affichage) ; l'effet 5 du sort principal est réel.",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Se poser à côté d'un monstre situé à ≤ 2 cases (≤ 4 amélioré) des pics dans l'axe opposé ; pousse jusqu'à 4 combattants à la fois (croix de 5 cases).",
                 'confidence': H},
        'notes': ['Interdit en état Pesanteur (7) pour la version de base ; la version améliorée n\'a plus ce critère (donnée).',
                  'Intervalle de relance 1 ⇒ 1 lancer par tour.',
                  'Mobilité : 3 PA pour jusqu\'à 5 cases sans LdV (franchit les lignes de monstres, joueurs non tacables de toute façon : état 5970).'],
    },
    30406: {
        'realEffectsSummary': 'État Inébranlable (157, 1 tour) + 25 % de résistance tous éléments (50 % amélioré), 1 tour, sur le lanceur. Intervalle 2.',
        'pics': {'canPutEnemyInPics': False,
                 'mechanism': "Défensif : Inébranlable (cantBePushed) empêche d'être poussé/attiré — notamment par Troollpoline (3), Tir d'Artroolleur (2), Coup de Trooll (3), Uppertrooll (6) et, HYPOTHÈSE moyenne, par le Rassemblement Troollesque de la Mama (1103, poussée non « forcée ») ⇒ protège l'Acrobate d'une entrée dans les pics.",
                 'confidence': M},
        'notes': ['Durée 1 : posé pendant le tour T, reste actif jusqu\'au début du tour T+1 de l\'Acrobate, donc pendant le tour de la Mama (qui joue en premier) : à lancer en fin de T7 contre l\'arrivée de la Mama (HYPOTHÈSE).',
                  'Plafond de résistance % joueur = 50 % (formule client).'],
    },
    30403: {
        'realEffectsSummary': "Invoque un Poutch (Stratège Dompteur 7985 ; 7986 amélioré ; 5500 PV, 0 PA/PM, ne consomme pas d'emplacement d'invocation) sur une case libre à 1-8 PO sans LdV, puis attire de 4 cases (6) vers lui les ennemis situés sur les 8 demi-droites (croix X5 + croix diagonale +5 ; X7/+7 amélioré). Le Poutch subit ×50 % des dommages venant de ses alliés, et quand un allié à l'état Dompteur (5899) le frappe il inflige 50 % des dommages INITIAUX subis aux ennemis à 1-2 cases (1-3 amélioré). Un seul Poutch par équipe.",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Attirance vers le Poutch : placer le Poutch DANS/derrière les pics (case libre) attire les ennemis alignés vers lui ⇒ ils traversent/entrent dans les pics. Renvoi du Poutch ×2 sur les ennemis Vulnérables autour de lui.",
                 'confidence': M},
        'notes': ["Jugé inutile par les joueurs (Koza : « vraiment pas »).",
                  "L'effet 181 a une durée 1 et un sort 30420 « Soutien Stratégique [Mort] » (état 6027 + tue au début de tour) existe : le Poutch pourrait ne vivre qu'un tour (HYPOTHÈSE basse, 30420 n'est référencé par aucun sort).",
                  "Seuls les sorts du Dompteur et Frappe Repoussoir ont le masque j (invocations alliées) : ce sont eux qui peuvent frapper le Poutch."],
    },
    30407: {
        'realEffectsSummary': 'Le lanceur avance de 2 cases (4 amélioré) vers la cible (alliée ou ennemie), en ligne, PO 1-6, LdV, 2/tour, 1/cible.',
        'pics': {'canPutEnemyInPics': False,
                 'mechanism': "Mobilité seulement (2 PA ⇒ 2 cases). Utile pour se mettre en ligne/à portée d'un Videur ou d'un Hanedimane sans dépenser de PM.",
                 'confidence': H},
        'notes': ['Ne déplace pas la cible.'],
    },
    30604: {
        'realEffectsSummary': '+1000 dommages de poussée au lanceur pendant 3 tours, puis repousse de 5 cases TOUS les ennemis (sauf Mama avant son entrée, état 5971) dans un cercle de rayon 63 autour du lanceur, depuis le lanceur.',
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': 'Le bonus de dommages de poussée est posé AVANT la poussée (ordre des effets) : chaque case non parcourue = 533 dommages (niv. 200, DoPou 2000). Idéal pour « Au coin », « Trous dans les Trools », « Faire le mur », et T9-T10.',
                 'confidence': H},
        'notes': ['Coût 5 PA, portée 0 ; usage unique (oublie 80828).'],
    },
    30605: {'realEffectsSummary': '+4 PM à tous les alliés (zone a) pendant 2 tours.', 'pics': {'canPutEnemyInPics': False, 'mechanism': 'Mobilité d\'équipe.', 'confidence': H}, 'notes': []},
    30616: {
        'realEffectsSummary': "Cible un combattant (case occupée, PO 1-63, sans LdV, entité visible) : seuil de 1 PV sur le lanceur pendant 2 tours ; les alliés (sauf lanceur) dans un cercle de rayon 2 autour de la case ciblée reçoivent « Intercepte les dommages » (2 tours) : leurs dommages sont redirigés vers le lanceur ; le lanceur avance de 63 cases vers la cible (au contact) ; la cible reçoit l'état 5967 « Endolori ».",
        'pics': {'canPutEnemyInPics': False, 'mechanism': "Défensif (T7-T8 contre l'arrivée de la Mama).", 'confidence': M},
        'notes': ["Effet 2872 = « Seuil : 1 PV » (la description et DPLN disent « 1 % des PV »).",
                  "Les alliés sont sélectionnés AVANT le déplacement du lanceur (ordre des effets)."],
    },
    30617: {
        'realEffectsSummary': "Pendant 1 tour (triggerDuration 1), chaque ennemi (sauf Mama pré-combat) qui subit des dommages est repoussé de 2 cases : c'est la SOURCE des dommages qui exécute 30676 (poussée 2) sur lui ⇒ poussée dans l'axe attaquant→cible. État 5980 posé 1 tour.",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': "Chaque coup d'un allié (Dompteur à distance, etc.) pousse la cible de 2 cases en s'éloignant de l'attaquant : placer les frappeurs du côté opposé aux pics. HYPOTHÈSE : l'entrée dans les pics (2000 dommages) peut elle-même redéclencher une poussée.",
                 'confidence': M},
        'notes': ["L'effet 5 du sort principal est forClientOnly (affichage)."],
    },
    30618: {
        'realEffectsSummary': "Retire l'état Marqué (5916) de tous ; le lanceur exécute 30677 niv.1 sur l'ennemi ciblé (PO 1-63 sans LdV) : pose sur lui des déclencheurs PD/XPD, l'état Marqué 1 tour, puis le repousse de 5 cases. S'il subit des dommages de poussée (ou en meurt), il exécute 30677 niv.2 : 1 seule exécution (value 1) de 30677 niv.1 sur un autre ennemi non Marqué (le plus proche d'après la description) ⇒ rebond en chaîne. Fin : dissipe 30677.",
        'pics': {'canPutEnemyInPics': True,
                 'mechanism': 'Poussée réelle = 5 cases (30677), alors que l\'infobulle (effet 5 forClientOnly) affiche 6. Rebond si collision ⇒ enchaîner des poussées contre les bords/pics.',
                 'confidence': M},
        'notes': ["Le rebond est exécuté par le monstre heurté : la direction de la poussée suivante part de lui (HYPOTHÈSE)."],
    },
    30619: {
        'realEffectsSummary': 'Pendant 2 tours : dommages subis ×50 % et, à chaque coup reçu, le lanceur renvoie à l\'attaquant 100 % des dommages FINAUX subis (après la réduction ⇒ ≈ 50 % des dommages initiaux). Les effets 1163/1123 du sort principal sont forClientOnly ; le réel est dans 30625.',
        'pics': {'canPutEnemyInPics': False, 'mechanism': 'Défensif / renvoi.', 'confidence': M},
        'notes': ['DPLN omet la réduction de 50 %.'],
    },
    30615: {
        'realEffectsSummary': "Prochain tour : +999 PA (effet 111, délai 1, durée 1) et durée du prochain tour fixée à 10 s (3407 value 10) ; les effets de Pense Vite sont dissipés à la fin de ce tour (406, délai 1). Commun aux 3 archétypes.",
        'pics': {'canPutEnemyInPics': False, 'mechanism': 'Permet d\'enchaîner tous ses sorts (limites par tour/cible et intervalles toujours actifs).', 'confidence': H},
        'notes': ['Donnée actuelle : 10 s ; DPLN (texte et capture) : 15 s ⇒ probable rééquilibrage.',
                  'Coût 5 PA.'],
    },
}


# ------------------------------------------------------------------------------------------------
# Modèle d'exécution simplifié pour le simulateur (dérivé à la main des effets RÉELS, dans l'ordre)
# origin = origine de la poussée/attirance : 'caster' (la cible est la case ciblée du sous-sort exécuté
# par le lanceur) ou 'zoneCenter' (case ciblée du sort principal).
# ------------------------------------------------------------------------------------------------
def _dmg(lo, hi, clo, chi, zone, affects='enemies'):
    return {'op': 'damage', 'element': 'neutral', 'roll': [lo, hi], 'critRoll': [clo, chi] if clo else None,
            'zone': zone, 'affects': affects}


def _videur(zone, n, sub):
    return {'steps': [
        {'op': 'push', 'zone': zone, 'zoneCenter': 'targetCell', 'affects': 'allies+enemies', 'distance': n,
         'origin': 'caster', 'via': f'1160 → {sub}', 'order': 'cibles les plus éloignées de la case ciblée d\'abord'},
        _dmg(59, 63, 72, 77, zone)],
        'damageAppliedAfterPush': True}


def _hane(zone, n, sub):
    return {'steps': [
        {'op': 'push', 'zone': zone, 'zoneCenter': 'targetCell', 'affects': 'enemies', 'distance': n,
         'origin': 'caster', 'via': f'1160 → {sub}'},
        {'op': 'pull', 'zone': zone, 'zoneCenter': 'targetCell', 'affects': 'allies (hors lanceur de fait)',
         'distance': n, 'towards': 'caster', 'via': f'1160 → {sub}'}],
        'note': 'Pour chaque combattant de la fourche, le sous-sort applique poussée (si ennemi) puis attirance (si allié).'}


def _voltige():
    return {'steps': [{'op': 'exchange', 'with': 'target (allié ou ennemi)', 'zone': 'P1'},
                      _dmg(58, 62, 70, 74, 'P1')],
            'critPossible': False, 'damageAppliedAfterExchange': True}


def _airo(n):
    return {'steps': [{'op': 'teleport_caster', 'to': 'targetCell (libre)'},
                      {'op': 'push', 'zone': 'X1', 'zoneCenter': 'targetCell', 'affects': 'allies (sauf lanceur)+enemies',
                       'distance': n, 'origin': 'zoneCenter'}],
            'note': 'Le sous-sort 30419 (792) est forClientOnly : ne pas l\'exécuter.'}


def _pugnace(res):
    return {'steps': [{'op': 'add_state', 'state': 157, 'name': 'Inébranlable', 'duration': 1, 'on': 'caster'},
                      {'op': 'boost', 'stat': 'resPercentAll', 'amount': res, 'duration': 1, 'on': 'caster'}]}


def _soutien(mon, n, r, ring):
    return {'steps': [
        {'op': 'summon', 'monster': mon, 'cell': 'targetCell (libre)', 'hp': 5500, 'killsPreviousPoutch': True},
        {'op': 'pull', 'zone': f'X{r}', 'zoneCenter': 'targetCell', 'affects': 'enemies', 'distance': n, 'towards': 'Poutch'},
        {'op': 'pull', 'zone': f'+{r}', 'zoneCenter': 'targetCell', 'affects': 'enemies', 'distance': n, 'towards': 'Poutch'}],
        'poutchPassive': {'receivedFromAllies': 'x50 % (1163, déclencheur DBA)',
                          'onHitByDompteur': f'inflige 50 % des dommages INITIAUX subis aux ennemis à 1-{ring} cases (1123, zone C{ring},1, sans dégressivité)'},
        'note': 'Effets 1163/1223 du sort principal = affichage (forClientOnly) ; le comportement réel vient du sort de départ du Poutch (30421 / 30568).'}


def _vteg(n):
    return {'steps': [{'op': 'caster_advance', 'towards': 'target', 'distance': n}]}


SIM = {
    30416: {'steps': [{'op': 'push', 'zone': 'P1', 'affects': 'allies+enemies', 'distance': 2, 'origin': 'caster'},
                      _dmg(16, 20, 21, 25, 'P1', 'enemies + allied summons (j)')], 'damageAppliedAfterPush': True},
    30402: _videur('T2', 3, '30689 niv.1'), 30567: _videur('T3', 4, '30689 niv.2'),
    30408: _hane('F2', 4, '30693 niv.1'), 30574: _hane('F3', 6, '30693 niv.2'),
    30404: _voltige(), 30570: _voltige(),
    30405: _airo(2), 30571: _airo(4),
    30406: _pugnace(25), 30572: _pugnace(50),
    30403: _soutien(7985, 4, 5, 2), 30569: _soutien(7986, 6, 7, 3),
    30407: _vteg(2), 30573: _vteg(4),
    30604: {'steps': [{'op': 'boost', 'stat': 'pushDamage', 'amount': 1000, 'duration': 3, 'on': 'caster'},
                      {'op': 'push', 'zone': 'C63', 'zoneCenter': 'caster', 'affects': 'enemies (sauf état 5971)', 'distance': 5,
                       'origin': 'zoneCenter'},
                      {'op': 'forget_self'}]},
    30605: {'steps': [{'op': 'boost', 'stat': 'mp', 'amount': 4, 'duration': 2, 'on': 'all allies'}, {'op': 'forget_self'}]},
    30616: {'steps': [{'op': 'boost', 'stat': 'hpThreshold', 'amount': 1, 'duration': 2, 'on': 'caster'},
                      {'op': 'forget_self'},
                      {'op': 'sacrifice', 'zone': 'C2', 'zoneCenter': 'targetCell', 'affects': 'allies (sauf lanceur)', 'duration': 2,
                       'meaning': 'les dommages subis par ces alliés sont redirigés vers le lanceur'},
                      {'op': 'caster_advance', 'towards': 'target', 'distance': 63},
                      {'op': 'add_state', 'state': 5967, 'name': 'Endolori', 'duration': -1, 'on': 'target'}]},
    30617: {'steps': [{'op': 'trigger_buff', 'on': 'all enemies (sauf état 5971)', 'trigger': 'D', 'duration': 1,
                       'effect': {'op': 'push', 'distance': 2, 'origin': 'damage source (attaquant)', 'via': '1018 → 30676'}},
                      {'op': 'add_state', 'state': 5980, 'duration': 1, 'on': 'all enemies (sauf 5971)'},
                      {'op': 'forget_self'}]},
    30618: {'steps': [{'op': 'remove_state', 'state': 5916, 'on': 'all'},
                      {'op': 'execute', 'spell': '30677 niv.1', 'on': 'target enemy',
                       'effects': [{'op': 'trigger_buff', 'trigger': 'PD|XPD', 'duration': 1,
                                    'effect': {'op': 'bounce', 'spell': '30677 niv.1', 'maxExecutions': 1,
                                               'target': 'autre ennemi non Marqué (le plus proche : HYPOTHÈSE)',
                                               'executor': 'le monstre heurté'}},
                                   {'op': 'add_state', 'state': 5916, 'name': 'Marqué', 'duration': 1},
                                   {'op': 'push', 'distance': 5, 'origin': 'executor'}]},
                      {'op': 'dispell_spell', 'spell': 30677}, {'op': 'forget_self'}]},
    30619: {'steps': [{'op': 'trigger_buff', 'on': 'caster', 'trigger': 'D', 'duration': 2,
                       'effects': [{'op': 'received_multiplier', 'percent': 50},
                                   {'op': 'reflect', 'what': '100 % des dommages finaux subis', 'to': 'attaquant (1017 → 30625 niv.2, 1223)'}]},
                      {'op': 'forget_self'}]},
    30615: {'steps': [{'op': 'set_next_turn_time', 'seconds': 10},
                      {'op': 'boost', 'stat': 'ap', 'amount': 999, 'delay': 1, 'duration': 1, 'on': 'caster'},
                      {'op': 'dispell_spell_at_turn_end', 'spell': 30615, 'delay': 1},
                      {'op': 'forget_self'}]},
}


DISCREPANCIES = [
    {'topic': 'Videur — jets de dommages', 'data': '59-63 (critique 72-77) — spell-level 80507 / 80766',
     'dpln': 'capture d\'infobulle : 62-66 (critique 74-79) ; texte « environ 4 000 »',
     'verdict': 'écart de jets (probable rééquilibrage postérieur à la capture ; DofusDB màj 2026-06-23). « ≈ 4 000 » reste compatible : 3 599-3 843 (4 392-4 697 crit), espérance ≈ 4 050.', 'confidence': M},
    {'topic': 'Frappe Repoussoir — taux critique', 'data': 'criticalHitProbability 30 % (+10 % de base ⇒ 40 % effectif)',
     'dpln': 'capture : « Critique 40 % »', 'verdict': 'cohérent si l\'infobulle ajoute le 10 % de critique du personnage ; mais la capture de Videur affiche 30 % (non ajouté) ⇒ incohérence entre captures ou ancienne valeur 40 %.', 'confidence': B},
    {'topic': 'Voltige améliorée — lancers par tour', 'data': 'maxCastPerTurn = 2 dans 80775 (identique à la base)',
     'dpln': 'table + description de 30480 : « Lancers par tour : 2 > 3 »', 'verdict': "l'amélioration annoncée n'est PAS dans les données (bug ou valeur serveur). Le simulateur doit garder 2 par défaut, 3 en option.", 'confidence': M},
    {'topic': 'Aïronemane — distance de poussée', 'data': 'base 2 cases (80522, effet 5 réel), améliorée 4 cases (80778)',
     'dpln': 'capture base : « Repousse de 2 cases » ; description 30481 : « 4 cases > 6 cases » ; table DPLN : « 5 cases > 6 cases »',
     'verdict': 'trois versions ; les données d\'effet (2 → 4) font foi.', 'confidence': M},
    {'topic': 'Va-t-en-guerre — portée', 'data': 'PO 1-6 (80512 / 80782)', 'dpln': 'capture : « Portée 1-7 (modifiable) »',
     'verdict': 'capture probablement prise avec +1 PO (bonus Acclamation optique) ou ancienne valeur.', 'confidence': B},
    {'topic': 'Pense Vite — durée du tour', 'data': '3407 value 10 ⇒ 10 s ; description « fixé à 10 seconde »',
     'dpln': 'texte et capture : 15 secondes', 'verdict': 'rééquilibrage probable : 10 s actuellement.', 'confidence': H},
    {'topic': 'Chamboulement — distance', 'data': 'poussée réelle 5 cases (30677 niv.1) ; effet 5 du sort principal (forClientOnly) = 6',
     'dpln': 'capture : « Repousse de 6 cases »', 'verdict': "écart interne aux données : l'infobulle affiche 6, l'effet exécuté pousse de 5.", 'confidence': M},
    {'topic': 'Immortalité du Courageux — seuil', 'data': "2872 « Seuil : 1 PV »", 'dpln': '« seuil équivalent à 1 % de ses PV » (= description du sort)',
     'verdict': 'pratiquement équivalent (le lanceur ne peut pas mourir) ; simuler seuil = 1 PV.', 'confidence': M},
    {'topic': 'Un pour un', 'data': 'réduction ×50 % des dommages subis + renvoi 100 % des dommages finaux (≈ 50 % initiaux), 2 tours',
     'dpln': '« Renvoie 50% des dommages reçus pendant 2 tours »', 'verdict': 'DPLN omet la réduction de 50 %.', 'confidence': M},
    {'topic': 'PV de l\'Acrobate', 'data': 'passif 30639 (sort de départ du monstre 7980) : +5000 Vitalité si le porteur a l\'état Acrobate (5900) ⇒ 35 000 PV',
     'dpln': '30 000 PV pour tous ; capture de la fiche d\'un Acrobate (apparence déjà changée) : 30 000 / 30 000',
     'verdict': "le critère *E5900 est probablement évalué au début du combat, avant le choix d'archétype ⇒ bonus non appliqué. Défaut simulateur : 30 000 (option 35 000).", 'confidence': M},
    {'topic': 'Vulnérable', 'data': '1163 « Dommages subis x200 % » ⇒ dommages ×2', 'dpln': '« subissent 200 % de dégâts supplémentaires » (⇒ ×3)',
     'verdict': 'la donnée fait foi : ×2.', 'confidence': H},
    {'topic': 'Amplification (Magicien) sur l\'Acrobate', 'data': '+500 dommages de poussée 3 tours (30411) ; +1000 amélioré (30578)',
     'dpln': 'capture : +500 ; table d\'amélioration et description 30487 : « 100 > 200 »', 'verdict': 'la description d\'amélioration est fausse ; données et vidéos (cardxc 07:00, Khytrayer 05:10) : 500 → 1000.', 'confidence': H},
    {'topic': 'Glyphe de début de tour (pics)', 'data': '30390 niv.3 : 1000 dommages neutres',
     'dpln': '2 000 dommages ; vidéos : un Trooll à ≤ 2 000 PV dans les pics meurt à son début de tour',
     'verdict': "probablement COHÉRENT : un combattant qui commence son tour dans les pics est Vulnérable (1163 ×200 % tant qu'il est dans l'aura) ⇒ 1000 × 2 = 2000 (HYPOTHÈSE haute ; hors périmètre Acrobate, voir fiche glyphes).", 'confidence': M},
]


def worked_example_v1():
    """Tour 1, vague 1 (Troollibres en 242 et 358, note 40) : lancers de Videur (sans déplacement) qui envoient un
    Troollibre dans les pics, pour chaque case de départ de l'Acrobate (alliés sur les 3 autres cases)."""
    import copy
    path = os.path.join(ROOT, 'research', 'data', 'map_139988488.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        mp = json.load(f)
    sc = mp['specialCells']
    walk, pics = set(sc['fightWalkableCells']), set(sc['glyphFightWalkableCells'])
    los = {c['id']: c['los'] for c in mp['cells']}
    t2 = Z.SpellZone.from_raw('T2')
    starts, monsters = [286, 287, 314, 315], [242, 358]
    out = []
    for acro in starts:
        b = MV.Board(walkable=set(walk))
        b.fighters['ACRO'] = MV.Fighter('ACRO', acro, 0, push_damage=1000)
        for i, c in enumerate(x for x in starts if x != acro):
            b.fighters[f'ALLY{i}'] = MV.Fighter(f'ALLY{i}', c, 0)
        for i, c in enumerate(monsters):
            b.fighters[f'TROLL{c}'] = MV.Fighter(f'TROLL{c}', c, 1)
        occ = {f.cell for f in b.fighters.values()}
        casts = []
        for t in G.range_cells(acro, 1, 5, cast_in_line=True):
            if not G.has_line_of_sight(acro, t, cell_los=lambda c: los.get(c, False), blocks_los=lambda c: c in occ):
                continue
            bb = copy.deepcopy(b)
            caster = bb.fighters['ACRO']
            cells = t2.cells(t, acro)
            hit = [f.cell for f in bb.fighters.values() if f.cell in cells and f.fid != 'ACRO']
            res = []
            for c in MV.sort_targets_for_effect(t, True, hit):
                f = bb.fighter_at(c)
                o = MV.push(bb, caster, f, 3, targeted_cell=f.cell)
                res.append({'fighter': f.fid, 'from': c, 'to': f.cell,
                            'enteredPics': any(x in pics for x in (o.drag.path if o.drag else [])),
                            'collisionDamage': [d for _, d in o.collision_damages]})
            if any(r['enteredPics'] for r in res):
                casts.append({'targetCell': t, 'targetXY': G.cell_to_xy(t), 'results': res})
        out.append({'acrobateCell': acro, 'acrobateXY': G.cell_to_xy(acro), 'videurCastsPuttingATrollInPics': casts})
    return {'scenario': 'T1, vague 1 : Troollibres en 242 et 358 (note 40, FAIT observé) ; alliés sur les 3 autres cases de départ ; '
                        'Videur niv. 1 (T2, poussée 3 depuis le lanceur), sans déplacement',
            'computedWith': 'tools/mechanics (zones, movement, geometry) + research/data/map_139988488.json',
            'results': out}


def build():
    spells = []
    common = {'id': 30416, 'upgradedId': None, 'upgradeChoiceSpellId': None, 'name': 'Frappe Repoussoir',
              'category': 'commun', 'unlockOrder': 0, 'unlockedBy': 'départ (commun aux 3 archétypes)', 'unique': False}
    entries = [(common, 30416, None)]
    for base, up, choice, order, mgr in CLASSIC:
        e = {'id': base, 'upgradedId': up, 'upgradeChoiceSpellId': choice,
             'name': SPELLS[str(base)]['name']['fr'], 'category': 'classique', 'unlockOrder': order,
             'unlockedBy': 'départ' if order == 0 else f'objectif n°{order} (Spell Manager 30626 niv.{mgr}, effet 3405)',
             'unique': False}
        entries.append((e, base, up))
    for u in UNIQUES:
        e = {'id': u, 'upgradedId': None, 'upgradeChoiceSpellId': None, 'name': SPELLS[str(u)]['name']['fr'],
             'category': 'unique', 'unlockOrder': None,
             'unlockedBy': 'Glyphe Évènementiel (cadeau) : choix proposé (3008) — sort à usage unique (3406 oublie le sort)',
             'unique': True}
        if u == 30615:
            e['sharedWith'] = ['Dompteur', 'Magicien']
        entries.append((e, u, None))
    for e, base, up in entries:
        e['description'] = spell_desc(base)
        e['dpln'] = {'text': DPLN_TEXT.get(base), 'upgradeTable': DPLN_UPGRADE.get(base),
                     'tooltipCapture': DPLN_TOOLTIP.get(base),
                     'images': [f'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/{x}'
                                for x in (DPLN_IMAGES.get(base) or ()) if x],
                     'source': DPLN}
        normal = level_block(base)
        upgraded = level_block(up) if up else None
        e['levels'] = {'normal': normal, 'upgraded': upgraded}
        if e.get('upgradeChoiceSpellId'):
            ch = e['upgradeChoiceSpellId']
            chl = LEVELS[str(SPELLS[str(ch)]['spellLevels'][0])]
            e['upgrade'] = {'choiceSpellId': ch, 'choiceSpellLevelId': chl['id'],
                            'description': spell_desc(ch),
                            'mechanism': [norm_effect(x)['label'] or f"exécute {x['diceNum']} « Améliore un sort » (effet 666, infobulle)" for x in chl['effects']],
                            'boostedState': {'id': chl['effects'][0]['value'], 'name': state_name(chl['effects'][0]['value'])},
                            'forgets': chl['effects'][2]['value'], 'learns': chl['effects'][3]['value'],
                            'note': "L'amélioration remplace le spell-level (3406 puis 3405) : l'intervalle de relance repart de zéro (DPLN)."}
        e['effects'] = normal['effects']
        e['critEffects'] = normal['critEffects']
        an = ANALYSIS.get(base, {})
        e['realEffectsSummary'] = an.get('realEffectsSummary')
        e['pics'] = an.get('pics')
        e['notes'] = an.get('notes', [])
        e['sources'] = [f'{API}/spells/{base}'] + ([f'{API}/spells/{up}'] if up else [])
        spells.append(e)

    # Bonus « Acclamations de la foule »
    bonuses = []
    stat_names = {111: ('PA', 'ap'), 128: ('PM', 'mp'), 1076: ('% Résistance (tous éléments)', 'resPercentAll'),
                  117: ('Portée', 'range'), 414: ('Dommages de poussée', 'pushDamage'), 2803: ('% Résistance mêlée', 'meleeResPercent')}
    dpln_b = {111: '1 PA', 128: '1 PM', 1076: '10% de résistances', 117: '1 Portée', 414: '200 Dommages de poussée',
              2803: '10% Résistance mêlée'}
    ui = {30595: None, 30596: None, 30597: 'Bonus Résistances %', 30635: None,
          30636: 'Bonus Dommages de Poussée', 30637: 'Bonus Résistance Mêlée'}   # titres lus sur ark26gladia41
    for cid in (30595, 30596, 30597, 30635, 30636, 30637):
        sp = SPELLS[str(cid)]
        lv = LEVELS[str(sp['spellLevels'][0])]
        disp = lv['effects'][0]
        sub = lv['effects'][1]
        real_lv = LEVELS[str(SPELLS['30590']['spellLevels'][sub['diceSide'] - 1])]
        real = real_lv['effects'][0]
        nm, key = stat_names[real['effectId']]
        bonuses.append({
            'choiceSpellId': cid, 'name': sp['name']['fr'], 'adminName': sp.get('adminName'),
            'description': spell_desc(cid), 'uiCardTitle': ui[cid],
            'stat': key, 'statLabel': nm, 'value': real['diceNum'], 'effectId': real['effectId'],
            'action': action_name(real['effectId']), 'duration': real['duration'], 'permanent': real['duration'] == -1,
            'stackable': True,
            'realEffect': {'spellId': 30590, 'grade': sub['diceSide'], 'spellLevelId': real_lv['id']},
            'displayEffectClientOnly': disp['forClientOnly'],
            'dpln': dpln_b[real['effectId']],
            'sources': [f'{API}/spells/{cid}', f'{API}/spell-levels/{real_lv["id"]}'],
        })

    # Passifs / identité d'archétype
    passive = LEVELS['80912']
    gl = LEVELS['80897']
    archetype = {
        'name': 'Acrobate', 'internalName': 'Baroudeur', 'role': 'Placeur (sorts de placement : 2 sorts de frappe, 5 de placement — DPLN)',
        'stateId': 5900, 'stateName': state_name(5900),
        'choiceSpell': {'id': 30648, 'spellLevelId': 80912, 'type': '3884 Choix initial Acrobate',
                        'effects': [norm_effect(x) for x in passive['effects']],
                        'note': "Lancé quand l'Acrobate est choisi (30608 « Choix d'Archétype », effet 3008 choix 16) : animation 30739, état 5900 permanent, 4 apparences (335). Les champs PA/PO de ce spell-level (copie de Videur) ne servent pas."},
        'tooltipHeaderSpell': {'id': 30640, 'name': 'Baroudeur :', 'note': "Libellé d'infobulle (effet 666) utilisé par Amplification (1160 forClientOnly) avant la ligne propre à l'Acrobate ; rendu « ??? » dans les captures DPLN. 30641 = Gladiateur (Dompteur), 30642 = Guérisseur (Magicien) ; 30643, 30645-30647 n'existent pas."},
        'spellTypes': {'3888': 'Sorts Acrobate', '3902': 'Sorts améliorés Acrobate', '3842': 'Choix améliorations Acrobate',
                       '3874': 'Sorts uniques (Baroudeur)', '3870': 'Buffs individuels (Acclamations)', '3862': 'Déclenchés Acrobate',
                       '3867': 'Acclamations de la foule (Acrobate)', '3884': 'Choix initial Acrobate'},
        'recommendedInitiative': 'Joue en PREMIER (DPLN ; 11 vidéos) : initiative identique pour tous, ordre = inverse de l\'affichage du groupe (DPLN) / ordre d\'entrée (vidéo 01/2025).',
        'bestCompositions': ['Acrobate - Dompteur - Dompteur - Magicien', 'Acrobate - Acrobate - Dompteur - Magicien'],
    }
    base_stats = {
        'hp': 30000, 'ap': 8, 'mp': 4, 'range': 0, 'strength': 6000, 'power': 0, 'pushDamage': 1000, 'critPercent': 10,
        'critDamage': 0, 'resPercent': 0, 'level': 200, 'element': 'neutre (tous les sorts)', 'tackle': 'aucun (état 5970 : ne tacle pas, ne peut pas être taclé)',
        'turnDurationSeconds': 60,
        'sources': [
            {'claim': '30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 Dommages de poussée, 10 % Critique', 'source': DPLN, 'type': 'FAIT rapporté', 'confidence': H},
            {'claim': 'Monstre 7980 « Gladiatroolleur » : niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6 000, sort 30416', 'source': f'{API}/monsters/7980', 'type': 'FAIT vérifié', 'confidence': H},
            {'claim': "Passif 30639 : état 5970 (cantTackle/cantBeTackled), durée de tour 60 s (3407), +5000 Vitalité si état Acrobate (125, masque C,*E5900), passif 30700 (Vulnérable à la sortie des pics)", 'source': f'{API}/spell-levels/80897', 'type': 'FAIT vérifié', 'confidence': H},
        ],
        'hpVariantIfPassiveApplies': 35000,
        'notes': ["Les dommages de poussée (1 000) et le critique (10 %) ne figurent pas dans la fiche monstre 7980 : valeurs DPLN / vidéos (Barbe Douce 00:04-00:25).",
                  "Niveau utilisé pour la formule de poussée : 200 (monstre 7980) ; si le niveau réel du joueur était utilisé (≥ 50), l'écart est faible (floor(niv/2) face à 1 000 de DoPou).",
                  "Durée de tour 60 s (3407 value 60 du passif) ; Pense Vite fixe le tour suivant à 10 s."],
    }
    sub_ids = [30689, 30693, 30419, 30421, 30568, 30420, 30625, 30676, 30677, 30719]
    sub_spells = {}
    for sid in sub_ids:
        sp = SPELLS[str(sid)]
        sub_spells[str(sid)] = {'name': sp['name']['fr'], 'adminName': sp.get('adminName'), 'typeId': sp['typeId'],
                                'levels': [dict(cast_conditions(LEVELS[str(l)]),
                                                effects=[norm_effect(x) for x in LEVELS[str(l)]['effects']])
                                           for l in sp['spellLevels'] if str(l) in LEVELS],
                                'source': f'{API}/spells/{sid}'}
    summons = {}
    for mid in ('7985', '7986'):
        m = MONSTERS[mid]
        g = m['grades'][0]
        summons[mid] = {'name': m['name']['fr'], 'nickname': 'Poutch', 'level': g['level'], 'hp': g['lifePoints'],
                        'ap': g['actionPoints'], 'mp': g['movementPoints'], 'resistances': 0,
                        'startingSpellLevelId': g['startingSpellId'], 'useSummonSlot': m['useSummonSlot'],
                        'canBePushed': m['canBePushed'], 'canSwitchPos': m['canSwitchPos'],
                        'summonedBy': 30403 if mid == '7985' else 30569, 'source': f'{API}/monsters/{mid}'}
    states = {}
    for sid in (5900, 157, 7, 5970, 5994, 5968, 6027, 5916, 5967, 5980, 5971, 6003, 6004, 6005, 6006, 6007, 6008, 6009):
        s = STATES.get(str(sid))
        if s:
            states[str(sid)] = {'name': s['name']['fr'],
                                'flags': sorted(k for k, v in s.items() if v is True),
                                'source': f'{API}/spell-states/{sid}'}
    doc = {
        'archetype': archetype,
        'meta': {
            'generatedBy': 'tools/archetypes/build_archetype_acrobate.py',
            'generatedOn': datetime.date.today().isoformat(),
            'dataSource': 'DofusDB (client DOFUS 3), extraction research/raw/dofusdb (2026-09-28)',
            'conventions': {
                'effects': "Chaque effet porte real=true s'il est exécuté, clientOnly=true s'il ne sert qu'à l'infobulle / la prévisualisation (forClientOnly). Le simulateur ne doit exécuter QUE les effets real, dans l'ordre 'order', et dérouler subSpell pour les effets 1160/792/1017/1018/2160.",
                'zones': "zone.raw = lettre + param1[,param2] ; cellCount calculé avec tools/mechanics/zones.py (lanceur 300, cible à 2 cases en ligne).",
                'pushDirection': "poussée : origine = case du LANCEUR si la cible est sur la case ciblée, sinon la case ciblée (centre de zone) ; axe dominant (getLookDirection4) ou diagonale exacte ; diagonale ⇒ ceil(n/2) pas (tools/mechanics/movement.py).",
                'executedSpells': "Pour 1160 (CasterExecuteSpell) la case ciblée du sous-sort est la case de chaque cible ⇒ la poussée part du lanceur.",
                'damage': 'tools/mechanics/damage.py (portage client) ; Force 6000 ⇒ ×61.',
                'confidence': 'haute / moyenne / basse ; FAIT vérifié = donnée du client ; FAIT rapporté = guide/vidéo ; HYPOTHÈSE sinon.',
            },
            'targetMaskLegend': {k: {'meaning': v[0], 'confidence': v[1]} for k, v in MASK_LEGEND.items()},
            'triggerLegend': {k: {'meaning': v[0], 'confidence': v[1]} for k, v in TRIGGER_LEGEND.items()},
            'sources': [f'{API}/spells/<id>', f'{API}/spell-levels/<id>', f'{API}/spell-states/<id>', f'{API}/monsters/<id>', DPLN,
                        'research/notes/50_sources_web.md', 'research/notes/60_videos.md', 'research/notes/40_carte_positions.md'],
        },
        'baseStats': base_stats,
        'bonuses': bonuses,
        'bonusMechanism': {
            'offer': "À chaque début de tour global, 3 des 6 bonus de l'archétype sont proposés (fenêtre « Choisis une amélioration permanente ! », combat en pause) ; le choix est permanent et cumulable (DPLN, capture ark26gladia41).",
            'data': "Le sort de choix (ex. 30595) porte un effet d'affichage forClientOnly et exécute (792) le niveau correspondant de 30590 « Acclamations de la foule [Acrobate] » (durée -1). Tirage des 3 propositions : côté serveur (non présent dans les données).",
            'dplnPriority': 'PM et PA (DPLN) ; vidéos : PO en priorité pour l\'Acrobate (Huz, cardxc 09:00, Koza), puis PA/PM.',
        },
        'spells': spells,
        'subSpells': sub_spells,
        'summons': summons,
        'states': states,
        'pushDamage': push_damage_table(),
        'workedExamples': {'T1_wave1_videur': worked_example_v1()},
        'discrepancies': DISCREPANCIES,
    }
    return doc


def main():
    doc = build()
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('écrit', os.path.relpath(OUT, ROOT), '-', len(doc['spells']), 'sorts,', len(doc['bonuses']), 'bonus')
    if '--summary' in sys.argv:
        for s in doc['spells']:
            for k in ('normal', 'upgraded'):
                lv = s['levels'][k]
                if not lv:
                    continue
                ed = lv.get('expectedDamage')
                eff = '; '.join(f"{'R' if x['real'] else 'c'}{x['effectId']}:{x['label'] or (x['subSpell']['name'] + ' niv.' + str(x['subSpell']['grade']))}[{x['zone']['raw']}/{x['zone'].get('cellCount')}]" for x in lv['effects'])
                print(f"{s['id']:>5} {k:8} {s['name']:<26} PA{lv['apCost']} PO{lv['range']['min']}-{lv['range']['max']} crit{lv['effectiveCritChance']} | {eff}")
                if ed:
                    print('        ', json.dumps({kk: ed[kk] for kk in ('vsNeutral', 'vsVulnerable')}, ensure_ascii=False))
        print(json.dumps(doc['pushDamage']['rows'][:4], ensure_ascii=False))


if __name__ == '__main__':
    main()
