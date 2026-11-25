import type { AttackPattern } from "../../types/GameTypes";
import { clamp } from "../../utils/math";
import { OPTIONS } from "./options";

export interface AttackGeometry {
    known: boolean;
    patternType: string;
    averageCoverageCells: number;
    averageMaxAffectedCells: number;
    rangeControlScore: number;
    maximumReach: number;
    singleTarget: boolean;
}

interface Footprint {
    cells: Set<number>;
    maxAffected: number;
}

interface PatternShape {
    singleTarget: boolean;
    reach: number;
    footprint: (x: number, y: number) => Footprint;
}

const CARDINAL_DIRECTIONS = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];
const EIGHT_DIRECTIONS = [
    ...CARDINAL_DIRECTIONS,
    { x: 1, y: 1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: -1, y: -1 },
];

function addCell(cells: Set<number>, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= OPTIONS.boardWidth || y >= OPTIONS.boardHeight) return false;
    cells.add(y * OPTIONS.boardWidth + x);
    return true;
}

function circleCells(x: number, y: number, radius: number, includeCenter: boolean): Set<number> {
    const cells = new Set<number>();
    for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
            if (dx * dx + dy * dy <= radius * radius && (includeCenter || dx !== 0 || dy !== 0)) {
                addCell(cells, x + dx, y + dy);
            }
        }
    }
    return cells;
}

function singleTargetFootprint(cells: Set<number>): Footprint {
    return { cells, maxAffected: cells.size > 0 ? 1 : 0 };
}

function getPatternShape(pattern: AttackPattern): PatternShape | null {
    switch (pattern.type) {
        case "adjacent":
            return {
                singleTarget: true,
                reach: 1,
                footprint: (x, y) => {
                    const cells = new Set<number>();
                    for (const direction of CARDINAL_DIRECTIONS) {
                        addCell(cells, x + direction.x, y + direction.y);
                    }
                    return singleTargetFootprint(cells);
                },
            };
        case "radius": {
            const range = Math.max(0, pattern.range);
            return {
                singleTarget: true,
                reach: range,
                footprint: (x, y) => singleTargetFootprint(circleCells(x, y, range, false)),
            };
        }
        case "selfRadius": {
            const range = Math.max(0, pattern.range);
            return {
                singleTarget: false,
                reach: range,
                footprint: (x, y) => {
                    const cells = circleCells(x, y, range, OPTIONS.includeCasterInSelfRadius);
                    return { cells, maxAffected: cells.size };
                },
            };
        }
        case "line": {
            const range = Math.max(0, pattern.range);
            const length = Math.max(1, pattern.length ?? 1);
            const directions = pattern.allDirections ? EIGHT_DIRECTIONS : CARDINAL_DIRECTIONS;
            return {
                singleTarget: false,
                reach: range + length - 1,
                footprint: (x, y) => {
                    const cells = new Set<number>();
                    let maxAffected = 0;
                    for (const direction of directions) {
                        for (let start = 1; start <= range; start++) {
                            let affected = 0;
                            for (let offset = 0; offset < length; offset++) {
                                const distance = start + offset;
                                const inside = addCell(
                                    cells,
                                    x + direction.x * distance,
                                    y + direction.y * distance,
                                );
                                if (inside) affected++;
                            }
                            maxAffected = Math.max(maxAffected, affected);
                        }
                    }
                    return { cells, maxAffected };
                },
            };
        }
        case "directionalArea": {
            const width = Math.max(1, pattern.width);
            const depth = Math.max(1, pattern.depth);
            const sideStart = -Math.floor((width - 1) / 2);
            return {
                singleTarget: false,
                reach: depth,
                footprint: (x, y) => {
                    const cells = new Set<number>();
                    let maxAffected = 0;
                    for (const direction of CARDINAL_DIRECTIONS) {
                        for (let forward = 1; forward <= depth; forward++) {
                            let affected = 0;
                            for (let lateral = 0; lateral < width; lateral++) {
                                const side = sideStart + lateral;
                                const inside = addCell(
                                    cells,
                                    x + direction.x * forward - direction.y * side,
                                    y + direction.y * forward + direction.x * side,
                                );
                                if (inside) affected++;
                            }
                            maxAffected = Math.max(maxAffected, affected);
                        }
                    }
                    return { cells, maxAffected };
                },
            };
        }
        default:
            return null;
    }
}

export function analyzeAttackGeometry(pattern: AttackPattern): AttackGeometry {
    const shape = getPatternShape(pattern);
    if (!shape) {
        return {
            known: false,
            patternType: pattern.type,
            averageCoverageCells: 0,
            averageMaxAffectedCells: 0,
            rangeControlScore: 0,
            maximumReach: 0,
            singleTarget: false,
        };
    }

    let coverageSum = 0;
    let impactSum = 0;
    for (let y = 0; y < OPTIONS.boardHeight; y++) {
        for (let x = 0; x < OPTIONS.boardWidth; x++) {
            const { cells, maxAffected } = shape.footprint(x, y);
            coverageSum += cells.size;
            impactSum += maxAffected;
        }
    }

    const positions = OPTIONS.boardWidth * OPTIONS.boardHeight;
    const averageCoverageCells = coverageSum / positions;
    const averageMaxAffectedCells = impactSum / positions;
    const coverageScore = 10 * Math.sqrt(clamp(averageCoverageCells / positions, 0, 1));
    const impactScore =
        10 * Math.sqrt(clamp(averageMaxAffectedCells / OPTIONS.areaReferenceCells, 0, 1));
    return {
        known: true,
        patternType: pattern.type,
        averageCoverageCells,
        averageMaxAffectedCells,
        rangeControlScore: clamp(0.6 * coverageScore + 0.4 * impactScore, 0, 10),
        maximumReach: shape.reach,
        singleTarget: shape.singleTarget,
    };
}

export function expectedHits(geometry: AttackGeometry, density: number): number {
    if (!geometry.known || geometry.averageCoverageCells <= 0) return 0;
    const atLeastOneTarget = 1 - Math.pow(1 - clamp(density, 0, 1), geometry.averageCoverageCells);
    if (geometry.singleTarget) return clamp(atLeastOneTarget, 0, 1);
    const expectedTargets = geometry.averageMaxAffectedCells * density;
    if (geometry.patternType === "selfRadius") return expectedTargets;
    return (
        atLeastOneTarget * Math.min(geometry.averageMaxAffectedCells, Math.max(1, expectedTargets))
    );
}
