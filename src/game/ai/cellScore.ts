import { getStartingPositions } from "../boards";
import { getGridDistance, hasLineOfSight, positionKey } from "../geometry";
import { opposingPlayer } from "../matchRules";
import type { PlayerId, Position } from "../../types/GameTypes";
import { getStrategicBoard, livingMonsters } from "./common";
import { analyzeDefensiveRoutes } from "./routeCoverage";
import type { StrategicSnapshot } from "./types";

export function createStrategicCellScorer(
    snapshot: StrategicSnapshot,
    player: PlayerId,
): (position: Position) => number {
    const starts = getStartingPositions(snapshot.board);
    const routeBoard = getStrategicBoard(snapshot, starts);
    const ownStart = starts[player];
    const enemyStart = starts[opposingPlayer(player)];
    const tactic = snapshot.tactics[player];
    const enemies = livingMonsters(snapshot, opposingPlayer(player));
    const enemyPositions = enemies.map((monster) => monster.position);
    const approachCoverage =
        tactic === "defense"
            ? analyzeDefensiveRoutes(routeBoard, ownStart, enemies).coverage
            : null;
    const blockers = [
        ...routeBoard.blockedCells,
        ...snapshot.monsters
            .filter((monster) => monster.currentHp > 0)
            .map((monster) => monster.position),
    ];
    const visibleThreat = enemyPositions.filter((enemy) =>
        hasLineOfSight(enemy, ownStart, blockers),
    ).length;
    const centerX = (snapshot.board.width - 1) / 2;
    const centerY = (snapshot.board.height - 1) / 2;
    const scores = new Map<string, number>();

    const adjustForTactic = (
        score: number,
        position: Position,
        ownDistance: number,
        enemyDistance: number,
    ): number => {
        switch (tactic) {
            case "defense":
                return (
                    score -
                    Math.abs(ownDistance - 3) * 4 +
                    (approachCoverage?.get(positionKey(position)) ?? 0) * 3
                );
            case "offense":
                return score + (snapshot.board.width - enemyDistance) * 3;
            case "hunt": {
                let nearestEnemy = snapshot.board.width;
                for (const enemy of enemyPositions) {
                    nearestEnemy = Math.min(nearestEnemy, getGridDistance(position, enemy));
                }
                return score - nearestEnemy * 2;
            }
            default:
                return score;
        }
    };

    return (position) => {
        const key = positionKey(position);
        const cached = scores.get(key);
        if (cached !== undefined) return cached;

        const ownDistance = getGridDistance(position, ownStart);
        const enemyDistance = getGridDistance(position, enemyStart);
        const centrality = -Math.abs(position.x - centerX) - Math.abs(position.y - centerY);
        const baseScore = enemyDistance * 2 - ownDistance + centrality * 0.25 - visibleThreat * 3;
        const score = adjustForTactic(baseScore, position, ownDistance, enemyDistance);

        scores.set(key, score);
        return score;
    };
}
