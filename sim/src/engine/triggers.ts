/**
 * Événements de déclenchement : produits par le noyau pendant la résolution (dommages, soins, morts, états,
 * déplacements, lancers, seuils de PV) et placés dans ``FightState.triggerQueue``. Ils sont vidés par
 * ``flushTriggers`` après chaque application (effet × cible) et à la fin de chaque action : chaque événement est
 * d'abord traité par le moteur (``processTrigger`` : exécution des buffs déclenchés, voir triggerProcessing.ts) puis
 * passé à l'observateur ``hooks.onTrigger``.
 *
 * Correspondance avec les jetons DOFUS (N70 §3.5, triggerTokens.ts) : damage → D, DN…, DG, DI, DBA/DBE, DM/DR, DS,
 * PD/PPD/PMD (collision), V/VA/VE/VM, CD… (côté lanceur du buff) ; death → X, XD, XPD (victime), K (tueur) ;
 * stateOn/stateOff → EON#/EOFF# ; moved → M, P, MA, MS, PO ; heal → H, LPU, V/VA, CH ; cast → CAP, CC ;
 * threshold → TR#. TB / TE (début / fin de tour du porteur) sont traités directement par turns.ts.
 *
 * Anti-boucle (``isTriggeredByParent`` du client) : chaque événement porte la CHAÎNE des buffs déclenchés dont
 * l'exécution l'a produit (``chain``, estampillée par ``FightState.queueTrigger``) ; un buff de la chaîne ne peut pas
 * être redéclenché par cet événement.
 */
import type { DeathCause, MoveKind } from './events.js';

/** Maillon de la chaîne de déclenchement : buff déclenché en cours d'exécution. */
export interface TriggerLink {
  readonly uid: number;
  readonly spellId: number;
}

export type TriggerChain = readonly TriggerLink[];

/** Chaîne vide (partagée, gelée). */
export const EMPTY_CHAIN: TriggerChain = Object.freeze([] as TriggerLink[]);

/** Vrai si le buff ``uid`` appartient à la chaîne. */
export function chainHas(chain: TriggerChain | undefined, uid: number): boolean {
  if (!chain) return false;
  for (const l of chain) if (l.uid === uid) return true;
  return false;
}

/** Vrai si un buff du sort ``spellId`` appartient à la chaîne. */
export function chainHasSpell(chain: TriggerChain | undefined, spellId: number): boolean {
  if (!chain) return false;
  for (const l of chain) if (l.spellId === spellId) return true;
  return false;
}

interface Chained {
  /** Chaîne des buffs déclenchés à l'origine de l'événement (estampillée par ``queueTrigger``). */
  chain?: TriggerChain;
  /**
   * Dernier uid attribué au moment de l'événement (estampillé par ``queueTrigger``) : un buff posé APRÈS l'événement
   * (uid supérieur) n'y réagit pas — ex. le buff CAP posé par un lancer ne réagit pas à ce lancer.
   */
  seq?: number;
}

export type TriggerEvent = Chained &
  (
    | {
        type: 'damage';
        targetId: number;
        sourceId: number;
        /** PV perdus (après bouclier). */
        amount: number;
        /** Dégâts sortants avant réception (dommages « initiaux », 1123). */
        initial: number;
        /** Dégâts après multiplicateurs, avant bouclier (dommages « finaux », 1223). */
        final: number;
        shieldAbsorbed: number;
        /** PV max érodés par le coup. */
        eroded: number;
        collision: boolean;
        pushIndex: number;
        element: number;
        melee: boolean;
        critical: boolean;
        allySource: boolean;
        /** Dommages de glyphe / d'aura (sort lancé par une marque). */
        glyph: boolean;
        /** La source est une invocation. */
        sourceIsSummon: boolean;
        spellId: number;
        castId: number;
        originBuffUid: number;
      }
    | { type: 'heal'; targetId: number; sourceId: number; amount: number; castId: number; originBuffUid: number }
    | {
        type: 'death';
        targetId: number;
        killerId: number;
        cause: DeathCause;
        castId: number;
        originBuffUid: number;
        /** Dommages du coup mortel (0 si la mort n'est pas due à des dommages). */
        initial?: number;
        final?: number;
      }
    | { type: 'stateOn' | 'stateOff'; targetId: number; stateId: number; sourceId: number }
    | {
        type: 'moved';
        targetId: number;
        sourceId: number;
        kind: MoveKind;
        from: number;
        to: number;
        castId: number;
        originBuffUid: number;
      }
    | {
        type: 'cast';
        casterId: number;
        spellId: number;
        spellLevelId: number;
        cell: number;
        castId: number;
        depth: number;
        originBuffUid: number;
        /** Coup critique (jeton CC). */
        critical?: boolean;
      }
    | {
        /** Un seuil de PV (2872) a arrêté des dommages (jeton TR# : # = sort du seuil, hypothèse Q36). */
        type: 'threshold';
        targetId: number;
        sourceId: number;
        /** Sort ayant posé le seuil. */
        spellId: number;
        /** PV perdus au-delà du seuil (non appliqués). */
        overflow: number;
        castId: number;
        originBuffUid: number;
      }
  );

export type TriggerEventType = TriggerEvent['type'];
