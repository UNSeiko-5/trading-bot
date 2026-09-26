"""Tests de la stratégie H1 (robot/h1.py), sur des bougies fictives calculables à la main."""
import numpy as np
import pandas as pd
import pytest

from robot.h1 import (
    REGLAGE_H1, Trade, atr_wilder, croisements_haussiers, filtre_par_bougie, filtre_weekly, heures_de_bourse,
    portefeuille_h1, strategie_h1, trades_actif,
)


def bougies(clotures, ecart=0.5, debut="2024-01-02 14:00", ouvertures=None, bas=None):
    """Bougies d'une heure : ouverture = clôture précédente, plus haut / bas à ±ecart."""
    c = np.asarray(clotures, dtype=float)
    o = np.r_[c[0], c[:-1]] if ouvertures is None else np.asarray(ouvertures, dtype=float)
    b = np.minimum(o, c) - ecart if bas is None else np.asarray(bas, dtype=float)
    index = pd.date_range(debut, periods=len(c), freq="h", tz="UTC")
    return pd.DataFrame({"open": o, "high": np.maximum(o, c) + ecart, "low": b, "close": c}, index=index)


# --- Indicateurs -----------------------------------------------------------------------------------

def test_croisement_detecte_a_la_bonne_bougie():
    c = np.r_[np.linspace(100, 90, 60), np.linspace(90, 110, 60)]
    croix = croisements_haussiers(c, 5, 20)
    assert croix.sum() == 1
    i = int(np.flatnonzero(croix)[0])
    e5 = pd.Series(c).ewm(span=5, adjust=False).mean()
    e20 = pd.Series(c).ewm(span=20, adjust=False).mean()
    assert e5[i] > e20[i] and e5[i - 1] <= e20[i - 1]


def test_atr_prix_constant_ecart_fixe():
    c = np.full(50, 100.0)
    assert atr_wilder(c + 0.5, c - 0.5, c, 14)[-1] == pytest.approx(1.0)


def test_filtre_weekly_sans_regarder_le_futur():
    jours = pd.bdate_range("2023-01-02", periods=400)
    prix = pd.Series(np.r_[np.linspace(100, 60, 300), np.linspace(60, 140, 100)], index=jours)
    filtre = filtre_weekly(prix, 5, 20)
    vendredi = filtre[filtre & ~filtre.shift(1, fill_value=False)].index[0]   # premier vendredi haussier
    temps = pd.DatetimeIndex([vendredi + pd.Timedelta(hours=15), vendredi + pd.Timedelta(days=3, hours=15)]).tz_localize(
        "America/New_York").tz_convert("UTC")
    le_vendredi, le_lundi = filtre_par_bougie(filtre, temps)
    assert not le_vendredi   # la semaine n'est pas finie : on utilise encore la semaine d'avant
    assert le_lundi


def test_heures_de_bourse():
    index = pd.date_range("2024-01-08 00:00", periods=24, freq="h", tz="America/New_York").tz_convert("UTC")
    gardees = heures_de_bourse(pd.DataFrame({"close": 1.0}, index=index))
    assert list(gardees.index.tz_convert("America/New_York").hour) == [9, 10, 11, 12, 13, 14, 15]


# --- Trades d'un actif ------------------------------------------------------------------------------

REGLAGE = {**REGLAGE_H1, "atr": 3}


def test_entree_a_l_ouverture_suivante_puis_sortie_au_stop():
    c = [100, 100, 100, 100, 101, 103, 105, 104, 100, 96, 95]
    b = bougies(c)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[3] = True
    trades = trades_actif(b, entrees, np.ones(len(c), dtype=bool), REGLAGE)
    t = trades[0]
    assert t.i_entree == 4 and t.prix_entree == b["open"].iloc[4]            # ouverture de la bougie suivante
    atr = atr_wilder(b["high"].to_numpy(), b["low"].to_numpy(), b["close"].to_numpy(), 3)
    assert t.distance_stop == pytest.approx(2 * atr[3] / b["open"].iloc[4])
    assert t.i_sortie is not None and t.prix_sortie < max(c)
    # Le stop de sortie = plus haut atteint - 3 ATR (il a monté avec le prix)
    assert t.prix_sortie > b["open"].iloc[4] - 2 * atr[3]


def test_trou_sous_le_stop_sortie_a_l_ouverture():
    c = [100, 100, 100, 100, 100, 100, 80]
    o = [100, 100, 100, 100, 100, 100, 80]      # la dernière bougie ouvre directement à 80
    b = bougies(c, ouvertures=o)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[3] = True
    t = trades_actif(b, entrees, np.ones(len(c), dtype=bool), REGLAGE)[0]
    assert t.i_sortie == 6 and t.prix_sortie == 80                          # pas au prix du stop


def test_pas_d_achat_si_filtre_baissier_et_trade_ouvert_a_la_fin():
    c = [100, 100, 100, 100, 101, 102, 103]
    b = bougies(c)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[3] = True
    assert trades_actif(b, entrees, np.zeros(len(c), dtype=bool), REGLAGE) == []
    t = trades_actif(b, entrees, np.ones(len(c), dtype=bool), REGLAGE)[0]
    assert t.i_sortie is None                                                # toujours ouvert


def test_sortie_weekly_si_demandee():
    c = [100, 100, 100, 100, 101, 102, 103, 104, 105]
    b = bougies(c)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[3] = True
    filtre = np.ones(len(c), dtype=bool)
    filtre[6:] = False
    assert trades_actif(b, entrees, filtre, REGLAGE)[0].i_sortie is None
    t = trades_actif(b, entrees, filtre, {**REGLAGE, "sortie_weekly": True})[0]
    assert t.i_sortie == 7 and t.prix_sortie == b["open"].iloc[7]           # décidé à la clôture de 6, vendu à 7


