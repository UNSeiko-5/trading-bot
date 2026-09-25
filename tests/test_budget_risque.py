"""Tests du multiplicateur de risque (EXP-005) : robot/simulation.py, robot/portefeuille.py, experience_005.py."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from experience_005 import AVEC_BUDGET, M2_PART_MIN, variantes_reglages
from outils_experience import verifier_mieux
from robot.parametres import BUDGET_RISQUE
from robot.portefeuille import parts_cibles, preparer_risque
from robot.signaux import notes as calculer_notes
from robot.simulation import cibles_strategie, multiplicateur_risque, strategie_v2

JOURS = pd.bdate_range("2015-01-01", periods=800)


def test_multiplicateur_a_la_main():
    # Rendements +0,5 % / -0,5 % en alternance : agitation annuelle = 0,005 x racine(252) x correction de l'écart-type
    r = pd.Series(np.tile([0.005, -0.005], 400), index=JOURS)
    m = multiplicateur_risque(r, vol_cible=0.12, fenetre=504, borne_basse=0.0, borne_haute=10, historique_min=252)
    attendu = 0.12 / (r.iloc[-504:].std() * np.sqrt(252))
    assert m.iloc[-1] == pytest.approx(attendu)


def test_multiplicateur_vaut_1_sans_assez_d_historique():
    r = pd.Series(np.tile([0.001, -0.001], 400), index=JOURS)
    m = multiplicateur_risque(r, **BUDGET_RISQUE)
    assert (m.iloc[:251] == 1).all()
    assert m.iloc[251] == BUDGET_RISQUE["borne_haute"]   # agitation minuscule : plafonné à 2,5


def test_multiplicateur_borne():
    tres_agite = pd.Series(np.tile([0.05, -0.05], 400), index=JOURS)
    calme = pd.Series(np.tile([0.0001, -0.0001], 400), index=JOURS)
    assert (multiplicateur_risque(tres_agite, **BUDGET_RISQUE).iloc[300:] == 1).all()        # borne basse 1
    assert (multiplicateur_risque(calme, **BUDGET_RISQUE).iloc[300:] == 2.5).all()           # borne haute 2,5
    sans_borne_basse = {**BUDGET_RISQUE, "borne_basse": None}
    assert (multiplicateur_risque(tres_agite, **sans_borne_basse).iloc[300:] < 1).all()
    plat = pd.Series(0.0, index=JOURS)                                                      # agitation nulle
    assert (multiplicateur_risque(plat, **BUDGET_RISQUE).iloc[300:] == 2.5).all()


def test_multiplicateur_sans_triche_avec_le_futur():
    aleatoire = np.random.default_rng(0)
    r = pd.Series(aleatoire.normal(0, 0.005, 800), index=JOURS)
    futur = r.copy()
    futur.iloc[600:] *= 5
    pd.testing.assert_series_equal(multiplicateur_risque(r, **BUDGET_RISQUE).iloc[:600],
                                   multiplicateur_risque(futur, **BUDGET_RISQUE).iloc[:600])


def marche_fictif(graine=0, jours=1500):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0003, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    o = c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape))
    return o, c


def test_parts_multipliees_avant_les_garde_fous():
    o, c = marche_fictif()
    risque = preparer_risque(c)
    notes = calculer_notes(c)
    base = parts_cibles(notes, risque)
    doublees = parts_cibles(notes, risque, multiplicateur=pd.Series(2.0, index=c.index))
    libres = (doublees.sum(axis=1) < 1 - 1e-9) & (doublees.max(axis=1) < 0.25 - 1e-9)
    pd.testing.assert_frame_equal(doublees[libres], 2 * base[libres])      # aucun plafond atteint : exactement x2
    assert (doublees.sum(axis=1) <= 1 + 1e-9).all() and (doublees.max(axis=1) <= 0.25 + 1e-9).all()


def test_sans_budget_la_v2_ne_change_pas():
    o, c = marche_fictif(1)
    debut = c.index[500]
    pd.testing.assert_series_equal(strategie_v2(o, c, debut=debut, budget=None).valeur, strategie_v2(o, c, debut=debut).valeur)


def test_avec_budget_plus_investi_garde_fous_et_multiplicateur():
    o, c = marche_fictif(2)
    debut = c.index[500]
    v2 = strategie_v2(o, c, debut=debut)
    r = strategie_v2(o, c, debut=debut, **AVEC_BUDGET)
    assert r.poids.sum(axis=1).mean() > v2.poids.sum(axis=1).mean()
    assert (r.poids.sum(axis=1) <= 1 + 1e-6).all()
    assert (r.poids["BTC-USD"] <= 0.15 + 0.02).all()
    assert r.multiplicateur.between(1, 2.5).all() and len(r.multiplicateur) == len(r.valeur)


def test_avec_budget_sans_triche_avec_le_futur():
    o, c = marche_fictif(3)
    debut = c.index[500]
    normal = strategie_v2(o, c, debut=debut, **AVEC_BUDGET).valeur
    o2, c2 = o.copy(), c.copy()
    o2.iloc[1200:] *= 0.5
    c2.iloc[1200:] *= 0.5
    modifie = strategie_v2(o2, c2, debut=debut, **AVEC_BUDGET).valeur
    pd.testing.assert_series_equal(normal.loc[: c.index[1199]], modifie.loc[: c.index[1199]])


def test_le_hasard_recalcule_le_multiplicateur(monkeypatch):
    # R5 doit appliquer le budget de risque à chaque version au hasard, sinon il comparerait des choses différentes
    o, c = marche_fictif(4)
    vus = []
    original = robustesse_v2.cibles_strategie
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    monkeypatch.setattr(robustesse_v2, "cibles_strategie", lambda *a, **k: (vus.append(k.get("budget")), original(*a, **k))[1])
    base = {"note_rendement_risque": 0.5, "rendement_annuel": 0.05}
    robustesse_v2.test_r5(o, c, preparer_risque(c), base, AVEC_BUDGET)
    assert vus == [BUDGET_RISQUE, BUDGET_RISQUE]


def test_cibles_strategie_renvoie_le_multiplicateur():
    o, c = marche_fictif(5)
    risque = preparer_risque(c)
    notes = calculer_notes(c)
    cibles, m = cibles_strategie(o, c, notes, risque)
    assert m is None
    cibles_b, m_b = cibles_strategie(o, c, notes, risque, budget=BUDGET_RISQUE)
    assert m_b.between(1, 2.5).all() and (cibles_b.sum(axis=1) >= cibles.sum(axis=1) - 1e-9).all()


def test_10_variantes_r1():
    v = variantes_reglages()
    assert len(v) == 10
    assert v["Fenêtre de mesure 1 an"] == {"budget": {**BUDGET_RISQUE, "fenetre": 252}}
    assert v["Fenêtre de mesure 4 ans"]["budget"]["fenetre"] == 1008
    assert v["Borne haute 2"]["budget"]["borne_haute"] == 2.0
    assert v["Borne haute 3"]["budget"]["borne_haute"] == 3.0
    assert v["Sans borne basse"]["budget"]["borne_basse"] is None
    assert v["Agitation visée 14 %"] == {"vol_cible": 0.14}
    assert BUDGET_RISQUE == {"fenetre": 504, "borne_basse": 1.0, "borne_haute": 2.5, "historique_min": 252}


def test_m2_a_90_pourcent():
    v2 = {"rendement_annuel": 0.063, "note_rendement_risque": 0.63}
    ok = lambda note: verifier_mieux({"rendement_annuel": 0.08, "note_rendement_risque": note}, v2, M2_PART_MIN)[1][1]
    assert ok(0.63) and ok(0.57) and not ok(0.56)
    assert M2_PART_MIN == 0.90
