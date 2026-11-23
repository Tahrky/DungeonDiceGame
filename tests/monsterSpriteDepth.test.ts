import { describe, expect, it } from "vitest";

import {
    compareMonsterSpriteDepth,
    getMonsterSpriteDepth,
} from "../src/scenes/game/monsterSpriteDepth";

describe("profondeur des sprites de monstres", () => {
    it("place la diagonale sud-est devant la diagonale nord-ouest", () => {
        const northwest = getMonsterSpriteDepth((1 + 1) * 13.5);
        const southeast = getMonsterSpriteDepth((5 + 6) * 13.5);

        expect(northwest).toBeLessThan(southeast);
    });

    it("retire l'offset de facing et départage les positions alignées", () => {
        expect(getMonsterSpriteDepth(42, 3)).toBe(39);
        expect(
            compareMonsterSpriteDepth(
                { depth: 39, x: 100, id: "west" },
                { depth: 39, x: 120, id: "east" },
            ),
        ).toBeLessThan(0);
        expect(
            compareMonsterSpriteDepth(
                { depth: 39, x: 100, id: "alpha" },
                { depth: 39, x: 100, id: "beta" },
            ),
        ).toBeLessThan(0);
    });

    it("suit la profondeur visuelle interpolée pendant un déplacement", () => {
        const start = getMonsterSpriteDepth(50, 3);
        const halfway = getMonsterSpriteDepth(70, 3);
        const destination = getMonsterSpriteDepth(90, 3);

        expect(start).toBeLessThan(halfway);
        expect(halfway).toBeLessThan(destination);
    });
});
