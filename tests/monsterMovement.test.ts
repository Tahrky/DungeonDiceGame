import { describe, expect, it } from "vitest";

import {
    canMoveMonsterTo,
    canPassHostileMonsters,
    getFacingFromMovement,
    getMonsterMovementPath,
    isBehind,
} from "../src/game/monsterActions";
import { MONSTERS } from "../src/data/monsters";
import type { Position } from "../src/types/GameTypes";

describe("déplacement des monstres", () => {
    it("identifie l'arrière et oriente le monstre dans sa direction de déplacement", () => {
        expect(isBehind({ x: 5, y: 3 }, { x: 4, y: 3 }, "east")).toBe(true);
        expect(isBehind({ x: 3, y: 3 }, { x: 4, y: 3 }, "east")).toBe(false);
        expect(getFacingFromMovement({ x: 1, y: 1 }, { x: 1, y: 3 }, "east")).toBe("south");
    });

    it("autorise le déplacement jusqu'à deux cases sur tout dé déployé", () => {
        const deployed: Position[] = [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
        ];

        expect(
            canMoveMonsterTo({
                source: { x: 1, y: 2 },
                destination: { x: 3, y: 2 },
                deployedCells: deployed,
                occupiedCells: [],
                blockedCells: [],
            }),
        ).toBe(true);
    });

    it("utilise la portée de déplacement configurée", () => {
        const deployed: Position[] = [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            { x: 4, y: 2 },
        ];
        expect(
            canMoveMonsterTo({
                source: { x: 1, y: 2 },
                destination: { x: 4, y: 2 },
                deployedCells: deployed,
                occupiedCells: [],
                blockedCells: [],
                range: 3,
            }),
        ).toBe(true);
    });

    it("respecte séparément les limites de largeur et de longueur", () => {
        const movement = (
            source: Position,
            destination: Position,
        ): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination,
            deployedCells: [destination],
            occupiedCells: [],
            blockedCells: [],
            boardWidth: 15,
            boardHeight: 19,
        });

        expect(canMoveMonsterTo(movement({ x: 13, y: 18 }, { x: 14, y: 18 }))).toBe(true);
        expect(canMoveMonsterTo(movement({ x: 14, y: 18 }, { x: 15, y: 18 }))).toBe(false);
        expect(canMoveMonsterTo(movement({ x: 13, y: 18 }, { x: 13, y: 19 }))).toBe(false);
    });

    it("empêche de traverser une case absente du plateau", () => {
        expect(
            canMoveMonsterTo({
                source: { x: 1, y: 1 },
                destination: { x: 3, y: 1 },
                deployedCells: [
                    { x: 1, y: 1 },
                    { x: 2, y: 1 },
                    { x: 3, y: 1 },
                ],
                occupiedCells: [],
                blockedCells: [{ x: 2, y: 1 }],
                range: 2,
                boardWidth: 5,
                boardHeight: 5,
            }),
        ).toBe(false);
    });

    it("empêche de franchir un ennemi, mais autorise le détour et le passage par un allié", () => {
        const source = { x: 1, y: 1 };
        const destination = { x: 3, y: 1 };
        const deployed = [
            { x: 2, y: 1 },
            destination,
            { x: 1, y: 2 },
            { x: 2, y: 2 },
            { x: 3, y: 2 },
        ];
        const blockingEnemy = [{ x: 2, y: 1 }];

        const movement = (
            range: number,
            hostileCells: readonly Position[],
        ): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination,
            deployedCells: deployed,
            occupiedCells: blockingEnemy,
            blockedCells: [],
            range,
            hostileCells,
        });

        expect(canMoveMonsterTo(movement(2, blockingEnemy))).toBe(false);
        expect(canMoveMonsterTo(movement(4, blockingEnemy))).toBe(true);
        expect(canMoveMonsterTo(movement(2, []))).toBe(true);
        expect(getMonsterMovementPath(movement(4, blockingEnemy))).toEqual([
            source,
            { x: 1, y: 2 },
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            destination,
        ]);
    });

    it("refuse une destination atteignable en distance mais séparée par un trou", () => {
        expect(
            canMoveMonsterTo({
                source: { x: 1, y: 1 },
                destination: { x: 3, y: 1 },
                deployedCells: [{ x: 3, y: 1 }],
                occupiedCells: [],
                blockedCells: [],
                range: 2,
            }),
        ).toBe(false);
    });

    it("permet au monstre volant de passer au-dessus d'un ennemi sans pouvoir s'y poser", () => {
        const source = { x: 1, y: 1 };
        const destination = { x: 3, y: 1 };
        const enemy = { x: 2, y: 1 };
        const deployed = [enemy, destination];

        const movement = (target: Position): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination: target,
            deployedCells: deployed,
            occupiedCells: [enemy],
            blockedCells: [],
            range: 2,
            hostileCells: [enemy],
            canPassHostiles: true,
        });

        expect(canMoveMonsterTo(movement(destination))).toBe(true);
        expect(canMoveMonsterTo(movement(enemy))).toBe(false);
    });

    it("permet au Fantôme et au Spectre de traverser un ennemi sans s'y arrêter", () => {
        const ghost = MONSTERS.find((monster) => monster.id === "ghost");
        const spectre = MONSTERS.find((monster) => monster.id === "spectre");
        const thief = MONSTERS.find((monster) => monster.id === "thief");
        const source = { x: 1, y: 1 };
        const enemy = { x: 2, y: 1 };
        const destination = { x: 3, y: 1 };
        const movement = (
            canPassHostiles: boolean,
            target: Position,
        ): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination: target,
            deployedCells: [enemy, destination],
            occupiedCells: [enemy],
            blockedCells: [],
            range: 2,
            hostileCells: [enemy],
            canPassHostiles,
        });

        if (!ghost || !spectre || !thief) throw new Error("Profils de test indisponibles.");

        for (const monster of [ghost, spectre]) {
            expect(canPassHostileMonsters(monster)).toBe(true);
            expect(canMoveMonsterTo(movement(canPassHostileMonsters(monster), destination))).toBe(
                true,
            );
            expect(canMoveMonsterTo(movement(canPassHostileMonsters(monster), enemy))).toBe(false);
        }
        expect(canPassHostileMonsters(thief)).toBe(false);
        expect(canMoveMonsterTo(movement(canPassHostileMonsters(thief), destination))).toBe(false);
    });

    it("permet au Spectre volant de survoler le hors-circuit sans s'y poser", () => {
        const spectre = MONSTERS.find((monster) => monster.id === "spectre");
        const source = { x: 1, y: 1 };
        const offCircuit = { x: 2, y: 1 };
        const destination = { x: 3, y: 1 };
        const movement = (
            target: Position,
            canPassUndeployedCells: boolean,
        ): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination: target,
            deployedCells: [destination],
            occupiedCells: [],
            blockedCells: [],
            range: 2,
            canPassUndeployedCells,
            boardWidth: 5,
            boardHeight: 5,
        });

        if (!spectre) throw new Error("Profil du Spectre indisponible.");
        expect(spectre.flying).toBe(true);
        expect(canMoveMonsterTo(movement(destination, spectre.flying === true))).toBe(true);
        expect(canMoveMonsterTo(movement(offCircuit, spectre.flying === true))).toBe(false);
        expect(canMoveMonsterTo(movement(destination, false))).toBe(false);
    });

    it("refuse les déplacements trop longs, hors dés ou vers une case bloquée", () => {
        const deployed: Position[] = [
            { x: 2, y: 2 },
            { x: 4, y: 2 },
        ];
        const source = { x: 1, y: 2 };

        const movement = (
            destination: Position,
            occupiedCells: readonly Position[] = [],
            blockedCells: readonly Position[] = [],
        ): Parameters<typeof canMoveMonsterTo>[0] => ({
            source,
            destination,
            deployedCells: deployed,
            occupiedCells,
            blockedCells,
        });

        expect(canMoveMonsterTo(movement({ x: 4, y: 2 }))).toBe(false);
        expect(canMoveMonsterTo(movement({ x: 3, y: 2 }))).toBe(false);
        expect(canMoveMonsterTo(movement({ x: 2, y: 2 }, [{ x: 2, y: 2 }]))).toBe(false);
        expect(canMoveMonsterTo(movement({ x: 2, y: 2 }, [], [{ x: 2, y: 2 }]))).toBe(false);
    });
});
