import { describe, expect, it } from "vitest";
import {
    chanceValue,
    maxValue,
    minValue,
    shouldStopSearch,
} from "../src/simulation/combat/expectiminimax";
import { cloneMatchState, createStats, type MatchState } from "../src/simulation/matchState";
import { createSearchCacheKey } from "../src/simulation/combat/searchState";

describe("Expectiminimax", () => {
    it("MAX choisit la meilleure branche", () => {
        expect(maxValue([3, 9, 5], (value) => value)).toBe(9);
    });

    it("MIN choisit la réponse la plus défavorable", () => {
        expect(minValue([3, 9, 5], (value) => value)).toBe(3);
    });

    it("CHANCE calcule une espérance pondérée", () => {
        expect(
            chanceValue(
                [
                    { outcome: 0, probability: 0.25 },
                    { outcome: 10, probability: 0.75 },
                ],
                (value) => value,
            ),
        ).toBeCloseTo(7.5);
    });

    it("respecte le budget maximal", () => {
        const context = { nodes: 3, budgetReached: false, transpositions: 0 };
        expect(shouldStopSearch(context, { maxDepth: 2, branchWidth: 5, nodeBudget: 3 })).toBe(
            true,
        );
        expect(context.budgetReached).toBe(true);
    });

    it("clone complètement les positions explorées sans partager les mutations", () => {
        const state: MatchState = {
            turn: 2,
            currentPlayer: 1,
            startingPlayer: 1,
            profiles: { 1: "balanced", 2: "offensive" },
            tactics: { 1: "balanced", 2: "offense" },
            allowBaseAttackOnSummonTurn: true,
            winner: null,
            finishReason: "turnLimit",
            health: { 1: 3, 2: 2 },
            reserves: {
                1: { invocation: 1, attack: 2, movement: 1 },
                2: { invocation: 2, attack: 1, movement: 0 },
            },
            monsters: [],
            movementStagnation: { "monster-1": 2 },
            history: [],
            statistics: { 1: createStats(), 2: createStats() },
            nextMonsterId: 3,
            monstersKilledForVictory: 8,
        };

        const clone = cloneMatchState(state);
        clone.health[1] = 1;
        clone.reserves[1].attack = 99;
        clone.statistics[1].searchNodes = 12;
        clone.movementStagnation["monster-1"] = 7;

        expect(state.health[1]).toBe(3);
        expect(state.reserves[1].attack).toBe(2);
        expect(state.statistics[1].searchNodes).toBe(0);
        expect(state.movementStagnation["monster-1"]).toBe(2);
        expect(createSearchCacheKey(state, 1, 1)).not.toBe(
            createSearchCacheKey(clone, 1, 1),
        );
    });
});
