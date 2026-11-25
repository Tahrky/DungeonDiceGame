import type { BoardDefinition } from "../boards";
import { isInsideBoard } from "../boards";
import { getGridDistance, getOrthogonalNeighbors, positionKey } from "../geometry";
import type { PlacedMonster, Position } from "../../types/GameTypes";
import { pickBest, toKeySet } from "./common";

const DEFENSE_RING_DISTANCE = 3;
const CLAIMED_TARGET_PENALTY = 25;

type PositionComparator = (first: Position, second: Position) => number;

function compareDistance(first: Position, second: Position, origin: Position): number {
    return getGridDistance(first, origin) - getGridDistance(second, origin);
}

function compareReadingOrder(first: Position, second: Position): number {
    return first.y - second.y || first.x - second.x;
}

function byDistanceFrom(origin: Position): PositionComparator {
    return (first, second) =>
        compareDistance(first, second, origin) || compareReadingOrder(first, second);
}

function getUnblocked(board: BoardDefinition, cells: readonly Position[]): Position[] {
    const blocked = toKeySet(board.blockedCells);
    return cells.filter((cell) => !blocked.has(positionKey(cell)));
}

export function getDefensiveTarget(
    board: BoardDefinition,
    monster: PlacedMonster,
    ownBase: Position,
    routeCoverage: ReadonlyMap<string, number>,
    claimedTargets: ReadonlySet<string>,
): Position {
    const ring: Position[] = [];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            const position = { x, y };
            if (getGridDistance(position, ownBase) === DEFENSE_RING_DISTANCE) ring.push(position);
        }
    }
    const candidates = getUnblocked(board, ring);
    const unclaimed = candidates.filter((cell) => !claimedTargets.has(positionKey(cell)));
    const scored = (unclaimed.length > 0 ? unclaimed : candidates).map((position) => ({
        position,
        score:
            (routeCoverage.get(positionKey(position)) ?? 0) * 100 -
            getGridDistance(monster.position, position) * 2 -
            (claimedTargets.has(positionKey(position)) ? CLAIMED_TARGET_PENALTY : 0),
    }));
    const best = pickBest(
        scored,
        (first, second) =>
            second.score - first.score || compareReadingOrder(first.position, second.position),
    );
    return best?.position ?? ownBase;
}

export function getAdvanceTarget(
    board: BoardDefinition,
    monster: PlacedMonster,
    enemyBase: Position,
    claimedTargets: ReadonlySet<string>,
): Position {
    const horizontal =
        Math.abs(enemyBase.x - monster.position.x) >= Math.abs(enemyBase.y - monster.position.y);
    const line = horizontal
        ? Array.from({ length: board.height }, (_, y) => ({ x: enemyBase.x, y }))
        : Array.from({ length: board.width }, (_, x) => ({ x, y: enemyBase.y }));
    const candidates = getUnblocked(board, line);
    const unclaimed = candidates.filter((cell) => !claimedTargets.has(positionKey(cell)));
    return (
        pickBest(
            unclaimed,
            (first, second) =>
                compareDistance(first, second, monster.position) ||
                compareDistance(first, second, enemyBase) ||
                compareReadingOrder(first, second),
        ) ??
        pickBest(candidates, byDistanceFrom(monster.position)) ??
        enemyBase
    );
}

export function getPatrolTarget(
    board: BoardDefinition,
    monster: PlacedMonster,
    ownBase: Position,
    enemyBase: Position,
    claimedTargets: ReadonlySet<string>,
): Position {
    const midX = Math.round((ownBase.x + enemyBase.x) / 2);
    const midY = Math.round((ownBase.y + enemyBase.y) / 2);
    const crossing = [
        ...Array.from({ length: board.height }, (_, y) => ({ x: midX, y })),
        ...Array.from({ length: board.width }, (_, x) => ({ x, y: midY })),
    ];
    const candidates = getUnblocked(board, crossing).filter(
        (cell) => !claimedTargets.has(positionKey(cell)),
    );
    return (
        pickBest(candidates, byDistanceFrom(monster.position)) ??
        getAdvanceTarget(board, monster, enemyBase, claimedTargets)
    );
}

export function getInterceptTarget(
    board: BoardDefinition,
    monster: PlacedMonster,
    enemies: readonly PlacedMonster[],
    allies: readonly PlacedMonster[],
    claimedTargets: ReadonlySet<string>,
): Position | undefined {
    const occupied = toKeySet([
        ...board.blockedCells,
        ...enemies.map(({ position }) => position),
        ...allies.map(({ position }) => position),
    ]);
    const candidates = enemies
        .flatMap((enemy) => getOrthogonalNeighbors(enemy.position))
        .filter(
            (cell) =>
                isInsideBoard(board, cell) &&
                !occupied.has(positionKey(cell)) &&
                !claimedTargets.has(positionKey(cell)),
        );
    return pickBest(candidates, byDistanceFrom(monster.position));
}
