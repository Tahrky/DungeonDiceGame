import type { GameConfiguration } from "../../game/gameConfiguration";
import type { SavedSimulationChunk } from "../../persistence/simulationRun";
import type { SimulationBatchResult, SimulationOptions } from "../../simulation/types";
import {
    getSimulationWorkerCount,
    type SimulationChunk,
    type SimulationWorkerRequest,
    type SimulationWorkerResponse,
} from "../../simulation/workerPool";
import { formatFailure, getErrorMessage } from "../../utils/errors";

interface WorkerPoolParams {
    readonly options: SimulationOptions;
    readonly configuration: GameConfiguration;
    readonly pendingChunks: readonly SimulationChunk[];
    readonly completedResults: readonly SimulationBatchResult[];
    readonly onProgress: (completedGames: number, workerCount: number) => void;
    readonly onChunkComplete: (
        chunk: SimulationChunk,
        result: SimulationBatchResult,
    ) => Promise<void>;
}

export interface WorkerPool {
    readonly workerCount: number;
    readonly results: readonly SimulationBatchResult[];
    readonly done: Promise<boolean>;
    readonly cancel: () => void;
}

export function countMatches(results: readonly SimulationBatchResult[]): number {
    return results.reduce((total, result) => total + result.matches.length, 0);
}

export function splitSavedChunks(
    chunks: readonly SimulationChunk[],
    savedChunks: readonly SavedSimulationChunk[],
): { results: SimulationBatchResult[]; pendingChunks: SimulationChunk[] } {
    const results: SimulationBatchResult[] = [];
    const completedIndices = new Set<number>();
    for (const saved of savedChunks) {
        const chunk = chunks.find((candidate) => candidate.startIndex === saved.startIndex);
        if (
            !chunk ||
            saved.result.matches.length !== chunk.games ||
            completedIndices.has(saved.startIndex)
        ) {
            throw new Error("Un lot sauvegardé ne correspond pas à la simulation.");
        }
        completedIndices.add(saved.startIndex);
        results.push(saved.result);
    }
    return {
        results,
        pendingChunks: chunks.filter((chunk) => !completedIndices.has(chunk.startIndex)),
    };
}

export function getLeadingResults(
    chunks: readonly SimulationChunk[],
    results: readonly SimulationBatchResult[],
): SimulationBatchResult[] {
    const leadingResults: SimulationBatchResult[] = [];
    for (const chunk of chunks) {
        const result = results.find(
            (candidate) => candidate.matches[0]?.id === chunk.startIndex + 1,
        );
        if (!result) break;
        leadingResults.push(result);
    }
    return leadingResults;
}

function createWorkers(chunks: readonly SimulationChunk[]): Worker[] {
    if (chunks.length === 0) return [];
    const games = chunks.reduce((total, chunk) => total + chunk.games, 0);
    const count = Math.min(
        getSimulationWorkerCount(games, navigator.hardwareConcurrency ?? 2),
        chunks.length,
    );
    const workers: Worker[] = [];
    try {
        for (let index = 0; index < count; index++) {
            workers.push(
                new Worker(new URL("../../simulation/simulation.worker.ts", import.meta.url), {
                    type: "module",
                }),
            );
        }
    } catch (error) {
        workers.forEach((worker) => worker.terminate());
        throw error;
    }
    return workers;
}

export function startWorkerPool({
    options,
    configuration,
    pendingChunks,
    completedResults,
    onProgress,
    onChunkComplete,
}: WorkerPoolParams): WorkerPool {
    const workers = createWorkers(pendingChunks);
    const results = [...completedResults];
    const queue = [...pendingChunks];
    const chunkProgress = new Map<number, number>();
    let finishedGames = countMatches(results);
    let remainingWorkers = workers.length;
    let isActive = true;
    let resolveDone: (completed: boolean) => void = () => undefined;
    let rejectDone: (error: Error) => void = () => undefined;
    const done = new Promise<boolean>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });

    function stop(): void {
        isActive = false;
        workers.forEach((worker) => worker.terminate());
    }

    function fail(message: string): void {
        if (!isActive) return;
        stop();
        rejectDone(new Error(message));
    }

    function reportProgress(): void {
        onProgress(
            finishedGames + [...chunkProgress.values()].reduce((sum, games) => sum + games, 0),
            workers.length,
        );
    }

    function handleChunkResult(
        worker: Worker,
        chunk: SimulationChunk,
        result: SimulationBatchResult,
    ): void {
        chunkProgress.delete(chunk.startIndex);
        results.push(result);
        finishedGames += chunk.games;
        onChunkComplete(chunk, result)
            .then(() => {
                if (!isActive) return;
                reportProgress();
                runNextChunk(worker);
            })
            .catch((error: unknown) =>
                fail(
                    formatFailure(
                        "Sauvegarde du lot impossible",
                        error,
                        "Sauvegarde du lot de simulation impossible.",
                    ),
                ),
            );
    }

    function handleResponse(
        worker: Worker,
        chunk: SimulationChunk,
        response: SimulationWorkerResponse,
    ): void {
        if (response.startIndex !== chunk.startIndex) {
            fail("Le worker a renvoyé un lot inattendu.");
        } else if (response.type === "error") {
            fail(response.message);
        } else if (response.type === "progress") {
            const previous = chunkProgress.get(chunk.startIndex) ?? 0;
            if (
                !Number.isInteger(response.completedGames) ||
                response.completedGames <= previous ||
                response.completedGames > chunk.games
            ) {
                fail("Le worker a renvoyé une progression de lot invalide.");
                return;
            }
            chunkProgress.set(chunk.startIndex, response.completedGames);
            reportProgress();
        } else if (response.result.matches.length !== chunk.games) {
            fail("Un worker n’a pas renvoyé tous les matchs de son lot.");
        } else {
            handleChunkResult(worker, chunk, response.result);
        }
    }

    function runNextChunk(worker: Worker): void {
        if (!isActive) return;
        const chunk = queue.shift();
        if (!chunk) {
            worker.terminate();
            remainingWorkers--;
            if (remainingWorkers === 0) {
                stop();
                resolveDone(true);
            }
            return;
        }

        worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
            if (isActive) handleResponse(worker, chunk, event.data);
        };
        worker.onerror = (event: ErrorEvent) => {
            event.preventDefault();
            fail(event.message || "Un worker de simulation a rencontré une erreur.");
        };
        worker.onmessageerror = () => fail("Une réponse de worker est illisible.");

        const request: SimulationWorkerRequest = {
            options: { ...options, games: chunk.games },
            configuration,
            startIndex: chunk.startIndex,
        };
        try {
            worker.postMessage(request);
        } catch (error) {
            fail(getErrorMessage(error, "Impossible d’envoyer un lot au worker."));
        }
    }

    workers.forEach(runNextChunk);
    if (workers.length === 0) resolveDone(true);

    return {
        workerCount: workers.length,
        results,
        done,
        cancel: () => {
            stop();
            resolveDone(false);
        },
    };
}
