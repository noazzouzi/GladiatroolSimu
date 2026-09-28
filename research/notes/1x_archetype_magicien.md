# 1x — Archétype MAGICIEN (nom interne « Guérisseur ») : fiche complète

> Agent « ARCHÉTYPE MAGICIEN ». Rédigé le 2026-09-28.
> Livrable machine : `research/data/archetype_magicien.json`, généré par
> `tools/archetypes/build_archetype_magicien.py` (stdlib ; `--summary` affiche un résumé console).
>
> **Étiquettes.**
> - **FAIT vérifié** : donnée du client DOFUS 3 exposée par DofusDB (`https://api.dofusdb.fr/...`, extraction
>   `research/raw/dofusdb/` du 2026-09-28, recoupée en direct le même jour pour 80517, 80518, 80791 et 80849), ou code du client (note 70).
> - **FAIT rapporté** : guide Dofus pour les Noobs (DPLN, <https://www.dofuspourlesnoobs.com/gladiatrool.html>, mise à jour
>   du 21/05/2026 : texte et **21 captures d'infobulles relues une à une**), ou vidéos (notes 50 et 60).
> - **HYPOTHÈSE** : déduction.
> - Confiance : **haute** / **moyenne** / **basse**.
>
> **Formules.** Dégâts, soins, zones et lignes de vue viennent de `tools/mechanics/` (`damage.py`, `zones.py`, `geometry.py`,
> `movement.py`). Ce sont des portages du client écrits par l'agent « formules » ; je les utilise sans les modifier.
> Carte : `research/data/map_139988488.json`. Noms d'actions DOFUS 3 : `research/data/action_ids_dofus3.json`.
> Même structure que la fiche Acrobate (`1x_archetype_acrobate.md`), pour que le simulateur lise les deux de la même façon.

---

## 0. Résumé

| Point | Résultat | Statut / confiance |
|---|---|---|
| Rôle | **Support.** Soins de zone, boucliers, boosts (+PA/+PM de groupe, Amplification), entrave (−PM, érosion, −dommages finaux). Il joue **en dernier** dans toutes les runs gagnantes filmées. | FAIT rapporté (DPLN, vidéos), haute |
| Stats | 30 000 PV, 8 PA, 4 PM, 6 000 Force (**×61 sur les dommages ET sur les soins**), 1 000 dommages de poussée, 10 % critique, sorts en neutre ; ne tacle pas et ne peut pas être taclé (état 5970) | DPLN + monstre 7980 + passif 30639 ; haute. PV : écart possible, voir § 1.2 |
| Sorts classiques, dans l'ordre d'obtention | **Pulsation d'Énergie** 30409 (départ) → **Regain Vigoureux** 30410 → **Amplification** 30411 → **Protection Prolongée** 30414 → **Délivrance** 30415 → **Vents Contraires** 30412 → **Vague de Dégradation** 30413 | FAIT vérifié (Spell Manager 30626 niv. 1 à 6) = ordre DPLN = vidéos, haute |
| Versions améliorées | 30575, 30576, 30578, 30584, 30585, 30579, 30580. Choix « Amélioration : X » = 30485 à 30491 | FAIT vérifié, haute |
| Sort commun | **Frappe Repoussoir** 30416 : 3 PA, poussée 2, 976–1 220 dégâts (critique 1 281–1 525) | FAIT vérifié ; DPLN « 1 200 » ✓ |
| Uniques (5 PA, usage unique) | Influx de Vitalité 30606, Démotivation des troupes 30607, Immortalité du Bienfaiteur 30620, Malédiction Régénérante 30621, Muraille collective 30622, Ultime Espoir 30623 ; Pense Vite 30615 (commun aux 3 archétypes) | FAIT vérifié, haute |
| Bonus « Acclamations » | +1 PA, +1 PM, +5 000 Vitalité, +1 PO, **+20 % soins finaux**, **+15 % résistance distance** ; permanents et cumulables | FAIT vérifié (30591 niv. 1 à 6), haute. DPLN écrit 10 % pour la résistance distance. |
| Chiffres clés | Pulsation : 2 684–2 928 de soin **et** de dégâts (critique 3 233–3 538), espérance ≈ 3 040 (DPLN « environ 3 000 » ✓). ×2 sur Vulnérable ≈ 6 080. Influx ≈ 18 200 à chaque allié. Muraille : 15 000 de bouclier à chaque allié. | FAIT vérifié + calcul, haute |
| Piège n°1 pour le simulateur | **Amplification améliorée** vaut +40 % dommages finaux / +50 % critique / +1 000 dommages de poussée / +40 % soins finaux (effets de 30578). La description du choix d'amélioration et la table DPLN donnent des valeurs fausses. | FAIT vérifié, haute |
| Piège n°2 | Les masques des effets d'Amplification testent « pas encore Amplifié » (`e5968`), alors que l'effet 0 pose cet état. Cela ne marche que parce que **toutes les cibles sont calculées avant le premier effet** (règle client, note 70 § 3.4). Le simulateur doit respecter cette règle. | FAIT vérifié, haute |

---

## 1. Identité et statistiques de base

### 1.1 Identité (FAIT vérifié, haute)

- **Nom affiché : Magicien. Nom interne : « Guérisseur ».** Les adminName et les types de sorts le confirment.
  - Types de sorts : 3887 « Sorts Magicien », 3903 « Sorts améliorés Magicien », 3843 « Choix améliorations Magicien ».
  - 3875 : sorts uniques Guérisseur. 3871 : Acclamations individuelles. 3868 : « Acclamations de la foule (Magicien) ».
  - 3886 : « Choix initial Magicien ». 3880 : « Tooltips Magicien ». 3900 : « Déclenchés » des uniques.
- **Choix de l'archétype.** Le sort 30608 « Choix d'Archétype » propose un choix (effet 3008, value 16). Choisir le Magicien lance **30649 « Magicien [Passif] »** (spell-level 80913) :
  - 30739 : animation de transformation ;
  - **état 5901 « Magicien »**, permanent ;
  - 4 changements d'apparence (effet 335 : 2745, 2742, 2741, 2740).
  - Les champs PA/PO/lancers de 80913 (3 PA, PO 0-5, 2/tour) recopient Pulsation d'Énergie et ne servent pas.
  - **Aucun effet des données n'apprend Pulsation d'Énergie** : c'est le serveur qui donne le sort de départ. FAIT rapporté : DPLN, et Barbe Douce dans sa 2e run, jouée en Magicien (transcription relue, 09:36 : « j'ai deux spells, Frappe Repoussoir et Pulsation d'Énergie »).
- **30642 « Guérisseur : ».** C'est un simple libellé d'infobulle (effet 666). Amplification l'appelle par un effet 1160 `forClientOnly`, juste avant la ligne « soins finaux ». Les captures DPLN l'affichent « ??? ».
  - Rôle identique pour 30640 « Baroudeur : » (Acrobate) et 30641 « Gladiateur : » (Dompteur).
  - 30644 est le passif Dompteur, 30648 le passif Acrobate.
- **Numérotation interne ≠ ordre d'obtention.**
  - adminName « Sort N » : Pulsation 1, Regain 2, Amplification 3, Vents Contraires 4, Vague 5, Protection 6, Délivrance 7.
  - « Amélioration N » et « Amélioré N » suivent ce même N.
  - L'ordre d'**obtention** est celui du Spell Manager, donné au § 3.

### 1.2 Statistiques

| Stat | Valeur retenue | Source | Confiance |
|---|---|---|---|
| PV | **30 000** (25 000 en option) | DPLN (« 30 000 PV » pour tous) ; monstre 7980 : 30 000. **Aucune source ne montre les PV d'un Magicien transformé** : le « 30 000 PV » de Barbe Douce est lu avant le choix d'archétype (00:04, run en Acrobate) | moyenne (voir écart) |
| PA / PM | 8 / 4 | DPLN ; monstre 7980 | haute |
| Force | 6 000 : **×61** sur les jets de dommages **et de soins** (3001 = soin neutre, boosté par la Force) | DPLN ; monstre 7980 ; code client (note 70 § 4.2) | haute |
| Puissance | 0 (et la Puissance ne boost pas les soins) | code client | haute |
| Dommages de poussée | 1 000 (utile seulement pour Frappe Repoussoir) | DPLN | haute (FAIT rapporté) |
| Critique | 10 % : Pulsation / Vents / Frappe à **40 %** effectifs, Vague à **30 %** | DPLN + données des sorts | haute |
| Soins, soins finaux | 0 / +0 % de base | — | haute |
| Érosion infligée | 10 % de base (stat 75) | note 70 | haute (FAIT rapporté) |
| Tacle | ne tacle pas, ne peut pas être taclé (état 5970 du passif 30639) | FAIT vérifié | haute |
| Durée de tour | 60 s (3407 du passif) | FAIT vérifié | haute |

**Écart sur les PV (FAIT vérifié / HYPOTHÈSE).** Le passif 30639 « Gladiatrooller » (spell-level 80897, sort de départ du monstre 7980) contient **−5 000 Vitalité** (effet 153, masque `C,*E5901` : « si le lanceur a l'état Magicien »). Avec ce malus, le Magicien aurait 25 000 PV.

Le même passif donne +5 000 Vitalité à l'Acrobate et +3 000 Puissance au Dompteur. Or les observations contredisent ces deux bonus :
- la capture d'un Acrobate transformé montre 30 000 PV ;
- Impact du Dompteur fait « environ 4 500 », ce qui correspond à ×61, donc sans Puissance.

**HYPOTHÈSE (moyenne)** : le critère sur l'état d'archétype est évalué au lancement du passif, au début du combat, donc avant le choix d'archétype, et aucun de ces bonus ne s'applique. **Défaut simulateur : 30 000 ; option : `hpVariantIfPassiveApplies = 25000`.**

---

## 2. Mécanismes transverses à connaître pour simuler le Magicien

### 2.1 Effets réels et effets d'affichage (FAIT vérifié, haute)

Chaque effet porte un drapeau `forClientOnly` (champ `real` / `clientOnly` dans le JSON). Pour le Magicien, les effets d'affichage sont :
- les 3 appels 1160 d'Amplification (en-têtes « Gladiateur : », « Baroudeur : », « Guérisseur : ») ;
- le 2020 « Soin : 100 % des dommages subis » affiché par Malédiction Régénérante (le soin réel est dans le sous-sort **30675**) ;
- le 147 « Ressuscite un allié » affiché par Ultime Espoir (la résurrection réelle est dans le sous-sort **30674**) ;
- l'effet d'affichage de chaque sort d'Acclamation (le bonus réel est dans **30591** niv. 1 à 6).

Tous les autres effets sont réels.

### 2.2 Soins (FAIT vérifié : code client, note 70 § 4.4 ; confiance haute)

```
soin = int(jet × (100 + Force) / 100) + Soins          # Force 6000 ⇒ ×61 ; la Puissance ne s'applique PAS
soin = int(soin × (100 − 10 × distance_au_centre) / 100) # dégressivité de zone (C2 : 100/90/80 % ; C3 : …/70 %) ; 0 pour la zone « a »
soin = int(soin × (100 + Σ soins finaux %) / 100)        # 2971 : Amplification, Acclamation soignante
soin = min(soin, PV_max − PV)                            # plafonné aux PV manquants ; 0 si « incurable »
```

- **Critique.** Un seul tirage par lancer. Pulsation d'Énergie est soit entièrement normale, soit entièrement critique (soin ET dommages).
- **Soins non boostés.**
  - 1109 « % des PV max » (Ultime Espoir, Immortalité du Bienfaiteur) et 2020 « % des dommages subis » (Malédiction Régénérante) : ni Force ni soins finaux.
- **Cumul des soins finaux.** Amplification (+20 %, +40 % améliorée) et chaque Acclamation soignante (+20 %) s'**additionnent** dans la même stat [143].
  - Exemple : Amplification + 1 Acclamation = +40 %, soit ×1,4.

### 2.3 Boucliers (FAIT vérifié, haute)

- **1040 = valeur fixe** : pas de boost, pas de dégressivité, pas de critique. Il absorbe les dommages avant les PV.
- **Durée 1** (Protection Prolongée, Muraille collective) : le bouclier tient jusqu'au **début du prochain tour du Magicien**.
- Un bouclier absorbe aussi les 2 000 de l'entrée dans les pics et le glyphe de début de tour : ce sont des dommages ordinaires, pas des dommages de poussée.

### 2.4 Durées et ordre de jeu : pourquoi « Magicien en dernier » (FAIT vérifié client + HYPOTHÈSE sur l'ordre serveur)

Règle (note 70 § 7.2) : un buff de durée *n* posé par X perd 1 **au début de chaque tour de X** et disparaît à 0.

| Qui reçoit le buff du Magicien lancé au tour *t* | Tours où le buff est actif |
|---|---|
| Allié qui joue **avant** le Magicien (A-D-D-M : tout le monde) | *t*+1 … *t*+*n* |
| Allié qui joue **après** le Magicien (Dompteur en A-A-M-D) | *t* … *t*+*n*−1 |
| Le Magicien lui-même | fin du tour *t* (PA/PM immédiats), puis *t*+1 … *t*+*n*−1 |
| Ennemis (−PM, −DF, érosion) | exactement *n* tours de chaque ennemi, quel que soit l'ordre |
| Bouclier (durée 1) | du lancer jusqu'au début du tour *t*+1 du Magicien : **tous** les tours ennemis intermédiaires |

**Intervalle de relance** (FAIT vérifié, client 2.73 `SpellManager.cooldown`) : un sort est relançable dès que `tour_courant ≥ dernier_lancer + intervalle`. Regain Vigoureux (intervalle 4) lancé au T1 est donc relançable au T5, et Vague de Dégradation (2) un tour sur deux.

Un sort amélioré est un **nouveau sort**, appris par l'effet 3405 : son intervalle repart de zéro, comme l'écrit DPLN.

Joueur en dernier, le Magicien :
- **soigne après les dégâts** ;
- pose ses **malus** juste avant les tours ennemis ;
- pose ses **boucliers** qui tiennent pendant tout le tour ennemi.

Contrepartie : ses **boosts** (Regain, Amplification) ne profitent aux autres qu'à partir du tour suivant. Cette logique explique l'ordre A-D-D-M observé dans les vidéos.

### 2.5 Désenvoûtement : ce que Délivrance retire (FAIT vérifié, haute)

L'effet 132 (`CharacterRemoveAllEffects`) retire les buffs dont **`dispellable = 1`**. Les autres valeurs (client `FightDispellableEnum` / `BasicBuff.canBeDispell`) :
- 3 : seulement par un désenvoûtement « fort » ;
- 2 : retirés à la mort ;
- 4 : jamais.

| Retirés par Délivrance (dispellable 1) | NON retirés (dispellable 3) |
|---|---|
| Troollibre **Patroolleur** 30382 : Inébranlable 1 tour + 15 % dommages finaux 2 tours | **Pics** : Vulnérable et ×200 % (30390 niv. 2, 30701) |
| Nitrooll **Troollement de Tambour** 30388 : Inébranlable 1 tour sur un Trooll allié | **Mama** : invulnérable (état 56), +25 % DF, Faveurs de la foule |
| Troollibre **Aspiratrooll** 30381 : 10 % d'érosion 1 tour sur un joueur | Uniques (Galvanisation, Courage fuyons, Dégagez !, Muraille, Démotivation, seuils…) |
| Buffs **du Magicien** : Regain, bonus d'Amplification (mais PAS l'état Amplifié 5968), Protection Prolongée, Vents (−PM), Vague (érosion, −DF) | Acclamations (30589-30591) |
| Dompteur / Acrobate : Prélèvement (érosion), Pugnace (Inébranlable, résistance), Coup de Sang amélioré (−10 % PV) | État Amplifié 5968, Endolori 5967 |

### 2.6 Masques de cible rencontrés

| Masque | Sens | Où |
|---|---|---|
| `a` | alliés, lanceur compris | soins, Regain, boucliers, Amplification, Influx |
| `A` | ennemis | dommages, −PM, érosion, −DF |
| `g` | alliés sauf le lanceur | Ultime Espoir (soin 100 %) |
| `c` | le lanceur, seulement s'il est dans la zone | Ultime Espoir (résurrection si on se cible soi-même) |
| `C` | le lanceur | 3406 (oubli du sort unique) |
| `e5968` / `E5899`, `E5900`, `E5901` | pas encore Amplifié / est Dompteur, Acrobate, Magicien | Amplification |
| `e5971` | n'est pas « Mama Trooll (pré fight) » | Démotivation, Malédiction Régénérante : la Mama n'est ciblable qu'**après son entrée** |
| `j` | invocations alliées | Frappe Repoussoir |

Le Magicien n'a aucun sort qui frappe ses alliés. Deux effets seulement peuvent nuire à un allié : la poussée de Frappe Repoussoir (masque `a,A`) et le désenvoûtement de Délivrance (§ 3.6).

---

## 3. Sorts classiques, dans l'ordre d'obtention

**Mécanisme (FAIT vérifié).** Chaque objectif validé lance **30626 « Spell Manager »** au niveau suivant. Ce sort apprend, via l'effet 3405, le sort de chaque archétype présent dans l'équipe (masque sur l'état d'archétype).

| Ordre | Obtenu par | Sort (id) | adminName | Amélioré (id) | Choix d'amélioration |
|---|---|---|---|---|---|
| 0 | départ | Pulsation d'Énergie (30409, sl 80514) | Sort 1 | 30575 (sl 80786) | 30485 |
| 1 | objectif 1 (Spell Manager niv. 1) | Regain Vigoureux (30410, sl 80515) | Sort 2 | 30576 (sl 80788) | 30486 |
| 2 | objectif 2 (niv. 2) | Amplification (30411, sl 80516) | Sort 3 | 30578 (sl 80791) | 30487 |
| 3 | objectif 3 (niv. 3) | Protection Prolongée (30414, sl 80519) | Sort 6 | 30584 (sl 80800) | 30490 |
| 4 | objectif 4 (niv. 4) | Délivrance (30415, sl 80521) | Sort 7 | 30585 (sl 80802) | 30491 |
| 5 | objectif 5 (niv. 5) | Vents Contraires (30412, sl 80517) | Sort 4 | 30579 (sl 80793) | 30488 |
| 6 | objectif 6 (niv. 6) | Vague de Dégradation (30413, sl 80518) | Sort 5 | 30580 (sl 80795) | 30489 |

Cet ordre est celui de DPLN (« toujours dans ce même ordre ») et des vidéos (Huz, sspritenL : 1er objectif → Regain, 2e → Amplification, 3e → bouclier + soins).

Les runs rapides ne valident que 2 ou 3 objectifs (Khytrayer 03:05). En pratique, **Délivrance, Vents Contraires et Vague de Dégradation sont rarement obtenus**.

Un choix « Amélioration : X » :
1. pose l'état « boostedSpell magicienN » (6010-6016) ;
2. exécute 30470 (infobulle) ;
3. fait oublier l'ancien spell-level (3406) ;
4. apprend le spell-level amélioré (3405).

Les améliorations et les sorts uniques sont proposés par les Glyphes Évènementiels (« cadeaux »), du T2 au T9, sur les cases 272, 273, 299, 301, 327, 328 et 329 (note 40).

### 3.1 Tableau des conditions de lancer (FAIT vérifié)

**LdV** = ligne de vue ; **/tour**, **/cible** = lancers max (0 = illimité) ; **Int.** = intervalle de relance ; **Crit** = taux du sort (taux effectif avec +10 % entre parenthèses). Aucune case libre ou occupée n'est requise ; aucun sort n'a de relance initiale ni de relance globale ; aucun n'impose la diagonale.

| Sort | Version | PA | PO | PO modif. | En ligne | LdV | /tour | /cible | Int. | Crit |
|---|---|---|---|---|---|---|---|---|---|---|
| Pulsation d'Énergie | normale / améliorée | 3 | 0–5 | oui | non | oui | 2 | 0 | 0 | 30 % (40) |
| Regain Vigoureux | normale / améliorée | 2 | 0–0 | non | non | non | 0 | 0 | **4** | 0 |
| Amplification | normale / améliorée | 2 | 0–8 | oui | non | oui | 2 | **1** | 0 | 0 |
| Protection Prolongée | normale / améliorée | 2 | 0–6 | oui | non | oui | 2 | **1** | 0 | 0 |
| Délivrance | normale | 2 | 1–6 | oui | **oui** | oui | 1 | 0 | 0 | 0 |
| Délivrance | améliorée | 2 | 1–6 | oui | **oui** | oui | **3** | **1** | 0 | 0 |
| Vents Contraires | normale / améliorée | 3 | 1–8 | oui | non | oui | 1 | 0 | 0 | 30 % (40) |
| Vague de Dégradation | normale / améliorée | 2 | 1–7 | oui | non | oui | 0 | 0 | **2** | 20 % (30) |
| Frappe Repoussoir (commun) | — | 3 | 1–6 | oui | non | oui | 2 | 0 | 0 | 30 % (40) |
| Uniques (6 + Pense Vite) | — | 5 | voir § 5 | non | non | non | 0 | 0 | 0 | 0 |

`maxStack` = −1 partout, sauf Immortalité du Bienfaiteur (1).

Toutes les valeurs de ce tableau sont identiques aux captures DPLN, à deux exceptions près, les taux critiques de Vents Contraires et de Vague (voir § 9).

### 3.2 Pulsation d'Énergie — sort de départ (30409 → 30575)

**Effets (FAIT vérifié, spell-levels 80514 / 80786), dans l'ordre :**
1. `3001` : **44-48 soins neutres** (critique 53-58) à tous les **alliés** (`a`, lanceur compris) d'un **cercle de rayon 2** (13 cases) centré sur la case ciblée. La version améliorée passe à un **rayon 3** (25 cases).
2. `100` : **44-48 dommages neutres** (critique 53-58) à l'**ennemi** sur la case ciblée (zone P).

Il n'y a pas de condition de case : on peut viser le vide, un allié, soi-même (PO 0) ou un ennemi.

**Dommages (moteur `damage.py`, Force 6 000, Troolls à 0 % de résistance) :**

| Cible | Normal | Critique | Espérance (40 % crit) |
|---|---|---|---|
| Trooll hors pics | 2 684 – 2 928 | 3 233 – 3 538 | **3 038** (1 013 / PA) |
| Trooll **Vulnérable** (×2) | 5 368 – 5 856 | 6 466 – 7 076 | **6 076** (2 025 / PA) |

**Soins par distance au centre et par bonus de soins finaux (espérance à 40 % de critique) :**

| Soins finaux | Centre (100 %) | 1 case (90 %) | 2 cases (80 %) | 3 cases (70 %, amélioré) |
|---|---|---|---|---|
| +0 % | 2 684–2 928 / crit 3 233–3 538 → **3 038** | 2 415–2 635 → 2 734 | 2 147–2 342 → 2 430 | 1 878–2 049 → 2 126 |
| +20 % (Amplification OU 1 Acclamation) | 3 220–3 513 / 3 879–4 245 → **3 645** | 3 280 | 2 915 | 2 551 |
| +40 % | 3 757–4 099 / 4 526–4 953 → **4 252** | 3 827 | 3 401 | 2 976 |
| +60 % | 4 294–4 684 / 5 172–5 660 → **4 860** | 4 374 | 3 887 | 3 401 |

- **DPLN** : « soigne environ du 3 000 … frappe environ du 3 000 » ✓ (espérance 3 038).
- **Capture ark26gladia28** : strictement identique aux données (3 PA, 0-5 modifiable, 30 %, cercle de 13 cases, 2/tour, 44-48 / 53-58).
- **Vidéos** : Huz lit « du 3000 en zone » puis « 4000 ×2 » avec boosts. Ce second chiffre correspond à +20/+40 % avec critique (3 879–4 953).

**Géométrie (calcul, carte 139988488).**
- Les 4 cases de départ (286, 287, 314, 315) sont à distance 2 les unes des autres et à 1 case du centre 300.
- Une Pulsation visée sur **300** soigne les 4 cases à 90 % : espérance ≈ 4 × 2 734 = 10 936.
- Visée sur une des cases de départ : 3 038 + 3 × 2 430 = 10 328.
- **Centrer sur une case vide au milieu du groupe rapporte plus que viser un allié.**
- Les cibles qui couvrent les 4 cases sont 286, 287, 300, 314 et 315 ; en version améliorée, 13 cases (271-273, 286, 287, 299-301, 314, 315, 327-329).

**Amélioration.** DPLN et la description de 30485 annoncent « cercle de soin 2 → 3 cases ». C'est exact (C2 → C3) ; les jets sont inchangés.

### 3.3 Regain Vigoureux — 1er objectif (30410 → 30576)

**Effets (FAIT vérifié, 80515 / 80788) :**
- `111` +2 PA et `128` +2 PM, **durée 2**, à tous les alliés (lanceur compris) d'un **cercle de rayon 3** (25 cases) **centré sur le lanceur** (PO 0).
- **Intervalle 4.**
- Version améliorée : **+3 PA / +3 PM à TOUS les alliés** (zone `a`, toute la carte), intervalle toujours 4.

**Capture ark26gladia46** : identique (2 PA, PO 0, cercle de 25 cases, intervalle 4, +2 PA (2 tours), +2 PM (2 tours)). Amélioration ark26gladia109 : « cercle > tout le monde ; 2 > 3 » ✓. Khytrayer 10:16 le confirme en vidéo : « passe de +2 à +3 ».

**Valeur.** Depuis n'importe quelle case de départ, le cercle C3 couvre les 4 joueurs. Un lancer (2 PA) rapporte donc jusqu'à **3 alliés × 2 tours × (+2 PA, +2 PM)**, plus +2 PA/+2 PM pour le Magicien lui-même au tour du lancer et au suivant. En version améliorée, c'est +3/+3 partout, sans contrainte de placement.

**Timing (§ 2.4).**
- Lancé au tour *t* par un Magicien qui joue en dernier, il profite aux autres aux tours *t*+1 et *t*+2.
- Pour avoir +PA/+PM au **T8** (arrivée et burst de la Mama), il faut un lancer au **T6 ou au T7**. Cycle conseillé : **T3 puis T7** (Koclikoo : « T2/3 puis T7 »).
- Huz dit « lancé au T1, à relancer au T4 ». Or le client autorise la relance au T5 (écart § 9).
- **Productivité (objectif « Orienté Guérisseur ») au T1** : Regain (2) + Pulsation (3) + Pulsation (3). Les +2 PA reçus immédiatement laissent 2 PA en réserve (§ 8.2).

### 3.4 Amplification — 2e objectif (30411 → 30578)

**Effets (FAIT vérifié, 80516 / 80791).** Cible : un allié à 0-8 PO (modifiable), LdV, 2 lancers par tour, 1 par cible. Les effets exigent que la cible ne soit **pas** déjà Amplifiée (`e5968`).

| # | Effet | Masque | Durée | Normal (30411) | Amélioré (30578) |
|---|---|---|---|---|---|
| 0 | état **Amplifié** 5968 | `a,e5968` | 4 | — | — |
| 1 | (affichage) en-tête « Gladiateur : » | — | — | — | — |
| 2 | `1171` dommages finaux | `a,e5968,E5899` (Dompteur) | 3 | **+20 %** | **+40 %** |
| 3 | `115` critique | idem | 3 | **+30 %** | **+50 %** |
| 4 | (affichage) « Baroudeur : » | — | — | — | — |
| 5 | `414` dommages de poussée | `a,e5968,E5900` (Acrobate) | 3 | **+500** | **+1 000** |
| 6 | (affichage) « Guérisseur : » | — | — | — | — |
| 7 | `2971` soins finaux | `a,e5968,E5901` (Magicien) | 3 | **+20 %** | **+40 %** |

**Recoupements.**
- La capture ark26gladia53 est identique à 30411 ; les trois « ??? » sont les en-têtes d'affichage.
- Vidéos : cardxc 07:00 et Khytrayer 05:10 donnent +20 % DF / +30 % crit, +500 DoPou et +20 % soins ✓.

**⚠ Amélioration.**
- La description de 30487 (capture ark26gladia55) annonce « dommages et soins finaux 20 % > 30 % ; critique 30 % > 50 % ; poussée 100 > 200 ».
- La table DPLN écrit « critique 20 % > 30 % ».
- Les **effets réels** de 30578 sont **+40 % / +50 % / +1 000 / +40 %**. Le simulateur utilise les effets (FAIT vérifié).

**Impact chiffré (calcul `damage.py`, cibles Vulnérables, Dompteur sans Puissance).**

| Allié amplifié | Sans | Amplification | Amplification améliorée |
|---|---|---|---|
| Dompteur, **Impact** (68-74 / 82-89) : espérance par lancer | 9 370 (40 % crit) | **11 879** (70 % crit, +27 %) | **14 355** (90 % crit, +53 %) |
| Dompteur, **Grondement Grandissant** (82-92 / 98-110) | 11 444 | 14 478 | 17 472 |
| Acrobate : dommages de collision par case restante | 283 | **408** | **533** |
| Magicien : Pulsation au centre (espérance) | 3 038 | 3 645 | 4 252 |

Les dommages de collision ne sont pas doublés par Vulnérable (déclencheur `D`, HYPOTHÈSE moyenne, note 70).

**Timing.**
- Les bonus durent 3 tours du Magicien, l'état Amplifié 4 tours. Un même allié est donc boosté **3 tours sur 4**.
- Pour un Dompteur qui joue avant le Magicien, un lancer au T1 couvre T2-T4, au T5 T6-T8, au T9 T10.
- Le cycle **T1 / T5 / T9** couvre donc le **T8**, et il permet d'amplifier les 2 Dompteurs le même tour (2 lancers/tour, 1/cible).
- Le Magicien peut s'amplifier lui-même (PO 0) pour +20 % de soins.

### 3.5 Protection Prolongée — 3e objectif (30414 → 30584)

**Effets (FAIT vérifié, 80519 / 80800).** Cible : un allié à 0-6 PO, LdV, 2 lancers par tour, 1 par cible.
1. `1040` bouclier **3 000** (amélioré **5 000**), durée 1 (dispellable 1).
2. `3001` buff « soin au **début des tours** de la cible » (`TB`, `triggerDuration 2`) : 44-48 neutres, soit **2 684–2 928** (amélioré 53-58 : **3 233–3 538**).

Aucun critique n'est possible (taux 0 %). Le soin est boosté par la Force et les soins finaux du Magicien.

| Soins finaux | Soin par déclenchement (normal) | Amélioré |
|---|---|---|
| +0 % | 2 684–2 928 (≈ 2 806) | 3 233–3 538 (≈ 3 386) |
| +20 % | 3 220–3 513 (≈ 3 367) | 3 879–4 245 (≈ 4 062) |
| +40 % | 3 757–4 099 (≈ 3 928) | 4 526–4 953 (≈ 4 739) |

**Nombre de soins.**
- Pour un allié qui joue avant le Magicien : **2 déclenchements**, aux débuts de tour *t*+1 et *t*+2.
- Sur le Magicien lui-même : probablement **1 seul**, car le buff est décompté avant le déclenchement au début de son *t*+2. **HYPOTHÈSE moyenne.**
- DPLN écrit « au début de son prochain tour » ; la description du sort, « au début de ses tours » ; cardxc 08:30, « soins sur 2 tours ». Le « 40 à 48 » lu en vidéo est une mauvaise lecture de 44-48.

**Capture ark26gladia58** : identique. Amélioration ark26gladia121 : « 3000 > 5000, les soins augmentent » ✓, soit 53-58 d'après les données.

**Usage.**
- Absorbe l'entrée dans les pics (2 000) et le glyphe de début de tour.
- Outil n° 1 pour « **Même pas mal** » : le bouclier empêche la perte de PV, et l'état « Vie inchangée » 5960 reste posé.
- Pour un allié exposé : 2 lancers par tour, sur 2 alliés différents.

### 3.6 Délivrance — 4e objectif (30415 → 30585)

**Effet (FAIT vérifié, 80521 / 80802).** `132` « Enlève les envoûtements » sur la cible, alliée ou ennemie.
- Conditions : PO 1-6, **en ligne**, LdV, 1 lancer par tour (amélioré : 3 par tour, 1 par cible).
- La portée minimale de 1 interdit de se cibler soi-même.
- Captures ark26gladia60 et 62 identiques aux données.

**Intérêt tactique (analyse du § 2.5).**
- (+) Retire l'**Inébranlable** d'un Trooll (Patroolleur ou Troollement de Tambour) : l'Acrobate peut de nouveau le pousser dans les pics.
  - Ce n'est rentable que si l'Acrobate rejoue avant le prochain tour de ce Trooll, puisque l'Inébranlable ne dure que jusqu'à ce tour.
- (−) Ne retire **ni Vulnérable ni le ×200 %** (dispellable 3). Il est donc sans danger sur un ennemi dans les pics, mais aussi sans effet sur un allié Vulnérable.
- (−−) Sur un **allié**, il retire Amplification (les bonus seulement : l'état 5968 reste et empêche de ré-amplifier), Regain, Protection Prolongée et Pugnace.
- (−) Il est contre-productif pour l'objectif « **Ébranlable** » (achever un ennemi Inébranlable).
- Avis rapportés : sort jugé inutile ; Willseir (forum, déc. 2024) écrit même qu'il « ne fonctionne dans aucun cas ». C'est invérifiable ici (FAIT rapporté, confiance basse).

### 3.7 Vents Contraires — 5e objectif (30412 → 30579)

**Effets (FAIT vérifié, 80517 / 80793).** Case ciblée à 1-8 PO, LdV, 1 lancer par tour.
- `100` : **46-52 dommages neutres** (critique 55-62) à l'ennemi sur la case.
- `169` : **−2 PM** (durée 1, **non esquivable**) aux ennemis d'une **croix de rayon 1** (5 cases).
- Version améliorée : **−3 PM** en **croix de rayon 2** (9 cases). Les effets y sont dans l'ordre inverse (−PM d'abord, puis dommages).
- Aucune case occupée n'est requise : on peut viser une case vide pour ne faire que le retrait de PM.

| Cible | Normal | Critique | Espérance (40 %) |
|---|---|---|---|
| Trooll hors pics | 2 806 – 3 172 | 3 355 – 3 782 | **3 221** (1 074 / PA) |
| Trooll **Vulnérable** | 5 612 – 6 344 | 6 710 – 7 564 | **6 442** (2 147 / PA : meilleur ratio du Magicien) |

- **PM des Troolls** (DofusDB) : Troollibre 6, Artroolleur 5, Nitrooll 5, Mama 6.
- L'effet 169 ignore l'esquive PM (20 chez la Mama).
- **Portée 8** : c'est le seul sort de frappe du Magicien qui touche les pics depuis les cases de départ sans déplacement (§ 7).
- **Capture ark26gladia65** : « Critique 40 % » contre 30 % dans les données (§ 9). Tout le reste est identique.

### 3.8 Vague de Dégradation — 6e objectif (30413 → 30580)

**Effets (FAIT vérifié, 80518 / 80795).** Case ciblée à 1-7 PO, LdV, **intervalle 2**.
1. `776` **+15 % d'érosion** (durée 1) aux ennemis d'un **cercle de rayon 2**. Version améliorée : +30 %, rayon 3.
2. `100` **21-28 dommages neutres** (critique 25-34) à l'ennemi sur la case.
3. `1172` **−15 % dommages finaux** (durée 1) aux mêmes ennemis. Version améliorée : −30 %.

| Cible | Normal | Critique | Espérance (30 %) |
|---|---|---|---|
| Trooll hors pics | 1 281 – 1 708 | 1 525 – 2 074 | **1 586** |
| Trooll Vulnérable | 2 562 – 3 416 | 3 050 – 4 148 | **3 172** |

- **Érosion** : 10 % de base, plus 15 % (ou 30 %), plafonnée à 50 % par la formule.
  - La part érodée des dommages devient une **perte de PV max** : Trooll de Magie (le soin du Nitrooll) ne peut pas la rendre.
  - Elle alimente **Ombre Fracassante** du Dompteur, qui frappe en % des PV érodés de la cible.
  - Avec Prélèvement (+15 %), un Trooll atteint 40 % d'érosion (55 % si la Vague est améliorée, plafonnée à 50).
- **−DF** : il s'**additionne** avec Démotivation (même stat [107]), comme le montre le tableau du § 5.
- **Capture ark26gladia112** : « Critique 30 % » (données : 20 %). L'icône « ? » montre une capture ancienne (§ 9). Amélioration ark26gladia113 ✓.

---

## 4. Sort commun : Frappe Repoussoir (30416, spell-level 80499)

**Conditions** : 3 PA, PO 1-6 modifiable, LdV, 2 lancers par tour, critique 30 % (40 % effectifs).

**Effets, dans l'ordre :**
1. poussée de 2 cases depuis le lanceur, sur allié ou ennemi ;
2. 16-20 dommages neutres (critique 21-25) à un ennemi ou une invocation alliée.

Résultats : **976–1 220** (critique 1 281–1 525), espérance 1 220 ; sur une cible Vulnérable, 1 952–2 440 (2 562–3 050).

Pour le Magicien, c'est le **seul moyen de déplacer un ennemi**. Un Trooll à 1 ou 2 cases des pics, en ligne avec le Magicien, y entre : 2 000 dégâts + Vulnérable, puis les dommages de la Frappe, déjà doublés si l'aura s'applique dès l'arrivée (HYPOTHÈSE, note 70 § 4.5). Cela peut suffire à valider « Empalé » ou à finir un Trooll au bord. Aucune amélioration n'existe.

---

## 5. Sorts uniques (usage unique : le sort s'oublie lui-même via 3406)

Tous coûtent **5 PA**, sans critique, sans ligne de vue, sans intervalle. Ils sont proposés par les Glyphes Évènementiels (effet 3008 ; le tirage est fait par le serveur).

| Sort (id, spell-level) | PO | Effets réels (FAIT vérifié) | Valeurs calculées | DPLN / captures | Confiance |
|---|---|---|---|---|---|
| **Influx de Vitalité** (30606, 80830) | 0 | `3001` 284-312 soins neutres à **tous les alliés** (zone `a`, pas de dégressivité) | **17 324–19 032** par allié (≈ 18 178) ; +20 % soins : 20 788–22 838 | « soigne énormément tous les alliés » ; capture 284-312 ✓ ; vidéo « casi full HP » | haute |
| **Démotivation des troupes** (30607, 80832) | 0 | `1172` **−35 % dommages finaux**, durée 2, à tous les ennemis **sans l'état 5971** (Mama avant son entrée exclue) | voir le tableau Mama ci-dessous | « −35 % pendant 2 tours » ✓ | haute |
| **Immortalité du Bienfaiteur** (30620, 80848) | **1**-63 (pas soi-même), cumul max 1 | `2872` seuil **1 PV** permanent sur l'allié. Quand le seuil est atteint (déclencheur `TR30620`) : `1109` soin **50 % PV max** puis `406` dissipe le sort. État **Endolori** 5967 permanent. | allié à 30 000 PV : tombe à 1 PV puis remonte à 15 001 | description et DPLN : « seuil de 1 % des PV » ; capture : seuil mal rendu | moyenne (sens de `TR`) |
| **Malédiction Régénérante** (30621, 80849) | 0 | Pendant 1 tour, chaque ennemi (sauf 5971) qui **subit des dommages** exécute **30675** sur sa case : `2020` soin = **100 % des dommages finaux subis** (non boosté) aux **alliés du Magicien situés à ≤ 2 cases de cet ennemi** (C2). État 5981 posé 1 tour. | un coup de 8 000 sur un Trooll Vulnérable soigne de 8 000 chaque allié à son contact (−10 %/case, HYPOTHÈSE) | description et DPLN : « **50 %** », « **tous** les alliés » ; capture : « 100 % », cercle de 13 cases | moyenne |
| **Muraille collective** (30622, 80850) | 0 | `1040` **bouclier 15 000**, durée 1, à tous les alliés (dispellable 3) | 15 000 × 4 = 60 000 PV effectifs jusqu'au prochain tour du Magicien | capture ✓ ; « 15 000 de shield » (3 vidéos) | haute |
| **Ultime Espoir** (30623, 80851) | 0-63 | Sur un **autre allié** : `1109` soin **100 % PV max** (masque `g`). Sur **soi** (case 0) : exécute **30674**, qui ressuscite le **dernier allié mort** avec **50 %** de ses PV (`147`). | allié remis à 30 000 ; ou résurrection à 15 000 | « reconstitue / ressuscite avec 50 % » ✓ | haute (case de réapparition : inconnue) |
| **Pense Vite** (30615, 80843) — commun aux 3 | 0 | au prochain tour, +999 PA (délai 1) et tour fixé à **10 s** (`3407` value 10) ; effets dissipés en fin de ce tour | Magicien : ≈ 27 PA « utiles » à cause des limites par tour | DPLN et capture : **15 s** (écart) | haute |

**Réduction des dégâts de la Mama** (calcul `damage.py`). Sort pris en exemple : Mitroollette de Poings, 93-108 neutres, Force 4 500. Les dommages finaux de la Mama valent 100 + 25 (Faveurs, 30724) − 5 × objectifs réalisés (30659 niv. 2) − malus du Magicien.

| Objectifs réalisés | Malus du Magicien | DF Mama | Coup sur un archétype | Avec 1 Acclamation résistante (−15 % à distance) |
|---|---|---|---|---|
| 0 | aucun | 125 % | 5 347–6 210 | 4 545–5 277 |
| 5 | aucun | 100 % | 4 278–4 968 | 3 636–4 222 |
| 5 | Vague (−15 %) | 85 % | 3 636–4 222 | 3 090–3 588 |
| 5 | Démotivation (−35 %) | 65 % | 2 780–3 229 | 2 363–2 744 |
| 5 | Démotivation + Vague (−50 %) | 50 % | 2 139–2 484 | 1 818–2 111 |
| 5 | Démotivation + Vague améliorée (−65 %) | 35 % | 1 497–1 738 | 1 272–1 477 |

Les lignes « 3 objectifs » sont dans le JSON (`enemyDamageReduction`). Catastrooll (+20 % DF, durée 0) n'est pas inclus.

---

## 6. Bonus « Acclamations de la foule » du Magicien (FAIT vérifié, haute)

**Mécanisme.**
- À chaque début de tour global, 3 bonus sur les 6 de l'archétype sont proposés (DPLN) ; le tirage est fait par le serveur.
- Le sort de choix n'a qu'un effet d'affichage. Il exécute (effet 792) le niveau correspondant de **30591 « Acclamations de la foule [Magicien] »** : durée −1, **dispellable 3** (Délivrance ne l'enlève pas).
- Les bonus sont permanents et cumulables.

