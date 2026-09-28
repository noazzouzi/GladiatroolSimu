#!/usr/bin/env python3
"""Construit ``research/data/fight_scripts.json`` : mécaniques SCRIPTÉES du combat du Gladiatrool.

Entrées (lecture seule) :
  - research/raw/dofusdb/{spells,spell_levels,spell_states,monsters}.json (extraction DofusDB = client DOFUS 3)
  - research/data/map_139988488.json (agent « carte - données » : cellules jouables / glyphe)
  - research/data/map_annotations.json (agent « carte - analyse visuelle » : apparitions, cadeaux, Mama)
  - tools/mechanics/damage.py (formules de dégâts, agent « formules »)

Principe : toute valeur chiffrée est RELUE dans les données (et vérifiée par assertion) ; les interprétations
sont écrites à la main avec un statut (FAIT vérifié / FAIT rapporté / HYPOTHÈSE) et une confiance.

Usage : python3 tools/fight_scripts/build_fight_scripts.py   (stdlib + tools/mechanics)
"""
from __future__ import annotations

import json
import os
import sys
from collections import OrderedDict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'research', 'raw', 'dofusdb')
DATA = os.path.join(ROOT, 'research', 'data')
sys.path.insert(0, os.path.join(ROOT, 'tools', 'mechanics'))
from damage import Stats, Multiplier, damage_range  # noqa: E402

S = json.load(open(os.path.join(RAW, 'spells.json')))
L = json.load(open(os.path.join(RAW, 'spell_levels.json')))
ST = json.load(open(os.path.join(RAW, 'spell_states.json')))
MON = json.load(open(os.path.join(RAW, 'monsters.json')))
MAP = json.load(open(os.path.join(DATA, 'map_139988488.json')))
ANN = json.load(open(os.path.join(DATA, 'map_annotations.json')))

API = 'https://api.dofusdb.fr'
FV, FR, HY = 'FAIT vérifié', 'FAIT rapporté', 'HYPOTHÈSE'
DPLN = 'https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026)'


# ------------------------------------------------------------------------------------------------
# Accès aux données
# ------------------------------------------------------------------------------------------------

def spell(sid):
    return S[str(sid)]


def sname(sid):
    s = S.get(str(sid))
    if not s:
        return None
    return s['name']['fr'] + (f" [{s['adminName']}]" if s.get('adminName') else '')


def level(sid, grade):
    lid = spell(sid)['spellLevels'][grade - 1]
    lv = L[str(lid)]
    assert lv['grade'] == grade and lv['spellId'] == sid, (sid, grade)
    return lv


def lid(sid, grade):
    return spell(sid)['spellLevels'][grade - 1]


def eff(sid, grade, order):
    for e in level(sid, grade)['effects']:
        if e['order'] == order:
            return e
    raise KeyError((sid, grade, order))


def src(sid, grade=None, order=None):
    s = f"{API}/spells/{sid}"
    if grade is not None:
        s += f" ; spell-level {lid(sid, grade)} ({API}/spell-levels/{lid(sid, grade)})"
    if order is not None:
        s += f" effet order={order}"
    return s


def state(i):
    s = ST[str(i)]
    return {'id': i, 'name': s['name']['fr'],
            'flags': [k for k, v in s.items() if isinstance(v, bool) and v],
            'stateEffectsIds': s.get('effectsIds', [])}


def spell_of_level(level_id):
    lv = L.get(str(level_id))
    if not lv:
        return None
    return {'spellLevelId': level_id, 'spellId': lv['spellId'], 'grade': lv['grade'], 'name': sname(lv['spellId'])}


def od(pairs, extra):
    d = OrderedDict(pairs)
    d.update(extra)
    return d


# ------------------------------------------------------------------------------------------------
# 1. Glyphe de combat (pics)
# ------------------------------------------------------------------------------------------------

