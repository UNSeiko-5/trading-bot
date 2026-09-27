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
# EXP-011 (en test, la v3 ne les utilise pas) : 11 marchés de plus, choisis avant les tests (EXPERIENCES.md).
AJOUTS_EXP_011 = [
    Actif("QQQ", "Actions Nasdaq 100 (technologie US)", "Actions", "ETF"),
    Actif("EWJ", "Actions Japon", "Actions", "ETF"),
    Actif("TIP", "Obligations US indexées sur l'inflation", "Obligations", "ETF"),
    Actif("LQD", "Obligations d'entreprises US", "Obligations", "ETF"),
    Actif("USO", "Pétrole", "Matières premières", "ETF"),
    Actif("SLV", "Argent (métal)", "Matières premières", "ETF"),
    Actif("DBA", "Agriculture", "Matières premières", "ETF"),
    Actif("RWX", "Immobilier hors États-Unis", "Immobilier", "ETF"),
    Actif("UUP", "Dollar US", "Devises", "ETF"),
    Actif("FXE", "Euro", "Devises", "ETF"),
    Actif("FXY", "Yen", "Devises", "ETF"),
]
UNIVERS_ELARGI = UNIVERS + AJOUTS_EXP_011
PAR_SYMBOLE = {actif.symbole: actif for actif in UNIVERS_ELARGI}


def budgets_de_risque(symboles_disponibles):
    """Chaque classe présente reçoit la même part du risque, partagée à égalité entre ses actifs.

    Une classe absente (par exemple la crypto avant 2014) laisse sa part aux autres.
    """
    disponibles = [PAR_SYMBOLE[s] for s in symboles_disponibles if s in PAR_SYMBOLE]
    classes = {actif.classe for actif in disponibles}
    budgets = {}
    for classe in classes:
        membres = [actif for actif in disponibles if actif.classe == classe]
        for actif in membres:
            budgets[actif.symbole] = 1 / len(classes) / len(membres)
    return budgets
