// À voir : ta liste d'envies classée par affinité, « que regarder ce soir ? » et suggestions TMDB.
import { filmHref, poster } from '../film-ui.js';
import { keyOf } from '../films.js';
import { pref, setPref } from '../prefs.js';
import { metaOf, state } from '../state.js';
import { affinity, tasteModel } from '../taste.js';
import { help, card, empty, labelWithHelp, seg } from '../ui.js';
import { fold, h, put } from '../util.js';
import { hm, num } from './dashboard.js';

let sort = pref('wSort', 'affinity');

const runtimeText = (m) => (m && m.runtime ? hm(m.runtime) : '');

function card1(w, a) {
  const m = metaOf(w.key);
  return h('a', { class: 'tile wl', href: filmHref(w.key), title: `${w.title}${w.year ? ` (${w.year})` : ''}` },
    poster(w), a && a.score != null ? h('span', { class: `aff-badge ${a.score >= 70 ? 'hi' : a.score >= 50 ? 'mid' : ''}`, title: 'Affinité estimée' }, `${a.score} %`) : null,
    h('div', { class: 't' }, w.title), h('div', { class: 's' }, [w.year, runtimeText(m), (m && m.genres && m.genres[0]) || ''].filter(Boolean).join(' · ')));
}

export function watchlist(root) {
  const wl = state.watchlist;
  if (!wl.length) {
    return put(root, card('À voir', null, empty('Ta liste d’envies est vide. Importe ton export Letterboxd (fichier watchlist.csv) dans les Réglages : Yukon la classe selon tes goûts.')));
  }
  const model = tasteModel(state.films, metaOf);
  const reliable = model.n >= 15;
  const rows = wl.map((w) => ({ w, a: reliable ? affinity(model, metaOf(w.key), w.year) : { score: null, reasons: [] }, m: metaOf(w.key) }));
  const genres = [...new Set(rows.flatMap((r) => (r.m && r.m.genres) || []))].sort();
  const f = { text: '', genre: '', max: '' };
  const grid = h('div', { class: 'tiles big' });
  const info = h('p', { class: 'muted', style: 'font-size:13px;margin-bottom:10px' });

  const SORTS = {
    affinity: (a, b) => (b.a.score ?? -1) - (a.a.score ?? -1) || b.w.added - a.w.added,
    added: (a, b) => b.w.added - a.w.added,
    short: (a, b) => ((a.m || {}).runtime || 999) - ((b.m || {}).runtime || 999),
    year: (a, b) => (b.w.year || 0) - (a.w.year || 0),
  };
  const filtered = () => rows.filter((r) => (!f.genre || (r.m && r.m.genres.includes(f.genre))) && (!f.max || (r.m && r.m.runtime && r.m.runtime <= Number(f.max))) && (!f.text || fold(r.w.title).includes(fold(f.text)))).sort(SORTS[sort]);
  const draw = (limit = 60) => {
    const list = filtered();
    info.textContent = `${list.length} film${list.length > 1 ? 's' : ''}${reliable ? '' : ' · l’affinité apparaît à partir de 15 films notés'}`;
    grid.replaceChildren(...list.slice(0, limit).map((r) => card1(r.w, r.a)), ...(list.length > limit ? [h('div', { class: 'more' }, h('button', { class: 'btn', onclick: () => draw(limit + 60) }, `Afficher plus (${list.length - limit})`))] : []));
  };

  // « Que regarder ce soir ? »
  const tonight = h('div', { class: 'stack' });
  const pick = { max: '', genre: '' };
  const picks = h('div', { class: 'tiles big', style: 'margin-top:12px' });
  const draw3 = () => {
    const pool = rows.filter((r) => (!pick.genre || (r.m && r.m.genres.includes(pick.genre))) && (!pick.max || (r.m && r.m.runtime && r.m.runtime <= Number(pick.max))));
    if (!pool.length) return picks.replaceChildren(empty('Aucun film ne correspond : élargis la durée ou le genre.'));
    // tirage pondéré par l'affinité (50 par défaut) : les films aimés sortent plus souvent, sans toujours les mêmes
    const left = [...pool];
    const chosen = [];
    while (chosen.length < Math.min(3, pool.length)) {
      const wts = left.map((r) => Math.max(5, (r.a.score ?? 50)) ** 2);
      let t = Math.random() * wts.reduce((s, x) => s + x, 0), i = 0;
      while (i < wts.length - 1 && (t -= wts[i]) > 0) i++;
      chosen.push(left.splice(i, 1)[0]);
    }
    picks.replaceChildren(...chosen.map((r) => h('div', { class: 'pick' }, card1(r.w, r.a), r.a.reasons.length ? h('p', { class: 'muted', style: 'font-size:12.5px;margin-top:6px' }, r.a.reasons.map((x) => `${x.label} « ${x.name} »`).join(', ')) : null)));
  };
  const selMax = h('select', { 'aria-label': 'Durée maximale', onchange: (e) => { pick.max = e.target.value; } }, [['', 'Durée libre'], ['100', 'Moins de 1 h 40'], ['130', 'Moins de 2 h 10']].map(([v, l]) => h('option', { value: v }, l)));
  const selGenre = h('select', { 'aria-label': 'Genre', onchange: (e) => { pick.genre = e.target.value; } }, [h('option', { value: '' }, 'Tous les genres'), ...genres.map((g) => h('option', { value: g }, g))]);
  tonight.append(h('div', { class: 'toolbar' }, selMax, selGenre, h('button', { class: 'btn primary', type: 'button', onclick: draw3 }, 'Tirer 3 films')), picks);

  // suggestions TMDB : films recommandés pour plusieurs de tes films préférés, pas encore vus
  const recs = h('div');
  const loadRecs = async () => {
    recs.replaceChildren(h('p', { class: 'muted' }, 'Recherche de suggestions…'));
    const seeds = state.films.filter((x) => x.rating >= 4.5 && ((metaOf(x.key) || {}).tmdb || x.tmdb)).sort((a, b) => b.last - a.last).slice(0, 8);
    const seen = new Set(state.films.map((x) => keyOf(x.title, x.year)));
    const inList = new Set(wl.map((x) => x.key));
    const count = new Map();
    for (const s of seeds) {
      const id = (metaOf(s.key) || {}).tmdb || s.tmdb;
      try {
        const r = await fetch(`/api/tmdb?${new URLSearchParams({ path: `/movie/${id}/recommendations` })}`);
        if (!r.ok) continue;
        for (const x of (await r.json()).results || []) {
          const year = Number((x.release_date || '').slice(0, 4)) || null;
          const key = keyOf(x.title, year);
          if (seen.has(key) || inList.has(key)) continue;
          const c = count.get(x.id) || { id: x.id, title: x.title, year, poster: x.poster_path ? `https://image.tmdb.org/t/p/w185${x.poster_path}` : '', n: 0, from: [], avg: x.vote_average };
          c.n++;
          c.from.push(s.title);
          count.set(x.id, c);
        }
      } catch {}
    }
    const top = [...count.values()].filter((c) => c.avg >= 6.3).sort((a, b) => b.n - a.n || b.avg - a.avg).slice(0, 12);
    recs.replaceChildren(top.length ? h('div', { class: 'tiles big' }, top.map((c) => h('a', { class: 'tile', href: `https://letterboxd.com/tmdb/${c.id}`, target: '_blank', rel: 'noopener' }, poster({ title: c.title, poster: c.poster }), h('div', { class: 't' }, c.title), h('div', { class: 's' }, `${c.year || ''} · pour ${c.n} de tes films`), h('div', { class: 's', style: 'font-size:11.5px' }, c.from.slice(0, 2).join(', '))))) : empty('Aucune suggestion pour le moment : note quelques films à 4,5 ★ ou plus.'));
  };

  const search = h('input', { type: 'search', placeholder: 'Rechercher dans la liste…', 'aria-label': 'Rechercher dans la liste', oninput: (e) => { f.text = e.target.value; draw(); } });
  const genreSel = h('select', { 'aria-label': 'Genre', onchange: (e) => { f.genre = e.target.value; draw(); } }, [h('option', { value: '' }, 'Tous les genres'), ...genres.map((g) => h('option', { value: g }, g))]);
  const maxSel = h('select', { 'aria-label': 'Durée maximale', onchange: (e) => { f.max = e.target.value; draw(); } }, [['', 'Toutes durées'], ['100', 'Moins de 1 h 40'], ['130', 'Moins de 2 h 10'], ['150', 'Moins de 2 h 30']].map(([v, l]) => h('option', { value: v }, l)));

  put(root,
    card('Que regarder ce soir ?', 'Trois films tirés de ta liste, plus souvent ceux que tu devrais aimer', tonight),
    card(labelWithHelp('Ma liste à voir', 'affinity'), `${wl.length} film${wl.length > 1 ? 's' : ''} en attente`,
      h('div', { class: 'toolbar', style: 'margin-bottom:12px' }, h('div', { class: 'grow' }, search), genres.length ? genreSel : null, maxSel,
        seg([['affinity', 'Affinité'], ['added', 'Ajout récent'], ['short', 'Plus courts'], ['year', 'Plus récents']], sort, (v) => { sort = v; setPref('wSort', v); draw(); })),
      info, grid),
    state.config.tmdb ? card('Suggestions pour toi', 'Recommandations TMDB autour de tes films préférés (4,5 ★ et plus), que tu n’as pas encore vus', recs, h('div', { class: 'toolbar', style: 'margin-top:12px' }, h('button', { class: 'btn', type: 'button', onclick: loadRecs }, 'Chercher des suggestions'))) : null);
  draw();
}
