import { mkdir, readFile, writeFile } from "node:fs/promises";
import process, { argv } from "node:process";
import { dirname, resolve } from "node:path";
import {
    getDefaultGameConfiguration,
    parseGameConfiguration,
    type GameConfiguration,
} from "../game/gameConfiguration";
import { getDefaultBoard, parseBoardDefinition, type BoardDefinition } from "../game/boards";
import { parseDeck } from "../game/decks";
import { parseBotStrategyWeightMap } from "../game/botStrategy";
import { runCrossProfileTournament, runSimulations } from "./simulator";
import { trainBotStrategies } from "./strategyTraining";
import {
    BOT_PROFILES,
    DEFAULT_MAX_TURNS,
    type BotProfile,
    type BotStrategyWeightMap,
    type SimulationOptions,
} from "./types";
import { formatElapsedDuration } from "./formatElapsedDuration";
import {
    BOT_WEIGHT_GROUPS,
    compareTrainingCompatibility,
    createTrainingFingerprint,
    type BotWeightGroup,
    type TrainingMode,
} from "./trainingVersioning";

const HELP = `Simulateur Dungeon Dice (sans interface)

Usage :
  npm run simulate -- [options]

Options :
  --games <n>          Nombre de matchs (défaut : 100)
  --seed <n>           Graine aléatoire reproductible
  --max-turns <n>      Limite de tours par match (défaut : ${DEFAULT_MAX_TURNS})
  --profile1 <profil>  Profil du joueur 1
  --profile2 <profil>  Profil du joueur 2
  --deck1 <ids>        Deck J1 (ids séparés par des virgules)
  --deck2 <ids>        Deck J2 (ids séparés par des virgules)
  --config <fichier>   Configuration de jeu JSON à simuler
  --output <fichier>   Chemin du JSON de sortie
  --strategy-weights <fichier> Charge les poids d’un rapport d’entraînement
  --record-decisions   Enregistre les options légales et les scores d’attaque
  --advanced           Active la recherche tactique avancée
  --search-depth <n>   Phases complètes explorées (1 à 3)
  --branch-width <n>   Branches conservées par niveau (1 à 12)
  --node-budget <n>    Nombre maximal de nœuds explorés
  --debug              Ajoute les détails des décisions IA (avec historique complet)
  --light-results      N'enregistre pas l'historique détaillé des matchs
  --cross-profile      Lance les confrontations croisées des sept profils
  --train-bots         Ajuste hors ligne les poids stratégiques des profils
  --training-profiles  Profils à entraîner, séparés par des virgules
  --training-mode <mode> Mode default, warmStart ou hybrid
  --previous-weights <fichier> Rapport de poids précédent à comparer ou reprendre
  --allow-incompatible-transfer Force le transfert d'un rapport legacy/incompatible
  --training-groups <groupes> Groupes à entraîner, séparés par des virgules
  --training-seeds     Nombre de seeds d’entraînement (défaut : 3)
  --selection-seeds    Nombre de seeds de sélection indépendantes (défaut : 3)
  --validation-seeds   Nombre de seeds de validation (défaut : 3)
  --generations        Générations de réglage (défaut : 2)
  --population         Candidats évalués par génération (défaut : 3)
  --help               Afficher cette aide

Profils disponibles : ${BOT_PROFILES.join(", ")}
`;

function readOption(args: string[], name: string, fallback: string): string {
    const index = args.findIndex(
        (argument) => argument === name || argument.startsWith(`${name}=`),
    );
    if (index < 0) return fallback;
    const argument = args[index]!;
    if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${name}.`);
    return value;
}

function parseInteger(value: string, name: string, min: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} doit être un entier compris entre ${min} et ${max}.`);
    }
    return parsed;
}

function parseProfile(value: string, name: string): BotProfile {
    if (BOT_PROFILES.includes(value as BotProfile)) return value as BotProfile;
    throw new Error(`${name} doit être l'un de : ${BOT_PROFILES.join(", ")}.`);
}

function parseProfileList(value: string): BotProfile[] {
    const profiles = value.split(",").map((profile) => profile.trim());
    if (
        profiles.length === 0 ||
        profiles.some((profile) => !BOT_PROFILES.includes(profile as BotProfile)) ||
        new Set(profiles).size !== profiles.length
    ) {
        throw new Error(
            `--training-profiles doit contenir des profils distincts : ${BOT_PROFILES.join(", ")}.`,
        );
    }
    return profiles as BotProfile[];
}

function parseTrainingMode(value: string): TrainingMode {
    if (value === "default" || value === "warmStart" || value === "hybrid") return value;
    throw new Error("--training-mode doit être default, warmStart ou hybrid.");
}

