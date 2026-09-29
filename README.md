# Simulateur du Gladiatrool

Simulateur **non officiel** du mini-jeu **Gladiatrool** de DOFUS 3 (Foire du Trool) : un moteur de combat fidèle aux
données du jeu, une IA des monstres, un planificateur qui cherche les meilleures actions d'une équipe de 4
personnages, des expériences Monte Carlo et une interface web en français.

## Le Gladiatrool en bref

Le Gladiatrool est un combat scripté à 1–4 joueurs. Chacun incarne un **archétype** imposé (et non sa classe) :

| Archétype | Rôle | Sorts clés |
|---|---|---|
| **Acrobate** (A) | placeur : pousse les monstres dans les pics | Videur, Hanedimane, Voltige, Dégagez ! |
| **Dompteur** (D) | frappe | Impact, Grondement Grandissant, Relâchement de Fureur |
| **Magicien** (M) | soutien : PA / PM, dommages, soins | Regain Vigoureux, Amplification, Pulsation d'Énergie |

Tous les archétypes ont 30 000 PV, 8 PA et 4 PM. Ils démarrent avec 2 sorts et en gagnent un par objectif réussi.
L'arène (carte 139988488) est un octogone de 241 cases sans obstacle, bordé d'un **anneau de pics** de 96 cases.
Entrer dans les pics coûte 2 000 PV et rend Vulnérable ; un monstre dans les pics subit ×2. D'où le principe du jeu :
**pousser les Troolls dans les pics, puis les frapper**, de préférence avant qu'ils jouent.

Une vague de Troolls (Troollibre, Artroolleur, Nitrooll) apparaît à chaque tour global, 10 vagues au total, et les
vagues s'accumulent si on ne les tue pas. La **Mama Troollette** (150 000 PV) arrive au T8 sur la case centrale.
Elle est invulnérable, sauf pendant un tour après chaque entrée dans les pics. La victoire exige de tuer tous les
ennemis après l'apparition de la vague 10. Entre les tours s'ajoutent des choix : bonus permanents
(« Acclamations »), cadeaux (améliorations et sorts uniques) et votes d'objectifs.

Les règles détaillées, avec leurs sources et leur niveau de confiance, sont dans
[research/ETUDE_GLADIATROOL.md](research/ETUDE_GLADIATROOL.md).

## Ce que fait le simulateur

- **Moteur** (`sim/src/engine`, `geometry`, `scenario`) : il interprète les sorts tels que le client DOFUS 3 les
  décrit (effets, zones, poussées, états, déclencheurs, glyphes) avec les formules portées depuis le client. Il
  déroule le scénario : timeline, vagues, pics, cadeaux, Acclamations, objectifs, arrivée de la Mama, victoire.
- **IA des monstres** (`sim/src/ai`) : paramétrée d'après les données (`aiModel`) et les observations vidéo.
- **Planificateur** (`sim/src/planner`) : une recherche en faisceau sur des copies du combat. Il anticipe le tour des
  monstres, explique ses plans en français et choisit les Acclamations, les cadeaux et les votes. Il ne connaît pas
  les tirages futurs : ses copies utilisent une graine neutralisée.
- **Runner et CLI** (`sim/src/runner`, `sim/src/cli`) : combats complets avec journal et trace rejouable, plan d'une
  situation décrite en JSON, comparaisons appariées de compositions ou d'hypothèses (IC de Wilson, test de McNemar),
  campagnes multi-cœurs.
- **Interface web** (`web/`) : carte isométrique, éditeur de situation, « meilleur tour », simulation rejouée pas à
  pas, synthèse des résultats. Elle se construit en un fichier HTML unique.

## Résultats clés

Voici un résumé fidèle de [docs/RESULTATS.md](docs/RESULTATS.md), qui contient le détail, les intervalles de
confiance et les tableaux. Ces résultats portent sur environ 4 000 combats simulés, avec le planificateur en mode
`fast` et sur des graines (1001 et plus) jamais utilisées pour le régler.

