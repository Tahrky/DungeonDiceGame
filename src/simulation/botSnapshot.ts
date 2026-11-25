import {
    getMatchRandomState,
    isMatchRandomState,
    restoreMatchRandomStreams,
    type MatchRandomStreams,
} from "../game/random";
import type { BoardDefinition } from "../game/boards";
import type { BotStrategyWeights } from "../game/botStrategy";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { MatchRandomState, Monster, PlayerId } from "../types/GameTypes";
import type { MatchState } from "./matchState";
import {
    decideNextAction,
    decidePlayerTurn,
    executeBotAction,
    type PlayerTurnContext,
} from "./playerTurn";
import type { BotAction } from "./botAction";
import { canonicalJson } from "./training/versioning";

export interface BotSnapshot {
    state: Omit<MatchState, "actionRandom" | "placementProtectionCache">;
    configuration: GameConfiguration;
    board: BoardDefinition;
    decks: Record<PlayerId, string[]>;
    deckMonsters: Record<PlayerId, Monster[]>;
    strategyWeights: Record<PlayerId, Readonly<BotStrategyWeights>>;
    randomState: MatchRandomState;
}

export interface BotTurnCheckpoint {
    player: PlayerId;
    initial: BotSnapshot;
    actions: BotAction[];
}

export function createBotSnapshot(
    context: PlayerTurnContext,
    random: MatchRandomStreams,
): BotSnapshot {
    if (
        context.random !== random.dice ||
        context.state.actionRandom?.[1] !== random.actions[1] ||
        context.state.actionRandom?.[2] !== random.actions[2]
    ) {
        throw new Error("Les flux aléatoires ne correspondent pas au contexte du bot.");
    }
    const state = { ...context.state };
    delete state.actionRandom;
    delete state.placementProtectionCache;
    return structuredClone({
        state,
        configuration: context.configuration,
        board: context.board,
        decks: context.decks,
        deckMonsters: context.deckMonsters,
        strategyWeights: context.strategyWeights,
        randomState: getMatchRandomState(random),
    });
}

export function restoreBotSnapshot(snapshot: BotSnapshot): {
    context: PlayerTurnContext;
    random: MatchRandomStreams;
} {
    const { state, configuration, board, decks, deckMonsters, strategyWeights, randomState } =
        structuredClone(snapshot);
    if (!isMatchRandomState(randomState)) throw new Error("État aléatoire du bot invalide.");
    const random = restoreMatchRandomStreams(randomState);
    return {
        context: {
            state: { ...state, actionRandom: random.actions },
            configuration,
            board,
            random: random.dice,
            decks,
            deckMonsters,
            strategyWeights,
        },
        random,
    };
}

export function createBotTurnCheckpoint(
    context: PlayerTurnContext,
    random: MatchRandomStreams,
    player: PlayerId,
): BotTurnCheckpoint {
    if (context.state.currentPlayer !== player)
        throw new Error("Le tour appartient à un autre joueur.");
    return { player, initial: createBotSnapshot(context, random), actions: [] };
}

export function restoreBotTurn(checkpoint: BotTurnCheckpoint): {
    context: PlayerTurnContext;
    random: MatchRandomStreams;
    decider: Generator<BotAction>;
} {
    const { context, random } = restoreBotSnapshot(checkpoint.initial);
    if (context.state.currentPlayer !== checkpoint.player) {
        throw new Error("Le tour sauvegardé appartient à un autre joueur.");
    }
    const decider = decidePlayerTurn(context, checkpoint.player);
    for (const previous of checkpoint.actions) {
        const action = decideNextAction(decider);
        if (!action || canonicalJson(action) !== canonicalJson(previous)) {
            throw new Error(
                "La séquence du tour sauvegardé ne correspond pas aux décisions du bot.",
            );
        }
        executeBotAction(context, action);
    }
    return { context, random, decider };
}

export function advanceBotTurn(checkpoint: BotTurnCheckpoint): {
    action: BotAction | null;
    checkpoint: BotTurnCheckpoint;
    state: BotSnapshot;
} {
    const { context, random, decider } = restoreBotTurn(checkpoint);
    const action = decideNextAction(decider);
    if (action) executeBotAction(context, action);
    return {
        action,
        checkpoint: {
            ...checkpoint,
            actions: action ? [...checkpoint.actions, structuredClone(action)] : checkpoint.actions,
        },
        state: createBotSnapshot(context, random),
    };
}
