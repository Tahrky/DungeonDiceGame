# Documentation technique

## Présentation

Dungeon Dice est une application web de jeu tactique au tour par tour. L’interface de menus est
construite avec React et la partie est rendue par Phaser. Le projet est écrit en TypeScript et
utilise Vite pour le développement et la compilation.

| Domaine                      | Technologies     |
| ---------------------------- | ---------------- |
| Interface et menus           | React, React DOM |
| Moteur de jeu et rendu       | Phaser           |
| Langage                      | TypeScript       |
| Développement et compilation | Vite             |
| Multijoueur temps réel       | Ably Realtime    |
| Fonction HTTP de jetons      | Vercel Functions |
| Tests                        | Vitest           |

## Prérequis et commandes

Installer les dépendances depuis la racine du dépôt :

```sh
npm ci
```

Commandes disponibles :

```sh
npm run dev       # Démarre Vite et l’API Ably locale
npm run build     # Vérifie les types avec tsc, puis compile l’application
npm run preview   # Sert localement le résultat compilé
npm test          # Exécute les tests Vitest une fois
```

Le projet n’impose pas de script lint dans `package.json`. Les fichiers applicatifs sont inclus
dans la vérification TypeScript déclenchée par la compilation.

## Organisation du code

```text
api/
  ably-token.ts             Validation des demandes et création de jetons Ably
src/
  App.tsx                   Navigation entre menus, initialisation Phaser et connexion Ably
  components/               Menus React, éditeur de deck et écrans de configuration
  data/                      Définitions des monstres, dés, motifs et sprites
  game/                      Règles et fonctions de domaine indépendantes du rendu
  scenes/                    État de partie, actions, IA et orchestration Phaser
    game/                    Plateau, HUD, infobulles et vues des sprites
  types/GameTypes.ts         Types partagés du domaine et du protocole en ligne
tests/                       Tests unitaires Vitest des règles de domaine
```

### Démarrage et rendu

`src/main.tsx` monte `App` dans l’élément HTML `#app`. `App` initialise une instance Phaser et
gère la navigation entre les menus React et l’écran de jeu. La scène `GameScene` est chargée avec
un `GameSetup` contenant le mode, les decks, la configuration et le plateau.

La logique de scène est organisée en héritage : `GameSceneState` porte l’état et le rendu général,
puis les classes `GameSceneInvocation`, `GameSceneCombat`, `GameSceneMovement` et
`GameSceneComputer` ajoutent les actions correspondantes. `GameScene` relie ces mécanismes aux
événements d’entrée, aux vues Phaser et aux événements réseau. Les vues du plateau, du HUD, des
sprites et des infobulles sont isolées dans `src/scenes/game/`.
Le plateau et le HUD s’affichent avant le chargement des images : un indicateur bloque les actions
pendant le chargement des sprites d’attente des monstres des decks. Les autres animations sont
chargées ensuite en arrière-plan. Les feuilles identiques entre équipes ne sont chargées qu’une
fois.

Les règles réutilisables sont dans `src/game/` : elles calculent les placements, les mouvements,
les attaques, les ressources de dés, les plateaux, les decks et la configuration sans dépendre de
l’interface. Les définitions de contenu se trouvent dans `src/data/`.

## Cycle d’une partie

1. `App` sélectionne le mode (`computer`, `local` ou `online`), les decks et la configuration.
2. `GameSceneState.init` valide les données reçues, initialise le plateau et remet l’état à zéro.
3. Le joueur lance les dés configurés. Chaque dé standard possède trois faces Invocation, deux
   Attaque et une Déplacement. Les résultats disponibles peuvent être dépensés ou stockés dans la
   réserve du joueur.
4. Les symboles Invocation permettent de choisir un monstre de son deck et de le placer selon un
   motif. Le placement doit respecter les cases occupées, les obstacles et la continuité du
   territoire.
5. Les actions Attaque et Déplacement dépensent les symboles correspondants et sont limitées par
   les caractéristiques et les usages restants des monstres.
