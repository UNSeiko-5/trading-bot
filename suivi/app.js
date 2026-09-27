// Page de suivi en direct du robot v3 : connexion Supabase, données Alpaca via /api (Vercel), graphiques TradingView.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  NOMS, SEUILS, UNIVERS, bougies, chuteDepuisSommet, courbe, estCrypto, etatSecurites, lignesPositions,
  marqueursOrdres, ordresEnAttente, resumeCompte, versRobot,
} from "./logique.js";

const RAFRAICHIR_COMPTE = 15_000;     // valeur, positions, ordres : toutes les 15 secondes
const RAFRAICHIR_BOUGIES = 60_000;    // graphique de l'actif : chaque minute
const RAFRAICHIR_JOURNAL = 300_000;   // rapports du robot : toutes les 5 minutes (+ en direct par Supabase)

const $ = (id) => document.getElementById(id);
const enDollars = (chiffres) => {
  const f = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres });
  return { format: (v) => `${f.format(v)} $` };
};
const dollars = enDollars(0);
const dollarsPrecis = enDollars(2);
const pct = (v, chiffres = 1) => (v === null || v === undefined || !Number.isFinite(v)
  ? "—" : `${(v * 100).toFixed(chiffres).replace(".", ",")} %`);
const signe = (v) => (v > 0 ? "vert" : v < 0 ? "rouge" : "");
const plus = (v, texte) => `${v > 0 ? "+" : ""}${texte}`;
const date = (iso) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const echapper = (texte) => String(texte ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const etat = {
  supabase: null, ouvert: false, minuteries: [], canal: null,
  compte: null, rapports: [], spy: null, bougies: {},
  periode: "annee", comparer: true, symbole: "SPY", echelle: "jour",
  graphes: {},
};

// --- Démarrage et connexion ------------------------------------------------------------------------

async function demarrer() {
  let config;
  try {
    config = await (await fetch("/api/config")).json();
  } catch {
    config = { erreur: "impossible de joindre /api/config" };
  }
  if (config.erreur) {
    $("connexion").hidden = false;
    $("erreur-connexion").textContent = `Configuration incomplète : ${config.erreur}. Voir docs/PAGE_DE_SUIVI.md.`;
    return;
  }
  etat.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  etat.supabase.auth.onAuthStateChange((_evenement, session) => (session ? ouvrir() : fermer()));
  const { data } = await etat.supabase.auth.getSession();
  if (data.session) ouvrir(); else fermer();
}

$("formulaire").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erreur-connexion").textContent = "";
  const { error } = await etat.supabase.auth.signInWithPassword({
    email: $("email").value.trim(), password: $("motdepasse").value,
  });
  if (error) $("erreur-connexion").textContent = `Connexion refusée : ${error.message}`;
});

$("deconnexion").addEventListener("click", () => etat.supabase.auth.signOut());

function fermer() {
  etat.ouvert = false;
  etat.minuteries.forEach(clearInterval);
  etat.minuteries = [];
  if (etat.canal) etat.supabase.removeChannel(etat.canal);
  etat.canal = null;
  $("tableau").hidden = true;
  $("connexion").hidden = false;
}

function ouvrir() {
  if (etat.ouvert) return;
  etat.ouvert = true;
  $("connexion").hidden = true;
  $("tableau").hidden = false;
  preparerGraphes();
  chargerCompte();
  chargerJournal();
  chargerBougies();
  chargerSpy();
  etat.minuteries = [
    setInterval(() => document.visibilityState === "visible" && chargerCompte(), RAFRAICHIR_COMPTE),
    setInterval(() => document.visibilityState === "visible" && chargerBougies(), RAFRAICHIR_BOUGIES),
    setInterval(chargerJournal, RAFRAICHIR_JOURNAL),
  ];
  // Temps réel : prévenu dès que le robot écrit son rapport du soir
  etat.canal = etat.supabase.channel("rapports")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "rapports" }, chargerJournal)
    .subscribe();
}