def build_spike_glyph():
    l1 = level(30390, 1)
    e401 = eff(30390, 1, 0)
    e1091 = eff(30390, 1, 1)
    assert e401['effectId'] == 401 and e1091['effectId'] == 1091
    raw_cells = e401['zoneDescr']['cellIds']
    assert raw_cells == e1091['zoneDescr']['cellIds']
    distinct = sorted(set(raw_cells))
    dups = sorted({c for c in raw_cells if raw_cells.count(c) > 1})
    walk = set(MAP['specialCells']['fightWalkableCells'])
    playable = [c for c in distinct if c in walk]
    non_walk = [c for c in distinct if c not in walk]
    assert playable == sorted(MAP['specialCells']['glyphFightWalkableCells'])
    assert playable == ANN['spikeGlyphCells']

    l2 = level(30390, 2)
    l3 = level(30390, 3)
    # contrôle des valeurs
    assert (eff(30390, 2, 4)['effectId'], eff(30390, 2, 4)['diceNum'], eff(30390, 2, 4)['targetMask']) == (100, 2000, 'Atq,A')
    assert (eff(30390, 2, 5)['effectId'], eff(30390, 2, 5)['diceNum'], eff(30390, 2, 5)['targetMask']) == (100, 2000, 'Def,A')
    e1163 = eff(30390, 2, 6)
    assert (e1163['effectId'], e1163['diceNum'], e1163['targetMask'], e1163['triggers'], e1163['duration']) == (1163, 200, 'Def,A', 'D', -1)
    assert [(e['effectId'], e['diceNum'], e['targetMask']) for e in l3['effects']] == [(100, 1000, 'Atq,A'), (100, 1000, 'Def,A')]
    p700 = level(30700, 1)['effects'][0]
    assert p700['effectId'] == 792 and p700['diceNum'] == 30701 and p700['triggers'] == 'EOFF5902|EOFF5903'
    x = level(30701, 1)['effects']
    assert (x[0]['effectId'], x[0]['value'], x[0]['duration']) == (950, 5994, 1)
    assert (x[1]['effectId'], x[1]['diceNum'], x[1]['triggers'], x[1]['duration']) == (1163, 200, 'D', 1)

    # ---- dégâts calculés (moteur tools/mechanics/damage.py) ----
    zero = Stats()                                   # poseur du glyphe : aucune carac (HYPOTHÈSE, cf. 2000 exacts observés)
    trooll = Stats(is_player=False, max_hp=25000, hp=25000)
    player = Stats(max_hp=30000, hp=30000)
    player_res10 = Stats(max_hp=30000, hp=30000, res_pct_all=10)
    V = [Multiplier(200, ('D',))]
    VV = V + [Multiplier(200, ('D',))]

    def d(lo, hi, caster, target, mults=()):
        return list(damage_range(lo, hi, 100, caster, target, melee=False, target_multipliers=mults))

    expected = OrderedDict([
        ('entree_monstre', {'value': d(2000, 2000, zero, trooll)[0], 'calc': '2000 (x200 posé APRÈS les dégâts dans la liste d\'effets : effets 4-5 avant effet 6)', 'status': FV + ' (données) + ' + FR + ' (DPLN « 2 000 »)', 'confidence': 'haute'}),
        ('entree_joueur', {'value': d(2000, 2000, zero, player)[0], 'calc': '2000 × (1 − rés% neutre)', 'status': FV, 'confidence': 'haute'}),
        ('entree_joueur_avec_bonus_10pct_res', {'value': d(2000, 2000, zero, player_res10)[0], 'calc': 'Acclamation robuste (Acrobate, 1076 +10 %) : 2000 × 0,9', 'status': FV + ' (formule)', 'confidence': 'haute'}),
        ('debut_de_tour_monstre', {'value': d(1000, 1000, zero, trooll, V)[0], 'calc': '1000 (30390 niv.3) × 2 (1163 x200 de l\'aura, Def)', 'status': FV + ' + ' + FR + ' (DPLN/vidéos « 2 000 »)', 'confidence': 'haute'}),
        ('debut_de_tour_joueur_selon_donnees', {'value': d(1000, 1000, zero, player)[0], 'calc': '1000 : l\'aura ne donne PAS de 1163 au masque Atq ; le 1163 de sortie (30701) a expiré au début du propre tour du joueur', 'status': FV + ' (données) ; lecture Atq=joueurs = ' + HY, 'confidence': 'moyenne'}),
        ('debut_de_tour_joueur_selon_DPLN', {'value': 2000, 'calc': 'DPLN : « Si une entité commence son tour dans le glyphe, il subit également 2 000 » (non distingué joueur/monstre)', 'status': FR, 'confidence': 'basse (pour un joueur)'}),
        ('reentree_monstre_vulnerable_de_sortie', {'value': d(2000, 2000, zero, trooll, V)[0], 'calc': 'sorti des pics (30701 x200 actif jusqu\'à son prochain tour) puis ré-entré : 2000 × 2', 'status': HY + ' (cumul des 1163 = code client)', 'confidence': 'moyenne'}),
        ('coup_sur_monstre_reentre_x4', {'value': d(16, 20, Stats(strength=6000), trooll, VV), 'calc': 'Frappe Repoussoir 16-20 ×61 ×2 (aura) ×2 (30701) : les deux 1163 x200 se multiplient', 'status': HY, 'confidence': 'basse-moyenne (à vérifier en jeu)'}),
        ('frappe_repoussoir_hors_pics', {'value': d(16, 20, Stats(strength=6000), trooll), 'calc': 'jet 16-20 × (100+6000)/100', 'status': FV + ' ; DPLN « 1 200 »', 'confidence': 'haute'}),
        ('frappe_repoussoir_sur_vulnerable', {'value': d(16, 20, Stats(strength=6000), trooll, V), 'calc': '×2', 'status': FV, 'confidence': 'haute'}),
    ])

    return OrderedDict([
        ('spellId', 30390), ('name', sname(30390)), ('spellType', '3834 MANAGERS'),
        ('source', src(30390)),
        ('castBy', {'value': 'entité de scénario « Sce » (neutre), au lancement du combat', 'status': HY,
                    'confidence': 'moyenne',
                    'evidence': ['aucun sort des données ne lance 30390 (sort racine, lancé par le serveur)',
                                 '2000 dégâts exacts observés ⇒ poseur sans Force ni Puissance',
                                 'le glyphe cadeau (30566) est dissipé via 2018 sur la cible `Sce` (30657 niv.3) ⇒ Sce pose des glyphes']}),
        ('duration', {'value': -1, 'meaning': 'tout le combat', 'status': FV, 'source': src(30390, 1, 0)}),
        ('cells', OrderedDict([
            ('playable', playable), ('count', len(playable)),
            ('rawSpellList', raw_cells), ('rawCount', len(raw_cells)), ('rawDistinctCount', len(distinct)),
            ('duplicatesInRawList', dups), ('listedButNotWalkable', non_walk),
            ('shape', ';  (zoneDescr.shape=59 : liste explicite de cellIds, param1=1)'),
            ('geometry', 'anneau de 2 cases d\'épaisseur (edgeDepth 1 et 2) + 4 cases d\'angle 160, 295, 305, 440 (edgeDepth 3) ; 145 cases sûres ; carte de combat 139988488'),
            ('status', FV), ('confidence', 'haute'),
            ('sources', [src(30390, 1, 0), 'research/data/map_139988488.json (specialCells.glyphFightWalkableCells)',
                         'research/data/map_annotations.json (spikeGlyphCells, recalage vidéo AUC 0,957-0,981)']),
        ])),
        ('marks', [
            OrderedDict([('effectId', 1091), ('type', 'glyphe-AURA (FightAddGlyphAura)'), ('color', '#FF0000'),
                         ('castsSpell', {'spellId': 30390, 'grade': 2, 'spellLevelId': lid(30390, 2)}),
                         ('trigger', 'à l\'ENTRÉE dans la zone (marche, poussée, attirance, téléportation, échange) ; effets retirés à la SORTIE'),
                         ('targetMask', e1091['targetMask']), ('status', FV + ' (données) ; sémantique aura = code client'),
                         ('source', src(30390, 1, 1))]),
            OrderedDict([('effectId', 401), ('type', 'glyphe de DÉBUT DE TOUR (FightAddGlyphCastingSpell)'), ('color', '#FF0000'),
                         ('castsSpell', {'spellId': 30390, 'grade': 3, 'spellLevelId': lid(30390, 3)}),
                         ('trigger', 'au début du tour de toute entité dont la case est dans la zone'),
                         ('targetMask', e401['targetMask']), ('status', FV), ('source', src(30390, 1, 0))]),
        ]),
        ('onEnter', OrderedDict([
            ('spellLevel', lid(30390, 2)),
            ('effectsInOrder', [
                {'order': 0, 'effect': '950 État 5902 « ennemiHasTriggeredCombatGlyph »', 'target': 'Def,A (monstres)', 'duration': -1},
                {'order': 1, 'effect': '950 État 5903 « allyHasTriggeredCombatGlyph »', 'target': 'Atq,A (joueurs)', 'duration': -1},
                {'order': 2, 'effect': '950 État 5994 « Vulnérable »', 'target': 'Def,A', 'duration': -1},
                {'order': 3, 'effect': '950 État 5994 « Vulnérable »', 'target': 'Atq,A', 'duration': -1},
                {'order': 4, 'effect': '100 2000 dommages Neutre', 'target': 'Atq,A', 'duration': 0},
                {'order': 5, 'effect': '100 2000 dommages Neutre', 'target': 'Def,A', 'duration': 0},
                {'order': 6, 'effect': '1163 Dommages subis x200 %', 'target': 'Def,A', 'trigger': 'D', 'duration': -1, 'triggerDuration': 63},
            ]),
            ('damage', {'value': 2000, 'element': 'neutre', 'fixedRoll': True, 'appliesTo': 'joueurs ET monstres (Mama comprise)',
                        'boostedBy': 'caractéristiques du POSEUR (supposé 0) ; réduit par les résistances neutres de la victime et les boucliers ; NON doublé par le x200 qu\'il vient de poser (ordre des effets)',
                        'status': FV, 'source': src(30390, 2, 5)}),
            ('damageTakenMultiplier', {'effectId': 1163, 'percent': 200, 'factor': 2.0, 'meaning': '×2 = +100 % de dégâts subis',
                                       'trigger': 'D = tout dommage SAUF dommages de poussée (collision)', 'appliesTo': 'Def (monstres) UNIQUEMENT',
                                       'duration': 'tant que l\'entité reste dans l\'aura (retiré à la sortie)',
                                       'status': FV + ' (valeur, déclencheur) ; « Def = monstres » = ' + HY + ' forte',
                                       'confidence': 'haute (valeur) / moyenne-haute (portée)', 'source': src(30390, 2, 6)}),
            ('statesGiven', [state(5902), state(5903), state(5994)]),
        ])),
        ('onTurnStartInside', OrderedDict([
            ('spellLevel', lid(30390, 3)),
            ('damageRaw', 1000), ('element', 'neutre'),
            ('effectiveMonster', 2000), ('effectivePlayerByData', 1000), ('effectivePlayerByDPLN', 2000),
            ('explanation', '1000 bruts (30390 niv.3, masques Atq et Def) ; les monstres dans l\'aura ont le 1163 x200 ⇒ 2000 ; un joueur n\'a pas de x200 dans l\'aura (données).'),
            ('consequence', 'un Trooll resté dans les pics avec ≤ 2000 PV meurt au début de SON tour (observé : cardxc 11:00/14:30, Khytrayer 13:04)'),
            ('status', FV + ' (1000 bruts) ; 2000 monstre = ' + FV + ' + ' + FR), ('source', src(30390, 3)),
        ])),
        ('onExit', OrderedDict([
            ('mechanism', 'passif 30700 (niv.1, spell-level 81022) : 792 → 30701 sur soi, déclencheur EOFF5902|EOFF5903 (perte de l\'état « a déclenché le glyphe » = sortie de l\'aura)'),
            ('effects', ['950 État 5994 « Vulnérable » durée 1', '1163 Dommages subis x200 % déclencheur D, durée 1 (triggerDuration 1)']),
            ('duration', '1 tour du PORTEUR (lanceur = porteur) : jusqu\'au début de son prochain tour'),
            ('whoHasPassive30700', ['joueurs : via 30639 « Gladiatrooller » (sort de départ du monstre 7980)',
                                    'Troollibre 7981, Artroolleur 7982, Nitrooll 7983 : via 30694 « Trooler » (sort de départ)',
                                    'PAS la Mama Troollette 7984 (sort de départ 30430, qui ne lance pas 30700)']),
            ('appliesToPlayers', True),
            ('status', FV), ('confidence', 'haute'),
            ('sources', [src(30700, 1), src(30701, 1), src(30639, 1, 6), src(30694, 1, 1)]),
            ('tacticalConsequence', 'un monstre SORTI des pics (poussée, attirance de Mama, échange) reste ×2 jusqu\'à son prochain tour : on peut le finir hors des pics.'),
        ])),
        ('vulnerableState', OrderedDict([
            ('id', 5994), ('name', 'Vulnérable'), ('stateRecord', state(5994)),
            ('exactEffect', 'L\'état 5994 N\'A AUCUN effet propre (effectsIds = []) : c\'est un marqueur visuel/compteur (icône, « tours restants »). Le multiplicateur est l\'effet 1163 « Dommages subis x200 % » posé À CÔTÉ : ×2, soit +100 %.'),
            ('dplnClaim', '« Les entités dans l\'état vulnérable subissent 200 % de dégâts supplémentaires » (= ×3)'),
            ('verdict', '×2 (+100 %) — DPLN lit « x200 % » comme « +200 % ». Confirmé par : texte en jeu « daño sufrido por 200 % » (Khytrayer 04:15), « twice as much » (Isthos 01:53), 1000 → 2000 au début du tour.'),
            ('usedBy', ['Empalé (30431 : récompense si la victime a *E5994)', 'état affiché aux deux camps']),
            ('status', FV), ('confidence', 'haute'), ('source', f'{API}/spell-states/5994 ; ' + src(30390, 2, 6)),
        ])),
        ('triggersSummary', [
            {'event': 'entrer dans les pics (toute cause de déplacement)', 'effect': '2000 neutre + Vulnérable (+ x200 si monstre, tant qu\'il y reste)', 'status': FV},
            {'event': 'commencer son tour dans les pics', 'effect': '1000 neutre (×2 = 2000 pour un monstre)', 'status': FV},
            {'event': 'sortir des pics', 'effect': 'Vulnérable + x200 pendant 1 tour (joueurs et Troolls, pas la Mama)', 'status': FV},
            {'event': 'se déplacer d\'une case de pics à une autre', 'effect': 'aucun nouvel effet (même marque aura, on ne la quitte pas)', 'status': HY, 'confidence': 'moyenne (Huz 08:30 « ça a croqué plusieurs fois » = probablement entrée + début de tour)'},
            {'event': 'dommages de poussée (collision contre le bord)', 'effect': 'non doublés (déclencheur D exclut la poussée) ; le glyphe n\'arrête pas la poussée', 'status': FV + ' (code client)'},
        ]),
        ('relatedSpells', OrderedDict([
            ('30427', OrderedDict([('name', sname(30427)), ('role', 'BASCULE d\'états : donne (si absents) ou retire (si présents) 5898 « Simili Pics », 5902 et 5903 pour 1 tour. Simule « être dans les pics » (et déclenche EON/EOFF → 30701). Aucun sort ne le lance ; PO 0-63.'),
                                     ('usedInFight', 'non observé ; outil de test/scénario'), ('status', FV + ' (effets) / ' + HY + ' (usage)'), ('source', src(30427, 1))])),
            ('30519', OrderedDict([('name', sname(30519)), ('role', 'MAQUETTE de test : glyphe 1165 (30390 niv.2) + aura 1091 verte #01E240 (30390 niv.3) en cercle C3 ; niv.2 = 1 dommage ; niv.3 = 5902/5903 + 1163 x200 sur `A` seulement. Confirme l\'intention « x200 pour le camp adverse du poseur ». Non utilisé en combat.'),
                                     ('status', FV + ' / ' + HY + ' (usage)'), ('source', src(30519))])),
            ('30700', {'name': sname(30700), 'role': 'passif déclencheur de la vulnérabilité de sortie', 'source': src(30700, 1)}),
            ('30701', {'name': sname(30701), 'role': 'Vulnérable + x200 1 tour', 'source': src(30701, 1)}),
        ])),
        ('expectedDamage', expected),
        ('discrepancies', [
            {'topic': 'Vulnérable', 'data': '1163 x200 % = ×2', 'DPLN': '« +200 % » (×3)', 'verdict': 'données + vidéos : ×2'},
            {'topic': 'Début de tour dans les pics', 'data': '1000 bruts (×2 monstre = 2000 ; joueur = 1000)', 'DPLN': '2000 pour toute entité', 'verdict': 'monstre : concordant ; joueur : écart non tranché (HYPOTHÈSE données)'},
            {'topic': 'x200 dans les pics pour les joueurs', 'data': 'uniquement masque Def (monstres) ; joueurs ×2 seulement 1 tour APRÈS la sortie', 'DPLN': 'tout le monde', 'verdict': 'écart ; paramètre du simulateur `playersDoubledInsideSpikes` (défaut false)'},
        ]),
    ])


# ------------------------------------------------------------------------------------------------
# 2. Glyphe événementiel (cadeau) et choix
# ------------------------------------------------------------------------------------------------

