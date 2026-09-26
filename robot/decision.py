"""Décision quotidienne du robot v3 (v2 + multiplicateur de risque + zone tampon), sans Internet.

Tout ce qui décide est ici, en fonctions simples testables. robot_v3.py ne fait que lire le compte
Alpaca, appeler ces fonctions et transmettre les ordres.

Sécurités du robot (docs/STRATEGIE_V2.md, section 6) :
- données douteuses sur un actif : aucun ordre sur cet actif ;
- perte de plus de 5 % en une journée : alerte ;
- compte à -20 % de son plus haut : plus aucun achat ;
- compte à -25 % de son plus haut : tout est vendu, et plus rien n'est acheté tant que tu n'as pas
  redonné une date de départ (variable ROBOT_V3_DEPART) ;
- veto final (idée de la vidéo de la boîte à idées) : avant l'envoi, `controle_final` revérifie le plan
  d'ordres contre les limites, sans réutiliser les calculs de la stratégie. S'il trouve une anomalie
  (un bug, par exemple), aucun ordre ne part.
"""
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from robot.parametres import (
    ALERTE_PERTE_JOUR, ARRET_ACHATS_CHUTE, ARRET_TOTAL_CHUTE, BUDGET_RISQUE, DETECTEURS, EXPOSITION_MAX,
    PART_MAX_ACTIF, PART_MAX_CRYPTO, TAMPON,
)
from robot.portefeuille import est_crypto, preparer_risque, tampon_rapide
from robot.signaux import notes as calculer_notes
from robot.signaux import notes_detecteurs
from robot.simulation import cibles_strategie
from robot.univers import PAR_SYMBOLE

ORDRE_MINIMUM = 5.0          # en dollars : en dessous, l'ordre n'en vaut pas la peine
MARGE_CASH = 0.99            # on n'engage jamais plus de 99 % du cash disponible (pas de levier)
ALPACA = {"BTC-USD": "BTC/USD", "ETH-USD": "ETH/USD"}   # symboles Alpaca de la crypto
MARGE_VETO = 0.02            # le veto tolère 2 points au-dessus des plafonds (prix qui bougent) : il vise les vrais bugs


def symbole_alpaca(symbole):
    return ALPACA.get(symbole, symbole)


def symbole_depuis_position(symbole_position):
    """Alpaca écrit « BTCUSD » dans les positions : on le ramène à « BTC-USD »."""
    for notre, alpaca in ALPACA.items():
        if symbole_position in (alpaca, alpaca.replace("/", "")):
            return notre
    return symbole_position


def decision_du_jour(ouvertures, clotures, parts_actuelles):
    """Ce que la v3 veut détenir après la dernière clôture, actif par actif.

    `parts_actuelles` : part du capital déjà investie dans chaque actif (0 si rien).
    Renvoie (tableau par actif, multiplicateur de risque du jour).
    """
    risque = preparer_risque(clotures)
    notes = calculer_notes(clotures)
    cibles, multiplicateur, tampons = cibles_strategie(ouvertures, clotures, notes, risque,
                                                       budget=BUDGET_RISQUE, tampon=TAMPON)
    symboles = list(clotures.columns)
    actuelles = parts_actuelles.reindex(symboles).fillna(0.0).to_numpy(dtype=float)
    cible = cibles.iloc[-1].reindex(symboles).fillna(0.0).to_numpy(dtype=float)
    largeur = tampons.iloc[-1].reindex(symboles).fillna(0.0).to_numpy(dtype=float)
    crypto = np.array([est_crypto(s) for s in symboles])
    visee = tampon_rapide(cible, actuelles, largeur, crypto)

    lignes = []
    for k, symbole in enumerate(symboles):
        details = notes_detecteurs(clotures[symbole]).iloc[-1]
        note = notes[symbole].iloc[-1]
        lignes.append({
            "symbole": symbole,
            "nom": PAR_SYMBOLE[symbole].nom if symbole in PAR_SYMBOLE else symbole,
            "note": None if pd.isna(note) else float(note),
            "haussiers": int((details > 0).sum()),
            "detecteurs": len(DETECTEURS),
            "actuelle": float(actuelles[k]),
            "cible": float(cible[k]),
            "visee": float(visee[k]),
        })
    return pd.DataFrame(lignes).set_index("symbole"), float(multiplicateur.iloc[-1])


def etat_securite(equites, capital, capital_veille):
    """Sécurités du compte. `equites` : valeur du compte chaque soir depuis la date de départ."""
    historique = [float(v) for v in equites if v is not None and v > 0] + [float(capital)]
    sommet = max(historique)
    chute = capital / sommet - 1
    perte_jour = capital / capital_veille - 1 if capital_veille and capital_veille > 0 else 0.0
    return {
        "sommet": sommet,
        "chute": chute,
        "perte_jour": perte_jour,
        "alerte_perte_jour": perte_jour <= -ALERTE_PERTE_JOUR + 1e-9,
        "bloquer_achats": chute <= -ARRET_ACHATS_CHUTE + 1e-9,   # tolérance : -20 % pile déclenche bien
        "tout_vendre": chute <= -ARRET_TOTAL_CHUTE + 1e-9,
    }


