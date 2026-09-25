"""Tests du robot v3 (robot_v3.py) avec un faux courtier : aucun ordre réel, aucune connexion Internet."""
from datetime import date, datetime
from types import SimpleNamespace

import numpy as np
import pandas as pd
import pytest

import robot_v3
from robot.donnees import Donnees

SEANCE = date(2026, 9, 24)
SYMBOLES = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")


class FauxCourtier:
    def __init__(self, capital=100_000, cash=100_000, veille=100_000, positions=(), en_attente=(), historique=(),
                 refus=()):
        self.capital, self.cash, self.veille = capital, cash, veille
        self.positions, self.en_attente, self.historique = list(positions), list(en_attente), list(historique)
        self.refus = set(refus)
        self.ordres, self.fermetures = [], []

    def get_calendar(self, filtre):
        return [SimpleNamespace(date=SEANCE, close=datetime(2026, 9, 24, 16, 0))]

    def get_orders(self, filtre):
        return self.en_attente

    def get_account(self):
        return SimpleNamespace(equity=str(self.capital), cash=str(self.cash), last_equity=str(self.veille))

    def get_all_positions(self):
        return [SimpleNamespace(symbol=s, qty=str(q), market_value=str(v)) for s, q, v in self.positions]

    def get_portfolio_history(self, filtre):
        jours = [datetime(2026, 9, 28 + i).timestamp() for i in range(len(self.historique))]
        return SimpleNamespace(timestamp=jours, equity=self.historique)

    def get_asset(self, symbole):
        return SimpleNamespace(fractionable=True)

    def submit_order(self, ordre):
        if ordre.symbol in self.refus:
            raise RuntimeError("refusé par le courtier")
        self.ordres.append(ordre)

    def close_position(self, symbole):
        self.fermetures.append(symbole)


def chargeur(fin=SEANCE, problemes=()):
    aleatoire = np.random.default_rng(0)
    dates = pd.bdate_range(end=str(fin), periods=1500)
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0006, [0.012, 0.013, 0.005, 0.01, 0.04], (1500, 5)), axis=0)
    c = pd.DataFrame(prix, index=dates, columns=SYMBOLES)
    rapport = [{"symbole": s, "problemes": ["prix figé"] if s in problemes else [], "avertissements": []} for s in SYMBOLES]
    return lambda: Donnees(c.shift(1).fillna(c), c, rapport)


@pytest.fixture
def messages(monkeypatch):
    envoyes = []
    monkeypatch.setattr(robot_v3, "envoyer_alerte", envoyes.append)
    monkeypatch.delenv("ROBOT_V3_DEPART", raising=False)
    return envoyes


def test_premier_soir_achete_et_explique(messages):
    courtier = FauxCourtier()
    robot_v3.main(courtier, chargeur())
    assert courtier.ordres, "le robot aurait dû acheter"
    assert all(o.side.value == "buy" for o in courtier.ordres)
    assert sum(o.notional for o in courtier.ordres) <= 100_000 * 0.99 + 1
    assert "Robot v3" in messages[-1] and "détecteurs haussiers" in messages[-1]
    crypto = [o for o in courtier.ordres if o.symbol == "BTC/USD"]
    assert all(o.time_in_force.value == "gtc" for o in crypto)


def test_donnees_pas_a_jour_aucun_ordre(messages):
    courtier = FauxCourtier()
    robot_v3.main(courtier, chargeur(fin=date(2026, 9, 22)))
    assert courtier.ordres == [] and "AUCUN ORDRE" in messages[-1]


def test_ordre_deja_en_attente_aucun_ordre(messages):
    courtier = FauxCourtier(en_attente=["ordre"])
    robot_v3.main(courtier, chargeur())
    assert courtier.ordres == [] and "déjà en attente" in messages[-1]


def test_actif_aux_donnees_douteuses_pas_touche(messages):
    courtier = FauxCourtier()
    robot_v3.main(courtier, chargeur(problemes={"SPY"}))
    assert "SPY" not in {o.symbol for o in courtier.ordres}
    assert "données douteuses" in messages[-1]


def test_a_moins_25_pour_cent_tout_vendre(messages):
    courtier = FauxCourtier(capital=70_000, cash=60_000, veille=71_000, historique=[100_000, 80_000],
                            positions=[("SPY", 10, 5_000), ("BTCUSD", 0.1, 5_000)])
    robot_v3.main(courtier, chargeur())
    assert set(courtier.fermetures) == {"SPY", "BTCUSD"} and courtier.ordres == []
    assert "-25 %" in messages[-1]


def test_position_negative_aucun_ordre(messages):
    courtier = FauxCourtier(positions=[("SPY", -5, -2_500)])
    robot_v3.main(courtier, chargeur())
    assert courtier.ordres == [] and courtier.fermetures == [] and "négative" in messages[-1]


def test_un_ordre_refuse_n_arrete_pas_les_autres(messages):
    courtier = FauxCourtier(refus={"SPY"})
    robot_v3.main(courtier, chargeur())
    assert courtier.ordres and "SPY" not in {o.symbol for o in courtier.ordres}
    assert "refusé" in messages[-1]


def test_position_hors_panier_ignoree(messages):
    courtier = FauxCourtier(positions=[("AAPL", 3, 600)])
    robot_v3.main(courtier, chargeur())
    assert "AAPL" not in {o.symbol for o in courtier.ordres} and "hors du panier" in messages[-1]


def test_envoi_des_ordres_selon_le_type_d_actif():
    from robot.decision import Ordre
    courtier = FauxCourtier()
    robot_v3.envoyer(courtier, Ordre("BTC-USD", "achat", 1_000.0))
    robot_v3.envoyer(courtier, Ordre("SPY", "achat", 2_000.0))
    robot_v3.envoyer(courtier, Ordre("TLT", "vente", 500.0, quantite=5.5))
    robot_v3.envoyer(courtier, Ordre("ETH-USD", "vente", 300.0, quantite=0.1, fermer=True))
    btc, spy, tlt = courtier.ordres
    assert btc.symbol == "BTC/USD" and btc.time_in_force.value == "gtc" and btc.notional == 1_000.0
    assert spy.symbol == "SPY" and spy.time_in_force.value == "day" and spy.side.value == "buy"
    assert tlt.qty == 5.5 and tlt.side.value == "sell"
    assert courtier.fermetures == ["ETHUSD"]
