import { describe, expect, it } from "vitest";
import { createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { performAttacks } from "../src/simulation/combat";
import { cloneMatchState, createStats, type MatchState } from "../src/simulation/matchState";
import { performMovements } from "../src/simulation/movement";
import { getPlacementReplyPenalty } from "../src/simulation/placementReply";

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
    it("garde une entrée menacée sans consommer le dé du coéquipier", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(false);
        state.profiles[1] = "defensive";
        state.tactics[1] = "defense";
        const guard = state.monsters[0]!;
        guard.position = { x: 1, y: 4 };
        guard.cells = [guard.position, { x: 2, y: 4 }, { x: 3, y: 4 }];
        const enemy = state.monsters[1]!;
        enemy.position = { x: 4, y: 4 };
        enemy.cells = [enemy.position];
        const ally = { ...guard, id: "ally", position: { x: 2, y: 4 }, cells: [{ x: 2, y: 4 }] };
        state.monsters.push(ally);
        performMovements(state, board);
        expect(guard.position).toEqual({ x: 1, y: 4 });
        expect(ally.position).toEqual({ x: 3, y: 4 });
        expect(state.statistics[1].stagnantMonsterTurns).toBe(0);
    });

    it("quitte une garde si l’adversaire ne peut pas exploiter le passage", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        state.profiles[1] = "defensive";
        state.tactics[1] = "defense";
        const guard = state.monsters[0]!;
        guard.position = { x: 1, y: 4 };
        guard.cells = [guard.position, { x: 2, y: 4 }, { x: 3, y: 4 }];
        const enemy = state.monsters[1]!;
        enemy.position = { x: 4, y: 4 };
        enemy.cells = [enemy.position];
        state.monsters.push({
            ...guard,
            id: "ally",
            position: { x: 2, y: 4 },
            cells: [{ x: 2, y: 4 }],
        });

        performMovements(state, board);

        expect(guard.position).not.toEqual({ x: 1, y: 4 });
    });

    it("conserve une garde quand son déplacement expose la base à une attaque payable", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        state.profiles[1] = "defensive";
        state.tactics[1] = "defense";
        state.health[1] = 1;
        const guard = state.monsters[0]!;
        guard.position = { x: 1, y: 4 };
        guard.cells = [guard.position, { x: 2, y: 4 }, { x: 3, y: 4 }];
        const enemy = state.monsters[1]!;
        enemy.position = { x: 4, y: 4 };
        enemy.cells = [enemy.position];
        enemy.monster = {
            ...enemy.monster,
            canPassHostiles: true,
            movementRange: 3,
            attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
        };
        enemy.attackCooldowns = [0];
        enemy.attackUsesThisTurn = [0];
        state.reserves[2] = { invocation: 0, attack: 1, movement: 1 };
        state.monsters.push({
            ...guard,
            id: "ally",
            position: { x: 2, y: 4 },
            cells: [{ x: 2, y: 4 }],
        });

        performMovements(state, board);

        expect(guard.position).toEqual({ x: 1, y: 4 });
    });

    it("privilégie une victoire immédiate même si le déplacement ouvre la garde", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        state.profiles[1] = "defensive";
        state.tactics[1] = "defense";
        state.health = { 1: 1, 2: 1 };
        const guard = state.monsters[0]!;
        guard.position = { x: 1, y: 4 };
        guard.cells = [guard.position, { x: 2, y: 4 }];
        guard.monster = {
            ...guard.monster,
            attacks: [
                {
                    name: "Tir",
                    damage: 1,
                    cost: 1,
                    pattern: { type: "line", range: 6, allDirections: true },
                },
            ],
        };
        const enemy = state.monsters[1]!;
        enemy.position = { x: 2, y: 2 };
        enemy.cells = [enemy.position, { x: 2, y: 3 }, { x: 1, y: 3 }];
        enemy.monster = {
            ...enemy.monster,
            movementRange: 3,
            attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
        };
        enemy.attackCooldowns = [0];
        enemy.attackUsesThisTurn = [0];
        state.reserves[2] = { invocation: 0, attack: 1, movement: 1 };
        state.monsters.push({
            ...guard,
            id: "ally",
            position: { x: 0, y: 3 },
            cells: [{ x: 0, y: 3 }],
        });

        const exposed = cloneMatchState(state);
        exposed.monsters[0]!.position = { x: 2, y: 4 };
        expect(getPlacementReplyPenalty(exposed, board, 1)).toBeGreaterThan(
            getPlacementReplyPenalty(state, board, 1),
        );
        performMovements(state, board);

        expect(state.winner).toBe(1);
    });
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
