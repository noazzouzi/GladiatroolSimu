#!/usr/bin/env python3
"""Génère research/data/monsters.json : monstres (Troolls), boss (Mama Troollette), gabarit joueur
(Gladiatroolleur) et invocation « Stratège Dompteur » du Gladiatrool, normalisés pour le simulateur.

Sources :
* données du client DOFUS 3 via DofusDB (research/raw/dofusdb/*.json, extraction du 2026-09-28 ;
  revérifiées en direct le 2026-09-28 sur https://api.dofusdb.fr/monsters/<id> et /spell-levels/<id> :
  aucune différence, dernière mise à jour DofusDB des monstres 2026-06-23 = patch 3.6) = FAIT vérifié ;
* formules du moteur (tools/mechanics/damage.py, zones.py, movement.py : portage du client) ;
* guide DPLN https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026), sections II, V et VI = FAIT rapporté ;
* notes d'observation des autres agents (research/notes/40_carte_positions.md, 50_sources_web.md, 60_videos.md).

Usage : python3 tools/monsters/build_monsters.py [--summary]
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
OUT = os.path.join(ROOT, 'research', 'data', 'monsters.json')
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
# Légendes
# ------------------------------------------------------------------------------------------------
MASK_LEGEND = {
    'a': ('alliés du lanceur (lanceur inclus)', H),
    'A': ('ennemis du lanceur', H),
    'g': ('alliés SAUF le lanceur', H),
    'C': ('le lanceur (ajouté même hors zone)', H),
    'c': ('le lanceur', H),
    'H': ('joueurs non invoqués ennemis (client 2.73 : `H`)', M),
    'j': ('invocations alliées', M),
    'O': ("l'auteur de l'événement déclencheur", M),
    'x': ('non documenté (présent sur la téléportation de Troollooportation)', B),
    'Atq': ('DOFUS 3 : camp attaquant = les joueurs (HYPOTHÈSE)', M),
    'Def': ('DOFUS 3 : camp défenseur = les monstres (HYPOTHÈSE)', M),
    'Sce': ('DOFUS 3 : entité scénario / manager (HYPOTHÈSE)', B),
    'E#': ("la cible possède l'état #", H),
    'e#': ("la cible ne possède pas l'état #", H),
    '*E#': ("le LANCEUR possède l'état #", H),
    '*e#': ("le LANCEUR ne possède pas l'état #", H),
    'F#': ('la cible est le monstre #', H),
    'f#': ("la cible n'est pas le monstre #", H),
}
TRIGGER_LEGEND = {
    'I': ('immédiat', H),
    'D': ('quand le porteur subit des dommages (hors dommages de poussée)', H),
    'DBA': ("quand le porteur subit des dommages d'un allié", M),
    'X': ('à la mort du porteur', H),
    'XD': ('à la mort du porteur (variante « par dommages »)', M),
    'TB': ('au début du tour du porteur', H),
    'TE': ('à la fin du tour du porteur', H),
    'CAP': ('HYPOTHÈSE : après un lancer de sort du porteur', B),
}
EXECUTORS = {
    1160: ('CasterExecuteSpell', "le LANCEUR exécute le sous-sort sur chaque cible de l'effet"),
    792: ('TargetExecuteSpell', "chaque CIBLE de l'effet exécute le sous-sort (masque C = le lanceur lui-même)"),
    2960: ('CasterExecuteSpellOnCell', 'le lanceur exécute le sous-sort sur la cellule (ici cellIds explicites)'),
    2794: ('TargetExecuteSpellOnCell', 'chaque cible exécute le sous-sort sur sa cellule'),
    2792: ('TargetExecuteSpellGlobalLimitation', 'chaque cible exécute le sous-sort (value = limite globale)'),
    2160: ('CasterExecuteSpellGlobalLimitation', 'le lanceur exécute le sous-sort (value = limite globale)'),
    1017: ('TargetExecuteSpellOnSource', "la cible exécute le sous-sort sur la source de l'événement"),
    1018: ('SourceExecuteSpellOnTarget', "la source de l'événement exécute le sous-sort sur la cible"),
}
KIND = {100: 'dommages', 95: 'vol de vie', 3001: 'soin', 5: 'poussée', 6: 'attirance', 1103: 'poussée sans dommages',
        4: 'téléportation', 8: 'échange de positions', 950: 'état (ajout)', 951: 'état (retrait)',
        952: 'état (désactivation)', 1171: 'bonus % dommages finaux', 1172: 'malus % dommages finaux',
        1163: 'multiplicateur de dommages subis', 776: 'bonus % érosion', 140: 'tour annulé',
        406: "retire les effets d'un sort", 181: 'invocation', 141: 'tue la cible', 666: 'aucun effet (animation)',
        138: 'bonus Puissance', 125: 'bonus Vitalité', 153: 'malus Vitalité', 3407: 'durée du tour',
        401: 'pose un glyphe de début de tour', 1091: 'pose un glyphe-aura', 1123: 'renvoi (% dommages initiaux)',
        1223: 'renvoi (% dommages finaux)'}
KIND.update({k: 'exécution de sous-sort' for k in EXECUTORS})


def action_name(eid):
    v = ACTIONS.get(str(eid))
    return v[0] if isinstance(v, list) and v else v


def state_name(sid):
    s = STATES.get(str(sid))
    return s['name']['fr'] if s else None


def spell_name(sid):
    s = SPELLS.get(str(sid))
    return s['name']['fr'] if s else None


def decode_mask(mask):
    out = []
    for tok in [t for t in mask.split(',') if t]:
        star = tok.startswith('*')
        core = tok[1:] if star else tok
        key, arg = tok, None
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
        if t.startswith('EON') or t.startswith('EOFF'):
            n = int(t[3:] if t.startswith('EON') else t[4:])
            out.append({'token': t, 'meaning': ("quand le porteur GAGNE l'état " if t.startswith('EON')
                                                 else "quand le porteur PERD l'état ") + f'{n} « {state_name(n)} »',
                        'confidence': H})
        else:
            d, c = TRIGGER_LEGEND.get(t, ('non documenté', B))
            out.append({'token': t, 'meaning': d, 'confidence': c})
    return out


def zone_info(zd):
    z = Z.SpellZone.from_zone_descr(zd)
    info = {'raw': f"{z.shape}{zd['param1']}" + (f",{zd['param2']}" if zd.get('param2') else ''),
            'shape': z.shape, 'shapeCode': zd['shape'], 'shapeName': Z.SHAPE_NAMES.get(z.shape, '?'),
            'radius': z.radius, 'minRadius': z.min_radius,
            'aoeMalus': {'stepPercent': zd.get('damageDecreaseStepPercent'),
                         'maxSteps': zd.get('maxDamageDecreaseApplyCount')}}
    if z.shape == ';':
        info['cellIds'] = zd.get('cellIds')
    if zd.get('includeCarried'):
        info['includeCarried'] = True
    return info


def effect_label(e):
    eid = e['effectId']
    if eid in (950, 951, 952):
        verb = {950: 'État', 951: "Enlève l'état", 952: "Désactive l'état"}[eid]
        return f"{verb} {e['value']} « {state_name(e['value'])} »"
    if eid == 406:
        return f"Enlève les effets du sort {e['value']} « {spell_name(e['value'])} »"
    if eid == 181:
        mon = MONSTERS.get(str(e['diceNum']))
        return f"Invoque {mon['name']['fr'] if mon else e['diceNum']} ({e['diceNum']}, grade {e['diceSide']})"
    if eid in EXECUTORS:
        sp = SPELLS.get(str(e['diceNum']))
        return (f"{EXECUTORS[eid][0]} : sort {e['diceNum']} « {spell_name(e['diceNum'])} »"
                f" [{(sp or {}).get('adminName') or ''}] niv.{e['diceSide']}")
    if eid == 3407:
        return f"Durée du prochain tour : {e['value']} s"
    fr = (CATALOG.get(str(eid)) or {}).get('fr') or ''
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    lab = fr.replace('#1{{~1~2 à }}#2', f'{lo}' + (f' à {hi}' if hi != lo else '')).replace('#1', str(e['diceNum']))
    lab = lab.replace('{{~1~2 à -}}#2', '').replace('#2', str(e['diceSide'])).replace('#3', str(e['value']))
    lab = lab.replace('{{~ps}}', 's' if lo > 1 else '').replace('{{~zs}}', '')
    return lab


def norm_effect(e):
    eid = e['effectId']
    lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
    out = {
        'order': e['order'], 'effectId': eid, 'action': action_name(eid), 'kind': KIND.get(eid, '?'),
        'label': effect_label(e),
        'real': not e['forClientOnly'], 'clientOnly': e['forClientOnly'], 'visibleInTooltip': e['visibleInTooltip'],
        'diceNum': e['diceNum'], 'diceSide': e['diceSide'], 'value': e['value'],
        'targetMask': e['targetMask'], 'targets': decode_mask(e['targetMask']),
        'trigger': e['triggers'], 'triggerDecoded': decode_trigger(e['triggers']),
        'duration': e['duration'], 'delay': e['delay'], 'triggerDuration': e['effectTriggerDuration'],
        'dispellable': e['dispellable'], 'random': e['random'], 'group': e['group'],
        'element': {0: 'neutre'}.get(e['effectElement']),
        'zone': zone_info(e['zoneDescr']),
    }
    if eid in (100, 95, 3001):
        out['min'], out['max'] = lo, hi
    if eid in (5, 6, 1103):
        out['cells'] = e['diceNum']
    if eid in (950, 951, 952):
        out['state'] = {'id': e['value'], 'name': state_name(e['value'])}
    if eid in (1171, 1172, 1163, 776, 138, 125, 153, 1123, 1223):
        out['amount'] = e['diceNum']
    if eid == 406:
        out['spell'] = {'id': e['value'], 'name': spell_name(e['value'])}
    if eid == 181:
        out['summon'] = {'monsterId': e['diceNum'], 'grade': e['diceSide']}
    if eid in EXECUTORS:
        sp = SPELLS.get(str(e['diceNum']))
        grade = e['diceSide']
        lvl_id = sp['spellLevels'][grade - 1] if sp and 0 < grade <= len(sp['spellLevels']) else None
        out['subSpell'] = {'spellId': e['diceNum'], 'grade': grade, 'spellLevelId': lvl_id,
                           'name': spell_name(e['diceNum']), 'adminName': (sp or {}).get('adminName'),
                           'executor': EXECUTORS[eid][0], 'executorMeaning': EXECUTORS[eid][1]}
        if eid in (2160, 2792):
            out['subSpell']['limit'] = e['value']
    if eid in (401, 1091):
        out['glyph'] = {'spellId': e['diceNum'], 'grade': e['diceSide'], 'color': f"#{e['value']:06X}"}
    return out


def cast_conditions(lv):
    return {
        'spellLevelId': lv['id'], 'apCost': lv['apCost'],
        'range': {'min': lv['minRange'], 'max': lv['range'], 'modifiable': lv['rangeCanBeBoosted']},
        'castInLine': lv['castInLine'], 'castInDiagonal': lv['castInDiagonal'], 'lineOfSight': lv['castTestLos'],
        'needFreeCell': lv['needFreeCell'], 'needTakenCell': lv['needTakenCell'],
        'maxCastPerTurn': lv['maxCastPerTurn'], 'maxCastPerTarget': lv['maxCastPerTarget'],
        'minCastInterval': lv['minCastInterval'], 'initialCooldown': lv['initialCooldown'],
        'globalCooldown': lv['globalCooldown'], 'criticalHitProbability': lv['criticalHitProbability'],
        'statesCriterion': lv['statesCriterion'] or None, 'maxStack': lv['maxStack'],
    }


def spell_block(sid, owner=None, role=None):
    sp = SPELLS[str(sid)]
    levels = []
    for g, lid in enumerate(sp['spellLevels'], start=1):
        lv = LEVELS.get(str(lid))
        if lv is None:
            levels.append({'grade': g, 'spellLevelId': lid, 'missing': True})
            continue
        levels.append({'grade': g, **cast_conditions(lv),
                       'effects': [norm_effect(x) for x in lv['effects']],
                       'criticalEffects': [norm_effect(x) for x in lv['criticalEffect']]})
    return {'id': sid, 'name': sp['name']['fr'], 'nameEn': sp['name'].get('en'), 'adminName': sp.get('adminName'),
            'typeId': sp.get('typeId'), 'owner': owner, 'role': role,
            'source': f'{API}/spells/{sid}', 'levels': levels}


# ------------------------------------------------------------------------------------------------
# Dégâts attendus
# ------------------------------------------------------------------------------------------------
PLAYER = D.Stats(is_player=True, max_hp=30000, hp=30000)          # archétype, 0 % rés. (défaut)
PLAYER_PUGNACE = D.Stats(is_player=True, max_hp=30000, hp=30000, res_pct_all=25)
MONSTER_TARGET = D.Stats(is_player=False, max_hp=10 ** 9, hp=10 ** 9, level=200)   # Trooll (0 % rés.)
VULN = [D.Multiplier(200, ('D',))]

CASTERS = {
    7981: D.Stats(level=200, is_player=False, strength=4000),
    7982: D.Stats(level=200, is_player=False, strength=3000),
    7983: D.Stats(level=200, is_player=False, strength=3500),
    7984: D.Stats(level=1000, is_player=False, strength=4500),
    7980: D.Stats(level=200, is_player=True, strength=6000),
}


def caster_with(mid, final=100):
    c = CASTERS[mid]
    return D.Stats(level=c.level, is_player=c.is_player, strength=c.strength, final_damage=final)


def hit_stats(lo, hi, action, caster, target=PLAYER, mults=(), eff=1.0):
    vals, steals = [], []
    for r in range(lo, hi + 1):
        if action == 3001:
            v = D.sender_damage(r, 3001, caster)
            v = int(v * eff)
            vals.append(v)
            steals.append(0)
            continue
        res = D.compute_hit(r, action, caster, target, melee=False, aoe_efficiency=eff, target_multipliers=list(mults))
        vals.append(res.final)
        steals.append(int(res.life_loss * 0.5))
    return {'min': min(vals), 'max': max(vals), 'avg': round(sum(vals) / len(vals), 1),
            **({'lifeStealHealAvg': round(sum(steals) / len(steals), 1)} if action == 95 else {})}


def spell_damage_effects(lid):
    """Effets de dégâts/soins réels (non clientOnly) d'un spell-level : [(effet normal, effet critique)]."""
    lv = LEVELS[str(lid)]
    norm = [e for e in lv['effects'] if e['effectId'] in (100, 95, 3001) and not e['forClientOnly']]
    crit = [e for e in lv['criticalEffect'] if e['effectId'] in (100, 95, 3001) and not e['forClientOnly']]
    return lv, list(zip(norm, crit)) if crit else [(n, None) for n in norm]


