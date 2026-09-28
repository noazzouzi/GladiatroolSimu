/**
 * Jetons de déclenchement des effets (``triggers`` des données, N70 §3.5, ``HaxeBuff.shouldBeTriggeredOn*``) :
 * analyse une fois par effet compilé (catégories en masque de bits) et correspondance avec un événement.
 *
 * Jetons gérés (côté PORTEUR du buff sauf mention) :
 * - dommages subis : D (hors poussée), DN / DE / DF / DW / DA (élément), DG (glyphe), DT (piège : jamais), DI (source
 *   invoquée), DBA / DBE (allié / ennemi), DCCBA / DCCBE (critique d'un allié / ennemi), DM / DR (mêlée / distance),
 *   DCAC (arme : jamais), DS (sort, pas depuis un effet déclenché) ; PD / PPD (dommages de poussée, cible ou entité
 *   percutée), PMD (cible poussée) ;
 * - PV : V / VA (PV courants modifiés), VM / VE (PV max / érodés modifiés) ;
 * - mort : X (toute mort), XD (mort par dommages hors poussée, H), XPD (mort par dommages de poussée, H) ; K / KWS
 *   (le porteur tue ; KWW : arme, jamais) ;
 * - états : EON# / EOFF# ; déplacements : M (tout déplacement), P (poussé), MA (attiré), MS (échangé) ;
 * - soins : H, LPU ; lancer : CAP (le porteur lance un sort, lancer direct, H forte) ; seuil : TR# (un seuil de PV
 *   posé par le sort # a arrêté des dommages, H) ; tours : TB / TE ;
 * - côté LANCEUR du buff : CD… (inflige des dommages, filtres D…), CH (soigne), PO (se déplace), CC (coup critique).
 * Jetons connus sans objet dans l'arène (jamais déclenchés) : DT, DCAC, KWW, PT, APA, MPA, CAPA, CMPA, R, DIS, ION,
 * IOFF, CION, CIOFF, CS. Jeton inconnu : ignoré (listé dans ``unknown``).
 */
import type { MoveKind } from './events.js';

export const TE_DAMAGE = 1 << 0;
export const TE_DEATH = 1 << 1;
export const TE_KILL = 1 << 2;
export const TE_STATE_ON = 1 << 3;
export const TE_STATE_OFF = 1 << 4;
export const TE_MOVE = 1 << 5;
export const TE_HEAL = 1 << 6;
export const TE_CAST = 1 << 7;
export const TE_TURN_BEGIN = 1 << 8;
export const TE_TURN_END = 1 << 9;
export const TE_THRESHOLD = 1 << 10;
export const TE_HP = 1 << 11;
export const TE_CASTER_DAMAGE = 1 << 12;
export const TE_CASTER_HEAL = 1 << 13;
export const TE_CASTER_MOVE = 1 << 14;
export const TE_CASTER_CRIT = 1 << 15;
/** Jetons évalués côté lanceur du buff (il faut parcourir tous les buffs posés par la source). */
export const TE_CASTER_SIDE = TE_CASTER_DAMAGE | TE_CASTER_HEAL | TE_CASTER_MOVE | TE_CASTER_CRIT;

/** Jetons de dommages subis (famille D / PD). */
const DAMAGE_TOKENS: ReadonlySet<string> = new Set([
  'D', 'DN', 'DE', 'DF', 'DW', 'DA', 'DG', 'DT', 'DI', 'DBA', 'DBE', 'DCCBA', 'DCCBE', 'DM', 'DR', 'DCAC', 'DS',
  'PD', 'PPD', 'PMD',
]);

/** Jetons reconnus mais sans objet dans le Gladiatrool (jamais déclenchés). */
const INERT_TOKENS: ReadonlySet<string> = new Set([
  'PT', 'APA', 'MPA', 'CAPA', 'CMPA', 'R', 'DIS', 'ION', 'IOFF', 'CION', 'CIOFF', 'CS', 'KWW', 'I',
]);

const ELEMENT_TOKENS = ['DN', 'DE', 'DF', 'DW', 'DA'];

export interface ParsedTriggers {
  /** Catégories d'événements concernées (TE_*). */
  readonly mask: number;
  readonly tokens: readonly string[];
  /** États des jetons EON# / EOFF#. */
  readonly eon: readonly number[];
  readonly eoff: readonly number[];
  /** Sorts des jetons TR#. */
  readonly tr: readonly number[];
  /** Jetons non reconnus. */
  readonly unknown: readonly string[];
}

export const NO_TRIGGERS: ParsedTriggers = Object.freeze({ mask: 0, tokens: [], eon: [], eoff: [], tr: [], unknown: [] });

const cache = new Map<string, ParsedTriggers>();

