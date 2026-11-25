import type { BoardDefinition } from "../../game/boards";
import { choosesRandomActions } from "../../game/botStrategy";
import { opposingPlayer } from "../../game/matchRules";
import { pickIndex } from "../../game/random";
import type { MatchState } from "../matchState";
import type { AttackChoice } from "./attackChoices";
import { getAvailableAttackChoices } from "./attackChoices";
import { executeAttack } from "./attackExecution";
import { searchBestAttack } from "./tacticalSearch";
import type { BotAction } from "../botAction";

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

export function chooseAttack(state: MatchState, board: BoardDefinition): AttackChoice | null {
    if (state.winner !== null) return null;
    const choices = getAvailableAttackChoices(state, board);
    const [bestChoice] = choices;
    if (!bestChoice) return null;
    return recordAttackDecision(state, choices, selectAttack(state, board, choices, bestChoice));
}

export function* decideAttacks(
    state: MatchState,
    board: BoardDefinition,
): Generator<Extract<BotAction, { type: "attack" }>> {
    while (state.winner === null) {
        const choice = chooseAttack(state, board);
        if (!choice) return;
        yield { type: "attack", choice };
    }
}

export function performAttacks(state: MatchState, board: BoardDefinition): void {
    for (const action of decideAttacks(state, board)) {
        executeAttack(state, board, action.choice);
    }
}
