# Résultats des expériences comparatives

Ce rapport rassemble les expériences Monte Carlo lancées avec le planificateur **après** la boucle d'amélioration
(`docs/AMELIORATIONS.md`, tours 1 à 4). Les questions posées sont celles de l'ÉTUDE §10.7 : compositions, politiques
de bonus, de vote et de placement, et sensibilité aux hypothèses non tranchées (`research/QUESTIONS_OUVERTES.md`).
Une analyse détaillée des combats complète ces mesures.

Les tableaux complets, générés automatiquement, sont dans `sim/results/TABLEAUX.md`. Les résultats bruts (JSON
compacts, un enregistrement par combat) sont dans `sim/results/<expérience>.json`. La section 8 donne les commandes
pour tout reproduire.

## Résumé

> **Révision après revue adversariale** (docs/VERIFICATION.md, « Revue planificateur / IA / résultats »). La
> première version de ce rapport a été produite par un planificateur qui **trichait sans le vouloir** : ses copies
> de planification gardaient la graine du scénario, si bien que l'anticipation (qui franchit le début du tour global
> suivant) voyait les vraies cases d'apparition de la vague suivante, le vrai tirage du cadeau et les vraies cartes.
> Le défaut est corrigé (graines neutralisées dans les copies) et **toutes les expériences ont été relancées**.
> L'effet de la triche est mesuré (section 4.4) : dans le scénario pessimiste, ADDM gagnait 85 % des combats en
> trichant contre 67,5 % sans (p = 0,003). Les chiffres ci-dessous sont ceux du planificateur corrigé.

1. **Il faut un Acrobate et il faut 4 joueurs.** Avec les hypothèses par défaut :
   - ADDM gagne 196 combats sur 200 et AADM 198 sur 200.
   - À 3 joueurs, ADM gagne 73 % des combats, AAD 40 % et ADD 17 %. À 2 joueurs ou moins, aucune victoire en 30
     combats (IC de Wilson [0 ; 11 %]).
   - Sans Acrobate, DDDM tombe à 20 % [12 ; 32 %] : 8 mises en pics par combat au lieu de 30.
   - ADDD gagne 70 % des combats, contre 98 % quand un Magicien remplace le troisième Dompteur (18 graines perdues
     contre 1, p < 0,001).
2. **ADDM et AADM ne se départagent pas sur le taux de victoire avec les cadeaux par défaut.**
   - Hypothèses par défaut : 196/200 contre 198/200 sur les mêmes graines (AADM seule 4, ADDM seule 2, p = 0,69).
   - Scénario pessimiste combiné : 58,8 % contre 59,4 % sur 160 graines (McNemar 28 / 29, p = 1).
   - Écart de progression apparié : +0,56 point [−0,15 ; +1,27] pour AADM, non significatif.
3. **Les deux compositions ont des profils nettement différents**, et ces écarts sont très significatifs :
   - ADDM tue la Mama **un tour plus tôt**. Écart apparié : AADM − ADDM = +0,98 tour [0,76 ; 1,21]. Au T8, ADDM la
     tue dans 41 % des combats et AADM dans 3 %.
   - ADDM gagne plus souvent dès le T10 (31 % contre 11 %) et subit moins de dégâts de la Mama (19 600 contre 28 700
     PV par combat).
   - AADM met en pics davantage de monstres des dernières vagues : 99,3 % contre 87 % en V10.
4. **Quand les cadeaux sont rares, AADM est nettement plus sûre** (hypothèse Q14 : fréquence des cadeaux).
   - Avec des cadeaux rares (p = 0,3 au lieu de 0,72), ADDM passe de 97,5 % à 81,3 % de victoires sur 160 graines
     (28 graines perdues contre 2, p < 0,001).
   - Dans les mêmes conditions, AADM gagne 95,0 % : 27 graines gagnées par AADM seule contre 5 par ADDM seule,
     **p < 0,001**. (Avant correction, l'écart n'était pas significatif, p = 0,19 : la triche profitait surtout à
     ADDM.)
   - Explication : le Relâchement de Fureur (sort unique des cadeaux) est la clé de la mise à mort rapide de la Mama
     par ADDM. Avec des cadeaux rares, ADDM ne tue la Mama au T8 que dans 11 % des combats, et ne la tue pas avant
     le T14 dans 20 %.
5. **Politiques** :
   - Avec les hypothèses par défaut, aucune politique d'Acclamation, de vote ou de placement ne change
     significativement le résultat : on est au plafond.
   - Dans le scénario pessimiste, « PO d'abord pour tous » **dégrade nettement ADDM** : 48 % contre 68 % de victoires,
     17 graines perdues contre 5 gagnées, p = 0,017.
   - La politique par défaut du planificateur, qui choisit selon l'archétype (Dompteurs : dommages finaux puis PA ;
     Acrobates : PO puis PA), reste la meilleure ou à égalité.
