import { useState } from "react";

import {
    GAME_CONFIGURATION_STORAGE_KEY,
    parseGameConfiguration,
    serializeGameConfiguration,
    type GameConfiguration,
} from "../../game/gameConfiguration";

export const INVALID_CONFIGURATION_NOTICE = "La configuration contient des valeurs invalides.";

export function useConfigurationEditor(
    initialConfiguration: GameConfiguration,
    onSave: (configuration: GameConfiguration) => void,
) {
    const [configuration, setConfiguration] = useState(initialConfiguration);
    const [savedConfiguration, setSavedConfiguration] = useState(initialConfiguration);
    const [notice, setNotice] = useState("");
    const isConfigurationDirty =
        serializeGameConfiguration(configuration) !==
        serializeGameConfiguration(savedConfiguration);

    function save(successNotice: string): boolean {
        const validConfiguration = parseGameConfiguration(configuration);
        if (!validConfiguration) {
            setNotice(INVALID_CONFIGURATION_NOTICE);
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
        setNotice(successNotice);
        return true;
    }

    return { configuration, setConfiguration, notice, setNotice, isConfigurationDirty, save };
}
