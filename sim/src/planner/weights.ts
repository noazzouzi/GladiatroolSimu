/**
 * Poids de l'évaluation statique du planificateur (evaluate.ts). Toutes les valeurs sont exprimées en « points de
 * vie équivalents » : 1 point = 1 PV de monstre (hors pics) retiré. Seules les DIFFÉRENCES de score entre deux états
 * comptent ; les poids sont donc relatifs. Inspirés de l'ÉTUDE §10.2 (principes autour des pics), §5.7 (menace par
 * vague), §6 (Mama), §7.3 (objectifs), §8.3 (uniques).
 *
 * Tout est paramétrable : ``planPlayerTurn(fight, { weights: { mamaLine: 12000 } })`` (fusion sur un niveau : les
 * tables par monstre / par sort sont fusionnées clé par clé).
 */

/** Valeur d'un sort unique gardé dans le grimoire jusqu'au tour ``untilTurn`` (inclus). */
export interface UniqueHoldValue {
  /** Dernier tour global où garder le sort a de la valeur. */
  untilTurn: number;
  /** Valeur (PV équivalents) du sort gardé jusque-là ; au-delà : 0 (il faut le lancer). */
  value: number;
}

export interface PlannerWeights {
  // ------------------------------------------------------------------ monstres
  /** Valeur d'un PV de monstre, divisé par le multiplicateur « durable » attendu (voir ``futureMult*``). */
  monsterHp: number;
  /**
   * Multiplicateur de dommages FUTUR attendu d'un Trooll hors des pics : il sera probablement poussé dedans plus
   * tard (×2). Frapper aujourd'hui une cible non multipliée « gaspille » une partie des dégâts (ÉTUDE §10.2 n° 3) ;
   * frapper une cible Vulnérable (×2 temporaire) en tire tout le bénéfice.
   */
  futureMultOutside: number;
  /** Multiplicateur futur d'un monstre dans les pics (×2 tant qu'il y reste). */
  futureMultInSpikes: number;
  /** Valeur de présence d'un monstre vivant, par id de monstre (retirée à sa mort : « valeur d'une mise à mort »). */
  monsterAlive: Record<string, number>;
  /** Valeur de présence d'un monstre sans entrée dans ``monsterAlive``. */
  monsterAliveDefault: number;
  /**
   * Confiance qu'un monstre dans les pics dont les PV ≤ dégâts de début de tour (1 000 × multiplicateurs) meure seul
   * à son tour (ÉTUDE §10.2 n° 4 : « laisser mourir seul un Trooll ≤ 2 000 PV dans les pics »).
   */
  spikeDeathConfidence: number;

  // ------------------------------------------------------------------ menace des monstres (prochain passage)
  /** Dégâts moyens d'un monstre en un tour sur une cible (à 100 % de DF, hors multiplicateurs), par id (ÉTUDE §5). */
  monsterThreat: Record<string, number>;
  monsterThreatDefault: number;
  /** Force de poussée maximale d'un monstre (risque d'être poussé dans les pics), par id. */
  monsterPush: Record<string, number>;
  /** Facteur de menace d'un monstre dans les pics (il passe souvent son tour, ``ai.skipIfInSpikes``). */
  threatInSpikesFactor: number;
  /** Facteur de menace d'un monstre qui n'atteint aucun joueur ce tour (il se rapproche). */
  threatUnreachableFactor: number;
  /**
   * Décroissance de la menace par tour de joueur qui passe avant le tour du monstre (« tuer celui qui joue juste
   * après soi », ÉTUDE §10.2 n° 2) : facteur ``threatDecay^n``, borné par ``threatDecayFloor``.
   */
  threatDecay: number;
  threatDecayFloor: number;
  /** Valeur d'un PV de joueur perdu à cause de la menace estimée. */
  threatWeight: number;
  /** Pénalité d'un joueur à portée d'un monstre qui peut le pousser dans les pics (k ≤ force de poussée). */
  pushRisk: number;

  // ------------------------------------------------------------------ joueurs
  /** Valeur d'un PV de joueur restant (PV courants). */
  playerHp: number;
  /** Pénalité d'un joueur mort. */
  playerDeath: number;
  /** Poids du risque de mort (fraction de ``playerDeath`` à marge nulle : sigmoïde (menace − PV) / échelle). */
  deathRiskWeight: number;
  deathRiskScale: number;
  /** Joueur dans les pics en fin d'action (1 000 à son début de tour, Vulnérable, ×2 à la sortie). */
  playerInSpikes: number;
  /** Joueur près du bord : pénalité × (3 − k) pour k < 3 (k = cases jusqu'au premier pic dans l'axe). */
  playerEdge: number;
  /**
   * Joueur aligné avec la Mama (sa case, ou sa case d'arrivée au tour qui précède son arrivée) : Rassemblement
   * → poussé jusqu'au bord (pics), puis cible Vulnérable (ÉTUDE §6.4, §10.5 T7).
   */
  mamaLine: number;
  /** Joueur sur la case d'arrivée de la Mama au tour qui précède son arrivée (elle arrive alors sur le repli). */
  mamaArrivalCell: number;

