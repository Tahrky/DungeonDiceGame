import { useEffect, useState, type RefObject } from "react";
import type Phaser from "phaser";

import { loadGameSession } from "../persistence/gameSession";
import { getRecoverableScreen } from "../persistence/recoveryScreen";
import { formatFailure } from "../utils/errors";
import { launchGameScene } from "./gameSetup";
import type { ActiveGame, ActiveRoom, AppScreenName } from "./types";

interface GameRestorationOptions {
    readonly sessionId: string;
    readonly screen: AppScreenName;
    readonly gameRef: RefObject<Phaser.Game | null>;
    readonly activeGameRef: RefObject<ActiveGame | null>;
    readonly initializeGame: () => Promise<void>;
    readonly restoreRoom: (room: ActiveRoom | null) => void;
    readonly navigateTo: (screen: AppScreenName) => void;
    readonly onError: (message: string) => void;
}

export function useGameRestoration({
    sessionId,
    screen,
    gameRef,
    activeGameRef,
    initializeGame,
    restoreRoom,
    navigateTo,
    onError,
}: GameRestorationOptions): boolean {
    const [isRestoring, setIsRestoring] = useState(() => getRecoverableScreen() === "game");

    useEffect(() => {
        if (screen !== "game" || !isRestoring) return;

        let active = true;
        void loadGameSession(sessionId)
            .then(async (saved) => {
                if (!active) return;
                if (!saved) throw new Error("Aucune sauvegarde de partie à restaurer.");

                const room =
                    saved.roomCode && saved.roomRole
                        ? { roomCode: saved.roomCode, roomRole: saved.roomRole }
                        : null;
                activeGameRef.current = { setup: saved.setup, room };
                restoreRoom(room);

                await initializeGame();
                if (!active) return;
                const instance = gameRef.current;
                if (!instance) throw new Error("Le moteur de jeu n’a pas pu être restauré.");
                launchGameScene(instance, { ...saved.setup, resumeSnapshot: saved.snapshot });
                setIsRestoring(false);
            })
            .catch((error: unknown) => {
                if (!active) return;
                onError(formatFailure("Reprise de la partie impossible", error));
                navigateTo("menu");
                setIsRestoring(false);
            });

        return () => {
            active = false;
        };
    }, [
        activeGameRef,
        gameRef,
        initializeGame,
        isRestoring,
        navigateTo,
        onError,
        restoreRoom,
        screen,
        sessionId,
    ]);

    return isRestoring;
}
