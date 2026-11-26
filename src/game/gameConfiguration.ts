import { MONSTERS } from "../data/monsters";
import { GAME_OPTIONS } from "../data/configuration";
import { isIntegerInRange, isPlainRecord } from "../utils/guards";
import { getMinimumDeckSize } from "./decks";
import { parseMonsterConfiguration } from "./monsterConfiguration";
import type { Monster } from "../types/GameTypes";

export const GAME_CONFIGURATION_STORAGE_KEY = "dungeon-dice.configuration";
export const GAME_CONFIGURATION_VERSION = 9;

export interface GameConfiguration {
    version: typeof GAME_CONFIGURATION_VERSION;
    diceCount: number;
    deckSize: number;
    randomBoard: boolean;
    testBoard: boolean;
    initialPlayerHealth: number;
    allowBaseAttackOnSummonTurn: boolean;
    removeInvocationDiceWhenNoMonsters: boolean;
    protectFirstDeployment: boolean;
    maxMonstersPerPlayer: number;
    maxSummonsPerMonster: number;
    monstersKilledForVictory: number;
    monsters: Monster[];
}

type UnknownRecord = Record<string, unknown>;

const MIGRATED_OPTIONS = [
    "deckSize",
    "monstersKilledForVictory",
    "allowBaseAttackOnSummonTurn",
    "removeInvocationDiceWhenNoMonsters",
    "protectFirstDeployment",
    "maxSummonsPerMonster",
] as const;

const LEGACY_PRIEST_HEAL_PATTERN = {
    type: "line",
    range: 4,
    allDirections: true,
    minRange: undefined,
    length: undefined,
};

const LEGACY_PRIEST_BUFFER_ATTACKS = [
    {
        fields: {
            name: "Soin",
            damage: 0,
            cost: 1,
            targetsAlliesOnly: true,
            targetsSelf: true,
            clearsStatusEffects: true,
            healAmount: 3,
            usesPerTurn: 1,
        },
        pattern: { type: "radius", range: 4 },
    },
    {
        fields: {
            name: "Récupération de sorts",
            damage: 0,
            cost: 2,
            animation: "alternativeAttack1",
            targetsAlliesOnly: true,
            targetsSelf: true,
            cooldownReduction: 1,
            usesPerTurn: 1,
        },
        pattern: { type: "radius", range: 3 },
    },
];
const LEGACY_PRIEST_BUFFER_ATTACK_KEY_COUNT = 9;

function cloneMonster(monster: Monster): Monster {
    return {
        ...monster,
        attacks: monster.attacks.map((attack) => ({
            ...attack,
            pattern: { ...attack.pattern },
        })),
    };
}

export function getDefaultGameConfiguration(): GameConfiguration {
    return {
        version: GAME_CONFIGURATION_VERSION,
        diceCount: GAME_OPTIONS.diceCount.default,
        deckSize: Math.max(
            GAME_OPTIONS.deckSize.default,
            getMinimumDeckSize(
                GAME_OPTIONS.maxMonstersPerPlayer.default,
                GAME_OPTIONS.maxSummonsPerMonster.default,
            ),
        ),
        randomBoard: GAME_OPTIONS.randomBoard.default,
        testBoard: GAME_OPTIONS.testBoard.default,
        initialPlayerHealth: GAME_OPTIONS.initialPlayerHealth.default,
        allowBaseAttackOnSummonTurn: GAME_OPTIONS.allowBaseAttackOnSummonTurn.default,
        removeInvocationDiceWhenNoMonsters: GAME_OPTIONS.removeInvocationDiceWhenNoMonsters.default,
        protectFirstDeployment: GAME_OPTIONS.protectFirstDeployment.default,
        maxMonstersPerPlayer: GAME_OPTIONS.maxMonstersPerPlayer.default,
        maxSummonsPerMonster: GAME_OPTIONS.maxSummonsPerMonster.default,
        monstersKilledForVictory: GAME_OPTIONS.monstersKilledForVictory.default,
        monsters: MONSTERS.map(cloneMonster),
    };
}

