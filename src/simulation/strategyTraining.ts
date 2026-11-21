import {
    BOT_PROFILES,
    BOT_STRATEGY_WEIGHT_KEYS,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    MAX_BOT_STRATEGY_WEIGHT,
    MIN_BOT_STRATEGY_WEIGHT,
    parseBotStrategyWeightMap,
} from "../game/botStrategy";
import type { BotProfile, BotStrategyWeightMap, BotStrategyWeights } from "../game/botStrategy";
import type { BoardDefinition } from "../game/boards";
import { getDefaultBoard } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import { getDefaultGameConfiguration } from "../game/gameConfiguration";
import {
    BOT_WEIGHT_GROUPS,
    compareTrainingCompatibility,
    createBotTrainingMetadata,
    createTrainingFingerprint,
    TRAINING_REPORT_SCHEMA_VERSION,
    type BotTrainingMetadata,
    type BotWeightGroup,
    type TrainingCompatibility,
    type TrainingFingerprint,
    type TrainingMode,
} from "./trainingVersioning";
import {
    evaluateWeights,
    getPairedScoreDifference,
    type PairedScoreDifference,
    type TrainingEvaluation,
    type TrainingOutcomeMetrics,
    type TrainingSimulationRunner,
} from "./trainingMetrics";

export interface StrategyTrainingOptions {
    seed: number;
    maxTurns: number;
    trainingSeedCount: number;
    selectionSeedCount?: number;
    validationSeedCount: number;
    generations: number;
    populationSize: number;
    profiles?: readonly BotProfile[];
    initializationMode?: TrainingMode;
    previousWeights?: unknown;
    allowIncompatibleTransfer?: boolean;
    groups?: readonly BotWeightGroup[];
    configuration?: GameConfiguration;
    board?: BoardDefinition;
    simulationRunner?: TrainingSimulationRunner;
    onNotice?: (message: string) => void;
    onProfileComplete?: (profile: BotProfile, report: TrainedProfileReport) => void;
}

export interface SeedPartitions {
    trainingSeeds: number[];
    selectionSeeds: number[];
    validationSeeds: number[];
}

export interface TrainingReportMetrics extends TrainingOutcomeMetrics {
    matchups: Partial<Record<BotProfile, TrainingOutcomeMetrics>>;
    elapsedMs: number;
}

export interface TrainedProfileReport {
    metadata: BotTrainingMetadata;
    compatibility?: TrainingCompatibility;
    groupsTrained: BotWeightGroup[];
    opponents: BotProfile[];
    initialPopulation: {
        origin: "default" | "previous" | "mutation-of-default" | "mutation-of-previous";
        weights: BotStrategyWeights;
    }[];
    candidateEvaluations: number;
    baselineTraining: TrainingReportMetrics;
    candidateTraining: TrainingReportMetrics;
    previousTraining?: TrainingReportMetrics;
    baselineSelection: TrainingReportMetrics;
    candidateSelection: TrainingReportMetrics;
    previousSelection?: TrainingReportMetrics;
    baselineValidation: TrainingReportMetrics;
    candidateValidation: TrainingReportMetrics;
    previousValidation?: TrainingReportMetrics;
    candidateVsReference: PairedScoreDifference;
    validationImproved: boolean;
    promotedFrom: "default" | "previous" | "candidate";
    candidateWeights: BotStrategyWeights;
    weights: BotStrategyWeights;
}

export interface StrategyTrainingReport {
    schemaVersion: number;
    trainingId: string;
    createdAt: string;
    initializationMode: TrainingMode;
    groups: BotWeightGroup[];
    seed: number;
    maxTurns: number;
    trainingSeeds: number[];
    selectionSeeds: number[];
    validationSeeds: number[];
    fingerprint: TrainingFingerprint;
    configuration: GameConfiguration;
    board: BoardDefinition;
    weights: Partial<Record<BotProfile, BotStrategyWeights>>;
    profiles: Partial<Record<BotProfile, TrainedProfileReport>>;
    elapsedMs: number;
}

