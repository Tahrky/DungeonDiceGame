import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { performAttacks } from "../src/simulation/combat";
import { createStats, type MatchState } from "../src/simulation/matchState";

function createMatchState(allowBaseAttackOnSummonTurn: boolean): MatchState {
    const configuration = getDefaultGameConfiguration();
    const monster = configuration.monsters.find((candidate) => candidate.id === "ghost");
    if (!monster) throw new Error("Monstre de test introuvable.");
    const board = createCustomBoard(7, 7);
    const starts = getStartingPositions(board);
    const position = { x: starts[2].x - 1, y: starts[2].y };

    return {
        turn: 1,
        currentPlayer: 1,
        profiles: { 1: "offensive", 2: "offensive" },
        tactics: { 1: "offense", 2: "offense" },
        allowBaseAttackOnSummonTurn,
        winner: null,
        finishReason: "turnLimit",
        health: { 1: 3, 2: 3 },
        reserves: {
            1: { invocation: 0, attack: 1, movement: 0 },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters: [
            {
                id: "attacker",
                monster,
                owner: 1,
                position,
                facing: "east",
                currentHp: monster.hp,
                cells: [position],
                summonedOnTurn: 1,
                attacksUsedThisTurn: 0,
                attackUsesThisTurn: getInitialAttackUses(monster),
                movementsUsedThisTurn: 0,
                attackCooldowns: getInitialAttackCooldowns(monster),
                statusEffects: [],
            },
        ],
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 1,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };
}

describe("combat de simulation", () => {
    it("autorise ou bloque l’attaque de la base au tour d’apparition selon la configuration", () => {
        const board = createCustomBoard(7, 7);
        const allowed = createMatchState(true);
        const forbidden = createMatchState(false);

        performAttacks(allowed, board);
        performAttacks(forbidden, board);

        expect(allowed.health[2]).toBe(2);
        expect(forbidden.health[2]).toBe(3);
    });
});
