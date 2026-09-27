"""Tests d'EXP-010 (robot offensif) et des seuils de chute réglables (outils_experience, robustesse_v2, backtest_v2)."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from backtest_v2 import verifier_performance
from experience_010 import (
    LIMITE, M1_GAIN_MIN, M2_SHARPE_MIN, OFFENSIVE, SEUILS_CHUTE, V3, criteres_mieux, variantes_reglages, verdict_krachs,
)
from robot.parametres import BUDGET_RISQUE, TAMPON, VOL_CIBLE, VOL_CIBLE_OFFENSIVE
from robot.portefeuille import preparer_risque
from robot.simulation import mesures, strategie_v2


def test_reglages_fixes_dans_experiences_md():
    assert VOL_CIBLE_OFFENSIVE == 0.17 and round(VOL_CIBLE * 35 / 25, 3) == 0.168   # 12 % x 35/25, arrondi
    assert V3 == {"budget": BUDGET_RISQUE, "tampon": TAMPON} and OFFENSIVE == {**V3, "vol_cible": 0.17}
    assert SEUILS_CHUTE == {"P1": -0.30, "R1": -0.35, "R3": -0.30, "R4": -0.30} and LIMITE == -0.35
    assert (M1_GAIN_MIN, M2_SHARPE_MIN) == (0.015, 0.90)


def test_10_variantes_r1():
    v = variantes_reglages()
    assert len(v) == 10
    assert v["Agitation visée 15 %"] == {"vol_cible": 0.15} and v["Agitation visée 20 %"] == {"vol_cible": 0.20}
    assert v["Sans multiplicateur"] == {"budget": None} and v["Zone tampon 20 %"] == {"tampon": 0.20}
    assert v["Borne haute 3"]["budget"]["borne_haute"] == 3.0 and v["Fenêtre de mesure 4 ans"]["budget"]["fenetre"] == 1008


def m(rendement, sharpe):
    return {"rendement_annuel": rendement, "sharpe": sharpe}


@pytest.mark.parametrize("nouvelle, attendu", [
    (m(0.093, 0.87), [True, True]),      # +1,5 point pile, Sharpe 90 % pile (0,96 x 0,9 = 0,864)
    (m(0.092, 1.00), [False, True]),     # +1,4 point seulement
    (m(0.110, 0.80), [True, False]),     # beaucoup plus de rendement, mais qualité dégradée
])
def test_criteres_mieux(nouvelle, attendu):
    assert [ok for _, ok, _ in criteres_mieux(nouvelle, m(0.078, 0.96))] == attendu


def test_verdict_krachs():
    assert verdict_krachs(-0.30, [-0.2] * 95 + [-0.36] * 5) == (True, 0.05)    # 5 % pile : réussi
    assert verdict_krachs(-0.30, [-0.2] * 94 + [-0.36] * 6)[0] is False         # 6 % : échec
    assert verdict_krachs(-0.35, [-0.2] * 100)[0] is False                      # une nuit à -35 % pile : échec


def test_seuils_de_chute_reglables_valeurs_par_defaut_inchangees():
    base = {"pire_chute": -0.25, "rendement_annuel": 0.08, "note_rendement_risque": 1.0}
    par_defaut = verifier_performance(base, {})
    assert par_defaut[0][0] == "P1 Pire chute meilleure que -20 %" and par_defaut[0][1] is False
    decale = verifier_performance(base, {}, pire_chute_min=-0.30)
    assert decale[0][0] == "P1 Pire chute meilleure que -30 %" and decale[0][1] is True


def marche(graine=0, jours=1500):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0004, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape)), c


def test_la_version_offensive_vise_plus_sans_levier():
    """Les parts VISÉES (avant la zone tampon) sont au moins aussi grandes chaque jour, sans jamais dépasser 100 %.
    (Les parts détenues peuvent être plus petites : la zone tampon s'élargit avec l'agitation visée.)"""
    from robot.signaux import notes as calculer_notes
    from robot.simulation import cibles_strategie

    o, c = marche()
    risque, notes = preparer_risque(c), calculer_notes(c)
    v3, m_v3, _ = cibles_strategie(o, c, notes, risque, budget=BUDGET_RISQUE, tampon=TAMPON)
    off, m_off, _ = cibles_strategie(o, c, notes, risque, vol_cible=0.17, budget=BUDGET_RISQUE, tampon=TAMPON)
    assert (off.sum(axis=1) >= v3.sum(axis=1) - 1e-9).all() and (off.sum(axis=1) <= 1 + 1e-9).all()
    assert (m_off >= m_v3 - 1e-9).all()
    resultat = strategie_v2(o, c, debut=c.index[600], **OFFENSIVE)
    assert (resultat.poids.sum(axis=1) <= 1 + 1e-6).all() and (resultat.poids["BTC-USD"] <= 0.17).all()


def test_le_hasard_garde_l_agitation_visee_de_la_version_testee(monkeypatch):
    o, c = marche(1)
    vues = []
    original = robustesse_v2.cibles_strategie
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    monkeypatch.setattr(robustesse_v2, "cibles_strategie",
                        lambda *a, **k: (vues.append(k.get("vol_cible")), original(*a, **k))[1])
    base = {"note_rendement_risque": 0.5, "rendement_annuel": 0.05}
    robustesse_v2.test_r5(o, c, preparer_risque(c), base, OFFENSIVE)
    robustesse_v2.test_r5(o, c, preparer_risque(c), base, V3)
    assert vues == [0.17, 0.17, 0.12, 0.12]


def test_seuil_r1_reglable():
    o, c = marche(2)
    risque = preparer_risque(c)
    base = mesures(strategie_v2(o, c, risque=risque, **OFFENSIVE).valeur)
    variante = {"Identique": {}}
    assert robustesse_v2.test_r1(o, c, risque, base, variante, OFFENSIVE, chute_min=-0.99)
    assert not robustesse_v2.test_r1(o, c, risque, base, variante, OFFENSIVE, chute_min=0.0)   # aucune chute ne passe 0


def test_lancer_experience_transmet_seuils_et_krachs(monkeypatch):
    """Les seuils de chute d'EXP-010 arrivent bien jusqu'aux tests, et K1 compte dans le verdict."""
    import outils_experience
    from robot.donnees import Donnees

    o, c = marche(3)
    vus = {}
    monkeypatch.setattr(outils_experience, "verifier_performance",
                        lambda base, refs, **k: (vus.__setitem__("P", k), [("P", True, "")])[1])
    for nom in ("test_r1", "test_r3", "test_r4"):
        monkeypatch.setattr(robustesse_v2, nom, lambda *a, _n=nom, **k: (vus.__setitem__(_n, k), True)[1])
    monkeypatch.setattr(robustesse_v2, "test_r2", lambda *a, **k: True)
    monkeypatch.setattr(robustesse_v2, "test_r5", lambda *a, **k: True)
    donnees = Donnees(o, c, [])
    resultats = outils_experience.lancer_experience(
        "EXP-TEST", "test", OFFENSIVE, {}, base_reglage=V3, base_nom="v3", donnees=donnees,
        criteres_mieux=criteres_mieux, seuils_chute=SEUILS_CHUTE, criteres_supplementaires=lambda *a: {"K1 Krachs": False})
    assert vus["P"] == {"pire_chute_min": -0.30}
    assert vus["test_r1"] == {"chute_min": -0.35} and vus["test_r3"] == {"chute_min": -0.30}
    assert vus["test_r4"] == {"chute_min": -0.30}
    assert resultats["K1 Krachs"] is False and len(resultats) == 2 + 1 + 5 + 1


def test_seuils_r3_et_r4_reglables(monkeypatch):
    monkeypatch.setattr(robustesse_v2, "R4_RENDEMENT_MIN", -1.0)   # seul le seuil de chute décide ici
    o, c = marche(4)
    risque = preparer_risque(c)
    base = mesures(strategie_v2(o, c, risque=risque, **OFFENSIVE).valeur)
    assert robustesse_v2.test_r3(o, c, risque, base, OFFENSIVE, chute_min=-0.99)
    assert not robustesse_v2.test_r3(o, c, risque, base, OFFENSIVE, chute_min=0.0)
    note_basse = -1.0
    assert robustesse_v2.test_r4(o, c, note_basse, OFFENSIVE, chute_min=-0.99)
    assert not robustesse_v2.test_r4(o, c, note_basse, OFFENSIVE, chute_min=0.0)
