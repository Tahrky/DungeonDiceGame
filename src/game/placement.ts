import type { Position } from "../types/GameTypes";
import { positionKey } from "./geometry";
import { getTransformedPatterns, hasUniqueCells } from "./patternTransforms";
import {
    createPlacementSearchContext,
    type PlacementSearchContext,
    type PlacementSearchOptions,
} from "./placementSearchContext";

export { getPatternCells } from "./patternTransforms";
export type { PlacementSearchOptions } from "./placementSearchContext";

export interface PatternPlacement {
    position: Position;
    cells: Position[];
}

interface ScoredPlacement extends PatternPlacement {
    score: number;
}

function toPlacement({ position, cells }: ScoredPlacement): PatternPlacement {
    return { position, cells };
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

    const cellKeys = new Set(cells.map(positionKey));
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

export function findValidPlacement(options: PlacementSearchOptions): PatternPlacement | null {
    return searchPlacement(options, false);
}

export function hasValidPlacement(
    options: Omit<PlacementSearchOptions, "scorePlacement">,
): boolean {
    return searchPlacement({ ...options, scoreSpawn: undefined }, true) !== null;
}

export function findValidPlacements(
    options: Omit<PlacementSearchOptions, "scorePlacement">,
): PatternPlacement[] {
    const placements = new Map<string, PatternPlacement>();
    visitPlacements(
        options.patterns.flatMap(getTransformedPatterns),
        options,
        createPlacementSearchContext(options),
        true,
        ({ position, cells }) => {
            placements.set(cells.map(positionKey).sort().join(";"), { position, cells });
            return false;
        },
    );
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
            const key = positionKey(cell);
            const overlapping = placementsByCell.get(key) ?? [];
            overlapping.push(placementIndex);
            placementsByCell.set(key, overlapping);
        }
    });

    return (candidateCells) => {
        const blockedPlacements = new Set<number>();
        for (const cell of candidateCells) {
            for (const placementIndex of placementsByCell.get(positionKey(cell)) ?? []) {
                blockedPlacements.add(placementIndex);
            }
        }
        return blockedPlacements.size < placements.length;
    };
}

function searchPlacement(
    options: PlacementSearchOptions,
    firstValid: boolean,
): PatternPlacement | null {
    const context = createPlacementSearchContext(options);
    let bestPlacement: ScoredPlacement | null = null;
    for (const patterns of options.patterns.map(getTransformedPatterns)) {
        const placement = findBestPatternPlacement(patterns, options, context, firstValid);
        if (placement && firstValid) return toPlacement(placement);
        if (placement && (!bestPlacement || placement.score > bestPlacement.score)) {
            bestPlacement = placement;
        }
    }

    return bestPlacement ? toPlacement(bestPlacement) : null;
}

function findBestPatternPlacement(
    transformedPatterns: readonly Position[][],
    options: PlacementSearchOptions,
    context: PlacementSearchContext,
    firstValid: boolean,
): ScoredPlacement | null {
    let bestPlacement: ScoredPlacement | null = null;
    visitPlacements(transformedPatterns, options, context, firstValid, (placement) => {
        if (bestPlacement && placement.score <= bestPlacement.score) return false;
        bestPlacement = placement;
        return firstValid;
    });
    return bestPlacement;
}

function visitPlacements(
    transformedPatterns: readonly (readonly Position[])[],
    options: PlacementSearchOptions,
    context: PlacementSearchContext,
    firstValid: boolean,
    visit: (placement: ScoredPlacement) => boolean,
): void {
    for (const pattern of transformedPatterns) {
        for (const y of context.rows) {
            for (const x of context.columns) {
                const placement = scoreTransformedPatternPlacement(
                    pattern,
                    options,
                    context,
                    x,
                    y,
                    firstValid,
                );
                if (placement && visit(placement)) return;
            }
        }
    }
}

function scoreTransformedPatternPlacement(
    transformedPattern: readonly Position[],
    options: PlacementSearchOptions,
    context: PlacementSearchContext,
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
        if (context.forbidden[index]) return null;
        if (context.adjacent[index]) hasConnection = true;
    }
    if (!hasConnection) return null;

    const cells = transformedPattern.map((cell) => ({
        x: originX + cell.x,
        y: originY + cell.y,
    }));
    if (options.isFootprintAllowed && !options.isFootprintAllowed(cells)) return null;
    let position: Position | undefined;
    let spawnScore = -Infinity;
    for (const cell of cells) {
        if (!context.isPlacementAllowed(cell, cells)) continue;
        const score = options.scoreSpawn?.(cell, cells) ?? 0;
        if (score > spawnScore) {
            position = cell;
            spawnScore = score;
        }
        if (!options.scoreSpawn) break;
    }
    if (!position) return null;

    return {
        position,
        cells,
        score: firstValid ? 0 : spawnScore + context.scorePlacement(position, cells),
    };
}
