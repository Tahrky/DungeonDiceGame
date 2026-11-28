import type { MonsterAttack } from "../../types/GameTypes";
import { MONSTER_BALANCE_OPTIONS as OPTIONS } from "../../data/configuration";

type SupportKey =
    | "healAmount"
    | "clearsStatusEffects"
    | "attackDamageBonus"
    | "attackCostReduction"
    | "movementRangeBonus"
    | "movementCostReduction"
    | "cooldownReduction";

interface SupportEffect {
    key: SupportKey;
    value: number;
    buffedUses: number;
    passive: boolean;
}

const SUPPORT_EFFECTS: readonly SupportEffect[] = [
    { key: "healAmount", value: OPTIONS.healEffectiveness, buffedUses: 1, passive: true },
    { key: "clearsStatusEffects", value: OPTIONS.cleanseValue, buffedUses: 1, passive: true },
    {
        key: "attackDamageBonus",
        value: OPTIONS.attackDamageBuffValue,
        buffedUses: OPTIONS.buffedAttacksPerTarget,
        passive: true,
    },
    {
        key: "attackCostReduction",
        value: OPTIONS.attackCostReductionValue,
        buffedUses: OPTIONS.buffedAttacksPerTarget,
        passive: false,
    },
    {
        key: "movementRangeBonus",
        value: OPTIONS.movementRangeBonusValue,
        buffedUses: OPTIONS.buffedMovesPerTarget,
        passive: true,
    },
    {
        key: "movementCostReduction",
        value: OPTIONS.movementCostReductionValue,
        buffedUses: OPTIONS.buffedMovesPerTarget,
        passive: false,
    },
    {
        key: "cooldownReduction",
        value: OPTIONS.cooldownReductionValue,
        buffedUses: 1,
        passive: true,
    },
];

const PASSIVE_SUPPORT_EFFECTS = SUPPORT_EFFECTS.filter(({ passive }) => passive);

function addEffects(
    total: number,
    attack: MonsterAttack,
    scale: number,
    effects: readonly SupportEffect[],
): number {
    let result = total;
    for (const { key, value, buffedUses } of effects) {
        const amount = Number(attack[key]);
        if (amount > 0) result += amount * value * buffedUses * scale;
    }
    return result;
}

export function getAttackSupportValue(attack: MonsterAttack, allyTargetChance: number): number {
    return addEffects(0, attack, allyTargetChance, SUPPORT_EFFECTS);
}

export function addPassiveSupportValue(
    total: number,
    attack: MonsterAttack,
    availability: number,
): number {
    return addEffects(total, attack, availability, PASSIVE_SUPPORT_EFFECTS);
}
