import { describe, expect, it } from 'vitest';
import { aggregateAnalyses, analyzeTrace } from '../src/analysis/fightAnalysis.js';
import { CAMPAIGN, compactRun, runCacheKey, runFromCompact, summarizeCampaign } from '../src/analysis/campaigns.js';
import { runFight } from '../src/runner/index.js';

describe('analyse a posteriori d’un combat (rejeu de la trace)', () => {
  const run = runFight({ compo: 'ADDM', seed: 7 }, { mode: 'greedy', trace: true, maxTurn: 3 });
  const a = analyzeTrace(run.trace!);

  it('rejoue le même combat et fournit un instantané par tour global', () => {
    expect(a.turnReached).toBe(run.turnReached);
    expect(a.players).toBe(4);
    expect(a.turns.map((t) => t.t)).toEqual(Array.from({ length: a.turns.length }, (_, i) => i + 1));
    for (const t of a.turns) {
      expect(t.enemyHp).toBeGreaterThanOrEqual(0);
      expect(t.teamHpPct).toBeLessThanOrEqual(1);
      expect(t.playersAlive).toBeLessThanOrEqual(4);
    }
  });

  it('compte les lancers directs des joueurs', () => {
    const playerIds = new Set(run.trace!.steps.filter((s) => s.k === 'end' && s.t >= 1).map((s) => s.f));
    const casts = a.spells.reduce((s, x) => s + x.casts, 0);
    expect(casts).toBeGreaterThan(0);
    expect(playerIds.size).toBeGreaterThan(0);
    // chaque sort compté a un archétype joueur et un coût en PA positif ou nul
    for (const s of a.spells) {
      expect(['acrobate', 'dompteur', 'magicien']).toContain(s.archetype);
      expect(s.ap).toBeGreaterThanOrEqual(0);
    }
  });

  it('relève les mises en pics et les vagues', () => {
    // V1 : 2 Troollibres (T1)
    expect(a.waves[0]).toMatchObject({ wave: 1, turn: 1, spawned: 2 });
    for (const p of a.spikePushes) expect(p.from).not.toBe(p.to);
    const agg = aggregateAnalyses([a, a]);
    expect(agg.fights).toBe(2);
    expect(agg.waves[0]!.spawned).toBe(4);
    expect(agg.spikeCells.reduce((s, c) => s + c.count, 0)).toBe(2 * a.spikePushes.length);
  });

  it('enregistrements compacts, clé de cache et synthèse appariée', () => {
    const c = compactRun('X', run);
    const back = runFromCompact(c);
    expect(back.victory).toBe(run.victory);
    expect(back.turnReached).toBe(run.turnReached);
    const k1 = runCacheKey({ name: 'A', compo: 'ADDM' }, 5, 'fast');
    const k2 = runCacheKey({ name: 'B', compo: 'ADDM', ref: 'A', group: 'g' } as never, 5, 'fast');
    expect(k1).toBe(k2);
    expect(runCacheKey({ name: 'A', compo: 'AADM' }, 5, 'fast')).not.toBe(k1);
    const exp = { id: 't', title: 't', seeds: '7', analyze: true, variants: [{ name: 'X', compo: 'ADDM' }, { name: 'Y', compo: 'ADDM', ref: 'X' }] };
    const rep = summarizeCampaign(exp, '7', [c, { ...c, v: 'Y' }], [{ ...a, compo: 'X' }]);
    expect(rep.variants.map((v) => v.runs)).toEqual([1, 1]);
    expect(rep.comparisons[0]).toMatchObject({ a: 'Y', b: 'X', seeds: 1, aOnly: 0, bOnly: 0 });
    expect(rep.analysis.X!.fights).toBe(1);
    expect(rep.runs[0]).not.toHaveProperty('choices');
  });

  it('définitions de campagne cohérentes (références existantes, noms uniques)', () => {
    for (const e of CAMPAIGN) {
      const names = e.variants.map((v) => v.name);
      expect(new Set(names).size).toBe(names.length);
      for (const v of e.variants) if (v.ref) expect(names).toContain(v.ref);
    }
  });
});
