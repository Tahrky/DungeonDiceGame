import type { Position } from "../types/GameTypes";
import { getGridDistance, positionKey } from "./geometry";
import { getMovementDistanceMap, getMovementPathMap, type MovementOptions } from "./monsterActions";
import {
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotStrategyWeights,
    type BotTactic,
} from "./botProfiles";

export interface ObjectiveMovement {
    position: Position;
    path: Position[];
    routeProgress: number;
}

const nearest = (position: Position, others: readonly Position[]) =>
    others.length ? Math.min(...others.map((other) => getGridDistance(position, other))) : 0;

// Cache only for this decision: another monster moving can change both routes and landing squares.
export function createObjectivePlanner(
    options: MovementOptions,
    enemyPositions: readonly Position[],
    tactic: BotTactic,
    threatScores: ReadonlyMap<string, number>,
    weights: Readonly<BotStrategyWeights>,
) {
    const paths = getMovementPathMap(options);
    // A range-one unit cannot cross an occupied square without ending its action there.
    const traversal =
        options.range === 1
            ? {
                  ...options,
                  canPassUndeployedCells: false,
                  blockedCells: [...options.blockedCells, ...options.occupiedCells],
              }
            : options;
    const reachable = getMovementDistanceMap([options.source], traversal);
    const occupied = new Set(options.occupiedCells.map(positionKey));
    const landings = options.deployedCells.filter(
        (cell) => reachable.has(positionKey(cell)) && !occupied.has(positionKey(cell)),
    );
    const hostile = new Set(enemyPositions.map(positionKey));
    const allies =
        tactic === "defense"
            ? options.occupiedCells.filter((cell) => !hostile.has(positionKey(cell)))
            : [];
    const sourceKey = positionKey(options.source);
    const chase = tactic === "hunt" || tactic === "defense";

    function toward(objective: Position): ObjectiveMovement | null {
        if (!paths.size) return null;
        // Bases and enemy-occupied squares are not legal destinations. Aim for the closest
        // reachable landing(s), not every friendly tile (which makes dead ends look like goals).
        let bestDistance = Infinity;
        let bestEnemyDistance = Infinity;
        const goals: Position[] = [];
        for (const cell of landings) {
            const distance = getGridDistance(cell, objective);
            if (distance > bestDistance) continue;
            const enemyDistance = chase ? nearest(cell, enemyPositions) : 0;
            if (distance === bestDistance && enemyDistance > bestEnemyDistance) continue;
            if (distance < bestDistance || enemyDistance < bestEnemyDistance) goals.length = 0;
            bestDistance = distance;
            bestEnemyDistance = enemyDistance;
            goals.push(cell);
        }
        if (!goals.length || goals.some((cell) => positionKey(cell) === sourceKey)) return null;
        const distances = getMovementDistanceMap(goals, traversal);
        const current = distances.get(sourceKey);
        if (current === undefined) return null;
        let best: ObjectiveMovement | null = null;
        let bestScore = -Infinity;
        const currentEnemy = nearest(options.source, enemyPositions);
        const currentAlly = nearest(options.source, allies);
        for (const [destinationKey, path] of paths) {
            const position = path[path.length - 1]!;
            const routeProgress = current - (distances.get(destinationKey) ?? Infinity);
            if (routeProgress <= 0) continue;
            const progress =
                getGridDistance(options.source, objective) - getGridDistance(position, objective);
            const score =
                routeProgress * 100 * weights.movementRoute +
                progress * 10 * weights.movementObjective +
                (chase
                    ? (currentEnemy - nearest(position, enemyPositions)) *
                      (tactic === "hunt" ? 6 * weights.movementHunt : 2 * weights.interception)
                    : 0) +
                (currentAlly - nearest(position, allies)) * 4 * weights.formationCohesion -
                (threatScores.get(destinationKey) ?? 0) * 20 * weights.movementThreat;
            if (score > bestScore) {
                bestScore = score;
                best = { position, path, routeProgress };
            }
        }
        return best;
    }
    return { paths, toward };
}

export function findObjectiveMovement(
    options: MovementOptions,
    objective: Position,
    enemyPositions: readonly Position[] = [],
    tactic: BotTactic = "balanced",
    threatScores: ReadonlyMap<string, number> = new Map(),
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): ObjectiveMovement | null {
    return createObjectivePlanner(options, enemyPositions, tactic, threatScores, weights).toward(
        objective,
    );
}
