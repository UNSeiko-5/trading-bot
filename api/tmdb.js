'use strict';
// Relais de l'API TMDB (lecture seule, liste blanche) : la clé reste côté serveur.
const { get, params, send } = require('./_lib');

const BASE = (process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3').replace(/\/$/, '');
const ALLOWED = [/^\/search\/movie$/, /^\/movie\/\d+$/, /^\/movie\/\d+\/(recommendations|similar)$/, /^\/movie\/popular$/, /^\/movie\/top_rated$/];

module.exports = async (req, res) => {
  const key = process.env.TMDB_API_KEY;
  if (!key) return send(res, 503, { error: 'no_key' });
  const q = params(req);
  const path = q.get('path') || '';
  if (!ALLOWED.some((re) => re.test(path))) return send(res, 400, { error: 'bad_path' });
  q.delete('path');
  if (!q.has('language')) q.set('language', 'fr-FR');
  const headers = {};
  // clé v3 (32 caractères hexadécimaux) en paramètre ; jeton « lecture » v4 en en-tête
  if (/^[a-f0-9]{32}$/i.test(key)) q.set('api_key', key);
  else headers.Authorization = `Bearer ${key}`;
  try {
    const r = await get(`${BASE}${path}?${q}`, headers);
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', r.ok ? 'public, s-maxage=86400, stale-while-revalidate=604800' : 'private, no-store');
    res.end(text);
  } catch {
    send(res, 502, { error: 'unavailable' });
  }
};
