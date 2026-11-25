import { parseBoardDefinition, type BoardDefinition } from "../game/boards";
import { parseGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import type { BotProfile, SimulationBatchResult, SimulationOptions } from "../simulation/types";
import type { SimulationChunk } from "../simulation/workerPool";
import { isRecord } from "../utils/guards";
import { isProfile } from "./guards";
import {
    getRecord,
    getSessionChunkRange,
    putRecord,
    runTransaction,
    RECORD_VERSION,
    SIMULATION_CHUNK_STORE,
    SIMULATION_RUN_STORE,
} from "./indexedDb";

export interface SavedSimulationRun {
    readonly options: SimulationOptions;
    readonly configuration: GameConfiguration;
    readonly board: BoardDefinition;
    readonly chunks: readonly SimulationChunk[];
}

export interface SavedSimulationChunk {
    readonly startIndex: number;
    readonly result: SimulationBatchResult;
}

const SIMULATION_STORES = [SIMULATION_RUN_STORE, SIMULATION_CHUNK_STORE];
const REMOVED_OPTION_KEYS = [
    "advanced",
    "searchDepth",
    "branchWidth",
    "nodeBudget",
    "lightResults",
];

function isProfilePair(pair: unknown): boolean {
    return (
        isRecord(pair) &&
        isProfile(pair.profile1) &&
        isProfile(pair.profile2) &&
        pair.profile1 !== pair.profile2
    );
}

export function parseSimulationOptions(value: unknown): SimulationOptions | null {
    if (
        !isRecord(value) ||
        !Number.isInteger(value.games) ||
        !Number.isInteger(value.seed) ||
        !Number.isInteger(value.maxTurns) ||
        !isProfile(value.profile1) ||
        !isProfile(value.profile2) ||
        (value.recordDecisionTraces !== undefined &&
            typeof value.recordDecisionTraces !== "boolean") ||
        (value.profilePairs !== undefined &&
            (!Array.isArray(value.profilePairs) || !value.profilePairs.every(isProfilePair)))
    ) {
        return null;
    }

    const options = Object.fromEntries(
        Object.entries(value).filter(([key]) => !REMOVED_OPTION_KEYS.includes(key)),
    );
    return {
        ...options,
        games: value.games as number,
        seed: value.seed as number,
        maxTurns: value.maxTurns as number,
        profile1: value.profile1 as BotProfile,
        profile2: value.profile2 as BotProfile,
    } satisfies SimulationOptions;
}

function parseChunks(values: unknown[]): { chunks: SimulationChunk[]; totalGames: number } {
    let totalGames = 0;
    const chunks = values.map((chunk) => {
        if (
            !isRecord(chunk) ||
            chunk.startIndex !== totalGames ||
            !Number.isInteger(chunk.games) ||
            (chunk.games as number) < 1
        ) {
            throw new Error("Les lots de la simulation à reprendre sont invalides.");
        }
        const validChunk = { startIndex: chunk.startIndex as number, games: chunk.games as number };
        totalGames += validChunk.games;
        return validChunk;
    });
    return { chunks, totalGames };
}

function isChunkRecord(record: unknown, sessionId: string): record is SavedSimulationChunk {
    return (
        isRecord(record) &&
        record.sessionId === sessionId &&
        record.version === RECORD_VERSION &&
        Number.isInteger(record.startIndex) &&
        isRecord(record.result) &&
        record.result.schemaVersion === 1 &&
        Array.isArray(record.result.matches)
    );
}

export function saveSimulationRun(sessionId: string, run: SavedSimulationRun): Promise<void> {
    return runTransaction(
        SIMULATION_STORES,
        "readwrite",
        {
            error: "Impossible d’enregistrer la simulation.",
            abort: "L’enregistrement de la simulation a échoué.",
        },
        (transaction) => {
            transaction
                .objectStore(SIMULATION_RUN_STORE)
                .put({ ...run, version: RECORD_VERSION, sessionId });
            transaction.objectStore(SIMULATION_CHUNK_STORE).delete(getSessionChunkRange(sessionId));
            return undefined;
        },
    );
}

export async function loadSimulationRun(sessionId: string): Promise<SavedSimulationRun | null> {
    const value = await getRecord(SIMULATION_RUN_STORE, sessionId);
    if (value === undefined) return null;
    const options = isRecord(value) ? parseSimulationOptions(value.options) : null;
    if (
        !isRecord(value) ||
        value.version !== RECORD_VERSION ||
        !options ||
        !Array.isArray(value.chunks)
    ) {
        throw new Error("La simulation à reprendre est invalide ou incompatible.");
    }
    const { chunks, totalGames } = parseChunks(value.chunks);
    const configuration = parseGameConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    if (!configuration || !board || totalGames !== options.games) {
        throw new Error("La configuration de la simulation à reprendre est invalide.");
    }
    return { options, configuration, board, chunks };
}

export function saveSimulationChunk(
    sessionId: string,
    startIndex: number,
    result: SimulationBatchResult,
): Promise<void> {
    return putRecord(SIMULATION_CHUNK_STORE, {
        sessionId,
        startIndex,
        result,
        version: RECORD_VERSION,
    });
}

export async function loadSimulationChunks(sessionId: string): Promise<SavedSimulationChunk[]> {
    const records = await runTransaction<unknown[]>(
        SIMULATION_CHUNK_STORE,
        "readonly",
        {
            error: "Impossible de lire les résultats partiels.",
            abort: "La lecture des résultats partiels a échoué.",
        },
        (transaction) =>
            transaction.objectStore(SIMULATION_CHUNK_STORE).getAll(getSessionChunkRange(sessionId)),
    );
    if (
        !records.every((record): record is SavedSimulationChunk => isChunkRecord(record, sessionId))
    ) {
        throw new Error("Les résultats partiels de la simulation sont invalides.");
    }
    return records.map(({ startIndex, result }) => ({ startIndex, result }));
}

export function clearSimulationRun(sessionId: string): Promise<void> {
    return runTransaction(
        SIMULATION_STORES,
        "readwrite",
        {
            error: "Impossible d’effacer la simulation sauvegardée.",
            abort: "L’effacement de la simulation a échoué.",
        },
        (transaction) => {
            transaction.objectStore(SIMULATION_RUN_STORE).delete(sessionId);
            transaction.objectStore(SIMULATION_CHUNK_STORE).delete(getSessionChunkRange(sessionId));
            return undefined;
        },
    );
}
