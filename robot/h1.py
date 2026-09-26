"""EXP-007 : croisement de moyennes en bougies d'une heure (H1), filtré par la tendance weekly,
avec stop initial et stop suiveur. Idée de l'utilisateur, réglages fixés dans EXPERIENCES.md.

Déroulé :
1. `charger_h1` : bougies d'une heure ajustées (Alpaca), actions de 9h à 16h heure de New York.
2. `trades_actif` : pour chaque actif, les trades (entrée, sortie) selon le croisement, le filtre et les stops.
3. `portefeuille_h1` : taille de chaque trade (risque fixe), plafonds, frais, valeur du compte chaque soir.

Pas de triche avec le futur : croisement constaté à la clôture d'une bougie, achat à l'ouverture de la
suivante ; filtre weekly calculé sur des semaines terminées ; stop vérifié sur la bougie suivante.
"""
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from robot.parametres import EXPOSITION_MAX, FRAIS, PART_MAX_ACTIF, PART_MAX_CRYPTO
from robot.portefeuille import est_crypto
from robot.univers import PAR_SYMBOLE

REGLAGE_H1 = {"courte": 20, "longue": 50, "atr": 14, "stop_init": 2.0, "suiveur": 3.0, "risque": 0.005,
              "weekly": (10, 40), "sortie_weekly": False}
UNE_HEURE = pd.Timedelta(hours=1)


# --- Données --------------------------------------------------------------------------------------

def heures_de_bourse(barres):
    """Garde les bougies des actions qui commencent entre 9h et 15h (heure de New York), jours de semaine."""
    ny = barres.index.tz_convert("America/New_York")
    return barres[(ny.hour >= 9) & (ny.hour <= 15) & (ny.dayofweek < 5)]


def charger_h1(symboles, debut="2016-01-01", cle=None, secret=None):
    """Bougies d'une heure ajustées depuis Alpaca (gratuit). Renvoie {symbole: DataFrame open/high/low/close}
    avec un index en UTC (heure de début de la bougie)."""
    from alpaca.data.enums import Adjustment, DataFeed
    from alpaca.data.historical import CryptoHistoricalDataClient, StockHistoricalDataClient
    from alpaca.data.requests import CryptoBarsRequest, StockBarsRequest
    from alpaca.data.timeframe import TimeFrame

    fin = pd.Timestamp.now(tz="UTC").normalize() - pd.Timedelta(days=1)
    actions = [s for s in symboles if not est_crypto(s)]
    cryptos = [s for s in symboles if est_crypto(s)]
    resultat = {}
    if actions:
        client = StockHistoricalDataClient(cle, secret)
        for flux in (DataFeed.SIP, DataFeed.IEX):
            try:
                brut = client.get_stock_bars(StockBarsRequest(
                    symbol_or_symbols=actions, timeframe=TimeFrame.Hour, start=pd.Timestamp(debut, tz="UTC"),
                    end=fin, adjustment=Adjustment.ALL, feed=flux)).df
                print(f"  Bougies H1 des ETF : flux {flux.value}")
                break
            except Exception as e:
                print(f"  Flux {flux.value} refusé : {type(e).__name__} : {e}")
        else:
            raise RuntimeError("Alpaca n'a fourni aucune bougie H1 pour les ETF")
        for s in actions:
            if s in brut.index.get_level_values(0):
                resultat[s] = heures_de_bourse(brut.xs(s, level=0)[["open", "high", "low", "close"]].sort_index())
    if cryptos:
        brut = CryptoHistoricalDataClient().get_crypto_bars(CryptoBarsRequest(
            symbol_or_symbols=[s.replace("-USD", "/USD") for s in cryptos], timeframe=TimeFrame.Hour,
            start=pd.Timestamp(debut, tz="UTC"), end=fin)).df
        for s in cryptos:
            alpaca = s.replace("-USD", "/USD")
            if alpaca in brut.index.get_level_values(0):
                resultat[s] = brut.xs(alpaca, level=0)[["open", "high", "low", "close"]].sort_index()
    return resultat


# --- Indicateurs ----------------------------------------------------------------------------------

def moyenne_exponentielle(x, n):
    return pd.Series(x).ewm(span=n, adjust=False, min_periods=n).mean().to_numpy()


def atr_wilder(haut, bas, cloture, n=14):
    """Agitation moyenne d'une bougie (Average True Range de Wilder)."""
    precedente = np.r_[np.nan, cloture[:-1]]
    vrai = np.nanmax(np.vstack([haut - bas, np.abs(haut - precedente), np.abs(bas - precedente)]), axis=0)
    return pd.Series(vrai).ewm(alpha=1 / n, adjust=False, min_periods=n).mean().to_numpy()


