/**
 * Fenêtres de choix (ETUDE §2.7, §4.5, §7.1, §8 ; SPEC §11.4) : le moteur crée les choix à partir des DONNÉES (3008
 * individuel, 3404 vote — dédupliqués par lancer racine) ; le scénario en remplit les options (contenu serveur, tiré
 * selon la configuration) puis applique la réponse.
 *
 * - liste 17 (Acclamation, 30658 lancé par l'entité de scénario au début de T2–T9) : ``bonuses.offerCount`` cartes
 *   distinctes parmi les 6 de l'archétype (``bonuses.draw``) ; application : la carte lance l'accumulateur (bonus
 *   permanent) ; ``bonuses.doubleApplication`` : l'accumulateur est lancé une seconde fois ;
 * - liste 10 (cadeau, 30657 niv. 3) : ``gifts.cardCount`` cartes, composition tirée selon ``gifts.cardMix`` parmi les
 *   sorts uniques de l'archétype + Pense Vite non encore obtenus et les améliorations des sorts possédés non encore
 *   améliorés ; application : ``obtainSpell`` (unique, à usage unique) ou la carte « Amélioration : X » (3406 + 3405 :
 *   nouveau sort, relance remise à zéro) ;
 * - listes 11-15 (vote, 30443 niv. 2-6 déclenché par « Objectif N Fini ») : ``objectives.offerCount`` objectifs du
 *   palier suivant (``objectives.offerDraw``) ; pas de vote au-delà de ``objectives.maxCount`` objectifs ni pour le
 *   palier 6 si ``objectives.tier6Offered`` est faux ; réponse d'équipe ou votes individuels (majorité, égalité tirée
 *   au sort) ;
 * - liste 16 (archétype) : options des données (non utilisée par ``createGladiatroolFight``, qui applique
 *   directement l'archétype demandé).
 */
import type { ChoiceData, ObjectiveId } from '../data/index.js';
import { obtainSpell, resolveSpell, type Fighter, type FightState, type PendingChoice } from '../engine/index.js';
import { activateObjective, objectivesOfTier } from './objectives.js';
import { derivedRng, pickDistinct, RNG_TAG } from './random.js';
import { requireScenario, type ScenarioState } from './scenarioState.js';
import type { ChoiceAnswer, ChoiceOption, ChoiceResult, ScenarioChoice } from './types.js';

/** Libellés français des caractéristiques des Acclamations. */
const STAT_LABELS: Readonly<Record<string, string>> = {
  ap: 'PA',
  mp: 'PM',
  range: 'PO',
  resPct: '% de résistance',
  resPctMelee: '% de résistance mêlée',
  resPctRanged: '% de résistance distance',
  pushDamage: 'dommages de poussée',
  finalDamagePct: '% de dommages finaux',
  critDamage: 'dommages critiques',
  critPct: '% de critique',
  vitality: 'Vitalité',
  finalHealPct: '% de soins finaux',
};

/** Nature d'une liste de choix (données ``scenario.choices``), null si inconnue. */
export function choiceContent(state: FightState, listId: number): ChoiceData['content'] | null {
  return state.ctx.data.scenario.choices[String(listId)]?.content ?? null;
}

/** Options d'un choix (tableau vide si elles ne sont pas encore remplies). */
export function getChoiceOptions(choice: PendingChoice): readonly ChoiceOption[] {
  return (choice.options as readonly ChoiceOption[] | undefined) ?? [];
}

// ---------------------------------------------------------------------------------------------
// Tirage des options
// ---------------------------------------------------------------------------------------------

function drawAcclamations(state: FightState, sc: ScenarioState, f: Fighter): ChoiceOption[] {
  const a = f.archetypeData;
  if (!a) return [];
  const rng = derivedRng(sc.seed, RNG_TAG.acclamation, state.turn, sc.playerIndex(f.id) + 1);
  return pickDistinct(rng, a.acclamations, state.ctx.config.bonuses.offerCount).map((card) => ({
    kind: 'acclamation',
    cardSpellLevelId: card.choiceSpellLevelId,
    realSpellLevelId: card.realSpellLevel,
    stat: card.stat,
    value: card.value,
    label: `${card.name} (+${card.value} ${STAT_LABELS[card.stat] ?? card.stat})`,
  }));
}

