"""Tests du rapport du soir envoyé à la page de suivi (robot/suivi.py)."""
import json
from types import SimpleNamespace

import pandas as pd

from robot.decision import Ordre
from robot.suivi import TABLE, envoyer_rapport, rapport_du_soir

SECURITE = {"sommet": 105_000.0, "chute": -0.0476, "perte_jour": -0.01, "alerte_perte_jour": False,
            "bloquer_achats": False, "tout_vendre": False}


def decision():
    return pd.DataFrame([
        {"symbole": "SPY", "nom": "Actions États-Unis", "note": 12.5, "haussiers": 3, "detecteurs": 3,
         "actuelle": 0.10, "cible": 0.20, "visee": 0.18},
        {"symbole": "BTC-USD", "nom": "Bitcoin", "note": None, "haussiers": 0, "detecteurs": 3,
         "actuelle": 0.0, "cible": 0.0, "visee": 0.0},
    ]).set_index("symbole")


def rapport():
    return rapport_du_soir("2026-09-28", "ordres transmis", 100_000, 40_000, SECURITE, 1.8, decision(),
                           [Ordre("SPY", "achat", 8_000.0)], exclus={"BTC-USD"}, remarques=["ℹ️ test"],
                           message="🤖 Robot v3", regimes={"SPY": "calme"})


def test_rapport_complet_et_convertible_en_json():
    r = rapport()
    json.dumps(r, allow_nan=False)                       # refusé par Supabase s'il restait un NaN
    assert r["seance"] == "2026-09-28" and r["capital"] == 100_000 and r["multiplicateur"] == 1.8
    spy, btc = r["actifs"]
    assert spy == {"symbole": "SPY", "nom": "Actions États-Unis", "note": 12.5, "haussiers": 3, "detecteurs": 3,
                   "actuelle": 0.10, "cible": 0.20, "visee": 0.18, "exclu": False, "regime": "calme"}
    assert btc["note"] is None and btc["exclu"] and btc["regime"] is None
    assert r["ordres"] == [{"symbole": "SPY", "sens": "achat", "montant": 8_000.0, "quantite": None, "fermer": False}]
    assert r["securite"]["bloquer_achats"] is False and r["chute"] == -0.0476


def test_nan_et_infini_remplaces_par_rien():
    d = decision()
    d.loc["SPY", "cible"] = float("nan")
    r = rapport_du_soir("2026-09-28", "ok", float("inf"), 1.0, SECURITE, float("nan"), d, [])
    json.dumps(r, allow_nan=False)
    assert r["capital"] is None and r["multiplicateur"] is None and r["actifs"][0]["cible"] is None


def test_envoi_a_supabase_avec_la_cle_de_service():
    vus = []
    poster = lambda url, **k: (vus.append((url, k)), SimpleNamespace(ok=True))[1]
    assert envoyer_rapport(rapport(), "https://abc.supabase.co/", "cle-secrete", poster) is None
    url, k = vus[0]
    assert url == f"https://abc.supabase.co/rest/v1/{TABLE}"
    assert k["headers"]["Authorization"] == "Bearer cle-secrete" and k["json"]["statut"] == "ordres transmis"


def test_sans_configuration_rien_n_est_envoye(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_KEY", raising=False)
    appels = []
    assert envoyer_rapport(rapport(), poster=lambda *a, **k: appels.append(1)) is None
    assert appels == []


def test_une_erreur_supabase_devient_un_message_jamais_une_exception():
    refus = lambda url, **k: SimpleNamespace(ok=False, status_code=401, text="clé invalide")
    assert "401" in envoyer_rapport(rapport(), "https://abc.supabase.co", "x", refus)

    def panne(url, **k):
        raise ConnectionError("réseau coupé")

    assert "injoignable" in envoyer_rapport(rapport(), "https://abc.supabase.co", "x", panne)
