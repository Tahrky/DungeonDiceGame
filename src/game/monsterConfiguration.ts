import { MONSTERS } from "../data/monsters";
import { isIntegerInRange, isPlainRecord } from "../utils/guards";
import { hasTurnBuff } from "./monsterActions";
import { isStatusEffectColor } from "./statusEffects";
import type {
    AttackPattern,
    Monster,
    MonsterAttack,
    MonsterAttackAnimation,
    StatusEffectDefinition,
} from "../types/GameTypes";

type UnknownRecord = Record<string, unknown>;
// Integer fields carry their [min, max] range; fields without range are booleans.
type OptionalField<T> = readonly [key: keyof T & string, min?: number, max?: number];

const OPTIONAL_ATTACK_FIELDS: readonly OptionalField<MonsterAttack>[] = [
    ["cooldownTurns", 0, 50],
    ["initialCooldownTurns", 0, 50],
    ["usesPerTurn", 1, 10],
    ["hitsAllies"],
    ["targetsAlliesOnly"],
    ["targetsSelf"],
    ["clearsStatusEffects"],
    ["healAmount", 1, 50],
    ["cooldownReduction", 1, 50],
    ["movementRangeBonus", 1, 23],
    ["movementCostReduction", 1, 20],
    ["attackDamageBonus", 1, 50],
    ["attackCostReduction", 1, 20],
    ["movesToZone"],
];

const OPTIONAL_MONSTER_FIELDS: readonly OptionalField<Monster>[] = [
    ["armor", 0, 50],
    ["attackActionsPerTurn", 1, 10],
    ["movementActionsPerTurn", 1, 10],
    ["movementCost", 0, 20],
    ["flying"],
    ["highAltitude"],
    ["canPassHostiles"],
    ["bonusDamageFromBehind", 0, 50],
];

const isCellCount = (value: unknown): value is number => isIntegerInRange(value, 1, 23);

function areOptionalFieldsValid<T>(value: UnknownRecord, fields: readonly OptionalField<T>[]) {
    return fields.every(([key, min, max]) => {
        const field = value[key];
        if (field === undefined) return true;
        return min === undefined || max === undefined
            ? typeof field === "boolean"
            : isIntegerInRange(field, min, max);
    });
}

function pickDefined<T>(value: UnknownRecord, fields: readonly OptionalField<T>[]): Partial<T> {
    const picked: UnknownRecord = {};
    for (const [key] of fields) {
        if (value[key] !== undefined) picked[key] = value[key];
    }
    return picked as Partial<T>;
}

function parseMonsterAttackAnimation(value: unknown): MonsterAttackAnimation | undefined {
    switch (value) {
        case "attack":
        case "backstab":
        case "alternativeAttack1":
        case "alternativeAttack2":
            return value;
        case "attackAoe":
        case "strongAttack":
            return "alternativeAttack1";
        default:
            return undefined;
    }
}

function parseAttackPattern(value: unknown): AttackPattern | null {
    if (!isPlainRecord(value)) return null;

    switch (value.type) {
        case "adjacent":
            return { type: "adjacent" };
        case "line":
            if (
                !isCellCount(value.range) ||
                (value.minRange !== undefined &&
                    !isIntegerInRange(value.minRange, 0, value.range)) ||
                (value.length !== undefined && !isCellCount(value.length)) ||
                (value.allDirections !== undefined && typeof value.allDirections !== "boolean")
            ) {
                return null;
            }
            return {
                type: "line",
                range: value.range,
                ...pickDefined<Extract<AttackPattern, { type: "line" }>>(value, [
                    ["minRange"],
                    ["length"],
                    ["allDirections"],
                ]),
            };
        case "area":
            return isCellCount(value.range) && isCellCount(value.width) && isCellCount(value.depth)
                ? { type: "area", range: value.range, width: value.width, depth: value.depth }
                : null;
        case "directionalArea":
            return isCellCount(value.width) && isCellCount(value.depth)
                ? { type: "directionalArea", width: value.width, depth: value.depth }
                : null;
        case "selfRadius":
        case "radius":
            return isCellCount(value.range) ? { type: value.type, range: value.range } : null;
        case "jumpArea":
            return isCellCount(value.range)
                ? { type: "jumpArea", range: value.range, width: 2, depth: 2 }
                : null;
        default:
            return null;
    }
}

