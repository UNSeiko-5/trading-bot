"""Tests du backtest (backtest.py) sur des prix fictifs calculables à la main."""
import numpy as np
import pandas as pd
import pytest

from backtest import resume, simuler


def historique(ouvertures, clotures):
    dates = pd.bdate_range("2026-01-05", periods=len(clotures), tz="America/New_York")
    return pd.DataFrame({"Open": ouvertures, "Close": clotures}, index=dates, dtype=float)


def test_achat_et_vente_a_l_ouverture_du_lendemain():
    # Moyenne sur 2 jours. Signal haussier à la clôture du jour 2 (12 > 11)
    # -> achat à l'ouverture du jour 3 (12,5). Signal baissier à la clôture du jour 4
    # (11 < 12) -> vente à l'ouverture du jour 5 (10). Résultat : 10 / 12,5 = -20 %.
    h = historique(
        ouvertures=[10, 10, 10, 12.5, 12, 10],
        clotures=[10, 10, 12, 13, 11, 10.5],
    )
    df = simuler(h, fenetre=2, frais=0)
    assert (1 + df["strategie"]).prod() == pytest.approx(10 / 12.5)
    assert df["transaction"].sum() == 2


def test_les_frais_reduisent_le_resultat():
    h = historique(ouvertures=[10, 10, 10, 12.5, 12, 10], clotures=[10, 10, 12, 13, 11, 10.5])
    sans_frais = (1 + simuler(h, fenetre=2, frais=0)["strategie"]).prod()
    avec_frais = (1 + simuler(h, fenetre=2, frais=0.01)["strategie"]).prod()
    assert avec_frais < sans_frais


@pytest.mark.parametrize("facteur", [3, 0.3])
def test_pas_de_triche_avec_le_futur(facteur):
    # On modifie les prix à partir d'un jour J. Ce qui a été décidé AVANT la clôture
    # de J (la position détenue le jour J compris) ne doit pas bouger. Sinon, le
    # backtest utiliserait des prix qu'on ne connaissait pas encore.
    aleatoire = np.random.default_rng(0)
    clotures = 100 * np.cumprod(1 + aleatoire.normal(0, 0.01, 300))
    h = historique(ouvertures=clotures * (1 + aleatoire.normal(0, 0.002, 300)), clotures=clotures)

    futur_modifie = h.copy()
    futur_modifie.iloc[-50:] *= facteur  # J = 50e jour avant la fin

    normal, modifie = simuler(h, fenetre=20), simuler(futur_modifie, fenetre=20)
    pd.testing.assert_series_equal(normal["position"].iloc[:-49], modifie["position"].iloc[:-49])
    pd.testing.assert_series_equal(normal["strategie"].iloc[:-50], modifie["strategie"].iloc[:-50])


def test_resume_pire_chute():
    # 100 -> 150 -> 75 -> 90 : la pire chute est de 150 à 75, soit -50 %
    rendements = pd.Series([0.5, -0.5, 0.2])
    assert resume(rendements)["pire_chute"] == pytest.approx(-0.5)
