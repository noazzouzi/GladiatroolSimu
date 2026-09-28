#!/usr/bin/env python3
"""Formules de dégâts / soins / boucliers de DOFUS (portage de la bibliothèque Haxe ``damageCalculation``).

Source primaire : client DOFUS 2.73.3 décompilé (``DamageSender``, ``DamageReceiver``, ``HaxeFighter``,
``DamageCalculator.computeEffect``, ``tools.ActionIdHelper``, ``tools.enumeration.ElementEnum``), identique
pour ces formules à la version 2.58 (HadesFR/DofusInvoker) ; le client DOFUS 3 en contient un portage C#
(``Core.Features.Fight.FightPreview.Damage.DamageUtils`` / ``ReceivedDamageUtils``).

Arrondis : chaque multiplication fait ``int(valeur * coef)`` (troncature vers 0, flottants double précision
comme en AS3/Haxe) ; les additions/soustractions sont entières. L'ordre des opérations est celui du client.

Toutes les caractéristiques sont exprimées par leur identifiant de stat DOFUS (``damageCalculation.tools.StatIds``) :
voir ``Stats`` ci-dessous. Les multiplicateurs « 100 = neutre » (107, 120-125, 141-143) valent 100 par défaut.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

# ---------------------------------------------------------------------------------------------
# Éléments (ElementEnum.getElementFromActionId, client 2.73)
# ---------------------------------------------------------------------------------------------
NEUTRAL, EARTH, FIRE, WATER, AIR, NONE, BEST, WORST = 0, 1, 2, 3, 4, 5, 6, 7
ELEMENT_NAMES = {-1: 'aucun', 0: 'neutre', 1: 'terre', 2: 'feu', 3: 'eau', 4: 'air', 5: 'aucun(81)',
                 6: 'meilleur élément', 7: 'pire élément'}
_ELEM_OF_ACTION = {}
for _e, _ids in {
    AIR: (87, 93, 98, 277, 1013, 1064, 1067, 1093, 1125, 1225, 2999),
    WATER: (85, 91, 96, 275, 1014, 1065, 1068, 1095, 1127, 1227, 2998),
    NEUTRAL: (82, 89, 95, 100, 143, 144, 279, 671, 672, 1012, 1071, 1092, 1124, 1224, 3001),
    FIRE: (88, 94, 99, 108, 278, 1015, 1037, 1066, 1069, 1094, 1126, 1226),
    EARTH: (86, 92, 97, 276, 1016, 1063, 1070, 1096, 1128, 1228, 3000),
    BEST: (2822, 2828, 2829, 2830, 3002),
    WORST: (2832, 2890, 2891),
}.items():
    for _i in _ids:
        _ELEM_OF_ACTION[_i] = _e
_ELEM_OF_ACTION[81] = NONE


def element_of(action_id: int) -> int:
    return _ELEM_OF_ACTION.get(action_id, -1)


# ---------------------------------------------------------------------------------------------
# Classification des effets (ActionIdHelper, client 2.73)
# ---------------------------------------------------------------------------------------------
CASTER_LIFE_PERCENT = {85, 86, 87, 88, 89, 90, 671}
CASTER_LIFE_MISSING = {275, 276, 277, 278, 279}
CASTER_ERODED_LIFE = {1118, 1119, 1120, 1121, 1122}   # % des PV érodés du lanceur
CASTER_MIDLIFE = {672}
TARGET_LIFE_PERCENT = {1067, 1068, 1069, 1070, 1071, 1048}
TARGET_MAX_LIFE = {1109}
TARGET_ERODED_LIFE = {1092, 1093, 1094, 1095, 1096}   # % des PV érodés de la cible
SPLASH_FINAL = {1223, 1224, 1225, 1226, 1227, 1228}
SPLASH_RAW = {1123, 1124, 1125, 1126, 1127, 1128}
SPLASH_HEAL = {2020, 2973}
LIFE_STEAL = {82, 91, 92, 93, 94, 95, 2828, 2890}
HEAL = {81, 90, 108, 143, 407, 786, 1037, 1109, 2020, 2973, 2998, 2999, 3000, 3001, 3002}
SHIELD = {1020, 1039, 1040}
FAKE_DAMAGE = {90, 1047, 1048}
NOT_BOOSTABLE_EXPLICIT = {80, 82, 144, 1063, 1064, 1065, 1066}
PUSH = {5, 1021, 1041, 1103}
PULL = {6, 1022, 1042}
FORCED_DRAG = {1021, 1022}
COLLISION_ALLOWED = {5, 1041}
SPELL_EXECUTION = {1160, 2960, 2160, 1019, 1018, 792, 2792, 2794, 2795, 1017, 2017, 793, 2793}
SPELL_EXEC_GLOBAL_LIMIT = {2017, 2160, 2792, 2793, 2795}
TELEPORT = {4, 1099, 1100, 1101, 1104, 1105, 1106, 8, 1023}
EXCHANGE = {8, 1023}
DEALT_HEAL_MULT_NOT_APPLICABLE = {90, 407, 1109, 2020, 2973}


def is_based_on_caster_life(a: int) -> bool:
    return a in CASTER_LIFE_PERCENT or a in CASTER_LIFE_MISSING or a in CASTER_ERODED_LIFE or a in CASTER_MIDLIFE


def is_based_on_target_life(a: int) -> bool:
    return a in TARGET_LIFE_PERCENT or a in TARGET_MAX_LIFE or a in TARGET_ERODED_LIFE


def is_splash(a: int) -> bool:
    return a in SPLASH_FINAL or a in SPLASH_RAW or a in SPLASH_HEAL


def is_boostable(a: int) -> bool:
    """``ActionIdHelper.isBoostable`` : la carac, la Puissance, les Dommages et les multiplicateurs de
    dommages infligés (finaux, mêlée/distance, sorts/armes) s'appliquent."""
    if a in NOT_BOOSTABLE_EXPLICIT:
        return False
    return not (is_based_on_caster_life(a) or is_based_on_target_life(a) or is_splash(a))


