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
            1: { invocation: 0, attack: monster.attacks[0]?.cost ?? 1, movement: 0 },
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
                attackCooldowns: getInitialAttackCooldowns(monster).map(() => 0),
                statusEffects: [],
            },
        ],
        movementStagnation: {},
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

    it("choisit la destruction immédiate de la base plutôt qu’une élimination non décisive", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        state.profiles[1] = "tracker";
        state.tactics[1] = "hunt";
        state.health[2] = 1;
        state.monsters.push({
            ...attacker,
            id: "enemy",
            owner: 2,
            position: { x: attacker.position.x - 1, y: attacker.position.y },
            cells: [{ x: attacker.position.x - 1, y: attacker.position.y }],
            currentHp: 1,
        });

        performAttacks(state, board);

        expect(state.winner).toBe(1);
        expect(state.statistics[1].baseDamage).toBe(1);
        expect(state.monsters[1]?.currentHp).toBe(1);
    });

    it("explore un nombre plafonné de réponses tactiques avant de choisir une attaque", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const ghost = state.monsters[0]!;
        const enemy = {
            ...ghost,
            id: "enemy-one",
            owner: 2 as const,
            position: { x: ghost.position.x - 1, y: ghost.position.y },
            facing: "west" as const,
            cells: [{ x: ghost.position.x - 1, y: ghost.position.y }],
        };
        const secondEnemy = {
            ...enemy,
            id: "enemy-two",
            position: { x: ghost.position.x, y: ghost.position.y - 1 },
            cells: [{ x: ghost.position.x, y: ghost.position.y - 1 }],
        };
        state.monsters.push(enemy, secondEnemy);
        state.reserves[2].attack = ghost.monster.attacks[0]?.cost ?? 1;

        performAttacks(state, board);

        expect(state.statistics[1].positionsExplored).toBeGreaterThan(3);
        expect(state.statistics[1].positionsExplored).toBeLessThan(20);
        expect(state.statistics[1].maxSearchDepthReached).toBe(1);
    });

    it("explore davantage de réponses tactiques quand la recherche avancée est activée", () => {
        const board = createCustomBoard(7, 7);
        const standard = createMatchState(true);
        const advanced = createMatchState(true);

        for (const state of [standard, advanced]) {
            const attacker = state.monsters[0]!;
            attacker.position = { x: 3, y: 3 };
            attacker.cells = [attacker.position];
            state.monsters.push(
                ...[
                    { x: 2, y: 3 },
                    { x: 4, y: 3 },
                    { x: 3, y: 2 },
                    { x: 3, y: 4 },
                ].map((position, index) => ({
                    ...attacker,
                    id: `enemy-${index}`,
                    owner: 2 as const,
                    position,
                    facing: "west" as const,
                    cells: [position],
                })),
            );
            state.reserves[2].attack = attacker.monster.attacks[0]?.cost ?? 1;
        }
        advanced.advancedSearch = true;

        performAttacks(standard, board);
        performAttacks(advanced, board);

        expect(advanced.statistics[1].positionsExplored).toBeGreaterThan(
            standard.statistics[1].positionsExplored,
        );
        expect(standard.statistics[1].maxSearchDepthReached).toBe(1);
        expect(advanced.statistics[1].maxSearchDepthReached).toBeGreaterThanOrEqual(1);
        expect(advanced.statistics[1].maxSearchDepthReached).toBeLessThanOrEqual(2);
    });
});
