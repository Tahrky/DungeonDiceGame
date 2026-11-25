import { BOT_PROFILES, DEFAULT_BOT_STRATEGY_WEIGHTS } from "../../game/botStrategy";
import type { BotProfile, BotStrategyWeights } from "../../game/botStrategy";
import type { BoardDefinition } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { createSeededRandom } from "../../game/random";
import { evaluateWeights, getPairedScoreDifference, type TrainingEvaluation } from "./metrics";
import type { PreviousWeights } from "./previousWeights";
import type {
    InitialPopulationMember,
    SeedPartitions,
    StrategyTrainingOptions,
    TrainedProfileReport,
    WeightSource,
} from "./types";
import {
    ALL_WEIGHT_GROUPS,
    compareTrainingCompatibility,
    createBotTrainingMetadata,
    type BotWeightGroup,
    type TrainingCompatibility,
    type TrainingFingerprint,
    type TrainingMode,
} from "./versioning";
import {
    createInitialPopulation,
    equalWeights,
    getTrainableKeys,
    mutateWeights,
    type WeightKey,
} from "./weightSearch";

export interface TrainingRun {
    options: StrategyTrainingOptions;
    mode: TrainingMode;
    requestedGroups?: BotWeightGroup[];
    configuration: GameConfiguration;
    board: BoardDefinition;
    fingerprint: TrainingFingerprint;
    partitions: SeedPartitions;
    previousSource?: PreviousWeights;
    createdAt: string;
}

interface Candidate {
    source: WeightSource;
    weights: BotStrategyWeights;
    evaluation: TrainingEvaluation;
}

type Evaluate = (weights: BotStrategyWeights) => Promise<TrainingEvaluation>;

const PARENT_COUNT = 3;

const getScore = ({ evaluation }: Candidate): number => evaluation.metrics.weightedScore;

function selectBest(candidates: readonly Candidate[]): Candidate {
    return candidates.reduce((best, candidate) =>
        getScore(candidate) > getScore(best) ? candidate : best,
    );
}

function memoize(evaluate: Evaluate): Evaluate {
    const cache = new Map<string, Promise<TrainingEvaluation>>();
    return (weights) => {
        const key = JSON.stringify(weights);
        let evaluation = cache.get(key);
        if (!evaluation) {
            evaluation = evaluate(weights);
            cache.set(key, evaluation);
        }
        return evaluation;
    };
}

function checkCompatibility(
    run: TrainingRun,
    profile: BotProfile,
    previous: BotStrategyWeights | undefined,
): TrainingCompatibility | undefined {
    if (!previous) return undefined;
    const { options, mode, fingerprint, previousSource } = run;
    const compatibility = compareTrainingCompatibility(
        previousSource?.metadata[profile],
        fingerprint,
    );
    const differences = compatibility.differences.join(", ");
    if (
        mode !== "default" &&
        (compatibility.level === "legacy" || compatibility.level === "incompatible") &&
        !options.allowIncompatibleTransfer
    ) {
        throw new Error(
            `Transfert refusé pour « ${profile} » (${compatibility.level}) : ${differences}. ` +
                `Utilisez --allow-incompatible-transfer pour autoriser explicitement ce transfert expérimental.`,
        );
    }
    if (compatibility.level !== "exact") {
        options.onNotice?.(
            `${profile} : compatibilité ${compatibility.level}; changements : ` +
                `${differences || "métadonnées absentes"}; ` +
                `groupes affectés : ${compatibility.affectedGroups.join(", ") || "aucun"}.`,
        );
    }
    return compatibility;
}

function selectGroups(run: TrainingRun, compatibility?: TrainingCompatibility): BotWeightGroup[] {
    if (run.requestedGroups) return run.requestedGroups;
    const refreshesAffectedGroups =
        run.mode !== "default" &&
        compatibility?.level === "partial" &&
        compatibility.affectedGroups.length > 0;
    return refreshesAffectedGroups ? compatibility.affectedGroups : ALL_WEIGHT_GROUPS;
}

async function evolve(
    options: StrategyTrainingOptions,
    population: readonly InitialPopulationMember[],
    keys: readonly WeightKey[],
    random: () => number,
    evaluate: Evaluate,
): Promise<Candidate[]> {
    const evaluateAll = async (weights: readonly BotStrategyWeights[]): Promise<Candidate[]> => {
        const candidates: Candidate[] = [];
        for (const candidateWeights of weights) {
            candidates.push({
                source: "candidate",
                weights: candidateWeights,
                evaluation: await evaluate(candidateWeights),
            });
        }
        return candidates;
    };

    let candidates = await evaluateAll(population.map(({ weights }) => weights));
    for (let generation = 1; generation <= options.generations; generation++) {
        const parents = [...candidates]
            .sort((first, second) => getScore(second) - getScore(first))
            .slice(0, PARENT_COUNT);
        const offspring = Array.from({ length: options.populationSize }, (_, index) =>
            mutateWeights(parents[index % parents.length]!.weights, keys, random, generation),
        );
        candidates = [...candidates, ...(await evaluateAll(offspring))];
    }
    return candidates;
}

