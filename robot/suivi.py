"""Rapport du soir envoyé à Supabase, pour la page de suivi en direct (dossier `suivi/`).

Alpaca connaît le compte (valeur, positions, ordres) ; il ne connaît pas les RAISONS du robot. Chaque soir,
robot_v3.py enregistre donc ici ce qu'il a vu et décidé : notes de tendance, parts visées, sécurités,
multiplicateur, régime du marché (pour information), ordres, remarques et message Telegram.

Sans les variables SUPABASE_URL et SUPABASE_SERVICE_KEY, rien n'est envoyé. Une panne de Supabase n'arrête
jamais le robot : l'erreur est seulement affichée dans le journal GitHub.
"""
import math
import os

import requests

TABLE = "rapports"


def _nombre(valeur):
    """Nombre JSON propre : None pour une valeur absente ou impossible (NaN, infini)."""
    if valeur is None:
        return None
    valeur = float(valeur)
    return valeur if math.isfinite(valeur) else None


def rapport_du_soir(seance, statut, capital, cash, securite, multiplicateur, decision, ordres,
                    exclus=(), remarques=(), message="", regimes=None):
    """Tout ce que le robot a vu et décidé ce soir, en données simples (prêtes pour Supabase).

    `decision` : tableau de decision_du_jour (une ligne par actif) ; `regimes` : {symbole: nom du régime}.
    """
    regimes = regimes or {}
    actifs = []
    for symbole, ligne in decision.iterrows():
        actifs.append({
            "symbole": symbole,
            "nom": ligne["nom"],
            "note": _nombre(ligne["note"]),
            "haussiers": int(ligne["haussiers"]),
            "detecteurs": int(ligne["detecteurs"]),
            "actuelle": _nombre(ligne["actuelle"]),
            "cible": _nombre(ligne["cible"]),
            "visee": _nombre(ligne["visee"]),
            "exclu": symbole in exclus,
            "regime": regimes.get(symbole),
        })
    return {
        "seance": str(seance),
        "statut": statut,
        "capital": _nombre(capital),
        "cash": _nombre(cash),
        "chute": _nombre(securite.get("chute")),
        "perte_jour": _nombre(securite.get("perte_jour")),
        "multiplicateur": _nombre(multiplicateur),
        "securite": {cle: (bool(v) if isinstance(v, bool) else _nombre(v)) for cle, v in securite.items()},
        "actifs": actifs,
        "ordres": [{"symbole": o.symbole, "sens": o.sens, "montant": _nombre(o.montant),
                    "quantite": _nombre(o.quantite), "fermer": bool(o.fermer)} for o in ordres],
        "remarques": list(remarques),
        "message": message,
    }


def regimes_du_jour(clotures):
    """Régime de chaque actif ce soir (calme, normal, agité), pour information : la v3 ne s'en sert pas
    (EXP-009 non validée). Le calcul prend moins d'une minute."""
    from robot.parametres import REGIMES
    from robot.regimes import NOMS, probabilites_regimes, regimes_retenus, rendements_log

    noms = NOMS[REGIMES["etats"]]
    resultat = {}
    for symbole in clotures.columns:
        probas = probabilites_regimes(rendements_log(clotures[symbole]), REGIMES["etats"], REGIMES["fenetre"],
                                      REGIMES["reapprentissage"])
        retenu = regimes_retenus(probas, REGIMES["stabilite"]).iloc[-1]
        resultat[symbole] = None if math.isnan(retenu) else noms[int(retenu)]
    return resultat


def entetes(cle):
    """En-têtes Supabase. Anciennes clés (« service_role », qui commencent par eyJ) : aussi en « Bearer ».
    Nouvelles clés (« sb_secret_… ») : seulement dans « apikey », Supabase refuse de les voir en « Bearer »."""
    resultat = {"apikey": cle, "Content-Type": "application/json", "Prefer": "return=minimal"}
    if cle.startswith("eyJ"):
        resultat["Authorization"] = f"Bearer {cle}"
    return resultat


def envoyer_rapport(rapport, url=None, cle=None, poster=requests.post):
    """Envoie le rapport à Supabase. Renvoie None si tout va bien (ou si Supabase n'est pas configuré),
    sinon un texte d'erreur. Ne lève jamais d'exception : le robot ne doit pas s'arrêter pour ça."""
    url = url if url is not None else os.getenv("SUPABASE_URL")
    cle = cle if cle is not None else os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not cle:
        return None
    try:
        reponse = poster(
            f"{url.rstrip('/')}/rest/v1/{TABLE}",
            json=rapport,
            headers=entetes(cle),
            timeout=15,
        )
        if not reponse.ok:
            return f"Supabase a refusé le rapport ({reponse.status_code}) : {reponse.text[:200]}"
    except Exception as e:
        return f"Supabase injoignable : {type(e).__name__} : {e}"
    return None
