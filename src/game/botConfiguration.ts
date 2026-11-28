import { isPlainRecord } from "../utils/guards";
import type { GameConfiguration } from "./gameConfiguration";

export interface BotDecisionOptions {
    completeAttackPhases?: boolean;
    broaderAttackCandidates?: boolean;
    movementAttackCombos?: boolean;
    nextTurnDiceExpectation?: boolean;
    summonPlacementPairs?: boolean;
    expectiminimax?: boolean;
    expectiminimaxMaxDepth?: number;
    expectiminimaxBranchWidth?: number;
    expectiminimaxNodeBudget?: number;
}

const OPTION_KEYS = new Set([
    "completeAttackPhases",
    "broaderAttackCandidates",
    "movementAttackCombos",
    "nextTurnDiceExpectation",
    "summonPlacementPairs",
    "expectiminimax",
    "expectiminimaxMaxDepth",
    "expectiminimaxBranchWidth",
    "expectiminimaxNodeBudget",
]);

export function parseBotDecisionOptions(value: unknown): BotDecisionOptions | null {
    if (!isPlainRecord(value)) {
        return null;
    }
    for (const [key, option] of Object.entries(value)) {
        if (!OPTION_KEYS.has(key)) return null;
        if (
            key === "expectiminimaxMaxDepth" ||
            key === "expectiminimaxBranchWidth" ||
            key === "expectiminimaxNodeBudget"
        ) {
            if (!Number.isInteger(option) || (option as number) < 1) return null;
        } else if (typeof option !== "boolean") {
            return null;
        }
    }
    return {
        ...(value.completeAttackPhases === undefined
            ? {}
            : { completeAttackPhases: value.completeAttackPhases === true }),
        ...(value.broaderAttackCandidates === undefined
            ? {}
            : { broaderAttackCandidates: value.broaderAttackCandidates === true }),
        ...(value.movementAttackCombos === undefined
            ? {}
            : { movementAttackCombos: value.movementAttackCombos === true }),
        ...(value.nextTurnDiceExpectation === undefined
            ? {}
            : { nextTurnDiceExpectation: value.nextTurnDiceExpectation === true }),
        ...(value.summonPlacementPairs === undefined
            ? {}
            : { summonPlacementPairs: value.summonPlacementPairs === true }),
        ...(value.expectiminimax === undefined
            ? {}
            : { expectiminimax: value.expectiminimax === true }),
        ...(value.expectiminimaxMaxDepth === undefined
            ? {}
            : { expectiminimaxMaxDepth: value.expectiminimaxMaxDepth as number }),
        ...(value.expectiminimaxBranchWidth === undefined
            ? {}
            : { expectiminimaxBranchWidth: value.expectiminimaxBranchWidth as number }),
        ...(value.expectiminimaxNodeBudget === undefined
            ? {}
            : { expectiminimaxNodeBudget: value.expectiminimaxNodeBudget as number }),
    };
}

export function createBotDecisionSettings(
    configuration: GameConfiguration,
    options: BotDecisionOptions,
) {
    return {
        completeAttackPhases: options.completeAttackPhases === true,
        broaderAttackCandidates: options.broaderAttackCandidates === true,
        movementAttackCombos: options.movementAttackCombos === true,
        summonPlacementPairs: options.summonPlacementPairs === true,
        nextTurnDice: options.nextTurnDiceExpectation
            ? {
                  count: configuration.diceCount,
                  removeInvocationDiceWhenNoMonsters:
                      configuration.removeInvocationDiceWhenNoMonsters,
                  maxMonstersPerPlayer: configuration.maxMonstersPerPlayer,
              }
            : undefined,
        expectiminimax: options.expectiminimax !== false,
        expectiminimaxConfig: {
            maxDepth: options.expectiminimaxMaxDepth ?? 2,
            branchWidth: options.expectiminimaxBranchWidth ?? 5,
            nodeBudget: options.expectiminimaxNodeBudget ?? 250,
        },
    };
}
