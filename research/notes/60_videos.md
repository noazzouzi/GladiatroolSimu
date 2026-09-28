# 60 — Vidéos (YouTube / Twitch) : stratégie et observations concrètes du Gladiatrool (DOFUS 3 / Unity)

> Rédigé le 28/09/2026 par l'agent « vidéos ». Périmètre : vidéos YouTube (et rediffusions de lives Twitch publiées sur
> YouTube) portant sur le **Gladiatrool de DOFUS 3 / Unity** (Foire du Trool, arène [-9,-41], archétypes Acrobate /
> Dompteur / Magicien, Mama Troollette). Les vidéos du Gladiatrool de **DOFUS Rétro** (10 salles, vraies classes :
> Boune, « double Éca », Enutrof/Sram solo, GUIDACTIK…) sont **hors sujet** et ont été écartées.
>
> Complète la note `50_sources_web.md` (balayage web, qui citait déjà plusieurs de ces vidéos) : ici, chaque vidéo a
> une **fiche détaillée avec timestamps**, puis une **synthèse transversale** orientée simulateur.
>
> **Légende**
> - **[DATA]** FAIT vérifié dans les données du client (API DofusDB, cache décodé du scratchpad) — contrôle ponctuel.
> - **[OFF]** propos officiel (game designer Ankama en live).
> - **[VID]** FAIT rapporté/observé dans une vidéo (joueur). Fiabilité selon le nombre de vidéos concordantes.
> - **[HYP]** HYPOTHÈSE de l'auteur de cette note.
> - Confiance : **haute / moyenne / basse**.
>
> **Méthode et limites**
> - Transcriptions : sous-titres automatiques récupérés via TubeLab (`get_video_transcript`), commentaires via
>   `get_video_comments`. Les sous-titres auto déforment les noms (« handyan » = Hanediman, « gladiat rou » = Gladiatrool,
>   « enfriamiento de furor » = Relâchement de Fureur en ES, « velocidad mental » = Pense Vite, « Largo » = Dégagez !,
>   « Portero » = Videur, « Cobro » = Prélèvement, « Castigo colectivo » = Punition Collective, « Pulsión caótica » =
>   Pulsation Chaotique, « Flujo de vida » = Influx de Vitalité, « Última esperanza » = Ultime Espoir,
>   « Recuperación vigorosa » = Regain Vigoureux, « Huyamos » = Courage fuyons, « Estratega » = Soutien Stratégique).
> - Timestamps : `mm:ss` (ou `h:mm:ss`). Pour les vidéos lues par blocs de 30 s (cardxc, Koza, Zephiron, Huz 1re run,
>   Houmilito, live Ankama), précision **±30 s** ; pour les autres (Khytrayer, Isthos, Huz victoire, Barbe Douce, Sword),
>   précision ±5 s.
> - **Téléchargement vidéo YouTube impossible** dans cet environnement (HTTP 403 de googlevideo pour tous les clients
>   yt-dlp testés : mweb, tv, web_safari, android_vr, ios). Seuls les **storyboards** YouTube (mosaïques 3×3 de vignettes
>   **320×180**, 1 vignette / 5 s pour Koza, / 10 s pour cardxc) ont pu être récupérés : ils permettent des observations
>   **grossières** (formation, zones de la carte), **pas** l'identification d'ID de cellules. Les positions exactes
>   d'apparition des vagues ne peuvent donc pas être établies par cette note (voir §7).
> - Transcriptions brutes et storyboards (non versionnés, copyright) :
>   `/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/yt/` (agent 50, lecture seule)
>   et `/tmp/claude-0/-home-user-GladiatroolSimu/fc36fc0c-839e-54e4-af8d-c3045fec18d5/scratchpad/v60/` (cette note :
>   `koza_sb/`, `cardxc_sb/`, recadrages `cx_*.png`, `kz_*.png`).
> - Crédits TubeLab épuisés après 0 recherche payante (erreur 402) : les vidéos ont été trouvées par recherche web.

---

## 0. Résumé exécutif (ce que les vidéos apportent au simulateur)

1. **Compo + ordre de jeu** : Acrobate en **premier** est unanime (11 vidéos). Deux compos gagnantes :
   Acro → Dompteur → Dompteur → Magicien (cardxc, Zephiron, Khytrayer, Mishurra, Sword) et
   Acro → Acro → Dompteur → Magicien (Koza & Julibis « autowin », Isthos, Hy-glou, Huz, Houmilito). Magicien **dernier**
   dans toutes les runs gagnantes filmées. [VID] haute.
2. **Pics** : entrer = −2000 + état Vulnérable ; commencer son tour dedans = −2000 observé ; un monstre ≤ 2000 PV laissé
   dans les pics meurt à son tour (cardxc 11:00, 14:30 ; Khytrayer 13:04). Vulnérable = **dégâts subis ×2**
   (Isthos 01:53 « twice as much damage » ; texte en jeu lu par Khytrayer 04:15 « daño sufrido por 200% »), ce que
   confirment les données : effet 1163 « Dommages subis x200% » [DATA] → **DPLN « +200 % » est une mauvaise lecture**.
   Réconciliation chiffrée : glyphe d'entrée 2000, glyphe de début de tour **1000 ×2 (Vulnérable) = 2000** [DATA+HYP].
3. **Sans pics on ne tue rien** : « on lui fait vraiment zéro dégâts comparé à ceux qui sont dans les pics » (cardxc 15:30) ;
   « si no los metes en los pinchos no los bajas ni mañana » (Khytrayer 04:17). Coup de base ≈ 1500 hors pics
   (Barbe Douce 01:10), Videur ≈ 4000 (GD 47:30). [VID] haute.
4. **Règle de focus** : tuer d'abord le Trooll qui **joue juste après** le personnage actif (« turno gratis ») —
   cardxc 06:30, Koza 04:30, Khytrayer 04:28, Huz 09:00. [VID] haute → heuristique n°1 du planificateur.
5. **Vagues** : 1 vague par tour global pendant 10 tours ; elles s'accumulent si on ne nettoie pas (Mishurra 07:08) ;
   V1 = 2 Troollibres (cardxc 03:30, Barbe Douce 01:52), V8 = Mama seule (Khytrayer 03:34), V9-V10 = « nettoyage »,
   V10 = 6 monstres (Zephiron 22:30). Concorde avec la liste DPLN. [VID] moyenne-haute.
6. **Mama** : arrive au **tour 8** (6 vidéos), saute sur la carte et **repousse tout le monde en ligne** vers les pics
   (cardxc 19:30, Isthos 05:55, Mishurra 06:47) ; 150 000 PV ; invulnérable tant qu'elle n'a pas été mise dans les pics ;
   tuée en 1 tour avec 2× Relâchement de Fureur ou Pense Vite lancé au T7 (−140 000 en un tour, Huz 19:14).
   **Tuer Mama ne termine pas le combat** (Isthos 06:55, Houmilito 2:05:00, Zephiron 21:30).
7. **Préparation T7** : lancer **Pense Vite au T7** (Huz 14:22, Zephiron 20:30, Houmilito 2:55:00), booster/boucliers
   au T7, garder les gros sorts pour le T8 (cardxc 15:00), ne perdre personne avant Mama (cardxc 19:00).
8. **Pense Vite** = ~1000 PA mais tour limité (15 s selon GD/Barbe Douce/Mishurra/Huz ; 10 s selon Houmilito bêta et
   Khytrayer 3.6) ; **les animations limitent à ~3 sorts** (Houmilito 2:55:30) ou « 2/3 des actions » (Huz 19:14).
   → à modéliser comme un nombre de lancers borné, pas comme 1000 PA effectifs.
9. **Fin** : V9-V10 nettoyées avec **Dégagez !** (tout repousser contre les bords) puis **Punition Collective /
   Pulsation Chaotique** (sur le monstre le plus bas en PV) → quasi one-shot de tout (cardxc 21:30-23:00 ; Khytrayer
   11:35, 16:52 ; Huz : 14 monstres tués en un tour, 23:04).
