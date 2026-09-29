/**
 * Génération des macro-actions du joueur dont c'est le tour (ÉTUDE §10.2-§10.4) :
 *
 * - « se déplacer vers m (optionnel, avec les PM restants) puis lancer s sur c » ;
 * - « finir le tour en se déplaçant vers m » (placement défensif, prise de cadeau, sortie des lignes de la Mama).
 *
 * Élagage (sans simulation, par la géométrie) :
 * - cases ciblées dont la zone touche au moins une entité PERTINENTE (ennemi pour un sort offensif, allié pour un
 *   soin / boost / échange, le lanceur pour un sort personnel) ; pour une téléportation : zone de poussée qui touche
 *   un ennemi ou case de cadeau ;
 * - positions de lancer : cases atteignables par un chemin qui évite les pics (jamais de traversée) ; entrée
 *   volontaire dans les pics seulement pour un échange (« Voltige depuis les pics ») avec un ennemi hors des pics ;
 * - déplacements DOMINÉS supprimés : deux positions qui produisent le même effet (mêmes cibles touchées, mêmes
 *   directions de poussée, même case finale du lanceur) → seule la moins coûteuse en PM est gardée (les PM restants
 *   servent au placement de fin de tour) ;
 * - estimation a priori (dégâts × multiplicateur de la cible, poussées qui finissent dans les pics — trajectoire
 *   prévue par ``computeForcedMove`` —, échanges depuis les pics, soins utiles) pour trier et plafonner le nombre de
 *   candidats simulés, avec un quota par sort (diversité).
 *
 * Gère les sorts uniques (usage unique : ils disparaissent du grimoire), Pense Vite (lancers plafonnés à
 * ``spells.penseVite.maxCasts`` au tour de 10 s) et les sorts appris en cours de tour (le grimoire est relu à chaque
 * nœud ; ``checkCaster`` applique ``spells.newSpellUsableSameTurn``).
 */
import {
  checkCaster,
  pushLevel,
  Stat,
  type Fighter,
} from '../engine/index.js';
import { objectiveById } from '../scenario/index.js';
import {
  collisionDamages,
  computeForcedMove,
  dir8Exact,
  distance,
  effectiveMaxRange,
  hasLineOfSight,
  isInCastRange,
  reachableCells,
  xyToCell,
  cellX,
  cellY,
  pushDirection,
  type Reachability,
} from '../geometry/index.js';
import type { GladiatroolFight } from '../scenario/index.js';
import {
  cellPositionScore,
  damageMultiplier,
  monsterInSpikes,
  penseViteCastsLeft,
  positionContext,
  targetableEnemies,
} from './evaluate.js';
import { spellProfile, type SpellProfile } from './spellInfo.js';
import type { PlannerWeights } from './weights.js';

/** Macro-action : déplacement optionnel puis lancer (ou déplacement seul en fin de tour). */
export interface MacroAction {
  /** Chemin du déplacement préalable (cases successives, départ exclu) ; vide : pas de déplacement. */
  path: number[];
  /** PM dépensés par le déplacement. */
  moveCost: number;
  /** Case du lanceur au moment du lancer. */
  from: number;
  /** Niveau de sort lancé (null : déplacement seul). */
  spellLevelId: number | null;
  /** Case ciblée (−1 : aucune). */
  cell: number;
  /** Estimation a priori (tri, élagage). */
  prior: number;
  /** Clé d'équivalence (déduplication des positions dominées). */
  key: string;
}

export interface GenerateOptions {
  /** Nombre maximal de macro-actions renvoyées (après tri a priori). */
  maxCandidates: number;
  /** Candidats garantis par sort avant remplissage par estimation a priori (diversité). */
  perSpellQuota: number;
  weights: PlannerWeights;
}

interface Pos {
  cell: number;
  cost: number;
  spike: boolean;
}

interface Entity {
  f: Fighter;
  /** Position (après le déplacement du lanceur pour le lanceur lui-même). */
  cell: number;
  enemy: boolean;
  mult: number;
  inSpikes: boolean;
}

