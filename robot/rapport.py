"""Rapport de backtest façon « testeur de stratégie » (MetaTrader 5), en euros.

Notre robot ne raisonne pas en « trades » mais en parts du capital, ajustées chaque jour. Pour obtenir
les chiffres habituels, on appelle **trade** une position sur un actif, de son achat (la part passe de 0
à plus de 0) jusqu'à sa vente complète (la part revient à 0). Les ajustements entre les deux font partie
du même trade. Son résultat = tous les gains et pertes de l'actif pendant ce temps, frais compris.

Nécessite une simulation lancée avec `details=True`.
"""
import math
from math import sqrt

import numpy as np
import pandas as pd

from robot.parametres import JOURS_PAR_AN

MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi"]


def extraire_trades(resultat, capital=1.0):
    """Un trade par position ouverte puis fermée (ou encore ouverte à la fin), du plus ancien au plus récent."""
    if resultat.gains is None:
        raise ValueError("simulation lancée sans details=True")
    dates = resultat.poids.index
    lignes = []
    for symbole in resultat.poids.columns:
        tenu = resultat.poids[symbole].to_numpy() > 0
        gains = resultat.gains[symbole].to_numpy() * capital
        debut = None
        for t in range(len(tenu)):
            if tenu[t] and (t == 0 or not tenu[t - 1]):
                debut = t
            if debut is not None and not tenu[t] and t > 0 and tenu[t - 1]:
                # vendu à l'ouverture du jour t : ce jour-là compte la nuit précédente et les frais de vente
                lignes.append((symbole, debut, t, gains[debut:t + 1].sum(), "fermé"))
                debut = None
        if debut is not None:
            lignes.append((symbole, debut, len(tenu) - 1, gains[debut:].sum(), "en cours"))
    trades = pd.DataFrame(lignes, columns=["symbole", "i_entree", "i_sortie", "resultat", "statut"])
    trades["entree"] = dates[trades["i_entree"]]
    trades["sortie"] = dates[trades["i_sortie"]]
    trades["jours"] = trades["i_sortie"] - trades["i_entree"]
    return trades.sort_values(["i_sortie", "symbole"]).reset_index(drop=True)


def _series_consecutives(resultats, gagnant):
    """Plus longue série de trades gagnants (ou perdants) d'affilée : (nombre, somme)."""
    meilleur, courant = (0, 0.0), (0, 0.0)
    for r in resultats:
        if (r > 0) == gagnant and r != 0:
            courant = (courant[0] + 1, courant[1] + r)
            if courant[0] > meilleur[0] or (courant[0] == meilleur[0] and abs(courant[1]) > abs(meilleur[1])):
                meilleur = courant
        else:
            courant = (0, 0.0)
    return meilleur


def rapport(resultat, capital=10_000.0):
    """Les chiffres du rapport, en euros pour un dépôt initial de `capital`."""
    valeur = resultat.valeur / resultat.valeur.iloc[0] * capital
    trades = extraire_trades(resultat, capital / resultat.valeur.iloc[0])
    fermes = trades[trades["statut"] == "fermé"]
    r = fermes["resultat"].to_numpy()
    gagnants, perdants = r[r > 0], r[r < 0]
    sommet = valeur.cummax()
    chute_eur, chute_pct = (sommet - valeur), (valeur / sommet - 1)
    rendements = valeur.pct_change().dropna()
    annees = len(rendements) / JOURS_PAR_AN
    profit_net = float(valeur.iloc[-1] - capital)
    serie_g, serie_p = _series_consecutives(r, True), _series_consecutives(r, False)

    par_mois = [{"mois": MOIS[m], "entrees": int((trades["entree"].dt.month == m + 1).sum()),
                 "gains": float(fermes.loc[(fermes["sortie"].dt.month == m + 1) & (fermes["resultat"] > 0), "resultat"].sum()),
                 "pertes": float(fermes.loc[(fermes["sortie"].dt.month == m + 1) & (fermes["resultat"] < 0), "resultat"].sum())}
                for m in range(12)]
    par_jour = [{"jour": JOURS[j], "entrees": int((trades["entree"].dt.weekday == j).sum()),
                 "gains": float(fermes.loc[(fermes["sortie"].dt.weekday == j) & (fermes["resultat"] > 0), "resultat"].sum()),
                 "pertes": float(fermes.loc[(fermes["sortie"].dt.weekday == j) & (fermes["resultat"] < 0), "resultat"].sum())}
                for j in range(5)]
    par_actif = []
    for symbole in resultat.poids.columns:
        t = trades[trades["symbole"] == symbole]
        f = t[t["statut"] == "fermé"]
        par_actif.append({"symbole": symbole, "trades": int(len(f)),
                          "gagnants": float((f["resultat"] > 0).mean()) if len(f) else 0.0,
                          "resultat": float(t["resultat"].sum())})
    par_annee = (valeur.groupby(valeur.index.year).last() / valeur.groupby(valeur.index.year).last().shift(1).fillna(capital) - 1)

    return {
        "capital": capital,
        "debut": valeur.index[0].date().isoformat(), "fin": valeur.index[-1].date().isoformat(),
        "jours_de_bourse": int(len(valeur)), "annees": round(annees, 1),
        "profit_net": profit_net,
        "valeur_finale": float(valeur.iloc[-1]),
        "rendement_annuel": float((valeur.iloc[-1] / capital) ** (1 / annees) - 1) if annees > 0 else 0.0,
        "profit_brut": float(gagnants.sum()), "perte_brute": float(perdants.sum()),
        "facteur_profit": float(gagnants.sum() / -perdants.sum()) if len(perdants) else float("nan"),
        "gain_attendu": float(r.mean()) if len(r) else 0.0,
        "facteur_recuperation": float(profit_net / chute_eur.max()) if chute_eur.max() > 0 else float("nan"),
        "sharpe_annuel": float(rendements.mean() / rendements.std() * sqrt(JOURS_PAR_AN)) if rendements.std() > 0 else 0.0,
        "drawdown_absolu": float(max(0.0, capital - valeur.min())),
        "drawdown_max_eur": float(chute_eur.max()),
        "drawdown_max_pct": float(chute_pct.min()),
        "date_pire_chute": chute_pct.idxmin().date().isoformat(),
        "nb_trades": int(len(fermes)), "nb_en_cours": int((trades["statut"] == "en cours").sum()),
        "nb_ordres": int(len(resultat.ordres)),
        "gagnants_pct": float(len(gagnants) / len(r)) if len(r) else 0.0,
        "perdants_pct": float(len(perdants) / len(r)) if len(r) else 0.0,
        "plus_gros_gain": float(gagnants.max()) if len(gagnants) else 0.0,
        "plus_grosse_perte": float(perdants.min()) if len(perdants) else 0.0,
        "gain_moyen": float(gagnants.mean()) if len(gagnants) else 0.0,
        "perte_moyenne": float(perdants.mean()) if len(perdants) else 0.0,
        "gains_consecutifs": {"nombre": serie_g[0], "montant": serie_g[1]},
        "pertes_consecutives": {"nombre": serie_p[0], "montant": serie_p[1]},
        "duree_moyenne_jours": float(fermes["jours"].mean()) if len(fermes) else 0.0,
        "frais_total": float(resultat.ordres["frais"].sum() / resultat.valeur.iloc[0] * capital),
        "investi_moyen": float(resultat.poids.sum(axis=1).mean()),
        "par_mois": par_mois, "par_jour": par_jour, "par_actif": par_actif,
        "par_annee": {int(a): float(v) for a, v in par_annee.items()},
    }


