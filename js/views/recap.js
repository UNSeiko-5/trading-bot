// Bilans : semaine, mois, année ou tout l'historique, comparés à la période précédente.
import { barChart } from '../charts.js';
import { filmHref, tile } from '../film-ui.js';
import { films as groupFilms } from '../films.js';
import { pref, setPref } from '../prefs.js';
import { byGenre, dated, between, totals } from '../stats.js';
import { metaOf, state } from '../state.js';
import { card, delta, empty, kpi, seg } from '../ui.js';
import { addDays, dayKey, fmtDate, h, put, startOfDay, startOfWeek, toast } from '../util.js';
import { hm, num } from './dashboard.js';

let kind = pref('recapKind', 'month');
let offset = 0;

function bounds(minTs) {
  const now = new Date();
  if (kind === 'all') {
    const s = startOfDay(new Date(minTs));
    return { s, e: addDays(startOfDay(now), 1), ps: s, pe: s, label: 'Tout l’historique' };
  }
  if (kind === 'week') {
    const s = addDays(startOfWeek(now), offset * 7);
    return { s, e: addDays(s, 7), ps: addDays(s, -7), pe: s, label: `Semaine du ${fmtDate(s, 'short')} au ${fmtDate(addDays(s, 6), 'med')}` };
  }
  if (kind === 'year') {
    const y = now.getFullYear() + offset;
    return { s: new Date(y, 0, 1), e: new Date(y + 1, 0, 1), ps: new Date(y - 1, 0, 1), pe: new Date(y, 0, 1), label: String(y) };
  }
  const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { s, e: new Date(s.getFullYear(), s.getMonth() + 1, 1), ps: new Date(s.getFullYear(), s.getMonth() - 1, 1), pe: s, label: new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(s) };
}

function calendar(b, items) {
  const first = startOfWeek(b.s);
  const days = [];
  for (let d = first; d < b.e || d.getDay() !== 1; d = addDays(d, 1)) days.push(d);
  const today = dayKey(new Date());
  return card('Calendrier', null, h('div', { class: 'cal-grid' },
    ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((n) => h('div', { class: 'cal-h' }, n)),
    days.map((d) => {
      const its = between(items, d, addDays(d, 1));
      const out = d < b.s || d >= b.e;
      return h(its.length && !out ? 'a' : 'div', { class: `cal-d${out ? ' out' : ''}${dayKey(d) === today ? ' today' : ''}`, href: its.length && !out ? filmHref(its[0].key) : null, title: its.map((e) => e.title).join(', ') },
        !out && h('span', { class: 'n' }, d.getDate()),
        !out && its.length > 0 && h('span', { class: 'dots' }, its.slice(0, 4).map(() => h('span', { class: 'dot', style: 'background:var(--accent)' }))),
        !out && its.length > 0 && h('span', { class: 'k' }, `${its.length} film${its.length > 1 ? 's' : ''}`));
    })));
}

