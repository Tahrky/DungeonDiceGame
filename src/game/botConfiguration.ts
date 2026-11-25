import { isPlainRecord } from "../utils/guards";
import type { GameConfiguration } from "./gameConfiguration";

export interface BotDecisionOptions {
    completeAttackPhases?: boolean;
    broaderAttackCandidates?: boolean;
    movementAttackCombos?: boolean;
    nextTurnDiceExpectation?: boolean;
    summonPlacementPairs?: boolean;
}

const OPTION_KEYS = new Set([
    "completeAttackPhases",
    "broaderAttackCandidates",
    "movementAttackCombos",
    "nextTurnDiceExpectation",
    "summonPlacementPairs",
]);

export function parseBotDecisionOptions(value: unknown): BotDecisionOptions | null {
    if (
        !isPlainRecord(value) ||
        Object.entries(value).some(
            ([key, enabled]) => !OPTION_KEYS.has(key) || typeof enabled !== "boolean",
        )
    ) {
        return null;
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
    };
}
