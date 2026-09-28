# Questions ouvertes — priorisées par impact sur la fidélité du simulateur

> Rédigé le 2026-09-28. Compagnon de `research/ETUDE_GLADIATROOL.md` (§11) et de `research/SPEC_DONNEES_SIMULATEUR.md`
> (les noms de paramètres ci-dessous sont ceux de la section `config` de la spécification).
> Clés de citation : voir l'en-tête de l'étude (`DB sl<id>`, `DPLN`, `VOD`, `N20`, `N30`, `N40`, `N70`…).

## Comment lire ce document

| Priorité | Sens |
|---|---|
| **P0** | Change la structure de la boucle de combat ou l'issue des combats simulés ; à trancher avant de faire confiance aux comparaisons de compositions. |
| **P1** | Change sensiblement les dégâts, la survie ou les décisions du planificateur. |
| **P2** | Effet local (un sort, un objectif, un cas limite). |
| **P3** | Marginal ou cosmétique ; paramètre exposé par prudence. |

Pour chaque question : **constat** (ce qu'on sait et d'où), **hypothèse par défaut** retenue par le simulateur, **vérification**
(en jeu, sur la VOD déjà téléchargée, ou dans une autre source), **paramètre** exposé (nom, valeur par défaut, alternatives).

Deux outils de vérification reviennent souvent :

- **La VOD Twitch 2852548819** (11 combats complets, version 3.6), déjà découpée en segments 1080p/480p par l'agent carte
  (scripts dans `research/raw/vision/scripts/`, images dans le scratchpad) : beaucoup de questions se tranchent en y lisant
  des chiffres de dégâts ou la timeline, **sans accès au jeu**.
- **Les plages de dégâts qui ne se recouvrent pas** : pour plusieurs questions, un seul relevé suffit parce que la plage
  « hypothèse A » et la plage « hypothèse B » sont disjointes (valeurs calculées avec `tools/mechanics/damage.py`).

---

## Tableau récapitulatif

| # | Prio | Question | Défaut | Paramètre |
|---|---|---|---|---|
| Q1 | P0 | Ordre de la timeline (joueurs / Troolls / nouvelles vagues) | alternance des équipes, Mama en tête, Troolls par ordre d'apparition | `timeline.model` |
| Q2 | P0 | IA des monstres (cibles, déplacement, tours passés) | politique `D:mon.aiModel` | `ai.*` |
| Q3 | P0 | Un joueur dans les pics subit-il ×2 ? | non (données) | `spikes.playersDoubledInside` |
| Q4 | P0 | Dégâts de début de tour dans les pics pour un joueur | 1 000 | `spikes.playerTurnStartDamage` |
| Q5 | P0 | Loi de tirage des cases d'apparition V2–V10 | tirage pondéré par les observations | `spawn.mode` |
| Q6 | P0 | Déclenchement de l'aura : traversée, déplacement interne, interruption | 1 déclenchement par entrée ; pas de nouveau déclenchement à l'intérieur | `spikes.triggerWhenWalkingThrough`, `spikes.retriggerOnMoveInside` |
| Q7 | P1 | Cumul ×4 à la ré-entrée | oui | `spikes.stackExitAndInside` |
| Q8 | P1 | Durée exacte du ×2 de sortie | jusqu'au début du prochain tour du porteur | `spikes.exitVulnerabilityTurns` |
| Q9 | P1 | Case de repli de la Mama | 300 → 287 → case libre la plus proche | `boss.arrivalFallback` |
| Q10 | P1 | Rassemblement : Inébranlable, ordre, bug du cadeau | Pugnace bloque ; attirer puis pousser ; pas de bug | `boss.rassemblement*`, `boss.giftCancelsRassemblement` |
| Q11 | P1 | Invulnérabilité de la Mama : ordre à l'entrée et au début de son tour | levée avant les 2 000 ; revenue avant les 1 000 | `boss.invulnerability*` |
| Q12 | P1 | Contenu et tirage des votes d'objectifs ; palier 6 | 2 objectifs tirés parmi les 4 du palier ; palier 6 proposé | `objectives.*` |
| Q13 | P1 | Contenu et tirage des Acclamations | 3 cartes distinctes, uniformes | `bonuses.*` |
| Q14 | P1 | Cadeaux : probabilité, case, contenu | p = 0,72, case uniforme parmi les 7 libres, 2 cartes | `gifts.*` |
| Q15 | P1 | Sort appris / amélioré en cours de tour : utilisable aussitôt ? | oui | `spells.newSpellUsableSameTurn`, `gifts.upgradedSpellGreyedUntilNextTurn` |
| Q16 | P1 | Pense Vite : nombre d'actions réellement jouables | 3 lancers | `spells.penseVite.maxCasts` |
| Q17 | P1 | Relâchement de Fureur : départ de la croissance | +25 aux 4 débuts de tour qui suivent l'obtention | `spells.relachementGrowthStart` |
| Q18 | P1 | Attribution des morts (pics, poussée) pour les objectifs de kills | poussée : oui ; pics : non | `objectives.pushKillsCount`, `objectives.glyphKillsCreditPlayer` |
| Q19 | P1 | Moment où la victoire devient possible | après l'apparition de V10 | `victory.canFinishFromTurn` |
| Q20 | P1 | PV des archétypes (passif 30639) | 30 000 pour tous | `archetypes.hpMode` |
| Q21 | P1 | Mama au T7 | aucune action | `boss.actsBeforeArrival` |
| Q22 | P2 | Tirage du jet de dégâts | uniforme | `rng.rollMode` |
| Q23 | P2 | Double application des Acclamations | non | `bonuses.doubleApplication` |
| Q24 | P2 | Catastrooll : durée du +20 % DF | reste du tour de la Mama | `boss.catastroollBonusScope` |
| Q25 | P2 | Niveau de la Mama pour les collisions | 1 000 (133/case) | `boss.levelForPushDamage` |
| Q26 | P2 | Voltige améliorée : 2 ou 3 lancers | 2 | `spells.voltigeUpgradedMaxPerTurn` |
| Q27 | P2 | Grondement amélioré : bonus de relance perdu ? | perdu | `spells.ggUpgradedKeepsRecastBonus` |
| Q28 | P2 | Amélioration de Jaillissement cassée ? | non (niveau 80760) | `spells.jaillissementUpgradeBroken` |
| Q29 | P2 | Malédictions (Collatérale, Régénérante), Pulsation Chaotique, Chamboulement | voir détail | `spells.*` |
| Q30 | P2 | Poutch : durée de vie | illimitée | `spells.poutchLifetimeTurns` |
| Q31 | P2 | Protection Prolongée sur soi, Immortalité du Bienfaiteur, Ultime Espoir, Délivrance | voir détail | `spells.*` |
| Q32 | P2 | Coup de Sang : érosion ; Impact critique et Poutch | non / non | `spells.*` |
| Q33 | P2 | Sous-sorts exécutés : conditions de lancer ignorées ? | oui | `engine.subSpellsIgnoreCastConditions` |
| Q34 | P2 | Objectifs : Solitude avant T8, Au coin ! au T7, seuils V/v | voir détail | `objectives.*` |
| Q35 | P2 | Faveur de la Mama : 6e objectif à 95 % ? | oui | `boss.favourCap` |
| Q36 | P3 | Masques DOFUS 3 `Atq`/`Def`/`Sce`, jetons `CAP`, `XPD`, `TR#` | lecture actuelle | — (documentaire) |
| Q37 | P3 | Monstres ciblant leurs alliés (masques `a,A`) | non | `ai.monstersCanTargetAllies` |
| Q38 | P3 | Niveau utilisé pour la poussée des archétypes | 200 | `engine.pushLevelForArchetypes` |
| Q39 | P3 | Obstacles dynamiques | aucun | `map.dynamicObstacles` |
| Q40 | P3 | Ordre d'entrée des membres d'un groupe (initiative) | ordre libre donné par l'utilisateur | `timeline.playerOrder` |

