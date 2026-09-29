/**
 * Interface en ligne de commande du simulateur (français) : ``npm run cli -- <commande> [options]``.
 *
 * Commandes : ``carte``, ``simuler``, ``planifier``, ``comparer``, ``bench``, ``aide``. Voir docs/GUIDE.md.
 * ``main(argv, io)`` est exporté pour les tests (sorties capturées) ; le module ne s'exécute que lancé directement.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gameData, type ConfigOverrides } from '../data/index.js';
import { fmtNum } from '../engine/index.js';
import { configChoicePolicy, planPlayerTurn, planTeamTurn, type PlannerMode, type PolicyOptions } from '../planner/index.js';
import {
  BENCH_SPEC,
  benchSummary,
  buildSituation,
  fighterLabels,
  formatBench,
  formatExperimentTable,
  parseComposition,
  parseSeeds,
  renderMap,
  replayTrace,
  resultLine,
  runFight,
  type ExperimentSpec,
  type FightTrace,
  type MonsterControllerName,
  type Situation,
  type Variant,
} from '../runner/index.js';
import { runExperiment } from '../runner/nodeExperiment.js';
import type { GladiatroolFight } from '../scenario/index.js';

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
}

const defaultIo: CliIo = {
  out: (l) => process.stdout.write(`${l}\n`),
  err: (l) => process.stderr.write(`${l}\n`),
};

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

export interface ParsedArgs {
  command: string;
  options: Map<string, string | true>;
  positional: string[];
}

/** « commande --clé valeur --drapeau --clé=valeur ». */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const options = new Map<string, string | true>();
  const positional: string[] = [];
  let command = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) options.set(a.slice(2, eq), a.slice(eq + 1));
      else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          options.set(a.slice(2), next);
          i++;
        } else options.set(a.slice(2), true);
      }
    } else if (!command) command = a;
    else positional.push(a);
  }
  return { command, options, positional };
}

class CliError extends Error {}

function str(p: ParsedArgs, key: string, def?: string): string | undefined {
  const v = p.options.get(key);
  if (v === undefined) return def;
  if (v === true) throw new CliError(`--${key} : valeur attendue`);
  return v;
}

function int(p: ParsedArgs, key: string, def?: number): number | undefined {
  const v = str(p, key);
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new CliError(`--${key} : entier attendu (reçu « ${v} »)`);
  return n;
}

function flag(p: ParsedArgs, key: string): boolean {
  return p.options.get(key) === true || p.options.get(key) === 'oui';
}

function mode(p: ParsedArgs, def: PlannerMode = 'fast'): PlannerMode {
  const m = str(p, 'mode', def)!;
  if (m !== 'fast' && m !== 'deep' && m !== 'greedy') throw new CliError(`--mode : fast, deep ou greedy (reçu « ${m} »)`);
  return m;
}

function monsters(p: ParsedArgs): MonsterControllerName {
  const m = str(p, 'monstres', 'ai')!;
  if (m !== 'ai' && m !== 'simple' && m !== 'passive') throw new CliError(`--monstres : ai, simple ou passive (reçu « ${m} »)`);
  return m;
}

function readJson<T>(file: string, what: string): T {
  try {
    return JSON.parse(readFileSync(resolvePath(file), 'utf8')) as T;
  } catch (e) {
    throw new CliError(`${what} « ${file} » illisible : ${e instanceof Error ? e.message : String(e)}`);
  }
}

function configOverrides(p: ParsedArgs): ConfigOverrides | undefined {
  const f = str(p, 'config');
  return f ? readJson<ConfigOverrides>(f, 'configuration') : undefined;
}