| Choix (id) | Nom | Effet réel (30591 niv., spell-level) | Valeur | DPLN | Remarque |
|---|---|---|---|---|---|
| 30598 | Acclamation accélérante | niv. 1 (80813) `111` | **+1 PA** | 1 PA ✓ | |
| 30599 | Acclamation agile | niv. 2 (80814) `128` | **+1 PM** | 1 PM ✓ | |
| 30600 | Acclamation vitalesque | niv. 3 (80815) `125` | **+5 000 Vitalité** | 5 000 ✓ | PV max et PV courants |
| 30629 | Acclamation optique | niv. 4 (80874) `117` | **+1 PO** | 1 Portée ✓ | agit sur Pulsation, Amplification, Protection, Délivrance, Vents, Vague, Frappe ; pas sur Regain ni sur les uniques |
| 30630 | Acclamation soignante | niv. 5 (80875) `2971` | **+20 % soins finaux** | 20 % ✓ | s'additionne à Amplification ; sans effet sur 1109 et 2020 |
| 30631 | Acclamation résistante | niv. 6 (80876) `2807` | **+15 % résistance distance** | **10 %** ✗ | multiplicateur reçu à distance = 100 − 15·n |

**Priorités rapportées.**
- DPLN : PA, PM, soins.
- Barbe Douce (bêta, en Magicien) : Vitalité, puis soins finaux ×2. Elle préfère aussi Pulsation améliorée à Pense Vite, et Influx à Muraille (« tout le monde prend des dégâts »).
- Zephiron : PO > PA > soins.
- Koclikoo : soins ×1 > PA ×2-3 > PM/PO ×2-3 > Vitalité (1 max) > résistance distance.
- Laltoss : PA > soins > PM/PO.

