import type { BoardDefinition } from "../../game/boards";
import type { GameConfiguration } from "../../game/gameConfiguration";
import type { DiceReserve, PlayerId } from "../../types/GameTypes";
import type { OutcomeRate } from "../statistics";
import type { BotProfile, FinalBoard, FinalMonster, SimulationEvent } from "../types";

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

export type AnalyzableFinalMonster = Pick<
    FinalMonster,
    "id" | "monsterId" | "name" | "owner" | "hp" | "maxHp" | "position"
> & { symbol?: string };

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
    finalMonsters: AnalyzableFinalMonster[];
    history: SimulationEvent[];
}

export interface SimulationData {
    configuration: GameConfiguration;
    board: BoardDefinition;
    matches: AnalyzableMatch[];
}

export interface MonsterAttackUsage {
    name: string;
    uses: number;
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

export type MatchMonsterAnalysis = AnalyzableFinalMonster & {
    attacks: number;
    totalDamage: number;
    movements: number;
    attackUsage: MonsterAttackUsage[];
};

export interface SimulationAnalytics {
    monsters: MonsterAnalysis[];
    averageTurns: number;
    averageDeployments: Record<PlayerId, number>;
    winsByPlayer: Record<PlayerId, number>;
    playerOutcomes: Record<PlayerId, OutcomeRate>;
    startingPlayerOutcomes: Record<PlayerId, OutcomeRate>;
    profileOutcomes: Partial<Record<BotProfile, OutcomeRate>>;
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
