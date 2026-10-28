// Mon profil : indices de goût sur 100, ce que tu aimes, écart avec le grand public et pistes à explorer.
import { filmHref, starsEl } from '../film-ui.js';
import { byDecade, byDirector, byGenre, mean } from '../stats.js';
import { metaOf, state } from '../state.js';
import { profile } from '../taste.js';
import { card, empty, labelWithHelp, progress, ring } from '../ui.js';
import { h, put } from '../util.js';
import { num } from './dashboard.js';

const LEVELS = ['Faible', 'Modéré', 'Marqué', 'Fort', 'Très fort'];
const STYLES = {
  world: ['Explorateur du monde', 'Tu voyages bien au-delà d’Hollywood.'],
  classics: ['Cinéphile classique', 'Tu fréquentes les grands films du passé.'],
  obscure: ['Chasseur de pépites', 'Tu déniches des films que peu de gens ont vus.'],
  rewatch: ['Fidèle', 'Tu aimes revoir tes films préférés.'],
  volume: ['Grand mangeur de films', 'Tu enchaînes les séances.'],
  severity: ['Critique exigeant', 'Une note élevée, chez toi, se mérite.'],
  diversity: ['Curieux sans frontières', 'Tes goûts couvrent genres, pays et époques.'],
  regularity: ['Rituel quotidien', 'Le cinéma rythme tes semaines.'],
};

