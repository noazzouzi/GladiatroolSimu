/**
 * Niveaux de sort « compilés » pour le moteur : zones construites une fois (``SpellZone``), gestionnaire et bornes de
 * jet de chaque effet, spécification de lancer pour la géométrie, effets non exécutés (forClientOnly) écartés.
 *
 * Les exceptions de données paramétrées par la configuration (SPEC §12, Q26-Q32) sont appliquées ICI, de façon
 * déclarative et documentée ; aucun autre sort n'est codé en dur :
 * - ``spells.voltigeUpgradedMaxPerTurn`` : lancers par tour de Voltige améliorée (sort 30570) ;
 * - ``spells.impactCritHitsPoutch`` : le masque ``A,J`` de l'Impact critique (sort 30395) touche aussi les
 *   invocations alliées (``j``) ;
 * - ``spells.ggUpgradedKeepsRecastBonus`` : l'effet 406 de Grondement Grandissant amélioré (30560) qui retire son
 *   propre bonus de relance est neutralisé ;
 * - ``spells.coupDeSangCreatesErosion`` : l'effet 1048 (malus de PV) crée de l'érosion ;
 * - ``spells.delivranceWorks`` : l'effet 132 (désenvoûtement) est neutralisé s'il vaut false ;
 * - pics (sort 30390) : ``spikes.entryDamage`` (niv. 2), ``spikes.playerTurnStartDamage`` /
 *   ``spikes.monsterTurnStartDamageRaw`` (niv. 3, camp Atq / Def), ``spikes.playersDoubledInside`` (le 1163 d'aura
 *   vise aussi le camp Atq) ; sortie (30701) : ``spikes.exitVulnerabilityTurns`` (durées) — valeurs par défaut =
 *   données, les exceptions ne changent rien tant que la configuration n'est pas modifiée ;
 * - ``boss.catastroollBonusScope`` : 1171 de durée 0 de Catastrooll (30394) : reste du tour (données), jusqu'au
 *   prochain lancer, ou neutralisé ; ``boss.rassemblementPullThenPush`` : ordre attirance / poussée de 30432 niv. 4 ;
 * - ``gifts.monstersTrigger`` : le glyphe du cadeau (1165 de 30566) se déclenche aussi pour le camp Def ;
 * - ``spells.maledictionCollateraleHitsCarrier`` (renvoi 1223 de 30670 : ``a`` → ``g``),
 *   ``spells.maledictionRegenerantePercent`` / ``maledictionRegeneranteZone`` (2020 de 30675),
 *   ``spells.pulsationChaotiqueBounceRange`` (zone du rebond 2792 de 30667 niv. 2).
 * (``spells.jaillissementUpgradeBroken`` est lu par le gestionnaire 3405 ; les autres paramètres « spells.* » par
 * cast.ts, triggerProcessing.ts et les gestionnaires, voir docs/ARCHITECTURE.md.)
 */
import type {
  CastData,
  EffectCatalogEntry,
  EffectData,
  EffectHandler,
  GameData,
  MaskData,
  SimConfig,
  SpellLevelData,
} from '../data/index.js';
import { rollBounds } from '../data/index.js';
import { castSpecFromCastData, SpellZone, type CastRangeSpec } from '../geometry/index.js';
import { ELEMENT_INDEX } from './stats.js';
import { parseTriggers, type ParsedTriggers } from './triggerTokens.js';

/** Identifiants de sorts visés par les exceptions de configuration. */
export const SPELL_IDS = {
  voltigeUpgraded: 30570,
  impact: 30395,
  grondementUpgraded: 30560,
  /** Glyphe de combat (pics) : niv. 1 pose, niv. 2 entrée (aura), niv. 3 début de tour. */
  spikes: 30390,
  /** Vulnérabilité de sortie des pics (lancé par le passif 30700). */
  spikesExit: 30701,
  catastrooll: 30394,
  /** Glyphe Événementiel (cadeau). */
  gift: 30566,
  rassemblement: 30432,
  /** Arrivée de la Mama (niv. 4 : téléportation) : ``boss.arrivalCell`` / ``boss.arrivalFallback``. */
  mamaArrival: 30609,
  maledictionMouvante: 30617,
  maledictionCollaterale: 30613,
  maledictionCollateraleSplash: 30670,
  maledictionRegeneranteHeal: 30675,
  pulsationChaotiqueBounce: 30667,
  protectionProlongee: 30414,
  protectionProlongeeUpgraded: 30584,
} as const;

