// Journal : tous les visionnages, avec recherche, filtres et tris.
import { exportCsv } from '../export.js';
import { filmHref, poster, starsEl } from '../film-ui.js';
import { ratingText } from '../films.js';
import { pref, setPref } from '../prefs.js';
import { metaOf, state } from '../state.js';
import { card } from '../ui.js';
import { fmtDate, fold, h, icon, put } from '../util.js';

const PAGE = 50;
const q = { text: '', year: pref('jYear', ''), rating: pref('jRating', ''), flag: pref('jFlag', ''), genre: '', sort: pref('jSort', 'date'), dir: pref('jDir', 'desc') };
const SORTS = {
  date: ['Date de visionnage', (e) => e.ts],
  rating: ['Note', (e) => e.rating || 0],
  title: ['Titre', (e) => fold(e.title)],
  year: ['Année de sortie', (e) => e.year || 0],
  runtime: ['Durée', (e) => (metaOf(e.key) || {}).runtime || 0],
};
const FLAGS = [['', 'Tous les visionnages'], ['rewatch', 'Revus'], ['liked', 'Aimés (♥)'], ['review', 'Avec un avis'], ['unrated', 'Sans note']];

function highlight(title) {
  const t = fold(q.text.trim());
  if (!t) return title;
  const f = fold(title);
  const i = f.length === title.length ? f.indexOf(t) : -1;
  return i < 0 ? title : [title.slice(0, i), h('mark', null, title.slice(i, i + t.length)), title.slice(i + t.length)];
}

