import { useRef, useState } from "react";

import { UnsavedChangesDialog, useBeforeUnloadWarning } from "./UnsavedChangesDialog";
import {
    GAME_CONFIGURATION_STORAGE_KEY,
    MAX_AVAILABLE_DECK_SIZE,
    MAX_DICE_COUNT,
    MAX_MAX_MONSTERS_PER_PLAYER,
    MAX_PLAYER_HEALTH,
    MAX_MONSTERS_KILLED_FOR_VICTORY,
    MIN_DECK_SIZE,
    MIN_DICE_COUNT,
    MIN_MAX_MONSTERS_PER_PLAYER,
    MIN_MONSTERS_KILLED_FOR_VICTORY,
    MIN_PLAYER_HEALTH,
    MAX_DECK_SIZE,
    parseGameConfiguration,
    serializeGameConfiguration,
    type GameConfiguration,
} from "../game/gameConfiguration";

interface GameSettingsProps {
    readonly configuration: GameConfiguration;
    readonly onBack: () => void;
    readonly onSave: (configuration: GameConfiguration) => void;
}

export function GameSettings({
    configuration: initialConfiguration,
    onBack,
    onSave,
}: GameSettingsProps) {
    const [configuration, setConfiguration] = useState(initialConfiguration);
    const [savedConfiguration, setSavedConfiguration] = useState(initialConfiguration);
    const [notice, setNotice] = useState("");
    const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isDirty =
        serializeGameConfiguration(configuration) !==
        serializeGameConfiguration(savedConfiguration);
    useBeforeUnloadWarning(isDirty);

    function requestBack(): void {
        if (isDirty) {
            setShowUnsavedDialog(true);
            return;
        }
        onBack();
    }

    function updateNumber(
        key:
            | "diceCount"
            | "deckSize"
            | "initialPlayerHealth"
            | "maxMonstersPerPlayer"
            | "monstersKilledForVictory",
        value: string,
        min: number,
        max: number,
    ): void {
        const parsedValue = Number(value);
        const integerValue = Math.trunc(Number.isFinite(parsedValue) ? parsedValue : min);
        const boundedValue = Math.max(min, Math.min(max, integerValue));
        setConfiguration((current) => ({ ...current, [key]: boundedValue }));
    }

    function saveConfiguration(): boolean {
        const validConfiguration = parseGameConfiguration(configuration);
        if (!validConfiguration) {
            setNotice("La configuration contient des valeurs invalides.");
            return false;
        }
        try {
            localStorage.setItem(
                GAME_CONFIGURATION_STORAGE_KEY,
                serializeGameConfiguration(validConfiguration),
            );
        } catch {
            setNotice("Impossible d’enregistrer la configuration dans ce navigateur.");
            return false;
        }
        onSave(validConfiguration);
        setConfiguration(validConfiguration);
        setSavedConfiguration(validConfiguration);
        setNotice("Configuration enregistrée sur cet appareil.");
        return true;
    }

    function saveAndLeave(): void {
        if (saveConfiguration()) {
            onBack();
        } else {
            setShowUnsavedDialog(false);
        }
    }

    function exportConfiguration(): void {
        const validConfiguration = parseGameConfiguration(configuration);
        if (!validConfiguration) {
            setNotice("La configuration contient des valeurs invalides.");
            return;
        }
        let url: string | null = null;
        try {
            const blob = new Blob([serializeGameConfiguration(validConfiguration)], {
                type: "application/json",
            });
            url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "dungeon-dice-configuration.json";
            link.click();
            setNotice("Configuration exportée au format JSON.");
        } catch {
            setNotice("Impossible de créer le fichier d’export JSON.");
        } finally {
            if (url !== null) URL.revokeObjectURL(url);
        }
    }

    async function importConfiguration(file: File | undefined): Promise<void> {
        if (!file) return;
        try {
            const imported = parseGameConfiguration(JSON.parse(await file.text()));
            if (!imported) {
                setNotice("Configuration invalide ou version JSON non prise en charge.");
                return;
            }
            setConfiguration(imported);
            setNotice("Configuration chargée. Enregistrez-la pour l’appliquer aux parties.");
        } catch {
            setNotice("Impossible de lire ce fichier JSON.");
        }
    }

    return (
        <section id="menu-screen">
            <section id="game-settings" className="menu-panel">
                <button className="back-button" onClick={requestBack}>
                    ← Retour aux options
                </button>
                <p className="eyebrow">RÈGLES PERSONNALISÉES</p>
                <h2>Configurer les règles</h2>
                <p className="panel-description">
                    Ces réglages s’appliquent aux prochaines parties. En ligne, la configuration de
                    l’hôte est partagée avec l’invité.
                </p>

                <div className="settings-grid">
                    <label className="settings-field">
                        Nombre de dés ({MIN_DICE_COUNT} à {MAX_DICE_COUNT})
                        <input
                            type="number"
                            min={MIN_DICE_COUNT}
                            max={MAX_DICE_COUNT}
                            step="1"
                            value={configuration.diceCount}
                            onChange={(event) =>
                                updateNumber(
                                    "diceCount",
                                    event.currentTarget.value,
                                    MIN_DICE_COUNT,
                                    MAX_DICE_COUNT,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Monstres différents par deck ({MIN_DECK_SIZE} à{" "}
                        {MAX_AVAILABLE_DECK_SIZE} disponibles, jusqu’à {MAX_DECK_SIZE} prévus)
                        <input
                            type="number"
                            min={MIN_DECK_SIZE}
                            max={MAX_AVAILABLE_DECK_SIZE}
                            step="1"
                            value={configuration.deckSize}
                            onChange={(event) =>
                                updateNumber(
                                    "deckSize",
                                    event.currentTarget.value,
                                    MIN_DECK_SIZE,
                                    MAX_AVAILABLE_DECK_SIZE,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Points de vie de départ ({MIN_PLAYER_HEALTH} à {MAX_PLAYER_HEALTH})
                        <input
                            type="number"
                            min={MIN_PLAYER_HEALTH}
                            max={MAX_PLAYER_HEALTH}
                            step="1"
                            value={configuration.initialPlayerHealth}
                            onChange={(event) =>
                                updateNumber(
                                    "initialPlayerHealth",
                                    event.currentTarget.value,
                                    MIN_PLAYER_HEALTH,
                                    MAX_PLAYER_HEALTH,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Monstres invocables par joueur ({MIN_MAX_MONSTERS_PER_PLAYER} à{" "}
                        {MAX_MAX_MONSTERS_PER_PLAYER})
                        <input
                            type="number"
                            min={MIN_MAX_MONSTERS_PER_PLAYER}
                            max={MAX_MAX_MONSTERS_PER_PLAYER}
                            step="1"
                            value={configuration.maxMonstersPerPlayer}
                            onChange={(event) =>
                                updateNumber(
                                    "maxMonstersPerPlayer",
                                    event.currentTarget.value,
                                    MIN_MAX_MONSTERS_PER_PLAYER,
                                    MAX_MAX_MONSTERS_PER_PLAYER,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Monstres tués pour gagner ({MIN_MONSTERS_KILLED_FOR_VICTORY} à{" "}
                        {MAX_MONSTERS_KILLED_FOR_VICTORY})
                        <input
                            type="number"
                            min={MIN_MONSTERS_KILLED_FOR_VICTORY}
                            max={MAX_MONSTERS_KILLED_FOR_VICTORY}
                            step="1"
                            value={configuration.monstersKilledForVictory}
                            onChange={(event) =>
                                updateNumber(
                                    "monstersKilledForVictory",
                                    event.currentTarget.value,
                                    MIN_MONSTERS_KILLED_FOR_VICTORY,
                                    MAX_MONSTERS_KILLED_FOR_VICTORY,
                                )
                            }
                        />
                    </label>
                    <label className="settings-toggle">
                        <input
                            type="checkbox"
                            checked={configuration.allowBaseAttackOnSummonTurn}
                            onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setConfiguration((current) => ({
                                    ...current,
                                    allowBaseAttackOnSummonTurn: checked,
                                }));
                            }}
                        />
                        Autoriser l’attaque de la base au tour d’apparition
                    </label>
                    <label className="settings-toggle">
                        <input
                            type="checkbox"
                            checked={configuration.randomBoard}
                            onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setConfiguration((current) => ({
                                    ...current,
                                    randomBoard: checked,
                                }));
                            }}
                        />
                        Choisir un plateau prédéfini aléatoire à chaque partie
                    </label>
                    <label className="settings-toggle">
                        <input
                            type="checkbox"
                            checked={configuration.testBoard}
                            onChange={(event) => {
                                const checked = event.currentTarget.checked;
                                setConfiguration((current) => ({
                                    ...current,
                                    testBoard: checked,
                                }));
                            }}
                        />
                        Utiliser le plateau de test compact (11 × 7)
                    </label>
                </div>

                <div className="deck-actions">
                    <button className="secondary-button" onClick={exportConfiguration}>
                        Exporter JSON
                    </button>
                    <button
                        className="secondary-button"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        Importer JSON
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            event.currentTarget.value = "";
                            void importConfiguration(file);
                        }}
                    />
                    <button className="primary-button" onClick={saveConfiguration}>
                        Enregistrer la configuration
                    </button>
                </div>
                <output className="notice" aria-live="polite">
                    {notice}
                </output>
            </section>
            {showUnsavedDialog && (
                <UnsavedChangesDialog
                    onSave={saveAndLeave}
                    onDiscard={onBack}
                    onCancel={() => setShowUnsavedDialog(false)}
                />
            )}
        </section>
    );
}
