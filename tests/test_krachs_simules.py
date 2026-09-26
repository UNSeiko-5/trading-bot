"""Tests des krachs simulés (krachs_simules.py) : stress test de la v3, pour information."""
import numpy as np
import pandas as pd
import pytest

from krachs_simules import CHOC, KRACHS, TIRAGES, V3, choc_d_une_nuit, chocs, injecter_krach, krachs_au_hasard
from robot.simulation import Resultat, mesures, strategie_v2


def test_krach_type_fixe_a_l_avance():
    assert CHOC == {"Actions": -0.20, "Immobilier": -0.20, "Matières premières": -0.10, "Or": -0.05,
                    "Obligations": 0.0, "Crypto": -0.40}
    assert (KRACHS, TIRAGES) == (3, 100)
    assert chocs(["SPY", "VNQ", "DBC", "GLD", "TLT", "ETH-USD"]).tolist() == [-0.2, -0.2, -0.1, -0.05, 0.0, -0.4]


def test_choc_d_une_nuit_a_la_main():
    dates = pd.bdate_range("2020-01-01", periods=3)
    poids = pd.DataFrame({"SPY": [0.25, 0.25, 0.0], "TLT": [0.5, 0.5, 0.5], "BTC-USD": [0.1, 0.1, 0.0]}, index=dates)
    valeur = pd.Series([1.0, 0.9, 0.95], index=dates)
    vide = pd.Series(0.0, index=dates)
    nuit = choc_d_une_nuit(Resultat(valeur, poids, vide, vide))
    # 25 % x -20 % + 50 % x 0 % + 10 % x -40 % = -9 %
    assert nuit["perte"].tolist() == pytest.approx([-0.09, -0.09, 0.0])
    # le 2e soir, déjà -10 % sous le sommet : 0,9 x 0,91 - 1 = -18,1 %
    assert nuit["chute_totale"].tolist() == pytest.approx([-0.09, -0.181, -0.05])


def marche(graine=0, jours=1300):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0004, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape)), c


def test_injecter_un_krach_a_l_ouverture():
    o, c = marche()
    date = c.index[800]
    o2, c2 = injecter_krach(o, c, date)
    pd.testing.assert_frame_equal(o2.loc[:c.index[799]], o.loc[:c.index[799]])
    pd.testing.assert_frame_equal(c2.loc[:c.index[799]], c.loc[:c.index[799]])     # la veille ne change pas
    rapport = (o2.loc[date] / o.loc[date]).round(6)
    assert rapport.to_dict() == {"SPY": 0.8, "EFA": 0.8, "IEF": 1.0, "GLD": 0.95, "BTC-USD": 0.6}
    assert np.allclose(c2.iloc[-1] / c.iloc[-1], rapport)                         # le krach reste dans les prix


def test_krachs_au_hasard_reproductibles_et_sans_choc_rien_ne_change(monkeypatch):
    o, c = marche(1)
    debut = c.index[600]
    a = krachs_au_hasard(o, c, tirages=2, debut=debut)
    b = krachs_au_hasard(o, c, tirages=2, debut=debut)
    np.testing.assert_array_equal(a, b)
    assert (a <= 0).all()
    import krachs_simules
    monkeypatch.setattr(krachs_simules, "CHOC", {classe: 0.0 for classe in CHOC})
    monkeypatch.setattr(krachs_simules, "injecter_krach",
                        lambda o, c, date: (o, c))
    sans = krachs_au_hasard(o, c, tirages=1, debut=debut)
    assert sans[0] == pytest.approx(mesures(strategie_v2(o, c, debut=debut, **V3).valeur)["pire_chute"])


def test_un_krach_aggrave_la_chute_d_une_v3_investie():
    o, c = marche(2)
    debut = c.index[600]
    v3 = strategie_v2(o, c, debut=debut, **V3)
    jour = v3.poids.sum(axis=1).loc[c.index[700]:].idxmax()                      # un soir bien investi
    lendemain = c.index[c.index.get_loc(jour) + 1]
    o2, c2 = injecter_krach(o, c, lendemain)
    apres = strategie_v2(o2, c2, debut=debut, **V3)
    perte_nuit = apres.valeur.loc[lendemain] / apres.valeur.loc[jour] - 1
    assert perte_nuit < choc_d_une_nuit(v3)["perte"].loc[jour] + 0.02            # la nuit coûte bien le krach
    assert mesures(apres.valeur)["pire_chute"] < mesures(v3.valeur)["pire_chute"]
