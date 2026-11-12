import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";

describe("profils de monstres", () => {
    it("configure le Mage de Givre pour frapper une ligne de trois cases dans les quatre directions", () => {
        const frostMage = MONSTERS.find((monster) => monster.id === "frost-mage");

        expect(frostMage?.attacks[0]).toMatchObject({
            cost: 2,
            damage: 3,
            hitsAllies: true,
            pattern: { type: "line", range: 4, length: 3, allDirections: true },
        });
    });

    it("configure l'Archer squelette et son attaque circulaire à distance", () => {
        const archer = MONSTERS.find((monster) => monster.id === "archer");

        expect(archer).toMatchObject({
            cost: 1,
            hp: 2,
            movementRange: 2,
        });
        expect(archer?.attacks[0]).toMatchObject({
            damage: 1,
            pattern: { type: "radius", range: 5 },
        });
        expect(archer?.attacks[1]).toMatchObject({
            damage: 3,
            cooldownTurns: 3,
            pattern: { type: "radius", range: 5 },
        });
    });

    it("configure le Fantôme et son déplacement gratuit", () => {
        const ghost = MONSTERS.find((monster) => monster.id === "ghost");

        expect(ghost?.movementCost).toBe(0);
        expect(ghost?.attacks).toEqual([
            {
                name: "Coup au corps à corps",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ]);
    });

    it("configure le Voleur sournois avec ses statistiques spéciales", () => {
        const thief = MONSTERS.find((monster) => monster.id === "thief");

        expect(thief).toMatchObject({
            cost: 3,
            hp: 4,
            bonusDamageFromBehind: 3,
            movementRange: 3,
        });
        expect(thief?.attacks[0]).toMatchObject({ damage: 2, cost: 1 });
    });
});
