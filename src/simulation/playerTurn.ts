import { DICE } from "../data/dice";
import type { BoardDefinition } from "../game/boards";
import {
    canDeployMonsterForProfile,
    chooseBotTactic,
    chooseSymbolConversion,
    getLowestProtectedCost,
    scoreMonsterForProfile,
    type BotStrategyWeights,
} from "../game/botStrategy";
import { convertReservedSymbols, rollDieSymbol } from "../game/diceResources";
import type { GameConfiguration } from "../game/gameConfiguration";
import { getInvokedMonsterCount, opposingPlayer } from "../game/matchRules";
import {
    canUseActionThisTurn,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import type { DiceSymbol, Monster, PlayerId } from "../types/GameTypes";
import { finishPlayerTurn, getLegalAttackCosts } from "./combat";
import { decideAttacks } from "./combat/attackDecision";
import { executeAttack } from "./combat/attackExecution";
import { resolveAttackChoice } from "./combat/attackChoices";
import { decideDeployments, executeDeploymentAction } from "./deployment";
import { addEvent, getPlayerMonsters, type MatchState } from "./matchState";
import { decideMovements, executeMovement } from "./movement";
import { hasAvailablePlacement } from "./summonPlacement";
import type { BotAction } from "./botAction";

export interface PlayerTurnContext {
    state: MatchState;
    configuration: GameConfiguration;
    board: BoardDefinition;
    random: () => number;
    decks: Record<PlayerId, string[]>;
    deckMonsters: Record<PlayerId, Monster[]>;
    strategyWeights: Record<PlayerId, Readonly<BotStrategyWeights>>;
}

function getLowestCost(costs: readonly number[]): number {
    return costs.length > 0 ? Math.min(...costs) : 0;
}

function rollDice(
    { state, configuration, random }: PlayerTurnContext,
    player: PlayerId,
): DiceSymbol[] {
    const excludeInvocation =
        configuration.removeInvocationDiceWhenNoMonsters &&
        getInvokedMonsterCount(state.monsters, player) >= configuration.maxMonstersPerPlayer;
    const rolled = DICE.slice(0, configuration.diceCount).map((die) =>
        rollDieSymbol(die, excludeInvocation, (count) => Math.floor(random() * count)),
    );
    for (const symbol of rolled) state.reserves[player][symbol]++;
    return rolled;
}

function getInvocableMonsters(
    { state, configuration, board, deckMonsters }: PlayerTurnContext,
    player: PlayerId,
): Monster[] {
    if (getInvokedMonsterCount(state.monsters, player) >= configuration.maxMonstersPerPlayer) {
        return [];
    }
    const deployedCosts = state.monsters
        .filter((monster) => monster.owner === player)
        .map((monster) => monster.monster.cost);
    const canDeploy = (monster: Monster) =>
        canDeployMonsterForProfile(monster, state.profiles[player], deployedCosts);
    if (hasAvailablePlacement(state, board, player)) return deckMonsters[player].filter(canDeploy);

    const stats = state.statistics[player];
    stats.noLegalPlacementTurns++;
    const invocation = state.reserves[player].invocation;
    if (deckMonsters[player].some((monster) => monster.cost <= invocation && canDeploy(monster))) {
        stats.blockedInvocationAttempts++;
        stats.actionsSkippedByReason.noLegalPlacement =
            (stats.actionsSkippedByReason.noLegalPlacement ?? 0) + 1;
    }
    return [];
}

function getUsableMovementCosts(state: MatchState, player: PlayerId): number[] {
    return getPlayerMonsters(state, player)
        .filter((monster) =>
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            ),
        )
        .map((monster) =>
            getMovementCost(monster.monster, monster.turnBuffs?.movementCostReduction ?? 0),
        );
}

export function createConversionDecider(
    context: PlayerTurnContext,
    player: PlayerId,
    invocableMonsters: readonly Monster[],
): () => ReturnType<typeof chooseSymbolConversion> {
    const { state, board, strategyWeights } = context;
    const weights = strategyWeights[player];
    const invocationBonus = getInvokedMonsterCount(state.monsters, player) === 0 ? 2 : 0;
    const invocations = invocableMonsters.map((monster) => ({
        cost: monster.cost,
        value:
            Math.max(1, scoreMonsterForProfile(monster, state.profiles[player], weights) + 1) *
                weights.invocationPriority +
            invocationBonus,
    }));
    const attackCosts = getLegalAttackCosts(state, board);
    const movementCosts = getUsableMovementCosts(state, player);
    const reserve = state.reserves[player];

    return () => {
        if (state.currentPlayer !== player) {
            throw new Error("Le décideur de conversion appartient à un autre joueur.");
        }
        const protectedCounts = {
            invocation: getLowestCost(
                invocations
                    .filter(({ cost }) => cost <= reserve.invocation)
                    .map(({ cost }) => cost),
            ),
            attack: getLowestCost(attackCosts.filter((cost) => cost <= reserve.attack)),
            movement: getLowestProtectedCost(
                movementCosts.filter((cost) => cost <= reserve.movement),
            ),
        };
        const opportunities = {
            invocation: invocations.reduce(
                (best, { cost, value }) =>
                    cost > reserve.invocation ? Math.max(best, value) : best,
                0,
            ),
            attack: attackCosts.some((cost) => cost > reserve.attack) ? 1 : 0,
            movement: movementCosts.some((cost) => cost > reserve.movement) ? 1 : 0,
        };
        return chooseSymbolConversion(reserve, opportunities, protectedCounts);
    };
}

