import { getStartingPositions, type BoardDefinition } from "./boards";
import { canPassHostileMonsters, type MovementOptions } from "./monsterActions";
import { getMonsterMovementRange } from "./statusEffects";
import type { PlacedMonster, Position } from "../types/GameTypes";

export function createMonsterMovementOptions(
    board: BoardDefinition,
    monsters: readonly PlacedMonster[],
    blockedCells: readonly Position[],
    monster: PlacedMonster,
    destination: Position,
): MovementOptions {
    const others = monsters.filter((placed) => placed.currentHp > 0 && placed.id !== monster.id);
    return {
        source: monster.position,
        destination,
        deployedCells: monsters.flatMap((placed) => placed.cells),
        occupiedCells: others.map((placed) => placed.position),
        blockedCells: [...Object.values(getStartingPositions(board)), ...blockedCells],
        range: getMonsterMovementRange(monster),
        hostileCells: others
            .filter((placed) => placed.owner !== monster.owner)
            .map((placed) => placed.position),
        canPassHostiles: canPassHostileMonsters(monster.monster),
        canPassUndeployedCells: monster.monster.flying === true,
        boardWidth: board.width,
        boardHeight: board.height,
    };
}
