"""Tests du backtest multi-actifs (robot/simulation.py), sur des prix fictifs calculables à la main."""
import numpy as np
import pandas as pd
import pytest

from robot.parametres import CASSURES, RETOUR_MOYENNE
from robot.portefeuille import appliquer_seuil, seuil_rapide
from robot.simulation import (
    acheter_et_garder, mesures, rendements_par_annee, simuler, soixante_quarante, strategie_v2,
)

SANS_FRAIS = {"ETF": 0.0, "crypto": 0.0}


def tableau(valeurs, colonnes=("SPY",), debut="2026-01-05"):
    dates = pd.bdate_range(debut, periods=len(valeurs))
    return pd.DataFrame(np.asarray(valeurs, dtype=float).reshape(len(valeurs), -1), index=dates, columns=list(colonnes))


def debut_de(df):
    return df.index[0]


# --- Moteur : cas calculés à la main -------------------------------------------------------------

def test_achat_a_l_ouverture_suivante_avec_frais():
    # Jour 0 : décision d'investir 50 %. Jour 1 : achat à l'ouverture (110), clôture à 121.
    # Frais 0,1 % sur 0,5 = 0,0005. Valeur = cash 0,4995 + 0,5 × 121/110 = 1,0495
    ouvertures = tableau([100, 110])
    clotures = tableau([100, 121])
    cibles = tableau([0.5, 0.5])
    r = simuler(ouvertures, clotures, cibles, debut=debut_de(clotures), frais={"ETF": 0.001, "crypto": 0.005})
    assert r.valeur.iloc[0] == pytest.approx(1.0)
    assert r.valeur.iloc[1] == pytest.approx(1.0495)
    assert r.frais.iloc[1] == pytest.approx(0.0005)


def test_le_saut_de_la_nuit_n_est_pas_gagne_si_on_n_etait_pas_encore_investi():
    # Décision le soir du jour 0, le prix saute de +50 % pendant la nuit : on achète APRÈS le saut
    ouvertures = tableau([100, 150, 150])
    clotures = tableau([100, 150, 150])
    cibles = tableau([1.0, 1.0, 1.0])
    r = simuler(ouvertures, clotures, cibles, debut=debut_de(clotures), frais=SANS_FRAIS)
    assert r.valeur.iloc[-1] == pytest.approx(1.0)


def test_vente_a_l_ouverture_suivante():
    # Investi à 100 %, décision de vendre le soir du jour 1, vente à l'ouverture du jour 2 (90)
    ouvertures = tableau([100, 100, 90, 50])
    clotures = tableau([100, 100, 95, 50])
    cibles = tableau([1.0, 0.0, 0.0, 0.0])
    r = simuler(ouvertures, clotures, cibles, debut=debut_de(clotures), frais=SANS_FRAIS)
    assert r.valeur.iloc[-1] == pytest.approx(0.9)   # vendu à 90, la chute à 50 n'est pas subie


def test_petits_ecarts_pas_de_transaction():
    ouvertures = clotures = tableau([100] * 5)
    cibles = tableau([0.20, 0.21, 0.195, 0.205, 0.21])  # écarts < 2 % après le premier achat
    r = simuler(ouvertures, clotures, cibles, debut=debut_de(clotures), frais=SANS_FRAIS)
    assert (r.rotation.iloc[2:] == 0).all()


def test_les_frais_reduisent_la_valeur():
    prix = tableau(100 * np.cumprod(1 + np.random.default_rng(0).normal(0, 0.01, 200)))
    cibles = tableau(np.where(np.arange(200) % 20 < 10, 0.8, 0.2))
    sans = simuler(prix, prix, cibles, debut=debut_de(prix), frais=SANS_FRAIS).valeur.iloc[-1]
    avec = simuler(prix, prix, cibles, debut=debut_de(prix), frais={"ETF": 0.01, "crypto": 0.01}).valeur.iloc[-1]
    assert avec < sans


