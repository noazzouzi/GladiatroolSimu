#!/usr/bin/env python3
"""Génère research/data/archetype_magicien.json : fiche normalisée de l'archétype MAGICIEN du Gladiatrool
(nom interne « Guérisseur ») pour le simulateur.

Sources :
* données du client DOFUS 3 via DofusDB (research/raw/dofusdb/*.json, extraction du 2026-09-28) = FAIT vérifié ;
* noms d'actions DOFUS 3 (research/data/action_ids_dofus3.json) ;
* formules de dégâts / soins / zones du moteur (tools/mechanics/damage.py, zones.py, geometry.py, movement.py :
  portages du client écrits par l'agent « formules », utilisés en lecture seule) ;
* carte de combat (research/data/map_139988488.json, research/data/map_annotations.json) ;
* guide DPLN https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026) = FAIT rapporté (comparaison),
  y compris le relevé manuel des captures d'infobulles (images consultées le 2026-09-28, non versionnées).

Usage : python3 tools/archetypes/build_archetype_magicien.py [--summary]
Stdlib uniquement. Idempotent (hors champ meta.generatedOn).
"""
from __future__ import annotations

import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'mechanics'))
import damage as D  # noqa: E402
import geometry as G  # noqa: E402
import movement as MV  # noqa: E402
import zones as Z  # noqa: E402

RAW = os.path.join(ROOT, 'research', 'raw', 'dofusdb')
OUT = os.path.join(ROOT, 'research', 'data', 'archetype_magicien.json')
H, M, B = 'haute', 'moyenne', 'basse'
API = 'https://api.dofusdb.fr'
DPLN = 'https://www.dofuspourlesnoobs.com/gladiatrool.html'
IMG = 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/'


def load(name, base=RAW):
    with open(os.path.join(base, name), encoding='utf-8') as f:
        return json.load(f)


SPELLS = load('spells.json')
LEVELS = load('spell_levels.json')
STATES = load('spell_states.json')
MONSTERS = load('monsters.json')
CATALOG = load('effects_catalog_fr.json')
ACTIONS = load('action_ids_dofus3.json', os.path.join(ROOT, 'research', 'data'))['actionIds']

# ------------------------------------------------------------------------------------------------
# Légendes (masques, déclencheurs) — mêmes conventions que la fiche Acrobate / note 70
# ------------------------------------------------------------------------------------------------
MASK_LEGEND = {
    'a': ('alliés du lanceur (lanceur inclus)', M),
    'A': ('ennemis du lanceur', H),
    'g': ('alliés SAUF le lanceur', M),
    'c': ('le lanceur (variante ; n\'est ciblé que si le lanceur est dans la zone de l\'effet)', M),
    'C': ('le lanceur (ajouté même hors zone)', H),
    'j': ('invocations alliées', M),
    'x': ('masque inconnu (script d\'animation) — sans effet de jeu', B),
    'U': ('combattant en train d\'apparaître (masque technique)', B),
    'E#': ("la cible possède l'état #", H),
    'e#': ("la cible ne possède pas l'état #", H),
    '*E#': ("le LANCEUR possède l'état #", M),
    'F#': ('la cible est le monstre #', H),
    'f#': ("la cible n'est pas le monstre #", H),
}
TRIGGER_LEGEND = {
    'I': ('immédiat', H),
    'D': ('quand le porteur subit des dommages (hors dommages de poussée)', H),
    'TB': ('au début du tour du porteur', H),
    'TE': ('à la fin du tour du porteur', H),
    'X': ('à la mort du porteur', H),
    'TR#': ("quand le SEUIL de PV posé par le sort # est atteint (« Threshold Reached ») — HYPOTHÈSE forte (description de 30620)", M),
}
EXECUTORS = {
    1160: ('CasterExecuteSpell', "le LANCEUR exécute le sous-sort sur chaque cible de l'effet (la cible devient la case ciblée du sous-sort)"),
    792: ('TargetExecuteSpell', "chaque CIBLE de l'effet exécute le sous-sort sur sa propre case (pour un effet déclenché : le PORTEUR du buff)"),
}
KIND = {
    100: 'dommages', 3001: 'soin (neutre, boosté par la Force)', 1109: 'soin en % des PV max (non boosté)',
    2020: 'soin en % des dommages subis (splash heal, non boosté)', 1040: 'bouclier (valeur fixe)',
    111: 'boost PA', 128: 'boost PM', 117: 'boost PO', 125: 'boost Vitalité', 153: 'malus Vitalité',
    115: 'boost % critique', 414: 'boost dommages de poussée', 1171: 'boost % dommages finaux',
    1172: 'malus % dommages finaux', 2971: 'boost % soins finaux', 2807: 'boost % résistance distance',
    169: 'retrait de PM (non esquivable)', 776: 'boost % érosion', 132: 'désenvoûtement',
    950: 'état (ajout)', 951: 'état (retrait)', 2872: 'seuil de PV', 147: 'résurrection',
    406: "dissipe les effets d'un sort", 3406: 'oubli du sort (usage unique)', 3405: 'apprend un sort temporaire',
    3407: 'durée du prochain tour', 3793: 'script visuel (FX) sur la cible', 666: 'aucun effet', 335: 'apparence',
    1160: 'exécution de sous-sort', 792: 'exécution de sous-sort', 5: 'poussée',
}
STAT_KEY = {111: 'ap', 128: 'mp', 117: 'range', 125: 'vitality', 153: 'vitality', 115: 'critPercent',
            414: 'pushDamage', 1171: 'finalDamagePercent', 1172: 'finalDamagePercent', 2971: 'finalHealPercent',
            2807: 'rangedResPercent', 776: 'erosionPercent', 169: 'mp', 1040: 'shield'}


def action_name(eid):
    v = ACTIONS.get(str(eid))
    return v[0] if isinstance(v, list) and v else v


def state_name(sid):
    s = STATES.get(str(sid))
    return s['name']['fr'] if s else None


def spell_name(sid):
    s = SPELLS.get(str(sid))
    return re.sub(r'<[^>]+>', '', s['name']['fr']).strip() if s else None


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
    out = []
    for t in [x for x in trig.split('|') if x]:
        key = 'TR#' if t.startswith('TR') and t[2:].isdigit() else t
        desc, conf = TRIGGER_LEGEND.get(key, ('non documenté', B))
        item = {'token': t, 'meaning': desc, 'confidence': conf}
        if key == 'TR#':
            item['spell'] = {'id': int(t[2:]), 'name': spell_name(int(t[2:]))}
        out.append(item)
    return out


def theoretical_cells(shape, r, rmin):
    if shape == 'P':
        return 1
    if shape == 'X':
        return (0 if rmin > 0 else 1) + 4 * (r - max(rmin - 1, 0))
    if shape == 'C':
        full = 1 + 2 * r * (r + 1)
        inner = 1 + 2 * (rmin - 1) * rmin if rmin > 0 else 0
        return full - inner
    return None


def zone_info(zd):
    z = Z.SpellZone.from_zone_descr(zd)
    shape = z.shape
    info = {'raw': f"{shape}{zd['param1']}" + (f",{zd['param2']}" if zd.get('param2') else ''),
            'shape': shape, 'shapeCode': zd['shape'], 'shapeName': Z.SHAPE_NAMES.get(shape, '?'),
            'radius': z.radius, 'minRadius': z.min_radius}
    if shape in 'Aa':
        info['cellCount'] = 'toute la carte'
    else:
        theo = theoretical_cells(shape, z.radius, z.min_radius)
        info['cellCount'] = theo if theo is not None else len(set(z.cells(300, 300)))
        if z.radius >= 1 and shape not in 'P':
            info['aoeEfficiencyByDistance'] = {str(d): round(1 - min(d * zd.get('damageDecreaseStepPercent', 10),
                                                                     100) / 100, 2)
                                               for d in range(0, z.radius + 1)}
    if (zd.get('damageDecreaseStepPercent'), zd.get('maxDamageDecreaseApplyCount')) != (10, 4):
        info['aoeMalus'] = {'stepPercent': zd.get('damageDecreaseStepPercent'),
                            'maxSteps': zd.get('maxDamageDecreaseApplyCount')}
    return info


def effect_label(e):
    eid = e['effectId']
    if eid in (950, 951):
        return f"{'État' if eid == 950 else 'Enlève l’état'} {state_name(e['value'])} ({e['value']})"
    if eid == 3406:
        lv = LEVELS.get(str(e['value']))
        own = lv is not None and lv['spellId'] == e['spellId']
        return (f"Désapprend le sort temporaire (spell-level {e['value']})"
                + (" : le sort s'oublie lui-même ⇒ usage unique" if own else ''))
    if eid == 3405:
        return f"Apprend le sort temporaire (spell-level {e['value']})"
    if eid == 406:
        return f"Enlève les effets du sort {e['value']} ({spell_name(e['value'])})"
    if eid == 147:
        return f"Ressuscite un allié avec {e['value']} % de sa vie"
    if eid == 3793:
        return f"Script visuel {e['value']} (FX)"
    if eid == 3407:
        return f"Durée du prochain tour : {e['value']} secondes"
    fr = (CATALOG.get(str(eid)) or {}).get('fr') or ''
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    lab = fr.replace('#1{{~1~2 à -}}#2', f"{lo}" + (f" à -{hi}" if hi != lo else ''))
    lab = lab.replace('#1{{~1~2 à }}#2', f"{lo}" + (f" à {hi}" if hi != lo else '')).replace('#1', str(e['diceNum']))
    lab = lab.replace('#2', str(e['diceSide'])).replace('#3', str(e['value']))
    lab = lab.replace('{{~ps}}', 's' if lo > 1 else '').replace('{{~zs}}', '')
    return lab


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