def is_damage(category: int, a: int) -> bool:
    """``ActionIdHelper.isDamage`` : catégorie d'effet 2 (dommages), hors 127 et 101."""
    return category == 2 and a not in (127, 101)


def is_heal(a: int) -> bool:
    return a in HEAL


def allow_aoe_malus(a: int) -> bool:
    return a not in SHIELD


# ---------------------------------------------------------------------------------------------
# Caractéristiques
# ---------------------------------------------------------------------------------------------
@dataclass
class Stats:
    """Caractéristiques de combat utiles aux formules (id de stat DOFUS entre crochets)."""
    level: int = 200
    is_player: bool = True           # plafond de résistance % : 50 (HUMAN) / 100 (autres)
    max_hp: int = 10000              # [0/95/11]
    hp: int = 10000                  # [97]
    eroded_hp: int = 0               # PV érodés (maxHP de base - maxHP courant) [102]
    shield: int = 0                  # [96]
    strength: int = 0                # [10] Force   -> Terre ET Neutre
    intelligence: int = 0            # [15] Feu
    chance: int = 0                  # [13] Eau
    agility: int = 0                 # [14] Air
    power: int = 0                   # [25] Puissance (DAMAGES_PERCENT) - pas pour les soins
    spell_percent: int = 0           # [98] DAMAGES_PERCENT_SPELL (bonus % additif aux sorts)
    weapon_power: int = 0            # [103] Puissance aux armes (remplace [98] pour une arme)
    trap_percent: int = 0            # [69] ; glyph_power [106] ; rune_power [110]
    glyph_power: int = 0
    rune_power: int = 0
    damage: int = 0                  # [16] Dommages (fixes, tous éléments)
    elem_damage: Dict[int, int] = field(default_factory=lambda: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0})  # [92,88,89,90,91]
    trap_damage: int = 0             # [70]
    crit_damage: int = 0             # [86] Dommages critiques
    heal_bonus: int = 0              # [49] Soins
    crit: int = 0                    # [18] % Critique (additionné au taux du sort)
    push_damage: int = 0             # [84] Dommages de poussée
    push_res: int = 0                # [85] Résistance poussée
    crit_res: int = 0                # [87] Résistance critique
    res_pct: Dict[int, int] = field(default_factory=lambda: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0})  # [37,33,34,35,36]
    res_pct_all: int = 0             # [101] % résistance (tous éléments) - effet 1076
    res_fix: Dict[int, int] = field(default_factory=lambda: {0: 0, 1: 0, 2: 0, 3: 0, 4: 0})  # [58,54,55,56,57]
    final_damage: int = 100          # [107] multiplicateur de dommages infligés (effets 1171/1172)
    dealt_spells: int = 100          # [123] ; dealt_weapon [122]
    dealt_weapon: int = 100
    dealt_melee: int = 100           # [125] ; dealt_ranged [120]
    dealt_ranged: int = 100
    recv_spells: int = 100           # [141] ; recv_weapon [142]
    recv_weapon: int = 100
    recv_melee: int = 100            # [124] = 100 - Résistance mêlée % (effet 2803 "Deboost...Melee")
    recv_ranged: int = 100           # [121] = 100 - Résistance distance % (effet 2807)
    heal_mult: int = 100             # [143] multiplicateur de soins infligés (effet 2971 "% soins finaux")
    erosion: int = 10                # [75] % d'érosion (base 10, plafonné à 50 dans la formule)
    weapon_damage_percent: int = 0   # [31]
    bomb_combo: int = 0              # [94]

    def main_stat(self, elem: int) -> int:
        return {NEUTRAL: self.strength, EARTH: self.strength, FIRE: self.intelligence,
                WATER: self.chance, AIR: self.agility}.get(elem, 0)

    def best_element(self) -> int:
        vals = {EARTH: self.strength, FIRE: self.intelligence, WATER: self.chance, AIR: self.agility}
        return max(vals, key=lambda e: vals[e])

    def resist_pct(self, elem: int) -> int:
        """``HaxeFighter.getElementMainResist`` : (rés. élément + rés. toutes) plafonnée (50 joueur / 100)."""
        cap = 50 if self.is_player else 100
        r = self.res_pct.get(elem, 0) if elem in (0, 1, 2, 3, 4) else 0
        r += self.res_pct_all
        return int(round(min(r, cap)))

    def resist_fix(self, elem: int) -> int:
        return self.res_fix.get(elem, 0) if elem in (0, 1, 2, 3, 4) else 0


