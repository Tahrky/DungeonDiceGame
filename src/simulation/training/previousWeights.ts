import { BOT_PROFILES, parseBotStrategyWeightMap } from "../../game/botStrategy";
import type { BotProfile, BotStrategyWeightMap } from "../../game/botStrategy";
import { isPlainRecord } from "../../utils/guards";
import type { BotTrainingMetadata } from "./versioning";

export interface PreviousWeights {
    values: BotStrategyWeightMap;
    metadata: Partial<Record<BotProfile, Partial<BotTrainingMetadata>>>;
    trainingId?: string;
}

export function readPreviousWeights(value: unknown): PreviousWeights {
    const report = isPlainRecord(value) ? value : null;
    const values = parseBotStrategyWeightMap(
        report && "weights" in report ? report.weights : value,
    );
    if (!values) throw new RangeError("Le rapport précédent ne contient pas de poids valides.");

    const profileReports = report && isPlainRecord(report.profiles) ? report.profiles : {};
    const reportMetadata = report && isPlainRecord(report.metadata) ? report.metadata : undefined;
    const metadata: PreviousWeights["metadata"] = {};
    for (const profile of BOT_PROFILES) {
        const profileReport = profileReports[profile];
        const profileMetadata =
            isPlainRecord(profileReport) && isPlainRecord(profileReport.metadata)
                ? profileReport.metadata
                : reportMetadata;
        if (profileMetadata) metadata[profile] = profileMetadata as Partial<BotTrainingMetadata>;
    }
    const trainingId =
        report && typeof report.trainingId === "string" ? report.trainingId : undefined;
    return { values, metadata, ...(trainingId === undefined ? {} : { trainingId }) };
}
