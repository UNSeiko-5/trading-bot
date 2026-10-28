import { RssError, enrichAll, loadAll, refreshRss } from './data.js';
import { exportCsv } from './export.js';
import { importButton } from './import-ui.js';
import { openPalette } from './palette.js';
import { saveSettings, state } from './state.js';
import { seg, topo } from './ui.js';
import { animateCounts } from './ui.js';
import { tip } from './charts.js';
import { $, $$, h, icon, relTime, toast, typo } from './util.js';
import { compare } from './views/compare.js';
import { dashboard } from './views/dashboard.js';
import { filmModal } from './views/film.js';
import { goalsView } from './views/goals.js';
import { help, SHORTCUTS } from './views/help.js';
import { journal } from './views/journal.js';
import { recap } from './views/recap.js';
import { settings } from './views/settings.js';
import { statsView } from './views/stats.js';
import { tasteView } from './views/taste.js';
import { watchlist } from './views/watchlist.js';

const ROUTES = {
  '': { label: 'Tableau de bord', short: 'Accueil', icon: 'home', group: 'Principal', view: dashboard, sub: () => 'Ton année en films' },
  journal: { label: 'Journal', icon: 'film', group: 'Principal', view: journal, sub: () => 'Tous tes visionnages, filtrables' },
  bilans: { label: 'Bilans', icon: 'cal', group: 'Principal', view: recap, sub: () => 'Une semaine, un mois ou une année en films' },
  stats: { label: 'Statistiques', short: 'Stats', icon: 'chart', group: 'Analyse', view: statsView, sub: () => 'Genres, réalisateurs, pays, époques et durées' },
  profil: { label: 'Mon profil', icon: 'user', group: 'Analyse', view: tasteView, sub: () => 'Tes goûts en indices sur 100' },
  comparer: { label: 'Comparer', icon: 'trend', group: 'Analyse', view: compare, sub: () => 'Deux périodes côte à côte' },
  avoir: { label: 'À voir', icon: 'bookmark', group: 'Découvrir', view: watchlist, sub: () => 'Ta liste, classée selon tes goûts' },
  objectifs: { label: 'Objectifs', icon: 'target', group: 'Découvrir', view: goalsView, sub: () => 'Films de l’année, défis et trophées' },
  reglages: { label: 'Réglages', icon: 'sliders', group: 'Compte', view: settings, sub: () => 'Profil, import et données' },
  aide: { label: 'Aide', icon: 'help', group: 'Compte', view: help, sub: () => 'Prise en main, glossaire et raccourcis' },
};
const PRIMARY = ['', 'journal', 'bilans', 'avoir'];

const app = $('#app');
let viewEl = null;
let closeModal = null;
let baseRoute = '';
let dirty = false;
let started = false;

