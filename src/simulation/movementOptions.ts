import { getStartingPositions, type BoardDefinition } from "../game/boards";
import {
    canPassHostileMonsters,
    getMovementRange,
    type MovementOptions,
} from "../game/monsterActions";
import type { PlacedMonster } from "../types/GameTypes";
import type { MatchState } from "./matchState";

export function createMovementOptions(
    state: MatchState,
    board: BoardDefinition,
    monster: PlacedMonster,
): MovementOptions {
    return {
        source: monster.position,
        deployedCells: state.monsters.flatMap((placed) => placed.cells),
        occupiedCells: state.monsters
            .filter((placed) => placed.currentHp > 0 && placed.id !== monster.id)
            .map((placed) => placed.position),
        blockedCells: [...board.blockedCells, ...Object.values(getStartingPositions(board))],
        hostileCells: state.monsters
            .filter((placed) => placed.currentHp > 0 && placed.owner !== monster.owner)
            .map((placed) => placed.position),
        canPassHostiles: canPassHostileMonsters(monster.monster),
        canPassUndeployedCells: monster.monster.flying === true,
        range: getMovementRange(monster.monster, monster.turnBuffs?.movementRangeBonus ?? 0),
        boardWidth: board.width,
        boardHeight: board.height,
        destination: monster.position,
    };
}
