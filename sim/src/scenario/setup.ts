/**
 * Mise en place d'un combat du Gladiatrool (ETUDE §2.2 « Lancement », §3.5, §4.1, §6.2 ; données
 * ``scenario.timeline.fightStart``) :
 *
 * 1. placement : joueurs sur 286 / 287 / 314 / 315 (imposé ou automatique), Mama sur 152 (dans la timeline) ;
 * 2. sorts de départ : passif des joueurs 30639 (lancé AVANT le choix d'archétype : ses bonus conditionnels
 *    ``*E5899/5900/5901`` échouent, ETUDE §4.1 ; ses effets 125 / 153 / 138 sont de plus filtrés, PV et Puissance
 *    venant de ``archetypes.hpMode`` / ``archetypes.dompteurPower``), puis choix d'archétype (choix 16 résolu d'après la
 *    mise en place : passif 30644 / 30648 / 30649 → états 5899 / 5900 / 5901), passif de la Mama 30430 (passe-tour,
 *    arrivée retardée, Faveur, invulnérabilité) ; le grimoire initial = Frappe Repoussoir + sort de départ ;
 * 3. l'entité de scénario pose les pics (30390) et lance le gestionnaire d'objectifs 30443 niv. 1 (déclencheurs des
 *    votes ; son lancer de l'objectif Empalé sur les joueurs est remplacé par le suivi déclaratif) — Empalé est
 *    l'objectif actif ;
 * 4. V1 : 2 Troollibres sur 242 et 358 (sort de départ 30694) ;
 * 5. ordre de jeu (timeline.ts), puis avancée jusqu'au premier point de décision (``autoStart``).
 */
import {
  gameData as defaultGameData,
  loadConfig,
  type ArchetypeKey,
  type ConfigOverrides,
  type GameData,
  type SimConfig,
} from '../data/index.js';
import {
  addFighter,
  createEngineContext,
  createFight,
  resolveSpell,
  setTimeline,
  type CompiledEffect,
  type EngineContext,
  type Fighter,
  type FightState,
} from '../engine/index.js';
import { GladiatroolFight, passiveMonsterController } from './fight.js';
import { installScenarioHooks } from './hooks.js';
import { activateObjective, objectiveById } from './objectives.js';
import { ScenarioState } from './scenarioState.js';
import { computeTimeline } from './timeline.js';
import type { FightSetup, PlayerSetup } from './types.js';
import { spawnWave } from './waves.js';

/** Ordre de placement automatique : J1 sur 314 (ouverture de référence de l'Acrobate, ETUDE §10.4), puis 287, 286, 315. */
export const DEFAULT_AUTO_PLACEMENT: readonly number[] = [314, 287, 286, 315];

/** Effets du passif 30639 déjà pris en compte par ``createFighter`` (Vitalité, Puissance). */
const PASSIVE_STAT_EFFECTS: ReadonlySet<number> = new Set([125, 153, 138]);

/** Contexte moteur avec les crochets du scénario (à réutiliser pour enchaîner des combats de même configuration). */
export function createScenarioContext(opts: { data?: GameData; config?: SimConfig; overrides?: ConfigOverrides } = {}): EngineContext {
  const ctx = createEngineContext({ data: opts.data, config: opts.config, overrides: opts.overrides });
  installScenarioHooks(ctx);
  return ctx;
}

function placePlayers(ctx: EngineContext, players: readonly PlayerSetup[], auto: readonly number[]): number[] {
  const start = ctx.data.map.startCells;
  if (players.length < 1 || players.length > 4) throw new Error(`Il faut de 1 à 4 joueurs (reçu : ${players.length})`);
  const cells = new Array<number>(players.length).fill(-1);
  const used = new Set<number>();
  players.forEach((p, i) => {
    if (!ctx.data.archetypes[p.archetype]) throw new Error(`Archétype inconnu : ${String(p.archetype)}`);
    if (p.startCell === undefined) return;
    if (!start.includes(p.startCell)) throw new Error(`Case de départ invalide : ${p.startCell} (cases possibles : ${start.join(', ')})`);
    if (used.has(p.startCell)) throw new Error(`Case de départ ${p.startCell} attribuée deux fois`);
    used.add(p.startCell);
    cells[i] = p.startCell;
  });
  const order = [...auto.filter((c) => start.includes(c)), ...start];
  players.forEach((_, i) => {
    if (cells[i]! >= 0) return;
    const c = order.find((x) => !used.has(x));
    if (c === undefined) throw new Error('Plus de case de départ libre');
    used.add(c);
    cells[i] = c;
  });
  return cells;
}