export type TrainingMetrics = TrainingReportMetrics;

type WeightKey = (typeof BOT_STRATEGY_WEIGHT_KEYS)[number];

const PROFILE_WEIGHT_KEYS: Record<BotProfile, readonly WeightKey[]> = {
    balanced: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "support",
        "friendlyDamage",
        "costEfficiency",
        "monsterDurability",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    cheap: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "support",
        "friendlyDamage",
        "costEfficiency",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    expensive: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "support",
        "friendlyDamage",
        "costEfficiency",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    offensive: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "friendlyDamage",
        "costEfficiency",
        "monsterOffense",
        "monsterDurability",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    support: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "support",
        "friendlyDamage",
        "costEfficiency",
        "monsterOffense",
        "monsterSupport",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    defensive: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "friendlyDamage",
        "costEfficiency",
        "monsterOffense",
        "monsterDurability",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
    tracker: [
        "baseDamage",
        "damage",
        "statusDamage",
        "kills",
        "friendlyDamage",
        "costEfficiency",
        "monsterOffense",
        "monsterDurability",
        "monsterCost",
        "invocationPriority",
        "territoryExpansion",
        "defensivePlacement",
        "pathBlockade",
        "strategicPlacement",
        "movementObjective",
        "movementHunt",
        "movementRoute",
        "movementThreat",
    ],
};

interface PreviousWeights {
    values: BotStrategyWeightMap;
    metadata: Partial<Record<BotProfile, Partial<BotTrainingMetadata>>>;
    trainingId?: string;
}

interface Candidate {
    source: "default" | "previous" | "candidate";
    weights: BotStrategyWeights;
    evaluation: TrainingEvaluation;
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
    selectionSeedCount = validationSeedCount,
): SeedPartitions {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
        throw new RangeError("La seed d’entraînement doit être un entier non signé de 32 bits.");
    }
    const seedCounts: [string, number][] = [
        ["entraînement", trainingSeedCount],
        ["sélection", selectionSeedCount],
        ["validation", validationSeedCount],
    ];
    for (const [label, count] of seedCounts) {
        if (!Number.isInteger(count) || count < 1) {
            throw new RangeError(`Le nombre de seeds de ${label} doit être positif.`);
        }
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
        selectionSeeds: allocate(createRandom(seed ^ 0x2468ace0), selectionSeedCount),
        validationSeeds: allocate(createRandom(seed ^ 0x9e3779b9), validationSeedCount),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPreviousWeights(value: unknown): PreviousWeights {
    const report = isRecord(value) ? value : null;
    const rawWeights = report && "weights" in report ? report.weights : value;
    const values = parseBotStrategyWeightMap(rawWeights);
    if (!values) throw new RangeError("Le rapport précédent ne contient pas de poids valides.");

    const profileReports = report && isRecord(report.profiles) ? report.profiles : {};
    const metadata: Partial<Record<BotProfile, Partial<BotTrainingMetadata>>> = {};
    for (const profile of BOT_PROFILES) {
        const profileReport = profileReports[profile];
        const profileMetadata =
            isRecord(profileReport) && isRecord(profileReport.metadata)
                ? profileReport.metadata
                : report && isRecord(report.metadata)
                  ? report.metadata
                  : undefined;
        if (profileMetadata) {
            metadata[profile] = profileMetadata as Partial<BotTrainingMetadata>;
        }
    }
    const trainingId =
        report && typeof report.trainingId === "string" ? report.trainingId : undefined;
    return { values, metadata, ...(trainingId === undefined ? {} : { trainingId }) };
}

function equalWeights(first: BotStrategyWeights, second: BotStrategyWeights): boolean {
    return (
        JSON.stringify(first, Object.keys(first).sort()) ===
        JSON.stringify(second, Object.keys(second).sort())
    );
}

function getTrainableKeys(profile: BotProfile, groups: readonly BotWeightGroup[]): WeightKey[] {
    const profileKeys = new Set<WeightKey>([
        ...PROFILE_WEIGHT_KEYS[profile],
        "routeDenial",
        "routeRedundancy",
        "chokepointControl",
        "defensiveCoverage",
        "formationCohesion",
        "interception",
    ]);
    return [
        ...new Set(
            groups
                .flatMap((group) => BOT_WEIGHT_GROUPS[group])
                .filter((key) => profileKeys.has(key)),
        ),
    ];
}

function mutateWeights(
    source: BotStrategyWeights,
    keys: readonly WeightKey[],
    random: () => number,
    generation: number,
    maximumChangedKeys = 2,
): BotStrategyWeights {
    if (keys.length === 0) return { ...source };
    const result = { ...source };
    const shuffled = [...keys];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
    }
    const mutationCount = Math.min(
        keys.length,
        maximumChangedKeys === 1 ? 1 : 1 + Math.floor(random() * maximumChangedKeys),
    );
    const steps = generation > 2 ? [-0.25, 0.25] : [-0.5, -0.25, 0.25, 0.5];
    for (const key of shuffled.slice(0, mutationCount)) {
        const candidates = steps
            .map((step) => source[key] + step)
            .filter(
                (weight) =>
                    weight >= MIN_BOT_STRATEGY_WEIGHT &&
                    weight <= MAX_BOT_STRATEGY_WEIGHT &&
                    weight !== source[key],
            );
        if (candidates.length === 0) continue;
        result[key] = candidates[Math.floor(random() * candidates.length)]!;
    }
    return result;
}

