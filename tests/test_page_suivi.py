"""La page de suivi (dossier suivi/) doit connaître le même panier et les mêmes sécurités que le robot."""
import json
import re
from pathlib import Path

from robot.parametres import ALERTE_PERTE_JOUR, ARRET_ACHATS_CHUTE, ARRET_TOTAL_CHUTE
from robot.univers import UNIVERS

SUIVI = Path(__file__).parent.parent / "suivi"


def test_meme_panier_que_le_robot():
    texte = (SUIVI / "logique.js").read_text(encoding="utf-8")
    panier = json.loads(re.search(r"export const UNIVERS = (\[.*?\]);", texte).group(1))
    assert panier == [actif.symbole for actif in UNIVERS]
    for actif in UNIVERS:
        assert f'"{actif.symbole}": "{actif.nom}"' in texte


def test_memes_seuils_de_securite_que_le_robot():
    texte = (SUIVI / "logique.js").read_text(encoding="utf-8")
    seuils = dict(re.findall(r"(\w+): (-0\.\d+)", re.search(r"export const SEUILS = \{(.*?)\};", texte).group(1)))
    assert float(seuils["alertePerteJour"]) == -ALERTE_PERTE_JOUR
    assert float(seuils["arretAchats"]) == -ARRET_ACHATS_CHUTE
    assert float(seuils["arretTotal"]) == -ARRET_TOTAL_CHUTE


def test_compte_fictif_ecrit_en_dur():
    assert 'ALPACA_TRADING = "https://paper-api.alpaca.markets"' in (SUIVI / "api" / "_commun.js").read_text(encoding="utf-8")
