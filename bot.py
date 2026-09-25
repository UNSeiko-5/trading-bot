import os
import yfinance as yf
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# 1. Récupération des clés (depuis GitHub Secrets ou clés locales)
API_KEY = os.getenv("ALPACA_API_KEY", "PKGS6QEGFF5SKYFB3CCKYK2OUU")
SECRET_KEY = os.getenv("ALPACA_SECRET_KEY", "Dzrt7xsFwQM5P5fBxSBbxgyoHvY8DHubVABtxQkzjamZ")

client = TradingClient(API_KEY, SECRET_KEY, paper=True)

# 2. Analyse de marché (SPY vs Moyenne 200 jours)
print("Analyse du marché en cours...")
spy = yf.Ticker("SPY")
data = spy.history(period="1y")

data['SMA200'] = data['Close'].rolling(window=200).mean()

dernier_prix = float(data['Close'].iloc[-1])
derniere_sma = float(data['SMA200'].iloc[-1])

print(f"Prix actuel de SPY : {dernier_prix:.2f} $")
print(f"Moyenne 200 jours  : {derniere_sma:.2f} $")

# 3. Vérification du portefeuille actuel
positions = {p.symbol: int(float(p.qty)) for p in client.get_all_positions()}
nb_spy_en_poche = positions.get("SPY", 0)
print(f"Parts de SPY en portefeuille : {nb_spy_en_poche}")

# 4. Prise de décision
if dernier_prix > derniere_sma:
    print("Signal : HAUSSIER (Prix > SMA200)")
    if nb_spy_en_poche == 0:
        print("-> Action : Achat d'une part de SPY.")
        ordre = MarketOrderRequest(symbol="SPY", qty=1, side=OrderSide.BUY, time_in_force=TimeInForce.DAY)
        client.submit_order(ordre)
    else:
        print("-> Position déjà en cours, rien à faire.")
else:
    print("Signal : BAISSIER (Prix < SMA200)")
    if nb_spy_en_poche > 0:
        print(f"-> Action : Vente de nos {nb_spy_en_poche} parts pour se mettre en sécurité.")
        client.close_position("SPY")
    else:
        print("-> Portefeuille déjà en cash, rien à faire.")
