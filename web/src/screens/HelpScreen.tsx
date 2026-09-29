/** Écran « Aide » : mécaniques clés du Gladiatrool, mode d'emploi, sources et limites du simulateur. */

export function HelpScreen() {
  return (
    <div className="split-even">
      <section className="panel prose" aria-labelledby="aide-mecaniques">
        <h2 id="aide-mecaniques">Mécaniques clés</h2>
        <dl>
          <dt>L'arène et les pics</dt>
          <dd>
            Carte 139988488 : 241 cases jouables, dont un anneau de <strong>96 cases de pics</strong>. Un combattant qui entre dans les pics subit{' '}
            <strong>2 000 dommages</strong> et devient <strong>Vulnérable</strong> : les monstres y prennent des dommages <strong>×2</strong>. Au début
            de son tour dans les pics, un monstre subit 1 000 dommages (doublés), un joueur 1 000 (hypothèse Q4 : 2 000). En sortant, la vulnérabilité
            dure encore jusqu'à son tour. Les joueurs ne sont pas doublés dans les pics par défaut (hypothèse Q3). Le tacle est désactivé.
          </dd>
          <dt>Tour global et ordre de jeu</dt>
          <dd>
            Alternance des équipes, Mama en tête : Mama, J1, M1, J2, M2… (hypothèse Q1). Un monstre mort libère sa place ; un joueur mort garde la
            sienne. D'où la règle des vidéos : « tuer le Trooll qui joue juste après soi ».
          </dd>
          <dt>Vagues</dt>
          <dd>
            V1 au T1 : deux Troollibres sur 242 et 358. Nouvelles vagues aux T2 à T7, T9 et T10 (Troollibres, Artroolleurs, Nitroolls), cases tirées
            parmi les apparitions observées (hypothèse Q5).
          </dd>
          <dt>La Mama Troollette</dt>
          <dd>
            Elle attend hors combat sur la case 152 et <strong>arrive au début du T8 sur la case 300</strong> (centre ; replis si occupée). À chaque
            début de son tour, son Rassemblement attire les Troolls et repousse les joueurs vers le bord. Elle est invulnérable, sauf pendant un tour
            après chaque entrée dans les pics : la mettre en pics ouvre la fenêtre de dégâts. Sa Faveur (+25 % de dommages finaux) baisse de 5 % par
            objectif réalisé.
          </dd>
          <dt>Objectifs</dt>
          <dd>
            Empalé d'abord (tuer un ennemi Vulnérable), puis un vote entre deux objectifs par palier (6 au plus). Chaque objectif réalisé fait
            apprendre un nouveau sort à chaque joueur.
          </dd>
          <dt>Acclamations et cadeaux</dt>
          <dd>
            Du T2 au T9 : trois cartes d'Acclamation par joueur (PA, PM, PO, dommages…). Un cadeau apparaît avec une probabilité de 0,72 (hypothèse
            Q14) sur une des 7 cases du centre ; le joueur qui y entre fait tirer des cartes : sort unique (Relâchement de Fureur, Dégagez !…) ou
            amélioration d'un sort.
          </dd>
          <dt>Victoire</dt>
          <dd>Plus aucun ennemi vivant (Troolls et Mama) à partir du T10. Défaite : plus aucun joueur vivant.</dd>
        </dl>
      </section>

      <div className="stack">
        <section className="panel prose" aria-labelledby="aide-usage">
          <h2 id="aide-usage">Utiliser l'interface</h2>
          <ul>
            <li>
              <strong>Carte &amp; situation</strong> : décrivez un instant du combat (tour, joueurs dans l'ordre de jeu, monstres, PV, états, sorts,
              objectifs, cadeaux). Glissez les jetons sur la carte ou utilisez les outils (ajouter un Trooll, poser un cadeau, supprimer).
              Importez / exportez la situation en JSON (format <code>docs/FORMAT_SITUATION.md</code>).
            </li>
            <li>
              <strong>Meilleur tour</strong> : le planificateur (recherche approfondie, dans un Web Worker) propose le plan du personnage courant et
              de l'équipe pour le tour global, tracé sur la carte (déplacements, zones de sort, poussées prévues, arrivées dans les pics), avec
              explication et alternatives. « Appliquer » joue le plan puis le tour des monstres suivants.
            </li>
            <li>
              <strong>Simulation</strong> : combat complet joué par le planificateur, puis rejeu pas à pas (tour global, action, journal filtrable).
              « Planifier depuis ici » reprend l'état exact dans l'écran Meilleur tour.
            </li>
            <li>
              <strong>Résultats</strong> : synthèse des expériences Monte Carlo (<code>docs/RESULTATS.md</code>).
            </li>
          </ul>
          <p className="small muted">
            Les plans sont calculés en jets moyens, sans coup critique ; le combat réel tire ses jets de la graine. Le thème et l'onglet ouvert sont
            mémorisés dans ce navigateur quand c'est possible.
          </p>
        </section>

        <section className="panel prose" aria-labelledby="aide-sources">
          <h2 id="aide-sources">Sources</h2>
          <ul>
            <li>Données du client (sorts, états, monstres, carte) extraites de DofusDB et consolidées dans <code>sim/data/gladiatrool.data.json</code>.</li>
            <li>Observations de combats réels (vidéos) pour les apparitions, l'IA des monstres et les cadeaux.</li>
            <li>
              Étude du mini-jeu (<code>research/ETUDE_GLADIATROOL.md</code>) et questions ouvertes (<code>research/QUESTIONS_OUVERTES.md</code>).
            </li>
            <li>
              Hypothèses non tranchées : <code>sim/config/default.config.json</code>, modifiables dans l'écran Simulation.
            </li>
          </ul>
          <p className="small muted">Aucune image ni ressource graphique du jeu n'est utilisée : jetons et carte sont dessinés par l'interface.</p>
          <p className="small muted">
            Outil non officiel, sans lien avec Ankama. DOFUS, le Gladiatrool et les noms de sorts, monstres et personnages sont la propriété
            d'Ankama (DOFUS © Ankama Games).
          </p>
        </section>

        <section className="panel prose" aria-labelledby="aide-limites">
          <h2 id="aide-limites">Limites</h2>
          <ul>
            <li>
              <strong>IA des monstres non validée</strong> : paramétrée d'après les données et les vidéos, sans comparaison quantitative avec des
              combats réels. Le planificateur anticipe avec une IA proche : il connaît « trop bien » son adversaire.
            </li>
            <li>
              <strong>Hypothèses</strong> : ordre de jeu (Q1), dommages des pics (Q3, Q4), apparitions (Q5), fréquence des cadeaux (Q14)… Une seule
              (tous les Troolls après la Mama) renverse le jeu.
            </li>
            <li>
              Une situation décrite ne contient ni les envoûtements autres que Vulnérable / Inébranlable, ni les relances de sorts, ni les compteurs de
              l'objectif en cours ; « Planifier depuis ici » (rejeu de trace) donne l'état exact.
            </li>
            <li>Le planificateur n'est pas un joueur : il imagine un seul futur plausible des vagues et des cadeaux.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
