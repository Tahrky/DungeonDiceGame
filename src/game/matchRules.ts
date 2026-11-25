import type { PlacedMonster, PlayerId } from "../types/GameTypes";
import { DEFAULT_MONSTERS_KILLED_FOR_VICTORY } from "./gameConfiguration";

export { DEFAULT_MONSTERS_KILLED_FOR_VICTORY };

export const PLAYER_IDS = [1, 2] as const satisfies readonly PlayerId[];

export function byPlayer<T>(get: (player: PlayerId) => T): Record<PlayerId, T> {
    return { 1: get(1), 2: get(2) };
}

export function opposingPlayer(player: PlayerId): PlayerId {
    return player === 1 ? 2 : 1;
}

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
    for (const player of PLAYER_IDS) {
        const opponent = opposingPlayer(player);
        const defeatedMonsters = monsters.filter(
            (monster) => monster.owner === opponent && monster.currentHp <= 0,
        ).length;
        if (defeatedMonsters >= monstersKilledForVictory) return player;
    }

    return null;
}
