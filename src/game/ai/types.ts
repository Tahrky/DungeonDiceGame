import type { BotProfile, BotTactic } from "../botStrategy";
import type { BoardDefinition } from "../boards";
import type { DiceReserve, PlacedMonster, PlayerId, Position } from "../../types/GameTypes";

export interface StrategicSnapshot {
    board: BoardDefinition;
    blockedCells?: readonly Position[];
    health: Record<PlayerId, number>;
    initialHealth: number;
    monsters: readonly PlacedMonster[];
    reserves: Record<PlayerId, DiceReserve>;
    profile: BotProfile;
    tactics: Record<PlayerId, BotTactic>;
    currentPlayer: PlayerId;
    turn: number;
}

export interface RoleAssignment {
    monsterId: string;
    role: "advance" | "hold" | "defend" | "intercept" | "support" | "patrol";
    target?: Position;
}
