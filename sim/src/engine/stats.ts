/**
 * Caractéristiques des combattants : index compacts (tableaux typés), éléments, correspondance avec les clés de
 * données (`StatKey`) et table des éléments des effets (``ElementEnum`` du client, tools/mechanics/damage.py).
 *
 * Un combattant porte deux Int32Array : `base` (fiche) et `bonus` (somme des buffs de caractéristique actifs) ;
 * la valeur effective est base + bonus. Les multiplicateurs « base 100 » (dommages finaux, soins finaux) sont stockés
 * en écart à 100 (0 = neutre).
 */
import type { Element, FighterStatsData, StatKey } from '../data/index.js';

export const Stat = {
  AP: 0,
  MP: 1,
  RANGE: 2,
  /** % Critique [18]. */
  CRIT: 3,
  /** Dommages critiques [86]. */
  CRIT_DAMAGE: 4,
  /** Résistance critique [87]. */
  CRIT_RES: 5,
  /** Dommages de poussée [84]. */
  PUSH_DAMAGE: 6,
  /** Résistance poussée [85]. */
  PUSH_RES: 7,
  /** Vitalité (bonus de PV max, effets 125 / 153). */
  VITALITY: 8,
  /** Puissance [25]. */
  POWER: 9,
  STRENGTH: 10,
  INTELLIGENCE: 11,
  CHANCE: 12,
  AGILITY: 13,
  /** Dommages fixes [16]. */
  DAMAGE: 14,
  /** Soins fixes [49]. */
  HEAL_BONUS: 15,
  /** % résistance tous éléments [101] (effet 1076). */
  RES_ALL: 16,
  /** % résistance par élément : RES_NEUTRAL + indice d'élément. */
  RES_NEUTRAL: 17,
  RES_EARTH: 18,
  RES_FIRE: 19,
  RES_WATER: 20,
  RES_AIR: 21,
  /** Résistances fixes par élément : RESFIX_NEUTRAL + indice d'élément. */
  RESFIX_NEUTRAL: 22,
  RESFIX_EARTH: 23,
  RESFIX_FIRE: 24,
  RESFIX_WATER: 25,
  RESFIX_AIR: 26,
  /** Dommages élémentaires fixes : ELEMDMG_NEUTRAL + indice d'élément. */
  ELEMDMG_NEUTRAL: 27,
  ELEMDMG_EARTH: 28,
  ELEMDMG_FIRE: 29,
  ELEMDMG_WATER: 30,
  ELEMDMG_AIR: 31,
  /** % résistance mêlée (effet 2803) : multiplicateur reçu mêlée = 100 − valeur. */
  RES_MELEE: 32,
  /** % résistance distance (effet 2807). */
  RES_RANGED: 33,
  /** % érosion [75] (base 10, plafonné à 50 dans la formule). */
  EROSION: 34,
  /** Dommages finaux en écart à 100 : Σ1171 − Σ1172. */
  FINAL_DAMAGE: 35,
  /** Soins finaux en écart à 100 : Σ2971. */
  FINAL_HEAL: 36,
  DODGE_AP: 37,
  DODGE_MP: 38,
  TACKLE: 39,
  FLEE: 40,
} as const;
export type StatIndex = (typeof Stat)[keyof typeof Stat];
export const STAT_COUNT = 41;

/** Libellés français (journaux, interface). */
export const STAT_LABELS_FR: readonly string[] = [
  'PA', 'PM', 'Portée', '% Critique', 'Dommages critiques', 'Résistance critique', 'Dommages de poussée',
  'Résistance poussée', 'Vitalité', 'Puissance', 'Force', 'Intelligence', 'Chance', 'Agilité', 'Dommages', 'Soins',
  '% Résistance', '% Résistance Neutre', '% Résistance Terre', '% Résistance Feu', '% Résistance Eau',
  '% Résistance Air', 'Résistance Neutre', 'Résistance Terre', 'Résistance Feu', 'Résistance Eau', 'Résistance Air',
  'Dommages Neutre', 'Dommages Terre', 'Dommages Feu', 'Dommages Eau', 'Dommages Air', '% Résistance mêlée',
  '% Résistance distance', '% Érosion', '% Dommages finaux', '% Soins finaux', 'Esquive PA', 'Esquive PM', 'Tacle',
  'Fuite',
];

/** Clé de données (`StatKey` des effets statBuff et des Acclamations) → index. */
export const STAT_KEY_INDEX: Readonly<Record<StatKey, StatIndex>> = {
  ap: Stat.AP,
  mp: Stat.MP,
  range: Stat.RANGE,
  critPct: Stat.CRIT,
  critDamage: Stat.CRIT_DAMAGE,
  pushDamage: Stat.PUSH_DAMAGE,
  vitality: Stat.VITALITY,
  power: Stat.POWER,
  resPct: Stat.RES_ALL,
  resPctMelee: Stat.RES_MELEE,
  resPctRanged: Stat.RES_RANGED,
  erosionPct: Stat.EROSION,
  finalDamagePct: Stat.FINAL_DAMAGE,
  finalHealPct: Stat.FINAL_HEAL,
};

