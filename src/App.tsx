import { useCallback, useEffect, useRef, useState } from "react";
import {
    createClient,
    type Message,
    type PresenceMessage,
    type RealtimeChannel,
} from "@ably/pubsub-device";
import type Phaser from "phaser";

import { AppScreen } from "./components/AppScreen";
import type { AppScreenName } from "./components/AppScreen";
import { GAME_CONFIG } from "./config";
import { getDefaultBoard, getRandomBoard, getTestBoard, parseBoardDefinition } from "./game/boards";
import { getDefaultDeck, getSavedDeck, parseDeck, type GameSetup } from "./game/decks";
import { chooseDeck, type BotProfile } from "./game/botStrategy";
import type { GameSnapshot } from "./types/GameTypes";
import {
    getSavedGameConfiguration,
    parseGameConfiguration,
    type GameConfiguration,
} from "./game/gameConfiguration";
import type { PlayerId, RemoteGameCommand } from "./types/GameTypes";
import {
    clearGameSession,
    clearSimulationRun,
    getRecoverableScreen,
    getRecoverySessionId,
    loadGameSession,
    saveActiveScreen,
    saveGameSession,
} from "./sessionPersistence";

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

function getConfiguredBoard(configuration: GameConfiguration): NonNullable<GameSetup["board"]> {
    if (configuration.testBoard) return getTestBoard();
    return configuration.randomBoard ? getRandomBoard() : getDefaultBoard();
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
    board: NonNullable<GameSetup["board"]>,
    configuration: GameConfiguration,
): void {
    if (!game) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

    const setup: GameSetup = {
        mode: "online",
        localPlayer,
        isHost,
        playerDeck,
        opponentDeck,
        board,
        configuration,
    };
    game.scene.stop("GameScene");
    game.scene.start("GameScene", setup);
}

