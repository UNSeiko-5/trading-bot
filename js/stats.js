// Statistiques : agrégats purs sur les entrées du journal et les métadonnées des films.
import { films as groupFilms } from './films.js';
import { continentOf } from './geo.js';
import { addDays, dayKey, startOfDay, startOfWeek } from './util.js';

const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
export const mean = (a) => (a.length ? sum(a, (x) => x) / a.length : null);

// Les entrées « approximatives » (date de marquage, pas de visionnage) ne comptent pas dans les séries temporelles.
export const dated = (entries) => entries.filter((e) => !e.approx);

export function totals(entries, metaOf) {
  const fs = groupFilms(entries);
  const rated = fs.filter((f) => f.rating);
  const withRuntime = entries.filter((e) => (metaOf(e.key) || {}).runtime);
  const minutes = sum(withRuntime, (e) => metaOf(e.key).runtime);
  return {
    views: entries.length,
    films: fs.length,
    rewatches: entries.filter((e) => e.rewatch).length,
    likes: fs.filter((f) => f.liked).length,
    rated: rated.length,
    avg: mean(rated.map((f) => f.rating)),
    minutes,
    coverage: entries.length ? withRuntime.length / entries.length : 0, // part des visionnages dont on connaît la durée
    reviews: entries.filter((e) => e.review).length,
    fives: rated.filter((f) => f.rating === 5).length,
  };
}

export const between = (entries, from, to) => entries.filter((e) => e.ts >= +from && e.ts < +to);

// Histogramme des notes par film : 10 tranches de 0,5 à 5.
export function histogram(fs) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ rating: (i + 1) / 2, count: 0 }));
  for (const f of fs) if (f.rating) bins[Math.round(f.rating * 2) - 1].count++;
  return bins;
}

export function perMonth(entries, months, now = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1), e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    out.push({ start: s, items: between(entries, s, e) });
  }
  return out;
}

export function perYear(entries) {
  const m = new Map();
  for (const e of entries) {
    const y = new Date(e.ts).getFullYear();
    if (!m.has(y)) m.set(y, []);
    m.get(y).push(e);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, items]) => ({ year, items }));
}

export const perWeekday = (entries) => {
  const out = Array.from({ length: 7 }, () => 0);
  for (const e of entries) out[(new Date(e.ts).getDay() + 6) % 7]++;
  return out;
};

// Séries de jours consécutifs avec au moins un film ; une série « en cours » reste valable si le dernier film date d'hier.
export function streaks(entries, now = new Date()) {
  const days = new Set(entries.map((e) => dayKey(e.ts)));
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const k of sorted) {
    const d = new Date(`${k}T12:00:00`);
    run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let cur = 0, d = startOfDay(now);
  if (!days.has(dayKey(d))) d = addDays(d, -1);
  while (days.has(dayKey(d))) { cur++; d = addDays(d, -1); }
  const weeks = new Set(entries.map((e) => dayKey(startOfWeek(new Date(e.ts)))));
  let w = startOfWeek(now), wk = 0;
  if (!weeks.has(dayKey(w))) w = addDays(w, -7);
  while (weeks.has(dayKey(w))) { wk++; w = addDays(w, -7); }
  return { day: cur, bestDay: best, week: wk };
}

// Regroupement par valeur d'une métadonnée (genre, réalisateur…) : nombre, note moyenne, note ajustée (rétrécie vers la moyenne globale).
export function group(fs, metaOf, pick, { prior = 3, min = 1 } = {}) {
  const all = fs.filter((f) => f.rating).map((f) => f.rating);
  const g = mean(all) ?? 3;
  const map = new Map();
  for (const f of fs) {
    const m = metaOf(f.key);
    const vals = pick(f, m);
    for (const v of vals || []) {
      if (v == null || v === '') continue;
      if (!map.has(v)) map.set(v, { name: v, films: [], ratings: [] });
      const x = map.get(v);
      x.films.push(f);
      if (f.rating) x.ratings.push(f.rating);
    }
  }
  return [...map.values()]
    .filter((x) => x.films.length >= min)
    .map((x) => ({
      name: x.name, count: x.films.length, rated: x.ratings.length, avg: mean(x.ratings),
      adjusted: x.ratings.length ? (sum(x.ratings, (r) => r) + prior * g) / (x.ratings.length + prior) : null,
      likes: x.films.filter((f) => f.liked).length, films: x.films,
    }))
    .sort((a, b) => b.count - a.count || (b.avg || 0) - (a.avg || 0));
}

