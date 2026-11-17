import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { evaluateStrategicState, getStrategicCellScore } from "../src/game/ai";
import { runCrossProfileTournament, runSimulations } from "../src/simulation/simulator";
import { createStats, type MatchState } from "../src/simulation/matchState";
import type { StrategicSnapshot } from "../src/game/ai";

function createSnapshot(
    health1: number,
    health2: number,
): StrategicSnapshot {
    const board = createCustomBoard(7, 7);
    return {
        board,
        health: { 1: health1, 2: health2 },
        initialHealth: 3,
        monsters: [],
        reserves: {
            1: { invocation: 2, attack: 2, movement: 2 },
            2: { invocation: 1, attack: 1, movement: 1 },
        },
        profile: "defensive",
        tactics: { 1: "defense", 2: "offense" },
        currentPlayer: 1,
        turn: 1,
    };
}

describe("noyau de décision tactique", () => {
    it("pénalise une base proche de la destruction", () => {
        const endangered = evaluateStrategicState(createSnapshot(1, 3));
        const stable = evaluateStrategicState(createSnapshot(3, 3));
        expect(endangered).toBeLessThan(stable);
    });

    it("valorise une position défensive proche du périmètre", () => {
        const snapshot = createSnapshot(3, 3);
        const starts = getStartingPositions(snapshot.board);
        const perimeter = { x: starts[1].x + 3, y: starts[1].y };
        const farCorner = { x: snapshot.board.width - 1, y: snapshot.board.height - 1 };
        expect(
            getStrategicCellScore(snapshot, 1, perimeter),
        ).toBeGreaterThan(getStrategicCellScore(snapshot, 1, farCorner));
    });

    it("active les détails de debug uniquement sur demande", () => {
        const normal = runSimulations({
            games: 1,
            seed: 42,
            maxTurns: 1,
            profile1: "balanced",
            profile2: "offensive",
        });
        const debug = runSimulations({
            games: 1,
            seed: 193,
            maxTurns: 5,
            profile1: "balanced",
            profile2: "offensive",
            debug: true,
        });

        expect(normal.matches[0]?.history.some((event) => event.debug)).toBe(false);
        expect(debug.matches[0]?.history.some((event) => event.debug)).toBe(true);
    });

    it("produit un tournoi croisé reproductible des sept profils", () => {
        const tournament = runCrossProfileTournament({
            games: 1,
            seed: 101,
            maxTurns: 1,
        });
        expect(tournament).toHaveLength(49);
        expect(new Set(tournament.map((match) =>
            `${match.profile1}-${match.profile2}-${match.result.matches[0]?.seed}`,
        )).size).toBe(49);
    }, 600_000);

    it("conserve les nouvelles statistiques lorsqu’elles sont absentes des anciens exports", () => {
        const configuration = getDefaultGameConfiguration();
        const monster = configuration.monsters[0];
        if (!monster) throw new Error("Monstre attendu.");
        const state: MatchState = {
            turn: 1,
            currentPlayer: 1,
            profiles: { 1: "balanced", 2: "offensive" },
            tactics: { 1: "balanced", 2: "offense" },
            allowBaseAttackOnSummonTurn: true,
            health: { 1: 3, 2: 3 },
            reserves: {
                1: { invocation: 1, attack: 1, movement: 1 },
                2: { invocation: 0, attack: 0, movement: 0 },
            },
            monsters: [
                {
                    id: "placed",
                    monster,
                    owner: 1,
                    position: { x: 1, y: 1 },
                    facing: "east",
                    currentHp: monster.hp,
                    cells: [{ x: 1, y: 1 }],
                    summonedOnTurn: 1,
                    attacksUsedThisTurn: 0,
                    attackUsesThisTurn: getInitialAttackUses(monster),
                    movementsUsedThisTurn: 0,
                    attackCooldowns: getInitialAttackCooldowns(monster),
                    statusEffects: [],
                },
            ],
            history: [],
            winner: null,
            finishReason: "turnLimit",
            statistics: { 1: createStats(), 2: createStats() },
            nextMonsterId: 2,
            monstersKilledForVictory: configuration.monstersKilledForVictory,
        };
        expect(state.statistics[1].monstersLost).toBe(0);
        expect(state.statistics[1].unusedResources).toEqual({
            invocation: 0,
            attack: 0,
            movement: 0,
        });
    });
});
