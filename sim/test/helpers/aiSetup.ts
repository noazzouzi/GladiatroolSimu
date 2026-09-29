/**
 * Aides des tests de l'IA des monstres : avancée jusqu'au tour d'un monstre (tout le monde passif), placement
 * contrôlé (téléportation du moteur : les entrées / sorties des pics sont traitées), cases libres utiles.
 */
import { finishAction, teleportTo, type Fighter } from '../../src/engine/index.js';
import { AXIS_DIRECTIONS, cellInDirection, distance, hasLineOfSight } from '../../src/geometry/index.js';
import { flushScenario, resolveAllChoices, type GladiatroolFight } from '../../src/scenario/index.js';

/** Avance (joueurs et monstres passifs) jusqu'au tour d'un monstre dont le nom commence par ``prefix``, au tour ≥ ``turn``. */
export function untilMonsterTurn(fight: GladiatroolFight, prefix: string, turn = 1, max = 5000): Fighter {
  for (let i = 0; i < max; i++) {
    const st = fight.getStatus();
    if (st.kind === 'monsterTurn' && fight.turn >= turn && fight.state.fighters[st.fighterId]!.name.startsWith(prefix)) {
      return fight.state.fighters[st.fighterId]!;
    }
    switch (st.kind) {
      case 'ended':
        throw new Error(`combat terminé (tour ${fight.turn})`);
      case 'choice':
        resolveAllChoices(fight);
        break;
      case 'playerTurn':
        fight.endTurn();
        break;
      case 'monsterTurn':
        fight.stepMonsterTurn(() => {});
        break;
      case 'idle':
        fight.advance();
        break;
    }
  }
  throw new Error(`tour de ${prefix} non atteint`);
}

/** Déplace ``f`` sur ``cell`` (libre) comme une téléportation (déclencheurs des pics compris). */
export function relocate(fight: GladiatroolFight, f: Fighter, cell: number): void {
  if (f.cell === cell) return;
  const occ = fight.state.fighterAt(cell);
  if (occ) throw new Error(`case ${cell} occupée par ${occ.name}`);
  teleportTo(fight.state, f, cell, -1, 'teleport');
  finishAction(fight.state);
  flushScenario(fight.state);
}

export function isFreeSafe(fight: GladiatroolFight, c: number): boolean {
  const g = fight.ctx.grid;
  return c >= 0 && g.isWalkable(c) && !g.isSpike(c) && !fight.state.fighterAt(c);
}

/** Case libre hors pics, voisine (4 directions) de ``cell``. */
export function freeNeighbour(fight: GladiatroolFight, cell: number): number {
  for (const d of AXIS_DIRECTIONS) {
    const c = cellInDirection(cell, d, 1);
    if (isFreeSafe(fight, c)) return c;
  }
  throw new Error(`aucune case libre autour de ${cell}`);
}

/** Case libre hors pics à distance [lo, hi] de ``cell``, avec ligne de vue si demandé (la première dans l'ordre des cases). */
export function freeCellAt(fight: GladiatroolFight, cell: number, lo: number, hi: number, los = false, avoid: readonly number[] = []): number {
  const g = fight.ctx.grid;
  for (const c of g.walkableCells) {
    const d = distance(c, cell);
    if (d < lo || d > hi || !isFreeSafe(fight, c)) continue;
    if (avoid.some((a) => distance(a, c) < 3)) continue;
    if (los && !hasLineOfSight(cell, c, fight.state.occupiedPredicate(), g.blocksLos)) continue;
    return c;
  }
  throw new Error(`aucune case libre à ${lo}-${hi} de ${cell}`);
}

/** Éloigne tous les joueurs vivants (sauf ``keep``) à plus de ``minDist`` cases de chacun des ``from``. */
export function sendPlayersAway(fight: GladiatroolFight, from: readonly number[], minDist: number, keep: readonly Fighter[] = []): void {
  const g = fight.ctx.grid;
  for (const p of fight.getPlayers()) {
    if (!p.alive || keep.includes(p)) continue;
    if (from.every((c) => distance(c, p.cell) > minDist) && !g.isSpike(p.cell)) continue;
    const c = g.walkableCells.find((x) => isFreeSafe(fight, x) && from.every((f) => distance(f, x) > minDist));
    if (c === undefined) throw new Error('aucune case éloignée');
    relocate(fight, p, c);
  }
}

/** Dégâts (hors collisions comprises) infligés par ``sourceId`` depuis l'index ``since`` du journal. */
export function damageBy(fight: GladiatroolFight, sourceId: number, since = 0): number {
  return fight.state.log!.events.slice(since).reduce((s, e) => (e.type === 'damage' && e.sourceId === sourceId ? s + e.amount : s), 0);
}
