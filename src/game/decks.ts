import { MONSTERS } from "../data/monsters";
import type { BoardDefinition, BoardSelection } from "./boards";
import { DEFAULT_DECK_SIZE, MAX_AVAILABLE_DECK_SIZE, MIN_DECK_SIZE } from "./gameConfiguration";
import type { GameConfiguration } from "./gameConfiguration";
import type { PlayerId } from "../types/GameTypes";
import type { GameSnapshot } from "../types/GameTypes";
import type { BotProfile } from "./botStrategy";

export const DECK_SIZE = DEFAULT_DECK_SIZE;
export const DECK_STORAGE_KEY = "dungeon-dice.deck";

export interface GameSetup {
    mode: "computer" | "local" | "online";
    playerDeck: string[];
    opponentDeck: string[];
    opponentProfile?: BotProfile;
    configuration?: GameConfiguration;
    board?: BoardDefinition;
    boardSelection?: BoardSelection;
    localPlayer?: 1 | 2;
    isHost?: boolean;
    resumeSnapshot?: GameSnapshot;
}

export function getDefaultDeck(deckSize = DEFAULT_DECK_SIZE): string[] {
    return [...MONSTERS]
        .sort((first, second) => first.cost - second.cost)
        .slice(0, deckSize)
        .map((monster) => monster.id);
}

export function getPlayerDecks(
    playerDeck: string[],
    opponentDeck: string[],
    localPlayer: PlayerId,
): Record<PlayerId, string[]> {
    return localPlayer === 1
        ? { 1: playerDeck, 2: opponentDeck }
        : { 1: opponentDeck, 2: playerDeck };
}

export function parseDeck(value: unknown, deckSize?: number): string[] | null {
    if (
        !Array.isArray(value) ||
        value.length < MIN_DECK_SIZE ||
        value.length > MAX_AVAILABLE_DECK_SIZE ||
        (deckSize !== undefined && value.length !== deckSize)
    ) {
        return null;
    }

    if (!value.every((id): id is string => typeof id === "string")) return null;

    const deck = [...new Set(value)];
    if (
        deck.length !== value.length ||
        deck.some((id) => !MONSTERS.some((monster) => monster.id === id))
    ) {
        return null;
    }

    return deck;
}

export function serializeDeck(deck: readonly string[]): string {
    return JSON.stringify(deck, null, 2);
}

export function getSavedDeck(deckSize = DEFAULT_DECK_SIZE): string[] | null {
    try {
        const storedDeck = localStorage.getItem(DECK_STORAGE_KEY);
        return storedDeck === null ? null : parseDeck(JSON.parse(storedDeck), deckSize);
    } catch {
        return null;
    }
}
