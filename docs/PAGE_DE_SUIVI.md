# Page de suivi en direct du robot v3 — installation pas à pas

La page montre en direct ton compte Alpaca **fictif** : valeur, gains, positions, ordres, graphiques avec flèches
d'achat/vente, sécurités, et chaque soir la décision du robot avec ses raisons. Elle est **en lecture seule** pour
l'instant (les commandes pause / tout vendre / ordres manuels viendront à l'étape 2).

Tout est gratuit. Compte environ 20 minutes. **Ne colle jamais une clé dans le chat ni dans le code** : seulement
dans les réglages de Supabase, Vercel et GitHub, comme indiqué.

## Étape 1 — Supabase (connexion + mémoire du robot)

1. Sur [supabase.com](https://supabase.com), crée un projet (nom : `robot-v3`, région Europe). Note le mot de passe
   de la base quelque part de sûr (il ne servira pas ici).
2. **Ton compte de connexion** : menu *Authentication* > *Users* > *Add user* > *Create new user*. Mets ton e-mail
   et un mot de passe solide, coche *Auto Confirm User*.
3. **Personne d'autre ne peut s'inscrire** : *Authentication* > *Sign In / Providers* (ou *Settings*) >
   décoche **Allow new users to sign up**.
4. **La table du robot** : menu *SQL Editor* > *New query*. Ouvre le fichier `suivi/supabase.sql` du dépôt,
   copie tout, **remplace `TON_EMAIL@exemple.fr` par ton e-mail**, colle, puis *Run*. La dernière ligne doit
   afficher `rapports | true`.
5. **Les clés** : *Project Settings* > *API* (ou *Data API* / *API Keys*). Tu y trouves 3 choses :
   - *Project URL* (ex. `https://abcd.supabase.co`) ;
   - la clé **anon / publishable** (faite pour être publique) ;
   - la clé **service_role / secret** (**TRÈS secrète** : elle passe outre toutes les protections).

## Étape 2 — GitHub (le robot écrit son rapport du soir)

Dépôt `trading-bot` > *Settings* > *Secrets and variables* > *Actions* > *New repository secret*, deux fois :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | la *Project URL* |
| `SUPABASE_SERVICE_KEY` | la clé **service_role / secret** |

Sans ces deux secrets, le robot fonctionne exactement comme avant, simplement sans rapport sur la page.

## Étape 3 — Vercel (la page)

1. Sur [vercel.com](https://vercel.com) : *Add New* > *Project* > importe le dépôt `trading-bot`.
2. **Root Directory** : clique *Edit* et choisis **`suivi`** (important). *Framework Preset* : *Other*.
   Ne change rien d'autre (pas de commande de build).
3. Avant *Deploy*, ouvre *Environment Variables* et ajoute :

| Nom | Valeur |
|---|---|
| `ALPACA_API_KEY` | ta clé API Alpaca **paper** (la même que dans GitHub) |
| `ALPACA_SECRET_KEY` | ta clé secrète Alpaca **paper** |
| `SUPABASE_URL` | la *Project URL* |
| `SUPABASE_ANON_KEY` | la clé **anon / publishable** (PAS la service_role) |
| `ALLOWED_EMAIL` | ton e-mail (le même que dans Supabase et dans `supabase.sql`) |

4. *Deploy*. Vercel te donne une adresse (ex. `https://trading-bot-xxx.vercel.app`) : c'est ta page.
   Mets-la en favori sur ton PC. Connecte-toi avec l'e-mail et le mot de passe de l'étape 1.2.

## Ce que tu dois voir

- Tout de suite : le compte, les positions, les ordres et les graphiques (données Alpaca, rafraîchies toutes les 15 s).
- Après le prochain passage du robot (22h40 UTC en semaine) : la dernière décision, les notes, le régime et le journal.

## Sécurité, en bref

- Chaque demande de la page est vérifiée par Vercel : connexion Supabase valide **et** e-mail = `ALLOWED_EMAIL`.
- La table du robot n'est lisible que par ton e-mail (règle de sécurité dans `supabase.sql`).
- L'adresse Alpaca du compte **fictif** est écrite en dur dans `suivi/api/_commun.js` : la page ne peut pas
  toucher un compte réel sans changer le code.
- Les clés Alpaca et la clé service_role ne quittent jamais Vercel / GitHub ; le navigateur ne les voit pas.

## En cas de problème

| Message sur la page | Cause probable |
|---|---|
| « Configuration incomplète : SUPABASE_URL manquante… » | variable oubliée dans Vercel (étape 3.3), puis *Redeploy* |
| « Connexion refusée : Invalid login credentials » | mauvais e-mail ou mot de passe (étape 1.2) |
| « accès refusé » | `ALLOWED_EMAIL` différent de l'e-mail de connexion |
| « Alpaca a répondu 401/403 » | clés Alpaca fausses ou clés du compte réel au lieu du paper |
| « Journal Supabase : … » | `supabase.sql` pas lancé, ou e-mail non remplacé dedans |
| Journal vide | normal avant le premier passage du robot avec les secrets de l'étape 2 |
