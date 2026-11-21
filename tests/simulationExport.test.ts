import { describe, expect, it } from "vitest";

import { runSimulations } from "../src/simulation/simulator";
import { createSimulationJsonBlob } from "../src/simulation/export";

describe("export JSON des simulations", () => {
    it("sérialise chaque match sans changer les résultats exportés", async () => {
        const result = runSimulations({
            games: 2,
            seed: 7,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
            recordDecisionTraces: true,
        });

        const blob = createSimulationJsonBlob(result);

        expect(blob.type).toBe("application/json");
        expect(JSON.parse(await blob.text())).toEqual(result);
    });
});
