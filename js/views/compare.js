// Comparer deux périodes : films, temps, note moyenne, genres et courbe cumulée.
import { lineChart } from '../charts.js';
import { films as groupFilms } from '../films.js';
import { between, byGenre, dated, totals } from '../stats.js';
import { metaOf, state } from '../state.js';
import { card, delta, empty } from '../ui.js';
import { addDays, fmtDate, h, put, startOfDay, startOfWeek } from '../util.js';
import { hm, num } from './dashboard.js';

const COLOR = { a: '#7c5cff', b: '#2f80ed' };
const tag = (c, text) => h('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, h('span', { class: 'dot', style: `background:${c}` }), text);
const monthName = (d) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);

function presets(now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const day = startOfDay(now), tomorrow = addDays(day, 1), monday = startOfWeek(now);
  const span = Math.round((tomorrow - monday) / 864e5);
  return [
    ['week', 'Cette semaine vs la précédente', { from: monday, to: tomorrow, label: 'Cette semaine' }, { from: addDays(monday, -7), to: addDays(monday, -7 + span), label: 'Semaine précédente (même durée)' }],
    ['month', 'Ce mois vs le mois précédent', { from: new Date(y, m, 1), to: tomorrow, label: monthName(new Date(y, m, 1)) }, { from: new Date(y, m - 1, 1), to: new Date(y, m - 1, Math.min(day.getDate(), new Date(y, m, 0).getDate()) + 1), label: `${monthName(new Date(y, m - 1, 1))} (même durée)` }],
    ['d30', '30 derniers jours vs les 30 précédents', { from: addDays(day, -29), to: tomorrow, label: '30 derniers jours' }, { from: addDays(day, -59), to: addDays(day, -29), label: '30 jours précédents' }],
    ['year', 'Cette année vs l’an dernier (même période)', { from: new Date(y, 0, 1), to: tomorrow, label: String(y) }, { from: new Date(y - 1, 0, 1), to: new Date(y - 1, m, day.getDate() + 1), label: `${y - 1} (même période)` }],
    ['years', `${y - 1} vs ${y - 2} (années entières)`, { from: new Date(y - 1, 0, 1), to: new Date(y, 0, 1), label: String(y - 1) }, { from: new Date(y - 2, 0, 1), to: new Date(y - 1, 0, 1), label: String(y - 2) }],
  ];
}

function cumulative(entries, from, to) {
  const days = Math.max(1, Math.round((+to - +from) / 864e5));
  const per = Array(days).fill(0);
  for (const e of entries) if (e.ts >= +from && e.ts < +to) per[Math.min(days - 1, Math.floor((e.ts - +from) / 864e5))]++;
  let c = 0;
  return per.map((v, i) => ({ x: i + 1, y: (c += v) }));
}