async function evaluateSelection(
    evaluate: Evaluate,
    entries: readonly (readonly [WeightSource, BotStrategyWeights])[],
): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    for (const [source, weights] of entries) {
        if (candidates.some((candidate) => equalWeights(candidate.weights, weights))) continue;
        candidates.push({ source, weights, evaluation: await evaluate(weights) });
    }
    return candidates;
}

export async function trainProfile(
    run: TrainingRun,
    profile: BotProfile,
): Promise<TrainedProfileReport> {
    const { options, mode, configuration, board, partitions, fingerprint, previousSource } = run;
    const previous = previousSource?.values[profile];
    if (mode !== "default" && !previous) {
        throw new RangeError(`Aucune pondération précédente n’est disponible pour « ${profile} ».`);
    }
    const compatibility = checkCompatibility(run, profile, previous);
    const groups = selectGroups(run, compatibility);
    const keys = getTrainableKeys(profile, groups);
    if (keys.length === 0) {
        throw new RangeError(
            `Aucune pondération entraînable pour « ${profile} » dans ces groupes.`,
        );
    }
    const { requestedGroups } = run;
    if (
        requestedGroups &&
        compatibility?.affectedGroups.some((group) => !requestedGroups.includes(group))
    ) {
        options.onNotice?.(
            `${profile} : les groupes modifiés hors périmètre resteront inchangés et devront être validés.`,
        );
    }

    const evaluateOn =
        (seeds: readonly number[]): Evaluate =>
        (weights) =>
            evaluateWeights(
                profile,
                weights,
                seeds,
                options.maxTurns,
                configuration,
                board,
                options.simulationRunner,
            );
    const evaluateTraining = memoize(evaluateOn(partitions.trainingSeeds));
    const evaluateValidation = memoize(evaluateOn(partitions.validationSeeds));

    const defaults = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
    const random = createSeededRandom((options.seed ^ BOT_PROFILES.indexOf(profile)) >>> 0);
    const population = createInitialPopulation(
        mode,
        defaults,
        previous,
        options.populationSize,
        keys,
        random,
    );
    const trainingCandidates = await evolve(options, population, keys, random, evaluateTraining);
    const bestTraining = selectBest(trainingCandidates);

    const selectionCandidates = await evaluateSelection(evaluateOn(partitions.selectionSeeds), [
        ["default", defaults],
        ...(previous ? [["previous", previous] as const] : []),
        ["candidate", bestTraining.weights],
    ]);
    const selected = selectBest(selectionCandidates);
    const findSelection = (weights: BotStrategyWeights): TrainingEvaluation | undefined =>
        selectionCandidates.find((candidate) => equalWeights(candidate.weights, weights))
            ?.evaluation;

    const baselineValidation = await evaluateValidation(defaults);
    const candidateValidation = await evaluateValidation(bestTraining.weights);
    const previousValidation = previous && (await evaluateValidation(previous));
    const reference = selectBest(
        selectionCandidates.filter((candidate) => candidate.source !== "candidate"),
    );
    const candidateVsReference = getPairedScoreDifference(
        candidateValidation,
        await evaluateValidation(reference.weights),
    );
    const validationImproved =
        selected.source === "candidate" &&
        !equalWeights(bestTraining.weights, reference.weights) &&
        candidateVsReference.mean > 0 &&
        candidateVsReference.confidenceInterval.lower > 0;

    const baselineTraining = await evaluateTraining(defaults);
    const previousTraining = previous && (await evaluateTraining(previous));
    const previousSelection = previous && findSelection(previous);
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
        run.createdAt,
    );

    return {
        metadata,
        ...(compatibility && { compatibility }),
        groupsTrained: [...groups],
        opponents: BOT_PROFILES.filter((opponent) => opponent !== profile),
        initialPopulation: population,
        candidateEvaluations: trainingCandidates.length,
        baselineTraining: baselineTraining.metrics,
        candidateTraining: bestTraining.evaluation.metrics,
        ...(previousTraining && { previousTraining: previousTraining.metrics }),
        baselineSelection: findSelection(defaults)!.metrics,
        candidateSelection: findSelection(bestTraining.weights)!.metrics,
        ...(previousSelection && { previousSelection: previousSelection.metrics }),
        baselineValidation: baselineValidation.metrics,
        candidateValidation: candidateValidation.metrics,
        ...(previousValidation && { previousValidation: previousValidation.metrics }),
        candidateVsReference,
        validationImproved,
        promotedFrom: validationImproved ? "candidate" : reference.source,
        candidateWeights: bestTraining.weights,
        weights: validationImproved ? bestTraining.weights : reference.weights,
    };
}