function playerNames(ctx: EngineContext, players: readonly PlayerSetup[]): string[] {
  const count = new Map<ArchetypeKey, number>();
  for (const p of players) count.set(p.archetype, (count.get(p.archetype) ?? 0) + 1);
  const seen = new Map<ArchetypeKey, number>();
  return players.map((p) => {
    if (p.name) return p.name;
    const base = ctx.data.archetypes[p.archetype]!.displayName;
    if ((count.get(p.archetype) ?? 0) < 2) return base;
    const k = (seen.get(p.archetype) ?? 0) + 1;
    seen.set(p.archetype, k);
    return `${base} ${k}`;
  });
}

/** Sort de départ (passif) d'un combattant, lancé par lui-même sur sa case (profondeur 1). */
function castStartingSpell(state: FightState, f: Fighter, spellLevelId: number, filterStats = false): void {
  if (!spellLevelId || !state.ctx.hasSpell(spellLevelId)) return;
  resolveSpell(state, f, state.ctx.getSpell(spellLevelId), f.cell, {
    depth: 1,
    effectFilter: filterStats ? (e) => !PASSIVE_STAT_EFFECTS.has(e.effectId) : null,
  });
}

/**
 * Crée un combat du Gladiatrool prêt à jouer. ``data`` / ``config`` : données et configuration (défaut : fichiers de
 * ``sim/`` ; ``loadConfig(surcharges)`` pour faire varier une hypothèse) ; ``setup`` : joueurs (1 à 4, ordre de jeu),
 * graine, options. Par défaut le combat est avancé jusqu'au premier point de décision (tour de J1 au T1).
 */
export function createGladiatroolFight(data?: GameData, config?: SimConfig, setup: FightSetup = {}): GladiatroolFight {
  const o = setup.options ?? {};
  const ctx = o.ctx ?? createScenarioContext({ data: data ?? defaultGameData, config: config ?? loadConfig() });
  installScenarioHooks(ctx);
  const d = ctx.data;
  const cfg = ctx.config;
  const seed = setup.seed ?? cfg.rng.seed;
  const state = createFight(ctx, { seed, eventLog: o.eventLog });
  const sc = new ScenarioState();
  sc.seed = (o.scenarioSeed ?? cfg.spawn.seed ?? seed) >>> 0;
  sc.timelineOrder = o.timelineOrder ?? null;
  state.scenario = sc;

  // 1. placement
  const players: readonly PlayerSetup[] = setup.players ?? cfg.timeline.playerOrder.map((archetype) => ({ archetype }));
  const cells = placePlayers(ctx, players, o.autoPlacementOrder ?? DEFAULT_AUTO_PLACEMENT);
  const names = playerNames(ctx, players);
  const pf = players.map((p, i) => addFighter(state, { kind: 'archetype', archetype: p.archetype, name: names[i] }, cells[i]!));
  sc.playerIds = pf.map((f) => f.id);
  sc.startCells = pf.map(() => -1);
  sc.giftDraws = pf.map(() => 0);
  const sce = addFighter(state, { kind: 'scenario', name: 'Scénario' }, -1);
  sc.sceId = sce.id;
  const boss = d.boss;
  const mama = addFighter(state, { kind: 'monster', monsterId: boss.monsterId, name: d.monsters[String(boss.monsterId)]?.name }, boss.waitCell);
  sc.mamaId = mama.id;

  // 2-4. déroulé des données (fightStart)
  const managerLevel = d.scenario.objectives.manager.spellLevels[0];
  const firstObjective = objectiveById(d, d.scenario.objectives.manager.first);
  for (const step of d.scenario.timeline.fightStart) {
    switch (step.op) {
      case 'startingSpells':
        for (const f of pf) castStartingSpell(state, f, step.players ?? f.startingSpellLevelId, true);
        // choix d'archétype (16) résolu d'après la mise en place, APRÈS le passif (ETUDE §4.1)
        for (const f of pf) castStartingSpell(state, f, f.archetypeData!.passiveSpellLevelId);
        castStartingSpell(state, mama, step.boss ?? boss.startingSpellLevel);
        break;
      case 'scenarioCast': {
        const lvl = step.spellLevel!;
        if (!ctx.hasSpell(lvl)) break;
        // gestionnaire d'objectifs : seulement les déclencheurs des votes (l'objectif lui-même est suivi par objectives.ts)
        const filter = lvl === managerLevel ? (e: CompiledEffect) => e.data.subSpell?.spellId !== firstObjective.spellId : null;
        resolveSpell(state, sce, ctx.getSpell(lvl), -1, { depth: 1, effectFilter: filter });
        break;
      }
      case 'spawnWave': {
        const w = d.scenario.waves.find((x) => x.n === step.wave);
        if (w) spawnWave(state, w);
        break;
      }
      default:
        break;
    }
  }
  activateObjective(state, firstObjective.id);

  // 5. ordre de jeu
  setTimeline(state, computeTimeline(state, sc));
  const fight = new GladiatroolFight(state, o.monsterController ?? passiveMonsterController);
  if (o.autoStart ?? true) fight.advance();
  return fight;
}