export function compare(root) {
  const all = dated(state.entries);
  if (all.length < 2) return put(root, card('Comparer', null, empty('Il faut des visionnages datés pour comparer deux périodes.')));
  const list = presets();
  let key = 'month';
  const custom = { a: [null, null], b: [null, null] };
  const out = h('div', { class: 'stack' });
  const sel = h('select', { 'aria-label': 'Comparaison', onchange: (e) => { key = e.target.value; customBox.style.display = key === 'custom' ? '' : 'none'; show(); } }, [...list.map(([k, l]) => h('option', { value: k }, l)), h('option', { value: 'custom' }, 'Personnalisée…')]);
  sel.value = key;
  const inputs = ['a', 'b'].map((w) => [0, 1].map((i) => h('input', { type: 'date', 'aria-label': `Période ${w.toUpperCase()} ${i ? 'fin' : 'début'}`, onchange: (e) => { custom[w][i] = e.target.value; show(); } })));
  const customBox = h('div', { class: 'grid cols-2', style: 'margin-top:12px;display:none' },
    h('div', { class: 'field' }, tag(COLOR.a, 'Période A'), h('div', { class: 'toolbar' }, inputs[0][0], '→', inputs[0][1])),
    h('div', { class: 'field' }, tag(COLOR.b, 'Période B'), h('div', { class: 'toolbar' }, inputs[1][0], '→', inputs[1][1])));

  const range = () => {
    if (key !== 'custom') { const [, , a, b] = list.find(([k]) => k === key); return { a, b }; }
    const mk = ([f, t]) => (f && t && f <= t ? { from: new Date(`${f}T00:00:00`), to: new Date(new Date(`${t}T00:00:00`).getTime() + 864e5), label: `${fmtDate(new Date(`${f}T00:00:00`), 'med')} → ${fmtDate(new Date(`${t}T00:00:00`), 'med')}` } : null);
    return { a: mk(custom.a), b: mk(custom.b) };
  };
  const show = () => {
    const { a, b } = range();
    if (!a || !b) return out.replaceChildren(empty('Choisis le début et la fin des deux périodes.'));
    const items = (p) => between(all, p.from, p.to);
    const A = items(a), B = items(b);
    const tA = totals(A, metaOf), tB = totals(B, metaOf);
    const top = (es) => byGenre(groupFilms(es), metaOf).slice(0, 3).map((g) => `${g.name} (${g.count})`).join(', ') || '—';
    const rows = [
      ['Films', tA.films, tB.films, (v) => String(v)],
      ['Visionnages', tA.views, tB.views, (v) => String(v)],
      ['Temps de cinéma', tA.minutes, tB.minutes, hm],
      ['Revisionnages', tA.rewatches, tB.rewatches, (v) => String(v)],
      ['Coups de cœur', tA.likes, tB.likes, (v) => String(v)],
      ['Films à 5 ★', tA.fives, tB.fives, (v) => String(v)],
    ];
    const box = h('div');
    const diff = tA.films - tB.films;
    out.replaceChildren(
      card('Résultat', `${a.label} : ${tA.films} film${tA.films > 1 ? 's' : ''} contre ${tB.films} pour ${b.label.toLowerCase()}${tB.films ? ` (${diff >= 0 ? '+' : '−'}${Math.abs(Math.round((diff / tB.films) * 100))} %)` : ''}.`,
        h('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Tableau de comparaison (défilable)' }, h('table', { class: 'laps cmp' },
          h('thead', null, h('tr', null, h('th', null, 'Indicateur'), h('th', null, tag(COLOR.a, a.label)), h('th', null, tag(COLOR.b, b.label)), h('th', null, 'Écart'))),
          h('tbody', null,
            ...rows.map(([k, x, y, f]) => h('tr', null, h('td', null, k), h('td', null, x ? f(x) : '—'), h('td', null, y ? f(y) : '—'), h('td', null, y > 0 ? delta(x, y, '') : '—'))),
            h('tr', null, h('td', null, 'Note moyenne'), h('td', null, tA.avg ? `${num(tA.avg, 2)} / 5` : '—'), h('td', null, tB.avg ? `${num(tB.avg, 2)} / 5` : '—'), h('td', null, tA.avg && tB.avg ? `${tA.avg - tB.avg >= 0 ? '+' : '−'}${num(Math.abs(tA.avg - tB.avg), 2)}` : '—')),
            h('tr', null, h('td', null, 'Genres dominants'), h('td', null, top(A)), h('td', null, top(B)), h('td', null, '')))))),
      card('Films cumulés', 'Jour après jour depuis le début de chaque période', box,
        h('div', { class: 'legend', style: 'margin-top:8px' }, h('span', null, h('span', { class: 'dot', style: `background:${COLOR.a}` }), a.label), h('span', null, h('span', { class: 'dot', style: `background:${COLOR.b}` }), b.label))));
    const ca = cumulative(all, a.from, a.to), cb = cumulative(all, b.from, b.to);
    requestAnimationFrame(() => lineChart(box, { height: 220, yMin: 0, series: [{ name: 'A', color: COLOR.a, points: ca, width: 2.6 }, { name: 'B', color: COLOR.b, points: cb, width: 2.2 }], xFormat: (d) => `Jour ${Math.round(d)}`, yFormat: (v) => `${Math.round(v)} film${v >= 2 ? 's' : ''}` }));
  };
  show();
  put(root, card('Comparer deux périodes', 'Même durée pour que l’écart ait un sens', h('label', { class: 'field' }, 'Comparaison', sel), customBox), out);
}