def build_event_glyph():
    e = eff(30566, 1, 0)
    assert (e['effectId'], e['diceNum'], e['diceSide'], e['targetMask'], e['duration']) == (1165, 30657, 1, 'Atq,A', 1)
    l3 = level(30657, 3)['effects']
    assert (l3[1]['effectId'], l3[1]['value']) == (3008, 10) and (l3[2]['effectId'], l3[2]['diceNum']) == (2018, 30566)
    return OrderedDict([
        ('spellId', 30566), ('name', sname(30566)), ('source', src(30566, 1)),
        ('mark', OrderedDict([('effectId', 1165), ('type', 'glyphe « immédiat » (FightAddGlyphCastingSpellImmediate), 1 case (zone P1)'),
                              ('color', '#FFBE00 (orange, paquet cadeau)'), ('castsSpell', {'spellId': 30657, 'grade': 1}),
                              ('targetMask', 'Atq,A : seuls les JOUEURS le déclenchent (un monstre qui marche dessus ne le prend pas)'),
                              ('duration', '1 tour du poseur (Sce, qui ne joue pas ⇒ persiste jusqu\'au ramassage : plusieurs cadeaux coexistent)'),
                              ('status', FV + ' (effet) ; persistance = ' + FR + ' + ' + HY)])),
        ('onTrigger', OrderedDict([
            ('chain', '30657 niv.1 : 792 → niv.2 sur `Atq,A` (TOUS les joueurs) → niv.3 sur soi : animation 30687, 3008 « Propose un choix » id 10, 2018 dissipe les glyphes 30566 posés par `Sce`'),
            ('effect', 'CHAQUE joueur reçoit sa propre fenêtre de choix n°10 (2 cartes : 2 sorts uniques, 2 améliorations de ses sorts, ou 1+1 selon DPLN) ; le cadeau disparaît'),
            ('triggeredBy', 'marcher dessus OU y être poussé/attiré/téléporté (FAIT rapporté : sspritenL, forum 07/01/2025)'),
            ('pause', '≈ 30 s par choix (DPLN)'),
            ('status', FV + ' (chaîne) + ' + FR), ('sources', [src(30657), DPLN]),
        ])),
        ('placement', OrderedDict([
            ('byData', 'aucune cellule dans les données : case choisie par le serveur'),
            ('observedCells', ANN['eventGlyphCells']), ('observedCounts', ANN['eventGlyphCounts']),
            ('neverObserved', ANN['eventGlyphNeverObserved']),
            ('timing', ANN['eventGlyphTiming']),
            ('status', FR + ' (observation vidéo, agent carte)'), ('source', 'research/data/map_annotations.json (eventGlyph*)'),
        ])),
        ('knownSideEffect', {'text': 'Un personnage poussé sur un cadeau par la Mama (Rassemblement) annule son animation et ses dégâts ; elle passe son tour (la fenêtre de choix interrompt la séquence).',
                             'status': FR, 'confidence': 'moyenne', 'sources': ['cardxc 19:30', 'sspritenL (forum dofus.com 07/01/2025)']}),
    ])


def build_choices():
    return OrderedDict([
        ('_note', 'Les listes d\'options (id → cartes proposées, probabilités, critères) sont côté SERVEUR : seul l\'id de liste est dans les données (effet 3008 = choix individuel, 3404 = choix global/vote).'),
        ('10', OrderedDict([('effect', 3008), ('scope', 'individuel (chaque joueur)'), ('castBy', '30657 niv.3 (cadeau)'),
                            ('content', 'sorts uniques (19 : 6 par archétype + Pense Vite) et/ou améliorations de sorts possédés (7 par archétype) ; 2 cartes'),
                            ('status', FV + ' (id) + ' + FR + ' (contenu DPLN)'), ('source', src(30657, 3, 1))])),
        ('11-15', OrderedDict([('effect', 3404), ('scope', 'GLOBAL (vote, majorité ; égalité → tirage au sort, GD live 49:00)'),
                               ('castBy', '30443 « Objectif » niv.2..6, déclenchés par EON « Objectif N Fini » (N = 1..5) sur `Sce`'),
                               ('content', 'objectifs du palier N+1 (4 objectifs par palier ; 2 proposés observés : Khytrayer 02:47, cardxc 04:00)'),
                               ('status', FV + ' (déclencheurs) + ' + FR + ' (nombre d\'options)'), ('source', src(30443))])),
        ('16', OrderedDict([('effect', 3008), ('scope', 'individuel'), ('castBy', '30608 « Choix d\'Archétype » (sur `Atq,A`), au lancement du combat'),
                            ('content', '3 cartes : Dompteur (passif 30644, état 5899), Acrobate (30648, état 5900), Magicien (30649, état 5901) ; apparence 335 ; sort de départ appris par le serveur (Impact 80500 / Videur 80507 / Pulsation d\'Énergie 80514)'),
                            ('status', FV + ' (passifs/états) + ' + HY + ' (apprentissage du sort de départ)'), ('source', src(30608, 1))])),
        ('17', OrderedDict([('effect', 3008), ('scope', 'individuel'), ('castBy', '30658 « Choix d\'Amélioration » niv.1 → niv.2 sur chaque `Atq,A`'),
                            ('content', 'fenêtre « Choisis une amélioration permanente ! » = Acclamations de la foule : 3 cartes tirées parmi les 6 de l\'archétype'),
                            ('when', 'début des tours globaux T2 à T9 (observé, agent carte) ; pas au T1 ni au T10'),
                            ('status', FV + ' (id, sort) + ' + HY + ' forte (lien 17 = bonus) + ' + FR + ' (timing)'), ('source', src(30658))])),
    ])


# ------------------------------------------------------------------------------------------------
# 3. Objectifs
# ------------------------------------------------------------------------------------------------

