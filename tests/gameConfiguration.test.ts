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

        expect(
            parseGameConfiguration(JSON.parse(serializeGameConfiguration(configuration))),
        ).toEqual(configuration);
        expect(MONSTERS.find((monster) => monster.id === "frost-mage")?.hp).toBe(5);
    });

    it("désactive le plateau de test par défaut et accepte les anciennes configurations", () => {
        const configuration = getDefaultGameConfiguration();
        expect(configuration.testBoard).toBe(false);

        const legacyConfiguration = JSON.parse(serializeGameConfiguration(configuration));
        delete legacyConfiguration.testBoard;
        expect(parseGameConfiguration(legacyConfiguration)?.testBoard).toBe(false);
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
        expect(parseGameConfiguration({ ...configuration, version: 2 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, diceCount: 6 })).toBeNull();
        expect(
            parseGameConfiguration({
                ...configuration,
                monsters: [configuration.monsters[1], ...configuration.monsters.slice(1)],
            }),
        ).toBeNull();
    });
});
