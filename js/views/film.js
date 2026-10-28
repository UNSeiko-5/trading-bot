// Fiche d'un film : affiche, informations, mes visionnages et avis, suggestions TMDB.
import { filmHref, poster, starsEl, tile } from '../film-ui.js';
import { films as groupFilms, ratingText } from '../films.js';
import { metaOf, state } from '../state.js';
import { affinity, tasteModel } from '../taste.js';
import { empty } from '../ui.js';
import { fmtDate, h, icon } from '../util.js';

const FOCUSABLE = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';
export const lbUrl = (f, m) => f.url || (m && m.tmdb ? `https://letterboxd.com/tmdb/${m.tmdb}` : (f.tmdb ? `https://letterboxd.com/tmdb/${f.tmdb}` : ''));

export function filmModal(key, close) {
  const f = state.films.find((x) => x.key === key) || null;
  const w = state.watchlist.find((x) => x.key === key) || null;
  const base = f || (w && { key, title: w.title, year: w.year, entries: [], url: w.url, rating: null, liked: false, count: 0 });
  const prevFocus = document.activeElement;
  const back = h('div', { class: 'modal-back', onclick: (e) => e.target === back && close() });
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title', tabindex: '-1' });
  back.append(modal);

  // film précédent / suivant dans l'ordre du journal
  const list = state.films;
  const idx = f ? list.findIndex((x) => x.key === f.key) : -1;
  const go = (i) => list[i] && (location.hash = filmHref(list[i].key));
  const onKey = (e) => {
    if (e.key === 'Escape') return close();
    if (e.key === 'Tab') {
      const els = [...modal.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === modal)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (e.target.closest('input,select,textarea')) return;
    if (e.key === 'ArrowLeft') go(idx + 1);
    if (e.key === 'ArrowRight') go(idx - 1);
  };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  const dispose = () => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    back.remove();
    if (prevFocus && prevFocus.isConnected) prevFocus.focus();
  };
  const closeBtn = h('button', { class: 'btn sm close', onclick: close, 'aria-label': 'Fermer', html: icon('close', 16) });

  if (!base) {
    modal.append(closeBtn, h('h2', { id: 'modal-title' }, 'Film'), empty('Film introuvable.'));
    document.body.append(back);
    modal.focus({ preventScroll: true });
    return dispose;
  }

  const m = metaOf(key) || {};
  const link = lbUrl(base, m);
  const info = [base.year, m.runtime ? `${Math.floor(m.runtime / 60)} h ${String(m.runtime % 60).padStart(2, '0')}` : null, (m.directors || []).join(', ') || null].filter(Boolean).join(' · ');
  const chip = (t) => h('span', { class: 'pill ok' }, t);

  const mine = f
    ? h('div', { class: 'film-mine' },
      h('div', { class: 'big-stars', 'aria-label': base.rating ? ratingText(base.rating) : 'sans note' }, base.rating ? starsEl(base.rating) : h('span', { class: 'muted' }, 'Sans note')),
      base.liked && h('span', { class: 'pill', style: 'color:var(--bad-text)' }, '♥ Aimé'),
      base.count > 1 && h('span', { class: 'pill ok' }, `↻ Vu ${base.count} fois`),
      f.entries.every((e) => e.approx) && h('span', { class: 'pill warn', title: 'Film marqué « vu » sans date de visionnage' }, '≈ Date approximative'))
    : h('div', { class: 'film-mine' }, h('span', { class: 'pill' }, h('span', { html: icon('bookmark', 12) }), ' Dans ta liste à voir'));

  const entries = f && h('section', { class: 'card' },
    h('h2', null, f.entries.length > 1 ? 'Mes visionnages' : 'Mon visionnage'),
    h('div', { class: 'stack', style: 'margin-top:8px' }, f.entries.map((e) => h('div', { class: 'film-entry' },
      h('div', { class: 'film-entry-head' }, h('b', null, e.approx ? `Marqué vu le ${fmtDate(e.ts, 'med')}` : fmtDate(e.ts, 'full')), e.rewatch && h('span', { class: 'pill ok' }, '↻ Revu'), starsEl(e.rating), e.liked && h('span', { style: 'color:var(--bad-text)' }, '♥'), ...e.tags.map(chip)),
      e.review && h('p', { class: 'film-review' }, e.review)))));

  const about = (m.overview || (m.cast && m.cast.length) || m.collection) && h('section', { class: 'card' },
    h('h2', null, 'À propos'),
    m.tagline && h('p', { class: 'film-tagline' }, `« ${m.tagline} »`),
    m.overview && h('p', { style: 'margin:6px 0 10px;font-size:14px' }, m.overview),
    m.cast && m.cast.length > 0 && h('p', { class: 'muted', style: 'font-size:13.5px' }, `Avec ${m.cast.join(', ')}`),
    m.collection && h('p', { class: 'muted', style: 'font-size:13.5px;margin-top:4px' }, `Saga : ${m.collection}`),
    m.avg > 0 && h('p', { class: 'muted', style: 'font-size:13px;margin-top:8px' }, `Note TMDB ${m.avg.toFixed(1).replace('.', ',')} / 10 (${m.votes.toLocaleString('fr-FR')} votes)`));

  const aff = !base.rating || !f ? (() => {
    const model = tasteModel(state.films, metaOf);
    if (model.n < 15) return null;
    const a = affinity(model, metaOf(key), base.year);
    return a.score == null ? null : a;
  })() : null;

  const sims = h('div', { class: 'stack' });
  modal.append(
    h('div', { class: 'modal-bar' },
      h('div', { class: 'nav-arrows' },
        h('button', { class: 'btn sm', disabled: idx < 0 || idx >= list.length - 1, onclick: () => go(idx + 1), 'aria-label': 'Film précédent' }, '← Précédent'),
        h('button', { class: 'btn sm', disabled: idx <= 0, onclick: () => go(idx - 1), 'aria-label': 'Film suivant' }, 'Suivant →')),
      closeBtn),
    h('div', { class: 'film-hero' },
      poster(base, 'lg'),
      h('div', null,
        h('h2', { id: 'modal-title' }, base.title),
        h('p', { class: 'muted' }, info || ' '),
        h('div', { class: 'film-chips' }, (m.genres || []).map(chip), (m.countries || []).slice(0, 3).map(chip), (m.languages || []).slice(0, 1).map(chip)),
        mine,
        aff && h('p', { class: 'film-aff' }, h('b', null, `${aff.score} % d’affinité`), aff.predicted ? ` · note prévue ≈ ${String(aff.predicted).replace('.', ',')} / 5` : '', aff.reasons.length ? ` : ${aff.reasons.map((r) => `${r.label} « ${r.name} » (${r.avg ? r.avg.toFixed(1).replace('.', ',') : '—'})`).join(', ')}` : ''),
        link && h('a', { class: 'strava-link', href: link, target: '_blank', rel: 'noopener' }, 'Voir sur Letterboxd ↗'))),
    h('div', { class: 'stack', style: 'margin-top:18px' }, entries, about, sims));
  document.body.append(back);
  modal.focus({ preventScroll: true });

  // suggestions TMDB (si la clé est configurée)
  const id = m.tmdb || base.tmdb;
  if (state.config.tmdb && id) {
    fetch(`/api/tmdb?${new URLSearchParams({ path: `/movie/${id}/recommendations` })}`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!back.isConnected || !d || !d.results) return;
      const seen = new Set(state.films.map((x) => `${x.title}|${x.year}`));
      const picks = d.results.slice(0, 12).map((x) => ({ key: `tmdb:${x.id}`, tmdb: x.id, title: x.title, year: Number((x.release_date || '').slice(0, 4)) || null, poster: x.poster_path ? `https://image.tmdb.org/t/p/w185${x.poster_path}` : '', seen: seen.has(`${x.title}|${Number((x.release_date || '').slice(0, 4))}`) }));
      if (!picks.length) return;
      sims.replaceChildren(h('section', { class: 'card' }, h('h2', null, 'Si tu as aimé'), h('p', { class: 'card-sub' }, 'Suggestions TMDB'),
        h('div', { class: 'tiles' }, picks.map((p) => h('a', { class: 'tile', href: `https://letterboxd.com/tmdb/${p.tmdb}`, target: '_blank', rel: 'noopener', title: `${p.title}${p.year ? ` (${p.year})` : ''}` }, poster(p), h('div', { class: 't' }, p.title), h('div', { class: 's' }, [p.year, p.seen ? 'déjà vu' : null].filter(Boolean).join(' · ')))))));
    }).catch(() => {});
  }
  return dispose;
}
