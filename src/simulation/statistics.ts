export interface WilsonInterval {
    lowerBound: number;
    upperBound: number;
}

export interface OutcomeRate {
    wins: number;
    draws: number;
    matches: number;
    winRate: number | null;
    confidenceInterval: WilsonInterval | null;
}

export function calculateWilsonInterval(wins: number, matches: number): WilsonInterval | null {
    if (
        !Number.isSafeInteger(wins) ||
        !Number.isSafeInteger(matches) ||
        wins < 0 ||
        matches < 0 ||
        wins > matches
    ) {
        throw new RangeError(
            "Le nombre de victoires et de matchs doit former une proportion valide.",
        );
    }
    if (matches === 0) return null;

    const z = 1.96;
    const rate = wins / matches;
    const denominator = 1 + (z * z) / matches;
    const center = (rate + (z * z) / (2 * matches)) / denominator;
    const margin =
        (z * Math.sqrt((rate * (1 - rate)) / matches + (z * z) / (4 * matches * matches))) /
        denominator;
    return {
        lowerBound: Math.max(0, center - margin),
        upperBound: Math.min(1, center + margin),
    };
}

export function createOutcomeRate(wins: number, draws: number, matches: number): OutcomeRate {
    return {
        wins,
        draws,
        matches,
        winRate: matches > 0 ? wins / matches : null,
        confidenceInterval: calculateWilsonInterval(wins, matches),
    };
}