async function api(chemin) {
  const { data } = await etat.supabase.auth.getSession();
  const reponse = await fetch(chemin, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  const corps = await reponse.json().catch(() => ({ erreur: `réponse illisible (${reponse.status})` }));
  if (reponse.status === 401) await etat.supabase.auth.signOut();
  if (!reponse.ok) throw new Error(corps.erreur ?? `erreur ${reponse.status}`);
  return corps;
}

function bandeau(texte) {
  $("bandeau").hidden = !texte;
  $("bandeau").textContent = texte ? `⚠️ ${texte} (les dernières données connues restent affichées)` : "";
}

// --- Chargements -----------------------------------------------------------------------------------

async function chargerCompte() {
  try {
    etat.compte = await api("/api/compte");
    bandeau("");
    rendreTout();
  } catch (e) {
    bandeau(`Compte Alpaca : ${e.message}`);
  }
}

async function chargerJournal() {
  const { data, error } = await etat.supabase.from("rapports").select("*").order("cree_le", { ascending: false }).limit(60);
  if (error) {
    bandeau(`Journal Supabase : ${error.message}`);
    return;
  }
  etat.rapports = data ?? [];
  rendreTout();
}

async function chargerBougies() {
  const cle = `${etat.symbole}|${etat.echelle}`;
  try {
    const r = await api(`/api/barres?symbole=${encodeURIComponent(etat.symbole)}&echelle=${etat.echelle}`);
    etat.bougies[cle] = r.barres;
    rendreGrapheActif();
  } catch (e) {
    bandeau(`Graphique ${etat.symbole} : ${e.message}`);
  }
}

async function chargerSpy() {
  try {
    etat.spy = (await api("/api/barres?symbole=SPY&echelle=jour")).barres;
    rendreCourbe();
  } catch {
    etat.spy = null;
  }
}

// --- Affichage ---------------------------------------------------------------------------------------

function rendreTout() {
  if (!etat.compte) return;
  rendreEntete();
  rendreTuiles();
  rendreCourbe();
  rendreSecurites();
  rendreDecision();
  rendrePositions();
  rendreGrapheActif();
  rendreOrdres();
  rendreJournal();
}

const dernierRapport = () => etat.rapports[0] ?? null;

function rendreEntete() {
  const { horloge, heure } = etat.compte;
  const ouvert = Boolean(horloge?.is_open);
  $("marche").textContent = ouvert ? "marché ouvert (New York)" : "marché fermé (crypto ouverte 24h/24)";
  $("marche").className = `badge ${ouvert ? "vert" : ""}`;
  $("maj").textContent = `mis à jour ${new Date(heure).toLocaleTimeString("fr-FR")} · toutes les 15 s`;
}

function tuile(libelle, valeur, detail = "", classe = "") {
  return `<div class="tuile"><div class="libelle">${libelle}</div><div class="valeur ${classe}">${valeur}</div>` +
    `<div class="detail">${detail}</div></div>`;
}

function rendreTuiles() {
  const r = resumeCompte(etat.compte.compte, etat.compte.positions);
  const annee = chuteDepuisSommet(courbe(etat.compte.historique.annee));
  const rapport = dernierRapport();
  const chute = rapport?.chute ?? annee.chute;
  $("tuiles").innerHTML = [
    tuile("Valeur du compte", dollars.format(r.valeur), `cash ${dollars.format(r.cash)}`),
    tuile("Gain du jour", plus(r.gainJour, dollars.format(r.gainJour)), plus(r.gainJourPct, pct(r.gainJourPct, 2)), signe(r.gainJour)),
    tuile("Investi", pct(r.partInvestie, 0), dollars.format(r.investi)),
    tuile("Chute depuis le sommet", pct(chute), rapport ? "mesurée par le robot" : "sur 1 an", chute < -0.1 ? "orange" : ""),
    tuile("Pire chute (1 an)", pct(annee.pire), `sommet ${dollars.format(annee.sommet)}`),
    tuile("Multiplicateur de risque", rapport?.multiplicateur ? `x${rapport.multiplicateur.toFixed(2).replace(".", ",")}` : "—",
      rapport ? `séance du ${rapport.seance}` : "pas encore de rapport"),
    tuile("Ordres en attente", String(ordresEnAttente(etat.compte.ordres).length), "exécutés à l'ouverture"),
    tuile("Compte", r.bloque ? "BLOQUÉ" : "actif", `pouvoir d'achat ${dollars.format(r.pouvoirAchat)}`, r.bloque ? "rouge" : "vert"),
  ].join("");
}

function couleursGraphe() {
  const style = getComputedStyle(document.documentElement);
  const v = (nom) => style.getPropertyValue(nom).trim();
  return { texte: v("--doux"), bord: v("--bord"), accent: v("--accent"), vert: v("--vert"), rouge: v("--rouge") };
}

function preparerGraphes() {
  if (etat.graphes.compte) return;
  const c = couleursGraphe();
  const options = {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: c.texte },
    grid: { vertLines: { color: c.bord }, horzLines: { color: c.bord } },
    rightPriceScale: { borderColor: c.bord },
    timeScale: { borderColor: c.bord, timeVisible: true },
    localization: { locale: "fr-FR" },
  };
  const compte = LightweightCharts.createChart($("graphe-compte"), options);
  etat.graphes.compte = compte;
  etat.graphes.valeur = compte.addAreaSeries({
    lineColor: c.accent, topColor: `${c.accent}55`, bottomColor: `${c.accent}05`, lineWidth: 2,
    priceFormat: { type: "price", precision: 0, minMove: 1 },
  });
  etat.graphes.spy = compte.addLineSeries({ color: c.texte, lineWidth: 1, lineStyle: 2, priceLineVisible: false });

  const actif = LightweightCharts.createChart($("graphe-actif"), options);
  etat.graphes.actif = actif;
  etat.graphes.bougies = actif.addCandlestickSeries({
    upColor: c.vert, downColor: c.rouge, wickUpColor: c.vert, wickDownColor: c.rouge, borderVisible: false,
  });
  etat.graphes.ligneMoyenne = null;

  $("choix-actif").innerHTML = UNIVERS.map((s) => `<option value="${s}">${s} · ${NOMS[s]}</option>`).join("");
}

