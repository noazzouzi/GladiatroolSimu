/**
 * Campagnes d'expériences comparatives (partie pure, sans API Node) : définitions des expériences du rapport
 * docs/RESULTATS.md (compositions, effectifs réduits, politiques, placement, sensibilité aux hypothèses), exécution
 * d'un combat avec analyse (``runAnalyzedJob``), enregistrements compacts et synthèse (statistiques du runner,
 * comparaisons APPARIÉES à la variante de référence de chaque composition). L'exécution multi-processus et les
 * fichiers sont dans ``sim/src/cli/campaign.ts``.
 */
import type { ConfigOverrides } from '../data/index.js';
import { pairedComparison, runFight, variantStats } from '../runner/index.js';
import type { FightRunResult, PairedComparison, Variant, VariantStats } from '../runner/index.js';
import type { PlannerMode, PolicyOptions } from '../planner/index.js';
import { aggregateAnalyses, analyzeTrace, type AnalysisAggregate, type FightAnalysis } from './fightAnalysis.js';

/** Variante de campagne : variante du runner + référence appariée (nom d'une autre variante de l'expérience). */
export interface CampaignVariant extends Variant {
  /** Variante de référence pour la comparaison appariée (défaut : aucune). */
  ref?: string;
  /** Groupe d'affichage (ex. « ADDM », « AADM »). */
  group?: string;
}

export interface CampaignExperiment {
  id: string;
  title: string;
  /** Graines par défaut (graines d'évaluation NON utilisées pendant l'amélioration du planificateur). */
  seeds: string;
  variants: CampaignVariant[];
  /** Analyse détaillée (rejeu de la trace) de chaque combat. */
  analyze: boolean;
  mode?: PlannerMode;
}

/** Enregistrement compact d'un combat (fichiers de résultats). */
export interface CompactRun {
  v: string;
  seed: number;
  win: boolean;
  reason: string | null;
  turn: number;
  progress: number;
  alive: number;
  deaths: { a: string; t: number; c: string }[];
  obj: { id: string; t: number }[];
  mamaT: number | null;
  mamaHp: number;
  gifts: [number, number];
  /** Choix : [tour, nature, joueur, libellé]. */
  choices: [number, string, string, string][];
  ms: number;
  planP95: number;
}

export interface AnalyzedJobResult {
  run: FightRunResult;
  analysis: FightAnalysis | null;
}

/** Joue un combat de la variante (trace si analyse), puis l'analyse par rejeu. */
export function runAnalyzedJob(v: Variant, seed: number, o: { mode?: PlannerMode; analyze: boolean; maxTurn?: number }): AnalyzedJobResult {
  const run = runFight(
    { ...(v.players ? { players: v.players } : { compo: v.compo ?? v.name }), seed },
    {
      mode: v.mode ?? o.mode ?? 'fast',
      planner: v.planner,
      policies: v.policies,
      configOverrides: v.configOverrides,
      monsters: v.monsters,
      maxTurn: o.maxTurn ?? 20,
      trace: o.analyze,
    },
  );
  run.compo = v.name;
  let analysis: FightAnalysis | null = null;
  if (o.analyze && run.trace) {
    analysis = analyzeTrace(run.trace);
    analysis.compo = v.name;
    if (analysis.victory !== run.victory || analysis.turnReached !== run.turnReached) {
      throw new Error(`rejeu divergent pour ${v.name} graine ${seed} (${run.victory}/${run.turnReached} contre ${analysis.victory}/${analysis.turnReached})`);
    }
  }
  delete run.trace;
  return { run, analysis };
}

export function compactRun(v: string, r: FightRunResult): CompactRun {
  return {
    v,
    seed: r.seed,
    win: r.victory,
    reason: r.reason,
    turn: r.turnReached,
    progress: Math.round(r.progress * 10000) / 10000,
    alive: r.playersAlive,
    deaths: r.playerDeaths.map((d) => ({ a: d.archetype, t: d.turn, c: d.cause })),
    obj: r.objectives.map((o) => ({ id: o.id, t: o.turn })),
    mamaT: r.mamaKilledTurn,
    mamaHp: r.mamaHpLeft,
    gifts: [r.giftsSpawned, r.giftsTaken],
    choices: r.choices.map((c) => [c.turn, c.kind, c.fighter, c.label]),
    ms: Math.round(r.timing.totalMs),
    planP95: Math.round(r.timing.planMsP95),
  };
}

