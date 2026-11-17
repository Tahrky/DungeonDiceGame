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
    readonly scorePlacement?: (position: Position, cells: readonly Position[]) => number;
}

interface ScoredPlacement {
    position: Position;
    cells: Position[];
    score: number;
}

interface PlacementValidationContext {
    blockedKeys: ReadonlySet<string>;
    occupiedKeys: ReadonlySet<string>;
    overlappingKeys: ReadonlySet<string>;
    connectedKeys: ReadonlySet<string>;
    isPlacementAllowed: NonNullable<PlacementSearchOptions["isPlacementAllowed"]>;
    scorePlacement: NonNullable<PlacementSearchOptions["scorePlacement"]>;
}

const transformedPatternCache = new WeakMap<
    readonly Position[],
    readonly Position[][]
>();
const uniquePatternCache = new WeakMap<readonly Position[], boolean>();
const axisOrderCache = new Map<string, number[]>();
const allowAnyPlacement: NonNullable<PlacementSearchOptions["isPlacementAllowed"]> = () => true;
const scoreNothing: NonNullable<PlacementSearchOptions["scorePlacement"]> = () => 0;

function getPositionKey({ x, y }: Position): string {
    return `${x},${y}`;
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

function getTransformedPatterns(pattern: readonly Position[]): readonly Position[][] {
    const cached = transformedPatternCache.get(pattern);
    if (cached) return cached;

    const transformed = [0, 1, 2, 3].flatMap((rotation) =>
        [false, true].map((mirrored) =>
            getPatternCells(pattern, { x: 0, y: 0 }, rotation, mirrored),
        ),
    );
    transformedPatternCache.set(pattern, transformed);
    return transformed;
}

function hasUniqueCells(pattern: readonly Position[]): boolean {
    const cached = uniquePatternCache.get(pattern);
    if (cached !== undefined) return cached;

    const keys = new Set(pattern.map(getPositionKey));
    const unique = keys.size === pattern.length;
    uniquePatternCache.set(pattern, unique);
    return unique;
}

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

export function canPlaceCells(
    cells: readonly Position[],
    boardWidth: number,
    occupiedCells: readonly Position[],
    connectedCells: readonly Position[],
    overlappingCells: readonly Position[] = [],
    boardHeight = boardWidth,
    blockedCells: readonly Position[] = [],
): boolean {
    if (cells.length !== 6) return false;

    const cellKeys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
    if (cellKeys.size !== 6) return false;

    const insideBoard = cells.every(
        (cell) =>
            cell.x >= 0 &&
            cell.y >= 0 &&
            cell.x < boardWidth &&
            cell.y < boardHeight &&
            !blockedCells.some((blocked) => blocked.x === cell.x && blocked.y === cell.y),
    );
    if (!insideBoard) return false;

    const hasCollision = cells.some(
        (cell) =>
            occupiedCells.some((occupied) => occupied.x === cell.x && occupied.y === cell.y) &&
            !overlappingCells.some((overlap) => overlap.x === cell.x && overlap.y === cell.y),
    );
    if (hasCollision) return false;

    return cells.some((cell) =>
        connectedCells.some(
            (owned) => Math.abs(cell.x - owned.x) + Math.abs(cell.y - owned.y) === 1,
        ),
    );
}

export function findValidPlacement(
    options: PlacementSearchOptions,
): { position: Position; cells: Position[] } | null {
    const columns = getNearestFirstIndices(options.boardWidth, options.start.x);
    const rows = getNearestFirstIndices(options.boardHeight, options.start.y);
    const context: PlacementValidationContext = {
        blockedKeys: new Set((options.blockedCells ?? []).map(getPositionKey)),
        occupiedKeys: new Set(options.occupiedCells.map(getPositionKey)),
        overlappingKeys: new Set((options.overlappingCells ?? []).map(getPositionKey)),
        connectedKeys: new Set(options.connectedCells.map(getPositionKey)),
        isPlacementAllowed: options.isPlacementAllowed ?? allowAnyPlacement,
        scorePlacement: options.scorePlacement ?? scoreNothing,
    };
    const transformedPatterns = options.patterns.map(getTransformedPatterns);

    let bestPlacement: ScoredPlacement | null = null;
    for (const transformedPattern of transformedPatterns) {
        const placement = findBestPatternPlacement(
            transformedPattern,
            options,
            context,
            columns,
            rows,
        );
        if (placement && (!bestPlacement || placement.score > bestPlacement.score)) {
            bestPlacement = placement;
        }
    }

    return bestPlacement
        ? { position: bestPlacement.position, cells: bestPlacement.cells }
        : null;
}

function findBestPatternPlacement(
    transformedPatterns: readonly Position[][],
    options: PlacementSearchOptions,
    context: PlacementValidationContext,
    columns: readonly number[],
    rows: readonly number[],
): ScoredPlacement | null {
    let bestPlacement: ScoredPlacement | null = null;
    for (const pattern of transformedPatterns) {
        for (const y of rows) {
            for (const x of columns) {
                const placement = scoreTransformedPatternPlacement(
                    pattern,
                    options,
                    context,
                    { x, y },
                );
                if (!placement) continue;
                if (bestPlacement && placement.score <= bestPlacement.score) continue;
                bestPlacement = placement;
            }
        }
    }

    return bestPlacement;
}

function scoreTransformedPatternPlacement(
    transformedPattern: readonly Position[],
    options: PlacementSearchOptions,
    context: PlacementValidationContext,
    origin: Position,
): ScoredPlacement | null {
    if (transformedPattern.length !== 6 || !hasUniqueCells(transformedPattern)) return null;

    let hasConnection = false;
    for (const offset of transformedPattern) {
        const x = origin.x + offset.x;
        const y = origin.y + offset.y;
        const key = `${x},${y}`;
        if (
            x < 0 ||
            y < 0 ||
            x >= options.boardWidth ||
            y >= options.boardHeight ||
            context.blockedKeys.has(key) ||
            (context.occupiedKeys.has(key) && !context.overlappingKeys.has(key))
        ) {
            return null;
        }

        if (
            context.connectedKeys.has(`${x + 1},${y}`) ||
            context.connectedKeys.has(`${x - 1},${y}`) ||
            context.connectedKeys.has(`${x},${y + 1}`) ||
            context.connectedKeys.has(`${x},${y - 1}`)
        ) {
            hasConnection = true;
        }
    }
    if (!hasConnection) return null;

    const cells = transformedPattern.map((cell) => ({
        x: origin.x + cell.x,
        y: origin.y + cell.y,
    }));
    let position: Position | undefined;
    for (const cell of cells) {
        if (!context.isPlacementAllowed(cell, cells)) continue;
        position = cell;
        break;
    }
    if (!position) return null;

    return { position, cells, score: context.scorePlacement(position, cells) };
}
