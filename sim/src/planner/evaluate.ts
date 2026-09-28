/**
 * Évaluation statique d'un état de combat du point de vue des joueurs (plus c'est haut, mieux c'est), rapide
 * (≈ quelques µs : aucune simulation) et à POIDS PARAMÉTRABLES (``PlannerWeights``, weights.ts). Inspirée de
 * l'ÉTUDE §10.2 (principes autour des pics) :
 *
 * - **monstres** : PV restants divisés par le multiplicateur « durable » attendu (×2 dans les pics ; ×1,6 dehors, car
 *   ils seront probablement poussés plus tard : frapper une cible non multipliée gaspille des dégâts), dégâts de
 *   début de tour dans les pics déduits (1 000 × multiplicateurs), valeur de présence par type retirée à la mort ;
 *   un monstre qui mourra seul au début de son tour dans les pics compte comme (presque) mort ;
 * - **menace** du prochain passage des monstres : chaque monstre vise le joueur atteignable le plus exposé
 *   (multiplicateur reçu, puis PV) ; dégâts par type (``monsterThreat``) × DF du monstre, réduits dans les pics, pour
 *   un monstre hors de portée, et selon le nombre de tours de joueurs qui passent avant le sien ; risque de mort
 *   (sigmoïde), risque d'être poussé dans les pics ;
 * - **joueurs** : PV, morts, position (pics, bord, lignes de la Mama au tour qui précède son arrivée et après),
 *   boosts futurs (PA / PM / DF…), sorts uniques gardés ;
 * - **objectifs** (validés, progression du compteur, condition déjà remplie), **cadeaux** ramassés, **Mama**
 *   (fenêtre de burst ouverte : arrivée, dans les pics, vulnérable).
 *
 * Toutes les lectures passent par l'état public (combattants, buffs, scénario) : l'évaluation ne modifie rien.
 */
import { resolveConfigRef } from '../data/index.js';
import {
  activeThreshold,
  multiplierApplies,
  Stat,
  type Buff,
  type Fighter,
  type FightState,
  type HitContext,
  defaultHitContext,
} from '../engine/index.js';
import { AXIS_DIRECTIONS, distance, inLine, nextCell, type MapGrid } from '../geometry/index.js';
import {
  ENEMY_IN_SPIKES_STATE,
  giftCells,
  isPlayerCharacter,
  objectiveById,
  type GladiatroolFight,
  type ScenarioState,
} from '../scenario/index.js';
import { monsterSpellReach } from './spellInfo.js';
import { DEFAULT_WEIGHTS, mergeWeights, type PlannerWeights } from './weights.js';

export { DEFAULT_WEIGHTS, mergeWeights, type PlannerWeights, type UniqueHoldValue } from './weights.js';

/** État « joueur dans les pics » (aura 30390, camp Atq). */
export const PLAYER_IN_SPIKES_STATE = 5903;
/** État « Mama pré-combat » (5971) : ni ciblable, ni menaçante. */
export const MAMA_PREFIGHT_STATE = 5971;

// ---------------------------------------------------------------------------------------------
// Aides géométriques et de lecture
// ---------------------------------------------------------------------------------------------

const kCache = new WeakMap<MapGrid, Int8Array>();

/**
 * k = nombre de pas en ligne (meilleure des 4 directions axiales) pour atteindre le premier pic (ÉTUDE §3.8), sans
 * tenir compte des entités ; 0 sur une case de pics, 99 hors carte.
 */
export function spikeDistance(grid: MapGrid, cell: number): number {
  let t = kCache.get(grid);
  if (!t) {
    t = new Int8Array(560).fill(99);
    for (let c = 0; c < 560; c++) {
      if (!grid.isWalkable(c)) continue;
      if (grid.isSpike(c)) {
        t[c] = 0;
        continue;
      }
      let best = 99;
      for (const d of AXIS_DIRECTIONS) {
        let cur = c;
        for (let n = 1; n < 20; n++) {
          cur = nextCell(cur, d);
          if (cur < 0 || !grid.isWalkable(cur)) break;
          if (grid.isSpike(cur)) {
            best = Math.min(best, n);
            break;
          }
        }
      }
      t[c] = best;
    }
    kCache.set(grid, t);
  }
  return cell >= 0 && cell < 560 ? t[cell]! : 99;
}

