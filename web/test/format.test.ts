import { describe, expect, it } from 'vitest';
import { fmtDec } from '../src/model/format.js';

describe('fmtDec', () => {
  it('arrondit comme toFixed, donc comme sim/results/TABLEAUX.md et docs/RESULTATS.md', () => {
    // moyennes de compos-ref.json : 10,815 → 10,81 ; 5,175 → 5,17 ; 5,335 → 5,33 (et non 10,82 / 5,18 / 5,34)
    expect(fmtDec(10.815, 2)).toBe('10,81');
    expect(fmtDec(5.175, 2)).toBe('5,17');
    expect(fmtDec(5.335, 2)).toBe('5,33');
    expect(fmtDec(0.155, 3)).toBe('0,155');
    expect(fmtDec(99.36, 2)).toBe('99,36');
  });
});