function parseWeightGroups(value: string): BotWeightGroup[] {
    const groups = value.split(",").map((group) => group.trim());
    const knownGroups = Object.keys(BOT_WEIGHT_GROUPS);
    if (
        groups.length === 0 ||
        groups.some((group) => !knownGroups.includes(group)) ||
        new Set(groups).size !== groups.length
    ) {
        throw new Error(
            `--training-groups doit être une liste distincte de : ${knownGroups.join(", ")}.`,
        );
    }
    return groups as BotWeightGroup[];
}

function getOptionalValue(args: string[], name: string): string | undefined {
    const index = args.findIndex(
        (argument) => argument === name || argument.startsWith(`${name}=`),
    );
    if (index < 0) return undefined;
    const value = readOption(args, name, "");
    if (value.length === 0) throw new Error(`Valeur manquante pour ${name}.`);
    return value;
}

function parseOptionalDeck(
    value: string | undefined,
    deckSize: number,
    name: string,
): string[] | undefined {
    if (value === undefined) return undefined;
    const deck = parseDeck(
        value.split(",").map((id) => id.trim()),
        deckSize,
    );
    if (!deck)
        throw new Error(`${name} doit contenir ${deckSize} ids de monstres valides et distincts.`);
    return deck;
}

function parseArguments(
    args: string[],
    configuration: GameConfiguration,
    configurationFile?: string,
    strategyWeights?: BotStrategyWeightMap,
): {
    options: SimulationOptions;
    output?: string;
} {
    const allowedOptions = new Set([
        "--games",
        "--seed",
        "--max-turns",
        "--profile1",
        "--profile2",
        "--deck1",
        "--deck2",
        "--config",
        "--output",
        "--strategy-weights",
        "--record-decisions",
        "--advanced",
        "--search-depth",
        "--branch-width",
        "--node-budget",
        "--allow-incompatible-transfer",
        "--debug",
        "--light-results",
        "--cross-profile",
        "--train-bots",
        "--training-profiles",
        "--training-seeds",
        "--validation-seeds",
        "--generations",
        "--population",
    ]);
    for (const argument of args.filter((value) => value.startsWith("--"))) {
        const name = argument.split("=")[0]!;
        if (!allowedOptions.has(name)) throw new Error(`Option inconnue : ${name}.`);
    }

    const profile1 = parseProfile(readOption(args, "--profile1", "balanced"), "--profile1");
    const profile2 = parseProfile(readOption(args, "--profile2", "balanced"), "--profile2");
    const lightResults = args.includes("--light-results");
    if (lightResults && args.includes("--debug")) {
        throw new Error("--debug ne peut pas être combiné avec --light-results.");
    }
    const options: SimulationOptions = {
        games: parseInteger(readOption(args, "--games", "100"), "--games", 1, 10000),
        seed: parseInteger(
            readOption(args, "--seed", String(Date.now() >>> 0)),
            "--seed",
            0,
            0xffff_ffff,
        ),
        maxTurns: parseInteger(
            readOption(args, "--max-turns", String(DEFAULT_MAX_TURNS)),
            "--max-turns",
            1,
            10000,
        ),
        profile1,
        profile2,
        debug: args.includes("--debug"),
        lightResults,
        recordDecisionTraces: args.includes("--record-decisions"),
        advanced: args.includes("--advanced"),
        searchDepth: args.includes("--search-depth")
            ? parseInteger(readOption(args, "--search-depth", "1"), "--search-depth", 1, 3)
            : undefined,
        branchWidth: args.includes("--branch-width")
            ? parseInteger(readOption(args, "--branch-width", "3"), "--branch-width", 1, 12)
            : undefined,
        nodeBudget: args.includes("--node-budget")
            ? parseInteger(readOption(args, "--node-budget", "120"), "--node-budget", 20, 10000)
            : undefined,
        strategyWeights,
        ...(configurationFile === undefined ? {} : { configurationFile }),
        deck1: parseOptionalDeck(
            getOptionalValue(args, "--deck1"),
            configuration.deckSize,
            "--deck1",
        ),
        deck2: parseOptionalDeck(
            getOptionalValue(args, "--deck2"),
            configuration.deckSize,
            "--deck2",
        ),
    };
    return { options, output: getOptionalValue(args, "--output") };
}

