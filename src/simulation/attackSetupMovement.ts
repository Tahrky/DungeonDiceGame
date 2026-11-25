import type { BoardDefinition } from "../game/boards";
import type { ObjectiveMovement } from "../game/botStrategy";
import { getFacingFromMovement, getGridDistance, isSamePosition } from "../game/geometry";
import { clearCamouflageForMovement, consumeMovementTurnBuff } from "../game/monsterActions";
import type { PlacedMonster, Position } from "../types/GameTypes";
import { getBestAvailableAttackScore } from "./combat";
import { cloneMatchState, type MatchState } from "./matchState";

export function findAttackSetupMovement(
    state: MatchState,
    board: BoardDefinition,
    monster: PlacedMonster,
    paths: ReadonlyMap<string, Position[]>,
    strategicMovement: ObjectiveMovement | null,
    objective: Position,
): ObjectiveMovement | null {
    const currentAttackScore = getBestAvailableAttackScore(state, board, monster.id);
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

        const candidate = cloneMatchState(state);
        const candidateMonster = candidate.monsters.find(({ id }) => id === monster.id);
        if (!candidateMonster) continue;
        candidateMonster.facing = getFacingFromMovement(
            candidateMonster.position,
            destination,
            candidateMonster.facing,
        );
        candidateMonster.position = destination;
        clearCamouflageForMovement(candidateMonster, path);
        consumeMovementTurnBuff(candidateMonster);

        const score = getBestAvailableAttackScore(candidate, board, monster.id);
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
