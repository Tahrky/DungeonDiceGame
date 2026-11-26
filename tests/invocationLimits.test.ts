import { describe, expect, it } from "vitest";
import {
    GAME_CONFIGURATION_VERSION,
    getDefaultGameConfiguration,
    parseGameConfiguration,
    parseSavedMatchConfiguration,
} from "../src/game/gameConfiguration";
import { runSimulations } from "../src/simulation/simulator";

describe("limite d’invocations par type", () => {
    it("impose assez de types pour couvrir les invocations autorisées", () => {
        const configuration = getDefaultGameConfiguration();
        expect(configuration.maxSummonsPerMonster).toBe(2);
        expect(
            parseGameConfiguration({
                ...configuration,
                maxMonstersPerPlayer: 8,
                maxSummonsPerMonster: 1,
                deckSize: 7,
            }),
        ).toBeNull();
        expect(
            parseGameConfiguration({
                ...configuration,
                maxMonstersPerPlayer: 8,
                maxSummonsPerMonster: 1,
                deckSize: 8,
            }),
        ).not.toBeNull();
        expect(
            parseGameConfiguration({
                ...configuration,
                maxMonstersPerPlayer: 9,
                maxSummonsPerMonster: 3,
                deckSize: 4,
            }),
        ).not.toBeNull();
        expect(
            parseGameConfiguration({
                ...configuration,
                maxMonstersPerPlayer: 10,
                maxSummonsPerMonster: 3,
                deckSize: 3,
            }),
        ).toBeNull();
        expect(parseGameConfiguration({ ...configuration, maxSummonsPerMonster: 0 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, maxSummonsPerMonster: 1.5 })).toBeNull();
    });

    it("migre les réglages et conserve les règles des simulations en cours", () => {
        const legacy: Record<string, unknown> = {
            ...getDefaultGameConfiguration(),
            version: 8,
            deckSize: 3,
            maxMonstersPerPlayer: 10,
        };
        delete legacy.maxSummonsPerMonster;
        expect(parseGameConfiguration(legacy)).toMatchObject({
            version: GAME_CONFIGURATION_VERSION,
            deckSize: 5,
            maxSummonsPerMonster: 2,
            maxMonstersPerPlayer: 10,
        });
        expect(parseSavedMatchConfiguration(legacy)).toMatchObject({
            deckSize: 3,
            maxSummonsPerMonster: 10,
        });
        legacy.maxSummonsPerMonster = null;
        expect(parseGameConfiguration(legacy)).toBeNull();
    });

    it("respecte la limite dans les matchs simulés pour les deux joueurs", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.maxSummonsPerMonster = 1;
        configuration.deckSize = 8;
        const result = runSimulations(
            {
                games: 4,
                seed: 731,
                maxTurns: 8,
                profile1: "cheap",
                profile2: "balanced",
            },
            configuration,
        );
        for (const match of result.matches) {
            for (const player of [1, 2] as const) {
                expect(
                    Object.values(match.statistics[player].summonedByMonster).every(
                        (count) => count <= 1,
                    ),
                ).toBe(true);
                expect(match.decks[player]).toHaveLength(8);
            }
        }
    });
});
