# Instructions pour Claude — projet trading-bot

## L'utilisateur

- Débutant complet (programmation, trading, statistiques) : expliquer simplement, en français, en le tutoyant.
- Veut des réponses directes, structurées, orientées action. Pas de jargon inutile.
- **0 € d'outils et d'abonnements.** Capital réel envisagé plus tard : 2 000 à 10 000 €. Résident fiscal en France.
- Profil : pire chute acceptable **-25 %**, objectif « très bon rendement avec risque limité ».
- Robot autonome, une décision par jour, pas de pari à la baisse, pas de levier.
- Ne jamais promettre de gains. Signaler immédiatement tout biais statistique ou technique.

## Méthode de travail (obligatoire)

- Chaque changement de stratégie est une **expérience** dans `EXPERIENCES.md` : hypothèse et critères
  écrits **avant** de coder et de tester, envoyés sur GitHub avant les résultats. Ne jamais modifier
  les critères après avoir vu les résultats. Noter aussi les échecs.
- Pas d'optimisation sur les données : paramètres a priori (littérature, R. Carver) ou fixés à l'avance.
- Jamais de triche avec le futur : décision à la clôture, exécution à l'ouverture suivante.
- Tout nouveau code a ses tests (`python -m pytest`). Vérifier que les tests attrapent vraiment les
  erreurs en réintroduisant volontairement des bugs.
- Avancer étape par étape, expliquer ce qui a été fait et ce que montrent les résultats.
- **Cerveau** : au début de chaque session, lire `cerveau/Boîte à idées.md` (l'utilisateur y écrit depuis
  Obsidian) et y répondre. Après chaque expérience, mettre à jour les notes de `cerveau/`.

## Architecture

