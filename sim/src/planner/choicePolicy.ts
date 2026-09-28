/**
 * Politique de choix par défaut du planificateur (fenêtres qui apparaissent pendant une simulation : vote
 * d'objectif, cadeau, Acclamation). Injectable (``PlanOptions.choicePolicy``) : le runner ou l'interface peuvent
 * fournir la leur. Préférences tirées de l'ÉTUDE §7.3 (votes), §8.3 (cadeaux) et §10.6 (Acclamations,
 * ``bonuses.policy``).
 */
import type { ObjectiveId } from '../data/index.js';
import type { ChoiceAnswer, ChoiceOption, GladiatroolFight, ScenarioChoice } from '../scenario/index.js';

/** Réponse à un choix (index d'option, ou votes). */
export type ChoicePolicy = (choice: ScenarioChoice, fight: GladiatroolFight) => ChoiceAnswer;

/** Préférence des objectifs (plus haut = préféré), ÉTUDE §7.3. */
export const OBJECTIVE_PREFERENCE: Readonly<Record<ObjectiveId, number>> = {
  empale: 10,
  // palier 2 : Productivité ≫ Meurtres en série > Sol glissant > Soleil
  productivite: 10,
  meurtres_serie: 6,
  sol_glissant: 4,
  soleil: 1,
  // palier 3 : Stop aux projectiles (auto) ou Ébranlable ; Toi par ici ; éviter Sauvez-le
  stop_projectiles: 10,
  ebranlable: 8,
  toi_par_ici: 5,
  sauvez_le: 1,
  // palier 4 : Distance d'insécurité (auto sans Artroolleur) ou Pas le temps ; Faire le mur
  distance_insecurite: 10,
  pas_le_temps: 7,
  faire_le_mur: 5,
  prendre_sa_place: 3,
  // palier 5 : Tout va bien ; Trous dans les Troolls ; éviter Attirance
  tout_va_bien: 10,
  trous_troolls: 6,
  pierre_trois_coups: 5,
  attirance: 1,
  // palier 6 : Au coin !, Quintuplé, Même pas mal, Solitude
  au_coin: 8,
  quintuple: 7,
  meme_pas_mal: 6,
  solitude: 5,
};

/** Préférence des cartes de cadeau par niveau de sort (unique) ou niveau de base (amélioration), ÉTUDE §8.3. */
export const GIFT_PREFERENCE: Readonly<Record<string, number>> = {
  // uniques
  '80839': 100, // Relâchement de Fureur
  '80828': 90, // Dégagez !
  '80827': 85, // Galvanisation
  '80843': 80, // Pense Vite
  '80850': 78, // Muraille collective
  '80830': 76, // Influx de Vitalité
  '80851': 74, // Ultime Espoir
  '80832': 72, // Démotivation des troupes
  '80826': 70, // Punition Collective
  '80840': 68, // Pulsation Chaotique
  '80848': 60, // Immortalité du Bienfaiteur
  '80842': 58, // Immortalité du Berserker
  '80844': 56, // Immortalité du Courageux
  '80841': 50, // Malédiction Collatérale
  '80829': 45, // Courage, fuyons
  '80847': 40, // Un pour un
  '80845': 35, // Malédiction Mouvante
  '80846': 30, // Chamboulement
  '80849': 25, // Malédiction Régénérante
  '80509': 20, // Soutien Stratégique (amélioration jugée faible)
  // améliorations (niveau de base)
  '80507': 95, // Videur
  '80513': 88, // Hanedimane
  '80522': 70, // Aïronemane
  '80500': 95, // Impact
  '80502': 82, // Prélèvement
  '80515': 92, // Regain Vigoureux
  '80516': 86, // Amplification
  '80514': 75, // Pulsation d'Énergie
  '80519': 65, // Protection Prolongée
};

