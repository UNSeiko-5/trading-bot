"""Tests des signaux de tendance (robot/signaux.py), sur des prix fictifs."""
import numpy as np
import pandas as pd
import pytest

from robot.parametres import CASSURES, RETOUR_MOYENNE
from robot.signaux import (
    note_bollinger, note_cassure, note_combinee, note_detecteur, note_rsi, notes, notes_detecteurs,
)

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


# --- Cassures (EXP-003) ---------------------------------------------------------------------------

def test_cassure_a_la_main():
    # Vérifie la formule : position dans le canal de Donchian, lissée sur N/4 jours, x facteur
    p = prix(0.001, graine=12)
    haut, bas = p.rolling(40, min_periods=40).max(), p.rolling(40, min_periods=40).min()
    position = 40 * (p - (haut + bas) / 2) / (haut - bas)
    attendu = (position.ewm(span=10, min_periods=10).mean() * 0.70).clip(-20, 20)
    pd.testing.assert_series_equal(note_cassure(p, 40, 0.70), attendu)


def test_cassure_en_haut_du_canal_note_maximale():
    # Prix qui monte tous les jours : toujours tout en haut du canal -> 20 x facteur
    p = pd.Series(np.linspace(100, 200, 200), index=JOURS[:200])
    assert note_cassure(p, 40, 0.70).iloc[-1] == pytest.approx(20 * 0.70)
    assert note_cassure(-p + 300, 40, 0.70).iloc[-1] == pytest.approx(-20 * 0.70)


def test_cassure_au_milieu_du_canal_note_nulle():
    # Canal de 100 à 120 ; le prix revient pile au milieu (110) et y reste : la note lissée tend vers 0
    valeurs = [100.0, 120.0] * 20 + [110.0] * 30
    p = pd.Series(valeurs, index=JOURS[:70])
    assert note_cassure(p, 40, 0.70).iloc[-1] == pytest.approx(0, abs=0.1)


def test_cassure_prix_plat_note_nulle_et_pas_vide():
    p = pd.Series(100.0, index=JOURS[:200])
    note = note_cassure(p, 40, 0.70).iloc[60:]
    assert note.notna().all() and (note == 0).all()


def test_cassure_suit_la_tendance():
    for duree, facteur in CASSURES:
        assert note_cassure(prix(+0.002), duree, facteur).iloc[-1] > 0
        assert note_cassure(prix(-0.002), duree, facteur).iloc[-1] < 0


def test_cassure_ne_depasse_jamais_20_fois_le_facteur():
    for tendance in (-0.01, 0, 0.01):
        note = note_cassure(prix(tendance), 80, 0.73).dropna()
        assert note.abs().max() <= 20 * 0.73 + 1e-9


def test_cassure_meme_note_quel_que_soit_le_prix():
    a, b = prix(0.001, debut=10), prix(0.001, debut=1000)
    pd.testing.assert_series_equal(note_cassure(a, 80, 0.73), note_cassure(b, 80, 0.73))


def test_cassure_attend_la_duree_du_canal_puis_le_lissage():
    # 160 jours pour le canal, puis 40 jours de lissage : première note le 199e jour
    note = note_cassure(prix(0.001), 160, 0.74)
    assert note.iloc[:198].isna().all() and note.iloc[198:].notna().all()


@pytest.mark.parametrize("facteur", [3, 0.3])
def test_cassure_pas_de_triche_avec_le_futur(facteur):
    normal = prix(0.0005, graine=8)
    futur_modifie = normal.copy()
    futur_modifie.iloc[600:] *= facteur
    avec = {"cassures": CASSURES}
    pd.testing.assert_series_equal(note_combinee(normal, **avec).iloc[:600], note_combinee(futur_modifie, **avec).iloc[:600])


def test_avec_cassures_la_note_est_la_moyenne_des_6_detecteurs():
    p = prix(0.0005, graine=4)
    details = notes_detecteurs(p, cassures=CASSURES)
    assert list(details.columns) == ["16/64", "32/128", "64/256", "cassure 40", "cassure 80", "cassure 160"]
    attendu = details.mean(axis=1).clip(0, 20)
    pd.testing.assert_series_equal(note_combinee(p, cassures=CASSURES).iloc[400:], attendu.iloc[400:], check_names=False)