**Analyse.**
- **+1 PO** fait passer Pulsation de 5 à 6 PO : elle touche alors un Trooll des pics depuis une case de départ (§ 7).
- **+1 PA** donne un 3e sort à 3 PA, soit 9 PA = 3 × 3 (Pulsation, Pulsation, Vents).
- **+20 % soins** ≈ +600 par Pulsation au centre.

---

## 7. Interactions avec les pics et l'état Vulnérable

Rappels (note 70 § 4.5, FAIT vérifié) :
- **entrée** dans les pics : 2 000 dégâts + Vulnérable ;
- tant qu'un **monstre** est dans les pics : dommages subis ×2 (hors dommages de poussée) ;
- **début de tour** dans les pics : 1 000 dégâts (×2 pour un monstre, soit 2 000) ;
- **sortie** des pics : ×2 pendant 1 tour, pour les **deux camps** (30701, déclenché par le passif 30700 que les joueurs ont aussi).

| Sort | Rôle vis-à-vis des pics | Chiffres | Confiance |
|---|---|---|---|
| Pulsation d'Énergie | frappe ×2 un Trooll Vulnérable ; soigne les alliés au contact de ce Trooll | ≈ 6 080 par lancer, ≈ 12 150 pour 2 lancers (6 PA) | haute |
| Vents Contraires | frappe ×2 ; −PM qui empêchent un Trooll de ressortir des pics (il reprend 2 000 à son tour et reste Vulnérable) ou de rejoindre le groupe | ≈ 6 440 ; −2/−3 PM | haute (dégâts), moyenne (IA) |
| Vague de Dégradation | frappe ×2 ; érode aussi les 2 000 des pics ; −DF juste avant le tour des Troolls | ≈ 3 170 ; −15/−30 % DF | haute |
| Frappe Repoussoir | seul sort qui **met** un ennemi dans les pics | poussée 2 | haute |
| Protection Prolongée / Muraille | absorbent l'entrée dans les pics (poussée de Mama au T8, Troollpoline, Tir d'Artroolleur, Uppertrooll) | 3 000 / 5 000 / 15 000 | haute |
| Pulsation / Influx / Ultime Espoir | remontent un allié tombé dans les pics : 2 000 à l'entrée + 1 000 (ou 2 000, écart note 70) à chaque début de tour | — | haute |
| Délivrance | ne retire **pas** Vulnérable ; retire l'Inébranlable des Troolls (rend la poussée possible) | — | haute |
| Malédiction Régénérante | l'entrée d'un Trooll dans les pics (2 000) déclenche un soin des alliés à ≤ 2 cases de lui | — | moyenne |