/** Analyse les jetons (hors 'I') d'un effet ; résultat partagé (cache par liste de jetons). */
export function parseTriggers(tokens: readonly string[]): ParsedTriggers {
  const key = tokens.join('|');
  let p = cache.get(key);
  if (p) return p;
  let mask = 0;
  const eon: number[] = [];
  const eoff: number[] = [];
  const tr: number[] = [];
  const unknown: string[] = [];
  for (const t of tokens) {
    if (DAMAGE_TOKENS.has(t)) {
      mask |= TE_DAMAGE;
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^EON(\d+)$/.exec(t))) {
      mask |= TE_STATE_ON;
      eon.push(Number(m[1]));
      continue;
    }
    if ((m = /^EOFF(\d+)$/.exec(t))) {
      mask |= TE_STATE_OFF;
      eoff.push(Number(m[1]));
      continue;
    }
    if ((m = /^TR(\d+)$/.exec(t))) {
      mask |= TE_THRESHOLD;
      tr.push(Number(m[1]));
      continue;
    }
    if (/^CD[A-Z]*$/.test(t) && DAMAGE_TOKENS.has(t.slice(1))) {
      mask |= TE_CASTER_DAMAGE;
      continue;
    }
    switch (t) {
      case 'X':
      case 'XD':
      case 'XPD':
        mask |= TE_DEATH;
        break;
      case 'K':
      case 'KWS':
        mask |= TE_KILL;
        break;
      case 'M':
      case 'P':
      case 'MA':
      case 'MS':
        mask |= TE_MOVE;
        break;
      case 'H':
      case 'LPU':
        mask |= TE_HEAL;
        break;
      case 'V':
      case 'VA':
        mask |= TE_HP | TE_DAMAGE | TE_HEAL;
        break;
      case 'VM':
      case 'VE':
        mask |= TE_HP | TE_DAMAGE;
        break;
      case 'CAP':
        mask |= TE_CAST;
        break;
      case 'TB':
        mask |= TE_TURN_BEGIN;
        break;
      case 'TE':
        mask |= TE_TURN_END;
        break;
      case 'CH':
        mask |= TE_CASTER_HEAL;
        break;
      case 'PO':
        mask |= TE_CASTER_MOVE;
        break;
      case 'CC':
        mask |= TE_CASTER_CRIT;
        break;
      default:
        if (!INERT_TOKENS.has(t)) unknown.push(t);
    }
  }
  p = Object.freeze({ mask, tokens: tokens.slice(), eon, eoff, tr, unknown });
  cache.set(key, p);
  return p;
}

/** Contexte d'un coup reçu, pour les jetons de dommages. */
export interface DamageTokenContext {
  collision: boolean;
  pushIndex: number;
  element: number;
  melee: boolean;
  allySource: boolean;
  critical: boolean;
  glyph: boolean;
  sourceIsSummon: boolean;
  /** L'événement vient d'un effet déclenché (DS exclu). */
  fromTrigger: boolean;
  /** PV perdus, PV max érodés (jetons V…). */
  lifeLoss: number;
  eroded: number;
}

/** Un jeton de la famille D / PD correspond-il au coup ? */
export function damageTokenMatches(t: string, h: DamageTokenContext): boolean {
  if (h.collision) return t === 'PD' || t === 'PPD' || (t === 'PMD' && h.pushIndex === 0);
  switch (t) {
    case 'D':
      return true;
    case 'DG':
      return h.glyph;
    case 'DI':
      return h.sourceIsSummon;
    case 'DBA':
      return h.allySource;
    case 'DBE':
      return !h.allySource;
    case 'DCCBA':
      return h.critical && h.allySource;
    case 'DCCBE':
      return h.critical && !h.allySource;
    case 'DM':
      return h.melee;
    case 'DR':
      return !h.melee;
    case 'DS':
      return !h.fromTrigger;
    case 'DT':
    case 'DCAC':
    case 'PD':
    case 'PPD':
    case 'PMD':
      return false;
    default: {
      const i = ELEMENT_TOKENS.indexOf(t);
      return i >= 0 && i === h.element;
    }
  }
}

/** Le porteur subit des dommages : jeton correspondant (D…, PD…, V/VA, VM/VE), ou null. */
export function matchesDamage(p: ParsedTriggers, h: DamageTokenContext): string | null {
  for (const t of p.tokens) {
    if (DAMAGE_TOKENS.has(t)) {
      if (damageTokenMatches(t, h)) return t;
    } else if ((t === 'V' || t === 'VA') && h.lifeLoss > 0) return t;
    else if ((t === 'VM' || t === 'VE') && h.eroded > 0) return t;
  }
  return null;
}

/** Le lanceur du buff inflige des dommages : jeton CD… correspondant (filtre = jeton sans le C initial), ou null. */
export function matchesCasterDamage(p: ParsedTriggers, h: DamageTokenContext): string | null {
  for (const t of p.tokens) {
    if (t.length >= 2 && t[0] === 'C' && t[1] === 'D' && DAMAGE_TOKENS.has(t.slice(1)) && damageTokenMatches(t.slice(1), h)) {
      return t;
    }
  }
  return null;
}

/** Mort du porteur : X (toujours), XD (dommages hors poussée), XPD (dommages de poussée) ; jeton ou null. */
export function matchesDeath(p: ParsedTriggers, cause: string): string | null {
  for (const t of p.tokens) {
    if (t === 'X') return t;
    if (t === 'XD' && cause === 'damage') return t;
    if (t === 'XPD' && cause === 'pushDamage') return t;
  }
  return null;
}

/** Déplacement du porteur : M (tout sauf placement / résurrection), P (poussé), MA (attiré), MS (échangé). */
export function matchesMove(p: ParsedTriggers, kind: MoveKind): string | null {
  if (kind === 'place' || kind === 'resurrect') return null;
  for (const t of p.tokens) {
    if (t === 'M') return t;
    if (t === 'P' && kind === 'push') return t;
    if (t === 'MA' && kind === 'pull') return t;
    if (t === 'MS' && kind === 'swap') return t;
  }
  return null;
}

/** Soin reçu : H, LPU, V / VA ; jeton ou null. */
export function matchesHeal(p: ParsedTriggers): string | null {
  for (const t of p.tokens) if (t === 'H' || t === 'LPU' || t === 'V' || t === 'VA') return t;
  return null;
}

/** Premier jeton de la liste présent dans ``p``, ou null. */
export function tokenIn(p: ParsedTriggers, token: string): string | null {
  return p.tokens.includes(token) ? token : null;
}

export function hasToken(p: ParsedTriggers, token: string): boolean {
  return p.tokens.includes(token);
}
