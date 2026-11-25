import type { Monster } from "../../types/GameTypes";
import { clamp } from "../../utils/math";
import {
    getMovementActions,
    getMovementCost,
    getAttackSlots,
    isUsableFromStart,
} from "./monsterStats";
import { getMonsterArmor } from "./durability";
import { OPTIONS } from "./options";
import type { Plan } from "./plan";
import { addPassiveSupportValue } from "./support";

const THIEF_CAMOUFLAGE_SUPPORT = 1.8;
const ARMOR_SUPPORT = 0.25;

function averageMovementCells(range: number): number {
    const { boardWidth, boardHeight } = OPTIONS;
    let reachable = 0;
    for (let dy = 1 - boardHeight; dy < boardHeight; dy++) {
        for (let dx = 1 - boardWidth; dx < boardWidth; dx++) {
            const distance = Math.abs(dx) + Math.abs(dy);
            if (distance > 0 && distance <= range) {
                reachable += (boardWidth - Math.abs(dx)) * (boardHeight - Math.abs(dy));
            }
        }
    }
    return reachable / (boardWidth * boardHeight);
}

export function calculateOffenseScore(offensePlan: Plan): number {
    return offensePlan.totalAttackCost > 0
        ? clamp((2 * offensePlan.totalExpectedDamage) / offensePlan.totalAttackCost, 0, 10)
        : 0;
}

export function calculateMobilityScore(monster: Monster): number {
    const movementActions = getMovementActions(monster);
    const reachRatio = clamp(
        averageMovementCells(monster.movementRange) / OPTIONS.movementReferenceCells,
        0,
        1,
    );
    const costEfficiency = 1 / (1 + Math.max(0, getMovementCost(monster) - 1) * 0.35);
    const actionAvailability = movementActions / (1 + movementActions * 0.25);
    const specialValue = (monster.flying ? 0.8 : 0) + (monster.canPassHostiles ? 0.6 : 0);
    return clamp(
        10 * (0.68 * Math.sqrt(reachRatio) + 0.22 * costEfficiency + 0.1 * actionAvailability) +
            specialValue,
        0,
        10,
    );
}

function estimateAttackUsesPerTurn(monster: Monster, attackSlots: number): number {
    const total = monster.attacks.reduce((sum, attack) => {
        if (!isUsableFromStart(attack)) return sum;
        const perTurn = attack.usesPerTurn ?? attackSlots;
        const cooldownPenalty =
            (attack.cooldownTurns ?? 0) > 0 ? 1 / ((attack.cooldownTurns ?? 0) + 1) : 1;
        return sum + Math.min(perTurn, attackSlots) * cooldownPenalty;
    }, 0);
    return total / Math.max(1, monster.attacks.length);
}

export function calculateActionEconomyScore(
    monster: Monster,
    averageAttackUsesPerTurn?: number,
    averageMovementCostPerTurn?: number,
): number {
    const attackSlots = getAttackSlots(monster);
    const movementActions = getMovementActions(monster);
    const movementCost = averageMovementCostPerTurn ?? movementActions * getMovementCost(monster);
    const attackUses = averageAttackUsesPerTurn ?? estimateAttackUsesPerTurn(monster, attackSlots);
    const attackCost = monster.attacks.reduce(
        (sum, attack) => (isUsableFromStart(attack) ? sum + attack.cost : sum),
        0,
    );
    const resourcePressure = clamp(
        (attackCost / Math.max(1, monster.attacks.length) + movementCost) /
            OPTIONS.resourcesPerTurn,
        0,
        1,
    );
    const realizableActions = clamp(
        (attackUses + movementActions) / (attackSlots + movementActions),
        0,
        1,
    );
    const conversionEfficiency =
        resourcePressure > 0
            ? clamp(realizableActions / (1 + resourcePressure), 0, 1)
            : realizableActions;
    return clamp(10 * conversionEfficiency, 0, 10);
}

export function calculateUtilityScore(monster: Monster, attackSupportValue = 0): number {
    let inherentSupport = attackSupportValue;
    if (attackSupportValue === 0) {
        for (const attack of monster.attacks) {
            if (!isUsableFromStart(attack)) continue;
            const availability = (attack.usesPerTurn ?? 1) / (1 + (attack.cooldownTurns ?? 0));
            inherentSupport = addPassiveSupportValue(inherentSupport, attack, availability);
        }
    }
    const defensiveSupport =
        (monster.id === "thief" ? THIEF_CAMOUFLAGE_SUPPORT : 0) +
        (getMonsterArmor(monster) > 0 ? ARMOR_SUPPORT : 0);
    return clamp((inherentSupport / OPTIONS.supportReferenceValue) * 10 + defensiveSupport, 0, 10);
}
