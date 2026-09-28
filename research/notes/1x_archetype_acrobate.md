# 1x — Archétype ACROBATE (nom interne « Baroudeur ») : fiche complète

> Agent « ARCHÉTYPE ACROBATE ». Rédigé le 2026-09-28.
> Livrable machine : `research/data/archetype_acrobate.json`, généré par
> `tools/archetypes/build_archetype_acrobate.py` (stdlib ; relancer avec `--summary` pour un résumé console).
>
> **Étiquettes.** **FAIT vérifié** = donnée du client DOFUS 3 exposée par DofusDB (`https://api.dofusdb.fr/...`,
> extraction `research/raw/dofusdb/` du 2026-09-28). **FAIT rapporté** = guide Dofus pour les Noobs (DPLN,
> <https://www.dofuspourlesnoobs.com/gladiatrool.html>, mise à jour du 21/05/2026, textes et captures d'infobulles) ou
> vidéos (notes 50 et 60). **HYPOTHÈSE** = déduction. Confiance : **haute** / **moyenne** / **basse**.
>
> **Formules utilisées.** Dégâts, poussée, zones et lignes de vue viennent des modules `tools/mechanics/`
> (`damage.py`, `movement.py`, `zones.py`, `geometry.py`). Ce sont des portages du client écrits par un autre agent ;
> je ne les ai pas modifiés. Noms d'actions DOFUS 3 : `research/data/action_ids_dofus3.json`.

---

## 0. Résumé

| Point | Résultat | Statut / confiance |
|---|---|---|
| Rôle | **Placeur.** Il envoie les Troolls dans les pics : entrée = 2 000 dégâts + état Vulnérable (**dégâts subis ×2**). Il joue **en premier**. | FAIT rapporté (DPLN, 11 vidéos), haute |
| Stats | 30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 dommages de poussée, 10 % critique, sorts en neutre ; ne tacle pas et ne peut pas être taclé (état 5970) | DPLN + monstre 7980 + passif 30639 ; haute. PV : écart possible, voir § 1 |
| Sorts classiques, dans l'ordre d'obtention | **Videur** 30402 (départ) → **Hanedimane** 30408 → **Voltige** 30404 → **Aïronemane** 30405 → **Pugnace** 30406 → **Soutien Stratégique** 30403 → **Va-t-en-guerre** 30407 | FAIT vérifié (Spell Manager 30626, niv. 1 à 6) = ordre DPLN, haute |
| Versions améliorées | 30567, 30574, 30570, 30571, 30572, 30569, 30573. Choix « Amélioration : X » = 30478 à 30484 | FAIT vérifié, haute |
| Sort commun | **Frappe Repoussoir** 30416 : 3 PA, poussée 2, 976–1 220 dégâts (crit 1 281–1 525) | FAIT vérifié ; DPLN « 1 200 » ✓ |
| Uniques | Dégagez ! 30604, Courage fuyons 30605, Immortalité du Courageux 30616, Malédiction Mouvante 30617, Chamboulement 30618, Un pour un 30619, Pense Vite 30615 (commun aux 3 archétypes). Tous à 5 PA. | FAIT vérifié, haute |
| Bonus « Acclamations » | +1 PA, +1 PM, +10 % résistance, +1 PO, +200 dommages de poussée, +10 % résistance mêlée ; permanents et cumulables | FAIT vérifié (30590 niv. 1 à 6), haute |
| Piège n°1 pour le simulateur | Plusieurs effets de poussée ou d'attirance du sort principal sont **`forClientOnly`** : ils ne servent qu'à l'affichage. La poussée réelle est dans un **sous-sort exécuté sur chaque cible** (Videur, Hanedimane, Malédiction Mouvante, Chamboulement). Pour Aïronemane c'est l'inverse. | FAIT vérifié, haute |
| Écarts avec le guide | Jets de Videur, lancers de Voltige améliorée, poussée d'Aïronemane améliorée, 10 s pour Pense Vite, Chamboulement 5 et non 6, Vulnérable ×2 et non ×3, etc. | § 9 |

---

## 1. Identité et statistiques de base

### 1.1 Identité (FAIT vérifié, haute)

- **Nom affiché : Acrobate. Nom interne : « Baroudeur ».** Les adminName et les types de sorts le confirment.
  - Types de sorts : 3888 « Sorts Acrobate », 3902 « Sorts améliorés Acrobate », 3842 « Choix améliorations Acrobate ».
  - 3874 : sorts uniques Baroudeur. 3870 : Acclamations. 3862 : « Déclenchés Acrobate ». 3884 : « Choix initial Acrobate ».
- **Choix de l'archétype.** Le sort 30608 « Choix d'Archétype » propose un choix (effet 3008, value 16). Choisir l'Acrobate lance **30648 « Acrobate [Passif] »** (spell-level 80912) :
  - 30739 : animation de transformation ;
  - **état 5900 « Acrobate »**, permanent ;
  - 4 changements d'apparence (effet 335 : 2740, 2741, 2742, 2744).
  - Les champs PA/PO de 80912 recopient ceux de Videur et ne servent pas.
- **30640 « Baroudeur : ».** C'est un simple libellé d'infobulle (effet 666). Amplification l'appelle (1160, forClientOnly) avant sa ligne propre à l'Acrobate. Les captures DPLN l'affichent « ??? ».
  - Même rôle pour 30641 « Gladiateur : » (Dompteur) et 30642 « Guérisseur : » (Magicien).
  - 30643 et 30645 à 30647 n'existent pas.
  - 30644 est le passif Dompteur, 30649 le passif Magicien.

### 1.2 Statistiques

| Stat | Valeur retenue | Source | Confiance |
|---|---|---|---|
| PV | **30 000** (35 000 en option) | DPLN + capture `ark26gladia127` : fiche d'un Acrobate déjà transformé, 30 000 / 30 000 ; monstre 7980 : 30 000 | moyenne (voir écart) |
| PA / PM | 8 / 4 | DPLN ; monstre 7980 | haute |
| Force | 6 000 : **×61** sur les jets | DPLN ; monstre 7980 | haute |
| Dommages de poussée | 1 000 | DPLN ; vidéo Barbe Douce 00:04–00:25 | haute (FAIT rapporté) |
| Critique | 10 % | DPLN | haute (FAIT rapporté) |
| Niveau (formule de poussée) | 200 | monstre 7980 | moyenne |
| Tacle | aucun : ne tacle pas, ne peut pas être taclé | état 5970 « Gladiatrooler » (`cantTackle`, `cantBeTackled`), posé par le passif 30639 | haute |
| Durée de tour | 60 s | 30639, effet 3407 value 60 | haute |

**Écart sur les PV.** Le passif **30639 « Gladiatrooller »** (spell-level 80897, sort de départ du monstre 7980) contient trois effets conditionnels :

- **+5 000 Vitalité** si le porteur a l'état Acrobate : effet 125, masque `C,*E5900` ;
- +3 000 Puissance pour le Dompteur ;
- −5 000 Vitalité pour le Magicien.

Pourtant, la capture DPLN d'un Acrobate déjà transformé affiche 30 000 PV. **HYPOTHÈSE (moyenne)** : le critère `*E5900` est évalué au lancement du passif, au début du combat, donc avant le choix de l'archétype. Le bonus ne s'appliquerait pas.

Choix pour le simulateur :

- valeur par défaut : **30 000** ;
- option : `hpVariantIfPassiveApplies = 35000`.

---

## 2. Mécanismes transverses à connaître pour simuler l'Acrobate

### 2.1 Effets réels et effets d'affichage (FAIT vérifié, haute)

Chaque effet porte le drapeau `forClientOnly`. S'il vaut `true`, l'effet n'existe que dans l'infobulle ou la prévisualisation, et le serveur ne l'exécute pas. La preuve : Videur a une poussée 3 affichée **et** un sous-sort qui pousse de 3. Si les deux s'exécutaient, la poussée ferait 6, ce que contredisent l'infobulle et le texte de l'amélioration (« 3 > 4 »).

Dans le JSON, chaque effet porte `real` et `clientOnly`. Le simulateur ne doit exécuter **que** les effets `real`, dans l'ordre `order`.

| Sort | Effet d'affichage (ignorer) | Effet réel |
|---|---|---|
| Videur 30402 / 30567 | `5` poussée 3 (4), zone T | `1160` : le lanceur exécute **30689** (poussée 3 ; 4 au niv. 2, zone P1) sur chaque combattant de la zone T |
| Hanedimane 30408 / 30574 | `6` attire 4 (6) et `5` repousse 4 (6), zone F | `1160` : le lanceur exécute **30693** sur chaque combattant de la fourche : ennemis repoussés de 4 (6), alliés attirés de 4 (6) |
| Aïronemane 30405 / 30571 | `792` → 30419 (poussée 2 / 4, X1) | `5` poussée 2 (4), zone X1, masque `g,A` |
| Soutien Stratégique 30403 / 30569 | `1163` ×50 % et `1223` renvoi 50 % | comportement réel porté par le sort de départ du Poutch, **30421 / 30568** |
| Malédiction Mouvante 30617 | `5` poussée 2 | `1018` : la **source** des dommages exécute **30676** (poussée 2) sur l'ennemi touché |
| Chamboulement 30618 | `5` poussée **6** | `1160` → **30677** : poussée **5**, puis rebond |
| Un pour un 30619 | `1163` ×50 % et `1123` 50 % | `792` → **30625** : ×50 % subis et renvoi de 100 % des dommages finaux à l'attaquant |
| Acclamations 30595 à 30637 | l'effet de stat affiché | `792` → **30590 niv. N** : même stat, durée −1 |

### 2.2 Exécution des sous-sorts (FAIT vérifié : noms d'actions DOFUS 3 ; sémantique : haute)

| effectId | Action DOFUS 3 | Qui exécute | Sur quoi |
|---|---|---|---|
| 1160 | `CasterExecuteSpell` | le **lanceur** | chaque cible de l'effet ; la case de la cible devient la case ciblée du sous-sort |
| 792 | `TargetExecuteSpell` | chaque **cible** de l'effet (souvent le lanceur, masque `C`) | la cible elle-même |
| 1018 | `SourceExecuteSpellOnTarget` | la **source de l'événement déclencheur** (l'attaquant) | le porteur du buff |
| 1017 | `TargetExecuteSpellOnSource` | le porteur | la source de l'événement (l'attaquant) |
| 2160 | `CasterExecuteSpellGlobalLimitation` | le lanceur | au plus `value` exécutions par lancer |

