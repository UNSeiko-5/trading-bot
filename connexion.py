"""Connexion au compte Alpaca, avec des clés qui ne sont JAMAIS écrites dans le code.

- Sur GitHub : les clés viennent des secrets du dépôt (Settings > Secrets and variables > Actions).
- Sur ton PC : elles viennent du fichier .env (ignoré par Git, il ne part jamais sur GitHub).
"""
import os

from alpaca.trading.client import TradingClient
from dotenv import load_dotenv

load_dotenv()  # lit le fichier .env s'il existe ; ne fait rien sur GitHub


def lire_variable(nom):
    valeur = os.getenv(nom)
    if not valeur:
        raise RuntimeError(
            f"{nom} est introuvable : ajoute-la dans les secrets GitHub, "
            "ou dans ton fichier .env si tu lances le robot sur ton PC."
        )
    return valeur


def client_alpaca():
    """Client connecté au compte PAPER (argent fictif). paper=True est écrit en dur exprès."""
    return TradingClient(
        lire_variable("ALPACA_API_KEY"),
        lire_variable("ALPACA_SECRET_KEY"),
        paper=True,
    )