function policies(p: ParsedArgs): PolicyOptions | undefined {
  const o: PolicyOptions = {};
  const b = str(p, 'bonus');
  if (b) {
    if (!['planner', 'PO_first', 'PA_first', 'DF_first'].includes(b)) throw new CliError('--bonus : planner, PO_first, PA_first ou DF_first');
    o.acclamation = b as PolicyOptions['acclamation'];
  }
  const v = str(p, 'vote');
  if (v) {
    if (!['planner', 'fixed', 'preference'].includes(v)) throw new CliError('--vote : planner, fixed ou preference');
    o.vote = v as PolicyOptions['vote'];
  }
  const g = str(p, 'cadeaux');
  if (g) {
    if (!['planner', 'preference'].includes(g)) throw new CliError('--cadeaux : planner ou preference');
    o.gift = g as PolicyOptions['gift'];
  }
  return Object.keys(o).length ? o : undefined;
}

function workers(p: ParsedArgs): number {
  return int(p, 'coeurs', Math.min(4, availableParallelism()))!;
}

// ---------------------------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------------------------

const HELP = `Simulateur du Gladiatrool — commandes (npm run cli -- <commande> [options]) :

  carte [--coords]
      Carte ASCII de l'arène : numéros de case, pics (^), cases de départ (J), cadeaux (*), centre (+), Mama (M).

  simuler --compo ADDM --graine 42 [--mode fast|deep|greedy] [--journal] [--trace fichier.json] [--json]
          [--monstres ai|simple|passive] [--tours-max 20] [--config surcharges.json] [--bonus PA_first] [--vote fixed]
      Un combat complet ; --journal : journal lisible tour par tour (plans expliqués, choix motivés).

  planifier --situation fichier.json [--mode fast|deep] [--seul] [--alternatives]
  planifier --trace trace.json (--tour 3 --joueur J2 | --etape 120) [--mode deep]
      Meilleur plan du personnage courant et des joueurs suivants du tour global (format : docs/FORMAT_SITUATION.md).

  comparer --compos ADDM,AADM[,NOM=AADM@287,314,286,315] --graines 1-100 [--mode fast] [--coeurs 4]
           [--config surcharges.json] [--variantes variantes.json] [--sortie resultats.json] [--tours-max 20]
      Tableau comparatif (mêmes graines pour toutes les variantes : comparaison appariée).

  bench [--graines 1-24] [--coeurs 4] [--sortie bench.json] [--json]
      Évaluation standard : ADDM et AADM, graines 1-24, mode fast ; résumé + rapport JSON.

  aide
      Cette aide.`;

function cmdCarte(p: ParsedArgs, io: CliIo): number {
  io.out(renderMap(gameData, { coords: flag(p, 'coords') }));
  return 0;
}

function cmdSimuler(p: ParsedArgs, io: CliIo): number {
  const compo = str(p, 'compo', 'ADDM')!;
  parseComposition(compo);
  const seed = int(p, 'graine', 1)!;
  const tracePath = str(p, 'trace');
  const r = runFight(
    { compo, seed },
    {
      mode: mode(p),
      journal: flag(p, 'journal'),
      trace: !!tracePath,
      monsters: monsters(p),
      maxTurn: int(p, 'tours-max', 20),
      configOverrides: configOverrides(p),
      policies: policies(p),
    },
  );
  if (flag(p, 'json')) {
    io.out(JSON.stringify({ ...r, trace: undefined }, null, 1));
  } else {
    if (r.journal) for (const l of r.journal) io.out(l);
    else {
      io.out(`Objectifs : ${r.objectives.map((o) => `${o.name} (T${o.turn})`).join(', ') || 'aucun'}`);
      io.out(`Choix : ${r.choices.length} (Acclamations, cadeaux, votes) ; cadeaux ramassés ${r.giftsTaken}/${r.giftsSpawned}`);
      io.out(
        `Temps : ${fmtNum(Math.round(r.timing.totalMs))} ms (${r.timing.playerTurns} tours de joueurs, médiane ${Math.round(r.timing.planMsMedian)} ms, ` +
          `max ${Math.round(r.timing.planMsMax)} ms ; monstres ${Math.round(r.timing.monsterMs)} ms)`,
      );
    }
    if (!r.journal) {
      io.out('');
      io.out(resultLine(r));
    }
  }
  if (tracePath && r.trace) {
    writeFileSync(resolvePath(tracePath), JSON.stringify(r.trace));
    io.err(`Trace écrite : ${tracePath} (${r.trace.steps.length} pas).`);
  }
  return 0;
}

