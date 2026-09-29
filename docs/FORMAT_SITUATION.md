# Format de situation (JSON) — commande `planifier`

Une **situation** décrit un instant du combat : le tour global, la position, les PV et les états de chaque combattant,
les sorts possédés, les objectifs, et le personnage dont c'est le tour. `npm run cli -- planifier --situation
fichier.json` reconstruit ce combat puis affiche le meilleur plan du personnage courant et des joueurs suivants du tour
global.

Exemples prêts à l'emploi : `sim/examples/` (`t1_ouverture.json`, `t3_dompteur_vulnerable.json`,
`t7_placement.json`, `t8_mama.json`).

Code : `sim/src/runner/situation.ts` (`buildSituation`, `validateSituation`), type `Situation`.

## Exemple

```json
{
  "version": 1,
  "description": "T3, tour du Dompteur 1 : un Troollibre Vulnérable dans les pics…",
  "seed": 7,
  "turn": 3,
  "players": [
    { "archetype": "acrobate", "cell": 243, "hp": 27000, "bonuses": { "range": 1 } },
    { "archetype": "dompteur", "cell": 272, "bonuses": { "ap": 1 } },
    { "archetype": "dompteur", "cell": 300, "hp": 21000 },
    { "archetype": "magicien", "cell": 315 }
  ],
  "monsters": [
    { "type": "troollibre", "cell": 199, "hp": 15000 },
    { "type": "artroolleur", "cell": 214, "hp": 12000, "states": ["vulnerable"] },
    { "type": "nitrooll", "cell": 358 }
  ],
  "current": "Dompteur 1",
  "objectives": { "completed": ["empale", "productivite"], "active": "stop_projectiles" },
  "gifts": [299]
}
```

## Champs

### Racine

| Champ | Type | Défaut | Sens |
|---|---|---|---|
| `version` | `1` | — | version du format |
| `description` | texte | — | libre |
| `seed` | entier | 1 | graine du combat (jets futurs, tirages du scénario si `scenarioSeed` absent) |
| `scenarioSeed` | entier | `seed` | graine des tirages du scénario (vagues suivantes, cadeaux, cartes) |
| `configOverrides` | objet | `{}` | surcharges de `sim/config/default.config.json` (hypothèses), même forme que le fichier |
| `turn` | entier ≥ 1 | **requis** | tour global |
| `players` | liste (1 à 4) | **requis** | joueurs **dans l'ordre de jeu** |
| `monsters` | liste | **requis** (peut être vide) | Troolls présents (et état de la Mama) |
| `current` | texte ou entier | premier joueur vivant | personnage dont c'est le tour : `"J2"`, nom affiché (`"Dompteur 1"`), archétype (`"magicien"`, premier de ce type) ou rang (0 = J1) |
| `objectives.completed` | liste d'identifiants | `[]` | objectifs déjà réalisés, **dans l'ordre** (récompenses du jeu appliquées : sorts appris, Faveur de la Mama −5 % par objectif) |
| `objectives.active` | identifiant ou `null` | Empalé si rien n'est réalisé ; sinon l'objectif tiré au vote | objectif en cours (`null` : aucun), actif depuis le début du tour du personnage courant |
| `gifts` | liste de cases | `[]` | cases portant un cadeau (les cadeaux apparus pendant la reconstruction sont retirés) |

Identifiants d'objectifs : `empale`, `soleil`, `sol_glissant`, `meurtres_serie`, `productivite`, `sauvez_le`,
`ebranlable`, `stop_projectiles`, `toi_par_ici`, `prendre_sa_place`, `faire_le_mur`, `pas_le_temps`,
`distance_insecurite`, `attirance`, `trous_troolls`, `pierre_trois_coups`, `tout_va_bien`, `solitude`, `quintuple`,
`au_coin`, `meme_pas_mal`.

### Joueur (`players[i]`)

| Champ | Type | Défaut | Sens |
|---|---|---|---|
| `archetype` | `acrobate` \| `dompteur` \| `magicien` | **requis** | |
| `name` | texte | nom de l'archétype, numéroté en cas de doublon (« Dompteur 1 ») | |
| `cell` | case | case de départ | case jouable |
| `hp` | entier | PV max | PV courants (bornés par les PV max) |
| `eroded` | entier | 0 | PV max érodés |
| `dead` | booléen | faux | joueur mort |
| `spells` | liste de niveaux de sort | automatique | grimoire complet ; défaut : Frappe Repoussoir + sort de départ + un sort par objectif réalisé (ordre du Spell Manager) |
| `upgrades` | liste de niveaux de sort **de base** | `[]` | sorts améliorés (carte « Amélioration : X » : le sort de base est remplacé par sa version améliorée) |
| `uniques` | liste de niveaux de sort | `[]` | sorts uniques possédés (effet d'obtention appliqué, ex. Relâchement de Fureur) |
| `bonuses` | objet `{ caractéristique: nombre de cartes }` | `{}` | Acclamations reçues : `ap`, `mp`, `range`, `finalDamagePct` (Dompteur), `critPct`, `critDamage`, `pushDamage` (Acrobate), `resPct`, `resPctMelee`, `resPctRanged`, `vitality`, `finalHealPct` (selon l'archétype) |
| `states` | liste | `[]` | `vulnerable` (hors des pics : vulnérabilité de sortie, ×2 jusqu'à son tour), `inebranlable` |
| `ap`, `mp` | entiers | tous | personnage courant seulement : PA / PM restants |

### Monstre (`monsters[i]`)

| Champ | Type | Défaut | Sens |
|---|---|---|---|
| `type` | `troollibre` \| `artroolleur` \| `nitrooll` \| `mama` | **requis** | |
| `cell` | case | requise (sauf Mama) | un monstre placé **sur une case de pics** y entre (−2 000, Vulnérable, ×2), comme en jeu ; ses PV sont ensuite fixés à `hp` |
| `hp` | entier | PV max | |
| `eroded` | entier | 0 | PV max érodés |
| `dead` | booléen | faux | Mama : morte |
| `states` | liste | `[]` | `vulnerable`, `inebranlable` |

Les Troolls de la situation **remplacent** ceux du combat reconstruit ; ils jouent, dans l'ordre de la liste, en
alternance avec les joueurs (J1, M1, J2, M2…, Mama en tête). L'entrée `mama` décrit seulement la Mama (case, PV,
morte) : avant le T8 elle attend sur 152 (sa case est alors ignorée, avertissement) ; à partir du T8 elle est arrivée
(Rassemblement joué pendant la reconstruction) et peut être placée n'importe où.

## Reconstruction (ce que fait `buildSituation`)

1. Combat neuf (composition, graine, surcharges), avancé **passivement** (joueurs qui passent, monstres passifs,
   choix : première option) jusqu'au tour du personnage courant au tour demandé : vagues, cadeaux, arrivée de la
   Mama et Rassemblements se déroulent comme en jeu.
2. Troolls de la situation créés (sort de départ), anciens Troolls retirés.
3. Objectifs réalisés validés dans l'ordre (récompenses du jeu).
4. Ordre de jeu du tour recalculé ; le combat reste au tour du personnage courant.
5. Placement de tous les combattants par **téléportation du moteur** (entrées / sorties des pics traitées), états
   demandés, PV.
6. Cadeaux, grimoires, Acclamations (celles de l'avancée passive sont retirées), PA / PM restants.
7. Objectif en cours activé comme s'il l'était depuis le début du tour (compteurs « pendant le tour » armés, case de
   « Prendre sa place » marquée…).

Les avertissements (éléments ignorés) sont affichés par la CLI. Limites : les envoûtements autres que Vulnérable /
Inébranlable (boucliers, boosts de sorts, Relâchement en cours de montée…) ne sont pas décrits ; les compteurs d'un
objectif en cours démarrent à zéro ; les tours précédents ne sont pas rejoués (relances de sorts remises à zéro).
Pour un état exact en cours de combat, utiliser une **trace** (`simuler --trace`, puis `planifier --trace trace.json
--tour 5 --joueur J2`).

## Trace rejouable

`npm run cli -- simuler --compo ADDM --graine 42 --trace trace.json` écrit la trace du combat : mise en place
(`setup` : joueurs, graines), surcharges de configuration, puis chaque pas (`steps`) :

| Pas | Champs |
|---|---|
| lancer réussi | `{ "k": "cast", "f": id, "s": niveau de sort, "c": case, "t": tour }` |
| déplacement réussi | `{ "k": "move", "f": id, "p": [chemin] ou case, "a": sans traverser les pics, "t": tour }` |
| fin de tour | `{ "k": "end", "f": id, "t": tour }` |
| réponse à un choix | `{ "k": "choice", "l": liste, "f": joueur (−1 : équipe), "a": index ou { "votes": [...] }, "t": tour }` |

Le rejeu (`replayTrace`, API publique uniquement) reproduit exactement le combat (mêmes jets) ; on peut s'arrêter au
début du tour d'un combattant (`--tour`, `--joueur` : `J1`…`J4`, nom ou id) ou après un nombre de pas (`--etape`).
