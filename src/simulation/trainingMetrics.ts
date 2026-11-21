import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { DiceReserve, PlayerId } from "../types/GameTypes";
import type { BotProfile, BotStrategyWeights } from "../game/botStrategy";
import { BOT_PROFILES } from "../game/botStrategy";
import type { SimulationBatchResult, SimulationOptions } from "./types";
import { runSimulations } from "./simulator";

export type TrainingSimulationRunner = (
    options: SimulationOptions,
    configuration: GameConfiguration,
    board: BoardDefinition,
) => Promise<SimulationBatchResult>;

export interface RateConfidenceInterval {
    lower: number;
    upper: number;
}

export interface TrainingOutcomeMetrics {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    weightedScore: number;
    score: number;
    winRateConfidenceInterval: RateConfidenceInterval;
    averageTurns: number;
    averageBaseDamage: number;
    averageResourcesSpent: DiceReserve;
    averageSummonedByMonster: Record<string, number>;
    averageSupportSummonsByMonster: Record<string, number>;
}

export interface TrainingMetrics extends TrainingOutcomeMetrics {
    elapsedMs: number;
}

export interface TrainingEvaluation extends TrainingMetrics {
    matchups: Partial<Record<BotProfile, TrainingOutcomeMetrics>>;
    pairedScores: ReadonlyMap<string, number>;
}

export interface PairedScoreDifference {
    matches: number;
    mean: number;
    confidenceInterval: RateConfidenceInterval;
}

interface OutcomeAccumulator {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    totalTurns: number;
    baseDamage: number;
    resourcesSpent: DiceReserve;
    summonedByMonster: Record<string, number>;
    supportSummonsByMonster: Record<string, number>;
}

function createAccumulator(): OutcomeAccumulator {
    return {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        totalTurns: 0,
        baseDamage: 0,
        resourcesSpent: { invocation: 0, attack: 0, movement: 0 },
        summonedByMonster: {},
        supportSummonsByMonster: {},
    };
}

function getConfidenceInterval(wins: number, matches: number): RateConfidenceInterval {
    if (matches === 0) return { lower: 0, upper: 1 };
    const z = 1.96;
    const rate = wins / matches;
    const denominator = 1 + (z * z) / matches;
    const center = (rate + (z * z) / (2 * matches)) / denominator;
    const margin =
        (z * Math.sqrt((rate * (1 - rate)) / matches + (z * z) / (4 * matches * matches))) /
        denominator;
    return {
        lower: Math.max(0, center - margin),
        upper: Math.min(1, center + margin),
    };
}

function createMetrics(accumulator: OutcomeAccumulator): TrainingOutcomeMetrics {
    const count = accumulator.matches;
    return {
        matches: count,
        wins: accumulator.wins,
        draws: accumulator.draws,
        losses: accumulator.losses,
        winRate: count === 0 ? 0 : accumulator.wins / count,
        weightedScore: count === 0 ? 0 : (accumulator.wins + accumulator.draws * 0.5) / count,
        score: count === 0 ? 0 : (accumulator.wins + accumulator.draws * 0.5) / count,
        winRateConfidenceInterval: getConfidenceInterval(accumulator.wins, count),
        averageTurns: count === 0 ? 0 : accumulator.totalTurns / count,
        averageBaseDamage: count === 0 ? 0 : accumulator.baseDamage / count,
        averageResourcesSpent: {
            invocation: count === 0 ? 0 : accumulator.resourcesSpent.invocation / count,
            attack: count === 0 ? 0 : accumulator.resourcesSpent.attack / count,
            movement: count === 0 ? 0 : accumulator.resourcesSpent.movement / count,
        },
        averageSummonedByMonster: Object.fromEntries(
            Object.entries(accumulator.summonedByMonster).map(([id, amount]) => [
                id,
                count === 0 ? 0 : amount / count,
            ]),
        ),
        averageSupportSummonsByMonster: Object.fromEntries(
            Object.entries(accumulator.supportSummonsByMonster).map(([id, amount]) => [
                id,
                count === 0 ? 0 : amount / count,
            ]),
        ),
    };
}