**Portée vers les pics (calcul, carte du client).**
- Les pics sont à **≥ 6 cases** des 4 cases de départ.
- Pulsation (PO 5) n'y touche **aucune** case sans bouger. Avec +1 PO, 1 case ; il faut sinon 1 PM au plus près.
- Vague (PO 7) atteint 6 cases de pics depuis chaque case de départ ; Vents (PO 8) en atteint 17.

Exemple vérifié (`workedExamples.T1_wave1`). Au T1, l'Acrobate a envoyé les Troollibres en 199 et 402.
- Depuis 286 : 199 est à 6 cases, en ligne de vue → Pulsation +1 PO, Frappe, Vague et Vents sont possibles. 402 est à 8 cases, sans ligne de vue (315 la masque).
- Depuis 287 ou 314 : les deux Troolls sont à 8 cases → seul Vents Contraires les touche sans bouger.
- Depuis 315 : situation symétrique de 286.

**Protéger l'équipe au T8.**
- La Mama arrive sur 300 (ou sur 287 si 300 est occupée) et repousse jusqu'aux pics tous les personnages **alignés** avec elle (note 40).
- Les **4 cases de départ sont toutes alignées** avec 300 : 286 et 315 sur y = −4, 287 et 314 sur x = 17.
- Le Magicien, dernier à jouer au T7, doit finir hors de ces lignes. Les cases sûres les plus proches sont **299 ou 328** (diagonales de 300, aussi hors de la ligne de repli y = −3). 108 cases jouables hors pics sont sûres pour les deux lignes.
- Il doit aussi lancer **Muraille collective au T7**. Elle protège jusqu'au début de son T8, ce qui couvre la poussée d'arrivée et tous les tours ennemis intermédiaires.

