import type { GameConfiguration } from "../game/gameConfiguration";
import type { PlayerId } from "../types/GameTypes";
import {
    BOT_PROFILES,
    type BotProfile,
    type ProfilePair,
    type SimulationBatchResult,
    type SimulationOptions,
} from "./types";

export const MAX_SIMULATION_WORKERS = 4;

export const CROSS_PROFILE_MATCHUP_COUNT = BOT_PROFILES.length * (BOT_PROFILES.length - 1);

const CHUNKS_PER_WORKER = 4;

export function createCrossProfilePairs(): ProfilePair[] {
    return BOT_PROFILES.flatMap((profile1) =>
        BOT_PROFILES.filter((profile2) => profile2 !== profile1).map((profile2) => ({
            profile1,
            profile2,
        })),
    );
}

export interface SimulationChunk {
    readonly startIndex: number;
    readonly games: number;
}

export interface SimulationWorkerRequest {
    readonly options: SimulationOptions;
    readonly configuration: GameConfiguration;
    readonly startIndex: number;
}

export type SimulationWorkerResponse =
    | {
          readonly type: "progress";
          readonly startIndex: number;
          readonly completedGames: number;
      }
    | {
          readonly type: "complete";
          readonly startIndex: number;
          readonly result: SimulationBatchResult;
      }
    | {
          readonly type: "error";
          readonly startIndex: number;
          readonly message: string;
      };

export function getSimulationWorkerCount(games: number, hardwareConcurrency: number): number {
    if (!Number.isInteger(games) || games < 1) {
        throw new RangeError("Le nombre de matchs doit être un entier positif.");
    }

    const availableCores = Number.isFinite(hardwareConcurrency)
        ? Math.floor(hardwareConcurrency)
        : 2;
    return Math.min(games, MAX_SIMULATION_WORKERS, Math.max(1, availableCores - 1));
}

export function createSimulationChunks(games: number, workerCount: number): SimulationChunk[] {
    if (!Number.isInteger(games) || games < 1) {
        throw new RangeError("Le nombre de matchs doit être un entier positif.");
    }
    if (
        !Number.isInteger(workerCount) ||
        workerCount < 1 ||
        workerCount > Math.min(games, MAX_SIMULATION_WORKERS)
    ) {
        throw new RangeError("Le nombre de workers demandé est invalide.");
    }

    const chunkSize = Math.ceil(games / (workerCount * CHUNKS_PER_WORKER));
    const chunks: SimulationChunk[] = [];
    for (let startIndex = 0; startIndex < games; startIndex += chunkSize) {
        chunks.push({
            startIndex,
            games: Math.min(chunkSize, games - startIndex),
        });
    }
    return chunks;
}

export function mergeSimulationResults(
    results: readonly SimulationBatchResult[],
    options: SimulationOptions,
): SimulationBatchResult {
    const firstResult = results[0];
    if (!firstResult) throw new Error("Aucun résultat de worker à fusionner.");

    const matches = results.flatMap((result) => result.matches).sort((a, b) => a.id - b.id);
    if (matches.length !== options.games) {
        throw new Error("Le nombre de matchs reçus ne correspond pas à la demande.");
    }
    if (matches.some((match, index) => match.id !== index + 1)) {
        throw new Error("Les résultats de workers ne couvrent pas tous les matchs attendus.");
    }

    const wins: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const winsByStartingPlayer: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const winsByProfile: Partial<Record<BotProfile, number>> = {};
    let draws = 0;
    let totalTurns = 0;

    for (const match of matches) {
        totalTurns += match.turns;
        if (match.winner === null) {
            draws++;
            continue;
        }

        wins[match.winner]++;
        if (match.winner === match.startingPlayer) winsByStartingPlayer[match.startingPlayer]++;
        const winnerProfile = match.profiles[match.winner];
        winsByProfile[winnerProfile] = (winsByProfile[winnerProfile] ?? 0) + 1;
    }

    return {
        ...firstResult,
        createdAt: new Date().toISOString(),
        options,
        summary: {
            matches: matches.length,
            wins,
            winsByStartingPlayer,
            draws,
            averageTurns: totalTurns / matches.length,
            winsByProfile: Object.fromEntries(
                BOT_PROFILES.flatMap((profile) =>
                    winsByProfile[profile] === undefined
                        ? []
                        : [[profile, winsByProfile[profile]!]],
                ),
            ),
        },
        matches,
    };
}
