// Profil de goût : indices /100, affinité d'un film avec tes notes et recommandations.
import { byActor, byCountry, byDecade, byDirector, byGenre, byLanguage, coverage, decadeOf, mean } from './stats.js';
import { clamp } from './util.js';

export const LEVELS = ['Faible', 'Modéré', 'Marqué', 'Fort', 'Très fort'];
export const levelName = (s) => LEVELS[Math.min(4, Math.floor(clamp(s, 0, 99.99) / 20))];

function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

// Entropie normalisée (0 = tout dans une catégorie, 1 = répartition parfaitement égale).
export function diversity(counts) {
  const tot = counts.reduce((s, c) => s + c, 0);
  if (tot === 0 || counts.length < 2) return 0;
  const h = -counts.reduce((s, c) => (c ? s + (c / tot) * Math.log(c / tot) : s), 0);
  return h / Math.log(counts.length);
}

const SCALES = {
  volume: [[0, 0], [20, 20], [60, 50], [150, 75], [300, 95], [500, 100]], // films par an
  world: [[0, 0], [0.15, 25], [0.35, 50], [0.55, 75], [0.8, 100]], // part de films hors États-Unis et Royaume-Uni
  classics: [[0, 0], [0.05, 25], [0.15, 50], [0.3, 75], [0.5, 100]], // part de films d'avant 1980
  severity: [[2.5, 100], [3, 80], [3.4, 50], [3.8, 25], [4.2, 5]], // note moyenne : plus elle est basse, plus tu es sévère
  rewatch: [[0, 0], [0.05, 30], [0.12, 60], [0.25, 90]],
  obscure: [[0, 0], [0.1, 25], [0.25, 50], [0.45, 75], [0.7, 100]], // part de films peu connus (moins de 3 000 votes TMDB)
};

const ANGLO = new Set(['États-Unis', 'Royaume-Uni']);

// Indices du profil. Chaque indice renvoie { id, label, score, level, text, ready } ; `ready: false` si les données manquent.
export function profile({ entries, films, metaOf, now = new Date() }) {
  const yearAgo = +now - 365 * 864e5;
  const last12 = entries.filter((e) => !e.approx && e.ts >= yearAgo);
  const rated = films.filter((f) => f.rating);
  const avg = mean(rated.map((f) => f.rating));
  const out = [];
  const add = (id, label, score, text, ready = true) => out.push({ id, label, score: ready ? Math.round(clamp(score, 0, 100)) : null, level: ready ? levelName(score) : null, text, ready });

  const perYear = last12.length;
  add('volume', 'Volume', interp(SCALES.volume, perYear), `${perYear} film${perYear > 1 ? 's' : ''} sur les 12 derniers mois.`, entries.some((e) => !e.approx));

  const weeks = new Set(last12.map((e) => Math.floor((+now - e.ts) / (7 * 864e5))));
  add('regularity', 'Régularité', (weeks.size / 52) * 100, `${weeks.size} semaine${weeks.size > 1 ? 's' : ''} sur 52 avec au moins un film.`, last12.length > 0);

  add('severity', 'Sévérité des notes', avg == null ? 0 : interp(SCALES.severity, avg), avg == null ? 'Aucune note.' : `Note moyenne ${avg.toFixed(2).replace('.', ',')} / 5 : plus elle est basse, plus tu es exigeant.`, rated.length >= 10);

  const cG = coverage(films, metaOf, 'genres'), cC = coverage(films, metaOf, 'countries');
  const gs = byGenre(films, metaOf), cs = byCountry(films, metaOf), ds = byDecade(films, metaOf);
  const div = films.length ? (0.4 * diversity(gs.map((x) => x.count)) + 0.3 * diversity(cs.map((x) => x.count)) + 0.3 * diversity(ds.map((x) => x.count))) * 100 : 0;
  add('diversity', 'Diversité', Math.min(100, div * 1.15), `Répartition de tes films entre ${gs.length} genres, ${cs.length} pays et ${ds.length} décennies.`, cG >= 0.3 && cC >= 0.3);

  const withC = films.filter((f) => (metaOf(f.key) || {}).countries && metaOf(f.key).countries.length);
  const world = withC.length ? withC.filter((f) => !metaOf(f.key).countries.every((c) => ANGLO.has(c))).length / withC.length : 0;
  add('world', 'Cinéma du monde', interp(SCALES.world, world), `${Math.round(world * 100)} % de tes films ne sont pas uniquement américains ou britanniques.`, cC >= 0.3);

  const withY = films.filter((f) => f.year);
  const classics = withY.length ? withY.filter((f) => f.year < 1980).length / withY.length : 0;
  add('classics', 'Classiques', interp(SCALES.classics, classics), `${Math.round(classics * 100)} % de tes films sortis avant 1980.`, withY.length >= 10);

  const withV = films.filter((f) => (metaOf(f.key) || {}).votes > 0);
  const obscure = withV.length ? withV.filter((f) => metaOf(f.key).votes < 3000).length / withV.length : 0;
  add('obscure', 'Hors des sentiers battus', interp(SCALES.obscure, obscure), withV.length ? `${Math.round(obscure * 100)} % de tes films ont moins de 3 000 votes sur TMDB.` : 'La notoriété des films vient de TMDB : ajoute la clé TMDB côté serveur pour calculer cet indice.', withV.length / Math.max(1, films.length) >= 0.3);

  const re = entries.length ? entries.filter((e) => e.rewatch).length / entries.length : 0;
  add('rewatch', 'Revisionnage', interp(SCALES.rewatch, re), `${Math.round(re * 100)} % de tes visionnages sont des revisionnages.`, entries.length >= 20);
  return out;
}

