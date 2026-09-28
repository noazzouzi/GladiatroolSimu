# 20 — Monstres et boss du Gladiatrool : fiches, dégâts attendus, menace, IA probable

> Agent « MONSTRES ET BOSS ». Rédigé le 2026-09-28.
>
> Étiquettes utilisées :
> - **FAIT vérifié** : lu dans les données du client DOFUS 3 (DofusDB), source primaire.
> - **FAIT rapporté** : guide DPLN, vidéo, forum, ou observation d'un autre agent.
> - **HYPOTHÈSE** : déduction non vérifiée.
>
> Confiance : **haute** / **moyenne** / **basse**.
>
> Livrables :
> - `research/data/monsters.json` : données normalisées pour le simulateur (monstres, sorts avec tous leurs niveaux, effets normaux et critiques, états, tables de dégâts, menace, boss, vagues, IA, écarts). Il est généré par `tools/monsters/build_monsters.py` (stdlib seule, idempotent).
> - Cette note.
>
> Notes liées : 40 (carte, apparitions, cases de Mama), 41 (cellules), 50 (web), 60 (vidéos), 70 (formules), 1x (archétypes).

---

## 0. Résumé (à lire en premier)

| # | Point clé | Statut | Confiance |
|---|---|---|---|
| 1 | Trois Troolls de vague, tous **niveau 200 et 0 % de résistance** : **Troollibre** 7981 (25 000 PV, 11 PA, 6 PM, Force 4000 ⇒ ×41), **Artroolleur** 7982 (19 000 PV, 11 PA, 5 PM, Force 3000 ⇒ ×31), **Nitrooll** 7983 (22 000 PV, 12 PA, 5 PM, Force 3500 ⇒ ×36). Esquive PA/PM 0, tacle et fuite 0. Les fiches en jeu (captures DPLN) montrent les mêmes valeurs. | FAIT vérifié + FAIT rapporté | haute |
| 2 | **Mama Troollette** 7984 : 150 000 PV, 20 PA, 6 PM, Force 4500 (×46), esquive PA/PM 20/20, 0 % de résistance. **Niveau 1000** selon la donnée et le game designer, mais **« Niv. 200 »** sur la fiche en jeu. Seul effet connu de cet écart : les dégâts de collision d'Uppertrooll (133 ou 33 par case restante). | FAIT vérifié / FAIT rapporté | haute / moyenne (niveau) |
| 3 | **Gladiatroolleur** 7980 est le gabarit des joueurs : 30 000 PV, 8 PA, 4 PM, Force 6000, sort 30416 Frappe Repoussoir, passif 30639. Ce passif pose l'état 5970, qui rend **intaclable et empêche de tacler** : il n'y a **aucun tacle** entre joueurs et Troolls. | FAIT vérifié ; identification = HYPOTHÈSE forte | haute |
| 4 | **Stratège Dompteur** 7985/7986 = le **Poutch** invoqué par l'Acrobate (Soutien Stratégique 30403 / 30569 amélioré). 5 500 PV, 0 PA, 0 PM. | FAIT vérifié | haute |
| 5 | Dégâts calculés = jet × (100 + Force)/100 × dommages finaux. On retrouve tous les « environ » de DPLN, à trois nuances près : DPLN surestime **Troollpoline** (6 000 contre 4 100-4 756) et **Double Trooll** (« 3 000 ×2 » contre 2 × 1 152-1 368), et il mesure les sorts de Mama **sous Faveur V** (+25 %), sauf Mitroollette. | FAIT vérifié (calcul) | haute |
| 6 | **Écarts DPLN ↔ donnée** : « Castatrooll » s'appelle **Catastrooll** et fait étoile **6** / attire **5** (DPLN : 5 et 4). Aspiratrooll attire de **2** (DPLN : 1). Double Trooll repousse de **3** (DPLN : 2). Mortrooll se relance tous les **2 tours** (DPLN : 1 fois par tour). Rassemblement **attire aussi les Troolls** alignés (omis par DPLN). | FAIT vérifié | haute |
| 7 | **Arrivée de Mama** : sort de départ 30430 → 30609 avec **delay 7** → téléportation sur la cellule **300** + Rassemblement. Observé au **début de T8** (11 combats, 6 vidéos). Repli observé sur **287** si 300 est occupée. De T1 à T7 : « Tour annulé » + état 5971, elle attend sur 152. | FAIT vérifié (données) + FAIT observé | haute (T8, 300) / moyenne (287) |
| 8 | **Rassemblement Troollesque** : à chaque **début de tour de Mama** à partir de T8, sur les **4 demi-droites** (axes MapPoint) partant d'elle, dans cet ordre : 1) elle **attire les Troolls** au contact ; 2) elle **repousse les joueurs de 63 cases, sans dommages de collision** (effet 1103), donc jusqu'au bord, c'est-à-dire dans les pics. | FAIT vérifié | haute |
| 9 | **Invulnérabilité** : état 56 permanent. Il est **désactivé pendant 1 tour** quand Mama **gagne** l'état 5902, c'est-à-dire quand elle **entre** dans les pics. La fenêtre dure jusqu'au début de son tour suivant. Dans les pics, elle subit aussi **×2** (1163, camp `Def`). À la sortie, elle ne reçoit **pas** le ×2 « post-pics » des Troolls : elle n'a pas le passif Trooler. | FAIT vérifié ; durée exacte = HYPOTHÈSE (décompte DOFUS) | haute / moyenne |
| 10 | **Faveur de la foule** : +25 % de dommages finaux au départ (état V). Chaque récompense d'objectif retire **5 %** et fait baisser l'état d'un cran : V → IV → … → I → aucun. Le −5 % n'est **pas plafonné** par la donnée. Comme 6 objectifs sont possibles (Empalé + 5), un 6e objectif mettrait Mama à **−5 %** (95 %). | FAIT vérifié ; effet du 6e = HYPOTHÈSE | haute / moyenne |
| 11 | **Menace sur une cible, espérance par tour** (critiques compris, joueur à 0 % de résistance) : Troollibre ≈ **9 000** (avec Patroolleur), Artroolleur ≈ **5 000** (tour avec Mortrooll), Nitrooll ≈ **2 800**, plus jusqu'à 4 poussées de 3 et 4 600 de soins par tour, **Mama ≈ 18 900** (Faveur V + Catastrooll). Tout est **×2** si la cible est Vulnérable. L'observation « −20 000/−21 000 au spawn de Mama » concorde. | FAIT vérifié (calcul) + FAIT rapporté | haute (calcul) / moyenne (scénario) |
| 12 | **La menace réelle, ce sont les poussées vers les pics** : +2 000, puis ×2 pendant 1 tour après en être sorti. Troollpoline (anneau, 3 cases), Tir (2, à 8 PO), Double Trooll et Coup de Trooll (3 + 3), Uppertrooll (6, ×3 cibles), Rassemblement (toutes les lignes), Catastrooll (attire tout de 5). | analyse | haute |
| 13 | **IA** : aucune donnée client (IA côté serveur). Le modèle proposé est paramétrable, déduit des sorts et des vidéos : les Troolls passent leur tour dans les pics ou hors de portée. Voir § 9. | HYPOTHÈSE | basse-moyenne |