def expected_block(mid, lid, *, final=100, target=PLAYER, mults=(), eff=1.0, crit_override=None):
    """Dégâts d'UN lancer : somme des effets de dégâts du niveau (ex. Double Trooll = 2 coups)."""
    lv, pairs = spell_damage_effects(lid)
    caster = caster_with(mid, final)
    p = (crit_override if crit_override is not None else lv['criticalHitProbability'])
    if mid == 7980 and p > 0:   # archétypes : 10 % de Critique de base (DPLN)
        p = min(100, p + 10)
    p = p / 100
    n_lo = n_hi = c_lo = c_hi = 0
    n_avg = c_avg = 0.0
    steal = 0.0
    for en, ec in pairs:
        a = hit_stats(*D.roll_bounds(en['diceNum'], en['diceSide'], en['value']), en['effectId'], caster, target, mults, eff)
        n_lo += a['min']; n_hi += a['max']; n_avg += a['avg']
        steal += (1 - p) * a.get('lifeStealHealAvg', 0)
        if ec is not None:
            b = hit_stats(*D.roll_bounds(ec['diceNum'], ec['diceSide'], ec['value']), ec['effectId'], caster, target, mults, eff)
            c_lo += b['min']; c_hi += b['max']; c_avg += b['avg']
            steal += p * b.get('lifeStealHealAvg', 0)
        else:
            c_lo, c_hi, c_avg = n_lo, n_hi, n_avg
    out = {'normal': [n_lo, n_hi], 'normalAvg': round(n_avg, 1), 'critical': [c_lo, c_hi], 'criticalAvg': round(c_avg, 1),
           'critChancePct': round(p * 100), 'expectedPerCast': round((1 - p) * n_avg + p * c_avg, 1)}
    if steal:
        out['lifeStealHealExpected'] = round(steal, 1)
    return out


# ------------------------------------------------------------------------------------------------
# Contenu éditorial (FAIT rapporté / analyse)
# ------------------------------------------------------------------------------------------------
DPLN_SPELLS = {
    30383: {'dplnName': "Tir d'Artroolleurie", 'text': "Inflige 2 000 de dégâts neutre et repousse la cible de 2 cases. Se lance jusqu'à 8PO. (lançable 2 fois par tour)", 'value': 2000},
    30384: {'dplnName': 'Mortrooll', 'text': "Inflige 3 000 de dégâts neutre dans une zone cercle de taille 3. Se lance jusqu'à 8PO. (lançable 1 fois par tour)", 'value': 3000},
    30386: {'dplnName': 'Coup de Trool', 'text': "Repousse la cible de 3 cases. Se lance uniquement en ligne jusqu'à 6PO. (lançable 2 fois par tour)", 'value': None},
    30385: {'dplnName': 'Double Trool', 'text': "Inflige 3 000 de dégâts neutre 2 fois à la cible et la repousse de 2 cases. Se lance jusqu'à 2PO. (lançable 3 fois par tour, 1 fois par cible)", 'value': 3000},
    30387: {'dplnName': 'Trool de Magie', 'text': "Soigne le monstre allié ciblé ou le Nitrool de 2000PV. Se lance jusqu'à 6PO. (lançable 2 fois par tour)", 'value': 2000},
    30388: {'dplnName': 'Troollement de Tambour', 'text': "Echange de position avec le monstre allié ciblé et lui applique l'état Inébranlable pour un tour. Se lance jusqu'à 6PO. (relance de 2 tours)", 'value': None},
    30382: {'dplnName': 'Patroolleur', 'text': "Le Troollibre entre dans l'état Inébranlable pendant 1 tour et gagne 15% de dommages finaux pendant 2 tours. (relance de 3 tours)", 'value': None},
    30381: {'dplnName': 'Aspiratrooll', 'text': "Attire la cible d'une case, lui inflige 3 500 de dégâts neutre en vol de vie et lui applique 10% d'érosion pendant 1 tour. Se lance jusqu'à 2PO. (lançable 3 fois par tour, 1 fois par cible)", 'value': 3500},
    30380: {'dplnName': 'Trollpoline', 'text': 'Inflige 6 000 de dégâts neutre et repousse de 3 cases les cibles dans une zone cercle de taille 2 autour du Troolibre. (lançable 1 fois par tour)', 'value': 6000},
    30430: {'dplnName': 'Rassemblement Troollesque', 'text': "Quand elle arrive sur terrain et à chaque début de tour, la Mama Troollette repousse tous les personnages en ligne jusqu'à ce qu'ils atteignent un bord de map.", 'value': None},
    30392: {'dplnName': 'Upertrooll', 'text': "Inflige 3 000 de dégâts neutre en vol de vie et repousse la cible de 6 cases. Se lance jusqu'à 2PO. (lançable 3 fois par tour, 1 fois par cible)", 'value': 3000},
    30394: {'dplnName': 'Castatrooll', 'text': 'Attire toutes les entités dans une zone étoile de taille 5 autour de la Mama Troolette de 4 cases. De plus, Mama Troollette gagne 20% de dommages finaux. (relance de 2 tours)', 'value': None},
    30389: {'dplnName': 'Troolloportation', 'text': "Mama Troollette se téléporte sur la case ciblée et inflige 3 500 de dégâts neutre à tous les personnages à son contact. Se lance jusqu'à 6PO. (lançable 2 fois par tour).", 'value': 3500},
    30393: {'dplnName': 'Mitroollette de Poing', 'text': "Inflige 4 500 de dégâts neutre dans une zone cercle de taille 3. Se lance jusqu'à 8PO. (lançable 1 fois par tour)", 'value': 4500},
    30416: {'dplnName': 'Frappe Repoussoir', 'text': 'inflige 1200 de dégâts neutre et repousse la cible de 2 cases.', 'value': 1200},
}

