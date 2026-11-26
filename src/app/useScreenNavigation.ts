import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { clearGameSession } from "../persistence/gameSession";
import { getRecoverableScreen, saveActiveScreen } from "../persistence/recoveryScreen";
import { clearSimulationRun } from "../persistence/simulationRun";
import { getErrorMessage } from "../utils/errors";
import type { ActiveGame, AppScreenName } from "./types";

function isTypingTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
            target.closest("input, textarea, select, [contenteditable=true]") !== null)
    );
}

export function useScreenNavigation(
    sessionId: string,
    activeGameRef: RefObject<ActiveGame | null>,
) {
    const [screen, setScreen] = useState<AppScreenName>(() => getRecoverableScreen() ?? "menu");
    const screenRef = useRef(screen);
    const [simulationReturnScreen, setSimulationReturnScreen] = useState<"menu" | "options-menu">(
        "menu",
    );
    const [recoveryError, setRecoveryError] = useState("");

    const navigateTo = useCallback(
        (nextScreen: AppScreenName): void => {
            const report = (fallback: string) => (error: unknown) =>
                setRecoveryError(getErrorMessage(error, fallback));

            try {
                saveActiveScreen(
                    nextScreen === "game" || nextScreen === "simulation" ? nextScreen : null,
                );
            } catch (error) {
                report("Impossible de mémoriser l’écran actif.")(error);
            }
            if (nextScreen === "simulation") {
                setSimulationReturnScreen(
                    screenRef.current === "options-menu" ? "options-menu" : "menu",
                );
            }
            screenRef.current = nextScreen;
            setScreen(nextScreen);
            if (nextScreen !== "game") {
                activeGameRef.current = null;
                void clearGameSession(sessionId).catch(
                    report("Impossible d’effacer la sauvegarde de la partie."),
                );
            }
            if (nextScreen !== "simulation") {
                void clearSimulationRun(sessionId).catch(
                    report("Impossible d’effacer la sauvegarde de la simulation."),
                );
            }
        },
        [activeGameRef, sessionId],
    );

    useEffect(() => {
        if (screen !== "menu") return;

        const handleMenuShortcut = (event: KeyboardEvent): void => {
            if (isTypingTarget(event.target)) return;
            if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
            if (event.key.toLowerCase() === "s") {
                event.preventDefault();
                navigateTo("simulation");
            }
        };
        window.addEventListener("keydown", handleMenuShortcut);
        return () => window.removeEventListener("keydown", handleMenuShortcut);
    }, [navigateTo, screen]);

    return { screen, simulationReturnScreen, navigateTo, recoveryError, setRecoveryError };
}
