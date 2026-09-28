/**
 * Carte de combat : propriétés statiques des 560 cellules (marchable en combat, ligne de vue, pics).
 *
 * Indépendante du format de données final : se construit depuis une liste de cellules {id, walkable, los, spikes?}
 * (format de sim/data/gladiatrool.data.json, SPEC §3) ou, via un adaptateur, depuis research/data/map_139988488.json.
 * Immuable : partagée entre tous les états de combat (l'occupation dynamique est fournie par prédicat).
 */

import { CELL_COUNT, INVALID_CELL, distance, isValidCell, type CellPredicate } from './grid.js';

/** Cellule d'entrée (seuls ces champs sont lus ; les autres sont ignorés). */
export interface MapCellInput {
  id: number;
  /** Marchable en combat (mov && !nonWalkableDuringFight). */
  walkable: boolean;
  /** Drapeau « los » de la carte : true = laisse passer la vue (défaut true). */
  los?: boolean;
  /** Case de pics (glyphe-aura 30390 et jouable). */
  spikes?: boolean;
}

/** Sous-ensemble utilisé de research/data/map_139988488.json. */
export interface ResearchMapJson {
  mapId?: number;
  cells: ReadonlyArray<{
    id: number;
    walkable: boolean;
    los: boolean;
    nonWalkableDuringFight?: boolean;
    fightWalkable?: boolean;
    glyph?: boolean;
  }>;
}

/** Carte de combat immuable. Les cellules non décrites sont non marchables et laissent passer la vue. */
export class MapGrid {
  readonly mapId: number | null;
  /** 1 = marchable en combat. Ne pas modifier. */
  readonly walkableMask: Uint8Array;
  /** 1 = la cellule bloque la ligne de vue (drapeau los de la carte à faux). Ne pas modifier. */
  readonly losBlockMask: Uint8Array;
  /** 1 = case de pics. Ne pas modifier. */
  readonly spikeMask: Uint8Array;
  /** Cellules marchables, triées. */
  readonly walkableCells: readonly number[];
  /** Cases de pics, triées. */
  readonly spikeCells: readonly number[];
  private edgeDepthCache: Int16Array | null = null;