def texte(chiffres):
    """Le rapport en texte, pour le terminal."""
    vide = lambda v: v is None or (isinstance(v, float) and math.isnan(v))
    e = lambda v: "—" if vide(v) else f"{v:,.2f} €".replace(",", " ").replace(".", ",")
    p = lambda v: "—" if vide(v) else f"{v * 100:.1f} %".replace(".", ",")
    n = lambda v: "—" if vide(v) else f"{v:.2f}".replace(".", ",")
    g, pc = chiffres["gains_consecutifs"], chiffres["pertes_consecutives"]
    lignes = [
        ("Période", f"{chiffres['debut']} -> {chiffres['fin']} ({chiffres['jours_de_bourse']} jours de bourse)"),
        ("Dépôt initial", e(chiffres["capital"])),
        ("Profit total net", f"{e(chiffres['profit_net'])}  (valeur finale {e(chiffres['valeur_finale'])})"),
        ("Rendement par an", p(chiffres["rendement_annuel"])),
        ("Profit brut / perte brute", f"{e(chiffres['profit_brut'])} / {e(chiffres['perte_brute'])}"),
        ("Facteur de profit", n(chiffres['facteur_profit'])),
        ("Gain attendu par trade", e(chiffres["gain_attendu"])),
        ("Facteur de récupération", n(chiffres['facteur_recuperation'])),
        ("Ratio de Sharpe (annuel)", n(chiffres['sharpe_annuel'])),
        ("Drawdown absolu", e(chiffres["drawdown_absolu"])),
        ("Drawdown maximal", f"{e(chiffres['drawdown_max_eur'])}  ({p(chiffres['drawdown_max_pct'])}, le {chiffres['date_pire_chute']})"),
        ("Trades fermés", f"{chiffres['nb_trades']}  (+ {chiffres['nb_en_cours']} en cours, {chiffres['nb_ordres']} ordres)"),
        ("Trades gagnants / perdants", f"{p(chiffres['gagnants_pct'])} / {p(chiffres['perdants_pct'])}"),
        ("Plus gros gain / plus grosse perte", f"{e(chiffres['plus_gros_gain'])} / {e(chiffres['plus_grosse_perte'])}"),
        ("Gain moyen / perte moyenne", f"{e(chiffres['gain_moyen'])} / {e(chiffres['perte_moyenne'])}"),
        ("Gains consécutifs max", f"{g['nombre']} trades ({e(g['montant'])})"),
        ("Pertes consécutives max", f"{pc['nombre']} trades ({e(pc['montant'])})"),
        ("Durée moyenne d'un trade", f"{chiffres['duree_moyenne_jours']:.0f} jours de bourse"),
        ("Frais payés au total", e(chiffres["frais_total"])),
        ("Part investie en moyenne", p(chiffres["investi_moyen"])),
    ]
    largeur = max(len(n) for n, _ in lignes)
    return "\n".join(f"  {n:<{largeur}}  {v}" for n, v in lignes)
