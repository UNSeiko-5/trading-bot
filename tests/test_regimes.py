"""Tests des régimes de marché (EXP-009) : robot/regimes.py, branchement dans la stratégie, experience_009.py."""
import numpy as np
import pandas as pd
import pytest

import robustesse_v2
from experience_009 import AVEC_REGIMES, M1_NOTE_MIN, M2_PERTE_MAX, V3, criteres_mieux, statistiques_regimes, variantes_reglages
from robot.parametres import BUDGET_RISQUE, REGIMES, TAMPON
from robot.portefeuille import preparer_risque
from robot.regimes import (
    _CACHE, apprendre, appliquer_regime, facteur_regime, filtrer, probabilites_regimes, regimes_retenus, rendements_log,
)
from robot.signaux import notes as calculer_notes
from robot.simulation import strategie_v2


def rendements_a_regimes(graine=0, blocs=20):
    """Alternance de périodes calmes (0,6 % par jour) et agitées (2,5 %) : on sait quel jour est agité."""
    aleatoire = np.random.default_rng(graine)
    r, agite = [], []
    for k in range(blocs):
        n = int(aleatoire.integers(60, 150))
        r.append(aleatoire.normal(-0.001 if k % 2 else 0.0005, 0.025 if k % 2 else 0.006, n))
        agite += [bool(k % 2)] * n
    return np.concatenate(r), np.array(agite)


def prix_depuis(r, debut="2005-01-03"):
    return pd.Series(100 * np.exp(np.cumsum(np.r_[0.0, r])), index=pd.bdate_range(debut, periods=len(r) + 1))


def test_retrouve_les_regimes_caches():
    r, agite = rendements_a_regimes()
    modele = apprendre(r, 2)
    assert modele.ecarts == pytest.approx([0.006, 0.025], rel=0.1)
    assert (np.diff(modele.ecarts) > 0).all()                          # rangés du plus calme au plus agité
    assert np.allclose(modele.transitions.sum(axis=1), 1) and modele.transitions[0, 0] > 0.95   # régimes durables
    assert ((filtrer(r, modele)[:, 1] > 0.5) == agite).mean() > 0.9


def test_trois_regimes_ranges_par_agitation_et_probabilites_valides():
    r, _ = rendements_a_regimes(1)
    modele = apprendre(r, 3)
    assert (np.diff(modele.ecarts) > 0).all()
    probas = filtrer(r, modele)
    assert np.allclose(probas.sum(axis=1), 1) and (probas >= 0).all()


def test_apprentissage_et_decision_calculent_le_meme_forward():
    """L'apprentissage utilise un calcul groupé (plus rapide) ; la décision, la boucle jour par jour. Même résultat."""
    from robot.regimes import _avant, _avant_arriere, _vraisemblances

    r, _ = rendements_a_regimes(11)
    modele = apprendre(r[:504], 3)
    b, _ = _vraisemblances(r[:504], modele.moyennes, modele.ecarts)
    alpha_boucle, c = _avant(b, modele.transitions, modele.depart)
    alpha_groupe, beta, vraisemblance = _avant_arriere(b, modele.transitions, modele.depart)
    np.testing.assert_allclose(alpha_groupe, alpha_boucle, atol=1e-12)
    assert vraisemblance == pytest.approx(np.log(c).sum())
    np.testing.assert_allclose(beta.sum(axis=1), 1)


def test_apprentissage_toujours_identique():
    r, _ = rendements_a_regimes(2)
    a, b = apprendre(r, 3), apprendre(r, 3)
    np.testing.assert_array_equal(a.ecarts, b.ecarts)
    np.testing.assert_array_equal(a.transitions, b.transitions)


def test_supporte_un_krach_enorme_et_un_prix_plat():
    r, _ = rendements_a_regimes(3)
    r[500] = -0.5                                                      # -40 % en un jour
    probas = filtrer(r, apprendre(r, 3))
    assert np.isfinite(probas).all()
    plat = apprendre(np.zeros(300), 3)                                 # aucune variation : pas de division par zéro
    assert np.isfinite(plat.ecarts).all() and (plat.ecarts > 0).all()