# (général, nom, orientation, notification, sous-sorts, récompense, déclencheur/évaluation, condition formelle,
#  compteur, périmètre, remarques, confiance)
OBJ = [
    dict(general=30428, orientation='Objectif 1 (imposé)', notif=41, subs=[30429, 30431, 30754], reward=30433,
         evaluation='à la MORT d\'un ennemi (déclencheur X posé par 30429 au début du tour de chaque allié, et par 30754 via le passif « Trooler » de chaque Trooll)',
         formal='un combattant ennemi meurt alors qu\'il possède l\'état 5994 Vulnérable (30431 : 2792 → récompense si *E5994 sur le mourant). Le tueur est indifférent (sort, poussée, dégâts des pics au début de son tour…).',
         counter=None, scope='événement (n\'importe quand)',
         notes='Vulnérable = dans les pics OU sorti des pics depuis moins d\'un tour (30701). Toujours le premier objectif (30443 niv.1).',
         conf='haute'),
    dict(general=30434, orientation='Général', notif=42, subs=[30436, 30437, 30438, 30442], reward=30444,
         evaluation='fin du tour global (30710 → 30442 → 30438 pour chaque joueur)',
         formal='chaque joueur vivant porte l\'état 5904 « Objectif Validé » au contrôle : obtenu par un glyphe de FIN de tour (402, #FF00C3) posé sur sa case au DÉBUT de son tour (30436 niv.1), dissipé en fin de tour (niv.2). Sinon 5905 « Objectif Échoué » sur Sce.',
         counter=None, scope='tour global complet',
         notes='Si l\'objectif est choisi en cours de tour global, les joueurs ayant déjà joué n\'ont pas de glyphe ⇒ échec au premier contrôle ; il faut un tour global entier (DJC-IPAC, forum).',
         conf='haute'),
    dict(general=30439, orientation='Général', notif=46, subs=[30440, 30441], reward=30545,
         evaluation='fin du tour global (30710 effet 6 → 30440 lancé par la Mama)',
         formal='la Mama Troollette (7984) est vivante et n\'a AUCUN allié (30441 SelfTag sur `g` : sinon état 5913 « Trooll Ally Detected ») ⇒ récompense (2792 sur `H` si Mama *e5913).',
         counter=None, scope='fin de tour global',
         notes='La Mama est dans le combat dès T1 (case 152, état pré-combat) et le masque n\'exclut pas 5971 : Solitude peut se valider AVANT T8 si tous les Troolls sont morts en fin de tour global (HYPOTHÈSE).',
         conf='haute (logique) / moyenne (avant T8)'),
    dict(general=30449, orientation='Général', notif=45, subs=[30447, 30448], reward=30544,
         evaluation='à chaque Rassemblement Troollesque de la Mama (arrivée T8 puis début de chacun de ses tours) : 30432 niv.4 lance 30448 si la Mama porte 5915',
         formal='TOUS les joueurs vivants (`H`) reçoivent l\'état 5918 « Grabbed » lors du même Rassemblement (être sur une des 4 lignes partant de la Mama) ; un joueur non attrapé donne 5914 à la Mama ⇒ échec.',
         counter=None, scope='événement (tour de la Mama)',
         notes='Coûteux : les joueurs attrapés sont repoussés jusqu\'au bord = dans les pics (2000 + Vulnérable).',
         conf='haute'),
    dict(general=30450, orientation='Général', notif=44, subs=[30451, 30452, 30453, 30454, 30455, 30477], reward=30456,
         evaluation='fin du tour de l\'allié (glyphe 402 de fin de tour → 30455)',
         formal='au DÉBUT de son tour, l\'allié (état 5917 Challenger) désigne l\'ennemi le plus éloigné (hors Mama pré-combat) : un glyphe de fin de tour (#FF00C3) est posé sur SA case ; l\'allié doit terminer son tour sur cette case.',
         counter=None, scope='tour d\'un allié',
         notes='La case est occupée par l\'ennemi au début du tour : il faut le déplacer (poussée) ou le tuer, puis s\'y placer. Texte DPLN « le plus éloigné » confirmé par la description du sort 30451. Glyphes dissipés en fin de tour.',
         conf='haute (condition) / moyenne (algorithme exact de sélection)'),
    dict(general=30462, orientation='Guérisseur (Magicien)', notif=58, subs=[30464, 30465, 30492], reward=30466,
         evaluation='fin du tour global (30710 : contrôle 30465 PUIS désignation 30464)',
         formal='au contrôle, l\'allié désigné (état 5942 « Heal Target ») a 100 % de ses PV (masque v100) ⇒ récompense. Désignation : premier allié à ≤ 10 % PV, sinon ≤ 20 %, … ≤ 90 %, sinon n\'importe lequel (30464 niv.1-10, masques V10..V90).',
         counter=None, scope='tour global complet (désigné en fin de tour N, contrôlé en fin de tour N+1)',
         notes='v100 : le code client 2.73 évalue « PV% > 100 » (impossible) ; le serveur utilise forcément « ≥ 100 % » puisque l\'objectif est réalisable (HYPOTHÈSE). Le désigné est l\'allié le PLUS BLESSÉ ⇒ difficile.',
         conf='haute (logique) / moyenne (seuils)'),
    dict(general=30463, orientation='Gladiateur (Dompteur)', notif=52, subs=[30549, 30550], reward=30546,
         evaluation='à la mort d\'un ennemi pendant le tour d\'un allié',
         formal='le TUEUR (1019 SourceExecuteSpellOnSource) incrémente son compteur (5944) ; 2e mort du même tueur dans son tour ⇒ récompense. Compteur remis à zéro en fin de tour de chaque allié.',
         counter='5944 « 1 trooll tué » sur le tueur', scope='tour d\'un allié',
         notes='Seules les morts dont le joueur est l\'AUTEUR comptent : un Trooll tué par les 2000 d\'entrée dans les pics est tué par le poseur du glyphe (Sce) ⇒ ne compte pas (HYPOTHÈSE). Rapporté : les morts par dommages de poussée ne comptent pas (sspritenL) — non expliqué par le code client (X se déclenche pour toute mort).',
         conf='moyenne'),
    dict(general=30496, orientation='Général', notif=43, subs=[30494, 30495], reward=30493,
         evaluation='à la mort d\'un ennemi (déclencheur X posé au début du tour de chaque allié)',
         formal='un ennemi meurt alors qu\'il porte l\'état 157 Inébranlable (30495 : récompense si *E157 sur le mourant).',
         counter=None, scope='événement',
         notes='Inébranlable : Patroolleur (Troollibre, 1 tour), Troollement de Tambour (Nitrooll sur un allié). Un Inébranlable ne peut pas être poussé mais peut être échangé/téléporté (état 157 = effet 0 « cantBePushed » seulement).',
         conf='haute'),
    dict(general=30497, orientation='Baroudeur (Acrobate)', notif=47, subs=[30498], reward=30499,
         evaluation='mort d\'un ennemi par DOMMAGES DE POUSSÉE (déclencheur XPD posé au début du tour de chaque allié)',
         formal='un ennemi est achevé par des dommages de poussée (collision).',
         counter=None, scope='événement (en pratique pendant le tour d\'un allié)',
         notes='Dommages de poussée des archétypes : 1000 Do Pou ⇒ ≈ 283 par case restante contre un obstacle (agent formules).',
         conf='haute'),
    dict(general=30500, orientation='Baroudeur (Acrobate)', notif=49, subs=[30501, 30502, 30503], reward=30504,
         evaluation='pendant le tour d\'un allié (état Challenger)',
         formal='3 ennemis DIFFÉRENTS subissent des dommages de poussée (déclencheurs PD ou XPD) ; chaque ennemi porte 5956 « Not pushed » jusqu\'à son premier comptage. Compteur 5944→5945→5946 sur l\'allié ; récompense au 3e.',
         counter='5944/5945/5946 sur le Challenger', scope='tour d\'un allié', notes='', conf='haute'),
    dict(general=30505, orientation='Baroudeur (Acrobate)', notif=50, subs=[30506, 30507, 30508], reward=30509,
         evaluation='pendant le tour d\'un allié',
         formal='4 ennemis DIFFÉRENTS gagnent l\'état 5902 (= ENTRENT dans les pics ; EON5902) pendant le tour de l\'allié. Compteur 5944..5946 ; récompense au 4e.',
         counter='5944/5945/5946 sur le Challenger', scope='tour d\'un allié',
         notes='Un ennemi déjà dans les pics au début du tour ne compte pas (il faut une nouvelle entrée).', conf='haute'),
    dict(general=30510, orientation='Gladiateur (Dompteur)', notif=56, subs=[30551, 30552], reward=30548,
         evaluation='à chaque mort d\'ennemi ; remise à zéro en fin de tour global (30710 → 30552 niv.1)',
         formal='5 ennemis tués par des JOUEURS (compteur partagé sur tous les alliés du tueur) au cours d\'un même tour global.',
         counter='5944..5947 sur tous les joueurs', scope='tour global',
         notes='Les morts causées par le glyphe (poseur Sce) ne comptent probablement pas (HYPOTHÈSE).', conf='moyenne-haute'),
    dict(general=30511, orientation='Gladiateur (Dompteur)', notif=55, subs=[30553, 30554], reward=30547,
         evaluation='pendant le tour d\'un allié ; compteur remis à zéro à CHAQUE lancer de sort (déclencheur CAP) et en fin de tour',
         formal='3 ennemis meurent entre deux lancers de sort de l\'allié actif (= « avec un seul sort »). Le compteur (5962/5963) va au Challenger quel que soit le tueur ⇒ les morts par entrée dans les pics provoquées par le sort comptent.',
         counter='5962 « 1KillNoIcon » / 5963 « 2KillsNoIcon » sur le Challenger', scope='un sort d\'un allié',
         notes='CAP = « le porteur lance un sort » : jeton DOFUS 3 absent du client 2.73 (HYPOTHÈSE forte, cohérente avec Productivité).', conf='moyenne-haute'),
    dict(general=30512, orientation='Gladiateur (Dompteur)', notif=54, subs=[30513], reward=30514,
         evaluation='à la mort d\'un ennemi marqué pendant le tour d\'un allié',
         formal='au début du tour de chaque allié (et à l\'activation), les ennemis à 100 % PV (masque v100) reçoivent un déclencheur X ; il est retiré en fin de tour ⇒ tuer pendant son tour un ennemi qui était plein PV au début de ce tour.',
         counter=None, scope='tour d\'un allié',
         notes='Même remarque v100 que Sauvez-le. Cible typique : monstre de la vague qui vient d\'apparaître.', conf='haute'),
    dict(general=30515, orientation='Baroudeur (Acrobate)', notif=51, subs=[30516, 30517], reward=30518,
         evaluation='fin du tour de chaque allié (TE)',
         formal='tous les ennemis vivants (hors Mama pré-combat, état 5971) portent 5902 (= sont dans les pics) ; un ennemi hors pics met 5905 « Objectif Échoué » sur l\'allié.',
         counter=None, scope='fin de tour d\'un allié',
         notes='Vrai par vacuité s\'il n\'y a plus aucun ennemi (hors Mama pré-combat). Après l\'expiration de 5971 (début du T7 de la Mama selon le décompte, HYPOTHÈSE), la Mama sur 152 compte et empêche la validation jusqu\'à ce qu\'elle soit dans les pics.', conf='haute'),
    dict(general=30520, orientation='Gladiateur (Dompteur)', notif=53, subs=[30522, 30523], reward=30521,
         evaluation='fin du tour global (30710)',
         formal='aucun Artroolleur (7982) vivant sur le terrain.', counter=None, scope='fin de tour global',
         notes='Se valide seul si aucun Artroolleur n\'est présent (FAIT rapporté, Khytrayer 04:56). Artroolleurs dans les vagues 2, 3, 4, 6, 9, 10.', conf='haute'),
    dict(general=30524, orientation='Guérisseur (Magicien)', notif=60, subs=[30526, 30527], reward=30525,
         evaluation='fin du tour global (30710)',
         formal='aucun joueur vivant à ≤ 50 % PV (masque V50 ⇒ échec). Texte : « plus de 50 % ».', counter=None, scope='fin de tour global',
         notes='Seuil : V50 = PV% ≤ 50 dans le code client ⇒ il faut strictement plus de 50 %.', conf='haute'),
    dict(general=30528, orientation='Baroudeur (Acrobate)', notif=48, subs=[30529], reward=30530,
         evaluation='pendant le tour d\'un allié',
         formal='pendant le même tour d\'allié : un ennemi gagne 5902 (entre dans les pics) ET un allié perd 5903 (sort des pics) ; états 5959 EnemyIn et 5958 AllyOut sur le Challenger ; récompense quand les deux sont présents.',
         counter='5958 + 5959 sur le Challenger', scope='tour d\'un allié',
         notes='L\'allié qui sort peut être n\'importe quel joueur (y compris l\'actif). Sortir des pics rend ce joueur Vulnérable ×2 pendant 1 tour (30701).', conf='haute'),
    dict(general=30531, orientation='Guérisseur (Magicien)', notif=59, subs=[30532, 30533], reward=30534,
         evaluation='fin du tour de chaque allié (TE)',
         formal='chaque Artroolleur vivant est à distance ≤ 3 (zone cercle C3, distance de Manhattan) d\'au moins un allié (état 5957 « Near Player ») ; sinon échec.',
         counter=None, scope='fin de tour d\'un allié', notes='Vrai par vacuité sans Artroolleur (FAIT rapporté).', conf='haute'),
    dict(general=30535, orientation='Guérisseur (Magicien)', notif=61, subs=[30539, 30541], reward=30540,
         evaluation='quand la Mama inflige des dommages (déclencheur CD sur la Mama)',
         formal='un joueur SUBIT un sort de la Mama (état 5961 « Attaque Subie », déclencheur D) SANS variation de PV (5960 « Vie inchangée » retiré au moindre changement de PV, déclencheur VA) ⇒ tout absorbé par un bouclier (ou résistance/invulnérabilité).',
         counter=None, scope='tour de la Mama (≥ T8)',
         notes='Boucliers : Protection Prolongée (3000→5000), Muraille collective (15000).', conf='haute'),
    dict(general=30542, orientation='Guérisseur (Magicien)', notif=57, subs=[30555], reward=30543,
         evaluation='pendant le tour d\'un allié, à chaque lancer de sort (déclencheur CAP)',
         formal='un allié lance 3 sorts dans son tour (compteur 5944→5945→récompense au 3e ; remis à zéro en fin de tour).',
         counter='5944/5945 sur le lanceur', scope='tour d\'un allié',
         notes='N\'importe quel sort (Frappe Repoussoir compris). Le plus simple (Magicien : PA + soin + soin, Khytrayer 04:41).', conf='haute'),
]


def build_objectives():
    # palier = niveau du Spell Manager lancé par la récompense ; vérifie « Objectif N Fini »
    objs = []
    for o in OBJ:
        g = spell(o['general'])
        rw = level(o['reward'], 1)['effects']
        sm = [e for e in rw if e['effectId'] == 792 and e['diceNum'] == 30626]
        assert len(sm) == 1, o
        tier = sm[0]['diceSide']
        fini = [e['value'] for e in rw if e['effectId'] == 950 and 5906 <= e['value'] <= 5911]
        assert fini == [5905 + tier], (o['general'], fini, tier)
        notif_set = [e['value'] for e in level(o['general'], 1)['effects'] if e['effectId'] == 3400]
        notif_rm = [e['value'] for e in rw if e['effectId'] == 3401]
        assert notif_set == [o['notif']] and notif_rm == [o['notif']], (o['general'], notif_set, notif_rm)
        favour = [e for e in rw if e['effectId'] == 792 and e['diceNum'] == 30659]
        assert len(favour) == 1
        desc = g['description']['fr'].split('Récompenses')[0].replace('Objectif à réaliser :', '').strip()
        objs.append(OrderedDict([
            ('name', g['name']['fr']), ('tier', tier), ('orientation', o['orientation']),
            ('ids', OrderedDict([('general', o['general']), ('subSpells', o['subs']), ('reward', o['reward']),
                                 ('notification', o['notif']), ('objectiveDoneState', 5905 + tier)])),
            ('conditionText', desc or '(pas de description ; DPLN : « Tuer au moins un Trooll qui est rentré dans les pics et dans l\'état Vulnérable »)'),
            ('conditionFormal', o['formal']), ('evaluation', o['evaluation']), ('scope', o['scope']),
            ('counter', o['counter']),
            ('reward', OrderedDict([
                ('spellUnlock', f'30626 « Spell Manager » niv.{tier} (chaque joueur apprend le sort n°{tier + 1} de son archétype)'),
                ('mamaFavour', '30659 niv.1 lancé par la Mama : état Faveur −1 cran (V→IV→…→I→aucun) + niv.2 « −5 % dommages finaux » (permanent)'),
                ('nextChoice', f'état {5905 + tier} « Objectif {tier} Fini » sur Sce ⇒ 30443 niv.{tier + 1} : vote 3404 id {10 + tier}' if tier <= 5 else 'aucun (dernier palier)'),
                ('cleanup', 'retire les sous-sorts/états de l\'objectif (406/951/2018) et la notification 3401')])),
            ('notes', o['notes']),
            ('status', FV + ' (logique lue dans les sorts) ; sémantique de certains jetons (CAP, V/v, Atq/Def) = ' + HY),
            ('confidence', o['conf']),
            ('sources', [src(o['general'], 1), src(o['reward'], 1)] + [src(x) for x in o['subs']]),
        ]))
    objs.sort(key=lambda x: (x['tier'], x['ids']['general']))
    tiers = OrderedDict()
    for ob in objs:
        tiers.setdefault(str(ob['tier']), []).append(OrderedDict([('name', ob['name']), ('orientation', ob['orientation']), ('general', ob['ids']['general'])]))
    assert [len(v) for v in tiers.values()] == [1, 4, 4, 4, 4, 4]

    mgr = level(30443, 1)['effects']
    assert mgr[0]['diceNum'] == 30428 and [e['triggers'] for e in mgr[1:]] == [f'EON{5906 + i}' for i in range(5)]
    assert [level(30443, g)['effects'][0]['value'] for g in range(2, 7)] == [11, 12, 13, 14, 15]
    chk = level(30710, 1)['effects']
    assert [e['diceNum'] for e in chk] == [30442, 30522, 30465, 30464, 30527, 30552, 30440]

    return OrderedDict([
        ('manager', OrderedDict([
            ('spellId', 30443), ('name', sname(30443)), ('castBy', 'serveur / Sce au lancement du combat (sort racine)'),
            ('logic', ['niv.1 : 792 → 30428 « Empalé » sur `Atq,A` (objectif 1 imposé) + 5 déclencheurs EON « Objectif N Fini » (5906..5910) sur Sce',
                       'EON 5906 → niv.2 : vote 3404 id 11 (objectifs du palier 2)', 'EON 5907 → niv.3 : vote id 12 (palier 3)',
                       'EON 5908 → niv.4 : vote id 13 (palier 4)', 'EON 5909 → niv.5 : vote id 14 (palier 5)', 'EON 5910 → niv.6 : vote id 15 (palier 6)',
                       '« Objectif 6 Fini » (5911) ne déclenche rien ⇒ 6 objectifs au maximum par combat']),
            ('maxObjectives', 6), ('oneActiveAtATime', True),
            ('status', FV), ('confidence', 'haute'), ('source', src(30443)),
        ])),
        ('endOfGlobalTurnCheck', OrderedDict([
            ('spellId', 30710), ('name', sname(30710)),
            ('castBy', 'serveur / Sce à la fin de chaque tour global (sort racine, type MANAGERS)'),
            ('effectsInOrder', ['30442 Soleil (si Sce a 6022)', '30522 Stop aux projectiles (si 6028)', '30465 Sauvez-le : contrôle (si 6029)',
                                '30464 Sauvez-le : désignation (si 6029)', '30527 Tout va bien (si 6030)', '30552 Quintuplé : remise à zéro (si 6031)',
                                '30440 Solitude (lancé par la Mama si Sce a 6034)']),
            ('status', FV + ' (contenu) ; moment « fin de tour global » = ' + HY + ' forte (textes des objectifs)'), ('source', src(30710, 1)),
        ])),
        ('tiers', tiers),
        ('tierRule', 'Chaque palier (2..6) contient exactement 4 objectifs : 1 « Général », 1 orienté Baroudeur/Acrobate, 1 Gladiateur/Dompteur, 1 Guérisseur/Magicien. Le vote propose un sous-ensemble (2 observés). Le palier fixe le sort débloqué (Spell Manager niv. = palier) ⇒ l\'ordre d\'obtention des sorts est toujours le même, quel que soit l\'objectif choisi (cohérent avec DPLN).'),
        ('observedConsistency', OrderedDict([
            ('cardxc (vmh1fJkhdCE)', 'propositions après Empalé : « 1,2,3 Soleil » + « Productivité » (palier 2) ; puis Ébranlable (3), Pas le temps de dire Aïe (4), Tout va bien (5) : ordre des paliers respecté'),
            ('Huz (kGlKYY7_qew 03:30)', 'après Empalé : Meurtres en série + Attention, sol glissant (palier 2)'),
            ('sspritenL (forum)', 'objectif actif fin T2 → Voltige / Prélèvement / Amplification = sorts du palier 2'),
            ('Zephiron (IKqnwLIYffk 17:00)', 'après Tout va bien (palier 5) « plus d\'objectif proposé » : en contradiction avec 30443 niv.6 (vote id 15) ⇒ HYPOTHÈSE : critères d\'apparition du palier 6 (Solitude, Même pas mal : liés à la Mama) non remplis avant T8, ou erreur d\'observation'),
            ('status', FR), ('confidence', 'moyenne-haute'),
        ])),
        ('list', objs),
    ])