def norm_effect(e, depth=0, seen=None):
    seen = set() if seen is None else seen
    eid = e['effectId']
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    out = {
        'order': e['order'], 'effectId': eid, 'action': action_name(eid), 'kind': KIND.get(eid, '?'),
        'label': effect_label(e) if eid not in EXECUTORS else None,
        'real': not e['forClientOnly'], 'clientOnly': e['forClientOnly'], 'visibleInTooltip': e['visibleInTooltip'],
        'diceNum': e['diceNum'], 'diceSide': e['diceSide'], 'value': e['value'],
        'targetMask': e['targetMask'], 'targets': decode_mask(e['targetMask']),
        'trigger': e['triggers'], 'triggerDecoded': decode_trigger(e['triggers']),
        'duration': e['duration'], 'delay': e['delay'], 'triggerDuration': e['effectTriggerDuration'],
        'dispellable': e['dispellable'],
        'dispellableMeaning': {1: 'désenvoûtable (Délivrance)', 2: 'retiré à la mort', 3: 'désenvoûtement fort seulement',
                               4: 'jamais'}.get(e['dispellable']),
        'random': e['random'], 'group': e['group'],
        'element': {0: 'neutre', -1: None, 5: None}.get(e['effectElement'], e['effectElement']),
        'zone': zone_info(e['zoneDescr']),
    }
    if eid in (100, 3001):
        out['min'], out['max'] = lo, hi
        out['boostedRange'] = [D.sender_damage(lo, eid, ARCH), D.sender_damage(hi, eid, ARCH)]
    if eid in STAT_KEY:
        out['stat'] = STAT_KEY[eid]
        out['amount'] = -lo if eid in (153, 169, 1172) else lo
    if eid in (1109, 2020, 2872):
        out['percent' if eid != 2872 else 'thresholdHp'] = lo
    if eid in (950, 951):
        out['state'] = {'id': e['value'], 'name': state_name(e['value'])}
    if eid in (3405, 3406):
        lv = LEVELS.get(str(e['value']))
        out['spellLevel'] = {'id': e['value'], 'spellId': lv['spellId'] if lv else None,
                             'name': spell_name(lv['spellId']) if lv else None}
    if eid == 406:
        out['spell'] = {'id': e['value'], 'name': spell_name(e['value'])}
    if eid in EXECUTORS:
        sid, grade = e['diceNum'], e['diceSide']
        sp = SPELLS.get(str(sid))
        lvl_id = sp['spellLevels'][grade - 1] if sp and 0 < grade <= len(sp['spellLevels']) else None
        sub = {'spellId': sid, 'grade': grade, 'spellLevelId': lvl_id, 'name': spell_name(sid),
               'adminName': sp.get('adminName') if sp else None,
               'executor': EXECUTORS[eid][0], 'executorMeaning': EXECUTORS[eid][1]}
        key = (sid, grade)
        if lvl_id and key not in seen and depth < 4 and str(lvl_id) in LEVELS:
            lv = LEVELS[str(lvl_id)]
            sub['castConditions'] = cast_conditions(lv)
            sub['effects'] = [norm_effect(x, depth + 1, seen | {key}) for x in lv['effects']]
        out['subSpell'] = sub
    if eid in (3793,):
        out['note'] = "value = id de script d'animation : effet purement visuel (HYPOTHÈSE haute)"
    return out


# ------------------------------------------------------------------------------------------------
# Statistiques et calculs (dégâts, soins)
# ------------------------------------------------------------------------------------------------
ARCH = D.Stats(strength=6000, crit=10, push_damage=1000, max_hp=30000, hp=30000)
TROLL = D.Stats(is_player=False, max_hp=10 ** 9, hp=10 ** 9)
VULN = [D.Multiplier(200, ('D',))]
HEAL_MULTS = [(100, 'aucun bonus'), (120, 'Amplification (+20 %) OU 1 Acclamation soignante (+20 %)'),
              (140, 'Amplification améliorée (+40 %) OU Amplification + 1 Acclamation'),
              (160, 'Amplification améliorée + 1 Acclamation OU Amplification + 2 Acclamations')]


def mean_final(lo, hi, crit, mults, caster=ARCH, action=100):
    vals = [D.compute_hit(r, action, caster, TROLL, melee=False, critical_effect=crit,
                          target_multipliers=mults).final for r in range(lo, hi + 1)]
    return min(vals), max(vals), round(sum(vals) / len(vals), 1)


def expected_damage_for(lv, caster=ARCH, extra_crit=0, label=None):
    dmg = [e for e in lv['effects'] if e['effectId'] == 100 and not e['forClientOnly']]
    cdmg = [e for e in lv['criticalEffect'] if e['effectId'] == 100 and not e['forClientOnly']]
    if not dmg:
        return None
    e = dmg[0]
    p = D.critical_chance(lv['criticalHitProbability'], caster.crit + extra_crit) / 100
    res = {'critChance': round(p * 100)}
    if label:
        res['context'] = label
    for key, mults in (('vsNeutral', []), ('vsVulnerable', VULN)):
        lo, hi, avg = mean_final(e['diceNum'], e['diceSide'] or e['diceNum'], False, mults, caster)
        block = {'normal': {'min': lo, 'max': hi, 'avg': avg}}
        exp = avg
        if cdmg:
            c = cdmg[0]
            clo, chi, cavg = mean_final(c['diceNum'], c['diceSide'] or c['diceNum'], True, mults, caster)
            block['critical'] = {'min': clo, 'max': chi, 'avg': cavg, 'reachable': p > 0}
            exp = (1 - p) * avg + p * cavg
        block['expectedPerCast'] = round(exp)
        block['expectedPerAP'] = round(exp / lv['apCost'], 1)
        res[key] = block
    return res


def expected_damage(lv):
    res = expected_damage_for(lv)
    if res:
        res['formula'] = ('int(jet × (100 + Force 6000 + Puissance 0) / 100) ; Troolls : 0 % de résistance ; '
                          'Vulnérable = multiplicateur 1163 ×200 % (déclencheur D) ; espérance = (1-p)·moy(normal) + p·moy(critique)')
        res['casterStats'] = {'strength': 6000, 'power': 0, 'crit%': 10, 'critDamage': 0}
    return res


def heal_value(roll, eff=1.0, mult=100, stats=ARCH):
    """Soin 3001 : int(jet × 61) → × efficacité de zone (tronqué) → × soins finaux [143]/100 (tronqué)."""
    v = D.sender_damage(roll, 3001, stats)
    v = int(v * eff)
    return int(v * (mult / 100))


def heal_stats(lo, hi, eff, mult):
    vals = [heal_value(r, eff, mult) for r in range(lo, hi + 1)]
    return min(vals), max(vals), round(sum(vals) / len(vals), 1)


def expected_heal(lv):
    heals = [e for e in lv['effects'] if e['effectId'] == 3001 and not e['forClientOnly']]
    cheals = [e for e in lv['criticalEffect'] if e['effectId'] == 3001 and not e['forClientOnly']]
    if not heals:
        return None
    e = heals[0]
    z = Z.SpellZone.from_zone_descr(e['zoneDescr'])
    dists = list(range(0, z.radius + 1)) if z.shape in 'CX' and z.radius >= 1 else [0]
    p = D.critical_chance(lv['criticalHitProbability'], ARCH.crit) / 100
    rows = []
    for mult, why in HEAL_MULTS:
        for d in dists:
            eff = (100 - min(d * 10, 40)) / 100 if z.shape in 'CX' else 1.0
            lo, hi, avg = heal_stats(e['diceNum'], e['diceSide'] or e['diceNum'], eff, mult)
            row = {'healMultiplier': mult, 'bonusContext': why, 'distanceFromCenter': d, 'aoeEfficiency': eff,
                   'normal': {'min': lo, 'max': hi, 'avg': avg}}
            exp = avg
            if cheals and p > 0:
                c = cheals[0]
                clo, chi, cavg = heal_stats(c['diceNum'], c['diceSide'] or c['diceNum'], eff, mult)
                row['critical'] = {'min': clo, 'max': chi, 'avg': cavg}
                exp = (1 - p) * avg + p * cavg
            row['expected'] = round(exp)
            rows.append(row)
    return {'formula': ('int(jet × (100 + Force 6000)/100) [la Puissance ne s\'applique pas aux soins] → × efficacité de '
                        'zone (−10 % par case depuis le centre, max −40 %) → × (100 + Σ soins finaux %)/100 → plafonné aux '
                        'PV manquants de la cible'),
            'trigger': e['triggers'], 'critChance': round(p * 100), 'rows': rows}


def mama_damage_table():
    """Dommages d'un sort de Mama Troollette sur un archétype, selon ses dommages finaux (faveurs, objectifs, malus)."""
    mama = LEVELS[str(SPELLS['30393']['spellLevels'][0])]  # Mitroollette de Poings
    e = [x for x in mama['effects'] if x['effectId'] == 100 and not x['forClientOnly']][0]
    lo, hi = e['diceNum'], e['diceSide']
    rows = []
    for k in (0, 3, 5):
        for debuff, lab in ((0, 'aucun malus'), (15, 'Vague de Dégradation (−15 %)'), (30, 'Vague améliorée (−30 %)'),
                            (35, 'Démotivation (−35 %)'), (50, 'Démotivation + Vague (−50 %)'),
                            (65, 'Démotivation + Vague améliorée (−65 %)')):
            df = 100 + 25 - 5 * k - debuff
            caster = D.Stats(strength=4500, final_damage=df, is_player=False)
            target = D.Stats(max_hp=30000, hp=30000)
            vals = [D.compute_hit(r, 100, caster, target, melee=False).final for r in range(lo, hi + 1)]
            target15 = D.Stats(max_hp=30000, hp=30000, recv_ranged=85)
            vals15 = [D.compute_hit(r, 100, caster, target15, melee=False).final for r in range(lo, hi + 1)]
            rows.append({'objectivesDone': k, 'debuff': lab, 'mamaFinalDamagePercent': df,
                         'hitOnArchetype': {'min': min(vals), 'max': max(vals), 'avg': round(sum(vals) / len(vals))},
                         'hitOnMagicienWith1RangedRes15': {'min': min(vals15), 'max': max(vals15),
                                                           'avg': round(sum(vals15) / len(vals15))}})
    return {'spell': 'Mitroollette de Poings (30393) : 93-108 dommages neutres, zone C3, PO ≤ 8 ; Mama Force 4500 (×46)',
            'formula': 'dommages finaux de Mama = 100 + 25 (Faveurs de la foule, 30724) − 5 × objectifs (30659 niv.2) − malus 1172 du Magicien ; '
                       'les 1171/1172 s\'ADDITIONNENT dans la même stat [107] (client) ; distance ⇒ Résistance distance applicable',
            'source': f'{API}/spell-levels/{mama["id"]} ; spells 30724, 30659, 30607, 30413',
            'confidence': M,
            'note': "Catastrooll (+20 % dommages finaux, durée 0) non inclus. Hypothèse : Mama n'a aucune résistance/bonus hors ces effets.",
            'rows': rows}


def amplification_impact():
    """Effet d'Amplification sur les alliés (calculé avec les sorts réels du Dompteur et la formule de poussée)."""
    imp = LEVELS[str(SPELLS['30395']['spellLevels'][0])]      # Impact (sort de départ du Dompteur)
    gro = LEVELS[str(SPELLS['30396']['spellLevels'][0])]      # Grondement Grandissant
    out = {'dompteur': [], 'acrobate': [], 'magicien': []}
    for lvname, lv in (('Impact 30395 (68-74 / crit 82-89, C2)', imp), ('Grondement Grandissant 30396 (82-92 / 98-110, X1)', gro)):
        for label, df, crit in (('sans Amplification', 100, 0), ('Amplification (+20 % DF, +30 % crit)', 120, 30),
                                ('Amplification améliorée (+40 % DF, +50 % crit)', 140, 50)):
            st = D.Stats(strength=6000, crit=10, final_damage=df)
            ed = expected_damage_for(lv, st, extra_crit=crit, label=label)
            out['dompteur'].append({'spell': lvname, 'context': label, 'critChance': ed['critChance'],
                                    'vsVulnerableExpected': ed['vsVulnerable']['expectedPerCast'],
                                    'vsNeutralExpected': ed['vsNeutral']['expectedPerCast'],
                                    'vsVulnerableCritMax': ed['vsVulnerable']['critical']['max']})
    for label, dopou in (('base (1000 DoPou)', 1000), ('Amplification (+500)', 1500), ('Amplification améliorée (+1000)', 2000),
                         ('Amplification améliorée + Dégagez ! (+2000)', 3000)):
        out['acrobate'].append({'context': label, 'pushDamageStat': dopou,
                                'collisionDamagePerRemainingCell': MV.collision_damage(1, 200, dopou, 0),
                                'collisionDamage3Cells': MV.collision_damage(3, 200, dopou, 0)})
    pul = LEVELS[str(SPELLS['30409']['spellLevels'][0])]
    for label, mult in (('sans', 100), ('Amplification (+20 % soins finaux)', 120), ('Amplification améliorée (+40 %)', 140)):
        lo, hi, avg = heal_stats(44, 48, 1.0, mult)
        clo, chi, cavg = heal_stats(53, 58, 1.0, mult)
        out['magicien'].append({'context': label, 'pulsationCenterHeal': {'normal': [lo, hi], 'critical': [clo, chi],
                                                                         'expected': round(0.6 * avg + 0.4 * cavg)}})
    return {'note': "Les bonus d'Amplification (1171, 115, 414, 2971) durent 3 tours du Magicien ; l'état Amplifié (5968) 4 tours "
                    "⇒ ré-application possible 4 tours après (masque e5968). Les masques sont évalués AVANT l'application des effets "
                    "(le client calcule toutes les listes de cibles au lancer) : sinon l'état posé en effet 0 bloquerait les effets 2-7.",
            'values': out, 'source': f'{API}/spell-levels/80516 et 80791 ; Impact {API}/spell-levels/{imp["id"]}',
            'confidence': H}


