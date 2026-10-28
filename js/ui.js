import { ring, tip } from './charts.js';
import { GLOSSARY } from './glossary.js';
import { h } from './util.js';

const num = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export function card(title, sub, ...body) {
  return h('section', { class: 'card' }, title && h('h2', null, title), sub && h('p', { class: 'card-sub' }, sub), ...body);
}

// Variation en % avec flèche ; `label` précise la période de comparaison.
export function delta(cur, prev, label = 'vs sem. précédente') {
  if (!prev) return h('span', { class: 'delta-wrap' }, h('span', { class: 'delta' }, '—'), h('span', { class: 'muted' }, label));
  const p = ((cur - prev) / prev) * 100;
  const cls = Math.abs(p) < 1 ? '' : p > 0 ? 'up' : 'down';
  return h('span', { class: 'delta-wrap' },
    h('span', { class: `delta ${cls}` }, `${p > 0 ? '↑' : p < 0 ? '↓' : '·'} ${num(Math.abs(p), 0)} %`),
    h('span', { class: 'muted' }, label));
}

// Compteur animé : l'élément porte data-n (valeur finale) et data-d (décimales).
export function countUp(el, ms = 900) {
  const n = Number(el.dataset.n), d = Number(el.dataset.d || 0);
  const node = el.firstChild;
  if (!node || node.nodeType !== 3 || !Number.isFinite(n) || n === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now();
  const tick = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    node.nodeValue = num(n * (1 - (1 - k) ** 3), d);
    if (k < 1 && el.isConnected) requestAnimationFrame(tick);
    else node.nodeValue = num(n, d);
  };
  requestAnimationFrame(tick);
}
export const animateCounts = (root) => root.querySelectorAll('[data-n]').forEach((el) => countUp(el));

// `count: {n, d}` : valeur numérique animée (le texte de `value` est la valeur finale formatée).
export function kpi({ label, value, unit, sub, spark, count }) {
  const v = h('span', { class: 'value', 'data-n': count ? count.n : null, 'data-d': count ? count.d : null }, value, unit && h('small', null, unit));
  return h('div', { class: 'card kpi' }, spark, h('span', { class: 'label' }, label), v, sub);
}

export function legend(items) {
  return h('div', { class: 'legend' }, items.map(([label, color]) => h('span', null, h('span', { class: 'dot', style: `background:${color}` }), label)));
}

export function empty(msg) {
  return h('div', { class: 'empty' }, msg);
}

export function progress(pct, expectedPct) {
  return h('div', { class: 'bar-track' }, h('div', { class: 'bar-fill', style: `width:${Math.min(100, pct * 100)}%` }), expectedPct != null && h('div', { class: 'bar-mark', style: `left:${Math.min(100, expectedPct * 100)}%` }));
}

// Contrôle segmenté avec pastille glissante. `.set(v)` change la sélection sans recréer le contrôle.
export function seg(options, current, onChange) {
  const wrap = h('div', { class: 'seg', role: 'group' });
  const bg = h('span', { class: 'thumb-bg' });
  let cur = current;
  const btns = options.map(([v, label]) =>
    h('button', { type: 'button', onclick: () => { if (cur === v) return; cur = v; paint(); onChange(v); } }, label)
  );
  const place = () => {
    const b = btns[options.findIndex(([v]) => v === cur)];
    if (!b || !b.offsetWidth) return;
    bg.style.width = `${b.offsetWidth}px`;
    bg.style.transform = `translateX(${b.offsetLeft}px)`;
  };
  const paint = () => {
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === cur)));
    place();
  };
  wrap.append(bg, ...btns);
  wrap.dataset.key = options.map(([v]) => v).join('|');
  wrap.set = (v) => { cur = v; paint(); };
  paint();
  if ('ResizeObserver' in window) new ResizeObserver(place).observe(wrap);
  return wrap;
}

// Courbes de niveau (relief) générées de façon déterministe : motif décoratif.
export function topo(seed = 1, lines = 13) {
  let a = seed * 9301 + 49297;
  const rnd = () => (a = (a * 16807) % 2147483647) / 2147483647;
  const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 600 500');
  svg.setAttribute('class', 'topo');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  for (let k = 1; k <= lines; k++) {
    const r0 = 17 * k;
    let d = '';
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      const r = r0 * (1 + 0.2 * Math.sin(2 * t + ph[0] + k * 0.13) + 0.11 * Math.sin(3 * t + ph[1] - k * 0.1) + 0.05 * Math.sin(5 * t + ph[2] + k * 0.2));
      const x = 300 + k * 1.8 + r * Math.cos(t) * 1.3;
      const y = 250 - k * 1.2 + r * Math.sin(t);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `${d}Z`);
    p.setAttribute('stroke-width', k % 4 === 0 ? 1.4 : 0.9);
    p.setAttribute('opacity', (1 - k / (lines + 3)).toFixed(2));
    svg.append(p);
  }
  return svg;
}

export { ring };

// Bulle d'aide « ? » : au survol, au focus clavier ou au toucher. `key` désigne une entrée de glossaire.
let helpBound = false;
export function help(key) {
  const [title, text] = GLOSSARY[key] || [key, ''];
  const b = h('button', { class: 'help', type: 'button', 'aria-label': `Aide : ${title}. ${text}`, html: '?' });
  const show = () => {
    const r = b.getBoundingClientRect();
    tip.show(`<div class="tt-h">${title}</div>${text}`, r.left + r.width / 2 - 12, r.top);
  };
  b.addEventListener('pointerenter', show);
  b.addEventListener('focus', show);
  b.addEventListener('pointerleave', tip.hide);
  b.addEventListener('blur', tip.hide);
  b.addEventListener('click', (e) => { e.preventDefault(); show(); });
  if (!helpBound) {
    helpBound = true;
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.help')) tip.hide(); });
  }
  return b;
}

// Libellé suivi d'une bulle d'aide.
export const labelWithHelp = (label, key) => h('span', { class: 'lh' }, label, help(key));
