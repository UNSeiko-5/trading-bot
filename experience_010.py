"""Expérience EXP-010 : robot plus offensif. La v3 vise 17 % d'agitation au lieu de 12 % (nouvelle limite : -35 %).

Critères fixés AVANT les tests (EXPERIENCES.md) : M1 +1,5 point de rendement, M2 Sharpe au moins 90 % de celui
de la v3, P1-P3 et R1-R5 avec les seuils de chute décalés de 10 points, et K1 (krachs simulés). On ne les
modifie pas après avoir vu les résultats.
"""
from math import sqrt

import numpy as np

import krachs_simules
from outils_experience import frais_par_an, lancer_experience
from robot.parametres import BUDGET_RISQUE, JOURS_PAR_AN, TAMPON, VOL_CIBLE_OFFENSIVE
from robot.portefeuille import est_crypto
from robot.simulation import mesures, strategie_v2
import robustesse_v2

V3 = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
OFFENSIVE = {**V3, "vol_cible": VOL_CIBLE_OFFENSIVE}
NOM = "v3 offensive (17 %)"
M1_GAIN_MIN = 0.015       # au moins +1,5 point de rendement par an
M2_SHARPE_MIN = 0.90      # Sharpe au moins 90 % de celui de la v3
LIMITE = -0.35            # nouvelle pire chute acceptée par l'utilisateur
SEUILS_CHUTE = {"P1": -0.30, "R1": -0.35, "R3": -0.30, "R4": -0.30}   # anciens seuils décalés de 10 points
K1_PART_MAX = 0.05        # au plus 5 % des tirages de krachs au-delà de -35 %


def criteres_mieux(nouvelle, v3):
    """Critères M1 et M2 d'EXP-010 : (nom, réussi, détail)."""
    gain = nouvelle["rendement_annuel"] - v3["rendement_annuel"]
    return [
        ("M1 Au moins +1,5 point de rendement par an de plus que la v3", gain >= M1_GAIN_MIN - 1e-9,
         f"{nouvelle['rendement_annuel']:+.1%} contre {v3['rendement_annuel']:+.1%} ({gain * 100:+.2f} point)"),
        ("M2 Sharpe au moins égal à 90 % de celui de la v3", nouvelle["sharpe"] >= M2_SHARPE_MIN * v3["sharpe"] - 1e-9,
         f"{nouvelle['sharpe']:.2f} contre {v3['sharpe']:.2f} (seuil {M2_SHARPE_MIN * v3['sharpe']:.2f})"),
    ]


def variantes_reglages():
    """Les 10 variantes du test R1, chacune modifiant « v3 offensive »."""
    budget = lambda **changements: {"budget": {**BUDGET_RISQUE, **changements}}
    return {
        "Agitation visée 15 %": {"vol_cible": 0.15},
        "Agitation visée 20 %": {"vol_cible": 0.20},
        "Sans multiplicateur": {"budget": None},
        "Borne haute 2": budget(borne_haute=2.0),
        "Borne haute 3": budget(borne_haute=3.0),
        "Fenêtre de mesure 1 an": budget(fenetre=252),
        "Fenêtre de mesure 4 ans": budget(fenetre=1008),
        "Zone tampon 5 %": {"tampon": 0.05},
        "Zone tampon 20 %": {"tampon": 0.20},
        "Moyennes x1,5": robustesse_v2.variantes_reglages()["Toutes les moyennes x1,5"],
    }


def verdict_krachs(pire_nuit, pires_hasard, limite=LIMITE, part_max=K1_PART_MAX):
    """K1 : le krach d'une nuit ne dépasse jamais la limite, et au plus `part_max` des tirages au hasard la dépassent."""
    part = float(np.mean(np.asarray(pires_hasard) <= limite))
    return pire_nuit > limite and part <= part_max, part


def critere_krachs(ouvertures, clotures, risque):
    print("\nK1 — Krachs simulés (krach type : actions -20 %, crypto -40 %…)")
    resultat = strategie_v2(ouvertures, clotures, risque=risque, **OFFENSIVE)
    pire_nuit = float(krachs_simules.choc_d_une_nuit(resultat)["chute_totale"].min())
    pires = krachs_simules.krachs_au_hasard(ouvertures, clotures, reglage=OFFENSIVE)
    ok, part = verdict_krachs(pire_nuit, pires)
    print(f"  Krach d'une nuit, pire soir : chute totale {pire_nuit:.1%} (limite -35 %)")
    print(f"  {krachs_simules.KRACHS} krachs au hasard ({len(pires)} tirages) : médiane {np.median(pires):.1%},"
          f" pire {pires.min():.1%}, au-delà de -35 % : {part:.0%} des tirages (5 % au plus)  {'✅' if ok else '❌'}")
    return {"K1 Krachs simulés": ok}


def informations(ouvertures, clotures, risque):
    for nom, reglage in (("v3 (12 %)", V3), (NOM, OFFENSIVE)):
        r = strategie_v2(ouvertures, clotures, risque=risque, **reglage)
        agitation = r.valeur.pct_change().std() * sqrt(JOURS_PAR_AN)
        crypto = r.poids[[s for s in r.poids.columns if est_crypto(s)]].sum(axis=1).mean()
        echange = r.rotation.sum() / (len(r.rotation) / JOURS_PAR_AN)
        m = mesures(r.valeur)
        print(f"  {nom:<22} agitation réalisée {agitation:.1%} · investi {r.poids.sum(axis=1).mean():.0%}"
              f" · crypto {crypto:.1%} · frais {frais_par_an(r):.2%}/an · échangé {echange:.0%}/an · Sharpe {m['sharpe']:.2f}")


if __name__ == "__main__":
    lancer_experience("EXP-010", NOM, OFFENSIVE, variantes_reglages(), informations, base_reglage=V3, base_nom="v3",
                      criteres_mieux=criteres_mieux, seuils_chute=SEUILS_CHUTE, criteres_supplementaires=critere_krachs)
