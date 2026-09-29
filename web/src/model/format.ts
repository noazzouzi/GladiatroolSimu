/** Formats français (nombres, pourcentages, durées). */

const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function fmtInt(v: number): string {
  return intFmt.format(Math.round(v));
}

/**
 * Décimal français. L'arrondi suit `toFixed` (valeur binaire exacte : 10,815 → 10,81), comme les tableaux de
 * sim/results/TABLEAUX.md et docs/RESULTATS.md ; `Intl` arrondirait la décimale affichée (10,82).
 */
export function fmtDec(v: number, digits = 1): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(v.toFixed(digits)));
}

/** Pourcentage d'une fraction 0..1. */
export function fmtPct(v: number, digits = 1): string {
  return `${fmtDec(100 * v, digits)} %`;
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${fmtInt(ms)} ms` : `${fmtDec(ms / 1000, 1)} s`;
}

/** p-valeur lisible. */
export function fmtP(p: number): string {
  if (p < 0.001) return 'p < 0,001';
  return `p = ${fmtDec(p, p < 0.1 ? 3 : 2)}`;
}

/** Signe explicite. */
export function fmtSigned(v: number, digits = 1): string {
  const s = fmtDec(Math.abs(v), digits);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
