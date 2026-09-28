# 70 — Formules et règles du moteur de combat DOFUS (pour le simulateur du Gladiatrool)

> Agent « FORMULES / MOTEUR ». Rédigé le 2026-09-28.
>
> Étiquettes :
> - **FAIT vérifié** : lu dans le code ou les données du jeu (client DOFUS 2.73.3 décompilé, métadonnées du
>   client DOFUS 3, données DofusDB extraites du client).
> - **FAIT rapporté** : guide, forum, wiki.
> - **HYPOTHÈSE** : déduction non vérifiée.
>
> Confiance : **haute** / **moyenne** / **basse**.
>
> Code associé (Python 3, stdlib seule, testé) : `tools/mechanics/`.
> - `geometry.py` : coordonnées, directions, ligne de vue, portée.
> - `zones.py` : formes de zone et dégressivité.
> - `damage.py` : dégâts, soins, boucliers, multiplicateurs.
> - `movement.py` : poussée, collisions, téléportation, tacle, pathfinding.
> - `verify_mechanics.py` : **62 contrôles, tous OK**.
> - `damage_table.py` : contrôle croisé avec les chiffres DPLN.
> - `build_effects_semantics.py` : génère `research/data/effects_semantics.json`.
> - `il2cpp_actionids.py` : génère `research/data/action_ids_dofus3.json`.

---

## 0. Résumé (à lire en premier)

| # | Règle | Statut | Confiance |
|---|---|---|---|
| 1 | Toutes les formules ci-dessous viennent du code du client. Le client embarque une **bibliothèque de prévisualisation des dégâts** : Haxe `damageCalculation` + `mapTools`, avec `MapTools.initForDofus2 / initForDofus3`. Ce code a été lu dans la **dernière version Flash (2.73.3)**, que j'ai décompilée moi-même. DOFUS 3 en contient un portage C# : `Core.Features.Fight.FightPreview.*`, dont `DragUtils`, `ReceivedDamageUtils`, `SpellZoneShape*Behavior`, `ComparePosition`. Le serveur fait autorité : dans de rares cas limites, l'aperçu peut diverger du serveur. | FAIT vérifié | haute |
| 2 | Repère : `row = id // 14`, `x = (row+1)//2 + col`, `y = col - (row - (row+1)//2)`. Distance = \|dx\| + \|dy\|. Voisins = (x±1, y), (x, y±1). Directions 0..7 = E, SE, S, SW, W, NW, N, NE. Les directions impaires sont les axes MapPoint (diagonales à l'écran). Les directions paires sont les diagonales MapPoint (droites à l'écran, 2 de distance par pas). | FAIT vérifié | haute |
| 3 | Ligne de vue : lancer de rayon (`MapTools.getCellsIdBetween`, parcours de grille avec passage exact par les coins). Une cellule sans LdV dans les données de carte bloque, y compris la cible. Une entité bloque **seulement sur les cases intermédiaires**. Dans l'arène du Gladiatrool, aucune case ne bloque la vue : **seules les entités bloquent** (cf. note 41). | FAIT vérifié | haute |
| 4 | Dégâts « boostables » : `d = jet + bonus_de_base`. Puis `d = int(d × (100 + carac + Puissance)/100)`. Puis `d = d + Dommages + Dommages élément (+ Dommages critiques)`. Puis dégressivité de zone : `int(d × (100 − malus)/100)`. Puis résistances fixes, puis `int(d × (1 − rés%/100))`. Puis multiplicateurs de dommages infligés/reçus. Puis `int(d × Π(1163)/100)`. Enfin bouclier, puis PV. Chaque multiplication est **tronquée**. | FAIT vérifié | haute |
| 5 | L'état **Vulnérable** des pics correspond à l'effet **1163 « Dommages subis x200 % » = ×2** (c'est-à-dire **+100 %**, pas « +200 % » comme l'écrit DPLN). Son déclencheur est `D` : il s'applique à tous les dommages **sauf les dommages de poussée**. Dans les données, le ×200 % *dans* les pics ne vise que le masque `Def` (monstres). À la **sortie** des pics, les deux camps reçoivent ×200 % pendant 1 tour. | FAIT vérifié (données + code) ; lecture de `Def` = HYPOTHÈSE | haute / moyenne |
| 6 | Dommages de poussée : `int(reste × (floor(niv/2) + 32 + DoPou − RéPou_cible) / (4 × 2^i))`. `i` = 0 pour la cible poussée, 1, 2… pour les entités percutées en chaîne. Aucune caractéristique, résistance élémentaire ni dommage final. Pour un archétype (niv. 200, 1000 DoPou) : **283 par case restante**. | FAIT vérifié | haute |
| 7 | Direction de poussée : on pousse depuis le **lanceur** si la cible est sur la case ciblée, sinon depuis la **case ciblée** (centre de zone). Une poussée diagonale (cible sur une diagonale exacte) fait `ceil(n/2)` pas, et chaque pas diagonal exige que les 2 cases latérales soient libres. Les glyphes (pics compris) **n'arrêtent pas** une poussée ; les pièges l'arrêtent. | FAIT vérifié | haute |
| 8 | Tacle : `ratio = Π_ennemis_adjacents min(1, (Fuite+2) / (Tacle+2) / 2)`. En quittant une case : PM perdus = `int(PM × (1−ratio) + 0,5)`, PA perdus idem. Les Troolls ont 0 tacle et les archétypes 0 fuite (hypothèse sur les archétypes) : **quitter le contact d'un Trooll coûte la moitié des PM et des PA restants**. | FAIT vérifié (formule) | haute (formule) / moyenne (stats) |
| 9 | Durées : un buff de durée `n` perd 1 **au début de chaque tour de son lanceur**. `-1` ou ≥ 63 = permanent. `delay` = tours du lanceur avant activation. Glyphe 401 : lance son sort sur qui **commence son tour** dedans. Glyphe-aura 1091 : effets tant qu'on est dedans (entrée = effets `I`, sortie = retrait des buffs et déclencheurs `EOFF`). | FAIT vérifié (client) / FAIT rapporté (serveur) | haute / moyenne |
| 10 | 106 effectId documentés dans `research/data/effects_semantics.json`, avec le nom interne DOFUS 3 (enum `ActionIds` extraite du client IL2CPP, 1003 noms). | FAIT vérifié | haute |

---

## 0 bis. Sources et méthode

### Sources primaires (code)

