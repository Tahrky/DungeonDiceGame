import type { BoardDefinition } from "../boards";
import { getStartingPositions } from "../boards";
import { positionKey } from "../geometry";
import type { PlacedMonster, PlayerId, Position } from "../../types/GameTypes";
import type { StrategicSnapshot } from "./types";

export function livingMonsters(snapshot: StrategicSnapshot, player: PlayerId): PlacedMonster[] {
    return snapshot.monsters.filter((monster) => monster.owner === player && monster.currentHp > 0);
}

export function getStrategicBoard(
    snapshot: StrategicSnapshot,
    starts: Record<PlayerId, Position> = getStartingPositions(snapshot.board),
): BoardDefinition {
    return {
        ...snapshot.board,
        blockedCells: [
            ...snapshot.board.blockedCells,
            ...Object.values(starts),
            ...(snapshot.blockedCells ?? []),
        ],
    };
}

export function toKeySet(positions: readonly Position[]): Set<string> {
    return new Set(positions.map(positionKey));
}

export function pickBest<T>(items: readonly T[], compare: (a: T, b: T) => number): T | undefined {
    let best: T | undefined;
    for (const item of items) {
        if (best === undefined || compare(item, best) < 0) best = item;
    }
    return best;
}