---

## 8. Analyse tactique

### 8.1 Rôle

Le Magicien est l'archétype qui **fait durer** l'équipe et **multiplie** les dégâts des Dompteurs. DPLN le juge « relativement indispensable pour survivre ». Il est présent dans les deux compositions de référence (A-D-D-M et A-A-D-M), toujours en **dernier**, sauf chez Koclikoo (A-A-M-D : boosts posés avant la frappe du Dompteur).

Quand il n'y a rien à soigner, il finit les Troolls Vulnérables (Laltoss). Sur une cible ×2, sa frappe est loin d'être négligeable : Pulsation et Vents font chacune ≈ 6 000 à 6 500.

### 8.2 Budget de PA (8 PA de base)

| Tour type | Séquence | PA | Résultat |
|---|---|---|---|
| T1 (avant tout objectif) | Pulsation ×2 | 6 (2 restent inutilisés, ou Frappe si +1 PA) | ≈ 12 150 sur Trooll Vulnérable, ou ≈ 10 900 de soins de groupe (centre 300) |
| T1 après Empalé → **Productivité** | Regain (2) → +2 PA immédiats → Pulsation (3) → Pulsation (3) | 8 + 2 | 3 sorts ⇒ objectif validé ; il reste 2 PA pour Amplification si elle vient d'être apprise (HYPOTHÈSE : sort utilisable dans le même tour) |
| Tour « support » | Amplification ×2 (Dompteurs) + Regain + Protection | 8 | les 2 Dompteurs amplifiés 3 tours, +PA/+PM de groupe, un bouclier |
| Tour « dégâts » (tous sorts appris) | Vents (3) + Pulsation (3) + Vague (2) | 8 | ≈ 15 690 sur Vulnérable, −PM, érosion, −15 % DF |
| Tour « urgence » | unique (5) + Pulsation (3) | 8 | Muraille / Influx / Ultime Espoir + soin |

