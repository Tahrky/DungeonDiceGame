import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultBoard } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { BotProfile } from "../../game/botStrategy";
import {
    clearSimulationRun,
    loadSimulationChunks,
    loadSimulationRun,
    saveSimulationChunk,
    saveSimulationRun,
} from "../../sessionPersistence";
import {
    createCrossProfilePairs,
    createSimulationChunks,
    getSimulationWorkerCount,
    mergeSimulationResults,
    type SimulationWorkerRequest,
    type SimulationWorkerResponse,
} from "../../simulation/workerPool";
import {
    DEFAULT_MAX_TURNS,
    type SimulationBatchResult,
    type SimulationOptions,
} from "../../simulation/types";
import { formatElapsedDuration } from "../../simulation/formatElapsedDuration";
import { SimulationSettingsFields } from "./SimulationSettingsFields";

interface RunSimulationPanelProps {
    readonly sessionId: string;
    readonly configuration: GameConfiguration;
    readonly onRunningChange: (running: boolean) => void;
    readonly onResult: (result: SimulationBatchResult) => void;
}

export function RunSimulationPanel({
    sessionId,
    configuration,
    onRunningChange,
    onResult,
}: RunSimulationPanelProps) {
    const workersRef = useRef<Worker[]>([]);
    const cancelRunRef = useRef<(() => void) | null>(null);
    const [profile1, setProfile1] = useState<BotProfile>("cheap");
    const [profile2, setProfile2] = useState<BotProfile>("offensive");
    const [crossProfileMode, setCrossProfileMode] = useState(false);
    const [gameCount, setGameCount] = useState("100");
    const [repetitionCount, setRepetitionCount] = useState("1");
    const [seed, setSeed] = useState(() => String(Date.now() >>> 0));
    const [maxTurns, setMaxTurns] = useState(String(DEFAULT_MAX_TURNS));
    const [debug, setDebug] = useState(false);
    const [recordDecisionTraces, setRecordDecisionTraces] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [isCheckingRecovery, setIsCheckingRecovery] = useState(true);

    useEffect(
        () => () => {
            cancelRunRef.current?.();
            workersRef.current.forEach((worker) => worker.terminate());
            workersRef.current = [];
        },
        [],
    );

    const runSimulation = useCallback(
        async (
            options: SimulationOptions,
            runConfiguration: GameConfiguration,
            board: ReturnType<typeof getDefaultBoard>,
            chunks: readonly { readonly startIndex: number; readonly games: number }[],
            completedChunks: Awaited<ReturnType<typeof loadSimulationChunks>>,
            isResuming: boolean,
        ): Promise<void> => {
            const startedAt = performance.now();
            setError("");
            setIsRunning(true);
            onRunningChange(true);

            function announceCompletion(matches: number): void {
                setNotice(
                    `${matches} matchs terminés avec la seed ${options.seed} en ${formatElapsedDuration(performance.now() - startedAt)}.`,
                );
            }

            try {
                if (!isResuming) {
                    await saveSimulationRun(sessionId, {
                        options,
                        configuration: runConfiguration,
                        board,
                        chunks,
                    });
                }

                const results: SimulationBatchResult[] = [];
                const completedIndices = new Set<number>();
                for (const saved of completedChunks) {
                    const chunk = chunks.find(
                        (candidate) => candidate.startIndex === saved.startIndex,
                    );
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

                const pendingChunks = chunks.filter(
                    (chunk) => !completedIndices.has(chunk.startIndex),
                );
                const workerCount =
                    pendingChunks.length === 0
                        ? 0
                        : getSimulationWorkerCount(
                              pendingChunks.reduce((total, chunk) => total + chunk.games, 0),
                              navigator.hardwareConcurrency ?? 2,
                          );
                const workers: Worker[] = [];
                try {
                    for (
                        let index = 0;
                        index < Math.min(workerCount, pendingChunks.length);
                        index++
                    ) {
                        workers.push(
                            new Worker(
                                new URL("../../simulation/simulation.worker.ts", import.meta.url),
                                { type: "module" },
                            ),
                        );
                    }
                } catch (workerError) {
                    workers.forEach((worker) => worker.terminate());
                    throw workerError;
                }

                if (pendingChunks.length === 0) {
                    const result = mergeSimulationResults(results, options);
                    announceCompletion(result.summary.matches);
                    onResult(result);
                    setIsRunning(false);
                    onRunningChange(false);
                    void clearSimulationRun(sessionId).catch((clearError: unknown) =>
                        setError(
                            clearError instanceof Error
                                ? `Impossible d’effacer la reprise : ${clearError.message}`
                                : "Impossible d’effacer la reprise de simulation.",
                        ),
                    );
                    return;
                }

                workersRef.current = workers;
                let completedGames = completedChunks.reduce(
                    (total, chunk) => total + chunk.result.matches.length,
                    0,
                );
                const chunkProgress = new Map<number, number>();
                let remainingWorkers = workers.length;
                let active = true;
                const pending = [...pendingChunks];

                function getVisibleCompletedGames(): number {
                    return (
                        completedGames +
                        [...chunkProgress.values()].reduce((total, count) => total + count, 0)
                    );
                }

                function terminateWorkers(): void {
                    workersRef.current.forEach((worker) => worker.terminate());
                    workersRef.current = [];
                }

                function fail(message: string): void {
                    if (!active) return;
                    active = false;
                    cancelRunRef.current = null;
                    terminateWorkers();
                    setIsRunning(false);
                    onRunningChange(false);
                    setError(message);
                    setNotice("");
                }

                function finish(): void {
                    if (!active) return;
                    active = false;
                    cancelRunRef.current = null;
                    terminateWorkers();
                    setIsRunning(false);
                    onRunningChange(false);
                    try {
                        const result = mergeSimulationResults(results, options);
                        announceCompletion(result.summary.matches);
                        onResult(result);
                        void clearSimulationRun(sessionId).catch((clearError: unknown) =>
                            setError(
                                clearError instanceof Error
                                    ? `Impossible d’effacer la reprise : ${clearError.message}`
                                    : "Impossible d’effacer la reprise de simulation.",
                            ),
                        );
                    } catch (mergeError) {
                        setError(
                            mergeError instanceof Error
                                ? mergeError.message
                                : "Impossible de regrouper les résultats des workers.",
                        );
                        setNotice("");
                    }
                }

                function runNextChunk(worker: Worker): void {
                    if (!active) return;
                    const chunk = pending.shift();
                    if (!chunk) {
                        worker.terminate();
                        remainingWorkers--;
                        if (remainingWorkers === 0) finish();
                        return;
                    }

                    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
                        if (!active) return;
                        if (event.data.startIndex !== chunk.startIndex) {
                            fail("Le worker a renvoyé un lot inattendu.");
                            return;
                        }
                        if (event.data.type === "progress") {
                            const previous = chunkProgress.get(chunk.startIndex) ?? 0;
                            if (
                                !Number.isInteger(event.data.completedGames) ||
                                event.data.completedGames <= previous ||
                                event.data.completedGames > chunk.games
                            ) {
                                fail("Le worker a renvoyé une progression de lot invalide.");
                                return;
                            }
                            chunkProgress.set(chunk.startIndex, event.data.completedGames);
                            setNotice(
                                `Simulation en cours… ${getVisibleCompletedGames()}/${options.games} matchs terminés (${workers.length} workers).`,
                            );
                            return;
                        }
                        if (event.data.type === "error") {
                            fail(event.data.message);
                            return;
                        }
                        const result = event.data.result;
                        if (result.matches.length !== chunk.games) {
                            fail("Un worker n’a pas renvoyé tous les matchs de son lot.");
                            return;
                        }

                        chunkProgress.delete(chunk.startIndex);
                        results.push(result);
                        completedGames += chunk.games;
                        void saveSimulationChunk(sessionId, chunk.startIndex, result)
                            .then(() => {
                                if (!active) return;
                                setNotice(
                                    `Simulation en cours… ${getVisibleCompletedGames()}/${options.games} matchs terminés (${workers.length} workers).`,
                                );
                                runNextChunk(worker);
                            })
                            .catch((saveError: unknown) =>
                                fail(
                                    saveError instanceof Error
                                        ? `Sauvegarde du lot impossible : ${saveError.message}`
                                        : "Sauvegarde du lot de simulation impossible.",
                                ),
                            );
                    };
                    worker.onerror = (event: ErrorEvent) => {
                        event.preventDefault();
                        fail(event.message || "Un worker de simulation a rencontré une erreur.");
                    };
                    worker.onmessageerror = () => fail("Une réponse de worker est illisible.");

                    const request: SimulationWorkerRequest = {
                        options: { ...options, games: chunk.games },
                        configuration: runConfiguration,
                        startIndex: chunk.startIndex,
                    };
                    try {
                        worker.postMessage(request);
                    } catch (postError) {
                        fail(
                            postError instanceof Error
                                ? postError.message
                                : "Impossible d’envoyer un lot au worker.",
                        );
                    }
                }

                cancelRunRef.current = () => {
                    active = false;
                    terminateWorkers();
                    cancelRunRef.current = null;

                    const partialResults: SimulationBatchResult[] = [];
                    for (const chunk of chunks) {
                        const result = results.find(
                            (candidate) => candidate.matches[0]?.id === chunk.startIndex + 1,
                        );
                        if (!result) break;
                        partialResults.push(result);
                    }

                    if (partialResults.length === 0) {
                        setIsRunning(false);
                        onRunningChange(false);
                        setNotice("Simulation arrêtée avant qu’un match ne soit terminé.");
                        void clearSimulationRun(sessionId).catch(() => undefined);
                        return;
                    }

                    const partialMatches = partialResults.reduce(
                        (total, result) => total + result.matches.length,
                        0,
                    );
                    try {
                        const partialOptions = { ...options, games: partialMatches };
                        const result = mergeSimulationResults(partialResults, partialOptions);
                        setIsRunning(false);
                        onRunningChange(false);
                        setNotice(
                            `Simulation arrêtée : ${partialMatches} matchs terminés en ${formatElapsedDuration(performance.now() - startedAt)}.`,
                        );
                        onResult(result);
                        void clearSimulationRun(sessionId).catch((clearError: unknown) =>
                            setError(
                                clearError instanceof Error
                                    ? `Impossible d’effacer la reprise : ${clearError.message}`
                                    : "Impossible d’effacer la reprise de simulation.",
                            ),
                        );
                    } catch (mergeError) {
                        setIsRunning(false);
                        onRunningChange(false);
                        setError(
                            mergeError instanceof Error
                                ? mergeError.message
                                : "Impossible de regrouper les résultats partiels.",
                        );
                        setNotice("");
                    }
                };
                setNotice(
                    `Simulation en cours… ${completedGames}/${options.games} matchs terminés (${workers.length} workers).`,
                );
                workers.forEach(runNextChunk);
            } catch (caught) {
                cancelRunRef.current = null;
                workersRef.current.forEach((worker) => worker.terminate());
                workersRef.current = [];
                setIsRunning(false);
                onRunningChange(false);
                setError(
                    caught instanceof Error
                        ? caught.message
                        : "Impossible de démarrer ou de reprendre la simulation.",
                );
                setNotice("");
            }
        },
        [onResult, onRunningChange, sessionId],
    );

    useEffect(() => {
        let active = true;
        void loadSimulationRun(sessionId)
            .then(async (saved) => {
                if (!saved) return;
                const completed = await loadSimulationChunks(sessionId);
                if (!active) return;

                const pairMode = saved.options.profilePairs !== undefined;
                setCrossProfileMode(pairMode);
                setGameCount(String(saved.options.games));
                setRepetitionCount(
                    String(
                        pairMode
                            ? saved.options.games / (saved.options.profilePairs?.length ?? 1)
                            : saved.options.games,
                    ),
                );
                setProfile1(saved.options.profile1);
                setProfile2(saved.options.profile2);
                setSeed(String(saved.options.seed));
                setMaxTurns(String(saved.options.maxTurns));
                setRecordDecisionTraces(saved.options.recordDecisionTraces ?? false);
                setDebug(saved.options.debug ?? false);
                setNotice("Reprise de la simulation après rechargement…");
                await runSimulation(
                    saved.options,
                    saved.configuration,
                    saved.board,
                    saved.chunks,
                    completed,
                    true,
                );
            })
            .catch((caught: unknown) => {
                if (!active) return;
                setError(
                    caught instanceof Error
                        ? `Reprise de la simulation impossible : ${caught.message}`
                        : "Reprise de la simulation impossible.",
                );
            })
            .finally(() => {
                if (active) setIsCheckingRecovery(false);
            });
        return () => {
            active = false;
        };
    }, [runSimulation, sessionId]);

    function startSimulation(): void {
        const count = Number(crossProfileMode ? repetitionCount : gameCount);
        const seedValue = Number(seed);
        const turnLimit = Number(maxTurns);
        if (!Number.isInteger(count) || count < 1 || count > 1000) {
            setError(`Choisissez entre 1 et 1 000 ${crossProfileMode ? "répétitions" : "matchs"}.`);
            return;
        }
        if (!Number.isInteger(seedValue) || seedValue < 0 || seedValue > 0xffff_ffff) {
            setError("La seed doit être un entier entre 0 et 4 294 967 295.");
            return;
        }
        if (!Number.isInteger(turnLimit) || turnLimit < 1 || turnLimit > 1000) {
            setError("La limite doit être comprise entre 1 et 1 000 tours.");
            return;
        }

        try {
            const profilePairs = crossProfileMode ? createCrossProfilePairs() : undefined;
            const games = count * (profilePairs?.length ?? 1);
            const options: SimulationOptions = {
                games,
                seed: seedValue,
                maxTurns: turnLimit,
                profile1,
                profile2,
                ...(profilePairs === undefined ? {} : { profilePairs }),
                debug,
                recordDecisionTraces,
            };
            const workerCount = getSimulationWorkerCount(games, navigator.hardwareConcurrency ?? 2);
            const chunks = createSimulationChunks(games, workerCount);
            cancelRunRef.current?.();
            cancelRunRef.current = null;
            workersRef.current.forEach((worker) => worker.terminate());
            workersRef.current = [];
            void runSimulation(options, configuration, getDefaultBoard(), chunks, [], false);
        } catch (caught) {
            setError(
                caught instanceof Error ? caught.message : "Impossible de démarrer le worker.",
            );
            setNotice("");
        }
    }

    return (
        <section className="simulation-form" aria-labelledby="simulation-run-title">
            <h3 id="simulation-run-title">Paramètres de simulation</h3>
            <SimulationSettingsFields
                profile1={profile1}
                profile2={profile2}
                crossProfileMode={crossProfileMode}
                count={crossProfileMode ? repetitionCount : gameCount}
                seed={seed}
                maxTurns={maxTurns}
                debug={debug}
                recordDecisionTraces={recordDecisionTraces}
                onProfile1Change={setProfile1}
                onProfile2Change={setProfile2}
                onCrossProfileModeChange={setCrossProfileMode}
                onCountChange={crossProfileMode ? setRepetitionCount : setGameCount}
                onSeedChange={setSeed}
                onMaxTurnsChange={setMaxTurns}
                onDebugChange={setDebug}
                onRecordDecisionTracesChange={setRecordDecisionTraces}
            />
            <div className="deck-actions">
                <button
                    className="primary-button"
                    onClick={startSimulation}
                    disabled={isRunning || isCheckingRecovery}
                >
                    {isCheckingRecovery
                        ? "Vérification de la reprise…"
                        : isRunning
                          ? "Simulation en cours…"
                          : "Lancer les simulations"}
                </button>
                {isRunning && (
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() => cancelRunRef.current?.()}
                    >
                        Arrêter et afficher les résultats
                    </button>
                )}
            </div>
            <output className={`simulation-notice${error ? " is-error" : ""}`} aria-live="polite">
                {error || notice}
            </output>
            <p className="simulation-footnote">
                Les decks et la configuration actuelle sont utilisés. Les matchs alternent le joueur
                qui commence ; les résultats complets peuvent être exportés en JSON.
            </p>
        </section>
    );
}
