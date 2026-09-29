# Boucle d'amélioration du planificateur

Mesure de référence : `npm run cli -- bench` (ADDM et AADM, graines 1-24, mode fast, déterministe, `maxTurn` 20).
Mesures complémentaires (moins de bruit) : `npm run cli -- comparer --variantes v.json --graines 1-96` avec des
variantes de poids (`planner.weights`). « Progression » = fraction moyenne des PV ennemis détruits.

Règle suivie : seul le jeu des joueurs change (évaluation, génération d'actions) ; ni le moteur, ni les données, ni
l'IA des monstres ne sont modifiés.

## Tour 1

### Mesures

| | Victoires | Progression | ADDM | AADM |
|---|---|---|---|---|
| AVANT (bench 1-24) | 40 / 48 = **0,833** | **0,974** | 21/24 (0,959) | 19/24 (0,989) |
| APRÈS (bench 1-24) | 45 / 48 = **0,938** | **0,978** | 22/24 (0,962) | 23/24 (0,994) |
| APRÈS (graines 1-96) | 187 / 192 = 0,974 | 0,991 | 92/96 (0,983) | 95/96 (0,998) |

Durée du bench : 32 s → 25 s (les combats se terminent plus tôt : tour moyen 12,7 → 11,2).

### Diagnostic (combats perdus analysés : AADM 1, ADDM 20, ADDM 15, AADM 19, AADM 93, ADDM 84)

1. **Mama coincée dans les pics (6 des 8 échecs du bench initial)** — AADM 1, 10, 13, 15, 18, ADDM 19 : arrêt au T21,
   Mama à 10 000-20 000 PV, aucun mort. Après sa fenêtre, la Mama reste sur une case de pics de l'anneau extérieur
   (221, 376, 184…) : invulnérable, elle ne peut plus être blessée tant qu'elle n'en sort pas puis n'y ré-entre (pas
   de nouvel `EON5902`, ÉTUDE §6.6). Les joueurs passaient leurs tours (« Aucune action utile ») pendant 8 à 10 tours.
   Cause : (a) l'évaluation ne distinguait pas « Mama dans les pics, invulnérable » de « Mama dans les pics » : la
   sortir n'avait aucune valeur immédiate, donc le premier coup de la suite « la sortir puis l'y remettre » n'était
   jamais gardé par le faisceau ; (b) l'estimation a priori ne récompensait une poussée / attirance que vers les
   pics, si bien que Soutien Stratégique (attirance) sur la Mama n'entrait même pas dans les 40 candidats ; (c) les
   échanges (Voltige) avec un ennemi n'étaient générés que depuis la case de départ. Pourtant la suite existe presque
   toujours : Soutien Stratégique (attirance 4) puis Videur, Hanedimane, ou Voltige depuis une case proche puis
   poussée par l'Acrobate suivant (vérifié par recherche exhaustive à 2 lancers sur les états des combats perdus).
2. **Effondrement au T5-T7 (ADDM 15, 20, 76, 84 ; AADM 19)** : un premier joueur meurt, puis le reste de l'équipe.
   Facteurs observés : un Acrobate pousse un allié dans les pics pour y mettre un Trooll (ADDM 20 : le Dompteur sort
   ensuite Vulnérable et prend 12 800 + 6 200) ; Voltige depuis les pics répétée par un Acrobate déjà blessé (AADM
   19 : Vulnérable jusqu'à son tour, tué par la Mama au T10) ; joueurs dispersés, Magicien qui ne soigne pas le plus
   bas. L'anticipation ne va que jusqu'au prochain joueur : le coût d'un joueur Vulnérable au tour global suivant (la
   Mama joue en premier) est mal vu.
3. **Cadeaux surévalués** (ADDM 15, T3) : l'Acrobate préfère aller chercher un cadeau (5 000 + ≈ 24 000 de sorts
   uniques « gardés ») plutôt que mettre deux monstres dans les pics (≈ 17 000), alors que le cadeau **persiste**
   (ÉTUDE §8.1) et peut être pris plus tard.
4. Fenêtre T8 parfois sous-exploitée en AADM (≈ 50 000 dégâts au lieu de 140 000 : Magicien qui soigne, Démotivation
   sans effet), conforme à l'ÉTUDE §6.9 (A-A-D-M tue plutôt au T9) : la réouverture des fenêtres (point 1) compense.

### Changements

