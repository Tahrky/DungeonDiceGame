import { MONSTERS } from "../data/monsters";
import { DICE } from "../data/dice";
import { MAX_MONSTERS_PER_PLAYER } from "./matchRules";
import type { AttackPattern, Monster, MonsterAttack } from "../types/GameTypes";

export const GAME_CONFIGURATION_STORAGE_KEY = "dungeon-dice.configuration";
export const GAME_CONFIGURATION_VERSION = 1;
export const MAX_DICE_COUNT = DICE.length;

export interface GameConfiguration {
    version: typeof GAME_CONFIGURATION_VERSION;
    diceCount: number;
    randomBoard: boolean;
    initialPlayerHealth: number;
    maxMonstersPerPlayer: number;
    monsters: Monster[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
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
        diceCount: MAX_DICE_COUNT,
        randomBoard: false,
        initialPlayerHealth: 3,
        maxMonstersPerPlayer: MAX_MONSTERS_PER_PLAYER,
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
    const pattern = parseAttackPattern(value.pattern);
    if (
        !pattern ||
        (value.cooldownTurns !== undefined && !isIntegerInRange(value.cooldownTurns, 0, 50)) ||
        (value.hitsAllies !== undefined && typeof value.hitsAllies !== "boolean") ||
        (value.movesToZone !== undefined && typeof value.movesToZone !== "boolean")
    ) {
        return null;
    }

    const cooldownTurns = typeof value.cooldownTurns === "number" ? value.cooldownTurns : undefined;
    const hitsAllies = typeof value.hitsAllies === "boolean" ? value.hitsAllies : undefined;
    const movesToZone = typeof value.movesToZone === "boolean" ? value.movesToZone : undefined;
    return {
        name: value.name.trim(),
        damage: value.damage,
        cost: value.cost,
        pattern,
        ...(cooldownTurns === undefined ? {} : { cooldownTurns }),
        ...(hitsAllies === undefined ? {} : { hitsAllies }),
        ...(movesToZone === undefined ? {} : { movesToZone }),
    };
}

export function parseMonsterConfiguration(value: unknown, expectedId?: string): Monster | null {
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

    const parsedAttacks = value.attacks.map(parseAttack);
    if (
        parsedAttacks.some((attack) => attack === null) ||
        (value.attackActionsPerTurn !== undefined &&
            !isIntegerInRange(value.attackActionsPerTurn, 1, 10)) ||
        (value.movementActionsPerTurn !== undefined &&
            !isIntegerInRange(value.movementActionsPerTurn, 1, 10)) ||
        (value.movementCost !== undefined && !isIntegerInRange(value.movementCost, 0, 20)) ||
        (value.flying !== undefined && typeof value.flying !== "boolean") ||
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
        ...(bonusDamageFromBehind === undefined ? {} : { bonusDamageFromBehind }),
    };
}

export function parseGameConfiguration(value: unknown): GameConfiguration | null {
    if (
        !isRecord(value) ||
        value.version !== GAME_CONFIGURATION_VERSION ||
        !isIntegerInRange(value.diceCount, 1, MAX_DICE_COUNT) ||
        typeof value.randomBoard !== "boolean" ||
        !isIntegerInRange(value.initialPlayerHealth, 1, 20) ||
        !isIntegerInRange(value.maxMonstersPerPlayer, 1, 20) ||
        !Array.isArray(value.monsters) ||
        value.monsters.length !== MONSTERS.length
    ) {
        return null;
    }

    const parsedMonsters = value.monsters.map((monster, index) =>
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
        diceCount: value.diceCount,
        randomBoard: value.randomBoard,
        initialPlayerHealth: value.initialPlayerHealth,
        maxMonstersPerPlayer: value.maxMonstersPerPlayer,
        monsters,
    };
}

export function serializeGameConfiguration(configuration: GameConfiguration): string {
    return JSON.stringify(configuration, null, 2);
}

export function getSavedGameConfiguration(): GameConfiguration {
    try {
        const stored = localStorage.getItem(GAME_CONFIGURATION_STORAGE_KEY);
        if (stored === null) return getDefaultGameConfiguration();
        return parseGameConfiguration(JSON.parse(stored)) ?? getDefaultGameConfiguration();
    } catch {
        return getDefaultGameConfiguration();
    }
}
