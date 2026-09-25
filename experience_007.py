"""Expérience EXP-007 : croisement de moyennes en H1, filtré par la tendance weekly, stop et stop suiveur.

Idée de l'utilisateur. Critères fixés AVANT les tests (EXPERIENCES.md) : les 10 d'EXP-006, avec la v3 comme
base, sur la période couverte par les bougies H1 d'Alpaca. Moins de 6 ans de données : non concluant.
"""
import os
from math import sqrt

import numpy as np
import pandas as pd

from backtest_v2 import verifier_performance
from outils_experience import verifier_mieux
from robot.h1 import REGLAGE_H1, charger_h1, strategie_h1
from robot.parametres import BUDGET_RISQUE, FRAIS, JOURS_PAR_AN, TAMPON
from robot.portefeuille import est_crypto
from robot.simulation import mesures, points_de_comparaison, strategie_v2
from robustesse_v2 import (
    R1_CHUTE_MIN, R1_ECART_NOTE_MAX, R1_RENDEMENT_MIN, R3_CHUTE_MIN, R3_PERTE_MAX, R4_CHUTE_MIN, R4_RENDEMENT_MIN,
    R5_PART_MIN, R5_TIRAGES, ligne,
)

NOM = "H1 filtrée weekly"
M2_PART_MIN = 0.90
ANNEES_MIN = 6


def variantes_reglages():
    """Les 10 variantes du test R1 (EXPERIENCES.md, EXP-007)."""
    return {
        "Moyennes H1 10/30": {"courte": 10, "longue": 30},
        "Moyennes H1 40/100": {"courte": 40, "longue": 100},
        "Stop initial 3 ATR": {"stop_init": 3.0},
        "Stop suiveur 2 ATR": {"suiveur": 2.0},
        "Stop suiveur 5 ATR": {"suiveur": 5.0},
        "Risque 0,25 % par trade": {"risque": 0.0025},
        "Risque 1 % par trade": {"risque": 0.01},
        "Sans filtre weekly": {"weekly": None},
        "Filtre weekly 5/20": {"weekly": (5, 20)},
        "Sortie si weekly baissier": {"sortie_weekly": True},
    }


def statistiques(resultat, jours):
    trades = [t for t in resultat.trades if t[2] is not None]
    gains = np.array([t[3] for t in trades])
    duree = np.mean([(t[2] - t[1]).total_seconds() / 86400 for t in trades]) if trades else 0
    facteur = gains[gains > 0].sum() / -gains[gains < 0].sum() if (gains < 0).any() else float("nan")
    return (f"  {len(trades)} trades fermés ({len(trades) / (len(jours) / JOURS_PAR_AN):.0f} par an) · "
            f"gagnants {np.mean(gains > 0) if len(gains) else 0:.0%} · facteur de profit {facteur:.2f} · "
            f"durée moyenne {duree:.1f} jours · frais {resultat.frais / (len(jours) / JOURS_PAR_AN):.2%}/an · "
            f"investi en moyenne {resultat.exposition.mean():.0%}")


