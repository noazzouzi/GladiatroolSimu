/**
 * Fonction d'utilité de l'IA des monstres (PV équivalents), évaluée sur un plateau (board.ts) par rapport au plateau
 * du début de la décision. Tous les poids viennent de la configuration (``ai.*``, voir settings.ts) :
 *
 * - **ennemis** (joueurs et invocations des joueurs) : PV retirés × poids de la cible (focalisation ``ai.focus`` /
 *   ``ai.nonFocusWeight``, invocations ``ai.summonTargetWeight``) ; la part due aux pics (dégâts d'entrée) est
 *   comptée × ``ai.spikePushWeight`` ; joueur tué : + ``ai.killBonus`` ; rendu Vulnérable (×2 d'aura ou de sortie) :
 *   + ``ai.vulnerableValue`` × ``ai.spikePushWeight`` ; case gagnée vers les pics : + ``ai.positionWeight`` ×
 *   ``ai.spikePushWeight`` ;
 * - **alliés** (monstres, lui compris) : PV perdus comptés en négatif, PV rendus × ``ai.healWeight``, allié tué :
 *   − ``ai.killBonus``, rendu Vulnérable : − ``ai.vulnerableValue`` ; rendu Inébranlable : + ``ai.unshakableValue``
 *   (moitié s'il est loin des pics, ``ai.threatenedAllyDistance``) ;
 * - **position finale** du monstre qui joue : − ``ai.positionWeight`` par case d'écart à la distance préférée du
 *   profil (``preferredDistance``) par rapport à sa cible (focalisée, sinon l'ennemi le plus proche) ; entrée
 *   volontaire dans les pics interdite si ``avoidSpikes`` (coût prohibitif).
 */
import { distance } from '../geometry/index.js';
import { TEAM_PLAYERS, TEAM_SCENARIO, type Board } from './board.js';
import type { AiSettings } from './settings.js';

/** Coût d'une entrée volontaire dans les pics quand ``avoidSpikes`` est vrai. */
export const FORBIDDEN = 1e7;

/** Contexte d'évaluation d'une décision (un monstre, un plateau de départ). */
export interface EvalContext {
  readonly actor: number;
  readonly settings: AiSettings;
  /** Plateau du début de la décision (référence des écarts). */
  readonly base: Board;
  /** Poids de chaque combattant ennemi (0 pour les alliés et le scénario). */
  readonly targetWeight: Float64Array;
  /** Cible de focalisation (−1 : aucune). */
  readonly focusId: number;
  /** Le monstre était dans les pics au début de son tour. */
  readonly startedInSpikes: boolean;
}

/** Distance maximale (cases) d'un joueur pour qu'un monstre soit jugé « à portée de poussée » (choix d'implémentation). */
export const THREAT_ENEMY_RANGE = 6;

/** Un ennemi de ``i`` est à au plus ``THREAT_ENEMY_RANGE`` cases. */
export function enemyNear(b: Board, i: number): boolean {
  const c = b.cell[i]!;
  for (let j = 0; j < b.s.n; j++) if (b.isOn(j) && b.areEnemies(i, j) && distance(c, b.cell[j]!) <= THREAT_ENEMY_RANGE) return true;
  return false;
}

/** Monstre « menacé » : à au plus ``maxDist`` cases des pics (hors pics) et un joueur à portée de poussée. */
export function isThreatened(b: Board, i: number, maxDist: number): boolean {
  if (!b.isOn(i)) return false;
  const d = b.env.spikeDist[b.cell[i]!] ?? 99;
  return d > 0 && d <= maxDist && enemyNear(b, i);
}

/** Multiplicateur des pics porté (%, 100 = aucun). */
export function spikeMult(b: Board, i: number): number {
  return (b.aura[i]! * b.exit[i]!) / 100;
}

/** PV « effectifs » (PV divisés par le multiplicateur des pics) : base de ``lowestHp``. */
export function effectiveHp(b: Board, i: number): number {
  return (b.hp[i]! * 100) / Math.max(1, spikeMult(b, i));
}

/**
 * Cible de référence pour la position : cible focalisée vivante, sinon l'ennemi (hors invocations si possible) le
 * plus proche de ``cell`` ; −1 s'il n'y en a pas.
 */
export function anchorOf(b: Board, ctx: EvalContext, cell: number): number {
  if (ctx.focusId >= 0 && b.isOn(ctx.focusId)) return ctx.focusId;
  return nearestEnemy(b, ctx.actor, cell);
}

