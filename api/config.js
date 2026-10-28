'use strict';
const { send } = require('./_lib');

// Indique au navigateur quelles sources de métadonnées sont disponibles (la clé TMDB reste côté serveur).
module.exports = (req, res) => send(res, 200, { tmdb: Boolean(process.env.TMDB_API_KEY) }, 'public, max-age=300');
