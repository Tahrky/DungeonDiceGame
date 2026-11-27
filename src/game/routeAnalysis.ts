import { isInsideBoard, type BoardDefinition } from "./boards";
import { getMovementPathMap, type MovementOptions } from "./monsterActions";
import type { Position } from "../types/GameTypes";
import { positionKey } from "./geometry";
import {
    COST_EPSILON,
    countShortestPaths,
    createRouteGrid,
    getCellIndex,
    getDistanceMap,
    getEdgeCost,
    getUnitDistance,
    toPosition,
    type RouteGrid,
} from "./routeGrid";

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

const UNREACHABLE_ANALYSIS: PotentialRouteAnalysis = {
    shortestDistance: null,
    shortestPathCount: 0,
    alternativeRoutes: [],
    criticalCells: [],
    nearOptimalCells: [],
    nearOptimalCellCount: 0,
};

const analysisCache = new Map<string, PotentialRouteAnalysis>();

function getAnalysisCacheKey(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    options: PotentialRouteOptions,
): string {
    const blockedCells = [...board.blockedCells, ...(options.blockedCells ?? [])]
        .map(positionKey)
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
        positionKey(start),
        positionKey(goal),
        options.maxRouteCost ?? "default",
        options.alternativeRouteLimit ?? MAX_ALTERNATIVE_ROUTES,
        blockedCells,
        cellCosts,
    ].join("|");
}

function cacheAnalysis(key: string, analysis: PotentialRouteAnalysis): PotentialRouteAnalysis {
    if (analysisCache.size >= MAX_CACHED_ANALYSES) analysisCache.clear();
    analysisCache.set(key, analysis);
    return analysis;
}

function validateCellCosts(cellCosts: ReadonlyMap<string, number> | undefined): void {
    if (!cellCosts) return;
    for (const [key, cost] of cellCosts) {
        if (!Number.isFinite(cost) || cost <= 0) {
            throw new RangeError(`Le coût de route pour ${key} doit être strictement positif.`);
        }
    }
}

function assertRouteEndpoints(board: BoardDefinition, ...endpoints: Position[]): void {
    for (const endpoint of endpoints) {
        if (
            !Number.isInteger(endpoint.x) ||
            !Number.isInteger(endpoint.y) ||
            !isInsideBoard(board, endpoint)
        ) {
            throw new RangeError("Les extrémités de route doivent se trouver sur le plateau.");
        }
    }
}

function getAlternativeRoutes(
    grid: RouteGrid,
    startIndex: number,
    goalIndex: number,
    distancesToGoal: Float64Array,
    maxRouteCost: number,
    routeLimit: number,
): StrategicRoute[] {
    const { width, blocked, neighbors } = grid;
    const found: StrategicRoute[] = [];
    const path = [startIndex];
    const onPath = new Uint8Array(blocked.length);
    onPath[startIndex] = 1;
    let searchedNodes = 0;
    const isSearchOver = () =>
        found.length >= routeLimit || searchedNodes >= MAX_ROUTE_SEARCH_NODES;

    function visit(current: number, costSoFar: number): void {
        if (isSearchOver()) return;
        searchedNodes++;
        if (current === goalIndex) {
            found.push({ cells: path.map((index) => toPosition(width, index)), cost: costSoFar });
            return;
        }

        const nextCells = neighbors[current]!.filter(
            (next) => !blocked[next] && !onPath[next] && Number.isFinite(distancesToGoal[next]),
        )
            .map((next) => {
                const cost = getEdgeCost(grid, current, next);
                return { index: next, cost, estimate: costSoFar + cost + distancesToGoal[next]! };
            })
            .filter(({ estimate }) => estimate <= maxRouteCost + COST_EPSILON)
            .sort(
                (first, second) => first.estimate - second.estimate || first.index - second.index,
            );

        for (const next of nextCells) {
            onPath[next.index] = 1;
            path.push(next.index);
            visit(next.index, costSoFar + next.cost);
            path.pop();
            onPath[next.index] = 0;
            if (isSearchOver()) return;
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
    assertRouteEndpoints(board, start, goal);
    validateCellCosts(options.cellCosts);
    const cacheKey = getAnalysisCacheKey(board, start, goal, options);
    const cached = analysisCache.get(cacheKey);
    if (cached) return cached;

    const grid = createRouteGrid(board, start, goal, options.blockedCells ?? [], options.cellCosts);
    const startIndex = getCellIndex(board, start);
    const goalIndex = getCellIndex(board, goal);
    const fromStart = getDistanceMap(grid, startIndex);
    const shortestDistance = fromStart[goalIndex]!;
    if (!Number.isFinite(shortestDistance)) return cacheAnalysis(cacheKey, UNREACHABLE_ANALYSIS);

    const toGoal = getDistanceMap(grid, goalIndex);
    const pathsFromStart = countShortestPaths(grid, fromStart, startIndex);
    const pathsToGoal = countShortestPaths(grid, toGoal, goalIndex);
    const shortestPathCount = pathsFromStart[goalIndex]!;
    const criticalCells: Position[] = [];
    const nearOptimalCells: Position[] = [];
    const maxRouteCost = options.maxRouteCost ?? shortestDistance + 2;

    for (let index = 0; index < grid.blocked.length; index++) {
        if (grid.blocked[index]) continue;
        const distanceFromStart = fromStart[index]!;
        const distanceToGoal = toGoal[index]!;
        if (
            Number.isFinite(distanceFromStart) &&
            Number.isFinite(distanceToGoal) &&
            distanceFromStart + distanceToGoal <= maxRouteCost + COST_EPSILON
        ) {
            nearOptimalCells.push(toPosition(board.width, index));
        }

        const pathsThroughCell = pathsFromStart[index]! * pathsToGoal[index]!;
        if (
            shortestPathCount > 0 &&
            Math.abs(pathsThroughCell / shortestPathCount - 1) <= COST_EPSILON
        ) {
            criticalCells.push(toPosition(board.width, index));
        }
    }

    const routeLimit = Math.max(
        1,
        Math.min(MAX_ALTERNATIVE_ROUTES, options.alternativeRouteLimit ?? MAX_ALTERNATIVE_ROUTES),
    );
    return cacheAnalysis(cacheKey, {
        shortestDistance,
        shortestPathCount,
        alternativeRoutes: getAlternativeRoutes(
            grid,
            startIndex,
            goalIndex,
            toGoal,
            maxRouteCost,
            routeLimit,
        ),
        criticalCells,
        nearOptimalCells,
        nearOptimalCellCount: nearOptimalCells.length,
    });
}

export function getShortestRouteDistance(
    board: BoardDefinition,
    start: Position,
    goal: Position,
    blockedCells: readonly Position[] = [],
): number | null {
    assertRouteEndpoints(board, start, goal);
    const grid = createRouteGrid(board, start, goal, blockedCells);
    return getUnitDistance(grid, getCellIndex(board, start), getCellIndex(board, goal));
}

export function analyzeLegalMovementRoutes(options: MovementOptions): LegalMovementRoutes {
    const paths = getMovementPathMap(options);
    return {
        paths,
        distances: new Map([...paths].map(([key, path]) => [key, Math.max(0, path.length - 1)])),
    };
}