6. La fin du tour stocke les dés encore disponibles, passe la main, réinitialise les usages des
   monstres concernés et réduit leurs délais de recharge.

Les attaques décrivent leur coût, leurs dégâts, leur portée et leur forme dans les données des
monstres. Les règles prennent aussi en charge les attaques de zone, les effets de soin ou de
réduction de recharge, les dégâts de dos et les contraintes de ligne de vue lorsque le type
d’attaque l’exige.

La victoire est déclarée lorsque les points de vie d’un joueur atteignent zéro, ou lorsque celui-ci
a invoqué le nombre maximal de monstres configuré et n’a plus de monstre vivant tandis que
l’adversaire en possède encore.

## Données et configuration locale

Les valeurs de jeu sont validées lors du chargement, en particulier les decks, les configurations
de monstres, les configurations de partie et les définitions de plateau.

| Donnée        | Stockage navigateur          | Détail                                  |
| ------------- | ---------------------------- | --------------------------------------- |
| Deck          | `dungeon-dice.deck`          | Cinq identifiants de monstres distincts |
| Configuration | `dungeon-dice.configuration` | Configuration versionnée (`version: 1`) |

Si une valeur locale est absente, illisible ou invalide, le jeu utilise le deck ou la configuration
par défaut. La configuration détermine notamment le nombre de dés, les points de vie de départ,
la limite d’invocations, les monstres et le choix du plateau. Les plateaux prédéfinis et la
validation des définitions sont dans `src/game/boards.ts`.

Pour ajouter ou modifier du contenu :

- **Monstres et attaques** : modifier `src/data/monsters.ts` en respectant les types du domaine.
  Le champ optionnel `animation` d’une attaque accepte `attack`, `alternativeAttack1`, `alternativeAttack2` ou `backstab`;
  s’il est absent, l’animation `attack` est utilisée. Ces noms correspondent aux clés de
  `MONSTER_SPRITES` dans `src/data/monsterSprites.ts`.
- **Dés** : modifier `src/data/dice.ts` et garder les symboles synchronisés avec
  `DiceSymbol` dans `src/types/GameTypes.ts`.
- **Motifs d’invocation** : modifier `src/data/placementPatterns.ts`.
- **Plateaux prédéfinis** : modifier les définitions dans `src/game/boards.ts`.
- **Animations** : associer les ressources et paramètres du monstre dans
  `src/data/monsterSprites.ts`. Chaque animation utilise une feuille partagée entre les joueurs;
  un glow rouge ou bleu est généré par Phaser uniquement pour les monstres déployés. Les aperçus
  restent sans contour. Les feuilles du Prêtre sont dans `public/sprites/priest/`. Les dimensions et
  conventions des sprites sont également décrites dans le README.

## Multijoueur en ligne

Le client crée une salle identifiée par un code de huit caractères et rejoint le canal Ably
`dungeon-dice:room:<code>`. La présence Ably communique le rôle et le deck de chaque joueur.
Lorsque les deux joueurs sont présents, l’hôte envoie l’événement `start`, qui contient les decks,
le plateau et la configuration.

L’hôte conserve l’état de jeu faisant autorité et publie des instantanés sous `game-state`.
L’invité envoie ses intentions sous `game-command` ; l’hôte les traite puis diffuse l’état mis à
jour. Les événements Phaser font le lien entre la scène et la connexion temps réel. Les types des
commandes et instantanés sont définis dans `src/types/GameTypes.ts`, avec leurs vérifications de
forme dans `src/scenes/GameSceneProtocol.ts`.

### API de jetons

`GET /api/ably-token?roomCode=<code>` est implémenté par `api/ably-token.ts`. La fonction vérifie
la méthode et le format du code, puis demande à Ably un jeton limité au canal de cette salle,
autorisé à publier, s’abonner et utiliser la présence. La clé secrète n’est utilisée que côté
serveur via `ABLY_API_KEY` ; elle ne doit pas être exposée dans une variable `VITE_*`.

