"""Tests des données de la v2 (robot/donnees.py), sur des prix fictifs, sans Internet."""
import numpy as np
import pandas as pd

from robot.donnees import aligner, charger, controler_brut, dates_simples


def historique(dates, prix=None, fuseau="America/New_York"):
    """Faux historique Yahoo : colonnes Open et Close, dates avec fuseau horaire."""
    dates = pd.DatetimeIndex(dates).tz_localize(fuseau)
    if prix is None:
        prix = 100 * np.cumprod(1 + np.random.default_rng(len(dates)).normal(0, 0.01, len(dates)))
    prix = np.asarray(prix, dtype=float)
    return pd.DataFrame({"Open": prix * 0.999, "Close": prix}, index=dates)


JOURS_DE_BOURSE = pd.bdate_range("2026-09-01", "2026-09-30")


# --- Dates -----------------------------------------------------------------------------

def test_dates_new_york_et_utc_donnent_le_meme_jour():
    new_york = pd.DatetimeIndex(["2026-09-24"]).tz_localize("America/New_York")
    utc = pd.DatetimeIndex(["2026-09-24"]).tz_localize("UTC")
    assert dates_simples(new_york)[0] == dates_simples(utc)[0] == pd.Timestamp("2026-09-24")


# --- Alignement ------------------------------------------------------------------------

def test_la_crypto_est_calee_sur_les_jours_de_bourse():
    crypto = historique(pd.date_range("2026-09-01", "2026-09-30"), fuseau="UTC")  # 7 jours sur 7
    _, clotures, _, _ = aligner({"BTC-USD": crypto}, JOURS_DE_BOURSE)
    assert list(clotures.index) == list(JOURS_DE_BOURSE)
    lundi = pd.Timestamp("2026-09-07")
    assert clotures.loc[lundi, "BTC-USD"] == crypto["Close"].iloc[6]  # le 7 septembre


def test_un_petit_trou_est_comble_avec_le_dernier_prix():
    dates = JOURS_DE_BOURSE.delete([5, 6])  # 2 jours manquants
    _, clotures, combles, manquants = aligner({"GLD": historique(dates)}, JOURS_DE_BOURSE)
    assert combles["GLD"] == 2 and manquants["GLD"] == 0
    assert clotures["GLD"].iloc[5] == clotures["GLD"].iloc[4]


def test_un_long_trou_est_signale():
    dates = JOURS_DE_BOURSE.delete(range(5, 10))  # 5 jours manquants : 3 comblés, 2 restent vides
    _, _, combles, manquants = aligner({"GLD": historique(dates)}, JOURS_DE_BOURSE)
    assert combles["GLD"] == 3 and manquants["GLD"] == 2


def test_avant_sa_creation_un_actif_reste_vide_sans_etre_un_trou():
    _, clotures, combles, manquants = aligner({"DBC": historique(JOURS_DE_BOURSE[10:])}, JOURS_DE_BOURSE)
    assert clotures["DBC"].iloc[:10].isna().all()
    assert combles["DBC"] == 0 and manquants["DBC"] == 0


# --- Contrôles de qualité ----------------------------------------------------------------

def test_donnees_propres_sans_probleme():
    assert controler_brut(historique(JOURS_DE_BOURSE), "ETF") == ([], [])


def test_detecte_donnees_vides():
    assert "aucune donnée" in controler_brut(pd.DataFrame(), "ETF")[0][0]


def test_detecte_prix_negatif():
    h = historique(JOURS_DE_BOURSE)
    h.iloc[3, 1] = -5
    assert "négatif" in controler_brut(h, "ETF")[0][0]


def test_detecte_dates_en_double():
    h = historique(JOURS_DE_BOURSE)
    h = pd.concat([h, h.iloc[[4]]])
    assert "double" in controler_brut(h, "ETF")[0][0]


def test_detecte_prix_fige():
    prix = [100 + i for i in range(10)] + [110] * 7 + [111 + i for i in range(5)]
    problemes, _ = controler_brut(historique(JOURS_DE_BOURSE[:22], prix), "ETF")
    assert "figé pendant 7 jours" in problemes[0]


def test_grosse_variation_est_un_avertissement_pas_un_blocage():
    prix = np.full(len(JOURS_DE_BOURSE), 100.0)
    prix += np.arange(len(prix)) * 0.01   # évite le « prix figé »
    prix[10:] *= 0.7                      # -30 % en un jour : krach ou erreur ?
    problemes, avertissements = controler_brut(historique(JOURS_DE_BOURSE, prix), "ETF")
    assert problemes == []
    assert "variation de 30%" in avertissements[0]


def test_la_crypto_a_un_seuil_de_variation_plus_large():
    prix = np.full(len(JOURS_DE_BOURSE), 100.0) + np.arange(len(JOURS_DE_BOURSE)) * 0.01
    prix[10:] *= 0.7
    assert controler_brut(historique(JOURS_DE_BOURSE, prix, fuseau="UTC"), "crypto") == ([], [])


# --- Chaîne complète -----------------------------------------------------------------------

def faux_telechargeur(symbole):
    if symbole == "BTC-USD":
        return historique(pd.date_range("2026-09-01", "2026-09-30"), fuseau="UTC")
    return historique(JOURS_DE_BOURSE)


def test_chargement_complet_avec_faux_telechargement():
    donnees = charger(["SPY", "GLD", "BTC-USD"], telechargeur=faux_telechargeur)
    assert donnees.utilisables
    assert list(donnees.clotures.columns) == ["SPY", "GLD", "BTC-USD"]
    assert donnees.clotures.notna().all().all()


def test_l_empreinte_identifie_exactement_les_donnees():
    a = charger(["SPY", "GLD"], telechargeur=faux_telechargeur)
    b = charger(["SPY", "GLD"], telechargeur=faux_telechargeur)
    assert a.empreinte() == b.empreinte()
    b.clotures.iloc[3, 0] += 0.01
    assert a.empreinte() != b.empreinte()


def test_un_actif_sans_donnees_rend_le_jeu_inutilisable():
    def telechargeur(symbole):
        return pd.DataFrame() if symbole == "GLD" else faux_telechargeur(symbole)
    donnees = charger(["SPY", "GLD"], telechargeur=telechargeur)
    assert not donnees.utilisables