def test_sans_triche_avec_le_futur():
    """LE test clé (vidéo et règle d'or) : changer les prix après un jour ne change rien avant ce jour.
    Il échoue si on remplace l'algorithme « forward » par « forward-backward », qui lit toute la série."""
    r, _ = rendements_a_regimes(4)
    prix = prix_depuis(r)
    futur = prix.copy()
    futur.iloc[1200:] *= np.exp(np.cumsum(np.random.default_rng(9).normal(0, 0.04, len(futur) - 1200)))
    reglage = {**REGIMES, "reapprentissage": 50}
    coupe = prix.index[1199]
    for regime in (reglage, {**reglage, "probabilites": True}):
        pd.testing.assert_series_equal(facteur_regime(prix, **regime).loc[:coupe], facteur_regime(futur, **regime).loc[:coupe])
    probas, probas_futur = (probabilites_regimes(rendements_log(p), 3, 504, 50) for p in (prix, futur))
    pd.testing.assert_frame_equal(probas.loc[:coupe], probas_futur.loc[:coupe])


def test_rien_avant_le_premier_apprentissage():
    r, _ = rendements_a_regimes(5)
    prix = prix_depuis(r)
    probas = probabilites_regimes(rendements_log(prix), 3, 504, 126)
    assert probas.iloc[:504].isna().all().all()                        # 1er prix sans rendement + 503 rendements
    assert probas.iloc[504:].notna().all().all()
    assert (facteur_regime(prix).iloc[:504] == 1).all()


def test_le_modele_du_jour_n_utilise_que_la_fenetre_passee(monkeypatch):
    import robot.regimes as regimes

    vus = []
    original = regimes.apprendre
    monkeypatch.setattr(regimes, "apprendre", lambda r, etats: (vus.append(len(r)), original(r, etats))[1])
    regimes._probabilites_compactes(rendements_a_regimes(6)[0][:800], 2, 300, 100)
    assert vus == [300] * 6                                            # jours 299, 399, 499, 599, 699, 799


def test_filtre_de_stabilite():
    plus_probables = [0, 0, 2, 2, 0, 2, 2, 2, 1, 2, 2, 2]
    probas = pd.DataFrame(np.eye(3)[plus_probables])
    probas.iloc[0] = np.nan
    attendu = [np.nan, np.nan, np.nan, np.nan, np.nan, np.nan, np.nan, 2, 2, 2, 2, 2]
    np.testing.assert_array_equal(regimes_retenus(probas, 3).to_numpy(), attendu)
    np.testing.assert_array_equal(regimes_retenus(probas, 1).to_numpy()[1:], plus_probables[1:])


def test_facteur_agite_et_version_probabilites():
    r, agite = rendements_a_regimes(7, blocs=30)
    prix = prix_depuis(r)
    facteur = facteur_regime(prix, **{**REGIMES, "etats": 2})
    agite = pd.Series(np.r_[False, agite], index=prix.index)
    suivis = facteur.iloc[600:]
    assert set(suivis.unique()) <= {0.5, 1.0}
    assert suivis[agite.iloc[600:]].mean() < 0.65 and suivis[~agite.iloc[600:]].mean() > 0.95
    probabilites = facteur_regime(prix, **{**REGIMES, "etats": 2, "probabilites": True})
    assert probabilites.between(0.5, 1).all() and probabilites.iloc[600:].nunique() > 10


def test_cache_meme_resultat_et_series_differentes():
    r, _ = rendements_a_regimes(8)
    a = probabilites_regimes(rendements_log(prix_depuis(r)))
    taille = len(_CACHE)
    b = probabilites_regimes(rendements_log(prix_depuis(r)))
    assert len(_CACHE) == taille
    pd.testing.assert_frame_equal(a, b)
    autre = probabilites_regimes(rendements_log(prix_depuis(r * 1.5)))
    assert len(_CACHE) == taille + 1 and not autre.equals(a)


