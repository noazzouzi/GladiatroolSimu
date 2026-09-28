# 40 — Carte du Gladiatrool : positions de combat (analyse visuelle)

> Agent « CARTE — analyse visuelle ». Rédigé le 2026-09-28. Ce travail complète la note 41 (agent « CARTE — données »).
> Livrable machine : `research/data/map_annotations.json`. Figure schématique (sans capture) :
> `research/figures/40_carte_positions_schema.png`. Tables dérivées et scripts : `research/raw/vision/`.
>
> Étiquettes : **FAIT vérifié** (donnée du client ou observation directe et répétée dans une vidéo de jeu),
> **FAIT rapporté** (guide, commentaire), **HYPOTHÈSE**. Confiance : **haute** / **moyenne** / **basse**.
>
> Repère : ids de cellule DOFUS 0..559 (14 colonnes × 40 demi-rangées). Pour raisonner sur les lignes et les distances,
> on utilise les coordonnées MapPoint (formules dans la note 41 et dans `tools/map/mapgeom.py`). Le centre 300 vaut (17,−4).
> Un **décalage (dx,dy)** se lit par rapport à 300. À l'écran, +x va vers le bas-droite et +y vers le haut-droite.
> « En ligne » signifie même x ou même y. La distance vaut |dx|+|dy|.

---

## 0. Résumé

| # | Élément | Résultat (ids de cellules) | Statut | Confiance |
|---|---------|---------------------------|--------|-----------|
| 1 | Carte de combat | **139988488** (damier + anneau de pics). Le trône central et les petites dalles à pics (haut-gauche, bas-centre) appartiennent au **hall RP 139988485** (cellules décoratives 207, 248, 486, 501) : il n'y a **aucun obstacle** sur la carte de combat. | FAIT vérifié | haute |
| 2 | Glyphe de bord (pics) | **96 cellules jouables** : 131–133, 144–149, 157–163, 171, 172, 177, 178, 184, 185, 191, 192, 198, 199, 206, 207, 211, 212, 220, 221, 225, 226, 235, 236, 239, 249, 253, 264, 266, 267, 277, 278, 281, 292, 294, 295, 305, 306, 309, 320, 322, 323, 333, 334, 337, 348, 351, 361, 365, 366, 375, 376, 379, 380, 388, 389, 394, 395, 402, 403, 408, 409, 415, 416, 423, 424, 429, 430, 437–443, 452–457, 467–469. Ce sont exactement les dalles sombres trouées visibles en combat. | FAIT vérifié | haute |
| 3 | Placement de départ | **286, 287, 314, 315**, les 4 voisines du centre 300 | FAIT vérifié | haute |
| 4 | Apparition des monstres | **V1 fixe : 242 et 358.** Les vagues suivantes apparaissent dans un **petit ensemble de cellules fixes**, qui dépend de la vague et du type de monstre ; la cellule exacte est tirée au hasard dans cet ensemble. Détail au § 4. | FAIT observé (11 combats) + HYPOTHÈSE sur la règle | haute (V1–V3), moyenne (V4–V10) |
| 5 | Mama Troollette | Attend sur **152**, dans les gradins en haut à droite. Arrive au **début du tour 8** sur **300**. Si 300 est occupée, elle arrive sur **287**. Elle repousse alors jusqu'au bord les personnages alignés avec elle. | FAIT vérifié (152, 300) + FAIT observé (repli 287) | haute / moyenne |
| 6 | Glyphes Évènementiels (cadeaux) | **272, 273, 299, 301, 327, 328, 329** (jamais observé sur 271 ni 300). Ils apparaissent au début des tours T2 à T9 : 63 cas sur 88 débuts de tour. | FAIT observé | haute (liste), basse (exclusion de 271) |
| 7 | Obstacles en temps réel | **Aucun** observé dans 11 combats complets | FAIT observé (absence) | moyenne |

Recoupement avec `research/data/map_139988488.json` (agent données) : glyphe, cellules de départ, centre 300 et cellule 152
**identiques**. Ma calibration indépendante de l'image (`x ≈ 339,6 + 0,990·px`, `y ≈ 0,3 + 1,004·py`) coïncide avec la sienne
(`x = 332,5 + px`, `y = 4 + py`) à ±2 px près au centre de l'arène.

