# Données brutes DofusDB — Gladiatrool

Extraction du 2026-09-28T12:30:22+00:00 depuis https://api.dofusdb.fr (données du client DOFUS 3). Toutes les données de ce dossier sont des **FAITS vérifiés (source primaire)** ; les interprétations sont dans `decoded_spells.md` avec niveau de confiance.

## Fichiers

| fichier | contenu | nb |
|---|---|---|
| `spells.json` | dict id → objet sort complet (/spells) | 373 |
| `spell_levels.json` | dict id → niveau de sort complet (/spell-levels), effets normaux + critiques | 642 |
| `effects.json` | dict effectId → définition complète (/effects) des effets rencontrés | 106 |
| `effects_catalog_fr.json` | catalogue COMPLET des effets : description FR/EN + classification des paramètres (sort/monstre/état) | 872 |
| `spell_states.json` | dict id → état (/spell-states) référencé | 268 |
| `monsters.json` | dict id → monstre (/monsters) : race 313 + invoqués/référencés | 22 |
| `monster_races.json` | races des monstres extraits | 4 |
| `spell_types.json` | types de sorts (/spell-types) des sorts extraits | 116 |
| `maps.json` | map-positions 139988485 (arène, instance de combat) et 139725313 (extérieur) + sous-zone 84 | 2 |
| `provenance.json` | graphe de références (sort→sort/monstre/état), provenance de chaque objet, cellIds explicites, non-résolus | 2549 |
| `summary.json` | paramètres et comptes de l'extraction |  |
| `decoded_spells.md` | décodage lisible de tous les sorts, groupés par thème |  |

## Comptes

| clé | valeur |
|---|---|
| spells | 373 |
| spells_in_range | 284 |
| spells_seeds | 312 |
| spells_added_by_closure | 61 |
| spell_levels | 642 |
| effects_normal | 2663 |
| effects_critical | 123 |
| distinct_effect_ids | 106 |
| states | 268 |
| monsters | 22 |
| races | 4 |
| spell_types | 116 |
| reference_edges | 2549 |
| cell_refs | 1022 |
| unresolved | 1 |
| closure_rounds | 6 |

Requêtes HTTP lors du dernier run : 187 (cache : 26 hits), durée 99.7 s.

## Points saillants (calculés depuis les données)

