export interface ExpectiminimaxConfig {
    maxDepth: number;
    branchWidth: number;
    nodeBudget: number;
}

export interface ChanceOutcome<T> {
    outcome: T;
    probability: number;
}

export interface SearchContext {
    nodes: number;
    budgetReached: boolean;
    transpositions: number;
}

export function maxValue<T>(
    branches: readonly T[],
    evaluate: (branch: T) => number,
): number {
    if (branches.length === 0) return Number.NEGATIVE_INFINITY;
    let best = Number.NEGATIVE_INFINITY;
    for (const branch of branches) best = Math.max(best, evaluate(branch));
    return best;
}

export function minValue<T>(
    branches: readonly T[],
    evaluate: (branch: T) => number,
): number {
    if (branches.length === 0) return Number.POSITIVE_INFINITY;
    let best = Number.POSITIVE_INFINITY;
    for (const branch of branches) best = Math.min(best, evaluate(branch));
    return best;
}

export function chanceValue<T>(
    outcomes: readonly ChanceOutcome<T>[],
    evaluate: (outcome: T) => number,
): number {
    let totalProbability = 0;
    let result = 0;
    for (const { outcome, probability } of outcomes) {
        if (probability <= 0) continue;
        totalProbability += probability;
        result += probability * evaluate(outcome);
    }
    return totalProbability > 0 ? result / totalProbability : 0;
}

export function shouldStopSearch(context: SearchContext, config: ExpectiminimaxConfig): boolean {
    if (context.nodes >= config.nodeBudget) {
        context.budgetReached = true;
        return true;
    }
    return false;
}

