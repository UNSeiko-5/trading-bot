"""Expérience EXP-009 : la v3 + le « cerveau à régimes » de la vidéo (un modèle de Markov caché par actif).

Critères fixés AVANT les tests (EXPERIENCES.md), contre la v3 (base officielle) : M1 note rendement/risque
au moins 10 % meilleure, M2 rendement au plus 0,3 point plus bas, puis P1-P3 et R1-R5 comme toujours.
On ne les modifie pas après avoir vu les résultats.
"""
import numpy as np

from outils_experience import frais_par_an, lancer_experience
from robot.parametres import BUDGET_RISQUE, DEBUT_BACKTEST, JOURS_PAR_AN, REGIMES, TAMPON
from robot.regimes import NOMS, probabilites_regimes, regimes_retenus, rendements_log
from robot.simulation import mesures, strategie_v2

V3 = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
AVEC_REGIMES = {**V3, "regime": REGIMES}
NOM = "v3 + régimes"
M1_NOTE_MIN = 1.10       # note rendement/risque au moins 110 % de celle de la v3
M2_PERTE_MAX = 0.003     # rendement au plus 0,3 point sous celui de la v3


def criteres_mieux(nouvelle, v3):
    """Critères M1 et M2 d'EXP-009 : (nom, réussi, détail)."""
    ecart = nouvelle["rendement_annuel"] - v3["rendement_annuel"]
    return [
        ("M1 Note rendement/risque au moins 10 % meilleure que la v3",
         nouvelle["note_rendement_risque"] >= M1_NOTE_MIN * v3["note_rendement_risque"] - 1e-9,
         f"{nouvelle['note_rendement_risque']:.2f} contre {v3['note_rendement_risque']:.2f}"
         f" (seuil {M1_NOTE_MIN * v3['note_rendement_risque']:.2f})"),
        ("M2 Rendement au plus 0,3 point sous celui de la v3", ecart >= -M2_PERTE_MAX - 1e-9,   # -0,3 pile : réussi
         f"{nouvelle['rendement_annuel']:+.1%} contre {v3['rendement_annuel']:+.1%} ({ecart * 100:+.2f} point)"),
    ]


def variantes_reglages():
    """Les 10 variantes du test R1, chacune modifiant « v3 + régimes »."""
    regime = lambda **changements: {"regime": {**REGIMES, **changements}}
    return {
        "2 régimes": regime(etats=2),
        "4 régimes": regime(etats=4),
        "Sans filtre de stabilité": regime(stabilite=1),
        "Stabilité 5 jours": regime(stabilite=5),
        "Tout en cash si agité (x0)": regime(facteur_agite=0.0),
        "Réduction légère (x0,75)": regime(facteur_agite=0.75),
        "Apprentissage sur 1 an": regime(fenetre=252),
        "Apprentissage sur 4 ans": regime(fenetre=1008),
        "Réapprentissage chaque mois": regime(reapprentissage=21),
        "Version probabilités": regime(probabilites=True),
    }


def statistiques_regimes(prix, regime=REGIMES, debut=DEBUT_BACKTEST):
    """Part du temps passée dans chaque régime et nombre de changements par an, depuis `debut`."""
    probas = probabilites_regimes(rendements_log(prix), regime["etats"], regime["fenetre"], regime["reapprentissage"])
    retenus = regimes_retenus(probas, regime["stabilite"]).loc[debut:].dropna()
    if retenus.empty:
        return None
    parts = [float((retenus == k).mean()) for k in range(regime["etats"])]
    changements = int((retenus.diff().fillna(0) != 0).sum()) / (len(retenus) / JOURS_PAR_AN)
    return parts, changements


def informations(ouvertures, clotures, risque):
    noms = NOMS[REGIMES["etats"]]
    print(f"  Régimes depuis {DEBUT_BACKTEST[:4]} (part du temps) :")
    for symbole in clotures.columns:
        stats = statistiques_regimes(clotures[symbole])
        if stats:
            parts, changements = stats
            print(f"    {symbole:<8} " + " · ".join(f"{nom} {p:.0%}" for nom, p in zip(noms, parts))
                  + f" · {changements:.1f} changements par an")
    for nom, reglage in (("v3", V3), (NOM, AVEC_REGIMES)):
        r = strategie_v2(ouvertures, clotures, risque=risque, **reglage)
        m = mesures(r.valeur)
        echange = r.rotation.sum() / (len(r.rotation) / JOURS_PAR_AN)
        multiplicateur = f" · multiplicateur moyen {np.mean(r.multiplicateur):.2f}" if r.multiplicateur is not None else ""
        print(f"  {nom:<14} frais {frais_par_an(r):.2%}/an · échangé {echange:.0%}/an · investi {r.poids.sum(axis=1).mean():.0%}"
              f" · Sharpe {m['sharpe']:.2f}{multiplicateur}")


if __name__ == "__main__":
    lancer_experience("EXP-009", NOM, AVEC_REGIMES, variantes_reglages(), informations,
                      base_reglage=V3, base_nom="v3", criteres_mieux=criteres_mieux)
