#!/usr/bin/env python3
"""Exporte des jeux de cas de dégâts / soins calculés par ``tools/mechanics/damage.py`` (implémentation Python de
RÉFÉRENCE, portée du client DOFUS 2.73.3) pour valider les formules TypeScript ``sim/src/engine/formulas.ts``
(test ``sim/test/engine-core.formulas.test.ts``).

Usage : python3 tools/mechanics/export_engine_fixtures.py
Sortie : sim/test/fixtures/engine/damage.json (JSON compact, tirages à graine fixe, déterministe).

Correspondance des caractéristiques avec le modèle du moteur (``StatsView`` / ``Stat``) :
* multiplicateurs « base 100 » : dealt_* = recv_spells = 100 (aucun effet du Gladiatrool ne les modifie) ;
  recv_melee = 100 − resPctMelee, recv_ranged = 100 − resPctRanged, final_damage = 100 + finalDamage,
  heal_mult = 100 + finalHeal ;
* dégressivité : appliquée en entier (``trunc(raw × (100 − malus) / 100)``) AVANT ``receive_damage``, comme le
  moteur (le coefficient flottant de ``compute_hit`` n'est pas utilisé).
"""
from __future__ import annotations

import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import damage as D  # noqa: E402

OUT = os.path.join(ROOT, 'sim', 'test', 'fixtures', 'engine')
SEED = 20260928

ELEMS = (0, 1, 2, 3, 4)
TRIGGER_SETS = [['D'], ['DBA'], ['DBE'], ['PD'], ['PMD'], ['I'], ['DN'], ['DE'], ['DM'], ['DR'], ['DS'], ['DG']]


def rand_stats(r: random.Random, player: bool) -> dict:
    """Fiche aléatoire au format du moteur (clés = noms de ``Stat``) + équivalent ``damage.Stats``."""
    max_hp = r.choice([5500, 19000, 25000, 30000, 150000, r.randint(1000, 200000)])
    hp = r.randint(1, max_hp)
    eroded = r.choice([0, 0, r.randint(0, 20000)])
    v = {
        'level': r.choice([200, 1000, 50]),
        'isPlayer': player,
        'hp': hp,
        'maxHp': max_hp,
        'erodedHp': eroded,
        'shield': r.choice([0, 0, 0, r.randint(0, 6000)]),
        'STRENGTH': r.choice([0, 3000, 3500, 4000, 4500, 6000, r.randint(0, 9000)]),
        'INTELLIGENCE': r.choice([0, r.randint(0, 5000)]),
        'CHANCE': r.choice([0, r.randint(0, 5000)]),
        'AGILITY': r.choice([0, r.randint(0, 5000)]),
        'POWER': r.choice([0, 0, 3000, r.randint(-200, 3000)]),
        'DAMAGE': r.choice([0, 0, r.randint(0, 500)]),
        'HEAL_BONUS': r.choice([0, r.randint(0, 400)]),
        'CRIT_DAMAGE': r.choice([0, r.randint(0, 300)]),
        'CRIT_RES': r.choice([0, 0, r.randint(0, 200)]),
        'RES_ALL': r.choice([0, 0, 10, 25, r.randint(-20, 80)]),
        'RES_NEUTRAL': r.choice([0, 0, r.randint(-20, 80)]),
        'RES_EARTH': r.choice([0, r.randint(-20, 80)]),
        'RES_FIRE': r.choice([0, r.randint(-20, 80)]),
        'RES_WATER': r.choice([0, r.randint(-20, 80)]),
        'RES_AIR': r.choice([0, r.randint(-20, 80)]),
        'RESFIX_NEUTRAL': r.choice([0, 0, r.randint(0, 300)]),
        'RESFIX_EARTH': r.choice([0, r.randint(0, 300)]),
        'RESFIX_FIRE': r.choice([0, r.randint(0, 300)]),
        'RESFIX_WATER': r.choice([0, r.randint(0, 300)]),
        'RESFIX_AIR': r.choice([0, r.randint(0, 300)]),
        'ELEMDMG_NEUTRAL': r.choice([0, 0, r.randint(0, 200)]),
        'ELEMDMG_EARTH': r.choice([0, r.randint(0, 200)]),
        'ELEMDMG_FIRE': r.choice([0, r.randint(0, 200)]),
        'ELEMDMG_WATER': r.choice([0, r.randint(0, 200)]),
        'ELEMDMG_AIR': r.choice([0, r.randint(0, 200)]),
        'RES_MELEE': r.choice([0, 0, 10, 15, r.randint(-30, 60)]),
        'RES_RANGED': r.choice([0, 0, 10, 15, r.randint(-30, 60)]),
        'EROSION': r.choice([10, 10, 25, 60, r.randint(-10, 70)]),
        'FINAL_DAMAGE': r.choice([0, 0, 20, 25, -15, r.randint(-60, 80)]),
        'FINAL_HEAL': r.choice([0, 0, 20, r.randint(-50, 60)]),
    }
    return v


