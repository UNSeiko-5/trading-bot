// Bouton d'import de l'export Letterboxd (ZIP ou CSV), réutilisé sur l'accueil, le tableau de bord et les Réglages.
import { importArchive } from './data.js';
import { h } from './util.js';

export const HOW_TO = 'Sur letterboxd.com : Réglages › Données › « Exporter vos données ». Letterboxd te remet un fichier ZIP : choisis-le ici (ou les fichiers diary.csv, watched.csv, ratings.csv, reviews.csv, watchlist.csv).';

export function importButton({ label = 'Importer mon export', primary = false, onDone } = {}) {
  const msg = h('p', { class: 'muted', role: 'status', style: 'font-size:13px;min-height:18px;margin-top:8px' });
  const btn = h('button', { class: `btn${primary ? ' primary' : ''}`, type: 'button', onclick: () => input.click() }, label);
  const input = h('input', {
    type: 'file', multiple: true, accept: '.zip,.csv,application/zip,text/csv', hidden: true, 'aria-label': 'Export Letterboxd (ZIP ou fichiers CSV)',
    onchange: async () => {
      const files = [...input.files];
      input.value = '';
      if (!files.length) return;
      btn.disabled = true;
      msg.style.color = '';
      msg.textContent = 'Lecture de l’export…';
      try {
        const r = await importArchive(files);
        msg.textContent = `${r.added} visionnage${r.added > 1 ? 's' : ''} ajouté${r.added > 1 ? 's' : ''}${r.watchlist ? `, ${r.watchlist} film${r.watchlist > 1 ? 's' : ''} à voir` : ''}.`;
        document.dispatchEvent(new CustomEvent('clap:data', { detail: { source: 'archive' } }));
        onDone && onDone(r);
      } catch (e) {
        msg.style.color = 'var(--bad-text)';
        msg.textContent = e.message || 'Import impossible.';
      }
      btn.disabled = false;
    },
  });
  return h('div', null, btn, input, msg);
}
