import type { GameSetup } from "../game/decks";

export type AppScreenName =
    | "menu"
    | "play-menu"
    | "options-menu"
    | "deck"
    | "settings"
    | "monster-settings"
    | "room"
    | "simulation"
    | "game";

export type RoomRole = "host" | "guest";
export type RoomStatus = "connecting" | "connected" | "error";

export interface RoomPlayer {
    readonly clientId: string;
    readonly role: RoomRole;
    readonly deck: string[];
}

export interface ActiveRoom {
    readonly roomCode: string;
    readonly roomRole: RoomRole;
}

export interface ActiveGame {
    readonly setup: GameSetup;
    readonly room: ActiveRoom | null;
}