# Écarts constatés spell par spell (donnée = FAIT vérifié ; DPLN = FAIT rapporté)
SPELL_DISCREPANCIES = {
    30381: ["Attirance : DPLN « d'une case » ; donnée : Attire de **2** cases (effet 6, diceNum 2).",
            'Dégâts : DPLN « 3 500 » ; donnée 65-75 ×41 = 2 665-3 075 (critique 78-90 → 3 198-3 690). DPLN ≈ valeur critique.',
            "Masque `a,A` : le sort peut viser un allié (autre Trooll) comme un ennemi (FAIT) ; l'IA ne le fait a priori pas (HYPOTHÈSE).",
            'Non dit par DPLN : maxStack 2 (érosion cumulable 2 fois), 30 % de critique.'],
    30380: ['Dégâts : DPLN « 6 000 » ; donnée 100-116 ×41 = 4 100-4 756 (critique 120-139 → 4 920-5 699). 6 000 n\'est atteint '
            "qu'avec critique + Patroolleur (+15 % finaux → 5 658-6 553). DPLN surestime la valeur usuelle.",
            'Zone : DPLN « cercle de taille 2 autour du Troollibre » ; donnée `C2,1` = anneau de rayon 1 à 2 (la case du Troollibre est exclue), '
            'dégressivité 10 % par case au-delà de la 1re (distance 1 : 100 %, distance 2 : 90 %).'],
    30385: ['Dégâts : DPLN « 3 000 de dégâts 2 fois » ; donnée 2 effets de 32-38 ×36 = 1 152-1 368 chacun (critique 42 fixe → 1 512), '
            'soit 2 304-2 736 au total (critique 3 024). DPLN compte probablement le TOTAL critique deux fois.',
            'Poussée : DPLN « 2 cases » ; donnée : Repousse de **3** cases.',
            'Critique : 60 % (le plus élevé des Troolls).'],
    30384: ["Fréquence : DPLN « lançable 1 fois par tour » ; donnée : maxCastPerTurn 0 (illimité) mais **intervalle de relance 2** "
            '(minCastInterval 2) ⇒ 1 lancer tous les 2 tours.',
            'Dégâts : DPLN « 3 000 » ; donnée 81-95 ×31 = 2 511-2 945 au centre (critique 101-117 → 3 131-3 627), '
            'dégressivité 10 %/case (C3 : 100/90/80/70 %).'],
    30383: ['Conforme DPLN (2 000 ≈ 1 736-2 015 ; poussée 2 ; PO 8 ; 2/tour). Non dit par DPLN : 1 lancer par cible (maxCastPerTarget 1), '
            'LdV requise, masque `a,A`.'],
    30386: ['Conforme DPLN (poussée 3, en ligne, PO 1-6, 2/tour). Non dit : 1 lancer par cible, LdV requise, aucun dégât (hors collision).'],
    30387: ['Conforme DPLN (2 000 ≈ 2 016-2 340 ; soins boostés par la Force : effet 3001 « soins Neutre »). Masque `a` = alliés, lanceur compris. '
            '1 lancer par cible.'],
    30388: ['Conforme DPLN. Précision : masque `g` (allié SAUF le lanceur) ; l\'Inébranlable est posé sur l\'allié échangé, pas sur le Nitrooll ; '
            'l\'échange (effet 8) n\'est PAS bloqué par Inébranlable (état 157 : seul cantBePushed = vrai).'],
    30382: ['Conforme DPLN (Inébranlable 1 tour, +15 % dommages finaux 2 tours, relance 3). Coût 2 PA, lancer sans ligne de vue sur soi.'],
    30392: ['Dégâts : DPLN « 3 000 » ; donnée 46-54 ×46 = 2 116-2 484 ; avec Faveur V (+25 % finaux) 2 645-3 105 ⇒ DPLN mesuré sous Faveur V. '
            'Poussée 6, PO 1-2, 3/tour, 1/cible : conformes.',
            'Collision : cases restantes × floor((floor(niv/2)+32)/4) ⇒ **133 par case** si Mama est niveau 1000 (donnée /monsters/7984 + game designer, AnkamaLive 10/09/2024), '
            '**33 par case** si elle est niveau 200 (fiche en jeu, capture DPLN ark26gladia125). Défaut simulateur : 1000 (confiance moyenne).'],
    30394: ['Nom : DPLN « **Castatrooll** » ; donnée « **Catastrooll** » (nom affiché FR ; EN « Catastroolphe »).',
            'Zone : DPLN « étoile de taille 5 » ; donnée `*6` (étoile de rayon **6**, 8 directions).',
            "Attirance : DPLN « de 4 cases » ; donnée « Attire de **5** cases ».",
            "+20 % dommages finaux : conforme, mais la donnée a une **durée 0** (masque `c`) ⇒ bonus valable pour le reste du tour en cours "
            "seulement (HYPOTHÈSE sur la sémantique d'une durée 0, confiance moyenne). DPLN ne donne pas la durée.",
            'Masque `a,A` : attire aussi les Troolls (alliés), conforme à « toutes les entités ». Relance 2 : conforme. Critique 0 %.'],
    30389: ["Dégâts : l'effet de dégâts 60-70 du sort 30389 est `forClientOnly` (infobulle) ; les VRAIS dégâts viennent du sous-sort 30391 "
            "exécuté par Mama APRÈS la téléportation, zone `X1` centrée sur sa case d'arrivée : les cibles au contact sont à distance 1 ⇒ "
            'dégressivité 10 % ⇒ 60-70 ×46 ×0,9 = 2 484-2 898 ; avec Faveur V 3 105-3 622 ⇒ « 3 500 » de DPLN = mesuré sous Faveur V.',
            'PO 1-6, 2/tour, case libre requise, LdV requise : conformes. Coût 1 PA.'],
    30393: ['Dégâts : DPLN « 4 500 » ; donnée 93-108 ×46 = 4 278-4 968 au centre (Faveur V : 5 347-6 210). '
            'Nom : DPLN « Mitroollette de Poing » ; donnée « Mitroollette de Poings ».'],
    30430: ["DPLN n'évoque que la poussée des personnages. Donnée (30432 niv.4) : 1) état « Grabbed » sur les ennemis alignés ; "
            '2) **attire de 63 cases les ALLIÉS de Mama (Troolls) alignés avec elle** (masque `g`) ; 3) repousse de 63 cases les ennemis '
            '(effet 1103 = poussée **sans dommages de collision**). Zone `X63,1` = les 4 demi-droites (axes MapPoint) partant de Mama.'],
    30416: ['Conforme DPLN (16-20 ×61 = 976-1 220). Masques : poussée `a,A` (alliés aussi), dégâts `j,A` (ennemis + invocations alliées).'],
}