export function journal(root) {
  const entries = state.entries;
  const years = [...new Set(entries.map((e) => new Date(e.ts).getFullYear()))].sort((a, b) => b - a);
  const genres = [...new Set(entries.flatMap((e) => (metaOf(e.key) || {}).genres || []))].sort();
  if (q.year && !years.includes(Number(q.year))) q.year = '';
  const list = h('div');
  const summary = h('div', { class: 'sum-line' });
  const narrow = matchMedia('(max-width: 820px)');

  const filtered = () => {
    const text = fold(q.text.trim());
    const f = SORTS[q.sort][1];
    const sign = q.dir === 'desc' ? 1 : -1;
    return entries.filter((e) => {
      if (q.year && new Date(e.ts).getFullYear() !== Number(q.year)) return false;
      if (q.rating && !(q.rating === 'none' ? !e.rating : e.rating && e.rating >= Number(q.rating))) return false;
      if (q.flag === 'rewatch' && !e.rewatch) return false;
      if (q.flag === 'liked' && !e.liked) return false;
      if (q.flag === 'review' && !e.review) return false;
      if (q.flag === 'unrated' && e.rating) return false;
      if (q.genre && !((metaOf(e.key) || {}).genres || []).includes(q.genre)) return false;
      if (text && !fold(`${e.title} ${e.year || ''} ${((metaOf(e.key) || {}).directors || []).join(' ')}`).includes(text)) return false;
      return true;
    }).sort((a, b) => { const x = f(a), y = f(b); return (x < y ? 1 : x > y ? -1 : 0) * sign || b.ts - a.ts; });
  };

  const render = (limit = PAGE, focusAt = -1) => {
    const rows = filtered();
    const mins = rows.reduce((s, e) => s + ((metaOf(e.key) || {}).runtime || 0), 0);
    const rated = rows.filter((e) => e.rating);
    summary.replaceChildren(h('span', null, h('b', null, rows.length), ` visionnage${rows.length > 1 ? 's' : ''}`), mins ? h('span', null, h('b', null, `${Math.floor(mins / 60)} h`), ' de cinéma') : null, rated.length ? h('span', null, h('b', null, (rated.reduce((s, e) => s + e.rating, 0) / rated.length).toFixed(2).replace('.', ',')), ' de moyenne') : null);
    if (!rows.length) return list.replaceChildren(h('div', { class: 'empty' }, h('p', null, 'Aucun film ne correspond à ces filtres.'), h('p', { style: 'margin-top:12px' }, h('button', { class: 'btn sm', type: 'button', onclick: reset }, 'Réinitialiser les filtres'))));
    const more = rows.length <= limit ? null : h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => render(limit + PAGE, limit) }, `Afficher plus (${rows.length - limit})`));
    const paint = (...kids) => {
      list.replaceChildren(...kids.filter(Boolean));
      if (focusAt >= 0) list.querySelectorAll('tbody tr, .row-item')[focusAt]?.focus();
    };
    const badges = (e) => [e.rewatch && h('span', { class: 'pill ok', title: 'Revu' }, '↻'), e.liked && h('span', { class: 'pill', style: 'color:var(--bad-text)', title: 'Aimé' }, '♥'), e.review && h('span', { class: 'pill ok', title: 'Avec un avis' }, '✎'), e.approx && h('span', { class: 'pill warn', title: 'Date de marquage, pas de visionnage' }, '≈')];
    if (narrow.matches) {
      return paint(h('div', null, rows.slice(0, limit).map((e) => h('a', { class: 'item row-item', href: filmHref(e.key) },
        poster(e, 'xs'), h('div', null, h('div', { class: 't' }, e.title, ' ', badges(e)), h('div', { class: 's' }, `${e.year || ''} · ${fmtDate(e.ts, 'med')}`)), h('div', { class: 'r' }, starsEl(e.rating) || '—')))), more);
    }
    const th = (label, key, cls) => h('th', { class: `sortable ${cls || ''}`, tabindex: '0', 'aria-sort': q.sort === key ? (q.dir === 'desc' ? 'descending' : 'ascending') : null, title: `Trier par ${label.toLowerCase()}`, onclick: () => sortBy(key), onkeydown: (ev) => (ev.key === 'Enter' || ev.key === ' ') && (ev.preventDefault(), sortBy(key)) }, label, q.sort === key ? h('span', { 'aria-hidden': 'true' }, q.dir === 'desc' ? ' ↓' : ' ↑') : null);
    const table = h('table', { class: 'acts journal-table' },
      h('thead', null, h('tr', null, th('Film', 'title'), th('Réalisateur', 'x', 'hide-s'), th('Note', 'rating'), th('Sortie', 'year', 'hide-s'), th('Durée', 'runtime', 'hide-s'), th('Vu le', 'date'))),
      h('tbody', null, rows.slice(0, limit).map((e) => {
        const m = metaOf(e.key) || {};
        return h('tr', { tabindex: 0, onclick: () => (location.hash = filmHref(e.key)), onkeydown: (ev) => ev.key === 'Enter' && (location.hash = filmHref(e.key)) },
          h('td', null, h('div', { style: 'display:flex;align-items:center;gap:12px;min-width:0' }, poster(e, 'xs'), h('div', { class: 'name' }, h('b', null, highlight(e.title), ' ', badges(e)), h('span', null, (m.genres || []).join(' · ') || ' ')))),
          h('td', { class: 'hide-s left' }, (m.directors || []).slice(0, 2).join(', ') || '—'),
          h('td', null, starsEl(e.rating) || '—'),
          h('td', { class: 'hide-s' }, e.year || '—'),
          h('td', { class: 'hide-s' }, m.runtime ? `${Math.floor(m.runtime / 60)} h ${String(m.runtime % 60).padStart(2, '0')}` : '—'),
          h('td', null, fmtDate(e.ts, 'med')));
      })));
    paint(table, more);
  };

  const sortBy = (key) => {
    if (!SORTS[key]) return;
    if (q.sort === key) q.dir = q.dir === 'desc' ? 'asc' : 'desc';
    else { q.sort = key; q.dir = key === 'title' ? 'asc' : 'desc'; }
    setPref('jSort', q.sort);
    setPref('jDir', q.dir);
    selSort.value = q.sort;
    render();
  };
  const sel = (opts, value, onChange, label) => h('select', { 'aria-label': label, onchange: (e) => { onChange(e.target.value); render(); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value) }, l)));
  const search = h('input', { type: 'search', placeholder: 'Rechercher un film, un réalisateur…', value: q.text, 'aria-label': 'Rechercher dans le journal', oninput: (e) => { q.text = e.target.value; render(); } });
  const yearSel = sel([['', 'Toutes les années'], ...years.map((y) => [y, String(y)])], q.year, (v) => { q.year = v; setPref('jYear', v); }, 'Année');
  const ratingSel = sel([['', 'Toutes les notes'], ['4.5', '4,5 ★ et plus'], ['4', '4 ★ et plus'], ['3', '3 ★ et plus'], ['none', 'Sans note']], q.rating, (v) => { q.rating = v; setPref('jRating', v); }, 'Note');
  const flagSel = sel(FLAGS, q.flag, (v) => { q.flag = v; setPref('jFlag', v); }, 'Type de visionnage');
  const genreSel = sel([['', 'Tous les genres'], ...genres.map((g) => [g, g])], q.genre, (v) => (q.genre = v), 'Genre');
  const selSort = sel(Object.entries(SORTS).map(([k, v]) => [k, v[0]]), q.sort, (v) => { q.sort = v; setPref('jSort', v); }, 'Trier par');
  const dirBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Inverser le tri', title: 'Inverser le tri', onclick: () => { q.dir = q.dir === 'desc' ? 'asc' : 'desc'; setPref('jDir', q.dir); render(); }, html: icon('up', 16) });
  const reset = () => {
    Object.assign(q, { text: '', year: '', rating: '', flag: '', genre: '', sort: 'date', dir: 'desc' });
    ['jYear', 'jRating', 'jFlag', 'jSort', 'jDir'].forEach((k) => setPref(k, undefined));
    search.value = ''; yearSel.value = ''; ratingSel.value = ''; flagSel.value = ''; genreSel.value = ''; selSort.value = 'date';
    render();
  };
  const onResize = () => (list.isConnected ? render() : narrow.removeEventListener('change', onResize));
  narrow.addEventListener('change', onResize);

  put(root, card(null, null,
    h('div', { class: 'toolbar', style: 'margin-bottom:12px' },
      h('div', { class: 'grow', html: icon('search', 16) }, search), yearSel, ratingSel, flagSel, genres.length ? genreSel : null, selSort, dirBtn,
      h('button', { class: 'btn', type: 'button', onclick: () => exportCsv(filtered(), 'clap-selection.csv'), html: `${icon('download', 16)}<span>Exporter</span>` })),
    summary, list));
  render();
}
