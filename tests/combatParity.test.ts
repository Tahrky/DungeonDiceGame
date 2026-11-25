import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

import { createCustomBoard, getStartingPositions } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { createPlacedMonster } from "../src/game/monsterActions";
import { GameSceneAttackExecution } from "../src/scenes/GameSceneAttackExecution";
import type { GameHudActions } from "../src/scenes/game/GameHud";
import type { MonsterSpriteView } from "../src/scenes/game/MonsterSpriteView";
import { getAvailableAttackChoices } from "../src/simulation/combat/attackChoices";
import { executeAttack } from "../src/simulation/combat/attackExecution";
import { createStats, type MatchState } from "../src/simulation/matchState";
import type { Monster, PlacedMonster, Position } from "../src/types/GameTypes";

const board = createCustomBoard(9, 9);
const configuration = getDefaultGameConfiguration();

class CombatScene extends GameSceneAttackExecution {
    protected drawBoard(): void {}
    protected render(): void {}
    protected handleBoardAction(): void {}
    protected handleMovementAction(): void {}
    protected canAffordMovement(): boolean {
        return false;
    }
    protected hasAffordableMovement(): boolean {
        return false;
    }
    protected get hudActions(): GameHudActions {
        throw new Error("Interface non utilisée par ce test.");
    }

    configure(monsters: PlacedMonster[], health: Record<1 | 2, number>): void {
        this.init({ mode: "computer", board, configuration });
        this.currentPlayer = 1;
        this.turnNumber = 2;
        this.placedMonsters = monsters;
        this.playerHealth = health;
        this.diceReserves[1].attack = 1;
        const view: MonsterSpriteView = Object.create(null);
        view.playAttack = vi.fn();
        view.takeDamage = vi.fn();
        this.monsterSpriteView = view;
    }

    attack(attacker: PlacedMonster, target: Position): void {
        this.executeAttack(attacker, 0, target, this.getLivingMonsterAt(target));
    }

    get result() {
        return {
            monsters: this.placedMonsters,
            health: this.playerHealth,
            reserve: this.diceReserves[1].attack,
            winner: this.winner,
        };
    }
}

