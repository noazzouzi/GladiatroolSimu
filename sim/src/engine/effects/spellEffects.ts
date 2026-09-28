/**
 * Gestionnaires liés aux sorts : sous-sorts (792, 793, 1160, 2160, 1008, 2792, 2793, 2794, 2795, 2960, 1017, 2017,
 * 1018, 1019 ; lanceur et case selon ``solveSpellExecution``, ETUDE §9.10), sorts temporaires (3405 apprend — avec
 * l'effet d'obtention des données, ex. Relâchement de Fureur —, 3406 oublie), choix (3008 individuel, 3404 global →
 * ``pendingChoices``), invocation (181, insertion dans la timeline), pose de marques (401, 402, 1091, 1165 ; leur
 * comportement est dans marks.ts) et dissipation (2018).
 */
import type { SubSpellCaster, SubSpellCell } from '../../data/index.js';
import { CELL_COUNT, isValidCell } from '../../geometry/index.js';
import { resolveSpell } from '../cast.js';
import { makeSpellSlot, type Fighter } from '../fighter.js';
import { marksOnEnter, removeMark } from '../marks.js';
import { POUTCH_MONSTER_IDS } from '../spells.js';
import { addFighter, Mark, type FightState, type MarkType } from '../state.js';
import { fireBuff } from '../triggerProcessing.js';
import { EMPTY_CHAIN } from '../triggers.js';
import { insertSummonInTimeline } from '../turns.js';
import { checkCell } from '../validation.js';
import type { EffectApplication, EffectHandlerFn } from './types.js';

type Executor = { caster: SubSpellCaster; cell: SubSpellCell; globalLimit: boolean };

/**
 * Exécuteurs absents du catalogue des données (effets non utilisés par le Gladiatrool), d'après
 * ``DamageCalculator.solveSpellExecution`` (N70 §7.4) : 793 / 2793 comme 792, 1008 comme 1160, 2795 comme 2794.
 */
const EXTRA_EXECUTORS: Readonly<Record<number, Executor>> = {
  793: { caster: 'effectTarget', cell: 'effectTargetCell', globalLimit: false },
  2793: { caster: 'effectTarget', cell: 'effectTargetCell', globalLimit: true },
  1008: { caster: 'originalCaster', cell: 'effectTargetCell', globalLimit: false },
  2795: { caster: 'effectTarget', cell: 'parentTargetedCell', globalLimit: true },
};

function executorOf(app: EffectApplication): Executor {
  const ex = app.effect.catalog?.executor;
  if (ex) return ex;
  const r = app.state.ctx.data.rules.subSpellExecutors[String(app.effect.effectId)];
  if (!r && EXTRA_EXECUTORS[app.effect.effectId]) return EXTRA_EXECUTORS[app.effect.effectId]!;
  return { caster: r?.caster ?? 'effectTarget', cell: r?.cell ?? 'effectTargetCell', globalLimit: r?.maxExecutions === 'value' };
}

/** Niveau du sous-sort (substitut si le niveau référencé manque, 80750 → 80760). */
function subSpellLevel(app: EffectApplication): number {
  const ref = app.effect.data.subSpell;
  if (!ref) return 0;
  if (ref.spellLevelId !== null && app.state.ctx.hasSpell(ref.spellLevelId)) return ref.spellLevelId;
  return ref.substituteSpellLevelId ?? 0;
}

