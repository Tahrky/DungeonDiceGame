import process, { argv } from "node:process";
import { resolve } from "node:path";
import { isMainThread } from "node:worker_threads";
import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import { createAITournamentPairs, createCrossProfilePairs } from "./workerPool";
import { NodeSimulationWorkerPool, startNodeSimulationWorker } from "./nodeWorkerPool";
import { SIMULATION_CLI_DEFAULTS, SIMULATION_DEFAULTS, TRAINING_DEFAULTS } from "../data/configuration";
import { BOT_PROFILES, type SimulationBatchResult } from "./types";
import { formatElapsedDuration } from "./formatElapsedDuration";
import { getOptionalValue, parseSimulationArguments } from "./cli/arguments";
import { loadConfiguration, loadStrategyWeights, writeJsonFile } from "./cli/files";
import { runBotTraining } from "./cli/training";

const HELP = `Simulateur Dungeon Dice (sans interface)

Usage :
  npm run simulate -- [options]

Options :
  --games <n>          Nombre de matchs (défaut : ${SIMULATION_CLI_DEFAULTS.games})
  --seed <n>           Graine aléatoire reproductible (défaut : ${SIMULATION_DEFAULTS.seed ?? "heure courante"})
  --max-turns <n>      Limite de tours par match (défaut : ${SIMULATION_DEFAULTS.maxTurns})
  --profile1 <profil>  Profil du joueur 1 (défaut : ${SIMULATION_CLI_DEFAULTS.profile})
  --profile2 <profil>  Profil du joueur 2 (défaut : ${SIMULATION_CLI_DEFAULTS.profile})
  --deck1 <ids>        Deck J1 (ids séparés par des virgules)
  --deck2 <ids>        Deck J2 (ids séparés par des virgules)
  --config <fichier>   Configuration de jeu JSON à simuler
  --output <fichier>   Chemin du JSON de sortie
  --strategy-weights <fichier> Charge les poids d’un rapport d’entraînement
  --record-decisions   Enregistre les options légales et les scores d’attaque
  --complete-attack-phases Simule toutes les attaques restantes de chaque phase
  --broader-attack-candidates Explore aussi des candidats tactiques complémentaires
  --movement-attack-combos Déplace les monstres pour créer une attaque ce tour-ci
  --summon-placement-pairs Choisit conjointement le monstre et son placement
  --next-turn-dice-expectation Pondère les réponses par les dés d’attaque probables
  --debug              Ajoute les détails des décisions IA (avec historique complet)
  --cross-profile      Répartit le total des matchs entre les profils orientés
  --engine1 <moteur>   Moteur du joueur 1 : heuristic, minimax ou hybrid
  --engine2 <moteur>   Moteur du joueur 2 : heuristic, minimax ou hybrid
  --engine-tournament  Lance les six confrontations équilibrées des moteurs
  --tournament-profiles all Liste de profils étendue, ou all
  --minimax-depth <n>  Profondeur Expectiminimax
  --minimax-nodes <n>  Budget de nœuds Expectiminimax
  --hybrid-depth <n>   Profondeur du moteur hybride
  --train-bots         Ajuste hors ligne les poids stratégiques des profils
  --training-profiles  Profils à entraîner, séparés par des virgules
  --training-mode <mode> Mode default, warmStart ou hybrid
  --previous-weights <fichier> Rapport de poids précédent à comparer ou reprendre
  --allow-incompatible-transfer Force le transfert d'un rapport legacy/incompatible
  --training-groups <groupes> Groupes à entraîner, séparés par des virgules
  --training-seeds     Nombre de seeds d’entraînement (défaut : ${TRAINING_DEFAULTS.trainingSeedCount})
  --selection-seeds    Nombre de seeds de sélection indépendantes (défaut : ${TRAINING_DEFAULTS.selectionSeedCount})
  --validation-seeds   Nombre de seeds de validation (défaut : ${TRAINING_DEFAULTS.validationSeedCount})
  --generations        Générations de réglage (défaut : ${TRAINING_DEFAULTS.generations})
  --population         Candidats par génération (défaut : ${TRAINING_DEFAULTS.populationSize}, hybrid : ${TRAINING_DEFAULTS.hybridPopulationSize})
  --help               Afficher cette aide

Profils disponibles : ${BOT_PROFILES.join(", ")}
`;