interface Candidate {
  m: Pos;
  c: number;
  key: string;
  hits: Entity[];
}

/** Offsets (dx, dy) d'un losange de rayon r, par rayon (mis en cache). */
const diamondCache: [number, number][][] = [];
function diamond(r: number): [number, number][] {
  let d = diamondCache[r];
  if (!d) {
    d = [];
    for (let dx = -r; dx <= r; dx++) {
      const rest = r - Math.abs(dx);
      for (let dy = -rest; dy <= rest; dy++) d.push([dx, dy]);
    }
    diamondCache[r] = d;
  }
  return d;
}

/** Cases jouables à distance ≤ r d'une des cases ``centers`` (sans doublon). */
function cellsNear(grid: GladiatroolFight['ctx']['grid'], centers: readonly number[], r: number, mark: Uint8Array, out: number[]): void {
  const off = diamond(Math.min(r, 12));
  for (const c of centers) {
    const x = cellX(c);
    const y = cellY(c);
    for (const [dx, dy] of off) {
      const n = xyToCell(x + dx, y + dy);
      if (n < 0 || mark[n] || !grid.isWalkable(n)) continue;
      mark[n] = 1;
      out.push(n);
    }
  }
}

/** Positions atteignables (évitent les pics) et positions d'entrée volontaire dans les pics. */
export function castPositions(fight: GladiatroolFight, caster: Fighter): { reach: Reachability; safe: Pos[]; spikes: Pos[] } {
  const state = fight.state;
  const grid = state.ctx.grid;
  const reach = reachableCells(grid, caster.cell, caster.mp, state.occupiedPredicate(), { avoidSpikes: true });
  const safe: Pos[] = [];
  const spikes: Pos[] = [];
  // un lanceur déjà dans les pics peut devoir en traverser d'autres pour sortir (chemin qui en touche le moins)
  const startsInSpikes = grid.isSpike(caster.cell);
  for (const c of reach.cells) {
    if (c === caster.cell) {
      safe.push({ cell: c, cost: 0, spike: grid.isSpike(c) });
      continue;
    }
    const cost = reach.cost(c);
    if (cost < 0 || cost > caster.mp) continue;
    if (reach.crossesSpikes(c) && !(startsInSpikes && !grid.isSpike(c))) continue;
    if (reach.endsInSpikes(c)) spikes.push({ cell: c, cost, spike: true });
    else safe.push({ cell: c, cost, spike: false });
  }
  safe.sort((a, b) => a.cost - b.cost || a.cell - b.cell);
  spikes.sort((a, b) => a.cost - b.cost || a.cell - b.cell);
  return { reach, safe, spikes };
}

