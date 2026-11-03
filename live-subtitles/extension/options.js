const DEFAULTS = {
  deepgramKey: '',
  translator: 'deepl',
  translatorKey: '',
  sourceLang: 'en',
  waitK: 2,
  fontScale: 1,
};
const $ = (id) => document.getElementById(id);
const ids = Object.keys(DEFAULTS);

function mirror() {
  $('waitKv').textContent = $('waitK').value;
  $('fontScaleV').textContent = `×${$('fontScale').value}`;
}

chrome.storage.local.get(DEFAULTS).then((cfg) => {
  for (const id of ids) $(id).value = cfg[id];
  mirror();
});
$('waitK').addEventListener('input', mirror);
$('fontScale').addEventListener('input', mirror);

$('save').addEventListener('click', async () => {
  const cfg = {};
  for (const id of ids) cfg[id] = $(id).value.trim();
  cfg.waitK = Number(cfg.waitK);
  cfg.fontScale = Number(cfg.fontScale);
  cfg.sourceLang = cfg.sourceLang || 'en';
  await chrome.storage.local.set(cfg);
  $('ok').textContent = 'Enregistré. Pris en compte au prochain démarrage des sous-titres.';
  setTimeout(() => ($('ok').textContent = ''), 4000);
});