def build_counters():
    kc = level(30457, 1)['effects']
    return OrderedDict([
        ('_note', 'Compteurs génériques par états « n troolls tués » (5944..5954) ; RÉUTILISÉS comme compteurs d\'événements par plusieurs objectifs (Faire le mur, Trous dans les Troolls, Productivité, Quintuplé, Meurtres en série). Un seul objectif est actif à la fois, donc pas de conflit.'),
        ('countStates', OrderedDict((str(i), ST[str(i)]['name']['fr']) for i in range(5944, 5955))),
        ('30457', OrderedDict([('name', 'KillCount'), ('logic', f'incrémente l\'état n → n+1 (1..11) sur la cible (zone P1), {len(kc)} effets'), ('source', src(30457, 1))])),
        ('30459', OrderedDict([('name', 'IncreaseKillCount'), ('logic', '792 → 30457 sur les ennemis portant 5920 « CountsKills »'), ('source', src(30459, 1))])),
        ('30460', OrderedDict([('name', 'KillCountable'), ('logic', 'pose sur les ennemis un déclencheur X : 1019 → le tueur lance 30457 sur lui-même (maxStack 1)'), ('source', src(30460, 1))])),
        ('30461', OrderedDict([('name', 'PerSpellKillCounter'), ('logic', 'TB : 5920 « CountsKills » (1 tour) + 30460 sur les ennemis ; TE et CAP : 406 retire 30457 ⇒ compteur remis à zéro à chaque sort'), ('source', src(30461, 1))])),
        ('evaluationSemantics', OrderedDict([
            ('criteriaSnapshot', 'Les critères E/e d\'un sort-compteur sont évalués sur l\'état AVANT le lancer (sinon « 1 → 2 → reward » s\'enchaînerait en un seul lancer) : HYPOTHÈSE forte, seule lecture cohérente avec les textes (3 poussées, 4 entrées, 3 sorts…).'),
            ('CAP', 'déclencheur DOFUS 3 inconnu du client 2.73 ; utilisé par Productivité (compter les sorts) et les compteurs « par sort » ⇒ « le porteur lance un sort » (HYPOTHÈSE forte).'),
            ('X_vs_XPD', 'X = mort ; XPD = mort par dommages de poussée. Le client 2.73 teste les jetons par recherche de sous-chaîne (X ⊂ XPD) et déclenche X pour toute mort ; rapport joueur : les morts par poussée ne comptent pas pour « Meurtres en série » (non confirmé).'),
        ])),
    ])


# ------------------------------------------------------------------------------------------------
# 4. Bonus « Acclamations de la foule »
# ------------------------------------------------------------------------------------------------

CARDS = {
    'Dompteur': (30589, [30592, 30593, 30594, 30632, 30633, 30634]),
    'Acrobate': (30590, [30595, 30596, 30597, 30635, 30636, 30637]),
    'Magicien': (30591, [30598, 30599, 30600, 30629, 30630, 30631]),
}
STATNAME = {111: 'PA', 128: 'PM', 117: 'PO', 1171: '% dommages finaux (multiplicateur, stat 107)', 418: 'dommages critiques (fixes, stat 86)',
            115: '% critique', 1076: '% résistance tous éléments (plafond 50 %)', 414: 'dommages de poussée', 2803: '% résistance mêlée (dommages mêlée reçus ×(100−x)/100)',
            125: 'Vitalité (PV max et courants)', 2971: '% soins finaux', 2807: '% résistance distance (dommages distance reçus ×(100−x)/100)'}
DPLN_BONUS = {
    'Dompteur': {111: '1 PA', 128: '1 PM', 1171: '10% Dommages finaux', 117: '1 Portée', 418: '500 Dommages critiques', 115: '20% Critique'},
    'Acrobate': {111: '1 PA', 128: '1 PM', 1076: '10% de résistances', 117: '1 Portée', 414: '200 Dommages de poussée', 2803: '10% Résistance mêlée'},
    'Magicien': {111: '1 PA', 128: '1 PM', 125: '5 000 Vitalité', 117: '1 Portée', 2971: '20% aux soins finaux', 2807: '10% Résistance distance'},
}


def build_bonuses():
    out = OrderedDict()
    for arch, (acc, cards) in CARDS.items():
        opts = []
        for grade, cid in enumerate(cards, start=1):
            e0, e1 = level(cid, 1)['effects']
            assert e1['effectId'] == 792 and e1['diceNum'] == acc and e1['diceSide'] == grade
            ae = level(acc, grade)['effects'][0]
            assert (ae['effectId'], ae['diceNum']) == (e0['effectId'], e0['diceNum']) and e0['duration'] == -1
            v = e0['diceNum']
            dp = DPLN_BONUS[arch][e0['effectId']]
            mism = arch == 'Magicien' and e0['effectId'] == 2807
            opts.append(OrderedDict([
                ('cardSpellId', cid), ('name', spell(cid)['name']['fr']), ('effectId', e0['effectId']),
                ('value', v), ('stat', STATNAME[e0['effectId']]), ('duration', 'permanent (-1)'),
                ('alsoCasts', f'{acc} « Acclamations de la foule » niv.{grade} (même effet, même valeur + scripts visuels 16069-16072)'),
                ('dpln', dp), ('matchesDPLN', not mism),
                ('source', src(cid, 1)),
            ]))
        out[arch] = OrderedDict([('accumulatorSpell', acc), ('options', opts)])
    out['_rules'] = OrderedDict([
        ('offer', '3 cartes tirées parmi les 6 de l\'archétype, choix individuel (choix id 17), permanent et cumulable'),
        ('when', 'début des tours globaux T2..T9 (8 bonus par personnage au maximum) — observé (agent carte) ; DPLN « à chaque début de tour global »'),
        ('doubleApplicationRisk', OrderedDict([
            ('fact', 'La carte (ex. 30592) applique +1 PA ET lance 30589 niv.1 qui applique à nouveau +1 PA (tous deux visibles, durée -1).'),
            ('interpretation', 'Soit la carte n\'est qu\'une infobulle et seul 30589 est lancé, soit le bonus est réellement doublé. Les textes (DPLN, cartes : « 1 PA ») et les ordres de grandeur observés (Galvanisation ×3 → 22 PA, Koza) ne permettent pas de trancher.'),
            ('simulatorDefault', 'bonus simple (+1 PA, +10 %, …) ; option `acclamationDoubleApplication=true` pour tester'),
            ('status', FV + ' (données) / ' + HY + ' (effet réel)'), ('confidence', 'basse'),
        ])),
        ('discrepancies', ['Magicien « Acclamation résistante » : données 15 % résistance distance (2807) — DPLN 10 %']),
    ])
    return out


# ------------------------------------------------------------------------------------------------
# 5. Sorts : déblocage, améliorations, uniques
# ------------------------------------------------------------------------------------------------

ARCH_STATE = {5899: 'Dompteur', 5900: 'Acrobate', 5901: 'Magicien'}
START = {'Dompteur': 80500, 'Acrobate': 80507, 'Magicien': 80514}


def build_spell_unlocks():
    order = OrderedDict((a, [od([('slot', 1), ('source', 'départ (choix d\'archétype, serveur)')], spell_of_level(START[a]))]) for a in ('Dompteur', 'Acrobate', 'Magicien'))
    for g in range(1, 7):
        for e in level(30626, g)['effects']:
            if e['effectId'] != 3405:
                continue
            arch = [ARCH_STATE[int(t[1:])] for t in e['targetMask'].split(',') if t.startswith('E') and int(t[1:]) in ARCH_STATE]
            assert len(arch) == 1
            order[arch[0]].append(od([('slot', g + 1), ('source', f'30626 niv.{g} (objectif du palier {g})')], spell_of_level(e['value'])))
    common = spell_of_level(80499)
    dpln = {'Dompteur': ['Impact', 'Grondement Grandissant', 'Prélèvement', 'Détonation', 'Coup de Sang', 'Jaillissement', 'Ombre Fracassante'],
            'Acrobate': ['Videur', 'Hanedimane', 'Voltige', 'Aïronemane', 'Pugnace', 'Soutien Stratégique', 'Va-t-en-guerre'],
            'Magicien': ["Pulsation d'Énergie", 'Regain Vigoureux', 'Amplification', 'Protection Prolongée', 'Délivrance', 'Vents Contraires', 'Vague de Dégradation']}
    for a in order:
        assert [x['name'].split(' [')[0] for x in order[a]] == dpln[a], (a, [x['name'] for x in order[a]])
    return OrderedDict([
        ('commonSpell', od([('slot', 0), ('note', 'sort 30416 du monstre 7980 « Gladiatroolleur » (corps des joueurs)')], common)),
        ('byArchetype', order),
        ('rule', 'Le n-ième objectif validé (palier n) débloque le sort n+1 de CHAQUE joueur (3405 CharacterLearnTemporarySpell sur tous les alliés, filtré par l\'état d\'archétype). Sorts de départ : 30395 Impact, 30402 Videur, 30409 Pulsation d\'Énergie (spell-levels 80500/80507/80514, désappris par leurs améliorations ⇒ sorts temporaires appris au choix d\'archétype).'),
        ('matchesDPLN', True), ('status', FV), ('confidence', 'haute'), ('source', src(30626)),
    ])


