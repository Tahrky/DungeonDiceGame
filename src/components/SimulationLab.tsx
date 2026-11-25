import { useCallback, useState } from "react";

import type { GameConfiguration } from "../game/gameConfiguration";
import type { SimulationBatchResult } from "../simulation/types";
import { MenuScreen } from "./common/MenuScreen";
import { MonsterBalancePanel } from "./simulation/MonsterBalancePanel";
import { ResultsAnalysisPanel } from "./simulation/ResultsAnalysisPanel";
import { RunSimulationPanel } from "./simulation/RunSimulationPanel";

interface SimulationLabProps {
    readonly sessionId: string;
    readonly configuration: GameConfiguration;
    readonly onBack: () => void;
}

const TABS = [
    { id: "run", label: "Lancer une simulation" },
    { id: "analysis", label: "Analyser un JSON" },
    { id: "balance", label: "Équilibrage des monstres" },
] as const;

export function SimulationLab({ sessionId, configuration, onBack }: SimulationLabProps) {
    const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("run");
    const [isRunning, setIsRunning] = useState(false);
    const [generatedResult, setGeneratedResult] = useState<SimulationBatchResult | null>(null);

    const showResult = useCallback((result: SimulationBatchResult): void => {
        setGeneratedResult(result);
        setActiveTab("analysis");
    }, []);

    return (
        <MenuScreen
            screenClassName="simulation-screen"
            isBackDisabled={isRunning}
            onBack={onBack}
            eyebrow="OUTIL D’ÉQUILIBRAGE"
            title="Laboratoire de simulation"
        >
            <nav className="simulation-tabs" aria-label="Outils de simulation">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        className={activeTab === id ? "is-active" : ""}
                        aria-pressed={activeTab === id}
                        disabled={isRunning}
                        onClick={() => setActiveTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </nav>
            <div hidden={activeTab !== "run"}>
                <RunSimulationPanel
                    sessionId={sessionId}
                    configuration={configuration}
                    onRunningChange={setIsRunning}
                    onResult={showResult}
                />
            </div>
            <div hidden={activeTab !== "analysis"}>
                <ResultsAnalysisPanel generatedResult={generatedResult} />
            </div>
            <div hidden={activeTab !== "balance"}>
                <MonsterBalancePanel />
            </div>
        </MenuScreen>
    );
}
