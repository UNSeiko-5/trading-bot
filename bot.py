"""Robot SPY : investi quand SPY est au-dessus de sa moyenne 200 jours, en cash sinon.

GitHub Actions le lance chaque soir, après la clôture de la bourse de New York.
Un ordre passé le soir est exécuté à l'ouverture suivante.

Règle d'or : au moindre doute (données douteuses, ordre déjà en attente, erreur),
le robot ne passe AUCUN ordre et te prévient sur Telegram.
"""
import os
import sys
import traceback
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests
import yfinance as yf
from alpaca.trading.enums import OrderSide, QueryOrderStatus, TimeInForce
from alpaca.trading.requests import GetCalendarRequest, GetOrdersRequest, MarketOrderRequest

from connexion import client_alpaca
from strategie import SYMBOLE, calculer_sma, controler_donnees, decider

NEW_YORK = ZoneInfo("America/New_York")


def envoyer_alerte(texte):
    print(texte)
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if token and chat_id:
        try:
            reponse = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat_id, "text": texte},
                timeout=10,
            )
            if not reponse.ok:
                print(f"Telegram a refusé le message : {reponse.text}")
        except Exception as e:
            print(f"Erreur d'envoi Telegram : {e}")


def derniere_seance_terminee(client):
    """Date de la dernière séance de bourse clôturée, d'après le calendrier officiel
    (gère les week-ends, les jours fériés américains et les séances raccourcies)."""
    maintenant = datetime.now(NEW_YORK).replace(tzinfo=None)  # le calendrier Alpaca est en heure de New York
    seances = client.get_calendar(
        GetCalendarRequest(start=(maintenant - timedelta(days=10)).date(), end=maintenant.date())
    )
    terminees = [s for s in seances if s.close <= maintenant]
    return terminees[-1].date


def telecharger_historique():
    return yf.Ticker(SYMBOLE).history(period="2y")


def main():
    client = client_alpaca()

    # 1. Prix de clôture, uniquement pour des séances terminées
    seance = derniere_seance_terminee(client)
    prix = telecharger_historique().get("Close")
    if prix is not None and len(prix) > 0:
        prix = prix[prix.index.date <= seance]  # ignore la séance en cours (lancement manuel en journée)

    probleme = controler_donnees(prix, seance)
    if probleme:
        envoyer_alerte(f"⚠️ AUCUN ORDRE : problème de données\n{probleme}")
        return

    dernier_prix = float(prix.iloc[-1])
    derniere_sma = float(calculer_sma(prix).iloc[-1])

    # 2. Un ordre attend déjà d'être exécuté ? On n'en ajoute pas un deuxième.
    en_attente = client.get_orders(GetOrdersRequest(status=QueryOrderStatus.OPEN, symbols=[SYMBOLE]))
    if en_attente:
        envoyer_alerte(f"⏳ AUCUN NOUVEL ORDRE : {len(en_attente)} ordre(s) {SYMBOLE} déjà en attente d'exécution.")
        return

    # 3. Situation du compte
    capital = float(client.get_account().equity)
    positions = {p.symbol: float(p.qty) for p in client.get_all_positions()}
    parts = positions.get(SYMBOLE, 0.0)
    if parts < 0:
        envoyer_alerte(f"⚠️ AUCUN ORDRE : position {SYMBOLE} négative ({parts:g}), vérifie le compte.")
        return

    # 4. Décision
    action, quantite = decider(dernier_prix, derniere_sma, parts, capital)
    rapport = (
        f"Séance du {seance} | {SYMBOLE} : {dernier_prix:.2f} $ | SMA200 : {derniere_sma:.2f} $\n"
        f"Parts détenues : {parts:g} | Capital : {capital:,.0f} $"
    )

    if action == "ACHAT":
        client.submit_order(MarketOrderRequest(
            symbol=SYMBOLE, qty=quantite, side=OrderSide.BUY, time_in_force=TimeInForce.DAY))
        envoyer_alerte(f"🟢 ACHAT de {quantite} parts {SYMBOLE}\n{rapport}\nOrdre transmis (exécuté dès que la bourse est ouverte).")
    elif action == "VENTE":
        client.submit_order(MarketOrderRequest(
            symbol=SYMBOLE, qty=quantite, side=OrderSide.SELL, time_in_force=TimeInForce.DAY))
        envoyer_alerte(f"🔴 VENTE de {quantite:g} parts {SYMBOLE}\n{rapport}\nPassage sous la SMA200.")
    elif action == "GARDER":
        envoyer_alerte(f"ℹ️ HAUSSIER : position conservée\n{rapport}")
    else:
        envoyer_alerte(f"ℹ️ BAISSIER : on reste en cash\n{rapport}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc()  # détail complet dans les journaux GitHub Actions
        envoyer_alerte(f"❌ ERREUR : le robot s'est arrêté\n{type(e).__name__} : {e}")
        sys.exit(1)
