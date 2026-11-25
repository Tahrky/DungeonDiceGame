import { BOT_PROFILES } from "../../game/botStrategy";
import type { BotProfile } from "../../game/botStrategy";
import type { StrategyTrainingOptions } from "./types";
import { ALL_WEIGHT_GROUPS, type BotWeightGroup, type TrainingMode } from "./versioning";

const MAX_CANDIDATE_EVALUATIONS = 64;
const TRAINING_MODES: readonly TrainingMode[] = ["default", "warmStart", "hybrid"];

function isDistinctSubset<T>(values: readonly T[], known: readonly T[]): boolean {
    return (
        values.length > 0 &&
        values.every((value) => known.includes(value)) &&
        new Set(values).size === values.length
    );
}

export function validateOptions(options: StrategyTrainingOptions): {
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
    if ((options.generations + 1) * options.populationSize > MAX_CANDIDATE_EVALUATIONS) {
        throw new RangeError(
            `Le budget maximal est de ${MAX_CANDIDATE_EVALUATIONS} évaluations candidates par profil.`,
        );
    }
    const mode = options.initializationMode ?? "default";
    if (!TRAINING_MODES.includes(mode)) {
        throw new RangeError("Le mode d’initialisation est invalide.");
    }
    if (mode === "hybrid" && options.populationSize < 5) {
        throw new RangeError("Le mode hybrid nécessite une population d’au moins cinq candidats.");
    }
    if (mode !== "default" && options.previousWeights === undefined) {
        throw new RangeError(`Le mode ${mode} nécessite --previous-weights.`);
    }
    const profiles = options.profiles ?? BOT_PROFILES;
    if (!isDistinctSubset(profiles, BOT_PROFILES)) {
        throw new RangeError("La liste des profils à entraîner est invalide.");
    }
    if (options.groups && !isDistinctSubset(options.groups, ALL_WEIGHT_GROUPS)) {
        throw new RangeError("Les groupes de pondérations sont invalides.");
    }
    return {
        profiles: [...profiles],
        mode,
        ...(options.groups === undefined ? {} : { groups: [...options.groups] }),
    };
}
