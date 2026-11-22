import { describe, expect, it } from "vitest";

import { getInvokedMonsterCount, getMonsterEliminationWinner } from "../src/game/matchRules";

import type { PlacedMonster, PlayerId } from "../src/types/GameTypes";

function createMonsters(player: PlayerId, count: number, currentHp: number): PlacedMonster[] {
    return Array.from({ length: count }, (_, index) => ({
        id: `monster-${player}-${index}`,
        monster: {
            id: "test",
            name: "Test",
            symbol: "T",
            color: 0,
            cost: 1,
            hp: 1,
            attacks: [],
            movementRange: 1,
        },
        owner: player,
        position: { x: index, y: player },
        facing: "east",
        currentHp,
        cells: [{ x: index, y: player }],
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: [],
        movementsUsedThisTurn: 0,
        attackCooldowns: [],
        statusEffects: [],
    }));
}

describe("limite d'invocations et victoire au nombre de monstres éliminés", () => {
    it("compte les monstres invoqués même après leur mort", () => {
        expect(getInvokedMonsterCount(createMonsters(1, 8, 0), 1)).toBe(8);
    });

    it("déclare la victoire après six monstres tués", () => {
        expect(
            getMonsterEliminationWinner([...createMonsters(1, 5, 0), ...createMonsters(2, 1, 1)]),
        ).toBe(null);
        expect(
            getMonsterEliminationWinner([...createMonsters(1, 6, 0), ...createMonsters(2, 1, 1)]),
        ).toBe(2);
    });

    it("utilise un seuil de monstres tués indépendant de la limite d'invocations", () => {
        expect(
            getMonsterEliminationWinner([
                ...createMonsters(1, 1, 1),
                ...createMonsters(2, 2, 0),
            ], 3),
        ).toBe(null);
        expect(
            getMonsterEliminationWinner([
                ...createMonsters(1, 1, 1),
                ...createMonsters(2, 3, 0),
            ], 3),
        ).toBe(1);
    });
});
