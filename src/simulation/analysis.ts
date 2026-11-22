import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { DiceReserve, PlayerId } from "../types/GameTypes";
import type { BotProfile, FinalBoard, SimulationEvent } from "./types";
import { createOutcomeRate, type OutcomeRate as StatisticalOutcomeRate } from "./statistics";

export { parseSimulationData } from "./parseAnalysisData";
export { calculateWilsonInterval } from "./statistics";
export type { OutcomeRate, WilsonInterval } from "./statistics";

export interface AnalyzablePlayerStats {
    summoned: number;
    summonedByMonster: Record<string, number>;
    attacks: number;
    symbolsSpent?: DiceReserve;
    conversionLosses?: number;
    turnsWithoutSummon?: number;
    turnsWithoutAttack?: number;
    turnsWithoutMovement?: number;
    turnsWithoutUsefulAction?: number;
    noLegalPlacementTurns?: number;
    stagnantMonsterTurns?: number;
    blockedInvocationAttempts?: number;
    unreachableObjectives?: number;
    actionsSkippedByReason?: Record<string, number>;
    lastMonsterSummonTurn?: number | null;
    damageDealt: number;
    monstersKilled: number;
    monstersLost?: number;
    damageReceived?: number;
    baseDamage: number;
    movements: number;
    unusedResources?: DiceReserve;
    ineffectiveActions?: number;
    decisionsWithoutImpact?: number;
    decisionTimeMs?: number;
    positionsExplored?: number;
    branchesExplored?: number;
}

export interface AnalyzableMatch {
    id: number;
    seed: number;
    startingPlayer: PlayerId;
    profiles: Record<PlayerId, BotProfile>;
    decks: Record<PlayerId, string[]>;
    winner: PlayerId | null;
    finishReason: "baseDestroyed" | "monstersEliminated" | "turnLimit";
    turns: number;
    statistics: Record<PlayerId, AnalyzablePlayerStats>;
    remainingResources: Record<PlayerId, DiceReserve>;
    finalBoard: FinalBoard;
    finalMonsters: Array<{
        id: string;
        monsterId: string;
        name: string;
        symbol?: string;
        owner: PlayerId;
        hp: number;
        maxHp: number;
        position: { x: number; y: number };
    }>;
    history: SimulationEvent[];
}

export interface SimulationData {
    configuration: GameConfiguration;
    board: BoardDefinition;
    matches: AnalyzableMatch[];
}

export interface MonsterAnalysis {
    id: string;
    name: string;
    appearances: number;
    matchesSeen: number;
    totalDamage: number;
    directDamage: number;
    damageOverTime: number;
    attacks: number;
    attacksWithDamage: number;
    kills: number;
    movements: number;
    averageMovements: number;
    averageFirstInvocationTurn: number | null;
    resourceCosts: DiceReserve | null;
    attackUsage: MonsterAttackUsage[];
}

export interface MonsterAttackUsage {
    name: string;
    uses: number;
}

export interface MatchMonsterAnalysis {
    id: string;
    monsterId: string;
    name: string;
    symbol?: string;
    owner: PlayerId;
    hp: number;
    maxHp: number;
    position: { x: number; y: number };
    attacks: number;
    totalDamage: number;
    movements: number;
    attackUsage: MonsterAttackUsage[];
}

export interface SimulationAnalytics {
    monsters: MonsterAnalysis[];
    averageTurns: number;
    averageDeployments: Record<PlayerId, number>;
    winsByPlayer: Record<PlayerId, number>;
    playerOutcomes: Record<PlayerId, StatisticalOutcomeRate>;
    startingPlayerOutcomes: Record<PlayerId, StatisticalOutcomeRate>;
    profileOutcomes: Partial<Record<BotProfile, StatisticalOutcomeRate>>;
    winsByFinishReason: { baseDestroyed: number; monstersEliminated: number };
    turnLimitMatches: number;
    draws: number;
    turnDistribution: Array<{ turns: number; matches: number }>;
    winsByProfile: Partial<Record<BotProfile, number>>;
    averageMonstersLost: Record<PlayerId, number>;
    averageDamageReceived: Record<PlayerId, number>;
    averageRemainingResources: Record<PlayerId, number>;
    averageSymbolsSpent: Record<PlayerId, DiceReserve | null>;
    averageConversionLosses: Record<PlayerId, number | null>;
    averageDecisionTimeMs: Record<PlayerId, number>;
    averagePositionsExplored: Record<PlayerId, number>;
}

function getAttackName(event: SimulationEvent): string | undefined {
    return event.attackName ?? event.description.match(/«([^»]+)»/)?.[1]?.trim();
}