- **v3, en service** (paper trading Alpaca) : `robot_v3.py` (connexion, ordres) + `robot/decision.py` (décision,
  sécurités -20 %/-25 %, plan d'ordres sans levier, message Telegram expliqué). Lancée par
  `.github/workflows/trading_v3.yml` chaque soir de semaine à 22h40 UTC (branche par défaut uniquement).
  Sommet du compte compté depuis `ROBOT_V3_DEPART` (variable GitHub, défaut 2026-09-28).
- **v1, arrêtée** : `bot.py`, `strategie.py`… `trading.yml` n'est plus lancé automatiquement (manuel seulement).
- **v2, en recherche** (pas encore branchée au robot) : dossier `robot/` (`parametres.py`, `univers.py`,
  `donnees.py`, `signaux.py`, `portefeuille.py`, `simulation.py`), `backtest_v2.py`, `robustesse_v2.py`.
  Spécification complète : `docs/STRATEGIE_V2.md`.
- **EXP-003 (cassures)** : `experience_003.py` teste la v2 + 3 détecteurs de cassure (`CASSURES` dans
  `robot/parametres.py`, `note_cassure` dans `robot/signaux.py`). La v2 est inchangée par défaut (`cassures=()`).
- **EXP-004 (retour à la moyenne)** : `experience_004.py` mélange à 50/50 la tendance et RSI 14 + Bollinger 20
  (`RETOUR_MOYENNE`, `POIDS_RETOUR_MOYENNE` ; `note_rsi`, `note_bollinger`). Désactivé par défaut (`retour=()`).
- **EXP-005 (budget de risque)** : `experience_005.py`. Multiplicateur = 12 % ÷ agitation réalisée de la v2 normale
  sur 2 ans, borné [1 ; 2,5], appliqué avant les garde-fous (`BUDGET_RISQUE`, `multiplicateur_risque`,
  `cibles_strategie` ; `strategie_v2(budget=...)`). Désactivé par défaut (`budget=None`).
- **EXP-006 (zone tampon)** : `experience_006.py`. EXP-005 + zone tampon de Carver (±10 % de la position normale,
  on ne va qu'au bord) : `TAMPON`, `tampon_rapide`, `parts_normales` ; `strategie_v2(tampon=...)`.
- **EXP-007 (H1 filtrée weekly, idée de l'utilisateur)** : `experience_007.py` + `robot/h1.py` (bougies H1 Alpaca,
  croisement EMA 20/50, filtre 10/40 semaines, stop 2 ATR, suiveur 3 ATR, risque 0,5 %/trade). Base à battre : v3.
- `outils_experience.py` : déroulé commun des expériences (critères M1-M2, P1-P3, R1-R5, verdict).
- **Tableau de bord** : `tableau_de_bord.py` calcule backtest, jour par jour, Monte Carlo (2 000 avenirs de 10 ans,
  blocs d'un mois), expériences et graphe du cerveau, puis remplit `tableau/modele.html` (d3 via cdnjs).
  GitHub Actions l'envoie comme fichier `tableau-de-bord`. Le résumé `JOURNAL` est à mettre à jour après chaque expérience.
- **Testeur visuel** : `python rejeu.py` (sur l'ordinateur de l'utilisateur, où Yahoo marche) rejoue le backtest
  jour par jour dans le navigateur (`tableau/modele_rejeu.html`, serveur local port 8765) avec journal des ordres,
  positions, et rapport façon MetaTrader (`robot/rapport.py` ; simulation `details=True`). Options `--capital`, `--version`.
- **TradingView** : `tradingview/tendance_v2.pine` (Pine Script v5) affiche la note de tendance de la v2 ;
  `tests/test_tradingview.py` vérifie que ses réglages et sa formule suivent `robot/signaux.py`.
- **Cerveau** : dossier `cerveau/` (notes Obsidian reliées par [[liens]] : Expériences, Concepts, Leçons).
  À compléter après chaque expérience ; aucun lien cassé ni note isolée (vérifié par les tests).
- `.github/workflows/verifications.yml` : à chaque envoi de code, tests, backtests et tests anti-chance
  sur les vraies données Yahoo.

## Environnement

- **Yahoo Finance est bloqué dans l'environnement cloud de Claude.** Les vrais résultats se lisent dans
  les journaux GitHub Actions (workflow « Tests et backtest »). En local, tester avec de fausses données.
- Secrets GitHub : `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
  Jamais de clé dans le code.
- La fusion des pull requests est faite par l'utilisateur.

## État du projet (25/09/2026)

- **EXP-001** (v1, moyenne 200 jours sur SPY) : 4/5, non jugée solide (trop dépendante du réglage).
- **EXP-002** (v2, tendance multi-actifs pilotée par le risque) : **7/8, non validée.**
  - Réussi : +6,3 %/an, pire chute -10 % (2007-2026), stable sur tous les réglages et périodes, frais x3
    supportés, meilleure que 100 % des versions au hasard.
  - Échoué : R4, sans la crypto, +4,4 %/an pour un minimum fixé à 5 %.
  - Diagnostic : robot trop prudent (investi à 66 % en moyenne, agitation 7 % pour 12 % visés,
    pire chute -10 % pour -25 % acceptés).
- **EXP-003** (v2 + cassures de Donchian) : **8/10, échec.** Rendement -0,04 point (M1 ❌), sans crypto
  +4,3 %/an (R4 ❌). Cassures liées à 0,90 aux moyennes : elles n'apportent rien. Code gardé, désactivé.
- **EXP-004** (v2 + retour à la moyenne, RSI 14 et Bollinger 20, mélange 50/50) : **1/10, échec net.**
  +1,0 %/an, investi à 36 %, frais 1,86 %/an. Seul, le retour à la moyenne perd 1,9 %/an. Code gardé, désactivé.
- **EXP-005** (v2 + budget de risque) : **9/10, non validée à un cheveu.** +7,8 %/an, chute -12,6 %,
  R4 enfin réussi (+5,2 % sans crypto) ; R3 échoue (frais x3 : perte 1,50 point pour < 1,5). Piste la plus prometteuse.
- **EXP-006** (EXP-005 + zone tampon de Carver) : **10/10, validée.** +7,8 %/an, chute -11,7 %, note 0,67,
  frais 0,48 %/an, +5,1 % sans crypto, frais x3 OK. Prudence : 6e expérience sur le même passé.
- **La v3 = v2 + `budget=BUDGET_RISQUE` + `tampon=TAMPON` est la nouvelle base à battre.** Prochaine étape :
  la brancher au robot en argent fictif. Proposé à l'utilisateur : EXP-007 moteur de décision, EXP-008 apprentissage walk-forward.

## Prochaines étapes (choisies par l'utilisateur)

1. ~~EXP-003 : cassures~~ : fait, échec (voir ci-dessus).
2. ~~EXP-004 : retour à la moyenne~~ : fait, échec net (voir ci-dessus).
3. **EXP-005 : filtre de panique** (VIX).
4. ~~EXP-005 : budget de risque~~ : 9/10. Suite proposée : réduire les frais en gardant le multiplicateur.
5. Proposé : rémunérer le cash non investi (fonds monétaire) dans la simulation, pour toutes les versions.

Chaque expérience doit faire mieux que la v2 **et** réussir les critères P1 à P3 et R1 à R5
(mêmes seuils que EXP-002).

Ensuite :
- étape 7 : brancher la meilleure version au robot (ordres multi-actifs, fractions de parts, crypto sur
  Alpaca), avec les sécurités de la v1 ;
- paper trading d'au moins 1 mois sans incident ;
- réel avec une petite somme : Interactive Brokers avec des ETF européens (UCITS), crypto sur une
  plateforme agréée MiCA.

## Points ouverts

- Modéliser les frais réels (commission minimale Interactive Brokers) avant tout passage au réel.
- Avertissement GitHub « Node.js 20 deprecated » sur `actions/checkout@v4` et `actions/setup-python@v5`
  (sans impact pour l'instant).
