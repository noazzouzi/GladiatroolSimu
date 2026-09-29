/**
 * Catalogue statique pour l'interface (worker) : carte, archétypes et grimoires, monstres, objectifs, hypothèses
 * réglables — lus dans les données (``sim/data``) et la configuration (``sim/config``), jamais recopiés à la main.
 */
import { cellToXY } from '../../../sim/src/geometry/grid.js';
import { defaultConfig, gameData, getConfigValue } from '../../../sim/src/data/index.js';
import type { ArchetypeInfo, ArchetypeKey, Catalog, CellInfo, MonsterTypeInfo, ParamInfo } from './types.js';

const MONSTER_SHORT: Record<string, string> = { troollibre: 'T', artroolleur: 'A', nitrooll: 'N', mama: 'MAM' };
const MONSTER_IDS: Record<string, number> = { troollibre: 7981, artroolleur: 7982, nitrooll: 7983, mama: 7984 };

/** Hypothèses proposées dans l'écran Simulation (libellés français ; valeurs et alternatives lues dans la configuration). */
const PARAMS: { path: string; label: string; values?: Record<string, string>; min?: number; max?: number; step?: number }[] = [
  { path: 'spikes.playersDoubledInside', label: 'Joueurs ×2 dans les pics' },
  { path: 'spikes.playerTurnStartDamage', label: 'Dégâts des pics au début du tour d\'un joueur', min: 0, max: 4000, step: 500 },
  {
    path: 'timeline.model',
    label: 'Ordre de jeu (timeline)',
    values: {
      alternate_spawn_order: 'Alternance, Troolls par ordre d\'apparition',
      alternate_initiative: 'Alternance, Troolls par initiative',
      monsters_after_mama: 'Tous les Troolls après la Mama',
    },
  },
  { path: 'gifts.spawnProbability', label: 'Probabilité d\'un cadeau par tour (T2–T9)', min: 0, max: 1, step: 0.02 },
  {
    path: 'spawn.mode',
    label: 'Cases d\'apparition des vagues',
    values: {
      weighted_observed: 'Pondérées par les observations',
      structured_slots: 'Emplacements structurés',
      most_frequent: 'Les plus fréquentes (déterministe)',
      uniform_slots: 'Uniformes',
    },
  },
  {
    path: 'bonuses.policy',
    label: 'Choix des Acclamations',
    values: { planner: 'Évalué par le planificateur', PO_first: 'PO d\'abord', PA_first: 'PA d\'abord', DF_first: 'Dommages d\'abord' },
  },
  {
    path: 'objectives.votePolicy',
    label: 'Votes d\'objectifs',
    values: { planner: 'Préférence × faisabilité', fixed: 'Liste fixe', preference: 'Préférence seule' },
  },
];

function paramInfo(p: (typeof PARAMS)[number]): ParamInfo {
  const doc = (defaultConfig._doc ?? {})[p.path] as { type?: string; question?: string; why?: string; source?: string } | undefined;
  const def = getConfigValue(defaultConfig as never, p.path) as boolean | number | string;
  const kind: ParamInfo['kind'] = p.values ? 'enum' : typeof def === 'boolean' ? 'boolean' : Number.isInteger(def) && p.step !== undefined && p.step >= 1 ? 'integer' : 'number';
  return {
    path: p.path,
    label: p.label,
    kind,
    default: def,
    ...(p.values ? { values: Object.entries(p.values).map(([value, label]) => ({ value, label })) } : {}),
    ...(p.min !== undefined ? { min: p.min } : {}),
    ...(p.max !== undefined ? { max: p.max } : {}),
    ...(p.step !== undefined ? { step: p.step } : {}),
    ...(doc?.question ? { question: doc.question } : {}),
    help: [doc?.why, doc?.source ? `source : ${doc.source}` : ''].filter(Boolean).join(' — '),
  };
}

function spellInfo(id: number) {
  const s = gameData.spells[String(id)];
  return { id, name: s?.name ?? `Sort ${id}`, ap: s?.cast.ap ?? 0 };
}

export function buildCatalog(): Catalog {
  const m = gameData.map;
  const playable = new Set(m.playable);
  const spikes = new Set(m.spikes.cells);
  const starts = new Set(m.startCells);
  const gifts = new Set(m.giftCells);
  const obstacles = new Set(m.losBlocking);
  const ids = [...new Set([...m.playable, ...m.losBlocking, m.bossWaitCell])].sort((a, b) => a - b);
  const cells: CellInfo[] = ids.map((id) => {
    const [x, y] = cellToXY(id);
    return { id, x, y, playable: playable.has(id), spike: spikes.has(id), start: starts.has(id), gift: gifts.has(id), obstacle: obstacles.has(id) };
  });
  const spells: Catalog['spells'] = {};
  const archetypes: ArchetypeInfo[] = (['acrobate', 'dompteur', 'magicien'] as ArchetypeKey[]).map((key) => {
    const a = gameData.archetypes[key]!;
    const slots = a.spellSlots.map((s) => ({ ...spellInfo(s.spellLevelId), unlock: s.unlock }));
    const upgrades = Object.entries(a.upgrades).map(([base, u]) => ({ base: Number(base), to: u.to, name: spellInfo(u.to).name }));
    const uniques = a.uniques.map((id) => spellInfo(id));
    for (const s of [...slots, ...uniques, ...upgrades.map((u) => spellInfo(u.to))]) spells[s.id] = { id: s.id, name: s.name, ap: s.ap };
    const hpMode = defaultConfig.archetypes.hpMode as string;
    return {
      key,
      name: a.displayName,
      letter: key === 'acrobate' ? 'A' : key === 'dompteur' ? 'D' : 'M',
      hp: (a.hpByMode as Record<string, number>)[hpMode] ?? 30000,
      slots,
      upgrades,
      uniques,
      acclamations: a.acclamations.map((c) => ({ stat: c.stat, name: c.name, value: c.value })),
    };
  });
  const monsters: MonsterTypeInfo[] = (['troollibre', 'artroolleur', 'nitrooll', 'mama'] as const).map((type) => {
    const d = gameData.monsters[String(MONSTER_IDS[type])]!;
    return { type, monsterId: d.id, name: d.name, hp: d.stats.hp, short: MONSTER_SHORT[type]! };
  });
  const objectives = gameData.scenario.objectives.list.map((o) => ({ id: o.id, name: o.name, tier: o.tier, summary: o.summary }));
  return {
    map: {
      mapId: m.mapId,
      cells,
      center: m.center,
      waitCell: m.bossWaitCell,
      startCells: m.startCells.slice(),
      giftCells: m.giftCells.slice(),
      spikeCount: m.spikes.cells.length,
    },
    archetypes,
    monsters,
    objectives,
    params: PARAMS.map(paramInfo),
    spells,
    maxTurnDefault: 20,
  };
}
