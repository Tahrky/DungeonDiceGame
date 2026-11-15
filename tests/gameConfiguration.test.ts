import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";
import {
    getDefaultGameConfiguration,
    parseGameConfiguration,
    parseMonsterConfiguration,
    serializeGameConfiguration,
} from "../src/game/gameConfiguration";

describe("configuration des règles de partie", () => {
    it("sérialise puis valide les réglages et profils par défaut", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.diceCount = 3;
        configuration.randomBoard = true;
        configuration.testBoard = true;
        configuration.initialPlayerHealth = 7;
        configuration.maxMonstersPerPlayer = 4;
        configuration.monstersKilledForVictory = 6;

        expect(
            parseGameConfiguration(JSON.parse(serializeGameConfiguration(configuration))),
        ).toEqual(configuration);
        expect(MONSTERS.find((monster) => monster.id === "frost-mage")?.hp).toBe(5);
    });

    it("désactive le plateau de test par défaut et accepte les anciennes configurations", () => {
        const configuration = getDefaultGameConfiguration();
        expect(configuration.testBoard).toBe(false);
        expect(configuration.diceCount).toBe(5);
        expect(configuration.maxMonstersPerPlayer).toBe(8);
        expect(configuration.monstersKilledForVictory).toBe(8);

        const legacyConfiguration = JSON.parse(serializeGameConfiguration(configuration));
        legacyConfiguration.version = 2;
        delete legacyConfiguration.testBoard;
        delete legacyConfiguration.monstersKilledForVictory;
        expect(parseGameConfiguration(legacyConfiguration)?.testBoard).toBe(false);
        expect(parseGameConfiguration(legacyConfiguration)?.monstersKilledForVictory).toBe(8);
    });

    it("migre les profils enregistrés en remplaçant l'ancien motif de soin du Prêtre", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.diceCount = 3;
        const priest = configuration.monsters.find((monster) => monster.id === "priest");
        expect(priest).toBeDefined();
        priest!.attacks[0].pattern = {
            type: "line",
            range: 4,
            allDirections: true,
        };
        const legacyConfiguration: Record<string, unknown> = {
            ...configuration,
            version: 1,
        };
        delete legacyConfiguration.monstersKilledForVictory;

        const migrated = parseGameConfiguration(legacyConfiguration);

        expect(migrated?.version).toBe(3);
        expect(migrated?.diceCount).toBe(3);
        expect(migrated?.monstersKilledForVictory).toBe(8);
        expect(migrated?.monsters.find((monster) => monster.id === "priest")?.attacks[0].pattern)
            .toEqual({ type: "radius", range: 4 });
    });

    it("migre les réglages v2 en ajoutant la condition de victoire par défaut", () => {
        const legacyConfiguration: Record<string, unknown> = JSON.parse(
            serializeGameConfiguration(getDefaultGameConfiguration()),
        );
        legacyConfiguration.version = 2;
        delete legacyConfiguration.monstersKilledForVictory;

        expect(parseGameConfiguration(legacyConfiguration)).toMatchObject({
            version: 3,
            monstersKilledForVictory: 8,
        });
    });

    it("valide les motifs et capacités modifiés sans accepter de profil incomplet", () => {
        const profile = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "archer",
        );
        expect(profile).toBeDefined();
        const changedProfile = {
            ...profile!,
            attacks: profile!.attacks.map((attack) => ({
                ...attack,
                damage: attack.damage + 1,
                pattern: { type: "line", range: 6, minRange: 1, allDirections: false },
            })),
        };

        expect(parseMonsterConfiguration(changedProfile, "archer")?.attacks[0]).toMatchObject({
            damage: 2,
            pattern: { type: "line", range: 6, minRange: 1 },
        });
        expect(parseMonsterConfiguration(changedProfile, "ghost")).toBeNull();
        expect(
            parseMonsterConfiguration({
                ...changedProfile,
                attacks: [{ ...changedProfile.attacks[0], pattern: { type: "line", range: 0 } }],
            }),
        ).toBeNull();
    });

    it("préserve la catégorie d'animation et refuse les animations inconnues", () => {
        const archer = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "archer",
        );
        expect(archer).toBeDefined();
        expect(parseMonsterConfiguration(archer, "archer")?.attacks[1].animation).toBe(
            "alternativeAttack1",
        );
        for (const legacyAnimation of ["attackAoe", "strongAttack"]) {
            expect(
                parseMonsterConfiguration({
                    ...archer,
                    attacks: [{ ...archer!.attacks[0], animation: legacyAnimation }],
                })?.attacks[0].animation,
            ).toBe("alternativeAttack1");
        }
        expect(
            parseMonsterConfiguration({
                ...archer,
                attacks: [{ ...archer!.attacks[0], animation: "unknown" }],
            }),
        ).toBeNull();
    });

    it("récupère les animations par défaut des anciennes configurations", () => {
        const blackKnight = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "black-knight",
        );
        expect(blackKnight).toBeDefined();
        const legacyProfile = {
            ...blackKnight,
            attacks: blackKnight!.attacks.map((attack) => {
                const legacyAttack = { ...attack };
                delete legacyAttack.animation;
                return legacyAttack;
            }),
        };

        expect(parseMonsterConfiguration(legacyProfile, "black-knight")?.attacks[1].animation).toBe(
            "alternativeAttack1",
        );
    });

    it("préserve les effets de soutien et exige une cible alliée", () => {
        const priest = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "priest",
        );
        expect(priest).toBeDefined();

        expect(parseMonsterConfiguration(priest, "priest")?.attacks).toEqual(priest?.attacks);
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [{ ...priest!.attacks[0], targetsAlliesOnly: false }, priest!.attacks[1]],
            }),
        ).toBeNull();
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [{ ...priest!.attacks[0], usesPerTurn: 0 }, priest!.attacks[1]],
            }),
        ).toBeNull();
    });

    it("refuse les configurations de version ou de limites invalides", () => {
        const configuration = getDefaultGameConfiguration();
        expect(parseGameConfiguration({ ...configuration, version: 4 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, diceCount: 1 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, diceCount: 9 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, diceCount: 2 })?.diceCount).toBe(2);
        expect(parseGameConfiguration({ ...configuration, diceCount: 8 })?.diceCount).toBe(8);
        expect(parseGameConfiguration({ ...configuration, monstersKilledForVictory: 0 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, monstersKilledForVictory: 21 })).toBeNull();
        expect(
            parseGameConfiguration({
                ...configuration,
                monsters: [configuration.monsters[1], ...configuration.monsters.slice(1)],
            }),
        ).toBeNull();
    });
});
