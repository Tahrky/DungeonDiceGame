import { NumberField, ProfileSelect, ToggleField } from "../common/FormFields";
import { CROSS_PROFILE_MATCHUP_COUNT } from "../../simulation/workerPool";
import type { SimulationFormChange, SimulationFormValues } from "./simulationForm";

interface SimulationSettingsFieldsProps {
    readonly values: SimulationFormValues;
    readonly onChange: SimulationFormChange;
}

export function SimulationSettingsFields({ values, onChange }: SimulationSettingsFieldsProps) {
    const { crossProfileMode, recordDecisionTraces } = values;
    const countKey = crossProfileMode ? "repetitionCount" : "gameCount";
    const bind =
        <Key extends keyof SimulationFormValues>(key: Key) =>
        (value: SimulationFormValues[Key]) =>
            onChange(key, value);

    return (
        <>
            <div className="settings-grid">
                {!crossProfileMode && (
                    <>
                        <ProfileSelect
                            label="Profil du joueur 1"
                            value={values.profile1}
                            onChange={bind("profile1")}
                        />
                        <ProfileSelect
                            label="Profil du joueur 2"
                            value={values.profile2}
                            onChange={bind("profile2")}
                        />
                    </>
                )}
                <NumberField
                    label={
                        crossProfileMode
                            ? "Nombre de répétitions (1–1 000)"
                            : "Nombre de matchs (1–1 000)"
                    }
                    min={1}
                    max={1000}
                    value={values[countKey]}
                    onChange={bind(countKey)}
                />
                <NumberField
                    label="Seed (reproductibilité)"
                    min={0}
                    max={4294967295}
                    value={values.seed}
                    onChange={bind("seed")}
                />
                <NumberField
                    label="Limite de tours par match"
                    min={1}
                    max={1000}
                    value={values.maxTurns}
                    onChange={bind("maxTurns")}
                />
            </div>
            {crossProfileMode && (
                <p className="simulation-description">
                    Chaque répétition fait s’affronter chaque paire de profils dans les deux sens
                    (J1 puis J2), soit {CROSS_PROFILE_MATCHUP_COUNT} matchs.
                </p>
            )}
            <ToggleField
                label="Confrontation complète des profils"
                checked={crossProfileMode}
                onChange={bind("crossProfileMode")}
            />
            <ToggleField
                label="Enregistrer les évolutions des bots"
                checked={recordDecisionTraces}
                onChange={bind("recordDecisionTraces")}
            />
            <ToggleField
                label="Activer les détails IA dans l’historique"
                checked={values.debug}
                onChange={bind("debug")}
            />
            <ToggleField
                label="Activer la recherche Minimax/Expectiminimax"
                checked={values.expectiminimax}
                onChange={bind("expectiminimax")}
            />
            {values.expectiminimax && (
                <div className="settings-grid">
                    <NumberField
                        label="Profondeur de recherche (1–10 tours)"
                        min={1}
                        max={10}
                        value={values.expectiminimaxMaxDepth}
                        onChange={bind("expectiminimaxMaxDepth")}
                    />
                    <NumberField
                        label="Largeur des branches (1–50)"
                        min={1}
                        max={50}
                        value={values.expectiminimaxBranchWidth}
                        onChange={bind("expectiminimaxBranchWidth")}
                    />
                    <NumberField
                        label="Budget de nœuds (1–100 000)"
                        min={1}
                        max={100000}
                        value={values.expectiminimaxNodeBudget}
                        onChange={bind("expectiminimaxNodeBudget")}
                    />
                </div>
            )}
            {recordDecisionTraces && (
                <p className="simulation-description">
                    Les attaques examinées, leurs scores et les choix retenus seront inclus dans
                    l’export JSON.
                </p>
            )}
        </>
    );
}