function hasFields(value: unknown, fields: UnknownRecord): value is UnknownRecord {
    return (
        isPlainRecord(value) &&
        Object.entries(fields).every(([key, expected]) => value[key] === expected)
    );
}

function isLegacyPriestBufferAttacks(attacks: unknown[]): boolean {
    return (
        attacks.length === LEGACY_PRIEST_BUFFER_ATTACKS.length &&
        LEGACY_PRIEST_BUFFER_ATTACKS.every(({ fields, pattern }, index) => {
            const attack = attacks[index];
            return (
                hasFields(attack, fields) &&
                hasFields(attack.pattern, pattern) &&
                Object.keys(attack).length === LEGACY_PRIEST_BUFFER_ATTACK_KEY_COUNT
            );
        })
    );
}

function getDefaultAttacks(monsterId: string) {
    return MONSTERS.find((monster) => monster.id === monsterId)?.attacks;
}

function migratePriestHeal(monsters: unknown[]): unknown[] {
    const defaultHealPattern = getDefaultAttacks("priest")?.find(
        (attack) => attack.name === "Soin",
    )?.pattern;
    return monsters.map((monster) => {
        if (!isPlainRecord(monster) || monster.id !== "priest" || !Array.isArray(monster.attacks)) {
            return monster;
        }
        const [healAttack, ...otherAttacks] = monster.attacks;
        if (
            !hasFields(healAttack, { name: "Soin" }) ||
            !hasFields(healAttack.pattern, LEGACY_PRIEST_HEAL_PATTERN) ||
            !defaultHealPattern
        ) {
            return monster;
        }
        return {
            ...monster,
            attacks: [{ ...healAttack, pattern: { ...defaultHealPattern } }, ...otherAttacks],
        };
    });
}

function migratePriestBuffer(monsters: unknown[]): unknown[] {
    const defaultBuffAttacks = getDefaultAttacks("priestBuffer");
    return monsters.map((monster) =>
        isPlainRecord(monster) &&
        monster.id === "priestBuffer" &&
        Array.isArray(monster.attacks) &&
        isLegacyPriestBufferAttacks(monster.attacks) &&
        defaultBuffAttacks
            ? { ...monster, attacks: defaultBuffAttacks }
            : monster,
    );
}

function migrateGameConfiguration(value: unknown): unknown {
    if (
        !isPlainRecord(value) ||
        !isIntegerInRange(value.version, 1, GAME_CONFIGURATION_VERSION - 1) ||
        !Array.isArray(value.monsters)
    ) {
        return value;
    }

    const monsters = value.version === 1 ? migratePriestHeal(value.monsters) : value.monsters;
    const maxSummonsPerMonster =
        value.maxSummonsPerMonster === undefined
            ? GAME_OPTIONS.maxSummonsPerMonster.default
            : value.maxSummonsPerMonster;
    const deckSize = value.deckSize === undefined ? GAME_OPTIONS.deckSize.default : value.deckSize;
    const migratedDeckSize =
        value.maxSummonsPerMonster === undefined &&
        isOptionInRange(value.maxMonstersPerPlayer, GAME_OPTIONS.maxMonstersPerPlayer) &&
        isOptionInRange(deckSize, GAME_OPTIONS.deckSize)
            ? Math.max(
                  deckSize,
                  getMinimumDeckSize(
                      value.maxMonstersPerPlayer,
                      GAME_OPTIONS.maxSummonsPerMonster.default,
                  ),
              )
            : deckSize;
    return {
        ...value,
        version: GAME_CONFIGURATION_VERSION,
        ...Object.fromEntries(
            MIGRATED_OPTIONS.map((key) => [
                key,
                value[key] === undefined ? GAME_OPTIONS[key].default : value[key],
            ]),
        ),
        deckSize: migratedDeckSize,
        maxSummonsPerMonster,
        monsters: migratePriestBuffer(monsters),
    };
}

function isOptionInRange(
    value: unknown,
    { min, max }: { readonly min: number; readonly max: number },
): value is number {
    return isIntegerInRange(value, min, max);
}