@dataclass
class Multiplier:
    """Buff de type 1163 « Dommages subis x#1% » avec ses déclencheurs (ex. Vulnérable = 200, 'D')."""
    percent: int
    triggers: Tuple[str, ...] = ('I',)   # 'I' = toujours ; 'D' = dommages hors poussée ; 'PD' = dommages de poussée…

    def applies(self, *, collision: bool, element: int, melee: bool, ally_source: bool,
                is_glyph: bool = False, is_trap: bool = False, is_weapon: bool = False,
                critical: bool = False, caster_is_summon: bool = False) -> bool:
        """Réplique ``HaxeBuff.shouldBeTriggeredOnTargetDamage`` pour un 1163 déclenché."""
        t = set(self.triggers)
        if 'I' in t:
            return True
        if collision:
            return bool(t & {'PD', 'PMD', 'PPD'})  # 'PMD' : seulement la cible poussée (index 0)
        if 'D' in t:
            return True
        elem_trigger = {NEUTRAL: 'DN', EARTH: 'DE', FIRE: 'DF', WATER: 'DW', AIR: 'DA'}.get(element)
        if elem_trigger and elem_trigger in t:
            return True
        if is_glyph and 'DG' in t or is_trap and 'DT' in t or caster_is_summon and 'DI' in t:
            return True
        if ally_source and ('DBA' in t or critical and 'DCCBA' in t):
            return True
        if not ally_source and ('DBE' in t or critical and 'DCCBE' in t):
            return True
        if melee and 'DM' in t or not melee and 'DR' in t:
            return True
        if is_weapon and 'DCAC' in t or not is_weapon and 'DS' in t:
            return True
        return False