// ---------------------------------------------------------------------------------------------
// Éléments (ElementEnum : 0 neutre, 1 terre, 2 feu, 3 eau, 4 air, 5 aucun (81), 6 meilleur, 7 pire, -1 sans)
// ---------------------------------------------------------------------------------------------

export const EL_NEUTRAL = 0;
export const EL_EARTH = 1;
export const EL_FIRE = 2;
export const EL_WATER = 3;
export const EL_AIR = 4;
export const EL_NONE = 5;
export const EL_BEST = 6;
export const EL_WORST = 7;
export const EL_UNDEFINED = -1;

export const ELEMENT_INDEX: Readonly<Record<Element, number>> = {
  neutral: EL_NEUTRAL,
  earth: EL_EARTH,
  fire: EL_FIRE,
  water: EL_WATER,
  air: EL_AIR,
};
export const ELEMENT_LABELS_FR: readonly string[] = ['Neutre', 'Terre', 'Feu', 'Eau', 'Air'];

const ELEM_OF_ACTION = new Map<number, number>();
{
  const table: Array<[number, number[]]> = [
    [EL_AIR, [87, 93, 98, 277, 1013, 1064, 1067, 1093, 1125, 1225, 2999]],
    [EL_WATER, [85, 91, 96, 275, 1014, 1065, 1068, 1095, 1127, 1227, 2998]],
    [EL_NEUTRAL, [82, 89, 95, 100, 143, 144, 279, 671, 672, 1012, 1071, 1092, 1124, 1224, 3001]],
    [EL_FIRE, [88, 94, 99, 108, 278, 1015, 1037, 1066, 1069, 1094, 1126, 1226]],
    [EL_EARTH, [86, 92, 97, 276, 1016, 1063, 1070, 1096, 1128, 1228, 3000]],
    [EL_BEST, [2822, 2828, 2829, 2830, 3002]],
    [EL_WORST, [2832, 2890, 2891]],
  ];
  for (const [el, ids] of table) for (const id of ids) ELEM_OF_ACTION.set(id, el);
  ELEM_OF_ACTION.set(81, EL_NONE);
}

/** ``ElementEnum.getElementFromActionId`` (−1 si l'action n'a pas d'élément). */
export function elementOfAction(actionId: number): number {
  return ELEM_OF_ACTION.get(actionId) ?? EL_UNDEFINED;
}

/** Index de la caractéristique qui booste un élément (neutre et terre → Force). */
export function mainStatOfElement(el: number): StatIndex | -1 {
  switch (el) {
    case EL_NEUTRAL:
    case EL_EARTH:
      return Stat.STRENGTH;
    case EL_FIRE:
      return Stat.INTELLIGENCE;
    case EL_WATER:
      return Stat.CHANCE;
    case EL_AIR:
      return Stat.AGILITY;
    default:
      return -1;
  }
}

/** Remplit un tableau de caractéristiques de base depuis une fiche de données. */
export function baseStatsFromData(s: FighterStatsData, out: Int32Array = new Int32Array(STAT_COUNT)): Int32Array {
  out[Stat.AP] = s.ap;
  out[Stat.MP] = s.mp;
  out[Stat.RANGE] = s.rangeBonus;
  out[Stat.CRIT] = s.critPct;
  out[Stat.CRIT_DAMAGE] = s.critDamage;
  out[Stat.PUSH_DAMAGE] = s.pushDamage;
  out[Stat.PUSH_RES] = s.pushResist;
  out[Stat.POWER] = s.power;
  out[Stat.STRENGTH] = s.strength;
  out[Stat.INTELLIGENCE] = s.intelligence;
  out[Stat.CHANCE] = s.chance;
  out[Stat.AGILITY] = s.agility;
  out[Stat.RES_NEUTRAL] = s.resPct.neutral;
  out[Stat.RES_EARTH] = s.resPct.earth;
  out[Stat.RES_FIRE] = s.resPct.fire;
  out[Stat.RES_WATER] = s.resPct.water;
  out[Stat.RES_AIR] = s.resPct.air;
  out[Stat.RES_MELEE] = s.resPctMelee;
  out[Stat.RES_RANGED] = s.resPctRanged;
  out[Stat.EROSION] = s.erosionPct;
  out[Stat.DODGE_AP] = s.dodgeAp;
  out[Stat.DODGE_MP] = s.dodgeMp;
  out[Stat.TACKLE] = s.tackle;
  out[Stat.FLEE] = s.flee;
  return out;
}