6. **Sensibilité** : parmi 12 hypothèses testées, une seule change qualitativement le jeu.
   - Avec `timeline.model = monsters_after_mama` (tous les Troolls jouent d'affilée après la Mama), les deux
     compositions perdent tous leurs combats, entre T5 et T6.
   - Les autres hypothèses laissent les deux compositions au-dessus de 87 % ; seules Q14 (cadeaux rares, p = 0,039
     pour ADDM) et, sans significativité, Q2 « les monstres jouent dans les pics » (ADDM 87,5 %, AADM 95 %) les
     entament. Dans toutes les hypothèses, AADM gagne au moins autant de graines qu'ADDM.

**Conclusion prudente** :
- Dans ce simulateur, ADDM et AADM sont **équivalentes en taux de victoire quand les cadeaux sont fréquents**, avec
  des profils différents.
- ADDM est plus rapide sur la Mama mais **dépend des cadeaux** (Relâchement de Fureur) ; quand ils sont rares, AADM
  est significativement plus sûre (95 % contre 81 %).
- AADM place plus de monstres en pics et ne perd jamais nettement face à ADDM dans les hypothèses testées : c'est le
  choix le plus robuste, ADDM le choix le plus rapide.
- L'IA des monstres n'est pas validée : ces conclusions valent pour ce simulateur.

---

## 1. Protocole

| Élément | Choix |
|---|---|
| Planificateur | Version finale de la boucle d'amélioration (tour 4), **corrigée par la revue** (copies de planification sans connaissance des tirages futurs ; un sort imaginé absent du grimoire réel déclenche une replanification), mode `fast`, **déterministe** (budget de nœuds seul, pas de plafond de temps) ; aucun réglage modifié pendant les expériences |
| Monstres | IA du module `ai` (profils de `config.ai`, politique `D:mon.aiModel`) |
| Politiques par défaut | Acclamations `planner`, votes `planner`, cadeaux `planner`, placement automatique (J1 sur 314, J2 sur 287, J3 sur 286, J4 sur 315) |
| Graines | **1001 et plus**, jamais utilisées pendant l'amélioration (graines 1 à 768) |
| Appariement | Toutes les variantes d'une expérience sont jouées sur les **mêmes graines**. La graine fixe les jets et les tirages du scénario : vagues, cadeaux, cartes, votes, avec des flux dérivés par nature de tirage. Un combat est entièrement déterminé par (variante, graine) : les combats ADDM / AADM sont donc partagés entre expériences (cache). Le planificateur, lui, ne voit pas ces tirages avant qu'ils aient lieu |
| Arrêt | Fin du combat, ou au-delà du T20 (`maxTurn`, compté comme non-victoire) |
| Statistiques | Taux de victoire avec **IC de Wilson à 95 %** ; comparaisons appariées par **test exact de McNemar** (graines où une seule des deux variantes gagne) ; différences appariées de progression, de morts et de tour de mort de la Mama, avec IC normal à 95 % |
| Progression | Fraction des PV ennemis de tout le combat (10 vagues + Mama) détruits |
| Volume | 4 000 combats distincts (dont 160 du planificateur tricheur, section 4.4), 5,6 heures de calcul, soit 90 minutes sur 4 cœurs (≈ 5 s de calcul par combat à 4 joueurs) |

Les expériences marquées « analysées » sont rejouées depuis leur trace par l'API publique, avec le journal
d'événements du moteur. Ce rejeu donne les statistiques par tour, les sorts, les mises en pics et les vagues
(méthode : `docs/ARCHITECTURE.md`, section « Analyse et campagnes d'expériences »). Chaque rejeu est vérifié : même
issue et même tour final que le combat joué.

---

## 2. Compositions

### 2.1 ADDM contre AADM (200 graines, 1001-1200)

| Variante | Victoires | IC 95 % (Wilson) | Progression | Tour final | Objectifs | Morts / combat | Mama tuée (tour moyen) |
|---|---|---|---|---|---|---|---|
| ADDM | 196 / 200 (98,0 %) | 95,0 – 99,2 % | 99,36 % | 10,81 | 5,17 | 0,155 | 98,5 % (T9,15) |
| AADM | 198 / 200 (99,0 %) | 96,4 – 99,7 % | 99,92 % | 11,09 | 5,33 | 0,075 | 99,0 % (T10,13) |

| Comparaison appariée AADM − ADDM | Valeur |
|---|---|
| Graines gagnées par une seule composition | AADM 4, ADDM 2 (McNemar p = 0,69) |
| Δ progression | +0,56 point [−0,15 ; +1,27] |
| Δ morts par combat | −0,080 [−0,196 ; +0,036] |
| Δ tour de mort de la Mama (195 graines) | **+0,98 tour [0,76 ; 1,21]** ; ADDM plus rapide sur 127 graines, AADM sur 25 |

Répartition du tour de mort de la Mama et du tour de victoire :

| | Mama tuée au T8 | T9 | T10 | T11 | T12 et plus / jamais | Victoire au T10 | T11 | T12 et plus / défaite |
|---|---|---|---|---|---|---|---|---|
| ADDM | **41 %** | 26 % | 17 % | 10 % | 7 % | **31 %** | 59 % | 10 % |
| AADM | 3 % | 32 % | 25 % | 32 % | 10 % | 11 % | 76 % | 13 % |

Lecture :
- Avec les hypothèses par défaut, les deux compositions gagnent presque toujours. Aucune différence de victoire
  n'est détectable : avec 200 graines, un écart de 2 points de taux de victoire ne le serait déjà pas.
- Les 4 défaites d'ADDM (graines 1012, 1102, 1147, 1153) sont des effondrements : deux commencent par la mort de
  l'Acrobate au T5, les deux autres par celle d'un Dompteur (T5, T9). Les 2 défaites d'AADM (1098, 1171) commencent
  par la mort du Magicien (T8, T10) et finissent aux T14-T16.
- La différence nette porte sur le **rythme contre la Mama**. ADDM la tue dans la fenêtre du T8 dans 41 % des
  combats (deux Relâchements de Fureur possibles, ÉTUDE §10.1) ; AADM la laisse vivre en moyenne un tour de plus.
- Coût pour AADM : +9 100 PV perdus par combat face à la Mama. Ce coût ne se traduit pas en morts avec les
  hypothèses par défaut (AADM meurt deux fois moins qu'ADDM, différence non significative).

### 2.2 Autres compositions à 4 (60 graines, 1001-1060)

| Composition (ordre de jeu) | Victoires | IC 95 % | Progression | Morts / combat | Mama tuée au T8 | McNemar contre la référence |
|---|---|---|---|---|---|---|
| **ADDM** (référence) | 59 (98,3 %) | 91,1 – 99,7 % | 99,3 % | 0,12 | 50 % | — |
| **AADM** | 60 (100 %) | 94,0 – 100 % | 100 % | 0,05 | 2 % | 1 / 0 contre ADDM ; Mama +1,02 tour [0,58 ; 1,46] |
| AAMD (Magicien avant le Dompteur) | 60 (100 %) | 94,0 – 100 % | 100 % | 0,00 | 2 % | 0 / 0 contre AADM ; Mama −0,03 tour [−0,43 ; 0,37] |
| ADMD | 60 (100 %) | 94,0 – 100 % | 100 % | 0,10 | 38 % | 1 / 0 contre ADDM ; Mama +0,25 tour [−0,20 ; 0,71] |
| ADMM | 60 (100 %) | 94,0 – 100 % | 100 % | 0,12 | 8 % | 1 / 0 contre ADDM ; Mama +1,27 tour [0,79 ; 1,75] |
| AMDD | 58 (96,7 %) | 88,6 – 99,1 % | 99,8 % | 0,20 | 32 % | 1 / 2 contre ADDM |
| DADM (Acrobate en 2e) | 57 (95,0 %) | 86,3 – 98,3 % | 99,1 % | 0,30 | 5 % | 1 / 3 contre ADDM (p = 0,63) ; Mama +1,61 tour [1,14 ; 2,07] |
| ADDD | 42 (70,0 %) | 57,5 – 80,1 % | 93,4 % | 1,57 | 33 % | **1 / 18 contre ADDM (p < 0,001)**, −5,9 points de progression [−9,5 ; −2,3] |
| DDDM (sans Acrobate) | 12 (20,0 %) | 11,8 – 31,8 % | 65,4 % | 3,08 | 3 % | **0 / 47 (p < 0,001)**, −33,9 points de progression |

Indicateurs issus de l'analyse des combats (moyennes par combat) :

| Composition | Mises en pics par un joueur | Monstres entrés en pics | Tués avant leur 1er tour | PV ennemis restants fin T8 | PV perdus par l'équipe | dont Mama |
|---|---|---|---|---|---|---|
| ADDM | 29,8 | 91,5 % | 53,6 % | 27 400 | 70 700 | 18 400 |
| AADM | 33,0 | 99,1 % | 45,4 % | 55 400 | 66 300 | 28 400 |
| AAMD | 33,0 | 99,2 % | 39,4 % | 60 000 | 65 300 | 28 300 |
| ADMD | 29,9 | 91,4 % | 49,5 % | 30 600 | 74 300 | 21 400 |
| ADMM | 32,1 | 96,6 % | 52,0 % | 53 600 | 77 700 | 21 800 |
| AMDD | 29,8 | 91,5 % | 36,8 % | 32 400 | 83 000 | 23 200 |
| DADM | 27,5 | 81,6 % | 49,5 % | 72 200 | 117 100 | 34 400 |
| ADDD | 27,1 | 83,7 % | 42,5 % | 47 200 | 97 200 | 27 900 |
| DDDM | 8,2 | 29,4 % | 36,6 % | — | 179 400 | 35 300 |

Lecture :
- **L'Acrobate en premier** reste le meilleur placement. Mis en 2e (DADM), il fait perdre des mises en pics (82 %
  contre 92 %), fait presque doubler les dégâts subis et retarde la Mama de 1,6 tour ; l'écart de victoire (3
  graines contre 1) n'est pas significatif.
- **Le Magicien est utile** : ADDD perd 18 graines de plus qu'ADDM (p < 0,001) et meurt 13 fois plus.
- **Magicien avant Dompteur** (AAMD, AMDD) : aucune différence de victoire. L'ÉTUDE §10.1 (variante AAMD, « boosts
  avant la frappe ») n'est donc pas confirmée comme un gain.