function* decideConversions(
    context: PlayerTurnContext,
    player: PlayerId,
    invocableMonsters: readonly Monster[],
): Generator<Extract<BotAction, { type: "convert" }>> {
    const decide = createConversionDecider(context, player, invocableMonsters);
    for (;;) {
        const choice = decide();
        if (!choice) return;
        yield { type: "convert", player, choice };
    }
}

function* decideActions(context: PlayerTurnContext, player: PlayerId): Generator<BotAction> {
    const { state, configuration, board, deckMonsters } = context;
    const stats = state.statistics[player];
    const { summoned, attacks, movements } = stats;
    yield* decideDeployments(
        state,
        configuration,
        board,
        state.profiles[player],
        deckMonsters[player],
    );
    yield* decideAttacks(state, board);
    yield* decideMovements(state, board);
    yield* decideAttacks(state, board);

    const hasSummoned = stats.summoned !== summoned;
    const hasAttacked = stats.attacks !== attacks;
    const hasMoved = stats.movements !== movements;
    if (!hasSummoned) stats.turnsWithoutSummon++;
    if (!hasAttacked) stats.turnsWithoutAttack++;
    if (!hasMoved) stats.turnsWithoutMovement++;
    if (!hasSummoned && !hasAttacked && !hasMoved) stats.turnsWithoutUsefulAction++;
}

export function recordBotTurn(
    context: PlayerTurnContext,
    player: PlayerId,
    rolled: readonly DiceSymbol[],
): void {
    const { state, decks } = context;
    const { turn, profiles } = state;
    addEvent(state, {
        turn,
        player,
        type: "dice",
        description: `Dés : ${rolled.join(", ")}. Ressources conservées en réserve.`,
    });
    addEvent(state, {
        turn,
        player,
        type: "strategy",
        description: `Profil « ${profiles[player]} » ; deck : ${decks[player].join(", ")}.`,
    });
    const decision = chooseBotTactic(profiles[player], profiles[opposingPlayer(player)]);
    state.tactics[player] = decision.tactic;
    addEvent(state, {
        turn,
        player,
        type: "strategy",
        description: `Décision stratégique : ${decision.description}.`,
    });
}

export function* decidePlayerTurn(
    context: PlayerTurnContext,
    player: PlayerId,
): Generator<BotAction> {
    yield { type: "roll", player };
    yield* decideConversions(context, player, getInvocableMonsters(context, player));
    yield* decideActions(context, player);
    yield { type: "endTurn", player };
}

export function decideNextAction(decider: Iterator<BotAction>): BotAction | null {
    const result = decider.next();
    return result.done ? null : result.value;
}

export function executeBotAction(context: PlayerTurnContext, action: BotAction): void {
    const { state, board, configuration } = context;
    switch (action.type) {
        case "roll":
            recordBotTurn(context, action.player, rollDice(context, action.player));
            return;
        case "convert": {
            const { player, choice } = action;
            if (
                !convertReservedSymbols(
                    state.reserves[player],
                    choice.sourceSymbols,
                    choice.targetSymbol,
                )
            ) {
                throw new Error("La conversion de symboles choisie par le bot a échoué.");
            }
            state.statistics[player].conversionLosses++;
            addEvent(state, {
                turn: state.turn,
                player,
                type: "strategy",
                description: `Conversion tactique : ${choice.sourceSymbols.join(" + ")} vers ${choice.targetSymbol}.`,
            });
            return;
        }
        case "summon":
            if (
                !executeDeploymentAction(
                    state,
                    configuration,
                    state.profiles[state.currentPlayer],
                    action,
                    context.deckMonsters[state.currentPlayer],
                )
            ) {
                throw new Error("L'invocation choisie par le bot ne peut pas être payée.");
            }
            return;
        case "attack":
            executeAttack(state, board, resolveAttackChoice(state, action.choice));
            return;
        case "move":
            if (!executeMovement(state, action)) {
                throw new Error("Le déplacement choisi par le bot ne peut pas être payé.");
            }
            return;
        case "endTurn":
            finishPlayerTurn(state, action.player);
    }
}

export function playPlayerTurn(context: PlayerTurnContext, player: PlayerId): void {
    const decider = decidePlayerTurn(context, player);
    for (let action = decideNextAction(decider); action; action = decideNextAction(decider)) {
        executeBotAction(context, action);
    }
}
