import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { createStats, deployMonsters, type MatchState } from "../src/simulation/matchState";

function createMatchState(summonPlacementPairs: boolean): MatchState {
    const configuration = getDefaultGameConfiguration();
    const monster = configuration.monsters.find((candidate) => candidate.id === "ghost");
    if (!monster) throw new Error("Monstre de test introuvable.");
    const board = createCustomBoard(9, 9);
    const starts = getStartingPositions(board);
    const enemy = {
        id: "enemy",
        monster,
        owner: 2 as const,
        position: starts[2],
        facing: "west" as const,
        currentHp: monster.hp,
        cells: [starts[2]],
        summonedOnTurn: 0,
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: getInitialAttackUses(monster),
        movementsUsedThisTurn: 0,
        attackCooldowns: getInitialAttackCooldowns(monster),
        statusEffects: [],
    };

    return {
        turn: 1,
        currentPlayer: 1,
        summonPlacementPairs,
        profiles: { 1: "expensive", 2: "offensive" },
        tactics: { 1: "offense", 2: "offense" },
        allowBaseAttackOnSummonTurn: false,
        winner: null,
        finishReason: "turnLimit",
        health: { 1: 4, 2: 4 },
        reserves: {
            1: { invocation: monster.cost, attack: 0, movement: 0 },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters: [enemy],
        movementStagnation: {},
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 0,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
        protectFirstDeployment: false,
    };
}

describe("invocations tactiques de simulation", () => {
    it("préserve le choix historique sans option et compare les paires avec l’option", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.maxMonstersPerPlayer = 1;
        const board = createCustomBoard(9, 9);
        const ghost = configuration.monsters.find((monster) => monster.id === "ghost");
        if (!ghost || !ghost.attacks[0]) throw new Error("Monstre de test introuvable.");
        const deck = [
            {
                ...ghost,
                id: "expensive-weak",
                cost: 3,
                hp: 1,
                attacks: [{ ...ghost.attacks[0], damage: 1, cost: 3 }],
            },
            {
                ...ghost,
                id: "cheap-strong",
                cost: 2,
                hp: 10,
                attacks: [{ ...ghost.attacks[0], damage: 10, cost: 1 }],
            },
        ];
        const legacy = createMatchState(false);
        const paired = createMatchState(true);
        legacy.reserves[1].invocation = 3;
        paired.reserves[1].invocation = 3;

        deployMonsters(legacy, configuration, board, "expensive", deck);
        deployMonsters(paired, configuration, board, "expensive", deck);

        expect(legacy.monsters[1]?.monster.id).toBe("expensive-weak");
        expect(paired.monsters[1]?.monster.id).toBe("cheap-strong");
    });
});
