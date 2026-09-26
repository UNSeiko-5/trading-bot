"""Régimes de marché (EXP-009) : un modèle de Markov caché (HMM) par actif, idée de la vidéo de la boîte à idées.

Pour chaque actif :
1. le modèle apprend (algorithme de Baum-Welch) sur les rendements quotidiens des `fenetre` derniers jours,
   et il est réappris tous les `reapprentissage` jours, avec le passé seulement (walk-forward) ;
2. les régimes sont rangés par agitation : 0 = le plus calme, …, `etats` - 1 = le plus agité ;
3. chaque soir, la probabilité de chaque régime vient de l'algorithme « forward » SEULEMENT : il n'utilise
   que les rendements connus ce soir-là (la méthode habituelle « forward-backward » lit toute la série, donc le futur) ;
4. filtre de stabilité : on ne change de régime que si le nouveau est le plus probable `stabilite` jours de suite ;
5. le facteur multiplie la note de tendance : `facteur_agite` dans le régime le plus agité, 1 sinon.

`python -m robot.regimes` affiche le régime du jour de chaque actif.
"""
import hashlib
from dataclasses import dataclass

import numpy as np
import pandas as pd

from robot.parametres import REGIMES

PLANCHER_ECART = 0.1      # l'agitation d'un régime ne descend jamais sous 10 % de celle de toute la fenêtre
ITERATIONS_MAX = 100
TOLERANCE = 1e-4          # arrêt de l'apprentissage quand la vraisemblance ne progresse presque plus
NOMS = {2: ["calme", "agité"], 3: ["calme", "normal", "agité"], 4: ["très calme", "calme", "normal", "agité"]}
_CACHE = {}               # probabilités déjà calculées (le même actif revient dans beaucoup de tests)


@dataclass
class Modele:
    depart: np.ndarray       # probabilité de chaque régime au premier jour de la fenêtre
    transitions: np.ndarray  # transitions[i, j] = probabilité de passer du régime i au régime j d'un jour à l'autre
    moyennes: np.ndarray     # rendement quotidien moyen de chaque régime
    ecarts: np.ndarray       # agitation quotidienne (écart-type) de chaque régime, dans l'ordre croissant


def rendements_log(prix):
    """Rendements quotidiens (logarithme du rapport de clôtures), connus le soir même."""
    return np.log(prix / prix.shift(1))


def _vraisemblances(r, moyennes, ecarts):
    """Densité de chaque rendement dans chaque régime, divisée par la plus grande de la ligne (pas de zéro
    par arrondi). Renvoie (densités, logarithme du facteur retiré à chaque ligne)."""
    log_b = -0.5 * ((r[:, None] - moyennes) / ecarts) ** 2 - np.log(ecarts * np.sqrt(2 * np.pi))
    maximum = log_b.max(axis=1, keepdims=True)
    return np.exp(log_b - maximum), maximum[:, 0]


def _avant(b, transitions, depart):
    """Algorithme « forward », jour après jour : probabilité de chaque régime chaque jour, sachant les jours
    passés seulement. C'est lui qui sert aux décisions. Renvoie (probabilités filtrées, facteurs de normalisation)."""
    n, k = b.shape
    alpha, c = np.empty((n, k)), np.empty(n)
    a = depart * b[0]
    for t in range(n):
        if t:
            a = (alpha[t - 1] @ transitions) * b[t]
        total = a.sum()
        if not total > 0:   # jour impossible d'après le modèle : on repart des seules densités du jour
            a, total = b[t].copy(), b[t].sum()
        alpha[t], c[t] = a / total, total
    return alpha, c


def _produits(M, sens):
    """Produits cumulés de matrices par doublement : log2(n) multiplications groupées au lieu d'une boucle
    de n jours (même résultat, plus rapide). sens=+1 : P[t] = M[0] @ … @ M[t] ; sens=-1 : P[t] = M[t] @ … @ M[-1].
    Chaque produit est ramené à un maximum de 1 ; le logarithme du facteur retiré est gardé dans `echelle`."""
    P, echelle, pas = M.copy(), np.zeros(len(M)), 1
    while pas < len(M):
        gauche, droite = slice(None, -pas), slice(pas, None)
        cible = droite if sens > 0 else gauche
        produit = P[gauche] @ P[droite]
        maximum = produit.max(axis=(1, 2))
        echelle[cible] = echelle[gauche] + echelle[droite] + np.log(maximum)
        P[cible] = produit / maximum[:, None, None]
        pas *= 2
    return P, echelle