| Changement | Fichiers | Effet mesuré |
|---|---|---|
| Terme `mamaStuck` (10 000) : pénalité si la Mama arrivée est dans les pics **et invulnérable** ; levée dès qu'on l'en sort | `planner/evaluate.ts`, `planner/weights.ts` | cause 1 corrigée |
| Estimation a priori : poussée / attirance qui sort la Mama coincée (+`mamaStuck`), échange avec elle (+½) | `planner/actions.ts` | idem (le premier coup entre dans les candidats) |
| Échange (Voltige) avec la Mama coincée depuis toutes les cases atteignables (pas seulement la case de départ) | `planner/actions.ts` | AADM 93 (graines 1-96) : arrêt au T21 → victoire |
| Valeur d'un cadeau encore sur la carte (`giftOnMapFactor`, `giftUniqueEstimate`, `giftUniqueUntilTurn`) | `planner/evaluate.ts`, `planner/weights.ts` | **gardé désactivé** (`giftOnMapFactor` 0) : 0,6 → 183/192 contre 186/192 sans (graines 1-96), 0,4 → 91/96 contre 93/96 (1-48) |

Détail des mesures intermédiaires (graines 1-24, puis 1-96) :

| Variante | 1-24 | 1-96 |
|---|---|---|
| avant | 40/48 | — |
| + `mamaStuck` (évaluation et a priori) | 45/48 | 186/192 (cadeaux 0) |
| + échanges depuis toute case (retenu) | 45/48 | **187/192** |
| `playerDeath` 100 000 / 120 000 | 46/48 (120 000) | 186/192 (100 000) |
| `playerInSpikes` 6 000 / 8 000 | 44/48 (8 000) | 186/192 (6 000) |
| `threatWeight` 1,0 | 43/48 | — |
| `deathRiskWeight` 0,8 + `playerDeath` 100 000 | 46/48 | — |

Les variantes de poids de survie (point 2) restent dans le bruit (± 2 combats sur 192) : non retenues.

Tests ajoutés : `sim/test/planner.mama.test.ts` (Mama coincée au T15 : pénalité levée à la sortie ; l'Acrobate la
sort puis l'y remet dans le même tour, fenêtre rouverte, PV entamés). Typecheck OK, 769 tests verts.

### Pistes pour le tour suivant

- Survie (point 2) : coût du Vulnérable de sortie des pics sur **le tour global suivant** (la Mama joue en premier),
  interdire (ou pénaliser fortement) la poussée d'un allié dans les pics, soins prioritaires du joueur le plus menacé.
  À mesurer sur ≥ 192 combats : les écarts actuels sont de l'ordre du bruit.
- Budget du T8 (ÉTUDE §6.9) : garder Relâchement / Amplification / Regain pour la fenêtre, Démotivation seulement après
  l'entrée ; en AADM, préparer la ré-entrée au T9.

## Tour 2

### Mesures

| | Victoires | Progression | ADDM | AADM | Durée |
|---|---|---|---|---|---|
| AVANT (bench 1-24) | 45 / 48 = **0,938** | **0,978** | 22/24 (0,962) | 23/24 (0,994) | 25,5 s |
| APRÈS (bench 1-24) | 48 / 48 = **1,000** | **1,000** | 24/24 (1,000) | 24/24 (1,000) | 41,9 s |
| AVANT (graines 1-384) | 750 / 768 = 0,977 | ≈ 0,995 | 371/384 | 379/384 | 160 s (1-192) |
| APRÈS (graines 1-384) | 758 / 768 = **0,987** | **0,997** | 376/384 (0,996) | 382/384 (0,998) | 538 s |

Le bench (24 graines) ne voit plus que du bruit : 3 échecs avant, 0 après. La mesure qui compte est celle des 768
combats (graines 1-384, mêmes graines, déterministe) : 18 échecs → 10. Coût : ≈ 1,9 × plus lent (≈ 2,8 s par combat).

### Diagnostic (combats perdus analysés : ADDM 15, 20, 90, 94, 130, 46 ; AADM 19)

1. **Anticipation trop courte** (ADDM 15, 20 ; AADM 19) : l'anticipation s'arrêtait au prochain joueur. Une poussée
   d'allié dans les pics (ADDM 20, T5 : Videur qui touche le Dompteur 1 → Vulnérable à la sortie, 12 800 + 6 200 + 4 000
   au Troollibre suivant), un Magicien laissé Vulnérable à côté d'un Troollibre, une Voltige depuis les pics à la veille
   du tour de la Mama : le coût tombait après l'horizon. La menace statique (décroissance 0,8ⁿ « les coéquipiers
   tueront peut-être le monstre ») le sous-estimait quand les coéquipiers ne le tuaient pas.