def build_improvements():
    out = OrderedDict()
    for sid in list(range(30469, 30477)) + list(range(30478, 30485)) + list(range(30485, 30492)):
        if sid == 30470:
            continue
        es = level(sid, 1)['effects']
        forget = [e['value'] for e in es if e['effectId'] == 3406]
        learn = [e['value'] for e in es if e['effectId'] == 3405]
        st = [e['value'] for e in es if e['effectId'] == 950]
        assert len(forget) == len(learn) == len(st) == 1
        out[str(sid)] = OrderedDict([
            ('name', spell(sid)['name']['fr']), ('boostedState', {'id': st[0], 'name': ST[str(st[0])]['name']['fr']}),
            ('forgets', spell_of_level(forget[0])), ('learns', spell_of_level(learn[0]) or {'spellLevelId': learn[0], 'problem': '404 sur DofusDB : spell-level inexistant. Le sort 30564 « Jaillissement [Amélioré 6] » a pour seul niveau 80760 ⇒ probable coquille 80750/80760 dans les données : l\'amélioration désapprendrait Jaillissement sans rien apprendre (bug possible, non observé en vidéo)', 'expectedSpellLevelId': 80760, 'expectedSpellId': 30564}),
            ('description', spell(sid)['description']['fr'].replace('\n', ' ')),
        ])
    return OrderedDict([
        ('mechanism', 'choix id 10 (cadeau) → sort « Amélioration : X » : pose l\'état « boostedSpell … », 3406 désapprend le sort de base, 3405 apprend la version améliorée (nouveau sort ⇒ intervalle de relance remis à zéro, cf. DPLN). 30470 « Améliore un sort » = simple infobulle (666).'),
        ('status', FV), ('list', out),
    ])


def build_uniques():
    groups = {3873: 'Dompteur', 3874: 'Acrobate', 3875: 'Magicien', 3872: 'Commun'}
    out = OrderedDict((v, []) for v in groups.values())
    for sid in list(range(30602, 30608)) + list(range(30611, 30624)):
        s = spell(sid)
        if s['typeId'] not in groups:
            continue
        lv = level(sid, 1)
        selfforget = any(e['effectId'] == 3406 and e['value'] == lv['id'] for e in lv['effects'])
        out[groups[s['typeId']]].append(OrderedDict([('spellId', sid), ('name', s['name']['fr']), ('adminName', s.get('adminName', '')),
                                                     ('apCost', lv['apCost']), ('singleUse', selfforget)]))
    n = sum(len(v) for v in out.values())
    return OrderedDict([('count', n), ('byArchetype', out),
                        ('rule', 'obtenus par le choix id 10 (cadeau) ; usage unique (3406 sur son propre spell-level) ; détails : notes 1x_archetype_*'),
                        ('pulsationChaotique', OrderedDict([
                            ('chain', '30612 : 1160 → 30667 niv.1 sur la cible puis 35-42 dégâts ; 30667 : marque la cible (5916), inflige 35-42 +20/rebond (effet 293 cumulatif), désigne l\'ennemi non marqué le plus proche (2792 limite 1) puis relance 30667 sur lui (2160). 30665/30666 « Pulsion Chaotique » = scripts visuels (666).'),
                            ('damagePerHit_Force6000', [OrderedDict([('hit', k), ('roll', [35 + 20 * k, 42 + 20 * k]),
                                                                     ('damage', list(damage_range(35 + 20 * k, 42 + 20 * k, 100, Stats(strength=6000), melee=False))),
                                                                     ('damageVulnerable', list(damage_range(35 + 20 * k, 42 + 20 * k, 100, Stats(strength=6000), melee=False, target_multipliers=[Multiplier(200, ('D',))])))])
                                                        for k in range(6)]),
                            ('note', 'la cible initiale est touchée deux fois (30612 + 30667 niv.1, jet de base sans bonus) ; critique 0 %'),
                            ('status', FV + ' (données) + calcul'), ('source', src(30612, 1) + ' ; ' + src(30667)),
                        ])),
                        ('penseVite', OrderedDict([
                            ('data', '5 PA ; 111 +999 PA avec délai 1 (au début du PROCHAIN tour, 1 tour) ; 3407 durée du prochain tour = 10 s'),
                            ('dpln', '999 PA, 15 secondes'), ('verdict', 'données actuelles : 10 s (DPLN/GD bêta : 15 s) — confirmé par Khytrayer (3.6) « 10 segundos »'),
                            ('status', FV), ('source', src(30615, 1))])),
                        ])


# ------------------------------------------------------------------------------------------------
# 6. Boss : arrivée, invulnérabilité, faveur, Rassemblement
# ------------------------------------------------------------------------------------------------

def build_boss():
    init = level(30430, 1)['effects']
    assert [e['diceNum'] for e in init] == [30750, 30609, 30724, 30723, 30718]
    pt = level(30750, 1)['effects']
    assert (pt[0]['value'], pt[0]['duration'], pt[1]['effectId'], pt[1]['duration']) == (5971, 6, 140, 6)
    tp1 = level(30609, 1)['effects']
    assert all(e['delay'] == 7 for e in tp1)
    tp3 = level(30609, 3)['effects'][0]
    assert tp3['effectId'] == 2960 and tp3['zoneDescr']['cellIds'] == [300]
    tp4 = level(30609, 4)['effects'][0]
    assert tp4['effectId'] == 4 and tp4['zoneDescr']['shape'] == 67 and tp4['zoneDescr']['param1'] == 63
    fav = level(30724, 1)['effects']
    assert (fav[0]['value'], fav[1]['effectId'], fav[1]['diceNum']) == (5973, 1171, 25)
    cnt2 = level(30659, 2)['effects'][0]
    assert (cnt2['effectId'], cnt2['diceNum'], cnt2['duration']) == (1172, 5, -1)
    dl = level(30723, 1)['effects']
    assert (dl[0]['value'], dl[1]['triggers']) == (56, 'EON5902')
    d2 = level(30723, 2)['effects'][0]
    assert (d2['effectId'], d2['value'], d2['duration']) == (952, 56, 1)
    r4 = level(30432, 4)['effects']
    assert [(e['effectId'], e['diceNum'], e['targetMask']) for e in r4[:3]] == [(950, 0, 'A'), (6, 63, 'g'), (1103, 63, 'A')]

    mama = Stats(strength=4500, level=1000, is_player=False)
    pl = Stats(max_hp=30000, hp=30000)

    def mrange(lo, hi, fd):
        m = Stats(strength=4500, level=1000, is_player=False, final_damage=fd)
        return list(damage_range(lo, hi, 100, m, pl, melee=False))

    spells = [('Troollooportation 30389 (zone X1 autour de la case d\'arrivée, 2/tour)', 60, 70, 72, 84, '3 500'),
              ('Uppertrooll 30392 (vol de vie + poussée 6, 3/tour, 1/cible)', 46, 54, 56, 65, '3 000'),
              ('Mitroollette de Poings 30393 (cercle C3, 1/tour)', 93, 108, 111, 129, '4 500')]
    dmg = []
    for name, lo, hi, clo, chi, dp in spells:
        dmg.append(OrderedDict([('spell', name), ('dpln', dp),
                                ('normal_DF100', mrange(lo, hi, 100)), ('critical_DF100', mrange(clo, chi, 100)),
                                ('normal_FaveurV_DF125', mrange(lo, hi, 125)), ('critical_FaveurV_DF125', mrange(clo, chi, 125)),
                                ('normal_5objectifs_DF100', mrange(lo, hi, 100)),
                                ('normal_FaveurV_plus_Catastrooll_DF145', mrange(lo, hi, 145))]))

    return OrderedDict([
        ('monsterId', 7984), ('name', 'Mama Troollette'),
        ('stats', OrderedDict([('level', 1000), ('hp', 150000), ('ap', 20), ('mp', 6), ('strength', 4500), ('dodgeAP', 20), ('dodgeMP', 20), ('source', f'{API}/monsters/7984')])),
        ('initialSpell', OrderedDict([('spellId', 30430), ('castAt', 'début du combat (startingSpellId = spell-level 80586)'),
                                      ('casts', ['30750 Passe-tour', '30609 Passe-tour + TP (effets retardés de 7)', '30724 Faveurs de la foule', '30723 Délock (invulnérabilité)', '30718 état à la mort']),
                                      ('source', src(30430, 1))])),
        ('preFight', OrderedDict([
            ('cell', ANN['mamaWaitingCell']), ('cellNote', 'case 152 (gradins, zone isolée linkedZone 32, entourée de cases bloquant la LdV) ; la Mama est DANS la timeline dès T1 et « a toujours l\'initiative » (DPLN)'),
            ('state5971', state(5971)), ('state5971Duration', 6),
            ('passTurn', '140 « Tour annulé », durée 6'),
            ('effectsOnObjectives', 'plusieurs objectifs excluent `e5971` (Tout le monde veut prendre sa place, Au coin !, Pulsation Chaotique) : la Mama n\'y compte pas tant qu\'elle est « pré-combat »'),
            ('timingHypothesis', 'Les sorts de début de combat ne sont pas décomptés au premier début de tour (agent formules) : délai 7 ⇒ effets au début du T8 de la Mama (= T8 global, elle joue en premier) ; durée 6 ⇒ Passe-tour et 5971 expirent au début de son T7 ⇒ au T7 elle n\'est plus « pré-combat » mais reste bloquée sur 152 (HYPOTHÈSE, conséquence : « Au coin ! » impossible au T7).'),
            ('status', FV + ' (valeurs) / ' + HY + ' (décompte)'), ('sources', [src(30750, 1), src(30609, 1)]),
        ])),
        ('arrival', OrderedDict([
            ('turn', 8), ('turnData', 'délai 7 sur les deux effets de 30609 niv.1 (spell-level 80835)'),
            ('adminNameHint', '« Passe-tour + TP T5 » : le nom interne indique une première conception à T5 ; la donnée actuelle (délai 7) donne T8'),
            ('sequence', ['T8, début du tour de la Mama : 406 retire 30750 (Passe-tour) ; 792 → 30609 niv.2',
                          'niv.2 : 792 → niv.3 (2960 : lance niv.4 sur la cellule [300]) + 792 → 30432 niv.1 (installe le Rassemblement au début de chacun de ses tours, TB)',
                          'niv.4 : effet 4 « Téléporte sur la case ciblée », zone C63 ⇒ 300 si libre, sinon première case libre la plus proche (observé : 287) ; puis 406 retire 30609 et 30750',
                          'Rassemblement Troollesque exécuté dès l\'arrivée (observé) puis au début de chacun de ses tours']),
            ('cell', 300), ('fallbackObserved', ANN['mamaArrivalFallbackCell']),
            ('status', FV + ' (cellule 300, délai 7) + ' + FR + ' (T8, repli 287 : vidéos)'), ('confidence', 'haute'),
            ('sources', [src(30609), 'research/data/map_annotations.json (mamaArrival*)']),
        ])),
        ('rassemblementTroollesque', OrderedDict([
            ('spellId', 30432), ('trigger', 'TB : début de chaque tour de la Mama après l\'arrivée'),
            ('zone', 'croix X63 à partir de la distance 1 (les 4 lignes partant de la Mama, toute la carte)'),
            ('effects', ['950 état 5918 « Grabbed » (1 tour) sur les ennemis (joueurs) en ligne',
                         '6 « Attire de 63 cases » sur ses alliés `g` (Troolls) en ligne ⇒ ramenés contre elle',
                         '1103 « Repousse de 63 cases SANS dommages » sur les joueurs en ligne ⇒ jusqu\'au bord = dans les pics (2000 + Vulnérable)',
                         'si l\'objectif Attirance est actif (5915) : contrôle 30448']),
            ('execution', '30432 niv.2 : 1160 → niv.3 pour CHAQUE cible en ligne → niv.4 (zone complète) : exécuté N fois, sans effet supplémentaire une fois les cibles au bord'),
            ('pushLines', ANN['mamaPushLines']),
            ('sideEffect', 'un Trooll attiré hors des pics devient Vulnérable ×2 pendant 1 tour (30701)'),
            ('status', FV), ('confidence', 'haute'), ('source', src(30432)),
        ])),
        ('invulnerability', OrderedDict([
            ('state', state(56)), ('appliedBy', '30723 niv.1, durée -1 (tout le combat)'),
            ('unlock', 'déclencheur EON5902 (la Mama ENTRE dans les pics) → 30723 niv.2 : 952 « Désactive l\'état Invulnérable » durée 1 ⇒ vulnérable jusqu\'au début de son prochain tour (elle joue en premier ⇒ ≈ le reste du tour global)'),
            ('inPikes', 'dans les pics elle a aussi le 1163 x200 (masque Def) ; PAS de vulnérabilité de sortie (pas de passif 30700)'),
            ('reLock', 'pour une nouvelle fenêtre, elle doit ressortir puis re-entrer dans les pics'),
            ('howTo', 'poussée (Acrobate) ; si Inébranlable (157 = cantBePushed seulement) : échange de place (Voltige) ou téléportation'),
            ('dpln', '« il faut la placer dans le glyphe, elle deviendra vulnérable pour un tour »'), ('matchesDPLN', True),
            ('status', FV), ('confidence', 'haute'), ('sources', [src(30723), f'{API}/spell-states/56']),
        ])),
        ('crowdFavour', OrderedDict([
            ('initial', '30724 : état 5973 « Faveurs de la foule V » + 1171 +25 % dommages finaux (permanent)'),
            ('perObjective', '30659 niv.1 (lancé par la Mama à chaque récompense) : V→IV→III→II→I→(aucun) + niv.2 : 1172 −5 % dommages finaux permanent'),
            ('finalDamageByObjectives', OrderedDict((str(n), 100 + 25 - 5 * n) for n in range(0, 7))),
            ('note', 'le −5 % du niv.2 n\'a pas de condition ⇒ le 6e objectif donne encore −5 % (95 %) ; DPLN : « cumulable 5 fois »'),
            ('states', [state(i) for i in (5973, 5974, 5975, 5976, 5977)]),
            ('status', FV), ('confidence', 'haute'), ('sources', [src(30724, 1), src(30659)]),
        ])),
        ('onDeath', OrderedDict([('spell', 30718), ('effect', 'état 6024 « Mama Trooll Dead » sur chaque joueur (`H`) ; usage inconnu (scénario)'),
                                 ('fightContinues', 'OUI : les vagues 9 et 10 arrivent encore (FAIT rapporté, 4 vidéos)'), ('source', src(30718))])),
        ('expectedDamageOnPlayer_Force4500', dmg),
        ('damageNote', 'Force 4500 ⇒ ×46 ; dommages finaux 100 + 25 (Faveur V) − 5×objectifs (+20 Catastrooll, effet 1171 durée 0 : portée exacte non établie) ; DPLN semble donner les valeurs sans Faveur (Mitroollette « 4 500 ») ou avec (Uppertrooll « 3 000 »).'),
    ])