MONSTER_TEXT = {
    7981: {
        'role': 'Trooll de vague — mêlée/placement (pousse en anneau, attire, vole de la vie, érode)',
        'dpln': 'Section V « Troollibre » : Patroolleur, Aspiratrooll, Trollpoline (voir sorts).',
        'aiProbable': [
            'Avance au contact de la cible la plus proche atteignable (6 PM) puis enchaîne Aspiratrooll (attire 2 + vol de vie) et Troollpoline (anneau 1-2 autour de lui, repousse 3).',
            "Patroolleur tôt (souvent dès son 1er tour : Troollibres « Inébranlables au T1 » observés par Barbe Douce, Huz) : +15 % finaux 2 tours et Inébranlable 1 tour ⇒ l'Acrobate ne peut plus le pousser (mais Voltige l'échange).",
            'Combos possibles avec 11 PA : Patroolleur 2 + Troollpoline 4 + Aspiratrooll 3 (= 9) ; ou Troollpoline 4 + Aspiratrooll ×2 (2 cibles, = 10) ; ou Aspiratrooll ×3 (3 cibles) + Patroolleur (= 11).',
            'Danger principal : Troollpoline repousse de 3 cases TOUS les joueurs de l\'anneau ⇒ un joueur à ≤ 3 cases des pics y est envoyé (2 000 + Vulnérable).',
        ],
    },
    7982: {
        'role': 'Trooll de vague — distance (artillerie PO 8, zone C3 tous les 2 tours)',
        'dpln': 'Section V « Artroolleur » : Tir d\'Artroolleurie, Mortrooll.',
        'aiProbable': [
            'Reste à distance (PO 1-8, LdV requise) et tire : Tir d\'Artroollerie ×2 (1 par cible ⇒ 2 cibles différentes) + Mortrooll (zone C3) un tour sur deux.',
            "Apparaît aux coins V2/V3 (187, 188, 411, 412 : à 1-2 cases du glyphe, cf. note 40) ⇒ cible facile à pousser dans les pics.",
            "Objectifs liés : « Stop aux projectiles » (aucun Artroolleur en fin de tour global), « Distance d'insécurité » (tous les Artroolleurs à ≤ 3 cases d'un allié).",
        ],
    },
    7983: {
        'role': 'Trooll de vague — soutien (soin, échange + Inébranlable) et placement (poussées 3)',
        'dpln': 'Section V « Nitrooll » : Coup de Trool, Double Trool, Trool de Magie, Troollement de Tambour.',
        'aiProbable': [
            '12 PA : jusqu\'à 4 sorts de 3 PA. Soigne un Trooll blessé (Trooll de Magie 2 016-2 340, 2/tour, 1/cible), échange de place avec un allié pour lui donner Inébranlable (tous les 2 tours), frappe au contact (Double Trooll) et repousse en ligne (Coup de Trooll).',
            "Troollement de Tambour peut viser Mama (masque `g` = tout allié) ⇒ explique l'observation isolée « Mama Inébranlable » (Houmilito) : HYPOTHÈSE forte.",
            'Les deux poussées de 3 cases (Double Trooll au contact, Coup de Trooll en ligne à 6 PO) sont la vraie menace : envoyer un joueur dans les pics = 2 000 + Vulnérable.',
            'Priorité de focus élevée (soigne et rend Inébranlable les autres).',
        ],
    },
    7984: {
        'role': 'Boss — arrive au tour 8 (vague 8), invulnérable sauf après une entrée dans les pics',
        'dpln': 'Section VI « Mama Troollette » (voir boss).',
        'aiProbable': [
            'Tour d\'arrivée (T8) : téléportation sur 300 (ou 287 si 300 est occupée, observé) puis Rassemblement (poussée en ligne jusqu\'au bord) puis tour normal : 20 PA mais seulement 7 lancers possibles (Troollooportation ×2, Uppertrooll ×3 sur 3 cibles, Mitroollette ×1, Catastrooll 1 tour sur 2) ⇒ les PA ne limitent pas.',
            'Séquence la plus dangereuse (HYPOTHÈSE) : Catastrooll (+20 % finaux, attire tout à 5 cases) → Mitroollette sur le groupe (C3) → Uppertrooll ×3 (vol de vie + repousse 6, peut renvoyer dans les pics) → Troollooportation ×2 au contact.',
            '« Focus » observé au spawn : −20 000 à −21 000 sur un personnage (Huz, Matspyder4) = cohérent avec la somme calculée sur une cible (≈ 18 000-21 000 sous Faveur V + Catastrooll).',
        ],
    },
    7980: {
        'role': 'Gabarit des personnages joueurs (archétypes) — HYPOTHÈSE forte',
        'dpln': 'Section III : « 30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 Dommages de poussée, 10 % Critique » + Frappe Repoussoir.',
        'aiProbable': [],
    },
    7985: {
        'role': "Invocation « Poutch » de l'Acrobate (Soutien Stratégique 30403) — voir research/notes/1x_archetype_acrobate.md",
        'dpln': 'Section III Acrobate : « Soutien Stratégique : Invoque un Poutch qui attire les ennemis en ligne ».',
        'aiProbable': ['0 PA / 0 PM : ne joue pas. Divise par 2 les dommages reçus de ses alliés (1163 x50 % déclencheur DBA) et renvoie 50 % des dommages initiaux subis en C2,1 aux ennemis quand un Dompteur le frappe.'],
    },
    7986: {
        'role': "Invocation « Poutch » de l'Acrobate (Soutien Stratégique amélioré 30569)",
        'dpln': 'Section III Acrobate (amélioration : cercle de renvoi 2 → 3, croix d\'attirance 5 → 7, attirance 4 → 6).',
        'aiProbable': ['Idem 7985 ; renvoi en C3,1.'],
    },
}

IN_GAME_CARDS = {
    7981: {'image': 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/ark63gladia63_orig.png',
           'shown': 'Niv. 200, 25 000 PV, 11 PA, 6 PM, érosion 10 %, tacle 0, fuite 0, esquives 0, résistances 0 %', 'matchesData': True},
    7982: {'image': 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/ark63gladia64_orig.png',
           'shown': 'Niv. 200, 19 000 PV, 11 PA, 5 PM, érosion 10 %, tacle 0, fuite 0, résistances 0 %', 'matchesData': True},
    7983: {'image': 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/ark63gladia65_orig.png',
           'shown': 'Niv. 200, 22 000 PV, 12 PA, 5 PM, érosion 10 %, tacle 0, fuite 0, résistances 0 %', 'matchesData': True},
    7984: {'image': 'https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/ark26gladia125_orig.png',
           'shown': 'Niv. **200** (!), 150 000 PV, 20 PA, 6 PM, esquive PA 20, esquive PM 20, tacle 0, fuite 0, résistances 0 % (sorts, armes, distance, mêlée : 0)',
           'matchesData': False,
           'difference': "Niveau affiché 200 contre 1000 dans /monsters/7984 et « niveau 1000 » annoncé par le game designer (AnkamaLive 10/09/2024). Affichage plafonné ou version ancienne de la capture ? Seul effet connu sur le simulateur : dommages de collision d'Uppertrooll (133 par case restante au niveau 1000, 33 au niveau 200)."},
}

PASSIVES = {
    7981: 30694, 7982: 30694, 7983: 30694, 7984: 30430, 7980: 30639, 7985: 30421, 7986: 30568,
}

WAVES = [
    {'wave': 1, 'turn': 1, 'composition': {'7981': 2}},
    {'wave': 2, 'turn': 2, 'composition': {'7981': 1, '7982': 2}},
    {'wave': 3, 'turn': 3, 'composition': {'7983': 2, '7982': 1}},
    {'wave': 4, 'turn': 4, 'composition': {'7983': 1, '7982': 1, '7981': 1}},
    {'wave': 5, 'turn': 5, 'composition': {'7981': 3}},
    {'wave': 6, 'turn': 6, 'composition': {'7982': 3}},
    {'wave': 7, 'turn': 7, 'composition': {'7983': 3}},
    {'wave': 8, 'turn': 8, 'composition': {'7984': 1}},
    {'wave': 9, 'turn': 9, 'composition': {'7983': 1, '7981': 2, '7982': 2}},
    {'wave': 10, 'turn': 10, 'composition': {'7983': 2, '7981': 2, '7982': 2}},
]


def hp_of(mid):
    return MONSTERS[str(mid)]['grades'][0]['lifePoints']


def build_waves(threat):
    per = {'7981': threat['7981']['singleTargetMaxExpected'], '7982': threat['7982']['singleTargetMaxExpected'],
           '7983': threat['7983']['singleTargetMaxExpected'],
           '7984': threat['7984']['byFaveurLevel']['faveurV_+25']['singleTargetTotal']}
    out, total = [], 0
    for w in WAVES:
        hp = sum(hp_of(int(k)) * n for k, n in w['composition'].items())
        total += hp
        out.append({**w, 'names': {k: MONSTERS[k]['name']['fr'] for k in w['composition']},
                    'entities': sum(w['composition'].values()), 'totalHp': hp, 'cumulativeHp': total,
                    'worstCaseSingleTargetExpected': sum(per[k] * n for k, n in w['composition'].items()),
                    })
    return {
        'status': 'FAIT rapporté (DPLN section II) corroboré par vidéos (V1 = 2 Troollibres, V8 = Mama seule, V10 = 6 monstres) '
                  'et par la détection image par image de 11 combats (nombres 2,3,3,3,3,3,3,Mama,5,6) ; aucune donnée client ne '
                  'décrit les vagues (apparitions gérées côté serveur).',
        'confidence': H,
        'sources': [DPLN, 'research/notes/40_carte_positions.md §4', 'research/notes/60_videos.md §4.3', 'research/notes/50_sources_web.md §3'],
        'timing': 'V1 dès la fin du placement ; V2-V7, V9 au début du tour global (après la fenêtre de bonus) ; V8 = arrivée de Mama au début de T8 ; '
                  'V10 au début de T10. Les vagues s\'accumulent ; tuer Mama ne termine pas le combat (victoire = plus aucun ennemi après V10).',
        'spawnCells': 'voir research/data/map_annotations.json : monsterSpawnCells (par vague) et monsterSpawnModel.slotsByType ; V1 déterministe {242, 358}.',
        'waves': out,
        'totals': {'troolls': {'7981': 11, '7982': 11, '7983': 9}, 'enemies': 32, 'totalHp': total},
        'worstCaseNote': ('worstCaseSingleTargetExpected = somme des maxima « une cible » (espérance, critiques compris) de la vague si tous '
                          'les monstres de la vague atteignent et frappent le même joueur (borne haute, hors pics, hors Vulnérable, hors monstres restants '
                          'des vagues précédentes ; Mama : Faveur V + Catastrooll).'),
    }


# ------------------------------------------------------------------------------------------------
# Menace par tour (une cible, espérance avec critiques)
# ------------------------------------------------------------------------------------------------