def compact(v: dict) -> dict:
    """Fiche sans les caractéristiques nulles (0 par défaut côté TypeScript ; l'érosion est toujours écrite)."""
    return {k: x for k, x in v.items() if x != 0 or k in ('EROSION', 'isPlayer', 'hp', 'maxHp')}


def to_py(v: dict) -> D.Stats:
    return D.Stats(
        level=v['level'], is_player=v['isPlayer'], max_hp=v['maxHp'], hp=v['hp'], eroded_hp=v['erodedHp'],
        shield=v['shield'], strength=v['STRENGTH'], intelligence=v['INTELLIGENCE'], chance=v['CHANCE'],
        agility=v['AGILITY'], power=v['POWER'], damage=v['DAMAGE'],
        elem_damage={0: v['ELEMDMG_NEUTRAL'], 1: v['ELEMDMG_EARTH'], 2: v['ELEMDMG_FIRE'], 3: v['ELEMDMG_WATER'],
                     4: v['ELEMDMG_AIR']},
        crit_damage=v['CRIT_DAMAGE'], heal_bonus=v['HEAL_BONUS'], crit_res=v['CRIT_RES'],
        res_pct={0: v['RES_NEUTRAL'], 1: v['RES_EARTH'], 2: v['RES_FIRE'], 3: v['RES_WATER'], 4: v['RES_AIR']},
        res_pct_all=v['RES_ALL'],
        res_fix={0: v['RESFIX_NEUTRAL'], 1: v['RESFIX_EARTH'], 2: v['RESFIX_FIRE'], 3: v['RESFIX_WATER'],
                 4: v['RESFIX_AIR']},
        final_damage=100 + v['FINAL_DAMAGE'], recv_melee=100 - v['RES_MELEE'], recv_ranged=100 - v['RES_RANGED'],
        heal_mult=100 + v['FINAL_HEAL'], erosion=v['EROSION'],
    )


SENDER_ACTIONS = [100, 100, 100, 95, 97, 99, 96, 98, 92, 89, 1118, 3001, 3000, 108, 2828, 1123, 1223]
RECEIVE_ACTIONS = [100, 100, 95, 97, 99, 96, 98, 80, 1048, 89, 1092, 1118, 1123, 1223, 2828]


def sender_cases(r: random.Random, n: int) -> list:
    out = []
    for _ in range(n):
        a = r.choice(SENDER_ACTIONS)
        caster = rand_stats(r, r.random() < 0.6)
        roll = r.randint(0, 300)
        crit = r.random() < 0.4
        bonus = r.choice([0, 0, 0, 25, 100, r.randint(0, 150)])
        got = D.sender_damage(roll, a, to_py(caster), critical_effect=crit, spell=D.SpellCtx(base_damage_bonus=bonus))
        out.append({'roll': roll, 'action': a, 'caster': compact(caster), 'critical': crit, 'baseBonus': bonus,
                    'expected': got})
    return out


def receive_cases(r: random.Random, n: int) -> list:
    out = []
    for _ in range(n):
        a = r.choice(RECEIVE_ACTIONS)
        collision = a == 80
        caster = rand_stats(r, r.random() < 0.6)
        target = rand_stats(r, r.random() < 0.5)
        raw = r.choice([0, r.randint(0, 3000), r.randint(0, 30000)])
        melee = r.random() < 0.5
        crit = r.random() < 0.3
        ally = r.random() < 0.3
        invul = r.random() < 0.05
        mults = []
        for _k in range(r.choice([0, 0, 1, 1, 2, 3])):
            mults.append({'value': r.choice([200, 200, 50, 150, 300]), 'triggers': r.choice(TRIGGER_SETS)})
        py_mults = [D.Multiplier(m['value'], tuple(m['triggers'])) for m in mults]
        res = D.receive_damage(raw, a, to_py(caster), to_py(target), melee=melee, critical_effect=crit,
                               target_multipliers=py_mults, invulnerable=invul, ally_source=ally, collision=collision)
        out.append({
            'raw': raw, 'action': a, 'caster': compact(caster), 'target': compact(target), 'melee': melee, 'critical': crit,
            'allySource': ally, 'invulnerable': invul, 'collision': collision, 'multipliers': mults,
            'expected': {'raw': res.raw, 'afterResist': res.after_resist, 'final': res.final,
                         'shieldAbsorbed': res.shield_absorbed, 'lifeLoss': res.life_loss, 'eroded': res.eroded,
                         'lifeStealHeal': res.life_steal_heal, 'invulnerable': res.invulnerable},
        })
    return out


