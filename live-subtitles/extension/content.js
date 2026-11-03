// Script de contenu (tous les cadres) : signale la vidéo en lecture et affiche les sous-titres.
(() => {
  if (window.__liveSubsFR) return;
  window.__liveSubsFR = true;

  const MIN_AREA = 10000; // ignore les pixels de suivi et petites vidéos
  const FINAL_TTL = 3500;
  const INTERIM_TTL = 6000;

  const videos = () => [...document.querySelectorAll('video')];
  const area = (v) => {
    const r = v.getBoundingClientRect();
    return r.width * r.height;
  };
  const isPlaying = (v) => !v.paused && !v.ended && v.readyState > 2 && area(v) >= MIN_AREA;

  function bestVideo() {
    let best = null;
    let score = -1;
    for (const v of videos()) {
      const sc = area(v) * (isPlaying(v) ? 1000 : 1);
      if (sc > score) {
        best = v;
        score = sc;
      }
    }
    return best;
  }

  // --- Signalement de la vidéo en lecture (le fond choisit le bon cadre) ---
  let lastArea = -1;
  let lastSent = 0;
  setInterval(() => {
    const playing = videos().filter(isPlaying);
    const a = playing.reduce((m, v) => Math.max(m, area(v)), 0);
    const now = Date.now();
    if (a === lastArea && (a === 0 || now - lastSent < 4000)) return;
    if (a === 0 && lastArea <= 0) return;
    lastArea = a;
    lastSent = now;
    chrome.runtime.sendMessage({ type: 'video-state', area: a }).catch(() => {});
  }, 1000);

  // --- Affichage ---
  let scale = 1;
  chrome.storage.local.get({ fontScale: 1 }).then((o) => (scale = Number(o.fontScale) || 1));
  chrome.storage.onChanged.addListener((c) => {
    if (c.fontScale) scale = Number(c.fontScale.newValue) || 1;
  });

  let host = null;
  let box = null;
  let ticker = null;
  const lines = new Map(); // id -> { text, final, t }
  let note = null; // { text, t }

  function ensureHost() {
    if (host) return;
    host = document.createElement('live-subtitles-fr');
    host.style.cssText = 'all:initial;position:fixed;pointer-events:none;z-index:2147483647;display:none;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      .box{position:absolute;left:0;right:0;bottom:7%;display:flex;flex-direction:column;align-items:center;
        gap:.2em;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-weight:600;line-height:1.25;text-align:center}
      .line{max-width:84%;padding:.1em .5em;background:rgba(0,0,0,.62);color:#fff;border-radius:.25em;
        text-shadow:0 1px 2px #000;white-space:pre-wrap}
      .line.live{opacity:.92}
      .note{font-size:.6em;background:rgba(120,20,20,.8)}`;
    box = document.createElement('div');
    box.className = 'box';
    root.append(style, box);
  }

  function render() {
    box.replaceChildren();
    for (const [, l] of lines) {
      const d = document.createElement('div');
      d.className = 'line' + (l.final ? '' : ' live');
      d.textContent = l.text;
      box.append(d);
    }
    if (note) {
      const d = document.createElement('div');
      d.className = 'line note';
      d.textContent = note.text;
      box.append(d);
    }
  }

  function place() {
    if (!host) return;
    const v = bestVideo();
    const fs = document.fullscreenElement;
    if (!v || fs === v || (!lines.size && !note)) {
      host.style.display = 'none';
      return;
    }
    const parent = fs && fs.contains(v) ? fs : document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
    const r = v.getBoundingClientRect();
    Object.assign(host.style, {
      display: 'block',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    box.style.fontSize = `${Math.max(14, Math.min(56, r.width * 0.03 * scale))}px`;
  }

  function tick() {
    const now = Date.now();
    let changed = false;
    for (const [id, l] of lines) {
      if (now - l.t > (l.final ? FINAL_TTL : INTERIM_TTL)) {
        lines.delete(id);
        changed = true;
      }
    }
    if (note && now - note.t > 5000) {
      note = null;
      changed = true;
    }
    if (changed) render();
    place();
    if (!lines.size && !note) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function show() {
    ensureHost();
    render();
    place();
    if (!ticker) ticker = setInterval(tick, 300);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'subtitle') {
      const cur = lines.get(msg.id);
      if (cur?.final && !msg.final) return; // un provisoire tardif n'écrase pas un final
      lines.set(msg.id, { text: msg.text, final: msg.final, t: Date.now() });
      while (lines.size > 2) lines.delete(lines.keys().next().value);
      show();
    } else if (msg.type === 'notice') {
      note = { text: msg.text, t: Date.now() };
      show();
    }
  });
})();
