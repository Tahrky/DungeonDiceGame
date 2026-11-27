import { describe, expect, it } from "vitest";
import {
    analyzeLegalMovementRoutes,
    analyzePotentialRoutes,
    getShortestRouteDistance,
} from "../src/game/routeAnalysis";
import type { BoardDefinition } from "../src/game/boards";
import type { MovementOptions } from "../src/game/monsterActions";

function createBoard(
    width: number,
    height: number,
    blockedCells: BoardDefinition["blockedCells"] = [],
): BoardDefinition {
    return { id: "route-test", width, height, blockedCells };
}

describe("analyse des routes stratégiques", () => {
    it("arrête la recherche dès que la distance cible est connue", () => {
        expect(getShortestRouteDistance(createBoard(7, 3), { x: 0, y: 1 }, { x: 6, y: 1 })).toBe(
            6,
        );
        expect(
            getShortestRouteDistance(
                createBoard(5, 3, [{ x: 2, y: 1 }]),
                { x: 0, y: 1 },
                { x: 4, y: 1 },
            ),
        ).toBe(6);
        expect(
            getShortestRouteDistance(
                createBoard(5, 3, Array.from({ length: 3 }, (_, y) => ({ x: 2, y }))),
                { x: 0, y: 1 },
                { x: 4, y: 1 },
            ),
        ).toBeNull();
        expect(getShortestRouteDistance(createBoard(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 })).toBe(
            0,
        );
    });

    it("mesure la distance d'une route droite", () => {
        const result = analyzePotentialRoutes(createBoard(7, 3), { x: 0, y: 1 }, { x: 6, y: 1 });
        expect(result.shortestDistance).toBe(6);
    });

    it("compte les chemins les plus courts équivalents", () => {
        const result = analyzePotentialRoutes(createBoard(3, 3), { x: 0, y: 0 }, { x: 2, y: 2 });
        expect(result.shortestPathCount).toBe(6);
    });

    it("repère les cases critiques d'un couloir sans alternative", () => {
        const blockedCells = Array.from({ length: 4 }, (_, y) => ({ x: 2, y: y + 1 }));
        const result = analyzePotentialRoutes(
            createBoard(5, 5, blockedCells),
            { x: 0, y: 2 },
            { x: 4, y: 2 },
        );
        expect(result.shortestPathCount).toBeGreaterThan(0);
        expect(result.criticalCells).toContainEqual({ x: 2, y: 0 });
    });

    it("trouve des routes alternatives autour d'un obstacle central", () => {
        const result = analyzePotentialRoutes(
            createBoard(5, 3, [{ x: 2, y: 1 }]),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
        );
        expect(result.shortestDistance).toBe(6);
        expect(result.shortestPathCount).toBe(8);
        expect(result.alternativeRoutes).toHaveLength(3);
    });

    it("signale l'absence de route quand un mur coupe le plateau", () => {
        const blockedCells = Array.from({ length: 3 }, (_, y) => ({ x: 2, y }));
        const result = analyzePotentialRoutes(
            createBoard(5, 3, blockedCells),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
        );
        expect(result.shortestDistance).toBeNull();
        expect(result.alternativeRoutes).toEqual([]);
    });

    it("laisse les bases accessibles même si elles figurent parmi les cases bloquées", () => {
        const result = analyzePotentialRoutes(
            createBoard(3, 1, [{ x: 0, y: 0 }, { x: 2, y: 0 }]),
            { x: 0, y: 0 },
            { x: 2, y: 0 },
        );
        expect(result.shortestDistance).toBe(2);
    });

    it("ignore les obstacles situés hors du plateau", () => {
        const result = analyzePotentialRoutes(
            createBoard(3, 1, [{ x: 10, y: 10 }]),
            { x: 0, y: 0 },
            { x: 2, y: 0 },
        );
        expect(result.shortestDistance).toBe(2);
    });

    it("borne le nombre de routes alternatives demandées", () => {
        const result = analyzePotentialRoutes(
            createBoard(3, 3),
            { x: 0, y: 0 },
            { x: 2, y: 2 },
            { alternativeRouteLimit: 2 },
        );
        expect(result.alternativeRoutes).toHaveLength(2);
    });

    it("borne les alternatives au coût stratégique maximal", () => {
        const result = analyzePotentialRoutes(
            createBoard(3, 3),
            { x: 0, y: 0 },
            { x: 2, y: 2 },
            { maxRouteCost: 3 },
        );
        expect(result.shortestDistance).toBe(4);
        expect(result.alternativeRoutes).toEqual([]);
    });

    it("compte les cases d'itinéraires proches du meilleur coût", () => {
        const result = analyzePotentialRoutes(
            createBoard(5, 3),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
            { maxRouteCost: 4 },
        );
        expect(result.nearOptimalCellCount).toBe(5);
    });

    it("ne compte pas deux fois les mêmes obstacles", () => {
        const single = analyzePotentialRoutes(
            createBoard(5, 3),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
            { blockedCells: [{ x: 2, y: 1 }] },
        );
        const duplicate = analyzePotentialRoutes(
            createBoard(5, 3),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
            { blockedCells: [{ x: 2, y: 1 }, { x: 2, y: 1 }] },
        );
        expect(duplicate.shortestDistance).toBe(single.shortestDistance);
        expect(duplicate.shortestPathCount).toBe(single.shortestPathCount);
    });

    it("privilégie une route économique plutôt qu'une ligne courte et coûteuse", () => {
        const result = analyzePotentialRoutes(
            createBoard(5, 3),
            { x: 0, y: 1 },
            { x: 4, y: 1 },
            { cellCosts: new Map([["2,1", 20]]) },
        );
        expect(result.shortestDistance).toBeLessThan(13);
        expect(result.alternativeRoutes[0]?.cells).not.toContainEqual({ x: 2, y: 1 });
    });

    it("traite une base comme un chemin nul lorsqu'elle est l'origine et la cible", () => {
        const result = analyzePotentialRoutes(createBoard(3, 3), { x: 1, y: 1 }, { x: 1, y: 1 });
        expect(result.shortestDistance).toBe(0);
        expect(result.alternativeRoutes[0]?.cells).toEqual([{ x: 1, y: 1 }]);
    });

    it("rejette une origine hors du plateau", () => {
        expect(() =>
            analyzePotentialRoutes(createBoard(3, 3), { x: -1, y: 0 }, { x: 1, y: 1 }),
        ).toThrow(RangeError);
    });

    it("rejette un coût de case nul", () => {
        expect(() =>
            analyzePotentialRoutes(
                createBoard(3, 3),
                { x: 0, y: 0 },
                { x: 2, y: 2 },
                { cellCosts: new Map([["1,1", 0]]) },
            ),
        ).toThrow(RangeError);
    });

    it("repose sur les règles légales pour écarter une case bloquée", () => {
        const options: MovementOptions = {
            source: { x: 0, y: 1 },
            destination: { x: 0, y: 1 },
            deployedCells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
            occupiedCells: [],
            blockedCells: [{ x: 1, y: 1 }],
            range: 2,
            boardWidth: 3,
            boardHeight: 3,
        };
        expect(analyzeLegalMovementRoutes(options).paths.has("2,1")).toBe(false);
    });

    it("refuse de traverser un ennemi sans capacité spéciale", () => {
        const options: MovementOptions = {
            source: { x: 0, y: 1 },
            destination: { x: 0, y: 1 },
            deployedCells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
            occupiedCells: [{ x: 1, y: 1 }],
            blockedCells: [],
            hostileCells: [{ x: 1, y: 1 }],
            range: 2,
            boardWidth: 3,
            boardHeight: 3,
        };
        expect(analyzeLegalMovementRoutes(options).paths.has("2,1")).toBe(false);
    });

    it("autorise le passage spécial au-dessus d'un ennemi sans autoriser son occupation", () => {
        const options: MovementOptions = {
            source: { x: 0, y: 1 },
            destination: { x: 0, y: 1 },
            deployedCells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
            occupiedCells: [{ x: 1, y: 1 }],
            blockedCells: [],
            hostileCells: [{ x: 1, y: 1 }],
            canPassHostiles: true,
            range: 2,
            boardWidth: 3,
            boardHeight: 3,
        };
        const routes = analyzeLegalMovementRoutes(options);
        expect(routes.paths.has("2,1")).toBe(true);
        expect(routes.paths.has("1,1")).toBe(false);
    });

    it("expose la distance légale à partir du chemin obtenu", () => {
        const options: MovementOptions = {
            source: { x: 0, y: 1 },
            destination: { x: 0, y: 1 },
            deployedCells: [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
            occupiedCells: [],
            blockedCells: [],
            range: 2,
            boardWidth: 3,
            boardHeight: 3,
        };
        expect(analyzeLegalMovementRoutes(options).distances.get("2,1")).toBe(2);
    });
});
