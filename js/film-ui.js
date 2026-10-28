// Affiches, tuiles et pastilles de films.
import { ratingText, stars } from './films.js';
import { metaOf } from './state.js';
import { h } from './util.js';

export const filmHref = (key) => `#/film/${encodeURIComponent(key)}`;
export const posterOf = (f) => (metaOf(f.key) || {}).poster || f.poster || '';

const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

// Affiche : image si on en connaît une, sinon dégradé stable avec les initiales du titre.
export function poster(f, cls = '') {
  const src = posterOf(f);
  const init = String(f.title || '?').split(/\s+/).filter((w) => w.length > 2 || /^\d/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const box = h('div', { class: `poster ${cls}`, style: `--h:${hue(f.title)}` }, h('span', { 'aria-hidden': 'true' }, init));
  if (src) {
    const img = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('load', () => box.classList.add('ok'));
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

export const starsEl = (r) => (r ? h('span', { class: 'stars', title: ratingText(r), 'aria-label': ratingText(r) }, stars(r)) : null);

export function tile(f, extra) {
  return h('a', { class: 'tile', href: filmHref(f.key), title: `${f.title}${f.year ? ` (${f.year})` : ''}${f.rating ? ` · ${ratingText(f.rating)}` : ''}` },
    poster(f), h('div', { class: 't' }, f.title), h('div', { class: 's' }, [f.year, starsEl(f.rating), f.liked ? '♥' : null, extra].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))));
}
