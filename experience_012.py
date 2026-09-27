"""Expérience EXP-012 : la v3 offensive d'EXP-010 (17 %) avec un plafond par actif relevé de 25 % à 40 %.

Critères fixés AVANT les tests (EXPERIENCES.md) : ceux d'EXP-010 (M1 +1,5 point, M2 Sharpe 90 %, seuils de chute
décalés de 10 points, K1 krachs simulés), contre la v3, avec 2 variantes de plafond en plus dans R1.
On ne les modifie pas après avoir vu les résultats.
"""
from math import sqrt

import numpy as np

import experience_010
import krachs_simules
from outils_experience import frais_par_an, lancer_experience
from robot.parametres import JOURS_PAR_AN, PLAFONDS_RELEVES
from robot.portefeuille import est_crypto
from robot.simulation import mesures, strategie_v2
from experience_010 import SEUILS_CHUTE, V3, criteres_mieux, verdict_krachs

RELEVEE = {**experience_010.OFFENSIVE, "plafonds": PLAFONDS_RELEVES}
NOM = "v3 offensive, plafonds 40 %"


def variantes_reglages():
    """Les 12 variantes du test R1 : les 10 d'EXP-010, plus plafond 30 % et 50 %."""
    return {
        **experience_010.variantes_reglages(),
        "Plafond 30 %": {"plafonds": {**PLAFONDS_RELEVES, "part_max": 0.30}},
        "Plafond 50 %": {"plafonds": {**PLAFONDS_RELEVES, "part_max": 0.50}},
    }


def critere_krachs(ouvertures, clotures, risque):
    print("\nK1 — Krachs simulés (krach type : actions -20 %, crypto -40 %…)")
    resultat = strategie_v2(ouvertures, clotures, risque=risque, **RELEVEE)
    pire_nuit = float(krachs_simules.choc_d_une_nuit(resultat)["chute_totale"].min())
    pires = krachs_simules.krachs_au_hasard(ouvertures, clotures, reglage=RELEVEE)
    ok, part = verdict_krachs(pire_nuit, pires)
    print(f"  Krach d'une nuit, pire soir : chute totale {pire_nuit:.1%} (limite -35 %)")
    print(f"  {krachs_simules.KRACHS} krachs au hasard ({len(pires)} tirages) : médiane {np.median(pires):.1%},"
          f" pire {pires.min():.1%}, au-delà de -35 % : {part:.0%} des tirages (5 % au plus)  {'✅' if ok else '❌'}")
    return {"K1 Krachs simulés": ok}


def informations(ouvertures, clotures, risque):
    for nom, reglage in (("v3 (12 %, 25 %)", V3), ("v3 offensive (17 %, 25 %)", experience_010.OFFENSIVE),
                         (NOM, RELEVEE)):
        r = strategie_v2(ouvertures, clotures, risque=risque, details=True, **reglage)
        annees = len(r.valeur) / JOURS_PAR_AN
        agitation = r.valeur.pct_change().std() * sqrt(JOURS_PAR_AN)
        crypto = r.poids[[s for s in r.poids.columns if est_crypto(s)]].sum(axis=1).mean()
        print(f"  {nom:<28} agitation {agitation:.1%} · investi {r.poids.sum(axis=1).mean():.0%}"
              f" · plus grosse part {r.poids.max(axis=1).mean():.0%} (max {r.poids.max().max():.0%})"
              f" · crypto {crypto:.1%} · {len(r.ordres) / annees:.0f} ordres/an · frais {frais_par_an(r):.2%}/an"
              f" · Sharpe {mesures(r.valeur)['sharpe']:.2f}")


if __name__ == "__main__":
    lancer_experience("EXP-012", NOM, RELEVEE, variantes_reglages(), informations, base_reglage=V3, base_nom="v3",
                      criteres_mieux=criteres_mieux, seuils_chute=SEUILS_CHUTE, criteres_supplementaires=critere_krachs)