---

## P0 — à trancher en premier

### Q1. Ordre de la timeline

- **Constat.** La Mama joue la première de chaque tour global (DPLN VI ; VOD : arrivée au début du tour global) [R]. Les
  joueurs jouent dans l'ordre d'entrée dans le combat (correctif officiel du 14/01/2025) [R officiel]. La place des Troolls
  n'est documentée nulle part ; la consigne unanime « tuer le Trooll qui joue juste après soi » (cardxc 06:30, Koza 04:30,
  Khytrayer 04:28, Huz 09:00) implique qu'ils sont **intercalés** entre les joueurs. Jusqu'à la 3.1, les monstres des vagues
  n'apparaissaient pas dans la timeline ; le contournement « afficher les invocations » laisse penser qu'ils sont gérés comme
  des invocations du scénario [R, N50 §5]. Rien dans les données client (timeline envoyée par le serveur, N70 §7.1).
- **Pourquoi c'est P0.** Tout le jeu tourne autour de « mettre en pics / tuer **avant qu'il joue** ». Si les Troolls jouaient
  tous d'affilée juste après la Mama, l'Acrobate joué en premier ne servirait à rien ; les comparaisons A-D-D-M / A-A-D-M en
  dépendent directement.
- **Défaut.** Règle DOFUS d'alternance des équipes, l'équipe monstre en tête (Mama) : Mama, J1, M1, J2, M2, J3, M3, J4, M4,
  M5… ; les Troolls triés par **ordre d'apparition** (vague, puis ordre dans la vague) ; les nouveaux venus ajoutés à la fin
  de la sous-liste monstres ; quand une équipe est épuisée, l'autre termine. Un monstre mort libère sa place.
- **Vérification.**
  1. VOD 2852548819 : la timeline est affichée à l'écran ; relever image par image l'ordre des portraits au T1, puis après
     chaque apparition (T2…T10), et l'ordre réel des actions (quelle boule rouge agit après quel joueur).
  2. En jeu : activer « Afficher l'ordre de jeu sur les combattants » (Options > Général > Jeu > Combat, conseil de
     Koclikoo) et faire une capture au T1 et au début de chaque tour global.
