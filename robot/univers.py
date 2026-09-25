"""Le panier d'actifs de la v2 et la répartition du risque (docs/STRATEGIE_V2.md, section 3)."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Actif:
    symbole: str   # symbole Yahoo Finance utilisé pour la recherche
    nom: str
    classe: str
    type: str      # "ETF" ou "crypto" : détermine les frais et les contrôles


UNIVERS = [
    Actif("SPY", "Actions États-Unis", "Actions", "ETF"),
    Actif("EFA", "Actions pays développés hors US", "Actions", "ETF"),
    Actif("EEM", "Actions pays émergents", "Actions", "ETF"),
    Actif("IEF", "Obligations État US 7-10 ans", "Obligations", "ETF"),
    Actif("TLT", "Obligations État US 20 ans et +", "Obligations", "ETF"),
    Actif("GLD", "Or", "Or", "ETF"),
    Actif("DBC", "Matières premières", "Matières premières", "ETF"),
    Actif("VNQ", "Immobilier US", "Immobilier", "ETF"),
    Actif("BTC-USD", "Bitcoin", "Crypto", "crypto"),
    Actif("ETH-USD", "Ethereum", "Crypto", "crypto"),
]
PAR_SYMBOLE = {actif.symbole: actif for actif in UNIVERS}


def budgets_de_risque(symboles_disponibles):
    """Chaque classe présente reçoit la même part du risque, partagée à égalité entre ses actifs.

    Une classe absente (par exemple la crypto avant 2014) laisse sa part aux autres.
    """
    disponibles = [actif for actif in UNIVERS if actif.symbole in set(symboles_disponibles)]
    classes = {actif.classe for actif in disponibles}
    budgets = {}
    for classe in classes:
        membres = [actif for actif in disponibles if actif.classe == classe]
        for actif in membres:
            budgets[actif.symbole] = 1 / len(classes) / len(membres)
    return budgets
