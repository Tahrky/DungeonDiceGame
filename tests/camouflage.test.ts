import { describe, expect, it } from "vitest";

import {
    canDirectlyTargetMonster,
    clearCamouflageOnFirstAction,
    isAreaAttack,
} from "../src/game/monsterActions";
import { MONSTERS } from "../src/data/monsters";
import { cloneMatchState } from "../src/simulation/combat";
import type { PlacedMonster } from "../src/types/GameTypes";

function createThief(isCamouflaged = false): PlacedMonster {
    const thief = MONSTERS.find((monster) => monster.id === "thief");
    if (!thief) throw new Error("Thief profile unavailable.");
    return {
        id: "thief-1",
        monster: thief,
        owner: 1,
        position: { x: 2, y: 2 },
        facing: "east",
        currentHp: thief.hp,
        cells: [{ x: 2, y: 2 }],
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: [0],
        movementsUsedThisTurn: 0,
        attackCooldowns: [0],
        statusEffects: [],
        isCamouflaged,
    };
}

describe("camouflage du Voleur", () => {
    it("empêche les cibles directes alliées ou ennemies", () => {
        const thief = createThief(true);
        const adjacent = thief.monster.attacks[0];

        expect(canDirectlyTargetMonster(adjacent, thief)).toBe(false);
        expect(canDirectlyTargetMonster({
            pattern: { type: "radius", range: 4 },
        }, thief)).toBe(true);
        expect(canDirectlyTargetMonster({
            pattern: { type: "line", range: 4, length: 3 },
        }, thief)).toBe(true);
    });

    it("retire le camouflage à la première action", () => {
        const thief = createThief(true);
        clearCamouflageOnFirstAction(thief);
        expect(thief.isCamouflaged).toBe(false);
    });

    it("conserve les états de zone et de camouflage lors du clonage", () => {
        const thief = createThief(true);
        const state = {
            turn: 1,
            currentPlayer: 1,
            profiles: { 1: "balanced", 2: "balanced" },
            tactics: { 1: "balanced", 2: "balanced" },
            allowBaseAttackOnSummonTurn: true,
            winner: null,
            finishReason: "turnLimit",
            health: { 1: 5, 2: 5 },
            reserves: {
                1: { invocation: 0, attack: 5, movement: 5 },
                2: { invocation: 0, attack: 5, movement: 5 },
            },
            monsters: [thief],
            movementStagnation: {},
            history: [],
            statistics: { 1: { ...{} }, 2: { ...{} } },
            nextMonsterId: 2,
            monstersKilledForVictory: 6,
        } as Parameters<typeof cloneMatchState>[0];
        const clone = cloneMatchState(state);
        expect(clone.monsters[0].isCamouflaged).toBe(true);
        clone.monsters[0].isCamouflaged = false;
        expect(thief.isCamouflaged).toBe(true);
    });

    it("identifie les attaques de zone, y compris en ligne et circulaires", () => {
        expect(isAreaAttack({ pattern: { type: "selfRadius", range: 2 } })).toBe(true);
        expect(isAreaAttack({ pattern: { type: "line", range: 4, length: 3 } })).toBe(true);
        expect(isAreaAttack({ pattern: { type: "radius", range: 4 } })).toBe(true);
        expect(isAreaAttack({ pattern: { type: "adjacent" } })).toBe(false);
    });
});
