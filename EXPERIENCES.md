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

---

## EXP-003 — Ajout des cassures (canal de Donchian) à la note combinée

**Date :** 25/09/2026

**Pourquoi cette expérience :** EXP-002 a montré que la v2 maîtrise très bien le risque, mais
qu'elle rapporte trop peu : +4,4 % par an sans la crypto (R4 échoué). Les cassures sont la
deuxième grande famille de signaux de tendance des fonds systématiques (les « Tortues »,
R. Carver). Idée : repérer les tendances de deux façons différentes rend la note combinée plus
fiable, donc devrait améliorer le rendement pour le même risque.

**Règle testée :** la v2 à l'identique (`docs/STRATEGIE_V2.md`), avec **une seule différence** :
la note combinée fait la moyenne de **6 détecteurs** au lieu de 3 : les 3 moyennes de la v2,
plus 3 détecteurs de cassure.

Détecteur de cassure sur N jours (règle « breakout » publiée par R. Carver, code public
pysystemtrade, `systems/provided/rules/breakout.py`) :

1. Canal de Donchian : plus haut et plus bas des clôtures des N derniers jours (jour même compris).
2. Position du prix dans le canal : `40 × (prix − milieu du canal) ÷ (haut − bas)`.
   Cela donne -20 en bas du canal, 0 au milieu, +20 tout en haut (au moment d'une cassure).
3. Lissage : moyenne exponentielle sur N/4 jours, pour éviter les allers-retours.
4. Multiplication par le facteur d'échelle publié, pour que la note moyenne vaille environ 10.
5. Note bornée entre -20 et +20, comme les autres détecteurs.

| Détecteur | Durée du canal | Lissage | Facteur d'échelle | Horizon |
|---|---|---|---|---|
| Cassure courte | 40 jours | 10 jours | 0,70 | environ 2 mois |
| Cassure moyenne | 80 jours | 20 jours | 0,73 | environ 4 mois |
| Cassure longue | 160 jours | 40 jours | 0,74 | environ 8 mois |

Les facteurs sont ceux de R. Carver (pysystemtrade, `systems/provided/rob_system/config.yaml` :
0,704 ; 0,726 ; 0,739), **pas ajustés sur nos données**. Les durées sont choisies a priori pour
couvrir les mêmes horizons que les 3 moyennes de la v2.

**Note combinée** = moyenne des 6 notes (donc moitié moyennes, moitié cassures), puis bornée
entre 0 et 20. **Tout le reste est inchangé** : panier, budgets de risque, agitation visée de 12 %,
IDM, garde-fous, seuil de transaction, frais, exécution à l'ouverture suivante, période 2007-2026.

À savoir : une note de cassure ne dépasse jamais environ 14,8 (20 × 0,74), alors qu'une note de
moyenne peut monter à 20. C'est la conception de Carver, on ne la corrige pas.

**Ce qu'on attend honnêtement (écrit avant les tests) :** cassures et moyennes mesurent la même
chose (« le prix monte-t-il ? ») et sont très liées. Dans la littérature, ajouter des cassures
rend le résultat un peu plus régulier, mais augmente rarement beaucoup le rendement. Surtout,
cette expérience ne touche pas au problème principal trouvé par EXP-002 (robot investi à 66 %
seulement). **Un gain faible ou nul est le résultat le plus probable.** On teste quand même :
c'est peu coûteux, et un échec évite d'ajouter de la complexité inutile au robot.

**Hypothèse :** ajouter les cassures augmente le rendement de la v2 d'au moins 0,5 point par an
sans dégrader sa note rendement/risque, et la nouvelle version réussit tous les critères
d'EXP-002, y compris R4 (sans la crypto), que la v2 ratait.

**Critères de réussite (fixés avant les tests) :**

*Mieux que la v2 (nouveau) — comparaison dans le même lancement, sur les mêmes données :*

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,5 point** à celui de la v2 |
| M2 | Note rendement/risque **au moins égale** à celle de la v2 |

Pourquoi 0,5 point : 3 détecteurs de plus rendent le robot plus compliqué. En dessous d'un
demi-point par an, le gain est trop petit pour être distingué du bruit et ne justifie pas
cette complexité.

*Performance — identiques à EXP-002 :*

| # | Réussi si… |
|---|---|
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison : acheter et garder SPY, 60/40, v1, et le même panier toujours investi |

*Robustesse — mêmes seuils que EXP-002. Seules les variantes de R1 changent, pour tester aussi
les réglages des cassures :*

| # | Test | Réussi si… |
|---|---|---|
| R1 | 10 variantes : cassures seules (sans les moyennes) ; horizon court seul (moyenne 16/64 + cassure 40) ; horizon long seul (moyenne 64/256 + cassure 160) ; cassures plus rapides (20, 40, 80 jours, facteurs publiés 0,67 ; 0,70 ; 0,73) ; cassures plus lentes (80, 160, 320 jours, facteurs 0,73 ; 0,74 ; 0,74) ; moyennes x1,5 comme dans EXP-002 (cassures inchangées) ; agitation visée de 10 % et de 14 % ; seuil de transaction de 1 % et de 4 % | Chaque variante garde un rendement d'au moins 4 %, une pire chute meilleure que -25 %, et une note rendement/risque à ±30 % de la version de base |
| R2 | Sous-périodes : 2007-2012, 2013-2019, 2020-2026 | Rendement positif dans les 3, et note rendement/risque meilleure que le 60/40 dans au moins 2 sur 3 |
| R3 | Frais multipliés par 3 | Perte de moins de 1,5 point de rendement par an, et pire chute toujours meilleure que -20 % |
| R4 | Sans la crypto | Pire chute meilleure que -20 %, rendement d'au moins 5 %, et note rendement/risque meilleure que le 60/40 |
| R5 | Hasard : note combinée de chaque actif décalée au hasard dans le temps (500 tirages) | Note rendement/risque meilleure qu'au moins 95 % des versions au hasard |

Correction faite avant tout résultat : la première version de ce tableau annonçait « 9 variantes »
par erreur de comptage. La liste, elle, n'a pas changé : elle en contient 10.

Remarque sur la variante « cassures plus lentes » : le canal de 320 jours demande plus que les
300 jours d'historique minimum, donc chaque actif y entre 20 jours plus tard. Effet attendu
négligeable, on le laisse tel quel.

*Affiché pour information seulement (pas des critères) :* part investie moyenne, lien
(corrélation) entre les notes de cassure et les notes de moyenne, et contrôle d'échelle des
cassures (note moyenne visée : environ 10). Si ce contrôle s'écarte beaucoup de 10, on le note,
mais on ne corrige pas les facteurs dans cette expérience.

**Verdict prévu :** la version « v2 + cassures » remplace la v2 comme base à battre seulement si
**les 10 critères** (M1, M2, P1 à P3, R1 à R5) sont réussis. Sinon, la v2 reste la base et
l'échec est documenté ici.

**Résultats** (lancement GitHub du 25/09/2026, `python experience_003.py`, données `9f340c2f2bdb`,
du 03/01/2007 au 24/09/2026, soit 19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Agitation | Sharpe | Investi en moyenne |
|---|---|---|---|---|---|---|
| **v2 + cassures** | **+6,2 %** | **-9,7 %** | **0,65** | 6,7 % | 0,93 | 63 % |
| v2 (base à battre) | +6,3 % | -10,0 % | 0,63 | 7,0 % | 0,90 | 66 % |
| Acheter et garder SPY | +11,0 % | -55,2 % | 0,20 | 19,6 % | 0,63 | |
| 60/40 (SPY/IEF) | +8,2 % | -32,2 % | 0,25 | 11,0 % | 0,77 | |
| v1 (200 jours sur SPY) | +7,9 % | -24,4 % | 0,32 | 11,8 % | 0,70 | |
| Même panier sans signaux | +7,6 % | -20,0 % | 0,38 | 8,6 % | 0,89 | |

Frais : 0,68 % par an (v2 : 0,65 %). Pour information : lien entre cassures et moyennes = **0,90**
(1 = identiques) ; note moyenne des cassures = 7,9 (visé : environ 10).

| # | Test | Résultat | Verdict |
|---|---|---|---|
| M1 | +0,5 point par rapport à la v2 | +6,2 % contre +6,3 % : **-0,04 point** | ❌ |
| M2 | Note R/R au moins égale à la v2 | 0,65 contre 0,63 | ✅ |
| P1 | Pire chute meilleure que -20 % | -9,7 % | ✅ |
| P2 | Rendement d'au moins 6 % | +6,2 % | ✅ |
| P3 | Meilleure note que les 4 références | 0,65 (meilleure référence : 0,38) | ✅ |
| R1 | 10 variantes | Toutes entre +5,4 % et +7,2 %/an, chutes entre -8,4 % et -11,3 %, note R/R à 19 % au plus de la base | ✅ |
| R2 | Sous-périodes | 2007-2012 : note 0,74 (60/40 : 0,16) · 2013-2019 : 0,61 (60/40 : **0,91**) · 2020-2026 : 0,76 (60/40 : 0,43). Positive partout, meilleure que le 60/40 sur 2 périodes sur 3 | ✅ |
| R3 | Frais x3 | +4,8 %/an (perte de 1,44 point), chute -10,5 % | ✅ |
| R4 | Sans la crypto | +4,3 %/an (**minimum fixé : 5 %**), chute -9,5 %, note 0,45 (60/40 : 0,25). La v2 sans crypto faisait +4,4 % | ❌ |
| R5 | Hasard (500 tirages) | Note R/R meilleure que 100 % des versions au hasard (médiane du hasard : 0,22) | ✅ |

**Conclusion :**

- **Verdict officiel : 8/10, EXP-003 échoue. La v2 reste la base à battre.** Les cassures
  n'apportent pas de rendement (-0,04 point par an) et ne règlent pas R4 (sans la crypto :
  +4,3 %/an, contre +4,4 % pour la v2).
- **Ce qui était prévu s'est produit.** Cassures et moyennes sont presque identiques (lien de 0,90) :
  les ajouter revient à demander deux fois la même chose. La régularité s'améliore à peine
  (Sharpe 0,93 contre 0,90, pire chute -9,7 % contre -10,0 %), trop peu pour justifier 3
  détecteurs de plus.
- **Le robot est encore un peu plus prudent** (investi à 63 % au lieu de 66 %) : les notes de
  cassure sont un peu plus faibles que prévu (7,9 au lieu d'environ 10) et ne dépassent jamais 14,8.
  On ne corrige pas les facteurs après coup.
- **Piège à éviter :** les variantes « horizon long seul » (+7,2 %/an) et « cassures 80, 160, 320 »
  (+6,7 %/an) font mieux que la base. Les choisir maintenant serait de l'optimisation sur les
  données déjà vues (on garderait simplement le meilleur tirage). Ce n'est pas une piste valable
  sans une nouvelle expérience fixée à l'avance, et ce n'est pas l'objet d'EXP-003.
- **Leçon :** le problème de la v2 n'est pas la façon de repérer les tendances (le hasard le
  confirme encore : 100 %), c'est qu'elle n'utilise qu'une partie de son budget de risque. Ajouter
  des signaux qui disent la même chose n'y change rien.

**Décision :** on n'ajoute pas les cassures au robot. Le code reste dans le dépôt, désactivé
(`cassures=()` par défaut), pour pouvoir refaire le test. Prochaine étape prévue : EXP-004
(retour à la moyenne), une famille de signaux qui, elle, n'est **pas** liée à la tendance.

---

## EXP-004 — Ajout du retour à la moyenne (RSI et bandes de Bollinger) à la note combinée

**Date :** 25/09/2026

**Pourquoi cette expérience :** EXP-003 a montré qu'ajouter un signal qui dit la même chose que
la tendance n'apporte rien (cassures liées à 0,90 aux moyennes). Le retour à la moyenne est
l'inverse : il achète ce qui vient de trop baisser et allège ce qui vient de trop monter. C'est
une famille de signaux **vraiment différente**, qui pourrait gagner de l'argent quand la tendance
n'en gagne pas (marchés sans direction).

**Règle testée :** la v2 à l'identique (`docs/STRATEGIE_V2.md`, sans les cassures d'EXP-003),
avec **une seule différence** : la note combinée mélange deux familles de signaux.

