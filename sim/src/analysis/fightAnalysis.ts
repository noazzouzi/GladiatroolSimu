/**
 * Analyse a posteriori d'un combat (partie pure, sans API Node : utilisable dans un Web Worker) : la trace du
 * combat est REJOUÉE par l'API publique (``replayTrace``) avec le journal d'événements du moteur, puis les
 * événements sont dépouillés :
 *
 * - statistiques de fin de chaque tour global (PV ennemis restants sur la carte, ennemis et joueurs vivants, PV des
 *   joueurs, morts du tour, entrées en pics, objectifs cumulés) ;
 * - sorts des joueurs : lancers directs, PA, dégâts et morts d'ennemis dans la « fenêtre » du lancer (jusqu'à la
 *   prochaine action du même joueur : dégâts directs, collisions, dégâts d'entrée dans les pics compris) ;
 * - mises en pics : déplacements forcés (poussée, attirance, échange, avance) causés par un joueur qui font entrer
 *   un ennemi dans les pics (case d'arrivée, sort) ;
 * - vagues : monstres apparus, entrés en pics, tués, tués avant d'avoir joué, tués dans le tour d'apparition ;
 * - dégâts subis par les joueurs par type de monstre (pics compris).
 *
 * Aucune action n'est inventée : le rejeu refait exactement le combat (mêmes graine et configuration).
 */
import { gameData } from '../data/index.js';
import type { FightEvent } from '../engine/index.js';
import { replayTrace } from '../runner/trace.js';
import type { FightTrace } from '../runner/types.js';

/** État « dans les pics » (EON5902). */
export const IN_SPIKES_STATE = 5902;

export interface TurnSnapshot {
  /** Tour global (fin de ce tour). */
  t: number;
  /** PV restants des ennemis présents sur la carte (Troolls apparus vivants, Mama arrivée). */
  enemyHp: number;
  enemies: number;
  playersAlive: number;
  /** PV cumulés des joueurs vivants / PV max cumulés de toute l'équipe (0 à 1). */
  teamHpPct: number;
  /** Ennemis tués pendant ce tour global. */
  kills: number;
  /** Entrées d'ennemis dans les pics (EON5902) pendant ce tour global. */
  spikeEntries: number;
  /** Objectifs validés (cumul à la fin du tour). */
  objectives: number;
}

export interface SpellUse {
  archetype: string;
  spellId: number;
  name: string;
  casts: number;
  ap: number;
  /** PV ôtés aux ennemis dans la fenêtre du lancer. */
  damage: number;
  kills: number;
  /** Ennemis entrés dans les pics dans la fenêtre du lancer. */
  spikeEntries: number;
}

export interface WaveStat {
  wave: number;
  turn: number;
  spawned: number;
  /** Monstres entrés au moins une fois dans les pics. */
  enteredSpikes: number;
  killed: number;
  /** Tués avant leur premier tour de jeu. */
  killedBeforeActing: number;
  /** Tués pendant leur tour global d'apparition. */
  killedSameTurn: number;
  /** Morts sur une case de pics. */
  killedInSpikes: number;
}

export interface SpikePush {
  turn: number;
  archetype: string;
  spellId: number;
  /** Nom du sort (versions améliorée et de base confondues). */
  spell: string;
  kind: string;
  from: number;
  to: number;
  monster: string;
}

export interface FightAnalysis {
  compo: string;
  seed: number;
  victory: boolean;
  turnReached: number;
  /** Joueurs au départ. */
  players: number;
  turns: TurnSnapshot[];
  spells: SpellUse[];
  spikePushes: SpikePush[];
  waves: WaveStat[];
  /** PV perdus par les joueurs, par source (type de monstre, « pics », « poussée »). */
  damageTaken: Record<string, number>;
  /** Tour global de la mort de la Mama (null : vivante ou jamais arrivée). */
  mamaKilledTurn: number | null;
}