  constructor(cells: Iterable<MapCellInput>, mapId: number | null = null) {
    this.mapId = mapId;
    this.walkableMask = new Uint8Array(CELL_COUNT);
    this.losBlockMask = new Uint8Array(CELL_COUNT);
    this.spikeMask = new Uint8Array(CELL_COUNT);
    const seen = new Uint8Array(CELL_COUNT);
    for (const c of cells) {
      if (!isValidCell(c.id)) throw new RangeError(`MapGrid : identifiant de cellule invalide ${c.id}`);
      if (seen[c.id]) throw new Error(`MapGrid : cellule ${c.id} décrite deux fois`);
      seen[c.id] = 1;
      this.walkableMask[c.id] = c.walkable ? 1 : 0;
      this.losBlockMask[c.id] = c.los === false ? 1 : 0;
      this.spikeMask[c.id] = c.spikes ? 1 : 0;
    }
    const walk: number[] = [];
    const spikes: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      if (this.walkableMask[c]) walk.push(c);
      if (this.spikeMask[c]) spikes.push(c);
    }
    this.walkableCells = walk;
    this.spikeCells = spikes;
  }

  /**
   * Adaptateur pour research/data/map_139988488.json :
   * walkable = fightWalkable (walkable && !nonWalkableDuringFight), los = los,
   * spikes = glyph && fightWalkable (96 cases ; les 4 ids listés non marchables 250, 293, 321, 362 sont ignorés).
   */
  static fromResearchMap(json: ResearchMapJson): MapGrid {
    return new MapGrid(
      json.cells.map((c) => {
        const walk = c.fightWalkable ?? (c.walkable && !c.nonWalkableDuringFight);
        return { id: c.id, walkable: walk, los: c.los, spikes: Boolean(c.glyph) && walk };
      }),
      json.mapId ?? null,
    );
  }

  /**
   * Depuis la section ``map`` de sim/data/gladiatrool.data.json (SPEC §3 : cells[] {id, walkable, los, spikes, …}).
   * Les champs supplémentaires (x, y, edgeDepth, neighbours…) sont ignorés.
   */
  static fromMapData(map: { mapId?: number | null; cells: Iterable<MapCellInput> }): MapGrid {
    return new MapGrid(map.cells, map.mapId ?? null);
  }

  /** Construction à partir d'ensembles de cellules (tests, cartes synthétiques). */
  static fromSets(sets: {
    walkable: Iterable<number>;
    losBlocking?: Iterable<number>;
    spikes?: Iterable<number>;
    mapId?: number | null;
  }): MapGrid {
    const cells = new Map<number, MapCellInput>();
    const get = (id: number): MapCellInput => {
      let c = cells.get(id);
      if (!c) {
        c = { id, walkable: false, los: true, spikes: false };
        cells.set(id, c);
      }
      return c;
    };
    for (const id of sets.walkable) get(id).walkable = true;
    for (const id of sets.losBlocking ?? []) get(id).los = false;
    for (const id of sets.spikes ?? []) get(id).spikes = true;
    return new MapGrid(cells.values(), sets.mapId ?? null);
  }

  /** Carte ouverte : 560 cellules marchables, aucune ne bloque la vue, pas de pics. */
  static open(): MapGrid {
    const all: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) all.push(c);
    return MapGrid.fromSets({ walkable: all });
  }

  /** Marchable en combat (faux pour une cellule invalide). */
  readonly isWalkable = (cell: number): boolean =>
    cell >= 0 && cell < CELL_COUNT && this.walkableMask[cell] === 1;

  /** La cellule bloque la ligne de vue d'après la carte (faux pour une cellule invalide). */
  readonly blocksLos = (cell: number): boolean =>
    cell >= 0 && cell < CELL_COUNT && this.losBlockMask[cell] === 1;

  /** Drapeau los de la carte (vrai = transparent) ; vrai pour une cellule invalide. */
  readonly hasLosFlag = (cell: number): boolean => !this.blocksLos(cell);

  /** Case de pics. */
  readonly isSpike = (cell: number): boolean =>
    cell >= 0 && cell < CELL_COUNT && this.spikeMask[cell] === 1;

  /** Marchable et non occupée selon le prédicat fourni. */
  isFree(cell: number, isOccupied: CellPredicate): boolean {
    return this.isWalkable(cell) && !isOccupied(cell);
  }

  /** Prédicat « marchable et libre » (``FightContext.isCellEmptyForMovement``). */
  freePredicate(isOccupied: CellPredicate): CellPredicate {
    const mask = this.walkableMask;
    return (cell: number) => cell >= 0 && cell < CELL_COUNT && mask[cell] === 1 && !isOccupied(cell);
  }

  /**
   * Profondeur de bord : distance de Manhattan à la cellule non marchable la plus proche (0 si non marchable),
   * comme le champ edgeDepth des données de carte. Calculée une fois.
   */
  edgeDepth(cell: number): number {
    if (!this.edgeDepthCache) this.edgeDepthCache = this.computeEdgeDepth();
    return cell >= 0 && cell < CELL_COUNT ? this.edgeDepthCache[cell]! : INVALID_CELL;
  }

  private computeEdgeDepth(): Int16Array {
    const out = new Int16Array(CELL_COUNT);
    const blocked: number[] = [];
    for (let c = 0; c < CELL_COUNT; c++) if (!this.walkableMask[c]) blocked.push(c);
    for (let c = 0; c < CELL_COUNT; c++) {
      if (!this.walkableMask[c]) continue;
      let best = Number.MAX_SAFE_INTEGER;
      for (const b of blocked) {
        const d = distance(c, b);
        if (d < best) best = d;
      }
      out[c] = blocked.length ? best : CELL_COUNT;
    }
    return out;
  }
}

/** Prédicat depuis un masque (Uint8Array ou tableau de 0/1 indexé par cellule). */
export function maskPredicate(mask: ArrayLike<number>): CellPredicate {
  return (cell: number) => cell >= 0 && cell < mask.length && mask[cell] !== 0;
}

/** Prédicat depuis une liste de cellules. */
export function setPredicate(cells: Iterable<number>): CellPredicate {
  const m = new Uint8Array(CELL_COUNT);
  for (const c of cells) if (c >= 0 && c < CELL_COUNT) m[c] = 1;
  return (cell: number) => cell >= 0 && cell < CELL_COUNT && m[cell] === 1;
}
