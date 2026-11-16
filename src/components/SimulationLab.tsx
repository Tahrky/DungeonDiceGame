import { useState } from "react";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { SimulationBatchResult } from "../simulation/types";
import { ResultsAnalysisPanel } from "./simulation/ResultsAnalysisPanel";
import { RunSimulationPanel } from "./simulation/RunSimulationPanel";

interface SimulationLabProps {
    readonly configuration: GameConfiguration;
    readonly onBack: () => void;
}

export function SimulationLab({ configuration, onBack }: SimulationLabProps) {
    const [activeTab, setActiveTab] = useState<"run" | "analysis">("run");
    const [isRunning, setIsRunning] = useState(false);
    const [generatedResult, setGeneratedResult] = useState<SimulationBatchResult | null>(null);

    function showResult(result: SimulationBatchResult): void {
        setGeneratedResult(result);
        setActiveTab("analysis");
    }

    return (
        <section id="menu-screen" className="simulation-screen">
            <section className="menu-panel">
                <button className="back-button" onClick={onBack} disabled={isRunning}>
                    ← Retour à l’accueil
                </button>
                <p className="eyebrow">OUTIL D’ÉQUILIBRAGE</p>
                <h2>Laboratoire de simulation</h2>
                <nav className="simulation-tabs" aria-label="Outils de simulation">
                    <button
                        className={activeTab === "run" ? "is-active" : ""}
                        aria-pressed={activeTab === "run"}
                        disabled={isRunning}
                        onClick={() => setActiveTab("run")}
                    >
                        Lancer une simulation
                    </button>
                    <button
                        className={activeTab === "analysis" ? "is-active" : ""}
                        aria-pressed={activeTab === "analysis"}
                        disabled={isRunning}
                        onClick={() => setActiveTab("analysis")}
                    >
                        Analyser un JSON
                    </button>
                </nav>
                <div hidden={activeTab !== "run"}>
                    <RunSimulationPanel
                        configuration={configuration}
                        onRunningChange={setIsRunning}
                        onResult={showResult}
                    />
                </div>
                <div hidden={activeTab !== "analysis"}>
                    <ResultsAnalysisPanel generatedResult={generatedResult} />
                </div>
            </section>
        </section>
    );
}
