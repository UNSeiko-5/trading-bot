import os
import requests
import yfinance as yf
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# 1. Configuration et envoi Telegram
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def envoyer_alerte(texte):
    print(texte)
    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        try:
            requests.post(url, json={"chat_id": TELEGRAM_CHAT_ID, "text": texte})
        except Exception as e:
            print(f"Erreur d'envoi Telegram : {e}")

# 2. Connexion à Alpaca
API_KEY = os.getenv("ALPACA_API_KEY", "PKGS6QEGFF5SKYFB3CCKYK2OUU")
SECRET_KEY = os.getenv("ALPACA_SECRET_KEY", "Dzrt7xsFwQM5P5fBxSBbxgyoHvY8DHubVABtxQkzjamZ")
client = TradingClient(API_KEY, SECRET_KEY, paper=True)

# 3. Analyse de marché (SPY vs SMA 200)
spy = yf.Ticker("SPY")
data = spy.history(period="1y")
data['SMA200'] = data['Close'].rolling(window=200).mean()

dernier_prix = float(data['Close'].iloc[-1])
derniere_sma = float(data['SMA200'].iloc[-1])

positions = {p.symbol: int(float(p.qty)) for p in client.get_all_positions()}
nb_spy = positions.get("SPY", 0)

rapport_base = f"SPY: {dernier_prix:.2f} $ | SMA200: {derniere_sma:.2f} $\nParts détenues: {nb_spy}"

# 4. Décision & Notifications
if dernier_prix > derniere_sma:
    if nb_spy == 0:
        ordre = MarketOrderRequest(symbol="SPY", qty=1, side=OrderSide.BUY, time_in_force=TimeInForce.DAY)
        client.submit_order(ordre)
        envoyer_alerte(f"🟢 ACHAT SPY\n{rapport_base}\nOrdre d'achat d'une part transmis.")
    else:
        envoyer_alerte(f"ℹ️ STATUT : HAUSSIER\n{rapport_base}\nPosition maintenue.")
else:
    if nb_spy > 0:
        client.close_position("SPY")
        envoyer_alerte(f"🔴 VENTE SPY\n{rapport_base}\nPassage sous la SMA200, position liquidée.")
    else:
        envoyer_alerte(f"ℹ️ STATUT : BAISSIER\n{rapport_base}\nEn attente en cash.")