2. **Objectifs bloqués** : c'est le premier facteur des défaites restantes. ADDM 15 et 94 (arrêt au T21) : « Attention,
   sol glissant » (un ennemi meurt de dommages de poussée) voté au T1 et **jamais validé** : un seul objectif de tout le
   combat, donc aucun sort d'attirance ; la Mama finit coincée sur 184 (coin de l'anneau de pics : aucune poussée ne
   l'en sort). Sur les 192 premières graines, avec un seul Acrobate (ADDM), sol glissant n'était pas validé dans 11 cas
   sur 36 (≈ 3,4 tours sinon) ; avec deux (AADM), toujours (≈ 2,7 tours). Cause : l'estimation a priori ne récompensait
   pas la poussée qui tue par collision (pas dans les 40 candidats), notamment sur un monstre **dans** les pics (la case
   de collision la plus fréquente : l'anneau extérieur bute sur le bord). Autres blocages observés : « Toi, par ici »
   (ADDM 90), « D'une pierre trois coups » (23 fois sur 50 non validé, mais rarement fatal : 5ᵉ objectif).
3. Mama coincée dans un coin de pics sans sort d'attirance (ADDM 15, 130) : conséquence du point 2 ou de la mort de
   l'Acrobate ; non traité (il faudrait qu'un Dompteur ou le Magicien ait une attirance).

### Changements

