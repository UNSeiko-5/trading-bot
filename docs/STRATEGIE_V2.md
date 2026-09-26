# Stratégie v2 : suivi de tendance multi-actifs, piloté par le risque

> Spécification écrite **avant** d'écrire le code et avant de voir le moindre résultat.
> Toute modification ultérieure passe par une nouvelle expérience (voir `EXPERIENCES.md`).

Date : 25/09/2026 · Expérience : **EXP-002**

---

## 1. Le cadre (issu du questionnaire)

| | |
|---|---|
| Pays | France (UE) |
| Capital prévu en réel | 2 000 à 10 000 € |
| Pire chute acceptable | **-25 %** |
| Objectif | Très bon rendement avec un risque limité |
| Marchés acceptés | ETF, crypto, actions individuelles (pas de contrats à terme) |
| Levier | Aucun (décision : inutile avec une limite de -25 %) |
| Pari à la baisse | Non |
| Fréquence | Une décision par jour, après la clôture de New York |
| Rôle | Robot autonome, surveillance par alertes |
| Budget outils | 0 € |

**Écarté pour l'instant : les actions individuelles.** Des données sans biais de survie
(les sociétés disparues incluses) sont payantes, et un capital de 2 000 à 10 000 € ne permet
pas de détenir 30 actions ou plus. Les ETF donnent la même exposition, en mieux diversifié.

## 2. Le principe

La méthode des fonds de gestion systématique (« CTA ») : suivre les tendances sur de
nombreux marchés peu liés entre eux, en dosant chaque position selon son risque.
Références : Moskowitz, Ooi, Pedersen (2012) *Time Series Momentum* ; Hurst, Ooi,
Pedersen (2017) *A Century of Evidence on Trend-Following* ; R. Carver (2015)
*Systematic Trading*, dont sont tirés les calculs ci-dessous.

Chaque soir, pour chaque actif : **la tendance est-elle haussière, et à quel point ?**
Plus elle est forte, plus on investit, dans la limite du risque autorisé. Tendance
baissière : cet actif passe en cash.

## 3. Le panier d'actifs

On utilise pour la recherche des ETF américains, avec un long historique gratuit.
En réel (France), ils seront remplacés par leurs équivalents européens « UCITS »
qui suivent les mêmes indices.

| Classe | Actif | Symbole (recherche) | Données depuis |
|---|---|---|---|
| Actions | États-Unis (S&P 500) | SPY | 1993 |
| Actions | Pays développés hors US | EFA | 2001 |
| Actions | Pays émergents | EEM | 2003 |
| Obligations | État US 7-10 ans | IEF | 2002 |
| Obligations | État US 20 ans et plus | TLT | 2002 |
| Or | Or | GLD | 2004 |
| Matières premières | Panier diversifié | DBC | 2006 |
| Immobilier | Sociétés immobilières US | VNQ | 2004 |
| Crypto | Bitcoin | BTC-USD | 2014 |
| Crypto | Ethereum | ETH-USD | 2017 |

**Budget de risque :** chacune des 6 classes reçoit la même part du risque (1/6), partagée
à égalité entre les actifs de la classe. C'est un choix fait **a priori, sans optimisation**.
Un actif n'entre dans le calcul qu'après 300 jours de données. Tant qu'une classe n'existe
pas encore (la crypto avant 2014), son budget est réparti entre les autres.

## 4. Les signaux de tendance

Pour chaque actif, **3 détecteurs** comparent une moyenne « rapide » et une moyenne « lente »
du prix. Ce sont des moyennes exponentielles, qui donnent plus de poids aux jours récents.

| Détecteur | Moyenne rapide | Moyenne lente | Horizon | Facteur d'échelle |
|---|---|---|---|---|
| Rapide | 16 jours | 64 jours | environ 1 à 2 mois | 3,75 |
| Moyen | 32 jours | 128 jours | environ 3 à 4 mois | 2,65 |
| Lent | 64 jours | 256 jours | environ 6 à 12 mois | 1,87 |

Calcul pour chaque détecteur :

1. `écart = moyenne rapide - moyenne lente`
2. On divise par l'agitation récente du prix (écart-type des variations quotidiennes en
   dollars, moyenne exponentielle sur 35 jours). Une même hausse de 5 $ n'a pas le même sens
   sur un actif calme et sur un actif agité.
3. On multiplie par le facteur d'échelle, pour que la note moyenne vaille environ 10.
   Ce sont les valeurs publiées par R. Carver : **elles ne sont pas ajustées sur nos données**.
4. On borne la note entre -20 et +20.

**Note combinée** = moyenne des 3 notes, puis bornée entre **0 et 20**. Une note négative
devient 0 (cash), puisqu'on ne parie pas à la baisse. Une note de 10 correspond à une
tendance haussière « normale », 20 à une tendance très forte.

## 5. La taille des positions

Pour chaque actif *i*, la part du capital visée est :

```
part_i = VOL_CIBLE × IDM × budget_i × (note_i / 10) / volatilité_i
```

| Élément | Signification | Valeur |
|---|---|---|
| `VOL_CIBLE` | Agitation annuelle visée pour tout le portefeuille | **12 %** |
| `IDM` | Bonus de diversification : plus les actifs sont peu liés, plus on peut investir sans ajouter de risque | Calculé chaque jour à partir des corrélations des 2 dernières années, borné entre 1 et 2,5 |
| `budget_i` | Part du risque attribuée à l'actif (section 3) | 1/6 par classe |
| `note_i` | Force de la tendance (section 4) | 0 à 20 |
| `volatilité_i` | Agitation annuelle récente de l'actif (moyenne exponentielle sur 35 jours) | Calculée chaque jour |

