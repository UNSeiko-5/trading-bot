"""Signaux de tendance de la v2 (docs/STRATEGIE_V2.md, section 4).

Pour chaque actif, 3 détecteurs comparent une moyenne rapide et une moyenne lente du prix.
Leurs notes sont combinées en une seule note de 0 (cash) à 20 (tendance très forte).
En option : des détecteurs de cassure s'ajoutent à la moyenne (EXP-003), et des détecteurs de
retour à la moyenne peuvent être mélangés à la tendance (EXP-004).

`python -m robot.signaux` affiche les notes du jour et leur historique depuis 2007.
"""
import pandas as pd

from robot.parametres import (
    DEBUT_BACKTEST, DETECTEURS, FENETRE_VOL, JOURS_MIN_HISTORIQUE, NOTE_MAX, POIDS_RETOUR_MOYENNE,
)


def agitation_prix(prix, fenetre=FENETRE_VOL):
    """Agitation récente du prix : écart-type des variations quotidiennes, en unités de prix
    (moyenne exponentielle sur `fenetre` jours)."""
    return prix.diff().ewm(span=fenetre, min_periods=fenetre).std()


def note_detecteur(prix, rapide, lente, facteur, fenetre_vol=FENETRE_VOL):
    """Note d'un détecteur, entre -20 et +20 : positive si la moyenne rapide est au-dessus de la lente.

    L'écart est divisé par l'agitation du prix : une hausse de 5 $ n'a pas le même sens
    sur un actif calme et sur un actif agité. Le facteur ramène la note moyenne vers 10.
    """
    ecart = prix.ewm(span=rapide, min_periods=rapide).mean() - prix.ewm(span=lente, min_periods=lente).mean()
    return (ecart / agitation_prix(prix, fenetre_vol) * facteur).clip(-NOTE_MAX, NOTE_MAX)


