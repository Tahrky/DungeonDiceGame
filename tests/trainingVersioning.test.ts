import { describe, expect, it } from "vitest";
import { getDefaultBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import {
    compareTrainingCompatibility,
    createTrainingFingerprint,
} from "../src/simulation/trainingVersioning";

describe("empreintes et compatibilité des entraînements", () => {
    it("ignore les changements cosmétiques et identifiants de plateau", () => {
        const configuration = getDefaultGameConfiguration();
        const board = getDefaultBoard();
        const baseline = createTrainingFingerprint(configuration, board);
        const cosmeticConfiguration = getDefaultGameConfiguration();
        cosmeticConfiguration.monsters[0]!.name = "Nom de test";
        cosmeticConfiguration.monsters[0]!.symbol = "?";
        cosmeticConfiguration.monsters[0]!.color = 0xffffff;
        cosmeticConfiguration.monsters[0]!.attacks[0]!.name = "Attaque renommée";

        expect(
            createTrainingFingerprint(cosmeticConfiguration, {
                ...board,
                id: `${board.id}-renamed`,
            }),
        ).toEqual(baseline);
    });

    it("empreinte les paramètres de règles, les monstres et la géométrie", () => {
        const configuration = getDefaultGameConfiguration();
        const board = getDefaultBoard();
        const baseline = createTrainingFingerprint(configuration, board);
        const changedMonster = getDefaultGameConfiguration();
        changedMonster.monsters[0]!.hp++;
        const changedRules = getDefaultGameConfiguration();
        changedRules.initialPlayerHealth++;

        expect(createTrainingFingerprint(changedMonster, board).monstersHash).not.toBe(
            baseline.monstersHash,
        );
        expect(createTrainingFingerprint(changedRules, board).rulesHash).not.toBe(
            baseline.rulesHash,
        );
        expect(
            createTrainingFingerprint(configuration, {
                ...board,
                blockedCells: [...board.blockedCells, { x: 8, y: 8 }],
            }).boardHash,
        ).not.toBe(baseline.boardHash);
    });

    it("signale les différences de règles de conversion et les versions moteur incompatibles", () => {
        const fingerprint = createTrainingFingerprint(
            getDefaultGameConfiguration(),
            getDefaultBoard(),
        );
        const changedConversion = compareTrainingCompatibility(
            {
                ...fingerprint,
                schemaVersion: 2,
                conversionHash: "modified-conversion",
            },
            fingerprint,
        );
        const changedEngine = compareTrainingCompatibility(
            {
                ...fingerprint,
                schemaVersion: 2,
                rulesEngineVersion: "older-engine",
            },
            fingerprint,
        );
        const olderWeightSchema = compareTrainingCompatibility(
            {
                ...fingerprint,
                schemaVersion: 2,
                weightsSchemaVersion: "1",
            },
            fingerprint,
        );
        const changedReportSchema = compareTrainingCompatibility(
            {
                ...fingerprint,
                schemaVersion: 1,
            },
            fingerprint,
        );
        const legacy = compareTrainingCompatibility(undefined, fingerprint);

        expect(changedConversion.level).toBe("partial");
        expect(changedConversion.differences[0]).toContain("conversion");
        expect(changedConversion.affectedGroups).toEqual(["combat", "economy", "movement"]);
        expect(changedEngine.level).toBe("incompatible");
        expect(changedEngine.differences[0]).toContain("rulesEngineVersion");
        expect(olderWeightSchema.level).toBe("partial");
        expect(olderWeightSchema.affectedGroups).toEqual(["placement", "movement"]);
        expect(changedReportSchema.level).toBe("incompatible");
        expect(changedReportSchema.differences[0]).toContain("schemaVersion");
        expect(legacy.level).toBe("legacy");
    });
});
