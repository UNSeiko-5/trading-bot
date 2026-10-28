// Modèle de données : une entrée de journal = un visionnage d'un film ; un « film » regroupe ses entrées.
import { fold } from './util.js';

export const keyOf = (title, year) => `${fold(String(title || '').replace(/\s+/g, ' ').trim())}|${year || ''}`;

// ★★★½ pour 3,5
export const stars = (r) => (r > 0 ? '★'.repeat(Math.floor(r)) + (r % 1 ? '½' : '') : '');
export const ratingText = (r) => (r > 0 ? `${String(r).replace('.', ',')} / 5` : 'sans note');

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// midi local : évite tout décalage de jour lié au fuseau ou à l'heure d'été
export const tsOf = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : NaN;
};

const toRating = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return n >= 0.5 && n <= 5 ? Math.round(n * 2) / 2 : null;
};

// Entrée normalisée (null si le titre ou la date sont inutilisables).
export function entry(o) {
  const title = String(o.title || '').trim();
  const ts = tsOf(o.date);
  if (!title || !Number.isFinite(ts)) return null;
  const year = Number(o.year) || null;
  const key = keyOf(title, year);
  return {
    id: o.id || `${key}@${o.date}`,
    key, title, year,
    rating: toRating(o.rating),
    liked: Boolean(o.liked),
    rewatch: Boolean(o.rewatch),
    date: String(o.date).slice(0, 10),
    ts,
    review: o.review ? String(o.review).trim() : '',
    tags: Array.isArray(o.tags) ? o.tags : [],
    url: o.url || '',
    tmdb: o.tmdb ? Number(o.tmdb) : null,
    poster: o.poster || '',
    approx: Boolean(o.approx), // date de marquage « vu », pas de visionnage
    source: o.source || 'archive',
  };
}

// Fusionne plusieurs listes d'entrées : mêmes film et même jour = même visionnage ; les champs vides sont complétés.
export function mergeEntries(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const e of list) {
      const k = `${e.key}@${e.date}`;
      const cur = map.get(k);
      if (!cur) {
        map.set(k, { ...e });
        continue;
      }
      for (const f of ['rating', 'tmdb', 'poster', 'url', 'review']) if (e[f] && !cur[f]) cur[f] = e[f];
      if (!cur.tags.length && e.tags.length) cur.tags = e.tags;
      cur.liked = cur.liked || e.liked;
      cur.rewatch = cur.rewatch || e.rewatch;
      cur.approx = cur.approx && e.approx;
      if (e.source === 'rss') cur.source = 'rss';
    }
  }
  // une entrée « approximative » (film seulement marqué vu) devient inutile dès qu'un vrai visionnage daté existe pour le même film
  const real = new Set([...map.values()].filter((e) => !e.approx).map((e) => e.key));
  return [...map.values()].filter((e) => !e.approx || !real.has(e.key)).sort((a, b) => b.ts - a.ts || a.title.localeCompare(b.title));
}

// Regroupe par film : première et dernière date, nombre de visionnages, note la plus récente.
export function films(entries) {
  const map = new Map();
  for (const e of entries) {
    let f = map.get(e.key);
    if (!f) map.set(e.key, (f = { key: e.key, title: e.title, year: e.year, entries: [], tmdb: null, poster: '', url: '' }));
    f.entries.push(e);
    f.tmdb = f.tmdb || e.tmdb;
    f.poster = f.poster || e.poster;
    f.url = f.url || e.url;
  }
  for (const f of map.values()) {
    f.entries.sort((a, b) => b.ts - a.ts);
    const rated = f.entries.find((e) => e.rating);
    f.rating = rated ? rated.rating : null;
    f.liked = f.entries.some((e) => e.liked);
    f.count = f.entries.length;
    f.first = f.entries[f.entries.length - 1].ts;
    f.last = f.entries[0].ts;
  }
  return [...map.values()].sort((a, b) => b.last - a.last);
}
