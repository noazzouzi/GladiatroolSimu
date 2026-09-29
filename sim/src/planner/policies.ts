/**
 * Politiques de choix du runner et de l'interface (fenêtres de choix du scénario) :
 *
 * - **Acclamations** (liste 17, ÉTUDE §4.5, §10.6) : ``bonuses.policy`` — ``planner`` = choix ÉVALUÉ (valeur
 *   marginale de la carte pour ce personnage : sac à dos PA → sorts du grimoire, % DF sur ses dégâts, PO, défense),
 *   ou ordre fixe ``PO_first`` / ``PA_first`` / ``DF_first`` ;
 * - **cartes de cadeau** (liste 10, ÉTUDE §8.3) : priorités des joueurs corrigées par la situation (Relâchement de
 *   Fureur tôt pour un Dompteur, Immortalités / Muraille / Pense Vite avant le T7-T8, Dégagez ! pour la fin, Ultime
 *   Espoir si un allié est mort, Démotivation tant que la Mama vit…) ;
 * - **votes d'objectifs** (listes 11-15, ÉTUDE §7.3) : ``objectives.votePolicy`` — ``planner`` = préférence × faisabilité
 *   estimée (objectif atteignable vite avec la composition et la situation), ``fixed`` = premier objectif proposé
 *   dans ``objectives.fixedVoteOrder`` ;
 * - **archétype** (liste 16) : l'archétype du personnage (mise en place).
 *
 * Tout est déterministe, sans API Node, sans modification de l'état (lecture seule) : utilisable dans le
 * planificateur (choix pendant les simulations), le runner et un Web Worker. Chaque option reçoit un score et une
 * raison en français (``scoreChoice``) pour le journal et l'interface.
 */
import type { BonusPolicy, ObjectiveId } from '../data/index.js';
import type { Fighter, FightState } from '../engine/index.js';
import { objectiveById, type ChoiceOption, type GladiatroolFight, type ScenarioChoice } from '../scenario/index.js';
import { ACCLAMATION_ORDER, GIFT_PREFERENCE, OBJECTIVE_PREFERENCE, type ChoicePolicy } from './choicePolicy.js';
import { damageMultiplier } from './evaluate.js';
import { spellProfile } from './spellInfo.js';

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

export type AcclamationPolicyName = BonusPolicy;
/** ``preference`` : préférence statique ÉTUDE §7.3 sans faisabilité. */
export type VotePolicyName = 'planner' | 'fixed' | 'preference';
/** ``preference`` : priorités ÉTUDE §8.3 sans correction par la situation. */
export type GiftPolicyName = 'planner' | 'preference';

export interface PolicyOptions {
  /** Acclamations (défaut : ``bonuses.policy`` de la configuration du combat). */
  acclamation?: AcclamationPolicyName;
  /** Votes (défaut : ``objectives.votePolicy``). */
  vote?: VotePolicyName;
  /** Ordre des votes ``fixed`` (défaut : ``objectives.fixedVoteOrder``). */
  fixedVoteOrder?: readonly ObjectiveId[];
  /** Cartes de cadeau (défaut : ``planner``). */
  gift?: GiftPolicyName;
  /** Surcharges des préférences d'objectifs (1-10, ÉTUDE §7.3). */
  objectivePreference?: Partial<Record<ObjectiveId, number>>;
  /** Surcharges des priorités de cartes (niveau de sort unique ou niveau de base amélioré → 0-100). */
  giftPreference?: Record<string, number>;
}

/** Option notée (plus haut = préférée) avec sa raison en français. */
export interface ScoredOption {
  index: number;
  label: string;
  score: number;
  reason: string;
}

const MONSTER = { troollibre: 7981, artroolleur: 7982, nitrooll: 7983, mama: 7984 } as const;

// ---------------------------------------------------------------------------------------------
// Lectures communes
// ---------------------------------------------------------------------------------------------

function livingPlayers(state: FightState): Fighter[] {
  return state.fighters.filter((f) => f.alive && f.cell >= 0 && f.team === 'players' && f.archetype !== null && !f.isSummon);
}

