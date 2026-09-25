from connexion import client_alpaca

# Connexion au serveur de simulation (paper=True), avec les clés du fichier .env
client = client_alpaca()

# Récupération des informations du compte
account = client.get_account()

print("-" * 40)
print("Connexion réussie !")
print(f"Statut du compte : {account.status}")
print(f"Solde cash       : {account.cash} $")
print(f"Pouvoir d'achat  : {account.buying_power} $")
print("-" * 40)