def received_multiplier(mults: Iterable[Multiplier], action_id: int, **ctx) -> int:
    """``HaxeFighter.getDamageMultiplicator`` : produit entier des 1163 applicables (100 = neutre)."""
    m = 100
    if action_id == 90:  # canTriggerDamageMultiplier
        return m
    for b in mults:
        if b.applies(**ctx):
            m = int(m * b.percent * 0.01)
    return m


# ---------------------------------------------------------------------------------------------
# Jet de dés
# ---------------------------------------------------------------------------------------------

def roll_bounds(dice_num: int, dice_side: int, value: int = 0) -> Tuple[int, int]:
    """Bornes d'un effet (``SpellEffectTranslator.getMinRoll/getMaxRoll``) :
    min = diceNum (ou value si diceNum = diceSide = 0) ; max = diceSide si != 0, sinon min."""
    lo = value if (dice_num == 0 and dice_side == 0) else dice_num
    hi = dice_side if dice_side != 0 else lo
    return lo, hi


def random_roll(lo: int, hi: int, rng: random.Random = random) -> int:
    """Tirage uniforme ; le client prévisualise floor(lo + rand*(hi-lo) + 0.5) (serveur : uniforme entier)."""
    return int(math.floor(lo + rng.random() * (hi - lo) + 0.5))


def critical_chance(spell_crit: int, crit_stat: int) -> int:
    """``SpellWrapper.criticalHitProbability`` : 0 si le sort a 0 % ; sinon min(100, max(0, sort + stat))."""
    if spell_crit <= 0:
        return 0
    return int(min(max(0, spell_crit + crit_stat), 100))


# ---------------------------------------------------------------------------------------------
# Côté lanceur (DamageSender)
# ---------------------------------------------------------------------------------------------

@dataclass
class SpellCtx:
    is_weapon: bool = False
    is_trap: bool = False
    is_glyph: bool = False
    is_rune: bool = False
    base_damage_bonus: int = 0      # somme des effets 293 « #1 : +#3 dégâts de base » actifs sur ce sort
    flat_damage_bonus: int = 0      # modificateurs de sort « dommages fixes » (283…)


def sender_damage(roll: int, action_id: int, caster: Stats, *, critical_effect: bool = False,
                  spell: SpellCtx = SpellCtx(), caster_hp_ctx: Optional[dict] = None) -> int:
    """``DamageSender.getTotalDamage`` pour UN jet (valeur entière avant réception).

    Effets boostables (``is_boostable``) :
      d = roll + bonus_dégâts_de_base
      d = int(d * (100 + max(0, carac + Puissance + [98|103] + pièges/glyphes/runes)) / 100)
      d = d + Dommages + Dommages élémentaires + (Dommages critiques si effet critique) [+ pièges]
      (arme : d = int(d * (100 + [31]) / 100)) ; d = int(d * (1 + combo_bombe/100))
    Soins boostables : même chose SANS la Puissance (carac de l'élément du soin : 3001 = Force !),
    et « Soins » [49] à la place des Dommages.
    Effets « % PV du lanceur » (85-90, 671) : d = int(roll * PV_courants * 0.01)
    Effets « % PV érodés du lanceur » (1118-1122) : d = int(roll * PV_érodés / 100)
    """
    elem = element_of(action_id)
    if elem == BEST:
        elem = caster.best_element()
    d = roll
    if action_id in CASTER_LIFE_PERCENT:
        d = int(d * caster.hp * 0.01)
    elif action_id in CASTER_LIFE_MISSING:
        d = int(d * (caster.max_hp - caster.hp) * 0.01)
    elif action_id in CASTER_ERODED_LIFE:
        if caster.eroded_hp >= 0:
            d = int(d * (caster.eroded_hp / 100))
    if is_boostable(action_id):
        heal = is_heal(action_id)
        d += spell.base_damage_bonus
        bonus = (0 if heal else caster.power) + (caster.trap_percent if spell.is_trap else 0) \
            + (caster.glyph_power if spell.is_glyph else 0) + (caster.rune_power if spell.is_rune else 0) \
            + (caster.weapon_power if spell.is_weapon else caster.spell_percent) + caster.main_stat(elem)
        if bonus < 0:
            bonus = 0
        d = int(d * ((100 + bonus) * 0.01))
        if heal:
            flat = caster.heal_bonus + (caster.trap_damage if spell.is_trap else 0)
        else:
            flat = caster.damage + (caster.trap_damage if spell.is_trap else 0) \
                + caster.elem_damage.get(elem, 0) + (caster.crit_damage if critical_effect else 0)
        d += flat + spell.flat_damage_bonus
        if spell.is_weapon:
            d = int(d * ((100 + caster.weapon_damage_percent) * 0.01))
        d = int(d * (1 + caster.bomb_combo / 100))
    return d