- **Client DOFUS 2.73.3** (dernière version Flash).
  - Fichier : `DofusInvoker.swf` de la release Cytrus `main` 6.0_2.73.3.14 (7 922 070 octets, sha1 `92a0b228bd44bb5616a47601684171af77cffc21`).
  - Téléchargement : `python3 tools/map/cytrus.py get <manifest main windows> DofusInvoker.swf <sortie>` (outil de l'agent « carte »).
  - Décompilation : JPEXS FFDec compilé depuis https://github.com/jindrapetrik/jpexs-decompiler (commit `de7efbf4`), `ant compile`, puis :

    ```
    java -cp build/classes:lib/* com.jpexs.decompiler.flash.gui.Main -selectclass damageCalculation.++,mapTools.++,tools.++,com.ankamagames.dofus.logic.game.fight.++,com.ankamagames.jerakine.map.++,... -export script <dir> DofusInvoker.swf
    ```

  - Classes lues :
    - `damageCalculation.DamageCalculator`, `damageCalculation.damageManagement.{DamageSender, DamageReceiver, PushUtils, Teleport, TargetManagement}` ;
    - `damageCalculation.fighterManagement.{HaxeFighter, HaxeBuff}`, `damageCalculation.spellManagement.{SpellManager, HaxeSpellEffect, Mark}`, `damageCalculation.tools.StatIds` ;
    - `mapTools.{MapTools, MapDirection, SpellZone}`, `tools.ActionIdHelper`, `tools.enumeration.ElementEnum` ;
    - `com.ankamagames.jerakine.map.LosDetector`, `jerakine.utils.display.Dofus2Line`, `jerakine.types.zones.{Cross, Lozenge}`, `jerakine.pathfinding.Pathfinding` ;
    - `com.ankamagames.dofus.logic.game.fight.miscs.{TackleUtil, FightReachableCellsMaker}`, `…fight.frames.{FightSpellCastFrame, FightTurnFrame, FightBattleFrame}`, `…fight.managers.BuffManager`, `…types.{BasicBuff, TriggeredBuff}` ;
    - `com.ankamagames.dofus.internalDatacenter.spells.SpellWrapper` (taux critique, portée).
  - Sources décompilées **non versionnées** : elles restent dans le scratchpad (code propriétaire).
- **Versions antérieures publiques** (comparaison) :
  - https://github.com/HadesFR/DofusInvoker (2.58.1, décembre 2020) ;
  - https://github.com/scalexm/DofusInvoker (2.51.12) ;
  - https://github.com/Romain-P/d2gen (2.42) ;
  - https://github.com/Alleos13/Dofus-2-API (2.27).

  Entre 2.58 et 2.73, les formules de poussée, de zone et de dégâts sont **identiques**. Seuls changent les noms de stats (numéros au lieu de chaînes) et un traitement plus fin des soins (stat 143). NB : l'ancien décompilateur de 2.58 affiche `i++; j = i;` là où 2.73 affiche `j = i++`. C'est une erreur de rendu de l'ancien outil (2.58 donnerait `EVERY_CELL_ID = 1..560`) : il faut se fier à 2.73.
- **Client DOFUS 3** (release Cytrus `dofus3` 6.0_3.6.12.16).
  - Fichier : `global-metadata.dat` (IL2CPP v39, sha1 `8a2944d5…`).
  - On y lit les **noms** de classes et de méthodes (le code natif n'est pas décompilé) :
    - `Core.Features.Fight.FightPreview.{FightPreviewComputationCore, Damage.DamageUtils, Damage.ReceivedDamageUtils, Movements.DragUtils, Movements.DragResult, Movements.TeleportUtils, Spells.SpellZones.SpellZoneUtils, Targets.TargetUtils}` ;
    - `SpellZoneShape{Boomerang, Checkerboard, Circle, Cone, Cross, Fork, HalfCircle, Line, LineFromCaster, OutsideComplexCircle, PerpendicularLine, Rectangle, Square, WholeMap}Behavior` : exactement l'ensemble de formes du code Haxe ;
    - l'enum `ActionIds` (1003 valeurs), extraite par `tools/mechanics/il2cpp_actionids.py` vers `research/data/action_ids_dofus3.json`.

  → **FAIT vérifié** : DOFUS 3 a porté la même logique. Les corps de méthode n'ont pas été lus : c'est l'hypothèse de continuité, confiance haute.

### Données et sources rapportées

- **Données** : `research/raw/dofusdb/*` (sorts, niveaux, effets, états, monstres ; extraction d'un autre agent) et `research/data/map_139988488.json` (carte de combat réelle, agent « carte »).
- **Sources rapportées** :
  - DPLN https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026) ;
  - DPLN « Les dommages » https://www.dofuspourlesnoobs.com/les-dommages.html ;
  - DPLN « Tacle et fuite » https://www.dofuspourlesnoobs.com/tacle-et-fuite.html ;
  - forums officiels (poussée : https://www.dofus.com/fr/forum/1003-divers/2327746-valeur-dopous-resolu ; retrait PA/PM : https://www.dofus.com/fr/forum/1003-divers/2247846-formule-calcul-retrait-pa-pm, https://forums.jeuxonline.info/sujet/1099138/formules-de-retrait-pa-pm).

---

## 1. Système de coordonnées

### 1.1 Identifiants et repère MapPoint

**FAIT vérifié** : `mapTools.MapTools`, `MapToolsConfig.DOFUS2_CONFIG = (14, 20, 0, 33, -19, 13)`. Confiance haute.

```python
W, H = 14, 20; N = 560                      # 40 rangées de 14 cellules, rangées impaires décalées d'1/2 case à droite
def cell_to_xy(c):                          # MapTools.getCellCoordById
    row = c // W ; col = c - row*W
    a = (row + 1) // 2                      # floor
    return a + col, col - (row - a)         # (x, y)
def xy_to_cell(x, y):                       # MapTools.getCellIdByCoord
    if not is_valid_coord(x, y): return -1
    return floor((x - y)*W + y + (x - y)/2)
def is_valid_coord(x, y):                   # exact : équivaut à « est l'une des 560 cellules » (vérifié)
    return -x <= y <= x and y <= W + 13 - x and y >= x - (H + 19)
```

- x va de 0 à 33, y de -19 à 13.
- Cellule 0 = (0,0), 14 = (1,0), 1 = (1,1), 559 = (33,-6).
- **Centre de l'arène 300 = (17,-4)**. Ses 4 voisines (cases de placement) : 286, 287, 314, 315.
- Pixels (DOFUS 2, zoom 1) : `px = 43(x+y)+43`, `py = 21,5(x−y)+21,5`.
- Implémentation : `geometry.py`. Elle est identique, sur les 560 cellules, à `tools/map/mapgeom.py`, écrit indépendamment par l'agent « carte » (contrôle automatique).

### 1.2 Directions (`MapDirection`, `MapTools.COORDINATES_DIRECTION`)

| n° | nom | vecteur (dx,dy) | écran | type | distance d'un pas |
|---|---|---|---|---|---|
| 0 | EAST | (1,1) | → droite | cardinale | 2 |
| 1 | SOUTH_EAST | (1,0) | ↘ | orthogonale | 1 |
| 2 | SOUTH | (1,-1) | ↓ | cardinale | 2 |
| 3 | SOUTH_WEST | (0,-1) | ↙ | orthogonale | 1 |
| 4 | WEST | (-1,-1) | ← | cardinale | 2 |
| 5 | NORTH_WEST | (-1,0) | ↖ | orthogonale | 1 |
| 6 | NORTH | (-1,1) | ↑ | cardinale | 2 |
| 7 | NORTH_EAST | (0,1) | ↗ | orthogonale | 1 |

- `opposite(d) = d XOR 4`. `isCardinal(d) = d pair`. `isOrthogonal(d) = d impair`.
- **Attention au vocabulaire** : les directions « orthogonales » du code (impaires) sont les axes du repère MapPoint. Ce sont elles qui servent au déplacement (1 PM par pas), aux croix `X` et au « lancer en ligne ».

### 1.3 Distance, adjacence, alignements

- `distance(a,b) = |dx| + |dy|` (`MapTools.getDistance`). C'est la distance de PO, de PM et de zone.
- `adjacent` : distance ≤ 1, soit 4 voisins. C'est l'adjacence du tacle et de la **mêlée**. La mêlée est évaluée à chaque effet : lanceur ≠ cible et `areCellsAdjacent(case lanceur, case cible)` **au moment de l'effet**.
- `en ligne` : même x ou même y. C'est la condition `castInLine` et la croix `X`.
- `en diagonale` (`isInDiag`) : |dx| = |dy|. C'est la condition `castInDiagonal` et la croix `+`.

### 1.4 Orientations (portage exact, cas limites compris)

```python
def dir4(a, b):            # getLookDirection4 : axe dominant, toujours 1/3/5/7 (égalité -> axe y)
    dx, dy = a.x - b.x, a.y - b.y          # (a - b !)
    if abs(dx) > abs(dy): return 1 if dx < 0 else 5
    return 7 if dy < 0 else 3
def dir4_exact(a, b):      # 1/3/5/7 si alignés, sinon -1 ; même case -> 1
    dx, dy = b.x - a.x, b.y - a.y
    if dy == 0: return 5 if dx < 0 else 1
    if dx == 0: return 3 if dy < 0 else 7
    return -1
def dir4_diag(a, b):       # toujours 0/2/4/6
    dx, dy = b.x - a.x, b.y - a.y
    if (dx >= 0 and dy <= 0) or (dx <= 0 and dy >= 0): return 6 if dx < 0 else 2
    return 4 if dx < 0 else 0
def dir4_diag_exact(a, b): # 0/2/4/6 si |dx| == |dy|, sinon -1
    dx, dy = b.x - a.x, b.y - a.y
    if dx == -dy: return 6 if dx < 0 else 2
    if dx == dy:  return 4 if dx < 0 else 0
    return -1
def dir8_exact(a, b): return dir4_exact(a, b) if dir4_exact(a, b) != -1 else dir4_diag_exact(a, b)
def dir8(a, b):            # dir8_exact, sinon octant approché (voir geometry.look_direction8_by_coord)
```

`dir8_exact(lanceur, cible)` sert à **orienter toutes les zones directionnelles** (L, T, V, F, R, U, B, l). Si le lanceur n'est pas aligné (ni axe ni diagonale exacte), la direction vaut -1. La zone dégénère alors : seule la case ciblée reste. Les sorts à zone directionnelle du Gladiatrool sont justement `castInLine` : Videur T2, Hanedimane F2, Détonation R, Ombre Fracassante F.

---

## 2. Ligne de vue et portée

### 2.1 Tracé de la ligne (`MapTools.getCellsIdBetween`, utilisé par `Dofus2Line.getLine`)

**FAIT vérifié**, confiance haute.

```python
def cells_between(a, b):                 # a exclue, b incluse
    x, y = xy(a); x2, y2 = xy(b)
    dx, dy = x2 - x, y2 - y; n = sqrt(dx*dx + dy*dy)
    ux, uy = dx/n, dy/n
    step_x, step_y = abs(1/ux), abs(1/uy)          # inf si 0
    sx, sy = sign(ux), sign(uy)
    tx, ty = 0.5*step_x, 0.5*step_y
    while (x, y) != (x2, y2):
        if abs(tx - ty) < 1e-4:  tx += step_x; ty += step_y; x += sx; y += sy   # coin exact : pas diagonal
        elif tx < ty:            tx += step_x; x += sx
        else:                    ty += step_y; y += sy
        yield xy_to_cell(x, y)
```

### 2.2 Test de ligne de vue (`LosDetector.getCell`)

**FAIT vérifié**, confiance haute.

```python
def has_los(origin, target):
    if origin == target: return True
    line = cells_between(origin, target)
    for j, c in enumerate(line):
        if j > 0 and entity_blocks(line[j-1]): return False   # entité sur une case INTERMÉDIAIRE
        if not map_cell_los(c): return False                  # drapeau « los » de la carte, cible comprise
    return True
```

- `entity_blocks(c)` = `DataMapProvider.hasEntity(x, y, true)`. Vrai s'il y a sur la case un obstacle qu'on ne peut ni atteindre (`canWalkTo`) ni traverser du regard (`canSeeThrough`), c'est-à-dire un combattant.
- Deux choses ne bloquent **jamais** : le combattant **sur la case cible** et le lanceur.
- Les glyphes et marques ne bloquent pas.
- Hypothèse raisonnable : les invisibles ne bloquent pas, car ils ne sont pas affichés (confiance moyenne).
- Le client trie les candidats par distance décroissante et met en cache les résultats. J'ai prouvé et **testé** (200 configurations aléatoires sur la carte réelle, 0 différence) que ce cache ne change rien : les cases intermédiaires d'une ligne sont toujours strictement plus proches que la cible.
- La LdV obtenue est aussi symétrique (0 asymétrie sur 300 tirages).
- **Arène du Gladiatrool** : aucune case jouable ne bloque la LdV (note 41). **Seuls les combattants bloquent.**

### 2.3 Cases de lancer (`FightSpellCastFrame` + `jerakine.types.zones`)

**FAIT vérifié**, confiance haute.

```python
po_max = spell.range + (stat_PO if spell.rangeCanBeBoosted else 0)   # SpellWrapper.maxRange
po_max = max(po_max, spell.minRange)
if castInLine and castInDiagonal: zone = étoile (8 dirs), r = minRange..po_max pas
elif castInLine:                  zone = croix sur les axes (dirs 1,3,5,7), r = minRange..po_max
elif castInDiagonal:              zone = croix diagonale (dirs 0,2,4,6), r = minRange..po_max PAS diagonaux (distance 2r !)
else:                             zone = losange Manhattan minRange..po_max
cases = zone ∩ (LdV si castTestLos)
      ∩ (case libre si needFreeCell) ∩ (combattant présent si needTakenCell)
      ∩ (entité visible si needVisibleEntity)
```

Limites de lancer (champs du spell-level) :
- `maxCastPerTurn` (0 = illimité), `maxCastPerTarget`, `minCastInterval` (tours de recharge) ;
- `initialCooldown`, `globalCooldown` (partagé entre lanceurs), `maxStack` ;
- `apCost`, `criticalHitProbability`.

Pour le Gladiatrool, DPLN cite par exemple « lançable 2 fois par tour, 1 fois par cible » : ce sont ces champs.

---

## 3. Formes de zone

**FAIT vérifié** (`mapTools.SpellZone`), confiance haute sauf mention.

### 3.1 Paramètres (rawZone client ↔ `zoneDescr` DofusDB)

- **Format client** : `rawZone = lettre + "p0,p1,p2,p3,p4"`.
  - Pour les formes « à rayon minimal » `# + C Q R X l` : rayon = p0, rayon_min = p1, dégression = p2, max_paliers = p3, stopAtTarget = p4.
  - Pour les autres formes : rayon = p0, dégression = p1, max_paliers = p2 (et p3 écrase max_paliers).
  - Pour `l`, p0 et p1 sont **échangés** : p0 = rayon min, p1 = longueur.
  - Valeurs par défaut : rayon 1, min 0, **dégression 10 %, 4 paliers**.
- **DofusDB** (`zoneDescr`) :
  - `shape` = code ASCII de la lettre ;
  - `param1` = p0, `param2` = p1 (rayon min pour `# + C Q R X`, ou longueur pour `l`) ;
  - `damageDecreaseStepPercent` = dégression, `maxDamageDecreaseApplyCount` = max_paliers ;
  - `isStopAtTarget`, `cellIds` (forme `;`).
  - Implémenté dans `SpellZone.from_zone_descr`.

Normalisations appliquées :
- `P` → rayon 0 ;
- `I` → min = rayon, rayon = 63 ;
- `O` → min = rayon ;
- `R` → rayon ≥ 1 et min ≥ 1.

### 3.2 Catalogue des formes

Notations : `t` = case ciblée, `c` = lanceur, `d = dir8_exact(c, t)`, `r` = rayon, `m` = rayon min. Colonne « distance dégressivité » = mesure utilisée pour le malus (§3.3). La colonne « Gladiatrool » donne des exemples tirés des données.

| code | lettre | forme (cellules couvertes) | dépend de `d` | distance dégressivité | Gladiatrool |
|---|---|---|---|---|---|
| 80 | `P` | la case `t` | non | Manhattan | la plupart des sorts |
| 67 | `C` | losange Manhattan m ≤ dist(t,·) ≤ r | non | Manhattan | Impact/Pulsation C2 ; Troollpoline C2 min 1 ; Mortrooll/Mitroollette C3 ; C63 = toute la carte |
| 79 | `O` | anneau dist = r | non | Manhattan | — |
| 73 | `I` | tout sauf le losange de rayon r (dist ≥ r) | non | 0 (aucun malus) | — |
| 88 | `X` | croix sur les axes MapPoint (dirs 1,3,5,7), pas m..r, centre inclus si m = 0 | non | Manhattan | Grondement X1/X3, Troollooportation X1, Soutien X5/X7, **Rassemblement X63 min 1** |
| 81 | `Q` | idem `X` sans le centre | non | Manhattan | — |
| 43 | `+` | croix diagonale (dirs 0,2,4,6), r pas diagonaux, centre inclus | non | Manhattan >> 1 | Soutien Stratégique +5/+7 |
| 35 | `#` | idem `+` sans le centre | non | Manhattan >> 1 | — |
| 42 | `*` | étoile 8 directions, r pas | non | Manhattan | Catastrooll *6 |
| 76 / 47 | `L` / `/` | ligne partant de `t` dans la direction `d`, pas m..r | **oui** | Manhattan / >> 1 | Ligne d'arrivée L1 |
| 108 | `l` | ligne partant du **lanceur** dans la direction `d`, pas m..(r+m−1), coupée à dist(c,t) si stopAtTarget | **oui** | Manhattan | Dague Perforante l1,11 |
| 84 / 45 | `T` / `-` | ligne perpendiculaire à `d` passant par `t` (dirs d±2), pas 1..r + `t` | **oui** | Manhattan / >> 1 | **Videur T2/T3** |
| 86 | `V` | cône : sur k = 0..r pas depuis `t` dans `d`, largeur ±k selon d±2 | **oui** | projection selon `d` | — |
| 70 | `F` | fourche : `t` + 3 dents (latéral −1, 0, +1) sur **r+1** pas dans le sens `d` | **oui** | projection selon `d` | **Hanedimane F2/F3, Ombre Fracassante F2/F3** (DPLN : « fourche de taille 3 » pour F2 ✓) |
| 71 | `G` | carré plein \|dx\| ≤ r, \|dy\| ≤ r (MapPoint) | non | Chebyshev | Jaillissement G1/G2 |
| 87 | `W` | carré sans diagonales ni centre (\|dx\| ≠ \|dy\|) | non | Chebyshev | — |
| 82 | `R` | rectangle : largeur 2r+1 perpendiculaire à `d`, profondeur 1+m dans le sens `d` | **oui** | Chebyshev (m ignoré) | **Détonation R1,1 / R2,1**, Dagues R1,10 |
| 85 | `U` | demi-cercle : `t` + 2 bras dans les dirs d±3 | **oui** | Manhattan >> 1 | — |
| 66 | `B` | boomerang : bras d±2 sur r−1 pas puis un pas en d±3 | **oui** | Manhattan | — |
| 68 | `D` | damier dans le losange de rayon r | non | Manhattan | — |
| 90 | `Z` | hors du cercle euclidien de rayon r | non | Manhattan | — |
| 65 / 97 | `A` / `a` | toute la carte. `A` inclut même les morts ; `a` = vivants, portés compris | non | 0 | glyphes, managers |
| 59 | `;` | liste explicite `cellIds` | non | 0 | **pics : sort 30390, 100 cellules** |

- **Divergences internes du client** (reproduites, testées) : `isCellInZone` et `getCells` ne coïncident pas toujours.
  - Fourche : `fill` utilise `dir8_exact`, `isIn` utilise `dir4`. Elles coïncident quand le lanceur est aligné sur un axe (cas du Gladiatrool).
  - Boomerang et cône en diagonale, ligne `l` avec m ≠ 1, damier (parité absolue contre relative) : divergences constatées.
  - Près des bords de la carte, `V` et `B` s'interrompent.
  - C'est `isCellInZone` qui **choisit les cibles**. `getCells` sert à l'affichage et aux téléportations.
- Exemples (orientation **écran**, `O` = case ciblée 300, `@` = lanceur 271 à 2 pas NO ; `tools/mechanics/zones.py:ascii_render_screen`) :

```
Impact C2 (13 cases)   Grondement X1 (5)      Videur T2 (5)          Hanedimane F2 (10)
 . . . @ # # . . .      . . . @ . . . . .      . . . @ . # . . .      . . . @ . . . . .
. . . . # # . . .      . . . . # # . . .      . . . . . # . . .      . . . . . . . . .
 . . . # O # . . .      . . . . O . . . .      . . . . O . . . .      . . . . O # # # .
. . . . # # . . .      . . . . # # . . .      . . . . # . . . .      . . . . . # . . .
 . . . # # # . . .      . . . . . . . . .      . . . # . . . . .      . . . . # # . . .
                                                                    . . . . . . # . .
Détonation R1,1 (6)    Jaillissement G1 (9)                           . . . . # . . . .
 . . . @ . . . . .      . . . @ # . . . .
. . . . . # . . .      . . . . # # . . .
 . . . . O # . . .      . . . # O # . . .
. . . . # # . . .      . . . . # # . . .
 . . . . # . . . .      . . . . # . . . .
```

(À l'écran, une « croix » `X` de DOFUS apparaît en X : ses bras suivent les diagonales de l'écran.)

### 3.3 Dégressivité (`SpellZone.getAoeMalus` + `DamageCalculator.computeEffect`)

**FAIT vérifié**, confiance haute.

```python
def aoe_malus(zone, t, c, cell):            # en % (0..100)
    if zone.radius > 50: return 0             # zones « infinies » (C63, X63, A…) : jamais de malus
    s = zone.shape
    if s in ';AIa':     dist = 0
    elif s in 'GRW':    dist = max(|dx|, |dy|)               # entre t et cell
    elif s in '#+-/U':  dist = manhattan(t, cell) >> 1
    elif s in 'FV':     dist = projection selon dir8_exact(c,t) :
                          d∈{1,5}: |t.x-cell.x| ; d∈{3,7}: |t.y-cell.y| ; d∈{0,4}: ||t.x-t.y| + |cell.x-cell.y|| ; d∈{2,6}: ||t.x-t.y| - |cell.x-cell.y||
    else:               dist = manhattan(t, cell)
    rmin = 0 if s == 'R' else zone.min_radius
    return int(min(min(max(dist,0) - rmin, zone.max_ticks) * zone.degression, 100))

# dans computeEffect, pour chaque cible touchée :
if effet_de_dégât_ou_soin and action != 80 and action ∉ {90,1047,1048} and action ∉ {1020,1039,1040}:
    if cible pas une « cible additionnelle » (hors zone : lanceur via masque C…) and zone.radius >= 1:
        valeur = int(valeur * (100 - aoe_malus(zone, t, c, position_AVANT_le_sort(cible))) / 100)
```

- Par défaut : −10 % par case d'éloignement, au plus −40 % (4 paliers). DPLN « Les dommages » cite la version simplifiée `×(10 − éloignement)/10` (FAIT rapporté).
- Le malus porte sur la valeur **sortante** (avant résistances) et s'applique **aussi aux soins**.
- Il ne s'applique pas aux boucliers ni aux dommages de poussée.
- Il utilise la position de la cible **avant** le sort : une cible poussée par un effet précédent du même sort garde le malus de sa position initiale.
- Si la zone vaut (0 %, 0 palier), comme pour Coup de Sang C2, Jaillissement G1 ou Ombre Fracassante F2, il n'y a aucun malus.

### 3.4 Choix des cibles, masques, ordre

**FAIT vérifié** (`TargetManagement`, `SpellManager`, `FightContext`), confiance haute sauf mention.

1. **Calcul préalable** : au lancement, le client calcule **d'abord** la liste de cibles de **chaque** effet du sort (`TargetManagement.getTargets`), puis exécute les effets dans l'ordre. Conséquence : une cible poussée hors de la zone par l'effet 1 reste ciblée par l'effet 2 (dégâts), car le test de zone se fait sur la position **avant** le sort (`getBeforeLastSpellPosition`).
2. **Présence dans la zone** :
   - formes `A` : toutes les entités, mortes comprises ;
   - forme `a` : les vivantes, portées comprises ;
   - autres formes : vivantes et non portées.
3. **Masques d'inclusion** (au moins un doit correspondre) :
   - `A` = ennemis ; `a` = alliés, lanceur compris ; `g` = alliés hors lanceur ; `c`/`C` = lanceur ;
   - `H`/`h` = joueur non invoqué ennemi/allié ; `L`/`l` = joueur ou compagnon ; `M`/`m` = monstre non invoqué non statique ;
   - `J`/`j` = invocations (hors compagnon) ; `I`/`i` = invocations non statiques ; `S`/`s` = invocations statiques ; `D`/`d` = compagnons.
   - Le lanceur n'est inclus que via `a`, `c` ou `C`.
   - `C` et l'effet 4 ajoutent le lanceur même hors zone : c'est une « cible additionnelle », sans dégressivité.
   - `O` ajoute le combattant déclencheur, `K` le porté.
4. **Masques d'exclusion** (tous doivent passer ; préfixe `*` = testé sur le **lanceur**) :
   - `E#`/`e#` : possède / ne possède pas l'état # ;
   - `F#`/`f#` : est / n'est pas le monstre # ; `B#`/`b#` : classe de joueur ; `Z#`/`z#` : compagnon ;
   - `V#` : PV ≤ #% ; `v#` : PV > #% ;
   - `P`/`p` : soi-même ou ses invocations (ou non) ; `Q`/`q` : quota d'invocations atteint (ou non) ;
   - `T` : téléfragué ce tour ; `W` : téléporté sur une case invalide ce tour ; `U` : en train d'apparaître ; `O`/`o` : est le déclencheur ;
   - pour une même lettre `B`, `F` ou `Z`, les masques se combinent en **OU**.
5. **Masques DOFUS 3 absents du code 2.73** : `Atq`, `Def`, `Sce`.
   - Le client 2.73 ignore un masque inconnu.
   - **HYPOTHÈSE (confiance moyenne)** : `Atq` = camp attaquant (les joueurs, équipe 0), `Def` = camp défenseur (les monstres).
     - Indice 1 : 30390 niv. 2 donne l'état 5902 « ennemiHasTriggeredCombatGlyph » à `Def`, et 5903 « allyHasTriggeredCombatGlyph » à `Atq`.
     - Indice 2 : les objectifs « Sauvez-le ! » visent `Atq,A,V10…`.
   - `Sce` : probablement l'entité « scénario / manager » (confiance basse).
6. **Ordre de traitement des cibles** (`TargetManagement.comparePositions`) :
   - effets de **poussée** : de la plus **éloignée** à la plus proche de la case ciblée ;
   - autres effets : de la plus proche à la plus éloignée ;
   - en cas d'égalité : ordre de direction 8, puis id de cellule.

   Ainsi, dans une zone, on pousse d'abord la cible du fond, ce qui évite des collisions entre cibles.

### 3.5 Déclencheurs (`triggers`) des buffs

**FAIT vérifié** (`HaxeBuff.shouldBeTriggeredOn*`), sauf les lignes marquées HYPOTHÈSE.

| token | déclenché quand le PORTEUR… |
|---|---|
| `I` | immédiat : l'effet s'applique à la pose (aucun déclenchement) |
| `D` | subit des dommages, **hors dommages de poussée** |
| `DN` `DE` `DF` `DW` `DA` | subit des dommages Neutre / Terre / Feu / Eau / Air |
| `DG` `DT` | subit des dommages d'un glyphe / d'un piège |
| `DI` | subit des dommages d'une invocation |
| `DBA` / `DBE` | subit des dommages d'un allié / d'un ennemi |
| `DCCBA` / `DCCBE` | … par coup critique |
| `DM` / `DR` | subit des dommages de mêlée / à distance |
| `DCAC` / `DS` | subit des dommages d'arme / de sort (DS : pas depuis un effet déclenché) |
| `PD` `PPD` | subit des **dommages de poussée**, que ce soit la cible poussée ou une entité percutée |
| `PMD` | subit des dommages de poussée **en tant que cible poussée** (index 0) |
| `P` / `MA` | est poussé / est attiré |
| `M`, `MS` | se déplace / est échangé |
| `PT` | passe par un portail |
| `X` | meurt |
| `K`, `KWW`, `KWS` | tue (côté lanceur) ; KWW et KWS = tue avec une arme / avec un sort |
| `H` | est soigné |
| `LPU` | gagne des PV |
| `APA` / `MPA` | se fait voler PA / PM |
| `R` | perd de la PO |
| `DIS` | est désenvoûté |
| `EON#` / `EOFF#` | **gagne** / **perd** l'état # |
| `VA` / `VM` / `VE` / `V` | ses PV / PV max / PV érodés / PV changent |
| `ION`/`IOFF`, `CION`/`CIOFF` | devient visible/invisible (porteur / lanceur) |
| `CC` | le lanceur fait un coup critique |
| `CD…` (`CDN`, `CDBA`, `CDM`, `CDS`…) | le **lanceur** du buff inflige des dommages (mêmes filtres que ci-dessus) |
| `CH` | le lanceur soigne |
| `CS` | le lanceur pose un bouclier |
| `CAPA`/`CMPA` | le lanceur tente un vol de PA / PM |
| `PO` | le lanceur se déplace |
| `TB` / `TE` | début / fin du tour du porteur (géré côté serveur ; absent de l'aperçu client). FAIT rapporté, confiance haute |
| `XD`, `XPD` | HYPOTHÈSE : mort par dommages / **mort par dommages de poussée** (objectifs « achever par poussée ») |
| `CAP`, `TR#` | HYPOTHÈSE : `CAP` ≈ « caster » (fin de sort ?) ; `TR#` ≈ déclenché par le sort # |

Un buff déclenché exécute ses effets avec pour **lanceur le poseur du buff** et pour **cible le porteur**.
- Pour un effet `792` (« la cible lance le sort »), c'est le **porteur** qui lance le sous-sort sur sa case.
- Anti-boucle : un buff ne peut pas être redéclenché par un effet qu'il a lui-même produit (`isTriggeredByParent`), sauf si le sort a `canAlwaysTriggerSpells`.

---

## 4. Dégâts, soins, boucliers

**FAIT vérifié** (client 2.73 : `DamageSender`, `DamageReceiver`, `HaxeFighter`), confiance haute sauf mention.

### 4.1 Jet et coup critique

- **Bornes** d'un effet (`SpellEffectTranslator`) : `min = diceNum` (ou `value` si diceNum = diceSide = 0) ; `max = diceSide` si ≠ 0, sinon `min`. Le serveur tire un entier uniforme dans [min, max]. L'aperçu client tire `floor(min + rand×(max−min) + 0,5)`, qui sous-pondère les bornes : c'est HYPOTHÈSE que le serveur soit uniforme (confiance moyenne).
- **Taux critique** (`SpellWrapper.criticalHitProbability`) :

  ```
  0 si criticalHitProbability(sort) = 0
  sinon min(100, max(0, taux_sort (+ modificateurs de sort) + stat Critique[18]))
  ```

  - Il n'y a plus de formule d'Agilité en DOFUS 2.5x+.
  - Archétypes du Gladiatrool : sorts à 30 % + 10 % de base = **40 %**. Chaque bonus « 20 % Critique » (Dompteur) s'ajoute.
- **Critique** :
  - on tire une fois par lancer ;
  - on exécute la liste **`criticalEffect`** du spell-level à la place de `effects` : ce ne sont pas les mêmes jets (ex. Impact 68-74 → 82-89) ;
  - les sous-sorts lancés par 1160, 792, 2160, 2792, 2794, 2960, 401, 1091, 1165… **héritent** du critique (`isCriticalFlagInherited`) ;
  - les **Dommages critiques** [86] s'ajoutent (et la Résistance critique [87] se retranche) seulement pour les effets de la liste critique.

### 4.2 Côté lanceur (`DamageSender.getTotalDamage`)

```python
elem = element(action)                       # table ElementEnum (damage.py) ; 6 = meilleur élément
d = jet
if action in {85..90, 671}:  d = int(d * PV_courants_lanceur * 0.01)        # % PV du lanceur (Coup de Sang 89)
if action in {275..279}:     d = int(d * PV_manquants_lanceur * 0.01)
if action in {1118..1122}:   d = int(d * PV_érodés_lanceur / 100)            # Jaillissement 1118
if boostable(action):        # tout SAUF 80, 82, 144, 1063-1066, effets « % PV lanceur/cible », splash (1123/1223…)
    d += bonus_dégâts_de_base(sort)                    # effets 293 « #1 : +#3 dégâts de base »
    pct = (0 si soin sinon Puissance[25]) + carac(elem) + ([103] si arme sinon [98]) \
          + ([69] piège) + ([106] glyphe) + ([110] rune)
    d = int(d * (100 + max(0, pct)) * 0.01)
    if soin: d += Soins[49] (+ [70] piège)
    else:    d += Dommages[16] + Dommages_élément[92/88/89/90/91] + (Dommages_critiques[86] si effet critique) (+ [70])
    d += modificateurs fixes du sort
    if arme: d = int(d * (100 + [31]) * 0.01)
    d = int(d * (1 + combo_bombe[94]/100))
```

- **Caractéristique par élément** :
  - Neutre et Terre → **Force** [10] ; Feu → Intelligence [15] ; Eau → Chance [13] ; Air → Agilité [14].
  - Les **soins Neutre (3001) sont boostés par la Force** (soins Feu 108 : Intelligence).
  - La **Puissance ne s'applique pas aux soins**.
- **Gladiatrool** : archétype Force 6000 → multiplicateur **×61**. Tous les sorts des archétypes sont neutres (DPLN).
- Voir la table de contrôle au §4.7 ; le point Dompteur +3000 Puissance y est discuté.

### 4.3 Côté cible (`DamageReceiver.receiveDamage` → `applyDamage` → `applyDealtMultiplier`)

```python
# 0) dégressivité de zone déjà appliquée (§3.3) ; esquive (resolveDodge) : sans objet ici
if not collision:
    d -= rés_fixe(elem)[58,54,55,56,57] + (rés_critique[87] si effet critique)
    d -= réduction_armure   # buffs 265 : jet × (niveau_porteur/20 + 1)
    # renvoi de dommages calculé ici (stat 50 + buffs 107/220), plafonné
    d = int(d * (1 - rés_pct(elem)/100))       # rés% = round(min(rés_élém + rés_toutes[101], 50 si JOUEUR sinon 100))
    d = max(0, d)
    # partage de dommages / sacrifice (765) : redirigent la valeur
if invulnérable(cible):                        # état à effet 7, ou 19-28/31 selon mêlée/distance/élément/crit/arme/invoc,
    d = 0                                      # ou 26 pour les dommages de poussée
d = max(0, d)
if boostable(action) and not collision:
    d = int(d * [123 sorts | 122 arme]_lanceur / 100)      # « dommages aux sorts/armes » (base 100)
    d = int(d * [125 mêlée | 120 distance]_lanceur / 100)
    d = int(d * [141 sorts | 142 arme]_cible / 100)
    d = int(d * [124 mêlée | 121 distance]_cible / 100)    # = 100 - Résistance mêlée/distance % (effets 2803/2807)
    d = int(d * dommages_finaux[107]_lanceur / 100)        # 100 + Σ(1171) - Σ(1172)
m = 100
for buff in buffs_1163(cible):                             # « Dommages subis x#1% »
    if buff.déclencheur correspond (I, ou D hors collision, ou PD/PMD/PPD si collision, ou DN/DBA/DM…):
        m = int(m * buff.pourcentage * 0.01)
d = int(d * m / 100)
bouclier = min(d, bouclier_cible[96]) ; pv_perdus = d - bouclier
érosion = floor(min(pv_perdus * clamp(érosion[75], 0, 50)/100, PV_courants - 1))   # PV max perdus
if action ∈ vol_de_vie (82, 91-95, 2828, 2890) and lanceur != cible:
    soin_lanceur = min(int(pv_perdus * 0.5) [× soins finaux 143/100], PV_manquants_lanceur)
```

- **Mêlée** = lanceur adjacent (distance 1) à la cible **au moment de l'effet**, c'est-à-dire après les poussées précédentes du même sort.
- **Ordre** : fixes → % → multiplicateurs de dommages infligés → multiplicateurs 1163 → bouclier. Les multiplicateurs se **multiplient** entre eux (DPLN « Dégâts finaux » : FAIT rapporté concordant).
- **Arrondi** : troncature après chaque multiplication, en double précision.
- **Plafond de résistance** : 50 % pour un joueur (HUMAN), 100 % pour un monstre. Les Troolls ont 0 % partout (DofusDB `/monsters`). Si les archétypes restent de type « joueur » (probable), le bonus Acrobate « 10 % résistances » (effet 1076) est plafonné à 50 %.
- **Érosion** : 10 % de base (stat 75, FAIT rapporté, confiance haute) ; les effets 776 l'augmentent ; la formule la plafonne à 50 %. Coups érodants du Gladiatrool : Prélèvement, Aspiratrooll 10 %, Vague de Dégradation. Ils nourrissent Jaillissement (1118 : % des PV érodés du lanceur) et Ombre Fracassante (1092 : % des PV érodés de la cible).
- **Vol de vie** : 50 % des PV réellement retirés (après bouclier), plafonné aux PV manquants du lanceur.
- **Mort** : une entité meurt si ses PV tombent à ≤ 0. L'effet 2872 « Seuil : #1 PV » (Immortalité…) empêche de descendre sous le seuil.

### 4.4 Soins, boucliers

- **Soins** (actions 81, 108, 143, 407, 786, 1037, 1109, 2020, 2973, 2998-3002) :
  - pipeline « lanceur » du §4.2 ;
  - puis **× soins finaux [143] / 100** du lanceur (effet 2971 « % Soins finaux »), sauf pour 90, 407, 1109, 2020 et 2973 ;
  - plafonné aux **PV manquants** ; 0 si la cible est **incurable** (état à effet 5) ;
  - la dégressivité de zone s'applique.
  - 1109 = % des PV max de la cible (non boosté). 2020 = % des dommages subis.
  - Le serveur applique aussi un modificateur « soins reçus » (stat 105), non utilisé ici.
- **Boucliers** : 1040 = valeur fixe ; 1039 = % des **PV max du lanceur** ; 1020 = % du niveau.
  - Un bouclier absorbe avant les PV.
  - Il n'est ni boosté ni dégressif.
  - Il dure `duration` tours du lanceur (Protection Prolongée 3000 → 5000 ; Muraille collective 15000).

### 4.5 Modélisation de « Vulnérable » dans les pics (application au Gladiatrool)

**FAIT vérifié (données)** : spell-levels 80492 et 81026, sorts 30700 et 30701.

| Moment | Effets (sort 30390 / 30701) | Pour le simulateur |
|---|---|---|
| Entrée dans l'aura (glyphe-aura 1091 → 30390 niv.2, déclencheur `I`) | Deux camps : état 5994 « Vulnérable » (durée -1, tant qu'on est dans l'aura) et **2000 dégâts neutres**. `Def` : état 5902 + **1163 x200 % déclencheur D (durée -1)**. `Atq` : état 5903 (pas de 1163). | Monstre : −2000, puis ×2 sur tous les dégâts hors poussée tant qu'il est dans les pics. Joueur : −2000, état affiché, mais ×1 **selon les données** (HYPOTHÈSE sur `Atq`/`Def`, à vérifier en vidéo). |
| Début de tour dans le glyphe (glyphe 401 → 30390 niv.3) | **1000** dégâts neutres (`Atq` et `Def`) | Monstre (x200 % actif) : **2000**, ce que confirme DPLN. Joueur : 1000 selon les données, **2000 selon DPLN** : à trancher. |
| Sortie de l'aura (perte de l'état 5902/5903, passif 30700 → 30701, déclencheur `EOFF`) | Sur soi : état Vulnérable **durée 1** + **1163 x200 % D durée 1** | Les deux camps : ×2 jusqu'au **début du prochain tour du porteur**. Le « lanceur » du buff est le porteur, via son passif, donc le décompte se fait au début de son propre tour (HYPOTHÈSE, confiance moyenne). |

Points de modélisation :
- **Facteur** : 1163 = `CharacterMultiplyReceivedDamage`, et le code fait `m = int(m × 200 × 0,01) = 200`, soit **×2**. DPLN écrit « 200 % de dégâts supplémentaires », mais ses propres chiffres (1000 → 2000 au début du tour) confirment ×2 (un ×3 donnerait 3000). **Confiance haute.**
- **Poussée** : les dommages de poussée (collision) ne sont **pas** doublés (déclencheur `D` ≠ `PD`).
- **Cumul** : les 1163 se multiplient. Exemple : Soutien Stratégique (Acrobate, 1163 **x50 %** déclencheur `DBA`, sur soi) divise par 2 les dommages reçus des alliés. Un joueur dans les pics, sous Soutien Stratégique et frappé par un allié, prend :
  - ×0,5 si, comme dans les données, seul le x50 % s'applique ;
  - ×1 si le x200 % des pics s'applique aussi aux joueurs (200 % × 50 %).

  Autres multiplicateurs de dégâts du Gladiatrool (effet 1171, dommages finaux) :
  - Amplification sur un Dompteur : +20 %, +40 % une fois améliorée ; elle donne aussi +30 %/+50 % de critique ;
  - acclamations : +10 % ;
  - Mama Troollette (30724, permanent) : +25 %.
- **Dégâts des pics** : le glyphe n'est pas lancé par un archétype. Les 2000 / 1000 ne sont boostés que par les caracs du **poseur du glyphe**. Les valeurs observées (2000 exacts) impliquent un poseur sans Force ni Puissance, par exemple le « Stratège Dompteur » 7985/7986 (Force 0) ou un manager (HYPOTHÈSE, confiance moyenne). Les résistances neutres de la victime s'appliquent (0 pour les Troolls).
- **Ordre au sein d'un sort** : « pousser dans les pics puis frapper », par exemple Frappe Repoussoir (effets : 5 puis 100). Si le serveur applique l'aura dès l'arrivée de la poussée (HYPOTHÈSE forte, cohérente avec DPLN), les dégâts qui suivent sont **déjà ×2** :
  - Frappe Repoussoir sur Trooll entrant dans les pics : 2000 (pics) + 1952-2440 (au lieu de 976-1220) ;
  - Videur : 2000 + 7198-7686.

### 4.6 Exemples calculés (moteur `damage.py`)

| Situation | Normal | Critique | Sur Vulnérable (×2) |
|---|---|---|---|
| Frappe Repoussoir (16-20 / crit 21-25), archétype | 976–1220 | 1281–1525 | 1952–2440 / 2562–3050 |
| Impact (C2) centre / à 1 case / à 2 cases | 4148–4514 / 3733–4062 / 3318–3611 | 5002–5429 (centre) | 8296–9028 / 7466–8124 / 6636–7222 |
| Coup de Sang (89 : 20 % des PV courants du lanceur, non boosté), 30000 PV | 6000 | — | 12000 |
| Poussée contre le bord, archétype (niv. 200, 1000 DoPou) | 283 × cases restantes | — | **non doublé** |
| Poussée contre le bord, Trooll (niv. 200, 0 DoPou) | int(n × 132/4) = 33 × n | — | non doublé |

### 4.7 Contrôle croisé avec les chiffres du guide (`damage_table.py`)

**Résultat** : le multiplicateur « Force » est cohérent avec toutes les valeurs DPLN. DPLN arrondit (souvent vers le max ou le critique). Confiance haute.

| sort (lanceur, Force) | jet normal → dégâts | jet critique → dégâts | DPLN |
|---|---|---|---|
| Frappe Repoussoir (archétype 6000) | 16-20 → 976–1220 | 21-25 → 1281–1525 | « 1 200 » |
| Videur (archétype) | 59-63 → 3599–3843 | 72-77 → 4392–4697 | « environ 4 000 » |
| Impact (archétype) | 68-74 → 4148–4514 | 82-89 → 5002–5429 | « environ 4 500 » |
| Grondement Grandissant (archétype) | 82-92 → 5002–5612 | 98-110 → 5978–6710 | « environ 6 200 » |
| Pulsation d'Énergie, soin 3001 (archétype) | 44-48 → 2684–2928 | 53-58 → 3233–3538 | « environ 3 000 » |
| Tir d'Artroolleurie (Artroolleur 3000) | 56-65 → 1736–2015 | 67-77 → 2077–2387 | « 2 000 » |
| Mortrooll (Artroolleur) | 81-95 → 2511–2945 | 101-117 → 3131–3627 | « 3 000 » |
| Double Trooll (Nitrooll 3500), ×2 coups | 32-38 → 1152–1368 | 42 → 1512 | « 3 000 ×2 » (DPLN surestime ; ≈ 2 × 1368 = 2736 au total) |
| Trooll de Magie, soin (Nitrooll) | 56-65 → 2016–2340 | 67-77 → 2412–2772 | « 2 000 » |
| Aspiratrooll, vol de vie (Troollibre 4000) | 65-75 → 2665–3075 | 78-90 → 3198–3690 | « 3 500 » |
| Troollpoline (Troollibre) | 100-116 → 4100–4756 | 120-139 → 4920–5699 | « 6 000 » (surestimé) |
| Uppertrooll, vol de vie (Mama 4500) | 46-54 → 2116–2484 | 56-65 → 2576–2990 | « 3 000 » |
| Troollooportation (Mama) | 60-70 → 2760–3220 | 72-84 → 3312–3864 | « 3 500 » |
| Mitroollette de Poings (Mama) | 93-108 → 4278–4968 | 111-129 → 5106–5934 | « 4 500 » |

Deux remarques sur ce tableau :
- **Dompteur +3000 Puissance** : le passif 30639 « Gladiatrooller » (spell-level 80897) donne +3000 Puissance au porteur de l'état 5899. Avec ce bonus, Impact vaudrait 6188–6734 (×91), ce qui ne colle pas avec l'« environ 4 500 » de DPLN. Deux lectures possibles : le passif n'est pas actif lors de la mesure DPLN, ou il est lancé avant le choix d'archétype (masque `*E5899` évalué trop tôt). **Question ouverte** (agent sorts / vidéos).
- **Artroolleur** : DofusDB donne Force 3000. Le multiplicateur réel est donc ×31 (1 + 3000/100).

---

## 5. Poussée, attirance, téléportation, échange

**FAIT vérifié** (`PushUtils`, `Teleport`, `HaxeFighter`), confiance haute sauf mention.

### 5.1 Direction

```python
def push_direction(caster_cell_before_spell, targeted_cell, target_cell_before_spell, allow_same=True):
    if target == targeted and (target == caster or not allow_same): return -1        # pas de poussée
    origin = caster if targeted == target else targeted       # centre de zone si la cible n'est pas sur la case ciblée
    if |dx(origin,target)| == |dy(origin,target)|:            # même diagonale MapPoint
        return dir4_diag_exact(origin, target)                # direction CARDINALE (0/2/4/6 : horizontale/verticale écran)
    return dir4(origin, target)                               # axe dominant (1/3/5/7)
pull_direction = opposite(push_direction(caster_cell_COURANTE, ...))
```

- Les positions sont celles **d'avant le sort**. Une deuxième poussée du même sort garde donc la même direction.
- Exemple Videur T2 (lancé en ligne) :
  - la cible sur la case ciblée est poussée **dans l'axe lanceur → cible** ;
  - les cibles latérales du T sont poussées **latéralement**, depuis le centre du T ;
  - puis le sous-sort 1160 → 30689 (poussée 3, ou 4 une fois amélioré) est lancé sur la case de chaque cible touchée : la cible étant alors sur la case ciblée, il repousse **depuis le lanceur**.

### 5.2 Glissement (`drag` / `getDragCellDest`)

```python
if not forcée and (Enraciné[effet d'état 3] or Inébranlable[0] or not monstre.canBePushed): rien
if cardinal(dir): force = ceil(force / 2)                 # un pas diagonal = 2 de distance
cur = cell
for i in range(force):
    nxt = next_cell(cur, dir)
    bloqué = not libre(nxt) or (cardinal(dir) and not (libre(next(cur,dir+1)) and libre(next(cur,dir-1))))
    if bloqué: return cur, reste = force - i, COLLISION   # libre = marchable en combat, sans combattant/invocation
    cur = nxt
    if piège/mur sur nxt:  return nxt, reste = force - i - 1, ACTIVE_OBJECT (pas de dommages de collision)
    if portail sur nxt:    téléporte en sortie et continue avec le reste
return cur, 0, COMPLETE
```

- **Glyphes et auras** (les pics : marques de type GLYPH 1 / AURA 6) **n'arrêtent pas** une poussée (`Mark.stopDrag` : seuls TRAP 2 et WALL 3).
- La cible **traverse** les pics et s'arrête contre le bord ou un obstacle. L'anneau de pics fait 2 cases d'épaisseur tout autour : une poussée vers le bord finit **toujours dans les pics**, ce qui a été testé (Trooll poussé depuis le centre jusqu'au bord : case 416, dans les pics).
- HYPOTHÈSE (confiance moyenne) : l'aura ne s'applique que sur la **case d'arrivée**. Le mouvement est instantané, et le client ne prévisualise les marques que sur la case finale (`executeMarks(cell finale)`).
- Distances libres depuis le centre 300, calculées sur la carte réelle (`movement.push_to_edge_distance`) :
  - diagonales écran (E, S, W, N) : **6 pas diagonaux**, dont le 5e entre dans les pics ;
  - axes MapPoint (SE, SW, NW, NE) : **8 pas**, dont le 7e entre dans les pics.

### 5.3 Dommages de collision (`PushUtils.getCollisionDamage`)

```python
reste_eff = reste * (2 if cardinal(dir) else 1)          # on « rend » la force divisée
niv = niveau(lanceur) (niveau de l'invocateur si invocation ; bombes/tourelles : l'invocateur)
dmg(i) = max(0, int(reste_eff * (floor(niv/2) + 32 + DoPou[84]_lanceur - RéPou[85]_victime) / (4 * 2**i)))
# i = 0 : la cible poussée ; puis chaque combattant aligné derrière l'obstacle dans la direction de poussée,
#         au plus reste_eff combattants, i = 1, 2, … (chaque maillon divise par 2)
# 0 si le lanceur est « pacifiste » (état à effet 6) ; 0 sur une victime invulnérable aux poussées (effet 26) ou invulnérable (7)
```

- Ces dommages passent par `receiveDamage` avec le drapeau « collision ». Il n'y a donc **ni résistances élémentaires, ni multiplicateurs de dommages infligés, ni dégressivité**.
- Seuls les 1163 déclenchés par `PD`, `PMD` ou `PPD` s'appliquent. Les buffs `P` (« est poussé ») et `PD` peuvent déclencher des sorts : c'est le cas de Chamboulement (30677, `PD`/`XPD`) et Faire le mur.
- Ne font **aucun dommage de collision** :
  - 6 et 1022 (attirances) ;
  - 1103 (« Repousse sans dommages » : Rassemblement Troollesque, 63 cases = jusqu'au bord) ;
  - 1021 (poussée forcée : `allowCollisionDamage` = 5 et 1041 seulement).
- FAIT rapporté concordant : forum officiel « Valeur des dopous » (`(niv/2 + DoPou − RéPou + 32) × distance/4`, et `/8` pour l'entité percutée).
- Chiffres du Gladiatrool :
  - archétype niv. 200, 1000 DoPou (DPLN) : `(100 + 32 + 1000)/4` = **283 / case** ; 566 pour 2 cases ; chaînes 283 → 141 → 70 ;
  - HYPOTHÈSE : un joueur de niveau 50 aurait (25 + 32 + 1000)/4 = 264,25 / case, si le niveau réel du personnage est utilisé ;
  - bonus Acrobate « 200 Dommages de poussée » (acclamation, effet 414 = 200) : +50 / case par palier ;
  - Amplification (Magicien sur un allié Acrobate, masque `E5900`) : +500 DoPou (+1000 une fois améliorée, 30578) pendant 3 tours, soit +125 (+250) / case ;
  - Dégagez ! (30604) : +1000 DoPou pendant 3 tours ;
  - Troolls (niv. 200, 0 DoPou) : 33 / case. Mama Troollette (niv. **1000**) : 133 / case, mais son Rassemblement utilise 1103, donc sans dommages.

### 5.4 Attirance, avance, recul

- **6** : attire la cible de n cases vers le lanceur, sans dommages. **1042** « Avance de #1 case » : c'est le **lanceur** qui est attiré vers la cible. Exemples : Va-t-en-guerre, et Immortalité du Courageux avec n = 63.
- **1041** : le lanceur est repoussé (inverse de 5).
- **783 / 1043** (« pousser/attirer jusqu'à ») : force = distance(case ciblée, cible).

### 5.5 Téléportation, échange

- **4** « Téléporte sur la case ciblée » : le **lanceur** va sur la case ciblée si elle est libre et marchable. Si la zone n'est pas `P`, il va sur la première case libre de la zone (liste `getCells`). Sinon, rien ne se passe.
- **8** « Échange de positions » (et 1023 téléfrag) :
  - impossible si l'un des deux est **Enraciné** (effet d'état 3), sous un état « pas d'échange » (effet 18, ex. état 7 « Pesanteur »), ou porté ;
  - un monstre `canSwitchPos = false` ne peut pas être échangé. Tous les Troolls sont `true` (DofusDB).
- **1099** : retour à la position de début de tour. **1100** : retour à la position précédente. **1104 / 1105 / 1106** : symétrie par rapport au lanceur ou au point d'impact.
- Après toute téléportation ou tout échange, les marques de la case d'arrivée se déclenchent : pièges côté client, glyphes et auras côté serveur.

### 5.6 États utiles (effets d'état DOFUS 2.6x/3 : `spell-states[].effectsIds`)

**FAIT vérifié** : corrélation drapeaux ↔ `effectsIds` (DofusDB) et `HaxeFighter.hasStateEffect(n)`.

| effet d'état | sens | code |
|---|---|---|
| 0 | Inébranlable : pas de poussée ni d'attirance (sauf forcées 1021/1022) | `canBePushed` |
| 1 / 2 | intaclable / ne tacle pas | TackleUtil |
| 3 | **Enraciné** : ni poussée, ni téléportation, ni échange | `canBeMoved`, `canTeleport` |
| 4 | ne peut pas être porté | |
| 5 | incurable (aucun soin) | `executeLifePointsWin` |
| 6 | pacifiste : n'inflige pas de dommages, collisions comprises | `isPacifist` |
| 7 | **invulnérable** : 0 dommage | `isInvulnerableTo` |
| 16 | état technique silencieux (79 états) | |
| 17 | n'utilise pas les portails | |
| 18 | pas d'échange / téléport symétrique | |
| 19 / 20 | invulnérable mêlée / distance | |
| 21-25 | invulnérable Feu / Air / Eau / Terre / Neutre | |
| 26 | insensible aux dommages de poussée | |
| 27 / 28 / 31 | invulnérable aux critiques / aux armes / aux invocations | |

« Mama Troollette possède l'état invulnérable » (DPLN) : il faut vérifier quel état exact ses sorts appliquent (autre agent). Le moteur doit renvoyer 0 dommage tant que l'état porte l'effet 7.

---

## 6. Déplacement et tacle

### 6.1 Pathfinding

**FAIT vérifié** (`FightTurnFrame` : `Pathfinding.findPath(..., allowDiag=false, bAllowTroughEntity=false)`), confiance haute.

```
pas autorisés = 4 voisins MapPoint (directions 1,3,5,7) ; 1 PM par pas ;
cases interdites = non marchables en combat (mov && !nonWalkableDuringFight) et cases occupées par un combattant
chemin = plus court chemin (A* ; poids légèrement différents selon la « vitesse » de case, sans effet sur la longueur)
```

- Les glyphes ne bloquent ni ne ralentissent le déplacement. Les **pièges** stoppent le déplacement (règle générale DOFUS, FAIT rapporté ; il n'y a pas de pièges dans le Gladiatrool).
- Marcher dans les pics : l'aura s'applique en y entrant, avec 2000 dégâts et l'état Vulnérable. HYPOTHÈSE : le déplacement continue ; seul le passage compte (confiance moyenne, à vérifier en vidéo).

### 6.2 Tacle / fuite

**FAIT vérifié** (`TackleUtil`, `FightTurnFrame`) + FAIT rapporté DPLN « Tacle et fuite », confiance haute.

```python
def ratio(fighter, cell):                     # 1.0 = aucun tacle
    if intaclable (effet d'état 1) or enraciné or invisible or porté: return 1
    r = 1
    for ennemi in voisins_4(cell):             # vivants, pouvant tacler (monstre.canTackle, pas « ne tacle pas »)
        mod = (max(0, Fuite[78]) + 2) / (max(0, Tacle[79]_ennemi) + 2) / 2
        if mod < 1: r *= mod
    return r
# à chaque case QUITTÉE (y compris la case de départ) :
PM_perdus += int((PM - PM_déjà_utilisés) * (1 - r) + 0.5) ;  PA_perdus += int(PA * (1 - r) + 0.5)
# si les PM restants tombent à 0 : on ne peut plus bouger (tacle total)
```

- Fuite totale si `Fuite ≥ 2 × Tacle + 2` ; tacle total si `Tacle ≥ (Fuite+2) × PM − 2` (DPLN).
- DPLN arrondit les points **restants** au plus proche. Le client arrondit les points **perdus** (`int(x+0,5)`). Les deux diffèrent sur les demi-entiers : avec 5 PM à 50 %, DPLN donne −2 et le client −3. **Arrondi serveur incertain** : je retiens la formule client.
- Tacle et Fuite valent Agilité/10 + bonus (DPLN). Les Troolls ont 0 (grades DofusDB) et les archétypes probablement 0 (aucune Agilité annoncée : HYPOTHÈSE). Donc **ratio 0,5 par Trooll adjacent** : quitter le contact d'un Trooll coûte la moitié des PM et des PA restants, et ¾ pour deux Troolls. Une téléportation, un échange ou une poussée **n'est pas taclé**.

### 6.3 Retrait de PA / PM esquivable

FAIT rapporté (forums), confiance moyenne.

- Les effets 101, 127, 1079 et 1080 sont esquivables. Pour **chaque point** : `p = clamp(0,5 × (Retrait_lanceur[82|83] / Esquive_cible[27|28]) × (PA_ou_PM_courants / de_base), 10 %, 90 %)`.
- 168 et 169 ne sont pas esquivables. Exemple : Vents Contraires −2 PM (169).
- La Mama a 20 d'esquive PA et 20 d'esquive PM (DofusDB).

---

## 7. Tours, initiative, durées, glyphes, invocations

### 7.1 Ordre de jeu

- **Règle générale DOFUS** (FAIT rapporté, confiance moyenne) :
  - la timeline alterne les équipes ;
  - dans chaque équipe, les combattants sont triés par Initiative décroissante, et l'équipe du meilleur initiateur commence ;
  - Initiative = (Force + Intelligence + Chance + Agilité + bonus Initiative) × PV courants / PV max ;
  - une invocation joue juste après son invocateur.
- **Gladiatrool** (DPLN, FAIT rapporté) :
  - tous les archétypes ont la même initiative : l'ordre des joueurs est **l'inverse de l'ordre du groupe** ;
  - la Mama Troollette est dans la timeline dès le début et « aura toujours l'initiative ».
  - L'ordre exact (alternance joueurs / Troolls, place des vagues) est à relever en vidéo.
- Le client ne calcule pas l'ordre : il reçoit la liste `fightersList` du serveur (`GameFightTurnListMessage`). Durée de tour : effet 3407 = 60 s.

### 7.2 Début et fin de tour

FAIT vérifié côté client (`FightBattleFrame`, `BuffManager`), confiance haute pour le décompte, moyenne pour l'ordre serveur.

Au **début du tour du combattant X**, dans cet ordre (ordre serveur supposé) :
1. décompte : chaque buff dont le **lanceur** est X perd 1 tour de `delay` s'il en a, et 1 tour de durée. Il est retiré à 0. `duration` ≥ 63 ou `-1` : permanent ;
2. remise à zéro des compteurs de déclenchements des buffs de X ;
3. effets `TB` (début de tour) des buffs portés par X ;
4. **glyphes « de début de tour » (401)** contenant la case de X : leur sort est lancé sur X (**pics : 30390 niv. 3**, 1000 dégâts). HYPOTHÈSE : ordre 3/4 non vérifié ;
5. restauration des PA et PM de X.

À la **fin du tour** de X :
- effets `TE` ;
- glyphes « de fin de tour » (402) ;
- les buffs de durée 1 posés sur X par un lanceur qui rejoue avant X sont désactivés visuellement (`markFinishingBuffs`) ;
- remise à zéro des compteurs de lancers par tour.

Conséquence pratique : un buff de durée 1 posé par A sur B dure **jusqu'au début du prochain tour de A**.
- Buff posé par X sur lui-même : c'est le cas des états de sortie des pics (30701, posés via le passif du porteur) ; il dure jusqu'au début de son prochain tour.
- Les sorts lancés **avant le premier tour** (passifs de début de combat) ne sont pas décomptés au premier début de tour (`spellBuffsToIgnore`).

### 7.3 Glyphes et auras (marques)

- **Types** (`GameActionMarkTypeEnum`) : 1 GLYPH, 2 TRAP, 3 WALL, 4 PORTAL, 5 RUNE, 6 AURA, 7 POWDER.
- **Pose** :
  - effets 401 (début de tour), 402 (fin de tour), 1165 (immédiat), 1091 (aura) ;
  - **zone** = celle de l'effet (pics : liste `;` de 100 cellules) ;
  - **sort associé** = (diceNum, grade diceSide) ; **couleur** = value ;
  - **durée** = `duration` tours du poseur (-1 : tout le combat).
- **Déclenchement** :
  - GLYPH 401 : au début du tour de chaque entité dans la zone, le sort est lancé par le poseur, case ciblée = case de l'entité, avec les masques du sort ;
  - AURA 1091 : les effets du sort associé sont appliqués aux entités qui **entrent** dans la zone, qu'elles marchent, soient poussées ou téléportées, et **retirés** quand elles en sortent. Cette sortie déclenche `EOFF` sur les états perdus ;
  - un glyphe ne fait aucun dommage « de poussée ».
- Les dommages d'un glyphe sont boostés par le **poseur**, et les buffs `DG` (« dommages de glyphe ») réagissent.
- FAIT vérifié (données, enum `FightAddGlyphAura`) + FAIT rapporté (DPLN : « entrer dans le glyphe = 2000 + vulnérable ; commencer son tour dedans = 2000 »). Confiance haute pour le principe, moyenne pour l'ordre fin.

### 7.4 Invocations et sous-sorts

- **Sous-sorts** (`DamageCalculator.solveSpellExecution`), avec `S` = lanceur de l'effet (ou déclencheur si effet déclenché) et `T` = cible de l'effet :

| action | lanceur du sous-sort | case ciblée |
|---|---|---|
| 792, 793, 2792, 2793 | T | case de T |
| 1160, 2160 | lanceur original | case de T |
| 1008 | lanceur original | case de T |
| 1017, 2017 | T | case de S |
| 1018 | S | case de T |
| 1019 | S | case de S |
| 2794, 2795 | T | case ciblée du sort parent |
| 2960 | lanceur original | case ciblée (sans cible requise) |

  - Sous-sort = `/spells/diceNum`, grade diceSide.
  - Les variantes « GlobalLimitation » (2017, 2160, 2792, 2793, 2795) s'exécutent **au plus `value` fois** par lancer.
- **Invocations** :
  - 181, 1008 et 1011 invoquent sur une case libre ; le quota d'invocations est donné par la stat 26 ;
  - `useSummonSlot` : les Troolls sont `true` dans DofusDB, mais ils apparaissent **par script serveur** (vagues), pas par un effet d'invocation (cf. INDEX DofusDB).
  - Une invocation joue après son invocateur. Pour la poussée et les dégâts dépendant du niveau, elle utilise le niveau de son invocateur.

---

## 8. `research/data/effects_semantics.json`

Généré par `python3 tools/mechanics/build_effects_semantics.py` : **106 effectId** (tous ceux de `effects.json`), 0 non documenté.

Pour chaque effet :
- `nom_fr`, `nom_en` (DofusDB) ;
- `action_dofus3` : nom de l'enum `ActionIds` du client DOFUS 3 (ex. 1091 `FightAddGlyphAura`, 1163 `CharacterMultiplyReceivedDamage`, 80 `CharacterLifePointsLostFromPush`, 2794 `TargetExecuteSpellOnCell`, 3405 `CharacterLearnTemporarySpell`, 3792 `ExecuteSpellScriptUsage`) ;
- `categorie`, qui prend l'une de ces valeurs :
  - dommage, vol de vie, soin, bouclier ;
  - poussée, attirance, téléportation, échange ;
  - état, boost, debuff, multiplicateur ;
  - glyphe, lancer-sort, invocation, choix, sort temporaire, interface, visuel, tour… ;
- `element`, `boostable` ;
- `parametres` : sens de diceNum, diceSide et value ;
- `semantique` : règle pour le simulateur ;
- `confiance` ;
- nombre d'occurrences (Gladiatrool 30370-30800 / total) ;
- masques, déclencheurs, zones et durées observés ;
- jusqu'à 4 exemples (sort, grade, paramètres).

Effets **purement cosmétiques ou d'interface**, que le simulateur peut ignorer :
- 149, 335, 1060 (apparence) ;
- 3400, 3401 (notifications d'objectif) ;
- 3792, 3793 (scripts visuels) ;
- 666 (noop).

Effets de **déroulement** à gérer par le script du combat :
- 3008, 3404 (choix) ;
- 3405, 3406 (sorts temporaires) ;
- 3407 (durée de tour) ;
- 140, 1031 (tour passé / fini).

---

## 9. Algorithme de résolution d'un sort (pseudo-code consolidé pour le simulateur)

```python
def cast(caster, spell_level, targeted_cell, rng):
    assert pa >= apCost and in range_cells(...) and (not castTestLos or has_los(...)) and limites de lancer OK
    crit = rng.random()*100 < critical_chance(spell.crit, caster.crit)
    effects = level.criticalEffect if crit and level.criticalEffect else level.effects
    snapshot = {f: f.cell for f in fighters}                  # positions AVANT le sort
    targets = {e: select_targets(e.zone, e.targetMask, targeted_cell, caster, snapshot) for e in effects}
    for e in effects (hors groupes aléatoires ; groupes « random » : tirer un effet par groupe selon les poids) :
        if e.triggers != 'I': poser un buff (durée e.duration, delay e.delay) sur chaque cible ; continue
        for t in sorted(targets[e], key=compare_positions(targeted_cell, is_push(e))):
            if t invisible or (mort and pas d'effet 'X'/'A'/résurrection): continue
            apply_effect(e, caster, t, targeted_cell, snapshot, crit)     # dégâts §4, poussée §5, état, sous-sort §7.4…
            déclencher les buffs réactifs de t et du lanceur (§3.5) — y compris entrée/sortie d'aura (pics) après un mouvement
    caster.pa -= apCost ; compteurs de lancers ++
```

Points de fidélité à respecter :
1. cibles figées au début ;
2. direction de poussée et dégressivité calculées sur les positions d'avant le sort, mais **mêlée** sur les positions courantes ;
3. troncature à chaque multiplication ;
4. 1163 selon les déclencheurs (poussée exclue de `D`) ;
5. plafond de résistance 50 % joueur ;
6. collisions en chaîne /2^i ;
7. pics non bloquants pour la poussée.

---

## 10. Questions ouvertes / à valider (vidéos, autres agents)

1. **Masques `Atq` / `Def`** : les joueurs dans les pics sont-ils ×2 (DPLN) ou ×1 (données : x200 % seulement pour `Def`) ? Idem au début de tour : 1000 ou 2000 pour un joueur ?
2. **Passif « Gladiatrooller »** : le +3000 Puissance du Dompteur, le +5000 PV de l'Acrobate et le −5000 PV du Magicien sont-ils actifs ? Les dégâts DPLN (Impact « environ 4 500 ») correspondent à ×61, donc sans Puissance.
3. **Niveau utilisé pour la poussée** : niveau réel du personnage, ou 200 (monstre « Gladiatroolleur » 7980 niv. 200) ? L'écart est d'au plus 7 % (283 contre 264 par case pour un niv. 50).
4. **Ordre serveur** entre l'application de l'aura (pics) et les effets suivants d'un même sort : pousser dans les pics puis frapper, les dégâts sont-ils déjà ×2 ?
5. **Arrondi du tacle** : client (perdus arrondis) ou DPLN (restants arrondis) ?
6. **Sortie des pics** : la « vulnérabilité 1 tour » (30701) se décompte-t-elle au début du tour du porteur (lanceur = porteur via le passif) ? Et une sortie **pendant son propre tour** (Acrobate qui marche hors des pics) ?
7. **Invisibles et LdV** : sans objet a priori dans le Gladiatrool (seul « Lancer de dagues » 30735 rend invisible).
8. **Tirage du jet** : uniforme serveur, ou `floor(min + r×(max−min) + 0,5)` comme l'aperçu ?

### 10 bis. Corrections à apporter aux légendes de `research/raw/dofusdb/decoded_spells.md`

Ce fichier appartient à un autre agent : je ne le modifie pas. Les corrections ci-dessous sont des **FAITS vérifiés** dans le code 2.73.

- **Masques** :
  - `V#` = PV de la cible **≤** #% (et non ≥) ; `v#` = PV > #% ;
  - `P` = soi-même ou ses invocations (exclusion), et non « cible principale » ;
  - `O`/`o` = le combattant déclencheur ; `U` = combattant en train d'apparaître ;
  - `j` = invocations alliées (hors compagnons) ; `L` = joueur ou compagnon ennemi.
- **Déclencheurs** :
  - `DCAC` = dommages d'**arme** (CàC), pas de mêlée : la mêlée, c'est `DM` ;
  - `PMD` = dommages de poussée subis **en tant que cible poussée** (pas « PM perdus ») ;
  - `APA` / `MPA` = PA / PM **volés ou perdus** par le porteur (pas « ajoutés ») ;
  - `CD` = le lanceur du buff inflige des dommages ;
  - `CIOFF` = le lanceur redevient visible ;
  - `CC` = coup critique du lanceur.
- **Sous-sorts** :
  - `1018` = le **lanceur/déclencheur** lance le sous-sort **sur la cible** ;
  - `1019` = le lanceur/déclencheur le lance **sur lui-même** ;
  - `792` = la cible lance le sous-sort sur **sa propre case** ;
  - `2794` = la cible le lance sur la **case ciblée du sort parent** ;
  - `2960` = le lanceur le lance sur la case ciblée ;
  - `value` = nombre max d'exécutions pour 2017, 2160, 2792, 2793 et 2795.
- **Formes** :
  - `W` = carré **sans diagonales** (\|dx\| ≠ \|dy\|), pas un carré creux ;
  - `-` = ligne perpendiculaire (comme `T`) ;
  - `/` = ligne (comme `L`) ;
  - `R` = largeur 2·param1+1 × profondeur 1+param2 ;
  - `F` = fourche de profondeur param1+1 ;
  - `Q` : param2 = rayon minimal.

---

## 11. Reproduire

```bash
cd /home/user/GladiatroolSimu
python3 tools/mechanics/verify_mechanics.py            # 62 contrôles (ajouter --verbose pour les rendus de zones)
python3 tools/mechanics/damage_table.py --markdown     # table §4.7
python3 tools/mechanics/build_effects_semantics.py     # research/data/effects_semantics.json
python3 tools/mechanics/il2cpp_actionids.py <global-metadata.dat DOFUS 3> research/data/action_ids_dofus3.json
python3 tools/mechanics/geometry.py ; python3 tools/mechanics/zones.py ; python3 tools/mechanics/damage.py ; python3 tools/mechanics/movement.py
```

Les modules sont importables par le futur moteur : `from tools.mechanics import geometry, zones, damage, movement` (le fichier `__init__.py` est présent).
