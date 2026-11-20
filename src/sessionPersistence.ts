import {
    BOT_PROFILES,
    type BotProfile,
    type SimulationBatchResult,
    type SimulationOptions,
} from "./simulation/types";
import type { SimulationChunk } from "./simulation/workerPool";
import { parseBoardDefinition, type BoardDefinition } from "./game/boards";
import { parseGameConfiguration, type GameConfiguration } from "./game/gameConfiguration";
import { parseDeck, type GameSetup } from "./game/decks";
import { isGameSnapshot } from "./scenes/GameSceneProtocol";
import type { GameSnapshot } from "./types/GameTypes";

const DATABASE_NAME = "dungeon-dice-recovery";
const DATABASE_VERSION = 1;
const GAME_SESSION_STORE = "game-sessions";
const SIMULATION_RUN_STORE = "simulation-runs";
const SIMULATION_CHUNK_STORE = "simulation-chunks";
const SESSION_ID_KEY = "dungeon-dice.recovery-session-id";
const ACTIVE_SCREEN_KEY = "dungeon-dice.active-screen";
const RECORD_VERSION = 1;

export type RecoverableScreen = "game" | "simulation";

export interface SavedGameSession {
    readonly setup: GameSetup;
    readonly snapshot: GameSnapshot;
    readonly roomCode: string | null;
    readonly roomRole: "host" | "guest" | null;
}

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

interface GameSessionRecord extends SavedGameSession {
    readonly version: number;
    readonly sessionId: string;
}

interface SimulationRunRecord extends SavedSimulationRun {
    readonly version: number;
    readonly sessionId: string;
}

interface SimulationChunkRecord extends SavedSimulationChunk {
    readonly sessionId: string;
    readonly version: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        } catch (error) {
            reject(error instanceof Error ? error : new Error("Stockage de reprise indisponible."));
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(GAME_SESSION_STORE)) {
                database.createObjectStore(GAME_SESSION_STORE, { keyPath: "sessionId" });
            }
            if (!database.objectStoreNames.contains(SIMULATION_RUN_STORE)) {
                database.createObjectStore(SIMULATION_RUN_STORE, { keyPath: "sessionId" });
            }
            if (!database.objectStoreNames.contains(SIMULATION_CHUNK_STORE)) {
                database.createObjectStore(SIMULATION_CHUNK_STORE, {
                    keyPath: ["sessionId", "startIndex"],
                });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("Impossible d’ouvrir le stockage de reprise."));
        request.onblocked = () => reject(new Error("Le stockage de reprise est bloqué."));
    });

    return databasePromise;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isProfile(value: unknown): value is BotProfile {
    return BOT_PROFILES.includes(value as BotProfile);
}

function parseNullableString(value: unknown): string | null | undefined {
    if (value === null) return null;
    return typeof value === "string" ? value : undefined;
}

function parseRoomRole(value: unknown): "host" | "guest" | null | undefined {
    if (value === null) return null;
    return value === "host" || value === "guest" ? value : undefined;
}

function isSimulationOptions(value: unknown): value is SimulationOptions {
    if (
        !isRecord(value) ||
        !Number.isInteger(value.games) ||
        !Number.isInteger(value.seed) ||
        !Number.isInteger(value.maxTurns) ||
        !isProfile(value.profile1) ||
        !isProfile(value.profile2) ||
        (value.advanced !== undefined && typeof value.advanced !== "boolean") ||
        (value.lightResults !== undefined && typeof value.lightResults !== "boolean") ||
        (value.recordDecisionTraces !== undefined &&
            typeof value.recordDecisionTraces !== "boolean")
    ) {
        return false;
    }

    return (
        value.profilePairs === undefined ||
        (Array.isArray(value.profilePairs) &&
            value.profilePairs.every(
                (pair) =>
                    isRecord(pair) &&
                    isProfile(pair.profile1) &&
                    isProfile(pair.profile2) &&
                    pair.profile1 !== pair.profile2,
            ))
    );
}

