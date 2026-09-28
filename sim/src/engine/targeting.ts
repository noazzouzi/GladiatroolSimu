/**
 * Sélection des cibles d'un effet (ETUDE §9.4, N70 §3.4) : zone (``SpellZone.contains`` sur les positions d'AVANT le
 * sort), masque d'inclusion / d'exclusion, camp DOFUS 3, cibles additionnelles, ordre de traitement.
 *
 * Masques d'inclusion (au moins un) : A ennemis ; a alliés, lanceur compris ; g alliés sans le lanceur ; c / C lanceur
 * (C : ajouté même hors zone, sans dégressivité) ; j / J invocations alliées / ennemies ; i / I idem (invocations
 * non statiques) ; h / H et l / L joueurs non invoqués alliés / ennemis ; m / M monstres non invoqués. Le lanceur
 * n'est inclus que par a, c ou C. Lettre inconnue (x…) : ne correspond à rien.
 * Exclusions (toutes) : E# / e# état, F# / f# monstre (plusieurs F = OU), V# PV ≤ #%, v# PV > #% (v100 = PV pleins
 * si ``objectives.v100MeansFull``), o : n'est pas le déclencheur, P / p soi-même ou ses invocations, U en apparition ;
 * O : cible ADDITIONNELLE = le combattant déclencheur (même hors zone, s'il passe le camp et les exclusions ;
 * ``rules.targeting.additionalTargets``, N70 §3.4) ;
 * préfixe * = testé sur le lanceur ; conditions inconnues ignorées.
 * Camps (hypothèse Q36) : Atq = joueurs, Def = monstres, Sce = entité de scénario ; l'entité de scénario n'est
 * visée que par un masque de camp Sce (ou comme lanceur par c / C). Masque sans lettre : le camp seul décide.
 * Morts : seulement pour la forme de zone A (toute la carte, morts compris) et pour la résurrection (147).
 */
import type { MaskCondition, MaskData } from '../data/index.js';
import { CELL_COUNT, distance, dir8 } from '../geometry/index.js';
import type { Fighter } from './fighter.js';
import type { CompiledEffect } from './spells.js';
import type { FightState } from './state.js';

export interface MaskContext {
  /** Combattant déclencheur (masque O), −1 sinon. */
  triggerSourceId: number;
  /** Lanceur mort autorisé (effet de mort, X / XD) : ``C`` l'ajoute quand même comme cible additionnelle. */
  allowDeadCaster?: boolean;
}

const NO_MASK_CTX: MaskContext = { triggerSourceId: -1 };

function includeMatches(letter: string, caster: Fighter, target: Fighter): boolean {
  const same = caster.team === target.team;
  const self = caster === target;
  switch (letter) {
    case 'a':
      return same;
    case 'A':
      return !same;
    case 'g':
      return same && !self;
    case 'c':
    case 'C':
      return self;
    case 'j':
    case 'i':
      return same && !self && target.isSummon;
    case 'J':
    case 'I':
      return !same && target.isSummon;
    case 'h':
    case 'l':
      return same && !self && target.kind === 'archetype' && !target.isSummon;
    case 'H':
    case 'L':
      return !same && target.kind === 'archetype' && !target.isSummon;
    case 'm':
      return same && !self && target.kind === 'monster' && !target.isSummon;
    case 'M':
      return !same && target.kind === 'monster' && !target.isSummon;
    default:
      return false;
  }
}

function conditionPasses(state: FightState, cond: MaskCondition, subject: Fighter, caster: Fighter, mctx: MaskContext): boolean {
  const v = cond.value ?? 0;
  switch (cond.key) {
    case 'E':
      return subject.hasState(v);
    case 'e':
      return !subject.hasState(v);
    case 'F':
      return subject.monsterId === v;
    case 'f':
      return subject.monsterId !== v;
    case 'V':
      return subject.hp * 100 <= v * subject.maxHp;
    case 'v':
      if (v === 100 && state.ctx.config.objectives.v100MeansFull) return subject.hp >= subject.maxHp;
      return subject.hp * 100 > v * subject.maxHp;
    case 'O':
      // cible additionnelle « combattant déclencheur » (rules.targeting.additionalTargets) : ajoutée par
      // selectTargets, pas un filtre (a,O,E5899 du Poutch : l'attaquant Dompteur, hors de la zone P)
      return cond.onCaster ? subject.id === mctx.triggerSourceId : true;
    case 'o':
      return subject.id !== mctx.triggerSourceId;
    case 'P':
      return subject === caster || subject.summonerId === caster.id;
    case 'p':
      return !(subject === caster || subject.summonerId === caster.id);
    case 'U':
      return false;
    case 'u':
      return true;
    default:
      return true;
  }
}

