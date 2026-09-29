/**
 * Édition d'une situation (docs/FORMAT_SITUATION.md) : fonctions PURES et immuables utilisées par l'éditeur de
 * l'interface (placer, déplacer, échanger, ajouter, retirer, composition, cadeaux, import / export). La
 * reconstruction du combat reste celle du runner (``buildSituation``, dans le worker).
 */
import type { ArchetypeKey, MonsterType, Situation } from './types.js';

type SituationPlayer = Situation['players'][number];
type SituationMonster = Situation['monsters'][number];

/** Placement automatique du runner (J1 sur 314, J2 sur 287, J3 sur 286, J4 sur 315). */
export const AUTO_PLACEMENT = [314, 287, 286, 315] as const;

export const LETTER_OF: Readonly<Record<ArchetypeKey, string>> = { acrobate: 'A', dompteur: 'D', magicien: 'M' };
const ARCHETYPE_OF: Readonly<Record<string, ArchetypeKey>> = { A: 'acrobate', D: 'dompteur', M: 'magicien' };

export type FighterRef = { kind: 'player'; index: number } | { kind: 'monster'; index: number };

/** Situation d'ouverture de référence (ÉTUDE §10.4) : ADDM sur les cases de départ, V1 sur 242 et 358, T1. */
export function openingSituation(): Situation {
  return {
    version: 1,
    description: 'Ouverture de référence T1 : A-D-D-M sur les cases de départ, V1 = 2 Troollibres sur 242 et 358, tour de l\'Acrobate.',
    seed: 42,
    turn: 1,
    players: [
      { archetype: 'acrobate', cell: 314 },
      { archetype: 'dompteur', cell: 287 },
      { archetype: 'dompteur', cell: 286 },
      { archetype: 'magicien', cell: 315 },
    ],
    monsters: [
      { type: 'troollibre', cell: 242 },
      { type: 'troollibre', cell: 358 },
    ],
    current: 'J1',
    objectives: { completed: [], active: 'empale' },
  };
}

/** Composition (lettres dans l'ordre de jeu) d'une situation. */
export function compoOf(sit: Situation): string {
  return sit.players.map((p) => LETTER_OF[p.archetype]).join('');
}

/** Case occupée par un combattant vivant de la situation (Mama en attente exclue). */
export function occupantAt(sit: Situation, cell: number): FighterRef | null {
  const pi = sit.players.findIndex((p) => !p.dead && p.cell === cell);
  if (pi >= 0) return { kind: 'player', index: pi };
  const mi = sit.monsters.findIndex((m) => !m.dead && m.cell === cell && !(m.type === 'mama' && sit.turn < 8));
  if (mi >= 0) return { kind: 'monster', index: mi };
  return null;
}

function cellOf(sit: Situation, ref: FighterRef): number | undefined {
  return ref.kind === 'player' ? sit.players[ref.index]?.cell : sit.monsters[ref.index]?.cell;
}

function withCell(sit: Situation, ref: FighterRef, cell: number | undefined): Situation {
  if (ref.kind === 'player') {
    const players = sit.players.map((p, i) => (i === ref.index ? { ...p, cell } : p));
    return { ...sit, players };
  }
  const monsters = sit.monsters.map((m, i) => (i === ref.index ? { ...m, cell } : m));
  return { ...sit, monsters };
}

/**
 * Déplace un combattant sur ``cell`` ; si la case est occupée par un autre, les deux ÉCHANGENT leurs cases. Un
 * cadeau présent sur la case d'arrivée est retiré (une case porte un combattant ou un cadeau).
 */
export function moveFighter(sit: Situation, ref: FighterRef, cell: number): Situation {
  const from = cellOf(sit, ref);
  if (from === cell) return sit;
  const other = occupantAt(sit, cell);
  let out = withCell(sit, ref, cell);
  if (other && !(other.kind === ref.kind && other.index === ref.index)) out = withCell(out, other, from);
  if (out.gifts?.includes(cell)) out = { ...out, gifts: out.gifts.filter((g) => g !== cell) };
  return out;
}

/** Ajoute un Trooll sur une case libre. */
export function addMonster(sit: Situation, type: Exclude<MonsterType, 'mama'>, cell: number): Situation {
  if (occupantAt(sit, cell)) return sit;
  const gifts = sit.gifts?.filter((g) => g !== cell);
  return { ...sit, monsters: [...sit.monsters, { type, cell }], ...(gifts ? { gifts } : {}) };
}

/** Retire un combattant (un joueur au moins reste ; le personnage courant est recalé). */
export function removeFighter(sit: Situation, ref: FighterRef): Situation {
  if (ref.kind === 'monster') return { ...sit, monsters: sit.monsters.filter((_, i) => i !== ref.index) };
  if (sit.players.length <= 1) return sit;
  const cur = currentIndex(sit);
  const players = sit.players.filter((_, i) => i !== ref.index);
  const next = cur === ref.index ? 0 : cur > ref.index ? cur - 1 : cur;
  return { ...sit, players, current: `J${Math.min(next, players.length - 1) + 1}` };
}

/** Index du personnage courant (0 = J1), d'après ``current`` (J2, nom, archétype, rang). */
export function currentIndex(sit: Situation): number {
  const cur = sit.current;
  if (cur === undefined) return Math.max(0, sit.players.findIndex((p) => !p.dead));
  if (typeof cur === 'number') return cur;
  const m = /^j(\d)$/i.exec(cur.trim());
  if (m) return Number(m[1]) - 1;
  const byName = sit.players.findIndex((p) => p.name?.toLowerCase() === cur.trim().toLowerCase());
  if (byName >= 0) return byName;
  return Math.max(0, sit.players.findIndex((p) => p.archetype === cur.trim().toLowerCase()));
}

