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
        data.matches[0]!.winner = 1;
        data.matches[0]!.finishReason = "baseDestroyed";
        data.matches[1]!.winner = 2;
        data.matches[1]!.finishReason = "monstersEliminated";
        data.matches[0]!.remainingResources = {
            1: { invocation: 1, attack: 2, movement: 3 },
            2: { invocation: 0, attack: 1, movement: 2 },
        };
        data.matches[1]!.remainingResources = {
            1: { invocation: 2, attack: 3, movement: 4 },
            2: { invocation: 1, attack: 2, movement: 3 },
        };
        data.matches[0]!.statistics[1].symbolsSpent = {
            invocation: 2,
            attack: 4,
            movement: 6,
        };
        data.matches[1]!.statistics[1].symbolsSpent = {
            invocation: 4,
            attack: 6,
            movement: 8,
        };
        data.matches[0]!.statistics[1].conversionLosses = 2;
        data.matches[1]!.statistics[1].conversionLosses = 4;
        delete data.matches[0]!.statistics[2].symbolsSpent;
        delete data.matches[1]!.statistics[2].symbolsSpent;
        delete data.matches[0]!.statistics[2].conversionLosses;
        delete data.matches[1]!.statistics[2].conversionLosses;
        data.matches[0]!.statistics[1].unusedResources = {
            invocation: 999,
            attack: 999,
            movement: 999,
        };
        const baselineGhost = analyzeSimulationData(data).monsters.find(
            (monster) => monster.id === "ghost",
        );
        const baselineSwampThing = analyzeSimulationData(data).monsters.find(
            (monster) => monster.id === "swamp-thing",
        );
        if (!baselineGhost) throw new Error("Analyse du fantôme attendue.");
        if (!baselineSwampThing) throw new Error("Analyse de la créature des marais attendue.");

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
                monsterName: data.configuration.monsters.find((monster) => monster.id === "ghost")
                    ?.name,
                damage: 6,
            },
            {
                turn: 1,
                player: 1,
                type: "status",
                description: "La Créature des Marais inflige des dégâts de poison.",
                monsterId: "placed-swamp-thing",
                monsterTypeId: "swamp-thing",
                monsterName: "Créature des Marais",
                target: "Fantôme (J2)",
                damage: 4,
            },
        );

        const analytics = analyzeSimulationData(data);
        expect(analytics.averageTurns).toBe(1);
        expect(analytics.averageRemainingResources).toEqual({ 1: 7.5, 2: 4.5 });
        expect(analytics.averageSymbolsSpent).toEqual({
            1: { invocation: 3, attack: 5, movement: 7 },
            2: null,
        });
        expect(analytics.averageConversionLosses).toEqual({ 1: 3, 2: null });
        expect(analytics.turnDistribution).toEqual([{ turns: 1, matches: 2 }]);
        expect(analytics.averageDeployments[1]).toBeGreaterThanOrEqual(0);
        expect(analytics.winsByFinishReason).toEqual({
            baseDestroyed: 1,
            monstersEliminated: 1,
        });
        const ghostAnalysis = analytics.monsters.find((monster) => monster.id === "ghost");
        const swampThingAnalysis = analytics.monsters.find(
            (monster) => monster.id === "swamp-thing",
        );
        expect(ghostAnalysis?.attacks).toBe(baselineGhost.attacks + 3);
        expect(ghostAnalysis?.averageDamage).toBeCloseTo(
            (baselineGhost.averageDamage * baselineGhost.attacks + 12) /
                (baselineGhost.attacks + 3),
        );
        expect(swampThingAnalysis?.totalDamage).toBe(baselineSwampThing.totalDamage + 4);
        expect(swampThingAnalysis?.attacks).toBe(baselineSwampThing.attacks);
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
