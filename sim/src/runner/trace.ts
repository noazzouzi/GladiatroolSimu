/**
 * Trace d'actions rejouable : enregistrement des actions RÉUSSIES de tous les combattants (joueurs et monstres),
 * des fins de tour et des réponses aux choix, puis rejeu par l'API publique (``playerCast`` / ``playerMove`` /
 * ``cast`` / ``move`` / ``endTurn`` / ``stepMonsterTurn`` / ``resolveChoice``). Mêmes graine et configuration →
 * même combat (les jets du moteur sont tirés dans le même ordre) : le rejeu reconstruit exactement l'état à
 * n'importe quel point de décision (``until``), pour la commande « planifier » ou l'interface.
 */
import { gameData, loadConfig, type ConfigOverrides } from '../data/index.js';
import {
  createGladiatroolFight,
  type ChoiceAnswer,
  type ChoiceResult,
  type FightStatus,
  type GladiatroolFight,
  type MonsterController,
} from '../scenario/index.js';
import type { ActionResult } from '../engine/index.js';
import type { FightTrace, TraceStep } from './types.js';

/**
 * Installe l'enregistrement sur l'INSTANCE ``fight`` (les copies faites par le planificateur ne sont pas
 * concernées) : chaque ``cast`` / ``playerCast`` / ``move`` / ``resolveChoice`` réussi ajoute un pas à ``steps``.
 * ``onRecord`` (facultatif, interface web) est appelé après chaque pas ajouté, l'action déjà appliquée.
 */
export function installRecorder(fight: GladiatroolFight, steps: TraceStep[], onRecord?: (step: TraceStep, index: number) => void): void {
  const push = (step: TraceStep): void => {
    steps.push(step);
    onRecord?.(step, steps.length - 1);
  };
  const cast = fight.cast.bind(fight);
  const playerCast = fight.playerCast.bind(fight);
  const move = fight.move.bind(fight);
  const resolve = fight.resolveChoice.bind(fight);
  const self = fight as unknown as Record<string, unknown>;
  self.cast = (id: number, sl: number, cell: number): ActionResult => {
    const r = cast(id, sl, cell);
    if (r.ok) push({ k: 'cast', f: id, s: sl, c: cell, t: fight.turn });
    return r;
  };
  self.playerCast = (sl: number, cell: number): ActionResult => {
    const id = fight.getCurrentFighter()?.id ?? -1;
    const r = playerCast(sl, cell);
    if (r.ok) push({ k: 'cast', f: id, s: sl, c: cell, t: fight.turn });
    return r;
  };
  self.move = (id: number, target: readonly number[] | number, opts: { avoidSpikes?: boolean } = {}): ActionResult => {
    const r = move(id, target, opts);
    if (r.ok) {
      push(
        typeof target === 'number'
          ? { k: 'move', f: id, p: target, ...(opts.avoidSpikes ? { a: true } : {}), t: fight.turn }
          : { k: 'move', f: id, p: [...target], t: fight.turn },
      );
    }
    return r;
  };
  self.resolveChoice = (uid: number, answer: ChoiceAnswer): ChoiceResult => {
    const c = fight.getPendingChoices().find((x) => x.uid === uid);
    const t = fight.turn;
    const r = resolve(uid, answer);
    if (r.ok && c) {
      push({ k: 'choice', l: c.choiceListId, f: c.fighterId, a: typeof answer === 'number' ? answer : { votes: [...answer.votes] }, t });
    }
    return r;
  };
}

/** Point d'arrêt du rejeu. */
export interface ReplayUntil {
  /** Tour global. */
  turn?: number;
  /** Combattant dont c'est le tour (nom exact, id, ou rang du joueur « J1 »…). */
  fighter?: string | number;
  /** Nombre de pas de la trace à rejouer au plus (arrêt au premier point de décision atteint après). */
  step?: number;
}

export interface ReplayResult {
  fight: GladiatroolFight;
  /** Pas rejoués. */
  stepsApplied: number;
  status: FightStatus;
  /** Point d'arrêt atteint (sinon : fin de la trace). */
  reached: boolean;
}

function fighterMatches(fight: GladiatroolFight, id: number, spec: string | number): boolean {
  if (typeof spec === 'number') return id === spec;
  const f = fight.state.fighters[id];
  if (!f) return false;
  const m = /^J(\d)$/i.exec(spec.trim());
  if (m) return fight.scenario.playerIds[Number(m[1]) - 1] === id;
  return f.name.toLowerCase() === spec.trim().toLowerCase();
}

