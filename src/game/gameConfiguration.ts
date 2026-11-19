import { MONSTERS } from "../data/monsters";
import { DICE } from "../data/dice";
import { isStatusEffectColor } from "./statusEffects";
import type {
    AttackPattern,
    Monster,
    MonsterAttack,
    MonsterAttackAnimation,
    StatusEffectDefinition,
} from "../types/GameTypes";

export const GAME_OPTIONS = {
    diceCount: { default: 5, min: 2, max: DICE.length },
    deckSize: {
        default: 5,
        min: 3,
        max: 15,
        maxAvailable: Math.min(15, MONSTERS.length),
    },
    randomBoard: { default: false },
    testBoard: { default: false },
    initialPlayerHealth: { default: 6, min: 1, max: 20 },
    allowBaseAttackOnSummonTurn: { default: false },
    maxMonstersPerPlayer: { default: 8, min: 1, max: 20 },
    monstersKilledForVictory: { default: 6, min: 1, max: 20 },
} as const;

export const GAME_CONFIGURATION_STORAGE_KEY = "dungeon-dice.configuration";
export const GAME_CONFIGURATION_VERSION = 6;
export const MIN_DICE_COUNT: number = GAME_OPTIONS.diceCount.min;
export const MAX_DICE_COUNT: number = GAME_OPTIONS.diceCount.max;
export const DEFAULT_DICE_COUNT: number = GAME_OPTIONS.diceCount.default;
export const MIN_DECK_SIZE: number = GAME_OPTIONS.deckSize.min;
export const MAX_DECK_SIZE: number = GAME_OPTIONS.deckSize.max;
export const DEFAULT_DECK_SIZE: number = GAME_OPTIONS.deckSize.default;
export const MAX_AVAILABLE_DECK_SIZE: number = GAME_OPTIONS.deckSize.maxAvailable;
export const DEFAULT_PLAYER_LIFE: number = GAME_OPTIONS.initialPlayerHealth.default;
export const MIN_PLAYER_HEALTH: number = GAME_OPTIONS.initialPlayerHealth.min;
export const MAX_PLAYER_HEALTH: number = GAME_OPTIONS.initialPlayerHealth.max;
export const DEFAULT_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.default;
export const MIN_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.min;
export const MAX_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.max;
export const DEFAULT_MONSTERS_KILLED_FOR_VICTORY: number =
    GAME_OPTIONS.monstersKilledForVictory.default;
export const MIN_MONSTERS_KILLED_FOR_VICTORY: number = GAME_OPTIONS.monstersKilledForVictory.min;
export const MAX_MONSTERS_KILLED_FOR_VICTORY: number = GAME_OPTIONS.monstersKilledForVictory.max;

export interface GameConfiguration {
    version: typeof GAME_CONFIGURATION_VERSION;
    diceCount: number;
    deckSize: number;
    randomBoard: boolean;
    testBoard: boolean;
    initialPlayerHealth: number;
    allowBaseAttackOnSummonTurn: boolean;
    maxMonstersPerPlayer: number;
    monstersKilledForVictory: number;
    monsters: Monster[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function parseMonsterAttackAnimation(value: unknown): MonsterAttackAnimation | undefined {
    switch (value) {
        case "attack":
        case "backstab":
        case "alternativeAttack1":
            return value;
        case "attackAoe":
        case "strongAttack":
            return "alternativeAttack1";
        default:
            return undefined;
    }
}

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
        deckSize: GAME_OPTIONS.deckSize.default,
        randomBoard: GAME_OPTIONS.randomBoard.default,
        testBoard: GAME_OPTIONS.testBoard.default,
        initialPlayerHealth: GAME_OPTIONS.initialPlayerHealth.default,
        allowBaseAttackOnSummonTurn: GAME_OPTIONS.allowBaseAttackOnSummonTurn.default,
        maxMonstersPerPlayer: GAME_OPTIONS.maxMonstersPerPlayer.default,
        monstersKilledForVictory: GAME_OPTIONS.monstersKilledForVictory.default,
        monsters: MONSTERS.map(cloneMonster),
    };
}