**Famille « retour à la moyenne »** : 2 détecteurs aux réglages classiques des manuels, convertis
en note de -20 à +20. Note **positive** quand l'actif est « survendu » (il a trop baissé, on
parie qu'il remonte), **négative** quand il est « suracheté ».

| Détecteur | Calcul | Conversion en note | Repères |
|---|---|---|---|
| RSI 14 jours | Indicateur de force relative de J. W. Wilder (1978) : part des hausses dans les variations des 14 derniers jours (moyenne de Wilder), de 0 à 100 | `note = (50 − RSI) ÷ 2` | RSI 30 (seuil classique « survendu ») → +10 ; RSI 70 (« suracheté ») → -10 |
| Bandes de Bollinger 20 jours | Écart entre le prix et sa moyenne des 20 derniers jours, mesuré en écarts-types de ces 20 clôtures (J. Bollinger) | `note = −5 × écart` | Prix sur la bande basse (-2 écarts-types) → +10 ; sur la bande haute → -10 |

Les réglages (14 jours, 20 jours, seuils 30/70, bandes à 2 écarts-types) sont ceux des auteurs.
La conversion est fixée **a priori** : le seuil classique de chaque indicateur correspond à une
note de 10 (un signal « normal »), comme pour les autres détecteurs. Les notes sont bornées entre
-20 et +20. **Rien n'est ajusté sur nos données.**

**Note combinée** = **50 %** × moyenne des 3 détecteurs de tendance de la v2
\+ **50 %** × moyenne des 2 détecteurs de retour à la moyenne, puis bornée entre 0 et 20.
Moitié-moitié : on ne sait pas a priori quelle famille est la meilleure, donc on ne favorise
aucune des deux (même logique que les budgets de risque égaux par classe d'actifs).
**Tout le reste est inchangé** : panier, budgets de risque, agitation visée de 12 %, IDM,
garde-fous, seuil de transaction, frais, exécution à l'ouverture suivante, période 2007-2026.

Exemples : tendance haussière (+10) et actif suracheté (-10) → note 0, cash. Tendance baissière
(-10) et actif survendu (+10) → note 0, cash. Pas de tendance (0) et actif survendu (+10) → note 5 :
le robot achète la baisse d'un marché sans direction.

**Ce qu'on attend honnêtement (écrit avant les tests) :**

- **Le robot sera probablement encore moins investi.** En moyenne, une note de retour à la moyenne
  vaut à peu près 0 (un actif est autant de fois survendu que suracheté). La mélanger à moitié
  avec la tendance fait donc baisser la note combinée, alors que le problème de la v2 est déjà
  d'être trop peu investie (66 %). Dans le cas le plus fréquent (tendance haussière + prix qui
  monte), les deux familles se contredisent.
- **Plus de transactions, donc plus de frais :** RSI et Bollinger changent d'avis en quelques
  jours, contre des mois pour la tendance.