function simulation(monsters: PlacedMonster[], health: Record<1 | 2, number>): MatchState {
    return {
        turn: 2,
        currentPlayer: 1,
        profiles: { 1: "balanced", 2: "balanced" },
        tactics: { 1: "balanced", 2: "balanced" },
        allowBaseAttackOnSummonTurn: configuration.allowBaseAttackOnSummonTurn,
        winner: null,
        finishReason: "turnLimit",
        health,
        reserves: {
            1: { invocation: 0, attack: 1, movement: 0 },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters,
        movementStagnation: {},
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 1,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };
}

function compareAttack(
    monsters: PlacedMonster[],
    target: Position,
    health = { 1: 4, 2: 4 },
): MatchState {
    const sceneMonsters = structuredClone(monsters);
    const state = simulation(structuredClone(monsters), { ...health });
    const scene = new CombatScene();
    scene.configure(sceneMonsters, { ...health });
    const choice = getAvailableAttackChoices(state, board, undefined, false, true).find(
        (candidate) => candidate.target.x === target.x && candidate.target.y === target.y,
    );
    if (!choice) throw new Error("Attaque de simulation attendue.");
    scene.attack(sceneMonsters[0]!, target);
    executeAttack(state, board, choice);
    expect(scene.result).toEqual({
        monsters: state.monsters,
        health: state.health,
        reserve: state.reserves[1].attack,
        winner: state.winner,
    });
    return state;
}

describe("parité de résolution du combat", () => {
    const ghost = configuration.monsters.find(({ id }) => id === "ghost")!;
    const position = { x: 3, y: 4 };

    it("applique les mêmes dégâts de dos, effets et camouflage", () => {
        const thief: Monster = {
            ...ghost,
            id: "thief",
            bonusDamageFromBehind: 3,
            attacks: [
                {
                    name: "Frappe",
                    damage: 1,
                    cost: 1,
                    pattern: { type: "adjacent" },
                    statusEffect: {
                        type: "damageOverTime",
                        damagePerTurn: 1,
                        duration: 2,
                        color: "green",
                    },
                },
            ],
        };
        const attacker = createPlacedMonster("a", thief, 1, position, [position], 1);
        const target = { x: 4, y: 4 };
        const victim = createPlacedMonster("b", ghost, 2, target, [target], 1);
        victim.facing = "east";
        victim.currentHp = 3;
        const state = compareAttack([attacker, victim], target);
        expect(state.monsters[1]!.currentHp).toBeLessThanOrEqual(0);
        expect(state.monsters[0]!.isCamouflaged).toBe(true);
    });

    it("applique le même soin à un allié", () => {
        const healer: Monster = {
            ...ghost,
            attacks: [
                {
                    name: "Soin",
                    damage: 0,
                    cost: 1,
                    pattern: { type: "adjacent" },
                    targetsAlliesOnly: true,
                    healAmount: 2,
                },
            ],
        };
        const attacker = createPlacedMonster("a", healer, 1, position, [position], 1);
        const target = { x: 4, y: 4 };
        const ally = createPlacedMonster("b", ghost, 1, target, [target], 1);
        ally.currentHp--;
        const state = compareAttack([attacker, ally], target);
        expect(state.monsters[1]!.currentHp).toBe(ally.monster.hp);
    });

    it("applique les mêmes dégâts de zone aux alliés et aux ennemis", () => {
        const monster: Monster = {
            ...ghost,
            attacks: [
                {
                    name: "Zone",
                    damage: 1,
                    cost: 1,
                    pattern: { type: "area", range: 2, width: 2, depth: 2 },
                    hitsAllies: true,
                },
            ],
        };
        const attacker = createPlacedMonster("a", monster, 1, position, [position], 1);
        const target = { x: 4, y: 4 };
        const enemy = createPlacedMonster("b", ghost, 2, target, [target], 1);
        const allyPosition = { x: 4, y: 3 };
        const ally = createPlacedMonster("c", ghost, 1, allyPosition, [allyPosition], 1);
        const state = compareAttack([attacker, enemy, ally], target);
        expect(state.monsters[1]!.currentHp).toBe(enemy.currentHp - 1);
        expect(state.monsters[2]!.currentHp).toBe(ally.currentHp - 1);
    });

    it("résout la même zone lorsque plusieurs zones partagent une case cible", () => {
        const monster: Monster = {
            ...ghost,
            attacks: [
                {
                    name: "Zone",
                    damage: 1,
                    cost: 1,
                    pattern: { type: "area", range: 3, width: 1, depth: 2 },
                    hitsAllies: true,
                },
            ],
        };
        const attacker = createPlacedMonster("a", monster, 1, position, [position], 1);
        const target = { x: 5, y: 4 };
        const enemy = createPlacedMonster("b", ghost, 2, target, [target], 1);
        const further = { x: 6, y: 4 };
        const enemyBehind = createPlacedMonster("c", ghost, 2, further, [further], 1);
        enemyBehind.currentHp = 1;
        const state = compareAttack([attacker, enemy, enemyBehind], target);
        expect(state.monsters[1]!.currentHp).toBe(enemy.currentHp - 1);
        expect(state.monsters[2]!.currentHp).toBe(1);
    });

    it("détruit la base dans les deux modes", () => {
        const target = getStartingPositions(board)[2];
        const attackerPosition = { x: target.x - 1, y: target.y };
        const attacker = createPlacedMonster(
            "a",
            {
                ...ghost,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            1,
            attackerPosition,
            [attackerPosition],
            1,
        );
        const state = compareAttack([attacker], target, { 1: 4, 2: 1 });
        expect(state.winner).toBe(1);
    });
});
