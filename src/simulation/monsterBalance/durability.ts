import { MONSTERS } from "../../data/monsters";
import type { Monster } from "../../types/GameTypes";
import { clamp } from "../../utils/math";

function toNonNegative(value: number | null | undefined): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getMonsterArmor(monster: Pick<Monster, "armor">): number {
    return toNonNegative(monster.armor);
}

export function calculateEffectiveDamage(
    attackDamage: number,
    armor: number | null | undefined,
): number {
    return Math.max(0, toNonNegative(attackDamage) - toNonNegative(armor));
}

export function calculateAttacksNeeded(
    hp: number,
    armor: number | null | undefined,
    attackDamage: number,
): number | null {
    const effectiveDamage = calculateEffectiveDamage(attackDamage, armor);
    if (effectiveDamage <= 0) return null;
    return Math.ceil(Math.max(0, hp) / effectiveDamage);
}

export function calculateAverageAttacksNeeded(
    hp: number,
    armor: number | null | undefined,
    representativeDamages: readonly number[],
): number | null {
    const values = representativeDamages
        .map((damage) => calculateAttacksNeeded(hp, armor, damage))
        .filter((value): value is number => value !== null);
    if (values.length === 0 || values.length !== representativeDamages.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateMonsterAverageAttacks(
    monster: Monster,
    attackCatalog: readonly Monster[] = MONSTERS,
): number | null {
    const armor = getMonsterArmor(monster);
    let weightedSum = 0;
    let totalWeight = 0;

    for (const { attacks } of attackCatalog) {
        for (const attack of attacks) {
            if (attack.targetsAlliesOnly || attack.healAmount !== undefined || attack.damage <= 0) {
                continue;
            }
            const attacksNeeded = calculateAttacksNeeded(monster.hp, armor, attack.damage);
            if (attacksNeeded === null) continue;
            const availability =
                (attack.usesPerTurn ?? 1) /
                (1 + (attack.initialCooldownTurns ?? 0) * 0.5 + (attack.cooldownTurns ?? 0) * 0.25);
            const weight = availability / Math.max(attack.cost, 0.25);
            weightedSum += attacksNeeded * weight;
            totalWeight += weight;
        }
    }

    if (totalWeight <= 0) return null;
    const average = weightedSum / totalWeight;
    return Number.isFinite(average) ? average : null;
}

export function calculateDurabilityScore(
    monster: Monster,
    averageAttacksToEliminate: number | null,
): number {
    if (getMonsterArmor(monster) === 0) return clamp((monster.hp / 8) * 10, 0, 10);
    return averageAttacksToEliminate === null
        ? 10
        : clamp((averageAttacksToEliminate / 4.8) * 10, 0, 10);
}
