// Rétrospective d'une année : tous les chiffres et faits marquants, prêts à être affichés ou partagés.
import { films as groupFilms } from './films.js';
import { binges, byActor, byContinent, byCountry, byDirector, byGenre, byLanguage, dated, histogram, perMonthOfYear, perWeekday, topStreaks, totals } from './stats.js';

export const retroYears = (entries) => [...new Set(dated(entries).map((e) => new Date(e.ts).getFullYear()))].sort((a, b) => b - a);

const ANGLO = new Set(['États-Unis', 'Royaume-Uni']);
const share = (n, d) => (d ? n / d : 0);
const names = (rows) => new Set(rows.map((r) => r.name));

// Une « personnalité » de cinéphile déduite de l'année, avec la phrase qui la justifie.
export function persona(r) {
  const n = r.films.length;
  const meta = r.films.map((f) => r.metaOf(f.key) || {});
  const withC = meta.filter((m) => (m.countries || []).length);
  const foreign = share(withC.filter((m) => !m.countries.every((c) => ANGLO.has(c))).length, withC.length);
  const classics = share(r.films.filter((f) => f.year && f.year < 1980).length, r.films.filter((f) => f.year).length);
  const rewatch = share(r.tot.rewatches, r.items.length);
  const pct = (v) => Math.round(v * 100);
  if (n >= 10 && rewatch >= 0.2) return { name: 'Le Fidèle', text: `${pct(rewatch)} % de tes visionnages sont des revisionnages : tu aimes retrouver les films qui comptent.` };
  if (withC.length >= 10 && foreign >= 0.6) return { name: 'Le Globe-trotter', text: `${pct(foreign)} % de tes films ne sont ni américains ni britanniques : ${r.countries.length} pays visités depuis ton canapé.` };
  if (n >= 10 && classics >= 0.35) return { name: 'Le Cinéphile d’archives', text: `${pct(classics)} % de tes films sont sortis avant 1980.` };
  if (r.binges.length >= 4) return { name: 'Le Marathonien', text: `${r.binges.length} journées à 3 films ou plus, avec un record de ${r.binges[0].count} en un jour.` };
  if (r.tot.rated >= 10 && r.tot.avg <= 2.9) return { name: 'Le Critique impitoyable', text: `${r.tot.avg.toFixed(2).replace('.', ',')} / 5 de moyenne : une bonne note se mérite.` };
  if (r.tot.rated >= 10 && r.tot.avg >= 4.1) return { name: 'Le Bon public', text: `${r.tot.avg.toFixed(2).replace('.', ',')} / 5 de moyenne : tu sais voir le bon dans chaque film.` };
  if (n >= 150) return { name: 'L’Ogre de cinéma', text: `${n} films en une année : plus de ${Math.floor(n / 52)} par semaine en moyenne.` };
  return { name: 'L’Explorateur', text: 'Un peu de tout : ton année ne se laisse pas enfermer dans une case.' };
}

export function retro(year, { entries, metaOf }) {
  const real = dated(entries);
  const inYear = (e) => new Date(e.ts).getFullYear() === year;
  const items = real.filter(inYear);
  if (!items.length) return null;
  const before = real.filter((e) => new Date(e.ts).getFullYear() < year);
  const prevItems = real.filter((e) => new Date(e.ts).getFullYear() === year - 1);
  const fs = groupFilms(items);
  const oldFs = groupFilms(before);
  const tot = totals(items, metaOf);
  const months = perMonthOfYear(items);
  const wd = perWeekday(items);
  const countries = byCountry(fs, metaOf);
  const known = names(byCountry(oldFs, metaOf)), knownDirs = names(byDirector(oldFs, metaOf));
  const directors = byDirector(fs, metaOf);
  const actors = byActor(fs, metaOf);
  const sorted = [...items].sort((a, b) => a.ts - b.ts);
  const withRun = fs.filter((f) => (metaOf(f.key) || {}).runtime);
  const withYear = fs.filter((f) => f.year);
  const r = {
    year, items, films: fs, metaOf, tot,
    prev: prevItems.length ? totals(prevItems, metaOf) : null,
    months, bestMonth: months.indexOf(Math.max(...months)),
    weekday: wd.indexOf(Math.max(...wd)),
    top: [...fs].filter((f) => f.rating).sort((a, b) => b.rating - a.rating || Number(b.liked) - Number(a.liked) || b.last - a.last).slice(0, 5),
    flops: [...fs].filter((f) => f.rating && f.rating <= 2).sort((a, b) => a.rating - b.rating || b.last - a.last).slice(0, 3),
    genres: byGenre(fs, metaOf).slice(0, 6),
    directors: directors.filter((d) => d.count >= 2).slice(0, 4), actors: actors.filter((d) => d.count >= 2).slice(0, 4),
    countries, continents: byContinent(fs, metaOf), languages: byLanguage(fs, metaOf),
    newCountries: countries.filter((c) => !known.has(c.name)).map((c) => c.name),
    newDirectors: directors.filter((d) => !knownDirs.has(d.name)).length,
    hist: histogram(fs),
    binges: binges(items, 3),
    streak: topStreaks(items, 1)[0] || null,
    first: sorted[0], last: sorted[sorted.length - 1],
    longest: withRun.length ? withRun.reduce((a, b) => ((metaOf(b.key).runtime > metaOf(a.key).runtime) ? b : a)) : null,
    oldest: withYear.length ? withYear.reduce((a, b) => (b.year < a.year ? b : a)) : null,
    mostRewatched: [...fs].sort((a, b) => b.count - a.count)[0],
  };
  r.persona = persona(r);
  return r;
}

const fr = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

// Résumé texte prêt à coller dans un message.
export function retroText(r, who = '') {
  const lines = [`Ma rétrospective cinéma ${r.year}${who ? ` (${who})` : ''}`, '', `${fr(r.films.length)} film${r.films.length > 1 ? 's' : ''}${r.tot.minutes ? `, ${fr(r.tot.minutes / 60)} h de cinéma` : ''}${r.tot.avg ? `, note moyenne ${fr(r.tot.avg, 2)} / 5` : ''}`];
  if (r.top.length) lines.push(`Mes coups de cœur : ${r.top.slice(0, 3).map((f) => f.title).join(', ')}`);
  if (r.genres.length) lines.push(`Genres : ${r.genres.slice(0, 3).map((g) => g.name).join(', ')}`);
  if (r.countries.length) lines.push(`${r.countries.length} pays de production`);
  lines.push(`Profil : ${r.persona.name}`);
  return lines.join('\n');
}
