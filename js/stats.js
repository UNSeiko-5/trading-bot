// Statistiques : agrégats purs sur les entrées du journal et les métadonnées des films.
import { films as groupFilms } from './films.js';
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