function describeFight(fight: GladiatroolFight, io: CliIo): void {
  const st = fight.getStatus();
  const cur = fight.getCurrentFighter();
  io.out(`Tour ${fight.turn} — ${st.kind === 'playerTurn' && cur ? `tour de ${cur.name} (${cur.ap} PA, ${cur.mp} PM)` : st.kind}`);
  const obj = fight.getActiveObjective();
  io.out(`Objectifs réalisés : ${fight.scenario.completed.length}${obj ? ` ; en cours : « ${obj.name} » (palier ${obj.tier})` : ''}`);
  for (const f of fight.state.fighters) {
    if (!f.alive || f.cell < 0 || f.team === 'scenario') continue;
    const st2: string[] = [];
    if (f.hasState(5994)) st2.push('Vulnérable');
    if (f.hasState(157)) st2.push('Inébranlable');
    if (fight.ctx.grid.isSpike(f.cell)) st2.push('dans les pics');
    io.out(`  ${f.name.padEnd(18)} case ${String(f.cell).padStart(3)}  ${fmtNum(f.hp).padStart(7)} / ${fmtNum(f.maxHp)} PV${st2.length ? `  (${st2.join(', ')})` : ''}`);
  }
  io.out('');
  io.out(renderMap(fight.ctx.data, { labels: fighterLabels(fight.state, fight.scenario.playerIds) }));
  io.out('');
}

function cmdPlanifier(p: ParsedArgs, io: CliIo): number {
  const sitPath = str(p, 'situation');
  const tracePath = str(p, 'trace');
  let fight: GladiatroolFight;
  if (sitPath) {
    const built = buildSituation(readJson<Situation>(sitPath, 'situation'));
    for (const w of built.warnings) io.err(`Attention : ${w}`);
    fight = built.fight;
  } else if (tracePath) {
    const trace = readJson<FightTrace>(tracePath, 'trace');
    const joueur = str(p, 'joueur');
    const rep = replayTrace(trace, {
      turn: int(p, 'tour'),
      fighter: joueur === undefined ? undefined : /^\d+$/.test(joueur) ? Number(joueur) : joueur,
      step: int(p, 'etape'),
    });
    if (!rep.reached) io.err(`Point d'arrêt non atteint : fin de la trace (pas ${rep.stepsApplied}).`);
    fight = rep.fight;
  } else throw new CliError('planifier : --situation fichier.json ou --trace trace.json requis');
  const st = fight.getStatus();
  describeFight(fight, io);
  if (st.kind !== 'playerTurn') {
    io.out(`Pas de tour de joueur à planifier (point de décision : ${st.kind}).`);
    return 1;
  }
  const m = mode(p, 'deep');
  if (flag(p, 'seul')) {
    const plan = planPlayerTurn(fight, { mode: m, choicePolicy: configChoicePolicy });
    io.out(`Meilleur plan de ${plan.fighterName} (mode ${m}, ${Math.round(plan.stats.timeMs)} ms, ${plan.stats.simulations} simulations) :`);
    io.out(plan.explanation);
    io.out(`Actions : ${JSON.stringify(plan.actions)}`);
    if (flag(p, 'alternatives')) {
      plan.alternatives.forEach((a, i) => {
        io.out('');
        io.out(`Alternative ${i + 1} (score ${fmtNum(Math.round(a.score))}) :`);
        io.out(a.explanation);
      });
    }
    return 0;
  }
  const team = planTeamTurn(fight, { mode: m, choicePolicy: configChoicePolicy });
  io.out(`Plan du tour global ${team.turn} (mode ${m}, ${Math.round(team.timeMs)} ms) :`);
  io.out('');
  for (const step of team.steps) {
    io.out(`── ${step.fighterName} ──`);
    io.out(step.plan.explanation);
    io.out(`Actions : ${JSON.stringify(step.plan.actions)}`);
    if (flag(p, 'alternatives')) {
      step.plan.alternatives.forEach((a, i) => io.out(`  alternative ${i + 1} (score ${fmtNum(Math.round(a.score))}) : ${a.explanation.split('\n').slice(0, 3).join(' / ')}`));
    }
    io.out('');
  }
  io.out(team.explanation);
  return 0;
}

