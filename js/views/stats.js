// Statistiques détaillées : genres, personnes, pays, époques, durées et records.
import { barChart, donut, lineChart } from '../charts.js';
import { filmHref } from '../film-ui.js';
import { flag } from '../geo.js';
import { listModal } from '../list-modal.js';
import { pref, setPref } from '../prefs.js';
import { rank } from '../rank-ui.js';
import { MONTHS_FR, WEEKDAYS_FR, binges, byActor, byContinent, byCountry, byDecade, byDirector, byGenre, byLanguage, coverage, dated, filmAgeByYear, genreByYear, genreDecade, hoursBy, longestPause, mean, perMonthOfYear, perWeekday, perYear, runtimeBins, sagas, topStreaks, totals, weekdayMonth, weekdayRating } from '../stats.js';
import { metaOf, state } from '../state.js';
import { card, empty, kpi, labelWithHelp, legend, seg } from '../ui.js';
import { fmtDate, h, put } from '../util.js';
import { stackedColumns, heatGrid } from '../viz.js';
import { computeFacts, factCard } from './discover.js';
import { GENRE_COLORS, hm, num } from './dashboard.js';

let tab = pref('statsTab', 'apercu');
const TABS = [['apercu', 'Aperçu'], ['genres', 'Genres'], ['people', 'Personnes'], ['world', 'Pays et langues'], ['eras', 'Époques'], ['length', 'Durées'], ['rythme', 'Rythme'], ['evolution', 'Évolution'], ['croisements', 'Croisements']];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const MONTH_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const wide = () => matchMedia('(min-width: 1100px)').matches;
const day = (iso, k = 'med') => fmtDate(new Date(`${iso}T12:00:00`), k);

const notice = (fs) => {
  const cov = coverage(fs, metaOf, 'genres');
  if (cov >= 0.9) return null;
  const e = state.enrichment;
  return h('div', { class: 'callout' },
    h('b', null, `Métadonnées : ${Math.round(cov * 100)} % des films`),
    h('span', { style: 'font-size:13.5px' }, e && e.state === 'running' ? `Récupération en cours (${e.done} / ${e.total})… les statistiques se complètent au fil de l’eau.` : 'Les genres, durées et réalisateurs viennent de TMDB ou de Wikidata ; certains films obscurs n’y figurent pas.'), labelWithHelp('', 'coverage'));
};

