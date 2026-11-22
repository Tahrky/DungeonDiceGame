import { BOT_PROFILE_LABELS, type BotProfile } from "../../game/botStrategy";
import { BOT_PROFILES } from "../../simulation/types";
import { CROSS_PROFILE_MATCHUP_COUNT } from "../../simulation/workerPool";

interface SimulationSettingsFieldsProps {
    readonly profile1: BotProfile;
    readonly profile2: BotProfile;
    readonly crossProfileMode: boolean;
    readonly count: string;
    readonly seed: string;
    readonly maxTurns: string;
    readonly debug: boolean;
    readonly recordDecisionTraces: boolean;
    readonly onProfile1Change: (profile: BotProfile) => void;
    readonly onProfile2Change: (profile: BotProfile) => void;
    readonly onCrossProfileModeChange: (enabled: boolean) => void;
    readonly onCountChange: (count: string) => void;
    readonly onSeedChange: (seed: string) => void;
    readonly onMaxTurnsChange: (maxTurns: string) => void;
    readonly onDebugChange: (enabled: boolean) => void;
    readonly onRecordDecisionTracesChange: (enabled: boolean) => void;
}

export function SimulationSettingsFields({
    profile1,
    profile2,
    crossProfileMode,
    count,
    seed,
    maxTurns,
    debug,
    recordDecisionTraces,
    onProfile1Change,
    onProfile2Change,
    onCrossProfileModeChange,
    onCountChange,
    onSeedChange,
    onMaxTurnsChange,
    onDebugChange,
    onRecordDecisionTracesChange,
}: SimulationSettingsFieldsProps) {
    return (
        <>
            <div className="settings-grid">
                {!crossProfileMode && (
                    <>
                        <label className="settings-field">
                            Profil du joueur 1
                            <select
                                value={profile1}
                                onChange={(event) =>
                                    onProfile1Change(event.currentTarget.value as BotProfile)
                                }
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
                                onChange={(event) =>
                                    onProfile2Change(event.currentTarget.value as BotProfile)
                                }
                            >
                                {BOT_PROFILES.map((profile) => (
                                    <option key={profile} value={profile}>
                                        {BOT_PROFILE_LABELS[profile]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </>
                )}
                <label className="settings-field">
                    {crossProfileMode
                        ? "Nombre de répétitions (1–1 000)"
                        : "Nombre de matchs (1–1 000)"}
                    <input
                        type="number"
                        min="1"
                        max="1000"
                        step="1"
                        value={count}
                        onChange={(event) => onCountChange(event.currentTarget.value)}
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
                        onChange={(event) => onSeedChange(event.currentTarget.value)}
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
                        onChange={(event) => onMaxTurnsChange(event.currentTarget.value)}
                    />
                </label>
            </div>
            {crossProfileMode && (
                <p className="simulation-description">
                    Chaque répétition fait s’affronter chaque paire de profils dans les deux sens
                    (J1 puis J2), soit {CROSS_PROFILE_MATCHUP_COUNT} matchs.
                </p>
            )}
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={crossProfileMode}
                    onChange={(event) => onCrossProfileModeChange(event.currentTarget.checked)}
                />
                Confrontation complète des profils
            </label>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={recordDecisionTraces}
                    onChange={(event) =>
                        onRecordDecisionTracesChange(event.currentTarget.checked)
                    }
                />
                Enregistrer les évolutions des bots
            </label>
            <label className="settings-toggle">
                <input
                    type="checkbox"
                    checked={debug}
                    onChange={(event) => onDebugChange(event.currentTarget.checked)}
                />
                Activer les détails IA dans l’historique
            </label>
            {recordDecisionTraces && (
                <p className="simulation-description">
                    Les attaques examinées, leurs scores et les choix retenus seront inclus dans
                    l’export JSON.
                </p>
            )}
        </>
    );
}
