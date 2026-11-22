import { describe, expect, it } from "vitest";
import { MONSTERS } from "../src/data/monsters";
import {
    analyzeMonster,
    analyzeMonsters,
    calculateAttacksNeeded,
    calculateEffectiveDamage,
    calculateAverageAttacksNeeded,
    calculateActionEconomyScore,
    calculateMobilityScore,
    calculateUtilityScore,
    BALANCE_WEIGHTS,
    getMonsterArmor,
} from "../src/simulation/monsterBalance";

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
        expect(report.armor).toBe(getMonsterArmor(pirate));
        expect(report.scores.durability).toBeGreaterThan(0);
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

    it("applique l'armure individuellement à chaque attaque représentative", () => {
        expect(calculateEffectiveDamage(2, 0)).toBe(2);
        expect(calculateEffectiveDamage(2, 1)).toBe(1);
        expect(calculateEffectiveDamage(2, 2)).toBe(0);
        expect(calculateEffectiveDamage(4, 1)).toBe(3);
        expect(calculateEffectiveDamage(5, 2)).toBe(3);
        expect(calculateEffectiveDamage(5, 0)).toBe(5);
        expect(calculateAttacksNeeded(5, 2, 2)).toBeNull();
        expect(getMonsterArmor({})).toBe(0);
        expect(getMonsterArmor({ armor: undefined })).toBe(0);
        expect(getMonsterArmor({ armor: null as unknown as number })).toBe(0);
    });

    it("calcule une robustesse moyenne monotone avec les PV et l'armure", () => {
        expect(calculateAverageAttacksNeeded(5, 0, [2])).toBe(3);
        expect(calculateAverageAttacksNeeded(5, 1, [2])).toBe(5);
        expect(calculateAverageAttacksNeeded(5, 2, [2])).toBeNull();
        expect(calculateAverageAttacksNeeded(5, 1, [4])).toBe(2);

        const noArmor = { id: "test", name: "Test", symbol: "T", color: 0, cost: 1, hp: 5, movementRange: 1, armor: 0, attacks: [] };
        const armored = { ...noArmor, armor: 1 };
        expect(analyzeMonster(armored).scores.durability).toBeGreaterThanOrEqual(
            analyzeMonster(noArmor).scores.durability,
        );
        expect(analyzeMonster({ ...noArmor, hp: 7 }).scores.durability).toBeGreaterThanOrEqual(
            analyzeMonster(noArmor).scores.durability,
        );
    });

    it("sépare les économies d'action, la mobilité et l'utilité tactique", () => {
        const thief = MONSTERS.find((monster) => monster.id === "thief");
        const ghost = MONSTERS.find((monster) => monster.id === "ghost");
        const priest = MONSTERS.find((monster) => monster.id === "priest");
        const shaman = MONSTERS.find((monster) => monster.id === "shaman");
        if (!thief || !ghost || !priest || !shaman) {
            throw new Error("Profils de test indisponibles.");
        }

        expect(calculateMobilityScore(thief)).toBeGreaterThan(calculateMobilityScore(ghost));
        expect(calculateUtilityScore(thief)).toBeGreaterThan(calculateUtilityScore(ghost));
        expect(calculateUtilityScore(priest)).toBeGreaterThan(calculateUtilityScore(ghost));
        expect(calculateUtilityScore(shaman)).toBeGreaterThan(calculateUtilityScore(ghost));

        const repeatable = {
            ...ghost,
            attacks: [
                { name: "Réutilisable", damage: 2, cost: 1, pattern: { type: "adjacent" as const }, usesPerTurn: 2 },
            ],
        };
        const cooldown = {
            ...ghost,
            attacks: [
                { name: "Recharge", damage: 2, cost: 1, pattern: { type: "adjacent" as const }, cooldownTurns: 2 },
            ],
        };
        expect(calculateActionEconomyScore(repeatable)).toBeGreaterThan(
            calculateActionEconomyScore(cooldown),
        );
        expect(calculateActionEconomyScore(cooldown)).toBeGreaterThanOrEqual(0);
        expect(Object.keys(BALANCE_WEIGHTS)).toEqual([
            "durability",
            "offense",
            "mobility",
            "utility",
            "actionEconomy",
        ]);
        expect(Object.values(BALANCE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1);
        const thiefBalance = analyzeMonster(thief);
        expect(thiefBalance.scores.total).toBeCloseTo(
            thiefBalance.scores.durability * BALANCE_WEIGHTS.durability +
                thiefBalance.scores.offense * BALANCE_WEIGHTS.offense +
                thiefBalance.scores.mobility * BALANCE_WEIGHTS.mobility +
                thiefBalance.scores.utility * BALANCE_WEIGHTS.utility +
                thiefBalance.scores.actionEconomy * BALANCE_WEIGHTS.actionEconomy,
        );
    });

    it("calcule les dégâts moyens par attaque avec cooldowns et sans multiplier les zones", () => {
        const blackKnight = MONSTERS.find((monster) => monster.id === "black-knight");
        const pirate = MONSTERS.find((monster) => monster.id === "pirate");
        const noAttacks = { ...MONSTERS[0]!, attacks: [] };
        if (!blackKnight || !pirate) throw new Error("Profils de test indisponibles.");

        const knight = analyzeMonster(blackKnight);
        const pirateReport = analyzeMonster(pirate);
        expect(knight.averageDamagePerAttack).not.toBeNull();
        expect(Number.isFinite(knight.averageDamagePerAttack)).toBe(true);
        expect(knight.averageAttacksToEliminate).not.toBeNull();
        expect(Number.isFinite(knight.averageAttacksToEliminate)).toBe(true);
        expect(knight.attacks).toHaveLength(2);
        expect(knight.attacks.map(({ directDamage }) => directDamage)).toEqual(
            blackKnight.attacks.map(({ damage }) => damage),
        );
        expect(blackKnight.attackActionsPerTurn).toBe(2);
        expect(blackKnight.attacks[1]?.cooldownTurns).toBe(1);
        expect(knight.averageDamagePerAttack).toBeGreaterThan(2);
        expect(knight.averageDamagePerAttack).toBeLessThan(7);
        expect(knight.averageDamagePerAttack).toBeCloseTo(4);
        expect(pirateReport.averageDamagePerAttack).toBeCloseTo(5);
        expect(analyzeMonster(noAttacks).averageDamagePerAttack).toBeNull();

        for (const monster of MONSTERS) {
            const averageDamage = analyzeMonster(monster).averageDamagePerAttack;
            expect(averageDamage === null || Number.isFinite(averageDamage)).toBe(true);
        }
    });
});
