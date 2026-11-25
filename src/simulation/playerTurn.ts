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
import { convertReservedSymbols, getRollableDieFaces } from "../game/diceResources";
import type { GameConfiguration } from "../game/gameConfiguration";
import { getInvokedMonsterCount, opposingPlayer } from "../game/matchRules";
import {
    canUseActionThisTurn,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import type { DiceSymbol, Monster, PlayerId } from "../types/GameTypes";
import { finishPlayerTurn, getLegalAttackCosts, performAttacks } from "./combat";
import { deployMonsters } from "./deployment";
import { addEvent, getPlayerMonsters, type MatchState } from "./matchState";
import { performMovements } from "./movement";
import { hasAvailablePlacement } from "./summonPlacement";

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
    const rolled = DICE.slice(0, configuration.diceCount).map((die) => {
        const faces = getRollableDieFaces(die, excludeInvocation);
        return faces[Math.floor(random() * faces.length)]!;
    });
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

function convertSymbols(
    context: PlayerTurnContext,
    player: PlayerId,
    invocableMonsters: readonly Monster[],
): void {
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

    for (;;) {
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
        const choice = chooseSymbolConversion(reserve, opportunities, protectedCounts);
        if (
            !choice ||
            !convertReservedSymbols(reserve, choice.sourceSymbols, choice.targetSymbol)
        ) {
            return;
        }
        state.statistics[player].conversionLosses++;
        addEvent(state, {
            turn: state.turn,
            player,
            type: "strategy",
            description: `Conversion tactique : ${choice.sourceSymbols.join(" + ")} vers ${choice.targetSymbol}.`,
        });
    }
}

function performActions(context: PlayerTurnContext, player: PlayerId): void {
    const { state, configuration, board, deckMonsters } = context;
    const stats = state.statistics[player];
    const { summoned, attacks, movements } = stats;
    deployMonsters(state, configuration, board, state.profiles[player], deckMonsters[player]);
    performAttacks(state, board);
    performMovements(state, board);
    performAttacks(state, board);

    const hasSummoned = stats.summoned !== summoned;
    const hasAttacked = stats.attacks !== attacks;
    const hasMoved = stats.movements !== movements;
    if (!hasSummoned) stats.turnsWithoutSummon++;
    if (!hasAttacked) stats.turnsWithoutAttack++;
    if (!hasMoved) stats.turnsWithoutMovement++;
    if (!hasSummoned && !hasAttacked && !hasMoved) stats.turnsWithoutUsefulAction++;
}

export function playPlayerTurn(context: PlayerTurnContext, player: PlayerId): void {
    const { state, decks } = context;
    const { turn, profiles } = state;
    const rolled = rollDice(context, player);
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

    convertSymbols(context, player, getInvocableMonsters(context, player));
    performActions(context, player);
    finishPlayerTurn(state, player);
}
