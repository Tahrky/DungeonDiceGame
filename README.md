# Dungeon Dice

## Multijoueur avec Ably et Vercel

Le prototype utilise Ably Realtime pour les salles, la présence des joueurs et la synchronisation des tours. Vercel fournit `/api/ably-token`, qui échange la clé secrète Ably contre un jeton limité au canal de la salle.

### Configuration

1. Dans le tableau de bord Ably, ouvrez votre application et copiez une clé API depuis **API Keys**.
2. Dans Vercel, ouvrez le projet, puis **Settings → Environment Variables**. Ajoutez `ABLY_API_KEY` avec la clé Ably comme valeur et activez les environnements nécessaires. Ne préfixez pas cette variable par `VITE_`.
3. Redéployez le projet pour que la fonction Vercel puisse lire cette variable.
4. En local, créez un fichier `.env.local` à la racine contenant `ABLY_API_KEY=...` (ne le commitez jamais), puis lancez `npm run dev`. Vite sert aussi la fonction `/api/ably-token` pendant le développement.

### Lancer une partie

1. Ouvrez l’application dans deux navigateurs ou profils distincts.
2. Dans le premier, choisissez **Créer ou rejoindre une salle**, puis partagez le code affiché.
3. Dans le second, choisissez le même bouton et entrez le code reçu.
4. La partie démarre automatiquement lorsque les deux joueurs sont connectés. Chaque joueur joue son tour depuis son propre navigateur.

Chaque joueur utilise le deck sauvegardé sur son appareil, ou le deck par défaut.

## Sprites animés

Les spritesheets peuvent être organisées en grille (comme le golem) ou sur une seule ligne (comme le chevalier). Chaque frame doit avoir les dimensions indiquées par `frameWidth` et `frameHeight` dans `src/data/monsterSprites.ts` (180 × 180 actuellement). Le jeu détecte automatiquement le nombre de frames dans chaque image à partir de la texture chargée; il n’est pas nécessaire de le renseigner dans la configuration. Le nombre de frames peut donc varier selon l’action.

Pour enregistrer un monstre ou une action, il faut toutefois ajouter ses chemins de fichiers et sa fréquence d’animation dans `MONSTER_SPRITES`. Les fichiers sont actuellement fournis dans les quatre orientations (`000`, `090`, `180`, `270`) avec la convention de nommage de `directionalFiles`.

### Limites du prototype

L’hôte conserve et calcule l’état de la partie, puis le diffuse à l’adversaire. Cela permet de tester le multijoueur, mais ce n’est pas une protection contre la triche : l’état et les coups ne sont pas validés par un serveur de jeu. La partie ne peut pas être reprise si l’hôte se déconnecte. Pour une version de production, ajoutez l’authentification des joueurs, une validation serveur des actions et un stockage persistant.
