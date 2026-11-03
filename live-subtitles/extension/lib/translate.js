// Fournisseurs de traduction (cible : français). Appelés depuis le document
// offscreen de l'extension : les host_permissions du manifest évitent le CORS.

export function makeTranslator(cfg) {
  const src = (cfg.sourceLang || 'en').split('-')[0];
  const key = cfg.translatorKey || '';

  if (cfg.translator === 'none') return async (text) => text;

  if (cfg.translator === 'google') {
    return async (text) => {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: src, target: 'fr', format: 'text' }),
        },
      );
      if (!res.ok) throw new Error(`Google Translate : HTTP ${res.status}`);
      const data = await res.json();
      return data.data.translations[0].translatedText;
    };
  }

  // DeepL (par défaut). Les clés gratuites se terminent par ":fx".
  const base = key.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
  let optionals = true; // model_type / context : désactivés si l'API les refuse
  const post = (body) =>
    fetch(`${base}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return async (text, { final = false, context = '' } = {}) => {
    const body = { text: [text], source_lang: src.toUpperCase(), target_lang: 'FR' };
    const extra = {};
    if (optionals) {
      if (context) extra.context = context;
      if (!final) extra.model_type = 'latency_optimized';
    }
    let res = await post({ ...body, ...extra });
    if (res.status === 400 && Object.keys(extra).length) {
      res = await post(body);
      if (res.ok) optionals = false;
    }
    if (res.status === 403) throw new Error('DeepL : clé refusée (403)');
    if (res.status === 456) throw new Error('DeepL : quota dépassé (456)');
    if (res.status === 429) throw new Error('DeepL : trop de requêtes (429)');
    if (!res.ok) throw new Error(`DeepL : HTTP ${res.status}`);
    const data = await res.json();
    return data.translations[0].text;
  };
}
