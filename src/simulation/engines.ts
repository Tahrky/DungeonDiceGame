import type { BoardDefinition } from "../game/boards";
import type { BotEngineType } from "../game/botConfiguration";
import type { PlayerId } from "../types/GameTypes";
import type { MatchState } from "./matchState";

export const BOT_ENGINE_TYPES: readonly BotEngineType[] = [
    "heuristic",
    "minimax",
    "hybrid",
];

export interface BotEngineDecisionContext {
    readonly state: MatchState;
    readonly board: BoardDefinition;
    readonly player: PlayerId;
}

export interface BotEngine {
    readonly type: BotEngineType;
    usesSearch: boolean;
    usesHeuristicOrdering: boolean;
}

export function getBotEngine(type: BotEngineType): BotEngine {
    switch (type) {
        case "heuristic":
            return { type, usesSearch: false, usesHeuristicOrdering: true };
        case "minimax":
            return { type, usesSearch: true, usesHeuristicOrdering: false };
        case "hybrid":
            return { type, usesSearch: true, usesHeuristicOrdering: true };
    }
}