---

## 1. Sources

### 1.1 Rendu des cartes (DofusDB)

- `https://api.dofusdb.fr/img/maps/1/139988488.jpg` (1910×970) : la carte de combat.
- `https://api.dofusdb.fr/img/maps/1/139988485.jpg` : le hall RP en [-9,-41], avec le trône du PNJ.
- `https://api.dofusdb.fr/img/maps/1/139725313.jpg` : la carte extérieure.

### 1.2 Captures du guide DPLN

Source : <https://www.dofuspourlesnoobs.com/gladiatrool.html>, mise à jour du 21/05/2026. 91 images téléchargées dans le
scratchpad, non versionnées. Celles qui servent ici :

| Image | Ce qu'elle montre | Usage |
|-------|-------------------|-------|
| `tuto2k-5_orig.jpg` | L'arène vide : damier clair, anneau de dalles brunes trouées d'où sortent des pics blancs, liseré rouge, violet et jaune au bord | Identique au rendu de 139988488 |
| `tuto2k-46_orig.jpg` | Mama Troollette au centre du damier. 4 flèches blanches partent d'elle selon les deux diagonales de l'écran. Un personnage (Acrobate) est collé au bord bas-gauche, dans les pics, sur une case surlignée en bleu. | Case d'arrivée de la Mama et poussée (§ 5) |
| `ark26gladia128_orig.png` | Mama Troollette debout dans les gradins, en haut à droite. Au-dessus d'elle, l'icône « V » (Faveur de la foule) et l'icône verte d'invulnérabilité. | Case d'attente (§ 5) |
| `ark26gladia83_orig.png` | Un Troollibre debout sur une dalle à pics du bord bas-droit, sa case surlignée en rouge | Confirme que les dalles trouées sont le glyphe |
| `ark26gladia91_orig.png` | Une case « cadeau » orange (paquet blanc) posée sur le damier | Aspect d'un Glyphe Évènementiel |
| `ark26gladia41_orig.jpg` | Fenêtre « Choisis une amélioration permanente ! » (3 cartes de bonus, « Combat actuellement en pause… ») | Sert de repère temporel (début de tour global) |

### 1.3 Vidéo principale : VOD Twitch **2852548819**

- Lien : <https://www.twitch.tv/videos/2852548819>.
- Chaîne *twynetv*, « [KOURIAL] DÉCOUVERTE GLADIATROOL ?! », 2026-08-21, 5 h 58.
- Contenu : **15 combats** sur la même caméra fixe, dont **11 complets** (T1 à T10). Débuts des combats complets dans la VOD : 0:47:14, 1:38:07, 1:59:17, 2:42:56, 3:09:11, 3:29:29, 3:47:33, 4:09:25, 4:29:58, 4:48:55, 5:10:58.
- Combats partiels : ~0:31, 0:38:12, 1:14:29, 5:47:45.
- Le joueur est en **mode créature** : toutes les entités sont des boules noires avec un anneau de couleur au sol (bleu = alliés, rouge = ennemis). La détection automatique des cases occupées en est facilitée, mais le **type** de monstre n'est pas lisible.
- Téléchargement :
  - flux 480p entier, segments HLS 168–2148 ;
  - flux source 1080p (`chunked`) autour de chaque début de tour des 11 combats complets : 708 segments de 10 s.
- Tout est stocké dans le scratchpad (`video/`, `frames/`), rien n'est versionné.

### 1.4 YouTube : échec, documenté

- Vidéos repérées :
  - `ve5TVn_sJGo` : Koza, « Tutoriel autowin » ;
  - `xDmoOV-9A18` : Sword, 2026-07-06 ;
  - `FSlGkDE7ZOQ` : Khytrayer, 2026-08-14 ;
  - `kGlKYY7_qew` : Huz ;
  - et d'autres (liste complète dans la note 60).