// ---------- Accueil ----------
function landing(error = '') {
  const user = h('input', { type: 'text', placeholder: 'ton pseudo Letterboxd', 'aria-label': 'Pseudo Letterboxd', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: new URLSearchParams(location.search).get('u') || '', onkeydown: (e) => e.key === 'Enter' && go.click() });
  const msg = h('p', { class: 'muted', role: 'status', style: 'min-height:20px;margin-top:10px;font-size:13.5px' }, error);
  if (error) msg.style.color = 'var(--bad-text)';
  const go = h('button', { class: 'btn primary lg', type: 'button', onclick: async () => {
    const name = user.value.trim().replace(/^@|^https?:\/\/(www\.)?letterboxd\.com\//i, '').replace(/\/.*$/, '');
    if (!name) { msg.style.color = 'var(--bad-text)'; msg.textContent = 'Indique ton pseudo Letterboxd (celui de letterboxd.com/pseudo).'; return; }
    go.disabled = true;
    msg.style.color = '';
    msg.textContent = 'Lecture de ton profil…';
    try {
      saveSettings({ username: name });
      await refreshRss(name);
      start();
    } catch (e) {
      go.disabled = false;
      msg.style.color = 'var(--bad-text)';
      msg.textContent = e instanceof RssError ? e.message : 'Une erreur est survenue, réessaie.';
    }
  } }, 'Voir mes statistiques');
  const feat = (ic, t, d) => h('div', { class: 'card' }, h('div', { class: 'ficon', html: icon(ic, 22) }), h('h2', null, t), h('p', null, d));
  app.replaceChildren(
    h('main', { class: 'welcome' },
      topo(4, 16),
      h('div', { class: 'welcome-in' },
        h('div', { class: 'hero' },
          h('div', { class: 'brand' }, h('img', { src: 'assets/icon.svg', alt: '' }), h('span', null, 'Clap')),
          h('span', { class: 'pill-eyebrow' }, h('span', { class: 'dot' }), 'Pour celles et ceux qui tiennent un journal de films'),
          h('h1', { html: 'Ton cinéma, <em>enfin en chiffres</em>.' }),
          h('p', null, 'Statistiques, profil de goût, bilans, objectifs et liste à voir classée selon tes notes : tout ce que ton journal Letterboxd peut te dire, sans connexion ni compte.'),
          h('div', { class: 'user-form' }, user, go),
          msg,
          h('div', { class: 'import-alt' }, h('p', { class: 'muted' }, 'Pour tout ton historique : importe l’export de tes données Letterboxd.'), importButton({ label: 'Importer mon export' })),
          h('div', { class: 'trust' }, h('span', { html: `${icon('lock', 15)}Aucun mot de passe` }), h('span', { html: `${icon('eye', 15)}Profil public en lecture` }), h('span', { html: `${icon('shield', 15)}Données gardées dans ton navigateur` }))),
        h('div', { class: 'feat' },
          feat('film', 'Statistiques complètes', 'Genres, réalisateurs, acteurs, pays, décennies, durées, records et heures de cinéma.'),
          feat('user', 'Profil de goût', 'Huit indices sur 100 : diversité, cinéma du monde, classiques, sévérité de tes notes…'),
          feat('bookmark', 'À voir, classé pour toi', 'Ta liste d’envies triée par affinité, et « que regarder ce soir ? » en un clic.'),
          feat('target', 'Objectifs et trophées', 'Films de l’année, tour du monde, voyage dans le temps, séries de visionnages.')),
        h('p', { style: 'text-align:center;font-size:12px;margin-top:18px', class: 'muted' }, 'Clap n’est pas affilié à Letterboxd. Données de films : TMDB et Wikidata.'))));
  if (new URLSearchParams(location.search).get('u')) go.click();
}

// ---------- Coque ----------
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: 'monitor', light: 'sun', dark: 'moon' };
const THEME_LABEL = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };

function cycleTheme() {
  saveSettings({ theme: THEMES[(THEMES.indexOf(state.settings.theme) + 1) % THEMES.length] });
  refresh();
}

function openSearch() {
  openPalette({
    pages: Object.entries(ROUTES).map(([k, v]) => ({ label: v.label, hash: `#/${k}` })),
    actions: [
      ...(state.settings.username ? [{ label: 'Mettre à jour depuis mon profil Letterboxd', run: () => resync() }] : []),
      { label: 'Changer de thème (automatique, clair, sombre)', run: cycleTheme },
      { label: 'Exporter mon journal en CSV', run: () => exportCsv() },
      { label: 'Afficher les raccourcis clavier', run: openShortcuts },
    ],
  });
}

function openSheet() {
  const prev = document.activeElement;
  const close = () => { document.removeEventListener('keydown', onKey); back.remove(); sheet.remove(); if (prev && prev.isConnected) prev.focus(); };
  const onKey = (e) => e.key === 'Escape' && close();
  const back = h('div', { class: 'sheet-back', onclick: close });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Autres pages' },
    h('div', { class: 'grab' }),
    h('div', { class: 'sheet-grid' }, Object.entries(ROUTES).filter(([k]) => !PRIMARY.includes(k)).map(([k, v]) => h('a', { href: `#/${k}`, 'aria-current': baseRoute === k ? 'page' : null, onclick: close, html: `${icon(v.icon, 22)}<span>${v.label}</span>` }))));
  document.addEventListener('keydown', onKey);
  document.body.append(back, sheet);
  sheet.querySelector('a').focus();
}

