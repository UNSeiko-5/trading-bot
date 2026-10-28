import assert from 'node:assert/strict';
import test from 'node:test';
import { canonGenres, enrich, normTmdb, normWiki } from '../js/meta.js';

test('genres Wikidata très fins → genres canoniques (trois au plus)', () => {
  const heat = ['drame psychologique', 'thriller policier', 'film de gangsters', 'film ou téléfilm de casse', 'néo-noir', 'film et téléfilm d’action', 'drame'];
  assert.deepEqual(canonGenres(heat), ['Drame', 'Thriller', 'Crime']);
  assert.deepEqual(canonGenres(['cinéma de science-fiction', 'film d’horreur de science-fiction', 'girls with guns']), ['Horreur', 'Science-fiction']);
  assert.deepEqual(canonGenres(['Comédie', 'Romance', 'Science-Fiction']), ['Science-fiction', 'Comédie', 'Romance']);
  assert.deepEqual(canonGenres([]), []);
  assert.deepEqual(canonGenres(['Téléfilm']), []);
});

test('TMDB : réalisateurs, acteurs, pays et langues en français', () => {
  const m = normTmdb({ id: 949, runtime: 170, genres: [{ name: 'Crime' }, { name: 'Drame' }, { name: 'Action' }, { name: 'Thriller' }], credits: { crew: [{ job: 'Director', name: 'Michael Mann' }, { job: 'Writer', name: 'X' }], cast: [{ name: 'Al Pacino' }, { name: 'Robert De Niro' }] }, production_countries: [{ iso_3166_1: 'US', name: 'United States of America' }], original_language: 'en', poster_path: '/p.jpg', vote_count: 9000, vote_average: 7.9 }, 'heat|1995');
  assert.deepEqual(m.directors, ['Michael Mann']);
  assert.deepEqual(m.cast, ['Al Pacino', 'Robert De Niro']);
  assert.deepEqual(m.genres, ['Drame', 'Thriller', 'Crime']);
  assert.deepEqual(m.countries, ['États-Unis']);
  assert.deepEqual(m.languages, ['Anglais']);
  assert.equal(m.poster, 'https://image.tmdb.org/t/p/w342/p.jpg');
  assert.equal(m.runtime, 170);
  const w = normWiki({ tmdb: 949, runtime: 170, genres: ['thriller'], directors: ['Michael Mann'], countries: ['États-Unis'], languages: ['anglais'] }, 'heat|1995');
  assert.equal(w.source, 'wikidata');
  assert.deepEqual(w.cast, []);
});

const withFetch = async (handler, fn) => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => handler(new URL(url, 'http://x'));
  try {
    await fn();
  } finally {
    globalThis.fetch = real;
  }
};
const res = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('enrichissement sans TMDB : identifiants puis titres via Wikidata, échecs mémorisés', async () => {
  const known = new Map(), saved = [];
  const list = [{ key: 'heat|1995', title: 'Heat', year: 1995, tmdb: 949 }, { key: 'alien|1979', title: 'Alien', year: 1979, tmdb: null }, { key: 'inconnu|2000', title: 'Inconnu', year: 2000, tmdb: null }];
  await withFetch((u) => {
    if (u.pathname === '/api/wikidata' && u.searchParams.get('tmdb')) return res([{ k: '949', tmdb: 949, runtime: 170, genres: ['thriller'], directors: ['Michael Mann'], countries: ['États-Unis'], languages: ['anglais'] }]);
    if (u.pathname === '/api/wikidata') return res([{ k: 'alien|1979', tmdb: 348, runtime: 117, genres: ['cinéma de science-fiction'], directors: ['Ridley Scott'], countries: ['Royaume-Uni'], languages: ['anglais'] }]);
    return res({}, 404);
  }, () => enrich(list, { config: { tmdb: false }, known, save: async (k, m) => saved.push([k, m]) }));
  assert.equal(known.get('heat|1995').directors[0], 'Michael Mann');
  assert.equal(known.get('alien|1979').genres[0], 'Science-fiction');
  assert.equal(known.get('inconnu|2000').missing, true);
  assert.equal(saved.length, 3);
}, 20000);

test('enrichissement avec TMDB : recherche, détails, repli sur Wikidata', async () => {
  const known = new Map();
  const list = [{ key: 'heat|1995', title: 'Heat', year: 1995, tmdb: 949 }, { key: 'parasite|2019', title: 'Parasite', year: 2019, tmdb: null }, { key: 'rare|1970', title: 'Rare', year: 1970, tmdb: null }];
  const progress = [];
  await withFetch((u) => {
    const p = u.searchParams.get('path');
    if (p === '/movie/949') return res({ id: 949, runtime: 170, genres: [{ name: 'Drame' }], credits: { crew: [{ job: 'Director', name: 'Michael Mann' }], cast: [] } });
    if (p === '/search/movie' && u.searchParams.get('query') === 'Parasite') return res({ results: [{ id: 496243, release_date: '2019-05-30' }] });
    if (p === '/movie/496243') return res({ id: 496243, runtime: 132, genres: [{ name: 'Thriller' }], credits: { crew: [{ job: 'Director', name: 'Bong Joon-ho' }], cast: [] } });
    if (p === '/search/movie') return res({ results: [] });
    if (u.pathname === '/api/wikidata') return res([{ k: 'rare|1970', tmdb: null, runtime: 90, genres: ['drame'], directors: ['Inconnu'], countries: [], languages: [] }]);
    return res({}, 404);
  }, () => enrich(list, { config: { tmdb: true }, known, save: async () => {}, onProgress: (d, t) => progress.push([d, t]) }));
  assert.equal(known.get('heat|1995').source, 'tmdb');
  assert.equal(known.get('parasite|2019').directors[0], 'Bong Joon-ho');
  assert.equal(known.get('rare|1970').source, 'wikidata');
  assert.equal(progress[progress.length - 1][0], 3);
}, 20000);
