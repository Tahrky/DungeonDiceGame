import {
    BOT_PROFILES,
    BOT_STRATEGY_WEIGHT_KEYS,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    MAX_BOT_STRATEGY_WEIGHT,
    MIN_BOT_STRATEGY_WEIGHT,
    type BotProfile,
    type BotStrategyWeights,
} from "../game/botStrategy";
import { runSimulations } from "./simulator";

export interface StrategyTrainingOptions {
    seed: number;
    maxTurns: number;
    trainingSeedCount: number;
    validationSeedCount: number;
    generations: number;
    populationSize: number;
    profiles?: readonly BotProfile[];
    onProfileComplete?: (profile: BotProfile, report: TrainedProfileReport) => void;
}

export interface TrainingMetrics {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    score: number;
    elapsedMs: number;
}

export interface TrainedProfileReport {
    opponents: BotProfile[];
    candidateEvaluations: number;
    baselineTraining: TrainingMetrics;
    candidateTraining: TrainingMetrics;
    baselineValidation: TrainingMetrics;
    candidateValidation: TrainingMetrics;
    validationImproved: boolean;
    weights: BotStrategyWeights;
}

export interface StrategyTrainingReport {
    schemaVersion: 1;
    seed: number;
    maxTurns: number;
    trainingSeeds: number[];
    validationSeeds: number[];
    weights: Partial<Record<BotProfile, BotStrategyWeights>>;
    profiles: Partial<Record<BotProfile, TrainedProfileReport>>;
    elapsedMs: number;
}

function createRandom(seed: number): () => number {
    let value = seed || 0x6d2b79f5;
    return () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 0x1_0000_0000;
    };
}

export function createTrainingSeedPartitions(
    seed: number,
    trainingSeedCount: number,
    validationSeedCount: number,
): { trainingSeeds: number[]; validationSeeds: number[] } {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new RangeError("La seed d’entraînement doit être un entier non signé de 32 bits.");
    }
    if (!Number.isInteger(trainingSeedCount) || trainingSeedCount < 1) {
        throw new RangeError("Le nombre de seeds d’entraînement doit être positif.");
    }
    if (!Number.isInteger(validationSeedCount) || validationSeedCount < 1) {
        throw new RangeError("Le nombre de seeds de validation doit être positif.");
    }

    const used = new Set<number>();
    const allocate = (random: () => number, count: number): number[] => {
        const seeds: number[] = [];
        while (seeds.length < count) {
            const candidate = Math.floor(random() * 0x1_0000_0000);
            const next = (candidate + 1) >>> 0;
            if (used.has(candidate) || used.has(next)) continue;
            used.add(candidate);
            used.add(next);
            seeds.push(candidate);
        }
        return seeds;
    };

    return {
        trainingSeeds: allocate(createRandom(seed ^ 0x13579bdf), trainingSeedCount),
        validationSeeds: allocate(createRandom(seed ^ 0x9e3779b9), validationSeedCount),
    };
}

function selectOpponents(profile: BotProfile): BotProfile[] {
    const preferred: BotProfile[] = ["balanced", "defensive", "tracker", "offensive"];
    const selected = preferred.filter((opponent) => opponent !== profile);
    for (const opponent of BOT_PROFILES) {
        if (selected.length >= 3) break;
        if (opponent !== profile && !selected.includes(opponent)) selected.push(opponent);
    }
    return selected.slice(0, 3);
}

function evaluateWeights(
    profile: BotProfile,
    weights: BotStrategyWeights,
    opponents: readonly BotProfile[],
    seeds: readonly number[],
    maxTurns: number,
): TrainingMetrics {
    const startedAt = performance.now();
    const metrics: Omit<TrainingMetrics, "score" | "elapsedMs"> = {
        matches: 0,
        wins: 0,
        draws: 0,
        losses: 0,
    };
    for (const opponent of opponents) {
        for (const seed of seeds) {
            const result = runSimulations({
                games: 2,
                seed,
                maxTurns,
                profile1: profile,
                profile2: opponent,
                lightResults: true,
                strategyWeights: { [profile]: weights },
            });
            for (const match of result.matches) {
                metrics.matches++;
                if (match.winner === null) metrics.draws++;
                else if (match.winner === 1) metrics.wins++;
                else metrics.losses++;
            }
        }
    }
    return {
        ...metrics,
        score: (metrics.wins + metrics.draws * 0.5) / metrics.matches,
        elapsedMs: performance.now() - startedAt,
    };
}