- yt-dlp (client `web_embedded`/`mweb`, runtime deno, jeton PO bgutil) obtient bien les URLs des formats.
- En revanche, les serveurs googlevideo répondent **403** à chaque requête : l'IP de sortie du proxy change d'une requête à l'autre (`mip=160.79.106.x`), alors que l'URL est liée à une IP.
- Les instances Invidious testées répondent 502 ou renvoient une page anti-bot.
- **Twitch**, lui, fonctionne : CDN CloudFront, segments `.ts` publics. C'est la source retenue.
- Seules des vignettes YouTube (`i.ytimg.com/vi/<id>/maxres{1,2,3}.jpg`) ont pu être récupérées. Elles n'ont pas été exploitées pour les cellules.

---

## 2. Méthode

### 2.1 Calibration de la grille sur le rendu 139988488

- Modèle : cellule DOFUS 86×43 px. Centre de la cellule `(col, row)` = (`86·col + 43 + 43·(row%2)`, `21,5·row + 21,5`), puis une transformation `(X0, Y0, sx, sy)`.
- Ajustement : on maximise la composante du gradient d'image normale aux arêtes des losanges, le long des arêtes des 145 cellules jouables hors pics.
- Résultat : `X0 = 339,6`, `Y0 = 0,3`, `sx = 0,990`, `sy = 1,004`.
- **Contrôle indépendant** par la texture des dalles à pics (écart-type de luminance dans chaque losange) :
  - l'AUC « cellules du glyphe contre autres cellules jouables » vaut **0,981** ;
  - elle tombe à 0,81–0,89 si l'on décale la grille d'une case dans n'importe quelle direction.
  - La calibration est donc exacte **à la case près**, et la liste du glyphe correspond bien aux dalles trouées.

### 2.2 Recalage des captures et des images vidéo

- Chaque capture est recalée sur le rendu 139988488 par points SIFT et une similarité estimée par RANSAC. La grille calibrée est ensuite reprojetée dans la capture.
- **Vidéo** :
  - 998 points d'accord sur 1178 appariements pour une image 1080p ;
  - le même recalage sur 139988485 ne donne que 316 points d'accord (les gradins sont communs aux deux cartes), et 18 sur 139725313 ;
  - l'échelle (2,085 en 480p, 0,926 en 1080p) et la translation sont **constantes à ±0,5 px** sur les 15 combats : la caméra ne bouge pas, donc une seule matrice sert pour toute la VOD ;
  - texture des pics sur une image de placement (`s1257_05`) : AUC **0,957**, contre 0,80–0,87 avec une grille décalée d'une case.
- **DPLN `tuto2k-46`** : 25 points d'accord. L'AUC des pics vaut 0,80, contre 0,61–0,71 pour une grille décalée. Précision estimée : ±1 case.
- **DPLN `ark26gladia128`** : 59 à 66 points d'accord, sans ambiguïté.

### 2.3 Détection automatique dans la vidéo (1 image/s)

Pour chacune des 242 cellules (241 jouables + 152) :

- **anneau rouge** (ennemi) et **anneau bleu** (allié) : fraction de pixels de couleur sur trois contours intérieurs du losange (70 à 90 % de sa taille) ;
- **cadeau** : fraction de pixels orange saturés au cœur du losange.

Les fenêtres de pause sont repérées par corrélation avec la barre de titre de la fenêtre « Choisis une amélioration permanente ! ». Elles s'ouvrent au début de chaque tour global T2…T9.

Une **vague** se lit ainsi :

1. on prend les cellules rouges persistantes (au moins 2 images sur 3–4) juste après la fenêtre de bonus ;
2. on retire les cellules rouges présentes dans les 25 dernières images valides d'avant la fenêtre (au moins 3 détections) ou dans les 4 toutes dernières.

Les images assombries (animation, lumière < 110) et les images avec plus de 10 cellules rouges (aperçu de portée de sort) sont écartées. Les cas douteux ont été **contrôlés visuellement** sur des planches avec la grille numérotée, par exemple V2–V6 du combat 1:59:17, les arrivées de la Mama et les cadeaux sur 273 et 271.

Fiabilité : le nombre de monstres nouveaux détectés est égal à la composition du DPLN dans :

| V1 | V2 | V3 | V4 | V5 | V6 | V7 | V9 | V10 |
|----|----|----|----|----|----|----|----|-----|
| 10/11 | 9/11 | 11/11 | 7/11 | 5/11 | 4/11 | 9/11 | 8/11 | 7/10 |

