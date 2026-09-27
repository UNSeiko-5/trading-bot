"""Expérience EXP-013 : double momentum de G. Antonacci (SPY / EFA / AGG, 12 mois, une décision par mois).

Critères fixés AVANT les tests (EXPERIENCES.md) : M1 +1,5 point contre la v3, M2 Sharpe meilleur qu'acheter
et garder SPY, P1-P3 et R1-R5 avec les seuils de chute de la limite -35 %, K1 krachs simulés.
On ne les modifie pas après avoir vu les résultats.
"""
import numpy as np

import krachs_simules
import robustesse_v2
from backtest_v2 import verifier_performance
from experience_010 import SEUILS_CHUTE, verdict_krachs
from outils_experience import afficher_criteres, frais_par_an, ligne_tableau
from robot.donnees import charger, rendement_monetaire
from robot.momentum import MOMENTUM, choix_au_hasard, cibles_depuis_choix, strategie_momentum
from robot.parametres import BUDGET_RISQUE, DEBUT_BACKTEST, FRAIS, JOURS_PAR_AN, TAMPON
from robot.simulation import mesures, points_de_comparaison, rendements_par_annee, simuler, strategie_v2
from robot.univers import UNIVERS

NOM = "Double momentum"
BASE = [a.symbole for a in UNIVERS]
SYMBOLES = BASE + ["AGG", "QQQ"]
TRESOR = {"symbole": "^IRX", "frais_annuels": 0.0}   # taux des bons du Trésor, sans frais (règle du livre)
V3 = {"budget": BUDGET_RISQUE, "tampon": TAMPON}
M1_GAIN_MIN = 0.015
R5_TIRAGES, R5_PART_MIN = 500, 0.95
R3_PERTE_MAX = 0.015


def variantes_reglages():
    """Les 10 variantes du test R1, chacune modifiant la règle du livre."""
    return {
        "Durée 6 mois": {"durees": (126,)},
        "Durée 9 mois": {"durees": (189,)},
        "Durée 15 mois": {"durees": (315,)},
        "Seuil absolu 0 %": {"absolu": 0.0},
        "Obligations IEF": {"refuge": "IEF"},
        "Obligations TLT": {"refuge": "TLT"},
        "Décision 10 jours avant": {"decalage": 10},
        "Décision 5 jours avant": {"decalage": 5},
        "Moyenne 3, 6 et 12 mois": {"durees": (63, 126, 252)},
        "EEM en 3e candidat": {"actions": ("SPY", "EFA", "EEM")},
    }


def criteres_mieux(nouvelle, v3, spy):
    gain = nouvelle["rendement_annuel"] - v3["rendement_annuel"]
    return [
        ("M1 Au moins +1,5 point de rendement par an de plus que la v3", gain >= M1_GAIN_MIN - 1e-9,
         f"{nouvelle['rendement_annuel']:+.1%} contre {v3['rendement_annuel']:+.1%} ({gain * 100:+.2f} point)"),
        ("M2 Sharpe meilleur qu'acheter et garder SPY", nouvelle["sharpe"] > spy["sharpe"],
         f"{nouvelle['sharpe']:.2f} contre {spy['sharpe']:.2f}"),
    ]


def colonnes(reglage):
    r = {**MOMENTUM, **reglage}
    return list(dict.fromkeys(list(r["actions"]) + [r["refuge"]]))


def lancer(o, c, tresor, reglage=None, frais=FRAIS, details=False):
    reglage = reglage or {}
    cols = colonnes(reglage)
    return strategie_momentum(o[cols], c[cols], tresor, DEBUT_BACKTEST, frais=frais, details=details, **reglage)


def ok_variante(m, base, chute_min):
    ecart = abs(m["note_rendement_risque"] / base["note_rendement_risque"] - 1)
    return (m["rendement_annuel"] >= robustesse_v2.R1_RENDEMENT_MIN and m["pire_chute"] > chute_min
            and ecart <= robustesse_v2.R1_ECART_NOTE_MAX), ecart


def test_r1(o, c, tresor, base):
    print("\nR1 — Autres réglages")
    print(robustesse_v2.ligne("Version de base", base))
    tous = True
    for nom, variante in variantes_reglages().items():
        m = mesures(lancer(o, c, tresor, variante).valeur)
        ok, ecart = ok_variante(m, base, SEUILS_CHUTE["R1"])
        tous &= ok
        print(robustesse_v2.ligne(nom, m, ok) + f"   (écart de note {ecart:.0%})")
    return tous


def test_r3(o, c, tresor, base):
    print("\nR3 — Frais multipliés par 3")
    m = mesures(lancer(o, c, tresor, frais={k: 3 * v for k, v in FRAIS.items()}).valeur)
    perte = base["rendement_annuel"] - m["rendement_annuel"]
    ok = perte < R3_PERTE_MAX and m["pire_chute"] > SEUILS_CHUTE["R3"]
    print(robustesse_v2.ligne("Frais x3", m, ok) + f"   (perte : {perte:.2%} par an)")
    return ok


def test_r4(base, note_60_40):
    print("\nR4 — Sans la crypto (la stratégie n'en utilise pas : même résultat que la base)")
    ok = (base["pire_chute"] > SEUILS_CHUTE["R4"] and base["rendement_annuel"] >= robustesse_v2.R4_RENDEMENT_MIN
          and base["note_rendement_risque"] > note_60_40)
    print(robustesse_v2.ligne("SPY / EFA / AGG", base, ok) + f"   (60/40 : note {note_60_40:.2f})")
    return ok


