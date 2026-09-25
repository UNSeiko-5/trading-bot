"""Test anti-chance de la règle des 200 jours (expérience EXP-001).

Un seul bon backtest ne prouve rien : on vérifie que le résultat tient avec d'autres
réglages, sur d'autres périodes, avec plus de frais, sur d'autres marchés, et qu'il
fait mieux que le hasard.

Les critères ci-dessous ont été fixés AVANT de lancer les tests (voir EXPERIENCES.md).
On ne les modifie pas après avoir vu les résultats.
"""
import numpy as np
import pandas as pd
import yfinance as yf

from backtest import FRAIS, rendements_strategie, resume, simuler

# --- Critères fixés à l'avance -------------------------------------------------------
REDUCTION_CHUTE_MIN = 1 / 3   # pire chute au moins 1/3 plus petite que « acheter et garder »
ECART_RENDEMENT_MAX = 0.015   # test 1 : rendement à ±1,5 point du réglage 200 jours
PERTE_FRAIS_X3_MAX = 0.01     # test 3 : perte de moins de 1 point par an avec frais x3
PERCENTILE_HASARD_MIN = 0.95  # test 5 : meilleure qu'au moins 95 % des versions au hasard

REGLAGES = [150, 180, 200, 220, 250]
PERIODES = [("1993", "2007"), ("2008", "2015"), ("2016", "2026")]
AUTRES_MARCHES = {
    "QQQ": "Nasdaq 100",
    "IWM": "petites entreprises US",
    "EFA": "pays développés hors US",
    "EEM": "pays émergents",
}
TIRAGES_HASARD = 500


def telecharger(symbole):
    historique = yf.Ticker(symbole).history(period="max", auto_adjust=True)
    if historique.empty:
        raise SystemExit(f"Aucune donnée reçue de Yahoo pour {symbole}, réessaie plus tard.")
    return historique


def critere_principal(strategie, buy_hold):
    """Gagne de l'argent ET pire chute au moins 1/3 plus petite que « acheter et garder »."""
    return (
        strategie["rendement_annuel"] > 0
        and strategie["pire_chute"] >= buy_hold["pire_chute"] * (1 - REDUCTION_CHUTE_MIN)
    )


def ligne(nom, strategie, buy_hold, ok):
    return (
        f"  {nom:<42} stratégie {strategie['rendement_annuel']:+6.1%}/an, chute {strategie['pire_chute']:6.1%}"
        f" | acheter et garder {buy_hold['rendement_annuel']:+6.1%}/an, chute {buy_hold['pire_chute']:6.1%}"
        f"  {'✅' if ok else '❌'}"
    )


def test_reglages(spy):
    print("\nTEST 1 — Autres réglages de la moyenne (SPY)")
    reference = resume(simuler(spy)["strategie"])["rendement_annuel"]
    reussi = True
    for jours in REGLAGES:
        df = simuler(spy, fenetre=jours)
        strat, bh = resume(df["strategie"]), resume(df["buy_hold"])
        ok = critere_principal(strat, bh) and abs(strat["rendement_annuel"] - reference) <= ECART_RENDEMENT_MAX
        reussi &= ok
        print(ligne(f"{jours} jours", strat, bh, ok))
    return reussi


def test_periodes(spy):
    print("\nTEST 2 — Sous-périodes (SPY, 200 jours)")
    df = simuler(spy)
    tous_positifs, nb_ok = True, 0
    for debut, fin in PERIODES:
        morceau = df.loc[debut:fin]
        strat, bh = resume(morceau["strategie"]), resume(morceau["buy_hold"])
        ok = critere_principal(strat, bh)
        nb_ok += ok
        tous_positifs &= strat["rendement_annuel"] > 0
        print(ligne(f"{debut}-{fin}", strat, bh, ok))
    return tous_positifs and nb_ok >= 2


def test_frais(spy):
    print("\nTEST 3 — Frais multipliés par 3 (SPY, 200 jours)")
    normal = resume(simuler(spy)["strategie"])
    triple = resume(simuler(spy, frais=3 * FRAIS)["strategie"])
    perte = normal["rendement_annuel"] - triple["rendement_annuel"]
    ok = triple["rendement_annuel"] > 0 and perte < PERTE_FRAIS_X3_MAX
    print(f"  frais {FRAIS:.2%} : {normal['rendement_annuel']:+.1%}/an")
    print(f"  frais {3 * FRAIS:.2%} : {triple['rendement_annuel']:+.1%}/an  (perte : {perte:.2%} par an)  {'✅' if ok else '❌'}")
    return ok


def test_marches():
    print("\nTEST 4 — Autres marchés jamais utilisés (200 jours)")
    nb_ok = 0
    for symbole, description in AUTRES_MARCHES.items():
        df = simuler(telecharger(symbole))
        strat, bh = resume(df["strategie"]), resume(df["buy_hold"])
        ok = critere_principal(strat, bh)
        nb_ok += ok
        print(ligne(f"{symbole} ({description}) depuis {df.index[0].year}", strat, bh, ok))
    return nb_ok >= 3


def test_hasard(spy):
    print(f"\nTEST 5 — Hasard : mêmes entrées/sorties décalées au hasard ({TIRAGES_HASARD} tirages, SPY)")
    df = simuler(spy)
    vraie = resume(df["strategie"])
    aleatoire = np.random.default_rng(42)  # graine fixe : même résultat à chaque lancement
    chutes, rendements = [], []
    for decalage in aleatoire.integers(252, len(df) - 252, TIRAGES_HASARD):
        position = pd.Series(np.roll(df["position"].to_numpy(), decalage), index=df.index)
        r = resume(rendements_strategie(df["Open"], df["Close"], position))
        chutes.append(r["pire_chute"])
        rendements.append(r["rendement_annuel"])
    part_chute = np.mean(vraie["pire_chute"] > np.array(chutes))
    part_rendement = np.mean(vraie["rendement_annuel"] > np.array(rendements))
    ok = part_chute >= PERCENTILE_HASARD_MIN
    print(f"  pire chute : meilleure que {part_chute:.0%} des versions au hasard"
          f" (médiane du hasard : {np.median(chutes):.1%})  {'✅' if ok else '❌'}")
    print(f"  rendement  : meilleur que {part_rendement:.0%} des versions au hasard"
          f" (médiane du hasard : {np.median(rendements):+.1%}/an)  (information)")
    return ok


if __name__ == "__main__":
    spy = telecharger("SPY")
    resultats = {
        "1. Autres réglages": test_reglages(spy),
        "2. Sous-périodes": test_periodes(spy),
        "3. Frais x3": test_frais(spy),
        "4. Autres marchés": test_marches(),
        "5. Hasard": test_hasard(spy),
    }
    print("\nVERDICT")
    for nom, ok in resultats.items():
        print(f"  {nom:<20} {'✅ réussi' if ok else '❌ échoué'}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/5 tests réussis -> "
          + ("la règle est jugée SOLIDE." if nb == 5 else "la règle n'est PAS jugée solide (voir les tests échoués)."))
