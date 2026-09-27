"""Krachs simulés (stress test, idée de la vidéo de la boîte à idées) : la v3 tiendrait-elle un krach soudain ?

Pour information seulement : rien ici ne change la stratégie. Deux tests :

1. Choc d'une nuit : chaque soir du backtest, on calcule ce qu'aurait coûté un krach tombé pendant la nuit
   (le robot n'a pas le temps de réagir), en plus de la chute déjà en cours ce soir-là. La chute totale
   aurait-elle dépassé -20 % (arrêt des achats) ou -25 % (arrêt total, ta limite) ?
2. Krachs injectés au hasard (comme dans la vidéo) : `TIRAGES` fois, on place `KRACHS` krachs à des dates tirées
   au hasard, puis on rejoue toute la v3 (signaux, agitation et multiplicateur réagissent après le krach).

Le krach type est fixé à l'avance d'après l'histoire (pas ajusté sur nos résultats) : actions et immobilier
-20 % (19 octobre 1987 : S&P 500 -20,5 % en un jour), matières premières -10 %, or -5 %, obligations 0 %,
crypto -40 % (12 mars 2020 : Bitcoin environ -40 %).
"""
import numpy as np
import pandas as pd

from robot.parametres import ARRET_ACHATS_CHUTE, ARRET_TOTAL_CHUTE, BUDGET_RISQUE, DEBUT_BACKTEST, TAMPON
from robot.simulation import mesures, strategie_v2
from robot.univers import PAR_SYMBOLE

V3 = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
CHOC = {"Actions": -0.20, "Immobilier": -0.20, "Matières premières": -0.10, "Or": -0.05, "Obligations": 0.0,
        "Crypto": -0.40, "Devises": 0.0}   # Devises : EXP-011 (dollar et yen montent plutôt pendant un krach)
KRACHS, TIRAGES, GRAINE = 3, 100, 42


def chocs(symboles, choc=CHOC):
    return pd.Series({s: choc[PAR_SYMBOLE[s].classe] for s in symboles})


def choc_d_une_nuit(resultat, choc=CHOC):
    """Pour chaque soir : perte due au krach seul, et chute totale depuis le sommet si le krach tombait
    cette nuit-là : (1 + chute du soir) x (1 + perte du krach) - 1."""
    perte = resultat.poids.mul(chocs(resultat.poids.columns, choc), axis=1).sum(axis=1)
    chute = resultat.valeur / resultat.valeur.cummax() - 1
    return pd.DataFrame({"perte": perte, "chute_totale": (1 + chute) * (1 + perte) - 1})


def injecter_krach(ouvertures, clotures, date, choc=CHOC):
    """Krach à l'ouverture de `date` : tous les prix à partir de ce jour (ouverture comprise) baissent du choc.
    La clôture de la veille ne change pas : le robot, qui a décidé la veille, subit le krach sans réagir."""
    facteurs = chocs(clotures.columns, choc) + 1
    o, c = ouvertures.copy(), clotures.copy()
    o.loc[date:] = o.loc[date:] * facteurs
    c.loc[date:] = c.loc[date:] * facteurs
    return o, c


def krachs_au_hasard(ouvertures, clotures, reglage=V3, krachs=KRACHS, tirages=TIRAGES, graine=GRAINE, debut=DEBUT_BACKTEST):
    """Pire chute de la version `reglage` rejouée avec `krachs` krachs placés au hasard, pour chaque tirage."""
    aleatoire = np.random.default_rng(graine)
    dates = clotures.loc[debut:].index[1:]
    pires = []
    for _ in range(tirages):
        o, c = ouvertures, clotures
        for date in sorted(aleatoire.choice(dates, size=krachs, replace=False)):
            o, c = injecter_krach(o, c, date)
        pires.append(mesures(strategie_v2(o, c, debut=debut, **reglage).valeur)["pire_chute"])
    return np.array(pires)


def afficher(ouvertures, clotures):
    v3 = strategie_v2(ouvertures, clotures, **V3)
    print("KRACHS SIMULÉS (stress test de la v3, pour information)")
    print("  Krach type : " + ", ".join(f"{classe} {valeur * 100:+.0f} %" for classe, valeur in CHOC.items()))
    print(f"  Sans krach : pire chute de la v3 {mesures(v3.valeur)['pire_chute']:.1%}\n")

    nuit = choc_d_une_nuit(v3)
    pire_perte, pire_total = nuit["perte"].idxmin(), nuit["chute_totale"].idxmin()
    print("1. Krach d'une nuit, placé sur chaque soir du backtest")
    print(f"  Pire perte due au krach seul : {nuit['perte'].min():.1%} (soir du {pire_perte.date()})")
    print(f"  Pire chute totale (chute en cours + krach) : {nuit['chute_totale'].min():.1%}"
          f" (soir du {pire_total.date()})")
    print(f"  Soirs où la chute totale aurait dépassé -20 % : {(nuit['chute_totale'] <= -ARRET_ACHATS_CHUTE).mean():.1%}"
          f" · -25 % : {(nuit['chute_totale'] <= -ARRET_TOTAL_CHUTE).mean():.1%}")

    pires = krachs_au_hasard(ouvertures, clotures)
    print(f"\n2. {KRACHS} krachs placés au hasard, v3 rejouée en entier ({TIRAGES} tirages)")
    print(f"  Pire chute : médiane {np.median(pires):.1%} · 5 % des cas pires que {np.quantile(pires, 0.05):.1%}"
          f" · la pire de toutes {pires.min():.1%}")
    print(f"  Tirages au-delà de -20 % : {(pires <= -ARRET_ACHATS_CHUTE).mean():.0%}"
          f" · au-delà de -25 % (ta limite) : {(pires <= -ARRET_TOTAL_CHUTE).mean():.0%}")
    print("  Rappel : dans le vrai robot, l'arrêt à -25 % vend tout ; ici, on mesure la chute sans cet arrêt.")


if __name__ == "__main__":
    from robot.donnees import charger

    donnees = charger()
    afficher(donnees.ouvertures, donnees.clotures)