---

## 1. Sources et méthode

**Source primaire (FAIT vérifié)** : l'extraction DofusDB `research/raw/dofusdb/`, soit `monsters.json`, `spells.json`, `spell_levels.json` et `spell_states.json`.
- Le 2026-09-28, j'ai **revérifié en direct** 7 monstres et 35 spell-levels (`/monsters/7980..7986`, `/spell-levels/…`) : **0 différence**.
- Dernière mise à jour DofusDB de ces monstres : **2026-06-23**, c'est-à-dire le patch 3.6.

URLs par objet :
- monstres : `https://api.dofusdb.fr/monsters/<id>` ;
- sorts : `https://api.dofusdb.fr/spells/<id>` ;
- niveaux de sort : `https://api.dofusdb.fr/spell-levels/<id>` ;
- états : `https://api.dofusdb.fr/spell-states/<id>`.

**Sources rapportées** :
- **DPLN**, https://www.dofuspourlesnoobs.com/gladiatrool.html (maj 21/05/2026) : section II (vagues), section V (monstres), section VI (boss).
- Fiches en jeu (captures DPLN) :
  - `ark63gladia63` : Troollibre ;
  - `ark63gladia64` : Artroolleur ;
  - `ark63gladia65` : Nitrooll ;
  - `ark26gladia125` : Mama ;
  - `ark26gladia128` : Mama dans les gradins (icônes V + invulnérable) ;
  - `tuto2k-46` : arrivée de Mama, icônes « invulnérable » + « II », flèches de poussée sur les 4 axes.
- Observations des notes 40, 50 et 60.

**Moteur** : les dégâts sont calculés avec `tools/mechanics/damage.py` (portage client, note 70 §4) et la dégressivité avec `zones.py`, **en énumérant tous les jets** pour obtenir des moyennes exactes (troncatures comprises). Le critique se tire avec le taux du sort : les monstres ont 0 % de Critique en statistique. Les sous-sorts héritent du critique de leur sort parent (note 70 §4.1).

**Cible par défaut** : un joueur à 30 000 PV et 0 % de résistance. Variantes calculées :
- Vulnérable (×2 : 1163 x200 %, déclencheur D) ;
- Pugnace (+25 % de résistance).

---

## 2. Vue d'ensemble

| id | nom (EN) | niv. | PV | PA | PM | Force (×) | rés. % | esq. PA/PM | tacle/fuite | sorts | sort de départ | fiche en jeu |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 7981 | Troollibre (Trool Croozer) | 200 | 25 000 | 11 | 6 | 4000 (×41) | 0 | 0/0 | 0/0 | 30380, 30381, 30382 | 81002 = 30694 « Trooler » | ✓ identique |
| 7982 | Artroolleur (Artrooleryman) | 200 | 19 000 | 11 | 5 | 3000 (×31) | 0 | 0/0 | 0/0 | 30383, 30384 | 81002 = 30694 | ✓ identique |
| 7983 | Nitrooll (Nitrool) | 200 | 22 000 | 12 | 5 | 3500 (×36) | 0 | 0/0 | 0/0 | 30385, 30387, 30388, 30386 | 81002 = 30694 | ✓ identique |
| 7984 | Mama Troollette (Mama Troolette) | **1000** (fiche : 200) | 150 000 | 20 | 6 | 4500 (×46) | 0 | **20/20** | 0/0 | 30389, 30392, 30393, 30394 | 80586 = 30430 « Rassemblement Troollesque » | niveau différent |
| 7980 | Gladiatroolleur (Gladiatrooler) | 200 | 30 000 | 8 | 4 | 6000 (×61) | 0 | 0/0 | 0/0 | 30416 | 80897 = 30639 « Gladiatrooller » | (joueur) |
| 7985 | Stratège Dompteur (Tamer Strategist) | 200 | 5 500 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | — | 80525 = 30421 Soutien Stratégique [Sort initial] | — |
| 7986 | Stratège Dompteur (amélioré) | 200 | 5 500 | 0 | 0 | 0 | 0 | 0/0 | 0/0 | — | 80768 = 30568 [Sort initial Amélioré] | — |

**Drapeaux (FAIT vérifié)** :
- **Tous les monstres de la race 313** :
  - peuvent jouer, tacler, être poussés, échangés et portés (`canPlay`, `canTackle`, `canBePushed`, `canSwitchPos`, `canBeCarried` = vrai) ;
  - ont `isBoss = false`, **Mama comprise** : c'est un drapeau de bestiaire, sans effet pour le simulateur ;
  - ont un seul grade et aucun bonus de caractéristiques.
- **Stratège Dompteur** : 5 grades identiques.
- **Tacle / fuite** : Agilité 0, donc tacle = fuite = 0. De toute façon, les joueurs portent l'état 5970, intaclable et « ne tacle pas » (§ 5). **Correction de la note 70 §6.2** (« ratio 0,5 par Trooll adjacent ») : il n'y a **aucun tacle** dans le Gladiatrool.

**Érosion** : 10 % de base, affichée sur les fiches en jeu des Troolls.

---

## 3. Troolls de vague

Notation des sorts : PA · PO · ligne / LdV · lancers par tour / par cible · intervalle de relance · critique %. Les valeurs calculées portent sur un **joueur à 0 % de résistance**. « Esp. » = espérance par lancer, critique compris.

### 3.1 Passif commun « Trooler » (30694, spell-level 81002)

FAIT vérifié. C'est le sort de départ des 3 Troolls :

- **niv.1 → 30700** « Glyphe de combat [Passif] » : buff déclenché `EOFF5902|EOFF5903`. Quand le Trooll **perd** l'état « a déclenché le glyphe », c'est-à-dire quand il **sort** des pics, 30701 lui applique :
  - l'état 5994 **Vulnérable** pendant 1 tour ;
  - le **1163 « Dommages subis x200 % »** (déclencheur D) pendant 1 tour.

  ⇒ Un Trooll **sorti** des pics reste ×2 jusqu'au début de son prochain tour. Le même passif existe chez les joueurs (via 30639).
- **niv.1 → 30754** : vérification de l'objectif **Empalé** (état 6026).
- **niv.1 (déclencheur X)** : à la mort, niv.2 → niv.3 = « pas d'effet ». L'effet est `forClientOnly` : c'est une **animation**.

**Dans les pics** (30390 niv.2, camp `Def`) :
- entrée = −2 000, état Vulnérable, **×2** tant qu'il y reste ;
- début de tour dedans = −1 000 ×2 = **−2 000**.

