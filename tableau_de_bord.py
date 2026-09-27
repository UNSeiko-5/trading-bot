"""Tableau de bord visuel : calcule tout ce qu'il faut pour voir le robot, et construit la page.

`python tableau_de_bord.py` télécharge les vraies données (Yahoo), puis écrit :
- tableau/donnees.json : les chiffres (backtest, jour par jour, Monte Carlo, expériences, cerveau) ;
- tableau/tableau_de_bord.html : la page, à ouvrir dans un navigateur (tout est dedans).

Rien ici ne change la stratégie : ce sont des mesures et des images de la v2 telle qu'elle est.
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from robot.parametres import CASSURES, DEBUT_BACKTEST, JOURS_PAR_AN, RETOUR_MOYENNE
from robot.portefeuille import parts_cibles, preparer_risque
from robot.signaux import notes as calculer_notes
from robot.simulation import mesures, points_de_comparaison, rendements_par_annee, strategie_v2
from robot.univers import PAR_SYMBOLE

DOSSIER = Path(__file__).parent
MC_ANNEES, MC_TIRAGES, MC_BLOC, MC_GRAINE = 10, 2000, 21, 42
MC_CHEMINS_AFFICHES = 40
REFERENCES_AFFICHEES = ["Acheter et garder SPY", "60/40 (SPY/IEF)", "Même panier sans signaux"]

# Résumé du journal (EXPERIENCES.md), mis à jour à la main après chaque expérience
JOURNAL = [
    {"code": "EXP-001", "titre": "Règle des 200 jours sur SPY (v1)", "score": "4/5", "statut": "non solide",
     "lecon": "Protège des krachs, mais trop dépendante du réglage."},
    {"code": "EXP-002", "titre": "Stratégie v2 : tendance multi-actifs", "score": "7/8", "statut": "non solide",
     "lecon": "Risque très bien tenu, mais trop prudente : +4,4 %/an sans la crypto."},
    {"code": "EXP-003", "titre": "v2 + cassures (Donchian)", "score": "8/10", "statut": "échec",
     "lecon": "Liées à 0,90 aux moyennes : deux fois la même question, aucun gain."},
    {"code": "EXP-004", "titre": "v2 + retour à la moyenne (RSI, Bollinger)", "score": "1/10", "statut": "échec",
     "lecon": "Contredit la tendance : investi à 36 %, frais x3, +1,0 %/an."},
    {"code": "EXP-005", "titre": "v2 + budget de risque", "score": "9/10", "statut": "échec",
     "lecon": "+7,8 %/an, chute -12,6 %, réussit sans crypto ; échoue d'un cheveu aux frais x3."},
    {"code": "EXP-006", "titre": "v2 + budget de risque + zone tampon (v3)", "score": "10/10", "statut": "base à battre",
     "lecon": "+7,8 %/an, chute -11,7 %, frais 0,48 %/an : validée, devient la v3."},
    {"code": "EXP-007", "titre": "Croisement H1 filtré weekly, stop et stop suiveur", "score": "0/10", "statut": "échec",
     "lecon": "+5,0 %/an, chute -26 %, frais 2,1 %/an ; entrées au hasard font mieux dans 72 % des cas."},
    {"code": "EXP-008", "titre": "v3 + cash placé en fonds monétaire", "score": "8/10", "statut": "échec",
     "lecon": "+0,14 point seulement : les frais d'achat et de vente du fonds mangent les intérêts."},
    {"code": "EXP-009", "titre": "v3 + régimes de marché (HMM, idée d'une vidéo)", "score": "9/10", "statut": "échec",
     "lecon": "Même rendement, chute -12,7 % au lieu de -11,7 % : la v3 mesurait déjà l'agitation."},
    {"code": "EXP-010", "titre": "v3 offensive (agitation visée 17 %, limite -35 %)", "score": "10/11", "statut": "échec",
     "lecon": "+8,3 %/an seulement : les plafonds (100 %, 25 %/actif) freinent plus que l'agitation visée."},
    {"code": "EXP-011", "titre": "v3 sur 21 marchés (devises, pétrole, Nasdaq…)", "score": "7/10", "statut": "échec",
     "lecon": "+6,1 %/an : plus actif (85 % investi, 2x plus d'ordres) mais gagne moins que la v3."},
    {"code": "EXP-012", "titre": "v3 offensive, plafond 40 % par actif", "score": "10/11", "statut": "échec",
     "lecon": "+8,3 %/an, chute -15,5 % : plus de liberté = plus de risque, pas plus de rendement."},
]


# --- Le cerveau (notes Obsidian) ------------------------------------------------------------------

LIEN = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")


ELEMENT = re.compile(r"(- |\d+\. )")


def texte_lisible(texte):
    """Le texte d'une note sans son titre, avec les lignes coupées d'un même paragraphe recollées.
    Les éléments de liste (« - » ou « 1. ») restent sur leur propre ligne."""
    lignes = []
    for ligne in texte.splitlines():
        if ligne.startswith("# "):
            continue
        brute = ligne.strip()
        if not brute:
            if lignes and lignes[-1]:
                lignes.append("")
            continue
        precedente = lignes[-1] if lignes else ""
        dans_un_paragraphe = precedente and not ELEMENT.match(precedente)
        suite_d_element = precedente and ELEMENT.match(precedente) and ligne.startswith((" ", "\t"))
        if not ELEMENT.match(brute) and (dans_un_paragraphe or suite_d_element):
            lignes[-1] += " " + brute
        else:
            lignes.append(brute)
    return "\n".join(lignes).strip()


def lire_cerveau(dossier=DOSSIER / "cerveau"):
    """Les notes du dossier `cerveau/` et leurs liens [[...]] (format Obsidian).

    Chaque note devient un point ; son groupe est son sous-dossier (Expériences, Concepts, Leçons).
    Les liens vers des notes qui n'existent pas sont ignorés.
    """
    dossier = Path(dossier)
    fichiers = sorted(dossier.rglob("*.md"))
    ids = {f.stem for f in fichiers}
    noeuds, liens = [], set()
    for fichier in fichiers:
        texte = fichier.read_text(encoding="utf-8")
        groupe = fichier.parent.name if fichier.parent != dossier else "Accueil"
        resume = LIEN.sub(lambda m: m.group(1), texte_lisible(texte))
        noeuds.append({"id": fichier.stem, "groupe": groupe, "texte": resume})
        for cible in LIEN.findall(texte):
            cible = cible.strip()
            if cible in ids and cible != fichier.stem:
                liens.add(tuple(sorted((fichier.stem, cible))))
    return {"noeuds": noeuds, "liens": [{"source": a, "target": b} for a, b in sorted(liens)]}


# --- Monte Carlo ----------------------------------------------------------------------------------

def monte_carlo(rendements, jours, tirages=MC_TIRAGES, bloc=MC_BLOC, graine=MC_GRAINE):
    """Des avenirs possibles, fabriqués en recollant au hasard des morceaux du passé.

    On tire des blocs de `bloc` jours consécutifs (un mois de bourse) pour garder les périodes
    calmes et agitées ensemble. Renvoie un tableau (tirages, jours + 1) de valeurs, départ à 1.
    Hypothèse forte : l'avenir ressemble au passé.
    """
    r = np.asarray(rendements, dtype=float)
    r = r[~np.isnan(r)]
    if len(r) < bloc:
        raise ValueError("pas assez d'historique pour le Monte Carlo")
    aleatoire = np.random.default_rng(graine)
    nb_blocs = -(-jours // bloc)
    debuts = aleatoire.integers(0, len(r) - bloc + 1, size=(tirages, nb_blocs))
    tires = r[debuts[..., None] + np.arange(bloc)].reshape(tirages, -1)[:, :jours]
    return np.hstack([np.ones((tirages, 1)), np.cumprod(1 + tires, axis=1)])


def pires_chutes(chemins):
    """Pire chute (valeur négative) de chaque chemin."""
    return (chemins / np.maximum.accumulate(chemins, axis=1) - 1).min(axis=1)


def resume_monte_carlo(rendements, annees=MC_ANNEES):
    jours = annees * JOURS_PAR_AN
    chemins = monte_carlo(rendements, jours)
    pas = np.arange(0, jours + 1, 21)
    chutes = pires_chutes(chemins)
    finales = chemins[:, -1]
    rendements_annuels = finales ** (1 / annees) - 1
    return {
        "annees": annees, "tirages": len(chemins), "bloc": MC_BLOC,
        "mois": (pas / 21).astype(int).tolist(),
        "centiles": {str(q): np.round(np.percentile(chemins[:, pas], q, axis=0), 4).tolist()
                     for q in (5, 25, 50, 75, 95)},
        "exemples": np.round(chemins[:MC_CHEMINS_AFFICHES][:, pas], 4).tolist(),
        "pires_chutes": np.round(chutes, 4).tolist(),
        "proba_chute": {seuil: float(np.mean(chutes <= -seuil / 100)) for seuil in (10, 15, 20, 25)},
        "proba_perte": float(np.mean(finales < 1)),
        "rendement_annuel_centiles": {str(q): float(np.percentile(rendements_annuels, q)) for q in (5, 50, 95)},
    }


# --- Jour par jour --------------------------------------------------------------------------------

def resume_quotidien(valeur):
    r = valeur.pct_change().dropna()
    compte, bords = np.histogram(r * 100, bins=np.arange(-3.0, 3.01, 0.1))
    return {
        "moyenne": float(r.mean()), "ecart_type": float(r.std()),
        "jours_positifs": float((r > 0).mean()), "jours_negatifs": float((r < 0).mean()),
        "meilleur": {"date": r.idxmax().date().isoformat(), "valeur": float(r.max())},
        "pire": {"date": r.idxmin().date().isoformat(), "valeur": float(r.min())},
        "hors_histogramme": int(((r * 100 < -3) | (r * 100 > 3)).sum()),
        "histogramme": {"bords": np.round(bords, 2).tolist(), "compte": compte.tolist()},
        "nb_jours": int(len(r)),
    }


# --- Assemblage -----------------------------------------------------------------------------------

def arrondir(serie, decimales=4):
    return [None if pd.isna(v) else round(float(v), decimales) for v in serie]


def chute(valeur):
    return valeur / valeur.cummax() - 1


def donnees_tableau(ouvertures, clotures, empreinte="", dossier_cerveau=DOSSIER / "cerveau"):
    risque = preparer_risque(clotures)
    v2 = strategie_v2(ouvertures, clotures, risque=risque)
    dates = v2.valeur.index
    references = points_de_comparaison(ouvertures, clotures, risque=risque)
    experiences = {
        "v2": v2,
        "v2 + cassures (EXP-003)": strategie_v2(ouvertures, clotures, risque=risque, cassures=CASSURES),
        "v2 + retour à la moyenne (EXP-004)": strategie_v2(ouvertures, clotures, risque=risque, retour=RETOUR_MOYENNE),
    }
    notes = calculer_notes(clotures)
    cibles = parts_cibles(notes, risque)
    derniere = clotures.index[-1]
    courbes = {"v2": v2.valeur, **{nom: references[nom].reindex(dates).ffill() for nom in REFERENCES_AFFICHEES}}

    return {
        "empreinte": empreinte,
        "periode": {"debut": dates[0].date().isoformat(), "fin": dates[-1].date().isoformat(),
                    "annees": round(len(dates) / JOURS_PAR_AN, 1)},
        "dates": [d.date().isoformat() for d in dates],
        "courbes": {nom: arrondir(v / v.iloc[0]) for nom, v in courbes.items()},
        "chutes": {"v2": arrondir(chute(v2.valeur)), "Acheter et garder SPY": arrondir(chute(courbes["Acheter et garder SPY"]))},
        "investi": arrondir(v2.poids.sum(axis=1), 3),
        "mesures": {nom: mesures(v) for nom, v in courbes.items()},
        "annees": {"annee": [int(a) for a in rendements_par_annee(v2.valeur).index],
                   "v2": arrondir(rendements_par_annee(v2.valeur)),
                   "Acheter et garder SPY": arrondir(rendements_par_annee(courbes["Acheter et garder SPY"]))},
        "quotidien": resume_quotidien(v2.valeur),
        "aujourdhui": {
            "date": derniere.date().isoformat(),
            "actifs": [{"symbole": s, "nom": PAR_SYMBOLE[s].nom, "classe": PAR_SYMBOLE[s].classe,
                        "note": None if pd.isna(notes.loc[derniere, s]) else round(float(notes.loc[derniere, s]), 1),
                        "part": round(float(cibles.loc[derniere, s]), 4)} for s in clotures.columns],
            "investi": round(float(cibles.loc[derniere].sum()), 4),
            "chute_actuelle": round(float(chute(v2.valeur).iloc[-1]), 4),
        },
        "experiences": {
            "courbes": {nom: arrondir(r.valeur / r.valeur.iloc[0]) for nom, r in experiences.items()},
            "mesures": {nom: {**mesures(r.valeur), "investi": float(r.poids.sum(axis=1).mean()),
                              "frais_par_an": float(r.frais.sum() / (len(r.frais) / JOURS_PAR_AN))}
                        for nom, r in experiences.items()},
        },
        "journal": JOURNAL,
        "monte_carlo": resume_monte_carlo(v2.valeur.pct_change().dropna()),
        "cerveau": lire_cerveau(dossier_cerveau),
    }


def construire_page(donnees, modele=DOSSIER / "tableau" / "modele.html", sortie=DOSSIER / "tableau" / "tableau_de_bord.html"):
    """Met les chiffres dans la page modèle. `</` est échappé pour ne pas fermer la balise <script>."""
    texte = json.dumps(donnees, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    page = Path(modele).read_text(encoding="utf-8")
    if page.count("/*DONNEES*/") != 1:
        raise ValueError("le modèle doit contenir exactement une fois /*DONNEES*/")
    Path(sortie).write_text(page.replace("/*DONNEES*/", texte), encoding="utf-8")
    return Path(sortie)


if __name__ == "__main__":
    from robot.donnees import charger

    donnees = charger()
    tableau = donnees_tableau(donnees.ouvertures, donnees.clotures, donnees.empreinte())
    (DOSSIER / "tableau").mkdir(exist_ok=True)
    (DOSSIER / "tableau" / "donnees.json").write_text(json.dumps(tableau, ensure_ascii=False), encoding="utf-8")
    page = construire_page(tableau)
    mc = tableau["monte_carlo"]
    print(f"TABLEAU DE BORD · données {tableau['empreinte']} · {tableau['periode']['debut']} -> {tableau['periode']['fin']}")
    print(f"  Page : {page} ({page.stat().st_size / 1e6:.1f} Mo)")
    print(f"  Jour par jour : {tableau['quotidien']['jours_positifs']:.0%} de jours positifs,"
          f" moyenne {tableau['quotidien']['moyenne']:+.3%}, écart-type {tableau['quotidien']['ecart_type']:.2%}")
    print(f"  Monte Carlo ({mc['tirages']} avenirs de {mc['annees']} ans) : pire chute médiane"
          f" {np.median(mc['pires_chutes']):.1%} ; risque de dépasser -20 % : {mc['proba_chute'][20]:.0%},"
          f" -25 % : {mc['proba_chute'][25]:.0%} ; perte au bout de {mc['annees']} ans : {mc['proba_perte']:.0%}")
