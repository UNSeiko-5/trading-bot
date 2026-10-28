// Image de partage de la rétrospective (canvas 1080 × 1350) : aucun appel réseau, aucune affiche (pas de canvas « contaminé »).
const W = 1080, H = 1350;
const fr = (v, d = 0) => Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function shareCanvas(r, who = '') {
  try { await Promise.all([document.fonts.load('700 100px Inter'), document.fonts.load('400 100px "Instrument Serif"')]); } catch {}
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const SANS = 'Inter, system-ui, -apple-system, "Segoe UI", sans-serif', SERIF = '"Instrument Serif", Georgia, serif';

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1a1140');
  bg.addColorStop(1, '#5b3fe0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 2;
  for (let i = 1; i <= 9; i++) { ctx.beginPath(); ctx.ellipse(W * 0.82, H * 0.12, 70 * i, 55 * i, -0.4, 0, Math.PI * 2); ctx.stroke(); }

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 34px ${SANS}`;
  ctx.fillText('CLAP', 72, 100);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(`Rétrospective ${r.year}${who ? ` · ${who}` : ''}`, 72, 148);

  ctx.fillStyle = '#fff';
  ctx.font = `400 300px ${SERIF}`;
  ctx.fillText(fr(r.films.length), 64, 470);
  ctx.font = `600 52px ${SANS}`;
  ctx.fillText(r.films.length > 1 ? 'films vus' : 'film vu', 72, 540);

  const stats = [[r.tot.minutes ? `${fr(r.tot.minutes / 60)} h` : '—', 'de cinéma'], [r.tot.avg ? fr(r.tot.avg, 2) : '—', 'note moyenne'], [String(r.countries.length || '—'), r.countries.length > 1 ? 'pays' : 'pays']];
  stats.forEach(([v, l], i) => {
    const x = 72 + i * 322;
    roundRect(ctx, x, 590, 300, 150, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 58px ${SANS}`;
    ctx.fillText(v, x + 28, 662);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(l, x + 28, 704);
  });

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = `600 26px ${SANS}`;
  ctx.fillText('MES COUPS DE CŒUR', 72, 820);
  ctx.fillStyle = '#fff';
  const top = r.top.slice(0, 3);
  if (top.length) {
    top.forEach((f, i) => {
      ctx.font = `600 44px ${SANS}`;
      ctx.fillText(fit(ctx, f.title, 760), 72, 890 + i * 70);
      ctx.fillStyle = '#ffd36b';
      ctx.font = `600 36px ${SANS}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${String(f.rating).replace('.', ',')} ★`, W - 72, 890 + i * 70);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
    });
  } else {
    ctx.font = `500 36px ${SANS}`;
    ctx.fillText('Aucune note cette année.', 72, 890);
  }

  const genres = r.genres.slice(0, 3);
  let x = 72;
  ctx.font = `600 30px ${SANS}`;
  for (const g of genres) {
    const label = g.name;
    const w = ctx.measureText(label).width + 52;
    roundRect(ctx, x, 1126, w, 64, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 26, 1168);
    x += w + 14;
  }

  ctx.fillStyle = '#fff';
  ctx.font = `400 56px ${SERIF}`;
  ctx.fillText(fit(ctx, r.persona.name, W - 144), 72, 1262);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 24px ${SANS}`;
  ctx.fillText('Généré avec Clap · statistiques Letterboxd', 72, 1308);
  return c;
}

const blobOf = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

export async function downloadImage(canvas, name) {
  const blob = await blobOf(canvas);
  if (!blob) throw new Error('Image indisponible');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Partage natif (feuille de partage du téléphone) quand le navigateur sait envoyer des fichiers.
export async function nativeShare(canvas, name, text) {
  const blob = await blobOf(canvas);
  const file = new File([blob], name, { type: 'image/png' });
  if (!navigator.canShare || !navigator.canShare({ files: [file] })) return false;
  await navigator.share({ files: [file], text });
  return true;
}