En développement, le plugin de `vite.config.ts` sert cette même fonction sur le serveur Vite et
charge `ABLY_API_KEY` depuis `.env.local`. Créer ce fichier à la racine pour le développement
local, sans le commiter. En production, définir `ABLY_API_KEY` dans les variables d’environnement
du projet Vercel et redéployer afin que la fonction `/api/ably-token` puisse y accéder.

### Limites actuelles

Le mode en ligne est un prototype : il n’y a ni authentification de joueurs, ni persistance de
partie, ni reprise après déconnexion de l’hôte. Même si l’hôte calcule et diffuse l’état, le serveur
ne valide pas indépendamment les règles et les actions. Ce modèle ne constitue donc pas une
protection anti-triche pour une version de production.

## Tests

Les tests Vitest présents dans `tests/` couvrent les règles de placement, les actions et profils de
monstres, les conditions de victoire, la configuration, les ressources de dés, les decks et les
plateaux. Lancer l’ensemble avec `npm test`. La commande `npm run build` valide également la
compilation TypeScript de l’application, de l’API et des tests.

## Simulation et réglage hors ligne des bots

Le simulateur reproductible s’exécute sans interface :

```sh
npm run simulate -- --games 20 --seed 731 --profile1 tracker --profile2 defensive --light-results
```

Le réglage hors ligne explore les multiplicateurs des heuristiques de combat, d’économie, de
placement et de déplacement. Il ne modifie ni les règles ni les options légales. Le score vaut une
victoire = 1, une nulle = 0,5 et une défaite = 0; les rapports incluent aussi les métriques
diagnostiques par profil et adversaire, l’intervalle de confiance et la différence appariée.
L’optimisation utilise les seeds d’entraînement, le choix du meilleur candidat se fait sur des seeds
de sélection distinctes, et la comparaison finale se fait sur un troisième lot de validation.
Chaque partition est reproductible et leurs paires de seeds ne se chevauchent pas.

Exemple avec un budget réduit :

```sh
npm run simulate -- --train-bots --seed 731 --max-turns 10 --training-seeds 3 --selection-seeds 3 --validation-seeds 3 --generations 2 --population 3
```

Par défaut, tous les profils sont évalués séparément contre les six autres profils, avec les deux
ordres de départ. `--training-profiles balanced,tracker` limite l’expérience. Les modes sont :

- `--training-mode default` : part des poids neutres immuables;
- `--training-mode warmStart --previous-weights <fichier>` : part des poids précédents;
- `--training-mode hybrid --previous-weights <fichier>` : compare poids neutres, poids précédents
  et mutations (population minimale de cinq).

Les rapports versionnés conservent les empreintes des règles, dés, conversions, monstres, motifs et
géométrie du plateau, ainsi que les versions du moteur, de l’évaluation et du schéma des poids.
Une incompatibilité moteur/schéma bloque le transfert, sauf autorisation explicite avec
`--allow-incompatible-transfer`. Les empreintes partielles ciblent les groupes concernés; on peut
limiter ou remplacer les groupes avec `--training-groups combat,economy,placement,movement`.
Les configurations JSON enveloppées `{ "configuration": ..., "board": ... }` sont acceptées pour
entraîner et simuler avec le même plateau. Les sorties par défaut ont un nom unique; `--output`
refuse d’écraser un fichier existant.

Le rapport contient les seeds, candidats initiaux et leur origine, adversaires, comparaisons avant
et après, résultats par matchup et poids retenus. Les poids par défaut ne sont jamais modifiés.
Pour tester explicitement un rapport dans une simulation :

```sh
npm run simulate -- --games 20 --seed 9001 --profile1 tracker --profile2 defensive --strategy-weights simulation-results/bot-training.json
```

Les poids ne sont à adopter que si le candidat améliore aussi la validation et ne dégrade pas
sensiblement les profils concernés; les petits échantillons, notamment ceux riches en nulles, ne
suffisent pas à établir un progrès. `--record-decisions` ajoute aux résultats légers un journal
compact des options d’attaque examinées, de leurs caractéristiques observables, de leurs scores et
du choix. Cette instrumentation est désactivée par défaut.