const ENEMY_HIT: HitContext = defaultHitContext({ element: 4 });

/** Multiplicateur de dommages reçus (100 = neutre) d'un coup de sort ennemi ordinaire : produit des 1163 actifs. */
export function damageMultiplier(f: Fighter): number {
  let m = 100;
  const buffs: readonly Buff[] = f.buffs;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i]!;
    if (!b.active || b.kind !== 'multiplier') continue;
    if (multiplierApplies(b.triggers, ENEMY_HIT)) m = Math.trunc(m * b.value * 0.01);
  }
  return m;
}

/** Monstre dans les pics (état 5902 posé par l'aura, ou case de pics). */
export function monsterInSpikes(state: FightState, f: Fighter): boolean {
  return f.hasState(ENEMY_IN_SPIKES_STATE) || (f.cell >= 0 && state.ctx.grid.isSpike(f.cell));
}

/** Joueur dans les pics. */
export function playerInSpikes(state: FightState, f: Fighter): boolean {
  return f.cell >= 0 && state.ctx.grid.isSpike(f.cell);
}

/** Informations sur la Mama : arrivée, en attente, arrivée au prochain tour global (case prévue). */
export interface MamaInfo {
  mama: Fighter | null;
  arrived: boolean;
  /** La Mama arrive au début du prochain tour global (tour ≥ arrivée − 1, encore en attente). */
  arrivesNext: boolean;
  /** Case d'où partira le Rassemblement : sa case (arrivée) ou sa case d'arrivée prévue ; −1 sinon. */
  lineCell: number;
}

export function mamaInfo(state: FightState, sc: ScenarioState): MamaInfo {
  const mama = sc.mamaId >= 0 ? state.fighters[sc.mamaId] ?? null : null;
  const data = state.ctx.data.boss;
  if (!mama || !mama.alive) return { mama: null, arrived: false, arrivesNext: false, lineCell: -1 };
  const arrived = mama.cell >= 0 && mama.cell !== data.waitCell;
  if (arrived) return { mama, arrived, arrivesNext: false, lineCell: mama.cell };
  const arrivalTurn = data.arrival.resultingGlobalTurn;
  const arrivesNext = state.turn >= arrivalTurn - 1;
  let lineCell = -1;
  if (arrivesNext) {
    const target = data.arrival.targetCell;
    lineCell = target;
    const occ = state.fighterAt(target);
    if (occ && occ.id !== mama.id) {
      const fb = state.ctx.config.boss.arrivalFallback.find((x): x is number => typeof x === 'number');
      if (fb !== undefined && !state.isOccupied(fb)) lineCell = fb;
      else lineCell = -1;
    }
  }
  return { mama, arrived, arrivesNext, lineCell };
}

/** Mama pas encore arrivée (hors combat : ni PV utiles, ni menace avant le tour d'arrivée). */
export function isPreFightMama(state: FightState, sc: ScenarioState, f: Fighter): boolean {
  return f.id === sc.mamaId && (f.hasState(MAMA_PREFIGHT_STATE) || f.cell === state.ctx.data.boss.waitCell);
}

/** Ennemis ciblables (monstres vivants sur la carte, hors Mama pré-combat). */
export function targetableEnemies(state: FightState, sc: ScenarioState): Fighter[] {
  const out: Fighter[] = [];
  for (const f of state.fighters) {
    if (f.alive && f.team === 'monsters' && f.cell >= 0 && !isPreFightMama(state, sc, f)) out.push(f);
  }
  return out;
}

