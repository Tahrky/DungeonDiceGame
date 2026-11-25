import type Phaser from "phaser";

import {
    getDefaultBoard,
    getRandomBoard,
    getTestBoard,
    type BoardDefinition,
} from "../game/boards";
import { getDefaultDeck, getSavedDeck, type GameSetup } from "../game/decks";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { RoomRole } from "./types";
import type { StartPayload } from "./roomProtocol";

export function getPlayerDeck(deckSize: number): string[] {
    return getSavedDeck(deckSize) ?? getDefaultDeck(deckSize);
}

export function getConfiguredBoard(configuration: GameConfiguration): BoardDefinition {
    if (configuration.testBoard) return getTestBoard();
    return configuration.randomBoard ? getRandomBoard() : getDefaultBoard();
}

export function createOnlineSetup(role: RoomRole, payload: StartPayload): GameSetup {
    const { hostDeck, guestDeck, board, configuration } = payload;
    const isHost = role === "host";
    return {
        mode: "online",
        localPlayer: isHost ? 1 : 2,
        isHost,
        playerDeck: isHost ? hostDeck : guestDeck,
        opponentDeck: isHost ? guestDeck : hostDeck,
        board,
        configuration,
    };
}

export function requireGame(game: Phaser.Game | null): Phaser.Game {
    if (!game) throw new Error("Le moteur de jeu n’est pas encore initialisé.");
    return game;
}

export function launchGameScene(game: Phaser.Game | null, setup: GameSetup): void {
    const { scene } = requireGame(game);
    scene.stop("GameScene");
    scene.start("GameScene", setup);
}
