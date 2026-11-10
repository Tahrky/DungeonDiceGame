import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type Message, type PresenceMessage, type RealtimeChannel } from "@ably/pubsub-device";
import Phaser from "phaser";

import { DeckEditor } from "./components/DeckEditor";
import { MainMenu } from "./components/MainMenu";
import { RoomScreen } from "./components/RoomScreen";
import { GAME_CONFIG } from "./config";
import { getDefaultDeck, getSavedDeck, parseDeck, type GameSetup } from "./game/decks";
import { GameScene } from "./scenes/GameScene";

import type { GameSnapshot, PlayerId, RemoteGameCommand } from "./types/GameTypes";

type Screen = "menu" | "deck" | "room" | "game";
type RoomRole = "host" | "guest";
type RoomStatus = "connecting" | "connected" | "error";

interface RoomPlayer {
    clientId: string;
    role: RoomRole;
    deck: string[];
}

const ROOM_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Erreur de connexion inconnue.";
}

function readRoomPlayer(member: PresenceMessage): RoomPlayer | null {
    const data = member.data;
    if (typeof member.clientId !== "string" || typeof data !== "object" || data === null) {
        return null;
    }

    const role = "role" in data ? data.role : null;
    const deck = "deck" in data ? parseDeck(data.deck) : null;
    if ((role !== "host" && role !== "guest") || !deck) return null;

    return { clientId: member.clientId, role, deck };
}

function startOnlineGame(
    game: Phaser.Game | null,
    localPlayer: PlayerId,
    isHost: boolean,
    playerDeck: string[],
    opponentDeck: string[],
): void {
    if (!game) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

    const setup: GameSetup = {
        mode: "online",
        localPlayer,
        isHost,
        playerDeck,
        opponentDeck,
    };
    game.scene.stop("GameScene");
    game.scene.start("GameScene", setup);
}

