import { useState } from "react";

import type { GameConfiguration } from "../../game/gameConfiguration";
import { parseMonsterConfiguration } from "../../game/monsterConfiguration";
import { SelectField } from "../common/FormFields";
import { MenuScreen } from "../common/MenuScreen";
import { Notice } from "../common/Notice";
import { useUnsavedChangesGuard } from "../common/useUnsavedChangesGuard";
import { useConfigurationEditor } from "./useConfigurationEditor";

interface MonsterSettingsProps {
    readonly configuration: GameConfiguration;
    readonly onBack: () => void;
    readonly onSave: (configuration: GameConfiguration) => void;
}

function serializeMonster(monster: GameConfiguration["monsters"][number]): string {
    return JSON.stringify(monster, null, 2);
}

export function MonsterSettings({
    configuration: initialConfiguration,
    onBack,
    onSave,
}: MonsterSettingsProps) {
    const { configuration, setConfiguration, notice, setNotice, isConfigurationDirty, save } =
        useConfigurationEditor(initialConfiguration, onSave);
    const [selectedMonsterId, setSelectedMonsterId] = useState(initialConfiguration.monsters[0].id);
    const [monsterJson, setMonsterJson] = useState(() =>
        serializeMonster(initialConfiguration.monsters[0]),
    );
    const selectedMonster = configuration.monsters.find(
        (monster) => monster.id === selectedMonsterId,
    );
    const hasUnappliedMonsterJson =
        selectedMonster !== undefined && monsterJson !== serializeMonster(selectedMonster);

    function saveConfiguration(): boolean {
        if (hasUnappliedMonsterJson) {
            setNotice("Appliquez les modifications du profil sélectionné avant d’enregistrer.");
            return false;
        }
        return save("Configuration des monstres enregistrée sur cet appareil.");
    }

    const { requestBack, dialog } = useUnsavedChangesGuard(
        isConfigurationDirty || hasUnappliedMonsterJson,
        onBack,
        saveConfiguration,
    );

    function applyMonsterJson(): void {
        let value: unknown;
        try {
            value = JSON.parse(monsterJson);
        } catch {
            setNotice("JSON de monstre invalide. Vérifiez la syntaxe.");
            return;
        }
        const monster = parseMonsterConfiguration(value, selectedMonsterId);
        if (!monster) {
            setNotice(
                "Profil invalide : vérifiez les statistiques, les attaques et les capacités.",
            );
            return;
        }
        setConfiguration((current) => ({
            ...current,
            monsters: current.monsters.map((entry) =>
                entry.id === selectedMonsterId ? monster : entry,
            ),
        }));
        setMonsterJson(serializeMonster(monster));
        setNotice("Profil appliqué. Enregistrez pour conserver les changements.");
    }

    function selectMonster(monsterId: string): void {
        if (hasUnappliedMonsterJson) {
            setNotice("Appliquez ou annulez les modifications avant de changer de monstre.");
            return;
        }
        const monster = configuration.monsters.find((entry) => entry.id === monsterId);
        if (!monster) return;
        setSelectedMonsterId(monster.id);
        setMonsterJson(serializeMonster(monster));
        setNotice("");
    }

    return (
        <MenuScreen
            panelId="monster-settings"
            backLabel="Retour aux options"
            onBack={requestBack}
            eyebrow="PROFILS DE MONSTRES"
            title="Configuration JSON des monstres"
            description="Modifiez les statistiques, les attaques et les capacités des monstres."
            dialog={dialog}
        >
            <div className="settings-monster">
                <SelectField
                    id="settings-monster"
                    label="Monstre à modifier"
                    value={selectedMonsterId}
                    onChange={selectMonster}
                >
                    {configuration.monsters.map((monster) => (
                        <option key={monster.id} value={monster.id}>
                            {monster.name}
                        </option>
                    ))}
                </SelectField>
                <label className="settings-field" htmlFor="monster-profile-json">
                    Profil JSON — statistiques, attaques, motifs et capacités
                    <textarea
                        id="monster-profile-json"
                        spellCheck={false}
                        value={monsterJson}
                        onChange={(event) => setMonsterJson(event.currentTarget.value)}
                    />
                </label>
                <small>
                    L’identifiant du monstre est fixe pour préserver les decks et les sprites. Les
                    types de motifs valides sont adjacents, line, area, directionalArea, selfRadius,
                    radius et jumpArea.
                </small>
                <div className="deck-actions">
                    <button className="secondary-button" onClick={applyMonsterJson}>
                        Appliquer le profil
                    </button>
                    <button className="primary-button" onClick={saveConfiguration}>
                        Enregistrer les monstres
                    </button>
                </div>
            </div>
            <Notice aria-live="polite">{notice}</Notice>
        </MenuScreen>
    );
}
