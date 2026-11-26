import { describe, expect, it } from "vitest";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getDefaultBoard } from "../src/game/boards";
import {
    analyzeMatchMonsters,
    analyzeProfileData,
    analyzeSimulationData,
    calculateWilsonInterval,
    parseSimulationData,
} from "../src/simulation/analysis";
import { runSimulations } from "../src/simulation/simulator";

describe("analyse des résultats de simulation", () => {
    it("calcule un intervalle de Wilson et rejette les proportions impossibles", () => {
        const interval = calculateWilsonInterval(5, 10);
        expect(interval?.lowerBound).toBeCloseTo(0.2365895936, 8);
        expect(interval?.upperBound).toBeCloseTo(0.7634104064, 8);
        expect(calculateWilsonInterval(0, 0)).toBeNull();
        expect(() => calculateWilsonInterval(11, 10)).toThrow(RangeError);
    });

    it("sépare les dégâts directs, les effets différés et les coûts par monstre", () => {
        const batch = runSimulations({
            games: 1,
            seed: 33,
            maxTurns: 1,
            profile1: "balanced",
            profile2: "balanced",
        });
        const data = parseSimulationData(batch);
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        const match = data.matches[0]!;
        for (const player of [1, 2] as const) {
            match.statistics[player].summoned = 0;
            match.statistics[player].summonedByMonster = {};
            match.statistics[player].attacks = 0;
            match.statistics[player].movements = 0;
        }
        match.statistics[1].summoned = 1;
        match.statistics[1].summonedByMonster.ghost = 1;
        match.statistics[1].attacks = 1;
        match.statistics[1].movements = 1;
        match.history = [
            {
                turn: 2,
                player: 1,
                type: "invocation",
                description: "Fantôme invoqué.",
                monsterId: "ghost-1",
                monsterTypeId: "ghost",
                monsterName: "Fantôme",
                cost: 2,
            },
            {
                turn: 3,
                player: 1,
                type: "attack",
                description: "Le Fantôme attaque.",
                monsterId: "ghost-1",
                monsterTypeId: "ghost",
                monsterName: "Fantôme",
                attackName: "Griffe",
                target: "Golem (J2) éliminé",
                damage: 4,
                cost: 1,
            },
            {
                turn: 4,
                player: 1,
                type: "status",
                description: "Poison.",
                monsterId: "ghost-1",
                monsterTypeId: "ghost",
                monsterName: "Fantôme",
                damage: 2,
            },
            {
                turn: 4,
                player: 1,
                type: "movement",
                description: "Le Fantôme se déplace.",
                monsterId: "ghost-1",
                monsterTypeId: "ghost",
                monsterName: "Fantôme",
                cost: 1,
            },
        ];

        const ghost = analyzeSimulationData(data).monsters.find(({ id }) => id === "ghost");
        expect(ghost).toMatchObject({
            directDamage: 4,
            damageOverTime: 2,
            totalDamage: 6,
            attacks: 1,
            attacksWithDamage: 1,
            kills: 1,
            movements: 1,
            averageFirstInvocationTurn: 2,
            resourceCosts: { invocation: 2, attack: 1, movement: 1 },
        });
    });

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
        expect(analytics.playerOutcomes[1]).toMatchObject({
            wins: 1,
            draws: 0,
            matches: 2,
            winRate: 0.5,
        });
        expect(analytics.playerOutcomes[1].confidenceInterval).not.toBeNull();
        expect(analytics.turnLimitMatches).toBe(0);
        expect(
            analytics.startingPlayerOutcomes[1].matches +
                analytics.startingPlayerOutcomes[2].matches,
        ).toBe(2);
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

    it("filtre les résultats et les actions par profil, y compris les matchs miroir", () => {
        const batch = runSimulations({
            games: 5,
            seed: 33,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "support",
        });
        const data = parseSimulationData(batch);
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        const [first, second, mirror, unrelated, loss] = data.matches;
        first.profiles = { 1: "cheap", 2: "support" };
        first.winner = 1;
        first.finishReason = "baseDestroyed";
        first.turns = 8;
        second.profiles = { 1: "support", 2: "cheap" };
        second.winner = 2;
        second.finishReason = "monstersEliminated";
        second.turns = 11;
        mirror.profiles = { 1: "cheap", 2: "cheap" };
        mirror.winner = null;
        mirror.finishReason = "turnLimit";
        mirror.turns = 8;
        unrelated.profiles = { 1: "support", 2: "balanced" };
        unrelated.winner = 2;
        unrelated.finishReason = "baseDestroyed";
        loss.profiles = { 1: "cheap", 2: "support" };
        loss.winner = 2;
        loss.finishReason = "baseDestroyed";
        loss.turns = 9;

        for (const match of data.matches) {
            for (const player of [1, 2] as const) {
                Object.assign(match.statistics[player], {
                    summoned: 1,
                    summonedByMonster: { ghost: 1 },
                    attacks: 1,
                    movements: 0,
                });
            }
            match.history = [1, 2].flatMap((player) => [
                {
                    turn: player,
                    player: player === 1 ? 1 : 2,
                    type: "invocation" as const,
                    description: "Invocation",
                    monsterTypeId: "ghost",
                    cost: 1,
                },
                {
                    turn: 3,
                    player: player === 1 ? 1 : 2,
                    type: "attack" as const,
                    description: "Attaque",
                    monsterTypeId: "ghost",
                    attackName: "Griffe",
                    damage: player === 1 ? 2 : 5,
                    cost: 1,
                },
            ]);
        }
        first.history.push({
            turn: 4,
            player: 1,
            type: "status",
            description: "Poison",
            monsterTypeId: "ghost",
            damage: 3,
        });
        const original = structuredClone(data);

        const analytics = analyzeProfileData(data, "cheap");
        expect(analytics).toMatchObject({
            matchCount: 4,
            averageTurns: 9,
            winRate: 0.5,
            winsByPlayer: { 1: 1, 2: 1 },
            winsByFinishReason: { baseDestroyed: 1, monstersEliminated: 1 },
            draws: 1,
            hasDetailedHistory: true,
            turnDistribution: [
                { turns: 8, matches: 2 },
                { turns: 9, matches: 1 },
                { turns: 11, matches: 1 },
            ],
        });
        expect(analytics.monsters.find(({ id }) => id === "ghost")).toMatchObject({
            appearances: 5,
            matchesSeen: 4,
            attacks: 5,
            directDamage: 16,
            damageOverTime: 3,
            totalDamage: 19,
            resourceCosts: { invocation: 5, attack: 5, movement: 0 },
            averageFirstInvocationTurn: 1.25,
            attackUsage: [{ name: "Griffe", uses: 5 }],
        });
        expect(data).toEqual(original);

        const fractional = structuredClone(data);
        fractional.matches[1].turns = 12;
        expect(analyzeProfileData(fractional, "cheap").averageTurns).toBe(9.25);
        expect(analyzeProfileData(data, "tracker").averageTurns).toBeNull();
        expect(analyzeProfileData(data, "tracker").winRate).toBeNull();
        const noWins = structuredClone(data);
        for (const match of noWins.matches) match.winner = null;
        expect(analyzeProfileData(noWins, "cheap").winRate).toBe(0);

        const mirrorWin = structuredClone(data);
        mirrorWin.matches[2].winner = 2;
        mirrorWin.matches[2].finishReason = "baseDestroyed";
        expect(analyzeProfileData(mirrorWin, "cheap")).toMatchObject({
            matchCount: 4,
            winRate: 0.75,
            winsByPlayer: { 1: 1, 2: 2 },
            winsByFinishReason: { baseDestroyed: 2, monstersEliminated: 1 },
            draws: 0,
        });
    });

    it("ne masque les détails que si un match du profil a un historique absent", () => {
        const batch = runSimulations({
            games: 2,
            seed: 33,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "support",
        });
        const data = parseSimulationData(batch);
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        data.matches[0].profiles = { 1: "cheap", 2: "cheap" };
        data.matches[1].profiles = { 1: "support", 2: "support" };
        data.matches[1].history = [];

        expect(analyzeProfileData(data, "cheap").hasDetailedHistory).toBe(true);
        const light = analyzeProfileData(data, "support");
        expect(light.hasDetailedHistory).toBe(false);
        expect(light.monsters.every(({ resourceCosts }) => resourceCosts === null)).toBe(true);
    });
});