Lorsqu’une règle, une donnée de gameplay ou une méthode d’évaluation change, incrémenter la
constante de version correspondante dans `src/simulation/trainingVersioning.ts`. Les éléments
cosmétiques des monstres et l’identifiant du plateau sont volontairement exclus des empreintes.

### Analyse des routes et coordination défensive

`src/game/routeAnalysis.ts` analyse les routes potentielles sur la grille, leurs alternatives proches
et leurs cases critiques. Cette analyse sert au score de blocage, au placement et à l’évaluation
stratégique; elle ne remplace pas le déplacement légal. Les déplacements continuent d’utiliser les
helpers partagés de `src/game/monsterActions.ts` dans le jeu et dans le simulateur. En jeu, les
obstacles actifs de la scène sont fournis à l’analyse; le simulateur utilise les cases bloquées de
son plateau, puisqu’il ne simule pas la création d’obstacles de scène.

La tactique défensive distribue des cibles de périmètre distinctes selon les approches ouvertes et
réévalue les rôles après chaque déplacement simulé. Les nouveaux multiplicateurs de route et de
coordination sont stockés dans le schéma de poids version 2. Les anciens poids manquants sont
complétés par la valeur neutre; toutefois, un changement de version d’évaluation ou de simulateur
rend un ancien rapport incompatible pour le transfert d’entraînement sans autorisation explicite.

### Recherche tactique

La recherche tactique distingue explicitement trois réglages :

- `searchDepth` compte les phases complètes explorées : une profondeur de 1 compare l’action
  immédiate puis une réponse adverse, une profondeur de 2 ajoute une phase complète suivante ;
- `branchWidth` limite le nombre d’actions conservées à chaque niveau ;
- `nodeBudget` borne le nombre total de nœuds évalués.

Le mode `--advanced` utilise par défaut une profondeur de 2, une largeur de 8 et un budget de 600.
Les options `--search-depth`, `--branch-width` et `--node-budget` permettent des configurations
bornées de 1 à 3 phases, 1 à 12 branches et 20 à 10 000 nœuds. Les statistiques enregistrées
incluent les décisions recherchées, les changements de choix, les nœuds explorés, la profondeur
atteinte et les branches situées au-delà des trois premières.

### Performances du simulateur

Le CLI et l’évaluation des stratégies utilisent un pool réutilisable de quatre workers Node au
maximum, limité au nombre de cœurs disponibles moins un. Les lots couvrent des indices de matchs
contigus; leurs résultats sont fusionnés dans l’ordre global afin de préserver les identifiants,
les seeds et les statistiques. `--cross-profile --games N` répartit **N matchs au total** entre
les 42 confrontations orientées; par exemple, 420 matchs en exécutent 10 par confrontation.

Mesure comparative sur Node 21.7.1, Windows, seed `4286584113`, 420 matchs, 30 tours maximum,
plateau `wide-arena`, configuration historique migrée en v8, historique complet et traces de
décisions activées; la recherche avancée était désactivée. Le temps affiché exclut la sérialisation
et l’écriture du JSON.

| Version | Temps des exécutions | Médiane | Gain |
| --- | --- | --- | --- |
| Avant optimisation, séquentielle | 554,0 s / 551,1 s / 553,2 s (3 exécutions) | 553,2 s | — |
| Après optimisation, workers | 211 s / 224 s (2 exécutions) | 217,5 s | 2,54× |

Les deux exécutions optimisées ont produit les mêmes résultats : 214 victoires J1, 199 victoires
J2, 7 nulles et 14,65 tours en moyenne. Le JSON complet, avec historique et traces, pesait 69,1 MB.
La mesure après optimisation ne comporte que deux répétitions; le gain est donc indicatif, même si
chacune des deux exécutions dépasse le seuil de 2×.

Pour reproduire la configuration, `--config` accepte un export contenant
`{ "configuration": ..., "board": ... }` :

```sh
npm run simulate -- --games 420 --seed 4286584113 --max-turns 30 --profile1 cheap --profile2 offensive --cross-profile --record-decisions --config configuration-et-plateau.json
```
