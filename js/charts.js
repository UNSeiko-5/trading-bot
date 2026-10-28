// Graphiques SVG sur mesure : barres (empilées), courbes lissées, calendrier, anneaux, mini-courbes.
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}

let uid = 0;
const nextId = (p) => `${p}${++uid}`;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const tipEl = () => document.getElementById('tooltip');
export const tip = {
  show(html, x, y) {
    const t = tipEl();
    t.innerHTML = html;
    t.hidden = false;
    const w = t.offsetWidth, hh = t.offsetHeight;
    t.style.left = `${Math.min(Math.max(8, x + 16), window.innerWidth - w - 8)}px`;
    t.style.top = `${y - hh - 14 < 8 ? y + 20 : y - hh - 14}px`;
  },
  hide() {
    tipEl().hidden = true;
  },
};
// Survol à la souris, effleurement et glissement au doigt (le défilement vertical reste possible).
function onPoint(el, handler, leave) {
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointermove', handler);
  el.addEventListener('pointerdown', handler);
  const end = (e) => {
    if (e.pointerType === 'touch') {
      clearTimeout(el._t);
      el._t = setTimeout(() => leave(e), 2600);
    } else leave(e);
  };
  el.addEventListener('pointerleave', end);
  el.addEventListener('pointercancel', end);
}
const ttRow = (color, name, value) => `<div class="tt-r"><span class="dot" style="background:${color}"></span>${esc(name)}<b>${esc(value)}</b></div>`;

// Rend `render(largeur, premierDessin)` dans le conteneur et le redessine quand sa largeur change.
function mount(container, render) {
  let last = 0;
  container._drawn = false;
  const draw = () => {
    if (!container.isConnected) return container._ro?.disconnect();
    const w = Math.floor(container.clientWidth);
    if (!w || w === last) return;
    last = w;
    const first = !container._drawn && !reduced();
    container._drawn = true;
    const el = render(w, first);
    if (el.setAttribute && !el.getAttribute('aria-label')) {
      const t = container.closest('.card')?.querySelector('h2, .card-h');
      el.setAttribute('aria-label', ((t && (t.firstChild ? t.firstChild.textContent : t.textContent)) || 'Graphique').trim());
    }
    container.replaceChildren(el);
  };
  container._ro?.disconnect();
  draw();
  const ro = new ResizeObserver(draw);
  ro.observe(container);
  container._ro = ro;
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function niceRange(min, max, count = 4) {
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / count);
  return { lo: Math.floor(min / step) * step, hi: Math.ceil(max / step) * step, step };
}
const ticksOf = ({ lo, hi, step }) => {
  const t = [];
  for (let v = lo; v <= hi + step * 1e-6; v += step) t.push(+v.toPrecision(12));
  return t;
};

// Courbe monotone (Fritsch–Carlson) : lisse sans dépasser les valeurs réelles. Repli sur une ligne brisée.
function linePath(P) {
  return P.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}
