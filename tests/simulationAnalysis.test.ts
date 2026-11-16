import { describe, expect, it } from "vitest";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getDefaultBoard } from "../src/game/boards";
import { analyzeSimulationData, parseSimulationData } from "../src/simulation/analysis";
import { runSimulations } from "../src/simulation/simulator";

describe("analyse des résultats de simulation", () => {
    it("valide les exports et agrège les apparitions, dégâts et durées", () => {
        const batch = runSimulations({
            games: 2,
            seed: 7,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "support",
        });
        const data = parseSimulationData(batch);
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        data.matches[0]!.history.push(
            {
                turn: 1,
                player: 1,
                type: "attack",
                description: "Test d’attaque",
                monsterId: "placed-monster-1",
                monsterTypeId: "ghost",
                damage: 2,
            },
            {
                turn: 1,
                player: 1,
                type: "attack",
                description: "Test d’attaque",
                monsterId: "placed-monster-1",
                monsterTypeId: "ghost",
                damage: 4,
            },
            {
                turn: 1,
                player: 1,
                type: "attack",
                description: "Ancien événement d’attaque",
                monsterId: "placed-monster-1",
                monsterName: data.configuration.monsters.find((monster) => monster.id === "ghost")?.name,
                damage: 6,
            },
        );

        const analytics = analyzeSimulationData(data);
        expect(analytics.averageTurns).toBe(1);
        expect(analytics.turnDistribution).toEqual([{ turns: 1, matches: 2 }]);
        expect(analytics.averageDeployments[1]).toBeGreaterThanOrEqual(0);
        expect(analytics.monsters.find((monster) => monster.id === "ghost")).toMatchObject({
            averageDamage: 4,
            attacks: 3,
        });
        expect(parseSimulationData({ ...batch, schemaVersion: 99 })).toBeNull();
        expect(
            parseSimulationData({
                ...batch,
                configuration: getDefaultGameConfiguration(),
                board: getDefaultBoard(),
                matches: [{ id: "invalid" }],
            }),
        ).toBeNull();
    });
});
