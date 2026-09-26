"""Tests de la décision du robot v3 (robot/decision.py) : sécurités, plan d'ordres, message."""
import numpy as np
import pandas as pd
import pytest

from robot.decision import (
    ORDRE_MINIMUM, Ordre, controle_final, decision_du_jour, etat_securite, message, plan_ordres, symbole_alpaca,
    symbole_depuis_position,
)
from robot.parametres import BUDGET_RISQUE, TAMPON
from robot.simulation import strategie_v2

SURS = {"bloquer_achats": False, "tout_vendre": False, "alerte_perte_jour": False, "chute": 0.0, "perte_jour": 0.0}


def decision(**visees):
    return pd.DataFrame([{"symbole": s, "nom": s, "note": 10.0, "haussiers": 3, "detecteurs": 3, "actuelle": 0.0,
                          "cible": v, "visee": v} for s, v in visees.items()]).set_index("symbole")


def test_symboles_crypto():
    assert symbole_alpaca("BTC-USD") == "BTC/USD" and symbole_alpaca("SPY") == "SPY"
    assert symbole_depuis_position("BTCUSD") == "BTC-USD" and symbole_depuis_position("ETH/USD") == "ETH-USD"
    assert symbole_depuis_position("SPY") == "SPY"


def test_securite_seuils():
    assert not etat_securite([100, 110], 100, 101)["bloquer_achats"]          # -9 %
    s = etat_securite([100, 125], 100, 101)                                    # -20 %
    assert s["bloquer_achats"] and not s["tout_vendre"] and s["chute"] == pytest.approx(-0.2)
    assert etat_securite([100, 140], 100, 101)["tout_vendre"]                  # -28,6 %
    assert etat_securite([], 94, 100)["alerte_perte_jour"]                     # -6 % dans la journée
    assert etat_securite([], 96, 100)["chute"] == 0                            # sans historique : sommet = aujourd'hui


def test_plan_achat_vente_et_fermeture():
    d = decision(SPY=0.20, TLT=0.05, GLD=0.0)
    positions = {"TLT": (100.0, 10_000.0), "GLD": (10.0, 2_000.0)}
    ordres = plan_ordres(d, positions, {"SPY": 500.0, "TLT": 100.0, "GLD": 200.0}, 100_000, 50_000,
                         {"SPY": True, "TLT": True, "GLD": True}, SURS)
    par = {o.symbole: o for o in ordres}
    assert par["GLD"].fermer and par["GLD"].sens == "vente"
    assert par["TLT"].sens == "vente" and par["TLT"].quantite == pytest.approx(50.0)   # 10 000 $ -> 5 000 $
    assert par["SPY"].sens == "achat" and par["SPY"].montant == pytest.approx(20_000)
    assert [o.sens for o in ordres] == ["vente", "vente", "achat"]                    # ventes d'abord


def test_jamais_plus_d_achats_que_le_cash():
    d = decision(SPY=0.25, EFA=0.25)
    ordres = plan_ordres(d, {}, {"SPY": 500.0, "EFA": 80.0}, 100_000, 10_000, {"SPY": True, "EFA": True}, SURS)
    assert sum(o.montant for o in ordres) <= 10_000 * 0.99 + 1e-6
    assert ordres[0].montant == pytest.approx(ordres[1].montant)                      # réduits dans la même proportion


def test_actif_non_fractionnable_en_parts_entieres():
    ordres = plan_ordres(decision(DBC=0.10), {}, {"DBC": 23.0}, 10_000, 10_000, {"DBC": False}, SURS)
    assert ordres[0].quantite == 43 and ordres[0].montant == pytest.approx(43 * 23.0)


def test_petits_ecarts_ignores_et_actifs_exclus():
    d = decision(SPY=0.10, TLT=0.30)
    positions = {"SPY": (20.0, 10_000 - ORDRE_MINIMUM / 2)}
    assert plan_ordres(d, positions, {"SPY": 500.0, "TLT": 100.0}, 100_000, 90_000, {"SPY": True, "TLT": True},
                       SURS, exclus={"TLT"}) == []


