"""Expérience EXP-008 : la v3 avec le cash placé dans un fonds monétaire (taux à 3 mois de la veille).

Critères fixés AVANT les tests (EXPERIENCES.md) : base = la v3, M1 à +0,2 point, M2 à 100 %,
P1-P3 et R1-R5 comme EXP-006. On ne les modifie pas après avoir vu les résultats.
"""
from experience_006 import AVEC_TAMPON, variantes_reglages as variantes_006
from outils_experience import frais_par_an, lancer_experience
from robot.donnees import charger, rendement_monetaire
from robot.parametres import JOURS_PAR_AN
from robot.simulation import strategie_v2

NOM = "v3 + cash rémunéré"
M1_GAIN_MIN = 0.002
M2_PART_MIN = 1.0


def reglage_avec_cash(monetaire):
    return {**AVEC_TAMPON, "monetaire": monetaire}


def variantes_reglages():
    """Les 10 variantes d'EXP-006 ; le cash rémunéré vient du réglage de base (chaque variante le garde)."""
    return variantes_006()


def informations_pour(monetaire):
    def informations(ouvertures, clotures, risque):
        v3 = strategie_v2(ouvertures, clotures, risque=risque, **AVEC_TAMPON)
        avec = strategie_v2(ouvertures, clotures, risque=risque, **reglage_avec_cash(monetaire))
        jours = avec.valeur.index
        annees = len(jours) / JOURS_PAR_AN
        taux = monetaire.reindex(jours).fillna(0).mean() * JOURS_PAR_AN
        cash = 1 - avec.poids.sum(axis=1).mean()
        gain = (avec.valeur.iloc[-1] / v3.valeur.iloc[-1]) ** (1 / annees) - 1
        print(f"  Taux net moyen du fonds : {taux:.2%}/an · part moyenne en cash : {cash:.0%}"
              f" · gain apporté par le cash : {gain:+.2%}/an")
        print(f"  Frais : {frais_par_an(avec):.2%}/an avec le fonds (v3 : {frais_par_an(v3):.2%}/an)")
    return informations


if __name__ == "__main__":
    donnees = charger()
    monetaire = rendement_monetaire(donnees.clotures.index)
    lancer_experience("EXP-008", NOM, reglage_avec_cash(monetaire), variantes_reglages(), informations_pour(monetaire),
                      m2_part_min=M2_PART_MIN, base_reglage=AVEC_TAMPON, base_nom="v3", m1_gain_min=M1_GAIN_MIN,
                      donnees=donnees)
