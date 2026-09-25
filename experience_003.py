"""Expérience EXP-003 : la v2 + 3 détecteurs de cassure (canal de Donchian) dans la note combinée.

Résultat (EXPERIENCES.md) : 8/10, cassures non retenues. Ce script permet de refaire le test.
Les critères ont été fixés AVANT les tests ; on ne les modifie pas après avoir vu les résultats.
"""
from statistics import mean

from outils_experience import lancer_experience
from robot.parametres import CASSURES, DEBUT_BACKTEST, DETECTEURS
from robot.signaux import notes_detecteurs
import robustesse_v2

AVEC_CASSURES = {"cassures": CASSURES}
NOM = "v2 + cassures"


def variantes_reglages():
    """Les 10 variantes du test R1. Chacune modifie la version « v2 + cassures ».
    Les 5 dernières sont exactement celles d'EXP-002 ; les facteurs de cassure sont ceux publiés."""
    v2 = robustesse_v2.variantes_reglages()
    return {
        "Cassures seules": {"detecteurs": []},
        "Horizon court seul (16/64 + 40)": {"detecteurs": [DETECTEURS[0]], "cassures": [CASSURES[0]]},
        "Horizon long seul (64/256 + 160)": {"detecteurs": [DETECTEURS[-1]], "cassures": [CASSURES[-1]]},
        "Cassures 20, 40, 80 jours": {"cassures": [(20, 0.67), (40, 0.70), (80, 0.73)]},
        "Cassures 80, 160, 320 jours": {"cassures": [(80, 0.73), (160, 0.74), (320, 0.74)]},
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        **{nom: v2[nom] for nom in ("Agitation visée 10 %", "Agitation visée 14 %",
                                    "Seuil de transaction 1 %", "Seuil de transaction 4 %")},
    }


def lien_et_echelle(clotures, cassures=CASSURES, debut=DEBUT_BACKTEST):
    """Pour information : lien moyen (corrélation) entre la note des cassures et celle des moyennes,
    et note moyenne des cassures en valeur absolue (visée : environ 10)."""
    liens, echelles = [], []
    for symbole in clotures.columns:
        details = notes_detecteurs(clotures[symbole], cassures=cassures).loc[debut:].dropna()
        if len(details) < 2:
            continue
        colonnes_cassures = [col for col in details.columns if col.startswith("cassure")]
        liens.append(details[colonnes_cassures].mean(axis=1).corr(details.drop(columns=colonnes_cassures).mean(axis=1)))
        echelles.append(details[colonnes_cassures].abs().stack().mean())
    return mean(liens), mean(echelles)


def informations(ouvertures, clotures, risque):
    lien, echelle = lien_et_echelle(clotures)
    print(f"  Lien moyen entre cassures et moyennes = {lien:.2f} (1 = identiques) ;"
          f" note moyenne des cassures = {echelle:.1f} (visé : environ 10)")


if __name__ == "__main__":
    lancer_experience("EXP-003", NOM, AVEC_CASSURES, variantes_reglages(), informations)