1. **Il faut un Acrobate et il faut 4 joueurs.**
   - Avec les hypothèses par défaut, ADDM gagne 196 combats sur 200 et AADM 198 sur 200.
   - À 3 joueurs, ADM gagne 73 % des combats, AAD 40 % et ADD 17 %. À 2 joueurs ou moins, aucun combat n'est gagné
     sur 30.
   - Sans Acrobate, DDDM tombe à 20 % de victoires. ADDD tombe à 70 % : le Magicien est utile (p < 0,001).
   - L'Acrobate joué en premier reste le meilleur ordre de jeu. Joué en 2e (DADM), il met moins de monstres dans les
     pics et retarde la mort de la Mama de 1,6 tour ; l'écart de victoire n'est pas significatif.
2. **ADDM et AADM ne se départagent pas sur le taux de victoire** quand les cadeaux sont fréquents : 196/200 contre
   198/200, p = 0,69. Dans le scénario pessimiste combiné, c'est 58,8 % contre 59,4 % (p = 1).
3. **Les deux compositions ont des profils nettement différents.**
   - ADDM tue la Mama environ un tour plus tôt : au T8 dans 41 % des combats, contre 3 % pour AADM.
   - AADM met plus de monstres dans les pics (99 % contre 87 % en vague 10).
4. **Quand les cadeaux sont rares, AADM est nettement plus sûre** (hypothèse Q14, p = 0,3 au lieu de 0,72) : 95 % de
   victoires contre 81 % (p < 0,001). ADDM dépend du Relâchement de Fureur, sort unique tiré des cadeaux.
5. **Acclamations** : il faut choisir par archétype. Pour le Dompteur, +10 % de dommages finaux ou +1 PA ; pour
   l'Acrobate, +1 PO. La règle « PO pour tous » dégrade nettement ADDM dans le scénario difficile (48 % contre 68 %,
   p = 0,017). Les politiques de vote et le placement initial n'ont pas d'effet mesurable, car on est au plafond.
6. **Sensibilité aux hypothèses** : une seule des 12 hypothèses testées renverse le jeu. Si tous les Troolls jouent
   d'affilée après la Mama (Q1), aucune des deux compositions ne gagne. C'est l'hypothèse à trancher en premier ;
   viennent ensuite Q14 (fréquence des cadeaux) et Q2 (les monstres jouent-ils dans les pics ?).

**Réserves** (voir RESULTATS §7) :
- Ces conclusions valent **pour ce simulateur et ce planificateur**, pas pour des joueurs humains.
- L'IA des monstres n'est pas validée contre des combats réels, et le planificateur l'anticipe « trop bien ». Cela
  peut expliquer des taux de victoire proches de 100 %.
- Avec les hypothèses par défaut, les comparaisons de politiques n'ont aucune puissance (effet plafond). Seuls les
  scénarios dégradés discriminent, et leur plausibilité n'est pas établie.
- Des écarts de 1 à 3 points de taux de victoire restent indétectables avec 40 à 200 graines par variante.
- Une première version du planificateur connaissait sans le vouloir les tirages futurs (vagues, cadeaux). Le défaut
  a été corrigé et tout a été relancé ; l'effet de cette triche est mesuré dans RESULTATS §4.4.

## Démarrage rapide

Prérequis : Node.js 20 ou plus (développé et testé avec Node 22). Python 3, bibliothèque standard seule, n'est
nécessaire que pour régénérer les données.

```sh
npm install
npm test               # ≈ 800 tests vitest (≈ 30 s)
npm run typecheck      # tsc strict : sim/ et web/
npm run web:dev        # interface web en développement : http://localhost:5173
npm run web:build      # web/dist/index.html : fichier unique autonome (≈ 2,3 Mo), à ouvrir dans un navigateur
npm run web:preview    # sert la version construite : http://localhost:4173
```

