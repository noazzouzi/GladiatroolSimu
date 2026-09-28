/**
 * Aides des tests « buffs, déclencheurs, glyphes, tours » : combat complet sur la carte réelle avec l'entité de
 * scénario, les pics posés (30390 niv. 1), les sorts de départ (passifs) lancés et une timeline.
 */
import type { ConfigOverrides } from '../../src/data/index.js';
import {
  addFighter,
  resolveSpell,
  setTimeline,
  type EngineHooks,
  type Fighter,
  type FightState,
} from '../../src/engine/index.js';
import { SL, testFight } from './engineSetup.js';

/** Lance le sort de départ (passif) d'un combattant sur lui-même, comme le serveur au début du combat. */
export function castPassive(state: FightState, f: Fighter): void {
  if (f.startingSpellLevelId && state.ctx.hasSpell(f.startingSpellLevelId)) {
    resolveSpell(state, f, state.ctx.getSpell(f.startingSpellLevelId), f.cell);
  }
}

export interface ArenaSetup {
  s: FightState;
  sce: Fighter;
}

/** Combat avec entité de scénario et pics posés (aura 1091 + glyphe de début de tour 401). */
export function arena(overrides: ConfigOverrides = {}, hooks?: EngineHooks): ArenaSetup {
  const s = testFight(overrides, hooks);
  const sce = addFighter(s, { kind: 'scenario' }, -1);
  resolveSpell(s, sce, s.ctx.getSpell(SL.spikesGlyph), -1);
  return { s, sce };
}

/** Ajoute un archétype (grimoire complet par défaut) et lance son passif. */
export function player(state: FightState, key: 'acrobate' | 'dompteur' | 'magicien', cell: number, spells: number[] | 'all' = 'all'): Fighter {
  const f = addFighter(state, { kind: 'archetype', archetype: key, spells }, cell);
  castPassive(state, f);
  return f;
}

/** Ajoute un monstre et lance son sort de départ. */
export function mob(state: FightState, monsterId: number, cell: number): Fighter {
  const f = addFighter(state, { kind: 'monster', monsterId }, cell);
  castPassive(state, f);
  return f;
}

/** Timeline explicite (ids). */
export function timeline(state: FightState, fighters: Fighter[]): void {
  setTimeline(state, fighters.map((f) => f.id));
}

/** Premier / dernier dommage subi par ``id`` dans le journal (hors collisions sauf demande). */
export function damagesOf(state: FightState, id: number, collision = false): number[] {
  return state.log!.ofType('damage').filter((e) => e.targetId === id && e.collision === collision).map((e) => e.amount);
}

/** Cases des pics (96 cases jouables). */
export function spikeCells(state: FightState): number[] {
  return state.ctx.data.map.spikes.cells.slice();
}
