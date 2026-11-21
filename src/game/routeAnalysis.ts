import type { BoardDefinition } from "./boards";
import { getMovementPathMap, type MovementOptions } from "./monsterActions";
import type { Position } from "../types/GameTypes";

const COST_EPSILON = 1e-9;
const MAX_ALTERNATIVE_ROUTES = 3;
const MAX_ROUTE_SEARCH_NODES = 10_000;
const MAX_CACHED_ANALYSES = 2_000;

export interface StrategicRoute {
    readonly cells: readonly Position[];
    readonly cost: number;
}

export interface PotentialRouteAnalysis {
    readonly shortestDistance: number | null;
    readonly shortestPathCount: number;
    readonly alternativeRoutes: readonly StrategicRoute[];
    readonly criticalCells: readonly Position[];
    readonly nearOptimalCells: readonly Position[];
    readonly nearOptimalCellCount: number;
}

export interface PotentialRouteOptions {
    readonly blockedCells?: readonly Position[];
    readonly cellCosts?: ReadonlyMap<string, number>;
    readonly maxRouteCost?: number;
    readonly alternativeRouteLimit?: number;
}

export interface LegalMovementRoutes {
    readonly paths: ReadonlyMap<string, Position[]>;
    readonly distances: ReadonlyMap<string, number>;
}

interface HeapEntry {
    readonly index: number;
    readonly distance: number;
}

const neighborCache = new WeakMap<BoardDefinition, readonly number[][]>();
const analysisCache = new Map<string, PotentialRouteAnalysis>();

function getAnalysisCacheKey(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    options: PotentialRouteOptions,
): string {
    const blockedCells = [...board.blockedCells, ...(options.blockedCells ?? [])]
        .map(({ x, y }) => `${x},${y}`)
        .sort()
        .join(";");
    const cellCosts = options.cellCosts
        ? [...options.cellCosts]
              .sort(([first], [second]) => first.localeCompare(second))
              .map(([key, cost]) => `${key}:${cost}`)
              .join(";")
        : "";
    return [
        board.width,
        board.height,
        `${start.x},${start.y}`,
        `${goal.x},${goal.y}`,
        options.maxRouteCost ?? "default",
        options.alternativeRouteLimit ?? MAX_ALTERNATIVE_ROUTES,
        blockedCells,
        cellCosts,
    ].join("|");
}

function getNeighbors(board: BoardDefinition): readonly number[][] {
    const cached = neighborCache.get(board);
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
    neighborCache.set(board, neighbors);
    return neighbors;
}

function pushHeap(heap: HeapEntry[], entry: HeapEntry): void {
    let index = heap.length;
    heap.push(entry);
    while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (heap[parent]!.distance <= entry.distance) break;
        heap[index] = heap[parent]!;
        index = parent;
    }
    heap[index] = entry;
}

function popHeap(heap: HeapEntry[]): HeapEntry | undefined {
    const first = heap[0];
    const last = heap.pop();
    if (!first || !last || heap.length === 0) return first;

    let index = 0;
    while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (
            child + 1 < heap.length &&
            heap[child + 1]!.distance < heap[child]!.distance
        ) {
            child++;
        }
        if (heap[child]!.distance >= last.distance) break;
        heap[index] = heap[child]!;
        index = child;
    }
    heap[index] = last;
    return first;
}

function getDistanceMap(
    board: BoardDefinition,
    startIndex: number,
    blocked: Uint8Array,
    neighbors: readonly number[][],
    cellCosts?: ReadonlyMap<string, number>,
): Float64Array {
    const distances = new Float64Array(board.width * board.height);
    distances.fill(Number.POSITIVE_INFINITY);
    distances[startIndex] = 0;

    if (!cellCosts || cellCosts.size === 0) {
        const queue = new Uint32Array(distances.length);
        let head = 0;
        let tail = 0;
        queue[tail++] = startIndex;
        while (head < tail) {
            const current = queue[head++]!;
            const nextDistance = distances[current]! + 1;
            for (const neighbor of neighbors[current]!) {
                if (blocked[neighbor] || Number.isFinite(distances[neighbor])) continue;
                distances[neighbor] = nextDistance;
                queue[tail++] = neighbor;
            }
        }
        return distances;
    }

    const heap: HeapEntry[] = [{ index: startIndex, distance: 0 }];
    while (heap.length > 0) {
        const current = popHeap(heap)!;
        if (current.distance > distances[current.index]! + COST_EPSILON) continue;
        const currentKey = `${current.index % board.width},${Math.floor(current.index / board.width)}`;
        const currentCost = cellCosts.get(currentKey) ?? 1;
        for (const neighbor of neighbors[current.index]!) {
            if (blocked[neighbor]) continue;
            const neighborKey = `${neighbor % board.width},${Math.floor(neighbor / board.width)}`;
            const neighborCost = cellCosts.get(neighborKey) ?? 1;
            const distance =
                current.distance + (currentCost + neighborCost) / 2;
            if (distance + COST_EPSILON >= distances[neighbor]!) continue;
            distances[neighbor] = distance;
            pushHeap(heap, { index: neighbor, distance });
        }
    }
    return distances;
}