| Changement | Fichiers | Effet mesuré |
|---|---|---|
| Anticipation **`globalTurn`** par défaut (modes fast et deep) : fin du tour global avec les coéquipiers joués par le planificateur glouton, puis le tour de la Mama du tour suivant ; plafond fast 150 → 300 ms ; deep 16 → 12 feuilles anticipées | `planner/search.ts` | 1-192 : 373 → 378 ; 193-384 : 377 → 376 ; ensemble 750 → 754 / 768 (plus d'objectifs : 5,03 → 5,24 en ADDM, Mama tuée plus tôt : T9,6 → T9,3) |
| Départage des feuilles anticipées à score final égal par le score statique (l'anticipation du tour global fait converger des lignes : sans cela le plan le plus court gagnait, p. ex. finir un Trooll qui mourrait seul) | `planner/search.ts` | corrige un test de §10.2 ; neutre |
| « Attention, sol glissant » : a priori +`objectiveCompleted` pour une poussée / attirance dont la collision prévue (`computeForcedMove` + `collisionDamages`, ×multiplicateur) tue la cible ou un ennemi percuté | `planner/actions.ts` | ADDM (36 graines où il est voté) : non validé 7 → 5 |
| Terme `pushKillSetup` (3 000) : pendant cet objectif, un ennemi poussable (hors Mama, pics compris) à ≤ `pushKillHp` (1 200) PV | `planner/evaluate.ts`, `planner/weights.ts` | délai de validation 3,9 → 3,3 tours (ADDM), 2,8 → 2,5 (AADM) ; 32 → 33 victoires sur 36 |
| « 1, 2, 3, Soleil ! » : condition évaluée (joueur courant sur sa case de départ, aucun joueur précédent du tour global en échec ; ×2 car un écart fait tout perdre) | `planner/evaluate.ts` | sans effet au bench (jamais voté) ; défaut évident corrigé |
| Ensemble (retenu) | | **758 / 768** (graines 1-384), bench 48/48 |

Essais non retenus :

| Variante | Mesure |
|---|---|
| Voter « Soleil » plutôt que « sol glissant » avec un seul Acrobate (faisabilités 0,55 / 0,25-0,35) | ADDM, 36 graines : 34/36 comme avant, mais Soleil non validé 24 fois sur 36 (les joueurs quittent leur case pour un kill) ; avec la condition ×2 : 15/18 contre 16/18 → annulé |
| `pushKillSetup` 6 000 sans l'a priori et hors pics seulement | aucun effet (31/36 contre 32/36) |
| Anticipation `nextPlayer` + changements « sol glissant » | 751 / 768 (contre 759 avec `globalTurn`) |

Tests ajoutés : `sim/test/planner.objectives.test.ts` (poussée qui tue par collision en tête des candidats, jouée et
objectif validé ; valeur `pushKillSetup` ; condition de Soleil). Typecheck OK, 773 tests verts (≈ 19 s).

Aucun fichier d'un autre module modifié (moteur, données, scénario, IA des monstres intacts).

### Pistes pour le tour suivant

- Objectifs bloqués : « Toi, par ici » avec un seul Acrobate, « D'une pierre trois coups » (compteur de morts entre deux
  lancers : préparer un paquet affaibli), « Même pas mal » ; un vote qui tienne compte du délai de validation mesuré.
- Mama coincée dans un coin de pics sans attirance : jouer pour la faire sortir (attendre qu'elle bouge, se placer de
  façon qu'une poussée la sorte).
- Effondrements au T9-T13 (ADDM 76, 90, 205…) : vague 9 (deux Troollibres) pendant que la Mama est encore vivante.

## Tour 3

### Mesures

| | Victoires | Progression | ADDM | AADM | Morts / combat | Durée |
|---|---|---|---|---|---|---|
| AVANT (bench 1-24) | 48 / 48 = **1,000** | **1,000** | 24/24 (1,000) | 24/24 (1,000) | 0,083 | 41,9 s |
| APRÈS (bench 1-24) | 48 / 48 = **1,000** | **1,000** | 24/24 (1,000) | 24/24 (1,000) | 0,042 | 70,8 s |
| AVANT (graines 1-384) | 758 / 768 = 0,987 | 0,9971 | 376/384 = 0,979 (0,9956) | 382/384 = 0,995 (0,9985) | 0,098 | 538 s |
| APRÈS (graines 1-384) | 764 / 768 = **0,995** | **0,9994** | 381/384 = 0,992 (0,9993) | 383/384 = 0,997 (0,9995) | 0,065 | ≈ 995 s |

Le bench (24 graines) est saturé depuis le tour 2 : la mesure qui compte reste celle des 768 combats (graines 1-384,
mêmes graines, déterministe). Échecs : 10 → 4 (ADDM 64, 76, 88, 119, 205, 245, 273, 315 et AADM 88, 90 → ADDM 90,
227, 340 et AADM 182) ; morts de joueurs −34 % ; Mama tuée en moyenne au T9,6 au lieu du T9,8. Coût : ≈ 2 × plus lent
(médiane 105 ms, p95 ≈ 310 ms, max ≈ 380 ms par tour de joueur ; ≈ 5,5 s par combat).

### Diagnostic (combats perdus analysés : ADDM 205, 245, 273, 90, 227 ; AADM 88)

1. **Le dernier joueur du tour global ne voyait pas le danger** (ADDM 205, 273, AADM 88 : trois défaites sur dix,
   toutes au T5-T6, toujours le même scénario). Un Troollibre envoie le Magicien dans les pics (Troollpoline) ; il y
   reste (pénalité `playerInSpikes` de 3 000 seulement). Au tour suivant, un autre Troollibre l'**attire hors des pics**
   (Aspiratrooll : sortie → Vulnérable, ×2), le frappe, puis le **repousse dedans** (entrée : 2 000 × 2) :
   ≈ 20 000 à 24 000 PV d'un coup, mort. Le Magicien joue en dernier : son anticipation `globalTurn` s'arrêtait au
   début du tour global suivant, donc au tour de la Mama, **avant** les monstres qui le tuent (« PV perdus par les
   joueurs 0 »). La menace statique (9 000 × multiplicateur × 0,8ⁿ) sous-estimait le combo. Les coéquipiers qui
   jouaient avant ces Troollibres (anticipation plus longue) le voyaient (« Magicien exposé »), mais trop tard.
2. L'IA des monstres de l'anticipation (élaguée : 12 cases de départ, sans critique) choisit parfois un autre ordre de
   sorts que l'IA réelle (Troollpoline puis Aspiratrooll au lieu d'Aspiratrooll puis Troollpoline : 8 400 PV prévus
   contre 23 800 subis sur ADDM 205). Essayé (ci-dessous) : neutre.
3. Échecs restants (tous des effondrements au T9-T11 pendant que la Mama vit encore) : objectif « D'une pierre trois
   coups » voté au T2 et jamais validé (ADDM 90 : 4 objectifs, Mama à 50 000 PV qui s'échappe des pics), vague 9
   pendant la deuxième fenêtre de la Mama (ADDM 227 : un Dompteur sous Pense Vite, 1 001 PA, frappe un Nitrooll au
   lieu de la Mama hors de portée, reste dans les pics et se fait happer).

### Changements

| Changement | Fichiers | Effet mesuré |
|---|---|---|
| Anticipation **`fullRound`** par défaut (modes fast et deep) : après la fin du tour du joueur, un passage de **chaque** combattant jusqu'à son prochain tour (coéquipiers gloutons, monstres, Mama et monstres du tour global suivant compris). Le premier joueur garde le même horizon qu'avec `globalTurn` ; le dernier voit enfin les monstres qui jouent après le premier joueur. | `planner/simulate.ts` (`runLookahead`), `planner/types.ts` (`LookaheadMode`), `planner/search.ts` (budgets, commentaire) | 1-96 : 187 → 191 / 192 ; 97-384 : 571 → 573 / 576 ; ensemble **758 → 764 / 768** ; morts 0,098 → 0,065 par combat |
| Option du runner `planner.anticipationAi` (options de l'IA des monstres pendant l'anticipation, fusionnées sur `ANTICIPATION_OPTIONS`) : outil d'expérience, défaut inchangé | `runner/types.ts`, `runner/runFight.ts` | — |
| Poids `mamaHpWeight` (valeur relative d'un PV de la Mama arrivée) : paramètre ajouté, défaut 1 (identité) | `planner/evaluate.ts`, `planner/weights.ts` | voir essais |
| Test `sim/test/planner.lookahead.test.ts` ; seuil de médiane du test de bout en bout 150 → 250 ms (anticipation plus longue, toujours sous le budget fast de 300 ms) | `sim/test/planner.flow.test.ts` | — |

Essais non retenus :

| Variante | Mesure |
|---|---|
| IA des monstres complète en anticipation (`maxStartCells: null`, `finalMoveCandidates: 3`, critiques en espérance), anticipation `globalTurn` | 757 / 768 (contre 758) : neutre, +5 % de temps |
| `mamaHpWeight` 1,6 (avec `fullRound`) | graines 1-192 : 381 / 384 contre 382 ; Mama tuée plus tôt (T8,9 contre T9,1 en ADDM) mais morts égales : neutre → 1 |
| `lookaheadLeaves` 4 → 6 (avec `fullRound`) | graines 1-192 : 383 / 384 contre 382, morts 0,036 contre 0,078 par combat ; mais p95 ≈ 450 ms par tour de joueur (budget fast : 300 ms) → non retenu pour fast (le mode deep anticipe déjà 12 feuilles) |

Typecheck OK, 775 tests verts (≈ 23 s).

Fichiers d'autres modules modifiés : `sim/src/runner/types.ts` et `sim/src/runner/runFight.ts` (option
`planner.anticipationAi`, sans effet par défaut), `sim/test/planner.flow.test.ts` (seuil de temps). Moteur, données,
scénario et IA des monstres intacts.

### Pistes pour le tour suivant

- Rendre `fullRound` moins cher (arrêt anticipé des coéquipiers gloutons, cache des plans) pour financer 6 feuilles
  anticipées dans le budget de 300 ms (−50 % de morts mesurées).
- Mama : exploiter les tours sous Pense Vite pendant la fenêtre (se rapprocher d'elle d'abord), ne pas laisser un
  Dompteur dans les pics près d'un Troollibre pendant la vague 9.
- Vote : éviter « D'une pierre trois coups » (non validé dans près de la moitié des cas) quand l'autre option est
  faisable, ou préparer un paquet d'ennemis affaiblis.

## Tour 4

### Mesures

Le bench (24 graines) est saturé depuis le tour 2. Ce tour ajoute donc un **jeu de graines neuf, 385-768**
(768 combats jamais utilisés pour régler les poids ; 757 / 768 au départ, contre 764 / 768 sur les graines 1-384 qui
ont servi aux tours précédents). Les réglages ont été choisis sur 385-576, puis contrôlés sur 577-768 et 1-384.
Tout est déterministe (mode fast, budget de nœuds) : mêmes graines → mêmes combats.

| | Victoires | Progression | ADDM | AADM | Morts / combat | Durée |
|---|---|---|---|---|---|---|
| AVANT (bench 1-24) | 48 / 48 = **1,000** | **1,000** | 24/24 (1,000) | 24/24 (1,000) | 0,042 | 71,1 s |
| APRÈS (bench 1-24) | 48 / 48 = **1,000** | **1,000** | 24/24 (1,000) | 24/24 (1,000) | 0,021 | 76,4 s |
| AVANT (graines 385-768, neuves) | 757 / 768 = 0,9857 | 0,9979 | 375/384 = 0,977 (0,9962) | 382/384 = 0,995 (0,9997) | 0,073 | 985 s |
| APRÈS (graines 385-768) | 765 / 768 = **0,9961** | **0,9996** | 381/384 = 0,992 (0,9992) | 384/384 = 1,000 (1,0000) | 0,033 | — |
| AVANT (graines 1-384, fin du tour 3) | 764 / 768 = 0,9948 | 0,9994 | 381/384 (0,9993) | 383/384 (0,9995) | 0,065 | ≈ 995 s |
| APRÈS (graines 1-384) | 765 / 768 = **0,9961** | 0,9992 | 381/384 = 0,992 (0,9984) | 384/384 = 1,000 (1,0000) | 0,044 | ≈ 1 100 s |
| **APRÈS (graines 1-768)** | 1 530 / 1 536 = **0,9961** | **0,9994** | 762/768 = 0,992 (0,9988) | 768/768 = 1,000 (1,0000) | 0,038 | — |

Sur les 1 536 combats : 1 521 → 1 530 victoires, morts de joueurs 0,069 → 0,038 par combat (−45 %), bench : tour de
fin 11,00 → 10,83. Planification : médiane 107 → 122 ms, p95 236 → 283 ms par tour de joueur (replanifications
comprises ; mesures du bench sur 4 cœurs).

### Diagnostic (combats perdus analysés : 385-768 — ADDM 428, 501, 570, 638, 720, AADM 445 ; 1-384 — ADDM 90, 227, 340, AADM 182)

1. **Le piège des pics** (4 des 11 défaites des graines 385-768 commencent ainsi, au T4-T5 — ADDM 570, 720, 638,
   AADM 445 — et le même combo, hors des pics, en achève d'autres) : un joueur finit dans
   les pics (poussé par un monstre) ; au passage suivant, un **Troollibre l'attire hors des pics** (Aspiratrooll :
   sortie → Vulnérable ×2), le frappe, puis **le renvoie dedans** (Troollpoline : entrée 2 000 × 2) : 20 000 à
   24 000 PV d'un coup (ADDM 570 : 6 978 + 12 164 + 4 000 + 1 000 ; ADDM 720, 638, AADM 445 : même séquence). La
   menace statique l'estimait à 9 000-14 000 (celle d'un Troollibre contre un joueur ordinaire) : les coéquipiers qui
   jouaient avant le Troollibre ne voyaient pas l'urgence (« Dompteur exposé, menace estimée 11 790 ») et
   l'anticipation, dont l'IA élaguée choisit parfois un autre ordre de sorts, ne la corrigeait pas toujours.
2. **Anticipation trop étroite dans les tours critiques** : quand les 4 feuilles anticipées finissaient toutes par
   une mort (« joueurs morts : Magicien »), la recherche s'arrêtait là, alors que la 5ᵉ ou la 6ᵉ feuille du classement
   statique pouvait sauver le joueur (le tour 3 avait mesuré −50 % de morts avec 6 feuilles partout, mais trop cher).
3. **Plans en boucle ouverte** : le plan (jets moyens) était exécuté jusqu'au bout même quand les jets réels
   l'avaient déjà invalidé. ADDM 638 : le Dompteur prévoit « Grondement, Frappe Repoussoir, Frappe Repoussoir : le
   Nitrooll meurt de la collision (−274 PV) → Attention, sol glissant validé » ; un coup critique le tue au 2ᵉ lancer
   (dommages ordinaires), et le 3ᵉ lancer part sur une case vide. L'objectif de palier 2 attend alors le T9.
4. Objectifs de palier 5 bloqués (« Trous dans les Troolls » : 4 ennemis doivent entrer dans les pics pendant un même
   tour, alors que les vagues T3-T7 n'en comptent que 3 et sont tuées aussitôt ; « D'une pierre trois coups ») : 9 des
   48 combats du bench finissent avec 4 objectifs. Voter autrement n'est pas possible (les deux options proposées
   sont souvent mauvaises) ; valoriser davantage les objectifs a été essayé (ci-dessous) : non concluant.