function parseAttackPattern(value: unknown): AttackPattern | null {
    if (!isRecord(value) || typeof value.type !== "string") return null;

    switch (value.type) {
        case "adjacent":
            return { type: "adjacent" };
        case "line": {
            if (
                !isIntegerInRange(value.range, 1, 23) ||
                (value.minRange !== undefined &&
                    !isIntegerInRange(value.minRange, 0, value.range)) ||
                (value.length !== undefined && !isIntegerInRange(value.length, 1, 23)) ||
                (value.allDirections !== undefined && typeof value.allDirections !== "boolean")
            ) {
                return null;
            }
            const minRange = typeof value.minRange === "number" ? value.minRange : undefined;
            const length = typeof value.length === "number" ? value.length : undefined;
            const allDirections =
                typeof value.allDirections === "boolean" ? value.allDirections : undefined;
            return {
                type: "line",
                range: value.range,
                ...(minRange === undefined ? {} : { minRange }),
                ...(length === undefined ? {} : { length }),
                ...(allDirections === undefined ? {} : { allDirections }),
            };
        }
        case "area":
            if (
                !isIntegerInRange(value.range, 1, 23) ||
                !isIntegerInRange(value.width, 1, 23) ||
                !isIntegerInRange(value.depth, 1, 23)
            ) {
                return null;
            }
            return { type: "area", range: value.range, width: value.width, depth: value.depth };
        case "directionalArea":
            if (!isIntegerInRange(value.width, 1, 23) || !isIntegerInRange(value.depth, 1, 23)) {
                return null;
            }
            return { type: "directionalArea", width: value.width, depth: value.depth };
        case "selfRadius":
        case "radius":
            return isIntegerInRange(value.range, 1, 23)
                ? { type: value.type, range: value.range }
                : null;
        case "jumpArea":
            return isIntegerInRange(value.range, 1, 23)
                ? { type: "jumpArea", range: value.range, width: 2, depth: 2 }
                : null;
        default:
            return null;
    }
}

function parseStatusEffect(value: unknown): StatusEffectDefinition | undefined | null {
    if (value === undefined) return undefined;
    if (
        !isRecord(value) ||
        value.type !== "damageOverTime" ||
        !isIntegerInRange(value.damagePerTurn, 1, 50) ||
        (value.duration !== "untilDeath" && !isIntegerInRange(value.duration, 1, 50)) ||
        !isStatusEffectColor(value.color)
    ) {
        return null;
    }

    return {
        type: "damageOverTime",
        damagePerTurn: value.damagePerTurn,
        duration: value.duration,
        color: value.color,
    };
}

