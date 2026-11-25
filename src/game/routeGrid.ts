import { isInsideBoard, type BoardDefinition } from "./boards";
import type { Position } from "../types/GameTypes";
import { popHeap, pushHeap, type HeapEntry } from "../utils/minHeap";
import { positionKey } from "./geometry";

export const COST_EPSILON = 1e-9;

export interface RouteGrid {
    readonly width: number;
    readonly blocked: Uint8Array;
    readonly neighbors: readonly number[][];
    readonly costs?: Float64Array;
}

const neighborCache = new Map<string, readonly number[][]>();

function getNeighbors(board: BoardDefinition): readonly number[][] {
    const key = `${board.width}x${board.height}`;
    const cached = neighborCache.get(key);
    if (cached) return cached;

    const neighbors = Array.from({ length: board.width * board.height }, (_, index) => {
        const x = index % board.width;
        const y = Math.floor(index / board.width);
        const result: number[] = [];
        if (x > 0) result.push(index - 1);
        if (x + 1 < board.width) result.push(index + 1);
        if (y > 0) result.push(index - board.width);
        if (y + 1 < board.height) result.push(index + board.width);
        return result;
    });
    if (neighborCache.size >= 32) neighborCache.clear();
    neighborCache.set(key, neighbors);
    return neighbors;
}

export function toPosition(width: number, index: number): Position {
    return { x: index % width, y: Math.floor(index / width) };
}

export function getCellIndex(board: BoardDefinition, { x, y }: Position): number {
    return y * board.width + x;
}

export function getEdgeCost({ costs }: RouteGrid, from: number, to: number): number {
    return costs ? (costs[from]! + costs[to]!) / 2 : 1;
}

function getCellCosts(
    board: BoardDefinition,
    cellCosts: ReadonlyMap<string, number> | undefined,
): Float64Array | undefined {
    if (!cellCosts?.size) return undefined;
    return Float64Array.from(
        { length: board.width * board.height },
        (_, index) => cellCosts.get(positionKey(toPosition(board.width, index))) ?? 1,
    );
}

export function createRouteGrid(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    extraBlockedCells: readonly Position[],
    cellCosts?: ReadonlyMap<string, number>,
): RouteGrid {
    const blocked = new Uint8Array(board.width * board.height);
    for (const cell of [...board.blockedCells, ...extraBlockedCells]) {
        if (isInsideBoard(board, cell)) blocked[getCellIndex(board, cell)] = 1;
    }
    blocked[getCellIndex(board, start)] = 0;
    blocked[getCellIndex(board, goal)] = 0;
    return {
        width: board.width,
        blocked,
        neighbors: getNeighbors(board),
        costs: getCellCosts(board, cellCosts),
    };
}

function fillUnitDistances(
    { blocked, neighbors }: RouteGrid,
    distances: Float64Array,
    start: number,
) {
    const queue = new Uint32Array(distances.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    while (head < tail) {
        const current = queue[head++]!;
        const nextDistance = distances[current]! + 1;
        for (const neighbor of neighbors[current]!) {
            if (blocked[neighbor] || Number.isFinite(distances[neighbor])) continue;
            distances[neighbor] = nextDistance;
            queue[tail++] = neighbor;
        }
    }
}

function fillWeightedDistances(grid: RouteGrid, distances: Float64Array, start: number) {
    const heap: HeapEntry[] = [{ index: start, distance: 0 }];
    while (heap.length > 0) {
        const current = popHeap(heap)!;
        if (current.distance > distances[current.index]! + COST_EPSILON) continue;
        for (const neighbor of grid.neighbors[current.index]!) {
            if (grid.blocked[neighbor]) continue;
            const distance = current.distance + getEdgeCost(grid, current.index, neighbor);
            if (distance + COST_EPSILON >= distances[neighbor]!) continue;
            distances[neighbor] = distance;
            pushHeap(heap, { index: neighbor, distance });
        }
    }
}

export function getDistanceMap(grid: RouteGrid, startIndex: number): Float64Array {
    const distances = new Float64Array(grid.blocked.length).fill(Number.POSITIVE_INFINITY);
    distances[startIndex] = 0;
    if (grid.costs) fillWeightedDistances(grid, distances, startIndex);
    else fillUnitDistances(grid, distances, startIndex);
    return distances;
}

export function countShortestPaths(
    grid: RouteGrid,
    distances: Float64Array,
    startIndex: number,
): Float64Array {
    const { blocked, neighbors } = grid;
    const order = Array.from({ length: distances.length }, (_, index) => index)
        .filter((index) => !blocked[index] && Number.isFinite(distances[index]))
        .sort((first, second) => distances[first]! - distances[second]!);
    const counts = new Float64Array(distances.length);
    counts[startIndex] = 1;

    for (const current of order) {
        if (counts[current] === 0) continue;
        for (const next of neighbors[current]!) {
            if (blocked[next]) continue;
            const edgeCost = getEdgeCost(grid, current, next);
            if (Math.abs(distances[current]! + edgeCost - distances[next]!) <= COST_EPSILON) {
                counts[next] += counts[current]!;
            }
        }
    }
    return counts;
}
