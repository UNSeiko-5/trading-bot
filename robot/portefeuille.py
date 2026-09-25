"""Taille des positions de la v2 (docs/STRATEGIE_V2.md, sections 5 et 6).

    part_i = VOL_CIBLE × IDM × budget_i × (note_i / 10) / volatilité_i

puis les garde-fous : 25 % maximum par actif, 15 % maximum en crypto, 100 % maximum au
total (pas de levier), et le seuil de transaction.

`python -m robot.portefeuille` affiche la répartition visée aujourd'hui.
"""
from dataclasses import dataclass
from math import sqrt

import numpy as np
import pandas as pd

from robot.parametres import (
    DEBUT_BACKTEST, EXPOSITION_MAX, FENETRE_CORRELATION, FENETRE_VOL, IDM_MAX, IDM_MIN,
    JOURS_MIN_HISTORIQUE, JOURS_PAR_AN, PART_MAX_ACTIF, PART_MAX_CRYPTO, SEUIL_TRANSACTION, VOL_CIBLE,
)
from robot.univers import PAR_SYMBOLE, budgets_de_risque

TOLERANCE = 1e-9


def est_crypto(symbole):
    return symbole in PAR_SYMBOLE and PAR_SYMBOLE[symbole].type == "crypto"


def rendements_quotidiens(clotures):
    return clotures / clotures.shift(1) - 1


def volatilite_annuelle(clotures, fenetre=FENETRE_VOL):
    """Agitation annuelle récente de chaque actif (écart-type des rendements quotidiens,
    moyenne exponentielle sur `fenetre` jours, ramené à l'année)."""
    return rendements_quotidiens(clotures).ewm(span=fenetre, min_periods=fenetre).std() * sqrt(JOURS_PAR_AN)


def idm(correlations, budgets):
    """Bonus de diversification : 1 / racine(b' C b), corrélations négatives ramenées à 0,
    résultat borné entre IDM_MIN et IDM_MAX.

    Deux actifs qui bougent pareil : 1 (aucun bonus). Deux actifs indépendants : 1,41.
    """
    c = np.nan_to_num(np.asarray(correlations, dtype=float), nan=1.0).clip(min=0)
    np.fill_diagonal(c, 1.0)
    b = np.asarray(budgets, dtype=float)
    return float(np.clip(1 / np.sqrt(b @ c @ b), IDM_MIN, IDM_MAX))


def _budgets_par_masque(symboles, disponibles):
    """Pour chaque combinaison d'actifs disponibles, le vecteur des budgets (0 si indisponible)."""
    cache = {}
    for masque in {tuple(ligne) for ligne in disponibles.to_numpy()}:
        budgets = budgets_de_risque([s for s, dispo in zip(symboles, masque) if dispo])
        cache[masque] = np.array([budgets.get(s, 0.0) for s in symboles])
    return cache


@dataclass
class Risque:
    """Tout ce qui ne dépend que des prix (pas des notes) : calculé une seule fois."""
    rendements: pd.DataFrame
    volatilites: pd.DataFrame
    budgets: pd.DataFrame   # 0 pour un actif pas encore disponible
    idm: pd.Series


def preparer_risque(clotures, fenetre_corr=FENETRE_CORRELATION, jours_min=JOURS_MIN_HISTORIQUE):
    """Agitation, budgets et bonus de diversification de chaque jour, sans regarder le futur."""
    symboles = list(clotures.columns)
    rendements = rendements_quotidiens(clotures)
    volatilites = volatilite_annuelle(clotures)
    disponibles = (clotures.notna().cumsum() >= jours_min) & volatilites.notna()

    cache = _budgets_par_masque(symboles, disponibles)
    masques = [tuple(ligne) for ligne in disponibles.to_numpy()]
    budgets = pd.DataFrame([cache[m] for m in masques], index=clotures.index, columns=symboles)

    n = len(symboles)
    correlations = rendements.rolling(fenetre_corr, min_periods=60).corr().to_numpy().reshape(len(clotures), n, n)
    valeurs = np.full(len(clotures), np.nan)
    for t, masque in enumerate(masques):
        m = np.array(masque)
        if m.any():
            valeurs[t] = idm(correlations[t][np.ix_(m, m)], cache[masque][m])
    return Risque(rendements, volatilites, budgets, pd.Series(valeurs, index=clotures.index))


