"""La règle du robot, écrite à un seul endroit.

bot.py (le robot) et backtest.py (la simulation sur le passé) utilisent tous les deux
ces fonctions : le robot applique donc exactement la règle qui a été testée.

Aucune fonction ici ne touche à Internet ni au courtier, ce qui permet de les tester
facilement (voir le dossier tests/).
"""
import math

SYMBOLE = "SPY"
FENETRE_SMA = 200          # moyenne des 200 derniers jours de bourse
PART_DU_CAPITAL = 0.95     # on investit 95 % du capital (5 % de marge si le prix monte avant l'exécution)
TOLERANCE_RENFORT = 0.10   # on complète la position seulement s'il manque plus de 10 % de la cible
VARIATION_MAX_JOUR = 0.20  # SPY n'a jamais bougé de 20 % en un jour depuis 1987 : au-delà, donnée suspecte


def calculer_sma(prix, fenetre=FENETRE_SMA):
    """Moyenne des `fenetre` derniers prix de clôture (vide tant qu'il n'y en a pas assez)."""
    return prix.rolling(window=fenetre).mean()


def est_haussier(prix, sma):
    """LA règle : investi quand le prix est au-dessus de sa moyenne 200 jours."""
    return prix > sma


def controler_donnees(prix, derniere_seance, fenetre=FENETRE_SMA):
    """Vérifie les prix de clôture avant toute décision.

    Renvoie la description du problème, ou None si les données sont utilisables.
    """
    if prix is None or len(prix) == 0:
        return "aucune donnée reçue"
    if prix.index.has_duplicates:
        return "dates en double dans les données"
    recents = prix.tail(fenetre)
    if len(recents) < fenetre:
        return f"seulement {len(prix)} jours de données (il en faut {fenetre})"
    if recents.isna().any():
        return "prix manquants dans les derniers jours"
    if (recents <= 0).any():
        return "prix nul ou négatif"
    date_dernier_prix = prix.index[-1].date()
    if date_dernier_prix != derniere_seance:
        return (
            f"données pas à jour : dernier prix du {date_dernier_prix}, "
            f"dernière séance le {derniere_seance}"
        )
    variation = prix.iloc[-1] / prix.iloc[-2] - 1
    if abs(variation) > VARIATION_MAX_JOUR:
        return f"variation suspecte de {variation:+.1%} en un jour"
    return None


def decider(prix, sma, parts_detenues, capital, part=PART_DU_CAPITAL, tolerance=TOLERANCE_RENFORT):
    """Renvoie (action, quantité), action étant "ACHAT", "VENTE", "GARDER" ou "ATTENDRE"."""
    if not (prix > 0 and sma > 0):  # attrape aussi les valeurs vides (NaN)
        raise ValueError(f"prix ({prix}) ou moyenne ({sma}) invalide : aucune décision possible")

    if est_haussier(prix, sma):
        cible = math.floor(capital * part / prix)
        manque = math.floor(cible - parts_detenues)
        if manque >= 1 and manque > cible * tolerance:
            return "ACHAT", manque
        return "GARDER", 0

    if parts_detenues > 0:
        return "VENTE", parts_detenues
    return "ATTENDRE", 0