function rendreCourbe() {
  if (!etat.compte || !etat.graphes.valeur) return;
  const points = courbe(etat.compte.historique[etat.periode]);
  etat.graphes.valeur.setData(points);
  // Comparaison : SPY ramené à la même valeur de départ que le compte (1 an seulement)
  let spy = [];
  if (etat.comparer && etat.periode === "annee" && etat.spy?.length && points.length) {
    const debut = points[0].time;
    const barres = etat.spy.map((b) => ({ time: Math.floor(Date.parse(b.t) / 1000), value: b.c }))
      .filter((b) => b.time >= debut - 86_400);
    if (barres.length) spy = barres.map((b) => ({ time: b.time, value: b.value * points[0].value / barres[0].value }));
  }
  etat.graphes.spy.setData(spy);
  etat.graphes.compte.timeScale().fitContent();
  const c = chuteDepuisSommet(points);
  $("legende-compte").textContent = points.length
    ? `${points.length} points · de ${dollars.format(points[0].value)} à ${dollars.format(points.at(-1).value)}`
      + ` (${plus(points.at(-1).value / points[0].value - 1, pct(points.at(-1).value / points[0].value - 1))})`
      + ` · pire chute ${pct(c.pire)}${spy.length ? " · pointillés : SPY acheté et gardé, même départ" : ""}`
    : "Pas encore d'historique : le compte vient de démarrer.";
}

