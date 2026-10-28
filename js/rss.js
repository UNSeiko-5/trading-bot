// Flux RSS public d'un profil (letterboxd.com/pseudo/rss/) : ~100 dernières entrées, sans API ni connexion.
import { entry } from './films.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return Number.isFinite(c) ? String.fromCodePoint(c) : m;
  }
  return ENT[e.toLowerCase()] ?? m;
});

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  if (!m) return '';
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decode(m[1]);
};

// Description HTML → { poster, review } : on retire l'affiche et la phrase « Watched on … ».
export function describe(html) {
  const poster = (html.match(/<img[^>]+src="([^"]+)"/) || [])[1] || '';
  const text = html
    .replace(/<p>\s*<img[^>]*>\s*<\/p>/g, '')
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '');
  const review = decode(text).trim();
  return { poster, review: /^Watched on [^.]*\.$/.test(review) || /^Revu le [^.]*\.$/.test(review) ? '' : review };
}

export function parseRss(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  const user = (tag(xml, 'title').match(/^Letterboxd - (.+)$/) || [])[1] || '';
  const entries = [];
  const lists = [];
  for (const it of items) {
    const title = tag(it, 'letterboxd:filmTitle');
    if (!title) {
      const name = tag(it, 'title');
      if (name) lists.push({ name, url: tag(it, 'link') });
      continue;
    }
    const { poster, review } = describe(tag(it, 'description'));
    const e = entry({
      id: tag(it, 'guid'), title, year: tag(it, 'letterboxd:filmYear'), rating: tag(it, 'letterboxd:memberRating'),
      liked: tag(it, 'letterboxd:memberLike') === 'Yes', rewatch: tag(it, 'letterboxd:rewatch') === 'Yes',
      date: tag(it, 'letterboxd:watchedDate'), review, url: tag(it, 'link'), tmdb: tag(it, 'tmdb:movieId'), poster, source: 'rss',
    });
    if (e) entries.push(e);
  }
  return { user, entries, lists };
}
