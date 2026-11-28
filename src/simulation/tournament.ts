import type { BotEngineType } from "../game/botConfiguration";
import type { MatchResult } from "./types";
import { createAITournamentPairs } from "./workerPool";

export interface EngineTournamentStats {
    engine: BotEngineType;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    drawRate: number;
    lossRate: number;
    points: number;
    averageTurns: number;
    asPlayer1: { played: number; points: number };
    asPlayer2: { played: number; points: number };
}

export function analyzeEngineTournament(
    matches: readonly Pick<MatchResult, "winner" | "turns" | "engines">[],
): EngineTournamentStats[] {
    const engines: readonly BotEngineType[] = ["heuristic", "minimax", "hybrid"];
    const stats = new Map<BotEngineType, EngineTournamentStats>();
    for (const engine of engines) {
        stats.set(engine, {
            engine,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            winRate: 0,
            drawRate: 0,
            lossRate: 0,
            points: 0,
            averageTurns: 0,
            asPlayer1: { played: 0, points: 0 },
            asPlayer2: { played: 0, points: 0 },
        });
    }
    const turns = new Map<BotEngineType, number>();
    for (const match of matches) {
        for (const player of [1, 2] as const) {
            const engine = match.engines?.[player];
            if (!engine) continue;
            const result = stats.get(engine)!;
            result.played++;
            turns.set(engine, (turns.get(engine) ?? 0) + match.turns);
            const position = player === 1 ? result.asPlayer1 : result.asPlayer2;
            position.played++;
            if (match.winner === null) {
                result.draws++;
                result.points += 0.5;
                position.points += 0.5;
            } else if (match.winner === player) {
                result.wins++;
                result.points++;
                position.points++;
            } else {
                result.losses++;
            }
        }
    }
    for (const result of stats.values()) {
        result.winRate = result.played > 0 ? result.wins / result.played : 0;
        result.drawRate = result.played > 0 ? result.draws / result.played : 0;
        result.lossRate = result.played > 0 ? result.losses / result.played : 0;
        result.averageTurns = result.played > 0 ? (turns.get(result.engine) ?? 0) / result.played : 0;
    }
    return [...stats.values()].sort(
        (first, second) => second.points - first.points || second.wins - first.wins,
    );
}

export function getAITournamentConfrontations() {
    return createAITournamentPairs();
}
