import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';

const require = createRequire(import.meta.url);

// Faux services amont : Letterboxd (RSS), TMDB et Wikidata
const seen = { tmdb: [], sparql: [] };
const upstream = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/marie/rss/') return res.writeHead(200, { 'Content-Type': 'application/rss+xml' }).end('<?xml version="1.0"?><rss><channel><title>Letterboxd - marie</title></channel></rss>');
  if (u.pathname === '/vide/rss/') return res.writeHead(200).end('pas du xml');
  if (u.pathname.startsWith('/tmdb/')) { seen.tmdb.push(req.url); return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 949 })); }
  if (u.pathname === '/sparql') { seen.sparql.push(u.searchParams.get('query')); return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ results: { bindings: [{ k: { value: '949' }, tmdb: { value: '949' }, runtime: { value: '10200' }, genres: { value: 'drame|thriller' }, directors: { value: 'Michael Mann' } }] } })); }
  res.writeHead(404).end();
});
await new Promise((ok) => upstream.listen(0, ok));
const base = `http://localhost:${upstream.address().port}`;
process.env.LETTERBOXD_BASE_URL = base;
process.env.TMDB_BASE_URL = `${base}/tmdb`;
process.env.WIKIDATA_ENDPOINT = `${base}/sparql`;
process.env.TMDB_API_KEY = '0123456789abcdef0123456789abcdef';
const rss = require('../api/rss.js'), tmdb = require('../api/tmdb.js'), wd = require('../api/wikidata.js'), config = require('../api/config.js');

const call = (handler, url) => new Promise((resolve) => {
  const res = { headers: {}, statusCode: 200, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, headers: this.headers, body }); } };
  handler({ url }, res);
});

test('RSS : pseudo validé, profil inconnu, réponse non conforme, cache', async () => {
  assert.equal((await call(rss, '/api/rss?user=../etc')).status, 400);
  assert.equal((await call(rss, '/api/rss?user=a')).status, 400);
  assert.equal((await call(rss, '/api/rss?user=inconnu')).status, 404);
  assert.equal((await call(rss, '/api/rss?user=vide')).status, 502);
  const ok = await call(rss, '/api/rss?user=marie');
  assert.equal(ok.status, 200);
  assert.match(ok.body, /<rss>/);
  assert.match(ok.headers['Cache-Control'], /s-maxage/);
});

test('TMDB : liste blanche des chemins, clé v3 en paramètre, langue par défaut', async () => {
  assert.equal((await call(tmdb, '/api/tmdb?path=/account/123')).status, 400);
  assert.equal((await call(tmdb, '/api/tmdb?path=/movie/../account')).status, 400);
  const r = await call(tmdb, '/api/tmdb?path=/movie/949&append_to_response=credits');
  assert.equal(r.status, 200);
  const sent = seen.tmdb[seen.tmdb.length - 1];
  assert.match(sent, /^\/tmdb\/movie\/949\?/);
  assert.match(sent, /api_key=0123456789abcdef0123456789abcdef/);
  assert.match(sent, /language=fr-FR/);
  assert.match(sent, /append_to_response=credits/);
  assert.doesNotMatch(sent, /path=/);
});

test('TMDB : sans clé, 503 ; configuration publique sans la clé', async () => {
  const key = process.env.TMDB_API_KEY;
  assert.equal(JSON.parse((await call(config, '/api/config')).body).tmdb, true);
  assert.ok(!(await call(config, '/api/config')).body.includes(key));
  delete process.env.TMDB_API_KEY;
  assert.equal((await call(tmdb, '/api/tmdb?path=/movie/949')).status, 503);
  assert.equal(JSON.parse((await call(config, '/api/config')).body).tmdb, false);
  process.env.TMDB_API_KEY = key;
});

test('Wikidata : requête par identifiants et par titres, valeurs échappées, durée en secondes corrigée', async () => {
  assert.equal((await call(wd, '/api/wikidata')).status, 400);
  assert.equal((await call(wd, '/api/wikidata?tmdb=abc')).status, 400);
  const r = await call(wd, '/api/wikidata?tmdb=949,12x,603');
  const rows = JSON.parse(r.body);
  assert.equal(rows[0].runtime, 170, '10 200 s = 170 min');
  assert.deepEqual(rows[0].genres, ['drame', 'thriller']);
  const q = seen.sparql[seen.sparql.length - 1];
  assert.match(q, /\("949" "949"\)/);
  assert.doesNotMatch(q, /12x/);
  const films = JSON.stringify([{ k: 'x|1999', t: 'Un "titre" } injecté \\', y: 1999 }, { k: 'mauvais', t: 'Sans année', y: 'x' }]);
  await call(wd, `/api/wikidata?films=${encodeURIComponent(films)}`);
  const q2 = seen.sparql[seen.sparql.length - 1];
  assert.ok(q2.includes('"Un  titre  } injecté  "@en 1999'), q2.slice(0, 400));
  assert.ok(!q2.includes('Sans année'));
  assert.equal((await call(wd, `/api/wikidata?films=${encodeURIComponent('pas du json')}`)).status, 400);
});

test('index.html précharge chaque module JavaScript', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const list = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? list(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  assert.deepEqual(list('js').filter((m) => !html.includes(`<link rel="modulepreload" href="${m}">`)), []);
});

test.after(() => upstream.close());
