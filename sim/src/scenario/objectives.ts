/**
 * Objectifs du Gladiatrool (ETUDE §7, N30 §5.3, SPEC §11.5) : codage DÉCLARATIF. Chaque objectif des données
 * (``scenario.objectives.list``) porte une condition typée (``condition.kind`` + paramètres, références ``$config``) ;
 * ce module l'évalue à partir des événements du moteur (morts, dommages, états, lancers), des débuts / fins de tour
 * des joueurs et de la fin du tour global. Les sorts-compteurs du client (30428…30555) ne sont pas réinterprétés.
 *
 * Validation → récompense, interprétée par le moteur à partir des DONNÉES : le joueur crédité lance le sort de
 * récompense de l'objectif (``rewardSpellLevel``) : Spell Manager 30626 au niveau du palier (chaque joueur apprend son
 * sort suivant, 3405 filtré par l'état d'archétype), Faveur de la Mama 30659 (−1 cran, −5 % DF ; plafond
 * ``boss.favourCap``), état « Objectif N Fini » sur l'entité de scénario → déclencheur EON posé par 30443 niv. 1 →
 * vote 3404 (liste 10 + N) dont le scénario remplit les options (choices.ts).
 *
 * Un seul objectif actif ; au plus ``objectives.maxCount``. La validation est différée au prochain point sûr (fin
 * d'action, de tour, début de tour global) pour ne pas interrompre la résolution d'un sort.
 *
 * Installation du suivi (lue dans les DONNÉES, ``trackingStartsAtActivation``) : le sort de l'objectif pose ses
 * déclencheurs soit immédiatement (déclencheur ``I`` : Meurtres en série, Faire le mur, Pas le temps de dire « Aïe »…),
 * soit au début du tour de chaque allié (``TB`` : Productivité, Toi par ici, Trous dans les Troolls, D'une pierre trois
 * coups, Quintuplé…). Un objectif voté pendant le tour d'un joueur ne compte donc, pour ces derniers, qu'à partir du
 * tour suivant d'un joueur. Les contrôles de fin de tour (Au coin !, Distance d'insécurité) sont posés dès l'activation.
 */
import { resolveConfigRef, type GameData, type ObjectiveData, type ObjectiveId } from '../data/index.js';
import { distance } from '../geometry/index.js';
import { resolveSpell, type Fighter, type FightState, type TriggerEvent } from '../engine/index.js';
import { requireScenario, type ScenarioState } from './scenarioState.js';

/** État « ennemiHasTriggeredCombatGlyph » posé par l'aura des pics sur le camp Def (sl80492). */
export const ENEMY_IN_SPIKES_STATE = 5902;
/** Bit de ``ScenarioState.flags`` : un ennemi est entré dans les pics pendant le tour. */
const FLAG_ENEMY_ENTERED = 1;
/** Bit de ``ScenarioState.flags`` : un allié est sorti des pics pendant le tour. */
const FLAG_ALLY_EXITED = 2;

// ---------------------------------------------------------------------------------------------
// Accès aux données
// ---------------------------------------------------------------------------------------------

const byIdCache = new WeakMap<GameData, Map<string, ObjectiveData>>();

export function objectiveById(data: GameData, id: ObjectiveId): ObjectiveData {
  let m = byIdCache.get(data);
  if (!m) {
    m = new Map(data.scenario.objectives.list.map((o) => [o.id, o]));
    byIdCache.set(data, m);
  }
  const o = m.get(id);
  if (!o) throw new Error(`Objectif inconnu : ${id}`);
  return o;
}

/** Les objectifs d'un palier (ordre des données : général, Acrobate, Dompteur, Magicien). */
export function objectivesOfTier(data: GameData, tier: number): ObjectiveData[] {
  return data.scenario.objectives.list.filter((o) => o.tier === tier);
}

