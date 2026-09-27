Ta note à toi : écris ici tes idées, questions ou vidéos vues, depuis Obsidian.
Claude la lit au début de chaque session, répond sous chaque idée, et la transforme en
expérience si elle vaut le coup (avec la [[Méthode — critères avant les tests]]).

Retour au point de départ : [[Accueil]].

## Idées

- (exemple) Tester un filtre de panique avec le VIX. → Reporté : EXP-005 porte finalement sur le budget de risque.
- (26/09/2026) Vidéo YouTube : un robot à « régimes de marché » construit avec Claude Code (cerveau HMM,
  allocation selon le régime, coupe-circuits, courtier Alpaca, tableau de bord). → Analysée ci-dessous ;
  le cerveau devient [[EXP-009 — Régimes de marché]].
- (27/09/2026) Faire 50 % par an. → Irréaliste sans levier (voir la réponse) ; profil changé à -35 % de
  pire chute acceptée : devient [[EXP-010 — Robot offensif]].

## Réponses de Claude

### La vidéo « robot à régimes » (26/09/2026)

Bonne vidéo pour la structure (cerveau, allocation, sécurité, courtier, tableau de bord), mais
attention : **elle ne montre aucun résultat chiffré**, et elle conseille de « faire des allers-retours
avec Claude Code jusqu'à ce que la stratégie marche », c'est-à-dire du [[Surapprentissage]]. Tri :

**Ce qu'on a déjà :**
- courtier Alpaca en argent fictif, au moins 1 mois avant le réel : c'est notre plan ;
- comparaison à « acheter et garder », à la moyenne 200 jours (notre v1) et au hasard ([[Test du hasard]]) ;
- arrêt à -25 % avec redémarrage manuel : c'est le « fichier verrou » de la vidéo (chez nous, la
  variable `ROBOT_V3_DEPART`) ;
- contrôle des corrélations : le bonus de diversification et les budgets par classe d'actifs ;
- alertes : le message Telegram de chaque soir.

**Ce qu'on prend :**
- le **cerveau à régimes** (modèle de Markov caché, [[Régimes de marché]]) : testé dans
  [[EXP-009 — Régimes de marché]], avec critères fixés avant, comme toujours ;
- la règle « jamais la fonction qui lit toute la série » ([[Biais du futur]]) : un test le vérifie ;
- le **veto final** : une sécurité indépendante revérifie le plan d'ordres avant l'envoi ;
- les **krachs simulés** (stress test) : on injecte des krachs de -20 % dans le passé pour voir si la
  limite de -25 % tient ([[Pire chute]]).

**Ce qu'on refuse, et pourquoi :**
- le levier de 1,25 et les décisions toutes les 5 minutes : contraires à ton profil ;
- le choix automatique du nombre de régimes (3 à 7) : un réglage de plus choisi sur les données ;
- l'arrêt à -10 % du sommet : trop serré pour toi. La v3 a déjà fait -11,7 % dans le passé : ce
  verrou l'aurait arrêtée en pleine baisse normale, et fait vendre au plus bas ;
- « risque maximum 1 % par position avec un stop » : notre robot dose par l'agitation, sans stops.

**À décider par toi plus tard :** des coupe-circuits rapides (-2 % ou -3 % en une journée : positions
réduites ou fermées). Ce serait une expérience à part (un prochain numéro libre). Je m'attends plutôt à ce qu'ils
coûtent : après une journée de krach, ils font souvent vendre au plus bas.

**Résultats (26/09/2026, soir) :**
- Cerveau à régimes : **9/10, non validé** ([[EXP-009 — Régimes de marché]]). Même rendement que la v3,
  mais pire chute un peu plus grande (-12,7 % contre -11,7 %). La v3 faisait déjà le travail.
- Krachs simulés : un krach type 1987 le pire soir aurait donné -26,1 % ; avec 3 krachs au hasard en
  20 ans, la limite de -25 % est dépassée dans 5 % des essais
  ([[Leçon — un krach d'une nuit passe sous l'arrêt]]). À garder en tête avant le passage au réel.
- Veto final : en place, il ne bloque rien d'un plan normal (vérifié par les tests).

### 50 % par an ? (27/09/2026)

Honnêtement : non, pas avec ton profil. Le rendement se paie en risque ([[Pire chute]]) : viser 50 %/an
demanderait des chutes de -50 à -70 %. Les meilleurs fonds font 10 à 20 %/an. Les robots qui affichent
50 % sont presque toujours du [[Surapprentissage]], une période chanceuse ou du levier.
Tu as choisi d'accepter **-35 %** sans levier : [[EXP-010 — Robot offensif]] teste un robot qui utilise
ce risque (attendu : +9 à +11 %/an, pas 50 %).

**Résultat (27/09/2026) :** 10/11, non validé. +8,3 %/an au lieu de +7,8 % : le robot était déjà
bloqué par ses plafonds ([[Leçon — les plafonds freinent plus que l'agitation visée]]).