// ---------- Affinité et recommandations ----------

// Profil de goût par attribut : écart entre ta note moyenne sur l'attribut et ta note moyenne globale, rétréci selon le nombre de films.
export function tasteModel(films, metaOf) {
  const rated = films.filter((f) => f.rating);
  const g = mean(rated.map((f) => f.rating)) ?? 3;
  const sd = Math.sqrt(mean(rated.map((f) => (f.rating - g) ** 2)) || 0.5) || 0.7;
  const toMap = (rows) => new Map(rows.filter((r) => r.rated).map((r) => [r.name, { score: ((r.adjusted - g) / sd), n: r.rated, avg: r.avg }]));
  return {
    g, sd, n: rated.length,
    genres: toMap(byGenre(rated, metaOf, { prior: 3 })), directors: toMap(byDirector(rated, metaOf, { prior: 1.5 })),
    actors: toMap(byActor(rated, metaOf, { prior: 3 })), countries: toMap(byCountry(rated, metaOf, { prior: 4 })),
    languages: toMap(byLanguage(rated, metaOf, { prior: 4 })), decades: toMap(byDecade(rated, metaOf, { prior: 4 })),
  };
}

// Score d'affinité 0–100 d'un film (métadonnées + année) avec le modèle de goût, et les raisons principales.
export function affinity(model, meta, year) {
  const parts = [];
  const take = (map, names, weight, label, fmt) => {
    const hits = (names || []).map((n) => ({ n, v: map.get(n) })).filter((x) => x.v);
    if (!hits.length) return;
    const best = hits.reduce((a, b) => (Math.abs(b.v.score) > Math.abs(a.v.score) ? b : a));
    parts.push({ w: weight, s: hits.reduce((s, x) => s + x.v.score, 0) / hits.length, reason: { label, name: best.n, avg: best.v.avg, n: best.v.n, score: best.v.score, fmt } });
  };
  if (meta) {
    take(model.genres, meta.genres, 0.34, 'genre');
    take(model.directors, meta.directors, 0.26, 'réalisateur');
    take(model.actors, meta.cast, 0.1, 'acteur');
    take(model.countries, meta.countries, 0.08, 'pays');
    take(model.languages, meta.languages, 0.04, 'langue');
  }
  take(model.decades, year ? [decadeOf(year)] : [], 0.1, 'décennie');
  if (meta && meta.avg > 0) parts.push({ w: 0.08, s: (meta.avg - 6.8) / 1.2, reason: null }); // notoriété critique TMDB (sur 10)
  const wsum = parts.reduce((s, p) => s + p.w, 0);
  if (!wsum) return { score: null, reasons: [], predicted: null };
  const z = parts.reduce((s, p) => s + p.w * clamp(p.s, -2, 2), 0) / wsum;
  const reasons = parts.filter((p) => p.reason).sort((a, b) => Math.abs(b.w * b.s) - Math.abs(a.w * a.s)).slice(0, 2).map((p) => p.reason);
  // note prévue : ta moyenne, décalée de 0,6 écart-type par unité de z (on ne prédit jamais aux extrêmes)
  return { score: Math.round(clamp(50 + z * 35, 1, 99)), reasons, predicted: Math.round(clamp(model.g + z * model.sd * 0.6, 0.5, 5) * 10) / 10 };
}