def test_pas_de_nouvelle_entree_sur_la_bougie_de_sortie():
    c = [100, 100, 100, 100, 100, 90, 90, 90]
    b = bougies(c)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[[3, 5]] = True                                                  # 2e croisement le jour de la sortie
    trades = trades_actif(b, entrees, np.ones(len(c), dtype=bool), REGLAGE)
    assert len(trades) == 1 and trades[0].i_sortie == 5


# --- Portefeuille -------------------------------------------------------------------------------------

def compte(barres, trades, frais=None):
    jours = pd.date_range(barres[next(iter(barres))].index[0].normalize().tz_localize(None), periods=3, freq="D")
    return portefeuille_h1(barres, trades, jours, REGLAGE, frais or {"ETF": 0.0, "crypto": 0.0})


def test_taille_selon_le_risque_et_plafond_par_actif():
    b = bougies([100] * 30, debut="2024-01-02 10:00")
    b["close"].iloc[20:] = 110.0
    # Stop à 10 % : on risque 0,5 % du capital -> position de 5 % ; elle gagne 10 % -> +0,5 %
    r = compte({"SPY": b}, {"SPY": [Trade(5, 100.0, 0.10, 25, 110.0)]})
    assert r.valeur.iloc[-1] == pytest.approx(1.005)
    # Stop à 1 % : la taille voulue (50 %) est plafonnée à 25 % -> +2,5 %
    r = compte({"SPY": b}, {"SPY": [Trade(5, 100.0, 0.01, 25, 110.0)]})
    assert r.valeur.iloc[-1] == pytest.approx(1.025)


def test_plafond_crypto_et_jamais_plus_de_100_pour_cent():
    barres = {s: bougies([100] * 30, debut="2024-01-02 10:00") for s in ("BTC-USD", "SPY", "EFA", "IEF", "GLD", "TLT")}
    trades = {s: [Trade(5, 100.0, 0.001)] for s in barres}                   # stops minuscules : tailles énormes
    r = compte(barres, trades)
    assert r.exposition.iloc[-1] <= 1 + 1e-9
    btc = [x for x in r.trades if x[0] == "BTC-USD"]
    assert btc and btc[0][3] == pytest.approx(0)                              # prix inchangé : ni gain ni perte


def test_frais_a_l_achat_et_a_la_vente():
    b = bougies([100] * 30, debut="2024-01-02 10:00")
    r = compte({"SPY": b}, {"SPY": [Trade(5, 100.0, 0.10, 25, 100.0)]}, {"ETF": 0.001, "crypto": 0.005})
    assert r.frais == pytest.approx(0.05 * 0.001 * 2)
    assert r.valeur.iloc[-1] == pytest.approx(1 - r.frais)


def test_strategie_complete_sans_triche_avec_le_futur():
    aleatoire = np.random.default_rng(0)
    index = pd.date_range("2022-01-03 14:00", periods=3000, freq="h", tz="UTC")
    c = 100 * np.cumprod(1 + aleatoire.normal(0.0002, 0.004, 3000))
    b = pd.DataFrame({"open": np.r_[c[0], c[:-1]], "high": c * 1.002, "low": c * 0.998, "close": c}, index=index)
    jours_bourse = pd.bdate_range("2019-01-01", "2022-06-30")
    quotidien = pd.DataFrame({"SPY": np.linspace(50, 100, len(jours_bourse))}, index=jours_bourse)
    jours = pd.date_range("2022-01-04", index[-1].tz_localize(None).normalize() - pd.Timedelta(days=1), freq="D")
    normal = strategie_h1({"SPY": b}, quotidien, jours)
    modifie = b.copy()
    modifie.iloc[2000:] *= 0.7
    autre = strategie_h1({"SPY": modifie}, quotidien, jours)
    coupure = index[1999].tz_localize(None).normalize() - pd.Timedelta(days=1)
    pd.testing.assert_series_equal(normal.valeur.loc[:coupure], autre.valeur.loc[:coupure])
    assert len(normal.trades) > 0
    decale = strategie_h1({"SPY": b}, quotidien, jours, decalages={"SPY": 500})
    assert not np.allclose(decale.valeur, normal.valeur)


def test_achat_au_prix_d_ouverture_reel_meme_avec_un_trou():
    # La bougie d'entrée ouvre à 103 alors que la bougie du signal a clôturé à 100 : on paie 103
    c = [100, 100, 100, 100, 104, 105, 106]
    o = [100, 100, 100, 100, 103, 104, 105]
    b = bougies(c, ouvertures=o)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[3] = True
    t = trades_actif(b, entrees, np.ones(len(c), dtype=bool), REGLAGE)[0]
    assert t.i_entree == 4 and t.prix_entree == 103


def test_une_sortie_ne_laisse_pas_d_etat_qui_tuerait_le_trade_suivant():
    # Sortie weekly demandée : 1er trade sorti au stop pendant que le filtre est baissier, puis nouveau trade
    c = [100, 100, 100, 100, 100, 90, 90, 90, 90, 91, 92, 93, 94, 95]
    b = bougies(c)
    entrees = np.zeros(len(c), dtype=bool)
    entrees[[3, 8]] = True
    filtre = np.ones(len(c), dtype=bool)
    filtre[4:6] = False                                     # baissier au moment de la 1re sortie
    trades = trades_actif(b, entrees, filtre, {**REGLAGE, "sortie_weekly": True})
    assert len(trades) == 2
    assert trades[1].i_entree == 9 and trades[1].i_sortie is None   # le 2e trade vit normalement
