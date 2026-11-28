import type { BoardDefinition } from "../../game/boards";
import { evaluateStrategicState } from "../../game/ai";
import { positionKey } from "../../game/geometry";
import type { PlayerId } from "../../types/GameTypes";
import { cloneMatchState, createStrategicSnapshot, type MatchState } from "../matchState";
import { executeAttack } from "./attackExecution";
import type { AttackChoice } from "./attackChoices";

export const TACTICAL_SEARCH_CONFIGURATION = {
    depth: 2,
    branchWidth: 5,
    nodeBudget: 250,
} as const;

export const DECISIVE_SCORE = 100_000;
export function evaluatePosition(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): number {
    return evaluateStrategicState(createStrategicSnapshot(state, board, player));
}

export function applyChoiceToClone(
    state: MatchState,
    board: BoardDefinition,
    choice: AttackChoice,
): MatchState | undefined {
    const branch = cloneMatchState(state);
    const attacker = branch.monsters.find((monster) => monster.id === choice.attacker.id);
    if (!attacker) return undefined;
    executeAttack(branch, board, { ...choice, attacker });
    return branch;
}

export function createSearchCacheKey(
    state: MatchState,
    rootPlayer: PlayerId,
    depth: number,
): string {
    const monsters = state.monsters
        .map((monster) =>
            [
                monster.id,
                monster.owner,
                positionKey(monster.position),
                monster.facing,
                monster.currentHp,
                monster.attacksUsedThisTurn,
                monster.attackUsesThisTurn.join(","),
                monster.attackCooldowns.join(","),
                monster.statusEffects
                    .map(
                        (effect) =>
                            `${effect.type}:${effect.remainingTurns}:${effect.type === "damageOverTime" ? effect.damagePerTurn : 0}`,
                    )
                    .sort()
                    .join(","),
                monster.turnBuffs ? Object.values(monster.turnBuffs).join(",") : "",
                monster.movementsUsedThisTurn,
                monster.summonedOnTurn,
                monster.isCamouflaged === true ? "camouflaged" : "",
            ].join(":"),
        )
        .sort()
        .join("|");
    return [
        rootPlayer,
        state.currentPlayer,
        state.turn,
        state.health[1],
        state.health[2],
        state.reserves[1].attack,
        state.reserves[2].attack,
        state.reserves[1].movement,
        state.reserves[2].movement,
        state.reserves[1].invocation,
        state.reserves[2].invocation,
        state.profiles[1],
        state.profiles[2],
        state.tactics[1],
        state.tactics[2],
        state.nextMonsterId,
        depth,
        monsters,
    ].join(":");
}
