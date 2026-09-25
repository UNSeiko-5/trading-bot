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

## Architecture

- **v1, en service** (paper trading Alpaca) : `bot.py`, `strategie.py`, `connexion.py`, `backtest.py`,
  `robustesse.py`. Lancée par `.github/workflows/trading.yml` chaque soir à 22h30 UTC.
- **v2, en recherche** (pas encore branchée au robot) : dossier `robot/` (`parametres.py`, `univers.py`,
  `donnees.py`, `signaux.py`, `portefeuille.py`, `simulation.py`), `backtest_v2.py`, `robustesse_v2.py`.
  Spécification complète : `docs/STRATEGIE_V2.md`.
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
- **La v2 est la base à battre.**

## Prochaines étapes (choisies par l'utilisateur)

1. **EXP-003 : cassures** (canal de Donchian), ajoutées comme famille de signaux dans la note combinée.
2. **EXP-004 : retour à la moyenne** (RSI, Bollinger).
3. **EXP-005 : filtre de panique** (VIX).
4. Proposé : rémunérer le cash non investi (fonds monétaire) dans la simulation, pour toutes les versions.

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
