"""Tests du déroulé commun des expériences (outils_experience.py)."""
import pytest

from outils_experience import verifier_mieux


def m(rendement, note):
    return {"rendement_annuel": rendement, "note_rendement_risque": note}


@pytest.mark.parametrize("nouvelle, attendu", [
    (m(0.070, 0.70), [True, True]),     # +0,7 point, meilleure note
    (m(0.068, 0.63), [True, True]),     # +0,5 point pile, note égale : réussi
    (m(0.067, 0.70), [False, True]),    # +0,4 point seulement
    (m(0.080, 0.60), [True, False]),    # plus de rendement, mais note dégradée
])
def test_criteres_mieux_que_la_v2(nouvelle, attendu):
    v2 = m(0.063, 0.63)
    assert [ok for _, ok, _ in verifier_mieux(nouvelle, v2)] == attendu
