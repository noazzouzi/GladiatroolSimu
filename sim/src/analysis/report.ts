/**
 * Mise en forme (Markdown, français) des résultats de campagne (``ExperimentReport``) : tableau des variantes avec
 * IC de Wilson, comparaisons appariées, et pour les expériences analysées : statistiques par tour, sorts, mises en
 * pics (cases), vagues, dégâts subis, morts, objectifs et choix. Partie pure (sans API Node).
 */
import type { ExperimentReport } from './campaigns.js';
import type { AnalysisAggregate } from './fightAnalysis.js';

const pct = (x: number, d = 1): string => `${(100 * x).toFixed(d).replace('.', ',')} %`;
const num = (x: number, d = 2): string => x.toFixed(d).replace('.', ',');
const int = (x: number): string => Math.round(x).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** Tableau des variantes et comparaisons appariées. */
export function formatVariants(rep: ExperimentReport, o: { time?: boolean } = {}): string {
  const out: string[] = [];
  out.push(`| Variante | Combats | Victoires | IC 95 % (Wilson) | Progression | Tour final | Objectifs | Morts / combat | Mama tuée | T mort Mama |${o.time ? ' s / combat |' : ''}`);
  out.push(`|---|---|---|---|---|---|---|---|---|---|${o.time ? '---|' : ''}`);
  for (const v of rep.variants) {
    out.push(
      `| ${v.name} | ${v.runs} | ${v.wins} (${pct(v.winRate)}) | ${pct(v.winRateCi95.low)} – ${pct(v.winRateCi95.high)} | ${pct(v.progress.mean, 2)} | ${num(v.turnReached.mean)} | ${num(v.objectives.mean)} | ${num(v.playerDeaths.mean, 3)} | ${pct(v.mamaKilledRate)} | ${v.mamaKilledTurn ? num(v.mamaKilledTurn.mean) : '—'} |${o.time ? ` ${num(v.msPerFight / 1000, 1)} |` : ''}`,
    );
  }
  if (rep.comparisons.length) {
    out.push('', '| A contre B (mêmes graines) | Graines | A gagne seul | B gagne seul | McNemar p | Δ progression A − B (pts) [IC 95 %] | Δ morts A − B | Δ tour final |');
    out.push('|---|---|---|---|---|---|---|---|');
    for (const c of rep.comparisons) {
      const dDeaths = deathDiff(rep, c.a, c.b);
      out.push(
        `| ${c.a} / ${c.b} | ${c.seeds} | ${c.aOnly} | ${c.bOnly} | ${num(c.mcnemarP, 3)} | ${signed(100 * c.progressDiff.mean)} [${num(100 * c.progressDiff.ci95.low)} ; ${num(100 * c.progressDiff.ci95.high)}] | ${signed(dDeaths.mean, 3)} [${num(dDeaths.low, 3)} ; ${num(dDeaths.high, 3)}] | ${signed(c.turnDiff.mean)} |`,
      );
    }
  }
  return out.join('\n');
}

function signed(x: number, d = 2): string {
  return `${x >= 0 ? '+' : '−'}${num(Math.abs(x), d)}`;
}

/** Différence appariée du nombre de morts (moyenne et IC normal à 95 %). */
export function deathDiff(rep: ExperimentReport, a: string, b: string): { mean: number; low: number; high: number } {
  const bySeed = new Map<number, number>();
  for (const r of rep.runs) if (r.v === b) bySeed.set(r.seed, r.deaths.length);
  const d: number[] = [];
  for (const r of rep.runs) {
    if (r.v !== a) continue;
    const x = bySeed.get(r.seed);
    if (x !== undefined) d.push(r.deaths.length - x);
  }
  const n = d.length;
  if (!n) return { mean: 0, low: 0, high: 0 };
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const h = (1.96 * sd) / Math.sqrt(n);
  return { mean, low: mean - h, high: mean + h };
}