def test_r5(o, c, resultat, base, tirages=None, graine=42):
    tirages = tirages or R5_TIRAGES
    print(f"\nR5 — Hasard : chaque mois SPY, EFA ou AGG tiré au hasard ({tirages} tirages)")
    cols = colonnes({})
    aleatoire = np.random.default_rng(graine)
    notes, rendements = [], []
    for _ in range(tirages):
        cibles = cibles_depuis_choix(choix_au_hasard(resultat.choix, cols, aleatoire), c.index, cols)
        m = mesures(simuler(o[cols], c[cols], cibles, DEBUT_BACKTEST).valeur)
        notes.append(m["note_rendement_risque"])
        rendements.append(m["rendement_annuel"])
    part = float(np.mean(base["note_rendement_risque"] > np.array(notes)))
    ok = part >= R5_PART_MIN
    print(f"  Note R/R ({base['note_rendement_risque']:.2f}) meilleure que {part:.0%} des versions au hasard"
          f" (médiane du hasard : {np.median(notes):.2f})  {'✅' if ok else '❌'}")
    print(f"  Rendement : médiane du hasard {np.median(rendements):+.1%}/an (information)")
    return ok


def critere_krachs(o, c, tresor, resultat):
    print("\nK1 — Krachs simulés (krach type : actions -20 %, crypto -40 %…)")
    pire_nuit = float(krachs_simules.choc_d_une_nuit(resultat)["chute_totale"].min())
    cols = colonnes({})
    pires = krachs_simules.krachs_au_hasard(
        o[cols], c[cols], strategie=lambda oo, cc: strategie_momentum(oo, cc, tresor, DEBUT_BACKTEST).valeur)
    ok, part = verdict_krachs(pire_nuit, pires)
    print(f"  Krach d'une nuit, pire soir : chute totale {pire_nuit:.1%} (limite -35 %)")
    print(f"  {krachs_simules.KRACHS} krachs au hasard ({len(pires)} tirages) : médiane {np.median(pires):.1%},"
          f" pire {pires.min():.1%}, au-delà de -35 % : {part:.0%} des tirages (5 % au plus)  {'✅' if ok else '❌'}")
    return ok


def informations(o, c, tresor, resultat, v3):
    choix = resultat.choix.dropna().loc[DEBUT_BACKTEST:]
    changements = int((choix != choix.shift()).iloc[1:].sum())
    annees = len(resultat.valeur) / JOURS_PAR_AN
    print(f"  {changements / annees:.1f} changements d'actif par an · frais {frais_par_an(resultat):.2%}/an")
    print("  Temps passé : " + ", ".join(f"{s} {p:.0%}" for s, p in choix.value_counts(normalize=True).items()))
    for nom, valeur in ((NOM, resultat.valeur), ("v3", v3.valeur)):
        m = mesures(valeur.loc["2014":])
        pire = rendements_par_annee(valeur).min()
        print(f"  2014-2026 seul, {nom:<16} {m['rendement_annuel']:+.1%}/an · chute {m['pire_chute']:.1%}"
              f" · pire année {pire:+.1%}")
    nasdaq = mesures(lancer(o, c, tresor, {"actions": ("QQQ", "EFA")}).valeur)
    print(robustesse_v2.ligne("(info) Variante Nasdaq", nasdaq) + "   ← jamais retenue (choix avec le recul)")


def main():
    donnees = charger(SYMBOLES)
    o, c = donnees.ouvertures, donnees.clotures
    tresor = rendement_monetaire(c.index, reglage=TRESOR)
    resultat = lancer(o, c, tresor)
    v3 = strategie_v2(o[BASE], c[BASE], **V3)
    base, m_v3 = mesures(resultat.valeur), mesures(v3.valeur)
    references = points_de_comparaison(o[BASE], c[BASE])
    m_refs = {n: mesures(v) for n, v in references.items()}

    debut, fin = resultat.valeur.index[0].date(), resultat.valeur.index[-1].date()
    print(f"EXPÉRIENCE EXP-013 : {NOM} — {debut} -> {fin} ({len(resultat.valeur) / 252:.1f} ans),"
          f" frais compris · données {donnees.empreinte()}\n")
    print(f"  {'':<27} {'Rend./an':>8} {'Pire chute':>10} {'Note R/R':>9} {'Agitation':>10} {'Sharpe':>7} {'Investi':>9}")
    print(ligne_tableau(NOM, base, resultat.poids.sum(axis=1).mean()))
    print(ligne_tableau("v3 (base à battre)", m_v3, v3.poids.sum(axis=1).mean()))
    for n, m in m_refs.items():
        print(ligne_tableau(n, m))

    print("\nPour information (pas des critères)")
    informations(o, c, tresor, resultat, v3)

    print("\nMieux que la v3")
    mieux = criteres_mieux(base, m_v3, m_refs["Acheter et garder SPY"])
    afficher_criteres(mieux)
    print("\nPerformance")
    performance = verifier_performance(base, m_refs, pire_chute_min=SEUILS_CHUTE["P1"])
    afficher_criteres(performance)
    resultats = {n: ok for n, ok, _ in mieux + performance}
    resultats["R1 Autres réglages"] = test_r1(o, c, tresor, base)
    resultats["R2 Sous-périodes"] = robustesse_v2.test_r2(resultat.valeur, references["60/40 (SPY/IEF)"])
    resultats["R3 Frais x3"] = test_r3(o, c, tresor, base)
    resultats["R4 Sans la crypto"] = test_r4(base, m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"])
    resultats["R5 Hasard"] = test_r5(o, c, resultat, base)
    resultats["K1 Krachs simulés"] = critere_krachs(o, c, tresor, resultat)

    print("\nVERDICT EXP-013")
    for n, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {n}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + (f"« {NOM} » devient la base à battre." if nb == len(resultats)
             else "la v3 reste la base à battre (voir les critères échoués)."))
    return resultats


if __name__ == "__main__":
    main()