/** Ordre des caractéristiques d'Acclamation par politique (``bonuses.policy``) et archétype. */
const ACCLAMATION_ORDER: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  planner: {
    acrobate: ['range', 'ap', 'mp', 'pushDamage', 'resPct', 'resPctMelee'],
    dompteur: ['ap', 'finalDamagePct', 'range', 'critDamage', 'critPct', 'mp'],
    magicien: ['ap', 'range', 'vitality', 'finalHealPct', 'mp', 'resPctRanged'],
  },
  PO_first: {
    acrobate: ['range', 'ap', 'mp', 'pushDamage', 'resPct', 'resPctMelee'],
    dompteur: ['range', 'ap', 'finalDamagePct', 'critDamage', 'critPct', 'mp'],
    magicien: ['range', 'ap', 'vitality', 'finalHealPct', 'mp', 'resPctRanged'],
  },
  PA_first: {
    acrobate: ['ap', 'range', 'mp', 'pushDamage', 'resPct', 'resPctMelee'],
    dompteur: ['ap', 'range', 'finalDamagePct', 'critDamage', 'critPct', 'mp'],
    magicien: ['ap', 'range', 'vitality', 'finalHealPct', 'mp', 'resPctRanged'],
  },
  DF_first: {
    acrobate: ['ap', 'range', 'pushDamage', 'mp', 'resPct', 'resPctMelee'],
    dompteur: ['finalDamagePct', 'ap', 'range', 'critDamage', 'critPct', 'mp'],
    magicien: ['ap', 'finalHealPct', 'range', 'vitality', 'mp', 'resPctRanged'],
  },
};

function optionScore(o: ChoiceOption, archetype: string | null, fight: GladiatroolFight): number {
  switch (o.kind) {
    case 'objective':
      return OBJECTIVE_PREFERENCE[o.objectiveId] ?? 0;
    case 'unique':
      return GIFT_PREFERENCE[String(o.spellLevelId)] ?? 10;
    case 'upgrade':
      return GIFT_PREFERENCE[String(o.baseSpellLevelId)] ?? 40;
    case 'acclamation': {
      const policy = fight.ctx.config.bonuses.policy;
      const table = ACCLAMATION_ORDER[policy] ?? ACCLAMATION_ORDER.planner!;
      const order = table[archetype ?? ''] ?? [];
      const i = order.indexOf(o.stat);
      return i < 0 ? 0 : 100 - i;
    }
    case 'archetype':
      return 0;
  }
}

/**
 * Politique par défaut : option de meilleure préférence (objectifs §7.3, cadeaux §8.3, Acclamations selon
 * ``bonuses.policy``) ; égalité : première option. Pour un vote, réponse d'équipe (index).
 */
export const defaultChoicePolicy: ChoicePolicy = (choice, fight) => {
  const f = choice.fighterId >= 0 ? fight.state.fighters[choice.fighterId] : undefined;
  const archetype = f?.archetype ?? null;
  let best = 0;
  let bestScore = -Infinity;
  choice.options.forEach((o, i) => {
    const s = optionScore(o, archetype, fight);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  });
  return best;
};

/** Résout tous les choix en attente avec ``policy`` ; renvoie les choix faits (liste, option retenue). */
export function resolveChoicesWith(
  fight: GladiatroolFight,
  policy: ChoicePolicy,
  record?: { choiceListId: number; fighterId: number; label: string }[],
): boolean {
  for (let guard = 0; guard < 64; guard++) {
    const c = fight.getPendingChoice();
    if (!c) return true;
    const answer = policy(c, fight);
    const r = fight.resolveChoice(c.uid, answer);
    if (!r.ok) {
      // réponse refusée : première option
      const r2 = fight.resolveChoice(c.uid, 0);
      if (!r2.ok) return false;
      record?.push({ choiceListId: c.choiceListId, fighterId: c.fighterId, label: r2.option?.label ?? '?' });
    } else {
      record?.push({ choiceListId: c.choiceListId, fighterId: c.fighterId, label: r.option?.label ?? '?' });
    }
  }
  return false;
}
