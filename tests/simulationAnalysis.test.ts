import { describe, expect, it } from "vitest";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getDefaultBoard } from "../src/game/boards";
import {
    analyzeMatchMonsters,
    analyzeSimulationData,
    parseSimulationData,
} from "../src/simulation/analysis";
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
                attackName: "Griffe",
                damage: 2,
            },
            {
                turn: 1,
                player: 1,
                type: "attack",
                description: "Test d’attaque",
                monsterId: "placed-monster-1",
                monsterTypeId: "ghost",
                attackName: "Griffe",
                damage: 4,
            },
            {
                turn: 1,
                player: 1,
                type: "attack",
                description: "Ancien événement « Griffure »",
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
        expect(ghostAnalysis?.attackUsage).toContainEqual({ name: "Griffe", uses: 2 });
        expect(ghostAnalysis?.attackUsage).toContainEqual({ name: "Griffure", uses: 1 });
        expect(ghostAnalysis?.movements).toBeGreaterThanOrEqual(0);
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

    it("agrège attaques, dégâts et déplacements par monstre dans le match et globalement", () => {
        const batch = runSimulations({
            games: 1,
            seed: 12,
            maxTurns: 1,
            profile1: "balanced",
            profile2: "balanced",
        });
        const data = parseSimulationData(batch);
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        const match = data.matches[0]!;
        const monster = match.finalMonsters[0];
        if (!monster) throw new Error("Monstre final attendu.");
        const baseline = analyzeSimulationData(data).monsters.find(
            (entry) => entry.id === monster.monsterId,
        );
        if (!baseline) throw new Error("Statistiques globales du monstre attendues.");
        const matchBaseline = analyzeMatchMonsters(match).find((entry) => entry.id === monster.id);
        if (!matchBaseline) throw new Error("Statistiques du match attendues.");
        const baselineBiteUses =
            baseline.attackUsage.find(({ name }) => name === "Morsure")?.uses ?? 0;

        match.history.push(
            {
                turn: 1,
                player: monster.owner,
                type: "attack",
                description: "Test d’attaque",
                monsterId: monster.id,
                monsterTypeId: monster.monsterId,
                monsterName: monster.name,
                attackName: "Morsure",
                damage: 3,
            },
            {
                turn: 1,
                player: monster.owner,
                type: "attack",
                description: "Test d’attaque",
                monsterId: monster.id,
                monsterTypeId: monster.monsterId,
                monsterName: monster.name,
                attackName: "Morsure",
                damage: 2,
            },
            {
                turn: 1,
                player: monster.owner,
                type: "status",
                description: "Dégâts de poison",
                monsterId: monster.id,
                monsterTypeId: monster.monsterId,
                monsterName: monster.name,
                damage: 4,
            },
            {
                turn: 1,
                player: monster.owner,
                type: "movement",
                description: "Déplacement",
                monsterId: monster.id,
                monsterTypeId: monster.monsterId,
                monsterName: monster.name,
            },
        );

        const matchAnalysis = analyzeMatchMonsters(match).find((entry) => entry.id === monster.id);
        const globalAnalysis = analyzeSimulationData(data).monsters.find(
            (entry) => entry.id === monster.monsterId,
        );

        expect(matchAnalysis).toMatchObject({
            attacks: matchBaseline.attacks + 2,
            totalDamage: matchBaseline.totalDamage + 9,
            movements: matchBaseline.movements + 1,
        });
        expect(matchAnalysis?.attackUsage).toContainEqual({
            name: "Morsure",
            uses: baselineBiteUses + 2,
        });
        expect(globalAnalysis?.attacks).toBe(baseline.attacks + 2);
        expect(globalAnalysis?.totalDamage).toBe(baseline.totalDamage + 9);
        expect(globalAnalysis?.movements).toBe(baseline.movements + 1);
        expect(globalAnalysis?.attackUsage).toContainEqual({ name: "Morsure", uses: 2 });
        expect(globalAnalysis?.averageMovements).toBeCloseTo(
            (baseline.movements + 1) / baseline.appearances,
        );
    });
});
