import { describe, expect, it } from "vitest";

import { DICE } from "../src/data/dice";
import {
    addSymbolsToReserve,
    convertReservedSymbols,
    createEmptyDiceReserve,
    getAvailableSymbolCount,
    getRollableDieFaces,
    rollDieSymbol,
    spendSymbols,
    storeRemainingDice,
    storeRolledDie,
} from "../src/game/diceResources";

import type { RolledDie } from "../src/types/GameTypes";

describe("dés", () => {
    it("configure huit dés identiques avec la distribution de faces demandée", () => {
        expect(DICE).toHaveLength(8);
        expect(new Set(DICE.map((die) => die.faces.join(","))).size).toBe(1);
        expect(DICE[0].faces).toHaveLength(6);
        expect(DICE[0].faces.filter((face) => face === "invocation")).toHaveLength(3);
        expect(DICE[0].faces.filter((face) => face === "attack")).toHaveLength(2);
        expect(DICE[0].faces.filter((face) => face === "movement")).toHaveLength(1);
    });

    it("retire les invocations des faces uniquement quand l’option le demande", () => {
        expect(getRollableDieFaces(DICE[0], false)).toEqual(DICE[0].faces);
        expect(getRollableDieFaces(DICE[0], true)).toEqual(["attack", "attack", "movement"]);
    });

    it("utilise le choix injecté sur les faces disponibles et rejette un indice invalide", () => {
        expect(rollDieSymbol(DICE[0], true, (count) => count - 1)).toBe("movement");
        expect(() => rollDieSymbol(DICE[0], true, (count) => count)).toThrow(RangeError);
    });
});

describe("réserve et dépense des symboles", () => {
    it("ajoute le même nombre de symboles à chaque réserve", () => {
        const reserve = { invocation: 1, attack: 2, movement: 3 };

        addSymbolsToReserve(reserve, 100);

        expect(reserve).toEqual({ invocation: 101, attack: 102, movement: 103 });
    });

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

    it("convertit deux symboles réservés en un symbole choisi", () => {
        const reserve = { invocation: 1, attack: 1, movement: 0 };

        expect(convertReservedSymbols(reserve, ["invocation", "attack"], "movement")).toBe(true);
        expect(reserve).toEqual({ invocation: 0, attack: 0, movement: 1 });
    });

    it("convertit deux symboles identiques et préserve la réserve si la sélection est invalide", () => {
        const reserve = { invocation: 1, attack: 0, movement: 0 };

        expect(convertReservedSymbols(reserve, ["invocation", "invocation"], "attack")).toBe(false);
        expect(reserve).toEqual({ invocation: 1, attack: 0, movement: 0 });

        reserve.invocation++;
        expect(convertReservedSymbols(reserve, ["invocation", "invocation"], "invocation")).toBe(
            false,
        );
        expect(reserve).toEqual({ invocation: 2, attack: 0, movement: 0 });
        expect(convertReservedSymbols(reserve, ["invocation", "invocation"], "attack")).toBe(true);
        expect(reserve).toEqual({ invocation: 0, attack: 1, movement: 0 });
    });

    it("refuse un symbole source comme résultat après une conversion mixte", () => {
        const reserve = { invocation: 0, attack: 1, movement: 1 };

        expect(convertReservedSymbols(reserve, ["attack", "movement"], "attack")).toBe(false);
        expect(convertReservedSymbols(reserve, ["attack", "movement"], "movement")).toBe(false);
        expect(reserve).toEqual({ invocation: 0, attack: 1, movement: 1 });
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

    it("ajoute immédiatement les dés lancés à la réserve sans écraser les réserves existantes", () => {
        const rolledDice: RolledDie[] = [
            { definitionId: "standard-1", symbol: "invocation", status: "available" },
            { definitionId: "standard-2", symbol: "attack", status: "available" },
        ];
        const reserve = { invocation: 2, attack: 0, movement: 1 };

        storeRemainingDice(rolledDice, reserve);

        expect(rolledDice.map((die) => die.status)).toEqual(["stored", "stored"]);
        expect(reserve).toEqual({ invocation: 3, attack: 1, movement: 1 });
    });
});