/** Combat neuf correspondant à la mise en place d'une trace (même graine, même configuration). */
export function fightFromTrace(trace: FightTrace, o: { eventLog?: boolean } = {}): GladiatroolFight {
  return createGladiatroolFight(gameData, loadConfig((trace.configOverrides ?? {}) as ConfigOverrides), {
    players: trace.setup.players,
    seed: trace.setup.seed,
    options: { eventLog: o.eventLog ?? false, ...(trace.setup.scenarioSeed !== undefined ? { scenarioSeed: trace.setup.scenarioSeed } : {}) },
  });
}

/**
 * Rejoue ``trace`` (par l'API publique) jusqu'au point ``until`` (début du tour du combattant demandé au tour
 * demandé, ou nombre de pas), ou jusqu'à la fin de la trace. Lève une erreur (français) si la trace ne correspond
 * plus au combat (action refusée, choix introuvable).
 */
export function replayTrace(trace: FightTrace, until: ReplayUntil = {}, o: { eventLog?: boolean } = {}): ReplayResult {
  const fight = fightFromTrace(trace, o);
  const steps = trace.steps;
  let i = 0;
  const fail = (why: string): never => {
    throw new Error(`rejeu impossible au pas ${i} (tour ${fight.turn}) : ${why}`);
  };
  const replayMonsters: MonsterController = {
    playTurn(f, id) {
      while (i < steps.length) {
        const s = steps[i]!;
        if ((s.k !== 'cast' && s.k !== 'move') || s.f !== id) return;
        const r = s.k === 'cast' ? f.cast(id, s.s, s.c) : f.move(id, s.p, s.a ? { avoidSpikes: true } : {});
        if (!r.ok) fail(`action du monstre ${f.state.fighters[id]?.name} refusée (${r.reason ?? r.code})`);
        i++;
      }
    },
  };
  let st = fight.getStatus();
  if (st.kind === 'idle') st = fight.advance();
  const reachedAt = (): boolean => {
    if (until.step !== undefined && i >= until.step) return true;
    if (until.turn === undefined && until.fighter === undefined) return false;
    if (st.kind !== 'playerTurn' && st.kind !== 'monsterTurn') return false;
    if (until.turn !== undefined && fight.turn !== until.turn) return false;
    if (until.fighter !== undefined && !fighterMatches(fight, st.fighterId, until.fighter)) return false;
    return true;
  };
  for (let guard = 0; guard < 1_000_000; guard++) {
    if (st.kind === 'ended' || i >= steps.length) break;
    if (reachedAt()) return { fight, stepsApplied: i, status: st, reached: true };
    const s = steps[i]!;
    switch (st.kind) {
      case 'choice': {
        if (s.k !== 'choice') return fail(`choix en attente mais pas « ${s.k} » dans la trace`);
        const c = fight.getPendingChoices().find((x) => x.choiceListId === s.l && x.fighterId === s.f);
        if (!c) return fail(`choix de la liste ${s.l} introuvable`);
        const r = fight.resolveChoice(c.uid, s.a);
        if (!r.ok) fail(`réponse refusée (${r.reason})`);
        i++;
        st = fight.getStatus();
        if (st.kind === 'idle') st = fight.advance();
        break;
      }
      case 'playerTurn': {
        if (s.f !== st.fighterId) fail(`tour de ${fight.state.fighters[st.fighterId]?.name}, la trace attend le combattant ${s.f}`);
        if (s.k === 'end') {
          i++;
          st = fight.endTurn();
          break;
        }
        if (s.k === 'choice') return fail('choix attendu par la trace mais aucun choix en attente');
        const r = s.k === 'cast' ? fight.playerCast(s.s, s.c) : fight.playerMove(s.p, s.a ? { avoidSpikes: true } : {});
        if (!r.ok) fail(`action refusée (${r.reason ?? r.code})`);
        i++;
        st = fight.getStatus();
        if (st.kind === 'idle') st = fight.advance();
        break;
      }
      case 'monsterTurn': {
        const id = st.fighterId;
        st = fight.stepMonsterTurn(replayMonsters);
        const n = steps[i];
        if (st.kind !== 'choice' && n && n.k === 'end' && n.f === id) i++;
        break;
      }
      case 'idle':
        st = fight.advance();
        break;
    }
  }
  return { fight, stepsApplied: i, status: st, reached: reachedAt() };
}