/** Macro-actions « déplacement puis lancer » du joueur courant (vide si ce n'est pas le tour d'un joueur). */
export function generateCastActions(fight: GladiatroolFight, o: GenerateOptions): MacroAction[] {
  const state = fight.state;
  const caster = fight.getCurrentFighter();
  if (!caster || !fight.isPlayerTurn() || state.pendingChoices.length) return [];
  if (penseViteCastsLeft(state, caster) <= 0) return [];
  const ctx = state.ctx;
  const grid = ctx.grid;
  const sc = fight.scenario;
  const occ = state.occupiedPredicate();
  const { reach, safe, spikes } = castPositions(fight, caster);
  const posCtx = positionContext(fight);

  // entités pertinentes
  const enemies: Entity[] = targetableEnemies(state, sc).map((f) => ({
    f,
    cell: f.cell,
    enemy: true,
    mult: damageMultiplier(f) / 100,
    inSpikes: monsterInSpikes(state, f),
  }));
  const allies: Entity[] = [];
  let self: Entity | null = null;
  for (const f of state.fighters) {
    if (!f.alive || f.team !== 'players' || f.cell < 0) continue;
    const e: Entity = { f, cell: f.cell, enemy: false, mult: damageMultiplier(f) / 100, inSpikes: grid.isSpike(f.cell) };
    allies.push(e);
    if (f.id === caster.id) self = e;
  }
  if (!self) return [];
  const enemyCells = enemies.map((e) => e.cell);
  const allyCells = allies.map((e) => e.cell);
  const strMult = (100 + caster.stat(Stat.STRENGTH) + caster.stat(Stat.POWER)) / 100;
  const fdMult = Math.max(0, 100 + caster.stat(Stat.FINAL_DAMAGE)) / 100;

  const perSpell: MacroAction[][] = [];
  const mark = new Uint8Array(560);

  for (const slot of caster.spells) {
    const spell = ctx.getSpell(slot.spellLevelId);
    if (!checkCaster(state, caster, spell).ok) continue;
    const prof = spellProfile(ctx, slot.spellLevelId);
    if (!prof.enemyRelevant && !prof.allyRelevant && !prof.selfOnly && !prof.teleportsCaster && !prof.summons && !prof.advancesCaster) {
      continue;
    }
    const spec = spell.castSpec;
    const maxRange = effectiveMaxRange(spec, caster.range);
    const rec = caster.castRecord(spell.spellId);
    const found = new Map<string, Candidate>();

    const ents = enemies.concat(allies);
    const entitiesAt = (m: Pos): Entity[] => {
      self!.cell = m.cell;
      return ents;
    };

    /** Entités touchées par le lancer (m, c), positions après le déplacement du lanceur. */
    const hitsOf = (m: Pos, c: number, ents: Entity[]): Entity[] => {
      const out: Entity[] = [];
      for (const e of ents) {
        for (const z of prof.zones) {
          if (z.contains(e.cell, c, m.cell)) {
            out.push(e);
            break;
          }
        }
      }
      return out;
    };

    const relevant = (hits: readonly Entity[], c: number): boolean => {
      if (prof.enemyRelevant && hits.some((h) => h.enemy)) return true;
      if (prof.allyRelevant && hits.some((h) => !h.enemy)) return true;
      if (prof.selfOnly) return true;
      if (prof.advancesCaster && hits.length > 0) return true;
      if (prof.teleportsCaster && posCtx.gifts.includes(c)) return true;
      return false;
    };

    const keyOf = (m: Pos, c: number, hits: readonly Entity[]): string => {
      let k = `${c}`;
      for (const h of hits) {
        k += `:${h.f.id}`;
        if (prof.pushes || prof.pulls) {
          const d = prof.pushFromCaster ? pushDirection(m.cell, h.cell, h.cell) : pushDirection(m.cell, c, h.cell);
          k += `/${d}`;
        }
      }
      if (prof.swaps) k += `|m${m.cell}`;
      if (prof.advancesCaster) {
        const r = computeForcedMove(grid, (x) => x !== caster.cell && occ(x), {
          kind: 'advance',
          casterCell: m.cell,
          targetedCell: c,
          targetCell: c,
          force: prof.advanceForce,
        });
        k += `|a${r.cell}`;
      }
      return k;
    };

    /** 0 : lancer impossible depuis m ; 1 : possible mais sans cible pertinente ; 2 : candidat retenu. */
    const consider = (m: Pos, c: number): 0 | 1 | 2 => {
      if (!validCast(m, c)) return 0;
      const hits = hitsOf(m, c, entitiesAt(m));
      if (!relevant(hits, c)) return 1;
      const key = keyOf(m, c, hits);
      const prev = found.get(key);
      if (prev && prev.m.cost <= m.cost) return 2;
      found.set(key, { m, c, key, hits: hits.map((h) => ({ ...h })) });
      return 2;
    };

    const blocked = (x: number): boolean => x !== caster.cell && occ(x);
    const validCast = (m: Pos, c: number): boolean => {
      if (!isInCastRange(m.cell, c, spec.minRange, maxRange, spec.castInLine ?? false, spec.castInDiagonal ?? false)) return false;
      if (!grid.isWalkable(c)) return false;
      const takenAfter = c === m.cell || (c !== caster.cell && occ(c));
      if (spec.needFreeCell && takenAfter) return false;
      if ((spec.needTakenCell || spec.needVisibleEntity) && !takenAfter) return false;
      if (spec.castTestLos && !hasLineOfSight(m.cell, c, blocked, grid.blocksLos)) return false;
      if (rec && spell.cast.maxPerTarget > 0 && takenAfter) {
        const t = c === m.cell ? caster : state.fighterAt(c);
        if (t && rec.castsOn(t.id) >= spell.cast.maxPerTarget) return false;
      }
      return true;
    };

    const start = safe[0]!;
    if (prof.selfCast) {
      if (prof.globalZone || prof.selfOnly) consider(start, start.cell);
      else for (const m of safe) consider(m, m.cell);
    } else {
      // cases ciblées candidates
      const tc: number[] = [];
      mark.fill(0);
      if (prof.pointTarget || prof.needTakenCell) {
        const cells: number[] = [];
        if (prof.enemyRelevant || prof.advancesCaster) cells.push(...enemyCells);
        if (prof.allyRelevant || prof.advancesCaster) cells.push(...allyCells);
        for (const c of cells) {
          if (!mark[c]) {
            mark[c] = 1;
            tc.push(c);
          }
        }
      } else if (prof.globalZone) {
        tc.push(...(prof.enemyRelevant ? enemyCells.slice(0, 1) : allyCells.slice(0, 1)));
      } else {
        const centers: number[] = [];
        if (prof.enemyRelevant || prof.teleportsCaster || prof.summons) centers.push(...enemyCells);
        if (prof.allyRelevant) centers.push(...allyCells);
        cellsNear(grid, centers, Math.max(prof.zoneReach, 0), mark, tc);
        if (prof.teleportsCaster) for (const g of posCtx.gifts) if (!mark[g] && grid.isWalkable(g)) tc.push(g);
      }
      // la direction d'une poussée dépend du lanceur si elle part de lui (sous-sort sur la cible, ou cible sur la
      // case ciblée) ; celle d'une poussée de zone autour d'une case libre part de la case ciblée
      const pushDependsOnCaster = (prof.pushes || prof.pulls) && (prof.pushFromCaster || !prof.needFreeCell);
      const positionIndependent = !pushDependsOnCaster && !prof.swaps && !prof.advancesCaster && !prof.directional;
      for (const c of tc) {
        if (prof.swaps) {
          const t = state.fighterAt(c);
          consider(start, c);
          if (t && t.team === 'monsters' && !monsterInSpikes(state, t)) for (const m of spikes) consider(m, c);
          // Mama restée invulnérable dans les pics : l'échange la sort (le lanceur prend sa place dans les pics)
          if (t && t.id === sc.mamaId && t.invulnerable && monsterInSpikes(state, t)) {
            for (const m of safe) {
              const d = distance(m.cell, c);
              if (d <= maxRange && d >= spec.minRange) consider(m, c);
            }
          }
          continue;
        }
        if (prof.anywhere && positionIndependent) {
          consider(start, c);
          continue;
        }
        for (const m of safe) {
          const d = distance(m.cell, c);
          if (d > maxRange || d < spec.minRange) continue;
          const r = consider(m, c);
          if (r !== 0 && positionIndependent) break;
        }
      }
    }
    self.cell = caster.cell;

    // macro-actions et estimation a priori
    const list: MacroAction[] = [];
    for (const cand of found.values()) {
      const path = cand.m.cell === caster.cell ? [] : reach.path(cand.m.cell) ?? [];
      list.push({
        path,
        moveCost: cand.m.cost,
        from: cand.m.cell,
        spellLevelId: slot.spellLevelId,
        cell: cand.c,
        prior: priorOf(fight, caster, prof, cand, strMult, fdMult, posCtx.gifts, o.weights),
        key: `${slot.spellLevelId}@${cand.key}`,
      });
    }
    list.sort((a, b) => b.prior - a.prior);
    if (list.length) perSpell.push(list);
  }

  // quota par sort puis remplissage par estimation a priori
  const out: MacroAction[] = [];
  const taken = new Set<string>();
  for (const list of perSpell) {
    for (const a of list.slice(0, o.perSpellQuota)) {
      out.push(a);
      taken.add(a.key);
    }
  }
  if (out.length < o.maxCandidates) {
    const rest = perSpell.flat().filter((a) => !taken.has(a.key));
    rest.sort((a, b) => b.prior - a.prior);
    for (const a of rest) {
      if (out.length >= o.maxCandidates) break;
      out.push(a);
    }
  }
  out.sort((a, b) => b.prior - a.prior);
  return out.length > o.maxCandidates ? out.slice(0, o.maxCandidates) : out;
}