def threat_tables():
    L = lambda sid, g=1: SPELLS[str(sid)]['spellLevels'][g - 1]  # noqa: E731
    E = lambda *a, **k: expected_block(*a, **k)['expectedPerCast']  # noqa: E731
    out = {}
    # Troollibre
    asp, tp1 = E(7981, L(30381)), E(7981, L(30380))
    asp_p, tp1_p = E(7981, L(30381), final=115), E(7981, L(30380), final=115)
    out['7981'] = {
        'singleTargetMaxExpected': round(asp_p + tp1_p),
        'combo': 'Patroolleur (2 PA) → Aspiratrooll (3 PA, attire 2) → Troollpoline (4 PA, cible à distance 1) = 9 PA / 11 ; ×1,15',
        'withoutPatroolleur': round(asp + tp1),
        'vsVulnerableX2': round(2 * (asp_p + tp1_p)),
        'pushes': 'Aspiratrooll attire 2 ; Troollpoline repousse 3 tous les ennemis de l\'anneau 1-2 ⇒ pics si le joueur est à ≤ 3 cases du glyphe',
    }
    tir, mort = E(7982, L(30383)), E(7982, L(30384))
    out['7982'] = {
        'singleTargetMaxExpected': round(tir + mort),
        'combo': "Tir d'Artroollerie (3 PA) + Mortrooll centré (4 PA, 1 tour sur 2) ; le 2e Tir doit viser une autre cible (1/cible)",
        'turnWithoutMortrooll': round(tir),
        'twoTargetsTurn': round(2 * tir + mort),
        'vsVulnerableX2': round(2 * (tir + mort)),
        'pushes': 'Tir repousse 2 (à distance, PO 8)',
    }
    dbl = E(7983, L(30385))
    heal = expected_block(7983, L(30387))
    out['7983'] = {
        'singleTargetMaxExpected': round(dbl),
        'combo': 'Double Trooll (2 coups, PO 1-2) ; + Coup de Trooll (repousse 3 en ligne, 0 dégât) ; 12 PA = 4 sorts à 3 PA',
        'plusPicsIfPushedIn': round(dbl + 2000),
        'vsVulnerableX2': round(2 * dbl),
        'healExpectedPerCast': heal['expectedPerCast'],
        'healPerTurnMax': round(2 * heal['expectedPerCast']),
        'pushes': 'Double Trooll repousse 3 (contact, 3/tour, 1/cible) ; Coup de Trooll repousse 3 (ligne, PO 6, 2/tour, 1/cible) ⇒ jusqu\'à 4 poussées de 3 par tour avec 12 PA (3+3+3+2), sur des cibles différentes pour un même sort',
    }
    mama = {}
    for label, final in (('faveurV_+25', 125), ('faveurIV_+20', 120), ('faveurIII_+15', 115), ('faveurII_+10', 110),
                         ('faveurI_+5', 105), ('sansFaveur_0', 100), ('6objectifs_-5_HYPOTHESE', 95)):
        f = final + 20   # Catastrooll lancé en premier
        mit = E(7984, L(30393), final=f)
        upp = E(7984, L(30392), final=f)
        tele = expected_block(7984, L(30391), final=f, eff=0.9, crit_override=30)['expectedPerCast']
        mama[label] = {'finalDamagePct': f, 'mitroollette': round(mit), 'uppertrooll': round(upp),
                       'troollooportationX2': round(2 * tele),
                       'singleTargetTotal': round(mit + upp + 2 * tele),
                       'singleTargetTotalVsVulnerableX2': round(2 * (mit + upp + 2 * tele))}
    out['7984'] = {
        'combo': 'Catastrooll (+20 % finaux, attire tout de 5) → Mitroollette (centre C3) → Uppertrooll (1/cible) → Troollooportation ×2 '
                 '(cible au contact, distance 1 du centre X1 ⇒ −10 %) ; 7 PA sur 20',
        'byFaveurLevel': mama,
        'note': "Le 1er coup à l'arrivée ne bénéficie pas forcément de Catastrooll (ordre choisi par l'IA) ; « Tour annulé » (30750) jusqu'à T7 inclus.",
        'observed': '−20 000 / −21 000 sur un personnage au tour d\'arrivée (Huz 18:30, Matspyder4 forum 26/09/2024) : cohérent avec byFaveurLevel.faveurV_+25.singleTargetTotal',
    }
    # Poussée (collisions) : valeur par case restante (cible poussée, index 0)
    out['pushCollisionPerRemainingCell'] = {
        'troll_level200': MV.collision_damage(1, 200, 0, 0),
        'mama_level1000_dofusdb_default': MV.collision_damage(1, 1000, 0, 0),
        'mama_level200_inGameCard_option': MV.collision_damage(1, 200, 0, 0),
        'archetype_level200_1000DoPou': MV.collision_damage(1, 200, 1000, 0),
        'note': 'Rassemblement Troollesque utilise 1103 (poussée SANS dommages) : aucune collision. Uppertrooll (5), Troollpoline, Tir, Double/Coup de Trooll (5) font des collisions.',
    }
    return out


def dmg_table():
    rows = {}
    spec = [
        (7981, 30380, 1, [1.0, 0.9], 'C2,1 : distance 1 → 100 %, distance 2 → 90 %'),
        (7981, 30381, 1, [1.0], None),
        (7982, 30383, 1, [1.0], None),
        (7982, 30384, 1, [1.0, 0.9, 0.8, 0.7], 'C3 : distance 0/1/2/3 → 100/90/80/70 %'),
        (7983, 30385, 1, [1.0], '2 effets de dégâts par lancer (valeurs = total des 2)'),
        (7983, 30387, 1, [1.0], 'soin (effet 3001, boosté par la Force)'),
        (7984, 30391, 1, [0.9], 'X1 centré sur Mama : les cibles au contact sont à distance 1 ⇒ 90 %'),
        (7984, 30392, 1, [1.0], None),
        (7984, 30393, 1, [1.0, 0.9, 0.8, 0.7], 'C3 : distance 0/1/2/3 → 100/90/80/70 %'),
        (7980, 30416, 1, [1.0], 'gabarit joueur (archétype Force 6000) sur un Trooll'),
    ]
    for mid, sid, g, effs, note in spec:
        lid = SPELLS[str(sid)]['spellLevels'][g - 1]
        target = MONSTER_TARGET if mid == 7980 else PLAYER
        finals = [100] if mid != 7984 else [125, 145, 100]
        if mid == 7981:
            finals = [100, 115]
        variants = {}
        for fin in finals:
            for eff in effs:
                key = f'final{fin}_eff{int(eff * 100)}'
                variants[key] = expected_block(mid, lid, final=fin, target=target, eff=eff,
                                               crit_override=30 if sid == 30391 else None)
                if sid != 30387:
                    variants[key + '_vulnerableX2'] = expected_block(mid, lid, final=fin, target=target, eff=eff,
                                                                     mults=VULN, crit_override=30 if sid == 30391 else None)
                    if mid != 7980:
                        variants[key + '_pugnace25'] = expected_block(mid, lid, final=fin, target=PLAYER_PUGNACE, eff=eff,
                                                                      crit_override=30 if sid == 30391 else None)
        strength = CASTERS[mid].strength
        d = DPLN_SPELLS.get(sid if sid != 30391 else 30389, {})
        base = variants[f'final{finals[0]}_eff{int(effs[0] * 100)}']
        rows[str(sid)] = {
            'caster': mid, 'casterName': MONSTERS[str(mid)]['name']['fr'], 'spellName': spell_name(sid),
            'spellLevelId': lid, 'strength': strength, 'multiplier': (100 + strength) / 100,
            'zoneNote': note, 'variants': variants,
            'dpln': d.get('value'), 'dplnText': d.get('text'),
            'dplnVsData': (None if not d.get('value') else
                           f"DPLN {d['value']} ; donnée {base['normal'][0]}-{base['normal'][1]} (crit {base['critical'][0]}-{base['critical'][1]})"),
        }
    return rows


def states_block():
    ids = [56, 157, 5994, 5902, 5903, 5918, 5971, 5973, 5974, 5975, 5976, 5977, 6024, 5970, 5898, 5915, 5913, 6026, 6027,
           5899, 5900, 5901]
    eff_meaning = {0: 'Inébranlable : pas de poussée ni d\'attirance', 1: 'intaclable', 2: 'ne tacle pas', 3: 'enraciné',
                   4: 'ne peut pas être porté', 7: 'invulnérable (0 dommage)', 16: 'état technique silencieux',
                   18: "pas d'échange / téléportation symétrique"}
    out = {}
    for i in ids:
        s = STATES.get(str(i))
        if not s:
            continue
        flags = {k: s[k] for k in ('invulnerable', 'cantBePushed', 'cantBeMoved', 'cantSwitchPosition', 'cantTackle',
                                   'cantBeTackled', 'cantDealDamage', 'incurable', 'preventsSpellCast', 'isSilent') if s.get(k)}
        out[str(i)] = {'id': i, 'name': s['name']['fr'], 'flags': flags, 'effectsIds': s.get('effectsIds'),
                       'effectsMeaning': [eff_meaning.get(x, '?') for x in s.get('effectsIds') or []],
                       'icon': s.get('icon') or None, 'source': f'{API}/spell-states/{i}'}
    return out


# ------------------------------------------------------------------------------------------------
# Boss : mécaniques
# ------------------------------------------------------------------------------------------------