def shield_amount(roll: int, action_id: int, caster: Stats) -> int:
    """``DamageSender.getTotalShield`` : 1040 = valeur fixe ; 1039 = % des PV max du LANCEUR ;
    1020 = % du niveau du lanceur (arrondi)."""
    if action_id == 1040:
        return roll
    if action_id == 1039:
        return int(caster.max_hp * roll * 0.01)
    if action_id == 1020:
        return int(round(caster.level * roll * 0.01))
    return 0


# ---------------------------------------------------------------------------------------------
# Côté cible (DamageReceiver)
# ---------------------------------------------------------------------------------------------

@dataclass
class DamageResult:
    raw: int                 # dégâts sortants (après AoE)
    after_resist: int        # après résistances fixes et %
    final: int               # après multiplicateurs (finaux, mêlée/distance, 1163)
    shield_absorbed: int
    life_loss: int           # PV réellement perdus (final - bouclier)
    eroded: int              # PV max perdus (érosion)
    life_steal_heal: int     # soin du lanceur (vol de vie)
    invulnerable: bool = False


def receive_damage(raw: int, action_id: int, caster: Stats, target: Stats, *,
                   melee: bool, critical_effect: bool = False, is_weapon: bool = False,
                   target_multipliers: Sequence[Multiplier] = (), armor_reduction: int = 0,
                   invulnerable: bool = False, ally_source: bool = False,
                   spell: SpellCtx = SpellCtx(), collision: bool = False) -> DamageResult:
    """``DamageReceiver.receiveDamage`` + ``applyDamage`` + ``applyDealtMultiplier`` (+ bouclier, érosion,
    vol de vie).  ``melee`` = lanceur adjacent (distance 1) à la cible au moment du coup.

    Non-collision :
      d = raw - (rés. fixe élément + rés. critique si effet critique) - réduction d'armure (265 × (niv/20+1))
      d = int(d * (1 - rés%/100)) ; d = max(0, d)
    Puis (boostable seulement) : d = int(d*[123|122]/100), int(d*[125|120]/100) (lanceur),
      int(d*[141|142]/100), int(d*[124|121]/100) (cible), int(d*[107]/100) (lanceur, dommages finaux)
    Puis toujours : d = int(d * multiplicateur_1163 / 100)
    Collision (poussée, action 80) : AUCUNE résistance ni multiplicateur de dommages infligés ; seuls
    les 1163 déclenchés par 'PD'/'PMD'/'PPD' (pas 'D') s'appliquent.
    """
    elem = element_of(action_id)
    if elem == BEST:
        elem = caster.best_element()
    d = raw
    if not collision:
        flat = target.resist_fix(elem) + (target.crit_res if critical_effect else 0)
        d = d - flat - armor_reduction
        d = int(d * (1 - target.resist_pct(elem) / 100))
        d = max(0, d)
    after_res = d
    d = max(0, d)
    if is_boostable(action_id) and not collision:
        d = int(d * ((caster.dealt_weapon if is_weapon else caster.dealt_spells) / 100))
        d = int(d * ((caster.dealt_melee if melee else caster.dealt_ranged) / 100))
        d = int(d * ((target.recv_weapon if is_weapon else target.recv_spells) / 100))
        d = int(d * ((target.recv_melee if melee else target.recv_ranged) / 100))
        d = int(d * (caster.final_damage / 100))
    mult = received_multiplier(target_multipliers, action_id, collision=collision, element=elem, melee=melee,
                               ally_source=ally_source, is_glyph=spell.is_glyph, is_trap=spell.is_trap,
                               is_weapon=is_weapon, critical=critical_effect)
    d = int(d * (mult / 100))
    if invulnerable:
        return DamageResult(raw, after_res, 0, 0, 0, 0, 0, True)
    absorbed = min(d, target.shield) if action_id not in FAKE_DAMAGE else 0
    life = max(0, d - absorbed)
    eroded = eroded_damage(life, target)
    steal = 0
    if action_id in LIFE_STEAL and life > 0:
        # executeLifePointsWin : soin du LANCEUR, x soins finaux [143] du lanceur (95 n'est pas exclu), plafonné
        steal = heal_amount(int(life * 0.5), caster, caster=caster, action_id=action_id)
    return DamageResult(raw, after_res, d, absorbed, life, eroded, steal)