/** Nombre de lancers directs du combattant pendant son tour en cours. */
export function castsThisTurn(f: Fighter): number {
  let n = 0;
  for (const r of f.casts) n += r.turnCasts;
  return n;
}

/** Tour « Pense Vite » (durée de tour ``spells.penseVite.turnSeconds``) : lancers plafonnés. */
export function penseViteCastsLeft(state: FightState, f: Fighter): number {
  const pv = state.ctx.config.spells.penseVite;
  if (f.turnSeconds !== pv.turnSeconds) return Infinity;
  return Math.max(0, pv.maxCasts - castsThisTurn(f));
}

// ---------------------------------------------------------------------------------------------
// Détail (explications)
// ---------------------------------------------------------------------------------------------

export interface ThreatDetail {
  playerId: number;
  /** Dégâts attendus au prochain passage des monstres (avant boucliers). */
  expectedDamage: number;
  shield: number;
  hp: number;
  /** Probabilité (heuristique) de mourir avant son prochain tour. */
  deathRisk: number;
  pushRisk: boolean;
  inSpikes: boolean;
  onMamaLine: boolean;
  edgeK: number;
}

export interface EvalDetail {
  /** Monstres qui mourront seuls au début de leur tour dans les pics. */
  dyingInSpikes: number[];
  threats: ThreatDetail[];
  mamaWindowOpen: boolean;
  /** Cellule du Rassemblement à venir (−1 : aucune). */
  mamaLineCell: number;
  /** Termes du score (pour le débogage et l'interface). */
  terms: Record<string, number>;
}

// ---------------------------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------------------------

function sigmoid(x: number): number {
  if (x > 30) return 1;
  if (x < -30) return 0;
  return 1 / (1 + Math.exp(-x));
}

/** Tours de joueurs vivants qui passent avant le prochain tour du combattant à l'index ``j`` de la timeline. */
function playersBefore(state: FightState, playerIds: readonly number[], cur: number, j: number): number {
  const tl = state.timeline;
  let n = 0;
  const isLivingPlayer = (id: number): boolean => {
    const f = state.fighters[id];
    return !!f && f.alive && playerIds.includes(id);
  };
  if (j > cur) {
    for (let i = cur + 1; i < j; i++) if (isLivingPlayer(tl[i]!)) n++;
  } else {
    for (let i = cur + 1; i < tl.length; i++) if (isLivingPlayer(tl[i]!)) n++;
    for (let i = 0; i < j; i++) if (isLivingPlayer(tl[i]!)) n++;
  }
  return n;
}

/** Joueurs vivants qui jouent encore dans le tour global courant (après le combattant courant). */
export function playersStillToPlay(state: FightState, playerIds: readonly number[]): number {
  const tl = state.timeline;
  let n = 0;
  for (let i = Math.max(0, state.timelineIndex + 1); i < tl.length; i++) {
    const f = state.fighters[tl[i]!];
    if (f && f.alive && playerIds.includes(f.id)) n++;
  }
  return n;
}

/** Valeur (PV équivalents) des boosts futurs portés par un joueur. */
function futureBuffValue(p: Fighter, currentActorId: number, w: PlannerWeights, state: FightState): number {
  let v = 0;
  for (const b of p.buffs) {
    if (b.kind !== 'stat' || b.value <= 0) continue;
    const caster = state.fighters[b.casterId];
    if (!caster || caster.team !== 'players') continue;
    let unit = 0;
    let amount = b.value;
    switch (b.stat) {
      case Stat.AP:
        unit = w.apFutureValue;
        amount = Math.min(amount, w.apFutureCap);
        break;
      case Stat.MP:
        unit = w.mpFutureValue;
        amount = Math.min(amount, 6);
        break;
      case Stat.FINAL_DAMAGE:
        unit = w.finalDamageFutureValue;
        break;
      case Stat.CRIT:
        unit = w.critFutureValue;
        break;
      case Stat.RANGE:
        unit = w.rangeFutureValue;
        break;
      default:
        continue;
    }
    const permanent = b.duration < 0 || b.duration >= 63;
    let turns = permanent ? 2 : b.delay > 0 ? b.duration : b.casterId === p.id && p.id === currentActorId ? b.duration - 1 : b.duration;
    if (b.untilTurnEnd) turns = 0;
    turns = Math.max(0, Math.min(2, turns));
    if (turns <= 0) continue;
    v += Math.min(w.buffValueCap, unit * amount * turns);
  }
  return v;
}