def boss_block():
    return {
        'monsterId': 7984,
        'summary': [
            'FAIT vérifié : niveau 1000, 150 000 PV, 20 PA, 6 PM, Force 4500 (×46), 0 % rés., esquive PA/PM 20/20, isBoss = false (!) dans la donnée.',
            'FAIT vérifié : sort de départ 30430 « Rassemblement Troollesque » [Sort initial] (spell-level 80586) qui exécute 5 sous-sorts : '
            '30750 Passe-tour, 30609 Passe-tour + TP, 30724 Faveurs de la foule, 30723 Délock (invulnérabilité), 30718 mort.',
            "Mama n'a PAS le passif « Trooler » 30694 des Troolls (donc pas le 30700 « Vulnérable à la sortie des pics »).",
        ],
        'prefight': {
            'spell': 30750, 'spellLevelId': 81182,
            'effects': 'état 5971 « Mama Trooll (pré fight) » (enraciné, non déplaçable, pas d\'échange, silencieux) durée 6 + effet 140 « Tour annulé » durée 6',
            'waitingCell': 152, 'waitingCellSource': 'research/notes/40_carte_positions.md §5.1 (DPLN ark26gladia128 + VOD)',
            'globalSpellsExcluded': "De nombreux sorts joueurs/objectifs ont le masque `e5971` (Punition Collective, Dégagez !, Démotivation des troupes, "
                                    "Pulsation Chaotique, Malédictions, Chamboulement, « Au coin ! », « Tout le monde veut prendre sa place ») : "
                                    'Mama en attente est exclue de leurs cibles et du décompte des objectifs.',
            'initiative': "DPLN : « elle aura toujours l'initiative » (1re de la timeline). Aucune stat d'initiative exposée par DofusDB ; Force 4500 < 6000 des archétypes ⇒ ordre probablement scripté (HYPOTHÈSE).",
        },
        'arrival': {
            'turnObserved': 8,
            'turnConfidence': H,
            'data': "30609 niv.1 (spell-level 80835) : effets avec **delay 7** (retire 30750 puis exécute niv.2) ; niv.2 exécute niv.3 + 30432 niv.1 ; "
                    'niv.3 (80837) : 2960 CasterExecuteSpellOnCell niv.4 sur la cellule **[300]** ; niv.4 (81100) : effet 4 téléportation (zone C63) + retrait des effets de 30609 et 30750.',
            'reconciliation': "delay 7 + passe-tour de durée 6 posés au lancement du combat (avant T1) ⇒ Mama inactive T1-T7 et active au début de T8 "
                              "(observé dans 11 combats + 6 vidéos). Le décompte exact des durées pour un sort de départ reste une HYPOTHÈSE ; "
                              "l'adminName « Passe-tour + TP T5 » indique une ancienne version (arrivée T5).",
            'cell': 300,
            'fallbackCellObserved': 287,
            'fallbackRule': "HYPOTHÈSE (moyenne) : si 300 est occupée, case libre la plus proche de 300 sur l'axe venant de 152 (x = 17) ⇒ 287. "
                            "L'ordre getCells du client pour C63 donnerait une case lointaine et l'ordre de l'anneau 1 donnerait 286 : ni l'un ni "
                            "l'autre n'explique 287 ⇒ règle serveur.",
            'sequence': ['Téléportation sur 300 (ou 287)', 'Rassemblement Troollesque (30432 niv.4) immédiatement', 'tour normal (20 PA, 6 PM, 4 sorts)'],
        },
        'rassemblement': {
            'spells': [30430, 30432, 30609, 30448, 30660, 30661],
            'trigger': "30432 niv.1 pose sur Mama un buff déclenché `TB` (début de SON tour), triggerDuration 63 (permanent) ⇒ à chaque début de tour de Mama à partir de T8.",
            'chain': "niv.1 (TB) → niv.2 : 1160 CasterExecuteSpell niv.3 sur chaque cible `g,A` de la zone X63,1 (alignée avec Mama) → niv.3 : 792 niv.4 sur Mama → "
                     'niv.4 (80935), zone X63,1 : état 5918 « Grabbed » (ennemis) ; **Attire de 63 cases les alliés `g`** ; **Repousse de 63 cases (1103, sans dommages) les ennemis `A`** ; '
                     '792 30448 (vérification de l\'objectif « Attirance » si l\'état 5915 est actif).',
            'effectForSimulator': "Pour chaque demi-droite des 2 axes MapPoint passant par Mama : les Troolls sont attirés jusqu'au contact (ou jusqu'au 1er obstacle), "
                                  'puis les joueurs sont repoussés jusqu\'au bord/1er obstacle. Les glyphes n\'arrêtent pas la poussée ⇒ le joueur finit dans les pics '
                                  '(entrée = 2 000 + Vulnérable) sauf si une entité le bloque avant. Aucune collision (1103).',
            'order': 'Attirance des alliés (effet 1) AVANT la poussée des ennemis (effet 2) : un Trooll attiré peut ensuite bloquer la ligne d\'un joueur (HYPOTHÈSE sur l\'ordre intra-sort : ordre des effets).',
            'pushLines': 'research/data/map_annotations.json : mamaPushLines (depuis 300 : axes x=17 et y=−4 ; depuis 287 : x=17 et y=−3)',
            'giftCellCancel': "FAIT rapporté (2 sources) : un joueur poussé sur un Glyphe Événementiel (cadeau) annule l'animation/dégâts et Mama passe son tour.",
            'dpln': DPLN_SPELLS[30430]['text'],
        },
        'invulnerability': {
            'spell': 30723,
            'data': "30723 niv.1 (81097) : état 56 « Invulnérable » (effet d'état 7 = 0 dommage) durée −1 + buff déclenché `EON5902` (quand Mama GAGNE l'état 5902 "
                    '« ennemiHasTriggeredCombatGlyph », posé par l\'entrée dans l\'aura des pics 30390 niv.2 sur `Def`) → niv.2 (81099) : 952 **Désactive** l\'état 56 pendant **1 tour**.',
            'rule': "Mama n'est vulnérable qu'après être ENTRÉE dans les pics (poussée, attirance, échange, téléportation vers une case de pics). "
                    "La désactivation dure 1 tour de Mama : décompte au début de son tour suivant (durée posée par elle-même) ⇒ fenêtre = du moment de l'entrée jusqu'au début de son prochain tour. "
                    "Comme elle joue en premier, la fenêtre couvre le reste du tour global en cours : il faut la mettre dans les pics TÔT dans le tour (Acrobate en 1er).",
            'retrigger': "Tant qu'elle reste dans l'aura, elle garde 5902 : pas de nouvel EON. Pour rouvrir la fenêtre au tour suivant, il faut la faire SORTIR puis RENTRER (HYPOTHÈSE déduite du déclencheur EON).",
            'inPics': "Dans l'aura, `Def` reçoit aussi 1163 « Dommages subis x200 % » (déclencheur D) ⇒ ×2 sur tous les dégâts hors poussée tant qu'elle est dans les pics.",
            'entryDamage': "Entrée : 2 000 (probablement subis car 5902 est posé en 1er dans la liste d'effets, avant les 2 000 : HYPOTHÈSE sur l'ordre).",
            'unshakeable': "Aucune donnée ne rend Mama Inébranlable par elle-même ; un Nitrooll peut le faire (Troollement de Tambour, masque `g`) ⇒ la pousser devient impossible, l'échanger (Voltige) reste possible.",
            'dpln': 'DPLN : « il faut la placer dans le glyphe autour de la map, elle deviendra alors vulnérable pour un tour ». Conforme.',
        },
        'faveur': {
            'spells': [30724, 30659],
            'start': "30724 niv.1 (81098) : état 5973 « Faveurs de la foule V » + 1171 **+25 % dommages finaux** durée −1 (dès le début du combat, Mama en attente).",
            'perObjective': "Chaque récompense d'objectif (21 sorts « Reward », un par objectif, ex. 30433 Empalé, 30444, 30543 Productivité…) exécute 30659 niv.1 sur `a,A,F7984` (= Mama) : "
                            'états V→IV→III→II→I→(aucun) et niv.2 : 1172 **−5 % dommages finaux** durée −1.',
            'table': [{'objectivesDone': n, 'stateShown': ['V', 'IV', 'III', 'II', 'I', '—', '—'][n], 'finalDamagePct': 125 - 5 * n} for n in range(7)],
            'cap': "DPLN « cumulable 5 fois ». Donnée : le −5 % (30659 niv.2) n'est conditionné à aucun état ⇒ un 6e objectif (le gestionnaire 30443 en autorise 6 : "
                   "Empalé + 5 choix) donnerait −5 % (95 %). HYPOTHÈSE (moyenne) ; sans effet si Mama est morte (masque F7984).",
            'stacking': 'Additif avec les autres modificateurs de dommages finaux : Catastrooll +20 %, Démotivation des troupes −35 % (2 tours), Vague de Dégradation −15/−30 %.',
            'dpln': 'DPLN : « Dans l\'état V elle gagne 25 % de dommages finaux supplémentaires. À chaque fois que son état décrémente de 1, elle perd 5 % ». Conforme.',
        },
        'death': {
            'spell': 30718,
            'data': "À la mort (déclencheur X) : 30718 niv.2 exécuté sur `H` (joueurs ennemis) → chacun reçoit l'état silencieux 6024 « Mama Trooll Dead ». "
                    'Aucun autre sort client ne lit 6024 (usage serveur). Tuer Mama ne termine PAS le combat (observé : V9, V10 arrivent quand même).',
        },
        'timeline': [
            {'turn': 'placement (T0)', 'event': "sort de départ 30430 : Invulnérable (56), Faveurs V (+25 %), passe-tour (5971 + Tour annulé, durée 6), arrivée différée (30609, delay 7), trigger de mort"},
            {'turn': 'T1-T7', 'event': "sur 152 (gradins), 1re de la timeline, tour annulé ; son icône de Faveur baisse à chaque objectif réussi ; exclue des sorts à masque e5971"},
            {'turn': 'T8 (début, avant les joueurs)', 'event': "TP sur 300 (287 si occupée), Rassemblement (attire Troolls alignés, repousse joueurs alignés jusqu'au bord, sans collision), puis tour complet"},
            {'turn': 'T8 (tours des joueurs)', 'event': "fenêtre de vulnérabilité si elle ENTRE dans les pics (Dégagez !, poussées, Voltige vers une case de pics…), jusqu'au début de son tour T9"},
            {'turn': 'T9, T10…', 'event': 'début de son tour : Rassemblement puis tour complet ; invulnérable à nouveau sauf nouvelle entrée dans les pics'},
            {'turn': 'mort', 'event': "état 6024 sur les joueurs ; les vagues 9-10 arrivent quand même ; victoire = tous les ennemis morts après V10"},
        ],
        'damageModel': "Toutes ses attaques sont neutres, boostées ×46 (Force 4500) puis × dommages finaux (125 % sous Faveur V). Voir spells 30389/30391/30392/30393/30394 et threat.7984.",
    }


