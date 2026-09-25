"""Tests des outils de l'expérience EXP-004 (experience_004.py)."""
from experience_004 import AVEC_RETOUR, variantes_reglages
from robot.parametres import POIDS_RETOUR_MOYENNE, RETOUR_MOYENNE


def test_le_reglage_teste_est_celui_fixe_dans_experiences_md():
    assert AVEC_RETOUR == {"retour": [("RSI", 14), ("Bollinger", 20)], "poids_retour": 0.5}
    assert RETOUR_MOYENNE == AVEC_RETOUR["retour"] and POIDS_RETOUR_MOYENNE == 0.5


def test_11_variantes_r1():
    variantes = variantes_reglages()
    assert len(variantes) == 11
    assert variantes["RSI seul"] == {"retour": [("RSI", 14)]}
    assert variantes["Bollinger seul"] == {"retour": [("Bollinger", 20)]}
    assert variantes["Durées doublées (28, 40)"] == {"retour": [("RSI", 28), ("Bollinger", 40)]}
    assert variantes["Durées divisées par 2 (7, 10)"] == {"retour": [("RSI", 7), ("Bollinger", 10)]}
    assert variantes["Retour à la moyenne 25 %"] == {"poids_retour": 0.25}
    assert variantes["Retour à la moyenne 75 %"] == {"poids_retour": 0.75}
    assert [(r, l) for r, l, _ in variantes["Moyennes x1,5"]["detecteurs"]] == [(24, 96), (48, 192), (96, 384)]
    assert variantes["Agitation visée 14 %"] == {"vol_cible": 0.14}
    assert variantes["Seuil de transaction 1 %"] == {"seuil": 0.01}