export function App() {
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const hostClientIdRef = useRef<string | null>(null);
    const guestClientIdRef = useRef<string | null>(null);
    const roomStartRequestedRef = useRef(false);
    const [game, setGame] = useState<Phaser.Game | null>(null);
    const [screen, setScreen] = useState<Screen>("menu");
    const [roomCode, setRoomCode] = useState("");
    const [roomRole, setRoomRole] = useState<RoomRole | null>(null);
    const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
    const [roomError, setRoomError] = useState("");
    const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);

    useEffect(() => {
        const parent = gameContainerRef.current;
        if (!parent) throw new Error("Conteneur du jeu manquant.");

        const instance = new Phaser.Game({
            type: Phaser.AUTO,
            width: GAME_CONFIG.screenWidth,
            height: GAME_CONFIG.screenHeight,
            parent,
            backgroundColor: "#202a36",
            scene: [GameScene],
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
            },
            render: {
                antialias: false,
                pixelArt: true,
            },
        });
        gameRef.current = instance;
        setGame(instance);

        return () => {
            gameRef.current = null;
            instance.destroy(true);
        };
    }, []);

    useEffect(() => {
        if (screen === "game" && game) game.scale.refresh();
    }, [game, screen]);

    useEffect(() => {
        if (!roomCode || !roomRole) return;

        let active = true;
        setRoomStatus("connecting");
        setRoomError("");
        hostClientIdRef.current = null;
        guestClientIdRef.current = null;

        const realtime = createClient({
            authUrl: `/api/ably-token?roomCode=${encodeURIComponent(roomCode)}`,
            authMethod: "GET",
        });
        const channel = realtime.channels.get(`dungeon-dice:room:${roomCode}`);
        channelRef.current = channel;

        async function updatePlayers(): Promise<void> {
            try {
                const members = await channel.presence.get();
                if (!active) return;

                const uniquePlayers = new Map<string, RoomPlayer>();
                for (const member of members) {
                    const player = readRoomPlayer(member);
                    if (player) uniquePlayers.set(player.clientId, player);
                }
                const players = [...uniquePlayers.values()];
                hostClientIdRef.current =
                    players.find((player) => player.role === "host")?.clientId ?? null;
                guestClientIdRef.current =
                    players.find((player) => player.role === "guest")?.clientId ?? null;
                setRoomPlayers(players);
            } catch (error) {
                if (active) {
                    setRoomStatus("error");
                    setRoomError(`Impossible de lire les joueurs : ${getErrorMessage(error)}`);
                }
            }
        }

        const handlePresence = (): void => {
            void updatePlayers();
        };
        const handleStart = async (message: Message): Promise<void> => {
            if (roomRole !== "guest") return;
            if (hostClientIdRef.current === null) await updatePlayers();
            if (
                !active ||
                message.clientId !== hostClientIdRef.current ||
                typeof message.data !== "object" ||
                message.data === null ||
                !("hostDeck" in message.data) ||
                !("guestDeck" in message.data)
            ) return;

            const hostDeck = parseDeck(message.data.hostDeck);
            const guestDeck = parseDeck(message.data.guestDeck);
            if (!hostDeck || !guestDeck) {
                setRoomError("L’hôte a envoyé des decks invalides.");
                return;
            }
            try {
                startOnlineGame(gameRef.current, 2, false, guestDeck, hostDeck);
                setScreen("game");
            } catch (error) {
                setRoomStatus("error");
                setRoomError(getErrorMessage(error));
            }
        };
        const handleGameState = (message: Message): void => {
            if (roomRole === "guest" && message.clientId === hostClientIdRef.current) {
                gameRef.current?.events.emit("remote-game-state", message.data);
            }
        };
        const handleGameCommand = (message: Message): void => {
            if (
                roomRole === "host" &&
                message.clientId === guestClientIdRef.current &&
                typeof message.data === "object" &&
                message.data !== null &&
                "command" in message.data
            ) {
                gameRef.current?.events.emit("remote-game-command", message.data.command);
            }
        };

        const publishGameState = (snapshot: GameSnapshot): void => {
            if (roomRole !== "host") return;
            void channel.publish("game-state", snapshot).catch((error: unknown) => {
                if (active) setRoomError(`Échec de synchronisation : ${getErrorMessage(error)}`);
            });
        };
        const publishGameCommand = (command: RemoteGameCommand): void => {
            if (roomRole !== "guest") return;
            void channel.publish("game-command", { command }).catch((error: unknown) => {
                if (active) setRoomError(`Action non envoyée : ${getErrorMessage(error)}`);
            });
        };

        const instance = gameRef.current;
        instance?.events.on("remote-game-state-out", publishGameState);
        instance?.events.on("remote-game-command-out", publishGameCommand);

        async function connect(): Promise<void> {
            await Promise.all([
                channel.presence.subscribe(handlePresence),
                channel.subscribe("start", handleStart),
                channel.subscribe("game-state", handleGameState),
                channel.subscribe("game-command", handleGameCommand),
            ]);
            await channel.presence.enter({
                role: roomRole,
                deck: getSavedDeck() ?? getDefaultDeck(),
            });
            if (!active) return;

            setRoomStatus("connected");
            await updatePlayers();
        }

        void connect().catch((error: unknown) => {
            if (active) {
                setRoomStatus("error");
                setRoomError(`Connexion à Ably impossible : ${getErrorMessage(error)}`);
            }
        });

        return () => {
            active = false;
            channel.presence.unsubscribe(handlePresence);
            channel.unsubscribe("start", handleStart);
            channel.unsubscribe("game-state", handleGameState);
            channel.unsubscribe("game-command", handleGameCommand);
            instance?.events.off("remote-game-state-out", publishGameState);
            instance?.events.off("remote-game-command-out", publishGameCommand);
            if (channelRef.current === channel) channelRef.current = null;
            realtime.close();
        };
    }, [roomCode, roomRole]);

    function startComputerGame(): void {
        const instance = gameRef.current;
        if (!instance) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

        const setup: GameSetup = {
            mode: "computer",
            playerDeck: getSavedDeck() ?? getDefaultDeck(),
            opponentDeck: getDefaultDeck(),
        };
        instance.scene.stop("GameScene");
        instance.scene.start("GameScene", setup);
        setScreen("game");
    }

    function createRoom(): void {
        const randomValues = window.crypto.getRandomValues(new Uint8Array(8));
        const code = [...randomValues]
            .map((value) => ROOM_CODE_CHARACTERS[value % ROOM_CODE_CHARACTERS.length])
            .join("");
        roomStartRequestedRef.current = false;
        setRoomPlayers([]);
        setRoomError("");
        setRoomRole("host");
        setRoomCode(code);
        setScreen("room");
    }

    function joinRoom(code: string): void {
        roomStartRequestedRef.current = false;
        setRoomPlayers([]);
        setRoomError("");
        setRoomRole("guest");
        setRoomCode(code);
    }

    const startRoomGame = useCallback(async (): Promise<void> => {
        const hostDeck = getSavedDeck() ?? getDefaultDeck();
        const guestDeck = roomPlayers.find((player) => player.role === "guest")?.deck;
        const channel = channelRef.current;
        if (roomStartRequestedRef.current) return;
        if (roomRole !== "host" || !guestDeck || roomPlayers.length !== 2 || !channel) {
            setRoomError("Deux joueurs doivent être connectés pour démarrer.");
            return;
        }

        roomStartRequestedRef.current = true;
        try {
            await channel.publish("start", { hostDeck, guestDeck });
            startOnlineGame(gameRef.current, 1, true, hostDeck, guestDeck);
            setScreen("game");
        } catch (error) {
            roomStartRequestedRef.current = false;
            setRoomStatus("error");
            setRoomError(getErrorMessage(error));
        }
    }, [roomPlayers, roomRole]);

    useEffect(() => {
        if (roomRole === "host" && roomStatus === "connected" && roomPlayers.length === 2) {
            void startRoomGame();
        }
    }, [roomPlayers, roomRole, roomStatus, startRoomGame]);

    function leaveRoom(): void {
        roomStartRequestedRef.current = false;
        setRoomRole(null);
        setRoomCode("");
        setRoomPlayers([]);
        setRoomError("");
        setScreen("menu");
    }

    return (
        <div id="app">
            <header>
                <h1>DUNGEON DICE</h1>
            </header>

            <main>
                {screen === "menu" && (
                    <MainMenu
                        canPlay={game !== null}
                        onPlay={startComputerGame}
                        onCreateRoom={createRoom}
                        onEditDeck={() => setScreen("deck")}
                    />
                )}
                {screen === "deck" && <DeckEditor onBack={() => setScreen("menu")} />}
                {screen === "room" && roomRole && (
                    <RoomScreen
                        roomCode={roomCode}
                        isHost={roomRole === "host"}
                        roomStatus={roomStatus}
                        playerCount={roomPlayers.length}
                        roomError={roomError}
                        onBack={leaveRoom}
                        onJoinRoom={joinRoom}
                    />
                )}
                {screen === "game" && roomError && (
                    <output className="notice" aria-live="polite">
                        {roomError}
                    </output>
                )}
                <div id="game-container" ref={gameContainerRef} hidden={screen !== "game"} />
            </main>
        </div>
    );
}