/** Le combattant ``target`` passe-t-il le masque de l'effet (inclusion, camp, exclusions) pour ce lanceur ? */
export function matchesMask(
  state: FightState,
  caster: Fighter,
  target: Fighter,
  mask: MaskData,
  mctx: MaskContext = NO_MASK_CTX,
  skipInclude = false,
): boolean {
  if (target.camp === 'Sce' && target !== caster && mask.camp !== 'Sce') return false;
  if (mask.camp !== null && target.camp !== mask.camp) return false;
  if (mask.include.length > 0 && !skipInclude) {
    let ok = false;
    for (const l of mask.include) {
      if (includeMatches(l, caster, target)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  // plusieurs conditions F (même sujet) : OU ; toutes les autres : ET
  let fTarget = 0;
  let fTargetOk = false;
  let fCaster = 0;
  let fCasterOk = false;
  for (const cond of mask.exclude) {
    const subject = cond.onCaster ? caster : target;
    const pass = conditionPasses(state, cond, subject, caster, mctx);
    if (cond.key === 'F') {
      if (cond.onCaster) {
        fCaster++;
        fCasterOk ||= pass;
      } else {
        fTarget++;
        fTargetOk ||= pass;
      }
      continue;
    }
    if (!pass) return false;
  }
  if (fTarget > 0 && !fTargetOk) return false;
  if (fCaster > 0 && !fCasterOk) return false;
  return true;
}

/**
 * ``TargetManagement.comparePositions`` (identique à ``sortTargetsForEffect`` de la géométrie) : poussée = de la plus
 * éloignée à la plus proche de la case ciblée ; sinon l'inverse ; égalité : direction puis id de cellule.
 */
export function comparePositions(targetedCell: number, isPush: boolean, a: number, b: number): number {
  const sign = isPush ? 1 : -1;
  let da = distance(a, targetedCell);
  let db = distance(b, targetedCell);
  if (da === db) {
    let ra = dir8(targetedCell, a);
    let rb = dir8(targetedCell, b);
    if (ra === rb) {
      rb = 0;
      if (ra === 0 || ra === 7 || ra === 6 || ra === 5) ra = a < b ? -1 : 1;
      else ra = a < b ? 1 : -1;
    } else {
      ra = (ra + 1) % 8;
      rb = (rb + 1) % 8;
    }
    da = ra;
    db = rb;
  }
  return (db - da) * sign;
}

export interface TargetSelection {
  /** Cibles dans l'ordre de traitement. */
  targets: Fighter[];
  /** Ids des cibles additionnelles (lanceur ajouté par C hors zone) : pas de dégressivité. */
  additional: number[];
}

/**
 * Cibles d'un effet, figées au lancement : zone évaluée sur ``snapshot`` (positions d'avant le sort, par id),
 * masque évalué sur l'état courant (états, PV). Seuls les combattants présents au lancement (id < snapshot.length)
 * sont candidats.
 */
export function selectTargets(
  state: FightState,
  caster: Fighter,
  effect: CompiledEffect,
  targetedCell: number,
  casterCellBefore: number,
  snapshot: Int16Array,
  mctx: MaskContext = NO_MASK_CTX,
): TargetSelection {
  const zone = effect.zone;
  const shape = zone.shape;
  const wholeMap = shape === 'A' || shape === 'a';
  const resurrect = effect.handler === 'resurrect';
  const withDead = shape === 'A';
  const found: Fighter[] = [];
  const cells: number[] = [];
  const n = Math.min(snapshot.length, state.fighters.length);
  for (let id = 0; id < n; id++) {
    const f = state.fighters[id]!;
    if (resurrect ? f.alive : !f.alive && !withDead) continue;
    const c = snapshot[id]!;
    if (c < 0 || c >= CELL_COUNT) {
      if (!wholeMap) continue;
    } else if (!wholeMap) {
      if (targetedCell < 0 || !zone.contains(c, targetedCell, casterCellBefore)) continue;
    }
    if (!matchesMask(state, caster, f, effect.mask, mctx)) continue;
    found.push(f);
    cells.push(c);
  }
  if (found.length > 1 && targetedCell >= 0) {
    const idx = found.map((_, i) => i);
    idx.sort((i, j) => {
      const ci = cells[i]!;
      const cj = cells[j]!;
      if (ci < 0 || cj < 0) return (ci < 0 ? 1 : 0) - (cj < 0 ? 1 : 0);
      return comparePositions(targetedCell, effect.isPush, ci, cj);
    });
    const sorted = idx.map((i) => found[i]!);
    found.length = 0;
    found.push(...sorted);
  }
  const additional: number[] = [];
  if (effect.mask.include.includes('C') && (caster.alive || mctx.allowDeadCaster) && !found.includes(caster)) {
    if (matchesMask(state, caster, caster, effect.mask, mctx)) {
      found.push(caster);
      additional.push(caster.id);
    }
  }
  // O : le combattant déclencheur est ajouté (même hors zone) s'il passe le camp et les conditions d'exclusion
  if (mctx.triggerSourceId >= 0 && effect.mask.exclude.some((c) => c.key === 'O' && !c.onCaster)) {
    const src = state.fighters[mctx.triggerSourceId];
    if (src && src.alive && !found.includes(src) && matchesMask(state, caster, src, effect.mask, mctx, true)) {
      found.push(src);
      additional.push(src.id);
    }
  }
  return { targets: found, additional };
}
