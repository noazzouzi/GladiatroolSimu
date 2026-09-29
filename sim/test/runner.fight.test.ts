/**
 * Runner (sim/src/runner) : combat piloté (résultat complet, journal, trace), rejeu exact d'une trace, statistiques
 * (Wilson, McNemar), expériences (fil courant et workers Node, résultats identiques), compositions, graines.
 */
import { describe, expect, it } from 'vitest';
import {
  destroyedEnemyHp,
  formatExperimentTable,
  mcnemarExactP,
  meanStat,
  parseComposition,
  parseSeeds,
  replayTrace,
  runExperimentSync,
  runFight,
  totalEnemyHp,
  wilsonInterval,
  type ExperimentSpec,
} from '../src/runner/index.js';
import { runExperiment } from '../src/runner/nodeExperiment.js';

function snapshot(f: ReturnType<typeof replayTrace>['fight']): string {
  return JSON.stringify(f.state.fighters.map((x) => [x.name, x.alive, x.cell, x.hp]));
}

describe('runner : combat piloté', () => {
  it('résultat complet, journal français, trace rejouée à l’identique (IA des monstres, jets aléatoires)', () => {
    const r = runFight({ compo: 'ADDM', seed: 5 }, { mode: 'greedy', maxTurn: 3, journal: true, trace: true });
    expect(r.compo).toBe('ADDM');
    expect(r.reason).toBe('maxTurn');
    expect(r.turnReached).toBe(4);
    expect(r.victory).toBe(false);
    expect(r.enemyHpTotal).toBe(832_000);
    expect(r.enemyHpDestroyed).toBeGreaterThan(0);
    expect(r.progress).toBeCloseTo(r.enemyHpDestroyed / 832_000, 10);
    expect(r.objectivesCount).toBe(r.objectives.length);
    expect(r.objectives[0]?.id).toBe('empale');
    expect(r.choices.some((c) => c.kind === 'Vote')).toBe(true);
    expect(r.choices.some((c) => c.kind === 'Acclamation')).toBe(true);
    expect(r.timing.playerTurns).toBeGreaterThanOrEqual(8);
    const j = r.journal!.join('\n');
    expect(j).toMatch(/Tour 1 ═/);
    expect(j).toMatch(/◇ Plan de Acrobate/);
    expect(j).toMatch(/◆ Vote — équipe/);
    expect(j).toMatch(/Troollibre 1 .*Vulnérable|Vulnérable/);
    // rejeu : même état final
    const trace = r.trace!;
    expect(trace.steps.length).toBeGreaterThan(20);
    const rep = replayTrace(JSON.parse(JSON.stringify(trace)));
    expect(rep.stepsApplied).toBe(trace.steps.length);
    expect(rep.fight.turn).toBe(4);
    expect(destroyedEnemyHp(rep.fight)).toBe(r.enemyHpDestroyed);
    // rejeu jusqu'à un point : début du tour de J3 au T2
    const mid = replayTrace(trace, { turn: 2, fighter: 'J3' });
    expect(mid.reached).toBe(true);
    expect(mid.status).toEqual({ kind: 'playerTurn', fighterId: mid.fight.scenario.playerIds[2] });
    expect(mid.fight.turn).toBe(2);
    // rejouer deux fois donne le même état
    expect(snapshot(replayTrace(trace, { step: 30 }).fight)).toBe(snapshot(replayTrace(trace, { step: 30 }).fight));
  });

  it('déterminisme (fast sans plafond de temps) et joueurs passifs', () => {
    const a = runFight({ compo: 'AADM', seed: 2 }, { mode: 'fast', maxTurn: 1 });
    const b = runFight({ compo: 'AADM', seed: 2 }, { mode: 'fast', maxTurn: 1 });
    expect(a.enemyHpDestroyed).toBe(b.enemyHpDestroyed);
    expect(a.choices).toEqual(b.choices);
    const p = runFight({ compo: 'ADDM', seed: 2 }, { players: 'passive', maxTurn: 20 });
    expect(p.victory).toBe(false);
    expect(p.reason).toBe('defeat');
    expect(p.playerDeaths.length).toBe(4);
    expect(totalEnemyHp()).toBe(832_000);
  });
});

describe('runner : statistiques et utilitaires', () => {
  it('Wilson, moyennes, McNemar exact', () => {
    const w = wilsonInterval(5, 10);
    expect(w.low).toBeCloseTo(0.2366, 3);
    expect(w.high).toBeCloseTo(0.7634, 3);
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    expect(wilsonInterval(24, 24).high).toBe(1);
    expect(wilsonInterval(24, 24).low).toBeCloseTo(0.862, 2);
    const m = meanStat([1, 2, 3, 4]);
    expect(m.mean).toBe(2.5);
    expect(m.sd).toBeCloseTo(1.291, 3);
    expect(mcnemarExactP(0, 5)).toBeCloseTo(0.0625, 6);
    expect(mcnemarExactP(3, 3)).toBe(1);
    expect(mcnemarExactP(0, 0)).toBe(1);
  });

  it('graines et compositions', () => {
    expect(parseSeeds('1-3,7,10-11')).toEqual([1, 2, 3, 7, 10, 11]);
    expect(() => parseSeeds('5-2')).toThrow(/décroissant/);
    expect(() => parseSeeds('a')).toThrow();
    const c = parseComposition('AADM2=AADM@287,314,286,315');
    expect(c.name).toBe('AADM2');
    expect(c.players.map((p) => p.archetype)).toEqual(['acrobate', 'acrobate', 'dompteur', 'magicien']);
    expect(c.players.map((p) => p.startCell)).toEqual([287, 314, 286, 315]);
    expect(parseComposition('addm').letters).toBe('ADDM');
    expect(() => parseComposition('ADXM')).toThrow(/lettre « X »/);
    expect(() => parseComposition('ADDM@314')).toThrow(/4 cases/);
  });
});

describe('runner : expériences', () => {
  const spec: ExperimentSpec = { variants: [{ name: 'ADDM' }, { name: 'AADM', compo: 'AADM' }], seeds: [1, 2], mode: 'greedy', maxTurn: 1 };

  it('fil courant : agrégats, comparaison appariée, tableau français', () => {
    const res = runExperimentSync(spec);
    expect(res.runs).toHaveLength(4);
    expect(res.variants.map((v) => v.name)).toEqual(['ADDM', 'AADM']);
    for (const v of res.variants) {
      expect(v.runs).toBe(2);
      expect(v.reasons.maxTurn).toBe(2);
      expect(v.winRateCi95.low).toBe(0);
      expect(v.progress.mean).toBeGreaterThan(0);
    }
    expect(res.comparisons).toHaveLength(1);
    expect(res.comparisons[0]!.seeds).toBe(2);
    const table = formatExperimentTable(res);
    expect(table).toMatch(/Variante/);
    expect(table).toMatch(/ADDM contre AADM/);
  });

  it('workers Node (worker_threads) : mêmes résultats que le fil courant', async () => {
    const sync = runExperimentSync(spec);
    const par = await runExperiment(spec, { workers: 2 });
    expect(par.workers).toBe(2);
    const key = (r: (typeof sync.runs)[number]) => `${r.variant}:${r.result.seed}:${r.result.enemyHpDestroyed}:${r.result.objectivesCount}:${r.result.turnReached}`;
    expect(par.runs.map(key)).toEqual(sync.runs.map(key));
  }, 60_000);
});
