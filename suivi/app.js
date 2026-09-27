// Page de suivi en direct du robot v3 : connexion Supabase, données Alpaca via /api (Vercel), graphiques TradingView.
// Style noir et blanc : les hausses et les baisses se lisent avec ▲ ▼ et les signes, jamais avec une couleur.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import {
  NOMS, SEUILS, UNIVERS, bougies, chuteDepuisSommet, courbe, dureeAvant, estCrypto, etatSecurites, lignesPositions,
  marqueursOrdres, ordresEnAttente, phraseEtat, prochainPassage, resumeCompte, versRobot,
} from "./logique.js";

const RAFRAICHIR_COMPTE = 15_000;     // valeur, positions, ordres : toutes les 15 secondes
const RAFRAICHIR_BOUGIES = 60_000;    // graphique de l'actif : chaque minute
const RAFRAICHIR_JOURNAL = 300_000;   // rapports du robot : toutes les 5 minutes (+ en direct par Supabase)

// --- Mise en forme -----------------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const nombre = (chiffres) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres });
const entier = nombre(0);
const deux = nombre(2);
const dollars = (v) => `${entier.format(v)} $`;
const dollarsPrecis = (v) => `${deux.format(v)} $`;
const pct = (v, chiffres = 1) => (v === null || v === undefined || !Number.isFinite(v)
  ? "—" : `${(v * 100).toFixed(chiffres).replace(".", ",")} %`);
const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "");
const fleche = (v) => (v > 0 ? "▲" : v < 0 ? "▼" : "●");
const variation = (v, texte) => `${fleche(v)} ${signe(v)}${texte}`;
const dateCourte = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const dateHeure = (iso) => new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
const echapper = (texte) => String(texte ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Couleurs des graphiques : uniquement du blanc et des gris
const BLANC = "#f5f5f5";
const GRIS = "rgba(255,255,255,0.42)";
const GRILLE = "rgba(255,255,255,0.05)";

const etat = {
  supabase: null, ouvert: false, minuteries: [], canal: null,
  compte: null, rapports: [], spy: null, bougies: {}, valeurAffichee: null,
  periode: "annee", comparer: true, symbole: "SPY", echelle: "jour",
  graphes: {}, pointsCompte: [], pointsSpy: [],
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
    $("erreur-connexion").textContent = `Configuration incomplète : ${config.erreur}.`;
    return;
  }
  etat.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  etat.supabase.auth.onAuthStateChange((_evenement, session) => (session ? ouvrir() : fermer()));
  const { data } = await etat.supabase.auth.getSession();
  if (data.session) ouvrir(); else fermer();
}

$("formulaire").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erreur-connexion").textContent = "Connexion…";
  const { error } = await etat.supabase.auth.signInWithPassword({
    email: $("email").value.trim(), password: $("motdepasse").value,
  });
  $("erreur-connexion").textContent = error ? `Connexion refusée : ${error.message}` : "";
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
  rendreChoixActifs();
  rendreCompteARebours();
  chargerCompte();
  chargerJournal();
  chargerBougies();
  chargerSpy();
  etat.minuteries = [
    setInterval(() => document.visibilityState === "visible" && chargerCompte(), RAFRAICHIR_COMPTE),
    setInterval(() => document.visibilityState === "visible" && chargerBougies(), RAFRAICHIR_BOUGIES),
    setInterval(chargerJournal, RAFRAICHIR_JOURNAL),
    setInterval(rendreCompteARebours, 30_000),
  ];
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
  $("bandeau").textContent = texte ? `${texte} — les dernières données connues restent affichées.` : "";
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
    rendreGrapheActif(true);
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

const dernierRapport = () => etat.rapports[0] ?? null;

function rendreTout() {
  if (!etat.compte) return;
  rendreEntete();
  rendreHero();
  rendreTuiles();
  rendreCourbe();
  rendreSecurites();
  rendreDecision();
  rendrePositions();
  rendreGrapheActif(false);
  rendreOrdres();
  rendreJournal();
}

function rendreEntete() {
  const { horloge, heure } = etat.compte;
  $("marche").textContent = horloge?.is_open ? "Bourse de New York ouverte" : "Bourse fermée · crypto 24h/24";
  $("maj").textContent = `En direct · ${new Date(heure).toLocaleTimeString("fr-FR")}`;
}

