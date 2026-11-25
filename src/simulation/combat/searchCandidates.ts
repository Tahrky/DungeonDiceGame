import type { BoardDefinition } from "../../game/boards";
import { positionKey } from "../../game/geometry";
import type { PlayerId } from "../../types/GameTypes";
import type { MatchState } from "../matchState";
import type { AttackChoice } from "./attackChoices";
import {
    applyChoiceToClone,
    DECISIVE_SCORE,
    evaluatePosition,
    TACTICAL_SEARCH_CONFIGURATION,
} from "./searchState";

function getChoiceKey(choice: AttackChoice): string {
    return [
        choice.attacker.id,
        choice.attackIndex,
        choice.target.x,
        choice.target.y,
        choice.cells.map(positionKey).join(";"),
    ].join(":");
}

function findBestKill(choices: readonly AttackChoice[]): AttackChoice | undefined {
    return choices.reduce<AttackChoice | undefined>((best, choice) => {
        if (choice.features.kills === 0) return best;
        return !best ||
            choice.features.kills > best.features.kills ||
            (choice.features.kills === best.features.kills && choice.score > best.score)
            ? choice
            : best;
    }, undefined);
}

function findBestStrategicChoice(
    state: MatchState,
    board: BoardDefinition,
    rootPlayer: PlayerId,
    choices: readonly AttackChoice[],
): AttackChoice | undefined {
    let bestChoice: AttackChoice | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const choice of choices) {
        const branch = applyChoiceToClone(state, board, choice);
        if (!branch) continue;
        const score =
            branch.winner === rootPlayer
                ? DECISIVE_SCORE
                : evaluatePosition(branch, board, rootPlayer);
        if (score > bestScore) {
            bestChoice = choice;
            bestScore = score;
        }
    }
    return bestChoice;
}

export function getTacticalSearchCandidates(
    state: MatchState,
    board: BoardDefinition,
    rootPlayer: PlayerId,
    choices: readonly AttackChoice[],
): AttackChoice[] {
    const topChoices = choices.slice(0, TACTICAL_SEARCH_CONFIGURATION.branchWidth);
    if (!state.broaderAttackCandidates) return topChoices;

    const bestByAttacker = new Map<string, AttackChoice>();
    for (const choice of choices) {
        if (!bestByAttacker.has(choice.attacker.id)) bestByAttacker.set(choice.attacker.id, choice);
    }
    const candidates = new Map<string, AttackChoice>();
    for (const choice of [
        ...topChoices,
        ...bestByAttacker.values(),
        findBestKill(choices),
        findBestStrategicChoice(state, board, rootPlayer, choices),
    ]) {
        if (!choice) continue;
        const key = getChoiceKey(choice);
        if (!candidates.has(key)) candidates.set(key, choice);
    }
    return [...candidates.values()];
}