function createInitialPopulation(
    mode: TrainingMode,
    defaults: BotStrategyWeights,
    previous: BotStrategyWeights | undefined,
    populationSize: number,
    keys: readonly WeightKey[],
    random: () => number,
): TrainedProfileReport["initialPopulation"] {
    const population: TrainedProfileReport["initialPopulation"] = [];
    if (mode !== "warmStart" || !previous) {
        population.push({ origin: "default", weights: defaults });
    }
    if ((mode === "warmStart" || mode === "hybrid") && previous) {
        population.push({ origin: "previous", weights: { ...previous } });
    }
    if (mode === "hybrid" && previous) {
        population.push({
            origin: "mutation-of-previous",
            weights: mutateWeights(previous, keys, random, 0),
        });
        population.push({
            origin: "mutation-of-default",
            weights: mutateWeights(defaults, keys, random, 0),
        });
        population.push({
            origin: "mutation-of-default",
            weights: mutateWeights(defaults, keys, random, 0, 4),
        });
    }

    while (population.length < populationSize) {
        const fromPrevious =
            mode === "warmStart" || (mode === "hybrid" && previous !== undefined && random() < 0.5);
        const source = fromPrevious && previous ? previous : defaults;
        population.push({
            origin: fromPrevious && previous ? "mutation-of-previous" : "mutation-of-default",
            weights: mutateWeights(source, keys, random, 0),
        });
    }
    return population.slice(0, populationSize);
}

function asReportMetrics(evaluation: TrainingEvaluation): TrainingReportMetrics {
    const { pairedScores: _pairedScores, ...metrics } = evaluation;
    return metrics;
}

function selectBest(candidates: readonly Candidate[]): Candidate {
    return candidates.reduce((best, candidate) =>
        candidate.evaluation.weightedScore > best.evaluation.weightedScore ? candidate : best,
    );
}

