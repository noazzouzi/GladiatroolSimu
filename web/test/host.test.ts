import { describe, expect, it } from 'vitest';
import { SimHost } from '../src/worker/host.js';
import { openingSituation } from '../src/model/situationEdit.js';
import type { ApplyResult, BestTurnResult, LoadResult, SimResult } from '../src/model/types.js';

const noop = () => {};

describe('hôte du worker (sans navigateur)', () => {
  it('charge une situation, planifie (plan d\'équipe), trace et applique le plan', () => {
    const h = new SimHost();
    const load = h.handle({ type: 'load', situation: openingSituation() }, noop) as LoadResult;
    expect(load.view.status.kind).toBe('playerTurn');
    expect(load.view.fighters.find((f) => f.short === 'T1')!.sitIndex).toBe(0);
    const plan = h.handle({ type: 'plan', mode: 'fast', team: true }, noop) as BestTurnResult;
    expect(plan.actorName).toBe('Acrobate');
    expect(plan.best.steps.length).toBeGreaterThan(0);
    const casts = plan.best.steps.filter((s) => s.kind === 'cast');
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((c) => (c.zone ?? []).length > 0)).toBe(true);
    // ouverture de référence : au moins un Troollibre poussé dans les pics
    expect(plan.best.steps.some((s) => s.forced.some((m) => m.intoSpikes))).toBe(true);
    expect(plan.team!.steps[0]!.actorName).toBe('Acrobate');
    expect(plan.team!.steps.length).toBeGreaterThanOrEqual(2);
    // la visualisation rejoue exactement les copies du planificateur : aucune action refusée
    for (const c of [plan.best, ...plan.alternatives, ...plan.team!.steps]) for (const s of c.steps) expect(s.label).not.toMatch(/refusé/);
    const applied = h.handle({ type: 'apply', source: 'best', index: 0, rolls: 'average', wholeTeam: false }, noop) as ApplyResult;
    expect(applied.replay.frames.length).toBeGreaterThan(plan.best.steps.length);
    expect(applied.view.status.kind).toBe('playerTurn');
    expect(applied.view.status.fighterName).toBe('Dompteur 1');
    expect(applied.situation.current).toBe('J2');
    // chaque ligne du journal appartient à une image
    const covered = applied.replay.frames.reduce((s, f) => s + (f.lines[1] - f.lines[0]), 0);
    expect(covered).toBe(applied.replay.lines.length);
  });

  it('simule un combat court, aligne le rejeu et reprend l\'état exact d\'un point', () => {
    const h = new SimHost();
    const phases: string[] = [];
    const sim = h.handle({ type: 'simulate', spec: { compo: 'ADDM', seed: 3, mode: 'greedy', maxTurn: 2, monsters: 'ai', overrides: {} } }, (p) => phases.push(p.phase)) as SimResult;
    expect(phases.some((p) => /Tour 1/.test(p))).toBe(true);
    const r = sim.replay;
    expect(r.frames[0]!.step).toBe(-1);
    expect(r.frames.length).toBeGreaterThan(10);
    expect(r.turnStarts[0]).toEqual({ turn: 1, frame: 0 });
    expect(r.turnStarts.some((t) => t.turn === 2)).toBe(true);
    const covered = r.frames.reduce((s, f) => s + (f.lines[1] - f.lines[0]), 0);
    expect(covered).toBe(r.lines.length);
    expect(r.kinds).toHaveLength(r.lines.length);
    expect(r.kinds).toContain('plan');
    for (let i = 1; i < r.frames.length; i++) expect(r.frames[i]!.lines[0]).toBe(r.frames[i - 1]!.lines[1]);
    // un pas de tour de joueur au T2 : l'état reconstruit correspond à l'image
    const k = r.frames.findIndex((f) => f.turn === 2 && f.playerTurn);
    const pt = h.handle({ type: 'point', frame: k }, noop) as LoadResult & { label: string };
    expect(pt.view.turn).toBe(2);
    const cells = (fs: { id: number; cell: number; alive: boolean }[]) => fs.filter((f) => f.alive).map((f) => `${f.id}@${f.cell}`).sort();
    expect(cells(pt.view.fighters)).toEqual(cells(r.frames[k]!.fighters));
    expect(pt.label).toMatch(/graine 3/);
  });
});
