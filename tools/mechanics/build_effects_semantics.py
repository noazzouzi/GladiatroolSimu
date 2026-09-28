#!/usr/bin/env python3
"""Génère research/data/effects_semantics.json : sémantique, pour le simulateur, de chaque effectId utilisé
dans les sorts extraits (research/raw/dofusdb/spell_levels.json).

Sources combinées :
* DofusDB /effects (description FR/EN, catégorie, caractéristique) — research/raw/dofusdb/effects.json ;
* nom interne DOFUS 3 de l'action (enum ``ActionIds`` du client IL2CPP) — research/data/action_ids_dofus3.json ;
* comportement du moteur (client 2.73.3 décompilé : DamageCalculator / ActionIdHelper / PushUtils / Teleport /
  HaxeBuff / SpellManager) — voir research/notes/70_formules_dofus.md ;
* usages observés dans les sorts (paramètres, masques, déclencheurs, zones, durées).

Usage : python3 tools/mechanics/build_effects_semantics.py
"""
from __future__ import annotations

import collections
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import damage as D  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.path.join(ROOT, 'research', 'raw', 'dofusdb')
OUT = os.path.join(ROOT, 'research', 'data', 'effects_semantics.json')
ACTIONS = os.path.join(ROOT, 'research', 'data', 'action_ids_dofus3.json')
GLADIA = (30370, 30800)

H, M, B = 'haute', 'moyenne', 'basse'
P_DICE = {'diceNum': 'valeur min (#1)', 'diceSide': 'valeur max (#2) ; 0 => fixe = diceNum', 'value': 'inutilisé (#3)'}
P_N = {'diceNum': 'valeur (#1)', 'diceSide': '0 (ou max si fourchette)', 'value': 'inutilisé'}
P_STATE = {'diceNum': '0', 'diceSide': '0', 'value': "id d'état (/spell-states/<value>)"}
P_SUB = {'diceNum': 'id du sous-sort (/spells/<diceNum>)', 'diceSide': 'grade du sous-sort',
         'value': "nb max d'exécutions par lancer si « GlobalLimitation » (2017/2160/2792/2793/2795), sinon non utilisé par le moteur client"}
P_GLYPH = {'diceNum': 'id du sort associé à la marque (effets déclenchés)', 'diceSide': 'grade de ce sort',
           'value': 'couleur RGB de la marque (décimal)'}
P_NONE = {'diceNum': '0', 'diceSide': '0', 'value': '0'}

DMG = ('dommage', "Dégâts élémentaires boostables : jet (diceNum..diceSide) -> +bonus de base (293) -> x(100 + carac élément + Puissance)/100 -> + Dommages + Dommages élément (+ Dommages critiques si effet critique) -> dégressivité de zone -> - rés. fixes - rés. critiques -> x(1 - rés.%) -> multiplicateurs (dommages finaux, mêlée/distance, sorts) -> x multiplicateurs 1163 de la cible -> bouclier -> PV, érosion.")
STEAL = ('vol de vie', "Comme les dégâts de l'élément, puis le lanceur est soigné de 50 % des PV réellement retirés (int), plafonné à ses PV manquants (0 si incurable).")