function niveauActuel() {
  const r = resumeCompte(etat.compte.compte, etat.compte.positions);
  const chute = dernierRapport()?.chute ?? chuteDepuisSommet(courbe(etat.compte.historique.annee)).chute;
  return { r, chute, securite: etatSecurites(chute, r.gainJourPct) };
}

function rendreHero() {
  const { r, securite } = niveauActuel();
  const valeur = $("valeur");
  valeur.textContent = dollars(r.valeur);
  if (etat.valeurAffichee !== null && etat.valeurAffichee !== r.valeur) {
    valeur.classList.remove("eclat");
    void valeur.offsetWidth;   // relance l'animation
    valeur.classList.add("eclat");
  }
  etat.valeurAffichee = r.valeur;
  $("variation").innerHTML = `<b>${variation(r.gainJour, dollars(Math.abs(r.gainJour)))}</b>` +
    ` · ${signe(r.gainJourPct)}${pct(Math.abs(r.gainJourPct), 2)} aujourd'hui`;
  const nbPositions = etat.compte.positions.filter((p) => Number(p.market_value) > 0).length;
  const veto = dernierRapport()?.statut === "bloqué par le veto final";
  const phrase = phraseEtat({ niveau: securite.niveau, partInvestie: r.partInvestie, nbPositions, veto });
  const [premiere, ...suite] = phrase.split(/(?<=\.) /);
  $("phrase").innerHTML = `<b>${echapper(premiere)}</b> ${echapper(suite.join(" "))}`;
}

