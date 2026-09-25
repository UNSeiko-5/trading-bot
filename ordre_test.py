# ⚠️ Ce script passe un VRAI ordre (achat d'une part de SPY) sur le compte paper.
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

from connexion import client_alpaca

# Les clés sont lues depuis le fichier .env (voir .env.example), plus jamais écrites ici
client = client_alpaca()

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