### 2.3 Effectifs réduits (30 graines, 1001-1030)

| Équipe | Victoires | IC 95 % | Progression | Tour final | Morts / combat |
|---|---|---|---|---|---|
| ADDM | 29 (96,7 %) | 83,3 – 99,4 % | 98,6 % | 11,0 | 0,20 |
| ADM | 22 (73,3 %) | 55,6 – 85,8 % | 89,9 % | 13,1 | 0,87 |
| AAD | 12 (40,0 %) | 24,6 – 57,7 % | 88,0 % | 13,8 | 1,90 |
| ADD | 5 (16,7 %) | 7,3 – 33,6 % | 67,6 % | 10,1 | 2,53 |
| AD | 0 | 0 – 11,4 % | 39,4 % | 8,0 | 2,00 |
| DD | 0 | 0 – 11,4 % | 11,8 % | 4,1 | 2,00 |
| A / D / M seuls | 0 | 0 – 11,4 % | 14 % / 7 % / 3 % | 4,6 – 5,5 | 1,00 |

Quatre joueurs sont nécessaires pour une victoire fiable. ADM contre ADDM : 8 graines perdues contre 1 (p = 0,039),
et le combat dure 2 tours de plus. À deux joueurs, le combat est perdu avant l'arrivée de la Mama ou peu après.

---

## 3. Politiques

### 3.1 Acclamations (bonus)

**Hypothèses par défaut** (60 graines) :