function rendreCompteARebours() {
  const prochain = prochainPassage(new Date());
  $("rebours").textContent = `dans ${dureeAvant(prochain, new Date())}`;
  $("rebours-heure").textContent = prochain.toLocaleString("fr-FR",
    { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function jauge(part, reperes = []) {
  const bornee = Math.min(Math.max(part, 0), 1);
  return `<div class="jauge"><div class="plein" style="width:${bornee * 100}%"></div>` +
    reperes.map((r) => `<div class="repere" style="left:${r * 100}%"></div>`).join("") + `</div>`;
}

function tuile(titre, valeur, detail, jaugeHtml = "") {
  return `<div class="carte tuile"><h3>${titre}</h3><div class="valeur">${valeur}</div>` +
    `<div class="detail">${detail}</div>${jaugeHtml}</div>`;
}

function rendreTuiles() {
  const { r, chute } = niveauActuel();
  const lignes = lignesPositions(etat.compte.positions, r.valeur);
  const latent = lignes.reduce((total, l) => total + l.gainLatent, 0);
  const m = dernierRapport()?.multiplicateur ?? null;
  $("tuiles").innerHTML = [
    tuile("Investi", pct(r.partInvestie, 0), `${dollars(r.investi)} en positions · ${dollars(r.cash)} en cash`,
      jauge(r.partInvestie)),
    tuile("Chute depuis le sommet", pct(chute), "achats bloqués à −20 % · tout vendu à −25 %",
      jauge(Math.abs(chute) / 0.25, [0.8])),
    tuile("Gain sur les positions", `${fleche(latent)} ${signe(latent)}${dollars(Math.abs(latent))}`,
      "gain ou perte si tout était vendu maintenant"),
    tuile("Multiplicateur de risque", m ? `×${deux.format(m)}` : "—",
      m ? "le robot règle sa prise de risque (entre ×1 et ×2,5)" : "connu après le premier rapport du soir",
      m ? jauge((m - 1) / 1.5) : ""),
  ].join("");
}

function preparerGraphes() {
  if (etat.graphes.compte) return;
  const options = {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: "#6b6b6b", fontFamily: "Inter, system-ui, sans-serif" },
    grid: { vertLines: { color: GRILLE }, horzLines: { color: GRILLE } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true },
    crosshair: {
      vertLine: { color: "rgba(255,255,255,0.35)", labelBackgroundColor: "#262626" },
      horzLine: { color: "rgba(255,255,255,0.35)", labelBackgroundColor: "#262626" },
    },
    localization: { locale: "fr-FR" },
  };
  const compte = LightweightCharts.createChart($("graphe-compte"), options);
  etat.graphes.compte = compte;
  etat.graphes.valeur = compte.addAreaSeries({
    lineColor: BLANC, topColor: "rgba(255,255,255,0.28)", bottomColor: "rgba(255,255,255,0)", lineWidth: 2,
    priceFormat: { type: "price", precision: 0, minMove: 1 }, crosshairMarkerBorderColor: "#000",
  });
  etat.graphes.spy = compte.addLineSeries({
    color: GRIS, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
  });
  compte.subscribeCrosshairMove((p) => lireCompte(p));

  const actif = LightweightCharts.createChart($("graphe-actif"), options);
  etat.graphes.actif = actif;
  // Bougies en noir et blanc : hausse = pleine et blanche, baisse = vide avec un contour gris
  etat.graphes.bougies = actif.addCandlestickSeries({
    upColor: BLANC, borderUpColor: BLANC, wickUpColor: BLANC,
    downColor: "#000", borderDownColor: "#8a8a8a", wickDownColor: "#8a8a8a",
  });
  etat.graphes.ligneMoyenne = null;
  actif.subscribeCrosshairMove((p) => lireActif(p));
}

function lireCompte(point) {
  const pts = etat.pointsCompte;
  if (!pts.length) return;
  const valeur = point?.seriesData?.get(etat.graphes.valeur)?.value ?? pts.at(-1).value;
  const temps = point?.time ?? pts.at(-1).time;
  const spy = point?.seriesData?.get(etat.graphes.spy)?.value ?? etat.pointsSpy.at(-1)?.value;
  const debut = pts[0].value;
  const quand = new Date(temps * 1000).toLocaleString("fr-FR", etat.periode === "jour"
    ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" });
  $("lecture-compte").innerHTML = `${quand} · <b>${dollars(valeur)}</b> (${variation(valeur - debut, pct(Math.abs(valeur / debut - 1)))} depuis le début)` +
    (spy && etat.pointsSpy.length ? ` · SPY au même départ : ${dollars(spy)}` : "");
}

function rendreCourbe() {
  if (!etat.compte || !etat.graphes.valeur) return;
  const points = courbe(etat.compte.historique[etat.periode]);
  etat.pointsCompte = points;
  etat.graphes.valeur.setData(points);
  let spy = [];
  if (etat.comparer && etat.periode === "annee" && etat.spy?.length && points.length) {
    const debut = points[0].time;
    const barres = etat.spy.map((b) => ({ time: Math.floor(Date.parse(b.t) / 1000), value: b.c }))
      .filter((b) => b.time >= debut - 86_400);
    if (barres.length) spy = barres.map((b) => ({ time: b.time, value: b.value * points[0].value / barres[0].value }));
  }
  etat.pointsSpy = spy;
  etat.graphes.spy.setData(spy);
  etat.graphes.compte.timeScale().fitContent();
  $("legende-compte").innerHTML = `<span><i></i>Ton compte</span>` +
    (spy.length ? `<span><i class="gris"></i>SPY acheté et gardé, même départ</span>` : "");
  if (points.length) lireCompte(null);
  else $("lecture-compte").textContent = "Pas encore d'historique : le compte vient de démarrer.";
}

function rendreSecurites() {
  const { r, chute, securite } = niveauActuel();
  const normal = securite.niveau === "normal";
  const veto = dernierRapport()?.statut === "bloqué par le veto final";
  $("securites").innerHTML =
    `<div class="etat ${normal && !veto ? "" : "alerte"}"><span class="rond">${normal && !veto ? "✓" : "!"}</span>` +
    `${normal ? "Aucune sécurité déclenchée" : `Sécurité : ${securite.niveau}`}${veto ? " · veto final actif" : ""}</div>` +
    `<div class="securite"><div class="haut"><span>Chute depuis le sommet</span><b>${pct(chute)}</b></div>` +
    jauge(Math.abs(chute) / 0.30, [0.2 / 0.3, 0.25 / 0.3]) +
    `<div class="jauge-bas"><span>0 %</span><span>−20 % achats bloqués</span><span>−25 % tout vendu</span></div></div>` +
    `<div class="securite"><div class="haut"><span>Perte du jour</span><b>${pct(Math.min(r.gainJourPct, 0))}</b></div>` +
    jauge(Math.abs(Math.min(r.gainJourPct, 0)) / 0.08, [0.05 / 0.08]) +
    `<div class="jauge-bas"><span>0 %</span><span>−5 % alerte</span></div></div>` +
    `<p class="note-bas">Encore ${pct(securite.avantArretAchats)} avant le blocage des achats et ${pct(securite.avantArretTotal)} ` +
    `avant l'arrêt total. À savoir : un krach survenu pendant la nuit peut dépasser −25 % avant que le robot ne réagisse.</p>`;
}

function rendreDecision() {
  const rapport = dernierRapport();
  if (!rapport) {
    $("decision").innerHTML = `<p class="note-bas" style="margin:0">Pas encore de rapport. Chaque soir de semaine, après la clôture
      de New York, le robot écrit ici ce qu'il a vu et décidé. La prochaine décision arrive au moment indiqué en haut à droite.</p>`;
    return;
  }
  const ordres = rapport.ordres ?? [];
  const puces = ordres.map((o) => `<span class="puce ${o.sens === "achat" ? "achat" : ""}">${o.sens === "achat" ? "▲" : "▼"} ` +
    `${echapper(o.symbole.replace("-USD", ""))} ${o.fermer ? "tout vendre" : dollars(o.montant)}</span>`).join("");
  $("decision").innerHTML =
    `<div class="etat"><span class="rond">${ordres.length}</span>${echapper(rapport.statut)}</div>` +
    `<p style="color:var(--doux)">Séance du <b style="color:var(--encre)">${new Date(rapport.seance).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</b>` +
    ` · écrit le ${dateHeure(rapport.cree_le)}</p>` +
    (puces ? `<div class="ordres-soir">${puces}</div>` : `<p class="note-bas">Aucun ordre : tout était déjà à sa place (zone tampon).</p>`) +
    `<details class="message"><summary>Lire le message complet du robot</summary><pre class="texte">${echapper(rapport.message)}</pre></details>`;
}

function rendrePositions() {
  const r = resumeCompte(etat.compte.compte, etat.compte.positions);
  const lignes = Object.fromEntries(lignesPositions(etat.compte.positions, r.valeur).map((l) => [l.symbole, l]));
  const decisions = Object.fromEntries((dernierRapport()?.actifs ?? []).map((a) => [a.symbole, a]));
  const autres = Object.keys(lignes).filter((s) => !UNIVERS.includes(s));
  const echelle = Math.max(0.25, ...Object.values(lignes).map((l) => l.part));   // 25 % = plafond par actif
  const ordre = [...UNIVERS, ...autres].sort((a, b) => (lignes[b]?.valeur ?? 0) - (lignes[a]?.valeur ?? 0)
    || (decisions[b]?.visee ?? 0) - (decisions[a]?.visee ?? 0));
  $("liste-positions").innerHTML = ordre.map((s) => {
    const l = lignes[s];
    const d = decisions[s];
    const part = l?.part ?? 0;
    const visee = d?.visee ?? null;
    const note = d?.note ?? null;
    const points = Array.from({ length: 5 }, (_, i) => `<i class="${note !== null && note >= (i + 1) * 4 - 2 ? "on" : ""}"></i>`).join("");
    const vide = !l && !visee;
    return `<div class="position${vide ? " vide" : ""}${s === etat.symbole ? " choisie" : ""}" data-symbole="${echapper(s)}" tabindex="0" role="button"` +
      ` aria-label="Voir le graphique de ${echapper(s)}">` +
      `<div class="actif"><b>${echapper(s.replace("-USD", ""))}</b>${d?.exclu ? " ⚠" : ""}<small>${echapper(NOMS[s] ?? "hors panier du robot")}</small></div>` +
      `<div class="repartition"><div class="barre"><div class="actuelle" style="width:${part / echelle * 100}%"></div>` +
      (visee !== null ? `<div class="visee" style="left:${Math.min(visee / echelle, 1) * 100}%"></div>` : "") + `</div>` +
      `<div class="texte"><span>${pct(part)} du compte</span><span>${visee !== null ? `visée ${pct(visee)}` : ""}</span></div></div>` +
      `<div class="montant chiffres">${l ? dollars(l.valeur) : "—"}<small>${l ? `${l.quantite.toLocaleString("fr-FR", { maximumFractionDigits: 6 })} parts` : "pas de position"}</small></div>` +
      `<div class="gain chiffres">${l ? `${variation(l.gainLatent, dollars(Math.abs(l.gainLatent)))}<small>${signe(l.gainLatentPct)}${pct(Math.abs(l.gainLatentPct))} · jour ${signe(l.gainJour)}${dollars(Math.abs(l.gainJour))}</small>` : "—"}</div>` +
      `<div class="note" title="Note de tendance de 0 (cash) à 20 (très forte)"><div class="points">${points}</div>` +
      `<span>${note === null ? "pas de note" : `note ${nombre(1).format(note)}`}${d?.regime ? ` · ${echapper(d.regime)}` : ""}</span></div>` +
      `</div>`;
  }).join("");
}

function ouvrirActif(element) {
  const ligne = element.closest("[data-symbole]");
  if (ligne && UNIVERS.includes(ligne.dataset.symbole)) {
    choisirActif(ligne.dataset.symbole);
    $("graphique").scrollIntoView({ behavior: "smooth" });
  }
}
$("liste-positions").addEventListener("click", (e) => ouvrirActif(e.target));
$("liste-positions").addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && ouvrirActif(e.target));

function rendreChoixActifs() {
  $("choix-actifs").innerHTML = UNIVERS.map((s) =>
    `<button data-actif="${s}" class="${s === etat.symbole ? "actif" : ""}">${s.replace("-USD", "")}</button>`).join("");
}
$("choix-actifs").addEventListener("click", (e) => {
  const bouton = e.target.closest("[data-actif]");
  if (bouton) choisirActif(bouton.dataset.actif);
});

function choisirActif(symbole) {
  etat.symbole = symbole;
  rendreChoixActifs();
  if (etat.compte) rendrePositions();
  rendreGrapheActif(true);
  chargerBougies();
}

function lireActif(point) {
  const donnees = etat.graphes.donneesActif ?? [];
  if (!donnees.length) {
    $("lecture-actif").textContent = "Chargement des cours…";
    return;
  }
  const b = point?.seriesData?.get(etat.graphes.bougies) ?? donnees.at(-1);
  const quand = typeof b.time === "string" ? new Date(b.time).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : new Date(b.time * 1000).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const ecart = b.close / b.open - 1;
  $("lecture-actif").innerHTML = `${quand} · ouverture ${dollarsPrecis(b.open)} · haut ${dollarsPrecis(b.high)} · bas ${dollarsPrecis(b.low)}` +
    ` · clôture <b>${dollarsPrecis(b.close)}</b> (${variation(ecart, pct(Math.abs(ecart), 2))})`;
}

function rendreGrapheActif(recadrer) {
  if (!etat.graphes.bougies) return;
  const parJour = etat.echelle === "jour";
  const donnees = bougies(etat.bougies[`${etat.symbole}|${etat.echelle}`] ?? [], parJour);
  etat.graphes.donneesActif = donnees;
  etat.graphes.bougies.setData(donnees);
  const marqueurs = marqueursOrdres(etat.compte?.ordres ?? [], etat.symbole, donnees.map((b) => b.time), parJour)
    .map((m) => ({ ...m, color: m.shape === "arrowUp" ? BLANC : "#8a8a8a" }));
  etat.graphes.bougies.setMarkers(marqueurs);
  if (etat.graphes.ligneMoyenne) etat.graphes.bougies.removePriceLine(etat.graphes.ligneMoyenne);
  etat.graphes.ligneMoyenne = null;
  const position = (etat.compte?.positions ?? []).find((p) => versRobot(p.symbol) === etat.symbole);
  if (position) {
    etat.graphes.ligneMoyenne = etat.graphes.bougies.createPriceLine({
      price: Number(position.avg_entry_price), color: "rgba(255,255,255,0.6)", lineWidth: 1, lineStyle: 2,
      axisLabelVisible: true, title: "ton prix moyen",
    });
  }
  if (recadrer) etat.graphes.actif.timeScale().fitContent();
  $("titre-actif").textContent = `${etat.symbole.replace("-USD", "")} · ${NOMS[etat.symbole]}`;
  lireActif(null);
  if (donnees.length && estCrypto(etat.symbole)) $("lecture-actif").innerHTML += " · crypto cotée 24h/24";
}

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
  rendreGrapheActif(true);
  chargerBougies();
}));
$("comparer").addEventListener("change", (e) => {
  etat.comparer = e.target.checked;
  rendreCourbe();
});

