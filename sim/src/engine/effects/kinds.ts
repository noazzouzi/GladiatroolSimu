/**
 * Familles de gestionnaires (sans dépendance, pour éviter les cycles d'import) :
 * - ONCE_HANDLERS : appliqués une seule fois par effet, sans cible, même si la zone est vide (téléportation du lanceur,
 *   invocation, pose de marque, choix d'équipe) ;
 * - DURABLE_HANDLERS : posent un buff et gèrent eux-mêmes le délai (``delay``) ; pour les autres gestionnaires, un effet
 *   à délai est posé comme buff 'delayed' et exécuté à la fin du délai par l'étape « tours ».
 */
export const ONCE_HANDLERS: ReadonlySet<string> = new Set([
  'teleport',
  'summon',
  'glyphTurnStart',
  'glyphTurnEnd',
  'glyphAura',
  'glyphImmediate',
  'globalChoice',
]);

export const DURABLE_HANDLERS: ReadonlySet<string> = new Set([
  'statBuff',
  'setState',
  'disableState',
  'receivedDamageMultiplier',
  'shield',
  'hpThreshold',
  'spellBaseDamageBonus',
  'passTurn',
  'turnDuration',
]);
