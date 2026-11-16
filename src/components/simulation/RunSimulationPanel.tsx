import { useEffect, useRef, useState } from "react";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { BOT_PROFILE_LABELS, type BotProfile } from "../../game/botStrategy";
import { BOT_PROFILES, type SimulationBatchResult } from "../../simulation/types";

interface SimulationResponse {
    type: "complete" | "error";
    result?: SimulationBatchResult;
    message?: string;
}

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
    const workerRef = useRef<Worker | null>(null);
    const [profile1, setProfile1] = useState<BotProfile>("cheap");
    const [profile2, setProfile2] = useState<BotProfile>("offensive");
    const [gameCount, setGameCount] = useState("100");
    const [seed, setSeed] = useState(() => String(Date.now() >>> 0));
    const [maxTurns, setMaxTurns] = useState("100");
    const [isRunning, setIsRunning] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    useEffect(
        () => () => {
            workerRef.current?.terminate();
            workerRef.current = null;
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

        workerRef.current?.terminate();
        setError("");
        setNotice("Simulation en cours… Le jeu reste utilisable pendant le calcul.");
        setIsRunning(true);
        onRunningChange(true);

        try {
            const worker = new Worker(
                new URL("../../simulation/simulation.worker.ts", import.meta.url),
                { type: "module" },
            );
            workerRef.current = worker;
            worker.onmessage = (event: MessageEvent<SimulationResponse>) => {
                worker.terminate();
                workerRef.current = null;
                setIsRunning(false);
                onRunningChange(false);
                if (event.data.type === "error" || !event.data.result) {
                    setError(event.data.message ?? "La simulation n’a pas abouti.");
                    setNotice("");
                    return;
                }
                setNotice(
                    `${event.data.result.summary.matches} matchs terminés avec la seed ${seedValue}.`,
                );
                onResult(event.data.result);
            };
            worker.onerror = (event) => {
                worker.terminate();
                workerRef.current = null;
                setIsRunning(false);
                onRunningChange(false);
                setError(event.message || "Le worker de simulation a rencontré une erreur.");
                setNotice("");
            };
            worker.postMessage({
                options: {
                    games,
                    seed: seedValue,
                    maxTurns: turnLimit,
                    profile1,
                    profile2,
                },
                configuration,
            });
        } catch (caught) {
            workerRef.current?.terminate();
            workerRef.current = null;
            setIsRunning(false);
            onRunningChange(false);
            setError(caught instanceof Error ? caught.message : "Impossible de démarrer le worker.");
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
            <div className="deck-actions">
                <button
                    className="primary-button"
                    onClick={startSimulation}
                    disabled={isRunning}
                >
                    {isRunning ? "Simulation en cours…" : "Lancer les simulations"}
                </button>
            </div>
            <output className={`simulation-notice${error ? " is-error" : ""}`} aria-live="polite">
                {error || notice}
            </output>
            <p className="simulation-footnote">
                Les decks et la configuration actuelle sont utilisés. Les matchs alternent le
                joueur qui commence ; les résultats complets peuvent être exportés en JSON.
            </p>
        </section>
    );
}
