import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

import { createCustomBoard, getStartingPositions } from "../src/game/boards";
import { DEFAULT_BOT_STRATEGY_WEIGHTS, type BotProfile } from "../src/game/botStrategy";
import type { GameSetup } from "../src/game/decks";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { createPlacedMonster } from "../src/game/monsterActions";
import { beginMonsterTurn } from "../src/game/statusEffects";
import { getMatchRandomState } from "../src/game/random";
import type { MatchRandomStreams } from "../src/game/random";
import { GameSceneComputer } from "../src/scenes/GameSceneComputer";
import type { GameHudActions } from "../src/scenes/game/GameHud";
import type { MonsterSpriteView } from "../src/scenes/game/MonsterSpriteView";
import type { BotAction } from "../src/simulation/botAction";
import {
    advanceBotTurn,
    createBotSnapshot,
    createBotTurnCheckpoint,
    restoreBotSnapshot,
    type BotSnapshot,
    type BotTurnCheckpoint,
} from "../src/simulation/botSnapshot";
import { beginTurn } from "../src/simulation/combat";
import {
    decideNextAction,
    decidePlayerTurn,
    executeBotAction,
    type PlayerTurnContext,
} from "../src/simulation/playerTurn";
import { createInitialState } from "../src/simulation/simulator";
import type { BoardObstacle, PlacedMonster } from "../src/types/GameTypes";

const board = createCustomBoard(9, 9);

function describeAction(action: BotAction): unknown {
    switch (action.type) {
        case "roll":
        case "endTurn":
            return { type: action.type, player: action.player };
        case "convert":
            return { type: action.type, player: action.player, choice: action.choice };
        case "summon":
            return {
                type: action.type,
                monster: action.monsterId,
                placement: action.placement,
            };
        case "attack":
            return {
                type: action.type,
                attacker: action.choice.attackerId,
                attackIndex: action.choice.attackIndex,
                target: action.choice.target,
                cells: action.choice.cells,
            };
        case "move":
            return { type: action.type, monster: action.monsterId, path: action.movement.path };
    }
}

class BotScene extends GameSceneComputer {
    readonly actions: unknown[] = [];
    protected drawBoard(): void {}
    protected render(): void {}
    protected finishTurn(): void {}
    protected get hudActions(): GameHudActions {
        throw new Error("Interface non utilisée par ce test.");
    }
    protected executeComputerAction(context: PlayerTurnContext, action: BotAction): void {
        this.actions.push(structuredClone(describeAction(action)));
        super.executeComputerAction(context, action);
    }

    configure(
        profile: BotProfile,
        monsters: PlacedMonster[],
        obstacles: BoardObstacle[],
        setup: Partial<GameSetup> = {},
    ): void {
        this.init({ mode: "computer", board, opponentProfile: profile, randomSeed: 731, ...setup });
        this.currentPlayer = 2;
        this.turnNumber = 2;
        this.playerHealth[1] = 1;
        this.placedMonsters = structuredClone(monsters);
        this.nextMonsterId = monsters.length + 1;
        this.obstacles = structuredClone(obstacles);
        this.diceReserves[2] = { invocation: 2, attack: 2, movement: 2 };
        this.computerTurnInProgress = true;
        const view: MonsterSpriteView = Object.create(null);
        view.playAttack = vi.fn();
        view.takeDamage = vi.fn();
        view.clearCamouflage = vi.fn();
        view.moveMonster = vi.fn();
        view.isMoving = vi.fn().mockReturnValue(false);
        this.monsterSpriteView = view;
    }

    context(): PlayerTurnContext {
        return this.createComputerContext();
    }

    streams(): MatchRandomStreams {
        return this.randomStreams;
    }

    play(): void {
        this.playComputerTurn();
    }

    nextRound(): void {
        this.turnNumber++;
        this.hasRolled = false;
        this.rolledDice = [];
        for (const monster of this.placedMonsters) {
            if (monster.owner === 2) beginMonsterTurn(monster);
        }
        this.actions.length = 0;
        this.computerTurnInProgress = true;
    }

    result() {
        return {
            monsters: this.placedMonsters,
            health: this.playerHealth,
            reserves: this.diceReserves,
            winner: this.winner,
            nextMonsterId: this.nextMonsterId,
            random: getMatchRandomState(this.randomStreams),
        };
    }
}

function compareTurn(
    profile: BotProfile,
    monsters: PlacedMonster[],
    obstacles: BoardObstacle[],
    setup: Partial<GameSetup> = {},
) {
    const scene = new BotScene();
    const simulationScene = new BotScene();
    scene.configure(profile, monsters, obstacles, setup);
    simulationScene.configure(profile, monsters, obstacles, setup);
    const source = simulationScene.context();
    const state = createInitialState(
        {
            games: 1,
            seed: 731,
            maxTurns: 30,
            profile1: source.state.profiles[1],
            profile2: source.state.profiles[2],
            ...setup.botOptions,
        },
        source.configuration,
        1,
        source.strategyWeights,
        simulationScene.streams(),
    );
    state.turn = source.state.turn;
    state.currentPlayer = source.state.currentPlayer;
    state.health = structuredClone(source.state.health);
    state.reserves = structuredClone(source.state.reserves);
    state.monsters = structuredClone(source.state.monsters);
    state.obstacles = structuredClone(source.state.obstacles);
    state.nextMonsterId = source.state.nextMonsterId;
    state.statistics = structuredClone(source.state.statistics);
    const context = { ...source, state };
    const decider = decidePlayerTurn(context, 2);
    const actions: unknown[] = [];
    for (let action = decideNextAction(decider); action; action = decideNextAction(decider)) {
        actions.push(structuredClone(describeAction(action)));
        const restored: BotAction = JSON.parse(JSON.stringify(action));
        executeBotAction(context, restored);
    }
    scene.play();
    expect(scene.actions).toEqual(actions);
    expect(scene.result()).toEqual({
        monsters: context.state.monsters,
        health: context.state.health,
        reserves: context.state.reserves,
        winner: context.state.winner,
        nextMonsterId: context.state.nextMonsterId,
        random: simulationScene.result().random,
    });
    return { actions, state: context.state };
}