/** Condition d'un objectif de fin de tour / de tour global déjà remplie (heuristique pour guider la recherche). */
function objectivePending(state: FightState, sc: ScenarioState, actorId: number): number {
  if (!sc.active) return 0;
  const o = objectiveById(state.ctx.data, sc.active);
  const c = o.condition;
  switch (c.kind) {
    case 'noAliveMonster':
      return state.fighters.some((f) => f.alive && f.monsterId === c.monsterId && f.team === 'monsters') ? 0 : 1;
    case 'eachMonsterNearAlly': {
      for (const m of state.fighters) {
        if (!m.alive || m.monsterId !== c.monsterId || m.team !== 'monsters') continue;
        let ok = false;
        for (const p of state.fighters) {
          if (p.alive && p.team === 'players' && p.cell >= 0 && distance(p.cell, m.cell) <= c.maxDistance) {
            ok = true;
            break;
          }
        }
        if (!ok) return 0;
      }
      return 1;
    }
    case 'allEnemiesInSpikes': {
      const fromTurn = resolveConfigRef<number>(c.bossCountsFromTurn, state.ctx.config);
      let any = false;
      for (const f of state.fighters) {
        if (!f.alive || f.team !== 'monsters' || f.cell < 0) continue;
        if (f.hasState(c.excludeStateId) || (f.id === sc.mamaId && state.turn < fromTurn)) continue;
        any = true;
        if (!f.hasState(c.stateId)) return 0;
      }
      return any ? 1 : 0.5;
    }
    case 'endTurnOnMarkedCell': {
      const a = state.fighters[actorId];
      return a && sc.markedCell >= 0 && a.cell === sc.markedCell && sc.turnOf === actorId ? 1 : 0;
    }
    case 'noPlayerAtOrBelowHpPct': {
      for (const id of sc.playerIds) {
        const p = state.fighters[id]!;
        if (p.alive && p.hp * 100 <= c.pct * p.maxHp) return 0;
      }
      return 0.5;
    }
    case 'bossAliveWithoutAllies': {
      const mama = state.fighters[sc.mamaId];
      if (!mama || !mama.alive) return 0;
      return state.fighters.some((f) => f.alive && f.team === 'monsters' && f.id !== sc.mamaId) ? 0 : 1;
    }
    default:
      return 0;
  }
}

/** Progression (0-1) du compteur de l'objectif actif pendant le tour en cours. */
function objectiveProgress(state: FightState, sc: ScenarioState): number {
  if (!sc.active || !sc.armed) return 0;
  const c = objectiveById(state.ctx.data, sc.active).condition;
  switch (c.kind) {
    case 'castsInOwnTurn':
    case 'killsBySameKillerInOwnTurn':
    case 'deathsBetweenCasts':
      return Math.min(1, sc.counter / c.count) * 0.8;
    case 'distinctEnemiesPushDamagedInTurn':
    case 'distinctEnemiesEnterSpikesInTurn':
      return Math.min(1, sc.ids.length / c.count) * 0.8;
    case 'enemyEntersAndAllyExitsSpikesInTurn':
      return ((sc.flags & 1 ? 1 : 0) + (sc.flags & 2 ? 1 : 0)) * 0.4;
    case 'killsByPlayersInGlobalTurn':
      return Math.min(1, sc.globalKills / c.count) * 0.8;
    default:
      return 0;
  }
}

