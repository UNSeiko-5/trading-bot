// Lecture de l'export Letterboxd (ZIP ou fichiers CSV) : diary, watched, ratings, reviews, likes, watchlist.
import { entry, keyOf, mergeEntries, tsOf } from './films.js';
import { fold } from './util.js';
import { readZip } from './zip.js';

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

// Lignes → objets indexés par intitulé de colonne sans accents ni majuscules (« watched date », « letterboxd uri »…).
export function table(text) {
  const [head, ...body] = parseCsv(text);
  if (!head) return [];
  const cols = head.map((h) => fold(h));
  return body.map((r) => Object.fromEntries(cols.map((c, i) => [c, (r[i] ?? '').trim()])));
}

const yes = (v) => /^(yes|oui|true|1)$/i.test(String(v || '').trim());
const tagsOf = (v) => String(v || '').split(',').map((t) => t.trim()).filter(Boolean);

// `files` : { diary, watched, ratings, reviews, likes, watchlist } (texte CSV, tous facultatifs).
export function fromFiles(files) {
  const diary = table(files.diary || '');
  const ratings = table(files.ratings || '');
  const reviews = table(files.reviews || '');
  const watched = table(files.watched || '');
  const rate = new Map();
  for (const r of ratings.sort((a, b) => String(a.date).localeCompare(String(b.date)))) rate.set(keyOf(r.name, r.year), r.rating);
  const likes = new Set(table(files.likes || '').map((r) => keyOf(r.name, r.year)));

  const fromDiary = diary.map((r) => {
    const key = keyOf(r.name, r.year);
    return entry({ title: r.name, year: r.year, rating: r.rating || rate.get(key), rewatch: yes(r.rewatch), tags: tagsOf(r.tags), date: r['watched date'] || r.date, url: r['letterboxd uri'], liked: likes.has(key), source: 'archive' });
  }).filter(Boolean);

  const withReview = reviews.map((r) => {
    const key = keyOf(r.name, r.year);
    return entry({ title: r.name, year: r.year, rating: r.rating || rate.get(key), rewatch: yes(r.rewatch), tags: tagsOf(r.tags), date: r['watched date'] || r.date, url: r['letterboxd uri'], review: r.review, liked: likes.has(key), source: 'archive' });
  }).filter(Boolean);

  // films marqués « vus » sans entrée de journal : date de marquage, signalée approximative
  const seen = new Set([...fromDiary, ...withReview].map((e) => e.key));
  const fromWatched = watched.map((r) => {
    const key = keyOf(r.name, r.year);
    return seen.has(key) ? null : entry({ title: r.name, year: r.year, rating: rate.get(key), date: r.date, url: r['letterboxd uri'], liked: likes.has(key), approx: true, source: 'archive' });
  }).filter(Boolean);
  // notés mais ni dans le journal ni dans « vus »
  const seen2 = new Set([...seen, ...fromWatched.map((e) => e.key)]);
  const fromRatings = ratings.map((r) => (seen2.has(keyOf(r.name, r.year)) ? null : entry({ title: r.name, year: r.year, rating: r.rating, date: r.date, url: r['letterboxd uri'], liked: likes.has(keyOf(r.name, r.year)), approx: true, source: 'archive' }))).filter(Boolean);

  const watchlist = table(files.watchlist || '').map((r) => ({ key: keyOf(r.name, r.year), title: r.name, year: Number(r.year) || null, url: r['letterboxd uri'] || '', added: tsOf(String(r.date).slice(0, 10)) })).filter((w) => w.title);
  return { entries: mergeEntries(withReview, fromDiary, fromWatched, fromRatings), watchlist, likes: likes.size };
}

// Fichiers à la racine de l'archive (et likes/films.csv) ; les sous-dossiers (listes, éléments supprimés) sont ignorés.
const kindOfPath = (path) => {
  const p = path.toLowerCase().replace(/^\.?\//, '');
  if (p === 'likes/films.csv') return 'likes';
  return { 'diary.csv': 'diary', 'watched.csv': 'watched', 'ratings.csv': 'ratings', 'reviews.csv': 'reviews', 'watchlist.csv': 'watchlist' }[p] || null;
};

// Fichiers choisis par l'utilisateur : un ZIP d'export, ou un ou plusieurs CSV.
export async function readFiles(fileList) {
  const files = {};
  for (const f of fileList) {
    if (/\.zip$/i.test(f.name)) {
      const entries = await readZip(f);
      // l'archive peut contenir un dossier racine unique : on le retire avant de reconnaître les fichiers
      const prefix = entries.length && entries.every((e) => e.name.includes('/')) ? entries[0].name.split('/')[0] + '/' : '';
      for (const e of entries) {
        const kind = kindOfPath(prefix && e.name.startsWith(prefix) ? e.name.slice(prefix.length) : e.name);
        if (kind) files[kind] = new TextDecoder().decode(await e.read());
      }
    } else if (/\.csv$/i.test(f.name)) {
      const base = f.name.toLowerCase();
      const kind = base.includes('diary') ? 'diary' : base.includes('watchlist') ? 'watchlist' : base.includes('watched') ? 'watched' : base.includes('rating') ? 'ratings' : base.includes('review') ? 'reviews' : base.includes('like') ? 'likes' : null;
      if (kind) files[kind] = await f.text();
    }
  }
  if (!Object.keys(files).length) throw new Error('Aucun fichier reconnu : choisis le ZIP d’export Letterboxd, ou diary.csv, watched.csv, ratings.csv…');
  const out = fromFiles(files);
  if (!out.entries.length && !out.watchlist.length) throw new Error('Les fichiers ne contiennent aucun film lisible.');
  return out;
}