function parseAttack(value: unknown): MonsterAttack | null {
    if (
        !isRecord(value) ||
        typeof value.name !== "string" ||
        value.name.trim().length === 0 ||
        value.name.length > 60 ||
        !isIntegerInRange(value.damage, 0, 50) ||
        !isIntegerInRange(value.cost, 0, 20)
    ) {
        return null;
    }
    const animation =
        value.animation === undefined ? undefined : parseMonsterAttackAnimation(value.animation);
    if (value.animation !== undefined && animation === undefined) return null;
    const pattern = parseAttackPattern(value.pattern);
    const statusEffect = parseStatusEffect(value.statusEffect);
    const hasTurnBuff =
        value.movementRangeBonus !== undefined ||
        value.movementCostReduction !== undefined ||
        value.attackDamageBonus !== undefined ||
        value.attackCostReduction !== undefined;
    const hasAllyEffect =
        value.healAmount !== undefined || value.cooldownReduction !== undefined || hasTurnBuff;
    if (
        !pattern ||
        statusEffect === null ||
        (value.cooldownTurns !== undefined && !isIntegerInRange(value.cooldownTurns, 0, 50)) ||
        (value.initialCooldownTurns !== undefined &&
            !isIntegerInRange(value.initialCooldownTurns, 0, 50)) ||
        (value.usesPerTurn !== undefined && !isIntegerInRange(value.usesPerTurn, 1, 10)) ||
        (value.hitsAllies !== undefined && typeof value.hitsAllies !== "boolean") ||
        (value.targetsAlliesOnly !== undefined && typeof value.targetsAlliesOnly !== "boolean") ||
        (value.targetsSelf !== undefined && typeof value.targetsSelf !== "boolean") ||
        (value.targetsSelf === true && value.targetsAlliesOnly !== true) ||
        (value.clearsStatusEffects !== undefined &&
            typeof value.clearsStatusEffects !== "boolean") ||
        (value.healAmount !== undefined && !isIntegerInRange(value.healAmount, 1, 50)) ||
        (value.cooldownReduction !== undefined &&
            !isIntegerInRange(value.cooldownReduction, 1, 50)) ||
        (value.healAmount !== undefined && value.cooldownReduction !== undefined) ||
        (value.movementRangeBonus !== undefined &&
            !isIntegerInRange(value.movementRangeBonus, 1, 23)) ||
        (value.movementCostReduction !== undefined &&
            !isIntegerInRange(value.movementCostReduction, 1, 20)) ||
        (value.attackDamageBonus !== undefined &&
            !isIntegerInRange(value.attackDamageBonus, 1, 50)) ||
        (value.attackCostReduction !== undefined &&
            !isIntegerInRange(value.attackCostReduction, 1, 20)) ||
        (hasTurnBuff &&
            (value.healAmount !== undefined || value.cooldownReduction !== undefined)) ||
        (hasAllyEffect && (value.damage !== 0 || value.targetsAlliesOnly !== true)) ||
        (value.targetsAlliesOnly === true && !hasAllyEffect) ||
        (value.movesToZone !== undefined && typeof value.movesToZone !== "boolean")
    ) {
        return null;
    }

    const cooldownTurns = typeof value.cooldownTurns === "number" ? value.cooldownTurns : undefined;
    const initialCooldownTurns =
        typeof value.initialCooldownTurns === "number" ? value.initialCooldownTurns : undefined;
    const usesPerTurn = typeof value.usesPerTurn === "number" ? value.usesPerTurn : undefined;
    const hitsAllies = typeof value.hitsAllies === "boolean" ? value.hitsAllies : undefined;
    const targetsAlliesOnly =
        typeof value.targetsAlliesOnly === "boolean" ? value.targetsAlliesOnly : undefined;
    const targetsSelf = typeof value.targetsSelf === "boolean" ? value.targetsSelf : undefined;
    const clearsStatusEffects =
        typeof value.clearsStatusEffects === "boolean" ? value.clearsStatusEffects : undefined;
    const healAmount = typeof value.healAmount === "number" ? value.healAmount : undefined;
    const cooldownReduction =
        typeof value.cooldownReduction === "number" ? value.cooldownReduction : undefined;
    const movementRangeBonus =
        typeof value.movementRangeBonus === "number" ? value.movementRangeBonus : undefined;
    const movementCostReduction =
        typeof value.movementCostReduction === "number" ? value.movementCostReduction : undefined;
    const attackDamageBonus =
        typeof value.attackDamageBonus === "number" ? value.attackDamageBonus : undefined;
    const attackCostReduction =
        typeof value.attackCostReduction === "number" ? value.attackCostReduction : undefined;
    const movesToZone = typeof value.movesToZone === "boolean" ? value.movesToZone : undefined;
    return {
        name: value.name.trim(),
        damage: value.damage,
        cost: value.cost,
        pattern,
        ...(statusEffect === undefined ? {} : { statusEffect }),
        ...(animation === undefined ? {} : { animation }),
        ...(cooldownTurns === undefined ? {} : { cooldownTurns }),
        ...(initialCooldownTurns === undefined ? {} : { initialCooldownTurns }),
        ...(usesPerTurn === undefined ? {} : { usesPerTurn }),
        ...(hitsAllies === undefined ? {} : { hitsAllies }),
        ...(targetsAlliesOnly === undefined ? {} : { targetsAlliesOnly }),
        ...(targetsSelf === undefined ? {} : { targetsSelf }),
        ...(clearsStatusEffects === undefined ? {} : { clearsStatusEffects }),
        ...(healAmount === undefined ? {} : { healAmount }),
        ...(cooldownReduction === undefined ? {} : { cooldownReduction }),
        ...(movementRangeBonus === undefined ? {} : { movementRangeBonus }),
        ...(movementCostReduction === undefined ? {} : { movementCostReduction }),
        ...(attackDamageBonus === undefined ? {} : { attackDamageBonus }),
        ...(attackCostReduction === undefined ? {} : { attackCostReduction }),
        ...(movesToZone === undefined ? {} : { movesToZone }),
    };
}

