"""Tests d'EXP-011 (panier élargi à 21 marchés) et d'EXP-012 (plafond par actif relevé à 40 %)."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from experience_011 import BASE, SYMBOLES
from experience_011 import variantes_reglages as variantes_011
from experience_012 import RELEVEE
from experience_012 import variantes_reglages as variantes_012
from robot.parametres import BUDGET_RISQUE, PLAFONDS_RELEVES, TAMPON
from robot.portefeuille import parts_cibles, preparer_risque
from robot.signaux import notes as calculer_notes
from robot.simulation import cibles_strategie, strategie_v2
from robot.univers import AJOUTS_EXP_011, UNIVERS, UNIVERS_ELARGI, budgets_de_risque


def test_les_11_ajouts_fixes_dans_experiences_md():
    assert [a.symbole for a in AJOUTS_EXP_011] == ["QQQ", "EWJ", "TIP", "LQD", "USO", "SLV", "DBA", "RWX",
                                                   "UUP", "FXE", "FXY"]
    assert len(UNIVERS_ELARGI) == 21 and len(set(SYMBOLES)) == 21 and BASE == [a.symbole for a in UNIVERS]
    assert all(a.type == "ETF" for a in AJOUTS_EXP_011)
    assert {a.classe for a in UNIVERS_ELARGI} == {a.classe for a in UNIVERS} | {"Devises"}


def test_budgets_du_panier_de_la_v3_inchanges():
    b = budgets_de_risque(BASE)
    assert b["SPY"] == pytest.approx(1 / 6 / 3) and b["GLD"] == pytest.approx(1 / 6) and b["BTC-USD"] == pytest.approx(1 / 12)
    assert sum(b.values()) == pytest.approx(1)


def test_budgets_du_panier_elargi():
    b = budgets_de_risque(SYMBOLES)
    assert len(b) == 21 and sum(b.values()) == pytest.approx(1)
    assert b["UUP"] == pytest.approx(1 / 7 / 3) and b["SPY"] == pytest.approx(1 / 7 / 5)
    assert b["GLD"] == pytest.approx(1 / 7) and b["USO"] == pytest.approx(1 / 7 / 4)


def test_variantes():
    assert len(variantes_011()) == 10 and variantes_011()["Sans multiplicateur"] == {"budget": None}
    v = variantes_012()
    assert len(v) == 12 and v["Plafond 30 %"]["plafonds"]["part_max"] == 0.30
    assert v["Plafond 50 %"]["plafonds"] == {"part_max": 0.50, "crypto_max": 0.15, "exposition_max": 1.0}
    assert PLAFONDS_RELEVES == {"part_max": 0.40, "crypto_max": 0.15, "exposition_max": 1.0}
    assert RELEVEE == {"budget": BUDGET_RISQUE, "tampon": TAMPON, "vol_cible": 0.17, "plafonds": PLAFONDS_RELEVES}


def marche(graine=0, jours=1500):
    """Un actif très calme (IEF) : sa part dépasse 25 % dès que sa tendance est bonne."""
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal([0.0004, 0.0004, 0.0003, 0.002], [0.012, 0.003, 0.01, 0.04],
                                                 (jours, 4)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape)), c


def test_plafonds_releves_respectes_sans_levier():
    o, c = marche()
    normal = strategie_v2(o, c, debut=c.index[600], budget=BUDGET_RISQUE, tampon=TAMPON)
    releve = strategie_v2(o, c, debut=c.index[600], **RELEVEE)
    # parts du soir : les prix de la séance peuvent les faire dépasser un peu le plafond appliqué le matin
    assert normal.poids.max().max() <= 0.25 * 1.1
    assert 0.30 < releve.poids.max().max() <= 0.40 * 1.1
    assert (releve.poids.sum(axis=1) <= 1 + 1e-6).all() and (releve.poids["BTC-USD"] <= 0.15 * 1.3).all()


def test_parts_cibles_plafonnees_a_40():
    o, c = marche()
    risque, notes = preparer_risque(c), calculer_notes(c)
    parts = parts_cibles(notes, risque, 0.17, plafonds=PLAFONDS_RELEVES)
    assert parts.max().max() <= 0.40 + 1e-9 and parts["IEF"].max() > 0.30


def test_les_plafonds_vont_jusqu_a_la_simulation_et_au_multiplicateur(monkeypatch):
    import robot.simulation as simulation
    vus = []
    original = simulation.simuler
    monkeypatch.setattr(simulation, "simuler", lambda *a, **k: (vus.append(k.get("plafonds", a[9] if len(a) > 9 else None)),
                                                                   original(*a, **k))[1])
    o, c = marche(1)
    strategie_v2(o, c, debut=c.index[600], **RELEVEE)
    assert vus == [PLAFONDS_RELEVES, PLAFONDS_RELEVES]   # v2 normale (multiplicateur) puis la version testée


def test_le_hasard_garde_les_plafonds_de_la_version_testee(monkeypatch):
    o, c = marche(2)
    vus = []
    original = robustesse_v2.cibles_strategie
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    monkeypatch.setattr(robustesse_v2, "cibles_strategie",
                        lambda *a, **k: (vus.append(k.get("plafonds")), original(*a, **k))[1])
    base = {"note_rendement_risque": 0.5, "rendement_annuel": 0.05}
    robustesse_v2.test_r5(o, c, preparer_risque(c), base, RELEVEE)
    assert vus == [PLAFONDS_RELEVES, PLAFONDS_RELEVES]


def test_la_base_tourne_sur_ses_propres_actifs(monkeypatch):
    """EXP-011 : la v3 (base à battre) ne voit que ses 10 actifs, la version testée voit tout le panier."""
    import outils_experience
    from robot.donnees import Donnees

    o, c = marche(3)
    extra = c[["SPY"]].rename(columns={"SPY": "QQQ"}) * 1.01
    o2, c2 = pd.concat([o, o[["SPY"]].rename(columns={"SPY": "QQQ"})], axis=1), pd.concat([c, extra], axis=1)
    vues = []
    original = outils_experience.strategie_v2
    monkeypatch.setattr(outils_experience, "strategie_v2",
                        lambda ouv, clo, **k: (vues.append(list(clo.columns)), original(ouv, clo, **k))[1])
    monkeypatch.setattr(outils_experience, "verifier_performance", lambda *a, **k: [("P", True, "")])
    for nom in ("test_r1", "test_r2", "test_r3", "test_r4", "test_r5"):
        monkeypatch.setattr(robustesse_v2, nom, lambda *a, **k: True)
    outils_experience.lancer_experience("EXP-TEST", "test", {}, {}, base_reglage={}, base_nom="v3",
                                        donnees=Donnees(o2, c2, []), base_symboles=list(c.columns))
    assert vues[0] == list(c.columns) and vues[1] == list(c2.columns)
    assert "QQQ" not in vues[2]   # (info) la base sans crypto reste sur ses propres actifs