- **Ce que dit la littérature :** le retour à la moyenne à court terme fonctionne surtout sur les
  indices actions, peu sur les obligations et les matières premières, et beaucoup de résultats
  publiés sur le RSI ont été trouvés en testant de nombreux réglages (optimisation cachée).
  Et notre exécution à l'ouverture du lendemain rate une partie du rebond, qui arrive souvent
  pendant la nuit.
- **Résultat le plus probable : rendement plus faible que la v2 (M1 échoué).** Ce qui reste
  à découvrir : est-ce que le mélange améliore la régularité (M2, note rendement/risque) ?

**Hypothèse :** mélanger à moitié retour à la moyenne et tendance augmente le rendement de la v2
d'au moins 0,5 point par an sans dégrader sa note rendement/risque, et la nouvelle version réussit
tous les critères d'EXP-002, y compris R4 (sans la crypto).

**Critères de réussite (fixés avant les tests) :** exactement les mêmes 10 critères qu'EXP-003,
avec les mêmes seuils. Seules les variantes de R1 changent, pour tester les réglages du retour à
la moyenne.

*Mieux que la v2 — comparaison dans le même lancement, sur les mêmes données :*

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,5 point** à celui de la v2 |
| M2 | Note rendement/risque **au moins égale** à celle de la v2 |

*Performance — identiques à EXP-002 :*

| # | Réussi si… |
|---|---|
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison : acheter et garder SPY, 60/40, v1, et le même panier toujours investi |

*Robustesse — mêmes seuils que EXP-002 :*

| # | Test | Réussi si… |
|---|---|---|
| R1 | 11 variantes : RSI seul (sans Bollinger) ; Bollinger seul (sans RSI) ; durées doublées (RSI 28 jours, Bollinger 40 jours) ; durées divisées par 2 (RSI 7 jours, Bollinger 10 jours) ; retour à la moyenne pesant 25 % au lieu de 50 % ; retour à la moyenne pesant 75 % ; moyennes de tendance x1,5 comme dans EXP-002 ; agitation visée de 10 % et de 14 % ; seuil de transaction de 1 % et de 4 % | Chaque variante garde un rendement d'au moins 4 %, une pire chute meilleure que -25 %, et une note rendement/risque à ±30 % de la version de base |
| R2 | Sous-périodes : 2007-2012, 2013-2019, 2020-2026 | Rendement positif dans les 3, et note rendement/risque meilleure que le 60/40 dans au moins 2 sur 3 |
| R3 | Frais multipliés par 3 | Perte de moins de 1,5 point de rendement par an, et pire chute toujours meilleure que -20 % |
| R4 | Sans la crypto | Pire chute meilleure que -20 %, rendement d'au moins 5 %, et note rendement/risque meilleure que le 60/40 |
| R5 | Hasard : note combinée de chaque actif décalée au hasard dans le temps (500 tirages) | Note rendement/risque meilleure qu'au moins 95 % des versions au hasard |

Correction faite avant d'écrire le code et avant tout résultat : la première version de ce tableau
annonçait « 10 variantes » par erreur de comptage. La liste, elle, n'a pas changé : elle en contient 11.

*Affiché pour information seulement (pas des critères) :* part investie moyenne, frais par an,
lien (corrélation) entre la note de retour à la moyenne et la note de tendance, note moyenne du
retour à la moyenne en valeur absolue (comparée à environ 10), et résultat de la famille
« retour à la moyenne » seule (sans la tendance). Aucun réglage n'est corrigé après coup
dans cette expérience.

**Verdict prévu :** la version « v2 + retour à la moyenne » remplace la v2 comme base à battre
seulement si **les 10 critères** (M1, M2, P1 à P3, R1 à R5) sont réussis. Sinon, la v2 reste la
base et l'échec est documenté ici.

**Résultats** (lancement GitHub du 25/09/2026, `python experience_004.py`, données `39f1a6f243ce`,
du 03/01/2007 au 24/09/2026, soit 19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Agitation | Sharpe | Investi en moyenne |
|---|---|---|---|---|---|---|
| **v2 + retour à la moyenne** | **+1,0 %** | **-12,4 %** | **0,08** | 4,3 % | 0,26 | 36 % |
| v2 (base à battre) | +6,3 % | -10,0 % | 0,63 | 7,0 % | 0,90 | 66 % |
| Acheter et garder SPY | +11,0 % | -55,2 % | 0,20 | 19,6 % | 0,63 | |
| 60/40 (SPY/IEF) | +8,2 % | -32,2 % | 0,25 | 11,0 % | 0,77 | |
| v1 (200 jours sur SPY) | +7,9 % | -24,4 % | 0,32 | 11,8 % | 0,70 | |
| Même panier sans signaux | +7,6 % | -20,0 % | 0,38 | 8,6 % | 0,89 | |

Frais : **1,86 % par an** (v2 : 0,65 %). Pour information : lien entre retour à la moyenne et
tendance = **-0,38** (sens opposés) ; note moyenne du retour à la moyenne = 5,4 (environ 10 visé).
**Retour à la moyenne seul, sans la tendance : -1,9 % par an**, pire chute -42,2 %, investi à 27 %,
frais de 2,78 % par an.

| # | Test | Résultat | Verdict |
|---|---|---|---|
| M1 | +0,5 point par rapport à la v2 | +1,0 % contre +6,3 % : **-5,25 points** | ❌ |
| M2 | Note R/R au moins égale à la v2 | 0,08 contre 0,63 | ❌ |
| P1 | Pire chute meilleure que -20 % | -12,4 % | ✅ |
| P2 | Rendement d'au moins 6 % | +1,0 % | ❌ |
| P3 | Meilleure note que les 4 références | 0,08 : battue par les 4 | ❌ |
| R1 | 11 variantes | Aucune réussie. Toutes entre -1,2 % et +4,7 %/an ; la meilleure est celle qui met le moins de retour à la moyenne (25 %) | ❌ |
| R2 | Sous-périodes | 2007-2012 : +1,8 %/an · 2013-2019 : **-0,2 %/an** · 2020-2026 : +1,5 %/an. Meilleure que le 60/40 sur 1 période sur 3 | ❌ |
| R3 | Frais x3 | -2,6 %/an (perte de 3,66 points), chute -44,5 % | ❌ |
| R4 | Sans la crypto | +0,8 %/an, chute -16,6 %, note 0,05 (60/40 : 0,25) | ❌ |
| R5 | Hasard (500 tirages) | Meilleure que 86 % seulement des versions au hasard (95 % exigés) | ❌ |

**Conclusion :**

- **Verdict officiel : 1/10, EXP-004 échoue nettement. La v2 reste la base à battre.**
- **Ce qui était prévu s'est produit, en pire.** Le robot n'est plus investi qu'à 36 % (66 % pour
  la v2), il paie presque 3 fois plus de frais (1,86 % par an), et les deux familles se
  contredisent (lien de -0,38) : la moitié « retour à la moyenne » vend ce que la tendance achète.
- **Le retour à la moyenne ne gagne rien sur ce panier, à cet horizon, avec cette exécution.**
  Seul, il perd 1,9 % par an. Plus on lui donne de poids, pire c'est : 25 % → +4,7 %/an,
  50 % → +1,0 %, 75 % → -1,2 %.
- **Pas de réglage « sauveur » à aller chercher.** Toutes les variantes sont en dessous de la v2.
  Celle qui s'en rapproche le plus est celle qui enlève le plus de retour à la moyenne : c'est
  la preuve que c'est la famille entière qui coûte, pas un mauvais réglage.
