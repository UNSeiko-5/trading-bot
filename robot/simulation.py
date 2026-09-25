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

from robot.parametres import (
    DEBUT_BACKTEST, DETECTEURS, FRAIS, JOURS_PAR_AN, POIDS_RETOUR_MOYENNE, SEUIL_TRANSACTION, VOL_CIBLE,
)
from robot.portefeuille import est_crypto, parts_cibles, parts_normales, preparer_risque, seuil_rapide, tampon_rapide
from robot.signaux import notes as calculer_notes
from robot.univers import PAR_SYMBOLE


@dataclass
class Resultat:
    valeur: pd.Series      # valeur du portefeuille chaque soir (départ : 1)
    poids: pd.DataFrame    # part de chaque actif chaque soir
    frais: pd.Series       # frais payés chaque jour, en part du capital
    rotation: pd.Series    # montant échangé chaque jour, en part du capital
    gains: pd.DataFrame = None    # (mode détaillé) gain de chaque actif chaque jour, frais déduits, en part du capital de départ
    ordres: pd.DataFrame = None   # (mode détaillé) chaque ordre exécuté à l'ouverture
    multiplicateur: pd.Series = None   # (EXP-005) multiplicateur de risque appliqué chaque jour


def _variation(apres, avant):
    """Rapport de prix, 1 si l'un des deux prix manque (actif pas encore coté)."""
    with np.errstate(divide="ignore", invalid="ignore"):
        rapport = apres / avant
    return np.where(np.isfinite(rapport), rapport, 1.0)


def frais_par_actif(symboles, frais=FRAIS):
    return np.array([frais[PAR_SYMBOLE[s].type] if s in PAR_SYMBOLE else frais["ETF"] for s in symboles])


def simuler(ouvertures, clotures, cibles, debut=DEBUT_BACKTEST, seuil=SEUIL_TRANSACTION, frais=FRAIS, details=False,
            tampons=None):
    """Simule la stratégie jour par jour. `cibles` : part visée de chaque actif, décidée chaque soir.

    `tampons` (EXP-006) : demi-largeur de la zone tampon de chaque actif chaque jour ; remplace le seuil.
    `details=True` garde aussi le gain de chaque actif chaque jour et la liste des ordres (pour le rejeu
    et le rapport). Plus lent : réservé à l'affichage, pas aux tests de robustesse.
    """
    symboles = list(clotures.columns)
    dates = clotures.loc[debut:].index
    o = ouvertures.loc[dates, symboles].to_numpy(dtype=float)
    c = clotures.loc[dates, symboles].to_numpy(dtype=float)
    w = cibles.reindex(index=dates, columns=symboles).fillna(0).to_numpy(dtype=float)
    crypto = np.array([est_crypto(s) for s in symboles])
    b = None if tampons is None else tampons.reindex(index=dates, columns=symboles).fillna(0).to_numpy(dtype=float)
    taux = frais_par_actif(symboles, frais)

    n, k = c.shape
    positions, cash = np.zeros(k), 1.0   # montants investis dans chaque actif, et cash
    valeur, poids = np.empty(n), np.zeros((n, k))
    frais_jour, rotation = np.zeros(n), np.zeros(n)
    gains, ordres = (np.zeros((n, k)), []) if details else (None, None)

    for t in range(n):
        if t > 0:
            avant = positions
            positions = positions * _variation(o[t], c[t - 1])      # 1. la nuit
            if details:
                gains[t] += positions - avant
            decision = (seuil_rapide(w[t - 1], poids[t - 1], crypto, seuil) if b is None
                        else tampon_rapide(w[t - 1], poids[t - 1], b[t - 1], crypto))
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
                if details:
                    couts = echange * taux
                    gains[t] -= couts
                    for i in np.flatnonzero(echange > 1e-12):
                        ordres.append((dates[t], symboles[i], "achat" if nouvelles[i] > positions[i] else "vente",
                                       positions[i], nouvelles[i], o[t, i], couts[i]))
                positions = nouvelles
                frais_jour[t], rotation[t] = cout / capital, echange.sum() / capital
        avant = positions
        positions = positions * _variation(c[t], o[t])              # 3. la séance
        if details:
            gains[t] += positions - avant
        valeur[t] = cash + positions.sum()
        poids[t] = positions / valeur[t]

    resultat = Resultat(
        pd.Series(valeur, index=dates), pd.DataFrame(poids, index=dates, columns=symboles),
        pd.Series(frais_jour, index=dates), pd.Series(rotation, index=dates),
    )
    if details:
        resultat.gains = pd.DataFrame(gains, index=dates, columns=symboles)
        resultat.ordres = pd.DataFrame(ordres, columns=["date", "symbole", "sens", "avant", "apres", "prix", "frais"])
    return resultat


