import type { PresenceMessage } from "@ably/pubsub-device";

import { parseBoardDefinition, type BoardDefinition } from "../game/boards";
import { parseDeck } from "../game/decks";
import { parseGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import { isRecord } from "../utils/guards";
import type { RoomPlayer } from "./types";

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const ROOM_CODE_LENGTH = 8;
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_CHARACTERS}]{${ROOM_CODE_LENGTH}}$`);

export interface StartPayload {
    readonly hostDeck: string[];
    readonly guestDeck: string[];
    readonly board: BoardDefinition;
    readonly configuration: GameConfiguration;
}

export function createRoomCode(): string {
    return [...window.crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH))]
        .map((value) => ROOM_CODE_CHARACTERS[value % ROOM_CODE_CHARACTERS.length])
        .join("");
}

export function readRoomPlayer(member: PresenceMessage): RoomPlayer | null {
    const data = member.data;
    if (typeof member.clientId !== "string" || !isRecord(data)) return null;

    const role = "role" in data ? data.role : null;
    const deck = "deck" in data ? parseDeck(data.deck) : null;
    if ((role !== "host" && role !== "guest") || !deck) return null;

    return { clientId: member.clientId, role, deck };
}

export function isStartMessageData(data: unknown): data is Record<string, unknown> {
    return isRecord(data) && "hostDeck" in data && "guestDeck" in data;
}

export function parseStartPayload(data: Record<string, unknown>): StartPayload | null {
    const board = parseBoardDefinition(data.board);
    const configuration = parseGameConfiguration(data.configuration);
    if (!board || !configuration) return null;

    const hostDeck = parseDeck(data.hostDeck, configuration.deckSize);
    const guestDeck = parseDeck(data.guestDeck, configuration.deckSize);
    return hostDeck && guestDeck ? { hostDeck, guestDeck, board, configuration } : null;
}