/** Ennemi le plus proche de ``cell`` (joueurs avant invocations, puis distance, puis id). */
export function nearestEnemy(b: Board, actor: number, cell: number): number {
  let best = -1;
  let bestKey = Infinity;
  for (let i = 0; i < b.s.n; i++) {
    if (!b.isOn(i) || !b.areEnemies(actor, i)) continue;
    const key = distance(cell, b.cell[i]!) + (b.s.isSummon[i] ? 1000 : 0);
    if (key < bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}

/** Écart (cases) entre ``cell`` et la distance préférée à la cible de référence. */
export function positionDeviation(b: Board, ctx: EvalContext, cell: number): number {
  const a = anchorOf(b, ctx, cell);
  if (a < 0 || cell < 0) return 0;
  const d = distance(cell, b.cell[a]!);
  const [lo, hi] = ctx.settings.preferredDistance;
  return d < lo ? lo - d : d > hi ? d - hi : 0;
}

/** Utilité du plateau ``b`` pour la décision ``ctx`` (plus grand = meilleur). */
export function utility(b: Board, ctx: EvalContext): number {
  const base = ctx.base;
  const w = ctx.settings.weights;
  const env = b.env;
  const n = b.s.n;
  const actor = ctx.actor;
  let u = 0;
  for (let i = 0; i < n; i++) {
    if (!base.alive[i] || b.s.team[i] === TEAM_SCENARIO) continue;
    const lost = base.hp[i]! - b.hp[i]!;
    const spike = b.spikeDmg[i]! - base.spikeDmg[i]!;
    const multUp = Math.max(0, spikeMult(b, i) - spikeMult(base, i)) / 100;
    if (b.areEnemies(actor, i)) {
      const tw = ctx.targetWeight[i]!;
      if (tw <= 0) continue;
      let v = lost - spike + w.spikePush * spike;
      if (!b.alive[i]) v += w.kill;
      else {
        v += w.spikePush * w.vulnerable * multUp;
        const d0 = env.spikeDist[base.cell[i]!] ?? 0;
        const d1 = env.spikeDist[b.cell[i]!] ?? 0;
        if (d0 !== d1) v += w.spikePush * w.position * (d0 - d1);
      }
      u += tw * v;
    } else if (b.areAllies(actor, i)) {
      u -= lost > 0 ? lost : lost * w.heal;
      if (!b.alive[i]) {
        u -= w.kill;
        continue;
      }
      u -= w.vulnerable * multUp;
      if (b.unshakable[i] && !base.unshakable[i]) {
        // rendu Inébranlable : pleine valeur s'il est menacé, moitié s'il est loin des pics, rien sans joueur proche
        if (enemyNear(b, i)) u += isThreatened(b, i, w.threatenedAllyDistance) ? w.unshakable : w.unshakable / 2;
      } else if (!b.unshakable[i] && b.cell[i] !== base.cell[i] && isThreatened(b, i, w.threatenedAllyDistance) && !isThreatened(base, i, w.threatenedAllyDistance)) {
        // exposé (déplacé près des pics, à portée des joueurs, sans Inébranlable)
        u -= w.unshakable / 2;
      }
    }
  }
  if (b.alive[actor]) {
    const cell = b.cell[actor]!;
    u -= w.position * positionDeviation(b, ctx, cell);
    if (ctx.settings.avoidSpikes && !ctx.startedInSpikes && b.inSpikes[actor] && !base.inSpikes[actor]) u -= FORBIDDEN;
  }
  return u;
}

/**
 * Poids de chaque combattant ciblé par ``actor`` : focalisation (``ai.focus`` ; la Mama concentre ses sorts si
 * ``ai.mamaFocusSingleTarget``), invocations des joueurs (``ai.summonTargetWeight``).
 */
export function targetWeights(b: Board, actor: number, settings: AiSettings, focusId: number): Float64Array {
  const out = new Float64Array(b.s.n);
  const w = settings.weights;
  for (let i = 0; i < b.s.n; i++) {
    if (!b.alive[i] || !b.areEnemies(actor, i)) continue;
    let v = b.s.isSummon[i] && b.s.team[i] === TEAM_PLAYERS ? w.summonTarget : 1;
    if (focusId >= 0 && i !== focusId) v *= w.nonFocus;
    out[i] = v;
  }
  return out;
}

/**
 * Cible de focalisation au début du tour : ``lowestHp`` (PV effectifs les plus bas, un joueur rendu ×2 compte pour
 * moitié), ``nearest`` (le plus proche), ``maxDamage`` (aucune : chaque joueur compte pleinement) — sauf la Mama si
 * ``ai.mamaFocusSingleTarget`` (PV effectifs les plus bas). Les invocations ne sont focalisées qu'à défaut de joueur.
 */
export function chooseFocus(b: Board, actor: number, settings: AiSettings): number {
  const mode = settings.focusSingleTarget && settings.focus === 'maxDamage' ? 'lowestHp' : settings.focus;
  if (mode === 'maxDamage') return -1;
  const cell = b.cell[actor]!;
  let best = -1;
  let bestKey = Infinity;
  for (let i = 0; i < b.s.n; i++) {
    if (!b.isOn(i) || !b.areEnemies(actor, i)) continue;
    const key = (b.s.isSummon[i] ? 1e9 : 0) + (mode === 'nearest' ? distance(cell, b.cell[i]!) : effectiveHp(b, i));
    if (key < bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}