/** Monstres « Poutch » (Stratège Dompteur) de Soutien Stratégique : ``spells.poutchLifetimeTurns``. */
export const POUTCH_MONSTER_IDS: readonly number[] = [7985, 7986];

/** Gestionnaires dont les déclencheurs sont des FILTRES (1163) et non des événements déclencheurs. */
const FILTER_TRIGGER_HANDLERS: ReadonlySet<string> = new Set(['receivedDamageMultiplier']);

/** Gestionnaires de poussée pour l'ordre des cibles (``ActionIdHelper.isPush`` : 5, 1021, 1041, 1103). */
const PUSH_HANDLERS: ReadonlySet<string> = new Set(['push', 'pushNoDamage']);

export interface CompiledEffect {
  readonly data: EffectData;
  /** Position dans la liste (effets ou effets critiques). */
  readonly index: number;
  readonly effectId: number;
  readonly handler: EffectHandler | 'unknown';
  readonly catalog: EffectCatalogEntry | null;
  readonly zone: SpellZone;
  readonly mask: MaskData;
  /** Ordre des cibles « poussée » (la plus éloignée d'abord). */
  readonly isPush: boolean;
  /** Application immédiate : déclencheur 'I' présent (ou déclencheurs filtres d'un 1163 : buff posé à la pose). */
  readonly immediate: boolean;
  /** Déclencheurs événementiels (hors 'I'), vide si aucun ou si ce sont des filtres (1163). */
  readonly eventTriggers: readonly string[];
  readonly lo: number;
  readonly hi: number;
  /** Élément des données (repli si l'action n'est pas dans la table du client), −1 sinon. */
  readonly element: number;
  /** Appartient à la liste critique. */
  readonly critical: boolean;
  /** Neutralisé par une exception de configuration. */
  readonly disabled: boolean;
  /** 1048 : crée de l'érosion (``spells.coupDeSangCreatesErosion``). */
  readonly erosion: boolean;
  /** Jetons de déclenchement analysés (hors 'I' ; vide pour les filtres d'un 1163). */
  readonly triggerInfo: ParsedTriggers;
  /** Le buff posé est retiré après le prochain lancer de son lanceur (``boss.catastroollBonusScope``). */
  readonly untilNextCast: boolean;
}

export interface CompiledSpellLevel {
  readonly id: number;
  readonly spellId: number;
  readonly grade: number;
  readonly name: string;
  readonly data: SpellLevelData;
  /** Conditions de lancer (après exceptions de configuration). */
  readonly cast: CastData;
  readonly castSpec: CastRangeSpec;
  /** Effets exécutés (exec), dans l'ordre. */
  readonly effects: readonly CompiledEffect[];
  /** Effets critiques exécutés. */
  readonly critEffects: readonly CompiledEffect[];
  /** La liste critique des données n'est pas vide (elle remplace alors la liste normale). */
  readonly hasCritList: boolean;
}

