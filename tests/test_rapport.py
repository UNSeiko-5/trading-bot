"""Tests du mode détaillé de la simulation et du rapport façon MetaTrader (robot/rapport.py)."""
import numpy as np
import pandas as pd
import pytest

from robot.rapport import _series_consecutives, extraire_trades, rapport, texte
from robot.simulation import simuler, strategie_v2

SANS_FRAIS = {"ETF": 0.0, "crypto": 0.0}
AVEC_FRAIS = {"ETF": 0.001, "crypto": 0.005}


def tableau(valeurs, colonnes=("SPY",)):
    dates = pd.bdate_range("2026-01-05", periods=len(valeurs))
    return pd.DataFrame(np.asarray(valeurs, dtype=float).reshape(len(valeurs), -1), index=dates, columns=list(colonnes))


def test_le_mode_detaille_ne_change_pas_la_simulation():
    o, c = tableau([100, 101, 99, 105, 107]), tableau([100, 102, 98, 106, 104])
    cibles = tableau([0.5, 0.5, 0.0, 0.8, 0.8])
    normal = simuler(o, c, cibles, debut=c.index[0], frais=AVEC_FRAIS)
    detaille = simuler(o, c, cibles, debut=c.index[0], frais=AVEC_FRAIS, details=True)
    pd.testing.assert_series_equal(normal.valeur, detaille.valeur)
    assert normal.gains is None and normal.ordres is None


def test_les_gains_par_actif_expliquent_toute_la_valeur():
    # Chaque jour : variation de la valeur = somme des gains des actifs (frais compris), le cash ne rapportant rien
    aleatoire = np.random.default_rng(3)
    prix = 100 * np.cumprod(1 + aleatoire.normal(0, 0.01, (300, 3)), axis=0)
    c = tableau(prix, ("SPY", "TLT", "BTC-USD"))
    o = c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.003, c.shape))
    cibles = tableau(aleatoire.uniform(0, 0.3, (300, 3)), ("SPY", "TLT", "BTC-USD"))
    r = simuler(o, c, cibles, debut=c.index[0], frais=AVEC_FRAIS, details=True)
    np.testing.assert_allclose(r.gains.sum(axis=1).iloc[1:], r.valeur.diff().iloc[1:], atol=1e-12)
    assert set(r.ordres["sens"]) <= {"achat", "vente"}


def test_ordres_a_la_main():
    # Achat de 20 % le jour 1 à l'ouverture (110), vente complète le jour 3 à l'ouverture (120).
    # (20 % et pas plus : au-delà de 25 % par actif, le garde-fou réajusterait la position chaque jour)
    o, c = tableau([100, 110, 115, 120]), tableau([100, 112, 118, 121])
    cibles = tableau([0.2, 0.2, 0.0, 0.0])
    r = simuler(o, c, cibles, debut=c.index[0], frais=AVEC_FRAIS, details=True)
    assert list(r.ordres["sens"]) == ["achat", "vente"]
    assert r.ordres["prix"].tolist() == [110, 120]
    assert r.ordres.iloc[0]["apres"] == pytest.approx(0.2)
    assert r.ordres.iloc[0]["frais"] == pytest.approx(0.0002)
    montant_vendu = 0.2 * 120 / 110
    assert r.ordres.iloc[1]["frais"] == pytest.approx(montant_vendu * 0.001)


def test_un_trade_de_l_achat_a_la_vente():
    o, c = tableau([100, 110, 115, 120, 120]), tableau([100, 112, 118, 121, 125])
    cibles = tableau([0.2, 0.2, 0.0, 0.0, 0.0])
    r = simuler(o, c, cibles, debut=c.index[0], frais=SANS_FRAIS, details=True)
    trades = extraire_trades(r, capital=10_000)
    assert len(trades) == 1
    t = trades.iloc[0]
    assert t["statut"] == "fermé" and t["i_entree"] == 1 and t["i_sortie"] == 3
    # Acheté 2 000 € à 110, revendu à 120 : +181,82 €
    assert t["resultat"] == pytest.approx(2_000 * (120 / 110 - 1))
    assert r.valeur.iloc[-1] * 10_000 - 10_000 == pytest.approx(t["resultat"])


def test_trade_encore_ouvert_a_la_fin():
    o, c = tableau([100, 100, 100, 110]), tableau([100, 100, 100, 110])
    r = simuler(o, c, tableau([0.2, 0.2, 0.2, 0.2]), debut=c.index[0], frais=SANS_FRAIS, details=True)
    trades = extraire_trades(r, 1.0)
    assert list(trades["statut"]) == ["en cours"]
    assert trades.iloc[0]["resultat"] == pytest.approx(0.02)


def test_extraire_trades_refuse_une_simulation_sans_details():
    o = c = tableau([100, 100])
    with pytest.raises(ValueError):
        extraire_trades(simuler(o, c, tableau([0, 0]), debut=c.index[0]))


def test_series_consecutives():
    assert _series_consecutives([10, 20, -5, 30, 40, 50, -1, -2], True) == (3, 120)
    assert _series_consecutives([10, 20, -5, 30, 40, 50, -1, -2], False) == (2, -3)
    assert _series_consecutives([], True) == (0, 0.0)


def marche(graine=1, jours=900):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0004, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    dates = pd.bdate_range("2015-01-01", periods=jours)
    c = pd.DataFrame(prix, index=dates, columns=symboles)
    return c.shift(1).fillna(c), c


def test_rapport_coherent_sur_un_marche_fictif():
    o, c = marche()
    r = strategie_v2(o, c, debut=c.index[400], details=True)
    ch = rapport(r, capital=10_000)
    assert ch["valeur_finale"] == pytest.approx(r.valeur.iloc[-1] / r.valeur.iloc[0] * 10_000)
    assert ch["profit_net"] == pytest.approx(ch["valeur_finale"] - 10_000)
    # Profit net = trades fermés + trades en cours (tout le gain vient des positions)
    trades = extraire_trades(r, 10_000)
    assert trades["resultat"].sum() == pytest.approx(ch["profit_net"], abs=1e-6)
    assert ch["profit_brut"] >= 0 >= ch["perte_brute"]
    assert ch["facteur_profit"] == pytest.approx(ch["profit_brut"] / -ch["perte_brute"])
    fermes = trades[trades["statut"] == "fermé"]
    assert ch["gagnants_pct"] == pytest.approx((fermes["resultat"] > 0).mean())
    assert ch["drawdown_max_pct"] == pytest.approx((r.valeur / r.valeur.cummax() - 1).min())
    assert ch["gagnants_pct"] + ch["perdants_pct"] <= 1 + 1e-9
    assert -1 < ch["drawdown_max_pct"] <= 0
    assert sum(m["entrees"] for m in ch["par_mois"]) == len(trades)
    assert sum(a["trades"] for a in ch["par_actif"]) == ch["nb_trades"]
    assert "Facteur de profit" in texte(ch)