SEM = {
    4: ('téléportation', P_N, "Le LANCEUR est téléporté sur la case ciblée si elle est libre et marchable ; si la zone n'est pas 'P', première case libre de la zone ; sinon rien. diceNum/diceSide non utilisés par le moteur (valeurs 6/63 = affichage ?).", M),
    5: ('poussée', {'diceNum': 'nombre de cases', 'diceSide': '0', 'value': '0'}, "Repousse de diceNum cases (direction : depuis le lanceur si la cible est sur la case ciblée, sinon depuis la case ciblée ; diagonale => ceil(n/2) pas). Dommages de collision : int(reste * (floor(niv/2) + 32 + DoPou - RéPou) / (4*2^i)). Voir movement.push.", H),
    6: ('attirance', {'diceNum': 'nombre de cases', 'diceSide': '0', 'value': '0'}, "Attire de diceNum cases vers le lanceur (direction opposée à la poussée calculée depuis la position courante du lanceur). Aucun dommage de collision.", H),
    8: ('échange', P_NONE, "Échange les positions du lanceur et de la cible (impossible si Enraciné/état effet 3, état « pas d'échange » effet 18 ou cible portée).", H),
    89: ('dommage', {'diceNum': '% des PV courants du lanceur', 'diceSide': '0', 'value': '0'}, "Dégâts NEUTRES = int(diceNum * PV_courants_lanceur * 0.01). NON boostables (ni Force ni Puissance ni dommages finaux) ; résistances neutres et 1163 de la cible appliqués.", H),
    93: STEAL + (P_DICE, H), 94: STEAL + (P_DICE, H), 95: STEAL + (P_DICE, H),
    96: DMG + (P_DICE, H), 97: DMG + (P_DICE, H), 98: DMG + (P_DICE, H), 99: DMG + (P_DICE, H), 100: DMG + (P_DICE, H),
    108: ('soin', P_DICE, "Soin élément Feu : jet -> x(100 + Intelligence)/100 (sans Puissance) -> + Soins -> x soins finaux (143)/100 -> plafonné aux PV manquants ; 0 si incurable. Dégressivité de zone appliquée.", H),
    111: ('boost', P_N, '+diceNum PA (buff, durée = duration tours du lanceur).', H),
    115: ('boost', P_N, '+diceNum % Critique (stat 18), additionné au taux critique des sorts.', H),
    117: ('boost', P_N, '+diceNum PO (stat 19), s\'ajoute à la portée des sorts « rangeCanBeBoosted ».', H),
    125: ('boost', P_N, '+diceNum Vitalité (PV max et PV courants).', H),
    128: ('boost', P_N, '+diceNum PM.', H),
    132: ('désenvoûtement', P_NONE, 'Retire les envoûtements (buffs désenvoûtables) de la cible.', H),
    138: ('boost', P_N, '+diceNum Puissance (stat 25) : s\'ajoute à la caractéristique dans le multiplicateur des dégâts (pas des soins).', H),
    140: ('tour', P_NONE, 'La cible passe son prochain tour (CharacterPassNextTurn).', H),
    141: ('mort', P_NONE, 'Tue la cible.', H),
    147: ('résurrection', {'diceNum': '0', 'diceSide': '0', 'value': '% des PV max rendus'}, 'Ressuscite un allié mort avec value % de ses PV.', H),
    149: ('apparence', {'diceNum': '0', 'diceSide': '0', 'value': 'id de look'}, 'Change l\'apparence (cosmétique).', H),
    150: ('état', P_NONE, 'Rend la cible invisible (masques, LdV, tacle affectés).', H),
    153: ('debuff', P_N, '-diceNum Vitalité.', H),
    162: ('debuff', P_N, '-diceNum Esquive PA (stat 27).', H),
    163: ('debuff', P_N, '-diceNum Esquive PM (stat 28).', H),
    168: ('debuff', P_N, '-diceNum PA non esquivable (CharacterDeboostActionPoints).', H),
    169: ('debuff', P_N, '-diceNum PM non esquivable (CharacterDeboostMovementPoints).', H),
    181: ('invocation', {'diceNum': 'id du monstre', 'diceSide': 'grade', 'value': '0'}, 'Invoque le monstre diceNum (grade diceSide) sur la case ciblée (si libre), avec emplacement d\'invocation.', H),
    293: ('modificateur de sort', {'diceNum': 'id du sort modifié', 'diceSide': '0', 'value': 'bonus de dégâts de base'}, 'Ajoute value au JET de base des effets de dégâts du sort diceNum (avant le multiplicateur de caractéristique).', H),
    296: ('modificateur de sort', {'diceNum': 'id du sort modifié', 'diceSide': '0', 'value': 'PA'}, 'Modifie le coût en PA du sort diceNum (DeboostSpellApCost).', M),
    335: ('apparence', {'diceNum': '0', 'diceSide': '0', 'value': 'id d\'apparence'}, 'Ajoute une apparence (cosmétique, archétype).', H),
    401: ('glyphe', P_GLYPH, "Pose un glyphe « de début de tour » sur la zone : le sort (diceNum, grade diceSide) est lancé sur toute entité qui COMMENCE son tour dans le glyphe (Gladiatrool : 30390 niv.3 = 1000 dégâts neutres, x2 si Vulnérable).", H),
    402: ('glyphe', P_GLYPH, 'Pose un glyphe « de fin de tour » : le sort est lancé sur toute entité qui TERMINE son tour dedans.', H),
    406: ('désenvoûtement', {'diceNum': '0', 'diceSide': '0', 'value': 'id du sort'}, 'Retire de la cible les effets du sort value (FightDispellSpell). (Le moteur client applique aussi au lanceur dans certains cas.)', H),
    414: ('boost', P_N, '+diceNum Dommages de poussée (stat 84).', H),
    417: ('debuff', P_N, '-diceNum Résistance poussée (stat 85).', H),
    418: ('boost', P_N, '+diceNum Dommages critiques (stat 86), ajoutés aux effets critiques.', H),
    666: ('aucun', P_NONE, 'Aucun effet (Noop) — marqueur.', H),
    765: ('sacrifice', P_NONE, 'Intercepte les dommages (CharacterSacrify) : les dégâts subis par la cible sont redirigés vers le lanceur.', H),
    776: ('boost', P_N, '+diceNum % d\'érosion (stat 75) : fraction des dégâts subis retirée des PV max (plafond 50 % dans la formule).', H),
    792: ('lancer-sort', P_SUB, 'TargetExecuteSpell : la CIBLE de l\'effet lance le sous-sort sur sa propre case (pour un buff déclenché : le porteur).', H),
    950: ('état', P_STATE, 'Ajoute l\'état value à la cible pour duration tours (-1 = combat entier / tant que l\'aura).', H),
    951: ('état', P_STATE, 'Retire l\'état value.', H),
    952: ('état', P_STATE, 'Désactive l\'état value (FightDisableState).', H),
    1008: ('invocation', {'diceNum': 'id de bombe', 'diceSide': 'grade', 'value': '0'}, 'Invoque une bombe.', H),
    1009: ('bombe', P_NONE, 'Fait exploser les bombes (et celles reliées).', H),
    1011: ('invocation', {'diceNum': 'id du monstre', 'diceSide': 'grade', 'value': '0'}, 'Invoque un esclave (contrôlable).', H),
    1017: ('lancer-sort', P_SUB, 'TargetExecuteSpellOnSource : la cible lance le sous-sort sur le lanceur (ou sur le déclencheur si effet déclenché).', H),
    1018: ('lancer-sort', P_SUB, 'SourceExecuteSpellOnTarget : le lanceur (ou déclencheur) lance le sous-sort sur la cible.', H),
    1019: ('lancer-sort', P_SUB, 'SourceExecuteSpellOnSource : le lanceur (ou déclencheur) lance le sous-sort sur lui-même.', H),
    1027: ('boost', P_DICE, '% de dommages de combo des bombes (stat 94).', H),
    1031: ('tour', P_NONE, 'Termine immédiatement le tour de la cible.', H),
    1039: ('bouclier', P_N, 'Bouclier = int(PV_max_du_LANCEUR * diceNum * 0.01) ; absorbe les dégâts avant les PV.', H),
    1040: ('bouclier', P_N, 'Bouclier fixe de diceNum points (pas de dégressivité de zone pour les boucliers).', H),
    1042: ('attirance', {'diceNum': 'nombre de cases', 'diceSide': '0', 'value': '0'}, 'CharacterGetPulled : c\'est le LANCEUR qui avance de diceNum cases vers la cible (rôles inversés d\'une attirance).', H),
    1048: ('dommage (faux)', {'diceNum': '% des PV courants de la cible', 'diceSide': '0', 'value': '0'}, 'Retire int(diceNum * PV_courants_cible * 0.01) PV (CharacterLifePointsMalusPercent). Pas de dégressivité, ignore le bouclier, ne déclenche pas les 1163 ? (faux dommage).', M),
    1060: ('apparence', P_N, 'Taille de l\'apparence (cosmétique).', H),
    1063: ('dommage', P_DICE, 'Dégâts Terre FIXES : non boostables (ni carac, ni Puissance, ni Dommages, ni dommages finaux), résistances et 1163 appliqués.', H),
    1064: ('dommage', P_DICE, 'Dégâts Air FIXES (non boostables).', H),
    1065: ('dommage', P_DICE, 'Dégâts Eau FIXES (non boostables).', H),
    1066: ('dommage', P_DICE, 'Dégâts Feu FIXES (non boostables).', H),
    1076: ('boost', P_N, '+diceNum % de résistance tous éléments (stat 101), plafond 50 % pour un joueur.', H),
    1078: ('boost', P_N, '+diceNum % de Vitalité (statique).', H),
    1079: ('debuff', P_N, '-diceNum PA ESQUIVABLES (esquive PA de la cible vs retrait PA du lanceur).', H),
    1080: ('debuff', P_N, '-diceNum PM ESQUIVABLES.', H),
    1091: ('glyphe', P_GLYPH, "Pose un glyphe-AURA : les effets du sort (diceNum, grade diceSide) s'appliquent à toute entité qui ENTRE/SE TROUVE dans la zone et sont retirés quand elle en sort (Gladiatrool : 30390 niv.2 = 2000 dégâts neutres + état Vulnérable + « Dommages subis x200 % » tant qu'elle est dans les pics).", H),
    1092: ('dommage', {'diceNum': '% des PV érodés de la cible', 'diceSide': '0', 'value': '0'}, 'Dégâts neutres = diceNum % des PV érodés de la CIBLE (non boostables ; rés. neutres et 1163 appliqués). Le client 2.73 prévisualise avec la stat 75 (% d\'érosion), probable bogue d\'aperçu.', M),
    1097: ('invocation', P_N, 'Crée diceNum illusions (Crâ/Sram) autour du lanceur.', H),
    1099: ('téléportation', P_NONE, 'Ramène la cible à sa position de début de tour.', H),
    1100: ('téléportation', P_NONE, 'Ramène la cible à sa position précédente (avant le dernier déplacement).', H),
    1103: ('poussée', {'diceNum': 'nombre de cases (63 = jusqu\'au bord)', 'diceSide': '0', 'value': '0'}, 'Poussée SANS dommages de collision (FightPushNoDamage). Gladiatrool : Rassemblement Troollesque pousse de 63 cases = jusqu\'à l\'obstacle/bord.', H),
    1109: ('soin', P_N, 'Soin = diceNum % des PV max de la CIBLE (non boosté ; soins finaux non appliqués).', H),
    1118: ('dommage', {'diceNum': '% des PV érodés du lanceur', 'diceSide': '0', 'value': '0'}, 'Dégâts = int(diceNum * PV_érodés_lanceur / 100) ; élément « aucun » (-1) dans le client : seule la rés. % tous éléments (101) s\'applique ; non boostables.', H),
    1123: ('dommage (renvoi)', {'diceNum': '% des dommages initiaux', 'diceSide': '0', 'value': '0'}, 'Inflige diceNum % des dommages BRUTS (avant résistances) du dernier coup reçu par le lanceur, dans l\'élément de ce coup (splash). Non boostable.', M),
    1160: ('lancer-sort', P_SUB, 'CasterExecuteSpell : le lanceur lance le sous-sort sur la case de la cible (une fois par cible touchée).', H),
    1163: ('multiplicateur', {'diceNum': 'pourcentage (200 = x2, 50 = x0,5)', 'diceSide': '0', 'value': '0'}, "Multiplie les dommages SUBIS par la cible : m = int(m * diceNum * 0.01) pour chaque buff 1163 dont le déclencheur correspond (D = tout dommage hors poussée ; PD/PMD/PPD = dommages de poussée ; DN/DE/... = élément ; DBA = dommages d'un allié…). Appliqué après résistances et multiplicateurs de dommages infligés. Vulnérable du Gladiatrool = x200 % (donc x2, et non +200 %).", H),
    1165: ('glyphe', P_GLYPH, 'Pose un glyphe « immédiat » (FightAddGlyphCastingSpellImmediate) : sort lancé à la pose puis selon les règles du glyphe.', M),
    1171: ('boost', P_N, '+diceNum % dommages finaux (stat 107, multiplicateur 100 + x).', H),
    1172: ('debuff', P_N, '-diceNum % dommages finaux.', H),
    1223: ('dommage (renvoi)', {'diceNum': '% des dommages finaux', 'diceSide': '0', 'value': '0'}, 'Inflige diceNum % des dommages FINAUX du dernier coup subi par le lanceur (splash), dans son élément ; non boostable, sans dégressivité.', M),
    2017: ('lancer-sort', P_SUB, 'Comme 1017 (la cible lance sur le lanceur) avec limite globale value exécutions par lancer.', H),
    2018: ('glyphe', {'diceNum': 'id de sort (0 = tous)', 'diceSide': '-', 'value': '0'}, 'Dissipe les glyphes posés par la cible (ceux du sort diceNum si != 0).', H),
    2020: ('soin', P_N, 'Soigne diceNum % des dommages subis (splash heal).', H),
    2027: ('contrôle', P_NONE, 'Prend le contrôle de l\'entité ciblée.', H),
    2160: ('lancer-sort', P_SUB, 'Comme 1160 (le lanceur lance sur la cible) avec limite globale value exécutions par lancer.', H),
    2792: ('lancer-sort', P_SUB, 'Comme 792 (la cible lance sur elle-même) avec limite globale value.', H),
    2794: ('lancer-sort', P_SUB, 'TargetExecuteSpellOnCell : la cible lance le sous-sort sur la CASE CIBLÉE par le sort parent.', H),
    2803: ('boost', P_N, 'Résistance mêlée +diceNum % : diminue le multiplicateur de dommages mêlée reçus (stat 124 = 100 - x).', H),
    2807: ('boost', P_N, 'Résistance distance +diceNum % : diminue la stat 121 (dommages distance reçus).', H),
    2872: ('seuil', P_N, 'Seuil de PV : la cible ne peut pas descendre sous diceNum PV tant que l\'effet dure (immortalité).', H),
    2960: ('lancer-sort', P_SUB, 'CasterExecuteSpellOnCell : le lanceur lance le sous-sort sur la case ciblée (sans cible requise).', H),
    2971: ('boost', P_N, '+diceNum % soins finaux (stat 143).', H),
    3001: ('soin', P_DICE, 'Soin élément NEUTRE : boosté par la FORCE (carac de l\'élément neutre), sans Puissance ; + Soins ; x soins finaux ; plafonné aux PV manquants. Gladiatrool : 44-48 x61 = 2684-2928.', H),
    3008: ('choix', {'diceNum': '0', 'diceSide': '0', 'value': 'id de la liste de choix'}, 'Propose un choix au joueur (archétype, amélioration...).', H),
    3400: ('interface', {'diceNum': '0', 'diceSide': '0', 'value': 'id de notification'}, 'Affiche une notification de combat (objectif) — sans effet de jeu.', H),
    3401: ('interface', {'diceNum': '0', 'diceSide': '0', 'value': 'id de notification'}, 'Retire une notification de combat.', H),
    3404: ('choix', {'diceNum': '0', 'diceSide': '0', 'value': 'id de la liste de choix'}, 'Propose un choix global (toute l\'équipe).', H),
    3405: ('sort temporaire', {'diceNum': '0', 'diceSide': '0', 'value': 'id de spell-level'}, 'Apprend un sort temporaire (spell-level value) au porteur pour le combat.', H),
    3406: ('sort temporaire', {'diceNum': '0', 'diceSide': '0', 'value': 'id de spell-level'}, 'Désapprend le sort temporaire value.', H),
    3407: ('tour', {'diceNum': '0', 'diceSide': '0', 'value': 'secondes'}, 'Fixe la durée des prochains tours à value secondes.', H),
    3792: ('visuel', {'diceNum': '0', 'diceSide': '0', 'value': 'id de script visuel'}, 'ExecuteSpellScriptUsage : animation/visuel uniquement.', H),
    3793: ('visuel', {'diceNum': '0', 'diceSide': '0', 'value': 'id de script visuel'}, 'ExecuteSpellScriptUsageOnTarget : animation/visuel uniquement.', H),
}


