import { describe, expect, it } from "vitest";

import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { runSimulations } from "../src/simulation/simulator";
import {
    createSimulationChunks,
    createCrossProfilePairs,
    CROSS_PROFILE_MATCHUP_COUNT,
    getSimulationWorkerCount,
    mergeSimulationResults,
} from "../src/simulation/workerPool";

describe("pool de workers de simulation", () => {
    it("borne le nombre de workers au matériel, au maximum et au nombre de matchs", () => {
        expect(getSimulationWorkerCount(10, 8)).toBe(4);
        expect(getSimulationWorkerCount(2, 8)).toBe(2);
        expect(getSimulationWorkerCount(10, 1)).toBe(1);
    });

    it("partitionne tous les matchs en lots contigus sans chevauchement", () => {
        const chunks = createSimulationChunks(10, 3);
        let nextStartIndex = 0;

        for (const chunk of chunks) {
            expect(chunk.startIndex).toBe(nextStartIndex);
            expect(chunk.games).toBeGreaterThan(0);
            nextStartIndex += chunk.games;
        }

        expect(nextStartIndex).toBe(10);
        expect(chunks.length).toBeLessThanOrEqual(12);
    });

    it("crée toutes les confrontations entre profils dans les deux sens, sans auto-match", () => {
        const pairs = createCrossProfilePairs();

        expect(pairs).toHaveLength(CROSS_PROFILE_MATCHUP_COUNT);
        expect(new Set(pairs.map(({ profile1, profile2 }) => `${profile1}:${profile2}`)).size).toBe(
            CROSS_PROFILE_MATCHUP_COUNT,
        );
        expect(pairs.every(({ profile1, profile2 }) => profile1 !== profile2)).toBe(true);
        expect(
            pairs.every(({ profile1, profile2 }) =>
                pairs.some((pair) => pair.profile1 === profile2 && pair.profile2 === profile1),
            ),
        ).toBe(true);
    });

    it("fusionne des lots dans l’ordre global sans modifier les seeds ni les résultats", () => {
        const options = {
            games: 3,
            seed: 0xffff_fffe,
            maxTurns: 1,
            profile1: "cheap" as const,
            profile2: "offensive" as const,
        };
        const configuration = getDefaultGameConfiguration();
        const complete = runSimulations(options, configuration);
        const partialResults = createSimulationChunks(options.games, 2).map((chunk) =>
            runSimulations(
                { ...options, games: chunk.games },
                configuration,
                undefined,
                chunk.startIndex,
            ),
        );
        const merged = mergeSimulationResults(partialResults.reverse(), options);

        expect(
            merged.matches.map(
                ({
                    id,
                    seed,
                    startingPlayer,
                    winner,
                    finishReason,
                    turns,
                    finalBoard,
                    finalMonsters,
                    history,
                }) => ({
                    id,
                    seed,
                    startingPlayer,
                    winner,
                    finishReason,
                    turns,
                    finalBoard,
                    finalMonsters,
                    history,
                }),
            ),
        ).toEqual(
            complete.matches.map(
                ({
                    id,
                    seed,
                    startingPlayer,
                    winner,
                    finishReason,
                    turns,
                    finalBoard,
                    finalMonsters,
                    history,
                }) => ({
                    id,
                    seed,
                    startingPlayer,
                    winner,
                    finishReason,
                    turns,
                    finalBoard,
                    finalMonsters,
                    history,
                }),
            ),
        );
        expect(merged.summary).toEqual(complete.summary);
        expect(merged.options).toEqual(options);
    });

    it("refuse de fusionner un lot incomplet", () => {
        const options = {
            games: 2,
            seed: 7,
            maxTurns: 1,
            profile1: "cheap" as const,
            profile2: "offensive" as const,
        };
        const partial = runSimulations(options);

        expect(() => mergeSimulationResults([partial], { ...options, games: 3 })).toThrow(
            "Le nombre de matchs reçus ne correspond pas à la demande.",
        );
    });
});
