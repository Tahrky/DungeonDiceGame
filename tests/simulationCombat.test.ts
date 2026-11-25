import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import {
    getAttackDiceCountDistribution,
    performAttacks,
    TACTICAL_SEARCH_CONFIGURATION,
} from "../src/simulation/combat";
import { chooseAttack } from "../src/simulation/combat/attackDecision";
import { getAvailableAttackChoices } from "../src/simulation/combat/attackChoices";
import { executeAttack } from "../src/simulation/combat/attackExecution";
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
    it("ne propose une attaque de soutien que sur une cible alliée et la valide avant dépense", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        attacker.position = { x: 3, y: 3 };
        attacker.monster = {
            ...attacker.monster,
            attacks: [
                {
                    name: "Soin",
                    damage: 0,
                    cost: 1,
                    pattern: { type: "area", range: 2, width: 2, depth: 2 },
                    targetsAlliesOnly: true,
                    healAmount: 2,
                },
            ],
        };
        const ally = {
            ...attacker,
            id: "ally",
            position: { x: 4, y: 3 },
            currentHp: attacker.monster.hp - 1,
        };
        state.monsters.push(ally);
        state.reserves[1].attack = 1;
        const choices = getAvailableAttackChoices(state, board);
        expect(choices.length).toBeGreaterThan(0);
        expect(choices.every((choice) => choice.target.x === 4 && choice.target.y === 3)).toBe(
            true,
        );

        const choice = choices[0]!;
        const before = JSON.stringify(state);
        expect(() => executeAttack(state, board, { ...choice, target: { x: 3, y: 4 } })).toThrow(
            "La cible de l'attaque de soutien est invalide.",
        );
        expect(JSON.stringify(state)).toBe(before);
        const attack = attacker.monster.attacks[0]!;
        attacker.monster = { ...attacker.monster, attacks: [{ ...attack, healAmount: undefined }] };
        const beforeInvalidEffect = JSON.stringify(state);
        expect(() => executeAttack(state, board, choice)).toThrow(
            "L'attaque de soutien ne possède aucun effet.",
        );
        expect(JSON.stringify(state)).toBe(beforeInvalidEffect);
        attacker.monster = { ...attacker.monster, attacks: [attack] };
        executeAttack(state, board, choice);
        expect(ally.currentHp).toBe(ally.monster.hp);
        expect(state.reserves[1].attack).toBe(0);
    });

    it("ne touche pas les cases du saut situées au-delà de sa portée", () => {
        const board = createCustomBoard(9, 9);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        attacker.position = { x: 3, y: 3 };
        attacker.cells = [attacker.position, { x: 5, y: 4 }];
        attacker.monster = {
            ...attacker.monster,
            attacks: [
                {
                    name: "Saut",
                    damage: 1,
                    cost: 1,
                    pattern: { type: "jumpArea", range: 2, width: 2, depth: 2 },
                    hitsAllies: true,
                    movesToZone: true,
                },
            ],
        };
        const near = {
            ...attacker,
            id: "near",
            owner: 2 as const,
            position: { x: 5, y: 3 },
            currentHp: 2,
        };
        const far = {
            ...attacker,
            id: "far",
            owner: 2 as const,
            position: { x: 6, y: 3 },
            currentHp: 2,
        };
        state.monsters.push(near, far);
        state.reserves[1].attack = 1;
        const choice = getAvailableAttackChoices(state, board).find(
            (candidate) => candidate.target.x === 5 && candidate.target.y === 3,
        );
        if (!choice) throw new Error("Saut attendu.");

        expect(choice.features.damage).toBe(1);
        executeAttack(state, board, choice);
        expect(near.currentHp).toBe(1);
        expect(far.currentHp).toBe(2);
    });

    it("choisit une attaque sans l'exécuter et ne choisit rien après la victoire", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        state.health[2] = 1;
        const attackReserve = state.reserves[1].attack;

        const choice = chooseAttack(state, board);

        expect(choice?.target).toEqual(getStartingPositions(board)[2]);
        expect(state.health[2]).toBe(1);
        expect(state.reserves[1].attack).toBe(attackReserve);
        expect(state.monsters[0]?.attacksUsedThisTurn).toBe(0);
        if (!choice) throw new Error("Attaque attendue.");

        executeAttack(state, board, choice);
        expect(state.winner).toBe(1);
        expect(chooseAttack(state, board)).toBeNull();
    });

    it("pondère les comptes de dés d’attaque selon les faces réellement disponibles", () => {
        const standardDice = getAttackDiceCountDistribution(6, false);
        const invocationExcludedDice = getAttackDiceCountDistribution(6, true);
        const expectedAttacks = (outcomes: typeof standardDice): number =>
            outcomes.reduce(
                (total, outcome) => total + outcome.attackDice * outcome.probability,
                0,
            );

        expect(expectedAttacks(standardDice)).toBeCloseTo(2);
        expect(expectedAttacks(invocationExcludedDice)).toBeCloseTo(4);
        expect(standardDice[0]?.probability).toBeCloseTo((2 / 3) ** 6);
        expect(invocationExcludedDice[0]?.probability).toBeCloseTo((1 / 3) ** 6);
        expect(standardDice.reduce((sum, outcome) => sum + outcome.probability, 0)).toBeCloseTo(1);
    });

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
        expect(state.statistics[1].maxSearchDepthReached).toBeLessThanOrEqual(
            TACTICAL_SEARCH_CONFIGURATION.depth,
        );
    });

    it("utilise une recherche tactique unique avec une largeur et une profondeur cohérentes", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
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

        performAttacks(state, board);

        expect(state.statistics[1].positionsExplored).toBeGreaterThan(3);
        expect(state.statistics[1].positionsExplored).toBeLessThan(30);
        expect(state.statistics[1].maxSearchDepthReached).toBeGreaterThanOrEqual(1);
        expect(state.statistics[1].maxSearchDepthReached).toBeLessThanOrEqual(
            TACTICAL_SEARCH_CONFIGURATION.depth,
        );
        expect(TACTICAL_SEARCH_CONFIGURATION.branchWidth).toBeGreaterThan(3);
    });

    it("reconnaît le kill d’une attaque dans le dos dans les caractéristiques évaluées", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const configuration = getDefaultGameConfiguration();
        const thief = configuration.monsters.find((monster) => monster.id === "thief");
        const ghost = state.monsters[0]!;
        if (!thief) throw new Error("Voleur de test introuvable.");

        const attackerPosition = { x: 3, y: 3 };
        const targetPosition = { x: 4, y: 3 };
        state.monsters[0] = {
            ...ghost,
            monster: thief,
            position: attackerPosition,
            facing: "east",
            cells: [attackerPosition],
        };
        state.monsters.push({
            ...ghost,
            id: "durable-enemy",
            owner: 2,
            monster: { ...ghost.monster, hp: 6 },
            position: targetPosition,
            facing: "east",
            currentHp: 6,
            cells: [targetPosition],
        });
        state.reserves[1].attack = 1;
        state.decisionTraces = [];

        performAttacks(state, board);

        expect(state.monsters[1]?.currentHp).toBeLessThanOrEqual(0);
        expect(state.decisionTraces[0]?.candidates[0]?.features.kills).toBe(1);
        expect(state.history.find((event) => event.type === "attack")?.criticalDamageBonus).toBe(3);
    });

    it("achève une cible avec deux attaques disponibles dans la même phase", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        const position = { x: 3, y: 3 };
        const comboMonster = {
            ...attacker.monster,
            hp: 6,
            attackActionsPerTurn: 2,
            attacks: [
                {
                    name: "Première frappe",
                    damage: 3,
                    cost: 1,
                    pattern: { type: "adjacent" as const },
                },
                {
                    name: "Seconde frappe",
                    damage: 3,
                    cost: 1,
                    pattern: { type: "adjacent" as const },
                },
            ],
        };
        const targetPosition = { x: 4, y: 3 };
        state.monsters[0] = {
            ...attacker,
            monster: comboMonster,
            position,
            cells: [position],
            attackUsesThisTurn: [0, 0],
            attackCooldowns: [0, 0],
        };
        state.monsters.push({
            ...attacker,
            id: "combo-target",
            owner: 2,
            monster: { ...attacker.monster, hp: 6 },
            position: targetPosition,
            facing: "west",
            currentHp: 6,
            cells: [targetPosition],
        });
        state.reserves[1].attack = 2;
        state.completeAttackPhases = true;

        performAttacks(state, board);

        expect(state.monsters[1]?.currentHp).toBeLessThanOrEqual(0);
        expect(state.statistics[1].attacks).toBe(2);
        expect(state.statistics[1].monstersKilled).toBe(1);
    });

    it("préfère une attaque de valeur égale qui n’expose pas son attaquant", () => {
        const board = createCustomBoard(7, 7);
        const state = createMatchState(true);
        const attacker = state.monsters[0]!;
        const position = { x: 3, y: 3 };
        const sturdyGhost = { ...attacker.monster, hp: 8 };
        state.monsters[0] = {
            ...attacker,
            monster: sturdyGhost,
            position,
            currentHp: 8,
            cells: [position],
        };

        for (const [id, target] of [
            ["north-target", { x: 3, y: 2 }],
            ["east-target", { x: 4, y: 3 }],
        ] as const) {
            state.monsters.push({
                ...attacker,
                id,
                owner: 2,
                monster: sturdyGhost,
                position: target,
                currentHp: 8,
                cells: [target],
            });
        }

        const threatMonster = {
            ...sturdyGhost,
            highAltitude: true,
            bonusDamageFromBehind: 3,
            attacks: [
                {
                    name: "Frappe arrière",
                    damage: 2,
                    cost: 1,
                    pattern: { type: "adjacent" as const },
                },
            ],
        };
        const adjacentThreatPosition = { x: 3, y: 4 };
        state.monsters.push({
            ...attacker,
            id: "rear-threat",
            owner: 2,
            monster: threatMonster,
            position: adjacentThreatPosition,
            facing: "north",
            currentHp: 8,
            cells: [adjacentThreatPosition],
        });
        state.reserves[1].attack = 2;
        state.reserves[2].attack = 1;
        state.decisionTraces = [];

        performAttacks(state, board);

        const firstDecision = state.decisionTraces[0];
        const selected = firstDecision?.candidates[firstDecision.selectedIndex];
        expect(selected?.target).toEqual({ x: 4, y: 3 });
    });

    it("ajoute le meilleur candidat de chaque attaquant quand l’élargissement est activé", () => {
        const board = createCustomBoard(9, 9);
        const positions = [
            { x: 2, y: 3 },
            { x: 3, y: 2 },
            { x: 5, y: 2 },
            { x: 6, y: 3 },
            { x: 2, y: 5 },
            { x: 3, y: 6 },
            { x: 5, y: 6 },
        ];
        const createState = (broaderAttackCandidates: boolean): MatchState => {
            const state = createMatchState(true);
            const template = state.monsters[0]!;
            const rangedMonster = {
                ...template.monster,
                attacks: [
                    {
                        ...template.monster.attacks[0]!,
                        damage: 2,
                        cost: 1,
                        pattern: { type: "radius" as const, range: 5 },
                    },
                ],
            };
            const targetPosition = { x: 4, y: 4 };
            state.monsters = [
                ...positions.map((position, index) => ({
                    ...template,
                    id: `ranged-${index}`,
                    monster: rangedMonster,
                    position,
                    facing: "east" as const,
                    cells: [position],
                    attackUsesThisTurn: [0],
                    attackCooldowns: [0],
                })),
                {
                    ...template,
                    id: "shared-target",
                    owner: 2 as const,
                    monster: { ...template.monster, hp: 8 },
                    position: targetPosition,
                    currentHp: 8,
                    cells: [targetPosition],
                },
            ];
            state.reserves[1].attack = 1;
            state.broaderAttackCandidates = broaderAttackCandidates;
            return state;
        };
        const topFiveState = createState(false);
        const broaderState = createState(true);

        performAttacks(topFiveState, board);
        performAttacks(broaderState, board);

        expect(broaderState.statistics[1].searchNodes).toBeGreaterThan(
            topFiveState.statistics[1].searchNodes,
        );
    });
});
