import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";
import { DECK_SIZE, getDefaultDeck, parseDeck, serializeDeck } from "../src/game/decks";

describe("sélections de monstres", () => {
    it("choisit les cinq monstres les moins chers par défaut", () => {
        const deck = getDefaultDeck();
        const costs = deck.map((id) => MONSTERS.find((monster) => monster.id === id)!.cost);

        expect(deck).toHaveLength(DECK_SIZE);
        expect(costs).toEqual([...costs].sort((first, second) => first - second));
        expect(costs).toEqual([1, 2, 3, 3, 4]);
    });

    it("valide et sérialise un deck JSON de cinq monstres uniques", () => {
        const deck = getDefaultDeck();

        expect(parseDeck(JSON.parse(serializeDeck(deck)))).toEqual(deck);
    });

    it("refuse un JSON qui ne contient pas cinq monstres disponibles et uniques", () => {
        expect(parseDeck(["slime", "dragon"])).toBeNull();
        expect(parseDeck(["slime", "slime", "dragon", "knight", "golem"])).toBeNull();
        expect(parseDeck(["slime", "dragon", "knight", "golem", "unknown"])).toBeNull();
    });
});