def ai_model():
    return {
        'status': "HYPOTHÈSE : l'IA des monstres est côté serveur (aucune donnée client). Modèle paramétrable déduit des sorts + observations vidéo.",
        'observations': [
            {'fact': "Les Troolls « passent leur tour » quand ils sont dans les pics ou quand les joueurs sont loin", 'source': 'cardxc 12:30/14:30 ; sspritenL (forum) ; Zephiron 11:00', 'confidence': M},
            {'fact': 'Artroolleurs frappent à distance', 'source': 'Koza 07:00 ; cardxc', 'confidence': H},
            {'fact': 'Troollibres Inébranlables dès T1 (Patroolleur)', 'source': 'Barbe Douce 01:52 ; Huz 15:00', 'confidence': H},
            {'fact': 'Nitrooll soigne', 'source': 'Childarksat', 'confidence': M},
            {'fact': 'Mama « focus » un personnage à son arrivée (−20 000/−21 000)', 'source': 'Huz 18:30 ; Matspyder4', 'confidence': M},
        ],
        'proposedPolicy': {
            'common': [
                "Ne jamais entrer volontairement dans une case de pics (le moteur DOFUS pénalise les glyphes nocifs) ; si le Trooll est dans les pics et qu'aucune sortie utile n'existe, il ne bouge pas.",
                'Cible = ennemi atteignable ce tour maximisant les dégâts (à défaut : le plus proche en PM) ; ne cible pas l\'invocation Poutch en priorité (HYPOTHÈSE).',
                "Sorts d'abord, déplacement ensuite si PM restants (paramètre moveBeforeCast = true par défaut pour la mêlée).",
                'Si aucun sort ne peut toucher après déplacement : avancer vers la cible la plus proche (paramètre skipIfNoTarget pour reproduire les « tours passés »).',
            ],
            '7981': ['Patroolleur si disponible et un ennemi atteignable', 'Aspiratrooll sur une cible à 2 cases (attire au contact)', 'Troollpoline si ≥ 1 ennemi dans l\'anneau 1-2', 'Aspiratrooll sur d\'autres cibles avec le reste'],
            '7982': ['Rester à 3-8 cases et en LdV', 'Mortrooll sur la case maximisant le nombre de joueurs (C3), un tour sur deux', 'Tir sur 2 cibles différentes (poussée 2 vers les pics si possible)'],
            '7983': ['Trooll de Magie sur l\'allié le plus blessé (seuil paramétrable)', 'Troollement de Tambour sur un allié menacé (dans ou près des pics) : échange + Inébranlable', 'Double Trooll / Coup de Trooll en poussant vers les pics'],
            '7984': ['Catastrooll si ≥ 2 joueurs dans l\'étoile 6', 'Mitroollette sur la case maximisant les joueurs (C3)', 'Uppertrooll sur 3 cibles (vol de vie, repousse 6)', 'Troollooportation ×2 au contact du joueur le plus bas'],
        },
        'parameters': {'skipIfInPics': True, 'skipIfNoTargetReachable': True, 'focus': ['lowestHp', 'nearest', 'maxDamage'],
                       'avoidGlyphCells': True, 'monstersCanTargetAllies': False},
        'dataNotes': [
            "Plusieurs sorts ont le masque `a,A` (Aspiratrooll, Tir d'Artroollerie, Double Trooll, Catastrooll) : techniquement, un Trooll PEUT frapper/pousser un autre Trooll ; paramètre monstersCanTargetAllies.",
            "Tacle : les joueurs portent l'état 5970 « Gladiatrooler » (cantTackle + cantBeTackled) ⇒ AUCUN tacle entre joueurs et Troolls, dans les deux sens (contredit l'exemple « ratio 0,5 par Trooll adjacent » de la note 70 §6.2).",
        ],
    }


GLOBAL_DISCREPANCIES = [
    {'topic': 'Nom du sort 4 de Mama', 'dpln': 'Castatrooll', 'data': 'Catastrooll (30394)', 'verdict': 'coquille DPLN'},
    {'topic': 'Catastrooll : zone et attirance', 'dpln': 'étoile de taille 5, attire de 4 cases', 'data': 'étoile *6, attire de 5 cases', 'verdict': 'donnée prioritaire (possible changement de patch)'},
    {'topic': 'Catastrooll : durée du +20 %', 'dpln': 'non précisée', 'data': 'durée 0 (masque c)', 'verdict': 'HYPOTHÈSE : valable pour le reste du tour'},
    {'topic': 'Aspiratrooll : attirance', 'dpln': "attire d'une case", 'data': 'attire de 2 cases', 'verdict': 'donnée prioritaire'},
    {'topic': 'Double Trooll : poussée', 'dpln': '2 cases', 'data': '3 cases', 'verdict': 'donnée prioritaire'},
    {'topic': 'Double Trooll : dégâts', 'dpln': '3 000 ×2', 'data': '2 × (1 152-1 368) = 2 304-2 736 ; critique 2 × 1 512', 'verdict': 'DPLN surestime (≈ total critique donné pour chaque coup)'},
    {'topic': 'Troollpoline : dégâts', 'dpln': '6 000', 'data': '4 100-4 756 (crit 4 920-5 699 ; crit + Patroolleur 5 658-6 553)', 'verdict': 'DPLN surestime la valeur usuelle'},
    {'topic': 'Mortrooll : fréquence', 'dpln': '1 fois par tour', 'data': 'intervalle de relance 2 (1 tour sur 2)', 'verdict': 'donnée prioritaire'},
    {'topic': 'Mama : dégâts « environ »', 'dpln': 'Uppertrooll 3 000, Troolloportation 3 500', 'data': '2 116-2 484 et 2 484-2 898 (contact) sans Faveur ; ×1,25 sous Faveur V = 2 645-3 105 / 3 105-3 622', 'verdict': 'DPLN mesuré sous Faveur V (cohérent)'},
    {'topic': 'Mama : Mitroollette', 'dpln': '4 500', 'data': '4 278-4 968 sans Faveur ; 5 347-6 210 sous Faveur V', 'verdict': 'DPLN = valeur hors Faveur (incohérence interne du guide)'},
    {'topic': 'Faveur : plafond', 'dpln': 'cumulable 5 fois', 'data': '−5 % inconditionnel à chaque récompense ; 6 objectifs possibles', 'verdict': 'HYPOTHÈSE : 6e objectif ⇒ −5 %'},
    {'topic': 'Rassemblement Troollesque', 'dpln': 'repousse les personnages en ligne', 'data': "repousse les ennemis (sans collision) ET attire les Troolls alignés vers Mama", 'verdict': 'omission DPLN'},
    {'topic': 'Tour d\'arrivée de Mama', 'dpln': 'tour 8 (?) / « éviter la ligne d\'arrivée au tour 7 »', 'data': 'delay 7 ; passe-tour durée 6', 'verdict': 'T8 observé (11 combats) ; se placer pendant T7'},
    {'topic': 'Niveau de Mama', 'dpln': 'fiche en jeu « Niv. 200 » (capture ark26gladia125)', 'data': 'niveau 1000 (/monsters/7984)', 'verdict': 'défaut 1000 (donnée + game designer) pour les collisions (confiance moyenne) ; option 200'},
    {'topic': 'Mama isBoss', 'dpln': 'boss', 'data': 'isBoss = false, isMiniBoss = false, race 313', 'verdict': 'sans effet sur le simulateur (drapeau de bestiaire)'},
    {'topic': 'Tacle', 'dpln': '—', 'data': 'état 5970 des joueurs : ne tacle pas / intaclable', 'verdict': 'aucun tacle Trooll ↔ joueur (corrige note 70 §6.2)'},
]

OPEN_QUESTIONS = [
    "Priorité de ciblage réelle de l'IA (plus proche ? plus bas en PV ? dégâts max ?) et règle exacte des « tours passés » (dans les pics / hors de portée).",
    "Ordre de jeu des Troolls apparus en cours de combat (alternance avec les joueurs ? juste après Mama ?).",
    'Case de repli exacte de Mama si 300 ET 287 sont occupées.',
    "Durée réelle du +20 % de Catastrooll (durée 0 = tour courant ?).",
    'Effet d\'un 6e objectif sur Mama (−5 % : 95 % ?).',
    "Ordre exact à l'entrée de Mama dans les pics : l'invulnérabilité est-elle retirée avant les 2 000 d'entrée ? Les 1 000 de début de tour dans les pics sont-ils subis avant le retour de l'invulnérabilité ?",
    "Sous-sort 30391 (Troollooportation, dégâts réels) : son intervalle de relance 2 / 2 lancers par tour s'applique-t-il quand il est exécuté par 30389 ? (on suppose que non : 2 frappes par tour).",
    'Monstres « invisibles au spawn » / affichés ailleurs (bug rapporté, sspritenL) : à ignorer dans le simulateur.',
]


def effective_hp(mid, hp):
    if mid in (7980, 7985, 7986):
        return None
    base = {'hp': hp,
            'inPicsAfterEntry': (hp - 2000) // 2,
            'lethalAtTurnStartInPics': 2000,
            'note': ("Trooll poussé dans les pics : −2 000 à l'entrée puis ×2 sur tout dégât hors poussée ⇒ il reste (PV − 2 000)/2 « PV effectifs » "
                     "à infliger avant bonus ; s'il commence son tour dans les pics il perd 1 000 ×2 = 2 000 : un Trooll à ≤ 2 000 PV dans les pics meurt seul. "
                     "Sorti des pics : ×2 jusqu'au début de son prochain tour (30700/30701).")}
    if mid == 7984:
        base['note'] = ("Invulnérable hors fenêtre. Après une entrée dans les pics : −2 000 (si l'invulnérabilité est retirée avant), puis ×2 tant qu'elle "
                        "reste dans les pics ⇒ ≈ 74 000 PV effectifs ; hors pics mais fenêtre ouverte : 148 000. Pas de ×2 à la sortie (pas de Trooler).")
    return base