function jauge(titre, valeur, seuils, echelleMin) {
  // valeur et seuils négatifs (ex. -0,08 ; seuils -0,20 et -0,25) ; la piste va de 0 à echelleMin
  const position = (v) => `${Math.min(Math.max(v / echelleMin, 0), 1) * 100}%`;
  const couleur = seuils.some((s) => valeur <= s.valeur) ? "var(--rouge)"
    : valeur <= seuils[0].valeur / 2 ? "var(--orange)" : "var(--vert)";
  const reperes = seuils.map((s) => `<div class="repere" style="left:${position(s.valeur)}" title="${s.nom}"></div>`).join("");
  return `<div class="jauge"><div class="haut"><span>${titre}</span><b>${pct(valeur)}</b></div>` +
    `<div class="piste"><div class="rempli" style="width:${position(valeur)};background:${couleur}"></div>${reperes}</div>` +
    `<div class="bas"><span>0 %</span>${seuils.map((s) => `<span>${s.nom} : ${pct(s.valeur, 0)}</span>`).join("")}</div></div>`;
}

function rendreSecurites() {
  const r = resumeCompte(etat.compte.compte, etat.compte.positions);
  const rapport = dernierRapport();
  const chute = rapport?.chute ?? chuteDepuisSommet(courbe(etat.compte.historique.annee)).chute;
  const s = etatSecurites(chute, r.gainJourPct);
  const couleur = { "normal": "vert", "alerte du jour": "orange", "achats bloqués": "orange", "arrêt total": "rouge" }[s.niveau];
  const veto = rapport?.statut === "bloqué par le veto final";
  $("securites").innerHTML =
    `<p>État : <b class="${couleur}">${s.niveau}</b> · veto final : ` +
    `<b class="${veto ? "rouge" : "vert"}">${veto ? "a bloqué le dernier plan" : "rien à signaler"}</b></p>` +
    jauge("Chute depuis le sommet", chute, [{ nom: "achats bloqués", valeur: SEUILS.arretAchats },
      { nom: "tout vendu", valeur: SEUILS.arretTotal }], -0.30) +
    jauge("Perte du jour", Math.min(r.gainJourPct, 0), [{ nom: "alerte", valeur: SEUILS.alertePerteJour }], -0.08) +
    `<p class="doux">Marge avant l'arrêt des achats : ${pct(s.avantArretAchats)} · avant l'arrêt total : ${pct(s.avantArretTotal)}.` +
    ` Rappel : un krach pendant la nuit peut dépasser -25 % avant que le robot réagisse (krachs simulés).</p>`;
}

function rendreDecision() {
  const rapport = dernierRapport();
  if (!rapport) {
    $("decision").innerHTML = `<p class="vide">Aucun rapport pour l'instant : le robot en écrit un chaque soir de semaine
      à 22h40 UTC (après avoir ajouté SUPABASE_URL et SUPABASE_SERVICE_KEY aux secrets GitHub).</p>`;
    return;
  }
  const ordres = rapport.ordres ?? [];
  $("decision").innerHTML =
    `<p>Séance du <b>${echapper(rapport.seance)}</b> · ${echapper(rapport.statut)} · ${ordres.length} ordre(s) · ` +
    `écrit le ${date(rapport.cree_le)}</p><pre class="message">${echapper(rapport.message)}</pre>`;
}

