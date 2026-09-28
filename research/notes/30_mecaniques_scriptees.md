# 30 — Mécaniques scriptées du combat du Gladiatrool

> Agent « mécaniques scriptées ». Rédigé le 2026-09-28.
>
> **Livrable machine** : `research/data/fight_scripts.json`, produit par `tools/fight_scripts/build_fight_scripts.py`. Chaque valeur chiffrée y est relue dans les données, et une assertion la vérifie.
>
> **Sources**
> - **Primaire** : données du client DOFUS 3 exposées par DofusDB. L'extraction est dans `research/raw/dofusdb/`. Chaque fait cite `https://api.dofusdb.fr/spells/<id>` ou `/spell-levels/<id>`.
> - **Code client DOFUS 2.73 décompilé** (`HaxeBuff`, `SpellManager`). Il sert à comprendre les jetons de déclencheurs et de masques.
> - **Guide DPLN** (<https://www.dofuspourlesnoobs.com/gladiatrool.html>, mis à jour le 21/05/2026).
> - **Notes des autres agents** : 40/41 (carte), 50 (web), 60 (vidéos), 70 (formules), 1x (archétypes).
>
> **Étiquettes** : **FAIT vérifié** (lu dans les données du jeu ou le code client), **FAIT rapporté** (guide, forum, vidéo), **HYPOTHÈSE**. Confiance : **haute**, **moyenne** ou **basse**.

---

## 0. Résumé exécutif

| # | Mécanique | Ce que disent les données | Statut | Confiance |
|---|---|---|---|---|
| 1 | Pics : entrée | **2000 neutres** + état Vulnérable, pour les joueurs comme pour les monstres. Les monstres reçoivent en plus **Dommages subis ×2** tant qu'ils restent dans les pics. Ce ×2 est posé *après* les 2000, qui ne sont donc pas doublés. | FAIT vérifié | haute |
| 2 | Pics : début de tour | **1000 bruts** (30390 niv.3). Un monstre prend 1000 × 2 = **2000**, ce qui concorde avec DPLN. Un joueur prend 1000 selon les données, contre 2000 selon DPLN. | FAIT vérifié / écart | haute / moyenne |
| 3 | Pics : sortie | Passif 30700 → 30701 : **Vulnérable + ×2 pendant 1 tour**. Concerne les joueurs et les 3 Troolls, **pas la Mama**. | FAIT vérifié | haute |
| 4 | Effet exact de « Vulnérable » | L'état 5994 n'a **aucun effet propre** : c'est un marqueur. Le multiplicateur vient de l'effet 1163 « Dommages subis x200 % », soit **×2 (+100 %)**. DPLN écrit « +200 % », ce qui est faux. | FAIT vérifié | haute |
| 5 | Cellules des pics | **96 cases jouables**, dans une liste de 102 ids (100 distincts, doublons 351 et 455 ; 250, 293, 321 et 362 sont hors zone). Détail au § 2.1. | FAIT vérifié | haute |
| 6 | Objectifs | **6 au maximum**. Le 1er est imposé (Empalé). Viennent ensuite **5 paliers de 4 objectifs**, chacun départagé par un vote. Le palier décide du sort débloqué, d'où un ordre des sorts toujours identique. | FAIT vérifié | haute |
| 7 | Récompense d'un objectif | Nouveau sort pour chaque joueur, Faveur de la Mama −1 cran (**−5 % de dommages finaux**), puis vote pour l'objectif suivant | FAIT vérifié | haute |
| 8 | Acclamations (bonus) | 6 cartes par archétype, avec leurs valeurs exactes (§ 6). Une valeur diffère de DPLN : Magicien **15 %** de résistance distance, contre 10 % selon DPLN. | FAIT vérifié | haute |
| 9 | Mama : arrivée | Effets retardés de **7 tours** ⇒ **T8**. Elle se téléporte sur la case **300**, ou à défaut sur la première case libre (observé : 287). À chacun de ses débuts de tour, elle repousse les joueurs en ligne (sans dommages de poussée) jusqu'au bord et attire les Troolls. | FAIT vérifié + FAIT rapporté | haute |
| 10 | Mama : invulnérabilité | État 56, levé pendant **1 tour** chaque fois qu'elle **entre** dans les pics | FAIT vérifié | haute |
| 11 | Mama : dommages finaux | **+25 %** au départ (Faveur V), puis **−5 % par objectif**. Rien ne plafonne cette baisse : un 6e objectif donnerait 95 %. | FAIT vérifié | haute |
| 12 | Vagues | **Absentes des données** : aucun effet d'invocation, aucune cellule. Elles sont gérées par le script serveur. La composition vient de DPLN ; les cellules viennent de l'agent carte. | FAIT vérifié (absence) | haute |
| 13 | Victoire | Tous les ennemis morts **et** l'état « combatCanFinish » posé (30577 Finish Fight Trigger, vraisemblablement après la vague 10). Tuer la Mama ne suffit pas. | FAIT vérifié + FAIT rapporté | haute / moyenne (moment) |
| 14 | Pense Vite | +999 PA au tour suivant, **tour de 10 s** (données). DPLN et la bêta annonçaient 15 s. | FAIT vérifié | haute |
| 15 | Lancer de dagues (30373-30379…) | **Une autre attraction** de la Foire, avec d'autres monstres et une autre carte. **À ignorer** pour le Gladiatrool. | FAIT vérifié | haute |

---

## 1. Architecture du scénario

### 1.1 Qui lance quoi

- **Sorts « racines »** : aucun autre sort ne les référence, donc le serveur les lance.
  - 30390 Glyphe de combat ;
  - 30443 Objectif ;
  - 30566 Glyphe Événementiel ;
  - 30608 Choix d'Archétype ;
  - 30658 Choix d'Amélioration ;
  - 30710 Objectif Check ;
  - 30577 Finish Fight Trigger ;
  - 30427 Simili Pics et 30519 Mockup (tests).

  **FAIT vérifié** : graphe de références `provenance.json`.
- **Masque `Sce`** : une **entité de scénario neutre**. **HYPOTHÈSE**, confiance moyenne.
  - Elle porte les états de pilotage : 5906-5911 « Objectif N Fini », 5905 « Objectif Échoué », 5965 « combatCanFinish », et les états « objectif actif » 6022, 6028-6031, 6034.
  - 30710, lancé par Sce, vise la Mama par `A,Def,F7984` et les joueurs par `Atq,A`. Les deux camps sont donc « ennemis » de Sce, ce qui la place dans aucun des deux.
  - Le cadeau est dissipé par un 2018 qui vise `Sce` : Sce pose donc les glyphes.
- **Masques `Atq` et `Def`** : `Atq` désigne le camp attaquant (**les joueurs**), `Def` le camp défenseur (**les monstres**). **HYPOTHÈSE forte**, confiance haute.
  - Les états 5903 « allyHasTriggeredCombatGlyph » et 5902 « ennemiHasTriggeredCombatGlyph » vont respectivement à `Atq` et `Def`.
  - Les objectifs sur les PV des alliés visent `Atq,A`. Stop aux projectiles vise `Def,A,F7982`.
- **Corps des joueurs** : monstre **7980 « Gladiatroolleur »** (niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6000, sort 30416). Son sort de départ est **30639 « Gladiatrooller »**. **FAIT vérifié**.
  - **État 5970** : ne tacle pas, ne peut pas être taclé.
  - **Durée de tour** : 60 s (3407).
  - **Passif 30700** : vulnérabilité à la sortie des pics.
  - **Bonus conditionnels** : +3000 Puissance (Dompteur), +5000 Vitalité (Acrobate), −5000 Vitalité (Magicien). Ils ne s'appliquent **pas**, car le passif est lancé avant le choix d'archétype et ses critères `*E5899/5900/5901` échouent. Les notes 1x le confirment : relevés vidéo exacts à ×61.
- **Troolls 7981-7983** : sort de départ **30694 « Trooler »**. Il contient le passif 30700 (vulnérabilité de sortie), 30754 (contrôle d'Empalé à la mort) et un effet visuel à la mort. **FAIT vérifié**.
- **Mama 7984** : sort de départ **30430**, détaillé au § 8.

### 1.2 Les fenêtres de choix (effet 3008 individuel, effet 3404 vote global)

| id | Type | Lancé par | Contenu | Quand |
|---|---|---|---|---|
| 16 | individuel | 30608 sur chaque joueur | 3 archétypes → passif 30644 / 30648 / 30649 (états 5899 / 5900 / 5901, apparence) + sort de départ | lancement du combat |
| 17 | individuel | 30658 niv.1 → niv.2 sur chaque joueur | « Choisis une amélioration permanente ! » = **Acclamations** (3 cartes sur les 6 de l'archétype) | début des tours globaux **T2 à T9** (observé) |
| 10 | individuel | 30657 niv.3 (cadeau) | 2 cartes : sorts uniques et/ou améliorations de sorts possédés | quand un joueur déclenche un cadeau |
| 11 à 15 | **vote** (majorité, égalité tirée au sort) | 30443 niv.2 à 6 | objectifs du palier suivant (2 proposés dans les vidéos) | dès qu'un objectif est validé (pause) |

Seuls les **identifiants** de listes figurent dans les données. Leur contenu (cartes, probabilités, critères d'apparition) est côté serveur. Statut : FAIT vérifié pour les ids et les lanceurs, FAIT rapporté pour le contenu.

---

## 2. Les pics : « Glyphe de combat » (sort 30390)

### 2.1 Zone et cellules

- **Pose** : spell-level **80489**, deux effets sur la **même liste explicite de cellules**. La zone a `shape` 59 (`;`) et contient 102 ids, dont 100 distincts (351 et 455 figurent deux fois).
  - **1091** « Pose un glyphe-aura » (#FF0000) → lance **30390 niv.2** à l'**entrée** dans la zone ;
  - **401** « Pose un glyphe de début de tour » (#FF0000) → lance **30390 niv.3** au **début du tour** d'une entité qui s'y trouve ;
  - masque `a,A`, durée **-1** (tout le combat). **FAIT vérifié**.
- **Cases jouables des pics** : 96 cases sur la carte de combat **139988488**. Les ids 250, 293, 321 et 362 sont dans la liste mais hors zone jouable, donc sans effet. **FAIT vérifié**, recoupé indépendamment par les agents carte (texture des dalles AUC 0,98, vidéo AUC 0,96).

  ```
  131 132 133 144 145 146 147 148 149 157 158 159 160 161 162 163 171 172 177 178 184 185 191 192
  198 199 206 207 211 212 220 221 225 226 235 236 239 249 253 264 266 267 277 278 281 292 294 295
  305 306 309 320 322 323 333 334 337 348 351 361 365 366 375 376 379 380 388 389 394 395 402 403
  408 409 415 416 423 424 429 430 437 438 439 440 441 442 443 452 453 454 455 456 457 467 468 469
  ```

- **Géométrie** : un anneau de **2 cases d'épaisseur** le long du bord, plus 4 cases d'angle (160, 295, 305, 440). Il reste 145 cases sûres. Une poussée vers l'extérieur s'arrête toujours sur une case de profondeur 1, qui fait partie des pics. Voir note 41.

### 2.2 Entrée dans les pics (30390 niv.2, spell-level 80492)

Les effets s'appliquent dans cet ordre. **FAIT vérifié.**

| order | Effet | Cible | Durée |
|---|---|---|---|
| 0 | état 5902 « ennemiHasTriggeredCombatGlyph » | `Def` (monstres) | -1 (tant qu'il est dans l'aura) |
| 1 | état 5903 « allyHasTriggeredCombatGlyph » | `Atq` (joueurs) | -1 |
| 2-3 | état **5994 Vulnérable** | `Def` et `Atq` | -1 |
| 4-5 | **100 : 2000 dommages Neutre** (jet fixe) | `Atq` et `Def` | — |
| 6 | **1163 : Dommages subis x200 %**, déclencheur `D` | **`Def` seulement** | -1, triggerDuration 63 |

Conséquences :

- **Déclenchement de l'aura** (code client : aura 1091) :
  - les effets s'appliquent à **toute entrée** : marche, poussée, attirance, téléportation, échange ;
  - ils sont **retirés à la sortie**, ce qui déclenche `EOFF5902` / `EOFF5903` ;
  - passer d'une case de pics à une autre ne redéclenche rien, car on ne quitte pas la marque. **HYPOTHÈSE**, confiance moyenne.
- **Dégâts d'entrée : 2000** exactement.
  - Ils sont boostés par les caractéristiques du *poseur*. Les 2000 exacts observés montrent que ce poseur n'a aucune caractéristique : c'est probablement Sce.
  - Ils sont réduits par les **résistances neutres** et les **boucliers** de la victime. Par exemple, un Acrobate avec le bonus +10 % de résistance prend **1800**.
  - Ils ne sont **pas** doublés par le ×2 posé dans le même sort (effet 6, après les effets 4-5).
- **×2 dans les pics** :
  - il vise uniquement le masque `Def`, c'est-à-dire les monstres, la Mama comprise ;
  - le déclencheur `D` exclut les **dommages de poussée** (collision), qui ne sont donc pas doublés ;
  - un joueur dans les pics porte l'état Vulnérable **visuel**, mais **sans ×2** selon les données. C'est un écart avec DPLN (voir § 12). La maquette 30519 confirme l'intention : son ×2 ne vise que le camp adverse.

### 2.3 Début de tour dans les pics (30390 niv.3, spell-level 81026)

- **Dégâts** : **1000 neutres** pour `Atq` comme pour `Def`. **FAIT vérifié**.
  - **Monstre** : 1000 × 2 = **2000**, ce qui concorde avec DPLN et les vidéos (« il a 1038 PV, il va mourir à son prochain tour », cardxc 11:00). Un Trooll resté dans les pics avec **2000 PV ou moins meurt au début de son tour**.
  - **Joueur** : **1000**. Le ×2 de sortie (30701) a déjà expiré au début de son propre tour (décompte des buffs du lanceur avant les glyphes, note 70 § 7.2). DPLN annonce 2000, sans distinguer joueurs et monstres. Écart non tranché.

### 2.4 Sortie des pics (passif 30700 → 30701)

- **Déclencheur** : le passif **30700** (spell-level 81022) lance **30701** sur son porteur dès qu'il **perd** l'état 5902 ou 5903 (`EOFF5902|EOFF5903`), c'est-à-dire dès qu'il sort de l'aura.
- **Effets de 30701** : état **Vulnérable** pendant 1 tour, et **1163 x200 %** (déclencheur D) pendant **1 tour**.
- **Durée** : le lanceur est le porteur lui-même, donc l'effet dure **jusqu'au début de son prochain tour**.
- **Qui porte ce passif** : les joueurs (via 30639) et les Troollibres, Artroolleurs et Nitroolls (via 30694). **Pas la Mama.** **FAIT vérifié.**

**Intérêt tactique.** Un Trooll **sorti** des pics (poussé, échangé, ou attiré par le Rassemblement de la Mama) reste ×2 jusqu'à son tour. On peut donc le finir **hors** des pics.

**Cas limite : cumul ×4.** C'est une **HYPOTHÈSE**, confiance basse à moyenne, à tester en jeu. Le code client multiplie les 1163 entre eux. Un monstre qui **ressort puis re-rentre** dans les pics avant son tour cumule donc :

- le ×2 de sortie (30701), encore actif ;
- le ×2 de l'aura.

Cela donne :

- **4000** à la ré-entrée (2000 × 2, puisque le ×2 de sortie est actif au moment des dégâts) ;
- puis **×4** sur les coups suivants. Par exemple, Frappe Repoussoir inflige 3904-4880 au lieu de 976-1220.

### 2.5 L'état « Vulnérable » : effet exact

- **État 5994** : ses `effectsIds` sont **vides**, et il n'a que le drapeau `displayTurnRemaining`. C'est un **marqueur** (icône, tours restants). **FAIT vérifié** (`/spell-states/5994`).
- **Multiplicateur** : il vient de l'effet **1163 « Dommages subis x200 % »**, posé à côté de l'état. `CharacterMultiplyReceivedDamage` : `m = int(m × 200 / 100)`, soit **×2 (+100 %)**.
- **Écart DPLN** : « 200 % de dégâts supplémentaires » (×3) est une mauvaise lecture de « x200 % ». Trois éléments confirment le ×2 :
  - le texte en jeu « daño sufrido por 200 % » (Khytrayer 04:15) ;
  - « twice as much damage » (Isthos 01:53) ;
  - les 1000 → 2000 du début de tour.
- **Utilisation par Empalé** : la victime doit porter 5994 au moment de sa mort (`*E5994`).

### 2.6 Dégâts calculés

Calculs faits avec `tools/mechanics/damage.py` (note 70). Cible : Trooll sans résistance ; archétype à Force 6000, soit un facteur ×61.

| Situation | Dégâts | Référence DPLN / vidéo |
|---|---|---|
| Entrée dans les pics (monstre ou joueur) | 2000 | « 2 000 » ✔ |
| Entrée, joueur à +10 % de résistance | 1800 | — |
| Début de tour dans les pics, monstre | 2000 | « 2 000 » ✔ |
| Début de tour dans les pics, joueur | 1000 selon les données | « 2 000 » ✘ (écart) |
| Ré-entrée moins d'1 tour après la sortie (hyp.) | 4000 | — |
| Frappe Repoussoir hors pics / Vulnérable / ×4 (hyp.) | 976-1220 / 1952-2440 / 3904-4880 | « 1 200 » ✔ |

---

## 3. Glyphe événementiel, ou « cadeau » (30566 → 30657)

- **Pose** : 30566 applique l'effet **1165** « Pose un glyphe » (#FFBE00), sur **1 case**. **FAIT vérifié**.
  - Il lance 30657 niv.1.
  - Masque **`Atq,A`** : **seuls les joueurs** déclenchent le cadeau, un monstre qui marche dessus ne le prend pas.
  - Durée : 1 tour du poseur. Le poseur (Sce) ne joue pas, donc le cadeau **persiste** jusqu'à ce qu'on le ramasse. Plusieurs cadeaux peuvent coexister (FAIT rapporté).
- **Déclenchement** :
  - 30657 niv.1 lance le niv.2 sur **tous les joueurs** ;
  - le niv.3 joue l'animation 30687, ouvre le **choix n° 10 pour chaque joueur** et dissipe le cadeau (2018 sur les glyphes 30566 de Sce).
  - Toute l'équipe en profite, chacun avec sa propre fenêtre (DPLN ✔).
- **Contenu du choix 10** :
  - sorts uniques : 6 par archétype, plus Pense Vite ;
  - améliorations des sorts déjà possédés : 7 par archétype, décrites au § 7 ;
  - selon DPLN : 2 sorts uniques, 2 améliorations, ou 1 de chaque.
- **Cellules et moment d'apparition** : absents des données, c'est le serveur qui décide. L'agent carte a observé :
  - les cases 272, 273, 299, 301, 327, 328 et 329 ;
  - des apparitions au début des tours T2 à T9, dans 63 cas sur 88.

  Voir `map_annotations.json`.
- **Bug rapporté** (confiance moyenne) : si la Mama pousse un joueur sur un cadeau, la fenêtre interrompt son animation et ses dégâts, et elle passe son tour (cardxc 19:30, forum sspritenL).

---

## 4. Déroulé d'un combat (ordre supposé)

L'ordre exact côté serveur est une HYPOTHÈSE ; les éléments qui le composent sont vérifiés ou rapportés.

1. **Lancement du combat**
   - Placement des joueurs sur 286, 287, 314 et 315 ; la Mama est sur **152**, dans les gradins et dans la timeline.
   - Choix d'archétype (16).
   - Sorts de départ : 30639 pour les joueurs, 30694 pour les Troolls, 30430 pour la Mama.
   - Sce pose les pics (30390) et lance 30443, qui impose l'objectif Empalé.
   - Vague 1 : 2 Troollibres sur **242** et **358**.
2. **Tour global N**
   - **T2 à T9** : fenêtre d'Acclamations (choix 17).
   - Apparition de la vague N. Au T8, pas d'apparition : c'est la Mama qui arrive, par son propre sort retardé.
   - **T2 à T9** : nouveau cadeau (dans environ 72 % des tours).
   - Timeline : la **Mama joue en premier**. Ses tours T1 à T7 sont annulés ; au T8 elle arrive et fait son Rassemblement. Joueurs et Troolls jouent ensuite selon l'initiative (autres agents).
   - Un **vote met le combat en pause** dès qu'un objectif est validé.
   - **Fin du tour global** : 30710 « Objectif Check » contrôle Soleil, Stop aux projectiles, Sauvez-le, Tout va bien, Quintuplé et Solitude.
3. **T10** : dernière vague ; 30577 pose « combatCanFinish » (HYPOTHÈSE sur le moment). La victoire est acquise quand il ne reste plus d'ennemi.

---

## 5. Objectifs

### 5.1 Gestionnaire (30443 « Objectif ») et paliers

- **Lancement : niv.1**. **FAIT vérifié.**
  - 30428 **Empalé** est lancé sur tous les joueurs : c'est l'objectif 1, imposé.
  - Cinq déclencheurs sont posés sur Sce, sur l'apparition des états `EON5906` à `EON5910` (« Objectif 1 Fini » à « Objectif 5 Fini »).
- **Chaque objectif fini ouvre un vote** :
  - l'état « Objectif N Fini » déclenche le **niv.N+1**, qui ouvre le vote **3404 n° 10+N** ;
  - ce vote propose les objectifs du **palier N+1**.
- **Six objectifs au maximum** : « Objectif 6 Fini » (5911) ne déclenche plus rien.
- **Palier imposé par la récompense** : chaque récompense lance **30626 « Spell Manager » au niveau égal à son palier** et pose « Objectif *palier* Fini ».
  - Le palier est donc une propriété de l'objectif lui-même.
  - Les 21 objectifs se répartissent en **1 + 5 × 4**. Chaque palier compte 1 objectif « Général », 1 orienté Acrobate, 1 Dompteur et 1 Magicien.

| Palier | Général | Acrobate (« Baroudeur ») | Dompteur (« Gladiateur ») | Magicien (« Guérisseur ») |
|---|---|---|---|---|
| 1 | **Empalé** (imposé) | — | — | — |
| 2 | 1,2,3, Soleil ! | Attention, sol glissant | Meurtres en série | **Productivité** |
| 3 | **Ébranlable** | Toi, par ici, et toi, par là | **Stop aux projectiles** | Sauvez-le ! |
| 4 | Tout le monde veut prendre sa place | Faire le mur | Pas le temps de dire « Aïe » | Distance d'insécurité |
| 5 | Attirance | Trous dans les Troolls | D'une pierre trois coups | **Tout va bien** |
| 6 | Solitude | Au coin ! | Quintuplé | Même pas mal |

*En gras : les objectifs jugés faciles dans les vidéos.*

Recoupement avec les vidéos, qui concorde avec les paliers (FAIT rapporté) :

- **cardxc** : après Empalé, on lui propose Soleil et Productivité (palier 2). Il enchaîne ensuite Ébranlable (3), Pas le temps de dire Aïe (4) et Tout va bien (5).
- **Huz** : après Empalé, Meurtres en série et Sol glissant (palier 2).
- **Zephiron** affirme ne plus rien s'être vu proposer après Tout va bien (palier 5). Cela contredit le niv.6 de 30443. Deux explications possibles, toutes deux des HYPOTHÈSES :
  - le palier 6 a des critères d'apparition liés à la Mama, non remplis avant T8 ;
  - ou l'observation est erronée.

### 5.2 Récompense commune (script 18111)

Tous les objectifs donnent la même récompense. **FAIT vérifié.**

1. **Sort débloqué** : Spell Manager au niveau du palier ⇒ chaque joueur apprend le sort n° palier+1 de son archétype (§ 7).
2. **Faveur de la Mama** : 30659 niv.1, lancé par la Mama sur elle-même, fait perdre un cran (V → IV → … → I → aucun). Le niv.2 applique **−5 % de dommages finaux**, de façon permanente et **sans condition**.
3. **Suite** : pose « Objectif N Fini » sur Sce, ce qui ouvre le vote suivant, et retire la notification (3401).
4. **Nettoyage** : retire les sous-sorts et les états de l'objectif (406, 951, 2018).

### 5.3 Conditions exactes, reconstituées à partir des sorts

Termes employés dans le tableau :

- **« Challenger »** : l'allié dont c'est le tour (état 5917, posé à son début de tour et retiré à sa fin de tour).
- **TB / TE** : début / fin de tour.
- **« FTG »** : fin du tour global, c'est-à-dire le passage de 30710.

| Objectif (sort) | Condition exacte | Évaluation / compteur | Notes |
|---|---|---|---|
| **Empalé** (30428 ; 30429, 30431, 30754 ; réc. 30433) | Un ennemi **meurt en portant 5994 Vulnérable**, quel que soit le tueur, y compris les 2000 des pics à son propre tour. | Déclencheur X posé sur les ennemis au TB de chaque allié, et par le passif Trooler. | Vulnérable = dans les pics, ou sorti des pics depuis moins d'1 tour. |
| **1,2,3, Soleil !** (30434 ; 30436, 30437, 30438, 30442 ; réc. 30444) | Chaque joueur vivant **finit son tour sur sa case de début de tour**. Un glyphe de fin de tour (#FF00C3) est posé sur sa case au TB et donne 5904 « Objectif Validé ». | FTG : un joueur sans 5904 met « Échoué » sur Sce. | Exige un tour global **complet** après le vote. |
| **Attention, sol glissant** (30497 ; 30498 ; réc. 30499) | Un ennemi **meurt de dommages de poussée** (déclencheur XPD). | Événement. | Les archétypes ont 1000 de dommages de poussée, soit environ 283 par case restante. |
| **Meurtres en série** (30463 ; 30549, 30550 ; réc. 30546) | Le **même tueur** achève **2** ennemis pendant son tour. | X → le **tueur** incrémente 5944 ; remise à zéro au TE. | Une mort par l'entrée dans les pics est attribuée au poseur du glyphe, donc **ne compte pas** (HYP). Un joueur rapporte que les morts par poussée ne comptent pas non plus (non confirmé). |
| **Productivité** (30542 ; 30555 ; réc. 30543) | Un allié **lance 3 sorts** pendant son tour, n'importe lesquels. | Déclencheur **CAP** (lancer de sort, HYP forte) ; compteur 5944 → 5945 → récompense. | Le Magicien : PA + soin + soin. |
| **Sauvez-le !** (30462 ; 30464, 30465, 30492 ; réc. 30466) | À la FTG, l'allié **désigné** (5942 « Heal Target ») a **100 % de ses PV**. Désignation à la FTG précédente : le premier allié à ≤ 10 % PV, sinon ≤ 20 %, …, ≤ 90 %, sinon n'importe lequel. | FTG : d'abord le contrôle, puis la nouvelle désignation. | `v100` : le client 2.73 évalue « PV > 100 % », ce qui est impossible ; le serveur applique forcément ≥ 100 % (HYP). |
| **Ébranlable** (30496 ; 30494, 30495 ; réc. 30493) | Un ennemi **meurt en état 157 Inébranlable**. | Déclencheur X. | L'état 157 empêche seulement d'être poussé : l'échange et la téléportation restent possibles. |
| **Stop aux projectiles** (30520 ; 30522, 30523 ; réc. 30521) | À la FTG, **aucun Artroolleur vivant**. | FTG. | Se valide **seul** s'il n'y a pas d'Artroolleur (vagues sans Artroolleur : 1, 5, 7, 8). |
| **Toi, par ici, et toi, par là** (30528 ; 30529 ; réc. 30530) | Pendant le tour d'un allié : un ennemi **entre** dans les pics (EON5902) **et** un allié **en sort** (EOFF5903). | États 5959 et 5958 sur le Challenger. | L'allié qui sort devient ×2 pendant 1 tour (30701). |
| **Tout le monde veut prendre sa place** (30450 ; 30451-30455, 30477 ; réc. 30456) | Au TB, un glyphe de fin de tour marque la case de l'**ennemi le plus éloigné** (hors Mama pré-combat). L'allié doit **finir son tour sur cette case**. | Glyphe 402 → récompense si l'allié est le Challenger. | Il faut déloger l'ennemi (poussée ou mise à mort). |
| **Faire le mur** (30500 ; 30501-30503 ; réc. 30504) | **3 ennemis différents** subissent des **dommages de poussée** pendant le tour d'un allié. | Déclencheurs PD ou XPD ; 5956 « Not pushed » assure qu'un ennemi ne compte qu'une fois ; compteur sur le Challenger. | — |
| **Pas le temps de dire « Aïe »** (30512 ; 30513 ; réc. 30514) | Tuer pendant son tour un ennemi **à 100 % de ses PV au début de ce tour**. | Marquage au TB (`v100`), retrait au TE. | Cible idéale : un monstre qui vient d'apparaître. |
| **Distance d'insécurité** (30531 ; 30532, 30533 ; réc. 30534) | Au TE d'un allié, **chaque Artroolleur** est à **3 cases ou moins** (cercle C3, distance de Manhattan) d'au moins un allié. | TE. | Vrai par vacuité sans Artroolleur. |
| **Attirance** (30449 ; 30447, 30448 ; réc. 30544) | **Tous les joueurs vivants** sont attrapés (5918 « Grabbed ») par **un même** Rassemblement Troollesque. | Au Rassemblement : arrivée au T8, puis chaque début de tour de la Mama. | Coûteux : les joueurs sont repoussés dans les pics. |
| **Trous dans les Troolls** (30505 ; 30506-30508 ; réc. 30509) | **4 ennemis différents entrent** dans les pics (EON5902) pendant le tour d'un allié. | Compteur sur le Challenger. | Un ennemi déjà dans les pics ne compte pas. |
| **D'une pierre trois coups** (30511 ; 30553, 30554 ; réc. 30547) | **3 ennemis meurent** entre deux lancers de sort de l'allié actif. | Compteur 5962/5963 **sur le Challenger quel que soit le tueur** ; remise à zéro sur CAP et au TE. | Les morts par entrée dans les pics provoquées par le sort **comptent**. |
| **Tout va bien** (30524 ; 30526, 30527 ; réc. 30525) | À la FTG, aucun joueur à **50 % de PV ou moins** (`V50` ⇒ échec). | FTG. | Strictement plus de 50 %. |
| **Solitude** (30439 ; 30440, 30441 ; réc. 30545) | À la FTG, la Mama est vivante **sans aucun allié**. | FTG, contrôle lancé par la Mama. | La Mama pré-combat (sur 152) n'est **pas exclue**. HYP : Solitude peut donc se valider avant T8 si tous les Troolls sont morts. |
| **Quintuplé** (30510 ; 30551, 30552 ; réc. 30548) | **5 ennemis tués par des joueurs** au cours d'un même tour global. | Compteur partagé par tous les joueurs ; remise à zéro à la FTG. | Les morts par le glyphe ne comptent probablement pas (HYP). |
| **Au coin !** (30515 ; 30516, 30517 ; réc. 30518) | Au TE d'un allié, **tous les ennemis vivants sont dans les pics** (5902), la Mama pré-combat exceptée. | TE. | Vrai par vacuité sans ennemi. HYP : au T7, la Mama sur 152 n'est plus « pré-combat », ce qui bloque l'objectif. |
| **Même pas mal** (30535 ; 30539, 30541 ; réc. 30540) | Un joueur **subit un sort de la Mama sans perdre de PV** : 5961 « Attaque Subie » présent, et 5960 « Vie inchangée » **conservé**. | Déclencheur CD sur la Mama. | Tout doit être absorbé par un bouclier (Protection Prolongée, Muraille collective). Possible à partir de T8 seulement. |

Le statut est **FAIT vérifié** pour la logique lue dans les sorts. La sémantique de trois jetons reste une **HYPOTHÈSE** :

- `CAP` : jeton DOFUS 3, absent du client 2.73 ;
- `V#` / `v#` : le client 2.73 teste `≤` et `>` ;
- `Atq` / `Def`.

La confiance est **haute** pour la plupart des objectifs. Elle est **moyenne** pour ceux qui dépendent de l'attribution du tueur : Meurtres en série et Quintuplé.

### 5.4 Compteurs (30457, 30459-30461) et mode d'évaluation

- **États-compteurs réutilisés** : les états 5944 à 5954 (« n troolls tués ») servent de compteurs génériques. Faire le mur, Trous dans les Troolls, Productivité, Meurtres en série et Quintuplé les réutilisent. Un seul objectif est actif à la fois, donc sans conflit.
- **Critères évalués sur l'état d'avant le lancer** (HYPOTHÈSE forte) :
  - Un sort-compteur contient « pose 1 si rien », « pose 2 si 1 », « retire 1 si 1 », et la « récompense si n ».
  - Il faut que ses critères E/e soient évalués **avant** le lancer, sinon tout s'enchaînerait en un seul lancer.
  - C'est la seule lecture compatible avec les textes : 3 poussées, 4 entrées, 3 sorts.
- **Jeton `CAP`** : il n'existe pas dans le client 2.73. Il sert à compter les sorts (Productivité) et à remettre à zéro « à chaque sort ». Il signifie donc très probablement « le porteur lance un sort ».
- **Jetons `X` et `XPD`** :
  - le client 2.73 cherche les jetons par sous-chaîne, et **déclenche `X` pour toute mort** ;
  - `XPD` sert spécifiquement aux morts par poussée.

---

## 6. Bonus « Acclamations de la foule » (choix 17)

Chaque carte (sorts 30592 à 30637) applique un bonus **permanent** (durée -1). Elle lance aussi le niveau correspondant de l'accumulateur 30589, 30590 ou 30591. **FAIT vérifié.**

| Archétype | Carte (sort) | Bonus | DPLN |
|---|---|---|---|
| Dompteur | Accélérante (30592) | +1 PA | ✔ |
| Dompteur | Agile (30593) | +1 PM | ✔ |
| Dompteur | Puissante (30594) | **+10 % dommages finaux** (1171) | ✔ |
| Dompteur | Optique (30632) | +1 PO | ✔ |
| Dompteur | Critique (30633) | **+500 dommages critiques** (418) | ✔ |
| Dompteur | Chanceuse (30634) | **+20 % critique** (115) | ✔ |
| Acrobate | Accélérante (30595) | +1 PA | ✔ |
| Acrobate | Agile (30596) | +1 PM | ✔ |
| Acrobate | Robuste (30597) | **+10 % résistance tous éléments** (1076, plafond 50 %) | ✔ |
| Acrobate | Optique (30635) | +1 PO | ✔ |
| Acrobate | Repoussante (30636) | **+200 dommages de poussée** (414) | ✔ |
| Acrobate | Résistante (30637) | **+10 % résistance mêlée** (2803) | ✔ |
| Magicien | Accélérante (30598) | +1 PA | ✔ |
| Magicien | Agile (30599) | +1 PM | ✔ |
| Magicien | Vitalesque (30600) | **+5000 Vitalité** (125) | ✔ |
| Magicien | Optique (30629) | +1 PO | ✔ |
| Magicien | Soignante (30630) | **+20 % soins finaux** (2971) | ✔ |
| Magicien | Résistante (30631) | **+15 % résistance distance** (2807) | ✘ DPLN : 10 % |

- **Offre** : 3 cartes tirées parmi les 6 de l'archétype, du **T2 au T9**, soit 8 bonus au maximum par personnage (FAIT rapporté). Le tirage se fait côté serveur.
- **Risque de double application** (FAIT vérifié / HYPOTHÈSE, confiance basse) :
  - La carte applique son bonus **et** lance l'accumulateur, qui applique **le même bonus**. Les deux sont visibles et permanents.
  - Soit la carte n'est qu'une infobulle, soit le bonus est réellement doublé (+2 PA).
  - Aucune source ne permet de trancher. Le simulateur applique un bonus simple par défaut, avec l'option `acclamationDoubleApplication`.

---

## 7. Sorts débloqués, améliorations, sorts uniques

### 7.1 Ordre de déblocage (30626 « Spell Manager »)

L'effet 3405 fait apprendre un sort temporaire à chaque allié, filtré par son état d'archétype. **FAIT vérifié, identique à DPLN.**

| Emplacement | Source | Dompteur | Acrobate | Magicien |
|---|---|---|---|---|
| 0 | commun (monstre 7980) | Frappe Repoussoir 30416 | idem | idem |
| 1 | départ | Impact 30395 | Videur 30402 | Pulsation d'Énergie 30409 |
| 2 | objectif palier 1 | Grondement Grandissant 30396 | Hanedimane 30408 | Regain Vigoureux 30410 |
| 3 | palier 2 | Prélèvement 30397 | Voltige 30404 | Amplification 30411 |
| 4 | palier 3 | Détonation 30398 | Aïronemane 30405 | Protection Prolongée 30414 |
| 5 | palier 4 | Coup de Sang 30399 | Pugnace 30406 | Délivrance 30415 |
| 6 | palier 5 | Jaillissement 30400 | Soutien Stratégique 30403 | Vents Contraires 30412 |
| 7 | palier 6 | Ombre Fracassante 30401 | Va-t-en-guerre 30407 | Vague de Dégradation 30413 |

### 7.2 Améliorations (choix 10)

- **Fonctionnement** : chaque sort « Amélioration : X » (30469 à 30491) fait trois choses. **FAIT vérifié.**
  - Il pose l'état « boostedSpell … ».
  - Il **désapprend** le spell-level de base (3406).
  - Il **apprend** la version améliorée (3405).
  - C'est un nouveau sort : l'intervalle de relance repart de zéro (DPLN ✔). Les 21 correspondances sont dans le JSON.
- **Anomalie sur Jaillissement** : 30475 « Amélioration : Jaillissement » fait apprendre le spell-level **80750**, **qui n'existe pas** (404).
  - Le sort amélioré 30564 n'a qu'un niveau, **80760**.
  - C'est probablement une **coquille** dans les données. L'amélioration désapprendrait Jaillissement sans rien donner en échange (bug possible, jamais observé).

### 7.3 Sorts uniques (choix 10)

19 sorts, tous à **5 PA** et à usage unique : ils désapprennent leur propre spell-level. **FAIT vérifié.**

- **Dompteur** : Punition Collective, Galvanisation, Relâchement de Fureur, Pulsation Chaotique, Malédiction Collatérale, Immortalité du Berserker.
- **Acrobate** : Dégagez !, Courage fuyons, Un pour un, Chamboulement, Malédiction Mouvante, Immortalité du Courageux.
- **Magicien** : Influx de Vitalité, Démotivation des troupes, Ultime Espoir, Muraille collective, Malédiction Régénérante, Immortalité du Bienfaiteur.
- **Commun** : Pense Vite.

Deux cas liés au périmètre de cette note :

- **Pense Vite** (30615) : 999 PA avec un délai d'1 tour (au début du tour **suivant**), et un **tour de 10 s** (3407 = 10). DPLN et le GD de la bêta annonçaient 15 s ; Khytrayer (version 3.6) lit 10 s. **Les données actuelles donnent 10 s.**
- **Pulsation Chaotique** (30612 → 30667) : « Pulsion Chaotique » 30665 et 30666 ne sont que des scripts visuels. Mécanique, **FAIT vérifié** :
  - 35-42 dégâts sur la cible, et **+20 au jet de base à chaque rebond** (effet 293, cumulatif) ;
  - chaque rebond va sur l'ennemi non marqué **le plus proche** ;
  - la cible initiale est touchée **deux fois** (30612, puis 30667 niv.1) ;
  - critique à 0 %.

  Dégâts par coup, avec Force 6000 :

  | Coup | Jet | Dégâts | Sur Vulnérable |
  |---|---|---|---|
  | 1er (×2 sur la cible initiale) | 35-42 | 2135-2562 | 4270-5124 |
  | 2e | 55-62 | 3355-3782 | 6710-7564 |
  | 3e | 75-82 | 4575-5002 | 9150-10004 |
  | 4e | 95-102 | 5795-6222 | 11590-12444 |
  | 5e | 115-122 | 7015-7442 | 14030-14884 |
  | 6e | 135-142 | 8235-8662 | 16470-17324 |

  C'est cohérent avec le conseil des vidéos : lancer le sort sur le monstre le plus bas en PV, pour que les derniers rebonds, les plus forts, frappent les autres.

---

## 8. Mama Troollette : le script du boss

### 8.1 Sort de départ 30430

Il lance, dans cet ordre :

- 30750 Passe-tour ;
- 30609 Passe-tour + TP ;
- 30724 Faveurs de la foule ;
- 30723 Délock ;
- 30718, pour l'effet à sa mort.

**FAIT vérifié.**

### 8.2 Avant son arrivée (T1-T7)

- **Placement** : case **152**, dans les gradins. Elle y est isolée, derrière des cases qui bloquent la ligne de vue.
- **30750** : état **5971 « Mama Trooll (pré fight) »** pendant 6 tours, et **140 « Tour annulé »** pendant 6 tours.
  - L'état 5971 l'empêche d'être déplacée (poussée, attirance, téléportation), portée ou échangée (effets d'état 3, 4, 18).
  - Plusieurs objectifs, ainsi que Pulsation Chaotique, l'excluent via `e5971`.
- **Décompte : HYPOTHÈSE**, déduite de la règle vue par l'agent formules : les sorts lancés avant le 1er tour ne sont pas décomptés au 1er début de tour.
  - Le délai de 7 tombe au **T8**, ce qui concorde avec les observations.
  - La durée de 6 expire au début de **son T7**. Au T7, elle n'est donc plus « pré-combat », mais reste coincée sur 152.
  - Conséquence : « Au coin ! » est irréalisable au T7.

### 8.3 Arrivée (30609)

- **Niv.1** (spell-level 80835) : ses deux effets ont un **délai de 7**. Le nom interne, « Passe-tour + **TP T5** », laisse penser à une première version où elle arrivait au T5. **FAIT vérifié.**
- **Au début de son T8** (T8 global, puisqu'elle joue en premier) :
  1. Le Passe-tour est retiré, puis le niv.2 est lancé. Celui-ci :
     - lance le niv.3 : effet 2960, qui lance le niv.4 sur la cellule **[300]** ;
     - installe **30432 « Rassemblement »**, déclenché à chacun de ses débuts de tour (TB).
  2. **Niv.4** : effet 4 « Téléporte sur la case ciblée », avec une zone C63.
     - Elle arrive sur **300** si la case est libre, sinon sur la **première case libre la plus proche**.
     - Observé : **287**, quand 300 était occupée par un joueur ou un monstre (agent carte, 3 combats).
- **Rassemblement** : observé **dès l'arrivée**, puis à chacun de ses débuts de tour.

### 8.4 Rassemblement Troollesque (30432)

- **Zone** : croix **X63** en partant de la distance 1, soit **les 4 lignes qui partent de la Mama**, sur toute la carte.
- **Effets, dans l'ordre** :
  1. état 5918 « Grabbed » sur les joueurs alignés ;
  2. **attire de 63 cases** ses alliés (`g`, les Troolls) : ils sont collés contre elle ;
  3. **repousse de 63 cases SANS dommages** (1103) les joueurs alignés, **jusqu'au bord**, donc **dans les pics** (2000 + Vulnérable) ;
  4. contrôle de l'objectif Attirance, si celui-ci est actif.
- **Lignes de poussée** depuis 300 : axes x = 17 et y = −4 (depuis 287 : x = 17 et y = −3). Les 4 cases de départ des joueurs sont sur ces axes. Voir `mamaPushLines`.
- **Effet de bord** : un Trooll **attiré hors** des pics devient ×2 pendant 1 tour (30701).

### 8.5 Invulnérabilité (30723)

- **État 56 « Invulnérable »** (effet d'état 7, **aucun dégât**), posé pour tout le combat.
- **Levée** : déclencheur **EON5902**, quand la Mama **entre** dans les pics.
  - Le niv.2 applique 952 « Désactive l'état Invulnérable » pendant **1 tour** : jusqu'à son prochain début de tour, soit à peu près le reste du tour global.
  - Dans les pics, elle a aussi le ×2 (masque Def).
  - Elle **n'a pas** la vulnérabilité de sortie : elle ne porte pas le passif 30700.
- **Nouvelle fenêtre** : elle doit sortir des pics puis y re-entrer.
- **Si elle est Inébranlable** : l'état 157 bloque seulement la poussée ⇒ on peut l'échanger (Voltige) ou la téléporter.
- Concorde avec DPLN (« vulnérable pour un tour »). **FAIT vérifié.**

### 8.6 Faveurs de la foule

- **Au départ (30724)** : état **V** (5973) et **+25 % de dommages finaux**, permanents.
- **À chaque objectif (30659)** : elle perd un cran (V → IV → III → II → I → aucun) et **−5 %**.
- **Multiplicateur de dommages finaux** selon le nombre d'objectifs réalisés :

  | Objectifs | 0 | 1 | 2 | 3 | 4 | 5 | 6 |
  |---|---|---|---|---|---|---|---|
  | Multiplicateur | 125 % | 120 % | 115 % | 110 % | 105 % | 100 % | 95 % |

- **Écart avec DPLN** (« cumulable 5 fois ») : les données ne plafonnent pas, donc un 6e objectif la ferait descendre à 95 %.

### 8.7 À sa mort (30718)

- **Effet** : état 6024 « Mama Trooll Dead » sur chaque joueur, sans usage connu.
- **Le combat continue** : les vagues 9 et 10 arrivent encore.

### 8.8 Dégâts calculés sur un joueur

Hypothèses de calcul :

- Force 4500 (×46), jet × 46, puis dommages finaux ;
- 0 % de résistance, joueur non Vulnérable ;
- critique à 30 % sur les sorts de la Mama ;
- Castatrooll donne +20 % de dommages finaux (effet 1171, durée 0 : sa portée exacte n'est pas établie).

| Sort | DPLN | DF 100 %, normal / critique | Faveur V (125 %), normal / critique | Faveur V + Catastrooll (145 %) |
|---|---|---|---|---|
| Troollooportation (2 par tour, zone X1) | 3 500 | 2760-3220 / 3312-3864 | 3450-4025 / 4140-4830 | 4002-4669 |
| Uppertrooll (vol de vie, poussée de 6, 3 par tour, 1 par cible) | 3 000 | 2116-2484 / 2576-2990 | 2645-3105 / 3220-3737 | 3068-3601 |
| Mitroollette de Poings (cercle C3, 1 par tour) | 4 500 | 4278-4968 / 5106-5934 | 5347-6210 / 6382-7417 | 6203-7203 |

- **Lecture des valeurs DPLN** : elles correspondent tantôt au sort sans Faveur (Mitroollette), tantôt au sort avec Faveur V (Uppertrooll).
- **Cumul sur un seul joueur** : 2 Troollooportations, 1 Uppertrooll et 1 Mitroollette, plus 2000 si elle le pousse dans les pics. Cela dépasse **20 000**, ce qui est cohérent avec les « −20 000 / −21 000 au pop » rapportés (Huz, Matspyder4).

---

## 9. Vagues

- **Absentes des données** (FAIT vérifié, confiance haute) :
  - Aucun effet d'invocation (181, 1008, 1011…) des sorts 30370 à 30800 ne fait apparaître les Troolls 7981 à 7983.
  - Hors pics et case 300, aucune liste de cellules ne concerne le Gladiatrool.
- **Le Stratège Dompteur n'est pas l'entité des vagues.** Les monstres **7985 et 7986 « Stratège Dompteur »** (0 PA, 0 PM, 5500 PV) sont l'**invocation du sort Soutien Stratégique de l'Acrobate** : effet 181 de 30403 et de 30569 ; sorts de départ 30421 et 30568.
- **Composition** (DPLN, recoupée par les vidéos et le comptage de l'agent carte ; FAIT rapporté, confiance haute) :

  | Vague | Composition |
  |---|---|
  | V1 | 2 Troollibres |
  | V2 | 1 Troollibre + 2 Artroolleurs |
  | V3 | 2 Nitroolls + 1 Artroolleur |
  | V4 | 1 Nitrooll + 1 Artroolleur + 1 Troollibre |
  | V5 | 3 Troollibres |
  | V6 | 3 Artroolleurs |
  | V7 | 3 Nitroolls |
  | V8 | Mama Troollette |
  | V9 | 1 Nitrooll + 2 Troollibres + 2 Artroolleurs |
  | V10 | 2 Nitroolls + 2 Troollibres + 2 Artroolleurs |

- **Moment d'apparition** :
  - V1 : à la fin du placement ;
  - V2 à V7, et V9 : au début du tour global, juste après la fenêtre de bonus ;
  - V10 : au début du T10 ;
  - les vagues **s'accumulent** si on ne les élimine pas.
- **Cellules d'apparition** (agent carte, `map_annotations.json`, FAIT rapporté et HYPOTHÈSE) :
  - V1 est déterministe : 242 et 358 ;
  - les vagues suivantes sont tirées parmi des emplacements fixes, qui dépendent du type de monstre et de la vague.

---

## 10. Fin du combat

- **Victoire** : tous les ennemis du camp Def (Troolls **et** Mama) sont morts, **et** l'état **5965 « combatCanFinish »** est posé sur Sce.
  - 30577 « Finish Fight Trigger » pose cet état (FAIT vérifié).
  - Il est lancé par le serveur, vraisemblablement après l'apparition de la vague 10. C'est une HYPOTHÈSE, appuyée par le GD : « à partir du tour 10 il n'y a plus de vague, vous pouvez gagner tour 10 ou 11 ».
  - La Mama étant présente dès T1 et les vagues continuant après sa mort, **la victoire n'est pas possible avant T10**.
- **Défaite** : tous les joueurs sont morts. Gagner avec un seul survivant est possible.
- **Aucune limite de tours** : ni dans les données, ni dans une source fiable.

---

## 11. Sorts « système » hors sujet, ou purement visuels

| Sorts | Nature | Utilité pour le Gladiatrool |
|---|---|---|
| **30373-30379, 30344-30353, 30696-30698, 30702-30735, 30738** « Lancer de dagues », « Dague Classique », « Dagues Jumelles », « Dague Instable » | **Autre attraction** de la Foire (race 312). Monstres : Lanceur de dagues 7975 et 7992, Poutch 7976-7978, « Fond de map » 7979, Belguel 7991. 30373 tue les cibles puis lance 30375, qui invoque des Poutchs sur des cellules tirées au hasard (11,11 % chacune). 30377 et 30379 tirent en 3 lignes. Score : 30696-30698. | **Aucune.** Leurs cellules appartiennent à une autre carte : 4 des 9 cellules « Fond de map » ne sont pas marchables sur 139988488. |
| 30692, 30699 « Ligne d'arrivée » | Course de larves, une autre attraction | aucune |
| **30422 « Rugissement »** | Chaton Enragé, une invocation de classe (type 2288) : +30/60/90 Puissance à son invocateur. Il est dans la plage d'ids par hasard. | aucune |
| **30665 et 30666 « Pulsion Chaotique »** (Script Proc / Link) | effets visuels (666) de Pulsation Chaotique | visuel |
| 30427 **Simili Pics** | Bascule des états 5898, 5902 et 5903 pendant 1 tour. Elle simule « être dans les pics » et déclenche EON/EOFF, donc 30701. Portée 0-63, aucun lanceur connu. | outil de test ou de scénario |
| 30519 **Mockup Glyphe de combat** | maquette de test des pics en cercle C3 | aucune, mais elle confirme l'intention « ×2 pour le camp adverse » |
| 30656, 30470, 30640-30642, 30739, 30687, 30660, 30661, 30719 | infobulles et animations | aucune |

---

## 12. Écarts entre les données et DPLN

| Sujet | Données (client) | DPLN | Arbitrage |
|---|---|---|---|
| Vulnérable | ×2 (1163 x200 %) | « +200 % » (×3) | **données**, corroborées par les vidéos |
| Début de tour dans les pics, joueur | 1000 | 2000 | non tranché ; 2000 pour un monstre dans les deux cas |
| ×2 d'un joueur dans les pics | non : ×2 seulement pendant 1 tour après la sortie | oui (« les entités ») | non tranché ; défaut = données |
| Acclamation résistante (Magicien) | 15 % | 10 % | données |
| Pense Vite | 999 PA, tour de 10 s | 999 PA, 15 s | données ; Khytrayer 3.6 lit 10 s |
| Faveur de la Mama | −5 % par objectif, sans plafond | « cumulable 5 fois » | données (6e objectif rare) |
| Passif Gladiatrooller | +3000 Puissance / ±5000 Vitalité | 30 000 PV pour tous, dégâts ×61 | bonus non appliqués (voir notes 1x) |
| Arrivée de la Mama | délai 7 ⇒ T8 ; nom interne « TP T5 » | « tour 8 (?) » | T8 |
| Vagues | absentes des données | liste V1-V10 | DPLN |
| Objectifs | paliers de 4, 6 au maximum | 21 objectifs sans ordre | complémentaires |

**Cohérences vérifiées avec DPLN** :

- 2000 à l'entrée dans les pics ;
- ordre de déblocage des sorts ;
- textes des 21 objectifs ;
- −5 % de dommages finaux et Faveur V à +25 % ;
- invulnérabilité levée 1 tour par les pics ;
- Frappe Repoussoir « 1 200 » (976-1220) ;
- les 17 autres valeurs d'Acclamations.

---

## 13. Paramètres proposés pour le simulateur

Repris dans `fight_scripts.json`, section `simulatorParameters`.

| Paramètre | Défaut | Alternative | Pourquoi |
|---|---|---|---|
| `playersDoubledInsideSpikes` | false | true (lecture DPLN) | ×2 de l'aura sur Def seulement |
| `playerTurnStartSpikeDamage` | 1000 | 2000 | écart données / DPLN |
| `stackExitAndInsideVulnerability` | true (×4) | false | les 1163 se multiplient ; à vérifier en jeu |
| `acclamationDoubleApplication` | false | true | carte + accumulateur |
| `mamaArrivalTurn`, `mamaArrivalCell` | 8, 300 | repli : première case libre la plus proche (287 observé) | — |
| `pushKillCountsForKillObjectives` | true | false | rapport joueur contraire |
| `glyphKillCreditedToPlayer` | false | — | le tueur est le poseur du glyphe |
| `maxObjectives` | 6 | — | — |

**Heuristiques qui découlent des scripts** :

- Laisser mourir seul dans les pics tout Trooll à ≤ 2000 PV : il meurt au début de son tour, et cela valide Empalé.
- Tout monstre **sorti** des pics depuis moins d'1 tour reste une cible ×2.
- Au T7 :
  - libérer la case 300 ;
  - n'avoir aucun joueur sur les axes x = 17 et y = −4 ;
  - la Mama n'a pas le ×2 de sortie : il faut la **faire entrer** dans les pics pour la frapper.
- Objectifs « gratuits » :
  - Stop aux projectiles et Distance d'insécurité, quand il n'y a pas d'Artroolleur ;
  - Au coin !, quand il ne reste plus d'ennemi ;
  - Solitude, possible avant T8 (HYP).

---

## 14. Questions ouvertes

1. **Masques `Atq`, `Def` et `Sce`** en DOFUS 3 : un joueur dans les pics est-il ×2 ? Prend-il 1000 ou 2000 au début de son tour ?
2. **Contenu des listes de choix** 10, 11-15, 16 et 17 : nombre de cartes, probabilités, critères d'apparition. Le palier 6 est-il proposé avant l'arrivée de la Mama ?
3. **Moments exacts** du passage de 30710 (fin du tour global) et de 30577 (T10 ?).
4. **Acclamations** : double application ou non ?
5. **Ré-entrée dans les pics** moins d'1 tour après une sortie : ×4 réel ?
6. **Décompte des durées de la Mama** : l'état 5971 et le Passe-tour expirent-ils au T7 ?
7. **Attribution des morts** par dommages de poussée ou par le glyphe, pour les objectifs de kills.
8. **Seuils serveur** de `V#` et `v#` (≤ ou < ; v100 = PV pleins ?).
9. **Amélioration de Jaillissement** (spell-level 80750 inexistant) : cassée en jeu ?

---

## 15. Reproduction

```bash
cd /home/user/GladiatroolSimu
python3 tools/fight_scripts/build_fight_scripts.py   # relit research/raw/dofusdb + map JSON, vérifie par assertions, écrit research/data/fight_scripts.json
```

- **Dépendances** : bibliothèque standard, plus `tools/mechanics/damage.py` pour les dégâts calculés.
- **Garde-fous** : le script s'arrête si une donnée ne correspond plus à l'analyse, par exemple en cas de mise à jour du jeu. Il vérifie notamment :
  - les valeurs des pics ;
  - les paliers d'objectifs (Spell Manager et « Objectif N Fini ») ;
  - les notifications ;
  - l'ordre des sorts débloqués, comparé au DPLN ;
  - le délai de 7 de la Mama.
