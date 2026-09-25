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