- **Paramètres.** `timeline.model` ∈ {`alternate_spawn_order` (défaut), `alternate_initiative` (Troolls triés par Force :
  Troollibre > Nitrooll > Artroolleur), `monsters_after_mama` (tous les Troolls d'affilée après la Mama),
  `explicit` (liste fournie)} ; `timeline.newMonstersInsertion` ∈ {`append` (défaut), `after_mama`, `by_initiative`}.

### Q2. IA des monstres

- **Constat.** IA côté serveur, aucune donnée client [V absence]. Observations : les Troolls passent leur tour quand ils sont
  dans les pics ou que les joueurs sont loin (cardxc 12:30, 14:30 ; sspritenL ; Zephiron 11:00) ; Artroolleurs à distance ;
  Troollibres souvent Inébranlables dès T1 ; Nitrooll soigne ; la Mama peut concentrer tous ses sorts sur un joueur
  (−20 000 / −21 000). [R, moyenne]
- **Défaut.** Politique de `D:mon.aiModel` (N20 §9 ; résumé dans l'étude §5.8) : ne jamais entrer volontairement dans les
  pics ; si dans les pics sans sortie utile, ne pas bouger ; cible = ennemi atteignable ce tour qui maximise les dégâts, sinon
  le plus proche ; si rien n'est atteignable : avancer vers la cible la plus proche (ou passer, selon paramètre) ; ordres de
  sorts propres à chaque type.
- **Vérification.** VOD : pour chaque tour de monstre (≈ 300 tours de Trooll dans 11 combats), relever case de départ, case
  d'arrivée, sorts lancés (animations + chiffres), cible ; mesurer la fréquence des tours passés en fonction de la distance au
  joueur le plus proche et de la présence dans les pics ; en déduire le rayon d'engagement. Le mode créature empêche de lire
  le type : croiser avec l'attribution par emplacement (Q5) ou chercher une VOD en affichage normal.
- **Paramètres.** `ai.skipIfInSpikes` (true), `ai.skipIfNoTargetReachable` (true), `ai.engageRadius` (null = PM + PO max),
  `ai.focus` ∈ {`maxDamage` (défaut), `lowestHp`, `nearest`}, `ai.avoidSpikes` (true), `ai.moveBeforeCast` (true pour la
  mêlée), `ai.profiles.<monsterId>` (ordre de priorité des sorts), `ai.mama.focusSingleTarget` (true).

### Q3. Un joueur dans les pics subit-il ×2 ?

- **Constat.** Données : le « Dommages subis ×200 % » de l'aura (DB sl80492, effet 1163) ne vise que le masque `Def` ; les
  joueurs (`Atq`) reçoivent l'état Vulnérable **affiché** mais pas le multiplicateur ; ils sont ×2 seulement pendant 1 tour
  **après** leur sortie (30701) [V ; lecture `Atq`/`Def` = H forte]. DPLN (« les entités ») et Isthos 01:53 (« both to us and
  to the monsters ») disent ×2 pour tous [R]. Indice indirect en faveur des données : les −20 000 / −21 000 de la Mama sur un
  joueur poussé dans les pics à son arrivée concordent avec ×1 (≈ 18 900 + 2 000), pas avec ×2 (≈ 39 800).
- **Défaut.** ×1 (`false`).
- **Vérification (un relevé suffit, plages disjointes).** Un joueur reste dans les pics et se fait frapper :
  - Tir d'Artroollerie : ×1 → **1 736–2 387** (normal et critique) ; ×2 → **3 472–4 774** ;
  - Aspiratrooll : ×1 → 2 665–3 690 ; ×2 → 5 330–7 380 ;
  - Mitroollette (centre, hors Faveur) : ×1 → 4 278–5 934 ; ×2 → 8 556–11 868 (appliquer ensuite le % de Faveur).
  Sur la VOD : chercher les chiffres rouges sur un joueur resté dans les pics (typiquement après le Rassemblement du T8).
  Attention à ne pas confondre avec un joueur **sorti** des pics depuis moins d'un tour (lui est ×2 dans les deux hypothèses).
- **Paramètre.** `spikes.playersDoubledInside` (false ; true = lecture DPLN).

### Q4. Dégâts de début de tour dans les pics pour un joueur

- **Constat.** Glyphe de début de tour = **1 000** bruts pour les deux camps (DB sl81026) ; un monstre prend 2 000 (×2 d'aura)
  [V]. DPLN : 2 000 pour toute entité ; Houmilito 1:05:00 « j'ai pris 2 000 » (ambigu : peut être l'entrée) [R].
- **Défaut.** 1 000 (cohérent avec Q3 = ×1).
- **Vérification.** Laisser un joueur commencer son tour dans les pics et lire le chiffre (1 000 ou 2 000) ; sur la VOD,
  chercher un joueur resté dans les pics d'un tour à l'autre (après le T8).
- **Paramètre.** `spikes.playerTurnStartDamage` (1000 ; alternative 2000). À lier à Q3 : si Q3 = true, 2 000 découle
  automatiquement du ×2.

### Q5. Loi de tirage des cases d'apparition (V2–V10)

- **Constat.** Aucune donnée client [V absence]. VOD, 11 combats : V1 toujours 242/358 ; ensuite un petit ensemble de cases
  fixes par vague et par type, tirées au hasard (`D:annot.monsterSpawnCells`, `monsterSpawnModel`) [R·obs ; règle = H]. Les
  types ne sont pas lisibles (mode créature). Une seule source vidéo, un seul groupe, 4 joueurs.
- **Défaut.** Pour chaque vague, tirer chaque monstre dans la liste des candidats de **son type** (`slotsByType`) restreinte à
  la vague, avec des poids = nombre d'observations, sans remise et en excluant les cases occupées ; V1 fixe.
- **Vérification.** Analyser d'autres VOD (autres streamers, affichage normal pour lire les types) jusqu'à ≈ 30 combats ;
  tester si le tirage dépend de la position des joueurs ou du nombre de joueurs (VOD à 3 joueurs) ; vérifier que V2 place
  toujours un Artroolleur dans {187, 188} et un dans {411, 412}.
- **Paramètres.** `spawn.mode` ∈ {`weighted_observed` (défaut), `structured_slots` (règles de structure de N40 : une case par
  groupe), `most_frequent` (déterministe, pour les tests), `uniform_slots`} ; `spawn.seed` ; `spawn.excludeOccupied` (true).

### Q6. Déclenchement de l'aura des pics pendant les déplacements

- **Constat.** Aura 1091 : effets appliqués à l'**entrée**, retirés à la **sortie** (code client) [V]. Non vérifié : (a) un
  personnage qui **traverse** des cases de pics en marchant (entrée puis sortie dans le même déplacement) subit-il les 2 000 ?
  son déplacement est-il interrompu ? (b) une entité poussée **d'une case de pics à une autre** redéclenche-t-elle l'entrée
  (Huz 08:30 : « ça a croqué plusieurs fois ») ? (c) la poussée qui traverse l'anneau déclenche-t-elle l'aura seulement à
  l'arrivée ? L'ordre « poussée → aura → frappe » dans un même sort est, lui, établi par la VOD (−9 904 = 2 000 + 2 × 3 952).
- **Défaut.** (a) oui, 2 000 + Vulnérable, puis sortie (×2 de sortie) ; déplacement non interrompu ; (b) non ; (c) aura
  appliquée sur la case d'arrivée seulement ; aura appliquée **dès l'arrivée** au sein d'un sort.
- **Vérification.** En jeu : faire marcher un joueur à travers deux cases de pics et ressortir ; pousser un Trooll d'une case
  de profondeur 2 vers une case de profondeur 1 (Frappe Repoussoir) et lire les chiffres.
- **Paramètres.** `spikes.triggerWhenWalkingThrough` (true), `spikes.walkThroughInterruptsMovement` (false),
  `spikes.retriggerOnMoveInside` (false), `spikes.auraAppliesMidSpell` (true).

---

## P1 — importants

### Q7. Cumul ×4 à la ré-entrée

- **Constat.** Les 1163 se multiplient dans le client [V] ; un monstre sorti des pics (×2 pour 1 tour) puis ré-entré avant
  son tour aurait ×2 × ×2 = ×4, et les 2 000 de ré-entrée seraient doublés (4 000). Jamais observé [H, basse-moyenne].
- **Défaut.** true.
- **Vérification.** Sortir un Trooll des pics (le pousser vers l'intérieur depuis une case de pics, ou Voltige), le remettre
  dedans dans la même ronde, frapper avec Frappe Repoussoir : ×2 → 1 952–3 050 ; ×4 → **3 904–6 100** (disjoint).
- **Paramètre.** `spikes.stackExitAndInside` (true).

### Q8. Durée du ×2 de sortie

- **Constat.** 30701 posé par le porteur sur lui-même, durée 1 → jusqu'au début de son prochain tour (règle de décompte du
  client) [V client ; H serveur]. Cas particulier : sortie pendant **son propre** tour (le joueur qui marche hors des pics) →
  ×2 pendant tout le reste de la ronde ennemie, y compris la Mama au tour suivant (piège T7/T8).
- **Défaut.** Décompte au début du prochain tour du porteur.
- **Vérification.** Sur la VOD ou en jeu, compter les tours restants affichés sur l'icône Vulnérable (`displayTurnRemaining`)
  d'un joueur qui sort des pics pendant son tour, et vérifier qu'une frappe ennemie reçue avant son tour suivant est doublée
  (plages de Q3).
- **Paramètre.** `spikes.exitVulnerabilityTurns` (1), `spikes.durationCountdown` = `casterTurnStart`.

### Q9. Case de repli de la Mama

- **Constat.** Arrivée sur 300 (données + 5 combats) ; 287 dans 3 combats où 300 était occupée, et sur la capture DPLN
  [V + R·obs]. La règle n'est expliquée ni par l'ordre `getCells` du client ni par l'anneau 1 (N20 §4.1) [H].
- **Défaut.** 300, sinon 287, sinon case libre la plus proche de 300 sur l'axe x = 17 en remontant vers 152 (273, 260, …),
  sinon case libre la plus proche (distance, puis id).
- **Vérification.** En jeu : occuper volontairement 300 au T7, puis 300 et 287 ; sur la VOD, relire les combats 4:09, 4:48,
  5:10 (arrivée non déterminée).
- **Paramètre.** `boss.arrivalCell` (300), `boss.arrivalFallback` ([287, "axisTowardWaitCell", "nearestFree"]).

### Q10. Rassemblement Troollesque : détails

- **Constat.** À chaque début de tour de la Mama : croix X63 : attirer les Troolls (`g`) puis repousser les joueurs (`A`) de
  63 **sans dommages** (1103) [V, DB sl80935]. Inconnu : (a) Pugnace / Inébranlable bloque-t-il 1103 (non « forcée ») ? (b) un
  Troll attiré sert-il d'obstacle à un joueur poussé ensuite ? (c) le niveau 4 est exécuté une fois par entité alignée (1160
  sur chaque cible) : sans effet pratique, mais « Grabbed » se cumule ; (d) **bug rapporté** (cardxc 19:30, sspritenL) : un
  joueur poussé sur un cadeau annule l'animation et les dégâts de la Mama, qui passe son tour.
- **Défaut.** (a) oui ; (b) oui (ordre des effets) ; (c) une application ; (d) désactivé (bug).
- **Vérification.** En jeu : Pugnace lancé au T7 sur un Acrobate aligné avec 300 ; observer la poussée au T8.
- **Paramètres.** `boss.rassemblementBlockedByUnshakable` (true), `boss.rassemblementPullThenPush` (true),
  `boss.giftCancelsRassemblement` (false).

### Q11. Invulnérabilité de la Mama : ordre des événements

- **Constat.** L'état 5902 est le premier effet de l'entrée ; son `EON` désactive l'état 56 pendant 1 tour de la Mama
  [V]. Ordre fin non vérifié : (a) les 2 000 d'entrée sont-ils subis (invulnérabilité déjà levée) ? (b) au début de son tour
  suivant dans les pics, l'invulnérabilité revient-elle **avant** les 1 000 × 2 du glyphe ?
- **Défaut.** (a) oui ; (b) oui (décompte des buffs avant les glyphes de début de tour, ordre client supposé).
- **Vérification.** Sur la VOD ou en jeu : lire la barre de PV de la Mama au moment où elle entre dans les pics (−2 000 ?) et
  au début de son tour suivant si elle y est restée.
- **Paramètres.** `boss.invulnerabilityLiftedBeforeEntryDamage` (true), `boss.invulnerabilityBackBeforeTurnStartSpikes`
  (true).

### Q12. Votes d'objectifs

- **Constat.** Ids de vote 11–15 et paliers lus dans les données [V] ; contenu serveur. Vidéos : 2 objectifs proposés
  (Khytrayer 02:47, cardxc 04:00) ; majorité, égalité tirée au sort (GD 49:00) [R]. Zephiron n'a plus eu de proposition après
  Tout va bien (palier 5) alors que les données prévoient un palier 6 [R contre V].
- **Défaut.** À chaque vote, 2 objectifs tirés uniformément parmi les 4 du palier ; palier 6 proposé ; 6 objectifs au
  maximum ; le vote suit une politique du planificateur.
- **Vérification.** Relever sur plusieurs vidéos ou runs la paire proposée à chaque palier (≥ 30 votes) ; vérifier qu'un
  6e objectif est proposé après le 5e.
- **Paramètres.** `objectives.offerCount` (2), `objectives.offerDraw` (`uniform`), `objectives.maxCount` (6),
  `objectives.tier6Offered` (true), `objectives.votePolicy` (`planner`).

### Q13. Acclamations : tirage

- **Constat.** 6 cartes par archétype, valeurs exactes connues [V] ; 3 proposées du T2 au T9 (DPLN, VOD) [R] ; loi de tirage
  inconnue (uniforme ? avec ou sans remise d'une fenêtre à l'autre ? pondérée ?).
- **Défaut.** 3 cartes distinctes tirées uniformément parmi les 6, indépendamment à chaque fenêtre.
- **Vérification.** Relever les triplets proposés sur les vidéos (Huz 00:35, 04:30 ; Barbe Douce 11:04…) et sur la VOD
  (fenêtre « Choisis une amélioration permanente ! » visible à chaque début de tour).
- **Paramètres.** `bonuses.offerCount` (3), `bonuses.draw` (`uniform_distinct`), `bonuses.firstTurn` (2),
  `bonuses.lastTurn` (9), `bonuses.policy` (`planner` | `PO_first` | `PA_first` | `DF_first`).

### Q14. Cadeaux : apparition et contenu

- **Constat.** Cases 272, 273, 299, 301, 327, 328, 329 ; apparition au début de T2–T9 dans 63 cas sur 88 ; jamais 271 ni 300
  [R·obs]. Seuls les joueurs les déclenchent (masque `Atq,A`), y compris poussés dessus [V + R]. Contenu : 2 cartes (2 uniques,
  2 améliorations ou 1 + 1, DPLN) ; le pool exact (uniques de l'archétype + Pense Vite ; améliorations des sorts possédés non
  encore améliorés ?) et les probabilités sont serveur.
- **Défaut.** Probabilité d'apparition 0,72 par tour T2–T9 ; case uniforme parmi les 7 libres (non occupées, sans cadeau) ;
  2 cartes : type tiré uniformément parmi {2 uniques, 2 améliorations, 1 + 1} ; uniques tirés parmi ceux de l'archétype +
  Pense Vite non encore obtenus ; améliorations parmi les sorts possédés non améliorés.
- **Vérification.** VOD : vérifier si les tours sans cadeau correspondent à une case tirée occupée (tester l'hypothèse
  « case tirée parmi 7, abandon si occupée ») ; vidéos : relever les paires de cartes proposées.
- **Paramètres.** `gifts.spawnProbability` (0.72), `gifts.cells` (7 cases), `gifts.firstTurn` (2), `gifts.lastTurn` (9),
  `gifts.cellDraw` (`uniform_free`), `gifts.cardCount` (2), `gifts.cardMix` (1/3, 1/3, 1/3), `gifts.monstersTrigger` (false),
  `gifts.pushedPlayerTriggers` (true).

### Q15. Sort appris ou amélioré en cours de tour

- **Constat.** Un objectif validé pendant un tour donne aussitôt le sort suivant (Spell Manager) [V] ; l'utilisation dans le
  même tour est suggérée par les « Productivité au T1 » des vidéos [R, moyenne]. Bug rapporté : un sort amélioré ou obtenu
  par cadeau restait **grisé** jusqu'au tour suivant (Koza 07:30, sspritenL ; correctif partiel du 21/01/2025) [R].
- **Défaut.** Utilisable immédiatement dans les deux cas.
- **Vérification.** En jeu : valider Empalé avant le tour du Magicien au T1 et tenter Regain + 2 Pulsations.
- **Paramètres.** `spells.newSpellUsableSameTurn` (true), `gifts.upgradedSpellGreyedUntilNextTurn` (false).

### Q16. Pense Vite : actions effectives

- **Constat.** +999 PA au tour suivant, tour de **10 s** (DB sl80843) [V] ; en pratique ≈ 3 sorts (Houmilito 2:55:30) ou « 2/3
  des actions » (Huz 19:14) à cause des animations [R]. Les limites par tour/cible/intervalle restent actives.
- **Défaut.** 3 lancers au plus au tour qui suit ; PA illimités dans cette limite.
- **Vérification.** Chronométrer les animations des sorts du Dompteur sur la VOD ou en jeu (option « désactiver les animations »
  signalée par un commentaire).
- **Paramètre.** `spells.penseVite.maxCasts` (3 ; plage 2–6), `spells.penseVite.turnSeconds` (10).

### Q17. Relâchement de Fureur : départ de la croissance

- **Constat.** Buff 30624 : +25 de base à chaque début de tour (`TB`), 4 fois au plus (+100) ; aucun sort des données ne le
  lance : il est posé par le serveur quand le sort est obtenu [V + H forte].
- **Défaut.** +25 aux 4 débuts de tour du porteur qui suivent l'obtention (obtenu au T4 → +100 au T8).
- **Vérification.** Lire l'infobulle du sort d'un tour à l'autre après l'avoir obtenu (VOD, vidéos : cardxc 20:00 lit
  « 187 à 200… »).
- **Paramètre.** `spells.relachementGrowthStart` (`nextTurnStartAfterObtain` | `immediate`), `spells.relachementMaxStacks` (4).

### Q18. Attribution des morts pour les objectifs

- **Constat.** Le déclencheur `X` s'active pour toute mort (client) [V] ; une mort par entrée dans les pics est attribuée au
  poseur du glyphe (entité de scénario) [H] ; un joueur rapporte que les morts par poussée ne comptent pas pour Meurtres en
  série (sspritenL) [R, basse]. Empalé et D'une pierre trois coups ne dépendent pas du tueur [V].
- **Défaut.** Mort par dommages de poussée attribuée au lanceur de la poussée ; mort par dégâts de pics (entrée ou début de
  tour) non attribuée à un joueur.
- **Vérification.** Objectif Meurtres en série actif : tuer un Trooll par collision puis un autre par un sort, le même tour.
- **Paramètres.** `objectives.pushKillsCount` (true), `objectives.glyphKillsCreditPlayer` (false).

### Q19. Moment où la victoire devient possible

- **Constat.** Victoire = plus d'ennemis **et** état 5965 posé par 30577 (DB sl80790) [V] ; moment du lancement de 30577 non
  documenté ; GD : « vous pouvez gagner tour 10 ou 11 » [R].
- **Défaut.** 30577 lancé à l'apparition de V10 (début de T10) : victoire au plus tôt pendant T10.
- **Vérification.** Sur la VOD, noter le tour de fin de chaque combat gagné et l'instant où le dernier ennemi meurt.
- **Paramètres.** `victory.canFinishFromTurn` (10), `victory.turnLimit` (null).

### Q20. PV des archétypes

- **Constat.** Passif 30639 : +5 000 Vitalité (Acrobate), −5 000 (Magicien), +3 000 Puissance (Dompteur) sous condition
  d'état [V] ; ×61 prouvé pour le Dompteur (VOD) et 30 000 PV pour un Acrobate transformé (capture DPLN) → bonus non appliqués
  [R·obs] ; aucune source ne montre un Magicien transformé.
- **Défaut.** 30 000 PV pour tous, Puissance 0.
- **Vérification.** Lire la barre de PV d'un Magicien au T1 (VOD : infobulles des joueurs « Snneakkyy » affichent 30 000 / 30 000
  ; vérifier leur archétype).
