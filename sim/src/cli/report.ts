/**
 * Tableaux Markdown (français) des résultats de campagne enregistrés (NODE UNIQUEMENT) :
 *
 *   npx tsx sim/src/cli/report.ts [--dossier sim/results] [--experience compos-ref]
 *
 * Lit ``<dossier>/<id>.json`` (écrits par ``campaign.ts``) et imprime, pour chaque expérience, le tableau des
 * variantes et les comparaisons appariées, puis les analyses détaillées quand elles existent.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CAMPAIGN, type ExperimentReport } from '../analysis/campaigns.js';
import {
  formatChoices,
  formatDamageTaken,
  formatDeaths,
  formatMamaDiffs,
  formatTurnDistributions,
  formatObjectives,
  formatSpells,
  formatSpikeCells,
  formatTurnsOne,
  formatVariants,
  formatWaves,
} from '../analysis/report.js';

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..');

function playersOf(name: string): Record<string, number> {
  const letters = (name.split(' ')[0] ?? '').toUpperCase();
  const m: Record<string, number> = {};
  const map: Record<string, string> = { A: 'acrobate', D: 'dompteur', M: 'magicien' };
  for (const ch of letters) if (map[ch]) m[map[ch]!] = (m[map[ch]!] ?? 0) + 1;
  return m;
}

export function formatExperiment(rep: ExperimentReport): string {
  const out = [`## ${rep.title}`, '', `Expérience \`${rep.id}\`, graines ${rep.seeds}, planificateur ${rep.mode}.`, '', formatVariants(rep, { time: true })];
  const analyzed = Object.keys(rep.analysis).filter((k) => rep.analysis[k]!.fights > 0);
  const names = rep.variants.map((v) => v.name);
  if (rep.comparisons.length) out.push('', '### Tour de mort de la Mama (apparié)', '', formatMamaDiffs(rep));
  out.push('', '### Répartition des tours (Mama, victoire)', '', formatTurnDistributions(rep, names));
  out.push('', '### Morts de joueurs', '', formatDeaths(rep, names));
  out.push('', '### Objectifs validés', '', formatObjectives(rep, names));
  if (analyzed.length) {
    for (const v of analyzed) {
      const agg = rep.analysis[v]!;
      out.push('', `### ${v} — par tour global`, '', formatTurnsOne(agg));
      out.push('', `### ${v} — sorts`, '', formatSpells(agg, playersOf(v)));
      out.push('', `### ${v} — mises en pics`, '', formatSpikeCells(agg));
      out.push('', `### ${v} — Acclamations et votes choisis`, '', formatChoices(rep, v, 'Acclamation'), '', formatChoices(rep, v, 'Vote'), '', formatChoices(rep, v, 'Cadeau'));
    }
    const aggs = Object.fromEntries(analyzed.map((k) => [k, rep.analysis[k]!]));
    out.push('', '### Vagues', '', formatWaves(aggs));
    out.push('', '### Dégâts subis', '', formatDamageTaken(aggs));
  }
  return out.join('\n');
}

export function main(argv: readonly string[]): number {
  const i = argv.indexOf('--dossier');
  const dir = resolvePath(i >= 0 ? argv[i + 1]! : resolvePath(ROOT, 'sim/results'));
  const j = argv.indexOf('--experience');
  const only = j >= 0 ? argv[j + 1]!.split(',') : null;
  if (!existsSync(dir)) {
    process.stderr.write(`Dossier introuvable : ${dir}\n`);
    return 2;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const order = CAMPAIGN.map((e) => e.id);
  const reps = files
    .map((f) => JSON.parse(readFileSync(resolvePath(dir, f), 'utf8')) as ExperimentReport)
    .filter((r) => r && r.id && Array.isArray(r.variants) && (!only || only.includes(r.id)))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const r of reps) process.stdout.write(`${formatExperiment(r)}\n\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(main(process.argv.slice(2)));
