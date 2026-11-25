import { useEffect, useRef, useState } from "react";

import { getConfiguredBoard, getPlayerDeck, launchGameScene, requireGame } from "./app/gameSetup";
import type { ActiveGame } from "./app/types";
import { useGameEngine } from "./app/useGameEngine";
import { useGameRestoration } from "./app/useGameRestoration";
import { useOnlineRoom } from "./app/useOnlineRoom";
import { useScreenNavigation } from "./app/useScreenNavigation";
import { AppScreen } from "./components/AppScreen";
import { chooseDeck, type BotProfile } from "./game/botStrategy";
import type { GameSetup } from "./game/decks";
import { getSavedGameConfiguration } from "./game/gameConfiguration";
import { getRecoverySessionId } from "./persistence/recoveryScreen";

const SHOW_ONLINE_OPTIONS =
    !import.meta.env.DEV && !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

export function App() {
    const [sessionId] = useState(getRecoverySessionId);
    const activeGameRef = useRef<ActiveGame | null>(null);
    const [gameConfiguration, setGameConfiguration] = useState(getSavedGameConfiguration);
    const [opponentProfile, setOpponentProfile] = useState<BotProfile>("balanced");
    const { screen, navigateTo, recoveryError, setRecoveryError } = useScreenNavigation(
        sessionId,
        activeGameRef,
    );
    const { game, gameRef, containerRef, isLoading, loadError, initializeGame } = useGameEngine({
        sessionId,
        activeGameRef,
        isGameScreen: screen === "game",
        onError: setRecoveryError,
    });
    const room = useOnlineRoom({ game, gameRef, gameConfiguration, activeGameRef, navigateTo });
    const { resetRoom, restoreRoom } = room;
    const isRestoring = useGameRestoration({
        sessionId,
        screen,
        gameRef,
        activeGameRef,
        initializeGame,
        restoreRoom,
        navigateTo,
        onError: setRecoveryError,
    });
    const { deckSize } = gameConfiguration;

    useEffect(() => {
        if (!game) return;

        const handleLeaveGame = (): void => {
            game.scene.stop("GameScene");
            resetRoom();
            navigateTo("menu");
        };
        game.events.on("leave-game", handleLeaveGame);
        return () => {
            game.events.off("leave-game", handleLeaveGame);
        };
    }, [game, navigateTo, resetRoom]);

    function startGame(setup: GameSetup): void {
        const instance = requireGame(gameRef.current);
        activeGameRef.current = { setup, room: null };
        launchGameScene(instance, setup);
        navigateTo("game");
    }

    function startComputerGame(profile: BotProfile): void {
        startGame({
            mode: "computer",
            opponentProfile: profile,
            playerDeck: getPlayerDeck(deckSize),
            opponentDeck: chooseDeck(gameConfiguration.monsters, profile, deckSize),
            board: getConfiguredBoard(gameConfiguration),
            configuration: gameConfiguration,
        });
    }

    function startLocalGame(): void {
        const deck = getPlayerDeck(deckSize);
        startGame({
            mode: "local",
            playerDeck: deck,
            opponentDeck: deck,
            board: getConfiguredBoard(gameConfiguration),
            configuration: gameConfiguration,
        });
    }

    function openPlayMenu(): void {
        navigateTo("play-menu");
        void initializeGame();
    }

    return (
        <AppScreen
            screen={screen}
            sessionId={sessionId}
            canPlay={game !== null}
            isGameLoading={isLoading}
            gameLoadError={loadError}
            isRestoring={isRestoring}
            recoveryError={recoveryError}
            gameContainerRef={containerRef}
            gameConfiguration={gameConfiguration}
            showOnlineOptions={SHOW_ONLINE_OPTIONS}
            opponentProfile={opponentProfile}
            room={room}
            onScreenChange={navigateTo}
            onOpenPlay={openPlayMenu}
            onPlay={startComputerGame}
            onOpponentProfileChange={setOpponentProfile}
            onLocalPlay={startLocalGame}
            onLeaveGame={() => requireGame(gameRef.current).events.emit("leave-game")}
            onSaveConfiguration={setGameConfiguration}
        />
    );
}
