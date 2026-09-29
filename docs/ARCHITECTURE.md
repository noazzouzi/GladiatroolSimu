# Architecture du simulateur du Gladiatrool

Document de référence des modules de `sim/` (TypeScript strict, ESM). Chaque module a sa section : responsabilités,
API publique, choix de conception, limites, correspondance avec `research/ETUDE_GLADIATROOL.md` (« ÉTUDE ») et
`research/notes/70_formules_dofus.md` (« N70 »).

Arborescence : `sim/src/{data,geometry,engine,scenario,ai,planner,runner,analysis,cli}`, données générées dans
`sim/data/`, configuration dans `sim/config/`, tests dans `sim/test/`.

### Vue d'ensemble des modules

| Module | Rôle | Dépend de |
|---|---|---|
| `data` | Types et chargement des **faits** (`sim/data/gladiatrool.data.json`) et des **hypothèses** (`sim/config/default.config.json`), tous deux générés par `tools/simdata/build_sim_data.py` | — |
| `geometry` | Géométrie DOFUS pure : repère, LdV, zones, cases de lancer, chemins, poussées | — |
| `engine` | Machine à états du combat, pilotée par les données : interprète les niveaux de sort (un gestionnaire par effectId), PRNG à graine, journal d'événements, choix en attente (`pendingChoice`) | `data`, `geometry` |
| `scenario` | Déroulé scripté côté serveur : timeline, vagues, cadeaux, fenêtres de choix, objectifs, arrivée de la Mama, victoire | `data`, `engine` |
| `ai` | IA des monstres : contrôleurs (profils de `config.ai`, utilité paramétrée), mode anticipation, estimation de menace | `data`, `geometry`, `engine`, `scenario` (types) |
| `planner` | Recherche des meilleures actions des joueurs (beam search sur copies de l'état, anticipation des tours des monstres, explications en français), politiques de choix (Acclamations, cadeaux, votes) | `geometry`, `engine`, `scenario`, `ai` (IA d'anticipation par défaut, injectable) |
| `runner` | Combat complet piloté (`runFight` : résultat, journal, trace rejouable), situations JSON, expériences Monte Carlo (statistiques, multi-cœurs en Node), bench, carte ASCII | tous (sans API Node, sauf `nodeExperiment.ts` / `nodeWorker*`) |
| `analysis` | Analyse a posteriori des combats (rejeu de trace : par tour, sorts, mises en pics, vagues), campagnes d'expériences du rapport `docs/RESULTATS.md`, tableaux Markdown | `runner`, `data` (sans API Node ; exécution dans `cli/campaign.ts`) |
| `cli` | Interface en ligne de commande française (`carte`, `simuler`, `planifier`, `comparer`, `bench`) | `runner`, `planner`, Node |

Principe : les **faits** (données du client, observations consolidées) ne contiennent jamais la valeur d'une
hypothèse ; ils la **référencent** (`{ "$config": "chemin" }`) et la configuration porte la valeur par défaut et ses
alternatives, pour pouvoir mesurer la sensibilité d'un résultat à chaque hypothèse.

---

## Données (`sim/src/data/`, `sim/data/`, `sim/config/`, `tools/simdata/`)

### Rôle

Produire et charger, typées, les **données consolidées** du simulateur : carte, règles du moteur, catalogue des
effets, états, niveaux de sort, archétypes, monstres, boss, scénario et valeurs de référence, plus la
**configuration** de toutes les hypothèses non tranchées. Spécification suivie : `research/SPEC_DONNEES_SIMULATEUR.md`
(§1–§13) ; faits : ÉTUDE, hypothèses : `research/QUESTIONS_OUVERTES.md`.

### Génération (`tools/simdata/build_sim_data.py`, `npm run build:data`)

Python 3 (stdlib), déterministe (aucun horodatage de génération : deux exécutions donnent des fichiers identiques
octet pour octet ; `--check` compare sans écrire et échoue en cas d'écart, contrôle aussi exécuté par
`sim/test/data.test.ts`). Entrées en lecture seule :

- `research/raw/dofusdb/*.json` (sorts, niveaux, états, monstres, effets, classification des paramètres d'effets
  de `provenance.json`) ;
- `research/data/*.json` (carte `map_139988488.json`, annotations VOD `map_annotations.json`, archétypes,
  `monsters.json`, `fight_scripts.json`, `effects_semantics.json`, `action_ids_dofus3.json`) ;
- implémentations de référence `tools/mechanics/zones.py` (normalisation des zones), `damage.py` (éléments,
  « boostable », bornes des jets), `tools/map/mapgeom.py` (coordonnées, voisins).

Environ 160 assertions : chiffres de l'ÉTUDE (241 / 96 / 145 cases, profondeurs de bord, cases spéciales), cohérence
données brutes ↔ fichiers de recherche (ordre d'obtention, améliorations, Acclamations, uniques, stats des monstres,
script de la Mama), valeurs de référence recalculées depuis les sorts (T1, T2, T3, T4, T8, T11, T12, T13, T16),
fermeture des sous-sorts, existence de chaque état, monstre, niveau et paramètre `$config` référencé, typage de chaque
paramètre de configuration. Taille : données ≈ 0,7 Mo, configuration ≈ 26 Ko ; un enregistrement par ligne pour les
sorts, les cases et les états (diffs lisibles).

### Contenu de `sim/data/gladiatrool.data.json`

| Section | Contenu | ÉTUDE / SPEC |
|---|---|---|
| `meta` | versions (jeu 3.6.12.16, bêta 3.7.2.2), date d'extraction DofusDB, sources (empreintes), légende des statuts, conventions, comptes | SPEC §2 |
| `map` | 560 `cells` {id, x, y, walkable (jouable en combat), los, spikes, edgeDepth, neighbours} ; `playable` (241) ; `spikes` {cells (96), rawList (102), listedNotWalkable} ; `startCells` 286/287/314/315 ; `center` 300 ; `bossWaitCell` 152 ; `giftCells` ; `losBlocking` | §3, SPEC §3 |
| `rules` | constantes et formules non contestées (LdV, cases de lancer, zones et dégressivité, ordre des cibles, pipeline des dégâts, critique, 1163, poussée et collision, durées, début/fin de tour, aura 1091, lanceurs des sous-sorts, tacle désactivé) | §9, SPEC §4 |
| `effects` | 74 effectId utilisés : action DOFUS 3, libellé, `category`, `handler` (gestionnaire du moteur), `v1` (`must`/`noop`), `stat`+`sign` (bonus/malus), `executor` (sous-sorts), élément, `boostable`, sens des paramètres | §9, SPEC §5 |
| `states` | 91 états (référencés par les sorts + liste « indispensables ») : `stateEffects`, drapeaux, note | SPEC §6 |
| `spells` | 369 niveaux de sort (259 sorts), clé = spellLevelId : `family`, `owner`, `cast.*`, `effects[]`, `critEffects[]` normalisés | §4–§6, SPEC §7 |
| `spellIndex` | spellId → niveaux par grade | SPEC §7 |
| `archetypes` | acrobate / dompteur / magicien : stats de base, passif, sort commun et de départ, 8 emplacements (ordre d'obtention, niveau du Spell Manager), 7 améliorations, 7 uniques, 6 Acclamations exactes, variantes de PV, `onObtain` | §4, SPEC §8 |
| `monsters` | 7981, 7982, 7983, 7984, 7985, 7986 et 7980 (corps des joueurs) : stats, drapeaux, sorts, sort de départ, passifs, profil d'IA | §5, SPEC §9 |
| `boss` | script de la Mama : attente, arrivée (délai 7 → T8, case 300, repli en config), Rassemblement (X63, étapes, lignes de poussée), invulnérabilité (EON5902), Faveur (+25 %, −5 %), mort | §6, SPEC §10 |
| `scenario` | `timeline` (début de combat, séquence du tour global), entité de scénario `Sce`, `waves` V1–V10, `gifts`, `bonuses` (Acclamations), `choices` (16, 17, 10, 11–15), `objectives` (gestionnaire + 21 objectifs déclaratifs), `victory`, `defeat` | §2, §7, §8, SPEC §11 |
| `tests` | valeurs de référence T1–T16 structurées (source et statut) | SPEC §13 |

Normalisation d'un effet (`EffectData`) : `order`, `effectId`, `exec` (= `!forClientOnly` ; **seuls les effets
`exec` sont appliqués**), `min`/`max`/`value` = `diceNum`/`diceSide`/`value` bruts (bornes du jet : `rollBounds`),
`element`, `targetMask` brut et `mask` analysé {`include` (lettres), `exclude` (conditions {key, value, onCaster}
reconnues par le motif « exclusif » du client), `camp` (`Atq`/`Def`/`Sce`)}, `triggers[]`, `duration`, `delay`,
`triggerDuration`, `dispellable`, `zone` (valeurs de `SpellZone.from_zone_descr` : directement utilisables par
`SpellZone.fromZoneData` du module géométrie), `subSpell` {spellId, grade, spellLevelId}, `stateId` (950/951/952),
`summon` (181). Règles de `subSpell` : sous-sorts et glyphes → spellId = min, grade = max, niveau résolu ;
3405/3406 → `value` = niveau ; 406, 293, 2018 → spellId seul (grade et niveau `null`).

Fermeture des sorts : racines = sorts des archétypes (de base, améliorés, uniques, cartes « Amélioration : X »,
Acclamations, choix d'archétype, passif 30639), des monstres et de la Mama, du scénario (30390, 30443, 30566, 30657,
30658, 30626, 30710, 30577, 30700/30701, 30754), les 21 objectifs, 30624 et 30420 (jamais référencés : posés par le
serveur) ; puis fermeture récursive par toutes les références de sorts des effets (y compris les effets d'affichage,
pour que toute référence soit résoluble). Les autres attractions de la Foire (dagues, larves) sont exclues par
assertion ; les compteurs génériques 30457–30461 et les maquettes 30427/30519, jamais référencés, ne sont pas inclus.

### Configuration (`sim/config/default.config.json`)

Tous les paramètres de SPEC §12 et de `QUESTIONS_OUVERTES.md` (sections `timeline`, `ai` (dont `profiles` par type
de monstre), `spikes`, `spawn`, `boss`, `objectives`, `bonuses`, `gifts`, `spells`, `archetypes`, `victory`, `map`),
plus les paramètres du moteur : `rng.seed`, `rng.rollMode` (`random`/`average`/`min`/`max`), `rng.critMode`
(`random`/`never`/`always`), `rng.rollDistribution` (Q22 : `uniform`/`clientPreview`), `engine.eventLog`,
`engine.maxSubSpellDepth`, `engine.subSpellsIgnoreCastConditions`, `engine.pushLevelForArchetypes` (et, ajoutés à
l'étape « moteur — noyau » : `rng.rollPerTarget`, `engine.removeBuffsOfDeadCaster`,
`engine.unshakableBlocksCasterAdvance` ; à l'étape « moteur — buffs… » : `engine.firstTurnDecrementSkip`,
`engine.turnStartTriggersBeforeDecrement`, `engine.dispelGlyphsTriggeringMarkOnly` ; à l'étape « Scénario » :
`timeline.deadPlayersKeepSlot`).
Le bloc `_doc` documente chaque paramètre par son chemin pointé : `type` (`boolean`, `integer`, `number`,
`integer|null`, `enum`, `enum[]`, `integer[]`, `list`, `object`), `values` admises, `alternatives`, `question` (Qn),
`status` (V/R/Robs/H/engine), `source`, `why`, bornes éventuelles. Il sert aussi à la validation.

### API publique (`sim/src/data/index.ts`)

- Types (`types.ts`) : `GameData` et toutes ses sections (`MapData`, `CellData`, `RulesData`, `EffectCatalogEntry`,
  `StateData`, `SpellLevelData`, `CastData`, `EffectData`, `ZoneData`, `MaskData`, `SubSpellRef`, `ArchetypeData`,
  `MonsterData`, `BossData`, `ScenarioData`, `WaveData`, `ObjectiveData` et l'union `ObjectiveCondition`…),
  `SimConfig`, `ConfigOverrides` (partiel profond), `ParamDoc`, `ConfigRef`. Les énumérations existent aussi comme
  tableaux `as const` pour la validation à l'exécution (`EFFECT_HANDLERS`, `STAT_KEYS`, `ZONE_SHAPES`,
  `SPELL_FAMILIES`, `OBJECTIVE_EVENTS`, `OBJECTIVE_IDS`, `ARCHETYPE_KEYS`…).
- `gameData: GameData` (import JSON direct, attribut `type: 'json'` : Node 22/tsx, vitest et Vite) ;
  `loadGameData()`. Partagé : **ne pas le modifier** (le moteur précalcule ses propres structures).
- `defaultConfig` (gelée) ; `loadConfig(overrides?, { validate? })` : fusion profonde sur une copie neuve (tableaux
  remplacés, `null` accepté), erreur en français si un paramètre est inconnu ou mal typé ; `validateConfig(config)` →
  liste d'erreurs ; `getConfigValue(config, "a.b.c")` ; `isConfigRef(v)` et `resolveConfigRef(v, config)` pour les
  champs `{ $config }` des données.
- `getSpellLevel(id)`, `getSpellLevelByGrade(spellId, grade)`, `rollBounds(effect)` → [min, max].

### Choix et écarts documentés

- `walkable` = jouable en combat (`fightWalkable`) : 152 (attente de la Mama) est non jouable ; le moteur y place la
  Mama sans passer par les règles de déplacement.
- Les zones stockent les valeurs **normalisées** du client (P → rayon 0 ; I, O, R ajustés) ; pour la forme `;`, rayon
  et dégressivité sont les valeurs par défaut du client (sans effet : aucun malus pour `;`).
- Élément d'un effet : table du client (`damage.element_of`), sinon `effectElement` des données (ex. 1118).
- Niveau 80750 (« Amélioration : Jaillissement ») absent des données : l'effet 3405 garde `spellLevelId: 80750` avec
  `missing: true` et `substituteSpellLevelId: 80760` ; l'archétype indique `to: 80760` et `brokenIf` →
  `spells.jaillissementUpgradeBroken`.
- Acclamations : l'effet propre de la carte est d'affichage, seul l'accumulateur (`realSpellLevel`) applique le bonus
  (pas de double application dans les données ; option `bonuses.doubleApplication`).
- Logique serveur absente des données client, isolée et paramétrée : sort de départ de l'emplacement 1
  (`startingSpellSource: 'server'`), montée de Relâchement de Fureur (`archetypes.dompteur.onObtain`, config
  `spells.relachementGrowthStart`), vagues (cases observées pondérées par type, `spawn.*`), timeline (`timeline.*`),
  contenu des choix (`bonuses.*`, `gifts.*`, `objectives.*`), repli d'arrivée de la Mama (`boss.arrivalFallback`),
  objectifs codés de façon déclarative (les sorts-compteurs restent dans `spells` pour la traçabilité).
- Vagues : `candidatesByType` = candidats observés de la vague ∩ emplacements du type (`slotsByType` de la VOD),
  poids = nombre de combats ; `unassigned` = candidats sans type ; `slotsByType` de la vague = emplacements
  structurels (mode `structured_slots`) ; V2/V3 ont en plus `groups` (une case par groupe, N40 §4.3) ;
  `observed` = cases relevées combat par combat (tests statistiques).
- Pas de modèle simplifié `sim` ni de tables `expected` par sort (SPEC §7.1, optionnels) : le moteur interprète les
  effets ; les valeurs de référence sont dans `tests`.

### Limites

- Les masques `Atq`/`Def`/`Sce` et les jetons `CAP`, `XPD`, `TR#` sont stockés tels quels ; leur lecture reste une
  hypothèse (Q36) documentée dans `rules` et `_prov`.
- Les profils d'IA de la configuration (`ai.profiles`) sont des ordres de priorité déclaratifs (N20 §9) : leur
  interprétation (`when`) revient au module `ai`.
- Pas de JSON Schema séparé (SPEC §0.6) : les types TypeScript et les tests d'invariants (`sim/test/data.test.ts`)
  en tiennent lieu.

### Correspondance avec l'ÉTUDE

| ÉTUDE | Données |
|---|---|
| §2 Déroulé, timeline, vagues, victoire | `scenario.timeline`, `scenario.waves`, `scenario.victory`, config `timeline.*`, `spawn.*`, `victory.*` |
| §3 Carte | `map` |
| §4 Archétypes, Acclamations | `archetypes`, `spells` (familles `archetype`, `upgraded`, `unique`, `choice`, `acclamation`) |
| §5 Monstres, IA | `monsters`, config `ai.*` |
| §6 Boss | `boss`, config `boss.*` |
| §7 Objectifs | `scenario.objectives`, config `objectives.*` |
| §8 Cadeaux | `scenario.gifts`, config `gifts.*` |
| §9 Formules | `rules`, `effects` |
| §11 Contradictions | config (`_doc` : question, statut, source) |

---

## Géométrie (`sim/src/geometry/`)

### Rôle

Toute la géométrie de combat DOFUS, sans notion de combattant ni d'état : repère des cellules, directions,
distances, ligne de vue, zones d'effet, cases de lancer, déplacements volontaires (cases atteignables, chemins,
tacle) et déplacements forcés (poussée, attirance, collisions, téléportation « première case libre »).

C'est un **port exact** des implémentations Python de référence, elles-mêmes portées du client DOFUS 2.73.3
(`mapTools.MapTools`, `SpellZone`, `LosDetector`, `PushUtils`, `TargetManagement`, `TackleUtil`…) et reprises à
l'identique par DOFUS 3 :

| Python de référence | Port TypeScript |
|---|---|
| `tools/mechanics/geometry.py`, `tools/map/mapgeom.py` | `grid.ts`, `los.ts`, `castCells.ts` |
| `tools/mechanics/zones.py` | `zones.ts` |
| `tools/mechanics/movement.py` | `path.ts`, `push.ts` |
| (données de carte) `research/data/map_139988488.json` | `mapGrid.ts` (adaptateur) |