function validateOptions(options: StrategyTrainingOptions): {
    profiles: BotProfile[];
    mode: TrainingMode;
    groups?: BotWeightGroup[];
} {
    if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) {
        throw new RangeError("La limite de tours doit être un entier positif.");
    }
    if (!Number.isInteger(options.generations) || options.generations < 0) {
        throw new RangeError("Le nombre de générations doit être positif ou nul.");
    }
    if (!Number.isInteger(options.populationSize) || options.populationSize < 1) {
        throw new RangeError("La taille de population doit être positive.");
    }
    if ((options.generations + 1) * options.populationSize > 64) {
        throw new RangeError("Le budget maximal est de 64 évaluations candidates par profil.");
    }
    const mode = options.initializationMode ?? "default";
    if (!["default", "warmStart", "hybrid"].includes(mode)) {
        throw new RangeError("Le mode d’initialisation est invalide.");
    }
    if (mode === "hybrid" && options.populationSize < 5) {
        throw new RangeError("Le mode hybrid nécessite une population d’au moins cinq candidats.");
    }
    if (mode !== "default" && options.previousWeights === undefined) {
        throw new RangeError(`Le mode ${mode} nécessite --previous-weights.`);
    }
    const profiles = options.profiles ?? BOT_PROFILES;
    if (
        profiles.length === 0 ||
        profiles.some((profile) => !BOT_PROFILES.includes(profile)) ||
        new Set(profiles).size !== profiles.length
    ) {
        throw new RangeError("La liste des profils à entraîner est invalide.");
    }
    if (options.groups) {
        if (
            options.groups.length === 0 ||
            options.groups.some((group) => !(group in BOT_WEIGHT_GROUPS)) ||
            new Set(options.groups).size !== options.groups.length
        ) {
            throw new RangeError("Les groupes de pondérations sont invalides.");
        }
    }
    return {
        profiles: [...profiles],
        mode,
        ...(options.groups === undefined ? {} : { groups: [...options.groups] }),
    };
}

