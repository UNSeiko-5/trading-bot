// Liste classée : nom, barre proportionnelle au nombre de films, note moyenne ; chaque ligne ouvre la liste de ses films.
import { starsEl } from './film-ui.js';
import { listModal } from './list-modal.js';
import { empty } from './ui.js';
import { h } from './util.js';

const num = (n, d = 1) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function rank(rows, { limit = 12, adjusted = false, unit = 'film', prefix, detail = true, count } = {}) {
  if (!rows.length) return empty('Pas assez de données pour cette liste.');
  const max = Math.max(...rows.map((r) => r.count));
  return h('div', { class: 'rank' }, rows.slice(0, limit).map((r) => {
    const note = adjusted ? r.adjusted : r.avg;
    const cells = [
      h('div', { class: 'rank-name' }, prefix ? prefix(r) : r.name),
      h('div', { class: 'rank-bar' }, h('div', { style: `width:${(r.count / max) * 100}%` })),
      h('div', { class: 'rank-n' }, count ? count(r) : `${r.count} ${unit}${r.count > 1 ? 's' : ''}`),
      h('div', { class: 'rank-avg' }, note ? [starsEl(Math.round(note * 2) / 2), h('small', null, num(note, 1))] : '—'),
    ];
    if (detail && r.films && r.films.length) {
      return h('button', { class: 'rank-row', type: 'button', onclick: () => listModal({ title: r.name, sub: `${r.films.length} film${r.films.length > 1 ? 's' : ''}${r.avg ? ` · note moyenne ${num(r.avg, 2)} / 5` : ''}`, films: r.films }), 'aria-label': `${r.name}, ${r.count} films : voir la liste` }, cells);
    }
    return h('div', { class: 'rank-row' }, cells);
  }));
}