# ------------------------------------------------------------------------------------------------
# 7. Vagues, victoire, structure du tour
# ------------------------------------------------------------------------------------------------

def build_waves():
    comp = OrderedDict([
        ('1', {'Troollibre': 2}), ('2', {'Troollibre': 1, 'Artroolleur': 2}), ('3', {'Nitrooll': 2, 'Artroolleur': 1}),
        ('4', {'Nitrooll': 1, 'Artroolleur': 1, 'Troollibre': 1}), ('5', {'Troollibre': 3}), ('6', {'Artroolleur': 3}),
        ('7', {'Nitrooll': 3}), ('8', {'Mama Troollette': 1}), ('9', {'Nitrooll': 1, 'Troollibre': 2, 'Artroolleur': 2}),
        ('10', {'Nitrooll': 2, 'Troollibre': 2, 'Artroolleur': 2}),
    ])
    return OrderedDict([
        ('inData', OrderedDict([
            ('found', False),
            ('evidence', ['aucun effet d\'invocation (181/1008/1011/405…) des sorts 30370-30800 ne fait apparaître 7981/7982/7983 (INDEX DofusDB, vérifié)',
                          'le « Stratège Dompteur » 7985/7986 N\'EST PAS l\'entité des vagues : c\'est l\'invocation (0 PA, 0 PM, 5500 PV) du sort Soutien Stratégique de l\'Acrobate (30403/30569, effet 181), sort de départ 30421/30568',
                          'les seuls cellIds explicites (hors pics et 300) appartiennent à « Lancer de dagues » / « Course de larves », autres attractions de la Foire (autre carte : 4 des 9 cellules « Fond de map » sont non marchables sur 139988488)']),
            ('conclusion', 'vagues gérées par le script serveur du combat (non exposé)'), ('status', FV), ('confidence', 'haute'),
        ])),
        ('composition', comp), ('compositionSource', DPLN + ' ; concordance vidéos (V1, V8, V10) et comptage agent carte'),
        ('compositionStatus', FR), ('compositionConfidence', 'haute'),
        ('timing', OrderedDict([('V1', 'fin du placement'), ('V2-V7, V9', 'début du tour global, juste après la fenêtre de bonus'),
                                ('V8', 'arrivée de la Mama (sort retardé 30609, pas un spawn)'), ('V10', 'début de T10 (pas de fenêtre de bonus)'),
                                ('accumulation', 'les vagues arrivent même si la précédente vit encore'),
                                ('status', FR + ' (agent carte, 11 combats ; vidéos)')])),
        ('spawnCells', OrderedDict([('V1', [242, 358]), ('model', ANN['monsterSpawnModel']),
                                    ('detail', 'research/data/map_annotations.json : monsterSpawnCells.waveN.candidates, perFightWaveSpawns'),
                                    ('status', FR + ' + ' + HY)])),
    ])


def build_victory():
    fin = level(30577, 1)['effects'][0]
    assert (fin['effectId'], fin['value'], fin['targetMask']) == (950, 5965, 'Sce')
    return OrderedDict([
        ('victory', OrderedDict([
            ('condition', 'tous les ennemis (camp Def : Troolls ET Mama) sont morts ET l\'état 5965 « combatCanFinish » est posé sur Sce'),
            ('finishTrigger', OrderedDict([('spellId', 30577), ('name', sname(30577)), ('effect', '950 état 5965 « combatCanFinish » sur Sce, durée -1'),
                                           ('castBy', 'serveur (sort racine, jamais référencé)'),
                                           ('when', 'HYPOTHÈSE : après l\'apparition de la vague 10 (GD : « à partir du tour 10 il n\'y a plus de vague, vous pouvez gagner tour 10 ou 11 »)'),
                                           ('source', src(30577, 1))])),
            ('killingMamaEndsFight', False),
            ('earliestWin', 'T10 (si V10 et tous les restes meurent pendant T10), sinon T11+'),
            ('status', FV + ' (état) + ' + FR + ' (condition : GD, forums, 4 vidéos) + ' + HY + ' (moment du déclencheur)'), ('confidence', 'haute (condition) / moyenne (moment)'),
        ])),
        ('defeat', OrderedDict([('condition', 'tous les joueurs morts (règle standard) ; gagner avec 1 survivant est possible'), ('status', FR)])),
        ('turnLimit', OrderedDict([('value', None), ('note', 'aucune limite dans les données ni les sources fiables'), ('status', FR + ' / ' + HY)])),
    ])


def build_turn_structure():
    return OrderedDict([
        ('fightStart', ['placement : joueurs sur 286/287/314/315 ; Mama sur 152 (dans la timeline)',
                        'choix d\'archétype (id 16) pour chaque joueur → passif 30644/30648/30649 (état 5899/5900/5901) + sort de départ',
                        'sorts de départ : joueurs 30639 Gladiatrooller (60 s par tour, état 5970 : ne tacle pas / pas taclé, passif 30700) ; Troolls 30694 Trooler (30700 + contrôle Empalé) ; Mama 30430',
                        'serveur/Sce : pose du Glyphe de combat 30390 (pics) ; 30443 Objectif (Empalé imposé)',
                        'vague 1 : 2 Troollibres sur 242 et 358']),
        ('globalTurnN', ['[T2..T9] fenêtre de bonus (choix 17, ≈30 s)',
                         '[T2..T7, T9, T10] apparition de la vague N (T8 : la Mama arrive à son propre début de tour)',
                         '[T2..T9] un nouveau cadeau (30566) sur une case libre parmi 272, 273, 299, 301, 327, 328, 329 (≈ 72 % des tours)',
                         'timeline : la Mama d\'abord (T1-T7 : tour annulé ; T8 : arrivée + Rassemblement ; ensuite Rassemblement à chaque début de tour), puis joueurs et Troolls selon l\'initiative',
                         'pendant les tours : glyphes (pics), déclencheurs d\'objectifs, votes (3404) en pause dès qu\'un objectif est validé',
                         'fin du tour global : 30710 Objectif Check',
                         '[T10] 30577 Finish Fight Trigger (HYPOTHÈSE)']),
        ('status', FV + ' (contenu des sorts) + ' + FR + ' (ordre et moments observés) + ' + HY + ' (ordre exact serveur)'),
        ('confidence', 'moyenne'),
    ])


