"""Expérience EXP-003 : la v2 + 3 détecteurs de cassure (canal de Donchian) dans la note combinée.

Les critères ci-dessous ont été fixés AVANT les tests (EXPERIENCES.md). On ne les modifie pas
après avoir vu les résultats. La version « v2 + cassures » remplace la v2 comme base à battre
seulement si les 10 critères sont réussis : M1-M2 (mieux que la v2), P1-P3 et R1-R5 (mêmes seuils
qu'EXP-002).
"""
from statistics import mean

from backtest_v2 import verifier_performance
from robot.donnees import charger
from robot.parametres import CASSURES, DEBUT_BACKTEST, DETECTEURS
from robot.portefeuille import preparer_risque
from robot.signaux import notes_detecteurs
from robot.simulation import mesures, points_de_comparaison, strategie_v2
import robustesse_v2

# --- Critères fixés à l'avance (EXPERIENCES.md, EXP-003) ------------------------------------------
M1_GAIN_MIN = 0.005     # au moins +0,5 point de rendement par an par rapport à la v2
AVEC_CASSURES = {"cassures": CASSURES}
NOM = "v2 + cassures"


def variantes_reglages():
    """Les 10 variantes du test R1. Chacune modifie la version « v2 + cassures ».
    Les 5 dernières sont exactement celles d'EXP-002 ; les facteurs de cassure sont ceux publiés."""
    v2 = robustesse_v2.variantes_reglages()
    return {
        "Cassures seules": {"detecteurs": []},
        "Horizon court seul (16/64 + 40)": {"detecteurs": [DETECTEURS[0]], "cassures": [CASSURES[0]]},
        "Horizon long seul (64/256 + 160)": {"detecteurs": [DETECTEURS[-1]], "cassures": [CASSURES[-1]]},
        "Cassures 20, 40, 80 jours": {"cassures": [(20, 0.67), (40, 0.70), (80, 0.73)]},
        "Cassures 80, 160, 320 jours": {"cassures": [(80, 0.73), (160, 0.74), (320, 0.74)]},
        "Moyennes x1,5": v2["Toutes les moyennes x1,5"],
        **{nom: v2[nom] for nom in ("Agitation visée 10 %", "Agitation visée 14 %",
                                    "Seuil de transaction 1 %", "Seuil de transaction 4 %")},
    }


def verifier_mieux(nouvelle, v2):
    """Renvoie les critères M1 et M2 : (nom, réussi, détail)."""
    gain = nouvelle["rendement_annuel"] - v2["rendement_annuel"]
    return [
        ("M1 Au moins +0,5 point de rendement par an de plus que la v2", gain >= M1_GAIN_MIN,
         f"{nouvelle['rendement_annuel']:+.1%} contre {v2['rendement_annuel']:+.1%} ({gain * 100:+.2f} point)"),
        ("M2 Note rendement/risque au moins égale à celle de la v2",
         nouvelle["note_rendement_risque"] >= v2["note_rendement_risque"],
         f"{nouvelle['note_rendement_risque']:.2f} contre {v2['note_rendement_risque']:.2f}"),
    ]


def lien_et_echelle(clotures, cassures=CASSURES, debut=DEBUT_BACKTEST):
    """Pour information : lien moyen (corrélation) entre la note des cassures et celle des moyennes,
    et note moyenne des cassures en valeur absolue (visée : environ 10)."""
    liens, echelles = [], []
    for symbole in clotures.columns:
        details = notes_detecteurs(clotures[symbole], cassures=cassures).loc[debut:].dropna()
        if len(details) < 2:
            continue
        colonnes_cassures = [col for col in details.columns if col.startswith("cassure")]
        liens.append(details[colonnes_cassures].mean(axis=1).corr(details.drop(columns=colonnes_cassures).mean(axis=1)))
        echelles.append(details[colonnes_cassures].abs().stack().mean())
    return mean(liens), mean(echelles)


def ligne_tableau(nom, m, investi=None):
    part = f"{investi:9.0%}" if investi is not None else f"{'':>9}"
    return (f"  {nom:<27} {m['rendement_annuel']:+8.1%} {m['pire_chute']:10.1%} {m['note_rendement_risque']:9.2f}"
            f" {m['agitation']:10.1%} {m['sharpe']:7.2f} {part}")


def afficher_criteres(criteres):
    for nom, ok, detail in criteres:
        print(f"  {'✅' if ok else '❌'} {nom} : {detail}")


if __name__ == "__main__":
    donnees = charger()
    o, c = donnees.ouvertures, donnees.clotures
    risque = preparer_risque(c)
    v2 = strategie_v2(o, c, risque=risque)
    nouvelle = strategie_v2(o, c, risque=risque, **AVEC_CASSURES)
    base, m_v2 = mesures(nouvelle.valeur), mesures(v2.valeur)
    references = points_de_comparaison(o, c, risque=risque)
    m_refs = {nom: mesures(valeur) for nom, valeur in references.items()}

    debut, fin = nouvelle.valeur.index[0].date(), nouvelle.valeur.index[-1].date()
    print(f"EXPÉRIENCE EXP-003 : v2 + cassures — {debut} -> {fin} ({len(nouvelle.valeur) / 252:.1f} ans),"
          f" frais compris · données {donnees.empreinte()}\n")
    print(f"  {'':<27} {'Rend./an':>8} {'Pire chute':>10} {'Note R/R':>9} {'Agitation':>10} {'Sharpe':>7}"
          f" {'Investi':>9}")
    print(ligne_tableau(NOM, base, nouvelle.poids.sum(axis=1).mean()))
    print(ligne_tableau("v2 (base à battre)", m_v2, v2.poids.sum(axis=1).mean()))
    for nom, m in m_refs.items():
        print(ligne_tableau(nom, m))
    print(f"\n  Frais : {nouvelle.frais.sum() / (len(nouvelle.frais) / 252):.2%} par an"
          f" (v2 : {v2.frais.sum() / (len(v2.frais) / 252):.2%})")

    lien, echelle = lien_et_echelle(c)
    print(f"\nPour information : lien moyen entre cassures et moyennes = {lien:.2f} (1 = identiques) ;"
          f" note moyenne des cassures = {echelle:.1f} (visé : environ 10)")

    print("\nMieux que la v2")
    mieux = verifier_mieux(base, m_v2)
    afficher_criteres(mieux)
    print("\nPerformance")
    performance = verifier_performance(base, m_refs)
    afficher_criteres(performance)
    resultats = {nom: ok for nom, ok, _ in mieux + performance}

    resultats["R1 Autres réglages"] = robustesse_v2.test_r1(o, c, risque, base, variantes_reglages(), AVEC_CASSURES)
    resultats["R2 Sous-périodes"] = robustesse_v2.test_r2(nouvelle.valeur, references["60/40 (SPY/IEF)"])
    resultats["R3 Frais x3"] = robustesse_v2.test_r3(o, c, risque, base, AVEC_CASSURES)
    note_60_40 = m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"]
    resultats["R4 Sans la crypto"] = robustesse_v2.test_r4(o, c, note_60_40, AVEC_CASSURES)
    sans = [s for s in c.columns if not s.endswith("-USD")]
    print(robustesse_v2.ligne("(info) v2 sans la crypto", mesures(strategie_v2(o[sans], c[sans]).valeur)))
    resultats["R5 Hasard"] = robustesse_v2.test_r5(o, c, risque, base, AVEC_CASSURES, nom=NOM)

    print("\nVERDICT EXP-003")
    for nom, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {nom}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + ("« v2 + cassures » devient la base à battre." if nb == len(resultats)
             else "la v2 reste la base à battre (voir les critères échoués)."))