def eroded_damage(life_loss: int, target: Stats) -> int:
    """``DamageReceiver.getPermanentDamage`` : floor(dégâts * clamp(érosion, 0, 50)/100), max PV courants - 1."""
    pct = int(math.floor(max(0, min(target.erosion, 50)))) / 100
    return int(math.floor(min(math.floor(life_loss * pct), target.hp - 1)))


def heal_amount(value: int, target: Stats, *, caster: Optional[Stats] = None, action_id: int = 0,
                incurable: bool = False) -> int:
    """``DamageReceiver.executeLifePointsWin`` : soin (déjà boosté) × [143]/100 du lanceur si applicable,
    plafonné aux PV manquants de la cible ; 0 si la cible est incurable (effet d'état 5)."""
    if incurable:
        return 0
    v = value
    if caster is not None and action_id not in DEALT_HEAL_MULT_NOT_APPLICABLE:
        v = int(v * (caster.heal_mult / 100))
    return max(0, min(v, target.max_hp - target.hp))


def compute_hit(roll: int, action_id: int, caster: Stats, target: Stats, *, melee: bool,
                aoe_efficiency: float = 1.0, critical_effect: bool = False,
                target_multipliers: Sequence[Multiplier] = (), spell: SpellCtx = SpellCtx(),
                category: int = 2, **kw) -> DamageResult:
    """Chaîne complète pour un effet de dégâts : lanceur -> AoE -> cible."""
    if action_id in TARGET_MAX_LIFE:
        raw = int(roll * (target.max_hp / 100))
    elif action_id in TARGET_LIFE_PERCENT:
        raw = int(roll * target.hp * 0.01)
    elif action_id in TARGET_ERODED_LIFE:
        raw = int(roll * (target.eroded_hp / 100))
    else:
        raw = sender_damage(roll, action_id, caster, critical_effect=critical_effect, spell=spell)
    if action_id not in FAKE_DAMAGE and action_id != 80 and allow_aoe_malus(action_id):
        raw = int(raw * aoe_efficiency)
    return receive_damage(raw, action_id, caster, target, melee=melee, critical_effect=critical_effect,
                          target_multipliers=target_multipliers, spell=spell, **kw)


def damage_range(lo: int, hi: int, action_id: int, caster: Stats, target: Optional[Stats] = None,
                 **kw) -> Tuple[int, int]:
    """Bornes min/max des dégâts finaux (PV perdus hors bouclier) pour un effet lo..hi."""
    target = target or Stats(is_player=False, max_hp=10 ** 9, hp=10 ** 9)
    a = compute_hit(lo, action_id, caster, target, **kw).final
    b = compute_hit(hi, action_id, caster, target, **kw).final
    return a, b


if __name__ == '__main__':
    arche = Stats(strength=6000)
    # Frappe Repoussoir 16-20 neutre -> 976-1220 (DPLN : « 1200 »)
    assert damage_range(16, 20, 100, arche, melee=False) == (976, 1220)
    # sur cible Vulnérable (1163 x200 %, déclencheur D)
    vul = [Multiplier(200, ('D',))]
    assert damage_range(16, 20, 100, arche, melee=False, target_multipliers=vul) == (1952, 2440)
    print('damage self-test OK')
