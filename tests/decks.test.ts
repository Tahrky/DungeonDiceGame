import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";
import {
    DECK_SIZE,
    getDefaultDeck,
    getPlayerDecks,
    parseDeck,
    serializeDeck,
} from "../src/game/decks";
import { MAX_AVAILABLE_DECK_SIZE, MIN_DECK_SIZE } from "../src/game/gameConfiguration";

describe("sélections de monstres", () => {
    it("choisit les cinq monstres les moins chers par défaut", () => {
        const deck = getDefaultDeck();
        const costs = deck.map((id) => MONSTERS.find((monster) => monster.id === id)!.cost);

        expect(deck).toHaveLength(DECK_SIZE);
        expect(costs).toEqual([...costs].sort((first, second) => first - second));
        expect(costs).toEqual([1, 2, 2, 3, 3]);
    });

    it("valide et sérialise un deck JSON de cinq monstres uniques", () => {
        const deck = getDefaultDeck();

        expect(parseDeck(JSON.parse(serializeDeck(deck)))).toEqual(deck);
    });

    it("crée et valide un deck de taille configurable dans les limites disponibles", () => {
        const deck = getDefaultDeck(MIN_DECK_SIZE);
        const largestDeck = getDefaultDeck(MAX_AVAILABLE_DECK_SIZE);

        expect(deck).toHaveLength(MIN_DECK_SIZE);
        expect(parseDeck(deck, MIN_DECK_SIZE)).toEqual(deck);
        expect(largestDeck).toHaveLength(MAX_AVAILABLE_DECK_SIZE);
        expect(parseDeck(largestDeck, MAX_AVAILABLE_DECK_SIZE)).toEqual(largestDeck);
        expect(parseDeck(deck, DECK_SIZE)).toBeNull();
    });

    it("associe les decks à leurs joueurs même quand le joueur local est le joueur 2", () => {
        const playerDeck = getDefaultDeck();
        const opponentDeck = [...playerDeck].reverse();

        expect(getPlayerDecks(playerDeck, opponentDeck, 2)).toEqual({
            1: opponentDeck,
            2: playerDeck,
        });
    });

    it("refuse un JSON qui ne contient pas cinq monstres disponibles et uniques", () => {
        expect(parseDeck(["slime", "dragon"])).toBeNull();
        expect(parseDeck(["slime", "slime", "dragon", "knight", "golem"])).toBeNull();
        expect(parseDeck(["slime", "dragon", "knight", "golem", "unknown"])).toBeNull();
    });
});