def geometry_block():
    path = os.path.join(ROOT, 'research', 'data', 'map_139988488.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        mp = json.load(f)
    sc = mp['specialCells']
    walk, pics = set(sc['fightWalkableCells']), set(sc['glyphFightWalkableCells'])
    starts = [286, 287, 314, 315]
    c2 = sorted(c for c in walk if all(G.distance(c, s) <= 2 for s in starts))
    c3 = sorted(c for c in walk if all(G.distance(c, s) <= 3 for s in starts))
    reach = []
    for s in starts:
        row = {'cell': s, 'xy': list(G.cell_to_xy(s)), 'minDistanceToPics': min(G.distance(s, p) for p in pics)}
        for r, lab in ((5, 'Pulsation (PO 5)'), (6, 'Pulsation +1 PO / Délivrance / Protection'), (7, 'Vague de Dégradation (PO 7)'),
                       (8, 'Vents Contraires / Amplification (PO 8)'), (9, 'Vents +1 PO')):
            row[f'picsCellsWithinRange{r}'] = sum(1 for p in pics if G.distance(s, p) <= r)
        reach.append(row)
    return {
        'startCells': starts,
        'startCellsPairwiseDistance': 'toutes à distance 2 les unes des autres, à 1 case du centre 300 (FAIT vérifié, carte)',
        'pulsationHealsAll4StartCellsFromTargets': c2,
        'pulsationImprovedOrRegainHealsAll4From': c3,
        'regainVigoureuxC3FromAnyStartCellCoversAll4': True,
        'picsReachFromStartCells': reach,
        'note': ("Les pics sont à ≥ 6 cases des cases de départ : Pulsation (PO 0-5) ne touche un Trooll des pics qu'après 1 PM "
                 "ou un bonus +1 PO ; Vents Contraires (1-8) et Vague (1-7) l'atteignent sans bouger. Ligne de vue : seules les "
                 "entités bloquent dans l'arène (note 41). Distances en cases (Manhattan MapPoint), bords non bloquants."),
        'source': 'research/data/map_139988488.json (carte du client) ; tools/mechanics/geometry.py',
    }


def worked_example_t1():
    """T1, vague 1 : l'Acrobate a poussé les Troollibres 242 → 199 et 358 → 402 (fiche Acrobate, exemple vérifié) ;
    que peut frapper le Magicien depuis chaque case de départ, alliés sur les 3 autres cases ?"""
    path = os.path.join(ROOT, 'research', 'data', 'map_139988488.json')
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as f:
        mp = json.load(f)
    los = {c['id']: c['los'] for c in mp['cells']}
    starts, trolls = [286, 287, 314, 315], [199, 402]
    spells = (('Pulsation d\'Énergie', 0, 5), ('Pulsation +1 PO', 0, 6), ('Frappe Repoussoir', 1, 6),
              ('Vague de Dégradation', 1, 7), ('Vents Contraires', 1, 8))
    rows = []
    for m in starts:
        occ = set(starts) | set(trolls)
        row = {'magicienCell': m, 'targets': []}
        for t in trolls:
            d = G.distance(m, t)
            has_los = G.has_line_of_sight(m, t, cell_los=lambda c: los.get(c, False),
                                          blocks_los=lambda c: c in occ and c not in (m, t))
            row['targets'].append({'troll': t, 'distance': d, 'lineOfSight': has_los,
                                   'castableWithoutMoving': [n for n, lo, hi in spells if lo <= d <= hi and has_los],
                                   'pmNeededForPulsation': max(0, d - 5)})
        rows.append(row)
    return {
        'scenario': "T1, vague 1 : Troollibres poussés dans les pics en 199 et 402 (fiche Acrobate, workedExamples.T1_wave1_videur) ; "
                    "alliés sur les 3 autres cases de départ ; seules les entités bloquent la ligne de vue.",
        'results': rows,
        'productivitePlan': {
            'condition': "Empalé validé avant le tour du Magicien (un Troollibre Vulnérable tué par les Dompteurs) ⇒ Regain Vigoureux appris ; "
                         "Productivité choisie comme objectif suivant.",
            'sequence': ['Regain Vigoureux (2 PA, PO 0, C3 : couvre les 4 cases de départ) ⇒ le Magicien passe à 8 PA restants',
                         "Pulsation d'Énergie (3 PA) sur un Trooll Vulnérable à ≤ 5 PO (+1 PM si besoin) : ≈ 6 080 dégâts ; ou sur le groupe (soin ≈ 3 040)",
                         "Pulsation d'Énergie (3 PA) : 2e lancer"],
            'apBudget': '8 PA de base + 2 PA de Regain (boost immédiat sur le lanceur) = 10', 'apUsed': 8, 'spellsCast': 3,
            'note': "Regain donne +2 PA tout de suite au Magicien (8 − 2 + 2 = 8 PA restants) : après les 2 Pulsations il reste 2 PA. "
                    "Si Productivité est validée au 3e sort, Amplification (2e sort gagné) est apprise aussitôt et peut être lancée avec ces 2 PA "
                    "(HYPOTHÈSE : sort utilisable dans le même tour, comme Regain après Empalé).",
            'confidence': M,
        },
        'computedWith': 'tools/mechanics/geometry.py + research/data/map_139988488.json',
    }


# ------------------------------------------------------------------------------------------------
# Catalogue des sorts du Magicien
# ------------------------------------------------------------------------------------------------
CLASSIC = [
    # (base, amélioré, choix d'amélioration, ordre d'obtention, niveau du Spell Manager)
    (30409, 30575, 30485, 0, None),   # Pulsation d'Énergie (départ)
    (30410, 30576, 30486, 1, 1),      # Regain Vigoureux
    (30411, 30578, 30487, 2, 2),      # Amplification
    (30414, 30584, 30490, 3, 3),      # Protection Prolongée
    (30415, 30585, 30491, 4, 4),      # Délivrance
    (30412, 30579, 30488, 5, 5),      # Vents Contraires
    (30413, 30580, 30489, 6, 6),      # Vague de Dégradation
]
UNIQUES = [30606, 30607, 30620, 30621, 30622, 30623, 30615]

DPLN_TEXT = {
    30409: "Pulsation d'Énergie (sort de départ) : Soigne environ du 3 000 en zone cercle de taille 2 et frappe la cible (si c'est un ennemi) environ du 3 000 dans l'élément neutre.",
    30410: 'Regain Vigoureux : Donne 2PA et 2PM aux alliés dans une zone cercle de taille 3 pendant 2 tours.',
    30411: "Amplification : Boost l'allié ciblé en fonction de son archétype.",
    30414: "Protection Prolongée : Applique un bouclier à l'allié ciblé et le soigne au début de son prochain tour.",
    30415: 'Délivrance : Désenvoûte la cible.',
    30412: 'Vents Contraires : Inflige des dégâts neutre à la cible et retire 2PM dans une zone croix de taille 1 autour d\'elle.',
    30413: 'Vague de Dégradation : Érode, frappe dans l\'élément neutre et réduit les dommages finaux des monstres ennemis dans une zone cercle de taille 3.',
    30416: "« Frappe Repoussoir » qui inflige 1200 de dégâts neutre et repousse la cible de 2 cases. Ce sort ne possède pas d'amélioration.",
    30607: 'Démotivation des troupes : Réduit les dommages finaux de tous les monstres de 35% pendant 2 tours.',
    30620: "Immortalité du Bienfaiteur : Applique un seul à 1% des PV de l'allié ciblé, si ce seuil est atteint, l'allié récupère 50% de ses PV.",
    30606: 'Influx de Vitalité : Soigne énormément tous les alliés.',
    30621: 'Malédiction Régénérante : Pendant un tour, quand un ennemi subit des dégâts, tous les alliés sont soignés de la moitié des dégâts.',
    30622: 'Muraille collective : Applique un bouclier pendant 1 tour à tous les alliés.',
    30623: "Ultime Espoir : Si le sort est lancé sur un allié : le reconstitue, s'il est lancé sur soi-même, ressuscite le dernier allié mort avec 50% de ses PV.",
    30615: "Pense Vite : Au prochain tour, le lanceur gagne 999PA pour un tour mais n'a que 15 secondes pour les utiliser. NOTE : Ce sort peut également être obtenu par l'Acrobate et le Dompteur.",
}
DPLN_UPGRADE = {
    30409: ['Taille du cercle de soin : 2 > 3 cases'],
    30410: ["Zone d'effet : cercle > tout le monde", 'Bonus PA et PM : 2 > 3'],
    30414: ['Bouclier : 3 000 > 5 000', 'Les soins augmentent'],
    30411: ['Bonus de dommages et soin finaux : 20% > 30%', 'Bonus Critique : 20% > 30%', 'Bonus Dommages poussée : 100 > 200'],
    30415: ['Lancer par tour : 1 > 3'],
    30412: ['Taille de la croix du malus PM : 1 > 2', 'Malus PM : 2 > 3'],
    30413: ['Taille du cercle : 2 cases > 3 cases', "Malus d'érosion et de dommages finaux : 15% > 30%"],
}
DPLN_IMAGES = {
    30409: ('ark26gladia28_orig.png', 'ark26gladia48_orig.png'), 30410: ('ark26gladia46_orig.png', 'ark26gladia109_orig.png'),
    30411: ('ark26gladia53_orig.png', 'ark26gladia55_orig.png'), 30414: ('ark26gladia58_orig.png', 'ark26gladia121_orig.png'),
    30415: ('ark26gladia60_orig.png', 'ark26gladia62_orig.png'), 30412: ('ark26gladia65_orig.png', 'ark26gladia66_orig.png'),
    30413: ('ark26gladia112_orig.png', 'ark26gladia113_orig.png'),
    30607: ('ark26gladia107_orig.png', None), 30620: ('ark26gladia67_orig.png', None), 30606: ('ark26gladia108_orig.png', None),
    30621: ('ark26gladia111_orig.png', None), 30615: ('ark26gladia24_orig.png', None), 30622: ('ark26gladia49_orig.png', None),
    30623: ('ark26gladia61_orig.png', None),
}
# Relevé manuel des infobulles capturées par DPLN (images consultées le 2026-09-28)
DPLN_TOOLTIP = {
    30409: "Coût 3 PA ; Portée 0-5 (modifiable) ; Critique 30 % ; Zone cercle de 13 cases ; 2/tour ; Soins (Neutre) 44 à 48 ; Dommages (Neutre) 44 à 48 ; critique : Soins 53 à 58, Dommages 53 à 58 — IDENTIQUE aux données",
    30410: "Coût 2 PA ; Portée 0 ; Zone cercle de 25 cases ; Intervalle de relance 4 ; PA (2 tours) +2 ; PM (2 tours) +2 — IDENTIQUE",
    30411: "Coût 2 PA ; Portée 0-8 (modifiable) ; 1/tour/cible ; 2/tour ; État Amplifié (4 tours) ; ??? ; Dommages finaux (3 tours) +20 % ; Critiques (3 tours) +30 % ; ??? ; Dommages de Poussée (3 tours) +500 ; ??? ; Soins finaux occasionnés (3 tours) +20 % — IDENTIQUE (les « ??? » = en-têtes 30640-30642)",
    30414: "Coût 2 PA ; Portée 0-6 (modifiable) ; 1/tour/cible ; 2/tour ; Bouclier (1 tour) 3000 ; Soins (Neutre) 44 à 48 — IDENTIQUE",
    30415: "Coût 2 PA ; Portée 1-6 (modifiable) ; Lancer en ligne ; 1/tour ; Enlève les envoûtements — IDENTIQUE",
    30412: "Coût 3 PA ; Portée 1-8 (modifiable) ; Critique 40 % ; Zone croix de 5 cases ; 1/tour ; Dommages (Neutre) 46 à 52 ; PM (1 tour) −2 ; critique 55 à 62, −2 PM — ÉCART : critique 40 % (données 30 %)",
    30413: "Coût 2 PA ; Portée 1-7 (modifiable) ; Critique 30 % ; Zone cercle de 13 cases ; Intervalle 2 ; Érosion (1 tour) −15 % [affichage] ; Dommages 21 à 28 ; Réduit les dommages finaux occasionnés −15 % (1 tour) ; critique 25 à 34 — ÉCART : critique 30 % (données 20 %) ; icône « ? » (sort non finalisé à la capture)",
    30607: "Coût 5 PA ; Portée 0 ; Réduit les dommages finaux occasionnés −35 % (2 tours) — IDENTIQUE",
    30620: "Coût 5 PA ; Portée 1-63 ; Ne nécessite pas de ligne de vue ; Cumul max. des effets 1 ; Seuil : <sprite>PV (∞) ; Soin : 50 % des PV max — IDENTIQUE (seuil mal rendu)",
    30606: "Coût 5 PA ; Portée 0 ; Soins (Neutre) 284 à 312 — IDENTIQUE",
    30621: "Coût 5 PA ; Portée 0 ; Zone cercle de 13 cases ; Soigne 100 % des dommages subis — IDENTIQUE à l'effet d'affichage (la description dit 50 %)",
    30615: "Coût 5 PA ; Portée 0 ; Durée du prochain tour : 15 secondes (1 tour) ; PA (dans 1 tour) +999 — ÉCART : données 10 s",
    30622: "Coût 5 PA ; Portée 0 ; Bouclier (1 tour) 15000 — IDENTIQUE",
    30623: "Coût 5 PA ; Portée 0-63 ; Ne nécessite pas de ligne de vue ; Soin : 100 % des PV max ; Ressuscite un allié — IDENTIQUE",
}


def spell_desc(sid):
    d = (SPELLS[str(sid)].get('description') or {}).get('fr')
    return (d.replace('\n', ' ').replace('<b>', '').replace('</b>', '').replace('  ', ' ').strip()) if d else None


# Informations d'analyse (rédigées à partir des données + mécanique ; voir notes/1x_archetype_magicien.md)
ANALYSIS = {
    30416: {
        'realEffectsSummary': 'Poussée 2 cases (depuis le lanceur) PUIS 16-20 dommages neutres (21-25 critique, 40 % effectif) à la cible (ennemi ou invocation alliée). 976-1 220 / 1 281-1 525.',
        'pics': {'interaction': "Seul moyen du Magicien de DÉPLACER un ennemi : un Trooll à 1-2 cases des pics, en ligne avec le Magicien, entre dans les pics (2 000 + Vulnérable) ; les dommages tombent après la poussée (×2 si l'aura s'applique dès l'arrivée, HYPOTHÈSE).",
                 'confidence': M},
        'notes': ['Sort commun aux 3 archétypes, sans amélioration. 3 PA, PO 1-6 (modifiable), LdV, 2/tour.',
                  'Pour le Magicien : utile pour « Empalé » ou pour finir un Trooll au bord ; il coûte 3 PA comme Pulsation (même dégâts de base plus faibles : 16-20 contre 44-48).'],
    },
    30409: {
        'realEffectsSummary': "Case ciblée à 0-5 PO (modifiable), LdV, 2/tour. (1) Soin 44-48 (×61 = 2 684-2 928 ; critique 53-58 = 3 233-3 538) à TOUS les alliés (lanceur compris) dans un cercle de rayon 2 (13 cases) centré sur la case ciblée, avec dégressivité 100/90/80 % ; (2) 44-48 dommages neutres (mêmes jets) à l'ennemi SUR la case ciblée uniquement (zone P). Amélioré : cercle de soin de rayon 3 (25 cases, 70 % au bord), jets inchangés.",
        'pics': {'interaction': "Frapper un Trooll Vulnérable (dans les pics ou sorti depuis moins d'un tour) double les dégâts : 5 368-5 856 (critique 6 466-7 076), espérance ≈ 6 080 par lancer, ≈ 12 150 pour 2 lancers (6 PA). Les pics sont à ≥ 6 cases des cases de départ : il faut 1 PM ou +1 PO. Le soin se centre sur la case ciblée : viser un Trooll soigne les alliés au contact de ce Trooll (mêlée), viser le centre du groupe soigne tout le monde.",
                 'confidence': H},
        'notes': ["Aucune case libre/occupée requise : on peut viser une case vide (soin seul) ou le Magicien lui-même (PO 0).",
                  "Le soin ne touche jamais les ennemis (masque a) et les dommages jamais les alliés (masque A).",
                  "Placement type (vidéos) : « petits stacks » — depuis n'importe quelle case parmi 286/287/300/314/315 une Pulsation soigne les 4 cases de départ.",
                  'Soin boosté par la Force (3001 = élément neutre) et par les Soins finaux (2971) ; la Puissance ne s\'applique pas aux soins.'],
    },
    30410: {
        'realEffectsSummary': '+2 PA et +2 PM (durée 2) à tous les alliés (lanceur compris) dans un cercle de rayon 3 centré sur le lanceur (PO 0). Intervalle 4. Amélioré : +3 PA / +3 PM à TOUS les alliés (zone a, toute la carte), intervalle 4 inchangé.',
        'pics': {'interaction': "+2 PM à l'Acrobate = cases de poussée atteignables en plus ; +2 PA = un Videur / Impact supplémentaire tous les deux… Indirect mais décisif : c'est le premier sort gagné (1er objectif, en général Empalé au T1).",
                 'confidence': H},
        'notes': ["Durée 2 comptée aux débuts de tour du Magicien : un allié qui joue AVANT le Magicien en profite aux 2 tours suivants ; le Magicien lui-même en profite tout de suite (PA immédiats) et au tour suivant.",
                  "Intervalle 4 (client : relançable quand tour_courant ≥ dernier_lancer + 4) : lancé au T1 → relançable au T5. Pour couvrir l'arrivée de la Mama (T8), le lancer au T7 (alliés boostés T8 et T9) ⇒ cycle conseillé T3 puis T7 (Koclikoo : « T2/3 puis T7 »).",
                  "Le sort amélioré est un NOUVEAU sort (30576) : son intervalle repart de zéro (DPLN) ⇒ améliorer Regain juste après l'avoir lancé permet de le relancer aussitôt.",
                  "Objectif Productivité (3 sorts dans le tour) au T1 : Regain (2) + Pulsation (3) + Pulsation (3) = 8 PA (Khytrayer 04:41 « doy PA, curo, curo »)."],
    },
    30411: {
        'realEffectsSummary': "Sur un allié (PO 0-8 modifiable, LdV, 2/tour, 1/cible) qui n'est pas déjà Amplifié : état Amplifié (5968) 4 tours, puis selon l'archétype de la cible, pendant 3 tours : Dompteur +20 % dommages finaux et +30 % critique ; Acrobate +500 dommages de poussée ; Magicien +20 % soins finaux. Amélioré : +40 % DF, +50 % critique, +1 000 DoPou, +40 % soins finaux.",
        'pics': {'interaction': "Sur un Dompteur, multiplie les dégâts sur les Troolls Vulnérables : Impact ≈ 9 370 → ≈ 11 900 (+27 %) → ≈ 14 400 amélioré (+53 %) en espérance. Sur l'Acrobate, dommages de collision 283 → 408 (533 amélioré) par case restante (non doublés par Vulnérable, HYPOTHÈSE note 70).",
                 'confidence': H},
        'notes': ["Priorité DPLN/vidéos : sur les Dompteurs (« A estos le tiro el de daño siempre », Khytrayer 05:10).",
                  "Le Magicien peut s'Amplifier lui-même (PO 0) : +20 % soins finaux.",
                  "Cycle : bonus 3 tours, état 4 tours ⇒ 3 tours sur 4 par cible (relance au 4e tour après). Pour le burst du T8 sur un Dompteur qui joue AVANT le Magicien : lancer au T5, T6 ou T7.",
                  "Les en-têtes 30640/30641/30642 (effets 1160 forClientOnly) ne servent qu'à l'infobulle (« ??? » sur les captures).",
                  "La description de l'amélioration (30487 : « 20 % > 30 % », « 30 % > 50 % », « 100 > 200 ») et la table DPLN (« 20 % > 30 % » pour le critique) sont FAUSSES par rapport aux effets de 30578 (40 %, 50 %, 1 000, 40 %)."],
    },
    30414: {
        'realEffectsSummary': "Sur un allié (PO 0-6 modifiable, LdV, 2/tour, 1/cible) : bouclier 3 000 (durée 1) + buff « soin au début de ses tours » 44-48 neutres (×61 = 2 684-2 928) pendant 2 tours (triggerDuration 2). Pas de critique (0 %). Amélioré : bouclier 5 000, soin 53-58 (3 233-3 538).",
        'pics': {'interaction': "Le bouclier absorbe l'entrée dans les pics (2 000) et le glyphe de début de tour : protège un allié poussé dans les pics (par ex. par Mama au T8). Outil n°1 de l'objectif « Même pas mal » (subir un sort de Mama sans perdre de PV).",
                 'confidence': H},
        'notes': ["Bouclier non boosté, sans dégressivité ; il absorbe avant les PV et dure jusqu'au début du prochain tour du Magicien.",
                  "Soin TB : 2 déclenchements pour un allié qui joue avant le Magicien (T+1, T+2) ; HYPOTHÈSE : 1 seul sur le Magicien lui-même (le buff expire au début de son T+2 avant le déclenchement).",
                  "DPLN dit « le soigne au début de son prochain tour » (singulier) ; description du sort : « au début de ses tours » ; cardxc : « soins sur 2 tours »."],
    },
    30415: {
        'realEffectsSummary': 'Désenvoûte la cible (allié ou ennemi ; PO 1-6 modifiable, EN LIGNE, LdV, 1/tour) : retire tous ses buffs « dispellable = 1 ». Amélioré : 3/tour, 1/cible.',
        'pics': {'interaction': "N'enlève PAS Vulnérable ni le ×200 % des pics (dispellable 3). Retire en revanche l'Inébranlable de Patroolleur (Troollibre) et de Troollement de Tambour (Nitrooll) ⇒ rend la cible de nouveau poussable par l'Acrobate. À NE PAS lancer sur un allié : retire aussi Amplification (bonus seulement, l'état Amplifié reste ⇒ impossible de ré-Amplifier), Regain, Protection Prolongée, Pugnace (dispellable 1).",
                 'confidence': H},
        'notes': ["Jugé inutile par les joueurs ; « ne fonctionne dans aucun cas » (Willseir, déc. 2024, FAIT rapporté) : possible bug serveur, à vérifier.",
                  "Contre-productif pour l'objectif « Ébranlable » (achever un ennemi Inébranlable).",
                  "Portée minimale 1 : ne peut pas se cibler soi-même."],
    },
    30412: {
        'realEffectsSummary': "Case ciblée à 1-8 PO (modifiable), LdV, 1/tour : 46-52 dommages neutres (×61 = 2 806-3 172 ; critique 55-62 = 3 355-3 782, 40 % effectif) à l'ennemi sur la case, et −2 PM (durée 1, non esquivable : effet 169) aux ennemis d'une croix de rayon 1 (5 cases). Amélioré : −3 PM en croix de rayon 2 (9 cases).",
        'pics': {'interaction': "Sur un Trooll Vulnérable : 5 612-6 344 (critique 6 710-7 564), espérance ≈ 6 440. Le retrait de PM gêne la sortie des pics et l'approche des Troolls (Troollibre 6 PM, Artroolleur/Nitrooll 5, Mama 6 ; esquive PM de Mama 20 sans effet sur 169).",
                 'confidence': H},
        'notes': ['Portée 8 : touche les pics depuis les cases de départ sans bouger.',
                  "Pas de case occupée requise : on peut viser une case vide pour ne retirer que des PM.",
                  "Capture DPLN : critique 40 % (données 30 %) — probablement le taux affiché avec le +10 % du personnage."],
    },
    30413: {
        'realEffectsSummary': "Case ciblée à 1-7 PO (modifiable), LdV, intervalle 2 : +15 % érosion et −15 % dommages finaux (durée 1) aux ennemis d'un cercle de rayon 2 (13 cases), et 21-28 dommages neutres (×61 = 1 281-1 708 ; critique 25-34 = 1 525-2 074, 30 % effectif) à l'ennemi sur la case. Amélioré : cercle de rayon 3, +30 % érosion et −30 % dommages finaux.",
        'pics': {'interaction': "Sur un Trooll Vulnérable : 2 562-3 416. L'érosion (10 % de base → 25 % / 40 %) transforme une partie des dommages en perte de PV max (non soignable par Trooll de Magie) et nourrit Ombre Fracassante du Dompteur (% des PV érodés de la cible).",
                 'confidence': H},
        'notes': ["Malus de dommages finaux additif avec Démotivation (même stat) : −15 % −35 % = −50 %.",
                  "Durée 1 = jusqu'au début du prochain tour du Magicien : couvre le prochain tour de chaque ennemi touché.",
                  "Capture DPLN : critique 30 % (données 20 %)."],
    },
    30606: {
        'realEffectsSummary': 'Soigne tous les alliés (zone a, lanceur compris) de 284-312 soins neutres (×61 = 17 324-19 032 ; ×1,2 avec Amplification). Pas de critique. 5 PA, usage unique.',
        'pics': {'interaction': 'Récupération après une poussée collective dans les pics (arrivée de Mama au T8).', 'confidence': H},
        'notes': ['« Soigne énormément tous les alliés » (DPLN) ; « casi full HP » (Khytrayer 12:49).'],
    },
    30607: {
        'realEffectsSummary': "−35 % dommages finaux (durée 2) à tous les ennemis qui n'ont PAS l'état 5971 « Mama Trooll (pré fight) ». 5 PA, PO 0, usage unique.",
        'pics': {'interaction': "Réduit tous les dégâts reçus (monstres et Mama) pendant 2 tours du Magicien. La Mama n'est ciblable qu'une fois arrivée (T8) : lancé au T7 il ne la touche pas.",
                 'confidence': H},
        'notes': ["Additif avec Vague de Dégradation (−15/−30 %) et avec les −5 %/objectif de la Mama : Mama +25 % −25 % (5 objectifs) −35 % −30 % = 35 % de ses dégâts."],
    },
    30620: {
        'realEffectsSummary': "Sur un AUTRE allié (PO 1-63, sans LdV, cumul max 1) : seuil « 1 PV » permanent (2872) ; quand il est atteint (déclencheur TR30620), la cible est soignée de 50 % de ses PV max (1109, non boosté) et le sort est dissipé (406). État Endolori (5967, permanent) sur la cible. 5 PA, usage unique.",
        'pics': {'interaction': 'Assurance-vie pour le porteur du burst du T8 (Dompteur) ou un allié exposé à la poussée de Mama.', 'confidence': M},
        'notes': ["Description et DPLN : « seuil de 1 % des PV » ; donnée : 1 PV. Simuler seuil = 1 PV (écart négligeable).",
                  "Endolori (5967) est aussi posé par Immortalité du Courageux et du Berserker ; aucun sort ne le teste : rôle inconnu (marqueur ?)."],
    },
    30621: {
        'realEffectsSummary': "Pendant 1 tour (triggerDuration 1), chaque ennemi (sauf Mama pré-combat) qui subit des dommages exécute 30675 sur sa case : soin = 100 % des dommages FINAUX qu'il vient de subir (2020, splash heal non boosté) à tous les alliés du Magicien dans un cercle de rayon 2 autour de CET ennemi (dégressivité probable). État 5981 (1 tour) sur les ennemis. 5 PA, PO 0, usage unique.",
        'pics': {'interaction': "Les dommages ×2 sur Vulnérable donnent des soins ×2… mais seulement aux alliés à ≤ 2 cases du Trooll touché (les Troolls sont au bord, dans les pics) : faible valeur en pratique.",
                 'confidence': M},
        'notes': ["Description et DPLN : 50 % des dommages ; données (effet d'affichage ET effet réel) : 100 %.",
                  "Les dommages de poussée ne déclenchent pas (déclencheur D) ; les dommages des pics (glyphe) oui."],
    },
    30622: {
        'realEffectsSummary': 'Bouclier de 15 000 (durée 1, non désenvoûtable) à tous les alliés (zone a, lanceur compris). 5 PA, PO 0, usage unique.',
        'pics': {'interaction': "Lancé au T7 par le Magicien (dernier joueur), il couvre l'arrivée de Mama au T8 (poussée en ligne dans les pics : 2 000 d'entrée + ses sorts) jusqu'au début du T8 du Magicien.",
                 'confidence': H},
        'notes': ['« 15 000 de shield » (3 vidéos).'],
    },
    30623: {
        'realEffectsSummary': "PO 0-63 sans LdV. Sur un AUTRE allié : soin de 100 % de ses PV max (1109, masque g). Sur SOI (case 0) : exécute 30674 → ressuscite le dernier allié mort avec 50 % de ses PV (147). 5 PA, usage unique.",
        'pics': {'interaction': 'Filet de sécurité avant/pendant le T8.', 'confidence': H},
        'notes': ["L'effet 147 du sort principal est forClientOnly (affichage) : la résurrection réelle passe par 30674.",
                  "Cellule de réapparition non précisée par les données (HYPOTHÈSE : case de la mort ou case libre la plus proche)."],
    },
    30615: {
        'realEffectsSummary': "Prochain tour : +999 PA et tour limité à 10 s (3407 value 10) ; effets dissipés à la fin de ce tour. Commun aux 3 archétypes. 5 PA.",
        'pics': {'interaction': 'Peu rentable pour le Magicien (ses sorts sont bridés par tour/cible/intervalle ≈ 27 PA utiles) ; à laisser aux Dompteurs.', 'confidence': M},
        'notes': ['Données : 10 s ; DPLN (texte et capture) : 15 s ⇒ rééquilibrage probable.'],
    },
}


# ------------------------------------------------------------------------------------------------
# Modèle d'exécution simplifié pour le simulateur (dérivé à la main des effets RÉELS, dans l'ordre)
# ------------------------------------------------------------------------------------------------
def _pulsation(r):
    return {'steps': [
        {'op': 'heal', 'element': 'neutral', 'roll': [44, 48], 'critRoll': [53, 58], 'zone': f'C{r}', 'zoneCenter': 'targetCell',
         'affects': 'allies (caster included)', 'aoeDegression': '10 %/case', 'boostedBy': ['strength', 'finalHealPercent']},
        {'op': 'damage', 'element': 'neutral', 'roll': [44, 48], 'critRoll': [53, 58], 'zone': 'P1', 'affects': 'enemy on targetCell'}],
        'critOnce': 'un seul tirage critique par lancer (soin ET dommages en critique ensemble)'}


def _regain(n, zone):
    return {'steps': [{'op': 'boost', 'stat': 'ap', 'amount': n, 'duration': 2, 'zone': zone, 'zoneCenter': 'caster', 'affects': 'allies (caster included)'},
                      {'op': 'boost', 'stat': 'mp', 'amount': n, 'duration': 2, 'zone': zone, 'zoneCenter': 'caster', 'affects': 'allies (caster included)'}],
            'cooldown': 4}


def _ampli(df, crit, dopou, heal):
    return {'steps': [
        {'op': 'require', 'target': 'ally without state 5968'},
        {'op': 'add_state', 'state': 5968, 'name': 'Amplifié', 'duration': 4, 'on': 'target'},
        {'op': 'boost', 'stat': 'finalDamagePercent', 'amount': df, 'duration': 3, 'on': 'target if state 5899 (Dompteur)'},
        {'op': 'boost', 'stat': 'critPercent', 'amount': crit, 'duration': 3, 'on': 'target if state 5899 (Dompteur)'},
        {'op': 'boost', 'stat': 'pushDamage', 'amount': dopou, 'duration': 3, 'on': 'target if state 5900 (Acrobate)'},
        {'op': 'boost', 'stat': 'finalHealPercent', 'amount': heal, 'duration': 3, 'on': 'target if state 5901 (Magicien)'}],
        'maskEvaluation': 'toutes les cibles sont calculées avant le premier effet'}


def _protection(shield, roll):
    return {'steps': [{'op': 'shield', 'amount': shield, 'duration': 1, 'on': 'target ally'},
                      {'op': 'trigger_buff', 'on': 'target ally', 'trigger': 'TB', 'duration': 2,
                       'effect': {'op': 'heal', 'element': 'neutral', 'roll': roll, 'boostedBy': ['strength (Magicien)', 'finalHealPercent (Magicien)']}}],
            'critPossible': False}


def _delivrance(per_turn):
    return {'steps': [{'op': 'dispel', 'on': 'target (ally or enemy)', 'removes': 'buffs with dispellable == 1'}],
            'castInLine': True, 'maxCastPerTurn': per_turn}


def _vents(pm, r):
    return {'steps': [{'op': 'damage', 'element': 'neutral', 'roll': [46, 52], 'critRoll': [55, 62], 'zone': 'P1', 'affects': 'enemy on targetCell'},
                      {'op': 'debuff', 'stat': 'mp', 'amount': -pm, 'duration': 1, 'zone': f'X{r}', 'zoneCenter': 'targetCell',
                       'affects': 'enemies', 'dodgeable': False}]}


def _vague(pct, r):
    return {'steps': [{'op': 'debuff', 'stat': 'erosionPercent', 'amount': pct, 'duration': 1, 'zone': f'C{r}', 'zoneCenter': 'targetCell', 'affects': 'enemies'},
                      {'op': 'damage', 'element': 'neutral', 'roll': [21, 28], 'critRoll': [25, 34], 'zone': 'P1', 'affects': 'enemy on targetCell'},
                      {'op': 'debuff', 'stat': 'finalDamagePercent', 'amount': -pct, 'duration': 1, 'zone': f'C{r}', 'zoneCenter': 'targetCell', 'affects': 'enemies'}],
            'cooldown': 2}


SIM = {
    30416: {'steps': [{'op': 'push', 'zone': 'P1', 'affects': 'allies+enemies', 'distance': 2, 'origin': 'caster'},
                      {'op': 'damage', 'element': 'neutral', 'roll': [16, 20], 'critRoll': [21, 25], 'zone': 'P1', 'affects': 'enemies + allied summons (j)'}],
            'damageAppliedAfterPush': True},
    30409: _pulsation(2), 30575: _pulsation(3),
    30410: _regain(2, 'C3'), 30576: _regain(3, 'a (all allies)'),
    30411: _ampli(20, 30, 500, 20), 30578: _ampli(40, 50, 1000, 40),
    30414: _protection(3000, [44, 48]), 30584: _protection(5000, [53, 58]),
    30415: _delivrance(1), 30585: _delivrance(3),
    30412: _vents(2, 1), 30579: _vents(3, 2),
    30413: _vague(15, 2), 30580: _vague(30, 3),
    30606: {'steps': [{'op': 'heal', 'element': 'neutral', 'roll': [284, 312], 'zone': 'a', 'affects': 'all allies'}, {'op': 'forget_self'}]},
    30607: {'steps': [{'op': 'debuff', 'stat': 'finalDamagePercent', 'amount': -35, 'duration': 2, 'zone': 'a',
                       'affects': 'all enemies without state 5971 (Mama avant son entrée exclue)'}, {'op': 'forget_self'}]},
    30620: {'steps': [{'op': 'hp_threshold', 'amount': 1, 'duration': -1, 'on': 'target ally (not caster: PO min 1)'},
                      {'op': 'forget_self'},
                      {'op': 'trigger_buff', 'on': 'target ally', 'trigger': 'TR30620 (seuil atteint)',
                       'effects': [{'op': 'heal_percent_max_hp', 'percent': 50}, {'op': 'dispel_spell', 'spell': 30620}]},
                      {'op': 'add_state', 'state': 5967, 'name': 'Endolori', 'duration': -1, 'on': 'target ally'}]},
    30621: {'steps': [{'op': 'trigger_buff', 'on': 'all enemies without state 5971', 'trigger': 'D', 'duration': 1,
                       'effect': {'op': 'splash_heal', 'percentOfDamageTaken': 100, 'executor': 'l\'ennemi touché (792 → 30675)',
                                  'zone': 'C2', 'zoneCenter': 'damaged enemy', 'affects': "ennemis de l'ennemi = alliés du Magicien",
                                  'boosted': False, 'descriptionSays': 50}},
                      {'op': 'add_state', 'state': 5981, 'duration': 1, 'on': 'all enemies without state 5971'},
                      {'op': 'forget_self'}]},
    30622: {'steps': [{'op': 'shield', 'amount': 15000, 'duration': 1, 'zone': 'a', 'affects': 'all allies'}, {'op': 'forget_self'}]},
    30623: {'steps': [{'op': 'heal_percent_max_hp', 'percent': 100, 'on': 'target ally if not caster (mask g)'},
                      {'op': 'resurrect_last_dead_ally', 'hpPercent': 50, 'if': 'targetCell == caster cell', 'via': '792 → 30674'},
                      {'op': 'forget_self'}]},
    30615: {'steps': [{'op': 'set_next_turn_time', 'seconds': 10},
                      {'op': 'boost', 'stat': 'ap', 'amount': 999, 'delay': 1, 'duration': 1, 'on': 'caster'},
                      {'op': 'dispell_spell_at_turn_end', 'spell': 30615, 'delay': 1}, {'op': 'forget_self'}]},
}


DISCREPANCIES = [
    {'topic': 'Amplification améliorée — valeurs', 'data': '30578 (spell-level 80791) : +40 % dommages finaux, +50 % critique, +1 000 dommages de poussée, +40 % soins finaux',
     'dpln': "table : « dommages et soins finaux 20 % > 30 % ; critique 20 % > 30 % ; poussée 100 > 200 » ; description de 30487 (capture ark26gladia55) : « 20 % > 30 % ; 30 % > 50 % ; 100 > 200 »",
     'verdict': "Les EFFETS de 30578 font foi (+40/+50/+1000/+40). La description d'amélioration est fausse (DoPou 100 au lieu de 500, 30 % au lieu de 40 %) ; la table DPLN recopie en plus mal le critique (20 > 30 au lieu de 30 > 50). Base (30411) = capture (20 %, 30 %, 500, 20 %) et vidéos (cardxc 07:00, Khytrayer 05:10).",
     'confidence': H},
    {'topic': 'PV du Magicien', 'data': 'passif 30639 (sort de départ du monstre 7980) : −5 000 Vitalité (153) si le porteur a l\'état Magicien (masque C,*E5901) ⇒ 25 000 PV',
     'dpln': "30 000 PV pour tous les archétypes (DPLN) ; aucune vidéo ne montre les PV d'un Magicien transformé (Barbe Douce lit 30 000 AVANT le choix d'archétype ; Huz 02:30 « on a 30 000 de vie », archétype non précisé)",
     'verdict': "Même mécanisme que le +5 000 de l'Acrobate et le +3 000 Puissance du Dompteur, tous trois contredits par les observations (capture Acrobate 30 000 ; Impact ≈ 4 500 = ×61 sans Puissance) : critère probablement évalué avant le choix d'archétype ⇒ non appliqué. Défaut simulateur : 30 000 (option 25 000).",
     'confidence': M},
    {'topic': 'Acclamation résistante (Magicien)', 'data': '30631 → 30591 niv.6 : 15 % Résistance distance (2807)',
     'dpln': "DPLN : « 10% Résistance distance » ; bêta (Barbe Douce, Magicien, 11:04 : « bonus Vita, résistance mêlée ou portée… augmente les résistances mêlée du lanceur »)",
     'verdict': "la donnée fait foi : 15 % de résistance DISTANCE (la version bêta proposait apparemment de la résistance mêlée au Magicien).", 'confidence': H},
    {'topic': 'Vents Contraires — taux critique', 'data': 'criticalHitProbability 30 % (80517 et 80793)',
     'dpln': 'capture ark26gladia65 : « Critique 40 % »',
     'verdict': "incohérent avec la capture de Pulsation (30 % affiché pour 30 % en données) : ancienne valeur ou capture prise avec un bonus. Simuler 30 % (+10 % du personnage ⇒ 40 % effectif).",
     'confidence': M},
    {'topic': 'Vague de Dégradation — taux critique', 'data': 'criticalHitProbability 20 % (80518 et 80795)',
     'dpln': 'capture ark26gladia112 : « Critique 30 % » (icône « ? » = sort pas encore finalisé)',
     'verdict': 'rééquilibrage probable (capture ancienne). Simuler 20 % (+10 % ⇒ 30 % effectif).', 'confidence': M},
    {'topic': 'Malédiction Régénérante — pourcentage', 'data': '2020 « Soin : 100 % des dommages subis » (effet d\'affichage de 30621 ET effet réel de 30675)',
     'dpln': 'description du sort et DPLN : « 50 % des dommages » ; infobulle capturée : « Soigne 100 % des dommages subis »',
     'verdict': "écart interne au jeu (texte ≠ effet). Simuler 100 % par défaut (option 50 %). Les soins ne touchent que les alliés à ≤ 2 cases de l'ennemi touché (zone C2 de 30675), ce que ni la description (« sur les alliés ») ni DPLN (« tous les alliés ») ne disent.",
     'confidence': M},
    {'topic': 'Immortalité du Bienfaiteur — seuil', 'data': '2872 « Seuil : 1 PV » (diceNum 1) ; PO 1-63 (ne peut pas se cibler)',
     'dpln': '« seuil à 1 % des PV de l\'allié ciblé » (= description)', 'verdict': 'simuler seuil = 1 PV ; écart négligeable (1 % de 30 000 = 300).', 'confidence': M},
    {'topic': 'Protection Prolongée — soins', 'data': 'soin TB 44-48 (2 684-2 928) pendant 2 tours du Magicien (triggerDuration 2) ; amélioré 53-58',
     'dpln': '« le soigne au début de son prochain tour » ; table : « Les soins augmentent »',
     'verdict': "2 déclenchements pour un allié qui joue avant le Magicien (FAIT vérifié pour la durée ; ordre décompte/déclenchement = HYPOTHÈSE) ; cardxc 08:30 lit « 40 à 48 soins » (mauvaise lecture de 44 à 48).",
     'confidence': M},
    {'topic': 'Pense Vite — durée du tour', 'data': '3407 value 10 ⇒ 10 s', 'dpln': 'texte et capture : 15 s',
     'verdict': 'rééquilibrage probable : 10 s actuellement (mêmes conclusions que la fiche Acrobate).', 'confidence': H},
    {'topic': 'Regain Vigoureux — relance', 'data': 'minCastInterval 4 (client SpellManager.cooldown : relançable quand tour ≥ dernier + 4) ⇒ T1 → T5',
     'dpln': 'capture : « Intervalle de relance 4 » ; vidéo Huz (01:11) : « lancé au T1, il faut le relancer au T4 »',
     'verdict': 'la vidéo se trompe probablement d\'un tour (ou compte à partir de 0). Simuler T+4.', 'confidence': M},
    {'topic': 'Délivrance — fonctionnement', 'data': '132 « Enlève les envoûtements » (CharacterRemoveAllEffects) ; retire les buffs dispellable = 1 (client BasicBuff.canBeDispell)',
     'dpln': '« Désenvoûte la cible » ; forum (Willseir, déc. 2024) : « ne fonctionne dans aucun cas »',
     'verdict': "données cohérentes avec un désenvoûtement normal ; le rapport de bug n'est pas vérifiable ici. Peu d'intérêt tactique de toute façon (Vulnérable non retiré).",
     'confidence': B},
    {'topic': 'Ordre des sorts gagnés', 'data': "Spell Manager 30626 niv.1..6 (3405) : Regain Vigoureux, Amplification, Protection Prolongée, Délivrance, Vents Contraires, Vague de Dégradation ; adminName « Sort N » : Pulsation 1, Regain 2, Amplification 3, Vents 4, Vague 5, Protection 6, Délivrance 7",
     'dpln': 'même ordre que le Spell Manager (« toujours dans ce même ordre »)',
     'verdict': "concordance. Attention : l'ordre d'obtention ≠ numéro interne « Sort N » / « Amélioration N ».", 'confidence': H},
    {'topic': 'Vulnérable', 'data': '1163 « Dommages subis x200 % » ⇒ ×2', 'dpln': '« 200 % de dégâts supplémentaires » (⇒ ×3)',
     'verdict': 'la donnée fait foi : ×2 (note 70).', 'confidence': H},
]


def build():
    spells = []
    common = {'id': 30416, 'upgradedId': None, 'upgradeChoiceSpellId': None, 'name': 'Frappe Repoussoir',
              'category': 'commun', 'unlockOrder': 0, 'unlockedBy': 'départ (commun aux 3 archétypes)', 'unique': False,
              'internalOrder': None}
    entries = [(common, 30416, None)]
    for base, up, choice, order, mgr in CLASSIC:
        e = {'id': base, 'upgradedId': up, 'upgradeChoiceSpellId': choice,
             'name': spell_name(base), 'category': 'classique', 'unlockOrder': order,
             'unlockedBy': 'départ (choix de l\'archétype)' if order == 0 else
             f'objectif n°{order} (Spell Manager 30626 niv.{mgr}, effet 3405 masque E5901)',
             'unique': False, 'internalOrder': SPELLS[str(base)].get('adminName')}
        entries.append((e, base, up))
    for u in UNIQUES:
        e = {'id': u, 'upgradedId': None, 'upgradeChoiceSpellId': None, 'name': spell_name(u),
             'category': 'unique', 'unlockOrder': None,
             'unlockedBy': 'Glyphe Évènementiel (cadeau) : choix proposé (3008, contenu tiré côté serveur) — usage unique (3406 : le sort s\'oublie)',
             'unique': True, 'internalOrder': SPELLS[str(u)].get('adminName')}
        if u == 30615:
            e['sharedWith'] = ['Acrobate', 'Dompteur']
        entries.append((e, u, None))
    for e, base, up in entries:
        e['description'] = spell_desc(base)
        e['dpln'] = {'text': DPLN_TEXT.get(base), 'upgradeTable': DPLN_UPGRADE.get(base),
                     'tooltipCapture': DPLN_TOOLTIP.get(base),
                     'images': [IMG + x for x in (DPLN_IMAGES.get(base) or ()) if x], 'source': DPLN}
        normal = level_block(base)
        upgraded = level_block(up) if up else None
        e['levels'] = {'normal': normal, 'upgraded': upgraded}
        if e.get('upgradeChoiceSpellId'):
            ch = e['upgradeChoiceSpellId']
            chl = LEVELS[str(SPELLS[str(ch)]['spellLevels'][0])]
            e['upgrade'] = {'choiceSpellId': ch, 'choiceSpellLevelId': chl['id'], 'description': spell_desc(ch),
                            'boostedState': {'id': chl['effects'][0]['value'], 'name': state_name(chl['effects'][0]['value'])},
                            'forgetsSpellLevel': chl['effects'][2]['value'], 'learnsSpellLevel': chl['effects'][3]['value'],
                            'note': "L'amélioration remplace le spell-level (3406 puis 3405 : nouveau sort) : l'intervalle de relance repart de zéro (DPLN)."}
        e['effects'] = normal['effects']
        e['critEffects'] = normal['critEffects']
        an = ANALYSIS.get(base, {})
        e['realEffectsSummary'] = an.get('realEffectsSummary')
        e['pics'] = an.get('pics')
        e['notes'] = an.get('notes', [])
        e['sources'] = [f'{API}/spells/{base}'] + ([f'{API}/spells/{up}'] if up else [])
        spells.append(e)
    return spells


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
    eh = expected_heal(lv)
    if eh:
        blk['expectedHeal'] = eh
    if sid in SIM:
        blk['simModel'] = SIM[sid]
    blk['source'] = f'{API}/spell-levels/{lv["id"]}'
    return blk


def bonuses_block():
    names = {111: ('PA', 'ap'), 128: ('PM', 'mp'), 125: ('Vitalité', 'vitality'), 117: ('Portée', 'range'),
             2971: ('% Soins finaux', 'finalHealPercent'), 2807: ('% Résistance distance', 'rangedResPercent')}
    dpln = {111: '1 PA', 128: '1 PM', 125: '5 000 Vitalité', 117: '1 Portée', 2971: '20% aux soins finaux',
            2807: '10% Résistance distance'}
    out = []
    for cid in (30598, 30599, 30600, 30629, 30630, 30631):
        sp = SPELLS[str(cid)]
        lv = LEVELS[str(sp['spellLevels'][0])]
        disp, sub = lv['effects'][0], lv['effects'][1]
        real_lv = LEVELS[str(SPELLS['30591']['spellLevels'][sub['diceSide'] - 1])]
        real = real_lv['effects'][0]
        nm, key = names[real['effectId']]
        item = {'choiceSpellId': cid, 'name': sp['name']['fr'], 'adminName': sp.get('adminName'),
                'description': spell_desc(cid), 'stat': key, 'statLabel': nm, 'value': real['diceNum'],
                'effectId': real['effectId'], 'action': action_name(real['effectId']), 'duration': real['duration'],
                'permanent': real['duration'] == -1, 'stackable': True, 'dispellable': real['dispellable'],
                'realEffect': {'spellId': 30591, 'grade': sub['diceSide'], 'spellLevelId': real_lv['id']},
                'displayEffectClientOnly': disp['forClientOnly'], 'dpln': dpln[real['effectId']],
                'dplnMatches': real['effectId'] != 2807,
                'sources': [f'{API}/spells/{cid}', f'{API}/spell-levels/{real_lv["id"]}']}
        if real['effectId'] == 2807:
            item['dplnMatches'] = False
            item['note'] = 'DPLN écrit 10 % ; la donnée est 15 %. Multiplicateur reçu à distance [121] = 100 − 15·n (cible non adjacente à l\'attaquant).'
        if real['effectId'] == 125:
            item['note'] = '+5 000 PV max et courants.'
        if real['effectId'] == 2971:
            item['note'] = "S'additionne à Amplification dans la même stat [143] (100 + Σ %). N'agit pas sur 1109 (Ultime Espoir, Immortalité) ni 2020 (Malédiction Régénérante)."
        if real['effectId'] == 117:
            item['note'] = 'Agit sur Pulsation, Amplification, Protection Prolongée, Délivrance, Vents Contraires, Vague de Dégradation, Frappe Repoussoir (PO modifiable) ; pas sur Regain ni les sorts uniques.'
        out.append(item)
    return out


def main_doc():
    passive = LEVELS['80913']
    archetype = {
        'name': 'Magicien', 'internalName': 'Guérisseur',
        'role': "Support : soins, boucliers, boosts (PA/PM, Amplification) et entrave (retrait PM, érosion, malus de dommages finaux). DPLN : 3 sorts de frappe, 2 de soin, 2 de protection, 2 de boost, 1 d'entrave.",
        'stateId': 5901, 'stateName': state_name(5901),
        'choiceSpell': {'id': 30649, 'spellLevelId': 80913, 'type': '3886 Choix initial Magicien',
                        'effects': [norm_effect(x) for x in passive['effects']],
                        'note': "Lancé quand le Magicien est choisi (30608 « Choix d'Archétype », effet 3008 choix 16) : animation 30739, état 5901 permanent, 4 apparences (335 : 2745, 2742, 2741, 2740). Les champs PA/PO/lancers de 80913 recopient Pulsation d'Énergie et ne servent pas. Le sort de départ Pulsation d'Énergie n'est appris par aucun effet des données : attribution serveur (FAIT rapporté DPLN + vidéos)."},
        'tooltipHeaderSpell': {'id': 30642, 'name': 'Guérisseur :', 'note': "Libellé d'infobulle (effet 666) exécuté par Amplification (1160 forClientOnly) avant la ligne « soins finaux » ; rendu « ??? » dans les captures DPLN. 30640 = Baroudeur (Acrobate), 30641 = Gladiateur (Dompteur)."},
        'spellTypes': {'3887': 'Sorts Magicien', '3903': 'Sorts améliorés Magicien', '3843': 'Choix améliorations Magicien',
                       '3875': 'Sorts uniques (Guérisseur)', '3871': 'Buffs individuels (Acclamations)', '3868': 'Acclamations de la foule (Magicien)',
                       '3886': 'Choix initial Magicien', '3880': 'Tooltips Magicien', '3900': 'Déclenchés (uniques Magicien)'},
        'recommendedInitiative': "Joue en DERNIER dans toutes les runs gagnantes filmées (notes 50/60) ; variante Koclikoo Acro-Acro-Magicien-Dompteur (boosts avant la frappe du Dompteur). Souhait GD : Acro → Magicien → Dompteur (non suivi).",
        'bestCompositions': ['Acrobate - Dompteur - Dompteur - Magicien', 'Acrobate - Acrobate - Dompteur - Magicien'],
        'dplnPriorities': {'classicSpells': ['Regain Vigoureux', "Pulsation d'Énergie", 'Amplification'],
                           'uniqueSpells': ['Influx de Vitalité', 'Muraille collective', 'Ultime Espoir'],
                           'bonuses': ['PA', 'PM', 'soins finaux']},
    }
    base_stats = {
        'hp': 30000, 'ap': 8, 'mp': 4, 'range': 0, 'strength': 6000, 'power': 0, 'pushDamage': 1000, 'critPercent': 10,
        'critDamage': 0, 'healBonus': 0, 'finalHealPercent': 0, 'resPercent': 0, 'rangedResPercent': 0, 'erosionPercent': 10,
        'level': 200, 'element': 'neutre (tous les sorts ; les soins 3001 sont boostés par la Force)',
        'tackle': 'aucun (état 5970 : ne tacle pas, ne peut pas être taclé)', 'turnDurationSeconds': 60,
        'damageMultiplierFromStrength': 61,
        'hpVariantIfPassiveApplies': 25000,
        'sources': [
            {'claim': '30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 Dommages de poussée, 10 % Critique (tous archétypes)', 'source': DPLN, 'type': 'FAIT rapporté', 'confidence': H},
            {'claim': 'Monstre 7980 « Gladiatroolleur » : niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6 000, sort 30416', 'source': f'{API}/monsters/7980', 'type': 'FAIT vérifié', 'confidence': H},
            {'claim': "Passif 30639 (spell-level 80897) : état 5970, durée de tour 60 s, −5 000 Vitalité si état Magicien (153, masque C,*E5901), passif 30700 (Vulnérable à la sortie des pics)", 'source': f'{API}/spell-levels/80897', 'type': 'FAIT vérifié', 'confidence': H},
            {'claim': "Barbe Douce (bêta, transcription relue) : « j'ai 30000 PV » lu AVANT le choix d'archétype (00:04, run jouée en Acrobate) ; 2e run en Magicien (09:09) : « j'ai deux spells, Frappe Repoussoir et Pulsation d'Énergie » — aucune lecture de PV du Magicien", 'source': 'https://www.youtube.com/watch?v=v3cDvm3x4pw (transcription TubeLab)', 'type': 'FAIT rapporté', 'confidence': M},
        ],
        'notes': ["PV : défaut 30 000 ; si le −5 000 du passif s'appliquait : 25 000 (voir discrepancies).",
                  'Érosion de base 10 % (stat 75, FAIT rapporté, note 70).',
                  'Aucun bonus d\'Acclamation ne donne de critique au Magicien : ses sorts critiques restent à 30 %/20 % + 10 %.'],
    }
    turn_timing = {
        'rule': "Un buff de durée n posé par X perd 1 au début de chaque tour de X et disparaît à 0 (client BuffManager, note 70 §7.2).",
        'consequences': [
            "Allié qui joue AVANT le Magicien (Acrobate, Dompteurs dans la compo A-D-D-M) : un buff posé au tour t est actif pendant ses tours t+1 … t+n.",
            "Allié qui joue APRÈS le Magicien (Dompteur dans A-A-M-D) : actif pendant ses tours t … t+n−1.",
            "Le Magicien lui-même : actif pendant la fin de son tour t (PA/PM immédiats) puis ses tours t+1 … t+n−1.",
            "Malus sur les ennemis (Vents, Vague, Démotivation) : couvrent exactement n tours de chaque ennemi, quel que soit l'ordre.",
            "Bouclier (durée 1) : du lancer jusqu'au début du tour suivant du Magicien ⇒ couvre tous les tours ennemis intermédiaires.",
        ],
        'plans': {
            'regainVigoureux': "Intervalle 4 : T3 puis T7 (alliés boostés T4-T5 et T8-T9) pour avoir +PA/+PM au T8 (Mama).",
            'amplification': "Bonus 3 tours, état 4 tours : sur un Dompteur qui joue avant le Magicien, lancer au T5 (bonus T6-T8) ou au T7 (T8-T10) pour le burst du T8.",
            'murailleCollective': "T7 (couvre l'arrivée de Mama au début du T8 et les tours ennemis jusqu'au T8 du Magicien).",
            'demotivation': "T8 au plus tôt (Mama exclue tant qu'elle a l'état 5971) : couvre ses tours T9 et T10 si elle joue avant le Magicien.",
            'productivite': "T1 (après Empalé) : Regain (2) + Pulsation (3) + Pulsation (3) = 3 sorts, 8 PA.",
        },
        'confidence': M,
    }
    dispel_table = {
        'rule': "Délivrance (132) retire les buffs de la cible dont dispellable = 1 (client BasicBuff.canBeDispell : 1 = DISPELLABLE ; 3 = seulement désenvoûtement fort ; 2 = à la mort ; 4 = jamais).",
        'removable': [
            {'spell': 'Patroolleur (Troollibre 30382)', 'effects': 'Inébranlable (1 tour) + 15 % dommages finaux (2 tours)', 'dispellable': 1},
            {'spell': 'Troollement de Tambour (Nitrooll 30388)', 'effects': 'Inébranlable (1 tour) sur un allié Trooll', 'dispellable': 1},
            {'spell': 'Aspiratrooll (Troollibre 30381)', 'effects': '10 % érosion (1 tour) sur un joueur', 'dispellable': 1},
            {'spell': 'Sorts du Magicien', 'effects': 'Regain, bonus d\'Amplification (pas l\'état 5968), Protection Prolongée, Vents (−PM), Vague (érosion, −DF)', 'dispellable': 1},
            {'spell': 'Dompteur / Acrobate', 'effects': 'Prélèvement (érosion), Pugnace (Inébranlable, résistance), Coup de Sang amélioré (−10 % PV)', 'dispellable': 1},
        ],
        'notRemovable': [
            {'spell': 'Pics (30390 niv.2, 30701)', 'effects': 'Vulnérable, ×200 % dommages subis', 'dispellable': 3},
            {'spell': 'Mama (30723, 30724, 30659)', 'effects': 'Invulnérable (état 56), +25 % DF, Faveurs de la foule', 'dispellable': 3},
            {'spell': 'Sorts uniques', 'effects': 'Galvanisation, Courage fuyons, Dégagez !, Muraille, Démotivation, seuils…', 'dispellable': 3},
            {'spell': 'Acclamations', 'effects': 'bonus permanents 30589-30591', 'dispellable': 3},
        ],
        'source': f'{API}/spell-levels (champ effects[].dispellable) ; client 2.73 FightDispellableEnum / BasicBuff',
        'confidence': H,
    }
    guerisseur_objectives = [
        {'id': 30542, 'name': 'Productivité', 'text': spell_desc(30542), 'magicien': 'Regain + 2 Pulsations au T1 (8 PA, 3 sorts) ; le plus simple (vidéos).'},
        {'id': 30535, 'name': 'Même pas mal', 'text': spell_desc(30535), 'magicien': "Bouclier (Protection Prolongée 3 000/5 000, Muraille 15 000) sur l'allié visé : l'état « Vie inchangée » (5960) reste tant que les PV ne bougent pas."},
        {'id': 30524, 'name': 'Tout va bien', 'text': spell_desc(30524), 'magicien': 'Le Magicien joue en dernier : soins de zone pour remonter tout le monde > 50 %.'},
        {'id': 30462, 'name': 'Sauvez-le !', 'text': spell_desc(30462), 'magicien': "Remettre l'allié désigné à 100 % en fin de tour global (Pulsation centrée sur lui, Ultime Espoir = 100 %)."},
        {'id': 30531, 'name': "Distance d'insécurité", 'text': spell_desc(30531), 'magicien': 'Aucun outil spécifique (se valide seul sans Artroolleur, note 50).'},
    ]
    doc = {
        'archetype': archetype,
        'meta': {
            'generatedBy': 'tools/archetypes/build_archetype_magicien.py',
            'generatedOn': datetime.date.today().isoformat(),
            'dataSource': 'DofusDB (client DOFUS 3), extraction research/raw/dofusdb (2026-09-28)',
            'conventions': {
                'effects': "real=true : effet exécuté ; clientOnly=true : affichage seulement (forClientOnly). Exécuter les effets real dans l'ordre 'order', en dérouler subSpell (1160/792). Les listes de cibles de TOUS les effets sont calculées au lancer, avant le premier effet.",
                'zones': "zone.raw = lettre + param1 ; aoeEfficiencyByDistance = coefficient appliqué aux dommages ET aux soins (pas aux boucliers ni aux boosts).",
                'durations': "-1 = tout le combat ; n = n débuts de tour du LANCEUR ; triggerDuration = durée d'un buff déclenché.",
                'damage': 'tools/mechanics/damage.py (portage client) ; Force 6000 ⇒ ×61 pour les dommages ET les soins 3001.',
                'confidence': 'haute / moyenne / basse ; FAIT vérifié = donnée du client ; FAIT rapporté = guide/vidéo ; HYPOTHÈSE sinon.',
            },
            'targetMaskLegend': {k: {'meaning': v[0], 'confidence': v[1]} for k, v in MASK_LEGEND.items()},
            'triggerLegend': {k: {'meaning': v[0], 'confidence': v[1]} for k, v in TRIGGER_LEGEND.items()},
            'sources': [f'{API}/spells/<id>', f'{API}/spell-levels/<id>', f'{API}/spell-states/<id>', f'{API}/monsters/<id>', DPLN,
                        'research/notes/50_sources_web.md', 'research/notes/60_videos.md', 'research/notes/40_carte_positions.md',
                        'research/notes/70_formules_dofus.md'],
        },
        'baseStats': base_stats,
        'bonuses': bonuses_block(),
        'bonusMechanism': {
            'offer': "À chaque début de tour global, 3 des 6 bonus de l'archétype sont proposés (combat en pause) ; choix permanent et cumulable (DPLN).",
            'data': "Le sort de choix (30598…) porte un effet d'affichage forClientOnly et exécute (792) le niveau correspondant de 30591 « Acclamations de la foule [Magicien] » (durée -1, dispellable 3). Tirage des 3 propositions : côté serveur.",
            'dplnPriority': 'PA, PM, soins finaux (DPLN) ; vidéos : PO > PA > soins (Zephiron, Koza) ; Koclikoo : soins ×1 > PA ×2-3 > PM/PO ×2-3 > Vitalité (1 max) > rés. distance.',
        },
        'spells': build(),
        'subSpells': {},
        'states': {},
        'turnTiming': turn_timing,
        'dispelTable': dispel_table,
        'amplificationImpact': amplification_impact(),
        'enemyDamageReduction': mama_damage_table(),
        'geometry': geometry_block(),
        'guerisseurObjectives': guerisseur_objectives,
        'workedExamples': {'T1_wave1': worked_example_t1()},
        'discrepancies': DISCREPANCIES,
    }
    for sid in (30675, 30674, 30640, 30641, 30642, 30470, 30639):
        sp = SPELLS[str(sid)]
        doc['subSpells'][str(sid)] = {
            'name': spell_name(sid),
            'adminName': sp.get('adminName'), 'typeId': sp['typeId'],
            'levels': [dict(cast_conditions(LEVELS[str(l)]), effects=[norm_effect(x) for x in LEVELS[str(l)]['effects']])
                       for l in sp['spellLevels'] if str(l) in LEVELS],
            'source': f'{API}/spells/{sid}'}
    for sid in (5901, 5970, 5968, 5967, 5981, 5971, 5994, 157, 56, 5960, 6010, 6011, 6012, 6013, 6014, 6015, 6016):
        s = STATES.get(str(sid))
        if s:
            doc['states'][str(sid)] = {'name': s['name']['fr'], 'flags': sorted(k for k, v in s.items() if v is True),
                                       'effectsIds': s.get('effectsIds'), 'source': f'{API}/spell-states/{sid}'}
    return doc


def main():
    doc = main_doc()
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
                eff = '; '.join(f"{'R' if x['real'] else 'c'}{x['effectId']}:{x['label'] or (x['subSpell']['name'] + ' niv.' + str(x['subSpell']['grade']))}[{x['zone']['raw']}/{x['zone'].get('cellCount')}|{x['targetMask']}|d{x['duration']}]" for x in lv['effects'])
                print(f"{s['id']:>5} {k:8} {s['name']:<28} PA{lv['apCost']} PO{lv['range']['min']}-{lv['range']['max']}{'m' if lv['range']['modifiable'] else ''} crit{lv['effectiveCritChance']} /t{lv['maxCastPerTurn']} /c{lv['maxCastPerTarget']} int{lv['minCastInterval']} | {eff}")
                ed = lv.get('expectedDamage')
                if ed:
                    print('        dmg', json.dumps({kk: ed[kk] for kk in ('vsNeutral', 'vsVulnerable')}, ensure_ascii=False))
                eh = lv.get('expectedHeal')
                if eh:
                    print('        heal', [(r['healMultiplier'], r['distanceFromCenter'], r['normal']['min'], r['normal']['max'], r['expected']) for r in eh['rows'] if r['healMultiplier'] in (100, 120)])
        print(json.dumps(doc['amplificationImpact']['values'], ensure_ascii=False))
        print(json.dumps(doc['geometry'], ensure_ascii=False)[:1500])
        for r in doc['enemyDamageReduction']['rows']:
            print(r['objectivesDone'], r['debuff'], r['mamaFinalDamagePercent'], r['hitOnArchetype'], r['hitOnMagicienWith1RangedRes15'])
        for b in doc['bonuses']:
            print(b['choiceSpellId'], b['name'], b['statLabel'], b['value'], b['dpln'], b['dplnMatches'])


if __name__ == '__main__':
    main()