5. Mama coincée plusieurs tours dans les pics avec un Dompteur collé à elle (ADDM 90) : rare, non traité.

### Changements

| Changement | Fichiers | Effet mesuré (graines 385-576, 384 combats ; base 375) |
|---|---|---|
| **Piège des pics** : la menace d'un Troollibre contre un joueur resté dans les pics est multipliée par `spikeTrapThreat` = 2,5 (≈ 22 500, l'ordre de grandeur observé) ; le facteur compte aussi pour le choix de la cible du monstre dans l'évaluation. Conséquences : le joueur sort des pics, les coéquipiers tuent / mettent dans les pics le Troollibre qui le menace, le Magicien le soigne | `planner/weights.ts`, `planner/evaluate.ts` | seul : 380 / 384, morts ADDM 0,167 → 0,083 |
| **Tour critique** : `lookaheadExtraLeaves` (fast 4, deep 6) — si la meilleure anticipation perd un joueur vivant ou en laisse un sous 35 % de ses PV (`lookaheadDanger`), les 4 feuilles suivantes sont anticipées aussi. Coût moyen quasi nul (les tours calmes ne changent pas) | `planner/search.ts`, `planner/types.ts` | seul : 381 / 384, morts ADDM 0,167 → 0,089 ; **avec le piège : 384 / 384**, morts 0,101 → 0,029 |
| **Boucle fermée** : chaque plan porte des **points de contrôle** (combattants vivants et leurs cases prévus après chaque lancer, `PlayerPlan.checkpoints`) ; `executePlan` (option `checkpoints`) s'arrête dès que l'état réel s'en écarte et le runner / `createPlannerController` replanifient (4 fois au plus par tour, `maxDeviationReplans`) | `planner/search.ts`, `planner/types.ts`, `runner/runFight.ts`, `runner/types.ts` | neutre : 1 530 / 1 536 contre 1 532 sans elle (graines 1-768, dans le bruit) ; ≈ 0,12 replanification par tour de joueur ; gardé car il corrige un défaut évident (lancers sur des cases vides, plans « au fil du rasoir » exécutés aveuglément) |
| Test `sim/test/planner.danger.test.ts` (5 tests : facteur du piège dans les pics et pas dehors, `lookaheadDanger`, feuilles supplémentaires seulement dans un tour critique, points de contrôle alignés sur les lancers, arrêt sur écart) | — | — |

