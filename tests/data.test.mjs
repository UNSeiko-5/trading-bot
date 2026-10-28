import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { fromFiles, parseCsv, readFiles, table } from '../js/archive.js';
import { entry, films, keyOf, mergeEntries, stars, tsOf } from '../js/films.js';
import { decode, describe, parseRss } from '../js/rss.js';

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-10-01,Parasite,2019,https://boxd.it/aaa,5,,"corée, thriller",2026-09-30
2026-10-02,"Amélie, la belle",2001,https://boxd.it/bbb,4.5,Yes,,2026-10-02
2026-10-05,Parasite,2019,https://boxd.it/aaa,,Yes,,2026-10-05
2026-10-06,Heat,1995,https://boxd.it/ccc,,,,2026-10-06`;
const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2026-10-06,Heat,1995,https://boxd.it/ccc,4
2026-09-01,Alien,1979,https://boxd.it/ddd,3.5
2026-09-02,Seven,1995,https://boxd.it/eee,4.5`;
const WATCHED = `Date,Name,Year,Letterboxd URI
2026-08-10,Alien,1979,https://boxd.it/ddd
2026-10-02,Parasite,2019,https://boxd.it/aaa
2026-07-01,Le Samouraï,1967,https://boxd.it/fff`;
const REVIEWS = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
2026-10-01,Parasite,2019,https://boxd.it/aaa,5,,"Un chef-d'œuvre.
Deux lignes.",,2026-09-30`;
const LIKES = `Date,Name,Year,Letterboxd URI
2026-10-01,Parasite,2019,https://boxd.it/aaa`;
const WATCHLIST = `Date,Name,Year,Letterboxd URI
2026-06-01,Stalker,1979,https://boxd.it/ggg`;

test('CSV : guillemets, virgules et retours à la ligne', () => {
  assert.deepEqual(parseCsv('a,b\n"x,y","l1\nl2"\n'), [['a', 'b'], ['x,y', 'l1\nl2']]);
  assert.equal(table('Watched Date,Name\n2026-01-01,Zoé')[0]['watched date'], '2026-01-01');
});

test('notes, clés et dates', () => {
  assert.equal(stars(3.5), '★★★½');
  assert.equal(stars(0), '');
  assert.equal(keyOf('  Amélie  ', 2001), 'amelie|2001');
  assert.equal(new Date(tsOf('2026-03-29')).getDate(), 29);
  assert.equal(entry({ title: 'X', date: '2026-01-01', rating: '3,5' }).rating, 3.5);
  assert.equal(entry({ title: 'X', date: '2026-01-01', rating: '9' }).rating, null);
  assert.equal(entry({ title: '', date: '2026-01-01' }), null);
  assert.equal(entry({ title: 'X', date: 'n’importe quoi' }), null);
});