def test_jamais_de_levier():
    aleatoire = np.random.default_rng(1)
    prix = tableau(100 * np.cumprod(1 + aleatoire.normal(0, 0.03, (300, 3)), axis=0), colonnes=("SPY", "GLD", "TLT"))
    cibles = tableau(np.full((300, 3), 1 / 3), colonnes=("SPY", "GLD", "TLT"))
    r = simuler(prix, prix, cibles, debut=debut_de(prix))
    assert (r.poids.sum(axis=1) <= 1 + 1e-9).all()


def test_actif_pas_encore_cote_ne_casse_rien():
    ouvertures = clotures = tableau([[100, np.nan], [100, np.nan], [100, 50]], colonnes=("SPY", "BTC-USD"))
    cibles = tableau([[0.5, 0.0], [0.5, 0.0], [0.5, 0.0]], colonnes=("SPY", "BTC-USD"))
    r = simuler(ouvertures, clotures, cibles, debut=debut_de(clotures), frais=SANS_FRAIS)
    assert np.isfinite(r.valeur).all()


def test_seuil_rapide_identique_a_la_version_lisible():
    aleatoire = np.random.default_rng(2)
    symboles = ["SPY", "GLD", "BTC-USD", "ETH-USD"]
    for _ in range(200):
        cibles = pd.Series(aleatoire.uniform(0, 0.25, 4), index=symboles)
        actuelles = pd.Series(aleatoire.uniform(0, 0.25, 4), index=symboles)
        crypto = np.array([False, False, True, True])
        attendu = appliquer_seuil(cibles, actuelles).to_numpy()
        np.testing.assert_array_equal(seuil_rapide(cibles.to_numpy(), actuelles.to_numpy(), crypto), attendu)


# --- Stratégie complète ------------------------------------------------------------------------

def marche_fictif(graine=0, jours=1200):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    agitations = np.array([0.012, 0.013, 0.005, 0.01, 0.04])
    rendements = aleatoire.normal(0.0003, agitations, (jours, len(symboles)))
    clotures = tableau(100 * np.cumprod(1 + rendements, axis=0), colonnes=symboles, debut="2015-01-01")
    ouvertures = clotures.shift(1).fillna(clotures) * (1 + aleatoire.normal(0, 0.002, clotures.shape))
    return ouvertures, clotures


def test_strategie_complete_sans_triche_avec_le_futur():
    ouvertures, clotures = marche_fictif()
    debut = clotures.index[400]
    normal = strategie_v2(ouvertures, clotures, debut=debut).valeur
    o2, c2 = ouvertures.copy(), clotures.copy()
    o2.iloc[900:] *= 1.8
    c2.iloc[900:] *= 1.8
    modifie = strategie_v2(o2, c2, debut=debut).valeur
    pd.testing.assert_series_equal(normal.loc[: clotures.index[899]], modifie.loc[: clotures.index[899]])


def test_strategie_complete_respecte_les_garde_fous():
    ouvertures, clotures = marche_fictif(graine=4)
    r = strategie_v2(ouvertures, clotures, debut=clotures.index[400])
    assert (r.poids.sum(axis=1) <= 1 + 1e-6).all()
    assert (r.poids["BTC-USD"] <= 0.15 + 0.02).all()   # plafond crypto (+ dérive entre deux décisions)



def test_avec_cassures_sans_triche_avec_le_futur():
    ouvertures, clotures = marche_fictif(graine=2)
    debut = clotures.index[400]
    normal = strategie_v2(ouvertures, clotures, debut=debut, cassures=CASSURES).valeur
    o2, c2 = ouvertures.copy(), clotures.copy()
    o2.iloc[900:] *= 0.5
    c2.iloc[900:] *= 0.5
    modifie = strategie_v2(o2, c2, debut=debut, cassures=CASSURES).valeur
    pd.testing.assert_series_equal(normal.loc[: clotures.index[899]], modifie.loc[: clotures.index[899]])


