import {
    BOT_STRATEGY_WEIGHT_KEYS,
    MAX_BOT_STRATEGY_WEIGHT,
    MIN_BOT_STRATEGY_WEIGHT,
} from "../../game/botStrategy";
import type { BotProfile, BotStrategyWeights } from "../../game/botStrategy";
import { pickIndex, shuffle } from "../../game/random";
import { BOT_WEIGHT_GROUPS, type BotWeightGroup, type TrainingMode } from "./versioning";
import type { InitialPopulationMember } from "./types";

export type WeightKey = (typeof BOT_STRATEGY_WEIGHT_KEYS)[number];

const OPTIONAL_WEIGHT_KEYS: readonly WeightKey[] = [
    "support",
    "monsterOffense",
    "monsterSupport",
    "monsterDurability",
];

const SUPPORT_AND_DURABILITY: readonly WeightKey[] = ["support", "monsterDurability"];
const OFFENSE_AND_DURABILITY: readonly WeightKey[] = ["monsterOffense", "monsterDurability"];

// Les autres pondérations sont entraînables pour tous les profils.
const PROFILE_OPTIONAL_KEYS: Record<BotProfile, readonly WeightKey[]> = {
    balanced: SUPPORT_AND_DURABILITY,
    cheap: ["support"],
    expensive: ["support"],
    offensive: OFFENSE_AND_DURABILITY,
    support: ["support", "monsterOffense", "monsterSupport"],
    defensive: OFFENSE_AND_DURABILITY,
    tracker: OFFENSE_AND_DURABILITY,
    random: SUPPORT_AND_DURABILITY,
    "random-deck": SUPPORT_AND_DURABILITY,
    "random-strategy": SUPPORT_AND_DURABILITY,
    greedy: OFFENSE_AND_DURABILITY,
};

export function getTrainableKeys(
    profile: BotProfile,
    groups: readonly BotWeightGroup[],
): WeightKey[] {
    const isTrainable = (key: WeightKey) =>
        !OPTIONAL_WEIGHT_KEYS.includes(key) || PROFILE_OPTIONAL_KEYS[profile].includes(key);
    return [...new Set(groups.flatMap((group) => BOT_WEIGHT_GROUPS[group]).filter(isTrainable))];
}

export function equalWeights(first: BotStrategyWeights, second: BotStrategyWeights): boolean {
    return (
        JSON.stringify(first, Object.keys(first).sort()) ===
        JSON.stringify(second, Object.keys(second).sort())
    );
}

export function mutateWeights(
    source: BotStrategyWeights,
    keys: readonly WeightKey[],
    random: () => number,
    generation: number,
    maximumChangedKeys = generation > 2 ? 1 : 2,
): BotStrategyWeights {
    if (keys.length === 0) return { ...source };
    const result = { ...source };
    const shuffled = shuffle(keys, random);
    const mutationCount = Math.min(
        keys.length,
        maximumChangedKeys === 1 ? 1 : 1 + pickIndex(random(), maximumChangedKeys),
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
        result[key] = candidates[pickIndex(random(), candidates.length)]!;
    }
    return result;
}

export function createInitialPopulation(
    mode: TrainingMode,
    defaults: BotStrategyWeights,
    previous: BotStrategyWeights | undefined,
    populationSize: number,
    keys: readonly WeightKey[],
    random: () => number,
): InitialPopulationMember[] {
    const population: InitialPopulationMember[] = [];
    if (mode !== "warmStart" || !previous) {
        population.push({ origin: "default", weights: defaults });
    }
    if (mode !== "default" && previous) {
        population.push({ origin: "previous", weights: { ...previous } });
    }
    if (mode === "hybrid" && previous) {
        population.push(
            {
                origin: "mutation-of-previous",
                weights: mutateWeights(previous, keys, random, 0),
            },
            {
                origin: "mutation-of-default",
                weights: mutateWeights(defaults, keys, random, 0),
            },
            {
                origin: "mutation-of-default",
                weights: mutateWeights(defaults, keys, random, 0, 4),
            },
        );
    }

    while (population.length < populationSize) {
        const fromPrevious =
            previous !== undefined &&
            (mode === "warmStart" || (mode === "hybrid" && random() < 0.5));
        population.push({
            origin: fromPrevious ? "mutation-of-previous" : "mutation-of-default",
            weights: mutateWeights(fromPrevious ? previous : defaults, keys, random, 0),
        });
    }
    return population.slice(0, populationSize);
}