10. **Objectifs** : les runs rapides n'en font que 2-3 (Khytrayer 03:05 « con hacer dos o tres ya »), les plus faciles :
    Empalé (toujours le 1er), Productivité (Magicien : PA + soin + soin), Stop aux projectiles (auto si plus
    d'Artroolleur), Ébranlable, Tout va bien. **Relâchement de Fureur** (cadeau) est jugé indispensable (4 vidéos).

---

## 1. Inventaire des vidéos examinées

| # | Titre | Chaîne | URL | Date | Durée | Langue | Époque | Compo (ordre) | Issue | Utilité |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Dofus 3 Tuto Gladiatrool ! | cardxc | https://www.youtube.com/watch?v=vmh1fJkhdCE | 06/03/2025 | 31:29 | FR | 3.0 | Acro→Dompt→Dompt→Mag | victoire (~20 min) | **très haute** (tuto tour par tour) |
| 2 | DOFUS UNITY – TUTORIEL AUTOWIN GLADIATROOL par KOZA feat Julibis | Koza Dofus | https://www.youtube.com/watch?v=ve5TVn_sJGo | 18/12/2024 | 23:29 | FR | 3.0 | Acro→Acro→Dompt→Mag | victoire | **très haute** (~40 runs d'expérience) |
| 3 | [DOFUS 3.0] Feria del Trool – Guía para los combates del Gladiatrool | Zephiron | https://www.youtube.com/watch?v=IKqnwLIYffk | 11/02/2025 | ~31:30 | ES | 3.0 | Acro→Dompt→Dompt→Mag | victoire (15 min) | **très haute** |
| 4 | [DOFUS 3.6] GUIA GLADIATROOL FREE KAMAS | Khytrayer Dofus | https://www.youtube.com/watch?v=FSlGkDE7ZOQ | 14/08/2026 | 18:07 | ES | **3.6 (le plus récent)** | Acro→Dompt→Dompt→Mag | victoire (13 min, 2 morts) | **très haute** (valeurs de sorts, version actuelle) |
| 5 | Le GLADIATROOL de DOFUS UNITY | Huz (HuzREPLAY) | https://www.youtube.com/watch?v=ShlRLUWn7VM | 09/11/2024 | ~23:55 | FR | bêta Unity | 2 Acro + Dompt + Mag | victoire (24 min) | haute (Pense Vite T7→T8, −140 000) |
| 6 | Le GLADIATROOL sur DOFUS UNITY (Nouveau Banger) | Huz | https://www.youtube.com/watch?v=kGlKYY7_qew | 26/09/2024 | ~21:00 | FR | bêta Unity | 2 Acro + Dompt + Mag | **défaite** (Mama T8) | haute (découverte, dégâts subis) |
| 7 | Everything There Is To Know About Gladiatrool – Dofus 3 Stream Highlights | Isthos (FirelordIsthos) | https://www.youtube.com/watch?v=Vwe_m7suH9A | 18/03/2025 | 08:21 | EN | 3.0 | Acro→Acro→DPS→Mag | victoire (1er essai) | haute (ordre = entrée, ×2) |
| 8 | LE GLADIATROOL SUR DOFUS 3 ! (live) | Houmilito | https://www.youtube.com/watch?v=HSHSLHi5jQY | 31/10/2024 | ~3:45:00 | FR | bêta Unity | variable, finit 2 Acro | défaites puis victoire | moyenne (beaucoup d'essais/erreurs) |
| 9 | Je test le GLADIATROOL sur la Beta Unity 3.0 | Barbe Douce | https://www.youtube.com/watch?v=v3cDvm3x4pw | 26/09/2024 | ~21:00 | FR | bêta J+1 | à 3 puis 4, 2 soigneurs | défaites | moyenne (stats de base, chiffres) |
| 10 | GUÍA GLADIATROOL ➡️ EL MODO ROGUELIKE DE DOFUS | Mishurra | https://www.youtube.com/watch?v=PxTtn2g9sx4 | 26/09/2024 | ~13:30 | ES (piste auto-doublée arabe dans TubeLab) | bêta | Acro→Dompt→Dompt→Mag | victoire (combat montré sans commentaire) | moyenne |
| 11 | FOIRE DU TROOL et GLADIATROOL sur DOFUS 2.73 (rediffusion commentée de l'AnkamaLive) | Huz | https://www.youtube.com/watch?v=CY_cgLRjkoM | 11/09/2024 | ~1:10:00 | FR | présentation | — | démo GD | haute pour les propos **[OFF]** |
| 12 | [Dofus] ⭐ Gladiatrool Arena (autowin) | Sword | https://www.youtube.com/watch?v=xDmoOV-9A18 | 06/07/2026 | 09:03 | EN | 3.5/3.6 | Acro→Tamer→Tamer→Mag | victoire | basse (résumé 2 min) |
| 13 | BEATING THE GLADIATROOL IN DOFUS UNITY! | Skaradon | https://www.youtube.com/watch?v=AX-A1ULkP0A | 07/01/2025 | 13:35 | EN | 3.0 | — | victoire | basse (résumé 2 min, reste musique) |
| 14 | DOFUS UNITY 3.0 – SPEEDRUN GLADIATROOL par Koza | Koza Dofus | https://www.youtube.com/watch?v=5WWUKwtPtXw | 19/12/2024 | 12:09 | — (musique) | 3.0 | 2 Acro + Dompt + Mag | victoire (~11 min) | basse (visuel seulement, storyboard analysé) |
| 15 | Gladiatrool Autowinn Dofus 3.0 | Hy-glou | https://www.youtube.com/watch?v=RNU9FVDzeZ8 | 01/01/2025 | 17:42 | — (pas de transcription) | 3.0 | 2 Acro + Dompt + Mag | victoire | basse (description seulement) |
| 16 | Ma PLUS RAPIDE RUN au Gladiatrool ! | ProTeam – VOD | https://www.youtube.com/watch?v=L51ZTzHZtHo | 08/10/2025 | 22:22 | FR (pas de transcription dispo) | 3.3 | ? | victoire | basse (non exploitable sans transcription) |
| 17 | Je Speed Run Le Gladiatrool Sur Dofus Unity Trop EZZZZ | Yonexx. | https://www.youtube.com/watch?v=jHqI2CZoFPM | 27/09/2024 | 13:02 | FR (pas de transcription) | bêta | ? | victoire | basse (description seulement) |

Non retenues : vidéos Rétro (voir en-tête) ; P7e6vXH4GMg (Childarksat, ES, 25/09/2024, « peu d'info » selon note 50) ;
Qn0qHGgQrz4 (ArchisTV, lecture du devblog) ; VOD ProTeam 7LDw0YvmceE (« panos gladia » = autre contenu, vérifié par
recherche dans la transcription : 0 occurrence de « gladia »).

Commentaires YouTube : très pauvres en information (compliments, questions hors sujet). Seul utile :
- FSlGkDE7ZOQ, @lucashnz1262 (08/2026) : « muchas veces muero en la ronda 8-9 cuando la mama me empuja a cada personaje
  a los pinchos » → confirme la poussée de Mama vers les pics comme cause n°1 d'échec. [VID]
- 5WWUKwtPtXw, @Good-Baraka : « Ah on peut voir les monstres dans la timeline maintenant au gladia ? » → bug de timeline
  (monstres des vagues absents de la timeline) connu des joueurs, corrigé en 3.1 (cf. note 50).

---

## 2. Fiches par vidéo

### 2.1 cardxc — « Dofus 3 Tuto Gladiatrool ! » (vmh1fJkhdCE, 06/03/2025, FR) — **la référence tour par tour**

Résumé : tuto complet par un farmeur (runs 10-15 min, « une vingtaine de combats pour tout comprendre »). Compo
Acrobate (1er) – Dompteur – Dompteur – Magicien (dernier). Montre T1, objectifs, bonus, cadeaux, préparation T7,
arrivée de Mama, kill de Mama avec Relâchement de Fureur, nettoyage final avec Dégagez ! + Punition/Pulsation.

| Temps | Observation | Statut |
|---|---|---|
| 00:30 | Drop familier Mama 0,5 % (1,3 % avec PP selon lui) ; sac de 50 Troolotons à 100 %. | [VID] |
| 03:00 | « L'ordi est super important, faut que l'Acrobate joue en premier » ; les deux Dompteurs sont les 2 persos du milieu ; le dernier devient Magicien. | [VID] haute |
| 03:30 | **T1** : « l'idéal si vous mettez l'acrobate ici, il doit pousser les **deux** troules comme ça » (vague 1 = 2 Troollibres). | [VID] haute |
| 04:00 | « et que vous ayez le premier dompteur qui joue ici pour qu'il tue celui-là **qui a pas le temps de jouer** ». Si on prend des dégâts T1, le Magicien soigne. | [VID] |
| 04:00-04:30 | Premiers objectifs proposés : « 1,2,3 Soleil », « **Productivité** » : « c'est le meilleur à prendre si vous l'avez, le plus simple ». Chaque objectif débloque un nouveau sort. | [VID] |
| 04:30 | Faire des « petits stacks » pour que le Magicien soigne en zone et booste PA/PM en zone. | [VID] |
| 05:00 | Sort gagné par le Magicien au 1er objectif « à 100 % » : le boost PA/PM (Regain Vigoureux) ; l'autre choix possible = bouclier + soins sur la durée, ou boost de capacités. | [VID] moyenne |
| 05:30 | Objectif suivant : **Ébranlable** « le plus simple des deux ». | [VID] |
| 06:00 | **Bonus (fin de tour global)** : Magicien → PM (pour se rapprocher), Acrobate → **PO**, Dompteurs → full dégâts ; « l'idéal c'est vraiment de prendre les **PA** ». | [VID] |
| 06:30 | Mécanique principale : pousser dans les pics → état Vulnérable (icône bouclier cassé) → les deux DPS le tapent. « Essayez de toujours focus **ceux qui n'ont pas encore joué** ». | [VID] haute |
| 07:00-07:30 | **Amplification** (Magicien) : sur le Magicien +20 % soins finaux, sur l'Acrobate **+500 dommages de poussée**, sur un Dompteur (« gladiateur ») **+20 dommages finaux (%) et +30 % crit**. | [VID] moyenne (confirmé par Khytrayer 05:10) |
| 07:30 | **Cadeau** : soit amélioration d'un sort possédé, soit sort unique. Ex. Regain Vigoureux amélioré : « au lieu de faire une zone il va forcément booster **tous** les persos ». « La plupart [des sorts uniques] sont pas très utiles ». | [VID] |
| 08:00 | **Relâchement de Fureur** : « il faut la prendre, c'est super important » ; sur un DPS ou les deux (« je vous conseille sur un »). | [VID] haute |
| 08:30 | Objectif « **Pas le temps de dire Aïe** » : tuer un Troll avant qu'il ait joué alors qu'il était full vie. Sort gagné (Magicien) : **bouclier 3000 + soins neutres sur 2 tours** (Protection Prolongée ; il lit « 40 à 48 soins », valeur mal lue). | [VID] moyenne |
| 09:00 | Acrobate : prendre la **PO** « pour toucher les cibles sans faire trop de PM ». Meilleur sort de l'Acrobate = poussée en zone (Hanediman/Videur) : « faites des zones ». | [VID] |
| 10:00 | Objectif « **Tout va bien** » (tous les persos > 50 % PV à la fin du tour global) : « assez simple, généralement au début ». | [VID] |
| 10:30 | Sort unique **Dégagez !** : peu intéressant tôt, « utile sur les dernières vagues pour clean ». | [VID] |
| 11:00 | « **Les pics font 2000 dégâts** » ; « il a **1038 HP**, si je passe il va mourir à son prochain tour de jeu ». | [VID] haute |
| 11:00-11:30 | Garder tout le monde **sous boost** ; garder les persos **au centre** pour ne pas dépenser de PM pour taper. | [VID] |
| 11:30 | Prendre des PM avant Mama. « La Mama Troollette, qui fait apparaître tous les troules, arrive **fin T7 début T8** sur la map et tape tout le monde ». | [VID] haute |
| 12:30-13:00 | **IA** : « quand ils sont dans les pics ou que vous êtes assez loin d'eux, ils **skippent leur tour** » ; « là il a pas skip parce que mon Sacri était trop près de lui ». | [VID] moyenne-haute |
| 13:30 | Crit intéressant sur les Dompteurs quand on a « le sort rouge » (Prélèvement ?) qui peut être lancé **à distance d'un troll** (sans cible) pour quand même lui faire des dégâts. | [VID] moyenne |
| 14:00 | « Pousser ceux qui sont très loin des bords » avec l'Acrobate ; ceux **juste à côté des pics** peuvent être poussés par les DPS (Frappe Repoussoir). | [VID] |
| 14:30 | « Il a skip son tour, il est resté dans les pics, il a pris **−2000** et du coup il va mourir ». | [VID] haute |
| 15:00 | « Gardez vos gros sorts pour le **T8** (tour où la Mama arrive), sinon si vous ne la tuez pas au premier tour… ». | [VID] |
| 15:30 | Monstre non vulnérable : « on lui fait vraiment **zéro dégâts** comparé à ceux dans les pics ». | [VID] haute |
| 16:30 | **Galvanisation** (« galva ») : **+4 PA à toute l'équipe**. Relâchement de Fureur obtenu sur les 2 DPS. | [VID] |
| 17:30 | Mettre un perso « juste devant pour qu'il prenne les dégâts » ; un Troll « bloqué » (Inébranlable) finit quand même dans les pics. | [VID] |
| 18:00 | Aller sur le cadeau « pour avoir toutes les augmentes » ; Galva sur les 2 DPS : « 0 PA, 0 PA » (tout dépensé). | [VID] |
| 19:00 | « Vous voulez vraiment **pas perdre un seul perso avant que la Mama arrive** ». | [VID] |
| 19:30 | **Arrivée de Mama** : « elle va jump sur le terrain, elle va **pousser tout le monde**, et s'il y a un de vos persos qui arrive **sur le cadeau** ça va **cancel toute l'animation et tous les dégâts** de la Mama ». | [VID] moyenne (2 sources avec sspritenL forum) |
| 20:00-20:30 | **Relâchement de Fureur** (infobulle « 187 à 200… dommages Neutre », lecture incertaine) : « on tape **un peu plus de la moitié de ses HP** » ; « plus vous l'avez tôt dans le combat, mieux c'est » ; « sans ça c'est presque impossible de tomber la Mama ». | [VID] haute (qualitatif) |
| 21:00 | Mama morte → « finir de clean toutes les invoques » (les Troolls de vague) ; aller chercher le **deuxième cadeau** (plusieurs cadeaux coexistent) ; certains cadeaux inutiles à la fin → on peut les ignorer. | [VID] |
| 21:30 | « Il va rester **seulement deux vagues**, il y a seulement 10 vagues » (Mama morte au T8 → V9, V10 arrivent encore). **Dégagez !** : « pousse tous les troules dans les murs ». | [VID] haute |
| 22:00 | Les mettre tous « à peu près mid-life », puis **Punition Collective** et **Pulsation Chaotique** → « vous les one-shotez à 100 % ». | [VID] |
| 23:00 | « Tous les mettre dans les pics » ; **Pulsation Chaotique sur celui qui a le moins d'HP** « pour qu'elle fasse plus de dégâts à tous les autres ». | [VID] moyenne |
| 23:30 | Run terminée en ~20 min (commentée), 15 min en temps normal. | [VID] |

Storyboard (320×180, 1 vignette / 10 s) : à ~03:40 les 4 personnages sont groupés en **carré 2×2 au centre** de l'arène,
un Troollibre au **nord-ouest** (~3 cases) et un au **sud-est** (~2-3 cases) du groupe ; à ~20:20 (après l'arrivée
de Mama) les personnages sont dispersés, dont deux collés aux bords sud-ouest et sud-est, et l'infobulle
« Mama Troollette » apparaît sur le **bord nord-ouest** (après poussée par l'Acrobate ?). Confiance **basse**
(résolution insuffisante pour des cellules).

### 2.2 Koza & Julibis — « TUTORIEL AUTOWIN GLADIATROOL » (ve5TVn_sJGo, 18/12/2024, FR)

Résumé : ~40 runs au compteur (« c'est le même placement à chaque fois »), compo **Acro (Julibis) → Acro → Dompteur →
Magicien (Koza)**. Explique initiative, objectifs, bonus PO, bug des sorts grisés, Galvanisation, préparation de Mama,
Voltige, Punition Collective.

| Temps | Observation | Statut |
|---|---|---|
| 00:30-01:00 | « Quand vous rentrez dans l'arène l'initiative est **complètement aléatoire mais elle reste fixe** » (déc. 2024, avant le correctif du 14/01/2025). | [VID] (périmé) |
| 01:30 | Compo : Julibis Acrobate, Forgelance Acrobate, « le petit chien » Dompteur, Koza Magicien. | [VID] |
| 02:00-02:30 | « On a fait ce combat une **quarantaine de fois** […] c'est **le même placement à chaque fois** mais il nous touche pas au tout début ». | [VID] haute |
| 02:30 | Objectif choisi en premier : **Productivité** (3 sorts dans le même tour). | [VID] |
| 03:00 | « Les mobs, vous les repoussez dans les pics, ils prennent les dégâts, donc plus facile de les tuer, d'où l'utilité de jouer les acrobates en premier ». | [VID] haute |
| 03:30 | « On n'utilise pas forcément les derniers sorts [débloqués], ils sont pas trop forts » ; les plus utiles : **Videur, Hanediman, et le switch de place [Voltige] quand le boss arrive**. « On vient de valider **trois objectifs à la suite** », « ça snowball vite ». | [VID] |
| 04:00 | « Il faut vraiment **focus la PO** au début du combat : dès que vous avez le bonus PO, faut le prendre sur **tous** les persos » ; sinon PA/PM ; sinon résistances. | [VID] haute (contredit « PA d'abord ») |
| 04:30 | « On essaie de tabler sur les persos **qui jouent juste derrière** pour vraiment les tuer avant qu'ils rejouent ». « Au début on se fait souvent toucher […] après, avec le boost des pouvoirs, on les one-shot ». | [VID] haute |
| 05:00 | Cadeau : « améliorer un sort ou débloquer un sort ou améliorer deux sorts, ça dépend de la RNG » ; un cadeau peut donner un « boost de pouvoir ». | [VID] |
| 05:30 | **Dégagez !** « c'est le meilleur sort » : fait dégager tous les ennemis dans les pics ; « mieux vaut le garder à la fin quand les monstres sont plusieurs, ou pour **Au coin** ». Vote des objectifs : majorité. | [VID] haute |
| 07:00 | Un Artroolleur « était obligé de nous toucher parce que lui joue **à distance** ». | [VID] |
| 07:30-08:00 | **Bug** : un sort amélioré via cadeau est **grisé** pendant le tour ; un nouveau cadeau le débloque ; conseil : **prendre le cadeau en début de tour global**. | [VID] moyenne (bug possiblement corrigé 21/01/2025) |
| 09:00 | « Les pics **2000 dégâts Neutres** ». | [VID] haute |
| 10:00 | « **Soutien Stratégique**, vraiment pas ». | [VID] |
| 10:30-11:00 | Erreur typique : Hanediman mal orienté a attiré un allié (Koza) ; « heureusement il est un peu bête, sinon il pouvait me mettre dans les pics » ; rattrapage avec Voltige. | [VID] |
| 13:30 | Cadeau : **Chamboulement**. | [VID] |
| 14:00 | « C'est vraiment des combats aléatoires en fonction des bonus […] mais c'est **toujours pareil** » (même déroulé des vagues). | [VID] moyenne-haute |
| 14:30 | « La Mama au **tour 8** va arriver sur le terrain ; faut qu'on clean tous les mobs ». | [VID] haute |
| 16:00 | **Galvanisation** obtenue 3 fois dans une run : « on était à **22 PA** ». | [VID] moyenne |
| 16:30 | Magicien : « sort ultime […] je peux reconstituer tout le monde » (préparation du tour de Mama), boucliers sur les damage dealers. | [VID] |
| 17:00 | Bonus pris : **PO « au cas où, pour Voltige avec elle »**. « Elle nous balance **direct dans les pics** ». | [VID] haute |
| 17:30 | « La Mama a un état **invulnérable** ; il suffit de la **pousser dans les pics** pour pouvoir la taper ». | [VID] haute |
| 18:30 | « Ça nous arrive parfois de la tuer **le même tour où elle est apparue**, sinon au tour prochain » ; **Relâchement** « ultime » fait des dégâts conséquents. | [VID] haute |
| 20:00 | « On a déjà fait le full succès » (tous les objectifs). | [VID] |
| 22:30 | Fin : **Punition [collective]** « va tuer la plupart des monstres ». | [VID] |

### 2.3 Zephiron — « Guía para los combates del Gladiatrool » (IKqnwLIYffk, 11/02/2025, ES)

Résumé : guide méthodique (rôles, ordre, objectifs, stats, cadeaux) puis run commentée 4 fenêtres ; « literalmente vivo
en el campamento » ; 10-15 min par run.

| Temps | Observation | Statut |
|---|---|---|
| 04:00-04:30 | « El gladiatrool se compone de **10 turnos** enteros y en cada turno saldrán bichos aparte del mismo jefe ». Ordre : **Acrobate 1er, Dompteurs 2e et 3e, Magicien dernier**. | [VID] haute |
| 05:00 | Chaque objectif réussi : un nouveau sort par personnage et Mama perd **5 % de dommages finaux** ; « 5 ou 6 défis » → −25 %. | [VID] moyenne |
| 06:00-07:00 | Stats à chaque tour global (choix aléatoire par personnage) : priorité **Portée > PA > (Dompteurs : % crit / dommages finaux ; Magicien : soins ; Acrobate : PM plutôt que résistances)**. | [VID] |
| 07:30 | « Por cada turno que empiece **después del turno uno** saldrá una casilla en forma de regalo » ; marcher dessus (n'importe quel perso) → améliorer un sort ou sort à usage unique. | [VID] moyenne-haute |
| 08:30 | « **El primero que habla con el NPC inicia el combate y será primera iniciativa** » (cohérent avec le correctif 14/01/2025). | [VID] haute |
| 09:00 | Sort de base commun à tous : poussée de **2 cases** (Frappe Repoussoir) ; sort spécial de l'Acrobate : poussée plus longue en zone. | [VID] haute |
| 10:00 | Magicien : soin en zone qui **blesse aussi les ennemis** touchés ; 2e sort : PA et PM. | [VID] |
| 11:00 | « Siempre lejos de los mobs » ; « hay veces que no pegan o no se mueven directamente y se bugean ». | [VID] moyenne |
| 11:30 | Cadeau : Impact amélioré ; sort unique **Influx de Vitalité** « muy importante » ; objectif « tuer deux ennemis dans un tour de personnage ». | [VID] |
| 13:30 | « Cuando los bichos parten en el glifo se infligen daños de **2000** » ; « ya sé que al jugar este se va a morir ». | [VID] haute |
| 14:30 | Cadeau : amélioration de boucliers, dégâts globaux Dompteurs, et **Relâchement de Fureur** « muy importante para vencer a la jefe ». | [VID] |
| 15:30 | « Turno 5 ». | repère |
| 16:00 | Amélioration du Videur (« Portero ») ; boost qui « cura a todos tus aliados » ; amélioration de Prélèvement. | [VID] |
| 17:00 | Tous les objectifs faits (dernier = tous > 50 % PV) → plus d'objectif proposé. | [VID] |
| 17:30 / 25:00 | Bug de timeline (monstres de vague absents) : **Options de la timeline → cocher « afficher les invocations » puis décocher**, à refaire à chaque vague. | [VID] (corrigé en 3.1) |
| 18:00 | « Oleada 7 » nettoyée ; « la siguiente es donde sale la jefe ». | [VID] |
| 18:30 | Mama visible en haut (gradins) : **150 000 PV** ; se préparer (boost) le tour d'avant. | [VID] haute |
| 20:00 | Mama « pega mucho en área », « empuja », « puede meter fácilmente a tus personajes en los glifos » ; on la pousse dans les pics pour retirer l'invulnérabilité. | [VID] haute |
| 20:30 | **Pense Vite** (« velocidad mental ») : « yo lo tiro un turno antes, en el **turno 7**, y en el turno 8 tengo **999 PA** ». | [VID] haute |
| 21:00 | Relâchement de Fureur : « cada vez que avanzan los turnos aumenta mucho los daños, pero solo un ataque a una entidad » ; « le he bajado **más de 100 000** de vida ». Magicien achève (« 16 000 de vida »). | [VID] haute |
| 21:30 | « **Turno 9** […] esto no termina, **termina el turno 10** si limpian todas las oleadas ». Tout pousser dans les coins. | [VID] haute |
| 22:00 | Poser un « épouvantail » (sort unique qui empêche d'être déplacé ?) ; « empuja, empuja todo el rato ». | [VID] basse |
| 22:30 | « Último que salen **seis bichos** » (= V10 DPLN : 2 Nitroolls + 2 Troollibres + 2 Artroolleurs). | [VID] moyenne-haute |
| 23:00 | Nettoyage final : **Punition Collective** (« castigo colectivo »). | [VID] |
| 23:30 | 15 min en expliquant, **10 min** normalement. | [VID] |
| 24:00-24:30 | L'équipement ne compte pas (stats d'archétype), **sauf la Prospection** qui est conservée → farm du familier en panoplie PP. | [VID] moyenne |
| 26:00 | Pense Vite un tour avant la Mama ; « spamear habilidades 2, 3, 4 » (raccourcis clavier). | [VID] |
| 26:30 | Sans Pense Vite : **Relâchement de Fureur sur les deux Dompteurs** suffit à « deletear a la jefe ». | [VID] haute |
| 27:00 | **Prélèvement** (« cobro ») : vol de vie ; **en coup critique il frappe en zone et vole de la vie en zone**. | [VID] haute (confirmé Khytrayer) |

### 2.4 Khytrayer — « [DOFUS 3.6] GUIA GLADIATROOL FREE KAMAS » (FSlGkDE7ZOQ, 14/08/2026, ES) — **version actuelle**

Résumé : farm intensif (8 dragodindes + 2 familiers en 4 jours), runs de **7 min**. Compo Acro (1er) – Dompteur –
Dompteur – Magicien. Donne beaucoup de **valeurs de sorts et d'améliorations** lues à l'écran. Seule vidéo de 2026 avec
commentaire détaillé.

| Temps | Observation | Statut |
|---|---|---|
| 00:06 | PNJ en [-11,-36] : ticket Gladiatrool 5000 kamas. | [VID] |
| 01:45 | Pas besoin d'équipement : les stats sont remplacées par celles de l'archétype. | [VID] haute |
| 02:16 | « **Cuidado porque la iniciativa va al revés del orden de los grupos.** El Sadi lo tengo el cuarto […] pero empieza el primero ». (= DPLN) | [VID] moyenne (voir §6) |
| 02:30-02:36 | Mécanique = les bords : monstres poussés dans les pics « sufren un **por 200 %** de daño ». | [VID] haute ([DATA] ×200 %) |
| 02:47-03:05 | Objectifs : 2 choix proposés ; réussite → sort + nouvel objectif ; « **con hacer dos o tres ya me hago la pelea** » (toujours les mêmes, les premiers). | [VID] |
| 03:12 | « Cada turno sale una **casilla especial** » (cadeau) : amélioration d'un sort ou sort unique à usage unique. | [VID] haute |
| 03:28 | « La pelea son **10 oleadas**, va aumentando la dificultad ». | [VID] haute |
| 03:32 | « El primero te salen tres, tres, cuatro… » (tailles des premières vagues, dit à la volée). | [VID] **basse** (contredit V1 = 2) |
| 03:34 | « La **oleada ocho es la mama troll**, que es **solo cae esta**, que tiene **150 000** de vida ». | [VID] haute |
| 03:41 | « La oleada **nueve y 10** es limpiar el mob, te caen muchos ». | [VID] haute |
| 04:15 | Infobulle de l'état : « **daño sufrido por 200 %** » ; « si no, no los bajas ni mañana ». « Por eso siempre el posicionador tiene que ir primero ». | [VID] haute |
| 04:28 | « Yo siempre **mato al que va después del personaje que uso** […] así tengo el **turno gratis** ». | [VID] haute |
| 04:41 | **Productivité** faite avec le **Magicien** : « doy PA, curo, curo y ya está ». | [VID] haute |
| 04:56 | « **Basta de proyectiles** también es fácil porque ningún artillero debe estar en el terreno, se hace solo ». | [VID] haute |
| 05:10 | **Amplification** (sort du Magicien) : donne selon la cible **+20 % dommages finaux / +30 % critique** (Dompteur), **+500 dommages de poussée** (Acrobate), **+20 % soins** (Magicien). « A estos le tiro el de daño siempre ». | [VID] haute (2e source après cardxc) |
| 05:34 | Bonus permanents : « siempre priorizar **PA o daños finales** en los que pegan, o PM ». | [VID] |
| 05:59 | **Relâchement de Fureur** : « muy OP para la **oleada ocho** para matar a la mamá troll porque pega una burrada ». | [VID] haute |
| 06:32-06:52 | **Prélèvement** : **3 PA**, vol de vie ; « si sale **crítico pega en área de dos** » ; **amélioré → zone de trois**. | [VID] haute |
| 07:26 | Il n'utilise pas les dommages de poussée : « la función del posicionador con que los meta en los pinchos ya es suficiente ». | [VID] |
| 07:30-07:37 | **Hanediman** : « empuja un montón y a tus aliados los atrae » ; **amélioré : poussée de 4 → 6 cases** ; bon pour mettre plusieurs monstres à la fois. | [VID] haute |
| 07:50 | **Ultime Espoir** pris « por si se muere alguno ». | [VID] |
| 08:28 | « Ves que los retos no los estoy haciendo […] con los hechizos que tengo ya me vale ». | [VID] |
| 08:49 | « Yo he hecho runs de **7 minutos** ». | [VID] |
| 09:14 | Nouvelle vague qui tombe. | repère |
| 09:23 | Erreur à éviter : Hanediman sur 2 monstres puis Videur → « **se quedan a una casilla de los pinchos** y no me renta » (calcul de distance au bord crucial). | [VID] haute (utile au planificateur) |
| 09:44 | Prélèvement sans crit → **pas de dégâts** (lancé sans cible). | [VID] |
| 10:04 | **Impact amélioré : zone de 3**, « muy buen hechizo ». | [VID] haute |
| 10:16 | **Regain Vigoureux** (« recuperación vigorosa ») amélioré : **passe de +2 PA/+2 PM à +3** ; « esta hay que pillarla ». | [VID] moyenne-haute |
| 10:25 | **Courage fuyons** (« Huyamos ») : **+4 PM**. Sorts à icône claire = usage unique. | [VID] moyenne |
| 10:46 | Amélioration du soin (Pulsation d'Énergie ?) : « una casilla más de alcance, **pasa de dos a tres** ». | [VID] moyenne |
| 11:08 | **Frappe Repoussoir** (« golpe repelente », commun à tous) pousse de **2**. | [VID] haute |
| 11:21 | Prélèvement permet de se soigner sans Magicien. | [VID] |
| 11:35 | **Punition Collective** « pega a todos » → gardée pour **V9 et V10**. | [VID] haute |
| 11:44 | **Pulsation Chaotique** : « como castigo colectivo pero hace un poco menos de daño […] **contra más enemigos más pega** ». | [VID] moyenne |
| 12:39 | **Pense Vite** : « te da **999 PA** y los tienes que usar en **10 segundos** ». | [VID] moyenne (15 s selon d'autres, §6) |
| 12:49 | **Influx de Vitalité** (« flujo de vida ») : soigne tous les alliés « casi full HP ». | [VID] |
| 13:04 | « De **2000 para abajo se mueren** con el daño que hacen los pinchos, porque los pinchos hacen daño **cada turno** ». | [VID] haute |
| 13:23 | « Ahora cae la mamá » → booster avant. | repère |
| 13:33 | Sort spécial du Magicien « que te da **15 000 de escudo a todos** » (Muraille Collective). | [VID] haute (3 sources) |
| 13:58 | « A la mamá hay que meterla a los pinchos **sí o sí** porque si no no le haces daño ». | [VID] haute |
| 14:13 | Pulsation/Punition gardées pour les vagues suivantes. | [VID] |
| 14:30 | Relâchement : « **siempre suelo tener dos** » ; avec un seul, il **ne l'a pas tuée** en un tour. | [VID] haute |
| 14:44 | « Si se queda un turno más viva tampoco supone un problema muy grande, pero es recomendable matarla cuanto antes ». | [VID] |
| 14:56 | Sort de l'Acrobate « **Largo** » (Dégagez !) « empuja a todo ». | [VID] |
| 15:11 | Soutien Stratégique (« estratega ») : « atrae sin más ». | [VID] |
| 15:39 | Les monstres « se están acumulando » → Punition Collective même hors pics. | [VID] |
| 16:48 | Dernière vague ; 16:52 **Pulsation Chaotique**. | repère |
| 17:04-17:26 | 2 morts « pero ya la pelea está acabada » (normalement personne ne meurt). | [VID] |
| 17:52 | 13 min en expliquant ; **7 min** en temps normal. | [VID] |

### 2.5 Huz — « Le GLADIATROOL de DOFUS UNITY » (ShlRLUWn7VM, 09/11/2024, FR) — victoire, Pense Vite

Résumé : première victoire à 4 comptes en 24 min (bêta), 2 Acrobates (dont Calyptus, « premier Dompteur » par erreur de
nom), un Dompteur, un Magicien. Illustre la préparation T7 et le burst T8.

| Temps | Observation | Statut |
|---|---|---|
| 00:00-00:25 | Choix d'objectif : **Sauvez-le** vs **Ébranlable** (« un combattant doit être achevé en état Inébranlable ») ; « Sauvez-le plus simple » : regarder l'allié marqué d'un petit cœur et le remettre full vie à la fin. | [VID] |
| 00:35-00:55 | Bonus : PA, PM, PA, PA, crit, soin. | [VID] |
| 01:05 | Cadeau : choix **Dégagez !**, **Pense Vite**, **Voltige** (amélioration). | [VID] |
| 01:11 | « J'ai fait le sort qui boost [Regain Vigoureux] au T1 ; il faut que je le relance au **T4** » (→ relance 3 tours). | [VID] moyenne |
| 01:25 | « On évite les zones avec eux, les [Nitroolls/Artroolleurs] font trop mal en zone ». | [VID] |
| 02:57-03:40 | Objectifs lus : « **Tout le monde veut prendre sa place** : au début de son tour chaque [allié] marque une cellule [d'un ennemi] » ; « **tous les Artroolleurs doivent être à distance de 3 cases ou moins** d'un [allié] à la fin […] » (Distance d'insécurité) ; « il y en a deux, il faut que j'en tue un et l'autre doit finir à mon CàC ». | [VID] |
| 04:40 | **Tout va bien** : fin du tour global, tous > 50 %. | [VID] |
| 05:53 | **Au coin** : « tous les combattants doivent être dans les pics à la fin du tour d'un combattant ». | [VID] |
| 06:05 | « Il y en a au moins trois qui ont pop » (nouvelle vague). | repère |
| 07:15 | Nouveau sort Dompteur : **Grondement Grandissant** (« grondissement ») ; Impact ; « je tue les deux ». | [VID] |
| 08:20 | Amplification, puis « tour full shield » (bouclier puis soin). | [VID] |
| 08:49 | « **Surveiller le tour 7** surtout, c'est le tour 7 qui est hyper important ». | [VID] haute |
| 09:40 | Troollibre **Inébranlable** : impossible de former la zone → obligé de le tuer. | [VID] |
| 10:37-10:56 | « C'est combien de tours ça ? 3 tours, ok donc ça devrait faire pour l'arrivée de la Mama » ; « tour 6 ». | [VID] |
| 11:40 | Sorts uniques proposés : **Onde Fracassante**, **Vague de Dégradation**. | [VID] |
| 12:08-12:40 | Critique : « c'est trop dur de créer les zones même avec deux acrobates, tu as **pas de portée** sur tes sorts » ; « 0 PO, ça peut être un gros problème ». | [VID] (→ importance de la PO) |
| 13:20 | Plan : « prochain tour je lance **Pense Vite** », puis Prélèvement ×2 (« ça met l'**érosion** sur la Mama »), Impact ×2, Frappe Repoussoir. | [VID] |
| 13:40 | Soin « +5000 ». | [VID] |
| 14:22 | « On était [tour] **7** là, il faut faire **Pense Vite sur le Dompteur**, très important ». | [VID] haute |
| 15:10 | Sort unique **Va-en-guerre** : rapproche le lanceur de la cible. | [VID] |
| 16:30 | Relâchement de Fureur : « j'ai déjà mis **30 000** avec ça » (avant Mama). | [VID] |
| 17:01-17:20 | « **La Mama arrive** […] elle fait rien de spécial » ; « si elle tape mes persos qui sont **vulnérables** elle peut vraiment les dépioter ». | [VID] |
| 17:25 | « **Voltige**, la pousse, je la tape ». | [VID] |
| 18:00 | « J'ai que **15 secondes** pour jouer » ; **Onde Fracassante** : « dommages neutres aux ennemis en zone selon leurs **PV érodés** » → à lancer en tout dernier. | [VID] haute |
| 18:20-18:50 | Séquence T8 : Prélèvement, Prélèvement, Impact, Frappe, Malédiction [Collatérale], **Relâchement de Fureur** ×2 (2 persos), Onde Fracassante. | [VID] |
| 19:14 | « Vous avez vu, **−140 000 en un tour** ; en fait j'ai utilisé que **2/3 des actions** » (animations trop longues). | [VID] haute |
| 19:30 | « J'ai tellement été efficace que le combat il a pas compris que c'était fini » (Mama morte, mais le combat continue). | [VID] |
| 19:50 | « Il y a plein de mobs là, c'est du harcèlement » (vagues 9-10 + accumulation). | [VID] |
| 20:05 | Dégagez ! « c'est pas mal ». | [VID] |
| 21:40 | « Le Gladiatrool c'est **RNG land** ». | [VID] |
| 22:10 | « Tu repousses en permanence » ; « 10 PM ». | [VID] |
| 23:04 | « Je viens de tuer **14 mobs en un tour** ». | [VID] haute |
| 23:25 | « **24 minutes**, première tentative à 4 comptes ». | [VID] |

### 2.6 Huz — « Le GLADIATROOL sur DOFUS UNITY (Nouveau Banger) » (kGlKYY7_qew, 26/09/2024, FR) — 1re run, défaite

| Temps | Observation | Statut |
|---|---|---|
| 01:00-01:30 | Choix de l'archétype en début de combat ; sorts de départ : Dompteur **Impact** (dommages neutres en zone), Acrobate **Videur** (repousse en zone + dommages neutres), Magicien soin. Compo : 1 Dompteur, 2 Acrobates, 1 soigneur. | [VID] haute |
| 02:00 | « C'est pas selon ton ordre d'initiative de base, tu as un ordre défini direct par le jeu » (bêta). | [VID] (périmé) |
| 02:30 | « On a **30 000** de vie […] mais on prend du **−5000** ». | [VID] haute |
| 03:00 | Impact « fait hyper mal » ; soigneur « du **3000 en zone** ». | [VID] |
| 03:30-04:00 | 1er objectif validé → objectifs proposés (Meurtre en série, « un ennemi doit être achevé par les dommages de poussée », « un allié doit achever deux ennemis pendant son tour ») ; **c'est un vote**. | [VID] |
| 04:00 | Magicien gagne « augmente les PA/PM de ses alliés » (Regain Vigoureux) ; les autres persos gagnent aussi un sort. | [VID] haute |
| 04:30 | Bonus proposés : PA, résistance mêlée, « bonus acclamation » ; « il faut se dépêcher » (timer). | [VID] |
| 05:00 | Acrobate gagne **Hanediman** (« attire les alliés, repousse les ennemis en zone ») ; **pas de prévisualisation** de déplacement (bêta). « Il me reste 14 000 ». | [VID] |
| 05:30 | Videur : « **−4000** » ; « je peux le remettre dans la zone où il prend énormément de dégâts ». | [VID] |
| 06:00 | Dompteur gagne un sort « dommages augmentés pour un tour au **2e tour après son lancer** » (Grondement Grandissant, à canaliser). | [VID] moyenne |
| 07:00 | Objectif **Sauvez-le** : « au début de chaque tour global un allié est désigné, il doit avoir tous ses PV à la fin du tour global » — jugé très dur ; il perd un perso (16:00 « quel chall de merde »). | [VID] |
| 08:00 | Acrobate gagne « échange de position + dommages aux ennemis » (**Voltige**). | [VID] |
| 08:30 | « Il reprend un dégât de ouf sur cette même zone alors qu'il y était déjà […] ça a croqué plusieurs fois » → **redéclenchement du glyphe** en étant poussé d'une case de pics à une autre ? | [VID] basse |
| 09:00 | « Surveiller l'ordre d'initiative, défoncer le mob qui joue juste après ». | [VID] |
| 09:30 | Soin « 4000 ×2 » ; **Amplification** = « augmente les dommages finaux » d'un allié. | [VID] |
| 11:00 | Impact : **2 lancers par tour** ; **Prélèvement** (vol de vie neutre). | [VID] |
| 13:30 | « −8000 en zone » (Dompteur) ; « pourquoi des fois 10 000, là 7000 ». | [VID] |
| 15:00 | « Ils sont tous **indéplaçables** » (Troollibres Inébranlables). | [VID] |
| 16:00 | **Regain Vigoureux** « je bouge sans zone » ; un perso meurt. | [VID] |
| 17:50 | Objectif « Tout le monde veut prendre sa place » lu : « marque la cellule du combattant ennemi **le plus proche** » (DPLN : le plus éloigné). | [VID] basse |
| 18:30 | **Mama pop : « elle a bondi et elle m'a fait −20 000 » sur le Dompteur full vie (20 000 PV) → mort.** | [VID] haute |
| 19:00 | Mama : « −10 000 » ; PV lus « 137 [xxx] / 150 000 ». Sort de bouclier gagné. | [VID] |
| 20:00 | Défaite. Conclusion : « faut prendre la bonne compo, avoir les bonnes strats ». | [VID] |

### 2.7 Isthos — « Everything There Is To Know About Gladiatrool » (Vwe_m7suH9A, 18/03/2025, EN)

| Temps | Observation | Statut |
|---|---|---|
| 00:00-00:20 | « Every turn […] new quests, new cells that you have to walk on to get bonuses ». | [VID] |
| 01:03 | « The **perfect comp is two acrobats, one DPS and one medic**, and they need to play **in that order** ». | [VID] haute |
| 01:12-01:30 | « **The order that we play in is the order that we enter the fight** » : il lance le combat (Acrobate 1), puis Acrobate 2 rejoint en 2e, DPS 3e, soigneur 4e. | [VID] haute (= correctif 14/01/2025) |
| 01:53 | Pics : « deal damage and apply a special vulnerable effect that makes you take **twice as much damage**. This applies **both to us and to the monsters** ». | [VID] haute ([DATA] ×200 %) |
| 02:05 | Les Acrobates jouent d'abord pour pousser, puis le DPS nettoie, le soigneur maintient. | [VID] |
| 02:28 | « The **first quest is always the same** : kill one enemy that went into the spikes ». | [VID] haute ([OFF] GD) |
| 02:45 | « Stay a bit far because I don't want to get hit by the AoE ». | [VID] |
| 03:38-03:55 | Quête suivante choisie : 3 sorts dans le tour (Productivité) → « **the Healer can on his first turn use three spells** ». | [VID] haute |
| 04:10 | « This fight really **snowballs** : when you start to be in trouble it goes from bad to worse ». | [VID] |
| 04:17-04:35 | « Every global turn we get an upgrade » ; « **AP is always a super solid choice** » ; choix différents par classe. | [VID] |
| 04:54-05:10 | Cadeau : « either a super strong one-time-use spell or an upgrade to one of your existing spells ». | [VID] |
| 05:14 | Sort unique commun : « it just gives **MP to everyone** ». | [VID] |
| 05:33 | « Every time we complete a quest it **nerfs the Mama** ». | [VID] |
| 05:55 | À l'arrivée de Mama : « I got pushed into the spikes, **we all got pushed into the spikes** ». | [VID] haute |
| 06:55 | « **Once the boss is dead we still have to kill everyone** ». | [VID] haute |
| 07:06 | Victoire au premier essai. Familier Gladiatrool : 70 puissance, 15 % crit. | [VID] |

### 2.8 Houmilito — « LE GLADIATROOL SUR DOFUS 3 ! » (HSHSLHi5jQY, live du 31/10/2024, FR, ~3 h 45)

Résumé : live de découverte à 4 joueurs (bêta), nombreuses défaites et erreurs instructives, victoire en fin de live
avec 2 Acrobates. Déjà largement exploité par la note 50 ; timestamps clés ci-dessous (h:mm, ±30 s).

| Temps | Observation | Statut |
|---|---|---|
| 0:31:00-0:31:30 | « On a 30 000 HP mais on prend des patates » ; pousser dans les pics « fait des gros dégâts » ; soin 10 000. | [VID] |
| 0:35:30 | Objectifs : **Ébranlable** (achever un ennemi Inébranlable), « un ennemi doit rentrer dans les pics et un allié doit en sortir ». | [VID] |
| 0:39:00 | « Ce sera **toujours les mêmes mobs**, il n'y a pas ce côté [aléatoire] comme le Gladiatrool Rétro ». | [VID] moyenne-haute |
| 0:39:30 | Bonus « +5000 Vita » ; « acclimatation vitalesque ». | [VID] |
| 0:40:00 | Sort unique « **4 PA à tout le monde** » (Galvanisation) ; Pense Vite : « au début du prochain tour gagne **1000 PA** mais le temps du prochain tour est fixé à **10 secondes** » (texte lu). | [VID] moyenne |
| 0:43:30 | « Il faut **deux acrobates** » ; « c'est peut-être dans l'ordre alphabétique, l'initiative ». | [VID] |
| 0:45:00 | Cadeau : « **15 000 de bouclier** » (Muraille Collective). | [VID] haute |
| 0:47:30 | « Celui du bas va reprendre **2000** » (début de tour dans les pics). | [VID] |
| 1:05:00 | « J'ai pris 2000 » (allié dans les pics). | [VID] |
| 1:18:00 | Objectif **Stop aux projectiles** : « à la fin du tour global aucun Artroolleur ne doit être présent ». | [VID] |
| 1:23:30 | « Pendant le tour d'un allié, **quatre** ennemis doivent entrer dans les pics » ; « à la fin d'un tour global tous les alliés > 50 % PV ». | [VID] |
| 1:33:30 | « À chaque fois tu les mets dans les pics ils subissent beaucoup plus de dégâts, faut vraiment tout le temps les pousser ». | [VID] |
| 1:55:00 | Objectif « pendant le tour d'un combattant, **trois** ennemis différents doivent subir des dommages de poussée ». | [VID] |
| 1:56:00 | Sort unique **Détonation** : dégâts selon le nombre d'ennemis dans la zone, augmente la taille de zone. | [VID] |
| 2:05:00 | Mama tuée → « **faut tuer le reste**… on le savait pas » → défaite. | [VID] haute |
| 2:10:00 | « Dans l'ordre d'initiative ce serait mieux que les deux acrobates commencent mais c'est **aléatoire** depuis le début » (bêta). | [VID] (périmé) |
| 2:32:30 | Sort unique « applique un seuil de 1 % des PV sur le lanceur, le lanceur subit les dommages à la place des alliés » (≈ Un pour un / Ultime Espoir ?). | [VID] basse |
| 2:36:30-2:38:30 | Spéculation « au tour 11 le combat est fini peu importe où tu en es » (**non vérifiée**) ; « **elle arrive bien tour 8**… c'est pas 7 » ; Mama **invulnérable** ; « il faut que tu voltiges le boss près [des pics] ». | [VID] haute (T8) / basse (T11) |
| 2:53:30 | Colère/sort amélioré : « **12 614 minimum** ». | [VID] |
| 2:55:00-2:55:30 | Pense Vite lancé le tour avant Mama ; « **en 10 secondes tu peux mettre 3 sorts max** » à cause des animations. | [VID] moyenne-haute |
| 3:17:00 | « Ça peut nous donner des sorts de fou pour la prochaine vague » (cadeau). | [VID] |
| 3:19:30-3:20:00 | « **La Mama est inébranlable, je peux pas la pousser** » → « tu peux échanger de place avec un inébranlable » (**Voltige**) → la mettre dans le glyphe. | [VID] basse-moyenne (1 source) |
| 3:21:00 | « Il y a encore une vague, la **10e**, dernière ; on gagne si on survit ». | [VID] |
| 3:24:00 | Victoire (« on a tout fait, on a gagné »). | [VID] |

### 2.9 Barbe Douce — « Je test le GLADIATROOL sur la Beta Unity 3.0 » (v3cDvm3x4pw, 26/09/2024, FR)

| Temps | Observation | Statut |
|---|---|---|
| 00:04-00:25 | Stats de l'archétype : **30 000 PV**, **1000 dommages de poussée**, **6000 Force**, mono-élément (neutre). | [VID] haute |
| 01:10 | « Les Troollibres **25 000 HP**, on tape du **1500** » (coup de base, cible hors pics). | [VID] haute |
| 01:41 | Après poussée dans le bord : « **11 000** » ; « le bord de map, le but c'est de les déplacer ». | [VID] moyenne |
| 01:52 | T1 : « il est inébranlable lui, mais **ils sont tous les deux** inébranlables » → V1 = **2 Troollibres**, Patroolleur actif dès le T1. | [VID] haute |
| 02:24 | Hanediman : « attire les alliés, repousse les ennemis en zone ». | [VID] |
| 03:39 | Sort unique **Malédiction Mouvante** : « ça bloque la progression ». | [VID] |
| 04:07-04:20 | « On est **tour 3** » ; Mama « elle brille… elle vient se fight avec nous » (animation dans les gradins, pas une arrivée). | [VID] basse |
| 04:46 | Sort unique **Punition Collective**. | [VID] |
| 05:30 | « On a 30 000 HP mais on se fait détruire » ; à 3 joueurs : défaite. | [VID] |
| 07:17 | « **La méta c'est deux placeurs** » (J+1 de la bêta). | [VID] |
| 09:36 | Magicien : 2 sorts au départ, **Frappe Repoussoir** et **Pulsation d'Énergie** (soigne les alliés en zone et occasionne des dommages). | [VID] haute |
| 11:04 | Bonus proposés : résistance mêlée, **Portée**, Vita. | [VID] |
| 11:27 | Cadeau : **Pense Vite** « au début du tour gagne **901 PA**, le temps du prochain tour est fixé à **15 secondes** » ; amélioration « Pulsation Énergétique : taille qui passe de [2 à] 3 ». | [VID] moyenne (901 = affichage bêta ?) |
| 12:11 | Objectif **1,2,3 Soleil !** : « chaque allié doit finir son tour sur la cellule où il a commencé son tour » ; autre : « un allié doit achever un ennemi dans son tour ». | [VID] haute |
| 13:40 | Pulsation d'Énergie : « ça soigne si tu roxes en même temps, mais pas l'inverse ». | [VID] basse |
| 14:54 | Cadeau : « soigner tous les alliés » (Influx de Vitalité) **ou** « **15 000 de shield** » (Muraille Collective) — sorts éphémères. | [VID] haute |
| 18:03 | « Ça coûte **3 PA** » (sort de soin de zone). | [VID] |

### 2.10 Mishurra — « GUÍA GLADIATROOL ➡️ EL MODO ROGUELIKE DE DOFUS » (PxTtn2g9sx4, 26/09/2024)

(Transcription TubeLab = piste doublée automatiquement en arabe ; traduite ici.)

| Temps | Observation | Statut |
|---|---|---|
| 00:27 | Arène en **[-9,-41]** ; ticket vendu sur la carte Zaap de la Foire du Trool. | [VID] |
| 01:30-01:45 | Jusqu'à 4 joueurs ; 10 tours ; boss final Mama. | [VID] |
| 02:24 | « Sur les **bords de la carte** une zone hérissée **de deux cases de large** » : les monstres poussés dedans subissent de très gros dégâts. | [VID] moyenne (à vérifier sur les 102 cellules du glyphe [DATA]) |
| 02:41 | Il faut aussi mettre la Mama dans la zone pour lever son immunité. | [VID] haute |
| 03:41 | « À la **fin de chaque tour global**, choix parmi **trois** bonus » ; priorité **PA** pour tous, Force/crit pour les Dompteurs, soins pour les Magiciens. | [VID] |
| 04:15-04:25 | Cases cadeaux ; ex. sort « **999 PA** pour un tour mais **15 secondes** seulement ». Magicien : soin de tous, reconstitution générale, bouclier complet. | [VID] |
| 05:52 | Compo recommandée : **1 Acrobate, 2 Dompteurs, 1 Magicien, dans cet ordre d'initiative**. | [VID] haute |
| 06:32 | « Au **tour 8** apparaît le boss final » : le pousser dans les pics puis tout focus. | [VID] haute |
| 06:47 | Mama « fait de gros dégâts et **pousse en ligne droite** » ; vos persos poussés dans les pics subissent aussi des dégâts accrus. Garder le soin de groupe et le bouclier de groupe du Magicien pour ce moment. | [VID] haute |
| 07:08 | « Éliminez le plus de monstres possible à chaque vague, sinon ils **s'accumulent** ». | [VID] haute |
| 07:40-13:30 | Combat complet sans commentaire. | — |

### 2.11 Huz — rediffusion commentée de l'AnkamaLive 2.73 (CY_cgLRjkoM, 11/09/2024) — propos des GD **[OFF]**

Déjà détaillé dans la note 50 §2. Éléments utiles au simulateur (timestamps de la rediffusion) :
- 19:30 : sorts ultimes à usage unique ; **Pense Vite « au prochain tour 1000 PA mais vous avez que 15 secondes »**. [OFF]
- 20:30 : « zone de danger permanente sur la map […] utile pour les ennemis et pour les alliés ». [OFF]
- 44:30 : « Il y a déjà la Mama Troollette qui est là [gradins] mais elle va pas être tout de suite ». [OFF]
- 46:00 : premier objectif commun à tous = tuer un Troll entré dans les pics et Vulnérable. [OFF]
- 46:30 : « à chaque début de tour vous avez un petit choix […] en fonction de votre archétype […] de façon infinie ». [OFF]
- 47:30 : démonstration : « en le tapant je lui fais du **4000** » puis mise dans les glyphes → Vulnérable. [OFF]
- 48:30 : Mama « au début en état 5 », chaque objectif réussi diminue l'état et ses dommages finaux. [OFF]
- 49:00 : égalité de vote → tirage aléatoire. [OFF]
- 49:30 : « petit glyphe qui pop […] **à tous les tours** de manière aléatoire sur le terrain ». [OFF]
- 50:00 : exemple de sort unique « de plus en plus mal si on ne l'utilise pas à chaque tour », « sans contrainte de PO,
  sur tous les ennemis » (≈ Relâchement de Fureur / Punition Collective). [OFF]
- 50:30 : amélioration d'**Impact : cercle 2 → cercle 3** (+ lancers par tour). [OFF]
- 53:00-53:30 : « **à partir du tour 10 il n'y a plus de vague**, vous pouvez gagner tour 10 ou tour 11 » ; Mama
  **niveau 1000** ; run 10-15 min. [OFF]
- 58:30 : idéal GD : « Acrobate joue en premier, après le Magicien, après le Dompteur » (non imposable). [OFF]
- 60:00-60:30 : jusqu'à **7 sorts par archétype**, tous améliorables ; **~15 sorts uniques**. [OFF]

### 2.12 Vidéos secondaires (fiches courtes)

- **Sword — « Gladiatrool Arena (autowin) »** (xDmoOV-9A18, 06/07/2026, EN) : 00:25 « The first one in order will be
  an Acrobat, the other two Tamers and the last one a Magician. **This order is really important** » ; 00:50 « same thing
  applies to allies, so I am trying to **keep everybody safe in the middle**, away from the spikes » ; 01:07 « Every time
  a turn is over, you have extra bonuses » : PA pour l'équipe, **dommages finaux** pour les Dompteurs, sinon résistances
  (Acrobate) et soins (Magicien) ; 01:24 « Whenever you see a gift cell, place someone in there » (sorts pour toute
  l'équipe) ; 01:33 « Try **not to waste these spells in early game** » (garder pour Mama et les vagues suivantes). [VID]
- **Skaradon — « BEATING THE GLADIATROOL IN DOFUS UNITY! »** (AX-A1ULkP0A, 07/01/2025, EN) : 00:38 « 10 waves » ;
  00:47 pousser dans les pics pour frapper plus fort ; 01:06 « each round three choices of stats » (PA, PM, dégâts,
  soins) ; 01:24 cadeaux = amélioration pour toute l'équipe ; 01:45 « around **7th or 8th turn** the Mama will jump in »,
  la pousser dans les pics. Reste de la vidéo = combat en musique. [VID] basse
- **Koza — Speedrun** (5WWUKwtPtXw, 19/12/2024) : aucun commentaire (musique). Storyboard analysé (1 vignette / 5 s) :
  choix d'archétype à ~00:15 ; 4 personnages groupés **au centre** au T1 ; run complète en ~11 min ; nombreuses fenêtres
  de choix (objectifs, bonus, cadeaux) entre les tours. Pas d'ID de cellules exploitables. [VID] basse
- **Hy-glou — « Gladiatrool Autowinn Dofus 3.0 »** (RNU9FVDzeZ8, 01/01/2025) : pas de transcription ; description :
  « 2 Acrobates (**privilégier PO**), 1 Dompteur (privilégier **PA** et **Relâchement de Fureur**), 1 Magicien
  (privilégier **soins / bouclier / reconstitution**) ». [VID]
- **Yonexx — speedrun bêta** (jHqI2CZoFPM, 27/09/2024) : description : « toujours les mêmes conditions si on tue avec
  tel perso à X moment, même sans focus les objectifs c'est trop ez » → déroulé **déterministe** des vagues. [VID] basse
- **ProTeam — « Ma PLUS RAPIDE RUN »** (L51ZTzHZtHo, 08/10/2025) : pas de transcription ; commentaire : « tu aurais dû
  retirer les animations de sorts pour opti le temps de run » (option du client qui accélère les tours). [VID]

---

## 3. Déroulé type d'une run gagnante (reconstitué à partir des vidéos)

Compo par défaut du simulateur : **A1 Acrobate → D1 Dompteur → D2 Dompteur → M Magicien** (variante : A1 → A2 → D → M).

| Phase | Ce qui se passe | Décisions observées chez les joueurs gagnants | Preuves |
|---|---|---|---|
| Avant T1 | Choix de l'archétype (fenêtre à 3 cartes) ; placement ; Mama visible dans les gradins et dans la timeline. | Placement groupé **au centre** (carré 2×2), identique à chaque run. | cardxc 03:30 ; Koza 02:30 ; storyboards ; GD 44:30 |
| T1 (V1 = 2 Troollibres, souvent Inébranlables via Patroolleur) | Premier objectif imposé : **Empalé** (tuer un Troll Vulnérable). | A1 pousse les 2 Troollibres dans les pics (s'ils ne sont pas Inébranlables), D1 tue celui qui joue juste après, M soigne/booste. Choix du 2e objectif : **Productivité** (M : PA + soin + soin). | cardxc 03:30-04:30 ; Barbe Douce 01:52 ; Isthos 02:28-03:55 ; Khytrayer 04:41 |
| Fin T1 / début T2 | Bonus d'« Acclamations » (3 propositions par perso, timer). Premier cadeau au sol à partir du T2. | PO (Koza, Zephiron) ou PA (cardxc, Khytrayer, Sword, Isthos) ; Dompteurs : dommages finaux / crit ; Magicien : soins ; cadeaux pris **en début de tour global**. | cardxc 06:00 ; Koza 04:00, 08:00 ; Zephiron 07:30 |
| T2-T6 (V2-V6) | Vagues successives (1 par tour, s'accumulent). Objectifs enchaînés (2-3 pour les runs rapides, jusqu'à 5-6 = « full succès »). | Tuer en priorité le Troll **qui joue juste après** ; ne pas laisser un monstre ≤ 2000 PV au bord (il meurt seul) ; garder l'équipe au centre ; Regain Vigoureux T1/T4… ; Relâchement de Fureur pris dès qu'il sort. | cardxc 06:30-14:30 ; Koza 04:30 ; Khytrayer 04:28, 13:04 ; Huz 01:11 |
| T7 (V7 = 3 Nitroolls) | Dernier tour avant Mama. | **Pense Vite** lancé sur un Dompteur ; Galvanisation ; boucliers (Muraille collective 15 000, Protection Prolongée) ; soins de groupe ; **éviter la ligne d'arrivée de Mama** (DPLN) ; ne perdre personne. | Huz 08:49 & 14:22 ; Zephiron 20:30 ; Koza 16:30 ; cardxc 19:00 |
| T8 (V8 = Mama seule) | Mama saute sur le terrain et **repousse tous les persos en ligne** vers les pics (Rassemblement Troollesque, DPLN) ; peut tuer un perso full vie (−20 000). Un perso poussé sur un **cadeau** annule son animation/ses dégâts. | A1 la **pousse dans les pics** (ou **Voltige** si elle est Inébranlable) ; burst : Relâchement de Fureur (×2 idéalement), Pense Vite (999 PA, ~3 sorts effectifs), Prélèvement, Impact, Onde Fracassante en dernier (érosion). Tuée le même tour ou au T9. | cardxc 19:30-20:30 ; Koza 17:00-18:30 ; Huz 17:01-19:14 ; Khytrayer 13:23-14:44 ; Zephiron 20:00-21:30 |
| T9-T10 (V9 = 5 monstres, V10 = 6) | Vagues finales + restes accumulés ; **le combat continue après la mort de Mama**. | **Dégagez !** (tout contre les bords/pics) → **Punition Collective** / **Pulsation Chaotique** (sur le plus bas PV) → nettoyage ; jusqu'à 14 kills en un tour. | cardxc 21:30-23:30 ; Khytrayer 11:35, 16:48 ; Huz 23:04 ; Zephiron 21:30-23:00 |
| Fin | Victoire quand tous les ennemis sont morts après la V10 (T10 ou T11). | Durée : 7 min (Khytrayer, Laltoss), 10-15 min (cardxc, Zephiron, GD), 24 min (Huz 1re victoire). | Khytrayer 08:49 ; GD 53:30 |

---

## 4. Synthèse transversale

### 4.1 Composition et ordre de jeu
- **Acrobate toujours premier** (toutes les vidéos gagnantes ; Khytrayer 04:15 « por eso siempre el posicionador tiene
  que ir primero »). **Magicien toujours dernier** dans les vidéos gagnantes (il soigne/booste après les frappes et
  peut faire Productivité seul). Le GD préférait Acro → Magicien → Dompteur (58:30), non suivi par les joueurs. [VID] haute.
- 2 Dompteurs (cardxc, Zephiron, Khytrayer, Mishurra, Sword) vs 2 Acrobates (Koza, Isthos, Hy-glou, Huz, Houmilito,
  Barbe Douce « la méta c'est 2 placeurs »). Argument 2 Acro : plus de mises en pics avant que les monstres jouent ;
  argument 2 Dompteurs : Relâchement de Fureur sur 2 persos pour tuer Mama en 1 tour (Zephiron 26:30, Khytrayer 14:30).
  → **À départager par le simulateur.**
- **Déterminer l'ordre** : voir §6.1 (ordre d'entrée vs ordre inverse du groupe).

### 4.2 Les pics (glyphe de bord)
- 2000 à l'entrée (Koza 09:00, cardxc 11:00, Zephiron 13:30) ; −2000 au début du tour d'un monstre resté dedans
  (cardxc 14:30, Houmilito 0:47:30, Khytrayer 13:04) ; s'applique aussi aux alliés (Isthos 01:53, Houmilito 1:05:00).
- **[DATA]** (cache décodé `prev_out/decoded_spells.md`, sort 30390 « Glyphe de combat ») : niveau 2 (glyphe-aura, à
  l'entrée) = états Vulnérable + 2000 dommages Neutre + « Dommages subis x200% » ; niveau 3 (glyphe de début de tour) =
  **1000** dommages Neutre ; sort 30701 (passif) = Vulnérable 1 tour + « Dommages subis x200% ».
  **[HYP] réconciliation** : l'observation « −2000 au début du tour » = 1000 × 2 (cible Vulnérable) ; et l'observation
  de Huz (« ça a croqué plusieurs fois », 08:30) = redéclenchement de l'entrée (2000, potentiellement ×2 si déjà
  Vulnérable) quand on est poussé d'une case de pics à une autre. À valider par l'agent données.
- Largeur « 2 cases » (Mishurra 02:24) : à confronter aux 102 cellules du glyphe [DATA].
- Hors pics, les dégâts sont dérisoires (cardxc 15:30, Khytrayer 04:17) → le simulateur doit pénaliser fortement toute
  frappe sur cible non Vulnérable.
- Monstre à ≤ 2000 PV laissé dans les pics : **meurt à son propre début de tour** → inutile de le frapper, sauf objectif
  (« Meurtres en série » : attention à ne pas le laisser mourir seul, cf. note 50).

### 4.3 Vagues : quand, quoi, où
- **Quand** : une vague par tour global, T1 → T10 (GD 53:00 ; Zephiron 04:00 ; Khytrayer 03:28) ; accumulation si on ne
  nettoie pas (Mishurra 07:08 ; Khytrayer 15:39 ; Huz 19:50 « harcèlement »). Moment exact d'apparition dans le tour :
  non précisé verbalement (Houmilito 1:55:00 « nouvelle vague qui pop » juste après une fenêtre de choix) [HYP : début
  de tour global].
- **Quoi** : V1 = 2 Troollibres (cardxc 03:30, Barbe Douce 01:52) ; V8 = Mama seule (Khytrayer 03:34) ;
  V10 = 6 monstres (Zephiron 22:30) ; V9-V10 = « nettoyage » (Khytrayer 03:41). Composition **fixe** d'une run à l'autre
  (Koza 02:30 & 14:00, Houmilito 0:39:00, Yonexx). Tout concorde avec la liste DPLN (V1…V10). Seule discordance :
  Khytrayer 03:32 « tres, tres, cuatro » (dit à la volée, écarté).
- **Où** : aucune vidéo ne donne de cellule. Observations grossières (storyboards 320×180) : au T1 les 2 Troollibres
  sont de part et d'autre du groupe central (un NO, un SE, à 2-4 cases). Le fait que Koza répète « le même placement à
  chaque fois » et que cardxc indique une case précise pour l'Acrobate au T1 implique des **positions d'apparition
  fixes** [HYP moyenne]. → à établir par frames haute résolution (VOD Twitch) ou par les données.

### 4.4 Mama Troollette
- Arrivée **T8** : Koza 14:30, Mishurra 06:32, Houmilito 2:37:30, Khytrayer 03:34, Zephiron 18:30, cardxc 11:30
  (« fin T7 début T8 ») ; Skaradon « 7th or 8th ». [VID] haute.
- **Entrée** : saut + poussée de tous les persos **en ligne droite** jusqu'aux pics (cardxc 19:30, Isthos 05:55,
  Mishurra 06:47, Koza 17:00, Zephiron 20:00, commentaire @lucashnz1262). Parfois « rien de spécial » (Huz 17:01).
  Peut tuer un perso full vie au pop (Huz 1re run 18:30 : −20 000). Poussée sur un cadeau → annule animation et dégâts
  (cardxc 19:30).
- **150 000 PV** (Zephiron 18:30, Khytrayer 03:34) ; invulnérable tant qu'elle n'est pas passée dans les pics (Koza 17:30,
  Khytrayer 13:58, Mishurra 02:41). Parfois **Inébranlable** → Voltige (Houmilito 3:19:30 ; Koza 17:00 prend de la PO
  « pour Voltige avec elle » ; Huz 17:25 « Voltige, la pousse »).
- **Burst** : Relâchement de Fureur = plus de la moitié de ses PV (cardxc 20:00), > 100 000 (Zephiron 21:00) ; 2
  Relâchements pour un kill en 1 tour (Khytrayer 14:30, Zephiron 26:30) ; Pense Vite + tout le reste = −140 000 (Huz
  19:14). Kill au T8 ou au T9 (Koza 18:30 ; Khytrayer 14:44).
- **Tuer Mama ≠ victoire** (Isthos 06:55, Houmilito 2:05:00, Huz 19:30, Zephiron 21:30).

### 4.5 IA des monstres (observations)
- **Passent leur tour** s'ils sont dans les pics ou si les persos sont loin (cardxc 12:30, 14:30) ; « a veces no pegan o
  no se mueven » (Zephiron 11:00). [VID] moyenne-haute → [HYP] IA : si aucune cible atteignable ce tour, ne bouge pas /
  ne sort pas des pics.
- Artroolleurs **à distance** (Koza 07:00) ; zones douloureuses (Huz 01:25). Troollibres **Inébranlables** au T1
  (Barbe Douce 01:52, Huz 15:00 « ils sont tous indéplaçables »).
- Dégâts subis par un perso : −5000 par coup (Huz 02:30), −8000 / −10 000 en zone (Huz 13:30), 25 000 → 15 000 → < 10 000
  en 3 tours sous focus (Barbe Douce 03:10-04:00).

### 4.6 Objectifs (textes lus en vidéo et avis)
| Objectif | Texte lu / règle | Avis | Source |
|---|---|---|---|
| Empalé | tuer un Troll entré dans les pics et Vulnérable ; **toujours le 1er** | automatique | GD 46:00 ; Isthos 02:28 |
| Productivité | 3 sorts dans le même tour | « le meilleur », fait par le Magicien au T1 | cardxc 04:30 ; Koza 02:30 ; Khytrayer 04:41 ; Isthos 03:45 |
| Ébranlable | achever un ennemi en état Inébranlable | « le plus simple des deux » | cardxc 05:30 ; Huz 00:00 ; Houmilito 0:35:30 |
| Pas le temps de dire « Aïe » | tuer un Troll full vie avant qu'il ait joué | faisable | cardxc 08:30 |
| Tout va bien | fin de tour global : tous les alliés > 50 % PV | simple, au début | cardxc 10:00 ; Huz 04:40 |
| Stop aux projectiles | fin de tour global : aucun Artroolleur sur le terrain | **se valide seul** s'il n'y en a pas | Khytrayer 04:56 ; Houmilito 1:18:00 |
| Distance d'insécurité | tous les Artroolleurs à ≤ 3 cases d'un allié en fin de tour | pénible | Huz 03:00 |
| Au coin | tous les combattants [ennemis] dans les pics à la fin du tour d'un allié | avec Dégagez ! | Huz 05:53 ; Koza 05:30 |
| 1,2,3 Soleil ! | chaque allié finit son tour sur sa cellule de départ | lent | Barbe Douce 12:11 ; Houmilito 2:42:00 |
| Sauvez-le ! | un allié désigné (cœur) doit être full PV en fin de tour global | difficile | Huz kGl 07:00, 16:00 ; Huz Shl 00:25 |
| Meurtres en série | un allié achève deux ennemis dans son tour | — | Huz kGl 03:30 ; Zephiron 11:30 |
| (poussée) | un ennemi achevé par dommages de poussée | — | Huz kGl 03:30 |
| Trous dans les Trools (?) | pendant le tour d'un allié, 4 ennemis entrent dans les pics | faisable (Acro) | Houmilito 1:23:30 |
| (poussée ×3) | 3 ennemis différents subissent des dommages de poussée pendant un tour | faisable | Houmilito 1:55:00 |
| Tout le monde veut prendre sa place | chaque allié marque la cellule d'un ennemi (le plus **proche** selon Huz / le plus **éloigné** selon DPLN) | à ignorer | Huz kGl 17:50 ; Huz Shl 02:57 |
| (entrée/sortie) | un ennemi doit entrer dans les pics et un allié en sortir | — | Houmilito 0:35:30 |

### 4.7 Bonus de fin/début de tour global (« Acclamations »)
- 3 propositions par personnage, tirées selon l'archétype, avec timer (Mishurra 03:41, Skaradon 01:06, Huz 04:30).
- Priorités : **PO d'abord** (Koza 04:00, Zephiron 06:30, Hy-glou) vs **PA d'abord** (cardxc 06:00, Khytrayer 05:34,
  Isthos 04:17, Sword 01:07, Mishurra 03:41). Dompteurs : dommages finaux / crit ; Magicien : soins ; Acrobate :
  PO / PM, sinon résistances. Options vues : PA, PM, PO, résistance mêlée, Vita (+5000), soins finaux, dommages finaux,
  crit, dommages critiques, dommages de poussée, « acclamation critique ».

### 4.8 Cadeaux, sorts uniques et améliorations observés
| Sort | Effet observé | Source |
|---|---|---|
| Relâchement de Fureur | mono-cible, dégâts qui **croissent chaque tour** tant qu'il n'est pas lancé ; > ½ PV de Mama | cardxc 08:00/20:00 ; Zephiron 21:00 ; GD 50:00 ; Khytrayer 05:59 |
| Pense Vite | 999-1000 PA (901 affiché en bêta) au tour suivant, tour limité à 15 s (10 s selon 2 sources) | GD 19:30 ; Barbe Douce 11:27 ; Houmilito 0:40:00 ; Khytrayer 12:39 |
| Galvanisation | +4 PA à toute l'équipe ; cumulable (3× → 22 PA) | cardxc 16:30 ; Koza 16:00 ; Houmilito 0:40:00 |
| Muraille Collective | bouclier **15 000** à tous | Barbe Douce 14:54 ; Houmilito 0:45:00 ; Khytrayer 13:33 |
| Influx de Vitalité | soin de tous les alliés (quasi full) | Zephiron 11:30 ; Khytrayer 12:49 ; Barbe Douce 14:54 |
| Dégagez ! (ES « Largo ») | pousse **tous** les ennemis vers les bords/pics | Koza 05:30 ; cardxc 21:30 ; Khytrayer 14:56 |
| Punition Collective | frappe **tous** les ennemis | cardxc 22:00 ; Khytrayer 11:35 ; Koza 22:30 |
| Pulsation Chaotique | rebondit, plus fort avec plus d'ennemis ; à lancer sur le plus bas PV | cardxc 23:00 ; Khytrayer 11:44 |
| Onde Fracassante | dégâts de zone selon les **PV érodés** → en fin de séquence | Huz 18:00 |
| Courage fuyons | +4 PM | Khytrayer 10:25 |
| Va-en-guerre | rapproche le lanceur de la cible | Huz 15:10 |
| Malédiction Mouvante | « bloque la progression » | Barbe Douce 03:39 |
| Détonation | dégâts selon le nombre d'ennemis dans la zone, agrandit la zone | Houmilito 1:56:00 |
| Ultime Espoir | pris « au cas où quelqu'un meure » | Khytrayer 07:50 |
| Chamboulement, Vague de Dégradation, Délivrance, Soutien Stratégique, Précipitation | vus ; jugés peu utiles (Soutien Stratégique « vraiment pas ») | Koza 10:00, 13:30 ; Huz 11:40 |
| Amélioration Impact | cercle 2 → **cercle 3** | GD 50:30 ; Khytrayer 10:04 |
| Amélioration Hanediman | poussée **4 → 6 cases** | Khytrayer 07:37 |
| Amélioration Prélèvement | zone du critique **2 → 3** | Khytrayer 06:52 |
| Amélioration Regain Vigoureux | +2 → **+3** PA/PM ; cible **tous** les alliés au lieu d'une zone | Khytrayer 10:16 ; cardxc 07:30 |
| Amélioration soin du Magicien | taille/portée 2 → 3 | Khytrayer 10:46 ; Barbe Douce 11:27 |

Sorts d'archétype observés : Frappe Repoussoir (commun, poussée 2), Videur (Acro, repousse en zone, ≈ 4000), Hanediman
(Acro, attire alliés + repousse ennemis en zone), Voltige (Acro, échange de position + dégâts), Impact (Dompteur, zone
cercle 2, 2 lancers/tour), Grondement Grandissant (Dompteur, dégâts accrus le 2e tour), Prélèvement (Dompteur, 3 PA, vol
de vie, zone seulement en critique), Pulsation d'Énergie (Magicien, soin de zone qui blesse les ennemis, 3 PA),
Regain Vigoureux (Magicien, +PA/PM), Amplification (Magicien, boost selon l'archétype ciblé), Protection Prolongée
(Magicien, bouclier 3000 + soins sur 2 tours). Ordre des sorts gagnés par objectif (Huz kGl 04:00-11:00) : 1er objectif
→ Regain Vigoureux / Hanediman / Grondement Grandissant ; 2e → Amplification / Voltige / Prélèvement ; 3e → Protection
Prolongée (bouclier) (Huz 19:00). [VID] moyenne-haute.

### 4.9 Chiffres observés (calibrage)
| Valeur | Contexte | Source | Confiance |
|---|---|---|---|
| 30 000 PV, 1000 dommages de poussée, 6000 Force | stats d'archétype | Barbe Douce 00:04-00:25 ; Huz 02:30 | haute |
| Troollibre 25 000 PV | — | Barbe Douce 01:10 | haute |
| Coup de base ≈ 1500 hors pics ; Videur ≈ 4000 | T1 | Barbe Douce 01:10 ; GD 47:30 | moyenne |
| « 11 000 » après poussée dans le bord | T1 | Barbe Douce 01:41 | basse |
| Pics : 2000 (entrée), 2000 (début de tour, = 1000 ×2) | — | Koza 09:00 ; cardxc 11:00-14:30 ; [DATA] | haute |
| Vulnérable = ×2 dégâts subis | — | Isthos 01:53 ; Khytrayer 04:15 ; [DATA] 1163 x200% | haute |
| Soin Magicien ≈ 3000 en zone ; « 4000 ×2 » ; « +5000 » | — | Huz kGl 03:00, 09:30 ; Huz Shl 13:40 | moyenne |
| Dégâts reçus −5000 / −8000 / −10 000 | monstres | Huz kGl 02:30, 13:30 | moyenne |
| Mama : −20 000 au pop (one-shot d'un perso full vie) | T8 | Huz kGl 18:30 | moyenne |
| Mama 150 000 PV | — | Zephiron 18:30 ; Khytrayer 03:34 ; [DATA] 7984 | haute |
| Relâchement de Fureur > 75 000 (« plus de la moitié ») ; > 100 000 ; 30 000 sur un monstre | T8 / mi-partie | cardxc 20:00 ; Zephiron 21:00 ; Huz 16:30 | moyenne |
| −140 000 en un tour (Pense Vite, 2/3 des actions) | T8 | Huz 19:14 | moyenne |
| Pense Vite : ~3 sorts max en 10 s (animations) | T8 | Houmilito 2:55:30 | moyenne |
| Galvanisation ×3 → 22 PA | — | Koza 16:00 | moyenne |
| Muraille Collective 15 000 | — | 3 sources | haute |
| Amplification : +20 % DF / +30 % crit (Dompteur), +500 do poussée (Acro), +20 % soins (Magicien) | — | cardxc 07:00 ; Khytrayer 05:10 | moyenne-haute |
| 14 monstres tués en un tour | fin de combat | Huz 23:04 | moyenne |
| Durée de run : 7 min (expert), 10-15 min, 24 min (1re victoire) | — | Khytrayer ; cardxc ; Zephiron ; Huz | haute |

### 4.10 Erreurs typiques (vues en vidéo)
1. Tuer Mama et croire que c'est fini (Houmilito 2:05:00 → défaite).
2. Ordre d'initiative inadapté (Acrobate qui ne joue pas en premier) : Houmilito 2:10:00, 2:49:00 (« le problème c'est
   quand notre acrobate au T1 ne pousse pas le bon »).
3. Choisir **Sauvez-le !** (objectif difficile) → perte d'un perso (Huz kGl 16:00).
4. Placer ses persos dans la ligne d'arrivée de Mama / près des bords au T7 → poussés dans les pics, one-shot
   (Huz kGl 18:30 ; commentaire @lucashnz1262).
5. Hanediman mal orienté qui **attire un allié** vers les monstres/pics (Koza 10:30-11:00).
6. Poussée qui laisse un monstre **à 1 case des pics** (Khytrayer 09:23) → frappe inutile.
7. Manque de **PO** : impossible de créer les zones de poussée (Huz 12:08) ; Acrobate sans PA (cardxc 16:00).
8. Lancer Prélèvement sans cible sans critique → aucun dégât (Khytrayer 09:44).
9. Gaspiller les sorts uniques (Punition Collective, Dégagez !, Relâchement) trop tôt (Sword 01:33, cardxc 10:30).
10. Pense Vite : trop de temps perdu en animations ; préparer ses raccourcis (Huz 19:14, Zephiron 26:00,
    Houmilito 2:55:30).

### 4.11 Astuces rapportées
- Focus du monstre qui joue juste après soi (« tour gratuit ») — 4 sources.
- Garder l'équipe au centre, loin des pics (Sword 00:50, cardxc 11:30, Isthos 02:45).
- Prendre les cadeaux en début de tour global (bug de sort grisé) (Koza 08:00).
- Faire pousser un perso sur un cadeau à l'arrivée de Mama → elle rate son entrée (cardxc 19:30).
- Timeline buguée (≤ 3.0) : afficher/masquer les invocations (Zephiron 25:00).
- Désactiver les animations de sorts pour accélérer (commentaire ProTeam).
- Panoplie Prospection conservée → drop du familier (Zephiron 24:00, cardxc 00:30).
- Troolls ≤ 2000 PV dans les pics : les laisser mourir seuls (cardxc 11:00, Khytrayer 13:04).

---

## 5. Implications pour le simulateur (à encoder / à tester)

1. **Ordre des joueurs** : paramètre libre (défaut A → D → D → M ; variantes A → A → D → M et A → A → M → D).
2. **Glyphe** : entrée = 2000 + Vulnérable (×2 dégâts subis ; durée à confirmer : 1 tour d'après 30701, « −1 » sur 30390 niv. 2) ; début de tour dans le glyphe =
   1000 (×2 si Vulnérable) ; alliés concernés aussi. Tester l'hypothèse de redéclenchement case → case.
3. **Évaluation d'une action** : bonus énorme pour (a) mettre un monstre dans les pics avant qu'il joue, (b) tuer le
   monstre qui joue juste après ; pénalité pour frapper une cible non Vulnérable ; ne pas gaspiller de dégâts sur un
   monstre qui mourra de ses 2000 de début de tour.
4. **IA monstres** : option « passe son tour si aucune cible atteignable / s'il est dans les pics » (à calibrer).
5. **Mama** : arrivée T8, Rassemblement Troollesque (poussée en ligne de tous les persos jusqu'au bord) ; option
   « cadeau sous un perso poussé = annulation » ; invulnérable hors pics ; Inébranlable possible → Voltige.
6. **Pense Vite** : modéliser par un plafond de lancers (≈ 3 à 6) plutôt que 999 PA.
7. **Relâchement de Fureur** : dégâts croissants avec le nombre de tours depuis l'obtention → décision « quand le
   prendre » (le plus tôt possible) et « sur qui » (1 ou 2 Dompteurs).
8. **Fin de combat** : victoire = plus aucun ennemi après la V10 ; tuer Mama ne suffit pas.
9. **Objectifs** : modéliser au moins Empalé → Productivité / Stop aux projectiles (auto) / Ébranlable / Tout va bien,
   avec l'ordre des sorts gagnés (§4.8).
10. **Bonus** : politique paramétrable (PO-first vs PA-first) à comparer.

---

## 6. Contradictions

### 6.1 Vidéos vs guide DPLN
| Sujet | DPLN | Vidéos | Arbitrage |
|---|---|---|---|
| Vulnérable | « +200 % de dégâts subis » (×3) | ×2 : Isthos 01:53 « twice as much », texte en jeu « daño sufrido por 200 % » (Khytrayer 04:15) | **[DATA] effet 1163 « Dommages subis x200% » → ×2. DPLN erroné.** |
| Initiative | ordre inverse de l'affichage du groupe (4e joue en 1er) | **Khytrayer (08/2026) identique à DPLN** (02:16, 03:57) ; Isthos 01:12 et Zephiron 08:30 : **ordre d'entrée** dans le combat (= correctif officiel 14/01/2025) | [HYP] compatibles : en groupe multi-comptes, les membres entreraient dans l'arène dans l'ordre inverse du groupe. Le simulateur prend l'ordre de jeu en paramètre. |
| Pense Vite | 15 s | 15 s : GD 19:30, Barbe Douce 11:27, Mishurra 04:17, Huz 18:00 ; **10 s : Houmilito 0:40:00 (bêta, texte lu) et Khytrayer 12:39 (3.6)** | Non tranché (possible changement ou erreur) → lire spell-levels du sort. |
| Amplification | 100 → 200 (valeur DPLN) | +20 % DF & +30 % crit (Dompteur), +500 do poussée (Acro), +20 % soins (Mag) : cardxc 07:00, Khytrayer 05:10 | 2 sources vidéo concordantes → lire spell-levels. |
| Arrivée de Mama | « tour 8 (?) » ; « éviter la ligne d'arrivée au tour 7 » | T8 (6 vidéos) | **T8** ; on se place au T7 en prévision. |
| Composition des vagues | liste V1-V10 | V1 = 2 Troollibres, V8 = Mama seule, V10 = 6 : concordant ; Khytrayer « 3, 3, 4 » discordant | Liste DPLN retenue. |
| Poussée de Mama | repousse en ligne jusqu'au bord | concordant (5 vidéos) ; « parfois rien de spécial » (Huz 17:01) | concordant. |
| Obstacles « en temps réel » | évoqués | aucune vidéo n'en montre | non implémentés [HYP]. |

### 6.2 Vidéos entre elles
- **Bonus prioritaire** : PO (Koza, Zephiron, Hy-glou) vs PA (cardxc, Khytrayer, Isthos, Sword, Mishurra).
- **2 Acrobates vs 2 Dompteurs** : les deux gagnent ; argument Relâchement ×2 pour 2 Dompteurs.
- **Initiative avant le correctif** : « définie par le jeu » (Huz, 09/2024), « aléatoire mais fixe » (Koza, 12/2024),
  « alphabétique ? » (Houmilito) → périmé depuis le 14/01/2025.
- **« Tout le monde veut prendre sa place »** : ennemi le plus proche (Huz lecture orale) vs le plus éloigné (DPLN).
- **Limite de tours** : spéculation « au tour 11 c'est fini » (Houmilito 2:38:00) non confirmée ; GD : « vous pouvez
  gagner tour 10 ou tour 11 » (= si tout est tué), pas une limite.
- **Mama Inébranlable** : 1 source (Houmilito) ; les autres la poussent normalement (Khytrayer 13:58, Koza 17:30).
- **Moment des bonus** : « fin de chaque tour global » (Mishurra, Sword, cardxc) vs « début de tour » (GD 46:30) —
  équivalent en pratique.

---

## 7. Questions ouvertes (non résolues par les vidéos)

1. **Cellules exactes** d'apparition de chaque vague et de la case d'atterrissage de Mama : non disponibles (vidéos
   YouTube non téléchargeables ici, storyboards trop basse résolution). À obtenir par frames haute résolution d'une VOD
   Twitch ou par les données (scénario / « Event Glyph Manager »).
2. Pense Vite : 10 s ou 15 s, 901/999/1000 PA ? (lire spell-levels).
3. Valeurs exactes d'Amplification, Relâchement de Fureur (croissance par tour), Protection Prolongée (« 40 à 48
   soins » mal lu), Muraille Collective (15 000 ?).
4. IA : règle exacte du « skip » des Troolls et de leur ciblage.
5. Redéclenchement du glyphe lors d'une poussée à l'intérieur des pics (Huz 08:30).
6. Mama : Inébranlable permanent, conditionnel, ou erreur d'observation ?
7. Moment exact d'apparition d'une vague dans le tour global (avant le 1er joueur ? après les choix de bonus ?).
8. Pourquoi Khytrayer (2026) observe encore « l'ordre inverse du groupe » alors que le correctif parle d'« ordre
   d'entrée » : mécanisme d'entrée des membres d'un groupe à vérifier.

---

## 8. Fichiers bruts (scratchpad, non versionnés)
- Transcriptions agent 50 (lecture seule) : `…/scratchpad/yt/{vmh1fJkhdCE,ve5TVn_sJGo,IKqnwLIYffk,kGlKYY7_qew,HSHSLHi5jQY,CY_cgLRjkoM}.txt`
- Transcriptions récupérées pour cette note (dans la conversation TubeLab, non sauvegardées sauf VOD ProTeam) :
  ShlRLUWn7VM, FSlGkDE7ZOQ, Vwe_m7suH9A, PxTtn2g9sx4, xDmoOV-9A18, AX-A1ULkP0A, v3cDvm3x4pw ; ProTeam 7LDw0YvmceE
  (`…/scratchpad/v60/7LDw0YvmceE.txt`, hors sujet).
- Storyboards : `…/scratchpad/v60/koza_sb/sb_000..016.jpg` (Koza speedrun, 3×3 vignettes 320×180, 44,6 s par
  mosaïque) ; `…/scratchpad/v60/cardxc_sb/sb_000..021.jpg` (cardxc, 89,5 s par mosaïque) ; recadrages ×3
  `cx_s3_f5.png` (T1), `cx_s13_f6.png` (après arrivée de Mama), `cx_s13_f5.png` (infobulle Relâchement de Fureur),
  `kz_s0_f4.png` (T1 Koza).
- Scripts : `…/scratchpad/v60/mhtml2jpg.py` (extraction des mosaïques d'un .mhtml yt-dlp), `…/scratchpad/v60/fmt.py`
  (transcription JSON → blocs de 30 s).
