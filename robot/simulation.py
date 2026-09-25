"""Backtest multi-actifs de la v2 (docs/STRATEGIE_V2.md, sections 7 et 9).

Chaque jour :
1. la nuit, les positions suivent le marché (clôture de la veille -> ouverture) ;
2. à l'ouverture, on exécute la décision prise la veille au soir (seuil de transaction et frais) ;
3. pendant la séance, les positions suivent le marché (ouverture -> clôture).
Le cash ne rapporte rien. Jamais de levier.
"""
from dataclasses import dataclass
from math import sqrt

import numpy as np
import pandas as pd

from robot.parametres import DEBUT_BACKTEST, DETECTEURS, FRAIS, JOURS_PAR_AN, SEUIL_TRANSACTION, VOL_CIBLE
from robot.portefeuille import est_crypto, parts_cibles, preparer_risque, seuil_rapide
from robot.signaux import notes as calculer_notes
from robot.univers import PAR_SYMBOLE


@dataclass
class Resultat:
    valeur: pd.Series      # valeur du portefeuille chaque soir (départ : 1)
    poids: pd.DataFrame    # part de chaque actif chaque soir
    frais: pd.Series       # frais payés chaque jour, en part du capital
    rotation: pd.Series    # montant échangé chaque jour, en part du capital


def _variation(apres, avant):
    """Rapport de prix, 1 si l'un des deux prix manque (actif pas encore coté)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        rapport = apres / avant
    return np.where(np.isfinite(rapport), rapport, 1.0)


def frais_par_actif(symboles, frais=FRAIS):
    return np.array([frais[PAR_SYMBOLE[s].type] if s in PAR_SYMBOLE else frais["ETF"] for s in symboles])


def simuler(ouvertures, clotures, cibles, debut=DEBUT_BACKTEST, seuil=SEUIL_TRANSACTION, frais=FRAIS):
    """Simule la stratégie jour par jour. `cibles` : part visée de chaque actif, décidée chaque soir."""
    symboles = list(clotures.columns)
    dates = clotures.loc[debut:].index
    o = ouvertures.loc[dates, symboles].to_numpy(dtype=float)
    c = clotures.loc[dates, symboles].to_numpy(dtype=float)
    w = cibles.reindex(index=dates, columns=symboles).fillna(0).to_numpy(dtype=float)
    crypto = np.array([est_crypto(s) for s in symboles])
    taux = frais_par_actif(symboles, frais)

    n, k = c.shape
    positions, cash = np.zeros(k), 1.0   # montants investis dans chaque actif, et cash
    valeur, poids = np.empty(n), np.zeros((n, k))
    frais_jour, rotation = np.zeros(n), np.zeros(n)

    for t in range(n):
        if t > 0:
            positions = positions * _variation(o[t], c[t - 1])      # 1. la nuit
            decision = seuil_rapide(w[t - 1], poids[t - 1], crypto, seuil)
            bouger = decision != poids[t - 1]
            if bouger.any():                                         # 2. exécution à l'ouverture
                capital = cash + positions.sum()
                nouvelles = np.where(bouger, decision * capital, positions)
                echange = np.abs(nouvelles - positions)
                cout = (echange * taux).sum()
                cash = capital - nouvelles.sum() - cout
                if cash < 0:   # les frais dépassent le cash : on réduit un peu les positions (jamais de levier)
                    nouvelles *= (nouvelles.sum() + cash) / nouvelles.sum()
                    cash = 0.0
                positions = nouvelles
                frais_jour[t], rotation[t] = cout / capital, echange.sum() / capital
        positions = positions * _variation(c[t], o[t])              # 3. la séance
        valeur[t] = cash + positions.sum()
        poids[t] = positions / valeur[t]

    return Resultat(
        pd.Series(valeur, index=dates), pd.DataFrame(poids, index=dates, columns=symboles),
        pd.Series(frais_jour, index=dates), pd.Series(rotation, index=dates),
    )


def strategie_v2(ouvertures, clotures, detecteurs=DETECTEURS, vol_cible=VOL_CIBLE,
                 seuil=SEUIL_TRANSACTION, frais=FRAIS, debut=DEBUT_BACKTEST, risque=None):
    """La stratégie v2 complète : notes -> parts visées -> simulation.

    `risque` peut être fourni pour éviter de le recalculer (tests de robustesse).
    """
    risque = risque or preparer_risque(clotures)
    cibles = parts_cibles(calculer_notes(clotures, detecteurs), risque, vol_cible)
    return simuler(ouvertures, clotures, cibles, debut, seuil, frais)


# --- Points de comparaison ------------------------------------------------------------------------

def acheter_et_garder(clotures, symbole="SPY", debut=DEBUT_BACKTEST):
    prix = clotures[symbole].loc[debut:]
    return prix / prix.iloc[0]


def soixante_quarante(clotures, debut=DEBUT_BACKTEST, frais=FRAIS["ETF"]):
    """60 % SPY, 40 % IEF, rééquilibré le premier jour de bourse de chaque mois (frais compris)."""
    prix = clotures[["SPY", "IEF"]].loc[debut:]
    cible = np.array([0.6, 0.4])
    positions = cible * (1 - frais)
    valeurs = [positions.sum()]
    for t in range(1, len(prix)):
        positions = positions * (prix.iloc[t].to_numpy() / prix.iloc[t - 1].to_numpy())
        if prix.index[t].month != prix.index[t - 1].month:
            total = positions.sum()
            cout = np.abs(cible * total - positions).sum() * frais
            positions = cible * (total - cout)
        valeurs.append(positions.sum())
    return pd.Series(valeurs, index=prix.index)


def v1_200_jours(ouvertures, clotures, debut=DEBUT_BACKTEST):
    """La v1 actuelle du robot (moyenne 200 jours sur SPY), avec son propre backtest."""
    from backtest import simuler as simuler_v1  # backtest.py de la v1, à la racine du projet

    historique = pd.DataFrame({"Open": ouvertures["SPY"], "Close": clotures["SPY"]}).dropna()
    rendements = simuler_v1(historique)["strategie"].loc[debut:]
    return (1 + rendements).cumprod() / (1 + rendements.iloc[0])


def toujours_investi(ouvertures, clotures, debut=DEBUT_BACKTEST, risque=None):
    """Même panier, même dosage par le risque et mêmes garde-fous, mais sans les signaux :
    note fixe de 10 sur chaque actif disponible. Mesure ce qu'apportent vraiment les signaux."""
    risque = risque or preparer_risque(clotures)
    notes_fixes = pd.DataFrame(10.0, index=clotures.index, columns=clotures.columns).where(risque.budgets > 0)
    return simuler(ouvertures, clotures, parts_cibles(notes_fixes, risque), debut).valeur


