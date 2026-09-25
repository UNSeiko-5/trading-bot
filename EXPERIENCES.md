# Journal des expériences

Chaque changement de stratégie est une expérience :

1. On écrit l'**hypothèse** et les **critères de réussite AVANT** de lancer les tests.
2. On lance les tests.
3. On note les résultats et la conclusion, **y compris les échecs**.

On ne modifie jamais les critères après avoir vu les résultats.

---

## EXP-001 — Règle des 200 jours sur SPY (version 1)

**Date :** 25/09/2026

**Règle testée :** investi (95 % du capital) quand SPY clôture au-dessus de sa moyenne
des 200 derniers jours, en cash sinon. Ordre exécuté à l'ouverture du lendemain,
frais de 0,05 % par ordre.

**Déjà connu avant ce test :** le backtest principal sur SPY (1993-2026) donne
+8,1 %/an et une pire chute de -28,6 %, contre +10,9 %/an et -55,2 % pour
« acheter et garder ». Les tests ci-dessous portent sur tout ce qu'on n'a **pas** encore vu.

**Hypothèse :** la règle réduit fortement les grosses chutes, au prix d'un rendement
un peu plus faible, et ce résultat n'est pas un coup de chance.

**Critère principal** (utilisé dans plusieurs tests) : la stratégie gagne de l'argent
(rendement annuel positif) **et** sa pire chute est au moins **1/3 plus petite** que
celle d'« acheter et garder ».

**Critères de réussite (fixés avant les tests) :**

| # | Test | Réussi si… |
|---|---|---|
| 1 | Autres réglages : 150, 180, 220, 250 jours | Les 5 réglages remplissent le critère principal, et leur rendement annuel reste à ±1,5 point de celui du réglage 200 jours |
| 2 | Sous-périodes : 1993-2007, 2008-2015, 2016-2026 | Rendement positif dans les 3 périodes, et critère principal rempli dans au moins 2 sur 3 |
| 3 | Frais multipliés par 3 (0,15 % par ordre) | Rendement annuel toujours positif, et perte de moins de 1 point par an |
| 4 | Autres marchés jamais utilisés : QQQ, IWM, EFA, EEM | Critère principal rempli sur au moins 3 marchés sur 4 |
| 5 | Hasard : mêmes entrées et sorties, décalées au hasard dans le temps (500 tirages) | La vraie pire chute est meilleure que celle d'au moins 95 % des versions au hasard |

**Verdict prévu :** la règle est jugée solide seulement si les 5 tests sont réussis.

**Résultats** (lancement GitHub du 25/09/2026, `python robustesse.py`, données Yahoo) :

| # | Test | Résultat | Verdict |
|---|---|---|---|
| 1 | Autres réglages | 180, 200, 220, 250 jours : réussis. **150 jours : pire chute -38,9 %**, alors que le seuil était -36,8 % (réduction de 30 % au lieu de 33 %) | ❌ |
| 2 | Sous-périodes | 1993-2007 : +7,3 %/an, chute -28,6 % (acheter et garder : +10,3 %, -47,5 %)<br>2008-2015 : +5,8 %/an, -24,4 % (+6,5 %, -51,9 %)<br>2016-2026 : +10,8 %/an, -19,5 % (+15,0 %, -33,7 %) | ✅ |
| 3 | Frais x3 | +7,4 %/an au lieu de +8,1 % (perte de 0,71 point) | ✅ |
| 4 | Autres marchés | QQQ : chute -54 % contre -83 %. IWM : -35 % contre -59 %. EFA : -25 % contre -61 %. EEM : -39 % contre -66 % | ✅ 4/4 |
| 5 | Hasard | Pire chute meilleure que **100 %** des 500 versions au hasard. Rendement meilleur que 62 % seulement | ✅ |

**Conclusion :**

- **Verdict officiel : 4/5, la règle n'est PAS jugée solide** selon les critères fixés à l'avance.
  L'échec est de peu, mais on ne modifie pas les critères après coup.