def main():
    with open(os.path.join(RAW, 'effects.json'), encoding='utf-8') as f:
        effects = json.load(f)
    with open(os.path.join(RAW, 'spell_levels.json'), encoding='utf-8') as f:
        levels = json.load(f)
    with open(os.path.join(RAW, 'spells.json'), encoding='utf-8') as f:
        spells = json.load(f)
    actions = {}
    if os.path.exists(ACTIONS):
        with open(ACTIONS, encoding='utf-8') as f:
            actions = json.load(f)['actionIds']
    use = collections.defaultdict(list)
    for l in levels.values():
        for tag in ('effects', 'criticalEffect'):
            for e in l.get(tag, []):
                use[e['effectId']].append((l, tag, e))
    out = {}
    missing = []
    for eid_s, ed in sorted(effects.items(), key=lambda kv: int(kv[0])):
        eid = int(eid_s)
        u = use.get(eid, [])
        g = [x for x in u if GLADIA[0] <= x[0]['spellId'] <= GLADIA[1]]
        sem = SEM.get(eid)
        if sem is None:
            missing.append(eid)
            sem = ('inconnu', P_N, 'Non documenté.', B)
        cat, params, text, conf = sem
        masks = collections.Counter(re.sub(r'\d+', '#', e['targetMask']) for _, _, e in u)
        trigs = collections.Counter(e['triggers'] for _, _, e in u)
        zones = collections.Counter((chr(e['zoneDescr']['shape']) if e['zoneDescr']['shape'] else '-')
                                    + str(e['zoneDescr']['param1']) for _, _, e in u)
        durs = collections.Counter(e['duration'] for _, _, e in u)
        ex = []
        for l, tag, e in (g or u)[:4]:
            s = spells.get(str(l['spellId']), {})
            ex.append({'spellId': l['spellId'], 'sort': (s.get('name') or {}).get('fr'), 'grade': l['grade'],
                       'critique': tag == 'criticalEffect', 'diceNum': e['diceNum'], 'diceSide': e['diceSide'],
                       'value': e['value'], 'duration': e['duration'], 'delay': e['delay'],
                       'targetMask': e['targetMask'], 'triggers': e['triggers'],
                       'zone': (chr(e['zoneDescr']['shape']) if e['zoneDescr']['shape'] else '-')
                       + f"{e['zoneDescr']['param1']},{e['zoneDescr']['param2']}"})
        elem = D.element_of(eid)
        out[eid_s] = {
            'nom_fr': (ed.get('description') or {}).get('fr'),
            'nom_en': (ed.get('description') or {}).get('en'),
            'action_dofus3': (actions.get(eid_s) or [None])[0],
            'categorie': cat,
            'element': D.ELEMENT_NAMES.get(elem) if elem != -1 else None,
            'boostable': D.is_boostable(eid) if cat.startswith('dommage') or cat in ('soin', 'vol de vie') else None,
            'dofusdb': {'category': ed.get('category'), 'characteristic': ed.get('characteristic'),
                        'operator': ed.get('characteristicOperator'), 'bonusType': ed.get('bonusType'),
                        'elementId': ed.get('elementId')},
            'parametres': params,
            'semantique': text,
            'confiance': conf,
            'occurrences': {'gladiatrool_30370_30800': len(g), 'total_extrait': len(u)},
            'masques_observes': dict(masks.most_common(6)),
            'declencheurs_observes': dict(trigs.most_common(6)),
            'zones_observees': dict(zones.most_common(6)),
            'durees_observees': {str(k): v for k, v in durs.most_common(6)},
            'exemples': ex,
        }
    meta = {
        '_meta': {
            'description': 'Sémantique des effectId pour le simulateur du Gladiatrool (voir research/notes/70_formules_dofus.md).',
            'parametres': 'Convention Ankama : #1 = diceNum, #2 = diceSide, #3 = value. Bornes d\'un jet : min = diceNum (ou value si diceNum = diceSide = 0), max = diceSide si != 0 sinon min.',
            'durees': 'duration : -1 = infini (ou tant que l\'aura), 0 = instantané, n = n tours ; décompte au DÉBUT de chaque tour du LANCEUR du buff (BuffManager.incrementDuration, INCREMENT_MODE_SOURCE) ; >= 63 = infini. delay : nombre de tours du lanceur avant activation.',
            'sources': [
                'https://api.dofusdb.fr/effects/<id> (research/raw/dofusdb/effects.json)',
                'client DOFUS 3 3.6.12.16, enum ActionIds (research/data/action_ids_dofus3.json, tools/mechanics/il2cpp_actionids.py)',
                'client DOFUS 2.73.3 décompilé : tools.ActionIdHelper, damageCalculation.* (formules, voir notes/70)',
            ],
            'effets_non_documentes': missing,
            'genere_par': 'tools/mechanics/build_effects_semantics.py',
        }
    }
    meta.update(out)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    print(f'{len(out)} effets -> {OUT} ; non documentés : {missing}')


if __name__ == '__main__':
    main()
