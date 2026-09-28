# 41 — Carte du Gladiatrool : données de cellules réelles (client DOFUS 3)

> Agent « CARTE — données ». Rédigé le 2026-09-28. Tous les chiffres ci-dessous sont regénérables par
> `python3 tools/map/build_gladiatrool_map.py --cache <dossier_temp>` (voir § 8).
>
> Niveaux de confiance : **haute** / **moyenne** / **basse**.
> Étiquettes : **FAIT vérifié** (source primaire = données du client ou de DofusDB extraites du client),
> **FAIT rapporté** (guide, capture), **HYPOTHÈSE**.

---

## 0. Résumé (à lire en premier)

| # | Résultat | Statut | Confiance |
|---|----------|--------|-----------|
| 1 | Le combat **ne se déroule pas** sur la map 139988485. La carte de combat est la **map 139988488** (« Arène du Gladiatrool », posX/posY 0,0 dans DofusDB). 139988485 est le **hall RP** de l'arène, en [-9,-41] (PNJ Monsieur Layool sur le trône en bois). 139725313 est la map extérieure en [-9,-41]. | FAIT vérifié + recoupements | haute |
| 2 | Zone jouable : **241 cellules**. Dans le repère MapPoint, c'est un **disque/octogone de 17 × 17** centré sur la **cellule 300** (x=17, y=-4). **Aucun obstacle** et **aucune cellule bloquant la ligne de vue** à l'intérieur : la LdV n'est bloquée que par les entités. | FAIT vérifié | haute |
| 3 | Placement joueurs (équipe rouge) : **286, 287, 314, 315** = les 4 voisines de la cellule 300. Une seule cellule bleue : **152**, isolée hors de l'arène. | FAIT vérifié | haute |
| 4 | Glyphe des pics : liste **officielle** de 100 cellules dans le sort 30390 « Glyphe de combat » (spell-level 80489). **96** sont jouables : c'est l'**anneau extérieur de 2 cellules d'épaisseur** (toutes les cellules à 1 ou 2 pas du bord, plus 4 cellules d'angle à 3 pas : 160, 295, 305, 440). Les 4 autres (250, 293, 321, 362) ne sont pas marchables et n'ont donc aucun effet. | FAIT vérifié | haute |
| 5 | Les 96 cellules jouables du glyphe correspondent **exactement** aux 96 dalles « trouées » d'où sortent les pics dans le décor (266 éléments « pic »). La liste de données et le dessin coïncident. | FAIT vérifié | haute |
| 6 | Il reste **145 cellules jouables hors des pics**. Le centre 300 a un edgeDepth de 9 (8 pas jusqu'à une cellule de bord) et se trouve à 7 pas de la cellule de pics la plus proche. | FAIT vérifié | haute |
| 7 | Le sort 30609 « Rassemblement Troollesque » (grade 3, effet 2960) vise explicitement la **cellule 300**. C'est très probablement la case d'arrivée de la Mama Troollette (la capture DPLN la montre au centre). | FAIT vérifié (donnée) + HYPOTHÈSE (interprétation) | moyenne-haute |
| 8 | Cellule bleue 152 : marchable mais `nonWalkableDuringFight`. Elle forme une zone isolée (`linkedZone` 32), entourée de 8 cellules qui bloquent la LdV. C'est sans doute le poste d'observation de la Mama avant son entrée (le guide dit qu'elle « regarde le combat sur le côté de la map »). | HYPOTHÈSE | moyenne |

Fichiers produits :

- `research/data/map_139988488.json` : **carte de combat, fichier principal**.
- `research/data/map_139988485.json` : hall RP, pour comparaison et parce que ce chemin était demandé.
- `research/figures/map_139988488_grid.txt` : 4 vues ASCII avec les ids (écran, MapPoint, compacte, profondeur de bord).
- `research/figures/map_139988488_overlay.png` (non versionné, art © Ankama ; régénérable) : grille + ids sur le rendu DofusDB, calibrée.
- `research/figures/map_139988488_schematic.png` : même grille, sans décor.
- `research/figures/map_139988485_grid.txt` et `research/figures/map_139988485_overlay.png` (non versionné) : hall RP.
- `tools/map/` : `cytrus.py`, `d2p.py`, `dlm.py`, `d3_mapdata.py`, `mapgeom.py`, `build_gladiatrool_map.py`.

---

## 1. Méthode : ce qui a été tenté (ordre A → B → C)

### A. Sources existantes (échec partiel, abandonné quand B a réussi)

- **API DofusDB** (`https://api.dofusdb.fr`) :
  - `/map-positions/<id>` renvoie seulement des métadonnées (coordonnées, sous-zone, capacités, `worldMap`). Aucune cellule.
  - `/maps/<id>` : collection vide (`total: 0`).
  - `/map-data`, `/cells`, `/map-cells` : 404.
  - En lisant les bundles JS du site (`https://dofusdb.fr/js/*.js`), on trouve la fonction `getCellData` : `GET /cell-data?mapId=&cellId=`. Elle répond **401 Not authenticated** : c'est un outil d'administration (tag des éléments graphiques), pas une source publique.
- **Doc Ankabot** (MCP) : l'API interne du bot `d2data:mapData(mapId)` expose `Cells[i].walkable / Los`. Elle n'est utilisable que dans le bot, ce n'est pas une source de données exploitable ici.
- Recherche GitHub : non poursuivie, car B fournit la source primaire.

### B. Client du jeu via le CDN Ankama Cytrus v6 (**succès**)

1. `https://cytrus.cdn.ankama.com/cytrus.json` (consulté le 2026-09-28). Releases du jeu `dofus` :
   - `main` = `6.0_2.73.3.14` (DOFUS 2) ;
   - `dofus3` = `6.0_3.6.12.16` (**DOFUS 3 en production**) ;
   - `beta` = `6.0_3.7.2.2` ;
   - `experimental` = `6.0_3.6.12.19`.
2. Les manifestes `…/dofus/releases/<release>/windows/<version>.manifest` sont au format FlatBuffers. Le parseur minimal est dans `tools/map/cytrus.py`. Les fichiers sont reconstitués par requêtes HTTP Range dans `…/dofus/bundles/<hh>/<hash>`, avec vérification SHA-1.
3. **DOFUS 2** (release `main`, 2.73.3.14). On a téléchargé `content/maps/maps0..7.d2p` (12 154 maps), puis les index d2p ont été parsés (`d2p.py`) et les `.dlm` décodés (`dlm.py`).
   - Particularités observées :
     - trailer d2p = 6 × u32 big-endian ;
     - propriété `link` chaînant `maps0 → maps7` ;
     - DLM `mapVersion 11` **sans** les champs `useLowPassFilter/useReverb/presetId`. Avec cette correction, le parse consomme exactement le buffer (0 octet restant).
   - Résultat :
     - **139725313** existe : map extérieure, 226 cellules marchables, **aucune** cellule de placement ;
     - **139988485 et 139988488 sont absentes** de cette version DOFUS 2.
   - Donc la release DOFUS 2 publique ne permet pas d'étudier le Gladiatrool. (FAIT vérifié, confiance haute.)
4. **DOFUS 3** (release `dofus3`, 3.6.12.16) :
   - Le catalogue Addressables `Dofus_Data/StreamingAssets/Content/Map/Data/catalog_1.0.bin` (sha1 `cda53a26…`) référence `map_139988485.asset` et `map_139988488.asset`. Les deux sont dans `mapdata_assets_world_534.bundle` (366 270 octets, sha1 `7b8cdb95f1a1ac3bb8e65d73c37fc8a843a9eaa5`). Ce bundle contient 14 maps de la Foire du Trool (sous-zone 84).
   - Lecture avec **UnityPy** (`FALLBACK_UNITY_VERSION = 6000.0.0f1`, le bundle ne porte pas de version). Le `MonoBehaviour map_<id>` a un type tree complet. `mapData.cellsData[560]` expose pour chaque cellule :
     - `cellNumber, speed, mapChangeData, moveZone, linkedZone` ;
     - `mov, los, nonWalkableDuringFight, nonWalkableDuringRP` ;
     - `farmCell, visible, havenbagCell, roleplayMonstersMovementBlocked` ;
     - `floor, red, blue, arrow`.
   - Les éléments graphiques (`backgroundElements`, `sortableElements`, …) donnent le décor (dalles, pics).
5. **Contre-vérification sur la beta 3.7.2.2** : le layout change. Les champs sont à plat, les éléments passent en `SerializeReference`, `nonWalkableDuringFight/RP` disparaissent et `floor` devient `altitude`. Mais `cellsData` (champs communs) et les positions des dalles trouées sont **identiques** pour 139988485 et 139988488. La carte ne change donc pas avec la prochaine mise à jour. (FAIT vérifié, confiance haute.)

### C. Image (vérification seulement)

Rendu DofusDB : `https://api.dofusdb.fr/img/maps/1/<id>.jpg` (1910 × 970).

- **Calibration** : `image_x = 1.0 × px + 332.5`, `image_y = 1.0 × py + 4.0`, avec (px, py) le centre DOFUS 2 de la cellule. Elle est obtenue en maximisant le gradient d'image le long des arêtes de la grille. Elle est cohérente avec un rendu 1:1 centré horizontalement : (1910 − 1247)/2 ≈ 331,5. Précision ≈ ±2 px.
- **Contrôle photométrique** : la luminance moyenne au centre des cellules du glyphe vaut 101,5, contre 145,5 pour les autres cellules jouables. Les cellules de pics sont bien les dalles sombres trouées.
- **Captures DPLN** (téléchargées dans le scratchpad, non versionnées) :
  - `tuto2k-5_orig.jpg` : vue de l'arène, identique au rendu de 139988488 ;
  - `tuto2k-46_orig.jpg` : Mama Troollette au centre du damier, flèches selon les deux axes ;
  - `ark26gladia78_orig.jpg` : Monsieur Layool sur le trône de 139988485.

---

## 2. Quelle map pour le combat ? (preuves)

| Indice | 139988485 (hall) | 139988488 (combat) |
|--------|------------------|--------------------|
| DofusDB `map-positions` | [-9,-41], worldMap -1, nom « Arène du Gladiatrool », `outdoor=false` | [0,0], worldMap 1, nom « Arène du Gladiatrool », `outdoor=true` (pas de coordonnées réelles, typique d'une map d'instance) |
| Rendu DofusDB | sable, trône en bois central, micro : décor RP | damier + anneau de dalles à pics : identique aux captures de combat DPLN |
| Cellules de placement `red`/`blue` | **aucune** | 4 rouges (286, 287, 314, 315) + 1 bleue (152) |
| Liste du glyphe 30390 (100 cellules) projetée | mêmes ids donc même anneau géométrique, mais **pas au bord** de la zone marchable du hall (profondeur de bord 1 à 6, zone marchable qui descend jusqu'à y=-17) | 96 jouables = exactement l'anneau de bord (profondeur 1–2) ; 4 hors zone |
| Dalles trouées (pics) du décor | 4 (petits motifs décoratifs) | 96 = le glyphe |

Conclusion : la carte de combat est **139988488** (confiance **haute**). Le guide DPLN dit : « Une fois dans l'arène il ne vous restera plus qu'à parler à Monsieur Layool une nouvelle fois pour lancer le combat ». Le PNJ se trouve sur 139988485 et le combat est transféré sur 139988488.

---

## 3. Carte de combat 139988488 : résultats

### 3.1 Comptes (FAIT vérifié, confiance haute)

| Élément | Valeur |
|---------|--------|
| Cellules marchables (`mov`) | 242 (241 + la cellule bleue 152) |
| Cellules jouables en combat (`mov && !nonWalkableDuringFight`) | **241** |
| Cellules bloquant la LdV (`los=false`) | 8, uniquement autour de 152 : 124, 137, 138, 151, 153, 165, 166, 180 |
| `farmCell`, `havenbagCell`, `mapChangeData`, `arrow`, `speed` | tous à 0 / faux |
| `floor` (altitude) | 0 partout sauf 152 (10) |
| `linkedZone` | 17 pour toute l'arène, 32 pour 152 (zone isolée) |
| Rangées écran occupées | 9 à 33 ; chaque rangée est un intervalle contigu d'ids (131–133, 144–149, …, 467–469) |
| Étendue MapPoint | x ∈ [9, 25], y ∈ [-12, 4] |

### 3.2 Forme (repère MapPoint, `^` = pics, `R` = placement, `.` = sûr)

```
    4       ^^^^^^^           y=4 : x = 14..20
    3     ^^^^^^^^^^^
    2    ^^^.......^^^
    1   ^^^.........^^^
    0   ^^...........^^
   -1  ^^.............^^
   -2  ^^.............^^
   -3  ^^......R......^^
   -4  ^^.....R.R.....^^      centre 300 = (17,-4), entouré des 4 R
   -5  ^^......R......^^
   -6  ^^.............^^
   -7  ^^.............^^
   -8   ^^...........^^
   -9   ^^^.........^^^
  -10    ^^^.......^^^
  -11     ^^^^^^^^^^^
  -12       ^^^^^^^           y=-12 : x = 14..20
       90123456789012345      (x mod 10, x = 9..25)
```

La vue avec tous les ids est dans `research/figures/map_139988488_grid.txt` (VUE 2).

### 3.3 Profondeur de bord (`edgeDepth`)

`edgeDepth` = nombre minimal de pas (distance de Manhattan en MapPoint) jusqu'à une case non jouable ou hors carte. Il vaut 1 pour une cellule collée au bord.

| edgeDepth | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|-----------|---|---|---|---|---|---|---|---|---|
| cellules jouables | 48 | 44 | 40 | 32 | 28 | 24 | 16 | 8 | 1 (= 300) |
| dont dans les pics | 48 | 44 | **4** | 0 | 0 | 0 | 0 | 0 | 0 |

Donc **pics = toutes les cellules à 1 ou 2 pas du bord, plus 160, 295, 305 et 440**. Ces quatre cellules sont à 3 pas du bord, dans les angles diagonaux de l'octogone (x=12 ou 22, y=1 ou -9). **145 cellules sûres.**

### 3.4 Cellules spéciales

- **Centre** : 300 = (17,-4). Ses voisines sont 286, 287, 314 et 315, c'est-à-dire les 4 cases de placement rouges. Les joueurs commencent donc collés au centre. (FAIT vérifié.)
- **Lignes passant par le centre** (utile contre la poussée « en ligne » de la Mama à son arrivée, FAIT rapporté par DPLN : « il faut éviter de placer des personnages dans la ligne de sa case d'arrivée au tour 7 ») :
  - axe x = 17 (diagonale écran haut-gauche ↔ bas-droite) : 192^, 206^, 219, 233, 246, 260, 273, 287, **300**, 314, 327, 341, 354, 368, 381, 395^, 408^ ;
  - axe y = −4 (diagonale écran bas-gauche ↔ haut-droite) : 184^, 199^, 213, 228, 242, 257, 271, 286, **300**, 315, 329, 344, 358, 373, 387, 402^, 416^.
  - Les 4 cases de placement sont toutes sur ces deux axes : un personnage qui y reste sera repoussé.
- **Cellule bleue 152** = (17, 7). Elle est au-dessus du coin haut-droit, dans les gradins, hors de l'arène. Voir l'HYPOTHÈSE du § 0, point 8.
- **Cellules du glyphe non jouables** : 250 (21,4), 293 (23,3), 321 (24,2), 362 (25,0). Elles sont juste à l'extérieur du bord droit de l'arène à l'écran (rangées 17 à 25, colonnes 12-13), dans le coin (+x,+y) du repère MapPoint. Sans effet tant qu'elles restent non marchables. La liste est asymétrique : les cellules symétriques côté gauche (238, 280, 308, 350, elles aussi non marchables) n'y figurent pas. HYPOTHÈSE : erreur ou vestige de conception (ces 4 cellules sont marchables sur le hall 139988485).

### 3.5 Le glyphe dans les données de sort (FAIT vérifié via DofusDB, extrait du client)

- `https://api.dofusdb.fr/spell-levels/80489` (sort **30390 « Glyphe de combat »**, grade 1) contient deux effets. Les deux ont la même zone `shape = 59` (liste explicite de 102 ids, dont 351 et 455 en double, soit 100 cellules distinctes) et `targetMask a,A`.
  - effet **401** « Pose un glyphe de début de tour » → lance 30390 **grade 3** (spell-level 81026, effet 100 « dommages Neutre » valeur 1000) ;
  - effet **1091** « Pose un glyphe-aura » (déclenché à l'entrée) → lance 30390 **grade 2** (spell-level 80492) :
    - états 5902/5903 (`ennemiHasTriggeredCombatGlyph` / `allyHasTriggeredCombatGlyph`) ;
    - état 5994 **Vulnérable** ;
    - effet 100 valeur 2000 ;
    - effet 1163 « Dommages subis x#1% » valeur 200.
- Le DPLN rapporte **2 000** dégâts au début du tour. La donnée brute du grade 3 est 1000 : l'écart vient sans doute des caractéristiques du lanceur ou des multiplicateurs. Ce point est à trancher par l'agent « sorts », hors du périmètre de la carte.
- Le sort 30427 « Simili Pics » (spell-level 80584) ne porte pas de liste de cellules : c'est un sort d'états.

### 3.6 Autres cellules codées en dur dans les sorts 30370–30700

On a balayé tous les niveaux de sort (429) pour trouver les zones `cellIds` non triviales :

- **30609 Rassemblement Troollesque, grade 3** (spell-level 80837) : effet 2960 → 30609 grade 4, sur la **cellule [300]**. Le grade 4 (81100) contient l'effet 4 « Téléporte sur la case ciblée », zone cercle 63.
- **Aucune** liste de cellules pour les invocations ou apparitions des vagues. Les positions d'apparition des monstres ne sont donc pas dans les données statiques : elles sont décidées par le serveur (script). C'est une HYPOTHÈSE, à confirmer par les vidéos (autre agent).
- Les sorts « Lancer de dagues » (30373–30379, 30697–30698) et « Ligne d'arrivée » (30692/30699) portent des listes de cellules, mais ils appartiennent à d'autres attractions de la Foire. Ils ne concernent pas le Gladiatrool.

---

## 4. Conversion cellId ↔ coordonnées (testée)

Implémentée dans `tools/map/mapgeom.py`. Les auto-tests s'exécutent avec `python3 tools/map/mapgeom.py`.

- `row = id // 14` (0..39), `col = id % 14` (0..13). Les rangées impaires sont décalées d'une demi-cellule vers la droite.
- **MapPoint** : `a, r = divmod(id, 28)`.
  - Si `r < 14` : `(x, y) = (a + r, r − a)`.
  - Sinon : `(x, y) = (a + 1 + r − 14, r − 14 − a)`.
  - Inverse : `id = (x − y)·14 + y + (x − y)//2`.
  - Plage : x ∈ [0,33], y ∈ [-19,13].
- **Axes à l'écran** :
  - +x = bas-droite (SE), +y = haut-droite (NE) ;
  - voisins = (x±1, y), (x, y±1) ;
  - distance (PO/PM) = |dx| + |dy| ;
  - « en ligne » = même x ou même y.
- **Pixels DOFUS 2** (zoom 1, cellule 86×43) : `px = 43(x+y)+43 = 86·col + 43 + 43·(row%2)`, `py = 21.5(x−y)+21.5 = 21.5·row + 21.5`.
- **Tests** :
  - bijection sur les 560 cellules ;
  - valeurs de référence : 0→(0,0), 1→(1,1), 14→(1,0), 27→(14,13), 559→(33,-6) ;
  - voisins de 300 = {286, 287, 314, 315} ;
  - chaque `neighbours` du JSON est à distance 1 et jouable (vérifié à la génération).
- **Recalage du décor** : les positions « monde » des éléments de fond DOFUS 3 suivent le réseau 43 × 21,5 px, avec l'axe y vers le haut (convention Unity). Les 234 dalles de sol tombent toutes sur des cellules marchables pour la translation `I0=-15, J0=23` (`source.tileFit` dans le JSON). Le miroir vertical donne **le même** ensemble de dalles trouées, car le motif est symétrique. L'identification des pics ne dépend donc pas de cette ambiguïté.

---

## 5. Structure du JSON `map_139988488.json`

- **En-tête** :
  - `mapId`, `role`, `generatedOn` ;
  - `source` : release, version, manifeste, bundle + sha1, clé Addressables, provenance du glyphe et du centre, contre-vérifications, recalage ;
  - `width: 14`, `height: 20`, `cellCount: 560` ;
  - `coordinates` : formules et calibration de l'image.
- **`specialCells`** :
  - `arenaCenter`, `playerPlacementRed`, `blueCells`, `blueNote`, `rassemblementTroollesqueCells` ;
  - `glyphCellList` (brute, 102 ids) ;
  - `fightWalkableCells` (241), `glyphFightWalkableCells` (96), `safeFightCells` (145), `edgeCells` (48), `glyphDepth3Cells`.
- **`summary`** : comptes et distributions.
- **`cells[560]`** :
  - données client : `id, row, col, x, y, px, py, walkable (=mov), los, nonWalkableDuringFight, nonWalkableDuringRP, farmCell, visible, havenbagCell, red, blue, floor, speed, mapChangeData, moveZone, linkedZone, arrow, roleplayMonstersMovementBlocked` ;
  - **dérivés** : `fightWalkable`, `glyph` (liste 30390), `spikeTile` (décor), `edgeDepth`, `distCenter` (distance à 300), `neighbours` (voisines jouables).

`map_139988485.json` a la même structure (hall RP : 372 cellules marchables, aucune bloquant la LdV, aucun placement). Son champ `role` avertit qu'il ne s'agit pas de la carte de combat.

---

## 6. Conséquences pour le simulateur

1. **Grille** : graphe 4-connexe sur les 241 cellules (`neighbours`, 3,72 voisines en moyenne). Il n'y a aucun obstacle statique, ni pour la marche ni pour la LdV. Seules les entités bloquent le passage et la LdV. (FAIT vérifié.)
2. **Pics** : une entité « entre dans les pics » quand elle arrive, par marche, poussée, attirance ou téléportation, sur une cellule `glyph=true`. Elle « commence son tour dans les pics » si sa cellule est `glyph=true` au début de son tour. Effets (FAIT rapporté DPLN + données 80492/81026) : 2000 dégâts + Vulnérable à l'entrée, et des dégâts en début de tour.
3. **Poussées** : on sort de la zone jouable directement vers une case non marchable. Une poussée vers l'extérieur s'arrête donc sur une cellule de profondeur 1, qui est toujours dans les pics. Il suffit de faire arriver un monstre à une profondeur ≤ 2 (ou sur 160/295/305/440) pour déclencher le glyphe. Depuis la zone sûre la plus externe (profondeur 3, hors les 4 angles), une poussée d'**1 case** vers l'extérieur suffit. Le choc contre le bord (case non marchable) entraîne des dommages de poussée ; formule à documenter ailleurs.
4. **Placement initial** : les 4 joueurs sont collés au centre (286/287/314/315). Le centre 300 est probablement la case d'arrivée de la Mama : il faut quitter les axes x=17 et y=−4 avant son entrée.
5. **Obstacles dynamiques** : le DPLN mentionne que « certains obstacles apparaissent sur la map pendant le combat ». Ils ne sont **pas** dans les données de carte : ce sont des effets de sort. Il faudra les modéliser comme des cellules temporairement non marchables et bloquant la LdV.

---

## 7. Limites et niveau de confiance

- **Identification de la map de combat** : haute. Elle repose sur un faisceau d'indices (données de placement, liste du glyphe, décor, captures), pas sur un log réseau du serveur.
- **Drapeaux de cellules** (`mov/los/red/blue/nonWalkableDuringFight`) : haute. Ils viennent directement du client, et sont identiques sur la 3.6.12.16 (live) et la 3.7.2.2 (beta). Le serveur peut en théorie utiliser une copie différente de la carte. Rien ne l'indique : les captures correspondent.
- **Cellules du glyphe** : haute (données de sort du client, redistribuées par DofusDB, identiques aux dalles du décor).
- **Interprétations** (cellule 300 = arrivée de la Mama, 152 = poste d'attente de la Mama) : moyenne. Elles sont à confirmer avec des vidéos de combat.
- **Écart 1000 / 2000 dégâts** du glyphe en début de tour : non résolu ici (hors périmètre).
- **Calibration image** : ±2 px. Elle sert uniquement à la vérification visuelle, aucune donnée n'en dépend.
- **Droits** : l'overlay `map_139988488_overlay.png` contient un recadrage du rendu DofusDB (art © Ankama), comme demandé pour la vérification humaine. `map_139988488_schematic.png` n'en contient pas. Les captures DPLN et les téléchargements du client restent dans le scratchpad.

---

## 8. Reproduire

```bash
pip install UnityPy pillow numpy
python3 tools/map/mapgeom.py                                 # auto-tests géométrie
python3 tools/map/build_gladiatrool_map.py --cache /tmp/…/scratchpad/big/build_cache
#   -> télécharge cytrus.json, manifeste dofus3 (~52 Mo), catalog (1,7 Mo), bundle world_534 (0,37 Mo),
#      spell-levels 80489/80837, rendus DofusDB ; écrit research/data + research/figures
# Outils unitaires :
python3 tools/map/cytrus.py list <manifest> 'Map/Data'       # lister les fichiers du client
python3 tools/map/cytrus.py get  <manifest> <fichier> <sortie>
python3 tools/map/d3_mapdata.py find  <catalog_1.0.bin> 139988488
python3 tools/map/d3_mapdata.py cells <bundle> 139988488 out.json
python3 tools/map/d2p.py extract 139725313 out.dlm maps*.d2p && python3 tools/map/dlm.py out.dlm   # DOFUS 2
```

Sources :

- CDN Ankama Cytrus : https://cytrus.cdn.ankama.com/cytrus.json (release `dofus3` 6.0_3.6.12.16, `beta` 6.0_3.7.2.2, `main` 6.0_2.73.3.14).
- DofusDB :
  - https://api.dofusdb.fr/map-positions/139988485
  - https://api.dofusdb.fr/map-positions/139988488
  - https://api.dofusdb.fr/map-positions/139725313
  - https://api.dofusdb.fr/spell-levels/80489
  - https://api.dofusdb.fr/spell-levels/80492
  - https://api.dofusdb.fr/spell-levels/81026
  - https://api.dofusdb.fr/spell-levels/80837
  - https://api.dofusdb.fr/spell-levels/81100
  - https://api.dofusdb.fr/effects/401
  - https://api.dofusdb.fr/effects/1091
  - https://api.dofusdb.fr/img/maps/1/139988488.jpg
- Guide : https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026). Captures `tuto2k-5_orig.jpg`, `tuto2k-46_orig.jpg`, `ark26gladia78_orig.jpg`.
