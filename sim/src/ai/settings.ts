/**
 * Réglages effectifs de l'IA pour un monstre : paramètres communs ``ai.*`` de la configuration, surchargés par le
 * profil du monstre (``ai.profiles.<profil>`` : ``moveBeforeCast``, ``preferredDistance``, ``healThresholdPct``,
 * ``spells`` et, facultativement, ``focus``, ``skipIfInSpikes``, ``skipIfNoTargetReachable``, ``engageRadius``,
 * ``avoidSpikes``). Le profil vient des données du monstre (``monsters[id].aiProfile``).
 *
 * Monstre sans profil (ou profil absent de la configuration) : profil générique « tous ses sorts, sur n'importe quelle
 * cible », distance préférée [1, PO maximale], réglages communs.
 */
import type { AiFocus, AiProfileName, AiRuleWhen, AiSequenceMode, SimConfig } from '../data/index.js';
import type { EngineContext, Fighter } from '../engine/index.js';

/** Règle de profil résolue (sort présent dans le grimoire du monstre). */
export interface ResolvedRule {
  readonly spellLevelId: number;
  readonly when: AiRuleWhen;
  /** Nombre maximal de lancers pour cette règle (``times`` ; ``maxTargets`` pour un sort monocible). */
  readonly times: number;
  /** ``count`` (règle playersInZoneAtLeast). */
  readonly count: number;
  /** ``maxTargets`` brut (null si absent). */
  readonly maxTargets: number | null;
}

/** Poids de la fonction d'utilité (PV équivalents). */
export interface AiWeights {
  readonly nonFocus: number;
  readonly kill: number;
  readonly spikePush: number;
  readonly heal: number;
  readonly summonTarget: number;
  readonly unshakable: number;
  readonly position: number;
  readonly threatenedAllyDistance: number;
}

export interface AiSettings {
  /** Profil (null : profil générique). */
  readonly profile: AiProfileName | null;
  readonly rules: readonly ResolvedRule[];
  readonly sequenceMode: AiSequenceMode;
  readonly moveBeforeCast: boolean;
  readonly preferredDistance: readonly [number, number];
  /** Seuil de soin (% de PV) de la règle mostInjuredAlly. */
  readonly healThresholdPct: number;
  readonly focus: AiFocus;
  readonly skipIfInSpikes: boolean;
  readonly skipIfNoTargetReachable: boolean;
  readonly engageRadius: number | null;
  readonly avoidSpikes: boolean;
  readonly monstersCanTargetAllies: boolean;
  /** La Mama concentre ses sorts sur un joueur (``ai.mamaFocusSingleTarget``). */
  readonly focusSingleTarget: boolean;
  readonly weights: AiWeights;
}

const settingsCache = new WeakMap<EngineContext, Map<string, AiSettings>>();

function weightsOf(cfg: SimConfig): AiWeights {
  const ai = cfg.ai;
  return {
    nonFocus: ai.nonFocusWeight,
    kill: ai.killBonus,
    spikePush: ai.spikePushWeight,
    heal: ai.healWeight,
    summonTarget: ai.summonTargetWeight,
    unshakable: ai.unshakableValue,
    position: ai.positionWeight,
    threatenedAllyDistance: ai.threatenedAllyDistance,
  };
}

/** Réglages de l'IA pour le monstre ``f`` (en cache par contexte, profil et grimoire). */
export function aiSettingsFor(ctx: EngineContext, f: Fighter): AiSettings {
  let byKey = settingsCache.get(ctx);
  if (!byKey) {
    byKey = new Map();
    settingsCache.set(ctx, byKey);
  }
  const key = `${f.monster?.aiProfile ?? '-'}|${f.monsterId === ctx.data.boss.monsterId ? 'boss' : ''}|${f.spells.map((s) => s.spellLevelId).join(',')}`;
  let s = byKey.get(key);
  if (!s) {
    s = resolveSettings(ctx, f);
    byKey.set(key, s);
  }
  return s;
}

function resolveSettings(ctx: EngineContext, f: Fighter): AiSettings {
  const cfg = ctx.config;
  const ai = cfg.ai;
  const known = new Set(f.spells.map((s) => s.spellLevelId));
  const name = (f.monster?.aiProfile ?? null) as AiProfileName | null;
  const prof = name ? ai.profiles[name] : undefined;
  let rules: ResolvedRule[];
  if (prof) {
    rules = prof.spells
      .filter((r) => known.has(r.spellLevelId))
      .map((r) => {
        const single = isSingleTarget(ctx, r.spellLevelId);
        const times = r.times ?? (r.maxTargets != null && single ? r.maxTargets : Infinity);
        return { spellLevelId: r.spellLevelId, when: r.when, times, count: r.count ?? 1, maxTargets: r.maxTargets ?? null };
      });
  } else {
    rules = f.spells.map((s) => ({ spellLevelId: s.spellLevelId, when: 'anyTarget' as const, times: Infinity, count: 1, maxTargets: null }));
  }
  let maxRange = 1;
  for (const s of f.spells) if (ctx.hasSpell(s.spellLevelId)) maxRange = Math.max(maxRange, ctx.getSpell(s.spellLevelId).cast.range[1] ?? 1);
  const isBoss = f.monsterId === ctx.data.boss.monsterId;
  return {
    profile: prof ? name : null,
    rules,
    sequenceMode: ai.sequenceMode,
    moveBeforeCast: prof ? prof.moveBeforeCast : ai.moveBeforeCast,
    preferredDistance: prof ? [prof.preferredDistance[0], prof.preferredDistance[1]] : [1, maxRange],
    healThresholdPct: prof?.healThresholdPct ?? 100,
    focus: prof?.focus ?? ai.focus,
    skipIfInSpikes: prof?.skipIfInSpikes ?? ai.skipIfInSpikes,
    skipIfNoTargetReachable: prof?.skipIfNoTargetReachable ?? ai.skipIfNoTargetReachable,
    engageRadius: prof && prof.engageRadius !== undefined ? prof.engageRadius : ai.engageRadius,
    avoidSpikes: prof?.avoidSpikes ?? ai.avoidSpikes,
    monstersCanTargetAllies: ai.monstersCanTargetAllies,
    focusSingleTarget: isBoss && ai.mamaFocusSingleTarget,
    weights: weightsOf(cfg),
  };
}

/** Sort dont tous les effets touchent une seule case (zone P). */
function isSingleTarget(ctx: EngineContext, spellLevelId: number): boolean {
  if (!ctx.hasSpell(spellLevelId)) return true;
  return ctx.getSpell(spellLevelId).effects.every((e) => e.zone.radius < 1);
}
