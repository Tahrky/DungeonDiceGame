import type { Monster } from "../../types/GameTypes";
import { getAttackSlots } from "./monsterStats";
import { OPTIONS } from "./options";
import type { MonsterAttackBalance } from "./types";

export type PlanMode = "offense" | "support" | "combined";

export interface Plan {
    totalUses: number;
    totalAttackCost: number;
    totalExpectedDamage: number;
    totalDamagePerTarget: number;
    averageUsesPerTurn: number;
    averageAttackCostPerTurn: number;
    averageExpectedDamagePerTurn: number;
    averageSupportValuePerTurn: number;
    firstTurnAttackCost: number;
}

interface Candidate {
    index: number;
    value: number;
    valuePerCost: number;
}

const PLAN_VALUE: Record<PlanMode, (analysis: MonsterAttackBalance) => number> = {
    offense: (analysis) => analysis.netDamagePerUse,
    support: (analysis) => analysis.supportValuePerUse,
    combined: (analysis) => analysis.netDamagePerUse + analysis.supportValuePerUse,
};

function isBetter(candidate: Candidate, best: Candidate | undefined): boolean {
    return (
        !best ||
        candidate.valuePerCost > best.valuePerCost ||
        (candidate.valuePerCost === best.valuePerCost && candidate.value > best.value)
    );
}

export function simulatePlan(
    monster: Monster,
    analyses: readonly MonsterAttackBalance[],
    mode: PlanMode,
): Plan {
    const { attacks } = monster;
    const slots = getAttackSlots(monster);
    const readyAtTurn = attacks.map((attack) => 1 + (attack.initialCooldownTurns ?? 0));
    const totals = {
        uses: 0,
        attackCost: 0,
        expectedDamage: 0,
        damagePerTarget: 0,
        supportValue: 0,
        firstTurnAttackCost: 0,
    };

    for (let turn = 1; turn <= OPTIONS.analysisHorizon; turn++) {
        const usesThisTurn = attacks.map(() => 0);
        for (let slot = 0; slot < slots; slot++) {
            let best: Candidate | undefined;
            for (const [index, attack] of attacks.entries()) {
                const isAvailable =
                    readyAtTurn[index] <= turn &&
                    (attack.usesPerTurn === undefined || usesThisTurn[index] < attack.usesPerTurn);
                const value = PLAN_VALUE[mode](analyses[index]);
                if (!isAvailable || !(value > 0)) continue;
                const candidate = {
                    index,
                    value,
                    valuePerCost: value / Math.max(attack.cost, 0.25),
                };
                if (isBetter(candidate, best)) best = candidate;
            }
            if (!best) break;

            const attack = attacks[best.index];
            const analysis = analyses[best.index];
            totals.uses++;
            totals.attackCost += attack.cost;
            totals.expectedDamage += analysis.netDamagePerUse;
            totals.damagePerTarget += analysis.damagePerTarget;
            totals.supportValue += analysis.supportValuePerUse;
            usesThisTurn[best.index]++;
            if (turn === 1) totals.firstTurnAttackCost += attack.cost;
            const cooldown = attack.cooldownTurns ?? 0;
            readyAtTurn[best.index] = cooldown <= 0 ? turn : turn + cooldown + 1;
        }
    }

    return {
        totalUses: totals.uses,
        totalAttackCost: totals.attackCost,
        totalExpectedDamage: totals.expectedDamage,
        totalDamagePerTarget: totals.damagePerTarget,
        averageUsesPerTurn: totals.uses / OPTIONS.analysisHorizon,
        averageAttackCostPerTurn: totals.attackCost / OPTIONS.analysisHorizon,
        averageExpectedDamagePerTurn: totals.expectedDamage / OPTIONS.analysisHorizon,
        averageSupportValuePerTurn: totals.supportValue / OPTIONS.analysisHorizon,
        firstTurnAttackCost: totals.firstTurnAttackCost,
    };
}
