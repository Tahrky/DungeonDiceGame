import { describe, expect, it } from "vitest";
import { createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { createPlacedMonster } from "../src/game/monsterActions";
import { createStats, type MatchState } from "../src/simulation/matchState";
import { performMovements } from "../src/simulation/movement";
import type { PlayerId, Position } from "../src/types/GameTypes";

type Point = readonly [number, number];
type Piece = readonly [string, string, PlayerId, number, Point, readonly Point[]];
const point = ([x, y]: Point): Position => ({ x, y });

const routeA: Point[] = [
    [17, 6],
    [14, 7],
    [15, 7],
    [16, 7],
    [17, 7],
    [17, 8],
];
const routeB: Point[] = [
    [13, 6],
    [10, 7],
    [11, 7],
    [12, 7],
    [13, 7],
    [13, 8],
];
const routeC: Point[] = [
    [9, 6],
    [6, 7],
    [7, 7],
    [8, 7],
    [9, 7],
    [9, 8],
];
const routeD: Point[] = [
    [1, 7],
    [2, 7],
    [3, 7],
    [3, 8],
    [4, 8],
    [5, 8],
];
const routeE: Point[] = [
    [2, 6],
    [3, 6],
    [4, 6],
    [4, 7],
    [5, 7],
    [6, 7],
];
const routeF: Point[] = [
    [2, 6],
    [1, 3],
    [1, 4],
    [1, 5],
    [1, 6],
    [0, 6],
];
const routeG: Point[] = [
    [6, 8],
    [7, 8],
    [8, 8],
    [8, 9],
    [9, 9],
    [10, 9],
];
const routeH: Point[] = [
    [11, 9],
    [12, 9],
    [13, 9],
    [14, 9],
    [14, 8],
    [11, 10],
];
const routeI: Point[] = [
    [15, 9],
    [16, 9],
    [17, 9],
    [18, 9],
    [18, 8],
    [15, 10],
];
const routeJ: Point[] = [
    [15, 7],
    [14, 7],
    [13, 7],
    [12, 7],
    [13, 8],
    [13, 6],
];
const routeK: Point[] = [
    [6, 8],
    [7, 8],
    [8, 8],
    [8, 7],
    [9, 7],
    [10, 7],
];
const routeL: Point[] = [
    [11, 7],
    [12, 7],
    [13, 7],
    [13, 8],
    [14, 8],
    [15, 8],
];
const routeM: Point[] = [
    [14, 5],
    [11, 6],
    [12, 6],
    [13, 6],
    [14, 6],
    [14, 7],
];
const routeN: Point[] = [
    [10, 6],
    [9, 6],
    [8, 6],
    [7, 6],
    [7, 7],
    [9, 5],
];

const match7: Piece[] = [
    ["m1", "ghost", 2, 2, [17, 8], routeA],
    ["m2", "ghost", 2, -3, [13, 7], routeB],
    ["m3", "ghost", 2, -1, [9, 6], routeC],
    ["m4", "shaman", 1, 0, [10, 9], routeD],
    ["m5", "ghost", 2, 0, [2, 6], routeE],
    ["m6", "ghost", 2, 0, [1, 3], routeF],
    ["m7", "archer", 1, 4, [9, 8], routeG],
    ["m8", "ghost", 2, 2, [17, 7], routeA],
    ["m9", "ghost", 2, 2, [16, 7], routeJ],
    ["m10", "archer", 2, 4, [14, 7], routeJ],
    ["m11", "shaman", 1, -4, [11, 9], routeH],
    ["m12", "shaman", 1, -2, [15, 9], routeI],
    ["m13", "archer", 1, 4, [5, 7], routeD],
    ["m14", "archer", 1, 0, [2, 7], routeD],
    ["m15", "archer", 1, 4, [4, 7], routeD],
    ["m16", "archer", 1, 4, [3, 7], routeD],
];

const match93: Piece[] = [
    ["m1", "ghost", 1, -3, [3, 7], routeD],
    ["m2", "ghost", 1, -1, [8, 7], routeK],
    ["m3", "ghost", 1, -1, [11, 7], routeL],
    ["m4", "archer", 2, 0, [5, 8], routeA],
    ["m5", "ghost", 1, -1, [15, 9], routeI],
    ["m6", "ghost", 1, 2, [3, 7], routeD],
    ["m7", "shaman", 2, 5, [7, 7], routeM],
    ["m8", "ghost", 1, -3, [3, 7], routeD],
    ["m9", "ghost", 1, 2, [4, 8], routeD],
    ["m10", "ghost", 1, 0, [5, 8], routeD],
    ["m11", "frost-mage", 2, 7, [7, 6], routeN],
];

function historicalPosition(pieces: Piece[], movement: number): MatchState {
    const configuration = getDefaultGameConfiguration();
    const monsters = pieces.map(([id, monsterId, owner, hp, position, cells]) => {
        const definition = configuration.monsters.find((monster) => monster.id === monsterId);
        if (!definition) throw new Error(`Monstre introuvable : ${monsterId}`);
        const monster = createPlacedMonster(
            id,
            definition,
            owner,
            point(position),
            cells.map(point),
            0,
        );
        monster.currentHp = hp;
        return monster;
    });
    return {
        turn: 30,
        currentPlayer: 1,
        movementAttackCombos: true,
        profiles: { 1: "balanced", 2: "balanced" },
        tactics: { 1: "balanced", 2: "balanced" },
        allowBaseAttackOnSummonTurn: false,
        winner: null,
        finishReason: "turnLimit",
        health: { 1: 4, 2: 4 },
        reserves: {
            1: { invocation: 0, attack: 0, movement },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters,
        movementStagnation: {},
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: monsters.length + 1,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };
}

describe("géométries historiques des matchs 7 et 93", () => {
    it("rompt l’aller-retour du match 7 en préparant une attaque utile", () => {
        const baseline = historicalPosition(match7, 2);
        baseline.turn = 29;
        baseline.movementAttackCombos = false;
        baseline.reserves[1].attack = 25;
        const state = historicalPosition(match7, 2);
        state.turn = 29;
        state.reserves[1].attack = 25;
        performMovements(baseline, createCustomBoard(19, 15));
        performMovements(state, createCustomBoard(19, 15));
        expect(
            baseline.history.some((event) => event.monsterId === "m7" && event.damageToEnemies),
        ).toBe(false);
        expect(state.monsters.find(({ id }) => id === "m7")?.position).toEqual({ x: 10, y: 7 });
        expect(state.monsters.find(({ id }) => id === "m13")?.position).toEqual({ x: 7, y: 7 });
        expect(
            state.history.some((event) => event.monsterId === "m7" && event.damageToEnemies),
        ).toBe(true);
    });

    it("retrouve le passage libre du Fantôme dans le match 93 avec un dé de mouvement", () => {
        const state = historicalPosition(match93, 1);
        state.turn = 12;
        state.profiles[1] = "random-strategy";
        state.tactics[1] = "balanced";
        performMovements(state, createCustomBoard(19, 15));
        expect(state.monsters.find(({ id }) => id === "m9")?.position).toEqual({ x: 5, y: 8 });
        expect(state.statistics[1].stagnantMonsterTurns).toBe(0);
    });
});