- **Paramètres.** `archetypes.hpMode` (`flat30000` | `passiveApplies`), `archetypes.dompteurPower` (0 | 3000).

### Q21. La Mama agit-elle au T7 ?

- **Constat.** Décompte client : le « Tour annulé » (durée 6) expire au début de son T7, le délai d'arrivée (7) tombe au T8
  [V + H]. Au T7 elle serait donc active sur 152, sans ligne de vue ; seul Catastrooll (PO 0, étoile 6) pourrait agir (attirer
  un joueur placé sur 233 ou 219 vers les pics 206/192). Rien de tel n'a été observé [R·obs].
- **Défaut.** Aucune action avant l'arrivée.
- **Vérification.** VOD : vérifier l'absence d'animation de la Mama au T7 ; en jeu, laisser un joueur sur 233 au T7.
- **Paramètre.** `boss.actsBeforeArrival` (false).

---

## P2 — effets locaux

### Q22. Tirage du jet de dégâts

- **Constat.** L'aperçu client arrondit `min + r(max − min) + 0,5` (bornes sous-pondérées) ; le serveur est supposé uniforme
  [V client ; H serveur].
- **Défaut.** Uniforme entier dans [min, max].
- **Vérification.** Histogramme de ≥ 200 relevés d'un même sort (VOD).
- **Paramètre.** `rng.rollMode` (`uniform` | `clientPreview`), `rng.seed`.

