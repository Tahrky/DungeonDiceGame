import type { Position } from "../types/GameTypes";
import type { ObjectiveMovement } from "./botMovement";
import { getGridDistance, isSamePosition } from "./geometry";

export function selectAttackSetupMovement(
    paths: ReadonlyMap<string, Position[]>,
    strategicMovement: ObjectiveMovement | null,
    objective: Position,
    currentAttackScore: number,
    scorePath: (path: Position[]) => number,
): ObjectiveMovement | null {
    let bestScore = currentAttackScore;
    let bestMovement: ObjectiveMovement | null = null;
    const isStrategicDestination = (position: Position): boolean =>
        !!strategicMovement && isSamePosition(strategicMovement.position, position);
    const compareMovement = (first: Position, second: Position): number =>
        Number(isStrategicDestination(second)) - Number(isStrategicDestination(first)) ||
        getGridDistance(first, objective) - getGridDistance(second, objective) ||
        first.y - second.y ||
        first.x - second.x;

    for (const path of paths.values()) {
        const destination = path[path.length - 1];
        if (!destination) continue;
        const score = scorePath(path);
        if (
            score <= currentAttackScore ||
            score < bestScore ||
            (score === bestScore &&
                bestMovement !== null &&
                compareMovement(destination, bestMovement.position) >= 0)
        ) {
            continue;
        }
        bestScore = score;
        bestMovement = { position: destination, path, routeProgress: 0 };
    }
    return bestMovement;
}
