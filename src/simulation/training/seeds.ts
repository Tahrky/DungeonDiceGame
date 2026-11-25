import { createSeededRandom } from "../../game/random";
import type { SeedPartitions } from "./types";

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
    const allocate = (salt: number, count: number): number[] => {
        const random = createSeededRandom(seed ^ salt);
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
        trainingSeeds: allocate(0x13579bdf, trainingSeedCount),
        selectionSeeds: allocate(0x2468ace0, selectionSeedCount),
        validationSeeds: allocate(0x9e3779b9, validationSeedCount),
    };
}
