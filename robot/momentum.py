"""EXP-013 : double momentum de G. Antonacci (« Global Equities Momentum », Dual Momentum Investing, 2014).

Chaque fin de mois, à la clôture :
- momentum absolu : si SPY a fait mieux sur 12 mois que les bons du Trésor, on reste en actions, sinon 100 % AGG ;
- momentum relatif : en actions, 100 % sur le plus fort sur 12 mois de SPY et EFA.
Exécution à l'ouverture suivante (dans `simuler`). Jamais le futur : tout est calculé avec les prix du soir.
"""
import numpy as np
import pandas as pd

from robot.parametres import FRAIS, SEUIL_TRANSACTION
from robot.simulation import simuler

MOMENTUM = {"durees": (252,), "actions": ("SPY", "EFA"), "refuge": "AGG", "absolu": "tresor", "decalage": 0}


def dates_de_decision(index, decalage=0):
    """Dernier jour de bourse de chaque mois, avancé de `decalage` jours de bourse (variante R1).
    Le dernier jour des données n'est pas une fin de mois connue : il n'est jamais retenu."""
    index = pd.DatetimeIndex(index)
    mois = index.year * 12 + index.month
    fins = np.flatnonzero(mois[:-1] != mois[1:])
    positions = fins - decalage
    return index[positions[positions >= 0]]


def rendement_sur(serie_cumulee, duree):
    """Rendement sur `duree` jours de bourse, à partir d'une courbe de valeur (prix ajustés ou cumul du taux)."""
    return serie_cumulee / serie_cumulee.shift(duree) - 1


def force(clotures, durees):
    """Force de chaque actif : moyenne de ses rendements sur les `durees` (une seule durée = le livre)."""
    return sum(rendement_sur(clotures, d) for d in durees) / len(durees)


def choix(clotures, tresor, durees=(252,), actions=("SPY", "EFA"), refuge="AGG", absolu="tresor", decalage=0):
    """Actif choisi à chaque date de décision (None tant que l'historique manque).

    `tresor` : rendement quotidien des bons du Trésor (connu la veille), pour le momentum absolu.
    `absolu` : "tresor" (le livre) ou 0.0 (variante : SPY doit simplement avoir monté).
    """
    f = force(clotures[list(actions) + [refuge]], durees)
    cumul_tresor = (1 + tresor.reindex(clotures.index).fillna(0.0)).cumprod()
    f_tresor = force(cumul_tresor.to_frame("t"), durees)["t"]
    choisis = {}
    for date in dates_de_decision(clotures.index, decalage):
        ligne = f.loc[date]
        if ligne.isna().any():
            choisis[date] = None
            continue
        seuil = f_tresor.loc[date] if absolu == "tresor" else absolu
        if ligne[actions[0]] > seuil:
            choisis[date] = ligne[list(actions)].idxmax()
        else:
            choisis[date] = refuge
    return pd.Series(choisis, dtype=object)


def cibles_depuis_choix(choisis, index, colonnes):
    """Parts visées chaque soir : 100 % sur l'actif choisi à la dernière décision, 0 ailleurs (0 partout avant)."""
    cibles = pd.DataFrame(np.nan, index=index, columns=colonnes)
    for date, symbole in choisis.items():
        cibles.loc[date] = 0.0
        if symbole is not None:
            cibles.loc[date, symbole] = 1.0
    return cibles.ffill().fillna(0.0)


def strategie_momentum(ouvertures, clotures, tresor, debut, frais=FRAIS, details=False, **reglage):
    """Le double momentum complet : choix mensuel -> parts visées -> même simulation que la v3."""
    reglage = {**MOMENTUM, **reglage}
    choisis = choix(clotures, tresor, **reglage)
    cibles = cibles_depuis_choix(choisis, clotures.index, clotures.columns)
    resultat = simuler(ouvertures, clotures, cibles, debut, SEUIL_TRANSACTION, frais, details)
    resultat.choix = choisis
    return resultat


def choix_au_hasard(choisis, candidats, aleatoire):
    """R5 : même calendrier de décisions, mais chaque mois un actif tiré au hasard parmi `candidats`."""
    return pd.Series([None if s is None else candidats[aleatoire.integers(len(candidats))] for s in choisis],
                     index=choisis.index, dtype=object)