| Politique | ADDM victoires | ADDM progression | AADM victoires | AADM progression |
|---|---|---|---|---|
| planner (défaut, selon l'archétype) | 59 (98,3 %) | 99,3 % | 60 (100 %) | 100 % |
| PO_first | 59 (98,3 %) | 99,7 % | 59 (98,3 %) | 99,5 % |
| PA_first | 58 (96,7 %) | 99,9 % | 60 (100 %) | 100 % |
| DF_first | 60 (100 %) | 100 % | 60 (100 %) | 100 % |

Aucun écart significatif : toutes les p de McNemar valent 1 (au plus 2 graines de différence).

**Scénario pessimiste** (section 4.3, 60 graines, 1001-1060) :

| Politique | ADDM victoires [IC 95 %] | McNemar contre planner | AADM victoires [IC 95 %] | McNemar contre planner |
|---|---|---|---|---|
| planner | 41 (68,3 %) [55,8 ; 78,7] | — | 38 (63,3 %) [50,7 ; 74,4] | — |
| PO_first | **29 (48,3 %)** [36,2 ; 60,7] | **5 / 17, p = 0,017** ; −7,6 points de progression [−12,3 ; −2,9] | 32 (53,3 %) [40,9 ; 65,4] | 11 / 17, p = 0,35 |
| PA_first | 40 (66,7 %) [54,1 ; 77,3] | 9 / 10, p = 1 | 41 (68,3 %) [55,8 ; 78,7] | 9 / 6, p = 0,61 |
| DF_first | 41 (68,3 %) [55,8 ; 78,7] | 11 / 11, p = 1 | 37 (61,7 %) [49,0 ; 72,9] | 13 / 14, p = 1 |

Choix de la politique `planner` (par combat, 200 combats de `compos-ref`) :
- ADDM, Dompteurs (les deux réunis) : « puissante » (+10 % DF) 6,1 fois, puis +1 PA (5,3), +1 PO (2,9) ;
- ADDM, Acrobate : +1 PO (3,2), puis +1 PA (2,4) ;
- Magicien : +20 % de soins (3,3), puis PO / PA.

Dans AADM, les Acrobates prennent +1 PO 6,5 fois par combat.

Conclusion :
- Une politique **uniforme** « PO d'abord » est nettement néfaste pour ADDM quand le combat devient difficile. Les
  deux Dompteurs perdent leurs dommages finaux (ÉTUDE §10.6 : « +10 % DF » est la meilleure carte du Dompteur).
- La question « PO d'abord ou PA d'abord » (ÉTUDE §10.6) ne se tranche que **par archétype** : PO pour l'Acrobate,
  DF ou PA pour les Dompteurs. Aucune politique uniforme ne bat la politique par archétype du planificateur.

### 3.2 Votes d'objectifs (60 graines)

| Politique | ADDM victoires / objectifs | AADM victoires / objectifs |
|---|---|---|
| planner (préférence × faisabilité) | 59 / 5,45 | 60 / 5,52 |
| fixed (`objectives.fixedVoteOrder`) | 59 / 5,60 | 60 / 5,62 |
| preference (ÉTUDE §7.3) | 59 / 5,60 | 60 / 5,62 |

Aucun écart de victoire (0 / 0 partout). Les politiques `fixed` et `preference` donnent ici les mêmes votes, car
chaque vote ne propose que 2 objectifs. Les objectifs les plus souvent validés sont les mêmes pour ADDM et AADM
(200 combats) :

| Objectif | Validé dans | Tour moyen |
|---|---|---|
| Empalé | 100 % des combats | T1 |
| Stop aux projectiles | ≈ 50 % | T2 |
| Distance d'insécurité | ≈ 47 % | T3 |
| Productivité | ≈ 47 % | T1 |
| Tout va bien | ≈ 45 % | T4 |

Environ 5,2 à 5,3 objectifs sont validés par combat, sur 6 possibles.

### 3.3 Placement initial (60 graines)

| Placement (cases de J1, J2, J3, J4) | Victoires | Morts / combat | McNemar contre défaut |
|---|---|---|---|
| ADDM 314, 287, 286, 315 (défaut) | 59 | 0,12 | — |
| ADDM A sur 287, D1 sur 314 | 59 | 0,08 | 1 / 1 |
| ADDM A sur 314, M sur 287 | 58 | 0,12 | 1 / 2 |
| ADDM A sur 286 | 59 | 0,08 | 1 / 1 |
| AADM 314, 287, 286, 315 (défaut) | 60 | 0,05 | — |
| AADM A1 sur 287, A2 sur 314 | 60 | 0,05 | 0 / 0 |
| AADM A2 sur 286, D sur 287 | 60 | 0,02 | 0 / 0 |

Le placement initial ne change pas l'issue. Même depuis 286, le planificateur trouve une ouverture qui met les
deux Troollibres de V1 en pics (100 % des V1 entrent en pics, voir section 5). Le « placement T7 » de l'ÉTUDE
§10.7 n'a pas été testé comme politique séparée : il est décidé par le planificateur à chaque tour.

---

## 4. Sensibilité aux hypothèses non tranchées

### 4.1 Hypothèses une à une (40 graines, 1001-1040, ADDM et AADM)

| Hypothèse (question) | ADDM victoires | AADM victoires | AADM seule / ADDM seule (p) | Mama tuée au T8 (ADDM / AADM) |
|---|---|---|---|---|
| Défaut | 39 | 40 | 1 / 0 | 19 / 1 |
| Joueurs ×2 dans les pics (Q3) | 39 | 40 | 1 / 0 | 20 / 3 |
| Pics : 2 000 au début du tour des joueurs (Q4) | 37 | 40 | 3 / 0 (p = 0,25) | 19 / 2 |
| Timeline : Troolls par initiative (Q1) | 38 | 40 | 2 / 0 (p = 0,50) | 14 / 2 |
| Timeline : nouveaux venus en tête (Q1) | 39 | 40 | 1 / 0 | 19 / 1 |
| **Timeline : tous les Troolls après la Mama (Q1)** | **0** | **0** | 0 / 0 ; progression **−7,0 points** pour AADM [−10,4 ; −3,6] | 0 / 0 |
| Apparitions uniformes (Q5) | 38 | 40 | 2 / 0 (p = 0,50) | 15 / 1 |
| IA : cible la plus faible (Q2) | 40 | 40 | 0 / 0 | 19 / 2 |
| IA : joue même dans les pics (Q2) | 35 | 38 | 5 / 2 (p = 0,45) | 14 / 2 |
| IA : séquence gloutonne (Q2) | 39 | 40 | 1 / 0 | 18 / 2 |
| 3 objectifs proposés par vote (Q12) | 39 | 40 | 1 / 0 | 14 / 1 |
| **Cadeaux rares, p = 0,3 (Q14)** | **32** | **38** | **7 / 1 (p = 0,070)** ; ADDM rares contre ADDM : 1 / 8 (p = 0,039) | 8 / 2 |
| PV par archétype : A 35 000, M 25 000 (Q20) | 40 | 40 | 0 / 0 | 18 / 2 |

Lecture :
- **Q1, variante `monsters_after_mama`** : le jeu devient ingagnable pour ce planificateur. Tous les joueurs meurent
  vers T5-T6, progression de 15 à 22 %.
  - Les joueurs réels gagnent régulièrement, et les vidéos montrent qu'il faut « tuer le Trooll qui joue juste après
    soi ». Ces résultats vont donc dans le sens de l'hypothèse par défaut (alternance), sans le prouver : le
    planificateur n'est pas un joueur humain.
  - C'est la seule hypothèse qui renverse le jeu. Sous cette hypothèse, ADDM progresse plus loin qu'AADM.
- **Q14** : avec 40 graines, ADDM perd 8 combats et AADM 2. Cette hypothèse a été reprise sur 160 graines (4.2).
- **Q2 « les monstres jouent même dans les pics »** entame les deux compositions (ADDM 87,5 %, AADM 95 %), sans écart
  significatif sur 40 graines.
- Toutes les autres hypothèses, y compris Q3 (joueurs ×2 dans les pics) et Q4 (2 000 au début du tour) prises
  séparément, laissent les deux compositions à 92 % ou plus. Le **rythme contre la Mama** (ADDM plus rapide) est
  stable sous toutes les hypothèses, et AADM gagne au moins autant de graines qu'ADDM dans chacune.

### 4.2 Cadeaux rares (Q14), confirmation sur 160 graines (1001-1160)

| Variante | Victoires | IC 95 % | Morts / combat | Mama tuée au T8 | Mama jamais tuée ou après T13 |
|---|---|---|---|---|---|
| ADDM (p = 0,72) | 156 (97,5 %) | 93,7 – 99,0 % | 0,18 | 46 % | 2,5 % |
| AADM (p = 0,72) | 159 (99,4 %) | 96,5 – 99,9 % | 0,06 | 3 % | 0,6 % |
| ADDM, cadeaux rares | 130 (81,3 %) | 74,5 – 86,5 % | 0,87 | 11 % | 20 % |
| AADM, cadeaux rares | 152 (95,0 %) | 90,4 – 97,4 % | 0,31 | 3 % | 11 % |

| Comparaison appariée | Seul A gagne / seul B gagne | McNemar p | Δ progression |
|---|---|---|---|
| AADM / ADDM (cadeaux normaux) | 4 / 1 | 0,38 | +0,71 point [−0,18 ; +1,59] |
| ADDM rares / ADDM | 2 / 28 | **< 0,001** | −2,80 points [−4,51 ; −1,09] |
| AADM rares / ADDM rares | 27 / 5 | **< 0,001** | +2,79 points [+1,22 ; +4,35] |

L'effet des cadeaux sur ADDM est certain, et **l'avantage d'AADM quand les cadeaux sont rares est maintenant
démontré** (27 graines contre 5). Avant la correction du planificateur (section 4.4), on lisait 145 contre 152
victoires (p = 0,19) : l'anticipation tricheuse, qui connaissait les cadeaux et les cartes à venir, aidait surtout
ADDM, dont le jeu repose sur ces cartes.

Explication : dans les combats par défaut, les Dompteurs d'ADDM prennent le Relâchement de Fureur 1,36 fois par
combat, contre 0,67 pour AADM. Cette carte fait la mise à mort rapide de la Mama (8 300 PV ôtés par PA). Avec peu
de cadeaux, la Mama survit, et les pertes d'ADDM se concentrent au T9-T11, sous la double pression de la Mama et
de V9-V10.

### 4.3 Scénario pessimiste combiné (160 graines, 1001-1160)

Hypothèses combinées :
- Q3 : joueurs ×2 dans les pics ;
- Q4 : 2 000 PV au début du tour d'un joueur dans les pics ;
- Q2 : les monstres jouent même dans les pics ;
- Q14 : cadeaux rares.

La variante Q1 `monsters_after_mama`, ingagnable, en est exclue (un premier essai, avant la revue, l'incluait :
0 victoire sur 120 combats).

| Variante | Victoires | IC 95 % (Wilson) | Progression | Morts / combat | Mama tuée | Tour de victoire médian |
|---|---|---|---|---|---|---|
| ADDM | 94 (58,8 %) | 51,0 – 66,1 % | 87,3 % | 1,79 | 59 % (T10,3) | T11 |
| AADM | 95 (59,4 %) | 51,6 – 66,7 % | 90,6 % | 1,86 | 61 % (T11,5) | T12 |

Comparaison appariée AADM − ADDM :

| Mesure | Valeur |
|---|---|
| Graines gagnées par une seule composition | AADM 29, ADDM 28 (**p = 1**) |
| Δ progression | +3,3 points [−0,1 ; +6,7] |
| Δ morts | +0,07 [−0,28 ; +0,41] |
| Δ tour de mort de la Mama (68 graines) | +1,22 tour [0,77 ; 1,67] |

Quand le combat devient difficile (≈ 40 % de défaites), **aucune des deux compositions ne se détache** sur le taux
de victoire ; AADM progresse un peu plus loin (limite de la significativité). Sur les 60 premières graines seulement
(expérience `bonus-pess`), on lirait ADDM 68,3 % contre AADM 63,3 %.

Les profils de pertes diffèrent :

| | ADDM | AADM |
|---|---|---|
| Morts par archétype | Dompteurs 145, Magicien 72, Acrobate 70 | Acrobates 155, Dompteur 72, Magicien 71 |
| Morts entre T5 et T8 | 80 | 43 |
| Morts à partir du T9 | 206 | 253 |
| Morts causées par la Mama | 87 | 88 |
| Morts causées par les pics | 47 | 30 |

### 4.4 Effet de l'information cachée : planificateur tricheur contre planificateur corrigé (80 graines, 1001-1080)

La revue a montré que la première version du planificateur anticipait avec les **vrais** tirages futurs du scénario
(docs/VERIFICATION.md). L'expérience `oracle` rejoue le scénario pessimiste avec les deux versions sur les mêmes
graines (`planner.oracle: true` : copies de planification avec la vraie graine).

| Variante | Victoires | IC 95 % | Progression | Morts / combat |
|---|---|---|---|---|
| ADDM, planificateur corrigé | 54 (67,5 %) | 56,6 – 76,8 % | 91,1 % | 1,60 |
| ADDM, planificateur tricheur | 68 (85,0 %) | 75,6 – 91,2 % | 96,9 % | 0,84 |
| AADM, planificateur corrigé | 52 (65,0 %) | 54,1 – 74,5 % | 92,7 % | 1,73 |
| AADM, planificateur tricheur | 62 (77,5 %) | 67,2 – 85,3 % | 95,2 % | 1,20 |

| Comparaison appariée | Seul le tricheur gagne / seul le corrigé gagne | McNemar p | Δ progression | Δ morts |
|---|---|---|---|---|
| ADDM | 17 / 3 | **0,003** | +5,8 points [+2,2 ; +9,3] | −0,76 [−1,13 ; −0,39] |
| AADM | 18 / 8 | 0,076 | +2,5 points [−1,2 ; +6,2] | −0,53 [−0,99 ; −0,06] |

Avec les hypothèses par défaut, l'effet est faible mais de même sens : `compos-ref` passe de 199 à 196 victoires
pour ADDM et de 200 à 198 pour AADM. La triche aidait davantage ADDM (connaître les cartes des cadeaux à venir
favorise la composition qui en dépend) : c'est elle qui masquait l'avantage d'AADM avec des cadeaux rares (4.2).

---

## 5. Analyse des combats (ADDM et AADM, hypothèses par défaut, 200 graines)

### 5.1 Déroulé moyen par tour global

Moyennes en fin de tour global, sur les combats qui atteignent ce tour ; « PV ennemis » = PV restants des monstres
présents.

| Tour | ADDM PV ennemis | ADDM tués / entrées en pics | AADM PV ennemis | AADM tués / entrées en pics | Objectifs cumulés (ADDM / AADM) |
|---|---|---|---|---|---|
| T1 | 0 | 2,0 / 2,0 | 0 | 2,0 / 2,0 | 1,71 / 1,71 |
| T2 | 870 | 2,8 / 3,0 | 4 000 | 2,8 / 3,0 | 2,57 / 2,60 |
| T3 | 4 080 | 3,0 / 2,8 | 7 150 | 2,9 / 3,0 | 3,13 / 3,26 |
| T4 | 6 360 | 2,8 / 2,7 | 10 280 | 2,7 / 2,9 | 3,60 / 3,76 |
| T5 | 10 950 | 2,8 / 2,4 | 15 830 | 2,8 / 2,9 | 3,85 / 4,01 |
| T6 | 7 520 | 3,4 / 3,0 | 9 420 | 3,6 / 3,1 | 4,21 / 4,36 |
| T7 | 30 180 | 3,0 / 2,6 | 22 900 | 2,9 / 3,0 | 4,34 / 4,45 |
| **T8** (Mama) | **27 240** | 0,6 / 1,0 | **58 460** | 0,3 / 1,0 | 4,44 / 4,55 |
| **T9** (V9 : 5 monstres) | 22 650 | 4,6 / 4,8 | 43 890 | 4,3 / 5,7 | 4,95 / 5,03 |
| **T10** (V10 : 6 monstres) | 28 880 | 5,2 / 4,9 | 46 840 | 5,1 / 6,2 | 5,15 / 5,28 |
| T11 (135 / 179 combats) | 6 240 | 2,2 / 1,1 | 6 520 | 2,6 / 0,8 | 5,10 / 5,34 |

Moments critiques :

- **T1 à T7** : chaque vague est presque entièrement éliminée dans son tour d'apparition (77 à 100 % des monstres).
  Il reste rarement plus d'un monstre en fin de tour. Au T7, les PV restants grimpent (23 000 à 30 000) : des
  monstres de V7 survivent, probablement parce que le planificateur se place pour le T8.
- **T7 / T8** : l'arrivée de la Mama est le pic de PV ennemis pour AADM (58 500 en fin de T8) : la Mama est encore
  vivante en fin de T8 dans 97 % de ses combats. ADDM la tue au T8 dans 41 % des combats (27 200 PV restants en
  moyenne). Les morts au T7-T8 sont rares (3 combats ADDM, 1 AADM).
- **V9 / V10** : c'est la vraie zone de danger.
  - Les PV de l'équipe tombent à 89-91 % en fin de T10 et à 84-88 % au T11.
  - 28 des 46 morts de joueurs (ADDM et AADM confondus) ont lieu au T10 ou après ; 4 combats ADDM perdent un joueur
    dès le T5.
  - Dans le scénario pessimiste, 60 combats sur 143 (ADDM) et 60 sur 150 (AADM) voient un joueur mourir au T10,
    et l'équipe finit le T10 à 56-59 % de ses PV.

### 5.2 Vagues : mises en pics et morts

| Vague (tour) | Entrés en pics : ADDM / AADM | Tués avant leur 1er tour | Tués dans leur tour d'apparition |
|---|---|---|---|
| V1 (T1) | 100 % / 100 % | 31 % / 36 % | 100 % / 100 % |
| V2 (T2) | 100 % / 100 % | 39 % / 31 % | 93 % / 92 % |
| V3 (T3) | 94 % / 99,7 % | 53 % / 42 % | 92 % / 90 % |
| V4 (T4) | 92 % / 98 % | 51 % / 43 % | 87 % / 83 % |
| V5 (T5) | 81 % / 98 % | 45 % / 37 % | 80 % / 77 % |
| V6 (T6) | 98 % / 99,8 % | 69 % / 64 % | 97 % / 96 % |
| V7 (T7) | 88 % / 98,5 % | 56 % / 44 % | 96 % / 91 % |
| V9 (T9) | 93 % / 99,6 % | 61 % / 50 % | 88 % / 79 % |
| V10 (T10) | 87 % / 99,3 % | 60 % / 52 % | 77 % / 68 % |

AADM met en pics presque tous les monstres (≥ 98 % de V2 à V10). ADDM en laisse davantage hors des pics (81 à 92 %
en V4, V5, V7 et V10), mais en tue une plus grande part avant qu'ils jouent. Cela illustre la complémentarité des
principes « mettre en pics avant qu'il joue » et « tuer le suivant » de l'ÉTUDE §10.2. Presque tous les monstres
tués meurent sur une case de pics.

### 5.3 Sorts les plus utilisés et les plus rentables

Par joueur de l'archétype et par combat, ADDM (200 combats). « PV ôtés » = dégâts aux ennemis dans la fenêtre du
lancer : dégâts directs, collisions, dégâts d'entrée dans les pics.

| Archétype | Sort | Lancers | PV ôtés | PV / PA | Mises en pics |
|---|---|---|---|---|---|
| Acrobate | Videur | 16,4 | 184 500 | 2 810 | 14,1 |
| Acrobate | Hanedimane | 5,2 | 18 800 | 1 200 | 7,7 |
| Acrobate | Dégagez ! (unique) | 0,6 | 6 700 | 2 120 | 2,2 |
| Acrobate | Voltige | 1,6 | 11 600 | 1 770 | 1,2 |
| Dompteur | Impact | 11,0 | 119 800 | 2 720 | — |
| Dompteur | Grondement Grandissant | 4,3 | 65 900 | 3 800 | — |
| Dompteur | Relâchement de Fureur (unique) | 0,7 | 28 100 | **8 310** | — |
| Dompteur | Punition Collective (unique) | 0,5 | 19 700 | **7 750** | — |
| Dompteur | Pulsation Chaotique (unique) | 0,2 | 6 800 | **7 540** | — |
| Dompteur | Coup de Sang | 0,6 | 10 200 | 4 080 | — |
| Dompteur | Prélèvement | 2,5 | 12 700 | 1 680 | — |
| Magicien | Pulsation d'Énergie | 10,5 | 13 100 | 420 | — |
| Magicien | Amplification / Regain Vigoureux | 5,1 / 3,3 | (soutien) | — | — |

Lecture :
- **Volume** : Videur (Acrobate) et Impact (Dompteur) font l'essentiel des dégâts. Videur produit à lui seul 47 %
  des mises en pics d'ADDM et 52 % de celles d'AADM ; Hanedimane en produit 26 %.
- **Rendement** : les sorts uniques des cadeaux (Relâchement de Fureur, Punition Collective, Pulsation Chaotique)
  rendent 7 500 à 8 300 PV par PA, 2 à 3 fois plus que les meilleurs sorts de base. D'où la sensibilité d'ADDM à la
  fréquence des cadeaux (4.2).
- **Magicien** : ses dégâts propres sont faibles (420 PV par PA). Son apport est indirect : Amplification (+DF des
  Dompteurs), Regain (PA / PM) et soins. L'écart ADDD / ADDM (2.2) le mesure.
- **Frappe Repoussoir** (tous archétypes) : peu de dégâts, utilisée en finition et pour quelques mises en pics.

### 5.4 Cases les plus utilisées pour les mises en pics

Déplacements forcés causés par un joueur qui font entrer un ennemi dans les pics : 29,9 par combat pour ADDM,
32,9 pour AADM.

| Départ → arrivée | ADDM (200 combats) | AADM (200 combats) |
|---|---|---|
| 358 → 402 | 280 | 284 |
| 242 → 199 | 247 | 250 |
| 370 → 424 | 185 | 206 |
| 218 → 178 | 159 | 189 |
| 386 → 430 | 135 | 155 |
| 214 → 171 | 135 | 151 |
| 353 → 394 | 129 | 168 |
| 359 → 403 | 127 | 147 |
| 230 → 172 | 114 | 129 |

Les cases d'arrivée les plus fréquentes sont 402, 199, 424, 403, 178, 394, 430, 212, 207, 171 et 177. Les deux
premières poussées (358 → 402 et 242 → 199) sont l'ouverture du T1 décrite par l'ÉTUDE §10.4 (Videur sur les deux
Troollibres de V1), retrouvée par le planificateur dans la quasi-totalité des combats. Les suivantes correspondent
aux cases d'apparition fréquentes de V2 à V10, poussées vers l'anneau de pics le plus proche.

### 5.5 Dégâts subis par les joueurs (PV par combat)

| Source | ADDM | AADM | ADDM pessimiste | AADM pessimiste |
|---|---|---|---|---|
| Artroolleur | 16 600 | 19 400 | 28 600 | 33 000 |
| Mama | 19 600 | 28 700 | 38 200 | 46 800 |
| Troollibre | 22 200 | 10 800 | 85 000 | 76 500 |
| Nitrooll | 2 900 | 1 100 | 7 200 | 6 300 |
| Pics | 5 200 | 4 500 | 15 800 | 15 700 |
| Alliés (dégâts de zone) | 3 300 | 2 000 | 2 500 | 1 400 |
| Poussées | 600 | 700 | 1 000 | 1 300 |

AADM subit plus de dégâts de la Mama, qui vit plus longtemps, et deux fois moins des Troollibres, mieux mis en pics.
ADDM se blesse davantage lui-même, probablement par les zones des Dompteurs.

---

## 6. Conclusions

1. **Quatre joueurs, dont au moins un Acrobate joué en premier, et un Magicien** : ce résultat est robuste (écarts
   de 17 à 47 graines, p < 0,001, pour ADDD et DDDM ; ADM contre ADDM p = 0,039).
2. **ADDM contre AADM : équivalence en taux de victoire** avec les hypothèses par défaut et dans le scénario
   pessimiste. L'écart éventuel est de l'ordre de quelques points au plus : il faudrait plusieurs milliers de
   combats appariés pour le mesurer, et il resterait à la merci de la fidélité de l'IA des monstres.
3. **Cadeaux rares → AADM** : c'est la seule situation où une des deux compositions de référence se détache
   nettement (95 % contre 81 %, p < 0,001).
4. **Les différences de style sont nettes et stables sous toutes les hypothèses** :
   - ADDM tue la Mama environ 1 tour plus tôt (T8 dans 41 % des combats) mais dépend des cadeaux (Relâchement de
     Fureur) ;
   - AADM met en pics davantage de monstres et encaisse la Mama plus longtemps.
   Le choix peut donc suivre le contexte : cadeaux rares ou partie sans unique → AADM ; objectif de vitesse sur la
   Mama avec des cadeaux fréquents → ADDM.
5. **Acclamations** : choisir par archétype (Dompteur : +10 % DF ou +1 PA ; Acrobate : +1 PO). « PO pour tous » est
   à éviter avec deux Dompteurs (p = 0,017 dans le scénario difficile).
6. **Votes et placement initial** : effet non mesurable ici (plafond).
7. **Hypothèse à trancher en priorité** : Q1 (timeline). C'est la seule qui renverse le jeu. Ensuite Q14 (fréquence
   des cadeaux), qui décide de l'écart entre les compositions, puis Q2 (les monstres jouent-ils dans les pics ?).

