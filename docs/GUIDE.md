# Guide d'utilisation du simulateur du Gladiatrool

Toutes les commandes passent par `npm run cli -- <commande> [options]` (Node 22, `npm install` fait). Les textes
sont en français ; `npm run cli -- aide` affiche le résumé des commandes.

Compositions : lettres dans l'**ordre de jeu**, `A` = Acrobate, `D` = Dompteur, `M` = Magicien (`ADDM`, `AADM`,
`AADM`…). Placement facultatif après `@` (case de départ de chaque joueur, dans l'ordre : `AADM@287,314,286,315`) et
nom facultatif avant `=` (`AADM2=AADM@287,314,286,315`). Sans placement : J1 sur 314, J2 sur 287, J3 sur 286, J4
sur 315.

## Voir la carte

```
npm run cli -- carte            # numéros de case
npm run cli -- carte --coords   # coordonnées (x, y) du client
```

`^` pics, `J` cases de départ, `*` cases de cadeau, `+` centre (300, arrivée de la Mama), `M` case d'attente de la
Mama (152), `#` obstacles.

## Simuler un combat

```
npm run cli -- simuler --compo ADDM --graine 42                 # bilan
npm run cli -- simuler --compo ADDM --graine 42 --journal       # journal tour par tour
npm run cli -- simuler --compo AADM --graine 7 --mode deep --journal > journal.txt
npm run cli -- simuler --compo ADDM --graine 42 --trace trace.json
npm run cli -- simuler --compo ADDM --graine 42 --json          # résultat complet en JSON
```

Options : `--mode fast|deep|greedy` (planificateur des joueurs ; `fast` ≈ 1–5 s par combat, `deep` ≈ 5–30 s),
`--monstres ai|simple|passive` (IA des monstres ; défaut `ai`), `--tours-max 20` (arrêt au-delà), `--config
surcharges.json` (hypothèses de `sim/config/default.config.json` à modifier), `--bonus planner|PO_first|PA_first|DF_first`
(Acclamations), `--vote planner|fixed|preference` (votes), `--cadeaux planner|preference`.

Le **journal** montre, pour chaque tour : les tours des monstres (sorts, dégâts, déplacements, « dans les pics : ne
se déplace pas »), le **plan de chaque joueur** avec son explication (actions, dégâts attendus, mises en pics, morts,
objectif, risques, anticipation du passage des monstres), les **choix motivés** (Acclamation, carte de cadeau, vote,
avec les options écartées et leur note), les vagues, cadeaux et objectifs. Dernière ligne : bilan (victoire / défaite /
limite, progression = part des PV ennemis détruits, objectifs, Mama, morts, durée).

Le résultat JSON (`--json`) contient : `victory`, `reason`, `turnReached`, `playerDeaths`, `objectives`,
`enemyHpTotal` / `enemyHpDestroyed` / `progress`, `mamaArrived`, `mamaKilledTurn`, `giftsTaken`, `choices` (avec
raisons), `timing` (temps de planification par tour, replanifications).

## Planifier une situation

```
npm run cli -- planifier --situation sim/examples/t1_ouverture.json               # plan d'équipe (mode deep)
npm run cli -- planifier --situation sim/examples/t3_dompteur_vulnerable.json --seul --alternatives
npm run cli -- planifier --situation ma_situation.json --mode fast
npm run cli -- planifier --trace trace.json --tour 5 --joueur J2                   # état exact d'un combat simulé
npm run cli -- planifier --trace trace.json --etape 250
```

La commande affiche l'état (combattants, PV, Vulnérable / Inébranlable / dans les pics, carte avec J1…J4, T Troollibre,
A Artroolleur, N Nitrooll, MAM), puis :

- par défaut, le **plan du tour global** : personnage courant puis joueurs suivants, monstres intercalés simulés par
  l'IA (jets moyens) ; pour chacun l'explication et les actions (JSON rejouable) ;
- avec `--seul`, le plan du seul personnage courant, et `--alternatives` les meilleures alternatives différentes.

Le format des situations est décrit dans [docs/FORMAT_SITUATION.md](FORMAT_SITUATION.md) (exemples :
`sim/examples/`).

