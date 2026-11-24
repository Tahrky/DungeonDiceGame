import { describe, expect, it } from "vitest";
import {
    createTrainingSeedPartitions,
    trainBotStrategies,
} from "../src/simulation/strategyTraining";
import { BOT_WEIGHT_GROUPS } from "../src/simulation/trainingVersioning";
import { DEFAULT_BOT_STRATEGY_WEIGHTS } from "../src/game/botStrategy";
import { getDefaultBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { runSimulations } from "../src/simulation/simulator";
import {
    evaluateWeights,
    type TrainingSimulationRunner,
} from "../src/simulation/trainingMetrics";

describe("apprentissage hors ligne des stratégies", () => {
    it("sépare reproductiblement les trois partitions de seeds", () => {
        const first = createTrainingSeedPartitions(731, 4, 3);
        const second = createTrainingSeedPartitions(731, 4, 3);
        const matchSeeds = (seeds: number[]) =>
            new Set(seeds.flatMap((seed) => [seed, (seed + 1) >>> 0]));
        const partitions = [
            matchSeeds(first.trainingSeeds),
            matchSeeds(first.selectionSeeds),
            matchSeeds(first.validationSeeds),
        ];

        expect(first).toEqual(second);
        for (let firstIndex = 0; firstIndex < partitions.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < partitions.length; secondIndex++) {
                expect(
                    [...partitions[firstIndex]!].some((seed) => partitions[secondIndex]!.has(seed)),
                ).toBe(false);
            }
        }
    });

    it("borne les lots de simulation parallèles pendant l'évaluation", async () => {
        let activeRuns = 0;
        let peakActiveRuns = 0;
        const runner: TrainingSimulationRunner = async (options, configuration, board) => {
            activeRuns++;
            peakActiveRuns = Math.max(peakActiveRuns, activeRuns);
            await Promise.resolve();
            try {
                return runSimulations(options, configuration, board);
            } finally {
                activeRuns--;
            }
        };

        await evaluateWeights(
            "balanced",
            DEFAULT_BOT_STRATEGY_WEIGHTS,
            [731],
            1,
            getDefaultGameConfiguration(),
            getDefaultBoard(),
            runner,
        );

        expect(peakActiveRuns).toBe(4);
    });

    it("cible les adversaires qui révèlent les faiblesses des profils", async () => {
        const report = await trainBotStrategies({
            seed: 731,
            maxTurns: 1,
            trainingSeedCount: 1,
            validationSeedCount: 1,
            generations: 0,
            populationSize: 1,
            profiles: ["cheap", "support"],
        });

        expect(report.profiles.cheap?.opponents).toEqual([
            "balanced",
            "expensive",
            "offensive",
            "support",
            "defensive",
            "tracker",
            "random",
            "random-deck",
            "random-strategy",
            "greedy",
        ]);
        expect(report.profiles.support?.opponents).toEqual([
            "balanced",
            "cheap",
            "expensive",
            "offensive",
            "defensive",
            "tracker",
            "random",
            "random-deck",
            "random-strategy",
            "greedy",
        ]);
    });

    it("reproduit les résultats et sépare l’optimisation de la sélection", async () => {
        const options = {
            seed: 731,
            maxTurns: 1,
            trainingSeedCount: 1,
            validationSeedCount: 1,
            generations: 1,
            populationSize: 1,
            profiles: ["balanced"] as const,
        };
        const first = await trainBotStrategies(options);
        const second = await trainBotStrategies(options);
        const firstProfile = first.profiles.balanced;
        const secondProfile = second.profiles.balanced;
        if (!firstProfile || !secondProfile) throw new Error("Rapport d’entraînement attendu.");

        expect(first.trainingSeeds).toEqual(second.trainingSeeds);
        expect(first.selectionSeeds).toEqual(second.selectionSeeds);
        expect(first.validationSeeds).toEqual(second.validationSeeds);
        expect(first.weights).toEqual(second.weights);
        expect(firstProfile.opponents).toEqual([
            "cheap",
            "expensive",
            "offensive",
            "support",
            "defensive",
            "tracker",
            "random",
            "random-deck",
            "random-strategy",
            "greedy",
        ]);
        expect(firstProfile.candidateTraining).toMatchObject({
            matches: 20,
            wins: secondProfile.candidateTraining.wins,
            draws: secondProfile.candidateTraining.draws,
            losses: secondProfile.candidateTraining.losses,
            score: secondProfile.candidateTraining.score,
        });
        expect(firstProfile.candidateValidation).toMatchObject({
            matches: 20,
            wins: secondProfile.candidateValidation.wins,
            draws: secondProfile.candidateValidation.draws,
            losses: secondProfile.candidateValidation.losses,
            score: secondProfile.candidateValidation.score,
        });
        expect(firstProfile.candidateEvaluations).toBe(2);
        expect(firstProfile.initialPopulation).toEqual([
            { origin: "default", weights: { ...DEFAULT_BOT_STRATEGY_WEIGHTS } },
        ]);
    });

    it("conserve les défauts et limite les mutations aux groupes sélectionnés", async () => {
        const defaultsBefore = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
        const report = await trainBotStrategies({
            seed: 731,
            maxTurns: 1,
            trainingSeedCount: 1,
            selectionSeedCount: 1,
            validationSeedCount: 1,
            generations: 0,
            populationSize: 1,
            profiles: ["balanced"],
            groups: ["combat"],
        });
        const profile = report.profiles.balanced;
        if (!profile) throw new Error("Rapport d’entraînement attendu.");

        expect(DEFAULT_BOT_STRATEGY_WEIGHTS).toEqual(defaultsBefore);
        expect(profile.groupsTrained).toEqual(["combat"]);
        for (const group of Object.keys(BOT_WEIGHT_GROUPS) as (keyof typeof BOT_WEIGHT_GROUPS)[]) {
            if (group === "combat") continue;
            for (const key of BOT_WEIGHT_GROUPS[group]) {
                expect(profile.candidateWeights[key]).toBe(DEFAULT_BOT_STRATEGY_WEIGHTS[key]);
            }
        }
    });

    it("reprend un rapport compatible et hybride les poids précédents et neutres", async () => {
        const baseOptions = {
            seed: 731,
            maxTurns: 1,
            trainingSeedCount: 1,
            selectionSeedCount: 1,
            validationSeedCount: 1,
            generations: 0,
            populationSize: 1,
            profiles: ["balanced"] as const,
        };
        const previous = await trainBotStrategies(baseOptions);
        const warmStart = await trainBotStrategies({
            ...baseOptions,
            initializationMode: "warmStart",
            previousWeights: previous,
        });
        const hybrid = await trainBotStrategies({
            ...baseOptions,
            populationSize: 5,
            initializationMode: "hybrid",
            previousWeights: previous,
        });
        const previousProfile = previous.profiles.balanced;
        if (!previousProfile) throw new Error("Rapport précédent attendu.");
        const incompatiblePrevious = {
            ...previous,
            profiles: {
                ...previous.profiles,
                balanced: {
                    ...previousProfile,
                    metadata: {
                        ...previousProfile.metadata,
                        rulesEngineVersion: "obsolete",
                    },
                },
            },
        };
        const partialPrevious = {
            ...previous,
            profiles: {
                ...previous.profiles,
                balanced: {
                    ...previousProfile,
                    metadata: {
                        ...previousProfile.metadata,
                        placementPatternsHash: "modified-patterns",
                    },
                },
            },
        };
        const partialTransfer = await trainBotStrategies({
            ...baseOptions,
            initializationMode: "warmStart",
            previousWeights: partialPrevious,
        });
        const forcedTransfer = await trainBotStrategies({
            ...baseOptions,
            initializationMode: "warmStart",
            previousWeights: incompatiblePrevious,
            allowIncompatibleTransfer: true,
        });
        const warmProfile = warmStart.profiles.balanced;
        const hybridProfile = hybrid.profiles.balanced;
        const partialProfile = partialTransfer.profiles.balanced;
        const forcedProfile = forcedTransfer.profiles.balanced;
        if (!warmProfile || !hybridProfile || !partialProfile || !forcedProfile) {
            throw new Error("Rapport d’entraînement attendu.");
        }

        expect(warmProfile.compatibility?.level).toBe("exact");
        expect(warmProfile.initialPopulation).toEqual([
            { origin: "previous", weights: previous.weights.balanced },
        ]);
        expect(new Set(hybridProfile.initialPopulation.map(({ origin }) => origin))).toEqual(
            new Set(["default", "previous", "mutation-of-default", "mutation-of-previous"]),
        );
        expect(hybridProfile.initialPopulation).toHaveLength(5);
        expect(partialProfile.compatibility?.level).toBe("partial");
        expect(partialProfile.groupsTrained).toEqual(["economy", "placement"]);
        expect(forcedProfile.compatibility?.level).toBe("incompatible");
    });

    it("refuse le transfert legacy sans autorisation explicite", async () => {
        const previousWeights = { balanced: { ...DEFAULT_BOT_STRATEGY_WEIGHTS } };
        await expect(
            trainBotStrategies({
                seed: 731,
                maxTurns: 1,
                trainingSeedCount: 1,
                selectionSeedCount: 1,
                validationSeedCount: 1,
                generations: 0,
                populationSize: 1,
                profiles: ["balanced"],
                initializationMode: "warmStart",
                previousWeights,
            }),
        ).rejects.toThrow(/Transfert refusé.*legacy/);
    });
});
