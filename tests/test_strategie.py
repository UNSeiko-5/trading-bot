"""Tests de la règle et des contrôles de données (strategie.py)."""
from datetime import date

import pandas as pd
import pytest

from strategie import calculer_sma, controler_donnees, decider

SEANCE = date(2026, 9, 24)


def serie(valeurs, fin=SEANCE):
    """Prix de clôture fictifs, un par jour ouvré, se terminant à la date `fin`."""
    dates = pd.bdate_range(end=str(fin), periods=len(valeurs), tz="America/New_York")
    return pd.Series(valeurs, index=dates, dtype=float)


def prix_normaux(nombre_de_jours=200, fin=SEANCE):
    return serie([100 + i * 0.1 for i in range(nombre_de_jours)], fin=fin)


# --- Moyenne mobile -----------------------------------------------------------

def test_moyenne_calculee_a_la_main():
    sma = calculer_sma(serie([1, 2, 3, 4]), fenetre=2)
    assert pd.isna(sma.iloc[0])
    assert list(sma.iloc[1:]) == [1.5, 2.5, 3.5]


# --- Décision -----------------------------------------------------------------

def test_achete_95_pourcent_du_capital_depuis_le_cash():
    assert decider(prix=100, sma=90, parts_detenues=0, capital=10_000) == ("ACHAT", 95)


def test_complete_une_position_trop_petite():
    # Situation réelle du compte : 7 parts à 770 $ sur 100 000 $ -> cible 123 parts
    assert decider(prix=770, sma=700, parts_detenues=7, capital=100_000) == ("ACHAT", 116)


def test_garde_si_deja_investi():
    assert decider(prix=100, sma=90, parts_detenues=95, capital=10_000) == ("GARDER", 0)


def test_pas_de_petit_renfort_inutile():
    # Il manque 5 parts sur 95 (moins de 10 %) : on ne paie pas des frais pour si peu
    assert decider(prix=100, sma=90, parts_detenues=90, capital=10_000) == ("GARDER", 0)


def test_vend_tout_sous_la_moyenne():
    assert decider(prix=80, sma=90, parts_detenues=95, capital=10_000) == ("VENTE", 95)


def test_reste_en_cash_sous_la_moyenne():
    assert decider(prix=80, sma=90, parts_detenues=0, capital=10_000) == ("ATTENDRE", 0)


def test_moyenne_vide_ne_fait_jamais_vendre():
    # L'ancien robot vendait dans ce cas (car "prix > vide" est toujours faux)
    with pytest.raises(ValueError):
        decider(prix=100, sma=float("nan"), parts_detenues=95, capital=10_000)


# --- Contrôle des données -------------------------------------------------------

def test_donnees_correctes_acceptees():
    assert controler_donnees(prix_normaux(), SEANCE) is None


def test_refuse_donnees_vides():
    assert "aucune donnée" in controler_donnees(pd.Series(dtype=float), SEANCE)


def test_refuse_pas_assez_de_jours():
    assert "seulement" in controler_donnees(prix_normaux(150), SEANCE)


def test_refuse_prix_manquant():
    prix = prix_normaux()
    prix.iloc[-10] = float("nan")
    assert "manquants" in controler_donnees(prix, SEANCE)


def test_refuse_prix_negatif():
    prix = prix_normaux()
    prix.iloc[-3] = -1
    assert "négatif" in controler_donnees(prix, SEANCE)


def test_refuse_donnees_pas_a_jour():
    prix = prix_normaux(fin=date(2026, 9, 22))
    assert "pas à jour" in controler_donnees(prix, SEANCE)


def test_refuse_variation_aberrante():
    prix = prix_normaux()
    prix.iloc[-1] = prix.iloc[-2] * 2  # +100 % en un jour : donnée fausse
    assert "suspecte" in controler_donnees(prix, SEANCE)
