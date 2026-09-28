# Étude consolidée du Gladiatrool (DOFUS 3) — référence pour le simulateur

> Synthèse rédigée le 2026-09-28 à partir de **tout** le travail de recherche du dépôt : notes `research/notes/*.md`,
> données `research/data/*.json`, extraction brute `research/raw/dofusdb/`, figures `research/figures/`, et texte du guide
> Dofus pour les Noobs. Version de jeu de référence : **DOFUS 3.6.12.16** (release Cytrus `dofus3`, monstres mis à jour
> dans DofusDB le 2026-06-23). La carte est identique dans la bêta 3.7.2.2.
>
> Documents compagnons :
> - `research/QUESTIONS_OUVERTES.md` : inconnues classées par impact, hypothèse par défaut, méthode de vérification, paramètre à exposer.
> - `research/SPEC_DONNEES_SIMULATEUR.md` : schéma JSON consolidé que le simulateur chargera.

---

## Légende, statuts et clés de citation

**Statuts** (repris de toutes les notes) :

| Étiquette | Sens |
|---|---|
| **[V]** FAIT vérifié | Source primaire : données du client DOFUS 3 (API DofusDB, fichiers du client lus sur le CDN Cytrus) ou code du client DOFUS 2.73 décompilé. |
| **[R]** FAIT rapporté | Guide DPLN, propos des game designers, forum, vidéo. **[R·obs]** = mesure faite par nos agents sur des images de vidéo (recalage de grille, relevé de dégâts), répétée et recalculée. |
| **[H]** HYPOTHÈSE | Déduction non vérifiée ; toujours accompagnée d'un paramètre de simulateur quand elle a un impact. |

Confiance : **haute** / **moyenne** / **basse**.

**Clés de citation** utilisées dans ce document :

| Clé | Source |
|---|---|
| `DB sl<id>`, `DB sp<id>`, `DB mo<id>`, `DB st<id>` | `https://api.dofusdb.fr/spell-levels/<id>`, `/spells/<id>`, `/monsters/<id>`, `/spell-states/<id>` (extraction `research/raw/dofusdb/`, 373 sorts, 642 niveaux, revérifiée en direct : 0 différence) |
| `CLI3` | Client DOFUS 3 6.0_3.6.12.16 via `https://cytrus.cdn.ankama.com/cytrus.json` ; carte lue dans `mapdata_assets_world_534.bundle` (sha1 `7b8cdb95f1a1ac3bb8e65d73c37fc8a843a9eaa5`) |
| `CLI273` | Client DOFUS 2.73.3.14 `DofusInvoker.swf` (sha1 `92a0b228bd44bb5616a47601684171af77cffc21`), bibliothèque Haxe `damageCalculation` / `mapTools` décompilée (JPEXS) |
| `DPLN` | https://www.dofuspourlesnoobs.com/gladiatrool.html (mis à jour le 21/05/2026), texte et captures d'infobulles |
| `VOD` | https://www.twitch.tv/videos/2852548819 (twynetv, 21/08/2026, version 3.6, 15 combats dont 11 complets) |
| `GD` | AnkamaLive 2.73 du 10/09/2024 (propos des game designers), rediffusion commentée https://www.youtube.com/watch?v=CY_cgLRjkoM |
| Vidéos | cardxc `vmh1fJkhdCE`, Koza `ve5TVn_sJGo`, Zephiron `IKqnwLIYffk`, Khytrayer `FSlGkDE7ZOQ` (3.6), Huz `ShlRLUWn7VM` / `kGlKYY7_qew`, Isthos `Vwe_m7suH9A`, Houmilito `HSHSLHi5jQY`, Barbe Douce `v3cDvm3x4pw`, Mishurra `PxTtn2g9sx4` (URL `https://www.youtube.com/watch?v=<id>`) |
| `N1A`, `N1D`, `N1M` | `research/notes/1x_archetype_acrobate.md`, `…_dompteur.md`, `…_magicien.md` |
| `N20`, `N30`, `N40`, `N41`, `N50`, `N60`, `N70` | `research/notes/20_monstres_boss.md`, `30_mecaniques_scriptees.md`, `40_carte_positions.md`, `41_carte_donnees.md`, `50_sources_web.md`, `60_videos.md`, `70_formules_dofus.md` |
| `D:map`, `D:annot`, `D:fight`, `D:mon`, `D:acro`, `D:domp`, `D:mag`, `D:eff` | `research/data/map_139988488.json`, `map_annotations.json`, `fight_scripts.json`, `monsters.json`, `archetype_acrobate.json`, `archetype_dompteur.json`, `archetype_magicien.json`, `effects_semantics.json` |

Conventions : ids de cellules DOFUS 0–559 ; coordonnées MapPoint (x, y) ; « Tn » = tour global n ; « Vn » = vague n ;
« PA/PM/PO » = points d'action / de mouvement / portée ; « DF » = dommages finaux ; « DoPou » = dommages de poussée.

---

## 0. Résumé exécutif

1. **Carte de combat = map 139988488**, et non 139988485 (hall RP avec le trône de Monsieur Layool). 241 cases jouables en
   octogone 17 × 17 centré sur la **case 300**, **aucun obstacle**, aucune case qui bloque la ligne de vue : seules les entités
   bloquent. [V, haute — CLI3, N41, confirmé par 11 combats de la VOD, N40]