function rendrePositions() {
  const r = resumeCompte(etat.compte.compte, etat.compte.positions);
  const lignes = Object.fromEntries(lignesPositions(etat.compte.positions, r.valeur).map((l) => [l.symbole, l]));
  const decisions = Object.fromEntries((dernierRapport()?.actifs ?? []).map((a) => [a.symbole, a]));
  const autres = Object.keys(lignes).filter((s) => !UNIVERS.includes(s));
  const entete = `<tr><th>Actif</th><th>Quantité</th><th>Valeur</th><th>Part</th><th>Part visée</th><th class="gauche">Note</th>` +
    `<th>Détecteurs</th><th class="gauche">Régime</th><th>Prix moyen</th><th>Prix</th><th>Gain latent</th><th>Gain du jour</th></tr>`;
  const corps = [...UNIVERS, ...autres].map((s) => {
    const l = lignes[s];
    const d = decisions[s];
    const note = d?.note ?? null;
    const noteHtml = note === null ? "—"
      : `<span class="note"><i style="width:${Math.min(note / 20, 1) * 100}%"></i></span>${note.toFixed(1).replace(".", ",")}`;
    return `<tr class="cliquable${s === etat.symbole ? " choisi" : ""}" data-symbole="${echapper(s)}">` +
      `<td><b>${echapper(s)}</b> <span class="doux">${echapper(NOMS[s] ?? "hors panier")}</span>${d?.exclu ? ' <span class="orange">⚠ données douteuses</span>' : ""}</td>` +
      `<td>${l ? l.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 6 }) : "—"}</td>` +
      `<td>${l ? dollars.format(l.valeur) : "—"}</td>` +
      `<td>${l ? pct(l.part) : "0 %"}</td>` +
      `<td>${d ? pct(d.visee) : "—"}</td>` +
      `<td class="gauche">${noteHtml}</td>` +
      `<td>${d ? `${d.haussiers}/${d.detecteurs}` : "—"}</td>` +
      `<td class="gauche">${echapper(d?.regime ?? "—")}</td>` +
      `<td>${l ? dollarsPrecis.format(l.prixMoyen) : "—"}</td>` +
      `<td>${l ? dollarsPrecis.format(l.prixActuel) : "—"}</td>` +
      `<td class="${signe(l?.gainLatent)}">${l ? `${plus(l.gainLatent, dollars.format(l.gainLatent))} (${pct(l.gainLatentPct)})` : "—"}</td>` +
      `<td class="${signe(l?.gainJour)}">${l ? plus(l.gainJour, dollars.format(l.gainJour)) : "—"}</td></tr>`;
  }).join("");
  $("positions").innerHTML = entete + corps;
}

$("positions").addEventListener("click", (e) => {
  const ligne = e.target.closest("tr[data-symbole]");
  if (ligne && UNIVERS.includes(ligne.dataset.symbole)) choisirActif(ligne.dataset.symbole);
});

function choisirActif(symbole) {
  etat.symbole = symbole;
  $("choix-actif").value = symbole;
  rendrePositions();
  rendreGrapheActif();
  chargerBougies();
  $("graphe-actif").scrollIntoView({ behavior: "smooth", block: "center" });
}

function rendreGrapheActif() {
  if (!etat.graphes.bougies) return;
  const parJour = etat.echelle === "jour";
  const donnees = bougies(etat.bougies[`${etat.symbole}|${etat.echelle}`] ?? [], parJour);
  etat.graphes.bougies.setData(donnees);
  const ordres = etat.compte?.ordres ?? [];
  const marqueurs = marqueursOrdres(ordres, etat.symbole, donnees.map((b) => b.time), parJour);
  etat.graphes.bougies.setMarkers(marqueurs);
  if (etat.graphes.ligneMoyenne) etat.graphes.bougies.removePriceLine(etat.graphes.ligneMoyenne);
  etat.graphes.ligneMoyenne = null;
  const position = (etat.compte?.positions ?? []).find((p) => versRobot(p.symbol) === etat.symbole);
  if (position) {
    etat.graphes.ligneMoyenne = etat.graphes.bougies.createPriceLine({
      price: Number(position.avg_entry_price), color: couleursGraphe().accent, lineWidth: 1, lineStyle: 2,
      axisLabelVisible: true, title: "prix moyen d'achat",
    });
  }
  $("titre-actif").textContent = `${etat.symbole} · ${NOMS[etat.symbole]}`;
  $("legende-actif").textContent = `${donnees.length} bougies (${parJour ? "1 jour" : "1 heure"}) · ` +
    `${marqueurs.length} ordre(s) exécuté(s) : flèche verte = achat, rouge = vente` +
    `${position ? " · pointillés : ton prix moyen d'achat" : ""}` +
    `${estCrypto(etat.symbole) ? " · crypto : cotée 24h/24" : " · données IEX gratuites (volume partiel)"}`;
}