export const executeSubSpellHandler: EffectHandlerFn = (app, target) => {
  const state = app.state;
  const ex = executorOf(app);
  const limit = app.effect.data.value;
  if (ex.globalLimit && limit > 0 && app.execCount >= limit) return;
  const levelId = subSpellLevel(app);
  if (!levelId) return;
  const t = target ?? app.caster;
  const carrier = app.cctx.buffCarrierId >= 0 ? state.fighters[app.cctx.buffCarrierId] ?? t : t;
  const source = app.cctx.triggerSourceId >= 0 ? state.fighters[app.cctx.triggerSourceId] ?? app.caster : app.caster;
  let subCaster: Fighter;
  switch (ex.caster) {
    case 'effectTarget':
      subCaster = t;
      break;
    case 'originalCaster':
      subCaster = app.caster;
      break;
    case 'buffCarrier':
      subCaster = carrier;
      break;
    case 'eventSource':
      subCaster = source;
      break;
  }
  let cell: number;
  switch (ex.cell) {
    case 'effectTargetCell':
      cell = cellOf(t);
      break;
    case 'eventSourceCell':
      cell = cellOf(source);
      break;
    case 'buffCarrierCell':
      cell = cellOf(carrier);
      break;
    case 'parentTargetedCell':
      // case ciblée du sort qui porte l'effet (ou, pour un effet porté par un buff, du sort qui a posé le buff)
      cell = app.fromBuff && app.cctx.parentTargetedCell >= 0 ? app.cctx.parentTargetedCell : app.targetedCell;
      break;
    case 'targetedCell':
      cell = app.targetedCell;
      break;
  }
  if (!subCaster.alive && !app.cctx.allowDeadCaster) return;
  const spell = state.ctx.getSpell(levelId);
  // 2960 (« sur une case ») avec une zone liste explicite ';' : le sous-sort est lancé sur chaque case de la liste
  // (arrivée de la Mama : 30609 niv. 3 → [300]) ; sinon sur la case ciblée
  if (ex.cell === 'targetedCell' && target === null && app.effect.zone.shape === ';' && app.effect.zone.cellIds.length) {
    for (const c of app.effect.zone.cellIds) {
      if (!isValidCell(c)) continue;
      if (ex.globalLimit && limit > 0 && app.execCount >= limit) return;
      castSubSpell(app, subCaster, spell, c);
    }
    return;
  }
  castSubSpell(app, subCaster, spell, cell);
};

function castSubSpell(app: EffectApplication, subCaster: Fighter, spell: ReturnType<FightState['ctx']['getSpell']>, cell: number): void {
  const state = app.state;
  if (!state.ctx.config.engine.subSpellsIgnoreCastConditions && subCaster.cell >= 0) {
    if (!checkCell(state, subCaster, spell, cell).ok) return;
  }
  app.execCount++;
  resolveSpell(state, subCaster, spell, cell, {
    depth: app.cctx.depth + 1,
    critical: app.critical,
    rootSpellId: app.cctx.rootSpellId || app.spell.spellId,
    originBuffUid: app.cctx.originBuffUid,
    triggerSourceId: app.cctx.triggerSourceId,
    buffCarrierId: app.cctx.buffCarrierId,
    parentTargetedCell: app.targetedCell,
    triggerDamage: app.cctx.triggerDamage,
    fromMark: app.cctx.fromMark,
    allowDeadCaster: app.cctx.allowDeadCaster,
    rootCastId: app.cctx.rootCastId || app.castId,
    markUid: app.cctx.markUid,
  });
};

/** Case d'un combattant (case de sa mort s'il est mort). */
function cellOf(f: Fighter): number {
  return f.alive ? f.cell : f.deathCell;
}

/** 3405 : apprend un sort temporaire (``value`` = niveau ; 80750 absent → ``spells.jaillissementUpgradeBroken``). */
export const learnSpellHandler: EffectHandlerFn = (app, target) => {
  if (!target) return;
  const state = app.state;
  const ref = app.effect.data.subSpell;
  let levelId = ref?.spellLevelId ?? app.effect.data.value;
  if (ref?.missing || !state.ctx.hasSpell(levelId)) {
    if (state.ctx.config.spells.jaillissementUpgradeBroken || !ref?.substituteSpellLevelId) return;
    levelId = ref.substituteSpellLevelId;
  }
  obtainSpell(state, target, levelId);
};

/** Ajoute un niveau de sort au grimoire (sans doublon). */
export function learnSpell(state: EffectApplication['state'], f: Fighter, spellLevelId: number): void {
  if (f.knowsSpell(spellLevelId)) return;
  const base = makeSpellSlot(state.ctx, f, spellLevelId, state.turn);
  const slot = state.turnStage === 'active' && state.currentFighterId === f.id ? { ...base, learnedDuring: f.turnCount } : base;
  const spells = [...f.spells, slot];
  spells.sort((a, b) => (a.slot < 0 ? 99 : a.slot) - (b.slot < 0 ? 99 : b.slot));
  f.spells = spells;
  if (state.logging) state.emit({ type: 'spellLearned', fighterId: f.id, spellLevelId });
}

/**
 * Obtention d'un sort (3405, ou scénario) : apprentissage puis effet d'obtention des données
 * (``archetypes[…].onObtain``) — Relâchement de Fureur : le lanceur pose sur lui 30624 niv. 1 (1160 'TB' → +25 de
 * base au sort). Logique serveur (Q17) : le buff est permanent et limité à ``spells.relachementMaxStacks``
 * déclenchements ; ``spells.relachementGrowthStart`` = immediate déclenche le premier aussitôt.
 */