⇒ **PV effectifs d'un Trooll poussé dans les pics** = (PV − 2 000)/2 :

| Trooll | Troollibre | Artroolleur | Nitrooll |
|---|---|---|---|
| PV effectifs dans les pics | **11 500** | **8 500** | **10 000** |

Un Trooll à ≤ 2 000 PV qui commence son tour dans les pics **meurt seul**, ce que confirment cardxc et Khytrayer (note 60).

### 3.2 Troollibre (7981) — mêlée et placement

| sort | coût / portée / limites | effets (ordre) — normal / **critique** | dégâts calculés (×41) | DPLN | écart |
|---|---|---|---|---|---|
| **Troollpoline** 30380 (80483) | 4 PA · PO 0 (sur soi) · sans LdV · 1/tour · crit 40 % | zone **C2,1** = anneau de rayon 1 à 2 autour du Troollibre, ennemis `A` : 100-116 neutre, puis repousse 3 / **120-139** | distance 1 : **4 100-4 756**, crit 4 920-5 699, esp. **4 781** ; distance 2 (−10 %) : 3 690-4 280. Avec Patroolleur : 4 715-5 469, crit 5 658-6 553, esp. 5 497. Vulnérable : ×2 (8 200-9 512) | « 6 000 », « cercle de taille 2 autour », « 1 fois par tour » | DPLN surestime : 6 000 n'est atteint qu'en **critique + Patroolleur**. Zone : la case centrale est exclue (anneau). |
| **Aspiratrooll** 30381 (80484) | 3 PA · PO 1-2 · LdV · 3/tour · **1/cible** · crit 30 % · maxStack 2 | cible `a,A` : **attire 2**, puis 65-75 **vol de vie** neutre, puis +10 % d'**érosion** (1 tour) / **78-90** | **2 665-3 075**, crit 3 198-3 690, esp. **3 042** (soin du Troollibre ≈ 1 521) ; avec Patroolleur esp. 3 498 ; Vulnérable ×2 | « attire d'une case », « 3 500 » | attire de **2** (pas 1) ; 3 500 ≈ valeur critique. Le masque `a,A` permet de viser un Trooll allié. |
| **Patroolleur** 30382 (80485) | 2 PA · PO 0 · intervalle **3** · crit 0 | sur soi : **+15 % dommages finaux** (durée 2) ; état **157 Inébranlable** (durée 1) | — | conforme | Inébranlable (157) : `cantBePushed` seulement ⇒ pas de poussée ni d'attirance, mais **l'échange (Voltige) et la téléportation restent possibles**. |

**Menace par tour** (une cible), avec 11 PA :
- Patroolleur → Aspiratrooll → Troollpoline = 9 PA ⇒ **esp. ≈ 8 995**, soit **≈ 17 990 sur Vulnérable**.
- Sans Patroolleur : ≈ 7 823.
- Variante 2 cibles : Troollpoline + 2 Aspiratrooll (10 PA).
- Variante 3 cibles : 3 Aspiratrooll + Patroolleur (11 PA).

**Placement** : Troollpoline repousse de 3 cases **tout** joueur de l'anneau 1-2. Un joueur à ≤ 3 cases du glyphe finit dans les pics : −2 000, puis ×2 une fois sorti.

**Durées** (décompte au début du tour du lanceur, note 70) :
- Inébranlable (durée 1) couvre **toute la ronde des joueurs** qui suit le lancer.
- Le +15 % couvre ce tour et le suivant.

⇒ **Il faut pousser un Troollibre dans les pics AVANT qu'il ait joué**, ou l'échanger avec Voltige s'il est Inébranlable. Observations (note 60) : Troollibres « Inébranlables au T1 », « tous indéplaçables ».

### 3.3 Artroolleur (7982) — artillerie

| sort | coût / portée / limites | effets | dégâts (×31) | DPLN | écart |
|---|---|---|---|---|---|
| **Tir d'Artroollerie** 30383 (80486) | 3 PA · PO 1-8 · LdV · 2/tour · **1/cible** · crit 30 % | `a,A` : 56-65 neutre, puis repousse 2 / **67-77** | **1 736-2 015**, crit 2 077-2 387, esp. **1 982** ; Vulnérable 3 472-4 030 | « 2 000 », PO 8, 2/tour | conforme. Non dit par DPLN : 1 lancer par cible. |
| **Mortrooll** 30384 (80487) | 4 PA · PO 1-8 · LdV · **intervalle 2** · crit 40 % | zone **C3**, ennemis : 81-95 / **101-117** | centre **2 511-2 945**, crit 3 131-3 627, esp. **2 988** ; 1 case : esp. 2 689 ; 2 cases : 2 390 ; 3 cases : 2 091 (dégressivité 10 %/case) | « 3 000 », « 1 fois par tour » | **1 lancer tous les 2 tours** (DPLN : chaque tour). |

**Menace par tour** :
- une cible : Tir + Mortrooll ≈ **4 971** (tour avec Mortrooll), ≈ 1 982 sinon ;
- deux cibles : ≈ 6 953 ;
- sur Vulnérable : ≈ 9 942.

**Position** : l'Artroolleur apparaît en V2/V3 aux coins 187, 188, 411 et 412, à 1-2 cases du glyphe (note 40) ⇒ c'est la **cible la plus facile à pousser dans les pics**. Ce sont aussi ses PV effectifs les plus bas (8 500).

**Objectifs liés** (FAIT vérifié : masques `F7982`) :
- « **Stop aux projectiles** » (30522) : **aucun Artroolleur** en fin de tour global. Il se valide seul quand aucun Artroolleur n'est en vie : fin de T1 (V1 = Troollibres seulement), puis T5, T7 et T8 si les Artroolleurs précédents sont morts.
- « **Distance d'insécurité** » (30532/30533) : tous les Artroolleurs à ≤ 3 cases d'un allié.

### 3.4 Nitrooll (7983) — soutien et poussées

| sort | coût / portée / limites | effets | valeurs (×36) | DPLN | écart |
|---|---|---|---|---|---|
| **Double Trooll** 30385 (80490) | 3 PA · PO 1-2 · LdV · 3/tour · **1/cible** · crit **60 %** | `a,A` : 32-38 neutre **deux fois**, puis **repousse 3** / 42 + 42 | par coup 1 152-1 368 (crit 1 512) ; **total 2 304-2 736**, crit **3 024**, esp. **2 822** ; Vulnérable ×2 | « 3 000 de dégâts 2 fois », « repousse de 2 » | DPLN surestime (≈ total critique compté pour chaque coup). Poussée de **3**, pas 2. |
| **Coup de Trooll** 30386 (80493) | 2 PA · PO 1-6 · **en ligne** · LdV · 2/tour · 1/cible · crit 0 | ennemis : **repousse 3** (aucun dégât hors collision) | collision : 33 par case restante | conforme | — |
| **Trooll de Magie** 30387 (80494) | 3 PA · PO 1-6 · LdV · 2/tour · 1/cible · crit 30 % | alliés `a` (lui compris) : 56-65 **soins neutres** (effet 3001, **boosté par la Force**) / 67-77 | **2 016-2 340**, crit 2 412-2 772, esp. **2 302** ; ≈ 4 604 par tour (2 cibles) | « 2 000 » | conforme |
| **Troollement de Tambour** 30388 (80496) | 3 PA · PO 1-6 · LdV · intervalle **2** · crit 0 | allié `g` (sauf lui) : **échange de positions**, puis **Inébranlable** 1 tour **sur l'allié** | — | conforme | Peut viser **Mama** (masque `g`) : cela explique l'observation isolée « Mama Inébranlable » (Houmilito). HYPOTHÈSE forte. |

