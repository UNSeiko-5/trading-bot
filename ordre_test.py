from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Identifiants Alpaca Paper
API_KEY = "PKGS6QEGFF5SKYFB3CCKYK2OUU"
SECRET_KEY = "Dzrt7xsFwQM5P5fBxSBbxgyoHvY8DHubVABtxQkzjamZ"

client = TradingClient(API_KEY, SECRET_KEY, paper=True)

# Préparation de l'ordre : achat d'une part de SPY
ordre = MarketOrderRequest(
    symbol="SPY",
    qty=1,
    side=OrderSide.BUY,
    time_in_force=TimeInForce.DAY
)

# Envoi au courtier
reponse = client.submit_order(order_data=ordre)

print("-" * 45)
print("Ordre transmis avec succès !")
print(f"Actif acheté : {reponse.symbol}")
print(f"Quantité     : {reponse.qty}")
print(f"Statut       : {reponse.status}")
print("-" * 45)
