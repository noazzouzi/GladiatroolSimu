/**
 * Situation décrite en JSON (docs/FORMAT_SITUATION.md) → combat prêt à planifier (``buildSituation``).
 *
 * Construction (mise en place, comme les aides de test : ce n'est pas le planificateur qui agit) :
 *
 * 1. combat neuf (composition, graine, surcharges de configuration), avancé PASSIVEMENT (joueurs qui passent,
 *    monstres passifs, choix : première option) jusqu'au tour du personnage courant au tour global demandé —
 *    vagues, cadeaux, arrivée de la Mama et Rassemblements se déroulent normalement ;
 * 2. monstres de la situation créés (sort de départ, sous-liste de la timeline), anciens Troolls retirés (tués) ;
 * 3. objectifs réalisés validés dans l'ordre (récompenses du jeu : sorts appris, Faveur de la Mama) ;
 * 4. ordre de jeu du tour recalculé (alternance joueurs / monstres de la situation), index sur le courant ;
 * 5. placement de tous les combattants par téléportation du moteur (entrées / sorties des pics traitées :
 *    Vulnérable et ×2 dans les pics ; vulnérabilité de sortie retirée sauf si demandée), états demandés, PV ;
 * 6. cadeaux, grimoires (sorts, améliorations, uniques), Acclamations, PA / PM restants ;
 * 7. objectif en cours activé comme s'il l'était depuis le début du tour du courant.
 */
import { gameData, loadConfig, type ArchetypeKey, type ConfigOverrides, type ObjectiveId } from '../data/index.js';
import {
  Buff,
  addBuff,
  finishAction,
  forgetSpell,
  killFighter,
  learnSpell,
  obtainSpell,
  removeBuffsWhere,
  removeMark,
  resolveSpell,
  teleportTo,
  SPELL_IDS,
  type Fighter,
  type FightState,
} from '../engine/index.js';
import { monsterAi } from '../ai/index.js';
import {
  activateObjective,
  completeActiveObjective,
  computeTimeline,
  createGladiatroolFight,
  flushScenario,
  giftCells,
  spawnWave,
  type GladiatroolFight,
  type PlayerSetup,
} from '../scenario/index.js';
import { objectivesOnTurnStart } from '../scenario/objectives.js';

// ---------------------------------------------------------------------------------------------
// Format
// ---------------------------------------------------------------------------------------------

export type SituationState = 'vulnerable' | 'inebranlable';

export interface SituationPlayer {
  archetype: ArchetypeKey;
  name?: string;
  /** Case (défaut : case de départ). */
  cell?: number;
  hp?: number;
  /** PV max érodés (défaut 0). */
  eroded?: number;
  dead?: boolean;
  /** Grimoire complet (niveaux de sort) ; défaut : sort commun + sort de départ + sorts des objectifs réalisés. */
  spells?: number[];
  /** Sorts améliorés (niveau de BASE) : carte « Amélioration : X » appliquée. */
  upgrades?: number[];
  /** Sorts uniques possédés (niveaux de sort). */
  uniques?: number[];
  /** Cartes d'Acclamation reçues, par caractéristique (nombre de cartes : ``{ "ap": 1, "range": 2 }``). */
  bonuses?: Record<string, number>;
  states?: SituationState[];
  /** Personnage courant seulement : PA / PM restants (défaut : tous). */
  ap?: number;
  mp?: number;
}

export interface SituationMonster {
  type: 'troollibre' | 'artroolleur' | 'nitrooll' | 'mama';
  cell?: number;
  hp?: number;
  /** PV max érodés (défaut 0). */
  eroded?: number;
  dead?: boolean;
  states?: SituationState[];
}

export interface Situation {
  version?: 1;
  description?: string;
  seed?: number;
  scenarioSeed?: number;
  configOverrides?: ConfigOverrides;
  turn: number;
  /** Joueurs dans l'ordre de jeu (1 à 4). */
  players: SituationPlayer[];
  /** Monstres (hors Mama : les Troolls de la situation remplacent ceux du combat ; Mama : état de la Mama). */
  monsters: SituationMonster[];
  /** Personnage dont c'est le tour : « J2 », nom, ou rang (0 = premier joueur). Défaut : premier joueur vivant. */
  current?: string | number;
  objectives?: { completed?: ObjectiveId[]; active?: ObjectiveId | null };
  /** Cases portant un cadeau (défaut : aucune). */
  gifts?: number[];
}