def build_entities():
    return OrderedDict([
        ('Sce', OrderedDict([
            ('meaning', 'entité de scénario invisible, NEUTRE (ni joueurs ni monstres) : lanceur des sorts racines (30390, 30443, 30566, 30710, 30577…) et porteur des états de pilotage (5906-5911 Objectif N Fini, 5905 Objectif Échoué, 5943 Target Found, 5965 combatCanFinish, 6022/6028-6031/6034 objectifs actifs)'),
            ('evidence', ['30710 (lancé par Sce) vise la Mama avec `A,Def,F7984` et les Artroolleurs avec `Def,A,F7982` : les monstres sont ennemis de Sce',
                          '30442 (lancé par Sce) vise les joueurs avec `Atq,A` : les joueurs sont AUSSI ennemis de Sce ⇒ Sce n\'appartient à aucun des deux camps',
                          '2018 de 30657 dissipe les cadeaux posés par Sce']),
            ('status', HY), ('confidence', 'moyenne'),
        ])),
        ('Atq_Def', OrderedDict([
            ('meaning', '`Atq` = camp attaquant = joueurs ; `Def` = camp défenseur = monstres (masques DOFUS 3 absents du client 2.73)'),
            ('evidence', ['30390 niv.2 : 5902 « ennemiHasTriggeredCombatGlyph » → Def ; 5903 « allyHasTriggeredCombatGlyph » → Atq',
                          'Sauvez-le / Tout va bien / 1,2,3 Soleil ciblent `Atq,A` ; Stop aux projectiles cible `Def,A,F7982`',
                          'la maquette 30519 donne le x200 au seul camp `A` (ennemis du poseur)']),
            ('status', HY + ' forte'), ('confidence', 'haute'),
        ])),
        ('players', OrderedDict([
            ('body', 'monstre 7980 « Gladiatroolleur » (niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6000, sort 30416 Frappe Repoussoir)'),
            ('passive30639', OrderedDict([
                ('effects', ['état 5970 Gladiatrooler (ne tacle pas, ne peut pas être taclé)', '+3000 Puissance si *E5899 Dompteur', '+5000 Vitalité si *E5900 Acrobate',
                             '−5000 Vitalité si *E5901 Magicien', '3407 : tours de 60 s', '792 → 30700 (vulnérabilité de sortie des pics)', 'X → niv.2 (effet visuel)']),
                ('conditionalBonusesApplied', False),
                ('why', 'lancé au début du combat AVANT le choix d\'archétype ⇒ les critères *E5899/5900/5901 échouent ; relevés vidéo à ×61 exact (notes 1x_archetype_*)'),
                ('status', FV + ' (données) + ' + FR + ' (non-application)'), ('source', src(30639, 1)),
            ])),
            ('turnTime', '60 s (10 s au tour qui suit Pense Vite)'),
        ])),
        ('troolls', OrderedDict([('startingSpell', '30694 Trooler : X → effet visuel ; 30700 (vulnérabilité de sortie) ; 30754 (contrôle Empalé à la mort)'),
                                 ('source', src(30694))])),
    ])


def build_other():
    return [
        OrderedDict([('spellIds', [30373, 30374, 30375, 30377, 30378, 30379, 30344, 30345, 30346, 30696, 30697, 30698, 30702, 30703, 30705, 30706, 30738]),
                     ('name', 'Lancer de dagues / Dague Classique / Dagues Jumelles / Dague Instable'),
                     ('role', 'AUTRE attraction de la Foire du Trool (race 312 « Lancer de dagues » : Lanceur de dagues 7975/7992, Poutch Simple/Double/Triple 7976-7978, Fond de map 7979, Belguel 7991). 30373 tue les cibles puis 30375 invoque des Poutchs sur des cellules tirées au hasard (random 11,11 % chacune) ; 30374 invoque les « Fond de map » ; 30377/30379 : tir en 3 lignes vers la cible choisie ; score 30696-30698.'),
                     ('gladiatroolRelevance', 'AUCUNE : leurs cellIds se rapportent à une autre carte ; à ne pas utiliser pour le simulateur'),
                     ('status', FV)]),
        OrderedDict([('spellIds', [30692, 30699]), ('name', 'Ligne d\'arrivée (Course de larves)'), ('role', 'autre attraction (course de larves)'), ('gladiatroolRelevance', 'aucune'), ('status', FV)]),
        OrderedDict([('spellIds', [30422]), ('name', sname(30422)), ('role', 'Rugissement du « Chaton Enragé » (type 2288, invocation de classe) : +30/60/90 Puissance à l\'invocateur. Dans la plage d\'ids par hasard.'), ('gladiatroolRelevance', 'aucune'), ('status', FV)]),
        OrderedDict([('spellIds', [30665, 30666]), ('name', 'Pulsion Chaotique [Script Proc / Script Link]'), ('role', 'effets visuels (666) de la chaîne Pulsation Chaotique (30612/30667)'), ('gladiatroolRelevance', 'visuel seulement'), ('status', FV)]),
        OrderedDict([('spellIds', [30656]), ('name', sname(30656)), ('role', 'infobulle « Déclenche un objectif » (666), lancée par chaque objectif'), ('gladiatroolRelevance', 'aucune mécanique'), ('status', FV)]),
        OrderedDict([('spellIds', [30470]), ('name', sname(30470)), ('role', 'infobulle (666) des améliorations'), ('gladiatroolRelevance', 'aucune mécanique'), ('status', FV)]),
        OrderedDict([('spellIds', [30640, 30641, 30642]), ('name', 'Baroudeur : / Gladiateur : / Guérisseur :'), ('role', 'infobulles de l\'Amplification du Magicien (effet selon l\'archétype de la cible)'), ('gladiatroolRelevance', 'affichage'), ('status', FV)]),
        OrderedDict([('spellIds', [30739, 30687, 30660, 30661, 30719]), ('name', 'animations'), ('role', 'Transformation d\'Archétype, Event Glyph Manager [Animation], Rassemblement [Animation allié/ennemi], Pense Vite [FX]'), ('gladiatroolRelevance', 'visuel'), ('status', FV)]),
    ]


def main():
    out = OrderedDict([
        ('_meta', OrderedDict([
            ('title', 'Mécaniques scriptées du combat du Gladiatrool (reverse-engineering des données du client DOFUS 3)'),
            ('generatedBy', 'tools/fight_scripts/build_fight_scripts.py'), ('notes', 'research/notes/30_mecaniques_scriptees.md'),
            ('primarySource', f'{API} (spells, spell-levels, spell-states, monsters) — extraction research/raw/dofusdb/'),
            ('secondarySources', [DPLN, 'research/notes/40_carte_positions.md, 50_sources_web.md, 60_videos.md, 70_formules_dofus.md', 'client DOFUS 2.73 décompilé (HaxeBuff, SpellManager) pour la sémantique des jetons']),
            ('statusLegend', {FV: 'lu dans les données du jeu (ou le code client)', FR: 'guide, forum, vidéo', HY: 'déduction à confirmer'}),
            ('conventions', {'cells': 'ids DOFUS 0..559, carte de combat 139988488', 'damageFormula': 'int(jet × (100 + Force + Puissance)/100) puis dommages finaux, résistances, 1163 (tools/mechanics/damage.py)',
                             'duration': '-1 = tout le combat ; n = n tours du LANCEUR du buff', 'masks': 'Atq = joueurs, Def = monstres, Sce = scénario (HYPOTHÈSES, cf. entities)'}),
        ])),
        ('entities', build_entities()),
        ('spikeGlyph', build_spike_glyph()),
        ('eventGlyph', build_event_glyph()),
        ('choices', build_choices()),
        ('objectives', build_objectives()),
        ('counters', build_counters()),
        ('bonusesByArchetype', build_bonuses()),
        ('spellUnlockOrder', build_spell_unlocks()),
        ('spellImprovements', build_improvements()),
        ('uniqueSpells', build_uniques()),
        ('boss', build_boss()),
        ('waves', build_waves()),
        ('victoryCondition', build_victory()),
        ('turnStructure', build_turn_structure()),
        ('otherSystemSpells', build_other()),
        ('simulatorParameters', OrderedDict([
            ('playersDoubledInsideSpikes', {'default': False, 'why': 'données : x200 de l\'aura sur Def seulement', 'alt': 'True = lecture DPLN'}),
            ('playerTurnStartSpikeDamage', {'default': 1000, 'alt': 2000}),
            ('stackExitAndInsideVulnerability', {'default': True, 'why': 'les 1163 se multiplient (code client) ⇒ ×4 pour un monstre ré-entré < 1 tour après sa sortie', 'confidence': 'basse-moyenne'}),
            ('acclamationDoubleApplication', {'default': False}),
            ('mamaArrivalTurn', {'default': 8}),
            ('mamaArrivalCell', {'default': 300, 'fallback': 'première case libre la plus proche (observé 287)'}),
            ('pushKillCountsForKillObjectives', {'default': True, 'alt': False, 'why': 'rapport joueur contraire (Meurtres en série)'}),
            ('glyphKillCreditedToPlayer', {'default': False, 'why': 'le tueur est le poseur du glyphe (Sce)'}),
            ('maxObjectives', {'default': 6}),
        ])),
        ('discrepancies', [
            {'topic': 'Vulnérable', 'data': '×2 (1163 x200 %)', 'DPLN': '+200 %', 'resolution': 'données (+ vidéos)'},
            {'topic': 'Début de tour dans les pics (joueur)', 'data': '1000', 'DPLN': '2000', 'resolution': 'non tranché'},
            {'topic': 'x200 des joueurs dans les pics', 'data': 'non (seulement 1 tour après la sortie)', 'DPLN': 'oui', 'resolution': 'non tranché ; défaut = données'},
            {'topic': 'Acclamation résistante (Magicien)', 'data': '15 %', 'DPLN': '10 %', 'resolution': 'données'},
            {'topic': 'Pense Vite', 'data': '999 PA, tour de 10 s', 'DPLN': '999 PA, 15 s', 'resolution': 'données (Khytrayer 3.6 : 10 s)'},
            {'topic': 'Faveur de la Mama', 'data': '−5 % par objectif, sans plafond (6e objectif ⇒ 95 %)', 'DPLN': 'cumulable 5 fois', 'resolution': 'données (6e objectif rare)'},
            {'topic': 'Passif Gladiatrooller', 'data': '+3000 Puissance / ±5000 Vitalité selon archétype', 'DPLN': '30 000 PV pour tous, dégâts ×61', 'resolution': 'bonus non appliqués (lancé avant le choix) — agents archétypes'},
            {'topic': 'Arrivée de la Mama', 'data': 'délai 7 ⇒ T8 (nom interne « TP T5 »)', 'DPLN': '« tour 8 (?) »', 'resolution': 'T8'},
            {'topic': 'Objectifs proposés', 'data': 'paliers de 4 objectifs', 'DPLN': 'liste de 21 sans palier', 'resolution': 'complémentaires'},
        ]),
        ('openQuestions', [
            'Portée exacte des masques Atq/Def/Sce (sémantique DOFUS 3 non documentée) : les joueurs sont-ils ×2 dans les pics ?',
            'Contenu des listes de choix 10/11-15/16/17 (côté serveur) : nombre de cartes, probabilités, critères d\'apparition (ex. objectifs liés à la Mama avant T8).',
            'Moment exact du lancement de 30710 (fin de tour global) et de 30577 (T10 ?).',
            'Double application des Acclamations (carte + 30589).',
            'Ré-entrée dans les pics < 1 tour après une sortie : ×4 réel ?',
            'Décompte des durées de la Mama (5971 expire-t-il au T7 ?).',
            'Crédit des morts par dommages de poussée / par le glyphe pour les objectifs de kills.',
            'Seuils V#/v# côté serveur (≤ / < ; v100 = PV pleins).',
        ]),
    ])
    path = os.path.join(DATA, 'fight_scripts.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('écrit', path, os.path.getsize(path), 'octets')


if __name__ == '__main__':
    main()