function migrateGameConfiguration(value: unknown): unknown {
    if (
        !isRecord(value) ||
        (value.version !== 1 &&
            value.version !== 2 &&
            value.version !== 3 &&
            value.version !== 4 &&
            value.version !== 5) ||
        !Array.isArray(value.monsters)
    ) {
        return value;
    }

    let monsters = value.monsters;
    if (value.version === 1) {
        const defaultHealPattern = MONSTERS.find(
            (monster) => monster.id === "priest",
        )?.attacks.find((attack) => attack.name === "Soin")?.pattern;
        monsters = value.monsters.map((monster) => {
            if (!isRecord(monster) || monster.id !== "priest" || !Array.isArray(monster.attacks)) {
                return monster;
            }

            const [healAttack, ...otherAttacks] = monster.attacks;
            if (
                !isRecord(healAttack) ||
                healAttack.name !== "Soin" ||
                !isRecord(healAttack.pattern) ||
                healAttack.pattern.type !== "line" ||
                healAttack.pattern.range !== 4 ||
                healAttack.pattern.allDirections !== true ||
                healAttack.pattern.minRange !== undefined ||
                healAttack.pattern.length !== undefined ||
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
    const defaultBuffAttacks = MONSTERS.find((monster) => monster.id === "priestBuffer")?.attacks;
    monsters = monsters.map((monster) => {
        if (
            !isRecord(monster) ||
            monster.id !== "priestBuffer" ||
            !Array.isArray(monster.attacks) ||
            !isLegacyPriestBufferAttacks(monster.attacks) ||
            !defaultBuffAttacks
        ) {
            return monster;
        }

        return { ...monster, attacks: defaultBuffAttacks };
    });

    return {
        ...value,
        version: GAME_CONFIGURATION_VERSION,
        deckSize: value.deckSize === undefined ? GAME_OPTIONS.deckSize.default : value.deckSize,
        monstersKilledForVictory:
            value.monstersKilledForVictory === undefined
                ? GAME_OPTIONS.monstersKilledForVictory.default
                : value.monstersKilledForVictory,
        allowBaseAttackOnSummonTurn:
            value.allowBaseAttackOnSummonTurn === undefined
                ? GAME_OPTIONS.allowBaseAttackOnSummonTurn.default
                : value.allowBaseAttackOnSummonTurn,
        monsters,
    };
}

function isLegacyPriestBufferAttacks(attacks: unknown[]): boolean {
    if (attacks.length !== 2) return false;
    const [heal, cooldown] = attacks;
    return (
        isRecord(heal) &&
        heal.name === "Soin" &&
        heal.damage === 0 &&
        heal.cost === 1 &&
        isRecord(heal.pattern) &&
        heal.pattern.type === "radius" &&
        heal.pattern.range === 4 &&
        heal.targetsAlliesOnly === true &&
        heal.targetsSelf === true &&
        heal.clearsStatusEffects === true &&
        heal.healAmount === 3 &&
        heal.usesPerTurn === 1 &&
        Object.keys(heal).length === 9 &&
        isRecord(cooldown) &&
        cooldown.name === "Récupération de sorts" &&
        cooldown.damage === 0 &&
        cooldown.cost === 2 &&
        isRecord(cooldown.pattern) &&
        cooldown.pattern.type === "radius" &&
        cooldown.pattern.range === 3 &&
        cooldown.animation === "alternativeAttack1" &&
        cooldown.targetsAlliesOnly === true &&
        cooldown.targetsSelf === true &&
        cooldown.cooldownReduction === 1 &&
        cooldown.usesPerTurn === 1 &&
        Object.keys(cooldown).length === 9
    );
}

export function parseMonsterConfiguration(value: unknown, expectedId?: string): Monster | null {
    const defaultMonster =
        isRecord(value) && typeof value.id === "string"
            ? MONSTERS.find((monster) => monster.id === value.id)
            : undefined;
    if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        (expectedId !== undefined && value.id !== expectedId) ||
        typeof value.name !== "string" ||
        value.name.trim().length === 0 ||
        value.name.length > 60 ||
        typeof value.symbol !== "string" ||
        value.symbol.length === 0 ||
        value.symbol.length > 4 ||
        !isIntegerInRange(value.color, 0, 0xffffff) ||
        !isIntegerInRange(value.cost, 0, 20) ||
        !isIntegerInRange(value.hp, 1, 50) ||
        !isIntegerInRange(value.movementRange, 0, 23) ||
        !Array.isArray(value.attacks) ||
        value.attacks.length === 0 ||
        value.attacks.length > 10
    ) {
        return null;
    }

    const defaultAttacks = MONSTERS.find((monster) => monster.id === value.id)?.attacks ?? [];
    const parsedAttacks = value.attacks.map((attackValue, index) => {
        const attack = parseAttack(attackValue);
        const animation = attack?.animation ?? defaultAttacks[index]?.animation;
        return attack && animation ? { ...attack, animation } : attack;
    });
    if (
        parsedAttacks.some((attack) => attack === null) ||
        (value.attackActionsPerTurn !== undefined &&
            !isIntegerInRange(value.attackActionsPerTurn, 1, 10)) ||
        (value.movementActionsPerTurn !== undefined &&
            !isIntegerInRange(value.movementActionsPerTurn, 1, 10)) ||
        (value.movementCost !== undefined && !isIntegerInRange(value.movementCost, 0, 20)) ||
        (value.flying !== undefined && typeof value.flying !== "boolean") ||
        (value.highAltitude !== undefined && typeof value.highAltitude !== "boolean") ||
        (value.canPassHostiles !== undefined && typeof value.canPassHostiles !== "boolean") ||
        (value.bonusDamageFromBehind !== undefined &&
            !isIntegerInRange(value.bonusDamageFromBehind, 0, 50))
    ) {
        return null;
    }
    const attacks = parsedAttacks.filter((attack): attack is MonsterAttack => attack !== null);
    const attackActionsPerTurn =
        typeof value.attackActionsPerTurn === "number" ? value.attackActionsPerTurn : undefined;
    const movementActionsPerTurn =
        typeof value.movementActionsPerTurn === "number" ? value.movementActionsPerTurn : undefined;
    const movementCost = typeof value.movementCost === "number" ? value.movementCost : undefined;
    const flying = typeof value.flying === "boolean" ? value.flying : undefined;
    const highAltitude = typeof value.highAltitude === "boolean" ? value.highAltitude : undefined;
    const canPassHostiles =
        typeof value.canPassHostiles === "boolean"
            ? value.canPassHostiles
            : defaultMonster?.canPassHostiles;
    const bonusDamageFromBehind =
        typeof value.bonusDamageFromBehind === "number" ? value.bonusDamageFromBehind : undefined;

    return {
        id: value.id,
        name: value.name.trim(),
        symbol: value.symbol,
        color: value.color,
        cost: value.cost,
        hp: value.hp,
        attacks,
        movementRange: value.movementRange,
        ...(attackActionsPerTurn === undefined ? {} : { attackActionsPerTurn }),
        ...(movementActionsPerTurn === undefined ? {} : { movementActionsPerTurn }),
        ...(movementCost === undefined ? {} : { movementCost }),
        ...(flying === undefined ? {} : { flying }),
        ...(highAltitude === undefined ? {} : { highAltitude }),
        ...(canPassHostiles === undefined ? {} : { canPassHostiles }),
        ...(bonusDamageFromBehind === undefined ? {} : { bonusDamageFromBehind }),
    };
}

export function parseGameConfiguration(value: unknown): GameConfiguration | null {
    const migratedValue = migrateGameConfiguration(value);
    if (
        !isRecord(migratedValue) ||
        migratedValue.version !== GAME_CONFIGURATION_VERSION ||
        !isIntegerInRange(
            migratedValue.diceCount,
            GAME_OPTIONS.diceCount.min,
            GAME_OPTIONS.diceCount.max,
        ) ||
        !isIntegerInRange(
            migratedValue.deckSize,
            GAME_OPTIONS.deckSize.min,
            GAME_OPTIONS.deckSize.maxAvailable,
        ) ||
        typeof migratedValue.randomBoard !== "boolean" ||
        (migratedValue.testBoard !== undefined && typeof migratedValue.testBoard !== "boolean") ||
        !isIntegerInRange(
            migratedValue.initialPlayerHealth,
            GAME_OPTIONS.initialPlayerHealth.min,
            GAME_OPTIONS.initialPlayerHealth.max,
        ) ||
        typeof migratedValue.allowBaseAttackOnSummonTurn !== "boolean" ||
        !isIntegerInRange(
            migratedValue.maxMonstersPerPlayer,
            GAME_OPTIONS.maxMonstersPerPlayer.min,
            GAME_OPTIONS.maxMonstersPerPlayer.max,
        ) ||
        !isIntegerInRange(
            migratedValue.monstersKilledForVictory,
            GAME_OPTIONS.monstersKilledForVictory.min,
            GAME_OPTIONS.monstersKilledForVictory.max,
        ) ||
        !Array.isArray(migratedValue.monsters) ||
        migratedValue.monsters.length !== MONSTERS.length
    ) {
        return null;
    }

    const parsedMonsters = migratedValue.monsters.map((monster, index) =>
        parseMonsterConfiguration(monster, MONSTERS[index].id),
    );
    if (
        parsedMonsters.some((monster) => monster === null) ||
        new Set(parsedMonsters.map((monster) => monster?.id)).size !== MONSTERS.length
    ) {
        return null;
    }
    const monsters = parsedMonsters.filter((monster): monster is Monster => monster !== null);

    return {
        version: GAME_CONFIGURATION_VERSION,
        diceCount: migratedValue.diceCount,
        deckSize: migratedValue.deckSize,
        randomBoard: migratedValue.randomBoard,
        testBoard:
            typeof migratedValue.testBoard === "boolean"
                ? migratedValue.testBoard
                : GAME_OPTIONS.testBoard.default,
        initialPlayerHealth: migratedValue.initialPlayerHealth,
        allowBaseAttackOnSummonTurn: migratedValue.allowBaseAttackOnSummonTurn,
        maxMonstersPerPlayer: migratedValue.maxMonstersPerPlayer,
        monstersKilledForVictory: migratedValue.monstersKilledForVictory,
        monsters,
    };
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
        if (!isRecord(savedValue)) return defaults;
        return parseGameConfiguration({ ...savedValue, monsters: defaults.monsters }) ?? defaults;
    } catch {
        return defaults;
    }
}
