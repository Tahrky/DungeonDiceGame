import type { BoardDefinition } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { DiceReserve, PlayerId } from "../../types/GameTypes";
import type { BotProfile, BotStrategyWeights } from "../../game/botStrategy";
import { BOT_PROFILES } from "../../game/botStrategy";
import type { MatchResult, SimulationBatchResult, SimulationOptions } from "../types";
import { runSimulations } from "../simulator";

const EVALUATION_BATCH_SIZE = 4;

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
    matchups: Partial<Record<BotProfile, TrainingOutcomeMetrics>>;
}

export interface TrainingEvaluation {
    metrics: TrainingMetrics;
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
    const average = (total: number) => (count === 0 ? 0 : total / count);
    const averages = (totals: Record<string, number>) =>
        Object.fromEntries(Object.entries(totals).map(([id, total]) => [id, average(total)]));
    const score = average(accumulator.wins + accumulator.draws * 0.5);
    return {
        matches: count,
        wins: accumulator.wins,
        draws: accumulator.draws,
        losses: accumulator.losses,
        winRate: average(accumulator.wins),
        weightedScore: score,
        score,
        winRateConfidenceInterval: getConfidenceInterval(accumulator.wins, count),
        averageTurns: average(accumulator.totalTurns),
        averageBaseDamage: average(accumulator.baseDamage),
        averageResourcesSpent: {
            invocation: average(accumulator.resourcesSpent.invocation),
            attack: average(accumulator.resourcesSpent.attack),
            movement: average(accumulator.resourcesSpent.movement),
        },
        averageSummonedByMonster: averages(accumulator.summonedByMonster),
        averageSupportSummonsByMonster: averages(accumulator.supportSummonsByMonster),
    };
}

function addMatch(
    accumulator: OutcomeAccumulator,
    result: MatchResult,
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
    const runner: TrainingSimulationRunner =
        simulationRunner ?? (async (...args) => runSimulations(...args));
    const opponents = BOT_PROFILES.filter((opponent) => opponent !== profile);
    const totals = createAccumulator();
    const matchupTotals = new Map(opponents.map((opponent) => [opponent, createAccumulator()]));
    const pairedScores = new Map<string, number>();

    const evaluations = opponents.flatMap((opponent) => seeds.map((seed) => ({ opponent, seed })));
    for (let offset = 0; offset < evaluations.length; offset += EVALUATION_BATCH_SIZE) {
        const batch = await Promise.all(
            evaluations
                .slice(offset, offset + EVALUATION_BATCH_SIZE)
                .map(async ({ opponent, seed }) => ({
                    opponent,
                    seed,
                    result: await runner(
                        {
                            games: 2,
                            seed,
                            maxTurns,
                            profile1: profile,
                            profile2: opponent,
                            strategyWeights: { [profile]: weights },
                        },
                        configuration,
                        board,
                    ),
                })),
        );
        for (const { opponent, seed, result } of batch) {
            const matchup = matchupTotals.get(opponent)!;
            for (const [index, match] of result.matches.entries()) {
                const score = addMatch(totals, match, 1, configuration);
                addMatch(matchup, match, 1, configuration);
                pairedScores.set(`${opponent}:${seed}:${index}`, score);
            }
        }
    }

    return {
        metrics: {
            ...createMetrics(totals),
            elapsedMs: performance.now() - startedAt,
            matchups: Object.fromEntries(
                [...matchupTotals].map(([opponent, accumulator]) => [
                    opponent,
                    createMetrics(accumulator),
                ]),
            ),
        },
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