function rendreOrdres() {
  const ligne = (o) => {
    const achat = o.side === "buy";
    const demande = o.qty ? `${Number(o.qty).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} parts`
      : o.notional ? dollarsPrecis(Number(o.notional)) : "—";
    const execute = Number(o.filled_qty) > 0
      ? `${Number(o.filled_qty).toLocaleString("fr-FR", { maximumFractionDigits: 6 })} à ${dollarsPrecis(Number(o.filled_avg_price))}` : "—";
    const statuts = { filled: "exécuté", accepted: "en attente", new: "en attente", pending_new: "en attente",
      canceled: "annulé", expired: "expiré", rejected: "refusé", partially_filled: "en partie exécuté" };
    return `<tr><td>${dateHeure(o.submitted_at ?? o.created_at)}</td><td class="g"><b>${echapper(versRobot(o.symbol).replace("-USD", ""))}</b></td>` +
      `<td class="g"><span class="sens ${achat ? "achat" : "vente"}">${achat ? "achat" : "vente"}</span></td><td>${demande}</td>` +
      `<td>${execute}</td><td class="g">${echapper(statuts[o.status] ?? o.status)}</td></tr>`;
  };
  const entete = `<thead><tr><th>Envoyé</th><th class="g">Actif</th><th class="g">Sens</th><th>Demandé</th><th>Exécuté</th><th class="g">Statut</th></tr></thead>`;
  const attente = ordresEnAttente(etat.compte.ordres);
  $("attente").innerHTML = attente.length ? entete + `<tbody>${attente.map(ligne).join("")}</tbody>`
    : `<tbody><tr><td class="vide-texte">Rien en attente. Les ordres du soir apparaissent ici jusqu'à leur exécution.</td></tr></tbody>`;
  $("historique").innerHTML = etat.compte.ordres.length ? entete + `<tbody>${etat.compte.ordres.map(ligne).join("")}</tbody>`
    : `<tbody><tr><td class="vide-texte">Aucun ordre pour l'instant.</td></tr></tbody>`;
}

