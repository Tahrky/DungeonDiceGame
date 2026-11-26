import { describe, expect, it } from "vitest";

import { parseSimulationOptions } from "../src/persistence/simulationRun";
import { parseGameSetup } from "../src/persistence/gameSession";
import { getDefaultBoard } from "../src/game/boards";
import { DEFAULT_BOT_STRATEGY_WEIGHTS } from "../src/game/botStrategy";
import { getDefaultDeck } from "../src/game/decks";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";

describe("reprise des options de simulation", () => {
    it("ignore les paramètres de modes supprimés dans les sauvegardes existantes", () => {
        const options = parseSimulationOptions({
            games: 12,
            seed: 731,
            maxTurns: 30,
            profile1: "balanced",
            profile2: "defensive",
            advanced: true,
            searchDepth: 3,
            branchWidth: 8,
            nodeBudget: 600,
            lightResults: true,
            debug: false,
            recordDecisionTraces: true,
        });

        expect(options).toEqual({
            games: 12,
            seed: 731,
            maxTurns: 30,
            profile1: "balanced",
            profile2: "defensive",
            debug: false,
            recordDecisionTraces: true,
        });
    });
});

describe("reprise de la configuration du bot en jeu", () => {
    it("conserve l’ancienne règle et le deck d’une partie en cours", () => {
        const configuration: Record<string, unknown> = {
            ...getDefaultGameConfiguration(),
            version: 8,
            deckSize: 3,
            maxMonstersPerPlayer: 8,
        };
        delete configuration.maxSummonsPerMonster;
        const setup = {
            mode: "local",
            board: getDefaultBoard(),
            configuration,
            playerDeck: getDefaultDeck(3),
            opponentDeck: getDefaultDeck(3),
        };
        expect(parseGameSetup(setup)).toMatchObject({
            configuration: { deckSize: 3, maxMonstersPerPlayer: 8, maxSummonsPerMonster: 8 },
            playerDeck: setup.playerDeck,
        });
    });

    it("conserve les profils, les options, les poids et la graine", () => {
        const configuration = getDefaultGameConfiguration();
        const setup = {
            mode: "computer",
            board: getDefaultBoard(),
            configuration,
            playerDeck: getDefaultDeck(configuration.deckSize),
            opponentDeck: getDefaultDeck(configuration.deckSize),
            playerProfile: "offensive",
            opponentProfile: "defensive",
            botOptions: { movementAttackCombos: true, summonPlacementPairs: true },
            botStrategyWeights: { defensive: { ...DEFAULT_BOT_STRATEGY_WEIGHTS } },
            randomSeed: 731,
        };
        expect(parseGameSetup(setup)).toEqual(setup);
        expect(
            parseGameSetup({ ...setup, botOptions: { movementAttackCombos: "yes" } }),
        ).toBeNull();
        expect(parseGameSetup({ ...setup, randomSeed: -1 })).toBeNull();
    });
});
