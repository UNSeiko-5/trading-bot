// Visualisations propres à Clap : radar, carte thermique et colonnes empilées (HTML et SVG, sans dépendance).
import { tip } from './charts.js';
import { h } from './util.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
};
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Survol à la souris et au doigt pour un élément HTML.
function hover(el, html) {
  const show = (e) => tip.show(html(), e.clientX, e.clientY);
  el.addEventListener('pointermove', show);
  el.addEventListener('pointerdown', show);
  el.addEventListener('pointerleave', tip.hide);
  el.addEventListener('focus', () => { const r = el.getBoundingClientRect(); tip.show(html(), r.left + r.width / 2 - 16, r.top); });
  el.addEventListener('blur', tip.hide);
}

// Radar : `axes` = [{ label, value (0–100) | null }]. Les axes sans valeur restent au centre et sont grisés.
export function radarChart({ axes, size = 340, label = 'Profil' }) {
  const cx = size / 2, cy = size / 2 + 4, R = size * 0.31;
  const n = axes.length;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const root = svg('svg', { viewBox: `0 0 ${size} ${size + 8}`, class: 'chart radar', role: 'img', 'aria-label': `${label} : ${axes.map((a) => `${a.label} ${a.value == null ? 'indisponible' : a.value}`).join(', ')}` });
  for (const k of [0.25, 0.5, 0.75, 1]) root.append(svg('polygon', { points: axes.map((_, i) => pt(i, R * k).join(',')).join(' '), fill: 'none', stroke: 'var(--line-2)', 'stroke-width': k === 1 ? 1.2 : 0.8, 'stroke-dasharray': k === 1 ? null : '2 4' }));
  axes.forEach((_, i) => root.append(svg('line', { x1: cx, y1: cy, x2: pt(i, R)[0], y2: pt(i, R)[1], stroke: 'var(--line)', 'stroke-width': 0.8 })));
  const pts = axes.map((a, i) => pt(i, R * ((a.value ?? 0) / 100)));
  root.append(
    svg('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill: 'color-mix(in srgb, var(--accent) 24%, transparent)', stroke: 'var(--accent)', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }),
    ...pts.map((p, i) => svg('circle', { cx: p[0], cy: p[1], r: axes[i].value == null ? 0 : 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 })));
  axes.forEach((a, i) => {
    const [x, y] = pt(i, R + 22);
    const anchor = Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end';
    const t = svg('text', { x, y: y + 4, 'text-anchor': anchor, class: 'tick', style: `font-size:12px;font-weight:600;${a.value == null ? 'opacity:.55' : 'fill:var(--text)'}` }, a.label);
    root.append(t);
    if (a.value != null) root.append(svg('text', { x, y: y + 17, 'text-anchor': anchor, class: 'tick', style: 'font-size:11px' }, String(a.value)));
  });
  return root;
}

// Carte thermique en table HTML (accessible et défilable) : intensité = part de la valeur maximale.
export function heatGrid({ rows, cols, value, tipHtml, rowHead = true, caption }) {
  const vals = rows.map((_, r) => cols.map((_, c) => value(r, c)));
  const max = Math.max(1, ...vals.flat());
  const body = rows.map((rl, r) => h('tr', null,
    rowHead && h('th', { scope: 'row' }, rl),
    cols.map((cl, c) => {
      const v = vals[r][c];
      const td = h('td', { class: v ? 'on' : '', style: `--v:${(v / max).toFixed(3)}`, tabindex: v ? '0' : null }, v ? String(v) : '');
      if (v && tipHtml) hover(td, () => tipHtml(r, c, v));
      return td;
    })));
  return h('div', { class: 'heat-wrap', tabindex: '0', role: 'region', 'aria-label': caption || 'Carte thermique (défilable)' },
    h('table', { class: 'heat' },
      caption && h('caption', { class: 'sr' }, caption),
      h('thead', null, h('tr', null, rowHead && h('th', null, h('span', { class: 'sr' }, 'Catégorie')), cols.map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, body)));
}

// Colonnes empilées : `series` = [{ name, color, values[] }] alignées sur `labels` ; `percent` normalise chaque colonne à 100 %.
export function stackedColumns({ labels, series, percent = true, height = 220, format = (v) => v }) {
  const totals = labels.map((_, i) => series.reduce((s, x) => s + (x.values[i] || 0), 0));
  const max = percent ? 1 : Math.max(1, ...totals);
  const cols = labels.map((l, i) => {
    const total = totals[i] || 1;
    const col = h('div', { class: 'sc-col', tabindex: '0', role: 'img', 'aria-label': `${l} : ${series.map((x) => `${x.name} ${percent ? Math.round(((x.values[i] || 0) / total) * 100) + ' %' : x.values[i] || 0}`).join(', ')}` },
      h('div', { class: 'sc-bar', style: `height:${((percent ? (totals[i] ? 1 : 0) : totals[i] / max) * 100).toFixed(1)}%` },
        [...series].reverse().map((x) => ((x.values[i] || 0) > 0 ? h('div', { class: 'sc-seg', style: `flex:${x.values[i]};background:${x.color}` }) : null))),
      h('div', { class: 'sc-l' }, l));
    hover(col, () => `<div class="tt-h">${esc(l)}</div>${series.filter((x) => x.values[i]).map((x) => `<div class="tt-r"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}<b>${esc(percent ? `${Math.round((x.values[i] / total) * 100)} %` : format(x.values[i]))}</b></div>`).join('')}`);
    return col;
  });
  return h('div', { class: 'sc', style: `--sc-h:${height}px` }, cols);
}
