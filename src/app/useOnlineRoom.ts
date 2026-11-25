import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createClient, type Message, type RealtimeChannel } from "@ably/pubsub-device";
import type Phaser from "phaser";

import type { GameConfiguration } from "../game/gameConfiguration";
import type { GameSnapshot, RemoteGameCommand } from "../types/GameTypes";
import { getErrorMessage } from "../utils/errors";
import { isRecord } from "../utils/guards";
import { createOnlineSetup, getConfiguredBoard, getPlayerDeck, launchGameScene } from "./gameSetup";
import {
    createRoomCode,
    isStartMessageData,
    parseStartPayload,
    readRoomPlayer,
    type StartPayload,
} from "./roomProtocol";
import type {
    ActiveGame,
    ActiveRoom,
    AppScreenName,
    RoomPlayer,
    RoomRole,
    RoomStatus,
} from "./types";

interface OnlineRoomOptions {
    readonly game: Phaser.Game | null;
    readonly gameRef: RefObject<Phaser.Game | null>;
    readonly gameConfiguration: GameConfiguration;
    readonly activeGameRef: RefObject<ActiveGame | null>;
    readonly navigateTo: (screen: AppScreenName) => void;
}

export type OnlineRoom = ReturnType<typeof useOnlineRoom>;

export function useOnlineRoom({
    game,
    gameRef,
    gameConfiguration,
    activeGameRef,
    navigateTo,
}: OnlineRoomOptions) {
    const [roomCode, setRoomCode] = useState("");
    const [roomRole, setRoomRole] = useState<RoomRole | null>(null);
    const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
    const [roomError, setRoomError] = useState("");
    const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const hostClientIdRef = useRef<string | null>(null);
    const guestClientIdRef = useRef<string | null>(null);
    const roomStartRequestedRef = useRef(false);
    const { deckSize } = gameConfiguration;

    const changeRoom = useCallback((nextRoom: ActiveRoom | null, isStartRequested = false) => {
        roomStartRequestedRef.current = isStartRequested;
        setRoomPlayers([]);
        setRoomError("");
        setRoomRole(nextRoom?.roomRole ?? null);
        setRoomCode(nextRoom?.roomCode ?? "");
    }, []);
    const resetRoom = useCallback(() => changeRoom(null), [changeRoom]);
    const restoreRoom = useCallback(
        (restoredRoom: ActiveRoom | null) =>
            changeRoom(restoredRoom, restoredRoom?.roomRole === "host"),
        [changeRoom],
    );

    const failRoom = useCallback((message: string): void => {
        setRoomStatus("error");
        setRoomError(message);
    }, []);

    const startHostGame = useCallback(async (): Promise<void> => {
        const guestDeck = roomPlayers.find((player) => player.role === "guest")?.deck;
        const channel = channelRef.current;
        if (roomStartRequestedRef.current) return;
        if (roomRole !== "host" || !guestDeck || roomPlayers.length !== 2 || !channel) {
            setRoomError("Deux joueurs doivent être connectés pour démarrer.");
            return;
        }
        if (guestDeck.length !== deckSize) {
            setRoomError(
                `Le deck de l’invité doit contenir ${deckSize} monstres pour cette partie.`,
            );
            return;
        }

        roomStartRequestedRef.current = true;
        try {
            const payload: StartPayload = {
                hostDeck: getPlayerDeck(deckSize),
                guestDeck,
                board: getConfiguredBoard(gameConfiguration),
                configuration: gameConfiguration,
            };
            const setup = createOnlineSetup("host", payload);
            activeGameRef.current = { setup, room: { roomCode, roomRole } };
            await channel.publish("start", payload);
            launchGameScene(gameRef.current, setup);
            navigateTo("game");
        } catch (error) {
            roomStartRequestedRef.current = false;
            failRoom(getErrorMessage(error));
        }
    }, [
        activeGameRef,
        deckSize,
        failRoom,
        gameConfiguration,
        gameRef,
        navigateTo,
        roomCode,
        roomPlayers,
        roomRole,
    ]);

    useEffect(() => {
        if (roomRole === "host" && roomStatus === "connected" && roomPlayers.length === 2) {
            void startHostGame();
        }
    }, [roomPlayers, roomRole, roomStatus, startHostGame]);

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

        const reportFailure = (prefix: string, error: unknown, isFatal: boolean): void => {
            if (!active) return;
            const message = `${prefix} : ${getErrorMessage(error)}`;
            if (isFatal) failRoom(message);
            else setRoomError(message);
        };

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
                reportFailure("Impossible de lire les joueurs", error, true);
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
                !isStartMessageData(message.data)
            ) {
                return;
            }

            const payload = parseStartPayload(message.data);
            if (!payload) {
                setRoomError("L’hôte a envoyé des données de partie invalides.");
                return;
            }
            try {
                const setup = createOnlineSetup("guest", payload);
                activeGameRef.current = { setup, room: { roomCode, roomRole } };
                launchGameScene(gameRef.current, setup);
                navigateTo("game");
            } catch (error) {
                failRoom(getErrorMessage(error));
            }
        };
        const handleGameState = (message: Message): void => {
            if (roomRole === "guest" && message.clientId === hostClientIdRef.current) {
                game?.events.emit("remote-game-state", message.data);
            }
        };
        const handleGameCommand = (message: Message): void => {
            if (
                roomRole === "host" &&
                message.clientId === guestClientIdRef.current &&
                isRecord(message.data) &&
                "command" in message.data
            ) {
                game?.events.emit("remote-game-command", message.data.command);
            }
        };

        const publishGameState = (snapshot: GameSnapshot): void => {
            if (roomRole !== "host") return;
            void channel
                .publish("game-state", snapshot)
                .catch((error: unknown) => reportFailure("Échec de synchronisation", error, false));
        };
        const publishGameCommand = (command: RemoteGameCommand): void => {
            if (roomRole !== "guest") return;
            void channel
                .publish("game-command", { command })
                .catch((error: unknown) => reportFailure("Action non envoyée", error, false));
        };
        game?.events.on("remote-game-state-out", publishGameState);
        game?.events.on("remote-game-command-out", publishGameCommand);

        async function connect(): Promise<void> {
            await Promise.all([
                channel.presence.subscribe(handlePresence),
                channel.subscribe("start", handleStart),
                channel.subscribe("game-state", handleGameState),
                channel.subscribe("game-command", handleGameCommand),
            ]);
            await channel.presence.enter({ role: roomRole, deck: getPlayerDeck(deckSize) });
            if (!active) return;

            setRoomStatus("connected");
            await updatePlayers();
        }

        void connect().catch((error: unknown) =>
            reportFailure("Connexion à Ably impossible", error, true),
        );

        return () => {
            active = false;
            channel.presence.unsubscribe(handlePresence);
            channel.unsubscribe("start", handleStart);
            channel.unsubscribe("game-state", handleGameState);
            channel.unsubscribe("game-command", handleGameCommand);
            game?.events.off("remote-game-state-out", publishGameState);
            game?.events.off("remote-game-command-out", publishGameCommand);
            if (channelRef.current === channel) channelRef.current = null;
            realtime.close();
        };
    }, [activeGameRef, deckSize, failRoom, game, gameRef, navigateTo, roomCode, roomRole]);

    const createRoom = (): void => {
        changeRoom({ roomCode: createRoomCode(), roomRole: "host" });
        navigateTo("room");
    };
    const joinRoom = (code: string): void => changeRoom({ roomCode: code, roomRole: "guest" });
    const leaveRoom = (): void => {
        resetRoom();
        navigateTo("play-menu");
    };

    return {
        roomCode,
        roomRole,
        roomStatus,
        roomError,
        playerCount: roomPlayers.length,
        createRoom,
        joinRoom,
        leaveRoom,
        resetRoom,
        restoreRoom,
    };
}