describe("parité d'un tour de bot", () => {
    it.each(["balanced", "random"] as const)(
        "choisit et exécute la même séquence pour le profil %s",
        (profile) => {
            const result = compareTurn(profile, [], [{ height: 1, position: { x: 4, y: 4 } }]);
            expect(result.actions).toContainEqual(expect.objectContaining({ type: "summon" }));
        },
    );

    it("choisit la destruction immédiate de la base dans les deux modes", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const target = getStartingPositions(board)[1];
        const position = { x: target.x + 1, y: target.y };
        const attacker = createPlacedMonster(
            "monster-1",
            {
                ...ghost,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            2,
            position,
            [position],
            1,
        );
        const result = compareTurn("offensive", [attacker], []);
        expect(result.state.winner).toBe(2);
    });

    it("utilise les mêmes options, profils et poids configurés", () => {
        const weights = { ...DEFAULT_BOT_STRATEGY_WEIGHTS, invocationPriority: 1.5 };
        const result = compareTurn("defensive", [], [], {
            playerProfile: "offensive",
            botOptions: {
                completeAttackPhases: true,
                broaderAttackCandidates: true,
                movementAttackCombos: true,
                summonPlacementPairs: true,
                nextTurnDiceExpectation: true,
            },
            botStrategyWeights: { defensive: weights },
        });
        expect(result.state.profiles).toEqual({ 1: "offensive", 2: "defensive" });
        expect(result.state.strategyWeights?.[2]).toEqual(weights);
        expect(result.state.completeAttackPhases).toBe(true);
        expect(result.state.broaderAttackCandidates).toBe(true);
        expect(result.state.movementAttackCombos).toBe(true);
        expect(result.state.summonPlacementPairs).toBe(true);
        expect(result.state.nextTurnDice?.count).toBe(getDefaultGameConfiguration().diceCount);
    });

    it("conserve la parité sur plusieurs tours et avec le profil aléatoire", () => {
        const scene = new BotScene();
        const simulationScene = new BotScene();
        scene.configure("random", [], []);
        simulationScene.configure("random", [], []);
        const context = simulationScene.context();
        for (let round = 0; round < 3 && context.state.winner === null; round++) {
            if (round > 0) {
                scene.nextRound();
                context.state.turn++;
                beginTurn(context.state, context.configuration, 2);
            }
            const decider = decidePlayerTurn(context, 2);
            const actions: unknown[] = [];
            for (
                let action = decideNextAction(decider);
                action;
                action = decideNextAction(decider)
            ) {
                actions.push(structuredClone(describeAction(action)));
                const restored: BotAction = JSON.parse(JSON.stringify(action));
                executeBotAction(context, restored);
            }
            scene.play();
            expect(scene.actions).toEqual(actions);
            expect(scene.result()).toEqual({
                monsters: context.state.monsters,
                health: context.state.health,
                reserves: context.state.reserves,
                winner: context.state.winner,
                nextMonsterId: context.state.nextMonsterId,
                random: simulationScene.result().random,
            });
        }
    });

    it("rejoue un tour identique à partir d'un état et d'un hasard sérialisés", () => {
        const scene = new BotScene();
        scene.configure("random", [], []);
        const original = scene.context();
        original.state.placementProtectionCache = {
            key: "cache temporaire",
            preservesFirstDeployment: () => true,
        };
        const snapshot: BotSnapshot = JSON.parse(
            JSON.stringify(createBotSnapshot(original, scene.streams())),
        );
        const restored = restoreBotSnapshot(snapshot);
        const play = (context: PlayerTurnContext): BotAction[] => {
            const actions: BotAction[] = [];
            const decider = decidePlayerTurn(context, 2);
            for (
                let action = decideNextAction(decider);
                action;
                action = decideNextAction(decider)
            ) {
                actions.push(structuredClone(action));
                executeBotAction(context, action);
            }
            return actions;
        };
        expect(play(restored.context)).toEqual(play(original));
        expect(restored.context.state.monsters).toEqual(original.state.monsters);
        expect(restored.context.state.reserves).toEqual(original.state.reserves);
        expect(getMatchRandomState(restored.random)).toEqual(getMatchRandomState(scene.streams()));
    });

    it("reprend chaque action d'un tour depuis un checkpoint sérialisé sans modifier son entrée", () => {
        const scene = new BotScene();
        scene.configure("random", [], []);
        const context = scene.context();
        const decider = decidePlayerTurn(context, 2);
        let checkpoint = createBotTurnCheckpoint(context, scene.streams(), 2);
        for (;;) {
            const serialized = JSON.stringify(checkpoint);
            const restored: BotTurnCheckpoint = JSON.parse(serialized);
            const step = advanceBotTurn(restored);
            expect(JSON.stringify(checkpoint)).toBe(serialized);
            const action = decideNextAction(decider);
            expect(step.action).toEqual(action);
            if (!action) break;
            executeBotAction(context, action);
            expect(step.state).toEqual(createBotSnapshot(context, scene.streams()));
            checkpoint = step.checkpoint;
        }
        expect(checkpoint.actions.length).toBeGreaterThan(1);
        const invalid = structuredClone(checkpoint);
        invalid.actions[0] = { type: "roll", player: 1 };
        expect(() => advanceBotTurn(invalid)).toThrow("La séquence du tour sauvegardé");
    });
});
