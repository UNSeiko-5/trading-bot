"""Expérience EXP-005 : faire atteindre à la v2 l'agitation qu'elle vise déjà (multiplicateur de risque).

Les critères ont été fixés AVANT les tests (EXPERIENCES.md) ; on ne les modifie pas après avoir vu les
résultats. La version « v2 + budget de risque » remplace la v2 comme base à battre seulement si les
10 critères sont réussis : M1 (+0,5 point), M2 (note R/R au moins 90 % de celle de la v2), P1-P3 et R1-R5.
"""
from math import sqrt

from outils_experience import frais_par_an, lancer_experience
from robot.parametres import BUDGET_RISQUE, JOURS_PAR_AN
from robot.simulation import strategie_v2
import robustesse_v2

AVEC_BUDGET = {"budget": BUDGET_RISQUE}
NOM = "v2 + budget de risque"
M2_PART_MIN = 0.90


def variantes_reglages():
    """Les 10 variantes du test R1. Chacune modifie la version « v2 + budget de risque ».
    Les 5 dernières sont exactement celles d'EXP-002."""
    v2 = robustesse_v2.variantes_reglages()
    budget = lambda **changements: {"budget": {**BUDGET_RISQUE, **changements}}
    return {
        "Fenêtre de mesure 1 an": budget(fenetre=252),
        "Fenêtre de mesure 4 ans": budget(fenetre=1008),
        "Borne haute 2": budget(borne_haute=2.0),
        "Borne haute 3": budget(borne_haute=3.0),
        "Sans borne basse": budget(borne_basse=None),
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        **{nom: v2[nom] for nom in ("Agitation visée 10 %", "Agitation visée 14 %",
                                    "Seuil de transaction 1 %", "Seuil de transaction 4 %")},
    }


def informations(ouvertures, clotures, risque):
    r = strategie_v2(ouvertures, clotures, risque=risque, **AVEC_BUDGET)
    m = r.multiplicateur
    agitation = r.valeur.pct_change().std() * sqrt(JOURS_PAR_AN)
    print(f"  Multiplicateur : moyenne {m.mean():.2f}, minimum {m.min():.2f}, maximum {m.max():.2f}"
          f" (à la borne haute {(m >= BUDGET_RISQUE['borne_haute'] - 1e-9).mean():.0%} du temps)")
    print(f"  Part investie en moyenne {r.poids.sum(axis=1).mean():.0%} · agitation réalisée {agitation:.1%}"
          f" (visée 12 %) · frais {frais_par_an(r):.2%}/an")


if __name__ == "__main__":
    lancer_experience("EXP-005", NOM, AVEC_BUDGET, variantes_reglages(), informations, m2_part_min=M2_PART_MIN)