- Limites de ce test (connues d'avance) : exécution à l'ouverture du lendemain, qui rate une
  partie du rebond ; un seul horizon court (1 à 4 semaines) ; frais de 0,10 % par transaction,
  qui pèsent lourd sur un signal qui change d'avis souvent.

**Décision :** on n'ajoute pas le retour à la moyenne au robot. Le code reste dans le dépôt,
désactivé (`retour=()` par défaut). Leçon d'EXP-003 et d'EXP-004 : ajouter des familles de
signaux ne règle pas le problème de la v2, qui est de n'utiliser qu'une partie de son budget
de risque (investie à 66 %, 7 % d'agitation pour 12 % visés).

---

## EXP-005 — Budget de risque : faire atteindre à la v2 l'agitation qu'elle vise déjà

**Date :** 25/09/2026

**Pourquoi cette expérience :** EXP-002, EXP-003 et EXP-004 montrent toutes le même défaut : la v2
vise une agitation de 12 % par an, mais n'en réalise que 7 %. Elle n'est investie qu'à 66 % en
moyenne, et sa pire chute (-10 %) est loin de la limite acceptée (-25 %). Ajouter des signaux n'y a
rien changé. Cette expérience s'attaque directement à ce défaut.

**Règle testée :** la v2 à l'identique, avec **une seule différence** : un **multiplicateur de
risque**, recalculé chaque soir, appliqué à toutes les parts visées **avant** les garde-fous.

1. On simule d'abord la v2 normale (multiplicateur 1) depuis le début des données.
2. Chaque soir, on mesure l'agitation réalisée de cette v2 normale sur les **2 dernières années**
   (504 jours de bourse, la même fenêtre que le bonus de diversification), avec seulement le passé.
3. Multiplicateur = **agitation visée (12 %) ÷ agitation réalisée**, borné entre **1 et 2,5**.
4. Toutes les parts visées sont multipliées par ce nombre, puis les garde-fous habituels
   s'appliquent sans changement : 25 % maximum par actif, 15 % en crypto, **100 % investi au
   maximum (toujours pas de levier)**.

Tant qu'il y a moins d'un an d'historique, le multiplicateur vaut 1.

**Pourquoi ces choix sont fixés a priori :**
- L'agitation visée reste **12 %**, la valeur de la spécification d'origine. On ne choisit pas
  une nouvelle cible après avoir vu que « 14 % » faisait mieux dans EXP-002 : on fait seulement
  atteindre au robot la cible qu'il avait déjà.
- La fenêtre de 2 ans et la borne de 2,5 sont celles du bonus de diversification (IDM) de la v2.
- La borne basse de 1 : on ne réduit jamais le risque sous celui de la v2, déjà validé.

**Ce qu'on attend honnêtement (écrit avant les tests) :**
- Rendement plus élevé, **mais pire chute plus grande aussi** : prendre plus de risque, c'est
  accepter des baisses plus fortes. Ordre de grandeur attendu : pire chute entre -13 % et -18 %.
- La note rendement/risque devrait rester **à peu près la même** : on monte le volume, pas la
  qualité du signal. Elle peut même baisser un peu, car le plafond de 100 % investi et les
  plafonds par actif empêchent de tout multiplier à l'identique.
- Plus de transactions, donc un peu plus de frais.
- **Principal risque :** quand peu d'actifs sont en tendance, le robot se concentre davantage sur
  eux (jusqu'à 25 % chacun). Le critère P1 (pire chute meilleure que -20 %) peut être menacé.

**Hypothèse :** le multiplicateur de risque augmente le rendement de la v2 d'au moins 0,5 point
par an, garde une pire chute meilleure que -20 %, ne dégrade pas nettement la note
rendement/risque, et permet enfin de réussir R4 (au moins 5 % par an sans la crypto).

**Critères de réussite (fixés avant les tests) :**

*Mieux que la v2 — comparaison dans le même lancement, sur les mêmes données :*

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,5 point** à celui de la v2 |
| M2 | Note rendement/risque **au moins égale à 90 %** de celle de la v2 |

Pourquoi M2 est différent d'EXP-003 et EXP-004 : ici on augmente volontairement le risque, et une
note rendement/risque à peu près stable est le résultat attendu d'un bon changement. Exiger
« au moins égale » ferait dépendre le verdict d'un écart de hasard de quelques centièmes. La
tolérance de 10 % laisse passer une note stable, mais refuse une vraie dégradation.

*Performance — identiques à EXP-002 :*

| # | Réussi si… |
|---|---|
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison : acheter et garder SPY, 60/40, v1, et le même panier toujours investi |

*Robustesse — mêmes seuils que EXP-002 :*

| # | Test | Réussi si… |
|---|---|---|
| R1 | 10 variantes : fenêtre de mesure de 1 an (252 jours) ; fenêtre de 4 ans (1 008 jours) ; borne haute de 2 ; borne haute de 3 ; sans borne basse (le multiplicateur peut descendre sous 1) ; moyennes x1,5 comme dans EXP-002 ; agitation visée de 10 % et de 14 % ; seuil de transaction de 1 % et de 4 % | Chaque variante garde un rendement d'au moins 4 %, une pire chute meilleure que -25 %, et une note rendement/risque à ±30 % de la version de base |
| R2 | Sous-périodes : 2007-2012, 2013-2019, 2020-2026 | Rendement positif dans les 3, et note rendement/risque meilleure que le 60/40 dans au moins 2 sur 3 |
| R3 | Frais multipliés par 3 | Perte de moins de 1,5 point de rendement par an, et pire chute toujours meilleure que -20 % |
| R4 | Sans la crypto | Pire chute meilleure que -20 %, rendement d'au moins 5 %, et note rendement/risque meilleure que le 60/40 |
| R5 | Hasard : notes de chaque actif décalées au hasard dans le temps (500 tirages), multiplicateur recalculé pour chaque version au hasard | Note rendement/risque meilleure qu'au moins 95 % des versions au hasard |

*Affiché pour information seulement (pas des critères) :* multiplicateur moyen, minimum et
maximum ; part investie moyenne ; agitation réalisée ; frais par an. Aucun réglage n'est corrigé
après coup dans cette expérience.

**Verdict prévu :** la version « v2 + budget de risque » remplace la v2 comme base à battre
seulement si **les 10 critères** (M1, M2, P1 à P3, R1 à R5) sont réussis. Sinon, la v2 reste la
base et l'échec est documenté ici.

**Résultats** (lancement GitHub du 25/09/2026, `python experience_005.py`, 19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Investi en moyenne |
|---|---|---|---|---|
| **v2 + budget de risque** | **+7,8 %** | **-12,6 %** | **0,62** | 77 % |
| v2 (base à battre) | +6,3 % | -10,0 % | 0,63 | 66 % |
| 60/40 (SPY/IEF) | +8,2 % | -32,2 % | 0,25 | |
| Acheter et garder SPY | +11,0 % | -55,2 % | 0,20 | |

Pour information : multiplicateur moyen 1,80 (de 1,26 à 2,50, à la borne haute 7 % du temps) ;
agitation réalisée 8,3 % (visée 12 %) ; frais 0,72 % par an (v2 : 0,65 %).

| # | Résultat | Verdict |
|---|---|---|
| M1 | +7,8 % contre +6,3 % : **+1,47 point** | ✅ |
| M2 | 0,62 contre 0,63 (seuil : 90 %, soit 0,57) | ✅ |
| P1 | -12,6 % | ✅ |
| P2 | +7,8 % | ✅ |
| P3 | 0,62 (meilleure référence : 0,38) | ✅ |
| R1 | 10 variantes entre +7,1 % et +8,1 %/an, chutes entre -11,6 % et -13,4 %, note à 8 % au plus de la base | ✅ |
| R2 | 2007-2012 : +6,8 %/an · 2013-2019 : +7,5 % (note 0,65, 60/40 : 0,91) · 2020-2026 : +8,6 %. Mieux que le 60/40 sur 2 périodes sur 3 | ✅ |
| R3 | Frais x3 : +6,3 %/an, chute -14,1 %, **perte de 1,50 point** (il fallait **moins** de 1,5) | ❌ |
| R4 | Sans la crypto : **+5,2 %/an** (minimum 5 %), chute -12,1 %, note 0,43 (60/40 : 0,25) | ✅ |
| R5 | Meilleure que 100 % des 500 versions au hasard | ✅ |

**Conclusion :**

- **Verdict officiel : 9/10, EXP-005 n'est PAS validée.** L'échec (R3) se joue à un cheveu : perte
  de 1,50 point quand il en fallait moins de 1,50. On ne change pas le critère après coup.
- **C'est de loin la meilleure expérience.** +1,5 point de rendement par an pour seulement 2,6 points
  de chute en plus, note rendement/risque stable, et **R4 réussi pour la première fois** (+5,2 % sans
  crypto). Toutes les variantes donnent le même résultat : ce n'est pas un réglage chanceux.
- **Point faible confirmé : les frais.** Plus de positions, c'est plus d'échanges. Avec des frais
  3 fois plus élevés, le gain fond. Les frais réels du courtier devront être mesurés avant le réel.
- **Le robot reste prudent** : 8,3 % d'agitation pour 12 % visée, bridé par le plafond de 100 % investi.

**Décision :** la v2 reste officiellement la base. Le budget de risque est **la piste la plus
prometteuse** ; la prochaine expérience devrait réduire les frais (par exemple en échangeant moins
souvent) tout en gardant ce multiplicateur, avec de nouveaux critères fixés avant.

---

## EXP-006 — Budget de risque + zone tampon (moins d'échanges, moins de frais)

**Date :** 25/09/2026

**Pourquoi cette expérience :** EXP-005 (multiplicateur de risque) a réussi 9 critères sur 10 :
+7,8 %/an, pire chute -12,6 %, et +5,2 % sans crypto. Elle n'échoue que sur les frais x3 (perte de
1,50 point pour moins de 1,5 exigé). Le robot échange trop souvent pour de petits ajustements.

**Règle testée :** EXP-005 à l'identique (même multiplicateur de risque), avec **une seule
différence** : la règle qui décide quand ajuster une position.

- Aujourd'hui : on ajuste si l'écart avec la cible dépasse **2 % du capital**, et on va jusqu'à la cible.
- EXP-006 : **zone tampon** de R. Carver (*Systematic Trading*, *Leveraged Trading*). Pour chaque
  actif, la zone a une demi-largeur de **10 % de la position « normale »** de cet actif (celle qu'il
  aurait avec une note de 10, multiplicateur compris, avant les plafonds). Si la position actuelle
  est dans la zone, on ne fait rien. Sinon, on ne ramène la position **que jusqu'au bord** de la zone,
  pas jusqu'à la cible. Si la cible tombe à 0, on vend tout, comme avant.
- Les garde-fous ne changent pas (25 % par actif, 15 % crypto, 100 % investi au maximum). Si garder
  une position violait un plafond, on applique les cibles exactes, comme avant.

Le chiffre de 10 % est celui publié par R. Carver, **pas ajusté sur nos données**.

**Transparence :** dans EXP-005, la variante « seuil de transaction de 4 % » faisait déjà moins de
frais. On ne choisit **pas** ce chiffre, puisqu'on l'a vu : on teste une autre règle, fixée a priori.

**Ce qu'on attend honnêtement :** moins d'échanges et moins de frais ; rendement proche d'EXP-005
(un peu plus ou un peu moins) ; R3 devrait passer. Risque : la position suit un peu moins vite la
cible, ce qui peut coûter un peu de rendement.

**Hypothèse :** la zone tampon réduit assez les frais pour que la version « v2 + budget de risque +
zone tampon » réussisse les 10 critères.

**Critères de réussite (fixés avant les tests) :** exactement ceux d'EXP-005, contre la v2 (base officielle).

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,5 point** à celui de la v2 |
| M2 | Note rendement/risque au moins égale à **90 %** de celle de la v2 |
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison |
| R1 | 10 variantes : zone tampon de 5 % ; zone tampon de 20 % ; zone tampon sans multiplicateur de risque ; fenêtre de mesure de 1 an ; fenêtre de 4 ans ; borne haute de 2 ; borne haute de 3 ; moyennes x1,5 ; agitation visée de 10 % ; agitation visée de 14 %. Chaque variante : rendement d'au moins 4 %, pire chute meilleure que -25 %, note rendement/risque à ±30 % de la base |
| R2 | Sous-périodes 2007-2012, 2013-2019, 2020-2026 : rendement positif dans les 3, note meilleure que le 60/40 dans au moins 2 |
| R3 | Frais x3 : perte de moins de 1,5 point par an, pire chute meilleure que -20 % |
| R4 | Sans la crypto : pire chute meilleure que -20 %, rendement d'au moins 5 %, note meilleure que le 60/40 |
| R5 | Hasard (500 tirages, multiplicateur et zone tampon appliqués à chaque version) : note meilleure que 95 % des tirages |

*Pour information :* frais par an et montant échangé par an, comparés à la v2 et à EXP-005.

**Verdict prévu :** « v2 + budget de risque + zone tampon » devient la nouvelle base à battre
seulement si **les 10 critères** sont réussis.

**Résultats** (lancement GitHub du 25/09/2026, `python experience_006.py`, données `679effe582d7`,
19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Sharpe | Investi | Frais/an | Échangé/an |
|---|---|---|---|---|---|---|---|
| **v2 + budget + zone tampon** | **+7,8 %** | **-11,7 %** | **0,67** | 0,97 | 73 % | **0,48 %** | 402 % |
| EXP-005 (seuil de 2 %) | +7,8 % | -12,6 % | 0,62 | | 77 % | 0,72 % | 622 % |
| v2 | +6,3 % | -10,0 % | 0,63 | 0,90 | 66 % | 0,65 % | 585 % |

| # | Résultat | Verdict |
|---|---|---|
| M1 | +7,8 % contre +6,3 % : +1,52 point | ✅ |
| M2 | 0,67 contre 0,63 | ✅ |
| P1 / P2 / P3 | -11,7 % · +7,8 % · 0,67 (meilleure référence : 0,38) | ✅ ✅ ✅ |
| R1 | 10 variantes entre +6,3 % et +8,1 %/an, chutes entre -9,8 % et -12,7 %, note à 19 % au plus | ✅ |
| R2 | 2007-2012 : +6,4 % · 2013-2019 : +7,6 % (60/40 meilleur) · 2020-2026 : +9,1 %. 2 périodes sur 3 | ✅ |
| R3 | Frais x3 : +6,8 %/an, perte de **1,03 point** (moins de 1,5), chute -12,8 % | ✅ |
| R4 | Sans la crypto : +5,1 %/an, chute -10,6 %, note 0,48 (60/40 : 0,25) | ✅ |
| R5 | Meilleure que 100 % des 500 versions au hasard | ✅ |

**Conclusion :**

- **Verdict officiel : 10/10. « v2 + budget + zone tampon » devient la nouvelle base à battre (v3).**
- La zone tampon fait ce qui était prévu : **31 % d'échanges en moins** que la v2, frais passés de
  0,65 % à 0,48 % par an, et même une pire chute plus faible qu'EXP-005.
- **Prudence (honnêteté) :** c'est la 6e expérience sur les mêmes 20 ans de données. Plus on teste
  d'idées sur le même passé, plus une réussite peut être en partie due à la chance. Les critères fixés
  avant, le test du hasard et la stabilité des 10 variantes limitent ce risque, sans l'annuler. Le
  vrai juge sera l'argent fictif sur plusieurs mois.
- La variante « zone tampon 20 % » fait une meilleure note (0,79) : on ne la choisit **pas** après
  coup. Le réglage reste celui de Carver (10 %).

**Décision :** la v3 = v2 + multiplicateur de risque (EXP-005) + zone tampon (EXP-006) est la
version à brancher sur le robot en argent fictif (étape 7).

---

## EXP-007 — Croisement de moyennes en H1, filtré par la tendance weekly, avec stop et stop suiveur

**Date :** 25/09/2026 · **Idée de l'utilisateur**

**Pourquoi cette expérience :** tester une stratégie différente de la v3, qui entre sur un horizon
court (bougies d'une heure) mais seulement dans le sens de la tendance de fond (weekly), et qui gère
chaque position avec un stop calculé et un stop suiveur. Elle doit battre la **v3** (la base actuelle).

**Règle testée (réglages fixés a priori, valeurs classiques, non ajustées sur les données) :**

| Élément | Règle |
|---|---|
| Filtre de fond | Moyenne des 10 dernières clôtures hebdomadaires au-dessus de celle des 40 dernières. Uniquement des **semaines terminées** (clôtures quotidiennes Yahoo ajustées). Si le filtre est baissier : aucun nouvel achat. |
| Déclencheur H1 | Moyenne exponentielle 20 bougies (« légère ») qui passe au-dessus de la moyenne exponentielle 50 bougies (« lissée »), constaté à la **clôture** d'une bougie d'une heure |
| Entrée | Achat à l'**ouverture de la bougie suivante** (jamais avant la fin de la bougie du croisement) |
| Stop initial | Prix d'entrée − 2 × l'agitation moyenne d'une bougie H1 (ATR de Wilder sur 14 bougies) |
| Stop suiveur | Plus haut atteint depuis l'entrée − 3 × ATR, mis à jour à chaque clôture, ne redescend jamais. Pas de passage au prix d'entrée (pas de breakeven). |
| Sortie | Uniquement quand le stop est touché. Si le prix ouvre déjà sous le stop (trou), la sortie se fait au prix d'ouverture, pas au prix du stop. |
| Nouvelle entrée | Seulement sur un **nouveau** croisement haussier. |
| Taille | Perte maximale de **0,5 % du capital** si le stop initial est touché ; au plus 25 % du capital par actif, 15 % en crypto, 100 % au total (jamais de levier). Pas de martingale, pas de grille. |
| Marchés | Les 10 actifs de la v3 ; actions de 9h à 16h (heure de New York), crypto 24h/24 |
| Frais | Identiques à la v3 : 0,10 % par transaction pour un ETF, 0,50 % pour la crypto |

**Données et période :** bougies d'une heure ajustées (dividendes et divisions) de l'historique gratuit
d'Alpaca, depuis 2016 si disponible. La v3 et les points de comparaison sont **recalculés sur la même
période**. Si Alpaca fournit **moins de 6 ans** de bougies H1 pour les ETF, l'expérience est déclarée
**non concluante** : trop court pour juger.

**Ce qu'on attend honnêtement :** le filtre weekly et le stop suiveur sont de bonnes idées. Le risque
principal : en H1, les moyennes se croisent souvent et un stop de 2 ATR H1 est serré (souvent moins
qu'une journée normale de mouvement). Beaucoup de trades, beaucoup de frais, des sorties sur du bruit.
Battre la v3 est possible mais incertain.

**Hypothèse :** cette stratégie fait mieux que la v3 sur la même période et réussit les mêmes critères.

**Critères de réussite (fixés avant les tests) :** les 10 critères d'EXP-006, avec la **v3** comme base.

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,5 point** à celui de la v3 (même période) |
| M2 | Note rendement/risque au moins égale à **90 %** de celle de la v3 |
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison (même période) |
| R1 | 10 variantes : moyennes H1 10/30 ; moyennes H1 40/100 ; stop initial 3 ATR ; stop suiveur 2 ATR ; stop suiveur 5 ATR ; risque de 0,25 % par trade ; risque de 1 % par trade ; sans filtre weekly ; filtre weekly 5/20 semaines ; sortie aussi dès que le filtre weekly devient baissier. Chaque variante : rendement d'au moins 4 %, pire chute meilleure que -25 %, note à ±30 % de la base |
| R2 | Trois tiers égaux de la période : rendement positif dans les 3, note meilleure que le 60/40 dans au moins 2 |
| R3 | Frais x3 : perte de moins de 1,5 point par an, pire chute meilleure que -20 % |
| R4 | Sans la crypto : pire chute meilleure que -20 %, rendement d'au moins 5 %, note meilleure que le 60/40 |
| R5 | Hasard : les signaux d'entrée de chaque actif décalés au hasard dans le temps (500 tirages), mêmes stops : note meilleure que 95 % des tirages |

*Pour information :* nombre de trades, part de trades gagnants, facteur de profit, durée moyenne d'un
trade, frais par an, part investie moyenne.

**Verdict prévu :** la stratégie remplace la v3 seulement si **les 10 critères** sont réussis.

**Résultats** (lancement GitHub du 25/09/2026, `python experience_007.py`, bougies H1 Alpaca flux SIP,
ETF du 04/01/2016 au 23/09/2026, crypto depuis le 01/01/2021 seulement, période jugée 2016-02-03 → 2026-09-22,
10,6 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R |
|---|---|---|---|
| **H1 filtrée weekly** | **+5,0 %** | **-26,0 %** | **0,19** |
| v3 (base à battre, même période) | +10,6 % | -11,7 % | 0,91 |
| Acheter et garder SPY | +16,0 % | -33,7 % | 0,47 |
| 60/40 (SPY/IEF) | +9,9 % | -21,2 % | 0,47 |
| v1 (200 jours sur SPY) | +11,2 % | -19,5 % | 0,57 |
| Même panier sans signaux | +10,2 % | -20,0 % | 0,51 |

*Pour information :* 390 trades fermés (37 par an), **33 % de gagnants**, **facteur de profit 0,74**
(les pertes dépassent les gains), durée moyenne 3,5 jours, **frais 2,08 %/an**, investi à 78 % en moyenne.

| # | Résultat | Verdict |
|---|---|---|
| M1 | +5,0 % contre +10,6 % : -5,63 points | ❌ |
| M2 | 0,19 contre 0,91 | ❌ |
| P1 / P2 / P3 | -26,0 % · +5,0 % · 0,19 (battue par les 4 références) | ❌ ❌ ❌ |
| R1 | 1 variante sur 10 réussie (risque 0,25 %). Meilleure : filtre weekly 5/20, +6,5 %/an, chute -21,4 % | ❌ |
| R2 | 2016-2019 : -1,0 %/an · 2019-2023 : -0,9 %/an · 2023-2026 : +18,1 %/an | ❌ |
| R3 | Frais x3 : +2,6 %/an, perte de 2,40 points, chute -38,9 % | ❌ |
| R4 | Sans la crypto : +5,5 %/an, chute -20,6 %, note 0,27 (60/40 : 0,47) | ❌ |
| R5 | Meilleure que seulement **28 %** des 500 versions aux entrées tirées au hasard (médiane du hasard : 0,25) | ❌ |

**Conclusion :**

- **Verdict officiel : 0/10. La v3 reste la base à battre.**
- **Le point clé est R5 :** acheter à des moments tirés au hasard, avec les mêmes stops, fait **mieux** que
  le croisement H1 dans 72 % des cas. Le croisement 20/50 en H1 n'apporte donc aucune information utile sur
  la suite du prix : ce sont le filtre, les stops et la hausse générale des marchés qui font le peu de gain.
- Ce qu'on craignait avant le test s'est produit : en H1, le stop de 2 ATR est touché par le bruit normal
  d'une journée (trades de 3,5 jours en moyenne, 2 sur 3 perdants), et les allers-retours coûtent 2 %/an de frais.
- Le dernier tiers (2023-2026 : +18 %/an) montre que la stratégie marche bien **dans un marché qui monte
  fort et régulièrement** ; elle perd de l'argent dans les 7 années précédentes. Juger sur ces 3 ans seulement
  aurait été un piège.
- La variante « filtre weekly 5/20 » fait un peu mieux (+6,5 %) : on ne la choisit **pas** après coup, et
  elle resterait loin de la v3.
- Biais signalé : la crypto n'est disponible en H1 qu'à partir de 2021 chez Alpaca (la v3 l'a sur toute la
  période). Sans effet sur le verdict : sans crypto du tout (R4), la stratégie H1 fait +5,5 %/an avec une note de 0,27, sous le simple 60/40 (0,47).

**Décision :** code gardé (`robot/h1.py`, `experience_007.py`), non branché. La v3 reste en argent fictif.

---

## EXP-008 — Rémunérer le cash non investi (fonds monétaire)

**Date :** 26/09/2026 · **Base à battre :** la v3 (EXP-006)

**Constat :** la v3 laisse en moyenne ~27 % du compte en cash, qui ne rapporte rien dans la simulation.
Dans la réalité, on peut placer ce cash dans un fonds monétaire (ETF de bons du Trésor à 3 mois, type BIL
ou SGOV), presque sans risque. Ce n'est pas un nouveau signal : la décision de la v3 ne change pas.

**Règle testée (fixée avant les tests) :**

| Élément | Règle |
|---|---|
| Taux | Taux des bons du Trésor US à 3 mois (Yahoo `^IRX`) publié à la clôture de la **veille** |
| Frais du fonds | 0,15 % par an retirés du taux (frais de gestion d'un fonds type BIL) ; jamais de taux négatif |
| Rendement du jour | (taux − 0,15 %) ÷ 252, appliqué au cash chaque jour de bourse |
| Frais de transaction | 0,10 % (frais ETF) sur chaque variation du cash lors d'un rééquilibrage (achat ou vente de parts du fonds) |
| Reste | Identique à la v3 (mêmes signaux, multiplicateur, zone tampon, plafonds) |

**Ce qu'on attend honnêtement :** taux moyen d'environ 1,5 %/an sur 2007-2026 (presque 0 de 2009 à 2016,
environ 4-5 % depuis 2023), multiplié par ~27 % de cash : **+0,3 à +0,4 point par an**, presque sans risque en
plus. Le gain est modeste mais « gratuit ».

**Hypothèse :** placer le cash améliore le rendement de la v3 sans dégrader sa note rendement/risque.

**Critères de réussite (fixés avant les tests) :** base = la v3. Le seuil M1 est abaissé à +0,2 point
parce que le changement n'ajoute presque aucun risque : 0,2 point par an est le gain minimum qui justifie
d'ajouter un produit et des ordres au robot. M2 est relevé à 100 % pour la même raison.

| # | Réussi si… |
|---|---|
| M1 | Rendement annuel supérieur d'au moins **0,2 point** à celui de la v3 |
| M2 | Note rendement/risque au moins **égale** à celle de la v3 |
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison (inchangés) |
| R1 | Les 10 variantes d'EXP-006, chacune avec le cash rémunéré : rendement d'au moins 4 %, pire chute meilleure que -25 %, note à ±30 % de la base |
| R2 | Trois périodes (2007-2012, 2013-2019, 2020-2026) : rendement positif dans les 3, note meilleure que le 60/40 dans au moins 2 |
| R3 | Frais x3 (y compris les frais de transaction du fonds) : perte de moins de 1,5 point par an, pire chute meilleure que -20 % |
| R4 | Sans la crypto : pire chute meilleure que -20 %, rendement d'au moins 5 %, note meilleure que le 60/40 |
| R5 | Hasard : note meilleure que 95 % des 500 versions aux signaux décalés au hasard (cash rémunéré aussi) |

*Pour information :* taux moyen du fonds, part moyenne en cash, gain apporté par le cash par an,
frais de transaction du fonds par an.

**Verdict prévu :** si les 10 critères sont réussis, la v3 + cash rémunéré devient la base à battre, et le
robot achètera plus tard un fonds monétaire avec son cash (étape séparée, avec ses propres tests).

**Résultats** (lancement GitHub du 26/09/2026, `python experience_008.py`, données `e1e69a237f6f`,
2007-01-03 → 2026-09-25, 19,7 ans, frais compris) :

| | Rendement/an | Pire chute | Note R/R | Sharpe | Investi | Frais/an |
|---|---|---|---|---|---|---|
| **v3 + cash rémunéré** | **+7,9 %** | **-10,5 %** | **0,75** | 0,98 | 73 % | **0,75 %** |
| v3 (base à battre) | +7,8 % | -11,7 % | 0,67 | 0,97 | 73 % | 0,48 % |

*Pour information :* taux net moyen du fonds 1,43 %/an, 27 % du compte en cash en moyenne, **gain net
apporté par le cash : +0,13 %/an**. Les frais passent de 0,48 % à 0,75 %/an : chaque rééquilibrage fait
aussi acheter ou vendre des parts du fonds.

| # | Résultat | Verdict |
|---|---|---|
| M1 | +7,9 % contre +7,8 % : **+0,14 point** (minimum 0,2) | ❌ |
| M2 | 0,75 contre 0,67 | ✅ |
| P1 / P2 / P3 | -10,5 % · +7,9 % · 0,75 (meilleure référence : 0,38) | ✅ ✅ ✅ |
| R1 | 10 variantes entre +6,5 % et +8,2 %/an, chutes entre -8,5 % et -11,6 %, note à 23 % au plus | ✅ |
| R2 | 2007-2012 : +6,3 % · 2013-2019 : +7,5 % (60/40 meilleur) · 2020-2026 : +9,7 %. 2 périodes sur 3 | ✅ |
| R3 | Frais x3 : +6,4 %/an, perte de **1,59 point** (maximum 1,5) | ❌ |
| R4 | Sans la crypto : +5,3 %/an, chute -10,6 %, note 0,50 (60/40 : 0,25) | ✅ |
| R5 | Meilleure que 100 % des 500 versions au hasard | ✅ |

**Conclusion :**

- **Verdict officiel : 8/10, non validée. La v3 reste la base à battre**, avec le cash à 0 %.
- Les intérêts rapportent environ +0,4 point par an comme prévu, mais **les frais d'achat et de vente du
  fonds en mangent les deux tiers** : le cash bouge à chaque rééquilibrage, et chaque mouvement coûte 0,10 %.
- Point positif : la pire chute baisse (-10,5 % au lieu de -11,7 %), car le cash rapportait pendant les krachs.
- Diagnostic pour une éventuelle suite (nouvelle expérience, critères à fixer avant) : ne pas faire suivre
  chaque centime de cash par le fonds (zone tampon sur le fonds lui-même), ou utiliser les intérêts versés
  directement sur le cash par certains courtiers, sans ordre à passer. On ne corrige **pas** cette
  expérience après coup.

**Décision :** code gardé, désactivé par défaut (`monetaire=None`). Le robot ne place pas son cash.

---

## EXP-009 — Le « cerveau à régimes » de la vidéo (modèle de Markov caché)

**Date :** 26/09/2026

**Numéro :** hypothèse et critères écrits et envoyés sur GitHub le 26/09/2026 sous le nom « EXP-007 »
(commit « EXP-007 : hypothèse et critères (cerveau à régimes de la vidéo, HMM) »), avant tout code et tout
test. Une autre session avait utilisé EXP-007 et EXP-008 en parallèle : l'expérience devient EXP-009.
**Seul le numéro change, pas un mot des critères.** Précision : c'est donc la 9e expérience, et la 8e sur
les mêmes données quotidiennes (le texte ci-dessous, écrit avant, dit « la 7e »).

**D'où vient l'idée :** une vidéo YouTube (un robot de trading construit avec Claude Code), envoyée
dans la boîte à idées. Son « cerveau » est un **modèle de Markov caché** (HMM, *Hidden Markov Model*) :
il classe le marché en **régimes** (calme, normal, agité…) à partir des rendements passés, et le robot
investit moins quand le marché est agité. **La vidéo ne montre aucun résultat chiffré** : on teste
l'idée nous-mêmes, avec nos règles.

**Règle testée :** la v3 (v2 + budget de risque + zone tampon) à l'identique, avec **une seule
différence** : un filtre de régime, actif par actif.

1. Pour chaque actif, un HMM gaussien à **3 régimes** apprend, sur les rendements quotidiens des
   **504 derniers jours** (2 ans, comme dans la vidéo), trois « humeurs » de cet actif (chacune avec
   son rendement moyen et son agitation) et la probabilité de passer de l'une à l'autre.
2. Il est **réappris tous les 126 jours de bourse** (6 mois, la fenêtre « hors échantillon » de la
   vidéo), uniquement avec le passé (*walk-forward*). Tant qu'un actif n'a pas 504 rendements : pas de filtre.
3. Les régimes sont rangés par agitation : **calme, normal, agité**. La vidéo les range par rendement
   moyen ; on range par agitation, plus stable, car c'est ce qu'un HMM reconnaît vraiment sur des
   rendements quotidiens (la vidéo le dit elle-même : « un classificateur d'agitation »).
4. Chaque soir, le régime est calculé avec l'**algorithme « forward » seulement** : les probabilités
   n'utilisent que les prix connus ce soir-là. (La vidéo insiste à raison : la fonction habituelle
   `predict` lit toute la série, donc le futur.)
5. **Filtre de stabilité (vidéo)** : le robot ne change de régime que si le nouveau est le plus
   probable **3 jours de suite**.
6. **Allocation (vidéo, sans levier)** : en régime **agité**, la note de tendance de l'actif est
   **divisée par 2**, donc sa position aussi. En régime calme ou normal, rien ne change.
7. Le multiplicateur de risque est mesuré, comme toujours, sur la version « normale » testée (ici,
   avec le filtre). Le robot garde donc le même budget de risque (12 % visés) : il le **déplace** des
   périodes agitées vers les périodes calmes. Zone tampon et garde-fous inchangés.

**Ce qu'on ne reprend pas de la vidéo, et pourquoi :**
- le **levier** de 1,25 en marché calme : interdit par ton profil ;
- des décisions toutes les **5 minutes** : une décision par jour ;
- le **choix automatique du nombre de régimes** (de 3 à 7) : un réglage de plus, choisi sur les
  données. On fixe 3 à l'avance, et on vérifie 2 et 4 dans les variantes ;
- « faire des allers-retours avec Claude Code jusqu'à ce que la stratégie marche » : c'est exactement
  le surapprentissage que notre méthode interdit.

**Ce qu'on attend honnêtement (écrit avant les tests) :**
- **Un effet probablement faible.** La v3 réduit déjà chaque position quand son actif s'agite
  (agitation mesurée sur 35 jours). Le HMM dit en partie la même chose, et EXP-003 a montré que deux
  signaux qui disent la même chose n'apportent rien.
- Ce qu'il pourrait apporter : une réaction plus nette à une rupture brutale (krach), et un peu plus
  de risque pris dans les périodes calmes grâce au multiplicateur.
- Risques : le filtre de 3 jours retarde la réaction ; un peu plus d'échanges ; des régimes mal
  appris sur seulement 2 ans ; et c'est la 7e expérience sur le même passé.

**Hypothèse :** le filtre de régime améliore la note rendement/risque de la v3 d'au moins 10 %, sans
lui faire perdre plus de 0,3 point de rendement par an, et réussit tous les critères de robustesse.

**Critères de réussite (fixés avant les tests) :**

*Mieux que la v3 (la base officielle), comparaison dans le même lancement, sur les mêmes données :*

| # | Réussi si… |
|---|---|
| M1 | Note rendement/risque **au moins 10 % meilleure** que celle de la v3 |
| M2 | Rendement annuel **au plus 0,3 point en dessous** de celui de la v3 |

Pourquoi ces critères diffèrent d'EXP-005 et EXP-006 : la promesse de la vidéo n'est pas plus de
rendement, mais de **meilleures chutes pour le même rendement** (protéger le capital). 10 % de mieux,
c'est par exemple une pire chute de -10,6 % au lieu de -11,7 %, au même rendement.

*Performance et robustesse, mêmes seuils qu'EXP-002 :*

| # | Réussi si… |
|---|---|
| P1 | Pire chute meilleure que **-20 %** |
| P2 | Rendement annuel d'au moins **6 %** |
| P3 | Note rendement/risque meilleure que les 4 points de comparaison |
| R1 | 10 variantes : 2 régimes ; 4 régimes ; sans filtre de stabilité (on agit dès le 1er jour) ; stabilité de 5 jours ; tout en cash en régime agité (x0) ; réduction légère (x0,75) ; apprentissage sur 1 an (252 jours) ; sur 4 ans (1 008 jours) ; réapprentissage chaque mois (21 jours) ; version « probabilités » (note x (1 - 0,5 x probabilité du régime agité), sans filtre de stabilité). Chaque variante : rendement d'au moins 4 %, pire chute meilleure que -25 %, note rendement/risque à ±30 % de la base |
| R2 | Sous-périodes 2007-2012, 2013-2019, 2020-2026 : rendement positif dans les 3, note meilleure que le 60/40 dans au moins 2 |
| R3 | Frais x3 : perte de moins de 1,5 point par an, pire chute meilleure que -20 % |
| R4 | Sans la crypto : pire chute meilleure que -20 %, rendement d'au moins 5 %, note meilleure que le 60/40 |
| R5 | Hasard (500 tirages) : pour chaque actif, note de tendance **et** régime décalés ensemble au hasard dans le temps, multiplicateur et zone tampon recalculés. Note meilleure que 95 % des tirages |

*Pour information seulement (pas des critères) :* temps passé dans chaque régime, nombre de
changements de régime par an, frais, montant échangé, part investie et Sharpe, comparés à la v3.

**Verdict prévu :** « v3 + régimes » remplace la v3 comme base à battre seulement si **les 10
critères** sont réussis. Sinon, la v3 reste la base, le code est gardé mais désactivé
(`regime=None`), et l'échec est noté ici.
