import {
    chooseBotTactic,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotProfile,
    type BotStrategyWeightMap,
} from "../game/botStrategy";
import { createBotDecisionSettings, type BotDecisionOptions } from "../game/botConfiguration";
import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { MatchRandomStreams } from "../game/random";
import { createStats, type MatchState } from "../simulation/matchState";
import type { PlayerTurnContext } from "../simulation/playerTurn";
import type {
    BoardObstacle,
    DiceReserve,
    Monster,
    PlacedMonster,
    PlayerId,
} from "../types/GameTypes";

interface ComputerBotStateInput {
    board: BoardDefinition;
    configuration: GameConfiguration;
    turn: number;
    profile: BotProfile;
    playerProfile: BotProfile;
    options: BotDecisionOptions;
    weights: BotStrategyWeightMap;
    health: Record<PlayerId, number>;
    reserves: Record<PlayerId, DiceReserve>;
    monsters: PlacedMonster[];
    obstacles: readonly BoardObstacle[];
    nextMonsterId: number;
    decks: Record<PlayerId, string[]>;
    deckMonsters: Record<PlayerId, Monster[]>;
    random: MatchRandomStreams;
}

export function createComputerBotContext(input: ComputerBotStateInput): PlayerTurnContext {
    const profiles: Record<PlayerId, BotProfile> = { 1: input.playerProfile, 2: input.profile };
    const statistics = { 1: createStats(), 2: createStats() };
    for (const { owner, monster } of input.monsters) {
        const stats = statistics[owner];
        stats.summoned++;
        stats.summonedByMonster[monster.id] = (stats.summonedByMonster[monster.id] ?? 0) + 1;
    }
    const strategyWeights = {
        1: input.weights[profiles[1]] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
        2: input.weights[profiles[2]] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
    };
    const state: MatchState = {
        turn: input.turn,
        currentPlayer: 2,
        startingPlayer: 1,
        ...createBotDecisionSettings(input.configuration, input.options),
        profiles,
        tactics: {
            1: chooseBotTactic(profiles[1], profiles[2]).tactic,
            2: chooseBotTactic(profiles[2], profiles[1]).tactic,
        },
        allowBaseAttackOnSummonTurn: input.configuration.allowBaseAttackOnSummonTurn,
        protectFirstDeployment: input.configuration.protectFirstDeployment,
        strategyWeights,
        winner: null,
        finishReason: "turnLimit",
        health: input.health,
        reserves: input.reserves,
        monsters: input.monsters,
        obstacles: input.obstacles,
        movementStagnation: {},
        history: [],
        statistics,
        nextMonsterId: input.nextMonsterId,
        monstersKilledForVictory: input.configuration.monstersKilledForVictory,
        actionRandom: input.random.actions,
    };
    return {
        state,
        configuration: input.configuration,
        board: input.board,
        random: input.random.dice,
        decks: input.decks,
        deckMonsters: input.deckMonsters,
        strategyWeights,
    };
}
