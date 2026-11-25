import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import {
    createPlacedMonster,
    getInitialAttackCooldowns,
    getInitialAttackUses,
} from "../src/game/monsterActions";
import { createDeploymentDecider, deployMonsters } from "../src/simulation/deployment";
import { createStats, type MatchState } from "../src/simulation/matchState";
import { createFormationScorer } from "../src/game/formation";
import {
    createSummonedMonsterCandidate,
    findBestSummonPlacementPair,
    findPlacement,
} from "../src/simulation/summonPlacement";
import { getPlacementReplyPenalty } from "../src/simulation/placementReply";
import { getAvailableAttackChoices } from "../src/simulation/combat/attackChoices";
import { DEFAULT_BOT_STRATEGY_WEIGHTS } from "../src/game/botStrategy";
import {
    createConversionDecider,
    decideNextAction,
    decidePlayerTurn,
    executeBotAction,
    playPlayerTurn,
    type PlayerTurnContext,
} from "../src/simulation/playerTurn";

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
    it("ne pose pas de route sur un obstacle de scène", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(false);
        const initial = findPlacement(state, board, 1);
        if (!initial) throw new Error("Pose initiale attendue.");
        const blocked = initial.cells[0]!;
        state.obstacles = [{ position: blocked, height: 1 }];

        const placement = findPlacement(state, board, 1);

        expect(placement).not.toBeNull();
        expect(placement?.cells).not.toContainEqual(blocked);
    });

    it("joue un tour action par action comme la boucle de simulation", () => {
        const board = createCustomBoard(9, 9);
        const configuration = getDefaultGameConfiguration();
        const ghost = configuration.monsters.find(({ id }) => id === "ghost")!;
        const createContext = (): PlayerTurnContext => ({
            state: createMatchState(false),
            board,
            configuration,
            random: () => 0,
            decks: { 1: [ghost.id], 2: [ghost.id] },
            deckMonsters: { 1: [ghost], 2: [ghost] },
            strategyWeights: {
                1: DEFAULT_BOT_STRATEGY_WEIGHTS,
                2: DEFAULT_BOT_STRATEGY_WEIGHTS,
            },
        });
        const stepped = createContext();
        const reference = createContext();
        const decider = decidePlayerTurn(stepped, 1);
        const first = decideNextAction(decider);
        expect(first).toEqual({ type: "roll", player: 1 });
        expect(stepped.state.history).toHaveLength(0);
        if (!first) throw new Error("Lancer attendu.");
        executeBotAction(stepped, first);
        const actions: string[] = [first.type];
        for (let action = decideNextAction(decider); action; action = decideNextAction(decider)) {
            actions.push(action.type);
            executeBotAction(stepped, action);
        }
        playPlayerTurn(reference, 1);
        expect(actions.at(-1)).toBe("endTurn");
        expect(stepped.state).toEqual(reference.state);
    });

    it("choisit une conversion pour invoquer sans modifier les réserves", () => {
        const board = createCustomBoard(9, 9);
        const configuration = getDefaultGameConfiguration();
        const ghost = configuration.monsters.find(({ id }) => id === "ghost")!;
        const state = createMatchState(false);
        state.monsters = [];
        state.reserves[1] = { invocation: 0, attack: 2, movement: 0 };
        const decide = createConversionDecider(
            {
                state,
                board,
                configuration,
                random: () => 0,
                decks: { 1: [ghost.id], 2: [] },
                deckMonsters: { 1: [ghost], 2: [] },
                strategyWeights: {
                    1: DEFAULT_BOT_STRATEGY_WEIGHTS,
                    2: DEFAULT_BOT_STRATEGY_WEIGHTS,
                },
            },
            1,
            [ghost],
        );

        expect(decide()).toEqual({
            sourceSymbols: ["attack", "attack"],
            targetSymbol: "invocation",
        });
        expect(state.reserves[1]).toEqual({ invocation: 0, attack: 2, movement: 0 });
        state.currentPlayer = 2;
        expect(decide).toThrow();
    });

    it("choisit une invocation avant de la payer et de la placer", () => {
        const board = createCustomBoard(9, 9);
        const configuration = getDefaultGameConfiguration();
        const ghost = configuration.monsters.find(({ id }) => id === "ghost")!;
        const state = createMatchState(false);
        const decide = createDeploymentDecider(state, configuration, board, "expensive", [ghost]);
        const reserve = state.reserves[1].invocation;

        const decision = decide();

        expect(decision?.summon.monster.id).toBe(ghost.id);
        expect(state.monsters).toHaveLength(1);
        expect(state.reserves[1].invocation).toBe(reserve);
        if (!decision) throw new Error("Invocation attendue.");

        deployMonsters(state, configuration, board, "expensive", [ghost]);
        expect(state.monsters).toHaveLength(2);
        expect(state.reserves[1].invocation).toBe(reserve - ghost.cost);
        expect(decide()).toBeNull();
    });

    it("choisit une paire qui protège le dos d’un allié contre une réponse payable", () => {
        const board = createCustomBoard(9, 9);
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const state = createMatchState(true);
        const enemy = createPlacedMonster(
            "enemy",
            {
                ...ghost,
                movementRange: 3,
                bonusDamageFromBehind: 3,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            2,
            { x: 3, y: 5 },
            [
                { x: 3, y: 5 },
                { x: 3, y: 6 },
            ],
            0,
        );
        const ally = createPlacedMonster(
            "ally",
            ghost,
            1,
            { x: 3, y: 4 },
            [
                { x: 3, y: 4 },
                { x: 2, y: 4 },
                { x: 1, y: 4 },
                { x: 1, y: 3 },
                { x: 1, y: 5 },
                { x: 2, y: 3 },
            ],
            0,
        );
        ally.facing = "west";
        state.monsters = [enemy, ally];
        state.reserves[2] = { invocation: 0, attack: 1, movement: 1 };
        const chosen = findBestSummonPlacementPair(state, board, 1, [ghost]);
        if (!chosen) throw new Error("Paire attendue.");
        const candidate = createSummonedMonsterCandidate(
            state,
            1,
            chosen.monster,
            chosen.placement,
        );
        expect(
            getPlacementReplyPenalty(
                { ...state, monsters: [...state.monsters, candidate] },
                board,
                1,
            ),
        ).toBe(0);
    });
    it("ne pénalise le dos que si le voleur peut réellement se déplacer et attaquer", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const thief = {
            ...ghost,
            bonusDamageFromBehind: 3,
            movementRange: 2,
            attacks: [
                { name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" as const } },
            ],
        };
        const victim = createPlacedMonster("victim", ghost, 1, { x: 5, y: 4 }, [{ x: 5, y: 4 }], 0);
        const enemy = createPlacedMonster(
            "thief",
            thief,
            2,
            { x: 4, y: 2 },
            [
                { x: 4, y: 2 },
                { x: 4, y: 3 },
                { x: 4, y: 4 },
            ],
            0,
        );
        victim.facing = "east";
        state.monsters = [victim, enemy];
        state.reserves[2] = { invocation: 0, attack: 1, movement: 1 };
        expect(getPlacementReplyPenalty(state, board, 1)).toBeGreaterThan(0);

        state.reserves[2].attack = 0;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
        state.reserves[2].attack = 1;
        state.reserves[2].movement = 0;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
        state.reserves[2].movement = 1;
        enemy.attackCooldowns[0] = 2;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
        enemy.attackCooldowns[0] = 0;
        enemy.cells = [enemy.position, { x: 4, y: 4 }];
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
    });

    it("considère une attaque de base légale même si son score glouton est nul", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const attacker = createPlacedMonster(
            "attacker",
            {
                ...ghost,
                attacks: [
                    {
                        name: "Explosion",
                        damage: 10,
                        cost: 1,
                        hitsAllies: true,
                        pattern: { type: "selfRadius", range: 1 },
                    },
                ],
            },
            2,
            { x: 1, y: 4 },
            [{ x: 1, y: 4 }],
            0,
        );
        const ally = createPlacedMonster(
            "ally",
            { ...ghost, hp: 10 },
            2,
            { x: 1, y: 3 },
            [{ x: 1, y: 3 }],
            0,
        );
        state.monsters = [attacker, ally];
        state.currentPlayer = 2;
        state.reserves[2].attack = 1;
        expect(getAvailableAttackChoices(state, board, "attacker", false)).toHaveLength(0);
        state.currentPlayer = 1;
        expect(getPlacementReplyPenalty(state, board, 1)).toBeGreaterThan(0);
    });

    it("reconnaît une attaque décisive sur la base mais pas à travers un garde", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const attacker = createPlacedMonster(
            "attacker",
            {
                ...ghost,
                movementRange: 2,
                attacks: [{ name: "Frappe", damage: 1, cost: 1, pattern: { type: "adjacent" } }],
            },
            2,
            { x: 2, y: 3 },
            [
                { x: 2, y: 3 },
                { x: 2, y: 4 },
                { x: 1, y: 4 },
            ],
            0,
        );
        state.monsters = [attacker];
        state.health[1] = 1;
        state.reserves[2] = { invocation: 0, attack: 1, movement: 1 };
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(100_000);
        const guard = createPlacedMonster("guard", ghost, 1, { x: 1, y: 4 }, [{ x: 1, y: 4 }], 0);
        state.monsters.push(guard);
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
    });

    it("respecte le changement de tour, les statuts et ne modifie pas l’état examiné", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        attacker.position = { x: 1, y: 4 };
        attacker.cells = [attacker.position];
        attacker.summonedOnTurn = state.turn;
        attacker.monster = {
            ...attacker.monster,
            attacks: [{ name: "Frappe", damage: 1, cost: 0, pattern: { type: "adjacent" } }],
        };
        attacker.attackUsesThisTurn = [0];
        attacker.attackCooldowns = [0];
        state.health[1] = 1;
        state.startingPlayer = 1;
        const original = structuredClone(state);
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
        expect(state).toEqual(original);

        state.startingPlayer = 2;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(100_000);
        attacker.statusEffects = [
            {
                type: "damageOverTime",
                damagePerTurn: attacker.currentHp,
                duration: 1,
                remainingTurns: 1,
                color: "green",
            },
        ];
        const beforeStatus = structuredClone(state);
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
        expect(state).toEqual(beforeStatus);

        const secondAttacker = createPlacedMonster(
            "second",
            attacker.monster,
            2,
            { x: 1, y: 3 },
            [{ x: 1, y: 3 }],
            0,
        );
        secondAttacker.position = { x: 0, y: 3 };
        state.monsters.push(secondAttacker);
        state.monstersKilledForVictory = 2;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(100_000);
        state.monstersKilledForVictory = 1;
        expect(getPlacementReplyPenalty(state, board, 1)).toBe(0);
    });

    it("compare une entrée défendable à la percée offensive, des deux côtés du plateau", () => {
        const board = createCustomBoard(19, 15);
        for (const player of [1, 2] as const) {
            const state = createMatchState(false);
            state.monsters = [];
            state.tactics[player] = "defense";
            const base = getStartingPositions(board)[player];
            const defensive = findPlacement(state, board, player)!;
            const distance = (p: { x: number; y: number }) =>
                Math.abs(p.x - base.x) + Math.abs(p.y - base.y);
            expect(defensive.cells.filter((cell) => distance(cell) === 1)).toEqual([
                defensive.position,
            ]);
            state.tactics[player] = "offense";
            const offensive = findPlacement(state, board, player)!;
            expect(Math.abs(offensive.position.x - base.x)).toBeGreaterThan(
                Math.abs(defensive.position.x - base.x),
            );
        }
    });

    it("évite de paver le dos d’un allié face à un bonus de dos, quelle que soit la couleur du chemin", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(false);
        const enemy = state.monsters[0]!;
        enemy.monster = { ...enemy.monster, movementRange: 3, bonusDamageFromBehind: 3 };
        enemy.position = { x: 3, y: 2 };
        const position = { x: 3, y: 4 };
        const ally = {
            ...enemy,
            owner: 1 as const,
            facing: "east" as const,
            position,
            cells: [position],
        };
        const rear = { x: 2, y: 4 };
        const score = () => createFormationScorer(board, [ally, enemy], 1, { x: 0, y: 4 });
        expect(score().spawn(position, [position])).toBeGreaterThan(
            score().spawn(position, [position, rear]),
        );
        expect(score().flankRisk(ally, position)).toBe(0);
        enemy.cells = [rear, enemy.position];
        expect(score().flankRisk(ally, position)).toBeGreaterThan(0);
        expect(score().spawn(position, [position])).toBe(score().spawn(position, [position, rear]));
    });
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
