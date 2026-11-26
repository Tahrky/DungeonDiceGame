import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type Phaser from "phaser";

import { GAME_CONFIG } from "../data/configuration";
import { saveGameSession } from "../persistence/gameSession";
import type { GameSnapshot } from "../types/GameTypes";
import { formatFailure, getErrorMessage } from "../utils/errors";
import type { ActiveGame } from "./types";

interface GameEngineOptions {
    readonly sessionId: string;
    readonly activeGameRef: RefObject<ActiveGame | null>;
    readonly isGameScreen: boolean;
    readonly onError: (message: string) => void;
}

export function useGameEngine({
    sessionId,
    activeGameRef,
    isGameScreen,
    onError,
}: GameEngineOptions) {
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const initializationRef = useRef<Promise<void> | null>(null);
    const isMountedRef = useRef(false);
    const [game, setGame] = useState<Phaser.Game | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, []);

    const initializeGame = useCallback((): Promise<void> => {
        if (initializationRef.current) return initializationRef.current;
        if (gameRef.current) return Promise.resolve();

        setIsLoading(true);
        setLoadError("");
        const initialization = (async (): Promise<void> => {
            try {
                const [{ default: PhaserRuntime }, { GameScene }] = await Promise.all([
                    import("phaser"),
                    import("../scenes/GameScene"),
                ]);
                if (!isMountedRef.current) return;

                const parent = containerRef.current;
                if (!parent) throw new Error("Conteneur du jeu manquant.");

                const instance = new PhaserRuntime.Game({
                    type: PhaserRuntime.AUTO,
                    width: GAME_CONFIG.screenWidth,
                    height: GAME_CONFIG.screenHeight,
                    parent,
                    backgroundColor: "#202a36",
                    scene: [GameScene],
                    scale: { mode: PhaserRuntime.Scale.RESIZE },
                    render: { antialias: true },
                });
                gameRef.current = instance;
                setGame(instance);
                instance.events.on("persist-game-snapshot", (snapshot: GameSnapshot) => {
                    const active = activeGameRef.current;
                    if (!active) return;
                    const { setup, room } = active;
                    void saveGameSession(
                        sessionId,
                        setup,
                        snapshot,
                        room?.roomCode ?? null,
                        room?.roomRole ?? null,
                    ).catch((error: unknown) =>
                        onError(formatFailure("Sauvegarde de la partie impossible", error)),
                    );
                });

                if (!instance.isBooted) {
                    await new Promise<void>((resolve) =>
                        instance.events.once(PhaserRuntime.Core.Events.READY, resolve),
                    );
                }
            } catch (error) {
                if (isMountedRef.current) {
                    setLoadError(`Chargement du jeu impossible : ${getErrorMessage(error)}`);
                }
            } finally {
                initializationRef.current = null;
                if (isMountedRef.current) setIsLoading(false);
            }
        })();
        initializationRef.current = initialization;
        return initialization;
    }, [activeGameRef, onError, sessionId]);

    useEffect(() => {
        if (!isGameScreen || !game) return;

        const container = containerRef.current;
        if (!container) throw new Error("Conteneur du jeu manquant.");

        const resizeGame = (): void => {
            const { width, height } = container.getBoundingClientRect();
            if (width > 0 && height > 0) {
                game.scale.resize(Math.round(width), Math.round(height));
            }
        };
        const observer = new ResizeObserver(resizeGame);
        observer.observe(container);
        resizeGame();

        return () => observer.disconnect();
    }, [game, isGameScreen]);

    return { game, gameRef, containerRef, isLoading, loadError, initializeGame };
}