/** Cartes d'un cadeau pour ``f`` (``gifts.cardCount``, ``gifts.cardMix``). */
function drawGiftCards(state: FightState, sc: ScenarioState, f: Fighter): ChoiceOption[] {
  const a = f.archetypeData;
  if (!a) return [];
  const ctx = state.ctx;
  const cfg = ctx.config.gifts;
  // k-ième tirage de cartes de ce joueur (flux indépendant du moment et des actions)
  const p = sc.playerIndex(f.id);
  const k = p >= 0 ? sc.giftDraws[p] ?? 0 : 0;
  if (p >= 0) sc.giftDraws[p] = k + 1;
  const rng = derivedRng(sc.seed, RNG_TAG.giftCards, k, p + 1);
  const uniques = a.uniques.filter((u) => ctx.hasSpell(u) && !f.knowsSpell(u) && !sc.hasObtainedUnique(f.id, u));
  const upgrades: ChoiceOption[] = [];
  for (const s of f.spells) {
    const up = a.upgrades[String(s.spellLevelId)];
    if (!up || s.upgraded || !ctx.hasSpell(up.choiceSpellLevelId)) continue;
    upgrades.push({
      kind: 'upgrade',
      baseSpellLevelId: s.spellLevelId,
      upgradedSpellLevelId: up.to,
      cardSpellLevelId: up.choiceSpellLevelId,
      label: ctx.spellName(up.choiceSpellLevelId),
    });
  }
  const n = cfg.cardCount;
  const mix = rng.weightedIndex([cfg.cardMix.twoUniques, cfg.cardMix.twoUpgrades, cfg.cardMix.oneEach]);
  let nu = mix === 0 ? n : mix === 1 ? 0 : Math.floor(n / 2);
  nu = Math.min(nu, uniques.length);
  const ng = Math.min(n - nu, upgrades.length);
  // pas assez de cartes d'un type : compléter avec l'autre
  nu = Math.min(uniques.length, n - ng);
  const out: ChoiceOption[] = pickDistinct(rng, uniques, nu).map((u) => ({ kind: 'unique', spellLevelId: u, label: ctx.spellName(u) }));
  out.push(...pickDistinct(rng, upgrades, ng));
  return out;
}

/** Objectifs proposés au vote de la liste ``listId`` (null : pas de vote). */
function drawVote(state: FightState, sc: ScenarioState, listId: number): ChoiceOption[] | null {
  const data = state.ctx.data;
  const cfg = state.ctx.config.objectives;
  const tier = data.scenario.choices[String(listId)]?.tier ?? listId - 9;
  if (sc.completed.length >= cfg.maxCount) return null;
  if (tier >= 6 && !cfg.tier6Offered) return null;
  const done = new Set<ObjectiveId>(sc.completed.map((x) => x.objectiveId));
  const pool = objectivesOfTier(data, tier).filter((o) => !done.has(o.id));
  if (!pool.length) return null;
  const rng = derivedRng(sc.seed, RNG_TAG.vote, tier, sc.completed.length);
  return pickDistinct(rng, pool, cfg.offerCount).map((o) => ({
    kind: 'objective',
    objectiveId: o.id,
    tier: o.tier,
    orientation: o.orientation,
    label: o.name,
  }));
}

function archetypeOptions(state: FightState): ChoiceOption[] {
  const opts = state.ctx.data.scenario.choices['16']?.options ?? [];
  return opts.map((o) => ({
    kind: 'archetype',
    archetype: o.archetype,
    passiveSpellLevelId: o.passiveSpellLevel,
    label: state.ctx.data.archetypes[o.archetype]?.displayName ?? o.archetype,
  }));
}

/**
 * Remplit les options des choix en attente qui n'en ont pas encore (remplacement de l'objet : les choix sont
 * partagés entre clones). Retire les choix sans objet (joueur mort, plus de vote, aucune carte disponible).
 */
export function fillPendingChoices(state: FightState): void {
  const sc = requireScenario(state);
  const list = state.pendingChoices;
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    const f = c.fighterId >= 0 ? state.fighters[c.fighterId] : undefined;
    const deadPlayer = c.scope === 'individual' && (!f || !f.alive);
    if (c.options !== undefined && !deadPlayer) continue;
    let options: ChoiceOption[] | null = null;
    if (!deadPlayer) {
      switch (choiceContent(state, c.choiceListId)) {
        case 'acclamation':
          options = drawAcclamations(state, sc, f!);
          break;
        case 'giftCards':
          options = drawGiftCards(state, sc, f!);
          break;
        case 'objectiveVote':
          options = drawVote(state, sc, c.choiceListId);
          break;
        case 'archetype':
          options = archetypeOptions(state);
          break;
        default:
          options = null;
      }
    }
    if (!options || options.length === 0) {
      list.splice(i, 1);
      i--;
      if (state.logging) {
        const why = deadPlayer ? 'joueur mort' : 'aucune option disponible';
        state.emit({ type: 'info', message: `Choix de la liste ${c.choiceListId} retiré (${why}).` });
      }
      continue;
    }
    list[i] = { ...c, options };
  }
}