def monster_block(mid):
    m = MONSTERS[str(mid)]
    g = m['grades'][0]
    sl = LEVELS.get(str(g['startingSpellId']))
    txt = MONSTER_TEXT[mid]
    strength = g['strength']
    out = {
        'id': mid, 'name': m['name']['fr'], 'nameEn': m['name'].get('en'), 'race': m['race'],
        'role': txt['role'], 'source': f'{API}/monsters/{mid}',
        'img': m.get('img'),
        'grades': len(m['grades']), 'gradesIdentical': all(
            {k: v for k, v in x.items() if k not in ('grade',)} == {k: v for k, v in g.items() if k not in ('grade',)}
            for x in m['grades']),
        'stats': {
            'level': g['level'], 'hp': g['lifePoints'], 'ap': g['actionPoints'], 'mp': g['movementPoints'],
            'strength': strength, 'intelligence': g['intelligence'], 'chance': g['chance'], 'agility': g['agility'],
            'wisdom': g['wisdom'], 'vitality': g['vitality'],
            'resistPct': {'neutral': g['neutralResistance'], 'earth': g['earthResistance'], 'fire': g['fireResistance'],
                          'water': g['waterResistance'], 'air': g['airResistance']},
            'dodgeAp': g['paDodge'], 'dodgeMp': g['pmDodge'], 'damageReflect': g['damageReflect'], 'bonusRange': g['bonusRange'],
            'tackle': g['agility'] // 10 + g['bonusCharacteristics'].get('tackleBlock', 0),
            'flee': g['agility'] // 10 + g['bonusCharacteristics'].get('tackleEvade', 0),
            'tackleNote': 'Tacle/Fuite = Agilité/10 + bonus (0 ici). De toute façon les joueurs sont intaclables (état 5970).',
            'pushDamage': 0, 'pushResist': 0, 'critPct': 0,
            'damageMultiplier': (100 + strength) / 100,
            'bonusCharacteristics': {k: v for k, v in g['bonusCharacteristics'].items() if v},
        },
        'flags': {k: m.get(k) for k in ('isBoss', 'isMiniBoss', 'canPlay', 'canTackle', 'canBePushed', 'canSwitchPos',
                                         'canSwitchPosOnTarget', 'canBeCarried', 'canUsePortal', 'useSummonSlot',
                                         'summonCost', 'soulCaptureForbidden')},
        'tags': m.get('tags'),
        'spells': m['spells'],
        'spellNames': {str(s): spell_name(s) for s in m['spells']},
        'startingSpell': {'spellLevelId': g['startingSpellId'], 'spellId': sl['spellId'] if sl else None,
                          'grade': sl['grade'] if sl else None, 'name': spell_name(sl['spellId']) if sl else None,
                          'adminName': SPELLS[str(sl['spellId'])].get('adminName') if sl else None},
        'effectiveHp': effective_hp(mid, g['lifePoints']),
        'inGameCard': IN_GAME_CARDS.get(mid),
        'dpln': txt['dpln'],
        'aiProbable': txt['aiProbable'],
        'confidence': {'stats': H, 'spells': H, 'ai': B},
    }
    return out


PASSIVE_TEXT = {
    30694: ("Trooler (passif des 3 Troolls, spell-level 81002) : niv.1 exécute 30700 (passif « Glyphe de combat » : à la PERTE de l'état 5902/5903, "
            "donc à la sortie des pics, le porteur reçoit Vulnérable + 1163 x200 % déclencheur D pendant 1 tour), 30754 (vérification de l'objectif Empalé) "
            'et, à la mort (X), une animation (niv.2 → niv.3 « pas d\'effet »). Donc un Trooll qui SORT des pics reste ×2 jusqu\'au début de son prochain tour.'),
    30430: 'Voir boss (Rassemblement Troollesque : passe-tour, arrivée, Faveur, invulnérabilité, mort).',
    30639: ("Gladiatrooller (passif, spell-level 80897) : état 5970 (intaclable + ne tacle pas), +3000 Puissance si Dompteur, +5000 Vitalité si Acrobate, "
            "−5000 Vitalité si Magicien (masques *E5899/5900/5901, probablement évalués avant le choix d'archétype ⇒ non appliqués, cf. notes 1x), "
            'tours de 60 s, passif 30700 (Vulnérable à la sortie des pics).'),
    30421: ("Soutien Stratégique [Sort initial] (80525) : 1163 x50 % sur les dommages reçus d'un allié (DBA) ; à chaque dommage (D|XD), si l'attaquant a l'état "
            "Dompteur 5899, renvoie 50 % des dommages initiaux subis aux ennemis en C2,1 (1123) ; tue tout autre Poutch allié (un seul par équipe)."),
    30568: 'Idem 30421 (version améliorée) avec renvoi en C3,1.',
}


def build():
    monsters = {}
    for mid in (7981, 7982, 7983, 7984, 7980, 7985, 7986):
        mb = monster_block(mid)
        mb['passive'] = {'spellId': PASSIVES[mid], 'description': PASSIVE_TEXT[PASSIVES[mid]]}
        monsters[str(mid)] = mb

    spell_roles = [
        (30380, 7981, 'sort'), (30381, 7981, 'sort'), (30382, 7981, 'sort'),
        (30383, 7982, 'sort'), (30384, 7982, 'sort'),
        (30385, 7983, 'sort'), (30386, 7983, 'sort'), (30387, 7983, 'sort'), (30388, 7983, 'sort'),
        (30389, 7984, 'sort'), (30391, 7984, 'sous-sort (dégâts réels de Troollooportation)'),
        (30392, 7984, 'sort'), (30393, 7984, 'sort'), (30394, 7984, 'sort'),
        (30430, 7984, 'sort de départ (passif)'), (30432, 7984, 'Rassemblement : attirance + poussée (chaîne)'),
        (30609, 7984, 'Rassemblement : arrivée (delay 7, TP 300)'), (30750, 7984, 'Rassemblement : passe-tour pré-combat'),
        (30724, 7984, 'Faveurs de la foule (+25 %)'), (30659, 7984, 'Compteur de faveur (−5 % par objectif)'),
        (30723, 7984, 'Délock : invulnérabilité retirée à l\'entrée des pics'), (30718, 7984, 'mort de Mama'),
        (30660, 7984, 'animation'), (30661, 7984, 'animation'), (30448, 7984, "objectif « Attirance » (vérification)"),
        (30694, 'troolls', 'passif des Troolls'), (30700, 'troolls+joueurs', 'passif Vulnérable à la sortie des pics'),
        (30701, 'troolls+joueurs', 'déclenché EOFF'), (30754, 'troolls', 'objectif Empalé (vérification)'),
        (30390, 'manager', 'glyphe des pics (référence)'),
        (30416, 7980, 'sort commun des archétypes'), (30639, 7980, 'passif des archétypes'),
        (30421, 7985, 'sort de départ du Poutch'), (30568, 7986, 'sort de départ du Poutch amélioré'),
        (30403, 'acrobate', 'invoque 7985'), (30569, 'acrobate', 'invoque 7986'),
    ]
    spells = {}
    for sid, owner, role in spell_roles:
        b = spell_block(sid, owner, role)
        if sid in DPLN_SPELLS:
            b['dpln'] = DPLN_SPELLS[sid]
        if sid in SPELL_DISCREPANCIES:
            b['discrepancies'] = SPELL_DISCREPANCIES[sid]
        spells[str(sid)] = b

    threat = threat_tables()
    data = {
        'meta': {
            'title': 'Gladiatrool — monstres, boss, gabarit joueur et invocation (données normalisées pour le simulateur)',
            'generatedOn': datetime.date.today().isoformat(),
            'generator': 'tools/monsters/build_monsters.py',
            'note': 'research/notes/20_monstres_boss.md',
            'sources': {
                'primary': [f'{API}/monsters/<id>', f'{API}/spells/<id>', f'{API}/spell-levels/<id>', f'{API}/spell-states/<id>',
                            'research/raw/dofusdb/ (extraction 2026-09-28, revérifiée en direct : 0 différence ; monstres mis à jour 2026-06-23)'],
                'reported': [DPLN + ' (sections II, V, VI ; maj 21/05/2026)', 'research/notes/40_carte_positions.md',
                             'research/notes/50_sources_web.md', 'research/notes/60_videos.md'],
                'engine': ['tools/mechanics/damage.py', 'tools/mechanics/zones.py', 'tools/mechanics/movement.py',
                           'research/notes/70_formules_dofus.md'],
            },
            'labels': {'FAIT vérifié': 'données du client (DofusDB)', 'FAIT rapporté': 'guide / vidéo / forum', 'HYPOTHÈSE': 'déduction'},
            'damageFormula': ('dégâts = int(jet × (100 + Force + Puissance)/100) [+ Dommages] → × dégressivité de zone → − rés. fixes → '
                              '× (1 − rés.%) → × dommages finaux du lanceur (100 + Σ1171 − Σ1172)/100 → × multiplicateurs 1163 de la cible ; '
                              'chaque multiplication tronquée. Critique : liste criticalEffect (jets différents), probabilité = taux du sort (monstres : 0 % de stat Critique).'),
            'targetDefaults': 'cible joueur : 30 000 PV, 0 % résistance ; variantes : Vulnérable (×2, 1163 déclencheur D), Pugnace (25 % rés.)',
        },
        'legend': {'masks': {k: v[0] for k, v in MASK_LEGEND.items()}, 'triggers': {k: v[0] for k, v in TRIGGER_LEGEND.items()},
                   'executors': {str(k): v[0] + ' : ' + v[1] for k, v in EXECUTORS.items()}},
        'monsters': monsters,
        'spells': spells,
        'states': states_block(),
        'damageTable': dmg_table(),
        'threat': threat,
        'boss': boss_block(),
        'waves': build_waves(threat),
        'pics': {
            'spell': 30390,
            'entry': {'damage': 2000, 'appliesTo': 'tous', 'extra': 'Def (monstres) : ×2 (1163) tant qu\'ils sont dans les pics ; état Vulnérable affiché pour tous'},
            'turnStart': {'damage': 1000, 'monsterEffective': 2000, 'playerEffective': '1000 selon la donnée (Atq sans ×2) / 2000 selon DPLN : à trancher (note 70 §4.5)'},
            'exit': "30700/30701 : Vulnérable + ×2 pendant 1 tour (porteurs : Troolls via Trooler, joueurs via Gladiatrooller ; PAS Mama, PAS le Poutch)",
            'note': 'Mécanique détaillée : research/notes/70_formules_dofus.md §4.5 et research/notes/41_carte_donnees.md.',
        },
        'aiModel': ai_model(),
        'discrepancies': GLOBAL_DISCREPANCIES,
        'openQuestions': OPEN_QUESTIONS,
    }
    return data


def main():
    data = build()
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('écrit', os.path.relpath(OUT, ROOT), os.path.getsize(OUT), 'octets')
    if '--summary' in sys.argv:
        for sid, r in data['damageTable'].items():
            print(sid, r['spellName'], {k: (v['normal'], v['critical'], v['expectedPerCast']) for k, v in r['variants'].items()
                                        if 'pugnace' not in k})
        print(json.dumps(data['threat'], ensure_ascii=False, indent=1))
        print(json.dumps(data['waves']['totals'], ensure_ascii=False))


if __name__ == '__main__':
    main()