**HYPOTHÈSE (moyenne).** Un sort exécuté ignore ses propres conditions de lancer : PA, PO, ligne de vue. Par exemple, 30693 affiche PO 1–6 et ligne de vue, mais s'applique à toute la fourche.

### 2.3 Direction des poussées et attirances

Formules portées dans `tools/mechanics/movement.py` (`push_direction`) :

- **Origine de la poussée.** Si la cible est sur la case ciblée, l'origine est la case du **lanceur**. Sinon, c'est la case ciblée, c'est-à-dire le centre de la zone.
  - Avec un 1160 (Videur, Hanedimane, Chamboulement), chaque cible **est** la case ciblée du sous-sort. La poussée part donc **du lanceur, cible par cible**.
  - Pour Aïronemane et Dégagez !, l'effet 5 est direct : la poussée part du **centre de la zone** vers l'extérieur.
- **Direction.** C'est l'axe dominant du vecteur origine → cible (`getLookDirection4`). Si |dx| = |dy|, la direction est la diagonale exacte.
  - Une poussée diagonale fait **ceil(n/2) pas** diagonaux.
  - En cas de collision, le reste est doublé pour le calcul des dommages.
  - Un pas diagonal exige que les deux cases latérales soient libres.
- **Conséquence pour Videur** (vérifié avec `movement.push_direction`, lanceur en (17,−4)) :

  | Portée du lancer | Cases latérales ±1 de la ligne T | Cases latérales ±2 |
  |---|---|---|
  | 1 | poussées en **diagonale** (2 pas) | poussées **perpendiculairement** à l'axe |
  | 2 | poussées **parallèlement** | poussées en diagonale |
  | ≥ 3 | poussées parallèlement | poussées parallèlement |

  À partir de 3 cases, toute la ligne est poussée parallèlement : effet bulldozer.
- **Hanedimane.** Toute la fourche est poussée parallèlement à l'axe du lancer, quelle que soit la portée (1 à 3). Les branches diagonales de la fourche ont toujours un axe dominant.
- **Ordre de traitement.** Pour une poussée de zone, les cibles **les plus éloignées de la case ciblée** passent en premier (`sort_targets_for_effect`). Cet ordre évite qu'une cible bloque les autres.
- **Les pics ne stoppent pas une poussée.** Ce sont des glyphes-auras. La cible entre dans les pics puis continue jusqu'au mur ou à un obstacle.

### 2.4 Dégâts (FAIT vérifié pour les jets ; formule client, haute)

