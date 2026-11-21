import { describe, expect, it } from "vitest";

import { PLACEMENT_PATTERNS } from "../src/data/placementPatterns";
import {
    canPlaceCells,
    findValidPlacement,
    getPatternCells,
    hasValidPlacement,
    type PlacementSearchOptions,
} from "../src/game/placement";
import {
    createCustomBoard,
    getBoardPresets,
    getDefaultBoard,
    getStartingPositions,
} from "../src/game/boards";
import { createInitialDeploymentProtection, findValidPlacements } from "../src/game/placement";
import type { Position } from "../src/types/GameTypes";

const positionKey = ({ x, y }: Position) => `${x},${y}`;

function normalizedKey(cells: readonly Position[]): string {
    const minX = Math.min(...cells.map((cell) => cell.x));
    const minY = Math.min(...cells.map((cell) => cell.y));

    return cells
        .map((cell) => `${cell.x - minX},${cell.y - minY}`)
        .sort()
        .join(";");
}

function freeShapeKey(cells: readonly Position[]): string {
    const transforms: ((cell: Position) => Position)[] = [
        (cell) => ({ x: cell.x, y: cell.y }),
        (cell) => ({ x: -cell.x, y: cell.y }),
        (cell) => ({ x: cell.x, y: -cell.y }),
        (cell) => ({ x: -cell.x, y: -cell.y }),
        (cell) => ({ x: cell.y, y: cell.x }),
        (cell) => ({ x: -cell.y, y: cell.x }),
        (cell) => ({ x: cell.y, y: -cell.x }),
        (cell) => ({ x: -cell.y, y: -cell.x }),
    ];

    return transforms.map((transform) => normalizedKey(cells.map(transform))).sort()[0];
}

function getNearestFirstIndices(length: number, origin: number): number[] {
    return Array.from({ length }, (_, index) => index).sort(
        (first, second) => Math.abs(first - origin) - Math.abs(second - origin),
    );
}

function findReferencePlacement(
    options: PlacementSearchOptions,
): { position: Position; cells: Position[] } | null {
    const columns = getNearestFirstIndices(options.boardWidth, options.start.x);
    const rows = getNearestFirstIndices(options.boardHeight, options.start.y);
    let best: { position: Position; cells: Position[]; score: number } | null = null;
    for (const pattern of options.patterns) {
        for (let rotation = 0; rotation < 4; rotation++) {
            for (const mirrored of [false, true]) {
                const transformed = getPatternCells(pattern, { x: 0, y: 0 }, rotation, mirrored);
                for (const y of rows) {
                    for (const x of columns) {
                        const cells = transformed.map((cell) => ({
                            x: x + cell.x,
                            y: y + cell.y,
                        }));
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
                            continue;
                        }

                        const position = cells.find((cell) =>
                            options.isPlacementAllowed?.(cell, cells) ?? true,
                        );
                        if (!position) continue;

                        const score = options.scorePlacement?.(position, cells) ?? 0;
                        if (best && score <= best.score) continue;
                        best = { position, cells, score };
                    }
                }
            }
        }
    }

    return best ? { position: best.position, cells: best.cells } : null;
}

