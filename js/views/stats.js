// Statistiques détaillées : genres, personnes, pays, époques, durées et records.
import { barChart, lineChart } from '../charts.js';
import { filmHref, starsEl } from '../film-ui.js';
import { pref, setPref } from '../prefs.js';
import { byActor, byCountry, byDecade, byDirector, byGenre, byLanguage, coverage, dated, mean, perWeekday, perYear, runtimeBins, totals } from '../stats.js';
import { metaOf, state } from '../state.js';
import { card, empty, labelWithHelp, seg } from '../ui.js';
import { fmtDate, h, put } from '../util.js';
import { hm, num } from './dashboard.js';

let tab = pref('statsTab', 'apercu');
const TABS = [['apercu', 'Aperçu'], ['genres', 'Genres'], ['people', 'Personnes'], ['world', 'Pays et langues'], ['eras', 'Époques'], ['length', 'Durées']];

// Liste classée : nom, barre proportionnelle au nombre de films, note moyenne.
function rank(rows, { limit = 12, adjusted = false, unit = 'film' } = {}) {
  if (!rows.length) return empty('Pas assez de données pour cette liste.');
  const max = Math.max(...rows.map((r) => r.count));
  return h('div', { class: 'rank' }, rows.slice(0, limit).map((r) => {
    const note = adjusted ? r.adjusted : r.avg;
    return h('div', { class: 'rank-row' },
      h('div', { class: 'rank-name' }, r.name),
      h('div', { class: 'rank-bar' }, h('div', { style: `width:${(r.count / max) * 100}%` })),
      h('div', { class: 'rank-n' }, `${r.count} ${unit}${r.count > 1 ? 's' : ''}`),
      h('div', { class: 'rank-avg' }, note ? [starsEl(Math.round(note * 2) / 2), h('small', null, num(note, 1))] : '—'));
  }));
}

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
      const day = (() => { const m = new Map(); for (const e of real) m.set(e.date, (m.get(e.date) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1])[0]; })();
      const rec = (k, f, v) => (f ? h('a', { class: 'rec', href: filmHref(f.key) }, h('span', { class: 'k' }, k), h('span', { class: 'v' }, f.title), h('span', { class: 'w' }, v)) : null);
      return [
        card('Records', 'Tes extrêmes', h('div', { class: 'grid cols-3' },
          rec('Le plus long', longest && longest.f, longest && `${longest.f.year || ''} · ${hm(longest.r)}`),
          rec('Le plus court', shortest && shortest.f, shortest && `${shortest.f.year || ''} · ${hm(shortest.r)}`),
          rec('Le plus ancien', oldest, oldest && String(oldest.year)),
          rec('Le plus récent', newest, newest && String(newest.year)),
          rec('Le plus revu', most && most.count > 1 ? most : null, most && `${most.count} visionnages`),
          day ? h('div', { class: 'rec' }, h('span', { class: 'k' }, 'Journée la plus chargée'), h('span', { class: 'v' }, `${day[1]} films`), h('span', { class: 'w' }, fmtDate(new Date(`${day[0]}T12:00:00`), 'full'))) : null)),
        h('div', { class: 'grid cols-2' }, card('Films par année', 'Année de visionnage', yb), card('Note moyenne par année', 'Évolution de ton exigence', ab)),
        card('Jours de la semaine', 'Quand tu regardes tes films', wb),
      ];
    },
    genres() {
      const g = byGenre(fs, metaOf);
      const best = [...g].filter((x) => x.rated >= 3).sort((a, b) => b.adjusted - a.adjusted);
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Genres les plus vus', 'Nombre de films et note moyenne', rank(g, { limit: 14 })), card(labelWithHelp('Genres les mieux notés', 'adjusted'), 'Note ajustée (au moins 3 films notés)', rank(best, { limit: 14, adjusted: true })))];
    },
    people() {
      const d = byDirector(fs, metaOf), a = byActor(fs, metaOf);
      const best = d.filter((x) => x.rated >= 3).sort((x, y) => y.adjusted - x.adjusted);
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Réalisateurs les plus vus', 'Au moins 2 films', rank(d.filter((x) => x.count >= 2), { limit: 15 })), card(labelWithHelp('Réalisateurs les mieux notés', 'adjusted'), 'Au moins 3 films notés', rank(best, { limit: 15, adjusted: true }))),
        card('Acteurs les plus vus', state.config.tmdb ? 'Au moins 3 films' : 'Disponible quand la clé TMDB est configurée côté serveur', state.config.tmdb ? rank(a.filter((x) => x.count >= 3), { limit: 15 }) : empty('Les acteurs viennent de TMDB (clé gratuite à ajouter dans les variables d’environnement du serveur).'))];
    },
    world() {
      const c = byCountry(fs, metaOf), l = byLanguage(fs, metaOf);
      return [notice(fs), h('div', { class: 'grid cols-2' }, card('Pays de production', `${c.length} pays découverts`, rank(c, { limit: 14 })), card('Langues originales', `${l.length} langues`, rank(l, { limit: 10 })))];
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
  };

  const draw = () => body.replaceChildren(...[].concat(views[tab]()).filter(Boolean));
  put(root, h('div', { class: 'toolbar' }, seg(TABS, tab, (v) => { tab = v; setPref('statsTab', v); draw(); })), body);
  draw();
}
