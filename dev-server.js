'use strict';
// Serveur local sans dépendance : fichiers statiques + fonctions /api (mêmes handlers que Vercel).
const http = require('http');
const fs = require('fs');
const path = require('path');

try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
};

// Mêmes en-têtes de sécurité (dont la CSP) qu'en production, pour tester à l'identique.
let SECURITY = [];
try {
  SECURITY = JSON.parse(fs.readFileSync(path.join(__dirname, 'vercel.json'), 'utf8')).headers[0].headers;
} catch {}

const server = http.createServer((req, res) => {
  for (const { key, value } of SECURITY) res.setHeader(key, value);
  const url = new URL(req.url, 'http://localhost');
  const api = url.pathname.match(/^\/api\/([a-z]+)$/);
  if (api && fs.existsSync(path.join(__dirname, 'api', `${api[1]}.js`)) && api[1] !== '_lib') {
    return Promise.resolve(require(`./api/${api[1]}.js`)(req, res)).catch((e) => {
      console.error(e);
      res.statusCode = 500;
      res.end('Erreur serveur');
    });
  }
  let file = path.join(__dirname, decodeURIComponent(url.pathname));
  if (!file.startsWith(__dirname)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return res.writeHead(404).end('Introuvable');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.writeHead(200);
  fs.createReadStream(file).pipe(res);
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Clap sur http://localhost:${port}`));