def _avant_arriere(b, transitions, depart):
    """Pour l'APPRENTISSAGE seulement (sur la fenêtre passée) : probabilités « forward » et « backward »
    (cette dernière lit les jours suivants de la fenêtre), et log-vraisemblance (sans le décalage des densités)."""
    M = transitions[None] * b[1:, None, :]   # M[t - 1][i, j] : passer de i (jour t - 1) à j (jour t), densité du jour t
    a0 = depart * b[0]
    P, echelle = _produits(M, +1)
    alpha = np.vstack([a0, np.einsum("i,tij->tj", a0, P)])
    totaux = alpha.sum(axis=1)
    vraisemblance = np.log(totaux[-1]) + echelle[-1]
    S, _ = _produits(M, -1)
    beta = np.vstack([S.sum(axis=2), np.ones((1, len(depart)))])
    return alpha / totaux[:, None], beta / beta.sum(axis=1, keepdims=True), vraisemblance


def _normaliser(x, plancher=1e-12):
    """Probabilités jamais exactement nulles (sinon un régime ne pourrait plus jamais revenir), somme 1."""
    x = np.maximum(x, plancher)
    return x / x.sum(axis=-1, keepdims=True)


def apprendre(rendements, etats, iterations=ITERATIONS_MAX, tolerance=TOLERANCE):
    """Apprend un HMM gaussien sur une fenêtre de rendements (algorithme de Baum-Welch, départ fixe donc
    toujours le même résultat). Les régimes sont renvoyés rangés du plus calme au plus agité."""
    r = np.asarray(rendements, dtype=float)
    ecart_total = r.std()
    plancher = PLANCHER_ECART * ecart_total if ecart_total > 0 else 1e-8
    moyennes = np.full(etats, r.mean())
    ecarts = np.maximum(ecart_total * np.geomspace(0.5, 2.0, etats), plancher)
    transitions = np.full((etats, etats), 0.05 / (etats - 1))
    np.fill_diagonal(transitions, 0.95)
    depart = np.full(etats, 1 / etats)

    precedente = -np.inf
    for _ in range(iterations):
        b, decalage = _vraisemblances(r, moyennes, ecarts)
        alpha, beta, vraisemblance = _avant_arriere(b, transitions, depart)
        vraisemblance += decalage.sum()

        gamma = alpha * beta
        gamma /= gamma.sum(axis=1, keepdims=True)
        xi = alpha[:-1, :, None] * transitions[None] * (b[1:] * beta[1:])[:, None, :]
        xi = (xi / xi.sum(axis=(1, 2), keepdims=True)).sum(axis=0)
        poids = gamma.sum(axis=0)
        utiles = poids > 1e-8   # un régime qui n'est plus jamais visité garde ses anciennes valeurs

        depart = _normaliser(gamma[0])
        transitions = _normaliser(xi)
        moyennes = np.where(utiles, gamma.T @ r / np.where(utiles, poids, 1), moyennes)
        variances = (gamma * (r[:, None] - moyennes) ** 2).sum(axis=0) / np.where(utiles, poids, 1)
        ecarts = np.where(utiles, np.maximum(np.sqrt(variances), plancher), ecarts)

        if vraisemblance - precedente < tolerance:
            break
        precedente = vraisemblance

    ordre = np.argsort(ecarts, kind="stable")
    return Modele(depart[ordre], transitions[np.ix_(ordre, ordre)], moyennes[ordre], ecarts[ordre])


def filtrer(rendements, modele):
    """Probabilités de chaque régime chaque jour avec l'algorithme « forward » seulement (sans le futur)."""
    b, _ = _vraisemblances(np.asarray(rendements, dtype=float), modele.moyennes, modele.ecarts)
    return _avant(b, modele.transitions, modele.depart)[0]


def _probabilites_compactes(r, etats, fenetre, reapprentissage):
    """Sur une suite de rendements sans trou : apprentissage tous les `reapprentissage` jours sur les `fenetre`
    derniers rendements, puis filtrage jusqu'au prochain apprentissage. NaN avant le premier apprentissage."""
    n = len(r)
    probas = np.full((n, etats), np.nan)
    for jour in range(fenetre - 1, n, reapprentissage):
        debut, fin = jour - fenetre + 1, min(jour + reapprentissage, n)
        modele = apprendre(r[debut:jour + 1], etats)            # le jour même compris : connu à la clôture
        probas[jour:fin] = filtrer(r[debut:fin], modele)[jour - debut:]
    return probas


