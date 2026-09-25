"""Tests du testeur de stratégie visuel (rejeu.py)."""
import json
import math

import numpy as np
import pandas as pd
import pytest

from rejeu import construire_page, donnees_rejeu, propre


def marche(jours=1600):
    from robot.univers import PAR_SYMBOLE
    symboles = list(PAR_SYMBOLE)
    aleatoire = np.random.default_rng(2)
    dates = pd.bdate_range("2004-06-01", periods=jours * 2)
    c = pd.DataFrame(100 * np.cumprod(1 + aleatoire.normal(0.0003, 0.01, (len(dates), len(symboles))), axis=0),
                     index=dates, columns=symboles)
    c.loc[:"2014-12-31", ["BTC-USD", "ETH-USD"]] = np.nan
    return c.shift(1).fillna(c), c


def test_propre_remplace_nan_et_infini():
    assert propre({"a": [1.0, math.nan, {"b": math.inf}], "c": "x"}) == {"a": [1.0, None, {"b": None}], "c": "x"}


def test_donnees_rejeu_completes_et_coherentes():
    o, c = marche()
    d = donnees_rejeu(o, c, capital=5_000)
    n = len(d["dates"])
    assert d["valeur"][0] == pytest.approx(5_000) and d["spy"][0] == pytest.approx(5_000)
    assert len(d["valeur"]) == len(d["spy"]) == n
    assert all(len(p) == n for p in d["poids"]) and all(len(g) == n for g in d["cumul"])
    # Tout le profit vient des positions : somme des gains cumulés = profit du compte (à l'arrondi près)
    assert sum(g[-1] for g in d["cumul"]) == pytest.approx(d["valeur"][-1] - 5_000, abs=0.1)
    assert all(0 <= o[0] < n and 0 <= o[1] < len(d["symboles"]) for o in d["ordres"])
    assert d["rapport"]["profit_net"] == pytest.approx(d["valeur"][-1] - 5_000, abs=0.01)
    json.dumps(d, allow_nan=False)


def test_rejouer_une_experience():
    o, c = marche()
    assert donnees_rejeu(o, c, version="retour")["valeur"] != donnees_rejeu(o, c)["valeur"]
    with pytest.raises(KeyError):
        donnees_rejeu(o, c, version="inconnue")


def test_construire_page(tmp_path):
    modele = tmp_path / "m.html"
    modele.write_text('<script type="application/json">/*DONNEES*/</script>', encoding="utf-8")
    page = construire_page({"x": "</script>"}, modele, tmp_path / "p.html").read_text(encoding="utf-8")
    assert page.count("</script>") == 1
    with pytest.raises(ValueError):
        construire_page({"x": math.nan}, modele, tmp_path / "p.html")
