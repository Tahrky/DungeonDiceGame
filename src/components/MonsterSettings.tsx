import { useState } from "react";

import {
    GAME_CONFIGURATION_STORAGE_KEY,
    parseGameConfiguration,
    parseMonsterConfiguration,
    serializeGameConfiguration,
    type GameConfiguration,
} from "../game/gameConfiguration";

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
    const [configuration, setConfiguration] = useState(initialConfiguration);
    const [selectedMonsterId, setSelectedMonsterId] = useState(initialConfiguration.monsters[0].id);
    const [monsterJson, setMonsterJson] = useState(() =>
        serializeMonster(initialConfiguration.monsters[0]),
    );
    const [notice, setNotice] = useState("");
    const selectedMonster = configuration.monsters.find(
        (monster) => monster.id === selectedMonsterId,
    );

    function hasUnappliedMonsterJson(): boolean {
        return selectedMonster !== undefined && monsterJson !== serializeMonster(selectedMonster);
    }

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

    function saveConfiguration(): void {
        if (hasUnappliedMonsterJson()) {
            setNotice("Appliquez les modifications du profil sélectionné avant d’enregistrer.");
            return;
        }
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
        setNotice("Configuration des monstres enregistrée sur cet appareil.");
    }

    return (
        <section id="menu-screen">
            <section id="monster-settings" className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour aux options
                </button>
                <p className="eyebrow">PROFILS DE MONSTRES</p>
                <h2>Configuration JSON des monstres</h2>
                <p className="panel-description">
                    Modifiez les statistiques, les attaques et les capacités des monstres.
                </p>

                <div className="settings-monster">
                    <label className="settings-field" htmlFor="settings-monster">
                        Monstre à modifier
                        <select
                            id="settings-monster"
                            value={selectedMonsterId}
                            onChange={(event) => {
                                if (hasUnappliedMonsterJson()) {
                                    setNotice(
                                        "Appliquez ou annulez les modifications avant de changer de monstre.",
                                    );
                                    return;
                                }
                                const monster = configuration.monsters.find(
                                    (entry) => entry.id === event.currentTarget.value,
                                );
                                if (!monster) return;
                                setSelectedMonsterId(monster.id);
                                setMonsterJson(serializeMonster(monster));
                                setNotice("");
                            }}
                        >
                            {configuration.monsters.map((monster) => (
                                <option key={monster.id} value={monster.id}>
                                    {monster.name}
                                </option>
                            ))}
                        </select>
                    </label>
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
                        L’identifiant du monstre est fixe pour préserver les decks et les sprites.
                        Les types de motifs valides sont adjacents, line, area, directionalArea,
                        selfRadius, radius et jumpArea.
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
                <output className="notice" aria-live="polite">
                    {notice}
                </output>
            </section>
        </section>
    );
}
