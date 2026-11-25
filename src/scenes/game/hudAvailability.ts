import {
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    getAttackActionsPerTurn,
    getAttackCost,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../../game/monsterActions";
import type { PlacedMonster } from "../../types/GameTypes";
import type { GameViewState } from "./GameViewState";

function someOwnLivingMonster(
    state: GameViewState,
    predicate: (monster: PlacedMonster) => boolean,
): boolean {
    return state.placedMonsters.some(
        (monster) =>
            monster.owner === state.currentPlayer && monster.currentHp > 0 && predicate(monster),
    );
}

export function hasFreeAttack(state: GameViewState): boolean {
    return someOwnLivingMonster(state, (monster) => {
        const costReduction = monster.turnBuffs?.attackCostReduction ?? 0;
        return (
            costReduction > 0 &&
            canUseActionThisTurn(
                monster.attacksUsedThisTurn,
                getAttackActionsPerTurn(monster.monster),
            ) &&
            monster.monster.attacks.some(
                (attack, index) =>
                    getAttackCost(attack, costReduction) === 0 &&
                    (monster.attackCooldowns[index] ?? 0) === 0 &&
                    canUseMonsterAttackThisTurn(attack, monster.attackUsesThisTurn[index] ?? 0),
            )
        );
    });
}

export function canMove(state: GameViewState, movementCount: number): boolean {
    return someOwnLivingMonster(
        state,
        (monster) =>
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            ) &&
            getMovementCost(monster.monster, monster.turnBuffs?.movementCostReduction ?? 0) <=
                movementCount,
    );
}