  // ------------------------------------------------------------------ objectifs, cadeaux, ressources
  /** Valeur d'un objectif validé : sort débloqué pour chaque joueur + Faveur de la Mama −5 % (ÉTUDE §7.1). */
  objectiveCompleted: number;
  /** Supplément par objectif validé tant que la Mama est vivante (−5 % de ses DF). */
  objectiveFavour: number;
  /** Progression d'un objectif « pendant le tour » (compteur / cible) : fraction de ce poids. */
  objectiveProgress: number;
  /** Condition d'un objectif de fin de tour / de tour global déjà remplie : fraction de ``objectiveCompleted``. */
  objectivePendingFactor: number;
  /** Cadeau ramassé (une carte pour chaque joueur). */
  giftTaken: number;
  /** Sort unique gardé dans le grimoire (défaut) ; voir ``uniqueHold`` par niveau de sort. */
  uniqueHoldDefault: UniqueHoldValue;
  uniqueHold: Record<string, UniqueHoldValue>;
  /** Valeur d'un PA / PM bonus pour un tour futur d'un joueur (Regain, Galvanisation, Pense Vite…). */
  apFutureValue: number;
  mpFutureValue: number;
  /** PA futurs pris en compte au plus par tour (Pense Vite : 999 PA, mais ≈ 3 sorts, ``spells.penseVite.maxCasts``). */
  apFutureCap: number;
  /** Valeur d'un % de dommages finaux / de critique / d'un point de PO futur sur un joueur, par tour. */
  finalDamageFutureValue: number;
  critFutureValue: number;
  rangeFutureValue: number;
  /** Plafond de la valeur d'un envoûtement bénéfique. */
  buffValueCap: number;

  // ------------------------------------------------------------------ Mama
  /** Fenêtre de burst ouverte (Mama arrivée, dans les pics, non invulnérable), × joueurs qui jouent encore / 3. */
  mamaWindow: number;
}

export const DEFAULT_WEIGHTS: Readonly<PlannerWeights> = Object.freeze({
  monsterHp: 1,
  futureMultOutside: 1.6,
  futureMultInSpikes: 2,
  monsterAlive: { '7981': 5000, '7982': 6000, '7983': 7000, '7984': 30000 },
  monsterAliveDefault: 4000,
  spikeDeathConfidence: 0.85,

  monsterThreat: { '7981': 9000, '7982': 4000, '7983': 3000, '7984': 15000 },
  monsterThreatDefault: 3000,
  monsterPush: { '7981': 3, '7982': 2, '7983': 3, '7984': 6 },
  threatInSpikesFactor: 0.25,
  threatUnreachableFactor: 0.15,
  threatDecay: 0.8,
  threatDecayFloor: 0.45,
  threatWeight: 0.6,
  pushRisk: 2000,

  playerHp: 0.4,
  playerDeath: 60000,
  deathRiskWeight: 0.5,
  deathRiskScale: 3000,
  playerInSpikes: 3000,
  playerEdge: 400,
  mamaLine: 9000,
  mamaArrivalCell: 4000,

  objectiveCompleted: 9000,
  objectiveFavour: 1500,
  objectiveProgress: 2500,
  objectivePendingFactor: 0.6,
  giftTaken: 5000,
  uniqueHoldDefault: { untilTurn: 6, value: 3000 },
  uniqueHold: {
    // Relâchement de Fureur : pour la Mama au T8 (ÉTUDE §6.9)
    '80839': { untilTurn: 7, value: 15000 },
    // Dégagez ! : T9–T10 (ÉTUDE §10.5)
    '80828': { untilTurn: 8, value: 7000 },
    // Pense Vite : à lancer au T7 (ÉTUDE §8.3)
    '80843': { untilTurn: 6, value: 6000 },
    // Punition Collective, Pulsation Chaotique : fin de combat
    '80826': { untilTurn: 8, value: 5000 },
    '80840': { untilTurn: 8, value: 4000 },
    // Muraille collective, Galvanisation : T7
    '80850': { untilTurn: 6, value: 4000 },
    '80827': { untilTurn: 6, value: 4000 },
  },
  apFutureValue: 700,
  mpFutureValue: 200,
  apFutureCap: 12,
  finalDamageFutureValue: 60,
  critFutureValue: 20,
  rangeFutureValue: 250,
  buffValueCap: 9000,

  mamaWindow: 12000,
}) as Readonly<PlannerWeights>;

/** Fusionne des poids partiels sur les poids par défaut (tables fusionnées clé par clé). */
export function mergeWeights(over: Partial<PlannerWeights> | undefined, base: Readonly<PlannerWeights> = DEFAULT_WEIGHTS): PlannerWeights {
  const w: PlannerWeights = {
    ...base,
    monsterAlive: { ...base.monsterAlive },
    monsterThreat: { ...base.monsterThreat },
    monsterPush: { ...base.monsterPush },
    uniqueHold: { ...base.uniqueHold },
    uniqueHoldDefault: { ...base.uniqueHoldDefault },
  };
  if (!over) return w;
  for (const [k, v] of Object.entries(over) as [keyof PlannerWeights, unknown][]) {
    if (v === undefined) continue;
    if (k === 'monsterAlive' || k === 'monsterThreat' || k === 'monsterPush' || k === 'uniqueHold') {
      Object.assign(w[k] as object, v);
    } else {
      (w as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return w;
}
