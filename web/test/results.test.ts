import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractResults } from '../src/model/resultsExtract.js';
import { overridesFrom } from '../src/screens/SimulationScreen.js';
import { buildCatalog } from '../src/model/catalog.js';

describe('synthèse des résultats', () => {
  it('extrait toutes les expériences avec leurs statistiques, sans les combats bruts', () => {
    const dir = new URL('../../sim/results/', import.meta.url);
    const raws = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
    const r = extractResults(raws);
    expect(Object.keys(r).sort()).toContain('compos-ref');
    const ref = r['compos-ref']!;
    const addm = ref.variants.find((v) => v.name === 'ADDM')!;
    expect(addm.runs).toBe(200);
    expect(addm.wins).toBe(196);
    expect(addm.ci[0]).toBeLessThan(addm.winRate);
    expect(addm.ci[1]).toBeGreaterThan(addm.winRate);
    expect(Object.values(addm.mamaHist).reduce((s, n) => s + n, 0)).toBe(200);
    expect(Object.values(addm.winHist).reduce((s, n) => s + n, 0)).toBe(200);
    expect(ref.comparisons[0]).toMatchObject({ a: 'AADM', b: 'ADDM', aOnly: 4, bOnly: 2 });
    expect(JSON.stringify(r).length).toBeLessThan(200_000);
  });

  it('hypothèses : surcharges de configuration des seules valeurs modifiées', () => {
    const cat = buildCatalog();
    expect(overridesFrom(cat.params, {})).toEqual({});
    expect(overridesFrom(cat.params, { 'spikes.playersDoubledInside': true, 'gifts.spawnProbability': 0.72, 'timeline.model': 'monsters_after_mama' })).toEqual({
      spikes: { playersDoubledInside: true },
      timeline: { model: 'monsters_after_mama' },
    });
    expect(cat.map.cells.filter((c) => c.playable)).toHaveLength(241);
    expect(cat.map.cells.filter((c) => c.spike)).toHaveLength(96);
  });
});
