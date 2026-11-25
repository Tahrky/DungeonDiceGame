import type { Monster } from "../../types/GameTypes";
import { analyzeMonsterAttack } from "./attackAnalysis";
import {
    calculateDurabilityScore,
    calculateMonsterAverageAttacks,
    getMonsterArmor,
} from "./durability";
import { calculateEconomy } from "./economy";
import { BALANCE_WEIGHTS } from "./options";
import { simulatePlan } from "./plan";
import {
    calculateActionEconomyScore,
    calculateMobilityScore,
    calculateOffenseScore,
    calculateUtilityScore,
} from "./scores";
import { getMovementActions, getMovementCost } from "./monsterStats";
import type { MonsterAttackBalance, MonsterBalance } from "./types";

export {
    calculateAttacksNeeded,
    calculateAverageAttacksNeeded,
    calculateEffectiveDamage,
    calculateMonsterAverageAttacks,
    getMonsterArmor,
} from "./durability";
export { BALANCE_WEIGHTS } from "./options";
export {
    calculateActionEconomyScore,
    calculateMobilityScore,
    calculateUtilityScore,
} from "./scores";
export type { MonsterAttackBalance, MonsterBalance } from "./types";

function findBestRangeControlAttack(
    attacks: readonly MonsterAttackBalance[],
): MonsterAttackBalance | undefined {
    return attacks.reduce<MonsterAttackBalance | undefined>(
        (best, attack) =>
            attack.rangeControlScore > (best?.rangeControlScore ?? -1) ? attack : best,
        undefined,
    );
}

export function analyzeMonster(monster: Monster): MonsterBalance {
    const attacks = monster.attacks.map((attack) => analyzeMonsterAttack(monster, attack));
    const offensePlan = simulatePlan(monster, attacks, "offense");
    const supportPlan = simulatePlan(monster, attacks, "support");
    const combinedPlan = simulatePlan(monster, attacks, "combined");
    const bestAttack = findBestRangeControlAttack(attacks);

    const averageAttacksToEliminate = calculateMonsterAverageAttacks(monster);
    const durability = calculateDurabilityScore(monster, averageAttacksToEliminate);
    const offense = calculateOffenseScore(offensePlan);
    const mobility = calculateMobilityScore(monster);
    const utility = calculateUtilityScore(monster, supportPlan.averageSupportValuePerTurn);
    const actionEconomy = calculateActionEconomyScore(
        monster,
        combinedPlan.averageUsesPerTurn,
        getMovementActions(monster) * getMovementCost(monster),
    );
    const total =
        BALANCE_WEIGHTS.durability * durability +
        BALANCE_WEIGHTS.offense * offense +
        BALANCE_WEIGHTS.mobility * mobility +
        BALANCE_WEIGHTS.utility * utility +
        BALANCE_WEIGHTS.actionEconomy * actionEconomy;

    return {
        id: monster.id,
        name: monster.name,
        summonCost: monster.cost,
        hp: monster.hp,
        armor: getMonsterArmor(monster),
        averageAttacksToEliminate,
        averageDamagePerAttack:
            offensePlan.totalUses > 0
                ? offensePlan.totalDamagePerTarget / offensePlan.totalUses
                : null,
        movementRange: monster.movementRange,
        scores: {
            durability,
            offense,
            rangeControl: bestAttack?.rangeControlScore ?? 0,
            mobility,
            utility,
            actionEconomy,
            total,
        },
        economy: calculateEconomy(monster, attacks, offensePlan, combinedPlan, total),
        bestAttackName: bestAttack?.name ?? null,
        attacks,
    };
}

export function analyzeMonsters(monsters: readonly Monster[]): MonsterBalance[] {
    return monsters
        .map(analyzeMonster)
        .sort((first, second) => second.scores.total - first.scores.total);
}
