"""Données de la v2 : téléchargement, alignement sur un calendrier commun, contrôles de qualité.

`python -m robot.donnees` télécharge les 10 actifs et affiche le rapport de qualité.
"""
import hashlib
import sys
import time
from dataclasses import dataclass

import pandas as pd
import yfinance as yf

from robot.univers import PAR_SYMBOLE, UNIVERS

CALENDRIER = "SPY"   # les jours de bourse américains servent de calendrier commun
TROU_MAX = 3         # nombre de jours manquants comblés au maximum (au-delà : problème)
REPETITIONS_MAX = 5  # prix identique au jour précédent 5 fois de suite : donnée figée
VARIATION_SUSPECTE = {"ETF": 0.20, "crypto": 0.50}  # au-delà en un jour : avertissement


def telecharger(symbole, essais=3):
    """Historique complet d'un actif (prix ajustés des dividendes). Réessaie en cas d'échec."""
    historique = pd.DataFrame()
    for essai in range(1, essais + 1):
        try:
            historique = yf.Ticker(symbole).history(period="max", auto_adjust=True)
        except Exception as e:
            print(f"Téléchargement de {symbole} échoué (essai {essai}/{essais}) : {e}")
        if not historique.empty:
            return historique
        if essai < essais:
            time.sleep(5 * essai)
    return historique


def dates_simples(index):
    """Dates Yahoo (avec heure et fuseau horaire) -> simples dates de calendrier.

    Les ETF sont datés à minuit heure de New York, la crypto à minuit UTC : sans cette
    conversion, les mêmes jours ne correspondraient pas.
    """
    index = pd.DatetimeIndex(index)
    if index.tz is not None:
        index = index.tz_localize(None)
    return index.normalize()


def controler_brut(historique, type_actif):
    """Contrôles sur les données brutes d'un actif. Renvoie (problèmes, avertissements).

    Un problème rend les données inutilisables. Un avertissement est à vérifier à la main
    (par exemple une vraie journée de krach).
    """
    if historique is None or historique.empty:
        return ["aucune donnée reçue"], []
    manquantes = {"Open", "Close"} - set(historique.columns)
    if manquantes:
        return [f"colonnes manquantes : {sorted(manquantes)}"], []

    problemes, avertissements = [], []
    if dates_simples(historique.index).has_duplicates:
        problemes.append("dates en double")
    if (historique[["Open", "Close"]] <= 0).any().any():
        problemes.append("prix nul ou négatif")

    clotures = historique["Close"].dropna()
    repetition = (clotures.diff() == 0).astype(int)
    plus_longue = int(repetition.groupby((repetition == 0).cumsum()).sum().max() or 0)
    if plus_longue >= REPETITIONS_MAX:
        problemes.append(f"prix figé pendant {plus_longue + 1} jours de suite")

    variations = clotures.pct_change().abs()
    for date, variation in variations[variations > VARIATION_SUSPECTE[type_actif]].items():
        avertissements.append(f"variation de {variation:.0%} le {pd.Timestamp(date).date()} (à vérifier)")
    return problemes, avertissements


def aligner(historiques, calendrier):
    """Place tous les actifs sur les mêmes dates.

    Avant la création d'un actif, ses prix restent vides. Après, un trou de TROU_MAX jours
    au plus est comblé avec le dernier prix connu. Un trou plus long reste vide et est signalé.
    Renvoie (ouvertures, clotures, jours_combles, jours_manquants).
    """
    ouvertures, clotures, combles, manquants = {}, {}, {}, {}
    for symbole, historique in historiques.items():
        prix = historique[["Open", "Close"]].copy()
        prix.index = dates_simples(prix.index)
        prix = prix[~prix.index.duplicated(keep="last")].reindex(calendrier)

        debut = prix["Close"].first_valid_index()
        if debut is not None:
            vides_avant = int(prix.loc[debut:].isna().any(axis=1).sum())
            prix.loc[debut:] = prix.loc[debut:].ffill(limit=TROU_MAX)
            vides_apres = int(prix.loc[debut:].isna().any(axis=1).sum())
        else:
            vides_avant = vides_apres = 0

        ouvertures[symbole], clotures[symbole] = prix["Open"], prix["Close"]
        combles[symbole] = vides_avant - vides_apres
        manquants[symbole] = vides_apres
    return pd.DataFrame(ouvertures), pd.DataFrame(clotures), combles, manquants


@dataclass
class Donnees:
    ouvertures: pd.DataFrame
    clotures: pd.DataFrame
    rapport: list  # une ligne (dictionnaire) par actif

    @property
    def utilisables(self):
        return all(not ligne["problemes"] for ligne in self.rapport)

    def empreinte(self):
        """Code court qui identifie exactement ce jeu de données (pour relier un résultat à ses données)."""
        return hashlib.sha256(self.clotures.round(6).to_csv().encode()).hexdigest()[:12]


def charger(symboles=None, telechargeur=telecharger):
    """Télécharge, contrôle et aligne les actifs. Le calendrier est celui de SPY."""
    symboles = symboles or [actif.symbole for actif in UNIVERS]
    historiques = {symbole: telechargeur(symbole) for symbole in symboles}
    if historiques[CALENDRIER].empty:
        raise RuntimeError(f"Aucune donnée pour {CALENDRIER}, impossible de construire le calendrier.")
    calendrier = dates_simples(historiques[CALENDRIER].index).drop_duplicates()

    rapport, exploitables = [], {}
    for symbole in symboles:
        problemes, avertissements = controler_brut(historiques[symbole], PAR_SYMBOLE[symbole].type)
        rapport.append({"symbole": symbole, "problemes": problemes, "avertissements": avertissements})
        if not historiques[symbole].empty and {"Open", "Close"} <= set(historiques[symbole].columns):
            exploitables[symbole] = historiques[symbole]

    ouvertures, clotures, combles, manquants = aligner(exploitables, calendrier)
    for ligne in rapport:
        symbole = ligne["symbole"]
        serie = clotures[symbole] if symbole in clotures else pd.Series(dtype=float)
        ligne["debut"] = serie.first_valid_index()
        ligne["jours"] = int(serie.notna().sum())
        ligne["combles"] = combles.get(symbole, 0)
        if manquants.get(symbole, 0):
            ligne["problemes"].append(f"{manquants[symbole]} jours manquants (trous de plus de {TROU_MAX} jours)")
    return Donnees(ouvertures, clotures, rapport)


def afficher_rapport(donnees):
    debut, fin = donnees.clotures.index[0].date(), donnees.clotures.index[-1].date()
    print(f"DONNÉES v2 — {len(donnees.rapport)} actifs, calendrier {CALENDRIER} : {debut} -> {fin}\n")
    for ligne in donnees.rapport:
        actif = PAR_SYMBOLE[ligne["symbole"]]
        etat = "❌" if ligne["problemes"] else "✅"
        depuis = ligne["debut"].date() if ligne["debut"] is not None else "—"
        print(f"  {etat} {actif.symbole:<8} {actif.nom:<34} depuis {depuis}   "
              f"{ligne['jours']:>5} jours   {ligne['combles']} comblé(s)")
        for probleme in ligne["problemes"]:
            print(f"       ❌ {probleme}")
        for avertissement in ligne["avertissements"]:
            print(f"       ⚠️  {avertissement}")
    print(f"\nEmpreinte des données : {donnees.empreinte()}")
    print("Verdict : " + ("✅ données utilisables" if donnees.utilisables else "❌ problèmes à corriger avant d'utiliser ces données"))


if __name__ == "__main__":
    donnees = charger()
    afficher_rapport(donnees)
    sys.exit(0 if donnees.utilisables else 1)
