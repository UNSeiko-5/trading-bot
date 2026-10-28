import { cancelEnrich, enrichAll, metaCount, refreshRss, resetAll } from '../data.js';
import { exportCsv } from '../export.js';
import { HOW_TO, importButton } from '../import-ui.js';
import { saveSettings, state } from '../state.js';
import * as store from '../store.js';
import { card, empty } from '../ui.js';
import { fmtDate, h, put, relTime, toast } from '../util.js';

export function settings(root, { rerender, reload }) {
  const s = state.settings;
  const msg = h('p', { class: 'muted', role: 'status', style: 'font-size:13px;min-height:18px;margin-top:8px' });
  const user = h('input', { type: 'text', value: s.username, placeholder: 'ton pseudo Letterboxd', 'aria-label': 'Pseudo Letterboxd', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', onkeydown: (e) => e.key === 'Enter' && load.click() });
  const load = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
    const name = user.value.trim().replace(/^@|^https?:\/\/letterboxd\.com\//i, '').replace(/\/.*$/, '');
    if (!name) { msg.style.color = 'var(--bad-text)'; msg.textContent = 'Indique ton pseudo.'; return; }
    load.disabled = true;
    msg.style.color = '';
    msg.textContent = 'Lecture du flux RSS…';
    try {
      saveSettings({ username: name });
      const r = await refreshRss(name);
      msg.textContent = `${r.added} nouveau${r.added > 1 ? 'x' : ''} visionnage${r.added > 1 ? 's' : ''} (${r.total} entrées dans le flux).`;
      reload();
    } catch (e) {
      msg.style.color = 'var(--bad-text)';
      msg.textContent = e.message;
    }
    load.disabled = false;
  } }, s.username ? 'Mettre à jour' : 'Charger mon profil');

  const e = state.enrichment;
  const cov = state.films.length ? metaCount() / state.films.length : 0;
  const redo = async () => {
    for (const m of state.meta.values()) if (m.missing) state.meta.delete(m.key);
    await store.replaceAll('meta', [...state.meta.values()]);
    enrichAll(rerender);
    toast('Récupération des métadonnées relancée.');
    rerender();
  };

  put(root,
    h('div', { class: 'grid cols-2' },
      card('Profil Letterboxd', 'Sans connexion : Clap lit le flux RSS public de ton profil (tes ~100 dernières entrées).',
        h('div', { class: 'toolbar' }, h('div', { class: 'grow' }, user), load), msg,
        state.lastRss ? h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, `Dernière lecture : ${relTime(state.lastRss)}.`) : null),
      card('Importer mon export', 'Tout ton historique : ZIP d’export ou fichiers CSV.', h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:12px' }, HOW_TO), importButton({ label: 'Choisir mon export', onDone: () => setTimeout(rerender, 600) }))),
    card('Métadonnées des films', 'Genres, durées, réalisateurs, pays, acteurs, affiches.',
      h('p', { style: 'font-size:14px' }, `${Math.round(cov * 100)} % des films enrichis (${metaCount()} sur ${state.films.length}) · source : ${state.config.tmdb ? 'TMDB (puis Wikidata en secours)' : 'Wikidata'}.`),
      e && e.state === 'running' ? h('p', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, `En cours : ${e.done} / ${e.total}…`) : null,
      !state.config.tmdb ? h('p', { class: 'muted', style: 'font-size:13px;margin-top:6px' }, 'Pour de meilleurs résultats (acteurs, affiches, suggestions, notoriété), ajoute une clé TMDB gratuite dans la variable d’environnement TMDB_API_KEY du serveur.') : null,
      h('div', { class: 'toolbar', style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: redo }, 'Relancer la récupération'), e && e.state === 'running' ? h('button', { class: 'btn', type: 'button', onclick: () => { cancelEnrich(); rerender(); } }, 'Mettre en pause') : null)),
    h('div', { class: 'grid cols-2' },
      card('Affichage', null, h('label', { class: 'field' }, 'Thème', h('select', { onchange: (ev) => { saveSettings({ theme: ev.target.value }); rerender(); } }, [['auto', 'Automatique'], ['light', 'Clair'], ['dark', 'Sombre']].map(([v, l]) => h('option', { value: v, selected: s.theme === v }, l))))),
      card('Données', `${state.entries.length} visionnages et ${state.watchlist.length} films à voir enregistrés dans ton navigateur${state.entries.length ? `, du ${fmtDate(Math.min(...state.entries.map((x) => x.ts)))} au ${fmtDate(Math.max(...state.entries.map((x) => x.ts)))}` : ''}.`,
        h('div', { class: 'toolbar' }, h('button', { class: 'btn', type: 'button', disabled: !state.entries.length, onclick: () => exportCsv() }, 'Exporter en CSV'),
          h('button', { class: 'btn danger', type: 'button', onclick: async () => {
            if (!confirm('Effacer toutes les données de Clap sur cet appareil (journal, liste à voir, métadonnées, réglages) ?')) return;
            await resetAll();
            try { localStorage.removeItem('clap.settings'); localStorage.removeItem('clap.ui'); } catch {}
            location.href = '/';
          } }, 'Tout effacer')))),
    card('À propos', null,
      h('p', { style: 'font-size:13.5px' }, 'Clap n’est pas affilié à Letterboxd. Il lit le flux RSS public de ton profil et, si tu l’importes, ton export de données : tout est stocké dans ton navigateur.'),
      h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:8px' }, 'Les informations sur les films proviennent de TMDB et de Wikidata. Ce produit utilise l’API TMDB mais n’est ni approuvé ni certifié par TMDB.')));
}
