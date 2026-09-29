import { describe, expect, it } from 'vitest';
import { cellToPixel } from '../../sim/src/geometry/grid.js';
import { gameData } from '../../sim/src/data/index.js';
import { CELL_H, CELL_W, cellCenter, diamondPoints, mapBounds, paintOrder, pickCell, polylinePoints } from '../src/model/iso.js';

describe('géométrie d\'affichage isométrique', () => {
  it('centre des cellules = cellToPixel du client (86 × 43)', () => {
    for (const c of [0, 1, 14, 15, 152, 242, 300, 358, 559]) expect(cellCenter(c)).toEqual(cellToPixel(c));
    expect(CELL_W).toBe(86);
    expect(CELL_H).toBe(43);
    // voisins d'une même ligne écran : 86 px ; lignes décalées d'une demi-case
    const [x0, y0] = cellCenter(300);
    const [x1, y1] = cellCenter(301);
    expect(x1 - x0).toBe(86);
    expect(y1).toBe(y0);
    const [x2, y2] = cellCenter(314);
    expect(Math.abs(x2 - x0)).toBe(43);
    expect(y2 - y0).toBe(21.5);
  });

  it('pickCell est l\'inverse exact de cellCenter, y compris près des bords du losange', () => {
    for (const c of gameData.map.playable) {
      const [x, y] = cellCenter(c);
      expect(pickCell(x, y)).toBe(c);
      expect(pickCell(x + 40, y)).toBe(c);
      expect(pickCell(x - 40, y)).toBe(c);
      expect(pickCell(x, y + 20)).toBe(c);
      expect(pickCell(x, y - 20)).toBe(c);
      expect(pickCell(x + 20, y + 10)).toBe(c);
    }
    const [x, y] = cellCenter(300);
    expect(pickCell(x + 45, y)).toBe(301);
    expect(pickCell(x, y, new Set([1]))).toBe(-1);
    expect(pickCell(-5000, -5000)).toBe(-1);
  });

  it('losange, cadre, chemins et ordre de dessin', () => {
    const [x, y] = cellCenter(300);
    expect(diamondPoints(300)).toBe(`${x + 43},${y} ${x},${y + 21.5} ${x - 43},${y} ${x},${y - 21.5}`);
    const b = mapBounds(gameData.map.playable, 10);
    for (const c of gameData.map.playable) {
      const [cx, cy] = cellCenter(c);
      expect(cx - 43).toBeGreaterThanOrEqual(b.x);
      expect(cx + 43).toBeLessThanOrEqual(b.x + b.width);
      expect(cy - 21.5).toBeGreaterThanOrEqual(b.y);
      expect(cy + 21.5).toBeLessThanOrEqual(b.y + b.height);
    }
    expect(mapBounds([]).width).toBe(0);
    expect(polylinePoints([300, 301]).split(' ')).toHaveLength(2);
    expect(paintOrder(286, 314)).toBeLessThan(0);
    expect(paintOrder(314, 286)).toBeGreaterThan(0);
  });
});
