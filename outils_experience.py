"""Déroulé commun des expériences (EXP-003 et suivantes).

Chaque expérience compare une version modifiée à la base à battre (la v2 jusqu'à EXP-006, la v3 ensuite)
avec 10 critères fixés AVANT les tests dans EXPERIENCES.md : M1-M2 (mieux que la base), P1-P3 et R1-R5
(mêmes seuils qu'EXP-002).
"""
from backtest_v2 import verifier_performance
from robot.donnees import charger
from robot.portefeuille import preparer_risque
from robot.simulation import mesures, points_de_comparaison, strategie_v2
import robustesse_v2

M1_GAIN_MIN = 0.005     # au moins +0,5 point de rendement par an par rapport à la v2


def verifier_mieux(nouvelle, v2, m2_part_min=1.0):
    """Renvoie les critères M1 et M2 : (nom, réussi, détail).
    `m2_part_min` : part minimale de la note rendement/risque de la v2 à garder (1 = au moins égale)."""
    gain = nouvelle["rendement_annuel"] - v2["rendement_annuel"]
    nom_m2 = ("M2 Note rendement/risque au moins égale à celle de la v2" if m2_part_min == 1 else
              f"M2 Note rendement/risque au moins égale à {m2_part_min * 100:.0f} % de celle de la v2")
    return [
        ("M1 Au moins +0,5 point de rendement par an de plus que la v2", gain >= M1_GAIN_MIN,
         f"{nouvelle['rendement_annuel']:+.1%} contre {v2['rendement_annuel']:+.1%} ({gain * 100:+.2f} point)"),
        (nom_m2, nouvelle["note_rendement_risque"] >= m2_part_min * v2["note_rendement_risque"],
         f"{nouvelle['note_rendement_risque']:.2f} contre {v2['note_rendement_risque']:.2f}"),
    ]


def ligne_tableau(nom, m, investi=None):
    part = f"{investi:9.0%}" if investi is not None else f"{'':>9}"
    return (f"  {nom:<27} {m['rendement_annuel']:+8.1%} {m['pire_chute']:10.1%} {m['note_rendement_risque']:9.2f}"
            f" {m['agitation']:10.1%} {m['sharpe']:7.2f} {part}")


def afficher_criteres(criteres):
    for nom, ok, detail in criteres:
        print(f"  {'✅' if ok else '❌'} {nom} : {detail}")


def frais_par_an(resultat):
    return resultat.frais.sum() / (len(resultat.frais) / 252)


def lancer_experience(code, nom, reglage, variantes, informations=None, m2_part_min=1.0, reglage_base=None,
                      nom_base="v2", criteres_mieux=None):
    """Lance toute l'expérience sur les vraies données et affiche le verdict.

    `reglage` : la version testée (arguments de strategie_v2 ; vide = la v2).
    `variantes` : les variantes du test R1, chacune modifiant `reglage`.
    `informations(ouvertures, clotures, risque)` : affiche des chiffres pour information (pas des critères).
    `reglage_base`, `nom_base` : la base à battre (vide = la v2).
    `criteres_mieux(nouvelle, base)` : critères M propres à l'expérience (sinon `verifier_mieux`).
    """
    donnees = charger()
    o, c = donnees.ouvertures, donnees.clotures
    risque = preparer_risque(c)
    reference = strategie_v2(o, c, risque=risque, **(reglage_base or {}))
    nouvelle = strategie_v2(o, c, risque=risque, **reglage)
    base, m_reference = mesures(nouvelle.valeur), mesures(reference.valeur)
    references = points_de_comparaison(o, c, risque=risque)
    m_refs = {n: mesures(valeur) for n, valeur in references.items()}

    debut, fin = nouvelle.valeur.index[0].date(), nouvelle.valeur.index[-1].date()
    print(f"EXPÉRIENCE {code} : {nom} — {debut} -> {fin} ({len(nouvelle.valeur) / 252:.1f} ans),"
          f" frais compris · données {donnees.empreinte()}\n")
    print(f"  {'':<27} {'Rend./an':>8} {'Pire chute':>10} {'Note R/R':>9} {'Agitation':>10} {'Sharpe':>7}"
          f" {'Investi':>9}")
    print(ligne_tableau(nom, base, nouvelle.poids.sum(axis=1).mean()))
    print(ligne_tableau(f"{nom_base} (base à battre)", m_reference, reference.poids.sum(axis=1).mean()))
    for n, m in m_refs.items():
        print(ligne_tableau(n, m))
    print(f"\n  Frais : {frais_par_an(nouvelle):.2%} par an ({nom_base} : {frais_par_an(reference):.2%})")

    if informations:
        print("\nPour information (pas des critères)")
        informations(o, c, risque)

    print(f"\nMieux que la {nom_base}")
    mieux = criteres_mieux(base, m_reference) if criteres_mieux else verifier_mieux(base, m_reference, m2_part_min)
    afficher_criteres(mieux)
    print("\nPerformance")
    performance = verifier_performance(base, m_refs)
    afficher_criteres(performance)
    resultats = {n: ok for n, ok, _ in mieux + performance}

    resultats["R1 Autres réglages"] = robustesse_v2.test_r1(o, c, risque, base, variantes, reglage)
    resultats["R2 Sous-périodes"] = robustesse_v2.test_r2(nouvelle.valeur, references["60/40 (SPY/IEF)"])
    resultats["R3 Frais x3"] = robustesse_v2.test_r3(o, c, risque, base, reglage)
    note_60_40 = m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"]
    resultats["R4 Sans la crypto"] = robustesse_v2.test_r4(o, c, note_60_40, reglage)
    sans = [s for s in c.columns if not s.endswith("-USD")]
    print(robustesse_v2.ligne(f"(info) {nom_base} sans la crypto",
                              mesures(strategie_v2(o[sans], c[sans], **(reglage_base or {})).valeur)))
    resultats["R5 Hasard"] = robustesse_v2.test_r5(o, c, risque, base, reglage, nom=nom)

    print(f"\nVERDICT {code}")
    for n, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {n}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + (f"« {nom} » devient la base à battre." if nb == len(resultats)
             else f"la {nom_base} reste la base à battre (voir les critères échoués)."))
    return resultats