function parseGameSetup(value: unknown): GameSetup | null {
    if (
        !isRecord(value) ||
        (value.mode !== "computer" && value.mode !== "local" && value.mode !== "online")
    ) {
        return null;
    }

    const configuration = parseGameConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    const playerDeck = configuration ? parseDeck(value.playerDeck, configuration.deckSize) : null;
    const opponentDeck = configuration
        ? parseDeck(value.opponentDeck, configuration.deckSize)
        : null;
    if (!configuration || !board || !playerDeck || !opponentDeck) return null;
    const opponentProfile = isProfile(value.opponentProfile) ? value.opponentProfile : undefined;
    const localPlayer =
        value.localPlayer === 1 || value.localPlayer === 2 ? value.localPlayer : undefined;
    const isHost = typeof value.isHost === "boolean" ? value.isHost : undefined;
    if (value.opponentProfile !== undefined && opponentProfile === undefined) return null;
    if (value.localPlayer !== undefined && localPlayer === undefined) {
        return null;
    }
    if (value.isHost !== undefined && isHost === undefined) return null;

    return {
        mode: value.mode,
        configuration,
        board,
        playerDeck,
        opponentDeck,
        ...(opponentProfile === undefined ? {} : { opponentProfile }),
        ...(localPlayer === undefined ? {} : { localPlayer }),
        ...(isHost === undefined ? {} : { isHost }),
    };
}

async function getRecord(storeName: string, key: IDBValidKey): Promise<unknown> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).get(key);
        let result: unknown;
        request.onsuccess = () => {
            result = request.result;
        };
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("Impossible de lire le stockage de reprise."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("La lecture de reprise a été interrompue."));
    });
}

async function putRecord(storeName: string, value: IDBValidKey | object): Promise<void> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).put(value);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("Impossible d’enregistrer la reprise."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("L’enregistrement de reprise a été interrompu."));
    });
}

async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("Impossible d’effacer les données de reprise."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("L’effacement de reprise a été interrompu."));
    });
}

export function getRecoverySessionId(): string {
    const storedId = sessionStorage.getItem(SESSION_ID_KEY);
    if (storedId) return storedId;

    const sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    return sessionId;
}

export function getRecoverableScreen(): RecoverableScreen | null {
    const screen = sessionStorage.getItem(ACTIVE_SCREEN_KEY);
    return screen === "game" || screen === "simulation" ? screen : null;
}

export function saveActiveScreen(screen: RecoverableScreen | null): void {
    if (screen === null) {
        sessionStorage.removeItem(ACTIVE_SCREEN_KEY);
    } else {
        sessionStorage.setItem(ACTIVE_SCREEN_KEY, screen);
    }
}

export async function saveGameSession(
    sessionId: string,
    setup: GameSetup,
    snapshot: GameSnapshot,
    roomCode: string | null,
    roomRole: "host" | "guest" | null,
): Promise<void> {
    const savedSetup = { ...setup };
    delete savedSetup.resumeSnapshot;
    const record: GameSessionRecord = {
        version: RECORD_VERSION,
        sessionId,
        setup: savedSetup,
        snapshot,
        roomCode,
        roomRole,
    };
    await putRecord(GAME_SESSION_STORE, record);
}

export async function loadGameSession(sessionId: string): Promise<SavedGameSession | null> {
    const value = await getRecord(GAME_SESSION_STORE, sessionId);
    if (value === undefined) return null;
    const roomCode = isRecord(value) && "roomCode" in value ? value.roomCode : undefined;
    const roomRole = isRecord(value) && "roomRole" in value ? value.roomRole : undefined;
    const parsedRoomCode = parseNullableString(roomCode);
    const parsedRoomRole = parseRoomRole(roomRole);
    if (
        !isRecord(value) ||
        value.version !== RECORD_VERSION ||
        !isGameSnapshot(value.snapshot) ||
        parsedRoomCode === undefined ||
        parsedRoomRole === undefined
    ) {
        throw new Error("La sauvegarde de la partie est invalide ou incompatible.");
    }
    const setup = parseGameSetup(value.setup);
    if (!setup) throw new Error("La configuration de la partie sauvegardée est invalide.");

    return {
        setup,
        snapshot: value.snapshot,
        roomCode: parsedRoomCode,
        roomRole: parsedRoomRole,
    };
}

export async function clearGameSession(sessionId: string): Promise<void> {
    await deleteRecord(GAME_SESSION_STORE, sessionId);
}

