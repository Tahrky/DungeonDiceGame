import { useRef, useState } from "react";

import {
    GAME_CONFIGURATION_STORAGE_KEY,
    MAX_DICE_COUNT,
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
    const [notice, setNotice] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    function updateNumber(
        key: "diceCount" | "initialPlayerHealth" | "maxMonstersPerPlayer",
        value: string,
        min: number,
        max: number,
    ): void {
        const parsedValue = Number(value);
        const integerValue = Math.trunc(Number.isFinite(parsedValue) ? parsedValue : min);
        const boundedValue = Math.max(min, Math.min(max, integerValue));
        setConfiguration((current) => ({ ...current, [key]: boundedValue }));
    }

    function saveConfiguration(): void {
        const validConfiguration = parseGameConfiguration(configuration);
        if (!validConfiguration) {
            setNotice("La configuration contient des valeurs invalides.");
            return;
        }
        try {
            localStorage.setItem(
                GAME_CONFIGURATION_STORAGE_KEY,
                serializeGameConfiguration(validConfiguration),
            );
        } catch {
            setNotice("Impossible d’enregistrer la configuration dans ce navigateur.");
            return;
        }
        onSave(validConfiguration);
        setNotice("Configuration enregistrée sur cet appareil.");
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
                <button className="back-button" onClick={onBack}>
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
                        Nombre de dés (1 à {MAX_DICE_COUNT})
                        <input
                            type="number"
                            min="1"
                            max={MAX_DICE_COUNT}
                            step="1"
                            value={configuration.diceCount}
                            onChange={(event) =>
                                updateNumber(
                                    "diceCount",
                                    event.currentTarget.value,
                                    1,
                                    MAX_DICE_COUNT,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Points de vie de départ (1 à 20)
                        <input
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={configuration.initialPlayerHealth}
                            onChange={(event) =>
                                updateNumber(
                                    "initialPlayerHealth",
                                    event.currentTarget.value,
                                    1,
                                    20,
                                )
                            }
                        />
                    </label>
                    <label className="settings-field">
                        Monstres invocables par joueur (1 à 20)
                        <input
                            type="number"
                            min="1"
                            max="20"
                            step="1"
                            value={configuration.maxMonstersPerPlayer}
                            onChange={(event) =>
                                updateNumber(
                                    "maxMonstersPerPlayer",
                                    event.currentTarget.value,
                                    1,
                                    20,
                                )
                            }
                        />
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
        </section>
    );
}
