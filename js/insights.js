// Faits et curiosités calculés sur le journal : chaque fait n'apparaît que si les données le justifient.
import { CONTINENT_NAMES, flag } from './geo.js';
import {
  MONTHS_FR, WEEKDAYS_FR, binges, byActor, byContinent, byCountry, byDecade, byDirector, byGenre, byLanguage, correlation, dated, histogram, hoursBy, longestPause,
  mean, median, perMonthOfYear, perWeekday, perYear, sagas, topStreaks, totals, weekdayRating,
} from './stats.js';
import { dayOfYear, daysInYear, fmtDate, fold } from './util.js';

export const CATS = [['temps', 'Temps'], ['rythme', 'Rythme'], ['notes', 'Notes'], ['films', 'Films'], ['monde', 'Monde']];

const nf = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pl = (n, one, many = `${one}s`) => `${nf(n)} ${n >= 2 ? many : one}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rt = (r) => `${String(r).replace('.', ',')} ★`;
const fh = (key) => `#/film/${encodeURIComponent(key)}`;
const d8 = (iso, kind = 'med') => fmtDate(new Date(`${iso}T12:00:00`), kind);
const uniq = (items) => new Set(items.map((e) => e.key)).size;
const argmax = (a) => a.indexOf(Math.max(...a));
const argmin = (a) => a.indexOf(Math.min(...a));
const ARTICLES = /^(the|a|an|le|la|les|l'|un|une|des|el|il|der|die|das)\s+/;

// Étiquettes pour les jalons du journal : 1ᵉʳ, 10ᵉ, 25ᵉ, 50ᵉ…
export const MILESTONES = [1, 10, 25, 50, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000, 2500, 3000, 4000, 5000];

// Films dans l'ordre de première apparition au journal (visionnages datés).
export function firstViews(entries) {
  const seen = new Set();
  const out = [];
  for (const e of [...dated(entries)].sort((a, b) => a.ts - b.ts)) {
    if (seen.has(e.key)) continue;
    seen.add(e.key);
    out.push(e);
  }
  return out;
}

export function milestones(entries) {
  const order = firstViews(entries);
  return MILESTONES.filter((n) => order.length >= n).map((n) => ({ n, entry: order[n - 1] }));
}

// Films vus le même jour du calendrier lors des années précédentes, du plus récent au plus ancien.
export function onThisDay(entries, now = new Date()) {
  const m = now.getMonth(), d = now.getDate(), y = now.getFullYear();
  return dated(entries)
    .filter((e) => { const t = new Date(e.ts); return t.getMonth() === m && t.getDate() === d && t.getFullYear() < y; })
    .sort((a, b) => b.ts - a.ts)
    .map((e) => ({ entry: e, years: y - new Date(e.ts).getFullYear() }));
}

export function facts({ entries, films, metaOf, now = new Date() }) {
  const out = [];
  if (!entries.length) return out;
  const real = dated(entries);
  const add = (cat, id, big, text, more = {}) => out.push({ cat, id, big: String(big), text, ...more });
  const tot = totals(entries, metaOf);
  const rated = films.filter((f) => f.rating);
  const meta = (f) => metaOf(f.key) || {};

  // ----- Temps -----
  if (tot.minutes >= 600 && tot.coverage >= 0.5) {
    const days = tot.minutes / 1440;
    add('temps', 'hours', `${nf(tot.minutes / 60)} h`, `de cinéma, soit ${nf(days, 1)} jour${days >= 2 ? 's' : ''} entier${days >= 2 ? 's' : ''} devant un écran${tot.coverage < 0.95 ? ` (durées connues pour ${Math.round(tot.coverage * 100)} % des visionnages)` : ''}.`);
    const flights = tot.minutes / 60 / 8.5;
    if (flights >= 3) add('temps', 'flights', `${nf(flights)} vols`, 'Paris – New York bout à bout : c’est le temps que tu as passé devant des films.');
    const avgRun = mean(films.map((f) => meta(f).runtime).filter(Boolean));
    if (avgRun) add('temps', 'avg-runtime', `${Math.floor(avgRun / 60)} h ${String(Math.round(avgRun % 60)).padStart(2, '0')}`, 'de durée moyenne pour les films de ton journal.');
  }
  const order = firstViews(entries);
  const first = real.reduce((m, e) => (!m || e.ts < m.ts ? e : m), null);
  if (first) {
    const days = Math.max(1, Math.round((+now - first.ts) / 864e5));
    add('temps', 'first', days >= 730 ? `${nf(days / 365.25)} ans` : `${nf(days)} jours`, `depuis le premier film de ton journal : « ${first.title} »${first.year ? ` (${first.year})` : ''}, vu le ${d8(first.date)}.`, { href: fh(first.key) });
    const reached = [...MILESTONES].reverse().find((n) => order.length >= n && n > 1);
    if (reached) {
      const e = order[reached - 1];
      add('temps', 'milestone', `${reached}ᵉ film`, `« ${e.title} »${e.year ? ` (${e.year})` : ''}, vu le ${d8(e.date)} : ton dernier jalon franchi.`, { href: fh(e.key) });
    }
  }
  const py = perYear(real);
  if (py.length >= 2) {
    const best = [...py].sort((a, b) => uniq(b.items) - uniq(a.items))[0];
    const mins = totals(best.items, metaOf).minutes;
    add('temps', 'best-year', String(best.year), `ton année record : ${pl(uniq(best.items), 'film')}${mins ? `, soit ${nf(mins / 60)} h de cinéma` : ''}.`);
  }
  const y = now.getFullYear();
  const doy = dayOfYear(now);
  const seenThisYear = uniq(real.filter((e) => new Date(e.ts).getFullYear() === y));
  if (doy >= 30 && seenThisYear >= 5) {
    const proj = Math.round((seenThisYear / doy) * daysInYear(y));
    if (proj > seenThisYear) add('temps', 'projection', `~${proj}`, `films d’ici le 31 décembre au rythme de ${y} (${seenThisYear} à ce jour).`);
  }

  // ----- Rythme -----
  if (real.length >= 20 && first) {
    const span = Math.max(1, (+now - first.ts) / 864e5);
    add('rythme', 'pace', `${nf(span / uniq(real), 1)} j`, 'entre deux films en moyenne depuis ta première entrée.');
    if (span >= 90) {
      const active = new Set(real.map((e) => e.date)).size;
      const pct = (active / (span + 1)) * 100;
      add('rythme', 'active-days', `${nf(pct, pct < 10 ? 1 : 0)} %`, 'des jours depuis ta première entrée contiennent au moins un film.');
    }
  }
  if (real.length >= 30) {
    const wd = perWeekday(real);
    const i = argmax(wd);
    const we = ((wd[5] + wd[6]) / real.length) * 100;
    add('rythme', 'weekday', cap(WEEKDAYS_FR[i]), `ton jour de cinéma favori : ${Math.round((wd[i] / real.length) * 100)} % de tes visionnages. Le week-end en rassemble ${Math.round(we)} % (28 % si tout était réparti à parts égales).`);
  }
  if (real.length >= 60) {
    const mo = perMonthOfYear(real);
    const hi = argmax(mo), lo = argmin(mo);
    if (hi !== lo) add('rythme', 'month', cap(MONTHS_FR[hi]), `ton mois le plus cinéphile : ${Math.round((mo[hi] / real.length) * 100)} % de tes visionnages, contre ${Math.round((mo[lo] / real.length) * 100)} % en ${MONTHS_FR[lo]}.`);
  }
  const bg = binges(real, 3);
  if (bg.length) add('rythme', 'binge', pl(bg[0].count, 'film'), `en une seule journée, le ${d8(bg[0].date, 'full')}.${bg.length > 1 ? ` Tu as connu ${bg.length} journées à 3 films ou plus.` : ''}`, { href: fh(bg[0].list[0].key) });
  const st = topStreaks(real, 1)[0];
  if (st && st.length >= 3) add('rythme', 'streak', pl(st.length, 'jour'), `d’affilée avec au moins un film, du ${d8(st.start, 'short')} au ${d8(st.end)}.`);
  const pause = longestPause(real);
  if (pause && pause.days >= 14) add('rythme', 'pause', pl(pause.days, 'jour'), `sans film : ta plus longue pause, du ${d8(pause.from, 'short')} au ${d8(pause.to)}.`);

  // ----- Notes -----
  if (rated.length >= 10) {
    const hist = histogram(films);
    const mode = hist.reduce((a, b) => (b.count > a.count ? b : a));
    add('notes', 'mode', rt(mode.rating), `ta note de prédilection : ${pl(mode.count, 'film')}, soit ${Math.round((mode.count / rated.length) * 100)} % des films notés.`);
    const hi = rated.filter((f) => f.rating >= 4).length, lo = rated.filter((f) => f.rating <= 2).length;
    add('notes', 'generous', `${Math.round((hi / rated.length) * 100)} %`, `de tes films notés valent 4 ★ ou plus ; ${Math.round((lo / rated.length) * 100)} % descendent à 2 ★ ou moins.`);
    const fives = rated.filter((f) => f.rating === 5).length;
    if (fives >= 3) add('notes', 'fives', `1 sur ${Math.round(rated.length / fives)}`, `de tes films notés reçoit 5 ★ (${fives} au total).`);
    const minR = Math.min(...rated.map((f) => f.rating));
    if (rated.length >= 20 && minR >= 1.5) add('notes', 'floor', rt(minR), 'ta note la plus basse : aucun de tes films notés ne descend en dessous.');
  }
  if (rated.length >= 20) {
    const half = rated.filter((f) => f.rating % 1).length / rated.length;
    add('notes', 'half', `${Math.round(half * 100)} %`, `de tes notes sont des demi-étoiles. ${half >= 0.4 ? 'Tu aimes la nuance.' : half <= 0.1 ? 'Tu notes surtout en étoiles entières.' : ''}`.trim());
  }
  if (films.length >= 20) {
    const likes = films.filter((f) => f.liked);
    if (likes.length >= 5) {
      const f5 = rated.filter((f) => f.rating === 5);
      add('notes', 'likes', `${Math.round((likes.length / films.length) * 100)} %`, `de tes films ont reçu un ♥${f5.length >= 3 ? `, dont ${Math.round((f5.filter((f) => f.liked).length / f5.length) * 100)} % de tes 5 ★` : ''}.`);
    }
  }
  if (rated.length >= 30) {
    const sorted = [...rated].sort((a, b) => a.first - b.first);
    const half = Math.floor(sorted.length / 2);
    const diff = mean(sorted.slice(half).map((f) => f.rating)) - mean(sorted.slice(0, half).map((f) => f.rating));
    if (Math.abs(diff) >= 0.12) add('notes', 'drift', `${diff > 0 ? '+' : '−'}${nf(Math.abs(diff), 2)} ★`, diff > 0 ? 'de note moyenne en plus dans la seconde moitié de ton journal : tu deviens plus généreux.' : 'de note moyenne en moins dans la seconde moitié de ton journal : tu deviens plus exigeant.');
  }
  const ratedViews = real.filter((e) => e.rating);
  if (ratedViews.length >= 70) {
    const wr = weekdayRating(ratedViews).map((x, i) => ({ ...x, i })).filter((x) => x.n >= 8);
    if (wr.length >= 3) {
      const best = wr.reduce((a, b) => (b.avg > a.avg ? b : a)), worst = wr.reduce((a, b) => (b.avg < a.avg ? b : a));
      if (best.avg - worst.avg >= 0.2) add('notes', 'weekday-mood', cap(WEEKDAYS_FR[best.i]), `ton jour le plus généreux : ${nf(best.avg, 2)} ★ de moyenne, contre ${nf(worst.avg, 2)} ★ le ${WEEKDAYS_FR[worst.i]}.`);
    }
  }
  const revs = entries.filter((e) => e.review);
  if (revs.length >= 3) {
    const words = (t) => t.split(/\s+/).filter(Boolean).length;
    const total = revs.reduce((s, e) => s + words(e.review), 0);
    add('notes', 'reviews', `${nf(total)} mots`, `écrits dans ${pl(revs.length, 'avis', 'avis')}, soit environ ${nf(Math.max(1, Math.round(total / 250)))} page${total >= 500 ? 's' : ''} de texte.`);
    const long = revs.reduce((a, b) => (words(b.review) > words(a.review) ? b : a));
    if (words(long.review) >= 60) add('notes', 'long-review', `${nf(words(long.review))} mots`, `pour ton avis le plus long, sur « ${long.title} ».`, { href: fh(long.key) });
  }
  const corr = (label, pick, up, down, minN = 12) => {
    const pts = rated.map((f) => [pick(f), f.rating]).filter(([v]) => v != null && Number.isFinite(v));
    if (pts.length < minN) return;
    const r = correlation(pts.map((p) => p[0]), pts.map((p) => p[1]));
    if (r != null && Math.abs(r) >= 0.15) add('notes', label, `r = ${nf(r, 2)}`, r > 0 ? up : down, { hint: 'Corrélation de Pearson : de −1 à 1, 0 signifie aucun lien.' });
  };
  corr('corr-runtime', (f) => meta(f).runtime || null, 'entre durée et note : plus un film est long, mieux tu le notes.', 'entre durée et note : les films courts te plaisent davantage.');
  corr('corr-year', (f) => f.year || null, 'entre année de sortie et note : les films récents te plaisent davantage.', 'entre année de sortie et note : les films anciens te plaisent davantage.');
  corr('corr-pop', (f) => (meta(f).votes >= 50 ? Math.log10(meta(f).votes) : null), 'entre notoriété (votes TMDB) et note : les films très populaires te plaisent davantage.', 'entre notoriété (votes TMDB) et note : tu préfères les films peu connus.');
  const vsPublic = rated.filter((f) => meta(f).avg > 0 && meta(f).votes >= 200);
  if (vsPublic.length >= 10) {
    const gap = mean(vsPublic.map((f) => f.rating - meta(f).avg / 2));
    add('notes', 'vs-public', Math.abs(gap) < 0.1 ? '≈ 0' : `${gap > 0 ? '+' : '−'}${nf(Math.abs(gap), 2)} ★`, Math.abs(gap) < 0.1 ? 'd’écart avec le public TMDB : tes notes collent à celles de tout le monde.' : gap > 0 ? 'de plus que le public TMDB en moyenne : tu es plutôt généreux.' : 'de moins que le public TMDB en moyenne : tu es plutôt exigeant.');
    const against = vsPublic.filter((f) => f.rating >= 4.5 && meta(f).avg <= 7).sort((a, b) => meta(a).avg - meta(b).avg)[0];
    if (against) add('notes', 'contrarian', `${nf(meta(against).avg, 1)} / 10`, `pour le public TMDB sur « ${against.title} », que tu as noté ${rt(against.rating)} : ton coup de cœur le plus à contre-courant.`, { href: fh(against.key) });
    const letdown = vsPublic.filter((f) => f.rating <= 2.5 && meta(f).avg >= 7.2).sort((a, b) => meta(b).avg - meta(a).avg)[0];
    if (letdown) add('notes', 'letdown', `${nf(meta(letdown).avg, 1)} / 10`, `pour le public TMDB sur « ${letdown.title} », qui ne t’a valu que ${rt(letdown.rating)} : ta plus grande déception face au consensus.`, { href: fh(letdown.key) });
  }

  // ----- Films -----
  const most = [...films].sort((a, b) => b.count - a.count)[0];
  if (most && most.count >= 2) add('films', 'rewatch', `${most.count}×`, `« ${most.title} » : le film que tu as le plus revu.`, { href: fh(most.key) });
  const withYear = films.filter((f) => f.year);
  const oldest = [...withYear].sort((a, b) => a.year - b.year)[0];
  if (oldest && withYear.length >= 10) add('films', 'oldest', String(oldest.year), `« ${oldest.title} » : le plus ancien film de ton journal, sorti il y a ${y - oldest.year} ans.`, { href: fh(oldest.key) });
  const ages = real.filter((e) => e.year).map((e) => new Date(e.ts).getFullYear() - e.year);
  if (ages.length >= 20) add('films', 'median-age', `${nf(median(ages))} ans`, `d’âge médian pour un film au moment où tu le regardes ; ${Math.round((ages.filter((a) => a <= 2).length / ages.length) * 100)} % sont sortis depuis moins de 2 ans.`);
  const runs = films.filter((f) => meta(f).runtime);
  if (runs.length >= 20) {
    const hm = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
    const lg = runs.reduce((a, b) => (meta(b).runtime > meta(a).runtime ? b : a)), sh = runs.reduce((a, b) => (meta(b).runtime < meta(a).runtime ? b : a));
    add('films', 'longest', hm(meta(lg).runtime), `« ${lg.title} » : le plus long film de ton journal.`, { href: fh(lg.key) });
    add('films', 'shortest', hm(meta(sh).runtime), `« ${sh.title} » : le plus court.`, { href: fh(sh.key) });
  }
  const dirs = byDirector(films, metaOf);
  if (dirs[0] && dirs[0].count >= 3) add('films', 'director', pl(dirs[0].count, 'film'), `de ${dirs[0].name} : ton réalisateur le plus vu${dirs[0].avg ? `, noté ${nf(dirs[0].avg, 2)} ★ en moyenne` : ''}.`);
  const favDir = dirs.filter((d) => d.rated >= 3).sort((a, b) => b.adjusted - a.adjusted)[0];
  if (favDir && favDir !== dirs[0]) add('films', 'director-fav', `${nf(favDir.avg, 2)} ★`, `de moyenne sur ${favDir.rated} films de ${favDir.name}, ton réalisateur chouchou (note ajustée).`);
  const actors = byActor(films, metaOf);
  if (actors[0] && actors[0].count >= 3) add('films', 'actor', pl(actors[0].count, 'film'), `avec ${actors[0].name} au générique : ton acteur ou actrice le plus vu.`);
  const gs = byGenre(films, metaOf);
  const withG = films.filter((f) => (meta(f).genres || []).length).length;
  if (gs[0] && withG >= 15) {
    add('films', 'genre', gs[0].name, `ton genre numéro 1 : ${Math.round((gs[0].count / withG) * 100)} % de tes films y appartiennent (${gs[0].count}).`);
    const best = gs.filter((g) => g.rated >= 5).sort((a, b) => b.adjusted - a.adjusted)[0];
    if (best && best !== gs[0]) add('films', 'genre-best', best.name, `ton genre le mieux noté : ${nf(best.adjusted, 2)} ★ de moyenne ajustée sur ${best.rated} films.`);
    const hrs = hoursBy(entries, metaOf, (m) => m.genres)[0];
    if (hrs && hrs.minutes >= 300) add('films', 'genre-hours', `${nf(hrs.minutes / 60)} h`, `de « ${hrs.name} » : le genre qui occupe le plus de ton temps d’écran.`);
  }
  const decs = byDecade(films, metaOf).sort((a, b) => b.count - a.count);
  if (decs[0] && withYear.length >= 15) add('films', 'decade', `Années ${decs[0].name.slice(0, 4)}`, `ta décennie de prédilection : ${pl(decs[0].count, 'film')}, soit ${Math.round((decs[0].count / withYear.length) * 100)} % de ton journal.`);
  const sg = sagas(films, metaOf, 2)[0];
  if (sg) add('films', 'saga', pl(sg.count, 'film'), `de la saga « ${sg.name} »${sg.avg ? `, notés ${nf(sg.avg, 2)} ★ en moyenne` : ''}.`);
  const known = films.filter((f) => meta(f).votes > 0);
  if (known.length >= 20) {
    const rare = known.reduce((a, b) => (meta(b).votes < meta(a).votes ? b : a)), pop = known.reduce((a, b) => (meta(b).votes > meta(a).votes ? b : a));
    add('films', 'obscure', `${nf(meta(rare).votes)} votes`, `sur TMDB pour « ${rare.title} » : le film le plus confidentiel de ton journal.`, { href: fh(rare.key) });
    add('films', 'popular', `${nf(meta(pop).votes)} votes`, `sur TMDB pour « ${pop.title} » : le film le plus plébiscité de ton journal.`, { href: fh(pop.key) });
  }
  if (films.length >= 40) {
    const letters = new Set();
    for (const f of films) {
      const t = fold(f.title).replace(/[^a-z0-9' ]/g, '').trim();
      const c = t.replace(ARTICLES, '').charAt(0).toUpperCase();
      if (/[A-Z]/.test(c)) letters.add(c);
    }
    const missing = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter((l) => !letters.has(l));
    add('films', 'alphabet', `${letters.size} / 26`, `lettres de l’alphabet couvertes par l’initiale de tes titres${missing.length && missing.length <= 8 ? `. Il te manque : ${missing.join(', ')}` : ''}.`);
  }
  const longTitle = films.length >= 20 ? films.reduce((a, b) => (b.title.length > a.title.length ? b : a)) : null;
  if (longTitle && longTitle.title.length >= 30) add('films', 'long-title', `${longTitle.title.length} car.`, `pour « ${longTitle.title} », le titre le plus long de ton journal.`, { href: fh(longTitle.key) });

  // ----- Monde -----
  const cs = byCountry(films, metaOf);
  if (cs.length >= 3) {
    const present = new Set(byContinent(films, metaOf).map((c) => c.name));
    const missing = CONTINENT_NAMES.filter((c) => !present.has(c));
    add('monde', 'countries', `${cs.length} pays`, `de production dans ton journal, sur ${present.size} continent${present.size > 1 ? 's' : ''} sur 6${missing.length && missing.length <= 3 ? ` (il te manque : ${missing.join(', ')})` : ''}.`);
    const conts = byContinent(films, metaOf);
    const withC = films.filter((f) => (meta(f).countries || []).length).length;
    if (conts[0] && withC >= 15) add('monde', 'continent', conts[0].name, `d’où viennent ${Math.round((conts[0].count / withC) * 100)} % de tes films (co-productions comprises).`);
    const single = cs.filter((c) => c.count === 1);
    if (single.length >= 3) add('monde', 'single', String(single.length), `pays n’apparaissent que dans un seul de tes films : ${single.slice(0, 4).map((c) => `${flag(c.name)} ${c.name}`).join(', ')}${single.length > 4 ? '…' : ''}.`);
    const bestC = cs.filter((c) => c.rated >= 4).sort((a, b) => b.adjusted - a.adjusted)[0];
    if (bestC) add('monde', 'country-fav', `${flag(bestC.name)} ${bestC.name}`, `ton pays le mieux noté : ${nf(bestC.adjusted, 2)} ★ de moyenne ajustée sur ${bestC.rated} films.`);
  }
  const langs = byLanguage(films, metaOf);
  if (langs.length >= 3) {
    const withL = films.filter((f) => (meta(f).languages || []).length);
    const foreign = withL.filter((f) => !meta(f).languages.some((l) => fold(l) === 'anglais'));
    add('monde', 'languages', `${langs.length} langues`, `originales dans ton journal ; ${Math.round((foreign.length / Math.max(1, withL.length)) * 100)} % de tes films ne sont pas tournés en anglais.`);
  }
  return out;
}

// Un fait par jour, stable dans la journée et qui change le lendemain.
export function dailyFact(list, now = new Date()) {
  return list.length ? list[(dayOfYear(now) + now.getFullYear()) % list.length] : null;
}
