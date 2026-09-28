/**
 * Contrôleurs minimaux (tests, démonstrations, runner provisoire) en attendant l'IA des monstres (module ``ai``) et le
 * planificateur : ils n'agissent que par l'API de pilotage (``fight.cast`` / ``fight.move``).
 *
 * - ``passiveMonsterController`` (fight.ts) : ne fait rien ;
 * - ``simpleMonsterController`` : va vers le joueur le plus proche sans entrer dans les pics, puis lance ses sorts
 *   offensifs sur un joueur (le plus faible) tant qu'il peut ;
 * - ``createRandomController(graine)`` : actions aléatoires valides (sorts, déplacements), pour tout combattant ;
 * - ``playUntilEnd`` : boucle complète (choix, tours des joueurs et des monstres) jusqu'à la fin ou une limite.
 */
import { distance, reachableCells } from '../geometry/index.js';
import { Rng, type Fighter } from '../engine/index.js';
import { resolveAllChoices, type GladiatroolFight } from './fight.js';
import type { ChoiceAnswer, FightStatus, MonsterController, ScenarioChoice } from './types.js';

/** Contrôleur d'un combattant (même forme que ``MonsterController`` : joue le tour de ``fighterId``). */
export type TurnController = MonsterController;

function enemiesOf(fight: GladiatroolFight, f: Fighter): Fighter[] {
  return fight.state.fighters.filter((g) => g.alive && g.cell >= 0 && g.team !== f.team && g.team !== 'scenario');
}

function nearestDistance(cell: number, targets: Fighter[]): number {
  let best = Infinity;
  for (const t of targets) best = Math.min(best, distance(cell, t.cell));
  return best;
}

/** Lance au plus ``max`` sorts offensifs sur des ennemis (cible : PV les plus bas) ; renvoie le nombre de lancers. */
function castOffensive(fight: GladiatroolFight, f: Fighter, max: number): number {
  let n = 0;
  for (let guard = 0; guard < max && f.alive && fight.getCurrentFighter() === f && !fight.state.pendingChoices.length; guard++) {
    let done = false;
    for (const slot of f.spells) {
      const cells = fight.getCastableCells(slot.spellLevelId);
      if (!cells.length) continue;
      let best = -1;
      let bestHp = Infinity;
      for (const c of cells) {
        const t = fight.state.fighterAt(c);
        if (t && t.team !== f.team && t.team !== 'scenario' && t.hp < bestHp) {
          bestHp = t.hp;
          best = c;
        }
      }
      if (best < 0) continue;
      if (fight.cast(f.id, slot.spellLevelId, best).ok) {
        n++;
        done = true;
        break;
      }
    }
    if (!done) break;
  }
  return n;
}

/**
 * IA triviale : si aucun sort offensif n'est lançable, se rapproche (sans entrer dans les pics) du joueur le plus
 * proche, puis lance ses sorts offensifs sur le joueur le plus faible à portée.
 */
export const simpleMonsterController: MonsterController = {
  playTurn(fight, fighterId) {
    const f = fight.state.fighters[fighterId];
    if (!f || !f.alive) return;
    castOffensive(fight, f, 6);
    if (!f.alive || fight.getCurrentFighter() !== f || fight.state.pendingChoices.length || f.mp <= 0) return;
    const enemies = enemiesOf(fight, f);
    if (!enemies.length) return;
    const grid = fight.ctx.grid;
    const reach = reachableCells(grid, f.cell, f.mp, fight.state.occupiedPredicate(), { avoidSpikes: true });
    let best = f.cell;
    let bestD = nearestDistance(f.cell, enemies);
    for (const c of reach.cells) {
      if (grid.isSpike(c) && !grid.isSpike(f.cell)) continue;
      const d = nearestDistance(c, enemies);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best !== f.cell) fight.move(f.id, best, { avoidSpikes: true });
    castOffensive(fight, f, 6);
  },
};

/** Contrôleur aléatoire (graine propre) : jusqu'à ``maxActions`` actions valides tirées au hasard. */
export function createRandomController(seed: number, maxActions = 6, moveRate = 0.3): TurnController {
  const rng = new Rng(seed);
  return {
    playTurn(fight, fighterId) {
      const s = fight.state;
      for (let k = 0; k < maxActions; k++) {
        const f = s.fighters[fighterId];
        if (!f || !f.alive || fight.getCurrentFighter() !== f || s.pendingChoices.length || s.phase === 'ended') return;
        if (rng.next() < moveRate && f.mp > 0) {
          const cells = reachableCells(s.ctx.grid, f.cell, f.mp, s.occupiedPredicate()).cells.slice(1);
          if (cells.length) fight.move(f.id, cells[rng.int(0, cells.length - 1)]!);
          continue;
        }
        const spells = f.spells.filter((x) => s.ctx.getSpell(x.spellLevelId).cast.ap <= f.ap);
        if (!spells.length) return;
        const sp = spells[rng.int(0, spells.length - 1)]!;
        const cells = fight.getCastableCells(sp.spellLevelId);
        if (!cells.length) continue;
        fight.cast(f.id, sp.spellLevelId, cells[rng.int(0, cells.length - 1)]!);
      }
    },
  };
}

export interface PlayOptions {
  /** Joue le tour d'un joueur (défaut : fin de tour immédiate). */
  players?: TurnController;
  /** IA des monstres (défaut : celle du combat). */
  monsters?: MonsterController;
  /** Réponse aux choix (défaut : première option). */
  choose?: (choice: ScenarioChoice, fight: GladiatroolFight) => ChoiceAnswer;
  /** Arrêt au-delà de ce tour global (défaut : 30). */
  maxTurn?: number;
  /** Appelé à chaque point de décision (invariants, rejeu…). */
  onStep?: (fight: GladiatroolFight, status: FightStatus) => void;
}

/** Joue le combat jusqu'à la fin (ou au-delà de ``maxTurn``) ; renvoie le dernier point de décision. */
export function playUntilEnd(fight: GladiatroolFight, o: PlayOptions = {}): FightStatus {
  const maxTurn = o.maxTurn ?? 30;
  const monsters = o.monsters ?? fight.monsterController;
  let st = fight.getStatus();
  if (st.kind === 'idle') st = fight.advance();
  for (let i = 0; i < 1_000_000; i++) {
    o.onStep?.(fight, st);
    if (st.kind === 'ended' || fight.turn > maxTurn) return st;
    switch (st.kind) {
      case 'choice':
        resolveAllChoices(fight, o.choose);
        st = fight.getStatus();
        if (st.kind === 'idle') st = fight.advance();
        break;
      case 'playerTurn': {
        const id = st.fighterId;
        o.players?.playTurn(fight, id);
        st = fight.getStatus();
        if (st.kind === 'playerTurn' && st.fighterId === id) st = fight.endTurn();
        else if (st.kind === 'idle') st = fight.advance();
        break;
      }
      case 'monsterTurn':
        st = fight.stepMonsterTurn(monsters);
        break;
      case 'idle':
        st = fight.advance();
        break;
    }
  }
  return st;
}
