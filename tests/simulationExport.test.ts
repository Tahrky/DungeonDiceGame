import { describe, expect, it } from "vitest";

import { runSimulations } from "../src/simulation/simulator";
import { createSimulationJsonBlob } from "../src/simulation/export";
import { getDefaultGameConfiguration, parseGameConfiguration } from "../src/game/gameConfiguration";
import { analyzeSimulationData, parseSimulationData } from "../src/simulation/analysis";

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

    it("analyse un export avec des caractéristiques hors des limites de configuration jouable", async () => {
        const configuration = getDefaultGameConfiguration();
        configuration.monsters[0]!.attacks[0]!.damage = 200;
        const result = runSimulations(
            { games: 1, seed: 7, maxTurns: 1, profile1: "cheap", profile2: "offensive" },
            configuration,
        );
        const exported: unknown = JSON.parse(await createSimulationJsonBlob(result).text());

        expect(parseGameConfiguration(configuration)).toBeNull();
        const data = parseSimulationData(exported);
        expect(data).not.toBeNull();
        if (!data) throw new Error("Export de simulation attendu comme valide.");
        expect(analyzeSimulationData(data).monsters).toHaveLength(configuration.monsters.length);
    });

    it("accepte un export historique dont l’ordre des monstres a changé", () => {
        const result = runSimulations({
            games: 1,
            seed: 7,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
        });
        const configuration = {
            ...result.configuration,
            monsters: [...result.configuration.monsters].reverse(),
        };
        expect(parseGameConfiguration(configuration)).toBeNull();
        const data = parseSimulationData({ ...result, configuration });
        expect(data?.configuration.monsters.map(({ id }) => id)).toEqual(
            configuration.monsters.map(({ id }) => id),
        );
    });

    it("rejette les configurations sans informations fiables pour afficher les monstres", () => {
        const result = runSimulations({
            games: 1,
            seed: 7,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
        });
        const monsters = result.configuration.monsters;
        expect(
            parseSimulationData({
                ...result,
                configuration: { ...result.configuration, monsters: [monsters[0], monsters[0]] },
            }),
        ).toBeNull();
        expect(
            parseSimulationData({
                ...result,
                configuration: {
                    ...result.configuration,
                    monsters: monsters.map((monster, index) =>
                        index === 0 ? { ...monster, color: "invalid" } : monster,
                    ),
                },
            }),
        ).toBeNull();
        expect(
            parseSimulationData({
                ...result,
                matches: result.matches.map((match) => {
                    if (!match.finalMonsters[0]) throw new Error("Monstre final attendu.");
                    return {
                        ...match,
                        finalMonsters: [{ ...match.finalMonsters[0], monsterId: "unknown" }],
                    };
                }),
            }),
        ).toBeNull();
    });
});