/** État « Challenger » (5917) : l'allié dont c'est le tour, porteur des compteurs « pendant son tour ». */
const CHALLENGER_STATE = 5917;
/** Conditions contrôlées en fin de tour d'un allié (déclencheur TE posé dès l'activation). */
const TURN_END_CHECKS: ReadonlySet<string> = new Set(['allEnemiesInSpikes', 'eachMonsterNearAlly']);
const trackingCache = new WeakMap<GameData, Map<ObjectiveId, boolean>>();

/**
 * Le suivi de l'objectif est-il installé dès son activation ? Lu dans le niveau 1 du sort de l'objectif : vrai s'il
 * exécute immédiatement (déclencheur ``I``) un sous-sort de mise en place (792 / 2792) et, quand il pose l'état
 * Challenger au début du tour (``TB``), s'il le pose aussi immédiatement ; faux si tout passe par ``TB`` (suivi au
 * prochain début de tour d'un joueur). Les contrôles de fin de tour sont toujours actifs dès l'activation.
 */
export function trackingStartsAtActivation(data: GameData, obj: ObjectiveData): boolean {
  let m = trackingCache.get(data);
  if (!m) {
    m = new Map();
    trackingCache.set(data, m);
  }
  const hit = m.get(obj.id);
  if (hit !== undefined) return hit;
  let result: boolean;
  if (TURN_END_CHECKS.has(obj.condition.kind)) result = true;
  else {
    const effects = data.spells[String(obj.spellLevel)]?.effects ?? [];
    const immediate = (e: (typeof effects)[number]) => e.exec && e.triggers.includes('I');
    const setup = effects.some((e) => immediate(e) && (e.effectId === 792 || e.effectId === 2792) && !!e.subSpell);
    const challengerAtTb = effects.some((e) => e.exec && e.effectId === 950 && e.stateId === CHALLENGER_STATE && e.triggers.includes('TB'));
    const challengerNow = effects.some((e) => immediate(e) && e.effectId === 950 && e.stateId === CHALLENGER_STATE);
    result = setup && (!challengerAtTb || challengerNow);
  }
  m.set(obj.id, result);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Rôles
// ---------------------------------------------------------------------------------------------

/** Personnage joueur (archétype, pas une invocation). */
export function isPlayerCharacter(f: Fighter): boolean {
  return f.kind === 'archetype' && f.team === 'players' && !f.isSummon;
}

/** Ennemi des joueurs (camp Def : Troolls, Mama). */
export function isEnemy(f: Fighter): boolean {
  return f.team === 'monsters';
}

/** « Challenger » : le joueur dont c'est le tour (état 5917 du client), sinon null. */
export function challengerOf(state: FightState): Fighter | null {
  if (state.turnStage !== 'active') return null;
  const f = state.fighters[state.currentFighterId];
  return f && isPlayerCharacter(f) ? f : null;
}

/** Premier joueur vivant dans l'ordre de jeu. */
export function firstLivingPlayer(state: FightState, sc: ScenarioState): Fighter | null {
  for (const id of sc.playerIds) {
    const f = state.fighters[id];
    if (f && f.alive) return f;
  }
  return null;
}

/** Joueurs vivants. */
function livingPlayers(state: FightState, sc: ScenarioState): Fighter[] {
  const out: Fighter[] = [];
  for (const id of sc.playerIds) {
    const f = state.fighters[id];
    if (f && f.alive) out.push(f);
  }
  return out;
}

/** PV pleins (masque ``v100`` ; ``objectives.v100MeansFull`` : ≥ 100 %, sinon « > 100 % » impossible). */
function isFullHp(state: FightState, f: Fighter): boolean {
  return state.ctx.config.objectives.v100MeansFull ? f.hp >= f.maxHp : f.hp > f.maxHp;
}

/** Joueur à créditer : ``preferred`` s'il est un joueur vivant, sinon le Challenger, sinon le premier joueur vivant. */
function credit(state: FightState, sc: ScenarioState, preferred: Fighter | null | undefined): number {
  if (preferred && preferred.alive && isPlayerCharacter(preferred)) return preferred.id;
  const ch = challengerOf(state);
  if (ch && ch.alive) return ch.id;
  return firstLivingPlayer(state, sc)?.id ?? -1;
}

/**
 * Tueur retenu pour les objectifs de morts (Q18) : mort par poussée comptée si ``pushKillsCount`` ; mort par les
 * pics (lanceur = entité de scénario) attribuée au Challenger si ``glyphKillsCreditPlayer``, sinon à personne.
 */
function creditedKiller(
  state: FightState,
  ev: Extract<TriggerEvent, { type: 'death' }>,
  pushKillsCount: boolean,
  glyphKillsCreditPlayer: boolean,
): Fighter | null {
  if (ev.cause === 'pushDamage' && !pushKillsCount) return null;
  const k = ev.killerId >= 0 ? state.fighters[ev.killerId] : undefined;
  if (!k) return null;
  if (k.team === 'scenario') return glyphKillsCreditPlayer ? challengerOf(state) : null;
  return k;
}

// ---------------------------------------------------------------------------------------------
// Activation, validation, récompense
// ---------------------------------------------------------------------------------------------

function resetTurnTracking(sc: ScenarioState, turnOf: number): void {
  sc.turnOf = turnOf;
  sc.counter = 0;
  sc.ids = [];
  sc.flags = 0;
  sc.markedCell = -1;
}

/**
 * Active un objectif (vote, ou Empalé imposé à la mise en place) : compteurs remis à zéro. Le suivi « pendant le tour »
 * du joueur courant ne commence que si l'objectif pose ses déclencheurs immédiatement (``trackingStartsAtActivation``) ;
 * « Pas le temps de dire « Aïe » » marque alors aussitôt les ennemis à PV pleins (déclencheur ``I|TB`` de 30512).
 */
export function activateObjective(state: FightState, id: ObjectiveId): void {
  const sc = requireScenario(state);
  const obj = objectiveById(state.ctx.data, id);
  sc.active = id;
  sc.activatedTurn = state.turn;
  sc.armed = trackingStartsAtActivation(state.ctx.data, obj);
  resetTurnTracking(sc, sc.armed ? challengerOf(state)?.id ?? -1 : -1);
  if (sc.turnOf >= 0 && obj.condition.kind === 'killEnemyFullHpAtTurnStart') markFullHpEnemies(state, sc);
  sc.startCells = sc.playerIds.map(() => -1);
  sc.soleilOk = [];
  sc.designatedId = -1;
  sc.globalKills = 0;
  sc.mppOpen = false;
  sc.mppHit = [];
  sc.mppLost = [];
  if (state.logging) state.emit({ type: 'objectiveActivated', objectiveId: id, name: obj.name, tier: obj.tier });
}

/**
 * Valide l'objectif actif ``id`` (récompense différée au prochain point sûr : ``processPendingCompletion``) ; ``turn`` :
 * tour global de la validation (défaut : le tour courant).
 */
export function markObjectiveDone(state: FightState, sc: ScenarioState, id: ObjectiveId, creditedId: number, turn = state.turn): void {
  if (sc.active !== id || sc.pendingCompletion) return;
  sc.active = null;
  sc.pendingCompletion = { objectiveId: id, creditedId, turn };
}

/**
 * Valide immédiatement l'objectif actif (outil pour les tests, le planificateur et le débogage) puis applique sa
 * récompense. Renvoie faux s'il n'y a pas d'objectif actif.
 */
export function completeActiveObjective(state: FightState, creditedId = -1): boolean {
  const sc = requireScenario(state);
  if (!sc.active) return false;
  markObjectiveDone(state, sc, sc.active, creditedId >= 0 ? creditedId : credit(state, sc, null));
  processPendingCompletion(state);
  return true;
}

/**
 * Récompense d'un objectif validé : le joueur crédité (vivant, sinon le premier joueur vivant) lance le sort de
 * récompense des données. Au-delà de ``boss.favourCap`` objectifs, la Faveur de la Mama n'est plus réduite.
 */
export function processPendingCompletion(state: FightState): void {
  const sc = requireScenario(state);
  const pc = sc.pendingCompletion;
  if (!pc) return;
  sc.pendingCompletion = null;
  const data = state.ctx.data;
  const obj = objectiveById(data, pc.objectiveId);
  const count = sc.completed.length + 1;
  const turn = pc.turn ?? state.turn;
  sc.completed = [...sc.completed, { objectiveId: obj.id, name: obj.name, tier: obj.tier, turn, creditedId: pc.creditedId }];
  if (state.logging) {
    state.emit({ type: 'objectiveCompleted', objectiveId: obj.id, name: obj.name, tier: obj.tier, creditedId: pc.creditedId, count });
  }
  // combat terminé (dernier ennemi tué par le coup qui valide l'objectif) : validation enregistrée, pas de récompense
  if (state.phase === 'ended') return;
  const preferred = pc.creditedId >= 0 ? state.fighters[pc.creditedId] : null;
  const casterId = credit(state, sc, preferred);
  const caster = casterId >= 0 ? state.fighters[casterId]! : null;
  if (!caster || !state.ctx.hasSpell(obj.rewardSpellLevel)) return;
  const cap = state.ctx.config.boss.favourCap;
  const favourLevel = data.scenario.objectives.manager.reward.mamaFavourSpellLevels[0];
  const favourSpellId = favourLevel !== undefined ? data.spells[String(favourLevel)]?.spellId ?? -1 : -1;
  const skipFavour = cap !== null && count > cap;
  resolveSpell(state, caster, state.ctx.getSpell(obj.rewardSpellLevel), caster.cell, {
    depth: 1,
    effectFilter: skipFavour ? (e) => e.data.subSpell?.spellId !== favourSpellId : null,
  });
}

// ---------------------------------------------------------------------------------------------
// Événements du moteur
// ---------------------------------------------------------------------------------------------

/** Suivi « pendant le tour d'un allié » : le Challenger, si le suivi du tour lui est rattaché. */
function trackedChallenger(state: FightState, sc: ScenarioState): Fighter | null {
  const ch = challengerOf(state);
  return ch && sc.turnOf === ch.id ? ch : null;
}

/**
 * « Même pas mal » (30539 posé au début du tour de la Mama, 30541) : la Mama inflige des dommages (déclencheur CD) alors
 * qu'un allié a subi des dommages (5961) sans variation de PV depuis le début du tour de la Mama (5960 conservé).
 */
function checkBossWindow(state: FightState, sc: ScenarioState, id: ObjectiveId): void {
  for (const a of sc.mppHit) {
    if (sc.mppLost.includes(a)) continue;
    const f = state.fighters[a];
    markObjectiveDone(state, sc, id, credit(state, sc, f && f.isSummon ? state.fighters[f.summonerId] : f));
    return;
  }
}

/** Ferme la fenêtre « Même pas mal » (fin du tour de la Mama). */
export function closeBossWindow(_state: FightState, sc: ScenarioState): void {
  if (!sc.mppOpen) return;
  sc.mppOpen = false;
  sc.mppHit = [];
  sc.mppLost = [];
}

/** Observateur des événements du moteur (appelé par ``hooks.onTrigger``). */
export function objectivesOnTrigger(state: FightState, sc: ScenarioState, ev: TriggerEvent): void {
  const id = sc.active;
  if (!id) return;
  const obj = objectiveById(state.ctx.data, id);
  const c = obj.condition;
  const fighters = state.fighters;
  switch (ev.type) {
    case 'death': {
      const victim = fighters[ev.targetId];
      if (!victim || !isEnemy(victim)) return;
      switch (c.kind) {
        case 'victimHasState':
          if (victim.hasState(c.stateId)) markObjectiveDone(state, sc, id, credit(state, sc, fighters[ev.killerId]));
          return;
        case 'victimKilledByPushDamage':
          if (ev.cause === 'pushDamage') markObjectiveDone(state, sc, id, credit(state, sc, fighters[ev.killerId]));
          return;
        case 'killsBySameKillerInOwnTurn': {
          const ch = trackedChallenger(state, sc);
          if (!ch) return;
          const push = resolveConfigRef<boolean>(c.pushKillsCount, state.ctx.config);
          const glyph = resolveConfigRef<boolean>(c.glyphKillsCreditPlayer, state.ctx.config);
          if (creditedKiller(state, ev, push, glyph) !== ch) return;
          sc.counter += 1;
          if (sc.counter >= c.count) markObjectiveDone(state, sc, id, ch.id);
          return;
        }
        case 'killEnemyFullHpAtTurnStart': {
          const ch = trackedChallenger(state, sc);
          if (ch && sc.ids.includes(victim.id)) markObjectiveDone(state, sc, id, ch.id);
          return;
        }
        case 'deathsBetweenCasts': {
          const ch = trackedChallenger(state, sc);
          if (!ch) return;
          sc.counter += 1;
          if (sc.counter >= c.count) markObjectiveDone(state, sc, id, ch.id);
          return;
        }
        case 'killsByPlayersInGlobalTurn': {
          if (!sc.armed) return;
          const cfg = state.ctx.config.objectives;
          const k = creditedKiller(state, ev, cfg.pushKillsCount, cfg.glyphKillsCreditPlayer);
          if (!k || k.team !== 'players') return;
          sc.globalKills += 1;
          if (sc.globalKills >= c.count) markObjectiveDone(state, sc, id, credit(state, sc, k.isSummon ? fighters[k.summonerId] : k));
          return;
        }
        default:
          return;
      }
    }
    case 'damage': {
      if (c.kind === 'distinctEnemiesPushDamagedInTurn') {
        if (!ev.collision) return;
        const ch = trackedChallenger(state, sc);
        const t = fighters[ev.targetId];
        if (!ch || !t || !isEnemy(t) || sc.ids.includes(t.id)) return;
        sc.ids.push(t.id);
        if (sc.ids.length >= c.count) markObjectiveDone(state, sc, id, ch.id);
      } else if (c.kind === 'playerHitByBossWithoutHpLoss' && sc.mppOpen) {
        // D (5961) et VA (5960 perdu) sur les alliés, quelle que soit la source ; CD : la Mama inflige des dommages
        const t = fighters[ev.targetId];
        if (t && t.team === 'players') {
          if (!sc.mppHit.includes(t.id)) sc.mppHit.push(t.id);
          if (ev.amount > 0 && !sc.mppLost.includes(t.id)) sc.mppLost.push(t.id);
        }
        const src = fighters[ev.sourceId];
        if (src && src.monsterId === c.monsterId) checkBossWindow(state, sc, id);
      }
      return;
    }
    case 'heal': {
      // variation de PV (VA) : « Vie inchangée » perdue
      if (c.kind !== 'playerHitByBossWithoutHpLoss' || !sc.mppOpen || ev.amount <= 0) return;
      const t = fighters[ev.targetId];
      if (t && t.team === 'players' && !sc.mppLost.includes(t.id)) sc.mppLost.push(t.id);
      return;
    }
    case 'stateOn': {
      const t = fighters[ev.targetId];
      if (!t || !isEnemy(t)) return;
      if (c.kind === 'enemyEntersAndAllyExitsSpikesInTurn' && ev.stateId === c.enemyStateId) {
        const ch = trackedChallenger(state, sc);
        if (!ch) return;
        sc.flags |= FLAG_ENEMY_ENTERED;
        if (sc.flags === (FLAG_ENEMY_ENTERED | FLAG_ALLY_EXITED)) markObjectiveDone(state, sc, id, ch.id);
      } else if (c.kind === 'distinctEnemiesEnterSpikesInTurn' && ev.stateId === ENEMY_IN_SPIKES_STATE) {
        const ch = trackedChallenger(state, sc);
        if (!ch || sc.ids.includes(t.id)) return;
        sc.ids.push(t.id);
        if (sc.ids.length >= c.count) markObjectiveDone(state, sc, id, ch.id);
      }
      return;
    }
    case 'stateOff': {
      if (c.kind !== 'enemyEntersAndAllyExitsSpikesInTurn' || ev.stateId !== c.allyStateId) return;
      const t = fighters[ev.targetId];
      const ch = trackedChallenger(state, sc);
      if (!ch || !t || t.team !== 'players') return;
      sc.flags |= FLAG_ALLY_EXITED;
      if (sc.flags === (FLAG_ENEMY_ENTERED | FLAG_ALLY_EXITED)) markObjectiveDone(state, sc, id, ch.id);
      return;
    }
    case 'cast': {
      if (ev.depth !== 0) return;
      if (c.kind === 'castsInOwnTurn') {
        const ch = trackedChallenger(state, sc);
        if (!ch || ev.casterId !== ch.id) return;
        sc.counter += 1;
        if (sc.counter >= c.count) markObjectiveDone(state, sc, id, ch.id);
      } else if (c.kind === 'deathsBetweenCasts') {
        const ch = trackedChallenger(state, sc);
        if (ch && ev.casterId === ch.id) sc.counter = 0;
      }
      return;
    }
    default:
      return;
  }
}

// ---------------------------------------------------------------------------------------------
// Débuts et fins de tour
// ---------------------------------------------------------------------------------------------

/**
 * La Mama « pré-combat » est-elle exclue des objectifs à masque ``e5971`` ? État 5971 (T1–T6), ou tour global antérieur
 * à ``objectives.mamaCountsFromTurn`` (Q34 : au T7 elle compte, alors qu'elle attend encore sur 152).
 */
function preFightMama(state: FightState, sc: ScenarioState, f: Fighter, excludeStateId: number, fromTurn: number): boolean {
  return f.hasState(excludeStateId) || (f.id === sc.mamaId && state.turn < fromTurn);
}

/** Marque les ennemis vivants à PV pleins (« Pas le temps de dire « Aïe » », 30513 sur ``A,v100``). */
function markFullHpEnemies(state: FightState, sc: ScenarioState): void {
  for (const g of state.fighters) if (g.alive && isEnemy(g) && isFullHp(state, g) && !sc.ids.includes(g.id)) sc.ids.push(g.id);
}

/**
 * Ennemi le plus éloigné du joueur (hors Mama pré-combat, ``preFightMama``) : sa case, −1 si aucun ; égalité : ordre
 * des ids. La Mama qui attend sur 152 sans l'état 5971 (T7) compte (ETUDE §6.3, masque ``e5971`` de 30451).
 */
function farthestEnemyCell(state: FightState, sc: ScenarioState, from: Fighter, excludeStateId: number): number {
  let best = -1;
  let bestD = -1;
  const fromTurn = state.ctx.config.objectives.mamaCountsFromTurn;
  for (const f of state.fighters) {
    if (!f.alive || !isEnemy(f) || f.cell < 0 || preFightMama(state, sc, f, excludeStateId, fromTurn)) continue;
    const d = distance(from.cell, f.cell);
    if (d > bestD) {
      bestD = d;
      best = f.cell;
    }
  }
  return best;
}

/** Début du tour d'un combattant (après la procédure du moteur). */
export function objectivesOnTurnStart(state: FightState, sc: ScenarioState, f: Fighter): void {
  if (isPlayerCharacter(f)) {
    resetTurnTracking(sc, f.id);
    const id = sc.active;
    if (!id) return;
    sc.armed = true;
    const c = objectiveById(state.ctx.data, id).condition;
    switch (c.kind) {
      case 'allPlayersEndTurnOnStartCell': {
        const i = sc.playerIndex(f.id);
        if (i >= 0) sc.startCells[i] = f.cell;
        return;
      }
      case 'endTurnOnMarkedCell': {
        sc.markedCell = farthestEnemyCell(state, sc, f, c.excludeStateId);
        if (sc.markedCell >= 0 && state.logging) {
          state.emit({
            type: 'objectiveInfo',
            objectiveId: id,
            message: `« Tout le monde veut prendre sa place » : ${f.name} doit finir son tour sur la case ${sc.markedCell}.`,
          });
        }
        return;
      }
      case 'killEnemyFullHpAtTurnStart': {
        markFullHpEnemies(state, sc);
        return;
      }
      default:
        return;
    }
  }
  if (sc.active && f.id === sc.mamaId) {
    const c = objectiveById(state.ctx.data, sc.active).condition;
    if (c.kind === 'playerHitByBossWithoutHpLoss') {
      // 30539 posé au début de son tour : « Vie inchangée » sur les alliés (après le Rassemblement, ordre supposé)
      sc.mppOpen = true;
      sc.mppHit = [];
      sc.mppLost = [];
    } else if (c.kind === 'allPlayersGrabbedBySameRassemblement') {
      // l'état Grabbed (durée 1 de la Mama) du Rassemblement précédent a été retiré par le décompte, avant les TB
      const players = livingPlayers(state, sc);
      if (players.length > 0 && players.every((p) => p.hasState(c.stateId))) {
        markObjectiveDone(state, sc, sc.active, players[0]!.id);
      }
    }
  }
}

/** Fin du tour d'un combattant (après la procédure du moteur). */
export function objectivesOnTurnEnd(state: FightState, sc: ScenarioState, f: Fighter): void {
  if (f.id === sc.mamaId) closeBossWindow(state, sc);
  if (!isPlayerCharacter(f)) return;
  const id = sc.active;
  if (id && sc.turnOf === f.id) {
    const c = objectiveById(state.ctx.data, id).condition;
    switch (c.kind) {
      case 'allPlayersEndTurnOnStartCell': {
        const i = sc.playerIndex(f.id);
        if (i >= 0 && sc.startCells[i]! >= 0 && f.alive && f.cell === sc.startCells[i] && !sc.soleilOk.includes(f.id)) {
          sc.soleilOk.push(f.id);
        }
        break;
      }
      case 'endTurnOnMarkedCell':
        if (sc.markedCell >= 0 && f.alive && f.cell === sc.markedCell) markObjectiveDone(state, sc, id, f.id);
        break;
      case 'eachMonsterNearAlly':
        if (eachMonsterNearAlly(state, c.monsterId, c.maxDistance)) markObjectiveDone(state, sc, id, f.id);
        break;
      case 'allEnemiesInSpikes': {
        const fromTurn = resolveConfigRef<number>(c.bossCountsFromTurn, state.ctx.config);
        if (allEnemiesInSpikes(state, sc, c.stateId, c.excludeStateId, fromTurn)) markObjectiveDone(state, sc, id, f.id);
        break;
      }
      default:
        break;
    }
  }
  const i = sc.playerIndex(f.id);
  if (i >= 0 && sc.startCells[i] !== undefined) sc.startCells[i] = -1;
  if (sc.turnOf === f.id) resetTurnTracking(sc, -1);
}

/** Chaque monstre ``monsterId`` vivant est à ``maxDistance`` cases au plus d'un allié des joueurs (vrai par vacuité). */
function eachMonsterNearAlly(state: FightState, monsterId: number, maxDistance: number): boolean {
  for (const m of state.fighters) {
    if (!m.alive || m.monsterId !== monsterId || m.team !== 'monsters' || m.cell < 0) continue;
    let near = false;
    for (const a of state.fighters) {
      if (a.alive && a.team === 'players' && a.cell >= 0 && distance(a.cell, m.cell) <= maxDistance) {
        near = true;
        break;
      }
    }
    if (!near) return false;
  }
  return true;
}

/**
 * Tous les ennemis vivants portent ``stateId`` (dans les pics), sauf la Mama « pré-combat » (état ``excludeStateId``,
 * ou tour global < ``bossFromTurn``) ; vrai par vacuité.
 */
function allEnemiesInSpikes(state: FightState, sc: ScenarioState, stateId: number, excludeStateId: number, bossFromTurn: number): boolean {
  for (const f of state.fighters) {
    if (!f.alive || !isEnemy(f)) continue;
    if (preFightMama(state, sc, f, excludeStateId, bossFromTurn)) continue;
    if (!f.hasState(stateId)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Fin du tour global (30710 « Objectif Check »)
// ---------------------------------------------------------------------------------------------

/** Contrôles de fin du tour global (avant le début du suivant), puis remises à zéro des compteurs du tour global. */
export function objectivesOnGlobalTurnEnd(state: FightState, sc: ScenarioState): void {
  const id = sc.active;
  if (id) {
    const c = objectiveById(state.ctx.data, id).condition;
    const players = livingPlayers(state, sc);
    const first = players[0]?.id ?? -1;
    // appelé au début du tour global suivant (state.turn déjà incrémenté) : la validation date du tour qui s'achève
    const turn = Math.max(0, state.turn - 1);
    const done = (credited: number) => markObjectiveDone(state, sc, id, credited, turn);
    switch (c.kind) {
      case 'allPlayersEndTurnOnStartCell':
        if (players.length > 0 && players.every((p) => sc.soleilOk.includes(p.id))) done(first);
        break;
      case 'noAliveMonster':
        if (!state.fighters.some((f) => f.alive && f.team === 'monsters' && f.monsterId === c.monsterId)) {
          done(first);
        }
        break;
      case 'designatedAllyFullHp': {
        const d = sc.designatedId >= 0 ? state.fighters[sc.designatedId] : undefined;
        const full = resolveConfigRef<boolean>(c.fullHp, state.ctx.config);
        if (d && d.alive && (full ? d.hp >= d.maxHp : d.hp > d.maxHp)) {
          done(d.id);
          break;
        }
        designateAlly(state, sc, c.designationThresholdsPct, players);
        break;
      }
      case 'noPlayerAtOrBelowHpPct':
        if (players.length > 0 && players.every((p) => p.hp * 100 > c.pct * p.maxHp)) done(first);
        break;
      case 'bossAliveWithoutAllies': {
        const mama = sc.mamaId >= 0 ? state.fighters[sc.mamaId] : undefined;
        const before = resolveConfigRef<boolean>(c.beforeArrival, state.ctx.config);
        const arrived = !!mama && mama.cell !== state.ctx.data.boss.waitCell;
        if (
          mama &&
          mama.alive &&
          mama.monsterId === c.monsterId &&
          (before || arrived) &&
          !state.fighters.some((f) => f.alive && f.team === 'monsters' && f !== mama)
        ) {
          done(first);
        }
        break;
      }
      default:
        break;
    }
  }
  sc.soleilOk = [];
  sc.globalKills = 0;
}

/** « Sauvez-le ! » : désigne le premier joueur à ≤ 10 % de PV, sinon ≤ 20 %, … ≤ 90 %, sinon le premier joueur vivant. */
function designateAlly(state: FightState, sc: ScenarioState, thresholds: readonly number[], players: Fighter[]): void {
  let chosen: Fighter | null = null;
  for (const t of thresholds) {
    chosen = players.find((p) => p.hp * 100 <= t * p.maxHp) ?? null;
    if (chosen) break;
  }
  chosen ??= players[0] ?? null;
  sc.designatedId = chosen ? chosen.id : -1;
  if (chosen && state.logging && sc.active) {
    state.emit({
      type: 'objectiveInfo',
      objectiveId: sc.active,
      message: `« Sauvez-le ! » : ${chosen.name} est désigné (${chosen.hp} / ${chosen.maxHp} PV).`,
    });
  }
}