function livingMonsters(state: FightState, includeMama = false): Fighter[] {
  return state.fighters.filter(
    (f) => f.alive && f.cell >= 0 && f.team === 'monsters' && !f.isSummon && (includeMama || f.monsterId !== MONSTER.mama),
  );
}

function mamaOf(state: FightState): Fighter | null {
  return state.fighters.find((f) => f.monsterId === MONSTER.mama && f.team === 'monsters') ?? null;
}

/** PV effectifs (PV / multiplicateur de dégâts reçus : un monstre Vulnérable compte pour moitié). */
function effectiveHp(f: Fighter): number {
  return f.hp / Math.max(0.1, damageMultiplier(f));
}

function knows(f: Fighter, pred: (name: string, id: number) => boolean, state: FightState): boolean {
  return f.spells.some((s) => pred(state.ctx.spellName(s.spellLevelId), s.spellLevelId));
}

function hasSpellNamed(players: readonly Fighter[], state: FightState, name: string): boolean {
  return players.some((p) => knows(p, (n) => n === name, state));
}

/** Monstres (hors Mama) de la vague du tour ``turn`` (données), par type. */
function waveMonsters(state: FightState, turn: number): number[] {
  const w = state.ctx.data.scenario.waves.find((x) => x.turn === turn);
  if (!w) return [];
  const out: number[] = [];
  for (const c of w.composition) for (let i = 0; i < c.count; i++) out.push(c.monsterId);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Potentiel d'un tour (sac à dos PA → sorts du grimoire) : base des Acclamations évaluées
// ---------------------------------------------------------------------------------------------

/** Valeur forfaitaire (PV équivalents) d'un lancer selon son profil (dégâts moyens × Force, sinon utilité). */
function castValue(state: FightState, f: Fighter, spellLevelId: number): { value: number; damage: number; heal: number } {
  const p = spellProfile(state.ctx, spellLevelId);
  const strength = 1 + Math.max(0, f.stat(10 /* Stat.STRENGTH */)) / 100;
  const damage = p.damages ? p.avgDamageRoll * strength : 0;
  const E = ACCLAMATION_EVAL;
  const heal = p.heals ? E.healCastValue : 0;
  let util = 0;
  if (p.pushes || p.pulls) util = Math.max(util, E.pushCastValue);
  if (p.swaps || p.teleportsCaster || p.advancesCaster) util = Math.max(util, E.moveCastValue);
  if (!p.damages && !p.heals && p.allyRelevant) util = Math.max(util, E.allyCastValue);
  if (!util && !damage && !heal) util = E.otherCastValue;
  return { value: damage + heal + util, damage, heal };
}

interface Potential {
  value: number;
  damage: number;
  heal: number;
}

/**
 * Meilleure somme de valeurs de lancers réalisable avec ``ap`` PA (sac à dos borné : limites de lancers par tour,
 * uniques exclus, 4 lancers par sort au plus).
 */
export function turnPotential(state: FightState, f: Fighter, ap: number): Potential {
  const items: { cost: number; v: Potential; max: number }[] = [];
  for (const s of f.spells) {
    if (s.unique) continue;
    if (!state.ctx.hasSpell(s.spellLevelId)) continue;
    const cast = state.ctx.getSpell(s.spellLevelId).cast;
    if (cast.ap <= 0) continue;
    const cv = castValue(state, f, s.spellLevelId);
    const max = Math.min(cast.maxPerTurn > 0 ? cast.maxPerTurn : 4, 4, Math.floor(ap / cast.ap));
    if (max <= 0) continue;
    items.push({ cost: cast.ap, v: cv, max });
  }
  const A = Math.max(0, Math.min(40, Math.floor(ap)));
  let best: Potential[] = Array.from({ length: A + 1 }, () => ({ value: 0, damage: 0, heal: 0 }));
  for (const it of items) {
    const next = best.map((x) => ({ ...x }));
    for (let a = 0; a <= A; a++) {
      for (let k = 1; k <= it.max && k * it.cost <= a; k++) {
        const prev = best[a - k * it.cost]!;
        const v = prev.value + k * it.v.value;
        if (v > next[a]!.value) next[a] = { value: v, damage: prev.damage + k * it.v.damage, heal: prev.heal + k * it.v.heal };
      }
    }
    best = next;
  }
  return best[A]!;
}

// ---------------------------------------------------------------------------------------------
// Acclamations
// ---------------------------------------------------------------------------------------------

/** Coefficients des Acclamations évaluées (hypothèses, ÉTUDE §10.6 ; surcharge possible par l'appelant). */
export const ACCLAMATION_EVAL = {
  /** Valeur forfaitaire d'un lancer (en plus de ses dégâts moyens) : soin, poussée / attirance, déplacement, boost allié, autre. */
  healCastValue: 3000,
  pushCastValue: 1200,
  moveCastValue: 1000,
  allyCastValue: 2000,
  otherCastValue: 600,
  /** Part du potentiel du tour gagnée par +1 PO (Acrobate : placement, Videur 1-5), décroissante au-delà de +2. */
  rangeShare: { acrobate: 0.2, dompteur: 0.08, magicien: 0.1 } as Record<string, number>,
  rangeDecay: 0.6,
  /** Part du potentiel gagnée par +1 PM. */
  mpShare: 0.05,
  /** Dommages d'un joueur par tour ennemi (pour les résistances). */
  incomingPerTurn: 7000,
  /** Valeur d'1 PV de vitalité. */
  hpValue: 0.3,
  /** Dommages de poussée : part du potentiel par +100. */
  pushDamageShare: 0.012,
  /** Bonus multiplicatif des critiques (dommages critiques ≈ +30 % du jet). */
  critGain: 0.3,
  /** Part du gain de deux cartes PA comptée pour une seule (le 2e PA viendra peut-être d'une fenêtre suivante). */
  apPairShare: 0.85,
} as const;

/** Valeur marginale (PV équivalents par tour) d'une carte d'Acclamation pour ``f`` ; raison en français. */
export function acclamationValue(state: FightState, f: Fighter, stat: string, value: number): { value: number; reason: string } {
  const ap = f.maxAp;
  const base = turnPotential(state, f, ap);
  const E = ACCLAMATION_EVAL;
  const arch = f.archetype ?? '';
  switch (stat) {
    case 'ap': {
      // un PA isolé peut ne rien débloquer : on compte aussi la moitié du gain de deux cartes (fenêtres suivantes)
      const plus = turnPotential(state, f, ap + value);
      const plus2 = turnPotential(state, f, ap + 2 * value);
      const gain = Math.max(plus.value - base.value, ((plus2.value - base.value) / 2) * E.apPairShare);
      return { value: gain, reason: `+${value} PA : potentiel du tour ${Math.round(base.value)} → ${Math.round(plus.value)} (${Math.round(plus2.value)} avec deux)` };
    }
    case 'finalDamagePct':
      return { value: (base.damage * value) / 100, reason: `+${value} % DF sur ≈ ${Math.round(base.damage)} de dégâts par tour` };
    case 'critPct': {
      const crit = Math.min(1, (f.stat(3 /* CRIT */) + value) / 100) - Math.min(1, f.stat(3) / 100);
      return { value: base.damage * crit * E.critGain, reason: `+${value} % de critique` };
    }
    case 'critDamage': {
      const casts = Math.max(1, Math.round(base.damage / 8000));
      const rate = Math.min(1, Math.max(0.1, f.stat(3) / 100));
      return { value: value * casts * rate, reason: `+${value} dommages critiques (≈ ${casts} frappes par tour)` };
    }
    case 'range': {
      const bonus = Math.max(0, f.stat(2 /* RANGE */));
      const share = (E.rangeShare[arch] ?? 0.1) * Math.pow(E.rangeDecay, Math.max(0, bonus - 1));
      return { value: base.value * share * value, reason: `+${value} PO (portée actuelle +${bonus})` };
    }
    case 'mp':
      return { value: base.value * E.mpShare * value, reason: `+${value} PM` };
    case 'pushDamage':
      return { value: (base.value * E.pushDamageShare * value) / 100, reason: `+${value} dommages de poussée` };
    case 'resPct':
    case 'resPctMelee':
    case 'resPctRanged': {
      const share = stat === 'resPct' ? 1 : 0.5;
      return { value: (E.incomingPerTurn * share * value) / 100, reason: `+${value} % de résistances` };
    }
    case 'vitality':
      return { value: (value * E.hpValue) / 2, reason: `+${value} PV` };
    case 'finalHealPct':
      return { value: (base.heal * value) / 100, reason: `+${value} % de soins sur ≈ ${Math.round(base.heal)} soignés par tour` };
    default:
      return { value: 0, reason: `bonus « ${stat} » non évalué` };
  }
}

function scoreAcclamation(state: FightState, f: Fighter | undefined, opts: readonly ChoiceOption[], policy: string): ScoredOption[] {
  const arch = f?.archetype ?? '';
  const table = ACCLAMATION_ORDER[policy] ?? ACCLAMATION_ORDER.planner!;
  const order = table[arch] ?? [];
  return opts.map((o, index) => {
    if (o.kind !== 'acclamation') return { index, label: o.label, score: -1, reason: '' };
    const rank = order.indexOf(o.stat);
    const pref = rank < 0 ? 0 : 6 - rank;
    if (policy !== 'planner' || !f) {
      return { index, label: o.label, score: pref, reason: `ordre ${policy} (rang ${rank < 0 ? '—' : rank + 1})` };
    }
    const v = acclamationValue(state, f, o.stat, o.value);
    // la préférence de l'ÉTUDE ne départage que les cartes de valeur proche
    return { index, label: o.label, score: v.value + pref * 25, reason: `${v.reason} (≈ ${Math.round(v.value)} par tour)` };
  });
}

// ---------------------------------------------------------------------------------------------
// Cartes de cadeau
// ---------------------------------------------------------------------------------------------

const UNIQUE = {
  relachement: 80839,
  degagez: 80828,
  galvanisation: 80827,
  penseVite: 80843,
  muraille: 80850,
  influx: 80830,
  ultimeEspoir: 80851,
  demotivation: 80832,
  punition: 80826,
  pulsationChaotique: 80840,
  immortaliteBienfaiteur: 80848,
  immortaliteBerserker: 80842,
  immortaliteCourageux: 80844,
} as const;

/** Correction de la priorité d'une carte unique selon la situation (tour, Mama, morts, PV). */
function uniqueAdjust(state: FightState, id: number): { delta: number; why: string } {
  const t = state.turn;
  const mama = mamaOf(state);
  const mamaAlive = !!mama && mama.alive;
  const players = livingPlayers(state);
  const dead = state.fighters.some((f) => f.team === 'players' && f.archetype !== null && !f.isSummon && !f.alive);
  const minHpPct = players.reduce((m, p) => Math.min(m, p.hpPercent), 100);
  switch (id) {
    case UNIQUE.relachement:
      if (!mamaAlive && t >= 8) return { delta: -40, why: 'la Mama est morte' };
      if (t <= 4) return { delta: 25, why: 'monte pendant 4 tours : à prendre tôt (T8)' };
      if (t <= 7) return { delta: 5, why: 'encore utile contre la Mama' };
      return { delta: -20, why: 'trop tard pour monter' };
    case UNIQUE.degagez:
      return t >= 6 ? { delta: 10, why: 'fin de combat (T9-T10)' } : { delta: 0, why: 'gardé pour la fin' };
    case UNIQUE.penseVite:
      return t <= 7 ? { delta: 5, why: 'à lancer au T7' } : { delta: -25, why: 'après le T7' };
    case UNIQUE.immortaliteBerserker:
    case UNIQUE.immortaliteBienfaiteur:
    case UNIQUE.immortaliteCourageux:
      return t <= 8 ? { delta: 15, why: 'survie au T7-T8 (arrivée de la Mama)' } : { delta: -15, why: 'après le T8' };
    case UNIQUE.muraille:
      return t <= 8 ? { delta: 10, why: 'bouclier collectif pour le T8' } : { delta: -5, why: 'après le T8' };
    case UNIQUE.ultimeEspoir:
      return dead ? { delta: 30, why: 'un allié est mort' } : { delta: 0, why: '' };
    case UNIQUE.influx:
      return minHpPct < 60 ? { delta: 10, why: 'alliés blessés' } : { delta: 0, why: '' };
    case UNIQUE.demotivation:
      return mamaAlive ? { delta: t >= 5 ? 10 : 0, why: 'contre la Mama' } : { delta: -50, why: 'la Mama est morte' };
    case UNIQUE.punition:
    case UNIQUE.pulsationChaotique:
      return t >= 6 ? { delta: 10, why: 'paquets de fin de combat' } : { delta: 0, why: '' };
    default:
      return { delta: 0, why: '' };
  }
}

function scoreGift(state: FightState, f: Fighter | undefined, opts: readonly ChoiceOption[], policy: GiftPolicyName, prefs: Record<string, number>): ScoredOption[] {
  return opts.map((o, index) => {
    if (o.kind === 'unique') {
      const base = prefs[String(o.spellLevelId)] ?? GIFT_PREFERENCE[String(o.spellLevelId)] ?? 10;
      if (policy !== 'planner') return { index, label: o.label, score: base, reason: 'priorité ÉTUDE §8.3' };
      const adj = uniqueAdjust(state, o.spellLevelId);
      // Relâchement de Fureur : d'abord aux Dompteurs (deux Relâchements pour la Mama, ÉTUDE §10.1)
      let delta = adj.delta;
      let why = adj.why;
      if (o.spellLevelId === UNIQUE.relachement && f?.archetype === 'dompteur' && state.turn <= 7) {
        delta += 5;
        why = why ? `${why} ; Dompteur` : 'Dompteur';
      }
      return { index, label: o.label, score: base + delta, reason: `unique : priorité ${base}${delta ? ` ${delta > 0 ? '+' : ''}${delta}` : ''}${why ? ` (${why})` : ''}` };
    }
    if (o.kind === 'upgrade') {
      const base = prefs[String(o.baseSpellLevelId)] ?? GIFT_PREFERENCE[String(o.baseSpellLevelId)] ?? 40;
      if (policy !== 'planner' || !f) return { index, label: o.label, score: base, reason: 'priorité ÉTUDE §8.3' };
      // amélioration d'un sort de dégâts / de placement : durable (tout le combat) — légère prime en début de combat
      const early = Math.max(0, 8 - state.turn);
      return { index, label: o.label, score: base + early, reason: `amélioration : priorité ${base} (+${early}, reste du combat)` };
    }
    return { index, label: o.label, score: 0, reason: '' };
  });
}

// ---------------------------------------------------------------------------------------------
// Votes : faisabilité des objectifs
// ---------------------------------------------------------------------------------------------

export interface Feasibility {
  /** Chance estimée (0-1) de valider l'objectif vite (≈ 2 tours globaux). */
  score: number;
  reason: string;
}

/** Nombre maximal de lancers réalisables dans un tour par ``f`` (PA, limites par tour ; sorts à 0 PA exclus). */
function maxCasts(state: FightState, f: Fighter): number {
  const costs: number[] = [];
  for (const s of f.spells) {
    if (!state.ctx.hasSpell(s.spellLevelId)) continue;
    const c = state.ctx.getSpell(s.spellLevelId).cast;
    if (c.ap <= 0) continue;
    const n = Math.min(c.maxPerTurn > 0 ? c.maxPerTurn : 3, 3);
    for (let i = 0; i < n; i++) costs.push(c.ap);
  }
  costs.sort((a, b) => a - b);
  let ap = f.maxAp;
  let n = 0;
  for (const c of costs) {
    if (c > ap) break;
    ap -= c;
    n++;
  }
  return n;
}

/**
 * Faisabilité heuristique d'un objectif (ÉTUDE §7.2 « Faisabilité », §7.3) d'après la composition (archétypes,
 * grimoires), les monstres vivants (types, PV effectifs), la vague suivante, la Mama et les PV des joueurs.
 */
export function objectiveFeasibility(fight: GladiatroolFight, id: ObjectiveId): Feasibility {
  const state = fight.state;
  const t = state.turn;
  const players = livingPlayers(state);
  const monsters = livingMonsters(state);
  const mama = mamaOf(state);
  const mamaAlive = !!mama && mama.alive;
  const mamaArrived = mamaAlive && mama!.cell !== state.ctx.data.boss.waitCell;
  const arch = (k: string) => players.filter((p) => p.archetype === k).length;
  const byType = (m: number) => monsters.filter((f) => f.monsterId === m);
  const next = waveMonsters(state, t + 1);
  const nextCount = (m: number) => next.filter((x) => x === m).length;
  const effHp = monsters.map(effectiveHp);
  const low = (thr: number) => effHp.filter((h) => h <= thr).length;
  const minHpPct = players.reduce((m, p) => Math.min(m, p.hpPercent), 100);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  switch (id) {
    case 'empale':
      return { score: 0.9, reason: 'mise en pics puis frappe' };
    case 'productivite': {
      const best = players.reduce((m, p) => Math.max(m, maxCasts(state, p)), 0);
      return best >= 3
        ? { score: 0.95, reason: `un joueur peut lancer ${best} sorts dans son tour` }
        : { score: 0.2, reason: 'aucun joueur ne peut lancer 3 sorts' };
    }
    case 'meurtres_serie': {
      const n = monsters.length + next.length;
      const s = clamp(0.15 + 0.25 * Math.min(2, low(14000)) + (arch('dompteur') ? 0.15 : 0) + (n >= 3 ? 0.1 : 0));
      return { score: s, reason: `${low(14000)} ennemi(s) à ≤ 14 000 PV effectifs` };
    }
    case 'sol_glissant':
      return arch('acrobate')
        ? { score: clamp(0.3 + 0.2 * Math.min(1, low(1500))), reason: 'Acrobate : poussées contre un ennemi affaibli' }
        : { score: 0.08, reason: 'pas d’Acrobate' };
    case 'soleil':
      return { score: 0.25, reason: 'un tour global complet sans bouger (contraignant)' };
    case 'ebranlable': {
      const src = byType(MONSTER.troollibre).length + byType(MONSTER.nitrooll).length + nextCount(MONSTER.troollibre) + nextCount(MONSTER.nitrooll);
      return src > 0 ? { score: 0.8, reason: 'Troollibres / Nitroolls : Inébranlables fréquents' } : { score: 0.3, reason: 'aucun monstre Inébranlable en vue' };
    }
    case 'stop_projectiles': {
      const arts = byType(MONSTER.artroolleur);
      if (!arts.length) return { score: 1, reason: 'aucun Artroolleur vivant : validé à la fin du tour global' };
      const hp = arts.reduce((s, a) => s + effectiveHp(a), 0);
      return { score: hp <= 20000 ? 0.75 : hp <= 45000 ? 0.5 : 0.3, reason: `${arts.length} Artroolleur(s), ≈ ${Math.round(hp)} PV effectifs` };
    }
    case 'toi_par_ici': {
      const swap = players.some((p) => p.spells.some((s) => spellProfile(state.ctx, s.spellLevelId).swaps));
      return swap ? { score: 0.7, reason: 'Voltige (échange) depuis les pics' } : { score: 0.1, reason: 'aucun sort d’échange' };
    }
    case 'sauvez_le':
      return { score: minHpPct >= 95 && arch('magicien') ? 0.45 : 0.12, reason: 'l’allié désigné doit finir à 100 % de ses PV' };
    case 'prendre_sa_place':
      return { score: arch('acrobate') ? 0.35 : 0.2, reason: 'déloger l’ennemi le plus éloigné puis prendre sa case' };
    case 'faire_le_mur': {
      const n = monsters.length;
      const degagez = hasSpellNamed(players, state, 'Dégagez !');
      if (!arch('acrobate') || n < 3) return { score: 0.1, reason: `${n} ennemi(s)${arch('acrobate') ? '' : ', pas d’Acrobate'}` };
      return { score: degagez ? 0.8 : 0.4, reason: degagez ? 'Dégagez ! sur 3 ennemis' : 'poussées sur 3 ennemis (k ≤ 2)' };
    }
    case 'pas_le_temps': {
      const full = monsters.filter((m) => m.hp >= m.maxHp && effectiveHp(m) <= 26000).length + next.length;
      return arch('dompteur') && full > 0
        ? { score: 0.5, reason: 'un Dompteur peut tuer un monstre neuf dans son tour' }
        : { score: 0.2, reason: 'demande 19-25 k dans le tour d’un seul joueur' };
    }
    case 'distance_insecurite': {
      const arts = byType(MONSTER.artroolleur).length;
      if (!arts) return { score: 1, reason: 'aucun Artroolleur : vrai par vacuité' };
      return { score: arts <= 2 ? 0.4 : 0.2, reason: `${arts} Artroolleur(s) à approcher à ≤ 3 cases` };
    }
    case 'attirance':
      return { score: t >= 7 ? 0.15 : 0.05, reason: 'tous les joueurs attrapés par un même Rassemblement (coûteux)' };
    case 'trous_troolls': {
      const n = monsters.length + next.length;
      const degagez = hasSpellNamed(players, state, 'Dégagez !');
      if (n < 4) return { score: 0.05, reason: 'moins de 4 ennemis' };
      return { score: degagez ? 0.65 : arch('acrobate') >= 2 ? 0.3 : 0.2, reason: degagez ? 'Dégagez ! sur un paquet' : 'Hanedimane + Videur sur un groupe' };
    }
    case 'pierre_trois_coups':
      return { score: low(8000) >= 3 ? 0.45 : 0.15, reason: `${low(8000)} ennemi(s) à ≤ 8 000 PV effectifs` };
    case 'tout_va_bien': {
      const s = minHpPct > 70 ? 0.9 : minHpPct > 55 ? 0.6 : 0.3;
      return { score: clamp(s + (arch('magicien') ? 0.05 : 0)), reason: `PV minimaux ${Math.round(minHpPct)} %` };
    }
    case 'solitude': {
      if (!mamaAlive) return { score: 0, reason: 'la Mama est morte' };
      const hp = monsters.reduce((s, m) => s + effectiveHp(m), 0);
      return { score: hp <= 40000 ? 0.6 : hp <= 80000 ? 0.35 : 0.15, reason: `${monsters.length} Trooll(s) à tuer dans le tour global (≈ ${Math.round(hp)} PV effectifs)` };
    }
    case 'quintuple': {
      const n = monsters.length + (mamaArrived ? 1 : 0);
      return { score: n >= 5 ? 0.55 : n + next.length >= 5 ? 0.35 : 0.15, reason: `${n} ennemi(s) vivants` };
    }
    case 'au_coin': {
      const n = monsters.length + (mamaArrived ? 1 : 0);
      const degagez = hasSpellNamed(players, state, 'Dégagez !');
      return { score: n <= 2 ? (degagez ? 0.7 : 0.55) : degagez ? 0.45 : 0.2, reason: `${n} ennemi(s) à mettre dans les pics` };
    }
    case 'meme_pas_mal': {
      const shield = players.some((p) => p.spells.some((s) => ['Protection Prolongée', 'Muraille collective'].includes(state.ctx.spellName(s.spellLevelId))));
      if (!mamaAlive) return { score: 0, reason: 'la Mama est morte' };
      return { score: t >= 7 ? (shield ? 0.6 : 0.25) : 0.12, reason: shield ? 'bouclier contre un sort de la Mama' : 'aucun bouclier' };
    }
    default:
      return { score: 0.3, reason: 'objectif non évalué' };
  }
}

function scoreVote(fight: GladiatroolFight, opts: readonly ChoiceOption[], policy: VotePolicyName, o: PolicyOptions): ScoredOption[] {
  const prefs = { ...OBJECTIVE_PREFERENCE, ...(o.objectivePreference ?? {}) };
  const order = o.fixedVoteOrder ?? fight.ctx.config.objectives.fixedVoteOrder ?? [];
  return opts.map((opt, index) => {
    if (opt.kind !== 'objective') return { index, label: opt.label, score: -1, reason: '' };
    const pref = prefs[opt.objectiveId] ?? 0;
    if (policy === 'fixed') {
      const r = order.indexOf(opt.objectiveId);
      return { index, label: opt.label, score: r < 0 ? -1 : 1000 - r, reason: r < 0 ? 'hors de la liste fixe' : `liste fixe (rang ${r + 1})` };
    }
    if (policy === 'preference') return { index, label: opt.label, score: pref, reason: `préférence ${pref}/10 (ÉTUDE §7.3)` };
    const f = objectiveFeasibility(fight, opt.objectiveId);
    return {
      index,
      label: opt.label,
      score: f.score * 10 + pref * 0.5,
      reason: `faisabilité ${f.score.toFixed(2)} (${f.reason}), préférence ${pref}/10`,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Politique complète
// ---------------------------------------------------------------------------------------------

/** Options notées d'un choix (score, raison en français) selon les politiques ``o`` (défauts : configuration). */
export function scoreChoice(choice: ScenarioChoice, fight: GladiatroolFight, o: PolicyOptions = {}): ScoredOption[] {
  const state = fight.state;
  const f = choice.fighterId >= 0 ? state.fighters[choice.fighterId] : undefined;
  const opts = choice.options;
  if (!opts.length) return [];
  switch (opts[0]!.kind) {
    case 'acclamation':
      return scoreAcclamation(state, f, opts, o.acclamation ?? fight.ctx.config.bonuses.policy);
    case 'unique':
    case 'upgrade':
      return scoreGift(state, f, opts, o.gift ?? 'planner', o.giftPreference ?? {});
    case 'objective':
      return scoreVote(fight, opts, o.vote ?? fight.ctx.config.objectives.votePolicy, o);
    case 'archetype':
      return opts.map((opt, index) => ({
        index,
        label: opt.label,
        score: opt.kind === 'archetype' && f && opt.archetype === f.archetype ? 1 : 0,
        reason: 'archétype de la mise en place',
      }));
  }
}

/** Meilleure option (égalité : la première) et sa note. */
export function bestOption(scored: readonly ScoredOption[]): ScoredOption | null {
  let best: ScoredOption | null = null;
  for (const s of scored) if (!best || s.score > best.score) best = s;
  return best;
}

/**
 * Politique de choix configurable (runner, interface, planificateur) : Acclamations (``bonuses.policy``), cartes de
 * cadeau (priorités + situation), votes (``objectives.votePolicy``), archétype. Réponse d'équipe (index) pour un vote.
 */
export function createChoicePolicy(o: PolicyOptions = {}): ChoicePolicy {
  return (choice, fight) => bestOption(scoreChoice(choice, fight, o))?.index ?? 0;
}

/** Politique par défaut du runner : tout selon la configuration du combat. */
export const configChoicePolicy: ChoicePolicy = createChoicePolicy();

/** Libellé français d'une liste de choix. */
export function choiceKindLabel(choice: ScenarioChoice): string {
  const k = choice.options[0]?.kind;
  switch (k) {
    case 'acclamation':
      return 'Acclamation';
    case 'unique':
    case 'upgrade':
      return 'Cadeau';
    case 'objective':
      return 'Vote';
    case 'archetype':
      return 'Archétype';
    default:
      return `Choix ${choice.choiceListId}`;
  }
}

/** Objectif (nom) d'un identifiant, pour les messages. */
export function objectiveName(fight: GladiatroolFight, id: ObjectiveId): string {
  return objectiveById(fight.ctx.data, id).name;
}
