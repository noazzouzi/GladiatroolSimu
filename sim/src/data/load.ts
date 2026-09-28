/**
 * Chargement typé des données consolidées et de la configuration.
 *
 * Les deux fichiers JSON sont importés directement (import d'attributs `type: 'json'`) : cela fonctionne avec
 * Node 22 + tsx, avec vitest et avec un bundler (Vite) côté navigateur, sans I/O explicite.
 * Les données ne doivent pas être modifiées par les consommateurs (elles sont partagées) ; la configuration par
 * défaut est gelée et `loadConfig` renvoie toujours une copie neuve.
 */
import rawData from '../../data/gladiatrool.data.json' with { type: 'json' };
import rawConfig from '../../config/default.config.json' with { type: 'json' };
import type {
  ConfigOverrides,
  ConfigRef,
  EffectData,
  GameData,
  ParamDoc,
  SimConfig,
  SpellLevelData,
} from './types';

/** Données consolidées du Gladiatrool (partagées, en lecture seule par convention). */
export const gameData: GameData = rawData as unknown as GameData;

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) deepFreeze(v);
  }
  return obj;
}

function deepClone<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = deepClone(x);
    return out as T;
  }
  return v;
}

/** Configuration par défaut (gelée). */
export const defaultConfig: Readonly<SimConfig> = deepFreeze(deepClone(rawConfig as unknown as SimConfig));

/** Renvoie les données du jeu (même objet à chaque appel). */
export function loadGameData(): GameData {
  return gameData;
}

// ---------------------------------------------------------------------------------------------
// Accès aux sorts
// ---------------------------------------------------------------------------------------------

/** Niveau de sort par identifiant ; lève une erreur si absent. */
export function getSpellLevel(spellLevelId: number, data: GameData = gameData): SpellLevelData {
  const lvl = data.spells[String(spellLevelId)];
  if (!lvl) throw new Error(`Niveau de sort inconnu : ${spellLevelId}`);
  return lvl;
}

/** Niveau de sort d'un sort pour un grade donné (grade 1 = premier niveau). */
export function getSpellLevelByGrade(spellId: number, grade: number, data: GameData = gameData): SpellLevelData {
  const levels = data.spellIndex[String(spellId)];
  const id = levels?.[grade - 1];
  if (id === undefined) throw new Error(`Sort ${spellId} : grade ${grade} inconnu`);
  return getSpellLevel(id, data);
}

/**
 * Bornes du jet d'un effet (`SpellEffectTranslator.getMinRoll/getMaxRoll`) :
 * min = diceNum (ou value si diceNum = diceSide = 0) ; max = diceSide si non nul, sinon min.
 */
export function rollBounds(effect: Pick<EffectData, 'min' | 'max' | 'value'>): [number, number] {
  const lo = effect.min === 0 && effect.max === 0 ? effect.value : effect.min;
  const hi = effect.max !== 0 ? effect.max : lo;
  return [lo, hi];
}

// ---------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------

export function isConfigRef(v: unknown): v is ConfigRef {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as ConfigRef).$config === 'string'
    && Object.keys(v as object).length === 1;
}