export function obtainSpell(state: FightState, f: Fighter, spellLevelId: number): void {
  const known = f.knowsSpell(spellLevelId);
  learnSpell(state, f, spellLevelId);
  if (known) return;
  const ob = f.archetypeData?.onObtain?.[String(spellLevelId)];
  if (!ob || !state.ctx.hasSpell(ob.castSpellLevel) || !f.alive) return;
  const r = resolveSpell(state, f, state.ctx.getSpell(ob.castSpellLevel), f.cell, { depth: 1 });
  if (!r.resolved) return;
  const cfg = state.ctx.config.spells;
  for (const b of f.buffs.slice()) {
    if (b.castId !== r.castId || b.kind !== 'triggered') continue;
    b.duration = -1;
    b.triggersLeft = cfg.relachementMaxStacks;
    if (cfg.relachementGrowthStart === 'immediate' && f.buffs.includes(b)) {
      fireBuff(state, f, b, { token: 'TB', chain: EMPTY_CHAIN, triggerSourceId: f.id });
    }
  }
}

/** Retire un niveau de sort du grimoire. */
export function forgetSpell(state: EffectApplication['state'], f: Fighter, spellLevelId: number): void {
  if (!f.knowsSpell(spellLevelId)) return;
  f.spells = f.spells.filter((s) => s.spellLevelId !== spellLevelId);
  if (state.logging) state.emit({ type: 'spellForgotten', fighterId: f.id, spellLevelId });
}

/** 3406 : oublie un sort temporaire. */
export const forgetSpellHandler: EffectHandlerFn = (app, target) => {
  if (!target) return;
  const ref = app.effect.data.subSpell;
  forgetSpell(app.state, target, ref?.spellLevelId ?? app.effect.data.value);
};

function pushChoice(app: EffectApplication, scope: 'individual' | 'global', fighterId: number): void {
  const state = app.state;
  const rootCastId = app.cctx.rootCastId || app.castId;
  const listId = app.effect.data.value;
  // un même lancer racine (ex. cadeau : chaque joueur lance le niveau 3, qui vise tous les alliés) ne propose
  // qu'une fois la même liste au même joueur
  for (const c of state.pendingChoices) {
    if (c.rootCastId === rootCastId && c.choiceListId === listId && c.fighterId === fighterId && c.scope === scope) return;
  }
  const choice = {
    uid: state.newUid(),
    scope,
    choiceListId: listId,
    fighterId,
    casterId: app.caster.id,
    spellLevelId: app.spell.id,
    castId: app.castId,
    turn: state.turn,
    rootCastId,
  };
  state.pendingChoices.push(choice);
  if (state.logging) state.emit({ type: 'choice', choiceUid: choice.uid, scope, choiceListId: choice.choiceListId, fighterId });
}

/** 3008 : choix proposé à la cible (résolu par l'appelant). */
export const individualChoiceHandler: EffectHandlerFn = (app, target) => {
  if (!target || !target.alive) return;
  pushChoice(app, 'individual', target.id);
};

/** 3404 : choix d'équipe (vote). */
export const globalChoiceHandler: EffectHandlerFn = (app) => {
  pushChoice(app, 'global', -1);
};

/**
 * 181 : invoque le monstre ``summon.monsterId`` sur la case ciblée (libre) ; l'invocation rejoint l'équipe et le camp
 * du lanceur, est insérée dans la timeline juste après son invocateur (et ses invocations précédentes) et lance
 * aussitôt son sort de départ (passif). Poutch (7985 / 7986) : durée de vie ``spells.poutchLifetimeTurns`` (tours
 * de l'invocateur ; null = illimitée).
 */