**Menace** :
- une cible ≈ **2 822**, ou ≈ 4 822 si la poussée l'envoie dans les pics (+2 000) ;
- surtout **jusqu'à 4 poussées de 3 par tour** (Double Trooll ×3 et Coup de Trooll ×2, 1 par cible pour chaque sort, 12 PA ⇒ au plus 3 + 3 + 3 + 2) ;
- **≈ 4 600 PV de soins** par tour pour les Troolls ;
- des **Inébranlables** qui annulent les plans de l'Acrobate.

⇒ **Cible prioritaire** (analyse).

---

## 4. Boss : Mama Troollette (7984)

### 4.1 Chronologie (FAIT vérifié pour la donnée, FAIT observé pour les tours)

| moment | ce qui se passe | source |
|---|---|---|
| placement (T0) | Sort de départ **30430** : il exécute 30750 (passe-tour), 30609 (arrivée différée), 30724 (Faveur V), 30723 (Invulnérable) et 30718 (mort). | spell-level 80586 |
| T1-T7 | Mama est sur la cellule **152** (gradins), **1re de la timeline**, tour annulé. Effets actifs : état **5971** « Mama Trooll (pré fight) » (enracinée, non déplaçable, pas d'échange) et effet **140 « Tour annulé »**, tous deux de durée 6. Ses icônes V…I et invulnérable sont visibles. Elle est **exclue** des sorts à masque `e5971` : Punition Collective, Dégagez !, Démotivation des troupes, Pulsation Chaotique, Malédictions, Chamboulement, et les objectifs « Au coin ! » et « Tout le monde veut prendre sa place ». | 81182 ; masques ; note 40 §5.1 |
| **début de T8** (avant les joueurs) | 30609 niv.1 (**delay 7**) : retire le passe-tour → niv.2 → niv.3 : `2960` sur la cellule **[300]** → niv.4 : téléportation (effet 4). Puis 30432 niv.1 installe le **Rassemblement** (déclencheur TB), qui s'applique **dès l'arrivée** (observé), puis elle joue un **tour complet**. | 80835-80837, 81100 ; note 40 §5.2 |
| T8, tours des joueurs | Fenêtre de vulnérabilité si elle **entre** dans les pics (§ 4.3). | 30723 |
| T9, T10… | Début de son tour : Rassemblement, puis tour complet. | 30432 |
| mort | Chaque joueur (`H`) reçoit l'état silencieux 6024 « Mama Trooll Dead » (lu seulement par le serveur). Les vagues 9 et 10 **arrivent quand même** ; victoire = plus aucun ennemi après V10 (notes 50/60). | 30718 |

**Réconciliation « delay 7 » ↔ « T8 »** (HYPOTHÈSE, confiance moyenne) :
- Ces buffs sont posés **avant T1** par le sort de départ. Avec le décompte « au début du tour du lanceur », le passe-tour (durée 6) et l'arrivée (delay 7) donnent une Mama inactive jusqu'à T7 et active à T8, ce qui est observé partout.
- L'adminName « **Passe-tour + TP T5** » trahit une version antérieure (arrivée à T5).
- Pour le simulateur : **arrivée = début de T8**. Mama joue la première du tour global (DPLN : « elle aura toujours l'initiative » ; aucune stat d'initiative exposée ; avec Force 4500 < 6000, cet ordre est probablement scripté).

**Case d'arrivée** : **300**, codée en dur dans 30609 niv.3 (confiance haute).
- Si 300 est occupée, elle arrive sur **287** (3 combats et une capture, note 40).
- L'effet 4 vise la zone `C63`. Avec l'ordre `getCells` du client, la première case libre serait lointaine ; avec l'ordre de l'anneau 1, ce serait 286. Aucun des deux n'explique 287 ⇒ **règle serveur**.
- HYPOTHÈSE : la case libre la plus proche sur l'axe venant de 152 (x = 17).

### 4.2 Rassemblement Troollesque (toutes les variantes)

FAIT vérifié :

| sort | niveaux | rôle | détail |
|---|---|---|---|
| 30430 [Sort initial] | 80586 | chef d'orchestre | 5 × `792` (la cible = Mama exécute) : 30750, 30609, 30724, 30723, 30718 |
| 30750 [Passe-tour] | 81182 | attente | état 5971 (durée 6) + **Tour annulé** (durée 6) |
| 30609 [Passe-tour + TP T5] | 80835 / 80836 / 80837 / 81100 | arrivée | niv.1 : retire 30750, **delay 7** → niv.2 → niv.3 (`2960` sur **[300]**) + 30432 niv.1 ; niv.4 : **téléporte** (zone C63) + retire 30609/30750 |
| 30432 [Attirance + Poussée] | 80591 / 80931 / 80934 / 80935 | poussée de début de tour | voir la chaîne ci-dessous |
| 30659 [Compteur de faveur] | 80932 / 80933 | objectifs | V → IV → … → aucun, puis niv.2 : **1172 −5 %** (durée −1) |
| 30724 [Faveurs de la foule] | 81098 | départ | état 5973 « V » + **1171 +25 %** (durée −1) |
| 30723 [Délock] | 81097 / 81099 | invulnérabilité | état 56 (−1) + déclencheur `EON5902` → **952 désactive 56 pendant 1 tour** |
| 30718 [Trigger X / giveStateOnDeath] | 81089-81091 | mort | état 6024 sur les joueurs |
| 30660 / 30661 [Animation allié / ennemi] | 80938 / 80939 | FX | « pas d'effet » |
| 30448 [Attirance CheckForPassiveGrabDodges] | 80608 / 80609 | objectif « Attirance » | vérifie que **tous** les joueurs (`H`) ont reçu « Grabbed » (5918) |

**Chaîne 30432 (Attirance + Poussée)** :
- **niv.1** : sur Mama, buff déclenché **`TB`** (début de SON tour), permanent (triggerDuration 63).
- **niv.2** : `1160` CasterExecuteSpell niv.3 sur chaque cible `g,A` (alliés hors Mama et ennemis) de la zone **X63,1**, c'est-à-dire les 4 demi-droites MapPoint partant de Mama, case centrale exclue.
- **niv.3** : `792` niv.4 sur Mama.
- **niv.4**, zone X63,1, dans cet ordre :
  1. état 5918 « Grabbed » (ennemis) ;
  2. **Attire de 63 cases** les **alliés `g`**, c'est-à-dire les Troolls ;
  3. **Repousse de 63 cases (1103, sans dommages)** les ennemis `A` ;
  4. `792` 30448 si l'objectif « Attirance » est en cours (état 5915).

**Pour le simulateur**, sur chaque demi-droite :
1. On attire d'abord les Troolls au contact de Mama (ou jusqu'au 1er obstacle).
2. On repousse ensuite les joueurs **jusqu'au 1er obstacle ou au bord**. Les pics n'arrêtent pas une poussée ⇒ le joueur finit **dans les pics** (entrée = 2 000 + Vulnérable), **sans collision**, sauf si une entité le bloque plus tôt. Un Trooll attiré entre-temps peut devenir cet obstacle (HYPOTHÈSE sur l'ordre intra-sort).

Lignes de poussée : `research/data/map_annotations.json` → `mamaPushLines`. Depuis 300, ce sont les axes x = 17 et y = −4 ; depuis 287, x = 17 et y = −3. Les 4 cases de départ 286, 287, 314 et 315 sont toutes sur ces axes.

**Astuce rapportée** (2 sources, note 50) : un joueur poussé **sur un cadeau** (Glyphe Événementiel) annule l'animation et les dégâts, et Mama passe son tour.

**DPLN** : « repousse tous les personnages en ligne jusqu'à ce qu'ils atteignent un bord de map ». C'est conforme, mais DPLN **omet l'attirance des Troolls** et l'absence de collision.

### 4.3 Invulnérabilité et pics

FAIT vérifié, 30723 :
- **État 56 « Invulnérable »**, effet d'état 7 = 0 dommage, permanent depuis le placement.
- Déclencheur **`EON5902`** : quand Mama **gagne** l'état 5902 « ennemiHasTriggeredCombatGlyph », que l'aura des pics pose sur le camp `Def` à l'**entrée**, 30723 niv.2 **désactive** l'état 56 pendant **1 tour**.

Conséquences (déductions, confiance moyenne) :

1. **Fenêtre** : de l'entrée dans les pics jusqu'au **début du tour suivant de Mama**. Le buff est posé par elle-même, donc décompté à son tour. Comme elle joue en premier, la fenêtre couvre le **reste du tour global** ⇒ la mettre dans les pics **tôt** (Acrobate en 1er ; Dégagez ! ; Voltige vers une case de pics).
2. **Dans les pics** : ×2 (1163 x200 %, camp `Def`) tant qu'elle y reste. PV effectifs ≈ (150 000 − 2 000)/2 = **74 000**. Si elle sort des pics sans que la fenêtre soit close : ×1 (148 000), car elle n'a **pas** le passif 30700.
3. **Pas de nouvelle fenêtre sans nouvelle entrée** : tant qu'elle reste dans l'aura, l'état 5902 persiste, il n'y a pas de nouvel `EON`, et l'invulnérabilité revient au début de son tour. Pour la rouvrir : la sortir puis la faire rentrer.
4. **Dégâts d'entrée** : 5902 est le 1er effet de 30390 niv.2, avant les 2 000 ⇒ elle subit probablement les 2 000. Ordre non vérifié.
5. **Inébranlable** : rien dans ses propres sorts. Un Nitrooll peut le lui donner (Tambour). La poussée devient alors impossible, l'**échange** (Voltige) reste possible.

DPLN : « il faut la placer dans le glyphe autour de la map, elle deviendra alors vulnérable pour un tour ». Conforme.

### 4.4 Faveur de la foule

FAIT vérifié : 30724 et 30659 ; les 21 sorts « Reward » d'objectifs (un par objectif de la liste DPLN) exécutent 30659 sur `a,A,F7984`.

| objectifs réussis | 0 | 1 | 2 | 3 | 4 | 5 | 6 (HYPOTHÈSE) |
|---|---|---|---|---|---|---|---|
| état affiché | V | IV | III | II | I | — | — |
| dommages finaux de Mama | **125 %** | 120 % | 115 % | 110 % | 105 % | 100 % | **95 %** |
| menace sur 1 cible (esp., + Catastrooll) | 18 908 | 18 256 | 17 604 | 16 952 | 16 300 | 15 648 | 14 995 |

- Le −5 % (1172, permanent) n'est **conditionné à aucun état**. Le gestionnaire 30443 autorise 6 objectifs (Empalé + 5 choix), donc un 6e objectif donnerait 95 % (HYPOTHÈSE, confiance moyenne). DPLN dit « cumulable 5 fois ».
- Le masque `F7984` fait que la réduction **n'agit que si Mama est vivante**.
- Chaque objectif retire environ **650 dégâts** sur le tour type de Mama.
- La Faveur **s'additionne** aux autres dommages finaux :
  - Catastrooll : +20 % ;
  - Démotivation des troupes : −35 % pendant 2 tours ;
  - Vague de Dégradation : −15 % / −30 %.

### 4.5 Sorts de combat

Sa Force de 4500 donne ×46. Les valeurs sont données **hors Faveur / sous Faveur V (×1,25) / Faveur V + Catastrooll (×1,45)** :

| sort | coût / portée / limites | effets | dégâts (min-max ; critique) | DPLN | écart |
|---|---|---|---|---|---|
| **Troollooportation** 30389 (80488) + **30391** (80491) | 1 PA · PO 1-6 · LdV · **case libre** · 2/tour · crit 30 % | Mama se téléporte sur la case, puis exécute **30391** : 60-70 neutre en **X1** autour de sa nouvelle case, ennemis / 72-84. Les 60-70 de 30389 lui-même sont **`forClientOnly`** (infobulle seulement). | cibles au contact = distance 1 ⇒ **−10 %** : 2 484-2 898 / **3 105-3 622** / 3 601-4 202 ; crit 2 980-3 477 / 3 725-4 346 / 4 321-5 041 | « 3 500 », « à son contact », PO 6, 2/tour | conforme **sous Faveur V**. Le sous-sort a un intervalle 2 et 2/tour dans la donnée ; on suppose qu'ils ne limitent pas son exécution par 30389 (HYPOTHÈSE). |
| **Uppertrooll** 30392 (80495) | 1 PA · PO 1-2 · LdV · 3/tour · **1/cible** · crit 30 % | 46-54 **vol de vie**, puis **repousse 6** / 56-65 | 2 116-2 484 / **2 645-3 105** / 3 068-3 601 ; crit 2 576-2 990 / 3 220-3 737 / 3 735-4 335 | « 3 000 », repousse 6, PO 2, 3/tour | conforme sous Faveur V. Collision : 133 par case restante au niveau 1000, 33 au niveau 200. |
| **Mitroollette de Poings** 30393 (80497) | 1 PA · PO 1-8 · LdV · 1/tour · crit 30 % | **C3**, ennemis : 93-108 / 111-129 (−10 % par case) | centre 4 278-4 968 / **5 347-6 210** / 6 203-7 203 ; crit 5 106-5 934 / 6 382-7 417 / 7 403-8 604 | « 4 500 », C3, PO 8, 1/tour | DPLN = valeur **hors** Faveur (incohérent avec les autres sorts du guide). Nom : « Poing » → « Poings ». |
| **Catastrooll** 30394 (80498) | 1 PA · PO 0 · intervalle **2** · crit 0 | **attire de 5 cases** toutes les entités `a,A` d'une **étoile *6** (8 directions) ; **+20 % dommages finaux** sur soi, **durée 0** | — | « **Castatrooll** », étoile **5**, attire **4**, +20 %, relance 2 | **nom**, **taille** et **distance** différents. Durée du +20 % : HYPOTHÈSE « reste du tour ». Une attirance diagonale fait ceil(n/2) pas (note 70). |

**Tour type** : 20 PA mais seulement **7 lancers** possibles (2 + 3 + 1 + 1). Les PA ne limitent donc jamais ; ce sont les limites de lancer qui comptent.

Séquence la plus dangereuse sur **une** cible (HYPOTHÈSE d'IA) :

> Catastrooll (+20 %, regroupe tout le monde) → Mitroollette au centre → Uppertrooll → Troollooportation ×2 au contact.

Espérance **≈ 18 900** sous Faveur V, ≈ 15 650 sans Faveur, **≈ 37 800** sur un joueur Vulnérable.

Les observations « −20 000 / −21 000 au spawn » (Huz, Matspyder4) concordent, surtout si l'on ajoute l'entrée dans les pics (2 000) causée par le Rassemblement.

**Piège Vulnérable** : un joueur qui **sort** des pics pendant son tour reste ×2 jusqu'au début de **son** prochain tour, par le passif 30700 via 30639. Or Mama joue **la première** du tour global suivant.

⇒ Sortir des pics au T7 ou au T8 expose à **≈ 38 000** de Mama. C'est un one-shot garanti : à éviter absolument (déduction des données, confiance moyenne).

---

## 5. Gladiatroolleur (7980) et Stratège Dompteur (7985/7986)

**Gladiatroolleur** : FAIT vérifié pour les données ; son identification comme gabarit des joueurs est une HYPOTHÈSE forte, partagée par les notes 1x.
- Stats identiques au texte de DPLN : 30 000 PV, 8 PA, 4 PM, Force 6000.
- Sort 30416 **Frappe Repoussoir** (3 PA, PO 1-6 modifiable, 2/tour, crit 30 % + 10 %) :
  - poussée de 2 sur `a,A` (alliés compris), puis 16-20 neutre sur `j,A` ;
  - 976-1 220, crit 1 281-1 525 ; ×2 sur un Trooll Vulnérable. DPLN « 1 200 » : conforme.
- Passif **30639 « Gladiatrooller »** (80897) :
  - état **5970** : intaclable, ne tacle pas, silencieux ;
  - +3000 Puissance (Dompteur), +5000 Vitalité (Acrobate), −5000 Vitalité (Magicien), sous condition d'état. Les notes 1x jugent probable que ces bonus ne s'appliquent pas ;
  - tours de **60 s** (3407) ;
  - passif 30700 (Vulnérable ×2 à la sortie des pics).
- Détail des archétypes : notes `1x_archetype_*.md`.

**Stratège Dompteur** (le Poutch de l'Acrobate, FAIT vérifié) :
- **7985** vient de Soutien Stratégique 30403 ; **7986** de la version améliorée 30569.
- 5 500 PV, 0 PA, 0 PM : il **ne joue pas**.
- Sort de départ 30421 / 30568 :
  - dommages reçus **d'un allié** ×0,5 (1163 x50 %, déclencheur DBA) ;
  - à chaque dommage subi, **si l'attaquant a l'état Dompteur (5899)**, il renvoie **50 % des dommages initiaux** subis aux ennemis en **C2,1** (C3,1 pour l'amélioré) ;
  - il tue tout autre Poutch allié : **un seul Poutch par équipe**.
- Il n'a ni Trooler ni 30700. Détails : note 1x Acrobate.

---

## 6. Vagues

FAIT rapporté (DPLN section II), corroboré par les vidéos et par la détection de 11 combats (note 40). Aucune donnée client ne décrit les vagues : elles sont gérées côté serveur.

| vague / tour | composition | entités | PV de la vague | PV cumulés | menace max sur 1 cible* |
|---|---|---|---|---|---|
| V1 / T1 (après placement) | 2 Troollibres | 2 | 50 000 | 50 000 | 17 990 |
| V2 / T2 | 1 Troollibre + 2 Artroolleurs | 3 | 63 000 | 113 000 | 18 937 |
| V3 / T3 | 2 Nitroolls + 1 Artroolleur | 3 | 63 000 | 176 000 | 10 615 |
| V4 / T4 | 1 Nitrooll + 1 Artroolleur + 1 Troollibre | 3 | 66 000 | 242 000 | 16 788 |
| V5 / T5 | 3 Troollibres | 3 | 75 000 | 317 000 | **26 985** |
| V6 / T6 | 3 Artroolleurs | 3 | 57 000 | 374 000 | 14 913 |
| V7 / T7 | 3 Nitroolls | 3 | 66 000 | 440 000 | 8 466 (+ jusqu'à 12 poussées de 3) |
| V8 / T8 | Mama Troollette | 1 | 150 000 | 590 000 | 18 908 |
| V9 / T9 | 1 Nitrooll + 2 Troollibres + 2 Artroolleurs | 5 | 110 000 | 700 000 | 30 754 |
| V10 / T10 | 2 Nitroolls + 2 Troollibres + 2 Artroolleurs | 6 | 132 000 | **832 000** | **33 576** |

\* **Menace max sur 1 cible** = somme des maxima « une cible » (espérance) de la vague. C'est une borne haute : tous les monstres de la vague atteignent le même joueur, hors pics, hors Vulnérable, sans compter les survivants des vagues précédentes.

Totaux : **31 Troolls** (11 Troollibres, 11 Artroolleurs, 9 Nitroolls) + Mama = 32 ennemis, **832 000 PV**.

Moments d'apparition et cellules : note 40 §4 et `map_annotations.json` (`monsterSpawnCells`, `monsterSpawnModel.slotsByType`). V1 est déterministe sur {242, 358}.

---

## 7. Récapitulatif dégâts attendus ↔ DPLN

| sort (lanceur) | donnée → normal | critique | espérance | DPLN | verdict |
|---|---|---|---|---|---|
| Troollpoline (Troollibre) | 4 100-4 756 | 4 920-5 699 | 4 781 | 6 000 | DPLN surestime ; ≈ crit + Patroolleur |
| Aspiratrooll | 2 665-3 075 | 3 198-3 690 | 3 042 | 3 500 | ≈ critique |
| Tir d'Artroollerie | 1 736-2 015 | 2 077-2 387 | 1 982 | 2 000 | ✓ |
| Mortrooll (centre) | 2 511-2 945 | 3 131-3 627 | 2 988 | 3 000 | ✓ |
| Double Trooll (total 2 coups) | 2 304-2 736 | 3 024 | 2 822 | 3 000 ×2 | DPLN ×2 en trop |
| Trooll de Magie (soin) | 2 016-2 340 | 2 412-2 772 | 2 302 | 2 000 | ✓ |
| Troollooportation (contact, Faveur V) | 3 105-3 622 | 3 725-4 346 | 3 565 | 3 500 | ✓ (sous Faveur V) |
| Uppertrooll (Faveur V) | 2 645-3 105 | 3 220-3 737 | 3 056 | 3 000 | ✓ (sous Faveur V) |
| Mitroollette (centre, sans Faveur) | 4 278-4 968 | 5 106-5 934 | 4 892 | 4 500 | ✓ hors Faveur ; sous Faveur V : 5 347-6 210 |
| Frappe Repoussoir (archétype) | 976-1 220 | 1 281-1 525 | 1 220 | 1 200 | ✓ |
| Pics (glyphe) | 2 000 à l'entrée ; 1 000 en début de tour (×2 pour un monstre = 2 000) | — | — | 2 000 / 2 000 | ✓ pour les monstres ; joueurs : note 70 §4.5 |

Toutes les variantes (Vulnérable, Pugnace, distances de zone, Patroolleur, niveaux de Faveur) sont dans `monsters.json → damageTable`.

Dégâts de **collision** (poussée, cible index 0) par case restante :
- Trooll (niveau 200) : **33** ;
- Mama : **133** au niveau 1000, 33 au niveau 200 ;
- archétype (1000 dommages de poussée) : 283.

---

## 8. Analyse de menace (synthèse)

1. **Les poussées tuent plus que les coups.**
   - Une entrée dans les pics coûte 2 000 PV.
   - Le joueur qui en sort est **×2 jusqu'à son prochain tour**, donc pendant les tours de tous les monstres qui jouent entre-temps, Mama comprise au tour suivant.
   - Poussées disponibles par tour :
     - Troollibre : 1 anneau à 3 cases ;
     - Artroolleur : 2 × 2 cases, jusqu'à 8 PO ;
     - Nitrooll : jusqu'à 4 poussées de 3 par tour (3 Double Trooll + 1 Coup de Trooll, ou 2 + 2), sur des cibles différentes pour un même sort ;
     - Mama : Rassemblement sur toutes ses lignes, 3 Uppertrooll à 6 cases, Catastrooll.
   - **Rester au centre** (loin des pics d'au moins « poussée max + 1 ») est la parade générale. Ce conseil est unanime dans les vidéos (note 60).
2. **Dégâts purs par tour** (espérance, une cible) : Troollibre 9 000 > Artroolleur 5 000 (un tour sur deux) > Nitrooll 2 800. Sur un joueur Vulnérable, **tout double**.
   - Pire vague sur une cible : **V10 ≈ 33 600**, **V9 ≈ 30 800**, **V5 ≈ 27 000**, sans compter les survivants. Un archétype a 30 000 PV.
   - ⇒ Des vagues **non nettoyées** deviennent létales dès V5.
3. **Nitrooll = multiplicateur de difficulté.**
   - Il soigne environ 4 600 par tour.
   - Il rend un allié Inébranlable, ce qui annule le plan de poussée.
   - Il pousse jusqu'à 4 fois par tour.
   - HYPOTHÈSE de priorité : le tuer d'abord quand il est présent (V3, V4, V7, V9, V10).
4. **Troollibre** : à pousser **avant son premier tour**, sinon il devient Inébranlable pour toute la ronde suivante. S'il est Inébranlable, jouer l'échange (Voltige) ou le tuer hors pics. L'objectif « Ébranlable » (achever un ennemi Inébranlable) devient alors naturel.
5. **Artroolleur** : faible (8 500 PV effectifs dans les pics) et apparaît près des bords ⇒ c'est la mise dans les pics la plus rentable. Le tuer valide aussi « Stop aux projectiles ».
6. **Mama** :
   - Menace sur une cible : environ 19 000 (Faveur V) → 15 650 (5 objectifs). Tous les objectifs de T1-T7 **réduisent la menace de T8**.
   - Environ 38 000 sur un joueur Vulnérable, d'où l'interdiction de sortir des pics juste avant qu'elle joue.
   - Pour la tuer : entrée dans les pics (fenêtre d'invulnérabilité) puis ×2 dans les pics ⇒ **≈ 74 000 PV effectifs**, à infliger dans la même ronde.
   - Sources vidéo : 2 Relâchement de Fureur, ou Pense Vite lancé au T7 (voir la note Dompteur).
   - Le placement au T7 doit éviter ses lignes d'arrivée (x = 17, y = −4, y = −3) **et** ne pas occuper 300, sinon elle se replie sur 287 et les axes changent (note 40).

---

## 9. IA probable (modèle paramétrable)

**HYPOTHÈSE** : l'IA est côté serveur et le client n'en contient rien. Le modèle ci-dessous (`monsters.json → aiModel`) est déduit des sorts et des observations.

**Observations** :
- Les Troolls « passent leur tour » dans les pics ou quand les joueurs sont loin. Sources : cardxc, sspritenL, Zephiron ; confiance moyenne.
- Les Artroolleurs tirent à distance. Confiance haute.
- Les Troollibres sont souvent Inébranlables dès T1. Confiance haute.
- Le Nitrooll soigne. Confiance moyenne.
- Mama focalise un personnage à son arrivée. Confiance moyenne.

**Politique proposée** :
- **Commun** :
  - ne jamais entrer volontairement dans les pics ; dans les pics sans sortie utile, ne pas bouger (paramètre `skipIfInPics`) ;
  - cible = l'ennemi atteignable ce tour qui maximise les dégâts, à défaut le plus proche (`focus` ∈ {`lowestHp`, `nearest`, `maxDamage`}) ;
  - si rien n'est atteignable, avancer ou passer son tour (`skipIfNoTargetReachable`).
- **Troollibre** : Patroolleur dès qu'un ennemi est atteignable → Aspiratrooll sur une cible à 2 cases → Troollpoline si l'anneau 1-2 contient un ennemi → Aspiratrooll sur d'autres cibles.
- **Artroolleur** : rester à 3-8 cases avec LdV ; Mortrooll sur la case qui touche le plus de joueurs (1 tour sur 2) ; Tir sur 2 cibles, en préférant les poussées vers les pics.
- **Nitrooll** : soin sur l'allié le plus blessé → Tambour sur un allié menacé, dans ou près des pics → Double Trooll / Coup de Trooll en poussant vers les pics.
- **Mama** : Catastrooll si ≥ 2 joueurs dans l'étoile 6 → Mitroollette sur la case qui touche le plus de joueurs → Uppertrooll ×3 → Troollooportation ×2 au contact du joueur le plus bas en PV.

**Faits de données qui contraignent l'IA** :
- Plusieurs sorts ont le masque `a,A` : Aspiratrooll, Tir, Double Trooll, Catastrooll. Un Trooll **peut** techniquement frapper ou pousser un autre Trooll ⇒ paramètre `monstersCanTargetAllies`, faux par défaut.
- Aucun tacle (état 5970 des joueurs).
- L'ordre de jeu des Troolls apparus en cours de combat n'est **pas** établi : questions ouvertes, notes 50/60/70.

---

## 10. États utiles

FAIT vérifié, `/spell-states/<id>` :

| id | nom | effet pour le simulateur |
|---|---|---|
| 56 | Invulnérable | 0 dommage (effet d'état 7). Mama : permanent, désactivé 1 tour après une entrée dans les pics. |
| 157 | Inébranlable | pas de poussée ni d'attirance (`cantBePushed`) ; échange et téléportation **possibles** |
| 5994 | Vulnérable | icône seulement. Le ×2 vient des 1163 posés à côté (aura, `Def`) ou de 30701 (sortie). |
| 5902 / 5903 | ennemi / allié « a déclenché le glyphe » | marqueurs d'aura. `EON5902` = entrée (Délock de Mama). `EOFF` = sortie (Vulnérable 1 tour). |
| 5918 | Grabbed | touché par le Rassemblement (objectif « Attirance ») |
| 5971 | Mama Trooll (pré fight) | enracinée, non déplaçable, pas d'échange ; exclut Mama des sorts à masque `e5971` |
| 5973 → 5977 | Faveurs de la foule V → I | icônes ; le multiplicateur est porté par 1171/1172 |
| 6024 | Mama Trooll Dead | silencieux, posé sur les joueurs à sa mort |
| 5970 | Gladiatrooler | joueurs : **intaclable + ne tacle pas** |
| 6026 / 5915 / 5913 | Empalé / Objective 5 ongoing / Trooll Ally Detected | marqueurs d'objectifs |

---

## 11. Écarts et contradictions

Liste complète dans `monsters.json → discrepancies` et `spells.<id>.discrepancies`.

| sujet | DPLN / autre source | donnée | arbitrage |
|---|---|---|---|
| Nom du sort 4 de Mama | « Castatrooll » | **Catastrooll** 30394 | coquille DPLN |
| Catastrooll : zone et attirance | étoile 5, attire 4 | étoile **6**, attire **5** | donnée (possible changement de patch) |
| Catastrooll : +20 % | durée non précisée | durée 0 | HYPOTHÈSE : reste du tour |
| Aspiratrooll : attirance | 1 case | **2 cases** | donnée |
| Double Trooll : poussée | 2 cases | **3 cases** | donnée |
| Double Trooll : dégâts | 3 000 ×2 | 2 × 1 152-1 368 (crit 2 × 1 512) | DPLN surestime |
| Troollpoline : dégâts | 6 000 | 4 100-4 756 | DPLN surestime (crit + Patroolleur seulement) |
| Mortrooll : fréquence | 1 fois par tour | intervalle 2 | donnée |
| Sorts de Mama | « environ » 3 000 / 3 500 / 4 500 | ×1,25 sous Faveur V pour Uppertrooll et Troolloportation, pas pour Mitroollette | guide mesuré sous Faveur V, sauf Mitroollette |
| Rassemblement | pousse les personnages | pousse (sans collision) **et attire les Troolls** | omission DPLN |
| Plafond de la Faveur | 5 fois | −5 % inconditionnel, 6 objectifs possibles | HYPOTHÈSE : 6e objectif = 95 % |
| Niveau de Mama | fiche en jeu « Niv. 200 » | 1000 (donnée + game designer) | 1000 par défaut ; 200 en option |
| Tour d'arrivée | DPLN « tour 8 (?) », « éviter la ligne au tour 7 » ; adminName « TP T5 » | delay 7 | **T8** observé ; se placer pendant T7 |
| Tacle | note 70 §6.2 : ratio 0,5 par Trooll | état 5970 des joueurs : intaclable | **aucun tacle** |
| Mama Inébranlable | Houmilito (1 source) | aucun état par elle-même | via Troollement de Tambour d'un Nitrooll (HYPOTHÈSE forte) |
| `isBoss` | boss | `isBoss = false` | sans effet |

---

## 12. Questions ouvertes

1. Priorité de ciblage réelle de l'IA ; règle exacte des « tours passés » (dans les pics, hors de portée).
2. Ordre de jeu des Troolls apparus en cours de combat : alternance avec les joueurs, ou juste après Mama ?
3. Case de repli de Mama si 300 **et** 287 sont occupées.
4. Durée effective du +20 % de Catastrooll (durée 0).
5. Effet d'un 6e objectif sur Mama (95 % ?).
6. Ordre des événements à l'entrée de Mama dans les pics (invulnérabilité retirée avant les 2 000 ?) et au début de son tour dans les pics (1 000 ×2 avant le retour de l'invulnérabilité ?).
7. Le sous-sort 30391 (intervalle 2, 2/tour) est-il limité quand 30389 l'exécute ? On suppose que non.
8. Niveau de Mama en combat (200 ou 1000) : il faudrait un relevé de dégâts de collision d'Uppertrooll (33 ou 133 par case).
9. Vérifier en vidéo que le Rassemblement attire bien les Troolls alignés (prévu par la donnée).

---

## 13. Reproduire

```bash
cd /home/user/GladiatroolSimu
python3 tools/monsters/build_monsters.py            # écrit research/data/monsters.json
python3 tools/monsters/build_monsters.py --summary  # + tables de dégâts / menace à l'écran
```

Entrées :
- `research/raw/dofusdb/*.json` ;
- `research/data/action_ids_dofus3.json` ;
- `tools/mechanics/{damage,zones,geometry,movement}.py`.

Structure de `monsters.json` :
- `meta` et `legend` : masques, déclencheurs, exécuteurs de sous-sorts ;
- `monsters` : stats, drapeaux, fiche en jeu, PV effectifs, passif, IA probable ;
- `spells` : 36 sorts, **tous niveaux**, effets normaux et critiques décodés, sous-sorts référencés ;
- `states` ;
- `damageTable` : variantes Vulnérable, Pugnace, distances, Faveur, Patroolleur ;
- `threat`, `boss` (chronologie, Rassemblement, invulnérabilité, Faveur, mort), `waves`, `pics` ;
- `aiModel`, `discrepancies`, `openQuestions`.