/** Première case de départ libre (sinon ``undefined`` : case de départ par défaut du runner). */
export function freeStartCell(sit: Situation, startCells: readonly number[] = AUTO_PLACEMENT): number | undefined {
  return startCells.find((c) => !occupantAt(sit, c));
}

/** Ajoute un joueur en fin d'ordre de jeu (4 au plus). */
export function addPlayer(sit: Situation, archetype: ArchetypeKey, cell?: number): Situation {
  if (sit.players.length >= 4) return sit;
  const c = cell !== undefined && !occupantAt(sit, cell) ? cell : freeStartCell(sit);
  const p: SituationPlayer = { archetype, ...(c !== undefined ? { cell: c } : {}) };
  return { ...sit, players: [...sit.players, p] };
}

/** Échange deux joueurs dans l'ordre de jeu (``delta`` = −1 : monte, +1 : descend). */
export function reorderPlayer(sit: Situation, index: number, delta: -1 | 1): Situation {
  const j = index + delta;
  if (j < 0 || j >= sit.players.length) return sit;
  const players = sit.players.slice();
  [players[index], players[j]] = [players[j]!, players[index]!];
  const cur = currentIndex(sit);
  const next = cur === index ? j : cur === j ? index : cur;
  return { ...sit, players, current: `J${next + 1}` };
}

/**
 * Nouvelle composition (lettres A / D / M dans l'ordre de jeu, 1 à 4) : les joueurs existants gardent leur case
 * dans l'ordre, les nouveaux prennent une case de départ libre. Erreur (français) si la notation est invalide.
 */
export function applyComposition(sit: Situation, compo: string): Situation {
  const letters = compo.trim().toUpperCase();
  if (!/^[ADM]{1,4}$/.test(letters)) throw new Error('composition : 1 à 4 lettres parmi A (Acrobate), D (Dompteur), M (Magicien)');
  let out: Situation = { ...sit, players: [] };
  const used = new Set<number>();
  letters.split('').forEach((ch, i) => {
    const archetype = ARCHETYPE_OF[ch]!;
    const prev = sit.players[i];
    let cell = prev?.cell;
    if (cell === undefined || used.has(cell)) cell = AUTO_PLACEMENT.find((c) => !used.has(c) && !occupantAt({ ...out, players: [] }, c));
    if (cell !== undefined) used.add(cell);
    const kept: SituationPlayer = prev && prev.archetype === archetype ? { ...prev, cell } : { archetype, ...(cell !== undefined ? { cell } : {}) };
    out = { ...out, players: [...out.players, kept] };
  });
  const cur = Math.min(currentIndex(sit), out.players.length - 1);
  return { ...out, current: `J${cur + 1}` };
}

/** Pose ou retire un cadeau sur une case libre. */
export function toggleGift(sit: Situation, cell: number): Situation {
  const gifts = sit.gifts ?? [];
  if (gifts.includes(cell)) return { ...sit, gifts: gifts.filter((g) => g !== cell) };
  if (occupantAt(sit, cell)) return sit;
  return { ...sit, gifts: [...gifts, cell].sort((a, b) => a - b) };
}

export function updatePlayer(sit: Situation, index: number, patch: Partial<SituationPlayer>): Situation {
  return { ...sit, players: sit.players.map((p, i) => (i === index ? clean({ ...p, ...patch }) : p)) };
}

export function updateMonster(sit: Situation, index: number, patch: Partial<SituationMonster>): Situation {
  return { ...sit, monsters: sit.monsters.map((m, i) => (i === index ? clean({ ...m, ...patch }) : m)) };
}

/** Retire les champs ``undefined`` (sortie JSON propre). */
function clean<T extends object>(o: T): T {
  const out = { ...o } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out as T;
}

/** Bascule un état (``vulnerable`` / ``inebranlable``) d'une liste d'états. */
export function toggleState<S extends string>(states: readonly S[] | undefined, s: S, on: boolean): S[] | undefined {
  const set = new Set(states ?? []);
  if (on) set.add(s);
  else set.delete(s);
  return set.size ? [...set] : undefined;
}

/** Texte JSON d'export (indentation lisible, champs vides omis). */
export function exportSituation(sit: Situation): string {
  return JSON.stringify(sit, (_k, v) => (v === undefined ? undefined : v), 2);
}

/**
 * Lecture d'une situation collée ou importée : JSON d'une situation (ou d'un objet ``{ situation }``). Erreur en
 * français si le texte n'est pas du JSON ou n'a pas la forme minimale ; la validation complète est faite par le
 * runner au chargement.
 */
export function parseSituationText(text: string): Situation {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON illisible : ${(e as Error).message}`);
  }
  if (v && typeof v === 'object' && 'situation' in (v as object)) v = (v as { situation: unknown }).situation;
  const o = v as Partial<Situation>;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('la situation doit être un objet JSON');
  if (!Array.isArray(o.players)) throw new Error('« players » manquant (liste des joueurs dans l\'ordre de jeu)');
  if (!Array.isArray(o.monsters)) throw new Error('« monsters » manquant (liste, éventuellement vide)');
  if (!Number.isInteger(o.turn)) throw new Error('« turn » manquant (tour global, entier ≥ 1)');
  return o as Situation;
}
