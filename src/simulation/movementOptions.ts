import type { BoardDefinition } from "../game/boards";
import { createMonsterMovementOptions } from "../game/movementRules";
import type { MovementOptions } from "../game/monsterActions";
import type { PlacedMonster } from "../types/GameTypes";
import { getBlockedCells, type MatchState } from "./matchState";

export function createMovementOptions(
    state: MatchState,
    board: BoardDefinition,
    monster: PlacedMonster,
): MovementOptions {
    return createMonsterMovementOptions(
        board,
        state.monsters,
        getBlockedCells(state, board),
        monster,
        monster.position,
    );
}