### Q23. Double application des Acclamations

- **Constat.** La carte applique le bonus **et** lance l'accumulateur qui applique le même bonus ; aucune vidéo ne montre +2 PA
  pour une carte [V + R].
- **Défaut.** Simple.
- **Vérification.** Prendre +1 PA et lire les PA au tour suivant.
- **Paramètre.** `bonuses.doubleApplication` (false).

### Q24. Catastrooll : durée du +20 % DF

- **Constat.** Effet 1171 de durée 0 (DB sl80498) [V] ; sens exact d'une durée 0 non établi.
- **Défaut.** Reste du tour de la Mama.
- **Vérification.** Comparer les dégâts de la Mama avant et après Catastrooll dans le même tour (+20 %).
- **Paramètre.** `boss.catastroollBonusScope` (`restOfTurn` | `nextCastOnly` | `none`).

### Q25. Niveau de la Mama pour les collisions

- **Constat.** Niveau 1000 (données, GD) mais « Niv. 200 » sur la fiche en jeu [V contre R]. Seul effet : collision
  d'Uppertrooll = 133 ou 33 par case restante.
- **Défaut.** 1 000.
- **Vérification.** Relever un Uppertrooll qui envoie un joueur contre un obstacle.
- **Paramètre.** `boss.levelForPushDamage` (1000 | 200).