export function recap(root) {
  const all = dated(state.entries);
  if (!all.length) return put(root, card('Bilans', null, empty('Les bilans demandent des visionnages datés : importe ton export Letterboxd ou charge ton profil.')));
  const minTs = all.reduce((m, e) => Math.min(m, e.ts), Date.now());
  const wrap = h('div', { class: 'view' });
  const body = h('div', { class: 'view' });

  const draw = () => {
    const b = bounds(minTs);
    const items = between(all, b.s, b.e);
    const prev = between(all, b.ps, b.pe);
    const t = totals(items, metaOf), p = totals(prev, metaOf);
    const cmp = kind === 'all' ? '' : kind === 'week' ? 'vs sem. préc.' : kind === 'month' ? 'vs mois préc.' : 'vs année préc.';
    const fs = groupFilms(items);
    const genres = byGenre(fs, metaOf).slice(0, 6);
    const best = [...fs].filter((f) => f.rating).sort((x, y) => y.rating - x.rating || y.last - x.last).slice(0, 6);

    const buckets = [];
    if (kind === 'week') for (let i = 0; i < 7; i++) buckets.push({ label: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'][i], s: addDays(b.s, i), e: addDays(b.s, i + 1) });
    else if (kind === 'month') for (let d = new Date(b.s); d < b.e; d = addDays(d, 7)) buckets.push({ label: fmtDate(d, 'short'), s: d, e: addDays(d, 7) > b.e ? b.e : addDays(d, 7) });
    else if (kind === 'year') for (let m = 0; m < 12; m++) buckets.push({ unit: 'month', label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(new Date(b.s.getFullYear(), m, 1)), s: new Date(b.s.getFullYear(), m, 1), e: new Date(b.s.getFullYear(), m + 1, 1) });
    else {
      const now = new Date();
      const months = (now.getFullYear() - b.s.getFullYear()) * 12 + now.getMonth() - b.s.getMonth() + 1;
      if (months <= 24) for (let i = 0; i < months; i++) buckets.push({ unit: 'month', label: new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' }).format(new Date(b.s.getFullYear(), b.s.getMonth() + i, 1)), s: new Date(b.s.getFullYear(), b.s.getMonth() + i, 1), e: new Date(b.s.getFullYear(), b.s.getMonth() + i + 1, 1) });
      else for (let y = b.s.getFullYear(); y <= now.getFullYear(); y++) buckets.push({ unit: 'year', label: String(y), s: new Date(y, 0, 1), e: new Date(y + 1, 0, 1) });
    }
    const chart = h('div');
    const summary = [`Bilan ${b.label}`, `${t.films} film${t.films > 1 ? 's' : ''}${t.minutes ? ` · ${hm(t.minutes)}` : ''}${t.avg ? ` · note moyenne ${num(t.avg, 2)} / 5` : ''}`, best.length ? `Mieux notés : ${best.slice(0, 3).map((f) => `${f.title} (${f.rating}★)`).join(', ')}` : ''].filter(Boolean).join('\n');

    const dive = (k) => {
      const now = new Date();
      if (kind === 'all') {
        if (k.unit === 'year') { offset = k.s.getFullYear() - now.getFullYear(); kind = 'year'; }
        else { offset = (k.s.getFullYear() - now.getFullYear()) * 12 + (k.s.getMonth() - now.getMonth()); kind = 'month'; }
      } else if (kind === 'year') { offset = (k.s.getFullYear() - now.getFullYear()) * 12 + (k.s.getMonth() - now.getMonth()); kind = 'month'; }
      else if (kind === 'month') { offset = Math.round((startOfWeek(k.s) - startOfWeek(now)) / (7 * 864e5)); kind = 'week'; }
      else return;
      build();
    };

    body.replaceChildren(
      h('div', { class: 'card-head' },
        h('h2', { style: 'font-size:20px;text-transform:capitalize' }, b.label),
        h('div', { class: 'toolbar' },
          h('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(summary); toast('Résumé copié.'); } catch { toast('Copie impossible.'); } } }, 'Copier le résumé'),
          h('div', { class: 'nav-arrows' },
            h('button', { class: 'btn sm', 'aria-label': 'Période précédente', disabled: kind === 'all', onclick: () => { offset--; draw(); } }, '←'),
            h('button', { class: 'btn sm', 'aria-label': 'Période suivante', disabled: kind === 'all' || offset >= 0, onclick: () => { offset++; draw(); } }, '→')))),
      !items.length ? empty('Aucun film sur cette période.') : h('div', { class: 'view' },
        h('div', { class: 'grid cols-4' },
          kpi({ label: 'Films', value: num(t.films), sub: kind === 'all' ? null : delta(t.films, p.films, cmp) }),
          kpi({ label: 'Temps de cinéma', value: t.minutes ? hm(t.minutes) : '—', sub: kind === 'all' || !t.minutes ? null : delta(t.minutes, p.minutes, cmp) }),
          kpi({ label: 'Note moyenne', value: t.avg ? num(t.avg, 2) : '—', unit: t.avg ? '/ 5' : '', sub: h('span', { class: 'muted' }, `${t.rated} noté${t.rated > 1 ? 's' : ''}`) }),
          kpi({ label: 'Coups de cœur', value: String(t.likes), sub: h('span', { class: 'muted' }, `${t.fives} à 5 ★`) })),
        kind === 'month' ? calendar(b, items) : null,
        h('div', { class: 'grid cols-32' },
          card('Répartition', `Films par ${kind === 'week' ? 'jour' : kind === 'month' ? 'semaine' : kind === 'all' ? (buckets[0] && buckets[0].unit === 'year' ? 'année' : 'mois') : 'mois'} · clique une barre pour zoomer`, chart),
          card('Faits marquants', null,
            genres.length > 0 && h('div', { class: 'legend', style: 'margin-bottom:12px' }, genres.map((g) => h('span', null, h('span', { class: 'dot', style: 'background:var(--accent)' }), `${g.name} · ${g.count}`))),
            h('p', { style: 'margin-bottom:8px' }, h('b', null, new Set(items.map((e) => dayKey(e.ts))).size), ' jours avec un film'),
            t.rewatches > 0 && h('p', { style: 'margin-bottom:8px' }, h('b', null, t.rewatches), ` revisionnage${t.rewatches > 1 ? 's' : ''}`),
            t.reviews > 0 && h('p', null, h('b', null, t.reviews), ` avis écrit${t.reviews > 1 ? 's' : ''}`))),
        best.length ? card('Les mieux notés', null, h('div', { class: 'tiles' }, best.map((f) => tile(f)))) : null,
        card('Tous les films', `${fs.length} film${fs.length > 1 ? 's' : ''} sur la période`, h('div', { class: 'tiles' }, fs.slice(0, 60).map((f) => tile(f))), fs.length > 60 ? h('p', { class: 'muted', style: 'margin-top:8px;font-size:13px' }, `… et ${fs.length - 60} autres : voir le journal.`) : null)));
    if (items.length) {
      requestAnimationFrame(() => barChart(chart, {
        height: 210, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, onSelect: (d) => dive(d.k),
        data: buckets.map((k) => ({ k, label: k.label, value: between(items, k.s, k.e).length, tip: `<b>${k.label}</b><br>${between(items, k.s, k.e).length} film${between(items, k.s, k.e).length > 1 ? 's' : ''}` })),
      }));
    }
  };
  const build = () => {
    wrap.replaceChildren(h('div', { class: 'toolbar' }, seg([['week', 'Semaine'], ['month', 'Mois'], ['year', 'Année'], ['all', 'Tout']], kind, (v) => { kind = v; setPref('recapKind', v); offset = 0; draw(); })), card(null, null, body));
    draw();
  };
  put(root, wrap);
  build();
}