def test_cassures_seules_sans_les_moyennes():
    p = prix(0.0005, graine=5)
    details = notes_detecteurs(p, detecteurs=[], cassures=CASSURES)
    assert list(details.columns) == ["cassure 40", "cassure 80", "cassure 160"]


def test_sans_cassures_la_note_de_la_v2_ne_change_pas():
    p = prix(0.0005, graine=6)
    pd.testing.assert_series_equal(note_combinee(p, cassures=()), note_combinee(p))
    assert list(notes_detecteurs(p).columns) == ["16/64", "32/128", "64/256"]


# --- Retour à la moyenne (EXP-004) ----------------------------------------------------------------

def rsi_de_wilder_en_boucle(prix, duree):
    """RSI calculé pas à pas comme dans le livre de Wilder (1978) : moyenne simple des `duree`
    premières variations, puis moyenne = (ancienne x (duree - 1) + nouvelle) / duree."""
    variations = prix.diff().to_numpy()[1:]
    hausses, baisses = np.clip(variations, 0, None), np.clip(-variations, 0, None)
    resultat = [np.nan] * len(prix)
    m_h, m_b = hausses[:duree].mean(), baisses[:duree].mean()
    for t in range(duree, len(variations)):
        m_h = (m_h * (duree - 1) + hausses[t]) / duree
        m_b = (m_b * (duree - 1) + baisses[t]) / duree
        resultat[t + 1] = 100 * m_h / (m_h + m_b)
    return pd.Series(resultat, index=prix.index)


def test_rsi_identique_a_la_methode_de_wilder():
    # Même RSI que le calcul du livre une fois passé le démarrage : la façon d'initialiser diffère
    # (Wilder part d'une moyenne simple) mais son effet s'efface. On compare à partir du 300e jour,
    # quand le robot commence à utiliser un actif.
    p = prix(0.0005, graine=21)
    note = note_rsi(p, 14)
    attendu = ((50 - rsi_de_wilder_en_boucle(p, 14)) / 2).clip(-20, 20)
    assert (note - attendu).abs().iloc[20:40].max() > 1e-3      # l'écart de démarrage existe bien...
    pd.testing.assert_series_equal(note.iloc[300:], attendu.iloc[300:], check_names=False, atol=1e-6, rtol=0)


def test_rsi_prix_qui_monte_tous_les_jours_suracheté():
    p = pd.Series(np.linspace(100, 200, 100), index=JOURS[:100])
    assert note_rsi(p, 14).iloc[-1] == -20         # RSI 100 -> (50 - 100) / 2 = -25, borné à -20
    assert note_rsi(-p + 300, 14).iloc[-1] == 20    # RSI 0 -> survendu, borné à +20


def test_rsi_seuils_classiques():
    # 3 hausses de 2 pour 7 baisses de 1 dans chaque bloc : le RSI tend vers 6 / (6 + 7) = 46,2
    bloc = [2, 2, 2, -1, -1, -1, -1, -1, -1, -1]
    p = pd.Series(100 + np.cumsum(bloc * 30), index=JOURS[:300], dtype=float)
    assert note_rsi(p, 14).iloc[-50:].mean() == pytest.approx((50 - 600 / 13) / 2, abs=0.5)


def test_bollinger_a_la_main():
    p = prix(0.0005, graine=22)
    moyenne, ecart_type = p.rolling(20).mean(), p.rolling(20).std(ddof=0)
    attendu = (-5 * (p - moyenne) / ecart_type).clip(-20, 20)
    pd.testing.assert_series_equal(note_bollinger(p, 20), attendu)