test('export : journal, avis, notes, vus, likes et envies fusionnés', () => {
  const r = fromFiles({ diary: DIARY, ratings: RATINGS, watched: WATCHED, reviews: REVIEWS, likes: LIKES, watchlist: WATCHLIST });
  const byTitle = (t) => r.entries.filter((e) => e.title === t);
  assert.equal(byTitle('Parasite').length, 2, 'deux visionnages (dont un revu)');
  assert.ok(byTitle('Parasite').every((e) => e.liked), 'like au niveau du film');
  const first = byTitle('Parasite').find((e) => e.date === '2026-09-30');
  assert.equal(first.rating, 5);
  assert.match(first.review, /chef-d'œuvre\.\nDeux lignes/);
  assert.deepEqual(first.tags, ['corée', 'thriller']);
  assert.equal(byTitle('Parasite').find((e) => e.rewatch).date, '2026-10-05');
  assert.equal(byTitle('Heat')[0].rating, 4, 'note reprise de ratings.csv');
  assert.equal(byTitle('Amélie, la belle')[0].rewatch, true);
  const alien = byTitle('Alien')[0];
  assert.equal(alien.approx, true);
  assert.equal(alien.date, '2026-08-10');
  assert.equal(alien.rating, 3.5);
  assert.equal(byTitle('Seven')[0].approx, true, 'noté sans être « vu » ni dans le journal');
  assert.equal(byTitle('Le Samouraï').length, 1);
  assert.equal(r.watchlist.length, 1);
  assert.equal(r.watchlist[0].title, 'Stalker');
  const f = films(r.entries).find((x) => x.title === 'Parasite');
  assert.equal(f.count, 2);
  assert.equal(f.rating, 5);
  assert.equal(f.liked, true);
});

test('fusion : même film le même jour = même visionnage, champs complétés', () => {
  const a = entry({ title: 'Heat', year: 1995, date: '2026-10-06', source: 'archive' });
  const b = entry({ title: 'Heat', year: 1995, date: '2026-10-06', rating: 4, tmdb: 949, poster: 'https://x/p.jpg', source: 'rss' });
  const m = mergeEntries([a], [b]);
  assert.equal(m.length, 1);
  assert.equal(m[0].tmdb, 949);
  assert.equal(m[0].rating, 4);
  assert.equal(m[0].source, 'rss');
});

const RSS = `<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel><title>Letterboxd - marie</title>
<item> <title>The Mosquito Bowl, 2026 - ★★</title> <link>https://letterboxd.com/marie/film/the-mosquito-bowl/</link> <guid isPermaLink="false">letterboxd-review-1558459026</guid> <letterboxd:watchedDate>2026-10-27</letterboxd:watchedDate> <letterboxd:rewatch>No</letterboxd:rewatch> <letterboxd:filmTitle>The Mosquito Bowl</letterboxd:filmTitle> <letterboxd:filmYear>2026</letterboxd:filmYear> <letterboxd:memberRating>2.0</letterboxd:memberRating> <letterboxd:memberLike>No</letterboxd:memberLike> <tmdb:movieId>1458300</tmdb:movieId> <description><![CDATA[ <p><img src="https://a.ltrbxd.com/resized/film-poster/1/3/mosquito-0-600.jpg?v=a8"/></p> <p>There have been “many” movies.</p><p>Second &amp; last.</p> ]]></description> </item>
<item> <title>Heat, 1995 - ★★★★½</title> <link>https://letterboxd.com/marie/film/heat-1995/</link> <guid isPermaLink="false">letterboxd-watch-99</guid> <letterboxd:watchedDate>2026-10-20</letterboxd:watchedDate> <letterboxd:rewatch>Yes</letterboxd:rewatch> <letterboxd:filmTitle>Heat</letterboxd:filmTitle> <letterboxd:filmYear>1995</letterboxd:filmYear> <letterboxd:memberRating>4.5</letterboxd:memberRating> <letterboxd:memberLike>Yes</letterboxd:memberLike> <tmdb:movieId>949</tmdb:movieId> <description><![CDATA[ <p><img src="https://a.ltrbxd.com/h.jpg"/></p> <p>Watched on Tuesday October 20, 2026.</p> ]]></description> </item>
<item> <title>CANNES 2026</title> <link>https://letterboxd.com/marie/list/cannes-2026/</link> <description><![CDATA[ <p>liste</p> ]]></description> </item>
</channel></rss>`;

test('flux RSS : entrées, avis, affiche, identifiant TMDB, listes ignorées', () => {
  const r = parseRss(RSS);
  assert.equal(r.user, 'marie');
  assert.equal(r.entries.length, 2);
  assert.equal(r.lists.length, 1);
  const [m, h] = r.entries;
  assert.equal(m.title, 'The Mosquito Bowl');
  assert.equal(m.year, 2026);
  assert.equal(m.rating, 2);
  assert.equal(m.tmdb, 1458300);
  assert.equal(m.poster, 'https://a.ltrbxd.com/resized/film-poster/1/3/mosquito-0-600.jpg?v=a8');
  assert.equal(m.review, 'There have been “many” movies.\n\nSecond & last.');
  assert.equal(h.review, '', 'la phrase « Watched on » n’est pas un avis');
  assert.equal(h.rewatch, true);
  assert.equal(h.liked, true);
  assert.equal(h.rating, 4.5);
  assert.equal(decode('A &amp; B &#233; &#x41;'), 'A & B é A');
  assert.equal(describe('<p>Watched on Monday.</p>').review, '');
});

function zip(files) {
  const parts = [], central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBuf = Buffer.from(name), data = Buffer.from(text), body = deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, body); central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cdb = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdb.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdb, end]);
}

test('archive ZIP : dossier racine, sous-dossiers ignorés, likes lus', async () => {
  const buf = zip([['letterboxd-marie-2026/diary.csv', DIARY], ['letterboxd-marie-2026/likes/films.csv', LIKES], ['letterboxd-marie-2026/lists/x.csv', 'a,b'], ['letterboxd-marie-2026/deleted/diary.csv', 'Date,Name\n2020-01-01,Fantôme'], ['letterboxd-marie-2026/watchlist.csv', WATCHLIST]]);
  const r = await readFiles([new File([buf], 'letterboxd-marie.zip')]);
  assert.ok(r.entries.some((e) => e.title === 'Parasite' && e.liked));
  assert.ok(!r.entries.some((e) => e.title === 'Fantôme'));
  assert.equal(r.watchlist.length, 1);
  await assert.rejects(() => readFiles([new File(['x'], 'photo.png')]), /Aucun fichier reconnu/);
  const csv = await readFiles([new File([DIARY], 'diary.csv'), new File([RATINGS], 'ratings.csv')]);
  assert.ok(csv.entries.find((e) => e.title === 'Heat').rating === 4);
});
