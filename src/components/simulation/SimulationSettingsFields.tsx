import { NumberField, ProfileSelect, SelectField, ToggleField } from "../common/FormFields";
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
                {values.simulationMode === "classic" && !crossProfileMode && (
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
                        values.simulationMode !== "classic"
                            ? "Parties par confrontation (1–1 000)"
                            : crossProfileMode
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
            <SelectField
                label="Mode de simulation"
                value={values.simulationMode}
                onChange={(value) =>
                    bind("simulationMode")(value as SimulationFormValues["simulationMode"])
                }
            >
                <option value="classic">Simulation classique</option>
                <option value="engineTournament">Tournoi des IA</option>
                <option value="engineProfileTournament">Tournoi moteurs × profils</option>
            </SelectField>
            {values.simulationMode === "classic" && (
                <div className="settings-grid">
                    <SelectField
                        label="Moteur du joueur 1"
                        value={values.engine1}
                        onChange={(value) => bind("engine1")(value as typeof values.engine1)}
                    >
                        <option value="heuristic">Heuristique</option>
                        <option value="minimax">Minimax / Expectiminimax</option>
                        <option value="hybrid">Hybride</option>
                    </SelectField>
                    <SelectField
                        label="Moteur du joueur 2"
                        value={values.engine2}
                        onChange={(value) => bind("engine2")(value as typeof values.engine2)}
                    >
                        <option value="heuristic">Heuristique</option>
                        <option value="minimax">Minimax / Expectiminimax</option>
                        <option value="hybrid">Hybride</option>
                    </SelectField>
                </div>
            )}
            {values.simulationMode === "classic" && crossProfileMode && (
                <p className="simulation-description">
                    Chaque répétition fait s’affronter chaque paire de profils dans les deux sens
                    (J1 puis J2), soit {CROSS_PROFILE_MATCHUP_COUNT} matchs.
                </p>
            )}
            {values.simulationMode !== "classic" && (
                <p className="simulation-description">
                    Chaque confrontation reçoit le même nombre de parties, avec les positions de
                    départ alternées. Le nombre total de matchs est multiplié par le nombre de
                    confrontations.
                </p>
            )}
            {values.simulationMode === "classic" && (
                <ToggleField
                    label="Confrontation complète des profils"
                    checked={crossProfileMode}
                    onChange={bind("crossProfileMode")}
                />
            )}
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
