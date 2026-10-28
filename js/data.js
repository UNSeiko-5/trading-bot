// Chargement, rafraîchissement (flux RSS), import de l'export et enrichissement des films.
import { readFiles } from './archive.js';
import { mergeEntries } from './films.js';
import { enrich, loadConfig } from './meta.js';
import { parseRss } from './rss.js';
import { metaOf, setEntries, state } from './state.js';
import * as store from './store.js';

export async function loadAll() {
  const [entries, watchlist, meta, info] = await Promise.all([store.all('entries'), store.all('watchlist'), store.all('meta'), store.getKv('info')]);
  setEntries(entries.sort((a, b) => b.ts - a.ts));
  state.watchlist = watchlist;
  state.meta = new Map(meta.map((m) => [m.key, m]));
  state.lastRss = (info && info.lastRss) || 0;
  state.archiveAt = (info && info.archiveAt) || 0;
  if (info && info.user && !state.settings.username) state.settings.username = info.user;
  state.config = await loadConfig();
}

const persist = () => store.replaceAll('entries', state.entries);

export class RssError extends Error {}

// Lit le flux RSS public du profil et fusionne les nouveautés. Renvoie { added, total, lists }.
export async function refreshRss(user = state.settings.username) {
  if (!user) throw new RssError('Indique ton pseudo Letterboxd.');
  let r;
  try {
    r = await fetch(`/api/rss?user=${encodeURIComponent(user)}`);
  } catch {
    throw new RssError('Impossible de joindre le serveur : vérifie ta connexion.');
  }
  if (r.status === 404) throw new RssError(`Profil « ${user} » introuvable ou privé : le flux RSS n’est accessible que pour un profil public.`);
  if (!r.ok) throw new RssError('Letterboxd ne répond pas pour le moment : réessaie dans quelques minutes.');
  const parsed = parseRss(await r.text());
  const before = state.entries.length;
  setEntries(mergeEntries(state.entries, parsed.entries));
  await persist();
  state.lastRss = Date.now();
  await store.setKv('info', { ...((await store.getKv('info')) || {}), lastRss: state.lastRss, user });
  return { added: state.entries.length - before, total: parsed.entries.length, lists: parsed.lists };
}

// Import de l'export Letterboxd (ZIP ou CSV) : s'ajoute à l'existant sans doublon ; les envies sont remplacées si le fichier en contient.
export async function importArchive(fileList) {
  const r = await readFiles(fileList);
  const before = state.entries.length;
  setEntries(mergeEntries(state.entries, r.entries));
  await persist();
  if (r.watchlist.length) {
    state.watchlist = r.watchlist;
    await store.replaceAll('watchlist', r.watchlist);
  }
  state.archiveAt = Date.now();
  await store.setKv('info', { ...((await store.getKv('info')) || {}), archiveAt: state.archiveAt });
  return { added: state.entries.length - before, total: r.entries.length, watchlist: r.watchlist.length };
}

let running = false;
let cancelled = false;
export const cancelEnrich = () => (cancelled = true);

// Enrichit en tâche de fond les films du journal et de la liste d'envies. `onUpdate` est appelé à chaque avancée.
export async function enrichAll(onUpdate) {
  if (running) return;
  running = true;
  cancelled = false;
  try {
    const list = [...state.films.map((f) => ({ key: f.key, title: f.title, year: f.year, tmdb: f.tmdb })), ...state.watchlist.map((w) => ({ key: w.key, title: w.title, year: w.year, tmdb: null }))];
    const seen = new Set();
    const uniq = list.filter((f) => (seen.has(f.key) ? false : seen.add(f.key)));
    state.enrichment = { state: 'running', done: 0, total: 0 };
    let n = 0;
    await enrich(uniq, {
      config: state.config, known: state.meta,
      save: (key, meta) => store.putMany('meta', [meta]),
      isCancelled: () => cancelled,
      onProgress: (done, total) => {
        state.enrichment = { state: 'running', done, total };
        if (++n % 5 === 0) onUpdate();
      },
    });
    state.enrichment = { ...(state.enrichment || {}), state: cancelled ? 'paused' : 'done' };
  } finally {
    running = false;
    onUpdate();
  }
}

export const metaCount = () => state.films.filter((f) => metaOf(f.key)).length;

export async function resetAll() {
  await store.clearAll();
  setEntries([]);
  state.watchlist = [];
  state.meta = new Map();
}