function compileEffect(
  e: EffectData,
  index: number,
  critical: boolean,
  lvl: SpellLevelData,
  data: GameData,
  config: SimConfig,
): CompiledEffect {
  const catalog = data.effects[String(e.effectId)] ?? null;
  const handler: EffectHandler | 'unknown' = catalog ? catalog.handler : 'unknown';
  let mask = e.mask;
  let disabled = false;
  let [lo, hi] = rollBounds(e);
  let zoneData = e.zone;
  let untilNextCast = false;
  const sid = lvl.spellId;
  // --- pics (30390) et sortie (30701) : paramètres spikes.* (défauts = données)
  if (sid === SPELL_IDS.spikes && e.effectId === 100) {
    if (lvl.grade === 2) lo = hi = config.spikes.entryDamage;
    else if (lvl.grade === 3) {
      lo = hi = mask.camp === 'Atq' ? config.spikes.playerTurnStartDamage : config.spikes.monsterTurnStartDamageRaw;
    }
  }
  if (sid === SPELL_IDS.spikes && lvl.grade === 2 && e.effectId === 1163 && config.spikes.playersDoubledInside) {
    mask = { ...mask, camp: null };
  }
  if (sid === SPELL_IDS.spikesExit && e.duration !== config.spikes.exitVulnerabilityTurns) {
    const n = config.spikes.exitVulnerabilityTurns;
    e = { ...e, duration: n, triggerDuration: e.triggerDuration > 0 ? n : 0 };
  }
  // --- Catastrooll : 1171 de durée 0
  if (sid === SPELL_IDS.catastrooll && e.effectId === 1171) {
    if (config.boss.catastroollBonusScope === 'none') disabled = true;
    else if (config.boss.catastroollBonusScope === 'nextCastOnly') untilNextCast = true;
  }
  // --- cadeau : glyphe déclenché aussi par les monstres
  if (sid === SPELL_IDS.gift && e.effectId === 1165 && config.gifts.monstersTrigger) mask = { ...mask, camp: null };
  // --- malédictions et rebonds des sorts uniques
  if (sid === SPELL_IDS.maledictionCollateraleSplash && e.effectId === 1223 && !config.spells.maledictionCollateraleHitsCarrier) {
    mask = { ...mask, include: mask.include.map((l) => (l === 'a' ? 'g' : l)) };
  }
  if (sid === SPELL_IDS.maledictionRegeneranteHeal && e.effectId === 2020) {
    lo = hi = config.spells.maledictionRegenerantePercent;
    if (config.spells.maledictionRegeneranteZone === 'all') zoneData = { ...zoneData, shape: 'a', radius: 1, minRadius: 0 };
  }
  if (
    sid === SPELL_IDS.pulsationChaotiqueBounce &&
    lvl.grade === 2 &&
    e.effectId === 2792 &&
    config.spells.pulsationChaotiqueBounceRange !== null
  ) {
    zoneData = { ...zoneData, shape: 'C', radius: config.spells.pulsationChaotiqueBounceRange, minRadius: 0 };
  }
  if (critical && lvl.spellId === SPELL_IDS.impact && config.spells.impactCritHitsPoutch && mask.include.includes('J')) {
    mask = { ...mask, include: [...mask.include, 'j'] };
  }
  if (
    lvl.spellId === SPELL_IDS.grondementUpgraded &&
    e.effectId === 406 &&
    e.value === SPELL_IDS.grondementUpgraded &&
    config.spells.ggUpgradedKeepsRecastBonus
  ) {
    disabled = true;
  }
  if (e.effectId === 132 && !config.spells.delivranceWorks) disabled = true;
  const nonI = e.triggers.filter((t) => t !== 'I');
  const eventTriggers = FILTER_TRIGGER_HANDLERS.has(handler) ? [] : nonI;
  return {
    data: e,
    index,
    effectId: e.effectId,
    handler,
    catalog,
    zone: SpellZone.fromZoneData(zoneData),
    mask,
    isPush: PUSH_HANDLERS.has(handler),
    immediate: FILTER_TRIGGER_HANDLERS.has(handler) || e.triggers.includes('I') || e.triggers.length === 0,
    eventTriggers,
    lo,
    hi,
    element: e.element ? ELEMENT_INDEX[e.element] : -1,
    critical,
    disabled,
    erosion: e.effectId !== 1048 || config.spells.coupDeSangCreatesErosion,
    triggerInfo: parseTriggers(eventTriggers),
    untilNextCast,
  };
}

/** Compile un niveau de sort (données + exceptions de configuration). */
export function compileSpellLevel(lvl: SpellLevelData, data: GameData, config: SimConfig): CompiledSpellLevel {
  let cast = lvl.cast;
  if (lvl.spellId === SPELL_IDS.voltigeUpgraded && cast.maxPerTurn !== config.spells.voltigeUpgradedMaxPerTurn) {
    cast = { ...cast, maxPerTurn: config.spells.voltigeUpgradedMaxPerTurn };
  }
  const effects: CompiledEffect[] = [];
  lvl.effects.forEach((e, i) => {
    if (e.exec) effects.push(compileEffect(e, i, false, lvl, data, config));
  });
  const critEffects: CompiledEffect[] = [];
  lvl.critEffects.forEach((e, i) => {
    if (e.exec) critEffects.push(compileEffect(e, i, true, lvl, data, config));
  });
  if (lvl.spellId === SPELL_IDS.rassemblement && !config.boss.rassemblementPullThenPush) {
    // repousser les joueurs (1103) avant d'attirer les Troolls (6)
    for (const list of [effects, critEffects]) {
      const iPull = list.findIndex((x) => x.effectId === 6);
      const iPush = list.findIndex((x) => x.effectId === 1103);
      if (iPull >= 0 && iPush > iPull) list.splice(iPull, 0, list.splice(iPush, 1)[0]!);
    }
  }
  return {
    id: lvl.spellLevelId,
    spellId: lvl.spellId,
    grade: lvl.grade,
    name: lvl.name,
    data: lvl,
    cast,
    castSpec: castSpecFromCastData(cast),
    effects,
    critEffects,
    hasCritList: lvl.critEffects.length > 0,
  };
}
