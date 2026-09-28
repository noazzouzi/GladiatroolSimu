#!/usr/bin/env python3
"""Table de contrôle : dégâts/soins des sorts du Gladiatrool calculés avec les formules du moteur
(tools/mechanics/damage.py) à partir des données DofusDB, comparés aux valeurs citées par le guide DPLN
(https://www.dofuspourlesnoobs.com/gladiatrool.html, maj 21/05/2026).

Usage : python3 tools/mechanics/damage_table.py [--markdown]
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import damage as D  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
RAW = os.path.join(ROOT, 'research', 'raw', 'dofusdb')

# Lanceurs : Force d'après DofusDB /monsters (grade 1) et DPLN (archétypes : 6000 Force)
CASTERS = {
    'Archétype (Force 6000)': D.Stats(strength=6000),
    'Dompteur +3000 Puissance (passif 30639, hypothèse)': D.Stats(strength=6000, power=3000),
    'Troollibre 7981 (Force 4000)': D.Stats(strength=4000, is_player=False),
    'Artroolleur 7982 (Force 3000)': D.Stats(strength=3000, is_player=False),
    'Nitrooll 7983 (Force 3500)': D.Stats(strength=3500, is_player=False),
    'Mama Troollette 7984 (Force 4500)': D.Stats(strength=4500, is_player=False, level=1000),
}

# (sort, lanceur, valeur citée par DPLN)
CHECKS = [
    (30416, 'Archétype (Force 6000)', '1 200 (Frappe Repoussoir)'),
    (30402, 'Archétype (Force 6000)', '≈ 4 000 (Videur)'),
    (30395, 'Archétype (Force 6000)', '≈ 4 500 (Impact)'),
    (30396, 'Archétype (Force 6000)', '≈ 6 200 (Grondement Grandissant)'),
    (30409, 'Archétype (Force 6000)', '≈ 3 000 soin et ≈ 3 000 dégâts (Pulsation d\'Énergie)'),
    (30395, 'Dompteur +3000 Puissance (passif 30639, hypothèse)', '≈ 4 500 (Impact)'),
    (30383, 'Artroolleur 7982 (Force 3000)', '2 000 (Tir d\'Artroolleurie)'),
    (30384, 'Artroolleur 7982 (Force 3000)', '3 000 (Mortrooll)'),
    (30385, 'Nitrooll 7983 (Force 3500)', '3 000 x2 (Double Trool)'),
    (30387, 'Nitrooll 7983 (Force 3500)', 'soin 2 000 (Trool de Magie)'),
    (30381, 'Troollibre 7981 (Force 4000)', '3 500 vol de vie (Aspiratrooll)'),
    (30380, 'Troollibre 7981 (Force 4000)', '6 000 (Trollpoline)'),
    (30392, 'Mama Troollette 7984 (Force 4500)', '3 000 vol de vie (Upertrooll)'),
    (30391, 'Mama Troollette 7984 (Force 4500)', '3 500 (Troolloportation)'),
    (30393, 'Mama Troollette 7984 (Force 4500)', '4 500 (Mitroollette de Poing)'),
]

DAMAGE_OR_HEAL = set(D._ELEM_OF_ACTION) | {3001, 108}


def load():
    with open(os.path.join(RAW, 'spells.json'), encoding='utf-8') as f:
        spells = json.load(f)
    with open(os.path.join(RAW, 'spell_levels.json'), encoding='utf-8') as f:
        levels = json.load(f)
    return spells, levels


def rows():
    spells, levels = load()
    out = []
    for sid, caster_name, dpln in CHECKS:
        s = spells[str(sid)]
        lvl = levels[str(s['spellLevels'][0])]
        caster = CASTERS[caster_name]
        for tag, crit in (('effects', False), ('criticalEffect', True)):
            for e in lvl.get(tag, []):
                a = e['effectId']
                if a not in DAMAGE_OR_HEAL or D.is_based_on_caster_life(a) or D.is_based_on_target_life(a):
                    continue
                lo, hi = D.roll_bounds(e['diceNum'], e['diceSide'], e['value'])
                heal = D.is_heal(a)
                v_lo = D.sender_damage(lo, a, caster, critical_effect=crit)
                v_hi = D.sender_damage(hi, a, caster, critical_effect=crit)
                out.append({
                    'spell': f"{s['name']['fr']} ({sid})", 'caster': caster_name, 'crit': crit,
                    'effect': a, 'kind': 'soin' if heal else 'dégâts', 'dice': f'{lo}-{hi}',
                    'mult': (100 + caster.strength + (0 if heal else caster.power)) / 100,
                    'range': (v_lo, v_hi), 'vuln': (v_lo * 2, v_hi * 2) if not heal else None,
                    'crit_rate': lvl['criticalHitProbability'], 'dpln': dpln,
                })
    return out


def main(markdown: bool = False):
    rs = rows()
    if markdown:
        print('| sort | lanceur | coup | effet | jet | x | résultat | sur Vulnérable (x2) | DPLN |')
        print('|---|---|---|---|---|---|---|---|---|')
        for r in rs:
            vul = f"{r['vuln'][0]}–{r['vuln'][1]}" if r['vuln'] else '—'
            print(f"| {r['spell']} | {r['caster']} | {'critique' if r['crit'] else 'normal'} ({r['crit_rate']} %) "
                  f"| {r['effect']} {r['kind']} | {r['dice']} | {r['mult']:g} | {r['range'][0]}–{r['range'][1]} "
                  f"| {vul} | {r['dpln']} |")
    else:
        for r in rs:
            print(r)


if __name__ == '__main__':
    main('--markdown' in sys.argv)
