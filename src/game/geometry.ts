import type { Facing, Position } from "../types/GameTypes";

export const FACING_VECTORS: Readonly<Record<Facing, Position>> = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
};

export function positionKey({ x, y }: Position): string {
    return `${x},${y}`;
}

export function isSamePosition(first: Position, second: Position): boolean {
    return first.x === second.x && first.y === second.y;
}

export function getGridDistance(first: Position, second: Position): number {
    return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

export function isWithinRadius(center: Position, target: Position, radius: number): boolean {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    return dx * dx + dy * dy <= radius * radius;
}

export function isBehind(target: Position, attacker: Position, facing: Facing): boolean {
    const forward = FACING_VECTORS[facing];
    return (attacker.x - target.x) * forward.x + (attacker.y - target.y) * forward.y < 0;
}

export function getFacingFromMovement(
    source: Position,
    destination: Position,
    currentFacing: Facing,
): Facing {
    const deltaX = destination.x - source.x;
    const deltaY = destination.y - source.y;
    if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? "east" : "west";
    if (Math.abs(deltaY) > 0) return deltaY > 0 ? "south" : "north";
    return currentFacing;
}

export function hasLineOfSight(
    source: Position,
    target: Position,
    blockingCells: readonly Position[],
): boolean {
    const blockedKeys = new Set(blockingCells.map(positionKey));
    const stepX = Math.sign(target.x - source.x);
    const stepY = Math.sign(target.y - source.y);
    const absX = Math.abs(target.x - source.x);
    const absY = Math.abs(target.y - source.y);
    let traversedX = 0;
    let traversedY = 0;
    let x = source.x;
    let y = source.y;

    while (traversedX < absX || traversedY < absY) {
        const nextCell = (1 + 2 * traversedX) * absY - (1 + 2 * traversedY) * absX;
        if (nextCell === 0) {
            if (blockedKeys.has(`${x + stepX},${y}`) && blockedKeys.has(`${x},${y + stepY}`)) {
                return false;
            }
            x += stepX;
            y += stepY;
            traversedX++;
            traversedY++;
        } else if (nextCell < 0) {
            x += stepX;
            traversedX++;
        } else {
            y += stepY;
            traversedY++;
        }

        if ((x !== target.x || y !== target.y) && blockedKeys.has(`${x},${y}`)) return false;
    }

    return true;
}

export function getOrthogonalNeighbors(position: Position): Position[] {
    return [
        { x: position.x + 1, y: position.y },
        { x: position.x - 1, y: position.y },
        { x: position.x, y: position.y + 1 },
        { x: position.x, y: position.y - 1 },
    ];
}