export const MONSTER_TYPES: Readonly<Record<SituationMonster['type'], number>> = {
  troollibre: 7981,
  artroolleur: 7982,
  nitrooll: 7983,
  mama: 7984,
};

const STATE_IDS: Readonly<Record<SituationState, number>> = { vulnerable: 5994, inebranlable: 157 };

export interface BuiltSituation {
  fight: GladiatroolFight;
  /** Avertissements (français) : éléments ignorés ou ajustés. */
  warnings: string[];
}

// ---------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------

/** Contrôle de forme (erreurs en français) ; renvoie la liste des erreurs. */
export function validateSituation(s: unknown): string[] {
  const e: string[] = [];
  const o = s as Partial<Situation>;
  if (!o || typeof o !== 'object') return ['la situation doit être un objet JSON'];
  if (!Number.isInteger(o.turn) || (o.turn as number) < 1) e.push('« turn » : entier ≥ 1 attendu');
  if (!Array.isArray(o.players) || o.players.length < 1 || o.players.length > 4) e.push('« players » : 1 à 4 joueurs attendus');
  else
    o.players.forEach((p, i) => {
      if (!['acrobate', 'dompteur', 'magicien'].includes(p?.archetype as string)) e.push(`players[${i}].archetype : acrobate, dompteur ou magicien`);
      if (p.cell !== undefined && !gameData.map.playable.includes(p.cell)) e.push(`players[${i}].cell : ${p.cell} n'est pas une case jouable`);
    });
  if (!Array.isArray(o.monsters)) e.push('« monsters » : liste attendue (éventuellement vide)');
  else
    o.monsters.forEach((m, i) => {
      if (!(m?.type in MONSTER_TYPES)) e.push(`monsters[${i}].type : troollibre, artroolleur, nitrooll ou mama`);
      if (m.type !== 'mama' && !m.dead && m.cell === undefined) e.push(`monsters[${i}].cell : case requise`);
      if (m.cell !== undefined && !gameData.map.playable.includes(m.cell)) e.push(`monsters[${i}].cell : ${m.cell} n'est pas une case jouable`);
    });
  const cells = [
    ...(o.players ?? []).filter((p) => !p.dead && p.cell !== undefined).map((p) => p.cell!),
    ...(o.monsters ?? []).filter((m) => !m.dead && m.cell !== undefined).map((m) => m.cell!),
  ];
  const dup = cells.filter((c, i) => cells.indexOf(c) !== i);
  if (dup.length) e.push(`cases occupées deux fois : ${[...new Set(dup)].join(', ')}`);
  return e;
}

// ---------------------------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------------------------

function settle(fight: GladiatroolFight): void {
  finishAction(fight.state);
  flushScenario(fight.state);
}

function resolveAllFirst(fight: GladiatroolFight): void {
  for (let g = 0; g < 256; g++) {
    const c = fight.getPendingChoice();
    if (!c) return;
    if (!fight.resolveChoice(c.uid, 0).ok) return;
  }
}

function currentIndex(sit: Situation, names: readonly string[]): number {
  const cur = sit.current;
  if (cur === undefined) return sit.players.findIndex((p) => !p.dead);
  if (typeof cur === 'number') return cur;
  const key = cur.trim().toLowerCase();
  const m = /^j(\d)$/.exec(key);
  if (m) return Number(m[1]) - 1;
  const i = names.findIndex((n) => n.toLowerCase() === key);
  if (i >= 0) return i;
  return sit.players.findIndex((p) => p.archetype === key);
}

