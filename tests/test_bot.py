"""Tests du robot (bot.py) avec un faux courtier : aucun ordre réel, aucune connexion Internet."""
from datetime import date
from types import SimpleNamespace

import pandas as pd
import pytest
from alpaca.trading.enums import OrderSide

import bot

SEANCE = date(2026, 9, 24)


class FauxCourtier:
    def __init__(self, parts=0, capital=100_000, ordres_en_attente=()):
        self.parts = parts
        self.capital = capital
        self.ordres_en_attente = list(ordres_en_attente)
        self.ordres_envoyes = []

    def get_orders(self, filtre):
        return self.ordres_en_attente

    def get_account(self):
        return SimpleNamespace(equity=str(self.capital))

    def get_all_positions(self):
        return [SimpleNamespace(symbol="SPY", qty=str(self.parts))] if self.parts else []

    def submit_order(self, ordre):
        self.ordres_envoyes.append(ordre)


def historique(tendance, fin=SEANCE):
    """250 jours de prix qui montent (tendance > 0) ou qui baissent (tendance < 0)."""
    dates = pd.bdate_range(end=str(fin), periods=250, tz="America/New_York")
    return pd.DataFrame({"Close": [100 + i * tendance for i in range(250)]}, index=dates)


@pytest.fixture
def lancer(monkeypatch):
    """Lance bot.main() avec le faux courtier et renvoie (ordres envoyés, alertes)."""
    def _lancer(courtier, prix):
        alertes = []
        monkeypatch.setattr(bot, "client_alpaca", lambda: courtier)
        monkeypatch.setattr(bot, "derniere_seance_terminee", lambda client: SEANCE)
        monkeypatch.setattr(bot, "telecharger_historique", lambda: prix)
        monkeypatch.setattr(bot, "envoyer_alerte", alertes.append)
        bot.main()
        return courtier.ordres_envoyes, alertes
    return _lancer


def test_achete_quand_haussier(lancer):
    ordres, alertes = lancer(FauxCourtier(parts=0), historique(tendance=+0.2))
    assert len(ordres) == 1 and ordres[0].side == OrderSide.BUY
    assert "ACHAT" in alertes[0]


def test_vend_quand_baissier(lancer):
    ordres, alertes = lancer(FauxCourtier(parts=10), historique(tendance=-0.2))
    assert len(ordres) == 1 and ordres[0].side == OrderSide.SELL and ordres[0].qty == 10


def test_aucun_ordre_si_un_ordre_attend_deja(lancer):
    courtier = FauxCourtier(parts=0, ordres_en_attente=["ordre d'hier pas encore exécuté"])
    ordres, alertes = lancer(courtier, historique(tendance=+0.2))
    assert ordres == []
    assert "en attente" in alertes[0]


def test_aucun_ordre_si_donnees_pas_a_jour(lancer):
    ordres, alertes = lancer(FauxCourtier(parts=10), historique(tendance=-0.2, fin=date(2026, 9, 21)))
    assert ordres == []
    assert "AUCUN ORDRE" in alertes[0]


def test_aucun_ordre_si_yahoo_ne_renvoie_rien(lancer):
    ordres, alertes = lancer(FauxCourtier(parts=10), pd.DataFrame())
    assert ordres == []
    assert "aucune donnée" in alertes[0]


def test_ignore_la_seance_en_cours(lancer):
    # Lancement manuel en journée : Yahoo renvoie aussi le prix provisoire du jour (25/09).
    # Le robot doit décider sur la dernière clôture terminée (24/09) et ne pas bloquer.
    prix = historique(tendance=+0.2, fin=date(2026, 9, 25))
    ordres, alertes = lancer(FauxCourtier(parts=0), prix)
    assert len(ordres) == 1
    assert "2026-09-24" in alertes[0]