def probabilites_regimes(rendements, etats=REGIMES["etats"], fenetre=REGIMES["fenetre"],
                         reapprentissage=REGIMES["reapprentissage"]):
    """Probabilité de chaque régime chaque jour (une colonne par régime, du plus calme au plus agité)."""
    valides = rendements.dropna()
    r = valides.to_numpy(dtype=float)
    cle = (hashlib.sha1(r.tobytes()).hexdigest(), etats, fenetre, reapprentissage)
    if cle not in _CACHE:
        _CACHE[cle] = _probabilites_compactes(r, etats, fenetre, reapprentissage)
    probas = pd.DataFrame(_CACHE[cle], index=valides.index, columns=range(etats))
    return probas.reindex(rendements.index)


def regimes_retenus(probas, stabilite=REGIMES["stabilite"]):
    """Régime sur lequel le robot agit : il ne change que si le nouveau régime est le plus probable
    `stabilite` jours de suite. NaN tant qu'aucun régime n'a été confirmé."""
    valeurs = probas.to_numpy(dtype=float)
    retenus = np.full(len(valeurs), np.nan)
    courant, precedent, serie = np.nan, None, 0
    for t, ligne in enumerate(valeurs):
        if np.isnan(ligne).any():   # jour sans rendement (avant le premier apprentissage, ou trou de données)
            retenus[t] = courant
            continue
        plus_probable = int(ligne.argmax())
        serie = serie + 1 if plus_probable == precedent else 1
        precedent = plus_probable
        if serie >= stabilite:
            courant = plus_probable
        retenus[t] = courant
    return pd.Series(retenus, index=probas.index)


def facteur_regime(prix, etats=REGIMES["etats"], fenetre=REGIMES["fenetre"], reapprentissage=REGIMES["reapprentissage"],
                   stabilite=REGIMES["stabilite"], facteur_agite=REGIMES["facteur_agite"],
                   probabilites=REGIMES["probabilites"]):
    """Facteur appliqué chaque soir à la note de tendance d'un actif : `facteur_agite` en régime agité, 1 sinon
    (et 1 tant que le régime est inconnu). Version `probabilites` : 1 - (1 - facteur_agite) x P(agité)."""
    probas = probabilites_regimes(rendements_log(prix), etats, fenetre, reapprentissage)
    if probabilites:
        facteur = 1 - (1 - facteur_agite) * probas[etats - 1]
    else:
        facteur = regimes_retenus(probas, stabilite).eq(etats - 1).map({True: facteur_agite, False: 1.0})
    return facteur.fillna(1.0)


def facteurs_regime(clotures, **regime):
    return pd.DataFrame({symbole: facteur_regime(clotures[symbole], **regime) for symbole in clotures.columns})


def appliquer_regime(notes, clotures, regime=None):
    """Notes de tendance multipliées par le facteur de régime de chaque actif. `regime=None` : notes inchangées."""
    if regime is None:
        return notes
    return notes * facteurs_regime(clotures[notes.columns], **regime).reindex(notes.index).fillna(1.0)


def afficher(clotures, regime=REGIMES):
    date = clotures.index[-1].date()
    etats = regime["etats"]
    print(f"RÉGIMES DE MARCHÉ (EXP-009, modèle de Markov caché à {etats} régimes) au {date}\n")
    print(f"  {'Actif':<9} {'Régime':<11} " + " ".join(f"{nom:>11}" for nom in NOMS[etats]) + "   Facteur")
    for symbole in clotures.columns:
        probas = probabilites_regimes(rendements_log(clotures[symbole]), etats, regime["fenetre"], regime["reapprentissage"])
        retenu = regimes_retenus(probas, regime["stabilite"]).iloc[-1]
        nom = "inconnu" if np.isnan(retenu) else NOMS[etats][int(retenu)]
        facteur = facteur_regime(clotures[symbole], **regime).iloc[-1]
        colonnes = " ".join(f"{p:11.0%}" for p in probas.iloc[-1].fillna(0))
        print(f"  {symbole:<9} {nom:<11} {colonnes}   x{facteur:.2f}")


if __name__ == "__main__":
    from robot.donnees import charger

    afficher(charger().clotures)
