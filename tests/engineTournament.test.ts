import { describe, expect, it } from "vitest";
import { createAITournamentPairs } from "../src/simulation/workerPool";
import { analyzeEngineTournament } from "../src/simulation/tournament";
import type { MatchResult } from "../src/simulation/types";
import { getDefaultBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { runSimulations } from "../src/simulation/simulator";

describe("tournoi des moteurs", () => {
    it("génère exactement les six confrontations standard", () => {
        expect(createAITournamentPairs()).toEqual([
            { engine1: "heuristic", engine2: "heuristic" },
            { engine1: "heuristic", engine2: "minimax" },
            { engine1: "heuristic", engine2: "hybrid" },
            { engine1: "minimax", engine2: "minimax" },
            { engine1: "minimax", engine2: "hybrid" },
            { engine1: "hybrid", engine2: "hybrid" },
        ]);
    });

    it("compte les victoires, nuls et points de classement", () => {
        const matches = [
            {
                winner: 1,
                startingPlayer: 1,
                turns: 10,
                engines: { 1: "heuristic", 2: "minimax" },
            },
            {
                winner: null,
                startingPlayer: 2,
                turns: 20,
                engines: { 1: "hybrid", 2: "heuristic" },
            },
        ] as unknown as MatchResult[];

        const ranking = analyzeEngineTournament(matches);
        const heuristic = ranking.find(({ engine }) => engine === "heuristic")!;
        expect(heuristic.played).toBe(2);
        expect(heuristic.wins).toBe(1);
        expect(heuristic.draws).toBe(1);
        expect(heuristic.points).toBe(1.5);
    });

    it("joue le même nombre de parties et partage les mêmes seeds entre moteurs", () => {
        const result = runSimulations(
            {
                games: 12,
                seed: 731,
                maxTurns: 1,
                profile1: "balanced",
                profile2: "balanced",
                enginePairs: createAITournamentPairs(),
                engineTournament: true,
                expectiminimaxMaxDepth: 1,
                expectiminimaxBranchWidth: 1,
                expectiminimaxNodeBudget: 10,
            },
            getDefaultGameConfiguration(),
            getDefaultBoard(),
        );
        const countByEngine = new Map<string, number>();
        const seedCounts = new Map<number, number>();
        for (const match of result.matches) {
            seedCounts.set(match.seed, (seedCounts.get(match.seed) ?? 0) + 1);
            for (const engine of Object.values(match.engines ?? {})) {
                countByEngine.set(engine, (countByEngine.get(engine) ?? 0) + 1);
            }
        }

        expect(countByEngine.get("heuristic")).toBe(8);
        expect(countByEngine.get("minimax")).toBe(8);
        expect(countByEngine.get("hybrid")).toBe(8);
        expect([...seedCounts.values()]).toEqual([6, 6]);
        expect(result.matches.filter((match) => match.startingPlayer === 1)).toHaveLength(6);
        expect(result.matches.filter((match) => match.startingPlayer === 2)).toHaveLength(6);
    });
});
