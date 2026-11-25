import { parseDeck } from "../../game/decks";
import type { GameConfiguration } from "../../game/gameConfiguration";
import {
    BOT_PROFILES,
    DEFAULT_MAX_TURNS,
    type BotProfile,
    type BotStrategyWeightMap,
    type SimulationOptions,
} from "../types";
import { ALL_WEIGHT_GROUPS, type BotWeightGroup, type TrainingMode } from "../training/versioning";

const SIMULATION_OPTIONS = new Set([
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
    "--complete-attack-phases",
    "--broader-attack-candidates",
    "--movement-attack-combos",
    "--summon-placement-pairs",
    "--next-turn-dice-expectation",
    "--allow-incompatible-transfer",
    "--debug",
    "--cross-profile",
    "--train-bots",
    "--training-profiles",
    "--training-seeds",
    "--validation-seeds",
    "--generations",
    "--population",
]);

const OPTIONAL_SIMULATION_FLAGS = [
    ["--complete-attack-phases", "completeAttackPhases"],
    ["--broader-attack-candidates", "broaderAttackCandidates"],
    ["--movement-attack-combos", "movementAttackCombos"],
    ["--summon-placement-pairs", "summonPlacementPairs"],
    ["--next-turn-dice-expectation", "nextTurnDiceExpectation"],
] as const satisfies readonly (readonly [string, keyof SimulationOptions])[];

function findOptionIndex(args: string[], name: string): number {
    return args.findIndex((argument) => argument === name || argument.startsWith(`${name}=`));
}

export function readOption(args: string[], name: string, fallback: string): string {
    const index = findOptionIndex(args, name);
    if (index < 0) return fallback;
    const argument = args[index]!;
    if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${name}.`);
    return value;
}

export function getOptionalValue(args: string[], name: string): string | undefined {
    if (findOptionIndex(args, name) < 0) return undefined;
    const value = readOption(args, name, "");
    if (value.length === 0) throw new Error(`Valeur manquante pour ${name}.`);
    return value;
}

export function readIntegerOption(
    args: string[],
    name: string,
    fallback: number,
    min: number,
    max: number,
): number {
    const parsed = Number(readOption(args, name, String(fallback)));
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} doit être un entier compris entre ${min} et ${max}.`);
    }
    return parsed;
}

function parseDistinctList<T extends string>(
    value: string,
    allowed: readonly T[],
    errorMessage: string,
): T[] {
    const items = value.split(",").map((item) => item.trim());
    if (
        items.some((item) => !allowed.includes(item as T)) ||
        new Set(items).size !== items.length
    ) {
        throw new Error(errorMessage);
    }
    return items as T[];
}

export function parseProfileList(value: string): BotProfile[] {
    return parseDistinctList(
        value,
        BOT_PROFILES,
        `--training-profiles doit contenir des profils distincts : ${BOT_PROFILES.join(", ")}.`,
    );
}

export function parseWeightGroups(value: string): BotWeightGroup[] {
    return parseDistinctList(
        value,
        ALL_WEIGHT_GROUPS,
        `--training-groups doit être une liste distincte de : ${ALL_WEIGHT_GROUPS.join(", ")}.`,
    );
}

export function parseTrainingMode(value: string): TrainingMode {
    if (value === "default" || value === "warmStart" || value === "hybrid") return value;
    throw new Error("--training-mode doit être default, warmStart ou hybrid.");
}

function readProfile(args: string[], name: string): BotProfile {
    const value = readOption(args, name, "balanced");
    if (BOT_PROFILES.includes(value as BotProfile)) return value as BotProfile;
    throw new Error(`${name} doit être l'un de : ${BOT_PROFILES.join(", ")}.`);
}

function readOptionalDeck(args: string[], name: string, deckSize: number): string[] | undefined {
    const value = getOptionalValue(args, name);
    if (value === undefined) return undefined;
    const deck = parseDeck(
        value.split(",").map((id) => id.trim()),
        deckSize,
    );
    if (!deck) {
        throw new Error(`${name} doit contenir ${deckSize} ids de monstres valides et distincts.`);
    }
    return deck;
}

export function parseSimulationArguments(
    args: string[],
    configuration: GameConfiguration,
    configurationFile?: string,
    strategyWeights?: BotStrategyWeightMap,
): { options: SimulationOptions; output?: string } {
    for (const argument of args.filter((value) => value.startsWith("--"))) {
        const name = argument.split("=")[0]!;
        if (!SIMULATION_OPTIONS.has(name)) throw new Error(`Option inconnue : ${name}.`);
    }

    const profile1 = readProfile(args, "--profile1");
    const profile2 = readProfile(args, "--profile2");
    const options: SimulationOptions = {
        games: readIntegerOption(args, "--games", 100, 1, 10000),
        seed: readIntegerOption(args, "--seed", Date.now() >>> 0, 0, 0xffff_ffff),
        maxTurns: readIntegerOption(args, "--max-turns", DEFAULT_MAX_TURNS, 1, 10000),
        profile1,
        profile2,
        debug: args.includes("--debug"),
        recordDecisionTraces: args.includes("--record-decisions"),
        ...Object.fromEntries(
            OPTIONAL_SIMULATION_FLAGS.filter(([flag]) => args.includes(flag)).map(([, key]) => [
                key,
                true,
            ]),
        ),
        strategyWeights,
        ...(configurationFile === undefined ? {} : { configurationFile }),
        deck1: readOptionalDeck(args, "--deck1", configuration.deckSize),
        deck2: readOptionalDeck(args, "--deck2", configuration.deckSize),
    };
    return { options, output: getOptionalValue(args, "--output") };
}