## 7. Limites

- **Fidélité de l'IA des monstres** : l'IA est paramétrée d'après les données (`aiModel`) et les observations VOD
  (ÉTUDE §5.8), sans validation quantitative contre des combats réels. Le planificateur anticipe avec une IA
  simplifiée proche de l'IA jouée : il connaît donc « trop bien » son adversaire, ce qui peut expliquer des taux de
  victoire proches de 100 % avec les hypothèses par défaut. En revanche, depuis la revue, il ne connaît plus les
  tirages futurs du scénario (vagues, cadeaux, cartes) : il les imagine avec une graine neutralisée.
- **Effet plafond** : avec les hypothèses par défaut, presque tous les combats sont gagnés. Les comparaisons de
  politiques n'y ont aucune puissance. Seuls les scénarios dégradés (Q14, pessimiste) discriminent, et ils combinent
  des hypothèses dont la plausibilité n'est pas établie.
- **Taille des échantillons** : 40 à 200 graines par variante. Une IC de Wilson à 200 combats et 100 % de victoires
  va de 98,1 à 100 % ; un écart réel de 1 à 3 points reste indétectable. Les petits échantillons trompent : à 60 graines,
  le scénario pessimiste donne ADDM devant AADM (68 % contre 63 %) ; à 160 graines, ils sont à égalité.