@dataclass
class Ordre:
    symbole: str            # notre symbole (SPY, BTC-USD…)
    sens: str               # "achat" ou "vente"
    montant: float          # en dollars
    quantite: float = None  # pour une vente partielle (en parts) ; None pour un achat en montant
    fermer: bool = False    # vente de toute la position


def _quantite(montant, prix, fractionnable):
    brute = montant / prix
    return math.floor(brute * 1e6) / 1e6 if fractionnable else float(math.floor(brute))


def plan_ordres(decision, positions, prix, capital, cash, fractionnable, securite, exclus=()):
    """Ordres à transmettre pour passer des positions actuelles aux parts visées.

    `positions` : {symbole: (quantité, valeur en $)} ; `prix` : dernier prix connu ; `exclus` : actifs aux
    données douteuses (aucun ordre). Les ventes passent avant les achats, et les achats ne dépassent
    jamais le cash disponible plus le produit des ventes (jamais de levier).
    """
    ventes, achats = [], []
    for symbole, ligne in decision.iterrows():
        if symbole in exclus:
            continue
        quantite, valeur = positions.get(symbole, (0.0, 0.0))
        visee = 0.0 if securite["tout_vendre"] else ligne["visee"]
        ecart = visee * capital - valeur
        if visee == 0 and quantite > 0:
            ventes.append(Ordre(symbole, "vente", valeur, quantite, fermer=True))
        elif ecart <= -ORDRE_MINIMUM:
            q = _quantite(-ecart, prix[symbole], fractionnable.get(symbole, True))
            if q >= quantite * 0.999:
                ventes.append(Ordre(symbole, "vente", valeur, quantite, fermer=True))
            elif q > 0:
                ventes.append(Ordre(symbole, "vente", q * prix[symbole], q))
        elif ecart >= ORDRE_MINIMUM and not securite["bloquer_achats"]:
            if fractionnable.get(symbole, True):
                achats.append(Ordre(symbole, "achat", round(ecart, 2)))
            else:
                q = _quantite(ecart, prix[symbole], False)
                if q > 0:
                    achats.append(Ordre(symbole, "achat", q * prix[symbole], q))

    disponible = MARGE_CASH * (max(cash, 0.0) + sum(o.montant for o in ventes))
    total = sum(o.montant for o in achats)
    if total > disponible:   # pas assez de cash : tous les achats sont réduits dans la même proportion
        facteur = disponible / total
        reduits = []
        for o in achats:
            if o.quantite is None:
                montant = round(o.montant * facteur, 2)
                if montant >= ORDRE_MINIMUM:
                    reduits.append(Ordre(o.symbole, "achat", montant))
            else:
                q = float(math.floor(o.quantite * facteur))
                if q > 0:
                    reduits.append(Ordre(o.symbole, "achat", q * o.montant / o.quantite, q))
        achats = reduits
    return ventes + achats