/** Statistiques par tour global (moyennes sur les combats qui atteignent ce tour). */
export function formatTurns(aggs: Record<string, AnalysisAggregate>): string {
  const names = Object.keys(aggs);
  const out: string[] = [];
  out.push(`| Tour | ${names.map((n) => `${n} : combats · PV ennemis restants · ennemis · tués · entrées pics · joueurs vivants · PV équipe · objectifs · combats avec mort`).join(' | ')} |`);
  out.push(`|---|${names.map(() => '---').join('|')}|`);
  const maxT = Math.max(...names.map((n) => aggs[n]!.turns.length));
  for (let t = 1; t <= maxT; t++) {
    const cells = names.map((n) => {
      const x = aggs[n]!.turns.find((y) => y.t === t);
      if (!x) return '—';
      return `${x.fights} · ${int(x.enemyHpMean)} · ${num(x.enemiesMean)} · ${num(x.killsMean)} · ${num(x.spikeEntriesMean)} · ${num(x.playersAliveMean)} · ${pct(x.teamHpPctMean, 0)} · ${num(x.objectivesMean)} · ${x.fightsWithDeath}`;
    });
    out.push(`| T${t} | ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

/** Tableau par tour d'UNE variante (lisible). */
export function formatTurnsOne(agg: AnalysisAggregate): string {
  const out = ['| Tour | Combats | PV ennemis restants (fin de tour) | Ennemis restants | Tués | Entrées en pics | Joueurs vivants | PV équipe | Objectifs (cumul) | Combats avec une mort |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const x of agg.turns) {
    out.push(
      `| T${x.t} | ${x.fights} | ${int(x.enemyHpMean)} | ${num(x.enemiesMean)} | ${num(x.killsMean)} | ${num(x.spikeEntriesMean)} | ${num(x.playersAliveMean)} | ${pct(x.teamHpPctMean, 0)} | ${num(x.objectivesMean)} | ${x.fightsWithDeath} |`,
    );
  }
  return out.join('\n');
}

/** Sorts par archétype : lancers / combat, dégâts / combat, dégâts par PA, tués, entrées en pics. */
export function formatSpells(agg: AnalysisAggregate, players: Record<string, number>, top = 8): string {
  const out = ['| Archétype | Sort | Lancers / combat / joueur | PV ôtés / combat / joueur | PV ôtés / PA | Ennemis tués / combat | Mises en pics / combat |', '|---|---|---|---|---|---|---|'];
  const byArch = new Map<string, typeof agg.spells>();
  for (const s of agg.spells) byArch.set(s.archetype, [...(byArch.get(s.archetype) ?? []), s]);
  for (const [arch, list] of byArch) {
    const k = Math.max(1, (players[arch] ?? 1) * agg.fights);
    for (const s of list.slice().sort((a, b) => b.damage + 20000 * b.spikeEntries - (a.damage + 20000 * a.spikeEntries)).slice(0, top)) {
      out.push(
        `| ${arch} | ${s.name} | ${num(s.casts / k)} | ${int(s.damage / k)} | ${s.ap ? int(s.damage / s.ap) : '—'} | ${num(s.kills / agg.fights)} | ${num(s.spikeEntries / agg.fights)} |`,
      );
    }
  }
  return out.join('\n');
}

export function formatSpikeCells(agg: AnalysisAggregate, top = 12): string {
  const total = agg.spikeCells.reduce((s, c) => s + c.count, 0);
  const out = [`Mises en pics par un joueur : ${num(total / Math.max(1, agg.fights))} par combat.`, '', '| Case d’arrivée | Part | Par combat |', '|---|---|---|'];
  for (const c of agg.spikeCells.slice(0, top)) out.push(`| ${c.cell} | ${pct(c.count / Math.max(1, total))} | ${num(c.count / agg.fights)} |`);
  out.push('', '| Sort (archétype) | Part des mises en pics |', '|---|---|');
  for (const s of agg.spikeBySpell.slice(0, 10)) out.push(`| ${s.name} (${s.archetype}) | ${pct(s.count / Math.max(1, total))} |`);
  out.push('', '| Départ → arrivée (le plus fréquent) | Nombre |', '|---|---|');
  for (const m of agg.spikeMoves.slice(0, 10)) out.push(`| ${m.from} → ${m.to} | ${m.count} |`);
  return out.join('\n');
}

export function formatWaves(aggs: Record<string, AnalysisAggregate>): string {
  const out = ['| Variante | Vague (tour) | Monstres | Entrés en pics | Tués | Tués avant d’avoir joué | Tués dans leur tour d’apparition | Morts dans les pics |', '|---|---|---|---|---|---|---|---|'];
  for (const [name, agg] of Object.entries(aggs)) {
    for (const w of agg.waves) {
      const s = Math.max(1, w.spawned);
      out.push(
        `| ${name} | V${w.wave} (T${w.turn}) | ${w.spawned} | ${pct(w.enteredSpikes / s)} | ${pct(w.killed / s)} | ${pct(w.killedBeforeActing / s)} | ${pct(w.killedSameTurn / s)} | ${pct(w.killedInSpikes / s)} |`,
      );
    }
  }
  return out.join('\n');
}

export function formatDamageTaken(aggs: Record<string, AnalysisAggregate>): string {
  const names = Object.keys(aggs);
  const keys = [...new Set(names.flatMap((n) => Object.keys(aggs[n]!.damageTaken)))].sort();
  const out = [`| Source | ${names.join(' | ')} |`, `|---|${names.map(() => '---').join('|')}|`];
  for (const k of keys) out.push(`| ${k} | ${names.map((n) => int((aggs[n]!.damageTaken[k] ?? 0) / Math.max(1, aggs[n]!.fights))).join(' | ')} |`);
  return `PV perdus par les joueurs, par combat :\n\n${out.join('\n')}`;
}

/** Morts de joueurs : par tour et par archétype ; causes. */
export function formatDeaths(rep: ExperimentReport, variants: readonly string[]): string {
  const out: string[] = ['| Variante | Combats | Morts | Par archétype | Par tour | Causes principales |', '|---|---|---|---|---|---|'];
  for (const v of variants) {
    const runs = rep.runs.filter((r) => r.v === v);
    const deaths = runs.flatMap((r) => r.deaths);
    const count = (f: (d: (typeof deaths)[number]) => string) => {
      const m = new Map<string, number>();
      for (const d of deaths) m.set(f(d), (m.get(f(d)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const byT = count((d) => `T${d.t}`).sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)));
    out.push(
      `| ${v} | ${runs.length} | ${deaths.length} | ${count((d) => d.a).map(([k, n]) => `${k} ${n}`).join(', ') || '—'} | ${byT.map(([k, n]) => `${k} : ${n}`).join(', ') || '—'} | ${count((d) => d.c).slice(0, 4).map(([k, n]) => `${k} ${n}`).join(', ') || '—'} |`,
    );
  }
  return out.join('\n');
}

/** Objectifs validés : fréquence et tour moyen. */
export function formatObjectives(rep: ExperimentReport, variants: readonly string[]): string {
  const ids = new Set<string>();
  for (const r of rep.runs) for (const o of r.obj) ids.add(o.id);
  const out = [`| Objectif | ${variants.map((v) => `${v} : % des combats (tour moyen)`).join(' | ')} |`, `|---|${variants.map(() => '---').join('|')}|`];
  const rows: [string, number, string[]][] = [];
  for (const id of ids) {
    let total = 0;
    const cells = variants.map((v) => {
      const runs = rep.runs.filter((r) => r.v === v);
      const hits = runs.flatMap((r) => r.obj.filter((o) => o.id === id));
      total += hits.length / Math.max(1, runs.length);
      return hits.length ? `${pct(hits.length / Math.max(1, runs.length), 0)} (T${num(hits.reduce((s, o) => s + o.t, 0) / hits.length, 1)})` : '—';
    });
    rows.push([id, total, cells]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [id, , cells] of rows) out.push(`| ${id} | ${cells.join(' | ')} |`);
  return out.join('\n');
}

/** Choix les plus fréquents (Acclamations, votes, cadeaux) d'une variante, par joueur. */
export function formatChoices(rep: ExperimentReport, variant: string, kind: string, top = 12): string {
  const m = rep.choices[variant] ?? {};
  const runs = Math.max(1, rep.runs.filter((r) => r.v === variant).length);
  const rows = Object.entries(m)
    .filter(([k]) => k.startsWith(`${kind}|`))
    .map(([k, n]) => {
      const [, who, label] = k.split('|');
      return { who: who ?? '', label: label ?? '', n };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, top);
  const out = [`| Joueur | ${kind} | Par combat |`, '|---|---|---|'];
  for (const r of rows) out.push(`| ${r.who} | ${r.label} | ${num(r.n / runs)} |`);
  return out.join('\n');
}

/** Répartition du tour de mort de la Mama et du tour de fin (victoire) par variante. */
export function formatTurnDistributions(rep: ExperimentReport, variants: readonly string[]): string {
  const turns = new Set<number>();
  for (const r of rep.runs) {
    if (r.mamaT !== null) turns.add(r.mamaT);
    turns.add(r.turn);
  }
  const ts = [...turns].filter((t) => t >= 8 && t <= 13).sort((a, b) => a - b);
  const out = [
    `| Variante | Mama tuée au : ${ts.map((t) => `T${t}`).join(' · ')} · plus tard / jamais | Victoire au : ${ts.filter((t) => t >= 10).map((t) => `T${t}`).join(' · ')} · plus tard / défaite |`,
    '|---|---|---|',
  ];
  for (const v of variants) {
    const runs = rep.runs.filter((r) => r.v === v);
    const n = Math.max(1, runs.length);
    const mama = ts.map((t) => pct(runs.filter((r) => r.mamaT === t).length / n, 0));
    const lateMama = runs.filter((r) => r.mamaT === null || r.mamaT > ts[ts.length - 1]!).length;
    const tv = ts.filter((t) => t >= 10);
    const win = tv.map((t) => pct(runs.filter((r) => r.win && r.turn === t).length / n, 0));
    const other = runs.filter((r) => !r.win || r.turn > tv[tv.length - 1]!).length;
    out.push(`| ${v} | ${mama.join(' · ')} · ${pct(lateMama / n, 0)} | ${win.join(' · ')} · ${pct(other / n, 0)} |`);
  }
  return out.join('\n');
}

/** Comparaison appariée du tour de mort de la Mama (graines où elle meurt dans les deux variantes). */
export function mamaTurnDiff(rep: ExperimentReport, a: string, b: string): { n: number; mean: number; low: number; high: number; aEarlier: number; bEarlier: number } {
  const bySeed = new Map<number, number | null>();
  for (const r of rep.runs) if (r.v === b) bySeed.set(r.seed, r.mamaT);
  const d: number[] = [];
  for (const r of rep.runs) {
    if (r.v !== a || r.mamaT === null) continue;
    const x = bySeed.get(r.seed);
    if (x !== undefined && x !== null) d.push(r.mamaT - x);
  }
  const n = d.length;
  if (!n) return { n: 0, mean: 0, low: 0, high: 0, aEarlier: 0, bEarlier: 0 };
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(d.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const h = (1.96 * sd) / Math.sqrt(n);
  return { n, mean, low: mean - h, high: mean + h, aEarlier: d.filter((x) => x < 0).length, bEarlier: d.filter((x) => x > 0).length };
}

/** Tableau des écarts appariés du tour de mort de la Mama pour les comparaisons de l'expérience. */
export function formatMamaDiffs(rep: ExperimentReport): string {
  const out = ['| A contre B | Graines (Mama tuée des deux côtés) | Δ tour de mort de la Mama A − B [IC 95 %] | A plus tôt | B plus tôt |', '|---|---|---|---|---|'];
  for (const c of rep.comparisons) {
    const m = mamaTurnDiff(rep, c.a, c.b);
    out.push(`| ${c.a} / ${c.b} | ${m.n} | ${signed(m.mean)} [${num(m.low)} ; ${num(m.high)}] | ${m.aEarlier} | ${m.bEarlier} |`);
  }
  return out.join('\n');
}
