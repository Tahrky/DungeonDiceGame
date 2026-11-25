import type { BoardDefinition } from "../boards";
import { getGridDistance, positionKey } from "../geometry";
import { analyzePotentialRoutes } from "../routeAnalysis";
import type { PlacedMonster, Position } from "../../types/GameTypes";

const BASE_THREAT_DISTANCE = 5;
const COVERAGE_RADIUS = 3;

export interface DefensiveRoutes {
    coverage: ReadonlyMap<string, number>;
    baseThreatened: boolean;
}

export function analyzeDefensiveRoutes(
    board: BoardDefinition,
    ownBase: Position,
    enemies: readonly PlacedMonster[],
): DefensiveRoutes {
    const coverage = new Map<string, number>();
    let baseThreatened = false;
    for (const enemy of enemies) {
        const routes = analyzePotentialRoutes(board, enemy.position, ownBase);
        const urgency = 1 / Math.max(1, routes.shortestDistance ?? board.width);
        for (const cell of routes.nearOptimalCells) {
            const key = positionKey(cell);
            coverage.set(key, (coverage.get(key) ?? 0) + urgency);
        }
        baseThreatened ||=
            (routes.shortestDistance ?? Number.POSITIVE_INFINITY) <= BASE_THREAT_DISTANCE;
    }
    return { coverage, baseThreatened };
}

function distanceToNearest(position: Position, cells: readonly Position[]): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const cell of cells) nearest = Math.min(nearest, getGridDistance(position, cell));
    return nearest;
}

export function getRouteCoverage(
    threats: readonly PlacedMonster[],
    defenders: readonly PlacedMonster[],
    protectedBase: Position,
    board: BoardDefinition,
): number {
    let coverage = 0;
    for (const threat of threats) {
        const routes = analyzePotentialRoutes(board, threat.position, protectedBase);
        for (const defender of defenders) {
            const distance = distanceToNearest(defender.position, routes.nearOptimalCells);
            if (distance <= COVERAGE_RADIUS) {
                coverage += (4 - distance) / Math.max(1, routes.shortestDistance ?? 1);
            }
        }
    }
    return coverage;
}
