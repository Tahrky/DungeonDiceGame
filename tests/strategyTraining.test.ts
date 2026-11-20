import { describe, expect, it } from "vitest";
import {
    createTrainingSeedPartitions,
    trainBotStrategies,
} from "../src/simulation/strategyTraining";

describe("apprentissage hors ligne des stratégies", () => {
    it("sépare reproductiblement les seeds de réglage et de validation", () => {
        const first = createTrainingSeedPartitions(731, 4, 3);
        const second = createTrainingSeedPartitions(731, 4, 3);
        const trainingMatchSeeds = new Set(
            first.trainingSeeds.flatMap((seed) => [seed, (seed + 1) >>> 0]),
        );
        const validationMatchSeeds = first.validationSeeds.flatMap((seed) => [
            seed,
            (seed + 1) >>> 0,
        ]);

        expect(first).toEqual(second);
        expect(validationMatchSeeds.some((seed) => trainingMatchSeeds.has(seed))).toBe(false);
    });

    it("produit le même candidat avec le même budget et ne choisit que sur les seeds d’entraînement", () => {
        const options = {
            seed: 731,
            maxTurns: 1,
            trainingSeedCount: 1,
            validationSeedCount: 1,
            generations: 1,
            populationSize: 1,
            profiles: ["balanced"] as const,
        };
        const first = trainBotStrategies(options);
        const second = trainBotStrategies(options);
        const firstProfile = first.profiles.balanced;
        const secondProfile = second.profiles.balanced;
        if (!firstProfile || !secondProfile) throw new Error("Rapport d’entraînement attendu.");

        expect(first.trainingSeeds).toEqual(second.trainingSeeds);
        expect(first.validationSeeds).toEqual(second.validationSeeds);
        expect(first.weights).toEqual(second.weights);
        expect(firstProfile.candidateTraining).toMatchObject({
            matches: 6,
            wins: secondProfile.candidateTraining.wins,
            draws: secondProfile.candidateTraining.draws,
            losses: secondProfile.candidateTraining.losses,
            score: secondProfile.candidateTraining.score,
        });
        expect(firstProfile.candidateValidation).toMatchObject({
            matches: 6,
            wins: secondProfile.candidateValidation.wins,
            draws: secondProfile.candidateValidation.draws,
            losses: secondProfile.candidateValidation.losses,
            score: secondProfile.candidateValidation.score,
        });
        expect(firstProfile.candidateEvaluations).toBe(2);
    });
});
