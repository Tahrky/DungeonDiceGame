import type { BotProfile } from "../../game/botStrategy";
import { SIMULATION_DEFAULTS } from "../../data/configuration";
import type { SimulationOptions } from "../../simulation/types";
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
    readonly expectiminimax: boolean;
    readonly expectiminimaxMaxDepth: string;
    readonly expectiminimaxBranchWidth: string;
    readonly expectiminimaxNodeBudget: string;
}

export type SimulationFormChange = <Key extends keyof SimulationFormValues>(
    key: Key,
    value: SimulationFormValues[Key],
) => void;

export type SimulationOptionsResult =
    { readonly options: SimulationOptions } | { readonly error: string };

export function createInitialFormValues(): SimulationFormValues {
    return {
        profile1: SIMULATION_DEFAULTS.profile1,
        profile2: SIMULATION_DEFAULTS.profile2,
        crossProfileMode: SIMULATION_DEFAULTS.crossProfileMode,
        gameCount: String(SIMULATION_DEFAULTS.gameCount),
        repetitionCount: String(SIMULATION_DEFAULTS.repetitionCount),
        seed: String(SIMULATION_DEFAULTS.seed ?? (Date.now() >>> 0)),
        maxTurns: String(SIMULATION_DEFAULTS.maxTurns),
        debug: SIMULATION_DEFAULTS.debug,
        recordDecisionTraces: SIMULATION_DEFAULTS.recordDecisionTraces,
        expectiminimax: SIMULATION_DEFAULTS.expectiminimax,
        expectiminimaxMaxDepth: String(SIMULATION_DEFAULTS.expectiminimaxMaxDepth),
        expectiminimaxBranchWidth: String(SIMULATION_DEFAULTS.expectiminimaxBranchWidth),
        expectiminimaxNodeBudget: String(SIMULATION_DEFAULTS.expectiminimaxNodeBudget),
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
        expectiminimax: options.expectiminimax ?? true,
        expectiminimaxMaxDepth: String(options.expectiminimaxMaxDepth ?? 2),
        expectiminimaxBranchWidth: String(options.expectiminimaxBranchWidth ?? 5),
        expectiminimaxNodeBudget: String(options.expectiminimaxNodeBudget ?? 250),
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
    const expectiminimaxMaxDepth = Number(values.expectiminimaxMaxDepth);
    const expectiminimaxBranchWidth = Number(values.expectiminimaxBranchWidth);
    const expectiminimaxNodeBudget = Number(values.expectiminimaxNodeBudget);
    if (!isIntegerInRange(expectiminimaxMaxDepth, 1, 10)) {
        return { error: "La profondeur doit être comprise entre 1 et 10 tours." };
    }
    if (!isIntegerInRange(expectiminimaxBranchWidth, 1, 50)) {
        return { error: "La largeur des branches doit être comprise entre 1 et 50." };
    }
    if (!isIntegerInRange(expectiminimaxNodeBudget, 1, 100000)) {
        return { error: "Le budget doit être compris entre 1 et 100 000 nœuds." };
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
            expectiminimax: values.expectiminimax,
            expectiminimaxMaxDepth,
            expectiminimaxBranchWidth,
            expectiminimaxNodeBudget,
        },
    };
}