function mutateWeights(
    weights: BotStrategyWeights,
    random: () => number,
    generation: number,
): BotStrategyWeights {
    const next = { ...weights };
    const mutationCount = generation % 2 === 0 ? 1 : 2;
    const changed = new Set<(typeof BOT_STRATEGY_WEIGHT_KEYS)[number]>();
    while (changed.size < mutationCount) {
        const key =
            BOT_STRATEGY_WEIGHT_KEYS[Math.floor(random() * BOT_STRATEGY_WEIGHT_KEYS.length)]!;
        changed.add(key);
    }
    const steps = [-0.5, -0.25, 0.25, 0.5] as const;
    for (const key of changed) {
        const step = steps[Math.floor(random() * steps.length)]!;
        next[key] = Math.max(
            MIN_BOT_STRATEGY_WEIGHT,
            Math.min(MAX_BOT_STRATEGY_WEIGHT, next[key] + step),
        );
    }
    return next;
}

function validateOptions(options: StrategyTrainingOptions): BotProfile[] {
    if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) {
        throw new RangeError("La limite de tours doit être un entier positif.");
    }
    if (!Number.isInteger(options.generations) || options.generations < 0) {
        throw new RangeError("Le nombre de générations doit être un entier positif ou nul.");
    }
    if (!Number.isInteger(options.populationSize) || options.populationSize < 1) {
        throw new RangeError("La taille de population doit être un entier positif.");
    }
    if (options.generations * options.populationSize > 64) {
        throw new RangeError("Le budget maximal est de 64 évaluations candidates par profil.");
    }
    const profiles = options.profiles ?? BOT_PROFILES;
    if (
        profiles.length === 0 ||
        profiles.some((profile) => !BOT_PROFILES.includes(profile)) ||
        new Set(profiles).size !== profiles.length
    ) {
        throw new RangeError("La liste des profils à entraîner est invalide.");
    }
    return [...profiles];
}

export function trainBotStrategies(options: StrategyTrainingOptions): StrategyTrainingReport {
    const profiles = validateOptions(options);
    const seedPartitions = createTrainingSeedPartitions(
        options.seed,
        options.trainingSeedCount,
        options.validationSeedCount,
    );
    const startedAt = performance.now();
    const weights: Partial<Record<BotProfile, BotStrategyWeights>> = {};
    const reports: Partial<Record<BotProfile, TrainedProfileReport>> = {};

    for (const profile of profiles) {
        const opponents = selectOpponents(profile);
        const random = createRandom((options.seed ^ BOT_PROFILES.indexOf(profile)) >>> 0);
        const baseline = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
        const baselineTraining = evaluateWeights(
            profile,
            baseline,
            opponents,
            seedPartitions.trainingSeeds,
            options.maxTurns,
        );
        let bestWeights = baseline;
        let bestTraining = baselineTraining;
        let candidateEvaluations = 1;

        for (let generation = 0; generation < options.generations; generation++) {
            let generationBestWeights = bestWeights;
            let generationBestTraining = bestTraining;
            for (
                let candidateIndex = 0;
                candidateIndex < options.populationSize;
                candidateIndex++
            ) {
                const candidate = mutateWeights(bestWeights, random, generation);
                const candidateTraining = evaluateWeights(
                    profile,
                    candidate,
                    opponents,
                    seedPartitions.trainingSeeds,
                    options.maxTurns,
                );
                candidateEvaluations++;
                if (candidateTraining.score > generationBestTraining.score) {
                    generationBestWeights = candidate;
                    generationBestTraining = candidateTraining;
                }
            }
            bestWeights = generationBestWeights;
            bestTraining = generationBestTraining;
        }

        const baselineValidation = evaluateWeights(
            profile,
            baseline,
            opponents,
            seedPartitions.validationSeeds,
            options.maxTurns,
        );
        const candidateValidation = evaluateWeights(
            profile,
            bestWeights,
            opponents,
            seedPartitions.validationSeeds,
            options.maxTurns,
        );
        weights[profile] = bestWeights;
        const profileReport: TrainedProfileReport = {
            opponents,
            candidateEvaluations,
            baselineTraining,
            candidateTraining: bestTraining,
            baselineValidation,
            candidateValidation,
            validationImproved: candidateValidation.score > baselineValidation.score,
            weights: bestWeights,
        };
        reports[profile] = profileReport;
        options.onProfileComplete?.(profile, profileReport);
    }

    return {
        schemaVersion: 1,
        seed: options.seed,
        maxTurns: options.maxTurns,
        ...seedPartitions,
        weights,
        profiles: reports,
        elapsedMs: performance.now() - startedAt,
    };
}