def test_a_moins_20_pour_cent_plus_d_achat_mais_des_ventes():
    d = decision(SPY=0.25, TLT=0.0)
    s = dict(SURS, bloquer_achats=True)
    ordres = plan_ordres(d, {"TLT": (10.0, 1_000.0)}, {"SPY": 500.0, "TLT": 100.0}, 100_000, 99_000,
                         {"SPY": True, "TLT": True}, s)
    assert [o.sens for o in ordres] == ["vente"]


def test_a_moins_25_pour_cent_tout_est_vendu():
    d = decision(SPY=0.25, TLT=0.10)
    s = dict(SURS, bloquer_achats=True, tout_vendre=True)
    ordres = plan_ordres(d, {"SPY": (10.0, 5_000.0), "TLT": (10.0, 1_000.0)}, {"SPY": 500.0, "TLT": 100.0},
                         100_000, 94_000, {"SPY": True, "TLT": True}, s)
    assert {o.symbole for o in ordres} == {"SPY", "TLT"} and all(o.fermer for o in ordres)


def marche(graine=0, jours=1500):
    aleatoire = np.random.default_rng(graine)
    symboles = ("SPY", "EFA", "IEF", "GLD", "BTC-USD")
    prix = 100 * np.cumprod(1 + aleatoire.normal(0.0004, [0.012, 0.013, 0.005, 0.01, 0.04], (jours, 5)), axis=0)
    c = pd.DataFrame(prix, index=pd.bdate_range("2012-01-01", periods=jours), columns=symboles)
    return c.shift(1).fillna(c), c


def test_decision_du_jour_identique_au_backtest_v3():
    # Sans position de départ, la part visée du dernier jour = celle que le backtest de la v3 aurait voulu
    # atteindre à partir de zéro, garde-fous compris
    o, c = marche()
    d, m = decision_du_jour(o, c, pd.Series(dtype=float))
    assert 1 <= m <= 2.5
    assert (d["visee"] >= 0).all() and d["visee"].sum() <= 1 + 1e-9 and d.loc["BTC-USD", "visee"] <= 0.15 + 1e-9
    assert set(d.columns) >= {"note", "haussiers", "cible", "visee"}
    # Et avec les positions que le backtest v3 détient, la zone tampon laisse les positions en place ou au bord
    r = strategie_v2(o, c, debut=c.index[500], budget=BUDGET_RISQUE, tampon=TAMPON)
    d2, _ = decision_du_jour(o, c, r.poids.iloc[-1])
    assert (np.abs(d2["visee"] - d2["cible"]) <= np.abs(r.poids.iloc[-1] - d2["cible"]) + 1e-9).all()


def test_message_explique_chaque_actif():
    d = decision(SPY=0.2, TLT=0.0)
    d.loc["TLT", "actuelle"] = 0.05
    from robot.decision import Ordre
    texte = message("2026-09-25", 100_000, SURS, 1.8, d, [Ordre("SPY", "achat", 20_000), Ordre("TLT", "vente", 5_000, 50, True)])
    assert "SPY : 3/3 détecteurs haussiers" in texte and "achat de 20 000 $" in texte
    assert "vente complète" in texte and "x1,80" in texte


# --- Veto final (controle_final) ---------------------------------------------------------------------------

def test_veto_laisse_passer_un_plan_normal():
    d = decision(SPY=0.20, TLT=0.05, GLD=0.0, **{"BTC-USD": 0.10})
    positions = {"TLT": (100.0, 10_000.0), "GLD": (10.0, 2_000.0)}
    ordres = plan_ordres(d, positions, {"SPY": 500.0, "TLT": 100.0, "GLD": 200.0, "BTC-USD": 60_000.0}, 100_000,
                         50_000, {"SPY": True, "TLT": True, "GLD": True, "BTC-USD": True}, SURS)
    assert controle_final(ordres, positions, 100_000, 50_000, SURS) == []
    arret = dict(SURS, bloquer_achats=True, tout_vendre=True)
    ventes = plan_ordres(d, positions, {"SPY": 500.0, "TLT": 100.0, "GLD": 200.0, "BTC-USD": 60_000.0}, 100_000,
                         50_000, {"SPY": True, "TLT": True, "GLD": True, "BTC-USD": True}, arret)
    assert ventes and controle_final(ventes, positions, 100_000, 50_000, arret) == []