function formatSummary({ summary }: SimulationBatchResult, label: string, elapsedTime: string) {
    return (
        `${label} : ${summary.matches} | ` +
        `victoires J1 : ${summary.wins[1]} | victoires J2 : ${summary.wins[2]} | ` +
        `nuls : ${summary.draws} | durée moyenne : ${summary.averageTurns.toFixed(1)} tours | ` +
        `durée : ${elapsedTime}`
    );
}

async function runSimulation(
    args: string[],
    configuration: GameConfiguration,
    board: BoardDefinition,
    configurationFile: string | undefined,
    getWorkerPool: () => NodeSimulationWorkerPool,
): Promise<void> {
    const strategyWeights = await loadStrategyWeights(
        getOptionalValue(args, "--strategy-weights"),
        configuration,
        board,
        args.includes("--allow-incompatible-transfer"),
    );
    const { options, output } = parseSimulationArguments(
        args,
        configuration,
        configurationFile,
        strategyWeights,
    );
    const crossProfileMode = args.includes("--cross-profile");
    const engineTournament = args.includes("--engine-tournament");
    const tournamentProfiles = options.tournamentProfiles;
    const runOptions = engineTournament
        ? {
              ...options,
              engineTournament: true,
              enginePairs: createAITournamentPairs(),
              ...(tournamentProfiles
                  ? {
                        profilePairs: tournamentProfiles.flatMap((profile1) =>
                            tournamentProfiles
                                .filter((profile2) => profile2 !== profile1)
                                .map((profile2) => ({ profile1, profile2 })),
                        ),
                    }
                  : {}),
              games:
                  options.games *
                  createAITournamentPairs().length *
                  (tournamentProfiles
                      ? tournamentProfiles.length * (tournamentProfiles.length - 1)
                      : 1),
          }
        : crossProfileMode
          ? { ...options, profilePairs: createCrossProfilePairs() }
          : options;
    const startedAt = performance.now();
    const progressInterval = Math.max(1, Math.ceil(runOptions.games / 10));
    let lastReported = 0;
    const result = await getWorkerPool().run(
        runOptions,
        configuration,
        board,
        (completedMatches) => {
            if (
                completedMatches - lastReported >= progressInterval ||
                completedMatches === runOptions.games
            ) {
                lastReported = completedMatches;
                console.log(`Matchs terminés : ${completedMatches}/${runOptions.games}`);
            }
        },
    );
    const elapsedTime = formatElapsedDuration(performance.now() - startedAt);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = resolve(
        output ??
        (engineTournament
            ? `simulation-results/engine-tournament-seed-${options.seed}.json`
            : crossProfileMode
                ? `simulation-results/cross-profile-seed-${options.seed}.json`
                : `simulation-results/matches-${timestamp}-seed-${options.seed}.json`),
    );
    await writeJsonFile(outputPath, result);
    console.log(
        formatSummary(
            result,
            engineTournament
                ? "Tournoi des IA"
                : crossProfileMode
                  ? "Confrontations croisées"
                  : "Matchs",
            elapsedTime,
        ),
    );
    console.log(`Résultats JSON : ${outputPath}`);
}

async function main(): Promise<void> {
    let workerPool: NodeSimulationWorkerPool | undefined;
    const getWorkerPool = () => {
        workerPool ??= new NodeSimulationWorkerPool();
        return workerPool;
    };

    try {
        const args = argv.slice(2);
        if (args.includes("--help")) {
            console.log(HELP);
            return;
        }
        const configurationFile = getOptionalValue(args, "--config");
        const { configuration, board } = await loadConfiguration(configurationFile);
        if (args.includes("--train-bots")) {
            await runBotTraining(
                args,
                configuration,
                board,
                (options, runConfiguration, runBoard) =>
                    getWorkerPool().run(options, runConfiguration, runBoard),
            );
        } else {
            await runSimulation(args, configuration, board, configurationFile, getWorkerPool);
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        console.error(`\n${HELP}`);
        process.exitCode = 1;
    } finally {
        await workerPool?.close();
    }
}

if (isMainThread) void main();
else startNodeSimulationWorker();