- **Ratio dégâts par PA sur Vulnérable** : Vents 2 147 > Pulsation 2 025 > Vague 1 586 > Frappe 813.
- **Productivité** (3 sorts dans le tour) est l'objectif « le plus simple » selon les vidéos (cardxc 04:30, Koza 02:30, Khytrayer 04:41 : « doy PA, curo, curo »).

### 8.3 Plan de référence par tour (HYPOTHÈSE de planification, dérivée des données et des sources)

| Tour | Priorités du Magicien |
|---|---|
| T1 | 2 Pulsations : frappe des Troolls Vulnérables à portée, ou soin centré sur 300 si le groupe a encaissé. Si Empalé tombe avant son tour : **Regain + 2 Pulsations = Productivité**. |
| T1-T2 | **Amplification** sur les 2 Dompteurs dès qu'elle est apprise (cycle T1/T5/T9 ou T2/T6/T10). |
| T3 | **Regain Vigoureux** (cycle T3 → T7). |
| T4-T6 | Protection Prolongée sur l'allié le plus exposé ; Pulsation (soin ou achèvement) ; Vents sur un Trooll Vulnérable ; objectifs « Tout va bien », « Sauvez-le ! », « Même pas mal ». |
| T5 | **Amplification** des Dompteurs (couvre T6-T8). |
| T7 | **Regain** (alliés boostés T8-T9) ; **Muraille collective** ; **Immortalité du Bienfaiteur** sur le Dompteur qui portera le burst ; finir le tour **hors des lignes de la Mama** (299 ou 328). |
| T8 | **Démotivation** : seulement après l'entrée de la Mama, qui garde l'état 5971 jusque-là. Lancée au T8, elle couvre ses tours T9 et T10 (−35 %). Soins ou Influx si l'arrivée a fait mal. Pulsation et Vents sur la Mama quand elle est Vulnérable (poussée dans les pics). |
| T9-T10 | Nettoyage : frappes sur les Troolls Vulnérables ; Ultime Espoir (résurrection) si un allié est tombé. |

