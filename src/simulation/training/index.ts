import type { BotProfile, BotStrategyWeights } from "../../game/botStrategy";
import { getDefaultBoard } from "../../game/boards";
import { getDefaultGameConfiguration } from "../../game/gameConfiguration";
import { validateOptions } from "./options";
import { readPreviousWeights } from "./previousWeights";
import { trainProfile, type TrainingRun } from "./profileTraining";
import { createTrainingSeedPartitions } from "./seeds";
import type {
    StrategyTrainingOptions,
    StrategyTrainingReport,
    TrainedProfileReport,
} from "./types";
import {
    ALL_WEIGHT_GROUPS,
    createTrainingFingerprint,
    TRAINING_REPORT_SCHEMA_VERSION,
} from "./versioning";

export { createTrainingSeedPartitions };
export type { StrategyTrainingOptions, StrategyTrainingReport, TrainedProfileReport };

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
    const run: TrainingRun = {
        options,
        mode,
        configuration,
        board,
        fingerprint,
        partitions,
        createdAt,
        ...(requestedGroups === undefined ? {} : { requestedGroups }),
        ...(previousSource === undefined ? {} : { previousSource }),
    };

    const weights: Partial<Record<BotProfile, BotStrategyWeights>> = {};
    const reports: Partial<Record<BotProfile, TrainedProfileReport>> = {};
    for (const profile of profiles) {
        const report = await trainProfile(run, profile);
        reports[profile] = report;
        weights[profile] = report.weights;
        options.onProfileComplete?.(profile, report);
    }

    return {
        schemaVersion: TRAINING_REPORT_SCHEMA_VERSION,
        trainingId: reports[profiles[0]!]!.metadata.trainingId,
        createdAt,
        initializationMode: mode,
        groups: requestedGroups ?? ALL_WEIGHT_GROUPS,
        seed: options.seed,
        maxTurns: options.maxTurns,
        ...partitions,
        fingerprint,
        configuration,
        board,
        weights,
        profiles: reports,
        elapsedMs: performance.now() - startedAt,
    };
}
