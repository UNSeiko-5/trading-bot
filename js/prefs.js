// Préférences d'interface (filtre de sport, périodes, tris…) conservées d'une visite à l'autre.
const KEY = 'clap.ui';
let cache = null;

const read = () => {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
    } catch {
      cache = {};
    }
  }
  return cache;
};

export const pref = (k, fallback) => (read()[k] === undefined ? fallback : read()[k]);

export function setPref(k, v) {
  read()[k] = v;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {}
}
