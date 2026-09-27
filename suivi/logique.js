// Calculs de la page de suivi, sans Internet : utilisés par la page (navigateur) et par Vercel (api/).
// Chaque fonction est testée dans tests/logique.test.js.

// Le panier du robot v3 (doit rester identique à robot/univers.py : vérifié par tests/test_page_suivi.py)
export const UNIVERS = ["SPY", "EFA", "EEM", "IEF", "TLT", "GLD", "DBC", "VNQ", "BTC-USD", "ETH-USD"];
export const NOMS = {
  "SPY": "Actions États-Unis", "EFA": "Actions pays développés hors US", "EEM": "Actions pays émergents",
  "IEF": "Obligations État US 7-10 ans", "TLT": "Obligations État US 20 ans et +", "GLD": "Or",
  "DBC": "Matières premières", "VNQ": "Immobilier US", "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum",
};
const CRYPTO = { "BTC-USD": "BTC/USD", "ETH-USD": "ETH/USD" };

// Sécurités du robot (robot/parametres.py)
export const SEUILS = { alertePerteJour: -0.05, arretAchats: -0.20, arretTotal: -0.25 };

export const estCrypto = (symbole) => symbole in CRYPTO;

/** Symbole Alpaca (« BTC/USD ») pour un symbole du robot (« BTC-USD »). */
export function versAlpaca(symbole) {
  return CRYPTO[symbole] ?? symbole;
}

/** Symbole du robot pour un symbole Alpaca : les positions écrivent « BTCUSD », les ordres « BTC/USD ». */
export function versRobot(symbole) {
  for (const [robot, alpaca] of Object.entries(CRYPTO)) {
    if (symbole === alpaca || symbole === alpaca.replace("/", "")) return robot;
  }
  return symbole;
}

/** Seule l'adresse autorisée entre (majuscules et espaces ignorés). Rien d'autorisé si rien n'est configuré. */
export function emailAutorise(email, autorise) {
  const propre = (texte) => String(texte ?? "").trim().toLowerCase();
  return propre(autorise) !== "" && propre(email) === propre(autorise);
}

const nombre = (valeur) => {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : 0;
};

/** Les chiffres clés du compte Alpaca. */
export function resumeCompte(compte, positions) {
  const valeur = nombre(compte.equity);
  const veille = nombre(compte.last_equity);
  const investi = positions.reduce((total, p) => total + nombre(p.market_value), 0);
  return {
    valeur,
    cash: nombre(compte.cash),
    pouvoirAchat: nombre(compte.buying_power),
    investi,
    partInvestie: valeur > 0 ? investi / valeur : 0,
    gainJour: valeur - veille,
    gainJourPct: veille > 0 ? valeur / veille - 1 : 0,
    bloque: Boolean(compte.trading_blocked || compte.account_blocked),
  };
}

/** Une ligne par position, triée de la plus grosse à la plus petite. */
export function lignesPositions(positions, valeurCompte) {
  return positions.map((p) => {
    const valeur = nombre(p.market_value);
    return {
      symbole: versRobot(p.symbol),
      quantite: nombre(p.qty),
      valeur,
      part: valeurCompte > 0 ? valeur / valeurCompte : 0,
      prixMoyen: nombre(p.avg_entry_price),
      prixActuel: nombre(p.current_price),
      gainLatent: nombre(p.unrealized_pl),
      gainLatentPct: nombre(p.unrealized_plpc),
      gainJour: nombre(p.unrealized_intraday_pl),
    };
  }).sort((a, b) => b.valeur - a.valeur);
}

/** Historique Alpaca (timestamp en secondes, equity) -> points pour le graphique, sans les valeurs vides. */
export function courbe(historique) {
  const temps = historique?.timestamp ?? [];
  const valeurs = historique?.equity ?? [];
  return temps
    .map((t, i) => ({ time: t, value: valeurs[i] }))
    .filter((p) => Number.isFinite(p.value) && p.value > 0);
}

/** Sommet et chute actuelle depuis ce sommet (-0,12 = 12 % sous le sommet). */
export function chuteDepuisSommet(points) {
  if (!points.length) return { sommet: 0, chute: 0, pire: 0 };
  let sommet = 0;
  let pire = 0;
  for (const p of points) {
    sommet = Math.max(sommet, p.value);
    pire = Math.min(pire, p.value / sommet - 1);
  }
  return { sommet, chute: points[points.length - 1].value / sommet - 1, pire };
}

/** Date « AAAA-MM-JJ » d'un horodatage ISO (en temps universel). */
export const jourDe = (iso) => String(iso).slice(0, 10);

/** Barres Alpaca -> bougies pour le graphique (un jour = une bougie, triées). */
export function bougies(barres, parJour = true) {
  return (barres ?? [])
    .map((b) => ({
      time: parJour ? jourDe(b.t) : Math.floor(Date.parse(b.t) / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c,
    }))
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/** Flèches d'achat et de vente sur le graphique d'un actif, à partir des ordres exécutés.
 * `temps` : les temps des bougies affichées ; chaque flèche est posée sur la dernière bougie qui ne
 * dépasse pas l'exécution (le graphique n'accepte que des temps qui existent). */
export function marqueursOrdres(ordres, symbole, temps, parJour = true) {
  if (!temps.length) return [];
  const executes = (ordres ?? []).filter(
    (o) => versRobot(o.symbol) === symbole && o.filled_at && nombre(o.filled_qty) > 0,
  );
  const marqueurs = [];
  for (const o of executes) {
    const quand = parJour ? jourDe(o.filled_at) : Math.floor(Date.parse(o.filled_at) / 1000);
    let place = null;
    for (const t of temps) {
      if (t <= quand) place = t;
      else break;
    }
    if (place === null) continue;   // exécuté avant la première bougie affichée
    const achat = o.side === "buy";
    const prix = nombre(o.filled_avg_price);
    marqueurs.push({
      time: place,
      position: achat ? "belowBar" : "aboveBar",
      color: achat ? "#22c55e" : "#ef4444",
      shape: achat ? "arrowUp" : "arrowDown",
      text: `${achat ? "Achat" : "Vente"} ${arrondi(nombre(o.filled_qty))} @ ${arrondi(prix)}`,
    });
  }
  return marqueurs.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

const arrondi = (n) => (Math.abs(n) >= 100 ? n.toFixed(2) : Number(n.toPrecision(4)).toString());

/** Où en sont les sécurités : distance (en points de %) avant chaque seuil. */
export function etatSecurites(chute, perteJour) {
  return {
    avantArretAchats: chute - SEUILS.arretAchats,
    avantArretTotal: chute - SEUILS.arretTotal,
    avantAlerteJour: perteJour - SEUILS.alertePerteJour,
    niveau: chute <= SEUILS.arretTotal ? "arrêt total"
      : chute <= SEUILS.arretAchats ? "achats bloqués"
        : perteJour <= SEUILS.alertePerteJour ? "alerte du jour" : "normal",
  };
}

/** Ordres en attente d'exécution (pas encore passés au marché). */
export function ordresEnAttente(ordres) {
  const ouverts = ["new", "accepted", "pending_new", "partially_filled", "held", "accepted_for_bidding"];
  return (ordres ?? []).filter((o) => ouverts.includes(o.status));
}
