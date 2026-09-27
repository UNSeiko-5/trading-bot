// Tests des calculs de la page (node --test tests/).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNIVERS, bougies, chuteDepuisSommet, courbe, emailAutorise, etatSecurites, lignesPositions, marqueursOrdres,
  ordresEnAttente, resumeCompte, versAlpaca, versRobot,
} from "../logique.js";

test("symboles crypto dans les deux sens", () => {
  assert.equal(versAlpaca("BTC-USD"), "BTC/USD");
  assert.equal(versAlpaca("SPY"), "SPY");
  assert.equal(versRobot("BTCUSD"), "BTC-USD");
  assert.equal(versRobot("ETH/USD"), "ETH-USD");
  assert.equal(versRobot("SPY"), "SPY");
  assert.equal(UNIVERS.length, 10);
});

test("seul l'e-mail autorisé entre", () => {
  assert.ok(emailAutorise(" Toi@Exemple.fr ", "toi@exemple.fr"));
  assert.ok(!emailAutorise("intrus@exemple.fr", "toi@exemple.fr"));
  assert.ok(!emailAutorise("", ""));                 // rien de configuré : personne n'entre
  assert.ok(!emailAutorise(undefined, "toi@exemple.fr"));
});

test("résumé du compte", () => {
  const r = resumeCompte({ equity: "102000", last_equity: "100000", cash: "30000", buying_power: "60000" },
    [{ market_value: "50000" }, { market_value: "22000" }]);
  assert.equal(r.valeur, 102000);
  assert.equal(r.investi, 72000);
  assert.ok(Math.abs(r.partInvestie - 72000 / 102000) < 1e-12);
  assert.equal(r.gainJour, 2000);
  assert.ok(Math.abs(r.gainJourPct - 0.02) < 1e-12);
  assert.equal(r.bloque, false);
  assert.equal(resumeCompte({ equity: "0" }, []).partInvestie, 0);   // pas de division par zéro
});

test("positions triées, crypto renommée, part du compte", () => {
  const lignes = lignesPositions([
    { symbol: "BTCUSD", qty: "0.1", market_value: "6000", avg_entry_price: "55000", current_price: "60000",
      unrealized_pl: "500", unrealized_plpc: "0.09", unrealized_intraday_pl: "-20" },
    { symbol: "SPY", qty: "20", market_value: "10000" },
  ], 100000);
  assert.deepEqual(lignes.map((l) => l.symbole), ["SPY", "BTC-USD"]);
  assert.equal(lignes[1].part, 0.06);
  assert.equal(lignes[1].gainLatent, 500);
  assert.equal(lignes[0].gainLatent, 0);             // champ absent -> 0, pas NaN
});

test("courbe sans valeurs vides, chute depuis le sommet", () => {
  const points = courbe({ timestamp: [1, 2, 3, 4, 5], equity: [100, null, 120, 90, 108] });
  assert.deepEqual(points.map((p) => p.time), [1, 3, 4, 5]);
  const c = chuteDepuisSommet(points);
  assert.equal(c.sommet, 120);
  assert.ok(Math.abs(c.chute - (108 / 120 - 1)) < 1e-12);
  assert.ok(Math.abs(c.pire - (90 / 120 - 1)) < 1e-12);
  assert.deepEqual(chuteDepuisSommet([]), { sommet: 0, chute: 0, pire: 0 });
});

test("bougies triées par jour", () => {
  const b = bougies([
    { t: "2026-09-25T04:00:00Z", o: 2, h: 3, l: 1, c: 2.5 },
    { t: "2026-09-24T04:00:00Z", o: 1, h: 2, l: 0.5, c: 2 },
  ]);
  assert.deepEqual(b.map((x) => x.time), ["2026-09-24", "2026-09-25"]);
  assert.equal(b[1].close, 2.5);
  assert.equal(bougies([{ t: "2026-09-25T14:00:00Z", o: 1, h: 1, l: 1, c: 1 }], false)[0].time, 1790344800);
});

test("flèches d'ordres posées sur une bougie qui existe", () => {
  const temps = ["2026-09-21", "2026-09-22", "2026-09-25"];   // week-end : pas de bougie le 23-24
  const ordres = [
    { symbol: "SPY", side: "buy", filled_at: "2026-09-22T13:30:05Z", filled_qty: "10", filled_avg_price: "500.1234" },
    { symbol: "SPY", side: "sell", filled_at: "2026-09-24T13:30:05Z", filled_qty: "4", filled_avg_price: "505" },
    { symbol: "SPY", side: "buy", filled_at: null, filled_qty: "0" },                  // pas exécuté : pas de flèche
    { symbol: "EFA", side: "buy", filled_at: "2026-09-22T13:30:05Z", filled_qty: "3" },  // autre actif
    { symbol: "SPY", side: "buy", filled_at: "2026-09-01T13:30:05Z", filled_qty: "1" },  // avant le graphique
  ];
  const m = marqueursOrdres(ordres, "SPY", temps);
  assert.deepEqual(m.map((x) => [x.time, x.shape]), [["2026-09-22", "arrowUp"], ["2026-09-22", "arrowDown"]]);
  assert.equal(m[0].text, "Achat 10 @ 500.12");
  assert.deepEqual(marqueursOrdres(ordres, "SPY", []), []);
  const btc = marqueursOrdres([{ symbol: "BTC/USD", side: "buy", filled_at: "2026-09-25T01:00:00Z", filled_qty: "0.01",
    filled_avg_price: "60000" }], "BTC-USD", temps);
  assert.equal(btc.length, 1);
});

test("niveaux de sécurité aux seuils du robot", () => {
  assert.equal(etatSecurites(-0.05, 0).niveau, "normal");
  assert.equal(etatSecurites(-0.05, -0.05).niveau, "alerte du jour");
  assert.equal(etatSecurites(-0.20, 0).niveau, "achats bloqués");
  assert.equal(etatSecurites(-0.25, 0).niveau, "arrêt total");
  assert.ok(Math.abs(etatSecurites(-0.12, 0).avantArretTotal - 0.13) < 1e-12);
});

test("ordres en attente", () => {
  const o = ordresEnAttente([{ status: "new" }, { status: "filled" }, { status: "accepted" }, { status: "canceled" }]);
  assert.equal(o.length, 2);
});
