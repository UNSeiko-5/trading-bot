from alpaca.trading.client import TradingClient

# Tes identifiants Alpaca Paper
API_KEY = "PKGS6QEGFF5SKYFB3CCKYK2OUU"
SECRET_KEY = "Dzrt7xsFwQM5P5fBxSBbxgyoHvY8DHubVABtxQkzjamZ"

# Connexion au serveur de simulation (paper=True)
client = TradingClient(API_KEY, SECRET_KEY, paper=True)

# Récupération des informations du compte
account = client.get_account()

print("-" * 40)
print("Connexion réussie !")
print(f"Statut du compte : {account.status}")
print(f"Solde cash       : {account.cash} $")
print(f"Pouvoir d'achat  : {account.buying_power} $")
print("-" * 40)