Contrôle sur des graines non utilisées pour choisir (piège + tour critique, sans la boucle fermée) : 577-768 :
382 / 384 (base 382, morts 0,044 → 0,034) ; 1-384 : 766 / 768 (base 764, morts 0,065 → 0,037).

Essais non retenus :

| Variante | Mesure |
|---|---|
| `objectiveCompleted` 9 000 → 13 000 (objectifs plus prioritaires, pour débloquer le palier 5) | seul, 385-576 : 379 / 384 (base 375) ; avec piège + tour critique : 385-576 384 / 384 (égal), 577-768 383 (contre 382), mais **1-384 : 763 (contre 766)** → incohérent, non retenu |
| `spikeTrapThreat` 3,5 (avec tour critique) | 385-576 : 383 / 384 (contre 384 avec 2,5) |

Typecheck OK, 780 tests verts (≈ 24 s).

Fichiers d'autres modules modifiés : `sim/src/runner/runFight.ts` et `sim/src/runner/types.ts` (replanification en
boucle fermée, options `replanOnDeviation` et `maxDeviationReplans`). Moteur, données, scénario et IA des monstres
intacts.

### Pistes pour le tour suivant

- Palier 5 : préparer « Trous dans les Troolls » (garder un ennemi de la vague précédente hors des pics, ou
  sortir / renvoyer des ennemis déjà dedans) et « D'une pierre trois coups » (paquet de trois ennemis affaiblis pour un
  sort de zone) ; aujourd'hui 4 objectifs seulement dans ≈ 20 % des combats.
- IA des monstres de l'anticipation : le combo Aspiratrooll → Troollpoline est parfois remplacé par un autre ordre ;
  un modèle plus fidèle rendrait `spikeTrapThreat` inutile.
- Échecs restants (1-768) : ADDM 84, 223, 252, 421, 627, 756 — effondrements T9-T11 (vagues 9-10 pendant que la
  Mama vit encore).
