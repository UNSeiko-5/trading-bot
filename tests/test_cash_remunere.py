"""Tests du cash rémunéré (EXP-008)."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from experience_006 import AVEC_TAMPON
from experience_008 import reglage_avec_cash, variantes_reglages
from robot.donnees import rendement_monetaire
from robot.portefeuille import preparer_risque
from robot.simulation import simuler, strategie_v2

JOURS = pd.bdate_range("2020-01-01", periods=10)
REGLAGE = {"symbole": "^IRX", "frais_annuels": 0.0015}


def prix_plats(jours=JOURS):
    c = pd.DataFrame({"SPY": 100.0, "IEF": 50.0}, index=jours)
    return c.copy(), c


def test_le_cash_seul_recoit_les_interets_chaque_jour():
    o, c = prix_plats()
    r = pd.Series(0.001, index=JOURS)
    resultat = simuler(o, c, pd.DataFrame(0.0, index=JOURS, columns=c.columns), debut=JOURS[0], monetaire=r)
    assert resultat.valeur.iloc[-1] == pytest.approx(1.001 ** len(JOURS))
    assert simuler(o, c, pd.DataFrame(0.0, index=JOURS, columns=c.columns), debut=JOURS[0]).valeur.iloc[-1] == 1.0


def test_frais_du_fonds_sur_la_variation_du_cash():
    o, c = prix_plats()
    cibles = pd.DataFrame(0.0, index=JOURS, columns=c.columns)
    cibles.loc[:, "SPY"] = 0.4                     # décidé le 1er soir, acheté le 2e jour
    sans = simuler(o, c, cibles, debut=JOURS[0], seuil=0.0)
    avec = simuler(o, c, cibles, debut=JOURS[0], seuil=0.0, monetaire=pd.Series(0.0, index=JOURS))
    # Le cash passe de 100 % à ~60 % : 40 % de parts du fonds vendues, à 0,10 %
    assert sans.frais.sum() - 0 == pytest.approx(0.4 * 0.001, rel=1e-3)
    assert avec.frais.sum() == pytest.approx(sans.frais.sum() + 0.4 * 0.001, rel=1e-2)
    assert avec.valeur.iloc[-1] < sans.valeur.iloc[-1]


def test_taux_de_la_veille_moins_les_frais_jamais_negatif():
    jours = pd.bdate_range("2020-01-01", periods=5)
    historique = pd.DataFrame({"Close": [5.0, 5.0, 0.1, 2.52, 3.0]},
                              index=jours.tz_localize("America/New_York"))
    r = rendement_monetaire(jours, telechargeur=lambda s: historique, reglage=REGLAGE)
    assert r.iloc[0] == 0                                          # pas de veille connue
    assert r.iloc[1] == pytest.approx((0.05 - 0.0015) / 252)       # taux du jour 0, pas du jour 1
    assert r.iloc[3] == 0                                          # 0,1 % - 0,15 % : pas de taux négatif
    assert r.iloc[4] == pytest.approx((0.0252 - 0.0015) / 252)


def test_taux_introuvable_erreur_claire():
    with pytest.raises(RuntimeError, match="IRX"):
        rendement_monetaire(JOURS, telechargeur=lambda s: pd.DataFrame(), reglage=REGLAGE)


def marche(jours=900):
    aleatoire = np.random.default_rng(1)
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0003, [0.012, 0.005, 0.01], (jours, 3)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=["SPY", "IEF", "GLD"])
    return c.shift(1).fillna(c), c


def test_la_v3_avec_cash_garde_les_memes_positions_et_gagne_les_interets():
    o, c = marche()
    monetaire = pd.Series(0.03 / 252, index=c.index)
    v3 = strategie_v2(o, c, debut=c.index[0], **AVEC_TAMPON)
    avec = strategie_v2(o, c, debut=c.index[0], **reglage_avec_cash(monetaire))
    assert avec.valeur.iloc[-1] > v3.valeur.iloc[-1]
    # Mêmes décisions : les parts ne diffèrent que par la petite différence de capital
    assert (avec.rotation > 0).equals(v3.rotation > 0)


def test_r5_rémunère_aussi_le_cash_des_versions_au_hasard(monkeypatch):
    vus = []
    original = robustesse_v2.simuler
    monkeypatch.setattr(robustesse_v2, "simuler", lambda *a, **k: vus.append(k.get("monetaire")) or original(*a, **k))
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    o, c = marche()
    monetaire = pd.Series(0.03 / 252, index=c.index)
    robustesse_v2.test_r5(o, c, preparer_risque(c), {"note_rendement_risque": 1.0, "rendement_annuel": 0.05}, reglage_avec_cash(monetaire))
    assert vus and all(v is monetaire for v in vus)


def test_variantes_r1_sont_les_10_d_exp_006():
    assert len(variantes_reglages()) == 10