L'écart est presque toujours **une cellule de trop**. C'est un monstre déjà présent mais masqué avant la fenêtre, par une infobulle ou un chiffre de dégâts. Exemple vérifié : V6 du combat 0:47:14, où 273 était cachée par l'infobulle « Twyne ». Les comptes d'une seule observation sont donc à prendre avec prudence.

---

## 3. Zone jouable, glyphe, obstacles, départ

- **Carte de combat = 139988488 (FAIT vérifié, confiance haute).**
  - Les 15 combats de la VOD se recalent sur son rendu, et les captures DPLN de combat (`tuto2k-5`, `tuto2k-46`, `ark26gladia83`) montrent le même damier.
  - Entre deux combats, la même caméra montre le **hall 139988485** avec le trône central du PNJ. C'est là que le détecteur de cadeaux se trompe (trône orange au centre), et ces images ont été exclues.
  - Les dalles à pics décoratives en haut à gauche et en bas au centre du rendu 139988485 sont aux cellules **207, 248, 486, 501** (champ `spikeTile` de `map_139988485.json`). Elles et le trône **n'existent pas** sur la carte de combat.
- **Zone jouable** : 241 cellules, aucun obstacle, aucune cellule qui bloque la ligne de vue (données client, note 41). En vidéo, aucune case jouable ne se comporte comme un obstacle ; seules les entités occupent des cases.
- **Glyphe (pics)** : les 96 cellules jouables de la liste du sort 30390. Les 4 autres cellules de la liste (250, 293, 321, 362) sont hors zone, sans effet.
  - Aspect en combat : dalles brun foncé trouées, avec des pics blancs qui en sortent. Elles forment un anneau de **2 cases d'épaisseur**, plus 4 cases d'angle (160, 295, 305, 440).
  - Le liseré coloré (rouge en bas, violet à gauche, jaune à droite) marque la limite extérieure de la zone.
