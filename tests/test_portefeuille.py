"""Tests de la taille des positions et des garde-fous (robot/portefeuille.py)."""
import numpy as np
import pandas as pd
import pytest

from robot.portefeuille import (
    Risque, appliquer_garde_fous, appliquer_seuil, idm, parts_cibles, preparer_risque, volatilite_annuelle,
)
from robot.signaux import notes as calculer_notes

JOURS = pd.bdate_range("2020-01-01", periods=900)


def clotures(symboles=("SPY", "TLT", "GLD", "BTC-USD"), graine=0, debuts=None):
    """Prix fictifs de plusieurs actifs. `debuts` : jour de création de certains actifs."""
    aleatoire = np.random.default_rng(graine)
    prix = {}
    for i, symbole in enumerate(symboles):
        agitation = 0.04 if symbole.endswith("-USD") else 0.01
        serie = pd.Series(100 * np.cumprod(1 + aleatoire.normal(0.0005, agitation, len(JOURS))), index=JOURS)
        if debuts and symbole in debuts:
            serie.iloc[: debuts[symbole]] = np.nan
        prix[symbole] = serie
    return pd.DataFrame(prix)


def un_jour(**valeurs):
    """Tableau d'un seul jour, pour tester une formule à la main."""
    return pd.DataFrame([valeurs], index=[JOURS[0]])


# --- Agitation ------------------------------------------------------------------------------

def test_agitation_annuelle():
    # 1 % d'agitation par jour ≈ 1 % × racine(252) ≈ 15,9 % par an
    prix = pd.DataFrame({"SPY": 100 * np.cumprod(1 + np.random.default_rng(1).normal(0, 0.01, 3000))})
    assert volatilite_annuelle(prix)["SPY"].iloc[500:].mean() == pytest.approx(0.159, abs=0.01)


# --- Bonus de diversification (IDM) ------------------------------------------------------------

def test_idm_actifs_identiques_aucun_bonus():
    assert idm([[1, 1], [1, 1]], [0.5, 0.5]) == pytest.approx(1.0)


def test_idm_actifs_independants():
    assert idm([[1, 0], [0, 1]], [0.5, 0.5]) == pytest.approx(np.sqrt(2))


def test_idm_correlation_negative_traitee_comme_nulle():
    assert idm([[1, -0.8], [-0.8, 1]], [0.5, 0.5]) == pytest.approx(np.sqrt(2))


def test_idm_plafonne_a_2_5():
    assert idm(np.eye(10), [0.1] * 10) == pytest.approx(2.5)  # sans plafond : 3,16


def test_idm_quotidien_egal_au_calcul_direct_sur_les_2_ans_precedents():
    prix = clotures()
    risque = preparer_risque(prix)
    jour = JOURS[800]
    fenetre = risque.rendements.loc[:jour].tail(504)
    budgets = risque.budgets.loc[jour]
    attendu = idm(fenetre.corr().to_numpy(), budgets.to_numpy())
    assert risque.idm.loc[jour] == pytest.approx(attendu)


# --- Taille des positions ---------------------------------------------------------------------

def test_formule_a_la_main():
    # 12 % × IDM 1,5 × budget 1/6 × (note 10 / 10) / agitation 20 % = 15 %
    risque = Risque(None, un_jour(SPY=0.20), un_jour(SPY=1 / 6), pd.Series([1.5], index=[JOURS[0]]))
    assert parts_cibles(un_jour(SPY=10.0), risque)["SPY"].iloc[0] == pytest.approx(0.15)


def test_tendance_plus_forte_position_plus_grosse():
    risque = Risque(None, un_jour(SPY=0.20), un_jour(SPY=1 / 6), pd.Series([1.5], index=[JOURS[0]]))
    assert parts_cibles(un_jour(SPY=5.0), risque)["SPY"].iloc[0] < parts_cibles(un_jour(SPY=10.0), risque)["SPY"].iloc[0]


def test_actif_plus_agite_position_plus_petite():
    risque = Risque(None, un_jour(SPY=0.15, GLD=0.30), un_jour(SPY=0.1, GLD=0.1), pd.Series([1.0], index=[JOURS[0]]))
    parts = parts_cibles(un_jour(SPY=10.0, GLD=10.0), risque)
    assert parts["GLD"].iloc[0] == pytest.approx(parts["SPY"].iloc[0] / 2)


