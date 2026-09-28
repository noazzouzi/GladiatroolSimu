/**
 * Journal d'événements typé du combat (rejeu dans l'interface, débogage, objectifs) et messages en français.
 *
 * Les événements ne portent que des identifiants (combattants, niveaux de sort, états) : le texte est produit à la
 * demande par ``formatEvent`` avec un contexte de noms. Le journal est optionnel (``engine.eventLog``) : le
 * planificateur le désactive pour la vitesse.
 */

export type MoveKind = 'walk' | 'push' | 'pull' | 'advance' | 'teleport' | 'swap' | 'place' | 'resurrect';
export type DeathCause = 'damage' | 'pushDamage' | 'kill' | 'other';

export type FightEvent =
  | { type: 'fightStart' }
  | { type: 'globalTurn'; turn: number }
  | { type: 'turnStart'; turn: number; fighterId: number }
  | { type: 'turnEnd'; turn: number; fighterId: number }
  | {
      type: 'cast';
      casterId: number;
      spellLevelId: number;
      spellId: number;
      cell: number;
      critical: boolean;
      castId: number;
      /** 0 = lancer du joueur / de l'IA ; > 0 = sous-sort ou déclenchement. */
      depth: number;
      apCost: number;
    }
  | { type: 'castFailed'; casterId: number; spellLevelId: number; cell: number; code: string; reason: string }
  | {
      type: 'damage';
      sourceId: number;
      targetId: number;
      /** PV perdus (après bouclier). */
      amount: number;
      shieldAbsorbed: number;
      eroded: number;
      /** Dégâts après multiplicateurs (avant bouclier). */
      final: number;
      element: number;
      critical: boolean;
      collision: boolean;
      pushIndex: number;
      invulnerable: boolean;
      spellLevelId: number;
      hpAfter: number;
    }
  | {
      type: 'heal';
      sourceId: number;
      targetId: number;
      amount: number;
      lifeSteal: boolean;
      spellLevelId: number;
      hpAfter: number;
    }
  | {
      type: 'move';
      fighterId: number;
      sourceId: number;
      kind: MoveKind;
      from: number;
      to: number;
      /** Arrêt par collision (poussée). */
      collision: boolean;
      /** Cases parcourues (arrivée comprise) ; marche : chemin. */
      path: readonly number[];
    }
  | { type: 'moveBlocked'; fighterId: number; sourceId: number; kind: MoveKind; reason: string }
  | { type: 'death'; fighterId: number; killerId: number; cause: DeathCause; cell: number }
  | { type: 'spawn'; fighterId: number; cell: number; summonerId: number }
  | { type: 'stateAdded'; targetId: number; stateId: number; sourceId: number }
  | { type: 'stateRemoved'; targetId: number; stateId: number }
  | {
      type: 'buffAdded';
      targetId: number;
      sourceId: number;
      buffUid: number;
      kind: string;
      effectId: number;
      value: number;
      duration: number;
      delay: number;
      stat: number;
      spellLevelId: number;
    }
  | { type: 'buffRemoved'; targetId: number; buffUid: number; kind: string; effectId: number; reason: string }
  | { type: 'markAdded'; markUid: number; casterId: number; effectId: number; spellLevelId: number; cellCount: number }
  | { type: 'markRemoved'; markUid: number; reason: string }
  | { type: 'choice'; choiceUid: number; scope: 'individual' | 'global'; choiceListId: number; fighterId: number }
  | { type: 'spellLearned'; fighterId: number; spellLevelId: number }
  | { type: 'spellForgotten'; fighterId: number; spellLevelId: number }
  | { type: 'effectIgnored'; effectId: number; handler: string; spellLevelId: number; reason: string }
  | {
      /** Un buff déclenché s'exécute (jeton : TB, TE, D, X, EOFF5902…). */
      type: 'triggered';
      carrierId: number;
      casterId: number;
      buffUid: number;
      effectId: number;
      spellLevelId: number;
      token: string;
    }
  | { type: 'intercepted'; interceptorId: number; targetId: number; sourceId: number; buffUid: number }
  | { type: 'turnCancelled'; fighterId: number; reason: string }
  | {
      /** Une marque agit sur un combattant : entrée / sortie d'aura, glyphe de début / fin de tour, glyphe immédiat. */
      type: 'markTriggered';
      markUid: number;
      fighterId: number;
      spellLevelId: number;
      reason: MarkTriggerReason;
    }
  // --- événements du scénario (sim/src/scenario) ---
  | { type: 'waveSpawned'; wave: number; turn: number; fighterIds: readonly number[]; cells: readonly number[] }
  | { type: 'giftSpawned'; cell: number; turn: number }
  | { type: 'objectiveActivated'; objectiveId: string; name: string; tier: number }
  | { type: 'objectiveCompleted'; objectiveId: string; name: string; tier: number; creditedId: number; count: number }
  /** Étape d'un objectif (désignation de Sauvez-le, case marquée de « Tout le monde veut prendre sa place »…). */
  | { type: 'objectiveInfo'; objectiveId: string; message: string }
  | { type: 'choiceResolved'; choiceUid: number; choiceListId: number; fighterId: number; label: string }
  | { type: 'fightEnded'; winner: 'players' | 'monsters' | 'scenario' | null; reason: string }
  | { type: 'info'; message: string };