function countShortestPaths(
    board: BoardDefinition,
    distances: Float64Array,
    startIndex: number,
    blocked: Uint8Array,
    neighbors: readonly number[][],
    cellCosts?: ReadonlyMap<string, number>,
): Float64Array {
    const order = Array.from({ length: distances.length }, (_, index) => index)
        .filter((index) => !blocked[index] && Number.isFinite(distances[index]))
        .sort((first, second) => distances[first]! - distances[second]!);
    const counts = new Float64Array(distances.length);
    counts[startIndex] = 1;

    for (const current of order) {
        if (counts[current] === 0) continue;
        const currentKey = `${current % board.width},${Math.floor(current / board.width)}`;
        const currentCost = cellCosts?.get(currentKey) ?? 1;
        for (const next of neighbors[current]!) {
            if (blocked[next]) continue;
            const nextKey = `${next % board.width},${Math.floor(next / board.width)}`;
            const nextCost = cellCosts?.get(nextKey) ?? 1;
            const edgeCost = cellCosts?.size ? (currentCost + nextCost) / 2 : 1;
            if (
                Math.abs(distances[current]! + edgeCost - distances[next]!) <=
                COST_EPSILON
            ) {
                counts[next] += counts[current]!;
            }
        }
    }
    return counts;
}

function validateCellCosts(cellCosts: ReadonlyMap<string, number> | undefined): void {
    if (!cellCosts) return;
    for (const [key, cost] of cellCosts) {
        if (!Number.isFinite(cost) || cost <= 0) {
            throw new RangeError(`Le coût de route pour ${key} doit être strictement positif.`);
        }
    }
}

function getAlternativeRoutes(
    board: BoardDefinition,
    startIndex: number,
    goalIndex: number,
    blocked: Uint8Array,
    neighbors: readonly number[][],
    distancesToGoal: Float64Array,
    maxRouteCost: number,
    routeLimit: number,
    cellCosts?: ReadonlyMap<string, number>,
): StrategicRoute[] {
    const found: StrategicRoute[] = [];
    const path = [startIndex];
    const onPath = new Uint8Array(blocked.length);
    onPath[startIndex] = 1;
    let searchedNodes = 0;

    function visit(current: number, costSoFar: number): void {
        if (found.length >= routeLimit || searchedNodes >= MAX_ROUTE_SEARCH_NODES) return;
        searchedNodes++;
        if (current === goalIndex) {
            found.push({
                cells: path.map((index) => ({
                    x: index % board.width,
                    y: Math.floor(index / board.width),
                })),
                cost: costSoFar,
            });
            return;
        }

        const currentKey = `${current % board.width},${Math.floor(current / board.width)}`;
        const currentCost = cellCosts?.get(currentKey) ?? 1;
        const nextCells = neighbors[current]!
            .filter(
                (next) =>
                    !blocked[next] &&
                    !onPath[next] &&
                    Number.isFinite(distancesToGoal[next]),
            )
            .map((next) => {
                const nextKey = `${next % board.width},${Math.floor(next / board.width)}`;
                const nextCost = cellCosts?.get(nextKey) ?? 1;
                const edgeCost = cellCosts?.size ? (currentCost + nextCost) / 2 : 1;
                return {
                    index: next,
                    cost: edgeCost,
                    estimate: costSoFar + edgeCost + distancesToGoal[next]!,
                };
            })
            .filter(({ estimate }) => estimate <= maxRouteCost + COST_EPSILON)
            .sort(
                (first, second) =>
                    first.estimate - second.estimate || first.index - second.index,
            );

        for (const next of nextCells) {
            onPath[next.index] = 1;
            path.push(next.index);
            visit(next.index, costSoFar + next.cost);
            path.pop();
            onPath[next.index] = 0;
            if (found.length >= routeLimit || searchedNodes >= MAX_ROUTE_SEARCH_NODES) return;
        }
    }

    visit(startIndex, 0);
    return found.sort((first, second) => first.cost - second.cost);
}

