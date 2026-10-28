import { GLOSSARY } from '../glossary.js';
import { HOW_TO } from '../import-ui.js';
import { card } from '../ui.js';
import { h, put } from '../util.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
export const SHORTCUTS = [
  [[isMac ? '⌘' : 'Ctrl', 'K'], 'Ouvrir la recherche et les commandes (ou la touche /)'],
  [['?'], 'Afficher les raccourcis clavier'],
  [['g', 'd'], 'Aller au tableau de bord'],
  [['g', 'j'], 'Aller au journal'],
  [['g', 'b'], 'Aller aux bilans'],
  [['g', 's'], 'Aller aux statistiques'],
  [['g', 'p'], 'Aller à mon profil'],
  [['g', 'v'], 'Aller à la liste à voir'],
  [['g', 'f'], 'Aller aux découvertes (le saviez-tu ?)'],
  [['g', 'y'], 'Aller à la rétrospective'],
  [['g', 'o'], 'Aller aux objectifs'],
  [['g', 'c'], 'Aller à la comparaison'],
  [['g', 'r'], 'Aller aux réglages'],
  [['g', 'h'], 'Aller à l’aide'],
  [['←', '→'], 'Film précédent ou suivant (dans une fiche)'],
  [['Échap'], 'Fermer une fenêtre ou la recherche'],
];

const FAQ = [
  ['Pourquoi ne vois-je que mes 100 derniers films avec mon pseudo ?', 'Letterboxd ne publie que les ~100 dernières entrées de ton profil dans son flux RSS public, et son API est réservée à des projets approuvés. Pour retrouver tout ton historique, importe ton export de données (Réglages › Importer).'],
  ['Mes données sont-elles envoyées quelque part ?', 'Non. Ton journal et tes notes restent dans ton navigateur. Les seuls échanges sont la lecture du flux RSS de ton pseudo et la récupération des genres, durées et affiches de tes films (TMDB ou Wikidata), qui ne contiennent aucune donnée personnelle.'],
  ['Mon profil est « introuvable ».', 'Le flux RSS n’existe que pour un profil public : vérifie le pseudo (celui de l’adresse letterboxd.com/pseudo) et que ton profil n’est pas privé.'],
  ['Pourquoi certains films n’ont ni genre ni durée ?', 'Les métadonnées viennent de TMDB (avec une clé configurée) ou de Wikidata ; les films très obscurs ou dont le titre diffère peuvent y manquer. Les statistiques indiquent la part de films couverts.'],
  ['Comment l’affinité d’un film est-elle calculée ?', 'En comparant ses genres, son réalisateur, ses acteurs, son pays, sa langue et sa décennie avec les notes que tu as données ; elle devient fiable avec une cinquantaine de films notés.'],
  ['Quelle différence entre « film » et « visionnage » ?', 'Un film revu trois fois compte pour 1 film et 3 visionnages. Les films seulement marqués « vus » dans Letterboxd, sans entrée de journal, n’ont pas de date de visionnage (dates approximatives).'],
];

export function help(root) {
  put(root,
    h('div', { class: 'grid cols-2' },
      card('Prise en main', null,
        h('ol', { class: 'steps' }, h('li', null, 'Entre ton pseudo Letterboxd (Réglages) : Clap lit tes ~100 dernières entrées.'), h('li', null, 'Pour tout ton historique, exporte tes données depuis Letterboxd puis importe-les ici.'), h('li', null, 'Les genres, durées et réalisateurs se chargent en arrière-plan : les statistiques se complètent peu à peu.')),
        h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, HOW_TO)),
      card('Raccourcis clavier', null, h('table', { class: 'sc-table' }, h('tbody', null, SHORTCUTS.map(([keys, d]) => h('tr', null, h('td', null, keys.map((k) => h('span', { class: 'kbd' }, k))), h('td', null, d))))))),
    card('Glossaire', null, h('div', { class: 'help-grid' }, Object.values(GLOSSARY).map(([t, d]) => h('div', { class: 'gl-item' }, h('b', null, t), h('p', null, d))))),
    card('Questions fréquentes', null, FAQ.map(([q, a]) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a)))),
    card('À propos', null, h('p', { style: 'font-size:13.5px' }, 'Clap n’est pas affilié à Letterboxd. Données de films : TMDB et Wikidata. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.')));
}