- **La protection contre les krachs est réelle.** Elle fonctionne sur les 3 périodes, sur
  4 marchés jamais utilisés, et aucune des 500 versions au hasard n'a fait aussi bien.
- **Le rendement, lui, n'a rien d'exceptionnel.** Il est inférieur à « acheter et garder »
  partout sauf sur EFA, et il ne fait pas nettement mieux que le hasard (62 %).
- **Point faible : le résultat dépend du réglage.** La pire chute va de -25 % (220 jours)
  à -39 % (150 jours). Le choix de « 200 » a donc aidé, en partie par chance.

**Décision :** la version 1 continue en paper trading (argent fictif), mais elle n'est pas
validée pour de l'argent réel. La prochaine expérience découle directement de l'échec :
**EXP-002, combiner plusieurs réglages** (par exemple 150, 200 et 250 jours) au lieu d'un
seul, pour ne plus dépendre d'un chiffre choisi.

---

## EXP-002 — Stratégie v2 : suivi de tendance multi-actifs piloté par le risque

**Date :** 25/09/2026

**Règle testée :** voir la spécification complète dans `docs/STRATEGIE_V2.md`.
En résumé : 10 actifs dans 6 classes, 3 détecteurs de tendance par actif, taille des positions
selon le risque, agitation visée de 12 % par an, pas de levier, pas de pari à la baisse.

**Pourquoi cette expérience :** EXP-001 a montré que la protection contre les krachs par la
tendance est réelle, mais que le résultat dépendait trop d'un seul réglage et d'un seul marché.
La v2 combine plusieurs réglages et plusieurs marchés.

**Hypothèse :** sur 2007-2026, frais compris, la v2 offre un bon rendement avec une pire chute
nettement plus faible que la bourse, et elle est mieux payée pour son risque que tous les
points de comparaison, y compris sans la crypto.

**Période de test :** de 2007 à aujourd'hui (tous les actifs, sauf la crypto, existent depuis
2006). Aucun paramètre n'est ajusté sur ces données : ils viennent de la littérature ou sont
fixés a priori.

**Critères de réussite (fixés avant les tests) :**

*Performance (backtest complet, frais compris) :*

| # | Réussi si… |
|---|---|
| P1 | Pire chute meilleure que **-20 %** (marge de sécurité sous ta limite de -25 %) |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque (rendement annuel ÷ pire chute) meilleure que les 4 points de comparaison : acheter et garder SPY, 60/40, v1, et le même panier toujours investi |

*Robustesse :*

| # | Test | Réussi si… |
|---|---|---|
| R1 | Autres réglages : un seul détecteur (rapide, puis lent) ; toutes les moyennes x1,5 ; agitation visée de 10 % et de 14 % ; seuil de transaction de 1 % et de 4 % | Chaque variante garde un rendement d'au moins 4 %, une pire chute meilleure que -25 %, et une note rendement/risque à ±30 % de la version de base |
| R2 | Sous-périodes : 2007-2012, 2013-2019, 2020-2026 | Rendement positif dans les 3, et note rendement/risque meilleure que le 60/40 dans au moins 2 sur 3 |
| R3 | Frais multipliés par 3 | Perte de moins de 1,5 point de rendement par an, et pire chute toujours meilleure que -20 % |
| R4 | Sans la crypto | Pire chute meilleure que -20 %, rendement d'au moins 5 %, et note rendement/risque meilleure que le 60/40 |
| R5 | Hasard : signaux de chaque actif décalés au hasard dans le temps (500 tirages) | Note rendement/risque meilleure qu'au moins 95 % des versions au hasard |

**Verdict prévu :** la v2 remplace la v1 seulement si **tous** les critères (P1 à P3, R1 à R5)
sont remplis. Sinon, on documente ce qui échoue et on corrige par une nouvelle expérience.

