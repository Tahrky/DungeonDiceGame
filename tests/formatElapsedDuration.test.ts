import { describe, expect, it } from "vitest";

import { formatElapsedDuration } from "../src/simulation/formatElapsedDuration";

describe("formatElapsedDuration", () => {
    it("formate les durées courtes avec une décimale", () => {
        expect(formatElapsedDuration(1250)).toBe("1,3 s");
        expect(formatElapsedDuration(0)).toBe("0,0 s");
    });

    it("formate les durées longues en minutes et heures", () => {
        expect(formatElapsedDuration(65_400)).toBe("1 min 5 s");
        expect(formatElapsedDuration(3_661_000)).toBe("1 h 1 min 1 s");
    });
});
