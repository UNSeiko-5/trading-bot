import assert from 'node:assert/strict';
import test from 'node:test';
import { entry, films } from '../js/films.js';
import { byActor, byDecade, byDirector, byGenre, coverage, histogram, perMonth, perWeekday, perYear, runtimeBins, streaks, totals } from '../js/stats.js';
import { affinity, diversity, profile, tasteModel } from '../js/taste.js';

const iso = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const M = {
  'heat|1995': { genres: ['Drame', 'Thriller', 'Crime'], directors: ['Michael Mann'], cast: ['Al Pacino'], countries: ['États-Unis'], languages: ['Anglais'], runtime: 170, votes: 9000 },
  'collateral|2004': { genres: ['Thriller', 'Crime'], directors: ['Michael Mann'], cast: ['Tom Cruise'], countries: ['États-Unis'], languages: ['Anglais'], runtime: 120, votes: 8000 },
  'parasite|2019': { genres: ['Drame', 'Thriller'], directors: ['Bong Joon-ho'], cast: ['Song Kang-ho'], countries: ['Corée du Sud'], languages: ['Coréen'], runtime: 132, votes: 18000 },
  'le samourai|1967': { genres: ['Crime', 'Drame'], directors: ['Jean-Pierre Melville'], cast: ['Alain Delon'], countries: ['France', 'Italie'], languages: ['Français'], runtime: 98, votes: 1500 },
  'shrek|2001': { genres: ['Animation', 'Comédie'], directors: ['Andrew Adamson'], cast: ['Mike Myers'], countries: ['États-Unis'], languages: ['Anglais'], runtime: 90, votes: 15000 },
};
const metaOf = (k) => M[k] || null;
const E = (title, year, daysAgo, rating, extra = {}) => entry({ title, year, date: iso(daysAgo), rating, ...extra });
const entries = [E('Heat', 1995, 1, 4.5), E('Collateral', 2004, 2, 4), E('Parasite', 2019, 3, 5, { liked: true }), E('Le Samouraï', 1967, 4, 4.5), E('Shrek', 2001, 40, 2.5), E('Heat', 1995, 50, null, { rewatch: true }), E('Sans rien', 2000, 60, null, { approx: true })];

test('totaux : films, visionnages, heures et couverture des durées', () => {
  const t = totals(entries, metaOf);
  assert.equal(t.views, 7);
  assert.equal(t.films, 6);
  assert.equal(t.rewatches, 1);
  assert.equal(t.rated, 5);
  assert.ok(Math.abs(t.avg - 4.1) < 1e-9);
  assert.equal(t.minutes, 170 + 120 + 132 + 98 + 90 + 170);
  assert.ok(t.coverage > 0.8 && t.coverage < 0.9);
  assert.equal(t.fives, 1);
  assert.equal(t.likes, 1);
});

test('histogramme, mois, années, jours de semaine', () => {
  const fs = films(entries);
  const h = histogram(fs);
  assert.equal(h.length, 10);
  assert.equal(h.find((b) => b.rating === 4.5).count, 2);
  assert.equal(h.reduce((s, b) => s + b.count, 0), 5);
  const months = perMonth(entries, 3);
  assert.equal(months.length, 3);
  assert.equal(months.reduce((s, m) => s + m.items.length, 0) <= 7, true);
  assert.ok(perYear(entries).length >= 1);
  assert.equal(perWeekday(entries).reduce((s, v) => s + v, 0), 7);
});

test('séries de jours consécutifs', () => {
  const s = streaks(entries.filter((e) => !e.approx));
  assert.equal(s.day, 4); // hier, avant-hier… (aujourd'hui sans film : la série reste valable)
  assert.ok(s.bestDay >= 4);
});

test('regroupements : genres, réalisateurs, acteurs, décennies, note ajustée', () => {
  const fs = films(entries);
  const genres = byGenre(fs, metaOf);
  assert.equal(genres[0].name, 'Drame');
  assert.equal(genres.find((g) => g.name === 'Animation').count, 1);
  const dir = byDirector(fs, metaOf).find((d) => d.name === 'Michael Mann');
  assert.equal(dir.count, 2);
  assert.equal(dir.avg, 4.25);
  assert.ok(dir.adjusted < dir.avg && dir.adjusted > 3, 'note rétrécie vers la moyenne globale');
  assert.ok(byActor(fs, metaOf).some((a) => a.name === 'Al Pacino'));
  assert.deepEqual(byDecade(fs, metaOf).map((d) => d.name), ['1960s', '1990s', '2000s', '2010s']);
  assert.ok(runtimeBins(fs, metaOf).reduce((s, b) => s + b.count, 0) === 5);
  assert.ok(coverage(fs, metaOf) > 0.8);
});

test('diversité : entropie normalisée', () => {
  assert.equal(diversity([10]), 0);
  assert.ok(Math.abs(diversity([5, 5, 5, 5]) - 1) < 1e-9);
  assert.ok(diversity([20, 1, 1]) < diversity([7, 8, 7]));
});

test('profil de goût : indices /100, non évalués si les données manquent', () => {
  const fs = films(entries);
  const p = Object.fromEntries(profile({ entries, films: fs, metaOf }).map((x) => [x.id, x]));
  assert.ok(p.severity.score != null === false, 'moins de 10 notes : sévérité non évaluée');
  assert.equal(p.diversity.ready, true);
  assert.ok(p.world.score > 0 && p.world.score < 100);
  assert.equal(p.obscure.ready, true);
  assert.ok(p.classics.ready === false, 'moins de 10 films avec année : non évalué');
  for (const x of Object.values(p)) assert.ok(!x.ready || (x.score >= 0 && x.score <= 100));
});

test('affinité : un genre et un réalisateur aimés relèvent le score', () => {
  const fs = films(entries);
  const model = tasteModel(fs, metaOf);
  const like = affinity(model, { genres: ['Thriller', 'Crime'], directors: ['Michael Mann'], cast: [], countries: ['États-Unis'], languages: ['Anglais'] }, 1992);
  const dislike = affinity(model, { genres: ['Animation', 'Comédie'], directors: ['Andrew Adamson'], cast: ['Mike Myers'], countries: ['États-Unis'], languages: ['Anglais'] }, 2005);
  assert.ok(like.score > dislike.score + 15, `${like.score} vs ${dislike.score}`);
  assert.ok(like.reasons.length > 0);
  assert.equal(affinity(model, null, null).score, null);
});
