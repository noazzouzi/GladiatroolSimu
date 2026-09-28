# Spécification des données du simulateur du Gladiatrool

> Rédigé le 2026-09-28. Proposition de **schéma JSON consolidé** que le moteur de simulation chargera, avec, pour chaque
> champ, la **source retenue**. Compagnon de `research/ETUDE_GLADIATROOL.md` (faits et formules) et de
> `research/QUESTIONS_OUVERTES.md` (hypothèses → paramètres de configuration).
> Clés de citation : voir l'en-tête de l'étude (`DB sl<id>`, `CLI3`, `CLI273`, `DPLN`, `VOD`, `N20`…, `D:map`…).

---

## 0. Principes

1. **Deux fichiers, deux natures.**
   - `sim/data/gladiatrool.data.json` : **faits** (données du jeu, observations consolidées). Ne change que si le jeu change
     ou si une observation est corrigée.
   - `sim/config/default.config.json` : **hypothèses et choix** (tout ce qui est listé dans `QUESTIONS_OUVERTES.md`), chacun
     avec sa valeur par défaut et ses alternatives. Le simulateur peut charger plusieurs configurations pour mesurer la
     sensibilité d'un résultat à une hypothèse.
2. **Données primaires d'abord.** Toute valeur lisible dans les données du client (DofusDB, CLI3) vient de là ; le guide et
   les vidéos ne servent qu'à ce que les données ne contiennent pas (vagues, IA, contenus des choix, moments) ou à trancher
   l'interprétation.
3. **Provenance obligatoire.** Tout objet non trivial porte un champ `_prov` :

   ```json
   "_prov": { "src": ["https://api.dofusdb.fr/spell-levels/80507"], "status": "V", "conf": "haute", "note": "…" }
   ```

   `status` ∈ {`V` FAIT vérifié, `R` FAIT rapporté, `Robs` observation mesurée (VOD), `H` HYPOTHÈSE}. Un champ qui dépend
   d'une hypothèse ne contient pas la valeur : il **référence le paramètre** (`"$config": "spikes.playerTurnStartDamage"`).
4. **Représentation fidèle des sorts.** Les sorts sont stockés comme dans le client (liste ordonnée d'effets avec `effectId`,
   masques, déclencheurs, zones, durées), effets `forClientOnly` compris mais marqués `exec: false`. Un modèle simplifié
   optionnel (`sim`) peut accélérer le planificateur, mais le moteur de référence interprète les effets.
5. **Identifiants DOFUS partout** : ids de sorts, de niveaux de sort (spell-levels), d'états, de monstres, de cellules. Les
   noms français sont des libellés.
6. **Génération reproductible.** Le fichier est produit par un script (proposé : `tools/build_sim_data.py`) à partir de
   `research/raw/dofusdb/*.json` et `research/data/*.json`, avec assertions (comme les générateurs existants), et validé par
   un JSON Schema (`sim/data/gladiatrool.schema.json`).

---

## 1. Vue d'ensemble du fichier de données

```json
{
  "schemaVersion": "1.0.0",
  "meta":       { … },
  "map":        { … },
  "rules":      { … },
  "effects":    { "<effectId>": { … } },
  "states":     { "<stateId>": { … } },
  "spells":     { "<spellLevelId>": { … } },
  "archetypes": { "acrobate": { … }, "dompteur": { … }, "magicien": { … } },
  "monsters":   { "<monsterId>": { … } },
  "boss":       { … },
  "scenario":   { "timeline": { … }, "waves": [ … ], "gifts": { … }, "choices": { … },
                  "objectives": { … }, "victory": { … } },
  "tests":      [ … ]
}
```

