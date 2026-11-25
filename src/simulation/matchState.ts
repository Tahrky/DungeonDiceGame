import { createEmptyDiceReserve } from "../game/diceResources";
import { byPlayer } from "../game/matchRules";
import type { StrategicSnapshot } from "../game/ai";
import type { BoardDefinition } from "../game/boards";
import type { PlayerId, PlacedMonster, Position } from "../types/GameTypes";
import type { BotTactic, BotStrategyWeights } from "../game/botStrategy";
import type {
    BotProfile,
    MatchResult,
    PlayerSimulationStats,
    SimulationEvent,
    TacticalDecisionTrace,
} from "./types";

export interface MatchState {
    turn: number;
    currentPlayer: PlayerId;
    debug?: boolean;
    protectFirstDeployment?: boolean;
    completeAttackPhases?: boolean;
    broaderAttackCandidates?: boolean;
    movementAttackCombos?: boolean;
    summonPlacementPairs?: boolean;
    nextTurnDice?: {
        count: number;
        removeInvocationDiceWhenNoMonsters: boolean;
        maxMonstersPerPlayer: number;
    };
    strategyWeights?: Record<PlayerId, Readonly<BotStrategyWeights>>;
    decisionTraces?: TacticalDecisionTrace[];
    profiles: Record<PlayerId, BotProfile>;
    tactics: Record<PlayerId, BotTactic>;
    allowBaseAttackOnSummonTurn: boolean;
    winner: PlayerId | null;
    finishReason: MatchResult["finishReason"];
    health: Record<PlayerId, number>;
    reserves: Record<PlayerId, { invocation: number; attack: number; movement: number }>;
    monsters: PlacedMonster[];
    movementStagnation: Record<string, number>;
    placementProtectionCache?: {
        key: string;
        preservesFirstDeployment: (cells: readonly Position[]) => boolean;
    };
    history: SimulationEvent[];
    statistics: Record<PlayerId, PlayerSimulationStats>;
    nextMonsterId: number;
    monstersKilledForVictory: number;
    actionRandom?: Record<PlayerId, () => number>;
}

export function createStats(): PlayerSimulationStats {
    return {
        summoned: 0,
        summonedByMonster: {},
        attacks: 0,
        damageDealt: 0,
        monstersKilled: 0,
        monstersLost: 0,
        damageReceived: 0,
        baseDamage: 0,
        movements: 0,
        symbolsSpent: createEmptyDiceReserve(),
        conversionLosses: 0,
        turnsWithoutSummon: 0,
        turnsWithoutAttack: 0,
        turnsWithoutMovement: 0,
        turnsWithoutUsefulAction: 0,
        noLegalPlacementTurns: 0,
        stagnantMonsterTurns: 0,
        blockedInvocationAttempts: 0,
        unreachableObjectives: 0,
        actionsSkippedByReason: {},
        lastMonsterSummonTurn: null,
        ineffectiveActions: 0,
        decisionsWithoutImpact: 0,
        decisionTimeMs: 0,
        positionsExplored: 0,
        branchesExplored: 0,
        maxSearchDepthReached: 0,
        searchDecisions: 0,
        decisionsChangedBySearch: 0,
        searchNodes: 0,
        nodesBeyondFirstThree: 0,
    };
}

export function addEvent(state: MatchState, event: SimulationEvent): void {
    state.history.push(event);
}

export function cloneMatchState(state: MatchState): MatchState {
    const cloneMonster = (monster: PlacedMonster): PlacedMonster => ({
        ...monster,
        attackUsesThisTurn: [...monster.attackUsesThisTurn],
        attackCooldowns: [...monster.attackCooldowns],
        statusEffects: monster.statusEffects.map((effect) => ({
            ...effect,
            ...(effect.source ? { source: { ...effect.source } } : {}),
        })),
        ...(monster.turnBuffs ? { turnBuffs: { ...monster.turnBuffs } } : {}),
    });
    const cloneStats = (player: PlayerId) => ({
        ...state.statistics[player],
        summonedByMonster: { ...state.statistics[player].summonedByMonster },
        symbolsSpent: { ...state.statistics[player].symbolsSpent },
    });

    return {
        ...state,
        profiles: { ...state.profiles },
        tactics: { ...state.tactics },
        health: { ...state.health },
        reserves: byPlayer((player) => ({ ...state.reserves[player] })),
        monsters: state.monsters.map(cloneMonster),
        history: [],
        statistics: byPlayer(cloneStats),
    };
}

export function createStrategicSnapshot(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): StrategicSnapshot {
    return {
        board,
        health: state.health,
        initialHealth: Math.max(state.health[1], state.health[2], 1),
        monsters: state.monsters,
        reserves: state.reserves,
        profile: state.profiles[player],
        tactics: state.tactics,
        currentPlayer: player,
        turn: state.turn,
    };
}

export function getPlayerMonsters(state: MatchState, player: PlayerId): PlacedMonster[] {
    return state.monsters.filter((monster) => monster.owner === player && monster.currentHp > 0);
}

export function canSpend(
    state: MatchState,
    player: PlayerId,
    symbol: keyof MatchState["reserves"][1],
    cost: number,
): boolean {
    return state.reserves[player][symbol] >= cost;
}

export function spend(
    state: MatchState,
    player: PlayerId,
    symbol: keyof MatchState["reserves"][1],
    cost: number,
): boolean {
    if (!canSpend(state, player, symbol, cost)) return false;
    state.reserves[player][symbol] -= cost;
    state.statistics[player].symbolsSpent[symbol] += cost;
    return true;
}
