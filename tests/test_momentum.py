"""Tests du double momentum (EXP-013, robot/momentum.py et experience_013.py)."""
import numpy as np
import pandas as pd
import pytest

import experience_013
import krachs_simules
from robot.momentum import (MOMENTUM, choix, choix_au_hasard, cibles_depuis_choix, dates_de_decision,
                            strategie_momentum)


def test_regle_du_livre():
    assert MOMENTUM == {"durees": (252,), "actions": ("SPY", "EFA"), "refuge": "AGG", "absolu": "tresor", "decalage": 0}
    assert experience_013.TRESOR == {"symbole": "^IRX", "frais_annuels": 0.0}
    v = experience_013.variantes_reglages()
    assert len(v) == 10 and v["Durée 6 mois"] == {"durees": (126,)} and v["Seuil absolu 0 %"] == {"absolu": 0.0}
    assert v["Moyenne 3, 6 et 12 mois"] == {"durees": (63, 126, 252)} and v["Décision 10 jours avant"] == {"decalage": 10}
    assert v["EEM en 3e candidat"] == {"actions": ("SPY", "EFA", "EEM")} and v["Obligations IEF"] == {"refuge": "IEF"}


def test_dates_de_decision():
    index = pd.bdate_range("2020-01-01", "2020-04-15")
    assert list(dates_de_decision(index).strftime("%m-%d")) == ["01-31", "02-28", "03-31"]   # pas le 15/04 (fin des données)
    assert list(dates_de_decision(index, 5).strftime("%m-%d")) == ["01-24", "02-21", "03-24"]


def prix(jours, rendements, debut="2015-01-01"):
    """Courbes de prix à rendement quotidien constant par actif."""
    index = pd.bdate_range(debut, periods=jours)
    return pd.DataFrame({s: 100 * (1 + r) ** np.arange(jours) for s, r in rendements.items()}, index=index)


def test_choix_actions_et_refuge():
    tresor = pd.Series(0.0001, index=prix(400, {"SPY": 0}).index)   # environ 2,5 %/an
    haut = prix(400, {"SPY": 0.0005, "EFA": 0.0008, "AGG": 0.0001})
    assert choix(haut, tresor).dropna().iloc[-1] == "EFA"        # SPY bat le Trésor, EFA est le plus fort
    moyen = prix(400, {"SPY": 0.0005, "EFA": 0.0002, "AGG": 0.0001})
    assert choix(moyen, tresor).dropna().iloc[-1] == "SPY"
    bas = prix(400, {"SPY": 0.00005, "EFA": 0.0008, "AGG": 0.0001})   # SPY monte, mais moins que le Trésor
    assert choix(bas, tresor).dropna().iloc[-1] == "AGG"          # momentum absolu : même si EFA monte fort
    assert choix(bas, tresor, absolu=0.0).dropna().iloc[-1] == "EFA"   # variante seuil 0 %
    assert choix(haut, tresor).iloc[0] is None                     # moins de 12 mois d'historique


def test_jamais_le_futur():
    c = prix(600, {"SPY": 0.0005, "EFA": 0.0003, "AGG": 0.0001})
    tresor = pd.Series(0.0, index=c.index)
    avant = choix(c, tresor)
    futur = c.copy()
    date = avant.index[-3]
    futur.loc[futur.index > date] *= 0.3                            # krach après la décision
    apres = choix(futur, tresor)
    assert apres.loc[:date].equals(avant.loc[:date])


def test_cibles_et_execution_le_lendemain():
    c = prix(400, {"SPY": 0.0005, "EFA": 0.0003, "AGG": 0.0001})
    o = c * 0.999
    tresor = pd.Series(0.0, index=c.index)
    r = strategie_momentum(o, c, tresor, debut=c.index[0])
    premiere = r.choix.dropna().index[0]
    cibles = cibles_depuis_choix(r.choix, c.index, c.columns)
    assert (cibles.loc[:premiere].iloc[:-1].sum(axis=1) == 0).all() and cibles.loc[premiere, "SPY"] == 1.0
    assert r.poids.loc[premiere].sum() == 0                          # décidé le soir…
    lendemain = c.index[c.index.get_loc(premiere) + 1]
    assert r.poids.loc[lendemain, "SPY"] > 0.99                     # … exécuté à l'ouverture suivante
    assert (r.poids.sum(axis=1) <= 1 + 1e-9).all()


def test_choix_au_hasard():
    choisis = pd.Series([None, "SPY", "SPY", "AGG"], index=pd.bdate_range("2020-01-01", periods=4), dtype=object)
    tires = choix_au_hasard(choisis, ["SPY", "EFA", "AGG"], np.random.default_rng(0))
    assert tires.iloc[0] is None and set(tires.iloc[1:]) <= {"SPY", "EFA", "AGG"} and tires.index.equals(choisis.index)


@pytest.mark.parametrize("rendement, sharpe, attendu", [(0.093, 0.70, [True, True]), (0.092, 0.70, [False, True]),
                                                        (0.12, 0.60, [True, False])])
def test_criteres_mieux(rendement, sharpe, attendu):
    nouvelle = {"rendement_annuel": rendement, "sharpe": sharpe}
    assert [ok for _, ok, _ in experience_013.criteres_mieux(nouvelle, {"rendement_annuel": 0.078},
                                                            {"sharpe": 0.63})] == attendu


def test_krachs_utilisent_la_strategie_fournie():
    c = prix(400, {"SPY": 0.0005, "EFA": 0.0003, "AGG": 0.0001})
    vues = []
    pires = krachs_simules.krachs_au_hasard(c, c, tirages=2, debut=c.index[0],
                                            strategie=lambda o, cc: (vues.append(1), cc["SPY"] / cc["SPY"].iloc[0])[1])
    assert len(vues) == 2 and len(pires) == 2 and pires.min() < -0.15   # le krach de -20 % sur SPY est bien vu


def test_experience_complete_sur_fausses_donnees(monkeypatch, capsys):
    """Tout le déroulé d'EXP-013 tourne de bout en bout (données au hasard, peu de tirages)."""
    from robot.donnees import Donnees

    aleatoire = np.random.default_rng(1)
    symboles = experience_013.SYMBOLES
    index = pd.bdate_range("2004-01-01", "2026-06-30")
    c = pd.DataFrame(100 * np.cumprod(1 + aleatoire.normal(0.0003, 0.01, (len(index), len(symboles))), axis=0),
                     index=index, columns=symboles)
    o = c.shift(1).fillna(c)
    monkeypatch.setattr(experience_013, "charger", lambda s: Donnees(o, c, []))
    monkeypatch.setattr(experience_013, "rendement_monetaire", lambda cal, reglage: pd.Series(0.0001, index=cal))
    monkeypatch.setattr(experience_013, "R5_TIRAGES", 3)
    monkeypatch.setattr(krachs_simules, "TIRAGES", 2)
    resultats = experience_013.main()
    assert len(resultats) == 11 and "VERDICT EXP-013" in capsys.readouterr().out
