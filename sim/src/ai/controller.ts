/**
 * Contrôleur de l'IA des monstres (``MonsterController`` du scénario) : à chaque tour de monstre, il lit l'état (sans
 * le modifier), planifie sur le plateau de l'IA (plan.ts) puis joue le plan **par l'API publique** du combat
 * (``fight.move`` / ``fight.cast``, actions légales uniquement).
 *
 * Après chaque action, les cases réelles des combattants sont comparées à celles prévues : en cas d'écart (critique,
 * mort imprévue, poussée différente) ou d'échec d'une action, le monstre re-planifie avec ses PA / PM restants. Les
 * décisions du début de tour (focalisation, tour passé) sont gardées pour tout le tour (y compris si un vote
 * interrompt le tour et que ``stepMonsterTurn`` rappelle le contrôleur).
 *
 * Déterministe : aucune source d'aléa (les égalités sont tranchées par l'ordre des cases et des ids) ; aucune API
 * Node (utilisable dans un Web Worker).
 */
import type { FightState } from '../engine/index.js';
import type { GladiatroolFight, MonsterController } from '../scenario/index.js';
import { Board, type BoardOptions } from './board.js';
import { planTurn, turnMemo, type MonsterPlan, type PlanOptions, type TurnMemo } from './plan.js';
import { aiSettingsFor } from './settings.js';

export interface MonsterAiOptions extends BoardOptions, PlanOptions {
  /** Nombre maximal de re-planifications par tour (défaut 6). */
  readonly maxReplans?: number;
  /** Messages d'information (tours passés) dans le journal du combat, s'il est actif (défaut vrai). */
  readonly logDecisions?: boolean;
  /** Appelé avec chaque plan calculé (tests, interface). */
  readonly onPlan?: (plan: MonsterPlan, fight: GladiatroolFight) => void;
}

/** Contrôleur de l'IA, avec accès au dernier plan calculé. */
export interface MonsterAi extends MonsterController {
  readonly options: MonsterAiOptions;
}

interface MemoEntry {
  readonly key: string;
  readonly memo: TurnMemo;
}

const memos = new WeakMap<FightState, MemoEntry>();

function turnKey(state: FightState, id: number): string {
  const f = state.fighters[id]!;
  return `${state.turn}:${id}:${f.turnCount}`;
}

const MODE_MESSAGES: Record<string, string> = {
  stayInSpikes: 'dans les pics : ne se déplace pas',
  noTarget: 'aucune cible à portée : ne se déplace pas',
};

/** Le combattant peut-il encore agir (son tour, pas de choix en attente, combat en cours) ? */
function canAct(fight: GladiatroolFight, id: number): boolean {
  const s = fight.state;
  const f = s.fighters[id];
  return !!f && f.alive && f.cell >= 0 && s.phase !== 'ended' && !s.pendingChoices.length && fight.getCurrentFighter() === f;
}

function matches(state: FightState, predicted: readonly number[]): boolean {
  const fs = state.fighters;
  for (let i = 0; i < predicted.length && i < fs.length; i++) {
    const f = fs[i]!;
    if (f.team === 'scenario') continue;
    const c = f.alive ? f.cell : -1;
    if (c !== predicted[i]) return false;
  }
  return true;
}

/** Joue un tour (ou la fin d'un tour) du monstre ``id`` avec les options ``opts``. */
export function playMonsterTurn(fight: GladiatroolFight, id: number, opts: MonsterAiOptions = {}): void {
  const state = fight.state;
  if (!canAct(fight, id)) return;
  const f = state.fighters[id]!;
  const settings = aiSettingsFor(state.ctx, f);
  const key = turnKey(state, id);
  let entry = memos.get(state);
  if (!entry || entry.key !== key) {
    const b0 = Board.fromState(state, opts);
    b0.setActor(id, false);
    entry = { key, memo: turnMemo(b0, settings) };
    memos.set(state, entry);
    const msg = MODE_MESSAGES[entry.memo.mode];
    if (msg && (opts.logDecisions ?? true) && state.logging) state.emit({ type: 'info', message: `${f.name} : ${msg}.` });
  }
  const memo = entry.memo;
  const maxReplans = opts.maxReplans ?? 6;
  let failures = 0;
  for (let round = 0; round <= maxReplans; round++) {
    if (!canAct(fight, id)) return;
    const b = Board.fromState(state, opts);
    b.setActor(id, false);
    const plan = planTurn(b, settings, memo, opts);
    opts.onPlan?.(plan, fight);
    if (!plan.steps.length) return;
    let deviated = false;
    for (let k = 0; k < plan.steps.length; k++) {
      if (!canAct(fight, id)) return;
      const st = plan.steps[k]!;
      const r = st.kind === 'move' ? fight.move(id, st.path) : fight.cast(id, st.spellLevelId, st.cell);
      if (!r.ok) {
        failures++;
        deviated = true;
        break;
      }
      if (k < plan.steps.length - 1 && !matches(state, plan.predicted[k]!)) {
        deviated = true;
        break;
      }
    }
    if (!deviated || failures >= 2) return;
  }
}

/** Crée un contrôleur de l'IA des monstres (options : estimation des jets, élagage, re-planification). */
export function createMonsterAi(opts: MonsterAiOptions = {}): MonsterAi {
  return {
    options: opts,
    playTurn(fight, fighterId) {
      playMonsterTurn(fight, fighterId, opts);
    },
  };
}

/** IA des monstres par défaut (jets en espérance, critiques en espérance, recherche complète). */
export const monsterAi: MonsterAi = createMonsterAi();

/**
 * Options du mode « anticipation » (planificateur) : jet moyen du moteur (``rollMode average``), sans critique,
 * au plus 12 cases de départ (les plus proches de la cible), 2 séquences pour le déplacement final, 2
 * re-planifications, pas de message.
 */
export const ANTICIPATION_OPTIONS: MonsterAiOptions = {
  roll: 'average',
  critExpectation: false,
  maxStartCells: 12,
  finalMoveCandidates: 2,
  maxReplans: 2,
  logDecisions: false,
};

/** IA rapide pour les anticipations du planificateur (voir ``ANTICIPATION_OPTIONS``). */
export const anticipationMonsterAi: MonsterAi = createMonsterAi(ANTICIPATION_OPTIONS);