def test_note_zero_donc_cash():
    risque = Risque(None, un_jour(SPY=0.20), un_jour(SPY=1.0), pd.Series([1.5], index=[JOURS[0]]))
    assert parts_cibles(un_jour(SPY=0.0), risque)["SPY"].iloc[0] == 0


def test_actif_pas_encore_disponible_ne_recoit_rien_et_laisse_son_budget():
    prix = clotures(debuts={"BTC-USD": 700})
    risque = preparer_risque(prix)
    assert (risque.budgets["BTC-USD"].iloc[:900] == 0).all()     # moins de 300 jours de données
    assert risque.budgets.iloc[600].sum() == pytest.approx(1)    # budget réparti entre les 3 autres
    assert (parts_cibles(calculer_notes(prix), risque)["BTC-USD"] == 0).all()


# --- Garde-fous ---------------------------------------------------------------------------------

def test_maximum_25_pourcent_par_actif():
    assert appliquer_garde_fous(un_jour(SPY=0.40))["SPY"].iloc[0] == pytest.approx(0.25)


def test_maximum_15_pourcent_en_crypto_reduit_proportionnellement():
    parts = appliquer_garde_fous(un_jour(**{"BTC-USD": 0.20, "ETH-USD": 0.10, "SPY": 0.10}))
    assert parts["BTC-USD"].iloc[0] == pytest.approx(0.10)
    assert parts["ETH-USD"].iloc[0] == pytest.approx(0.05)
    assert parts["SPY"].iloc[0] == pytest.approx(0.10)


def test_jamais_plus_de_100_pourcent_investi():
    parts = appliquer_garde_fous(un_jour(SPY=0.25, EFA=0.25, EEM=0.25, IEF=0.25, TLT=0.25))
    assert parts.iloc[0].sum() == pytest.approx(1.0)
    assert parts["SPY"].iloc[0] == pytest.approx(0.20)


def test_garde_fous_respectes_sur_tout_un_historique():
    prix = clotures(("SPY", "EFA", "IEF", "TLT", "GLD", "BTC-USD", "ETH-USD"), graine=5)
    parts = parts_cibles(calculer_notes(prix), preparer_risque(prix))
    assert (parts >= 0).all().all()
    assert (parts <= 0.25 + 1e-9).all().all()
    assert (parts[["BTC-USD", "ETH-USD"]].sum(axis=1) <= 0.15 + 1e-9).all()
    assert (parts.sum(axis=1) <= 1 + 1e-9).all()


# --- Seuil de transaction -----------------------------------------------------------------------

def test_petit_ecart_on_ne_bouge_pas():
    actuelles = pd.Series({"SPY": 0.20, "GLD": 0.10})
    cibles = pd.Series({"SPY": 0.21, "GLD": 0.10})
    assert appliquer_seuil(cibles, actuelles)["SPY"] == 0.20


def test_gros_ecart_on_rejoint_la_cible():
    actuelles = pd.Series({"SPY": 0.20, "GLD": 0.10})
    cibles = pd.Series({"SPY": 0.23, "GLD": 0.10})
    assert appliquer_seuil(cibles, actuelles)["SPY"] == 0.23


def test_cible_zero_on_vend_meme_un_petit_reste():
    actuelles = pd.Series({"SPY": 0.01, "GLD": 0.10})
    cibles = pd.Series({"SPY": 0.0, "GLD": 0.10})
    assert appliquer_seuil(cibles, actuelles)["SPY"] == 0


def test_si_garder_depasserait_un_plafond_on_applique_toutes_les_cibles():
    # Le Bitcoin a monté : garder 16 % dépasserait le plafond crypto de 15 %
    actuelles = pd.Series({"BTC-USD": 0.16, "SPY": 0.20})
    cibles = pd.Series({"BTC-USD": 0.15, "SPY": 0.20})
    assert appliquer_seuil(cibles, actuelles)["BTC-USD"] == 0.15


# --- Pas de triche avec le futur -----------------------------------------------------------------

def test_modifier_le_futur_ne_change_pas_les_parts_passees():
    prix = clotures(graine=3)
    futur_modifie = prix.copy()
    futur_modifie.iloc[700:] *= 2.5
    avant = parts_cibles(calculer_notes(prix), preparer_risque(prix)).iloc[:700]
    apres = parts_cibles(calculer_notes(futur_modifie), preparer_risque(futur_modifie)).iloc[:700]
    pd.testing.assert_frame_equal(avant, apres)
