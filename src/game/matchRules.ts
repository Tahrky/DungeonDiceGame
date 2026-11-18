import type { PlacedMonster, PlayerId } from "../types/GameTypes";
import { DEFAULT_MONSTERS_KILLED_FOR_VICTORY } from "./gameConfiguration";

export { DEFAULT_MONSTERS_KILLED_FOR_VICTORY };

export function getInvokedMonsterCount(
    monsters: readonly PlacedMonster[],
    player: PlayerId,
): number {
    return monsters.filter((monster) => monster.owner === player).length;
}

export function getMonsterEliminationWinner(
    monsters: readonly PlacedMonster[],
    monstersKilledForVictory = DEFAULT_MONSTERS_KILLED_FOR_VICTORY,
): PlayerId | null {
    for (const player of [1, 2] as const) {
        const opponent: PlayerId = player === 1 ? 2 : 1;
        const defeatedMonsters = monsters.filter(
            (monster) => monster.owner === opponent && monster.currentHp <= 0,
        ).length;
        if (defeatedMonsters >= monstersKilledForVictory) return player;
    }

    return null;
}