export function statsView(root) {
  const fs = state.films;
  if (!fs.length) return put(root, card('Statistiques', null, empty('Aucun film à analyser.')));
  const body = h('div', { class: 'stack' });
  const real = dated(state.entries);

  const views = {
    apercu() {
      const years = perYear(real);
      const yb = h('div'), wb = h('div'), ab = h('div');
      requestAnimationFrame(() => {
        barChart(yb, { height: 200, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: years.map((y) => ({ label: String(y.year), value: y.items.length, tip: `<b>${y.year}</b><br>${y.items.length} films · ${hm(totals(y.items, metaOf).minutes) || ''}` })) });
        const days = perWeekday(real);
        barChart(wb, { height: 180, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((l, i) => ({ label: l, value: days[i], tip: `<b>${l}</b><br>${days[i]} films` })) });
        const pts = years.map((y) => ({ x: y.year, y: totals(y.items, metaOf).avg })).filter((p) => p.y);
        if (pts.length >= 2) lineChart(ab, { height: 180, yMin: 2, yMax: 5, series: [{ name: 'Note moyenne', color: '#7c5cff', points: pts, width: 2.6 }], xFormat: (v) => String(Math.round(v)), yFormat: (v) => num(v, 1), xTicks: pts.map((p) => ({ x: p.x, label: String(p.x) })).filter((_, i, a) => a.length < 8 || i % 2 === 0) });
        else ab.append(empty('Il faut au moins deux années notées.'));
      });
      const byLen = [...fs].map((f) => ({ f, r: (metaOf(f.key) || {}).runtime || 0 })).filter((x) => x.r);
      const longest = byLen.sort((a, b) => b.r - a.r)[0], shortest = byLen[byLen.length - 1];
      const oldest = [...fs].filter((f) => f.year).sort((a, b) => a.year - b.year)[0];
      const newest = [...fs].filter((f) => f.year).sort((a, b) => b.year - a.year)[0];
      const most = [...fs].sort((a, b) => b.count - a.count)[0];
      const busiest = binges(real, 2)[0];
      const streak = topStreaks(real, 1)[0];
      const tot = totals(state.entries, metaOf);
      const rec = (k, f, v) => (f ? h('a', { class: 'rec', href: filmHref(f.key) }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, f.title), h('span', { class: 'w' }, v)) : null);
      const dirsN = byDirector(fs, metaOf).length, ctrN = byCountry(fs, metaOf).length;
      return [
        h('div', { class: 'grid cols-4' },
          kpi({ label: 'Films différents', value: num(fs.length), count: { n: fs.length, d: 0 }, sub: h('span', { class: 'muted' }, `${num(tot.views)} visionnages`) }),
          kpi({ label: 'Heures de cinéma', value: tot.minutes ? num(tot.minutes / 60) : '—', unit: tot.minutes ? 'h' : '', count: tot.minutes ? { n: tot.minutes / 60, d: 0 } : null, sub: h('span', { class: 'muted' }, tot.minutes ? `${num(tot.minutes / 1440, 1)} jours entiers` : 'durées en cours de chargement') }),
          kpi({ label: 'Pays', value: ctrN ? String(ctrN) : '—', count: ctrN ? { n: ctrN, d: 0 } : null, sub: h('span', { class: 'muted' }, ctrN ? `${byContinent(fs, metaOf).length} continents` : 'métadonnées en cours') }),
          kpi({ label: 'Réalisateurs', value: dirsN ? num(dirsN) : '—', count: dirsN ? { n: dirsN, d: 0 } : null, sub: h('span', { class: 'muted' }, dirsN ? 'différents' : 'métadonnées en cours') })),
        card('Records', 'Tes extrêmes', h('div', { class: 'grid cols-3' },
          rec('Le plus long', longest && longest.f, longest && `${longest.f.year || ''} · ${hm(longest.r)}`),
          rec('Le plus court', shortest && shortest.f, shortest && `${shortest.f.year || ''} · ${hm(shortest.r)}`),
          rec('Le plus ancien', oldest, oldest && String(oldest.year)),
          rec('Le plus récent', newest, newest && String(newest.year)),
          rec('Le plus revu', most && most.count > 1 ? most : null, most && `${most.count} visionnages`),
          busiest ? h('a', { class: 'rec', href: filmHref(busiest.list[0].key) }, h('span', { class: 'k' }, 'Journée la plus chargée'), h('span', { class: 'v' }, `${busiest.count} films`), h('span', { class: 'w' }, day(busiest.date, 'full'))) : null,
          streak && streak.length >= 2 ? h('div', { class: 'rec' }, h('span', { class: 'k' }, 'Plus longue série'), h('span', { class: 'v' }, `${streak.length} jours`), h('span', { class: 'w' }, `${day(streak.start, 'short')} – ${day(streak.end)}`)) : null)),
        h('div', { class: 'grid cols-2' }, card('Films par année', 'Année de visionnage', yb), card('Note moyenne par année', 'Évolution de ton exigence', ab)),
        card('Jours de la semaine', 'Quand tu regardes tes films', wb),
      ];
    },
    genres() {
      const g = byGenre(fs, metaOf);
      const best = [...g].filter((x) => x.rated >= 3).sort((a, b) => b.adjusted - a.adjusted);
      const hrs = hoursBy(state.entries.filter((e) => !e.approx), metaOf, (m) => m.genres).slice(0, 10);
      const hrsRows = hrs.map((x) => ({ name: x.name, count: Math.round(x.minutes / 60), films: (g.find((y) => y.name === x.name) || {}).films, avg: (g.find((y) => y.name === x.name) || {}).avg }));
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Genres les plus vus', 'Nombre de films et note moyenne · clique une ligne pour voir les films', rank(g, { limit: 14 })), card(labelWithHelp('Genres les mieux notés', 'adjusted'), 'Note ajustée (au moins 3 films notés)', rank(best, { limit: 14, adjusted: true }))),
        hrsRows.length ? card('Temps passé par genre', 'Heures de visionnage (un revisionnage compte à nouveau)', rank(hrsRows, { limit: 10, count: (r) => `${num(r.count)} h` })) : null];
    },
    people() {
      const d = byDirector(fs, metaOf), a = byActor(fs, metaOf);
      const best = d.filter((x) => x.rated >= 3).sort((x, y) => y.adjusted - x.adjusted);
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Réalisateurs les plus vus', 'Au moins 2 films', rank(d.filter((x) => x.count >= 2), { limit: 15 })), card(labelWithHelp('Réalisateurs les mieux notés', 'adjusted'), 'Au moins 3 films notés', rank(best, { limit: 15, adjusted: true }))),
        card('Acteurs les plus vus', state.config.tmdb ? 'Au moins 3 films' : 'Disponible quand la clé TMDB est configurée côté serveur', state.config.tmdb ? rank(a.filter((x) => x.count >= 3), { limit: 15 }) : empty('Les acteurs viennent de TMDB (clé gratuite à ajouter dans les variables d’environnement du serveur).'))];
    },
    world() {
      const c = byCountry(fs, metaOf), l = byLanguage(fs, metaOf), k = byContinent(fs, metaOf);
      const slices = k.map((x, i) => ({ label: x.name, color: GENRE_COLORS[i], value: x.count }));
      const donutBox = h('div', { class: 'donut-row' });
      requestAnimationFrame(() => {
        if (!slices.length) return;
        donut(donutBox, { slices, format: (v) => `${v} film${v > 1 ? 's' : ''}`, center: [String(k.length), k.length > 1 ? 'continents' : 'continent'] });
        donutBox.append(h('ul', null, slices.map((x) => h('li', null, h('span', { class: 'dot', style: `background:${x.color}` }), x.label, h('b', null, String(x.value))))));
      });
      return [notice(fs),
        slices.length ? h('div', { class: 'grid cols-2' }, card('Continents', 'D’où viennent tes films (une co-production compte pour chaque continent)', donutBox),
          card('Mur des drapeaux', `${c.length} pays découverts`, h('div', { class: 'flags' }, c.map((x) => h('button', { class: 'flag-chip', type: 'button', title: `${x.name} : ${x.count} film${x.count > 1 ? 's' : ''}`, onclick: () => listModal({ title: x.name, sub: `${x.count} film${x.count > 1 ? 's' : ''}`, films: x.films }) }, h('span', { 'aria-hidden': 'true' }, flag(x.name)), h('b', null, x.name), h('small', null, String(x.count))))))) : null,
        h('div', { class: 'grid cols-2' }, card('Pays de production', `${c.length} pays découverts`, rank(c, { limit: 14, prefix: (x) => `${flag(x.name)} ${x.name}` })), card('Langues originales', `${l.length} langues`, rank(l, { limit: 10 })))];
    },
    eras() {
      const d = byDecade(fs, metaOf);
      const eb = h('div');
      const gap = fs.filter((f) => f.year).map((f) => new Date(f.last).getFullYear() - f.year);
      const recent = gap.length ? gap.filter((v) => v <= 2).length / gap.length : 0;
      requestAnimationFrame(() => barChart(eb, { height: 220, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: d.map((x) => ({ label: x.name, value: x.count, tip: `<b>${x.name}</b><br>${x.count} films${x.avg ? ` · ${num(x.avg, 2)} / 5` : ''}` })) }));
      return [h('div', { class: 'grid cols-2' }, card('Films par décennie de sortie', 'Quand ont été tournés les films que tu regardes', eb), card('Note moyenne par décennie', null, rank(d.map((x) => ({ ...x })).sort((a, b) => (b.avg || 0) - (a.avg || 0)), { limit: 12 }))),
        card('Âge des films', 'Écart entre la sortie et ton visionnage', h('div', { class: 'grid cols-3' },
          h('div', { class: 'rec' }, h('span', { class: 'k' }, 'Âge médian'), h('span', { class: 'v' }, gap.length ? `${[...gap].sort((a, b) => a - b)[Math.floor(gap.length / 2)]} ans` : '—')),
          h('div', { class: 'rec' }, h('span', { class: 'k' }, 'Sortis depuis moins de 2 ans'), h('span', { class: 'v' }, `${Math.round(recent * 100)} %`)),
          h('div', { class: 'rec' }, h('span', { class: 'k' }, 'Avant 1970'), h('span', { class: 'v' }, `${Math.round((fs.filter((f) => f.year && f.year < 1970).length / Math.max(1, fs.filter((f) => f.year).length)) * 100)} %`))))];
    },
    length() {
      const bins = runtimeBins(fs, metaOf);
      const lb = h('div');
      const known = fs.filter((f) => (metaOf(f.key) || {}).runtime);
      requestAnimationFrame(() => barChart(lb, { height: 210, format: (v) => `${v} film${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: bins.map((b) => ({ label: b.label, value: b.count, tip: `<b>${b.label}</b><br>${b.count} films${b.avg ? ` · ${num(b.avg, 2)} / 5` : ''}` })) }));
      const avg = mean(known.map((f) => metaOf(f.key).runtime));
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Répartition des durées', avg ? `Durée moyenne : ${hm(avg)}` : 'Durées en cours de chargement', lb), card('Note moyenne selon la durée', 'Les films longs te plaisent-ils plus ?', rank(bins.map((b) => ({ name: b.label, count: b.count, avg: b.avg })).filter((b) => b.count), { limit: 5 })))];
    },
    rythme() {
      const wm = weekdayMonth(real), mo = perMonthOfYear(real), bg = binges(real, 3), ts = topStreaks(real, 5), pause = longestPause(real), wr = weekdayRating(real.filter((e) => e.rating));
      const mb = h('div'), rb = h('div');
      requestAnimationFrame(() => {
        barChart(mb, { height: 190, labelEvery: wide() ? 1 : undefined, format: (v) => `${v} visionnage${v > 1 ? 's' : ''}`, tickFormat: (v) => v, data: mo.map((v, i) => ({ label: MONTH_SHORT[i], value: v, tip: `<b>${cap(MONTHS_FR[i])}</b><br>${v} visionnage${v > 1 ? 's' : ''}` })) });
        const ok = wr.some((x) => x.n >= 5);
        if (ok) barChart(rb, { height: 190, color: '#10b0a0', format: (v) => `${num(v, 2)} ★`, tickFormat: (v) => num(v, 1), data: wr.map((x, i) => ({ label: cap(WEEKDAYS_FR[i].slice(0, 3)), value: x.n >= 5 ? Math.round(x.avg * 100) / 100 : 0, tip: `<b>${cap(WEEKDAYS_FR[i])}</b><br>${x.n >= 5 ? `${num(x.avg, 2)} ★ sur ${x.n} visionnages notés` : 'pas assez de notes'}` })) });
        else rb.append(empty('Il faut quelques visionnages notés par jour de semaine.'));
      });
      const row = (left, mid, right, href) => h(href ? 'a' : 'div', { class: 'item', href: href || null, style: 'padding:9px 0' }, h('div', null, h('div', { class: 't', style: 'font-size:14px' }, left), mid && h('div', { class: 's' }, mid)), h('div', { class: 'r' }, right));
      return [card('Quand regardes-tu ?', 'Jour de semaine × mois (nombre de visionnages)', heatGrid({ rows: WEEKDAYS_FR.map(cap), cols: MONTH_SHORT, value: (r, c) => wm[r][c], caption: 'Visionnages par jour de semaine et par mois', tipHtml: (r, c, v) => `<div class="tt-h">${cap(WEEKDAYS_FR[r])} · ${MONTHS_FR[c]}</div><b>${v} visionnage${v > 1 ? 's' : ''}</b>` })),
        h('div', { class: 'grid cols-2' }, card('Saisons du cinéma', 'Visionnages par mois, toutes années confondues', mb), card('Humeur selon le jour', 'Note moyenne des visionnages notés', rb)),
        h('div', { class: 'grid cols-2' },
          card('Séries et pauses', 'Tes plus longues séries de jours consécutifs',
            ts.length && ts[0].length >= 2 ? ts.filter((x) => x.length >= 2).map((x) => row(`${x.length} jours d’affilée`, `${day(x.start, 'short')} – ${day(x.end)}`, null)) : empty('Pas encore de série de deux jours.'),
            pause && pause.days >= 7 ? h('p', { class: 'muted', style: 'margin-top:12px;font-size:13px' }, `Plus longue pause : ${pause.days} jours, du ${day(pause.from, 'short')} au ${day(pause.to)}.`) : null),
          card('Jours marathon', 'Au moins 3 films le même jour', bg.length ? bg.slice(0, 8).map((b) => row(day(b.date, 'full'), b.list.slice(0, 4).map((e) => e.title).join(', ') + (b.count > 4 ? '…' : ''), `${b.count} films`, filmHref(b.list[0].key))) : empty('Aucune journée à 3 films ou plus.')))];
    },
    evolution() {
      const gy = genreByYear(real, metaOf, 6), ages = filmAgeByYear(real).filter((x) => x.n >= 3), py = perYear(real);
      const ageBox = h('div'), hrsBox = h('div'), ctrBox = h('div');
      const seen = new Set();
      const cum = py.map((y) => { for (const e of y.items) for (const c of (metaOf(e.key) || {}).countries || []) seen.add(c); return { year: y.year, n: seen.size }; });
      requestAnimationFrame(() => {
        if (ages.length >= 2) lineChart(ageBox, { height: 190, series: [{ name: 'Âge moyen', color: '#e5484d', points: ages.map((a) => ({ x: a.year, y: Math.round(a.age * 10) / 10 })), width: 2.6 }], xFormat: (v) => String(Math.round(v)), yFormat: (v) => `${num(v, 0)} ans`, xTicks: ages.map((a) => ({ x: a.year, label: String(a.year) })) });
        else ageBox.append(empty('Il faut au moins deux années avec trois films.'));
        barChart(hrsBox, { height: 190, color: '#2f80ed', format: (v) => `${v} h`, tickFormat: (v) => v, data: py.map((y) => { const m = Math.round(totals(y.items, metaOf).minutes / 60); return { label: String(y.year), value: m, tip: `<b>${y.year}</b><br>${m} h de cinéma` }; }) });
        if (cum.length >= 2 && cum[cum.length - 1].n > 0) lineChart(ctrBox, { height: 190, yMin: 0, yMax: Math.max(4, Math.ceil(cum[cum.length - 1].n * 1.1)), series: [{ name: 'Pays découverts', color: '#10b0a0', points: cum.map((c) => ({ x: c.year, y: c.n })), width: 2.6 }], xFormat: (v) => String(Math.round(v)), yFormat: (v) => `${num(v, 0)} pays`, xTicks: cum.map((c) => ({ x: c.year, label: String(c.year) })) });
        else ctrBox.append(empty('Les pays apparaissent quand les métadonnées sont chargées.'));
      });
      const palette = GENRE_COLORS.slice(0, gy.genres.length);
      return [notice(fs),
        gy.years.length >= 2 && gy.genres.length ? card('Évolution de tes genres', 'Part de chaque genre parmi tes six genres principaux, année par année',
          stackedColumns({ labels: gy.years.map(String), series: gy.genres.map((g, i) => ({ name: g, color: palette[i], values: gy.counts.map((r) => r[i]) })) }),
          legend(gy.genres.map((g, i) => [g, palette[i]]))) : card('Évolution de tes genres', null, empty('Il faut au moins deux années de visionnage et des genres connus.')),
        h('div', { class: 'grid cols-2' }, card('Âge des films regardés', 'Écart moyen entre la sortie du film et ton visionnage', ageBox), card('Heures de cinéma par année', 'Durée cumulée des films vus', hrsBox)),
        card('Tour du monde', 'Nombre cumulé de pays de production découverts', ctrBox)];
    },
    croisements() {
      const gd = genreDecade(fs, metaOf, 10);
      const f = computeFacts().filter((x) => /^(corr-|vs-public|contrarian|letdown)/.test(x.id));
      const sg = sagas(fs, metaOf, 2);
      return [notice(fs),
        gd.genres.length && gd.decades.length ? card('Genres × décennies', 'Nombre de films (survole une case pour la note moyenne)', heatGrid({ rows: gd.genres, cols: gd.decades.map((d) => d.slice(0, 4)), value: (r, c) => gd.cells[r][c].count, caption: 'Films par genre et par décennie de sortie', tipHtml: (r, c, v) => `<div class="tt-h">${gd.genres[r]} · années ${gd.decades[c].slice(0, 4)}</div><b>${v} film${v > 1 ? 's' : ''}</b>${gd.cells[r][c].avg ? `<br>${num(gd.cells[r][c].avg, 2)} ★ de moyenne` : ''}` })) : card('Genres × décennies', null, empty('Les genres apparaissent quand les métadonnées sont chargées.')),
        card('Ce que tes notes révèlent', 'Liens entre tes notes et les caractéristiques des films', f.length ? h('div', { class: 'facts' }, f.map((x) => factCard(x))) : empty('Il faut une vingtaine de films notés avec leurs métadonnées pour dégager des liens.')),
        card('Sagas et collections', state.config.tmdb ? 'Films vus d’une même saga (au moins deux)' : 'Les sagas viennent de TMDB : disponible quand la clé est configurée côté serveur', sg.length ? rank(sg.map((x) => ({ name: x.name, count: x.count, avg: x.avg, films: x.films })), { limit: 12 }) : empty('Aucune saga complète repérée pour le moment.'))];
    },
  };

  const draw = () => body.replaceChildren(...[].concat(views[tab]()).filter(Boolean));
  put(root, h('div', { class: 'toolbar' }, seg(TABS, tab, (v) => { tab = v; setPref('statsTab', v); draw(); })), body);
  draw();
}
