import { describe, expect, it } from "vitest";

import { parseSimulationOptions } from "../src/sessionPersistence";

describe("reprise des options de simulation", () => {
    it("ignore les paramètres de modes supprimés dans les sauvegardes existantes", () => {
        const options = parseSimulationOptions({
            games: 12,
            seed: 731,
            maxTurns: 30,
            profile1: "balanced",
            profile2: "defensive",
            advanced: true,
            searchDepth: 3,
            branchWidth: 8,
            nodeBudget: 600,
            lightResults: true,
            debug: false,
            recordDecisionTraces: true,
        });

        expect(options).toEqual({
            games: 12,
            seed: 731,
            maxTurns: 30,
            profile1: "balanced",
            profile2: "defensive",
            debug: false,
            recordDecisionTraces: true,
        });
    });
});
