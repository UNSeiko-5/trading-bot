"""Expérience EXP-011 : la v3 sur un panier élargi de 21 marchés (11 ajouts choisis avant les tests).

Critères fixés AVANT les tests (EXPERIENCES.md) : les 10 d'EXP-006, contre la v3 sur ses 10 actifs (même
période, mêmes données). On ne les modifie pas après avoir vu les résultats.
"""
from outils_experience import frais_par_an, lancer_experience
from robot.parametres import BUDGET_RISQUE, JOURS_PAR_AN, TAMPON
from robot.simulation import strategie_v2
from robot.univers import UNIVERS, UNIVERS_ELARGI
import robustesse_v2

V3 = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
NOM = "v3 sur 21 marchés"
SYMBOLES = [a.symbole for a in UNIVERS_ELARGI]
BASE = [a.symbole for a in UNIVERS]


def variantes_reglages():
    """Les 10 variantes du test R1 (celles d'EXP-006), chacune modifiant la v3 sur 21 marchés."""
    v2 = robustesse_v2.variantes_reglages()
    budget = lambda **changements: {"budget": {**BUDGET_RISQUE, **changements}}
    return {
        "Zone tampon 5 %": {"tampon": 0.05},
        "Zone tampon 20 %": {"tampon": 0.20},
        "Sans multiplicateur": {"budget": None},
        "Fenêtre de mesure 1 an": budget(fenetre=252),
        "Fenêtre de mesure 4 ans": budget(fenetre=1008),
        "Borne haute 2": budget(borne_haute=2.0),
        "Borne haute 3": budget(borne_haute=3.0),
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        "Agitation visée 10 %": v2["Agitation visée 10 %"],
        "Agitation visée 14 %": v2["Agitation visée 14 %"],
    }


def informations(ouvertures, clotures, risque):
    for nom, colonnes in (("v3 (10 actifs)", BASE), (NOM, list(clotures.columns))):
        r = strategie_v2(ouvertures[colonnes], clotures[colonnes], details=True, **V3)
        annees = len(r.valeur) / JOURS_PAR_AN
        echange = r.rotation.sum() / annees
        print(f"  {nom:<18} investi {r.poids.sum(axis=1).mean():.0%} · {len(r.ordres) / annees:.0f} ordres/an"
              f" · échangé {echange:.0%}/an · frais {frais_par_an(r):.2%}/an")
    dernier = r.poids.iloc[-1]
    print("  Parts du dernier jour (21 marchés) : "
          + ", ".join(f"{s} {p:.0%}" for s, p in dernier[dernier > 0.005].sort_values(ascending=False).items()))


if __name__ == "__main__":
    lancer_experience("EXP-011", NOM, V3, variantes_reglages(), informations, base_reglage=V3, base_nom="v3",
                      symboles=SYMBOLES, base_symboles=BASE)