const ALL_PUSH_KINDS: ReadonlySet<string> = new Set(['push', 'pull', 'swap', 'advance', 'teleport']);

function monsterTypeName(monsterId: number): string {
  return gameData.monsters[String(monsterId)]?.name ?? `monstre ${monsterId}`;
}

/**
 * Rejoue ``trace`` et en extrait l'analyse. ``compo`` / ``victory`` : informations reportées telles quelles.
 * Lève une erreur (française) si la trace ne se rejoue pas.
 */
export function analyzeTrace(trace: FightTrace): FightAnalysis {
  const { fight } = replayTrace(trace, {}, { eventLog: true });
  const events: readonly FightEvent[] = fight.state.log?.events ?? [];
  return analyzeEvents(fight, events, trace);
}

type ReplayedFight = ReturnType<typeof replayTrace>['fight'];

/** Dépouillement des événements d'un combat terminé (voir ``analyzeTrace``). */
export function analyzeEvents(fight: ReplayedFight, events: readonly FightEvent[], trace: FightTrace): FightAnalysis {
  const fighters = fight.state.fighters;
  const grid = fight.ctx.grid;
  const sc = fight.scenario;
  const data = fight.ctx.data;
  const n = fighters.length;
  const isPlayerSide = (id: number): boolean => {
    const f = fighters[id];
    return !!f && f.team === 'players';
  };
  /** Joueur « propriétaire » (invocations : invocateur). */
  const ownerOf = (id: number): number => {
    const f = fighters[id];
    if (!f) return -1;
    return f.isSummon && f.summonerId >= 0 ? f.summonerId : id;
  };
  const isEnemy = (id: number): boolean => {
    const f = fighters[id];
    return !!f && f.team === 'monsters' && !f.isSummon;
  };
  const baseHp = (id: number): number => {
    const f = fighters[id]!;
    return data.monsters[String(f.monsterId)]?.stats.hp ?? f.maxHp;
  };

  // état suivi
  const hp = new Array<number>(n).fill(0);
  const alive = new Array<boolean>(n).fill(false);
  const present = new Array<boolean>(n).fill(false);
  const acted = new Array<boolean>(n).fill(false);
  const waveOf = new Array<number>(n).fill(-1);
  const everInSpikes = new Array<boolean>(n).fill(false);
  const playerIds = sc.playerIds.filter((id) => fighters[id] && !fighters[id]!.isSummon);
  let teamMaxHp = 0;
  for (const id of playerIds) {
    const f = fighters[id]!;
    hp[id] = f.maxHp;
    alive[id] = true;
    teamMaxHp += f.maxHp;
  }
  const mamaId = sc.mamaId;

  const turns: TurnSnapshot[] = [];
  const spells = new Map<string, SpellUse>();
  const spikePushes: SpikePush[] = [];
  const waves: WaveStat[] = [];
  const waveByNumber = new Map<number, WaveStat>();
  const damageTaken: Record<string, number> = {};
  let turn = 1;
  let turnKills = 0;
  let turnSpikes = 0;
  let mamaKilledTurn: number | null = null;

  // fenêtre du dernier lancer direct d'un joueur
  let window: SpellUse | null = null;
  let windowOwner = -1;

  const objectivesAt = (t: number): number => sc.completed.filter((o) => o.turn <= t).length;
  const snapshot = (t: number) => {
    let enemyHp = 0;
    let enemies = 0;
    for (let i = 0; i < n; i++) {
      if (!present[i] || !alive[i] || !isEnemy(i)) continue;
      enemyHp += hp[i]!;
      enemies++;
    }
    let php = 0;
    let pAlive = 0;
    for (const id of playerIds) {
      if (!alive[id]) continue;
      pAlive++;
      php += Math.max(0, hp[id]!);
    }
    turns.push({
      t,
      enemyHp,
      enemies,
      playersAlive: pAlive,
      teamHpPct: teamMaxHp ? Math.min(1, php / teamMaxHp) : 0,
      kills: turnKills,
      spikeEntries: turnSpikes,
      objectives: objectivesAt(t),
    });
    turnKills = 0;
    turnSpikes = 0;
  };
  const closeWindow = () => {
    window = null;
    windowOwner = -1;
  };
  const spikeEntry = (id: number) => {
    turnSpikes++;
    everInSpikes[id] = true;
    if (window) window.spikeEntries++;
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'globalTurn':
        if (ev.turn > turn) {
          snapshot(turn);
          turn = ev.turn;
        }
        if (turn >= 8 && mamaId >= 0 && !present[mamaId] && fighters[mamaId]) {
          // arrivée de la Mama au début du T8 (ÉTUDE §6)
          present[mamaId] = true;
          alive[mamaId] = fighters[mamaId]!.alive || sc.deaths.some((d) => d.fighterId === mamaId);
          hp[mamaId] = baseHp(mamaId);
        }
        closeWindow();
        break;
      case 'waveSpawned': {
        const w: WaveStat = waveByNumber.get(ev.wave) ?? {
          wave: ev.wave,
          turn: Math.max(1, ev.turn),
          spawned: 0,
          enteredSpikes: 0,
          killed: 0,
          killedBeforeActing: 0,
          killedSameTurn: 0,
          killedInSpikes: 0,
        };
        if (!waveByNumber.has(ev.wave)) {
          waveByNumber.set(ev.wave, w);
          waves.push(w);
        }
        for (const id of ev.fighterIds) {
          if (!isEnemy(id)) continue;
          present[id] = true;
          alive[id] = true;
          hp[id] = baseHp(id);
          waveOf[id] = ev.wave;
          w.spawned++;
        }
        break;
      }
      case 'turnStart':
        acted[ev.fighterId] = true;
        closeWindow();
        break;
      case 'turnEnd':
        closeWindow();
        break;
      case 'cast': {
        if (ev.depth !== 0) break;
        const owner = ownerOf(ev.casterId);
        const f = fighters[owner];
        if (!f || f.team !== 'players' || !f.archetype || f.isSummon) {
          closeWindow();
          break;
        }
        // sort de base et sa version améliorée regroupés sous le même nom
        const sl = data.spells[String(ev.spellLevelId)];
        const name = sl?.name ?? `sort ${ev.spellId}`;
        const key = `${f.archetype}|${name}`;
        let s = spells.get(key);
        if (!s) {
          s = { archetype: f.archetype, spellId: ev.spellId, name, casts: 0, ap: 0, damage: 0, kills: 0, spikeEntries: 0 };
          spells.set(key, s);
        }
        s.casts++;
        s.ap += ev.apCost;
        window = s;
        windowOwner = owner;
        break;
      }
      case 'move': {
        if (ev.kind === 'walk' && ownerOf(ev.fighterId) === windowOwner) closeWindow();
        if (!isEnemy(ev.fighterId)) break;
        if (ALL_PUSH_KINDS.has(ev.kind) && grid.isSpike(ev.to) && !grid.isSpike(ev.from) && isPlayerSide(ev.sourceId)) {
          const owner = ownerOf(ev.sourceId);
          const f = fighters[owner];
          spikePushes.push({
            turn,
            archetype: f?.archetype ?? '?',
            spellId: window && windowOwner === owner ? window.spellId : 0,
            spell: window && windowOwner === owner ? window.name : '(hors lancer)',
            kind: ev.kind,
            from: ev.from,
            to: ev.to,
            monster: monsterTypeName(fighters[ev.fighterId]!.monsterId),
          });
        }
        break;
      }
      case 'stateAdded':
        if (ev.stateId === IN_SPIKES_STATE && isEnemy(ev.targetId)) spikeEntry(ev.targetId);
        break;
      case 'damage': {
        const tgt = ev.targetId;
        if (isEnemy(tgt)) {
          if (!present[tgt]) {
            present[tgt] = true;
            alive[tgt] = true;
          }
          const lost = Math.max(0, hp[tgt]! - Math.max(0, ev.hpAfter));
          hp[tgt] = ev.hpAfter;
          if (window) window.damage += lost;
        } else if (playerIds.includes(tgt)) {
          const lost = Math.max(0, hp[tgt]! - Math.max(0, ev.hpAfter));
          hp[tgt] = ev.hpAfter;
          const src = fighters[ev.sourceId];
          const label = !src
            ? 'inconnu'
            : src.team === 'scenario'
              ? 'pics'
              : ev.collision
                ? 'poussée'
                : src.team === 'monsters'
                  ? monsterTypeName(src.monsterId)
                  : 'alliés';
          damageTaken[label] = (damageTaken[label] ?? 0) + lost;
        }
        break;
      }
      case 'heal':
        if (ev.targetId >= 0 && ev.targetId < n) hp[ev.targetId] = ev.hpAfter;
        break;
      case 'death': {
        const id = ev.fighterId;
        if (id === mamaId) mamaKilledTurn = turn;
        if (isEnemy(id)) {
          if (alive[id]) turnKills++;
          alive[id] = false;
          hp[id] = 0;
          if (window) window.kills++;
          const w = waveByNumber.get(waveOf[id]!);
          if (w) {
            w.killed++;
            if (!acted[id]) w.killedBeforeActing++;
            if (w.turn === turn) w.killedSameTurn++;
            if (grid.isSpike(ev.cell)) w.killedInSpikes++;
          }
        } else if (playerIds.includes(id)) {
          alive[id] = false;
          hp[id] = 0;
        }
        break;
      }
      case 'spawn':
        // résurrection d'un joueur (Ultime Espoir…) : PV relus au prochain dégât / soin
        if (playerIds.includes(ev.fighterId)) alive[ev.fighterId] = true;
        break;
      default:
        break;
    }
  }
  snapshot(turn);
  for (const w of waves) {
    w.enteredSpikes = 0;
  }
  for (let i = 0; i < n; i++) {
    if (everInSpikes[i] && waveOf[i]! >= 0) {
      const w = waveByNumber.get(waveOf[i]!);
      if (w) w.enteredSpikes++;
    }
  }
  const res = fight.getResult();
  return {
    compo: trace.info.compo,
    seed: trace.setup.seed,
    victory: res.winner === 'players',
    turnReached: fight.turn,
    players: playerIds.length,
    turns,
    spells: [...spells.values()],
    spikePushes,
    waves,
    damageTaken,
    mamaKilledTurn,
  };
}