- **Départ** : anneaux bleus sur 286, 287, 314 et 315 pendant la phase de placement, à chaque combat (14 débuts détectés). Le centre 300 reste libre au départ.
- **Obstacles « en temps réel »** (DPLN : « certains obstacles peuvent apparaître… pas plus d'informations ») : aucun obstacle de décor n'apparaît dans les 11 combats (HYPOTHÈSE, confiance moyenne : ce qui apparaît en cours de combat, ce sont les cadeaux et les invocations). Seule entité fixe connue : l'invocation « Stratège Dompteur » (7985/7986, 0 PA 0 PM) du sort Soutien Stratégique de l'Acrobate, qui occupe une case comme un obstacle.

---

## 4. Apparition des monstres par vague

### 4.1 Moment d'apparition (FAIT observé)

- **V1** apparaît dès la fin du placement.
- **V2 à V7 et V9** apparaissent **au début du tour global**, juste après la fenêtre de bonus. L'écran s'assombrit ~3 s, puis la vague est là.
- **V8** : arrivée de la Mama (§ 5), sans autre monstre.
- **V10** : au début de T10. Il n'y a pas de fenêtre de bonus à ce tour-là.

Les compositions (nombre de nouvelles entités) correspondent au DPLN : 2, 3, 3, 3, 3, 3, 3, Mama, 5, 6.

### 4.2 Cellules observées (11 combats complets, 1080p ; V10 : 10 combats en 480p)

Format : cellule (décalage depuis 300) × nombre de combats.

| Vague | Composition (DPLN) | Cellules observées |
|-------|--------------------|--------------------|
| **V1** | 2 Troollibres | **242 (−4,0) ×11, 358 (+4,0) ×10.** Déterministe. Cas isolés 171 et 402 : monstre déjà poussé. |
| **V2** | 1 Troollibre + 2 Artroolleurs | 412 (4,−4) ×8, 188 (−4,4) ×6, 187 (−5,3) ×5, 358 (4,0) ×4, 242 (−4,0) ×3, 411 (3,−5) ×3, 246 (0,4) ×2. Toujours **une** case parmi {187, 188}, **une** parmi {411, 412} et **une** parmi {242, 358, 246}. |
| **V3** | 2 Nitroolls + 1 Artroolleur | 290 (3,4) ×8, 311 (−3,−4) ×5, 255 (−5,−2) ×4, 412 ×4, 188 ×3, 187 ×2, 283 (−4,−3) ×2, 318 (4,3) ×2, 411 ×2, 262 (2,5) ×1. Toujours **deux** cases à distance 7, souvent opposées, et **un** coin {187, 188, 411, 412}. |
| **V4** | 1 Nitrooll + 1 Artroolleur + 1 Troollibre | Très dispersé : 231 ×3, 353 ×3, 218, 230, 247, 257, 298, 344, 356, 359, 370, 371 ×2, 214, 219, 241, 260, 270, 325, 329, 341, 342, 383, 386 ×1. |
| **V5** | 3 Troollibres | 344 (3,0) ×5, 298 (−2,−2) ×4, 257 (−3,0), 260 (0,3), 341 (0,−3), 342 (1,−2), 356 (2,−2) ×3, 230, 244, 284, 329 ×2, 242, 271, 274, 314, 315, 368, 370 ×1. Tous à **distance 2–4 du centre**. |
| **V6** | 3 Artroolleurs | 353 (−1,−5) ×6, 386 (5,−1) ×6, 241 (−5,−1) ×5, 218 (−1,5) ×4, 247 (1,5) ×3, 204 (−2,5), 214 (−5,1), 359 (5,1) ×2, 227, 291, 339, 367, 372 ×1 (+ quelques artefacts). Presque tous sur l'**anneau de distance 6** : (±5,±1), (±1,±5). |
| **V7** | 3 Nitroolls | 370 (2,−3) ×7, 270 (−3,−1) ×6, 330 (3,1) ×5, 231 (−2,3) ×3, 371 (3,−2) ×3, 274 (1,3) ×2, 230, 246, 260, 313, 316, 317, 355, 356, 425 ×1. Surtout à **distance 4–5**, par paires opposées. |
| **V9** | 1 Nitrooll + 2 Troollibres + 2 Artroolleurs | 214 (−5,1) ×8, 341 (0,−3) ×5, 370 (2,−3) ×5, 218, 260, 298 ×4, 241, 344 ×3, 330, 342, 353, 359, 386 ×2, … |
| **V10** | 2 Nitroolls + 2 Troollibres + 2 Artroolleurs | 218 ×6, 371 ×5, 244, 298, 359 ×4, 230, 231, 247, 344, 356, 370, 386 ×3, 216, 260, 270 ×2, … |

Le détail combat par combat est dans `research/data/map_annotations.json` (`perFightWaveSpawns`) :

| Combat (VOD) | V1 | V2 | V3 | V4 | V5 | V6 | V7 | V9 | V10 |
|---|---|---|---|---|---|---|---|---|---|
| 0:47:14 | 242 358 | 188 246 412 | 290 311 411 | 247 257 370 | 329 344 356 368 | 247 273* 353 386 | 246 270 274 370 | 214 244 344 353 370 372 | 244 247 298 370 371 386 |
| 1:38:07 | 242 358 | 187 246 412 | 255 318 412 | 218 329 341 371 | 242 284 298 | 204 218 241 257 327 | 313 356 370 371 | 214 298 341 342 370 386 | — |
| 1:59:17 | 242 358 | 187 242 412 | 188 290 311 | 230 247 342 383 | 230 257 329 344 | 247 353 359 | 230 270 371 | 218 341 344 370 386 | 218 270 298 344 359 371 |
| 2:42:56 | 242 358 | 188 358 412 | 187 255 290 | 214 356 371 | 257 260 341 | 241 353 386 | 231 270 330 | 214 218 260 341 370 | 218 230 316 344 359 371 |
| 3:09:11 | 242 358 | 188 358 411 | 283 290 412 | 257 353 359 | 230 244 274 341 | 218 241 344 353 | 317 330 425 | 218 241 260 270 298 | 230 244 247 353 371 |
| 3:29:29 | 242 358 | 187 242 412 | 283 318 412 | 241 260 370 | 298 342 370 | 218 241 298 386 | 316 330 370 | 214 230 241 260 344 | 214 218 244 274 298 371 |
| 3:47:33 | 242 358 | 188 411 (+1 masqué) | 188 290 311 | 230 298 359 | 260 298 314 344 | 204 218 359 | 260 330 370 | 214 298 342 359 370 | 244 270 330 356 386 |
| 4:09:25 | 242 (+1) | 187 242 411 | 262 311 411 | 218 231 325 356 | 342 344 356 | 214 353 386 | 270 355 370 | 214 247 274 341 402 | 218 231 260 314 341 359 370 |
| 4:29:58 | 242 358 | 187 358 412 | 255 290 412 | 231 298 386 | 244 271 342 356 | 227 241 367 386 | 270 274 371 | 214 231 330 341 356 359 | 175 216 231 247 257 344 |
| 4:48:55 | 242 358 | 188 412 (+1 masqué) | 187 255 290 | 219 231 344 353 | 260 284 298 | 247 291 372 386 | 231 330 370 | 241 284 298 353 371 | 216 218 231 260 356 359 |
| 5:10:58 | 242 358 | 188 358 412 | 188 290 311 | 270 344 353 | 257 315 341 344 | 214 315 339 353 | 231 270 370 | 214 218 245 260 330 | 218 230 298 356 370 386 |

\* monstre pré-existant masqué par une infobulle, vérifié visuellement.

### 4.3 Règle d'apparition proposée (HYPOTHÈSE, forte régularité)

- Les positions **ne dépendent pas visiblement des joueurs** : les mêmes cellules reviennent d'un combat à l'autre, quelle que soit la position de l'équipe. Elles forment des **emplacements fixes autour du centre 300, propres à chaque type de monstre et à chaque vague**. À chaque vague, le jeu tire la case au hasard parmi ces emplacements (le détail du tirage est géré par le serveur ; aucune liste de cellules d'apparition n'existe dans les sorts, note 41 § 3.6).
- Les types ne sont pas lisibles en mode créature. On les déduit en croisant la composition du DPLN avec la distance au centre, ce qui donne une classification très cohérente :
  - **Troollibre** :
    - V1 = {242, 358} ;
    - V2 = {242, 358, 246} (distance 4 sur un axe) ;
    - ensuite, cellules à distance 2–4 : 257, 344, 260, 341 (axes, distance 3), 298, 356, 244 (diagonales), 342, 329, 284, 245.
  - **Nitrooll** :
    - V3 = distance 7 {290, 311, 255, 318, 283, 262} ;
    - ensuite, distance 4–5 : {270, 330, 370, 231, 371, 230, 274, 355}, souvent par paires opposées (270/330, 370/231, 371/230, 274/355).
  - **Artroolleur** :
    - V2/V3 = coins à distance 8 {187, 188, 411, 412} ;
    - ensuite, anneau de distance 6 {214, 241, 218, 247, 204, 353, 359, 386} (+ rares 227, 367, 291, 372, 339, 219).
  - Exemple de vérification sur V9 (1 Nitrooll, 2 Troollibres, 2 Artroolleurs), combat 1:59:17 : {218, 386} = Art, {341, 344} = Tl, {370} = Nit. Le combat 2:42:56 donne le même schéma avec {214, 218}, {260, 341}, {370}.
- Conséquence pour le simulateur :
  - V1 déterministe (242, 358) ;
  - pour les autres vagues, tirer dans les listes pondérées de `monsterSpawnCells.waveN.candidates` en excluant les cases occupées, ou utiliser `monsterSpawnModel.slotsByType` ;
  - aucune apparition n'a été observée dans les pics (les rares cellules de pics listées — 171, 402 — sont des monstres déjà poussés).
- Points à noter pour la stratégie :
  - V1 apparaît **en ligne** avec les cases de départ 286 et 315 (axe y=−4), à 3 cases d'elles, et 4 cases avant le glyphe côté 199/184 ou 402/416. Une poussée de 3–4 cases sur l'axe envoie le Troollibre dans les pics.
  - Les Artroolleurs de V2/V3 apparaissent à 1–2 cases seulement du glyphe (187/188/411/412 sont à profondeur 3), ce qui en fait des cibles faciles à pousser.

---

## 5. Mama Troollette

### 5.1 Case d'attente : **152** (FAIT vérifié, confiance haute)

- La DPLN `ark26gladia128` la montre debout dans les gradins, en haut à droite. Une fois la capture recalée, ses pieds sont sur **152**.
- Dans la VOD, pendant les tours T1 à T7, une boule surmontée de l'icône de Faveur (V, IV, … I, qui baisse avec les objectifs réussis) et de l'icône verte d'invulnérabilité se tient sur 152 (images `s288_08`, `s725_03`, `s1443_01`). Elle disparaît au tour 8 (`s1443_10`).
- Données client : 152 est l'unique cellule « blue », isolée (`linkedZone` 32) et entourée de cellules qui bloquent la ligne de vue (note 41).

### 5.2 Case d'arrivée : **300**, sinon **287** (FAIT observé)

Elle arrive au **début du tour global 8**, juste après la 7ᵉ fenêtre de bonus, dans les 11 combats. Données : le sort 30609 « Rassemblement Troollesque » (grade 3) vise la cellule 300, et son grade 4 téléporte (note 41).

| Combat | 300 occupée avant ? | Arrivée | Poussées observées (départ → arrivée, axe) |
|--------|---------------------|---------|---------------------------------------------|
| 0:47:14 | non (monstre sur 287) | **300** | aucune (personne aligné) |
| 1:38:07 | **oui, un monstre** | **287** | 246→192 (x=17), 301→403 (y=−3) |
| 1:59:17 | **oui, un joueur** | **287** (vu image par image à 4 img/s) | 300→408 (x=17), 272→171 (y=−3) |
| 2:42:56 | non | **300** | 329→416 (y=−4), un joueur envoyé sur 192 (x=17) |
| 3:09:11 | non | **300** | — |
| 3:29:29 | non | **300** (confiance moyenne, masqué par les dégâts) | — |
| 3:47:33 | non | **300**. Les icônes « I » + invulnérable l'identifient ; elle se téléporte ensuite (230, 231, 284…). | — |
| 4:29:58 | **oui, un joueur** | **287** | — |
| 4:09, 4:48, 5:10 | indéterminé (images sombres ou masquées) | — | — |
| DPLN `tuto2k-46` | probablement oui | **287** (recalage ±1 case) | un personnage poussé sur **408** (x=17), comme dans le combat 1:59:17 |

Conclusions :

- Cible **300**, **confiance haute** : données et 5 combats.
- **HYPOTHÈSE**, confiance moyenne : si 300 est occupée, la Mama arrive sur **287**, la voisine « haute » de 300, du côté de 152. Elle vient de 152 = (17,7) et descend l'axe x=17.

Elle repousse alors jusqu'au bord, dans les pics à profondeur 1, les personnages **en ligne** avec sa case :

- depuis **300** : axe x=17 (192…408) et axe y=−4 (184…416) ;
- depuis **287** : axe x=17 et axe y=−3 (171…403).

Toutes ces lignes sont dans `mamaPushLines` du JSON. Les 4 cases de départ 286, 287, 314 et 315 sont toutes sur ces axes.

**Conseil de placement au T7** (déduit) :

- ne rien laisser sur 300, sinon elle se replie sur 287 et change d'axes ;
- ne finir aucun personnage sur les colonnes x=17, y=−4, ni y=−3.

Un personnage poussé sur un **cadeau** annulerait l'animation et les dégâts (FAIT rapporté, note 60). Or plusieurs cases cadeau sont sur ces axes : 273 et 327 sur x=17, 329 sur y=−4, 301 sur y=−3.

---

## 6. Glyphes Évènementiels (cadeaux)

- **Cellules** : **272 (−1,1), 273 (0,2), 299 (−1,−1), 301 (1,1), 327 (0,−2), 328 (1,−1), 329 (2,0)**.
  - Fréquences sur les débuts de tour T2–T9 des 11 combats : 301 ×12, 327 ×12, 272 ×9, 299 ×9, 329 ×9, 328 ×8, 273 ×4.
  - **Jamais sur 271 (−2,0) ni sur 300**, alors qu'elles complèteraient la symétrie (cases à distance ≤ 2 de même parité que le centre). Les détections isolées sur 271 correspondent à des effets de sort, vérifié visuellement. La probabilité de ne jamais voir 271 en 63 tirages, si elle était tirée uniformément parmi 8 cases, est d'environ 2·10⁻⁴.
  - L'exclusion de 271 reste une **HYPOTHÈSE** (confiance basse). Celle de 300 est plausible, puisque c'est la case d'arrivée de la Mama.
- **Moment** :
  - un rayon de lumière tombe sur la case juste après la fenêtre de bonus (`s1338_02` sur 272, `s1443_10` sur 299, `s803_34` sur 329), puis la dalle orange au paquet blanc apparaît ;
  - un **nouveau cadeau** apparaît à **63 débuts de tour sur 88** (T2–T9), **jamais au T1**. Nombre de combats (sur 11) avec un nouveau cadeau, par tour : T2 5, T3 9, T4 7, T5 8, T6 11, T7 6, T8 10, T9 7 ;
  - plusieurs cadeaux peuvent coexister ;
  - les tours sans cadeau pourraient venir de la case tirée déjà occupée : HYPOTHÈSE.
- **Données** : le sort 30566 « Glyphe Événementiel » pose un glyphe de couleur #FFBE00 sur la case ciblée (zone P1). Toucher la case déclenche 30657, qui propose un choix puis dissipe le glyphe. La case elle-même n'est pas dans les données : c'est le serveur qui la choisit.

---

## 7. Limites et incertitudes

1. **Une seule source vidéo**, un seul joueur et un même compte de groupe sur 11 combats. La règle d'apparition peut dépendre de paramètres non observés, comme le nombre de joueurs (ici 4) ou une mise à jour postérieure au 2026-08-21. Le DPLN (mise à jour 21/05/2026) et la note 60 ne contredisent rien.
2. **Types de monstres non lus** (mode créature) : l'attribution Troollibre / Nitrooll / Artroolleur des emplacements est déduite de la composition et des distances. HYPOTHÈSE.
3. **Détection** :
   - quelques cellules « observées une fois » sont des monstres masqués avant la fenêtre ;
   - le type de V4 est le moins bien établi (7/11 compositions exactes).
4. **V10 en 480p seulement.** Le combat 1:38:07 est exclu (détection bruitée).
5. **Repli de la Mama sur 287** : 3 combats et une capture ; la règle générale (et le choix entre 286, 287, 314 et 315) reste à confirmer. Après son arrivée, la Mama se déplace ou se téléporte pendant son tour (Troolloportation), et elle peut aussi attirer (Castatrooll). Ne pas confondre ces mouvements avec la poussée d'arrivée.
6. **Obstacles dynamiques** : aucun observé. Le DPLN ne donne pas d'exemple.
7. **Carte de combat** : l'identification de 139988488 reste une inférence (identité visuelle parfaite), pas un log réseau.

---

## 8. Reproduction

- **Scripts**, dans `research/raw/vision/scripts/` (chemins du scratchpad codés en dur, à adapter) :
  - `grid.py`, `match.py`, `vreg.py` : grille, recalage SIFT, superposition ;
  - `detect.py` et `fastdet.py` : anneaux et cadeaux ;
  - `runall.py` (480p) et `runsrc.py` (1080p) : détection image par image ;
  - `spawns2.py`, `tab.py`, `srcwaves.py` : vagues ;
  - `seqsheet.py` : planches de contrôle ;
  - `fig.py` : figure ;
  - `segdl.sh` : segments Twitch ;
  - `mp.py` : conversion MapPoint.
- **Matrices de recalage** : `Mk1f.npy` (480p → rendu) et `Mk1src.npy` (1080p → rendu). Calibration du rendu : `fit_488.json`.
- **Tables dérivées** (pas de pixels copiés) : `srcwaves.json`, `wave_rows_1080.json`, `gift_table.json`, `spawn_events.json`, `per_wave_counts*.json`, `src_plan.json`.
- **Segments vidéo** :
  - flux 480p : `https://d3stzm2eumvgb4.cloudfront.net/fcec9427a1c4f30620b6_twynetv_317543879908_1787336534/480p30/<n>.ts` ;
  - flux 1080p : `…/chunked/<n>.ts` ;
  - le segment n couvre [10·n, 10·n+10[ s de la VOD ; le nom d'image `sN_KK` correspond à t = 10·N + KK − 1 s.
- **Images et vidéos** : restées dans le scratchpad (droits Ankama et des auteurs). La figure `40_carte_positions_schema.png` est un schéma dessiné, sans pixel de jeu.
