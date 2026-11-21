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
    blockedIndices: ReadonlySet<number>;
    occupiedIndices: ReadonlySet<number>;
    overlappingIndices: ReadonlySet<number>;
    connectedIndices: ReadonlySet<number>;
    connectedOutsideKeys: ReadonlySet<string>;
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
    return searchPlacement(options, false);
}

export function hasValidPlacement(options: Omit<PlacementSearchOptions, "scorePlacement">): boolean {
    return searchPlacement({ ...options, scorePlacement: scoreNothing }, true) !== null;
}

export function findValidPlacements(
    options: Omit<PlacementSearchOptions, "scorePlacement">,
): Array<{ position: Position; cells: Position[] }> {
    const columns = getNearestFirstIndices(options.boardWidth, options.start.x);
    const rows = getNearestFirstIndices(options.boardHeight, options.start.y);
    const context = createPlacementValidationContext({
        ...options,
        scorePlacement: scoreNothing,
    });
    const placements = new Map<string, { position: Position; cells: Position[] }>();

    for (const patterns of options.patterns.map(getTransformedPatterns)) {
        for (const pattern of patterns) {
            for (const y of rows) {
                for (const x of columns) {
                    const placement = scoreTransformedPatternPlacement(
                        pattern,
                        { ...options, scorePlacement: scoreNothing },
                        context,
                        x,
                        y,
                        true,
                    );
                    if (!placement) continue;
                    const key = placement.cells
                        .map(getPositionKey)
                        .sort()
                        .join(";");
                    placements.set(key, {
                        position: placement.position,
                        cells: placement.cells,
                    });
                }
            }
        }
    }

    return [...placements.values()];
}

export function createInitialDeploymentProtection(
    options: Omit<PlacementSearchOptions, "scorePlacement">,
): ((candidateCells: readonly Position[]) => boolean) | null {
    const placements = findValidPlacements(options);
    if (placements.length === 0) return null;

    const placementsByCell = new Map<string, number[]>();
    placements.forEach(({ cells }, placementIndex) => {
        for (const cell of cells) {
            const key = getPositionKey(cell);
            const overlapping = placementsByCell.get(key) ?? [];
            overlapping.push(placementIndex);
            placementsByCell.set(key, overlapping);
        }
    });

    return (candidateCells) => {
        const blockedPlacements = new Set<number>();
        for (const cell of candidateCells) {
            for (const placementIndex of placementsByCell.get(getPositionKey(cell)) ?? []) {
                blockedPlacements.add(placementIndex);
            }
        }
        return blockedPlacements.size < placements.length;
    };
}

function searchPlacement(
    options: PlacementSearchOptions,
    firstValid: boolean,
): { position: Position; cells: Position[] } | null {
    const columns = getNearestFirstIndices(options.boardWidth, options.start.x);
    const rows = getNearestFirstIndices(options.boardHeight, options.start.y);
    const context = createPlacementValidationContext(options);
    const transformedPatterns = options.patterns.map(getTransformedPatterns);

    let bestPlacement: ScoredPlacement | null = null;
    for (const transformedPattern of transformedPatterns) {
        const placement = findBestPatternPlacement(
            transformedPattern,
            options,
            context,
            columns,
            rows,
            firstValid,
        );
        if (placement && firstValid) return { position: placement.position, cells: placement.cells };
        if (placement && (!bestPlacement || placement.score > bestPlacement.score)) {
            bestPlacement = placement;
        }
    }

    return bestPlacement
        ? { position: bestPlacement.position, cells: bestPlacement.cells }
        : null;
}

function createPlacementValidationContext(
    options: PlacementSearchOptions,
): PlacementValidationContext {
    return {
        blockedIndices: getBoardIndices(
            options.blockedCells ?? [],
            options.boardWidth,
            options.boardHeight,
        ),
        occupiedIndices: getBoardIndices(
            options.occupiedCells,
            options.boardWidth,
            options.boardHeight,
        ),
        overlappingIndices: getBoardIndices(
            options.overlappingCells ?? [],
            options.boardWidth,
            options.boardHeight,
        ),
        connectedIndices: getBoardIndices(
            options.connectedCells,
            options.boardWidth,
            options.boardHeight,
        ),
        connectedOutsideKeys: new Set(
            options.connectedCells
                .filter(
                    ({ x, y }) =>
                        getBoardIndex(x, y, options.boardWidth, options.boardHeight) ===
                        undefined,
                )
                .map(getPositionKey),
        ),
        isPlacementAllowed: options.isPlacementAllowed ?? allowAnyPlacement,
        scorePlacement: options.scorePlacement ?? scoreNothing,
    };
}

function findBestPatternPlacement(
    transformedPatterns: readonly Position[][],
    options: PlacementSearchOptions,
    context: PlacementValidationContext,
    columns: readonly number[],
    rows: readonly number[],
    firstValid: boolean,
): ScoredPlacement | null {
    let bestPlacement: ScoredPlacement | null = null;
    for (const pattern of transformedPatterns) {
        for (const y of rows) {
            for (const x of columns) {
                const placement = scoreTransformedPatternPlacement(
                    pattern,
                    options,
                    context,
                    x,
                    y,
                    firstValid,
                );
                if (!placement) continue;
                if (firstValid) return placement;
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
    originX: number,
    originY: number,
    firstValid: boolean,
): ScoredPlacement | null {
    if (transformedPattern.length !== 6 || !hasUniqueCells(transformedPattern)) return null;

    let hasConnection = false;
    for (const offset of transformedPattern) {
        const x = originX + offset.x;
        const y = originY + offset.y;
        if (x < 0 || y < 0 || x >= options.boardWidth || y >= options.boardHeight) return null;

        const index = y * options.boardWidth + x;
        if (
            context.blockedIndices.has(index) ||
            (context.occupiedIndices.has(index) && !context.overlappingIndices.has(index))
        ) {
            return null;
        }

        if (
            (x + 1 < options.boardWidth && context.connectedIndices.has(index + 1)) ||
            (x > 0 && context.connectedIndices.has(index - 1)) ||
            (y + 1 < options.boardHeight &&
                context.connectedIndices.has(index + options.boardWidth)) ||
            (y > 0 && context.connectedIndices.has(index - options.boardWidth)) ||
            (x + 1 === options.boardWidth && context.connectedOutsideKeys.has(`${x + 1},${y}`)) ||
            (x === 0 && context.connectedOutsideKeys.has(`${x - 1},${y}`)) ||
            (y + 1 === options.boardHeight &&
                context.connectedOutsideKeys.has(`${x},${y + 1}`)) ||
            (y === 0 && context.connectedOutsideKeys.has(`${x},${y - 1}`))
        ) {
            hasConnection = true;
        }
    }
    if (!hasConnection) return null;

    const cells = transformedPattern.map((cell) => ({
        x: originX + cell.x,
        y: originY + cell.y,
    }));
    let position: Position | undefined;
    for (const cell of cells) {
        if (!context.isPlacementAllowed(cell, cells)) continue;
        position = cell;
        break;
    }
    if (!position) return null;

    return { position, cells, score: firstValid ? 0 : context.scorePlacement(position, cells) };
}
