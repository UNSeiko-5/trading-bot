import { films } from './films.js';

const KEY = 'clap.settings';
export const DEFAULTS = { theme: 'auto', username: '', goal: 0 };

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const state = {
  settings: load(),
  entries: [], // visionnages (journal)
  films: [], // regroupés par film
  watchlist: [],
  meta: new Map(), // clé de film → métadonnées
  config: { tmdb: false },
  enrichment: null, // { state, done, total }
  syncing: false,
  syncError: '',
  lastRss: 0,
  archiveAt: 0,
  recs: null,
};

export function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state.settings));
  } catch {}
  const t = state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

export function setEntries(list) {
  state.entries = list;
  state.films = films(list);
}

// Métadonnées connues d'un film (null s'il n'y en a pas, ou si la recherche a échoué).
export const metaOf = (key) => {
  const m = state.meta.get(key);
  return m && !m.missing ? m : null;
};

// Films des 12 derniers mois, utile à plusieurs vues.
export const visibleEntries = () => state.entries;
