import type { BotProfile, BotStrategyWeights } from "../../game/botStrategy";
import type { BoardDefinition } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { PairedScoreDifference, TrainingMetrics, TrainingSimulationRunner } from "./metrics";
import type {
    BotTrainingMetadata,
    BotWeightGroup,
    TrainingCompatibility,
    TrainingFingerprint,
    TrainingMode,
} from "./versioning";

export type WeightSource = "default" | "previous" | "candidate";

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

export interface InitialPopulationMember {
    origin: "default" | "previous" | "mutation-of-default" | "mutation-of-previous";
    weights: BotStrategyWeights;
}

export interface TrainedProfileReport {
    metadata: BotTrainingMetadata;
    compatibility?: TrainingCompatibility;
    groupsTrained: BotWeightGroup[];
    opponents: BotProfile[];
    initialPopulation: InitialPopulationMember[];
    candidateEvaluations: number;
    baselineTraining: TrainingMetrics;
    candidateTraining: TrainingMetrics;
    previousTraining?: TrainingMetrics;
    baselineSelection: TrainingMetrics;
    candidateSelection: TrainingMetrics;
    previousSelection?: TrainingMetrics;
    baselineValidation: TrainingMetrics;
    candidateValidation: TrainingMetrics;
    previousValidation?: TrainingMetrics;
    candidateVsReference: PairedScoreDifference;
    validationImproved: boolean;
    promotedFrom: WeightSource;
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
