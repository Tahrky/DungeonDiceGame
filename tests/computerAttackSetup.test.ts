import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

import { createCustomBoard, getStartingPositions } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { createPlacedMonster } from "../src/game/monsterActions";
import { GameSceneComputer } from "../src/scenes/GameSceneComputer";
import type { GameHudActions } from "../src/scenes/game/GameHud";
import { createStats, type MatchState } from "../src/simulation/matchState";
import { performMovements } from "../src/simulation/movement";
import type { BoardObstacle, Monster, PlacedMonster, Position } from "../src/types/GameTypes";

const board = createCustomBoard(9, 9);
const starts = getStartingPositions(board);

function createAttacker(): PlacedMonster {
    const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost");
    if (!ghost) throw new Error("Fantôme introuvable.");
    const monster = {
        ...ghost,
        movementRange: 3,
        attacks: [
            {
                name: "Frappe",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" as const },
            },
        ],
    };
    const source = { x: 2, y: 4 };
    return createPlacedMonster(
        "attacker",
        monster,
        2,
        source,
        [source, { x: 2, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 4 }],
        0,
    );
}

class TestComputer extends GameSceneComputer {
    protected drawBoard(): void {}
    protected get hudActions(): GameHudActions {
        throw new Error("Interface non utilisée par ce test.");
    }

    configure(monster: PlacedMonster, attackReserve: number): void {
        this.init({ mode: "computer", board });
        this.currentPlayer = 2;
        this.turnNumber = 1;
        this.playerHealth[1] = 1;
        this.diceReserves[2] = { invocation: 0, movement: 1, attack: attackReserve };
        this.placedMonsters = [monster];
    }

    move(monster: PlacedMonster): void {
        Reflect.apply(Reflect.get(this, "moveComputerMonster"), this, [monster]);
    }

    get result(): number | null {
        return this.winner;
    }

    configureReply(monsters: PlacedMonster[], attack: number, movement: number): void {
        this.init({ mode: "computer", board });
        this.currentPlayer = 2;
        this.turnNumber = 3;
        this.playerHealth[2] = 1;
        this.diceReserves[1] = { invocation: 0, movement, attack };
        this.placedMonsters = monsters;
    }

    configureGuard(monsters: PlacedMonster[], enemyAttack: number): void {
        this.configureReply(monsters, enemyAttack, 1);
        this.opponentProfile = "defensive";
        this.diceReserves[2] = { invocation: 0, movement: 1, attack: 0 };
    }

    enableVictoryAttack(): void {
        this.playerHealth[1] = 1;
        this.diceReserves[2].attack = 1;
    }

    guardThreat(monster: PlacedMonster, path: Position[]): [number, number] {
        return [
            this.getComputerReplyPenalty(this.placedMonsters),
            this.getComputerMovementReplyPenalty(monster, path),
        ];
    }

    setObstacles(obstacles: BoardObstacle[]): void {
        this.obstacles = obstacles;
    }

    reply(monster: Monster, position: Position, cells: Position[]): number {
        return this.getComputerPlacementReplyPenalty(monster, { position, cells });
    }

    placement(monster?: Monster) {
        return this.findComputerPlacement(monster);
    }

    get replyState() {
        return {
            currentPlayer: this.currentPlayer,
            turnNumber: this.turnNumber,
            rolledDice: this.rolledDice,
            placedMonsters: this.placedMonsters,
            reserves: this.diceReserves,
        };
    }

    protected handleMovementAction(position: Position, monsterId: string | null): void {
        const monster = this.getLivingMonster(monsterId ?? "");
        if (!monster) throw new Error("Monstre introuvable.");
        monster.position = position;
        monster.movementsUsedThisTurn++;
    }

    protected executeAttack(attacker: PlacedMonster, attackIndex: number, target: Position): void {
        if (!this.canAttackTarget(attacker.id, attackIndex, target)) {
            throw new Error("Attaque illégale.");
        }
        if (target.x === starts[1].x && target.y === starts[1].y) this.winner = 2;
    }
}

