"""Test anti-chance de la stratégie v2 (expérience EXP-002, critères R1 à R5).

Les critères ci-dessous ont été fixés AVANT les tests (EXPERIENCES.md). On ne les modifie pas
après avoir vu les résultats. La v2 remplace la v1 seulement si P1 à P3 ET R1 à R5 sont réussis.
"""
from math import sqrt

import numpy as np

from backtest_v2 import verifier_performance
from robot.donnees import charger
from robot.parametres import DETECTEURS, FRAIS, VOL_CIBLE
from robot.portefeuille import preparer_risque
from robot.regimes import appliquer_regime
from robot.signaux import notes as calculer_notes
from robot.simulation import cibles_strategie, mesures, points_de_comparaison, simuler, strategie_v2

# --- Critères fixés à l'avance (EXPERIENCES.md, EXP-002) ------------------------------------------
R1_RENDEMENT_MIN, R1_CHUTE_MIN, R1_ECART_NOTE_MAX = 0.04, -0.25, 0.30
R2_PERIODES = [("2007", "2012"), ("2013", "2019"), ("2020", "2026")]
R3_PERTE_MAX, R3_CHUTE_MIN = 0.015, -0.20
R4_CHUTE_MIN, R4_RENDEMENT_MIN = -0.20, 0.05
R5_TIRAGES, R5_PART_MIN = 500, 0.95


def variantes_reglages():
    """Les variantes du test R1. Pour « moyennes x1,5 », le facteur d'échelle est divisé par
    racine(1,5) : c'est la règle de Carver (x racine(2) quand la durée double), pas un ajustement."""
    return {
        "Détecteur rapide seul (16/64)": {"detecteurs": [DETECTEURS[0]]},
        "Détecteur lent seul (64/256)": {"detecteurs": [DETECTEURS[-1]]},
        "Toutes les moyennes x1,5": {
            "detecteurs": [(round(r * 1.5), round(l * 1.5), f / sqrt(1.5)) for r, l, f in DETECTEURS]},
        "Agitation visée 10 %": {"vol_cible": 0.10},
        "Agitation visée 14 %": {"vol_cible": 0.14},
        "Seuil de transaction 1 %": {"seuil": 0.01},
        "Seuil de transaction 4 %": {"seuil": 0.04},
    }


def decaler_au_hasard(notes, aleatoire, marge=252):
    """Décale dans le temps la note de chaque actif, d'un nombre de jours tiré au hasard
    (en boucle, uniquement sur la période où l'actif existe).

    Les notes gardent exactement les mêmes valeurs et le même rythme, mais ne tombent plus
    au bon moment : c'est « la même stratégie avec un mauvais timing ».
    """
    resultat = notes.copy()
    for symbole in notes.columns:
        valeurs = notes[symbole].to_numpy(copy=True)
        valides = ~np.isnan(valeurs)
        n = int(valides.sum())
        if n > 2 * marge:
            valeurs[valides] = np.roll(valeurs[valides], int(aleatoire.integers(marge, n - marge)))
            resultat[symbole] = valeurs
    return resultat


def notes_du_reglage(clotures, reglage=None):
    """Les notes combinées de la version testée (`reglage` vide = la v2), avant le décalage au hasard.
    Avec un filtre de régime (EXP-009), la note contient déjà le facteur de régime : le hasard décale
    donc la tendance et le régime de chaque actif ensemble."""
    reglage = reglage or {}
    notes = calculer_notes(clotures, **{cle: reglage[cle] for cle in ("detecteurs", "cassures", "retour", "poids_retour")
                                        if cle in reglage})
    return appliquer_regime(notes, clotures, reglage.get("regime"))


def ligne(nom, m, ok=None):
    fin = "" if ok is None else ("  ✅" if ok else "  ❌")
    return (f"  {nom:<32} {m['rendement_annuel']:+7.1%}/an   chute {m['pire_chute']:6.1%}"
            f"   note R/R {m['note_rendement_risque']:5.2f}{fin}")


def test_r1(ouvertures, clotures, risque, base, variantes=None, reglage=None, chute_min=R1_CHUTE_MIN):
    """`reglage` : réglages de la version testée (vide = la v2) ; chaque variante les modifie."""
    variantes, reglage = variantes or variantes_reglages(), reglage or {}
    print("\nR1 — Autres réglages")
    print(ligne("Version de base", base))
    tous = True
    for nom, variante in variantes.items():
        m = mesures(strategie_v2(ouvertures, clotures, risque=risque, **{**reglage, **variante}).valeur)
        ecart = abs(m["note_rendement_risque"] / base["note_rendement_risque"] - 1)
        ok = m["rendement_annuel"] >= R1_RENDEMENT_MIN and m["pire_chute"] > chute_min and ecart <= R1_ECART_NOTE_MAX
        tous &= ok
        print(ligne(nom, m, ok) + f"   (écart de note {ecart:.0%})")
    return tous


def test_r2(valeur_v2, valeur_60_40):
    print("\nR2 — Sous-périodes (comparées au 60/40)")
    tous_positifs, nb_meilleur = True, 0
    for debut, fin in R2_PERIODES:
        m, ref = mesures(valeur_v2.loc[debut:fin]), mesures(valeur_60_40.loc[debut:fin])
        meilleur = m["note_rendement_risque"] > ref["note_rendement_risque"]
        tous_positifs &= m["rendement_annuel"] > 0
        nb_meilleur += meilleur
        print(ligne(f"{debut}-{fin}", m, m["rendement_annuel"] > 0 and meilleur)
              + f"   (60/40 : {ref['rendement_annuel']:+.1%}/an, note {ref['note_rendement_risque']:.2f})")
    return tous_positifs and nb_meilleur >= 2