export function App() {
    const [sessionId] = useState(getRecoverySessionId);
    const gameContainerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const gameInitializationRef = useRef<Promise<void> | null>(null);
    const isMountedRef = useRef(false);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const hostClientIdRef = useRef<string | null>(null);
    const guestClientIdRef = useRef<string | null>(null);
    const roomStartRequestedRef = useRef(false);
    const activeGameSetupRef = useRef<GameSetup | null>(null);
    const activeGameRoomRef = useRef<{ roomCode: string; roomRole: RoomRole } | null>(null);
    const [game, setGame] = useState<Phaser.Game | null>(null);
    const [isGameLoading, setIsGameLoading] = useState(false);
    const [gameLoadError, setGameLoadError] = useState("");
    const [screen, setScreen] = useState<AppScreenName>(() => getRecoverableScreen() ?? "menu");
    const [isRestoring, setIsRestoring] = useState(() => getRecoverableScreen() === "game");
    const [recoveryError, setRecoveryError] = useState("");
    const [gameConfiguration, setGameConfiguration] = useState(getSavedGameConfiguration);
    const [opponentProfile, setOpponentProfile] = useState<BotProfile>("balanced");
    const [roomCode, setRoomCode] = useState("");
    const [roomRole, setRoomRole] = useState<RoomRole | null>(null);
    const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
    const [roomError, setRoomError] = useState("");
    const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
    const showOnlineOptions =
        !import.meta.env.DEV &&
        !["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

    const navigateTo = useCallback(
        (nextScreen: AppScreenName): void => {
            try {
                saveActiveScreen(
                    nextScreen === "game" || nextScreen === "simulation" ? nextScreen : null,
                );
            } catch (error) {
                setRecoveryError(
                    error instanceof Error
                        ? error.message
                        : "Impossible de mémoriser l’écran actif.",
                );
            }
            setScreen(nextScreen);
            if (nextScreen !== "game") {
                activeGameSetupRef.current = null;
                activeGameRoomRef.current = null;
                void clearGameSession(sessionId).catch((error: unknown) =>
                    setRecoveryError(
                        error instanceof Error
                            ? error.message
                            : "Impossible d’effacer la sauvegarde de la partie.",
                    ),
                );
            }
            if (nextScreen !== "simulation") {
                void clearSimulationRun(sessionId).catch((error: unknown) =>
                    setRecoveryError(
                        error instanceof Error
                            ? error.message
                            : "Impossible d’effacer la sauvegarde de la simulation.",
                    ),
                );
            }
        },
        [sessionId],
    );

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            gameRef.current?.destroy(true);
            gameRef.current = null;
        };
    }, []);

    const initializeGame = useCallback((): Promise<void> => {
        if (gameInitializationRef.current) return gameInitializationRef.current;
        if (gameRef.current) return Promise.resolve();

        setIsGameLoading(true);
        setGameLoadError("");
        const initialization = (async (): Promise<void> => {
            try {
                const [{ default: PhaserRuntime }, { GameScene }] = await Promise.all([
                    import("phaser"),
                    import("./scenes/GameScene"),
                ]);
                if (!isMountedRef.current) return;

                const parent = gameContainerRef.current;
                if (!parent) throw new Error("Conteneur du jeu manquant.");

                const instance = new PhaserRuntime.Game({
                    type: PhaserRuntime.AUTO,
                    width: GAME_CONFIG.screenWidth,
                    height: GAME_CONFIG.screenHeight,
                    parent,
                    backgroundColor: "#202a36",
                    scene: [GameScene],
                    scale: {
                        mode: PhaserRuntime.Scale.RESIZE,
                    },
                    render: {
                        antialias: true,
                    },
                });
                gameRef.current = instance;
                setGame(instance);
                instance.events.on("persist-game-snapshot", (snapshot: GameSnapshot) => {
                    const setup = activeGameSetupRef.current;
                    if (!setup) return;
                    const room = activeGameRoomRef.current;
                    void saveGameSession(
                        sessionId,
                        setup,
                        snapshot,
                        room?.roomCode ?? null,
                        room?.roomRole ?? null,
                    ).catch((error: unknown) =>
                        setRecoveryError(
                            error instanceof Error
                                ? `Sauvegarde de la partie impossible : ${error.message}`
                                : "Sauvegarde de la partie impossible.",
                        ),
                    );
                });

                const handleLeaveGame = (): void => {
                    instance.scene.stop("GameScene");
                    roomStartRequestedRef.current = false;
                    activeGameSetupRef.current = null;
                    activeGameRoomRef.current = null;
                    setRoomRole(null);
                    setRoomCode("");
                    setRoomPlayers([]);
                    setRoomError("");
                    navigateTo("menu");
                };
                instance.events.on("leave-game", handleLeaveGame);
                if (!instance.isBooted) {
                    await new Promise<void>((resolve) =>
                        instance.events.once(PhaserRuntime.Core.Events.READY, resolve),
                    );
                }
            } catch (error) {
                if (isMountedRef.current) {
                    setGameLoadError(`Chargement du jeu impossible : ${getErrorMessage(error)}`);
                }
            } finally {
                gameInitializationRef.current = null;
                if (isMountedRef.current) setIsGameLoading(false);
            }
        })();
        gameInitializationRef.current = initialization;
        return initialization;
    }, [navigateTo, sessionId]);

    function openPlayMenu(): void {
        navigateTo("play-menu");
        void initializeGame();
    }

    useEffect(() => {
        if (screen !== "game" || !isRestoring) return;

        let active = true;
        void loadGameSession(sessionId)
            .then(async (saved) => {
                if (!active) return;
                if (!saved) throw new Error("Aucune sauvegarde de partie à restaurer.");

                activeGameSetupRef.current = saved.setup;
                activeGameRoomRef.current =
                    saved.roomCode && saved.roomRole
                        ? { roomCode: saved.roomCode, roomRole: saved.roomRole }
                        : null;
                if (saved.roomRole === "host") roomStartRequestedRef.current = true;
                if (saved.roomCode && saved.roomRole) {
                    setRoomCode(saved.roomCode);
                    setRoomRole(saved.roomRole);
                }

                await initializeGame();
                if (!active) return;
                const instance = gameRef.current;
                if (!instance) throw new Error("Le moteur de jeu n’a pas pu être restauré.");
                instance.scene.stop("GameScene");
                instance.scene.start("GameScene", {
                    ...saved.setup,
                    resumeSnapshot: saved.snapshot,
                });
                setIsRestoring(false);
            })
            .catch((error: unknown) => {
                if (!active) return;
                setRecoveryError(
                    error instanceof Error
                        ? `Reprise de la partie impossible : ${error.message}`
                        : "Reprise de la partie impossible.",
                );
                try {
                    saveActiveScreen(null);
                } catch (storageError) {
                    setRecoveryError(
                        storageError instanceof Error
                            ? storageError.message
                            : "Impossible de mémoriser l’écran actif.",
                    );
                }
                navigateTo("menu");
                setIsRestoring(false);
            });

        return () => {
            active = false;
        };
    }, [initializeGame, isRestoring, screen, sessionId]);

    useEffect(() => {
        if (screen !== "game" || !game) return;

        const container = gameContainerRef.current;
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
    }, [game, screen]);

    useEffect(() => {
        const handleMenuShortcut = (event: KeyboardEvent): void => {
            const target = event.target;
            if (
                target instanceof HTMLElement &&
                (target.isContentEditable ||
                    target.closest("input, textarea, select, [contenteditable=true]"))
            ) {
                return;
            }
            if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
            if (screen === "menu" && event.key.toLowerCase() === "s") {
                event.preventDefault();
                navigateTo("simulation");
            }
        };
        window.addEventListener("keydown", handleMenuShortcut);
        return () => window.removeEventListener("keydown", handleMenuShortcut);
    }, [navigateTo, screen]);

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
            )
                return;

            const board = "board" in message.data ? parseBoardDefinition(message.data.board) : null;
            const configuration =
                "configuration" in message.data
                    ? parseGameConfiguration(message.data.configuration)
                    : null;
            const hostDeck = configuration
                ? parseDeck(message.data.hostDeck, configuration.deckSize)
                : null;
            const guestDeck = configuration
                ? parseDeck(message.data.guestDeck, configuration.deckSize)
                : null;
            if (!hostDeck || !guestDeck || !board || !configuration) {
                setRoomError("L’hôte a envoyé des données de partie invalides.");
                return;
            }
            try {
                activeGameSetupRef.current = {
                    mode: "online",
                    localPlayer: 2,
                    isHost: false,
                    playerDeck: guestDeck,
                    opponentDeck: hostDeck,
                    board,
                    configuration,
                };
                activeGameRoomRef.current = { roomCode, roomRole };
                startOnlineGame(
                    gameRef.current,
                    2,
                    false,
                    guestDeck,
                    hostDeck,
                    board,
                    configuration,
                );
                navigateTo("game");
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
                deck:
                    getSavedDeck(gameConfiguration.deckSize) ??
                    getDefaultDeck(gameConfiguration.deckSize),
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
    }, [game, gameConfiguration.deckSize, navigateTo, roomCode, roomRole]);

    function startComputerGame(profile: BotProfile): void {
        const instance = gameRef.current;
        if (!instance) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

        const setup: GameSetup = {
            mode: "computer",
            opponentProfile: profile,
            playerDeck:
                getSavedDeck(gameConfiguration.deckSize) ??
                getDefaultDeck(gameConfiguration.deckSize),
            opponentDeck: chooseDeck(
                gameConfiguration.monsters,
                profile,
                gameConfiguration.deckSize,
            ),
            board: getConfiguredBoard(gameConfiguration),
            configuration: gameConfiguration,
        };
        activeGameSetupRef.current = setup;
        activeGameRoomRef.current = null;
        instance.scene.stop("GameScene");
        instance.scene.start("GameScene", setup);
        navigateTo("game");
    }

    function startLocalGame(): void {
        const instance = gameRef.current;
        if (!instance) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

        const deck =
            getSavedDeck(gameConfiguration.deckSize) ?? getDefaultDeck(gameConfiguration.deckSize);
        const setup: GameSetup = {
            mode: "local",
            playerDeck: deck,
            opponentDeck: deck,
            board: getConfiguredBoard(gameConfiguration),
            configuration: gameConfiguration,
        };
        activeGameSetupRef.current = setup;
        activeGameRoomRef.current = null;
        instance.scene.stop("GameScene");
        instance.scene.start("GameScene", setup);
        navigateTo("game");
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
        navigateTo("room");
    }

    function joinRoom(code: string): void {
        roomStartRequestedRef.current = false;
        setRoomPlayers([]);
        setRoomError("");
        setRoomRole("guest");
        setRoomCode(code);
    }

    const startRoomGame = useCallback(async (): Promise<void> => {
        const hostDeck =
            getSavedDeck(gameConfiguration.deckSize) ?? getDefaultDeck(gameConfiguration.deckSize);
        const guestDeck = roomPlayers.find((player) => player.role === "guest")?.deck;
        const channel = channelRef.current;
        if (roomStartRequestedRef.current) return;
        if (roomRole !== "host" || !guestDeck || roomPlayers.length !== 2 || !channel) {
            setRoomError("Deux joueurs doivent être connectés pour démarrer.");
            return;
        }
        if (guestDeck.length !== gameConfiguration.deckSize) {
            setRoomError(
                `Le deck de l’invité doit contenir ${gameConfiguration.deckSize} monstres pour cette partie.`,
            );
            return;
        }

        roomStartRequestedRef.current = true;
        try {
            const board = getConfiguredBoard(gameConfiguration);
            activeGameSetupRef.current = {
                mode: "online",
                localPlayer: 1,
                isHost: true,
                playerDeck: hostDeck,
                opponentDeck: guestDeck,
                board,
                configuration: gameConfiguration,
            };
            activeGameRoomRef.current = { roomCode, roomRole: "host" };
            await channel.publish("start", {
                hostDeck,
                guestDeck,
                board,
                configuration: gameConfiguration,
            });
            startOnlineGame(
                gameRef.current,
                1,
                true,
                hostDeck,
                guestDeck,
                board,
                gameConfiguration,
            );
            navigateTo("game");
        } catch (error) {
            roomStartRequestedRef.current = false;
            setRoomStatus("error");
            setRoomError(getErrorMessage(error));
        }
    }, [gameConfiguration, navigateTo, roomCode, roomPlayers, roomRole]);

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
        navigateTo("play-menu");
    }

    function leaveGame(): void {
        const instance = gameRef.current;
        if (!instance) throw new Error("Le moteur de jeu n’est pas encore initialisé.");

        instance.events.emit("leave-game");
    }

    return (
        <AppScreen
            screen={screen}
            sessionId={sessionId}
            game={game}
            gameLoading={isGameLoading}
            gameLoadError={gameLoadError}
            isRestoring={isRestoring}
            recoveryError={recoveryError}
            gameContainerRef={gameContainerRef}
            gameConfiguration={gameConfiguration}
            showOnlineOptions={showOnlineOptions}
            roomCode={roomCode}
            roomRole={roomRole}
            roomStatus={roomStatus}
            roomPlayerCount={roomPlayers.length}
            roomError={roomError}
            opponentProfile={opponentProfile}
            onScreenChange={navigateTo}
            onOpenPlay={openPlayMenu}
            onPlay={startComputerGame}
            onOpponentProfileChange={setOpponentProfile}
            onLocalPlay={startLocalGame}
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            onLeaveGame={leaveGame}
            onLeaveRoom={leaveRoom}
            onSaveConfiguration={setGameConfiguration}
        />
    );
}
