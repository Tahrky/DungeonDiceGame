import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import type {
    DiceReserve,
    MonsterStatusEffect,
    MonsterTurnBuffs,
    PlayerId,
    Position,
} from "../types/GameTypes";

import type { BotProfile, BotStrategyWeightMap, TacticalAttackValue } from "../game/botStrategy";
import type { TrainingFingerprint } from "./training/versioning";

export { BOT_PROFILES } from "../game/botStrategy";
export type { BotProfile, BotStrategyWeightMap } from "../game/botStrategy";

export const DEFAULT_MAX_TURNS = 30;

export interface ProfilePair {
    profile1: BotProfile;
    profile2: BotProfile;
}

export interface SimulationOptions {
    games: number;
    seed: number;
    maxTurns: number;
    profile1: BotProfile;
    profile2: BotProfile;
    profilePairs?: readonly ProfilePair[];
    debug?: boolean;
    recordDecisionTraces?: boolean;
    completeAttackPhases?: boolean;
    broaderAttackCandidates?: boolean;
    movementAttackCombos?: boolean;
    nextTurnDiceExpectation?: boolean;
    summonPlacementPairs?: boolean;
    strategyWeights?: BotStrategyWeightMap;
    configurationFile?: string;
    deck1?: string[];
    deck2?: string[];
}

export interface SimulationEvent {
    turn: number;
    player: PlayerId;
    type:
        "turn" | "dice" | "strategy" | "invocation" | "movement" | "attack" | "status" | "turnEnd";
    description: string;
    monsterId?: string;
    monsterTypeId?: string;
    monsterName?: string;
    attackName?: string;
    target?: string;
    cost?: number;
    damage?: number;
    targetsHit?: number;
    damageToMonsters?: number;
    damageToEnemies?: number;
    damageToAllies?: number;
    damageToBase?: number;
    overkillDamage?: number;
    criticalDamageBonus?: number;
    healingDone?: number;
    healingWaste?: number;
    effectsCleared?: number;
    buffsApplied?: number;
    cooldownReductionUsed?: number;
    camouflageTriggered?: boolean;
    camouflageSuppressed?: boolean;
    from?: Position;
    to?: Position;
    debug?: {
        situation: string;
        candidates: number;
        depth: number;
        positionsExplored: number;
        selectedAction: string;
    };
}

export interface PlayerSimulationStats {
    summoned: number;
    summonedByMonster: Record<string, number>;
    attacks: number;
    damageDealt: number;
    monstersKilled: number;
    monstersLost: number;
    damageReceived: number;
    baseDamage: number;
    movements: number;
    symbolsSpent: DiceReserve;
    conversionLosses: number;
    turnsWithoutSummon: number;
    turnsWithoutAttack: number;
    turnsWithoutMovement: number;
    turnsWithoutUsefulAction: number;
    noLegalPlacementTurns: number;
    stagnantMonsterTurns: number;
    blockedInvocationAttempts: number;
    unreachableObjectives: number;
    actionsSkippedByReason: Record<string, number>;
    lastMonsterSummonTurn: number | null;
    ineffectiveActions: number;
    decisionsWithoutImpact: number;
    decisionTimeMs: number;
    positionsExplored: number;
    branchesExplored: number;
    maxSearchDepthReached: number;
    searchDecisions: number;
    decisionsChangedBySearch: number;
    searchNodes: number;
    nodesBeyondFirstThree: number;
}

export interface FinalBoard {
    width: number;
    height: number;
    rows: string[];
    legend: Array<{ symbol: string; meaning: string }>;
}

export interface FinalMonster {
    id: string;
    monsterId: string;
    name: string;
    symbol: string;
    owner: PlayerId;
    hp: number;
    maxHp: number;
    position: Position;
    cells: Position[];
    statusEffects: MonsterStatusEffect[];
    isCamouflaged?: boolean;
    turnBuffs?: MonsterTurnBuffs;
}

export interface MatchResult {
    id: number;
    seed: number;
    startingPlayer: PlayerId;
    profiles: Record<PlayerId, BotProfile>;
    decks: Record<PlayerId, string[]>;
    winner: PlayerId | null;
    finishReason: "baseDestroyed" | "monstersEliminated" | "turnLimit";
    turns: number;
    playerHealth: Record<PlayerId, number>;
    statistics: Record<PlayerId, PlayerSimulationStats>;
    finalBoard: FinalBoard;
    finalMonsters: FinalMonster[];
    remainingResources: Record<PlayerId, DiceReserve>;
    history: SimulationEvent[];
    decisionTraces?: TacticalDecisionTrace[];
}

export interface TacticalDecisionTrace {
    turn: number;
    player: PlayerId;
    action: "attack";
    candidates: Array<{
        attackerMonsterId: string;
        attackIndex: number;
        target: Position;
        features: TacticalAttackValue;
        score: number;
    }>;
    selectedIndex: number;
}

export interface SimulationBatchResult {
    schemaVersion: 1;
    createdAt: string;
    fingerprint?: TrainingFingerprint;
    options: Omit<SimulationOptions, "deck1" | "deck2"> & {
        deck1?: string[];
        deck2?: string[];
    };
    configuration: GameConfiguration;
    board: BoardDefinition;
    summary: {
        matches: number;
        wins: Record<PlayerId, number>;
        winsByStartingPlayer: Record<PlayerId, number>;
        draws: number;
        averageTurns: number;
        winsByProfile: Partial<Record<BotProfile, number>>;
    };
    matches: MatchResult[];
}
