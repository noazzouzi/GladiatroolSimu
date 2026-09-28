# Vérification adversariale du moteur (sort par sort)

Vérification indépendante du moteur (`sim/src/engine`, `sim/src/geometry`, `sim/src/data`) contre la réalité
documentée : ÉTUDE §4-§6 et §9, notes `1x_archetype_acrobate/dompteur/magicien.md`, `20_monstres_boss.md`,
`70_formules_dofus.md`, fiches `research/data/archetype_*.json` (`expectedDamage`, `simModel`, `workedExamples`,
`geometry`) et `research/data/monsters.json` (`damageTable`).

Méthode : pour chaque niveau de sort, un scénario minimal sur la **carte réelle** (map 139988488), avec des
**lancers réels** (`castSpell` : validation, PA, résolution, sous-sorts, déclencheurs) ; les bornes sont obtenues avec
`rollMode` `min` / `max` et `critMode` `never` / `always`. Les valeurs attendues sont recopiées des notes, **pas** des
données : un écart oblige à trancher (données du jeu > formules du client > notes).

- `sim/test/spells-archetypes.test.ts` (299 tests) : conditions de lancer des 63 niveaux (commun, 3 × 7 sorts
  normaux et améliorés, 19 uniques, Pense Vite), effets de chaque sort, améliorations (21 choix), Acclamations
  (18 cartes), exemples chiffrés des fiches, tailles de zone, tableau « k cases des pics » (N1A §7.1), interactions
  avec les pics dans l'arène.
- `sim/test/spells-monsters.test.ts` (67 tests) : 13 sorts de monstres et de la Mama (conditions, zones, bornes,
  critiques, poussées), script de départ de la Mama, Faveur de la foule, Rassemblement, performance.
- Aides : `sim/test/helpers/spellCheck.ts` (combat minimal, modes de jet, lecture du journal, vérification
  générique des conditions de lancer : PA, portée min/max, PO modifiable, ligne, LdV, case libre/occupée, lancers par
  tour / par cible, intervalle — effets neutralisés par `effectFilter` pour isoler les règles de lancer).

Légende : **OK** = conforme ; **corrigé** = écart du moteur corrigé ; **assumé** = écart connu gardé (raison) ;
**note fausse** = la note ou l'ÉTUDE est contredite par les données.

## 1. Écarts trouvés

| # | Sujet | Constat | Verdict | Source qui tranche |
|---|---|---|---|---|
| 1 | **Coup de Sang** (1048, coût −10 % PV) | Le moteur traitait 1048 comme des dommages : un Dompteur **Vulnérable** payait 6 000 au lieu de 3 000 (×2 du 1163), et le coût déclenchait les effets `D`. | **corrigé** : gestionnaire `hpMalusHandler` (perte directe de PV courants : ni bouclier, ni résistance, ni 1163, ni déclencheur de dommages ; seuil 2872 respecté ; érosion seulement avec `spells.coupDeSangCreatesErosion`). | N1D §5.5 (code client : StatBuff « lifePointsMalus », `canTriggerOnDamage` faux) ; `archetype_dompteur.json` expectedDamage « ignore bouclier et Vulnérable ». La bibliothèque d'aperçu `damage.py` (qui applique les 1163 à 1048) n'est **pas** modifiée : c'est le calcul d'infobulle. |
| 2 | **Ultime Espoir** sur soi (147 via 30674) | Le moteur ressuscitait **tous** les alliés morts. | **corrigé** : 147 ressuscite le **dernier** allié mort (nouvel ordre des morts `Fighter.deathSeq`), une seule fois par application ; une invocation morte n'est pas ressuscitée. | N1M §5 (« ressuscite le dernier allié mort », confiance haute), ÉTUDE §4.4. |
| 3 | Pulsation Chaotique | ÉTUDE §4.3 : « frappe la cible (**deux fois**) ». | **note fausse** : une seule frappe par cible (30667 niv. 1 : un effet 100), k-ième cible (35–42 + 20(k−1)) × 61, ce que donnent aussi N1D §6 et `expectedDamage.byHit`. Moteur OK. | données 80947 |
| 4 | Trooll de Magie | ÉTUDE §5.5 / N20 : soin « à un allié ou lui-même » (« `a`, lui compris »). | **note fausse** : PO 1–6 et zone P → le Nitrooll ne peut pas se soigner lui-même. Moteur OK. | données 80494 |
| 5 | Immortalité du Bienfaiteur | N1M : « soin 50 % PV max ». | **précision** : c'est 50 % des PV max **après** l'érosion du coup qui a atteint le seuil (ex. 40 000 sur 30 000 PV : 2 999 érodés → soin 13 500). Moteur OK. | formule 1109 (PV max courants), N70 §4 |
| 6 | Soutien Stratégique amélioré | ÉTUDE : X7 + « + »7 = 57 cases. | **assumé** : autour de 300, une extrémité du « + »7 sort de la grille de 560 cases (56 cases réelles) ; sans effet dans l'arène (rayon 8). | géométrie du client |

Aucun autre écart : les 366 tests des deux fichiers passent sans autre modification du moteur.

## 2. Tableau sort par sort