def points_de_comparaison(ouvertures, clotures, debut=DEBUT_BACKTEST, risque=None):
    return {
        "Acheter et garder SPY": acheter_et_garder(clotures, debut=debut),
        "60/40 (SPY/IEF)": soixante_quarante(clotures, debut),
        "v1 (200 jours sur SPY)": v1_200_jours(ouvertures, clotures, debut),
        "Même panier sans signaux": toujours_investi(ouvertures, clotures, debut, risque),
    }


# --- Mesures -------------------------------------------------------------------------------------

def mesures(valeur):
    """Les chiffres clés d'une courbe de valeur."""
    rendements = valeur.pct_change().dropna()
    annees = len(rendements) / JOURS_PAR_AN
    rendement_annuel = (valeur.iloc[-1] / valeur.iloc[0]) ** (1 / annees) - 1
    chute = valeur / valeur.cummax() - 1
    sous_sommet = chute < 0
    plus_longue = sous_sommet.groupby((~sous_sommet).cumsum()).sum().max() / JOURS_PAR_AN
    agitation = rendements.std() * sqrt(JOURS_PAR_AN)
    return {
        "rendement_annuel": rendement_annuel,
        "pire_chute": chute.min(),
        "note_rendement_risque": rendement_annuel / abs(chute.min()) if chute.min() < 0 else float("inf"),
        "agitation": agitation,
        "sharpe": rendements.mean() / rendements.std() * sqrt(JOURS_PAR_AN) if rendements.std() > 0 else 0.0,
        "plus_longue_chute_annees": plus_longue,
    }


def rendements_par_annee(valeur):
    fins = valeur.groupby(valeur.index.year).last()
    debuts = fins.shift(1)
    debuts.iloc[0] = valeur.iloc[0]
    return fins / debuts - 1