export async function saveSimulationRun(sessionId: string, run: SavedSimulationRun): Promise<void> {
    const database = await openDatabase();
    const record: SimulationRunRecord = { ...run, version: RECORD_VERSION, sessionId };
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            [SIMULATION_RUN_STORE, SIMULATION_CHUNK_STORE],
            "readwrite",
        );
        transaction.objectStore(SIMULATION_RUN_STORE).put(record);
        transaction.objectStore(SIMULATION_CHUNK_STORE).delete(range);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("Impossible d’enregistrer la simulation."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("L’enregistrement de la simulation a échoué."));
    });
}

export async function loadSimulationRun(sessionId: string): Promise<SavedSimulationRun | null> {
    const value = await getRecord(SIMULATION_RUN_STORE, sessionId);
    if (value === undefined) return null;
    if (
        !isRecord(value) ||
        value.version !== RECORD_VERSION ||
        !isSimulationOptions(value.options) ||
        !Array.isArray(value.chunks)
    ) {
        throw new Error("La simulation à reprendre est invalide ou incompatible.");
    }
    const configuration = parseGameConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    let expectedStartIndex = 0;
    const chunks: SimulationChunk[] = [];
    for (const chunk of value.chunks) {
        if (
            !isRecord(chunk) ||
            chunk.startIndex !== expectedStartIndex ||
            !Number.isInteger(chunk.games) ||
            (chunk.games as number) < 1
        ) {
            throw new Error("Les lots de la simulation à reprendre sont invalides.");
        }
        const validChunk = { startIndex: chunk.startIndex as number, games: chunk.games as number };
        expectedStartIndex += validChunk.games;
        chunks.push(validChunk);
    }
    if (!configuration || !board || expectedStartIndex !== value.options.games) {
        throw new Error("La configuration de la simulation à reprendre est invalide.");
    }
    return { options: value.options, configuration, board, chunks };
}

export async function saveSimulationChunk(
    sessionId: string,
    startIndex: number,
    result: SimulationBatchResult,
): Promise<void> {
    const record: SimulationChunkRecord = {
        sessionId,
        startIndex,
        result,
        version: RECORD_VERSION,
    };
    await putRecord(SIMULATION_CHUNK_STORE, record);
}

export async function loadSimulationChunks(sessionId: string): Promise<SavedSimulationChunk[]> {
    const database = await openDatabase();
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SIMULATION_CHUNK_STORE, "readonly");
        const request = transaction.objectStore(SIMULATION_CHUNK_STORE).getAll(range);
        let results: SavedSimulationChunk[] = [];
        request.onsuccess = () => {
            const records: unknown[] = request.result;
            if (
                records.some(
                    (record) =>
                        !isRecord(record) ||
                        record.sessionId !== sessionId ||
                        record.version !== RECORD_VERSION ||
                        !Number.isInteger(record.startIndex) ||
                        !isRecord(record.result) ||
                        record.result.schemaVersion !== 1 ||
                        !Array.isArray(record.result.matches),
                )
            ) {
                reject(new Error("Les résultats partiels de la simulation sont invalides."));
                return;
            }
            results = records.map((record) => ({
                startIndex: (record as SimulationChunkRecord).startIndex,
                result: (record as SimulationChunkRecord).result,
            }));
        };
        transaction.oncomplete = () => resolve(results);
        transaction.onerror = () =>
            reject(transaction.error ?? new Error("Impossible de lire les résultats partiels."));
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("La lecture des résultats partiels a échoué."));
    });
}

export async function clearSimulationRun(sessionId: string): Promise<void> {
    const database = await openDatabase();
    const range = IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(
            [SIMULATION_RUN_STORE, SIMULATION_CHUNK_STORE],
            "readwrite",
        );
        transaction.objectStore(SIMULATION_RUN_STORE).delete(sessionId);
        transaction.objectStore(SIMULATION_CHUNK_STORE).delete(range);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () =>
            reject(
                transaction.error ?? new Error("Impossible d’effacer la simulation sauvegardée."),
            );
        transaction.onabort = () =>
            reject(transaction.error ?? new Error("L’effacement de la simulation a échoué."));
    });
}
