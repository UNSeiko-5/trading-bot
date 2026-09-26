L'idée : le marché d'un actif passe par des « humeurs » (calme, normal, agité) qu'on ne voit pas
directement, mais qu'on devine à ses rendements. Un **modèle de Markov caché** (HMM) apprend ces
humeurs sur le passé, avec la probabilité de passer de l'une à l'autre, puis dit chaque soir laquelle
est la plus probable.

- Vient de la vidéo notée dans la [[Boîte à idées]]. Testé dans [[EXP-009 — Régimes de marché]].
- Piège : la fonction habituelle lit toute la série, donc le futur ([[Biais du futur]]).
- Proche de ce que la v3 fait déjà : réduire une position quand son actif s'agite ([[Budget de risque]]).
