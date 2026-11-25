import type { Position } from "../types/GameTypes";
import { positionKey } from "./geometry";

const transformedPatternCache = new WeakMap<readonly Position[], readonly Position[][]>();
const uniquePatternCache = new WeakMap<readonly Position[], boolean>();

export function getPatternCells(
    pattern: readonly Position[],
    origin: Position,
    rotation = 0,
    mirrored = false,
): Position[] {
    const quarterTurns = ((rotation % 4) + 4) % 4;
    const rotated = pattern.map((offset) => {
        let x = offset.x;
        let y = mirrored ? -offset.y : offset.y;

        for (let turn = 0; turn < quarterTurns; turn++) {
            const nextX = -y;
            y = x;
            x = nextX;
        }

        return { x, y };
    });
    const minX = Math.min(...rotated.map((cell) => cell.x));
    const minY = Math.min(...rotated.map((cell) => cell.y));

    return rotated.map((cell) => ({
        x: origin.x + cell.x - minX,
        y: origin.y + cell.y - minY,
    }));
}

export function getTransformedPatterns(pattern: readonly Position[]): readonly Position[][] {
    const cached = transformedPatternCache.get(pattern);
    if (cached) return cached;

    const transformed: Position[][] = [];
    const seen = new Set<string>();
    for (let rotation = 0; rotation < 4; rotation++) {
        for (const mirrored of [false, true]) {
            const cells = getPatternCells(pattern, { x: 0, y: 0 }, rotation, mirrored);
            const key = cells.map(positionKey).sort().join(";");
            if (seen.has(key)) continue;
            seen.add(key);
            transformed.push(cells);
        }
    }
    transformedPatternCache.set(pattern, transformed);
    return transformed;
}

export function hasUniqueCells(pattern: readonly Position[]): boolean {
    const cached = uniquePatternCache.get(pattern);
    if (cached !== undefined) return cached;

    const unique = new Set(pattern.map(positionKey)).size === pattern.length;
    uniquePatternCache.set(pattern, unique);
    return unique;
}
