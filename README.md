# trading-bot

Robot de trading automatique sur **SPY** (fonds qui suit les 500 plus grandes entreprises américaines),
en **paper trading** (argent fictif) sur Alpaca.

## La règle

Chaque soir, après la clôture de la bourse de New York :

- SPY **au-dessus** de sa moyenne des 200 derniers jours → investi (95 % du capital) ;
- SPY **en dessous** → tout en cash.

L'ordre est exécuté à l'ouverture suivante.

## Les sécurités

- Les données sont vérifiées avant toute décision (à jour, complètes, sans valeur aberrante).
  Au moindre doute : **aucun ordre** et une alerte Telegram.
- Jamais de nouvel ordre si un ordre attend déjà d'être exécuté.
- Toute erreur déclenche une alerte Telegram.
- Les tests automatiques tournent avant chaque lancement : s'ils échouent, le robot ne tourne pas.
- Les clés ne sont jamais écrites dans le code (secrets GitHub ou fichier `.env`).

## Les fichiers

| Fichier | Rôle |
|---|---|
| `bot.py` | Le robot, lancé chaque soir par GitHub Actions |
| `strategie.py` | La règle, partagée par le robot et le backtest |
| `backtest.py` | Simulation de la stratégie sur le passé |
| `connexion.py` | Connexion à Alpaca (clés lues hors du code) |
| `tests/` | Tests automatiques |
| `test_connexion.py` | Script manuel : vérifie la connexion au compte |
| `ordre_test.py` | Script manuel : ⚠️ achète une part de SPY |
| `.github/workflows/trading.yml` | Lancement automatique chaque soir |

## Lancer sur ton PC

```bash
pip install -r requirements.txt
# copie .env.example, renomme la copie en .env et colle tes clés dedans
python -m pytest       # tests automatiques
python backtest.py     # simulation sur le passé
python bot.py          # ⚠️ passe de vrais ordres sur le compte paper
```
