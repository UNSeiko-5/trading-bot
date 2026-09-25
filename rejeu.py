"""Testeur de stratégie visuel : rejoue le backtest jour par jour dans le navigateur, puis affiche le rapport.

À lancer sur ton ordinateur (Yahoo n'y est pas bloqué) :

    python rejeu.py                      # la v2, 10 000 € de départ
    python rejeu.py --capital 5000
    python rejeu.py --version cassures   # rejouer une expérience (cassures, retour)

Le script télécharge les données, simule, écrit `tableau/rejeu.html`, puis ouvre un petit serveur local :
ouvre l'adresse affichée dans Chrome. Ctrl+C pour l'arrêter.

Rien ici ne change la stratégie : c'est le même backtest, montré pas à pas.
"""
import argparse
import functools
import http.server
import json
import math
import time
import webbrowser
from pathlib import Path

from robot.parametres import CASSURES, RETOUR_MOYENNE
from robot.portefeuille import preparer_risque
from robot.rapport import extraire_trades, rapport, texte
from robot.simulation import acheter_et_garder, strategie_v2
from robot.univers import PAR_SYMBOLE

DOSSIER = Path(__file__).parent / "tableau"
VERSIONS = {
    "v2": ("Stratégie v2", {}),
    "cassures": ("v2 + cassures (EXP-003, non retenue)", {"cassures": CASSURES}),
    "retour": ("v2 + retour à la moyenne (EXP-004, non retenue)", {"retour": RETOUR_MOYENNE}),
}


def propre(objet):
    """Remplace NaN et infini par None, pour un JSON lisible par le navigateur."""
    if isinstance(objet, float):
        return objet if math.isfinite(objet) else None
    if isinstance(objet, dict):
        return {k: propre(v) for k, v in objet.items()}
    if isinstance(objet, (list, tuple)):
        return [propre(v) for v in objet]
    return objet


def donnees_rejeu(ouvertures, clotures, version="v2", capital=10_000.0, empreinte=""):
    nom, reglage = VERSIONS[version]
    risque = preparer_risque(clotures)
    r = strategie_v2(ouvertures, clotures, risque=risque, details=True, **reglage)
    dates = r.valeur.index
    echelle = capital / r.valeur.iloc[0]
    symboles = list(clotures.columns)
    position = {s: k for k, s in enumerate(symboles)}
    spy = acheter_et_garder(clotures, debut=dates[0]).reindex(dates).ffill()
    indice = {d: i for i, d in enumerate(dates)}
    trades = extraire_trades(r, echelle)
    return propre({
        "nom": nom, "version": version, "capital": capital, "empreinte": empreinte,
        "dates": [d.date().isoformat() for d in dates],
        "valeur": [round(v * echelle, 2) for v in r.valeur],
        "spy": [round(v / spy.iloc[0] * capital, 2) for v in spy],
        "symboles": symboles,
        "noms": [PAR_SYMBOLE[s].nom if s in PAR_SYMBOLE else s for s in symboles],
        "poids": [[round(v, 4) for v in r.poids[s]] for s in symboles],
        "cumul": [[round(v, 2) for v in (r.gains[s] * echelle).cumsum()] for s in symboles],
        "ordres": [[indice[o.date], position[o.symbole], 1 if o.sens == "achat" else 0,
                    round(abs(o.apres - o.avant) * echelle, 2), round(float(o.prix), 4), round(o.frais * echelle, 2)]
                   for o in r.ordres.itertuples()],
        "trades": [[position[t.symbole], int(t.i_entree), int(t.i_sortie), round(float(t.resultat), 2),
                    1 if t.statut == "fermé" else 0] for t in trades.itertuples()],
        "rapport": rapport(r, capital),
    })


def construire_page(donnees, modele=DOSSIER / "modele_rejeu.html", sortie=DOSSIER / "rejeu.html"):
    texte_json = json.dumps(donnees, ensure_ascii=False, separators=(",", ":"), allow_nan=False).replace("</", "<\\/")
    page = Path(modele).read_text(encoding="utf-8")
    if page.count("/*DONNEES*/") != 1:
        raise ValueError("le modèle doit contenir exactement une fois /*DONNEES*/")
    Path(sortie).write_text(page.replace("/*DONNEES*/", texte_json), encoding="utf-8")
    return Path(sortie)


def servir(dossier, port):
    gestionnaire = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(dossier))
    gestionnaire.log_message = lambda *args: None   # pas de message à chaque fichier servi
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), gestionnaire) as serveur:
        adresse = f"http://localhost:{port}/rejeu.html"
        print(f"\n  ▶ Ouvre dans Chrome : {adresse}")
        print(f"    (ou http://penguin.linux.test:{port}/rejeu.html sur Chromebook)   Ctrl+C pour arrêter.\n")
        try:
            webbrowser.open(adresse)
        except Exception:
            pass
        try:
            serveur.serve_forever()
        except KeyboardInterrupt:
            print("\n  Serveur arrêté.")


def etape(message):
    print(f"  … {message}", end="", flush=True)
    return time.time()


def fait(depart):
    print(f"  ✓ ({time.time() - depart:.1f} s)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Rejoue le backtest jour par jour dans le navigateur.")
    parser.add_argument("--version", choices=VERSIONS, default="v2")
    parser.add_argument("--capital", type=float, default=10_000.0, help="dépôt de départ en euros (défaut : 10 000)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--sans-serveur", action="store_true", help="écrit seulement tableau/rejeu.html")
    args = parser.parse_args()

    from robot.donnees import charger

    print(f"\nTESTEUR DE STRATÉGIE — {VERSIONS[args.version][0]}, dépôt de {args.capital:,.0f} €".replace(",", " "))
    t = etape("Téléchargement et contrôle des données (Yahoo)")
    donnees = charger()
    fait(t)
    t = etape("Simulation jour par jour, frais compris")
    rejeu = donnees_rejeu(donnees.ouvertures, donnees.clotures, args.version, args.capital, donnees.empreinte())
    fait(t)
    t = etape("Construction de la page")
    page = construire_page(rejeu)
    fait(t)
    print(f"\nRAPPORT · données {donnees.empreinte()}\n")
    print(texte(rejeu["rapport"]))
    print(f"\n  Page : {page.resolve()}")
    if not args.sans_serveur:
        servir(DOSSIER, args.port)