Le module n'a aucune dépendance et aucune entrée/sortie. L'occupation des cases est fournie par **prédicat**
(`CellPredicate = (cell) => boolean`) : le moteur la tire de son état (tableau typé d'occupation) sans que la
géométrie connaisse sa structure.

### Conventions (ÉTUDE §3.2, N70 §1)

- `cellId = row × 14 + col`, 560 cellules ; repère MapPoint `x = (row+1)>>1 + col`, `y = col − (row − (row+1)>>1)` ;
  centre de l'arène 300 = (17, −4).
- Directions 0..7 = E, SE, S, SW, W, NW, N, NE ; vecteurs identiques à `rules.directions.vectors` du SPEC.
  - **Axes** (impaires 1, 3, 5, 7 ; « orthogonales » dans le client) : un pas = distance 1 (déplacement, croix `X`,
    lancer en ligne). Constante `AXIS_DIRECTIONS`, test `isAxisDirection`.
  - **Diagonales** (paires 0, 2, 4, 6 ; « cardinales » dans le client, horizontales/verticales à l'écran) : un pas =
    distance 2. Constante `DIAGONAL_DIRECTIONS`, test `isDiagonalDirection`.
- Distance DOFUS = Manhattan en MapPoint (`distance`) ; `chebyshevDistance` pour les carrés.
- `-1` (`INVALID_CELL`) = hors carte, partout.

### API publique (import : `sim/src/geometry/index.ts`)

**`grid.ts`** — tables précalculées au chargement (`CELL_X`, `CELL_Y` : `Int8Array` ; `NEXT_CELL` : `Int16Array`
560 × 8 ; voisins 4/8 ; table coordonnée → cellule).

- Conversions : `isValidCell`, `isValidCoord` (test exact du client), `cellToXY`, `xyToCell`, `cellX`, `cellY`,
  `cellToRowCol`, `rowColToCell`, `cellToPixel`.
- Relations : `distance`, `chebyshevDistance`, `areAdjacent`, `inLine`, `inDiagonal`, `isAligned`, `symmetricCell`.
- Voisinage : `nextCell(cell, dir)`, `cellInDirection(cell, dir, n)`, `cellsInDirection(cell, dir, max?)`,
  `neighbours4` (ordre 1, 3, 5, 7), `neighbours8` (ordre 0..7), `neighbours(cell, dirs)`.
- Orientations (cas limites compris) : `dir4`, `dir4Exact`, `dir4Diag`, `dir4DiagExact`, `dir8Exact`, `dir8` et leurs
  variantes `…ByCoord`. `dir8Exact(lanceur, cible)` oriente toutes les zones directionnelles (−1 si non aligné).
- Directions : `oppositeDirection`, `isValidDirection`, `DIRECTION_NAMES`, `DIRECTION_LABELS_FR` (journaux).

**`mapGrid.ts`** — `class MapGrid` (immuable, partagée par tous les états) :

- construction : `new MapGrid(cells, mapId?)` avec `cells: {id, walkable, los?, spikes?}[]` ;
  `MapGrid.fromMapData(map)` (section `map` de `sim/data/gladiatrool.data.json`) ;
  `MapGrid.fromResearchMap(json)` (adaptateur `research/data/map_139988488.json` : `walkable = fightWalkable`,
  `spikes = glyph ∧ fightWalkable`) ; `MapGrid.fromSets({walkable, losBlocking?, spikes?})` ; `MapGrid.open()` ;
- requêtes (fonctions fléchées, passables directement comme prédicats) : `isWalkable`, `blocksLos`, `hasLosFlag`,
  `isSpike` ; `isFree(cell, isOccupied)`, `freePredicate(isOccupied)`, `edgeDepth(cell)` (distance au bord,
  identique au champ `edgeDepth` des données) ; masques `walkableMask`, `losBlockMask`, `spikeMask` ; listes
  `walkableCells`, `spikeCells`.
- Aides : `maskPredicate(mask)`, `setPredicate(cells)`.

**`los.ts`** (ÉTUDE §9.1, N70 §2)

- `computeCellsBetween(a, b)` : `getCellsIdBetween` exact (a exclue, b incluse, pas diagonal au passage exact par un
  coin, tolérance 1e-4) ; `lineBetween(a, b)` : même chose via un cache paresseux partagé (`Int16Array`, ne pas
  modifier) ; `cellsBetween` : copie.
- `hasLineOfSight(from, to, entityBlocks?, mapBlocks?)` : la carte bloque sur toutes les cases de la ligne (cible
  comprise) ; une entité ne bloque que sur les cases **intermédiaires**. `gridLineOfSight(grid, from, to, entityBlocks)`.
- `losCells(origin, candidates, …)` : algorithme « liste » du client (tri par distance + cache) ; même ensemble que
  `hasLineOfSight` (vérifié), conservé pour la fidélité de l'ordre de sortie.

**`zones.ts`** (ÉTUDE §9.3, N70 §3) — `class SpellZone` :

- construction : `SpellZone.fromZoneDescr(zoneDescr)` (données DofusDB, inversion des paramètres de `l`, valeurs par
  défaut du client), `SpellZone.fromRaw('C2,1')` (rawZone client), `SpellZone.fromZoneData(z)` (zone déjà normalisée
  de `sim/data`), `new SpellZone({...})` (sans normalisation) ;
- `cells(target, caster)` = `getCells` : liste **ordonnée** comme le client (affichage, téléportation « première case
  libre »). Comme le client, peut contenir `-1` pour quelques formes près des bords (cône `V`, centres de `U`/`B`/`X`) :
  `validZoneCells` filtre ;
- `contains(cell, target, caster)` = `isCellInZone` (**c'est lui qui choisit les cibles**) ; `containedCells` ;
- `aoeMalus(target, caster, cell)` = `getAoeMalus` (distance selon la forme : Manhattan, Chebyshev `GRW`,
  Manhattan>>1 `#+-/U`, projection `FV`, 0 pour `;AIa` ; aucun malus si rayon > 50) ; `efficiency` = 1 − malus/100
  si rayon ≥ 1 ;
- les 27 formes : `P C I O D L / l X Q + # * T - V F G W R U B Z A a ;` et la forme vide ` ` ; une lettre inconnue
  devient `P` (comme le client).

**`castCells.ts`** (ÉTUDE §9.2, N70 §2.3)

- `rangeCells(origin, min, max, inLine, inDiagonal)` : losange / croix d'axes / croix diagonale (r = pas diagonaux) /
  étoile, **même ordre** que le client ; `isInCastRange` : même test sans énumération.
- `effectiveMaxRange(spec, bonus)` : `range + bonus` si `rangeCanBeBoosted`, au moins `minRange`.
- `castCells(grid, origin, spec, opts)` et `canCastOn(grid, origin, target, spec, opts)` : filtres LdV
  (`castTestLos`), `needFreeCell`, `needTakenCell`, `needVisibleEntity`, case marchable (`requireWalkable`, défaut
  vrai). `spec` reprend les noms des champs des niveaux de sort DofusDB (`minRange`, `range`, `castInLine`…) ;
  `castSpecFromCastData` adapte le `CastData` de `sim/data`.

**`path.ts`** (N70 §6, ÉTUDE §9.11)

- `reachableCells(grid, start, mp, isOccupied, {avoidSpikes?})` → `Reachability` : `cells` (ordre BFS du client,
  départ en tête), `cost(c)`, `path(c)` (départ exclu), `spikeCells(c)`, `endsInSpikes(c)`, `crossesSpikes(c)`,
  `touchesSpikes(c)`. BFS 4-connexe sur cases jouables libres ; les pics ne bloquent pas.
  Avec `avoidSpikes` : programmation dynamique par nombre de pas, qui minimise (cases de pics sur le chemin, longueur)
  dans la limite des PM (extension du port Python, validée contre une énumération exhaustive).
- `shortestPath(grid, start, goal, isOccupied, {avoidSpikes?})` (départ compris, `null` si inatteignable ; variante
  Dijkstra lexicographique), `walkDistances(grid, start, isOccupied, maxDist?)`.
- Tacle (désactivé dans le Gladiatrool par l'état 5970, mais fourni) : `evadeRatio(fuite, tacles, intaclable?)`,
  `tackleLosses(pm, pa, ratio)`, `walkWithTackle(path, pm, pa, ratioAt)`.

**`push.ts`** (ÉTUDE §9.9, N70 §5)

- `pushDirection(lanceur, caseCiblée, cible, allowSameCell?)` / `pullDirection` : depuis le lanceur si la cible est
  sur la case ciblée, sinon depuis la case ciblée ; diagonale exacte → direction paire, sinon axe dominant.
- `computeForcedMove(grid, isOccupied, {kind, casterCell, targetedCell, targetCell, force, fromCell?, stopAt?})`,
  `kind ∈ push | pull | advance | retreat` → case finale, cases parcourues, pas demandés (`ceil(n/2)` en diagonale),
  reste (`remainingSteps`, `remainingForDamage` doublé en diagonale), cause d'arrêt (`COLLISION`, `COMPLETE`,
  `ACTIVE_OBJECT` pour un piège/mur), case percutée, **chaîne de collision** (`collisionChain`), indicateurs de pics.
  Un pas diagonal exige les deux cases latérales libres ; les glyphes (pics) n'arrêtent pas.
- `collisionDamage(reste, niveau, DoPou, RéPou, index, pacifiste)` =
  `max(0, int(reste × (floor(niv/2) + 32 + DoPou − RéPou) / (4 × 2^index)))` ; `collisionDamages(move, …)` pour la
  cible et la chaîne. Le moteur applique ces dommages (et les 1163 à déclencheur PD).
- `dragDestination`, `isPathBlocked`, `collateralCells`, `pushToEdgeDistance` (briques du client).
- `sortTargetsForEffect(caseCiblée, isPush, cells)` : ordre de traitement des cibles (`comparePositions`, ÉTUDE §9.4).
- `teleportDestination(zone, caseCiblée, lanceur, isFree)` : effet 4, case ciblée (zone `P`) ou première case libre
  de `zone.cells`.

### Choix de conception

- **Vitesse** : aucune allocation inutile dans les chemins chauds ; tables précalculées ; lignes de vue en cache
  (≈ 0,5 µs par test en cache chaud) ; zones ≈ 0,3–1 µs (`T2`, `C2`) ; poussée ≈ 0,5 µs ; `castCells` (PO 1–6,
  LdV) ≈ 35 µs ; `reachableCells` 6 PM ≈ 20 µs (≈ 30 µs en évitant les pics). Mesures Node 22 sur la carte réelle.
- **Immuabilité** : `MapGrid` et `SpellZone` ne changent pas après construction ; l'état dynamique (occupation,
  obstacles temporaires, pièges) passe par prédicats. Rien à cloner côté géométrie.
- **Fidélité avant commodité** : les bizarreries du client sont conservées (`cells` pouvant contenir −1, divergences
  `cells`/`contains` de la fourche non alignée, du boomerang et du cône en diagonale, du damier, de `l` avec rayon
  minimal ≠ 1 ; malus négatif si distance < rayon minimal).
- Positions « avant le sort » : les fonctions prennent les cases en paramètre ; c'est au moteur de passer les
  positions d'avant le sort (poussée, dégressivité) ou courantes (attirance), comme le client.

### Écarts et hypothèses (documentés)

- Les fonctions d'orientation par cellule renvoient −1 pour une cellule invalide (le Python lève une exception).
- `requireWalkable` (défaut vrai) dans `castCells` : on ne cible pas une case non marchable (hypothèse d'interface ;
  `false` reproduit `range_cells` brut). Sans effet dans l'arène pour les sorts du Gladiatrool.
- `advance` (1042) et `retreat` (1041) ne sont pas dans le port Python : modélisés comme une attirance / poussée du
  lanceur par la cible (hypothèse de port, cohérente avec N70 §5.4).
- `avoidSpikes` : extension (le client propose le plus court chemin ; le joueur peut contourner les pics avec des
  points de passage). Coût = nombre de cases de pics sur le chemin, destination comprise.
- Non interprétés ici : champs `forcedDirection`, `includeCarried`, `onlyAffectIfInSightLine` des `zoneDescr`
  (seulement 6 effets de la « Course de larves » ont `forcedDirection`, hors Gladiatrool) ; conditions d'états
  (Enraciné, Inébranlable, `canBePushed`, poussées forcées 1021/1022, pacifiste…) : vérifiées par le moteur ; portails.

### Validation croisée

- `tools/mechanics/export_geometry_fixtures.py` importe les modules Python de référence et écrit
  `sim/test/fixtures/geometry/{grid,los,zones,castCells,path,push}.json` (≈ 2,6 Mo, graine fixe ; régénérer après toute
  modification des modules Python : `python3 tools/mechanics/export_geometry_fixtures.py`).
- Tests `sim/test/geometry.*.test.ts` : conversions et voisins des 560 cases, 6 fonctions d'orientation sur 28
  origines × 560 cibles, 2 220 lignes `getCellsIdBetween`, 200 configurations de LdV × 560 cibles (carte réelle et
  cartes ouvertes avec obstacles), ≈ 2 500 évaluations de zones (toutes les formes, rayons 0..5, 8 orientations,
  bords, lanceur non aligné, 159 zoneDescr distincts de DofusDB), 420 configurations de cases de lancer (+ `canCastOn` sur les
  560 cases), 320 BFS et 320 plus courts chemins, 270 cas « éviter les pics » contre une énumération exhaustive et un
  Dijkstra Python, 1 150 poussées/attirances (chaînes, dommages, pièges), 3 000 directions de poussée, distances au
  bord (241 × 8), ordres de cibles et tacle. **Résultat : identique à la référence Python sur tous les cas.**
- `sim/test/geometry.reference.test.ts` : cas de référence sur la carte réelle — voisins de 300 (SPEC T5), 241 cases
  jouables, 96 pics (liste ÉTUDE §3.4), LdV bloquée seulement autour de 152, répartition des profondeurs de bord et
  des distances « k » au premier pic (ÉTUDE §3.8), poussée d'un Trooll depuis 300 jusqu'au bord dans les 8
  directions (arrêt dans les pics à profondeur 1, 8 pas axiaux / 6 diagonaux, SPEC T7), collisions 283 / 849 et chaîne
  566 / 283 / 141 (T8), lignes de poussée de la Mama et poussées observées (ÉTUDE §3.6), exemple chiffré Videur au
  tour 1 identique à `research/data/archetype_acrobate.json` (T6 : 242 → 199 et 358 → 402) ; intégration :
  `MapGrid.fromMapData` sur `sim/data/gladiatrool.data.json` redonne la même carte (x, y, `edgeDepth`, voisins).

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §3.2 Repère et formules | `grid.ts` |
| §3.3–3.4 Zone jouable, LdV, pics | `mapGrid.ts` (`fromResearchMap`, `isSpike`, `edgeDepth`) |
| §3.6, §3.8 Lignes de poussée, distances utiles | `push.ts` (`computeForcedMove`, `pushToEdgeDistance`), tests de référence |
| §9.1 Ligne de vue | `los.ts` |
| §9.2 Cases de lancer | `castCells.ts` |
| §9.3 Zones et dégressivité | `zones.ts` |
| §9.4 (ordre des cibles) | `push.ts` (`sortTargetsForEffect`) |
| §9.9 Poussée, attirance, téléportation | `push.ts` |
| §9.11 Tacle | `path.ts` (`evadeRatio`, `tackleLosses`, `walkWithTackle`) |

### Limites

- Pas de portails ni d'obstacles dynamiques propres (le moteur les exprime par prédicats `isOccupied` / `stopAt`).
- Les divergences `cells`/`contains` du client sont reproduites telles quelles ; le moteur doit utiliser `contains`
  pour choisir les cibles et `cells` pour les téléportations.
- L'ordre de découverte de `Reachability.cells` en mode `avoidSpikes` n'est pas l'ordre BFS du client (les coûts et
  chemins sont, eux, optimaux et vérifiés).

---

## Moteur — noyau (`sim/src/engine/`)

### Rôle

Machine à états du combat, **pilotée par les données** : elle interprète les niveaux de sort de `sim/data` (effets
ordonnés, `effectId`, masques, zones, déclencheurs, durées, sous-sorts) avec **un gestionnaire par nom de `handler`**
du catalogue `effects`. Aucun sort n'est codé en dur, hors exceptions déclarées et paramétrées (voir « Exceptions »).
Aucune entrée/sortie ; tout l'aléatoire passe par un PRNG à graine stocké dans l'état ; l'état se clone en quelques µs.

Le noyau couvre : combattants et caractéristiques, état de combat et clonage, sélection des cibles, validation des
lancers et cases ciblables, résolution d'un lancer (critique, sous-sorts), pipeline exact des dégâts / soins /
boucliers, déplacements (poussées, attirances, avance, téléportation, échange, marche) avec collisions, pose et
retrait des buffs et des états, marques au sol (stockage), choix en attente, journal d'événements. Le décompte des
durées, l'exécution des déclencheurs (TB, TE, D, X, EON#…), le comportement des glyphes / auras et le cycle de tour
sont décrits dans la section suivante (« Moteur — buffs, déclencheurs, glyphes, tours »), qui complète ce noyau.

### Fichiers

| Fichier | Contenu |
|---|---|
| `rng.ts` | `Rng` (mulberry32, état = 1 entier, `clone()` O(1)), `rollValue` (modes `random`/`average`/`min`/`max`, lois `uniform`/`clientPreview`), `criticalChance`, `rollCritical` (`random`/`never`/`always`) |
| `stats.ts` | index compacts des caractéristiques (`Stat.*`, `STAT_COUNT`), correspondance `StatKey` → index, éléments et table `ElementEnum` du client, fiche de base depuis les données |
| `formulas.ts` | **formules pures** (port exact de `tools/mechanics/damage.py`) : `senderDamage`, `receiveDamage`, `receivedMultiplier` / `multiplierApplies` (1163), `erodedDamage`, `healAmount`, `shieldAmount`, `targetBasedRaw`, `applyAoeMalus`, `computeHit` ; interface `DamageStats` (implémentée par `Fighter` et `StatsView`) |
| `fighter.ts` | `Fighter` (identité, case, PV / érosion / bouclier, `base` + `bonus`, PA/PM, états, buffs, grimoire `SpellSlot`, `CastRecord`), `createFighter`, effets d'état `SE_*`, drapeaux de monstre `FLAG_*` |
| `buffs.ts` | `Buff` (+ `clone`), `addBuff` / `activateBuff` / `removeBuff` / `removeBuffsWhere`, `refreshStates` (états effectifs, masque d'effets d'état, EON/EOFF), boucliers (`consumeShields`), `spellBaseDamageBonus` (293), `activeThreshold` (2872), `stackCount` |
| `spells.ts` | niveaux de sort compilés (`CompiledSpellLevel`, `CompiledEffect` : zone `SpellZone`, gestionnaire, bornes, élément, masque) et exceptions de configuration |
| `context.ts` | `EngineContext` partagé (données, configuration, `MapGrid`, cache des sorts, `hooks`, registre `handlers`) |
| `state.ts` | `FightState` (+ `clone`), `Mark` (glyphes/auras), `PendingChoice`, `ExtensionState`, `addFighter` |
| `events.ts` | `FightEvent` (union typée), `EventLog`, `formatEvent` (messages français), `fmtNum` |
| `triggers.ts`, `triggerQueue.ts` | `TriggerEvent` (damage, heal, death, stateOn/Off, moved, cast) et `flushTriggers` |
| `targeting.ts` | `matchesMask`, `selectTargets` (positions figées), `comparePositions` (ordre §9.4) |
| `validation.ts` | `canCast`, `checkCaster`, `checkCell`, `getCastableCells`, `isCastableCell` (raisons en français, codes `CastFailCode`) |
| `cast.ts` | `castSpell`, `resolveSpell`, `executeBuffEffect`, `recordCast`, `takeSnapshot`, `finishAction` |
| `damage.ts` | `applyDamage`, `applyHeal`, `killFighter`, `isInvulnerableTo`, `pushLevel` |
| `movement.ts` | `forcedMove` (5, 1103, 6, 1022, 1042), `teleport` / `teleportTo`, `swap`, `moveAlongPath`, `moveTo`, `placeFighter`, `notifyMove` / `flushDeferredEnters` |
| `effects/*.ts` | gestionnaires : `damageEffects` (100, 95, 89, 1048, 1092, 1118, 1123, 1223, 141), `healEffects` (3001…, 1109, 2020, 147, 1040, 2872), `buffEffects` (statBuff, 950, 951, 952, 1163, 293, 406, 132, 140, 3407), `moveEffects` (5, 1103, 6, 1022, 1042, 4, 8), `spellEffects` (sous-sorts, 3405, 3406, 3008, 3404, 181, 401/402/1091/1165, 2018, noop) ; `index.ts` (`defaultHandlers`), `kinds.ts` (`ONCE_HANDLERS`, `DURABLE_HANDLERS`) |
| `index.ts` | `createEngineContext`, `createFight`, réexports |

### API publique (import : `sim/src/engine/index.ts`)

```ts
const ctx = createEngineContext({ overrides: { rng: { seed: 7 } }, hooks: { onEnterCell, onTrigger } });
const state = createFight(ctx);                       // FightState.create(ctx, { seed?, eventLog? })
const acro = addFighter(state, { kind: 'archetype', archetype: 'acrobate' }, 314);
const trooll = addFighter(state, { kind: 'monster', monsterId: 7981 }, 242);
canCast(state, acro.id, 80507, 256);                  // { ok } ou { ok: false, code, reason (fr) }
getCastableCells(state, acro.id, 80507);              // cases ciblables (planificateur, interface)
castSpell(state, acro.id, 80507, 256);                // { ok, castId, critical } — valide, paie, résout, déclenche
moveAlongPath(state, acro.id, [300, 301]);            // marche (1 PM par pas, crochets à chaque pas)
const copy = state.clone();                           // copie indépendante (contexte partagé)
state.describeLog();                                  // messages français du journal
```

- **Contexte** : `createEngineContext({ data?, config?, overrides?, grid?, hooks? })` → `EngineContext` :
  `getSpell(id)` (compilé, en cache), `stateEffectMask(stateId)`, `stateName`, `spellName`, `hooks` (objet mutable),
  `handlers` (`Map<nom, EffectHandlerFn>`, remplaçable / complétable), `upgradeBase` (amélioré → base).
- **Combattants** : `createFighter(ctx, spec)` (spec `archetype` / `monster` / `scenario` / `custom`) puis
  `addFighter(state, spec | fighter, cell, cause?)`. Archétype : fiche `baseStats`, PV selon `archetypes.hpMode`,
  Puissance du Dompteur = `archetypes.dompteurPower` (le passif 30639 ne doit donc pas réappliquer 125 / 153 / 138 :
  `CastOptions.effectFilter`). Grimoire par défaut : sort commun + sort de départ (`spells: 'all'` pour les 8).
  `Fighter` : `stat(i)`, `hp`, `maxHp` (= base + vitalité − érosion), `erodedHp`, `shield`, `ap` / `mp` (max − utilisés),
  `range`, `hasState`, `hasStateEffect`, `unshakable`, `rooted`, `invulnerable`, `canBePushed`, `canSwitch`,
  `knowsSpell`, `castRecord`, `resetCastCounters()`, `restoreApMp()`, `turnCount` (tours commencés, incrémenté par
  l'étape « tours »), `clone()`.
- **État** : `FightState` : `fighters` (id = rang), `occupancy` (`Int16Array` 560, id + 1), `marks`, `turn`,
  `timeline` / `timelineIndex` / `activeFighterId`, `phase`, `winner`, `rng`, `rollMode` / `critMode` /
  `rollDistribution` (copiés de la configuration, modifiables sur un clone), `log`, `pendingChoices` / `pendingChoice`,
  `triggerQueue`, `scenario` et `ext` (états d'extension `{ clone() }`), `globalCooldowns`, `castDepth` ;
  `fighter(id)`, `fighterAt(cell)`, `isOccupied`, `occupiedPredicate()`, `freePredicate()`, `setCell`, `swapCells`,
  `emit`, `queueTrigger`, `newUid`, `names`, `describeLog`, `setEventLog`, `clone({ keepLog? })`.
- **Lancers** : `canCast(state, casterId, spellLevelId, cell, { requireKnown?, ignoreAp?, ignorePendingChoice? })`,
  `getCastableCells(...)`, `castSpell(state, casterId, spellLevelId, cell, { ignoreConditions?, payAp?, countCast?,
  critical?, requireKnown?, effectFilter? })`, `resolveSpell(state, caster, spell, cell, castContext)` (sans
  validation ni coût : scénario, marques, sous-sorts), `executeBuffEffect(state, buff, { triggerSourceId?,
  triggerDamage?, targetedCell?, depth?, allowDead?, fromMark? })` (effet porté par un buff : lanceur = poseur,
  cible = porteur, `originBuffUid` = buff).
- **Dégâts, soins** : `applyDamage(state, source, target, rawOutgoing, { actionId, critical?, melee?, collision?,
  pushIndex?, glyph?, erosion?, … })` → `DamageOutcome` ; `applyHeal(state, source, target, value, actionId)` ;
  `killFighter(state, f, killerId, cause)` ; formules pures dans `formulas.ts`.
- **Déplacements** : `forcedMove(state, source, moved, { kind: 'push'|'pull'|'advance', force, targetedCell,
  casterCell, targetCell, collisionDamage, forced? })`, `teleport`, `teleportTo`, `swap`, `moveAlongPath(state, id,
  path, { ignoreMp?, tackle?, ignorePendingChoice? })` → `{ ok, code?, reason?, steps, cell, interrupted }`,
  `moveTo(state, id, cell, { avoidSpikes? })`, `placeFighter`.
- **Buffs** : `addBuff`, `activateBuff` (fin de délai), `removeBuff`, `removeBuffsWhere`, `isPermanentDuration`,
  `spellBaseDamageBonus`, `activeThreshold`, `stackCount`, `consumeShields`.
- **Grimoire** : `learnSpell`, `forgetSpell`, `makeSpellSlot`.

### Points d'extension (étapes suivantes)

- `hooks.onLeaveCell(state, fighter, cell, cause)` puis `hooks.onEnterCell(state, fighter, cell, from, cause)` :
  appelés après **chaque arrivée** — case finale d'une poussée / attirance / avance (après les dommages de collision),
  d'une téléportation, d'une résurrection, des deux combattants d'un échange (départs puis arrivées), et à **chaque
  pas** d'une marche (`cause.final` faux sauf au dernier pas ; renvoyer `true` interrompt la marche). `cause` =
  `{ kind, sourceId, castId, final }`. C'est là que se branchent les auras (pics) ; avec
  `spikes.auraAppliesMidSpell = false`, les arrivées survenues pendant un sort sont différées à la fin du lancer
  racine (`state.deferredEnters`). L'apparition (`addFighter`) et le placement (`placeFighter`) n'appellent pas ces
  crochets.
- `hooks.onTrigger(state, ev)` : chaque `TriggerEvent` (`damage` avec montants initial / final, collision et rang,
  `heal`, `death` avec cause, `stateOn` / `stateOff`, `moved`, `cast`) est poussé dans `state.triggerQueue` puis vidé
  (FIFO, garde-fou de 100 000 événements) après **chaque application effet × cible** et à la fin de chaque action
  (`castSpell`, `moveAlongPath`, `executeBuffEffect`, `resolveSpell` au niveau 0). Les fonctions de bas niveau
  (`applyDamage`, `addBuff`…) ne vident pas la file : un appelant direct doit appeler `flushTriggers`.
- `hooks.onFighterAdded(state, fighter, cause)` (apparition, invocation, résurrection : timeline), `hooks.onEvent`
  (observateur du journal, actif même journal désactivé).
- `ctx.handlers` : ajouter / remplacer un gestionnaire (`EffectHandlerFn = (app, target | null) => void`, contexte
  `EffectApplication` : lanceur, sort, effet compilé, case ciblée, positions figées, critique, `CastContext`, jet).
- Buffs prêts pour le décompte : `Buff` porte `casterId` (décompte au début des tours du poseur), `duration`, `delay`,
  `active`, `triggers`, `effect` (effet compilé), `spellId` / `spellLevelId` / `rootSpellId`, `castId`, `critical`,
  `beforeCasterFirstTurn`, `triggerCount`, `originBuffUid` (anti-boucle), `targetedCell`. Genres : `stat`, `state`,
  `disableState`, `multiplier`, `shield`, `threshold`, `spellModifier`, `triggered` (déclencheurs ≠ I),
  `delayed` (effet non durable à délai : à exécuter par `executeBuffEffect` en fin de délai), `marker` (140, 3407).
- `state.marks` : marques posées par 401 / 402 / 1091 / 1165 (type, cases jouables couvertes, sort lancé par la marque,
  poseur, durée) ; leur comportement (début de tour, aura) relève de l'étape « glyphes ». `state.pendingChoices` :
  choix posés par 3008 / 3404 (le contenu des options est rempli par le scénario) ; `castSpell` et `moveAlongPath`
  refusent d'agir tant qu'un choix est en attente.

### Résolution d'un lancer (ÉTUDE §9.12)

1. `castSpell` : validation (`canCast`), PA dépensés **au début** (avant les effets), compteurs (par tour, par cible,
   dernier tour, relance globale) ; puis `resolveSpell`.
2. Tirage critique : un par lancer (`criticalChance` = 0 si le taux du sort est 0, sinon taux + stat Critique plafonné
   à 100) ; hérité par les sous-sorts et les buffs. En critique, la liste `critEffects` (si non vide) **remplace**
   `effects`. Seuls les effets `exec` sont compilés.
3. Positions figées (`takeSnapshot`), puis cibles de **tous** les effets calculées d'avance (`selectTargets`) : zone
   (`SpellZone.contains`) sur les positions d'avant le sort, masque sur l'état courant, cibles additionnelles (`C`),
   ordre `comparePositions` (poussées 5 / 1021 / 1041 / 1103 : la plus éloignée d'abord ; autres : la plus proche).
4. Pour chaque effet : déclencheurs ≠ I → buff `triggered` sur chaque cible (et application immédiate si `I` figure
   aussi) ; délai > 0 → buff à délai (gestionnaires durables) ou `delayed` ; sinon gestionnaire appliqué à chaque cible
   vivante (une seule fois, sans cible, pour téléportation, invocation, marques, choix d'équipe et sous-sort « sur la
   case ciblée » 2960), puis vidage des déclenchements.
5. Sous-sorts (`solveSpellExecution`, ÉTUDE §9.10) : lanceur et case selon `effects[id].executor` (`effectTarget`,
   `originalCaster`, `buffCarrier`, `eventSource` ; case de la cible / de la source / du porteur / ciblée du parent) ;
   variantes GlobalLimitation limitées à `value` exécutions par effet ; conditions de lancer ignorées
   (`engine.subSpellsIgnoreCastConditions`) ; profondeur bornée (`engine.maxSubSpellDepth`).

### Dégâts, soins, boucliers (ÉTUDE §9.5-§9.8)

- Lanceur (`senderDamage`) : jet (+ 293 du sort) ; ×(100 + carac + Puissance)/100 (soins : sans Puissance) ; + Dommages
  (+ Dommages critiques sur un effet critique) ou + Soins ; bases non boostées : 89 (% PV du lanceur), 1118 (% PV érodés
  du lanceur), 1092 / 1048 / 1109 (base cible), 1123 / 1223 / 2020 (% des dommages de l'événement déclencheur).
- Dégressivité de zone (position d'avant le sort, pas pour une cible additionnelle ni pour 1048, boucliers, collisions) :
  `trunc(v × (100 − malus) / 100)`.
- Cible (`receiveDamage`) : résistances fixes (+ critique), % plafonné (50 joueur, 100 monstre), invulnérabilités (effets
  d'état 7, 19/20, 21-25, 26, 27, 31), multiplicateurs mêlée / distance reçus (2803 / 2807), dommages finaux du lanceur
  (100 + Σ1171 − Σ1172), produit tronqué des 1163 actifs dont les déclencheurs correspondent (`D` hors poussée, `DBA`,
  `PD`/`PPD`, `PMD` rang 0…), bouclier (sauf faux dommages 90 / 1047 / 1048), seuil 2872, érosion
  (`floor(min(pertes × clamp(érosion, 0, 50) / 100, PV − 1))`), vol de vie (50 % des pertes, × soins finaux du lanceur,
  plafonné), mort à PV ≤ 0.
- Collisions : `collisionDamage` de la géométrie (niveau : `engine.pushLevelForArchetypes` pour un archétype,
  `boss.levelForPushDamage` pour la Mama, invocateur pour une invocation), puis réception « collision » (action 80) :
  ni résistances ni multiplicateurs infligés, seuls les 1163 PD / PPD / PMD. Pas de collision pour 6, 1022, 1042, 1103.
- Soins : jet boosté (Force pour le neutre), dégressivité, × soins finaux (100 + Σ2971, sauf 90 / 407 / 1109 / 2020 /
  2973), plafond aux PV manquants, 0 si incurable. Bouclier 1040 : valeur fixe, buff de durée `duration`.

### Exceptions de données paramétrées (seuls cas « codés »)

Dans `spells.ts` : `spells.voltigeUpgradedMaxPerTurn` (lancers par tour de 30570), `spells.impactCritHitsPoutch`
(`J` → aussi `j` pour l'Impact critique 30395), `spells.ggUpgradedKeepsRecastBonus` (neutralise le 406 de 30560 sur
lui-même), `spells.coupDeSangCreatesErosion` (érosion de 1048), `spells.delivranceWorks` (132). Dans le gestionnaire
3405 : `spells.jaillissementUpgradeBroken` (80750 absent → 80760 ou rien). Dans `createFighter` :
`archetypes.hpMode`, `archetypes.dompteurPower`.

### Configuration utilisée

`rng.seed`, `rng.rollMode`, `rng.critMode`, `rng.rollDistribution`, **`rng.rollPerTarget`** (nouveau, défaut faux :
un jet par effet et par lancer, commun à toutes les cibles — hypothèse), `engine.eventLog`, `engine.maxSubSpellDepth`,
`engine.subSpellsIgnoreCastConditions`, `engine.pushLevelForArchetypes`, **`engine.removeBuffsOfDeadCaster`**
(nouveau, défaut vrai : à la mort d'un combattant, les envoûtements qu'il a lancés sur les autres, `dispellable` < 4,
sont retirés — souvenir du client `BuffManager.removeLinkedBuff`, H), **`engine.unshakableBlocksCasterAdvance`**
(nouveau, défaut vrai : Inébranlable bloque l'avance 1042 du lanceur, traitée comme une attirance), `boss.levelForPushDamage`,
`spikes.auraAppliesMidSpell`, `objectives.v100MeansFull` (masque `v100`), `archetypes.*`, `spells.*` ci-dessus.
Les trois paramètres nouveaux ont été ajoutés au générateur `tools/simdata/build_sim_data.py` (avec leur `_doc`) et
à `SimConfig` ; les données (`gladiatrool.data.json`) sont inchangées.

### Choix et hypothèses documentés

- Masques : lettre d'inclusion inconnue (`x` de Troollooportation) → ne correspond à rien ; condition d'exclusion
  inconnue (T, W, K, B…) → ignorée ; l'entité de scénario (camp `Sce`) n'est visée que par un masque de camp `Sce` (ou
  `c` / `C` comme lanceur) ; masque sans lettre → le camp seul décide ; `PMD` limité à la cible poussée (rang 0).
- Morts : visés seulement par une zone `A` et par la résurrection 147 (quelle que soit la zone : Ultime Espoir utilise
  `a` ; seul le **dernier** allié mort est ressuscité, `Fighter.deathSeq`) ; les buffs du mort restent attachés (inertes) pour les déclencheurs de mort ; ses invocations meurent avec lui ;
  `executeBuffEffect(…, { allowDead: true })` exécute un effet de mort (`X`) sur le porteur mort (case de sa mort).
- `maxStack` : condition de lancer (comme le client) : nombre de lancers distincts du sort dont des buffs restent sur la
  cible ≥ `maxStack` → refus. Intervalle et relance initiale comptés en tours du lanceur (`turnCount`) ; relance
  globale en tours globaux par (équipe, sort).
- 406 retire les buffs **créés** par le sort `value` (Détonation de base : `value` 30398 ne retire pas le +5 posé par
  son sous-sort 30417, contrairement à la version améliorée qui vise 30691 — données telles quelles).
- 1048 (Coup de Sang) : appliqué immédiatement comme **perte directe** de PV courants en % (la durée −1 n'est pas
  interprétée) : ni bouclier, ni dégressivité, ni résistance, ni 1163, ni déclencheur de dommages (`hpMalusHandler`,
  corrigé par l'étape « Vérification adversariale », voir la section correspondante).
- Soins : dégressivité avant les soins finaux (structure du client : `DamageSender` puis `executeLifePointsWin`) ;
  `rules.heal.pipeline` liste l'inverse (écart ≤ 1 PV par troncature).
- Collision : déplacement, dommages de collision (cible puis chaîne), puis crochet d'arrivée (ordre du client
  `PushUtils` ; relevant pour l'attribution des morts).
- Invocation (181) : case ciblée libre, équipe et camp de l'invocateur, sort de départ lancé aussitôt (Poutch : 1163
  ×50 % DBA, déclencheur D/XD, 141 qui tue l'ancien Poutch) ; durée de vie (Q30) et timeline : étapes suivantes.
- Marques : cases jouables de la zone (liste `;` pour les pics : 96 cases), sort lancé = sous-sort de l'effet.
  2018 retire les marques posées par la cible (sort `min`, 0 = toutes).
- Durée 0 d'un buff : non tranchée par le noyau (voir `isPermanentDuration`) : « reste du tour » pour un effet immédiat
  (cf. `boss.catastroollBonusScope`), « tout le combat » pour un effet déclenché posé par un sort de départ.

### Performances (Node 22, carte réelle, 9 combattants, journal désactivé)

| Opération | Coût |
|---|---|
| `state.clone()` | ≈ 4,5 µs |
| `clone()` + Videur (sous-sort, poussée, dégâts) | ≈ 19 µs |
| `clone()` + Impact (zone C2) | ≈ 8 µs |
| `canCast` | ≈ 1 µs |
| `getCastableCells` (Frappe, PO 1-6, LdV) | ≈ 50 µs |

Leviers : `bonus` en tableau ordinaire (les petits tableaux typés coûtent cher à allouer), `base` partagé entre clones
(copie à l'écriture), marques et données partagées, aucune sérialisation.

### Tests (`sim/test/engine-core.*.test.ts`)

- `formulas` : 1 700 cas générés par `tools/mechanics/export_engine_fixtures.py` depuis `damage.py`
  (`sender_damage`, `receive_damage` avec 1163 / invulnérabilité / collisions, chaîne complète avec dégressivité,
  `heal_amount`) : **identiques** ; plages T1 / T2 / T16 ; multiplicateurs ; taux critique.
- `reference` (vrais lancers sur la carte réelle) : **T1** (976–1 220, critique 1 281–1 525, ×2 sur Vulnérable),
  **T2** (4 148–4 514 / 3 733–4 062 / 3 318–3 611), **T3** (Videur critique : −2 000 puis −7 904, total 9 904, avec une
  aura de pics minimale branchée sur `onEnterCell` ; variante `auraAppliesMidSpell = false`), **T4** (12 078, formule
  + bornes du sort), **T6** (242 → 199, 358 → 402), **T8** (283 / 141, 566 / 283 / 141, 66 pour un Trooll, non doublé
  sur Vulnérable), **T11** (PV effectifs 11 500 / 8 500 / 10 000 / 74 000), **T12** (35 014–36 844, critique
  41 114–42 944), **T13** (2 415–2 635 par allié), **T16** (1 736–2 015, critique 2 077–2 387).
- `targeting` (masques, camps, positions figées, cibles additionnelles, morts, ordre = géométrie), `cast` (validation
  et raisons, `getCastableCells` = `canCast` case par case, critique, jets uniformes, sous-sort 1160, Amplification),
  `movement` (Inébranlable / Enraciné, diagonale, attirance, Hanedimane, Va-t-en-guerre, Aïronemane, Voltige, marche,
  crochets, tacle), `buffs` (caractéristiques, vitalité, érosion, états et EON/EOFF, bouclier, seuil, 293 / 406 / 132,
  mort du lanceur, grimoire, choix, invocation, marques, résurrection, effets de mort), `state` (PRNG, clonage
  indépendant, déterminisme, performance, journal français).

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §9.2 Cases de lancer, limites | `validation.ts` |
| §9.3 Dégressivité | `effects/common.ts` (`withAoe`), `formulas.ts` (`applyAoeMalus`) |
| §9.4 Cibles, masques, ordre | `targeting.ts` |
| §9.5 Dégâts | `formulas.ts`, `damage.ts`, `effects/damageEffects.ts` |
| §9.6 Critique | `rng.ts`, `cast.ts` |
| §9.7 1163 | `formulas.ts` (`multiplierApplies`), `effects/buffEffects.ts` |
| §9.8 Soins, boucliers | `effects/healEffects.ts`, `damage.ts` (`applyHeal`) |
| §9.9 Poussée, attirance, téléportation, échange | `movement.ts`, `effects/moveEffects.ts` |
| §9.10 Durées, glyphes, sous-sorts | `buffs.ts` (structure), `state.ts` (`Mark`), `effects/spellEffects.ts` |
| §9.11 Tacle | `movement.ts` (`moveAlongPath` option `tackle`) |
| §9.12 Résolution | `cast.ts` |
| §9.13 Pics | crochets `onEnterCell` / `onLeaveCell` (implémentation : étape suivante) |

### Limites (à traiter par les étapes suivantes)

- ~~Décompte des durées et délais, début / fin de tour, exécution des buffs déclenchés et anti-boucle, glyphes 401 /
  402 et aura 1091 (pics), timeline~~ : traités par la section suivante ; le scénario reste à faire.
- 765 (interception) : appliquée par `applyDamage` (section suivante) ; 147 : case de réapparition selon
  `spells.ultimeEspoirRespawnCell` = case de mort ou la plus proche libre (seule option).
- Pas d'invisibilité, de portails ni de pièges (absents du Gladiatrool).

---

## Moteur — buffs, déclencheurs, glyphes, tours (`sim/src/engine/`)

### Rôle

Complète le noyau : **décompte** des envoûtements (durées, délais, règle du premier tour), **exécution des buffs
déclenchés** (tous les jetons présents dans les données), **sous-sorts** déclenchés, **glyphes et auras** (pics,
cadeaux), **cycle de tour** d'un combattant (début / fin, tour annulé, durée du tour), **timeline simple**
(invocations) et **actions** du combattant dont c'est le tour. Tout reste piloté par les données : les pics, la
vulnérabilité de sortie, l'invulnérabilité de la Mama, son arrivée au T8, le Poutch, Relâchement de Fureur, Pense
Vite… **émergent** des sorts 30390, 30639 / 30694 → 30700 → 30701, 30430 → 30723 / 30750 / 30609, 30421, 30624,
30615 interprétés par le moteur. Les exceptions (logique serveur non décrite par les données) sont paramétrées et
listées plus bas.

### Fichiers

| Fichier | Contenu |
|---|---|
| `turns.ts` (nouveau) | `startTurn`, `endTurn`, `startGlobalTurn`, `nextTurn` (machine à états reprenable), `performAction`, `decrementBuffsOf`, `hasPassTurn`, `remainingTurns`, timeline : `setTimeline`, `insertInTimeline`, `removeFromTimeline`, `insertSummonInTimeline` |
| `triggerProcessing.ts` (nouveau) | `processTrigger` (traitement moteur de chaque événement de la file), `fireBuff` (exécution d'un buff déclenché : compteurs, chaîne anti-boucle, journal), `runTurnTriggers` (TB / TE) |
| `triggerTokens.ts` (nouveau) | analyse des jetons (`parseTriggers` → catégories `TE_*`, états EON/EOFF, sorts TR#), correspondances (`matchesDamage`, `matchesDeath`, `matchesMove`, `matchesHeal`, `matchesCasterDamage`, `damageTokenMatches`) |
| `marks.ts` (nouveau) | auras 1091 (entrée / sortie, occupants), glyphes 401 / 402 (début / fin de tour), glyphe immédiat 1165, `removeMark`, `decrementMarks`, `enterMarksAt`, `marksOnDeath` |
| `triggers.ts`, `triggerQueue.ts` (modifiés) | événements `threshold` (TR#), dommages de glyphe, dommages du coup mortel ; chaîne `chain` et estampille `seq` ; vidages imbriqués (`state.flushMark`) |
| `buffs.ts`, `effects/common.ts` (modifiés) | durée de vie (`duration` / `triggerDuration`), durée 0 (`untilTurnEnd`), `untilNextCast`, `triggersLeft`, `rootCastId`, cumul `maxStack` à la pose, `buffTriggers` |
| `cast.ts`, `damage.ts`, `movement.ts`, `spells.ts`, `targeting.ts`, `validation.ts`, `state.ts`, `fighter.ts`, `events.ts`, `context.ts`, `effects/*` (modifiés) | voir « Modifications du noyau » |

### API publique (import : `sim/src/engine/index.ts`)

```ts
const s = createFight(createEngineContext({ hooks: { onGlobalTurn, onTurnStart, onTurnEnd } }));
// … addFighter (+ sorts de départ lancés par le scénario : resolveSpell(state, f, getSpell(f.startingSpellLevelId), f.cell))
setTimeline(s, [mama.id, acro.id, t1.id, …]);
nextTurn(s);            // { status: 'turnStarted', fighterId } | { status: 'pendingChoice' } | 'ended' | 'noFighter'
performAction(s, acro.id, { type: 'cast', spellLevelId: 80507, cell: 256 });
performAction(s, acro.id, { type: 'moveTo', cell: 300 });
performAction(s, acro.id, { type: 'endTurn' });   // ou directement nextTurn(s)
```

- **Tours** : `startTurn(state, id)` → `{ ok, fighterId, cancelled, died, reason? }` (un tour en cours d'un autre
  combattant est d'abord terminé) ; `endTurn(state, id?)` ; `startGlobalTurn(state)` (tour global + 1, crochet
  `onGlobalTurn`) ; `nextTurn(state)` enchaîne fin du tour → combattant vivant suivant → tour global suivant en fin de
  liste → début de tour ; les tours annulés (140) et les morts au début de leur tour sont enchaînés ; il s'arrête sur
  un choix en attente (avant ou après un début de tour global) et reprend à l'appel suivant.
  `state.turnStage` ('none' | 'pending' | 'active'), `state.currentFighterId`, `state.activeFighterId`.
- **Actions** : `performAction(state, fighterId, { type: 'cast' | 'move' | 'moveTo' | 'endTurn', … })` → `{ ok, code?,
  reason? (fr), cast?, walk? }` ; refus `NOT_YOUR_TURN`, `PENDING_CHOICE`, `FIGHT_ENDED`, puis les codes de `castSpell`
  / `moveAlongPath`.
- **Timeline** : `setTimeline`, `insertInTimeline(state, id, afterId?)`, `removeFromTimeline`,
  `insertSummonInTimeline(state, f)` (appelé par l'invocation 181). `setTimeline` remet l'index en tête : au tour 0,
  `nextTurn` ouvre le tour global 1 ; ensuite il reprend la liste dans le tour global courant.
- **Déclencheurs** : `processTrigger(state, ev)` (appelé par `flushTriggers` avant `hooks.onTrigger`, qui reste un
  observateur), `fireBuff(state, carrier, buff, { token, chain, triggerSourceId, triggerDamage?, allowDead? })`,
  `runTurnTriggers(state, f, 'TB' | 'TE')`, `parseTriggers(tokens)`.
- **Marques** : `marksOnEnter` / `marksOnLeave` (appelés par `notifyMove`, `swap`, `flushDeferredEnters`),
  `castTurnGlyphs(state, f, 'glyphTurnStart' | 'glyphTurnEnd')`, `removeMark`, `enterMarksAt(state, f)` (apparition
  sur une marque : au scénario de décider), `markAccepts`.
- **Divers** : `obtainSpell(state, f, spellLevelId)` (3405 : apprentissage + effet d'obtention des données),
  `bossArrivalCell(state)`, `decrementBuffsOf(state, caster, firstTurn, sinceUid?)`, `hasPassTurn(f)`,
  `remainingTurns(buff)` ; `Fighter.turnSeconds` (durée du tour en cours, 3407), `Fighter.lifetimeLeft` ;
  crochets `onGlobalTurn`, `onTurnStart`, `onTurnEnd` ; événements `triggered`, `intercepted`, `turnCancelled`,
  `markTriggered` (messages français).

### Durée de vie d'un envoûtement (ETUDE §9.10, N70 §7.2)

- Décompte **au début de chaque tour du LANCEUR** (sur tous les porteurs) : délai − 1 (à 0 : activation — bonus de
  caractéristique, état, déclencheur — ou exécution de l'effet différé, genre `delayed`, puis retrait) ; sinon durée
  − 1, retrait à 0 (EOFF des états perdus). −1 ou ≥ 63 : permanent.
- Effet **à déclencheurs** (TB, D, EOFF#…, y compris les filtres D / DBA d'un 1163) : la durée de vie du buff est
  `triggerDuration` des données (63 = tout le combat) ; `duration` est celle de l'effet **produit** à chaque
  déclenchement (ex. Relâchement : 30624 niv. 1 `tdur 4`, l'effet 293 produit est permanent ; Protection Prolongée :
  soin TB `tdur 2`). L'effet produit par un buff (déclenché ou différé) ne reprend pas de délai.
- **Durée 0** d'un effet immédiat : « reste du tour » — retiré à la fin du tour en cours (`Buff.untilTurnEnd`, ex.
  +20 % DF de Catastrooll ; `boss.catastroollBonusScope`).
- **Règle du premier tour** (`engine.firstTurnDecrementSkip`, défaut `preFight`) : un envoûtement posé avant le premier
  tour global n'est pas décompté au premier début de tour de son lanceur (client : `spellBuffsToIgnore`). Résultat :
  passe-tour (6) et état 5971 de la Mama expirent au début de son T7, son arrivée (délai 7) a lieu au T8 (T10 observé).
  `casterFirstTurn` : même règle pour tout buff posé avant le premier tour de son lanceur ; `none` : pas d'exception
  (arrivée au T7).
- Buffs et marques créés pendant le début de tour en cours (effets TB exécutés avant le décompte, effets différés) ne
  sont pas décomptés dans ce même début de tour.
- **Cumul** (`maxStack`) : au-delà de `maxStack` lancers distincts du même sort portés par la cible, un nouveau
  lancer ne pose rien (les lancers validés sont déjà refusés par `canCast`) ; indispensable pour les sous-sorts des
  objectifs relancés à chaque tour (`maxStack` 1).
- **Désenvoûtement** 132 : buffs `dispellable = 1` seulement (Patroolleur, Tambour, Protection…), jamais 3
  (Vulnérable, pics, effets de la Mama) ; **406** retire les buffs créés par le sort `value` ; les caractéristiques
  (PA, PM, PO, vitalité, DF…) sont recalculées à chaque pose / retrait (PA/PM courants = max − utilisés).

### Cycle de tour (`rules.turnStart` / `rules.turnEnd`)

Début du tour de X : (0) remise à zéro des compteurs de déclenchement des buffs portés par X ; (1) **décompte** des
buffs, marques et durées de vie des invocations de X ; (2) effets **TB** des buffs portés par X ; (3) **glyphes de
début de tour** (401) contenant sa case ; (4) restauration des PA / PM ; durée du tour = dernier 3407 actif lu avant
le décompte (60 s ; 10 s après Pense Vite). Puis : mort pendant le début de tour → fin du tour ; « Tour annulé » (140)
actif ou monstre qui ne peut pas jouer → événement `turnCancelled` et fin du tour. Ordres alternatifs :
`engine.turnStartTriggersBeforeDecrement` (TB avant le décompte) et `boss.invulnerabilityBackBeforeTurnStartSpikes`
= false (glyphes avant le décompte). Fin du tour : effets **TE**, glyphes 402, remise à zéro des lancers par tour,
retrait des buffs de durée 0.

### Déclencheurs (ETUDE §9.10, N70 §3.5, notes 30 §1)

Inventaire des jetons des effets exécutés de `sim/data` (test `engine-triggers.effects`) : `I`, `TB`, `TE`, `D`,
`DBA`, `PD`, `X`, `XD`, `XPD`, `K`, `EON5902`, `EON5906`…`EON5910`, `EOFF5902`, `EOFF5903`, `CAP`, `CD`, `VA`,
`TR30620` — tous gérés. `triggerTokens.ts` gère aussi les autres jetons du client (DN…DA, DG, DI, DBE, DCCBA/DCCBE,
DM/DR, DS, PPD, PMD, V, VM, VE, M, P, MA, MS, H, LPU, KWS, CH, PO, CC) ; sans objet dans l'arène (jamais
déclenchés) : DT, DCAC, KWW, PT, APA, MPA, CAPA, CMPA, R, DIS, ION/IOFF, CION/CIOFF, CS.

| Événement (file) | Jetons (porteur) | Côté lanceur du buff | Source / dommages transmis |
|---|---|---|---|
| `damage` | D (hors poussée), DBA…, PD / PPD / PMD (collision), V / VA / VM / VE | CD… | attaquant ; dommages initiaux / finaux (1123, 1223, 2020) |
| `death` | X (toute mort), XD (dommages hors poussée, H), XPD (dommages de poussée, H) — exécutés sur le mort | K / KWS (sur le tueur) | tueur ; dommages du coup mortel |
| `stateOn` / `stateOff` | EON# / EOFF# | — | auteur de l'état |
| `moved` | M, P, MA, MS | PO | auteur du déplacement |
| `heal` | H, LPU, V / VA | CH | soigneur |
| `cast` (lancer direct, profondeur 0) | CAP (le porteur lance un sort, H forte) | CC (critique) | lanceur |
| `threshold` (2872 atteint) | TR# (# = sort du seuil, H) | — | attaquant |
| début / fin de tour (turns.ts) | TB / TE | — | — |

Exécution (`fireBuff` → `executeBuffEffect`) : lanceur = poseur du buff, cible = porteur ; case ciblée = case du
porteur (de sa mort pour X). Règles : buff actif, **posé avant l'événement** (estampille `seq` : un buff CAP posé
par un lancer ne réagit pas à ce lancer), porteur vivant sauf jetons de mort, déclenchements restants
(`triggersLeft`) ; un coup mortel ne déclenche pas D mais XD. **Anti-boucle** (`isTriggeredByParent`) : chaque
événement porte la chaîne des buffs dont l'exécution l'a produit (`state.triggerChain`, estampillée par
`queueTrigger`) ; un buff de la chaîne ne se redéclenche pas (renvois en chaîne de Malédiction Collatérale : A → B →
A s'arrête). **Vidages imbriqués** : un vidage ouvert pendant l'exécution d'un buff ne traite que les événements
produits depuis (`state.flushMark`) ; les événements en attente du niveau englobant suivent dans l'ordre FIFO. Ainsi,
dans un sort lancé par une aura au milieu d'un déclenchement, l'état gagné à l'effet 0 (EON5902 de la Mama) est traité
avant l'effet suivant (2 000). Compteurs : `triggerCount` (remis à zéro au début de tour du porteur), `totalTriggers`.

### Sous-sorts (ETUDE §9.10)

| Effet | Lanceur | Case | Source |
|---|---|---|---|
| 792 (793) / 2792 (2793) | la cible de l'effet (le porteur pour un buff) | sa case | catalogue `effects` (793, 2793 : repli moteur) |
| 1160 / 2160 / 1008 | le lanceur d'origine | case de la cible | catalogue (1008 : repli moteur) |
| 1017 / 2017 | le porteur | case de la source (attaquant) | catalogue |
| 1018 | la source | case du porteur | catalogue |
| 1019 | la source | sa case | catalogue |
| 2794 (2795) | la cible | case ciblée du sort parent | catalogue |
| 2960 | le lanceur d'origine | case ciblée ; zone liste `;` → chaque case de la liste (arrivée de la Mama : [300]) | catalogue |

Variantes GlobalLimitation : au plus `value` exécutions par effet (rebond unique de Chamboulement et de Pulsation
Chaotique). Critique hérité ; conditions de lancer ignorées (`engine.subSpellsIgnoreCastConditions`). Un lanceur mort
(effet de mort X / XD) peut exécuter un sous-sort sur lui-même (masque `C`) : renvoi du Poutch tué par le coup.
Masque **`O`** = cible ADDITIONNELLE « combattant déclencheur » (même hors zone, s'il passe le camp et les exclusions)
et non un filtre : c'est ce qui fait fonctionner le Poutch (`a,O,E5899` en zone P : le Dompteur attaquant).

### Glyphes et auras (ETUDE §9.13, notes 30 §2-§3)

- **Aura 1091** (pics = 30390 niv. 2) : à l'entrée d'un combattant accepté par le masque de pose (`a,A` : tous sauf
  l'entité de scénario), par marche, poussée, attirance, avance, téléportation, échange ou résurrection, le poseur
  lance le sort de l'aura sur la case d'arrivée (dommages « de glyphe ») ; à la sortie, les buffs produits par cette
  application (même lancer racine `rootCastId`, sous-sorts compris, pas les effets déclenchés) sont retirés → EOFF.
  Invocation posée sur l'aura, aura posée sur un combattant : entrée. Paramètres (toute aura ; la seule des données
  est celle des pics) : `spikes.triggerWhenWalkingThrough`, `spikes.walkThroughInterruptsMovement`,
  `spikes.retriggerOnMoveInside` (vrai : ré-application, puis retrait des anciens effets sans EOFF parasite),
  `spikes.stackExitAndInside` (faux : la vulnérabilité de sortie 30701 encore active est retirée à la ré-entrée),
  `spikes.auraAppliesMidSpell` (noyau), `boss.invulnerabilityLiftedBeforeEntryDamage` (faux : états d'entrée posés
  après les dommages).
- **Glyphes 401 / 402** : au début / à la fin du tour d'un combattant accepté sur une case de la marque, le poseur
  lance le sort sur sa case (pics : 30390 niv. 3, 1 000).
- **Glyphe immédiat 1165** (cadeau 30566) : à chaque entrée d'un combattant accepté (`Atq,A` : joueurs), y compris en
  traversée à pied ; déplacement forcé seulement si `gifts.pushedPlayerTriggers`. Le sort du cadeau propose le choix
  10 à chaque joueur (déduplication par lancer racine : un seul choix par joueur) et dissipe le cadeau par 2018 :
  seulement le cadeau ramassé (`engine.dispelGlyphsTriggeringMarkOnly`), les autres restent.
- **Durée** des marques en tours du poseur ; −1 permanente ; l'entité de scénario ne joue jamais (cadeaux persistants).

**Pseudo-code normatif des pics (ETUDE §9.13) — obtenu par les données** :

| Norme | Données interprétées | Test |
|---|---|---|
| entrée : 5902 (Def) / 5903 (Atq), Vulnérable, 2 000, puis ×2 (Def) | 80492 effets 0-6 (950, 950, 950, 950, 100, 100, 1163 `D` tdur 63) | T3 : −2 000 puis −7 904 |
| début de tour dedans : 1 000 × multiplicateurs | glyphe 401 → 81026 ; 1163 d'aura (lanceur Sce, non décompté) | T9 : 2 000 (monstre), 1 000 (joueur) |
| sortie : ×2 et Vulnérable 1 tour du porteur, joueurs et Troolls, pas la Mama | retrait des effets d'aura → EOFF5902/5903 → 30700 (passifs 30639 / 30694) → 30701 posé par le porteur | Mitroollette 4 278 → 8 556 → 4 278 |
| Mama : invulnérable, levée 1 tour à l'entrée | 30723 : état 56 + 792 `EON5902` → 81099 (952, durée 1 de la Mama) | 2 000 subis puis ×2 ; glyphe absorbé au début de son tour |
| ré-entrée avant son tour : 4 000 puis ×4 | 1163 de 30701 et d'aura multipliés | Frappe 3 904 |

### Effets restants

- **2872** seuil de PV : les dommages sont plafonnés ; seuil atteint → événement `threshold` → jeton TR# (Immortalité
  du Bienfaiteur : soin 50 % PV max puis 406) ; `spells.bienfaiteurOverflowLost` = false : le reste des dommages est
  appliqué après.
- **765** interception (Immortalité du Courageux) : dans `applyDamage`, un coup (hors poussée) sur un porteur d'un
  buff 765 actif est **redirigé** vers le poseur, recalculé sur lui (ses résistances, ses 1163) — hypothèse ; pas
  d'interception en chaîne.
- **1123 / 1223 / 2020** : % des dommages initiaux / finaux de l'événement déclencheur (Poutch, Un pour un,
  Malédictions).
- **140** tour annulé ; **3407** durée du tour (`Fighter.turnSeconds`, le temps n'est pas simulé : `spells.penseVite.*`
  relève du planificateur) ; **3405** / **3406** apprendre / oublier (3405 → `obtainSpell` : effet d'obtention des
  données `archetypes[…].onObtain`) ; **3008** / **3404** choix en attente (dédupliqués par lancer racine) ; **181**
  invocation insérée dans la timeline ; **147** résurrection (arrivée = entrée dans les marques) ; **335, 666, 3400,
  3401, 3792, 3793** sans effet moteur.
- **4** téléportation : case ciblée si libre (toute zone), sinon première case libre de la zone (ordre getCells).

### Exceptions paramétrées (logique serveur ou hypothèses que les données ne tranchent pas)

| Paramètre | Où | Effet |
|---|---|---|
| `spikes.entryDamage`, `spikes.playerTurnStartDamage`, `spikes.monsterTurnStartDamageRaw`, `spikes.playersDoubledInside`, `spikes.exitVulnerabilityTurns` | `spells.ts` (30390, 30701) | valeurs par défaut = données ; alternatives (DPLN 2 000, ×2 des joueurs…) |
| `boss.catastroollBonusScope` | `spells.ts` (30394) | durée 0 : reste du tour / jusqu'au prochain lancer / neutralisé |
| `boss.rassemblementPullThenPush`, `boss.rassemblementBlockedByUnshakable` | `spells.ts`, `moveEffects.ts` (30432) | ordre attirance / poussée ; 1103 forcée |
| `boss.arrivalCell`, `boss.arrivalFallback` | `moveEffects.ts` (30609) | arrivée sur 300, sinon 287, puis l'axe vers 152, puis la case libre la plus proche |
| `gifts.monstersTrigger`, `gifts.pushedPlayerTriggers` | `spells.ts`, `marks.ts` | masque du cadeau ; déclenchement par déplacement forcé |
| `spells.relachementGrowthStart`, `spells.relachementMaxStacks` | `obtainSpell` | 30624 posé à l'obtention, permanent, limité à N déclenchements ; premier immédiat ou au début de tour suivant |
| `spells.protectionProlongeeSelfHeals` | `cast.ts` | nombre de soins TB quand elle est lancée sur soi |
| `spells.poutchLifetimeTurns` | `summonHandler`, `decrementBuffsOf` | durée de vie du Poutch en tours de l'invocateur |
| `spells.maledictionCollateraleChains` / `…HitsCarrier`, `spells.maledictionRegenerantePercent` / `…Zone`, `spells.maledictionMouvanteOnGlyphDamage`, `spells.pulsationChaotiqueBounceRange`, `spells.bienfaiteurOverflowLost` | `spells.ts`, `triggerProcessing.ts` | variantes des sorts uniques |
| `spells.newSpellUsableSameTurn`, `gifts.upgradedSpellGreyedUntilNextTurn` | `validation.ts` (`LEARNED_THIS_TURN`) | sort obtenu pendant son tour |
| `boss.invulnerabilityLiftedBeforeEntryDamage`, `boss.invulnerabilityBackBeforeTurnStartSpikes` | `marks.ts`, `turns.ts` | ordre entrée / levée ; ordre décompte / glyphes |

**Nouveaux paramètres** (générateur `tools/simdata/build_sim_data.py` avec `_doc`, `SimConfig`) :
`engine.firstTurnDecrementSkip` (`preFight` | `casterFirstTurn` | `none`), `engine.turnStartTriggersBeforeDecrement`
(faux ; vrai : un TB de durée 1 posé sur soi — renouvellement d'Immortalité du Berserker — se déclenche),
`engine.dispelGlyphsTriggeringMarkOnly` (vrai). Les données (`gladiatrool.data.json`) sont inchangées.

### Modifications du noyau (signalées)

- `targeting.ts` : **`O`** devient une cible additionnelle (combattant déclencheur) au lieu d'un filtre — conforme à
  `rules.targeting.additionalTargets` et N70 §3.4 ; sans cela le renvoi du Poutch est impossible (zone P + `O`) ;
  `C` ajoute aussi un lanceur mort quand `allowDeadCaster` (effets de mort). Test du noyau adapté
  (`engine-core.targeting`).
- `movement.ts` : téléportation sur la case ciblée si elle est libre quelle que soit la zone (C63 de l'arrivée de la
  Mama : sinon la première case de getCells, en haut de la carte) ; marques du moteur appelées avant les crochets.
- `cast.ts` : lancer racine, critique dans l'événement `cast`, retrait des buffs « jusqu'au prochain lancer », mort
  lanceur de sous-sort ; `damage.ts` : interception, événement `threshold`, dommages du coup mortel ; `spells.ts` :
  exceptions ci-dessus et jetons analysés ; `effects/spellEffects.ts` : exécuteurs de repli, 2960 sur liste, obtention,
  déduplication des choix, insertion des invocations, masque des marques, 2018 ciblé.
- Deux tests du noyau décrivaient l'absence de déclencheurs / d'aura et ont été adaptés : `engine-core.state`
  (journal : le Videur envoie le Trooll dans les pics → 2 000 puis 6 478) et `engine-core.buffs` (l'effet de mort est
  exécuté au vidage de la file).

### Choix et hypothèses

- XD = mort par dommages hors poussée, XPD = mort par dommages de poussée ; CAP = lancer direct (profondeur 0) du
  porteur ; TR# = seuil posé par le sort # atteint (Q36).
- Glyphe immédiat 1165 : déclenché à chaque entrée, y compris en traversée, sans interrompre la marche.
- Interception 765 : dommages recalculés sur l'intercepteur.
- Ordre du début de tour : décompte → TB → glyphes (ETUDE) ; les deux autres ordres sont paramétrables.
- Les effets produits par un buff déclenché ont `duration` et aucun délai ; la durée de vie du buff déclencheur est
  `triggerDuration` (vérifié sur toutes les paires des données : Protection Prolongée 2, Relâchement 4, pics 63…).

### Performances (Node 22, 7 combattants + scénario, pics posés, passifs lancés, journal désactivé)

| Opération | Coût |
|---|---|
| `state.clone()` | ≈ 7 µs (plus de buffs : passifs, marques) |
| `clone()` + Frappe Repoussoir | ≈ 12 µs |
| `clone()` + Videur qui pousse dans les pics (aura, déclencheurs) | ≈ 53 µs |
| `clone()` + 7 `nextTurn` (décomptes, TB, glyphes) | ≈ 28 µs |

### Tests (`sim/test/engine-triggers.*.test.ts`, aide `helpers/fightSetup.ts`)

- `spikes` (16) : T3 avec l'aura réelle (−2 000 puis −7 904 ; variante `auraAppliesMidSpell`), T9 (monstre 2 000,
  Trooll à 2 000 PV mort au début de son tour ; joueur 1 000 et variantes de configuration), sortie ×2 (joueur,
  Trooll ; pas la Mama), ré-entrée ×4 / `stackExitAndInside`, `retriggerOnMoveInside`, traversée à pied et
  interruption, Mama invulnérable puis vulnérable 1 tour (glyphe absorbé ; variantes d'ordre), T11 (74 000),
  Voltige depuis les pics (7 076), Mama Inébranlable échangée.
- `turns` (19) : Regain Vigoureux, Amplification (cibles figées `e5968`, durées, relance sans effet), Protection
  Prolongée (bouclier, 2 soins TB ; sur soi 1 ou 2), Grondement (+20 à la relance, non cumulatif), Relâchement (obtenu :
  +25 × 4, T12 35 014 ; variantes), Pense Vite (10 s, 1 007 PA, retrait en fin de tour), passe-tour et arrivée de la
  Mama (T1–T6 annulés, T8 sur 300 ; replis 287 / 273 ; règle du premier tour), Catastrooll (durée 0 : trois portées),
  Poutch dans la timeline et durée de vie, choix en attente et reprise, `performAction`, sort obtenu dans le tour,
  retrait de la timeline, **robustesse** (6 combats complets aux actions aléatoires : Mama, 4 archétypes avec leurs
  uniques, 4 Troolls, pics ; invariants de l'état après chaque action — une version étendue, 40 combats et ≈ 20 000
  actions, a été exécutée pendant le développement sans écart).
- `effects` (24) : inventaire des jetons, T4 (jet 99 : 12 078), T12 et T13 dans l'arène, Pugnace, Prélèvement +
  Ombre Fracassante, Coup de Sang, Délivrance (1 contre 3), Poutch (DBA, renvoi, XD, sans état Dompteur), Un pour un,
  Immortalité du Courageux (765), Malédiction Collatérale (chaîne, anti-boucle, variante), Malédiction Mouvante,
  Immortalité du Bienfaiteur (TR#), Immortalité du Berserker (K → TB selon l'ordre), CAP (compteur de Productivité),
  Chamboulement (PD → rebonds), Pulsation Chaotique (+20 par rebond), VA / CD, cumul `maxStack`, cadeau (joueurs
  seulement, un choix par joueur, dissipation ciblée).

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §2.4 Ordre de jeu (invocations) | `turns.ts` (`insertSummonInTimeline`) |
| §3.4 / §9.13 Pics | `marks.ts` + données 30390 / 30700 / 30701 / 30723 |
| §3.7 / §8.1 Cadeaux | `marks.ts` (1165), `spellEffects.ts` (choix, 2018) |
| §4.2-§4.4 Sorts d'archétype (durées, déclencheurs) | `turns.ts`, `triggerProcessing.ts`, `obtainSpell` |
| §5.2 Passif Trooler / §6.2-§6.6 Mama (passe-tour, arrivée, invulnérabilité) | `turns.ts`, `moveEffects.ts` (`bossArrivalCell`) |
| §9.10 Durées, délais, glyphes, sous-sorts | `turns.ts`, `buffs.ts`, `marks.ts`, `spellEffects.ts` |
| §9.12 Algorithme (déclencheurs réactifs) | `triggerQueue.ts`, `triggerProcessing.ts` |

### Limites

- ~~Timeline complète (ordre joueurs / Troolls, vagues, arrivée des nouveaux venus), victoire et fenêtres de choix
  (contenu des options) : étape Scénario (`hooks.onGlobalTurn`, `nextTurn`). `boss.actsBeforeArrival` (la Mama n'agit
  pas au T7) et `boss.giftCancelsRassemblement` relèvent de l'IA / du scénario.~~ Traités : section « Scénario ».
- Temps réel non simulé (3407 conservé comme information ; `spells.penseVite.maxCasts` pour le planificateur).
- L'entité de scénario ne joue jamais : les envoûtements et marques qu'elle pose avec une durée finie ne sont jamais
  décomptés (cadeaux persistants, conforme aux observations ; à garder en tête pour les objectifs).
- `hooks.onTurnStart` est appelé avant le test de tour annulé (140) ; `nextTurn` ne renvoie que les tours jouables.
- Jeton DIS (désenvoûté) et jetons sans objet non émis ; pas de limite de déclenchements par tour (aucune donnée) :
  les compteurs sont tenus pour information.
- Le sort d'une marque (aura, glyphe) ne traite que ses propres déclenchements ; les événements antérieurs (dommages
  de collision qui ont précédé l'arrivée dans les pics) sont traités juste après, par le vidage englobant. Ailleurs, un
  vidage traite les événements en attente de son niveau dans l'ordre FIFO (ordre déterministe ; l'ordre exact du
  serveur n'est pas connu).

---

## Vérification adversariale du moteur (`sim/test/spells-*.test.ts`, `docs/VERIFICATION.md`)

### Rôle

Contrôle indépendant, **sort par sort**, du moteur contre la réalité documentée (ÉTUDE §4-§6, §9 ; notes N1A, N1D,
N1M, N20, N70 ; `research/data/archetype_*.json` : `expectedDamage`, `simModel`, `workedExamples`, `geometry` ;
`monsters.json` : `damageTable`). Les valeurs attendues sont recopiées des notes et non des données ; chaque écart est
tranché (données du jeu > formules du client > notes) et consigné dans `docs/VERIFICATION.md` (tableau par sort,
performances, limites).

### Fichiers

| Fichier | Contenu |
|---|---|
| `sim/test/helpers/spellCheck.ts` | combat minimal (`fight(mode)`), modes `min` / `max` / `minCrit` / `maxCrit`, placement relatif au centre (`rel`, `step`), `player` (archétype + passif 30639 + choix d'archétype : états 5899 / 5900 / 5901), `mob` (monstre + sort de départ), `vulnerable` (30701), lecture du journal (`hits`, `collisions`, `heals`), `verifyCastRules` |
| `sim/test/spells-archetypes.test.ts` | 63 niveaux de sort (conditions de lancer), effets de chaque sort normal et amélioré, 19 uniques + Pense Vite, 21 améliorations, 18 Acclamations, workedExamples (Videur T1, Magicien T1, Pulsation), tailles de zone, tableau « k cases des pics » (N1A §7.1), directions de poussée du T (N1A §2.3), interactions avec les pics |
| `sim/test/spells-monsters.test.ts` | Troollibre, Artroolleur, Nitrooll, Mama (script 30430, Faveur 30659, 5 sorts, Rassemblement), critique des monstres, performance |

### `verifyCastRules(sl, attendu, lanceur, cible)`

Compare la table attendue (`CastExpect` : PA, portée min / max, PO modifiable, ligne, LdV, case libre / occupée,
lancers par tour / par cible, intervalle, taux de critique) aux données compilées, puis vérifie le **comportement** de
`canCast` / `castSpell` depuis la case 213 (14 cases jouables alignées vers le sud-est) : coût payé et refus à PA − 1 ;
portée max, max + 1, bonus de +1 PO ; case du lanceur ; case hors axe ; blocage de LdV par un combattant ; case
libre / occupée ; `MAX_PER_TURN`, `MAX_PER_TARGET`, `COOLDOWN`. Les effets sont neutralisés
(`castSpell(..., { effectFilter: () => false })`) pour isoler les règles de lancer.

### Corrections apportées au moteur (signalées)

- **1048** (coût de Coup de Sang) : nouveau gestionnaire `hpMalusHandler` (`effects/damageEffects.ts`, enregistré
  pour `hpMalusPct`) : perte directe de PV courants via `applyDirectLifeLoss` (ni bouclier, ni résistance, ni 1163,
  ni déclencheur de dommages ; seuil respecté ; érosion selon `spells.coupDeSangCreatesErosion`). Source : N1D §5.5
  (StatBuff « lifePointsMalus » du client), `archetype_dompteur.json`.
- **147** (Ultime Espoir) : `resurrectHandler` ne ressuscite que le **dernier** allié mort (nouveau champ
  `Fighter.deathSeq`, posé par `killFighter`, cloné), une fois par application, jamais une invocation. Source : N1M §5.
- `applyDirectLifeLoss(state, source, target, amount, castId?, { erosion?, spellLevelId? })` : options ajoutées
  (rétrocompatible).

### Correspondance avec l'ÉTUDE

| ÉTUDE | Tests |
|---|---|
| §4.1 socle, Frappe Repoussoir, améliorations, uniques | `spells-archetypes` (conditions, Frappe, améliorations, uniques) |
| §4.2 / §4.3 / §4.4 tableaux des sorts | un `describe` par sort, bornes min / max / critique |
| §4.5 Acclamations | 18 cartes (pas de double application) |
| §5.3-§5.5 monstres, §6.1-§6.8 Mama | `spells-monsters` |
| §9.3 zones et dégressivité, §9.4 cibles figées, §9.6 critique, §9.9 poussées | tailles de zone, directions du T, k cases des pics, critiques |
| §9.13 pics | interactions dans l'arène (entrée puis frappe doublée, Dégagez !, Voltige depuis les pics, Rassemblement) |

### Limites

Voir `docs/VERIFICATION.md` §5 : `maxStack` compté tous lanceurs confondus, Rassemblement rejoué par combattant de la
croix (idempotent), ordre des déclencheurs (dès l'application), collision avant l'entrée dans l'aura, interception
765, malus 1048 non modélisé comme envoûtement, chaîne de rebonds de Chamboulement.

---

## Scénario (`sim/src/scenario/`)

### Rôle

Déroulé scripté côté serveur du Gladiatrool, au-dessus du moteur : mise en place (placement, archétypes, sorts de
départ, pics, objectif imposé, V1), boucle du **tour global** (fenêtre d'Acclamations, vague n, cadeau, ordre de jeu,
contrôles de fin de tour global), **Mama** (attente, arrivée, tours passés), **objectifs** (21, codage déclaratif,
récompense, votes), **cadeaux** (cartes, application), **victoire / défaite**, et l'**API de pilotage** (machine à
états) utilisée par le runner, le planificateur et l'interface. Tout ce que les données décrivent est interprété par
le moteur (sorts 30390, 30430 → 30750 / 30609 / 30432 / 30723 / 30724, 30659, 30626, 30443, 30566 / 30657, 30658,
30577, cartes « Amélioration : X » et Acclamations) ; le scénario ne code que la logique serveur absente des données,
paramétrée par la configuration. Aucune entrée/sortie ; tout l'état vit dans `FightState` (+ `state.scenario`) et se
clone.

### Fichiers

| Fichier | Contenu |
|---|---|
| `setup.ts` | `createGladiatroolFight`, `createScenarioContext`, `DEFAULT_AUTO_PLACEMENT` : mise en place (données `scenario.timeline.fightStart`) |
| `fight.ts` | `GladiatroolFight` (API de pilotage), `passiveMonsterController`, `resolveAllChoices`, `MonsterTurnFn` |
| `hooks.ts` | crochets du moteur (`installScenarioHooks`), tour global (`onGlobalTurn`), `flushScenario` (point sûr), `checkEnd`, `endFight`, `scenarioCast` |
| `objectives.ts` | suivi déclaratif des 21 objectifs, activation, validation différée, récompense (sort de récompense des données) |
| `choices.ts` | options des choix (Acclamations 17, cadeau 10, votes 11-15, archétype 16), réponse (`resolveChoice`), dépouillement des votes |
| `waves.ts` | vagues : tirage des cases (`spawn.*`), apparition, sort de départ, sous-liste de la timeline |
| `gifts.ts` | apparition des cadeaux (`gifts.*`), cases portant un cadeau |
| `timeline.ts` | ordre de jeu (`timeline.*`), insertion des nouveaux monstres |
| `scenarioState.ts` | `ScenarioState` (état clonable du scénario), `scenarioOf`, `requireScenario` |
| `random.ts` | flux pseudo-aléatoires dérivés (`derivedRng`, `mixSeed`, `pickDistinct`, `RNG_TAG`) |
| `controllers.ts` | contrôleurs minimaux (`simpleMonsterController`, `createRandomController`) et `playUntilEnd` |
| `types.ts` | types publics (`FightSetup`, `ChoiceOption`, `ChoiceAnswer`, `FightStatus`, `FightResult`, `MonsterController`…) |
| `index.ts` | réexports |

### Mise en place (`createGladiatroolFight`, ETUDE §2.2, §3.5, §4.1, §6.2)

1. **Placement** : joueurs (1 à 4, dans l'ordre de jeu ; défaut `timeline.playerOrder`) sur 286 / 287 / 314 / 315 —
   case imposée (`startCell`, contrôlée) ou automatique (`options.autoPlacementOrder`, défaut 314, 287, 286, 315 :
   J1 sur 314, ouverture de référence de l'Acrobate) ; noms « Dompteur 1 », « Dompteur 2 » en cas de doublon. Entité
   de scénario (camp `Sce`, hors carte) ; Mama sur 152 (dans la timeline).
2. **Sorts de départ** (déroulé `fightStart` des données) : passif des joueurs 30639 lancé **avant** le choix
   d'archétype (ses bonus `*E5899/5900/5901` échouent, ETUDE §4.1 ; effets 125 / 153 / 138 filtrés en plus : PV et
   Puissance viennent de `archetypes.hpMode` / `archetypes.dompteurPower`) ; choix d'archétype n° 16 résolu d'après
   la mise en place (passif 30644 / 30648 / 30649 → états 5899 / 5900 / 5901) ; Mama 30430. Grimoire initial = Frappe
   Repoussoir + sort de départ (le serveur le donne, `startingSpellSource`).
3. L'entité de scénario pose les **pics** (30390 niv. 1) et lance le **gestionnaire d'objectifs** 30443 niv. 1 sans son
   effet 0 (lancer de l'objectif Empalé 30428 sur les joueurs, remplacé par le suivi déclaratif) : restent les cinq
   déclencheurs `EON5906`…`EON5910` posés sur l'entité, qui ouvriront les votes. Empalé devient l'objectif actif.
4. **V1** : 2 Troollibres sur 242 et 358 (sort de départ 30694 : sortie des pics 30700, 30754).
5. **Ordre de jeu**, puis (sauf `options.autoStart = false`) avancée jusqu'au premier point de décision : T1, tour
   de la Mama annulé, tour de J1.

`createScenarioContext({ data?, config?, overrides? })` renvoie un contexte moteur muni des crochets du scénario, à
réutiliser (`options.ctx`) pour enchaîner des combats de même configuration sans recompiler les sorts.

### Tour global (ETUDE §2.1 ; crochet `onGlobalTurn`)

Au passage au tour global T (fin de liste de la timeline, `nextTurn` du moteur) :

1. **fin du tour global T−1** (30710 « Objectif Check », contrôles déclaratifs) : Soleil, Stop aux projectiles,
   Sauvez-le (contrôle puis désignation), Tout va bien, Solitude ; remise à zéro de Quintuplé ; récompense éventuelle
   (→ vote, qui peut donc précéder la fenêtre de bonus, ETUDE §2.7) ;
2. `victory.turnLimit` dépassé → fin du combat (sans vainqueur) ;
3. **Acclamations** (`bonuses.firstTurn`..`lastTurn`, T2–T9) : l'entité de scénario lance 30658 niv. 1 → chaque joueur
   vivant lance le niv. 2 → choix n° 17 (options : choices.ts) ;
4. **vague** du tour (`scenario.timeline.waveSpawnTurns` : T2–T7, T9, T10 ; V8 = arrivée de la Mama par ses sorts) ;
5. **cadeau** (`gifts.firstTurn`..`lastTurn`) ;
6. à partir de `victory.canFinishFromTurn` (T10) : 30577 « Finish Fight Trigger » (état 5965 sur l'entité) ;
7. **ordre de jeu** du tour recalculé ; point sûr (`flushScenario`).

Puis les tours : la Mama en tête (tours annulés T1–T6 par ses données ; au T7 son tour n'est plus annulé mais le
scénario le passe, `boss.actsBeforeArrival` ; arrivée au début de T8), joueurs et monstres selon la timeline.

### Ordre de jeu (`timeline.ts`, ETUDE §2.4, Q1)

Recalculé au début de chaque tour global, après les apparitions :

| `timeline.model` | Ordre |
|---|---|
| `alternate_spawn_order` (défaut) | Mama, J1, M1, J2, M2, J3, M3, J4, M4, M5… (quand une équipe est épuisée, l'autre termine) |
| `alternate_initiative` | idem, monstres triés par initiative (Force : Troollibre 4 000 > Nitrooll 3 500 > Artroolleur 3 000 ; égalité : sous-liste) |
| `monsters_after_mama` | Mama, tous les monstres, puis les joueurs |
| `explicit` | `options.timelineOrder({ mamaId, playerIds, monsterIds, turn })` (erreur si absent) |

Sous-liste des monstres (hors Mama) : ordre d'apparition, les nouveaux venus selon `timeline.newMonstersInsertion`
(`append` en fin, `after_mama` en tête, `by_initiative` insérés par initiative). Un monstre mort libère sa place
(Q1) ; un joueur mort garde la sienne (sauté) si **`timeline.deadPlayersKeepSlot`** (nouveau paramètre, défaut
vrai ; faux : il sort de l'alternance et un joueur ressuscité est remis en fin de liste). La Mama joue en tête
(`scenario.timeline.bossPlaysFirst`). Les invocations (Poutch) jouent juste après leur invocateur (moteur puis
recalcul) ; leur tour, sans PA ni PM, est terminé d'office par `advance()`.

### Vagues (`waves.ts`, ETUDE §2.3, Q5)

Composition des données (`scenario.waves`), dans l'ordre de la composition. Case de chaque monstre selon
`spawn.mode` : `weighted_observed` (défaut : cases fixes de V1, sinon groupes structurés de V2/V3 — une case par
groupe, poids observés —, sinon candidats du type pour la vague, poids = observations VOD) ; `structured_slots`
(groupes uniformes, sinon `slotsByType` uniformes) ; `uniform_slots` (candidats du type, uniformes) ;
`most_frequent` (déterministe). `spawn.allowUnassigned` ajoute les candidats sans type ; les cases de pics ne sont
jamais tirées (les candidats sans type des données en contiennent : V1 171 et 402, V9 402) ; `spawn.excludeOccupied`
exclut les cases occupées (sinon case tirée occupée → case libre la plus proche). Deux monstres d'une vague n'ont
jamais la même case ; sans candidat libre, repli sur la case libre hors pics la plus proche du premier candidat
(choix d'implémentation). Chaque monstre lance son sort de départ (30694) ; noms numérotés par type (« Troollibre 3 »).

### Mama (ETUDE §6)

Tout vient des données interprétées par le moteur : passe-tour 6 et état 5971 (règle du premier tour :
`engine.firstTurnDecrementSkip`), arrivée retardée (délai 7 → début de T8) sur `boss.arrivalCell` (300) avec les
replis `boss.arrivalFallback` (287, axe vers 152, case libre la plus proche), Rassemblement 30432 à chaque début de
son tour (croix X63 : attire les Troolls, repousse les joueurs jusqu'au bord sans dommages ; `boss.rassemblement*`),
invulnérabilité 30723 (levée 1 tour à chaque entrée dans les pics), Faveur 30724 (+25 % DF) et 30659 (−1 cran, −5 %).
Côté scénario : **tour passé** au T7 tant qu'elle attend sur 152 (`boss.actsBeforeArrival` faux : l'IA n'est pas
consultée), **bug du cadeau** (`boss.giftCancelsRassemblement` : un joueur poussé sur un cadeau par le Rassemblement
fait passer son tour à la Mama — ses dommages de Rassemblement, nuls hors pics, ne sont pas annulés), **plafond de la
Faveur** (`boss.favourCap` : au-delà de N objectifs, l'effet 30659 de la récompense est filtré).

### Objectifs (`objectives.ts`, ETUDE §7, N30 §5.3, SPEC §11.5)

Codage **déclaratif** : chaque objectif des données porte une condition typée (`condition.kind`, paramètres,
références `$config`) que le scénario évalue à partir des événements du moteur (`hooks.onTrigger` : `death`,
`damage`, `stateOn` / `stateOff`, `cast`), des débuts / fins de tour des joueurs (`onTurnStart` / `onTurnEnd`) et de
la fin du tour global. Les sorts-compteurs du client (30428…30555) ne sont pas lancés. « Challenger » = joueur dont
c'est le tour ; les compteurs « pendant le tour » sont remis à zéro en fin de tour.

**Installation du suivi** (lue dans les données, `trackingStartsAtActivation`) : le niveau 1 du sort de l'objectif
pose ses déclencheurs soit immédiatement (sous-sort 792 / 2792 à déclencheur `I`, et état Challenger 5917 posé aussi
en `I` s'il l'est en `TB`), soit au début du tour de chaque allié (`TB`). Pour un objectif voté pendant le tour d'un
joueur : Meurtres en série, Faire le mur et Pas le temps (qui marque aussitôt les ennemis à PV pleins) comptent dans
ce tour ; Productivité, Toi par ici, Trous dans les Troolls, D'une pierre trois coups et Quintuplé ne comptent qu'à
partir du prochain début de tour d'un joueur (`ScenarioState.armed`) ; Soleil et Prendre sa place attendent leur
marquage de début de tour ; les contrôles de fin de tour (Au coin !, Distance d'insécurité) sont actifs aussitôt.

| Objectif | `condition.kind` | Évaluation |
|---|---|---|
| Empalé (1) | `victimHasState` 5994 | mort d'un ennemi Vulnérable, quel que soit le tueur |
| Soleil (2) | `allPlayersEndTurnOnStartCell` | fin de tour global : chaque joueur vivant a fini son tour sur sa case de début de tour, pendant un tour global complet où l'objectif était actif |
| Sol glissant (2) | `victimKilledByPushDamage` | mort par dommages de poussée |
| Meurtres en série (2) | `killsBySameKillerInOwnTurn` 2 | tueur = Challenger ; morts par poussée selon `objectives.pushKillsCount` ; morts par les pics attribuées au Challenger si `objectives.glyphKillsCreditPlayer` |
| Productivité (2) | `castsInOwnTurn` 3 | lancers directs (profondeur 0) du Challenger |
| Ébranlable (3) | `victimHasState` 157 | mort d'un ennemi Inébranlable |
| Toi, par ici (3) | `enemyEntersAndAllyExitsSpikesInTurn` | pendant le tour : EON5902 sur un ennemi et EOFF5903 sur un allié |
| Stop aux projectiles (3) | `noAliveMonster` 7982 | fin de tour global |
| Sauvez-le ! (3) | `designatedAllyFullHp` | fin de tour global : contrôle du désigné (PV pleins, `objectives.v100MeansFull`), puis désignation (premier joueur à ≤ 10 %, … ≤ 90 %, sinon le premier) |
| Prendre sa place (4) | `endTurnOnMarkedCell` | début du tour : case de l'ennemi le plus éloigné (hors Mama pré-combat : 5971, ou tour < `objectives.mamaCountsFromTurn` ; au T7 la Mama sur 152 peut être marquée ; égalité : ordre des ids) ; fin du tour : le Challenger y est |
| Faire le mur (4) | `distinctEnemiesPushDamagedInTurn` 3 | dommages de collision sur 3 ennemis distincts pendant le tour |
| Pas le temps (4) | `killEnemyFullHpAtTurnStart` | mort (tout tueur) d'un ennemi à PV pleins au début du tour du Challenger |
| Distance d'insécurité (4) | `eachMonsterNearAlly` 7982, 3 | fin du tour d'un joueur ; vrai par vacuité |
| Attirance (5) | `allPlayersGrabbedBySameRassemblement` | début du tour de la Mama (après son Rassemblement) : tous les joueurs vivants ont l'état 5918 |
| Trous dans les Troolls (5) | `distinctEnemiesEnterSpikesInTurn` 4 | EON5902 sur 4 ennemis distincts pendant le tour |
| D'une pierre trois coups (5) | `deathsBetweenCasts` 3 | morts d'ennemis (tout tueur) ; remise à zéro à chaque lancer direct du Challenger |
| Tout va bien (5) | `noPlayerAtOrBelowHpPct` 50 | fin de tour global : chaque joueur vivant à strictement plus de 50 % |
| Solitude (6) | `bossAliveWithoutAllies` | fin de tour global : Mama vivante sans autre monstre (avant son arrivée si `objectives.solitudeBeforeArrival`) |
| Quintuplé (6) | `killsByPlayersInGlobalTurn` 5 | morts attribuées à un joueur (ou à son invocation) ; remise à zéro en fin de tour global |
| Au coin ! (6) | `allEnemiesInSpikes` | fin du tour d'un joueur : tous les ennemis vivants portent 5902, hors Mama pré-combat (5971, ou tour < `objectives.mamaCountsFromTurn`) ; vrai par vacuité |
| Même pas mal (6) | `playerHitByBossWithoutHpLoss` | tour de la Mama (30539 posé à son début de tour, après le Rassemblement) : à chaque dommage qu'elle inflige (`CD`), un allié (camp des joueurs) touché (`D`, dommages finaux > 0) sans aucune variation de PV depuis le début de son tour (`VA` : perte ou soin) |

**Validation** différée au prochain point sûr (fin d'action, début / fin de tour, début de tour global) pour ne pas
interrompre la résolution d'un sort ; une validation de fin de tour global est datée du tour qui s'achève. **Récompense** (données) : le joueur crédité lance le sort de récompense
`rewardSpellLevel` (profondeur 1) : Spell Manager 30626 au niveau du palier (chaque joueur vivant apprend son sort
suivant : 3405 filtré par l'état d'archétype ; utilisable dans le tour selon `spells.newSpellUsableSameTurn`),
Faveur de la Mama 30659 (−1 cran, −5 % DF ; `boss.favourCap`), nettoyages, état « Objectif N Fini » sur l'entité de
scénario → déclencheur `EON590x` → 30443 niv. N+1 → **vote** 3404 (liste 10 + N). Au plus `objectives.maxCount`
objectifs ; pas de vote pour le palier 6 si `objectives.tier6Offered` est faux. Un objectif validé par le coup qui
termine le combat est enregistré sans récompense.

### Choix (`choices.ts`, ETUDE §2.7, §4.5, §8)

Le moteur crée les choix à partir des données (3008 / 3404, dédupliqués par lancer racine) ; le scénario remplit
`options` (objet remplacé, jamais modifié : les choix sont partagés entre clones) au point sûr suivant, retire les
choix sans objet (joueur mort, plus de vote, aucune carte) puis applique la réponse :

| Liste | Options (`ChoiceOption`) | Application |
|---|---|---|
| 17 Acclamation (T2–T9) | `bonuses.offerCount` cartes distinctes parmi les 6 de l'archétype (`bonuses.draw`) : `{ kind: 'acclamation', cardSpellLevelId, realSpellLevelId, stat, value, label }` | la carte lance l'accumulateur (bonus permanent) ; `bonuses.doubleApplication` : accumulateur relancé |
| 10 cadeau | `gifts.cardCount` cartes, composition tirée par `gifts.cardMix` (2 uniques / 2 améliorations / 1 + 1, complétée par l'autre type si nécessaire) : uniques de l'archétype + Pense Vite jamais obtenus (`{ kind: 'unique', spellLevelId }`), améliorations des sorts possédés non améliorés (`{ kind: 'upgrade', baseSpellLevelId, upgradedSpellLevelId, cardSpellLevelId }`) | `obtainSpell` (unique à usage unique ; effet d'obtention, ex. Relâchement) ; carte « Amélioration : X » (état boostedSpell, 3406, 3405 : nouveau sort, relance remise à zéro) |
| 11–15 vote | `objectives.offerCount` objectifs du palier suivant (`objectives.offerDraw`) : `{ kind: 'objective', objectiveId, tier, orientation, label }` | objectif activé |
| 16 archétype | options des données (non utilisée par la mise en place) | passif d'archétype |

Réponse : index d'option ; pour un vote, index retenu par l'équipe ou `{ votes: [...] }` (un index par votant ;
majorité, égalité tirée au sort — `tieBreak` des données). `objectives.votePolicy` et `bonuses.policy` relèvent de
l'appelant (runner / planificateur).

### Cadeaux (`gifts.ts`, ETUDE §3.7, §8.1, Q14)

Au début des tours `gifts.firstTurn`..`gifts.lastTurn`, avec la probabilité `gifts.spawnProbability`, l'entité de
scénario lance 30566 sur une case de `gifts.cells` sans combattant ni cadeau (`gifts.cellDraw` : uniforme ou pondérée
par les observations) ; aucun cadeau si toutes sont prises. Le cadeau persiste (son poseur ne joue jamais) ; il est
déclenché par un joueur qui y entre (marche, ou déplacement forcé si `gifts.pushedPlayerTriggers`), ce qui donne le
choix 10 à chaque joueur vivant et dissipe ce seul cadeau (moteur).

### Victoire et défaite (ETUDE §2.6)

Victoire : plus aucun ennemi vivant (Troolls et Mama) **et** état 5965 « combatCanFinish » sur l'entité de scénario
(posé par 30577 à partir de `victory.canFinishFromTurn`, T10). Tuer la Mama ne termine pas le combat. Défaite : plus
aucun joueur (personnage) vivant. `victory.turnLimit` : fin sans vainqueur au début du tour qui dépasse la limite.
Contrôle à chaque mort (crochet) et à chaque point sûr ; `state.phase = 'ended'`, `state.winner`,
`scenario.endReason`, événement `fightEnded`.

### API de pilotage (`GladiatroolFight`, fight.ts)

```ts
import { loadConfig } from './sim/src/data/index.js';
import { createGladiatroolFight, simpleMonsterController } from './sim/src/scenario/index.js';

const fight = createGladiatroolFight(undefined, loadConfig({ spawn: { mode: 'most_frequent' } }), {
  players: [{ archetype: 'acrobate', startCell: 314 }, { archetype: 'dompteur' }, { archetype: 'dompteur' }, { archetype: 'magicien' }],
  seed: 42,
  options: { monsterController: simpleMonsterController },
});
let st = fight.getStatus();                 // { kind: 'playerTurn', fighterId: J1 } au T1
fight.playerCast(80507, 256);               // Videur : 242 → 199 (pics)
fight.playerMove(300);                      // ou un chemin [c1, c2…]
st = fight.endTurn();                       // fin du tour, avance au point de décision suivant
st = fight.runUntilPlayerInput();           // joue les monstres jusqu'au prochain joueur / choix / fin
if (st.kind === 'choice') fight.resolveChoice(st.choice.uid, 0);
const copy = fight.clone({ keepLog: false }); // exploration (planificateur)
fight.getResult();                          // tour, PV, morts, objectifs, vagues, cadeaux, victoire
```

**Invariant** : hors d'un appel de méthode, le combat est à un point de décision (`getStatus()`, sans effet de bord) :

| `FightStatus.kind` | Signification | Appels attendus |
|---|---|---|
| `choice` | `choice: ScenarioChoice` (options remplies) ; les actions sont refusées (`PENDING_CHOICE`) | `resolveChoice(uid, réponse)` |
| `playerTurn` | `fighterId` : personnage joueur dont c'est le tour | `playerCast`, `playerMove`, `endTurn` |
| `monsterTurn` | `fighterId` : monstre (Trooll ou Mama) dont c'est le tour | `stepMonsterTurn(ia)` ou `runUntilPlayerInput(ia)` |
| `ended` | `winner` (`players` / `monsters` / null), `reason` (`victory`, `defeat`, `turnLimit`, `noFighter`) | `getResult()` |
| `idle` | aucun tour ni choix (seulement avec `autoStart: false` ou après manipulation directe du moteur) | `advance()` |

Lecture : `state` (moteur), `ctx`, `scenario` (`ScenarioState`), `turn`, `getCurrentFighter()`, `isPlayerTurn()`,
`isMonsterTurn()`, `isEnded()`, `getPendingChoice()` / `getPendingChoices()`, `getPlayers()` (ordre de jeu, morts
compris), `getLivingMonsters()`, `getMama()`, `getTimeline()` (`{ ids, index }`), `getActiveObjective()` (id, nom,
palier, résumé, compteur du tour, case marquée, allié désigné, morts du tour global), `canCast(sort, case)` et
`getCastableCells(sort)` pour le combattant courant (raisons en français), `describeLog()`, `getResult()`.

Actions (valeur de retour `ActionResult` du moteur : `{ ok, code?, reason? (fr), cast?, walk? }`) :

- `playerCast(spellLevelId, cell)` / `playerMove(chemin | case, { avoidSpikes? })` : joueur dont c'est le tour
  (`NOT_PLAYER_TURN` sinon ; codes du moteur : `PENDING_CHOICE`, `FIGHT_ENDED`, `NOT_ENOUGH_AP`, `COOLDOWN`,
  `LEARNED_THIS_TURN`, `UNREACHABLE`…) ;
- `cast(fighterId, …)` / `move(fighterId, …)` : même chose pour tout combattant dont c'est le tour (IA) ;
- après chaque action, point sûr : validation / récompense des objectifs, options des choix, fin du combat ; si le
  combattant courant est mort pendant son action (pics…), son tour se termine et le combat avance ;
- `endTurn()` : fin du tour courant puis `advance()` ; renvoie le nouveau point de décision ;
- `resolveChoice(uid, réponse)` → `{ ok, reason?, option? }` ; s'il ne reste ni choix ni tour en cours, avance ;
- `stepMonsterTurn(ia?)` : tour du monstre courant — `ia.playTurn(fight, id)` (`MonsterController`, ou une fonction
  `(fight, id) => void`), sauf tour à passer (Mama en attente sur 152, bug du cadeau : événement `info`), puis fin du
  tour et avance. Si un choix apparaît pendant le tour du monstre (objectif validé → vote), il renvoie `choice` sans
  terminer le tour : après la réponse, rappeler `stepMonsterTurn` (l'IA reprend avec ses PA / PM restants) ;
- `runUntilPlayerInput(ia?)` : `advance()` puis tours des monstres jusqu'à un tour de joueur, un choix ou la fin ;
- `advance()` : fins et débuts de tour, tours globaux (tours annulés, invocations sans PA, combattants morts terminés
  d'office) jusqu'au point de décision suivant, **sans** jouer les monstres ;
- `debugCompleteObjective(joueur?)` : valide l'objectif en cours (tests, exploration).

Contrôleurs : `MonsterController { playTurn(fight, fighterId) }` (l'IA du module `ai` s'y branchera) ;
`passiveMonsterController` (défaut, ne fait rien), `simpleMonsterController` (se rapproche sans entrer dans les pics
puis frappe le joueur le plus faible), `createRandomController(graine)` (actions aléatoires valides, joueurs ou
monstres), `playUntilEnd(fight, { players?, monsters?, choose?, maxTurn?, onStep? })`, `resolveAllChoices(fight,
pick)`. Fonctions de bas niveau (sur un `FightState` créé par le scénario, pour le planificateur) : `flushScenario`,
`checkEnd`, `resolveChoice`, `fillPendingChoices`, `activateObjective`, `completeActiveObjective`, `computeTimeline`,
`spawnWave`, `maybeSpawnGift`.

**Planificateur** : `fight.clone({ keepLog: false })` copie le moteur et le scénario ; les crochets vivent dans le
contexte (partagé) et ne lisent que l'état reçu. Les tirages du scénario utilisent des **flux dérivés** de la graine
du scénario (`options.scenarioSeed`, sinon `spawn.seed`, sinon la graine du combat) et de leur nature (vague n,
cadeau du tour t, Acclamations du tour t pour le joueur p, k-ième tirage de cartes de cadeau du joueur p, vote du
palier) : deux stratégies jouées sur la même graine voient les mêmes vagues, cadeaux et cartes (aux cases occupées
près ; ETUDE §10.7). Les jets et critiques restent dans `state.rng` (`rollMode` / `critMode` modifiables sur un
clone).

**Interface** : le journal typé du moteur porte aussi les événements du scénario (messages français par
`formatEvent`) : `waveSpawned`, `giftSpawned`, `objectiveActivated`, `objectiveCompleted`, `objectiveInfo` (case
marquée, allié désigné), `choiceResolved`, `fightEnded`, `info` (tour passé).

### Configuration utilisée

`timeline.*` (dont **`timeline.deadPlayersKeepSlot`**, ajouté au générateur `tools/simdata/build_sim_data.py` avec
son `_doc` et à `SimConfig`), `spawn.*`, `boss.actsBeforeArrival`, `boss.giftCancelsRassemblement`,
`boss.favourCap`, `objectives.*` (sauf `votePolicy`, pour l'appelant), `bonuses.offerCount` / `draw` / `firstTurn`
/ `lastTurn` / `doubleApplication` (`policy` : appelant), `gifts.*` (déclenchement : moteur), `victory.*`,
`spells.newSpellUsableSameTurn` (moteur), `rng.seed`, `engine.eventLog`. Le reste (pics, Mama, sorts) est appliqué
par le moteur.

### Modifications hors du module (signalées)

- `sim/src/engine/events.ts` : événements du scénario ajoutés à l'union `FightEvent` (`waveSpawned`, `giftSpawned`,
  `objectiveActivated`, `objectiveCompleted`, `objectiveInfo`, `choiceResolved`, `fightEnded`) et leurs messages
  français dans `formatEvent` (ajout pur).
- `tools/simdata/build_sim_data.py`, `sim/config/default.config.json` (régénéré), `sim/src/data/types.ts` : paramètre
  `timeline.deadPlayersKeepSlot`. Les données (`gladiatrool.data.json`) sont inchangées.

### Tests (`sim/test/scenario.*.test.ts`, aide `helpers/scenarioSetup.ts`)

- `setup` (9) : placement par défaut et imposé, noms, 1 à 4 joueurs, erreurs ; **T15** (V1 sur 242 / 358) ; passifs
  (PV 30 000, Puissance 0, états d'archétype, grimoire, 60 s) ; Mama (5971, 56, Faveur V, tour du T1 annulé) ; pics
  (2 marques de 96 cases), Empalé actif, déclencheurs des votes ; timeline initiale ; `hpMode` / `dompteurPower` ;
  contexte réutilisé, `autoStart`.
- `waves` (10) : compositions et tours des 10 vagues (31 Troolls + Mama = 832 000 PV, cases jouables hors pics),
  cases parmi les candidats du type, structure de V2 sur 30 graines, `most_frequent` (V2 = 246, 188, 412),
  `structured_slots` / `uniform_slots`, mêmes graines → mêmes cases quelles que soient les actions ; timeline : défaut,
  places libérées / gardées (`deadPlayersKeepSlot`), `monsters_after_mama`, `alternate_initiative`, `after_mama`,
  `by_initiative`, `explicit`.
- `boss` (7) : **T10** (T1–T6 annulés, T7 passé, arrivée au T8 sur 300 ; joueurs alignés repoussés au bord sans
  dommages de poussée, 2 000 d'entrée dans les pics seulement ; 300 occupée → 287), `actsBeforeArrival`, Attirance,
  bug du cadeau pendant le Rassemblement ; **T14** (DF 125 → 100 % après 5 objectifs, 95 % au 6e ; plafond 5 ;
  grimoire complet après 6 objectifs).
- `objectives` (23) : Empalé (Videur dans les pics → sorts du palier 1, Faveur, vote de 2 objectifs du palier 2, sort
  utilisable dans le tour ou grisé), mort non Vulnérable ; les 20 autres objectifs (situations réelles sur la carte ou
  événements synthétiques), remises à zéro, votes (3 options, votes individuels, égalité, réponses invalides),
  `maxCount` 5 et `tier6Offered`.
- `choices` (6) : fenêtres d'Acclamations aux T2–T9 (4 joueurs, 3 cartes distinctes), application simple / double ;
  cadeaux (T2–T9, cases libres, persistance), ramassage (choix de 2 cartes pour chaque joueur, seul ce cadeau
  disparaît), `cardMix`, amélioration (nouveau sort, relance remise à zéro), unique (effet d'obtention, jamais
  reproposé).
- `flow` (12) : victoire après V10, pas de victoire avant `canFinishFromTurn`, défaite (joueur mort pendant son tour :
  la main passe), `turnLimit`, choix pendant le tour d'un monstre, déterminisme (même graine = même journal),
  clonage (indépendance, rejeu identique), performances, combats de bout en bout (8 graines, A-D-D-M / A-A-D-M, IA
  aléatoire / simple des deux côtés, invariants à chaque point de décision : PV bornés, une entité par case,
  occupation cohérente, rien sur une case non jouable sauf la Mama sur 152, choix toujours remplis), ouverture de
  référence au T1 (Empalé).
- `verification` (48) et `robustness` (5) : vérification adversariale indépendante (section suivante et
  `docs/VERIFICATION.md`, « Vérification adversariale du scénario »).

### Performances (Node 22, T5, 20 combattants, journal désactivé)

| Opération | Coût |
|---|---|
| `fight.clone({ keepLog: false })` | ≈ 11 µs (dont moteur ≈ 10 µs) |
| clone + Frappe Repoussoir (`playerCast`, points sûrs compris) | ≈ 30 µs |
| clone + `endTurn` + `runUntilPlayerInput` (monstres de `simpleMonsterController`) | ≈ 140 µs |

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §2.1 Tour global, §2.2 Chronologie | `hooks.ts` (`onGlobalTurn`), `setup.ts` |
| §2.3 Vagues | `waves.ts` |
| §2.4 Ordre de jeu | `timeline.ts` |
| §2.6 Victoire / défaite | `hooks.ts` (`checkEnd`) |
| §2.7 Fenêtres de choix, §4.5 Acclamations | `choices.ts` |
| §3.5 Cases de départ, §4.1 Socle des archétypes | `setup.ts` |
| §3.7, §8.1 Cadeaux ; §8.2 Améliorations ; uniques | `gifts.ts`, `choices.ts` |
| §6 Mama (attente, arrivée, Faveur, bug du cadeau) | données + moteur ; `fight.ts` (tours passés), `objectives.ts` (plafond) |
| §7 Objectifs | `objectives.ts`, `choices.ts` (votes) |
| §10.7 Comparer les stratégies sur les mêmes tirages | `random.ts` |

### Choix, hypothèses et limites

- Objectifs déclaratifs : l'attribution des morts (Q18), la fenêtre de Même pas mal (tour de la Mama, ouverte après
  son Rassemblement), le marquage de Prendre sa place (distance de Manhattan au Challenger, égalité par ordre des ids) et les alliés
  de Distance d'insécurité (joueurs et invocations) sont des lectures des données ; les états d'objectif des données
  (6026, compteurs 5944…, 5917 Challenger, glyphe de Soleil) ne sont pas posés.
- Un joueur mort au moment d'une récompense n'apprend pas le sort (le Spell Manager ne vise que les vivants) : s'il
  est ressuscité, il lui manque ce sort.
- Les choix d'un joueur mort sont retirés ; tant qu'un choix attend, aucune action n'est possible (comme en jeu).
- Le contenu des fenêtres (cartes, objectifs proposés) est tiré selon la configuration ; les politiques de choix
  (`bonuses.policy`, `objectives.votePolicy`, Pense Vite `spells.penseVite.maxCasts`) relèvent du runner / planificateur.
- `giftCancelsRassemblement` : seul le tour de la Mama est passé (ses poussées du Rassemblement ont eu lieu).
- Repli d'apparition (aucun candidat libre) : case libre hors pics la plus proche du premier candidat (non observé).
- `simpleMonsterController` et `createRandomController` sont des contrôleurs de test, pas l'IA des monstres (module
  `ai`, profils `ai.profiles` de la configuration).

## Vérification adversariale du scénario (`sim/test/scenario.verification.test.ts`, `scenario.robustness.test.ts`)

### Rôle

Vérifier le scénario, de façon indépendante et sceptique, contre ÉTUDE §2, §3, §4.1, §4.5, §6, §7 et §8, SPEC §10-§12,
les notes 20, 30 et 40, les questions ouvertes et les niveaux de sort bruts. Les attendus sont écrits d'après ces
sources, jamais relus dans le code. Détail des contrôles, écarts et mesures : `docs/VERIFICATION.md`, section
« Vérification adversariale du scénario ».

### Fichiers

| Fichier | Contenu |
|---|---|
| `scenario.verification.test.ts` | Contrôles point par point : timeline (5), déroulé du tour global et moments exacts (4), Mama (attente, arrivée, invulnérabilité), victoire / défaite, tirage des apparitions (fréquences de V2 sur 1 500 graines, exclusions, déterminisme ; candidats sans type), Rassemblement (ordre attirer / pousser, sans dommages), Faveur (Mama morte), ordre des sorts appris (ÉTUDE §4.1 et Spell Manager), cartes de cadeau jusqu'à épuisement, choix, installation du suivi des objectifs (déclencheurs `I` / `TB`), et les 21 objectifs avec pour chacun un cas qui valide et un cas qui ne valide pas |
| `scenario.robustness.test.ts` | 200 combats complets en 4 lots de 50, pour une durée totale ≈ 6 s. Joueurs : IA aléatoire légale. Monstres : IA simple, aléatoires ou passifs. Deux jeux de configuration non standard, de 1 à 4 joueurs. Contrôle d'invariants (`checkState`) après chaque action et à chaque point de décision, avec auto-test sur états corrompus. `GLADIA_STATS=1` affiche les statistiques de chaque lot |

### Corrections apportées au scénario (signalées)

- `objectives.ts` :
  - `trackingStartsAtActivation`, lu dans les données : le suivi « pendant le tour » démarre à l'activation ou au
    prochain début de tour d'un joueur ; Pas le temps marque les ennemis dès l'activation ;
  - Même pas mal : la fenêtre est le tour de la Mama (déclencheurs `D` / `VA` / `CD` de 30539 / 30541) ;
  - Prendre sa place : la Mama sur 152 compte à partir de `objectives.mamaCountsFromTurn` ;
  - `markObjectiveDone(…, turn)` : une validation de fin de tour global est datée du tour qui s'achève.
- `scenarioState.ts` : champ `armed` (cloné) ; `PendingCompletion.turn`.
- `hooks.ts` : `flushScenario` ne ferme plus la fenêtre de Même pas mal (elle se ferme à la fin du tour de la Mama).
- `waves.ts` : les cases de pics ne sont jamais tirées (`spawn.allowUnassigned`).
- `sim/test/scenario.objectives.test.ts` (étape précédente) :
  - aide `forceAtTurnStart` (objectif actif depuis le début du tour) pour 5 tests qui supposaient un suivi immédiat ;
  - test Même pas mal réécrit.

### API ajoutée

- `trackingStartsAtActivation(data, objectif): boolean` (réexporté par `sim/src/scenario/index.ts`). Le
  planificateur peut s'en servir pour savoir si un objectif voté en cours de tour peut encore être réalisé dans ce
  tour.

### Correspondance avec l'ÉTUDE

| ÉTUDE | Contrôle |
|---|---|
| §2.1, §2.2 | ordre des événements de T1 à T11, moments de 30710 et 30577, arrivée au T8 |
| §2.3 | fréquences des apparitions, types, exclusions, jamais dans les pics |
| §2.4 | timeline (modèles, places libérées, invocations) |
| §2.6 | victoire (5965 et tous les ennemis), défaite, survivant unique |
| §4.1 | ordre d'obtention des sorts = Spell Manager |
| §6.3-§6.7 | 5971, tours annulés, invulnérabilité, Rassemblement, Faveur |
| §7 | les 21 objectifs (cas positif et négatif), installation du suivi |
| §8.1 | cartes de cadeau valides jusqu'à épuisement |

### Limites

- **IA des monstres.** Faute de module `ai`, les monstres sont joués par `simpleMonsterController`. Les combats de
  robustesse durent peu (défaite vers le T6 contre des joueurs aléatoires) ; les lots à monstres aléatoires ou passifs
  couvrent la seconde moitié du combat.
- **Hypothèses non tranchées.** Elles restent listées dans `docs/VERIFICATION.md` (§4 de la section Scénario) : ordre
  des buffs de début de tour de la Mama, sens de `after_mama`, unicité de Trous dans les Troolls, masques `Atq,A` des
  contrôles de fin de tour global.

## IA des monstres (`sim/src/ai/`)

### Rôle

Contrôleurs `MonsterController` du scénario pour les Troolls et la Mama : à chaque tour, le monstre lit l'état (sans
le modifier), cherche la meilleure séquence « déplacement → lancers → déplacement final » selon son profil
(`ai.profiles`) et une fonction d'utilité paramétrée (`ai.*`), puis la joue **par l'API publique** du combat
(`fight.move` / `fight.cast` : seulement des actions légales). Fournit aussi un mode « anticipation » rapide pour le
planificateur et une **estimation de menace** (`estimateThreat`). Déterministe (aucun `Math.random` ; égalités
tranchées par l'ordre des cases et des ids), aucune API Node (Web Worker possible). Le Poutch (invocation des
joueurs, 0 PA / 0 PM) ne joue pas ; le Rassemblement de la Mama est lancé par le moteur au début de son tour ; ses
tours d'attente (T1–T7) sont passés par le scénario sans consulter l'IA.

### Fichiers

| Fichier | Contenu |
|---|---|
| `env.ts` | `aiEnv(ctx)` (en cache) : règles des pics lues dans les sorts compilés (aura, sortie, dégâts d'entrée / de début de tour par camp), Rassemblement niv. 4, distance de chaque case aux pics |
| `settings.ts` | `aiSettingsFor(ctx, monstre)` : paramètres `ai.*` surchargés par le profil (`focus`, `skipIfInSpikes`, `skipIfNoTargetReachable`, `engageRadius`, `avoidSpikes`), règles résolues, poids |
| `board.ts` | `Board` : copie légère de l'état (PV en espérance, cases, boucliers, érosion, pics, Inébranlable, DF / érosion acquis, compteurs de lancers de l'acteur) ; marche avec transitions des pics ; clone ≈ 1 µs (tableaux JS) |
| `simulate.ts` | simulation **analytique** d'un lancer sur le plateau (mêmes formules et géométrie que le moteur : `senderDamage`, `receiveDamage`, `healAmount`, poussées / attirances / collisions, téléportation, échange, Inébranlable, DF, érosion, sous-sorts), validation (`boardCanCastSpell` / `boardCanCastOn`), classification des sorts (`spellInfo`) |
| `utility.ts` | fonction d'utilité, focalisation (`chooseFocus`), poids des cibles |
| `plan.ts` | `turnMemo` (décisions du début de tour), `planTurn` (recherche), `applyPlan` |
| `controller.ts` | `createMonsterAi(options)`, `monsterAi` (défaut), `anticipationMonsterAi` + `ANTICIPATION_OPTIONS`, `playMonsterTurn` |
| `threat.ts` | `estimateThreat(fight, options)`, `FAST_THREAT_OPTIONS` |
| `index.ts` | réexports |

### API publique (import : `sim/src/ai/index.ts`)

```ts
import { monsterAi, anticipationMonsterAi, createMonsterAi, estimateThreat, FAST_THREAT_OPTIONS } from './sim/src/ai/index.js';

const fight = createGladiatroolFight(data, config, { seed: 1, options: { monsterController: monsterAi } });
fight.runUntilPlayerInput();                       // les monstres jouent avec l'IA
const clone = fight.clone({ keepLog: false });     // planificateur : jets moyens + IA rapide
clone.state.rollMode = 'average'; clone.state.critMode = 'never';
clone.endTurn(); clone.runUntilPlayerInput(anticipationMonsterAi);
const th = estimateThreat(fight, FAST_THREAT_OPTIONS);
th.players;   // [{ fighterId, name, hp, expectedDamage, expectedHpAfter, killed, spikeDamage, pushedIntoSpikes, vulnerabilityAfter, cellAfter }]
th.monsters;  // [{ monsterId, name, damageDealt, actions }] dans l'ordre de jeu
const ai = createMonsterAi({ roll: 'expected', critExpectation: true, maxStartCells: null, onPlan: (plan) => {} });
```

`MonsterAiOptions` : `roll` (`expected` = espérance, défaut ; `average` = jet `average` du moteur),
`critExpectation` (critiques en espérance, défaut vrai), `maxStartCells` (cases de départ évaluées, les plus proches
de la cible ; null = toutes), `finalMoveCandidates` (séquences retenues pour le déplacement final, 3), `maxReplans`
(6), `logDecisions` (messages « … : dans les pics : ne se déplace pas. » / « aucune cible à portée » dans le journal),
`onPlan`. `ANTICIPATION_OPTIONS` = jet `average`, sans critique, 12 cases de départ, 2 séquences finales, 2
re-planifications, sans message. Bas niveau : `Board.fromState(state, opts)`, `board.setActor(id, nouveauTour)`,
`turnMemo(board, réglages)`, `planTurn(board, réglages, memo, opts)` → `MonsterPlan { steps, predicted, value, mode,
board }`, `applyPlan`, `utility`, `boardCast`…

### Déroulé d'un tour (plan.ts, controller.ts)

1. **Début du tour** (`turnMemo`, gardé pour tout le tour, même si un vote l'interrompt) : cible de focalisation
   (`ai.focus` : `maxDamage` = aucune, chaque joueur compte pleinement ; `lowestHp` = PV effectifs les plus bas —
   PV / multiplicateur des pics, un joueur Vulnérable compte pour moitié ; `nearest` ; la Mama focalise le joueur aux
   PV effectifs les plus bas si `ai.mamaFocusSingleTarget`) ; mode du tour :
   - `stayInSpikes` : dans les pics avec `skipIfInSpikes` → ne se déplace pas, lance seulement ce qui est possible
     depuis sa case ;
   - `noTarget` : aucun ennemi à moins de `engageRadius` cases (défaut : PM + PO maximale + zone des sorts offensifs)
     avec `skipIfNoTargetReachable` → idem (un Nitrooll peut encore soigner) ;
   - `advance` (règle désactivée) : il se rapproche ; `act` : cas général.
2. **Recherche** : cases de départ = case actuelle, plus (si `moveBeforeCast`, ou si rien n'est lançable depuis sa
   case) chaque case atteignable dans ses PM **sans toucher les pics** (`avoidSpikes` ; parcours où les pics
   bloquent ; dans les pics, chemin qui en traverse le moins), élaguées aux cases d'où une cible est à portée.
   Depuis chacune, séquence de lancers :
   - `ai.sequenceMode = profile` : règles du profil dans l'ordre, chacune répétée (`times`, `maxTargets` pour un
     sort monocible, limites du sort) tant qu'elle s'applique et rapporte (> 1 PV équivalent) ; case choisie par
     l'utilité. Une règle dont le sort déplace le lanceur (Tambour, Troollooportation) est facultative : la passe
     sans elle est aussi évaluée ;
   - `greedy` : meilleur lancer utile à chaque pas, variantes commençant par un sort sur soi (Patroolleur).
   Puis **déplacement final** (PM restants) vers la distance préférée (`preferredDistance`) sur les 3 meilleures
   séquences. Plan retenu : utilité maximale, puis moins de PM, puis ordre de découverte.
3. **Exécution** : chaque action par l'API ; après chacune, les cases réelles sont comparées aux cases prévues : écart
   (critique, mort, poussée différente) ou refus → nouvelle planification avec les PA / PM restants.

Candidats : sort monocible → cases des ennemis (et des alliés pour soins / échanges ; alliés offensifs seulement si
`ai.monstersCanTargetAllies`) ; zone → cases d'un ennemi ou couvrant ≥ 2 ennemis ; case libre (Troollooportation) →
cases à portée de zone d'un ennemi, hors pics si `avoidSpikes` ; sur soi → sa case.

### Règles `when` des profils

| Règle | Application |
|---|---|
| `enemyReachable` | un sort offensif du monstre atteint un ennemi depuis sa case (Patroolleur) |
| `targetAtDistance2` | cible ennemie à exactement 2 cases (Aspiratrooll : l'attire au contact) |
| `enemyInRing1to2` | un ennemi à 1–2 cases (Troollpoline) |
| `anyTarget` / `pushTowardSpikes` | meilleure case utile (l'utilité compte les pics : poussée vers / dans les pics préférée) |
| `maxTargets` | case qui touche le plus d'ennemis, puis utilité (Mortrooll, Mitroollette) |
| `mostInjuredAlly` | allié (lui compris) sous `healThresholdPct` % de PV, le plus blessé d'abord (Trooll de Magie) |
| `threatenedAlly` | allié non Inébranlable à ≤ `ai.threatenedAllyDistance` des pics avec un joueur à ≤ 6 cases (Tambour) |
| `playersInZoneAtLeast` | au moins `count` ennemis touchés (déplacés ou blessés) par le sort (Catastrooll) |
| `nearLowestHpPlayer` | case au contact de la cible focalisée (sinon PV effectifs les plus bas) (Troollooportation) |

### Utilité (PV équivalents, utility.ts)

- **Ennemis** : PV retirés × poids de la cible (1 ; `ai.nonFocusWeight` hors cible focalisée ;
  `ai.summonTargetWeight` pour le Poutch), part due aux pics × `ai.spikePushWeight` ; mort : + `ai.killBonus` ;
  rendu Vulnérable (aura ou sortie ×2) : + `ai.vulnerableValue` × `spikePushWeight` ; chaque case gagnée vers les
  pics : + `ai.positionWeight` × `spikePushWeight`.
- **Alliés** (monstres, lui compris) : PV perdus en négatif, PV rendus × `ai.healWeight`, mort − `killBonus`,
  rendu Vulnérable − `vulnerableValue` ; rendu Inébranlable + `ai.unshakableValue` s'il est menacé (près des pics et
  un joueur à ≤ 6 cases), moitié s'il est loin des pics, rien sans joueur proche ; déplacé en position menacée sans
  Inébranlable : − `unshakableValue` / 2.
- **Position finale** : − `positionWeight` par case d'écart à `preferredDistance` (par rapport à la cible focalisée,
  sinon l'ennemi le plus proche) ; entrée volontaire dans les pics (marche, téléportation) interdite si `avoidSpikes`.

### Confrontation aux observations (ÉTUDE §5.8, N20 §8-§9, N60 §4.5, QUESTIONS_OUVERTES Q2)

| Comportement | Statut | Implémentation |
|---|---|---|
| Troolls qui « passent leur tour » dans les pics (cardxc 12:30, 14:30 ; sspritenL ; Zephiron 11:00) | observé | `skipIfInSpikes` : ne bouge pas ; lance seulement depuis sa case (lecture « sans sortie utile » : H) |
| … ou quand les joueurs sont loin ; « il a pas skip parce que mon Sacri était trop près » (cardxc 12:30) | observé | `skipIfNoTargetReachable` + `engageRadius` (défaut PM + portée : H) |
| Artroolleurs qui tirent à distance (Koza 07:00) | observé | profil `moveBeforeCast` faux, distance préférée 3–8 |
| Troollibres Inébranlables dès T1 (Barbe Douce 01:52, Huz 15:00) | observé | Patroolleur en tête du profil (`enemyReachable`) |
| Nitrooll qui soigne | observé (moyen) | `mostInjuredAlly`, seuil 80 % (H) |
| Mama qui concentre ses sorts sur un joueur (−20 000 / −21 000 : Huz, Matspyder4) | observé | `mamaFocusSingleTarget` : autres joueurs × `nonFocusWeight` ; au T8 dans les tests, Catastrooll puis Mitroollette sur un joueur ramené Vulnérable ≈ −25 000 |
| Mama « pousse en ligne droite », met les persos dans les pics | observé | Rassemblement (moteur) ; Uppertrooll repousse 6 (utilité des pics) |
| Poussées préférées vers les pics | H (N20 §9) ; contredit par « il est un peu bête » (Koza 10:30) | `spikePushWeight` (0 = ignore les pics) |
| La Mama passe-t-elle son tour dans les pics ? | non observé | profil `mama.skipIfInSpikes` faux (les tours passés observés concernent les Troolls) |
| Ordre des sorts, cible exacte, trajectoires | non observé | ordres `ai.profiles` (N20 §9), utilité (H) |

### Estimation de menace (threat.ts)

Sur un plateau partagé : chaque monstre vivant qui jouera avant que la main revienne au combattant courant (ordre de
la timeline ; le monstre courant finit son tour ; Mama en attente exclue) commence son tour (glyphe de début de tour
dans les pics ; Rassemblement pour la Mama arrivée) puis joue le plan de l'IA (mêmes réglages et tours passés) ; les
poussées et morts s'enchaînent, les joueurs sont supposés passifs. Avec `FAST_THREAT_OPTIONS` sur un combat en jet
`average` sans critique, la prévision **égale** le passage réel joué par `anticipationMonsterAi` (test, T1). Non
simulés : vagues, cadeaux et fenêtres du tour global suivant, arrivée de la Mama, déclencheurs différés.

### Configuration utilisée

`ai.focus`, `skipIfInSpikes`, `skipIfNoTargetReachable`, `engageRadius`, `avoidSpikes`, `moveBeforeCast`,
`monstersCanTargetAllies`, `mamaFocusSingleTarget`, `sequenceMode`, `nonFocusWeight`, `killBonus`,
`spikePushWeight`, `healWeight`, `summonTargetWeight`, `unshakableValue`, `positionWeight`,
`threatenedAllyDistance`, **`vulnerableValue`** (nouveau, 2 000) et `ai.profiles` (dont la surcharge
**`mama.skipIfInSpikes = false`**, nouvelle) ; `spikes.*` (transitions des pics sur le plateau, lues dans les sorts
compilés et la configuration), `boss.rassemblementBlockedByUnshakable`.

### Performances (Node 22, bundle, 3 combats T1–T12 à 4 joueurs « increvables », jusqu'à 25 monstres)

| Opération | Coût |
|---|---|
| tour de Troollibre / Artroolleur / Nitrooll (planification + exécution) | médiane ≈ 0,15–0,3 ms, p90 ≈ 0,5–1,5 ms, max ≈ 6 ms |
| tour de la Mama | médiane ≈ 1 ms, p90 ≈ 3,5 ms |
| `estimateThreat` (tous les monstres) | médiane ≈ 5 ms (≈ 3 ms en `FAST_THREAT_OPTIONS`), p90 ≈ 10 ms |
| `Board.clone()` / `copyFrom` | ≈ 0,8 µs / 0,3 µs |

### Tests (`sim/test/ai.*.test.ts`, aide `helpers/aiSetup.ts`)

- `ai.board` (2) : plateau ↔ moteur sur > 300 lancers de tous les sorts des Troolls et de la Mama (joueurs placés au
  hasard, jet moyen) : PV et cases identiques, état intact ; marche dans / hors des pics (−2 000, ×2, Vulnérable).
- `ai.behavior` (13) : Troollibre au contact (Patroolleur + frappe), approche sans traverser les pics, mode glouton ;
  Artroolleur qui tire depuis sa case ; Nitrooll qui soigne un allié à 50 % ; Nitrooll qui pousse un joueur dans les
  pics ; tours passés (pics, cible hors de portée, `engageRadius`) et leurs alternatives ; Mama au T8 (frappe) et en
  attente (IA non consultée) ; focalisation.
- `ai.fight` (6) : combats complets ADDM / AADM contre joueurs aléatoires (dont 2 jusqu'au T12 avec joueurs
  increvables) : aucune erreur, invariants, aucun lancer refusé, aucune marche dans les pics ; déterminisme ;
  performances (< 5 ms en moyenne) ; un clone rejoue à l'identique ; menace (état intact, égalité avec le passage
  réel).

### Modifications hors du module (signalées)

- `tools/simdata/build_sim_data.py` (+ `_doc`), `sim/config/default.config.json` (régénéré par `npm run build:data`),
  `sim/src/data/types.ts` : paramètres `ai.sequenceMode`, `nonFocusWeight`, `killBonus`, `spikePushWeight`,
  `healWeight`, `summonTargetWeight`, `unshakableValue`, `positionWeight`, `threatenedAllyDistance`,
  `vulnerableValue`, surcharges de profil (`focus`, `skipIfInSpikes`, `skipIfNoTargetReachable`, `engageRadius`,
  `avoidSpikes`) et `mama.skipIfInSpikes = false`. Aucune modification du moteur ni du scénario.

### Limites

- Pas de recherche en profondeur entre monstres (chacun optimise son tour ; l'estimation de menace les enchaîne).
- Le plateau ignore les boucliers posés, les états autres qu'Inébranlable, les déclencheurs différés et les marques ;
  les critiques sont mélangés en espérance seulement quand les listes normale et critique ont la même structure.
- Tour de la forme déplacement → lancers → déplacement (pas de déplacement entre deux lancers, sauf re-planification).
- Rayon « joueur à portée de poussée » (6 cases) : choix d'implémentation.
- Tous les poids d'utilité et les profils sont des hypothèses (Q2) à calibrer sur les VOD (tours passés, cibles).

## Planificateur (`sim/src/planner/`)

### Rôle

Trouver, pour le personnage joueur dont c'est le tour, la meilleure **séquence d'actions** (déplacements, sorts,
cases) et, pour l'équipe, la meilleure suite de tours dans le tour global. Pur TypeScript **sans API Node** (horloge
`performance.now()` ou `Date.now()` via `globalThis`) : il tournera tel quel dans un Web Worker. Il n'agit **que par
l'API publique** de `GladiatroolFight` (`clone`, `playerMove`, `playerCast`, `endTurn`, `stepMonsterTurn`,
`resolveChoice`, `advance`) sur des copies : aucune écriture directe dans l'état, aucune action illégale possible
(le moteur refuse et la macro-action est écartée). Le combat passé en argument n'est jamais modifié (sauf
`executePlan` / `createPlannerController`, qui jouent le plan retenu par la même API).

### Fichiers

| Fichier | Contenu |
|---|---|
| `index.ts` | point d'entrée (réexports) |
| `types.ts` | types publics sérialisables : `PlannedAction`, `PlanOptions`, `SearchBudget`, `PlayerPlan`, `PlanAlternative`, `PlanSummary`, `TeamPlan`, `SearchStats` |
| `weights.ts` | `PlannerWeights` (poids documentés champ par champ), `DEFAULT_WEIGHTS`, `mergeWeights` |
| `spellInfo.ts` | `spellProfile` : profil d'un niveau de sort lu dans les effets **compilés** (sous-sorts compris) — cibles pertinentes (ennemis / alliés / soi), zones et portée de zone, orientation, dégâts moyens, poussée / attirance / échange / téléportation / avance / invocation, unique ; `monsterSpellReach` (portée d'attaque d'un monstre) |
| `actions.ts` | génération et élagage des macro-actions (`generateCastActions`, `generateEndMoves`, `castPositions`) |
| `evaluate.ts` | évaluation statique `evaluateState` (+ `evaluateWithDetail`), lectures utiles (`damageMultiplier`, `spikeDistance`, `mamaInfo`, `monsterInSpikes`…), score positionnel rapide `cellPositionScore` |
| `simulate.ts` | `applyMacro` (macro-action sur une copie), `runLookahead` (anticipation), `planningClone` (jets moyens, sans critique, **graines neutralisées** : voir « Choix, hypothèses et limites »), `stateHash` (transpositions) |
| `search.ts` | `BUDGETS`, `searchPlayerTurn` (beam search + anticipation), `planPlayerTurn`, `executePlan`, `createPlannerController` |
| `team.ts` | `planTeamTurn` (tour global, beam d'équipe), `advanceToNextPlayer` |
| `explain.ts` | explications françaises (`describeMacro`, `summarize`, `explanationText`) calculées par différence d'états |
| `choicePolicy.ts` | `defaultChoicePolicy` (préférences statiques : votes §7.3, cadeaux §8.3, Acclamations selon `bonuses.policy`), `resolveChoicesWith` |
| `policies.ts` | politiques de choix évaluées et configurables (`createChoicePolicy`, `scoreChoice`, `objectiveFeasibility`, `acclamationValue`) : section « Politiques de choix » |

### API

```ts
import { planPlayerTurn, planTeamTurn, executePlan, createPlannerController } from './sim/src/planner/index.js';

const plan = planPlayerTurn(fight, { mode: 'fast' });   // ou 'deep' (interface), 'greedy'
plan.actions;       // [{type:'cast', spellLevelId:80507, cell:256}, {type:'move', path:[328,343,329]}, …, {type:'end'}]
plan.score;         // score final (après anticipation), plan.staticScore : avant
plan.explanation;   // texte français multi-lignes (actions, dégâts, pics, morts, objectif, risques, anticipation)
plan.summary;       // bilan structuré (dégâts par cible, entrées dans les pics, morts, case finale, risques…)
plan.alternatives;  // N meilleures alternatives DIFFÉRENTES (autre suite de lancers), même forme
plan.stats;         // nœuds, simulations, feuilles, anticipations, temps, tronqué ?
executePlan(fight, plan.actions);                       // applique le plan (API publique), s'arrête au 1er refus

const team = planTeamTurn(fight, { mode: 'fast', teamBeamWidth: 3 });
team.steps;         // [{ fighterId, fighterName, plan }] dans l'ordre de la timeline ; team.explanation, team.score

playUntilEnd(fight, { players: createPlannerController({ mode: 'fast' }), choose: defaultChoicePolicy });
```

Options (`PlanOptions`) : `mode`, `budget` (surcharges de `SearchBudget`), `weights` (surcharges partielles, tables
fusionnées clé par clé), **`monsterController`** (IA des monstres pendant l'anticipation : `MonsterController` ou
fonction ; défaut `anticipationMonsterAi` du module `ai` — jets moyens, sans critique, recherche élaguée),
`choicePolicy`, `teammateController` (coéquipiers des anticipations `fullRound` / `globalTurn`), `rollMode` (défaut `average`),
`critMode` (défaut `never`), `explain`, `deterministic` (supprime le plafond de temps : résultat indépendant de la
machine, utilisé par les tests), `oracle` (défaut faux ; **triche**, pour mesure seulement : anticiper avec les vrais
tirages futurs). `createPlannerController` replanifie (2 fois au plus) si une action est refusée
(jets réels ≠ jets moyens) et, en **boucle fermée** (tour 4), dès que l'état réel s'écarte d'un **point de contrôle**
du plan (`PlayerPlan.checkpoints` : combattants vivants et leurs cases prévus après chaque lancer ; `executePlan`
option `checkpoints` → `deviated`), par exemple quand un coup critique tue une cible plus tôt que prévu (4 fois au
plus par tour, `maxDeviationReplans`).

### Algorithme

1. **Macro-actions** (`actions.ts`) : « se déplacer vers m (optionnel) puis lancer s sur c » et « finir le tour en se
   déplaçant vers m ». Le grimoire est relu à chaque nœud : sorts **appris en cours de tour** (objectif validé,
   `checkCaster` applique `spells.newSpellUsableSameTurn`), **uniques** (disparaissent après usage), tour **Pense
   Vite** (lancers plafonnés à `spells.penseVite.maxCasts` quand la durée du tour vaut `turnSeconds`). Élagage
   géométrique, sans simulation :
   - positions de lancer : cases atteignables par un chemin **sans traversée de pics** (un lanceur déjà dans les pics
     peut en traverser pour sortir) ; entrée volontaire dans les pics seulement pour un **échange** avec un ennemi
     hors des pics (« Voltige depuis les pics ») ;
   - cases ciblées : autour des entités **pertinentes** (ennemis pour un sort offensif, alliés pour soin / boost /
     échange, soi pour un sort personnel, cadeaux pour une téléportation), dans la portée de zone du sort ; la zone
     doit toucher au moins une entité pertinente (positions du lanceur après son déplacement) ; filtres du moteur
     reproduits (portée, ligne, diagonale, case libre / occupée, ligne de vue, lancers par cible) ;
   - **déplacements dominés** : deux positions qui produisent le même effet (mêmes cibles, mêmes directions de
     poussée, même case finale d'une avance / d'un échange) → seule la moins coûteuse en PM est gardée ; pour un sort
     dont l'effet ne dépend pas de la position, la première position valide suffit ;
   - **estimation a priori** : dégâts moyens × multiplicateur de la cible / multiplicateur futur, mises à mort,
     **poussées dont la trajectoire finit dans les pics** (`computeForcedMove` de la géométrie), échanges depuis les
     pics, soins utiles, cadeau, coût des PM et des uniques ; tri, quota par sort (diversité), plafond ;
   - fins de tour : meilleures cases selon `cellPositionScore` (pics, bord, lignes de la Mama, menace, cadeau, case
     marquée de l'objectif) ; les cadeaux atteignables et la case marquée sont toujours essayés.
2. **Beam search** (`search.ts`) : chaque nœud est une copie (`applyMacro` : `playerMove` puis `playerCast`, choix
   résolus par la politique), évaluée statiquement ; enfants dédupliqués par empreinte d'état (A puis B = B puis A) ;
   les `beamWidth` meilleurs sont développés, jusqu'à `maxDepth` lancers ou épuisement des PA.
3. **Feuilles** : pour chaque nœud gardé, « finir ici » et « finir en se déplaçant vers m » (`endPositions`) ; nœuds
   terminaux (joueur mort, fin du combat) compris ; à score égal, le plan le plus court.
4. **Anticipation** des `lookaheadLeaves` meilleures feuilles : copie en jets moyens sans critique, fin du tour, puis
   **un passage de chaque combattant jusqu'au prochain tour du joueur** (`fullRound`, défaut des modes fast et deep
   depuis le tour 3 de la boucle d'amélioration : coéquipiers joués par un planificateur glouton, monstres par le
   **contrôleur injecté** ; tour de la Mama et monstres du tour global suivant compris : le dernier joueur du tour
   global — souvent le Magicien — voit enfin les monstres qui jouent après le premier joueur). Autres modes : la
   suite du tour global seulement (`globalTurn`, défaut au tour 2 : arrêt au début du tour global suivant), arrêt au
   prochain joueur (`nextPlayer`) ; l'évaluation de l'état atteint est le score final. Égalité de score final (plusieurs lignes qui convergent vers le même état) : score statique de
   la feuille, puis plan le plus court. Les feuilles non anticipées restent classées derrière.
5. **Plan d'équipe** (`team.ts`) : planification successive de chaque joueur dans l'ordre de la timeline, les
   monstres intercalés simulés (`advanceToNextPlayer`, arrêt au début du tour global suivant, dont les choix ne sont
   pas résolus) ; `teamBeamWidth` = K > 1 : les K meilleurs états d'équipe (feuilles de suites de lancers distinctes)
   sont gardés après chaque joueur.

### Évaluation (`evaluate.ts`, poids `weights.ts`)

Score en « PV équivalents » (1 = 1 PV de monstre hors pics retiré), à maximiser ; seules les différences comptent.
Victoire / défaite : ±10⁷. Termes (ÉTUDE §10.2 sauf mention) :

| Terme | Calcul | Poids par défaut |
|---|---|---|
| PV des monstres | −PV / multiplicateur futur (×2 dans les pics ou Mama, ×1,6 dehors : il sera probablement poussé — frapper une cible non multipliée gaspille, frapper une cible Vulnérable en tire tout le bénéfice) ; dégâts de début de tour dans les pics déduits | `monsterHp` 1, `futureMultInSpikes` 2, `futureMultOutside` 1,6 |
| Présence d'un monstre | −valeur par type (retirée à sa mort) | `monsterAlive` : Troollibre 5 000, Artroolleur 6 000, Nitrooll 7 000, Mama 30 000 ; défaut 4 000 |
| Monstre condamné | PV ≤ 1 000 × multiplicateur dans les pics : compté mort à `spikeDeathConfidence` (ne pas le frapper, §10.2 n° 4) | 0,85 |
| Menace | chaque monstre vise le joueur atteignable (PM + portée des sorts) le plus exposé (multiplicateur reçu, résistances, puis PV) : dégâts par type × DF, ×0,25 dans les pics, ×0,15 hors de portée, × `threatDecay`^(tours de joueurs avant le sien) (« tuer celui qui joue juste après soi ») ; perte de PV × `threatWeight`, risque de mort (sigmoïde) × `playerDeath` × `deathRiskWeight`, risque de poussée dans les pics (k ≤ force) | `monsterThreat` Troollibre 9 000, Artroolleur 4 000, Nitrooll 3 000, Mama 15 000, `threatDecay` 0,8 (plancher 0,45), `threatWeight` 0,6, `deathRiskWeight` 0,5, `pushRisk` 2 000 |
| Piège des pics (tour 4) | la menace d'un Troollibre contre un joueur resté **dans les pics** est multipliée par 2,5 (Aspiratrooll le sort : Vulnérable ×2 ; frappe ; Troollpoline le renvoie dedans : 2 000 × 2 ; ≈ 20 000 à 24 000 PV observés contre ≈ 9 000 estimés) ; le facteur compte aussi dans le choix de la cible du monstre | `spikeTrapThreat` (Troollibre 2,5) |
| Joueurs | +PV × 0,4 ; mort −60 000 ; dans les pics −3 000 ; bord −400 × (3 − k) ; **aligné avec la case d'arrivée de la Mama** (au tour qui précède son arrivée ; case calculée comme le moteur : 300 puis replis `boss.arrivalFallback`) ou avec la Mama arrivée −9 000, sur la case d'arrivée −4 000 | `playerHp`, `playerDeath`, `playerInSpikes`, `playerEdge`, `mamaLine`, `mamaArrivalCell` |
| Objectifs (§7) | validé : sort débloqué pour chacun (9 000) + Faveur −5 % tant que la Mama vit (1 500) ; progression du compteur pendant le tour (×2 500) ; condition de fin de tour / de tour global déjà remplie (×0,6 × 9 000 ; « 1, 2, 3, Soleil ! » : joueur courant sur sa case de départ et aucun joueur précédent en échec, ×2) | `objectiveCompleted`, `objectiveFavour`, `objectiveProgress`, `objectivePendingFactor` |
| « Attention, sol glissant » (§7) | objectif en cours : un ennemi poussable (hors Mama) à ≤ 1 200 PV vaut 3 000 (on le garde pour une collision) ; génération : une poussée / attirance dont la **collision prévue** (`computeForcedMove` + `collisionDamages`) tue la cible ou un ennemi percuté reçoit +`objectiveCompleted` a priori | `pushKillSetup` 3 000, `pushKillHp` 1 200 |
| Cadeaux (§8) | +5 000 par cadeau ramassé ; cadeau encore sur la carte : fraction de sa valeur (désactivé par défaut, voir docs/AMELIORATIONS.md) | `giftTaken`, `giftOnMapFactor` 0, `giftUniqueEstimate`, `giftUniqueUntilTurn` |
| Ressources (§8.3) | uniques gardés jusqu'à un tour (Relâchement de Fureur jusqu'au T7 : 15 000, Dégagez ! T8 : 7 000, Pense Vite T6 : 6 000…), boosts futurs (PA 700, PM 200, % DF 60, PO 250 par tour, plafonnés) | `uniqueHold`, `uniqueHoldDefault`, `apFutureValue`… |
| Mama (§6) | fenêtre de burst ouverte (arrivée, dans les pics, non invulnérable) × joueurs qui jouent encore / 3 | `mamaWindow` 12 000 |
| Mama coincée (§6.6) | Mama arrivée, dans les pics mais invulnérable (aucune nouvelle entrée possible) : pénalité levée dès qu'on l'en sort ; génération : attirance / poussée qui la sort (estimation a priori + `mamaStuck`), échange depuis toute case (le lanceur prend sa place) | `mamaStuck` 10 000 |
| PV de la Mama arrivée | poids relatif d'un PV de la Mama (1 : comme un Trooll ; 1,6 essayé au tour 3 : neutre) | `mamaHpWeight` 1 |

Les valeurs sont des **hypothèses de départ** (ordres de grandeur de l'ÉTUDE : Videur Vulnérable ≈ 8 700, Impact
Vulnérable ≈ 8 700, menace d'un Troollibre ≈ 9 000…) à calibrer par le runner Monte Carlo ; toutes sont surchargeables
(`weights`).

### Modes et budgets (`BUDGETS`)

| Mode | beam | candidats / nœud (quota par sort) | lancers max | fins de tour | feuilles anticipées (+ tour critique) | anticipation | plafond |
|---|---|---|---|---|---|---|---|
| `fast` (Monte Carlo) | 3 | 40 (6) | 4 | 2 | 4 (+4) | `fullRound` | 300 ms |
| `deep` (interface) | 8 | 220 (25) | 6 | 5 | 12 (+6) | `fullRound` | 3 s |
| `greedy` (coéquipiers) | 1 | 16 (3) | 3 | 1 | 0 | aucune | 40 ms |

**Tour critique** (`lookaheadExtraLeaves`, tour 4) : si la meilleure anticipation perd un joueur vivant à la racine
ou en laisse un sous 35 % de ses PV (`lookaheadDanger`), les feuilles suivantes du classement statique sont anticipées
à leur tour (la recherche ne regarde plus loin que là où c'est utile : coût moyen quasi nul).

Le budget est d'abord un budget de nœuds (résultat déterministe) ; le plafond de temps est un garde-fou (développement
arrêté à 55 %, feuilles à 70 %, anticipations jusqu'à 100 % ; `stats.truncated`). `deterministic: true` le supprime.

### Performances (Node 22, un cœur, combats complets contre `simpleMonsterController`)

| Mesure | fast | deep |
|---|---|---|
| T1, Acrobate (ouverture) | ≈ 50 ms | ≈ 45 ms (≈ 370 ms avec `lookahead: 'globalTurn'`) |
| tour de joueur, médiane / p95 / max (12 combats ADDM / AADM) | ≈ 30 / 95 / 120 ms | ≈ 75–130 / 550–900 / 1 800 ms |
| combat complet (≈ 45 tours de joueurs) | ≈ 1,5 s | ≈ 6–12 s |
| `planTeamTurn` fast, T1 (K = 1 / K = 3) | ≈ 50 / 120 ms | — |

Avec l'IA fidèle en anticipation (`anticipationMonsterAi`, défaut depuis l'intégration) et sans plafond de temps
(runner, mode fast) : médiane ≈ 34 ms, p95 ≈ 110 ms, max ≈ 1,9 s par tour de joueur ; ≈ 2–3 s par combat (bench,
48 combats). Depuis l'anticipation `globalTurn` par défaut (tour 2) : ≈ 1,9 × plus lent, ≈ 3,3 s par combat au bench
(42 s pour les 48 combats sur 4 cœurs). Depuis l'anticipation `fullRound` (tour 3) : encore ≈ 2 × plus lent, médiane
≈ 105 ms, p95 ≈ 310 ms, max ≈ 380 ms par tour de joueur, ≈ 5,5 s par combat (≈ 70 s pour le bench de 48 combats). Tour 4
(feuilles supplémentaires dans les tours critiques, boucle fermée : ≈ 0,12 replanification par tour de joueur) :
médiane ≈ 120 ms, p95 ≈ 280 ms par tour de joueur (replanifications comprises), ≈ 6 s par combat (≈ 76 s pour le
bench).

### Tests (`sim/test/planner.test.ts`, `planner.flow.test.ts`)

- Ouverture T1 (§10.4) : double Videur, les deux Troollibres dans les pics (fast et deep), plan sérialisable, combat
  passé intact, exécution par l'API ; le double Videur de référence (256 puis 372) est parmi les meilleurs ; plan
  d'équipe du T1 (deux morts, Empalé, personne dans les pics) ; beam d'équipe ≥ planification successive.
- §10.2 : un Dompteur frappe la cible Vulnérable ; un Trooll ≤ 2 000 PV dans les pics n'est pas frappé ; un joueur
  placé dans les pics en sort ; fins de tour sans traversée de pics.
- T7 (§10.5) : case d'arrivée prévue (300, replis du moteur) ; les 4 joueurs finissent hors des lignes.
- Profils de sorts, élagage (clés uniques, plafond), évaluation, poids fusionnés, contrôleur des monstres injectable,
  politique de choix (Productivité), Pense Vite, `executePlan` (refus), performances.
- Bout en bout : deux combats complets (ADDM, AADM) pilotés par le planificateur (fast, déterministe) : fin du
  combat, invariants du scénario, aucun joueur qui entre dans les pics en fin de tour, médiane < 250 ms (150 ms avant
  l'anticipation `fullRound`).
- Boucle d'amélioration : `planner.mama.test.ts` (Mama coincée dans les pics, tour 1), `planner.objectives.test.ts`
  (tour 2 : poussée qui tue par collision en tête des candidats et jouée pour « Attention, sol glissant », valeur
  `pushKillSetup`, condition de « 1, 2, 3, Soleil ! »), `planner.lookahead.test.ts` (tour 3 : l'anticipation
  `fullRound` du dernier joueur va jusqu'à son tour suivant, `globalTurn` s'arrête au début du tour global suivant),
  `planner.danger.test.ts` (tour 4 : menace du piège des pics ×`spikeTrapThreat` sur un joueur dans les pics et pas
  dehors ; `lookaheadDanger` ; feuilles supplémentaires anticipées seulement dans un tour critique).

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §10.2 principes autour des pics (multiplicateurs, tuer le suivant, laisser mourir seul, ne pas finir dans les pics) | `evaluate.ts` (`futureMult*`, `threatDecay`, `spikeDeathConfidence`, `playerInSpikes`) |
| §10.3 combos (poussées vers les pics, Voltige depuis les pics) | `actions.ts` (trajectoires `computeForcedMove`, échanges depuis les pics) |
| §10.4 ouverture T1 | tests `planner.test.ts` |
| §10.5 T7 hors des lignes, pas sur 300 | `mamaLine`, `mamaArrivalCell`, `mamaInfo` |
| §6 Mama (fenêtre T8) | `mamaWindow` |
| §7.3 votes, §8.3 cadeaux, §10.6 Acclamations | `choicePolicy.ts` |

### Choix, hypothèses et limites

- L'anticipation utilise l'IA injectée (par défaut `anticipationMonsterAi` : l'IA fidèle en mode rapide) : la qualité des
  plans dépend de cette IA (branchée par l'intégration, voir « Runner »).
- Les choix qui apparaissent pendant une simulation (vote, cadeau, Acclamation) sont supposés résolus par la
  politique de choix (`assumedChoices` du plan).
- **Pas d'information cachée** (revue, docs/VERIFICATION.md) : `planningClone` remplace la graine du scénario et le
  PRNG de combat de la copie par des valeurs dérivées (hachage salé `PLANNING_SEED_SALT` + tour ; déterministe,
  indépendant des vrais tirages). L'anticipation `fullRound`, qui franchit le début du tour global suivant, imagine
  donc des cases d'apparition, un cadeau, des cartes et des Acclamations plausibles, **pas les vrais**. Quand les
  cartes réelles d'un cadeau diffèrent des cartes imaginées, un lancer d'un sort absent du grimoire est traité par
  `executePlan` (avec `checkpoints`) comme un **écart** (`deviated`) et non comme un refus : le contrôleur replanifie
  avec les cartes réelles. `oracle: true` (`PlanOptions`, `PlannerSettings`) rétablit les vrais flux pour mesurer
  l'effet de la triche (expérience `oracle`).
- Jets moyens, sans critique : un plan peut devenir illégal ou sous-optimal avec les jets réels (le contrôleur
  replanifie : action refusée, ou écart avec un point de contrôle — seuls les vivants et les cases sont comparés, pas
  les PV).
- Évaluation heuristique : la menace ignore les lignes de vue et les chemins réels des monstres (portée = PM + PO +
  zone) ; les boosts futurs sont valorisés forfaitairement ; les poids sont à calibrer (§10.7).
- Piège des pics (tour 4) : seul le combo du Troollibre (attirer hors des pics, frapper, repousser dedans) est
  modélisé, par un facteur forfaitaire sur la menace ; l'IA élaguée de l'anticipation peut encore choisir un autre
  ordre de sorts que l'IA réelle.
- Un seul déplacement avant chaque lancer (pas de « déplacement, lancer, déplacement » dans une même macro-action,
  mais la suite de macro-actions le permet) ; les invocations des joueurs ne sont pas pilotées.

### Modifications hors du module (signalées)

- Aucune dans le code des autres modules. `docs/ARCHITECTURE.md` : ligne `planner` du tableau des modules et cette
  section. Les ajouts `ai.*` de `sim/config/default.config.json`, `sim/src/data/types.ts` et
  `tools/simdata/build_sim_data.py` appartiennent au module `ai` (non modifiés ici).
- Boucle d'amélioration, tour 4 : `sim/src/runner/runFight.ts` et `sim/src/runner/types.ts` (module runner :
  replanification en boucle fermée, options `replanOnDeviation` / `maxDeviationReplans`).

## Politiques de choix (`sim/src/planner/policies.ts`)

### Rôle

Répondre aux fenêtres de choix du scénario (Acclamations, cartes de cadeau, votes d'objectifs, archétype) pour le
runner, l'interface et les simulations du planificateur. Chaque option reçoit une **note** et une **raison en
français** (`scoreChoice`) ; la politique choisit la meilleure (égalité : la première). Lecture seule de l'état,
déterministe, sans API Node.

### API

```ts
import { createChoicePolicy, scoreChoice, objectiveFeasibility, acclamationValue } from './sim/src/planner/index.js';

const policy = createChoicePolicy({ acclamation: 'PA_first', vote: 'planner', gift: 'planner' }); // ChoicePolicy
policy(choice, fight);                         // index d'option (réponse d'équipe pour un vote)
scoreChoice(choice, fight, opts);              // [{ index, label, score, reason }]
objectiveFeasibility(fight, 'productivite');   // { score: 0..1, reason }
configChoicePolicy;                            // tout selon la configuration du combat (défaut du runner)
```

`PolicyOptions` : `acclamation` (défaut `bonuses.policy`), `vote` (défaut `objectives.votePolicy`),
`fixedVoteOrder` (défaut `objectives.fixedVoteOrder`), `gift` (`planner` | `preference`, défaut `planner`),
`objectivePreference`, `giftPreference` (surcharges des tables). Le planificateur reçoit la même politique
(`PlanOptions.choicePolicy`) : les choix supposés pendant une anticipation sont ceux que fera le runner.

### Acclamations (ÉTUDE §4.5, §10.6 ; `bonuses.policy`)

- `PO_first`, `PA_first`, `DF_first` : ordre fixe par archétype (`ACCLAMATION_ORDER` de `choicePolicy.ts`).
- `planner` : **choix évalué** — valeur marginale de la carte pour ce personnage, en PV équivalents par tour :
  - potentiel du tour = sac à dos borné sur le grimoire (coût en PA, lancers par tour, uniques exclus) de la valeur
    d'un lancer : dégâts moyens × (1 + Force / 100) (profil compilé `spellProfile`) + forfait (soin 3 000,
    poussée / attirance 1 200, déplacement 1 000, boost allié 2 000, autre 600 : `ACCLAMATION_EVAL`) ;
  - +PA : gain de potentiel, ou la moitié du gain de deux cartes × 0,85 (un PA seul peut ne rien débloquer) ;
  - +% DF : % × dégâts du potentiel ; critique : % × dégâts × 0,3 ; dommages critiques : valeur × frappes × taux ;
  - +PO : potentiel × part par archétype (Acrobate 0,2, Dompteur 0,08, Magicien 0,1), × 0,6 par PO déjà acquise
    au-delà de la première ; +PM : 5 % ; dommages de poussée : 1,2 % par 100 ;
  - défense : résistances × 7 000 dommages reçus par tour ; vitalité × 0,15 ; % soins × soins du potentiel ;
  - l'ordre de l'ÉTUDE (table `planner`) départage les cartes de valeur proche (+25 par rang).
  Exemples (T1) : Dompteur +10 % DF ≈ 870 > +1 PO ≈ 690 > +1 PM ≈ 430 ; Magicien +1 PA ≈ 2 300 (3e sort) ;
  Acrobate +1 PO ≈ 2 000.

### Cartes de cadeau (ÉTUDE §8.1-§8.3)

Base : priorités `GIFT_PREFERENCE` (§8.3 : Relâchement de Fureur > Dégagez ! > Galvanisation > Pense Vite > Muraille
> Influx > Ultime Espoir… ; améliorations Videur > Hanedimane > Aïronemane, Impact > Prélèvement, Regain >
Amplification > Pulsation > Protection). `gift: 'planner'` corrige selon la situation : Relâchement +25 jusqu'au T4
(monte pendant 4 tours pour le T8), +5 aux T5-T7, +5 de plus pour un Dompteur, −20 / −40 ensuite ou Mama morte ;
Immortalités +15 jusqu'au T8 (−15 après) ; Muraille +10 jusqu'au T8 ; Pense Vite +5 jusqu'au T7 (−25 après) ;
Dégagez !, Punition Collective, Pulsation Chaotique +10 à partir du T6 ; Ultime Espoir +30 si un allié est mort ;
Influx +10 si un allié est sous 60 % ; Démotivation +10 à partir du T5 tant que la Mama vit (−50 sinon) ;
amélioration : + (8 − tour) (durable).

### Votes d'objectifs (ÉTUDE §7.2-§7.3 ; `objectives.votePolicy`)

- `planner` : note = 10 × faisabilité + 0,5 × préférence (`OBJECTIVE_PREFERENCE`, 1-10, §7.3). **Faisabilité**
  (`objectiveFeasibility`, heuristique documentée dans le code, 0-1 ≈ « validé vite ») lue dans la composition
  (archétypes, grimoires : Voltige, Dégagez !, boucliers), les monstres vivants (types, PV effectifs = PV /
  multiplicateur), la vague suivante (données), la Mama et les PV des joueurs. Exemples : Stop aux projectiles et
  Distance d'insécurité = 1 sans Artroolleur ; Productivité 0,95 si un joueur peut lancer 3 sorts (sinon 0,2) ;
  Ébranlable 0,8 avec des Troollibres / Nitroolls ; Tout va bien 0,9 si tous les joueurs sont au-dessus de 70 % ;
  Solitude selon les PV des Troolls restants (0 si la Mama est morte) ; Soleil 0,25 ; Attirance ≤ 0,15.
- `fixed` : premier objectif proposé dans `objectives.fixedVoteOrder` (nouveau paramètre ; défaut : recommandations
  §7.3 palier par palier) ; hors liste : note −1.
- `preference` : préférence seule (ancien comportement de `defaultChoicePolicy`).

### Archétype (liste 16)

L'option dont l'archétype est celui du personnage (mise en place) ; les compositions sont décrites par le runner
(`parseComposition`).

### Configuration utilisée

`bonuses.policy`, `objectives.votePolicy` (valeur `preference` ajoutée), **`objectives.fixedVoteOrder`** (nouveau :
ajouté au générateur `tools/simdata/build_sim_data.py` avec son `_doc`, à `SimConfig` et à
`sim/config/default.config.json` régénéré).

### Limites

- Heuristiques (H) non calibrées : la faisabilité ne simule pas le tour ; la valeur des Acclamations est myope (un
  tour, grimoire actuel). À départager par le Monte Carlo (`comparer` avec `policies`) : sur le bench (24 graines),
  `planner` / `PA_first` / `PO_first` / `DF_first` ne se distinguent pas significativement.
- Pense Vite (`spells.penseVite.maxCasts`) : géré par le planificateur (lancers plafonnés), pas par la politique.

## Runner (`sim/src/runner/`)

### Rôle

Jouer des combats complets de bout en bout avec le planificateur (joueurs), l'IA fidèle (monstres) et les politiques
de choix ; produire des résultats complets, des journaux lisibles et des traces rejouables ; reconstruire une
situation décrite en JSON ; mener des expériences Monte Carlo appariées (multi-cœurs en Node) ; fournir le bench de la
boucle d'amélioration. Tout agit par l'API publique de `GladiatroolFight` (actions légales). Pur TypeScript sans
API Node, sauf `nodeExperiment.ts` et `nodeWorker*.ts`.

### Fichiers

| Fichier | Contenu |
|---|---|
| `types.ts` | types sérialisables : `RunSetup`, `RunOptions`, `FightRunResult`, `FightTrace` / `TraceStep`, `Variant`, `ExperimentSpec`, `VariantStats`, `PairedComparison`, `ExperimentResult` |
| `compositions.ts` | `parseComposition` (« ADDM », « AADM@287,314,286,315 », « NOM=… »), `compositionOf` |
| `runFight.ts` | `runFight`, `contextFor` (contexte moteur mis en cache par surcharges), `monsterControllerFor`, `totalEnemyHp`, `destroyedEnemyHp`, `resultLine` |
| `trace.ts` | `installRecorder` (enregistrement sur l'instance), `replayTrace` (rejeu jusqu'à un point), `fightFromTrace` |
| `journal.ts` | `JournalNotes` (notes du runner placées dans le journal du moteur), `buildJournal` (événements filtrés + notes) |
| `situation.ts` | format `Situation`, `validateSituation`, `buildSituation` (docs/FORMAT_SITUATION.md) |
| `stats.ts` | `wilsonInterval`, `meanStat`, `mcnemarExactP`, `variantStats`, `pairedComparison` |
| `experiment.ts` | `experimentJobs`, `runJob`, `summarizeExperiment`, `runExperimentSync`, `parseSeeds`, `formatExperimentTable` |
| `nodeExperiment.ts` | `runExperiment` (Node, worker_threads) |
| `nodeWorkerBoot.mjs`, `nodeWorker.ts` | worker : amorce tsx (`tsx/esm/api` → `register()`), puis tâches variante × graine |
| `bench.ts` | `BENCH_SPEC`, `BENCH_VERSION`, `benchSummary` (rapport JSON), `formatBench` |
| `asciiMap.ts` | `renderMap` (vue écran du client : lignes décalées), `fighterLabels` |
| `index.ts` | réexports (partie pure) |

### `runFight(setup, options)` → `FightRunResult`

```ts
const r = runFight({ compo: 'AADM', seed: 3 }, { mode: 'fast', journal: true, trace: true });
r.victory; r.reason;            // 'victory' | 'defeat' | 'turnLimit' | 'maxTurn' (arrêt du runner)
r.turnReached; r.progress;      // tour atteint ; PV ennemis détruits / 832 000 (toutes les vagues + Mama)
r.playerDeaths; r.objectives; r.mamaKilledTurn; r.choices; r.timing; r.journal; r.trace;
```

Boucle (machine à états du combat) : choix → politique (notée, raison enregistrée) ; tour de joueur →
`planPlayerTurn` puis `executePlan` (jusqu'à `maxReplans` = 2 replanifications si une action est refusée avec les jets
réels, et jusqu'à `maxDeviationReplans` = 4 si l'état réel s'écarte d'un point de contrôle du plan — boucle fermée,
tour 4), puis `endTurn` ; tour de monstre → `stepMonsterTurn(ia)` ; arrêt à la fin du combat ou au-delà de `maxTurn`
(défaut 20). Les combats utilisent les jets **aléatoires** de la graine (`rng.rollMode` de la configuration) ; le
planificateur planifie sur des copies en jets moyens.

Options : `mode` (planificateur des joueurs, défaut `fast`), `planner` (`budget`, `weights`, `deterministic` — défaut
vrai en fast / greedy : budget de nœuds seul, résultat indépendant de la machine et de la charge ; faux en deep —,
`maxReplans`, `replanOnDeviation` (défaut vrai) et `maxDeviationReplans` (défaut 4), `anticipationAi` — options de l'IA des monstres pendant l'anticipation, fusionnées sur
`ANTICIPATION_OPTIONS`, p. ex. `{ "maxStartCells": null, "critExpectation": true }` ; absent : `anticipationMonsterAi`),
`policies` (`PolicyOptions`), `configOverrides`, `monsters` (`ai` = `monsterAi` du module `ai`,
défaut ; `simple` ; `passive`), `players` (`planner` | `passive`), `maxTurn`, `journal`, `trace`.

**Branchement de l'IA** : monstres réels = `monsterAi` (jets en espérance, recherche complète) ; anticipation du
planificateur = `anticipationMonsterAi` (défaut de `PlanOptions.monsterController` depuis l'intégration).

Métriques : `enemyHpTotal` = somme des PV de base des monstres de toutes les vagues des données (Mama comprise :
832 000) ; `enemyHpDestroyed` = pour chaque monstre apparu (hors invocations), PV de base − PV restants (mort : PV de
base ; soins des Nitroolls déduits) ; `progress` = rapport des deux ; `playerDeaths` (nom, tour, cause : tueur, pics,
poussée) ; `mamaKilledTurn` ; `timing` (planification par tour : médiane, p95, max ; temps des monstres ;
replanifications).

### Journal et trace

- **Journal** : événements utiles du moteur (tours, lancers directs, dégâts, soins, déplacements, morts, Vulnérable /
  Inébranlable, vagues, cadeaux, objectifs, sorts appris, messages de l'IA) et notes du runner **à leur place** :
  `◇ Plan de X (mode, score, ms)` + explication du planificateur ; `◆ Vote / Acclamation / Cadeau — joueur : option —
  raison [écartés : …]` ; replanifications ; bilan final.
- **Trace** (`FightTrace`, JSON) : mise en place, surcharges, pas (lancers et déplacements réussis de TOUS les
  combattants, fins de tour, réponses aux choix). `installRecorder` remplace `cast` / `playerCast` / `move` /
  `resolveChoice` sur l'instance du combat réel (les copies du planificateur ne sont pas concernées).
  `replayTrace(trace, { turn, fighter } | { step })` rejoue par l'API publique (monstres : contrôleur qui rejoue leurs
  pas) : même état exact (mêmes jets, vérifié par les tests) ; erreur française si la trace ne correspond plus.

### Situations (`buildSituation`)

Voir docs/FORMAT_SITUATION.md. La reconstruction est une **mise en place** (comme les aides de test), pas une action
de planification : avancée passive jusqu'au tour demandé, Troolls de la situation créés (sort de départ), anciens
retirés, objectifs réalisés validés (récompenses du jeu), ordre de jeu recalculé, placement par téléportation du
moteur (pics traités), états, grimoires (cartes d'amélioration, uniques obtenus), Acclamations (cartes du jeu), PV,
cadeaux, objectif en cours armé par `objectivesOnTurnStart`.

### Expériences (`runExperiment`, `runExperimentSync`)

`ExperimentSpec` = `{ variants: Variant[], seeds, mode?, maxTurn? }` ; `Variant` = `{ name, compo | players,
configOverrides?, policies?, planner?, mode?, monsters? }`. Tâches = graines × variantes : **mêmes graines pour toutes
les variantes** (mêmes vagues, cadeaux, cartes, jets tant que les actions coïncident) → comparaison appariée.

Statistiques par variante (`VariantStats`) : victoires, taux et **intervalle de Wilson** à 95 %, tour atteint,
progression, objectifs, morts (moyenne, écart-type, IC normal), Mama tuée (fraction, tour moyen), raisons de fin,
durée par combat. Par paire (`PairedComparison`) : graines gagnées par une seule variante (**McNemar exact**,
binomiale bilatérale), différence de progression et de tour (IC). Sortie JSON (`ExperimentResult`) et tableau
français (`formatExperimentTable`).

Multi-cœurs (`nodeExperiment.ts`) : un worker par cœur (défaut `availableParallelism()`, la CLI plafonne à 4), tâches
distribuées à la demande, résultats remis dans l'ordre des tâches (agrégat indépendant du nombre de workers ; le test
vérifie l'égalité avec le fil courant). Chargement TypeScript des workers : l'option `--import tsx` ne s'applique pas
au module d'entrée d'un worker (Node 22 le charge alors par son effacement de types natif, sans la correspondance des
imports `.js` → `.ts`) ; l'amorce `nodeWorkerBoot.mjs` appelle `register()` de `tsx/esm/api` puis importe
`nodeWorker.ts` (fonctionne sous tsx, vitest et `node`). Repli sur le fil courant si aucun worker ne démarre
(`onWarning`).

### Bench (`bench.ts`)

`BENCH_SPEC` : ADDM et AADM, graines 1-24, mode fast (déterministe), `maxTurn` 20. `benchSummary` → `BenchReport`
(`overall` et `byCompo` : combats, victoires, taux + IC de Wilson, progression, tour atteint, objectifs, Mama tuée,
morts, ms par combat ; comparaison appariée ADDM − AADM ; durée ; workers). Aucun réglage du mode fast n'a été
nécessaire : ≈ 30-35 s sur 4 cœurs (bien sous la cible de 6 minutes).

**Bench initial** (`npm run cli -- bench`, Node 22, 4 cœurs, 33 s ; reproductible à l'identique d'une exécution à
l'autre) :

| | Victoires (IC Wilson 95 %) | Progression | Tour atteint | Objectifs | Mama tuée | Morts | s / combat |
|---|---|---|---|---|---|---|---|
| Global | 40 / 48 = 83,3 % (70,4–91,3 %) | 97,4 % | 12,69 | 5,38 | 83,3 % | 0,23 | 2,7 |
| ADDM | 21 / 24 = 87,5 % (69,0–95,7 %) | 95,9 % | 11,58 | 5,29 | 87,5 % | 0,42 | 2,1 |
| AADM | 19 / 24 = 79,2 % (59,5–90,8 %) | 98,9 % | 13,79 | 5,46 | 79,2 % | 0,04 | 3,2 |

Apparié ADDM − AADM : 4 / 2 graines gagnées par une seule composition (McNemar p = 0,69) : pas de différence
significative sur 24 graines. Échecs : 6 arrêts au T21 (Mama seule, voir « Limites »), 2 défaites (ADDM graines 15,
20).

### Performances (Node 22, 4 cœurs, bench)

| Mesure | Valeur |
|---|---|
| combat fast (ADDM / AADM) | ≈ 2,0 / 3,0 s en moyenne (tours de joueur : médiane ≈ 34 ms, p95 ≈ 110 ms, max ≈ 1,9 s) |
| IA des monstres réelle (`monsterAi`), par combat | ≈ 30 ms |
| bench (48 combats, 4 workers) | ≈ 31-35 s |
| démarrage d'un worker (tsx + données) | < 1 s |
| `buildSituation` | ≈ 20-45 ms |

### Tests (`sim/test/runner.*.test.ts`, `cli.test.ts`)

- `runner.fight` (6) : résultat complet d'un combat (greedy, 3 tours), journal (plans, votes), trace rejouée à
  l'identique puis jusqu'à un point (T2, J3) ; déterminisme en fast ; joueurs passifs → défaite ; Wilson, moyennes,
  McNemar ; graines et compositions ; expériences sur le fil courant et en **workers** (mêmes résultats).
- `runner.policies` (6) : ordres fixes, valeurs marginales évaluées, votes (faisabilité, Productivité avant / après
  Regain, Solitude sans Mama, liste fixe de la configuration), cadeaux (Relâchement tôt, Ultime Espoir, améliorations),
  archétype.
- `runner.situation` (5) : les 4 exemples de `sim/examples` (cases, PV, Troolls, objectifs), états et Acclamations,
  grimoires, ordre de jeu, plan T1 (deux Troollibres dans les pics), T3 (morts, cible non Vulnérable épargnée), Mama
  (T7 en attente, T8 arrivée), validation.

### Correspondance avec l'ÉTUDE

| ÉTUDE | Code |
|---|---|
| §10.1, §10.7 A-D-D-M contre A-A-D-M sur les mêmes graines | `experiment.ts`, `stats.ts` (appariement, McNemar), `bench.ts` |
| §10.6, §10.7 politique de bonus | `policies.ts` (Acclamations), variantes `policies.acclamation` |
| §7.3 votes, §8.3 cadeaux | `policies.ts` |
| §10.4 ouverture, §10.5 T7 / T8 | `sim/examples/*.json`, `buildSituation` |
| §11 sensibilité aux hypothèses | variantes `configOverrides` |

### Limites (constatées au bench initial)

- **Mama seule, invulnérable dans les pics** : principale cause d'échec au bench initial (6 arrêts au T21). Corrigé au
  tour 1 de la boucle d'amélioration (terme `mamaStuck`, génération des attirances / échanges qui la sortent) : voir
  docs/AMELIORATIONS.md.
- Défaites (2 sur 48) : effondrement d'un côté du plateau contre des Troollibres au T6-T9 (ADDM graines 15, 20).
  Tour 2 : anticipation du tour global entier et objectif « Attention, sol glissant » (voir docs/AMELIORATIONS.md) ;
  échecs restants ≈ 1 à 2 % (effondrements au T9-T13, objectifs bloqués, Mama coincée dans un coin de pics sans sort
  d'attirance). Tour 3 : anticipation `fullRound` (le Magicien Vulnérable resté dans les pics puis happé par un
  Troollibre n'était pas vu) : échecs ≈ 0,5 % (effondrements au T9-T11 pendant que la Mama vit encore).
- Journal : les dégâts « attendus » des plans sont en jets moyens ; les jets réels diffèrent.
- La trace n'enregistre que les actions réussies : une action refusée ne consomme rien (propriété du moteur).

## CLI (`sim/src/cli/index.ts`)

`npm run cli -- <commande>` (script `tsx sim/src/cli/index.ts`) ; guide : docs/GUIDE.md. `main(argv, io)` est exporté
(tests : sorties capturées) ; arguments `--clé valeur`, `--clé=valeur`, `--drapeau` ; erreurs en français (code 1),
commande inconnue (code 2).

| Commande | Options | Sortie |
|---|---|---|
| `carte` | `--coords` | carte ASCII (ids, pics `^`, départs `J`, cadeaux `*`, centre `+`, Mama `M`, obstacles `#`) et légende |
| `simuler` | `--compo`, `--graine`, `--mode`, `--journal`, `--trace fichier`, `--json`, `--monstres`, `--tours-max`, `--config`, `--bonus`, `--vote`, `--cadeaux` | journal ou bilan ; résultat JSON ; trace écrite |
| `planifier` | `--situation fichier` ou `--trace fichier` (`--tour`, `--joueur`, `--etape`), `--mode` (défaut deep), `--seul`, `--alternatives` | état + carte, plan du tour global (courant et suivants) ou du seul courant, explications, actions JSON |
| `comparer` | `--compos A,B,NOM=…`, `--variantes fichier`, `--graines 1-100`, `--mode`, `--coeurs`, `--config`, `--bonus`, `--vote`, `--cadeaux`, `--tours-max`, `--sortie`, `--silence` | tableau comparatif + comparaisons appariées ; JSON complet |
| `bench` | `--graines` (défaut 1-24), `--coeurs`, `--sortie`, `--json`, `--silence` | résumé français ou rapport JSON |

Progression des expériences sur la sortie d'erreur ; `GLADIA_DEBUG=1` affiche la pile d'une erreur inattendue.

### Modifications hors des modules runner / cli (signalées)

- `sim/src/planner/search.ts` : contrôleur d'anticipation par défaut `anticipationMonsterAi` (au lieu de
  `simpleMonsterController`) ; `sim/src/planner/types.ts` (commentaire) ; `sim/src/planner/choicePolicy.ts` :
  `ACCLAMATION_ORDER` exporté ; `sim/src/planner/index.ts` : exports de `policies.ts` (nouveau fichier du
  planificateur, écrit ici).
- `tools/simdata/build_sim_data.py`, `sim/src/data/types.ts`, `sim/config/default.config.json` (régénéré par
  `npm run build:data`, données inchangées) : `objectives.fixedVoteOrder`, valeur `preference` de
  `objectives.votePolicy`.
- `docs/ARCHITECTURE.md` : tableau des modules, section « Planificateur » (contrôleur par défaut, performances avec
  l'IA fidèle) ; nouveaux documents `docs/GUIDE.md`, `docs/FORMAT_SITUATION.md` ; exemples `sim/examples/`.

---

## Analyse et campagnes d'expériences (`sim/src/analysis/`, `sim/src/cli/campaign.ts`, `sim/src/cli/report.ts`)

### Rôle

Expériences comparatives du rapport `docs/RESULTATS.md` : compositions, effectifs réduits, politiques (Acclamations,
votes, placement), sensibilité aux hypothèses non tranchées, et **analyse a posteriori** des combats (statistiques
par tour, sorts, mises en pics, vagues, dégâts subis). Le module ne joue rien lui-même : les combats sont joués par
le runner (`runFight`, planificateur en mode fast déterministe), puis analysés en **rejouant leur trace** par l'API
publique (`replayTrace`, journal d'événements du moteur activé). Le planificateur, l'IA, le scénario et le moteur ne
sont pas modifiés.

### Fichiers

| Fichier | Contenu |
|---|---|
| `analysis/fightAnalysis.ts` (pur) | `analyzeTrace(trace)` → `FightAnalysis` ; `analyzeEvents` ; `aggregateAnalyses(liste)` → `AnalysisAggregate` |
| `analysis/campaigns.ts` (pur) | définitions `CAMPAIGN` (10 expériences), `SENSITIVITY`, `PESSIMISTIC` ; `runAnalyzedJob`, `compactRun` / `runFromCompact`, `runCacheKey`, `summarizeCampaign` → `ExperimentReport` |
| `analysis/report.ts` (pur) | tableaux Markdown français (variantes + IC de Wilson, comparaisons appariées, morts, objectifs, par tour, sorts, cases de mise en pics, vagues, dégâts subis, choix) |
| `cli/campaign.ts` (Node) | exécution multi-processus (`fork` + IPC, `--import tsx`), cache JSONL facultatif, écriture de `sim/results/<id>.json` |
| `cli/report.ts` (Node) | lecture de `sim/results/*.json` et impression des tableaux |

### Analyse d'un combat (`FightAnalysis`)

Dépouillement du journal d'événements rejoué (aucune hypothèse supplémentaire) :

- **par tour global** (fin du tour, instantané pris à l'événement `globalTurn` suivant) : PV restants des ennemis
  présents (Troolls apparus vivants ; Mama à partir de son arrivée au T8), ennemis restants, joueurs vivants, PV de
  l'équipe (bornés à 100 %), ennemis tués, entrées d'ennemis dans les pics (état 5902), objectifs cumulés ;
- **sorts** des joueurs (sort de base et version améliorée regroupés par nom) : lancers directs (profondeur 0), PA,
  PV ôtés aux ennemis et ennemis tués dans la **fenêtre du lancer** (du lancer jusqu'à la prochaine action ou fin de
  tour du même joueur : dégâts directs, collisions, dégâts d'entrée dans les pics et morts qui en découlent), mises
  en pics provoquées ; les dégâts subis par les monstres pendant leur propre tour (pics de début de tour) ne sont
  attribués à aucun sort ;
- **mises en pics** : déplacement forcé (poussée, attirance, échange, avance, téléportation) causé par un joueur ou
  son invocation qui fait passer un ennemi d'une case hors pics à une case de pics (case de départ, d'arrivée, sort) ;
- **vagues** : monstres apparus, entrés au moins une fois dans les pics, tués, tués avant leur premier tour, tués
  pendant leur tour global d'apparition, morts sur une case de pics ;
- **dégâts subis** par les joueurs, par source (type de monstre, « pics », « poussée », « alliés »).

`runAnalyzedJob` vérifie que le rejeu retrouve la même issue et le même tour final (sinon erreur).

### Campagnes (`CAMPAIGN`)

| Id | Variantes | Graines par défaut | Analyse |
|---|---|---|---|
| `compos-ref` | ADDM, AADM | 1001-1200 | oui |
| `compos-autres` | ADDM, AADM, AAMD, ADMD, ADDD, DDDM, ADMM, DADM, AMDD | 1001-1060 | oui |
| `effectifs` | ADDM, ADM, ADD, AAD, AD, DD, A, D, M | 1001-1030 | non |
| `bonus` | ADDM / AADM × Acclamations planner, PO_first, PA_first, DF_first | 1001-1060 | non |
| `votes` | ADDM / AADM × votes planner, fixed, preference | 1001-1060 | non |
| `placement` | ADDM (4 placements), AADM (3 placements) | 1001-1060 | non |
| `sensibilite` | ADDM / AADM × 12 hypothèses (`SENSITIVITY`) + référence | 1001-1040 | non |
| `cadeaux` | ADDM / AADM, cadeaux normaux et rares (Q14, p = 0,3) | 1001-1160 | non |
| `pessimiste` | ADDM / AADM sous `PESSIMISTIC` (Q3 + Q4 + IA jouant dans les pics + cadeaux rares) | 1001-1160 | oui |
| `bonus-pess` | ADDM / AADM × 4 politiques d'Acclamations sous `PESSIMISTIC` | 1001-1060 | non |
| `oracle` | ADDM / AADM sous `PESSIMISTIC`, planificateur neutre contre planificateur **tricheur** (`planner.oracle`, vrais tirages futurs) — mesure de la revue | 1001-1080 | non |

Chaque variante peut désigner une **référence** (`ref`) : la synthèse calcule la comparaison appariée (mêmes
graines ; test exact de McNemar sur les issues, différence moyenne de progression et de morts avec IC normal à 95 %).
Les graines 1001+ n'ont pas servi à l'amélioration du planificateur (graines 1-768). Le mode fast étant
déterministe (budget de nœuds seul), un combat est entièrement déterminé par (variante hors nom, graine) : c'est la
clé du cache, qui permet de partager les combats ADDM / AADM entre expériences.
**Le cache ne connaît pas la version du code** : après toute modification du moteur, du scénario, de l'IA ou du
planificateur, il faut repartir d'un fichier de cache vide (sinon on mélange des combats de deux versions). La
campagne échoue (au lieu de résumer un échantillon incomplet) si un processus enfant meurt sans rendre ses combats.

### Utilisation

```sh
npx tsx sim/src/cli/campaign.ts liste
npx tsx sim/src/cli/campaign.ts compos-ref --coeurs 4 --cache /tmp/cache.jsonl     # → sim/results/compos-ref.json
                                                                                  # (--graines a-b, --sortie dossier)
npx tsx sim/src/cli/campaign.ts tout --coeurs 4 --cache /tmp/cache.jsonl           # toutes les expériences
npx tsx sim/src/cli/report.ts --experience compos-ref,pessimiste                   # tableaux Markdown
```

`ExperimentReport` (JSON compact) : `variants` (statistiques du runner : victoires, IC de Wilson, progression,
tour, objectifs, morts, Mama, durée), `comparisons`, `analysis` (agrégats par variante), `choices` (choix résumés :
« nature|joueur|libellé » → nombre), `runs` (un enregistrement compact par combat : issue, tour, progression, morts,
objectifs, Mama, cadeaux, durée).

### Performances

Environ 6 à 7 s de calcul par combat complet à 4 joueurs (planificateur fast), 1,5 s par combat en temps réel sur
4 cœurs ; le rejeu et l'analyse d'un combat coûtent ~30 ms.

### Tests (`sim/test/analysis.test.ts`)

Rejeu d'un combat court (mode greedy, 3 tours) : un instantané par tour, bornes des grandeurs, lancers comptés,
V1 (2 monstres au T1), agrégation, enregistrements compacts, clé de cache indépendante du nom, synthèse appariée,
cohérence des définitions de campagne (noms uniques, références existantes).

### Limites

- Les fenêtres d'attribution des dégâts sont une convention : un sort qui prépare un coup joué ensuite (Amplification,
  Galvanisation, Pugnace…) n'est pas crédité ; les dégâts des pics au début du tour des monstres ne sont crédités à
  personne.
- Les PV ennemis « restants » ne comptent que les monstres apparus ; la Mama n'est comptée qu'à partir du T8.

### Modifications hors du module (signalées)

- Nouveaux fichiers dans `sim/src/cli/` (`campaign.ts`, `report.ts`) ; `sim/src/cli/index.ts` n'est pas modifié.
- Aucun fichier du moteur, du scénario, de l'IA, du planificateur ni du runner n'est modifié.