def controle_final(ordres, positions, capital, cash, securite, marge=MARGE_VETO):
    """Veto final : revérifie le plan d'ordres, indépendamment du calcul qui l'a produit.

    Renvoie la liste des anomalies (vide si tout va bien). Contrôles : actif connu, montants et quantités
    positifs, pas de vente de plus que ce qu'on détient (jamais de vente à découvert), pas d'achat pendant
    un arrêt de sécurité, pas plus d'achats que le cash disponible (pas de levier), et, après les ordres,
    25 % au plus par actif acheté, 15 % au plus en crypto, 100 % au plus investi (plus `marge`).
    """
    pct = lambda v: f"{v * 100:.0f} %"
    dollars = lambda v: f"{v:,.0f} $".replace(",", " ")
    problemes, valides = [], []
    apres = {s: v for s, (_, v) in positions.items()}
    for o in ordres:
        if o.symbole not in PAR_SYMBOLE:
            problemes.append(f"{o.symbole} : actif hors du panier")
            continue
        if not (math.isfinite(o.montant) and o.montant > 0) or (o.quantite is not None and not o.quantite > 0):
            problemes.append(f"{o.symbole} : montant ou quantité invalide ({o.montant}, {o.quantite})")
            continue
        if o.sens == "vente":
            detenue = positions.get(o.symbole, (0.0, 0.0))[0]
            if o.quantite is not None and o.quantite > detenue * (1 + 1e-9):
                problemes.append(f"{o.symbole} : vente de {o.quantite} parts pour {detenue} détenues (découvert)")
            if securite["tout_vendre"] and not o.fermer:
                problemes.append(f"{o.symbole} : arrêt à -25 %, la vente devrait être complète")
            apres[o.symbole] = 0.0 if o.fermer else apres.get(o.symbole, 0.0) - o.montant
        elif o.sens == "achat":
            if securite["bloquer_achats"] or securite["tout_vendre"]:
                problemes.append(f"{o.symbole} : achat interdit pendant un arrêt de sécurité")
            apres[o.symbole] = apres.get(o.symbole, 0.0) + o.montant
        else:
            problemes.append(f"{o.symbole} : sens inconnu « {o.sens} »")
            continue
        valides.append(o)

    achats = [o for o in valides if o.sens == "achat"]
    if achats:
        ventes = sum(o.montant for o in valides if o.sens == "vente")
        total_achats = sum(o.montant for o in achats)
        if total_achats > MARGE_CASH * (max(cash, 0.0) + ventes) + 1.0:
            problemes.append(f"achats de {dollars(total_achats)} pour {dollars(cash + ventes)} disponibles (levier)")
        for s in {o.symbole for o in achats}:
            plafond = PART_MAX_CRYPTO if est_crypto(s) else PART_MAX_ACTIF
            if apres[s] > (plafond + marge) * capital:
                problemes.append(f"{s} : {pct(apres[s] / capital)} du capital après les ordres (plafond {pct(plafond)})")
        crypto = sum(v for s, v in apres.items() if est_crypto(s))
        if any(est_crypto(o.symbole) for o in achats) and crypto > (PART_MAX_CRYPTO + marge) * capital:
            problemes.append(f"crypto : {pct(crypto / capital)} du capital après les ordres (plafond {pct(PART_MAX_CRYPTO)})")
        investi = sum(apres.values())
        if investi > (EXPOSITION_MAX + marge) * capital:
            problemes.append(f"{pct(investi / capital)} du capital investi après les ordres (maximum {pct(EXPOSITION_MAX)})")
    return problemes


def message(seance, capital, securite, multiplicateur, decision, ordres, exclus=(), remarques=()):
    """Le compte rendu du soir, envoyé sur Telegram : ce que le robot voit, décide et pourquoi."""
    euros = lambda v: f"{v:,.0f} $".replace(",", " ")
    pct = lambda v: f"{v * 100:.1f} %".replace(".", ",")
    par_actif = {o.symbole: o for o in ordres}
    lignes = [
        f"🤖 Robot v3 · séance du {seance}",
        f"Compte : {euros(capital)} · chute depuis le sommet : {pct(securite['chute'])}",
        f"Multiplicateur de risque : x{multiplicateur:.2f}".replace(".", ",")
        + f" · investi visé : {pct(decision['visee'].sum())}",
        "",
    ]
    for symbole, l in decision.sort_values("visee", ascending=False).iterrows():
        note = "—" if l["note"] is None else f"{l['note']:.1f}".replace(".", ",")
        raison = f"{l['haussiers']}/{l['detecteurs']} détecteurs haussiers, note {note}"
        o = par_actif.get(symbole)
        if symbole in exclus:
            icone, action = "⚠️", "données douteuses : aucun ordre"
        elif o and o.sens == "achat":
            icone, action = "🟢", f"achat de {euros(o.montant)} ({pct(l['actuelle'])} → {pct(l['visee'])})"
        elif o and o.fermer:
            icone, action = "🔴", f"vente complète ({pct(l['actuelle'])} → 0 %)"
        elif o:
            icone, action = "🟠", f"allègement de {euros(o.montant)} ({pct(l['actuelle'])} → {pct(l['visee'])})"
        elif l["actuelle"] > 0:
            icone, action = "⚪", f"on garde {pct(l['actuelle'])} (dans la zone tampon)"
        else:
            icone, action = "💤", "cash"
        lignes.append(f"{icone} {symbole.replace('-USD', '')} : {raison} → {action}")
    lignes.append("")
    if securite["tout_vendre"]:
        lignes.append("🛑 COMPTE À -25 % DE SON SOMMET : tout est vendu. Le robot n'achètera plus rien tant "
                      "que tu n'auras pas donné une nouvelle date de départ (variable ROBOT_V3_DEPART).")
    elif securite["bloquer_achats"]:
        lignes.append("🟧 Compte à -20 % de son sommet : plus aucun achat, seulement des ventes.")
    if securite["alerte_perte_jour"]:
        lignes.append(f"⚠️ Perte de {pct(-securite['perte_jour'])} sur la journée.")
    lignes.extend(remarques)
    lignes.append(f"Ordres transmis : {len(ordres)} (actions à l'ouverture de New York, crypto tout de suite).")
    return "\n".join(lignes)