function smoothPath(P) {
  const n = P.length;
  if (n < 3) return linePath(P);
  const dx = [], m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = P[i + 1][0] - P[i][0];
    if (!(dx[i] > 0)) return linePath(P);
    m[i] = (P[i + 1][1] - P[i][1]) / dx[i];
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else {
      const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1];
      t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
    }
  }
  t[n - 1] = m[n - 2];
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${(P[i][0] + h).toFixed(1)},${(P[i][1] + t[i] * h).toFixed(1)} ${(P[i + 1][0] - h).toFixed(1)},${(P[i + 1][1] - t[i + 1] * h).toFixed(1)} ${P[i + 1][0].toFixed(1)},${P[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function gradient(defs, color, top = 0.32, bottom = 0) {
  const id = nextId('gr');
  defs.append(s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': top }), s('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': bottom })));
  return `url(#${id})`;
}

// Rectangle à coins supérieurs arrondis.
function barPath(x, y, w, h, r, top) {
  const rr = Math.min(r, w / 2, h);
  if (!top || rr <= 0) return `M${x},${y}h${w}v${h}h${-w}Z`;
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ---------- Barres ----------
// data: [{label, value, parts?: [{name,value,color}], tip?: html, k?}]
export function barChart(container, { data, height = 200, format = (v) => v, tickFormat, color = 'var(--accent)', goal, labelEvery, onSelect }) {
  mount(container, (w, first) => {
    const m = { t: 12, r: 6, b: 26, l: 40 };
    const iw = w - m.l - m.r, ih = height - m.t - m.b;
    const max = Math.max(...data.map((d) => d.value), goal || 0, 1e-9);
    const rng = niceRange(0, max, 4);
    const y = (v) => m.t + ih - (v / rng.hi) * ih;
    const bw = iw / data.length;
    const barW = Math.min(bw * 0.66, 34);
    const svg = s('svg', { viewBox: `0 0 ${w} ${height}`, width: w, height, class: `chart${first ? ' anim' : ''}`, role: 'img' });
    const defs = s('defs');
    svg.append(defs);
    const fills = new Map();
    const fillFor = (c) => {
      if (!fills.has(c)) fills.set(c, gradient(defs, c, 1, 0.68));
      return fills.get(c);
    };
    for (const t of ticksOf(rng)) {
      svg.append(s('line', { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t), class: 'grid' }));
      svg.append(s('text', { x: m.l - 8, y: y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, (tickFormat || format)(t)));
    }
    const every = labelEvery || Math.max(1, Math.ceil(54 / bw));
    data.forEach((d, i) => {
      const cx = m.l + bw * i + bw / 2;
      const g = s('g', { class: 'bar', style: `--k:${i}` });
      let top = 0;
      const parts = (d.parts && d.parts.some((p) => p.value > 0) ? d.parts : [{ value: d.value, color: d.color || color }]).filter((p) => p.value > 0);
      parts.forEach((p, pi) => {
        const y0 = y(top), y1 = y(top + p.value);
        const last = pi === parts.length - 1;
        g.append(s('path', { class: 'b', d: barPath(cx - barW / 2, y1, barW, Math.max(0, y0 - y1), 6, last), fill: fillFor(p.color) }));
        top += p.value;
      });
      if (i % every === 0 && (data.length - 1 - i >= every || i === data.length - 1 || every === 1)) g.append(s('text', { x: cx, y: height - 7, class: 'tick', 'text-anchor': 'middle' }, d.label));
      const hit = s('rect', { x: m.l + bw * i, y: m.t, width: bw, height: ih, fill: 'transparent' });
      const html = d.tip || `<div class="tt-h">${esc(d.label)}</div><div class="tt-r"><b style="margin:0;padding:0">${esc(format(d.value))}</b></div>`;
      onPoint(hit, (e) => tip.show(html, e.clientX, e.clientY), tip.hide);
      if (onSelect) {
        hit.style.cursor = 'pointer';
        hit.addEventListener('click', () => onSelect(d, i));
      }
      g.append(hit);
      svg.append(g);
    });
    if (goal) svg.append(s('line', { x1: m.l, x2: w - m.r, y1: y(goal), y2: y(goal), class: 'goal-line' }));
    return svg;
  });
}

// ---------- Courbes ----------
// series: [{name,color,points:[{x,y}],area?,dash?,width?}]
export function lineChart(container, { series, height = 220, xFormat = (x) => x, yFormat = (v) => v, xTicks, yMin, yMax, zeroLine, tipX, yInvert, onHover, smooth, endDot, bands }) {
  mount(container, (w, first) => {
    const m = { t: 14, r: 14, b: 26, l: 46 };
    const iw = w - m.l - m.r, ih = height - m.t - m.b;
    const pts = series.flatMap((x) => x.points).filter((p) => Number.isFinite(p.y));
    const svg = s('svg', { viewBox: `0 0 ${w} ${height}`, width: w, height, class: `chart${first ? ' anim' : ''}`, role: 'img' });
    if (!pts.length) {
      svg.append(s('text', { x: w / 2, y: height / 2, class: 'tick', 'text-anchor': 'middle' }, 'Pas assez de données'));
      return svg;
    }
    const defs = s('defs');
    svg.append(defs);
    const xs = pts.map((p) => p.x);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const rng = niceRange(yMin ?? Math.min(...pts.map((p) => p.y)), yMax ?? Math.max(...pts.map((p) => p.y)), 4);
    if (yMin != null) rng.lo = yMin;
    const X = (v) => m.l + (x1 === x0 ? iw / 2 : ((v - x0) / (x1 - x0)) * iw);
    const Y = (v) => (yInvert ? m.t + ((v - rng.lo) / (rng.hi - rng.lo)) * ih : m.t + ih - ((v - rng.lo) / (rng.hi - rng.lo)) * ih);
    for (const t of ticksOf(rng)) {
      svg.append(s('line', { x1: m.l, x2: w - m.r, y1: Y(t), y2: Y(t), class: 'grid' }));
      svg.append(s('text', { x: m.l - 8, y: Y(t) + 3.5, class: 'tick', 'text-anchor': 'end' }, yFormat(t)));
    }
    // Bandes de référence (ex. zone de fraîcheur optimale), tracées derrière les courbes.
    for (const b of bands || []) {
      const lo = Math.max(b.from, rng.lo), hi = Math.min(b.to, rng.hi);
      if (hi <= lo) continue;
      const y1 = Math.min(Y(lo), Y(hi)), y2 = Math.max(Y(lo), Y(hi));
      svg.append(s('rect', { x: m.l, y: y1, width: iw, height: y2 - y1, fill: b.color, 'fill-opacity': 0.1 }));
      if (b.label) svg.append(s('text', { x: w - m.r - 6, y: y1 + 12, class: 'tick', 'text-anchor': 'end', style: `fill:${b.color};font-weight:600` }, b.label));
    }
    if (zeroLine && rng.lo < 0 && rng.hi > 0) svg.append(s('line', { x1: m.l, x2: w - m.r, y1: Y(0), y2: Y(0), class: 'zero' }));
    const nt = Math.max(2, Math.min(6, Math.floor(iw / 90)));
    const xt = xTicks || Array.from({ length: nt }, (_, i) => x0 + ((x1 - x0) * i) / (nt - 1));
    xt.forEach((t) => {
      const v = typeof t === 'object' ? t.x : t;
      const label = typeof t === 'object' ? t.label : xFormat(t);
      svg.append(s('text', { x: X(v), y: height - 7, class: 'tick', 'text-anchor': v === x0 ? 'start' : v === x1 ? 'end' : 'middle' }, label));
    });
    for (const sr of series) {
      const P = sr.points.filter((p) => Number.isFinite(p.y)).map((p) => [X(p.x), Y(p.y)]);
      if (!P.length) continue;
      const doSmooth = smooth ?? (P.length <= 240 && !sr.dash);
      const d = doSmooth ? smoothPath(P) : linePath(P);
      if (sr.area) {
        const base = Y(Math.max(rng.lo, Math.min(0, rng.hi)));
        svg.append(s('path', { class: 'area', d: `${d}L${P[P.length - 1][0].toFixed(1)},${base}L${P[0][0].toFixed(1)},${base}Z`, fill: gradient(defs, sr.color) }));
      }
      svg.append(s('path', { class: `line${sr.dash ? ' dash' : ''}`, d, ...(sr.dash ? {} : { pathLength: 1 }), fill: 'none', stroke: sr.color, 'stroke-width': sr.width || 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': sr.dash || null }));
      if ((endDot ?? P.length <= 400) && !sr.dash) {
        const [lx, ly] = P[P.length - 1];
        svg.append(s('g', { class: 'end' }, s('circle', { cx: lx, cy: ly, r: 7, fill: sr.color, 'fill-opacity': 0.18 }), s('circle', { cx: lx, cy: ly, r: 3.5, fill: sr.color, stroke: 'var(--surface)', 'stroke-width': 1.5 })));
      }
    }
    const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'cross', visibility: 'hidden' });
    const dots = series.map((sr) => s('circle', { r: 4.5, fill: sr.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }));
    svg.append(cross, ...dots);
    const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
    const move = (e) => {
      const rect = svg.getBoundingClientRect();
      const xv = x0 + ((e.clientX - rect.left - m.l) / iw) * (x1 - x0);
      let html = `<div class="tt-h">${esc((tipX || xFormat)(xv))}</div>`;
      let cx = null;
      series.forEach((sr, i) => {
        let best = null;
        for (const p of sr.points) if (Number.isFinite(p.y) && (!best || Math.abs(p.x - xv) < Math.abs(best.x - xv))) best = p;
        if (!best) return;
        cx = X(best.x);
        dots[i].setAttribute('cx', cx);
        dots[i].setAttribute('cy', Y(best.y));
        dots[i].setAttribute('visibility', 'visible');
        html += ttRow(sr.color, sr.name, yFormat(best.y, true));
      });
      onHover?.(xv);
      if (cx != null) {
        cross.setAttribute('x1', cx);
        cross.setAttribute('x2', cx);
        cross.setAttribute('visibility', 'visible');
      }
      tip.show(html, e.clientX, e.clientY);
    };
    const leave = () => {
      tip.hide();
      onHover?.(null);
      cross.setAttribute('visibility', 'hidden');
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
    };
    onPoint(hit, move, leave);
    svg.append(hit);
    return svg;
  });
}

// ---------- Calendrier (type contributions) ----------
export function calendarChart(container, { values, start, weeks, format, keyOf, onSelect }) {
  const monthFmt = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  mount(container, (w) => {
    const left = 28, top = 18;
    const cell = Math.max(11, Math.min(19, Math.floor((w - left) / weeks)));
    const gap = 3;
    const svg = s('svg', { viewBox: `0 0 ${left + weeks * cell} ${top + 7 * cell}`, width: left + weeks * cell, height: top + 7 * cell, class: 'chart', role: 'img' });
    const max = Math.max(...values.values(), 1);
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((l, i) => i % 2 === 0 && svg.append(s('text', { x: 0, y: top + i * cell + cell - 4, class: 'tick' }, l)));
    let lastMonth = -1, lastCol = -9;
    const now = new Date();
    for (let c = 0; c < weeks; c++) {
      for (let r = 0; r < 7; r++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + c * 7 + r);
        if (d > now) continue;
        if (r === 0 && d.getMonth() !== lastMonth) {
          lastMonth = d.getMonth();
          if (c - lastCol >= 3) {
            lastCol = c;
            svg.append(s('text', { x: left + c * cell, y: 11, class: 'tick' }, monthFmt.format(d)));
          }
        }
        const v = values.get(keyOf(d)) || 0;
        const lvl = v ? Math.ceil((v / max) * 4) : 0;
        const rect = s('rect', { x: left + c * cell, y: top + r * cell, width: cell - gap, height: cell - gap, rx: 4, class: `cal l${lvl}` });
        onPoint(rect, (e) => tip.show(`<div class="tt-h">${esc(dayFmt.format(d))}</div><div class="tt-r"><b style="margin:0;padding:0">${v ? esc(format(v)) : 'Repos'}</b></div>`, e.clientX, e.clientY), tip.hide);
        if (onSelect && v) {
          rect.style.cursor = 'pointer';
          rect.addEventListener('click', () => onSelect(keyOf(d)));
        }
        svg.append(rect);
      }
    }
    return svg;
  });
}

// ---------- Anneau (répartition) ----------
export function donut(container, { slices, size = 156, center, format = (v) => v }) {
  const total = slices.reduce((a, b) => a + b.value, 0);
  const svg = s('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'chart', role: 'img' });
  const heading = container.closest('.card')?.querySelector('h2, .card-h');
  svg.setAttribute('aria-label', `${(heading && heading.textContent) || 'Répartition'} : ${slices.filter((x) => x.value > 0).map((x) => `${x.label} ${Math.round((x.value / (total || 1)) * 100)} %`).join(', ') || 'aucune donnée'}`);
  const R = 39, W = 12;
  if (!total) {
    svg.append(s('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': W }));
  } else {
    let a0 = -Math.PI / 2;
    const live = slices.filter((x) => x.value > 0);
    const gap = live.length > 1 ? 0.07 : 0;
    for (const sl of live) {
      const frac = sl.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const p = (a) => [50 + R * Math.cos(a), 50 + R * Math.sin(a)];
      const [x0, y0] = p(a0 + gap / 2), [x1, y1] = p(a1 - gap / 2);
      const path = live.length === 1
        ? s('circle', { cx: 50, cy: 50, r: R, fill: 'none', stroke: sl.color, 'stroke-width': W, class: 'donut-arc' })
        : s('path', { class: 'donut-arc', d: `M${x0},${y0}A${R},${R} 0 ${frac * Math.PI * 2 - gap > Math.PI ? 1 : 0} 1 ${x1},${y1}`, fill: 'none', stroke: sl.color, 'stroke-width': W, 'stroke-linecap': 'round' });
      onPoint(path, (e) => tip.show(`<div class="tt-h">${esc(sl.label)}</div><div class="tt-r"><b style="margin:0;padding:0">${esc(format(sl.value))} · ${Math.round(frac * 100)} %</b></div>`, e.clientX, e.clientY), tip.hide);
      svg.append(path);
      a0 = a1;
    }
  }
  if (center) {
    const [big, small] = [].concat(center);
    svg.append(s('text', { x: 50, y: small ? 48 : 53, class: 'donut-c', 'text-anchor': 'middle' }, big));
    if (small) svg.append(s('text', { x: 50, y: 61, class: 'tick', 'text-anchor': 'middle', style: 'font-size:6.5px' }, small));
  }
  svg.classList.add(reduced() ? 'static' : 'anim');
  container.replaceChildren(svg);
}

// ---------- Mini courbe (KPI) ----------
export function sparkline(values, color = 'var(--accent)') {
  const w = 100, hh = 30;
  const max = Math.max(...values, 1e-9);
  const step = w / Math.max(1, values.length - 1);
  const P = values.map((v, i) => [i * step, hh - 3 - (v / max) * (hh - 7)]);
  const d = smoothPath(P);
  const defs = s('defs');
  const svg = s('svg', { viewBox: `0 0 ${w} ${hh}`, preserveAspectRatio: 'none', class: 'spark', 'aria-hidden': 'true' }, defs);
  svg.append(
    s('path', { d: `${d}L${w},${hh}L0,${hh}Z`, fill: gradient(defs, color, 0.25, 0) }),
    s('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.8, 'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })
  );
  return svg;
}

// ---------- Anneau de progression (objectif hebdomadaire) ----------
export function ring({ value = 0, color = 'var(--accent)', center = [], stroke = 9 }) {
  const R = 50 - stroke / 2 - 2;
  const C = 2 * Math.PI * R;
  const svg = s('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true' });
  const prog = s('circle', { class: 'prog', cx: 50, cy: 50, r: R, 'stroke-width': stroke, stroke: color, 'stroke-dasharray': C, 'stroke-dashoffset': C });
  svg.append(s('circle', { class: 'track', cx: 50, cy: 50, r: R, 'stroke-width': stroke }), prog);
  const [big, small] = center;
  const c = document.createElement('div');
  c.className = 'ring-c';
  c.innerHTML = `<b>${esc(big ?? '')}</b>${small ? `<span>${esc(small)}</span>` : ''}`;
  const wrap = document.createElement('div');
  wrap.className = 'ring';
  wrap.append(svg, c);
  const target = C * (1 - Math.max(0, Math.min(1, value)));
  if (reduced()) prog.setAttribute('stroke-dashoffset', target);
  else requestAnimationFrame(() => requestAnimationFrame(() => prog.setAttribute('stroke-dashoffset', target)));
  return wrap;
}