export function analyzePotentialRoutes(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    options: PotentialRouteOptions = {},
): PotentialRouteAnalysis {
    if (
        !Number.isInteger(start.x) ||
        !Number.isInteger(start.y) ||
        !Number.isInteger(goal.x) ||
        !Number.isInteger(goal.y) ||
        start.x < 0 ||
        start.y < 0 ||
        goal.x < 0 ||
        goal.y < 0 ||
        start.x >= board.width ||
        goal.x >= board.width ||
        start.y >= board.height ||
        goal.y >= board.height
    ) {
        throw new RangeError("Les extrémités de route doivent se trouver sur le plateau.");
    }
    validateCellCosts(options.cellCosts);
    const cacheKey = getAnalysisCacheKey(board, start, goal, options);
    const cached = analysisCache.get(cacheKey);
    if (cached) return cached;

    const startIndex = start.y * board.width + start.x;
    const goalIndex = goal.y * board.width + goal.x;
    const blocked = new Uint8Array(board.width * board.height);
    for (const cell of [...board.blockedCells, ...(options.blockedCells ?? [])]) {
        if (
            cell.x >= 0 &&
            cell.y >= 0 &&
            cell.x < board.width &&
            cell.y < board.height
        ) {
            blocked[cell.y * board.width + cell.x] = 1;
        }
    }
    blocked[startIndex] = 0;
    blocked[goalIndex] = 0;

    const neighbors = getNeighbors(board);
    const fromStart = getDistanceMap(
        board,
        startIndex,
        blocked,
        neighbors,
        options.cellCosts,
    );
    const shortestDistance = fromStart[goalIndex]!;
    if (!Number.isFinite(shortestDistance)) {
        const result: PotentialRouteAnalysis = {
            shortestDistance: null,
            shortestPathCount: 0,
            alternativeRoutes: [],
            criticalCells: [],
            nearOptimalCells: [],
            nearOptimalCellCount: 0,
        };
        if (analysisCache.size >= MAX_CACHED_ANALYSES) analysisCache.clear();
        analysisCache.set(cacheKey, result);
        return result;
    }

    const toGoal = getDistanceMap(
        board,
        goalIndex,
        blocked,
        neighbors,
        options.cellCosts,
    );
    const pathsFromStart = countShortestPaths(
        board,
        fromStart,
        startIndex,
        blocked,
        neighbors,
        options.cellCosts,
    );
    const pathsToGoal = countShortestPaths(
        board,
        toGoal,
        goalIndex,
        blocked,
        neighbors,
        options.cellCosts,
    );
    const shortestPathCount = pathsFromStart[goalIndex]!;
    const criticalCells: Position[] = [];
    const nearOptimalCells: Position[] = [];
    const maxRouteCost = options.maxRouteCost ?? shortestDistance + 2;

    for (let index = 0; index < blocked.length; index++) {
        if (blocked[index]) continue;
        const distanceFromStart = fromStart[index]!;
        const distanceToGoal = toGoal[index]!;
        if (
            Number.isFinite(distanceFromStart) &&
            Number.isFinite(distanceToGoal) &&
            distanceFromStart + distanceToGoal <= maxRouteCost + COST_EPSILON
        ) {
            nearOptimalCells.push({
                x: index % board.width,
                y: Math.floor(index / board.width),
            });
        }

        const pathsThroughCell = pathsFromStart[index]! * pathsToGoal[index]!;
        if (
            shortestPathCount > 0 &&
            Math.abs(pathsThroughCell / shortestPathCount - 1) <= COST_EPSILON
        ) {
            criticalCells.push({
                x: index % board.width,
                y: Math.floor(index / board.width),
            });
        }
    }

    const routeLimit = Math.max(
        1,
        Math.min(MAX_ALTERNATIVE_ROUTES, options.alternativeRouteLimit ?? MAX_ALTERNATIVE_ROUTES),
    );
    const result: PotentialRouteAnalysis = {
        shortestDistance,
        shortestPathCount,
        alternativeRoutes: getAlternativeRoutes(
            board,
            startIndex,
            goalIndex,
            blocked,
            neighbors,
            toGoal,
            maxRouteCost,
            routeLimit,
            options.cellCosts,
        ),
        criticalCells,
        nearOptimalCells,
        nearOptimalCellCount: nearOptimalCells.length,
    };
    if (analysisCache.size >= MAX_CACHED_ANALYSES) analysisCache.clear();
    analysisCache.set(cacheKey, result);
    return result;
}

export function getShortestRouteDistance(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    blockedCells: readonly Position[] = [],
): number | null {
    if (
        !Number.isInteger(start.x) ||
        !Number.isInteger(start.y) ||
        !Number.isInteger(goal.x) ||
        !Number.isInteger(goal.y) ||
        start.x < 0 ||
        start.y < 0 ||
        goal.x < 0 ||
        goal.y < 0 ||
        start.x >= board.width ||
        goal.x >= board.width ||
        start.y >= board.height ||
        goal.y >= board.height
    ) {
        throw new RangeError("Les extrémités de route doivent se trouver sur le plateau.");
    }

    const startIndex = start.y * board.width + start.x;
    const goalIndex = goal.y * board.width + goal.x;
    const blocked = new Uint8Array(board.width * board.height);
    for (const cell of [...board.blockedCells, ...blockedCells]) {
        if (
            cell.x >= 0 &&
            cell.y >= 0 &&
            cell.x < board.width &&
            cell.y < board.height
        ) {
            blocked[cell.y * board.width + cell.x] = 1;
        }
    }
    blocked[startIndex] = 0;
    blocked[goalIndex] = 0;
    const distance = getDistanceMap(board, startIndex, blocked, getNeighbors(board))[goalIndex]!;
    return Number.isFinite(distance) ? distance : null;
}

export function analyzeLegalMovementRoutes(options: MovementOptions): LegalMovementRoutes {
    const paths = getMovementPathMap(options);
    return {
        paths,
        distances: new Map(
            [...paths].map(([key, path]) => [key, Math.max(0, path.length - 1)]),
        ),
    };
}
