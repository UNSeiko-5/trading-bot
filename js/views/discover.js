// Découvertes : des faits sur ton cinéma, un « ce jour-là » et les jalons de ton journal.
import { filmHref } from '../film-ui.js';
import { CATS, dailyFact, facts, milestones, onThisDay } from '../insights.js';
import { pref, setPref } from '../prefs.js';
import { metaOf, state } from '../state.js';
import { card, empty, seg } from '../ui.js';
import { fmtDate, h, put } from '../util.js';

let cat = pref('factCat', 'all');

export const factCard = (f, big = false) => h(f.href ? 'a' : 'div', { class: `fact${big ? ' big' : ''}`, href: f.href || null, title: f.hint || null },
  h('span', { class: 'fact-cat' }, (CATS.find(([k]) => k === f.cat) || [])[1] || ''),
  h('span', { class: 'fact-big' }, f.big),
  h('span', { class: 'fact-text' }, f.text));

export const computeFacts = () => facts({ entries: state.entries, films: state.films, metaOf });

export function onThisDayCard(max = 6) {
  const hits = onThisDay(state.entries);
  if (!hits.length) return null;
  const byFilm = new Map(state.films.map((f) => [f.key, f]));
  return card('Ce jour-là', `Ce que tu regardais un ${fmtDate(new Date(), 'short')} les années précédentes`,
    h('div', { class: 'otd' }, hits.slice(0, max).map(({ entry, years }) => h('a', { class: 'otd-row', href: filmHref(entry.key) },
      h('span', { class: 'otd-y' }, `Il y a ${years} an${years > 1 ? 's' : ''}`),
      h('span', { class: 'otd-t' }, entry.title, entry.year ? h('small', null, ` (${entry.year})`) : null),
      byFilm.get(entry.key) && byFilm.get(entry.key).rating ? h('span', { class: 'muted' }, `${String(byFilm.get(entry.key).rating).replace('.', ',')} ★`) : null))));
}

export function discover(root) {
  if (!state.entries.length) return put(root, card('Découvertes', null, empty('Aucun film à analyser pour l’instant.')));
  const all = computeFacts();
  const today = dailyFact(all);
  const ms = milestones(state.entries);
  const grid = h('div', { class: 'facts' });
  const count = h('p', { class: 'muted', style: 'font-size:13px;margin:10px 0 12px', 'aria-live': 'polite' });
  const draw = () => {
    const list = cat === 'all' ? all : all.filter((f) => f.cat === cat);
    count.textContent = `${list.length} fait${list.length > 1 ? 's' : ''}${cat === 'all' && state.enrichment && state.enrichment.state === 'running' ? ' · de nouveaux faits apparaissent quand les métadonnées sont chargées' : ''}`;
    grid.replaceChildren(...(list.length ? list.map((f) => factCard(f)) : [empty('Pas encore assez de données dans cette catégorie.')]));
  };
  const present = CATS.filter(([k]) => all.some((f) => f.cat === k));
  put(root,
    today ? h('section', { class: 'card fact-hero' }, h('div', { class: 'eyebrow' }, 'Le saviez-tu ? Fait du jour'), factCard(today, true)) : null,
    onThisDayCard(),
    card('Tous les faits', 'Calculés sur ton journal ; chaque fait apparaît quand les données le permettent',
      h('div', { class: 'toolbar' }, seg([['all', 'Tous'], ...present], cat, (v) => { cat = v; setPref('factCat', v); draw(); })), count, grid),
    ms.length ? card('Jalons', 'Le film qui a marqué chaque palier de ton journal',
      h('ol', { class: 'miles' }, ms.slice().reverse().map(({ n, entry }) => h('li', null,
        h('span', { class: 'miles-n' }, n === 1 ? '1ᵉʳ' : `${n}ᵉ`),
        h('a', { href: filmHref(entry.key) }, entry.title, entry.year ? h('small', null, ` (${entry.year})`) : null),
        h('span', { class: 'muted' }, fmtDate(new Date(`${entry.date}T12:00:00`), 'med')))))) : null);
  draw();
}
