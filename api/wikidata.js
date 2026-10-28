'use strict';
// Métadonnées de films sans clé : Wikidata, par identifiant TMDB (?tmdb=1,2,3) ou par titre et année (?films=<json>).
const { get, params, send } = require('./_lib');

const ENDPOINT = process.env.WIKIDATA_ENDPOINT || 'https://query.wikidata.org/sparql';
const lit = (s) => `"${String(s).replace(/[\\"\n\r]/g, ' ').slice(0, 120)}"`;

const SELECT = `SELECT ?k ?tmdb (SAMPLE(?d) AS ?runtime) (SAMPLE(?y) AS ?year)
  (GROUP_CONCAT(DISTINCT ?gl; separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?dl; separator="|") AS ?directors)
  (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?countries) (GROUP_CONCAT(DISTINCT ?ll; separator="|") AS ?languages) WHERE {`;
const OPTIONALS = `
  OPTIONAL { ?film wdt:P2047 ?d }
  OPTIONAL { ?film wdt:P577 ?date . BIND(YEAR(?date) AS ?y) }
  OPTIONAL { ?film wdt:P136 ?g . ?g rdfs:label ?gl FILTER(LANG(?gl) = "fr") }
  OPTIONAL { ?film wdt:P57 ?dr . ?dr rdfs:label ?dl FILTER(LANG(?dl) = "en") }
  OPTIONAL { ?film wdt:P495 ?c . ?c rdfs:label ?cl FILTER(LANG(?cl) = "fr") }
  OPTIONAL { ?film wdt:P364 ?lg . ?lg rdfs:label ?ll FILTER(LANG(?ll) = "fr") }
} GROUP BY ?k ?tmdb`;

function query(q) {
  const ids = (q.get('tmdb') || '').split(',').filter((x) => /^\d{1,9}$/.test(x)).slice(0, 80);
  if (ids.length) return `${SELECT} VALUES (?k ?tmdb) { ${ids.map((i) => `("${i}" "${i}")`).join(' ')} } ?film wdt:P4947 ?tmdb .${OPTIONALS}`;
  let films;
  try {
    films = JSON.parse(q.get('films') || '[]');
  } catch {
    return null;
  }
  films = (Array.isArray(films) ? films : []).filter((f) => f && typeof f.t === 'string' && typeof f.k === 'string' && Number.isInteger(f.y)).slice(0, 30);
  if (!films.length) return null;
  return `${SELECT} VALUES (?k ?t ?yy) { ${films.map((f) => `(${lit(f.k)} ${lit(f.t)}@en ${f.y})`).join(' ')} }
  VALUES ?cls { wd:Q11424 wd:Q202866 wd:Q24862 wd:Q226730 wd:Q24869 }
  ?film wdt:P31 ?cls ; rdfs:label ?t ; wdt:P577 ?pd . FILTER(YEAR(?pd) = ?yy)
  OPTIONAL { ?film wdt:P4947 ?tmdb }${OPTIONALS}`;
}

const split = (v) => (v ? v.split('|').filter(Boolean) : []);
const val = (b, k) => (b[k] ? b[k].value : '');

module.exports = async (req, res) => {
  const sparql = query(params(req));
  if (!sparql) return send(res, 400, { error: 'bad_query' });
  try {
    const r = await get(`${ENDPOINT}?format=json&query=${encodeURIComponent(sparql)}`, { Accept: 'application/sparql-results+json' }, 20000);
    if (!r.ok) return send(res, 502, { error: 'unavailable', status: r.status });
    const json = await r.json();
    const out = json.results.bindings.map((b) => {
      let runtime = Number(val(b, 'runtime')) || 0;
      if (runtime > 600) runtime = Math.round(runtime / 60); // durée parfois saisie en secondes
      return {
        k: val(b, 'k'), tmdb: Number(val(b, 'tmdb')) || null, runtime: runtime >= 20 && runtime <= 600 ? runtime : null, year: Number(val(b, 'year')) || null,
        genres: split(val(b, 'genres')), directors: split(val(b, 'directors')), countries: split(val(b, 'countries')), languages: split(val(b, 'languages')),
      };
    });
    send(res, 200, out, 'public, s-maxage=86400, stale-while-revalidate=604800');
  } catch {
    send(res, 502, { error: 'unavailable' });
  }
};