### Q26. Voltige améliorée : lancers par tour

- **Constat.** Données 2 (DB sl80775) ; DPLN et description de l'amélioration : 3 [V contre R].
- **Défaut.** 2.
- **Vérification.** En jeu, après l'amélioration.
- **Paramètre.** `spells.voltigeUpgradedMaxPerTurn` (2 | 3).

### Q27. Grondement Grandissant amélioré : bonus de relance

- **Constat.** 30560 commence par un effet 406 qui retire les buffs du sort au lanceur (dont le +20 de relance) avant la frappe
  (client : retrait sans condition) [V + H].
- **Défaut.** Bonus perdu.
- **Vérification.** Relancer GG amélioré à T+2 sur une cible au centre : 5 002–5 612 (perdu) contre 6 222–6 832 (conservé),
  hors critique.
- **Paramètre.** `spells.ggUpgradedKeepsRecastBonus` (false).

### Q28. Amélioration de Jaillissement

- **Constat.** 30475 apprend le niveau 80750, **inexistant** (404) ; le sort amélioré 30564 a le niveau 80760 [V]. Soit
  coquille des données (le serveur a peut-être la bonne valeur), soit amélioration cassée (désapprend sans rien donner).
- **Défaut.** Fonctionne (niveau 80760).
- **Vérification.** Choisir l'amélioration en jeu.
- **Paramètre.** `spells.jaillissementUpgradeBroken` (false).