export async function trainBotStrategies(
    options: StrategyTrainingOptions,
): Promise<StrategyTrainingReport> {
    const { profiles, mode, groups: requestedGroups } = validateOptions(options);
    const configuration = options.configuration ?? getDefaultGameConfiguration();
    const board = options.board ?? getDefaultBoard();
    const fingerprint = createTrainingFingerprint(configuration, board);
    const partitions = createTrainingSeedPartitions(
        options.seed,
        options.trainingSeedCount,
        options.validationSeedCount,
        options.selectionSeedCount ?? options.validationSeedCount,
    );
    const previousSource =
        options.previousWeights === undefined
            ? undefined
            : readPreviousWeights(options.previousWeights);
    const startedAt = performance.now();
    const createdAt = new Date().toISOString();
    const trainedWeights: Partial<Record<BotProfile, BotStrategyWeights>> = {};
    const reports: Partial<Record<BotProfile, TrainedProfileReport>> = {};
    let trainingId = "";
    const allGroups = Object.keys(BOT_WEIGHT_GROUPS) as BotWeightGroup[];

    for (const profile of profiles) {
        const previous = previousSource?.values[profile];
        if (mode !== "default" && !previous) {
            throw new RangeError(
                `Aucune pondération précédente n’est disponible pour « ${profile} ».`,
            );
        }
        const compatibility = previous
            ? compareTrainingCompatibility(previousSource?.metadata[profile], fingerprint)
            : undefined;
        if (
            mode !== "default" &&
            compatibility &&
            (compatibility.level === "legacy" || compatibility.level === "incompatible") &&
            !options.allowIncompatibleTransfer
        ) {
            throw new Error(
                `Transfert refusé pour « ${profile} » (${compatibility.level}) : ` +
                    `${compatibility.differences.join(", ")}. Utilisez --allow-incompatible-transfer ` +
                    `pour autoriser explicitement ce transfert expérimental.`,
            );
        }
        if (compatibility && compatibility.level !== "exact") {
            options.onNotice?.(
                `${profile} : compatibilité ${compatibility.level}; changements : ` +
                    `${compatibility.differences.join(", ") || "métadonnées absentes"}; ` +
                    `groupes affectés : ${compatibility.affectedGroups.join(", ") || "aucun"}.`,
            );
        }

        const groups =
            requestedGroups ??
            (mode !== "default" &&
            compatibility?.level === "partial" &&
            compatibility.affectedGroups.length > 0
                ? compatibility.affectedGroups
                : allGroups);
        const keys = getTrainableKeys(profile, groups);
        if (keys.length === 0) {
            throw new RangeError(
                `Aucune pondération entraînable pour « ${profile} » dans ces groupes.`,
            );
        }
        if (
            requestedGroups &&
            compatibility &&
            compatibility.affectedGroups.some((group) => !requestedGroups.includes(group))
        ) {
            options.onNotice?.(
                `${profile} : les groupes modifiés hors périmètre resteront inchangés et devront être validés.`,
            );
        }

        const defaults = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
        const random = createRandom((options.seed ^ BOT_PROFILES.indexOf(profile)) >>> 0);
        const population = createInitialPopulation(
            mode,
            defaults,
            previous,
            options.populationSize,
            keys,
            random,
        );
        let candidateEvaluations = 0;
        const trainingByWeights = new Map<string, Promise<TrainingEvaluation>>();
        const getTraining = (weights: BotStrategyWeights): Promise<TrainingEvaluation> => {
            const key = JSON.stringify(weights);
            let evaluation = trainingByWeights.get(key);
            if (!evaluation) {
                evaluation = evaluateWeights(
                    profile,
                    weights,
                    partitions.trainingSeeds,
                    options.maxTurns,
                    configuration,
                    board,
                    options.simulationRunner,
                );
                trainingByWeights.set(key, evaluation);
            }
            return evaluation;
        };
        const evaluatePopulation = async (
            weights: readonly BotStrategyWeights[],
        ): Promise<Candidate[]> => {
            const candidates: Candidate[] = [];
            for (const candidateWeights of weights) {
                candidateEvaluations++;
                candidates.push({
                    source: "candidate",
                    weights: candidateWeights,
                    evaluation: await getTraining(candidateWeights),
                });
            }
            return candidates;
        };

        let trainingCandidates = await evaluatePopulation(population.map(({ weights }) => weights));
        for (let generation = 1; generation <= options.generations; generation++) {
            const parents = [...trainingCandidates]
                .sort(
                    (first, second) =>
                        second.evaluation.weightedScore - first.evaluation.weightedScore,
                )
                .slice(0, Math.min(3, trainingCandidates.length));
            const nextGeneration = Array.from({ length: options.populationSize }, (_, index) =>
                mutateWeights(
                    parents[index % parents.length]!.weights,
                    keys,
                    random,
                    generation,
                    generation > 2 ? 1 : 2,
                ),
            );
            trainingCandidates = [
                ...trainingCandidates,
                ...(await evaluatePopulation(nextGeneration)),
            ];
        }

        const bestTraining = selectBest(trainingCandidates);
        const selectionCandidates: Candidate[] = [];
        const addSelectionCandidate = async (
            source: Candidate["source"],
            weights: BotStrategyWeights,
        ): Promise<void> => {
            if (selectionCandidates.some((candidate) => equalWeights(candidate.weights, weights))) {
                return;
            }
            const evaluation = await evaluateWeights(
                profile,
                weights,
                partitions.selectionSeeds,
                options.maxTurns,
                configuration,
                board,
                options.simulationRunner,
            );
            selectionCandidates.push({
                source,
                weights,
                evaluation,
            });
        };
        await addSelectionCandidate("default", defaults);
        if (previous) await addSelectionCandidate("previous", previous);
        await addSelectionCandidate("candidate", bestTraining.weights);
        const selected = selectBest(selectionCandidates);

        const validationByWeights = new Map<string, Promise<TrainingEvaluation>>();
        const getValidation = (weights: BotStrategyWeights): Promise<TrainingEvaluation> => {
            const key = JSON.stringify(weights);
            let evaluation = validationByWeights.get(key);
            if (!evaluation) {
                evaluation = evaluateWeights(
                    profile,
                    weights,
                    partitions.validationSeeds,
                    options.maxTurns,
                    configuration,
                    board,
                    options.simulationRunner,
                );
                validationByWeights.set(key, evaluation);
            }
            return evaluation;
        };
        const baselineValidation = await getValidation(defaults);
        const candidateValidation = await getValidation(bestTraining.weights);
        const previousValidation = previous ? await getValidation(previous) : undefined;
        const baselineSelection = selectionCandidates.find((candidate) =>
            equalWeights(candidate.weights, defaults),
        )!.evaluation;
        const candidateSelection = selectionCandidates.find((candidate) =>
            equalWeights(candidate.weights, bestTraining.weights),
        )!.evaluation;
        const previousSelection = previous
            ? selectionCandidates.find((candidate) => equalWeights(candidate.weights, previous))
                  ?.evaluation
            : undefined;

        const selectionReference = selectBest(
            selectionCandidates.filter(
                (candidate) => candidate.source === "default" || candidate.source === "previous",
            ),
        );
        const validationReference: Candidate = {
            ...selectionReference,
            evaluation: await getValidation(selectionReference.weights),
        };
        const candidateVsReference = getPairedScoreDifference(
            candidateValidation,
            validationReference.evaluation,
        );
        const candidateWasSelected = selected.source === "candidate";
        const validationImproved =
            candidateWasSelected &&
            !equalWeights(bestTraining.weights, validationReference.weights) &&
            candidateVsReference.mean > 0 &&
            candidateVsReference.confidenceInterval.lower > 0;
        const promotedFrom = validationImproved ? "candidate" : validationReference.source;
        const promotedWeights = validationImproved
            ? bestTraining.weights
            : validationReference.weights;

        const metadata = createBotTrainingMetadata(
            fingerprint,
            {
                profile,
                initializationMode: mode,
                ...(previousSource?.trainingId === undefined
                    ? {}
                    : { parentTrainingId: previousSource.trainingId }),
                trainingSeed: options.seed,
                trainingSeeds: partitions.trainingSeeds,
                selectionSeeds: partitions.selectionSeeds,
                validationSeeds: partitions.validationSeeds,
                generationCount: options.generations,
                populationSize: options.populationSize,
            },
            createdAt,
        );
        if (!trainingId) trainingId = metadata.trainingId;
        const profileReport: TrainedProfileReport = {
            metadata: { ...metadata, createdAt },
            ...(compatibility === undefined ? {} : { compatibility }),
            groupsTrained: [...groups],
            opponents: BOT_PROFILES.filter((opponent) => opponent !== profile),
            initialPopulation: population,
            candidateEvaluations,
            baselineTraining: asReportMetrics(await getTraining(defaults)),
            candidateTraining: asReportMetrics(bestTraining.evaluation),
            ...(previous === undefined
                ? {}
                : { previousTraining: asReportMetrics(await getTraining(previous)) }),
            baselineSelection: asReportMetrics(baselineSelection),
            candidateSelection: asReportMetrics(candidateSelection),
            ...(previousSelection === undefined
                ? {}
                : { previousSelection: asReportMetrics(previousSelection) }),
            baselineValidation: asReportMetrics(baselineValidation),
            candidateValidation: asReportMetrics(candidateValidation),
            ...(previousValidation === undefined
                ? {}
                : { previousValidation: asReportMetrics(previousValidation) }),
            candidateVsReference,
            validationImproved,
            promotedFrom,
            candidateWeights: bestTraining.weights,
            weights: promotedWeights,
        };
        reports[profile] = profileReport;
        trainedWeights[profile] = promotedWeights;
        options.onProfileComplete?.(profile, profileReport);
    }

    return {
        schemaVersion: TRAINING_REPORT_SCHEMA_VERSION,
        trainingId,
        createdAt,
        initializationMode: mode,
        groups: requestedGroups ?? allGroups,
        seed: options.seed,
        maxTurns: options.maxTurns,
        ...partitions,
        fingerprint,
        configuration,
        board,
        weights: trainedWeights,
        profiles: reports,
        elapsedMs: performance.now() - startedAt,
    };
}