/** Résultat d'un combat reconstruit (assez pour ``variantStats`` / ``pairedComparison``) depuis un enregistrement compact. */
export function runFromCompact(c: CompactRun): FightRunResult {
  return {
    compo: c.v,
    seed: c.seed,
    mode: 'fast',
    winner: c.win ? 'players' : null,
    victory: c.win,
    reason: c.reason as FightRunResult['reason'],
    turnReached: c.turn,
    playersAlive: c.alive,
    playerDeaths: c.deaths.map((d) => ({ name: d.a, archetype: d.a, turn: d.t, cause: d.c })),
    objectives: c.obj.map((o) => ({ id: o.id, name: o.id, tier: 0, turn: o.t })),
    objectivesCount: c.obj.length,
    enemyHpTotal: 0,
    enemyHpDestroyed: 0,
    progress: c.progress,
    monstersSpawned: 0,
    monstersKilled: 0,
    mamaArrived: c.mamaT !== null || c.mamaHp > 0,
    mamaKilledTurn: c.mamaT,
    mamaHpLeft: c.mamaHp,
    giftsSpawned: c.gifts[0],
    giftsTaken: c.gifts[1],
    choices: [],
    timing: { totalMs: c.ms, playerTurns: 0, planMsMedian: 0, planMsP95: c.planP95, planMsMax: 0, monsterMs: 0, replans: 0 },
  };
}

export interface ExperimentReport {
  id: string;
  title: string;
  seeds: string;
  mode: PlannerMode;
  variants: (VariantStats & { group?: string; ref?: string; description: Record<string, unknown> })[];
  comparisons: PairedComparison[];
  analysis: Record<string, AnalysisAggregate>;
  /** Choix par variante : « nature|joueur|libellé » → nombre (joueur : archétype sans numéro). */
  choices: Record<string, Record<string, number>>;
  /** Enregistrements compacts (sans les choix, résumés dans ``choices``). */
  runs: Omit<CompactRun, 'choices'>[];
}

/** Synthèse d'une expérience : statistiques par variante, comparaisons appariées à la référence, analyses agrégées. */
export function summarizeCampaign(
  exp: CampaignExperiment,
  seeds: string,
  runs: readonly CompactRun[],
  analyses: readonly FightAnalysis[],
): ExperimentReport {
  const byName = new Map<string, FightRunResult[]>();
  for (const v of exp.variants) byName.set(v.name, []);
  for (const c of runs) byName.get(c.v)?.push(runFromCompact(c));
  const variants = exp.variants.map((v) => ({
    ...variantStats(v.name, byName.get(v.name) ?? []),
    ...(v.group ? { group: v.group } : {}),
    ...(v.ref ? { ref: v.ref } : {}),
    description: describeVariant(v),
  }));
  const comparisons: PairedComparison[] = [];
  for (const v of exp.variants) {
    if (!v.ref) continue;
    comparisons.push(pairedComparison(v.name, byName.get(v.name) ?? [], v.ref, byName.get(v.ref) ?? []));
  }
  const analysis: Record<string, AnalysisAggregate> = {};
  if (exp.analyze) {
    for (const v of exp.variants) analysis[v.name] = aggregateAnalyses(analyses.filter((a) => a.compo === v.name));
  }
  const choices: Record<string, Record<string, number>> = {};
  for (const c of runs) {
    const m = (choices[c.v] ??= {});
    for (const [, kind, who, label] of c.choices) {
      const k = `${kind}|${who.replace(/\s*\d+$/, '')}|${label}`;
      m[k] = (m[k] ?? 0) + 1;
    }
  }
  return {
    id: exp.id,
    title: exp.title,
    seeds,
    mode: exp.mode ?? 'fast',
    variants,
    comparisons,
    analysis,
    choices,
    runs: runs.map(({ choices: _c, ...rest }) => rest),
  };
}

