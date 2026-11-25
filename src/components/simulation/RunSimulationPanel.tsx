import { useCallback, useState } from "react";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { SimulationBatchResult, SimulationOptions } from "../../simulation/types";
import { SimulationSettingsFields } from "./SimulationSettingsFields";
import {
    buildSimulationOptions,
    createInitialFormValues,
    getFormValuesFromOptions,
    type SimulationFormChange,
} from "./simulationForm";
import { useSimulationRunner } from "./useSimulationRunner";

interface RunSimulationPanelProps {
    readonly sessionId: string;
    readonly configuration: GameConfiguration;
    readonly onRunningChange: (running: boolean) => void;
    readonly onResult: (result: SimulationBatchResult) => void;
}

function getStartLabel(isCheckingRecovery: boolean, isRunning: boolean): string {
    if (isCheckingRecovery) return "Vérification de la reprise…";
    return isRunning ? "Simulation en cours…" : "Lancer les simulations";
}

export function RunSimulationPanel({
    sessionId,
    configuration,
    onRunningChange,
    onResult,
}: RunSimulationPanelProps) {
    const [values, setValues] = useState(createInitialFormValues);
    const change: SimulationFormChange = useCallback(
        (key, value) => setValues((previous) => ({ ...previous, [key]: value })),
        [],
    );
    const restore = useCallback(
        (options: SimulationOptions) => setValues(getFormValuesFromOptions(options)),
        [],
    );
    const { isRunning, isCheckingRecovery, notice, error, start, cancel } = useSimulationRunner({
        sessionId,
        configuration,
        onRunningChange,
        onResult,
        onRestore: restore,
    });

    return (
        <section className="simulation-form" aria-labelledby="simulation-run-title">
            <h3 id="simulation-run-title">Paramètres de simulation</h3>
            <SimulationSettingsFields values={values} onChange={change} />
            <div className="deck-actions">
                <button
                    className="primary-button"
                    onClick={() => start(buildSimulationOptions(values))}
                    disabled={isRunning || isCheckingRecovery}
                >
                    {getStartLabel(isCheckingRecovery, isRunning)}
                </button>
                {isRunning && (
                    <button className="secondary-button" type="button" onClick={cancel}>
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
