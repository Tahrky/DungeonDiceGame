import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";

describe("profils de monstres", () => {
    it("configure le Dragon pour frapper une ligne de trois cases dans les quatre directions", () => {
        const dragon = MONSTERS.find((monster) => monster.id === "dragon");

        expect(dragon?.attacks[0]).toMatchObject({
            cost: 1,
            damage: 3,
            hitsAllies: true,
            pattern: { type: "line", range: 4, length: 3, allDirections: true },
        });
        expect(dragon?.flying).toBe(true);
    });

    it("configure l'Archer squelette et son attaque circulaire à distance", () => {
        const archer = MONSTERS.find((monster) => monster.id === "skeleton-archer");

        expect(archer).toMatchObject({
            cost: 2,
            hp: 3,
            movementRange: 2,
        });
        expect(archer?.attacks[0]).toMatchObject({
            damage: 1,
            pattern: { type: "radius", range: 5 },
        });
    });

    it("configure les deux attaques du Slime", () => {
        const slime = MONSTERS.find((monster) => monster.id === "slime");

        expect(slime?.movementCost).toBe(0);
        expect(slime?.attacks).toEqual([
            {
                name: "Saut écrasant",
                damage: 1,
                cost: 3,
                pattern: { type: "jumpArea", range: 5, width: 2, depth: 2 },
                hitsAllies: true,
                movesToZone: true,
            },
            {
                name: "Coup au corps à corps",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ]);
    });

    it("configure le Voleur sournois avec ses statistiques spéciales", () => {
        const thief = MONSTERS.find((monster) => monster.id === "sneaky-thief");

        expect(thief).toMatchObject({
            cost: 3,
            hp: 4,
            bonusDamageFromBehind: 2,
            movementRange: 3,
        });
        expect(thief?.attacks[0]).toMatchObject({ damage: 1, cost: 1 });
    });
});
