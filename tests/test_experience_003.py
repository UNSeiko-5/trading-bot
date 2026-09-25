"""Tests des outils de l'expérience EXP-003 (experience_003.py)."""
from experience_003 import AVEC_CASSURES, variantes_reglages
from robot.parametres import CASSURES


def test_les_cassures_testees_sont_celles_fixees_dans_experiences_md():
    assert AVEC_CASSURES == {"cassures": [(40, 0.70), (80, 0.73), (160, 0.74)]}
    assert CASSURES == AVEC_CASSURES["cassures"]


def test_10_variantes_r1():
    variantes = variantes_reglages()
    assert len(variantes) == 10
    assert variantes["Cassures seules"] == {"detecteurs": []}
    assert variantes["Cassures 20, 40, 80 jours"]["cassures"] == [(20, 0.67), (40, 0.70), (80, 0.73)]
    assert variantes["Cassures 80, 160, 320 jours"]["cassures"] == [(80, 0.73), (160, 0.74), (320, 0.74)]
    assert variantes["Horizon court seul (16/64 + 40)"] == {"detecteurs": [(16, 64, 3.75)], "cassures": [(40, 0.70)]}
    assert variantes["Horizon long seul (64/256 + 160)"] == {"detecteurs": [(64, 256, 1.87)], "cassures": [(160, 0.74)]}
    assert variantes["Agitation visée 10 %"] == {"vol_cible": 0.10}
    assert variantes["Seuil de transaction 4 %"] == {"seuil": 0.04}
    assert [(r, l) for r, l, _ in variantes["Moyennes x1,5"]["detecteurs"]] == [(24, 96), (48, 192), (96, 384)]

