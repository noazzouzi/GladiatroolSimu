# 1x — Archétype DOMPTEUR (« Gladiateur » en interne) : fiche complète pour le simulateur

> Agent « ARCHÉTYPE DOMPTEUR ». Rédigé le 2026-09-28.
>
> **Livrables**
> - Données machine : `research/data/archetype_dompteur.json` (15 sorts, versions normale et améliorée, effets décodés dans l'ordre, sous-sorts, acclamations, dégâts attendus, écarts, paramètres du simulateur).
> - Script de génération, reproductible, stdlib seule : `tools/archetypes/build_archetype_dompteur.py` (`--md` imprime les tableaux de cette note).
>
> **Étiquettes**
> - **FAIT vérifié** : donnée du client DOFUS 3 (DofusDB) ou code du client (portage `tools/mechanics`).
> - **FAIT rapporté** : guide DPLN ou vidéo.
> - **FAIT observé** : valeur chiffrée relevée sur une image de VOD et recalculée exactement.
> - **HYPOTHÈSE** : déduction non vérifiée.
>
> Confiance : **haute** / **moyenne** / **basse**.
>
> **Sources principales**
> - Sorts : `https://api.dofusdb.fr/spells/<id>`, niveaux : `https://api.dofusdb.fr/spell-levels/<id>` (extraction `research/raw/dofusdb/`).
> - Guide DPLN : <https://www.dofuspourlesnoobs.com/gladiatrool.html> (maj 21/05/2026) et ses captures d'infobulles `…/uploads/1/3/0/1/13010384/ark26gladia{9,21,10,100,13,23,16,17,102,106,19,20,103,104,14,18,116,12,24,99,101}_orig.png`, regardées une à une.
> - Vidéos : note `60_videos.md`, et VOD Twitch <https://www.twitch.tv/videos/2852548819> (images 1080p/480p extraites par l'agent carte ; relevés §12).
> - Formules : note `70_formules_dofus.md`, `research/data/effects_semantics.json`.

---

## 0. Résumé (à lire en premier)

| # | Point clé | Statut | Confiance |
|---|---|---|---|
| 1 | Le Dompteur est le **damage dealer**. Il possède 8 sorts de base : Frappe Repoussoir (commun) + Impact au départ, puis Grondement Grandissant → Prélèvement → Détonation → Coup de Sang → Jaillissement → Ombre Fracassante, débloqués un par objectif réussi (Spell Manager 30626, niv. 1 à 6). | FAIT vérifié + DPLN concordant | haute |
| 2 | **Multiplicateur de dégâts ×61** (Force 6000, Puissance 0). Le passif 30639 prévoit **+3000 Puissance** pour l'état Dompteur (×91), mais il n'est **pas appliqué**. 4 relevés vidéo de dégâts du Dompteur sont exacts à ×61 (12 078 ; 12 688 ; 5 124 ; 5 185) et aucun n'est compatible avec ×91. Explication : le passif est lancé avant le choix d'archétype. | FAIT observé + FAIT vérifié | haute |
| 3 | Taux de critique **effectif de 40 %** (sort 30 % + 10 % de base) pour Frappe Repoussoir, Impact, Grondement, Prélèvement, Détonation et Relâchement. **0 %** pour Coup de Sang, Jaillissement, Ombre Fracassante, Pulsation Chaotique et Punition Collective. | FAIT vérifié | haute |
| 4 | **Vulnérable = ×2** sur **toutes** les frappes du Dompteur, y compris les dégâts non boostables (% PV, % érosion, renvois). Les dommages de poussée ne sont pas doublés. Le ×2 s'applique aussi dans le même sort juste après une poussée dans les pics. | FAIT vérifié + FAIT observé | haute |
| 5 | Impact : 4 148–4 514 (crit 5 002–5 429) au centre ; **8 296–9 028 (crit 10 004–10 858) sur Vulnérable**. DPLN « environ 4 500 » ✓. Un seul coup par cible : l'effet de masque `A` est une ligne d'infobulle. | FAIT vérifié | haute |
| 6 | Grondement Grandissant : 5 002–5 612 (crit 5 978–6 710). Relancé exactement 2 tours après, il reçoit +20 de base, soit **6 222–6 832 (crit 7 198–7 930)**. DPLN « environ 6 200 » correspond à la valeur boostée. **Version améliorée** : un effet 406 placé en tête retire ce +20 avant la frappe. | FAIT vérifié / HYPOTHÈSE (perte du bonus) | haute / moyenne |
| 7 | Détonation : **+5** dégâts de base par ennemi présent dans la zone (sous-sort 30417). L'infobulle affiche « +10 » (effet d'affichage). | FAIT vérifié | moyenne |
| 8 | Coup de Sang : **20 % des PV courants** du lanceur (6 000 à PV pleins, **12 000 sur Vulnérable**), non boostable, sans critique. Coût : −10 % des PV courants (malus soignable, qui n'alimente pas Jaillissement). | FAIT vérifié (données + code client) | haute |
| 9 | Sorts uniques. Relâchement de Fureur = **tueur de Mama**. À +100 et sur Mama Vulnérable : 35–37 k (crit 41–43 k), et 49–60 k avec +40 % de dommages finaux. Pulsation Chaotique et Punition Collective servent au nettoyage des vagues 9–10. Galvanisation donne +4 PA à toute l'équipe pendant 2 tours. | FAIT vérifié + vidéos | haute |
| 10 | Acclamations du Dompteur : +1 PA, +1 PM, **+10 % dommages finaux**, +1 PO, +500 dommages critiques, +20 % critique. Tous permanents et cumulables. À PA/PO égaux, les **dommages finaux** l'emportent tant que le critique reste bas. | FAIT vérifié | haute |
| 11 | Depuis les cases de départ (286/287/314/315), le premier pic est à **6 cases**. Impact porte à 5 + rayon 2 : le Dompteur doit donc avancer de 1 à 2 cases, ou gagner de la PO, pour frapper en plein un Trooll dans les pics. | FAIT vérifié (carte 139988488) | haute |
| 12 | Anomalies relevées : Amélioration : Jaillissement pointe vers un niveau inexistant (80750). Prélèvement amélioré applique une érosion **permanente** non annoncée. Coup de Sang, Jaillissement et Ombre Fracassante améliorés gagnent une **dégressivité** non annoncée. La capture de Malédiction Collatérale affiche 100 % alors que les données disent 50 %. Voir le §11. | FAIT vérifié | haute |

---

## 1. Méthode

1. **Données du client** : lecture de chaque niveau de sort dans `research/raw/dofusdb/spell_levels.json`. Pour chaque niveau, on relève :
   - le coût, la portée, la ligne de vue, les limites de lancer, le critique ;
   - les effets **dans l'ordre**, avec leurs drapeaux `forClientOnly` et `visibleInTooltip` ;
   - les masques, déclencheurs, durées, délais et zones ;
   - les sous-sorts exécutés, déroulés récursivement.

   Le champ `forClientOnly` est essentiel : plusieurs lignes d'infobulle, par exemple le « +10 » de Détonation, **ne sont pas exécutées** par le serveur.
2. **Formules** :
   - dégâts : `tools/mechanics/damage.py`, portage de `DamageSender`/`DamageReceiver` du client ;
   - zones et dégressivité : `tools/mechanics/zones.py` ;
   - vérification ponctuelle dans le code décompilé du client 2.73 (scratchpad, non versionné) : `removeBuffBySpellId` (effet 406), `getBaseDamageHealContextSpellMod` (effet 293), `StatBuff` (effets 1048 « lifePointsMalus » et 111 PA).
3. **Recoupement** :
   - texte et captures DPLN ;
   - vidéos (note 60) ;
   - **relevés de dégâts** sur la VOD Twitch 2852548819, lus sur les images et recalculés à l'unité près (§12).

---

## 2. Identité de l'archétype

| Élément | Valeur | Source | Statut |
|---|---|---|---|
| Nom affiché / interne | Dompteur / « Gladiateur » (adminName des sorts uniques « Gladiateur Unique n », en-tête d'infobulle 30641 « Gladiateur : ») | `/spells/30602`, `/spells/30641` | FAIT vérifié |
| Choix | Fenêtre « Choisis ton Archétype » → « Devenir Dompteur — Impact » (capture DPLN `ark26gladia1`). Le sort 30608 « Choix d'Archétype » (effet 3008, choix 16) déclenche 30644 « Dompteur [Passif] » : animation 30739, **état 5899 « Dompteur » permanent**, apparences 2740–2743. | `/spells/30608`, `/spell-levels/80911` | FAIT vérifié |
| Types de sorts | 3889 sorts, 3901 améliorés, 3841 choix d'amélioration, 3873 uniques, 3869/3866 acclamations, 3844 déclenchés, 3885 choix initial | `/spell-types` | FAIT vérifié |
| Corps de combat | Monstre 7980 « Gladiatroolleur » (niv. 200, 30 000 PV, 8 PA, 4 PM, Force 6000, sort 30416). Sort de départ : passif 30639 (état 5970 : ne tacle pas et n'est pas taclé ; tours de 60 s ; passif 30700 « Vulnérable à la sortie des pics »). | `/monsters/7980`, `/spell-levels/80897` | FAIT vérifié (identification joueur = 7980 : HYPOTHÈSE forte) |

### Caractéristiques de base (simulateur)

| PV | PA | PM | PO | Force | Puissance | Do. poussée | Critique | Do. crit. | Dommages finaux | Érosion | Niveau |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 30 000 | 8 | 4 | 0 | 6 000 | **0** | 1 000 | 10 % | 0 | 100 % | 10 % | 200 |

Sources : DPLN (30 000 PV, 8 PA, 4 PM, 6 000 Force, 1 000 Do Pou, 10 % crit), `/monsters/7980`, vidéo Barbe Douce 00:04. Les tooltips joueurs de la VOD affichent 30 000 / 30 000 PV (« Snneakkyy »).

**La question des +3000 Puissance** (passif 30639, effet 138, masque `C,*E5899`) :

- *Donnée* : un Dompteur **devrait** avoir +3000 Puissance, soit un multiplicateur de 91 au lieu de 61.
- *Observation* : les 4 frappes du Dompteur relevées dans la VOD tombent exactement sur un jet × 61. Aucune n'est reproductible à ×91 (§12). L'aperçu d'infobulle d'un Acrobate (3 239–3 458) est lui aussi à ×61. DPLN : « Impact environ 4 500 » = 68–74 × 61.
- *Explication* : 30639 est le **sort de départ** du monstre 7980. Il est donc lancé au début du combat, avant que 30644 ne pose l'état 5899. Le critère `*E5899`, évalué sur le lanceur à ce moment-là, échoue.
- *Conclusion* : **Puissance 0** (FAIT observé, confiance haute). Le JSON garde l'option `power: 3000` pour les tests.

---

## 3. Modèle de dégâts appliqué au Dompteur

1. **Dégâts à jet (100 dommages, 95 vol)** :
   - `d = int((jet + bonus_base) × 61)` ;
   - puis `+ Dommages critiques` si l'effet est critique ;
   - puis `int(d × coefZone)` ;
   - puis `× dommages_finaux/100` ;
   - puis `× 2` si la cible est Vulnérable (1163 ×200 %, déclencheur `D`).

   Chaque multiplication est tronquée. Les Troolls ont 0 résistance.
2. **Non boostables** (89 % PV du lanceur, 1118 % PV érodés du lanceur, 1092 % PV érodés de la cible, 1223 renvoi) : ni Force, ni Puissance, ni dommages finaux, ni critique. La dégressivité s'applique si la zone en a une. **Vulnérable ×2 s'applique.**
3. **Dégressivité** : −10 % par case, au plus 4 paliers. La distance dépend de la forme :
   - Manhattan pour C (cercle) et X (croix) ;
   - Chebyshev pour G (carré) et R (rectangle) ;
   - projection sur l'axe du lancer pour F (fourche).

   Les versions normales de Coup de Sang, Jaillissement et Ombre Fracassante ont 0 %×0 : **aucune** dégressivité.
4. **Critique** : le taux effectif vaut taux du sort + stat Critique (10 % de base, +20 % par Acclamation chanceuse, +30 %/+50 % par Amplification). Le critique remplace la liste d'effets par la liste `criticalEffect` (autres jets, parfois une autre zone : Prélèvement).
5. **Bonus de base (effet 293)** : il s'additionne au jet **avant** ×61. Il n'est compté que si le buff vise l'id du sort en cours (`getBaseDamageHealContextSpellMod`, client).
6. **Durées** : une durée *n* = *n* tours **du lanceur du buff** (décompte au début de son tour). `delay` = nombre de ses tours avant activation.

---

## 4. Tableau récapitulatif des sorts classiques

Légende :
- **Ligne** : lancer en ligne obligatoire ;
- **LdV** : ligne de vue requise ;
- **/t** : lancers par tour ;
- **/c** : lancers par cible ;
- **Int.** : intervalle de relance ;
- **Crit** : taux du sort (+10 % effectif) ;
- **Z** : zone (cases).

Toutes les portées sont modifiables, sauf mention.

| # | Sort (id → amélioré) | PA | PO | Ligne | LdV | /t | /c | Int. | Crit | Zone normal → amélioré | Effets réels (ordre) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Frappe Repoussoir 30416 (commun, sans amélioration) | 3 | 1–6 | non | oui | 2 | — | 0 | 30 % | P | poussée 2 (a,A) → 16–20 (crit 21–25) |
| 1 | Impact 30395 → 30558 | 4 | 1–5 | non | oui | 2 → **3** | — | 0 | 30 % | C2 (13) → **C3 (25)** | 68–74 (crit 82–89) |
| 2 | Grondement Grandissant 30396 → 30560 | 4 | 1–6 | non | oui | — | — | 2 | 30 % | X1 (5) → **X3 (13)** | 82–92 (crit 98–110) ; buff +20 de base (délai 2, durée 1) ; [amélioré : 406 en tête] |
| 3 | Prélèvement 30397 → 30561 | 3 | 1–6 | non | **non** | 3 → **4** | 2 → **3** | 0 | 30 % | P ; crit C2 → **crit C3** | érosion +15 % 2 t, cumul 3 → **+20 % permanente, cumul ∞** ; vol 42–50 (crit 50–60) |
| 4 | Détonation 30398 → 30562 | 4 | 1–6 | **oui** | oui | 1 | — | 0 | 30 % | R1,1 (3×2 = 6) → **R2,1 (5×2 = 10)** | +5 de base par cible (30417/30691) → 38–42 (crit 46–50) |
| 5 | Coup de Sang 30399 → 30563 | 4 | 1–5 | non | oui | — | — | 2 | 0 % | C2 (13, sans dégr.) → **C3 (25, dégr. 10 %)** | 20 % PV courants du lanceur → −10 % PV courants (lanceur) |
| 6 | Jaillissement 30400 → 30564 | 5 | 1–5 | non | oui | — | — | 3 | 0 % | G1 (9, sans dégr.) → **G2 (25, dégr. 10 %)** | 40 % PV érodés du lanceur |
| 7 | Ombre Fracassante 30401 → 30565 | 2 | 1–5 | **oui** | oui | — | — | 1 | 0 % | F2 (10, sans dégr.) → **F3 (13, dégr. 10 %)** | 30 % PV érodés de la cible |

Aucun sort classique n'exige une case libre ou occupée, ni n'a de relance initiale ou globale. Tous touchent les ennemis (`A`) et les invocations alliées (`j`), jamais les alliés joueurs. Seule exception : la poussée de Frappe Repoussoir (masque `a,A`).

Sources :
- niveaux normaux `/spell-levels/80499`, `80500`–`80506` ;
- niveaux améliorés `80748`, `80751`, `80754`, `80756`, `80758`, `80760`, `80762` ;
- choix d'amélioration `/spells/30469`, `30471`–`30476` ;
- déblocage `/spells/30626`.

### Mécanique des améliorations

Chaque carte « Amélioration : X » (30469, 30471–30476) fait quatre choses :
1. pose l'état permanent « boostedSpell dompteurN » (5996–6002), sans doute pour ne plus proposer la même amélioration ;
2. affiche le tooltip 30470 ;
3. **désapprend** le niveau normal (3406) ;
4. **apprend** le niveau amélioré (3405).

Conséquence (DPLN, FAIT rapporté) : l'intervalle de relance repart à zéro, car c'est un nouveau sort. Bug connu en 2024 (Koza) : le sort amélioré restait grisé jusqu'au tour suivant.

**Anomalie** : 30475 « Amélioration : Jaillissement » apprend le niveau **80750**, qui **n'existe pas** (404 DofusDB). Le sort amélioré 30564 utilise en réalité le niveau 80760.

---

## 5. Fiches détaillées des sorts classiques

Les tableaux donnent les dégâts **finaux par cible** avec les stats de base (×61, 40 % de critique). « E » est l'espérance, critique compris. « Vuln. » désigne une cible Vulnérable (×2). La distance est mesurée depuis la case ciblée.

### 5.0 Frappe Repoussoir (30416) — commun

- **Effets réels** :
  1. `5` repousse de 2 cases (masque `a,A` : alliés ou ennemis) ;
  2. `100` 16–20 neutre (crit 21–25), masque `j,A`.
- **Dégâts** :
  - normal 976–1 220, crit 1 281–1 525, E ≈ 1 220 ;
  - Vulnérable 1 952–2 440, crit 2 562–3 050 ;
  - DPLN « 1 200 » ✓.
- **Collision** : 283 par case de poussée restante si la cible est bloquée (obstacle ou entité) ; non doublée par Vulnérable.
- **Pics** : le seul outil de placement du Dompteur. Un Trooll collé aux pics est poussé dedans : +2000, puis la frappe qui suit est déjà ×2 (voir le relevé Acrobate 9 904 = 2 000 + 2 × 3 952, §12).

### 5.1 Impact (30395 → 30558) — sort de départ

- **Effets** : deux effets `100` 68–74. Le premier (masque `A`) est **forClientOnly** et sert à l'infobulle. Le second (masque `A,j`) est le vrai : **un seul coup par cible**. En critique : 82–89, masque `A,J` (J majuscule, coquille probable). La version améliorée est en `A,j`.
- **Conditions** : case ciblée libre possible, LdV, PO 1–5 modifiable.
- **Amélioré** : C3 et 3 lancers par tour (DPLN ✓).

| dist. | coef | normal | crit | E | Vuln. normal | Vuln. crit | E Vuln. |
|---|---|---|---|---|---|---|---|
| 0 | 1,0 | 4 148–4 514 | 5 002–5 429 | 4 685 | 8 296–9 028 | 10 004–10 858 | 9 370 |
| 1 | 0,9 | 3 733–4 062 | 4 501–4 886 | 4 216 | 7 466–8 124 | 9 002–9 772 | 8 432 |
| 2 | 0,8 | 3 318–3 611 | 4 001–4 343 | 3 747 | 6 636–7 222 | 8 002–8 686 | 7 495 |
| 3 (amélioré) | 0,7 | 2 903–3 159 | 3 501–3 800 | 3 279 | 5 806–6 318 | 7 002–7 600 | 6 558 |

**Recoupements** :
- DPLN « environ 4 500 » ✓ (maximum hors critique).
- Capture : 30 % de critique, soit la valeur du sort (capture prise hors combat).
- Huz (bêta) : « −8000 en zone », « des fois 10 000, là 7 000 » : compatible avec la ligne Vulnérable et la dégressivité.

### 5.2 Grondement Grandissant (30396 → 30560) — objectif 1

**Effets réels, version normale** :
1. `100` 82–92, croix X1 ;
2. `3793` : script visuel au début de tour (délai 2) ;
3. `293` **+20 dégâts de base** à 30396, masque `C`, **délai 2, durée 1**.

Le bonus s'active donc au début du 2e tour qui suit le lancer, et il dure ce tour-là. C'est exactement le tour où l'intervalle (2) autorise à relancer. En critique : 98–110, avec le même buff.

**Version améliorée (30560)** :
1. **`406` (retire au lanceur les buffs du sort 30560)** ;
2. 82–92 en croix X3 ;
3. +20 (délai 2) ;
4. visuel.

D'après le code client (`removeBuffBySpellId` : retrait sans condition), la relance à T+2 **efface le +20 avant de frapper**. Il est donc probable que la version améliorée ne profite jamais du bonus (HYPOTHÈSE, confiance moyenne). Paramètre du simulateur : `ggUpgradedKeepsRecastBonus` (défaut `false`).

| dist. | coef | normal | crit | E | Vuln. normal | Vuln. crit | E Vuln. |
|---|---|---|---|---|---|---|---|
| 0 | 1,0 | 5 002–5 612 | 5 978–6 710 | 5 722 | 10 004–11 224 | 11 956–13 420 | 11 444 |
| 1 | 0,9 | 4 501–5 050 | 5 380–6 039 | 5 149 | 9 002–10 100 | 10 760–12 078 | 10 298 |
| 2 (amél.) | 0,8 | 4 001–4 489 | 4 782–5 368 | 4 577 | 8 002–8 978 | 9 564–10 736 | 9 154 |
| 3 (amél.) | 0,7 | 3 501–3 928 | 4 184–4 697 | 4 005 | 7 002–7 856 | 8 368–9 394 | 8 010 |
| **+20**, centre | 1,0 | **6 222–6 832** | **7 198–7 930** | 6 942 | 12 444–13 664 | 14 396–15 860 | 13 884 |

**Recoupements** :
- DPLN « environ 6 200 » : c'est le minimum avec le bonus +20. Sans bonus, le maximum hors critique est 5 612.
- Capture : « Critique 40 % », soit 30 + 10 (infobulle en combat).
- **Relevés VOD** : 12 078 et 12 688 = critiques sur Trooll Vulnérable (jets 99 et 104, §12).

### 5.3 Prélèvement (30397 → 30561) — objectif 2

**Effets réels** :
1. `776` érosion +15 % pendant 2 tours, cumul maximal 3 (`maxStack` du niveau) ;
2. `95` vol de vie neutre 42–50.

**En critique**, les mêmes effets s'appliquent dans un cercle **C2** : érosion 15 % et vol de vie 50–60.

**Conditions** :
- **pas de LdV**, case vide autorisée, PO 1–6 ;
- 3 lancers par tour, 2 par cible ;
- 3 PA.

**Dégâts** :
- cible seule : 2 562–3 050 (crit 3 050–3 660), E ≈ 3 026 ; Vulnérable 5 124–6 100 (crit 6 100–7 320) ;
- zone critique : 3 050–3 660 au centre, 2 745–3 294 à 1 case, 2 440–2 928 à 2 cases (×2 sur Vulnérable).

**Soin du lanceur** : 50 % des PV réellement retirés, soit 1 281–1 525 par coup (2 562–3 050 sur Vulnérable). C'est le seul soin propre du Dompteur (Khytrayer 11:21).

**Érosion** : stat 75 de la cible (10 % de base). Avec 3 cumuls : 10 + 45 = 55, ramené au **plafond de 50 %** de la formule. La moitié des PV perdus par la cible devient alors des PV max perdus, ce qui nourrit Ombre Fracassante.

**Version améliorée (30561)**, les changements non annoncés en gras :
- érosion 20 %, **durée −1 (permanente)** et **cumul illimité** ;
- 4 lancers par tour, **3 par cible** ;
- critique en C3.

**Recoupements** :
- DPLN table : « Érosion 15 % > 20 % ; cercle critique 2 > 3 ; lancers/tour 3 > 4 » ✓ (permanence et lancers par cible omis).
- Capture : Critique 40 % ; limitation 2 par tour et par cible ; cumul 3 ✓.
- Vidéos : « si sort critique, frappe en zone de 2 », « amélioré → zone de 3 » (Khytrayer 06:32) ✓. « Lancé sans cible et sans critique : pas de dégâts » (09:44) ✓.

### 5.4 Détonation (30398 → 30562) — objectif 3

**Effets réels** :
1. `1160` : le lanceur exécute 30417 sur **chaque** cible (ennemis et invocations alliées) du rectangle. 30417 donne +5 dégâts de base à 30398 pour 1 tour ;
2. [`293` +10 : **forClientOnly**, infobulle] ;
3. `100` 38–42 (crit 46–50) sur la zone ;
4. `406` retire les buffs du sort **30398**.

Pour la version normale, ce 406 ne cible pas 30417 et n'a donc pas d'effet utile. Les +5 expirent au tour suivant du lanceur.

La version améliorée (30562) utilise 30691 et un 406 qui vise 30691.

**Conditions** : lancer **en ligne**, LdV, 1 par tour.

**Zone** : R1,1 = rectangle de 3 cases de large (perpendiculaire à l'axe) sur 2 de profondeur (case ciblée + 1 derrière). Amélioré : R2,1, soit 5×2. La dégressivité (Chebyshev) donne 100 % sur la case ciblée seulement, 90 % sur les autres cases, 80 % aux extrémités du 5×2.

| ennemis dans la zone | bonus | normal | crit | E | Vuln. normal | Vuln. crit | E Vuln. |
|---|---|---|---|---|---|---|---|
| 1 | +5 | 2 623–2 867 | 3 111–3 355 | 2 940 | 5 246–5 734 | 6 222–6 710 | 5 880 |
| 2 | +10 | 2 928–3 172 | 3 416–3 660 | 3 245 | 5 856–6 344 | 6 832–7 320 | 6 490 |
| 3 | +15 | 3 233–3 477 | 3 721–3 965 | 3 550 | 6 466–6 954 | 7 442–7 930 | 7 100 |
| 4 | +20 | 3 538–3 782 | 4 026–4 270 | 3 855 | 7 076–7 564 | 8 052–8 540 | 7 710 |
| 6 (max normal) | +30 | 4 148–4 392 | 4 636–4 880 | 4 465 | 8 296–8 784 | 9 272–9 760 | 8 930 |
| 10 (max amélioré) | +50 | 5 368–5 612 | 5 856–6 100 | 5 685 | 10 736–11 224 | 11 712–12 200 | 11 370 |

Valeurs pour la case ciblée ; ×0,9 ailleurs.

**Recoupements** : DPLN « plus il y a de monstres, plus le sort frappe fort » ✓. La capture « +10 dégâts de base » est **l'effet d'affichage**. Le serveur exécute +5 par cible. La capture montre aussi « Critique 70 % », soit 30 + 10 + 30 d'Amplification.

### 5.5 Coup de Sang (30399 → 30563) — objectif 4

**Effets réels** :
1. `89` dommages neutres = **20 % des PV courants du lanceur**, cercle C2, **sans dégressivité** (0 %×0) ;
2. `1048` « −10 % PV » sur le lanceur, durée −1.

Dans le client, 1048 est un buff **« lifePointsMalus »** qui ne baisse que les **PV courants** (StatBuff). Il ne passe pas par le bouclier (faux dommage), il n'est **pas** doublé par Vulnérable (`canTriggerOnDamage` faux), et les PV perdus restent **soignables**. Il ne diminue pas les PV max : il **n'alimente pas** Jaillissement, sauf peut-être 10 % d'érosion (HYPOTHÈSE).

**Conditions** : 0 % de critique, non boostable (ni Force, ni dommages finaux), 4 PA, intervalle 2.

| PV du lanceur | par cible | Vulnérable | coût (PV courants) |
|---|---|---|---|
| 30 000 | 6 000 | **12 000** | 3 000 |
| 25 000 | 5 000 | 10 000 | 2 500 |
| 20 000 | 4 000 | 8 000 | 2 000 |
| 15 000 | 3 000 | 6 000 | 1 500 |
| 10 000 | 2 000 | 4 000 | 1 000 |

**Version améliorée (30563)** : zone C3, mais avec une **dégressivité 10 %×4** ajoutée. À 30 000 PV : 6 000 au centre, puis 5 400 / 4 800 / 4 200 sur les anneaux 1 à 3.

DPLN « 20 % des PV du lanceur … perdre 10 % de PV » ✓. Capture : « Dommages : 20 % des PV de l'attaquant ; PV (∞) −10 % » ✓.

### 5.6 Jaillissement (30400 → 30564) — objectif 5

**Effet** : `1118` = **40 % des PV érodés du lanceur**, carré G1 (9 cases) sans dégressivité, non boostable. 5 PA, intervalle 3.

Les PV érodés du Dompteur valent environ 10 % des PV qu'il a perdus depuis le début du combat (érosion de base). Exemple : 50 000 PV perdus donnent 5 000 érodés, soit **2 000 par cible (4 000 Vulnérable)**. C'est faible. Rappel : Coup de Sang ne l'alimente pas.

| PV érodés du lanceur | 1 000 | 3 000 | 5 000 | 8 000 | 12 000 |
|---|---|---|---|---|---|
| dégâts (Vuln.) | 400 (800) | 1 200 (2 400) | 2 000 (4 000) | 3 200 (6 400) | 4 800 (9 600) |

Amélioré : G2 (25 cases) avec une dégressivité 10 % (Chebyshev). La référence de l'amélioration est cassée (80750).

### 5.7 Ombre Fracassante (30401 → 30565) — objectif 6

**Effet** : `1092` = **30 % des PV érodés de chaque cible**. Fourche F2 (10 cases, 3 dents divergentes sur 3 pas dans l'axe du lancer), sans dégressivité, non boostable.

**Conditions** : **en ligne**, 2 PA, intervalle 1.

| PV érodés de la cible | 2 500 | 5 000 | 10 000 | 20 000 | 50 000 |
|---|---|---|---|---|---|
| dégâts (Vuln.) | 750 (1 500) | 1 500 (3 000) | 3 000 (6 000) | 6 000 (12 000) | 15 000 (30 000) |

- **Trooll de 25 000 PV** érodé à 50 % par Prélèvement, et qui a déjà perdu 20 000 PV : 10 000 érodés, soit 3 000 (6 000 Vulnérable).
- **Mama (150 000 PV)** : après 100 000 PV perdus à 50 % d'érosion, 50 000 érodés, soit **15 000, et 30 000 dans les pics**. C'est le finisher du T8 (Huz 18:00 : « à lancer en tout dernier »).

« Taille de la fourche 4 > 5 cases » (DPLN et description) = F2 → F3. La taille affichée est la longueur de la case ciblée à la pointe (param + 2). La version améliorée (13 cases) ajoute une dégressivité 10 %.

---

## 6. Sorts uniques (usage unique, obtenus sur les Glyphes Évènementiels)

Six sorts « Gladiateur Unique » (type 3873), plus Pense Vite, commun aux trois archétypes (type 3872). Tous se désapprennent après usage (effet 3406). Ils n'ont **pas d'amélioration** (DPLN).

| Sort (id, niveau) | PA | PO | LdV | Crit | Cibles / zone | Effets réels (ordre) | Valeurs (×61) |
|---|---|---|---|---|---|---|---|
| **Galvanisation** 30603 (80827) | 5 | 0 | — | 0 | alliés `a`, toute la carte | +4 PA (durée 2) → désapprend | +4 PA sur les 2 prochains tours de chaque allié |
| **Immortalité du Berserker** 30614 (80842) | 5 | 0 | — | 0 | lanceur ; cumul max 1 | 30627 : seuil 1 PV (1 t) + déclencheur « tue » → 30628 → au début du tour suivant, ré-exécute 30627 ; état Endolori (5967) permanent | le lanceur ne descend pas sous 1 PV jusqu'à son prochain tour ; renouvelé s'il a tué |
| **Malédiction Collatérale** 30613 (80841) | 5 | 0 | — | 0 | ennemis (hors Mama pré-combat), toute la carte | buff 1 tour : sur `D` (dommages hors poussée) et `XD` (mort), le porteur exécute 30670 → 1223 **50 % des dommages finaux subis** sur ses alliés en C2 (sans dégressivité) ; état 5979 1 tour | renvoi = 50 % du coup reçu (×2 si le voisin est Vulnérable) |
| **Relâchement de Fureur** 30611 (80839) | 5 | 1–63 (fixe) | non | 30 % | 1 ennemi | 187–202 (crit 237–252) ; [+25 : affichage] ; la montée vient de 30624 : +25 de base à **4 débuts de tour** | voir tableau |
| **Pulsation Chaotique** 30612 (80840) | 5 | 1–63 (fixe) | non | 0 | ennemi ciblé puis rebonds | chaîne 30667 : Marqué → désigne l'ennemi non marqué **le plus proche** → 35–42 → +20 de base au sous-sort → rebond ; fin : retire les +20 | k-ième cible : (35–42 + 20(k−1)) ×61 |
| **Punition Collective** 30602 (80826) | 5 | 0 | — | 0 | tous les ennemis (hors Mama pré-combat), sans dégressivité | 94–106 → désapprend | 5 734–6 466 ; **11 468–12 932** Vulnérable |
| **Pense Vite** 30615 (80843), commun | 5 | 0 | — | 0 | lanceur | durée du prochain tour **10 s** ; +999 PA (délai 1, durée 1) ; fin du tour suivant : retrait | limites de lancers inchangées ; environ 3 sorts utiles |

### Relâchement de Fureur : valeur selon le nombre de tours détenus

| tours détenus | bonus | normal | crit | E (40 %) | Vuln. normal | Vuln. crit | E Vuln. |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 11 407–12 322 | 14 457–15 372 | 13 085 | 22 814–24 644 | 28 914–30 744 | 26 169 |
| 2 | +50 | 14 457–15 372 | 17 507–18 422 | 16 135 | 28 914–30 744 | 35 014–36 844 | 32 269 |
| **4 (max)** | **+100** | 17 507–18 422 | 20 557–21 472 | 19 185 | **35 014–36 844** | **41 114–42 944** | 38 369 |

Sur **Mama Vulnérable à +100** selon les dommages finaux :

| Dommages finaux | normal | crit |
|---|---|---|
| 100 % | 35 014–36 844 | 41 114–42 944 |
| 120 % | 42 016–44 212 | 49 336–51 532 |
| 140 % | 49 018–51 580 | 57 558–60 120 |
| 160 % | 56 022–58 950 | 65 782–68 710 |

Il faut ajouter +1 000 par Acclamation critique en cas de critique sur Vulnérable. Avec deux Dompteurs, deux Relâchements font environ 100 à 120 k, en cohérence avec les vidéos : « plus de la moitié de ses PV » (cardxc), « plus de 100 000 » (Zephiron), « avec un seul, pas tuée » (Khytrayer).

**Montée en puissance** : 30624 niv. 1 porte un déclencheur `TB` avec `triggerDuration` 4 et exécute le niv. 2 (+25 de base, durée −1). Aucun sort des données ne lance 30624 : il est posé par le serveur quand le sort est obtenu (HYPOTHÈSE forte). Pour atteindre +100 au T8, il faut l'obtenir au plus tard au T4.

### Pulsation Chaotique : dégâts de la k-ième cible et cumul

| k | bonus | normal | Vuln. | cumul moyen | cumul moyen Vuln. |
|---|---|---|---|---|---|
| 1 | 0 | 2 135–2 562 | 4 270–5 124 | 2 349 | 4 697 |
| 2 | +20 | 3 355–3 782 | 6 710–7 564 | 5 917 | 11 834 |
| 3 | +40 | 4 575–5 002 | 9 150–10 004 | 10 706 | 21 411 |
| 4 | +60 | 5 795–6 222 | 11 590–12 444 | 16 714 | 33 428 |
| 6 | +100 | 8 235–8 662 | 16 470–17 324 | 32 391 | 64 782 |
| 8 | +140 | 10 675–11 102 | 21 350–22 204 | 52 948 | 105 896 |
| 10 | +180 | 13 115–13 542 | 26 230–27 084 | 78 385 | 156 770 |

**Déroulé exact (données)** :
- 30612 retire « Marqué » et « Target » à tous les ennemis, puis **le lanceur** exécute 30667 niv. 1 sur l'ennemi ciblé. Le sort n'a pas d'effet sur une case vide.
- 30667 niv. 1 :
  1. pose Marqué (1 tour) ;
  2. **la cible** exécute le niv. 2. Avec `2792`, limite 1 et masque `g,e5916`, cela revient à désigner **l'allié non marqué le plus proche** de la cible, qui reçoit l'état « Target » ;
  3. inflige les dégâts ;
  4. donne +20 de base à 30667 pour le lanceur ;
  5. par le niv. 5 (`2160`, limite 1), le lanceur relance le niv. 1 sur l'ennemi « Target ».

  La chaîne s'arrête quand aucun ennemi non marqué ne reste.

HYPOTHÈSE : les rebonds ignorent la PO (1–5) et la LdV du sous-sort, parce qu'il est exécuté et non lancé. Khytrayer : « comme Punition mais un peu moins de dégâts… plus il y a d'ennemis, plus ça tape » ✓. En total moyen (sans Vulnérable), Punition fait 6 100 × n ; Pulsation ne la dépasse qu'à partir de **8 cibles** (7 : quasi égalité, 42 060 contre 42 700).

### Malédiction Collatérale : points de modélisation

- **Déclencheur `D`** : les 2 000 d'entrée dans les pics et les 1 000 ×2 du début de tour déclenchent aussi le renvoi.
- **Durée 1** : du lancer jusqu'au prochain tour du lanceur. Tous les coéquipiers qui jouent après lui en profitent, ainsi que ceux qui jouent avant lui au tour global suivant, en particulier l'Acrobate et ses mises en pics.
- **Chaîne (HYPOTHÈSE, moyenne)** : un renvoi est un dommage, il déclenche le buff des Troolls touchés. L'anti-boucle du client (`isTriggeredByParent`) empêche seulement un buff de se redéclencher sur ses propres effets. Dans un paquet de Troolls **tous Vulnérables**, A frappé pour X renvoie 0,5X à B, qui subit 0,5X × 2 = X et renvoie à son tour… Chaque voisin encaisse alors **l'équivalent du coup initial**. Paramètre du simulateur : `malédictionCollatéraleChains`.
- **Masque `a` de 30670** : dans le client, il inclut le porteur. La description dit « sur leurs alliés ». Par défaut, le simulateur n'inflige pas de renvoi au porteur (`malédictionCollatéraleHitsCarrier=false`, confiance basse).
- La capture DPLN affiche « Renvoie 100 % des dommages subis ». Les données et la description disent **50 %**.

### Galvanisation, Immortalité, Pense Vite : points de modélisation

- **Galvanisation** : les PA d'un buff 111 sont crédités **immédiatement** (StatBuff client : `actionPointsCurrent += delta`). La durée 2 se décompte au début des tours du lanceur :
  - le lanceur en profite pour la fin de son tour T (net −1 PA) et au tour T+1 ;
  - les alliés qui jouent **après** lui en profitent aux tours T et T+1 ;
  - les alliés qui jouent **avant** lui en profitent aux tours T+1 et T+2.

  Cumulable : Koza a atteint 22 PA avec trois Galvanisations. DPLN « 4 PA pour deux tours à tous » ✓.
- **Immortalité du Berserker** : DPLN ✓, capture « Seuil : PV (1 tour), cumul max 1 » ✓. L'état « Endolori » (5967) est posé aussi par les Immortalités de l'Acrobate (30616) et du Magicien (30620). Son rôle n'est pas documenté ; HYPOTHÈSE : il empêche de proposer une seconde Immortalité.
- **Pense Vite** : 15 s selon DPLN (texte et capture), 10 s dans les données actuelles et chez Khytrayer (3.6), ce qui suggère un rééquilibrage. Les vidéos parlent de 2 à 3 sorts effectifs à cause des animations. Paramètre `penseViteMaxCasts=3`.

---

## 7. Bonus « Acclamations de la foule » du Dompteur

Mécanisme : à chaque début de tour global, **3 des 6** acclamations sont proposées (combat en pause, choix permanent et cumulable). Le sort de choix porte une ligne d'affichage (forClientOnly) et exécute (792) le niveau voulu de **30589** « Acclamations de la foule [Dompteur] », qui contient les effets réels, de durée −1. Le tirage des 3 propositions se fait côté serveur.

| Carte (sort de choix) | Effet réel (30589 niv., spell-level) | Valeur | DPLN |
|---|---|---|---|
| Acclamation accélérante (30592) | niv. 1 (80807) : `111` PA | **+1 PA** | 1 PA ✓ |
| Acclamation agile (30593) | niv. 2 (80808) : `128` PM | **+1 PM** | 1 PM ✓ |
| Acclamation puissante (30594) | niv. 3 (80809) : `1171` dommages finaux | **+10 %** | 10 % Dommages finaux ✓ |
| Acclamation optique (30632) | niv. 4 (80877) : `117` portée | **+1 PO** | 1 Portée ✓ |
| Acclamation critique (30633) | niv. 5 (80878) : `418` dommages critiques | **+500** | 500 Dommages critiques ✓ |
| Acclamation chanceuse (30634) | niv. 6 (80879) : `115` critique | **+20 %** | 20 % Critique ✓ |

Les autres acclamations appartiennent aux autres archétypes. Acrobate (types 3870/3867, sort 30590) : robuste +10 % résistances, repoussante +200 dommages de poussée, résistante +10 % résistance mêlée. Magicien (3871/3868, 30591) : vitalesque +5 000 Vitalité, soignante +20 % soins finaux, résistante +15 % résistance distance. Elles ne font pas partie du jeu de cartes du Dompteur (FAIT vérifié pour la classification ; le tirage serveur ne propose que les 6 cartes de l'archétype : HYPOTHÈSE forte, concordant avec DPLN).

### Valeur marginale

Espérance d'un Impact au centre sur une cible Vulnérable, calculée par le script :

| Configuration | E | gain |
|---|---|---|
| base (40 % crit) | 9 370 | — |
| +1 puissante (+10 % finaux) | 10 306 | **+936** |
| +1 critique (+500 Do crit) | 9 770 | +400 |
| +1 chanceuse (60 %) | 9 723 | +354 |
| Amplification (+20 % finaux, 70 % crit) | 11 879 | +2 510 |
| Amplification + puissante | 12 869 | +990 |
| Amplification + critique | 12 719 | +840 |
| Amplification + chanceuse (90 %) | 12 304 | +425 |

**Lecture** :
- Les **dommages finaux** dominent, car c'est un multiplicateur. Ils ne s'appliquent pas aux sorts non boostables (Coup de Sang, Jaillissement, Ombre Fracassante, renvois).
- Les dommages critiques rattrapent les dommages finaux quand le critique est élevé : +500 ×2 (Vulnérable) × p.
- Le critique plafonne à 100 %.
- PA et PO ne se mesurent pas en dégâts par coup. **+1 PA** fait passer 8 PA (Impact ×2) à 9 PA (Impact + Prélèvement + Ombre Fracassante, ou Impact ×2 + rien). **+2 PA** donnent 10 PA (Impact ×2 + OF, ou GG + Impact + OF, ou Impact + Prélèvement ×2). **+1 PO** évite 1 PM pour atteindre les pics (§10.1).
- Les vidéos priorisent **PA/PO** d'abord (Koza, Khytrayer, Zephiron), puis dommages finaux et critique. DPLN : « Dommages finaux, Critiques, Dommages Critiques ».

---

## 8. Sorts « Baroudeur / Gladiateur / Guérisseur » et « Acrobate / Dompteur / Magicien » (30640–30649)

| id | Nom | Type | Rôle | Statut |
|---|---|---|---|---|
| 30640 / **30641** / 30642 | « Baroudeur : » / **« Gladiateur : »** / « Guérisseur : » | 3880 « Tooltips Magicien » | En-têtes d'infobulle, effet 666 (aucun effet). Amplification (30411/30578) les exécute en forClientOnly pour afficher « Gladiateur : +20 % dommages finaux, +30 % critique » (amélioré : +40 % / +50 %, 3 tours). | FAIT vérifié |
| **30644** | « Dompteur » [Passif] | 3885 « Choix initial Dompteur » | Transforme le personnage : animation 30739, état 5899 permanent, 4 apparences. Les champs PA 4 / PO 1–5 du niveau 80911 sont sans objet : sort appliqué par le choix. | FAIT vérifié |
| 30648 / 30649 | Acrobate / Magicien [Passif] | 3884 / 3886 | Homologues (états 5900 / 5901) | FAIT vérifié |
| 30643, 30645–30647 | — | — | absents de DofusDB | FAIT vérifié |

---

## 9. Zones (repère MapPoint)

Dans le repère MapPoint, x va vers la droite (bas-droite à l'écran) et y vers le haut (haut-droite à l'écran). `O` = case ciblée 300, `@` = lanceur 257, à 3 cases sur l'axe x. Rendu : `tools/mechanics/zones.py`.

```
Impact C2 (13)              Impact amélioré C3 (25)
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . # . . . .
. . . . # . . . .           . . . # # # . . .
. . . # # # . . .           . . # # # # # . .
. @ # # O # # . .           . @ # # O # # # .
. . . # # # . . .           . . # # # # # . .
. . . . # . . . .           . . . # # # . . .
. . . . . . . . .           . . . . # . . . .
. . . . . . . . .           . . . . . . . . .

Grondement X1 (5)           Grondement amélioré X3 (13)
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . # . . . .
. . . . . . . . .           . . . . # . . . .
. . . . # . . . .           . . . . # . . . .
. @ . # O # . . .           . @ # # O # # # .
. . . . # . . . .           . . . . # . . . .
. . . . . . . . .           . . . . # . . . .
. . . . . . . . .           . . . . # . . . .
. . . . . . . . .           . . . . . . . . .

Détonation R1,1 (6)         Détonation améliorée R2,1 (10)
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . # # . . .
. . . . # # . . .           . . . . # # . . .
. @ . . O # . . .           . @ . . O # . . .
. . . . # # . . .           . . . . # # . . .
. . . . . . . . .           . . . . # # . . .
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . . . . . .

Jaillissement G1 (9)        Jaillissement amélioré G2 (25)
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . # # # # # . .
. . . # # # . . .           . . # # # # # . .
. @ . # O # . . .           . @ # # O # # . .
. . . # # # . . .           . . # # # # # . .
. . . . . . . . .           . . # # # # # . .
. . . . . . . . .           . . . . . . . . .
. . . . . . . . .           . . . . . . . . .

Ombre Fracassante F2 (10)   Ombre Fracassante améliorée F3 (13)
. . . . . . . . .           . . . . . . . . #
. . . . . . . # .           . . . . . . . # .
. . . . . . # . .           . . . . . . # . .
. . . . . # . . .           . . . . . # . . .
. @ . . O # # # .           . @ . . O # # # #
. . . . . # . . .           . . . . . # . . .
. . . . . . # . .           . . . . . . # . .
. . . . . . . # .           . . . . . . . # .
. . . . . . . . .           . . . . . . . . #
```

(Frappe Repoussoir, Prélèvement hors critique, Relâchement et Pulsation : case unique. Prélèvement critique : C2, puis C3 amélioré. Punition, Galvanisation, Malédiction : toute la carte.)

---

## 10. Analyse tactique

### 10.1 Rôle et géométrie

- **Rôle** : transformer les mises en pics de l'Acrobate en morts. Sans pics, rien ne tombe (cardxc 15:30 : « zéro dégâts comparé à ceux dans les pics »). Pour tuer un Troollibre (25 000 PV) mis dans les pics :
  - 2 000 (entrée) + le Videur de l'Acrobate (≈ 7 200–9 400 sur Vulnérable) + 2 Impacts moyens Vulnérables (≈ 18 700) suffisent largement ;
  - sans l'aide de l'Acrobate, 2 000 + GG boosté (≈ 13 900) + Impact (≈ 9 400) ≈ 25 300 : juste suffisant.
  - Un Trooll laissé à ≤ 2 000 PV dans les pics meurt au début de son tour.
- **Distance aux pics** :
  - depuis les cases de départ (286/287/314/315), le pic le plus proche est à **6 cases**, et à **7** depuis le centre 300 ;
  - Impact (PO 5 + rayon 2) touche un Trooll à 7 cases avec −20 % ;
  - Grondement (PO 6 + croix 1) et Prélèvement (PO 6, sans LdV) portent un peu plus loin ;
  - **+1 PO** vaut donc souvent 1 PM (Koza : « focus la PO »).
  - Cercle C2 centré sur une case de l'anneau (profondeur 1–2) : il couvre en moyenne **7 à 8 cases de pics** ; C3 : 10 à 11.
- **Aucun sort du Dompteur ne blesse ses alliés** (masques `A,j`). Il peut frapper au milieu de la mêlée et de l'équipe. Il touche le **Poutch allié** (Acrobate, Soutien Stratégique). Frappé par un Dompteur (état 5899), le Poutch renvoie 50 % des dommages initiaux aux ennemis à ≤ 2 cases (≤ 3 amélioré). C'est la raison de son nom, « Stratège Dompteur » (`/spell-levels/80526`–`80528`).

### 10.2 Budget PA et rotations types (8 PA de base)

| PA | Rotation | Dégâts attendus sur Vulnérable (centre) |
|---|---|---|
| 8 | Impact ×2 | ≈ 18 700 sur la cible centrale (plus la zone) |
| 8 | GG + Impact (tour de relance GG) | ≈ 13 900 + 9 400 |
| 8 | Coup de Sang + Impact (PV pleins) | 12 000 par cible de la zone + 9 400 |
| 8 | Prélèvement ×2 + Ombre Fracassante | ≈ 12 100 + soin ≈ 6 000 (plafonné aux PV manquants) + érosion portée à 40 % + OF selon l'érosion |
| 9 (+1 PA) | Impact + Prélèvement + OF | — |
| 10 (Regain Vigoureux) | Impact ×2 + OF ; ou GG + Impact + OF ; ou Prélèvement ×2 + Impact | — |
| 12 (Galvanisation) | Impact ×2 + GG, ou Impact ×2 + Coup de Sang | — |

**Dégâts par PA** (espérance, centre, Vulnérable) :

| Sort | Dégâts / PA |
|---|---|
| Relâchement (+100) | ≈ 7 700 |
| GG boosté | ≈ 3 470 |
| Coup de Sang (PV pleins) | 3 000 par cible |
| GG | ≈ 2 860 |
| Impact | ≈ 2 340 par cible |
| Prélèvement | ≈ 2 020 (+ soin et érosion) |
| Détonation | ≈ 1 470 à 2 230 par cible |
| Frappe Repoussoir | ≈ 810 |

Le planificateur doit y ajouter le **nombre de cibles** de chaque zone et la valeur de « tuer le Trooll qui joue juste après » (heuristique n°1 des vidéos).

### 10.3 Déroulé recommandé (compos A–D–D–M et A–A–D–M)

| Phase | Dompteur(s) | Détail |
|---|---|---|
| **T1** (V1 = 2 Troollibres) | Impact ×2 sur le Trooll poussé dans les pics par l'Acrobate. Si l'objectif « Empalé » est réussi avant son tour, GG est déjà disponible. | VOD (compo 2 Acro + 1 Dompteur + Magicien) : le Dompteur place un GG critique à 12 078 dès le T1. Viser le Trooll qui joue juste après. |
| **T2–T6** | Cycle GG toutes les 2 tours (T, T+2 : +20). Impact en remplissage. Coup de Sang tôt (PV pleins, non boostable). Prélèvement sur les cibles qu'il faudra finir à l'Ombre Fracassante. | Laisser un Trooll ≤ 2 000 PV **dans** les pics : il meurt au début de son tour (1 000 ×2). Économie de PA. |
| **Obtention des uniques** | Prendre **Relâchement de Fureur** le plus tôt possible (+25 par tour pendant 4 tours) ; Galvanisation ; Pulsation et Punition pour la fin. | « Relâchement : il faut la prendre » (cardxc, Zephiron, Khytrayer) |
| **T7** (V7 = 3 Nitroolls) | Pense Vite sur un Dompteur, Immortalité du Berserker, Galvanisation. Garder Relâchement, Prélèvement et OF pour le T8. Éviter la ligne d'arrivée de Mama (case 300). | vidéos note 60 §0.7 |
| **T8** (Mama) | Après la mise en pics de Mama (Acrobate, Voltige si elle est Inébranlable) : Prélèvement ×n (érosion 50 %), Relâchement ×2 (2 Dompteurs), Impact/GG, **Ombre Fracassante en dernier**. | Huz : −140 000 en un tour ; 2 Relâchements à +100 et +40 % de dommages finaux ≈ 100–120 k |
| **T9–T10** | Malédiction Collatérale, puis Dégagez ! (Acrobate), puis Punition Collective (11,5–12,9 k par Trooll dans les pics) et Pulsation Chaotique en commençant par le plus faible, à une extrémité du paquet. | cardxc 21:30–23:00, Khytrayer 11:35–16:52 ; Huz : 14 monstres en un tour |

### 10.4 Interactions avec les pics et Vulnérable

1. **×2 sur tout** : les dommages à jet, les % PV (Coup de Sang), les % d'érosion (Jaillissement, Ombre Fracassante) et le vol de vie (le soin suit les PV retirés). Donc **Coup de Sang à PV pleins = 12 000 par Trooll dans les pics**. Le renvoi de Malédiction Collatérale reçu par un voisin Vulnérable est doublé lui aussi.
2. **Même sort** : Frappe Repoussoir pousse puis frappe. L'état Vulnérable est acquis avant la frappe (la preuve vient de l'Acrobate, §12).
3. **Sortie des pics** : un Trooll qui sort ou qu'on sort des pics reste **Vulnérable 1 tour** (30701). On peut le frapper ×2 même hors pics.
4. **Début de tour dans les pics** : 1 000 ×2 = 2 000. Un Trooll à ≤ 2 000 PV laissé dans les pics est mort (cardxc 11:00, Khytrayer 13:04).
5. **Poussée** : le Dompteur ne pousse que de 2 cases (Frappe Repoussoir, 2 par tour). La collision (283 par case) n'est pas doublée.
6. **Mama** : elle est invulnérable tant qu'elle n'a pas été mise dans les pics. Tous les dégâts du Dompteur sont nuls avant. Pulsation et Punition l'excluent **seulement** tant qu'elle a l'état « Mama Trooll (pré fight) » (5971).

### 10.5 Choix d'améliorations (cadeaux)

| Priorité | Amélioration | Raison |
|---|---|---|
| 1 | **Impact** | 3e lancer par tour (utile dès 12 PA : Galvanisation, Regain Vigoureux, acclamations PA) et cercle C3 (25 cases, 10–11 cases de pics couvertes sur l'anneau). |
| 2 | **Prélèvement** | Érosion permanente et cumulable, 4 lancers par tour, critique C3. Excellent contre Mama avec Ombre Fracassante. |
| 3 | Détonation | Seulement sur les grosses vagues (5×2). |
| — | Grondement | La croix X3 coûte probablement le +20 de relance : **à éviter** si le bonus est perdu (HYPOTHÈSE). |
| — | Coup de Sang, Jaillissement, Ombre Fracassante | Plus de cases, mais une dégressivité apparaît. Gain faible. Jaillissement est peut-être cassé (80750). |

### 10.6 Heuristiques pour le planificateur

- Pour chaque case cible candidate `t` d'un sort de zone, calculer `Σ_cibles E(dégâts × coefZone × (2 si Vulnérable))`. Ajouter une valeur de kill quand `PV_restants ≤ dégâts`. Ajouter une valeur de « kill avant son tour » pour le prochain monstre de la timeline.
- Contraintes : lancers par tour, par cible, intervalle ; cycle de relance de GG ; PO + dégressivité ; LdV : aucun obstacle sur la carte 139988488, **seules les entités bloquent la LdV**. Prélèvement, Relâchement et Pulsation s'en passent.
- Ordre intra-équipe : les Dompteurs jouent **après** l'Acrobate (mises en pics) et **avant** le Magicien. Malédiction Collatérale gagne à être lancée par le premier Dompteur.

---

## 11. Écarts et anomalies (données du jeu / DPLN / vidéos)

| Sujet | Données (source primaire) | DPLN / vidéo | Verdict | Conf. |
|---|---|---|---|---|
| +3000 Puissance (30639) | 138 +3000, masque `C,*E5899` | DPLN ≈ ×61 ; VOD : 4 relevés à ×61 | non appliquée (lancée avant le choix d'archétype) ; **Puissance 0** | haute |
| Taux critique | 30 % (0 % pour 5 sorts) | captures 30 / 40 / 70 % | l'infobulle en combat ajoute la stat Critique (10 %, +30 % d'Amplification) | haute |
| Détonation | +5 par cible (30417), « +10 » = forClientOnly | capture « +10 » | **+5 par ennemi** | moyenne |
| GG amélioré | 406 (retrait des buffs de 30560) en ordre 0 | — | bonus +20 probablement perdu | moyenne |
| Prélèvement amélioré | érosion 20 % **permanente**, cumul ∞, 3 par cible | « 15 % > 20 % ; 3 > 4 » | changements partiellement non annoncés | haute |
| Coup de Sang / Jaillissement / OF améliorés | dégressivité 0 → 10 %×4 | non mentionnée | malus de zone ajouté | haute (donnée) |
| Amélioration : Jaillissement | apprend le niveau 80750, **absent** (404) ; 30564 = 80760 | listée | référence cassée ; simuler 80760 | moyenne |
| Malédiction Collatérale | 1223 **50 %** | capture « Renvoie 100 % » | 50 % (capture antérieure ?) | moyenne |
| Relâchement de Fureur | +25 à 4 débuts de tour (30624), max +100 | « augmentent à chaque tour où il n'est pas utilisé » | plafond +100 ; démarrage à l'obtention (serveur) | moyenne |
| Pense Vite | 10 s | 15 s | rééquilibrage | moyenne |
| Impact critique | masque `A,J` (normal `A,j`) | — | coquille probable (Poutch non touché en critique) | basse |
| Vulnérable | 1163 ×200 % = ×2 | « +200 % » | ×2 (relevés 12 078 / 12 688) | haute |
| Fourche OF | F2 → F3 | « 4 > 5 cases » | « taille » = param + 2 | haute |
| Coup de Sang et Jaillissement | 1048 = malus de PV courants | DPLN : « perdre 10 % de PV » | ne crée pas de PV érodés (Jaillissement non alimenté) | moyenne |

Aucun écart sur :
- les coûts, portées et zones normales (C2 13, X1 5, R 3×2, C2 13, G1 9, F2 10) ;
- les jets de dégâts, entre données et captures DPLN (Impact 68–74 / 82–89 ; GG 82–92 / 98–110 ; Prélèvement 42–50 / 50–60 ; Détonation 38–42 / 46–50 ; Relâchement 187–202 / 237–252 ; Pulsation 35–42 ; Punition 94–106 ; Galvanisation +4 PA, 2 tours).

L'ordre d'obtention DPLN est identique au Spell Manager.

---

## 12. Relevés de dégâts dans la VOD (preuves du ×61)

Source : VOD Twitch 2852548819, « [KOURIAL] DÉCOUVERTE GLADIATROOL », 21/08/2026, version 3.6. Les images ont été extraites par l'agent carte (scratchpad `frames/k1src`, `frames/k1f`, non versionnées). L'image `sN_KK` correspond à t = 10·N + KK − 1 s. Les chiffres flottants d'un même lancer s'additionnent par cible.

| Valeur lue | Image / contexte | Décomposition exacte | Exclut |
|---|---|---|---|
| **−12 078** | s295_05 (480p), combat 1 (compo 2 Acro + Dompteur + Magicien), T1, tour du Dompteur, Troollibre Vulnérable (dans les pics) | GG **critique** jet 99 : 99×61 = 6 039, ×2 = 12 078 | Impact (maximum ×61 = 10 858) ; ×91 : aucun jet entier |
| **−12 688** | s723_09, combat 3, T1, même animation | GG critique jet 104 : 6 344 ×2 | Impact ; ×91 |
| −5 124 | s728_06, combat 3, cible hors pics | 84×61 (GG jet 84 ou Impact critique jet 84) | ×91 |
| −5 185 | s728_08, combat 3, cible hors pics | 85×61 (Impact critique 85 ou GG 85) | ×91 |
| 3 239–3 458 (3 952–4 227) | s289_03, aperçu d'infobulle, Videur (Acrobate) | 59–63 ×61 ×0,9 (critique 72–77) | Puissance ou Vitalité conditionnelles du passif |
| −9 904 (Acrobate) | s289_07 | 2 000 (entrée dans les pics) + Videur critique 72×61×0,9 = 3 952, **×2** | preuve que Vulnérable s'applique dans le même sort, juste après la poussée |

Il reste un risque résiduel : l'identification du sort (GG ou Impact) repose sur l'animation. La conclusion ×61 n'en dépend pas, car aucune des 4 valeurs n'est atteignable à ×91.

---

## 13. Questions ouvertes

1. **GG amélioré** : le serveur applique-t-il le 406 avant les dommages ? Cela confirmerait la perte du +20. Il faudrait relever une relance de GG amélioré à T+2 (cible au centre : 5 002–5 612 contre 6 222–6 832).
2. **Malédiction Collatérale** : y a-t-il une chaîne de renvois ? Le porteur est-il touché ? Aucune vidéo exploitable pour l'instant.
3. **Pulsation Chaotique** : portée ou ligne de vue des rebonds (1–5, LdV) ? Ordre exact en cas d'égalité de distance (ordre des directions, puis id de cellule selon le client).
4. **Relâchement de Fureur** : moment où le serveur pose 30624 (à l'obtention ? au premier tour suivant ?).
5. **Amélioration : Jaillissement** (80750 manquant) : l'amélioration fonctionne-t-elle en jeu ?
6. **Coup de Sang** : le malus de PV 1048 crée-t-il 10 % d'érosion côté serveur ?
7. **Impact critique** (`A,J`) : touche-t-il le Poutch allié en critique ?

---

## 14. Reproduire

```bash
cd /home/user/GladiatroolSimu
python3 tools/archetypes/build_archetype_dompteur.py        # écrit research/data/archetype_dompteur.json
python3 tools/archetypes/build_archetype_dompteur.py --md   # + tableaux de dégâts / zones (sections 5 à 9)
```

Dépendances : `research/raw/dofusdb/*.json`, `research/data/effects_semantics.json`, `tools/mechanics/{damage,zones,geometry}.py`. Aucun accès réseau.