def test_r3(ouvertures, clotures, risque, base, reglage=None, chute_min=R3_CHUTE_MIN):
    print("\nR3 — Frais multipliés par 3")
    triples = {cle: 3 * taux for cle, taux in FRAIS.items()}
    m = mesures(strategie_v2(ouvertures, clotures, risque=risque, frais=triples, **(reglage or {})).valeur)
    perte = base["rendement_annuel"] - m["rendement_annuel"]
    ok = perte < R3_PERTE_MAX and m["pire_chute"] > chute_min
    print(ligne("Frais x3 (ETF 0,30 %, crypto 1,50 %)", m, ok) + f"   (perte : {perte:.2%} par an)")
    return ok


def test_r4(ouvertures, clotures, note_60_40, reglage=None, chute_min=R4_CHUTE_MIN):
    print("\nR4 — Sans la crypto")
    sans = [s for s in clotures.columns if not s.endswith("-USD")]
    m = mesures(strategie_v2(ouvertures[sans], clotures[sans], **(reglage or {})).valeur)
    ok = m["pire_chute"] > chute_min and m["rendement_annuel"] >= R4_RENDEMENT_MIN and \
        m["note_rendement_risque"] > note_60_40
    print(ligne(f"{len(sans)} actifs, sans Bitcoin ni Ethereum", m, ok) + f"   (60/40 : note {note_60_40:.2f})")
    return ok


def test_r5(ouvertures, clotures, risque, base, reglage=None, nom="la v2"):
    print(f"\nR5 — Hasard : signaux décalés au hasard dans le temps ({R5_TIRAGES} tirages)")
    notes = notes_du_reglage(clotures, reglage)
    budget = (reglage or {}).get("budget")   # EXP-005 : multiplicateur recalculé pour chaque version au hasard
    tampon = (reglage or {}).get("tampon")   # EXP-006 : zone tampon appliquée à chaque version au hasard
    vol_cible = (reglage or {}).get("vol_cible", VOL_CIBLE)   # EXP-010 : même agitation visée que la version testée
    plafonds = (reglage or {}).get("plafonds")   # EXP-012 : mêmes garde-fous que la version testée
    aleatoire = np.random.default_rng(42)  # graine fixe : même résultat à chaque lancement
    notes_hasard, rendements_hasard = [], []
    for _ in range(R5_TIRAGES):
        cibles, _, tampons = cibles_strategie(ouvertures, clotures, decaler_au_hasard(notes, aleatoire), risque,
                                              vol_cible=vol_cible, budget=budget, tampon=tampon, plafonds=plafonds)
        m = mesures(simuler(ouvertures, clotures, cibles, tampons=tampons,
                            monetaire=(reglage or {}).get("monetaire"), plafonds=plafonds).valeur)
        notes_hasard.append(m["note_rendement_risque"])
        rendements_hasard.append(m["rendement_annuel"])
    part = float(np.mean(base["note_rendement_risque"] > np.array(notes_hasard)))
    ok = part >= R5_PART_MIN
    print(f"  Note R/R de {nom} ({base['note_rendement_risque']:.2f}) meilleure que {part:.0%} des versions"
          f" au hasard (médiane du hasard : {np.median(notes_hasard):.2f})  {'✅' if ok else '❌'}")
    print(f"  Rendement : médiane du hasard {np.median(rendements_hasard):+.1%}/an,"
          f" {nom} {base['rendement_annuel']:+.1%}/an (information)")
    return ok


if __name__ == "__main__":
    donnees = charger()
    o, c = donnees.ouvertures, donnees.clotures
    risque = preparer_risque(c)
    v2 = strategie_v2(o, c, risque=risque)
    base = mesures(v2.valeur)
    references = points_de_comparaison(o, c, risque=risque)
    m_refs = {nom: mesures(valeur) for nom, valeur in references.items()}
    print(f"TEST ANTI-CHANCE v2 (EXP-002) · données {donnees.empreinte()}")

    resultats = {nom: ok for nom, ok, _ in verifier_performance(base, m_refs)}
    resultats["R1 Autres réglages"] = test_r1(o, c, risque, base)
    resultats["R2 Sous-périodes"] = test_r2(v2.valeur, references["60/40 (SPY/IEF)"])
    resultats["R3 Frais x3"] = test_r3(o, c, risque, base)
    resultats["R4 Sans la crypto"] = test_r4(o, c, m_refs["60/40 (SPY/IEF)"]["note_rendement_risque"])
    resultats["R5 Hasard"] = test_r5(o, c, risque, base)

    print("\nVERDICT EXP-002")
    for nom, ok in resultats.items():
        print(f"  {'✅' if ok else '❌'} {nom}")
    nb = sum(resultats.values())
    print(f"\n  {nb}/{len(resultats)} critères réussis -> "
          + ("la v2 est VALIDÉE." if nb == len(resultats) else "la v2 n'est PAS validée (voir les critères échoués)."))