function parseStatusEffect(value: unknown): StatusEffectDefinition | undefined | null {
    if (value === undefined) return undefined;
    if (
        !isPlainRecord(value) ||
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

// Support effects (heal, recharge, turn buff) are exclusive and only target allies.
function hasConsistentSupportEffect(value: UnknownRecord): boolean {
    const hasBuff = hasTurnBuff(value);
    const hasHealOrRecharge =
        value.healAmount !== undefined || value.cooldownReduction !== undefined;
    const hasSupportEffect = hasHealOrRecharge || hasBuff;
    return !(
        (value.targetsSelf === true && value.targetsAlliesOnly !== true) ||
        (value.healAmount !== undefined && value.cooldownReduction !== undefined) ||
        (hasBuff && hasHealOrRecharge) ||
        (hasSupportEffect && (value.damage !== 0 || value.targetsAlliesOnly !== true)) ||
        (value.targetsAlliesOnly === true && !hasSupportEffect)
    );
}

function parseAttack(value: unknown): MonsterAttack | null {
    if (
        !isPlainRecord(value) ||
        typeof value.name !== "string" ||
        value.name.trim().length === 0 ||
        value.name.length > 60 ||
        !isIntegerInRange(value.damage, 0, 50) ||
        !isIntegerInRange(value.cost, 0, 20)
    ) {
        return null;
    }
    const animation = parseMonsterAttackAnimation(value.animation);
    const pattern = parseAttackPattern(value.pattern);
    const statusEffect = parseStatusEffect(value.statusEffect);
    if (
        (value.animation !== undefined && animation === undefined) ||
        !pattern ||
        statusEffect === null ||
        !areOptionalFieldsValid(value, OPTIONAL_ATTACK_FIELDS) ||
        !hasConsistentSupportEffect(value)
    ) {
        return null;
    }

    return {
        name: value.name.trim(),
        damage: value.damage,
        cost: value.cost,
        pattern,
        ...(statusEffect === undefined ? {} : { statusEffect }),
        ...(animation === undefined ? {} : { animation }),
        ...pickDefined(value, OPTIONAL_ATTACK_FIELDS),
    };
}

function parseAttacks(attackValues: readonly unknown[], defaultMonster: Monster | undefined) {
    const attacks: MonsterAttack[] = [];
    for (const [index, attackValue] of attackValues.entries()) {
        const attack = parseAttack(attackValue);
        if (!attack) return null;
        const animation = attack.animation ?? defaultMonster?.attacks[index]?.animation;
        attacks.push(animation ? { ...attack, animation } : attack);
    }
    return attacks;
}

export function parseMonsterConfiguration(value: unknown, expectedId?: string): Monster | null {
    if (
        !isPlainRecord(value) ||
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
        value.attacks.length > 10 ||
        !areOptionalFieldsValid(value, OPTIONAL_MONSTER_FIELDS)
    ) {
        return null;
    }
    const defaultMonster = MONSTERS.find((monster) => monster.id === value.id);
    const attacks = parseAttacks(value.attacks, defaultMonster);
    if (!attacks) return null;

    const {
        armor = defaultMonster?.armor,
        canPassHostiles = defaultMonster?.canPassHostiles,
        bonusDamageFromBehind,
        ...actionFields
    } = pickDefined(value, OPTIONAL_MONSTER_FIELDS);
    return {
        id: value.id,
        name: value.name.trim(),
        symbol: value.symbol,
        color: value.color,
        cost: value.cost,
        hp: value.hp,
        ...(armor === undefined ? {} : { armor }),
        attacks,
        movementRange: value.movementRange,
        ...actionFields,
        ...(canPassHostiles === undefined ? {} : { canPassHostiles }),
        ...(bonusDamageFromBehind === undefined ? {} : { bonusDamageFromBehind }),
    };
}
