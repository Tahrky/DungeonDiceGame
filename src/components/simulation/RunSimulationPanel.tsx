import { useEffect, useRef, useState } from "react";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { BOT_PROFILE_LABELS, type BotProfile } from "../../game/botStrategy";
import {
    createSimulationChunks,
    getSimulationWorkerCount,
    mergeSimulationResults,
    type SimulationWorkerRequest,
    type SimulationWorkerResponse,
} from "../../simulation/workerPool";
import {
    BOT_PROFILES,
    type SimulationBatchResult,
    type SimulationOptions,
} from "../../simulation/types";

interface RunSimulationPanelProps {
    readonly configuration: GameConfiguration;
    readonly onRunningChange: (running: boolean) => void;
    readonly onResult: (result: SimulationBatchResult) => void;
}

export function RunSimulationPanel({
    configuration,
    onRunningChange,
    onResult,
}: RunSimulationPanelProps) {
    const workersRef = useRef<Worker[]>([]);
    const cancelRunRef = useRef<(() => void) | null>(null);
    const [profile1, setProfile1] = useState<BotProfile>("cheap");
    const [profile2, setProfile2] = useState<BotProfile>("offensive");
    const [gameCount, setGameCount] = useState("100");
    const [seed, setSeed] = useState(() => String(Date.now() >>> 0));
    const [maxTurns, setMaxTurns] = useState("100");
    const [debug, setDebug] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    useEffect(
        () => () => {
            cancelRunRef.current?.();
            workersRef.current.forEach((worker) => worker.terminate());
            workersRef.current = [];
        },
        [],
    );

    function startSimulation(): void {
        const games = Number(gameCount);
        const seedValue = Number(seed);
        const turnLimit = Number(maxTurns);
        if (!Number.isInteger(games) || games < 1 || games > 1000) {
            setError("Choisissez entre 1 et 1 000 simulations.");
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

        cancelRunRef.current?.();
        cancelRunRef.current = null;
        workersRef.current.forEach((worker) => worker.terminate());
        workersRef.current = [];
        setError("");
        setIsRunning(true);
        onRunningChange(true);

        try {
            const workerCount = getSimulationWorkerCount(games, navigator.hardwareConcurrency ?? 2);
            const chunks = createSimulationChunks(games, workerCount);
            const options: SimulationOptions = {
                games,
                seed: seedValue,
                maxTurns: turnLimit,
                profile1,
                profile2,
                debug,
            };
            const workers: Worker[] = [];
            try {
                for (let index = 0; index < workerCount; index++) {
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

            workersRef.current = workers;
            const results: SimulationBatchResult[] = [];
            let completedGames = 0;
            let remainingWorkers = workers.length;
            let active = true;

            function terminateWorkers(): void {
                workersRef.current.forEach((worker) => worker.terminate());
                workersRef.current = [];
            }

            cancelRunRef.current = () => {
                active = false;
                terminateWorkers();
            };

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
                    setNotice(
                        `${result.summary.matches} matchs terminés avec la seed ${seedValue}.`,
                    );
                    onResult(result);
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
                const chunk = chunks.shift();
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
                    if (event.data.type === "error") {
                        fail(event.data.message);
                        return;
                    }
                    if (event.data.result.matches.length !== chunk.games) {
                        fail("Un worker n’a pas renvoyé tous les matchs de son lot.");
                        return;
                    }

                    results.push(event.data.result);
                    completedGames += chunk.games;
                    setNotice(
                        `Simulation en cours… ${completedGames}/${games} matchs terminés (${workerCount} workers).`,
                    );
                    runNextChunk(worker);
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
                } catch (postError) {
                    fail(
                        postError instanceof Error
                            ? postError.message
                            : "Impossible d’envoyer un lot au worker.",
                    );
                }
            }

            setNotice(`Simulation en cours… 0/${games} matchs (${workerCount} workers).`);
            workers.forEach(runNextChunk);
        } catch (caught) {
            cancelRunRef.current = null;
            workersRef.current.forEach((worker) => worker.terminate());
            workersRef.current = [];
            setIsRunning(false);
            onRunningChange(false);
            setError(
                caught instanceof Error ? caught.message : "Impossible de démarrer le worker.",
            );
            setNotice("");
        }
    }

    return (
        <section className="simulation-form" aria-labelledby="simulation-run-title">
            <h3 id="simulation-run-title">Paramètres des matchs</h3>
            <div className="settings-grid">
                <label className="settings-field">
                    Profil du joueur 1
                    <select
                        value={profile1}
                        onChange={(event) => setProfile1(event.currentTarget.value as BotProfile)}
                    >
                        {BOT_PROFILES.map((profile) => (
                            <option key={profile} value={profile}>
                                {BOT_PROFILE_LABELS[profile]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="settings-field">
                    Profil du joueur 2
                    <select
                        value={profile2}
                        onChange={(event) => setProfile2(event.currentTarget.value as BotProfile)}
                    >
                        {BOT_PROFILES.map((profile) => (
                            <option key={profile} value={profile}>
                                {BOT_PROFILE_LABELS[profile]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="settings-field">
                    Nombre de matchs (1–1 000)
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={gameCount}
                        onChange={(event) => setGameCount(event.currentTarget.value)}
                    />
                </label>
                <label className="settings-field">
                    Seed (reproductibilité)
                    <input
                        type="number"
                        min="0"
                        max="4294967295"
                        step="1"
                        value={seed}
                        onChange={(event) => setSeed(event.currentTarget.value)}
                    />
                </label>
                <label className="settings-field">
                    Limite de tours par match
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={maxTurns}
                        onChange={(event) => setMaxTurns(event.currentTarget.value)}
                    />
                </label>
            </div>
            <label className="settings-field">
                <input
                    type="checkbox"
                    checked={debug}
                    onChange={(event) => setDebug(event.currentTarget.checked)}
                />
                Activer les détails IA dans l’historique
            </label>
            <div className="deck-actions">
                <button className="primary-button" onClick={startSimulation} disabled={isRunning}>
                    {isRunning ? "Simulation en cours…" : "Lancer les simulations"}
                </button>
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
