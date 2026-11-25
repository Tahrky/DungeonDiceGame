import type { Monster } from "../../types/GameTypes";
import { getMovementActions, getMovementCost, isUsableFromStart } from "./monsterStats";
import { OPTIONS } from "./options";
import type { Plan } from "./plan";
import type { MonsterAttackBalance, MonsterEconomy } from "./types";

function getStandardAttackCost(
    monster: Monster,
    analyses: readonly MonsterAttackBalance[],
): number {
    let bestCost = 0;
    let bestValuePerCost = -Infinity;
    for (const [index, attack] of monster.attacks.entries()) {
        if (!isUsableFromStart(attack)) continue;
        const { netDamagePerUse, supportValuePerUse } = analyses[index];
        const valuePerCost = (netDamagePerUse + supportValuePerUse) / Math.max(attack.cost, 0.25);
        if (valuePerCost > bestValuePerCost) {
            bestValuePerCost = valuePerCost;
            bestCost = attack.cost;
        }
    }
    return bestCost;
}

export function calculateEconomy(
    monster: Monster,
    analyses: readonly MonsterAttackBalance[],
    offensePlan: Plan,
    combinedPlan: Plan,
    totalScore: number,
): MonsterEconomy {
    const averageMovementCostPerTurn = getMovementActions(monster) * getMovementCost(monster);
    const averageOperatingCostPerTurn =
        combinedPlan.averageAttackCostPerTurn + averageMovementCostPerTurn;
    const invocationDemand = monster.cost / OPTIONS.invocationEfficiencyHorizon;
    const resourceShare = OPTIONS.resourcesPerTurn / OPTIONS.resourceTypes;
    const deficit =
        Math.max(0, invocationDemand - resourceShare) +
        Math.max(0, combinedPlan.averageAttackCostPerTurn - resourceShare) +
        Math.max(0, averageMovementCostPerTurn - resourceShare);
    const grossEquivalentCostPerTurn = invocationDemand + averageOperatingCostPerTurn + deficit;

    return {
        standardEntryCost:
            monster.cost + getStandardAttackCost(monster, analyses) + getMovementCost(monster),
        fullFirstTurnCost:
            monster.cost + combinedPlan.firstTurnAttackCost + averageMovementCostPerTurn,
        averageAttackCostPerTurn: combinedPlan.averageAttackCostPerTurn,
        averageMovementCostPerTurn,
        averageOperatingCostPerTurn,
        grossEquivalentCostPerTurn,
        grossEquivalentPressurePercent:
            (100 * grossEquivalentCostPerTurn) / OPTIONS.resourcesPerTurn,
        invocationEfficiency: totalScore / Math.max(1, monster.cost),
        longTermDamageEfficiency:
            grossEquivalentCostPerTurn > 0
                ? offensePlan.averageExpectedDamagePerTurn / grossEquivalentCostPerTurn
                : 0,
    };
}
