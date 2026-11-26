import { byPlayer, PLAYER_IDS } from "../../game/matchRules";
import { createOutcomeRate } from "../statistics";
import type { BotProfile } from "../types";
import { addMatchMonsterStatistics, createMonsterStatistics, getMonsterAnalyses } from "./monsters";
import type { ProfileAnalytics, SimulationData } from "./types";

export function analyzeProfileData(data: SimulationData, profile: BotProfile): ProfileAnalytics {
    const statistics = createMonsterStatistics(data.configuration.monsters);
    const winsByPlayer = byPlayer(() => 0);
    const winsByFinishReason = { baseDestroyed: 0, monstersEliminated: 0 };
    const turns = new Map<number, number>();
    let matchCount = 0;
    let totalTurns = 0;
    let draws = 0;
    let hasDetailedHistory = true;

    for (const match of data.matches) {
        const players = PLAYER_IDS.filter((player) => match.profiles[player] === profile);
        if (players.length === 0) continue;

        matchCount++;
        totalTurns += match.turns;
        turns.set(match.turns, (turns.get(match.turns) ?? 0) + 1);
        if (match.history.length === 0) hasDetailedHistory = false;
        addMatchMonsterStatistics(statistics, match, players);

        if (match.winner === null) {
            draws++;
        } else if (players.includes(match.winner)) {
            winsByPlayer[match.winner]++;
            if (match.finishReason !== "turnLimit") winsByFinishReason[match.finishReason]++;
        }
    }

    return {
        matchCount,
        averageTurns: matchCount > 0 ? totalTurns / matchCount : null,
        winRate: createOutcomeRate(winsByPlayer[1] + winsByPlayer[2], draws, matchCount).winRate,
        winsByPlayer,
        winsByFinishReason,
        draws,
        turnDistribution: [...turns.entries()]
            .sort(([first], [second]) => first - second)
            .map(([turns, matches]) => ({ turns, matches })),
        monsters: getMonsterAnalyses(statistics, data.configuration.monsters),
        hasDetailedHistory,
    };
}
