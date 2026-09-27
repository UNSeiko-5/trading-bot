// Tests des fonctions Vercel avec un faux Internet : aucun appel réel à Alpaca ni à Supabase.
import assert from "node:assert/strict";
import { test } from "node:test";

import { ALPACA_TRADING, verifierUtilisateur } from "../api/_commun.js";
import { adresseBarres, barres } from "../api/barres.js";
import { creer as creerCompte } from "../api/compte.js";

const ENV = {
  SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", ALLOWED_EMAIL: "toi@exemple.fr",
  ALPACA_API_KEY: "cle", ALPACA_SECRET_KEY: "secret",
};

function fauxInternet(email = "toi@exemple.fr") {
  const appels = [];
  const fetcher = async (url, options = {}) => {
    appels.push({ url, options });
    if (url.endsWith("/auth/v1/user")) {
      const bon = options.headers.Authorization === "Bearer bon-jeton";
      return { ok: bon, status: bon ? 200 : 401, json: async () => ({ email }) };
    }
    if (url.includes("/bars?")) return { ok: true, json: async () => ({ bars: { "BTC/USD": [{ t: "x" }] } }) };
    return { ok: true, json: async () => ({ chemin: url }) };
  };
  return { fetcher, appels };
}

function fausseReponse() {
  const res = { entetes: {}, statut: null, corps: null };
  res.setHeader = (k, v) => { res.entetes[k] = v; };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
}

test("sans connexion, rien", async () => {
  const { fetcher, appels } = fauxInternet();
  const res = fausseReponse();
  await creerCompte({ fetcher, env: ENV })({ headers: {} }, res);
  assert.equal(res.statut, 401);
  assert.equal(appels.length, 0);                          // Alpaca n'est même pas appelé
  assert.equal(res.entetes["Cache-Control"], "no-store");
});

test("mauvais jeton ou mauvais e-mail : refusé, Alpaca jamais appelé", async () => {
  for (const [jeton, email, attendu] of [["mauvais", "toi@exemple.fr", 401], ["bon-jeton", "intrus@x.fr", 403]]) {
    const { fetcher, appels } = fauxInternet(email);
    const res = fausseReponse();
    await creerCompte({ fetcher, env: ENV })({ headers: { authorization: `Bearer ${jeton}` } }, res);
    assert.equal(res.statut, attendu);
    assert.ok(appels.every((a) => a.url.includes("supabase")));
  }
});

test("connecté : tout le compte, sur le compte FICTIF, avec les clés", async () => {
  const { fetcher, appels } = fauxInternet();
  const res = fausseReponse();
  await creerCompte({ fetcher, env: ENV })({ headers: { authorization: "Bearer bon-jeton" } }, res);
  assert.equal(res.statut, 200);
  assert.deepEqual(Object.keys(res.corps).sort(), ["compte", "heure", "historique", "horloge", "ordres", "positions"]);
  const alpaca = appels.filter((a) => a.url.startsWith(ALPACA_TRADING));
  assert.equal(alpaca.length, 6);
  assert.equal(ALPACA_TRADING, "https://paper-api.alpaca.markets");
  assert.ok(alpaca.every((a) => a.options.headers["APCA-API-KEY-ID"] === "cle"));
});

test("variable manquante : erreur claire", async () => {
  await assert.rejects(verifierUtilisateur({ headers: { authorization: "Bearer x" } }, fauxInternet().fetcher, {}),
    /SUPABASE_URL manquante/);
});

test("bougies : seulement les actifs du panier, bonne adresse selon le type", async () => {
  const quand = new Date("2026-09-26T00:00:00Z");
  assert.match(adresseBarres("SPY", "jour", quand), /^\/v2\/stocks\/bars\?symbols=SPY&timeframe=1Day.*feed=iex/);
  assert.match(adresseBarres("BTC-USD", "heure", quand), /^\/v1beta3\/crypto\/us\/bars\?symbols=BTC%2FUSD&timeframe=1Hour/);
  assert.throws(() => adresseBarres("AAPL", "jour"), /actif inconnu/);
  assert.throws(() => adresseBarres("SPY", "minute"), /échelle inconnue/);
  const { fetcher } = fauxInternet();
  const r = await barres("BTC-USD", "jour", { fetcher, env: ENV });
  assert.equal(r.barres.length, 1);
});
