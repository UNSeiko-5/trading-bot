"""Tests du tableau de bord (tableau_de_bord.py) : cerveau, Monte Carlo, jour par jour, page."""
import json

import numpy as np
import pandas as pd
import pytest

from tableau_de_bord import (
    construire_page, donnees_tableau, lire_cerveau, monte_carlo, pires_chutes, resume_quotidien, texte_lisible,
)


# --- Cerveau ------------------------------------------------------------------------------------

def test_cerveau_lit_les_notes_les_groupes_et_les_liens(tmp_path):
    (tmp_path / "Concepts").mkdir()
    (tmp_path / "Accueil.md").write_text("# Accueil\nVoir [[Tendance]] et [[Frais|les frais]].\n", encoding="utf-8")
    (tmp_path / "Concepts" / "Tendance.md").write_text("# Tendance\nLien vers [[Accueil#haut]], [[Inexistante]].\n",
                                                       encoding="utf-8")
    (tmp_path / "Concepts" / "Frais.md").write_text("# Frais\nCoûte cher. [[Frais]]\n", encoding="utf-8")
    cerveau = lire_cerveau(tmp_path)
    groupes = {n["id"]: n["groupe"] for n in cerveau["noeuds"]}
    assert groupes == {"Accueil": "Accueil", "Tendance": "Concepts", "Frais": "Concepts"}
    # Un lien dans les deux sens compte une fois, les liens cassés et vers soi-même sont ignorés
    assert cerveau["liens"] == [{"source": "Accueil", "target": "Frais"}, {"source": "Accueil", "target": "Tendance"}]
    texte = next(n["texte"] for n in cerveau["noeuds"] if n["id"] == "Accueil")
    assert texte == "Voir Tendance et Frais."   # crochets retirés, titre retiré


def test_le_vrai_cerveau_n_a_aucun_lien_casse():
    import re
    from pathlib import Path
    dossier = Path(__file__).parent.parent / "cerveau"
    ids = {f.stem for f in dossier.rglob("*.md")}
    for fichier in dossier.rglob("*.md"):
        for cible in re.findall(r"\[\[([^\]|#]+)", fichier.read_text(encoding="utf-8")):
            assert cible in ids, f"{fichier.stem} -> {cible}"
    cerveau = lire_cerveau(dossier)
    relies = {l["source"] for l in cerveau["liens"]} | {l["target"] for l in cerveau["liens"]}
    assert relies == ids   # aucune note isolée


def test_texte_lisible_recolle_les_paragraphes_et_garde_les_listes():
    note = "# Titre\nLigne un\ncoupée.\n\n- élément\n  qui continue\n- autre\n1. premier\n2. second\nNouveau paragraphe"
    assert texte_lisible(note) == ("Ligne un coupée.\n\n- élément qui continue\n- autre\n1. premier\n2. second\n"
                                   "Nouveau paragraphe")


# --- Monte Carlo --------------------------------------------------------------------------------

def test_monte_carlo_forme_depart_et_reproductible():
    r = np.random.default_rng(0).normal(0.0003, 0.005, 3000)
    a, b = monte_carlo(r, 500, tirages=50), monte_carlo(r, 500, tirages=50)
    assert a.shape == (50, 501) and (a[:, 0] == 1).all()
    np.testing.assert_array_equal(a, b)


def test_monte_carlo_recolle_des_blocs_du_passe():
    # Passé = 0, 1, 2, ... (en millièmes) : chaque bloc tiré doit être une suite de jours consécutifs
    r = np.arange(1000) / 1e6
    chemins = monte_carlo(r, 63, tirages=20, bloc=21)
    tires = chemins[:, 1:] / chemins[:, :-1] - 1
    for ligne in tires:
        for bloc in ligne.reshape(3, 21):
            ecarts = np.diff(np.round(bloc * 1e6))
            assert (ecarts == 1).all()


