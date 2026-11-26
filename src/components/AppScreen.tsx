import { lazy, Suspense, type Dispatch, type RefObject, type SetStateAction } from "react";

import type { AppScreenName } from "../app/types";
import type { OnlineRoom } from "../app/useOnlineRoom";
import type { BotProfile } from "../game/botStrategy";
import type { GameConfiguration } from "../game/gameConfiguration";
import { Notice } from "./common/Notice";
import { DeckEditor } from "./deck/DeckEditor";
import { MainMenu } from "./MainMenu";
import { OptionsMenu } from "./OptionsMenu";
import { PlayMenu } from "./PlayMenu";
import { RoomScreen } from "./RoomScreen";
import { GameSettings } from "./settings/GameSettings";
import { MonsterSettings } from "./settings/MonsterSettings";

const SimulationLab = lazy(() =>
    import("./SimulationLab").then(({ SimulationLab: component }) => ({ default: component })),
);

interface AppScreenProps {
    readonly screen: AppScreenName;
    readonly simulationReturnScreen: "menu" | "options-menu";
    readonly sessionId: string;
    readonly canPlay: boolean;
    readonly isGameLoading: boolean;
    readonly gameLoadError: string;
    readonly isRestoring: boolean;
    readonly recoveryError: string;
    readonly gameContainerRef: RefObject<HTMLDivElement | null>;
    readonly gameConfiguration: GameConfiguration;
    readonly showOnlineOptions: boolean;
    readonly opponentProfile: BotProfile;
    readonly room: OnlineRoom;
    readonly onScreenChange: (screen: AppScreenName) => void;
    readonly onOpenPlay: () => void;
    readonly onPlay: (profile: BotProfile) => void;
    readonly onOpponentProfileChange: (profile: BotProfile) => void;
    readonly onLocalPlay: () => void;
    readonly onLeaveGame: () => void;
    readonly onSaveConfiguration: Dispatch<SetStateAction<GameConfiguration>>;
}

export function AppScreen({
    screen,
    simulationReturnScreen,
    sessionId,
    canPlay,
    isGameLoading,
    gameLoadError,
    isRestoring,
    recoveryError,
    gameContainerRef,
    gameConfiguration,
    showOnlineOptions,
    opponentProfile,
    room,
    onScreenChange,
    onOpenPlay,
    onPlay,
    onOpponentProfileChange,
    onLocalPlay,
    onLeaveGame,
    onSaveConfiguration,
}: AppScreenProps) {
    const goTo = (target: AppScreenName) => () => onScreenChange(target);

    return (
        <div className={`app-shell${screen === "game" ? " game-active" : ""}`}>
            <header>
                <h1>DUNGEON DICE</h1>
            </header>

            <main>
                {isRestoring && <Notice role="status">Restauration de la partie…</Notice>}
                {recoveryError && <Notice role="alert">{recoveryError}</Notice>}
                {screen === "menu" && (
                    <MainMenu
                        onOpenPlay={onOpenPlay}
                        onEditDeck={goTo("deck")}
                        onOpenOptions={goTo("options-menu")}
                    />
                )}
                {screen === "simulation" && (
                    <Suspense fallback={<Notice role="status">Chargement du laboratoire…</Notice>}>
                        <SimulationLab
                            sessionId={sessionId}
                            configuration={gameConfiguration}
                            onBack={goTo(simulationReturnScreen)}
                            backLabel={
                                simulationReturnScreen === "options-menu"
                                    ? "Retour aux options"
                                    : "Retour à l’accueil"
                            }
                        />
                    </Suspense>
                )}
                {screen === "play-menu" && (
                    <>
                        {isGameLoading && (
                            <Notice role="status">Chargement du moteur de jeu…</Notice>
                        )}
                        {gameLoadError && <Notice role="alert">{gameLoadError}</Notice>}
                        <PlayMenu
                            canPlay={canPlay}
                            showOnlineOptions={showOnlineOptions}
                            opponentProfile={opponentProfile}
                            onBack={goTo("menu")}
                            onPlay={onPlay}
                            onOpponentProfileChange={onOpponentProfileChange}
                            onLocalPlay={onLocalPlay}
                            onOnline={room.createRoom}
                        />
                    </>
                )}
                {screen === "options-menu" && (
                    <OptionsMenu
                        onBack={goTo("menu")}
                        onConfigureRules={goTo("settings")}
                        onConfigureMonsters={goTo("monster-settings")}
                        onOpenSimulation={goTo("simulation")}
                    />
                )}
                {screen === "deck" && (
                    <DeckEditor deckSize={gameConfiguration.deckSize} onBack={goTo("menu")} />
                )}
                {screen === "settings" && (
                    <GameSettings
                        configuration={gameConfiguration}
                        onBack={goTo("options-menu")}
                        onSave={onSaveConfiguration}
                    />
                )}
                {screen === "monster-settings" && (
                    <MonsterSettings
                        configuration={gameConfiguration}
                        onBack={goTo("options-menu")}
                        onSave={onSaveConfiguration}
                    />
                )}
                {screen === "room" && room.roomRole && (
                    <RoomScreen
                        roomCode={room.roomCode}
                        isHost={room.roomRole === "host"}
                        roomStatus={room.roomStatus}
                        playerCount={room.playerCount}
                        roomError={room.roomError}
                        onBack={room.leaveRoom}
                        onJoinRoom={room.joinRoom}
                    />
                )}
                {screen === "game" && room.roomError && (
                    <Notice aria-live="polite">{room.roomError}</Notice>
                )}
                {screen === "game" && (
                    <div className="portrait-orientation-message" role="status" aria-live="polite">
                        <div>
                            <span aria-hidden="true">↻</span>
                            <strong>Tournez votre appareil</strong>
                            <p>Le plateau est plus lisible en mode paysage.</p>
                            <button className="portrait-return-button" onClick={onLeaveGame}>
                                MENU
                            </button>
                        </div>
                    </div>
                )}
                <div id="game-container" ref={gameContainerRef} aria-hidden={screen !== "game"} />
            </main>
        </div>
    );
}
