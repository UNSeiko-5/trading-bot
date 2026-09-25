"""Expérience EXP-006 : EXP-005 (budget de risque) + zone tampon de R. Carver pour échanger moins souvent.

Critères fixés AVANT les tests (EXPERIENCES.md) : les 10 d'EXP-005, contre la v2. On ne les modifie pas
après avoir vu les résultats.
"""
from outils_experience import frais_par_an, lancer_experience
from robot.parametres import BUDGET_RISQUE, JOURS_PAR_AN, TAMPON
from robot.simulation import strategie_v2
import robustesse_v2

AVEC_TAMPON = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
NOM = "v2 + budget + zone tampon"
M2_PART_MIN = 0.90


def variantes_reglages():
    """Les 10 variantes du test R1, chacune modifiant « v2 + budget + zone tampon »."""
    v2 = robustesse_v2.variantes_reglages()
    budget = lambda **changements: {"budget": {**BUDGET_RISQUE, **changements}}
    return {
        "Zone tampon 5 %": {"tampon": 0.05},
        "Zone tampon 20 %": {"tampon": 0.20},
        "Zone tampon sans multiplicateur": {"budget": None},
        "Fenêtre de mesure 1 an": budget(fenetre=252),
        "Fenêtre de mesure 4 ans": budget(fenetre=1008),
        "Borne haute 2": budget(borne_haute=2.0),
        "Borne haute 3": budget(borne_haute=3.0),
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        "Agitation visée 10 %": v2["Agitation visée 10 %"],
        "Agitation visée 14 %": v2["Agitation visée 14 %"],
    }


def informations(ouvertures, clotures, risque):
    for nom, reglage in (("v2", {}), ("EXP-005 (seuil 2 %)", {"budget": BUDGET_RISQUE}), (NOM, AVEC_TAMPON)):
        r = strategie_v2(ouvertures, clotures, risque=risque, **reglage)
        echange = r.rotation.sum() / (len(r.rotation) / JOURS_PAR_AN)
        print(f"  {nom:<28} frais {frais_par_an(r):.2%}/an · montant échangé {echange:.0%} du capital par an"
              f" · investi {r.poids.sum(axis=1).mean():.0%}")


if __name__ == "__main__":
    lancer_experience("EXP-006", NOM, AVEC_TAMPON, variantes_reglages(), informations, m2_part_min=M2_PART_MIN)
