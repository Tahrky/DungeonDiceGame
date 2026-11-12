import { MONSTERS } from "../data/monsters";
import type { BoardDefinition, BoardSelection } from "./boards";
import type { GameConfiguration } from "./gameConfiguration";

export const DECK_SIZE = 5;
export const DECK_STORAGE_KEY = "dungeon-dice.deck";

export interface GameSetup {
    mode: "computer" | "local" | "online";
    playerDeck: string[];
    opponentDeck: string[];
    configuration?: GameConfiguration;
    board?: BoardDefinition;
    boardSelection?: BoardSelection;
    localPlayer?: 1 | 2;
    isHost?: boolean;
}

export function getDefaultDeck(): string[] {
    return [...MONSTERS]
        .sort((first, second) => first.cost - second.cost)
        .slice(0, DECK_SIZE)
        .map((monster) => monster.id);
}

export function parseDeck(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.length !== DECK_SIZE) return null;
    if (!value.every((id): id is string => typeof id === "string")) return null;

    const deck = [...new Set(value)];
    if (
        deck.length !== DECK_SIZE ||
        deck.some((id) => !MONSTERS.some((monster) => monster.id === id))
    ) {
        return null;
    }

    return deck;
}

export function serializeDeck(deck: readonly string[]): string {
    return JSON.stringify(deck, null, 2);
}

export function getSavedDeck(): string[] | null {
    try {
        const storedDeck = localStorage.getItem(DECK_STORAGE_KEY);
        return storedDeck === null ? null : parseDeck(JSON.parse(storedDeck));
    } catch {
        return null;
    }
}
