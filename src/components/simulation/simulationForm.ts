import type { BotProfile } from "../../game/botStrategy";
import { DEFAULT_MAX_TURNS, type SimulationOptions } from "../../simulation/types";
import { createCrossProfilePairs } from "../../simulation/workerPool";
import { isIntegerInRange } from "../../utils/guards";

export interface SimulationFormValues {
    readonly profile1: BotProfile;
    readonly profile2: BotProfile;
    readonly crossProfileMode: boolean;
    readonly gameCount: string;
    readonly repetitionCount: string;
    readonly seed: string;
    readonly maxTurns: string;
    readonly debug: boolean;
    readonly recordDecisionTraces: boolean;
}

export type SimulationFormChange = <Key extends keyof SimulationFormValues>(
    key: Key,
    value: SimulationFormValues[Key],
) => void;

export type SimulationOptionsResult =
    { readonly options: SimulationOptions } | { readonly error: string };

export function createInitialFormValues(): SimulationFormValues {
    return {
        profile1: "cheap",
        profile2: "offensive",
        crossProfileMode: false,
        gameCount: "100",
        repetitionCount: "1",
        seed: String(Date.now() >>> 0),
        maxTurns: String(DEFAULT_MAX_TURNS),
        debug: false,
        recordDecisionTraces: false,
    };
}

export function getFormValuesFromOptions(options: SimulationOptions): SimulationFormValues {
    const pairCount = options.profilePairs?.length;
    return {
        profile1: options.profile1,
        profile2: options.profile2,
        crossProfileMode: pairCount !== undefined,
        gameCount: String(options.games),
        repetitionCount: String(
            pairCount === undefined ? options.games : options.games / pairCount,
        ),
        seed: String(options.seed),
        maxTurns: String(options.maxTurns),
        debug: options.debug ?? false,
        recordDecisionTraces: options.recordDecisionTraces ?? false,
    };
}

export function buildSimulationOptions(values: SimulationFormValues): SimulationOptionsResult {
    const { crossProfileMode } = values;
    const count = Number(crossProfileMode ? values.repetitionCount : values.gameCount);
    const seed = Number(values.seed);
    const maxTurns = Number(values.maxTurns);
    if (!isIntegerInRange(count, 1, 1000)) {
        return {
            error: `Choisissez entre 1 et 1 000 ${crossProfileMode ? "répétitions" : "matchs"}.`,
        };
    }
    if (!isIntegerInRange(seed, 0, 0xffff_ffff)) {
        return { error: "La seed doit être un entier entre 0 et 4 294 967 295." };
    }
    if (!isIntegerInRange(maxTurns, 1, 1000)) {
        return { error: "La limite doit être comprise entre 1 et 1 000 tours." };
    }

    const profilePairs = crossProfileMode ? createCrossProfilePairs() : undefined;
    return {
        options: {
            games: count * (profilePairs?.length ?? 1),
            seed,
            maxTurns,
            profile1: values.profile1,
            profile2: values.profile2,
            ...(profilePairs === undefined ? {} : { profilePairs }),
            debug: values.debug,
            recordDecisionTraces: values.recordDecisionTraces,
        },
    };
}
