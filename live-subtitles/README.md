# Sous-titres FR en direct (extension Chrome)

Traduit en français, en direct, l'audio de l'onglet courant, sur n'importe quel site.
Statut : **v0.1, niveau 3 (capture audio en direct)**. Non testé avec de vrais fournisseurs.

> Ce dossier est autonome et n'a aucun lien avec l'application « Clap » du dépôt.
> À déplacer dans un dépôt dédié (le dépôt actuel est déployé tel quel sur Vercel).

## Principe

```
onglet --tabCapture--> offscreen (AudioWorklet, PCM 16 kHz, blocs de 50 ms)
  --WebSocket--> Deepgram nova-3 (résultats provisoires)
  --Stabilizer--> préfixe stable --Scheduler--> DeepL / Google --> background --> overlay (iframe de la vidéo)
```

- `lib/stabilizer.js` : traduit le préfixe stable du texte (curseur « waitK »), pas la phrase entière.
- `lib/scheduler.js` : une requête de traduction à la fois, la plus récente gagne, les finaux ne sont jamais perdus.
- Porte de silence : l'audio n'est envoyé que pendant la parole (+1,5 s), ce qui réduit le coût du streaming.
- L'overlay s'attache à la plus grande vidéo en lecture, dans le bon iframe, et gère le plein écran
  (limite : si le site met la balise `<video>` elle-même en plein écran, l'overlay est invisible).

## Installation

1. `chrome://extensions` → activer le mode développeur → « Charger l'extension non empaquetée » → dossier `extension/`.
2. Clic droit sur l'icône → Options : clé Deepgram, langue parlée, DeepL (clé gratuite finissant par `:fx` acceptée) ou Google.
3. Ouvrir une vidéo, cliquer sur l'icône de l'extension (badge **ON** = actif). Recliquer pour arrêter.
   Un seul onglet à la fois.

## Tests

```
npm test        # logique pure : stabilisation et file de traduction
```

Vérifié : 14 tests unitaires, syntaxe des fichiers, rendu de l'overlay (Playwright, API Chrome simulée).
**Non vérifié** (nécessite un vrai navigateur, un micro d'onglet et des clés) : capture audio, Deepgram, DeepL.

## Premiers tests à faire (dans cet ordre)

1. **Décalage image/son.** La capture coupe le son local de l'onglet ; l'extension le rejoue, ce qui peut ajouter
   un retard audio. Test : vidéo de synchro « audio video sync test » avec et sans l'extension.
   Au-delà d'environ 80 ms, plan B : lire l'audio via `video.captureStream()` (ne touche pas à la lecture,
   mais ne fonctionne que si le média n'est pas « tainted » par le CORS).
2. **Latence.** Ouvrir la console du document offscreen (`chrome://extensions` → « Inspecter les vues »).
   Régler « Stabilité » sur 0, 2 et 4 et juger le compromis vitesse/clignotement.
3. **Iframes.** Tester sur un site qui intègre son lecteur dans un iframe.

## Suite prévue

- Niveau 1 : traduire les pistes de sous-titres existantes (`video.textTracks`, `.vtt`/`.srt` détectés) avant lecture → 0 décalage.
- Niveau 2 : récupérer l'audio en avance (médias sans DRM) pour transcrire et traduire par lots.
- Option LLM pour la traduction finale (meilleure qualité, avec contexte).
