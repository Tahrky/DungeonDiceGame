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
        movementsUsedThisTurn: 0,
        attackCooldowns: [],
    }));
}

describe("limite d'invocations et victoire par élimination", () => {
    it("compte les monstres invoqués même après leur mort", () => {
        expect(getInvokedMonsterCount(createMonsters(1, 8, 0), 1)).toBe(8);
    });

    it("déclare la victoire uniquement après la mort des huit monstres et si l'adversaire en a encore", () => {
        expect(
            getMonsterEliminationWinner([...createMonsters(1, 7, 0), ...createMonsters(2, 1, 1)]),
        ).toBe(null);
        expect(
            getMonsterEliminationWinner([...createMonsters(1, 8, 0), ...createMonsters(2, 1, 1)]),
        ).toBe(2);
        expect(
            getMonsterEliminationWinner([...createMonsters(1, 8, 0), ...createMonsters(2, 1, 0)]),
        ).toBe(null);
    });

    it("utilise la limite d'invocations configurée pour la victoire par élimination", () => {
        expect(
            getMonsterEliminationWinner([
                ...createMonsters(1, 1, 0),
                ...createMonsters(2, 1, 1),
            ], 2),
        ).toBe(null);
        expect(
            getMonsterEliminationWinner([
                ...createMonsters(1, 2, 0),
                ...createMonsters(2, 1, 1),
            ], 2),
        ).toBe(2);
    });
});