function shell() {
  const link = (key, v, short) => h('a', { href: `#/${key}`, 'data-r': key, title: v.label, html: `${icon(v.icon, short ? 22 : 19)}<span>${short ? v.short || v.label : v.label}</span>` });
  const groups = [...new Set(Object.values(ROUTES).map((r) => r.group))];
  app.replaceChildren(
    h('button', { class: 'skip', type: 'button', onclick: () => viewEl && viewEl.focus() }, 'Aller au contenu'),
    h('div', { class: 'shell' },
      h('aside', { class: 'side' },
        h('div', { class: 'brand' }, h('img', { src: 'assets/icon.svg', alt: '' }), h('span', null, 'Clap')),
        h('nav', { class: 'nav', 'aria-label': 'Navigation principale' }, groups.map((g) => [h('div', { class: 'nav-label' }, g), Object.entries(ROUTES).filter(([, r]) => r.group === g).map(([k, v]) => link(k, v))])),
        h('div', { class: 'side-foot' },
          h('div', { class: 'who' }, h('div', { class: 'avatar' }, (state.settings.username || 'C')[0].toUpperCase()), h('div', { class: 'name' }, state.settings.username || 'Mon journal')),
          h('div', { class: 'sync', id: 'sync', 'aria-live': 'polite' }),
          h('div', { id: 'enrich' }),
          h('span', { class: 'credit' }, 'Données TMDB et Wikidata'))),
      h('div', { class: 'main' },
        h('header', { class: 'top' },
          h('div', { class: 'top-title' }, h('h1', { id: 'title' }), h('p', { class: 'sub', id: 'subtitle' })),
          h('button', { class: 'search-btn', type: 'button', onclick: openSearch, 'aria-label': 'Rechercher', html: `${icon('search', 16)}<span>Rechercher</span><span class="kbd">${isMac ? '⌘' : 'Ctrl'} K</span>` }),
          h('button', { class: 'icon-btn theme-btn', type: 'button', title: THEME_LABEL[state.settings.theme], 'aria-label': `${THEME_LABEL[state.settings.theme]} (changer)`, onclick: cycleTheme, html: icon(THEME_ICON[state.settings.theme] || 'monitor', 18) }),
          state.settings.username && h('button', { class: 'icon-btn', id: 'refresh-btn', type: 'button', title: 'Mettre à jour depuis Letterboxd', 'aria-label': 'Mettre à jour depuis Letterboxd', onclick: () => resync(), html: icon('refresh', 18) })),
        h('div', { id: 'banner' }),
        h('main', { id: 'view', class: 'view', tabindex: '-1' })),
      h('nav', { class: 'tabbar', 'aria-label': 'Navigation' }, PRIMARY.map((k) => link(k, ROUTES[k], true)), h('button', { type: 'button', id: 'more-btn', 'aria-haspopup': 'dialog', onclick: openSheet, html: `${icon('more', 22)}<span>Plus</span>` }))));
  viewEl = $('#view');
  const top = $('.top');
  if ('ResizeObserver' in window) new ResizeObserver(() => document.documentElement.style.setProperty('--top-h', `${top.offsetHeight}px`)).observe(top);
  updateStatus();
  updateBanner();
}

