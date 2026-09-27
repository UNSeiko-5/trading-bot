"""Toutes les valeurs de la stratégie v2, à un seul endroit (docs/STRATEGIE_V2.md).

Ne pas modifier sans ouvrir une nouvelle expérience dans EXPERIENCES.md.
"""

# --- Signaux de tendance (section 4) -------------------------------------------------
# (moyenne rapide, moyenne lente, facteur d'échelle publié par R. Carver)
DETECTEURS = [(16, 64, 3.75), (32, 128, 2.65), (64, 256, 1.87)]
NOTE_MAX = 20

# --- Cassures (EXP-003, en test : la v2 n'en utilise pas) -------------------------------------
# (durée du canal de Donchian en jours, facteur d'échelle publié par R. Carver dans pysystemtrade)
CASSURES = [(40, 0.70), (80, 0.73), (160, 0.74)]

# --- Retour à la moyenne (EXP-004, en test : la v2 n'en utilise pas) ---------------------------
# (indicateur, durée en jours) : réglages classiques des auteurs (J. W. Wilder 1978, J. Bollinger)
RETOUR_MOYENNE = [("RSI", 14), ("Bollinger", 20)]
POIDS_RETOUR_MOYENNE = 0.5    # part de la note combinée donnée au retour à la moyenne

# --- Budget de risque (EXP-005, en test : la v2 n'en utilise pas) ------------------------------
# Multiplicateur = agitation visée ÷ agitation réalisée de la v2 normale sur `fenetre` jours, borné.
# Fenêtre et borne haute reprises du bonus de diversification (IDM) ; 1 an d'historique minimum.
BUDGET_RISQUE = {"fenetre": 504, "borne_basse": 1.0, "borne_haute": 2.5, "historique_min": 252}

# --- Zone tampon (EXP-006, en test) : demi-largeur = 10 % de la position « normale » (R. Carver) ---
TAMPON = 0.10

# --- Régimes de marché (EXP-009, en test : la v3 n'en utilise pas) -----------------------------
# Modèle de Markov caché par actif (idée de la vidéo de la boîte à idées), réglages fixés avant les tests :
# 3 régimes, apprentissage sur 2 ans refait tous les 6 mois, régime confirmé après 3 jours, position ÷ 2 si agité.
REGIMES = {"etats": 3, "fenetre": 504, "reapprentissage": 126, "stabilite": 3, "facteur_agite": 0.5,
           "probabilites": False}

# --- Taille des positions (section 5) ------------------------------------------------
VOL_CIBLE = 0.12              # agitation annuelle visée pour tout le portefeuille
VOL_CIBLE_OFFENSIVE = 0.17    # EXP-010, en test : 12 % x 35/25 pour la limite de -35 % (arrondi)
FENETRE_VOL = 35              # jours (moyenne exponentielle) pour mesurer l'agitation
JOURS_PAR_AN = 252
FENETRE_CORRELATION = 504     # 2 ans de bourse pour le bonus de diversification (IDM)
IDM_MIN, IDM_MAX = 1.0, 2.5

# --- Garde-fous de la stratégie (section 6) -----------------------------------------
PART_MAX_ACTIF = 0.25
PART_MAX_CRYPTO = 0.15
EXPOSITION_MAX = 1.0          # pas de levier
# EXP-012, en test : plafond par actif relevé à 40 % (au moins 3 actifs pour être investi à 100 %),
# crypto et total inchangés
PLAFONDS_RELEVES = {"part_max": 0.40, "crypto_max": 0.15, "exposition_max": 1.0}
SEUIL_TRANSACTION = 0.02      # on ne bouge une position que si l'écart dépasse 2 % du capital

# --- Garde-fous du robot uniquement (section 6) --------------------------------------
ALERTE_PERTE_JOUR = 0.05
ARRET_ACHATS_CHUTE = 0.20
ARRET_TOTAL_CHUTE = 0.25

# --- Exécution et coûts (section 7) --------------------------------------------------
FRAIS = {"ETF": 0.0010, "crypto": 0.0050}   # par transaction, en part du montant échangé

# --- Données (sections 3 et 8) -------------------------------------------------------
JOURS_MIN_HISTORIQUE = 300    # un actif n'est utilisé qu'après 300 jours de données
DEBUT_BACKTEST = "2007-01-01"

# EXP-008 : le cash rapporte le taux des bons du Trésor à 3 mois (connu la veille), moins les frais d'un fonds
FONDS_MONETAIRE = {"symbole": "^IRX", "frais_annuels": 0.0015}
