import { metaOf, state } from './state.js';
import { download } from './util.js';

// Texte entre guillemets ; une valeur commençant par = + - @ est neutralisée (injection de formule dans un tableur).
const text = (v) => {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function exportCsv(rows = state.entries, name = 'clap-journal.csv') {
  const head = ['date', 'titre', 'annee', 'note', 'revu', 'like', 'genres', 'realisateurs', 'duree_min', 'pays', 'avis'];
  const lines = rows.map((e) => {
    const m = metaOf(e.key) || {};
    return [e.date, text(e.title), e.year || '', e.rating || '', e.rewatch ? 'oui' : '', e.liked ? 'oui' : '', text((m.genres || []).join(', ')), text((m.directors || []).join(', ')), m.runtime || '', text((m.countries || []).join(', ')), text(e.review)];
  });
  download(name, [head, ...lines].map((r) => r.join(',')).join('\n'));
}
