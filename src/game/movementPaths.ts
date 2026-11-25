import type { Position } from "../types/GameTypes";
import { getOrthogonalNeighbors, isSamePosition, positionKey } from "./geometry";

export interface MovementOptions {
    readonly source: Position;
    readonly destination: Position;
    readonly deployedCells: readonly Position[];
    readonly occupiedCells: readonly Position[];
    readonly blockedCells: readonly Position[];
    range?: number;
    readonly hostileCells?: readonly Position[];
    readonly canPassHostiles?: boolean;
    readonly canPassUndeployedCells?: boolean;
    boardWidth?: number;
    boardHeight?: number;
}

type MovementTraversalOptions = Pick<
    MovementOptions,
    | "deployedCells"
    | "blockedCells"
    | "hostileCells"
    | "canPassHostiles"
    | "canPassUndeployedCells"
    | "boardWidth"
    | "boardHeight"
>;

interface TraversalContext {
    visited: Map<string, number>;
    blockedKeys: ReadonlySet<string>;
    deployedKeys: ReadonlySet<string>;
    hostileKeys: ReadonlySet<string>;
    canPassHostiles: boolean;
    canPassUndeployedCells: boolean;
    boardWidth: number;
    boardHeight: number;
}

const DEFAULT_MOVEMENT_RANGE = 2;

export function canMoveMonsterTo(options: MovementOptions): boolean {
    return getMonsterMovementPath(options).length > 1;
}

export function getMonsterMovementPath(options: MovementOptions): Position[] {
    const { source, destination, range = DEFAULT_MOVEMENT_RANGE } = options;
    if (!isValidDestination(options, destination, range)) return [];

    const sourceKey = positionKey(source);
    const destinationKey = positionKey(destination);
    if (sourceKey === destinationKey) return [];

    const traversal = createTraversal(options, new Map([[sourceKey, 0]]));
    const previous = exploreFrom(source, range, traversal, destinationKey);
    return tracePath(previous, sourceKey, destination);
}

export function getMovementPathMap(options: MovementOptions): Map<string, Position[]> {
    const { source, range = DEFAULT_MOVEMENT_RANGE } = options;
    const paths = new Map<string, Position[]>();
    if (range <= 0) return paths;

    const sourceKey = positionKey(source);
    const traversal = createTraversal(options, new Map([[sourceKey, 0]]));
    const previous = exploreFrom(source, range, traversal);

    for (const destination of options.deployedCells) {
        const destinationKey = positionKey(destination);
        if (
            destinationKey === sourceKey ||
            !traversal.visited.has(destinationKey) ||
            !isValidDestination(options, destination, range)
        ) {
            continue;
        }
        const path = tracePath(previous, sourceKey, destination);
        if (path.length > 0) paths.set(destinationKey, path);
    }
    return paths;
}

export function getMovementDistanceMap(
    destinations: readonly Position[],
    options: MovementTraversalOptions,
): Map<string, number> {
    const distances = new Map<string, number>();
    const traversal = createTraversal(options, distances);
    const queue: Position[] = [];

    for (const destination of destinations) {
        const key = positionKey(destination);
        if (isTraversableCell(destination, key, traversal)) {
            distances.set(key, 0);
            queue.push(destination);
        }
    }

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        const distance = distances.get(positionKey(current))!;
        for (const neighbor of getOrthogonalNeighbors(current)) {
            const neighborKey = positionKey(neighbor);
            if (!isTraversableCell(neighbor, neighborKey, traversal)) continue;
            distances.set(neighborKey, distance + 1);
            queue.push(neighbor);
        }
    }
    return distances;
}

function createTraversal(
    options: MovementTraversalOptions,
    visited: Map<string, number>,
): TraversalContext {
    return {
        visited,
        blockedKeys: new Set(options.blockedCells.map(positionKey)),
        deployedKeys: new Set(options.deployedCells.map(positionKey)),
        hostileKeys: new Set((options.hostileCells ?? []).map(positionKey)),
        canPassHostiles: options.canPassHostiles ?? false,
        canPassUndeployedCells: options.canPassUndeployedCells ?? false,
        boardWidth: options.boardWidth ?? Number.POSITIVE_INFINITY,
        boardHeight: options.boardHeight ?? Number.POSITIVE_INFINITY,
    };
}

// Breadth-first search that records each cell's parent; stops as soon as `stopKey` is reached.
function exploreFrom(
    source: Position,
    range: number,
    traversal: TraversalContext,
    stopKey?: string,
): Map<string, Position> {
    const previous = new Map<string, Position>();
    const queue = [source];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        const distance = traversal.visited.get(positionKey(current)) ?? 0;
        if (distance >= range) continue;

        for (const neighbor of getOrthogonalNeighbors(current)) {
            const neighborKey = positionKey(neighbor);
            if (!isTraversableCell(neighbor, neighborKey, traversal)) continue;
            traversal.visited.set(neighborKey, distance + 1);
            previous.set(neighborKey, current);
            if (neighborKey === stopKey) return previous;
            queue.push(neighbor);
        }
    }
    return previous;
}

function tracePath(
    previous: ReadonlyMap<string, Position>,
    sourceKey: string,
    destination: Position,
): Position[] {
    const path = [destination];
    let key = positionKey(destination);
    while (key !== sourceKey) {
        const parent = previous.get(key);
        if (!parent) return [];
        path.unshift(parent);
        key = positionKey(parent);
    }
    return path;
}

function isValidDestination(
    { deployedCells, occupiedCells, blockedCells }: MovementOptions,
    destination: Position,
    range: number,
): boolean {
    return (
        range > 0 &&
        deployedCells.some((cell) => isSamePosition(cell, destination)) &&
        !occupiedCells.some((cell) => isSamePosition(cell, destination)) &&
        !blockedCells.some((cell) => isSamePosition(cell, destination))
    );
}

function isTraversableCell(position: Position, key: string, context: TraversalContext): boolean {
    return (
        position.x >= 0 &&
        position.y >= 0 &&
        position.x < context.boardWidth &&
        position.y < context.boardHeight &&
        !context.visited.has(key) &&
        !context.blockedKeys.has(key) &&
        (context.canPassUndeployedCells || context.deployedKeys.has(key)) &&
        (context.canPassHostiles || !context.hostileKeys.has(key))
    );
}