describe("patrons de placement", () => {
    it("contient onze formes distinctes de six cases connectées", () => {
        expect(PLACEMENT_PATTERNS).toHaveLength(11);

        for (const pattern of PLACEMENT_PATTERNS) {
            expect(new Set(pattern.map(positionKey)).size).toBe(6);

            const remaining = new Set(pattern.map(positionKey));
            const connected = [pattern[0]];
            remaining.delete(positionKey(pattern[0]));

            while (connected.length > 0) {
                const cell = connected.pop()!;
                const neighbors = [
                    { x: cell.x + 1, y: cell.y },
                    { x: cell.x - 1, y: cell.y },
                    { x: cell.x, y: cell.y + 1 },
                    { x: cell.x, y: cell.y - 1 },
                ];

                for (const neighbor of neighbors) {
                    if (remaining.delete(positionKey(neighbor))) connected.push(neighbor);
                }
            }

            expect(remaining.size).toBe(0);
        }

        expect(new Set(PLACEMENT_PATTERNS.map(freeShapeKey)).size).toBe(11);
    });

    it("préserve les six cases et l’ancrage pour chaque rotation", () => {
        for (const pattern of PLACEMENT_PATTERNS) {
            for (let rotation = 0; rotation < 4; rotation++) {
                const cells = getPatternCells(pattern, { x: 7, y: 9 }, rotation);

                expect(cells).toHaveLength(6);
                expect(new Set(cells.map(positionKey)).size).toBe(6);
                expect(Math.min(...cells.map((cell) => cell.x))).toBe(7);
                expect(Math.min(...cells.map((cell) => cell.y))).toBe(9);
            }

            expect(getPatternCells(pattern, { x: 7, y: 9 }, 4).map(positionKey).sort()).toEqual(
                getPatternCells(pattern, { x: 7, y: 9 }).map(positionKey).sort(),
            );
        }
    });

    it("applique une symétrie verticale indépendamment de la rotation", () => {
        const pattern = PLACEMENT_PATTERNS[1];
        const origin = { x: 7, y: 9 };
        const normal = getPatternCells(pattern, origin, 0);
        const mirrored = getPatternCells(pattern, origin, 0, true);

        expect(new Set(mirrored.map(positionKey))).not.toEqual(new Set(normal.map(positionKey)));
        expect(getPatternCells(pattern, origin, 4, true).map(positionKey).sort()).toEqual(
            mirrored.map(positionKey).sort(),
        );
        expect(getPatternCells(pattern, origin, 1, true)).toHaveLength(6);
    });
});

