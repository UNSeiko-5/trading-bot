"""Tests des outils du test anti-chance de la v2 (robustesse_v2.py)."""
import numpy as np
import pandas as pd
import pytest

from robot.parametres import CASSURES, RETOUR_MOYENNE
from robot.signaux import notes
from robustesse_v2 import decaler_au_hasard, notes_du_reglage, variantes_reglages


def notes_fictives():
    dates = pd.bdate_range("2015-01-01", periods=1500)
    aleatoire = np.random.default_rng(0)
    notes = pd.DataFrame({"SPY": aleatoire.uniform(0, 20, 1500), "BTC-USD": aleatoire.uniform(0, 20, 1500)}, index=dates)
    notes.iloc[:900, 1] = np.nan   # le Bitcoin n'existe qu'à partir du 901e jour
    return notes


def test_le_decalage_garde_les_memes_valeurs_et_les_memes_trous():
    notes = notes_fictives()
    decalees = decaler_au_hasard(notes, np.random.default_rng(1))
    for s in notes.columns:
        assert (notes[s].isna() == decalees[s].isna()).all()
        assert sorted(notes[s].dropna()) == sorted(decalees[s].dropna())


def test_le_decalage_change_le_timing():
    notes = notes_fictives()
    decalees = decaler_au_hasard(notes, np.random.default_rng(1))
    assert not np.allclose(notes["SPY"], decalees["SPY"])


def test_un_historique_trop_court_n_est_pas_decale():
    notes = notes_fictives()
    notes.iloc[:1100, 1] = np.nan   # 400 jours seulement : moins de 2 x 252
    decalees = decaler_au_hasard(notes, np.random.default_rng(1))
    pd.testing.assert_series_equal(notes["BTC-USD"], decalees["BTC-USD"])


def test_variante_moyennes_x1_5():
    detecteurs = variantes_reglages()["Toutes les moyennes x1,5"]["detecteurs"]
    assert [(r, l) for r, l, _ in detecteurs] == [(24, 96), (48, 192), (96, 384)]
    assert detecteurs[0][2] == pytest.approx(3.75 / np.sqrt(1.5))


@pytest.mark.parametrize("reglage", [
    None,
    {"cassures": CASSURES},
    {"retour": RETOUR_MOYENNE, "poids_retour": 0.5},
    {"detecteurs": [], "retour": RETOUR_MOYENNE, "poids_retour": 1.0},
    {"retour": RETOUR_MOYENNE, "poids_retour": 0.75, "vol_cible": 0.10},   # vol_cible ne concerne pas les notes
])
def test_le_hasard_part_des_notes_de_la_version_testee(reglage):
    dates = pd.bdate_range("2015-01-01", periods=700)
    aleatoire = np.random.default_rng(3)
    clotures = pd.DataFrame(100 * np.cumprod(1 + aleatoire.normal(0.0003, 0.01, (700, 2)), axis=0),
                            index=dates, columns=["SPY", "TLT"])
    attendu = notes(clotures, **{k: v for k, v in (reglage or {}).items() if k != "vol_cible"})
    pd.testing.assert_frame_equal(notes_du_reglage(clotures, reglage), attendu)
    if reglage and "retour" in reglage:
        assert not notes_du_reglage(clotures, reglage).equals(notes(clotures))
