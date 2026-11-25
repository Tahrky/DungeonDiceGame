import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultBoard } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import {
    clearSimulationRun,
    loadSimulationChunks,
    loadSimulationRun,
    saveSimulationChunk,
    saveSimulationRun,
    type SavedSimulationChunk,
    type SavedSimulationRun,
} from "../../persistence/simulationRun";
import { formatElapsedDuration } from "../../simulation/formatElapsedDuration";
import type { SimulationBatchResult, SimulationOptions } from "../../simulation/types";
import {
    createSimulationChunks,
    getSimulationWorkerCount,
    mergeSimulationResults,
} from "../../simulation/workerPool";
import { formatFailure, getErrorMessage } from "../../utils/errors";
import type { SimulationOptionsResult } from "./simulationForm";
import {
    countMatches,
    getLeadingResults,
    splitSavedChunks,
    startWorkerPool,
} from "./simulationWorkerPool";

interface SimulationRunnerParams {
    readonly sessionId: string;
    readonly configuration: GameConfiguration;
    readonly onRunningChange: (running: boolean) => void;
    readonly onResult: (result: SimulationBatchResult) => void;
    readonly onRestore: (options: SimulationOptions) => void;
}

function getProgressNotice(completed: number, total: number, workerCount: number): string {
    return `Simulation en cours… ${completed}/${total} matchs terminés (${workerCount} workers).`;
}

export function useSimulationRunner({
    sessionId,
    configuration,
    onRunningChange,
    onResult,
    onRestore,
}: SimulationRunnerParams) {
    const cancelRef = useRef<(() => void) | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);

    useEffect(() => () => cancelRef.current?.(), []);

    const setRunning = useCallback(
        (running: boolean) => {
            setIsRunning(running);
            onRunningChange(running);
        },
        [onRunningChange],
    );

    const runSimulation = useCallback(
        async (
            run: SavedSimulationRun,
            savedChunks: readonly SavedSimulationChunk[],
            isResuming: boolean,
        ): Promise<void> => {
            const { options, chunks } = run;
            const startedAt = performance.now();
            const getDuration = () => formatElapsedDuration(performance.now() - startedAt);

            function finish(
                results: readonly SimulationBatchResult[],
                resultOptions: SimulationOptions,
                getNotice: (matches: number) => string,
                mergeFailure: string,
            ): void {
                setRunning(false);
                try {
                    const result = mergeSimulationResults(results, resultOptions);
                    setNotice(getNotice(result.summary.matches));
                    onResult(result);
                    void clearSimulationRun(sessionId).catch((clearError: unknown) =>
                        setError(
                            formatFailure(
                                "Impossible d’effacer la reprise",
                                clearError,
                                "Impossible d’effacer la reprise de simulation.",
                            ),
                        ),
                    );
                } catch (mergeError) {
                    setError(getErrorMessage(mergeError, mergeFailure));
                    setNotice("");
                }
            }

            function stopWithPartialResults(results: readonly SimulationBatchResult[]): void {
                const partialResults = getLeadingResults(chunks, results);
                if (partialResults.length === 0) {
                    setRunning(false);
                    setNotice("Simulation arrêtée avant qu’un match ne soit terminé.");
                    void clearSimulationRun(sessionId).catch(() => undefined);
                    return;
                }
                finish(
                    partialResults,
                    { ...options, games: countMatches(partialResults) },
                    (matches) =>
                        `Simulation arrêtée : ${matches} matchs terminés en ${getDuration()}.`,
                    "Impossible de regrouper les résultats partiels.",
                );
            }

            setError("");
            setRunning(true);
            try {
                if (!isResuming) await saveSimulationRun(sessionId, run);
                const { results, pendingChunks } = splitSavedChunks(chunks, savedChunks);
                const pool = startWorkerPool({
                    options,
                    configuration: run.configuration,
                    pendingChunks,
                    completedResults: results,
                    onProgress: (completed, workerCount) =>
                        setNotice(getProgressNotice(completed, options.games, workerCount)),
                    onChunkComplete: (chunk, result) =>
                        saveSimulationChunk(sessionId, chunk.startIndex, result),
                });
                cancelRef.current = () => {
                    cancelRef.current = null;
                    pool.cancel();
                    stopWithPartialResults(pool.results);
                };
                setNotice(
                    getProgressNotice(countMatches(pool.results), options.games, pool.workerCount),
                );

                if (await pool.done) {
                    cancelRef.current = null;
                    finish(
                        pool.results,
                        options,
                        (matches) =>
                            `${matches} matchs terminés avec la seed ${options.seed} en ${getDuration()}.`,
                        "Impossible de regrouper les résultats des workers.",
                    );
                }
            } catch (caught) {
                cancelRef.current = null;
                setRunning(false);
                setError(
                    getErrorMessage(
                        caught,
                        "Impossible de démarrer ou de reprendre la simulation.",
                    ),
                );
                setNotice("");
            }
        },
        [onResult, sessionId, setRunning],
    );

    useEffect(() => {
        let active = true;
        void loadSimulationRun(sessionId)
            .then(async (saved) => {
                if (!saved) return;
                const savedChunks = await loadSimulationChunks(sessionId);
                if (!active) return;
                onRestore(saved.options);
                setNotice("Reprise de la simulation après rechargement…");
                await runSimulation(saved, savedChunks, true);
            })
            .catch((caught: unknown) => {
                if (active) setError(formatFailure("Reprise de la simulation impossible", caught));
            })
            .finally(() => {
                if (active) setIsCheckingRecovery(false);
            });
        return () => {
            active = false;
        };
    }, [onRestore, runSimulation, sessionId]);

    const start = useCallback(
        (result: SimulationOptionsResult): void => {
            if ("error" in result) {
                setError(result.error);
                return;
            }
            const { options } = result;
            try {
                const workerCount = getSimulationWorkerCount(
                    options.games,
                    navigator.hardwareConcurrency ?? 2,
                );
                const chunks = createSimulationChunks(options.games, workerCount);
                void runSimulation(
                    { options, configuration, board: getDefaultBoard(), chunks },
                    [],
                    false,
                );
            } catch (caught) {
                setError(getErrorMessage(caught, "Impossible de démarrer le worker."));
                setNotice("");
            }
        },
        [configuration, runSimulation],
    );

    const cancel = useCallback(() => cancelRef.current?.(), []);

    return { isRunning, isCheckingRecovery, notice, error, start, cancel };
}