function createSimulation(monster: PlacedMonster, attackReserve: number): MatchState {
    return {
        turn: 1,
        currentPlayer: 2,
        movementAttackCombos: true,
        profiles: { 1: "balanced", 2: "offensive" },
        tactics: { 1: "balanced", 2: "offense" },
        allowBaseAttackOnSummonTurn: true,
        winner: null,
        finishReason: "turnLimit",
        health: { 1: 1, 2: 4 },
        reserves: {
            1: { invocation: 0, attack: 0, movement: 0 },
            2: { invocation: 0, attack: attackReserve, movement: 1 },
        },
        monsters: [monster],
        movementStagnation: {},
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 1,
        monstersKilledForVictory: 7,
    };
}

describe("déplacement préparant une attaque", () => {
    it("évite une pose qui ouvre le dos d’un allié à une réponse payable", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const threat = {
            ...ghost,
            movementRange: 3,
            bonusDamageFromBehind: 3,
            attacks: [
                { name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" as const } },
            ],
        };
        const attacker = createPlacedMonster(
            "enemy",
            threat,
            1,
            { x: 3, y: 2 },
            [
                { x: 3, y: 2 },
                { x: 3, y: 3 },
                { x: 2, y: 2 },
                { x: 2, y: 3 },
                { x: 1, y: 3 },
                { x: 0, y: 3 },
            ],
            0,
        );
        const ally = createPlacedMonster(
            "ally",
            ghost,
            2,
            { x: 5, y: 4 },
            [
                { x: 5, y: 4 },
                { x: 6, y: 4 },
                { x: 7, y: 4 },
                { x: 7, y: 3 },
                { x: 7, y: 5 },
                { x: 6, y: 3 },
            ],
            0,
        );
        ally.facing = "east";
        const scene = new TestComputer();
        scene.configureReply([attacker, ally], 1, 1);
        const baseline = scene.placement();
        const chosen = scene.placement(ghost);
        expect(baseline).not.toBeNull();
        expect(chosen).not.toBeNull();
        if (!baseline || !chosen) throw new Error("Poses attendues.");
        expect(scene.reply(ghost, baseline.position, baseline.cells)).toBeGreaterThan(0);
        expect(scene.reply(ghost, chosen.position, chosen.cells)).toBe(0);
    });
    it("trouve une victoire après un détour, en scène et en simulation", () => {
        const sceneMonster = createAttacker();
        const scene = new TestComputer();
        scene.configure(sceneMonster, 1);
        scene.move(sceneMonster);

        const simulation = createSimulation(createAttacker(), 1);
        performMovements(simulation, board);

        expect(sceneMonster.position).toEqual({ x: 1, y: 4 });
        expect(scene.result).toBe(2);
        expect(simulation.monsters[0]?.position).toEqual({ x: 1, y: 4 });
        expect(simulation.winner).toBe(2);
    });

    it("ne considère pas une attaque que le bot ne peut pas payer", () => {
        const sceneMonster = createAttacker();
        const scene = new TestComputer();
        scene.configure(sceneMonster, 0);
        scene.move(sceneMonster);

        const simulation = createSimulation(createAttacker(), 0);
        performMovements(simulation, board);

        expect(scene.result).toBeNull();
        expect(simulation.winner).toBeNull();
        expect(simulation.statistics[2].attacks).toBe(0);
    });

    it("évalue une réponse payable après déplacement sans modifier la scène", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const attacker = createPlacedMonster(
            "enemy",
            {
                ...ghost,
                movementRange: 1,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            1,
            { x: 6, y: 4 },
            [
                { x: 6, y: 4 },
                { x: 7, y: 4 },
            ],
            0,
        );
        const scene = new TestComputer();
        scene.configureReply([attacker], 1, 1);
        const original = structuredClone(scene.replyState);
        const position = { x: 4, y: 4 };
        expect(scene.reply(ghost, position, [position])).toBe(100_000);
        expect(scene.replyState).toEqual(original);
        scene.configureReply([attacker], 0, 1);
        expect(scene.reply(ghost, position, [position])).toBe(0);
        scene.configureReply([attacker], 1, 0);
        expect(scene.reply(ghost, position, [position])).toBe(0);
        scene.configureReply([attacker], 1, 1);
        attacker.attackCooldowns[0] = 2;
        expect(scene.reply(ghost, position, [position])).toBe(0);
        attacker.attackCooldowns[0] = 1;
        expect(scene.reply(ghost, position, [position])).toBe(100_000);
        attacker.statusEffects = [
            {
                type: "damageOverTime",
                damagePerTurn: attacker.currentHp,
                duration: 1,
                remainingTurns: 1,
                color: "green",
            },
        ];
        const poisoned = structuredClone(scene.replyState);
        expect(scene.reply(ghost, position, [position])).toBe(0);
        expect(scene.replyState).toEqual(poisoned);
    });

    it("respecte les obstacles de ligne de vue propres à la scène", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const attacker = createPlacedMonster(
            "enemy",
            {
                ...ghost,
                attacks: [
                    {
                        name: "Tir",
                        damage: 1,
                        cost: 0,
                        pattern: { type: "line", range: 3, allDirections: true },
                    },
                ],
            },
            1,
            { x: 5, y: 4 },
            [{ x: 5, y: 4 }],
            0,
        );
        const scene = new TestComputer();
        scene.configureReply([attacker], 0, 0);
        const position = { x: 3, y: 3 };
        expect(scene.reply(ghost, position, [position])).toBe(100_000);
        scene.setObstacles([{ height: 1, position: { x: 6, y: 4 } }]);
        expect(scene.reply(ghost, position, [position])).toBe(0);
    });

    it("garde une entrée seulement si son départ permet une réponse décisive", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const guard = createPlacedMonster(
            "guard",
            { ...ghost, movementRange: 2 },
            2,
            { x: 7, y: 4 },
            [
                { x: 7, y: 4 },
                { x: 6, y: 4 },
                { x: 5, y: 4 },
            ],
            0,
        );
        const ally = createPlacedMonster("ally", ghost, 2, { x: 6, y: 4 }, [{ x: 6, y: 4 }], 0);
        const enemy = createPlacedMonster(
            "enemy",
            {
                ...ghost,
                movementRange: 3,
                canPassHostiles: true,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            1,
            { x: 4, y: 4 },
            [{ x: 4, y: 4 }],
            0,
        );
        const scene = new TestComputer();
        scene.configureGuard([guard, ally, enemy], 1);
        scene.move(guard);
        expect(guard.position).toEqual({ x: 7, y: 4 });

        scene.configureGuard([guard, ally, enemy], 0);
        scene.move(guard);
        expect(guard.position).not.toEqual({ x: 7, y: 4 });
    });

    it("prend une victoire immédiate même si le garde ouvre sa base", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const guard = createPlacedMonster(
            "guard",
            {
                ...ghost,
                movementRange: 2,
                attacks: [
                    {
                        name: "Tir",
                        damage: 1,
                        cost: 1,
                        pattern: { type: "line", range: 6, allDirections: true },
                    },
                ],
            },
            2,
            { x: 7, y: 4 },
            [
                { x: 7, y: 4 },
                { x: 6, y: 4 },
            ],
            0,
        );
        const ally = createPlacedMonster("ally", ghost, 2, { x: 8, y: 3 }, [{ x: 8, y: 3 }], 0);
        const enemy = createPlacedMonster(
            "enemy",
            {
                ...ghost,
                movementRange: 3,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            1,
            { x: 6, y: 2 },
            [
                { x: 6, y: 2 },
                { x: 6, y: 3 },
                { x: 7, y: 3 },
            ],
            0,
        );
        const scene = new TestComputer();
        scene.configureGuard([guard, ally, enemy], 1);
        scene.enableVictoryAttack();
        const [before, after] = scene.guardThreat(guard, [guard.position, { x: 6, y: 4 }]);
        expect(after).toBeGreaterThan(before);
        scene.move(guard);
        expect(scene.result).toBe(2);
    });
});