// ---------------------------------------------------------------------------------------------
// Réponse
// ---------------------------------------------------------------------------------------------

/** Dépouillement d'un vote : option la plus votée ; égalité tirée au sort (flux dérivé du scénario). */
function tally(state: FightState, sc: ScenarioState, c: PendingChoice, votes: readonly number[], n: number): number {
  const counts = new Array<number>(n).fill(0);
  for (const v of votes) {
    if (!Number.isInteger(v) || v < 0 || v >= n) return -1;
    counts[v]! += 1;
  }
  const max = Math.max(...counts);
  if (max <= 0) return -1;
  const best = counts.map((x, i) => (x === max ? i : -1)).filter((i) => i >= 0);
  if (best.length === 1) return best[0]!;
  const rng = derivedRng(sc.seed, RNG_TAG.vote, 100 + c.choiceListId, sc.completed.length);
  return best[rng.int(0, best.length - 1)]!;
}

function applyOption(state: FightState, sc: ScenarioState, c: PendingChoice, opt: ChoiceOption): void {
  const f = c.fighterId >= 0 ? state.fighters[c.fighterId] : undefined;
  const ctx = state.ctx;
  switch (opt.kind) {
    case 'acclamation':
      if (!f || !f.alive) return;
      resolveSpell(state, f, ctx.getSpell(opt.cardSpellLevelId), f.cell, { depth: 1 });
      if (ctx.config.bonuses.doubleApplication && f.alive) {
        resolveSpell(state, f, ctx.getSpell(opt.realSpellLevelId), f.cell, { depth: 1 });
      }
      return;
    case 'unique':
      if (!f || !f.alive) return;
      sc.obtainedUniques.push(f.id, opt.spellLevelId);
      obtainSpell(state, f, opt.spellLevelId);
      return;
    case 'upgrade':
      if (!f || !f.alive || !f.knowsSpell(opt.baseSpellLevelId)) return;
      resolveSpell(state, f, ctx.getSpell(opt.cardSpellLevelId), f.cell, { depth: 1 });
      return;
    case 'objective':
      activateObjective(state, opt.objectiveId);
      return;
    case 'archetype':
      if (!f || !f.alive) return;
      resolveSpell(state, f, ctx.getSpell(opt.passiveSpellLevelId), f.cell, { depth: 1 });
      return;
  }
}

/**
 * Résout le choix ``choiceUid`` : ``answer`` = index de l'option, ou ``{ votes }`` pour un vote d'équipe. Le choix est
 * retiré puis l'option appliquée. N'avance pas le combat (voir ``GladiatroolFight.resolveChoice``).
 */
export function resolveChoice(state: FightState, choiceUid: number, answer: ChoiceAnswer): ChoiceResult {
  const sc = requireScenario(state);
  fillPendingChoices(state);
  const idx = state.pendingChoices.findIndex((c) => c.uid === choiceUid);
  if (idx < 0) return { ok: false, reason: `choix ${choiceUid} inconnu ou déjà résolu` };
  const c = state.pendingChoices[idx]!;
  const opts = getChoiceOptions(c);
  let k: number;
  if (typeof answer === 'number') k = answer;
  else {
    if (c.scope !== 'global') return { ok: false, reason: "des votes ne sont possibles que pour un choix d'équipe" };
    k = tally(state, sc, c, answer.votes, opts.length);
  }
  if (!Number.isInteger(k) || k < 0 || k >= opts.length) {
    return { ok: false, reason: `réponse invalide (option attendue entre 0 et ${opts.length - 1})` };
  }
  const opt = opts[k]!;
  state.pendingChoices.splice(idx, 1);
  if (state.logging) {
    state.emit({ type: 'choiceResolved', choiceUid: c.uid, choiceListId: c.choiceListId, fighterId: c.fighterId, label: opt.label });
  }
  applyOption(state, sc, c, opt);
  return { ok: true, option: opt };
}

/** Choix en attente (options remplies) ; le premier est ``state.pendingChoice``. */
export function pendingChoicesOf(state: FightState): ScenarioChoice[] {
  return state.pendingChoices.filter((c) => c.options !== undefined) as ScenarioChoice[];
}