function gauge(ix) {
  const fill = h('div', { class: 'lv-fill', style: 'background:var(--accent)' });
  const thumb = h('div', { class: 'lv-thumb' }, h('span', null, ix.ready ? String(ix.score) : '–'));
  const track = h('div', { class: 'lv-track', role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': ix.ready ? ix.score : 0, 'aria-label': ix.ready ? `${ix.label} : ${ix.score} sur 100, ${ix.level.toLowerCase()}` : `${ix.label} : pas assez de données` }, fill, thumb, [20, 40, 60, 80].map((t) => h('i', { class: 'lv-tick', style: `left:${t}%` })));
  if (ix.ready) requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${ix.score}%`; thumb.style.left = `${ix.score}%`; }));
  const help = { severity: 'severity', obscure: 'obscure', diversity: 'diversity' }[ix.id];
  return h('div', { class: `lv-row${ix.ready ? '' : ' off'}` },
    h('div', { class: 'lv-head' }, h('b', null, help ? labelWithHelp(ix.label, help) : ix.label), ix.ready ? h('span', { class: 'pill good' }, ix.level) : h('span', { class: 'muted' }, 'Pas assez de données')),
    track, h('div', { class: 'lv-scale', 'aria-hidden': 'true' }, LEVELS.map((n) => h('span', null, n))),
    h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, ix.text));
}

export function tasteView(root) {
  const fs = state.films;
  if (fs.length < 5) return put(root, card('Mon profil', null, empty('Il faut au moins 5 films pour dessiner un profil de goût.')));
  const idx = profile({ entries: state.entries, films: fs, metaOf });
  const ready = idx.filter((x) => x.ready);
  const top = [...ready].sort((a, b) => b.score - a.score).filter((x) => STYLES[x.id] && x.score >= 40).slice(0, 2);
  const lead = top[0] ? STYLES[top[0].id] : ['Cinéphile en construction', 'Plus tu notes de films, plus ton profil se précise.'];
  const rated = fs.filter((f) => f.rating);
  const avg = mean(rated.map((f) => f.rating));

  const genres = byGenre(fs, metaOf).filter((g) => g.rated >= 3);
  const dirs = byDirector(fs, metaOf).filter((g) => g.rated >= 2);
  const loves = [...genres].sort((a, b) => b.adjusted - a.adjusted).slice(0, 5);
  const hates = [...genres].sort((a, b) => a.adjusted - b.adjusted).filter((g) => g.adjusted < (avg || 3)).slice(0, 4);
  const list = (rows, adjusted = true) => (rows.length ? h('div', { class: 'rank' }, rows.map((r) => h('div', { class: 'rank-row' }, h('div', { class: 'rank-name' }, r.name), h('div', { class: 'rank-n' }, `${r.rated} notés`), h('div', { class: 'rank-avg' }, starsEl(Math.round((adjusted ? r.adjusted : r.avg) * 2) / 2), h('small', null, num(adjusted ? r.adjusted : r.avg, 1)))))) : empty('Pas assez de films notés.'));

  // écart avec le grand public (TMDB, note sur 10 → 5)
  const gap = rated.map((f) => ({ f, m: metaOf(f.key) })).filter((x) => x.m && x.m.avg > 0 && x.m.votes >= 200).map((x) => ({ ...x, d: f1(x.f.rating - x.m.avg / 2) }));
  function f1(v) { return Math.round(v * 10) / 10; }
  const meanGap = gap.length >= 10 ? mean(gap.map((x) => x.d)) : null;
  const divergent = [...gap].sort((a, b) => b.d - a.d);
  const rowFilm = (x, up) => h('a', { class: 'item', href: filmHref(x.f.key), style: 'padding:8px 0' }, h('div', null, h('div', { class: 't', style: 'font-size:13.5px' }, x.f.title), h('div', { class: 's' }, `${x.f.year || ''} · toi ${num(x.f.rating, 1)} · public ${num(x.m.avg / 2, 1)}`)), h('div', { class: 'r' }, h('b', { style: `color:var(--${up ? 'good' : 'bad'}-text)` }, `${x.d > 0 ? '+' : ''}${num(x.d, 1)}`)));

  const dirsToFollow = dirs.filter((d) => d.count <= 3 && d.avg >= 4.5).slice(0, 6);
  const decades = byDecade(fs, metaOf).filter((d) => d.rated >= 3).sort((a, b) => b.adjusted - a.adjusted)[0];

  put(root,
    h('section', { class: 'card lv-hero' },
      h('div', { class: 'lv-ring', role: 'img', 'aria-label': `${ready.length} indices évalués sur ${idx.length}` }, ring({ value: ready.length / idx.length, color: 'var(--accent)', center: [String(ready.length), `/ ${idx.length}`] })),
      h('div', { class: 'lv-hero-text' },
        h('div', { class: 'eyebrow' }, 'Ton profil'),
        h('h2', { class: 'hello' }, lead[0]),
        h('p', { class: 'hero-sub' }, `${lead[1]} ${top[1] ? `${STYLES[top[1].id][1]} ` : ''}Profil établi sur ${num(fs.length)} films dont ${num(rated.length)} notés${avg ? `, note moyenne ${num(avg, 2)} / 5` : ''}.`),
        h('div', { class: 'lv-chips' }, ready.length < idx.length ? h('span', { class: 'pill warn' }, `${idx.length - ready.length} indice${idx.length - ready.length > 1 ? 's' : ''} en attente de données`) : null))),
    card('Tes indices', 'Chaque indice va de 0 à 100 ; le texte dit ce qu’il mesure', h('div', { class: 'stack lv-rows' }, ...idx.map(gauge))),
    h('div', { class: 'grid cols-2' },
      card(labelWithHelp('Ce que tu aimes', 'adjusted'), 'Genres les mieux notés (au moins 3 films notés)', list(loves)),
      card('Ce qui te plaît moins', 'Genres notés en dessous de ta moyenne', list(hates))),
    meanGap != null ? card('Toi face au grand public', `Écart entre ta note et celle de TMDB (ramenée sur 5), sur ${gap.length} films`,
      h('p', { style: 'margin-bottom:12px;font-size:14px' }, meanGap > 0.15 ? `Tu notes plus généreusement que le public : ${num(meanGap, 2)} point de plus en moyenne.` : meanGap < -0.15 ? `Tu es plus sévère que le public : ${num(Math.abs(meanGap), 2)} point de moins en moyenne.` : 'Tes notes suivent de près celles du public.'),
      h('div', { class: 'grid cols-2' }, h('div', null, h('h3', { class: 'sub-h' }, 'Tes coups de cœur incompris'), ...divergent.slice(0, 5).map((x) => rowFilm(x, true))), h('div', null, h('h3', { class: 'sub-h' }, 'Les films que tu aimes moins que tout le monde'), ...divergent.slice(-5).reverse().map((x) => rowFilm(x, false))))) : null,
    card('À approfondir', 'Réalisateurs dont tu as adoré 1 à 3 films (note moyenne de 4,5 et plus) : le reste de leur filmographie t’attend',
      dirsToFollow.length ? h('div', { class: 'rank' }, dirsToFollow.map((d) => h('div', { class: 'rank-row' }, h('div', { class: 'rank-name' }, d.name), h('div', { class: 'rank-n' }, `${d.count} film${d.count > 1 ? 's' : ''}`), h('div', { class: 'rank-avg' }, starsEl(Math.round(d.avg * 2) / 2), h('small', null, num(d.avg, 1)))))) : empty('Pas encore assez de réalisateurs suivis : les métadonnées se chargent.'),
      decades ? h('p', { class: 'muted', style: 'font-size:13px;margin-top:10px' }, `Ta décennie préférée : les années ${decades.name.slice(0, 4)} (${num(decades.adjusted, 1)} / 5 en note ajustée).`) : null),
    h('p', { class: 'muted', style: 'font-size:12.5px' }, 'Ces indices décrivent tes habitudes ; ce ne sont pas des jugements de goût. Les barèmes sont des repères choisis pour être lisibles, pas des statistiques de population.'));
}