def appliquer_garde_fous(parts, part_max=PART_MAX_ACTIF, crypto_max=PART_MAX_CRYPTO, exposition_max=EXPOSITION_MAX):
    """25 % maximum par actif, 15 % maximum en crypto, 100 % maximum au total.

    Si un plafond de groupe est dépassé, toutes les parts du groupe sont réduites dans la même proportion.
    """
    parts = parts.clip(lower=0, upper=part_max)
    cryptos = [s for s in parts.columns if est_crypto(s)]
    if cryptos:
        total_crypto = parts[cryptos].sum(axis=1)
        parts[cryptos] = parts[cryptos].mul((crypto_max / total_crypto).clip(upper=1).fillna(1), axis=0)
    total = parts.sum(axis=1)
    return parts.mul((exposition_max / total).where(total > exposition_max, 1.0), axis=0)


def parts_cibles(notes, risque, vol_cible=VOL_CIBLE):
    """Part du capital visée pour chaque actif et chaque jour (garde-fous compris)."""
    brutes = risque.budgets.mul(risque.idm, axis=0) * vol_cible * (notes.fillna(0) / 10) / risque.volatilites
    brutes = brutes.where(risque.budgets > 0, 0.0).fillna(0.0)
    return appliquer_garde_fous(brutes)


def respecte_garde_fous(parts, part_max=PART_MAX_ACTIF, crypto_max=PART_MAX_CRYPTO, exposition_max=EXPOSITION_MAX):
    crypto = sum(v for s, v in parts.items() if est_crypto(s))
    return (
        (parts <= part_max + TOLERANCE).all()
        and crypto <= crypto_max + TOLERANCE
        and parts.sum() <= exposition_max + TOLERANCE
    )


def appliquer_seuil(cibles, actuelles, seuil=SEUIL_TRANSACTION):
    """Parts à détenir après le seuil de transaction (pour un jour, une valeur par actif).

    On ne bouge une position que si l'écart avec la cible dépasse le seuil, ou si la cible
    tombe à 0. Si garder certaines positions telles quelles violait un garde-fou (parce que
    leur prix a monté), on applique toutes les cibles.
    """
    ecart = (cibles - actuelles).abs()
    bouger = (ecart >= seuil - TOLERANCE) | ((cibles == 0) & (actuelles > 0))
    nouvelles = cibles.where(bouger, actuelles)
    return nouvelles if respecte_garde_fous(nouvelles) else cibles.copy()


def agitation_portefeuille(parts, rendements, fenetre=FENETRE_CORRELATION):
    """Agitation annuelle estimée d'un portefeuille, d'après les rendements des `fenetre` derniers jours."""
    covariance = rendements.tail(fenetre).cov().fillna(0) * JOURS_PAR_AN
    w = parts.reindex(covariance.columns).fillna(0).to_numpy()
    return float(np.sqrt(w @ covariance.to_numpy() @ w))


def afficher(clotures):
    from robot.signaux import notes as calculer_notes

    risque = preparer_risque(clotures)
    notes = calculer_notes(clotures)
    parts = parts_cibles(notes, risque)
    jour, date = parts.iloc[-1], clotures.index[-1].date()

    print(f"PORTEFEUILLE v2 — répartition visée au {date}\n")
    print(f"  {'Actif':<42} {'Note':>5} {'Agitation':>10} {'Budget':>8} {'Part visée':>11}")
    for symbole in clotures.columns:
        print(f"  {symbole:<8} {PAR_SYMBOLE[symbole].nom:<33} {notes[symbole].iloc[-1]:5.1f}"
              f" {risque.volatilites[symbole].iloc[-1]:9.1%} {risque.budgets[symbole].iloc[-1]:8.1%} {jour[symbole]:10.1%}")

    crypto = sum(v for s, v in jour.items() if est_crypto(s))
    print(f"\n  Investi : {jour.sum():.0%} | Cash : {1 - jour.sum():.0%} | dont crypto : {crypto:.1%}")
    print(f"  Bonus de diversification (IDM) : {risque.idm.iloc[-1]:.2f}")
    print(f"  Agitation estimée du portefeuille : {agitation_portefeuille(jour, risque.rendements):.1%} par an"
          f" (visée : {VOL_CIBLE:.0%})")

    historique = parts.loc[DEBUT_BACKTEST:].sum(axis=1)
    print(f"\nDepuis {DEBUT_BACKTEST[:4]} : investi en moyenne {historique.mean():.0%} du capital"
          f" (minimum {historique.min():.0%}, maximum {historique.max():.0%})")


if __name__ == "__main__":
    from robot.donnees import charger

    afficher(charger().clotures)