describe("règles de pose", () => {
    const line: Position[] = Array.from({ length: 6 }, (_, index) => ({
        x: index + 1,
        y: 1,
    }));

    it("autorise une pose libre, dans le plateau et adjacente au territoire", () => {
        const owned = { x: 0, y: 1 };

        expect(canPlaceCells(line, 10, [owned], [owned])).toBe(true);
    });

    it("respecte les limites rectangulaires du plateau", () => {
        const cells = Array.from({ length: 6 }, (_, index) => ({ x: 14, y: 10 + index }));
        const connected = [{ x: 13, y: 10 }];

        expect(canPlaceCells(cells, 15, [], connected, [], 19)).toBe(true);
        expect(
            canPlaceCells(
                cells.map((cell) => ({ ...cell, x: 15 })),
                15,
                [],
                connected,
                [],
                19,
            ),
        ).toBe(false);
    });

    it("refuse les cases manquantes d'un plateau irrégulier", () => {
        expect(
            canPlaceCells(line, 10, [], [{ x: 0, y: 1 }], [], 10, [{ x: 4, y: 1 }]),
        ).toBe(false);
    });

    it("préserve le choix exhaustif, l’ordre des scores et les égalités", () => {
        const scoreCalls: string[][] = [[], []];
        const scoreValues: number[][] = [[], []];
        const baseOptions = {
            patterns: PLACEMENT_PATTERNS,
            boardWidth: 15,
            boardHeight: 19,
            start: { x: 14, y: 9 },
            occupiedCells: [{ x: 0, y: 9 }, { x: 14, y: 9 }, { x: 12, y: 9 }],
            connectedCells: [{ x: 14, y: 9 }, { x: 13, y: 9 }],
            overlappingCells: [{ x: 12, y: 9 }],
            blockedCells: [{ x: 13, y: 8 }],
            isPlacementAllowed: (position: Position, cells: readonly Position[]) =>
                position.x > 0 && cells.some((cell) => cell.x !== 12 || cell.y !== 9),
        };
        const createOptions = (index: number): PlacementSearchOptions => ({
            ...baseOptions,
            scorePlacement: (position, cells) => {
                scoreCalls[index]!.push(
                    `${position.x},${position.y}:${cells.map(positionKey).join(";")}`,
                );
                const score = (position.x + position.y) % 2;
                scoreValues[index]!.push(score);
                return score;
            },
        });
        const options = createOptions(0);
        const expected = findReferencePlacement(createOptions(1));

        expect(findValidPlacement(options)).toEqual(expected);
        expect(scoreCalls[0]).toEqual(scoreCalls[1]);
        expect(scoreValues[0]).toEqual(scoreValues[1]);
        expect(scoreValues[0]!.filter((score) => score === 1).length).toBeGreaterThan(1);
        const scoredCellSets = scoreCalls[1]!.map((call) =>
            call.slice(call.indexOf(":") + 1).split(";"),
        );
        expect(scoredCellSets.some((cells) => cells.includes("12,9"))).toBe(true);
        expect(scoredCellSets.every((cells) => !cells.includes("13,8"))).toBe(true);
    });

    it("réutilise les départs du plateau sans exposer l’état mis en cache", () => {
        const board = getDefaultBoard();
        const expected = getStartingPositions(board);
        const firstRead = getStartingPositions(board);
        firstRead[1].x = -1;

        expect(getStartingPositions(board)).toEqual(expected);
    });

    describe("pose de l'ordinateur", () => {
        it("choisit une zone valide adjacente au départ du joueur 2", () => {
            const playerOneStart = { x: 0, y: 9 };
            const computerStart = { x: 14, y: 9 };
            const placement = findValidPlacement(
                {
                    patterns: PLACEMENT_PATTERNS,
                    boardWidth: 15,
                    boardHeight: 19,
                    start: computerStart,
                    occupiedCells: [playerOneStart, computerStart],
                    connectedCells: [computerStart],
                },
            );

            expect(placement).not.toBeNull();
            expect(placement!.cells).toContainEqual(placement!.position);
            expect(
                canPlaceCells(
                    placement!.cells,
                    15,
                    [playerOneStart, computerStart],
                    [computerStart],
                    [],
                    19,
                ),
            ).toBe(true);
            expect(placement!.cells).not.toContainEqual(playerOneStart);
            expect(placement!.cells).not.toContainEqual(computerStart);
        });

        it("détecte l’existence d’une pose sans calculer le meilleur score", () => {
            const options = {
                patterns: PLACEMENT_PATTERNS,
                boardWidth: 15,
                boardHeight: 19,
                start: { x: 14, y: 9 },
                occupiedCells: [{ x: 0, y: 9 }, { x: 14, y: 9 }],
                connectedCells: [{ x: 14, y: 9 }],
            };

            expect(hasValidPlacement(options)).toBe(true);
            expect(hasValidPlacement({ ...options, isPlacementAllowed: () => false })).toBe(false);
        });

        it("étend sa zone depuis ses cases déjà posées, sans chevaucher celle de l'adversaire", () => {
            const computerStart = { x: 14, y: 9 };
            const playerOneStart = { x: 0, y: 9 };
            const computerPath: Position[] = [
                { x: 11, y: 9 },
                { x: 12, y: 9 },
                { x: 13, y: 9 },
            ];
            const enemyPath: Position[] = [
                { x: 1, y: 9 },
                { x: 2, y: 9 },
                { x: 3, y: 9 },
            ];
            const findPlacement = (blockedPosition?: Position) =>
                findValidPlacement(
                    {
                        patterns: PLACEMENT_PATTERNS,
                        boardWidth: 15,
                        boardHeight: 19,
                        start: computerStart,
                        occupiedCells: [
                            computerStart,
                            playerOneStart,
                            ...computerPath,
                            ...enemyPath,
                        ],
                        connectedCells: [computerStart, ...computerPath],
                        overlappingCells: computerPath,
                        isPlacementAllowed: (position) =>
                            !blockedPosition ||
                            position.x !== blockedPosition.x ||
                            position.y !== blockedPosition.y,
                    },
                );
            const firstPlacement = findPlacement();
            const placement = firstPlacement && findPlacement(firstPlacement.position);

            expect(firstPlacement).not.toBeNull();
            expect(placement).not.toBeNull();
            expect(placement!.position).not.toEqual(firstPlacement!.position);
            expect(placement!.cells).toContainEqual(placement!.position);
            expect(
                canPlaceCells(
                    placement!.cells,
                    15,
                    [computerStart, playerOneStart, ...computerPath, ...enemyPath],
                    [computerStart, ...computerPath],
                    computerPath,
                    19,
                ),
            ).toBe(true);
            expect(
                placement!.cells.some((cell) =>
                    enemyPath.some((enemy) => positionKey(enemy) === positionKey(cell)),
                ),
            ).toBe(false);
        });

        it("étend progressivement son territoire vers le joueur adverse", () => {
            const computerStart = { x: 14, y: 9 };
            const playerOneStart = { x: 0, y: 9 };
            const territory = [computerStart];
            const occupied = [computerStart, playerOneStart];
            const monsterPositions: Position[] = [];

            for (let turn = 0; turn < 3; turn++) {
                const territoryKeys = new Set(territory.map(positionKey));
                const frontierX = Math.min(...territory.map((cell) => cell.x));
                const placement = findValidPlacement(
                    {
                        patterns: PLACEMENT_PATTERNS,
                        boardWidth: 15,
                        boardHeight: 19,
                        start: computerStart,
                        occupiedCells: occupied,
                        connectedCells: territory,
                        overlappingCells: territory,
                        isPlacementAllowed: (position, cells) =>
                            !monsterPositions.some(
                                (placed) => positionKey(placed) === positionKey(position),
                            ) && cells.some((cell) => !territoryKeys.has(positionKey(cell))),
                        scorePlacement: (_position, cells) => {
                            const newCells = cells.filter(
                                (cell) => !territoryKeys.has(positionKey(cell)),
                            );
                            return (
                                (frontierX - Math.min(...newCells.map((cell) => cell.x))) * 100 +
                                newCells.length
                            );
                        },
                    },
                );

                expect(placement).not.toBeNull();
                expect(placement!.cells).toContainEqual(placement!.position);
                expect(placement!.cells.some((cell) => !territoryKeys.has(positionKey(cell)))).toBe(
                    true,
                );
                expect(Math.min(...placement!.cells.map((cell) => cell.x))).toBeLessThan(frontierX);

                monsterPositions.push(placement!.position);
                territory.push(...placement!.cells);
                occupied.push(...placement!.cells);
            }
        });

        it("refuse les placements dont la forme ou le monstre recouvre le chemin adverse", () => {
            const computerStart = { x: 14, y: 9 };
            const opponentStart = { x: 0, y: 9 };
            const opponentPath: Position[] = [
                { x: 3, y: 9 },
                { x: 4, y: 9 },
                { x: 5, y: 9 },
            ];
            const occupied = [computerStart, opponentStart, ...opponentPath];
            const opponentKeys = new Set(occupied.slice(1).map(positionKey));
            const placement = findValidPlacement(
                {
                    patterns: PLACEMENT_PATTERNS,
                    boardWidth: 15,
                    boardHeight: 19,
                    start: computerStart,
                    occupiedCells: occupied,
                    connectedCells: [computerStart],
                    overlappingCells: [],
                    isPlacementAllowed: (position, cells) =>
                        !opponentKeys.has(positionKey(position)) &&
                        cells.every((cell) => !opponentKeys.has(positionKey(cell))),
                    scorePlacement: (_position, cells) =>
                        -Math.min(...cells.map((cell) => cell.x)),
                },
            );

            expect(placement).not.toBeNull();
            expect(opponentKeys.has(positionKey(placement!.position))).toBe(false);
            expect(placement!.cells.some((cell) => opponentKeys.has(positionKey(cell)))).toBe(
                false,
            );
        });
    });

    it("refuse une forme qui ne contient pas six cases uniques", () => {
        expect(canPlaceCells(line.slice(0, 5), 10, [], [{ x: 0, y: 1 }])).toBe(false);
        expect(canPlaceCells([...line.slice(0, 5), line[0]], 10, [], [{ x: 0, y: 1 }])).toBe(false);
    });

    it("refuse les cases hors plateau et les collisions", () => {
        const outside = line.map((cell) => ({ x: cell.x + 4, y: cell.y }));
        const owned = { x: 0, y: 1 };

        expect(canPlaceCells(outside, 10, [], [owned])).toBe(false);
        expect(canPlaceCells(line, 10, [{ x: 3, y: 1 }], [owned])).toBe(false);
    });

    it("autorise le chevauchement avec son propre chemin mais pas celui de l'adversaire", () => {
        const owned = { x: 0, y: 1 };
        const ownPathCell = { x: 3, y: 1 };
        const opponentPathCell = { x: 4, y: 1 };

        expect(canPlaceCells(line, 10, [ownPathCell], [owned], [ownPathCell])).toBe(true);
        expect(canPlaceCells(line, 10, [opponentPathCell], [owned], [ownPathCell])).toBe(false);
    });

    it("refuse les placements sans contact orthogonal avec son territoire", () => {
        expect(canPlaceCells(line, 10, [], [{ x: 0, y: 0 }])).toBe(false);
        expect(canPlaceCells(line, 10, [], [])).toBe(false);
    });

    it("préserve toujours une formation initiale sur les plateaux prédéfinis et personnalisés", () => {
        const boards = [
            ...getBoardPresets(),
            createCustomBoard(15, 15, [{ x: 7, y: 7 }]),
        ];

        for (const board of boards) {
            const starts = getStartingPositions(board);
            const occupiedCells: Position[] = [starts[1], starts[2]];
            const ownTerritory: Position[] = [starts[1]];
            const ownMonsterPositions: Position[] = [];

            for (let deployment = 0; deployment < 6; deployment++) {
                const protectOpponentDeployment = createInitialDeploymentProtection({
                    patterns: PLACEMENT_PATTERNS,
                    boardWidth: board.width,
                    boardHeight: board.height,
                    start: starts[2],
                    occupiedCells,
                    connectedCells: [starts[2]],
                    blockedCells: board.blockedCells,
                });
                expect(protectOpponentDeployment).not.toBeNull();

                const ownTerritoryKeys = new Set(ownTerritory.map(positionKey));
                const placements = findValidPlacements({
                    patterns: PLACEMENT_PATTERNS,
                    boardWidth: board.width,
                    boardHeight: board.height,
                    start: starts[1],
                    occupiedCells,
                    connectedCells: ownTerritory,
                    overlappingCells: ownTerritory,
                    blockedCells: board.blockedCells,
                    isPlacementAllowed: (position, cells) =>
                        !ownMonsterPositions.some(
                            (placed) => positionKey(placed) === positionKey(position),
                        ) && cells.some((cell) => !ownTerritoryKeys.has(positionKey(cell))),
                });
                const placement = placements.find(({ cells }) =>
                    protectOpponentDeployment!(cells),
                );

                expect(placement).toBeDefined();
                occupiedCells.push(...placement!.cells);
                ownTerritory.push(...placement!.cells);
                ownMonsterPositions.push(placement!.position);

                expect(
                    hasValidPlacement({
                        patterns: PLACEMENT_PATTERNS,
                        boardWidth: board.width,
                        boardHeight: board.height,
                        start: starts[2],
                        occupiedCells,
                        connectedCells: [starts[2]],
                        blockedCells: board.blockedCells,
                    }),
                ).toBe(true);
            }
        }
    });
});
