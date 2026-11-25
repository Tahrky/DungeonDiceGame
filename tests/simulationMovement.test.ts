import { describe, expect, it } from "vitest";
import { createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { performAttacks } from "../src/simulation/combat";
import { createStats, type MatchState } from "../src/simulation/matchState";
import { performMovements } from "../src/simulation/movement";

function createMatchState(
    movementAttackCombos: boolean,
    movementActionsPerTurn = 1,
    movementReserve = 1,
): MatchState {
    const configuration = getDefaultGameConfiguration();
    const ghost = configuration.monsters.find((monster) => monster.id === "ghost");
    if (!ghost) throw new Error("Monstre de test introuvable.");
    const attackerPosition = { x: 3, y: 3 };
    const targetPosition = { x: 2, y: 4 };
    const attackerMonster = {
        ...ghost,
        hp: 6,
        movementRange: 2,
        movementActionsPerTurn,
        attacks: [
            {
                name: "Frappe adjacente",
                damage: 3,
                cost: 1,
                pattern: { type: "adjacent" as const },
            },
        ],
    };
    const targetMonster = { ...ghost, hp: 3 };
    const attacker = {
        id: "attacker",
        monster: attackerMonster,
        owner: 1 as const,
        position: attackerPosition,
        facing: "east" as const,
        currentHp: attackerMonster.hp,
        cells: [attackerPosition, { x: 4, y: 3 }, { x: 3, y: 4 }],
        summonedOnTurn: 0,
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: getInitialAttackUses(attackerMonster),
        movementsUsedThisTurn: 0,
        attackCooldowns: getInitialAttackCooldowns(attackerMonster),
        statusEffects: [],
    };
    const target = {
        ...attacker,
        id: "target",
        monster: targetMonster,
        owner: 2 as const,
        position: targetPosition,
        facing: "north" as const,
        currentHp: targetMonster.hp,
        cells: [targetPosition],
        attackUsesThisTurn: getInitialAttackUses(targetMonster),
        attackCooldowns: getInitialAttackCooldowns(targetMonster),
    };
    return {
        turn: 1,
        currentPlayer: 1,
        movementAttackCombos,
        profiles: { 1: "offensive", 2: "offensive" },
        tactics: { 1: "offense", 2: "offense" },
        allowBaseAttackOnSummonTurn: true,
        winner: null,
        finishReason: "turnLimit",
        health: { 1: 3, 2: 3 },
        reserves: {
            1: { invocation: 0, attack: 1, movement: movementReserve },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters: [attacker, target],
        movementStagnation: {},
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 2,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };
}

describe("déplacement tactique de simulation", () => {
    it("crée un combo déplacement-attaque seulement quand l’option est activée", () => {
        const board = createCustomBoard(9, 9);
        const regular = createMatchState(false);
        const experimental = createMatchState(true, 2, 2);

        for (const state of [regular, experimental]) {
            performMovements(state, board);
            performAttacks(state, board);
        }

        expect(regular.monsters[0]?.position).toEqual({ x: 4, y: 3 });
        expect(regular.monsters[1]?.currentHp).toBe(3);
        expect(experimental.monsters[0]?.position).toEqual({ x: 3, y: 4 });
        expect(experimental.monsters[1]?.currentHp).toBeLessThan(3);
    });
});
