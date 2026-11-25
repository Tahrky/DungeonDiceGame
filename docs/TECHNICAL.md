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
  App.tsx                   Navigation entre écrans et montage de Phaser
  app/                      Hooks d’application : moteur, salon en ligne, restauration, navigation
  components/               Écrans React
    common/                 Champs, menus, dialogues et garde des modifications non enregistrées
    deck/                   Éditeur de deck et cartes de monstres
    settings/               Réglages de partie et de monstres
    simulation/             Laboratoire : lancement, tableaux, inspecteur de matchs, équilibrage
  data/                     Définitions des monstres, dés, motifs et sprites
  game/                     Règles de domaine indépendantes du rendu
    ai/                     Évaluation stratégique, rôles, menaces et couverture des routes
  persistence/              IndexedDB, sessions de jeu et lots de simulation reprenables
  scenes/                   État de partie, actions, IA et orchestration Phaser
    game/                   Plateau, HUD, infobulles et vues des sprites
  simulation/               Simulateur hors ligne : tour, déploiement, déplacement, résultats
    analysis/               Lecture et agrégation des rapports de simulation
    cli/                    Arguments, fichiers et entraînement en ligne de commande
    combat/                 Choix, exécution et recherche tactique des attaques
    monsterBalance/         Analyse théorique de l’équilibrage des monstres
    training/               Entraînement des poids des bots et versionnement des rapports
  styles/                   Feuilles CSS par zone d’interface, importées par `index.css`
  types/GameTypes.ts        Types partagés du domaine et du protocole en ligne
  utils/                    Utilitaires génériques : maths, tas binaire, erreurs, gardes
tests/                      Tests unitaires Vitest
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
l’interface. Les définitions de contenu se trouvent dans `src/data/`. Le jeu et le simulateur
partagent ces modules :

- `geometry`, `attackZones`, `attackRules`, `movementPaths` : positions, zones d’attaque, ligne de
  vue et chemins de déplacement ;
- `placement` (avec `placementSearchContext` et `patternTransforms`) : recherche des poses légales ;
- `routeAnalysis` (avec `routeGrid`) : distances, routes alternatives et cases critiques ;
- `botStrategy` : façade des profils (`botProfiles`), decks (`botDeck`), déplacements
  (`botMovement`) et poses (`botPlacement`) des bots ;
- `matchRules`, `diceResources`, `gameConfiguration`, `monsterConfiguration` : règles de partie,
  ressources et configuration ;
- `random` : générateurs pseudo-aléatoires reproductibles.

