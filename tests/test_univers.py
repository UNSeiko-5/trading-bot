"""Tests du panier d'actifs et de la répartition du risque (robot/univers.py)."""
import pytest

from robot.univers import UNIVERS, budgets_de_risque

TOUS = [actif.symbole for actif in UNIVERS]


def test_le_panier_contient_10_actifs_dans_6_classes():
    assert len(UNIVERS) == 10
    assert len({actif.classe for actif in UNIVERS}) == 6


def test_les_budgets_font_100_pourcent():
    assert sum(budgets_de_risque(TOUS).values()) == pytest.approx(1)


def test_chaque_classe_recoit_un_sixieme_partage_entre_ses_actifs():
    budgets = budgets_de_risque(TOUS)
    assert budgets["GLD"] == pytest.approx(1 / 6)       # seul dans sa classe
    assert budgets["SPY"] == pytest.approx(1 / 6 / 3)   # 3 actifs en actions
    assert budgets["BTC-USD"] == pytest.approx(1 / 6 / 2)


def test_sans_crypto_les_5_autres_classes_se_partagent_le_risque():
    budgets = budgets_de_risque([s for s in TOUS if not s.endswith("-USD")])
    assert "BTC-USD" not in budgets
    assert budgets["GLD"] == pytest.approx(1 / 5)
    assert sum(budgets.values()) == pytest.approx(1)