def test_bollinger_sur_la_bande_basse_note_10():
    # 19 jours à 100 et 101 en alternance, puis une chute : on construit le dernier prix
    # pour qu'il tombe pile à 2 écarts-types sous la moyenne des 20 derniers jours
    debut = [100.0, 101.0] * 9 + [100.0]
    base = pd.Series(debut)
    # On cherche x tel que (x - moyenne) / écart-type = -2, par recherche simple
    bas, haut = 50.0, 100.0
    for _ in range(100):
        x = (bas + haut) / 2
        serie = pd.Series(debut + [x])
        z = (x - serie.mean()) / serie.std(ddof=0)
        bas, haut = (x, haut) if z < -2 else (bas, x)
    p = pd.Series(debut + [x], index=JOURS[:20])
    assert note_bollinger(p, 20).iloc[-1] == pytest.approx(10, abs=1e-6)


def test_retour_a_la_moyenne_apres_une_chute_positif_apres_une_envolee_negatif():
    montee = pd.Series(np.r_[np.full(60, 100.0) + np.tile([0, 1], 30), np.linspace(101, 130, 10)], index=JOURS[:70])
    chute = 200 - montee
    for calcul, duree in ((note_rsi, 14), (note_bollinger, 20)):
        assert calcul(montee, duree).iloc[-1] < -5
        assert calcul(chute, duree).iloc[-1] > 5


def test_retour_a_la_moyenne_prix_plat_note_nulle():
    p = pd.Series(100.0, index=JOURS[:100])
    assert (note_rsi(p, 14).dropna() == 0).all() and note_rsi(p, 14).iloc[20:].notna().all()
    assert (note_bollinger(p, 20).dropna() == 0).all() and note_bollinger(p, 20).iloc[20:].notna().all()


def test_retour_a_la_moyenne_meme_note_quel_que_soit_le_prix():
    a, b = prix(0.001, debut=10), prix(0.001, debut=1000)
    for calcul, duree in ((note_rsi, 14), (note_bollinger, 20)):
        pd.testing.assert_series_equal(calcul(a, duree), calcul(b, duree))


def test_retour_a_la_moyenne_reste_entre_moins_20_et_20():
    for tendance in (-0.01, 0, 0.01):
        details = notes_detecteurs(prix(tendance), detecteurs=[], retour=RETOUR_MOYENNE).dropna()
        assert details.abs().max().max() <= 20


def test_melange_moitie_tendance_moitie_retour():
    p = prix(0.0005, graine=23)
    details = notes_detecteurs(p, retour=RETOUR_MOYENNE)
    assert list(details.columns) == ["16/64", "32/128", "64/256", "RSI 14", "Bollinger 20"]
    tendance = details[["16/64", "32/128", "64/256"]].mean(axis=1)
    retour = details[["RSI 14", "Bollinger 20"]].mean(axis=1)
    for poids in (0.5, 0.25, 0.75):
        attendu = ((1 - poids) * tendance + poids * retour).clip(0, 20)
        obtenu = note_combinee(p, retour=RETOUR_MOYENNE, poids_retour=poids)
        pd.testing.assert_series_equal(obtenu.iloc[400:], attendu.iloc[400:], check_names=False)


def test_retour_a_la_moyenne_seul():
    p = prix(0.0005, graine=24)
    retour = notes_detecteurs(p, detecteurs=[], retour=RETOUR_MOYENNE).mean(axis=1).clip(0, 20)
    obtenu = note_combinee(p, detecteurs=[], retour=RETOUR_MOYENNE, poids_retour=1.0)
    pd.testing.assert_series_equal(obtenu.iloc[400:], retour.iloc[400:], check_names=False)


@pytest.mark.parametrize("facteur", [3, 0.3])
def test_retour_a_la_moyenne_pas_de_triche_avec_le_futur(facteur):
    normal = prix(0.0005, graine=9)
    futur_modifie = normal.copy()
    futur_modifie.iloc[600:] *= facteur
    avec = {"retour": RETOUR_MOYENNE}
    pd.testing.assert_series_equal(note_combinee(normal, **avec).iloc[:600], note_combinee(futur_modifie, **avec).iloc[:600])


def test_sans_retour_a_la_moyenne_la_note_de_la_v2_ne_change_pas():
    p = prix(0.0005, graine=25)
    pd.testing.assert_series_equal(note_combinee(p, retour=(), poids_retour=0.9), note_combinee(p))