Dans `src/simulation/`, `simulator` enchaîne les tours via `playerTurn`, qui délègue l’invocation à
`deployment` et `summonPlacement`, le déplacement à `movement` et `attackSetupMovement`, et les
attaques à `combat/`. `matchState` porte l’état mutable d’un match et `finalBoard` produit le
plateau final des rapports. Le tour du simulateur produit successivement les `BotAction` de
`botAction` ; `playerTurn` les exécute avant de demander la suivante. Cette interface intermédiaire
utilise encore l’état mutable et n’est pas encore partagée avec la scène.

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
npm run simulate -- --games 20 --seed 731 --profile1 tracker --profile2 defensive
```

Chaque match conserve son historique détaillé; l’interface et la CLI exportent ainsi le même
format de résultats.

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
constante de version correspondante dans `src/simulation/training/versioning.ts`. Les éléments
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

Dans la simulation, chaque pose compare les cases d’invocation légales du motif. Une route
alliée **interdit la pose adverse** sur ses cases, mais **n’interdit pas le déplacement adverse** :
pour garder une entrée, il faut aussi la tenir avec un monstre. Le bot défensif compare l’expansion
à un périmètre latéral, évite d’ouvrir plusieurs entrées près de sa base et peut tenir la dernière
entrée sous pression. Les autres profils donnent moins de poids à cette formation. Face à un
monstre avec bonus de dos, la pose tient aussi compte des cases ouvertes derrière les alliés ;
le déplacement estime le risque à partir de l’orientation **après** le mouvement. Cette estimation
locale n’est pas une garantie contre une future pose adverse ni contre une attaque à distance.

Pour rejoindre une cible, le bot cherche les cases déployées accessibles les plus proches, y compris
sur les routes adverses. Une étape peut l’éloigner à vol d’oiseau si elle raccourcit le trajet
restant. En simulation, les monstres se relaient pour utiliser les dés de déplacement. Dans
l’inspecteur, les **blocages de déplacement** sont cumulés par monstre : plusieurs peuvent survenir
pendant un tour où le joueur a effectivement agi. Les **tours sans action utile** comptent les tours
du joueur sans invocation, attaque ni déplacement.

Pour reproduire le lot de comparaison (mêmes règles et plateau que dans l’export), depuis la
racine du projet sous PowerShell :

```powershell
npm run simulate -- --cross-profile --games 220 --seed 319438822 --max-turns 30 --record-decisions --config "$HOME\Downloads\dungeon-dice-simulations-seed-319438822.json" --output simulation-results\rejeu-319438822.json
```

### Recherche tactique

Tous les modes d’exécution partagent `TACTICAL_SEARCH_CONFIGURATION` dans
`src/simulation/combat/searchState.ts` : profondeur 2, largeur 5 et budget de 250 nœuds. La profondeur 1 évalue
l’action immédiate et une attaque de réponse gloutonne; la profondeur 2 ajoute une attaque de la
phase future et une réponse. `--complete-attack-phases` poursuit gloutonnement les attaques restantes
des deux côtés dans chaque phase simulée. `--broader-attack-candidates` ajoute au top glouton le
meilleur candidat de chaque attaquant, un candidat de kill et celui dont l’état résultant est le
meilleur. Ces options sont désactivées par défaut. `--movement-attack-combos` permet au simulateur
de préférer un déplacement qui améliore le meilleur score d’attaque immédiatement disponible pour
le monstre déplacé; l’attaque est résolue aussitôt après ce déplacement, avant les déplacements
restants. La largeur borne les actions gloutonnes conservées à chaque niveau et le budget borne les
nœuds évalués. `--next-turn-dice-expectation` remplace la réponse fixe d’une attaque par
l’espérance sur les résultats possibles des dés de la réponse du prochain tour; leur distribution
tient compte de la suppression des dés d’invocation lorsque l’armée est complète. Pour borner le
coût, les phases plus éloignées conservent le modèle d’une attaque. Cette option est désactivée par
défaut. `--summon-placement-pairs` évalue les monstres admissibles avec leurs placements possibles
parmi les trois placements les mieux classés par l’heuristique existante, à l’aide de l’évaluation
stratégique de l’état résultant, puis retient la paire la mieux notée. Pour chaque paire, le
simulateur estime aussi la pire attaque de base ou attaque de dos légale et payable immédiatement
ou après un déplacement adverse. Le bot en jeu examine de même les trois poses les mieux classées
pour le monstre choisi. Chaque mode utilise ses propres règles de ciblage et de mouvement,
notamment les obstacles de la scène. L’évaluation applique les effets et recharges du début du
tour adverse, mais ne suppose aucun nouveau lancer de dés ni aucune suite de plusieurs actions.
La garde peut quitter la dernière entrée si son déplacement ne rend pas cette réponse plus
dangereuse ; une victoire immédiate reste prioritaire. En simulation, cette garde est activée avec
`--movement-attack-combos`. Sans ces options, le choix d’invocation et la garde du simulateur
conservent leur comportement historique. La shortlist borne le coût de cette expérience.
Le bot en jeu utilise le même classement des déplacements préparant une attaque que le simulateur,
avec les vérifications de légalité propres à la scène.
Les attaques de score égal sont départagées par identifiant de monstre, index d’attaque, puis
coordonnées de cible (y, x), pour éviter que le résultat dépende de l’ordre des collections.

L’API `runSimulations` accepte `playerOptions` pour activer ou désactiver les deux options par joueur,
afin de comparer un candidat à une référence dans le même match. `measureTurnDurations` ajoute
facultativement `turnDurationsMs` aux résultats : ces mesures non déterministes couvrent
`playPlayerTurn`, sans le début de tour ni le rendu, et ne modifient pas les décisions. Pour une
comparaison appariée, utiliser les mêmes decks et graines, inverser les camps et le premier joueur,
puis réserver d’autres graines à la validation. Le p95 se calcule sur les durées de tour de chaque
version; le débit d’un match mixte ne remplace pas le débit mesuré séparément pour chaque version.
Les tests des matchs 7 et 93 conservent les géométries des fins de tours 28 et 11, reconstituées
à partir des positions finales, des routes et de l’historique exportés. Ils ajoutent des dés de
déplacement et réinitialisent les recharges et orientations : ils vérifient ces positions sans
prétendre reproduire intégralement les tours historiques.

Sur 420 matchs reproductibles (seed `731`, profils `balanced` et `defensive`, plateau et
configuration par défaut), le réglage 5/2/250 a pris 236,8 s contre 283,0 s pour 8/2/600 et
155,0 s pour le réglage historique 3/1/120. Le résultat observé du joueur 1 était respectivement
126, 129 et 117 victoires; ces résultats d’un seul appariement servent à comparer les compromis,
pas à établir une supériorité statistique. Les statistiques enregistrées incluent les décisions
recherchées, les changements de choix, les nœuds explorés et la profondeur atteinte.

### Performances du simulateur

Le CLI et l’évaluation des stratégies utilisent un pool réutilisable de quatre workers Node au
maximum, limité au nombre de cœurs disponibles moins un. Les lots couvrent des indices de matchs
contigus; leurs résultats sont fusionnés dans l’ordre global afin de préserver les identifiants,
les seeds et les statistiques. `--cross-profile --games N` répartit **N matchs au total** entre
les `BOT_PROFILES.length * (BOT_PROFILES.length - 1)` confrontations orientées (110 avec les
11 profils actuels); par exemple, 420 matchs en exécutent 3 ou 4 par confrontation. Le joueur qui
commence alterne selon la paire et la répétition du match.

Mesure comparative sur Node 21.7.1, Windows, seed `4286584113`, 420 matchs, 30 tours maximum,
plateau `wide-arena`, configuration historique migrée en v8, historique complet et traces de
décisions activées; le réglage historique 3/1/120 était utilisé. Le temps affiché exclut la
sérialisation et l’écriture du JSON.

| Version                          | Temps des exécutions                       | Médiane | Gain  |
| -------------------------------- | ------------------------------------------ | ------- | ----- |
| Avant optimisation, séquentielle | 554,0 s / 551,1 s / 553,2 s (3 exécutions) | 553,2 s | —     |
| Après optimisation, workers      | 211 s / 224 s (2 exécutions)               | 217,5 s | 2,54× |

Les deux exécutions optimisées ont produit les mêmes résultats : 214 victoires J1, 199 victoires
J2, 7 nulles et 14,65 tours en moyenne. Le JSON complet, avec historique et traces, pesait 69,1 MB.
La mesure après optimisation ne comporte que deux répétitions; le gain est donc indicatif, même si
chacune des deux exécutions dépasse le seuil de 2×.

Pour reproduire la configuration, `--config` accepte un export contenant
`{ "configuration": ..., "board": ... }` :

```sh
npm run simulate -- --games 420 --seed 4286584113 --max-turns 30 --profile1 cheap --profile2 offensive --cross-profile --record-decisions --config configuration-et-plateau.json
```

### État et limites du laboratoire d’équilibrage

L’écran de laboratoire réutilise le simulateur, ses workers, ses lots reprenables et son export
JSON. Il permet une confrontation entre profils ou un tournoi des 42 paires orientées avec
`--cross-profile`; les seeds, profils, decks, joueur de départ, configuration, plateau, résumé,
statistiques par joueur, état final et historique d’actions sont enregistrés dans chaque rapport.
Les rapports s’archivent actuellement par export/import JSON manuel : il n’existe pas encore
d’historique de campagnes consultable dans l’application.

Le tableau théorique est dérivé des caractéristiques de monstres et d’hypothèses fixes dans
`src/simulation/monsterBalance/options.ts` : plateau 19 × 13, cinq ressources par tour, densités d’alliés et
d’ennemis estimées, horizon d’analyse de 12 tours et efficacité de soins estimée. La robustesse
applique théoriquement l’armure séparément à chaque attaque du catalogue; l’offensive estime les
cibles de zone au lieu d’utiliser systématiquement leur maximum et tient compte des coûts et
recharges. Mobilité et économie d’action sont des estimations, pas une mesure de trajectoires ou
d’actions effectivement réalisables en match. Les cinq sous-scores du score global sont robustesse,
offensive, mobilité, utilité et économie d’action, pondérés respectivement par 4/17, 5/17, 3/17,
3/17 et 2/17. Portée / zone reste visible comme indicateur complémentaire, hors score global afin
d’éviter son double comptage avec les cibles attendues de l’offensive.

Les rapports fournissent déjà, par match et par joueur, les invocations par type, attaques,
dégâts, éliminations, pertes, dégâts de base, déplacements, ressources dépensées et conservées,
conversions, profil, seed, durée, résultat et raison de fin. L’analyse de résultats distingue
maintenant les dégâts directs et les événements de dégâts différés, et calcule les taux de victoire
et leurs intervalles de Wilson à 95 % par joueur, profil et joueur de départ. Les taux gardent les
matchs nuls au dénominateur, présentés séparément. Les événements d’action fournissent aussi les
premiers tours d’invocation et coûts par type de monstre quand l’historique contient tous les coûts;
sinon ces coûts sont affichés comme indisponibles.

Les alertes de fiabilité sont des repères d’échantillon, pas une déclaration d’équilibrage. Un
intervalle de Wilson sur des matchs agrégés ne corrige pas les biais de composition, de profil,
d’ordre de départ, de seeds appariées ni la corrélation entre parties. Le moteur alterne des joueurs
de départ, mais le tournoi ne rejoue pas encore chaque matchup sur une même seed dans les deux sens.
Les données de la version des caractéristiques existent dans l’empreinte de compatibilité des
rapports d’entraînement; l’application n’offre pas encore d’outil de comparaison ou de validation
avant/après entre deux campagnes.

Les métriques suivantes ne sont pas déductibles de manière fiable des événements actuels et ne sont
donc pas présentées comme des zéros : nombre exact de cibles touchées par attaque de zone, dégâts
reçus et tours de survie par monstre, mitigations d’armure observées, soins réellement restaurés,
buffs et bénéficiaires, cooldowns empêchant une action, camouflage ayant bloqué une attaque directe
ou sauvé le Voleur. Les événements de dégâts différés attribuent les dégâts au monstre source quand
elle est connue, mais les événements ne suffisent pas à établir la valeur de soutien ni la causalité
d’une victoire.

L’armure existe dans les profils et le calcul théorique, mais n’est pas appliquée par le combat du
simulateur actuel. Les résultats de simulation ne doivent donc pas être interprétés comme une
validation empirique de l’armure. Les parties humaines ne disposent pas encore d’un format de rapport
importable distinct des exports simulés.

Les évolutions restantes pour un laboratoire complet sont : archivage indexé des campagnes,
campagnes miroir appariées, comparaisons de compositions et matchups ciblés depuis l’interface,
empreinte des poids et version de stratégie par rapport, filtres multi-campagnes, diagnostics
configurables sur des observations suffisantes, comparaison/validation avant-après sur seeds
réservées, et collecte instrumentée des métriques actuellement indisponibles. L’interface ne
modifie jamais automatiquement les caractéristiques ou les stratégies.
