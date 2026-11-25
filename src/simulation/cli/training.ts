import { resolve } from "node:path";
import type { BoardDefinition } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { trainBotStrategies, type TrainedProfileReport } from "../training";
import type { TrainingSimulationRunner } from "../training/metrics";
import { BOT_PROFILES } from "../types";
import {
    getOptionalValue,
    parseProfileList,
    parseTrainingMode,
    parseWeightGroups,
    readIntegerOption,
    readOption,
} from "./arguments";
import { loadPreviousWeights, writeNewJsonFile } from "./files";

function formatProfileResult(profile: string, result: TrainedProfileReport): string {
    const { lower, upper } = result.candidateVsReference.confidenceInterval;
    const decision = result.validationImproved
        ? "candidat retenu"
        : `poids ${result.promotedFrom} conservés`;
    return (
        `${profile} : validation ${result.baselineValidation.score.toFixed(3)} → ` +
        `${result.candidateValidation.score.toFixed(3)}; ` +
        `delta apparié ${result.candidateVsReference.mean.toFixed(3)} ` +
        `[${lower.toFixed(3)}, ${upper.toFixed(3)}]; ${decision}`
    );
}

export async function runBotTraining(
    args: string[],
    configuration: GameConfiguration,
    board: BoardDefinition,
    simulationRunner: TrainingSimulationRunner,
): Promise<void> {
    const initializationMode = parseTrainingMode(readOption(args, "--training-mode", "default"));
    const profiles = parseProfileList(
        readOption(args, "--training-profiles", BOT_PROFILES.join(",")),
    );
    const previousWeights = await loadPreviousWeights(getOptionalValue(args, "--previous-weights"));
    const groupsValue = getOptionalValue(args, "--training-groups");
    const report = await trainBotStrategies({
        seed: readIntegerOption(args, "--seed", 731, 0, 0xffff_ffff),
        maxTurns: readIntegerOption(args, "--max-turns", 10, 1, 10000),
        trainingSeedCount: readIntegerOption(args, "--training-seeds", 3, 1, 100),
        selectionSeedCount: readIntegerOption(args, "--selection-seeds", 3, 1, 100),
        validationSeedCount: readIntegerOption(args, "--validation-seeds", 3, 1, 100),
        generations: readIntegerOption(args, "--generations", 2, 0, 100),
        populationSize: readIntegerOption(
            args,
            "--population",
            initializationMode === "hybrid" ? 5 : 3,
            1,
            100,
        ),
        profiles,
        initializationMode,
        previousWeights,
        allowIncompatibleTransfer: args.includes("--allow-incompatible-transfer"),
        ...(groupsValue === undefined ? {} : { groups: parseWeightGroups(groupsValue) }),
        configuration,
        board,
        simulationRunner,
        onNotice: (message) => console.warn(`Avertissement : ${message}`),
        onProfileComplete: (profile, result) => console.log(formatProfileResult(profile, result)),
    });
    const output = getOptionalValue(args, "--output");
    const outputPath = await writeNewJsonFile(
        resolve(output ?? `simulation-results/bot-training-${report.trainingId}.json`),
        report,
        output === undefined,
    );
    console.log(
        `Entraînement ${report.trainingId} terminé en ${report.elapsedMs.toFixed(0)} ms. ` +
            `Rapport : ${outputPath}`,
    );
}
