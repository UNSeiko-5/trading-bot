"""Déroulé commun des expériences qui modifient la v2 (EXP-003 et suivantes).

Chaque expérience compare une version modifiée à la v2 avec les mêmes 10 critères, fixés AVANT les
tests dans EXPERIENCES.md : M1-M2 (mieux que la v2), P1-P3 et R1-R5 (mêmes seuils qu'EXP-002).
"""
from backtest_v2 import verifier_performance
from robot.donnees import charger
from robot.portefeuille import preparer_risque
from robot.simulation import mesures, points_de_comparaison, strategie_v2
import robustesse_v2

M1_GAIN_MIN = 0.005     # au moins +0,5 point de rendement par an par rapport à la v2


def verifier_mieux(nouvelle, v2, m2_part_min=1.0, base="la v2", m1_gain_min=M1_GAIN_MIN):
    """Renvoie les critères M1 et M2 : (nom, réussi, détail).
    `m2_part_min` : part minimale de la note rendement/risque de la v2 à garder (1 = au moins égale)."""
    gain = nouvelle["rendement_annuel"] - v2["rendement_annuel"]
    nom_m2 = (f"M2 Note rendement/risque au moins égale à celle de {base}" if m2_part_min == 1 else
              f"M2 Note rendement/risque au moins égale à {m2_part_min * 100:.0f} % de celle de {base}")
    return [
        (f"M1 Au moins +{m1_gain_min * 100:.1f} point de rendement par an de plus que {base}".replace(".", ","),
         gain >= m1_gain_min,
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


def lancer_experience(code, nom, reglage, variantes, informations=None, m2_part_min=1.0, base_reglage=None,
                      base_nom="v2", m1_gain_min=M1_GAIN_MIN, donnees=None, criteres_mieux=None, seuils_chute=None,
                      criteres_supplementaires=None):
    """Lance toute l'expérience sur les vraies données et affiche le verdict.

    `reglage` : ce qui change par rapport à la v2 (arguments de strategie_v2).
    `variantes` : les variantes du test R1, chacune modifiant `reglage`.
    `informations(ouvertures, clotures, risque)` : affiche des chiffres pour information (pas des critères).
    `base_reglage`, `base_nom` : la version à battre (par défaut la v2 ; EXP-008 : la v3).
    `criteres_mieux(nouvelle, base)` : critères M propres à l'expérience (EXP-009), à la place de `verifier_mieux`.
    `seuils_chute` : {"P1", "R1", "R3", "R4"} -> pire chute minimale (EXP-010 : limite passée à -35 %).
    `criteres_supplementaires(ouvertures, clotures, risque)` : {nom: réussi} ajoutés au verdict (EXP-010 : K1).
    """
    seuils = seuils_chute or {}
    donnees = donnees or charger()
    o, c = donnees.ouvertures, donnees.clotures
    risque = preparer_risque(c)
    v2 = strategie_v2(o, c, risque=risque, **(base_reglage or {}))
    nouvelle = strategie_v2(o, c, risque=risque, **reglage)
    base, m_v2 = mesures(nouvelle.valeur), mesures(v2.valeur)
    references = points_de_comparaison(o, c, risque=risque)
    m_refs = {n: mesures(valeur) for n, valeur in references.items()}

    debut, fin = nouvelle.valeur.index[0].date(), nouvelle.valeur.index[-1].date()
    print(f"EXPÉRIENCE {code} : {nom} — {debut} -> {fin} ({len(nouvelle.valeur) / 252:.1f} ans),"
          f" frais compris · données {donnees.empreinte()}\n")
    print(f"  {'':<27} {'Rend./an':>8} {'Pire chute':>10} {'Note R/R':>9} {'Agitation':>10} {'Sharpe':>7}"
          f" {'Investi':>9}")
    print(ligne_tableau(nom, base, nouvelle.poids.sum(axis=1).mean()))
    print(ligne_tableau(f"{base_nom} (base à battre)", m_v2, v2.poids.sum(axis=1).mean()))
    for n, m in m_refs.items():
        print(ligne_tableau(n, m))
    print(f"\n  Frais : {frais_par_an(nouvelle):.2%} par an ({base_nom} : {frais_par_an(v2):.2%})")

    if informations:
        print("\nPour information (pas des critères)")
        informations(o, c, risque)

    print(f"\nMieux que la {base_nom}")
    mieux = (criteres_mieux(base, m_v2) if criteres_mieux
             else verifier_mieux(base, m_v2, m2_part_min, base=f"la {base_nom}", m1_gain_min=m1_gain_min))
    afficher_criteres(mieux)
    print("\nPerformance")
    performance = verifier_performance(base, m_refs, **({"pire_chute_min": seuils["P1"]} if "P1" in seuils else {}))
    afficher_criteres(performance)
    resultats = {n: ok for n, ok, _ in mieux + performance}

    resultats["R1 Autres réglages"] = robustesse_v2.test_r1(o, c, risque, base, variantes, reglage,
                                                        **({"chute_min": seuils["R1"]} if "R1" in seuils else {}))
    resultats["R2 Sous-périodes"] = robustesse_v2.test_r2(nouvelle.valeur, references["60/40 (SPY/IEF)"])
    resultats["R3 Frais x3"] = robustesse_v2.test_r3(o, c, risque, base, reglage,
                                                 **({"chute_min": seuils["R3"]} if "R3" in seuils else {}))
    note_60_40 = m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"]
    resultats["R4 Sans la crypto"] = robustesse_v2.test_r4(o, c, note_60_40, reglage,
                                                       **({"chute_min": seuils["R4"]} if "R4" in seuils else {}))
    sans = [s for s in c.columns if not s.endswith("-USD")]
    print(robustesse_v2.ligne(f"(info) {base_nom} sans la crypto",
                              mesures(strategie_v2(o[sans], c[sans], **(base_reglage or {})).valeur)))
    resultats["R5 Hasard"] = robustesse_v2.test_r5(o, c, risque, base, reglage, nom=nom)
    if criteres_supplementaires:
        resultats.update(criteres_supplementaires(o, c, risque))

    print(f"\nVERDICT {code}")
    for n, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {n}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + (f"« {nom} » devient la base à battre." if nb == len(resultats)
             else f"la {base_nom} reste la base à battre (voir les critères échoués)."))
    return resultats
