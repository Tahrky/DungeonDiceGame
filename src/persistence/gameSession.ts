import type { RoomRole } from "../app/types";
import { parseBoardDefinition } from "../game/boards";
import { parseBotDecisionOptions } from "../game/botConfiguration";
import { parseBotStrategyWeightMap } from "../game/botStrategy";
import { parseDeck, type GameSetup } from "../game/decks";
import { parseSavedMatchConfiguration } from "../game/gameConfiguration";
import { isGameSnapshot } from "../scenes/GameSceneProtocol";
import type { GameSnapshot } from "../types/GameTypes";
import { isRecord } from "../utils/guards";
import { isProfile } from "./guards";
import {
    deleteRecord,
    getRecord,
    putRecord,
    GAME_SESSION_STORE,
    RECORD_VERSION,
} from "./indexedDb";

export interface SavedGameSession {
    readonly setup: GameSetup;
    readonly snapshot: GameSnapshot;
    readonly roomCode: string | null;
    readonly roomRole: RoomRole | null;
}

function parseNullableString(value: unknown): string | null | undefined {
    if (value === null) return null;
    return typeof value === "string" ? value : undefined;
}

function parseRoomRole(value: unknown): RoomRole | null | undefined {
    if (value === null) return null;
    return value === "host" || value === "guest" ? value : undefined;
}

export function parseGameSetup(value: unknown): GameSetup | null {
    if (
        !isRecord(value) ||
        (value.mode !== "computer" && value.mode !== "local" && value.mode !== "online")
    ) {
        return null;
    }

    const configuration = parseSavedMatchConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    if (!configuration || !board) return null;
    const playerDeck = parseDeck(value.playerDeck, configuration.deckSize);
    const opponentDeck = parseDeck(value.opponentDeck, configuration.deckSize);
    if (!playerDeck || !opponentDeck) return null;

    const opponentProfile = isProfile(value.opponentProfile) ? value.opponentProfile : undefined;
    const playerProfile = isProfile(value.playerProfile) ? value.playerProfile : undefined;
    const botOptions =
        value.botOptions === undefined ? undefined : parseBotDecisionOptions(value.botOptions);
    const botStrategyWeights =
        value.botStrategyWeights === undefined
            ? undefined
            : parseBotStrategyWeightMap(value.botStrategyWeights);
    const randomSeed = typeof value.randomSeed === "number" ? value.randomSeed : undefined;
    const localPlayer =
        value.localPlayer === 1 || value.localPlayer === 2 ? value.localPlayer : undefined;
    const isHost = typeof value.isHost === "boolean" ? value.isHost : undefined;
    if (
        (value.opponentProfile !== undefined && opponentProfile === undefined) ||
        (value.playerProfile !== undefined && playerProfile === undefined) ||
        botOptions === null ||
        botStrategyWeights === null ||
        (value.randomSeed !== undefined &&
            (randomSeed === undefined ||
                !Number.isInteger(randomSeed) ||
                randomSeed < 0 ||
                randomSeed > 0xffffffff)) ||
        (value.localPlayer !== undefined && localPlayer === undefined) ||
        (value.isHost !== undefined && isHost === undefined)
    ) {
        return null;
    }

    return {
        mode: value.mode,
        configuration,
        board,
        playerDeck,
        opponentDeck,
        ...(opponentProfile === undefined ? {} : { opponentProfile }),
        ...(playerProfile === undefined ? {} : { playerProfile }),
        ...(botOptions === undefined ? {} : { botOptions }),
        ...(botStrategyWeights === undefined ? {} : { botStrategyWeights }),
        ...(randomSeed === undefined ? {} : { randomSeed }),
        ...(localPlayer === undefined ? {} : { localPlayer }),
        ...(isHost === undefined ? {} : { isHost }),
    };
}

export async function saveGameSession(
    sessionId: string,
    setup: GameSetup,
    snapshot: GameSnapshot,
    roomCode: string | null,
    roomRole: RoomRole | null,
): Promise<void> {
    const savedSetup = { ...setup };
    delete savedSetup.resumeSnapshot;
    await putRecord(GAME_SESSION_STORE, {
        version: RECORD_VERSION,
        sessionId,
        setup: savedSetup,
        snapshot,
        roomCode,
        roomRole,
    });
}

export async function loadGameSession(sessionId: string): Promise<SavedGameSession | null> {
    const value = await getRecord(GAME_SESSION_STORE, sessionId);
    if (value === undefined) return null;
    const record = isRecord(value) ? value : null;
    const roomCode = parseNullableString(record?.roomCode);
    const roomRole = parseRoomRole(record?.roomRole);
    if (
        !record ||
        record.version !== RECORD_VERSION ||
        !isGameSnapshot(record.snapshot) ||
        roomCode === undefined ||
        roomRole === undefined
    ) {
        throw new Error("La sauvegarde de la partie est invalide ou incompatible.");
    }
    const setup = parseGameSetup(record.setup);
    if (!setup) throw new Error("La configuration de la partie sauvegardée est invalide.");

    return { setup, snapshot: record.snapshot, roomCode, roomRole };
}

export function clearGameSession(sessionId: string): Promise<void> {
    return deleteRecord(GAME_SESSION_STORE, sessionId);
}