function sortAttackUsage(usage: Map<string, number>): MonsterAttackUsage[] {
    return [...usage.entries()]
        .map(([name, uses]) => ({ name, uses }))
        .sort((first, second) => second.uses - first.uses || first.name.localeCompare(second.name));
}

export function analyzeMatchMonsters(match: AnalyzableMatch): MatchMonsterAnalysis[] {
    const monsters = new Map(
        match.finalMonsters.map((monster) => [
            monster.id,
            {
                ...monster,
                attacks: 0,
                totalDamage: 0,
                movements: 0,
                attackUsage: new Map<string, number>(),
            },
        ]),
    );

    for (const event of match.history) {
        if (!event.monsterId) continue;
        const monster = monsters.get(event.monsterId);
        if (!monster) continue;

        if (event.type === "attack") {
            monster.attacks++;
            monster.totalDamage += event.damage ?? 0;
            const attackName = getAttackName(event);
            if (attackName) {
                monster.attackUsage.set(attackName, (monster.attackUsage.get(attackName) ?? 0) + 1);
            }
        } else if (event.type === "status") {
            monster.totalDamage += event.damage ?? 0;
        } else if (event.type === "movement") {
            monster.movements++;
        }
    }

    return [...monsters.values()].map(({ attackUsage, ...monster }) => ({
        ...monster,
        attackUsage: sortAttackUsage(attackUsage),
    }));
}