Formule de l'IDM : `1 / racine(b' × C × b)`, où `b` est le vecteur des budgets et `C` la
matrice des corrélations des rendements quotidiens, avec les corrélations négatives
ramenées à 0.

**Effet voulu :** quand peu d'actifs sont en tendance, le robot investit moins et garde du
cash. Il ne concentre pas tout sur les rares actifs qui montent.

## 6. Les garde-fous

**Dans la stratégie** (appliqués aussi dans le backtest) :

| Règle | Valeur |
|---|---|
| Part maximale par actif | 25 % du capital |
| Part maximale en crypto (total) | 15 % du capital |
| Total investi | 100 % au maximum (pas de levier). Au-delà, toutes les parts sont réduites dans la même proportion |
| Seuil de transaction | On ne bouge une position que si l'écart avec la cible dépasse **2 % du capital**, ou si la cible tombe à 0. Ça évite de payer des frais pour des ajustements minuscules |

**Dans le robot uniquement** (filet de sécurité en cas de situation jamais vue) :

| Règle | Action |
|---|---|
| Données douteuses sur un actif | Aucun ordre sur cet actif, alerte |
| Perte de plus de 5 % en une journée | Alerte |
| Compte à -20 % de son plus haut | Le robot n'achète plus rien et te prévient |
| Compte à -25 % de son plus haut | Le robot vend tout, s'arrête, et attend ton redémarrage manuel |
| Veto final : le plan d'ordres dépasserait une limite (plus de 25 % sur un actif, plus de 15 % en crypto, plus de 100 % investi, achats plus grands que le cash, vente à découvert, achat pendant un arrêt), avec 2 points de marge | Aucun ordre, alerte (c'est presque sûrement un bug) |

Ces seuils ne doivent **jamais** se déclencher dans le backtest : c'est l'un des critères
de réussite (pire chute meilleure que -20 %).

Le veto final (idée de la vidéo de la boîte à idées, 26/09/2026) revérifie le plan sans réutiliser les
calculs de la stratégie : si un bug lui faisait viser 60 % de Bitcoin, aucun ordre ne partirait.
`krachs_simules.py` mesure en plus ce que coûterait un krach soudain de type 1987 (pour information).

## 7. Exécution et coûts

- Décision chaque soir avec les prix de clôture, exécution à l'**ouverture suivante**.
- Coûts supposés par transaction (écart achat/vente, glissement et commission) :
  **ETF 0,10 %**, **crypto 0,50 %**.
- Le cash non investi ne rapporte rien dans le backtest (hypothèse prudente).

## 8. Données et calendrier

- Source : Yahoo Finance (gratuite), prix ajustés des dividendes.
- Calendrier commun : les jours de bourse américains. Le mouvement du week-end de la crypto
  est compté dans le rendement du lundi.
- Les mêmes contrôles de qualité que la v1 (données à jour, complètes, sans saut aberrant)
  sont appliqués actif par actif.

## 9. Points de comparaison

| Référence | Rôle |
|---|---|
| Acheter et garder SPY | Le marché actions américain |
| 60/40 (60 % SPY, 40 % IEF, rééquilibré chaque mois) | Le portefeuille classique d'un épargnant |
| v1 (règle des 200 jours sur SPY) | Notre version actuelle, qu'il faut battre |
| Même panier « toujours investi » (même dosage par le risque, sans les signaux) | Mesure ce qu'apportent vraiment les signaux de tendance |

**Note rendement/risque** = rendement annuel ÷ |pire chute|. Plus elle est haute, mieux
on est payé pour le risque pris.

## 10. Limites connues (honnêteté)

- **Biais du recul sur la crypto.** On sait aujourd'hui que le Bitcoin a été multiplié
  par des centaines depuis 2014, et ce boom ne se reproduira pas forcément. La stratégie doit
  donc réussir **aussi sans la crypto** (critère R4).
- **Choix du panier.** Ces ETF existent encore aujourd'hui, et on les a choisis en le
  sachant. Le biais est faible, car ce sont des indices très larges, mais il existe.
- **Crypto « à l'ouverture ».** L'ouverture Yahoo de la crypto (minuit UTC) tombe environ
  1h30 après notre décision. L'approximation est négligeable pour des signaux lents, et
  couverte par des frais crypto élevés.
- **ETF américains et ETF européens.** En réel, on tradera des équivalents européens :
  même indice, mais une autre devise et d'autres frais. L'écart sera mesuré à l'étape 10.
- **Frais fixes en réel.** Chez Interactive Brokers, une commission minimale par ordre pèse
  lourd sur de petits montants. Elle sera modélisée avant tout passage au réel.

## 11. Organisation du code

```text
trading-bot/
├── robot/                  # le cœur de la v2
│   ├── parametres.py       # toutes les valeurs de ce document, à un seul endroit
│   ├── univers.py          # le panier d'actifs et les budgets de risque
│   ├── donnees.py          # téléchargement, alignement, contrôles de qualité
│   ├── signaux.py          # les 3 détecteurs et la note combinée
│   ├── portefeuille.py     # taille des positions, IDM, garde-fous
│   └── simulation.py       # backtest multi-actifs avec seuil de transaction et points de comparaison
├── backtest_v2.py          # lance la simulation et affiche les résultats
├── robustesse_v2.py        # lance les tests anti-chance de EXP-002
└── tests/                  # un fichier de tests par module
```

La v1 (`bot.py`, `strategie.py`…) continue de tourner jusqu'à ce que la v2 soit validée
puis branchée au robot (étape 7).