async function loadConfiguration(path: string | undefined): Promise<{
    configuration: GameConfiguration;
    board: BoardDefinition;
}> {
    if (!path) return { configuration: getDefaultGameConfiguration(), board: getDefaultBoard() };
    const contents = await readFile(resolve(path), "utf8");
    let value: unknown;
    try {
        value = JSON.parse(contents);
    } catch (error) {
        throw new Error(`Le fichier de configuration ${path} ne contient pas un JSON valide.`, {
            cause: error,
        });
    }
    const envelope =
        typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    const configurationValue =
        envelope && "configuration" in envelope ? envelope.configuration : value;
    const configuration = parseGameConfiguration(configurationValue);
    if (!configuration) throw new Error(`Configuration de jeu invalide : ${path}.`);
    const board =
        envelope && "board" in envelope ? parseBoardDefinition(envelope.board) : getDefaultBoard();
    if (!board) throw new Error(`Définition de plateau invalide : ${path}.`);
    return { configuration, board };
}

async function loadPreviousWeights(path: string | undefined): Promise<unknown> {
    if (!path) return undefined;
    const contents = await readFile(resolve(path), "utf8");
    try {
        return JSON.parse(contents) as unknown;
    } catch (error) {
        throw new Error(`Le fichier de poids ${path} ne contient pas un JSON valide.`, {
            cause: error,
        });
    }
}

async function loadStrategyWeights(
    path: string | undefined,
    configuration: GameConfiguration,
    board: BoardDefinition,
    allowIncompatibleTransfer: boolean,
): Promise<BotStrategyWeightMap | undefined> {
    if (!path) return undefined;
    const contents = await readFile(resolve(path), "utf8");
    let value: unknown;
    try {
        value = JSON.parse(contents);
    } catch (error) {
        throw new Error(`Le fichier de poids ${path} ne contient pas un JSON valide.`, {
            cause: error,
        });
    }
    const weightValue =
        typeof value === "object" && value !== null && "weights" in value ? value.weights : value;
    const weights = parseBotStrategyWeightMap(weightValue);
    if (!weights) throw new Error(`Poids stratégiques invalides : ${path}.`);
    const fingerprint = createTrainingFingerprint(configuration, board);
    const profiles =
        typeof value === "object" && value !== null && "profiles" in value
            ? (value.profiles as Record<string, unknown>)
            : {};
    for (const [profile, profileWeights] of Object.entries(weights)) {
        if (!profileWeights) continue;
        const profileReport = profiles[profile];
        const metadata =
            typeof profileReport === "object" &&
            profileReport !== null &&
            "metadata" in profileReport
                ? (profileReport.metadata as Parameters<typeof compareTrainingCompatibility>[0])
                : undefined;
        const compatibility = compareTrainingCompatibility(metadata, fingerprint);
        if (compatibility.level === "legacy") {
            console.warn(`Poids « ${profile} » legacy : compatibilité inconnue.`);
            continue;
        }
        if (compatibility.level === "incompatible" && !allowIncompatibleTransfer) {
            throw new Error(
                `Poids « ${profile} » incompatibles : ${compatibility.differences.join(", ")}. ` +
                    `Ajoutez --allow-incompatible-transfer pour forcer leur utilisation.`,
            );
        }
        if (compatibility.level !== "exact") {
            console.warn(
                `Poids « ${profile} » : compatibilité ${compatibility.level}; ` +
                    `différences : ${compatibility.differences.join(", ")}.`,
            );
        }
    }
    return weights;
}

