'use strict';
// Relais du flux RSS public d'un profil Letterboxd (le navigateur ne peut pas le lire directement : pas de CORS).
const { get, params, send } = require('./_lib');

const LB = (process.env.LETTERBOXD_BASE_URL || 'https://letterboxd.com').replace(/\/$/, '');

module.exports = async (req, res) => {
  const user = params(req).get('user') || '';
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(user)) return send(res, 400, { error: 'bad_user' });
  try {
    const r = await get(`${LB}/${user}/rss/`, { Accept: 'application/rss+xml, application/xml' });
    if (r.status === 404) return send(res, 404, { error: 'not_found' });
    if (!r.ok) return send(res, 502, { error: 'unavailable', status: r.status });
    const text = await r.text();
    if (!text.includes('<rss') || text.length > 3_000_000) return send(res, 502, { error: 'unavailable' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=3600');
    res.end(text);
  } catch {
    send(res, 502, { error: 'unavailable' });
  }
};
