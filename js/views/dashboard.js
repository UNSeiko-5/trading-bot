import { barChart, calendarChart, donut, ring } from '../charts.js';
import { tile } from '../film-ui.js';
import { HOW_TO, importButton } from '../import-ui.js';
import { byGenre, dated, histogram, perMonth, streaks, totals } from '../stats.js';
import { metaOf, state } from '../state.js';
import { dailyFact } from '../insights.js';
import { card, delta, empty, kpi, topo } from '../ui.js';
import { addDays, dayKey, fmtDate, h, put, startOfWeek } from '../util.js';
import { computeFacts, factCard, onThisDayCard } from './discover.js';

export const hm = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')}` : `${Math.round(min)} min`);
export const num = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const GENRE_COLORS = ['#7c5cff', '#2f80ed', '#10b0a0', '#f2a516', '#e5484d', '#7c9a2d', '#d6409f', '#8b8680'];

function hero(entries, tot) {
  const now = new Date();
  const y = now.getFullYear();
  const thisYear = dated(entries).filter((e) => new Date(e.ts).getFullYear() === y);
  const lastYearSame = dated(entries).filter((e) => { const d = new Date(e.ts); return d.getFullYear() === y - 1 && d < new Date(y - 1, now.getMonth(), now.getDate() + 1); });
  const yt = totals(thisYear, metaOf);
  const goal = state.settings.goal;
  const hour = now.getHours();
  const name = state.settings.username;
  const ringItem = (label, color, value, target, big, small, meta) =>
    h('div', { class: 'ring-item' }, ring({ value: target > 0 ? Math.min(1, value / target) : value > 0 ? 1 : 0, color, center: [big, small] }), h('div', { class: 'ring-label' }, label), h('div', { class: 'ring-meta' }, meta));
  const films = new Set(thisYear.map((e) => e.key)).size;
  const target = goal || new Set(lastYearSame.map((e) => e.key)).size || 0;
  return h('section', { class: 'card hero-card' },
    topo(3, 12),
    h('div', null,
      h('div', { class: 'eyebrow' }, `Année ${y}`),
      h('h2', { class: 'hello' }, hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour', name ? [' ', h('span', { class: 'serif' }, name)] : '', '.'),
      h('p', { class: 'hero-sub' }, thisYear.length ? `${films} film${films > 1 ? 's' : ''} vu${films > 1 ? 's' : ''} depuis le 1ᵉʳ janvier${thisYear.length > films ? ` (${thisYear.length} visionnages)` : ''}${yt.minutes ? `, soit ${hm(yt.minutes)} de cinéma` : ''}.` : 'Aucun film enregistré cette année pour l’instant.')),
    h('div', { class: 'rings' },
      ringItem('Films', 'var(--accent)', films, target, String(films), 'films', goal ? [h('span', null, `${Math.round((films / goal) * 100)} % de ton objectif`), h('span', null, `(${goal} films)`)] : target ? [h('span', null, `${Math.round((films / target) * 100)} % de l’an dernier`), h('span', null, '(à la même date)')] : h('span', null, 'fixe un objectif dans Objectifs')),
      ringItem('Heures', '#3b82f6', yt.minutes, 0, yt.minutes ? hm(yt.minutes).replace(' h ', ':').replace(' min', '') : '—', yt.minutes >= 60 ? 'h' : 'min', h('span', null, yt.coverage < 0.7 ? 'durées connues pour une partie des films' : `${num(yt.minutes / 60 / Math.max(1, thisYear.length) * 60, 0)} min par film`)),
      ringItem('Note moyenne', '#10b0a0', yt.avg || 0, 5, yt.avg ? num(yt.avg, 2) : '—', '/ 5', h('span', null, yt.rated ? `sur ${yt.rated} film${yt.rated > 1 ? 's' : ''} notés` : 'aucune note cette année'))));
}

function onboarding() {
  if (state.archiveAt || state.entries.length > 150) return null;
  return card('Retrouve tout ton historique', 'Le flux RSS public ne contient que tes ~100 derniers films. Importe ton export Letterboxd pour les statistiques complètes.',
    h('p', { class: 'muted', style: 'font-size:13.5px;margin-bottom:12px' }, HOW_TO),
    importButton({ label: 'Importer mon export', primary: true }));
}

function teasers() {
  const now = new Date();
  const fact = state.entries.length >= 10 ? dailyFact(computeFacts(), now) : null;
  const retroYear = now.getMonth() === 11 ? now.getFullYear() : now.getMonth() === 0 ? now.getFullYear() - 1 : 0;
  return [
    retroYear ? h('section', { class: 'callout good' }, h('b', null, `Ta rétrospective ${retroYear} est prête`), h('span', { style: 'font-size:13.5px' }, 'Les chiffres, les coups de cœur et une image à partager.'), h('div', null, h('a', { class: 'btn sm primary', href: '#/retro' }, 'Voir ma rétrospective'))) : null,
    fact ? h('section', { class: 'card fact-hero' }, h('div', { class: 'eyebrow' }, 'Le saviez-tu ?'), factCard(fact, true), h('div', { class: 'more' }, h('a', { class: 'btn sm', href: '#/decouvertes' }, 'Toutes les découvertes'))) : null,
    onThisDayCard(4),
  ];
}

export function dashboard(root) {
  const entries = state.entries;
  if (!entries.length) return put(root, card('Bienvenue', null, empty('Aucun film pour l’instant. Charge ton profil ou importe ton export depuis les Réglages.')));
  const tot = totals(entries, metaOf);
  const real = dated(entries);
  const st = streaks(real);
  const now = new Date();
  const monthAgo = (n) => real.filter((e) => e.ts >= +addDays(now, -n));
  const last30 = monthAgo(30).length, prev30 = real.filter((e) => e.ts < +addDays(now, -30) && e.ts >= +addDays(now, -60)).length;

  const months = perMonth(real, 12);
  const monthsBox = h('div');
  const calBox = h('div');
  const histBox = h('div');
  const genreBox = h('div', { class: 'donut-row' });
  const counts = new Map();
  for (const e of real) counts.set(dayKey(e.ts), (counts.get(dayKey(e.ts)) || 0) + 1);
  const hist = histogram(state.films);
  const genres = byGenre(state.films, metaOf).slice(0, 7);
  const rest = byGenre(state.films, metaOf).slice(7).reduce((s, g) => s + g.count, 0);
  const slices = [...genres.map((g, i) => ({ label: g.name, color: GENRE_COLORS[i], value: g.count })), ...(rest ? [{ label: 'Autres', color: GENRE_COLORS[7], value: rest }] : [])];

  requestAnimationFrame(() => {
    barChart(monthsBox, {
      height: 210, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v,
      data: months.map((m) => ({ label: new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(m.start), value: m.items.length, tip: `<b>${new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(m.start)}</b><br>${m.items.length} film${m.items.length > 1 ? 's' : ''}` })),
    });
    calendarChart(calBox, { values: counts, start: addDays(startOfWeek(now), -52 * 7), weeks: 53, keyOf: dayKey, format: (v) => `${v} film${v > 1 ? 's' : ''}` });
    barChart(histBox, {
      height: 180, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, labelEvery: 1,
      data: hist.map((b) => ({ label: String(b.rating).replace('.', ','), value: b.count, tip: `<b>${'★'.repeat(Math.floor(b.rating))}${b.rating % 1 ? '½' : ''}</b><br>${b.count} film${b.count > 1 ? 's' : ''}` })),
    });
    if (slices.length) donut(genreBox, { slices, format: (v) => `${v} film${v > 1 ? 's' : ''}`, center: [String(slices.reduce((s, x) => s + x.value, 0)), 'films'] });
    if (slices.length) genreBox.append(h('ul', null, slices.map((x) => h('li', null, h('span', { class: 'dot', style: `background:${x.color}` }), x.label, h('b', null, String(x.value))))));
  });

  put(root,
    hero(entries, tot),
    onboarding(),
    ...teasers(),
    h('div', { class: 'grid cols-4' },
      kpi({ label: 'Films vus', value: num(tot.films), sub: h('span', { class: 'muted' }, `${num(tot.views)} visionnages dont ${tot.rewatches} revus`) }),
      kpi({ label: '30 derniers jours', value: String(last30), sub: delta(last30, prev30, 'vs 30 j précédents') }),
      kpi({ label: 'Temps de cinéma', value: tot.minutes ? hm(tot.minutes) : '—', sub: h('span', { class: 'muted' }, tot.minutes ? `${Math.round(tot.coverage * 100)} % des durées connues` : 'durées en cours de chargement') }),
      kpi({ label: 'Note moyenne', value: tot.avg ? num(tot.avg, 2) : '—', unit: tot.avg ? '/ 5' : '', sub: h('span', { class: 'muted' }, `${num(tot.rated)} notés · ${num(tot.fives)} à 5 ★`) })),
    card('Derniers films', 'Tes dernières entrées de journal',
      h('div', { class: 'tiles' }, state.films.slice(0, 12).map((f) => tile(f))),
      h('div', { class: 'more' }, h('a', { class: 'btn sm', href: '#/journal' }, 'Tout le journal'))),
    h('div', { class: 'grid cols-2' },
      card('Films par mois', '12 derniers mois', monthsBox),
      card('Tes notes', `Répartition de tes ${num(tot.rated)} films notés`, histBox)),
    card('Régularité', `Série en cours : ${st.day} jour${st.day > 1 ? 's' : ''} · record ${st.bestDay} · ${st.week} semaine${st.week > 1 ? 's' : ''} d’affilée`, h('div', { class: 'scroll-x', tabindex: '0', role: 'region', 'aria-label': 'Calendrier des visionnages (défilable)' }, calBox)),
    slices.length ? card('Genres', 'Répartition de tes films par genre', genreBox) : null);
}