### Exemples en ligne de commande

Toutes les commandes passent par `npm run cli -- <commande>`. L'interface est en français et
`npm run cli -- aide` affiche le résumé des commandes. Une composition s'écrit dans l'**ordre de jeu** :
`A` = Acrobate, `D` = Dompteur, `M` = Magicien (ADDM, AADM…).

```sh
# la carte de l'arène (numéros de case, pics ^, départs J, cadeaux *, centre +, Mama M)
npm run cli -- carte
npm run cli -- carte --coords

# un combat complet (≈ 6 s en mode fast) : bilan, journal commenté, trace rejouable
npm run cli -- simuler --compo ADDM --graine 42
npm run cli -- simuler --compo ADDM --graine 42 --journal > journal.txt
npm run cli -- simuler --compo ADDM --graine 42 --trace trace.json
npm run cli -- simuler --compo AADM --graine 7 --mode deep

# le meilleur plan dans une situation décrite en JSON (format : docs/FORMAT_SITUATION.md)
npm run cli -- planifier --situation sim/examples/t1_ouverture.json
npm run cli -- planifier --situation sim/examples/t3_dompteur_vulnerable.json --seul --alternatives
npm run cli -- planifier --trace trace.json --tour 5 --joueur J2     # état exact d'un combat simulé

# comparaison appariée (mêmes graines) de compositions, sur 4 cœurs (≈ 40 s)
npm run cli -- comparer --compos ADDM,AADM --graines 1001-1008 --coeurs 4

# évaluation standard du planificateur : ADDM et AADM, graines 1-24 (≈ 1,5 min)
npm run cli -- bench

# campagnes d'expériences du rapport et tableaux
npx tsx sim/src/cli/campaign.ts liste
npx tsx sim/src/cli/report.ts --experience compos-ref
```

Le guide complet est dans [docs/GUIDE.md](docs/GUIDE.md) : options, fichier de variantes, API TypeScript et onglets
de l'interface web.

## Carte du dépôt

| Dossier | Contenu |
|---|---|
| `research/` | La recherche. [ETUDE_GLADIATROOL.md](research/ETUDE_GLADIATROOL.md) est l'étude consolidée : règles, carte, archétypes, monstres, Mama, objectifs, formules et stratégie, chaque fait étant sourcé et étiqueté vérifié, rapporté ou hypothèse. [QUESTIONS_OUVERTES.md](research/QUESTIONS_OUVERTES.md) liste les 40 inconnues, classées par impact, avec leur protocole de vérification. [SPEC_DONNEES_SIMULATEUR.md](research/SPEC_DONNEES_SIMULATEUR.md) décrit le schéma des données. Le dossier contient aussi `notes/` (notes thématiques par agent), `data/` (données consolidées : carte, monstres, archétypes, scripts de combat, annotations VOD), `raw/dofusdb/` (extraction brute du client), `raw/vision/` (tables et scripts d'analyse de la VOD) et `figures/`. |
| `sim/` | Le simulateur en TypeScript strict (ESM). `src/` contient les modules `data`, `geometry`, `engine`, `scenario`, `ai`, `planner`, `runner`, `analysis` et `cli`. On y trouve aussi `data/gladiatrool.data.json` (les faits, générés), `config/default.config.json` (les hypothèses, générées et documentées), `test/` (tests vitest et fixtures issues des outils Python), `examples/` (situations JSON), `results/` (résultats bruts des expériences et `TABLEAUX.md`). |
| `web/` | L'interface web (Vite + React), dans `src/` : écrans, composants, modèle, Web Worker. S'y ajoutent `test/`, `e2e/` (vérification manuelle dans Chromium avec Playwright, hors dépôt) et `dist/`, généré et ignoré par git. |
| `tools/` | Les générateurs Python de la recherche. `dofusdb/` extrait et décode l'API DofusDB. `map/` contient un client Cytrus et les lecteurs de cartes DOFUS 2 et 3. `mechanics/` porte les formules du client (dégâts, zones, poussées, LdV) et produit les fixtures de référence. `archetypes/`, `monsters/` et `fight_scripts/` produisent les fiches, et `simdata/build_sim_data.py` génère les données du simulateur (`npm run build:data`). |
| `docs/` | La documentation du simulateur. [ARCHITECTURE.md](docs/ARCHITECTURE.md) décrit chaque module : API, choix, limites. [GUIDE.md](docs/GUIDE.md) est le mode d'emploi, et [FORMAT_SITUATION.md](docs/FORMAT_SITUATION.md) décrit le format des situations. [RESULTATS.md](docs/RESULTATS.md) contient les expériences, [AMELIORATIONS.md](docs/AMELIORATIONS.md) la boucle d'amélioration du planificateur et [VERIFICATION.md](docs/VERIFICATION.md) les revues adversariales du moteur, du scénario, du planificateur et de l'interface. |