def multiplicateur_risque(rendements, vol_cible=VOL_CIBLE, fenetre=504, borne_basse=1.0, borne_haute=2.5,
                         historique_min=JOURS_PAR_AN):
    """EXP-005 : agitation visée ÷ agitation réalisée sur les `fenetre` derniers jours (le jour même compris,
    donc connu à la clôture), bornée. Vaut 1 tant qu'il y a moins de `historique_min` jours d'historique.
    `borne_basse=None` : pas de borne basse."""
    realisee = rendements.rolling(fenetre, min_periods=historique_min).std() * sqrt(JOURS_PAR_AN)
    with np.errstate(divide="ignore"):
        brut = vol_cible / realisee
    return brut.clip(lower=borne_basse, upper=borne_haute).fillna(1.0)


def cibles_strategie(ouvertures, clotures, notes, risque, vol_cible=VOL_CIBLE, seuil=SEUIL_TRANSACTION,
                     frais=FRAIS, budget=None, tampon=None):
    """Parts visées à partir des notes. Avec `budget` (EXP-005), la v2 normale est d'abord simulée depuis
    le début des données pour mesurer son agitation réalisée, puis toutes les parts sont multipliées.
    Avec `tampon` (EXP-006), calcule aussi la demi-largeur de la zone tampon = tampon x part « normale ».
    Renvoie (parts visées, multiplicateur ou None, zones tampons ou None)."""
    m = None
    if budget is not None:
        base = parts_cibles(notes, risque, vol_cible)
        normale = simuler(ouvertures, clotures, base, debut=clotures.index[0], seuil=seuil, frais=frais)
        m = multiplicateur_risque(normale.valeur.pct_change(), vol_cible, **budget)
    cibles = parts_cibles(notes, risque, vol_cible, multiplicateur=m)
    tampons = None if tampon is None else tampon * parts_normales(risque, vol_cible, m)
    return cibles, m, tampons


def strategie_v2(ouvertures, clotures, detecteurs=DETECTEURS, vol_cible=VOL_CIBLE,
                 seuil=SEUIL_TRANSACTION, frais=FRAIS, debut=DEBUT_BACKTEST, risque=None, cassures=(),
                 retour=(), poids_retour=POIDS_RETOUR_MOYENNE, details=False, budget=None, tampon=None):
    """La stratégie v2 complète : notes -> parts visées -> simulation.

    `risque` peut être fourni pour éviter de le recalculer (tests de robustesse).
    `cassures` : détecteurs de cassure ajoutés à la note combinée (EXP-003). Vide = la v2.
    `retour`, `poids_retour` : détecteurs de retour à la moyenne et leur part de la note (EXP-004). Vide = la v2.
    `budget` : réglages du multiplicateur de risque (EXP-005, voir BUDGET_RISQUE). None = la v2.
    """
    risque = risque or preparer_risque(clotures)
    notes = calculer_notes(clotures, detecteurs, cassures=cassures, retour=retour, poids_retour=poids_retour)
    cibles, m, tampons = cibles_strategie(ouvertures, clotures, notes, risque, vol_cible, seuil, frais, budget, tampon)
    resultat = simuler(ouvertures, clotures, cibles, debut, seuil, frais, details, tampons)
    if m is not None:
        resultat.multiplicateur = m.reindex(resultat.valeur.index)
    return resultat


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