export const summonHandler: EffectHandlerFn = (app) => {
  const state = app.state;
  const d = app.effect.data;
  const monsterId = d.summon?.monsterId ?? d.min;
  const cell = app.targetedCell;
  if (!state.ctx.data.monsters[String(monsterId)]) return;
  if (!isValidCell(cell) || !state.freePredicate()(cell)) return;
  const f = addFighter(
    state,
    { kind: 'monster', monsterId, team: app.caster.team, summonerId: app.caster.id },
    cell,
    'summon',
  );
  insertSummonInTimeline(state, f);
  const life = state.ctx.config.spells.poutchLifetimeTurns;
  if (life !== null && POUTCH_MONSTER_IDS.includes(monsterId)) f.lifetimeLeft = life;
  if (f.startingSpellLevelId && state.ctx.hasSpell(f.startingSpellLevelId)) {
    resolveSpell(state, f, state.ctx.getSpell(f.startingSpellLevelId), f.cell, {
      depth: app.cctx.depth + 1,
      rootSpellId: app.cctx.rootSpellId || app.spell.spellId,
      originBuffUid: app.cctx.originBuffUid,
    });
  }
  // une invocation posée sur une marque (aura, cadeau) y entre
  if (f.alive && state.marks.length) marksOnEnter(state, f, f.cell, -1, { kind: 'place', sourceId: app.caster.id, castId: app.castId, final: true });
};

const MARK_TYPES: Record<string, MarkType> = {
  glyphTurnStart: 'glyphTurnStart',
  glyphTurnEnd: 'glyphTurnEnd',
  glyphAura: 'aura',
  glyphImmediate: 'glyphImmediate',
};

/** 401 / 402 / 1091 / 1165 : pose une marque sur les cases de la zone (une fois par effet). */
export const markHandler: EffectHandlerFn = (app) => {
  const state = app.state;
  const e = app.effect;
  const zone = e.zone;
  const raw = zone.shape === ';' ? zone.cellIds : app.targetedCell >= 0 ? zone.cells(app.targetedCell, app.casterCellBefore) : [];
  const mask = new Uint8Array(CELL_COUNT);
  const cells: number[] = [];
  for (const c of raw) {
    if (c >= 0 && c < CELL_COUNT && !mask[c] && state.ctx.grid.isWalkable(c)) {
      mask[c] = 1;
      cells.push(c);
    }
  }
  const m = new Mark();
  m.uid = state.newUid();
  m.type = MARK_TYPES[e.handler] ?? 'aura';
  m.effectId = e.effectId;
  m.casterId = app.caster.id;
  m.spellId = e.data.subSpell?.spellId ?? e.data.min;
  m.spellLevelId = e.data.subSpell?.spellLevelId ?? 0;
  m.sourceSpellId = app.spell.spellId;
  m.sourceSpellLevelId = app.spell.id;
  m.castId = app.castId;
  m.centerCell = app.targetedCell;
  m.cells = cells;
  m.cellMask = mask;
  m.duration = e.data.duration;
  m.color = e.data.value;
  m.critical = app.critical;
  m.mask = e.mask;
  m.turnAdded = state.turn;
  m.beforeCasterFirstTurn = app.caster.turnCount === 0;
  state.marks.push(m);
  if (state.logging) {
    state.emit({ type: 'markAdded', markUid: m.uid, casterId: m.casterId, effectId: m.effectId, spellLevelId: m.spellLevelId, cellCount: cells.length });
  }
  // aura posée sur des combattants : ils y « entrent » (effets d'entrée)
  if (m.type === 'aura') {
    for (const f of state.fighters) {
      if (f.alive && f.cell >= 0 && mask[f.cell]) {
        marksOnEnter(state, f, f.cell, -1, { kind: 'place', sourceId: app.caster.id, castId: app.castId, final: true });
      }
    }
  }
};

/**
 * 2018 : dissipe les marques posées par la cible (sort ``min`` ; 0 = toutes). Exécuté par le sort d'une marque (cadeau
 * ramassé : chaque joueur exécute le niveau 3, donc 2018, une fois) avec ``engine.dispelGlyphsTriggeringMarkOnly`` :
 * seule cette marque est dissipée (les autres cadeaux restent).
 */
export const dispelGlyphsHandler: EffectHandlerFn = (app, target) => {
  if (!target) return;
  const state = app.state;
  const spellId = app.effect.data.subSpell?.spellId ?? app.effect.data.min;
  const onlyUid = state.ctx.config.engine.dispelGlyphsTriggeringMarkOnly ? app.cctx.markUid : 0;
  const hits: Mark[] = [];
  for (const m of state.marks) {
    if (m.casterId === target.id && (spellId === 0 || m.spellId === spellId || m.sourceSpellId === spellId)) hits.push(m);
  }
  for (const m of onlyUid ? hits.filter((x) => x.uid === onlyUid) : hits) removeMark(state, m, 'dissipée');
};

export const noopHandler: EffectHandlerFn = () => {};