/** Valeur d'un paramètre par chemin pointé (ex. "spikes.playerTurnStartDamage"). */
export function getConfigValue(config: SimConfig, path: string): unknown {
  let cur: unknown = config;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object' || !(part in (cur as object))) {
      throw new Error(`Paramètre de configuration inconnu : ${path}`);
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Résout une valeur de données : si c'est une référence `{ $config }`, renvoie la valeur de la configuration. */
export function resolveConfigRef<T = unknown>(value: unknown, config: SimConfig): T {
  return (isConfigRef(value) ? getConfigValue(config, value.$config) : value) as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Chemins des paramètres de type objet libre (leurs sous-clés ne sont pas documentées une à une). */
function objectParamPaths(docs: Record<string, ParamDoc>): string[] {
  return Object.entries(docs).filter(([, d]) => d.type === 'object').map(([p]) => p);
}

function mergeInto(
  base: Record<string, unknown>,
  over: Record<string, unknown>,
  path: string,
  freeObjects: string[],
  errors: string[],
): void {
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const p = path ? `${path}.${k}` : k;
    if (k === '_doc') {
      errors.push('la surcharge ne doit pas contenir _doc');
      continue;
    }
    const inFree = freeObjects.some((f) => p === f || p.startsWith(`${f}.`));
    if (!(k in base) && !inFree) {
      errors.push(`paramètre inconnu : ${p}`);
      continue;
    }
    const cur = base[k];
    if (isPlainObject(v) && isPlainObject(cur)) {
      mergeInto(cur, v, p, freeObjects, errors);
    } else {
      base[k] = deepClone(v);
    }
  }
}

/**
 * Fusionne profondément une configuration partielle sur la configuration par défaut et renvoie une copie neuve.
 * Les tableaux sont remplacés (pas fusionnés) ; `null` remplace la valeur. Lève une erreur (en français) si un
 * paramètre est inconnu ou d'un type invalide (sauf `validate: false`).
 */
export function loadConfig(overrides: ConfigOverrides = {}, options: { validate?: boolean } = {}): SimConfig {
  const config = deepClone(defaultConfig) as SimConfig;
  const errors: string[] = [];
  mergeInto(
    config as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
    '',
    objectParamPaths(config._doc),
    errors,
  );
  if (options.validate !== false) errors.push(...validateConfig(config));
  if (errors.length) throw new Error(`Configuration invalide :\n- ${errors.join('\n- ')}`);
  return config;
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function checkParam(path: string, v: unknown, d: ParamDoc): string | null {
  const bad = (what: string) => `${path} : ${what} attendu, reçu ${JSON.stringify(v)}`;
  const values = d.values ?? [];
  switch (d.type) {
    case 'boolean':
      return typeof v === 'boolean' ? null : bad('booléen');
    case 'integer':
      if (!isInt(v)) return bad('entier');
      break;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return bad('nombre');
      break;
    case 'integer|null':
      if (v !== null && !isInt(v)) return bad('entier ou null');
      break;
    case 'enum':
      return values.includes(v as string) ? null : bad(`une valeur parmi ${JSON.stringify(values)}`);
    case 'enum[]':
      if (!Array.isArray(v) || !v.every((x) => values.includes(x))) return bad(`une liste de ${JSON.stringify(values)}`);
      if (d.minLength !== undefined && v.length < d.minLength) return bad(`au moins ${d.minLength} éléments`);
      if (d.maxLength !== undefined && v.length > d.maxLength) return bad(`au plus ${d.maxLength} éléments`);
      return null;
    case 'integer[]':
      return Array.isArray(v) && v.every(isInt) ? null : bad("une liste d'entiers");
    case 'list':
      return Array.isArray(v) && v.every((x) => isInt(x) || values.includes(x))
        ? null
        : bad(`une liste d'entiers ou de ${JSON.stringify(values)}`);
    case 'object':
      return isPlainObject(v) ? null : bad('objet');
    default:
      return `${path} : type de paramètre inconnu ${String((d as ParamDoc).type)}`;
  }
  if (typeof v === 'number') {
    if (d.min !== undefined && v < d.min) return bad(`une valeur ≥ ${d.min}`);
    if (d.max !== undefined && v > d.max) return bad(`une valeur ≤ ${d.max}`);
  }
  return null;
}

function leafPaths(obj: Record<string, unknown>, prefix: string, out: string[]): string[] {
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_doc') continue;
    const p = prefix ? `${prefix}.${k}` : k;
    if (isPlainObject(v)) leafPaths(v, p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Vérifie une configuration complète à l'aide du bloc `_doc` : chaque paramètre documenté existe et a le bon type,
 * chaque paramètre présent est documenté. Renvoie la liste des erreurs (vide si tout va bien).
 */
export function validateConfig(config: SimConfig): string[] {
  const docs = config._doc ?? defaultConfig._doc;
  const errors: string[] = [];
  const free = objectParamPaths(docs);
  for (const p of leafPaths(config as unknown as Record<string, unknown>, '', [])) {
    if (free.some((f) => p.startsWith(`${f}.`))) continue;
    if (!docs[p]) errors.push(`${p} : paramètre non documenté`);
  }
  for (const [p, d] of Object.entries(docs)) {
    let v: unknown;
    try {
      v = getConfigValue(config, p);
    } catch {
      errors.push(`${p} : paramètre manquant`);
      continue;
    }
    const err = checkParam(p, v, d);
    if (err) errors.push(err);
  }
  return errors;
}