def lancer(barres, donnees):
    o, c = donnees.ouvertures, donnees.clotures
    premier, dernier = barres["SPY"].index[0], barres["SPY"].index[-1]
    annees = (dernier - premier).days / 365.25
    print(f"EXPÉRIENCE EXP-007 : {NOM} · bougies H1 Alpaca · données quotidiennes {donnees.empreinte()}")
    for s, b in barres.items():
        print(f"  {s:<8} {len(b):>7} bougies H1 du {b.index[0].date()} au {b.index[-1].date()}")
    if annees < ANNEES_MIN:
        print(f"\nVERDICT EXP-007 : NON CONCLUANT. {annees:.1f} ans de bougies H1 pour les ETF (minimum fixé : {ANNEES_MIN}).")
        return None

    # Période commune : du premier jour complet de bougies H1 à la dernière séance terminée des deux sources
    debut = (premier + pd.Timedelta(days=30)).tz_localize(None).normalize()
    fin = min(dernier.tz_localize(None).normalize() - pd.Timedelta(days=1), c.index[-1])
    jours = c.loc[debut:fin].index
    base = lambda **k: strategie_h1(barres, c, jours, **k)
    normalise = lambda v: v / v.iloc[0]

    h1 = base()
    v3 = strategie_v2(o, c, debut=jours[0], budget=BUDGET_RISQUE, tampon=TAMPON).valeur.loc[:fin]
    references = {n: v.loc[jours[0]:fin] for n, v in points_de_comparaison(o, c, debut=jours[0]).items()}
    m_h1, m_v3 = mesures(normalise(h1.valeur)), mesures(normalise(v3))
    m_refs = {n: mesures(normalise(v)) for n, v in references.items()}
    print(f"\nPériode : {jours[0].date()} -> {jours[-1].date()} ({len(jours) / JOURS_PAR_AN:.1f} ans), frais compris\n")
    print(ligne(NOM, m_h1))
    print(ligne("v3 (base à battre)", m_v3))
    for n, m in m_refs.items():
        print(ligne(n, m))
    print("\nPour information")
    print(statistiques(h1, jours))

    resultats = {}
    print("\nMieux que la v3")
    for nom, ok, detail in verifier_mieux(m_h1, m_v3, M2_PART_MIN, base="la v3"):
        resultats[nom] = ok
        print(f"  {'✅' if ok else '❌'} {nom} : {detail}")
    print("\nPerformance")
    for nom, ok, detail in verifier_performance(m_h1, m_refs):
        resultats[nom] = ok
        print(f"  {'✅' if ok else '❌'} {nom} : {detail}")

    print("\nR1 — Autres réglages")
    tous = True
    for nom, reglage in variantes_reglages().items():
        m = mesures(normalise(base(reglage=reglage).valeur))
        ecart = abs(m["note_rendement_risque"] / m_h1["note_rendement_risque"] - 1) if m_h1["note_rendement_risque"] else float("inf")
        ok = m["rendement_annuel"] >= R1_RENDEMENT_MIN and m["pire_chute"] > R1_CHUTE_MIN and ecart <= R1_ECART_NOTE_MAX
        tous &= ok
        print(ligne(nom, m, ok) + f"   (écart de note {ecart:.0%})")
    resultats["R1 Autres réglages"] = tous

    print("\nR2 — Trois tiers de la période (comparés au 60/40)")
    positifs, meilleurs = True, 0
    soixante = references["60/40 (SPY/IEF)"]
    for tiers in np.array_split(np.arange(len(jours)), 3):
        a, b = jours[tiers[0]], jours[tiers[-1]]
        m, ref = mesures(h1.valeur.loc[a:b]), mesures(soixante.loc[a:b])
        meilleur = m["note_rendement_risque"] > ref["note_rendement_risque"]
        positifs &= m["rendement_annuel"] > 0
        meilleurs += meilleur
        print(ligne(f"{a.date()} -> {b.date()}", m, m["rendement_annuel"] > 0 and meilleur)
              + f"   (60/40 : {ref['rendement_annuel']:+.1%}/an, note {ref['note_rendement_risque']:.2f})")
    resultats["R2 Sous-périodes"] = positifs and meilleurs >= 2

    print("\nR3 — Frais multipliés par 3")
    m = mesures(normalise(base(frais={k: 3 * v for k, v in FRAIS.items()}).valeur))
    perte = m_h1["rendement_annuel"] - m["rendement_annuel"]
    resultats["R3 Frais x3"] = perte < R3_PERTE_MAX and m["pire_chute"] > R3_CHUTE_MIN
    print(ligne("Frais x3", m, resultats["R3 Frais x3"]) + f"   (perte : {perte:.2%} par an)")

    print("\nR4 — Sans la crypto")
    sans = {s: b for s, b in barres.items() if not est_crypto(s)}
    m = mesures(normalise(strategie_h1(sans, c, jours).valeur))
    note_60_40 = m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"]
    resultats["R4 Sans la crypto"] = (m["pire_chute"] > R4_CHUTE_MIN and m["rendement_annuel"] >= R4_RENDEMENT_MIN
                                      and m["note_rendement_risque"] > note_60_40)
    print(ligne("Sans Bitcoin ni Ethereum", m, resultats["R4 Sans la crypto"]) + f"   (60/40 : note {note_60_40:.2f})")

    print(f"\nR5 — Hasard : entrées décalées au hasard dans le temps ({R5_TIRAGES} tirages)")
    aleatoire = np.random.default_rng(42)
    notes = []
    for _ in range(R5_TIRAGES):
        decalages = {s: int(aleatoire.integers(len(b) // 10, len(b) - len(b) // 10)) for s, b in barres.items()}
        notes.append(mesures(normalise(base(decalages=decalages).valeur))["note_rendement_risque"])
    part = float(np.mean(m_h1["note_rendement_risque"] > np.array(notes)))
    resultats["R5 Hasard"] = part >= R5_PART_MIN
    print(f"  Note R/R ({m_h1['note_rendement_risque']:.2f}) meilleure que {part:.0%} des versions au hasard"
          f" (médiane du hasard : {np.median(notes):.2f})  {'✅' if resultats['R5 Hasard'] else '❌'}")

    print("\nVERDICT EXP-007")
    for nom, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {nom}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + (f"« {NOM} » devient la base à battre." if nb == len(resultats) else "la v3 reste la base à battre."))
    return resultats


if __name__ == "__main__":
    from robot.donnees import charger
    from robot.univers import UNIVERS

    donnees = charger()
    barres = charger_h1([a.symbole for a in UNIVERS], "2016-01-01",
                        os.getenv("ALPACA_API_KEY"), os.getenv("ALPACA_SECRET_KEY"))
    lancer(barres, donnees)
