/**
 * CLI (sim/src/cli/index.ts) : commandes appelées par ``main`` avec sorties capturées (rapides : mode greedy, peu de
 * tours).
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, parseArgs } from '../src/cli/index.js';

async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const EX = resolve(__dirname, '../examples');

describe('CLI', () => {
  it('arguments', () => {
    const p = parseArgs(['simuler', '--compo', 'AADM', '--journal', '--graine=7']);
    expect(p.command).toBe('simuler');
    expect(p.options.get('compo')).toBe('AADM');
    expect(p.options.get('journal')).toBe(true);
    expect(p.options.get('graine')).toBe('7');
  });

  it('aide, commande inconnue, erreurs en français', async () => {
    expect((await run('aide')).out).toMatch(/planifier --situation/);
    const u = await run('danser');
    expect(u.code).toBe(2);
    expect(u.err).toMatch(/Commande inconnue/);
    const e = await run('simuler', '--compo', 'ADXM');
    expect(e.code).toBe(1);
    expect(e.err).toMatch(/lettre « X »/);
    expect((await run('simuler', '--mode', 'lent')).err).toMatch(/--mode/);
    expect((await run('planifier')).err).toMatch(/--situation/);
  });

  it('carte', async () => {
    const r = await run('carte');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/\^199/);
    expect(r.out).toMatch(/J314/);
    expect(r.out).toMatch(/\*299/);
    expect(r.out).toMatch(/M152/);
    expect(r.out).toMatch(/Légende/);
  });

  it('simuler (journal, trace, JSON) puis planifier depuis la trace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gladia-cli-'));
    const trace = join(dir, 'trace.json');
    const r = await run('simuler', '--compo', 'ADDM', '--graine', '4', '--mode', 'greedy', '--tours-max', '2', '--journal', '--trace', trace);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Tour 1 ═/);
    expect(r.out).toMatch(/ADDM graine 4 : arrêt au tour 3/);
    expect(r.err).toMatch(/Trace écrite/);
    expect(JSON.parse(readFileSync(trace, 'utf8')).steps.length).toBeGreaterThan(10);
    const j = await run('simuler', '--compo', 'AADM', '--graine', '1', '--mode', 'greedy', '--tours-max', '1', '--json');
    expect(JSON.parse(j.out).compo).toBe('AADM');
    const p = await run('planifier', '--trace', trace, '--tour', '2', '--joueur', 'J2', '--mode', 'greedy', '--seul');
    expect(p.code).toBe(0);
    expect(p.out).toMatch(/Tour 2 — tour de Dompteur 1/);
    expect(p.out).toMatch(/Meilleur plan de Dompteur 1/);
    expect(p.out).toMatch(/Actions : \[/);
  });

  it('planifier une situation (plan d’équipe)', async () => {
    const r = await run('planifier', '--situation', join(EX, 't1_ouverture.json'), '--mode', 'fast');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Tour 1 — tour de Acrobate/);
    expect(r.out).toMatch(/── Acrobate ──/);
    expect(r.out).toMatch(/── Magicien ──/);
    expect(r.out).toMatch(/Plan du tour global 1/);
    expect(r.out).toMatch(/Videur/);
  });

  it('comparer (fil courant)', async () => {
    const r = await run('comparer', '--compos', 'ADDM,AADM2=AADM@287,314,286,315', '--graines', '1-2', '--mode', 'greedy', '--tours-max', '1', '--coeurs', '1', '--silence');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/AADM2/);
    expect(r.out).toMatch(/ADDM contre AADM2/);
  });
});