function describeVariant(v: Variant): Record<string, unknown> {
  const d: Record<string, unknown> = { compo: v.compo ?? v.name };
  if (v.configOverrides) d.configOverrides = v.configOverrides;
  if (v.policies) d.policies = v.policies;
  if (v.planner) d.planner = v.planner;
  return d;
}

/** Clé de cache d'un combat (déterministe en mode fast : même variante hors nom, même graine → même combat). */
export function runCacheKey(v: Variant, seed: number, mode: PlannerMode): string {
  const { name: _name, ...rest } = v as Variant & { ref?: string; group?: string };
  const clean: Record<string, unknown> = { ...rest };
  delete clean.ref;
  delete clean.group;
  return JSON.stringify({ v: sortKeys(clean), seed, mode });
}

function sortKeys(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(x as object).sort()) o[k] = sortKeys((x as Record<string, unknown>)[k]);
    return o;
  }
  return x;
}

// ---------------------------------------------------------------------------------------------
// Définitions des expériences du rapport
// ---------------------------------------------------------------------------------------------

const REFS = ['ADDM', 'AADM'] as const;

function withRefs(extra: (ref: string) => CampaignVariant[]): CampaignVariant[] {
  const out: CampaignVariant[] = [];
  for (const r of REFS) {
    out.push({ name: r, compo: r, group: r });
    out.push(...extra(r));
  }
  return out;
}

function policyVariants(label: string, make: (ref: string) => { suffix: string; policies: PolicyOptions }[]): (ref: string) => CampaignVariant[] {
  return (ref) => make(ref).map((m) => ({ name: `${ref} ${label} ${m.suffix}`, compo: ref, policies: m.policies, ref, group: ref }));
}

/** Hypothèses non tranchées testées (QUESTIONS_OUVERTES P0 / P1). */
export const SENSITIVITY: readonly { key: string; label: string; question: string; overrides: ConfigOverrides }[] = [
  { key: 'q3', label: 'pics ×2 pour les joueurs', question: 'Q3', overrides: { spikes: { playersDoubledInside: true } } },
  { key: 'q4', label: 'pics : 2 000 au début du tour des joueurs', question: 'Q4', overrides: { spikes: { playerTurnStartDamage: 2000 } } },
  { key: 'q1a', label: 'timeline : Troolls par initiative', question: 'Q1', overrides: { timeline: { model: 'alternate_initiative' } } },
  { key: 'q1b', label: 'timeline : tous les monstres après la Mama', question: 'Q1', overrides: { timeline: { model: 'monsters_after_mama' } } },
  { key: 'q1c', label: 'timeline : nouveaux venus en tête', question: 'Q1', overrides: { timeline: { newMonstersInsertion: 'after_mama' } } },
  { key: 'q5', label: 'apparitions uniformes', question: 'Q5', overrides: { spawn: { mode: 'uniform_slots' } } },
  { key: 'q2a', label: 'IA : cible la plus faible', question: 'Q2', overrides: { ai: { focus: 'lowestHp' } } },
  { key: 'q2b', label: 'IA : joue même dans les pics', question: 'Q2', overrides: { ai: { skipIfInSpikes: false } } },
  { key: 'q2c', label: 'IA : séquence gloutonne', question: 'Q2', overrides: { ai: { sequenceMode: 'greedy' } } },
  { key: 'q12', label: '3 objectifs proposés par vote', question: 'Q12', overrides: { objectives: { offerCount: 3 } } },
  { key: 'q14', label: 'cadeaux rares (p = 0,3)', question: 'Q14', overrides: { gifts: { spawnProbability: 0.3 } } },
  { key: 'q20', label: 'PV par archétype (A 35 000, M 25 000)', question: 'Q20', overrides: { archetypes: { hpMode: 'passiveApplies' } } },
];