export const decadeOf = (year) => (year ? `${Math.floor(year / 10) * 10}s` : null);
export const byGenre = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && m.genres, o);
export const byDirector = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && m.directors, o);
export const byActor = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && m.cast, o);
export const byCountry = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && m.countries, o);
export const byLanguage = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && m.languages, o);
export const byContinent = (fs, metaOf, o) => group(fs, metaOf, (f, m) => m && [...new Set((m.countries || []).map(continentOf).filter(Boolean))], o).sort((a, b) => b.count - a.count);
export const byDecade = (fs, metaOf, o) => group(fs, metaOf, (f) => [decadeOf(f.year)], o).sort((a, b) => a.name.localeCompare(b.name));

export const RUNTIME_BINS = [['< 90 min', 0, 90], ['90–105', 90, 105], ['105–120', 105, 120], ['120–150', 120, 150], ['2 h 30 et +', 150, Infinity]];
export function runtimeBins(fs, metaOf) {
  return RUNTIME_BINS.map(([label, lo, hi]) => {
    const list = fs.filter((f) => { const r = (metaOf(f.key) || {}).runtime; return r >= lo && r < hi; });
    return { label, count: list.length, avg: mean(list.filter((f) => f.rating).map((f) => f.rating)) };
  });
}

// Couverture des métadonnées : part des films pour lesquels une information est connue.
export function coverage(fs, metaOf, field = 'genres') {
  if (!fs.length) return 0;
  return fs.filter((f) => { const m = metaOf(f.key); return m && m[field] && (Array.isArray(m[field]) ? m[field].length : m[field]); }).length / fs.length;
}

// ---------- Rythme ----------
export const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const WEEKDAYS_FR = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

// Matrice 7 jours × 12 mois (nombre de visionnages).
export function weekdayMonth(entries) {
  const m = Array.from({ length: 7 }, () => Array(12).fill(0));
  for (const e of entries) {
    const d = new Date(e.ts);
    m[(d.getDay() + 6) % 7][d.getMonth()]++;
  }
  return m;
}

export const perMonthOfYear = (entries) => {
  const out = Array(12).fill(0);
  for (const e of entries) out[new Date(e.ts).getMonth()]++;
  return out;
};

// Jours « marathon » : au moins `min` films le même jour.
export function binges(entries, min = 3) {
  const m = new Map();
  for (const e of entries) {
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e);
  }
  return [...m.entries()].filter(([, l]) => l.length >= min).map(([date, list]) => ({ date, count: list.length, list })).sort((a, b) => b.count - a.count || b.date.localeCompare(a.date));
}

// Plus longues séries de jours consécutifs : [{ start, end, length }] triées.
export function topStreaks(entries, n = 5) {
  const days = [...new Set(entries.map((e) => dayKey(e.ts)))].sort();
  const out = [];
  let start = null, prev = null, len = 0;
  const close = () => { if (start) out.push({ start, end: prev, length: len }); };
  for (const k of days) {
    const d = new Date(`${k}T12:00:00`);
    if (prev && Math.round((d - new Date(`${prev}T12:00:00`)) / 864e5) === 1) len++;
    else { close(); start = k; len = 1; }
    prev = k;
  }
  close();
  return out.sort((a, b) => b.length - a.length || b.end.localeCompare(a.end)).slice(0, n);
}

