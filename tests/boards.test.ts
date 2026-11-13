import { describe, expect, it } from "vitest";

import { GAME_CONFIG } from "../src/config";
import {
    createCustomBoard,
    getBoardOrigin,
    getBoardPreset,
    getRandomBoard,
    getStartingPositions,
    getTestBoard,
    isBoardCell,
    parseBoardDefinition,
    resolveBoardSelection,
} from "../src/game/boards";

describe("plateaux", () => {
    it("fournit le plateau de test compact en 11 par 7", () => {
        expect(getTestBoard()).toMatchObject({
            width: 11,
            height: 7,
            blockedCells: [],
        });
    });

    it("fournit des plateaux de tailles différentes et un masque irrégulier", () => {
        expect(getBoardPreset("wide-arena")).toMatchObject({ width: 19, height: 15 });
        expect(getBoardPreset("tall-arena")).toMatchObject({ width: 15, height: 19 });
        expect(getBoardPreset("square-arena")).toMatchObject({ width: 17, height: 17 });
        const bastion = getBoardPreset("bastion");
        expect(isBoardCell(bastion, { x: 0, y: 0 })).toBe(false);
        expect(isBoardCell(bastion, { x: 0, y: 7 })).toBe(true);
    });

    it("tire un plateau reproductible et copie les définitions prédéfinies", () => {
        expect(getRandomBoard(() => 0.26).id).toBe("tall-arena");

        const first = getBoardPreset("bastion");
        first.blockedCells[0].x = 5;
        expect(getBoardPreset("bastion").blockedCells[0].x).toBe(0);
    });

    it("valide les dimensions personnalisées, les cases bloquées et les départs", () => {
        const board = createCustomBoard(12, 10, [{ x: 4, y: 4 }]);
        expect(isBoardCell(board, { x: 4, y: 4 })).toBe(false);
        expect(getStartingPositions(board)).toEqual({
            1: { x: 0, y: 5 },
            2: { x: 11, y: 5 },
        });
        expect(resolveBoardSelection({ type: "custom", width: 12, height: 10 })).toMatchObject({
            width: 12,
            height: 10,
        });
        expect(() => createCustomBoard(5, 5)).toThrow();
        expect(
            parseBoardDefinition({
                id: "invalid",
                width: 12,
                height: 10,
                blockedCells: [{ x: 12, y: 4 }],
            }),
        ).toBeNull();
    });

    it("refuse un plateau séparé en zones déconnectées", () => {
        const wall = Array.from({ length: 7 }, (_, y) => ({ x: 3, y }));
        expect(() => createCustomBoard(7, 7, wall)).toThrow();
    });

    it("repositionne les plateaux autour du même centre de scène", () => {
        const origin = getBoardOrigin(getBoardPreset("wide-arena"));
        expect(origin).toEqual({
            x: GAME_CONFIG.boardOffsetX,
            y: GAME_CONFIG.boardOffsetY,
        });
    });
});
