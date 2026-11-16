import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";
import {
    DEFAULT_DECK_SIZE,
    MAX_AVAILABLE_DECK_SIZE,
    getDefaultGameConfiguration,
    MIN_DECK_SIZE,
    parseGameConfiguration,
    parseMonsterConfiguration,
    serializeGameConfiguration,
} from "../src/game/gameConfiguration";

describe("configuration des règles de partie", () => {
    it("sérialise puis valide les réglages et profils par défaut", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.diceCount = 3;
        configuration.deckSize = 3;
        configuration.randomBoard = true;
        configuration.testBoard = true;
        configuration.initialPlayerHealth = 7;
        configuration.maxMonstersPerPlayer = 4;
        configuration.monstersKilledForVictory = 6;

        expect(
            parseGameConfiguration(JSON.parse(serializeGameConfiguration(configuration))),
        ).toEqual(configuration);
        expect(configuration.monsters.find((monster) => monster.id === "ghost")?.canPassHostiles)
            .toBe(true);
        expect(configuration.monsters.find((monster) => monster.id === "spectre")?.canPassHostiles)
            .toBe(true);
        expect(MONSTERS.find((monster) => monster.id === "frost-mage")?.hp).toBe(5);
    });

    it("valide et préserve l'attribut de haute altitude", () => {
        const spectre = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "spectre",
        );
        expect(spectre?.highAltitude).toBe(true);
        expect(parseMonsterConfiguration(spectre, "spectre")?.highAltitude).toBe(true);
        expect(
            parseMonsterConfiguration({ ...spectre, highAltitude: "true" }, "spectre"),
        ).toBeNull();
    });

    it("valide les effets temporaires du Prêtre Buffer", () => {
        const priestBuffer = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "priestBuffer",
        );

        expect(parseMonsterConfiguration(priestBuffer, "priestBuffer")?.attacks).toMatchObject([
            { movementRangeBonus: 1, movementCostReduction: 1 },
            { attackDamageBonus: 1, attackCostReduction: 1 },
        ]);
        expect(
            parseMonsterConfiguration(
                {
                    ...priestBuffer,
                    attacks: [
                        {
                            ...priestBuffer!.attacks[0],
                            movementCostReduction: 0,
                        },
                        priestBuffer!.attacks[1],
                    ],
                },
                "priestBuffer",
            ),
        ).toBeNull();
    });

    it("conserve la capacité de traversée dans les anciennes configurations de monstres", () => {
        const configuration = JSON.parse(
            serializeGameConfiguration(getDefaultGameConfiguration()),
        ) as ReturnType<typeof getDefaultGameConfiguration>;
        for (const monster of configuration.monsters) {
            delete monster.canPassHostiles;
        }

        const parsed = parseGameConfiguration(configuration);

        expect(parsed?.monsters.find((monster) => monster.id === "ghost")?.canPassHostiles).toBe(
            true,
        );
        expect(parsed?.monsters.find((monster) => monster.id === "spectre")?.canPassHostiles).toBe(
            true,
        );
    });

    it("désactive le plateau de test par défaut et accepte les anciennes configurations", () => {
        const configuration = getDefaultGameConfiguration();
        expect(configuration.testBoard).toBe(false);
        expect(configuration.diceCount).toBe(5);
        expect(configuration.deckSize).toBe(DEFAULT_DECK_SIZE);
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
        delete legacyConfiguration.deckSize;

        const migrated = parseGameConfiguration(legacyConfiguration);

        expect(migrated?.version).toBe(5);
        expect(migrated?.deckSize).toBe(DEFAULT_DECK_SIZE);
        expect(migrated?.diceCount).toBe(3);
        expect(migrated?.monstersKilledForVictory).toBe(8);
        expect(migrated?.monsters.find((monster) => monster.id === "priest")?.attacks[0].pattern)
            .toEqual({ type: "radius", range: 4 });
    });

    it("migre les capacités par défaut enregistrées du Prêtre Buffer", () => {
        const configuration = getDefaultGameConfiguration();
        const priestBuffer = configuration.monsters.find(
            (monster) => monster.id === "priestBuffer",
        );
        expect(priestBuffer).toBeDefined();
        priestBuffer!.attacks = [
            {
                name: "Soin",
                damage: 0,
                cost: 1,
                pattern: { type: "radius", range: 4 },
                targetsAlliesOnly: true,
                targetsSelf: true,
                clearsStatusEffects: true,
                healAmount: 3,
                usesPerTurn: 1,
            },
            {
                name: "Récupération de sorts",
                damage: 0,
                cost: 2,
                pattern: { type: "radius", range: 3 },
                animation: "alternativeAttack1",
                targetsAlliesOnly: true,
                targetsSelf: true,
                cooldownReduction: 1,
                usesPerTurn: 1,
            },
        ];
        const legacyConfiguration: Record<string, unknown> = JSON.parse(
            serializeGameConfiguration(configuration),
        );
        legacyConfiguration.version = 4;

        const migrated = parseGameConfiguration(legacyConfiguration);

        expect(migrated?.version).toBe(5);
        expect(migrated?.monsters.find((monster) => monster.id === "priestBuffer")?.attacks).toMatchObject([
            { name: "Foulée bénie", movementRangeBonus: 1, movementCostReduction: 1 },
            { name: "Force sacrée", attackDamageBonus: 1, attackCostReduction: 1 },
        ]);
    });

    it("migre les réglages v2 en ajoutant la condition de victoire par défaut", () => {
        const legacyConfiguration: Record<string, unknown> = JSON.parse(
            serializeGameConfiguration(getDefaultGameConfiguration()),
        );
        legacyConfiguration.version = 2;
        delete legacyConfiguration.monstersKilledForVictory;
        delete legacyConfiguration.deckSize;

        expect(parseGameConfiguration(legacyConfiguration)).toMatchObject({
            version: 5,
            deckSize: DEFAULT_DECK_SIZE,
            monstersKilledForVictory: 8,
        });
    });

    it("migre les réglages v3 en ajoutant la taille de deck par défaut", () => {
        const legacyConfiguration: Record<string, unknown> = JSON.parse(
            serializeGameConfiguration(getDefaultGameConfiguration()),
        );
        legacyConfiguration.version = 3;
        delete legacyConfiguration.deckSize;

        expect(parseGameConfiguration(legacyConfiguration)).toMatchObject({
            version: 5,
            deckSize: DEFAULT_DECK_SIZE,
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
        expect(priest?.attacks[0].targetsSelf).toBe(true);
        expect(priest?.attacks[1].targetsSelf).toBe(true);
        expect(priest?.attacks[0].clearsStatusEffects).toBe(true);
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [{ ...priest!.attacks[0], targetsAlliesOnly: false }, priest!.attacks[1]],
            }),
        ).toBeNull();
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [{ ...priest!.attacks[0], targetsSelf: "true" }, priest!.attacks[1]],
            }),
        ).toBeNull();
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [
                    { ...priest!.attacks[0], clearsStatusEffects: "true" },
                    priest!.attacks[1],
                ],
            }),
        ).toBeNull();
        expect(
            parseMonsterConfiguration({
                ...priest,
                attacks: [{ ...priest!.attacks[0], usesPerTurn: 0 }, priest!.attacks[1]],
            }),
        ).toBeNull();
    });

    it("préserve la durée et la couleur des effets de dégâts périodiques", () => {
        const configuration = getDefaultGameConfiguration();
        const poisonAttack = configuration.monsters.find((monster) => monster.id === "swamp-thing")
            ?.attacks[0];

        expect(poisonAttack).toMatchObject({
            damage: 0,
            statusEffect: {
                type: "damageOverTime",
                damagePerTurn: 2,
                duration: "untilDeath",
                color: "green",
            },
        });
        expect(
            parseGameConfiguration(
                JSON.parse(serializeGameConfiguration(configuration)),
            )?.monsters.find((monster) => monster.id === "swamp-thing")?.attacks[0].statusEffect
                ?.duration,
        ).toBe("untilDeath");

        for (const color of ["green", "red", "blue", "yellow", "white", "violet", "gray"]) {
            const parsed = parseMonsterConfiguration(
                {
                    ...configuration.monsters.find((monster) => monster.id === "swamp-thing")!,
                    attacks: [
                        {
                            ...poisonAttack!,
                            statusEffect: { ...poisonAttack!.statusEffect!, color },
                        },
                    ],
                },
                "swamp-thing",
            );
            expect(parsed?.attacks[0].statusEffect?.color).toBe(color);
        }

        expect(
            parseMonsterConfiguration(
                {
                    ...configuration.monsters.find((monster) => monster.id === "swamp-thing")!,
                    attacks: [
                        {
                            ...poisonAttack!,
                            statusEffect: { ...poisonAttack!.statusEffect!, duration: 0 },
                        },
                    ],
                },
                "swamp-thing",
            ),
        ).toBeNull();
        expect(
            parseMonsterConfiguration(
                {
                    ...configuration.monsters.find((monster) => monster.id === "swamp-thing")!,
                    attacks: [
                        {
                            ...poisonAttack!,
                            statusEffect: { ...poisonAttack!.statusEffect!, color: 0x00ff00 },
                        },
                    ],
                },
                "swamp-thing",
            ),
        ).toBeNull();
    });

    it("refuse les configurations de version ou de limites invalides", () => {
        const configuration = getDefaultGameConfiguration();
        expect(parseGameConfiguration({ ...configuration, version: 6 })).toBeNull();
        expect(parseGameConfiguration({ ...configuration, deckSize: MIN_DECK_SIZE - 1 })).toBeNull();
        expect(
            parseGameConfiguration({ ...configuration, deckSize: MAX_AVAILABLE_DECK_SIZE + 1 }),
        ).toBeNull();
        expect(parseGameConfiguration({ ...configuration, deckSize: MIN_DECK_SIZE })?.deckSize).toBe(
            MIN_DECK_SIZE,
        );
        expect(
            parseGameConfiguration({
                ...configuration,
                deckSize: MAX_AVAILABLE_DECK_SIZE,
            })?.deckSize,
        ).toBe(MAX_AVAILABLE_DECK_SIZE);
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
