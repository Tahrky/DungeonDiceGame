import { mkdir, readFile, writeFile } from "node:fs/promises";
import process, { argv } from "node:process";
import { dirname, resolve } from "node:path";
import {
    getDefaultGameConfiguration,
    parseGameConfiguration,
    type GameConfiguration,
} from "../game/gameConfiguration";
import { parseDeck } from "../game/decks";
import { runCrossProfileTournament, runSimulations } from "./simulator";
import { BOT_PROFILES, type BotProfile, type SimulationOptions } from "./types";

const HELP = `Simulateur Dungeon Dice (sans interface)

Usage :
  npm run simulate -- [options]

Options :
  --games <n>          Nombre de matchs (défaut : 100)
  --seed <n>           Graine aléatoire reproductible
  --max-turns <n>      Limite de tours par match (défaut : 100)
  --profile1 <profil>  Profil du joueur 1
  --profile2 <profil>  Profil du joueur 2
  --deck1 <ids>        Deck J1 (ids séparés par des virgules)
  --deck2 <ids>        Deck J2 (ids séparés par des virgules)
  --config <fichier>   Configuration de jeu JSON à simuler
  --output <fichier>   Chemin du JSON de sortie
  --debug              Ajoute les détails des décisions IA
  --cross-profile      Lance les confrontations croisées des sept profils
  --help               Afficher cette aide

Profils disponibles : ${BOT_PROFILES.join(", ")}
`;

function readOption(args: string[], name: string, fallback: string): string {
    const index = args.findIndex((argument) => argument === name || argument.startsWith(`${name}=`));
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

function getOptionalValue(args: string[], name: string): string | undefined {
    const index = args.findIndex((argument) => argument === name || argument.startsWith(`${name}=`));
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
    const deck = parseDeck(value.split(",").map((id) => id.trim()), deckSize);
    if (!deck) throw new Error(`${name} doit contenir ${deckSize} ids de monstres valides et distincts.`);
    return deck;
}

function parseArguments(
    args: string[],
    configuration: GameConfiguration,
    configurationFile?: string,
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
        "--debug",
        "--cross-profile",
    ]);
    for (const argument of args.filter((value) => value.startsWith("--"))) {
        const name = argument.split("=")[0]!;
        if (!allowedOptions.has(name)) throw new Error(`Option inconnue : ${name}.`);
    }

    const profile1 = parseProfile(readOption(args, "--profile1", "balanced"), "--profile1");
    const profile2 = parseProfile(readOption(args, "--profile2", "balanced"), "--profile2");
    const options: SimulationOptions = {
        games: parseInteger(readOption(args, "--games", "100"), "--games", 1, 10000),
        seed: parseInteger(readOption(args, "--seed", String(Date.now() >>> 0)), "--seed", 0, 0xffff_ffff),
        maxTurns: parseInteger(readOption(args, "--max-turns", "100"), "--max-turns", 1, 10000),
        profile1,
        profile2,
        debug: args.includes("--debug"),
        ...(configurationFile === undefined ? {} : { configurationFile }),
        deck1: parseOptionalDeck(getOptionalValue(args, "--deck1"), configuration.deckSize, "--deck1"),
        deck2: parseOptionalDeck(getOptionalValue(args, "--deck2"), configuration.deckSize, "--deck2"),
    };
    return { options, output: getOptionalValue(args, "--output") };
}

async function loadConfiguration(path: string | undefined): Promise<GameConfiguration> {
    if (!path) return getDefaultGameConfiguration();
    const contents = await readFile(resolve(path), "utf8");
    let value: unknown;
    try {
        value = JSON.parse(contents);
    } catch (error) {
        throw new Error(`Le fichier de configuration ${path} ne contient pas un JSON valide.`, {
            cause: error,
        });
    }
    const configurationValue =
        typeof value === "object" && value !== null && "configuration" in value
            ? value.configuration
            : value;
    const configuration = parseGameConfiguration(configurationValue);
    if (!configuration) throw new Error(`Configuration de jeu invalide : ${path}.`);
    return configuration;
}

async function main(): Promise<void> {
    try {
        const args = argv.slice(2);
        if (args.includes("--help")) {
            console.log(HELP);
            return;
        }
        const configurationFile = getOptionalValue(args, "--config");
        const configuration = await loadConfiguration(configurationFile);
        const { options, output } = parseArguments(args, configuration, configurationFile);
        if (args.includes("--cross-profile")) {
            const tournament = runCrossProfileTournament(options, configuration);
            const outputPath = resolve(
                output ?? `simulation-results/cross-profile-seed-${options.seed}.json`,
            );
            await mkdir(dirname(outputPath), { recursive: true });
            await writeFile(outputPath, `${JSON.stringify(tournament, null, 2)}\n`, "utf8");
            const wins = tournament.reduce(
                (total, match) => {
                    const winner = match.result.summary.wins[1] >= match.result.summary.wins[2]
                        ? 1
                        : 2;
                    total[winner]++;
                    return total;
                },
                { 1: 0, 2: 0 },
            );
            console.log(
                `Confrontations croisées : ${tournament.length} | scores J1/J2 : ${wins[1]}/${wins[2]}`,
            );
            console.log(`Résultats JSON : ${outputPath}`);
            return;
        }
        const result = runSimulations(options, configuration);
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const outputPath = resolve(
            output ?? `simulation-results/matches-${timestamp}-seed-${options.seed}.json`,
        );
        await mkdir(dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
        console.log(
            `Matchs : ${result.summary.matches} | victoires J1 : ${result.summary.wins[1]} | ` +
                `victoires J2 : ${result.summary.wins[2]} | nuls : ${result.summary.draws} | ` +
                `durée moyenne : ${result.summary.averageTurns.toFixed(1)} tours`,
        );
        console.log(`Résultats JSON : ${outputPath}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        console.error(`\n${HELP}`);
        process.exitCode = 1;
    }
}

void main();