// ---------------------------------------------------------------------------------------------
// Agrégation
// ---------------------------------------------------------------------------------------------

export interface TurnAggregate {
  t: number;
  /** Combats encore en cours au début de ce tour (tour atteint ≥ t). */
  fights: number;
  enemyHpMean: number;
  enemiesMean: number;
  playersAliveMean: number;
  teamHpPctMean: number;
  killsMean: number;
  spikeEntriesMean: number;
  objectivesMean: number;
  /** Combats où au moins un joueur meurt pendant ce tour. */
  fightsWithDeath: number;
}

export interface AnalysisAggregate {
  fights: number;
  turns: TurnAggregate[];
  /** Par archétype, sorts triés par dégâts décroissants. */
  spells: SpellUse[];
  /** Cases d'arrivée des mises en pics (toutes poussées confondues), triées. */
  spikeCells: { cell: number; count: number }[];
  /** Cases de départ → d'arrivée les plus fréquentes. */
  spikeMoves: { from: number; to: number; count: number }[];
  /** Mises en pics par archétype et sort. */
  spikeBySpell: { archetype: string; name: string; count: number }[];
  waves: WaveStat[];
  damageTaken: Record<string, number>;
}

/** Agrège des analyses (sommes et moyennes par tour conditionnelles au tour atteint). */
export function aggregateAnalyses(list: readonly FightAnalysis[]): AnalysisAggregate {
  const maxT = list.reduce((m, a) => Math.max(m, a.turns.length ? a.turns[a.turns.length - 1]!.t : 0), 0);
  const turns: TurnAggregate[] = [];
  for (let t = 1; t <= maxT; t++) {
    const snaps = list
      .map((a) => ({ s: a.turns.find((x) => x.t === t), before: a.turns.find((x) => x.t === t - 1)?.playersAlive ?? a.players }))
      .filter((x) => x.s);
    if (!snaps.length) continue;
    const k = snaps.length;
    const mean = (f: (s: TurnSnapshot) => number) => snaps.reduce((sum, x) => sum + f(x.s!), 0) / k;
    turns.push({
      t,
      fights: k,
      enemyHpMean: mean((s) => s.enemyHp),
      enemiesMean: mean((s) => s.enemies),
      playersAliveMean: mean((s) => s.playersAlive),
      teamHpPctMean: mean((s) => s.teamHpPct),
      killsMean: mean((s) => s.kills),
      spikeEntriesMean: mean((s) => s.spikeEntries),
      objectivesMean: mean((s) => s.objectives),
      fightsWithDeath: snaps.filter((x) => x.s!.playersAlive < x.before).length,
    });
  }
  const spellMap = new Map<string, SpellUse>();
  const cellMap = new Map<number, number>();
  const moveMap = new Map<string, { from: number; to: number; count: number }>();
  const bySpell = new Map<string, { archetype: string; name: string; count: number }>();
  const waveMap = new Map<number, WaveStat>();
  const damageTaken: Record<string, number> = {};
  for (const a of list) {
    for (const s of a.spells) {
      const key = `${s.archetype}|${s.name}`;
      const cur = spellMap.get(key) ?? { ...s, casts: 0, ap: 0, damage: 0, kills: 0, spikeEntries: 0 };
      cur.casts += s.casts;
      cur.ap += s.ap;
      cur.damage += s.damage;
      cur.kills += s.kills;
      cur.spikeEntries += s.spikeEntries;
      spellMap.set(key, cur);
    }
    for (const p of a.spikePushes) {
      cellMap.set(p.to, (cellMap.get(p.to) ?? 0) + 1);
      const mk = `${p.from}>${p.to}`;
      const m = moveMap.get(mk) ?? { from: p.from, to: p.to, count: 0 };
      m.count++;
      moveMap.set(mk, m);
      const sk = `${p.archetype}|${p.spell}`;
      const b = bySpell.get(sk) ?? { archetype: p.archetype, name: p.spell, count: 0 };
      b.count++;
      bySpell.set(sk, b);
    }
    for (const w of a.waves) {
      const cur = waveMap.get(w.wave) ?? { ...w, spawned: 0, enteredSpikes: 0, killed: 0, killedBeforeActing: 0, killedSameTurn: 0, killedInSpikes: 0 };
      cur.spawned += w.spawned;
      cur.enteredSpikes += w.enteredSpikes;
      cur.killed += w.killed;
      cur.killedBeforeActing += w.killedBeforeActing;
      cur.killedSameTurn += w.killedSameTurn;
      cur.killedInSpikes += w.killedInSpikes;
      waveMap.set(w.wave, cur);
    }
    for (const [k, v] of Object.entries(a.damageTaken)) damageTaken[k] = (damageTaken[k] ?? 0) + v;
  }
  return {
    fights: list.length,
    turns,
    spells: [...spellMap.values()].sort((x, y) => (x.archetype === y.archetype ? y.damage - x.damage : x.archetype.localeCompare(y.archetype))),
    spikeCells: [...cellMap.entries()].map(([cell, count]) => ({ cell, count })).sort((x, y) => y.count - x.count),
    spikeMoves: [...moveMap.values()].sort((x, y) => y.count - x.count).slice(0, 30),
    spikeBySpell: [...bySpell.values()].sort((x, y) => y.count - x.count),
    waves: [...waveMap.values()].sort((x, y) => x.wave - y.wave),
    damageTaken,
  };
}