- **Planificateur ≠ joueur** : les résultats mesurent ce que *ce planificateur* obtient avec chaque composition. Une
  composition peut profiter davantage d'un meilleur jeu, par exemple la coordination des deux Acrobates ou la
  gestion de la fenêtre de la Mama. Aucun réglage du planificateur n'a été adapté à une composition. Les poids ont
  été mis au point sur ADDM et AADM (graines 1 à 768), ce qui favorise peut-être ces deux compositions par rapport
  aux autres.
- **Hypothèses non testées ici** : spawn `structured_slots` / `most_frequent`, `boss.*` (Q9-Q11, Q21),
  `spikes.triggerWhenWalkingThrough` (Q6), `spikes.stackExitAndInside` (Q7), uniques (Q15-Q17), attribution des
  morts (Q18). Les hypothèses sont testées une à une ; seul le scénario pessimiste en combine quatre.
- **Attribution des dégâts aux sorts** (5.3) : c'est une convention (fenêtre du lancer). Les sorts de préparation
  (Amplification, Galvanisation, Pugnace) et les dégâts des pics au début du tour des monstres ne sont crédités à
  personne.
- **Temps** : le mode `fast` (≈ 120 ms médians, 220 à 270 ms au 95e centile par tour de joueur) est plus faible que
  le mode `deep`. Les conclusions valent pour ce budget.
