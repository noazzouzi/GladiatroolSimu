# 50 — Balayage web (hors DPLN) : Gladiatrool (DOFUS 3 / Unity)

> Rédigé le 28/09/2026 (agent « balayage web »). Périmètre : tout ce qui est trouvable en ligne **hors** le guide
> Dofus pour les Noobs (DPLN, déjà exploité ailleurs, relu ici uniquement pour savoir ce qui est connu et
> pour signaler les contradictions).
>
> **Légende de fiabilité**
> - **[OFF]** FAIT officiel Ankama (devblog, notes de mise à jour, correctifs, propos de game designers en live).
> - **[DATA]** FAIT vérifié dans les données du client (API DofusDB) — contrôle ponctuel seulement, les autres agents font l'analyse complète.
> - **[RAP]** FAIT rapporté par des joueurs (forum, vidéo, commentaire). Fiabilité selon le nombre de sources concordantes.
> - **[HYP]** HYPOTHÈSE (déduction de l'auteur de cette note).
> - Confiance : **haute / moyenne / basse**.
>
> Attention homonymie : il existe un **autre** « Gladiatrool » sur **DOFUS Rétro** (1.39, nov. 2022 ; refonte 1.45),
> totalement différent (10 salles, 1-2 joueurs, vraies classes, Notend Less). Une grande partie des résultats web
> (GUIDACTIK, Astra/Orion wiki, forums 2022-2023, vidéos « double Éca ») concerne **Rétro** et a été écartée.
>
> Les transcriptions YouTube brutes et les pages HTML téléchargées sont dans le scratchpad (non versionnées) :
> `/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/yt/` et `.../scratchpad/web/`.

---

## 0. Réponses courtes aux questions clés

| Question | Réponse | Statut / confiance | Sources principales |
|---|---|---|---|
| Une vague par tour global ? | Oui : « des trolls apparaissent tous les tours pendant 10 tours », « 1 vague tous les tours ». | [OFF]+[RAP] haute | DPLN màj 2.73 ; live Ankama 10/09/2024 ; Koclikoo (forum 12/06/2025) |
| Les vagues arrivent-elles même si la précédente n'est pas morte ? | Oui, **accumulation** : « sinon ils s'accumulent », « submergé de mobs », 14 mobs tués en un tour par Huz. | [RAP] haute | Mishurra (26/09/2024) ; Abnihs (forum 08/12/2024) ; Huz (09/11/2024) ; commentaires |
| Après la vague 10 ? | Plus aucune vague : « à partir du tour 10 il n'y a plus de vague, vous pouvez gagner tour 10 ou tour 11 ». | [OFF] haute | Live Ankama 10/09/2024 (propos du GD) |
| Condition de victoire | **Tuer tous les ennemis une fois les 10 vagues apparues** (Mama incluse). Tuer Mama ne suffit PAS (plusieurs joueurs ont perdu en le croyant). | [OFF]+[RAP] haute | Live Ankama ; Matspyder4 (forum 26/09/2024) ; Houmilito (31/10/2024) ; Zephiron (11/02/2025) ; Fielon (DPLN Disqus 15/12/2024) |
| Condition de défaite | Tous les alliés morts (combat standard). Gagner avec 1 seul survivant est possible. | [RAP] haute | Fielon ; Huz |
| Limite de tours ? | Aucune limite connue. L'idée « au tour 11 le combat s'arrête » est une spéculation de joueurs non confirmée. | [RAP]/[HYP] moyenne | Houmilito (spéculation) vs live Ankama |
| Tour d'arrivée de Mama | **Tour 8** (vague 8) ; certains disent « fin T7 / début T8 ». « 7 ou 8 » (Skaradon) est une approximation. | [RAP] haute (7 sources) | Koza, cardxc, Houmilito, Mishurra, Zephiron, Koclikoo, bug report 19/01/2025 |
| PV de Mama | **150 000 PV, niveau 1000, 20 PA, 6 PM** | [DATA] haute | DofusDB monster 7984 ; Zephiron « 150000 » ; live Ankama « niveau 1000 » |
| Rendre Mama vulnérable | La pousser dans les pics (glyphe de bord) ; si elle est Inébranlable → l'échanger de place (Voltige) pour la mettre dans le glyphe. | [RAP] haute (poussée) / moyenne (Voltige) | Skaradon, Mishurra, Koza, Houmilito |
| Initiative des joueurs | **Depuis le correctif du 14/01/2025 : ordre d'entrée dans le combat.** (Avant : semi-aléatoire mais fixe à compo égale.) | [OFF] haute | Correctif 14/01/2025 |
| Glyphes évènementiels (cadeaux) | Case aléatoire, un nouveau **à chaque tour** (à partir du T2 selon Zephiron) ; marcher OU être poussé dessus déclenche. | [OFF]+[RAP] moyenne-haute | Live Ankama ; devblog ; Zephiron ; sspritenL |
| Obstacles « en temps réel » | Aucun témoignage d'obstacles apparaissant. En sept. 2024 les GD disaient que la « terraformation » était souhaitée mais techniquement lourde. | [OFF] moyenne | Live Ankama 10/09/2024 |
| Meilleures compos | Acrobate–Dompteur–Dompteur–Magicien (6 sources) et Acrobate–Acrobate–Dompteur–Magicien (≥5 sources), Acrobate toujours premier, Magicien dernier (sauf Koclikoo : Acro-Acro-**Magicien**-Dompteur). | [RAP] haute | voir §8 |

---

## 1. Chronologie officielle et évolutions (patch notes)

| Date | Version | Fait | Source | Statut |
|---|---|---|---|---|
| 09/09/2024 | Devblog 2.73 | Présentation : archétypes, vagues « imprévisibles », glyphe permanent aux bordures, système de choix (2 à 4 options, probabilités + critères d'apparition), scénario de combat, **glyphes mono-cellule temporaires sur case aléatoire** (amélioration de sort / effet terrain / buff), objectifs de combat (→ nouveau sort + choix commun du prochain objectif), vagues « selon une logique propre au Gladiatrool ». Mama « observe depuis les gradins » et « rejoint le combat si elle juge ses protégés en difficulté ». | https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737504-devblog-2-73-gladiatrool | [OFF] haute |
| 09/09/2024 | Devblog Foire du Trool | Jetons communs + jetons spécifiques (Gladiatons) ; calendrier : bêta Unity 12/09, Flash 17/09 (sans Gladiatrool), 13/11 compléments bêta, décembre sortie officielle Unity. | https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737292-devblog-2-73-foire-trool | [OFF] haute |
| 10/09/2024 | Tweet @DOFUS_EN | Gladiatrool décalé au **24/09/2024** sur la bêta Unity. | https://x.com/DOFUS_EN/status/1833542376008388905 | [OFF] haute |
| 10/09/2024 | AnkamaLive 2.73 (vu via la rediffusion commentée de Huz, https://www.youtube.com/watch?v=CY_cgLRjkoM) | Voir §2 : 4 joueurs max, jouable à 3 « si vous voulez du challenge », valeurs ×10 volontaires, 7 sorts max par archétype, ~15 sorts uniques, bonus à chaque début de tour, glyphe cadeau à chaque tour, Mama état 5, fin des vagues au T10, Mama niveau 1000. | vidéo, 11:00–67:00 | [OFF] (oral) haute |
| 25/09/2024 | Tweet @DOFUSfr | Gladiatrool disponible sur la bêta Unity. | https://x.com/DOFUSfr/status/1838958550233526625 | [OFF] |
| 01/10/2024 | Patch bêta | Sorts : « Namydnah » (=Hanediman) corrigé ; Impact ne mentionne plus d'invocations ; Malédiction Collatérale (% aligné) ; Un pour un (valeur de réduction de dommages finaux affichée) ; **certaines améliorations de l'Acrobate n'avaient pas d'effet → corrigé** ; descriptions d'objectifs ; carte (animations, position du micro). | https://www.dofus.com/en/forum/1181-patch-notes/343910-unity-beta-changelog-patch-notes-october-1st-2024 | [OFF] |
| 08/10/2024 | Patch bêta | Icône de « Vague de Dégradation » ; animation « Mortrooll » de l'Artroolleur ; état de l'objectif **Productivité** (compteur de sorts) ; l'état **« Sauvez-le » persiste pendant un tour global**. | https://www.dofus.com/en/forum/1181-patch-notes/343935-unity-beta-changelog-patch-notes-october-8-2024 | [OFF] |
| 03/12/2024 | MàJ 3.0 | « L'attraction "Gladiatrool" arrive en jeu ». | https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3/details | [OFF] |
| 04/12/2024 | Tweet DPLN | Guide DPLN publié (« accessible dès le niveau 50, sans stuff »). | https://x.com/DPLNofficiel/status/1864353985487872358 | — |
| 14/01/2025 | Correctif 3.0 | **« Gladiatrool : l'ordre du tour de jeu des joueurs est désormais conditionné à l'ordre d'entrée dans le combat. »** | https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3/correctifs/1760946-correctif-14-01-2025 | [OFF] haute |
| 19/01/2025 | (bug) | Combat cassé : pas de choix de rôle, aucun Troll ne spawn pendant 8 tours, Mama arrive **au tour 8** et tue tout le monde. | https://www.dofus.com/fr/forum/2011-divers/2432860-bug-gladiatrool-completement-inutilisable | [RAP] |
| 21/01/2025 | Correctif 3.0 | « Le combat du Gladiatrool fonctionne à nouveau correctement » + sorts anormalement **grisés** (gain de sorts…) corrigés. | https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3/correctifs/1761082-correctif-21-01-2025 | [OFF] |
| 22/04/2025 | MàJ 3.1 | « La timeline du combat Gladiatrool fonctionne à nouveau correctement » (les monstres des vagues n'apparaissaient pas dans la timeline). | https://www.dofus.com/fr/mmorpg/actualites/maj/1762717-operation-consolidation/details | [OFF] |
| 23/09/2025 | MàJ 3.3 | Chat utilisable pendant l'interface de choix (ex : Gladiatrool). | https://www.dofus.com/fr/mmorpg/actualites/maj/1765214-puits-songes-infinis/details | [OFF] |
| 30/09/2025 | Patch 3.3.5.5 | Bug corrigé : « Les pics sur les bords de la carte de combat du Gladiatrool ne font plus de dégâts ». (⇒ bug temporaire introduit par la 3.3.) | https://www.dofus.com/fr/mmorpg/actualites/maj/1765214-puits-songes-infinis/correctifs/1765459-patch-notes-3-3-5-5-30-09-2025 | [OFF] |
| 05/05/2026 | Patch 3.5.14.18 | Bug corrigé : combat bloqué quand un choix est proposé **en fin de tour puis au début du tour suivant** (⇒ il existe bien des choix de fin de tour ET de début de tour). | https://www.dofus.com/fr/mmorpg/actualites/maj/1768057-repos-braves/correctifs/1769600-patch-notes-3-5-14-18-05-05-2026 | [OFF] |
| 19/05/2026 | Patch 3.5.16.20 | Tatouages/dragodindes/ressources déplacés vers la boutique Gladiatons ; prix Gladiatons augmentés (≈ ×2 d'après joueurs). | https://www.dofus.com/fr/mmorpg/actualites/maj/1768057-repos-braves/correctifs/1769817-patch-notes-3-5-16-20-19-05-2026 | [OFF] |
| 23/06/2026 | MàJ 3.6 | « Le Gladiatrool donne ×2 Gladiatons au lieu de 1 pour une victoire. » | https://www.dofus.com/fr/mmorpg/actualites/maj/1770516-raid-not-dead/details | [OFF] |

**Aucun changement d'équilibrage chiffré** (PV, dégâts, vagues, sorts) du Gladiatrool n'a été trouvé dans les 67 pages
de notes de mise à jour 3.0 → 3.6 (crawl complet des « détails » + tous les correctifs, recherche « gladia|trool|mama|layool »).
Les chiffres de la bêta (sept.–nov. 2024) semblent être restés ceux du live (sauf corrections de bugs).
[OFF] confiance moyenne-haute (les patchs bêta 25/09, 15/10, 24/10, 30/10, 07/11/2024 ne mentionnent pas non plus de rééquilibrage).

---

## 2. Propos officiels des game designers (AnkamaLive 10/09/2024)

Source : rediffusion commentée par Huz, https://www.youtube.com/watch?v=CY_cgLRjkoM (le live original Ankama n'a pas été
retrouvé en VOD séparée). Propos oraux, transcription automatique → **[OFF] oral, confiance moyenne-haute**.

- **Effectif** : « faisable à quatre joueurs maximum, pas faisable tout seul (quasiment impossible), à trois en galère mais ça se fait, à quatre ça se fait » (14:00). « Si vous le faites à 3 c'est que vous voulez du challenge » (61:00). Refus d'aller à 8 : équilibrage pensé pour 4, pas de « sac à PV » (64:30–66:00).
- **Archétypes** : 3 (Dompteur = DPS de zone, Acrobate = placement, Magicien = soin/boost/entrave) ; plusieurs fois le même archétype autorisé (16:00). Choix de l'archétype = premier choix au début du combat (44:30).
- **Valeurs ×10 volontaires** (« vous tapez du 10 000 ») pour la satisfaction visuelle (66:30–67:00).
- **Objectifs** : choix commun par **vote**, majorité ; **égalité → tirage aléatoire** entre les deux (49:00). Premier objectif commun à tous : tuer au moins un Troll entré dans les pics et Vulnérable (46:00). Chaque objectif réussi : nouveau sort d'archétype + Mama perd un cran de son état (« au début elle était en état 5 ») et des dommages finaux (48:30).
- **Bonus** : « à chaque début de tour vous avez un petit choix, en fonction de votre archétype, pour rendre votre personnage plus fort de façon infinie » ; « bonus aléatoires en fonction de votre classe » (46:30–47:00).
- **Glyphes cadeaux** : « il y en a qui vont pop à tous les tours de manière aléatoire sur le terrain » ; choix = améliorer un sort OU obtenir un sort unique à usage unique (49:30–51:00). Exemple montré : amélioration d'Impact cercle 2 → cercle 3 + lancers/tour.
- **Sorts** : chaque archétype peut gagner **jusqu'à 7 sorts**, tous améliorables ; **~15 sorts uniques** (60:00–60:30). **Pense Vite : « au prochain tour 1000 PA mais seulement 15 secondes »** (19:30).
- **Glyphe de bord** : « zone de danger permanente, utile pour les ennemis et pour les alliés » (20:30) ; « augmente les dégâts que vous subissez ou que les mobs subissent » (48:00).
- **Fin de combat** : « la Mama arrive à un moment pour aider ses petits enfants… il reste un peu de mob à tuer et après c'est la fin du combat » ; « **à partir du tour 10 il n'y a plus de vague**, donc normalement vous pouvez gagner tour 10 ou tour 11 ; ça dure 10 tours » ; « **Mama Troollette niveau 1000**, pas mal de points de vie » (53:00–53:30). Run ≈ 10–15 min.
- **Initiative** : impossible de changer l'initiative selon l'archétype dans l'outil actuel ; « idéalement l'acrobate joue en premier, puis le magicien, puis le dompteur » (58:00–58:30).
- **Terrain évolutif** : obstacles apparaissant = « terraformation », souhaitée mais « chantier solide » car serveur ; « est-ce qu'on pourra le faire, je sais pas » (51:30–52:30). ⇒ les « obstacles en temps réel » évoqués par DPLN ne sont probablement **pas** implémentés [HYP, moyenne].
- **Pas de succès** associés au Gladiatrool (25:00).

---

## 3. Structure temporelle du combat

- **10 vagues, une par tour global** : DPLN màj 2.73 « Des trools apparaissent tous les tours pendant 10 tours » (https://www.dofuspourlesnoobs.com/mise-a-jour-273.html) ; Koclikoo « Il faudra tuer 10 vagues de Trooll (Mama Troollette vague 8), 1 vague tous les tours » (forum, 12/06/2025) ; Zephiron « 10 turnos enteros y en cada turno saldrán bichos aparte del mismo jefe » (04:00). [RAP]+[OFF] haute.
- **Composition des vagues** : figée d'une partie à l'autre selon les joueurs (Koza : « c'est toujours pareil… c'est vraiment des combats aléatoires en fonction des bonus », 14:00 ; Koza « c'est le même placement à chaque fois », 02:30). Le devblog parlait de vagues « imprévisibles » → **contradiction** (voir §11). Concordance avec la liste DPLN : Zephiron voit « seis bichos » à la dernière vague (22:30) = vague 10 DPLN (2 Nitroolls + 2 Troollibres + 2 Artroolleurs) ; cardxc : T1 = deux Troollibres (03:30) = vague 1 DPLN. [RAP] moyenne-haute.
- **Accumulation** : les vagues arrivent même si la précédente vit encore — Mishurra : « essayez d'éliminer le plus de monstres possible à chaque vague, sinon ils s'accumulent » (07:10) ; Abnihs : « on se retrouve rapidement submergé de mobs » ; commentaire YouTube (miroslave7668) « chaque fois je me fais surprendre par trop de mobs, je ne passe jamais la vague 6 » ; Huz tue **14 mobs en un tour** en fin de partie (https://www.youtube.com/watch?v=ShlRLUWn7VM&t=1380s). [RAP] haute.
- **Mama n'arrête pas les vagues** : après sa mort, les vagues 9 et 10 arrivent encore — cardxc : « la Mama est morte… il va rester seulement deux vagues, il y a seulement 10 vagues » (21:00–21:30). [RAP] haute.
- **Victoire** : tous les ennemis morts après la vague 10. Matspyder4 (26/09/2024) : « la condition de victoire n'est pas affichée (je pensais qu'il fallait tuer la mama, j'ai perdu une try comme ça) » ; Houmilito (125:00) : Mama tuée → « il faut tuer le reste… on le savait pas » → défaite ; (204:30) « c'est pas fini le combat, faut les tuer » ; Zephiron : « esto no termina, termina el turno 10 si limpian todas las oleadas » (21:30) ; Fielon (Disqus DPLN, 15/12/2024) : « une fois le boss vaincu et plus que quelques trolls, on peut les kiter, c'est encore gagnable » (victoires avec 1 seul perso vivant). [OFF]+[RAP] haute.
- **Limite de tours** : aucune source fiable. Houmilito (158:00–158:30) spécule « au tour 11 le combat est fini peu importe où tu en es » puis ne le vérifie pas (ils meurent). Le GD dit « vous pouvez gagner tour 10 ou tour 11 », ce qui décrit le cas où tout est tué rapidement, pas une limite. [HYP] : **pas de limite de tours** ; à confirmer par les données (sorts « Finish Fight Trigger » / « Spell Manager » côté DofusDB).
- **Pauses** : chaque choix met le combat en pause ~30 s (DPLN) ; bug 05/05/2026 prouve qu'il peut y avoir un choix **en fin de tour** puis un autre **en début de tour suivant**.
- **Durée d'une run** : 6–8 min (Laltoss, 7 mois de farm, 12/06/2025 ; ralentie par les animations 3.1), 10–15 min (cardxc, Zephiron, GD), 15 min (Willseir, Warning-Blast), 24 min (Huz 1re run 4 comptes), 25–30 min (Fielon). [RAP].

---

## 4. Mama Troollette

| Point | Détail | Statut / confiance | Source |
|---|---|---|---|
| Stats | Niveau 1000, **150 000 PV**, 20 PA, 6 PM ; sorts monstre 30389, 30392, 30393, 30394 | [DATA] haute | https://api.dofusdb.fr/monsters/7984 |
| PV lus en jeu | « 150 000 de vida » ; Huz lit « 137 150 000 » (= 137 xxx / 150 000 probablement) | [RAP] | Zephiron 18:30 ; Huz kGlKYY7_qew 19:00 |
| Présence | Visible dès le début sur le côté (gradins) et dans la timeline | [RAP] | Houmilito 30:00 ; DPLN |
| Arrivée | **Tour 8** (fin T7 / début T8). « Elle arrive bien tour 8… c'est pas 7 » | [RAP] haute | Houmilito 157:30 ; Koza 14:30 ; cardxc 11:30 ; Mishurra 06:32 ; Zephiron 18:30 ; Koclikoo ; bug 19/01/2025 |
| Entrée | Saute sur le terrain, **pousse tout le monde** (« elle nous balance direct dans les pics ») | [RAP] haute | cardxc 19:30 ; Koza 17:00 ; DPLN |
| Focus au spawn | « l'IA décide parfois de faire un giga focus sur un seul perso sur son tour de spawn (impossible à esquiver), il prend **−21 000** et meurt » ; Huz : Dompteur full vie (≈20 000) tué au pop, puis « −10 000 » | [RAP] moyenne | Matspyder4 (forum 26/09/2024) ; Huz 18:30–19:30 |
| Arrivée « à vide » | Parfois « elle fait rien de spécial » | [RAP] | Huz ShlRLUWn7VM ≈17:00 |
| **Bug/astuce cadeau** | Si Mama pousse un perso **sur une case cadeau**, cela annule son animation/dégâts et **elle passe son tour** ; idem si un autre monstre pousse un perso sur un cadeau | [RAP] moyenne (2 sources) | sspritenL (forum 07/01/2025) ; cardxc 19:30–20:00 |
| Vulnérabilité | Invulnérable ; la pousser dans les pics la rend vulnérable (1 tour selon DPLN) | [RAP] haute | Skaradon 01:50 ; Mishurra ; Koza 17:30 ; Houmilito 202:30 |
| Inébranlable ? | « la Mama est inébranlable, je peux pas la pousser » → solution : l'échanger de place avec **Voltige** pour la mettre dans le glyphe | [RAP] basse-moyenne (1 source) | Houmilito 199:30–200:00 |
| Kill | « la tuer en 1 ou 2 tours max » ; « parfois le même tour où elle apparaît, sinon au tour suivant » | [RAP] haute | loicleprodu29 (forum 08/12/2024) ; Koza 18:30 |
| Affaiblissement | État « V » = 5 crans ; chaque objectif réussi −1 cran / −5 % dommages finaux (max −25 %) | [OFF] | Live Ankama 48:30 ; Zephiron 05:00 ; DPLN |

Dégâts « one-shot » observés sur Mama (pour calibrer le simulateur) :
- Relâchement de Fureur seul : « −50/60 000 PV » (Koclikoo) ; « un peu plus de la moitié de ses PV » (cardxc 20:00–20:30, sort obtenu tôt → chargé longtemps).
- Malédiction Collatérale + Relâchement de Fureur : « permet de OS la Mama (environ 130k dégâts) » (Laltoss).
- Pense Vite (lancé T7) sur un Dompteur au T8 : « **−140 000 en un tour** » (Huz ShlRLUWn7VM ≈19:14) ; Zephiron « más de 100 000 » en un tour (21:00).

---

## 5. Monstres des vagues : PV, comportement / IA

**PV (contrôle DofusDB [DATA], haute)** — 7981 Troollibre 25 000 PV / 11 PA / 6 PM ; 7982 Artroolleur 19 000 / 11 / 5 ;
7983 Nitrooll 22 000 / 12 / 5 ; tous niveau 200. (7980 « Gladiatroolleur » 30 000 PV / 8 PA / 4 PM = mêmes stats
que les archétypes joueurs → [HYP] gabarit des personnages incarnés.) Barbe Douce confirme « Troollibre 25 000 HP » (≈01:06).

**Comportements rapportés [RAP]** :
- **Tour passé** : « quand ils sont dans les pics ou que vous êtes assez loin d'eux, ils skippent leur tour » ; exemple : monstre resté dans les pics → −2000 → meurt (cardxc 12:30, 14:30). « Les Troollibres passent parfois leurs tours dans les glyphes sans jouer » (sspritenL). « Parfois ils ne tapent pas ou ne bougent pas (bug) » (Zephiron 11:00). Confiance moyenne-haute (3 sources). ⇒ pour le simulateur : **IA passive si hors de portée** [HYP].
- **Distance** : les Artroolleurs tapent à distance ; cardxc/Zephiron recommandent de rester loin/au centre pour ne pas être touché.
- **Inébranlable** : Troollibres souvent Inébranlables (Patroolleur) → impossible à pousser, il faut les tuer (Barbe Douce, Huz, Childarksat). Nitrooll donne Inébranlable via Troollement de Tambour (DPLN). L'état n'est pas toujours affiché (après une transposition) (Willseir).
- **Soins** : Nitrooll soigne (Childarksat « este cura más encima »).
- **Focus** : Barbe Douce « pourquoi je me fais focus » (joueur Acrobate au contact). Pas d'info fiable sur la priorité de ciblage [HYP : cible la plus proche atteignable].
- **Invisibles au spawn** : « certains monstres deviennent invisibles au moment de leur apparition, affichés à une position différente de leur position réelle » (sspritenL, bug).
- **Timeline** : les monstres des vagues n'apparaissaient pas dans la timeline (bug corrigé en 3.1). Contournements : mettre un spectateur, **invoquer un Poutch** avec l'Acrobate, ou basculer « afficher les invocations » → [HYP] les Troolls de vagues sont gérés comme des **invocations** du scénario (cf. cardxc « finir de clean toutes les invoques », « la Mama qui fait apparaître tous les troules »).
- **Positions d'apparition** : aucune source web ne donne de cellules. Indices : placement T1 identique à chaque run (Koza), l'Acrobate joué en premier « pousse les deux Troollibres » dès le T1 (cardxc 03:30) ⇒ [HYP] spawns fixes par vague. À établir par vidéo/frames ou données.

---

## 6. Glyphes

### 6.1 Glyphe de bord (« pics »)
- **Largeur ≈ 2 cases** en bordure : « une zone hérissée de 2 cases de large sur les bords de la carte » (Mishurra, transcription traduite automatiquement, ≈02:22). [RAP] moyenne → à vérifier sur la carte (agent 41).
- **Dégâts** : 2000 neutres à l'entrée (Koza 09:00 « les pics 2000 dégâts neutres » ; cardxc 11:00 « 2000 dégâts ») et **2000 au début du tour** d'une entité qui y commence (cardxc : « il a 1038 HP, si je passe tour il va mourir à son prochain tour » ; Koclikoo). [RAP] haute.
- **Vulnérable** : DPLN « +200 % de dégâts subis » ; Koclikoo « multiplie par 2 les dégâts subis » → contradiction ×3 vs ×2 (voir §11) ; à trancher par l'état (spell-states) côté données.
- **Retriggers** : Huz (bêta 26/09/2024, 08:30) : « il reprend un dégât de ouf sur cette même zone alors qu'il y était déjà… ça a croqué plusieurs fois » ⇒ [HYP] être poussé **à l'intérieur** du glyphe (d'une case de pics à une autre) redéclenche l'entrée. Confiance basse.
- **Allié** : les persos poussés dedans subissent aussi (Mishurra, Sword « keep everybody safe in the middle »).
- Bug 3.3 (sept. 2025) : les pics ne faisaient plus de dégâts → corrigé le 30/09/2025.

### 6.2 Glyphes évènementiels (cadeaux)
- **Fréquence** : « à tous les tours, de manière aléatoire sur le terrain » (GD, live) ; « por cada turno que empiece después del turno uno saldrá una casilla en forma de regalo » (Zephiron 07:30) ; devblog : « à un moment dans le combat et sur une case aléatoire ». Plusieurs cadeaux peuvent coexister (cardxc « on va chercher le deuxième cadeau », 21:00). [OFF]+[RAP] moyenne-haute.
- **Déclenchement** : marcher dessus, **ou y être poussé** (sspritenL : « ça fait pareil si un autre monstre te pousse sur un bonus »). Toute l'équipe en profite (Skaradon « upgrade for your whole team » ; DPLN).
- **Contenu** : 2 sorts uniques, 2 améliorations, ou 1+1 (DPLN) ; « soit améliorer un sort, soit un sort unique » (GD).
- **Bug « sort grisé »** : 90 % du temps le sort amélioré/obtenu est grisé et inutilisable pendant 1 tour ; un nouveau cadeau ou un déco/reco le débloque (Koza 07:30 ; sspritenL ; Willseir). Correctif partiel 21/01/2025. Conseil : **prendre le cadeau en début de tour global** (Koza 08:00). Pour le simulateur : option « sort amélioré indisponible jusqu'au tour suivant » [HYP, basse].
- Bug bêta : valider un objectif avec **Dégagez !** faisait gagner le nouveau sort en 4-5 exemplaires (forum section bêta 1965, « Quelques bugs »).
- Tactique : faire marcher un perso sur le cadeau au moment où Mama arrive ou le laisser pour un tour où on a besoin d'un sort (cf. §4).

### 6.3 Obstacles / effets en temps réel
Aucun témoignage. GD (sept. 2024) : terraformation non disponible. DPLN : « pas plus d'informations ». [HYP] : ignorer dans le simulateur v1.

---

## 7. Initiative et ordre de jeu

| Période | Règle | Source | Statut |
|---|---|---|---|
| Bêta (sept.–nov. 2024) | « l'ordini est défini par le jeu » (Huz 02:00) ; « c'est aléatoire depuis le début » (Houmilito 130:00) | vidéos | [RAP] |
| Déc. 2024 | « Initiative complètement aléatoire en entrant dans l'arène, mais reste fixe » avec les mêmes joueurs (Koza 00:30) ; « montrée seulement après validation du placement… fixe d'un combat à l'autre tant qu'on garde la même composition » (sspritenL) ; « répond à une condition que nous n'avons pas trouvée » (Willseir) | vidéo, forum | [RAP] |
| **Depuis le 14/01/2025** | **Ordre du tour de jeu des joueurs = ordre d'entrée dans le combat** | correctif officiel | [OFF] haute |
| Févr. 2025 | « El primero que habla con el NPC inicia el combate y será primera iniciativa » (Zephiron 08:30) | vidéo | [RAP] cohérent avec le correctif |
| Juin 2025 | « L'initiative ne correspond pas à l'ini du groupe » (Koclikoo) | forum | [RAP] |
| DPLN (maj 21/05/2026) | « tous les archétypes ont la même initiative… ordre inverse de l'affichage du groupe (4e joue en premier) » | DPLN | contradiction apparente, voir §11 |

- Mama « a toujours l'initiative » et est dans la timeline dès le début (DPLN ; Houmilito).
- Option utile : « Afficher l'ordre de jeu sur les combattants » (Options > Général > Jeu > Combat) pour savoir quel Troll joue juste après soi (Koclikoo).
- **Implication simulateur** : paramètre « ordre des joueurs » libre (défaut Acro → Dompteur → Dompteur → Magicien) ; Mama/monstres placés selon la timeline (à caler sur les données : initiative des Troolls).

---

## 8. Stratégies éprouvées et compositions

### 8.1 Compositions citées (ordre de jeu)

| Compo (ordre d'initiative) | Source | Date | Taux / remarque |
|---|---|---|---|
| **Acrobate → Dompteur → Dompteur → Magicien** | cardxc (https://www.youtube.com/watch?v=vmh1fJkhdCE&t=180s) | 06/03/2025 | « l'ordi est super important, l'Acrobate joue en premier » ; runs 10–15 min |
| idem | Zephiron (https://www.youtube.com/watch?v=IKqnwLIYffk&t=270s) | 11/02/2025 | « Acróbata primero, domadores 2º y 3º, mago último » |
| idem | Mishurra (https://www.youtube.com/watch?v=PxTtn2g9sx4&t=352s) | 26/09/2024 | « 1 Acrobate, 2 Dompteurs, 1 Magicien, surtout dans cet ordre d'initiative » |
| idem | Sword (https://www.youtube.com/watch?v=xDmoOV-9A18) | 06/07/2026 | « This order is really important » |
| idem (sans ordre précisé) | auteur du 1er message (DJC-IPAC d'après l'en-tête), forum 25/09/2024 | 2 victoires / 3-4 échecs | 1er retour bêta, 4 comptes |
| Placeur/Boost/DPS/DPS | Matspyder4 (forum 09/12/2024) | — | « quasi 100 % de victoire une fois la strat trouvée » |
| **Acrobate → Acrobate → Dompteur → Magicien** | Koza & Julibis « AUTOWIN » (https://www.youtube.com/watch?v=ve5TVn_sJGo&t=90s) | 18/12/2024 | ~40 runs ; « le même placement à chaque fois » |
| idem « double pousseur, dps, soigneur » | Laltoss (forum 12/06/2025) | 7 mois de farm | « même avec une RNG à chier je gagne tous les combats » ; 6–8 min |
| idem | Fielon (Disqus DPLN 15/12/2024) | — | 25–30 min, victoires parfois à 1 survivant |
| idem (« il faut deux acrobates ») | Houmilito (≈43:30) | 31/10/2024 | a gagné en fin de stream |
| **Acrobate → Acrobate → Magicien → Dompteur** | Koclikoo (forum 12/06/2025) | — | « compo opti… dans cet ordre d'initiative (d'autres compos sont jouables) » |
| 2 Acrobates + Dompteur + Magicien | Huz (09/11/2024) | — | 1re victoire, 24 min |
| « la méta c'est 2 placeurs » | Barbe Douce (≈07:12) | 26/09/2024 | dès J+2 de la bêta |
| Idéal GD : Acrobate → Magicien → Dompteur | Live Ankama (58:30) | 10/09/2024 | souhait des devs, non imposable |
| Critique : « même avec deux acrobates c'est trop dur de créer les zones… pas de portée » | Huz ShlRLUWn7VM ≈12:30 | 09/11/2024 | ⇒ importance du bonus **PO** |

### 8.2 Rôles / déroulé type (synthèse des sources concordantes)
1. **Acrobate(s) en premier** : pousser un maximum de Troolls dans les pics (Vulnérable) ; le 2e Acrobate tente de tuer/pousser « les ennemis qui n'ont pas encore joué » (Laltoss). Garder les alliés **au centre**, loin des pics (Sword, cardxc 11:30).
2. **Dompteur(s)** : tuer en priorité les Troolls Vulnérables et **ceux qui jouent juste après** (Koza 04:30 ; cardxc 06:30 ; Koclikoo) ; commencer par les plus proches de l'équipe (Laltoss).
3. **Magicien en dernier** : soins de zone, **Amplification** sur les Dompteurs (DPLN, cardxc), Regain Vigoureux (PA/PM) groupé ; si rien à soigner, finir des monstres (Laltoss).
4. **T1** : placement pour que l'Acrobate pousse les 2 Troollibres (vague 1) et que le 1er Dompteur en tue un avant qu'il joue (cardxc 03:30–04:00).
5. **Préparer T7→T8** : Pense Vite lancé **au T7** (Zephiron 20:30 ; Huz ≈14:19 « on était 7, il faut faire Pense Vite ») ; Galvanisation au T7 (Koclikoo) ; Regain Vigoureux T2/3 puis T7 (Koclikoo) ; Immortalité du Courageux au T7 (Laltoss) ; ne pas perdre de perso avant Mama (cardxc 19:00) ; **garder les gros sorts pour le T8** (cardxc 15:00) ; boucliers/soins de groupe gardés « si ça chauffe » (Muraille collective, Influx de Vitalité).
6. **T8** : pousser Mama dans les pics (ou Voltige-swap), la burst (Relâchement de Fureur chargé depuis le début, Pense Vite), la tuer en 1–2 tours.
7. **T9–T10** : **Dégagez !** pour repousser tous les Troolls dans les murs/pics puis **Punition collective** / **Pulsation Chaotique** (lancer Pulsation sur le monstre au plus bas PV pour qu'elle rebondisse plus fort) → one-shots (cardxc 21:30–23:00 ; Koza 22:30 ; Laltoss).

### 8.3 Priorités de bonus (« Acclamations de la foule ») par source

| Source | Acrobate | Dompteur | Magicien |
|---|---|---|---|
| DPLN (rappel) | PM, PA | Dommages finaux, Critique, Dommages critiques | PA, PM, Soins finaux |
| Koza (18/12/2024) | **PO en priorité sur tous les persos**, sinon PA/PM, sinon résistances | idem | idem |
| cardxc (06/03/2025) | PA, sinon **PO** (« toucher sans dépenser de PM ») | PA, sinon dégâts ; crits intéressants | — |
| Zephiron (11/02/2025) | PO > PA > PM > résistances | PO > PA > Crit % / Dommages finaux | PO > PA > Soins |
| Laltoss (12/06/2025) | PA > PO > PM | PA > PO > PM | PA > Soins > PM/PO |
| Koclikoo (12/06/2025) | PA/PO > PM > % rés | **1× 20 % crit** > PO (2 mini) > PA > dommages finaux | **Soins ×1** > PA (2-3×) > PM/PO (2-3×) > Vitalité (1 max) > Rés. distance |
| Mishurra (26/09/2024) | PA | PA, Force(?)/Critiques | PA, Soins |
| Sword (06/07/2026) | PA, sinon résistances | PA, dommages finaux | PA, soins |
| Fielon (15/12/2024) | PA | Dommages finaux | Soins finaux ; « les sorts uniques coûtent **5 PA** » → base de PA importante |

Moment du choix : « à chaque début de tour global » (DPLN, GD, Koclikoo) ; certains joueurs disent « fin de tour » (Laltoss, Sword, cardxc « quand on a fini tous nos tours ») — équivalent en pratique (fin du tour N = début N+1).
Noms observés des options : « Acclamation critique » (Childarksat, ≈02:44), « bonus acclamation » (Huz 04:30), « +5000 vita » (Houmilito 39:30), « +200 dommages de poussée » (Houmilito 33:00).

### 8.4 Sorts uniques / améliorations recommandés

| Archétype | Améliorations prioritaires | Sorts uniques prioritaires | Sources |
|---|---|---|---|
| Acrobate | Videur (ligne perpendiculaire) > Hanediman (fourche) > Aïronemane ; « les autres quasiment inutiles » ; Soutien Stratégique « vraiment pas » | **Dégagez !** (meilleur ; à garder pour la fin/T9-T10 ou pour l'objectif « Au coin ») ; Immortalité du Courageux (T7, toute l'équipe) ; Chamboulement/Malédiction Mouvante/Courage fuyons peu utiles | Koclikoo, Laltoss, Koza 05:30 & 10:00, cardxc 10:30 |
| Dompteur | Impact > Prélèvement > Grondement Grandissant (« les 3 premiers ») ; autres « puent » | **Relâchement de Fureur** (le plus tôt possible, sur 1 ou 2 Dompteurs) ; **Galvanisation** (+4 PA à tous ; 3× cumulées → 22 PA, Koza 16:00) ; Pense Vite ; Punition Collective / Pulsation Chaotique (clean) ; Malédiction Collatérale (combo OS) | Koclikoo, Laltoss, cardxc 08:00, Zephiron 26:30, Koza |
| Magicien | Regain Vigoureux (→ PA/PM à **tous**, « l'ancien Galva de l'Éni ») > Amplification > Pulsation d'Énergie > Protection Prolongée | Influx de Vitalité, Muraille collective, Ultime Espoir | Koclikoo, Laltoss, cardxc 07:30 |

Autres précisions de sorts [RAP] :
- **Prélèvement** : sans cible il ne fonctionne qu'en **critique** (« pour taper sans cible, il faut crit ») ; en critique il frappe en zone et vole de la vie en zone (sspritenL ; Zephiron 26:30–27:00 ; bug : parfois marche sans cible).
- **Meurtres en série** ne compte pas les kills par dommages de poussée (sspritenL).
- **Amplification** (cardxc 07:00–07:30) : Magicien +20 % soins finaux ; Acrobate « +500 dommages de poussée » ; Dompteur +20 % dommages finaux et +30 % crit — contredit partiellement DPLN (voir §11).
- **Protection Prolongée** : 3000 de bouclier + soins sur 2 tours (cardxc 08:30–09:00) — cohérent avec DPLN (3000 → 5000 amélioré).
- **Muraille collective** : « 15 000 de shield » (Barbe Douce, bêta, ≈14:54) [RAP basse].
- **Pense Vite** : 999/1000 PA ; durée du tour **15 s** (GD, Barbe Douce, DPLN) vs **10 s** (Houmilito bêta 31/10/2024) ; valeurs affichées « 901 PA » / « 900900 » (bêta, affichage buggé ?) ; avec 4 comptes, les animations mangent le temps (Huz : « j'ai utilisé 2/3 des actions »).
- **Délivrance** (Magicien) « ne fonctionne dans aucun cas » (Willseir, déc. 2024) [RAP].
- **Hanediman** : « aucune prévisualisation de déplacement » en bêta ; « le sort en fourche n'a aucun effet » (bêta, corrigé 01/10/2024).

### 8.5 Objectifs : lesquels choisir

| Objectif | Avis rapporté | Source |
|---|---|---|
| Empalé (toujours le 1er) | commun à tous, « mettre les trolls dans les pics c'est même le but » | GD live 46:00 ; DPLN |
| **Productivité** (3 sorts en un tour) | « le meilleur à prendre, le plus simple » ; 1er choix de Koza | cardxc 04:30 ; Koza 02:30 |
| Ébranlable | « le plus simple des deux » | cardxc 05:30 |
| Tout va bien (>50 % PV) | « assez simple, généralement au début » | cardxc 10:00 ; Houmilito 169:00 |
| Pas le temps de dire « Aïe » | faisable : tuer un Troll full vie avant qu'il joue | cardxc 08:30 |
| Distance d'insécurité / Stop aux projectiles | **se valident automatiquement** s'il n'y a plus d'Artroolleur (2 objectifs d'affilée) | DJC-IPAC (forum 25/09/2024) |
| Au coin | à faire avec Dégagez ! | Koza 05:30 |
| Trous dans les Trools / Solitude | « faisable » | Houmilito 155:30, 124:30 |
| Meurtres en série | bugué (validation ratée ou fausse validation → 2 objectifs actifs, sorts non donnés) ; kills par poussée ne comptent pas ; ne pas laisser un monstre <2000 PV au bord (il meurt seul dans les pics) | sspritenL (07/01/2025) |
| 1, 2, 3, Soleil ! | lent : si le 2e perso l'obtient, il faut attendre un tour global complet | DJC-IPAC |
| Sauvez-le ! | difficile (« quel chall de merde », perso perdu) | Huz kGlKYY7_qew 16:00 |
| Tout le monde veut prendre sa place | « pas du tout bénéfique quand tous les monstres sont dans les pics, mieux vaut l'ignorer » | Matspyder4 (26/09/2024) |

- Nombre d'objectifs : Zephiron « 5 ou 6 », −25 % max sur Mama (05:00) ; GD : jusqu'à **7 sorts** par archétype (1 de départ + 6 gagnables) ⇒ [HYP] jusqu'à **6 objectifs** peuvent être validés (6 sorts) mais l'affaiblissement de Mama plafonne à 5. Après le dernier, plus d'objectif proposé (Zephiron 17:00 ; Koza « on a déjà fait le full succès »).
- **Ordre des sorts gagnés** confirmé : 1er objectif → Hanediman / Grondement Grandissant / Regain Vigoureux (Huz 05:00–06:00, 09:00) ; objectif actif en fin de T2 → **Voltige / Prélèvement / Amplification** (sspritenL) = ordre DPLN.

---

## 9. Chiffres observés (hors DPLN)

| Valeur | Contexte | Source | Confiance |
|---|---|---|---|
| 30 000 PV, 1000 dommages de poussée, 6000 Force (archétype) | début de combat | Barbe Douce ≈00:10–00:25 ; Huz 02:30 | haute |
| Troollibre 25 000 PV | bêta | Barbe Douce ; DofusDB | haute |
| Mama 150 000 PV, niv. 1000 | — | DofusDB ; Zephiron ; GD | haute |
| Pics 2000 (entrée) + 2000 (début de tour) | — | Koza, cardxc, Koclikoo | haute |
| Videur ≈ 4000 sur cible hors pics | T1 | GD live 47:30 (« je lui fais du 4000 ») | moyenne |
| Coups subis : −5000, −8000, −10 000 (monstres) ; Mama −20 000/−21 000 sur un perso au spawn | — | Huz, Matspyder4 | moyenne |
| Zone Dompteur −8000 à −10 000 | mi-partie | Huz kGlKYY7_qew 13:30 | moyenne |
| Relâchement de Fureur −50/60 k ; « > moitié des PV de Mama » | T8 | Koclikoo ; cardxc | moyenne |
| Malédiction Collatérale + Relâchement ≈ 130 k (OS Mama) | T8 | Laltoss | moyenne |
| Pense Vite : −140 000 en un tour | T8 | Huz ShlRLUWn7VM | moyenne |
| Galvanisation ×3 → 22 PA | — | Koza 16:00 | moyenne |
| Sort unique : coût 5 PA | — | Fielon | moyenne |
| Soin Magicien ≈ 3000 en zone ; « +5000 » avec boosts ; « 4000 ×2 » | — | Huz | moyenne |
| 14 mobs tués en un tour | T10 (accumulation) | Huz | moyenne |
| Bourse 5 Gladiatons ≈ 1 combat sur 10 ; Booftrool 1/200 (« la PP n'influe pas ») | récompenses | Willseir | basse-moyenne |

---

## 10. Récompenses (pour mémoire, hors simulateur)
- Victoire : 1 Gladiaton + sac de 50 Troolotons par perso (2024-2026) → **2 Gladiatons depuis la 3.6 (23/06/2026)** [OFF]. Bourse bonus de 5 Gladiatons (rare). Booftrool de la Troollette 0,5 % (DPLN, cardxc, Koza) ; la prospection influencerait (cardxc « 1,3 % avec PP », Zephiron) vs « la PP n'influe pas » (Willseir) → contradiction.
- Prix boutique augmentés le 19/05/2026 (antoyne7 : ×2, Aura 60 → 120 Gladiatons) puis ajustés (Rongemort « merci pour la modification de ce jour », 22–23/06/2026).
- Ticket 5000 kamas (Vendeuse de Tickets) — confirmé partout ; les échecs consomment le ticket.

---

## 11. Contradictions entre sources

1. **Initiative** — DPLN : ordre inverse de l'affichage du groupe ; Koza/Houmilito (2024) : aléatoire mais fixe ; **correctif officiel 14/01/2025 : ordre d'entrée dans le combat** ; Zephiron : le premier à parler au PNJ joue en premier. ⇒ Retenir la règle officielle ; le texte DPLN décrit peut-être une observation pratique (le 4e du groupe entre en premier ?) ou un état antérieur. Confiance dans la règle officielle : haute.
2. **Tour d'arrivée de Mama** — DPLN « tour 8 (?) » mais « éviter la ligne d'arrivée au tour 7 » ; Skaradon « 7th or 8th » ; Houmilito « tour 8, pas 7 » ; cardxc « fin T7 / début T8 » ; Houmilito (autre moment) « aléatoire, 7-8-9-10 selon les objectifs ? » (spéculation infirmée ensuite). ⇒ **T8**, le « 7 » vient du fait qu'on la prépare pendant le T7.
3. **Vulnérable** — DPLN « +200 % dégâts subis » (×3) vs Koclikoo « multiplie par 2 » vs GD « augmente les dégâts subis ». ⇒ à trancher via spell-states DofusDB.
4. **Vagues « imprévisibles » (devblog) vs composition fixe** (DPLN, Koza, Zephiron, cardxc). ⇒ composition fixe en pratique ; l'aléatoire porte sur bonus/objectifs/cadeaux.
5. **Mama « intervient quand elle juge ses protégés en difficulté » (devblog)** vs arrivée fixe au T8 observée partout. ⇒ fixe (scénario).
6. **Pense Vite** : 10 s (Houmilito, bêta) vs 15 s (GD, DPLN, Barbe Douce) ; 999 / 1000 / « 901 » / « 900900 » PA. ⇒ 15 s, ~999 PA (valeurs exactes à lire dans spell-levels).
7. **Tout le monde veut prendre sa place** : DPLN « ennemi le plus éloigné » ; Matspyder4 « le mob le plus loin » ; Huz (bêta, lecture à voix haute) « le plus proche ». ⇒ plus éloigné (2 sources écrites).
8. **Amplification** : cardxc « Acrobate +500 dommages de poussée » vs DPLN « 100 → 200 ». ⇒ lire spell-levels.
9. **Moment des bonus** : début de tour global (DPLN, GD) vs fin de tour (Laltoss, Sword, cardxc). Équivalent ; le patch 05/05/2026 prouve l'existence de choix en fin ET début de tour (objectifs vs bonus ?).
10. **Ordre Magicien/Dompteur dans la compo Acro-Acro** : Koza/Laltoss/Fielon « Dompteur avant Magicien » vs Koclikoo « Magicien avant Dompteur » (et souhait GD Acro → Magicien → Dompteur). ⇒ tester les deux dans le simulateur (Magicien avant = boosts appliqués avant les frappes du Dompteur).
11. **Priorité de bonus** : PO d'abord (Koza, Zephiron) vs PA d'abord (Laltoss, cardxc, Sword, Mishurra). ⇒ paramètre du planificateur.
12. **Gladiatons par victoire** : 1 (2024-2025) vs 2 (DPLN 2026, patch 3.6). ⇒ changement daté du 23/06/2026.
13. **Influence de la PP sur le drop** : oui (cardxc, Zephiron, Koclikoo « semble ») vs non (Willseir).
14. **PV de Mama lus** : « 137 150000 » (Huz) vs 150 000 (Zephiron, DofusDB) ⇒ 150 000 (Huz lisait sans doute PV courants / PV max).

---

## 12. Questions encore ouvertes (à traiter par d'autres agents / données)
- Cellule exacte d'arrivée de Mama et cellules d'apparition de chaque vague (aucune source web textuelle ; seulement la capture DPLN).
- Largeur réelle du glyphe de bord (2 cases selon Mishurra) et liste exacte des cellules.
- Existence d'une limite de tours / d'un déclencheur de fin (« Finish Fight Trigger ») et condition exacte de fin (tous ennemis morts après T10 ?).
- IA des Troolls (priorité de ciblage, pourquoi ils « skippent » hors portée) et initiative des Troolls dans la timeline.
- Valeurs exactes des bonus « Acclamations » et pool de tirage (3 propositions parmi 6 par archétype ?).
- Nombre maximal d'objectifs (5 ou 6) et pool/probabilités des objectifs proposés.
- Fréquence exacte des glyphes cadeaux (1 par tour à partir du T2 ?) et règle de placement (case aléatoire libre ?).
- Mama Inébranlable (source unique) : état permanent ou lié à un sort (Castatrooll / Troollement de Tambour) ?

---

## 13. Liste des sources consultées

### 13.1 Officielles Ankama
| URL | Date | Utilité | Fiabilité |
|---|---|---|---|
| https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737504-devblog-2-73-gladiatrool (+ version EN 1737515) | 09/09/2024 | concept, systèmes | [OFF] haute |
| https://www.dofus.com/fr/mmorpg/actualites/devblog/billets/1737292-devblog-2-73-foire-trool | 09/09/2024 | calendrier, jetons | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1752977-dofus-3 (+ /details, /correctifs et 19 correctifs 04/12/2024→25/03/2025) | 03/12/2024→ | voir §1 | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1762717-operation-consolidation/details (+ correctifs) | 22/04/2025 | timeline corrigée | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1764400-osavora/details (+ correctifs) | 22/07/2025 | rien d'utile (renommage cartes Foire) | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1765214-puits-songes-infinis/details (+ correctifs dont 3.3.5.5) | 23/09/2025 | chat pendant choix ; bug pics | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1766529-copains-abord (+ correctifs) | 2025-2026 | rien sur le Gladiatrool | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1768057-repos-braves (+ correctifs 3.5.14.18, 3.5.16.20) | 2026 | bug blocage choix ; boutique | [OFF] |
| https://www.dofus.com/fr/mmorpg/actualites/maj/1770516-raid-not-dead/details (+ correctifs 3.6.6.5→3.6.11) | 23/06/2026 | ×2 Gladiatons | [OFF] |
| https://www.dofus.com/en/forum/1181-patch-notes/ (patchs bêta Unity 19/09, 25/09, 01/10, 08/10, 15/10, 24/10, 30/10, 07/11/2024) | 2024 | corrections sorts/objectifs (01/10, 08/10) ; autres : rien | [OFF] |
| Forum bêta « Gladiatrool » https://www.dofus.com/fr/forum/1965-gladiatrool (5 sujets : 2419546, 2419478, 2419477, 2419457, 2419385) | 25-27/09/2024 | bugs bêta (Dégagez multi-sorts, améliorations Acrobate sans effet) | [RAP] |
| Tweets @DOFUSfr 1833158542372532375 (09/09/2024), 1838958550233526625 (25/09/2024) ; @DOFUS_EN 1833542376008388905 (10/09/2024) (lus via cdn.syndication.twimg.com) | 2024 | dates | [OFF] |
| AnkamaLive 2.73 via rediffusion Huz https://www.youtube.com/watch?v=CY_cgLRjkoM | 10/09/2024 (vidéo 11/09) | **propos GD, très utile** | [OFF] oral |

### 13.2 Forums joueurs (dofus.com, lus via navigateur headless — le forum est derrière un challenge AWS WAF)
| URL | Date | Utilité |
|---|---|---|
| https://www.dofus.com/fr/forum/1938-gameplay/2419388-retour-gladiatrool | 25/09/2024–12/12/2024 | victoire non affichée, focus Mama −21 000, objectifs auto-validés, strat placeur |
| https://www.dofus.com/fr/forum/1782-dofus/2426762-gladiatrool-retour-experience | 08/12/2024 | bugs (sorts grisés, timeline, initiative), drops |
| https://www.dofus.com/fr/forum/1782-dofus/2426869-gladiatrool-quelqu-arrive | 08/12/2024 | « submergé de mobs » |
| https://www.dofus.com/fr/forum/2011-divers/2430927-gladiatrool-bugs | 07/01/2025 | **70 combats de bugs** : Meurtres en série, cadeau/Mama, Prélèvement, initiative |
| https://www.dofus.com/fr/forum/2011-divers/2432860-bug-gladiatrool-completement-inutilisable | 19/01/2025 | Mama T8 (bug) |
| https://www.dofus.com/fr/forum/1115-dofus/2425712-bug-timeline-fonctionnelle-gladiatrool | ~déc. 2024 | timeline sans monstres |
| https://www.dofus.com/fr/forum/1978-serveurs-historiques/2440738-demande-aide-conseils-gladiatrool (→ 1977-discussions-generales) | 12/06/2025 | **guides Laltoss & Koclikoo** (très utiles) |
| https://www.dofus.com/fr/forum/2103-general/2446535-retour-recompenses-foire-trool-gladiatrool | 05/11/2025–22/06/2026 | durée, prix, ×2 gladiatons |
| Disqus DPLN (thread gladiatrool.html, 2 commentaires) | 15/12/2024 ; 04/01/2025 | Fielon : compo Acro-Acro-Dompteur-Magicien, sorts uniques 5 PA |

### 13.3 Vidéos YouTube (transcriptions via TubeLab)
| Vidéo | Chaîne / date | Utilité |
|---|---|---|
| https://www.youtube.com/watch?v=kGlKYY7_qew | Huz, 26/09/2024 (bêta) | 1re run, pics multi-déclenchement, Mama −20 000 |
| https://www.youtube.com/watch?v=v3cDvm3x4pw | Barbe Douce, 26/09/2024 (bêta) | stats de base, Troollibre 25 000, Pense Vite, « méta 2 placeurs » |
| https://www.youtube.com/watch?v=P7e6vXH4GMg | Childarksat (ES), 25/09/2024 | « Acclamation critique », Mama niv. 1000 (peu d'info) |
| https://www.youtube.com/watch?v=PxTtn2g9sx4 | Mishurra (ES), 26/09/2024 | compo + ordre, pics 2 cases, accumulation (transcription traduite auto) |
| https://www.youtube.com/watch?v=HSHSLHi5jQY | Houmilito, 31/10/2024 (3 h 45) | tour 8, victoire = tuer le reste, Mama inébranlable/Voltige |
| https://www.youtube.com/watch?v=ShlRLUWn7VM | Huz, 09/11/2024 | Pense Vite T7, −140 000, 14 mobs/tour |
| https://www.youtube.com/watch?v=ve5TVn_sJGo | Koza & Julibis, 18/12/2024 | **autowin Acro-Acro-Dompteur-Magicien**, initiative, cadeaux |
| https://www.youtube.com/watch?v=5WWUKwtPtXw | Koza, 19/12/2024 | speedrun, musique seulement (aucune info verbale) |
| https://www.youtube.com/watch?v=AX-A1ULkP0A | Skaradon (EN), 07/01/2025 | résumé 2 min (Mama T7-8, pousser dans les pics), reste = musique |
| https://www.youtube.com/watch?v=IKqnwLIYffk | Zephiron (ES), 11/02/2025 | **guide complet** (ordre, bonus, cadeaux chaque tour, Mama 150 000, fin T10) |
| https://www.youtube.com/watch?v=vmh1fJkhdCE | cardxc, 06/03/2025 | **tuto complet** Acro-Dompteur-Dompteur-Magicien |
| https://www.youtube.com/watch?v=xDmoOV-9A18 | Sword (EN), 06/07/2026 | résumé stratégie (ordre, bonus) |
| https://www.youtube.com/watch?v=Qn0qHGgQrz4 | ArchisTV, 10/09/2024 | lecture du devblog (rien de neuf) |
| Commentaires des vidéos ve5TVn_sJGo, IKqnwLIYffk, vmh1fJkhdCE, kGlKYY7_qew | 2024-2026 | peu d'info (accumulation, « 25 essais 5 victoires ») |
| Non transcrites : Jbok8FcKZi4, lVAwJG3pJtc (réactions màj 2.73) | 2024 | présumées redondantes avec le live |

### 13.4 Presse / sites
| URL | Date | Utilité |
|---|---|---|
| https://www.gamosaurus.com/actualites/le-gladiatrool-change-les-regles-du-jeu-sur-dofus | 10/09/2024 | reprise devblog (Mama « fin du combat ») |
| https://gamosaurus.com/actualites/le-gladiatrool-apporte-des-variations-de-gameplay-sur-dofus | 10/09/2024 | idem |
| https://www.dofuspourlesnoobs.com/mise-a-jour-273.html | 2024 | « trolls tous les tours pendant 10 tours », équilibré pour 4 |
| https://api.dofusdb.fr/monsters/7980..7984 | — | contrôle PV (voir §5) |

### 13.5 Consultées sans information utile / inaccessibles
- Rétro (hors sujet) : GUIDACTIK (https://guidactik.com/dofus-retro/gladiatrool-dofus-retro-guide-complet/ , /les-astuces-a-connaitre-en-gladiatrool-sur-dofus-retro/ , tier list), dofus-retro.com (refonte 1.45, forum « meilleure compo »), nokazu.com Rétro, Astra Dofus wiki (fandom), Orion/Sirius wiki (serveurs privés), shokoladny.io (article game design Rétro, 22/04/2026), forums dofus.com 2022-2023 (1860-bugs-beta-1-39/2381020, 2382071, 2382082 ; 1881-temporis-retro-1/2382507 ; 1807-monocomptes/2385462 et 2382151 ; 1829-suggestions 2384783, 2385978), vidéos Rétro (Boune, double Éca, Enutrof/Sram/Sadida solo…).
- jeuxvideo.com (sujet 2008 « arène du gladiatrool », décor Dofus 1.x) et JOL https://forums.jeuxonline.info/sujet/947423/gladiatrool (ancien, non pertinent).
- Reddit r/Dofus / r/DofusTouch : **inaccessibles** (mur de connexion, API 403) ; la recherche web ne renvoie aucun fil Reddit sur le Gladiatrool.
- dofuswiki.fandom.com « Arena of the Gladiatrool » : HTTP 402 (non lu).
- nitro.krozmotion.com : DNS introuvable.
- Wayback Machine (historique des versions DPLN) : service « Temporarily Offline » le 28/09/2026.
- Millenium, Papycha, Dofus-Portals, next-stage, projectdiva : aucune page Gladiatrool (Unity) trouvée.
- Discord publics : non indexés, rien trouvé.
