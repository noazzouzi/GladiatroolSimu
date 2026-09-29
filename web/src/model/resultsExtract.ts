/**
 * Synthèse compacte des expériences de ``sim/results/*.json`` pour l'écran Résultats (exécutée au build par le
 * module virtuel ``virtual:resultats`` de vite.config.ts, et par les tests) : statistiques par variante (victoires,
 * IC de Wilson, progression, tour de mort de la Mama et sa répartition), comparaisons appariées. Les combats bruts
 * ne sont pas embarqués.
 */

export interface VariantSummary {
  name: string;
  group: string | null;
  compo: string | null;
  overrides: Record<string, unknown> | null;
  policies: Record<string, unknown> | null;
  runs: number;
  wins: number;
  winRate: number;
  ci: [number, number];
  turn: number;
  progress: number;
  objectives: number;
  deaths: number;
  mamaRate: number;
  mamaTurn: number | null;
  mamaTurnCi: [number, number] | null;
  /** Répartition du tour de mort de la Mama : tour → nombre de combats ; « 0 » = jamais tuée. */
  mamaHist: Record<string, number>;
  /** Répartition du tour de victoire ; « 0 » = défaite ou limite. */
  winHist: Record<string, number>;
  reasons: Record<string, number>;
  msPerFight: number;
}

export interface ComparisonSummary {
  a: string;
  b: string;
  seeds: number;
  aOnly: number;
  bOnly: number;
  p: number;
  progressDiff: { mean: number; low: number; high: number };
  turnDiff: { mean: number; low: number; high: number };
}

export interface ExperimentSummary {
  id: string;
  title: string;
  seeds: string;
  mode: string;
  variants: VariantSummary[];
  comparisons: ComparisonSummary[];
}

interface RawVariant {
  name: string;
  group?: string;
  description?: { compo?: string; configOverrides?: Record<string, unknown>; policies?: Record<string, unknown> };
  runs: number;
  wins: number;
  winRate: number;
  winRateCi95: { low: number; high: number };
  turnReached: { mean: number };
  progress: { mean: number };
  objectives: { mean: number };
  playerDeaths: { mean: number };
  mamaKilledRate: number;
  mamaKilledTurn: { mean: number; ci95: { low: number; high: number } } | null;
  reasons: Record<string, number>;
  msPerFight: number;
}

interface RawRun {
  v: string;
  win: boolean;
  turn: number;
  mamaT: number | null;
}

interface RawExperiment {
  id: string;
  title: string;
  seeds: string;
  mode: string;
  variants: RawVariant[];
  comparisons: {
    a: string;
    b: string;
    seeds: number;
    aOnly: number;
    bOnly: number;
    mcnemarP: number;
    progressDiff: { mean: number; ci95: { low: number; high: number } };
    turnDiff: { mean: number; ci95: { low: number; high: number } };
  }[];
  runs?: RawRun[];
}

function round(v: number, d = 4): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

export function extractExperiment(raw: RawExperiment): ExperimentSummary {
  const runs = raw.runs ?? [];
  return {
    id: raw.id,
    title: raw.title,
    seeds: raw.seeds,
    mode: raw.mode,
    variants: raw.variants.map((v) => {
      const mine = runs.filter((r) => r.v === v.name);
      const mamaHist: Record<string, number> = {};
      const winHist: Record<string, number> = {};
      for (const r of mine) {
        const m = String(r.mamaT ?? 0);
        mamaHist[m] = (mamaHist[m] ?? 0) + 1;
        const w = String(r.win ? r.turn : 0);
        winHist[w] = (winHist[w] ?? 0) + 1;
      }
      return {
        name: v.name,
        group: v.group ?? null,
        compo: v.description?.compo ?? null,
        overrides: v.description?.configOverrides ?? null,
        policies: v.description?.policies ?? null,
        runs: v.runs,
        wins: v.wins,
        winRate: round(v.winRate),
        ci: [round(v.winRateCi95.low), round(v.winRateCi95.high)],
        turn: round(v.turnReached.mean, 3),
        progress: round(v.progress.mean),
        objectives: round(v.objectives.mean, 3),
        deaths: round(v.playerDeaths.mean, 3),
        mamaRate: round(v.mamaKilledRate),
        mamaTurn: v.mamaKilledTurn ? round(v.mamaKilledTurn.mean, 3) : null,
        mamaTurnCi: v.mamaKilledTurn ? [round(v.mamaKilledTurn.ci95.low, 3), round(v.mamaKilledTurn.ci95.high, 3)] : null,
        mamaHist,
        winHist,
        reasons: v.reasons,
        msPerFight: Math.round(v.msPerFight),
      };
    }),
    comparisons: raw.comparisons.map((c) => ({
      a: c.a,
      b: c.b,
      seeds: c.seeds,
      aOnly: c.aOnly,
      bOnly: c.bOnly,
      p: round(c.mcnemarP, 5),
      progressDiff: { mean: round(c.progressDiff.mean, 5), low: round(c.progressDiff.ci95.low, 5), high: round(c.progressDiff.ci95.high, 5) },
      turnDiff: { mean: round(c.turnDiff.mean, 4), low: round(c.turnDiff.ci95.low, 4), high: round(c.turnDiff.ci95.high, 4) },
    })),
  };
}

/** Toutes les expériences (fichiers JSON déjà lus), indexées par identifiant. */
export function extractResults(raws: unknown[]): Record<string, ExperimentSummary> {
  const out: Record<string, ExperimentSummary> = {};
  for (const r of raws) {
    const e = r as RawExperiment;
    if (!e || typeof e !== 'object' || !e.id || !Array.isArray(e.variants)) continue;
    out[e.id] = extractExperiment(e);
  }
  return out;
}