function rendreJournal() {
  if (!etat.rapports.length) {
    $("liste-journal").innerHTML = `<p class="vide-texte">Le journal se remplira à chaque passage du robot (les soirs de semaine).</p>`;
    return;
  }
  const ouverts = new Set([...document.querySelectorAll("#liste-journal details[open]")].map((d) => d.dataset.id));
  $("liste-journal").innerHTML = etat.rapports.map((r, i) =>
    `<details class="carte jour" data-id="${r.id}"${ouverts.has(String(r.id)) || (i === 0 && !ouverts.size) ? " open" : ""}>` +
    `<summary><b>${dateCourte(r.seance)}</b><span>${echapper(r.statut)}</span>` +
    `<span>compte ${r.capital ? dollars(r.capital) : "—"}</span><span>chute ${pct(r.chute)}</span>` +
    `<span>${(r.ordres ?? []).length} ordre${(r.ordres ?? []).length > 1 ? "s" : ""}</span></summary>` +
    `<pre class="texte">${echapper(r.message)}</pre>` +
    `${(r.remarques ?? []).length ? `<p class="note-bas">${(r.remarques ?? []).map(echapper).join("<br>")}</p>` : ""}</details>`,
  ).join("");
}

// --- Menu : suit la section visible ------------------------------------------------------------------

const liens = [...document.querySelectorAll(".menu a")];
const observateur = new IntersectionObserver((entrees) => {
  entrees.filter((e) => e.isIntersecting).forEach((e) => {
    liens.forEach((a) => a.classList.toggle("actif", a.getAttribute("href") === `#${e.target.id}`));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
document.querySelectorAll("section.bloc").forEach((s) => observateur.observe(s));

demarrer();