function updateStatus() {
  const side = $('#sync');
  if (side) {
    side.innerHTML = state.syncing ? `<span class="spin">${icon('refresh', 16)}</span> Mise à jour…` : state.lastRss ? `<span title="Dernière lecture du flux RSS">${icon('check', 14)} Mis à jour ${relTime(state.lastRss)}</span>` : '';
  }
  const rb = $('#refresh-btn');
  if (rb) rb.classList.toggle('busy', state.syncing);
  const e = state.enrichment;
  const box = $('#enrich');
  if (!box) return;
  if (!e || !e.total || e.state === 'done' || e.done >= e.total) return box.replaceChildren();
  const pct = Math.round((e.done / e.total) * 100);
  box.replaceChildren(h('div', { class: 'muted', style: 'font-size:12px;margin-bottom:5px' }, `${e.state === 'paused' ? 'En pause' : 'Infos des films'} · ${e.done}/${e.total}`), h('div', { class: 'bar-track', style: 'height:5px' }, h('div', { class: 'bar-fill', style: `width:${pct}%` })));
}

function updateBanner() {
  const box = $('#banner');
  if (!box) return;
  if (!navigator.onLine) box.replaceChildren(h('div', { class: 'banner', role: 'status' }, 'Hors ligne : tu consultes les données enregistrées sur cet appareil.'));
  else if (state.syncError) box.replaceChildren(h('div', { class: 'banner bad', role: 'alert' }, state.syncError, h('button', { class: 'btn sm', onclick: () => resync() }, 'Réessayer')));
  else box.replaceChildren();
}

