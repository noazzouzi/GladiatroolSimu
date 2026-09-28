/**
 * Environnement de l'IA des monstres, calculé une fois par contexte moteur (cache) : règles des pics lues dans les
 * niveaux de sort compilés (multiplicateurs d'aura et de sortie, dégâts d'entrée et de début de tour par camp),
 * distance de chaque case aux pics, niveau de sort du Rassemblement de la Mama.
 *
 * Rien n'est recopié des données : tout est lu dans les sorts compilés par le moteur (``ctx.getSpell``), donc les
 * exceptions de configuration (``spikes.*``) y sont déjà appliquées.
 */
import type { Camp, SimConfig } from '../data/index.js';
import { CELL_COUNT, distance, type MapGrid } from '../geometry/index.js';
import { SPELL_IDS, type CompiledSpellLevel, type EngineContext } from '../engine/index.js';

/** Multiplicateur 1163 (valeur en %, déclencheurs filtres, camp visé ; null = tous). */
export interface MultSpec {
  readonly value: number;
  readonly triggers: readonly string[];
  readonly camp: Camp | null;
}

/** Sort « passif de sortie des pics » (30700) : son buff déclenché marque les combattants qui deviennent Vulnérables en sortant. */
export const EXIT_PASSIVE_SPELL_ID = 30700;

export interface AiEnv {
  readonly ctx: EngineContext;
  readonly grid: MapGrid;
  readonly config: SimConfig;
  /** 1163 de l'aura des pics (30390 niv. 2), null si absent. */
  readonly aura: MultSpec | null;
  /** 1163 de la vulnérabilité de sortie (30701), null si absent. */
  readonly exit: MultSpec | null;
  /** Dégâts bruts d'entrée dans les pics par camp (effets 100 de 30390 niv. 2). */
  readonly entryRaw: Readonly<Record<Camp, number>>;
  /** Dégâts bruts du glyphe de début de tour par camp (30390 niv. 3). */
  readonly turnStartRaw: Readonly<Record<Camp, number>>;
  /** Rassemblement Troollesque, niveau qui attire / repousse (30432 niv. 4), null si absent. */
  readonly rassemblement: CompiledSpellLevel | null;
  /** Distance de Manhattan de chaque case à la case de pics la plus proche (0 sur les pics, 99 hors carte). */
  readonly spikeDist: Int16Array;
}

const cache = new WeakMap<EngineContext, AiEnv>();

function levelOf(ctx: EngineContext, spellId: number, grade: number): CompiledSpellLevel | null {
  const ids = ctx.data.spellIndex[String(spellId)];
  const id = ids?.[grade - 1];
  return id !== undefined && ctx.hasSpell(id) ? ctx.getSpell(id) : null;
}

function multOf(level: CompiledSpellLevel | null): MultSpec | null {
  if (!level) return null;
  for (const e of level.effects) {
    if (e.handler === 'receivedDamageMultiplier' && !e.disabled) {
      return { value: e.lo, triggers: e.data.triggers, camp: e.mask.camp };
    }
  }
  return null;
}

function rawByCamp(level: CompiledSpellLevel | null): Record<Camp, number> {
  const out: Record<Camp, number> = { Atq: 0, Def: 0, Sce: 0 };
  if (!level) return out;
  for (const e of level.effects) {
    if (e.handler !== 'damage' || e.disabled) continue;
    const v = (e.lo + e.hi) / 2;
    if (e.mask.camp === null) {
      out.Atq += v;
      out.Def += v;
    } else out[e.mask.camp] += v;
  }
  return out;
}

function computeSpikeDist(grid: MapGrid): Int16Array {
  const out = new Int16Array(CELL_COUNT).fill(99);
  const spikes = grid.spikeCells;
  for (const c of grid.walkableCells) {
    let best = 99;
    for (const s of spikes) {
      const d = distance(c, s);
      if (d < best) best = d;
    }
    out[c] = best;
  }
  return out;
}

/** Environnement de l'IA pour ce contexte (calculé au premier appel, puis en cache). */
export function aiEnv(ctx: EngineContext): AiEnv {
  let env = cache.get(ctx);
  if (!env) {
    const entry = levelOf(ctx, SPELL_IDS.spikes, 2);
    env = {
      ctx,
      grid: ctx.grid,
      config: ctx.config,
      aura: multOf(entry),
      exit: multOf(levelOf(ctx, SPELL_IDS.spikesExit, 1)),
      entryRaw: rawByCamp(entry),
      turnStartRaw: rawByCamp(levelOf(ctx, SPELL_IDS.spikes, 3)),
      rassemblement: levelOf(ctx, SPELL_IDS.rassemblement, 4),
      spikeDist: computeSpikeDist(ctx.grid),
    };
    cache.set(ctx, env);
  }
  return env;
}
