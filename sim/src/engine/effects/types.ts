/**
 * Types partagés par les gestionnaires d'effets : contexte d'un lancer (``CastContext``) et contexte d'application
 * d'un effet (``EffectApplication``).
 */
import type { Fighter } from '../fighter.js';
import type { CompiledEffect, CompiledSpellLevel } from '../spells.js';
import type { FightState } from '../state.js';

/** Contexte d'un lancer (hérité par les sous-sorts et les effets déclenchés). */
export interface CastContext {
  /** Profondeur : 0 = lancer direct, +1 par sous-sort / déclenchement. */
  depth: number;
  /** Critique imposé (hérité du lancer parent) ; null = tirage. */
  critical: boolean | null;
  /** Identifiant du lancer (0 = à attribuer). */
  castId: number;
  /** Sort du lancer racine. */
  rootSpellId: number;
  /** Buff déclenché à l'origine de la chaîne (anti-boucle), −1 sinon. */
  originBuffUid: number;
  /** Combattant « déclencheur » (masque O, source d'un événement), −1 sinon. */
  triggerSourceId: number;
  /** Porteur du buff déclenché, −1 sinon. */
  buffCarrierId: number;
  /** Case ciblée du lancer parent (2794), −1 sinon. */
  parentTargetedCell: number;
  /** Dommages de l'événement déclencheur (1123, 1223, 2020). */
  triggerDamage: { initial: number; final: number } | null;
  /** Filtre d'effets (ex. effets 125/153/138 du passif 30639 déjà appliqués par ``createFighter``). */
  effectFilter: ((e: CompiledEffect) => boolean) | null;
  /** Lancer issu d'une marque (glyphe, aura) : dommages « de glyphe » (déclencheurs DG). */
  fromMark: boolean;
  /** Un lanceur mort peut exécuter le sort (effets déclenchés par sa mort, 'X'). */
  allowDeadCaster: boolean;
  /**
   * Lancer racine : lancer direct, application d'une marque ou exécution d'un buff (hérité par les sous-sorts, pas
   * par les effets déclenchés) ; 0 = ce lancer. Sert au retrait des effets d'aura et à la déduplication des choix.
   */
  rootCastId: number;
  /** Marque (glyphe, aura) dont le sort est en cours de résolution (hérité par les sous-sorts), 0 sinon. */
  markUid: number;
}

export function makeCastContext(over: Partial<CastContext> = {}): CastContext {
  return {
    depth: 0,
    critical: null,
    castId: 0,
    rootSpellId: 0,
    originBuffUid: -1,
    triggerSourceId: -1,
    buffCarrierId: -1,
    parentTargetedCell: -1,
    triggerDamage: null,
    effectFilter: null,
    fromMark: false,
    allowDeadCaster: false,
    rootCastId: 0,
    markUid: 0,
    ...over,
  };
}

/** Contexte d'application d'un effet (un par effet et par lancer ; ``additional`` change par cible). */
export interface EffectApplication {
  readonly state: FightState;
  readonly caster: Fighter;
  readonly spell: CompiledSpellLevel;
  readonly effect: CompiledEffect;
  /** Case ciblée du lancer. */
  readonly targetedCell: number;
  /** Case du lanceur au début du lancer. */
  readonly casterCellBefore: number;
  /** Positions au début du lancer, par id de combattant (−1 : hors carte). */
  readonly snapshot: Int16Array;
  readonly critical: boolean;
  readonly castId: number;
  readonly cctx: CastContext;
  /** La cible courante est une « cible additionnelle » (lanceur ajouté par C hors zone) : pas de dégressivité. */
  additional: boolean;
  /** Jet de l'effet pour ce lancer (tiré à la première utilisation, commun à toutes les cibles), null sinon. */
  roll: number | null;
  /** Exécutions de sous-sort déjà faites par cet effet (variantes GlobalLimitation). */
  execCount: number;
  /** Effet porté par un buff (déclenché ou différé) : le « sort parent » est celui qui a posé le buff. */
  readonly fromBuff: boolean;
}

/** Gestionnaire d'un effet. ``target`` est null pour les effets appliqués une seule fois (téléportation, marques…). */
export type EffectHandlerFn = (app: EffectApplication, target: Fighter | null) => void;