/** Case libre, jouable, hors pics, hors ``avoid`` (la plus proche du centre). */
function freeTempCell(state: FightState, avoid: ReadonlySet<number>): number {
  const grid = state.ctx.grid;
  const center = state.ctx.data.map.center;
  let best = -1;
  let bestD = Infinity;
  for (const c of state.ctx.data.map.playable) {
    if (grid.isSpike(c) || avoid.has(c) || state.isOccupied(c)) continue;
    const d = Math.abs(c - center);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (best < 0) throw new Error('aucune case libre pour la mise en place');
  return best;
}

/** Place chaque combattant sur sa case (téléportation du moteur), en déplaçant d'abord les gêneurs. */
function placeAll(fight: GladiatroolFight, assignments: readonly [Fighter, number][]): void {
  const state = fight.state;
  const targets = new Set(assignments.map(([, c]) => c));
  for (let round = 0; round < 4 * assignments.length + 4; round++) {
    let pending = 0;
    for (const [f, cell] of assignments) {
      if (!f.alive || f.cell === cell) continue;
      pending++;
      const occ = state.fighterAt(cell);
      if (occ && occ !== f) {
        // gêneur : sur une case provisoire hors des cibles
        teleportTo(state, occ, freeTempCell(state, targets), -1, 'teleport');
        settle(fight);
      }
      if (!state.fighterAt(cell) && f.alive) {
        teleportTo(state, f, cell, -1, 'teleport');
        settle(fight);
      }
    }
    if (!pending) return;
  }
  throw new Error('placement impossible (cases en conflit)');
}

function nearestSpike(state: FightState, cell: number): number {
  const grid = state.ctx.grid;
  let best = -1;
  let bestD = Infinity;
  for (const c of grid.spikeCells) {
    if (!grid.isWalkable(c) || state.isOccupied(c)) continue;
    const d = Math.abs(c - cell);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function addStateBuff(state: FightState, f: Fighter, stateId: number): void {
  const b = new Buff();
  b.kind = 'state';
  b.stateId = stateId;
  b.casterId = f.id;
  b.duration = 1;
  addBuff(state, f, b);
}

/** Construit le combat décrit par ``sit`` (voir l'en-tête du module et docs/FORMAT_SITUATION.md). */
export function buildSituation(sit: Situation, o: { eventLog?: boolean } = {}): BuiltSituation {
  const errors = validateSituation(sit);
  if (errors.length) throw new Error(`situation invalide :\n- ${errors.join('\n- ')}`);
  const warnings: string[] = [];
  const players: PlayerSetup[] = sit.players.map((p) => ({ archetype: p.archetype, ...(p.name ? { name: p.name } : {}) }));
  const fight = createGladiatroolFight(gameData, loadConfig((sit.configOverrides ?? {}) as ConfigOverrides), {
    players,
    seed: sit.seed ?? 1,
    options: {
      eventLog: o.eventLog ?? false,
      monsterController: monsterAi,
      ...(sit.scenarioSeed !== undefined ? { scenarioSeed: sit.scenarioSeed } : {}),
    },
  });
  const state = fight.state;
  const sc = fight.scenario;
  const ci = currentIndex(sit, sc.playerIds.map((id) => state.fighters[id]!.name));
  if (ci < 0 || ci >= sit.players.length) throw new Error(`personnage courant « ${String(sit.current)} » introuvable`);
  if (sit.players[ci]!.dead) throw new Error('le personnage courant est mort');
  const currentId = sc.playerIds[ci]!;

  // 1. avancée passive jusqu'au tour du courant au tour demandé
  for (let guard = 0; guard < 100_000; guard++) {
    const st = fight.getStatus();
    if (st.kind === 'ended') throw new Error(`le combat s'est terminé pendant l'avancée (tour ${fight.turn})`);
    if (fight.turn > sit.turn) throw new Error(`tour ${sit.turn} dépassé sans atteindre le tour du personnage courant`);
    if (st.kind === 'playerTurn' && fight.turn === sit.turn && st.fighterId === currentId) break;
    if (st.kind === 'choice') resolveAllFirst(fight);
    else if (st.kind === 'playerTurn') fight.endTurn();
    else if (st.kind === 'monsterTurn') fight.stepMonsterTurn(() => {});
    else fight.advance();
  }

  // 2. monstres : ceux de la situation (cases provisoires), puis retrait des anciens Troolls
  const mamaSpec = sit.monsters.find((m) => m.type === 'mama');
  const trollSpecs = sit.monsters.filter((m) => m.type !== 'mama' && !m.dead);
  const old = fight.getLivingMonsters().filter((f) => f.id !== sc.mamaId && !f.isSummon);
  const targets = new Set<number>([
    ...sit.players.filter((p) => p.cell !== undefined).map((p) => p.cell!),
    ...sit.monsters.filter((m) => m.cell !== undefined).map((m) => m.cell!),
  ]);
  const created: Fighter[] = [];
  trollSpecs.forEach((m, i) => {
    const temp = freeTempCell(state, targets);
    const spawned = spawnWave(state, {
      n: 100 + i,
      turn: state.turn,
      timing: 'globalTurnStart',
      composition: [{ monsterId: MONSTER_TYPES[m.type], count: 1 }],
      spawn: { fixedCells: [temp] } as never,
      _prov: {} as never,
    });
    created.push(...spawned);
    settle(fight);
  });
  // les apparitions de la situation ne sont pas des vagues du combat
  sc.waves = sc.waves.filter((w) => w.wave < 100);
  for (const f of old) killFighter(state, f, -1, 'other');
  settle(fight);
  sc.deaths = sc.deaths.filter((d) => !old.some((f) => f.id === d.fighterId));
  // noms numérotés dans l'ordre de la situation (« Troollibre 1 »…)
  const perType = new Map<number, number>();
  for (const f of created) {
    const n = (perType.get(f.monsterId) ?? 0) + 1;
    perType.set(f.monsterId, n);
    f.name = `${state.ctx.data.monsters[String(f.monsterId)]?.name ?? 'Monstre'} ${n}`;
  }

  // 3. objectifs réalisés (récompenses du jeu)
  const completed = sit.objectives?.completed ?? [];
  for (const id of completed) {
    if (sc.completed.some((c) => c.objectiveId === id)) continue;
    activateObjective(state, id);
    completeActiveObjective(state, currentId);
    settle(fight);
    resolveAllFirst(fight);
  }

  // 4. ordre de jeu du tour (alternance avec les monstres de la situation), index sur le courant
  state.timeline = computeTimeline(state, sc);
  state.timelineIndex = state.timeline.indexOf(currentId);

  // 5. placement, états, PV
  const assignments: [Fighter, number][] = [];
  sit.players.forEach((p, i) => {
    const f = state.fighters[sc.playerIds[i]!]!;
    if (!p.dead && p.cell !== undefined) assignments.push([f, p.cell]);
  });
  trollSpecs.forEach((m, i) => assignments.push([created[i]!, m.cell!]));
  const mama = sc.mamaId >= 0 ? state.fighters[sc.mamaId]! : null;
  const mamaWaiting = !!mama && mama.alive && mama.cell === state.ctx.data.boss.waitCell;
  if (mama && mamaSpec && !mamaSpec.dead && mamaSpec.cell !== undefined) {
    if (mamaWaiting) warnings.push(`Mama : encore en attente sur ${mama.cell} au tour ${state.turn} (arrivée au T8) — case ${mamaSpec.cell} ignorée`);
    else assignments.push([mama, mamaSpec.cell]);
  }
  placeAll(fight, assignments);
  const grid = state.ctx.grid;
  const stateSpecs: [Fighter, SituationState[]][] = [];
  sit.players.forEach((p, i) => stateSpecs.push([state.fighters[sc.playerIds[i]!]!, p.dead ? [] : p.states ?? []]));
  trollSpecs.forEach((m, i) => stateSpecs.push([created[i]!, m.states ?? []]));
  if (mama && mamaSpec && !mamaSpec.dead) stateSpecs.push([mama, mamaSpec.states ?? []]);
  for (const [f, states] of stateSpecs) {
    if (!f.alive) continue;
    const wantVuln = states.includes('vulnerable');
    if (!grid.isSpike(f.cell)) {
      // vulnérabilité de sortie des pics : seulement si demandée
      if (!wantVuln) removeBuffsWhere(state, f, (b) => b.spellId === SPELL_IDS.spikesExit, 'situation');
      else if (!f.hasState(STATE_IDS.vulnerable)) {
        const home = f.cell;
        const sp = nearestSpike(state, home);
        if (sp >= 0) {
          teleportTo(state, f, sp, -1, 'teleport');
          settle(fight);
          if (f.alive) {
            teleportTo(state, f, home, -1, 'teleport');
            settle(fight);
          }
        }
      }
    }
    if (states.includes('inebranlable') && !f.hasState(STATE_IDS.inebranlable)) addStateBuff(state, f, STATE_IDS.inebranlable);
  }

  // 6. cadeaux, grimoires, Acclamations, PA / PM
  for (const m of state.marks.slice()) {
    if (m.casterId === sc.sceId && m.sourceSpellId === state.ctx.data.scenario.gifts.spellId) removeMark(state, m, 'situation');
  }
  for (const c of sit.gifts ?? []) {
    if (state.isOccupied(c)) {
      warnings.push(`cadeau sur ${c} ignoré : case occupée`);
      continue;
    }
    const sce = state.fighters[sc.sceId]!;
    resolveSpell(state, sce, state.ctx.getSpell(state.ctx.data.scenario.gifts.spellLevel), c, { depth: 1 });
    sc.giftsSpawned += 1;
  }
  settle(fight);
  if (giftCells(state, sc).length !== (sit.gifts ?? []).filter((c) => !state.fighterAt(c)).length) {
    warnings.push('cadeaux : nombre posé différent de la demande');
  }
  const tiers = sc.completed.length;
  sit.players.forEach((p, i) => {
    const f = state.fighters[sc.playerIds[i]!]!;
    if (!f.alive) return;
    const a = state.ctx.data.archetypes[p.archetype]!;
    // Acclamations : on retire celles de l'avancée passive, on applique celles de la situation
    const accIds = new Set<number>();
    for (const card of a.acclamations) {
      accIds.add(card.choiceSpellLevelId);
      accIds.add(card.realSpellLevel);
    }
    removeBuffsWhere(state, f, (b) => accIds.has(b.spellLevelId), 'situation');
    for (const [stat, n] of Object.entries(p.bonuses ?? {})) {
      const card = a.acclamations.find((c) => c.stat === stat);
      if (!card) {
        warnings.push(`${f.name} : Acclamation « ${stat} » inconnue pour ${a.displayName}`);
        continue;
      }
      for (let k = 0; k < n; k++) resolveSpell(state, f, state.ctx.getSpell(card.choiceSpellLevelId), f.cell, { depth: 1 });
    }
    // grimoire attendu
    let wanted: number[];
    if (p.spells) wanted = p.spells.slice();
    else {
      wanted = a.spellSlots.filter((s) => s.unlock === 'common' || s.unlock === 'start' || (/^tier(\d)$/.test(s.unlock) && Number(s.unlock.slice(4)) <= tiers)).map((s) => s.spellLevelId);
    }
    for (const base of p.upgrades ?? []) {
      const up = a.upgrades[String(base)];
      if (!up) {
        warnings.push(`${f.name} : pas d'amélioration pour le sort ${base}`);
        continue;
      }
      wanted = wanted.map((x) => (x === base ? up.to : x));
      if (!wanted.includes(up.to)) wanted.push(up.to);
    }
    for (const u of p.uniques ?? []) if (!wanted.includes(u)) wanted.push(u);
    for (const s of f.spells.slice()) if (!wanted.includes(s.spellLevelId)) forgetSpell(state, f, s.spellLevelId);
    for (const id of wanted) {
      if (f.knowsSpell(id)) continue;
      if (!state.ctx.hasSpell(id)) {
        warnings.push(`${f.name} : sort ${id} inconnu`);
        continue;
      }
      if ((p.uniques ?? []).includes(id)) {
        obtainSpell(state, f, id);
        sc.obtainedUniques.push(f.id, id);
      } else learnSpell(state, f, id);
    }
    if (f.id === currentId) {
      if (p.ap !== undefined) f.apUsed = Math.max(0, f.maxAp - p.ap);
      if (p.mp !== undefined) f.mpUsed = Math.max(0, f.maxMp - p.mp);
    }
  });
  settle(fight);
  // PV (après les Acclamations : la vitalité change les PV max) ; érosion des PV max remise à la valeur demandée
  const hpOf = (f: Fighter, hp: number | undefined, eroded: number | undefined) => {
    if (!f.alive) return;
    f.erodedHp = Math.max(0, Math.round(eroded ?? 0));
    f.hp = Math.max(1, Math.min(f.maxHp, Math.round(hp ?? f.maxHp)));
  };
  sit.players.forEach((p, i) => hpOf(state.fighters[sc.playerIds[i]!]!, p.hp, p.eroded));
  trollSpecs.forEach((m, i) => hpOf(created[i]!, m.hp, m.eroded));
  if (mama && mamaSpec && !mamaSpec.dead) hpOf(mama, mamaSpec.hp, mamaSpec.eroded);
  // morts demandées
  sit.players.forEach((p, i) => {
    const f = state.fighters[sc.playerIds[i]!]!;
    if (p.dead && f.alive) killFighter(state, f, -1, 'other');
  });
  if (mama && mama.alive && mamaSpec?.dead) killFighter(state, mama, -1, 'other');
  settle(fight);

  // 7. objectif en cours, actif depuis le début du tour du courant
  const active = sit.objectives && 'active' in sit.objectives ? sit.objectives.active : undefined;
  if (active === null) sc.active = null;
  else if (active !== undefined && sc.active !== active) activateObjective(state, active);
  if (sc.active) objectivesOnTurnStart(state, sc, state.fighters[currentId]!);
  settle(fight);
  resolveAllFirst(fight);
  const st = fight.getStatus();
  if (st.kind !== 'playerTurn' || st.fighterId !== currentId) {
    warnings.push(`après la mise en place, le point de décision est « ${st.kind} » (tour du personnage courant attendu)`);
  }
  return { fight, warnings };
}