### Q29. Sorts à comportement ambigu

| Sort | Question | Défaut | Paramètre |
|---|---|---|---|
| Malédiction Collatérale (30613) | les renvois se propagent-ils en chaîne ? le porteur est-il touché (masque `a` de 30670) ? | chaînes oui, porteur non | `spells.maledictionCollateraleChains` (true), `spells.maledictionCollateraleHitsCarrier` (false) |
| Malédiction Régénérante (30621) | 100 % (données) ou 50 % (description, DPLN) ; alliés à ≤ 2 cases (données) ou tous (DPLN) ; dégressivité ? | 100 %, C2, sans dégressivité | `spells.maledictionRegenerantePercent` (100), `spells.maledictionRegeneranteZone` (`C2`) |
| Pulsation Chaotique (30612) | rebonds limités par la PO 1–5 et la LdV du sous-sort 30667 ? égalités de distance ? | sans limite ; égalité : ordre des directions puis id (client) | `spells.pulsationChaotiqueBounceRange` (null) |
| Chamboulement (30618) | rebond vers l'ennemi le plus proche ? poussée depuis le monstre heurté ? | oui / oui | `spells.chamboulementBounceTarget` (`nearest`) |
| Malédiction Mouvante (30617) | les 2 000 d'entrée dans les pics redéclenchent-ils une poussée ? | non (dommages de glyphe sans attaquant joueur) | `spells.maledictionMouvanteOnGlyphDamage` (false) |

Vérification : vidéos (Huz, Khytrayer, cardxc utilisent Pulsation et Punition en fin de combat) ou tests en jeu.

### Q30. Durée de vie du Poutch

- **Constat.** Effet 181 de durée 1 et sort 30420 « Mort » (tue le porteur de 6027 au début de son tour) jamais référencé [V] ;
  aucune observation.
- **Défaut.** Illimitée.
- **Paramètre.** `spells.poutchLifetimeTurns` (null | 1).

### Q31. Soins et protections du Magicien

| Point | Défaut | Paramètre |
|---|---|---|
| Protection Prolongée lancée sur soi : 1 ou 2 soins de début de tour (décompte avant déclenchement) | 1 | `spells.protectionProlongeeSelfHeals` (1) |
| Immortalité du Bienfaiteur : dégâts au-delà du seuil perdus ; sens de `TR30620` | perdus ; se déclenche au seuil | `spells.bienfaiteurOverflowLost` (true) |
| Ultime Espoir : case de réapparition | case de mort si libre, sinon case libre la plus proche | `spells.ultimeEspoirRespawnCell` (`deathCellOrNearest`) |
| Délivrance « ne fonctionne dans aucun cas » (Willseir, 2024) | fonctionne (désenvoûte `dispellable = 1`) | `spells.delivranceWorks` (true) |

