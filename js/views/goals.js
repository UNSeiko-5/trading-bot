// Objectifs : films de l'année, défis (pays, époques, genres) et trophées.
import { ring } from '../charts.js';
import { GENRES } from '../meta.js';
import { dated, byCountry, byGenre, byLanguage, streaks, totals } from '../stats.js';
import { metaOf, saveSettings, state } from '../state.js';
import { card, progress } from '../ui.js';
import { dayKey, h, put, startOfDay } from '../util.js';
import { num } from './dashboard.js';

const DECADES = Array.from({ length: 11 }, (_, i) => `${1920 + i * 10}s`);
const NEXT = (v, steps) => steps.find((s) => s > v) || null;

function chips(all, got, label) {
  return h('div', { class: 'chips' }, all.map((n) => h('span', { class: `chip${got.has(n) ? ' on' : ''}`, 'aria-label': `${n} : ${got.has(n) ? label : 'à découvrir'}` }, n)));
}

function trophies(films, entries) {
  const real = dated(entries);
  const st = streaks(real);
  const t = totals(entries, metaOf);
  const defs = [
    ['Premier film', films.length >= 1], ['10 films', films.length >= 10], ['50 films', films.length >= 50], ['100 films', films.length >= 100], ['250 films', films.length >= 250], ['500 films', films.length >= 500], ['1 000 films', films.length >= 1000],
    ['Première note', t.rated >= 1], ['25 coups de cœur', t.likes >= 25], ['10 films à 5 ★', t.fives >= 10], ['Critique : 10 avis', t.reviews >= 10],
    ['7 jours d’affilée', st.bestDay >= 7], ['30 jours d’affilée', st.bestDay >= 30], ['Revoir un film 3 fois', films.some((f) => f.count >= 3)],
  ];
  return defs;
}

export function goalsView(root) {
  const now = new Date();
  const y = now.getFullYear();
  const fs = state.films;
  const goal = state.settings.goal;
  const yearFilms = new Set(dated(state.entries).filter((e) => new Date(e.ts).getFullYear() === y).map((e) => e.key));
  const done = yearFilms.size;
  const doy = Math.round((startOfDay(now) - new Date(y, 0, 1)) / 864e5) + 1;
  const daysInYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  const projected = Math.round((done / doy) * daysInYear);
  const left = Math.max(0, goal - done);
  const perWeek = left / Math.max(1, (daysInYear - doy) / 7);
  const status = !goal ? null : done >= goal ? ['good', 'Objectif atteint'] : projected >= goal * 0.98 ? ['good', 'Dans les temps'] : projected >= goal * 0.85 ? ['warn', 'Légèrement en retard'] : ['bad', 'En retard'];

  const input = h('input', { type: 'number', min: 0, max: 2000, step: 5, value: goal || '', placeholder: 'ex. 100', 'aria-label': 'Objectif de films pour l’année', onchange: (e) => { saveSettings({ goal: Math.max(0, Math.round(Number(e.target.value) || 0)) }); document.dispatchEvent(new CustomEvent('clap:data')); } });

  const countries = byCountry(fs, metaOf), langs = byLanguage(fs, metaOf), genres = byGenre(fs, metaOf);
  const decades = new Set(fs.filter((f) => f.year).map((f) => `${Math.floor(f.year / 10) * 10}s`));
  const gotGenres = new Set(genres.map((g) => g.name));
  const nextC = NEXT(countries.length, [10, 20, 30, 50, 75]);
  const tr = trophies(fs, state.entries);

  put(root,
    card('Mon objectif de l’année', `Films différents vus en ${y}`,
      h('div', { class: 'goal-row' },
        h('div', { class: 'lv-ring', role: 'img', 'aria-label': goal ? `${done} films sur ${goal}` : `${done} films` }, ring({ value: goal ? Math.min(1, done / goal) : 0, color: 'var(--accent)', center: [String(done), goal ? `/ ${goal}` : 'films'] })),
        h('div', { class: 'goal-text' },
          h('label', { class: 'field', style: 'max-width:240px' }, 'Objectif (films)', input),
          goal ? [
            h('div', { class: 'toolbar', style: 'margin:10px 0 6px' }, h('span', { class: `pill ${status[0]}` }, status[1])),
            progress(done / goal, (doy / daysInYear)),
            h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:8px' }, done >= goal ? `Dépassé de ${done - goal} film${done - goal > 1 ? 's' : ''}.` : `Rythme actuel : ${projected} films sur l’année. Il t’en reste ${left} à voir, soit ${num(perWeek, 1)} par semaine.`),
          ] : h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:10px' }, `À ce rythme, tu finirais ${y} avec environ ${projected} films. Fixe un objectif pour suivre ta progression.`)))),
    card('Tour du monde', `${countries.length} pays découverts${nextC ? ` · prochain palier : ${nextC}` : ''}`,
      countries.length ? [progress(nextC ? countries.length / nextC : 1), h('div', { class: 'chips', style: 'margin-top:12px' }, countries.slice(0, 80).map((c) => h('span', { class: 'chip on', title: `${c.count} film${c.count > 1 ? 's' : ''}` }, c.name)))] : h('p', { class: 'muted' }, 'Les pays viennent des métadonnées des films, en cours de chargement.'),
      langs.length ? h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, `${langs.length} langue${langs.length > 1 ? 's' : ''} originale${langs.length > 1 ? 's' : ''} : ${langs.slice(0, 8).map((l) => l.name).join(', ')}${langs.length > 8 ? '…' : ''}.`) : null),
    h('div', { class: 'grid cols-2' },
      card('Voyage dans le temps', `${[...decades].filter((d) => DECADES.includes(d)).length} décennies sur ${DECADES.length} depuis les années 1920`, chips(DECADES, decades, 'vu')),
      card('Tous les genres', `${GENRES.filter((g) => gotGenres.has(g)).length} genres sur ${GENRES.length}`, chips(GENRES, gotGenres, 'vu'))),
    card('Trophées', `${tr.filter((t) => t[1]).length} débloqués sur ${tr.length}`, h('div', { class: 'trophies' }, tr.map(([name, ok]) => h('div', { class: `trophy${ok ? ' on' : ''}`, 'aria-label': `${name} : ${ok ? 'débloqué' : 'à débloquer'}` }, h('span', { 'aria-hidden': 'true' }, ok ? '★' : '☆'), name)))));
}