## Comment la recherche a été faite

Chaque fait de l'étude porte un statut. **[V]** signifie vérifié dans une source primaire. **[R]** signifie
rapporté par un guide, un game designer ou une vidéo ; **[R·obs]** désigne une mesure faite par nous sur des images
de vidéo. **[H]** marque une hypothèse. Chaque fait a aussi un niveau de confiance. Les sources :

- **Données du client DOFUS 3** (version 3.6.12.16), consultées de deux façons :
  - par l'API **DofusDB** : sorts, niveaux de sort, états, effets et monstres. L'extraction est reproductible avec
    `tools/dofusdb/` et stockée dans `research/raw/dofusdb/` ; elle a été revérifiée en direct, sans aucune
    différence ;
  - par le CDN **Cytrus** d'Ankama, en lisant les fichiers du client sans le lanceur : données de carte (cases,
    pics, placements) et enum des effets. Les outils sont dans `tools/map/`.

  Les formules de dégâts, de zones, de poussée et de ligne de vue sont portées depuis le client DOFUS 2.73
  décompilé (`tools/mechanics/`) et contrôlées par `python3 tools/mechanics/verify_mechanics.py`.
- **Guide « Dofus pour les Noobs »** (DPLN), page Gladiatrool : déroulé, vagues, objectifs, captures d'infobulles.
- **VOD Twitch 2852548819** (version 3.6, 11 combats complets). Elle a été analysée image par image
  (`research/raw/vision/`) pour les cases d'apparition des vagues, les cadeaux, la timeline, les relevés de dégâts et
  le comportement des monstres.
- **Vidéos YouTube** d'une dizaine de joueurs (transcriptions et vignettes) et un live Ankama avec les game
  designers, pour la stratégie et les observations. Les sources officielles et les forums complètent l'ensemble ; la
  bibliographie complète est dans l'ÉTUDE §12.

Les données du simulateur sont ensuite **générées** de façon déterministe à partir de `research/` par
`npm run build:data`. Elles séparent les **faits** (`sim/data/`) des **hypothèses** (`sim/config/`) : un fait qui
dépend d'une hypothèse la référence au lieu d'en porter la valeur.

## Fidélité et limites

- **Ce qui est solide** : la carte, les pics, les sorts des archétypes et des monstres, les formules de dégâts et
  de poussée, la composition des vagues et le script de la Mama. Ils viennent des données du client. Des revues
  adversariales les vérifient sort par sort, contre les valeurs des notes (docs/VERIFICATION.md).
