/**
 * Carte ASCII de l'arène (vue écran du client : lignes de 14 cases, lignes impaires décalées d'une demi-case) avec
 * les numéros de case, les pics, les cases de départ, les cases de cadeau, la case d'attente de la Mama et, en
 * option, les combattants d'un état.
 */
import { cellX, cellY } from '../geometry/index.js';
import type { GameData } from '../data/index.js';
import type { FightState } from '../engine/index.js';

const WIDTH = 14;
const CELL_W = 6;

export interface MapRenderOptions {
  /** Étiquettes à afficher à la place du numéro (case → texte de 3 caractères au plus). */
  labels?: ReadonlyMap<number, string>;
  /** Coordonnées (x, y) du client à la place des numéros. */
  coords?: boolean;
}

/** Étiquettes courtes des combattants vivants d'un état (J1…J4, Tl1 Troollibre, Ar1 Artroolleur, Ni1 Nitrooll, MAM). */
export function fighterLabels(state: FightState, playerIds: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  const counters = new Map<number, number>();
  for (const f of state.fighters) {
    if (!f.alive || f.cell < 0 || f.team === 'scenario') continue;
    let label: string;
    const pi = playerIds.indexOf(f.id);
    if (pi >= 0) label = `J${pi + 1}`;
    else if (f.team === 'players') label = 'Inv';
    else if (f.monsterId === 7984) label = 'MAM';
    else {
      const n = (counters.get(f.monsterId) ?? 0) + 1;
      counters.set(f.monsterId, n);
      const prefix = f.monsterId === 7981 ? 'T' : f.monsterId === 7982 ? 'A' : f.monsterId === 7983 ? 'N' : 'M';
      label = `${prefix}${n}`;
    }
    out.set(f.cell, label);
  }
  return out;
}

/** Rendu texte de la carte ; légende en français en fin de rendu. */
export function renderMap(data: GameData, o: MapRenderOptions = {}): string {
  const m = data.map;
  const playable = new Set(m.playable);
  const spikes = new Set(m.spikes.cells);
  const starts = new Set(m.startCells);
  const gifts = new Set(m.giftCells);
  const los = new Set(m.losBlocking);
  const all = [...playable, ...los, m.bossWaitCell];
  const rows = all.map((c) => Math.floor(c / WIDTH));
  const rMin = Math.min(...rows);
  const rMax = Math.max(...rows);
  const lines: string[] = [];
  for (let r = rMin; r <= rMax; r++) {
    let line = r % 2 === 1 ? ' '.repeat(CELL_W / 2) : '';
    for (let c = 0; c < WIDTH; c++) {
      const id = r * WIDTH + c;
      let mark = ' ';
      let body: string;
      const label = o.labels?.get(id);
      if (id === m.bossWaitCell) mark = 'M';
      else if (los.has(id)) mark = '#';
      else if (!playable.has(id)) {
        line += ' '.repeat(CELL_W);
        continue;
      } else if (spikes.has(id)) mark = '^';
      else if (starts.has(id)) mark = 'J';
      else if (gifts.has(id)) mark = '*';
      else if (id === m.center) mark = '+';
      if (label) body = label.padEnd(3).slice(0, 3);
      else if (o.coords) body = `${cellX(id)},${cellY(id)}`.padEnd(3).slice(0, 5);
      else body = String(id).padStart(3);
      line += `${mark}${body}`.padEnd(CELL_W);
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  lines.push('');
  lines.push(
    'Légende : ^ pics (96 cases)  J case de départ (286, 287, 314, 315)  * case de cadeau  + centre (300, arrivée de la Mama)',
  );
  lines.push('          M case d\'attente de la Mama (152, hors combat)  # obstacle (bloque la ligne de vue)');
  if (o.labels?.size) lines.push('          J1…J4 joueurs (ordre de jeu)  T Troollibre  A Artroolleur  N Nitrooll  MAM Mama  Inv invocation');
  return lines.join('\n');
}
