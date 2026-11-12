import type { PlacedMonster, PlayerId } from "../types/GameTypes";

export const MAX_MONSTERS_PER_PLAYER = 8;

export function getInvokedMonsterCount(
    monsters: readonly PlacedMonster[],
    player: PlayerId,
): number {
    return monsters.filter((monster) => monster.owner === player).length;
}

export function getMonsterEliminationWinner(monsters: readonly PlacedMonster[]): PlayerId | null {
    for (const player of [1, 2] as const) {
        const opponent: PlayerId = player === 1 ? 2 : 1;
        const hasInvokedAllMonsters =
            getInvokedMonsterCount(monsters, player) >= MAX_MONSTERS_PER_PLAYER;
        const hasLivingMonster = monsters.some(
            (monster) => monster.owner === player && monster.currentHp > 0,
        );
        const opponentHasLivingMonster = monsters.some(
            (monster) => monster.owner === opponent && monster.currentHp > 0,
        );

        if (hasInvokedAllMonsters && !hasLivingMonster && opponentHasLivingMonster) {
            return opponent;
        }
    }

    return null;
}
