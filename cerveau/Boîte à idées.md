Ta note à toi : écris ici tes idées, questions ou vidéos vues, depuis Obsidian.
Claude la lit au début de chaque session, répond sous chaque idée, et la transforme en
expérience si elle vaut le coup (avec la [[Méthode — critères avant les tests]]).

Retour au point de départ : [[Accueil]].

## Idées

- (exemple) Tester un filtre de panique avec le VIX. → Reporté : EXP-005 porte finalement sur le budget de risque.
- (26/09/2026) Vidéo YouTube : un robot à « régimes de marché » construit avec Claude Code (cerveau HMM,
  allocation selon le régime, coupe-circuits, courtier Alpaca, tableau de bord). → Analysée ci-dessous ;
  le cerveau devient [[EXP-007 — Régimes de marché]].

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
  [[EXP-007 — Régimes de marché]], avec critères fixés avant, comme toujours ;
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
réduites ou fermées). Ce serait une expérience à part (EXP-008). Je m'attends plutôt à ce qu'ils
coûtent : après une journée de krach, ils font souvent vendre au plus bas.
