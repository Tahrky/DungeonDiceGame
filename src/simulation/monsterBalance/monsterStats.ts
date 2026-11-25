import type { Monster, MonsterAttack } from "../../types/GameTypes";

export function getAttackSlots(monster: Monster): number {
    return Math.max(1, monster.attackActionsPerTurn ?? 1);
}

export function getMovementActions(monster: Monster): number {
    return Math.max(1, monster.movementActionsPerTurn ?? 1);
}

export function getMovementCost(monster: Monster): number {
    return monster.movementCost ?? 1;
}

export function isUsableFromStart(attack: MonsterAttack): boolean {
    return (attack.initialCooldownTurns ?? 0) === 0;
}
