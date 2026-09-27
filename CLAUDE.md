# Instructions pour Claude — projet trading-bot

## L'utilisateur

- Débutant complet (programmation, trading, statistiques) : expliquer simplement, en français, en le tutoyant.
- Veut des réponses directes, structurées, orientées action. Pas de jargon inutile.
- **0 € d'outils et d'abonnements.** Capital réel envisagé plus tard : 2 000 à 10 000 €. Résident fiscal en France.
- Profil : pire chute acceptable **-35 %** (changé le 27/09/2026, avant : -25 %), objectif « se rapprocher de
  50 %/an » (irréaliste sans levier : lui rappeler honnêtement les ordres de grandeur). Toujours sans levier.
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
- **EXP-008 (cash rémunéré)** : `experience_008.py`. La v3 avec le cash placé au taux à 3 mois de la veille (`^IRX` - 0,15 %/an,
  `FONDS_MONETAIRE`, `rendement_monetaire`), frais ETF sur chaque variation du cash ; `strategie_v2(monetaire=...)`.
  Base à battre : v3, M1 à +0,2 point. Désactivé par défaut (`monetaire=None`).
- **EXP-009 (régimes de marché, idée d'une vidéo)** : `experience_009.py`, contre la v3. Un modèle de Markov caché
  gaussien par actif (`robot/regimes.py`, numpy seul) : 3 régimes rangés par agitation, appris sur 504 jours, réappris
  tous les 126 jours, algorithme « forward » seul pour décider (jamais le futur), confirmé après 3 jours ; note ÷ 2
  en régime agité (`REGIMES` ; `strategie_v2(regime=...)`). Désactivé par défaut (`regime=None`).
- **EXP-010 (v3 offensive)** : `experience_010.py`, contre la v3. Seule différence : `vol_cible=VOL_CIBLE_OFFENSIVE` (17 %).
  Seuils de chute décalés de 10 points (`SEUILS_CHUTE`), critère K1 krachs simulés (`critere_krachs`). Attention :
  la zone tampon s'élargit avec l'agitation visée (plafonds fixes) et peut freiner l'investissement.
- **EXP-011 (21 marchés)** : `experience_011.py`. La v3 sur `UNIVERS_ELARGI` (`AJOUTS_EXP_011` : QQQ, EWJ, TIP, LQD, USO,
  SLV, DBA, RWX, classe Devises UUP/FXE/FXY), contre la v3 sur ses 10 actifs (`lancer_experience(symboles=, base_symboles=)`).
  Le robot n'utilise toujours que `UNIVERS`.
- **EXP-012 (plafonds 40 %)** : `experience_012.py`. v3 offensive (17 %) + `PLAFONDS_RELEVES` (40 % par actif, crypto 15 %,
  total 100 %) ; `strategie_v2(plafonds=...)` passe jusqu'à `parts_cibles`, `simuler` et le multiplicateur. Critères d'EXP-010.
- **EXP-013 (double momentum, G. Antonacci 2014)** : `experience_013.py` + `robot/momentum.py` (`MOMENTUM`, `choix`,
  `cibles_depuis_choix`, `strategie_momentum`). Fin de mois : SPY bat le Trésor 12 mois (`^IRX` sans frais) → 100 % sur
  le plus fort de SPY/EFA, sinon 100 % AGG. Déroulé propre (pas `lancer_experience`), critères M/P/R/K1 avec limite -35 %.
  `krachs_au_hasard(strategie=...)` accepte une autre stratégie.
- `outils_experience.py` : déroulé commun des expériences (critères M1-M2, P1-P3, R1-R5, verdict ; base à battre
  réglable avec `base_reglage`, critères M propres avec `criteres_mieux`, seuils de chute `seuils_chute`,
  critères ajoutés `criteres_supplementaires`).
- **Veto final** : `controle_final` (`robot/decision.py`) revérifie le plan d'ordres avant l'envoi (plafonds, levier,
  découvert, arrêts) ; en cas d'anomalie, aucun ordre et alerte Telegram.
- **Krachs simulés** : `krachs_simules.py` (stress test de la v3, pour information) : krach d'une nuit sur chaque soir
  du backtest, et 3 krachs injectés au hasard (100 tirages). Krach type fixé d'après 1987 et mars 2020.
- **Page de suivi en direct** (dossier `suivi/`, Vercel, racine `suivi`) : `index.html` + `app.js` + `logique.js` (calculs,
  testés par `node --test tests/*.test.js`) + `api/` (fonctions Vercel : `compte`, `barres`, `config` ; connexion Supabase
  obligatoire + e-mail `ALLOWED_EMAIL` ; Alpaca **paper** écrit en dur). Chaque soir, `robot_v3.py` écrit son rapport
  dans la table Supabase `rapports` (`robot/suivi.py`, secrets `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, facultatifs).
  Installation : `docs/PAGE_DE_SUIVI.md`. Étape 1 (lecture seule) faite ; étape 2 (pause, tout vendre, ordres manuels) à venir.
- **Tableau de bord** : `tableau_de_bord.py` calcule backtest, jour par jour, Monte Carlo (2 000 avenirs de 10 ans,
  blocs d'un mois), expériences et graphe du cerveau, puis remplit `tableau/modele.html` (d3 via cdnjs).
  GitHub Actions l'envoie comme fichier `tableau-de-bord`. Le résumé `JOURNAL` est à mettre à jour après chaque expérience.
- **Testeur visuel** : `python rejeu.py` (sur l'ordinateur de l'utilisateur, où Yahoo marche) rejoue le backtest
  jour par jour dans le navigateur (`tableau/modele_rejeu.html`, serveur local port 8765) avec journal des ordres,
  positions, et rapport façon MetaTrader (`robot/rapport.py` ; simulation `details=True`). Options `--capital`, `--version`.
- **TradingView** : `tradingview/tendance_v2.pine` (Pine Script v5) affiche la note de tendance de la v2 ; `tradingview/strategie_h1.pine` rejoue EXP-007 dans le testeur de stratégie (pour voir les trades) ;
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

## État du projet (26/09/2026)

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
  branchée au robot en argent fictif (PR #4 fusionnée, premiers ordres le 25/09/2026).
- **EXP-007** (croisement EMA 20/50 en H1, filtre weekly 10/40, stop 2 ATR, suiveur 3 ATR, idée de l'utilisateur) :
  **0/10, échec net.** Sur 2016-2026 : +5,0 %/an, chute -26 % contre +10,6 % et -11,7 % pour la v3. 33 % de gagnants,
  facteur de profit 0,74, frais 2,1 %/an, et des entrées au hasard font mieux dans 72 % des cas (R5). Code gardé, non branché.
- Toujours proposé : moteur de décision, apprentissage walk-forward.
- Fait (26/09) : le robot n'achète qu'avec le cash déjà là (`compter_ventes=False`, `min(cash, buying_power)`) ;
  les achats financés par des ventes d'ETF sont reportés au lendemain et signalés sur Telegram.
- **EXP-008** (v3 + cash placé au taux à 3 mois) : **8/10, non validée.** +7,9 %/an (+0,14 point, minimum 0,2),
  chute -10,5 %, note 0,75 ; frais x3 : perte 1,59 point (R3 ❌). Les frais du fonds (cash qui bouge à chaque
  rééquilibrage) mangent les deux tiers des intérêts. Code gardé, désactivé.
- Proposé à l'utilisateur : moteur court terme « Rebond » (RSI 2 de Connors) à côté de la v3 (prochain numéro libre).
- **EXP-010** (v3 offensive : agitation visée 17 % au lieu de 12 %, même proportion que 12/25 pour la nouvelle limite
  de -35 %) : **10/11, non validée.** +8,3 %/an (+0,5 point, M1 exigeait +1,5), chute -12,4 %, krachs OK (pire nuit
  -27,2 %). Agitation réalisée 8,7 % seulement : les plafonds (100 % investi, 25 %/actif, 15 % crypto) freinent, pas
  l'agitation visée. Piste suivante possible : changer les plafonds (à décider avec l'utilisateur, biais crypto).
- **EXP-009** (v3 + régimes de marché HMM, idée d'une vidéo YouTube de la boîte à idées ; d'abord numérotée EXP-007,
  renumérotée sans changer les critères) : **9/10, non validée.** +7,8 %/an comme la v3, mais chute -12,7 % et note
  0,62 (M1 exigeait +10 %, soit 0,73). Le HMM redit ce que mesure déjà l'agitation de la v3. Code gardé, désactivé.
- Fait (26/09, vidéo) : veto final des ordres (`controle_final`) et krachs simulés (`krachs_simules.py`).
  **Krachs simulés (à signaler avant le réel)** : krach type 1987 (actions -20 %, crypto -40 %) le pire soir →
  chute totale -26,1 % ; 3 krachs au hasard en 20 ans → médiane -17 %, au-delà de -25 % dans 5 % des 100 essais.
  L'arrêt à -25 % ne protège pas d'un krach survenu pendant la nuit.

- **EXP-011** (v3 sur 21 marchés) : **7/10, échec net.** +6,1 %/an, chute -13,2 %, 85 % investi, 924 ordres/an ;
  sans crypto +4,5 % (R4 ❌). Plus actif mais moins rentable.
- **EXP-012** (v3 offensive 17 % + plafond 40 %/actif) : **10/11, non validée.** +8,3 %/an (M1 exigeait +9,3), chute
  -15,5 %, krach d'une nuit -30,1 %. Plafond 50 % : +8,3 %, -17,7 %. Le frein est la stratégie, pas les plafonds.
- L'utilisateur juge la v3 « mauvaise et trop sécuritaire ». Proposé : EXP-013, double momentum d'Antonacci
  (100 % sur le marché le plus fort sur 12 mois, sinon obligations), à tester contre la v3 avec la limite -35 %.

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
