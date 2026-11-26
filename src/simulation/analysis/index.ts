import { DICE_SYMBOLS } from "../../data/dice";
import { createEmptyDiceReserve } from "../../game/diceResources";
import { byPlayer, PLAYER_IDS } from "../../game/matchRules";
import type { DiceReserve, PlayerId } from "../../types/GameTypes";
import { createOutcomeRate } from "../statistics";
import type { BotProfile } from "../types";
import { addMatchMonsterStatistics, createMonsterStatistics, getMonsterAnalyses } from "./monsters";
import type { AnalyzableMatch, SimulationAnalytics, SimulationData } from "./types";

export type * from "./types";
export { analyzeMatchMonsters } from "./monsters";
export { parseSimulationData } from "./parse";
export { analyzeProfileData } from "./profiles";
export { calculateWilsonInterval } from "../statistics";
export type { OutcomeRate, WilsonInterval } from "../statistics";

interface PlayerTotals {
    deployments: number;
    monstersLost: number;
    damageReceived: number;
    remainingResources: number;
    symbolsSpent: DiceReserve;
    matchesWithSymbolsSpent: number;
    conversionLosses: number;
    matchesWithConversionLosses: number;
    decisionTimeMs: number;
    positionsExplored: number;
    wins: number;
}

interface Outcome {
    wins: number;
    draws: number;
    matches: number;
}

function createPlayerTotals(): PlayerTotals {
    return {
        deployments: 0,
        monstersLost: 0,
        damageReceived: 0,
        remainingResources: 0,
        symbolsSpent: createEmptyDiceReserve(),
        matchesWithSymbolsSpent: 0,
        conversionLosses: 0,
        matchesWithConversionLosses: 0,
        decisionTimeMs: 0,
        positionsExplored: 0,
        wins: 0,
    };
}

function createOutcome(): Outcome {
    return { wins: 0, draws: 0, matches: 0 };
}

function toOutcomeRate({ wins, draws, matches }: Outcome) {
    return createOutcomeRate(wins, draws, matches);
}

function addPlayerStatistics(totals: PlayerTotals, match: AnalyzableMatch, player: PlayerId): void {
    const stats = match.statistics[player];
    totals.deployments += stats.summoned;
    totals.monstersLost += stats.monstersLost ?? 0;
    totals.damageReceived += stats.damageReceived ?? 0;
    totals.remainingResources += Object.values(match.remainingResources[player]).reduce(
        (total, amount) => total + amount,
        0,
    );
    if (stats.symbolsSpent) {
        for (const symbol of DICE_SYMBOLS)
            totals.symbolsSpent[symbol] += stats.symbolsSpent[symbol];
        totals.matchesWithSymbolsSpent++;
    }
    if (stats.conversionLosses !== undefined) {
        totals.conversionLosses += stats.conversionLosses;
        totals.matchesWithConversionLosses++;
    }
    totals.decisionTimeMs += stats.decisionTimeMs ?? 0;
    totals.positionsExplored += stats.positionsExplored ?? 0;
}

function averageSymbolsSpent({ symbolsSpent, matchesWithSymbolsSpent }: PlayerTotals) {
    if (matchesWithSymbolsSpent === 0) return null;
    return {
        invocation: symbolsSpent.invocation / matchesWithSymbolsSpent,
        attack: symbolsSpent.attack / matchesWithSymbolsSpent,
        movement: symbolsSpent.movement / matchesWithSymbolsSpent,
    };
}

export function analyzeSimulationData(data: SimulationData): SimulationAnalytics {
    const monsterStatistics = createMonsterStatistics(data.configuration.monsters);
    const players = byPlayer(createPlayerTotals);
    const startingPlayerOutcomes = byPlayer(createOutcome);
    const profileOutcomes: Partial<Record<BotProfile, Outcome>> = {};
    const winsByProfile: Partial<Record<BotProfile, number>> = {};
    const winsByFinishReason = { baseDestroyed: 0, monstersEliminated: 0 };
    const turns = new Map<number, number>();
    let turnLimitMatches = 0;
    let draws = 0;
    let totalTurns = 0;

    for (const match of data.matches) {
        addMatchMonsterStatistics(monsterStatistics, match);
        totalTurns += match.turns;
        turns.set(match.turns, (turns.get(match.turns) ?? 0) + 1);
        if (match.finishReason === "turnLimit") turnLimitMatches++;
        const startingOutcome = startingPlayerOutcomes[match.startingPlayer];
        startingOutcome.matches++;
        for (const player of PLAYER_IDS) {
            addPlayerStatistics(players[player], match, player);
            (profileOutcomes[match.profiles[player]] ??= createOutcome()).matches++;
        }

        if (match.winner === null) {
            draws++;
            startingOutcome.draws++;
            for (const player of PLAYER_IDS) profileOutcomes[match.profiles[player]]!.draws++;
            continue;
        }
        players[match.winner].wins++;
        if (match.winner === match.startingPlayer) startingOutcome.wins++;
        const profile = match.profiles[match.winner];
        winsByProfile[profile] = (winsByProfile[profile] ?? 0) + 1;
        profileOutcomes[profile]!.wins++;
        if (match.finishReason !== "turnLimit") winsByFinishReason[match.finishReason]++;
    }

    const matchCount = data.matches.length;
    const average = (get: (totals: PlayerTotals) => number) =>
        byPlayer((player) => get(players[player]) / matchCount);
    return {
        monsters: getMonsterAnalyses(monsterStatistics, data.configuration.monsters),
        averageTurns: totalTurns / matchCount,
        averageDeployments: average((totals) => totals.deployments),
        winsByPlayer: byPlayer((player) => players[player].wins),
        playerOutcomes: byPlayer((player) =>
            createOutcomeRate(players[player].wins, draws, matchCount),
        ),
        startingPlayerOutcomes: byPlayer((player) => toOutcomeRate(startingPlayerOutcomes[player])),
        profileOutcomes: Object.fromEntries(
            Object.entries(profileOutcomes).map(([profile, outcome]) => [
                profile,
                toOutcomeRate(outcome),
            ]),
        ),
        winsByFinishReason,
        turnLimitMatches,
        draws,
        turnDistribution: [...turns.entries()]
            .sort(([first], [second]) => first - second)
            .map(([turnCount, count]) => ({ turns: turnCount, matches: count })),
        winsByProfile,
        averageMonstersLost: average((totals) => totals.monstersLost),
        averageDamageReceived: average((totals) => totals.damageReceived),
        averageRemainingResources: average((totals) => totals.remainingResources),
        averageSymbolsSpent: byPlayer((player) => averageSymbolsSpent(players[player])),
        averageConversionLosses: byPlayer((player) => {
            const { conversionLosses, matchesWithConversionLosses } = players[player];
            return matchesWithConversionLosses === 0
                ? null
                : conversionLosses / matchesWithConversionLosses;
        }),
        averageDecisionTimeMs: average((totals) => totals.decisionTimeMs),
        averagePositionsExplored: average((totals) => totals.positionsExplored),
    };
}
