import type { PlayerId, Position } from "../types/GameTypes";
import { getGridDistance, hasLineOfSight, positionKey } from "./geometry";
import { analyzePotentialRoutes, getShortestRouteDistance } from "./routeAnalysis";
import { DEFAULT_BOT_STRATEGY_WEIGHTS, type BotStrategyWeights } from "./botProfiles";

export function scoreTerritoryExpansion(
    player: PlayerId,
    candidateCells: readonly Position[],
    ownedCells: readonly Position[],
    startingPosition: Position,
    enemyStartingPosition: Position,
): number {
    return createTerritoryExpansionScorer(
        player,
        ownedCells,
        startingPosition,
        enemyStartingPosition,
    )(candidateCells);
}

export function createTerritoryExpansionScorer(
    player: PlayerId,
    ownedCells: readonly Position[],
    startingPosition: Position,
    enemyStartingPosition: Position,
): (candidateCells: readonly Position[]) => number {
    const ownedKeys = new Set([startingPosition, ...ownedCells].map(positionKey));
    let currentDistance = getGridDistance(startingPosition, enemyStartingPosition);
    let currentFrontier = startingPosition.x;
    for (const cell of ownedCells) {
        currentDistance = Math.min(currentDistance, getGridDistance(cell, enemyStartingPosition));
        currentFrontier =
            player === 1 ? Math.max(currentFrontier, cell.x) : Math.min(currentFrontier, cell.x);
    }

    return (candidateCells) => {
        let nextDistance = Number.POSITIVE_INFINITY;
        let nextFrontier = player === 1 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        let newCells = 0;
        for (const cell of candidateCells) {
            if (ownedKeys.has(positionKey(cell))) continue;
            newCells++;
            nextDistance = Math.min(nextDistance, getGridDistance(cell, enemyStartingPosition));
            nextFrontier =
                player === 1 ? Math.max(nextFrontier, cell.x) : Math.min(nextFrontier, cell.x);
        }
        if (newCells === 0) {
            return 0;
        }

        const objectiveProgress = currentDistance - nextDistance;
        const forwardProgress =
            player === 1 ? nextFrontier - currentFrontier : currentFrontier - nextFrontier;
        return (
            Math.max(0, objectiveProgress) * 55 + Math.max(0, forwardProgress) * 5 + newCells * 3
        );
    };
}

export function scoreDefensivePlacement(
    position: Position,
    ownBase: Position,
    enemyPositions: readonly Position[],
    blockingCells: readonly Position[],
): number {
    return createDefensivePlacementScorer(ownBase, enemyPositions, blockingCells)(position);
}

export function createDefensivePlacementScorer(
    ownBase: Position,
    enemyPositions: readonly Position[],
    blockingCells: readonly Position[],
): (position: Position) => number {
    const visibleEnemies = enemyPositions.filter((enemy) =>
        hasLineOfSight(enemy, ownBase, blockingCells),
    );
    return (position) => {
        const blockers = [...blockingCells, position];
        const protectedSightlines = visibleEnemies.filter(
            (enemy) => !hasLineOfSight(enemy, ownBase, blockers),
        ).length;
        const blockedApproaches = enemyPositions.filter(
            (enemy) =>
                getGridDistance(enemy, ownBase) ===
                getGridDistance(enemy, position) + getGridDistance(position, ownBase),
        ).length;
        const perimeterDistance = Math.abs(getGridDistance(position, ownBase) - 3);

        return protectedSightlines * 100 + blockedApproaches * 10 - perimeterDistance * 2;
    };
}

export function createPathBlockadeScorer(
    boardWidth: number,
    boardHeight: number,
    ownBase: Position,
    enemyBase: Position,
    ownPathCells: readonly Position[],
    blockedCells: readonly Position[],
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): (candidateCells: readonly Position[]) => number {
    const board = {
        id: "route-analysis",
        width: boardWidth,
        height: boardHeight,
        blockedCells: [],
    };
    const fixedBlocks = [...ownPathCells, ...blockedCells];
    const current = analyzePotentialRoutes(board, enemyBase, ownBase, {
        blockedCells: fixedBlocks,
    });
    if (current.shortestDistance === null) return () => 0;

    const index = ({ x, y }: Position) => y * boardWidth + x;
    const relevant = new Uint8Array(boardWidth * boardHeight);
    const critical = new Uint8Array(relevant.length);
    const routeMask = new Uint8Array(relevant.length);
    for (const cell of current.nearOptimalCells) relevant[index(cell)] = 1;
    for (const cell of current.criticalCells) critical[index(cell)] = 1;
    let shortestRoutes = 0;
    current.alternativeRoutes.forEach((route, i) => {
        if (route.cost === current.shortestDistance) shortestRoutes |= 1 << i;
        for (const cell of route.cells) routeMask[index(cell)] |= 1 << i;
    });
    for (const cell of [ownBase, enemyBase, ...fixedBlocks]) {
        if (cell.x >= 0 && cell.x < boardWidth && cell.y >= 0 && cell.y < boardHeight)
            relevant[index(cell)] = 0;
    }

    return (candidateCells) => {
        let hits = 0,
            criticalHits = 0,
            coveredRoutes = 0;
        for (const cell of candidateCells) {
            if (cell.x < 0 || cell.y < 0 || cell.x >= boardWidth || cell.y >= boardHeight) continue;
            const i = index(cell);
            if (!relevant[i]) continue;
            hits++;
            criticalHits += critical[i];
            coveredRoutes |= routeMask[i];
        }
        if (!hits) return 0;
        // An untouched shortest route is a witness that the distance did not change.
        // Otherwise a footprint might cut several parallel lanes without hitting a single critical tile.
        const distanceAfterBlockade =
            (coveredRoutes & shortestRoutes) === shortestRoutes
                ? getShortestRouteDistance(board, enemyBase, ownBase, [
                      ...fixedBlocks,
                      ...candidateCells,
                  ])
                : current.shortestDistance;
        if (distanceAfterBlockade === null) {
            return Math.min(500, 500 * weights.routeDenial);
        }
        const costIncrease = Math.max(0, distanceAfterBlockade - current.shortestDistance);
        const lostRouteArea = hits / Math.max(1, current.nearOptimalCellCount);
        const lostAlternatives =
            current.alternativeRoutes.filter((_, i) => coveredRoutes & (1 << i)).length /
            Math.max(1, current.alternativeRoutes.length);
        const chokepointRatio = criticalHits / Math.max(1, current.criticalCells.length);

        return Math.min(
            500,
            costIncrease * 80 * weights.routeDenial +
                (lostRouteArea + lostAlternatives) * 40 * weights.routeRedundancy +
                chokepointRatio * 40 * weights.chokepointControl,
        );
    };
}
