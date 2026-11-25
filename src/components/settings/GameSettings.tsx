import { parseGameConfiguration, serializeGameConfiguration } from "../../game/gameConfiguration";
import type { GameConfiguration } from "../../game/gameConfiguration";
import { downloadBlob } from "../../utils/browser";
import { NumberField, ToggleField } from "../common/FormFields";
import { JsonFileButton } from "../common/JsonFileButton";
import { MenuScreen } from "../common/MenuScreen";
import { Notice } from "../common/Notice";
import { useUnsavedChangesGuard } from "../common/useUnsavedChangesGuard";
import {
    NUMBER_SETTINGS,
    TOGGLE_SETTINGS,
    type NumberSettingKey,
    type ToggleSettingKey,
} from "./gameSettingsFields";
import { INVALID_CONFIGURATION_NOTICE, useConfigurationEditor } from "./useConfigurationEditor";

interface GameSettingsProps {
    readonly configuration: GameConfiguration;
    readonly onBack: () => void;
    readonly onSave: (configuration: GameConfiguration) => void;
}

function clampInteger(value: string, min: number, max: number): number {
    const parsedValue = Number(value);
    const integerValue = Math.trunc(Number.isFinite(parsedValue) ? parsedValue : min);
    return Math.max(min, Math.min(max, integerValue));
}

export function GameSettings({
    configuration: initialConfiguration,
    onBack,
    onSave,
}: GameSettingsProps) {
    const { configuration, setConfiguration, notice, setNotice, isConfigurationDirty, save } =
        useConfigurationEditor(initialConfiguration, onSave);
    const saveConfiguration = () => save("Configuration enregistrée sur cet appareil.");
    const { requestBack, dialog } = useUnsavedChangesGuard(
        isConfigurationDirty,
        onBack,
        saveConfiguration,
    );

    function updateSetting(
        key: NumberSettingKey | ToggleSettingKey,
        value: number | boolean,
    ): void {
        setConfiguration((current) => ({ ...current, [key]: value }));
    }

    function exportConfiguration(): void {
        const validConfiguration = parseGameConfiguration(configuration);
        if (!validConfiguration) {
            setNotice(INVALID_CONFIGURATION_NOTICE);
            return;
        }
        try {
            downloadBlob(
                new Blob([serializeGameConfiguration(validConfiguration)], {
                    type: "application/json",
                }),
                "dungeon-dice-configuration.json",
            );
            setNotice("Configuration exportée au format JSON.");
        } catch {
            setNotice("Impossible de créer le fichier d’export JSON.");
        }
    }

    async function importConfiguration(file: File): Promise<void> {
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
        <MenuScreen
            panelId="game-settings"
            backLabel="Retour aux options"
            onBack={requestBack}
            eyebrow="RÈGLES PERSONNALISÉES"
            title="Configurer les règles"
            description="Ces réglages s’appliquent aux prochaines parties. En ligne, la configuration de l’hôte est partagée avec l’invité."
            dialog={dialog}
        >
            <div className="settings-grid">
                {NUMBER_SETTINGS.map(({ key, min, max, label }) => (
                    <NumberField
                        key={key}
                        label={label}
                        min={min}
                        max={max}
                        value={configuration[key]}
                        onChange={(value) => updateSetting(key, clampInteger(value, min, max))}
                    />
                ))}
                {TOGGLE_SETTINGS.map(({ key, label }) => (
                    <ToggleField
                        key={key}
                        label={label}
                        checked={configuration[key]}
                        onChange={(checked) => updateSetting(key, checked)}
                    />
                ))}
            </div>

            <div className="deck-actions">
                <button className="secondary-button" onClick={exportConfiguration}>
                    Exporter JSON
                </button>
                <JsonFileButton label="Importer JSON" onFile={importConfiguration} />
                <button className="primary-button" onClick={saveConfiguration}>
                    Enregistrer la configuration
                </button>
            </div>
            <Notice aria-live="polite">{notice}</Notice>
        </MenuScreen>
    );
}
