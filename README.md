# Clap

Tableau de bord cinéphile à partir de ton profil ou de ton export **Letterboxd**. Aucune étape de build : HTML + JavaScript (modules ES) côté navigateur, quelques fonctions serverless Node. **Sans connexion, sans compte, sans API Letterboxd.**

## D'où viennent les données

| Source | Contenu | Limite |
|---|---|---|
| **Pseudo** → flux RSS public (`letterboxd.com/pseudo/rss/`) | tes ~100 dernières entrées : note, like, revisionnage, avis, identifiant TMDB, affiche | profil public uniquement, 100 entrées |
| **Export de données** (ZIP ou CSV : `diary`, `watched`, `ratings`, `reviews`, `likes/films`, `watchlist`) | tout l'historique, la liste à voir | à réimporter pour se mettre à jour |
| **TMDB** (si `TMDB_API_KEY` est défini côté serveur) | genres, durée, réalisateurs, acteurs, pays, langues, affiches, notoriété, suggestions | clé gratuite |
| **Wikidata** (sans clé) | genres, durée, réalisateurs, pays, langues | pas d'acteurs ni d'affiches ; couverture partielle des films obscurs |

Les deux premières sources se fusionnent sans doublon (même film, même jour). Le site ne fait aucun scraping des pages de Letterboxd.

## Ce que fait le site

| Page | Contenu |
|---|---|
| **Tableau de bord** | films de l'année (anneau vs objectif ou vs l'an dernier), heures de cinéma, note moyenne, derniers films en affiches, films par mois, répartition des notes, calendrier de régularité, genres |
| **Journal** | tous les visionnages : recherche (sans accents), filtres (année, note, revus, aimés, avis, genre), tris, export CSV, liste adaptée au mobile |
| **Bilans** | semaine, mois, année ou tout l'historique comparés à la période précédente, calendrier du mois, mieux notés, mosaïque d'affiches, zoom par clic |
| **Statistiques** | aperçu et records, genres, réalisateurs et acteurs (note ajustée), pays et langues, décennies, durées, jours de la semaine |
| **Mon profil** | huit indices sur 100 (volume, régularité, sévérité des notes, diversité, cinéma du monde, classiques, hors des sentiers battus, revisionnage), style de cinéphile, ce que tu aimes ou moins, écart avec le grand public, réalisateurs à approfondir |
| **Comparer** | deux périodes (préréglages ou dates libres), indicateurs, genres dominants, courbe cumulée |
| **À voir** | ta liste classée par **affinité** (genres, réalisateurs, acteurs, pays, langue, décennie d'après tes notes), « que regarder ce soir ? » (tirage pondéré, filtres durée et genre), suggestions TMDB |
| **Objectifs** | films de l'année (rythme, projection), tour du monde, voyage dans le temps, tous les genres, trophées |
| **Fiche film** | affiche, infos, mes visionnages et avis, affinité, résumé et distribution, suggestions |
| **Réglages / Aide** | pseudo, import, état des métadonnées, thème, export CSV, effacement ; glossaire, raccourcis, FAQ |

Transversal : recherche et commandes (**Ctrl/Cmd + K** ou **/**), raccourcis `g` + lettre (**?** pour la liste), thème clair/sombre, installable (PWA) et consultable hors ligne, accessibilité clavier et lecteurs d'écran (0 violation axe), mobile (barre d'onglets flottante).

## Lancer en local

`npm run dev` (Node ≥ 18) puis <http://localhost:3000>. Optionnel : `cp .env.example .env` et renseigner `TMDB_API_KEY`.

## Déployer sur Vercel (nouveau projet)

1. Importer ce dépôt (aucun build : `vercel.json` est prêt, dont les en-têtes de sécurité).
2. Facultatif : ajouter la variable d'environnement `TMDB_API_KEY`.
3. Déployer. Aucune autre configuration.

## Architecture

- `api/` : `rss` (relais du flux public, pseudo validé), `tmdb` (liste blanche de chemins, clé côté serveur), `wikidata` (requêtes SPARQL construites côté serveur, valeurs échappées), `config`.
- `js/` : `films.js` (modèle, fusion), `archive.js` (export), `rss.js`, `meta.js` (TMDB puis Wikidata, genres canoniques), `stats.js`, `taste.js` (indices, affinité), `data.js` (chargement, import, enrichissement), vues dans `js/views/`, graphiques SVG maison, cache IndexedDB.
- **Enrichissement** en arrière-plan : 6 requêtes TMDB en parallèle avec repli sur Wikidata ; les échecs sont mémorisés 30 jours.

## Sécurité et confidentialité

Pas de compte ni de cookie. Journal, notes et avis restent dans le navigateur. CSP stricte, HSTS, `X-Frame-Options`, `Permissions-Policy` (voir `vercel.json`, appliqués aussi par `dev-server.js`). Les échanges avec le serveur ne contiennent que le pseudo (flux public) et des identifiants ou titres de films.

## Tests

`npm test` lance 22 tests (`node:test`, sans dépendance) : export Letterboxd (fusions, ZIP), flux RSS, métadonnées (TMDB, Wikidata, genres), statistiques, indices de goût, affinité, fonctions serverless (validation, liste blanche, échappement) et préchargement des modules. Un workflow GitHub Actions les exécute à chaque push.

## Mentions

Clap n'est pas affilié à Letterboxd. Données de films : TMDB et Wikidata. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Polices Inter et Instrument Serif (SIL OFL 1.1), auto-hébergées.
