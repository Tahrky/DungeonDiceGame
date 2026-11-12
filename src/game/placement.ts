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
    const columns = Array.from({ length: options.boardWidth }, (_, index) => index).sort(
        (first, second) => Math.abs(first - options.start.x) - Math.abs(second - options.start.x),
    );
    const rows = Array.from({ length: options.boardHeight }, (_, index) => index).sort(
        (first, second) => Math.abs(first - options.start.y) - Math.abs(second - options.start.y),
    );

    let bestPlacement: ScoredPlacement | null = null;
    for (const pattern of options.patterns) {
        const placement = findBestPatternPlacement(pattern, options, columns, rows);
        if (placement && (!bestPlacement || placement.score > bestPlacement.score)) {
            bestPlacement = placement;
        }
    }

    return bestPlacement
        ? { position: bestPlacement.position, cells: bestPlacement.cells }
        : null;
}

function findBestPatternPlacement(
    pattern: readonly Position[],
    options: PlacementSearchOptions,
    columns: readonly number[],
    rows: readonly number[],
): ScoredPlacement | null {
    let bestPlacement: ScoredPlacement | null = null;
    const transformations = [0, 1, 2, 3].flatMap((rotation) =>
        [false, true].map((mirrored) => ({ rotation, mirrored })),
    );

    for (const { rotation, mirrored } of transformations) {
        for (const y of rows) {
            for (const x of columns) {
                const placement = scorePatternPlacement(
                    pattern,
                    options,
                    { x, y },
                    rotation,
                    mirrored,
                );
                if (!placement) continue;
                if (bestPlacement && placement.score <= bestPlacement.score) continue;
                bestPlacement = placement;
            }
        }
    }

    return bestPlacement;
}

function scorePatternPlacement(
    pattern: readonly Position[],
    options: PlacementSearchOptions,
    origin: Position,
    rotation: number,
    mirrored: boolean,
): ScoredPlacement | null {
    const cells = getPatternCells(pattern, origin, rotation, mirrored);
    if (
        !canPlaceCells(
            cells,
            options.boardWidth,
            options.occupiedCells,
            options.connectedCells,
            options.overlappingCells,
            options.boardHeight,
            options.blockedCells,
        )
    ) {
        return null;
    }

    const isPlacementAllowed = options.isPlacementAllowed ?? (() => true);
    const position = cells.find((cell) => isPlacementAllowed(cell, cells));
    if (!position) return null;

    const scorePlacement = options.scorePlacement ?? (() => 0);
    return { position, cells, score: scorePlacement(position, cells) };
}