def hit_cases(r: random.Random, n: int) -> list:
    """Chaîne complète (lanceur ou base cible → dégressivité entière → réception)."""
    out = []
    for _ in range(n):
        a = r.choice([100, 100, 95, 89, 1118, 1092, 1048, 97, 99])
        caster = rand_stats(r, True)
        target = rand_stats(r, r.random() < 0.3)
        lo = r.randint(1, 120)
        roll = r.randint(lo, lo + 20)
        malus = r.choice([0, 0, 10, 20, 30, 40])
        melee = r.random() < 0.5
        crit = r.random() < 0.3
        pc, pt = to_py(caster), to_py(target)
        if a in D.TARGET_MAX_LIFE:
            raw = int(roll * (pt.max_hp / 100))
        elif a in D.TARGET_LIFE_PERCENT:
            raw = int(roll * pt.hp * 0.01)
        elif a in D.TARGET_ERODED_LIFE:
            raw = int(roll * (pt.eroded_hp / 100))
        else:
            raw = D.sender_damage(roll, a, pc, critical_effect=crit)
        if a not in D.FAKE_DAMAGE and a != 80 and D.allow_aoe_malus(a):
            raw = int(raw * (100 - malus) / 100)
        res = D.receive_damage(raw, a, pc, pt, melee=melee, critical_effect=crit)
        out.append({'roll': roll, 'action': a, 'caster': compact(caster), 'target': compact(target), 'aoeMalus': malus,
                    'melee': melee,
                    'critical': crit, 'expected': {'final': res.final, 'lifeLoss': res.life_loss, 'eroded': res.eroded,
                                                   'lifeStealHeal': res.life_steal_heal}})
    return out


def heal_cases(r: random.Random, n: int) -> list:
    out = []
    for _ in range(n):
        a = r.choice([3001, 3001, 108, 1109, 2020, 95, 81])
        caster = rand_stats(r, True)
        target = rand_stats(r, True)
        value = r.randint(0, 20000)
        incur = r.random() < 0.05
        got = D.heal_amount(value, to_py(target), caster=to_py(caster), action_id=a, incurable=incur)
        out.append({'value': value, 'action': a, 'caster': compact(caster), 'target': compact(target), 'incurable': incur,
                    'expected': got})
    return out


def reference_ranges() -> list:
    """Plages de référence (SPEC §13) recalculées par damage.py."""
    arche = D.Stats(strength=6000)
    art = D.Stats(strength=3000)
    vul = [D.Multiplier(200, ('D',))]
    out = []

    def add(name, lo, hi, caster, **kw):
        out.append({'name': name, 'range': list(D.damage_range(lo, hi, 100, caster, **kw))})

    add('T1 Frappe Repoussoir', 16, 20, arche, melee=False)
    add('T1 Frappe Repoussoir critique', 21, 25, arche, melee=False, critical_effect=True)
    add('T1 Frappe Repoussoir Vulnérable', 16, 20, arche, melee=False, target_multipliers=vul)
    add('T2 Impact centre', 68, 74, arche, melee=False)
    add('T16 Tir d\'Artroollerie', 56, 65, art, melee=False,
        target=D.Stats(is_player=True, max_hp=10 ** 9, hp=10 ** 9))
    add('T16 Tir d\'Artroollerie critique', 67, 77, art, melee=False, critical_effect=True,
        target=D.Stats(is_player=True, max_hp=10 ** 9, hp=10 ** 9))
    return out


def main() -> None:
    r = random.Random(SEED)
    data = {
        'seed': SEED,
        'source': 'tools/mechanics/damage.py',
        'sender': sender_cases(r, 400),
        'receive': receive_cases(r, 700),
        'hit': hit_cases(r, 400),
        'heal': heal_cases(r, 200),
        'reference': reference_ranges(),
    }
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'damage.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        f.write('\n')
    print(f'{path} : {sum(len(v) for v in data.values() if isinstance(v, list))} cas')


if __name__ == '__main__':
    main()
