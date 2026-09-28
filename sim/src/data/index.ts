/** Module « données » : types des données consolidées et de la configuration, chargement et accès. */
export * from './types';
export {
  defaultConfig,
  gameData,
  getConfigValue,
  getSpellLevel,
  getSpellLevelByGrade,
  isConfigRef,
  loadConfig,
  loadGameData,
  resolveConfigRef,
  rollBounds,
  validateConfig,
} from './load';
