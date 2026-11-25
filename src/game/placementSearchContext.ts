import type { Position } from "../types/GameTypes";

export interface PlacementSearchOptions {
    readonly patterns: readonly (readonly Position[])[];
    readonly boardWidth: number;
    readonly boardHeight: number;
    readonly start: Position;
    readonly occupiedCells: readonly Position[];
    readonly connectedCells: readonly Position[];
    readonly overlappingCells?: readonly Position[];
    readonly blockedCells?: readonly Position[];
    readonly isPlacementAllowed?: (position: Position, cells: readonly Position[]) => boolean;
    readonly isFootprintAllowed?: (cells: readonly Position[]) => boolean;
    readonly scoreSpawn?: (position: Position, cells: readonly Position[]) => number;
    readonly scorePlacement?: (position: Position, cells: readonly Position[]) => number;
}

export interface PlacementSearchContext {
    readonly columns: readonly number[];
    readonly rows: readonly number[];
    readonly forbidden: Uint8Array;
    readonly adjacent: Uint8Array;
    readonly isPlacementAllowed: NonNullable<PlacementSearchOptions["isPlacementAllowed"]>;
    readonly scorePlacement: NonNullable<PlacementSearchOptions["scorePlacement"]>;
}

const NEIGHBOR_OFFSETS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
] as const;
const axisOrderCache = new Map<string, number[]>();
const allowAnyPlacement: NonNullable<PlacementSearchOptions["isPlacementAllowed"]> = () => true;
const scoreNothing: NonNullable<PlacementSearchOptions["scorePlacement"]> = () => 0;

function getBoardIndex(
    x: number,
    y: number,
    boardWidth: number,
    boardHeight: number,
): number | undefined {
    if (x < 0 || y < 0 || x >= boardWidth || y >= boardHeight) return undefined;
    return y * boardWidth + x;
}

function getBoardIndices(
    cells: readonly Position[],
    boardWidth: number,
    boardHeight: number,
): Set<number> {
    const indices = new Set<number>();
    for (const { x, y } of cells) {
        const index = getBoardIndex(x, y, boardWidth, boardHeight);
        if (index !== undefined) indices.add(index);
    }
    return indices;
}

function getNearestFirstIndices(length: number, origin: number): number[] {
    const key = `${length}:${origin}`;
    const cached = axisOrderCache.get(key);
    if (cached) return cached;

    const indices = Array.from({ length }, (_, index) => index).sort(
        (first, second) => Math.abs(first - origin) - Math.abs(second - origin),
    );
    axisOrderCache.set(key, indices);
    return indices;
}

function getSearchAxes(options: PlacementSearchOptions) {
    // Every valid motif contains a neighbour of the connected territory. Restrict origins
    // without changing their traversal order (including reflected and rotated motifs).
    let span = 0;
    for (const pattern of options.patterns) {
        if (pattern.length !== 6) continue;
        const xs = pattern.map((cell) => cell.x),
            ys = pattern.map((cell) => cell.y);
        span = Math.max(span, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }
    const xs = options.connectedCells.map((cell) => cell.x),
        ys = options.connectedCells.map((cell) => cell.y);
    const filterAxis = (size: number, start: number, connected: number[]) => {
        const min = Math.min(...connected) - 1 - span,
            max = Math.max(...connected) + 1;
        return getNearestFirstIndices(size, start).filter((i) => i >= min && i <= max);
    };
    return {
        columns: filterAxis(options.boardWidth, options.start.x, xs),
        rows: filterAxis(options.boardHeight, options.start.y, ys),
    };
}

export function createPlacementSearchContext(
    options: PlacementSearchOptions,
): PlacementSearchContext {
    const { boardWidth: width, boardHeight: height } = options;
    const forbidden = new Uint8Array(width * height);
    const adjacent = new Uint8Array(width * height);
    const overlaps = getBoardIndices(options.overlappingCells ?? [], width, height);
    for (const index of getBoardIndices(options.occupiedCells, width, height)) {
        if (!overlaps.has(index)) forbidden[index] = 1;
    }
    for (const index of getBoardIndices(options.blockedCells ?? [], width, height)) {
        forbidden[index] = 1;
    }
    for (const { x, y } of options.connectedCells) {
        for (const [dx, dy] of NEIGHBOR_OFFSETS) {
            const index = getBoardIndex(x + dx, y + dy, width, height);
            if (index !== undefined) adjacent[index] = 1;
        }
    }
    return {
        ...getSearchAxes(options),
        forbidden,
        adjacent,
        isPlacementAllowed: options.isPlacementAllowed ?? allowAnyPlacement,
        scorePlacement: options.scorePlacement ?? scoreNothing,
    };
}