/** Estimation a priori d'un lancer (PV équivalents, grossière) : sert au tri et au plafonnement. */
function priorOf(
  fight: GladiatroolFight,
  caster: Fighter,
  prof: SpellProfile,
  cand: Candidate,
  strMult: number,
  fdMult: number,
  gifts: readonly number[],
  w: PlannerWeights,
): number {
  const state = fight.state;
  const grid = state.ctx.grid;
  let p = -30 * cand.m.cost;
  const dmg = (prof.avgDamageRoll * strMult + (prof.casterHpPct * caster.hp) / 100) * fdMult;
  const occAfter = (x: number): boolean => x === cand.m.cell || (x !== caster.cell && state.isOccupied(x));
  const sc = fight.scenario;
  const pushKillGoal =
    (prof.pushes || prof.pulls) && !!sc.active && objectiveById(state.ctx.data, sc.active).condition.kind === 'victimKilledByPushDamage';
  for (const h of cand.hits) {
    if (h.enemy && pushKillGoal && h.f.canBePushed && h.f.id !== sc.mamaId) {
      // « Attention, sol glissant » : la collision prévue tue-t-elle la cible (ou un ennemi percuté) ?
      const r = computeForcedMove(grid, occAfter, {
        kind: prof.pushes ? 'push' : 'pull',
        casterCell: cand.m.cell,
        targetedCell: prof.pushFromCaster ? h.cell : cand.c,
        targetCell: h.cell,
        force: prof.pushes ? prof.pushForce : prof.pullForce,
      });
      if (r.collision) {
        const victims = [h.f, ...r.collisionChain.map((c) => state.fighterAt(c))];
        const dmg = collisionDamages(
          r,
          pushLevel(state, caster),
          caster.stat(Stat.PUSH_DAMAGE),
          victims.map((v) => (v ? v.stat(Stat.PUSH_RES) : 0)),
          caster.pacifist,
        );
        if (victims.some((v, i) => !!v && v.team === 'monsters' && (dmg[i] ?? 0) * h.mult >= v.hp)) p += w.objectiveCompleted;
      }
    }
    if (h.enemy) {
      if (prof.damages && dmg > 0) {
        const real = dmg * h.mult;
        const fm = h.inSpikes ? w.futureMultInSpikes : w.futureMultOutside;
        p += Math.min(h.f.hp, real) / fm;
        if (real >= h.f.hp) p += w.monsterAlive[String(h.f.monsterId)] ?? w.monsterAliveDefault;
      }
      if ((prof.pushes || prof.pulls) && h.f.canBePushed && h.inSpikes && h.f.invulnerable && h.f.id === fight.scenario.mamaId) {
        // Mama restée (invulnérable) dans les pics : l'en sortir rouvre la possibilité d'une nouvelle entrée
        const r = computeForcedMove(grid, occAfter, {
          kind: prof.pushes ? 'push' : 'pull',
          casterCell: cand.m.cell,
          targetedCell: prof.pushFromCaster ? h.cell : cand.c,
          targetCell: h.cell,
          force: prof.pushes ? prof.pushForce : prof.pullForce,
        });
        if (r.moved && !grid.isSpike(r.cell)) p += w.mamaStuck;
      }
      if (prof.swaps && cand.c === h.cell && h.inSpikes && h.f.invulnerable && h.f.id === fight.scenario.mamaId) p += 0.5 * w.mamaStuck;
      if ((prof.pushes || prof.pulls) && h.f.canBePushed && !h.inSpikes) {
        const force = prof.pushes ? prof.pushForce : prof.pullForce;
        const r = computeForcedMove(grid, occAfter, {
          kind: prof.pushes ? 'push' : 'pull',
          casterCell: cand.m.cell,
          targetedCell: prof.pushFromCaster ? h.cell : cand.c,
          targetCell: h.cell,
          force,
        });
        if (r.endsInSpikes) p += 6000;
        else if (r.moved) p += 200;
      }
      if (prof.swaps && cand.c === h.cell && cand.m.spike) p += 7000;
      if (!prof.damages && !prof.pushes && !prof.swaps) p += 400;
    } else {
      if (prof.heals) p += 0.4 * Math.min(h.f.maxHp - h.f.hp, 3000);
      else if (prof.allyRelevant) p += 600;
      if ((prof.pushes || prof.pulls) && h.f.id !== caster.id && h.f.canBePushed) {
        const r = computeForcedMove(grid, occAfter, {
          kind: prof.pushes ? 'push' : 'pull',
          casterCell: cand.m.cell,
          targetedCell: prof.pushFromCaster ? h.cell : cand.c,
          targetCell: h.cell,
          force: prof.pushes ? prof.pushForce : prof.pullForce,
        });
        if (r.endsInSpikes) p -= 5000;
      }
    }
  }
  if (prof.selfOnly) p += 500;
  if (prof.teleportsCaster && gifts.includes(cand.c)) p += w.giftTaken;
  if (prof.unique) p -= 1000;
  return p;
}

