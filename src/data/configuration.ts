import { DICE } from "./dice";
import { MONSTERS } from "./monsters";
import type { BotProfile } from "../game/botProfiles";

export const GAME_CONFIG = {
    boardWidth: 19,
    boardHeight: 15,
    tileWidth: 54,
    tileHeight: 27,
    screenWidth: 1300,
    screenHeight: 760,
    boardOffsetX: 625,
    boardOffsetY: 125,
    showDirectionLabels: false,
};

const MAX_CONFIGURED_DECK_SIZE = 15;

export const GAME_OPTIONS = {
    diceCount: { default: 5, min: 2, max: DICE.length },
    deckSize: {
        default: 5,
        min: 3,
        max: MAX_CONFIGURED_DECK_SIZE,
        maxAvailable: Math.min(MAX_CONFIGURED_DECK_SIZE, MONSTERS.length),
    },
    randomBoard: { default: false },
    testBoard: { default: false },
    initialPlayerHealth: { default: 4, min: 1, max: 20 },
    allowBaseAttackOnSummonTurn: { default: false },
    removeInvocationDiceWhenNoMonsters: { default: true },
    protectFirstDeployment: { default: true },
    maxMonstersPerPlayer: { default: 8, min: 1, max: 20 },
    maxSummonsPerMonster: { default: 2, min: 1, max: 20 },
    monstersKilledForVictory: { default: 7, min: 1, max: 20 },
} as const;

export const MIN_DICE_COUNT: number = GAME_OPTIONS.diceCount.min;
export const MAX_DICE_COUNT: number = GAME_OPTIONS.diceCount.max;
export const DEFAULT_DICE_COUNT: number = GAME_OPTIONS.diceCount.default;
export const MIN_DECK_SIZE: number = GAME_OPTIONS.deckSize.min;
export const MAX_DECK_SIZE: number = GAME_OPTIONS.deckSize.max;
export const DEFAULT_DECK_SIZE: number = GAME_OPTIONS.deckSize.default;
export const MAX_AVAILABLE_DECK_SIZE: number = GAME_OPTIONS.deckSize.maxAvailable;
export const DEFAULT_PLAYER_LIFE: number = GAME_OPTIONS.initialPlayerHealth.default;
export const MIN_PLAYER_HEALTH: number = GAME_OPTIONS.initialPlayerHealth.min;
export const MAX_PLAYER_HEALTH: number = GAME_OPTIONS.initialPlayerHealth.max;
export const DEFAULT_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.default;
export const MIN_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.min;
export const MAX_MAX_MONSTERS_PER_PLAYER: number = GAME_OPTIONS.maxMonstersPerPlayer.max;
export const DEFAULT_MONSTERS_KILLED_FOR_VICTORY: number =
    GAME_OPTIONS.monstersKilledForVictory.default;
export const MIN_MONSTERS_KILLED_FOR_VICTORY: number = GAME_OPTIONS.monstersKilledForVictory.min;
export const MAX_MONSTERS_KILLED_FOR_VICTORY: number = GAME_OPTIONS.monstersKilledForVictory.max;

export const DEFAULT_OPPONENT_PROFILE: BotProfile = "balanced";
export const DEFAULT_BOARD_PRESET_ID = "wide-arena";

export const SIMULATION_DEFAULTS = {
    profile1: "cheap",
    profile2: "offensive",
    crossProfileMode: true,
    gameCount: 100,
    repetitionCount: 10,
    seed: null,
    maxTurns: 40,
    debug: false,
    recordDecisionTraces: true,
    expectiminimax: true,
    expectiminimaxMaxDepth: 10,
    expectiminimaxBranchWidth: 5,
    expectiminimaxNodeBudget: 500,
} as const satisfies {
    profile1: BotProfile;
    profile2: BotProfile;
    crossProfileMode: boolean;
    gameCount: number;
    repetitionCount: number;
    seed: number | null;
    maxTurns: number;
    debug: boolean;
    recordDecisionTraces: boolean;
    expectiminimax: boolean;
    expectiminimaxMaxDepth: number;
    expectiminimaxBranchWidth: number;
    expectiminimaxNodeBudget: number;
};

export const SIMULATION_CLI_DEFAULTS = {
    games: 100,
    profile: "balanced",
} as const satisfies { games: number; profile: BotProfile };

export const TRAINING_DEFAULTS = {
    initializationMode: "default",
    seed: 731,
    maxTurns: 10,
    trainingSeedCount: 3,
    selectionSeedCount: 3,
    validationSeedCount: 3,
    generations: 2,
    populationSize: 3,
    hybridPopulationSize: 5,
} as const;

export const MONSTER_BALANCE_OPTIONS = {
    boardWidth: 19,
    boardHeight: 13,
    resourcesPerTurn: 5,
    resourceTypes: 3,
    includeCasterInSelfRadius: false,
    enemyDensity: 0.15,
    allyDensity: 0.1,
    referenceEnemyHp: 5,
    dotHorizonTurns: 3,
    backstabProbability: 0.25,
    friendlyFireWeight: 0.75,
    healEffectiveness: 0.65,
    cleanseValue: 1,
    attackDamageBuffValue: 1,
    attackCostReductionValue: 1,
    movementRangeBonusValue: 0.75,
    movementCostReductionValue: 1,
    cooldownReductionValue: 1.5,
    buffedAttacksPerTarget: 1,
    buffedMovesPerTarget: 1,
    supportReferenceValue: 5,
    movementReferenceCells: 40,
    areaReferenceCells: 25,
    analysisHorizon: 12,
    invocationEfficiencyHorizon: 5,
} as const;

export const BALANCE_WEIGHTS = {
    durability: 4 / 17,
    offense: 5 / 17,
    mobility: 3 / 17,
    utility: 3 / 17,
    actionEconomy: 2 / 17,
} as const;
