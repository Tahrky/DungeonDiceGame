import type { Monster } from "../../types/GameTypes";

export function getSupportValue(monster: Monster): number {
    return monster.attacks.reduce((total, attack) => {
        if (!attack.targetsAlliesOnly) return total;
        return (
            total +
            (attack.healAmount ?? 0) * 2 +
            (attack.cooldownReduction ?? 0) +
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0) +
            (attack.clearsStatusEffects ? 1 : 0)
        );
    }, 0);
}

export function getOffenseValue(monster: Monster): number {
    return monster.attacks.reduce(
        (total, attack) =>
            total +
            (attack.damage +
                (attack.statusEffect?.type === "damageOverTime"
                    ? attack.statusEffect.damagePerTurn
                    : 0)) /
                Math.max(1, attack.cost),
        0,
    );
}