Priorités d'uniques :
- DPLN et vidéos : Influx, Muraille, Ultime Espoir ;
- Démotivation est **très fort contre la Mama** : −35 %, cumulable avec Vague ;
- Malédiction Régénérante et Pense Vite sont peu rentables pour ce rôle.

### 8.4 Objectifs « Orientés Guérisseur » (FAIT vérifié : type 3813/3814/3819/3824/3827 ; textes des sorts)

| Objectif (id) | Texte | Ce que le Magicien fait |
|---|---|---|
| Productivité (30542) | un allié utilise 3 sorts pendant son tour | Regain + 2 Pulsations au T1 |
| Même pas mal (30535) | un allié subit un sort de la Mama sans perdre de PV | bouclier (Protection 3 000/5 000, Muraille 15 000) sur l'allié visé |
| Tout va bien (30524) | à la fin du tour global, tous les alliés ont plus de 50 % de leurs PV | soins de zone en dernier |
| Sauvez-le ! (30462) | l'allié désigné doit avoir tous ses PV à la fin du tour global | Pulsation centrée sur lui ; Ultime Espoir (100 %) |
| Distance d'insécurité (30531) | tous les Artroolleurs à ≤ 3 cases d'un allié en fin de tour d'un allié | rien de spécifique (se valide seul s'il n'y a plus d'Artroolleur, note 50) |