export type MarkTriggerReason = 'enter' | 'exit' | 'turnStart' | 'turnEnd' | 'glyph';

export type FightEventType = FightEvent['type'];

/** Journal (liste append-only). */
export class EventLog {
  events: FightEvent[];

  constructor(events: FightEvent[] = []) {
    this.events = events;
  }

  push(ev: FightEvent): void {
    this.events.push(ev);
  }

  clone(): EventLog {
    return new EventLog(this.events.slice());
  }

  get length(): number {
    return this.events.length;
  }

  ofType<T extends FightEventType>(type: T): Extract<FightEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<FightEvent, { type: T }>[];
  }
}

/** Noms utilisés par ``formatEvent``. */
export interface NameResolver {
  fighter(id: number): string;
  spell(spellLevelId: number): string;
  state(stateId: number): string;
}

const NBSP = ' ';

/** Nombre au format français (séparateur de milliers). */
export function fmtNum(n: number): string {
  const s = Math.abs(Math.trunc(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return n < 0 ? `−${s}` : s;
}

const MOVE_VERBS: Record<MoveKind, string> = {
  walk: 'se déplace',
  push: 'est repoussé',
  pull: 'est attiré',
  advance: 'avance',
  teleport: 'se téléporte',
  swap: 'échange sa place',
  place: 'est placé',
  resurrect: 'revient au combat',
};

const DEATH_CAUSES: Record<DeathCause, string> = {
  damage: '',
  pushDamage: ' (dommages de poussée)',
  kill: ' (tué par un effet)',
  other: '',
};

/** Libellés français des principaux jetons de déclenchement. */
const TOKEN_LABELS: Record<string, string> = {
  TB: 'début de tour',
  TE: 'fin de tour',
  D: 'dommages subis',
  DBA: "dommages d'un allié",
  PD: 'dommages de poussée',
  PMD: 'dommages de poussée',
  X: 'mort',
  XD: 'mort par dommages',
  XPD: 'mort par poussée',
  K: 'a tué',
  CAP: 'lancer de sort',
  VA: 'PV modifiés',
  V: 'PV modifiés',
  CD: 'dommages infligés',
  H: 'soin reçu',
  M: 'déplacement',
  P: 'poussé',
  MA: 'attiré',
  MS: 'échangé',
};

function tokenLabel(token: string, n: NameResolver): string {
  const m = /^(EON|EOFF)(\d+)$/.exec(token);
  if (m) return `état « ${n.state(Number(m[2]))} » ${m[1] === 'EON' ? 'gagné' : 'perdu'}`;
  const tr = /^TR(\d+)$/.exec(token);
  if (tr) return `seuil du sort ${tr[1]} atteint`;
  return TOKEN_LABELS[token] ?? token;
}

/** Message français d'un événement. */
export function formatEvent(ev: FightEvent, n: NameResolver): string {
  switch (ev.type) {
    case 'fightStart':
      return 'Début du combat.';
    case 'globalTurn':
      return `— Tour ${ev.turn} —`;
    case 'turnStart':
      return `Début du tour de ${n.fighter(ev.fighterId)}.`;
    case 'turnEnd':
      return `Fin du tour de ${n.fighter(ev.fighterId)}.`;
    case 'cast': {
      const who = n.fighter(ev.casterId);
      const end = ev.critical ? ' — coup critique !' : '.';
      const cell = ev.cell >= 0 ? ` sur la case ${ev.cell}` : '';
      if (ev.depth > 0) return `${who} exécute ${n.spell(ev.spellLevelId)}${cell}${end}`;
      const cost = ev.apCost > 0 ? ` (${ev.apCost} PA)` : '';
      return `${who} lance ${n.spell(ev.spellLevelId)}${cell}${cost}${end}`;
    }
    case 'castFailed':
      return `${n.fighter(ev.casterId)} ne peut pas lancer ${n.spell(ev.spellLevelId)} : ${ev.reason}.`;
    case 'damage': {
      const tgt = n.fighter(ev.targetId);
      if (ev.invulnerable) return `${tgt} est invulnérable : aucun dommage.`;
      const what = ev.collision ? 'dommages de poussée' : 'PV';
      const parts: string[] = [];
      if (ev.shieldAbsorbed > 0) parts.push(`${fmtNum(ev.shieldAbsorbed)} absorbés par le bouclier`);
      if (ev.eroded > 0) parts.push(`${fmtNum(ev.eroded)} PV max érodés`);
      const extra = parts.length ? ` (${parts.join(', ')})` : '';
      return `${tgt} perd ${fmtNum(ev.amount)} ${what}${extra} — reste ${fmtNum(ev.hpAfter)} PV.`;
    }
    case 'heal':
      return ev.lifeSteal
        ? `${n.fighter(ev.targetId)} vole ${fmtNum(ev.amount)} PV — ${fmtNum(ev.hpAfter)} PV.`
        : `${n.fighter(ev.targetId)} est soigné de ${fmtNum(ev.amount)} PV — ${fmtNum(ev.hpAfter)} PV.`;
    case 'move': {
      const who = n.fighter(ev.fighterId);
      const col = ev.collision ? ' (collision)' : '';
      return `${who} ${MOVE_VERBS[ev.kind]} : ${ev.from} → ${ev.to}${col}.`;
    }
    case 'moveBlocked':
      return `${n.fighter(ev.fighterId)} ne bouge pas : ${ev.reason}.`;
    case 'death':
      return `${n.fighter(ev.fighterId)} est mort${DEATH_CAUSES[ev.cause]}.`;
    case 'spawn':
      return ev.summonerId >= 0
        ? `${n.fighter(ev.summonerId)} invoque ${n.fighter(ev.fighterId)} sur la case ${ev.cell}.`
        : ev.cell >= 0
          ? `${n.fighter(ev.fighterId)} apparaît sur la case ${ev.cell}.`
          : `${n.fighter(ev.fighterId)} rejoint le combat (hors de la carte).`;
    case 'stateAdded':
      return `${n.fighter(ev.targetId)} gagne l'état « ${n.state(ev.stateId)} ».`;
    case 'stateRemoved':
      return `${n.fighter(ev.targetId)} perd l'état « ${n.state(ev.stateId)} ».`;
    case 'buffAdded':
      return `${n.fighter(ev.targetId)} reçoit un effet de ${n.spell(ev.spellLevelId)} (effet ${ev.effectId}, valeur ${ev.value}, ${
        ev.duration < 0 || ev.duration >= 63 ? 'permanent' : ev.duration === 0 ? 'reste du tour' : `${ev.duration} tour(s)`
      }${ev.delay > 0 ? `, dans ${ev.delay} tour(s)` : ''}).`;
    case 'buffRemoved':
      return `${n.fighter(ev.targetId)} perd un effet (effet ${ev.effectId}, ${ev.reason}).`;
    case 'markAdded':
      return `${n.fighter(ev.casterId)} pose une marque de ${n.spell(ev.spellLevelId)} (${ev.cellCount} cases).`;
    case 'markRemoved':
      return `Une marque disparaît (${ev.reason}).`;
    case 'choice':
      return ev.scope === 'global'
        ? `Choix d'équipe proposé (liste ${ev.choiceListId}).`
        : `Choix proposé à ${n.fighter(ev.fighterId)} (liste ${ev.choiceListId}).`;
    case 'spellLearned':
      return `${n.fighter(ev.fighterId)} apprend ${n.spell(ev.spellLevelId)}.`;
    case 'spellForgotten':
      return `${n.fighter(ev.fighterId)} oublie ${n.spell(ev.spellLevelId)}.`;
    case 'effectIgnored':
      return `Effet ${ev.effectId} (${ev.handler}) de ${n.spell(ev.spellLevelId)} ignoré : ${ev.reason}.`;
    case 'triggered':
      return `Déclenchement (${tokenLabel(ev.token, n)}) : effet ${ev.effectId} de ${n.spell(ev.spellLevelId)} sur ${n.fighter(ev.carrierId)}.`;
    case 'intercepted':
      return `${n.fighter(ev.interceptorId)} intercepte les dommages destinés à ${n.fighter(ev.targetId)}.`;
    case 'turnCancelled':
      return `Le tour de ${n.fighter(ev.fighterId)} est annulé (${ev.reason}).`;
    case 'markTriggered': {
      const who = n.fighter(ev.fighterId);
      const what = n.spell(ev.spellLevelId);
      switch (ev.reason) {
        case 'enter':
          return `${who} entre dans la zone de ${what}.`;
        case 'exit':
          return `${who} sort de la zone de ${what}.`;
        case 'turnStart':
          return `${what} agit sur ${who} au début de son tour.`;
        case 'turnEnd':
          return `${what} agit sur ${who} à la fin de son tour.`;
        case 'glyph':
          return `${who} déclenche ${what}.`;
      }
      return '';
    }
    case 'waveSpawned': {
      const who = ev.fighterIds.map((id, i) => `${n.fighter(id)} (case ${ev.cells[i]})`).join(', ');
      return `Vague ${ev.wave} : ${who}.`;
    }
    case 'giftSpawned':
      return `Un cadeau apparaît sur la case ${ev.cell}.`;
    case 'objectiveActivated':
      return `Objectif en cours : « ${ev.name} » (palier ${ev.tier}).`;
    case 'objectiveCompleted':
      return `Objectif n° ${ev.count} réussi : « ${ev.name} » — chaque joueur apprend son sort suivant.`;
    case 'objectiveInfo':
      return ev.message;
    case 'choiceResolved':
      return ev.fighterId >= 0 ? `${n.fighter(ev.fighterId)} choisit : ${ev.label}.` : `Vote de l'équipe : ${ev.label}.`;
    case 'fightEnded':
      return ev.winner === 'players'
        ? `Victoire ! (${ev.reason})`
        : ev.winner === 'monsters'
          ? `Défaite : ${ev.reason}.`
          : `Fin du combat : ${ev.reason}.`;
    case 'info':
      return ev.message;
  }
}