export function analyzeSimulationData(data: SimulationData): SimulationAnalytics {
    const totals = new Map<
        string,
        {
            appearances: number;
            matchesSeen: number;
            damage: number;
            directDamage: number;
            damageOverTime: number;
            attacks: number;
            attacksWithDamage: number;
            kills: number;
            movements: number;
            invocationsRecorded: number;
            firstInvocationTurnsTotal: number;
            matchesWithFirstInvocation: number;
            resourceCosts: DiceReserve;
            attackUsage: Map<string, number>;
        }
    >();
    const monsterIdsByName = new Map(
        data.configuration.monsters.map((monster) => [monster.name, monster.id]),
    );
    for (const monster of data.configuration.monsters) {
        totals.set(monster.id, {
            appearances: 0,
            matchesSeen: 0,
            damage: 0,
            directDamage: 0,
            damageOverTime: 0,
            attacks: 0,
            attacksWithDamage: 0,
            kills: 0,
            movements: 0,
            invocationsRecorded: 0,
            firstInvocationTurnsTotal: 0,
            matchesWithFirstInvocation: 0,
            resourceCosts: { invocation: 0, attack: 0, movement: 0 },
            attackUsage: new Map(),
        });
    }

    const turns = new Map<number, number>();
    const winsByProfile: Partial<Record<BotProfile, number>> = {};
    let deployments: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const monstersLost: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const damageReceived: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const remainingResources: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const symbolsSpent: Record<PlayerId, DiceReserve> = {
        1: { invocation: 0, attack: 0, movement: 0 },
        2: { invocation: 0, attack: 0, movement: 0 },
    };
    const matchesWithResourceUsage: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const conversionLosses: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const matchesWithConversionMetrics: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const decisionTimeMs: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const positionsExplored: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const winsByPlayer: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const outcomesByPlayer: Record<PlayerId, { wins: number; draws: number }> = {
        1: { wins: 0, draws: 0 },
        2: { wins: 0, draws: 0 },
    };
    const outcomesByStartingPlayer: Record<
        PlayerId,
        { wins: number; draws: number; matches: number }
    > = {
        1: { wins: 0, draws: 0, matches: 0 },
        2: { wins: 0, draws: 0, matches: 0 },
    };
    const outcomesByProfile: Partial<
        Record<BotProfile, { wins: number; draws: number; matches: number }>
    > = {};
    const winsByFinishReason = { baseDestroyed: 0, monstersEliminated: 0 };
    let turnLimitMatches = 0;
    let draws = 0;
    let totalTurns = 0;
    let resourceCostsAvailable = true;
    for (const match of data.matches) {
        if (match.history.length === 0) resourceCostsAvailable = false;
        let invocationEvents = 0;
        let attackEvents = 0;
        let movementEvents = 0;
        const firstInvocationByType = new Map<string, number>();
        totalTurns += match.turns;
        turns.set(match.turns, (turns.get(match.turns) ?? 0) + 1);
        outcomesByStartingPlayer[match.startingPlayer].matches++;
        if (match.finishReason === "turnLimit") turnLimitMatches++;
        for (const player of [1, 2] as const) {
            const profile = match.profiles[player];
            const profileOutcome = outcomesByProfile[profile] ?? {
                wins: 0,
                draws: 0,
                matches: 0,
            };
            profileOutcome.matches++;
            outcomesByProfile[profile] = profileOutcome;
        }
        deployments = {
            1: deployments[1] + match.statistics[1].summoned,
            2: deployments[2] + match.statistics[2].summoned,
        };
        for (const player of [1, 2] as const) {
            const stats = match.statistics[player];
            monstersLost[player] += stats.monstersLost ?? 0;
            damageReceived[player] += stats.damageReceived ?? 0;
            remainingResources[player] += Object.values(match.remainingResources[player]).reduce(
                (total, amount) => total + amount,
                0,
            );
            if (stats.symbolsSpent) {
                for (const symbol of ["invocation", "attack", "movement"] as const) {
                    symbolsSpent[player][symbol] += stats.symbolsSpent[symbol];
                }
                matchesWithResourceUsage[player]++;
            }
            if (stats.conversionLosses !== undefined) {
                conversionLosses[player] += stats.conversionLosses;
                matchesWithConversionMetrics[player]++;
            }
            decisionTimeMs[player] += stats.decisionTimeMs ?? 0;
            positionsExplored[player] += stats.positionsExplored ?? 0;
        }
        if (match.winner !== null) {
            winsByPlayer[match.winner]++;
            outcomesByPlayer[match.winner].wins++;
            if (match.winner === match.startingPlayer) {
                outcomesByStartingPlayer[match.startingPlayer].wins++;
            }
            const profile = match.profiles[match.winner];
            winsByProfile[profile] = (winsByProfile[profile] ?? 0) + 1;
            outcomesByProfile[profile]!.wins++;
            if (match.finishReason !== "turnLimit") {
                winsByFinishReason[match.finishReason]++;
            }
        } else {
            draws++;
            outcomesByPlayer[1].draws++;
            outcomesByPlayer[2].draws++;
            outcomesByStartingPlayer[match.startingPlayer].draws++;
            for (const player of [1, 2] as const) {
                outcomesByProfile[match.profiles[player]]!.draws++;
            }
        }

        const monstersSeen = new Set<string>();
        for (const player of [1, 2] as const) {
            for (const [monsterId, count] of Object.entries(
                match.statistics[player].summonedByMonster,
            )) {
                const total = totals.get(monsterId);
                if (!total) continue;
                total.appearances += count;
                if (count > 0) monstersSeen.add(monsterId);
            }
        }
        for (const monsterId of monstersSeen) {
            totals.get(monsterId)!.matchesSeen++;
        }
        for (const event of match.history) {
            if (event.type !== "attack" && event.type !== "status" && event.type !== "movement") {
                if (event.type !== "invocation") continue;
            }
            const monsterTypeId =
                event.monsterTypeId ??
                (event.monsterName ? monsterIdsByName.get(event.monsterName) : undefined);
            if (!monsterTypeId) continue;
            const total = totals.get(monsterTypeId);
            if (!total) continue;
            if (event.type === "invocation") {
                invocationEvents++;
                total.invocationsRecorded++;
                const firstTurn = firstInvocationByType.get(monsterTypeId);
                firstInvocationByType.set(
                    monsterTypeId,
                    firstTurn === undefined ? event.turn : Math.min(firstTurn, event.turn),
                );
                if (event.cost === undefined) {
                    resourceCostsAvailable = false;
                } else {
                    total.resourceCosts.invocation += event.cost;
                }
            } else if (event.type === "movement") {
                movementEvents++;
                total.movements++;
                if (event.cost === undefined) {
                    resourceCostsAvailable = false;
                } else {
                    total.resourceCosts.movement += event.cost;
                }
            } else if (event.type === "status") {
                total.damageOverTime += event.damage ?? 0;
                total.damage += event.damage ?? 0;
            } else {
                attackEvents++;
                if (event.cost === undefined) {
                    resourceCostsAvailable = false;
                } else {
                    total.resourceCosts.attack += event.cost;
                }
                total.directDamage += event.damage ?? 0;
                total.damage += event.damage ?? 0;
                total.attacks++;
                if ((event.damage ?? 0) > 0) total.attacksWithDamage++;
                if (event.target?.includes(" éliminé")) total.kills++;
                const attackName = getAttackName(event);
                if (attackName) {
                    total.attackUsage.set(
                        attackName,
                        (total.attackUsage.get(attackName) ?? 0) + 1,
                    );
                }
            }
        }
        const expectedInvocations =
            match.statistics[1].summoned + match.statistics[2].summoned;
        const expectedAttacks = match.statistics[1].attacks + match.statistics[2].attacks;
        const expectedMovements = match.statistics[1].movements + match.statistics[2].movements;
        if (
            invocationEvents !== expectedInvocations ||
            attackEvents !== expectedAttacks ||
            movementEvents !== expectedMovements
        ) {
            resourceCostsAvailable = false;
        }
        for (const [monsterId, firstTurn] of firstInvocationByType) {
            const total = totals.get(monsterId);
            if (!total) continue;
            total.firstInvocationTurnsTotal += firstTurn;
            total.matchesWithFirstInvocation++;
        }
    }

    const matchCount = data.matches.length;
    return {
        monsters: data.configuration.monsters
            .map((monster) => {
                const total = totals.get(monster.id)!;
                return {
                    id: monster.id,
                    name: monster.name,
                    appearances: total.appearances,
                    matchesSeen: total.matchesSeen,
                    totalDamage: total.damage,
                    directDamage: total.directDamage,
                    damageOverTime: total.damageOverTime,
                    attacks: total.attacks,
                    attacksWithDamage: total.attacksWithDamage,
                    kills: total.kills,
                    movements: total.movements,
                    averageMovements:
                        total.appearances > 0 ? total.movements / total.appearances : 0,
                    averageFirstInvocationTurn:
                        total.appearances > 0 && total.invocationsRecorded === total.appearances
                            ? total.firstInvocationTurnsTotal / total.matchesWithFirstInvocation
                            : null,
                    resourceCosts: resourceCostsAvailable ? total.resourceCosts : null,
                    attackUsage: sortAttackUsage(total.attackUsage),
                };
            })
            .sort(
                (first, second) =>
                    second.appearances - first.appearances ||
                    second.totalDamage - first.totalDamage,
            ),
        averageTurns: totalTurns / matchCount,
        averageDeployments: {
            1: deployments[1] / matchCount,
            2: deployments[2] / matchCount,
        },
        winsByPlayer,
        playerOutcomes: {
            1: createOutcomeRate(
                outcomesByPlayer[1].wins,
                outcomesByPlayer[1].draws,
                matchCount,
            ),
            2: createOutcomeRate(
                outcomesByPlayer[2].wins,
                outcomesByPlayer[2].draws,
                matchCount,
            ),
        },
        startingPlayerOutcomes: {
            1: createOutcomeRate(
                outcomesByStartingPlayer[1].wins,
                outcomesByStartingPlayer[1].draws,
                outcomesByStartingPlayer[1].matches,
            ),
            2: createOutcomeRate(
                outcomesByStartingPlayer[2].wins,
                outcomesByStartingPlayer[2].draws,
                outcomesByStartingPlayer[2].matches,
            ),
        },
        profileOutcomes: Object.fromEntries(
            Object.entries(outcomesByProfile).map(([profile, outcome]) => [
                profile,
                createOutcomeRate(outcome.wins, outcome.draws, outcome.matches),
            ]),
        ),
        winsByFinishReason,
        turnLimitMatches,
        draws,
        turnDistribution: [...turns.entries()]
            .sort(([first], [second]) => first - second)
            .map(([turnCount, count]) => ({ turns: turnCount, matches: count })),
        winsByProfile,
        averageMonstersLost: {
            1: monstersLost[1] / matchCount,
            2: monstersLost[2] / matchCount,
        },
        averageDamageReceived: {
            1: damageReceived[1] / matchCount,
            2: damageReceived[2] / matchCount,
        },
        averageRemainingResources: {
            1: remainingResources[1] / matchCount,
            2: remainingResources[2] / matchCount,
        },
        averageSymbolsSpent: {
            1:
                matchesWithResourceUsage[1] === 0
                    ? null
                    : {
                          invocation: symbolsSpent[1].invocation / matchesWithResourceUsage[1],
                          attack: symbolsSpent[1].attack / matchesWithResourceUsage[1],
                          movement: symbolsSpent[1].movement / matchesWithResourceUsage[1],
                      },
            2:
                matchesWithResourceUsage[2] === 0
                    ? null
                    : {
                          invocation: symbolsSpent[2].invocation / matchesWithResourceUsage[2],
                          attack: symbolsSpent[2].attack / matchesWithResourceUsage[2],
                          movement: symbolsSpent[2].movement / matchesWithResourceUsage[2],
                      },
        },
        averageConversionLosses: {
            1:
                matchesWithConversionMetrics[1] === 0
                    ? null
                    : conversionLosses[1] / matchesWithConversionMetrics[1],
            2:
                matchesWithConversionMetrics[2] === 0
                    ? null
                    : conversionLosses[2] / matchesWithConversionMetrics[2],
        },
        averageDecisionTimeMs: {
            1: decisionTimeMs[1] / matchCount,
            2: decisionTimeMs[2] / matchCount,
        },
        averagePositionsExplored: {
            1: positionsExplored[1] / matchCount,
            2: positionsExplored[2] / matchCount,
        },
    };
}
