import type { BoardDefinition } from "../../game/boards";
import { choosesRandomActions } from "../../game/botStrategy";
import { opposingPlayer } from "../../game/matchRules";
import { pickIndex } from "../../game/random";
import type { MatchState } from "../matchState";
import type { AttackChoice } from "./attackChoices";
import { getAvailableAttackChoices } from "./attackChoices";
import { executeAttack } from "./attackExecution";
import { searchBestAttack } from "./tacticalSearch";

function recordAttackDecision(
    state: MatchState,
    choices: readonly AttackChoice[],
    selected: AttackChoice,
): AttackChoice {
    state.decisionTraces?.push({
        turn: state.turn,
        player: state.currentPlayer,
        action: "attack",
        candidates: choices.map((choice) => ({
            attackerMonsterId: choice.attacker.monster.id,
            attackIndex: choice.attackIndex,
            target: { ...choice.target },
            features: { ...choice.features },
            score: choice.score,
        })),
        selectedIndex: choices.indexOf(selected),
    });
    return selected;
}

function selectAttack(
    state: MatchState,
    board: BoardDefinition,
    choices: readonly AttackChoice[],
    bestChoice: AttackChoice,
): AttackChoice {
    const player = state.currentPlayer;
    const profile = state.profiles[player];
    if (choices.length === 1 || profile === "greedy") return bestChoice;
    if (choosesRandomActions(profile)) {
        const random = state.actionRandom?.[player]?.() ?? 0;
        return choices[pickIndex(random, choices.length)]!;
    }
    if (
        bestChoice.features.baseDamage > 0 &&
        bestChoice.features.baseDamage >= state.health[opposingPlayer(player)]
    ) {
        return bestChoice;
    }
    return searchBestAttack(state, board, choices, bestChoice);
}

function chooseAttack(state: MatchState, board: BoardDefinition): AttackChoice | null {
    const choices = getAvailableAttackChoices(state, board);
    const [bestChoice] = choices;
    if (!bestChoice) return null;
    return recordAttackDecision(state, choices, selectAttack(state, board, choices, bestChoice));
}

export function performAttacks(state: MatchState, board: BoardDefinition): void {
    while (state.winner === null) {
        const choice = chooseAttack(state, board);
        if (!choice) return;
        executeAttack(state, board, choice);
    }
}