### Q32. Détails du Dompteur

- Coup de Sang : le malus de PV (1048) crée-t-il de l'érosion (PV érodés pour Jaillissement) ? Défaut non
  (`spells.coupDeSangCreatesErosion` false).
- Impact critique : masque `A,J` (J majuscule) → touche-t-il le Poutch allié ? Défaut non (`spells.impactCritHitsPoutch` false).
- Vérification : en jeu uniquement ; faible enjeu.

### Q33. Sous-sorts exécutés et conditions de lancer

- **Constat.** Un sous-sort exécuté (1160, 792…) ignore a priori PA, PO et LdV (ex. 30693 d'Hanedimane affiche PO 1–6 et LdV,
  mais s'applique à toute la fourche) [H moyenne, cohérent avec les vidéos].
- **Défaut.** Conditions ignorées.
- **Paramètre.** `engine.subSpellsIgnoreCastConditions` (true).

### Q34. Objectifs : cas limites

| Point | Défaut | Paramètre |
|---|---|---|
| Solitude validable **avant T8** (la Mama sur 152 compte comme « vivante sans allié ») | oui | `objectives.solitudeBeforeArrival` (true) |
| Au coin ! bloqué au T7 (la Mama sur 152 n'est plus « pré-combat ») | oui | `objectives.mamaCountsFromTurn` (7) |
| Seuils `V#` (≤) et `v#` (>) ; `v100` interprété « PV pleins » (≥ 100 %) | client + `v100` = pleins | `objectives.v100MeansFull` (true) |
| « Tout le monde veut prendre sa place » : ennemi le plus éloigné ; égalités | ordre client (directions puis id) | — |
| Tout va bien : strictement plus de 50 % | oui | — |

### Q35. Faveur de la Mama au 6e objectif

- **Constat.** −5 % par objectif sans condition, 6 objectifs possibles → 95 % [V + H] ; DPLN : « cumulable 5 fois ».
- **Défaut.** 95 % au 6e objectif.
- **Paramètre.** `boss.favourCap` (null | 5).

---

## P3 — marginal

- **Q36. Masques et jetons DOFUS 3.** `Atq` = joueurs, `Def` = monstres (H forte) ; `Sce` = entité de scénario neutre (H
  moyenne) ; `CAP` = « le porteur lance un sort » (H forte) ; `XPD` = mort par poussée (H) ; `TR#` = déclenché par le sort #
  (H). Documentaire : les objectifs et les pics sont codés dans le simulateur à partir de ces lectures. Vérification : aucune
  source publique ; la cohérence des objectifs avec les textes en jeu suffit.
- **Q37. Monstres ciblant leurs alliés** (masques `a,A` d'Aspiratrooll, Tir, Double Trooll, Catastrooll) : défaut non
  (`ai.monstersCanTargetAllies` false). Catastrooll attire tout le monde (`a,A`) et reste modélisé ainsi.
- **Q38. Niveau pour la poussée des archétypes** : 200 (monstre 7980) ou niveau réel (≥ 50) : écart ≤ 7 % (283 contre 264 par
  case) ; défaut 200 (`engine.pushLevelForArchetypes`).
- **Q39. Obstacles dynamiques** : aucun observé, non implémentés selon les GD ; défaut aucun (`map.dynamicObstacles` false).
- **Q40. Ordre des joueurs** : ordre d'entrée (correctif officiel) ; les groupes semblent entrer en ordre inverse de
  l'affichage (DPLN, Khytrayer). Le simulateur prend l'ordre en entrée (`timeline.playerOrder`, défaut
  `["Acrobate", "Dompteur", "Dompteur", "Magicien"]`).
- Liste du glyphe asymétrique (250, 293, 321, 362 non marchables listés, 238/280/308/350 absents) : sans effet tant que ces cases
  restent non marchables ; aucun paramètre.

---

## Protocoles de vérification groupés

### A. Sans accès au jeu : exploitation complémentaire de la VOD 2852548819

1. Timeline (Q1) : ordre des portraits et des actions à chaque tour.
2. IA (Q2) : trajectoires et sorts de chaque Trooll ; taux de tours passés.
3. ×2 des joueurs dans les pics et 1 000 / 2 000 au début de tour (Q3, Q4) : chiffres sur les joueurs restés dans les pics
   après le T8 (plages disjointes ci-dessus).
4. Repli de la Mama (Q9), invulnérabilité (Q11), fin de combat (Q19), cadeaux et cases occupées (Q14), triplets
   d'Acclamations (Q13).
5. Histogramme des jets (Q22).

### B. En jeu, une session de 4 comptes (≈ 3 combats)

1. Pics : marcher à travers 2 cases de pics (Q6) ; commencer un tour dedans (Q4) ; se faire frapper dedans (Q3).
2. Ré-entrée d'un Trooll (Q7) ; poussée case de pics → case de pics (Q6).
3. T1 : valider Empalé avant le Magicien, tenter Regain + 2 Pulsations (Q15) ; prendre +1 PA et compter (Q23).
4. T7 : Pugnace sur un Acrobate aligné avec 300 (Q10) ; occuper 300 et 287 (Q9) ; un joueur sur 233 (Q21).
5. Objectifs : noter les paires proposées à chaque vote et l'existence d'un 6e vote (Q12).
6. Améliorations disponibles : Voltige (Q26), Grondement (Q27), Jaillissement (Q28) si elles sortent.
