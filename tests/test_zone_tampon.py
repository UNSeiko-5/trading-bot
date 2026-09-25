"""Tests de la zone tampon (EXP-006)."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from experience_006 import AVEC_TAMPON, variantes_reglages
from robot.parametres import BUDGET_RISQUE, TAMPON
from robot.portefeuille import parts_cibles, parts_normales, preparer_risque, tampon_rapide
from robot.signaux import notes as calculer_notes
from robot.simulation import strategie_v2

NON = np.array([False, False])


def test_dans_la_zone_on_ne_bouge_pas():
    np.testing.assert_allclose(tampon_rapide(np.array([0.10, 0.20]), np.array([0.105, 0.19]), np.array([0.01, 0.02]), NON),
                               [0.105, 0.19])


def test_hors_zone_on_va_seulement_au_bord():
    # Cible 10 %, zone ±1 % : à 5 % on remonte à 9 % (pas 10 %) ; à 15 % on redescend à 11 %
    np.testing.assert_allclose(tampon_rapide(np.array([0.10, 0.10]), np.array([0.05, 0.15]), np.array([0.01, 0.01]), NON),
                               [0.09, 0.11])


def test_cible_zero_on_vend_tout():
    np.testing.assert_allclose(tampon_rapide(np.array([0.0, 0.1]), np.array([0.004, 0.1]), np.array([0.01, 0.01]), NON), [0, 0.1])


def test_garde_fou_on_applique_les_cibles():
    # Garder 26 % dépasserait le plafond de 25 % par actif
    np.testing.assert_allclose(tampon_rapide(np.array([0.24, 0.1]), np.array([0.26, 0.1]), np.array([0.03, 0.01]), NON), [0.24, 0.1])


def marche(graine=0, jours=1500):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0003, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape)), c


def test_parts_normales_egales_aux_parts_avec_une_note_de_10_sans_plafond():
    o, c = marche()
    risque = preparer_risque(c)
    dix = pd.DataFrame(10.0, index=c.index, columns=c.columns).where(risque.budgets > 0)
    normales = parts_normales(risque)
    avec_plafonds = parts_cibles(dix, risque)
    libres = (avec_plafonds.sum(axis=1) < 1 - 1e-9) & (avec_plafonds.max(axis=1) < 0.25 - 1e-9)
    pd.testing.assert_frame_equal(normales[libres], avec_plafonds[libres])


def test_la_zone_tampon_echange_moins_et_respecte_les_garde_fous():
    o, c = marche(1)
    debut = c.index[500]
    avec_seuil = strategie_v2(o, c, debut=debut, budget=BUDGET_RISQUE)
    avec_tampon = strategie_v2(o, c, debut=debut, **AVEC_TAMPON)
    assert avec_tampon.rotation.sum() < avec_seuil.rotation.sum()
    assert (avec_tampon.poids.sum(axis=1) <= 1 + 1e-6).all() and (avec_tampon.poids["BTC-USD"] <= 0.17).all()


def test_tampon_sans_triche_avec_le_futur():
    o, c = marche(2)
    debut = c.index[500]
    normal = strategie_v2(o, c, debut=debut, **AVEC_TAMPON).valeur
    o2, c2 = o.copy(), c.copy()
    o2.iloc[1200:] *= 0.5
    c2.iloc[1200:] *= 0.5
    pd.testing.assert_series_equal(normal.loc[: c.index[1199]], strategie_v2(o2, c2, debut=debut, **AVEC_TAMPON).valeur.loc[: c.index[1199]])


def test_sans_tampon_rien_ne_change():
    o, c = marche(3)
    pd.testing.assert_series_equal(strategie_v2(o, c, debut=c.index[500], tampon=None).valeur, strategie_v2(o, c, debut=c.index[500]).valeur)


def test_le_hasard_applique_la_zone_tampon(monkeypatch):
    o, c = marche(4)
    vus = []
    original = robustesse_v2.simuler
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    monkeypatch.setattr(robustesse_v2, "simuler", lambda *a, **k: (vus.append(k.get("tampons") is not None), original(*a, **k))[1])
    robustesse_v2.test_r5(o, c, preparer_risque(c), {"note_rendement_risque": 0.5, "rendement_annuel": 0.05}, AVEC_TAMPON)
    assert vus == [True, True]


def test_10_variantes_et_reglage():
    v = variantes_reglages()
    assert len(v) == 10 and TAMPON == 0.10
    assert v["Zone tampon 5 %"] == {"tampon": 0.05} and v["Zone tampon sans multiplicateur"] == {"budget": None}
    assert AVEC_TAMPON == {"budget": BUDGET_RISQUE, "tampon": 0.10}
