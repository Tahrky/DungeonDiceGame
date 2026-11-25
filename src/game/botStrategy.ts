import type { DiceReserve, DiceSymbol, Position } from "../types/GameTypes";
import { getGridDistance } from "./geometry";
import {
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotProfile,
    type BotStrategyWeights,
    type BotTactic,
} from "./botProfiles";

export * from "./botProfiles";
export * from "./botDeck";
export {
    scoreTerritoryExpansion,
    createTerritoryExpansionScorer,
    scoreDefensivePlacement,
    createDefensivePlacementScorer,
    createPathBlockadeScorer,
} from "./botPlacement";
export { findObjectiveMovement, type ObjectiveMovement } from "./botMovement";

export interface TacticalAttackValue {
    damage: number;
    kills: number;
    statusDamage: number;
    baseDamage: number;
    healing: number;
    clearedEffects: number;
    buffs: number;
    cooldownsReduced: number;
    friendlyDamage: number;
}

export function createTacticalAttackValue(
    values: Partial<TacticalAttackValue> = {},
): TacticalAttackValue {
    return {
        damage: 0,
        kills: 0,
        statusDamage: 0,
        baseDamage: 0,
        healing: 0,
        clearedEffects: 0,
        buffs: 0,
        cooldownsReduced: 0,
        friendlyDamage: 0,
        ...values,
    };
}

export interface SymbolConversionChoice {
    sourceSymbols: [DiceSymbol, DiceSymbol];
    targetSymbol: DiceSymbol;
}

const SYMBOL_CONVERSION_PAIRS: readonly [DiceSymbol, DiceSymbol][] = [
    ["invocation", "invocation"],
    ["attack", "attack"],
    ["movement", "movement"],
    ["invocation", "attack"],
    ["invocation", "movement"],
    ["attack", "movement"],
];

const COST_BIASES: Partial<Record<BotTactic | BotProfile, number>> = {
    cheap: 1.5,
    expensive: 0.25,
};

// A zero cost counts as "unset", so the next cost replaces it.
export function getLowestProtectedCost(costs: readonly number[]): number {
    return costs.reduce((lowest, cost) => (lowest === 0 ? cost : Math.min(lowest, cost)), 0);
}

export function chooseSymbolConversion(
    reserve: DiceReserve,
    opportunities: DiceReserve,
    protectedCounts: DiceReserve,
): SymbolConversionChoice | null {
    let bestChoice: SymbolConversionChoice | null = null;
    let bestOpportunity = 0;
    let bestSurplus = Number.NEGATIVE_INFINITY;

    for (const targetSymbol of ["invocation", "attack", "movement"] as const) {
        const opportunity = opportunities[targetSymbol];
        if (opportunity <= 0 || opportunity < bestOpportunity) continue;

        for (const sourceSymbols of SYMBOL_CONVERSION_PAIRS) {
            if (sourceSymbols.includes(targetSymbol)) continue;

            const remaining = { ...reserve };
            remaining[sourceSymbols[0]]--;
            remaining[sourceSymbols[1]]--;
            if (sourceSymbols.some((symbol) => remaining[symbol] < protectedCounts[symbol])) {
                continue;
            }

            const surplus = sourceSymbols.reduce(
                (total, symbol) => total + remaining[symbol] - protectedCounts[symbol],
                0,
            );
            if (opportunity === bestOpportunity && surplus <= bestSurplus) continue;

            bestChoice = { sourceSymbols: [...sourceSymbols], targetSymbol };
            bestOpportunity = opportunity;
            bestSurplus = surplus;
        }
    }

    return bestChoice;
}

export function chooseBotObjective(
    tactic: BotTactic | BotProfile,
    source: Position,
    enemyBase: Position,
    enemyPositions: readonly Position[],
    ownBase: Position = source,
): Position {
    if (tactic === "defense" || tactic === "defensive") {
        const baseIsThreatened = enemyPositions.some(
            (enemy) => getGridDistance(enemy, ownBase) <= 4,
        );
        return baseIsThreatened ? ownBase : enemyBase;
    }
    if (tactic !== "hunt" && tactic !== "tracker") return enemyBase;
    if (enemyPositions.length === 0) return enemyBase;

    return enemyPositions.reduce((closest, candidate) =>
        getGridDistance(source, candidate) < getGridDistance(source, closest) ? candidate : closest,
    );
}

function getBaseUrgency(enemyBaseHealth: number): number {
    if (enemyBaseHealth <= 1) return 14;
    return enemyBaseHealth <= 2 ? 10 : 8;
}

function getTargetPreferences(isOffense: boolean, isHunt: boolean) {
    if (isHunt) return { base: isOffense ? 1.5 : 0.9, damage: 3, kills: 24 };
    if (isOffense) return { base: 1.5, damage: 1.5, kills: 10 };
    return { base: 1, damage: 2, kills: 8 };
}

export function scoreTacticalAttack(
    value: TacticalAttackValue,
    cost: number,
    tactic: BotTactic | BotProfile,
    enemyBaseHealth: number,
    profile?: BotProfile,
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): number {
    if (value.baseDamage > 0 && value.baseDamage >= enemyBaseHealth) {
        return Number.MAX_SAFE_INTEGER;
    }

    const isOffense = tactic === "offense" || tactic === "offensive" || profile === "offensive";
    const isHunt = tactic === "hunt" || tactic === "tracker" || profile === "tracker";
    const isSupport = tactic === "support" || profile === "support";
    const preferences = getTargetPreferences(isOffense, isHunt);
    const supportValue =
        value.healing * 2 + value.clearedEffects * 2 + value.buffs * 2 + value.cooldownsReduced * 2;
    const score =
        value.baseDamage * getBaseUrgency(enemyBaseHealth) * preferences.base * weights.baseDamage +
        value.damage * preferences.damage * weights.damage +
        value.statusDamage * 1.5 * weights.statusDamage +
        value.kills * preferences.kills * weights.kills +
        supportValue * (isSupport ? 2 : 1) * weights.support -
        value.friendlyDamage * 4 * weights.friendlyDamage;
    const costBias = COST_BIASES[profile ?? tactic] ?? 0.5;

    return Math.max(0, score) / (Math.max(0, cost) + costBias * weights.costEfficiency);
}
