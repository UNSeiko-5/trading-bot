"""Backtest de la stratégie v2 depuis 2007, comparé aux 4 points de comparaison (expérience EXP-002).

Vérifie les critères de performance P1 à P3, fixés AVANT le test dans EXPERIENCES.md.
"""
from robot.donnees import charger
from robot.portefeuille import preparer_risque
from robot.simulation import mesures, points_de_comparaison, rendements_par_annee, strategie_v2

# --- Critères fixés à l'avance (EXPERIENCES.md, EXP-002) ------------------------------------------
PIRE_CHUTE_MIN = -0.20
RENDEMENT_MIN = 0.06


def verifier_performance(v2, references):
    """Renvoie la liste des critères P1 à P3 : (nom, réussi, détail)."""
    moins_bons = [nom for nom, m in references.items() if m["note_rendement_risque"] >= v2["note_rendement_risque"]]
    return [
        ("P1 Pire chute meilleure que -20 %", v2["pire_chute"] > PIRE_CHUTE_MIN, f"{v2['pire_chute']:.1%}"),
        ("P2 Rendement d'au moins 6 % par an", v2["rendement_annuel"] >= RENDEMENT_MIN, f"{v2['rendement_annuel']:+.1%}"),
        ("P3 Meilleure note rendement/risque que les 4 références", not moins_bons,
         f"{v2['note_rendement_risque']:.2f}" + (f" (battue par : {', '.join(moins_bons)})" if moins_bons else "")),
    ]


def ligne(nom, m):
    return (f"  {nom:<27} {m['rendement_annuel']:+8.1%} {m['pire_chute']:10.1%} {m['note_rendement_risque']:9.2f}"
            f" {m['agitation']:10.1%} {m['sharpe']:7.2f} {m['plus_longue_chute_annees']:9.1f} ans")


if __name__ == "__main__":
    donnees = charger()
    risque = preparer_risque(donnees.clotures)
    v2 = strategie_v2(donnees.ouvertures, donnees.clotures, risque=risque)
    references = points_de_comparaison(donnees.ouvertures, donnees.clotures, risque=risque)

    debut, fin = v2.valeur.index[0].date(), v2.valeur.index[-1].date()
    print(f"BACKTEST v2 — {debut} -> {fin} ({len(v2.valeur) / 252:.1f} ans), frais compris"
          f" · données {donnees.empreinte()}\n")
    print(f"  {'':<27} {'Rend./an':>8} {'Pire chute':>10} {'Note R/R':>9} {'Agitation':>10} {'Sharpe':>7} "
          f"{'Plus longue chute':>17}")
    m_v2 = mesures(v2.valeur)
    print(ligne("Stratégie v2", m_v2))
    m_refs = {nom: mesures(valeur) for nom, valeur in references.items()}
    for nom, m in m_refs.items():
        print(ligne(nom, m))

    annees = len(v2.valeur) / 252
    print(f"\n  v2 : investie en moyenne {v2.poids.sum(axis=1).mean():.0%} du capital"
          f" · montant échangé {v2.rotation.sum() / annees:.0%} du capital par an"
          f" · frais {v2.frais.sum() / annees:.2%} par an")
    print("  Note R/R = rendement annuel ÷ pire chute. Sharpe = rendement ÷ agitation (plus c'est haut, mieux c'est).")

    print("\nANNÉE PAR ANNÉE")
    par_annee = {"v2": rendements_par_annee(v2.valeur)}
    par_annee.update({nom: rendements_par_annee(valeur) for nom, valeur in references.items()})
    noms = list(par_annee)
    courts = {"Acheter et garder SPY": "SPY", "60/40 (SPY/IEF)": "60/40", "v1 (200 jours sur SPY)": "v1",
              "Même panier sans signaux": "Sans signaux"}
    print("  Année " + "".join(f"{courts.get(nom, nom):>14}" for nom in noms))
    for annee in par_annee["v2"].index:
        print(f"  {annee}  " + "".join(f"{par_annee[nom].get(annee, float('nan')):+14.1%}" for nom in noms))

    print("\nCRITÈRES DE PERFORMANCE (fixés avant le test)")
    criteres = verifier_performance(m_v2, m_refs)
    for nom, ok, detail in criteres:
        print(f"  {'✅' if ok else '❌'} {nom} : {detail}")
    reussis = sum(ok for _, ok, _ in criteres)
    print(f"\n  {reussis}/3 critères de performance réussis (la robustesse R1 à R5 sera testée à l'étape 6)")