/**
 * Score de l'état (points « PV équivalents », à maximiser). ``detail`` (optionnel) reçoit le détail utile aux
 * explications (menaces par joueur, monstres condamnés, fenêtre de la Mama, termes).
 */
export function evaluateState(fight: GladiatroolFight, weights: PlannerWeights = DEFAULT_WEIGHTS, detail?: EvalDetail): number {
  const state = fight.state;
  const sc = fight.scenario;
  const w = weights;
  const cfg = state.ctx.config;
  const grid = state.ctx.grid;
  const fighters = state.fighters;
  const playerIds = sc.playerIds;
  const actorId = state.turnStage === 'active' ? state.currentFighterId : -1;
  const cur = state.timelineIndex;
  const mi = mamaInfo(state, sc);
  const terms = detail ? detail.terms : null;

  if (state.phase === 'ended') {
    // fin du combat : victoire / défaite dominent tout le reste
    if (state.winner === 'players') return 1e7;
    if (state.winner === 'monsters') return -1e7;
  }

  let monsterScore = 0;
  let threatScore = 0;
  let playerScore = 0;
  let positionScore = 0;
  let objectiveScore = 0;
  let resourceScore = 0;
  let mamaScore = 0;

  // ------------------------------------------------------------------ joueurs : multiplicateurs, cumul des menaces
  const np = playerIds.length;
  const expected = new Float64Array(np);
  const pushRisk = new Float64Array(np);
  const pmult = new Float64Array(np);
  const pres = new Float64Array(np);
  for (let i = 0; i < np; i++) {
    const p = fighters[playerIds[i]!]!;
    if (!p.alive) continue;
    pmult[i] = damageMultiplier(p) / 100;
    const res = Math.min(50, Math.max(0, p.stat(Stat.RES_ALL) + p.stat(Stat.RES_NEUTRAL)));
    pres[i] = 1 - res / 100;
  }

  // ------------------------------------------------------------------ monstres
  const spikeTickRaw = cfg.spikes.monsterTurnStartDamageRaw;
  const tlIndex = new Map<number, number>();
  for (let i = 0; i < state.timeline.length; i++) tlIndex.set(state.timeline[i]!, i);
  for (const m of fighters) {
    if (!m.alive || m.team !== 'monsters' || m.cell < 0 || m.isSummon) continue;
    const isMama = m.id === sc.mamaId;
    const pre = isMama && !mi.arrived;
    if (!pre) {
      const mult = damageMultiplier(m) / 100;
      const inSpikes = monsterInSpikes(state, m);
      const futureMult = isMama || inSpikes ? w.futureMultInSpikes : w.futureMultOutside;
      const alive = w.monsterAlive[String(m.monsterId)] ?? w.monsterAliveDefault;
      const tick = inSpikes && !isMama ? spikeTickRaw * mult : 0;
      if (tick > 0 && m.hp <= tick) {
        monsterScore -= (1 - w.spikeDeathConfidence) * (alive + (w.monsterHp * m.hp) / futureMult);
        detail?.dyingInSpikes.push(m.id);
        continue;
      }
      monsterScore -= alive + (w.monsterHp * Math.max(0, m.hp - tick)) / futureMult;
      if (isMama && inSpikes && !m.invulnerable) {
        const left = playersStillToPlay(state, playerIds);
        mamaScore += w.mamaWindow * Math.min(1, left / 3);
        if (detail) detail.mamaWindowOpen = true;
      }
    } else if (!mi.arrivesNext) continue;

    // menace de ce monstre au prochain passage
    let base = (w.monsterThreat[String(m.monsterId)] ?? w.monsterThreatDefault) * Math.max(0, 100 + m.stat(Stat.FINAL_DAMAGE)) / 100;
    if (!pre && !isMama && monsterInSpikes(state, m)) base *= w.threatInSpikesFactor;
    if (base <= 0) continue;
    const from = pre ? mi.lineCell : m.cell;
    if (from < 0) continue;
    const j = tlIndex.get(m.id);
    const n = j === undefined ? np : playersBefore(state, playerIds, cur, j);
    const decay = Math.max(w.threatDecayFloor, Math.pow(w.threatDecay, n));
    const reach = m.maxMp + monsterSpellReach(state.ctx, m.monsterId);
    let best = -1;
    let bestKey = -Infinity;
    let nearest = -1;
    let nearestD = Infinity;
    for (let i = 0; i < np; i++) {
      const p = fighters[playerIds[i]!]!;
      if (!p.alive || p.cell < 0) continue;
      const d = distance(from, p.cell);
      if (d < nearestD) {
        nearestD = d;
        nearest = i;
      }
      if (d > reach) continue;
      const key = pmult[i]! * pres[i]! * 1e6 - (p.hp + p.shield);
      if (key > bestKey) {
        bestKey = key;
        best = i;
      }
    }
    if (best >= 0) {
      expected[best] += base * pmult[best]! * pres[best]! * decay;
      const push = w.monsterPush[String(m.monsterId)] ?? 0;
      const p = fighters[playerIds[best]!]!;
      if (push > 0 && !playerInSpikes(state, p) && spikeDistance(grid, p.cell) <= push) pushRisk[best] += w.pushRisk * decay;
    } else if (nearest >= 0) {
      expected[nearest] += base * w.threatUnreachableFactor * pmult[nearest]! * pres[nearest]! * decay;
    }
  }

  // ------------------------------------------------------------------ joueurs
  for (let i = 0; i < np; i++) {
    const p = fighters[playerIds[i]!]!;
    if (!p.alive) {
      playerScore -= w.playerDeath;
      continue;
    }
    playerScore += w.playerHp * p.hp;
    const shield = p.shield;
    const loss = Math.max(0, expected[i]! - shield);
    threatScore -= w.threatWeight * Math.min(loss, p.hp);
    const immortal = activeThreshold(p) > 0;
    const risk = immortal ? 0 : sigmoid((loss - p.hp) / w.deathRiskScale);
    threatScore -= w.playerDeath * w.deathRiskWeight * risk;
    threatScore -= pushRisk[i]!;
    const inSp = playerInSpikes(state, p);
    const k = spikeDistance(grid, p.cell);
    if (inSp) positionScore -= w.playerInSpikes;
    else if (k < 3) positionScore -= w.playerEdge * (3 - k);
    let onLine = false;
    if (mi.lineCell >= 0 && p.cell >= 0) {
      if (p.cell === mi.lineCell) {
        positionScore -= w.mamaArrivalCell;
      } else if (inLine(p.cell, mi.lineCell)) {
        positionScore -= w.mamaLine;
        onLine = true;
      }
    }
    resourceScore += futureBuffValue(p, actorId, w, state);
    for (const s of p.spells) {
      if (!s.unique) continue;
      const hold = w.uniqueHold[String(s.spellLevelId)] ?? w.uniqueHoldDefault;
      if (state.turn <= hold.untilTurn) resourceScore += hold.value;
    }
    if (detail) {
      detail.threats.push({
        playerId: p.id,
        expectedDamage: Math.round(expected[i]!),
        shield,
        hp: p.hp,
        deathRisk: risk,
        pushRisk: pushRisk[i]! > 0,
        inSpikes: inSp,
        onMamaLine: onLine,
        edgeK: k,
      });
    }
  }

  // ------------------------------------------------------------------ objectifs, cadeaux
  const mamaAlive = !!mi.mama;
  objectiveScore += sc.completed.length * (w.objectiveCompleted + (mamaAlive ? w.objectiveFavour : 0));
  if (sc.active) {
    objectiveScore += w.objectiveProgress * objectiveProgress(state, sc);
    objectiveScore += w.objectiveCompleted * w.objectivePendingFactor * objectivePending(state, sc, actorId);
  }
  objectiveScore += sc.giftsTaken * w.giftTaken;

  if (detail) {
    detail.mamaLineCell = mi.lineCell;
    Object.assign(detail.terms, {
      monstres: monsterScore,
      menace: threatScore,
      joueurs: playerScore,
      position: positionScore,
      objectifs: objectiveScore,
      ressources: resourceScore,
      mama: mamaScore,
    });
  }
  void terms;
  return monsterScore + threatScore + playerScore + positionScore + objectiveScore + resourceScore + mamaScore;
}