/**
 * Scénario pessimiste combiné (hypothèses défavorables aux joueurs, sauf ``monsters_after_mama`` qui rend le combat
 * ingagnable pour les deux compositions — voir l'expérience ``sensibilite``).
 */
export const PESSIMISTIC: ConfigOverrides = {
  spikes: { playersDoubledInside: true, playerTurnStartDamage: 2000 },
  ai: { skipIfInSpikes: false },
  gifts: { spawnProbability: 0.3 },
};

export const CAMPAIGN: readonly CampaignExperiment[] = [
  {
    id: 'compos-ref',
    title: 'Compositions de référence ADDM et AADM (analyse détaillée)',
    seeds: '1001-1200',
    analyze: true,
    variants: [
      { name: 'ADDM', compo: 'ADDM', group: 'ADDM' },
      { name: 'AADM', compo: 'AADM', ref: 'ADDM', group: 'AADM' },
    ],
  },
  {
    id: 'compos-autres',
    title: 'Autres compositions à 4 (ordre de jeu)',
    seeds: '1001-1060',
    analyze: true,
    variants: [
      { name: 'ADDM', compo: 'ADDM' },
      { name: 'AADM', compo: 'AADM', ref: 'ADDM' },
      { name: 'AAMD', compo: 'AAMD', ref: 'AADM' },
      { name: 'ADMD', compo: 'ADMD', ref: 'ADDM' },
      { name: 'ADDD', compo: 'ADDD', ref: 'ADDM' },
      { name: 'DDDM', compo: 'DDDM', ref: 'ADDM' },
      { name: 'ADMM', compo: 'ADMM', ref: 'ADDM' },
      { name: 'DADM', compo: 'DADM', ref: 'ADDM' },
      { name: 'AMDD', compo: 'AMDD', ref: 'ADDM' },
    ],
  },
  {
    id: 'effectifs',
    title: 'Effectifs réduits (3, 2 et 1 joueurs)',
    seeds: '1001-1030',
    analyze: false,
    variants: [
      { name: 'ADDM', compo: 'ADDM' },
      { name: 'ADM', compo: 'ADM', ref: 'ADDM' },
      { name: 'ADD', compo: 'ADD', ref: 'ADDM' },
      { name: 'AAD', compo: 'AAD', ref: 'ADDM' },
      { name: 'AD', compo: 'AD', ref: 'ADDM' },
      { name: 'DD', compo: 'DD', ref: 'ADDM' },
      { name: 'A', compo: 'A', ref: 'ADDM' },
      { name: 'D', compo: 'D', ref: 'ADDM' },
      { name: 'M', compo: 'M', ref: 'ADDM' },
    ],
  },
  {
    id: 'bonus',
    title: 'Politique des Acclamations (bonus)',
    seeds: '1001-1060',
    analyze: false,
    variants: withRefs(
      policyVariants('bonus', () => [
        { suffix: 'PO_first', policies: { acclamation: 'PO_first' } },
        { suffix: 'PA_first', policies: { acclamation: 'PA_first' } },
        { suffix: 'DF_first', policies: { acclamation: 'DF_first' } },
      ]),
    ),
  },
  {
    id: 'votes',
    title: 'Politique des votes d’objectifs',
    seeds: '1001-1060',
    analyze: false,
    variants: withRefs(
      policyVariants('vote', () => [
        { suffix: 'fixed', policies: { vote: 'fixed' } },
        { suffix: 'preference', policies: { vote: 'preference' } },
      ]),
    ),
  },
  {
    id: 'placement',
    title: 'Placement initial (cases 314 / 287 / 286 / 315)',
    seeds: '1001-1060',
    analyze: false,
    variants: [
      { name: 'ADDM', compo: 'ADDM', group: 'ADDM' },
      { name: 'ADDM A287-D314', compo: 'ADDM A287-D314=ADDM@287,314,286,315', ref: 'ADDM', group: 'ADDM' },
      { name: 'ADDM A314-M287', compo: 'ADDM A314-M287=ADDM@314,286,315,287', ref: 'ADDM', group: 'ADDM' },
      { name: 'ADDM A286', compo: 'ADDM A286=ADDM@286,287,314,315', ref: 'ADDM', group: 'ADDM' },
      { name: 'AADM', compo: 'AADM', group: 'AADM' },
      { name: 'AADM A287-A314', compo: 'AADM A287-A314=AADM@287,314,286,315', ref: 'AADM', group: 'AADM' },
      { name: 'AADM A314-D287', compo: 'AADM A314-D287=AADM@314,286,287,315', ref: 'AADM', group: 'AADM' },
    ],
  },
  {
    id: 'sensibilite',
    title: 'Sensibilité aux hypothèses non tranchées (QUESTIONS_OUVERTES P0 / P1)',
    seeds: '1001-1040',
    analyze: false,
    variants: [
      { name: 'ADDM', compo: 'ADDM', group: 'base' },
      { name: 'AADM', compo: 'AADM', ref: 'ADDM', group: 'base' },
      ...SENSITIVITY.flatMap((h): CampaignVariant[] => [
        { name: `ADDM ${h.key}`, compo: 'ADDM', configOverrides: h.overrides, ref: 'ADDM', group: h.key },
        { name: `AADM ${h.key}`, compo: 'AADM', configOverrides: h.overrides, ref: `ADDM ${h.key}`, group: h.key },
      ]),
    ],
  },
  {
    id: 'cadeaux',
    title: 'Fréquence des cadeaux (Q14) : confirmation sur plus de graines',
    seeds: '1001-1160',
    analyze: false,
    variants: [
      { name: 'ADDM', compo: 'ADDM', group: 'base' },
      { name: 'AADM', compo: 'AADM', ref: 'ADDM', group: 'base' },
      { name: 'ADDM q14', compo: 'ADDM', configOverrides: { gifts: { spawnProbability: 0.3 } }, ref: 'ADDM', group: 'q14' },
      { name: 'AADM q14', compo: 'AADM', configOverrides: { gifts: { spawnProbability: 0.3 } }, ref: 'ADDM q14', group: 'q14' },
    ],
  },
  {
    id: 'pessimiste',
    title: 'Scénario pessimiste combiné (Q3 ×2 dans les pics + Q4 2 000 + Q2 jeu dans les pics + Q14 cadeaux rares)',
    seeds: '1001-1160',
    analyze: true,
    variants: [
      { name: 'ADDM pess', compo: 'ADDM', configOverrides: PESSIMISTIC, group: 'pess' },
      { name: 'AADM pess', compo: 'AADM', configOverrides: PESSIMISTIC, ref: 'ADDM pess', group: 'pess' },
    ],
  },
  {
    id: 'oracle',
    title: 'Effet de l’information cachée : planificateur qui connaît les tirages futurs (triche) contre planificateur neutre',
    seeds: '1001-1080',
    analyze: false,
    variants: [
      { name: 'ADDM pess', compo: 'ADDM', configOverrides: PESSIMISTIC, group: 'ADDM' },
      { name: 'ADDM pess oracle', compo: 'ADDM', configOverrides: PESSIMISTIC, planner: { oracle: true }, ref: 'ADDM pess', group: 'ADDM' },
      { name: 'AADM pess', compo: 'AADM', configOverrides: PESSIMISTIC, group: 'AADM' },
      { name: 'AADM pess oracle', compo: 'AADM', configOverrides: PESSIMISTIC, planner: { oracle: true }, ref: 'AADM pess', group: 'AADM' },
    ],
  },
  {
    id: 'bonus-pess',
    title: 'Politique des Acclamations dans le scénario pessimiste',
    seeds: '1001-1060',
    analyze: false,
    variants: (['ADDM', 'AADM'] as const).flatMap((c): CampaignVariant[] => [
      { name: `${c} pess`, compo: c, configOverrides: PESSIMISTIC, group: c },
      ...(['PO_first', 'PA_first', 'DF_first'] as const).map((b) => ({
        name: `${c} pess bonus ${b}`,
        compo: c,
        configOverrides: PESSIMISTIC,
        policies: { acclamation: b },
        ref: `${c} pess`,
        group: c,
      })),
    ]),
  },
];
