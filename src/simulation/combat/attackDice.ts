import { DICE } from "../../data/dice";
import { getRollableDieFaces } from "../../game/diceResources";
import { getInvokedMonsterCount } from "../../game/matchRules";
import type { PlayerId } from "../../types/GameTypes";
import type { MatchState } from "../matchState";

export interface AttackDiceOutcome {
    attackDice: number;
    probability: number;
}

export const SINGLE_ATTACK_DIE: readonly AttackDiceOutcome[] = [{ attackDice: 1, probability: 1 }];

export function getAttackDiceCountDistribution(
    diceCount: number,
    excludeInvocation: boolean,
): AttackDiceOutcome[] {
    if (!Number.isInteger(diceCount) || diceCount < 0 || diceCount > DICE.length) {
        throw new RangeError(`Le nombre de dés doit être compris entre 0 et ${DICE.length}.`);
    }

    let probabilities = [1];
    for (const die of DICE.slice(0, diceCount)) {
        const faces = getRollableDieFaces(die, excludeInvocation);
        if (faces.length === 0) throw new Error(`Le dé ${die.id} n’a aucune face disponible.`);
        const attackProbability = faces.filter((face) => face === "attack").length / faces.length;
        const nextProbabilities = Array.from({ length: probabilities.length + 1 }, () => 0);
        for (const [attacks, probability] of probabilities.entries()) {
            nextProbabilities[attacks]! += probability * (1 - attackProbability);
            nextProbabilities[attacks + 1]! += probability * attackProbability;
        }
        probabilities = nextProbabilities;
    }

    return probabilities.flatMap((probability, attackDice) =>
        probability > 0 ? [{ attackDice, probability }] : [],
    );
}

export function getExpectedAttackDiceOutcomes(
    state: MatchState,
    player: PlayerId,
): readonly AttackDiceOutcome[] {
    const configuration = state.nextTurnDice;
    if (!configuration) return SINGLE_ATTACK_DIE;
    const excludeInvocation =
        configuration.removeInvocationDiceWhenNoMonsters &&
        getInvokedMonsterCount(state.monsters, player) >= configuration.maxMonstersPerPlayer;
    return getAttackDiceCountDistribution(configuration.count, excludeInvocation);
}