- **Formule.** `dégât = int(jet × (100 + Force 6000 + Puissance) / 100)`, soit **jet × 61**.
- **Critique.** Taux effectif = taux du sort + 10 %. Un sort à **0 %** ne fait **jamais** de critique (règle `SpellWrapper`). Voltige a des effets critiques (70–74), mais ils sont inatteignables.
- **Vulnérable.** C'est un multiplicateur 1163 **×200 %**, déclenché par tout dommage (D) : les dégâts sont **doublés**, pas triplés. Il s'applique :
  - tant que la cible reste dans les pics ;
  - puis pendant 1 tour après sa sortie (30700 → 30701 sur perte de l'état 5902 ou 5903).
- **Ordre poussée puis dégâts.** Videur, Frappe Repoussoir et Voltige déplacent la cible **avant** d'appliquer les dégâts. **HYPOTHÈSE (moyenne)** : les cibles sont figées au lancer. Si c'est le cas, une cible poussée dans les pics prend :
  - les 2 000 dégâts d'entrée ;
  - puis les dégâts du sort **×2**.

  À vérifier en vidéo : un Videur qui envoie dans les pics devrait afficher −2 000, puis environ −7 400.

**Dégâts attendus.** Cible Trooll (0 % de résistance), Force 6 000, pas de Puissance ni de dommages fixes ; valeurs calculées avec `tools/mechanics/damage.py`.

| Sort | Jet | Normal (min–max / moy.) | Critique (min–max / moy.) | Crit. effectif | Espérance / lancer | Sur Vulnérable (espérance) | par PA |
|---|---|---|---|---|---|---|---|
| Frappe Repoussoir | 16–20 (crit 21–25) | 976–1 220 / 1 098 | 1 281–1 525 / 1 403 | 40 % | **1 220** | 2 440 | 407 (813) |
| Videur (base = amélioré) | 59–63 (crit 72–77) | 3 599–3 843 / 3 721 | 4 392–4 697 / 4 545 | 40 % | **4 050** | 8 101 | 1 013 (2 025) |
| Voltige (base = amélioré) | 58–62 (crit 70–74 inatteignable) | 3 538–3 782 / 3 660 | — | 0 % | **3 660** | 7 320 | 915 (1 830) |

Comparaison avec le guide :

- DPLN, Videur « environ 4 000 » ✓ (espérance 4 050) ; vidéo « Videur ≈ 4 000 » ✓ (GD live 47:30).
- DPLN, Frappe Repoussoir « 1 200 » ✓ : c'est le maximum hors critique, et l'espérance vaut 1 220.

### 2.5 Dommages de poussée (collision)

Formule du client (`movement.collision_damage`) : `int(reste × (floor(niv/2) + 32 + DoPou − RéPou) / (4 × 2^i))`.

- `reste` : nombre de cases non parcourues ;
- `niv` : 200 ;
- `i` : rang dans la chaîne de collision (0 = cible poussée).

| Dommages de poussée | contexte | 1 case | 2 | 3 | 4 | 5 | 6 | 2e combattant de la chaîne (1 case) |
|---|---|---|---|---|---|---|---|---|
| 1 000 | base | 283 | 566 | 849 | 1 132 | 1 415 | 1 698 | 141 |
| 1 200 | + 1 Acclamation repoussante | 333 | 666 | 999 | 1 332 | 1 665 | 1 998 | 166 |
| 1 500 | + Amplification (Magicien, +500, 3 tours) | 408 | 816 | 1 224 | 1 632 | 2 040 | 2 448 | 204 |
| 2 000 | Dégagez ! (+1 000) ou Amplification améliorée | 533 | 1 066 | 1 599 | 2 132 | 2 665 | 3 198 | 266 |
| 3 000 | Dégagez ! + Amplification améliorée | 783 | 1 566 | 2 349 | 3 132 | 3 915 | 4 698 | 391 |

**HYPOTHÈSE (moyenne).** Vulnérable ne multiplie **pas** ces dégâts. Dans le client, les collisions ignorent les multiplicateurs, sauf les 1163 déclenchés par PD/PMD/PPD. À vérifier.

### 2.6 Masques de cible rencontrés

| Jeton | Sens | Confiance |
|---|---|---|
| `a` | alliés, lanceur inclus | moyenne |
| `A` | ennemis | haute |
| `g` | alliés **sauf** le lanceur (poussée d'Aïronemane : le lanceur au centre n'est pas poussé) | moyenne |
| `j` | **invocations alliées** : le Poutch. L'infobulle de Frappe Repoussoir affiche « (Invoc.) ». Seuls Frappe Repoussoir et les 7 sorts de dégâts du Dompteur ont `j`, c'est-à-dire les sorts capables de déclencher le renvoi du Poutch. | moyenne-haute |
| `C` | le lanceur | haute |
| `O` | l'auteur de l'événement déclencheur (l'attaquant du Poutch) | moyenne |
| `E#` / `e#` / `*E#` / `F#` | la cible a / n'a pas l'état # ; le **lanceur** a l'état # ; la cible est le monstre # | haute |

---

## 3. Sorts classiques, dans l'ordre d'obtention

L'ordre d'obtention est un **FAIT vérifié** : le « Spell Manager » 30626 est lancé à chaque objectif réalisé, et son niveau N apprend (effet 3405) au porteur de l'état 5900 :

| Niveau du Spell Manager | Spell-level appris | Sort |
|---|---|---|
| 1 | 80513 | Hanedimane |
| 2 | 80510 | Voltige |
| 3 | 80522 | Aïronemane |
| 4 | 80511 | Pugnace |
| 5 | 80509 | Soutien Stratégique |
| 6 | 80512 | Va-t-en-guerre |

Cet ordre est identique au texte DPLN et aux vidéos (Huz 05:00, sspritenL). Videur est le sort de départ.

**Mécanisme d'amélioration (FAIT vérifié).** Les sorts « Amélioration : X » (30478 à 30484) font quatre choses :

1. posent l'état permanent 6003 à 6009 « boostedSpell acrobateN » ;
2. exécutent 30470 (infobulle) ;
3. **désapprennent** le spell-level de base (3406) ;
4. **apprennent** le spell-level amélioré (3405).

L'intervalle de relance repart donc de zéro (DPLN). Les améliorations sont proposées par les Glyphes Évènementiels (« cadeaux »).

### 3.1 Tableau des conditions de lancer (FAIT vérifié)

Colonnes : **LdV** = ligne de vue ; **Ligne** = lancer en ligne ; **/tour** et **/cible** = lancers par tour et par cible (0 = illimité) ; **Interv.** = intervalle de relance ; **Crit** = taux critique du sort, avec le taux effectif (+10 %) entre parenthèses.

| # | Sort (spell-level) | PA | PO | PO modif. | Ligne | LdV | Case | /tour | /cible | Interv. | Crit | Zone | Autre |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | **Videur** 30402 (80507) | 4 | 1–5 | oui | oui | oui | — | 2 | 0 | 0 | 30 % (40 %) | T2 (5 cases) | — |
| 0 ↑ | Videur amélioré 30567 (80766) | 4 | 1–5 | oui | oui | oui | — | 2 | 0 | 0 | 30 % (40 %) | **T3** (7 cases) | poussée **4** |
| 1 | **Hanedimane** 30408 (80513) | 3 | 1–3 | oui | oui | oui | — | **1** | 0 | 0 | 0 | F2 (10 cases) | — |
| 1 ↑ | Hanedimane amélioré 30574 (80784) | 3 | 1–3 | oui | oui | oui | — | 1 | 0 | 0 | 0 | **F3** (13 cases) | poussée et attirance **6** |
| 2 | **Voltige** 30404 (80510) | 4 | 1–5 | oui | non | oui | **occupée** | 2 | **1** | 0 | 0 | P | — |
| 2 ↑ | Voltige améliorée 30570 (80775) | 4 | 1–**7** | oui | non | oui | (plus de « case occupée ») | **2** | 1 | 0 | 0 | P | amélioration annoncée « 2 > 3 lancers » **absente** des données |
| 3 | **Aïronemane** 30405 (80522) | 3 | 1–5 | oui | non | **non** | **libre** | — | — | **1** | 0 | X1 (5 cases) | interdit en état **Pesanteur** (7) |
| 3 ↑ | Aïronemane améliorée 30571 (80778) | 3 | 1–5 | oui | non | non | libre | — | — | 1 | 0 | X1 | poussée **4** ; plus de critère Pesanteur |
| 4 | **Pugnace** 30406 (80511) | 2 | 0 | non | — | — | — | — | — | **2** | 0 | P (soi) | — |
| 4 ↑ | Pugnace amélioré 30572 (80780) | 2 | 0 | (oui) | — | — | — | — | — | 2 | 0 | P | **50 %** de résistance |
| 5 | **Soutien Stratégique** 30403 (80509) | 3 | 1–**8** | oui | non | **non** | **libre** | — | — | **1** | 0 | X5 + « + »5 (41 cases) | invoque 7985 |
| 5 ↑ | Soutien Stratégique amélioré 30569 (80773) | 3 | 1–8 | oui | non | non | libre | — | — | 1 | 0 | X7 + « + »7 (57 cases) | invoque 7986 ; attirance 6 ; renvoi en C3,1 |
| 6 | **Va-t-en-guerre** 30407 (80512) | 2 | 1–6 | oui | oui | oui | — | 2 | 1 | 0 | 0 | P | avance **2** |
| 6 ↑ | Va-t-en-guerre amélioré 30573 (80782) | 2 | 1–6 | oui | oui | oui | — | 2 | 1 | 0 | 0 | P | avance **4** |
| — | **Frappe Repoussoir** 30416 (80499) | 3 | 1–6 | oui | non | oui | — | 2 | 0 | 0 | 30 % (40 %) | P | commun, sans amélioration |

Aucun de ces sorts n'a de relance initiale ni de relance globale. Aucun n'impose une diagonale. `maxStack` = −1 partout.

### 3.2 Videur — sort de départ (30402 → 30567)

- **Effets réels, dans l'ordre**, zone **T** (ligne perpendiculaire à l'axe du lancer, centrée sur la case ciblée) de rayon 2 (5 cases) :
  1. *(affichage)* `5` Repousse de 3 cases ;
  2. `1160` → **30689 « Videur [Poussée] » niv. 1** (spell-level 80981) exécuté sur **chaque combattant, allié ou ennemi** (`a,A`), de la zone : `5` Repousse de **3** cases (zone P1). La poussée part donc du **lanceur** ;
  3. `100` **59 à 63** dommages neutres aux **ennemis** de la zone.
- **Critique** (30 %, soit 40 % effectif) : poussée identique ; `100` **72 à 77**.
- **Amélioré (30567)** : zone **T3** (7 cases) ; sous-sort 30689 **niv. 2** (80982) : poussée **4**. Dégâts inchangés.
- **Dégâts** : 3 599–3 843 (critique 4 392–4 697), espérance **4 050** par lancer, **≈ 8 100** sur une cible Vulnérable. Deux lancers par tour : c'est tout le budget de 8 PA.
- **Guide.** Texte : « Repousse et frappe environ du 4 000 » ✓. Infobulle capturée (`ark26gladia2`) : « 62 à 66 » et « 74 à 79 ». **Écart** avec les données (59–63, 72–77) : probable rééquilibrage après la capture. Amélioration « 5 > 7 cases ; 3 > 4 cases » ✓.
- **Attention.** Videur pousse aussi les **alliés** de la ligne.
- **Rendu de zone** (repère MapPoint : x vers la droite, y vers le haut ; @ = lanceur, O = case ciblée, # = zone) :

```
T2 (5 cases)              T3 (7 cases)
. . . # . .               . . . . # . .
. . . # . .               . . . . # . .
. @ . O . .               . . . . # . .
. . . # . .               . . @ . O . .
. . . # . .               . . . . # . .
                          . . . . # . .
                          . . . . # . .
```

### 3.3 Hanedimane — 1er objectif (30408 → 30574)

- **Zone F2 (« fourche »)**, 10 cases : la case ciblée, plus 3 branches de profondeur 3 vers l'avant (l'axe et les deux diagonales). L'infobulle affiche « fourche de 10 cases » et DPLN parle de « fourche de taille 3 ». Implémentation : `zones._fill_fork`, profondeur = rayon + 1.
- **Effets réels** : `1160` → **30693 « Hanedimane [Poussée] » niv. 1** (80995) sur chaque combattant de la fourche :
  - `5` repousse les **ennemis** de **4** ;
  - `6` attire les **alliés** de **4** vers le lanceur.
  - Les effets 6 et 5 du sort principal sont d'affichage.
- **Amélioré (30574)** : **F3** (13 cases) ; 30693 niv. 2 : poussée et attirance **6**. DPLN « 3 > 4 », « 4 > 6 » ✓ ; vidéo Khytrayer 07:37 « 4 → 6 » ✓.
- **Conditions** : 3 PA, PO **1–3 en ligne**, ligne de vue, **1 par tour**.
- **Usage.** C'est le « bulldozer » : toute la fourche avance de 4 (6) cases parallèlement à l'axe (§ 2.3).
  - Erreur classique : attirer un allié vers les monstres (Koza 10:30).
  - Autre piège : un monstre poussé par Hanedimane puis par Videur peut s'arrêter **une case avant** les pics (Khytrayer 09:23).

```
F2 (10 cases), case ciblée à 1 case    F3 (13 cases)
. . . . . # .                          . . . . . . # .
. . . . # . .                          . . . . . # . .
. . . # . . .                          . . . . # . . .
. @ O # # # .                          . . . # . . . .
. . . # . . .                          . . @ O # # # # .
. . . . # . .                          . . . # . . . .
. . . . . # .                          . . . . # . . .
                                       . . . . . # . .
                                       . . . . . . # .
```

### 3.4 Voltige — 2e objectif (30404 → 30570)

- **Effets réels** :
  1. `8` **échange de positions** avec la cible, alliée ou ennemie (case occupée requise) ;
  2. `100` **58 à 62** dommages neutres si la cible est ennemie.
- **Critique** : 0 % dans les données. Les effets critiques (70–74) ne sont jamais tirés, et l'infobulle DPLN n'affiche aucune ligne « Critique ».
- **Conditions** : 4 PA, PO 1–5, pas besoin d'être en ligne, ligne de vue, 2 par tour, **1 par cible**.
- **Amélioré (30570)** : PO 1–**7** ✓. Lancers par tour « 2 > 3 » ✗ : **non présent** dans les données (`maxCastPerTurn` = 2). Voir § 9.
- **Dégâts** : 3 538–3 782 (espérance 3 660) ; ×2 sur Vulnérable.
- **Utilité pour les pics.**
  - L'Acrobate **se place dans les pics**, puis échange avec un monstre : le monstre entre dans les pics et l'Acrobate en sort.
  - Cela marche **même sur un Inébranlable** (Mama, Troollibre sous Patroolleur, Nitrooll après Troollement de Tambour) : l'échange n'est pas une poussée. Seule la Pesanteur (7, `cantSwitchPosition`) l'empêche.
  - Coût : l'Acrobate subit l'entrée dans les pics (2 000 dégâts et Vulnérable), et le glyphe de début de tour s'il reste dedans.
  - Source : Houmilito 3:19:30 (« la Mama est inébranlable… Voltige »).

### 3.5 Aïronemane — 3e objectif (30405 → 30571)

- **Effets réels** :
  1. `4` **téléporte le lanceur** sur la case ciblée (libre, PO 1–5, **sans ligne de vue**) ;
  2. `3792` : script visuel (value 21008 = identifiant `boundScriptUsageData` de l'animation) ;
  3. `5` **repousse de 2 cases** les combattants des 4 cases voisines (croix X1). Masque `g,A` : alliés hors lanceur et ennemis. La poussée part du centre vers l'extérieur ;
  4. *(affichage)* `792` → 30419.
- **Amélioré (30571)** : poussée **4**. Le critère « interdit en Pesanteur » (`HS!7`) disparaît dans les données.
- **Guide.** Capture de base : « croix de 5 cases », « Repousse de 2 cases » ✓. Pour l'amélioration, trois valeurs coexistent :
  - données : **2 → 4** (retenu) ;
  - description in-game de 30481 : « 4 > 6 » ;
  - table DPLN : « 5 > 6 ».
- **Usage.**
  - Mobilité : 3 PA pour 5 cases sans ligne de vue, par-dessus les lignes de monstres. Intervalle 1, donc 1 fois par tour.
  - Poussée multiple : se poser **entre** des monstres proches des pics pour les écarter vers les bords.

```
X1 (5 cases) : l'Acrobate se téléporte sur O, les 4 # sont poussés vers l'extérieur
. . . . .
. . # . .
. # O # .
. . # . .
```

### 3.6 Pugnace — 4e objectif (30406 → 30572)

- **Effets réels**, sur le lanceur, pour 1 tour :
  - état **Inébranlable** (157, `cantBePushed`) ;
  - **+25 %** de résistance tous éléments (effet 1076).
- **Amélioré** : **+50 %** ✓. Plafond joueur de 50 % dans la formule client.
- **Conditions** : 2 PA, PO 0, **intervalle 2** (un tour sur deux).
- **Durée.** Le buff dure jusqu'au **début du prochain tour de l'Acrobate**. Il couvre donc les tours de tous les autres combattants, y compris la Mama qui joue en tête de tour.
- **Rôle pour les pics** (défensif) : il empêche l'Acrobate d'être poussé dans les pics.
  - Poussées concernées : Troollpoline (3), Tir d'Artroollerie (2), Coup de Trooll (3), Double Trooll (2), Uppertrooll (6).
  - **HYPOTHÈSE (moyenne)** : il bloque aussi le **Rassemblement Troollesque** de la Mama. C'est une poussée 1103, qui n'est pas une poussée « forcée ».
  - Conséquence : **Pugnace en fin de T7** protège l'Acrobate de l'arrivée de la Mama au T8.

### 3.7 Soutien Stratégique — 5e objectif (30403 → 30569)

**Sort principal : effets réels.**

1. `181` : invoque le **Poutch** « Stratège Dompteur » **7985** (grade 1).
   - 5 500 PV, niveau 200, 0 PA, 0 PM, 0 résistance.
   - N'occupe pas d'emplacement d'invocation. Se pousse et s'échange normalement.
2. `6` : attire de **4** cases vers le Poutch les **ennemis** situés sur la croix **X5**, sur les axes.
3. `6` : même attirance sur la croix **« + »5**, les diagonales. Cet effet n'est pas affiché dans l'infobulle.
   - Au total, la zone couvre 8 demi-droites de 5 cases, soit 41 cases.
   - L'infobulle n'annonce que la « croix de 21 cases ».

Les effets 1163 et 1223 du sort principal sont d'affichage.

**Comportement réel du Poutch** : son sort de départ **30421** (80525 à 80528) :

- `1163` : il subit ×50 % des dommages venant d'**alliés** (déclencheur DBA). DPLN : « réduit de 50 % les dommages immédiats alliés » ;
- quand il est touché (D) ou tué (XD), il exécute sa suite (niveaux 2 → 3 → 4) :
  - si l'auteur (`O`) est un **allié à l'état Dompteur** (5899), le Poutch inflige **50 % des dommages INITIAUX** subis (`1123`) aux **ennemis** situés à **1–2 cases** de lui ;
  - la zone de ce renvoi est C2,1 : 12 cases, sans dégressivité ;
- `141` : il tue tout autre Poutch allié, 7985 ou 7986 : **un seul Poutch par équipe**.

**Version améliorée (30569).** Poutch **7986**, sort de départ 30568 :

- attirance **6** sur **X7** et **« + »7** ;
- renvoi en **C3,1** (24 cases).

DPLN « 2 > 3 ; 5 > 7 ; 4 > 6 » ✓.

**Points ouverts.**

- La description dit que le Poutch renvoie « uniquement s'il est attaqué par un Dompteur ». Seuls les sorts du Dompteur et Frappe Repoussoir ont le masque `j` et peuvent donc le frapper. Un Dompteur qui frappe le Poutch avec Frappe Repoussoir ou un sort de zone déclenche le renvoi, **×2 sur les monstres Vulnérables** autour de lui.
- **Durée de vie. HYPOTHÈSE basse** : l'effet 181 a une durée de 1. Il existe aussi un sort 30420 « Soutien Stratégique [Mort] » : état 6027 pendant 1 tour, puis `141` qui tue le porteur de 6027 au début de son tour. Aucun sort ne référence 30420. Le Poutch ne vivrait donc peut-être qu'un tour.
- **Avis des joueurs** : « vraiment pas » utile (Koza 10:00).

```
X5 + « + »5 (41 cases) : le Poutch invoqué sur O attire les ennemis des # vers lui
#  .  .  .  .  #  .  .  .  .  #
.  #  .  .  .  #  .  .  .  #  .
.  .  #  .  .  #  .  .  #  .  .
.  .  .  #  .  #  .  #  .  .  .
.  .  .  .  #  #  #  .  .  .  .
#  #  #  #  #  O  #  #  #  #  #
.  .  .  .  #  #  #  .  .  .  .
.  .  .  #  .  #  .  #  .  .  .
.  .  #  .  .  #  .  .  #  .  .
.  #  .  .  .  #  .  .  .  #  .
#  .  .  .  .  #  .  .  .  .  #
```

### 3.8 Va-t-en-guerre — 6e objectif (30407 → 30573)

- **Effet réel** : `1042` (`CharacterGetPulled`). **Le lanceur** avance de **2** cases (**4** amélioré) vers la cible, alliée ou ennemie. La cible ne bouge pas.
- **Conditions** : 2 PA, PO 1–6 en ligne, ligne de vue, 2 par tour, 1 par cible.
- **Guide.** Capture DPLN : PO « 1–7 », alors que les données donnent 1–6. Probablement une capture prise avec +1 PO. DPLN « 2 > 4 » ✓.
- **Usage.** Mobilité à 1 PA la case, pour se mettre en ligne et à portée d'un Videur (PO 5) ou d'un Hanedimane (PO 3) sans dépenser de PM.

---

## 4. Sort commun : Frappe Repoussoir (30416, spell-level 80499)

- **Effets réels** :
  1. `5` : repousse de **2** cases, alliés comme ennemis, depuis le lanceur ;
  2. `100` : **16 à 20** dommages neutres aux **ennemis et aux invocations alliées** (masque `j,A`).
- **Critique** : 21 à 25. Taux de 30 % dans les données, **40 % effectif**.
- **Conditions** : 3 PA, PO 1–6 (modifiable), pas besoin d'être en ligne, ligne de vue, 2 par tour.
- **Dégâts** : 976–1 220 (critique 1 281–1 525), **espérance 1 220** ; ×2 sur Vulnérable.
- **Guide** : DPLN « 1 200 et repousse de 2 cases » ✓. L'infobulle capturée affiche « Critique 40 % », cohérent avec le taux effectif.
- Aucune amélioration n'existe, ni dans DPLN ni dans les données.
- **Usage.**
  - Finir de pousser un monstre à ≤ 2 cases des pics.
  - Pousser n'importe où, pas seulement en ligne.
  - Frapper le Poutch pour un Dompteur.

---

## 5. Sorts uniques (usage unique : le sort s'oublie lui-même via 3406)

Tous coûtent **5 PA**. Aucun n'a de critique, d'intervalle ni de limite par tour.

| Sort (spell-level) | PO | Effets réels, dans l'ordre (FAIT vérifié) | Guide | Remarques |
|---|---|---|---|---|
| **Dégagez !** 30604 (80828) | 0 | 1. **+1 000 dommages de poussée** au lanceur, 3 tours ; 2. repousse de **5** cases **tous les ennemis** de la carte (C63 autour du lanceur, sauf la Mama avant son entrée, état 5971), depuis le lanceur ; 3. oubli | ✓ (« 5 cases », « augmente les dommages de poussée ») | Le bonus est posé **avant** la poussée : 533 dégâts par case non parcourue. Le meilleur unique selon les joueurs ; à garder pour T9–T10 ou pour « Au coin ! ». |
| **Courage, fuyons** 30605 (80829) | 0 | 1. **+4 PM** à **tous les alliés**, 2 tours ; 2. oubli | ✓ | — |
| **Immortalité du Courageux** 30616 (80844) | 1–63, sans ligne de vue, case occupée, entité visible, cumul 1 | 1. **Seuil de 1 PV** sur le lanceur, 2 tours ; 2. oubli ; 3. **interception des dommages** (765) pour les alliés hors lanceur dans un **cercle de rayon 2** (13 cases) autour de la case ciblée, 2 tours ; 4. le lanceur **avance de 63 cases** vers la cible ; 5. état 5967 « Endolori » sur la cible | DPLN « 1 % de ses PV » : l'effet dit 1 PV | Les alliés protégés sont choisis **avant** le déplacement. À utiliser en T7 contre l'arrivée de la Mama (Laltoss). |
| **Malédiction Mouvante** 30617 (80845) | 0 | 1. *(affichage)* poussée 2 ; 2. `1018` sur tous les ennemis (hors 5971), déclencheur D, pendant 1 tour : quand un ennemi subit des dommages, **l'attaquant** exécute 30676 : **poussée de 2** depuis l'attaquant ; 3. état 5980, 1 tour ; 4. oubli | ✓ | Chaque coup allié éloigne la cible de l'attaquant. Il faut placer les frappeurs **du côté opposé aux pics**. **HYPOTHÈSE** : les 2 000 dégâts d'entrée dans les pics peuvent redéclencher une poussée. |
| **Chamboulement** 30618 (80846) | 1–63, sans ligne de vue | 1. retire l'état Marqué (5916) ; 2. le lanceur exécute **30677** sur l'ennemi ciblé : déclencheurs PD/XPD, état Marqué 1 tour, puis **poussée 5** ; 3. si la cible subit des dommages de poussée ou en meurt, elle exécute 30677 niv. 2 : **une seule** exécution (value 1) sur un autre ennemi non Marqué, ce qui provoque un **rebond** ; 4. dissipe 30677 ; 5. oubli | Infobulle « Repousse de 6 cases » : l'effet réel pousse de **5** (§ 9) | **HYPOTHÈSE** : le rebond vise le plus proche et part du monstre heurté. |
| **Un pour un** 30619 (80847) | 0 | `792` → 30625 : pendant **2 tours**, dommages subis **×50 %** ; à chaque coup reçu, renvoi (1017 → 1223) de **100 % des dommages finaux** subis à l'attaquant, soit environ 50 % des dommages initiaux ; puis oubli | DPLN omet la réduction de 50 % | Défensif. |
| **Pense Vite** 30615 (80843), commun aux 3 archétypes | 0 | 1. **tour suivant limité à 10 s** (3407 value 10) ; 2. **+999 PA** (délai 1, durée 1) ; 3. dissipe Pense Vite à la fin de ce tour (délai 1) ; 4. script visuel ; 5. oubli | DPLN et capture « 15 s » : **écart**, les données (texte et valeur) disent 10 s | Houmilito (bêta) a observé 10 s. Les limites par tour et par cible restent actives : 2 Videur au maximum, etc. |

Les uniques s'obtiennent sur les Glyphes Évènementiels (cadeaux) : le choix passe par l'effet 3008 de 30657 niveau 3.

---

## 6. Bonus « Acclamations de la foule » de l'Acrobate (FAIT vérifié, haute)

**Mécanisme.**

- À chaque début de tour global, **3 des 6** bonus sont proposés : fenêtre « Choisis une amélioration permanente ! », combat en pause (capture `ark26gladia41`).
- Le sort choisi porte un effet d'affichage, puis exécute (792) le niveau correspondant de **30590 « Acclamations de la foule [Acrobate] »**, de durée −1 : permanent et cumulable.
- Le tirage des 3 propositions est fait côté serveur : il n'est pas dans les données.

| Sort de choix | Nom | Effet réel (30590 niv. / spell-level) | Valeur | Libellé DPLN |
|---|---|---|---|---|
| 30595 | Acclamation accélérante | niv. 1 / 80810 : `111` PA | **+1 PA** | « 1 PA » ✓ |
| 30596 | Acclamation agile | niv. 2 / 80811 : `128` PM | **+1 PM** | « 1 PM » ✓ |
| 30597 | Acclamation robuste | niv. 3 / 80812 : `1076` % résistance | **+10 %** tous éléments | « 10 % de résistances » ✓ |
| 30635 | Acclamation optique | niv. 4 / 80880 : `117` Portée | **+1 PO** | « 1 Portée » ✓ |
| 30636 | Acclamation repoussante | niv. 5 / 80881 : `414` Dommages de poussée | **+200** | « 200 Dommages de poussée » ✓ |
| 30637 | Acclamation résistante | niv. 6 / 80882 : `2803` % résistance mêlée | **+10 %** | « 10 % Résistance mêlée » ✓ |

Les Acclamations « puissante », « vitalesque », « soignante », « critique » et « chanceuse » n'appartiennent **pas** à l'Acrobate.

**Priorités rapportées.**

- DPLN : PM et PA.
- Vidéos : **PO** d'abord (Koza, Zephiron, Huz 12:08 « 0 PO, ça peut être un gros problème »), puis PA et PM.
- Justification (HYPOTHÈSE haute) : toutes les PO de l'Acrobate sont modifiables, et +1 PO élargit à la fois Videur (1–5 en ligne) et Hanedimane (1–3 en ligne).

**Amplification (Magicien) sur l'Acrobate.** Elle donne **+500 dommages de poussée** pendant 3 tours, **+1 000** en version améliorée (30411 et 30578, masque `a,e5968,E5900`). La capture DPLN et les vidéos confirment +500. La table DPLN « 100 > 200 » reprend une description d'amélioration fausse.

---

## 7. Interactions avec les pics et Vulnérable : analyse géométrique

Carte de combat 139988488 : voir les notes 40 et 41 et `research/data/map_139988488.json`.

- 145 cases jouables hors pics, 96 cases de pics jouables, **aucun obstacle**.
- Les pics forment un anneau de profondeur **2**, parfois 3, collé au mur.
- Départ des joueurs : 286, 287, 314 et 315, autour du centre 300.

### 7.1 Distance aux pics : ce que chaque poussée peut faire (calcul, haute)

On note `k` le nombre de cases à parcourir en ligne pour atteindre la première case de pics, dans la meilleure des 4 directions axiales. Répartition sur les 145 cases hors pics :

| k | 1 | 2 | 3 | 4 | 5 | 6 | 7 (centre 300 seul) |
|---|---|---|---|---|---|---|---|
| cases | 36 | 32 | 28 | 24 | 16 | 8 | 1 |
| cumul | 25 % | 47 % | 66 % | 83 % | 94 % | 99 % | 100 % |

En diagonale, il faut au plus 5 pas. Mais une poussée diagonale n'avance que de ceil(n/2) pas.

**Règle (poussée axiale de n cases, sans obstacle).**

- La cible entre dans les pics si **n ≥ k**.
- Pour des pics de profondeur `d` = 2, la cible s'arrête au mur après `k + d − 1` cases.
- Le reste `r = n − (k + 1)` produit une collision de **r × 283** dégâts (DoPou 1 000).

| Sort (distance) | k = 1 | k = 2 | k = 3 | k = 4 | k = 5 |
|---|---|---|---|---|---|
| Frappe Repoussoir, Aïronemane (2) | pics, 0 collision | pics | — | — | — |
| Videur (3) | pics + 283 | pics | pics | — | — |
| Videur amélioré, Hanedimane, Aïronemane améliorée (4) | pics + 566 | pics + 283 | pics | pics | — |
| Dégagez ! (5, DoPou 2 000) | pics + 1 599 | pics + 1 066 | pics + 533 | pics | pics |
| Chamboulement (5) | pics + 849, puis rebond | pics + 566, puis rebond | pics + 283, puis rebond | pics | pics |
| Hanedimane amélioré (6) | pics + 1 132 | pics + 849 | pics + 566 | pics + 283 | pics |

**Conséquence.** Depuis le cœur de l'arène (k ≥ 5), il faut **enchaîner** deux poussées :

- Hanedimane puis Videur ;
- Videur puis Videur ;
- ou une poussée précédée d'un **déplacement** de l'Acrobate pour « prendre l'axe » (PM, Aïronemane, Va-t-en-guerre).

Attention aux combinaisons qui s'arrêtent une case avant les pics (Khytrayer 09:23).

### 7.2 Exemple vérifié par simulation : tour 1, vague 1

Calcul reproductible : section `workedExamples.T1_wave1_videur` du JSON, calculée par le générateur avec `tools/mechanics` et la carte 139988488. Situation :

- La vague 1 place deux Troollibres en **242** (13,−4) et **358** (21,−4). Tous deux sont à **k = 3** des pics, 242 vers −x et 358 vers +x (note 40, FAIT observé).
- Les alliés occupent les trois autres cases de départ et bloquent la ligne de vue sur l'axe y = −4.

Résultats **sans déplacement** :

| Case de l'Acrobate | Lancers qui envoient un Troollibre dans les pics |
|---|---|
| **314** (17,−5) | Videur sur **256** (13,−5) : la ligne T attrape 242 → pics en 199. Videur sur **372** (21,−5) : attrape 358 → pics en 402. **Les deux en un tour** (8 PA), sans pousser d'allié. |
| **287** (17,−3) | Videur sur **229** et sur **345** : même résultat, les deux Troollibres. |
| 286 / 315 | un seul des deux, l'autre ligne est bloquée par un allié |

Cela confirme la consigne de cardxc (03:30) : « l'acrobate ici, il doit pousser les deux troules ». La ligne T permet de toucher une cible **hors axe**, et la poussée reste parallèle à l'axe parce que la portée vaut 4.

### 7.3 Autres interactions

- **Vulnérable ×2** s'applique à tous les dégâts des Dompteurs (et au renvoi du Poutch). C'est la raison d'être de l'Acrobate : jouer **avant** les Dompteurs.
  - Un Trooll de ≤ 2 000 PV laissé dans les pics meurt seul au début de son tour (vidéos).
  - Les données donnent **1 000** dégâts pour le début de tour dans les pics (30390 niv. 3). Mais la cible est Vulnérable tant qu'elle est dans l'aura : 1 000 × 2 = **2 000**, ce qui est cohérent avec DPLN et les vidéos (HYPOTHÈSE haute).
  - Les 2 000 dégâts d'**entrée** sont appliqués avant la pose du ×200 % : ils ne sont pas doublés, sauf si la cible était déjà Vulnérable (sortie récente des pics, HYPOTHÈSE).
- **Réentrée dans les pics. HYPOTHÈSE.** Les états 5902 et 5903 sont perdus à la sortie de l'aura. Faire sortir puis rentrer un monstre redéclencherait donc les 2 000 dégâts et un Vulnérable neuf.
- **Voltige depuis les pics** fait en un seul sort : ennemi dans les pics + allié hors du glyphe. C'est exactement l'objectif **« Toi, par ici, et toi, par là »**.
- **Arrivée de la Mama (T8, case 300 ou 287).** Elle repousse jusqu'au bord tous les personnages alignés avec elle (1103, force 63).
  - Défenses de l'Acrobate : **Pugnace** en fin de T7 (§ 3.6, hypothèse) ou **Immortalité du Courageux**.
  - Ensuite : la pousser dans les pics (Videur, Hanedimane, Frappe Repoussoir), ou **Voltige** si elle est Inébranlable.
  - Tant qu'elle n'est pas passée dans les pics, elle est invulnérable.
- **Dégagez !** pousse tous les monstres à 5 cases avec 2 000 de DoPou. Ce sort sert en T9–T10, où les restes de vagues s'ajoutent à des vagues de 5 à 6 monstres.

---

## 8. Analyse tactique

### 8.1 Budget de PA (8 PA de base)

| Combinaison | PA | Effet |
|---|---|---|
| Videur ×2 | 8 | ≈ 8 100 dégâts espérés, jusqu'à ≈ 16 000 sur deux cibles Vulnérables ; 2 lignes T de poussée 3 |
| Hanedimane + Videur | 7 | poussée de 4 en fourche puis 3 en ligne : jusqu'à 7 cases de poussée cumulées (atteint les pics depuis k ≤ 7) |
| Hanedimane + Aïronemane + Pugnace | 8 | double placement de masse + protection |
| Voltige + Videur | 8 | échange (Inébranlable ou depuis les pics) + poussée |
| Aïronemane + Videur | 7 | repositionnement de 5 cases sans ligne de vue, puis poussée |
| Va-t-en-guerre ×2 + Videur | 8 | 4 cases de déplacement « en PA », puis poussée |
| Frappe Repoussoir ×2 + Pugnace | 8 | deux petites poussées de 2, protection |
| Unique (5) + Frappe Repoussoir (3) | 8 | — |

Avec +1 PA (Acclamation accélérante), Hanedimane + Videur + Pugnace = 9 PA.

### 8.2 Priorités

- **Améliorations** (joueurs et analyse) : **Videur** (T3, poussée 4), puis **Hanedimane** (F3, poussée 6), puis Aïronemane (poussée 4).
  - Voltige améliorée : +2 PO seulement (le 3e lancer n'existe pas dans les données).
  - Pugnace amélioré : 50 % de résistance, utile contre la Mama.
  - Soutien Stratégique et Va-t-en-guerre : faible priorité.
- **Uniques** : **Dégagez !** (fin de combat, « Au coin ! », « Faire le mur », « Trous dans les Trools »), puis **Immortalité du Courageux** (T7), puis Pense Vite (burst au T8, en 10 s). Les autres sont jugés peu utiles.
- **Bonus** : **PO**, puis PA, puis PM ; les résistances en dernier.

### 8.3 Objectifs où l'Acrobate est décisif (liste DPLN)

| Objectif | Outil de l'Acrobate |
|---|---|
| **Empalé** (toujours le 1er) : tuer un Trooll entré dans les pics et Vulnérable | Videur ou Hanedimane au T1 (§ 7.2), puis un Dompteur tue |
| **Trous dans les Trools** : 4 ennemis différents entrent dans les pics dans le tour d'un allié | Dégagez !, Hanedimane + Videur sur un groupe |
| **Au coin !** : tous les ennemis dans les pics à la fin du tour d'un allié | Dégagez ! |
| **Faire le mur** : 3 ennemis différents subissent des dommages de poussée dans le tour d'un allié | Dégagez !, ou poussées sur des monstres à k ≤ 2 (table 7.1) |
| **Attention, sol glissant** : achever par dommages de poussée | collision de 283 par case (533 avec Dégagez !) sur un monstre affaibli |
| **Toi, par ici, et toi, par là** | Voltige depuis les pics |
| **Tout le monde veut prendre sa place** : finir sur la case de l'ennemi le plus éloigné | **Voltige** sur cet ennemi (l'Acrobate prend exactement sa case), ou Aïronemane si la case est libre |
| **Distance d'insécurité** : Artroolleurs à ≤ 3 cases d'un allié | mobilité (Aïronemane, Va-t-en-guerre), Hanedimane (attire les alliés), Soutien Stratégique (attire les ennemis) |
| **Productivité** : 3 sorts dans un tour | Pugnace + Va-t-en-guerre ×2 (6 PA), ou Hanedimane + Pugnace + Aïronemane (8 PA) |
| **Ébranlable** : achever un ennemi Inébranlable | Voltige pour le placer dans les pics malgré l'état |
| **1, 2, 3, Soleil !** : finir sur sa case de départ | éviter Hanedimane (il déplace les alliés), Aïronemane et Voltige |

---

## 9. Écarts entre les données du jeu, le guide DPLN et les vidéos

La donnée fait foi, sauf mention contraire.

| Sujet | Données (FAIT vérifié) | DPLN / vidéos (FAIT rapporté) | Verdict | Confiance |
|---|---|---|---|---|
| Jets de Videur | 59–63, critique 72–77 (80507, 80766) | capture : 62–66 / 74–79 ; texte « ≈ 4 000 » | rééquilibrage probable après la capture ; « ≈ 4 000 » reste juste (espérance 4 050) | moyenne |
| Critique de Frappe Repoussoir | 30 % (+10 % = 40 %) | capture : 40 % | cohérent si l'infobulle ajoute le critique du personnage. Mais la capture de Videur montre 30 %, sans cet ajout | basse |
| Lancers de Voltige améliorée | `maxCastPerTurn` = 2 | « 2 > 3 » (DPLN et description de 30480) | **amélioration absente** des données (bug ou réglage serveur). Défaut simulateur : 2, avec une option à 3 | moyenne |
| Poussée d'Aïronemane améliorée | 2 → **4** | description 30481 : « 4 > 6 » ; table DPLN : « 5 > 6 » ; capture de base : 2 | les effets font foi : 2 → 4 | moyenne |
| PO de Va-t-en-guerre | 1–6 | capture : 1–7 | capture prise avec +1 PO ? | basse |
| Durée de Pense Vite | **10 s** (3407 value 10 et description) | 15 s (texte et capture) ; Houmilito : 10 s | rééquilibrage : 10 s | haute |
| Distance de Chamboulement | poussée réelle **5** (30677) ; affichage 6 | capture : 6 | écart **interne** aux données | moyenne |
| Seuil d'Immortalité du Courageux | 2872 : **1 PV** | « 1 % des PV » (description et DPLN) | équivalent en pratique ; simuler 1 PV | moyenne |
| Un pour un | ×50 % subis + renvoi de 100 % des dommages finaux | « renvoie 50 % » | DPLN omet la réduction | moyenne |
| PV de l'Acrobate | +5 000 Vitalité conditionnels (30639) | 30 000 (texte, capture, vidéos) | défaut 30 000 ; bonus probablement jamais appliqué | moyenne |
| Vulnérable | ×200 % = **×2** | « +200 % » (= ×3) | ×2 | haute |
| Amplification sur l'Acrobate | +500 / +1 000 dommages de poussée | capture +500 ✓ ; table « 100 > 200 » ✗ ; vidéos +500 ✓ | 500 → 1 000 | haute |
| Glyphe de début de tour | 30390 niv. 3 : **1 000** | 2 000 ; vidéos : un Trooll à ≤ 2 000 PV meurt dans les pics | **probablement cohérent** : 1 000 × Vulnérable ×2 = 2 000 (hors périmètre Acrobate) | moyenne |

---

## 10. Questions ouvertes à vérifier en vidéo

1. **Cibles figées au lancer** (Videur, Frappe Repoussoir, Voltige). Les dégâts touchent-ils la cible après son entrée dans les pics, donc ×2 ? Attendu : −2 000 puis ≈ −7 400 pour un Videur.
2. **Vulnérable et collisions.** Multiplie-t-il les dommages de poussée ? Selon le client : non.
3. **Pugnace contre le Rassemblement Troollesque.** L'Inébranlable bloque-t-il la poussée 1103 de l'arrivée de la Mama ?
4. **Durée de vie du Poutch** : 1 tour (sort 30420) ou illimitée ?
5. **Voltige améliorée** : 2 ou 3 lancers par tour en jeu ?
6. **PV de l'Acrobate** après le choix : 30 000 ou 35 000 ?
7. **Chamboulement** : la cible du rebond est-elle bien l'ennemi le plus proche, et la poussée part-elle du monstre heurté ?
8. **Sous-sorts exécutés** (30693 : PO 1–6, ligne de vue) : les conditions de lancer sont-elles bien ignorées pour les cibles lointaines ou masquées de la fourche ?

---

## 11. Reproduction

```bash
cd /home/user/GladiatroolSimu
python3 tools/archetypes/build_archetype_acrobate.py --summary   # régénère research/data/archetype_acrobate.json
```

**Structure du JSON.**

- `archetype` : identité, passif 30648, libellé 30640, types de sorts, compositions.
- `baseStats` : avec sources et variante de PV.
- `bonuses[]` : 6 Acclamations.
- `bonusMechanism`.
- `spells[]` : 15 entrées, soit le commun, les 7 classiques et les 7 uniques. Chaque entrée contient :
  - `id`, `upgradedId`, `upgradeChoiceSpellId`, `name`, `category`, `unlockOrder`, `unique` ;
  - `levels.normal` et `levels.upgraded` : conditions de lancer, `effects[]` et `critEffects[]` normalisés (effets réels ou d'affichage, masques décodés, zone avec nombre de cases, sous-sorts déroulés récursivement), `expectedDamage`, et `simModel` (étapes d'exécution simplifiées pour le moteur) ;
  - `upgrade`, `effects` et `critEffects` (alias de la version normale), `realEffectsSummary`, `pics`, `notes`, `dpln` (texte, table d'amélioration, relevé d'infobulle, URL des captures), `sources`.
- `subSpells` : 30689, 30693, 30419, 30421, 30568, 30420, 30625, 30676, 30677 et 30719.
- `summons` : 7985 et 7986.
- `states`.
- `pushDamage` : formule et table.
- `workedExamples` : exemple du tour 1, vague 1.
- `discrepancies[]`.

Les captures DPLN consultées sont stockées hors dépôt, dans le scratchpad `dpln_img/`.