def croisements_haussiers(cloture, courte, longue):
    """Vrai à la bougie i si la moyenne courte passe au-dessus de la longue à sa clôture."""
    c, l = moyenne_exponentielle(cloture, courte), moyenne_exponentielle(cloture, longue)
    dessus = c > l
    avant = np.r_[False, dessus[:-1]]
    valide = ~np.isnan(c) & ~np.isnan(l) & ~np.isnan(np.r_[np.nan, l[:-1]])
    return dessus & ~avant & valide


def filtre_weekly(clotures_jour, courte=10, longue=40):
    """Tendance weekly haussière, connue à la fin de chaque semaine (vendredi) : moyenne courte des
    clôtures hebdomadaires au-dessus de la longue. Série indexée par la date de fin de semaine."""
    semaines = clotures_jour.dropna().resample("W-FRI").last().dropna()
    return (semaines.rolling(courte).mean() > semaines.rolling(longue).mean()).where(
        semaines.rolling(longue).count() >= longue, False)


def filtre_par_bougie(filtre, temps):
    """Pour chaque bougie, l'état du filtre de la dernière semaine TERMINÉE avant le jour de la bougie."""
    jours = pd.DatetimeIndex(temps).tz_convert("America/New_York").tz_localize(None).normalize()
    veille = jours - pd.Timedelta(days=1)
    positions = filtre.index.searchsorted(veille, side="right") - 1
    valeurs = filtre.to_numpy()
    return np.where(positions >= 0, valeurs[np.clip(positions, 0, None)], False).astype(bool)


# --- Trades d'un actif ------------------------------------------------------------------------------

@dataclass
class Trade:
    i_entree: int
    prix_entree: float
    distance_stop: float          # (entrée - stop initial) / entrée
    i_sortie: int = None          # None : encore ouvert à la fin
    prix_sortie: float = None


def trades_actif(barres, entrees, filtre, reglage=REGLAGE_H1):
    """Déroule la règle sur un actif. `entrees` : croisements haussiers (bool par bougie) ; `filtre` :
    tendance weekly (bool par bougie). Renvoie la liste des trades."""
    o, h, b, c = (barres[k].to_numpy(dtype=float) for k in ("open", "high", "low", "close"))
    atr = atr_wilder(h, b, c, reglage["atr"])
    n, trades, ouvert = len(c), [], None
    stop = plus_haut = 0.0
    attendre = False   # entrée décidée à la clôture précédente, exécutée à l'ouverture de cette bougie
    sortir = False     # sortie weekly décidée à la clôture précédente
    for i in range(n):
        if ouvert is None and attendre:
            attendre = False
            stop = o[i] - reglage["stop_init"] * atr[i - 1]
            if stop > 0:
                ouvert = Trade(i, o[i], (o[i] - stop) / o[i])
                plus_haut = o[i]
        if ouvert is not None:
            if sortir:
                ouvert.i_sortie, ouvert.prix_sortie = i, o[i]
            elif b[i] <= stop:                      # stop touché dans la bougie (ou trou à l'ouverture)
                ouvert.i_sortie, ouvert.prix_sortie = i, min(o[i], stop)
            if ouvert.i_sortie is not None:
                trades.append(ouvert)
                ouvert, sortir = None, False
                continue                            # pas de nouvelle entrée sur la bougie de sortie
            plus_haut = max(plus_haut, h[i])
            if not np.isnan(atr[i]):
                stop = max(stop, plus_haut - reglage["suiveur"] * atr[i])
            if reglage["sortie_weekly"] and not filtre[i]:
                sortir = True
        elif entrees[i] and filtre[i] and not np.isnan(atr[i]) and i + 1 < n:
            attendre = True
    if ouvert is not None:
        trades.append(ouvert)
    return trades


# --- Portefeuille -------------------------------------------------------------------------------------

@dataclass
class ResultatH1:
    valeur: pd.Series                       # valeur du compte chaque soir (départ : 1)
    frais: float                            # frais totaux, en part du capital de départ
    trades: list = field(default_factory=list)   # (symbole, date d'entrée, date de sortie, résultat en part du capital)
    exposition: pd.Series = None            # part investie chaque soir


