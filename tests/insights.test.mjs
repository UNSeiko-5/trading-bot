import assert from 'node:assert/strict';
import test from 'node:test';
import { entry, films } from '../js/films.js';
import { codeOf, continentOf, flag } from '../js/geo.js';
import { dailyFact, facts, milestones, onThisDay } from '../js/insights.js';
import { binges, byContinent, correlation, filmAgeByYear, genreByYear, genreDecade, hoursBy, longestPause, median, sagas, topStreaks, weekdayMonth, weekdayRating } from '../js/stats.js';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TITLES = [['Heat', 1995, ['Crime', 'Thriller'], 'Michael Mann', ['États-Unis'], 'Anglais', 170, 5], ['Parasite', 2019, ['Thriller', 'Drame'], 'Bong Joon-ho', ['Corée du Sud'], 'Coréen', 132, 5], ['Le Samouraï', 1967, ['Crime', 'Drame'], 'Jean-Pierre Melville', ['France', 'Italie'], 'Français', 105, 4.5], ['Shrek', 2001, ['Animation', 'Comédie'], 'Andrew Adamson', ['États-Unis'], 'Anglais', 90, 2.5], ['Yi Yi', 2000, ['Drame'], 'Edward Yang', ['Taïwan'], 'Mandarin', 173, 4.5], ['Amélie', 2001, ['Comédie', 'Romance'], 'Jean-Pierre Jeunet', ['France'], 'Français', 122, 3.5], ['Rio Bravo', 1959, ['Western'], 'Howard Hawks', ['États-Unis'], 'Anglais', 141, 4], ['Stalker', 1979, ['Science-fiction', 'Drame'], 'Andreï Tarkovski', ['Union soviétique'], 'Russe', 162, 4.5]];
const META = {};
const entries = [];
let n = 0;
const start = new Date(2022, 0, 3);
for (let i = 0; i < 400; i++) {
  const [title, year, genres, dir, countries, lang, runtime, base] = TITLES[i % TITLES.length];
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(i * 2.6));
  if (day > new Date()) break;
  entries.push(entry({ title: `${title}${i >= TITLES.length ? ` ${Math.floor(i / TITLES.length)}` : ''}`, year, date: iso(day), rating: i % 7 === 0 ? null : Math.min(5, Math.max(0.5, base + (i % 3 === 0 ? -0.5 : 0))), liked: i % 5 === 0, rewatch: i % 11 === 0, review: i % 40 === 0 ? 'un avis assez long pour compter quelques mots dans le total' : '' }));
  n++;
}
for (const e of entries) {
  const t = TITLES.find((x) => e.title.startsWith(x[0]));
  META[e.key] = { genres: t[2], directors: [t[3]], cast: [], countries: t[4], languages: [t[5]], runtime: t[6], votes: 1000 + (t[1] % 97) * 300, avg: 6 + (t[7] % 4) / 2, collection: t[0] === 'Heat' ? 'Saga Heat' : '' };
}
const metaOf = (k) => META[k] || null;
const fs = films(entries);

test('géographie : code, continent et drapeau à partir du nom français', () => {
  assert.equal(codeOf('France'), 'FR');
  assert.equal(continentOf('États-Unis'), 'Amérique du Nord');
  assert.equal(continentOf('Corée du Sud'), 'Asie');
  assert.equal(continentOf('Union soviétique'), 'Europe');
  assert.equal(continentOf('Pays imaginaire'), null);
  assert.equal(flag('France'), '🇫🇷');
  assert.equal(flag('Pays imaginaire'), '🏳️');
});

test('statistiques de rythme et d’évolution', () => {
  const real = entries.filter((e) => !e.approx);
  const wm = weekdayMonth(real);
  assert.equal(wm.length, 7);
  assert.equal(wm.flat().reduce((s, v) => s + v, 0), real.length);
  assert.ok(topStreaks(real, 3).length > 0);
  assert.ok(longestPause(real).days >= 1);
  assert.deepEqual(binges([entry({ title: 'A', date: '2024-01-01' }), entry({ title: 'B', date: '2024-01-01' }), entry({ title: 'C', date: '2024-01-01' }), entry({ title: 'D', date: '2024-01-02' })]).map((b) => b.count), [3]);
  const gy = genreByYear(real, metaOf, 4);
  assert.equal(gy.genres.length, 4);
  assert.equal(gy.counts.length, gy.years.length);
  const age = filmAgeByYear(real);
  assert.ok(age.every((a) => a.age > 0));
  const gd = genreDecade(fs, metaOf, 5);
  assert.equal(gd.cells.length, 5);
  assert.equal(gd.cells[0].length, gd.decades.length);
  assert.equal(sagas(fs, metaOf, 2)[0].name, 'Saga Heat');
  assert.ok(byContinent(fs, metaOf).some((c) => c.name === 'Asie'));
  assert.ok(hoursBy(real, metaOf, (m) => m.genres)[0].minutes > 0);
  assert.equal(weekdayRating(real).length, 7);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('corrélation de Pearson', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  assert.ok(Math.abs(correlation(xs, xs.map((x) => 2 * x + 1)) - 1) < 1e-9);
  assert.ok(Math.abs(correlation(xs, xs.map((x) => -x)) + 1) < 1e-9);
  assert.equal(correlation(xs, xs.map(() => 3)), null);
  assert.equal(correlation([1, 2], [1, 2]), null);
});

test('faits : présents, bien formés et sans doublon', () => {
  const list = facts({ entries, films: fs, metaOf });
  assert.ok(list.length >= 20, `${list.length} faits`);
  const ids = list.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of list) {
    assert.ok(f.big && f.text && f.cat, f.id);
    assert.ok(!/undefined|NaN|null|\[object/.test(`${f.big} ${f.text}`), `${f.id} : ${f.big} ${f.text}`);
  }
  for (const id of ['hours', 'weekday', 'countries', 'genre', 'mode']) assert.ok(ids.includes(id), id);
  assert.deepEqual(facts({ entries: [], films: [], metaOf }), []);
});

test('faits : un petit journal ne produit pas de statistiques bancales', () => {
  const few = entries.slice(0, 6);
  const list = facts({ entries: few, films: films(few), metaOf });
  for (const f of list) assert.ok(!/undefined|NaN/.test(`${f.big} ${f.text}`), f.id);
  assert.ok(!list.some((f) => ['weekday', 'month', 'corr-runtime', 'vs-public'].includes(f.id)));
});

test('fait du jour : stable pendant la journée, change le lendemain', () => {
  const list = facts({ entries, films: fs, metaOf });
  const a = dailyFact(list, new Date(2026, 5, 10, 8)), b = dailyFact(list, new Date(2026, 5, 10, 22)), c = dailyFact(list, new Date(2026, 5, 11, 8));
  assert.equal(a.id, b.id);
  assert.notEqual(a.id, c.id);
  assert.equal(dailyFact([]), null);
});

test('jalons et « ce jour-là »', () => {
  const ms = milestones(entries);
  assert.equal(ms[0].n, 1);
  assert.ok(ms.some((m) => m.n === 100));
  const some = entries[200];
  const d = new Date(some.ts);
  const today = new Date(d.getFullYear() + 2, d.getMonth(), d.getDate(), 12);
  const hits = onThisDay(entries, today);
  assert.ok(hits.length >= 1 && hits.every((h) => h.years >= 1));
});