| Section | Contenu | Sources principales (fichiers du dépôt) |
|---|---|---|
| `meta` | version du jeu, date, empreintes des sources | `research/raw/dofusdb/summary.json`, `D:map.source` |
| `map` | 560 cellules, pics, départs, cases spéciales | `D:map` (CLI3), `D:annot` (VOD) |
| `rules` | formules et constantes du moteur | N70, `tools/mechanics/` (CLI273) |
| `effects` | catalogue des effectId utilisés, sémantique et gestionnaire | `D:eff`, `research/data/action_ids_dofus3.json` |
| `states` | états utiles (drapeaux, effets d'état) | `research/raw/dofusdb/spell_states.json`, N20 §10 |
| `spells` | tous les niveaux de sorts utilisés (archétypes, améliorés, uniques, sous-sorts, monstres, boss, scénario) | `research/raw/dofusdb/spell_levels.json`, `D:acro`, `D:domp`, `D:mag`, `D:mon`, `D:fight` |
| `archetypes` | stats, sorts de départ, ordre d'obtention, améliorations, uniques, Acclamations | `D:acro`, `D:domp`, `D:mag`, `D:fight.spellUnlockOrder` |
| `monsters` | stats, sorts, passifs, drapeaux, profil d'IA par défaut | `D:mon`, `research/raw/dofusdb/monsters.json` |
| `boss` | script de la Mama | `D:mon.boss`, `D:fight.boss`, `D:annot` |
| `scenario` | vagues, apparitions, cadeaux, fenêtres de choix, objectifs, victoire | `D:fight`, `D:annot`, DPLN |
| `tests` | valeurs de référence que le moteur doit reproduire | notes 1x, 20, 30, 40, 70 |

---

## 2. `meta`

| Champ | Type | Valeur / description | Source retenue |
|---|---|---|---|
| `gameVersion` | string | `"3.6.12.16"` | CLI3 (release Cytrus `dofus3`) |
| `betaChecked` | string | `"3.7.2.2"` (carte identique) | N41 §1 |
| `dofusdbExtractedAt` | string (ISO) | date de l'extraction | `research/raw/dofusdb/summary.json` |
| `monstersUpdatedAt` | string | `"2026-06-23"` | DofusDB (N20 §1) |
| `sources` | objet | URL et empreintes : bundle carte sha1 `7b8cdb95…`, `DofusInvoker.swf` sha1 `92a0b228…`, VOD `2852548819`, DPLN (maj 21/05/2026) | N41, N70, N40 |

---

## 3. `map`

```json
"map": {
  "mapId": 139988488,
  "grid": { "width": 14, "rows": 40, "cellCount": 560,
            "toXY": "row=id//14; col=id%14; x=(row+1)//2+col; y=col-(row-(row+1)//2)",
            "fromXY": "id=(x-y)*14+y+(x-y)//2" },
  "cells": [ { "id": 300, "x": 17, "y": -4, "walkable": true, "los": true,
               "spikes": false, "edgeDepth": 9, "neighbours": [286, 287, 314, 315] }, … ],
  "playable": [ … 241 ids … ],
  "spikes": { "cells": [ … 96 ids … ], "rawList": [ … 102 ids … ],
              "listedNotWalkable": [250, 293, 321, 362], "sourceSpellLevel": 80489 },
  "startCells": [286, 287, 314, 315],
  "center": 300,
  "bossWaitCell": 152,
  "giftCells": [272, 273, 299, 301, 327, 328, 329],
  "staticObstacles": [],
  "_prov": { "src": ["CLI3 mapdata_assets_world_534.bundle", "https://api.dofusdb.fr/spell-levels/80489"], "status": "V", "conf": "haute" }
}
```

| Champ | Type | Description | Source retenue | Statut |
|---|---|---|---|---|
| `mapId` | int | 139988488 (carte de combat ; pas 139988485) | CLI3 + VOD (N41 §2, N40 §3) | V, haute |
| `grid.*` | formules | conversion id ↔ MapPoint | CLI273 `MapTools` ; `tools/map/mapgeom.py` | V |
| `cells[].walkable` | bool | `mov && !nonWalkableDuringFight` | CLI3 `cellsData` | V |
| `cells[].los` | bool | drapeau `los` (faux seulement autour de 152) | CLI3 | V |
| `cells[].spikes` | bool | appartient au glyphe 30390 **et** jouable | DB sl80489 ∩ CLI3 | V |
| `cells[].edgeDepth` | int | distance de Manhattan à la première case non jouable | calcul (`D:map`) | V |
| `cells[].neighbours` | int[] | voisines jouables (4-connexité) | calcul | V |
| `cells[].px`, `py` | float | pixels DOFUS 2 (affichage seulement) | `D:map` | V |
| `spikes.rawList` | int[] | liste brute de 102 ids (doublons 351, 455) | DB sl80489 | V |
| `startCells` | int[] | cases rouges de placement | CLI3 (`red`) + VOD | V |
| `bossWaitCell` | int | 152 (seule case bleue, isolée) | CLI3 + VOD + capture DPLN | V/Robs |
| `giftCells` | int[] | cases observées des cadeaux (T2–T9) | VOD (N40 §6) | Robs, haute (liste) |
| `staticObstacles` | int[] | vide | CLI3 + VOD | V |
| `dynamicObstacles` | — | **dans la config** (`map.dynamicObstacles`) | GD + VOD | R |

Les cases d'arrivée de la Mama et les emplacements d'apparition ne sont pas dans `map` : ils appartiennent au scénario
(`boss.arrival`, `scenario.waves`).

---

## 4. `rules` (formules du moteur)

Constantes et formules **non contestées** (les points contestés sont dans la config). Source : CLI273 portée dans
`tools/mechanics/` (62 contrôles), N70. Statut V, confiance haute sauf mention.

```json
"rules": {
  "distance": "manhattan",
  "directions": { "axes": [1, 3, 5, 7], "diagonals": [0, 2, 4, 6], "vectors": { "0": [1,1], "1": [1,0], "2": [1,-1], "3": [0,-1], "4": [-1,-1], "5": [-1,0], "6": [-1,1], "7": [0,1] } },
  "los": { "algorithm": "getCellsIdBetween", "entityBlocksIntermediateOnly": true, "mapLosFlagBlocksTarget": true },
  "castCells": { "lineAndDiagonal": "star", "lineOnly": "axisCross", "diagonalOnly": "diagonalCross", "else": "manhattanRing" },
  "cooldown": { "rule": "currentTurn >= lastCastTurn + interval" },
  "zone": { "defaultDegression": 10, "defaultMaxTicks": 4, "noDegressionIfRadiusAbove": 50,
            "distanceByShape": { "GRW": "chebyshev", "#+-/U": "manhattan>>1", "FV": "projectionOnCastAxis", ";AIa": "zero", "default": "manhattan" },
            "degressionUsesPositionBeforeSpell": true, "appliesToHeals": true, "appliesToShields": false, "appliesToPushDamage": false },
  "targeting": { "targetsFrozenAtCast": true, "positionsBeforeSpell": true,
                 "order": { "push": "farthestFromTargetCellFirst", "other": "nearestFirst", "tieBreak": ["direction", "cellId"] },
                 "meleeTestedAtEffectTime": true },
  "damage": {
    "pipeline": ["roll", "spellBaseBonus(293)", "×(100+charac+power)/100", "+fixedDamage(+critDamage)",
                 "×(100-zoneMalus)/100", "-fixedRes", "×(1-res%/100)", "invulnerable→0",
                 "×spell/weapon & melee/range multipliers", "×finalDamage/100", "×Π(1163 matching trigger)", "shield", "erosion", "lifeSteal"],
    "truncateEachMultiplication": true,
    "resistCap": { "player": 50, "monster": 100 },
    "elementCharacteristic": { "neutral": "strength", "earth": "strength", "fire": "intelligence", "water": "chance", "air": "agility" },
    "powerAppliesToHeals": false,
    "nonBoostableActions": [80, 82, 89, 1048, 1092, 1118, 1123, 1223, 1109, 2020],
    "erosion": { "base": 10, "cap": 50, "formula": "floor(min(hpLost*erosion/100, hp-1))" },
    "lifeSteal": { "ratio": 0.5, "capToMissingHp": true },
    "deathAtHpLE": 0
  },
  "crit": { "rate": "0 if spell.critRate==0 else clamp(spell.critRate + caster.crit, 0, 100)",
            "oneRollPerCast": true, "criticalEffectsReplaceEffects": true, "subSpellsInherit": true },
  "multiplier1163": { "formula": "m = int(m * pct / 100)", "stack": "multiplicative",
                      "triggerD": "all damage except push damage", "triggerDBA": "damage from an ally" },
  "push": { "origin": "caster if target on targeted cell else targeted cell",
            "direction": "dir4(origin,target); exact diagonal if |dx|==|dy|",
            "diagonalSteps": "ceil(n/2)", "diagonalNeedsBothSideCellsFree": true,
            "stopsOn": ["nonWalkable", "fighter", "trap", "wall"], "glyphsStopPush": false,
            "collision": "max(0,int(rest*k*(floor(level/2)+32+pushDamage-pushResist)/(4*2**i)))  # k=2 if diagonal else 1",
            "collisionIgnores": ["resistances", "finalDamage", "1163 with trigger D"],
            "noCollisionActions": [6, 1021, 1022, 1103],
            "blockedBy": { "unshakable(stateEffect0)": ["push", "pull"], "rooted(stateEffect3)": ["push", "pull", "teleport", "swap"] } },
  "swap": { "blockedBy": ["rooted", "noSwapStateEffect18", "carried"], "unshakableDoesNotBlock": true },
  "teleport": { "nonPointZone": "firstFreeCellOfZone(getCells order)" },
  "durations": { "decrementAt": "startOfCasterTurn", "permanent": "-1 or >=63",
                 "delayCountsCasterTurns": true, "castsBeforeFirstTurnNotDecrementedAtFirstTurnStart": true },
  "turnStart": ["decrementBuffsCastByFighter", "resetTriggerCounters", "TB triggers", "startTurnGlyphs(401)", "restoreApMp"],
  "turnEnd": ["TE triggers", "endTurnGlyphs(402)", "resetCastCounters"],
  "aura1091": { "applyOnEnter": ["walk", "push", "pull", "teleport", "swap"], "removeOnExit": true, "emitsEONEOFF": true },
  "subSpellExecutors": {
    "792":  { "caster": "effectTarget", "cell": "effectTargetCell" },
    "2792": { "caster": "effectTarget", "cell": "effectTargetCell", "maxExecutions": "value" },
    "1160": { "caster": "originalCaster", "cell": "effectTargetCell" },
    "2160": { "caster": "originalCaster", "cell": "effectTargetCell", "maxExecutions": "value" },
    "1017": { "caster": "buffCarrier", "cell": "eventSourceCell" },
    "1018": { "caster": "eventSource", "cell": "buffCarrierCell" },
    "1019": { "caster": "eventSource", "cell": "eventSourceCell" },
    "2794": { "caster": "effectTarget", "cell": "parentTargetedCell" },
    "2960": { "caster": "originalCaster", "cell": "targetedCell" }
  },
  "triggeredBuffCaster": "buff setter; target = carrier; no re-trigger by own effects",
  "tackle": { "enabled": false, "why": "état 5970 des joueurs (DB sl80897)" }
}
```

| Champ | Source retenue | Statut |
|---|---|---|
| `los`, `castCells`, `cooldown`, `zone`, `targeting`, `damage`, `crit`, `multiplier1163`, `push`, `swap`, `teleport`, `durations` | CLI273 (`MapTools`, `LosDetector`, `SpellZone`, `TargetManagement`, `DamageSender/Receiver`, `PushUtils`, `SpellWrapper`, `HaxeBuff`), N70 §1–§7 | V, haute |
| `turnStart` / `turnEnd` (ordre) | client (décompte) + ordre serveur supposé | V / H moyenne |
| `aura1091` | client (FightAddGlyphAura) + N70 §7.3 | V ; « échange » : H |
| `subSpellExecutors` | CLI273 `solveSpellExecution` ; noms DOFUS 3 (`action_ids_dofus3.json`) | V |
| `tackle.enabled = false` | DB sl80897 (état 5970) ; corrige N70 §6.2 | V, haute |

Implémentation de référence : `tools/mechanics/{geometry,zones,damage,movement}.py`.

---

## 5. `effects` (catalogue des actions)

Un objet par `effectId` réellement utilisé, dérivé de `D:eff` (106 effets documentés) : nom DOFUS 3, catégorie, sens des
paramètres, gestionnaire du moteur, priorité d'implémentation.

```json
"effects": {
  "5":    { "action": "CharacterPush", "category": "push", "params": { "min": "cells" }, "handler": "push", "v1": "must" },
  "100":  { "action": "CharacterLifePointsLost", "category": "damage", "element": "neutral", "boostable": true, "params": { "min": "rollMin", "max": "rollMax" }, "handler": "damage", "v1": "must" },
  "1163": { "action": "CharacterMultiplyReceivedDamage", "category": "multiplier", "params": { "min": "percent" }, "handler": "receivedMultiplierBuff", "v1": "must" },
  …
}
```

Effets **réels** rencontrés dans les sorts des archétypes, monstres et boss (compte d'occurrences sur `D:acro`, `D:domp`,
`D:mag`, `D:mon`), à implémenter en v1 :

| Catégorie | effectId (action DOFUS 3) |
|---|---|
| Dégâts | 100 (dommages neutres), 95 (vol de vie), 89 (% PV du lanceur), 1118 (% PV érodés du lanceur), 1092 (% PV érodés de la cible), 1123 / 1223 (renvoi : % dommages initiaux / finaux), 1048 (malus de PV courants) |
| Soins, boucliers, seuils | 3001 (soins neutres), 1109 (% PV max), 2020 (% des dommages subis), 1040 (bouclier), 2872 (seuil de PV), 147 (résurrection), 765 (interception) |
| Déplacements | 5 (poussée), 6 (attirance), 1103 (poussée sans dommages), 1042 (le lanceur avance), 4 (téléportation), 8 (échange) |
| Stats (boost/debuff) | 111 PA, 128 PM, 117 PO, 115 critique, 418 dommages critiques, 414 DoPou, 125 / 153 vitalité, 138 puissance, 1076 résistance %, 2803 / 2807 résistance mêlée / distance, 776 érosion, 169 −PM non esquivable, 1171 / 1172 DF +/−, 2971 soins finaux, 293 bonus de base d'un sort |
| États et buffs | 950 (pose un état), 951 (retire), 952 (désactive), 406 (retire les effets d'un sort), 132 (désenvoûtement), 1163 (multiplicateur de dommages reçus), 140 (tour annulé), 141 (tue) |
| Sous-sorts | 792, 1160, 2160, 2792, 2794, 2960, 1017, 1018 |
| Glyphes | 401 (début de tour), 1091 (aura), 1165 (glyphe immédiat : cadeau), 2018 (dissipe un glyphe) |
| Invocation | 181 |
| Sorts temporaires / choix / tour | 3405 (apprend), 3406 (désapprend), 3008 (choix individuel), 3404 (vote), 3407 (durée de tour) |
| Sans effet moteur | 335 (apparence), 666 (noop), 3400 / 3401 (notifications), 3792 / 3793 (scripts visuels) |

Source : `D:eff` (sémantique, confiance par effet), `research/data/action_ids_dofus3.json` (noms internes, CLI3). Statut V.

---

## 6. `states`

```json
"states": {
  "5994": { "name": "Vulnérable", "stateEffects": [], "displayTurnRemaining": true, "note": "marqueur ; le ×2 vient des 1163" },
  "157":  { "name": "Inébranlable", "stateEffects": [0] },
  "56":   { "name": "Invulnérable", "stateEffects": [7] },
  "5970": { "name": "Gladiatrooler", "stateEffects": [1, 2], "silent": true },
  "5971": { "name": "Mama Trooll (pré fight)", "stateEffects": [3, 4, 18] },
  …
}
```

| Champ | Description | Source retenue |
|---|---|---|
| `stateEffects` | effets d'état DOFUS (0 inébranlable, 1 intaclable, 2 ne tacle pas, 3 enraciné, 4 non portable, 5 incurable, 6 pacifiste, 7 invulnérable, 18 pas d'échange, 19–28 invulnérabilités ciblées…) | DB `/spell-states/<id>` (`effectsIds`) ; table N70 §5.6 |
| `dispellable` (sur les effets qui posent l'état) | 1 = retiré par Délivrance ; 3 = non | DB spell-levels ; N1M §2.5 |

États indispensables : 56, 157, 5898, 5899 / 5900 / 5901 (archétypes), 5902 / 5903 (a déclenché les pics), 5904–5911
(objectifs), 5913, 5915–5918, 5942, 5944–5963 (compteurs), 5965 (combatCanFinish), 5967 (Endolori), 5968 (Amplifié), 5970,
5971, 5973–5977 (Faveur V → I), 5979–5981, 5994, 5996–6016 (boostedSpell), 6024, 6026–6034. Source : N20 §10, N30, `D:fight`.

---

## 7. `spells` (niveaux de sort)

Clé = **spell-level id** (unique) ; un index secondaire `spellIndex["<spellId>:<grade>"]` donne la clé. Tous les niveaux
atteignables depuis les archétypes, les monstres et le scénario y figurent (fermeture récursive des sous-sorts, déjà calculée
dans `research/raw/dofusdb/provenance.json`).

```json
"80507": {
  "spellLevelId": 80507, "spellId": 30402, "grade": 1,
  "name": "Videur", "adminName": "Sort 1", "typeId": 3888,
  "family": "archetype", "owner": "acrobate",
  "cast": { "ap": 4, "range": [1, 5], "rangeModifiable": true, "inLine": true, "inDiagonal": false,
            "los": true, "needFreeCell": false, "needTakenCell": false, "needVisibleEntity": false,
            "maxPerTurn": 2, "maxPerTarget": 0, "interval": 0, "initialCooldown": 0, "globalCooldown": 0,
            "critRate": 30, "maxStack": -1, "statesCriterion": null },
  "effects": [
    { "order": 0, "effectId": 5,    "exec": false, "min": 3, "max": 0, "value": 0, "targetMask": "a,A", "triggers": ["I"],
      "duration": 0, "delay": 0, "zone": { "shape": "T", "radius": 2, "minRadius": 0, "degression": 10, "maxTicks": 4 } },
    { "order": 1, "effectId": 1160, "exec": true,  "min": 30689, "max": 1, "value": 0, "targetMask": "a,A", "triggers": ["I"],
      "zone": { "shape": "T", "radius": 2 }, "subSpell": { "spellId": 30689, "grade": 1, "spellLevelId": 80981 } },
    { "order": 2, "effectId": 100,  "exec": true,  "min": 59, "max": 63, "element": "neutral", "targetMask": "A", "triggers": ["I"],
      "zone": { "shape": "T", "radius": 2 } }
  ],
  "critEffects": [ … jets 72–77 … ],
  "upgrade": { "toSpellLevelId": 80766, "toSpellId": 30567, "choiceSpellId": 30478 },
  "unlock": { "slot": 1, "by": "start" },
  "sim": { "steps": [ { "op": "push", "zone": "T2", "distance": 3, "origin": "caster", "affects": "all" },
                      { "op": "damage", "roll": [59, 63], "critRoll": [72, 77], "affects": "enemies" } ] },
  "_prov": { "src": ["https://api.dofusdb.fr/spell-levels/80507"], "status": "V", "conf": "haute" }
}
```

### 7.1 Champs d'un niveau de sort

| Champ | Type | Description | Source retenue | Statut |
|---|---|---|---|---|
| `spellLevelId`, `spellId`, `grade`, `name`, `adminName`, `typeId` | — | identifiants et libellés | DB `/spell-levels`, `/spells` | V |
| `family` | enum | `archetype`, `upgraded`, `unique`, `common`, `subspell`, `monster`, `boss`, `scenario`, `passive`, `choice`, `acclamation`, `objective` | classement des agents (`D:acro/domp/mag/mon/fight`) à partir des types de sorts | V/H |
| `owner` | string | archétype, id de monstre ou `scenario` | idem | V |
| `cast.*` | — | coût, portée, contraintes, limites, taux critique du sort | DB spell-level (`apCost`, `minRange`, `range`, `rangeCanBeBoosted`, `castInLine`, `castInDiagonal`, `castTestLos`, `needFreeCell`, `needTakenCell`, `maxCastPerTurn`, `maxCastPerTarget`, `minCastInterval`, `initialCooldown`, `globalCooldown`, `criticalHitProbability`, `maxStack`, `statesCriterion`) | V |
| `effects[]`, `critEffects[]` | Effect[] | voir §7.2 | DB spell-level (`effects`, `criticalEffect`) | V |
| `upgrade` | objet | niveau amélioré et sort de choix | DB (effets 3405 / 3406 des sorts « Amélioration : X ») ; `D:acro/domp/mag` | V (Jaillissement : 80760 retenu, voir config) |
| `unlock` | objet | emplacement 0–7 et source (`start`, `tier1`…`tier6`, `gift`) | DB sp30626 (Spell Manager) ; départ : serveur (DPLN) | V / R |
| `sim` | objet | modèle simplifié optionnel | `D:acro.spells[].levels.*.simModel` (Acrobate) ; à écrire pour les autres | H (dérivé) |
| `expected` | objet | dégâts / soins attendus précalculés (tests) | `expectedDamage` des JSON d'archétypes, `D:mon.damageTable` | V (calcul) |

### 7.2 Effet (`Effect`)

| Champ | Type | Description | Source retenue |
|---|---|---|---|
| `order` | int | ordre d'exécution | DB (`order`) |
| `effectId` | int | action (voir `effects`) | DB |
| `exec` | bool | `!forClientOnly` : **seuls les effets `exec` sont appliqués** | DB (`forClientOnly`) ; règle N1A §2.1 |
| `min`, `max`, `value` | int | paramètres bruts `diceNum`, `diceSide`, `value` | DB |
| `element` | string | élément des dégâts/soins | `D:eff` |
| `targetMask` | string | masque brut (ex. `"Def,A"`, `"a,e5968,E5899"`) | DB |
| `mask` | objet | masque analysé : `include` (A, a, g, c, C, j, H, …), `exclude` (E#, e#, F#, V#, v#, `*` = lanceur), `camp` (`Atq` / `Def` / `Sce`) | analyse N70 §3.4 ; `Atq`/`Def`/`Sce` = H (N30 §1.1) |
| `triggers` | string[] | `I`, `D`, `DBA`, `PD`, `X`, `XPD`, `TB`, `TE`, `EON#`, `EOFF#`, `CAP`, `TR#`… | DB ; sémantique N70 §3.5 (CAP, XPD, TR : H) |
| `duration`, `delay`, `triggerDuration` | int | en tours du **lanceur** ; −1 = permanent | DB ; règle N70 §7.2 |
| `dispellable` | int | 1 retirable par Délivrance, 3 non | DB |
| `random`, `group` | int | effets aléatoires groupés (inutilisés ici) | DB |
| `zone` | objet | `shape` (lettre), `radius`, `minRadius`, `degression`, `maxTicks`, `stopAtTarget`, `cellIds` (forme `;`) | DB `zoneDescr` (shape ASCII, param1, param2, damageDecreaseStepPercent, maxDamageDecreaseApplyCount, cellIds) |
| `subSpell` | objet | `spellId`, `grade`, `spellLevelId` pour 792 / 1160 / 2160 / 2792 / 2794 / 2960 / 1017 / 1018 / 401 / 1091 / 1165 ; **exceptions** : 406 (id dans `value`), 3405 / 3406 (`value` = spell-level) | DB ; règles d'extraction `tools/dofusdb/extract.py` |
| `stateId` | int | pour 950 / 951 / 952 (`value`) | DB |

### 7.3 Contenu minimal de `spells`

| Groupe | Niveaux (spell-levels) | Source |
|---|---|---|
| Commun | Frappe Repoussoir 80499 | DB |
| Acrobate | 80507, 80513, 80510, 80522, 80511, 80509, 80512 ; améliorés 80766, 80784, 80775, 80778, 80780, 80773, 80782 ; sous-sorts 30689 (80981/80982), 30693 (80995…), 30419, 30421/30568 (Poutch), 30420, 30625, 30676, 30677 | `D:acro` |
| Dompteur | 80500–80506 ; améliorés 80748, 80751, 80754, 80756, 80758, 80760, 80762 ; sous-sorts 30417, 30691, 30624, 30627/30628, 30667, 30670 | `D:domp` |
| Magicien | 80514, 80515, 80516, 80519, 80521, 80517, 80518 ; améliorés 80786, 80788, 80791, 80800, 80802, 80793, 80795 ; sous-sorts 30674, 30675 | `D:mag` |
| Uniques | 30602–30607, 30611–30623 (niveaux 80826–80851) | `D:acro/domp/mag` |
| Acclamations | 30589 / 30590 / 30591 niv. 1–6 (80807–80815, 80874–80882) et cartes 30592–30637 | `D:fight.bonusesByArchetype` |
| Monstres | 30380–30388 (80483–80496) | `D:mon.spells` |
| Boss | 30389 + 30391, 30392, 30393, 30394 (80488, 80491, 80495, 80497, 80498) ; 30430 (80586), 30750 (81182), 30609 (80835–80837, 81100), 30432 (80591, 80931, 80934, 80935), 30723 (81097, 81099), 30724 (81098), 30659 (80932, 80933), 30718 | `D:mon`, `D:fight.boss` |
| Scénario | 30390 (80489, 80492, 81026), 30700 (81022), 30701 (81025), 30639 (80897), 30694 (81002), 30566, 30657, 30443, 30626, 30658, 30608, 30710 (81060), 30577 (80790), objectifs 30428–30555, 30710 | `D:fight` |

---

## 8. `archetypes`

```json
"acrobate": {
  "displayName": "Acrobate", "internalName": "Baroudeur", "stateId": 5900, "passiveSpellId": 30648,
  "body": { "monsterId": 7980, "startingSpellLevel": 80897 },
  "baseStats": { "hp": 30000, "ap": 8, "mp": 4, "rangeBonus": 0, "strength": 6000, "power": 0,
                 "pushDamage": 1000, "crit": 10, "critDamage": 0, "resPct": 0, "erosion": 10, "level": 200,
                 "turnSeconds": 60 },
  "hpOverride": { "$config": "archetypes.hpMode" },
  "commonSpell": 80499,
  "spellSlots": [ { "slot": 1, "spellLevelId": 80507, "unlock": "start" },
                  { "slot": 2, "spellLevelId": 80513, "unlock": "tier1" },
                  { "slot": 3, "spellLevelId": 80510, "unlock": "tier2" },
                  { "slot": 4, "spellLevelId": 80522, "unlock": "tier3" },
                  { "slot": 5, "spellLevelId": 80511, "unlock": "tier4" },
                  { "slot": 6, "spellLevelId": 80509, "unlock": "tier5" },
                  { "slot": 7, "spellLevelId": 80512, "unlock": "tier6" } ],
  "upgrades": { "80507": { "to": 80766, "choiceSpellId": 30478 }, … },
  "uniques": [80828, 80829, 80844, 80845, 80846, 80847, 80843],
  "acclamations": [
    { "choiceSpellId": 30595, "stat": "ap", "value": 1, "realSpellLevel": 80810 },
    { "choiceSpellId": 30596, "stat": "mp", "value": 1, "realSpellLevel": 80811 },
    { "choiceSpellId": 30597, "stat": "resPctAll", "value": 10, "realSpellLevel": 80812 },
    { "choiceSpellId": 30635, "stat": "range", "value": 1, "realSpellLevel": 80880 },
    { "choiceSpellId": 30636, "stat": "pushDamage", "value": 200, "realSpellLevel": 80881 },
    { "choiceSpellId": 30637, "stat": "resPctMelee", "value": 10, "realSpellLevel": 80882 } ],
  "_prov": { "src": ["research/data/archetype_acrobate.json"], "status": "V", "conf": "haute" }
}
```

| Champ | Description | Source retenue | Statut |
|---|---|---|---|
| `internalName`, `stateId`, `passiveSpellId` | Baroudeur 5900 30648 / Gladiateur 5899 30644 / Guérisseur 5901 30649 | DB sp30644/30648/30649 | V |
| `baseStats.hp/ap/mp/strength/level` | 30 000 / 8 / 4 / 6 000 / 200 | DB mo7980 + DPLN | V+R |
| `baseStats.power` | 0 | VOD (4 relevés à ×61, N1D §12) | Robs, haute |
| `baseStats.pushDamage`, `crit` | 1 000, 10 % | DPLN ; Barbe Douce 00:04 | R, haute |
| `baseStats.erosion` | 10 % | N70 §4.3 (fiches en jeu) | R, haute |
| `hpOverride` | options 35 000 (Acrobate) / 25 000 (Magicien) si le passif s'appliquait | DB sl80897 | config (Q20) |
| `spellSlots` | ordre d'obtention | DB sp30626 niv. 1–6 ; départ : DPLN, Barbe Douce 09:36 | V / R |
| `upgrades` | niveau amélioré + sort de choix | DB sorts 30469–30491 (3405/3406) | V |
| `uniques` | 6 + Pense Vite (80843) | DB (types 3872–3875) | V |
| `acclamations` | 6 cartes : stat, valeur, niveau réel de l'accumulateur | DB 30589/30590/30591 ; `D:fight.bonusesByArchetype` | V (Magicien résistance distance 15 %, pas 10 %) |

Valeurs des deux autres archétypes : identiques en structure ; ids dans l'étude §4.3–§4.5.

---

## 9. `monsters`

```json
"7981": {
  "name": "Troollibre", "nameEn": "Trool Croozer", "race": 313, "level": 200,
  "stats": { "hp": 25000, "ap": 11, "mp": 6, "strength": 4000, "power": 0, "resPct": { "neutral": 0 },
             "dodgeAp": 0, "dodgeMp": 0, "tackle": 0, "flee": 0, "pushDamage": 0, "pushResist": 0, "crit": 0, "erosion": 10 },
  "flags": { "canBePushed": true, "canSwitchPos": true, "canBeCarried": true, "canTackle": true },
  "spells": [80483, 80484, 80485],
  "startingSpellLevel": 81002,
  "passives": ["exitSpikesVulnerability(30700)", "empaleCheck(30754)"],
  "aiProfile": "troollibre",
  "_prov": { "src": ["https://api.dofusdb.fr/monsters/7981"], "status": "V", "conf": "haute" }
}
```

| Champ | Description | Source retenue | Statut |
|---|---|---|---|
| `stats.*`, `flags.*`, `spells`, `startingSpellLevel` | tels quels | DB `/monsters/<id>` (grade 1) ; revérifiés en direct (N20 §1) | V, haute |
| `stats.erosion` | 10 % | fiches en jeu (captures DPLN) | R |
| `passives` | 30694 → 30700 (×2 à la sortie des pics) + 30754 | DB sl81002 | V |
| `aiProfile` | nom du profil de comportement, défini dans la **config** (`ai.profiles`) | N20 §9 (`D:mon.aiModel`) | H |

Monstres à inclure : 7981, 7982, 7983, 7984 (profil `mama`, voir `boss`), 7985 et 7986 (Poutch : `canPlay` sans PA ni PM,
sort de départ 80525 / 80768), 7980 (corps des joueurs, pour mémoire).

---

## 10. `boss`

```json
"boss": {
  "monsterId": 7984,
  "stats": { "hp": 150000, "ap": 20, "mp": 6, "strength": 4500, "level": 1000, "dodgeAp": 20, "dodgeMp": 20 },
  "startingSpellLevel": 80586,
  "waitCell": 152,
  "preFight": { "stateId": 5971, "turnCancelledDuration": 6, "spellLevel": 81182 },
  "arrival": { "delayTurns": 7, "resultingGlobalTurn": 8, "targetCell": 300,
               "fallback": { "$config": "boss.arrivalFallback" }, "teleportZone": "C63",
               "spellLevels": [80835, 80836, 80837, 81100] },
  "rassemblement": { "trigger": "TB", "zone": { "shape": "X", "radius": 63, "minRadius": 1 },
                     "steps": [ { "op": "setState", "stateId": 5918, "on": "enemies", "duration": 1 },
                                { "op": "pull", "distance": 63, "on": "allies(g)" },
                                { "op": "pushNoDamage", "distance": 63, "on": "enemies" },
                                { "op": "objectiveCheck", "spellId": 30448, "ifState": 5915 } ],
                     "spellLevels": [80591, 80931, 80934, 80935] },
  "invulnerability": { "stateId": 56, "liftedOn": "EON5902", "liftDurationTurns": 1, "spellLevels": [81097, 81099] },
  "favour": { "startFinalDamageBonus": 25, "perObjective": -5, "states": [5973, 5974, 5975, 5976, 5977],
              "cap": { "$config": "boss.favourCap" }, "onlyIfAlive": true, "spellLevels": [81098, 80932, 80933] },
  "hasExitSpikesPassive": false,
  "onDeath": { "stateOnPlayers": 6024, "endsFight": false },
  "spells": [80488, 80491, 80495, 80497, 80498],
  "aiProfile": "mama",
  "_prov": { "src": ["https://api.dofusdb.fr/monsters/7984", "https://api.dofusdb.fr/spell-levels/80586"], "status": "V", "conf": "haute" }
}
```

| Champ | Source retenue | Statut |
|---|---|---|
| `stats` | DB mo7984 (niveau 1000 ; fiche en jeu « 200 » → config `boss.levelForPushDamage`) | V |
| `waitCell` 152 | CLI3 (seule case bleue) + VOD + capture DPLN | V / Robs, haute |
| `preFight`, `arrival.delayTurns` | DB sl81182, sl80835 | V |
| `arrival.resultingGlobalTurn` 8 | décompte client + VOD 11/11 + 6 vidéos | V / Robs, haute |
| `arrival.targetCell` 300 | DB sl80837 (2960 sur [300]) + 5 combats | V, haute |
| `arrival.fallback` | 287 observé 3 fois → config (Q9) | Robs / H |
| `rassemblement` | DB sl80935 (ordre des effets) ; « dès l'arrivée » : VOD | V |
| `invulnerability` | DB sl81097, sl81099 | V |
| `favour` | DB sl81098, sl80932, sl80933 ; plafond → config (Q35) | V / H |
| `hasExitSpikesPassive` false | la Mama ne porte pas 30694 / 30700 | V |
| `onDeath.endsFight` false | GD ; vidéos ; forum | R, haute |

---

## 11. `scenario`

### 11.1 `timeline`

```json
"timeline": {
  "bossPlaysFirst": true,
  "playerOrder": { "$config": "timeline.playerOrder" },
  "model": { "$config": "timeline.model" },
  "newMonstersInsertion": { "$config": "timeline.newMonstersInsertion" },
  "globalTurnSequence": ["bonusWindow[T2..T9]", "waveSpawn[T2..T7,T9,T10]", "giftSpawn[T2..T9]",
                         "turns(timeline)", "objectiveCheck(30710)"],
  "_prov": { "src": ["DPLN VI", "https://www.twitch.tv/videos/2852548819", "correctif 14/01/2025"], "status": "R", "conf": "moyenne" }
}
```

Source retenue : Mama en tête = DPLN + VOD (R) ; ordre des joueurs = correctif officiel (R) ; place des Troolls = **H**
(config, Q1) ; séquence du tour global = VOD (Robs) + DB sl81060 (contenu de 30710).

### 11.2 `waves`

```json
"waves": [
  { "n": 1, "turn": 1, "timing": "afterPlacement",
    "composition": [ { "monsterId": 7981, "count": 2 } ],
    "spawn": { "mode": "fixed", "cells": [242, 358] },
    "_prov": { "src": ["DPLN II", "VOD 11/11"], "status": "Robs", "conf": "haute" } },
  { "n": 2, "turn": 2, "timing": "globalTurnStartAfterBonus",
    "composition": [ { "monsterId": 7981, "count": 1 }, { "monsterId": 7982, "count": 2 } ],
    "spawn": { "groups": [ { "monsterId": 7982, "cells": [187, 188], "pick": 1, "weights": [5, 6] },
                           { "monsterId": 7982, "cells": [411, 412], "pick": 1, "weights": [3, 8] },
                           { "monsterId": 7981, "cells": [242, 358, 246], "pick": 1, "weights": [3, 4, 2] } ],
               "observed": [ { "cell": 412, "fights": 8 }, … ] } },
  …
  { "n": 8, "turn": 8, "boss": true },
  { "n": 10, "turn": 10, "timing": "globalTurnStart(noBonusWindow)",
    "composition": [ { "monsterId": 7983, "count": 2 }, { "monsterId": 7981, "count": 2 }, { "monsterId": 7982, "count": 2 } ],
    "spawn": { "candidatesByType": { "7981": [ … ], "7982": [ … ], "7983": [ … ] }, "observed": [ … ] } }
]
```

| Champ | Description | Source retenue | Statut |
|---|---|---|---|
| `composition` | V1–V10 (étude §2.3) | DPLN II ; concordance VOD (comptes) et vidéos | R, haute |
| `timing` | V1 après placement ; V2–V7, V9 au début du tour global après la fenêtre de bonus ; V10 au début de T10 | VOD (N40 §4.1) | Robs, haute |
| `spawn.cells` / `groups` / `candidatesByType` | cases et poids observés, répartis par type | `D:annot.monsterSpawnCells` (poids = nombre de combats) et `monsterSpawnModel.slotsByType` | Robs (cases) / H (attribution par type) |
| `spawn.observed` | observations brutes, pour les tests | `D:annot.perFightWaveSpawns` | Robs |
| Loi de tirage | **config** `spawn.mode` | — | H (Q5) |

Pour V4–V10, la structure « groupes » n'est pas établie : on stocke `candidatesByType` = intersection des candidats de la
vague et des emplacements du type (`slotsByType`), avec les poids observés ; un candidat sans type attribué va dans
`unassigned` (tiré pour n'importe quel type si la config l'autorise).

### 11.3 `gifts`

```json
"gifts": {
  "spellLevelPose": "30566 (1165, couleur #FFBE00, zone P1)", "triggerSpell": 30657,
  "cells": [272, 273, 299, 301, 327, 328, 329], "observedCounts": { "301": 12, "327": 12, "272": 9, "299": 9, "329": 9, "328": 8, "273": 4 },
  "window": { "firstTurn": 2, "lastTurn": 9 }, "observedRate": 0.716,
  "triggeredBy": "players (mask Atq,A), walking or pushed", "persistsUntilTaken": true, "canStack": true,
  "effect": "choice 10 for each player: 2 cards among {uniques of archetype + Pense Vite, upgrades of owned spells}",
  "_prov": { "src": ["https://api.dofusdb.fr/spells/30566", "https://api.dofusdb.fr/spells/30657", "VOD (63/88)", "DPLN IV"], "status": "V/Robs/R" }
}
```

Tirage (probabilité, case, cartes) → config `gifts.*` (Q14).

### 11.4 `choices`

| Id | Portée | Déclencheur | Contenu stocké | Source |
|---|---|---|---|---|
| 16 | individuel | 30608 | 3 archétypes → passif + sort de départ | DB sp30608 ; DPLN |
| 17 | individuel | 30658 (T2–T9) | 3 Acclamations parmi 6 (`archetypes.*.acclamations`) ; tirage → config | DB sp30658 ; VOD |
| 10 | individuel | 30657 niv. 3 | 2 cartes (voir `gifts`) | DB ; DPLN |
| 11–15 | vote | 30443 niv. 2–6 | objectifs du palier suivant ; nombre proposé → config | DB sp30443 ; vidéos |

### 11.5 `objectives`

Les objectifs sont codés de façon **déclarative** (les sorts-compteurs du client ne sont pas réinterprétés un à un) ; chaque
entrée garde les ids de sorts pour la traçabilité.

```json
"objectives": {
  "manager": { "spellId": 30443, "first": "empale", "maxCount": { "$config": "objectives.maxCount" },
               "reward": { "spellManagerLevel": "tier", "mamaFavourStep": true, "nextVote": true } },
  "list": [
    { "id": "empale", "tier": 1, "orientation": "general", "spellId": 30428, "rewardSpellId": 30433,
      "on": "enemyDeath", "condition": { "victimHasState": 5994 } },
    { "id": "productivite", "tier": 2, "orientation": "magicien", "spellId": 30542,
      "on": "spellCast", "scope": "allyTurn", "condition": { "castsThisTurnByChallenger": 3 } },
    { "id": "stop_projectiles", "tier": 3, "orientation": "dompteur", "spellId": 30520,
      "on": "globalTurnEnd", "condition": { "aliveCount": { "monsterId": 7982, "eq": 0 } } },
    …
  ]
}
```

Vocabulaire proposé (événements `on`) : `enemyDeath`, `enemyDeathByPushDamage`, `spellCast`, `enemyEntersSpikes`,
`allyExitsSpikes`, `enemyTakesPushDamage`, `allyTurnStart`, `allyTurnEnd`, `globalTurnEnd`, `rassemblement`,
`mamaDamagesAlly`. Les 21 objectifs se codent ainsi (conditions exactes : étude §7.2, N30 §5.3, `D:fight.objectives.list`) :

| id | Palier | `on` | Condition (résumé) | Compteur / portée |
|---|---|---|---|---|
| empale | 1 | enemyDeath | victime porte 5994 | — |
| soleil | 2 | globalTurnEnd | chaque joueur vivant a fini son tour sur sa case de début de tour | tour global complet |
| sol_glissant | 2 | enemyDeathByPushDamage | — | — |
| meurtres_serie | 2 | enemyDeath | même tueur, 2 morts dans son tour | RAZ en fin de tour ; attribution → config |
| productivite | 2 | spellCast | 3 lancers du Challenger | RAZ en fin de tour |
| sauvez_le | 3 | globalTurnEnd | allié désigné à 100 % PV ; puis nouvelle désignation (premier ≤ 10 %, …, ≤ 90 %, sinon n'importe lequel) | désignation à la FTG précédente |
| ebranlable | 3 | enemyDeath | victime porte 157 | — |
| stop_projectiles | 3 | globalTurnEnd | aucun Artroolleur vivant | — |
| toi_par_ici | 3 | allyTurn | un ennemi entre dans les pics **et** un allié en sort pendant le tour | états 5958/5959 |
| prendre_sa_place | 4 | allyTurnEnd | le Challenger finit sur la case marquée (ennemi le plus éloigné au début de son tour, hors Mama pré-combat) | — |
| faire_le_mur | 4 | enemyTakesPushDamage | 3 ennemis différents dans le tour | chaque ennemi compte une fois |
| pas_le_temps | 4 | enemyDeath | victime à 100 % PV au début du tour du Challenger | marquage au début du tour |
| distance_insecurite | 4 | allyTurnEnd | chaque Artroolleur à ≤ 3 cases (C3) d'un allié (vrai par vacuité) | — |
| attirance | 5 | rassemblement | tous les joueurs vivants « Grabbed » par un même Rassemblement | — |
| trous_troolls | 5 | enemyEntersSpikes | 4 ennemis différents dans le tour | — |
| pierre_trois_coups | 5 | enemyDeath | 3 morts entre deux lancers du Challenger (quel que soit le tueur) | RAZ à chaque lancer et en fin de tour |
| tout_va_bien | 5 | globalTurnEnd | aucun joueur à ≤ 50 % PV | — |
| solitude | 6 | globalTurnEnd | la Mama vivante sans allié | avant T8 → config |
| quintuple | 6 | enemyDeath | 5 ennemis tués par des joueurs dans le tour global | RAZ à la FTG |
| au_coin | 6 | allyTurnEnd | tous les ennemis vivants (hors Mama pré-combat) dans les pics (5902) | — |
| meme_pas_mal | 6 | mamaDamagesAlly | un joueur touché par un sort de la Mama sans perte de PV | — |

Source : DB (sorts 30428–30555 et leurs sous-sorts, cités par objectif dans `D:fight.objectives.list[].sources`) ; textes DPLN
IV. Statut V (logique) ; jetons `CAP`, `V#/v#`, `Atq/Def` : H.

### 11.6 `victory`

```json
"victory": { "allEnemiesDead": true, "requiresState": 5965, "stateSetBySpell": 30577,
             "canFinishFromTurn": { "$config": "victory.canFinishFromTurn" }, "killingBossEndsFight": false,
             "turnLimit": { "$config": "victory.turnLimit" } },
"defeat": { "allPlayersDead": true }
```

Source : DB sl80790 (V), GD + forums + vidéos (R), moment de 30577 (H, Q19).

---

## 12. Fichier de configuration (`default.config.json`)

Chaque paramètre : valeur par défaut, alternatives, question de référence. Le simulateur doit pouvoir faire varier chacun
indépendamment (analyse de sensibilité).

| Paramètre | Défaut | Alternatives | Réf. | Source du défaut |
|---|---|---|---|---|
| `timeline.model` | `alternate_spawn_order` | `alternate_initiative`, `monsters_after_mama`, `explicit` | Q1 | règle DOFUS + vidéos (H) |
| `timeline.newMonstersInsertion` | `append` | `after_mama`, `by_initiative` | Q1 | H |
| `timeline.playerOrder` | `["Acrobate","Dompteur","Dompteur","Magicien"]` | toute permutation | Q40 | vidéos (R) |
| `ai.focus` | `maxDamage` | `lowestHp`, `nearest` | Q2 | H |
| `ai.skipIfInSpikes` / `ai.skipIfNoTargetReachable` | true / true | false | Q2 | vidéos (R) |
| `ai.engageRadius` | null (PM + PO max) | entier | Q2 | H |
| `ai.avoidSpikes` | true | false | Q2 | H |
| `ai.monstersCanTargetAllies` | false | true | Q37 | H |
| `ai.profiles.*` | ordres de sorts de N20 §9 | — | Q2 | H |
| `spikes.entryDamage` | 2000 | — | — | DB sl80492 (V) |
| `spikes.monsterTurnStartDamageRaw` | 1000 | — | — | DB sl81026 (V) |
| `spikes.playerTurnStartDamage` | 1000 | 2000 | Q4 | DB (V) contre DPLN |
| `spikes.playersDoubledInside` | false | true | Q3 | DB (V, lecture Atq/Def H) |
| `spikes.stackExitAndInside` | true | false | Q7 | client (V) + H |
| `spikes.exitVulnerabilityTurns` | 1 | — | Q8 | DB sl81025 |
| `spikes.triggerWhenWalkingThrough` | true | false | Q6 | H |
| `spikes.walkThroughInterruptsMovement` | false | true | Q6 | H |
| `spikes.retriggerOnMoveInside` | false | true | Q6 | H |
| `spikes.auraAppliesMidSpell` | true | false | Q6 | VOD −9 904 (Robs) |
| `spawn.mode` | `weighted_observed` | `structured_slots`, `most_frequent`, `uniform_slots` | Q5 | H |
| `spawn.seed` | aléatoire | entier | — | — |
| `spawn.excludeOccupied` | true | false | Q5 | H |
| `boss.arrivalFallback` | `[287, "axisTowardWaitCell", "nearestFree"]` | liste | Q9 | VOD (Robs) + H |
| `boss.actsBeforeArrival` | false | true | Q21 | H |
| `boss.rassemblementBlockedByUnshakable` | true | false | Q10 | H |
| `boss.rassemblementPullThenPush` | true | false | Q10 | DB sl80935 (ordre) |
| `boss.giftCancelsRassemblement` | false | true | Q10 | bug rapporté (R) |
| `boss.invulnerabilityLiftedBeforeEntryDamage` | true | false | Q11 | H |
| `boss.invulnerabilityBackBeforeTurnStartSpikes` | true | false | Q11 | H |
| `boss.catastroollBonusScope` | `restOfTurn` | `nextCastOnly`, `none` | Q24 | H |
| `boss.levelForPushDamage` | 1000 | 200 | Q25 | DB mo7984 |
| `boss.favourCap` | null | 5 | Q35 | DB (V) contre DPLN |
| `objectives.maxCount` | 6 | 5 | Q12 | DB sp30443 |
| `objectives.offerCount` | 2 | 3, 4 | Q12 | vidéos (R) |
| `objectives.offerDraw` | `uniform` | — | Q12 | H |
| `objectives.tier6Offered` | true | false | Q12 | DB contre Zephiron |
| `objectives.votePolicy` | `planner` | liste fixe | — | — |
| `objectives.pushKillsCount` | true | false | Q18 | client (V) contre sspritenL |
| `objectives.glyphKillsCreditPlayer` | false | true | Q18 | H |
| `objectives.solitudeBeforeArrival` | true | false | Q34 | H |
| `objectives.mamaCountsFromTurn` | 7 | 8 | Q34 | H |
| `objectives.v100MeansFull` | true | false | Q34 | H |
| `bonuses.offerCount` / `draw` | 3 / `uniform_distinct` | — | Q13 | DPLN (R) / H |
| `bonuses.firstTurn` / `lastTurn` | 2 / 9 | — | Q13 | VOD (Robs) |
| `bonuses.doubleApplication` | false | true | Q23 | H |
| `bonuses.policy` | `planner` | `PO_first`, `PA_first`, `DF_first` | Q13 | vidéos (R) |
| `gifts.spawnProbability` | 0.72 | 0–1 | Q14 | VOD 63/88 (Robs) |
| `gifts.cellDraw` | `uniform_free` | `weighted_observed` | Q14 | H |
| `gifts.cardCount` / `cardMix` | 2 / {2U: 1/3, 2A: 1/3, 1+1: 1/3} | — | Q14 | DPLN (R) / H |
| `gifts.pushedPlayerTriggers` | true | false | Q14 | sspritenL (R) |
| `gifts.upgradedSpellGreyedUntilNextTurn` | false | true | Q15 | bug rapporté (R) |
| `spells.newSpellUsableSameTurn` | true | false | Q15 | vidéos (R) |
| `spells.penseVite.maxCasts` / `turnSeconds` | 3 / 10 | 2–6 / 15 | Q16 | vidéos (R) / DB sl80843 |
| `spells.relachementGrowthStart` | `nextTurnStartAfterObtain` | `immediate` | Q17 | H |
| `spells.voltigeUpgradedMaxPerTurn` | 2 | 3 | Q26 | DB sl80775 |
| `spells.ggUpgradedKeepsRecastBonus` | false | true | Q27 | client (406) + H |
| `spells.jaillissementUpgradeBroken` | false | true | Q28 | H |
| `spells.maledictionCollateraleChains` / `HitsCarrier` | true / false | — | Q29 | H |
| `spells.maledictionRegenerantePercent` / `Zone` | 100 / `C2` | 50 / `all` | Q29 | DB (V) contre DPLN |
| `spells.pulsationChaotiqueBounceRange` | null | 5 | Q29 | H |
| `spells.chamboulementBounceTarget` | `nearest` | — | Q29 | H |
| `spells.poutchLifetimeTurns` | null | 1 | Q30 | H |
| `spells.protectionProlongeeSelfHeals` | 1 | 2 | Q31 | H |
| `spells.delivranceWorks` | true | false | Q31 | DB contre Willseir |
| `spells.coupDeSangCreatesErosion` / `impactCritHitsPoutch` | false / false | true | Q32 | H |
| `archetypes.hpMode` | `flat30000` | `passiveApplies` | Q20 | VOD + DPLN |
| `archetypes.dompteurPower` | 0 | 3000 | Q20 | VOD (Robs) |
| `rng.rollMode` | `uniform` | `clientPreview` | Q22 | H |
| `engine.subSpellsIgnoreCastConditions` | true | false | Q33 | H |
| `engine.pushLevelForArchetypes` | 200 | niveau réel | Q38 | DB mo7980 |
| `victory.canFinishFromTurn` | 10 | 11 | Q19 | GD (R) |
| `victory.turnLimit` | null | entier | Q19 | — |
| `map.dynamicObstacles` | false | true | Q39 | GD + VOD |

---

## 13. `tests` (valeurs de référence)

Le moteur doit reproduire ces valeurs avant toute utilisation stratégique. Chaque test cite sa source.

| # | Situation | Attendu | Source |
|---|---|---|---|
| T1 | Frappe Repoussoir (archétype) sur Trooll | 976–1 220, crit 1 281–1 525 ; ×2 sur Vulnérable | CLI273 + DPLN « 1 200 » ; N70 §4.7 |
| T2 | Impact au centre / 1 case / 2 cases | 4 148–4 514 / 3 733–4 062 / 3 318–3 611 | N70 §4.6 |
| T3 | Videur critique, cible à 1 case du centre de T, poussée dans les pics | −2 000 puis **−7 904** (3 952 × 2) ; relevé VOD −9 904 au total | N1D §12 (VOD s289_07) |
| T4 | Grondement critique jet 99 sur Trooll Vulnérable | **12 078** | N1D §12 (VOD s295_05) |
| T5 | Carte : voisins de 300 | {286, 287, 314, 315} | `tools/map/mapgeom.py` |
| T6 | T1 : Acrobate sur 314, Videur sur 256 puis 372 | 242 → 199 et 358 → 402 (dans les pics) | N1A §7.2 (`D:acro.workedExamples`) |
| T7 | Poussée d'un Trooll depuis 300 jusqu'au bord (axe) | s'arrête sur une case de profondeur 1, dans les pics (ex. 416) | N70 §5.2 |
| T8 | Collision archétype, 1 case restante | 283 ; entité percutée 141 | N70 §5.3 |
| T9 | Monstre commençant son tour dans les pics | 2 000 (1 000 × 2) | DB sl81026 + vidéos |
| T10 | Mama, arrivée | T8, case 300 (287 si occupée), joueurs alignés repoussés au bord sans dommages | DB + VOD |
| T11 | PV effectifs dans les pics | Troollibre 11 500, Artroolleur 8 500, Nitrooll 10 000, Mama 74 000 | N20 §3.1, §4.3 |
| T12 | Relâchement de Fureur +100 sur la Mama Vulnérable | 35 014–36 844 (crit 41 114–42 944) | N1D §6 |
| T13 | Pulsation d'Énergie centrée sur 300 | soigne les 4 cases de départ à 90 % (E ≈ 4 × 2 734) | N1M §3.2 |
| T14 | Faveur | DF de la Mama 125 % → 100 % après 5 objectifs | DB sl81098, sl80933 |
| T15 | Spawn V1 | 242 et 358 | VOD 11/11 |
| T16 | Tir d'Artroollerie sur joueur hors pics | 1 736–2 015 (crit 2 077–2 387) | N20 §3.3 |

---

## 14. Correspondance avec les fichiers de recherche existants

| Section cible | Fichier source | Champs à reprendre | Transformation |
|---|---|---|---|
| `map` | `research/data/map_139988488.json` | `cells[]` (id, x, y, fightWalkable → walkable, los, glyph → spikes, edgeDepth, neighbours), `specialCells` | renommage ; filtrer les champs d'affichage |
| `map.giftCells`, `boss.waitCell/arrival`, `scenario.waves[].spawn` | `research/data/map_annotations.json` | `eventGlyphCells`, `eventGlyphCounts`, `mamaWaitingCell`, `mamaArrivalCell`, `mamaArrivalFallbackCell`, `mamaPushLines`, `monsterSpawnCells`, `monsterSpawnModel`, `perFightWaveSpawns` | poids = nombre de combats ; attribution par type depuis `slotsByType` |
| `spells` | `research/raw/dofusdb/spell_levels.json`, `spells.json` | tous les champs de lancer et d'effets | normalisation §7.2 ; `exec = !forClientOnly` ; sous-sorts selon les règles d'extraction |
| `spells[].sim`, `expected` | `research/data/archetype_*.json` | `levels.*.simModel`, `expectedDamage` | copie |
| `archetypes` | `research/data/archetype_*.json`, `fight_scripts.json` (`spellUnlockOrder`, `bonusesByArchetype`, `spellImprovements`, `uniqueSpells`) | stats, sorts, améliorations, acclamations | fusion |
| `monsters`, `boss` | `research/data/monsters.json` | `monsters`, `spells`, `boss`, `aiModel` (→ config) | séparer faits / IA |
| `states` | `research/raw/dofusdb/spell_states.json`, `monsters.json.states` | effectsIds, drapeaux | filtrage |
| `effects` | `research/data/effects_semantics.json`, `action_ids_dofus3.json` | action, catégorie, paramètres, sémantique | ajout du gestionnaire et de la priorité v1 |
| `scenario.objectives`, `choices`, `victory`, `timeline` | `research/data/fight_scripts.json` | `objectives`, `choices`, `victoryCondition`, `turnStructure`, `waves.composition` | codage déclaratif §11.5 |
| config | `fight_scripts.json.simulatorParameters`, `archetype_dompteur.json.simulatorParameters`, `monsters.json.aiModel.parameters`, `QUESTIONS_OUVERTES.md` | tous | réunion sous les noms du §12 |
| `rules` | `research/notes/70_formules_dofus.md`, `tools/mechanics/` | formules | les modules Python restent l'implémentation de référence |
