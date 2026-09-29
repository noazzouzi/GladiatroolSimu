/**
 * Compositions d'équipe : notation compacte « ADDM » (A = Acrobate, D = Dompteur, M = Magicien, dans l'ordre de
 * jeu), avec placement facultatif « ADDM@314,287,286,315 » (case de départ de chaque joueur, dans l'ordre) et nom
 * facultatif « AADM2=AADM@287,314,286,315 » (variante nommée).
 */
import type { ArchetypeKey } from '../data/index.js';
import type { PlayerSetup } from '../scenario/index.js';

export const ARCHETYPE_LETTERS: Readonly<Record<string, ArchetypeKey>> = { A: 'acrobate', D: 'dompteur', M: 'magicien' };

/** Compositions de référence (ÉTUDE §10.1). */
export const REFERENCE_COMPOSITIONS = ['ADDM', 'AADM'] as const;

export interface ParsedComposition {
  /** Nom affiché (partie avant « = », sinon la notation complète). */
  name: string;
  /** Lettres (ordre de jeu). */
  letters: string;
  players: PlayerSetup[];
}

/** Analyse une notation de composition ; lève une erreur (français) si elle est invalide. */
export function parseComposition(spec: string): ParsedComposition {
  const raw = spec.trim();
  let name = raw;
  let body = raw;
  const eq = raw.indexOf('=');
  if (eq >= 0) {
    name = raw.slice(0, eq).trim();
    body = raw.slice(eq + 1).trim();
  }
  const [lettersRaw, cellsRaw] = body.split('@');
  const letters = (lettersRaw ?? '').trim().toUpperCase();
  if (!letters.length || letters.length > 4) throw new Error(`composition « ${spec} » : 1 à 4 lettres parmi A, D, M attendues`);
  const players: PlayerSetup[] = [];
  for (const ch of letters) {
    const a = ARCHETYPE_LETTERS[ch];
    if (!a) throw new Error(`composition « ${spec} » : lettre « ${ch} » inconnue (A = Acrobate, D = Dompteur, M = Magicien)`);
    players.push({ archetype: a });
  }
  if (cellsRaw !== undefined) {
    const cells = cellsRaw.split(',').map((x) => Number(x.trim()));
    if (cells.length !== players.length || cells.some((c) => !Number.isInteger(c))) {
      throw new Error(`composition « ${spec} » : ${players.length} cases de départ attendues après « @ »`);
    }
    cells.forEach((c, i) => (players[i]!.startCell = c));
  }
  return { name, letters, players };
}

/** Notation compacte d'une liste de joueurs (« ADDM »). */
export function compositionOf(players: readonly PlayerSetup[]): string {
  return players.map((p) => p.archetype[0]!.toUpperCase()).join('');
}