function progressReporter(io: CliIo): (done: number, total: number, r: { seed: number; reason: string | null; turnReached: number }, variant: string) => void {
  return (done, total, r, variant) => io.err(`[${done}/${total}] ${variant} graine ${r.seed} : ${r.reason ?? '?'} au tour ${r.turnReached}`);
}

async function cmdComparer(p: ParsedArgs, io: CliIo): Promise<number> {
  const variantsFile = str(p, 'variantes');
  const overrides = configOverrides(p);
  const pol = policies(p);
  let variants: Variant[];
  if (variantsFile) variants = readJson<Variant[]>(variantsFile, 'variantes');
  else {
    const compos = (str(p, 'compos', 'ADDM,AADM') ?? '').split(/,(?![0-9])/).map((s) => s.trim()).filter(Boolean);
    variants = compos.map((c) => {
      const parsed = parseComposition(c);
      return { name: parsed.name, compo: c };
    });
  }
  for (const v of variants) {
    if (overrides && !v.configOverrides) v.configOverrides = overrides;
    if (pol && !v.policies) v.policies = pol;
  }
  const spec: ExperimentSpec = {
    variants,
    seeds: parseSeeds(str(p, 'graines', '1-20')!),
    mode: mode(p),
    maxTurn: int(p, 'tours-max', 20),
  };
  const res = await runExperiment(spec, { workers: workers(p), onProgress: flag(p, 'silence') ? undefined : progressReporter(io), onWarning: (m) => io.err(`Attention : ${m}`) });
  io.out(formatExperimentTable(res));
  const out = str(p, 'sortie');
  if (out) {
    writeFileSync(resolvePath(out), JSON.stringify(res, null, 1));
    io.err(`Résultats écrits : ${out}`);
  }
  return 0;
}

async function cmdBench(p: ParsedArgs, io: CliIo): Promise<number> {
  const spec: ExperimentSpec = { ...BENCH_SPEC, variants: BENCH_SPEC.variants.map((v) => ({ ...v })), seeds: parseSeeds(str(p, 'graines', '1-24')!) };
  const json = flag(p, 'json');
  const res = await runExperiment(spec, { workers: workers(p), onProgress: flag(p, 'silence') ? undefined : progressReporter(io), onWarning: (m) => io.err(`Attention : ${m}`) });
  const report = benchSummary(res);
  const out = str(p, 'sortie');
  if (out) {
    writeFileSync(resolvePath(out), JSON.stringify({ ...report, runs: res.runs.map((r) => ({ variant: r.variant, ...r.result, choices: undefined })) }, null, 1));
    io.err(`Rapport écrit : ${out}`);
  }
  if (json) io.out(JSON.stringify(report));
  else io.out(formatBench(report));
  return 0;
}

/** Point d'entrée (renvoie le code de sortie). */
export async function main(argv: readonly string[], io: CliIo = defaultIo): Promise<number> {
  const p = parseArgs(argv);
  try {
    switch (p.command) {
      case 'carte':
        return cmdCarte(p, io);
      case 'simuler':
        return cmdSimuler(p, io);
      case 'planifier':
        return cmdPlanifier(p, io);
      case 'comparer':
        return await cmdComparer(p, io);
      case 'bench':
        return await cmdBench(p, io);
      case '':
      case 'aide':
      case 'help':
      case '--help':
        io.out(HELP);
        return 0;
      default:
        io.err(`Commande inconnue : « ${p.command} ».`);
        io.err(HELP);
        return 2;
    }
  } catch (e) {
    io.err(`Erreur : ${e instanceof Error ? e.message : String(e)}`);
    if (!(e instanceof CliError) && process.env.GLADIA_DEBUG) io.err(e instanceof Error ? e.stack ?? '' : '');
    return 1;
  }
}

const invokedDirectly = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(resolvePath(process.argv[1])).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