/** Évaluation avec détail (explications, interface). */
export function evaluateWithDetail(fight: GladiatroolFight, weights: PlannerWeights = DEFAULT_WEIGHTS): { score: number; detail: EvalDetail } {
  const detail: EvalDetail = { dyingInSpikes: [], threats: [], mamaWindowOpen: false, mamaLineCell: -1, terms: {} };
  const score = evaluateState(fight, weights, detail);
  return { score, detail };
}

// ---------------------------------------------------------------------------------------------
// Score positionnel rapide d'une case (choix des positions de fin de tour)
// ---------------------------------------------------------------------------------------------

/**
 * Score positionnel approché d'une case pour le joueur ``p`` (sans simulation) : pics, bord, lignes de la Mama,
 * cadeau, case marquée de l'objectif, menace des monstres qui l'atteignent. Sert à présélectionner les positions de
 * fin de tour (qui sont ensuite simulées et évaluées par ``evaluateState``).
 */
export function cellPositionScore(
  fight: GladiatroolFight,
  p: Fighter,
  cell: number,
  w: PlannerWeights,
  ctx: { gifts: readonly number[]; mama: MamaInfo; monsters: readonly Fighter[] },
): number {
  const state = fight.state;
  const grid = state.ctx.grid;
  const sc = fight.scenario;
  let s = 0;
  if (grid.isSpike(cell)) s -= w.playerInSpikes;
  else {
    const k = spikeDistance(grid, cell);
    if (k < 3) s -= w.playerEdge * (3 - k);
  }
  const lc = ctx.mama.lineCell;
  if (lc >= 0) {
    if (cell === lc) s -= w.mamaArrivalCell;
    else if (inLine(cell, lc)) s -= w.mamaLine;
  }
  if (ctx.gifts.includes(cell)) s += w.giftTaken;
  if (sc.active && sc.markedCell === cell && sc.turnOf === p.id) s += w.objectiveCompleted * w.objectivePendingFactor;
  const pm = damageMultiplier(p) / 100;
  for (const m of ctx.monsters) {
    const reach = m.maxMp + monsterSpellReach(state.ctx, m.monsterId);
    if (distance(m.cell, cell) > reach) continue;
    let base = w.monsterThreat[String(m.monsterId)] ?? w.monsterThreatDefault;
    if (monsterInSpikes(state, m)) base *= w.threatInSpikesFactor;
    s -= 0.25 * w.threatWeight * base * pm;
    const push = w.monsterPush[String(m.monsterId)] ?? 0;
    if (push > 0 && !grid.isSpike(cell) && spikeDistance(grid, cell) <= push) s -= 0.5 * w.pushRisk;
  }
  return s;
}

/** Contexte partagé du score positionnel (cadeaux, Mama, monstres actifs). */
export function positionContext(fight: GladiatroolFight): { gifts: number[]; mama: MamaInfo; monsters: Fighter[] } {
  const state = fight.state;
  const sc = fight.scenario;
  return { gifts: giftCells(state, sc), mama: mamaInfo(state, sc), monsters: targetableEnemies(state, sc) };
}

/** Joueur (personnage) : réexport pratique. */
export { isPlayerCharacter };
