// Rétrospective : l'année en films, à regarder, copier ou partager en image.
import { barChart, donut } from '../charts.js';
import { filmHref, tile } from '../film-ui.js';
import { flag } from '../geo.js';
import { pref, setPref } from '../prefs.js';
import { retro, retroText, retroYears } from '../retro.js';
import { downloadImage, nativeShare, shareCanvas } from '../share.js';
import { metaOf, state } from '../state.js';
import { MONTHS_FR, WEEKDAYS_FR } from '../stats.js';
import { rank } from '../rank-ui.js';
import { card, delta, empty, kpi, seg } from '../ui.js';
import { fmtDate, h, put, toast } from '../util.js';
import { GENRE_COLORS, hm, num } from './dashboard.js';

let picked = 0;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dateOf = (e) => fmtDate(new Date(`${e.date}T12:00:00`), 'med');
const plural = (n, one, many = `${one}s`) => `${num(n)} ${n >= 2 ? many : one}`;

function rec(k, v, w, href) {
  return h(href ? 'a' : 'div', { class: 'rec', href: href || null }, h('span', { class: 'k' }, k), h('span', { class: 'v', style: 'font-size:20px' }, v), w && h('span', { class: 'w' }, w));
}

export function retroView(root) {
  const years = retroYears(state.entries);
  if (!years.length) return put(root, card('Rétrospective', null, empty('La rétrospective demande des visionnages datés : importe ton export Letterboxd ou charge ton profil.')));
  if (!years.includes(picked)) picked = years.includes(pref('retroYear', 0)) ? pref('retroYear', 0) : years[0];
  const body = h('div', { class: 'stack' });
  const who = state.settings.username;

  const draw = () => {
    const r = retro(picked, { entries: state.entries, metaOf });
    if (!r) return body.replaceChildren(empty('Aucun film cette année-là.'));
    const t = r.tot;
    const preview = h('div', { class: 'share-preview' }, h('p', { class: 'muted' }, 'Génération de l’image…'));
    let canvas = null;
    shareCanvas(r, who).then((c) => {
      canvas = c;
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', `Image de partage de la rétrospective ${r.year}`);
      preview.replaceChildren(c);
    }).catch(() => preview.replaceChildren(h('p', { class: 'muted' }, 'Image indisponible sur ce navigateur.')));
    const fileName = `clap-retrospective-${r.year}.png`;
    const copy = async () => { try { await navigator.clipboard.writeText(retroText(r, who)); toast('Résumé copié.'); } catch { toast('Copie impossible.'); } };
    const save = async () => { if (!canvas) return toast('Image en cours de génération…'); try { await downloadImage(canvas, fileName); } catch { toast('Téléchargement impossible.'); } };
    const share = async () => {
      if (!canvas) return toast('Image en cours de génération…');
      try { if (!(await nativeShare(canvas, fileName, retroText(r, who)))) await save(); } catch (e) { if (e && e.name !== 'AbortError') toast('Partage impossible.'); }
    };

    const monthBox = h('div'), histBox = h('div'), genreBox = h('div', { class: 'donut-row' });
    const slices = r.genres.map((g, i) => ({ label: g.name, color: GENRE_COLORS[i], value: g.count }));
    requestAnimationFrame(() => {
      barChart(monthBox, { height: 200, labelEvery: matchMedia('(min-width: 1100px)').matches ? 1 : undefined, format: (v) => `${v} visionnage${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: r.months.map((v, i) => ({ label: cap(MONTHS_FR[i].slice(0, 4)).replace(/\.$/, ''), value: v, tip: `<b>${cap(MONTHS_FR[i])}</b><br>${v} visionnage${v > 1 ? 's' : ''}` })) });
      barChart(histBox, { height: 170, labelEvery: 1, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: r.hist.map((b) => ({ label: String(b.rating).replace('.', ','), value: b.count, tip: `<b>${String(b.rating).replace('.', ',')} ★</b><br>${b.count} film${b.count > 1 ? 's' : ''}` })) });
      if (slices.length) donut(genreBox, { slices, format: (v) => `${v} film${v > 1 ? 's' : ''}`, center: [String(r.genres.length), 'genres'] });
      if (slices.length) genreBox.append(h('ul', null, slices.map((x) => h('li', null, h('span', { class: 'dot', style: `background:${x.color}` }), x.name || x.label, h('b', null, String(x.value))))));
    });

    const prevFilms = r.prev ? r.prev.films : 0;
    body.replaceChildren(
      h('section', { class: 'card retro-hero' },
        h('div', { class: 'eyebrow' }, `Rétrospective ${r.year}`),
        h('div', { class: 'retro-big' }, h('span', { class: 'serif', 'data-n': r.films.length, 'data-d': 0 }, num(r.films.length)), h('span', null, r.films.length > 1 ? 'films vus' : 'film vu')),
        h('p', { class: 'hero-sub' }, [t.minutes ? `${hm(t.minutes)} de cinéma` : null, t.avg ? `${num(t.avg, 2)} / 5 de moyenne` : null, r.countries.length ? plural(r.countries.length, 'pays') : null].filter(Boolean).join(' · ') || 'Les détails apparaissent quand les métadonnées sont chargées.'),
        r.prev ? h('div', { style: 'margin-top:8px' }, delta(r.films.length, prevFilms, `vs ${r.year - 1} (${prevFilms} films)`)) : null,
        h('div', { class: 'retro-persona' }, h('span', { class: 'pill good' }, 'Ton profil'), h('b', { class: 'serif' }, r.persona.name), h('span', { class: 'muted' }, r.persona.text)),
        h('div', { class: 'toolbar', style: 'margin-top:14px' },
          h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Télécharger l’image'),
          navigator.share ? h('button', { class: 'btn', type: 'button', onclick: share }, 'Partager') : null,
          h('button', { class: 'btn', type: 'button', onclick: copy }, 'Copier le texte'))),
      h('div', { class: 'grid cols-4' },
        kpi({ label: 'Visionnages', value: num(r.items.length), sub: h('span', { class: 'muted' }, `${t.rewatches} revisionnage${t.rewatches > 1 ? 's' : ''}`) }),
        kpi({ label: 'Coups de cœur', value: String(t.likes), sub: h('span', { class: 'muted' }, `${t.fives} film${t.fives > 1 ? 's' : ''} à 5 ★`) }),
        kpi({ label: 'Mois record', value: cap(MONTHS_FR[r.bestMonth]), sub: h('span', { class: 'muted' }, `${r.months[r.bestMonth]} visionnage${r.months[r.bestMonth] > 1 ? 's' : ''}`) }),
        kpi({ label: 'Jour favori', value: cap(WEEKDAYS_FR[r.weekday]), sub: h('span', { class: 'muted' }, 'le plus de films') })),
      r.top.length ? card('Tes coups de cœur', 'Les films les mieux notés de l’année', h('div', { class: 'tiles' }, r.top.map((f) => tile(f)))) : null,
      h('div', { class: 'grid cols-2' }, card('Mois par mois', 'Visionnages sur l’année', monthBox), card('Tes notes', `Répartition des ${t.rated} films notés`, histBox)),
      r.genres.length ? h('div', { class: 'grid cols-2' }, card('Genres', 'Les plus présents cette année', genreBox), card('Pays de production', `${r.countries.length} pays${r.newCountries.length ? ` dont ${r.newCountries.length} nouveau${r.newCountries.length > 1 ? 'x' : ''}` : ''}`, rank(r.countries, { limit: 6, prefix: (c) => `${flag(c.name)} ${c.name}` }), r.newCountries.length ? h('p', { class: 'muted', style: 'margin-top:12px;font-size:13px' }, `Nouveautés : ${r.newCountries.slice(0, 8).map((c) => `${flag(c)} ${c}`).join(', ')}${r.newCountries.length > 8 ? '…' : ''}.`) : null)) : null,
      r.directors.length || r.actors.length ? h('div', { class: 'grid cols-2' }, r.directors.length ? card('Réalisateurs', `${r.newDirectors} nouveau${r.newDirectors > 1 ? 'x' : ''} cette année`, rank(r.directors, { limit: 5 })) : null, r.actors.length ? card('Acteurs', 'Au moins 2 films', rank(r.actors, { limit: 5 })) : null) : null,
      card('Faits marquants', null, h('div', { class: 'grid cols-3' },
        rec('Premier film de l’année', r.first.title, dateOf(r.first), filmHref(r.first.key)),
        rec('Dernier film', r.last.title, dateOf(r.last), filmHref(r.last.key)),
        r.streak && r.streak.length >= 2 ? rec('Plus longue série', plural(r.streak.length, 'jour'), `${fmtDate(new Date(`${r.streak.start}T12:00:00`), 'short')} – ${fmtDate(new Date(`${r.streak.end}T12:00:00`), 'short')}`) : null,
        r.binges[0] ? rec('Plus gros marathon', plural(r.binges[0].count, 'film'), fmtDate(new Date(`${r.binges[0].date}T12:00:00`), 'full'), filmHref(r.binges[0].list[0].key)) : null,
        r.longest ? rec('Film le plus long', r.longest.title, hm(metaOf(r.longest.key).runtime), filmHref(r.longest.key)) : null,
        r.oldest && r.year - r.oldest.year >= 20 ? rec('Le plus ancien', r.oldest.title, `sorti en ${r.oldest.year}`, filmHref(r.oldest.key)) : null,
        r.mostRewatched && r.mostRewatched.count >= 2 ? rec('Le plus revu', r.mostRewatched.title, `${r.mostRewatched.count} visionnages`, filmHref(r.mostRewatched.key)) : null)),
      r.flops.length ? card('Les déceptions', 'Films notés 2 ★ ou moins', h('div', { class: 'tiles' }, r.flops.map((f) => tile(f)))) : null,
      card('Image à partager', 'Une carte prête à poster : elle ne contient que les chiffres de l’année, sans affiche', preview));
  };

  put(root, h('div', { class: 'toolbar' }, years.length <= 6
    ? seg(years.map((y) => [y, String(y)]), picked, (v) => { picked = v; setPref('retroYear', v); draw(); })
    : h('select', { 'aria-label': 'Année', onchange: (e) => { picked = Number(e.target.value); setPref('retroYear', picked); draw(); } }, years.map((y) => h('option', { value: y, selected: y === picked ? '' : null }, String(y))))), body);
  draw();
}
