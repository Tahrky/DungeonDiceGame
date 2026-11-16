import type { RefObject, Dispatch, SetStateAction } from "react";
import type Phaser from "phaser";

import { DeckEditor } from "./DeckEditor";
import { GameSettings } from "./GameSettings";
import { MainMenu } from "./MainMenu";
import { MonsterSettings } from "./MonsterSettings";
import { OptionsMenu } from "./OptionsMenu";
import { PlayMenu } from "./PlayMenu";
import { RoomScreen } from "./RoomScreen";
import type { GameConfiguration } from "../game/gameConfiguration";

export type AppScreenName =
    | "menu"
    | "play-menu"
    | "options-menu"
    | "deck"
    | "settings"
    | "monster-settings"
    | "room"
    | "game";

interface AppScreenProps {
    screen: AppScreenName;
    game: Phaser.Game | null;
    gameContainerRef: RefObject<HTMLDivElement | null>;
    gameConfiguration: GameConfiguration;
    showOnlineOptions: boolean;
    roomCode: string;
    roomRole: "host" | "guest" | null;
    roomStatus: "connecting" | "connected" | "error";
    roomPlayerCount: number;
    roomError: string;
    onScreenChange: (screen: AppScreenName) => void;
    onPlay: () => void;
    onLocalPlay: () => void;
    onCreateRoom: () => void;
    onJoinRoom: (code: string) => void;
    onLeaveGame: () => void;
    onLeaveRoom: () => void;
    onSaveConfiguration: Dispatch<SetStateAction<GameConfiguration>>;
}

export function AppScreen({
    screen,
    game,
    gameContainerRef,
    gameConfiguration,
    showOnlineOptions,
    roomCode,
    roomRole,
    roomStatus,
    roomPlayerCount,
    roomError,
    onScreenChange,
    onPlay,
    onLocalPlay,
    onCreateRoom,
    onJoinRoom,
    onLeaveGame,
    onLeaveRoom,
    onSaveConfiguration,
}: AppScreenProps) {
    return (
        <div className={`app-shell${screen === "game" ? " game-active" : ""}`}>
            <header>
                <h1>DUNGEON DICE</h1>
            </header>

            <main>
                {screen === "menu" && (
                    <MainMenu
                        onOpenPlay={() => onScreenChange("play-menu")}
                        onEditDeck={() => onScreenChange("deck")}
                        onOpenOptions={() => onScreenChange("options-menu")}
                    />
                )}
                {screen === "play-menu" && (
                    <PlayMenu
                        canPlay={game !== null}
                        showOnlineOptions={showOnlineOptions}
                        onBack={() => onScreenChange("menu")}
                        onPlay={onPlay}
                        onLocalPlay={onLocalPlay}
                        onOnline={onCreateRoom}
                    />
                )}
                {screen === "options-menu" && (
                    <OptionsMenu
                        onBack={() => onScreenChange("menu")}
                        onConfigureRules={() => onScreenChange("settings")}
                        onConfigureMonsters={() => onScreenChange("monster-settings")}
                    />
                )}
                {screen === "deck" && (
                    <DeckEditor
                        deckSize={gameConfiguration.deckSize}
                        onBack={() => onScreenChange("menu")}
                    />
                )}
                {screen === "settings" && (
                    <GameSettings
                        configuration={gameConfiguration}
                        onBack={() => onScreenChange("options-menu")}
                        onSave={onSaveConfiguration}
                    />
                )}
                {screen === "monster-settings" && (
                    <MonsterSettings
                        configuration={gameConfiguration}
                        onBack={() => onScreenChange("options-menu")}
                        onSave={onSaveConfiguration}
                    />
                )}
                {screen === "room" && roomRole && (
                    <RoomScreen
                        roomCode={roomCode}
                        isHost={roomRole === "host"}
                        roomStatus={roomStatus}
                        playerCount={roomPlayerCount}
                        roomError={roomError}
                        onBack={onLeaveRoom}
                        onJoinRoom={onJoinRoom}
                    />
                )}
                {screen === "game" && roomError && (
                    <output className="notice" aria-live="polite">
                        {roomError}
                    </output>
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
