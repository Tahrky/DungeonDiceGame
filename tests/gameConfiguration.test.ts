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
        configuration.initialPlayerHealth = 7;
        configuration.maxMonstersPerPlayer = 4;

        expect(
            parseGameConfiguration(JSON.parse(serializeGameConfiguration(configuration))),
        ).toEqual(configuration);
        expect(MONSTERS.find((monster) => monster.id === "frost-mage")?.hp).toBe(5);
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