- **Futur imaginé** : le planificateur corrigé imagine UN tirage plausible des vagues et cadeaux à venir (graine
  neutralisée), pas une espérance sur plusieurs tirages. Une anticipation par échantillonnage de plusieurs futurs
  serait plus juste (et plus lente).

## 8. Reproduire

Toutes les commandes se lancent depuis la racine du dépôt (Node 22, 4 cœurs) :

```sh
# liste des expériences (définitions : sim/src/analysis/campaigns.ts)
npx tsx sim/src/cli/campaign.ts liste

# une expérience → sim/results/<id>.json (+ tableau Markdown sur la sortie)
# (le cache ne connaît pas la version du code : partir d'un fichier vide après toute modification)
npx tsx sim/src/cli/campaign.ts compos-ref --coeurs 4 --cache /tmp/gladia-cache.jsonl

# tout, dans l'ordre du rapport ; le cache partage les combats communs (ADDM / AADM) entre expériences
npx tsx sim/src/cli/campaign.ts tout --coeurs 4 --cache /tmp/gladia-cache.jsonl

# tableaux complets (sim/results/TABLEAUX.md)
npx tsx sim/src/cli/report.ts > sim/results/TABLEAUX.md
npx tsx sim/src/cli/report.ts --experience compos-ref,pessimiste
```