function parseMonsters(values: unknown[]): Monster[] | null {
    if (values.length !== MONSTERS.length) return null;
    const monsters: Monster[] = [];
    for (const [index, value] of values.entries()) {
        const monster = parseMonsterConfiguration(value, MONSTERS[index].id);
        if (!monster) return null;
        monsters.push(monster);
    }
    return new Set(monsters.map(({ id }) => id)).size === MONSTERS.length ? monsters : null;
}

export function parseGameConfiguration(value: unknown): GameConfiguration | null {
    const migrated = migrateGameConfiguration(value);
    if (
        !isPlainRecord(migrated) ||
        migrated.version !== GAME_CONFIGURATION_VERSION ||
        !isOptionInRange(migrated.diceCount, GAME_OPTIONS.diceCount) ||
        !isIntegerInRange(
            migrated.deckSize,
            GAME_OPTIONS.deckSize.min,
            GAME_OPTIONS.deckSize.maxAvailable,
        ) ||
        typeof migrated.randomBoard !== "boolean" ||
        (migrated.testBoard !== undefined && typeof migrated.testBoard !== "boolean") ||
        !isOptionInRange(migrated.initialPlayerHealth, GAME_OPTIONS.initialPlayerHealth) ||
        typeof migrated.allowBaseAttackOnSummonTurn !== "boolean" ||
        typeof migrated.removeInvocationDiceWhenNoMonsters !== "boolean" ||
        typeof migrated.protectFirstDeployment !== "boolean" ||
        !isOptionInRange(migrated.maxMonstersPerPlayer, GAME_OPTIONS.maxMonstersPerPlayer) ||
        !isOptionInRange(migrated.maxSummonsPerMonster, GAME_OPTIONS.maxSummonsPerMonster) ||
        migrated.deckSize <
            getMinimumDeckSize(migrated.maxMonstersPerPlayer, migrated.maxSummonsPerMonster) ||
        !isOptionInRange(
            migrated.monstersKilledForVictory,
            GAME_OPTIONS.monstersKilledForVictory,
        ) ||
        !Array.isArray(migrated.monsters)
    ) {
        return null;
    }
    const monsters = parseMonsters(migrated.monsters);
    if (!monsters) return null;

    return {
        version: GAME_CONFIGURATION_VERSION,
        diceCount: migrated.diceCount,
        deckSize: migrated.deckSize,
        randomBoard: migrated.randomBoard,
        testBoard:
            typeof migrated.testBoard === "boolean"
                ? migrated.testBoard
                : GAME_OPTIONS.testBoard.default,
        initialPlayerHealth: migrated.initialPlayerHealth,
        allowBaseAttackOnSummonTurn: migrated.allowBaseAttackOnSummonTurn,
        removeInvocationDiceWhenNoMonsters: migrated.removeInvocationDiceWhenNoMonsters,
        protectFirstDeployment: migrated.protectFirstDeployment,
        maxMonstersPerPlayer: migrated.maxMonstersPerPlayer,
        maxSummonsPerMonster: migrated.maxSummonsPerMonster,
        monstersKilledForVictory: migrated.monstersKilledForVictory,
        monsters,
    };
}

export function parseSavedMatchConfiguration(value: unknown): GameConfiguration | null {
    if (
        isPlainRecord(value) &&
        typeof value.version === "number" &&
        value.version <= 8 &&
        value.maxSummonsPerMonster === undefined
    ) {
        return parseGameConfiguration({
            ...value,
            maxSummonsPerMonster: value.maxMonstersPerPlayer,
        });
    }
    return parseGameConfiguration(value);
}

export function serializeGameConfiguration(configuration: GameConfiguration): string {
    return JSON.stringify(configuration, null, 2);
}

export function getSavedGameConfiguration(): GameConfiguration {
    const defaults = getDefaultGameConfiguration();
    try {
        const stored = localStorage.getItem(GAME_CONFIGURATION_STORAGE_KEY);
        if (stored === null) return defaults;
        const savedValue: unknown = JSON.parse(stored);
        if (!isPlainRecord(savedValue)) return defaults;
        return parseGameConfiguration({ ...savedValue, monsters: defaults.monsters }) ?? defaults;
    } catch {
        return defaults;
    }
}
