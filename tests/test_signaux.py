"""Tests des signaux de tendance (robot/signaux.py), sur des prix fictifs."""
import numpy as np
import pandas as pd
import pytest

from robot.signaux import note_combinee, note_detecteur, notes, notes_detecteurs

JOURS = pd.bdate_range("2020-01-01", periods=800)


def prix(tendance_par_jour, bruit=0.01, graine=0, debut=100.0):
    """Prix fictifs : une tendance quotidienne (+0,1 % par exemple) plus du bruit aléatoire."""
    rendements = tendance_par_jour + np.random.default_rng(graine).normal(0, bruit, len(JOURS))
    return pd.Series(debut * np.cumprod(1 + rendements), index=JOURS)


def test_tendance_haussiere_donne_une_note_positive():
    assert note_combinee(prix(+0.002)).iloc[-1] > 5


def test_tendance_baissiere_donne_zero_donc_cash():
    assert note_combinee(prix(-0.002)).iloc[-1] == 0


def test_la_note_reste_toujours_entre_0_et_20():
    for tendance in (-0.01, -0.001, 0, 0.001, 0.01):
        note = note_combinee(prix(tendance)).dropna()
        assert note.between(0, 20).all()


def test_une_tendance_extreme_est_plafonnee_a_20():
    assert note_combinee(prix(+0.01, bruit=0.001)).iloc[-1] == 20


def test_chaque_detecteur_peut_etre_negatif():
    # Seule la note COMBINÉE est ramenée à 0 : les détecteurs, eux, voient aussi la baisse
    assert (notes_detecteurs(prix(-0.002)).iloc[-1] < 0).all()


def test_la_note_combinee_est_la_moyenne_des_detecteurs():
    p = prix(0.0005, graine=3)
    attendu = notes_detecteurs(p).mean(axis=1).clip(0, 20)
    pd.testing.assert_series_equal(note_combinee(p).iloc[400:], attendu.iloc[400:], check_names=False)


def test_meme_tendance_meme_note_quel_que_soit_le_prix():
    # Un actif à 10 $ et un actif à 1 000 $ qui bougent pareil (en %) ont la même note
    a, b = prix(0.001, debut=10), prix(0.001, debut=1000)
    pd.testing.assert_series_equal(note_combinee(a), note_combinee(b))


def test_pas_de_note_avant_300_jours_de_donnees():
    p = prix(0.001)
    p.iloc[:100] = np.nan  # l'actif n'existe qu'à partir du 101e jour
    note = note_combinee(p)
    assert note.iloc[:399].isna().all()   # 100 jours vides + 299 jours d'ancienneté
    assert note.iloc[399:].notna().all()


@pytest.mark.parametrize("facteur", [3, 0.3])
def test_pas_de_triche_avec_le_futur(facteur):
    # Modifier les prix à partir d'un jour ne doit rien changer aux notes des jours d'avant
    normal = prix(0.0005, graine=7)
    futur_modifie = normal.copy()
    futur_modifie.iloc[600:] *= facteur
    pd.testing.assert_series_equal(note_combinee(normal).iloc[:600], note_combinee(futur_modifie).iloc[:600])


def test_detecteur_a_la_main():
    # Vérifie la formule sur un cas simple : écart des moyennes / agitation x facteur
    p = prix(0.001, graine=11)
    ecart = p.ewm(span=16, min_periods=16).mean() - p.ewm(span=64, min_periods=64).mean()
    agitation = p.diff().ewm(span=35, min_periods=35).std()
    attendu = (ecart / agitation * 3.75).clip(-20, 20)
    pd.testing.assert_series_equal(note_detecteur(p, 16, 64, 3.75), attendu)


def test_notes_pour_tout_le_panier():
    clotures = pd.DataFrame({"SPY": prix(0.001), "TLT": prix(-0.001, graine=1)})
    tableau = notes(clotures)
    assert list(tableau.columns) == ["SPY", "TLT"]
    assert tableau["SPY"].iloc[-1] > 0 and tableau["TLT"].iloc[-1] == 0
