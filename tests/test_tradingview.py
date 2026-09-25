"""L'indicateur TradingView (tradingview/tendance_v2.pine) doit afficher la même note que le robot.

On ne peut pas exécuter du Pine Script ici : on vérifie que ses réglages sont ceux du robot, et on recopie
son calcul en Python (moyennes exponentielles à la façon de TradingView) pour le comparer à robot/signaux.py.
"""
import re
from pathlib import Path

import numpy as np
import pandas as pd

from robot.parametres import DETECTEURS, FENETRE_VOL, JOURS_MIN_HISTORIQUE, NOTE_MAX
from robot.signaux import note_combinee

PINE = (Path(__file__).parent.parent / "tradingview" / "tendance_v2.pine").read_text(encoding="utf-8")


def reglage(nom):
    return float(re.search(rf"^{nom} = ([\d.]+)$", PINE, re.M).group(1))


def test_les_reglages_de_l_indicateur_sont_ceux_du_robot():
    for k, (rapide, lente, facteur) in enumerate(DETECTEURS, start=1):
        assert (reglage(f"RAPIDE_{k}"), reglage(f"LENTE_{k}"), reglage(f"FACTEUR_{k}")) == (rapide, lente, facteur)
    assert reglage("FENETRE_VOL") == FENETRE_VOL
    assert reglage("JOURS_MIN") == JOURS_MIN_HISTORIQUE
    assert reglage("NOTE_MAX") == NOTE_MAX


def ema_tradingview(x, n):
    """ta.ema de TradingView : moyenne exponentielle récursive, qui démarre sur la première valeur."""
    a, sortie, precedente = 2 / (n + 1), np.empty(len(x)), x[0]
    for i, v in enumerate(x):
        precedente = v if i == 0 else a * v + (1 - a) * precedente
        sortie[i] = precedente
    return sortie


def note_facon_tradingview(prix):
    p = prix.to_numpy()
    variation = np.r_[0.0, np.diff(p)]
    alpha = 2 / (FENETRE_VOL + 1)
    m, m2 = ema_tradingview(variation, FENETRE_VOL), ema_tradingview(variation ** 2, FENETRE_VOL)
    agitation = np.sqrt(np.maximum(m2 - m * m, 0) * (2 - alpha) / (2 - 2 * alpha))
    with np.errstate(divide="ignore", invalid="ignore"):   # premier jour : agitation nulle, note vide
        notes = [np.clip((ema_tradingview(p, r) - ema_tradingview(p, l)) / agitation * f, -NOTE_MAX, NOTE_MAX)
                 for r, l, f in DETECTEURS]
    return pd.Series(np.clip(np.mean(notes, axis=0), 0, NOTE_MAX), index=prix.index)


def test_l_indicateur_donne_la_meme_note_que_le_robot_une_fois_l_historique_suffisant():
    # Les deux façons de démarrer les moyennes diffèrent au début, puis l'écart s'efface.
    for graine, tendance in ((0, 0.0004), (1, -0.0003), (2, 0.0)):
        aleatoire = np.random.default_rng(graine)
        prix = pd.Series(100 * np.cumprod(1 + tendance + aleatoire.normal(0, 0.012, 3000)),
                         index=pd.bdate_range("2010-01-01", periods=3000))
        robot, indicateur = note_combinee(prix), note_facon_tradingview(prix)
        # Au-delà de 1 500 jours (6 ans d'historique sur le graphique), l'écart est négligeable
        ecart = (robot - indicateur).abs().iloc[1500:]
        assert ecart.max() < 0.01, (graine, ecart.max())