2. **Les pics** (sort 30390 « Glyphe de combat ») couvrent **96 cases jouables** : un anneau de 2 cases d'épaisseur le long du
   bord, plus 4 cases d'angle (160, 295, 305, 440). Il reste **145 cases sûres**. Toute poussée vers le bord se termine dans
   les pics (le glyphe n'arrête pas une poussée). [V, haute — DB sl80489, CLI3, CLI273]
3. **Effets des pics** [V, haute — DB sl80492, sl81026, sl81022, sl81025] :
   - **entrée** (marche, poussée, attirance, téléportation, échange) : **2 000 dégâts neutres** + état Vulnérable ; les
     **monstres** reçoivent en plus « Dommages subis ×200 % », soit **×2** sur tous les dégâts hors poussée, **tant qu'ils
     restent dedans** (posé après les 2 000, qui ne sont donc pas doublés) ;
   - **début de tour dedans** : **1 000** dégâts bruts, donc **2 000 pour un monstre** (×2) ;
   - **sortie** : Vulnérable + **×2 pendant 1 tour** (jusqu'au prochain tour du porteur), pour les joueurs **et** les trois
     Troolls, **pas** pour la Mama.
   - **Vulnérable = ×2** (et non « +200 % » = ×3 comme l'écrit DPLN) : prouvé par les données (effet 1163), le texte en jeu,
     deux vidéos et un relevé exact de la VOD (−9 904 = 2 000 + 2 × 3 952). [V+R·obs, haute]
   - **Point non tranché** : un **joueur** dans les pics n'est pas ×2 selon les données (le ×2 ne vise que le camp `Def`),
     et prend 1 000 (et non 2 000) au début de son tour. DPLN et une vidéo disent l'inverse. → paramètres du simulateur.
4. **Départ** : les 4 joueurs sont placés sur **286, 287, 314, 315**, les 4 voisines du centre 300. [V, haute]
5. **Déroulé** : 10 vagues, **une par tour global**, qui **s'accumulent** si on ne les tue pas. V8 = la Mama seule. **Victoire
   = tous les ennemis morts après l'apparition de V10** ; tuer la Mama ne suffit pas. Aucune limite de tours connue. [R haute
   + V pour l'état « combatCanFinish »]
6. **Vagues** : composition fixe (DPLN, confirmée par la VOD) ; **V1 toujours sur 242 et 358** ; les suivantes sont tirées
   dans un petit ensemble de cases fixes qui dépend de la vague et du type de monstre. 31 Troolls + la Mama = **832 000 PV**.
   [R·obs, haute pour V1–V3, moyenne ensuite]
7. **Archétypes** : tous à 30 000 PV, 8 PA, 4 PM, Force 6 000 (**tous les jets ×61**), Puissance 0, 1 000 DoPou, 10 % de
   critique, sorts neutres, **ni tacle ni fuite** (état 5970). Chacun démarre avec **Frappe Repoussoir** + 1 sort propre et
   gagne **6 autres sorts dans un ordre fixe**, un par objectif réussi. Améliorations et sorts uniques viennent des cadeaux.
   [V+R, haute]
8. **Monstres** (niveau 200, 0 % de résistance) : Troollibre 25 000 PV (mêlée, Inébranlable, pousse en anneau), Artroolleur
   19 000 PV (artillerie à 8 PO), Nitrooll 22 000 PV (soigne, pousse jusqu'à 4 fois, rend Inébranlable, échange). [V, haute]
9. **Mama Troollette** : 150 000 PV, 20 PA, 6 PM, Force 4 500. Attend sur la case **152** (gradins) de T1 à T7, **arrive au
   début de T8 sur 300** (repli observé : 287), puis à **chaque début de son tour** repousse jusqu'au bord (donc dans les
   pics, sans dommages de collision) tous les joueurs alignés avec elle et attire les Troolls alignés. **Invulnérable**, sauf
   pendant 1 tour après chaque **entrée** dans les pics ; dans les pics elle est ×2 → **≈ 74 000 de dégâts « de base » pour
   la tuer**. Ses DF : +25 % au départ, −5 % par objectif réussi. [V+R·obs, haute]
10. **Objectifs** : 6 au maximum ; le 1er est imposé (**Empalé** : tuer un ennemi Vulnérable) ; ensuite 5 paliers de 4
    objectifs soumis au vote. Chaque objectif donne le sort suivant à chaque joueur et retire 5 % de DF à la Mama. [V, haute]
11. **Acclamations** (bonus permanents) : au début des tours globaux T2 à T9, 3 cartes parmi les 6 de l'archétype. [V+R·obs]
12. **Cadeaux** (Glyphes Évènementiels) : 1 case parmi **272, 273, 299, 301, 327, 328, 329**, au début des tours T2–T9 (63
    fois sur 88 observées). Seuls les joueurs les déclenchent ; toute l'équipe choisit une amélioration ou un sort unique.
    [V+R·obs]
13. **Moteur** : formules portées depuis le client (dégâts tronqués à chaque étape, dégressivité de zone, poussée de
    **283 dégâts par case non parcourue** pour un archétype, cibles figées au lancement). L'aura des pics s'applique dès
    l'arrivée d'une poussée : **« pousser dans les pics puis frapper » = frappe déjà doublée**. [V+R·obs, haute]
14. **Stratégie** consensuelle (≥ 11 vidéos, forums) : **Acrobate en premier, Magicien en dernier** ; T1 : l'Acrobate envoie
    les deux Troollibres dans les pics (deux Videur depuis 314 ou 287), le Dompteur tue celui qui joue juste après ; ne
    jamais frapper une cible non Vulnérable si l'on peut l'éviter ; laisser mourir seul un Trooll ≤ 2 000 PV dans les pics ;
    au T7, quitter les lignes d'arrivée de la Mama et préparer le burst ; au T8, la mettre dans les pics et la tuer ; T9–T10
    : Dégagez ! puis Punition Collective / Pulsation Chaotique.
15. **Principales inconnues** pour la fidélité du simulateur (détail dans `QUESTIONS_OUVERTES.md`) : ordre exact de la
    timeline (place des Troolls apparus en cours de combat), IA des monstres, ×2 des joueurs dans les pics, loi de tirage
    des cases d'apparition et du contenu des fenêtres de choix.

---

## 1. Accès, cadre et règles générales

| Point | Valeur | Statut | Source |
|---|---|---|---|
| Lieu | Foire du Trool, arène en **[-9,-41]** ; PNJ Monsieur Layool sur le trône du hall RP (map 139988485) | [R]+[V] | DPLN I ; DB map-positions/139988485 ; N41 |
| Ticket | 1 Ticket du Gladiatrool, 5 000 kamas, Vendeuse de Tickets en [-11,-36] ; consommé même en cas d'échec | [R] haute | DPLN I ; N50 §10 |
| Niveau minimum | 50 ; le personnage est remplacé par l'archétype (équipement ignoré, sauf la Prospection selon Zephiron 24:00) | [R] | DPLN I-II ; N60 |
| Effectif | 1 à 4 joueurs ; « quasiment impossible » seul, « en galère » à 3, **équilibré pour 4** | [R] haute | DPLN ; GD 14:00, 61:00, 64:30 |
| Lancement | On parle une 2e fois au PNJ dans l'arène ; l'équipe rejoint comme un combat classique ; le combat se déroule sur la **map 139988488** | [R]+[V] | DPLN I ; N41 §2 |
| Durée de tour | **60 s** (effet 3407 du passif 30639) ; **10 s** au tour qui suit Pense Vite | [V] | DB sl80897, sl80843 |
| Pauses | chaque fenêtre de choix met le combat en pause ≈ 30 s | [R] | DPLN IV |
| Durée d'une run | 6–8 min (experts) à 25 min | [R] | N50 §3 ; N60 |
| Récompense | 2 Gladiatons + sac de 50 Troolotons par victoire (×2 Gladiatons depuis la 3.6 du 23/06/2026), bourse de 5 Gladiatons rare, familier Booftrool 0,5 % | [R] | DPLN VII ; notes de MàJ 3.6 (N50 §1) |
| Succès | aucun | [R] | GD 25:00 |

---

## 2. Déroulé du combat

### 2.1 Structure d'un tour global (ordre supposé)

L'ordre exact côté serveur n'est pas publié ; les éléments ci-dessous sont vérifiés individuellement, leur enchaînement est
une reconstitution **[H, moyenne]** fondée sur la VOD (N40 §4.1, §5.2, §6) et les données (N30 §4).

1. **(T2 à T9)** Fenêtre « Choisis une amélioration permanente ! » : chaque joueur choisit une Acclamation parmi 3 (choix
   individuel n° 17, sort 30658). Pas de fenêtre au T1 ni au T10. [V (sort) + R·obs (moments)]
2. **Apparition de la vague n** (T2–T7, T9, T10), écran assombri ≈ 3 s. Au T8 il n'y a pas d'apparition : c'est la Mama qui
   arrive, par son propre sort retardé. [R·obs, haute]
3. **(T2 à T9)** Un nouveau cadeau (rayon de lumière puis dalle orange) sur une case libre parmi 272, 273, 299, 301, 327,
   328, 329, dans ≈ 72 % des tours. [R·obs]
4. **Timeline** : la **Mama joue la première** (tours annulés de T1 à T6, voir §6.3 pour T7 ; arrivée + Rassemblement au T8 ;
   Rassemblement à chaque début de ses tours ensuite), puis joueurs et Troolls (§2.4).
5. **Pendant les tours** : effets des pics, déclencheurs d'objectifs ; dès qu'un objectif est validé, **pause et vote**
   (choix global n° 11 à 15) pour le suivant.
6. **Fin du tour global** : le serveur lance **30710 « Objectif Check »**, qui contrôle Soleil, Stop aux projectiles,
   Sauvez-le (contrôle puis nouvelle désignation), Tout va bien, Quintuplé (remise à zéro) et Solitude. [V (contenu, DB
   sl81060) ; moment = H forte]

### 2.2 Chronologie

| Moment | Événements | Statut / sources |
|---|---|---|
| Placement (T0) | Joueurs sur 286/287/314/315 ; Mama sur 152, visible dans les gradins et dans la timeline | [V] CLI3 ; [R·obs] VOD ; DPLN VI |
| Lancement | Choix d'archétype (choix n° 16, sort 30608) → passif 30644/30648/30649 (états 5899/5900/5901, apparence) + sort de départ (donné par le serveur, aucun sort client ne l'apprend) ; sorts de départ : joueurs 30639, Troolls 30694, Mama 30430 ; pose des pics 30390 ; objectif 30443 niv.1 (Empalé imposé) ; **V1 = 2 Troollibres sur 242 et 358** | [V] DB sp30608, sl80897, sl81002, sl80586, sl80489 ; [R·obs] VOD 11/11 |
| T1 | Pas de fenêtre de bonus, pas de cadeau | [R·obs] VOD |
| T2 → T7 | Bonus, vague n, cadeau (72 %), objectifs | [R·obs] |
| **T7** | Dernier tour avant la Mama : c'est pendant T7 qu'il faut se placer hors de ses lignes (« éviter la ligne d'arrivée au tour 7 ») | [R] DPLN VI ; vidéos |
| **T8** | Bonus, cadeau, **arrivée de la Mama au début de son tour** (première du tour global) sur **300** (287 si 300 est occupée), Rassemblement immédiat, puis tour complet de la Mama | [V] DB sl80835 (delay 7) ; [R·obs] VOD 11/11 |
| T9 | Bonus, cadeau, **V9** (5 monstres) ; les vagues continuent même si la Mama est morte | [R] cardxc 21:30 ; VOD |
| T10 | **V10** (6 monstres), pas de fenêtre de bonus ; 30577 « Finish Fight Trigger » pose l'état 5965 « combatCanFinish » (moment supposé) | [V] DB sl80790 ; [H] moment |
| T10/T11+ | Victoire dès que tous les ennemis sont morts ; pas de limite de tours connue | [R] GD 53:00 ; N50 §3 |

### 2.3 Vagues

Composition : **[R, haute]** DPLN II, concordance VOD (le nombre de nouvelles entités par vague est exactement celui de
DPLN dans la plupart des combats : N40 §2.3), vidéos (V1 = 2 Troollibres, V8 = Mama seule, V10 = 6 monstres). Aucune
donnée client ne décrit les vagues : aucun effet d'invocation des sorts 30370–30800 ne crée les Troolls, elles sont gérées par
le script serveur **[V, haute — N30 §9, D:fight.waves]**.

| Vague / tour | Composition | Entités | PV de la vague | PV cumulés | Cases observées (VOD, 11 combats) |
|---|---|---|---|---|---|
| V1 / placement | 2 Troollibres | 2 | 50 000 | 50 000 | **242 et 358** (11/11, déterministe) |
| V2 / T2 | 1 Troollibre + 2 Artroolleurs | 3 | 63 000 | 113 000 | Art : une parmi {187, 188}, une parmi {411, 412} ; Tl : une parmi {242, 358, 246} |
| V3 / T3 | 2 Nitroolls + 1 Artroolleur | 3 | 63 000 | 176 000 | Nit : 2 cases à distance 7 du centre ({290, 311, 255, 318, 283, 262}, souvent opposées) ; Art : un coin {187, 188, 411, 412} |
| V4 / T4 | 1 Nitrooll + 1 Artroolleur + 1 Troollibre | 3 | 66 000 | 242 000 | dispersé (231, 353 ×3 ; 218, 230, 247, 257, 298, 344, 356, 359, 370, 371 ×2 ; …) |
| V5 / T5 | 3 Troollibres | 3 | 75 000 | 317 000 | distance 2–4 du centre : 344 ×5, 298 ×4, 257, 260, 341, 342, 356 ×3, … |
| V6 / T6 | 3 Artroolleurs | 3 | 57 000 | 374 000 | anneau de distance 6 : 353 ×6, 386 ×6, 241 ×5, 218 ×4, 247 ×3, 204, 214, 359 ×2 |
| V7 / T7 | 3 Nitroolls | 3 | 66 000 | 440 000 | distance 4–5, par paires opposées : 370 ×7, 270 ×6, 330 ×5, 231, 371 ×3, 274 ×2 |
| V8 / T8 | Mama Troollette | 1 | 150 000 | 590 000 | arrive sur 300 (repli 287) |
| V9 / T9 | 1 Nitrooll + 2 Troollibres + 2 Artroolleurs | 5 | 110 000 | 700 000 | 214 ×8, 341 ×5, 370 ×5, 218, 260, 298 ×4, 241, 344 ×3, … |
| V10 / T10 | 2 Nitroolls + 2 Troollibres + 2 Artroolleurs | 6 | 132 000 | **832 000** | 218 ×6, 371 ×5, 244, 298, 359 ×4, … (480p seulement, 10 combats) |

Totaux : 11 Troollibres, 11 Artroolleurs, 9 Nitroolls + la Mama. Listes pondérées complètes et détail combat par combat :
`D:annot` (`monsterSpawnCells`, `perFightWaveSpawns`) ; tables PV : N20 §6.

**Règle d'apparition proposée [H, forte régularité observée]** (N40 §4.3) : les cases ne dépendent pas visiblement de la
position des joueurs ; à chaque vague, chaque monstre est posé sur une case tirée dans un ensemble fixe propre à son type et
à la vague :

| Type | Emplacements « lointains » | Emplacements courants | Rares |
|---|---|---|---|
| Troollibre | V1 {242, 358} ; V2 {242, 358, 246} | distance 2–4 (V4, V5, V9, V10) : 257, 344, 260, 341, 298, 356, 244, 342, 329, 284, 245 | 271, 286, 314, 315, 368, 230, 274, 370 |
| Nitrooll | V3 : 290, 311, 255, 318, 283, 262 (distance 7) | distance 4–5 (V4, V7, V9, V10) : 270, 330, 370, 231, 371, 230, 274, 355 | 316, 317, 425, 246, 313 |
| Artroolleur | V2, V3 : coins 187, 188, 411, 412 (distance 8 du centre, profondeur de bord 4, **k = 2** : une poussée de 2 bien orientée suffit) | distance 6 (V4, V6, V9, V10) : 214, 241, 218, 247, 204, 353, 359, 386 | 227, 367, 291, 372, 339, 219 |

Aucune apparition n'a été observée dans les pics. Le type n'est pas lisible dans la VOD (mode créature) : l'attribution
par type est déduite de la composition DPLN et des distances (**[H]**, très cohérente).

### 2.4 Ordre de jeu (timeline)

| Élément | Constat | Statut |
|---|---|---|
| Mama | Dans la timeline dès le début, « aura toujours l'initiative » : elle joue la **première** de chaque tour global | [R] DPLN VI ; [R·obs] VOD (arrivée au début du tour global) |
| Joueurs entre eux | Tous les archétypes ont la même initiative. **Correctif officiel du 14/01/2025 : ordre d'entrée dans le combat.** DPLN (2026) et Khytrayer (08/2026) : « ordre inverse de l'affichage du groupe » ; Zephiron : le premier qui parle au PNJ joue en premier | [R] haute (correctif) ; les deux descriptions sont compatibles si les membres d'un groupe entrent en ordre inverse |
| Joueurs vs Troolls | **Non établi.** La consigne unanime « tuer le Trooll qui joue juste après soi » (cardxc 06:30, Koza 04:30, Khytrayer 04:28, Huz 09:00) implique que les Troolls sont **intercalés** entre les joueurs | [R] (indirect) |
| Troolls apparus en cours de combat | Place d'insertion inconnue ; jusqu'à la 3.1 ils n'apparaissaient pas dans la timeline (bug), contournement « afficher les invocations » → ils sont peut-être gérés comme des invocations du scénario | [R] N50 §5 ; [H] |

**Modèle par défaut retenu pour le simulateur [H, moyenne]** : règle générale DOFUS d'alternance des équipes, l'équipe
monstre commençant (Mama en tête) : Mama, J1, M1, J2, M2, J3, M3, J4, M4, M5… ; les Troolls ordonnés par ordre
d'apparition (puis ordre d'apparition dans la vague) ; quand une équipe est épuisée, l'autre finit. Variantes à exposer :
tri des Troolls par initiative (Force : Troollibre 4 000 > Nitrooll 3 500 > Artroolleur 3 000), ou tous les monstres après
la Mama. À vérifier sur la VOD (timeline affichée) : voir `QUESTIONS_OUVERTES.md` Q1.

### 2.5 Arrivée du boss (résumé ; détail §6)

Le sort de départ de la Mama (30430) pose un « passe-tour » de durée 6 et un sort d'arrivée avec un **délai de 7** : avec
la règle client « les sorts lancés avant le premier tour ne sont pas décomptés au premier début de tour », cela donne une
arrivée au **début de T8**, observée dans 11 combats sur 11 et dans 6 vidéos. Le nom interne « Passe-tour + TP T5 » trahit
une version antérieure (arrivée à T5). [V DB sl80835, sl81182 ; R·obs VOD ; H pour le décompte, moyenne]

### 2.6 Victoire et défaite

- **Victoire** : tous les ennemis du camp `Def` (Troolls **et** Mama) morts **et** état 5965 « combatCanFinish » posé sur
  l'entité de scénario par 30577 (DB sl80790). Moment de 30577 : **[H]** après l'apparition de V10 (GD : « à partir du tour
  10 il n'y a plus de vague, vous pouvez gagner tour 10 ou tour 11 »). Tuer la Mama ne termine **pas** le combat (GD ;
  Isthos 06:55 ; Houmilito 2:05:00 → défaite ; Zephiron 21:30 ; Matspyder4). [V+R, haute]
- **Victoire au plus tôt** : T10, si V10 et tous les restes meurent pendant T10.
- **Défaite** : tous les joueurs morts ; gagner avec un seul survivant est possible (Fielon, Huz). [R, haute]
- **Limite de tours** : aucune (ni dans les données ni dans une source fiable ; l'idée « tout s'arrête au T11 » est une
  spéculation de Houmilito). [R/H, moyenne]

### 2.7 Fenêtres de choix

Les **identifiants** des listes sont dans les données ; leur **contenu** (cartes, probabilités, critères) est côté serveur.
[V ids — DB sp30608, sp30658, sp30657, sp30443 ; R contenu]

| Id | Type | Déclencheur | Contenu | Moment |
|---|---|---|---|---|
| 16 | individuel (3008) | 30608 « Choix d'Archétype » | 3 cartes : Dompteur, Acrobate, Magicien | lancement du combat |
| 17 | individuel (3008) | 30658 « Choix d'Amélioration » | 3 Acclamations parmi les 6 de l'archétype | début de T2 à T9 |
| 10 | individuel (3008) | 30657 niv.3 (cadeau) | 2 cartes : 2 sorts uniques, 2 améliorations ou 1 + 1 (DPLN) | quand un joueur déclenche un cadeau |
| 11–15 | **vote global** (3404) | 30443 niv.2–6, sur « Objectif N Fini » | objectifs du palier suivant (2 proposés dans les vidéos) ; majorité, **égalité → tirage au sort** (GD 49:00) | dès qu'un objectif est validé |

Le patch 3.5.14.18 (05/05/2026) a corrigé un blocage « quand un choix est proposé en fin de tour puis au début du tour
suivant » : un vote d'objectif peut donc précéder immédiatement la fenêtre de bonus. [R officiel, N50 §1]

---

## 3. La carte

### 3.1 Identification (preuves)

| Indice | 139988485 (hall RP) | **139988488 (combat)** | 139725313 (extérieur) |
|---|---|---|---|
| DofusDB map-positions | [-9,-41], « Arène du Gladiatrool », `outdoor=false` | [0,0], « Arène du Gladiatrool », `outdoor=true` (map d'instance) | [-9,-41] |
| Cases de placement | aucune | 4 rouges (286, 287, 314, 315) + 1 bleue (152) | aucune |
| Glyphe 30390 projeté | pas au bord de la zone marchable | 96 cases jouables = exactement l'anneau de bord | — |
| Dalles trouées (pics) du décor | 4 décoratives (207, 248, 486, 501) + trône central | **96**, identiques au glyphe | — |
| Recalage des images de la VOD | 316 points d'accord | **998 points d'accord** | 18 |

Conclusion : le combat se joue sur **139988488**, sans trône ni obstacle. [V+R·obs, haute — N41 §2, N40 §3]
La carte est lue directement dans le client DOFUS 3 (CDN Cytrus → catalogue Addressables → bundle
`mapdata_assets_world_534` → `mapData.cellsData[560]`, via UnityPy). DofusDB n'expose pas les cellules. La release DOFUS 2
publique ne contient ni 139988485 ni 139988488. [V, N41 §1]

### 3.2 Repère et formules

[V, haute — CLI273 `MapTools`, N70 §1, implémentations `tools/map/mapgeom.py` et `tools/mechanics/geometry.py`,
identiques sur les 560 cellules]

- Grille 14 colonnes × 40 demi-rangées (560 ids). `row = id // 14`, `col = id % 14` ; rangées impaires décalées d'une
  demi-case à droite.
- MapPoint : `x = (row+1)//2 + col`, `y = col − (row − (row+1)//2)` ; inverse `id = (x−y)·14 + y + (x−y)//2`.
  Centre **300 = (17, −4)**.
- À l'écran : +x = bas-droite, +y = haut-droite. Voisins = (x±1, y), (x, y±1) ; **distance = |dx| + |dy|** (PO, PM, zones).
- « En ligne » = même x ou même y ; « en diagonale » = |dx| = |dy|.
- 8 directions : impaires (1 SE, 3 SW, 5 NW, 7 NE) = axes MapPoint (déplacement, croix `X`, lancer en ligne) ; paires
  (0 E, 2 S, 4 W, 6 N) = diagonales MapPoint (un pas = 2 de distance).

### 3.3 Zone jouable, obstacles, ligne de vue

| Élément | Valeur | Statut |
|---|---|---|
| Cases jouables en combat (`mov && !nonWalkableDuringFight`) | **241** (x ∈ [9, 25], y ∈ [−12, 4]) | [V] CLI3 |
| Cases qui bloquent la LdV | 8, **uniquement autour de 152** (124, 137, 138, 151, 153, 165, 166, 180) ; **aucune dans l'arène** | [V] |
| Obstacles statiques | aucun | [V] |
| Obstacles dynamiques (« effets en temps réel » de DPLN) | aucun observé en 11 combats ; les GD disaient en 2024 que la « terraformation » n'était pas implémentée | [R·obs] + [R] GD 51:30 ; défaut : aucun |
| Graphe de déplacement | 4-connexe, 3,72 voisins en moyenne ; seules les entités bloquent passage et LdV | [V] |

### 3.4 Les pics : cellules exactes

**Source** : sort 30390 « Glyphe de combat », niveau 1 (DB sl80489), deux effets sur la **même liste explicite** (forme `;`)
de 102 ids (100 distincts, 351 et 455 en double) : effet **1091** « glyphe-aura » (entrée → 30390 niv.2) et effet **401**
« glyphe de début de tour » (→ 30390 niv.3), couleur #FF0000, masque `a,A`, durée −1 (tout le combat). [V, haute]

**Les 96 cases jouables** (identiques aux 96 dalles trouées du décor, contrôle photométrique AUC 0,98 sur le rendu et 0,96
sur la VOD) :

```
131 132 133 144 145 146 147 148 149 157 158 159 160 161 162 163 171 172 177 178 184 185 191 192
198 199 206 207 211 212 220 221 225 226 235 236 239 249 253 264 266 267 277 278 281 292 294 295
305 306 309 320 322 323 333 334 337 348 351 361 365 366 375 376 379 380 388 389 394 395 402 403
408 409 415 416 423 424 429 430 437 438 439 440 441 442 443 452 453 454 455 456 457 467 468 469
```

- **4 ids listés mais non marchables** : 250, 293, 321, 362 (bord droit à l'écran) : sans effet tant qu'ils restent non
  marchables. La liste est asymétrique (238, 280, 308, 350 ne sont pas listés) : erreur ou vestige de conception. [V ; H
  pour l'interprétation]
- **Géométrie** (profondeur de bord `edgeDepth` = distance à la première case non jouable) :

| edgeDepth | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| cases jouables | 48 | 44 | 40 | 32 | 28 | 24 | 16 | 8 | 1 (300) |
| dont pics | 48 | 44 | **4** (160, 295, 305, 440) | 0 | 0 | 0 | 0 | 0 | 0 |

- **Pics = toutes les cases à 1 ou 2 pas du bord + les 4 angles 160, 295, 305, 440.** 145 cases sûres. Le centre 300 est à
  **7 pas** du pic le plus proche ; les 4 cases de départ à **6 pas**. [V, haute]
- **Conséquence mécanique** : une poussée vers l'extérieur s'arrête contre le bord, sur une case de profondeur 1, **toujours
  dans les pics**. Les glyphes n'arrêtent pas une poussée (seuls pièges et murs le font, CLI273 `Mark.stopDrag`). [V]

### 3.5 Cases de départ

**286, 287, 314, 315** (`red` dans les données de carte), les 4 voisines de 300 ; le centre reste libre. Observé à chaque
combat de la VOD (14 débuts). Les joueurs choisissent leur case parmi les 4 pendant la phase de placement. [V+R·obs, haute]
Toutes les 4 sont alignées avec 300 : 286 et 315 sur l'axe y = −4, 287 et 314 sur l'axe x = 17.

### 3.6 Cases de la Mama

| Rôle | Case | Statut | Source |
|---|---|---|---|
| Attente T1–T7 | **152** = (17, 7), dans les gradins en haut à droite ; unique case bleue, isolée (`linkedZone` 32), `nonWalkableDuringFight`, entourée de 8 cases qui bloquent la LdV | [V] carte + [R·obs] capture DPLN `ark26gladia128` et VOD (icônes Faveur + invulnérabilité sur 152) | N41, N40 §5.1 |
| Arrivée T8 | **300** : codée en dur dans 30609 niv.3 (effet 2960 sur la cellule [300]), puis téléportation (effet 4, zone C63) | [V] DB sl80837, sl81100 ; [R·obs] 5 combats | N40 §5.2 |
| Repli si 300 occupée | **287** (3 combats et la capture DPLN `tuto2k-46`) ; règle générale inconnue (ni l'ordre `getCells` du client ni l'anneau 1 n'expliquent 287) | [R·obs] + [H] | N40 §5.2, N20 §4.1 |

**Lignes de poussée à l'arrivée** (tout joueur aligné est repoussé jusqu'au bord, dans les pics) [V+R·obs] :

- depuis **300** : axe x = 17 : 192, 206, 219, 233, 246, 260, 273, 287, **300**, 314, 327, 341, 354, 368, 381, 395, 408 ;
  axe y = −4 : 184, 199, 213, 228, 242, 257, 271, 286, **300**, 315, 329, 344, 358, 373, 387, 402, 416 ;
- depuis **287** : axe x = 17 (idem) et axe y = −3 : 171, 185, 200, 214, 229, 243, 258, 272, **287**, 301, 316, 330, 345,
  359, 374, 388, 403.
- Poussées observées : 300→408, 272→171, 246→192, 301→403, 329→416.

### 3.7 Cases des cadeaux (Glyphes Évènementiels)

**272 (−1,1), 273 (0,2), 299 (−1,−1), 301 (1,1), 327 (0,−2), 328 (1,−1), 329 (2,0)** (décalages depuis 300).
Fréquences sur 63 apparitions : 301 ×12, 327 ×12, 272 ×9, 299 ×9, 329 ×9, 328 ×8, 273 ×4. **Jamais 271 ni 300** (271
exclue : [H, basse] ; 300 exclue : plausible, c'est la case d'arrivée de la Mama). Les données ne contiennent pas ces cases
(le sort 30566 pose le glyphe sur la case ciblée par le serveur). [R·obs — N40 §6 ; V pour le sort — DB sp30566]
Plusieurs de ces cases sont sur les lignes de la Mama : 273 et 327 (x = 17), 329 (y = −4), 301 et 272 (y = −3).

### 3.8 Distances utiles

- **k = nombre de cases à parcourir en ligne pour atteindre le premier pic** (meilleure des 4 directions axiales), sur les
  145 cases sûres [V calcul, N1A §7.1] :

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| cases | 36 | 32 | 28 | 24 | 16 | 8 | 1 (300) |
| cumul | 25 % | 47 % | 66 % | 83 % | 94 % | 99 % | 100 % |

- Règle : une poussée axiale de n cases (sans obstacle) fait entrer la cible dans les pics si **n ≥ k** ; elle s'arrête au mur
  après `k + 1` cases (profondeur 2) ; le reste `n − (k + 1)` produit une collision (283 par case pour un archétype).
- Depuis le centre 300 : 8 pas axiaux jusqu'au bord (le 7e entre dans les pics) ; 6 pas diagonaux (le 5e entre). [V, N70 §5.2]
- V1 (242, 358) : **k = 3** vers l'extérieur sur l'axe y = −4. Les Artroolleurs de V2/V3 (187, 188, 411, 412) sont à
  **k = 2** (profondeur de bord 4 ; N40 §4.3 écrit à tort « profondeur 3 »). Les emplacements « distance 6 » des Artroolleurs
  (214, 241, 218, 247, 204, 353, 359, 386) et plusieurs emplacements de Nitrooll (255, 262) sont aussi à k = 2 ; les autres
  emplacements de V3 (290, 311, 318, 283) et 246 sont à k = 3. Les cases de départ sont à k = 6, le centre à k = 7.
  [V calcul sur `D:map`]

### 3.9 Schémas ASCII avec ids

**Vue A — repère MapPoint** (x vers la droite, y vers le haut ; rotation de 45° par rapport à l'écran). Chaque case =
symbole + id. `^` pics ; `.` case sûre ; `R` départ joueurs ; `M` 300 = arrivée de la Mama ; `1` apparition V1 ;
`g` case de cadeau observée ; `B` 152 = attente de la Mama ; `%` id listé dans le glyphe mais non marchable ;
`X` hors arène, bloque la LdV ; `#` hors arène.

```
         8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23   24   25   26
   8     #    #    #    #    #    #    #    #    X    X    X    #
   7     #    #    #    #    #    #    #    #    X B152    X    #    #
   6     #    #    #    #    #    #    #    #    X    X    X    #    #    #
   5     #    #    #    #    #    #    #    #    #    #    #    #    #    #    #
   4     #    #    #    #    #    # ^149 ^163 ^178 ^192 ^207 ^221 ^236 %250    #    #
   3     #    #    #    # ^133 ^148 ^162 ^177 ^191 ^206 ^220 ^235 ^249 ^264 ^278 %293    #
   2     #    #    # ^132 ^147 ^161 .176 .190 .205 .219 .234 .248 .263 ^277 ^292 ^306 %321    #
   1     #    # ^131 ^146 ^160 .175 .189 .204 .218 .233 .247 .262 .276 .291 ^305 ^320 ^334    #    #
   0     #    # ^145 ^159 .174 .188 .203 .217 .232 .246 .261 .275 .290 .304 .319 ^333 ^348 %362    #
  -1     # ^144 ^158 .173 .187 .202 .216 .231 .245 .260 .274 .289 .303 .318 .332 .347 ^361 ^376    #
  -2     # ^157 ^172 .186 .201 .215 .230 .244 .259 g273 .288 .302 .317 .331 .346 .360 ^375 ^389    #
  -3     # ^171 ^185 .200 .214 .229 .243 .258 g272 R287 g301 .316 .330 .345 .359 .374 ^388 ^403    #
  -4     # ^184 ^199 .213 .228 1242 .257 .271 R286 M300 R315 g329 .344 1358 .373 .387 ^402 ^416    #
  -5     # ^198 ^212 .227 .241 .256 .270 .285 g299 R314 g328 .343 .357 .372 .386 .401 ^415 ^430    #
  -6     # ^211 ^226 .240 .255 .269 .284 .298 .313 g327 .342 .356 .371 .385 .400 .414 ^429 ^443    #
  -7     # ^225 ^239 .254 .268 .283 .297 .312 .326 .341 .355 .370 .384 .399 .413 .428 ^442 ^457    #
  -8     #    # ^253 ^267 .282 .296 .311 .325 .340 .354 .369 .383 .398 .412 .427 ^441 ^456    #    #
  -9          # ^266 ^281 ^295 .310 .324 .339 .353 .368 .382 .397 .411 .426 ^440 ^455 ^469    #    #
 -10               # ^294 ^309 ^323 .338 .352 .367 .381 .396 .410 .425 ^439 ^454 ^468    #    #    #
 -11                    # ^322 ^337 ^351 ^366 ^380 ^395 ^409 ^424 ^438 ^453 ^467    #    #    #    #
 -12                         #    # ^365 ^379 ^394 ^408 ^423 ^437 ^452    #    #    #    #    #    #
 -13                              #    #    #    #    #    #    #    #    #    #    #    #    #    #
```

**Vue B — emplacements d'apparition par type** (même repère ; hors rares) : `t` Troollibre, `n` Nitrooll, `a` Artroolleur.

```
         8    9   10   11   12   13   14   15   16   17   18   19   20   21   22   23   24   25   26
   8     #    #    #    #    #    #    #    #    X    X    X    #
   7     #    #    #    #    #    #    #    #    X B152    X    #    #
   6     #    #    #    #    #    #    #    #    X    X    X    #    #    #
   5     #    #    #    #    #    #    #    #    #    #    #    #    #    #    #
   4     #    #    #    #    #    # ^149 ^163 ^178 ^192 ^207 ^221 ^236 %250    #    #
   3     #    #    #    # ^133 ^148 ^162 ^177 ^191 ^206 ^220 ^235 ^249 ^264 ^278 %293    #
   2     #    #    # ^132 ^147 ^161 .176 .190 .205 .219 .234 .248 .263 ^277 ^292 ^306 %321    #
   1     #    # ^131 ^146 ^160 .175 .189 a204 a218 .233 a247 n262 .276 .291 ^305 ^320 ^334    #    #
   0     #    # ^145 ^159 .174 a188 .203 .217 .232 t246 .261 .275 n290 .304 .319 ^333 ^348 %362    #
  -1     # ^144 ^158 .173 a187 .202 .216 n231 t245 t260 n274 .289 .303 n318 .332 .347 ^361 ^376    #
  -2     # ^157 ^172 .186 .201 .215 n230 t244 .259 .273 .288 .302 .317 .331 .346 .360 ^375 ^389    #
  -3     # ^171 ^185 .200 a214 .229 .243 .258 .272 R287 .301 .316 n330 .345 a359 .374 ^388 ^403    #
  -4     # ^184 ^199 .213 .228 t242 t257 .271 R286 M300 R315 t329 t344 t358 .373 .387 ^402 ^416    #
  -5     # ^198 ^212 .227 a241 .256 n270 .285 .299 R314 .328 .343 .357 .372 a386 .401 ^415 ^430    #
  -6     # ^211 ^226 .240 n255 .269 t284 t298 .313 .327 t342 t356 n371 .385 .400 .414 ^429 ^443    #
  -7     # ^225 ^239 .254 .268 n283 .297 .312 .326 t341 n355 n370 .384 .399 .413 .428 ^442 ^457    #
  -8     #    # ^253 ^267 .282 .296 n311 .325 .340 .354 .369 .383 .398 a412 .427 ^441 ^456    #    #
  -9          # ^266 ^281 ^295 .310 .324 .339 a353 .368 .382 .397 a411 .426 ^440 ^455 ^469    #    #
 -10               # ^294 ^309 ^323 .338 .352 .367 .381 .396 .410 .425 ^439 ^454 ^468    #    #    #
 -11                    # ^322 ^337 ^351 ^366 ^380 ^395 ^409 ^424 ^438 ^453 ^467    #    #    #    #
 -12                         #    # ^365 ^379 ^394 ^408 ^423 ^437 ^452    #    #    #    #    #    #
 -13                              #    #    #    #    #    #    #    #    #    #    #    #    #    #
```

**Vue C — orientation écran** (rangées 8 à 34, rangées impaires décalées ; même légende que la vue A) :

```
r08   #112  #113  #114  #115  #116  #117  #118  #119  #120  #121  #122  #123  X124  #125
r09      #126  #127  #128  #129  #130  ^131  ^132  ^133  #134  #135  #136  X137  X138  #139
r10   #140  #141  #142  #143  ^144  ^145  ^146  ^147  ^148  ^149  #150  X151  B152  X153
r11      #154  #155  #156  ^157  ^158  ^159  ^160  ^161  ^162  ^163  #164  X165  X166  #167
r12   #168  #169  #170  ^171  ^172  .173  .174  .175  .176  ^177  ^178  #179  X180  #181
r13      #182  #183  ^184  ^185  .186  .187  .188  .189  .190  ^191  ^192  #193  #194  #195
r14   #196  #197  ^198  ^199  .200  .201  .202  .203  .204  .205  ^206  ^207  #208  #209
r15      #210  ^211  ^212  .213  .214  .215  .216  .217  .218  .219  ^220  ^221  #222  #223
r16   #224  ^225  ^226  .227  .228  .229  .230  .231  .232  .233  .234  ^235  ^236  #237
r17      #238  ^239  .240  .241  1242  .243  .244  .245  .246  .247  .248  ^249  %250  #251
r18   #252  ^253  .254  .255  .256  .257  .258  .259  .260  .261  .262  .263  ^264  #265
r19      ^266  ^267  .268  .269  .270  .271  g272  g273  .274  .275  .276  ^277  ^278  #279
r20   #280  ^281  .282  .283  .284  .285  R286  R287  .288  .289  .290  .291  ^292  %293
r21      ^294  ^295  .296  .297  .298  g299  M300  g301  .302  .303  .304  ^305  ^306  #307
r22   #308  ^309  .310  .311  .312  .313  R314  R315  .316  .317  .318  .319  ^320  %321
r23      ^322  ^323  .324  .325  .326  g327  g328  g329  .330  .331  .332  ^333  ^334  #335
r24   #336  ^337  .338  .339  .340  .341  .342  .343  .344  .345  .346  .347  ^348  #349
r25      #350  ^351  .352  .353  .354  .355  .356  .357  1358  .359  .360  ^361  %362  #363
r26   #364  ^365  ^366  .367  .368  .369  .370  .371  .372  .373  .374  ^375  ^376  #377
r27      #378  ^379  ^380  .381  .382  .383  .384  .385  .386  .387  ^388  ^389  #390  #391
r28   #392  #393  ^394  ^395  .396  .397  .398  .399  .400  .401  ^402  ^403  #404  #405
r29      #406  #407  ^408  ^409  .410  .411  .412  .413  .414  ^415  ^416  #417  #418  #419
r30   #420  #421  #422  ^423  ^424  .425  .426  .427  .428  ^429  ^430  #431  #432  #433
r31      #434  #435  #436  ^437  ^438  ^439  ^440  ^441  ^442  ^443  #444  #445  #446  #447
r32   #448  #449  #450  #451  ^452  ^453  ^454  ^455  ^456  ^457  #458  #459  #460  #461
r33      #462  #463  #464  #465  #466  ^467  ^468  ^469  #470  #471  #472  #473  #474  #475
r34   #476  #477  #478  #479  #480  #481  #482  #483  #484  #485  #486  #487  #488  #489
```

Figures : `research/figures/map_139988488_schematic.png` (grille numérotée sans décor),
`research/figures/40_carte_positions_schema.png` (fréquences d'apparition par vague et cadeaux),
`research/figures/map_139988488_grid.txt` (4 vues dont la profondeur de bord). L'overlay
`map_139988488_overlay.png` (non versionné : il contient un recadrage du rendu DofusDB, art © Ankama ; régénérable avec `tools/map/build_gladiatrool_map.py`).

---

## 4. Archétypes

### 4.1 Socle commun

**Corps** : monstre **7980 « Gladiatroolleur »** (niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6 000, sort 30416) ; sort de départ
**30639 « Gladiatrooller »** [V — DB mo7980, sl80897 ; identification = H forte] :
- état **5970** : ne tacle pas et ne peut pas être taclé → **aucun tacle** dans le Gladiatrool (corrige l'exemple « ratio
  0,5 » de N70 §6.2) ;
- durée de tour 60 s ; passif **30700** (vulnérabilité à la sortie des pics) ;
- bonus conditionnels **+3 000 Puissance** (Dompteur), **+5 000 Vitalité** (Acrobate), **−5 000 Vitalité** (Magicien)
  **non appliqués** : le passif est lancé au début du combat, avant le choix d'archétype, et ses critères `*E5899/5900/5901`
  échouent. Preuves : 4 relevés de dégâts du Dompteur dans la VOD exacts à ×61 et impossibles à ×91 (12 078, 12 688, 5 124,
  5 185) ; infobulle Videur à ×61 ; capture DPLN d'un Acrobate transformé à 30 000 PV. [V+R·obs, haute pour la Puissance ;
  moyenne pour les PV, aucune source ne montrant un Magicien transformé]

| Stat | Valeur retenue | Source |
|---|---|---|
| PV | 30 000 (options : Acrobate 35 000, Magicien 25 000) | DPLN ; DB mo7980 ; N1A §1.2, N1M §1.2 |
| PA / PM / PO | 8 / 4 / +0 | DPLN ; DB mo7980 |
| Force → multiplicateur | 6 000 → **×61** sur les jets de **dégâts et de soins** (soins neutres 3001 boostés par la Force) | DPLN ; CLI273 |
| Puissance | 0 (option 3 000 pour le Dompteur) | R·obs VOD (N1D §12) |
| Dommages de poussée | 1 000 → **283 par case** non parcourue (niv. 200) | DPLN ; Barbe Douce 00:04 ; CLI273 |
| Critique | 10 % (taux effectif = taux du sort + 10 ; un sort à 0 % ne critique jamais) | DPLN ; CLI273 `SpellWrapper` |
| Résistances, DF, érosion | 0 %, 100 %, érosion de base 10 % | N70 §4.3 |
| Élément | neutre pour tous les sorts | DPLN |
| Tacle / fuite | sans objet (état 5970) | DB sl80897 |

**Sort commun Frappe Repoussoir** (30416, DB sl80499) : 3 PA, PO 1–6 modifiable, LdV, pas en ligne, 2/tour, critique 30 %
(40 % effectif). Effets : poussée **2** (masque `a,A`, alliés compris) **puis** 16–20 dégâts (masque `j,A` : ennemis et
invocations alliées) ; crit 21–25. Dégâts **976–1 220** (crit 1 281–1 525), espérance 1 220 ; ×2 sur Vulnérable. Aucune
amélioration. DPLN « 1 200 » ✓. [V, haute]

**Obtention des sorts** (30626 « Spell Manager », niveau = palier de l'objectif réussi ; effet 3405 filtré par l'état
d'archétype) — ordre **toujours identique**, confirmé par DPLN et les vidéos [V, haute — N30 §7.1] :

| Emplacement | Source | Dompteur | Acrobate | Magicien |
|---|---|---|---|---|
| 0 | commun | Frappe Repoussoir 30416 | idem | idem |
| 1 | départ (serveur) | Impact 30395 | Videur 30402 | Pulsation d'Énergie 30409 |
| 2 | objectif palier 1 (Empalé) | Grondement Grandissant 30396 | Hanedimane 30408 | Regain Vigoureux 30410 |
| 3 | palier 2 | Prélèvement 30397 | Voltige 30404 | Amplification 30411 |
| 4 | palier 3 | Détonation 30398 | Aïronemane 30405 | Protection Prolongée 30414 |
| 5 | palier 4 | Coup de Sang 30399 | Pugnace 30406 | Délivrance 30415 |
| 6 | palier 5 | Jaillissement 30400 | Soutien Stratégique 30403 | Vents Contraires 30412 |
| 7 | palier 6 | Ombre Fracassante 30401 | Va-t-en-guerre 30407 | Vague de Dégradation 30413 |

Attention : les numéros internes « Sort N » (adminName) ne suivent pas cet ordre (ex. Hanedimane = « Sort 7 »).

**Améliorations** (sorts « Amélioration : X » 30469–30491, proposées par les cadeaux) : pose un état « boostedSpell »,
**désapprend** le niveau de base (3406) et **apprend** le niveau amélioré (3405). C'est un nouveau sort : l'intervalle de
relance repart de zéro (DPLN ✓). [V]

**Sorts uniques** : 6 par archétype + **Pense Vite** commun ; tous **5 PA**, sans critique, **usage unique** (ils se
désapprennent eux-mêmes, 3406). [V]

**Pense Vite** (30615, DB sl80843) : tour suivant fixé à **10 s** (3407 = 10), **+999 PA** au tour suivant (délai 1, durée
1), retrait en fin de ce tour. Les limites par tour et par cible restent actives. DPLN et la bêta disaient 15 s ; Khytrayer
(3.6) lit 10 s. En pratique ≈ 3 sorts utiles à cause des animations (Houmilito 2:55:30 ; Huz « 2/3 des actions »). [V+R]

**Masques et effets d'affichage** : chaque effet porte `forClientOnly`. Les effets `forClientOnly = true` sont **affichés
dans l'infobulle mais non exécutés** par le serveur (ex. la poussée 3 affichée de Videur est un effet d'affichage : la vraie
poussée est dans le sous-sort 30689). Le simulateur ne doit exécuter que les effets réels. [V, haute — N1A §2.1, N1D §1]

### 4.2 Acrobate (interne « Baroudeur ») — le placeur

Rôle : envoyer les Troolls dans les pics **avant** qu'ils jouent et avant les frappes des Dompteurs ; il joue **en premier**.
Choix : 30648 (état 5900). Sources : N1A, D:acro, DB spell-levels cités. « m » = PO modifiable.

| Sort (id → amélioré ; spell-levels) | Obtention | PA | PO | Ligne / LdV | Tour / cible / intervalle | Crit | Zone normal → amélioré | Effets réels (normal) | Amélioration (données) |
|---|---|---|---|---|---|---|---|---|---|
| **Videur** 30402 → 30567 (80507 → 80766) | départ | 4 | 1–5 m | oui / oui | 2 / – / 0 | 30 % | T2 (5 cases) → T3 (7) | 1160 → **30689** sur chaque combattant (`a,A`) de la ligne T : **poussée 3 depuis le lanceur** ; puis 59–63 aux ennemis (crit 72–77) → **3 599–3 843** (crit 4 392–4 697), E ≈ 4 050 | T3 ; poussée **4** ; jets inchangés |
| **Hanedimane** 30408 → 30574 (80513 → 80784) | palier 1 | 3 | 1–3 m | oui / oui | 1 / – / 0 | 0 | F2 (10) → F3 (13) | 1160 → **30693** sur chaque combattant de la fourche : ennemis **repoussés de 4**, alliés **attirés de 4** | F3 ; **6** |
| **Voltige** 30404 → 30570 (80510 → 80775) | palier 2 | 4 | 1–5 → **1–7** m | non / oui | 2 / 1 / 0 | 0 | P (case occupée ; plus requis une fois amélioré) | **échange de positions** (allié ou ennemi) puis 58–62 si ennemi → 3 538–3 782 | PO 7 ; lancers **2** (DPLN : 3) |
| **Aïronemane** 30405 → 30571 (80522 → 80778) | palier 3 | 3 | 1–5 m | non / **non**, case libre | – / – / 1 | 0 | X1 (5) | **téléporte le lanceur**, puis repousse de **2** les 4 voisins (`g,A`) depuis le centre | poussée **4** (description : 6 ; DPLN : 5 > 6) |
| **Pugnace** 30406 → 30572 (80511 → 80780) | palier 4 | 2 | 0 | – | – / – / 2 | 0 | soi | **Inébranlable** + 25 % résistance, 1 tour | 50 % |
| **Soutien Stratégique** 30403 → 30569 (80509 → 80773) | palier 5 | 3 | 1–8 m | non / non, case libre | – / – / 1 | 0 | X5 + « + »5 (41) → X7 + « + »7 (57) | invoque le **Poutch** 7985, puis **attire de 4** vers lui les ennemis des 8 demi-droites | Poutch 7986, attirance 6, renvoi en C3 |
| **Va-t-en-guerre** 30407 → 30573 (80512 → 80782) | palier 6 | 2 | 1–6 m | oui / oui | 2 / 1 / 0 | 0 | P | le **lanceur avance de 2** vers la cible (1042) | 4 |

Uniques de l'Acrobate (5 PA, usage unique) [V — N1A §5] :

| Sort | PO | Effets réels | Remarques |
|---|---|---|---|
| **Dégagez !** 30604 (80828) | 0 | +1 000 DoPou au lanceur (3 tours) **puis** repousse de **5** tous les ennemis de la carte (hors Mama pré-combat, état 5971), depuis le lanceur | 533 par case non parcourue ; meilleur unique selon les joueurs (T9–T10, « Au coin ! », « Faire le mur », « Trous dans les Troolls ») |
| **Courage, fuyons** 30605 (80829) | 0 | +4 PM à tous les alliés, 2 tours | — |
| **Immortalité du Courageux** 30616 (80844) | 1–63, sans LdV, case occupée | seuil **1 PV** sur le lanceur 2 tours ; interception des dommages (765) des alliés en cercle 2 autour de la cible, 2 tours ; le lanceur **avance de 63** vers la cible ; état Endolori 5967 | DPLN « 1 % des PV » ; conseillé au T7 (Laltoss) |
| **Malédiction Mouvante** 30617 (80845) | 0 | pendant 1 tour, quand un ennemi (hors 5971) subit des dommages, **l'attaquant** le repousse de 2 (30676) | frapper depuis le côté opposé aux pics |
| **Chamboulement** 30618 (80846) | 1–63, sans LdV | poussée **5** (l'infobulle affiche 6) ; si la cible subit des dommages de poussée ou en meurt, **rebond** unique sur un autre ennemi non marqué | cible du rebond (le plus proche ?) : H |
| **Un pour un** 30619 (80847) | 0 | 2 tours : dommages subis **×50 %** ; renvoi de 100 % des dommages finaux subis à l'attaquant | DPLN omet la réduction |
| **Pense Vite** 30615 | 0 | voir §4.1 | commun |

Géométrie clé (vérifiée par simulation sur la carte, N1A §7.2) : au T1, **depuis 314**, Videur sur **256** attrape 242 et
l'envoie en **199** (pics) et Videur sur **372** attrape 358 et l'envoie en **402** ; **depuis 287**, Videur sur 229 et sur
345 donnent le même résultat. Depuis 286 ou 315, une des deux lignes est bloquée par un allié. La ligne T permet de toucher
une cible hors axe ; à partir de 3 cases de portée, toute la ligne est poussée parallèlement à l'axe (« bulldozer »).

### 4.3 Dompteur (interne « Gladiateur ») — le damage dealer

Rôle : transformer les mises en pics en morts ; frappe au milieu de la mêlée sans jamais blesser un allié (masques `A,j`).
Choix : 30644 (état 5899). Sources : N1D, D:domp.

| Sort (id → amélioré ; spell-levels) | Obtention | PA | PO | Ligne / LdV | Tour / cible / intervalle | Crit | Zone normal → amélioré | Effets réels (normal) et dégâts ×61 | Amélioration (données) |
|---|---|---|---|---|---|---|---|---|---|
| **Impact** 30395 → 30558 (80500 → 80748) | départ | 4 | 1–5 | non / oui | 2 → **3** / – / 0 | 30 % | C2 (13) → **C3 (25)** | 68–74 (crit 82–89), **un seul coup par cible** (le 1er effet est d'affichage) → centre **4 148–4 514** (crit 5 002–5 429), −10 %/case | C3 ; 3 lancers/tour |
| **Grondement Grandissant** 30396 → 30560 (80501 → 80751) | palier 1 | 4 | 1–6 | non / oui | – / – / **2** | 30 % | X1 (5) → X3 (13) | 82–92 (crit 98–110) → 5 002–5 612 ; buff **+20 de base** à la relance exactement 2 tours plus tard (délai 2, durée 1) → **6 222–6 832** | X3 ; un effet 406 en tête retire probablement le +20 avant la frappe (H) |
| **Prélèvement** 30397 → 30561 (80502 → 80754) | palier 2 | 3 | 1–6 | non / **non** | 3 → 4 / 2 → 3 / 0 | 30 % | P ; en **critique** : C2 → C3 | érosion **+15 %** (2 tours, cumul 3) puis **vol de vie** 42–50 (crit 50–60) → 2 562–3 050 ; soin 50 % des PV retirés ; sans cible, n'agit qu'en critique | érosion 20 % **permanente**, cumul illimité (non annoncé) |
| **Détonation** 30398 → 30562 (80503 → 80756) | palier 3 | 4 | 1–6 | **oui** / oui | 1 / – / 0 | 30 % | R1,1 (3 × 2) → R2,1 (5 × 2) | **+5 de base par ennemi dans la zone** (sous-sort 30417 ; l'infobulle « +10 » est un affichage) puis 38–42 (crit 46–50) → 2 623–2 867 (1 ennemi) à 4 148–4 392 (6) | R2,1 |
| **Coup de Sang** 30399 → 30563 (80504 → 80758) | palier 4 | 4 | 1–5 | non / oui | – / – / 2 | 0 | C2 sans dégressivité → C3 **avec** 10 % | **20 % des PV courants du lanceur**, non boostable : 6 000 à PV pleins (**12 000 sur Vulnérable**) ; coût −10 % PV courants (malus soignable) | C3 + dégressivité (non annoncée) |
| **Jaillissement** 30400 → 30564 (80505 → 80760) | palier 5 | 5 | 1–5 | non / oui | – / – / 3 | 0 | G1 (9) → G2 (25, dégr.) | **40 % des PV érodés du lanceur** (non boostable) : faible (≈ 2 000 par cible pour 50 000 PV perdus) | **référence cassée** : 30475 apprend le niveau 80750, inexistant |
| **Ombre Fracassante** 30401 → 30565 (80506 → 80762) | palier 6 | 2 | 1–5 | **oui** / oui | – / – / 1 | 0 | F2 (10) → F3 (13, dégr.) | **30 % des PV érodés de chaque cible** (non boostable) : Mama après 100 000 PV perdus à 50 % d'érosion → 15 000 (30 000 dans les pics) | F3 + dégressivité |

Tableaux de dégâts par distance, normal / critique / Vulnérable : N1D §5. Espérances sur cible Vulnérable (centre, 40 %
de critique) : Impact **9 370**, GG 11 444 (13 884 boosté), Prélèvement ≈ 6 050, Détonation 5 880 (1 cible) à 8 930 (6).

Uniques du Dompteur [V — N1D §6] :

| Sort | PO | Effets réels | Valeurs |
|---|---|---|---|
| **Relâchement de Fureur** 30611 (80839) | 1–63 fixe, sans LdV | 187–202 (crit 237–252), crit 30 % ; **+25 de base à 4 débuts de tour** (buff 30624, posé par le serveur à l'obtention, plafond +100) | à +100 : 17 507–18 422 ; **35 014–36 844 sur Vulnérable** (crit 41 114–42 944) ; E ≈ 38 400 (Vulnérable) |
| **Pulsation Chaotique** 30612 (80840) | 1–63 fixe | frappe la cible (deux fois), puis rebondit sur l'ennemi **non marqué le plus proche**, **+20 de base par rebond** ; crit 0 | k-ième cible : (35–42 + 20(k−1)) × 61 ; à lancer sur le plus faible |
| **Punition Collective** 30602 (80826) | 0 | 94–106 à **tous** les ennemis (hors Mama pré-combat), sans dégressivité | 5 734–6 466 ; **11 468–12 932** sur Vulnérable |
| **Galvanisation** 30603 (80827) | 0 | **+4 PA** à tous les alliés, 2 tours, crédités immédiatement ; cumulable (22 PA observés) | — |
| **Malédiction Collatérale** 30613 (80841) | 0 | 1 tour : chaque ennemi frappé (hors poussée) renvoie **50 %** des dommages finaux subis à ses alliés en C2 | capture DPLN « 100 % » ; chaînes possibles (H) |
| **Immortalité du Berserker** 30614 (80842) | 0 | seuil 1 PV jusqu'au prochain tour, renouvelé s'il a tué | — |

### 4.4 Magicien (interne « Guérisseur ») — le support

Rôle : soins de zone, boucliers, PA/PM de groupe, Amplification des Dompteurs, malus ; joue **en dernier** (soigne après
les dégâts, ses boucliers couvrent tout le tour ennemi). Choix : 30649 (état 5901). Sources : N1M, D:mag.

| Sort (id → amélioré ; spell-levels) | Obtention | PA | PO | Ligne / LdV | Tour / cible / intervalle | Crit | Zone normal → amélioré | Effets réels (normal) | Amélioration (données) |
|---|---|---|---|---|---|---|---|---|---|
| **Pulsation d'Énergie** 30409 → 30575 (80514 → 80786) | départ | 3 | 0–5 m | non / oui | 2 / – / 0 | 30 % | soin C2 (13) → C3 (25) ; dégâts P | **44–48 soins** aux alliés (`a`) du cercle + **44–48 dégâts** à l'ennemi de la case (crit 53–58) → 2 684–2 928 (crit 3 233–3 538), E 3 038 ; ×2 sur Vulnérable | C3 |
| **Regain Vigoureux** 30410 → 30576 (80515 → 80788) | palier 1 | 2 | 0 | – / non | – / – / **4** | 0 | C3 centré sur le lanceur → **tous** | **+2 PA, +2 PM**, 2 tours | **+3/+3 à tous** |
| **Amplification** 30411 → 30578 (80516 → 80791) | palier 2 | 2 | 0–8 m | non / oui | 2 / 1 / 0 | 0 | P (allié) | état Amplifié (4 tours) ; 3 tours selon l'archétype de la cible : **Dompteur +20 % DF et +30 % critique** ; **Acrobate +500 DoPou** ; **Magicien +20 % soins** | **+40 % / +50 % / +1 000 / +40 %** (description et DPLN fausses) |
| **Protection Prolongée** 30414 → 30584 (80519 → 80800) | palier 3 | 2 | 0–6 m | non / oui | 2 / 1 / 0 | 0 | P | **bouclier 3 000** (1 tour) + soin 44–48 **au début des tours** de la cible (2 déclenchements) | 5 000 ; soin 53–58 |
| **Délivrance** 30415 → 30585 (80521 → 80802) | palier 4 | 2 | 1–6 m | **oui** / oui | 1 → 3 / – → 1 / 0 | 0 | P | désenvoûte (seulement `dispellable = 1` : retire Patroolleur/Tambour, pas Vulnérable ni les buffs de la Mama) | 3/tour |
| **Vents Contraires** 30412 → 30579 (80517 → 80793) | palier 5 | 3 | 1–8 m | non / oui | 1 / – / 0 | 30 % | −PM : X1 → X2 | 46–52 à l'ennemi de la case (crit 55–62) → 2 806–3 172 ; **−2 PM non esquivables** (1 tour) en croix | −3 PM, X2 |
| **Vague de Dégradation** 30413 → 30580 (80518 → 80795) | palier 6 | 2 | 1–7 m | non / oui | – / – / 2 | 20 % | C2 → C3 | **+15 % érosion** (1 tour) ; 21–28 à la case (crit 25–34) ; **−15 % DF** (1 tour) | 30 % / 30 %, C3 |

Uniques du Magicien [V — N1M §5] :

| Sort | PO | Effets réels | Valeurs |
|---|---|---|---|
| **Influx de Vitalité** 30606 (80830) | 0 | 284–312 soins à **tous** les alliés, sans dégressivité | **17 324–19 032** par allié |
| **Muraille collective** 30622 (80850) | 0 | **bouclier 15 000** à tous les alliés, 1 tour (jusqu'au prochain tour du Magicien) | 60 000 PV effectifs |
| **Démotivation des troupes** 30607 (80832) | 0 | **−35 % DF**, 2 tours, à tous les ennemis **sans l'état 5971** (la Mama n'est ciblable qu'après son entrée) | Mitroollette de la Mama à 5 objectifs : 4 278–4 968 → 2 780–3 229 |
| **Ultime Espoir** 30623 (80851) | 0–63 | sur un autre allié : soin 100 % PV max ; sur soi : **ressuscite le dernier allié mort à 50 %** | case de réapparition inconnue |
| **Immortalité du Bienfaiteur** 30620 (80848) | 1–63 (pas soi) | seuil 1 PV permanent ; au seuil : soin 50 % PV max puis dissipation | DPLN « 1 % » |
| **Malédiction Régénérante** 30621 (80849) | 0 | 1 tour : chaque ennemi frappé soigne de **100 %** des dommages subis les alliés à **≤ 2 cases** de lui | description et DPLN : 50 %, « tous les alliés » |

Timing (règle client : un buff de durée n posé par X perd 1 au début de chaque tour de X) : les boosts du Magicien joué en
dernier profitent aux autres à partir du tour suivant ; ses boucliers de durée 1 couvrent **tous** les tours ennemis
jusqu'à son prochain tour. Cycles conseillés : Amplification **T1 / T5 / T9** (couvre T8), Regain **T3 puis T7** (relance au
T5 au plus tôt après T1, intervalle 4), Muraille au **T7**. [V+H, N1M §2.4, §8.3]

### 4.5 Acclamations de la foule (bonus permanents)

Chaque carte (30592–30637) exécute le niveau correspondant de l'accumulateur 30589 (Dompteur), 30590 (Acrobate) ou 30591
(Magicien) ; bonus **permanent et cumulable**. 3 cartes proposées parmi les 6 de l'archétype, du T2 au T9 (8 au maximum).
[V valeurs — N30 §6 ; R tirage]

| Archétype | PA | PM | PO | 4e carte | 5e carte | 6e carte |
|---|---|---|---|---|---|---|
| Dompteur | +1 PA (30592) | +1 PM (30593) | +1 PO (30632) | **+10 % DF** (30594) | **+500 dommages critiques** (30633) | **+20 % critique** (30634) |
| Acrobate | +1 PA (30595) | +1 PM (30596) | +1 PO (30635) | **+10 % résistance** tous éléments (30597, plafond joueur 50 %) | **+200 DoPou** (30636 ; +50 par case) | **+10 % résistance mêlée** (30637) |
| Magicien | +1 PA (30598) | +1 PM (30599) | +1 PO (30629) | **+5 000 Vitalité** (30600) | **+20 % soins finaux** (30630) | **+15 % résistance distance** (30631 ; DPLN : 10 %) |

Risque de **double application** : la carte applique son bonus **et** lance l'accumulateur qui applique le même bonus ; les
vidéos ne montrent pas de doublement (défaut : simple, option). [V + H basse, N30 §6]

---

## 5. Monstres (fiches)

### 5.1 Vue d'ensemble

[V, haute — DB mo7981–mo7986 ; fiches en jeu identiques sur les captures DPLN `ark63gladia63–65` ; N20 §2]

| id | Nom | Niv. | PV | PA | PM | Force (×) | Rés. | Esq. PA/PM | Sorts | Sort de départ |
|---|---|---|---|---|---|---|---|---|---|---|
| 7981 | **Troollibre** | 200 | 25 000 | 11 | 6 | 4 000 (×41) | 0 % | 0/0 | Troollpoline 30380, Aspiratrooll 30381, Patroolleur 30382 | 30694 Trooler |
| 7982 | **Artroolleur** | 200 | 19 000 | 11 | 5 | 3 000 (×31) | 0 % | 0/0 | Tir d'Artroollerie 30383, Mortrooll 30384 | 30694 |
| 7983 | **Nitrooll** | 200 | 22 000 | 12 | 5 | 3 500 (×36) | 0 % | 0/0 | Double Trooll 30385, Coup de Trooll 30386, Trooll de Magie 30387, Troollement de Tambour 30388 | 30694 |
| 7984 | **Mama Troollette** | 1000 (fiche en jeu : 200) | 150 000 | 20 | 6 | 4 500 (×46) | 0 % | **20/20** | 30389, 30392, 30393, 30394 | 30430 |
| 7985 / 7986 | Stratège Dompteur (le **Poutch** de l'Acrobate) | 200 | 5 500 | 0 | 0 | 0 | 0 % | 0/0 | — | 30421 / 30568 |

Tous : `canBePushed`, `canSwitchPos`, `canBeCarried` vrais ; tacle et fuite 0 ; érosion 10 % ; critique 0 (seul le taux du
sort compte) ; `isBoss = false` (drapeau de bestiaire, sans effet). Masques `a,A` sur plusieurs sorts (Aspiratrooll, Tir,
Double Trooll, Catastrooll) : un Trooll peut techniquement toucher un autre Trooll (défaut : non ciblé par l'IA).

### 5.2 Passif commun « Trooler » (30694) et pics

- 30700 : à la **perte** de l'état 5902 (sortie des pics) → Vulnérable + ×2 pendant 1 tour (30701) ;
- 30754 : contrôle d'Empalé à la mort ; animation de mort. [V — DB sl81002]
- **PV effectifs d'un Trooll poussé dans les pics** = (PV − 2 000) / 2 : Troollibre **11 500**, Artroolleur **8 500**,
  Nitrooll **10 000**. Un Trooll à **≤ 2 000 PV** qui commence son tour dans les pics **meurt seul** (cardxc 11:00, 14:30 ;
  Khytrayer 13:04). [V calcul + R]

### 5.3 Troollibre (7981) — mêlée et placement

| Sort | Coût / portée / limites | Effets (normal / **critique**) | Dégâts calculés (×41) | DPLN | Écart |
|---|---|---|---|---|---|
| **Troollpoline** 30380 (80483) | 4 PA · PO 0 · 1/tour · crit 40 % | anneau **C2 min 1** autour de lui : 100–116 puis **repousse 3** / 120–139 | 4 100–4 756 à 1 case (crit 4 920–5 699), E 4 781 ; 2 cases −10 % ; avec Patroolleur E 5 497 | « 6 000 » | DPLN surestime (6 000 = critique + Patroolleur) |
| **Aspiratrooll** 30381 (80484) | 3 PA · PO 1–2 · LdV · 3/tour · **1/cible** · crit 30 % | **attire 2**, puis 65–75 **vol de vie**, puis +10 % érosion 1 tour / 78–90 | 2 665–3 075 (crit 3 198–3 690), E 3 042 | « attire d'une case », « 3 500 » | attire **2** |
| **Patroolleur** 30382 (80485) | 2 PA · PO 0 · intervalle **3** | sur soi : **+15 % DF** (2 tours) ; **Inébranlable** (1 tour) | — | ✓ | Inébranlable bloque poussée et attirance, **pas** l'échange ni la téléportation |

Menace par tour sur une cible (Patroolleur → Aspiratrooll → Troollpoline) : **E ≈ 9 000**, ≈ 18 000 sur Vulnérable.
**À pousser avant son premier tour** : ensuite il est Inébranlable pendant toute la ronde des joueurs suivante (voir aussi
Voltige ou Délivrance). [V calcul, N20 §3.2]

### 5.4 Artroolleur (7982) — artillerie

| Sort | Coût / portée / limites | Effets | Dégâts (×31) | DPLN | Écart |
|---|---|---|---|---|---|
| **Tir d'Artroollerie** 30383 (80486) | 3 PA · PO 1–8 · LdV · 2/tour · **1/cible** · crit 30 % | 56–65 puis **repousse 2** / 67–77 | 1 736–2 015 (crit 2 077–2 387), E 1 982 | « 2 000 », 2/tour | ✓ (1 par cible non dit) |
| **Mortrooll** 30384 (80487) | 4 PA · PO 1–8 · LdV · **intervalle 2** · crit 40 % | **C3**, ennemis : 81–95 / 101–117, −10 %/case | centre 2 511–2 945 (crit 3 131–3 627), E 2 988 | « 1 fois par tour » | **1 tour sur 2** |

Menace ≈ 5 000 par tour avec Mortrooll (≈ 2 000 sinon). C'est la **cible la plus rentable** : 8 500 PV effectifs dans les pics
et apparition à k = 2 des pics (V2/V3 aux coins, puis anneau de distance 6). Le tuer valide « Stop aux projectiles » et facilite « Distance d'insécurité ».

### 5.5 Nitrooll (7983) — soutien et poussées

| Sort | Coût / portée / limites | Effets | Valeurs (×36) | DPLN | Écart |
|---|---|---|---|---|---|
| **Double Trooll** 30385 (80490) | 3 PA · PO 1–2 · LdV · 3/tour · 1/cible · crit **60 %** | 32–38 **deux fois**, puis **repousse 3** / 42 + 42 | 2 × 1 152–1 368 (crit 2 × 1 512), E 2 822 | « 3 000 ×2 », « repousse 2 » | surestimé ; poussée **3** |
| **Coup de Trooll** 30386 (80493) | 2 PA · PO 1–6 **en ligne** · LdV · 2/tour · 1/cible | **repousse 3** (aucun dégât hors collision, 33 par case) | — | ✓ | — |
| **Trooll de Magie** 30387 (80494) | 3 PA · PO 1–6 · LdV · 2/tour · 1/cible · crit 30 % | **soin** 56–65 à un allié ou lui-même (boosté par la Force) / 67–77 | 2 016–2 340, E 2 302 ; ≈ 4 600/tour | « 2 000 » | ✓ |
| **Troollement de Tambour** 30388 (80496) | 3 PA · PO 1–6 · LdV · intervalle 2 | **échange** avec un allié (`g`, pas lui-même), puis **Inébranlable** 1 tour sur cet allié | — | ✓ | peut viser la Mama → explique « Mama Inébranlable » (Houmilito) [H forte] |

**Multiplicateur de difficulté** : jusqu'à 4 poussées de 3 par tour, ≈ 4 600 de soins, Inébranlables qui annulent les plans
de l'Acrobate → **cible prioritaire** quand il est présent (V3, V4, V7, V9, V10). [analyse N20 §8]

### 5.6 Poutch (Stratège Dompteur 7985/7986)

Invocation de Soutien Stratégique (Acrobate) — **pas** l'entité des vagues. 5 500 PV, 0 PA, 0 PM, ne joue pas. Sort de départ
30421 (30568 amélioré) : dommages reçus d'un allié ×50 % ; quand un **Dompteur** (état 5899) le frappe, il renvoie **50 % des
dommages initiaux** aux ennemis à 1–2 cases (C2 min 1 ; C3 amélioré), ×2 sur les Vulnérables ; tue tout autre Poutch allié
(un seul par équipe). Durée de vie : illimitée ou 1 tour (sort 30420 « Mort » jamais référencé) → [H basse]. Jugé inutile
par les joueurs (Koza 10:00). [V — N1A §3.7, N20 §5]

### 5.7 Menace par vague (borne haute, une cible, hors pics)

[V calcul — N20 §6] V1 ≈ 18 000 ; V2 ≈ 18 900 ; V3 ≈ 10 600 ; V4 ≈ 16 800 ; **V5 ≈ 27 000** ; V6 ≈ 14 900 ; V7 ≈ 8 500
(+ jusqu'à 12 poussées de 3) ; V8 (Mama) ≈ 18 900 ; **V9 ≈ 30 800** ; **V10 ≈ 33 600**. Tout est ×2 sur un joueur
Vulnérable. Un archétype a 30 000 PV : des vagues **non nettoyées** deviennent létales dès V5.

### 5.8 IA des monstres

**Aucune donnée client** (IA serveur). Observations [R] : les Troolls **passent leur tour** quand ils sont dans les pics ou
que les joueurs sont loin (cardxc 12:30, 14:30 ; sspritenL ; Zephiron 11:00) ; les Artroolleurs frappent à distance ; les
Troollibres sont souvent Inébranlables dès T1 ; le Nitrooll soigne ; la Mama peut concentrer tous ses sorts sur un joueur à
son arrivée (−20 000 / −21 000 : Huz, Matspyder4).

**Politique proposée** (paramétrable, `D:mon.aiModel`) [H, basse-moyenne] :
- commun : ne jamais entrer volontairement dans les pics ; dans les pics sans sortie utile, ne pas bouger ; cible = ennemi
  atteignable ce tour qui maximise les dégâts (à défaut le plus proche) ; si rien n'est atteignable, avancer ou passer ;
- Troollibre : Patroolleur si un ennemi est atteignable → Aspiratrooll sur une cible à 2 cases → Troollpoline si l'anneau
  1–2 contient un ennemi → Aspiratrooll sur d'autres cibles ;
- Artroolleur : rester à 3–8 cases avec LdV ; Mortrooll sur la case qui touche le plus de joueurs (1 tour sur 2) ; Tir sur 2
  cibles en préférant les poussées vers les pics ;
- Nitrooll : soin de l'allié le plus blessé → Tambour sur un allié menacé (dans ou près des pics) → Double Trooll / Coup de
  Trooll en poussant vers les pics ;
- Mama : Catastrooll si ≥ 2 joueurs dans l'étoile 6 → Mitroollette sur la case qui touche le plus de joueurs → Uppertrooll ×3
  → Troollooportation ×2 au contact du joueur le plus bas en PV.

---

## 6. Boss : Mama Troollette (7984)

### 6.1 Fiche

150 000 PV, niveau 1000 (données et GD ; la fiche en jeu affiche « Niv. 200 »), 20 PA, 6 PM, Force 4 500 (×46), esquive
PA/PM 20/20, 0 % de résistance. En pratique 7 lancers par tour au maximum (2 + 3 + 1 + 1) : ce sont les limites de lancer,
pas les PA, qui la bornent. [V — DB mo7984 ; N20 §4]

### 6.2 Script (sort de départ 30430, DB sl80586)

[V, haute — DB sl81182, sl80835–80837, sl81100, sl80591, sl80931, sl80934, sl80935, sl81097–81099, sl80932–80933]

| Sort | Rôle | Détail |
|---|---|---|
| 30750 « Passe-tour » | attente | état **5971** « Mama Trooll (pré fight) » (non déplaçable, non échangeable, exclue des sorts à masque `e5971`) et **140 « Tour annulé »**, durée **6** |
| 30609 « Passe-tour + TP T5 » | arrivée | niv.1 : retire 30750 et lance le niv.2, **délai 7** ; niv.2 : lance le niv.3 et installe 30432 ; niv.3 : effet 2960 sur la cellule **[300]** ; niv.4 : **téléportation** (effet 4, zone C63), puis retire 30609/30750 |
| 30432 « Rassemblement Troollesque » | début de chacun de ses tours | niv.1 : buff `TB` permanent ; niv.2 → niv.3 → niv.4 en croix **X63** (min 1) autour d'elle : état 5918 « Grabbed » (joueurs) → **attire de 63** ses alliés (`g`, les Troolls) → **repousse de 63 sans dommages** (effet 1103) les joueurs (`A`) → contrôle de l'objectif Attirance |
| 30724 « Faveurs de la foule » | départ | état **5973 « V »** + **+25 % DF** permanents |
| 30659 (via chaque récompense d'objectif) | objectifs | un cran de moins (V → IV → III → II → I → aucun) et **−5 % DF** permanent, **sans condition** ; n'agit que si la Mama est vivante (masque `F7984`) |
| 30723 « Délock » | invulnérabilité | état **56 « Invulnérable »** permanent (0 dommage) ; déclencheur `EON5902` (entrée dans les pics) → **désactive l'état 56 pendant 1 tour** |
| 30718 | mort | état 6024 « Mama Trooll Dead » sur chaque joueur (sans usage connu) |

### 6.3 Avant son arrivée (T1–T7)

Elle est sur **152**, première de la timeline, tour annulé. **Décompte [H, moyenne]** : avec la règle client (sorts lancés
avant T1 non décomptés au premier début de tour), le délai 7 tombe au **T8** (conforme aux observations) et la durée 6 du
passe-tour et de l'état 5971 expire au **début de son T7**. Au T7 elle n'est donc plus « pré-combat » et son tour n'est plus
annulé, mais elle est coincée sur 152 sans ligne de vue : aucune action n'a été observée. Conséquences : les objectifs à
masque `e5971` (Au coin !, Tout le monde veut prendre sa place…) peuvent la compter au T7 ; en théorie un Catastrooll lancé
depuis 152 pourrait attirer un joueur placé sur l'axe x = 17 (233, 219) vers les pics 206/192 (jamais observé, défaut :
aucune action au T7).

### 6.4 Arrivée (début de T8)

Téléportation sur **300** (repli observé 287), Rassemblement immédiat (observé dès l'arrivée), puis **tour complet**. Elle
« saute et pousse tout le monde en ligne vers les pics » (cardxc 19:30, Isthos 05:55, Mishurra 06:47, Koza 17:00) ; parfois
« rien de spécial » (Huz 17:01, personne aligné). Peut tuer un joueur plein de vie (−20 000 / −21 000). **Bug rapporté** (2
sources : cardxc 19:30, sspritenL) : un joueur poussé **sur un cadeau** interrompt l'animation, annule ses dégâts et elle
passe son tour. [V+R]

### 6.5 Rassemblement : règles pour le moteur

Sur chacune des 4 demi-droites MapPoint partant d'elle : (1) attirer les Troolls contre elle (jusqu'au premier obstacle) ;
(2) repousser les joueurs jusqu'au premier obstacle ou au bord, donc **dans les pics** (2 000 + Vulnérable), **sans dommages
de collision**. Un Trooll attiré peut devenir l'obstacle qui arrête un joueur (ordre intra-sort [H]). Un Trooll attiré
**hors** des pics devient ×2 pendant 1 tour (30701). L'effet 1103 n'est pas une poussée « forcée » : Pugnace (Inébranlable)
devrait le bloquer [H moyenne]. [V — DB sl80935 ; N20 §4.2]

### 6.6 Invulnérabilité et pics

- Invulnérable (0 dommage) tant qu'elle n'est pas **entrée** dans les pics ; à l'entrée : **fenêtre d'un tour** (jusqu'au
  début de son prochain tour, soit le reste du tour global puisqu'elle joue en premier) et **×2** tant qu'elle reste dedans
  (camp `Def`). [V]
- **Elle n'a pas le passif 30700** : à la sortie, pas de ×2 résiduel. [V]
- Pour rouvrir une fenêtre : la faire **sortir puis ré-entrer** (pas de nouvel `EON` tant qu'elle reste dans l'aura). [V+H]
- Ordre à l'entrée : l'état 5902 est le premier effet du niveau 2, donc l'invulnérabilité est probablement levée **avant**
  les 2 000 d'entrée (elle les subit) [H moyenne]. Au début de son tour suivant, l'invulnérabilité revient (décompte) avant le
  glyphe de début de tour (ordre client supposé) → les 1 000 ×2 seraient absorbés [H].
- Si elle est Inébranlable (Tambour d'un Nitrooll), la poussée est impossible mais l'**échange (Voltige)** et la
  téléportation restent possibles. [V+R]

### 6.7 Faveur de la foule

| Objectifs réussis | 0 | 1 | 2 | 3 | 4 | 5 | 6 [H] |
|---|---|---|---|---|---|---|---|
| État affiché | V | IV | III | II | I | — | — |
| DF de la Mama | **125 %** | 120 % | 115 % | 110 % | 105 % | 100 % | 95 % |
| Menace sur 1 cible (E, + Catastrooll) | 18 908 | 18 256 | 17 604 | 16 952 | 16 300 | 15 648 | 14 995 |

La Faveur s'additionne aux autres DF : Catastrooll +20 %, Démotivation −35 %, Vague de Dégradation −15/−30 %. DPLN dit
« cumulable 5 fois » ; les données ne plafonnent pas. [V + H pour le 6e]

### 6.8 Sorts de combat

Valeurs **sur un joueur à 0 % de résistance**, hors Faveur / sous Faveur V (×1,25) / Faveur V + Catastrooll (×1,45).
[V calcul — N20 §4.5, N30 §8.8]

| Sort | Coût / portée / limites | Effets | Dégâts | DPLN | Écart |
|---|---|---|---|---|---|
| **Troollooportation** 30389 (80488) + 30391 (80491) | 1 PA · PO 1–6 · LdV · **case libre** · 2/tour · crit 30 % | se **téléporte**, puis 60–70 (crit 72–84) en **X1** autour de la nouvelle case (−10 % au contact) ; les dégâts affichés par 30389 sont un affichage | contact : 2 484–2 898 / **3 105–3 622** / 3 601–4 202 | « 3 500 » | ✓ sous Faveur V |
| **Uppertrooll** 30392 (80495) | 1 PA · PO 1–2 · LdV · 3/tour · 1/cible · crit 30 % | 46–54 **vol de vie**, puis **repousse 6** | 2 116–2 484 / **2 645–3 105** / 3 068–3 601 ; collision 133/case (niv. 1000) ou 33 (niv. 200) | « 3 000 » | ✓ sous Faveur V |
| **Mitroollette de Poings** 30393 (80497) | 1 PA · PO 1–8 · LdV · 1/tour · crit 30 % | **C3** : 93–108 (crit 111–129), −10 %/case | centre **4 278–4 968** / 5 347–6 210 / 6 203–7 203 | « 4 500 » | DPLN = valeur **hors** Faveur |
| **Catastrooll** 30394 (80498) | 1 PA · PO 0 · intervalle 2 | **attire de 5** toutes les entités (`a,A`) d'une **étoile *6** ; **+20 % DF** sur soi, durée 0 | — | « Castatrooll », étoile 5, attire 4 | nom, taille et distance ; durée du +20 % : reste du tour [H] |

Séquence la plus dangereuse sur **une** cible (Catastrooll → Mitroollette → Uppertrooll → Troollooportation ×2) : E ≈
**18 900** sous Faveur V, ≈ 15 650 sans Faveur, **≈ 37 800 sur un joueur Vulnérable**. Avec l'entrée dans les pics
provoquée par le Rassemblement (+2 000), cela concorde avec les −20 000 / −21 000 observés. [V calcul + R]

**Piège Vulnérable** : un joueur qui **sort** des pics reste ×2 jusqu'au début de **son** prochain tour ; or la Mama joue en
premier au tour global suivant → ≈ 38 000, soit un one-shot. Ne pas sortir des pics juste avant qu'elle joue. [H déduit des
données, moyenne]

### 6.9 La tuer (budget)

- Entrée dans les pics : −2 000 (non doublés) → reste 148 000 ; ×2 dans les pics → **≈ 74 000 de dégâts « de base »**, à
  infliger pendant la fenêtre (le reste du tour global). [V calcul]
- Estimations d'espérance sur la Mama Vulnérable (N1D, N1M) : Relâchement de Fureur à +100 : ≈ 38 400 (≈ 48 000 avec
  Amplification : +20 % DF, 70 % de critique) ; Impact 9 370 (11 900 amplifié) ; Grondement 11 444 (13 884 boosté) ; Videur
  8 100 ; Voltige 7 300 ; Pulsation 6 080 ; Vents 6 440 ; Ombre Fracassante 30 % des PV érodés ×2 (jusqu'à ≈ 30 000 si elle
  est érodée à 50 % après 100 000 PV perdus).
- **A-D-D-M** : 2 Relâchements amplifiés (≈ 96 000) + 1 Impact par Dompteur avec +2 PA de Regain lancé au T7 (≈ 24 000) +
  Voltige (≈ 7 300) + 2 Pulsations (≈ 12 000) ≈ **140 000** : juste en dessous de 148 000 en espérance ; avec Galvanisation
  (+4 PA) ou Pense Vite lancé au T7, le kill au T8 devient probable. Cohérent avec les vidéos (2 Relâchements suffisent :
  Zephiron 26:30, Khytrayer 14:30 ; « −140 000 en un tour » avec Pense Vite, Huz 19:14). [calcul + R]
- **A-A-D-M** : un seul Relâchement → kill au T8 seulement avec Pense Vite/Galvanisation, sinon au T9 après une nouvelle
  entrée dans les pics (Koza : « le même tour, sinon au tour suivant »).
- **Voltige depuis les pics** est la façon la plus sûre de l'y mettre (Acrobate dans les pics → échange : elle entre, il sort ;
  marche même si elle est Inébranlable ; valide aussi « Toi, par ici, et toi, par là »). Coût : l'Acrobate prend 2 000 et reste
  ×2 jusqu'à son prochain tour.

---

## 7. Objectifs

### 7.1 Mécanique

[V, haute — DB sp30443, sp30626, sp30659, sl81060 ; N30 §5]

- **30443 « Objectif »** : niv.1 impose **Empalé** (objectif 1) ; chaque état « Objectif N Fini » (5906–5910) ouvre un
  **vote** (3404, id 10 + N) sur les objectifs du **palier N + 1** ; « Objectif 6 Fini » ne déclenche rien → **6 objectifs au
  maximum**, un seul actif à la fois.
- **21 objectifs** = 1 + 5 paliers de 4 (1 Général, 1 Acrobate, 1 Dompteur, 1 Magicien). Le palier est une propriété de
  l'objectif et fixe le sort débloqué → ordre des sorts toujours identique.
- **Récompense commune** : Spell Manager au niveau du palier (chaque joueur apprend son sort suivant) ; Faveur de la Mama −1
  cran, −5 % DF ; « Objectif N Fini » → vote suivant ; nettoyage.
- Vote : majorité, égalité tirée au sort (GD 49:00) ; 2 objectifs proposés dans les vidéos (Khytrayer 02:47, cardxc 04:00)
  [R] ; le contenu exact de la proposition est serveur.
- Zephiron n'a plus rien eu après Tout va bien (palier 5), alors que les données prévoient un palier 6 → critères
  d'apparition serveur ou observation erronée [H].

### 7.2 Les 21 objectifs

Termes : « Challenger » = l'allié dont c'est le tour (état 5917) ; TE = fin de tour ; FTG = fin du tour global (30710).
Conditions reconstituées dans les sorts [V, haute sauf mention], textes DPLN IV concordants. Faisabilité / recommandation =
synthèse des vidéos (N50 §8.5, N60 §4.6) et de l'analyse [H].

| Pal. | Objectif (orientation, sort) | Condition exacte | Évaluation | Faisabilité / recommandation |
|---|---|---|---|---|
| 1 | **Empalé** (imposé, 30428) | un ennemi **meurt en portant Vulnérable** (5994), quel que soit le tueur (y compris les 2 000 des pics à son tour) | à la mort | automatique au T1 (mise en pics + Dompteur) |
| 2 | 1,2,3, Soleil ! (Général, 30434) | chaque joueur vivant **finit son tour sur sa case de début de tour** | FTG | lent (exige un tour global complet après le vote) et contraignant : à éviter |
| 2 | Attention, sol glissant (Acrobate, 30497) | un ennemi **meurt de dommages de poussée** (XPD) | à la mort | collision 283/case (533 avec Dégagez !) sur un ennemi affaibli : possible mais aléatoire |
| 2 | Meurtres en série (Dompteur, 30463) | le **même allié achève 2 ennemis** pendant son tour | à la mort | faisable avec des Troolls Vulnérables ; morts par pics non attribuées (H) ; bugs rapportés |
| 2 | **Productivité** (Magicien, 30542) | un allié **lance 3 sorts** pendant son tour | à chaque lancer (jeton `CAP`, H forte) | **le meilleur** : Magicien Regain + 2 Pulsations (dès le T1 si Empalé tombe avant son tour et si le sort appris est utilisable aussitôt, H) |
| 3 | **Ébranlable** (Général, 30496) | un ennemi **meurt en état Inébranlable** (157) | à la mort | facile : Troollibres sous Patroolleur, alliés d'un Nitrooll |
| 3 | **Stop aux projectiles** (Dompteur, 30520) | **aucun Artroolleur vivant** à la FTG | FTG | se valide **seul** quand il n'y a plus d'Artroolleur (tuer ceux de V2/V3 ; V5, V7, V8 n'en ont pas) |
| 3 | Toi, par ici, et toi, par là (Acrobate, 30528) | pendant le tour d'un allié, un ennemi **entre** dans les pics **et** un allié **en sort** | pendant le tour | **Voltige depuis les pics** (l'allié sorti devient ×2 un tour) |
| 3 | Sauvez-le ! (Magicien, 30462) | l'allié désigné (le plus blessé) a **100 % de ses PV** à la FTG | FTG (contrôle puis nouvelle désignation) | difficile (Huz : un mort) : à éviter |
| 4 | Tout le monde veut prendre sa place (Général, 30450) | au début de son tour, l'allié marque la case de l'ennemi **le plus éloigné** ; un allié doit **finir son tour sur cette case** | fin du tour de l'allié | il faut déloger ou tuer l'ennemi puis s'y placer (Voltige y place l'Acrobate) ; jugé peu rentable |
| 4 | Faire le mur (Acrobate, 30500) | **3 ennemis différents** subissent des dommages de poussée pendant le tour d'un allié | pendant le tour | Dégagez !, ou poussées sur des ennemis à k ≤ 2 |
| 4 | Pas le temps de dire « Aïe » (Dompteur, 30512) | tuer pendant son tour un ennemi qui avait **100 % de ses PV au début de ce tour** | à la mort | cible : monstre qui vient d'apparaître ; demande 19–25 k dans le tour d'un seul joueur |
| 4 | Distance d'insécurité (Magicien, 30531) | au TE d'un allié, **chaque Artroolleur** est à ≤ 3 cases d'un allié | TE | **vrai par vacuité** sans Artroolleur |
| 5 | Attirance (Général, 30449) | **tous** les joueurs vivants attrapés par **un même** Rassemblement | au Rassemblement (T8+) | coûteux (tout le monde dans les pics) |
| 5 | Trous dans les Troolls (Acrobate, 30505) | **4 ennemis différents entrent** dans les pics pendant le tour d'un allié | pendant le tour | Dégagez !, Hanedimane + Videur sur un groupe |
| 5 | D'une pierre trois coups (Dompteur, 30511) | **3 ennemis meurent** entre deux lancers de sort de l'allié actif (compteur au Challenger, quel que soit le tueur) | pendant le tour | Punition Collective / Pulsation Chaotique sur un paquet affaibli |
| 5 | **Tout va bien** (Magicien, 30524) | à la FTG, aucun joueur à **≤ 50 %** de ses PV | FTG | simple en début de combat (soins du Magicien en dernier) |
| 6 | Solitude (Général, 30439) | à la FTG, la Mama est vivante **sans aucun allié** | FTG | possible **avant T8** si tous les Troolls sont morts (la Mama sur 152 compte) [H] |
| 6 | Quintuplé (Dompteur, 30510) | **5 ennemis tués par des joueurs** dans un même tour global | à chaque mort, RAZ à la FTG | T9–T10 |
| 6 | Au coin ! (Acrobate, 30515) | au TE d'un allié, **tous les ennemis vivants sont dans les pics** (hors Mama pré-combat) | TE | Dégagez ! quand il reste peu d'ennemis ; bloqué au T7 par la Mama sur 152 [H] |
| 6 | Même pas mal (Magicien, 30535) | un joueur **subit un sort de la Mama sans perdre de PV** | quand la Mama inflige des dommages | bouclier (Protection 3 000/5 000, Muraille 15 000) ; T8+ seulement |

Sémantique de trois jetons restée [H] : `CAP` (le porteur lance un sort), `V#`/`v#` (seuils ≤ / >), `Atq`/`Def`.
Compteurs : états 5944–5954 réutilisés ; les critères E/e d'un sort-compteur sont évalués **avant** le lancer [H forte].

### 7.3 Recommandations de vote (synthèse)

- Objectif principal : **5 objectifs avant T8** (Mama à 100 % de DF et 5 sorts supplémentaires par joueur) ; un 6e après
  l'arrivée de la Mama (95 %).
- Palier 2 : **Productivité** ≫ Meurtres en série > Sol glissant > Soleil.
- Palier 3 : **Stop aux projectiles** (auto) ou **Ébranlable** ; Toi par ici si l'Acrobate a Voltige ; éviter Sauvez-le.
- Palier 4 : **Distance d'insécurité** (auto sans Artroolleur) ou Pas le temps de dire Aïe ; Faire le mur avec Dégagez !.
- Palier 5 : **Tout va bien** ; Trous dans les Troolls avec Dégagez ! ; éviter Attirance.
- Palier 6 : Solitude (si réalisable avant T8), Au coin !, Quintuplé (T9–T10), Même pas mal (T8, bouclier).
- Les runs rapides n'en font que 2–3 (Khytrayer 03:05) ; le simulateur doit mesurer ce que chaque objectif rapporte (sort +
  −5 % Mama) contre ce qu'il coûte en placement et en PA.

---

## 8. Glyphes évènementiels (cadeaux), améliorations et sorts uniques

### 8.1 Cadeau

- **Pose** : 30566 « Glyphe Événementiel », effet 1165, couleur #FFBE00, zone P1, masque **`Atq,A`** (seuls les joueurs le
  déclenchent), posé par l'entité de scénario ; durée « 1 tour du poseur », qui ne joue pas → le cadeau **persiste** jusqu'à
  ce qu'on le prenne ; plusieurs peuvent coexister (cardxc 21:00). [V — DB sp30566 ; R]
- **Déclenchement** : marcher dessus **ou y être poussé** (sspritenL). 30657 niv.1 → niv.2 sur tous les joueurs → niv.3 :
  animation, **choix n° 10 pour chaque joueur**, dissipation du cadeau (2018). Toute l'équipe en profite (DPLN ✓). [V+R]
- **Contenu** (DPLN) : 2 sorts uniques, 2 améliorations de sorts possédés, ou 1 + 1 ; les uniques n'ont pas d'amélioration.
  [R]
- **Cases / moment** : §3.7 et §2.1 (T2–T9, ≈ 72 %). [R·obs]
- **Bugs rapportés** : sort amélioré ou obtenu parfois **grisé jusqu'au tour suivant** (Koza 07:30, sspritenL, Willseir ;
  correctif partiel 21/01/2025 ; conseil : prendre le cadeau en début de tour global) ; en bêta, valider un objectif avec
  Dégagez ! donnait plusieurs exemplaires du sort. Joueur poussé sur un cadeau par la Mama : voir §6.4. [R]

### 8.2 Améliorations : données contre DPLN

| Archétype | Sort | Données (retenu) | DPLN | Écart |
|---|---|---|---|---|
| Acrobate | Videur | T2 → T3 ; poussée 3 → 4 | 5 > 7 cases ; 3 > 4 | ✓ |
| Acrobate | Hanedimane | F2 → F3 ; poussée/attirance 4 → 6 | fourche 3 > 4 ; 4 > 6 | ✓ |
| Acrobate | Voltige | PO 5 → 7 ; **lancers 2 → 2** | 5 > 7 ; 2 > 3 | **3e lancer absent des données** |
| Acrobate | Aïronemane | poussée 2 → **4** | 5 > 6 (description : 4 > 6) | données |
| Acrobate | Pugnace | 25 % → 50 % | ✓ | ✓ |
| Acrobate | Soutien Stratégique | renvoi C2 → C3 ; croix 5 → 7 ; attirance 4 → 6 | ✓ | ✓ |
| Acrobate | Va-t-en-guerre | avance 2 → 4 | ✓ | ✓ |
| Dompteur | Impact | C2 → C3 ; 2 → 3 lancers | ✓ | ✓ |
| Dompteur | Grondement | X1 → X3 (+ 406 en tête) | croix 1 > 3 | bonus de relance probablement perdu [H] |
| Dompteur | Prélèvement | crit C2 → C3 ; érosion 15 % (2 t, cumul 3) → **20 % permanente, cumul ∞** ; 3 → 4 lancers ; 2 → 3 par cible | 2 > 3 ; 15 > 20 % ; 3 > 4 | permanence non annoncée |
| Dompteur | Détonation | R1,1 → R2,1 | 3×2 > 5×2 | ✓ |
| Dompteur | Coup de Sang | C2 → C3 **+ dégressivité 10 %** | 2 > 3 | dégressivité non annoncée |
| Dompteur | Jaillissement | G1 → G2 + dégressivité ; **niveau 80750 appris inexistant** | 1 > 2 | amélioration peut-être cassée |
| Dompteur | Ombre Fracassante | F2 → F3 + dégressivité | 4 > 5 cases | « taille » = param + 2 |
| Magicien | Pulsation d'Énergie | soin C2 → C3 | ✓ | ✓ |
| Magicien | Regain Vigoureux | cercle 3 → tous ; +2 → +3 | ✓ | ✓ |
| Magicien | Protection Prolongée | 3 000 → 5 000 ; soin 44–48 → 53–58 | ✓ | ✓ |
| Magicien | Amplification | **+20 → +40 % DF ; +30 → +50 % crit ; +500 → +1 000 DoPou ; +20 → +40 % soins** | 20 > 30 % ; crit 20 > 30 % ; 100 > 200 | **DPLN et la description sont fausses** (capture et vidéos confirment +500 pour la base) |
| Magicien | Délivrance | 1 → 3 lancers (1 par cible) | ✓ | ✓ |
| Magicien | Vents Contraires | −2 PM X1 → −3 PM X2 | ✓ | ✓ |
| Magicien | Vague de Dégradation | C2 → C3 ; 15 → 30 % (érosion et DF) | ✓ | ✓ |

### 8.3 Priorités (joueurs + analyse)

- Améliorations : Acrobate **Videur > Hanedimane > Aïronemane** ; Dompteur **Impact > Prélèvement** (Grondement à éviter si
  le +20 est perdu) ; Magicien **Regain > Amplification > Pulsation > Protection**. [R — N50 §8.4 ; N1D §10.5]
- Uniques : **Relâchement de Fureur le plus tôt possible** (monte pendant 4 tours) ; **Dégagez !** (fin de combat) ;
  Galvanisation ; Pense Vite (à lancer au T7) ; Influx de Vitalité, Muraille collective, Ultime Espoir ; Démotivation contre
  la Mama. Jugés faibles : Soutien Stratégique, Chamboulement, Malédiction Régénérante. [R]

---

## 9. Formules du moteur

Source : **CLI273** (bibliothèque de prévisualisation des dégâts, identique en 2.42 → 2.73 ; portage C# de mêmes classes dans
le client DOFUS 3) [V, haute] ; code Python testé dans `tools/mechanics/` (62 contrôles OK). Le serveur fait autorité : les
rares cas limites sont signalés. Détails : N70.

### 9.1 Ligne de vue

Lancer de rayon `getCellsIdBetween` (passage exact par les coins) ; une case sans LdV bloque (y compris la cible) ; un
**combattant bloque seulement sur les cases intermédiaires** (jamais sur la case cible ni le lanceur) ; glyphes et marques
ne bloquent pas. Dans l'arène, **seuls les combattants bloquent**. LdV symétrique (testé). [V]

### 9.2 Cases de lancer

`po_max = PO_sort + (PO_bonus si modifiable)`, au moins `po_min`. Ligne et diagonale → étoile ; ligne seule → croix sur les
axes ; diagonale seule → croix diagonale (pas diagonaux, distance 2r) ; sinon losange de Manhattan. Puis filtres LdV, case
libre/occupée, entité visible. Limites : `maxCastPerTurn`, `maxCastPerTarget`, intervalle (`tour ≥ dernier + intervalle`),
cooldown initial/global, `maxStack`. [V]

### 9.3 Zones et dégressivité

Formes (`zoneDescr.shape` = code ASCII) : `P` point ; `C` losange (min–max) ; `X` croix sur les axes (min → sans centre) ;
`+` croix diagonale ; `*` étoile 8 directions ; `T` ligne perpendiculaire à la direction lanceur → cible ; `L`/`l` lignes ;
`F` fourche (3 dents sur r + 1 pas) ; `G` carré (Chebyshev) ; `R` rectangle (largeur 2r + 1, profondeur 1 + min) ; `V`
cône ; `U` demi-cercle ; `B` boomerang ; `W` carré sans diagonales ; `D` damier ; `O` anneau ; `I` hors losange ;
`A`/`a` toute la carte ; `;` liste explicite. Les zones orientées utilisent `dir8_exact(lanceur, cible)` ; si le lanceur n'est
pas aligné, la zone dégénère en la seule case ciblée. [V — N70 §3.2]

Dégressivité : par défaut −10 % par case, au plus 4 paliers (−40 %) ; distance Manhattan (C, X, *, T…), Chebyshev (G, R, W),
projection sur l'axe (F, V), 0 pour `;`, `A`, `a`, `I` ; aucune pour les rayons > 50 (C63, X63…) ; calculée sur la
**position de la cible avant le sort** ; s'applique aux dégâts **et aux soins**, pas aux boucliers ni aux collisions.

### 9.4 Cibles, masques, ordre

1. **Toutes les cibles de tous les effets sont calculées au lancement**, sur les positions d'avant le sort ; une cible poussée
   hors de la zone par l'effet 1 reste touchée par l'effet 2. Indispensable pour Amplification (masque `e5968` alors que
   l'effet 0 pose 5968). [V]
2. Inclusion (au moins un) : `A` ennemis, `a` alliés + lanceur, `g` alliés sans le lanceur, `c`/`C` lanceur, `j` invocations
   alliées, `H`/`h` joueurs… Exclusion (tous) : `E#`/`e#` état, `F#`/`f#` monstre, `V#` PV ≤ #%, `v#` PV > #%, préfixe `*` =
   testé sur le lanceur. Masques DOFUS 3 `Atq` (joueurs), `Def` (monstres), `Sce` (entité de scénario neutre) : **[H]**
   (forte pour Atq/Def).
3. Ordre de traitement : poussées de la plus **éloignée** à la plus proche de la case ciblée ; autres effets du plus proche au
   plus éloigné ; égalité : ordre des directions puis id. [V]

### 9.5 Dégâts

```
d = jet (+ bonus de base du sort, effet 293)
d = int(d × (100 + Carac(élément) + Puissance) / 100)          # neutre/terre → Force ; archétype : ×61
d += Dommages + Dommages élément (+ Dommages critiques si effet critique)
d = int(d × (100 − malus_zone) / 100)
# côté cible (hors collision) :
d -= résistances fixes ; d = int(d × (1 − rés%/100))           # rés% plafonnée à 50 % (joueur), 100 % (monstre)
si invulnérable : d = 0
d = int(d × multiplicateurs lanceur/cible (sorts, mêlée/distance, résistance mêlée/distance) / 100)
d = int(d × DF_lanceur / 100)                                    # DF = 100 + Σ1171 − Σ1172
m = 100 ; pour chaque buff 1163 dont le déclencheur correspond : m = int(m × pct / 100)
d = int(d × m / 100)
bouclier absorbe d'abord ; érosion = floor(min(pv_perdus × clamp(érosion,0,50)/100, PV − 1)) PV max perdus
vol de vie : soin = min(int(pv_perdus × 0,5), PV manquants du lanceur)
```

Troncature après chaque multiplication. Effets non boostables (ni carac, ni Puissance, ni DF) : % PV du lanceur (89, Coup de
Sang), % PV érodés du lanceur (1118) ou de la cible (1092), renvois (1123, 1223), dégâts fixes (glyphes). Le ×2 de Vulnérable
s'applique à eux. Mort à PV ≤ 0 ; l'effet 2872 impose un seuil (Immortalités). [V — N70 §4]

**Jet** : entier dans [min, max] ; tirage serveur supposé uniforme (l'aperçu client arrondit `min + r(max−min) + 0,5`) [H].

### 9.6 Critique

Taux = taux du sort + stat Critique (10 % de base ; +20 % par Acclamation chanceuse ; +30 %/+50 % par Amplification ;
plafond 100) ; **0 si le taux du sort est 0**. Un tirage par lancer ; en critique, la liste `criticalEffect` remplace
`effects` (jets et parfois zone différents) ; les sous-sorts héritent du critique ; Dommages critiques seulement sur les
effets critiques. [V]

### 9.7 Vulnérable et multiplicateurs 1163

- 1163 « Dommages subis x#1 % » : `m = int(m × 200 / 100)` → **×2** ; plusieurs 1163 se **multiplient** ; déclencheur `D` =
  tous les dommages **sauf** la poussée ; `DBA` = dommages d'un allié (Poutch ×50 %).
- État 5994 Vulnérable = marqueur sans effet propre (`st5994`, `effectsIds` vide) ; le multiplicateur vient des 1163 posés à
  côté (aura des pics sur `Def`, sortie 30701 sur le porteur). [V]
- Cas limite : un monstre sorti des pics puis **ré-entré** avant son tour cumule le ×2 de sortie et le ×2 de l'aura → 4 000 à
  la ré-entrée puis ×4 [H, basse-moyenne ; paramètre].

### 9.8 Soins, boucliers

Soins : même pipeline côté lanceur (Force, pas Puissance) + Soins fixes, puis × soins finaux (effet 2971 : Amplification,
Acclamation soignante, qui s'additionnent), dégressivité de zone, plafond aux PV manquants ; 1109 (% PV max) et 2020 (% des
dommages subis) non boostés. Boucliers : 1040 valeur fixe, ni boostés ni dégressifs, absorbent avant les PV (y compris les
dégâts des pics), durent `duration` tours du lanceur. [V]

### 9.9 Poussée, attirance, téléportation, échange

- **Direction** : depuis le **lanceur** si la cible est sur la case ciblée, sinon depuis la **case ciblée** (centre de zone) ;
  axe dominant (`dir4`) ; si |dx| = |dy|, direction diagonale exacte : **ceil(n/2) pas**, chaque pas diagonal exigeant les 2
  cases latérales libres. Positions d'avant le sort. Pour les sous-sorts exécutés par 1160 (Videur, Hanedimane,
  Chamboulement), chaque cible devient la case ciblée → poussée depuis le lanceur, cible par cible. [V]
- **Glissement** : case par case ; arrêt contre une case non marchable ou occupée ; **glyphes et auras n'arrêtent pas** ;
  Inébranlable (effet d'état 0) et Enraciné (3) empêchent la poussée (sauf poussées forcées 1021/1022).
- **Collision** : `dmg(i) = max(0, int(reste × (floor(niv/2) + 32 + DoPou − RéPou) / (4 × 2^i)))`, `reste` doublé pour une
  direction diagonale ; i = 0 pour la cible, puis chaque entité percutée en chaîne (/2 à chaque maillon). Ni résistances, ni
  DF, ni ×2 de Vulnérable (sauf 1163 à déclencheur PD/PMD/PPD). Archétype : **283 par case** (333 avec +200, 408 avec
  Amplification, 533 avec Dégagez ! ou Amplification améliorée) ; Troolls 33 ; Mama 133 (niv. 1000). Pas de collision pour
  les attirances (6, 1022), 1103 (Rassemblement) et 1021.
- **Attirance** 6 : la cible vers le lanceur ; **1042** : le lanceur avance vers la cible (Va-t-en-guerre).
- **Téléportation** 4 : sur la case ciblée si libre ; en zone non `P`, première case libre de la zone (ordre `getCells`).
- **Échange** 8 : impossible si l'un est Enraciné, sous « pas d'échange » (effet d'état 18) ou porté ; Inébranlable ne
  l'empêche pas.
- Après toute arrivée (poussée, attirance, téléportation, échange), les auras de la case d'arrivée s'appliquent. [V ; H pour
  l'application sur la seule case d'arrivée]

### 9.10 Durées, délais, glyphes, sous-sorts

- Un buff de durée n perd 1 **au début de chaque tour de son lanceur** ; −1 ou ≥ 63 = permanent ; `delay` = tours du lanceur
  avant activation ; les sorts lancés **avant le premier tour** ne sont pas décomptés au premier début de tour. Un buff de
  durée 1 posé par A dure jusqu'au début du prochain tour de A. [V client ; ordre serveur H]
- **Début de tour de X** (ordre supposé) : décompte des buffs lancés par X → RAZ des compteurs → effets `TB` des buffs portés
  → **glyphes de début de tour** (401) contenant sa case → restauration des PA/PM. **Fin de tour** : effets `TE`, glyphes de
  fin de tour (402), RAZ des compteurs de lancers.
- **Aura 1091** : effets appliqués à **toute entrée** (marche, poussée, attirance, téléportation, échange), retirés à la sortie
  (déclenche `EOFF`) ; passer d'une case de pics à une autre ne redéclenche rien [H moyenne]. **Glyphe 401** : sort lancé par
  le poseur sur l'entité qui commence son tour dedans. Dégâts de glyphe boostés par le **poseur** (ici sans caractéristiques :
  2 000 exacts).
- **Sous-sorts** (`solveSpellExecution`) :

| Effet | Lanceur du sous-sort | Case ciblée |
|---|---|---|
| 792, 2792 | la cible de l'effet | sa propre case |
| 1160, 2160, 1008 | le lanceur d'origine | case de la cible |
| 1017 | la cible (porteur) | case de la source (l'attaquant) |
| 1018 | la source | case de la cible |
| 1019 | la source | sa propre case |
| 2794 | la cible | case ciblée du sort parent |
| 2960 | le lanceur d'origine | case ciblée (sans cible requise) |

Les variantes « GlobalLimitation » (2160, 2792, 2017…) s'exécutent au plus `value` fois par lancer. Un sous-sort exécuté
**ignore ses propres conditions de lancer** (PA, PO, LdV) [H moyenne]. Anti-boucle : un buff ne se redéclenche pas sur un
effet qu'il a produit. [V — N70 §7.4]

### 9.11 Tacle

Formule client connue (`ratio = Π min(1, (Fuite+2)/(Tacle+2)/2)`), mais **désactivé** dans le Gladiatrool : état 5970 des
joueurs (intaclables, ne taclent pas). [V]

### 9.12 Algorithme de résolution d'un sort

```
cast(lanceur, niveau, case):
  vérifier PA, portée, LdV, limites ; crit = tirage(taux)
  effets = criticalEffect si crit sinon effects ; ignorer les effets forClientOnly
  snapshot des positions ; cibles[e] = sélection(zone, masque, snapshot) pour chaque effet
  pour chaque effet dans l'ordre :
     si déclencheur ≠ I : poser un buff (durée, délai) ; continuer
     pour chaque cible (ordre §9.4) : appliquer (dégâts §9.5, poussée §9.9, état, sous-sort §9.10…)
         puis déclencher les buffs réactifs (D, PD, X, EON/EOFF…) — y compris entrée/sortie d'aura après un mouvement
  PA −= coût ; compteurs de lancers ++
```

### 9.13 Les pics en pseudo-code (résumé normatif pour le moteur)

```
on_enter_spikes(e):                      # après tout mouvement dont la case d'arrivée est une case de pics
   set_state(e, 5902 si Def sinon 5903) ; set_state(e, VULNERABLE)
   damage(e, 2000, élément=neutre, source=scénario, non boosté)            # résistances et boucliers s'appliquent
   si e ∈ Def : add_mult(e, 200 %, trigger=D, until=exit)                    # posé APRÈS les 2 000
   si e ∈ Atq et config.playersDoubledInsideSpikes : add_mult(e, 200 %, D, until=exit)
   si e == Mama : disable_state(56, 1 tour de la Mama)                      # EON5902
on_exit_spikes(e):
   retirer 5902/5903, VULNERABLE et le ×2 d'aura
   si e a le passif 30700 (joueurs, Troollibre, Artroolleur, Nitrooll) : add_mult(e, 200 %, D, 1 tour de e) + VULNERABLE 1 tour
on_turn_start_in_spikes(e):
   dmg = 1000 (joueur : config.playerTurnStartSpikeDamage) → multiplié par les 1163 actifs (×2 pour un monstre)
```

---

## 10. Stratégie

### 10.1 Compositions

| Compo (ordre de jeu) | Sources | Arguments |
|---|---|---|
| **Acrobate → Dompteur → Dompteur → Magicien** | cardxc, Zephiron, Khytrayer (3.6), Mishurra, Sword, forum | 2 Relâchements de Fureur pour tuer la Mama en un tour ; plus de dégâts de zone contre l'accumulation |
| **Acrobate → Acrobate → Dompteur → Magicien** | Koza & Julibis (~40 runs), Isthos, Hy-glou, Huz, Houmilito, Laltoss, Fielon ; « la méta c'est deux placeurs » (Barbe Douce) | plus de mises en pics **avant que les monstres jouent** ; le 2e Acrobate pousse ou tue les ennemis qui n'ont pas encore joué |
| Variante Acrobate → Acrobate → Magicien → Dompteur | Koclikoo ; souhait des GD (Acrobate → Magicien → Dompteur) | boosts (Amplification, Regain) posés avant la frappe du Dompteur |

Unanime : **Acrobate en premier** ; **Magicien en dernier** dans toutes les runs gagnantes filmées. Le choix A-D-D-M / A-A-D-M
est **à départager par le simulateur**. [R, haute]

### 10.2 Principes autour des pics (heuristiques pour le planificateur)

1. **Mettre dans les pics avant qu'il joue** : un Trooll qui entre perd 2 000, devient ×2 et, s'il y reste, perd 2 000 à son
   tour (et passe souvent son tour). [V+R]
2. **Tuer le Trooll qui joue juste après soi** (« tour gratuit ») : 4 sources. [R]
3. **Ne pas frapper une cible non Vulnérable** si une cible Vulnérable est disponible (« zéro dégâts comparé à ceux dans les
   pics », cardxc 15:30). [R]
4. **Laisser mourir seul un Trooll ≤ 2 000 PV dans les pics** (économie de PA ; compte pour Empalé), sauf si l'objectif en
   cours exige un kill par un joueur. [V+R]
5. **Un Trooll sorti des pics reste ×2 jusqu'à son tour** : on peut le finir hors des pics. [V]
6. **Rester au centre**, loin des bords d'au moins « poussée maximale + 1 » (Troollpoline 3, Double/Coup de Trooll 3, Tir 2,
   Uppertrooll 6) ; ne pas sortir des pics juste avant les tours d'ennemis dangereux (×2 de sortie). [V+R]
7. **Calcul de distance au bord** : éviter les combinaisons qui laissent le monstre à 1 case des pics (Khytrayer 09:23) ;
   utiliser la table k (§3.8). [R+V]
8. **Priorité des cibles** : Nitrooll (soins, Inébranlables, poussées) ≥ Artroolleur (le plus fragile dans les pics, objectif
   Stop aux projectiles) > Troollibre (le plus dangereux au contact). [H/analyse N20 §8]

### 10.3 Combos autour des pics

| Combo | Principe | Chiffres |
|---|---|---|
| Videur ×2 (8 PA) | deux lignes T poussées de 3 (4 amélioré) vers le bord | 2 000 + ≈ 6 500–7 400 par cible sur la cible poussée ; ≈ 8 100 E sur Vulnérable |
| Hanedimane → Videur (7 PA) | fourche 4 (6) puis ligne 3 : jusqu'à 7 cases de poussée cumulées | vérifier qu'on ne s'arrête pas à k − 1 |
| Aïronemane → Videur (7 PA) | se téléporter pour « prendre l'axe » sans LdV | — |
| Va-t-en-guerre ×2 → Videur (8 PA) | 4 cases de déplacement payées en PA | — |
| **Voltige depuis les pics** | l'Acrobate entre dans les pics, puis échange avec la cible (même Inébranlable, même la Mama) | cible : 2 000 + ×2 ; objectif Toi, par ici ; l'Acrobate est ×2 jusqu'à son tour |
| Frappe Repoussoir (tous) | un monstre à k ≤ 2 dans l'axe entre dans les pics puis prend la frappe ×2 | 2 000 + 1 952–2 440 |
| Dompteur sur paquet dans les pics | Impact C2/C3 centré sur l'anneau : 7–8 (10–11) cases de pics couvertes | Impact 8 296–9 028 par cible Vulnérable ; Coup de Sang 12 000 par cible à PV pleins |
| **Dégagez ! → Punition Collective / Pulsation Chaotique** | tout repousser de 5 contre les bords (pics), puis frapper tout le monde ×2 | Punition 11 468–12 932 par Trooll Vulnérable ; Pulsation sur le plus faible |
| Malédiction Collatérale → frappes | chaque coup renvoie 50 % aux voisins (×2 s'ils sont Vulnérables) | chaînes possibles [H] |
| Prélèvement ×n → Ombre Fracassante | érosion 50 % puis % des PV érodés | finisher de la Mama (≈ 30 000 dans les pics) |

### 10.4 Ouverture T1 (V1 = 2 Troollibres sur 242 et 358)

[V calcul — N1A §7.2 ; R cardxc 03:30–04:00]

- Placement : **Acrobate sur 314 (ou 287)**, les autres sur les 3 cases restantes.
- Acrobate : Videur sur **256** → 242 part en **199** (pics) ; Videur sur **372** → 358 part en **402** (pics). Chaque
  Troollibre : −2 000 puis −6 478 à −6 916 (Videur à 90 % ×2 ; critique −7 904 à −8 454) → il lui reste ≈ 14 500–16 500 PV.
- Dompteur 1 : tue le Troollibre qui joue juste après lui (≈ 16 000 : deux Impacts sur Vulnérable, E 8 432 à 1 case de la
  case ciblée, 9 370 au centre) → **Empalé** validé → vote (Productivité) → Grondement / Hanedimane / Regain appris.
- Dompteur 2 : frappe l'autre (qui a pris 2 000 de plus à son début de tour s'il est resté dans les pics).
- Magicien : Pulsations sur un Trooll Vulnérable, ou **Regain + 2 Pulsations = Productivité** si Regain est déjà appris et
  utilisable [H].
- Depuis 286/315, l'Acrobate n'atteint qu'une des deux lignes (l'autre est bloquée par un allié).

### 10.5 Plan de référence T1 → T10

| Tour | Acrobate(s) | Dompteur(s) | Magicien | Objectifs / préparation |
|---|---|---|---|---|
| T1 | double Videur (§10.4) | tuer le Trooll suivant | Pulsation ×2 / Productivité | Empalé, puis Productivité |
| T2–T3 | mettre en pics les Artroolleurs (k = 2 aux coins : Frappe Repoussoir ou Videur suffit) et le Troollibre de V2 avant qu'ils jouent ; Hanedimane + Videur | GG toutes les 2 tours (relance à +20), Impact ; Prélèvement sur les cibles à finir | Amplification sur les 2 Dompteurs (T1 ou T2) ; Regain au T3 | Stop aux projectiles / Ébranlable ; prendre les cadeaux en début de tour global |
| T4–T6 | contrôle des Nitroolls (Voltige s'ils rendent Inébranlable) | nettoyer chaque vague, tuer d'abord ceux qui jouent ensuite | Protection Prolongée sur l'exposé ; Amplification au T5 (couvre T8) | 5 objectifs avant T8 si possible ; prendre Relâchement de Fureur le plus tôt possible (au plus tard au T4 pour +100 au T8) |
| **T7** | Pugnace ou Immortalité du Courageux ; finir **hors des lignes** x = 17, y = −4, y = −3 et **pas sur 300** | Pense Vite / Immortalité du Berserker / Galvanisation ; garder Relâchement | **Regain** (PA/PM au T8), **Muraille collective**, Immortalité du Bienfaiteur ; finir sur **299 ou 328** | ne perdre personne ; 108 cases sûres sont hors des trois lignes x = 17, y = −4, y = −3 (120 hors des deux lignes depuis 300) |
| **T8** | mettre la Mama dans les pics (Voltige depuis les pics, Videur/Hanedimane, Frappe) | Prélèvement ×n, **Relâchement ×2**, Impact/GG, **Ombre Fracassante en dernier** | **Démotivation** (seulement après son entrée), soins, Pulsation/Vents sur la Mama | tuer la Mama dans la fenêtre (§6.9) |
| T9–T10 | **Dégagez !** | Malédiction Collatérale, **Punition Collective**, **Pulsation Chaotique** (sur le plus faible, à une extrémité du paquet) | soins, Ultime Espoir si besoin | Quintuplé / Au coin ! ; victoire quand tout est mort après V10 |

### 10.6 Priorités de bonus (Acclamations)

Deux écoles : **PO d'abord** (Koza, Zephiron, Hy-glou ; « 0 PO, ça peut être un gros problème », Huz) contre **PA d'abord**
(cardxc, Khytrayer, Isthos, Sword, Mishurra, Laltoss). Analyse : +1 PO étend Videur (1–5) et Hanedimane (1–3) et évite 1 PM
aux Dompteurs (premier pic à 6 cases des cases de départ) ; +1 PA donne un 3e sort à 3 PA au Magicien ; pour le Dompteur, à
PA/PO égaux, **+10 % DF** (+936 par Impact Vulnérable) > +500 dommages critiques (+400) > +20 % critique (+354). → paramètre
de politique du planificateur (§11, `QUESTIONS_OUVERTES.md`). [R + V calcul N1D §7]

### 10.7 Ce que le simulateur doit trancher

- A-D-D-M contre A-A-D-M (et l'ordre Magicien/Dompteur) sur les mêmes graines de tirage (cases d'apparition, cadeaux,
  critiques).
- Politique de bonus (PO-first / PA-first / DF-first), d'objectifs (lesquels voter), d'uniques (qui prend Relâchement).
- Placement initial (qui sur 314/287) et placement T7.
- Sensibilité aux hypothèses non tranchées (§11) : ×2 des joueurs dans les pics, timeline, IA.

---

## 11. Données manquantes, incertitudes et contradictions

### 11.1 Ce qui n'existe dans aucune source primaire

- Script serveur des **vagues** (qui, quand, où) : reconstitué par la VOD (cases) et DPLN (composition). [V absence]
- **Timeline** : ordre des Troolls, place des monstres apparus en cours de combat.
- **IA** des monstres.
- **Contenu des fenêtres de choix** (ids 10, 11–15, 16, 17 : cartes, probabilités, critères) ; loi de tirage des cadeaux.
- **Moments** exacts de 30710 (fin du tour global) et de 30577 (T10).
- Lanceur réel des pics (entité `Sce` supposée) et sémantique DOFUS 3 des masques `Atq`/`Def`/`Sce` et des jetons `CAP`,
  `TR#`, `XPD`.
- Sorts de départ des archétypes (Impact, Videur, Pulsation) : donnés par le serveur, aucun sort client ne les apprend.
- Spell-level **80750** (Amélioration : Jaillissement) : absent.

### 11.2 Contradictions et hypothèse retenue pour le simulateur

| # | Sujet | Source A | Source B | Retenu pour le simulateur | Conf. |
|---|---|---|---|---|---|
| 1 | Vulnérable | DPLN : « +200 % de dégâts » (×3) | données 1163 ×200 % ; texte en jeu « daño sufrido por 200 % » ; Isthos « twice » ; VOD 9 904 ; 1 000 → 2 000 | **×2** | haute |
| 2 | ×2 d'un **joueur** dans les pics | DPLN (« les entités ») ; Isthos (« both to us and to the monsters ») | données : ×2 sur `Def` seulement ; indice indirect : les −21 000 de la Mama au pop concordent avec ×1 | **×1** (`playersDoubledInsideSpikes = false`) | moyenne |
| 3 | Début de tour dans les pics, joueur | DPLN : 2 000 ; Houmilito 1:05 « j'ai pris 2 000 » (ambigu : entrée ?) | données : 1 000 | **1 000** (`playerTurnStartSpikeDamage`) | moyenne |
| 4 | Début de tour dans les pics, monstre | DPLN : 2 000 | données : 1 000 brut × 2 | **2 000** (1 000 × 2) | haute |
| 5 | Carte de combat | hypothèse initiale : 139988485 avec trône | données de carte, décor, VOD | **139988488**, sans obstacle | haute |
| 6 | Obstacles « en temps réel » | DPLN : possibles | GD : non implémentés ; 0 en 11 combats | **aucun** | moyenne |
| 7 | Tour d'arrivée de la Mama | DPLN « tour 8 (?) » ; adminName « TP T5 » ; Skaradon « 7 ou 8 » | délai 7 ; 11/11 combats ; 6 vidéos | **T8** | haute |
| 8 | Case d'arrivée | capture DPLN : 287 | données : 300 ; 5 combats | **300**, repli **287** | haute / moyenne |
| 9 | Initiative des joueurs | DPLN, Khytrayer : ordre inverse du groupe | correctif 14/01/2025 : ordre d'entrée ; Isthos, Zephiron | **ordre libre en paramètre** | haute |
| 10 | Pense Vite | 15 s (DPLN, GD, Barbe Douce) ; 901/1 000 PA | 10 s (données 3.6, Khytrayer, Houmilito) ; 999 PA | **10 s, 999 PA**, simulé par un plafond de lancers (3) | haute |
| 11 | Passif 30639 | +3 000 Puissance / ±5 000 Vitalité | VOD ×61 ; capture 30 000 PV | **non appliqué** (options) | haute (Puissance) / moyenne (PV) |
| 12 | Faveur | DPLN : « cumulable 5 fois » | données : sans plafond, 6 objectifs possibles | **−5 % par objectif, 95 % au 6e** (option plafond) | moyenne |
| 13 | Acclamation résistante (Magicien) | DPLN : 10 % | données : 15 % distance ; bêta : mêlée | **15 % distance** | haute |
| 14 | Amplification | table DPLN (100 > 200 ; crit 20 > 30 %) ; description de l'amélioration | effets 30411/30578 ; capture et vidéos (+500) | **+20 %/+30 %/+500/+20 %** ; amélioré **+40/+50/+1 000/+40** | haute |
| 15 | Voltige améliorée | DPLN, description : 3 lancers | données : 2 | **2** (option 3) | moyenne |
| 16 | Aïronemane améliorée | description 4 > 6 ; DPLN 5 > 6 | effets : 2 → 4 | **4** | moyenne |
| 17 | Jets de Videur | capture DPLN 62–66 / 74–79 | données 59–63 / 72–77 ; VOD à ×61 | **données** | moyenne |
| 18 | Chamboulement | infobulle et DPLN : 6 | effet réel : 5 | **5** | moyenne |
| 19 | Détonation | infobulle : +10 | effet réel : +5 par ennemi | **+5** | moyenne |
| 20 | Malédiction Collatérale | capture : 100 % | données, description : 50 % | **50 %** | moyenne |
| 21 | Malédiction Régénérante | description, DPLN : 50 %, tous les alliés | données : 100 %, alliés à ≤ 2 cases | **100 %, C2** (option 50 %) | moyenne |
| 22 | Immortalités | « 1 % des PV » | seuil 1 PV | **1 PV** | moyenne |
| 23 | Un pour un | DPLN : renvoie 50 % | ×50 % subis + renvoi de 100 % des finaux | **données** | moyenne |
| 24 | Relâchement de Fureur | DPLN : augmente à chaque tour | +25 à 4 débuts de tour (max +100) | **+100 max** | moyenne |
| 25 | Prélèvement / Coup de Sang / Jaillissement / OF améliorés | DPLN : changements annoncés seulement | érosion permanente, dégressivités ajoutées | **données** | haute |
| 26 | Jaillissement amélioré | listé | niveau 80750 inexistant | **80760** (option « cassé ») | moyenne |
| 27 | Taux critiques des captures | Vents 40 %, Vague 30 %, Frappe 40 % | données 30 / 20 / 30 (+10 personnage) | **données + 10** | moyenne |
| 28 | Troollpoline, Double Trooll, Aspiratrooll, Mortrooll | DPLN : 6 000 ; 3 000 ×2, repousse 2 ; attire 1 ; 1/tour | 4 100–4 756 ; 2 × 1 152–1 368, repousse 3 ; attire 2 ; intervalle 2 | **données** | haute |
| 29 | Catastrooll | DPLN « Castatrooll », étoile 5, attire 4 | Catastrooll, étoile 6, attire 5 | **données** | haute |
| 30 | Valeurs des sorts de la Mama | DPLN : 3 000 / 3 500 / 4 500 | = données sous Faveur V, sauf Mitroollette hors Faveur | **données + Faveur** | haute |
| 31 | Rassemblement | DPLN : pousse les personnages | pousse **sans collision** et **attire les Troolls** | **données** | haute |
| 32 | Niveau de la Mama | fiche en jeu : 200 | données, GD : 1 000 | **1 000** (collision 133) | moyenne |
| 33 | Tacle | N70 : ratio 0,5 par Trooll | état 5970 des joueurs | **aucun tacle** | haute |
| 34 | Mama Inébranlable | Houmilito (1 source) | aucun état propre | **seulement via Tambour** d'un Nitrooll | moyenne |
| 35 | « Tout le monde veut prendre sa place » | Huz (oral) : le plus proche | DPLN, description 30451 : le plus éloigné | **le plus éloigné** | haute |
| 36 | Meurtres en série / morts par poussée | sspritenL : ne comptent pas | client : `X` pour toute mort | **comptent** (option) ; morts par glyphe non attribuées | basse |
| 37 | Nombre d'objectifs | Zephiron : rien après Tout va bien | données : 6 | **6** (option 5) | moyenne |
| 38 | Relance de Regain | Huz : T4 | client : T5 (intervalle 4) | **T5** | moyenne |
| 39 | Protection Prolongée | DPLN : soin au prochain tour | données : 2 débuts de tour | **2 soins** | moyenne |
| 40 | Vagues | devblog : « imprévisibles », Mama « si difficulté » ; Khytrayer « 3, 3, 4 » | composition fixe (DPLN, VOD, vidéos), arrivée fixe | **fixe** ; cases tirées parmi des emplacements | haute |
| 41 | Largeur des pics | Mishurra : « 2 cases » | données : 2 cases + 4 angles | **données** | haute |
| 42 | Moment des bonus | fin de tour (Laltoss, Sword, cardxc) | début de tour global (DPLN, GD, VOD) | **début de T2 à T9** | haute |
| 43 | Acclamations | — | carte + accumulateur (double application possible) | **simple** (option double) | basse |
| 44 | Pugnace contre Rassemblement | — | 1103 n'est pas une poussée forcée | **bloque** (option) | moyenne |
| 45 | Poutch | — | effet 181 durée 1 ; sort 30420 « Mort » jamais référencé | **durée illimitée** (option 1 tour) | basse |
| 46 | Délivrance | Willseir : « ne fonctionne dans aucun cas » | données normales | **fonctionne** | basse |
| 47 | Ordre poussée → aura → frappe | — | VOD : −9 904 = 2 000 + 2 × 3 952 | **aura appliquée dès l'arrivée** | haute |
| 48 | Mama au T7 | DPLN : ne joue pas avant son arrivée | décompte client : tour non annulé au T7 | **aucune action au T7** (option) | basse |
| 49 | Profondeur des coins d'apparition 187/188/411/412 | N40 §4.3 : profondeur 3, « à 1–2 cases du glyphe » | carte : profondeur 4, k = 2 | **k = 2** (calcul sur la carte) | haute |

Liste priorisée des inconnues avec protocoles de vérification : `research/QUESTIONS_OUVERTES.md`.

---

## 12. Bibliographie

### 12.1 Sources primaires (données du jeu)

- API DofusDB (données du client DOFUS 3) : https://api.dofusdb.fr — sorts 30370–30800 (`/spells`), niveaux (`/spell-levels`),
  états (`/spell-states`), monstres 7980–7986 (`/monsters`), effets (`/effects`), map-positions 139988485, 139988488,
  139725313, rendus `https://api.dofusdb.fr/img/maps/1/<id>.jpg`. Extraction reproductible : `tools/dofusdb/extract.py`,
  décodage `tools/dofusdb/decode.py`, fichiers `research/raw/dofusdb/` (INDEX.md, decoded_spells.md).
- Client DOFUS 3 via le CDN Ankama Cytrus : https://cytrus.cdn.ankama.com/cytrus.json (releases `dofus3` 6.0_3.6.12.16,
  `beta` 6.0_3.7.2.2) ; `Content/Map/Data/catalog_1.0.bin`, `mapdata_assets_world_534.bundle` ; `global-metadata.dat`
  (enum `ActionIds`, `research/data/action_ids_dofus3.json`). Outils : `tools/map/`.
- Client DOFUS 2.73.3.14 (`main`) : `DofusInvoker.swf`, décompilé avec JPEXS (https://github.com/jindrapetrik/jpexs-decompiler) ;
  comparaisons : https://github.com/HadesFR/DofusInvoker (2.58), https://github.com/scalexm/DofusInvoker (2.51),
  https://github.com/Romain-P/d2gen (2.42). Portage : `tools/mechanics/`.

### 12.2 Guide

- Dofus pour les Noobs, « Gladiatrool », https://www.dofuspourlesnoobs.com/gladiatrool.html (mis en ligne 23/09/2024, mis à jour
  21/05/2026), captures sous `https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/` (ex. `ark26gladia127_orig.png`,
  `tuto2k-46_orig.jpg`) ; « Les dommages » https://www.dofuspourlesnoobs.com/les-dommages.html ; « Tacle et fuite »
  https://www.dofuspourlesnoobs.com/tacle-et-fuite.html ; MàJ 2.73 https://www.dofuspourlesnoobs.com/mise-a-jour-273.html.

### 12.3 Sources officielles Ankama

- Devblog 2.73 Gladiatrool : https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737504-devblog-2-73-gladiatrool ;
  Foire du Trool : https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737292-devblog-2-73-foire-trool
- AnkamaLive 2.73 (10/09/2024), rediffusion : https://www.youtube.com/watch?v=CY_cgLRjkoM
- Correctif 14/01/2025 (initiative) : https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3/correctifs/1760946-correctif-14-01-2025
- Correctif 21/01/2025 : https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3/correctifs/1761082-correctif-21-01-2025
- MàJ 3.1 (timeline) : https://www.dofus.com/fr/mmorpg/actualites/maj/1762717-operation-consolidation/details
- Patch 3.3.5.5 (pics sans dégâts, corrigé) : https://www.dofus.com/fr/mmorpg/actualites/maj/1765214-puits-songes-infinis/correctifs/1765459-patch-notes-3-3-5-5-30-09-2025
- Patch 3.5.14.18 (choix fin/début de tour) : https://www.dofus.com/fr/mmorpg/actualites/maj/1768057-repos-braves/correctifs/1769600-patch-notes-3-5-14-18-05-05-2026
- MàJ 3.6 (×2 Gladiatons) : https://www.dofus.com/fr/mmorpg/actualites/maj/1770516-raid-not-dead/details
- Patchs bêta Unity 01/10/2024 et 08/10/2024 : https://www.dofus.com/en/forum/1181-patch-notes/

### 12.4 Vidéos

- VOD Twitch twynetv « [KOURIAL] DÉCOUVERTE GLADIATROOL ?! » (21/08/2026) : https://www.twitch.tv/videos/2852548819
- cardxc (06/03/2025) https://www.youtube.com/watch?v=vmh1fJkhdCE — Koza & Julibis (18/12/2024) https://www.youtube.com/watch?v=ve5TVn_sJGo
  — Zephiron (11/02/2025) https://www.youtube.com/watch?v=IKqnwLIYffk — Khytrayer (14/08/2026, 3.6) https://www.youtube.com/watch?v=FSlGkDE7ZOQ
  — Huz (09/11/2024) https://www.youtube.com/watch?v=ShlRLUWn7VM et (26/09/2024) https://www.youtube.com/watch?v=kGlKYY7_qew
  — Isthos (18/03/2025) https://www.youtube.com/watch?v=Vwe_m7suH9A — Houmilito (31/10/2024) https://www.youtube.com/watch?v=HSHSLHi5jQY
  — Barbe Douce (26/09/2024) https://www.youtube.com/watch?v=v3cDvm3x4pw — Mishurra (26/09/2024) https://www.youtube.com/watch?v=PxTtn2g9sx4
  — Sword (06/07/2026) https://www.youtube.com/watch?v=xDmoOV-9A18 — Skaradon (07/01/2025) https://www.youtube.com/watch?v=AX-A1ULkP0A
  — Koza speedrun https://www.youtube.com/watch?v=5WWUKwtPtXw — Hy-glou https://www.youtube.com/watch?v=RNU9FVDzeZ8

### 12.5 Forums

- https://www.dofus.com/fr/forum/1938-gameplay/2419388-retour-gladiatrool (Matspyder4, DJC-IPAC)
- https://www.dofus.com/fr/forum/2011-divers/2430927-gladiatrool-bugs (sspritenL, 70 combats)
- https://www.dofus.com/fr/forum/1978-serveurs-historiques/2440738-demande-aide-conseils-gladiatrool (Laltoss, Koclikoo)
- https://www.dofus.com/fr/forum/1782-dofus/2426762-gladiatrool-retour-experience ; …/2426869-gladiatrool-quelqu-arrive ;
  https://www.dofus.com/fr/forum/2011-divers/2432860-bug-gladiatrool-completement-inutilisable ;
  https://www.dofus.com/fr/forum/2103-general/2446535-retour-recompenses-foire-trool-gladiatrool ; forum bêta
  https://www.dofus.com/fr/forum/1965-gladiatrool ; commentaires Disqus de la page DPLN (Fielon, 15/12/2024).

### 12.6 Travaux internes (ce dépôt)

Notes `research/notes/` (1x ×3, 20, 30, 40, 41, 50, 60, 70) ; données `research/data/` (map_139988488, map_139988485,
map_annotations, fight_scripts, monsters, archetype_* ×3, effects_semantics, action_ids_dofus3) ; tables de vision
`research/raw/vision/` ; figures `research/figures/` ; générateurs `tools/` (dofusdb, map, mechanics, archetypes, monsters,
fight_scripts).