function addMatch(
    accumulator: OutcomeAccumulator,
    result: ReturnType<typeof runSimulations>["matches"][number],
    player: PlayerId,
    configuration: GameConfiguration,
): number {
    const stats = result.statistics[player];
    accumulator.matches++;
    accumulator.totalTurns += result.turns;
    accumulator.baseDamage += stats.baseDamage;
    if (result.winner === null) accumulator.draws++;
    else if (result.winner === player) accumulator.wins++;
    else accumulator.losses++;
    for (const symbol of ["invocation", "attack", "movement"] as const) {
        accumulator.resourcesSpent[symbol] += stats.symbolsSpent[symbol];
    }
    for (const [monsterId, amount] of Object.entries(stats.summonedByMonster)) {
        accumulator.summonedByMonster[monsterId] =
            (accumulator.summonedByMonster[monsterId] ?? 0) + amount;
        const monster = configuration.monsters.find(({ id }) => id === monsterId);
        if (monster?.attacks.some((attack) => attack.targetsAlliesOnly)) {
            accumulator.supportSummonsByMonster[monsterId] =
                (accumulator.supportSummonsByMonster[monsterId] ?? 0) + amount;
        }
    }
    return result.winner === null ? 0.5 : result.winner === player ? 1 : 0;
}

export async function evaluateWeights(
    profile: BotProfile,
    weights: Readonly<BotStrategyWeights>,
    seeds: readonly number[],
    maxTurns: number,
    configuration: GameConfiguration,
    board: BoardDefinition,
    simulationRunner?: TrainingSimulationRunner,
): Promise<TrainingEvaluation> {
    const startedAt = performance.now();
    const totals = createAccumulator();
    const matchupTotals = new Map<BotProfile, OutcomeAccumulator>();
    const pairedScores = new Map<string, number>();
    const runner =
        simulationRunner ??
        (async (
            options: SimulationOptions,
            runConfiguration: GameConfiguration,
            runBoard: BoardDefinition,
        ) => runSimulations(options, runConfiguration, runBoard));

    for (const opponent of BOT_PROFILES) {
        if (opponent === profile) continue;
        matchupTotals.set(opponent, createAccumulator());
    }

    const tasks = BOT_PROFILES.filter((opponent) => opponent !== profile).flatMap((opponent) =>
        seeds.map(async (seed) => ({
            opponent,
            seed,
            result: await runner(
                {
                    games: 2,
                    seed,
                    maxTurns,
                    profile1: profile,
                    profile2: opponent,
                    lightResults: true,
                    strategyWeights: { [profile]: weights },
                },
                configuration,
                board,
            ),
        })),
    );
    for (const { opponent, seed, result } of await Promise.all(tasks)) {
        const matchup = matchupTotals.get(opponent);
        if (!matchup) throw new Error(`Résultats absents pour l’adversaire « ${opponent} ».`);
        for (const [index, match] of result.matches.entries()) {
            const score = addMatch(totals, match, 1, configuration);
            addMatch(matchup, match, 1, configuration);
            pairedScores.set(`${opponent}:${seed}:${index}`, score);
        }
    }

    const outcome = createMetrics(totals);
    return {
        ...outcome,
        elapsedMs: performance.now() - startedAt,
        matchups: Object.fromEntries(
            [...matchupTotals].map(([opponent, accumulator]) => [
                opponent,
                createMetrics(accumulator),
            ]),
        ),
        pairedScores,
    };
}

export function getPairedScoreDifference(
    candidate: TrainingEvaluation,
    reference: TrainingEvaluation,
): PairedScoreDifference {
    const differences: number[] = [];
    for (const [key, score] of candidate.pairedScores) {
        const referenceScore = reference.pairedScores.get(key);
        if (referenceScore !== undefined) differences.push(score - referenceScore);
    }
    const matches = differences.length;
    if (matches === 0) {
        return { matches, mean: 0, confidenceInterval: { lower: 0, upper: 0 } };
    }
    const mean = differences.reduce((sum, value) => sum + value, 0) / matches;
    if (matches === 1) {
        return {
            matches,
            mean,
            confidenceInterval: { lower: -1, upper: 1 },
        };
    }
    const variance =
        differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (matches - 1);
    const margin = 1.96 * Math.sqrt(variance / matches);
    return {
        matches,
        mean,
        confidenceInterval: { lower: mean - margin, upper: mean + margin },
    };
}