## Comparer des compositions ou des hypothèses

```
npm run cli -- comparer --compos ADDM,AADM --graines 1-100
npm run cli -- comparer --compos ADDM,AADM,AADM2=AADM@287,314,286,315 --graines 1-50 --coeurs 4 --sortie res.json
npm run cli -- comparer --compos ADDM,AADM --graines 1-100 --config surcharges.json   # ex. {"spikes": {"playersDoubledInside": true}}
npm run cli -- comparer --variantes variantes.json --graines 1-60
```

Toutes les variantes jouent **les mêmes graines** (mêmes vagues, cadeaux, cartes) : la comparaison est appariée. Le
tableau donne, par variante : victoires et intervalle de confiance de Wilson à 95 %, tour moyen atteint, progression
(part des PV ennemis détruits), objectifs, morts, Mama tuée (fraction et tour moyen), durée par combat ; puis, pour
chaque paire, les graines gagnées par l'une seulement (test exact de McNemar) et la différence de progression avec son
intervalle de confiance.

Fichier de variantes (`--variantes`) : liste JSON de

```json
[
  { "name": "ADDM PA d'abord", "compo": "ADDM", "policies": { "acclamation": "PA_first" } },
  { "name": "ADDM PO d'abord", "compo": "ADDM", "policies": { "acclamation": "PO_first" } },
  { "name": "AADM joueurs ×2 dans les pics", "compo": "AADM", "configOverrides": { "spikes": { "playersDoubledInside": true } } },
  { "name": "AADM timeline par initiative", "compo": "AADM", "configOverrides": { "timeline": { "model": "alternate_initiative" } } },
  { "name": "AADM deep", "compo": "AADM", "mode": "deep" },
  { "name": "AADM vote fixe", "compo": "AADM", "policies": { "vote": "fixed", "fixedVoteOrder": ["productivite", "ebranlable"] } }
]
```

Champs d'une variante : `name`, `compo` ou `players`, `configOverrides`, `policies` (`acclamation`, `vote`,
`fixedVoteOrder`, `gift`, `objectivePreference`, `giftPreference`), `planner` (`budget`, `weights`,
`deterministic`, `maxReplans`), `mode`, `monsters`.

Les combats tournent sur plusieurs cœurs (`--coeurs`, défaut : 4 au plus) ; la progression s'affiche sur la sortie
d'erreur (`--silence` pour la couper).

## Bench (boucle d'amélioration)

```
npm run cli -- bench                         # résumé
npm run cli -- bench --json                  # rapport JSON seul (stdout)
npm run cli -- bench --sortie bench.json     # rapport + combats détaillés dans un fichier
```

Évaluation standard : ADDM et AADM, graines 1-24, mode `fast` (sans plafond de temps : résultat reproductible), 20
tours au plus. Résumé : taux de victoire global et par composition (IC de Wilson), progression moyenne, tour moyen
atteint, objectifs, Mama tuée, morts, secondes par combat, comparaison appariée ADDM − AADM. Durée ≈ 30–40 s sur 4
cœurs.

## Utiliser le code

```ts
import { runFight, replayTrace, buildSituation, runExperimentSync } from './sim/src/runner/index.js';
import { runExperiment } from './sim/src/runner/nodeExperiment.js';   // Node : multi-cœurs
import { planPlayerTurn, planTeamTurn, createChoicePolicy } from './sim/src/planner/index.js';

const r = runFight({ compo: 'AADM', seed: 3 }, { mode: 'fast', journal: true, trace: true });
console.log(r.journal!.join('\n'));
const { fight } = replayTrace(r.trace!, { turn: 5, fighter: 'J2' });
const plan = planPlayerTurn(fight, { mode: 'deep' });
const res = await runExperiment({ variants: [{ name: 'ADDM' }, { name: 'AADM' }], seeds: [1, 2, 3], mode: 'fast' });
```

Les modules `runner` (sauf `nodeExperiment.ts` / `nodeWorker*.ts`), `planner` et `ai` n'utilisent aucune API Node :
ils peuvent tourner dans un Web Worker du navigateur.