def test_monte_carlo_d_un_passe_constant_donne_un_seul_avenir():
    chemins = monte_carlo(np.full(500, 0.001), 252, tirages=10)
    assert chemins[:, -1] == pytest.approx(1.001 ** 252)


def test_monte_carlo_ignore_les_trous_et_refuse_un_historique_trop_court():
    avec_trous = np.full(400, 0.001)
    avec_trous[::2] = np.nan            # un jour sur deux manque : chaque bloc tiré en contiendrait
    assert monte_carlo(avec_trous, 30, tirages=3)[:, -1] == pytest.approx(1.001 ** 30)
    with pytest.raises(ValueError):
        monte_carlo(np.full(10, 0.001), 30)


def test_pires_chutes_a_la_main():
    chemins = np.array([[1, 1.2, 0.9, 1.5], [1, 1.1, 1.2, 1.3]])
    np.testing.assert_allclose(pires_chutes(chemins), [0.9 / 1.2 - 1, 0])


# --- Jour par jour ------------------------------------------------------------------------------

def test_resume_quotidien():
    dates = pd.bdate_range("2020-01-01", periods=5)
    valeur = pd.Series([1, 1.01, 0.99, 0.99, 1.05], index=dates)
    q = resume_quotidien(valeur)
    assert q["nb_jours"] == 4
    assert q["jours_positifs"] == 0.5 and q["jours_negatifs"] == 0.25
    assert q["pire"]["date"] == dates[2].date().isoformat()
    assert q["hors_histogramme"] == 1                  # +6,1 % : hors de l'histogramme (-3 % à +3 %)
    assert sum(q["histogramme"]["compte"]) == 3


# --- Assemblage et page -------------------------------------------------------------------------

def marche_fictif(jours=900):
    from robot.univers import PAR_SYMBOLE
    symboles = list(PAR_SYMBOLE)
    aleatoire = np.random.default_rng(1)
    dates = pd.bdate_range("2004-06-01", periods=jours * 4)
    clotures = pd.DataFrame(100 * np.cumprod(1 + aleatoire.normal(0.0003, 0.01, (len(dates), len(symboles))), axis=0),
                            index=dates, columns=symboles)
    clotures.loc[:"2014-12-31", ["BTC-USD", "ETH-USD"]] = np.nan
    return clotures.shift(1).fillna(clotures), clotures


def test_donnees_tableau_completes_et_en_json_valide():
    ouvertures, clotures = marche_fictif()
    d = donnees_tableau(ouvertures, clotures, "test")
    n = len(d["dates"])
    assert all(len(v) == n for v in d["courbes"].values())
    assert all(len(v) == n for v in d["experiences"]["courbes"].values())
    assert len(d["chutes"]["v2"]) == n and max(d["chutes"]["v2"]) == 0
    assert d["courbes"]["v2"][0] == 1
    assert len(d["aujourdhui"]["actifs"]) == 10
    assert d["aujourdhui"]["investi"] <= 1 + 1e-9
    assert len(d["monte_carlo"]["centiles"]["50"]) == len(d["monte_carlo"]["mois"]) == 121
    json.loads(json.dumps(d, allow_nan=False))   # pas de NaN ni d'infini : lisible par la page


def test_construire_page_insere_les_donnees_sans_casser_la_balise_script(tmp_path):
    modele = tmp_path / "modele.html"
    modele.write_text('<script id="d" type="application/json">/*DONNEES*/</script>', encoding="utf-8")
    sortie = construire_page({"texte": "attention </script> é"}, modele, tmp_path / "page.html")
    page = sortie.read_text(encoding="utf-8")
    assert page.count("</script>") == 1
    contenu = page.split('application/json">')[1].rsplit("</script>", 1)[0]
    assert json.loads(contenu) == {"texte": "attention </script> é"}


def test_construire_page_refuse_un_modele_sans_emplacement(tmp_path):
    modele = tmp_path / "modele.html"
    modele.write_text("<p>rien</p>", encoding="utf-8")
    with pytest.raises(ValueError):
        construire_page({}, modele, tmp_path / "page.html")
