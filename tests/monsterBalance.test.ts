import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/data/monsters";
import { analyzeMonster, analyzeMonsters } from "../src/simulation/monsterBalance";

describe("monster balance analysis", () => {
    it("analyzes every monster from the game data in score order", () => {
        const reports = analyzeMonsters(MONSTERS);

        expect(reports).toHaveLength(MONSTERS.length);
        expect(reports.map((report) => report.id).sort()).toEqual(
            MONSTERS.map((monster) => monster.id).sort(),
        );
        expect(
            reports.every((report) => report.scores.total >= 0 && report.scores.total <= 10),
        ).toBe(true);
        expect(
            reports.every(
                (report, index) =>
                    index === 0 || reports[index - 1].scores.total >= report.scores.total,
            ),
        ).toBe(true);
    });

    it("uses the monster's current stats and includes its attack estimates", () => {
        const pirate = MONSTERS.find((monster) => monster.id === "pirate");
        expect(pirate).toBeDefined();
        if (!pirate) return;

        const report = analyzeMonster(pirate);

        expect(report.hp).toBe(pirate.hp);
        expect(report.summonCost).toBe(pirate.cost);
        expect(report.scores.durability).toBe(6.25);
        expect(report.attacks).toHaveLength(pirate.attacks.length);
        expect(report.attacks[0]).toMatchObject({
            name: pirate.attacks[0].name,
            cost: pirate.attacks[0].cost,
            directDamage: pirate.attacks[0].damage,
        });
        expect(report.attacks[0].expectedDamagePerUse).toBeGreaterThan(0);
        expect(report).not.toHaveProperty("warnings");
        expect(report.attacks[0]).not.toHaveProperty("warnings");
    });
});
