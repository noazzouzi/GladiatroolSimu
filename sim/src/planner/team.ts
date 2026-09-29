/**
 * Planification d'un TOUR GLOBAL pour l'équipe (``planTeamTurn``) : chaque joueur est planifié à son tour, dans
 * l'ordre de la timeline, les tours des monstres intercalés étant simulés par le contrôleur injecté (jets moyens,
 * sans critique). Option : beam d'équipe (``teamBeamWidth`` = K) — après chaque joueur, les K meilleurs états
 * d'équipe (feuilles distinctes de la recherche de ce joueur, prolongées jusqu'au point de décision suivant) sont
 * gardés et développés ; le meilleur état atteint à la fin du tour global donne le plan.
 *
 * Tout passe par l'API publique (copies, ``endTurn``, ``stepMonsterTurn``, ``resolveChoice``) : le combat passé
 * n'est pas modifié.
 */
import type { GladiatroolFight } from '../scenario/index.js';
import { resolveChoicesWith } from './choicePolicy.js';
import { evaluateState } from './evaluate.js';
import { leafActions, outcomeToPlan, resolveOptions, searchPlayerTurn, type ResolvedOptions, type SearchOutcome } from './search.js';
import { now, planningClone } from './simulate.js';
import type { PlayerPlan, TeamPlan, TeamPlanOptions, TeamPlanStep } from './types.js';
import { fmtNum } from '../engine/index.js';

interface TeamNode {
  fight: GladiatroolFight;
  steps: TeamPlanStep[];
  score: number;
}

/**
 * Fin du tour du joueur ``actorId`` puis tours des monstres (et choix du tour global en cours) jusqu'au prochain
 * joueur, la fin du combat ou le début du tour global suivant (les choix du tour suivant ne sont PAS résolus).
 */
export function advanceToNextPlayer(f: GladiatroolFight, actorId: number, startTurn: number, R: ResolvedOptions): void {
  let st = f.getStatus();
  if (st.kind === 'playerTurn' && st.fighterId === actorId) st = f.endTurn();
  for (let guard = 0; guard < 400; guard++) {
    if (st.kind === 'ended' || st.kind === 'playerTurn') return;
    if (f.turn > startTurn) return;
    if (st.kind === 'choice') {
      if (!resolveChoicesWith(f, R.policy)) return;
      st = f.getStatus();
      if (st.kind === 'idle') st = f.advance();
    } else if (st.kind === 'monsterTurn') {
      st = f.stepMonsterTurn(R.lookahead.monsters);
    } else {
      st = f.advance();
    }
  }
}

/** Feuilles distinctes (par séquence de lancers) les mieux classées d'une recherche. */
function distinctLeaves(outcome: SearchOutcome, k: number): number[] {
  const out: number[] = [];
  const keys = new Set<string>();
  for (let i = 0; i < outcome.ranked.length && out.length < k; i++) {
    const key = leafActions(outcome.ranked[i]!).map((a) => (a.type === 'cast' ? `${a.spellLevelId}@${a.cell}` : a.type === 'move' ? `m${a.path[a.path.length - 1]}` : 'e')).join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    out.push(i);
  }
  return out;
}

/**
 * Plan du tour global en cours pour tous les joueurs qui doivent encore jouer (à partir du joueur dont c'est le
 * tour ; un choix en attente est d'abord résolu par la politique de choix). Renvoie les plans successifs (chacun
 * avec son explication), le score de l'état final et un résumé en français.
 */
export function planTeamTurn(fight: GladiatroolFight, opts: TeamPlanOptions = {}): TeamPlan {
  const t0 = now();
  const R = resolveOptions(opts);
  const K = Math.max(1, Math.floor(opts.teamBeamWidth ?? 1));
  const start = planningClone(fight, R.rollMode, R.critMode, R.oracle);
  resolveChoicesWith(start, R.policy);
  let st = start.getStatus();
  if (st.kind === 'idle') st = start.advance();
  const turn = start.turn;
  // amène la copie au premier tour de joueur (monstres simulés)
  if (st.kind === 'monsterTurn' || st.kind === 'choice') advanceToNextPlayer(start, -1, turn, R);

  let beam: TeamNode[] = [{ fight: start, steps: [], score: evaluateState(start, R.weights) }];
  const done: TeamNode[] = [];
  for (let guard = 0; guard < 16 && beam.length; guard++) {
    const next: TeamNode[] = [];
    for (const node of beam) {
      const s = node.fight.getStatus();
      if (s.kind !== 'playerTurn' || node.fight.turn > turn) {
        done.push(node);
        continue;
      }
      const outcome = searchPlayerTurn(node.fight, R);
      if (!outcome.ranked.length) {
        done.push(node);
        continue;
      }
      const picks = K > 1 ? distinctLeaves(outcome, K) : [0];
      for (const i of picks) {
        const leaf = outcome.ranked[i]!;
        const plan: PlayerPlan = outcomeToPlan(outcome, i);
        const f = leaf.fight.clone({ keepLog: false });
        advanceToNextPlayer(f, outcome.actorId, turn, R);
        next.push({
          fight: f,
          steps: node.steps.concat({ fighterId: plan.fighterId, fighterName: plan.fighterName, plan }),
          score: evaluateState(f, R.weights),
        });
      }
    }
    next.sort((a, b) => b.score - a.score);
    beam = next.slice(0, K);
  }
  done.push(...beam);
  done.sort((a, b) => b.score - a.score || b.steps.length - a.steps.length);
  const best = done[0]!;
  const lines: string[] = [];
  lines.push(`Tour global ${turn} : ${best.steps.length} joueur(s) planifié(s).`);
  const f0 = start;
  for (const step of best.steps) {
    const p = step.plan;
    const s = p.summary;
    const bits: string[] = [];
    const casts = new Map<string, number>();
    for (const a of p.actions) {
      if (a.type !== 'cast') continue;
      const name = f0.ctx.getSpell(a.spellLevelId).name;
      casts.set(name, (casts.get(name) ?? 0) + 1);
    }
    bits.push(casts.size ? [...casts].map(([n, k]) => (k > 1 ? `${n} ×${k}` : n)).join(', ') : 'aucun sort');
    if (s.damageDealt) bits.push(`${fmtNum(s.damageDealt)} dégâts`);
    if (s.enteredSpikes.length) bits.push(`pics : ${s.enteredSpikes.join(', ')}`);
    if (s.kills.length) bits.push(`morts : ${s.kills.join(', ')}`);
    if (s.objectivesCompleted.length) bits.push(`objectif : ${s.objectivesCompleted.join(', ')}`);
    bits.push(`fin sur ${s.finalCell}`);
    lines.push(`- ${step.fighterName} : ${bits.join(' ; ')}.`);
  }
  const f = best.fight;
  const players = f.getPlayers();
  const lost = players.filter((p) => !p.alive).map((p) => p.name);
  const alive = f.getLivingMonsters().filter((m) => m.id !== f.scenario.mamaId);
  lines.push(
    `État atteint (tour ${f.turn}${f.isEnded() ? ', combat terminé' : ''}) : ${alive.length} Trooll(s) vivant(s)` +
      `${lost.length ? ` ; joueurs morts : ${lost.join(', ')}` : ''} ; PV des joueurs ${players.map((p) => (p.alive ? fmtNum(p.hp) : '0')).join(' / ')}.`,
  );
  lines.push(`Score : ${fmtNum(Math.round(best.score))}.`);
  return { turn, steps: best.steps, score: best.score, explanation: lines.join('\n'), timeMs: now() - t0 };
}
