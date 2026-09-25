"""Expérience EXP-004 : la v2 mélangée à moitié avec du retour à la moyenne (RSI 14 jours, Bollinger 20 jours).

Les critères ont été fixés AVANT les tests (EXPERIENCES.md) ; on ne les modifie pas après avoir vu les
résultats. La version « v2 + retour moyenne » remplace la v2 comme base à battre seulement si les
10 critères sont réussis : M1-M2 (mieux que la v2), P1-P3 et R1-R5 (mêmes seuils qu'EXP-002).
"""
from statistics import mean

from outils_experience import frais_par_an, lancer_experience
from robot.parametres import DEBUT_BACKTEST, POIDS_RETOUR_MOYENNE, RETOUR_MOYENNE
from robot.signaux import notes_detecteurs
from robot.simulation import mesures, strategie_v2
import robustesse_v2

AVEC_RETOUR = {"retour": RETOUR_MOYENNE, "poids_retour": POIDS_RETOUR_MOYENNE}
NOM = "v2 + retour moyenne"


def variantes_reglages():
    """Les 11 variantes du test R1. Chacune modifie la version « v2 + retour moyenne ».
    Les 5 dernières sont exactement celles d'EXP-002."""
    v2 = robustesse_v2.variantes_reglages()
    return {
        "RSI seul": {"retour": [("RSI", 14)]},
        "Bollinger seul": {"retour": [("Bollinger", 20)]},
        "Durées doublées (28, 40)": {"retour": [("RSI", 28), ("Bollinger", 40)]},
        "Durées divisées par 2 (7, 10)": {"retour": [("RSI", 7), ("Bollinger", 10)]},
        "Retour à la moyenne 25 %": {"poids_retour": 0.25},
        "Retour à la moyenne 75 %": {"poids_retour": 0.75},
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        **{nom: v2[nom] for nom in ("Agitation visée 10 %", "Agitation visée 14 %",
                                    "Seuil de transaction 1 %", "Seuil de transaction 4 %")},
    }


def lien_et_echelle(clotures, retour=RETOUR_MOYENNE, debut=DEBUT_BACKTEST):
    """Lien moyen (corrélation) entre la note de retour à la moyenne et celle de la tendance,
    et note moyenne du retour à la moyenne en valeur absolue (comparée à environ 10)."""
    liens, echelles = [], []
    colonnes_retour = [f"{indicateur} {duree}" for indicateur, duree in retour]
    for symbole in clotures.columns:
        details = notes_detecteurs(clotures[symbole], retour=retour).loc[debut:].dropna()
        if len(details) < 2:
            continue
        liens.append(details[colonnes_retour].mean(axis=1).corr(details.drop(columns=colonnes_retour).mean(axis=1)))
        echelles.append(details[colonnes_retour].abs().stack().mean())
    return mean(liens), mean(echelles)


def informations(ouvertures, clotures, risque):
    lien, echelle = lien_et_echelle(clotures)
    print(f"  Lien moyen entre retour à la moyenne et tendance = {lien:+.2f} (1 = identiques, -1 = opposés) ;"
          f" note moyenne du retour à la moyenne = {echelle:.1f} (comparée à environ 10)")
    seul = strategie_v2(ouvertures, clotures, risque=risque, detecteurs=[], retour=RETOUR_MOYENNE, poids_retour=1.0)
    print(robustesse_v2.ligne("Retour à la moyenne seul", mesures(seul.valeur))
          + f"   investi {seul.poids.sum(axis=1).mean():.0%}, frais {frais_par_an(seul):.2%}/an")


if __name__ == "__main__":
    lancer_experience("EXP-004", NOM, AVEC_RETOUR, variantes_reglages(), informations)