$("choix-actif").addEventListener("change", (e) => choisirActif(e.target.value));

function basculer(attribut, valeur) {
  document.querySelectorAll(`[data-${attribut}]`).forEach((b) => b.classList.toggle("actif", b.dataset[attribut] === valeur));
}

document.querySelectorAll("[data-periode]").forEach((b) => b.addEventListener("click", () => {
  etat.periode = b.dataset.periode;
  basculer("periode", etat.periode);
  rendreCourbe();
}));

document.querySelectorAll("[data-echelle]").forEach((b) => b.addEventListener("click", () => {
  etat.echelle = b.dataset.echelle;
  basculer("echelle", etat.echelle);
  rendreGrapheActif();
  chargerBougies();
}));

$("comparer").addEventListener("change", (e) => {
  etat.comparer = e.target.checked;
  rendreCourbe();
});

function rendreOrdres() {
  const ligne = (o) => {
    const achat = o.side === "buy";
    const quantite = o.qty ? Number(o.qty).toLocaleString("fr-FR", { maximumFractionDigits: 6 })
      : o.notional ? dollarsPrecis.format(Number(o.notional)) : "—";
    const execute = Number(o.filled_qty) > 0
      ? `${Number(o.filled_qty).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} @ ${dollarsPrecis.format(Number(o.filled_avg_price))}`
      : "—";
    return `<tr><td>${date(o.submitted_at ?? o.created_at)}</td><td class="gauche"><b>${echapper(versRobot(o.symbol))}</b></td>` +
      `<td class="gauche ${achat ? "vert" : "rouge"}">${achat ? "achat" : "vente"}</td><td>${quantite}</td>` +
      `<td>${execute}</td><td class="gauche">${echapper(o.status)}</td>` +
      `<td>${o.filled_at ? date(o.filled_at) : "—"}</td></tr>`;
  };
  const entete = `<tr><th>Envoyé</th><th class="gauche">Actif</th><th class="gauche">Sens</th><th>Demandé</th>` +
    `<th>Exécuté</th><th class="gauche">Statut</th><th>Exécuté le</th></tr>`;
  const attente = ordresEnAttente(etat.compte.ordres);
  $("attente").innerHTML = attente.length ? entete + attente.map(ligne).join("")
    : `<tr><td class="vide">Aucun ordre en attente.</td></tr>`;
  $("historique").innerHTML = etat.compte.ordres.length ? entete + etat.compte.ordres.map(ligne).join("")
    : `<tr><td class="vide">Aucun ordre pour l'instant.</td></tr>`;
}

function rendreJournal() {
  if (!etat.rapports.length) {
    $("journal").innerHTML = `<p class="vide">Le journal se remplira à chaque passage du robot.</p>`;
    return;
  }
  const ouverts = new Set([...document.querySelectorAll("#journal details[open]")].map((d) => d.dataset.id));
  $("journal").innerHTML = etat.rapports.map((r, i) =>
    `<details data-id="${r.id}"${ouverts.has(String(r.id)) || (i === 0 && !ouverts.size) ? " open" : ""}>` +
    `<summary><b>${echapper(r.seance)}</b> · ${echapper(r.statut)} · compte ${r.capital ? dollars.format(r.capital) : "—"}` +
    ` · chute ${pct(r.chute)} · ${(r.ordres ?? []).length} ordre(s)</summary>` +
    `<pre class="message">${echapper(r.message)}</pre>` +
    `${(r.remarques ?? []).length ? `<p class="doux">${(r.remarques ?? []).map(echapper).join("<br>")}</p>` : ""}</details>`,
  ).join("");
}

demarrer();
