import { parseBoardDefinition, type BoardDefinition } from "../game/boards";
import { parseGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import type { DiceReserve, PlayerId } from "../types/GameTypes";
import { BOT_PROFILES, type BotProfile, type FinalBoard, type SimulationEvent } from "./types";

export interface AnalyzablePlayerStats {
    summoned: number;
    summonedByMonster: Record<string, number>;
    attacks: number;
    symbolsSpent?: DiceReserve;
    conversionLosses?: number;
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
    attacks: number;
    movements: number;
    averageMovements: number;
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
    winsByFinishReason: { baseDestroyed: number; monstersEliminated: number };
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isPlayerId(value: unknown): value is PlayerId {
    return value === 1 || value === 2;
}

function isDiceReserve(value: unknown): value is DiceReserve {
    return (
        isRecord(value) &&
        ["invocation", "attack", "movement"].every(
            (symbol) =>
                typeof value[symbol] === "number" &&
                Number.isInteger(value[symbol]) &&
                value[symbol] >= 0,
        )
    );
}

function isProfile(value: unknown): value is BotProfile {
    return typeof value === "string" && BOT_PROFILES.includes(value as BotProfile);
}

function isStatistics(value: unknown): value is AnalyzablePlayerStats {
    return (
        isRecord(value) &&
        isNumber(value.summoned) &&
        isRecord(value.summonedByMonster) &&
        Object.values(value.summonedByMonster).every(isNumber) &&
        isNumber(value.attacks) &&
        isNumber(value.damageDealt) &&
        isNumber(value.monstersKilled) &&
        isNumber(value.baseDamage) &&
        isNumber(value.movements) &&
        (value.symbolsSpent === undefined || isDiceReserve(value.symbolsSpent)) &&
        (value.conversionLosses === undefined || isNumber(value.conversionLosses))
    );
}

function isSimulationEvent(value: unknown): value is SimulationEvent {
    return (
        isRecord(value) &&
        Number.isInteger(value.turn) &&
        isPlayerId(value.player) &&
        typeof value.type === "string" &&
        typeof value.description === "string" &&
        (value.monsterId === undefined || typeof value.monsterId === "string") &&
        (value.monsterTypeId === undefined || typeof value.monsterTypeId === "string") &&
        (value.monsterName === undefined || typeof value.monsterName === "string") &&
        (value.attackName === undefined || typeof value.attackName === "string") &&
        (value.damage === undefined || isNumber(value.damage))
    );
}

function isFinalBoard(value: unknown): value is FinalBoard {
    return (
        isRecord(value) &&
        Number.isInteger(value.width) &&
        Number.isInteger(value.height) &&
        Array.isArray(value.rows) &&
        value.rows.length === value.height &&
        value.rows.every((row) => typeof row === "string" && row.length === value.width) &&
        Array.isArray(value.legend) &&
        value.legend.every(
            (item) =>
                isRecord(item) &&
                typeof item.symbol === "string" &&
                typeof item.meaning === "string",
        )
    );
}

function isFinalMonster(value: unknown): value is AnalyzableMatch["finalMonsters"][number] {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.monsterId === "string" &&
        typeof value.name === "string" &&
        (value.symbol === undefined ||
            (typeof value.symbol === "string" && /^[A-Z]$/.test(value.symbol))) &&
        isPlayerId(value.owner) &&
        isNumber(value.hp) &&
        isNumber(value.maxHp) &&
        isRecord(value.position) &&
        Number.isInteger(value.position.x) &&
        Number.isInteger(value.position.y)
    );
}

function isMatch(value: unknown): value is AnalyzableMatch {
    if (
        !isRecord(value) ||
        !isRecord(value.profiles) ||
        !isRecord(value.statistics) ||
        !isRecord(value.decks)
    ) {
        return false;
    }
    return (
        Number.isInteger(value.id) &&
        Number.isInteger(value.seed) &&
        isProfile(value.profiles[1]) &&
        isProfile(value.profiles[2]) &&
        Array.isArray(value.decks[1]) &&
        value.decks[1].every((id) => typeof id === "string") &&
        Array.isArray(value.decks[2]) &&
        value.decks[2].every((id) => typeof id === "string") &&
        (value.winner === null || isPlayerId(value.winner)) &&
        (value.finishReason === "baseDestroyed" ||
            value.finishReason === "monstersEliminated" ||
            value.finishReason === "turnLimit") &&
        Number.isInteger(value.turns) &&
        isStatistics(value.statistics[1]) &&
        isStatistics(value.statistics[2]) &&
        isRecord(value.remainingResources) &&
        isDiceReserve(value.remainingResources[1]) &&
        isDiceReserve(value.remainingResources[2]) &&
        isFinalBoard(value.finalBoard) &&
        Array.isArray(value.finalMonsters) &&
        value.finalMonsters.every(isFinalMonster) &&
        Array.isArray(value.history) &&
        value.history.every(isSimulationEvent)
    );
}

export function parseSimulationData(value: unknown): SimulationData | null {
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.matches)) {
        return null;
    }
    const configuration = parseGameConfiguration(value.configuration);
    const board = parseBoardDefinition(value.board);
    if (!configuration || !board || value.matches.length === 0 || !value.matches.every(isMatch)) {
        return null;
    }
    return { configuration, board, matches: value.matches };
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
            attacks: number;
            movements: number;
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
            attacks: 0,
            movements: 0,
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
    const winsByFinishReason = { baseDestroyed: 0, monstersEliminated: 0 };
    let draws = 0;
    let totalTurns = 0;
    for (const match of data.matches) {
        totalTurns += match.turns;
        turns.set(match.turns, (turns.get(match.turns) ?? 0) + 1);
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
            const profile = match.profiles[match.winner];
            winsByProfile[profile] = (winsByProfile[profile] ?? 0) + 1;
            if (match.finishReason !== "turnLimit") {
                winsByFinishReason[match.finishReason]++;
            }
        } else {
            draws++;
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
                continue;
            }
            const monsterTypeId =
                event.monsterTypeId ??
                (event.monsterName ? monsterIdsByName.get(event.monsterName) : undefined);
            if (!monsterTypeId) continue;
            const total = totals.get(monsterTypeId);
            if (!total) continue;
            if (event.type === "movement") {
                total.movements++;
            } else {
                total.damage += event.damage ?? 0;
                if (event.type === "attack") {
                    total.attacks++;
                    const attackName = getAttackName(event);
                    if (attackName) {
                        total.attackUsage.set(
                            attackName,
                            (total.attackUsage.get(attackName) ?? 0) + 1,
                        );
                    }
                }
            }
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
                    attacks: total.attacks,
                    movements: total.movements,
                    averageMovements:
                        total.appearances > 0 ? total.movements / total.appearances : 0,
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
        winsByFinishReason,
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