---

## 9. Écarts entre les données du jeu, le guide DPLN et les vidéos

| Sujet | Données (FAIT vérifié) | DPLN / vidéos (FAIT rapporté) | Verdict | Confiance |
|---|---|---|---|---|
| Amplification améliorée | +40 % DF, +50 % crit, +1 000 DoPou, +40 % soins (30578) | description 30487 : 20→30 %, 30→50 %, 100→200 ; table DPLN : critique 20→30 % | les **effets** font foi ; la description et la table sont fausses | haute |
| PV du Magicien | passif 30639 : −5 000 Vitalité si état Magicien ⇒ 25 000 | 30 000 pour tous (DPLN) ; aucune vidéo ne montre un Magicien transformé | bonus d'archétype du passif probablement jamais appliqués (même constat pour Acrobate et Dompteur) ; défaut 30 000 | moyenne |
| Acclamation résistante | 15 % résistance distance | DPLN « 10 % » ; bêta (Barbe Douce, Magicien, 11:04) : « résistance **mêlée** » proposée | la donnée fait foi : 15 % distance (la bêta différait) | haute |
| Vents Contraires, critique | 30 % | capture : 40 % | ancienne valeur, ou capture avec un bonus ; simuler 30 (+10) | moyenne |
| Vague de Dégradation, critique | 20 % | capture : 30 % (icône « ? ») | capture ancienne ; simuler 20 (+10) | moyenne |
| Malédiction Régénérante | soin = 100 % des dommages subis (réel, 30675), aux alliés à ≤ 2 cases de l'ennemi touché | description et DPLN : 50 %, « tous les alliés » | écart interne au jeu ; défaut 100 %, option 50 % ; zone C2 d'après les données | moyenne |
| Immortalité du Bienfaiteur, seuil | 1 PV ; PO 1-63 (jamais sur soi) | « 1 % des PV » | seuil = 1 PV (écart négligeable) | moyenne |
| Protection Prolongée, soins | TB pendant 2 tours du Magicien ⇒ 2 soins sur un allié | « au début de son prochain tour » ; cardxc : « sur 2 tours » ; « 40 à 48 » (mauvaise lecture) | 2 soins (allié) | moyenne |
| Pense Vite | tour de 10 s | 15 s (texte et capture) | rééquilibrage probable | haute |
| Regain Vigoureux, relance | intervalle 4 ⇒ T1 → T5 (client) | Huz : « relancer au T4 » | simuler +4 | moyenne |
| Délivrance | désenvoûtement normal (dispellable 1) | « ne fonctionne dans aucun cas » (Willseir 2024) | non tranchable ici ; faible enjeu | basse |
| Ordre d'obtention | Spell Manager : Regain, Amplification, Protection, Délivrance, Vents, Vague | idem DPLN | concordance ; attention, ≠ adminName « Sort N » | haute |
| Vulnérable | 1163 ×200 % ⇒ ×2 | « +200 % » (⇒ ×3) | ×2 (note 70) | haute |
| Chiffres DPLN « environ » | Pulsation ≈ 3 038 (soin et dégâts) ; Influx ≈ 18 178 ; Frappe 976-1 220 | « environ 3 000 » ; « énormément » ; « 1 200 » | cohérent | haute |

---

## 10. Questions ouvertes à vérifier en vidéo

1. **PV réels** du Magicien après le choix : 30 000 ou 25 000 ? Lire la fiche du personnage ou la barre de PV d'un Magicien à T1.
2. **Malédiction Régénérante** : soin de 50 % ou de 100 % ? Tous les alliés, ou seulement ceux à ≤ 2 cases du Trooll touché ? La dégressivité s'applique-t-elle ?
3. **Protection Prolongée sur soi** : 1 ou 2 soins de début de tour ?
4. **Sort appris en cours de tour** : Regain appris quand Empalé est validé pendant le T1 est-il lançable au T1 ? Les vidéos Productivité du T1 le suggèrent (confiance moyenne).
5. **Immortalité du Bienfaiteur** : sens exact de `TR30620`, surplus de dégâts perdu ou non au seuil, rôle de l'état Endolori 5967.
6. **Ultime Espoir** : sur quelle case l'allié ressuscité réapparaît-il ?
7. **Joueurs dans les pics** : ×1 ou ×2 ? Les données ne posent le ×200 % que sur `Def` (note 70). Ce point conditionne la valeur des boucliers au T8.
8. **Délivrance** : bug réel (Willseir) ou non ?
9. **Tirage des Acclamations** : 3 bonus sur 6, uniformes ? Et le tirage des uniques et améliorations des cadeaux : le Magicien peut-il recevoir « Pense Vite » ? (DPLN dit oui.)

---

## 11. Reproduction

```bash
cd /home/user/GladiatroolSimu
python3 tools/archetypes/build_archetype_magicien.py            # écrit research/data/archetype_magicien.json
python3 tools/archetypes/build_archetype_magicien.py --summary  # résumé : conditions, effets, dégâts/soins attendus
```

Le JSON contient :
- `archetype` : identité et choix 30649 ;
- `baseStats` ;
- `bonuses[6]` et `bonusMechanism` ;
- `spells[15]` : Frappe Repoussoir, 7 classiques et 7 uniques. Chacun porte `id`, `upgradedId`, `upgradeChoiceSpellId`, `name`, `unlockOrder`, `unique`, `levels.normal` / `levels.upgraded`, `effects`, `critEffects`, `realEffectsSummary`, `pics`, `notes` et `dpln`. Chaque niveau donne ses conditions de lancer et ses effets normalisés, avec `expectedDamage`, `expectedHeal` et `simModel` ;
- `subSpells` : 30675, 30674, 30640-30642, 30470, 30639 ;
- `states` ;
- `turnTiming`, `dispelTable`, `amplificationImpact`, `enemyDamageReduction` ;
- `geometry` et `workedExamples.T1_wave1` ;
- `guerisseurObjectives` et `discrepancies`.

Captures DPLN relues (scratchpad, non versionnées) : `ark26gladia28, 48, 46, 109, 53, 55, 58, 121, 60, 62, 65, 66, 112, 113, 107, 67, 108, 111, 24, 49, 61` sous `https://www.dofuspourlesnoobs.com/uploads/1/3/0/1/13010384/`.