def note_cassure(prix, duree, facteur):
    """Note d'un détecteur de cassure (canal de Donchian, règle « breakout » de R. Carver), entre -20 et +20.

    Le canal va du plus bas au plus haut des `duree` dernières clôtures. Tout en haut du canal
    (le prix vient de casser vers le haut) : +20 avant le facteur ; au milieu : 0 ; tout en bas : -20.
    La position est lissée sur `duree`/4 jours, puis le facteur ramène la note moyenne vers 10.
    """
    haut = prix.rolling(duree, min_periods=duree).max()
    bas = prix.rolling(duree, min_periods=duree).min()
    position = 40 * (prix - (haut + bas) / 2) / (haut - bas)
    position = position.where(haut != bas, 0.0)   # prix parfaitement plat : ni hausse ni baisse
    lissage = max(duree // 4, 1)
    return (position.ewm(span=lissage, min_periods=lissage).mean() * facteur).clip(-NOTE_MAX, NOTE_MAX)


def note_rsi(prix, duree):
    """Retour à la moyenne avec le RSI de Wilder, entre -20 et +20.

    RSI = part des hausses dans les variations récentes (moyenne de Wilder sur `duree` jours), de 0 à 100.
    Note = (50 - RSI) / 2 : RSI 30 (« survendu ») -> +10, RSI 70 (« suracheté ») -> -10.
    """
    variation = prix.diff()
    lissage = {"alpha": 1 / duree, "min_periods": duree, "adjust": False}
    hausses = variation.clip(lower=0).ewm(**lissage).mean()
    baisses = (-variation).clip(lower=0).ewm(**lissage).mean()
    total = hausses + baisses
    rsi = (100 * hausses / total).where(total != 0, 50.0)   # prix parfaitement plat : ni survendu ni suracheté
    return ((50 - rsi) / 2).clip(-NOTE_MAX, NOTE_MAX)


def note_bollinger(prix, duree):
    """Retour à la moyenne avec les bandes de Bollinger, entre -20 et +20.

    Écart = (prix - moyenne des `duree` dernières clôtures) / écart-type de ces clôtures.
    Note = -5 x écart : sur la bande basse (-2 écarts-types) -> +10, sur la bande haute -> -10.
    """
    moyenne = prix.rolling(duree, min_periods=duree).mean()
    ecart_type = prix.rolling(duree, min_periods=duree).std(ddof=0)
    ecart = ((prix - moyenne) / ecart_type).where(ecart_type != 0, 0.0)
    return (-5 * ecart).clip(-NOTE_MAX, NOTE_MAX)


RETOUR = {"RSI": note_rsi, "Bollinger": note_bollinger}


def notes_detecteurs(prix, detecteurs=DETECTEURS, cassures=(), retour=()):
    """Les notes de chaque détecteur, une colonne par détecteur : « rapide/lente » pour les moyennes,
    « cassure N » pour les cassures, « RSI N » ou « Bollinger N » pour le retour à la moyenne."""
    colonnes = {f"{rapide}/{lente}": note_detecteur(prix, rapide, lente, facteur) for rapide, lente, facteur in detecteurs}
    colonnes.update({f"cassure {duree}": note_cassure(prix, duree, facteur) for duree, facteur in cassures})
    colonnes.update({f"{indicateur} {duree}": RETOUR[indicateur](prix, duree) for indicateur, duree in retour})
    return pd.DataFrame(colonnes)


def note_combinee(prix, detecteurs=DETECTEURS, jours_min=JOURS_MIN_HISTORIQUE, cassures=(), retour=(),
                  poids_retour=POIDS_RETOUR_MOYENNE):
    """Note des détecteurs, ramenée entre 0 et 20 (0 = cash : on ne parie pas à la baisse).

    Sans retour à la moyenne : moyenne des détecteurs de tendance (moyennes et cassures).
    Avec : (1 - poids_retour) x moyenne de la tendance + poids_retour x moyenne du retour à la moyenne.
    Vide tant que l'actif n'a pas `jours_min` jours de données.
    """
    details = notes_detecteurs(prix, detecteurs, cassures, retour)
    colonnes_retour = [f"{indicateur} {duree}" for indicateur, duree in retour]
    tendance = details.drop(columns=colonnes_retour).mean(axis=1, skipna=False)
    if not retour:
        moyenne = tendance
    else:
        retour_moyenne = details[colonnes_retour].mean(axis=1, skipna=False)
        moyenne = retour_moyenne if poids_retour == 1 else (1 - poids_retour) * tendance + poids_retour * retour_moyenne
    anciennete = prix.notna().cumsum()
    return moyenne.clip(0, NOTE_MAX).where(anciennete >= jours_min)


def notes(clotures, detecteurs=DETECTEURS, jours_min=JOURS_MIN_HISTORIQUE, cassures=(), retour=(),
          poids_retour=POIDS_RETOUR_MOYENNE):
    """Note combinée de chaque actif, chaque jour (une colonne par actif)."""
    return pd.DataFrame({
        symbole: note_combinee(clotures[symbole], detecteurs, jours_min, cassures, retour, poids_retour)
        for symbole in clotures.columns
    })


def afficher(clotures):
    from robot.univers import PAR_SYMBOLE

    periode = clotures.loc[DEBUT_BACKTEST:]
    notes_jour = notes(clotures)
    date = clotures.index[-1].date()
    print(f"SIGNAUX v2 — notes de tendance au {date}")
    print("(0 = cash, 10 = tendance haussière normale, 20 = très forte)\n")
    entete = "  ".join(f"{r}/{l}".rjust(7) for r, l, _ in DETECTEURS)
    print(f"  {'Actif':<42} {entete}    Note   Haussier depuis {DEBUT_BACKTEST[:4]}")

    moyennes_abs = []
    for symbole in clotures.columns:
        details = notes_detecteurs(clotures[symbole])
        moyennes_abs.append(details.loc[DEBUT_BACKTEST:].abs().stack().mean())
        note = notes_jour[symbole].loc[periode.index]
        part_haussiere = (note > 0).sum() / note.notna().sum() if note.notna().any() else float("nan")
        colonnes = "  ".join(f"{v:+7.1f}" for v in details.iloc[-1])
        print(f"  {symbole:<8} {PAR_SYMBOLE[symbole].nom:<33} {colonnes}   {notes_jour[symbole].iloc[-1]:5.1f}"
              f"   {part_haussiere:.0%} du temps")

    print(f"\nContrôle d'échelle : note moyenne des détecteurs (valeur absolue, depuis {DEBUT_BACKTEST[:4]})"
          f" = {pd.Series(moyennes_abs).mean():.1f} (visé : environ 10)")


if __name__ == "__main__":
    from robot.donnees import charger

    afficher(charger().clotures)