- **Ce qui est supposé** : les 40 questions de
  [research/QUESTIONS_OUVERTES.md](research/QUESTIONS_OUVERTES.md), classées de P0 (change l'issue des combats) à P3
  (marginal). Chacune a une hypothèse par défaut et un paramètre de configuration. Les questions P0 portent sur :
  - l'ordre exact de la timeline (Q1) ;
  - l'IA des monstres (Q2) ;
  - le ×2 d'un joueur dans les pics (Q3) ;
  - les dégâts de début de tour dans les pics (Q4) ;
  - la loi de tirage des cases d'apparition (Q5) ;
  - le déclenchement des pics pendant un déplacement (Q6).
- **L'IA des monstres n'est pas validée.** Elle est côté serveur dans le jeu et aucune donnée du client ne la
  décrit. Elle reprend les observations des vidéos sans comparaison quantitative avec des combats réels.
- **Le planificateur n'est pas un joueur.** Il imagine un seul futur plausible des vagues et des cadeaux, et son
  mode `fast` est volontairement limité en calcul.
- Une situation JSON ne décrit pas tout, par exemple les envoûtements en cours ou les relances de sorts. Pour un état
  exact, il faut rejouer une trace (docs/FORMAT_SITUATION.md).

## Vérifier ou trancher une hypothèse

1. **Trouver la question** dans [research/QUESTIONS_OUVERTES.md](research/QUESTIONS_OUVERTES.md). Chaque question
   donne le constat, l'hypothèse par défaut, une **méthode de vérification** et le **paramètre** concerné. Beaucoup se
   tranchent avec **un seul relevé**, parce que les plages de dégâts des deux hypothèses sont disjointes. Par exemple,
   pour Q3, un Tir d'Artroollerie sur un joueur resté dans les pics fait 1 736 à 2 387 PV si le joueur n'est pas
   doublé, et 3 472 à 4 774 PV s'il l'est. La fin du document regroupe deux protocoles :
   - une relecture de la VOD, sans accès au jeu ;
   - une session en jeu de 4 comptes (environ 3 combats) qui couvre la plupart des questions P0 et P1.
2. **Mesurer l'effet** de l'hypothèse avant même de la trancher, avec un fichier de surcharges qui ne contient que
   les paramètres modifiés :

   ```sh
   echo '{ "spikes": { "playersDoubledInside": true, "playerTurnStartDamage": 2000 } }' > surcharges.json
   npm run cli -- simuler --compo ADDM --graine 42 --config surcharges.json
   npm run cli -- comparer --compos ADDM,AADM --graines 1001-1040 --config surcharges.json
   ```

   Les paramètres, leurs valeurs admises, leur source et leur question (Qn) sont documentés dans le bloc `_doc` de
   `sim/config/default.config.json`. Un paramètre inconnu ou une valeur invalide est refusé avec un message clair.
   L'onglet **Simulation** de l'interface web règle les hypothèses clés (Q1, Q3, Q4, Q5, Q14). Un fichier de
   variantes (`comparer --variantes`, voir le GUIDE) compare plusieurs hypothèses sur les mêmes graines.
3. **Changer la valeur par défaut** une fois la question tranchée. La configuration est générée : il faut modifier
   la valeur et sa documentation (statut, source) dans `tools/simdata/build_sim_data.py`, puis lancer
   `npm run build:data`, `npm run typecheck` et `npm test`. Il faut aussi mettre à jour la question dans
   QUESTIONS_OUVERTES.md et, si besoin, relancer les expériences (RESULTATS §8 ; repartir d'un cache vide).

## Mentions

DOFUS, le Gladiatrool, la Foire du Trool ainsi que les noms de sorts, de monstres et de personnages sont la propriété
d'**Ankama** (DOFUS © Ankama Games). Ce projet est un outil **non officiel** de fans, sans lien avec Ankama ni
approuvé par Ankama. Il ne contient aucune image du jeu : la carte et les jetons de l'interface sont dessinés par le
programme. Les captures et vidéos consultées pendant la recherche ne sont pas versionnées. Les données de jeu
incluses sont des extraits factuels (valeurs de sorts, cases de carte), obtenus par DofusDB et par le CDN public
d'Ankama, et servent seulement à la simulation.