// ---------- Routage ----------
function render() {
  if (!viewEl) return;
  dirty = false;
  tip.hide();
  const def = ROUTES[baseRoute] || ROUTES[''];
  $('#title').textContent = def.label;
  $('#subtitle').textContent = def.sub();
  document.title = `${def.label} — Clap`;
  $$('[data-r]').forEach((a) => (a.dataset.r === baseRoute ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  const more = $('#more-btn');
  if (more) (PRIMARY.includes(baseRoute) ? more.removeAttribute('aria-current') : more.setAttribute('aria-current', 'true'));
  viewEl.replaceChildren();
  viewEl.classList.remove('enter');
  try {
    def.view(viewEl, { rerender: refresh, reload });
  } catch (e) {
    console.error(e);
    viewEl.append(h('div', { class: 'card empty' }, 'Une erreur est survenue lors de l’affichage de cette page.'));
  }
  [...viewEl.children].slice(0, 14).forEach((c, i) => c.style.setProperty('--i', i));
  void viewEl.offsetWidth;
  viewEl.classList.add('enter');
  animateCounts(viewEl);
  typo(viewEl);
}

function route(focus = false) {
  const m = location.hash.replace(/^#\/?/, '').split('/');
  const wasOpen = Boolean(closeModal);
  closeModal?.();
  closeModal = null;
  if (m[0] === 'film' && m[1]) {
    if (!viewEl.childElementCount) render();
    let key = m[1];
    try { key = decodeURIComponent(m[1]); } catch {}
    closeModal = filmModal(key, () => (location.hash = `#/${baseRoute}`));
    return;
  }
  const next = ROUTES[m[0]] ? m[0] : '';
  if (wasOpen && next === baseRoute && !dirty && viewEl.childElementCount) return;
  baseRoute = next;
  render();
  window.scrollTo(0, 0);
  if (focus) viewEl.focus({ preventScroll: true });
}

const FOCUSABLE = 'input,select,textarea,button,a[href],[tabindex]';
function refresh() {
  const hash = location.hash;
  const active = document.activeElement;
  const idx = viewEl && active && viewEl.contains(active) ? [...viewEl.querySelectorAll(FOCUSABLE)].indexOf(active) : -1;
  shell();
  if (hash.startsWith('#/film')) route();
  else render();
  if (idx >= 0) [...viewEl.querySelectorAll(FOCUSABLE)][idx]?.focus({ preventScroll: true });
}

// Nouvelles données (RSS, import, objectif…) : redessine et relance la récupération des métadonnées.
function reload() {
  if (!started) return start();
  if (closeModal) dirty = true;
  else refresh();
  enrichAll(onEnrich);
}

function onEnrich() {
  updateStatus();
  const e = state.enrichment;
  if (e && e.state === 'done' && ['stats', 'profil', 'avoir', 'objectifs', 'comparer', ''].includes(baseRoute)) (closeModal ? (dirty = true) : render());
}

async function resync() {
  if (state.syncing || !state.settings.username) return;
  state.syncing = true;
  state.syncError = '';
  updateStatus();
  updateBanner();
  try {
    const r = await refreshRss();
    if (r.added > 0) {
      toast(`${r.added} nouveau${r.added > 1 ? 'x' : ''} film${r.added > 1 ? 's' : ''} dans ton journal`, 6000, { label: 'Voir', run: () => (location.hash = '#/journal') });
      state.syncing = false;
      return reload();
    }
  } catch (e) {
    state.syncError = e.message || 'Mise à jour impossible.';
  }
  state.syncing = false;
  updateStatus();
  updateBanner();
}

async function start() {
  started = true;
  shell();
  route();
  if (state.settings.username && Date.now() - state.lastRss > 30 * 60 * 1000) resync();
  enrichAll(onEnrich);
}

// ---------- Clavier ----------
const GO = { d: '', j: 'journal', b: 'bilans', s: 'stats', p: 'profil', c: 'comparer', v: 'avoir', o: 'objectifs', r: 'reglages', h: 'aide' };
let goPending = 0;
let shortcutsOpen = false;

function openShortcuts() {
  if (shortcutsOpen) return;
  shortcutsOpen = true;
  const prev = document.activeElement;
  const close = () => { shortcutsOpen = false; document.removeEventListener('keydown', onKey, true); window.removeEventListener('hashchange', close); back.remove(); if (prev && prev.isConnected) prev.focus(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const box = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Raccourcis clavier', tabindex: '-1', style: 'padding:22px 24px' },
    h('h2', { style: 'font-size:18px;letter-spacing:-.03em;margin-bottom:10px' }, 'Raccourcis clavier'),
    h('table', { class: 'sc-table' }, h('tbody', null, SHORTCUTS.map(([keys, d]) => h('tr', null, h('td', null, keys.map((k) => h('span', { class: 'kbd' }, k))), h('td', null, d))))));
  const back = h('div', { class: 'pal-back', onclick: (e) => e.target === back && close() }, box);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  document.body.append(back);
  box.focus();
}

function shortcuts() {
  document.addEventListener('keydown', (e) => {
    const key = typeof e.key === 'string' ? e.key : '';
    if (!viewEl || !key) return;
    const typing = e.target.closest && e.target.closest('input,select,textarea,[contenteditable]');
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (key === '/') { e.preventDefault(); openSearch(); }
      else if (key === '?') { e.preventDefault(); openShortcuts(); }
      else if (goPending && Date.now() - goPending < 1200) {
        goPending = 0;
        const target = GO[key.toLowerCase()];
        if (target !== undefined) { e.preventDefault(); location.hash = `#/${target}`; }
      } else if (key === 'g') goPending = Date.now();
    }
  });
  window.addEventListener('scroll', () => $('.top')?.classList.toggle('stuck', window.scrollY > 6), { passive: true });
}

async function boot() {
  saveSettings({});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('hashchange', () => viewEl && route(true));
  document.addEventListener('clap:data', () => { if (started) reload(); else if (state.entries.length || state.watchlist.length) start(); });
  setInterval(() => viewEl && updateStatus(), 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && viewEl && !state.syncing && navigator.onLine && state.settings.username && Date.now() - state.lastRss > 30 * 60 * 1000) resync(); });
  window.addEventListener('online', () => { updateBanner(); if (viewEl && state.syncError) resync(); });
  window.addEventListener('offline', updateBanner);
  shortcuts();
  await loadAll();
  if (state.entries.length || state.watchlist.length) return start();
  landing();
}

boot();
