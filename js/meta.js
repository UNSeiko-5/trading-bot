// Métadonnées des films (genres, durée, réalisateurs, pays…) : TMDB si la clé est configurée côté serveur, sinon Wikidata.
import { fold } from './util.js';

// Genres canoniques, du plus distinctif au plus général (les premiers présents sont retenus, trois au plus).
export const GENRES = ['Horreur', 'Science-fiction', 'Animation', 'Documentaire', 'Western', 'Guerre', 'Comédie', 'Romance', 'Fantastique', 'Musique', 'Drame', 'Thriller', 'Crime', 'Action', 'Aventure', 'Histoire', 'Familial', 'Mystère'];
const RULES = [
  ['Horreur', /horreur|epouvante|slasher/], ['Science-fiction', /science-fiction|dystopi|cyberpunk|space opera/], ['Animation', /animation|anime|dessin anime/],
  ['Documentaire', /documentaire/], ['Western', /western/], ['Guerre', /guerre|militaire/], ['Comédie', /comedie|humour|burlesque|satire/],
  ['Romance', /romance|romantique|amour/], ['Fantastique', /fantas|merveilleux|conte/], ['Musique', /music|comedie musicale|opera/],
  ['Drame', /drame|melodrame/], ['Thriller', /thriller|suspense|neo-noir/], ['Crime', /crime|polic|gangster|casse|film noir|mafia/],
  ['Action', /action|super-heros|arts martiaux|catastrophe/], ['Aventure', /aventure|epique|peplum|capes? et d/], ['Histoire', /histori|biograph|period/],
  ['Familial', /famil|enfant|jeunesse/], ['Mystère', /mystere|enigme/],
];
export function canonGenres(labels, cap = 3) {
  const found = new Set();
  for (const l of labels || []) {
    const f = fold(l);
    for (const [g, re] of RULES) if (re.test(f)) found.add(g);
  }
  return GENRES.filter((g) => found.has(g)).slice(0, cap);
}

const region = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['fr'], { type: 'region' }) : null;
const language = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['fr'], { type: 'language' }) : null;
const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const safe = (dn, code, fallback) => {
  try {
    return cap1(dn.of(code)) || fallback;
  } catch {
    return fallback;
  }
};

export function normTmdb(d, key) {
  const crew = (d.credits && d.credits.crew) || [];
  return {
    key, source: 'tmdb', tmdb: d.id, at: Date.now(),
    runtime: d.runtime > 0 ? d.runtime : null,
    genres: canonGenres((d.genres || []).map((g) => g.name)),
    directors: [...new Set(crew.filter((c) => c.job === 'Director').map((c) => c.name))].slice(0, 3),
    cast: ((d.credits && d.credits.cast) || []).slice(0, 6).map((c) => c.name),
    countries: (d.production_countries || []).map((c) => (region ? safe(region, c.iso_3166_1, c.name) : c.name)),
    languages: d.original_language ? [language ? safe(language, d.original_language, d.original_language) : d.original_language] : [],
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : '',
    overview: d.overview || '', tagline: d.tagline || '',
    votes: d.vote_count || 0, avg: d.vote_average || 0, popularity: d.popularity || 0,
    collection: d.belongs_to_collection ? d.belongs_to_collection.name : '',
  };
}

export function normWiki(row, key) {
  return {
    key, source: 'wikidata', tmdb: row.tmdb || null, at: Date.now(),
    runtime: row.runtime || null, genres: canonGenres(row.genres), directors: (row.directors || []).slice(0, 3), cast: [],
    countries: row.countries || [], languages: row.languages || [], poster: '', overview: '', tagline: '', votes: 0, avg: 0, popularity: 0, collection: '',
  };
}

async function json(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 404 || r.status === 400) return null;
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    } catch {
      await new Promise((ok) => setTimeout(ok, 800 * (i + 1)));
    }
  }
  return null;
}

export const loadConfig = async () => (await json('/api/config', 1)) || { tmdb: false };

async function tmdbDetails(id, key) {
  const d = await json(`/api/tmdb?${new URLSearchParams({ path: `/movie/${id}`, append_to_response: 'credits' })}`);
  return d && d.id ? normTmdb(d, key) : null;
}

async function tmdbFind(f) {
  const q = { path: '/search/movie', query: f.title };
  if (f.year) q.year = String(f.year);
  const r = await json(`/api/tmdb?${new URLSearchParams(q)}`);
  const hit = r && (r.results || []).find((x) => Math.abs(Number((x.release_date || '').slice(0, 4)) - (f.year || 0)) <= 1) || (r && r.results && r.results[0]);
  return hit ? hit.id : null;
}

const MISSING_TTL = 30 * 864e5;
export const isFresh = (m) => m && (!m.missing || Date.now() - m.at < MISSING_TTL);

// Enrichit les films sans métadonnées. `known` : Map clé → méta ; `save(key, meta)` persiste ; `onProgress(done, total)`.
export async function enrich(list, { config, known, save, onProgress = () => {}, isCancelled = () => false }) {
  const todo = list.filter((f) => !isFresh(known.get(f.key)));
  let done = 0;
  const finish = async (f, meta) => {
    const m = meta || { key: f.key, missing: true, at: Date.now(), genres: [], directors: [], cast: [], countries: [], languages: [] };
    known.set(f.key, m);
    await save(f.key, m);
    onProgress(++done, todo.length);
  };

  const wiki = async (items) => {
    const withId = items.filter((f) => f.tmdb);
    const without = items.filter((f) => !f.tmdb);
    const byKey = new Map();
    for (let i = 0; i < withId.length; i += 60) {
      if (isCancelled()) return;
      const rows = await json(`/api/wikidata?tmdb=${withId.slice(i, i + 60).map((f) => f.tmdb).join(',')}`);
      for (const r of rows || []) byKey.set(String(r.tmdb), r);
    }
    for (const f of withId) await finish(f, byKey.has(String(f.tmdb)) ? normWiki(byKey.get(String(f.tmdb)), f.key) : null);
    for (let i = 0; i < without.length; i += 25) {
      if (isCancelled()) return;
      const chunk = without.slice(i, i + 25).filter((f) => f.year);
      const rows = chunk.length ? await json(`/api/wikidata?films=${encodeURIComponent(JSON.stringify(chunk.map((f) => ({ k: f.key, t: f.title, y: f.year }))))}`) : [];
      const m = new Map((rows || []).map((r) => [r.k, r]));
      for (const f of without.slice(i, i + 25)) await finish(f, m.has(f.key) ? normWiki(m.get(f.key), f.key) : null);
      await new Promise((ok) => setTimeout(ok, 700));
    }
  };

  if (!config.tmdb) return wiki(todo);
  // TMDB : 6 requêtes en parallèle ; ce qui échoue passe par Wikidata
  const failed = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length && !isCancelled()) {
      const f = todo[i++];
      let meta = null;
      const id = f.tmdb || (await tmdbFind(f));
      if (id) meta = await tmdbDetails(id, f.key);
      if (meta) await finish(f, meta);
      else failed.push(f);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failed.length && !isCancelled()) await wiki(failed);
}