/**
 * Macro-actions « finir le tour en se déplaçant vers m » : les ``count`` meilleures positions selon le score
 * positionnel rapide (pics, bord, lignes de la Mama, menace), plus les cadeaux atteignables et la case marquée de
 * l'objectif ; jamais d'entrée volontaire dans les pics, jamais de traversée.
 */
export function generateEndMoves(fight: GladiatroolFight, count: number, w: PlannerWeights): MacroAction[] {
  const caster = fight.getCurrentFighter();
  if (!caster || !fight.isPlayerTurn() || fight.state.pendingChoices.length || caster.mp <= 0 || count <= 0) return [];
  const { reach, safe } = castPositions(fight, caster);
  const posCtx = positionContext(fight);
  const here = cellPositionScore(fight, caster, caster.cell, w, posCtx);
  const scored: { m: Pos; s: number; forced: boolean }[] = [];
  const sc = fight.scenario;
  for (const m of safe) {
    if (m.cell === caster.cell) continue;
    const s = cellPositionScore(fight, caster, m.cell, w, posCtx) - 20 * m.cost;
    const forced = posCtx.gifts.includes(m.cell) || (sc.markedCell === m.cell && sc.turnOf === caster.id);
    scored.push({ m, s, forced });
  }
  scored.sort((a, b) => b.s - a.s || a.m.cost - b.m.cost);
  const out: MacroAction[] = [];
  const add = (m: Pos, s: number): void => {
    if (out.some((x) => x.from === m.cell)) return;
    out.push({
      path: reach.path(m.cell) ?? [],
      moveCost: m.cost,
      from: m.cell,
      spellLevelId: null,
      cell: -1,
      prior: s,
      key: `move@${m.cell}`,
    });
  };
  for (const x of scored) if (x.forced) add(x.m, x.s);
  let n = 0;
  for (const x of scored) {
    if (n >= count) break;
    if (x.forced) continue;
    if (x.s <= here && n >= 1) break;
    add(x.m, x.s);
    n++;
  }
  return out;
}

/** Réexport pratique (tests) : direction de lancer exacte. */
export { dir8Exact };