@pytest.mark.parametrize("ordres, positions, securite, attendu", [
    ([Ordre("SPY", "achat", 40_000)], {}, SURS, "SPY : 40 %"),                                      # plafond 25 %
    ([Ordre("BTC-USD", "achat", 20_000)], {}, SURS, "BTC-USD : 20 %"),                              # crypto 15 %
    ([Ordre("BTC-USD", "achat", 12_000), Ordre("ETH-USD", "achat", 12_000)], {}, SURS, "crypto : 24 %"),
    ([Ordre("SPY", "achat", 20_000)], {"TLT": (1.0, 25_000.0), "GLD": (1.0, 25_000.0), "IEF": (1.0, 25_000.0),
                                       "EFA": (1.0, 20_000.0)}, SURS, "115 % du capital investi"),
    ([Ordre("SPY", "achat", 20_000), Ordre("TLT", "achat", 20_000)], {}, SURS, "levier"),          # cash 30 000 $
    ([Ordre("SPY", "achat", 5_000)], {}, dict(SURS, bloquer_achats=True), "achat interdit"),
    ([Ordre("SPY", "vente", 1_000, quantite=2.0)], {"SPY": (1.0, 500.0)}, SURS, "découvert"),
    ([Ordre("SPY", "vente", 250, quantite=0.5)], {"SPY": (1.0, 500.0)}, dict(SURS, tout_vendre=True), "complète"),
    ([Ordre("AAPL", "achat", 1_000)], {}, SURS, "hors du panier"),
    ([Ordre("SPY", "achat", float("nan"))], {}, SURS, "invalide"),
    ([Ordre("SPY", "achat", -500)], {}, SURS, "invalide"),
    ([Ordre("SPY", "vendre", 500)], {}, SURS, "sens inconnu"),
])
def test_veto_bloque_les_plans_anormaux(ordres, positions, securite, attendu):
    problemes = controle_final(ordres, positions, 100_000, 30_000, securite)
    assert problemes and any(attendu in p for p in problemes), problemes


def test_veto_tolere_de_petits_ecarts_de_prix():
    # 26 % sur un actif après les ordres (le prix a bougé depuis la clôture) : sous la marge de 2 points
    assert controle_final([Ordre("SPY", "achat", 1_000)], {"SPY": (50.0, 25_000.0)}, 100_000, 30_000, SURS) == []


def test_compte_sans_marge_les_achats_n_attendent_pas_l_argent_des_ventes():
    # 90 000 $ en SPY à alléger à 20 000 $, 10 000 $ de cash, 50 000 $ d'EFA voulus
    d = decision(SPY=0.20, EFA=0.50)
    positions = {"SPY": (180.0, 90_000.0)}
    prix = {"SPY": 500.0, "EFA": 80.0}
    fr = {"SPY": True, "EFA": True}
    avec = plan_ordres(d, positions, prix, 100_000, 10_000, fr, SURS)
    sans = plan_ordres(d, positions, prix, 100_000, 10_000, fr, SURS, compter_ventes=False)
    achat = lambda ordres: sum(o.montant for o in ordres if o.sens == "achat")
    assert achat(avec) == pytest.approx(50_000)                    # la vente de 70 000 $ finance l'achat
    assert achat(sans) == pytest.approx(0.99 * 10_000)            # seulement le cash déjà là
    assert [o.symbole for o in sans if o.sens == "vente"] == ["SPY"]
    from robot.decision import achats_reportes
    assert achats_reportes(d, positions, 100_000, sans, SURS) == pytest.approx(50_000 - 9_900)
    assert achats_reportes(d, positions, 100_000, sans, {**SURS, "bloquer_achats": True}) == 0


def test_veto_compte_sans_marge_achats_limites_au_cash_deja_la():
    ordres = [Ordre("SPY", "vente", 40_000, quantite=80.0), Ordre("EFA", "achat", 20_000)]
    positions = {"SPY": (180.0, 90_000.0)}
    assert controle_final(ordres, positions, 100_000, 10_000, SURS) == []          # ventes comptées : 50 000 $
    problemes = controle_final(ordres, positions, 100_000, 10_000, SURS, compter_ventes=False)
    assert any("levier" in p for p in problemes)                                    # 20 000 $ pour 10 000 $ de cash