**Résultats — performance (étape 5)** (lancement GitHub du 25/09/2026, `python backtest_v2.py`,
données `94e466b5440e`, du 03/01/2007 au 25/09/2026, soit 19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Agitation | Sharpe |
|---|---|---|---|---|---|
| **Stratégie v2** | **+6,3 %** | **-10,0 %** | **0,63** | 7,0 % | 0,90 |
| Acheter et garder SPY | +11,0 % | -55,2 % | 0,20 | 19,6 % | 0,63 |
| 60/40 (SPY/IEF) | +8,2 % | -32,2 % | 0,26 | 11,0 % | 0,77 |
| v1 (200 jours sur SPY) | +7,9 % | -24,4 % | 0,32 | 11,8 % | 0,70 |
| Même panier sans signaux | +7,6 % | -20,0 % | 0,38 | 8,6 % | 0,89 |

v2 investie en moyenne à 66 %, montant échangé de 585 % du capital par an, frais de 0,65 % par an.
Années clés : 2008 +7,2 % (SPY -36,8 %) · 2022 -1,6 % (SPY -18,2 %, 60/40 -16,6 %) ·
2013 +1,0 % (SPY +32,3 %) · 2023 -2,1 % (SPY +26,2 %).

- P1 ✅ pire chute -10,0 % (seuil -20 %)
- P2 ✅ +6,3 % par an (seuil 6 %, réussi de justesse)
- P3 ✅ note rendement/risque 0,63, meilleure que les 4 références

**Résultats — robustesse (étape 6)** (lancement GitHub du 25/09/2026, `python robustesse_v2.py`,
données `cd4b24362ef5`) :

| # | Test | Résultat | Verdict |
|---|---|---|---|
| R1 | Autres réglages (7 variantes) | Toutes entre +5,8 % et +6,9 %/an, chutes entre -8,5 % et -11,1 %, note R/R à 13 % au plus de la base | ✅ |
| R2 | Sous-périodes | 2007-2012 : +5,8 %/an, note 0,75 (60/40 : 0,16) · 2013-2019 : +6,2 %/an, note 0,70 (60/40 : **0,91**) · 2020-2026 : +6,5 %/an, note 0,65 (60/40 : 0,43). Positive partout, meilleure que le 60/40 sur 2 périodes sur 3 | ✅ |
| R3 | Frais x3 | +4,9 %/an (perte de 1,34 point), chute -11,0 % | ✅ |
| R4 | Sans la crypto | +4,4 %/an (**minimum fixé : 5 %**), chute -10,3 %, note R/R 0,43 (60/40 : 0,26) | ❌ |
| R5 | Hasard (500 tirages) | Note R/R meilleure que **100 %** des versions au hasard (médiane du hasard : 0,23) | ✅ |

Remarque technique : ces lancements incluaient la séance du jour encore en cours (d'où une
empreinte de données différente d'un lancement à l'autre). L'effet sur les résultats est
négligeable (1 jour sur près de 5 000). Le chargement des données exclut désormais la séance
en cours.

**Conclusion :**

- **Verdict officiel : 7/8, la v2 n'est PAS validée.** Seul R4 échoue : sans la crypto, le
  rendement tombe à +4,4 % par an, sous le minimum de 5 % fixé à l'avance.
- **La maîtrise du risque est excellente et solide.** Pire chute d'environ -10 % dans toutes les
  variantes, toutes les périodes et même sans crypto. Les signaux font mieux que 100 % des
  versions au hasard : le timing est réel, pas de la chance.
- **Le point faible, c'est le rendement.** Environ 1,9 point par an sur les 6,3 % vient de la
  crypto, c'est-à-dire en partie du boom 2015-2021, qui ne se reproduira pas forcément. Le
  rendement réaliste à attendre de la v2 est plutôt de 4,5 à 6 % par an.
- **Diagnostic :** le robot sous-utilise son budget de risque. Il n'est investi qu'à 66 % en
  moyenne, avec 7 % d'agitation (12 % visés), pour une pire chute de -10 % alors que la limite
  acceptée est de -25 %.

**Décision :** la v1 continue de tourner en paper trading. La v2 reste la meilleure base connue.
Les prochaines expériences visent le rendement sans dégrader le risque. Chacune est comparée
à la v2 et doit réussir les mêmes critères (P1 à P3, R1 à R5).