def test_avec_cassures_respecte_les_garde_fous():
    ouvertures, clotures = marche_fictif(graine=5)
    r = strategie_v2(ouvertures, clotures, debut=clotures.index[400], cassures=CASSURES)
    assert (r.poids.sum(axis=1) <= 1 + 1e-6).all()
    assert (r.poids["BTC-USD"] <= 0.15 + 0.02).all()


def test_les_cassures_changent_le_resultat_et_la_v2_reste_la_meme_par_defaut():
    ouvertures, clotures = marche_fictif(graine=6)
    debut = clotures.index[400]
    v2 = strategie_v2(ouvertures, clotures, debut=debut).valeur
    pd.testing.assert_series_equal(strategie_v2(ouvertures, clotures, debut=debut, cassures=()).valeur, v2)
    assert not np.allclose(strategie_v2(ouvertures, clotures, debut=debut, cassures=CASSURES).valeur, v2)


def test_avec_retour_a_la_moyenne_sans_triche_avec_le_futur():
    ouvertures, clotures = marche_fictif(graine=7)
    debut = clotures.index[400]
    normal = strategie_v2(ouvertures, clotures, debut=debut, retour=RETOUR_MOYENNE).valeur
    o2, c2 = ouvertures.copy(), clotures.copy()
    o2.iloc[900:] *= 0.5
    c2.iloc[900:] *= 0.5
    modifie = strategie_v2(o2, c2, debut=debut, retour=RETOUR_MOYENNE).valeur
    pd.testing.assert_series_equal(normal.loc[: clotures.index[899]], modifie.loc[: clotures.index[899]])


def test_avec_retour_a_la_moyenne_respecte_les_garde_fous_et_change_le_resultat():
    ouvertures, clotures = marche_fictif(graine=8)
    debut = clotures.index[400]
    r = strategie_v2(ouvertures, clotures, debut=debut, retour=RETOUR_MOYENNE)
    assert (r.poids.sum(axis=1) <= 1 + 1e-6).all()
    assert (r.poids["BTC-USD"] <= 0.15 + 0.02).all()
    assert not np.allclose(r.valeur, strategie_v2(ouvertures, clotures, debut=debut).valeur)

# --- Points de comparaison et mesures ---------------------------------------------------------------

def test_acheter_et_garder():
    clotures = tableau([100, 120, 90])
    assert list(acheter_et_garder(clotures, debut=debut_de(clotures))) == pytest.approx([1.0, 1.2, 0.9])


def test_soixante_quarante_reequilibre_chaque_mois():
    dates = pd.bdate_range("2026-01-26", "2026-02-06")
    clotures = pd.DataFrame({"SPY": np.linspace(100, 150, len(dates)), "IEF": 100.0}, index=dates)
    valeur = soixante_quarante(clotures, debut=dates[0], frais=0)
    # Jusqu'au 30 janvier : 0,6 × SPY/100 + 0,4. Le 2 février, retour à 60/40 de la valeur totale.
    fin_janvier = dates[dates.month == 1][-1]
    assert valeur.loc[fin_janvier] == pytest.approx(0.6 * clotures.loc[fin_janvier, "SPY"] / 100 + 0.4)


def test_mesures_a_la_main():
    # 1 -> 2 en 252 jours : +100 % par an. Puis chute à 1,5 : pire chute -25 %.
    valeur = pd.Series(list(np.linspace(1, 2, 253)) + [1.5], index=pd.bdate_range("2020-01-01", periods=254))
    m = mesures(valeur.iloc[:253])
    assert m["rendement_annuel"] == pytest.approx(1.0)
    assert mesures(valeur)["pire_chute"] == pytest.approx(-0.25)


def test_rendements_par_annee():
    dates = pd.to_datetime(["2020-01-02", "2020-12-31", "2021-12-31"])
    r = rendements_par_annee(pd.Series([1.0, 1.1, 0.99], index=dates))
    assert r.loc[2020] == pytest.approx(0.10) and r.loc[2021] == pytest.approx(-0.10)
