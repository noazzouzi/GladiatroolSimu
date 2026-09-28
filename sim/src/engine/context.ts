/**
 * Contexte moteur partagé (immuable pendant un combat, jamais cloné) : données, configuration, carte, niveaux de sort
 * compilés (cache), masques d'effets d'état, crochets d'extension et registre des gestionnaires d'effets.
 *
 * Tous les ``FightState`` issus d'un même combat (et leurs clones) référencent le même contexte. Les étapes
 * suivantes (tours, déclencheurs, glyphes, scénario) s'y branchent :
 * - ``hooks`` : points d'extension (observateurs) appelés par le moteur (arrivée / départ d'une case, déclencheurs,
 *   ajout d'un combattant, tours) — le comportement propre du moteur (auras, buffs déclenchés) est intégré et
 *   s'exécute AVANT le crochet ;
 * - ``handlers`` : un gestionnaire par nom (``EffectHandler`` du catalogue ``effects``), remplaçable ou complétable.
 */
import type { ConfigOverrides, GameData, SimConfig } from '../data/index.js';
import { gameData as defaultGameData, loadConfig } from '../data/index.js';
import { MapGrid } from '../geometry/index.js';
import type { FightEvent, MoveKind } from './events.js';
import type { Fighter } from './fighter.js';
import { compileSpellLevel, type CompiledSpellLevel } from './spells.js';
import type { FightState } from './state.js';
import type { TriggerEvent } from './triggers.js';
import type { EffectHandlerFn } from './effects/types.js';

/** Cause d'une arrivée sur / d'un départ d'une case. */
export interface CellMoveCause {
  kind: MoveKind;
  /** Auteur du déplacement (lanceur, ou le combattant lui-même pour la marche). */
  sourceId: number;
  /** Lancer en cours (0 hors sort). */
  castId: number;
  /** Case d'arrivée finale du déplacement (dernier pas d'une marche, arrivée d'une poussée). */
  final: boolean;
}

/** Points d'extension du noyau (tous optionnels). */
export interface EngineHooks {
  /** Après qu'un combattant a quitté ``cell`` (avant ``onEnterCell`` de la nouvelle case). */
  onLeaveCell?(state: FightState, fighter: Fighter, cell: number, cause: CellMoveCause): void;
  /**
   * Après l'arrivée d'un combattant sur ``cell`` (marche : à chaque pas ; poussée, attirance, téléportation, échange :
   * case d'arrivée seulement). Renvoyer ``true`` interrompt une marche.
   */
  onEnterCell?(state: FightState, fighter: Fighter, cell: number, from: number, cause: CellMoveCause): boolean | void;
  /** Événement de déclenchement (file vidée après chaque application effet × cible). */
  onTrigger?(state: FightState, ev: TriggerEvent): void;
  /** Un combattant rejoint le combat (apparition, invocation, résurrection). */
  onFighterAdded?(state: FightState, fighter: Fighter, cause: 'spawn' | 'summon' | 'resurrect'): void;
  /** Observateur des événements du journal (appelé même si le journal est désactivé). */
  onEvent?(state: FightState, ev: FightEvent): void;
  /** Début d'un tour global (``nextTurn`` / ``startGlobalTurn``, turns.ts) : vagues, cadeaux, choix du scénario. */
  onGlobalTurn?(state: FightState, turn: number): void;
  /**
   * Début du tour d'un combattant, après la procédure du moteur (décompte, TB, glyphes, PA/PM) et avant le test de
   * tour annulé (140) ; pas appelé si le combattant est mort pendant ce début de tour.
   */
  onTurnStart?(state: FightState, fighter: Fighter): void;
  /** Fin du tour d'un combattant, après la procédure du moteur (TE, glyphes 402, remises à zéro). */
  onTurnEnd?(state: FightState, fighter: Fighter): void;
}

export interface EngineContextOptions {
  data?: GameData;
  /** Configuration complète (sinon ``loadConfig(overrides)``). */
  config?: SimConfig;
  overrides?: ConfigOverrides;
  grid?: MapGrid;
  hooks?: EngineHooks;
}

export class EngineContext {
  readonly data: GameData;
  readonly config: SimConfig;
  readonly grid: MapGrid;
  /** Crochets d'extension (objet mutable : les étapes suivantes y ajoutent leurs fonctions). */
  readonly hooks: EngineHooks;
  /** Gestionnaires d'effets par nom de gestionnaire (catalogue ``effects``). */
  readonly handlers: Map<string, EffectHandlerFn>;
  private readonly spellCache = new Map<number, CompiledSpellLevel>();
  private readonly stateMasks = new Map<number, number>();
  /** Niveau amélioré → niveau de base (archétypes). */
  readonly upgradeBase = new Map<number, number>();

  constructor(opts: EngineContextOptions, handlers: Map<string, EffectHandlerFn>) {
    this.data = opts.data ?? defaultGameData;
    this.config = opts.config ?? loadConfig(opts.overrides ?? {});
    this.grid = opts.grid ?? MapGrid.fromMapData(this.data.map);
    this.hooks = { ...(opts.hooks ?? {}) };
    this.handlers = handlers;
    for (const [id, s] of Object.entries(this.data.states)) {
      let m = 0;
      for (const e of s.stateEffects) if (e >= 0 && e < 32) m |= 1 << e;
      this.stateMasks.set(Number(id), m);
    }
    for (const a of Object.values(this.data.archetypes)) {
      for (const [base, u] of Object.entries(a.upgrades)) this.upgradeBase.set(u.to, Number(base));
    }
  }

  /** Niveau de sort compilé (cache) ; lève une erreur s'il est inconnu. */
  getSpell(spellLevelId: number): CompiledSpellLevel {
    let s = this.spellCache.get(spellLevelId);
    if (!s) {
      const lvl = this.data.spells[String(spellLevelId)];
      if (!lvl) throw new Error(`Niveau de sort inconnu : ${spellLevelId}`);
      s = compileSpellLevel(lvl, this.data, this.config);
      this.spellCache.set(spellLevelId, s);
    }
    return s;
  }

  hasSpell(spellLevelId: number): boolean {
    return this.data.spells[String(spellLevelId)] !== undefined;
  }

  /** Masque des effets d'état (bit n = effet d'état n : 0 inébranlable, 3 enraciné, 7 invulnérable…). */
  stateEffectMask(stateId: number): number {
    return this.stateMasks.get(stateId) ?? 0;
  }

  stateName(stateId: number): string {
    return this.data.states[String(stateId)]?.name ?? `état ${stateId}`;
  }

  spellName(spellLevelId: number): string {
    return this.data.spells[String(spellLevelId)]?.name ?? `sort ${spellLevelId}`;
  }
}
