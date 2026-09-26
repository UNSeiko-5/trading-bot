Tricher sans le vouloir en utilisant, dans un backtest, une information qu'on n'aurait pas eue ce
jour-là. Le résultat paraît excellent, puis s'effondre en vrai.

- Parade du projet : décision à la clôture, exécution à l'ouverture suivante, et des tests qui
  modifient le futur pour vérifier que le passé ne bouge pas.
- Exemple piège : la fonction `predict` d'un modèle de [[Régimes de marché]] lit toute la série.
  On utilise l'algorithme « forward », qui n'utilise que le passé ([[EXP-007 — Régimes de marché]]).
- Fait partie de la [[Méthode — critères avant les tests]].