Colonnes « Vérifié » : C = conditions de lancer (PA, portée, PO modifiable, ligne, LdV, case, limites, critique) ;
Z = zone ; D = dégâts min/max/critique ; P = poussée / attirance / case finale ; E = états, buffs, soins, boucliers ;
S = sous-sorts ; R = relance / durée.

### 2.1 Commun et Acrobate (normal → amélioré)

| Sort (niveaux) | Vérifié | Résultat | Remarques / source |
|---|---|---|---|
| Frappe Repoussoir (80499) | C D P E | OK | 976–1 220, crit 1 281–1 525 ; allié poussé sans dégâts ; Poutch allié (`j`) frappé ×50 % (DBA) ; 40 % de critique effectif. |
| Videur (80507 → 80766) | C Z D P | OK | T2 5 → T3 7 cases ; 3 599–3 843 (crit 4 392–4 697), −10 %/case de la barre ; « bulldozer » et poussées diagonales exactes (N1A §2.3, 6 cas) ; workedExamples T1 des 4 cases de départ. |
| Hanedimane (80513 → 80784) | C Z P S | OK | F2 10 → F3 13 ; ennemis repoussés, alliés attirés (4 → 6), toujours parallèlement à l'axe. |
| Voltige (80510 → 80775) | C D P | OK / assumé | 3 538–3 782, critique impossible (taux 0) ; échange allié sans dégâts ; PO 7 et case vide acceptée une fois améliorée ; **2** lancers améliorés (données) contre 3 (DPLN) : `spells.voltigeUpgradedMaxPerTurn`. |
| Aïronemane (80522 → 80778) | C Z P | OK | téléportation sans LdV, poussée 2 → 4 des 4 voisins (alliés compris) depuis le centre ; Pesanteur (7) interdite seulement pour la version normale (données). |
| Pugnace (80511 → 80780) | C E R | OK | Inébranlable + 25 / 50 % de résistance jusqu'au prochain tour ; Troollpoline 4 100 → 3 075 / 2 050. |
| Soutien Stratégique (80509 → 80773) | C Z P S E | OK | Poutch 7985 / 7986 (5 500 PV) ; attirance 4 → 6 vers lui (axes et diagonales) ; renvoi 50 % des dommages **initiaux** aux ennemis en C2,1 (×2 sur Vulnérable) ; un 2e Poutch tue le 1er. |
| Va-t-en-guerre (80512 → 80782) | C P | OK | avance 2 → 4 vers un ennemi ou un allié ; bloquée par Inébranlable (`engine.unshakableBlocksCasterAdvance`). |
| Dégagez ! (80828) | C P E | OK | +1 000 DoPou posé **avant** la poussée 5 : 533 par case (k = 1 : 1 599) ; Mama pré-combat exclue ; oubli. |
| Courage, fuyons (80829) | C E | OK | +4 PM à tous les alliés. |
| Immortalité du Courageux (80844) | C P E S | OK / assumé | seuil 1 PV, interception des alliés du C2 (choisis avant l'avance de 63), Endolori sur la cible ; interception = dommages recalculés sur l'intercepteur, sans échange de place (hypothèse du moteur). |
| Malédiction Mouvante (80845) | C S | OK | l'attaquant repousse de 2 l'ennemi frappé. |
| Chamboulement (80846) | C P S | OK / assumé | poussée 5 sans LdV ; rebond sur le plus proche non marqué ; les données permettent une **chaîne** de rebonds (chaque cible reçoit PD/XPD) et la collision d'un rebond vient du monstre (33/case) ; ÉTUDE « rebond unique » = une exécution par rebond (N1A §5). |
| Un pour un (80847) | C E S | OK | ×50 % subis, renvoi de 100 % des dommages finaux (868 / 868). |
| Pense Vite (80843) | C E R | OK | 10 s, 1 007 PA au tour suivant seulement, oubli. |

### 2.2 Dompteur

| Sort (niveaux) | Vérifié | Résultat | Remarques / source |
|---|---|---|---|
| Impact (80500 → 80748) | C Z D | OK | 4 148–4 514 / 3 733–4 062 / 3 318–3 611, crit 5 002–5 429 ; C3 : 2 903–3 159 ; 2 → 3 lancers ; jamais un allié joueur ; masque critique `A,J` (`spells.impactCritHitsPoutch`). |
| Grondement Grandissant (80501 → 80751) | C Z D R | OK / assumé | 5 002–5 612, crit 5 978–6 710 ; +20 à la relance 2 tours plus tard (6 222) ; amélioré : le 406 en tête retire le +20 (`spells.ggUpgradedKeepsRecastBonus`). |
| Prélèvement (80502 → 80754) | C D E | OK / assumé | érosion posée avant le vol de vie ; 2 562–3 050 (crit 3 050–3 660), soin 50 % ; case vide : rien hors critique, C2 → C3 en critique ; cumul 3 (normal) interprété comme condition de lancer (`MAX_STACK`, comme le client), érosion 20 % permanente sans cumul maximal (amélioré). |
| Détonation (80503 → 80756) | C Z D S | OK / assumé | R1,1 6 → R2,1 10 ; +5 de base par ennemi ou invocation alliée ; 90 % hors case ciblée, 80 % aux extrémités ; le 406 normal vise 30398 et laisse le +5 jusqu'au prochain tour (sans effet : 1 lancer par tour). |
| Coup de Sang (80504 → 80758) | C D E | **corrigé** | 20 % des PV courants (6 000, 12 000 sur Vulnérable), sans critique ; coût 10 % des PV courants **non doublé** (écart n° 1) ; amélioré C3 avec dégressivité. |
| Jaillissement (80505 → 80760) | C Z D | OK | 40 % des PV érodés du lanceur ; G2 avec dégressivité Chebyshev ; amélioration 80750 absente → substitut 80760 (`spells.jaillissementUpgradeBroken`). |
| Ombre Fracassante (80506 → 80762) | C Z D | OK | 30 % des PV érodés de chaque cible, F2 sans dégressivité → F3 avec. |
| Punition Collective (80826) | C D | OK | 5 734–6 466, 11 468 sur Vulnérable ; Mama pré-combat exclue. |
| Galvanisation (80827) | C E | OK | +4 PA crédités aussitôt (lanceur 8 − 5 + 4). |
| Relâchement de Fureur (80839) | C D | OK | sans bonus 11 407–12 322 (crit 14 457–15 372), PO 1–63 fixe sans LdV ; +100 : T12 (engine-core). |
| Pulsation Chaotique (80840) | C D S | OK (note fausse) | 2 135 / 3 355 / 4 575 pour les 3 premières cibles ; bonus et marques retirés en fin de chaîne (écart n° 3). |
| Malédiction Collatérale (80841) | C S | OK | chaîne exacte calculée à la main (3 733 → 1 866 → 933 / 466) sans boucle ; variante `maledictionCollateraleChains`. |
| Immortalité du Berserker (80842) | C E | OK | seuil 1 PV, Endolori. |

### 2.3 Magicien

| Sort (niveaux) | Vérifié | Résultat | Remarques / source |
|---|---|---|---|
| Pulsation d'Énergie (80514 → 80786) | C Z D E | OK | 2 684–2 928 (crit 3 233–3 538) à l'ennemi de la case ; soins C2 → C3 dégressifs, un seul tirage critique ; soigne les 4 cases de départ depuis 286/287/300/314/315 (`geometry`). |
| Regain Vigoureux (80515 → 80788) | C Z E | OK | +2/+2 en C3 autour du lanceur → +3/+3 à tous. |
| Amplification (80516 → 80791) | C E | OK | +20/+40 % DF et +30/+50 % critique (Dompteur), +500/+1 000 DoPou (Acrobate : collision 408), +20/+40 % soins (Magicien) ; Impact 4 977 / 5 807. |
| Protection Prolongée (80519 → 80800) | C E | OK | bouclier 3 000 / 5 000 qui absorbe aussi les collisions ; soins TB (engine-triggers). |
| Délivrance (80521 → 80802) | C E | OK | retire Patroolleur (dispellable 1), pas Vulnérable ni les buffs de la Mama ; 1 → 3 lancers, 1 par cible. |
| Vents Contraires (80517 → 80793) | C Z D E | OK | 2 806–3 172 (crit 3 355–3 782) ; −2 PM X1 → −3 PM X2. |
| Vague de Dégradation (80518 → 80795) | C Z D E | OK | 1 281–1 708 (crit 1 525–2 074) ; érosion posée avant la frappe ; −15/−30 % DF et +15/+30 % érosion C2 → C3. |
| Influx de Vitalité (80830) | C E | OK | 17 324–19 032, sans dégressivité. |
| Démotivation des troupes (80832) | C E | OK | −35 % DF ; Mama pré-combat exclue. |
| Immortalité du Bienfaiteur (80848) | C E S | OK (précision) | seuil 1 PV permanent, soin 50 % des PV max après érosion (écart n° 5). |
| Malédiction Régénérante (80849) | C S E | OK | soin de 100 % des dommages subis aux alliés en C2 de l'ennemi frappé (dégressivité des données). |
| Muraille collective (80850) | C E | OK | 15 000 à tous les alliés. |
| Ultime Espoir (80851) | C E S | **corrigé** | soin 100 % PV max sur un autre allié ; sur soi : dernier allié mort à 50 % (écart n° 2). |

### 2.4 Monstres et Mama

| Sort (niveau) | Vérifié | Résultat | Remarques / source |
|---|---|---|---|
| Troollpoline (80483) | C Z D P | OK | anneau C2,1 : 4 100–4 756 / 3 690–4 280 (crit 4 920–5 699 / 4 428–5 129) ; poussée 3 (diagonale : 2 pas) ; Patroolleur 4 715, Pugnace 3 075, Vulnérable 8 200 (`damageTable`). |
| Aspiratrooll (80484) | C D P E | OK / assumé | attire 2, vol de vie 2 665–3 075 (crit 3 198–3 690), érosion +10 % **après** la frappe ; `maxStack` 2 compté tous lanceurs confondus (voir limites). |
| Patroolleur (80485) | C E | OK | +15 % DF 2 tours, Inébranlable 1 tour, désenvoûtables. |
| Tir d'Artroollerie (80486) | C D P | OK | 1 736–2 015 (crit 2 077–2 387), poussée 2, collision 33/case non doublée. |
| Mortrooll (80487) | C Z D | OK | C3 100/90/80/70 % (2 511–2 945, crit 3 131–3 627), ennemis seulement. |
| Double Trooll (80490) | C D P | OK | 2 × 1 152–1 368 (crit 2 × 1 512), deux tirages indépendants, poussée 3. |
| Coup de Trooll (80493) | C P | OK | poussée 3 en ligne, pas de dégâts hors collision. |
| Trooll de Magie (80494) | C E | OK (note fausse) | 2 016–2 340 (crit 2 412–2 772) ; pas sur soi (écart n° 4). |
| Troollement de Tambour (80496) | C P E | OK | échange avec un allié + Inébranlable ; sur la Mama pré-combat : pas d'échange (5971) mais Inébranlable posé. |
| Troollooportation (80488 + 80491) | C Z D | OK | case libre ; 60–70 en X1 à 90 % : 2 484 (sans Faveur), 3 105–3 622 (crit 3 725–4 346) sous Faveur V. |
| Uppertrooll (80495) | C D P | OK | 2 645–3 105 (crit 3 220–3 737) sous Faveur V, soin 50 %, poussée 6, collision 133/case (niveau 1000). |
| Mitroollette de Poings (80497) | C Z D | OK | 4 278–4 968 hors Faveur ; 5 347–6 210 (crit 6 382–7 417) sous Faveur V ; Démotivation 2 780 ; Catastrooll + Faveur 6 203. |
| Catastrooll (80498) | C Z P E | OK | attire de 5 dans l'étoile *6 (alliés et ennemis) ; +20 % DF jusqu'à la fin du tour. |
| Rassemblement Troollesque (30432) | Z P E | OK / assumé | Troolls attirés, joueurs repoussés jusqu'au bord (pics, 2 000) sans collision, Grabbed ; un Trooll attiré peut bloquer un joueur ; Inébranlable bloque (paramètre). Le niveau 4 est exécuté une fois **par combattant** de la croix (1160 non limité) : résultat idempotent (voir limites). |
| Script 30430 et Faveur 30659 | E | OK | Faveur V (+25 %), Invulnérable, pré-combat (Enraciné, pas d'échange), tour annulé 6, arrivée différée 7 ; la case 152 n'est pas ciblable ; V → IV → … → aucun, DF 125 → 100 → 95 (sans plafond). |

## 3. Performances

Mesure (`spells-monsters.test.ts`, bloc « performance », et script de contrôle) : Node 22, carte réelle, état de milieu
de combat à **16 combattants** (4 joueurs avec passifs et archétype, 10 Troolls avec passif, la Mama avec son
script, l'entité de scénario ; pics posés ; 49 buffs, 2 marques), journal désactivé.

| Opération | Mesure | Objectif |
|---|---|---|
| `state.clone()` | ≈ 8,2 à 8,8 µs | < 20 µs |
| lancer d'Impact (après clone) | ≈ 4,6 à 8 µs | < 50 µs |
| lancer de Frappe Repoussoir | ≈ 4,5 µs | < 50 µs |
| lancer de Videur qui envoie un Trooll dans les pics (aura, 1163, déclencheurs) | ≈ 15 µs | < 50 µs |
| `getCastableCells` (Impact) | ≈ 2,1 µs | — |
| `canCast` | ≈ 0,1 µs | — |

Aucune optimisation n'était nécessaire. Le test garde des seuils larges (80 µs / 200 µs) pour ne pas échouer sur une
machine lente ; il détecte seulement une régression grossière.

## 4. Modifications du moteur (fichiers d'autres étapes, signalées)

- `sim/src/engine/effects/damageEffects.ts` : `hpMalusHandler` (1048).
- `sim/src/engine/effects/index.ts` : `hpMalusPct` → `hpMalusHandler` (au lieu de `damageHandler`).
- `sim/src/engine/damage.ts` : `applyDirectLifeLoss` accepte `{ erosion, spellLevelId }` ; `killFighter` renseigne
  `deathSeq`.
- `sim/src/engine/fighter.ts` : champ `deathSeq` (ordre des morts), copié par `clone()`.
- `sim/src/engine/effects/healEffects.ts` : `resurrectHandler` (147) — dernier allié mort seulement, une fois par
  application, pas d'invocation.

Données et configuration inchangées (`build_sim_data.py --check` à jour) ; aucun nouveau paramètre : les deux
corrections suivent des faits vérifiés (code client, données, confiance haute), pas des hypothèses.

## 5. Limites restantes

- **`maxStack`** est une condition de lancer comptée sur les buffs du sort portés par la cible, **tous lanceurs
  confondus** : un 3e Troollibre ne peut pas lancer Aspiratrooll sur un joueur qui porte déjà l'érosion de deux
  autres. Le client compte-t-il par lanceur ? Non vérifié (aucune source).
- **Rassemblement** : le niveau 4 est rejoué pour chaque combattant de la croix (1160 non « GlobalLimitation ») ; le
  placement est idempotent, mais le contrôle d'objectif 30448 et l'état Grabbed sont appliqués plusieurs fois : le
  scénario doit dédupliquer le comptage de l'objectif « Attirance ».
- **Ordre des déclencheurs** : un buff déclenché s'exécute dès l'application qui le déclenche (vidage après chaque
  effet × cible) ; ex. le renvoi du Poutch frappé par Impact passe avant les cibles suivantes de l'Impact. Ordre exact
  du serveur inconnu.
- **Poussée dans les pics avec collision** : les dommages de collision sont appliqués avant l'entrée dans l'aura
  (2 000). Sans effet sur le total ; peut changer l'auteur d'une mort (collision ou glyphe).
- **Interception (765)** : dommages recalculés sur l'intercepteur, sans échange de place (hypothèse héritée).
- **Coup de Sang** : le malus 1048 est appliqué comme une perte immédiate de PV ; le buff « PV (∞) −10 % » n'est pas
  modélisé comme envoûtement (le désenvoûter ne rend pas de PV) et la perte ne déclenche aucun jeton (ni `D`, ni
  `VA`) : seul l'objectif « Même pas mal » (jeton `VA`) pourrait y être sensible.
- **Chamboulement** : les rebonds en chaîne et leur collision au niveau du monstre découlent des données ;
  l'observation « rebond unique » (ÉTUDE) n'est pas contredite pour un seul ennemi voisin, mais un paquet peut
  produire plusieurs rebonds.
- Les sorts de monstres ne sont vérifiés que mécaniquement : l'IA (choix des cibles, `ai.monstersCanTargetAllies`)
  relève de l'étape IA.

---

# Vérification adversariale du scénario

Vérification indépendante du module `sim/src/scenario` et de son intégration avec `sim/src/engine`, confrontés à
ÉTUDE §2, §3, §4.1, §4.5, §6, §7, §8, SPEC §10-§12, notes 20 / 30 / 40 et `QUESTIONS_OUVERTES.md`, ainsi qu'aux
niveaux de sort bruts (`research/raw/dofusdb/decoded_spells.md`).

**Méthode.**
- Chaque attendu est recopié de l'étude ou lu dans les données brutes, jamais dans le code du scénario.
- Les situations sont jouées sur la carte réelle, par la vraie résolution du moteur : lancers, dommages
  (`applyDamage`), entrées dans les pics (`enterMarksAt`), tours complets.
- Les événements synthétiques ne servent qu'en dernier recours.
- La robustesse est éprouvée sur 200 combats complets, avec des invariants vérifiés après chaque action.

**Fichiers de test.**
- `sim/test/scenario.verification.test.ts` (48 tests) : contrôles point par point.
- `sim/test/scenario.robustness.test.ts` (5 tests) : les 200 combats, plus un auto-test du contrôle d'invariants.

Légende : **OK** = conforme ; **corrigé** = écart corrigé ; **assumé** = écart connu gardé (raison donnée).

## 1. Écarts trouvés

| # | Sujet | Constat | Verdict | Source qui tranche |
|---|---|---|---|---|
| S1 | **Début du suivi des objectifs « pendant le tour »** | Le scénario démarrait tous les compteurs dès l'activation, même si le vote avait lieu en plein tour d'un joueur. Or, dans les données, Productivité, Toi par ici, Trous dans les Troolls, D'une pierre trois coups et Quintuplé posent leur suivi par des déclencheurs **TB** (au début du tour de chaque allié). Effet : une Productivité votée pendant le tour du Magicien se validait dans ce même tour. À l'inverse, Pas le temps de dire « Aïe » (**I\|TB**) ne marquait personne avant le tour suivant, alors que le marquage est immédiat. | **corrigé** : `trackingStartsAtActivation` (objectives.ts) lit le niveau 1 du sort de l'objectif. Le suivi démarre dès l'activation s'il existe un sous-sort 792 / 2792 à déclencheur `I` **et** si l'état Challenger 5917 n'est pas posé seulement en `TB`. Sinon, il démarre au prochain début de tour d'un joueur (`ScenarioState.armed`). Les contrôles de fin de tour (Au coin !, Distance d'insécurité) sont actifs dès l'activation. Pas le temps marque aussitôt les ennemis à PV pleins. | DB sl80736, sl80710, sl80680, sl80690, sl80689, sl80691 ; ÉTUDE §7.2 (Productivité « dès le T1 si Empalé tombe **avant son tour** ») |
| S2 | **Même pas mal** : fenêtre de contrôle | La fenêtre durait un lancer de la Mama : un coup entièrement absorbé validait, même si le joueur avait déjà perdu des PV plus tôt dans le tour. Les données font autrement. 30539 est posé au **début du tour de la Mama** et met 5960 « Vie inchangée » sur ses ennemis ; cet état est retiré à la moindre variation de PV (`VA`). Tout dommage subi (`D`) pose 5961. Le contrôle a lieu à chaque dommage infligé par la Mama (`CD`). | **corrigé** : la fenêtre couvre le tour de la Mama (du début à la fin de son tour). Pertes de PV et soins la ferment pour l'allié concerné. Alliés = camp des joueurs, invocations comprises (masque `A`). | DB sl80725, sl80729, sl80741 |
| S3 | **Tout le monde veut prendre sa place** au T7 | Un filtre « case jouable » excluait la Mama qui attend sur 152. Or les données ne l'excluent que par `e5971` (30451 / 30452), et l'ÉTUDE §6.3 écrit qu'elle « peut compter au T7 ». | **corrigé** : même règle qu'Au coin !, c'est-à-dire exclusion si 5971 ou si le tour est antérieur à `objectives.mamaCountsFromTurn` (7 par défaut, Q34). Au T7, la case 152 peut donc être marquée ; l'objectif est alors irréalisable pour ce joueur. | DB sl80612, sl80613 ; ÉTUDE §6.3 |
| S4 | **Date des validations de fin de tour global** (30710) | Le contrôle tourne au début du tour global suivant, donc l'objectif était daté T + 1. | **corrigé** : l'objectif est daté du tour qui s'achève (`PendingCompletion.turn`). Seuls les résultats et l'historique changent. | ÉTUDE §2.1 (point 6) |
| S5 | **Apparitions dans les pics** avec `spawn.allowUnassigned` | Les candidats « sans type » des données contiennent des cases de pics : V1 171 et 402 (positions observées après la mise en pics), V9 402. Avec ce paramètre, un Trooll pouvait apparaître dans les pics. | **corrigé** : les pics sont exclus du tirage. La configuration par défaut n'était pas concernée. | ÉTUDE §2.3 (« aucune apparition n'a été observée dans les pics ») |
| S6 | Trous dans les Troolls : unicité | Le déclencheur `EON5902` de 30507 se déclenche à **chaque** entrée, et les données ne contiennent aucun contrôle d'unicité (Faire le mur, lui, a l'état 5956 « Not pushed »). Le texte du jeu dit pourtant « quatre combattants ennemis **différents** ». | **assumé** : le texte est retenu (ennemis distincts). Impact faible : faire entrer 4 fois le même ennemi dans les pics coûte plus cher que 4 ennemis. | texte du sort, ÉTUDE §7.2 |
| S7 | Contrôles de fin de tour global (masques `Atq,A`) | Tout va bien, Sauvez-le et Soleil visent aussi les invocations des joueurs, alors que le scénario ne compte que les personnages. | **assumé** : sans effet en pratique. Le Poutch (Soutien Stratégique) n'apparaît qu'après le 5e objectif, quand l'objectif actif est de palier 6, et aucun objectif de palier 6 n'utilise ces masques. | données, ordre du Spell Manager |

Tests d'autres étapes adaptés à S1 et S2 (`sim/test/scenario.objectives.test.ts`) :
- 5 tests activaient un objectif en plein tour et attendaient une validation dans ce même tour. Ils passent maintenant
  par `forceAtTurnStart`, qui émule une activation antérieure au tour.
- Le test « Même pas mal » est réécrit pour la fenêtre du tour de la Mama.

## 2. Contrôles point par point

| Point (source) | Attendu | Test | Verdict |
|---|---|---|---|
| Timeline par défaut (ÉTUDE §2.4, Q1) | Mama, J1, M1, J2, M2, J3, M3, J4, M4, M5…, Troolls dans l'ordre d'apparition (vague, puis composition) | `timeline` × 5 | OK |
| Mama en tête, place libérée | Mama en tête même pendant ses tours annulés ; un monstre mort disparaît de la timeline au tour global suivant | idem | OK |
| Joueurs | Ordre de la mise en place ; `timeline.deadPlayersKeepSlot` | idem | OK |
| `alternate_initiative` | Troolls triés par Force (4 000 > 3 500 > 3 000) | idem | OK |
| Invocations | Le Poutch joue juste après l'Acrobate, dès l'invocation puis à chaque tour global | idem | OK |
| Tour global (ÉTUDE §2.1, §2.2) | T1 : ni Acclamation ni cadeau. T2–T9 : Acclamations (4), puis vague, puis cadeau. V8 absente. T10 : V10 puis 30577 (5965). La Mama joue la première à chaque tour ; elle arrive sur 300 au début de **son** tour du T8, jamais avant. 31 Troolls (11 / 11 / 9) | `déroulé` | OK |
| 30710 | Validation datée du tour qui s'achève. Le vote (liste 10 + palier) précède les fenêtres d'Acclamation du tour suivant (correctif du 05/05/2026) | idem | **corrigé** (S4) |
| Mama T1–T8 (ÉTUDE §6.3, §6.4) | 5971 aux T1–T6, levé au T7. 6 tours annulés. Sur 152 jusqu'au T8, puis sur 300. Invulnérable hors des pics (0 dommage). À l'entrée dans les pics : 2 000 d'entrée subis, puis ×2. De nouveau invulnérable au début de son tour suivant (glyphe de début de tour absorbé) | idem | OK |
| Victoire / défaite (ÉTUDE §2.6) | Tuer tous les ennemis au T9 ne suffit pas. Au T10 il faut tuer les 6 de V10. Un survivant suffit | idem | OK |
| Tirage des apparitions (ÉTUDE §2.3, Q5) | V2 sur 1 500 graines : fréquences conformes aux poids observés à ±0,05 (187:188 = 5:6, 411:412 = 3:8, 242:358:246 = 3:4:2). Types conformes à la composition. Cases occupées exclues, repli hors pics. Jamais dans les pics ni deux fois la même case (25 graines × 9 vagues). Mêmes graines de scénario → mêmes vagues et mêmes cadeaux, quels que soient les jets | `apparitions` × 4 | OK ; **corrigé** (S5) |
| Rassemblement (ÉTUDE §6.5, Q10) | `rassemblementPullThenPush` : le Trooll attiré (358 → 329) bloque le joueur (315). Dans l'ordre inverse, le joueur est repoussé jusqu'au Trooll (344). Joueurs alignés repoussés au bord (408, 184) avec 2 000 d'entrée seulement, Grabbed et Vulnérable ; les autres sont intacts | `Rassemblement` × 2 | OK |
| Faveur (ÉTUDE §6.7) | 125 → 100 → 95 % (tests existants). Objectif réussi Mama morte : sans erreur, sans effet (masque `F7984`) | `Faveur` | OK |
| Récompenses (ÉTUDE §4.1, 30626) | Après chaque objectif, chaque joueur a exactement les sorts de l'ordre de l'étude (ids de sort, 3 archétypes). Le niveau appris est celui du 3405 du Spell Manager de ce palier filtré par l'état d'archétype. Un joueur mort n'apprend pas | `récompenses` × 2 | OK |
| Cartes de cadeau (ÉTUDE §8.1, Q14) | Jusqu'à épuisement, soit 8 cadeaux ou plus. Pour chaque joueur, min(2, cartes possibles) cartes distinctes : uniques de l'archétype ou Pense Vite non obtenus, améliorations de sorts possédés non améliorés (niveau amélioré des données). Pas de fenêtre si aucune carte n'existe. Jamais deux fois le même unique ni la même amélioration. Seul le cadeau ramassé disparaît ; un monstre ne le déclenche pas | `cadeaux` × 2 | OK |
| Choix | Choix d'un joueur mort retiré ; aucun choix sans option | `choix` | OK |
| Installation du suivi (données I / TB) | Table lue dans les données : immédiat pour Au coin !, Distance d'insécurité, Ébranlable, Faire le mur, Meurtres en série, Pas le temps, Sol glissant. Productivité et Quintuplé votés en cours de tour ne comptent qu'au tour suivant. Pas le temps marque aussitôt | `installation` × 4 | **corrigé** (S1) |

**Les 21 objectifs** (`les 21 objectifs`, 22 tests) : chaque objectif a un cas qui le valide et un cas qui ne doit
pas le valider, en situation de combat.

| Objectif | Valide | Ne valide pas |
|---|---|---|
| Empalé | Trooll à 1 500 PV envoyé dans les pics par Videur (tué par les 2 000 de l'entité de scénario) | Trooll tué hors des pics |
| 1,2,3, Soleil ! | Un tour global complet sans déplacement (daté T2) | J3 se déplace |
| Sol glissant | Mort par dommages de collision | Mort par dommages ordinaires |
| Meurtres en série | Le même joueur tue 2 Troolls dans son tour | 2 joueurs différents |
| Productivité | 3 sorts dans le tour | 2 sorts |
| Ébranlable | Mort sous Patroolleur (157) | Mort sans 157 |
| Toi, par ici | Voltige depuis les pics (l'Acrobate sort, le Trooll entre) | Seul un ennemi entre |
| Stop aux projectiles | Artroolleurs tués (daté T2) | Un Artroolleur vivant |
| Sauvez-le ! | Désigné (16 % → palier 20 %) soigné à 100 % | Désigné toujours blessé (reste désigné) |
| Prendre sa place | Fin du tour sur la case marquée (ennemi le plus éloigné) | Fin du tour ailleurs. Au T7, la Mama sur 152 peut être marquée (`mamaCountsFromTurn` 7 ; pas avec 8) |
| Faire le mur | 3 ennemis distincts prennent des dommages de collision | 2 ennemis (dont un deux fois) + des dommages ordinaires |
| Pas le temps | Ennemi à PV pleins au début du tour, tué dans le tour | Ennemi blessé avant le début du tour |
| Distance d'insécurité | Chaque Artroolleur à ≤ 3 cases d'un joueur à la fin du tour | Un Artroolleur isolé |
| Attirance | 4 joueurs alignés au T8 | Un joueur hors des lignes |
| Trous dans les Troolls | 4 entrées distinctes | 3 ennemis distincts, dont un qui ressort et rentre |
| D'une pierre trois coups | 3 morts après le dernier lancer | 2 morts, un lancer, 1 mort |
| Tout va bien | Tous à plus de 50 % | Un joueur à 50 % pile |
| Solitude | Mama seule à la fin du T1 | Un Trooll vivant |
| Quintuplé | 3 + 2 morts au T3 par deux joueurs | 4 au T3 et 1 au T4 |
| Au coin ! | Tous les Troolls dans les pics à la fin du tour | Au T7, la Mama sur 152 compte |
| Même pas mal | Mitroollette de la Mama au T8 absorbée par Muraille collective | Sans bouclier |

## 3. Robustesse : 200 combats complets

**Joueurs.** Une IA aléatoire **légale** : déplacements tirés parmi les cases atteignables, lancers tirés parmi les
couples (sort, case) valides. En mode « agressif », elle vise un monstre dans 80 % des cas. Réponses aux choix tirées
au hasard, parfois sous forme de votes individuels.

**Monstres.** `simpleMonsterController` : le module `ai` (IA des monstres) n'existe pas encore. Certains lots
utilisent des monstres aléatoires ou passifs.

| Lot | Combats | Configuration | Issues |
|---|---|---|---|
| 1 | 50 | Défaut, A-D-D-M / A-A-D-M, IA simple | 50 défaites (au plus tard au T10) |
| 2 | 50 | Joueurs agressifs, cadeau à chaque tour | 50 défaites, 43 objectifs réalisés |
| 3 | 50 | Monstres aléatoires, configuration non standard n° 1 (a) | 43 limites de tours, 2 victoires, 5 défaites ; 50 arrivées de la Mama |
| 4 | 50 | Monstres passifs, 1 à 4 joueurs, configuration non standard n° 2 (b) | 50 limites de tours (T15), 78 objectifs, 50 arrivées de la Mama |

(a) `alternate_initiative`, `by_initiative`, `deadPlayersKeepSlot` faux, `uniform_slots` sans exclusion des cases
occupées, joueurs ×2 dans les pics et 2 000 au début du tour, `actsBeforeArrival`, `giftCancelsRassemblement`, double
Acclamation, 3 objectifs proposés, cadeaux pondérés, `canFinishFromTurn` 11, `turnLimit` 16.

(b) `monsters_after_mama`, `after_mama`, `most_frequent`, `maxCount` 5, `tier6Offered` faux, `solitudeBeforeArrival`
faux, `mamaCountsFromTurn` 8, `pushKillsCount` faux, `favourCap` 5, poussée avant attirance, cadeaux non déclenchés par
poussée, cartes « 2 uniques », sort appris grisé dans le tour, `turnLimit` 14.

**Invariants**, vérifiés après chaque action (≈ 23 500 actions) et à chaque point de décision :
- **Exécution.** Aucune exception ; aucun lancer ni déplacement valide refusé.
- **Positions.** Aucune entité hors de l'arène (sauf la Mama sur 152), aucune superposition, occupation des cases
  cohérente. Un mort est hors de la carte, à 0 PV.
- **Ressources.** PV dans ]0, PV max], PA / PM ≥ 0.
- **Pics.** 5902 (monstres) ou 5903 (joueurs) ⇔ présence dans les pics ; dans les pics ⇒ Vulnérable. 5971 seulement sur
  la Mama et aux T1–T6.
- **Mama.** Sur 152 avant le T8, arrivée dès son tour du T8. Cran de Faveur conforme au nombre d'objectifs.
- **Timeline.** Sans doublon, Mama en tête, tout combattant vivant présent, index cohérent avec le combattant courant.
- **Objectifs.** Paliers dans l'ordre, jamais datés du futur. Objectif actif du palier suivant, au plus `maxCount`.
- **Grimoire.** Sorts d'emplacement 0 à 1 + objectifs (joueur jamais mort).
- **Choix.** Toujours non vides, jamais pour un mort, toujours résolubles.
- **Cadeaux.** Cadeaux au sol = posés − ramassés, sur les 7 cases prévues.
- **Fin.** Victoire ⇒ plus d'ennemi et 5965 posé ; défaite ⇒ plus de joueur.

**Résultat : 0 violation.** Un auto-test (6 états corrompus à la main) vérifie que chaque famille d'invariants
signale bien une incohérence.

**Durée moyenne d'un combat simulé** (Node 22, journal désactivé, sans les contrôles d'invariants) :

| Scénario | ms / combat | tour moyen | ms / tour global |
|---|---|---|---|
| Joueurs aléatoires, IA simple | 21 | 6,4 | 3,3 |
| Joueurs aléatoires, monstres aléatoires (limite T30) | 82 | 21,9 | 3,7 |
| Monstres passifs jusqu'au T16 | 33 | 17,0 | 1,9 |

Le lot de 200 combats du test, contrôles compris, dure ≈ 6 s.

## 4. Hypothèses du scénario confirmées comme telles (non modifiées)

- **`after_mama`.** Les nouveaux monstres passent en tête de la sous-liste des monstres. Dans le modèle alterné, ils
  jouent donc juste après J1, pas avant lui (Q1 ne précise pas).
- **Timeline `explicit`.** L'ordre fourni n'est pas contrôlé : un combattant vivant absent ne joue pas.
- **Même pas mal.** La fenêtre s'ouvre après le Rassemblement ; l'ordre entre les deux buffs de début de tour de la
  Mama est inconnu. Les 2 000 d'entrée dans les pics dus au Rassemblement ne ferment donc pas la fenêtre.
- **Mama au T7.** Son tour est passé par le scénario (`boss.actsBeforeArrival`), pas annulé par l'effet 140.
- **Prendre sa place.** Égalité de distance départagée par l'ordre des ids (Q34 : « ordre client »).
- **Faire le mur.** L'entité percutée par une collision compte aussi : la collision du moteur lui inflige des dommages
  de poussée.
- **Cadeaux.** La probabilité est tirée avant la case ; l'hypothèse « case tirée parmi 7, abandon si occupée » (Q14)
  n'est pas implémentée.
