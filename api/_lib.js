'use strict';

const UA = 'Mozilla/5.0 (compatible; Clap/1.0; +https://github.com/UNSeiko-5/trading-bot)';

function send(res, status, body, cache = 'private, no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(JSON.stringify(body));
}

const params = (req) => new URL(req.url, 'http://x').searchParams;

// fetch avec délai maximal : une source lente ne doit pas bloquer la fonction.
async function get(url, headers = {}, ms = 9000) {
  return fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(ms) });
}

module.exports = { UA, get, params, send };