def marche(graine=0, jours=1500):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    ecarts = np.array([0.012, 0.013, 0.005, 0.01, 0.04])
    agite = (np.arange(jours) // 150) % 3 == 2                           # un tiers du temps, agitation x3
    r = aleatoire.normal(0.0003, 1, (jours, 5)) * ecarts * np.where(agite, 3, 1)[:, None]
    c = pd.DataFrame(100 * np.cumprod(1 + r, axis=0), index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c) * (1 + aleatoire.normal(0, 0.002, c.shape)), c


def test_notes_divisees_par_deux_en_regime_agite():
    o, c = marche()
    notes = calculer_notes(c)
    filtrees = appliquer_regime(notes, c, REGIMES)
    rapport = (filtrees / notes).where(notes > 0)
    assert set(np.round(rapport.stack().dropna().unique(), 6)) <= {0.5, 1.0}
    assert (rapport == 0.5).any().any()
    pd.testing.assert_frame_equal(appliquer_regime(notes, c, None), notes)


def test_sans_regime_la_v3_ne_change_pas():
    o, c = marche(1)
    debut = c.index[600]
    pd.testing.assert_series_equal(strategie_v2(o, c, debut=debut, regime=None, **V3).valeur,
                                   strategie_v2(o, c, debut=debut, **V3).valeur)


def test_moins_investi_en_periode_agitee_et_garde_fous():
    o, c = marche(2)
    debut = c.index[600]
    avec = strategie_v2(o, c, debut=debut, **AVEC_REGIMES)
    sans = strategie_v2(o, c, debut=debut, **V3)
    agite = pd.Series((np.arange(len(c)) // 150) % 3 == 2, index=c.index).loc[debut:]
    assert (avec.poids.sum(axis=1) <= 1 + 1e-6).all() and (avec.poids["BTC-USD"] <= 0.17).all()
    assert avec.poids.sum(axis=1)[agite].mean() < sans.poids.sum(axis=1)[agite].mean()


def test_strategie_avec_regime_sans_triche_avec_le_futur():
    o, c = marche(3)
    debut = c.index[600]
    normal = strategie_v2(o, c, debut=debut, **AVEC_REGIMES).valeur
    o2, c2 = o.copy(), c.copy()
    o2.iloc[1200:] *= 0.5
    c2.iloc[1200:] *= 0.5
    coupe = c.index[1199]
    pd.testing.assert_series_equal(normal.loc[:coupe], strategie_v2(o2, c2, debut=debut, **AVEC_REGIMES).valeur.loc[:coupe])


def test_le_hasard_decale_tendance_et_regime_ensemble(monkeypatch):
    o, c = marche(4)
    notes = robustesse_v2.notes_du_reglage(c, AVEC_REGIMES)
    pd.testing.assert_frame_equal(notes, appliquer_regime(calculer_notes(c), c, REGIMES))
    vus = []
    monkeypatch.setattr(robustesse_v2, "R5_TIRAGES", 2)
    original = robustesse_v2.decaler_au_hasard
    monkeypatch.setattr(robustesse_v2, "decaler_au_hasard", lambda n, a: (vus.append(n.equals(notes)), original(n, a))[1])
    robustesse_v2.test_r5(o, c, preparer_risque(c), {"note_rendement_risque": 0.5, "rendement_annuel": 0.05}, AVEC_REGIMES)
    assert vus == [True, True]


def test_reglages_fixes_dans_experiences_md():
    assert REGIMES == {"etats": 3, "fenetre": 504, "reapprentissage": 126, "stabilite": 3, "facteur_agite": 0.5,
                       "probabilites": False}
    assert V3 == {"budget": BUDGET_RISQUE, "tampon": TAMPON} and AVEC_REGIMES == {**V3, "regime": REGIMES}


def test_10_variantes_r1():
    v = variantes_reglages()
    assert len(v) == 10
    changements = {nom: {cle: val for cle, val in reglage["regime"].items() if REGIMES[cle] != val}
                   for nom, reglage in v.items()}
    assert changements == {
        "2 régimes": {"etats": 2}, "4 régimes": {"etats": 4},
        "Sans filtre de stabilité": {"stabilite": 1}, "Stabilité 5 jours": {"stabilite": 5},
        "Tout en cash si agité (x0)": {"facteur_agite": 0.0}, "Réduction légère (x0,75)": {"facteur_agite": 0.75},
        "Apprentissage sur 1 an": {"fenetre": 252}, "Apprentissage sur 4 ans": {"fenetre": 1008},
        "Réapprentissage chaque mois": {"reapprentissage": 21}, "Version probabilités": {"probabilites": True},
    }


def m(rendement, note):
    return {"rendement_annuel": rendement, "note_rendement_risque": note}


@pytest.mark.parametrize("nouvelle, attendu", [
    (m(0.078, 0.74), [True, True]),      # note +10 % pile (0,67 x 1,1 = 0,737), même rendement
    (m(0.075, 0.80), [True, True]),      # -0,3 point pile : réussi
    (m(0.074, 0.80), [True, False]),     # -0,4 point : trop de rendement perdu
    (m(0.090, 0.73), [False, True]),     # plus de rendement, mais note +9 % seulement
])
def test_criteres_mieux_que_la_v3(nouvelle, attendu):
    assert M1_NOTE_MIN == 1.10 and M2_PERTE_MAX == 0.003
    assert [ok for _, ok, _ in criteres_mieux(nouvelle, m(0.078, 0.67))] == attendu


def test_statistiques_des_regimes():
    r, _ = rendements_a_regimes(10, blocs=30)
    parts, changements = statistiques_regimes(prix_depuis(r), debut="2005-01-01")
    assert sum(parts) == pytest.approx(1) and len(parts) == 3 and changements > 0
    assert statistiques_regimes(prix_depuis(r[:300]), debut="2005-01-01") is None   # trop court : pas de régime