def portefeuille_h1(barres, trades, jours, reglage=REGLAGE_H1, frais=FRAIS):
    """Assemble les trades de tous les actifs en un seul compte, marqué chaque soir (21h UTC).

    Taille de chaque trade = risque / distance du stop, bornée par 25 % par actif, 15 % en crypto,
    100 % au total et le cash disponible (jamais de levier). Frais à l'achat et à la vente.
    """
    temps = {s: barres[s].index.as_unit("ns").asi8 for s in barres}   # tout en nanosecondes (pandas 3 : microsecondes)
    clotures = {s: barres[s]["close"].to_numpy(dtype=float) for s in barres}
    taux = {s: frais[PAR_SYMBOLE[s].type] if s in PAR_SYMBOLE else frais["ETF"] for s in barres}

    def prix(s, instant):
        """Dernière clôture connue à `instant` (bougie terminée, donc début + 1 h <= instant)."""
        k = np.searchsorted(temps[s], instant - UNE_HEURE.value, side="right") - 1
        return clotures[s][k] if k >= 0 else np.nan

    evenements = []
    for s, liste in trades.items():
        for t in liste:
            evenements.append((temps[s][t.i_entree], 1, s, t))
            if t.i_sortie is not None:
                evenements.append((temps[s][t.i_sortie], 0, s, t))   # 0 : les sorties passent avant les entrées
    evenements.sort(key=lambda e: (e[0], e[1]))

    cash, positions, total_frais, resultats = 1.0, {}, 0.0, []
    marques = (pd.DatetimeIndex(jours).tz_localize("UTC") + pd.Timedelta(hours=21)).as_unit("ns")
    valeurs, expositions, k = [], [], 0

    def valeur_positions(instant):
        return {s: q * prix(s, instant) for s, (q, _, _) in positions.items()}

    for marque in marques.asi8:
        while k < len(evenements) and evenements[k][0] <= marque:
            instant, genre, s, t = evenements[k]
            k += 1
            if genre == 0 and positions.get(s, (None, None, None))[1] is t:   # sortie d'un trade réellement pris
                q, _, investi_entree = positions.pop(s)
                produit = q * t.prix_sortie
                cout = produit * taux[s]
                cash += produit - cout
                total_frais += cout
                resultats.append((s, t.i_entree, t.i_sortie, produit - cout - investi_entree))
            elif genre == 1 and s not in positions:
                valeurs_pos = valeur_positions(instant)
                capital = cash + sum(v for v in valeurs_pos.values() if not np.isnan(v))
                expo = sum(valeurs_pos.values()) / capital if capital > 0 else 1.0
                expo_crypto = sum(v for x, v in valeurs_pos.items() if est_crypto(x)) / capital if capital > 0 else 1.0
                part = min(reglage["risque"] / t.distance_stop, PART_MAX_ACTIF, EXPOSITION_MAX - expo)
                if est_crypto(s):
                    part = min(part, PART_MAX_CRYPTO - expo_crypto)
                montant = min(part * capital, cash / (1 + taux[s]))
                if montant > 1e-9:
                    cout = montant * taux[s]
                    cash -= montant + cout
                    total_frais += cout
                    positions[s] = (montant / t.prix_entree, t, montant + cout)   # (parts, trade, argent engagé)
        valeurs_pos = valeur_positions(marque)
        investi = sum(v for v in valeurs_pos.values() if not np.isnan(v))
        valeurs.append(cash + investi)
        expositions.append(investi / (cash + investi) if cash + investi > 0 else 0.0)

    # Trades encore ouverts : comptés à leur dernière valeur
    for s, (q, t, investi_entree) in positions.items():
        resultats.append((s, t.i_entree, None, q * prix(s, marques.asi8[-1]) - investi_entree))
    trades_lisibles = [(s, barres[s].index[e], None if x is None else barres[s].index[x], r) for s, e, x, r in resultats]
    return ResultatH1(pd.Series(valeurs, index=pd.DatetimeIndex(jours)), total_frais, trades_lisibles,
                      pd.Series(expositions, index=pd.DatetimeIndex(jours)))


def strategie_h1(barres, clotures_jour, jours, reglage=None, frais=FRAIS, decalages=None):
    """La stratégie complète sur tous les actifs. `decalages` (test du hasard) : {symbole: décalage en
    bougies} appliqué aux croisements, pour la même règle avec un mauvais timing."""
    reglage = {**REGLAGE_H1, **(reglage or {})}
    trades = {}
    for s, b in barres.items():
        entrees = croisements_haussiers(b["close"].to_numpy(dtype=float), reglage["courte"], reglage["longue"])
        if decalages and s in decalages:
            entrees = np.roll(entrees, decalages[s])
        if reglage["weekly"] is None:
            filtre = np.ones(len(b), dtype=bool)
        else:
            filtre = filtre_par_bougie(filtre_weekly(clotures_jour[s], *reglage["weekly"]), b.index)
        trades[s] = trades_actif(b, entrees, filtre, reglage)
    return portefeuille_h1(barres, trades, jours, reglage, frais)
