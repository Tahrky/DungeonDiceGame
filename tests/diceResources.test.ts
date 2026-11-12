import { describe, expect, it } from "vitest";

import { DICE } from "../src/data/dice";
import {
    createEmptyDiceReserve,
    getAvailableSymbolCount,
    spendSymbols,
    storeRemainingDice,
    storeRolledDie,
} from "../src/game/diceResources";

import type { RolledDie } from "../src/types/GameTypes";

describe("dés", () => {
    it("configure cinq dés identiques avec la distribution de faces demandée", () => {
        expect(DICE).toHaveLength(5);
        expect(new Set(DICE.map((die) => die.faces.join(","))).size).toBe(1);
        expect(DICE[0].faces).toHaveLength(6);
        expect(DICE[0].faces.filter((face) => face === "invocation")).toHaveLength(3);
        expect(DICE[0].faces.filter((face) => face === "attack")).toHaveLength(2);
        expect(DICE[0].faces.filter((face) => face === "movement")).toHaveLength(1);
    });
});

describe("réserve et dépense des symboles", () => {
    it("stocke un dé dans la réserve du symbole correspondant une seule fois", () => {
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "attack", status: "available" },
        ];
        const reserve = createEmptyDiceReserve();

        expect(storeRolledDie(rolledDice, 0, reserve)).toBe(true);
        expect(storeRolledDie(rolledDice, 0, reserve)).toBe(false);
        expect(reserve.attack).toBe(1);
        expect(getAvailableSymbolCount("attack", rolledDice, reserve)).toBe(1);
    });

    it("garde les réserves des deux joueurs indépendantes", () => {
        const playerOneReserve = createEmptyDiceReserve();
        const playerTwoReserve = createEmptyDiceReserve();
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "attack", status: "available" },
        ];

        storeRolledDie(rolledDice, 0, playerOneReserve);

        expect(playerOneReserve.attack).toBe(1);
        expect(playerTwoReserve.attack).toBe(0);
    });

    it("dépense les dés non stockés avant de compléter avec la réserve", () => {
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "invocation", status: "available" },
            { definitionId: "standard-2", symbol: "invocation", status: "stored" },
        ];
        const reserve = { invocation: 1, attack: 0, movement: 0 };

        expect(spendSymbols("invocation", 1, rolledDice, reserve)).toBe(true);
        expect(rolledDice[0].status).toBe("spent");
        expect(reserve.invocation).toBe(1);

        expect(spendSymbols("invocation", 1, rolledDice, reserve)).toBe(true);
        expect(reserve.invocation).toBe(0);
    });

    it("ne modifie rien si la réserve et les dés ne suffisent pas", () => {
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "movement", status: "available" },
        ];
        const reserve = createEmptyDiceReserve();

        expect(spendSymbols("attack", 1, rolledDice, reserve)).toBe(false);
        expect(rolledDice[0].status).toBe("available");
        expect(reserve.attack).toBe(0);
    });

    it("stocke automatiquement tous les dés disponibles à la fin du tour", () => {
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "invocation", status: "available" },
            { definitionId: "standard-2", symbol: "attack", status: "spent" },
            { definitionId: "standard-3", symbol: "movement", status: "stored" },
        ];
        const reserve = { invocation: 0, attack: 0, movement: 1 };

        storeRemainingDice(rolledDice, reserve);

        expect(rolledDice.map((die) => die.status)).toEqual(["stored", "spent", "stored"]);
        expect(reserve).toEqual({ invocation: 1, attack: 0, movement: 1 });
    });
});