async function main(): Promise<void> {
    try {
        const args = argv.slice(2);
        if (args.includes("--help")) {
            console.log(HELP);
            return;
        }
        const configurationFile = getOptionalValue(args, "--config");
        const { configuration, board } = await loadConfiguration(configurationFile);
        if (args.includes("--train-bots")) {
            const initializationMode = parseTrainingMode(
                readOption(args, "--training-mode", "default"),
            );
            const profiles = parseProfileList(
                readOption(args, "--training-profiles", BOT_PROFILES.join(",")),
            );
            const previousWeights = await loadPreviousWeights(
                getOptionalValue(args, "--previous-weights"),
            );
            const groupsValue = getOptionalValue(args, "--training-groups");
            const report = trainBotStrategies({
                seed: parseInteger(readOption(args, "--seed", "731"), "--seed", 0, 0xffff_ffff),
                maxTurns: parseInteger(
                    readOption(args, "--max-turns", "10"),
                    "--max-turns",
                    1,
                    10000,
                ),
                trainingSeedCount: parseInteger(
                    readOption(args, "--training-seeds", "3"),
                    "--training-seeds",
                    1,
                    100,
                ),
                selectionSeedCount: parseInteger(
                    readOption(args, "--selection-seeds", "3"),
                    "--selection-seeds",
                    1,
                    100,
                ),
                validationSeedCount: parseInteger(
                    readOption(args, "--validation-seeds", "3"),
                    "--validation-seeds",
                    1,
                    100,
                ),
                generations: parseInteger(
                    readOption(args, "--generations", "2"),
                    "--generations",
                    0,
                    100,
                ),
                populationSize: parseInteger(
                    readOption(args, "--population", initializationMode === "hybrid" ? "5" : "3"),
                    "--population",
                    1,
                    100,
                ),
                profiles,
                initializationMode,
                previousWeights,
                allowIncompatibleTransfer: args.includes("--allow-incompatible-transfer"),
                ...(groupsValue === undefined ? {} : { groups: parseWeightGroups(groupsValue) }),
                configuration,
                board,
                onNotice: (message) => console.warn(`Avertissement : ${message}`),
                onProfileComplete: (profile, result) => {
                    console.log(
                        `${profile} : validation ${result.baselineValidation.score.toFixed(3)} → ` +
                            `${result.candidateValidation.score.toFixed(3)}; ` +
                            `delta apparié ${result.candidateVsReference.mean.toFixed(3)} ` +
                            `[${result.candidateVsReference.confidenceInterval.lower.toFixed(3)}, ` +
                            `${result.candidateVsReference.confidenceInterval.upper.toFixed(3)}]; ` +
                            `${result.validationImproved ? "candidat retenu" : `poids ${result.promotedFrom} conservés`}`,
                    );
                },
            });
            const outputPath = resolve(
                getOptionalValue(args, "--output") ??
                    `simulation-results/bot-training-${report.trainingId}.json`,
            );
            const explicitOutput = getOptionalValue(args, "--output") !== undefined;
            await mkdir(dirname(outputPath), { recursive: true });
            let actualOutputPath = outputPath;
            let suffix = 2;
            while (true) {
                try {
                    await writeFile(actualOutputPath, `${JSON.stringify(report, null, 2)}\n`, {
                        encoding: "utf8",
                        flag: "wx",
                    });
                    break;
                } catch (error) {
                    const alreadyExists =
                        typeof error === "object" &&
                        error !== null &&
                        "code" in error &&
                        error.code === "EEXIST";
                    if (explicitOutput || !alreadyExists) throw error;
                    const extension = outputPath.endsWith(".json") ? ".json" : "";
                    const base = extension ? outputPath.slice(0, -extension.length) : outputPath;
                    actualOutputPath = `${base}-${suffix++}${extension}`;
                }
            }
            console.log(
                `Entraînement ${report.trainingId} terminé en ${report.elapsedMs.toFixed(0)} ms. ` +
                    `Rapport : ${actualOutputPath}`,
            );
            return;
        }
        const strategyWeights = await loadStrategyWeights(
            getOptionalValue(args, "--strategy-weights"),
            configuration,
            board,
            args.includes("--allow-incompatible-transfer"),
        );
        const { options, output } = parseArguments(
            args,
            configuration,
            configurationFile,
            strategyWeights,
        );
        if (args.includes("--cross-profile")) {
            const startedAt = performance.now();
            const tournament = runCrossProfileTournament(options, configuration, board);
            const elapsedTime = formatElapsedDuration(performance.now() - startedAt);
            const outputPath = resolve(
                output ?? `simulation-results/cross-profile-seed-${options.seed}.json`,
            );
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, `${JSON.stringify(tournament, null, 2)}\n`, "utf8");
            const wins = tournament.reduce(
                (total, match) => {
                    const winner =
                        match.result.summary.wins[1] >= match.result.summary.wins[2] ? 1 : 2;
                    total[winner]++;
                    return total;
                },
                { 1: 0, 2: 0 },
            );
            console.log(
                `Confrontations croisées : ${tournament.length} | scores J1/J2 : ${wins[1]}/${wins[2]} | durée : ${elapsedTime}`,
            );
            console.log(`Résultats JSON : ${outputPath}`);
            return;
        }
        const startedAt = performance.now();
        const result = runSimulations(options, configuration, board);
        const elapsedTime = formatElapsedDuration(performance.now() - startedAt);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outputPath = resolve(
            output ?? `simulation-results/matches-${timestamp}-seed-${options.seed}.json`,
        );
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(
            `Matchs : ${result.summary.matches} | victoires J1 : ${result.summary.wins[1]} | ` +
                `victoires J2 : ${result.summary.wins[2]} | nuls : ${result.summary.draws} | ` +
                `durée moyenne : ${result.summary.averageTurns.toFixed(1)} tours | durée : ${elapsedTime}`,
        );
        console.log(`Résultats JSON : ${outputPath}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        console.error(`\n${HELP}`);
        process.exitCode = 1;
    }
}

void main();