// Plus longue pause entre deux jours de visionnage (en jours) et ses dates.
export function longestPause(entries) {
  const days = [...new Set(entries.map((e) => dayKey(e.ts)))].sort();
  let best = null;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((new Date(`${days[i]}T12:00:00`) - new Date(`${days[i - 1]}T12:00:00`)) / 864e5) - 1;
    if (!best || gap > best.days) best = { days: gap, from: days[i - 1], to: days[i] };
  }
  return best;
}

// ---------- Évolution ----------
// Parts de genres par année de visionnage : { years: [..], genres: [..], counts: [[par année]] }.
export function genreByYear(entries, metaOf, top = 6) {
  const years = [...new Set(entries.map((e) => new Date(e.ts).getFullYear()))].sort((a, b) => a - b);
  const tot = new Map();
  const per = new Map(years.map((y) => [y, new Map()]));
  for (const e of entries) {
    const m = metaOf(e.key);
    if (!m) continue;
    for (const g of m.genres || []) {
      tot.set(g, (tot.get(g) || 0) + 1);
      const y = per.get(new Date(e.ts).getFullYear());
      y.set(g, (y.get(g) || 0) + 1);
    }
  }
  const genres = [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([g]) => g);
  return { years, genres, counts: years.map((y) => genres.map((g) => per.get(y).get(g) || 0)), totals: years.map((y) => entries.filter((e) => new Date(e.ts).getFullYear() === y && metaOf(e.key)).length) };
}

// Âge moyen des films (année de visionnage − année de sortie) pour chaque année de visionnage.
export function filmAgeByYear(entries) {
  const m = new Map();
  for (const e of entries) {
    if (!e.year) continue;
    const y = new Date(e.ts).getFullYear();
    if (!m.has(y)) m.set(y, []);
    m.get(y).push(y - e.year);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([year, v]) => ({ year, age: mean(v), n: v.length }));
}

// ---------- Croisements ----------
export function genreDecade(fs, metaOf, topGenres = 10) {
  const g = byGenre(fs, metaOf).slice(0, topGenres);
  const decades = [...new Set(fs.filter((f) => f.year).map((f) => decadeOf(f.year)))].sort();
  const cell = (genre, dec) => {
    const list = genre.films.filter((f) => decadeOf(f.year) === dec);
    return { count: list.length, avg: mean(list.filter((f) => f.rating).map((f) => f.rating)) };
  };
  return { genres: g.map((x) => x.name), decades, cells: g.map((x) => decades.map((d) => cell(x, d))) };
}

// Sagas : films vus d'une même collection TMDB (au moins `min` films).
export function sagas(fs, metaOf, min = 2) {
  const m = new Map();
  for (const f of fs) {
    const c = (metaOf(f.key) || {}).collection;
    if (!c) continue;
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(f);
  }
  return [...m.entries()].filter(([, l]) => l.length >= min).map(([name, list]) => ({ name, films: list.sort((a, b) => (a.year || 0) - (b.year || 0)), count: list.length, avg: mean(list.filter((f) => f.rating).map((f) => f.rating)) })).sort((a, b) => b.count - a.count);
}

// Corrélation de Pearson (null si trop peu de points ou variance nulle).
export function correlation(xs, ys) {
  const n = xs.length;
  if (n < 8) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

// Note moyenne par jour de semaine (lundi = 0) : seules les entrées notées comptent.
export function weekdayRating(entries) {
  const acc = Array.from({ length: 7 }, () => []);
  for (const e of entries) if (e.rating) acc[(new Date(e.ts).getDay() + 6) % 7].push(e.rating);
  return acc.map((l) => ({ n: l.length, avg: mean(l) }));
}

// Minutes passées par valeur d'une métadonnée (un visionnage compte pour la durée du film).
export function hoursBy(entries, metaOf, pick) {
  const m = new Map();
  for (const e of entries) {
    const meta = metaOf(e.key);
    if (!meta || !meta.runtime) continue;
    for (const v of pick(meta) || []) m.set(v, (m.get(v) || 0) + meta.runtime);
  }
  return [...m.entries()].map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
}

// Médiane d'une liste de nombres (null si vide).
export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}