Graines et variantes : `compos-ref` 1001-1200 ; `compos-autres`, `bonus`, `votes`, `placement`, `bonus-pess`
1001-1060 ; `effectifs` 1001-1030 ; `sensibilite` 1001-1040 ; `cadeaux` et `pessimiste` 1001-1160 ; `oracle` 1001-1080. L'option
`--graines a-b` permet de les changer.

Le mode fast étant déterministe, les mêmes commandes redonnent exactement les mêmes combats sur une autre machine,
avec le même code et les mêmes données ; seules les durées changent. Pour une vérification ponctuelle avec la CLI
existante :

```sh
npm run cli -- comparer --compos ADDM,AADM --graines 1001-1020 --coeurs 4
```

Elle donne les mêmes issues que les 20 premières graines de `compos-ref`.

## Fichiers

| Fichier | Contenu |
|---|---|
| `sim/results/compos-ref.json` … `bonus-pess.json`, `oracle.json` | un fichier par expérience : statistiques par variante (IC de Wilson), comparaisons appariées, analyses agrégées (expériences analysées), choix résumés, un enregistrement compact par combat |
| `sim/results/TABLEAUX.md` | tous les tableaux générés (variantes, Mama, morts, objectifs, par tour, sorts, cases, vagues, dégâts subis, choix) |
| `sim/src/analysis/` | analyse par rejeu, définitions des campagnes, mise en forme |
| `sim/src/cli/campaign.ts`, `sim/src/cli/report.ts` | exécution multi-processus et tableaux |
