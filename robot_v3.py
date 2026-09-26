"""Robot v3 en argent fictif (compte PAPER Alpaca) : 10 actifs, décision chaque soir.

GitHub Actions le lance chaque soir après la clôture de New York (.github/workflows/trading_v3.yml).
Les ordres sur les ETF sont exécutés à l'ouverture suivante ; ceux sur la crypto, tout de suite.

Règle d'or, comme la v1 : au moindre doute (données, ordre déjà en attente, compte anormal), le robot
ne passe AUCUN ordre et te prévient sur Telegram. Toute la logique de décision est dans robot/decision.py.
"""
import os
import sys
import traceback
from datetime import date, datetime

import pandas as pd
from alpaca.trading.enums import OrderSide, QueryOrderStatus, TimeInForce
from alpaca.trading.requests import GetOrdersRequest, GetPortfolioHistoryRequest, MarketOrderRequest

from bot import derniere_seance_terminee, envoyer_alerte
from connexion import client_alpaca
from robot.decision import (
    ORDRE_MINIMUM, achats_reportes, controle_final, decision_du_jour, etat_securite, message, plan_ordres,
    symbole_alpaca, symbole_depuis_position,
)
from robot.donnees import charger
from robot.portefeuille import est_crypto

DEPART_PAR_DEFAUT = "2026-09-28"   # le sommet du compte n'est compté qu'à partir de cette date


def date_de_depart():
    """Date à partir de laquelle on mesure le sommet du compte. Pour redémarrer après un arrêt à -25 %,
    donne une nouvelle date dans la variable GitHub ROBOT_V3_DEPART."""
    return date.fromisoformat(os.getenv("ROBOT_V3_DEPART") or DEPART_PAR_DEFAUT)


def historique_du_compte(client, depart):
    """Valeur du compte chaque soir depuis la date de départ (vide si le départ est dans le futur)."""
    historique = client.get_portfolio_history(GetPortfolioHistoryRequest(period="1A", timeframe="1D"))
    return [v for t, v in zip(historique.timestamp, historique.equity)
            if v is not None and datetime.fromtimestamp(t).date() >= depart]


def envoyer(client, ordre):
    symbole = symbole_alpaca(ordre.symbole)
    duree = TimeInForce.GTC if est_crypto(ordre.symbole) else TimeInForce.DAY
    if ordre.fermer:
        client.close_position(symbole.replace("/", ""))
    elif ordre.quantite is not None:
        client.submit_order(MarketOrderRequest(
            symbol=symbole, qty=ordre.quantite, time_in_force=duree,
            side=OrderSide.BUY if ordre.sens == "achat" else OrderSide.SELL))
    else:
        client.submit_order(MarketOrderRequest(
            symbol=symbole, notional=ordre.montant, side=OrderSide.BUY, time_in_force=duree))


def main(client=None, chargeur=charger):
    client = client or client_alpaca()
    seance = derniere_seance_terminee(client)

    # 1. Données : complètes, à jour, et sans problème (sinon, pas d'ordre sur l'actif concerné)
    donnees = chargeur()
    fin = donnees.clotures.index[-1].date()
    if fin != seance:
        envoyer_alerte(f"⚠️ ROBOT v3 : AUCUN ORDRE. Données arrêtées au {fin}, dernière séance {seance}.")
        return
    exclus = {l["symbole"] for l in donnees.rapport if l["problemes"]}

    # 2. Un ordre attend déjà ? On n'en ajoute pas (évite les ordres en double)
    en_attente = client.get_orders(GetOrdersRequest(status=QueryOrderStatus.OPEN))
    if en_attente:
        envoyer_alerte(f"⏳ ROBOT v3 : AUCUN NOUVEL ORDRE, {len(en_attente)} ordre(s) déjà en attente d'exécution.")
        return

    # 3. Le compte
    compte = client.get_account()
    capital, veille = float(compte.equity), float(compte.last_equity)
    # Comme sur un compte sans marge : jamais plus que le cash réel, ni que le pouvoir d'achat d'Alpaca
    cash = min(float(compte.cash), float(compte.buying_power))
    if capital <= 0 or cash < 0:
        envoyer_alerte(f"⚠️ ROBOT v3 : AUCUN ORDRE, compte anormal (valeur {capital:.0f} $, cash {cash:.0f} $).")
        return
    positions, remarques = {}, []
    for p in client.get_all_positions():
        symbole = symbole_depuis_position(p.symbol)
        if symbole not in donnees.clotures.columns:
            remarques.append(f"ℹ️ Position {p.symbol} hors du panier : le robot n'y touche pas.")
            continue
        if float(p.qty) < 0:
            envoyer_alerte(f"⚠️ ROBOT v3 : AUCUN ORDRE, position {p.symbol} négative : vérifie le compte.")
            return
        positions[symbole] = (float(p.qty), float(p.market_value))
    parts = pd.Series({s: v / capital for s, (_, v) in positions.items()}, dtype=float)

    # 4. Sécurités et décision
    securite = etat_securite(historique_du_compte(client, date_de_depart()), capital, veille)
    decision, multiplicateur = decision_du_jour(donnees.ouvertures, donnees.clotures, parts)
    prix = donnees.clotures.iloc[-1].to_dict()
    fractionnable = {}
    for symbole in decision.index:
        try:
            fractionnable[symbole] = bool(client.get_asset(symbole_alpaca(symbole)).fractionable)
        except Exception:
            fractionnable[symbole] = False
    ordres = plan_ordres(decision, positions, prix, capital, cash, fractionnable, securite, exclus,
                         compter_ventes=False)
    reporte = achats_reportes(decision, positions, capital, ordres, securite, exclus)

    # 5. Veto final : une sécurité indépendante revérifie le plan. Au moindre doute, AUCUN ordre ne part
    problemes = controle_final(ordres, positions, capital, cash, securite, compter_ventes=False)
    if problemes:
        envoyer_alerte("🛑 ROBOT v3 : AUCUN ORDRE, le veto final a bloqué le plan du soir :\n- "
                       + "\n- ".join(problemes) + "\nC'est probablement un bug : vérifie le journal GitHub.")
        return

    # 6. Transmission des ordres (une erreur sur un actif n'empêche pas les autres)
    transmis = []
    for ordre in ordres:
        try:
            envoyer(client, ordre)
            transmis.append(ordre)
        except Exception as e:
            remarques.append(f"❌ Ordre {ordre.sens} {ordre.symbole} refusé : {type(e).__name__} : {e}")
    if reporte >= ORDRE_MINIMUM * 10:
        remarques.append(f"💶 {reporte:,.0f} $ d'achats reportés à demain : ils attendent l'argent des ventes "
                         "(exécutées à l'ouverture).".replace(",", " "))
    if exclus:
        remarques.append("⚠️ Données douteuses : " + ", ".join(sorted(exclus)) + " (voir le journal GitHub).")
    envoyer_alerte(message(seance, capital, securite, multiplicateur, decision, transmis, exclus, remarques))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc()   # détail complet dans les journaux GitHub Actions
        envoyer_alerte(f"❌ ROBOT v3 : ERREUR, le robot s'est arrêté\n{type(e).__name__} : {e}")
        sys.exit(1)