- **Pics** : sort 30390 « Glyphe de combat » niv.1 (spell-level 80489), effet `401` Pose un glyphe de début de tour (couleur #FF0000) sur **100 cellules distinctes** (102 listées, doublons [351, 455]) : `[131, 132, 133, 144, 145, 146, 147, 148, 149, 157, 158, 159, 160, 161, 162, 163, 171, 172, 177, 178, 184, 185, 191, 192, 198, 199, 206, 207, 211, 212, 220, 221, 225, 226, 235, 236, 239, 249, 250, 253, 264, 266, 267, 277, 278, 281, 292, 293, 294, 295, 305, 306, 309, 320, 321, 322, 323, 333, 334, 337, 348, 351, 361, 362, 365, 366, 375, 376, 379, 380, 388, 389, 394, 395, 402, 403, 408, 409, 415, 416, 423, 424, 429, 430, 437, 438, 439, 440, 441, 442, 443, 452, 453, 454, 455, 456, 457, 467, 468, 469]`. Rendu ASCII : section « Cellules explicitement référencées » de decoded_spells.md.
- **Pics** : sort 30390 « Glyphe de combat » niv.1 (spell-level 80489), effet `1091` Pose un glyphe-aura (couleur #FF0000) sur **100 cellules distinctes** (102 listées, doublons [351, 455]) : `[131, 132, 133, 144, 145, 146, 147, 148, 149, 157, 158, 159, 160, 161, 162, 163, 171, 172, 177, 178, 184, 185, 191, 192, 198, 199, 206, 207, 211, 212, 220, 221, 225, 226, 235, 236, 239, 249, 250, 253, 264, 266, 267, 277, 278, 281, 292, 293, 294, 295, 305, 306, 309, 320, 321, 322, 323, 333, 334, 337, 348, 351, 361, 362, 365, 366, 375, 376, 379, 380, 388, 389, 394, 395, 402, 403, 408, 409, 415, 416, 423, 424, 429, 430, 437, 438, 439, 440, 441, 442, 443, 452, 453, 454, 455, 456, 457, 467, 468, 469]`. Rendu ASCII : section « Cellules explicitement référencées » de decoded_spells.md.
- 30390 niv.2 = glyphe-aura (entrée dans les pics) : État etat 5902 «ennemiHasTriggeredCombatGlyph» [cible `Def,A`, trig `I`, durée -1] ; État etat 5903 «allyHasTriggeredCombatGlyph» [cible `Atq,A`, trig `I`, durée -1] ; État etat 5994 «Vulnérable» [cible `Def,A`, trig `I`, durée -1] ; État etat 5994 «Vulnérable» [cible `Atq,A`, trig `I`, durée -1] ; 2000 dommages Neutre [cible `Atq,A`, trig `I`, durée 0] ; 2000 dommages Neutre [cible `Def,A`, trig `I`, durée 0] ; Dommages subis x200% [cible `Def,A`, trig `D`, durée -1]
- 30390 niv.3 = glyphe de début de tour (commencer son tour dans les pics) : 1000 dommages Neutre [cible `Atq,A`, trig `I`, durée 0] ; 1000 dommages Neutre [cible `Def,A`, trig `I`, durée 0]
- 30700 → 30701 (passif de tous les Troolls via 30694 « Trooler » et des joueurs via 30639) : quand l'état 5902/5903 (« a déclenché le glyphe ») est PERDU (`EOFF`), le porteur reçoit : État etat 5994 «Vulnérable» [durée 1] ; Dommages subis x200% [durée 1]
- Boss : 30609 « Rassemblement Troollesque [Passe-tour + TP T5] » niv.3 vise la cellule **[300]** (centre de l'anneau de pics) ; niv.4 = téléportation (zone C63). Niv.1 porte un `delay` de 7 sur ses effets.
- Déblocage des sorts (30626 « Spell Manager », lancé par chaque « Reward » d'objectif) : niv.1: Dompteur → 30396 Grondement Grandissant, Acrobate → 30408 Hanedimane, Magicien → 30410 Regain Vigoureux | niv.2: Dompteur → 30397 Prélèvement, Acrobate → 30404 Voltige, Magicien → 30411 Amplification | niv.3: Dompteur → 30398 Détonation, Acrobate → 30405 Aïronemane, Magicien → 30414 Protection Prolongée | niv.4: Dompteur → 30399 Coup de Sang, Acrobate → 30406 Pugnace, Magicien → 30415 Délivrance | niv.5: Dompteur → 30400 Jaillissement, Acrobate → 30403 Soutien Stratégique, Magicien → 30412 Vents Contraires | niv.6: Dompteur → 30401 Ombre Fracassante, Acrobate → 30407 Va-t-en-guerre, Magicien → 30413 Vague de Dégradation. Sorts de départ (hypothèse : sort 1 de chaque archétype) : Impact 30395, Videur 30402, Pulsation d'Énergie 30409.
- Monstres race 313 : 7980 Gladiatroolleur (niv 200, 30000 PV, 8 PA, 4 PM, Force 6000, sorts [30416]) ; 7981 Troollibre (niv 200, 25000 PV, 11 PA, 6 PM, Force 4000, sorts [30380, 30381, 30382]) ; 7982 Artroolleur (niv 200, 19000 PV, 11 PA, 5 PM, Force 3000, sorts [30383, 30384]) ; 7983 Nitrooll (niv 200, 22000 PV, 12 PA, 5 PM, Force 3500, sorts [30385, 30387, 30388, 30386]) ; 7984 Mama Troollette (niv 1000, 150000 PV, 20 PA, 6 PM, Force 4500, sorts [30389, 30392, 30393, 30394]) ; 7985 Stratège Dompteur (niv 200, 5500 PV, 0 PA, 0 PM, Force 0, sorts []).
- 7980 « Gladiatroolleur » a pour sort de départ 30639 « Gladiatrooller [Passif] » qui applique des bonus selon l'état d'archétype du porteur (5899 Dompteur : +3000 Puissance ; 5900 Acrobate : +5000 Vitalité ; 5901 Magicien : −5000 Vitalité) et fixe la durée de tour à 60 s ⇒ HYPOTHÈSE forte : les joueurs sont transformés en Gladiatroolleur (sort commun 30416 « Frappe Repoussoir »).
- Aucun effet d'invocation des données client ne fait apparaître les Troolls [7980, 7981, 7982, 7983, 7984] ⇒ les vagues d'apparition (quels monstres, à quel tour, sur quelles cellules) sont gérées côté serveur : à établir par observation (vidéos/guides).
- Bizarrerie : spell-level 80750 introuvable (404 /spell-levels), référencé par 30475 Amélioration : Jaillissement — l'amélioration correspondante pourrait être cassée ou la donnée manquer côté DofusDB.

## Périmètre de l'extraction

- Plage principale : sorts d'id 30370..30700 (tous).
- Plage étendue 30701..30800 filtrée par typeId ∈ [3834, 3864, 3872, 3883, 3915, 3919, 3920] (types partagés avec les sorts Gladiatrool : MANAGERS, PASSIVE SPELLS, Sort uniques, Déclenchés Glyphe, Déclenchés Mama Troollette, Trooler).
- Recherches par nom : {'name.fr': ['Trool', 'Gladia'], 'adminName': ['Trool', 'Gladia']} (Feathers `$regex`).
- Monstres de la race [313] + tout monstre invoqué (effets « Invoque : #1 », 181/1008/1011...) ou ciblé par masque (`F<id>`/`f<id>`), avec leurs sorts et `startingSpellId`.
- Fermeture récursive : tout sort référencé par un effet (description `#1` = lancement de sous-sort : 792, 1160, 2160, 1017-1019, 2017, 2792, 2794, 2960… ; pose de glyphe/piège/rune 400/401/402/1091/1165 ; modificateurs `#1 : …` ; 406 ; 3405/3406 via id de spell-level), détecté génériquement à partir du catalogue d'effets (`effects_catalog_fr.json`, champ `params`).
- États : effets 950/951/952 (`value`), masques `E<id>`/`e<id>` (avec ou sans `*`), `statesCriterion` (`HS=<id>`, `HS!<id>`), triggers `EON<id>`/`EOFF<id>`.
- Limite connue : DofusDB **n'expose pas les cellules de la carte** (`/maps/<id>` → 404) ; seules les map-positions et l'image (`https://api.dofusdb.fr/img/maps/1/139988485.jpg`) sont disponibles. Les cellules des pics viennent des `cellIds` des sorts.

## Relancer

```bash
cd /home/user/GladiatroolSimu
python3 tools/dofusdb/extract.py            # cache : ~/.cache/gladiatrool-dofusdb (ou $DOFUSDB_CACHE / --cache-dir)
python3 tools/dofusdb/extract.py --refresh  # forcer le re-téléchargement
python3 tools/dofusdb/decode.py             # régénère decoded_spells.md et INDEX.md
```

Le script est idempotent : même cache → mêmes fichiers (hors horodatage de `summary.json`). Stdlib uniquement ; proxy/CA pris dans l'environnement (HTTPS_PROXY, SSL_CERT_FILE).

