import { describe, expect, it } from "vitest";

import {
    advanceAttackCooldowns,
    canUseActionThisTurn,
    canAttackMonster,
    canMoveMonsterTo,
    getAttackZones,
    getAttackZoneOptions,
    getFacingFromMovement,
    getGridDistance,
    getInitialAttackCooldowns,
    getMovementActionsPerTurn,
    getMovementCost,
    getMonsterMovementPath,
    isBehind,
} from "../src/game/monsterActions";
import { MONSTERS } from "../src/data/monsters";
import {
    describeMonsterAttack,
    describeMonsterMovement,
} from "../src/game/monsterDescriptions";
import type { Position } from "../src/types/GameTypes";

describe("portée des actions de monstre", () => {
    it("applique les limites d'actions et de recharge par tour", () => {
        const thief = MONSTERS.find((monster) => monster.id === "thief");
        const archer = MONSTERS.find((monster) => monster.id === "archer");

        expect(getMovementActionsPerTurn({})).toBe(1);
        expect(getMovementActionsPerTurn(thief ?? {})).toBe(2);
        expect(canUseActionThisTurn(0, 1)).toBe(true);
        expect(canUseActionThisTurn(1, 1)).toBe(false);
        expect(canUseActionThisTurn(1, getMovementActionsPerTurn(thief ?? {}))).toBe(true);
        expect(advanceAttackCooldowns([3, 1, 0])).toEqual([2, 0, 0]);
        expect(getInitialAttackCooldowns(archer ?? { attacks: [] })).toEqual([0, 3]);
        expect(archer?.attacks[1]).toMatchObject({
            damage: 3,
            cost: 1,
            cooldownTurns: 3,
            pattern: { type: "radius", range: 5 },
        });
        const chargedAttack = archer?.attacks[1];
        if (!thief || !chargedAttack) throw new Error("Profils de test indisponibles.");
        expect(describeMonsterAttack(chargedAttack)).toContain("recharge : 3 tours du joueur");
        expect(describeMonsterMovement(thief)).toContain("2 déplacements par tour");
    });

    it("utilise un coût de déplacement configurable avec une valeur par défaut de un", () => {
        expect(getMovementCost({})).toBe(1);
        expect(getMovementCost({ movementCost: 0 })).toBe(0);
    });

    it("calcule les zones adjacentes et les attaques en ligne orientées", () => {
        expect(getAttackZones({ x: 2, y: 3 }, "east", { type: "adjacent" })).toContainEqual([
            { x: 3, y: 3 },
        ]);
        expect(getAttackZones({ x: 2, y: 3 }, "east", { type: "line", range: 3 })).toEqual([
            [{ x: 3, y: 3 }],
            [{ x: 4, y: 3 }],
            [{ x: 5, y: 3 }],
        ]);
        expect(getGridDistance({ x: 2, y: 3 }, { x: 4, y: 4 })).toBe(3);
    });

    it("forme une zone carrée de 2×2 dans la portée demandée", () => {
        const zones = getAttackZones({ x: 2, y: 3 }, "east", {
            type: "area",
            range: 5,
            width: 2,
            depth: 2,
        });

        expect(zones).toHaveLength(4);
        expect(zones[0]).toEqual([
            { x: 3, y: 2 },
            { x: 3, y: 3 },
            { x: 4, y: 2 },
            { x: 4, y: 3 },
        ]);
        expect(zones.flat()).toContainEqual({ x: 6, y: 3 });
    });

    it("permet au pirate de choisir une direction autour de lui et frappe au-delà d'une case", () => {
        const pirate = MONSTERS.find((monster) => monster.id === "pirate");
        const pattern = { type: "directionalArea" as const, width: 3, depth: 1 };

        expect(pirate?.attacks[0]?.pattern).toEqual(pattern);
        expect(getAttackZoneOptions({ x: 2, y: 3 }, "east", pattern)).toEqual([
            {
                target: { x: 2, y: 2 },
                cells: [{ x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
            },
            {
                target: { x: 3, y: 3 },
                cells: [{ x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }],
            },
            {
                target: { x: 2, y: 4 },
                cells: [{ x: 3, y: 4 }, { x: 2, y: 4 }, { x: 1, y: 4 }],
            },
            {
                target: { x: 1, y: 3 },
                cells: [{ x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 }],
            },
        ]);
    });

    it("génère un carré 2×2 depuis les points à cinq pas maximum, même s'il déborde", () => {
        const zones = getAttackZones({ x: 10, y: 10 }, "east", {
            type: "jumpArea",
            range: 5,
            width: 2,
            depth: 2,
        });

        expect(zones).toContainEqual([
            { x: 15, y: 10 },
            { x: 16, y: 10 },
            { x: 15, y: 11 },
            { x: 16, y: 11 },
        ]);
        expect(zones).toContainEqual([
            { x: 12, y: 13 },
            { x: 13, y: 13 },
            { x: 12, y: 14 },
            { x: 13, y: 14 },
        ]);
        expect(zones.some((zone) => zone[0].x === 13 && zone[0].y === 13)).toBe(false);
        expect(getGridDistance({ x: 10, y: 10 }, { x: 12, y: 13 })).toBe(5);
        expect(getGridDistance({ x: 10, y: 10 }, { x: 13, y: 13 })).toBe(6);
        expect(zones.every((zone) => zone.length === 4)).toBe(true);
    });

    it("crée une zone circulaire de portée cinq, centrée sur l'attaquant", () => {
        const zones = getAttackZones({ x: 5, y: 5 }, "east", {
            type: "radius",
            range: 5,
        });
        const cells = zones.flat();

        expect(cells).toContainEqual({ x: 10, y: 5 });
        expect(cells).toContainEqual({ x: 8, y: 9 });
        expect(cells).not.toContainEqual({ x: 9, y: 9 });
        expect(cells).not.toContainEqual({ x: 5, y: 5 });
    });

    it("interdit les attaques de mêlée contre les monstres volants", () => {
        const flyingMonster = {
            id: "dragon",
            name: "Dragon",
            symbol: "D",
            color: 0,
            cost: 1,
            hp: 1,
            attacks: [],
            movementRange: 1,
            flying: true,
        };
        const groundMonster = { ...flyingMonster, flying: false };
        const meleeAttack = {
            name: "Mêlée",
            damage: 1,
            cost: 1,
            pattern: { type: "adjacent" as const },
        };
        const rangedAttack = {
            ...meleeAttack,
            pattern: { type: "radius" as const, range: 5 },
        };

        expect(canAttackMonster(groundMonster, meleeAttack, flyingMonster)).toBe(false);
        expect(canAttackMonster(flyingMonster, meleeAttack, flyingMonster)).toBe(true);
        expect(canAttackMonster(groundMonster, rangedAttack, flyingMonster)).toBe(true);
    });

    it("crée des lignes de trois cases dont l'ancrage peut être à quatre cases", () => {
        const zones = getAttackZones({ x: 5, y: 5 }, "east", {
            type: "line",
            range: 4,
            length: 3,
            allDirections: true,
        });

        expect(zones).toHaveLength(16);
        expect(zones).toContainEqual([
            { x: 9, y: 5 },
            { x: 10, y: 5 },
            { x: 11, y: 5 },
        ]);
        expect(zones).toContainEqual([
            { x: 5, y: 1 },
            { x: 5, y: 0 },
            { x: 5, y: -1 },
        ]);
        expect(zones).toContainEqual([
            { x: 1, y: 5 },
            { x: 0, y: 5 },
            { x: -1, y: 5 },
        ]);
        expect(zones).toContainEqual([
            { x: 5, y: 9 },
            { x: 5, y: 10 },
            { x: 5, y: 11 },
        ]);
    });

    it("respecte la portée minimale d'une attaque en ligne", () => {
        const zones = getAttackZones({ x: 5, y: 5 }, "east", {
            type: "line",
            minRange: 2,
            range: 4,
            length: 3,
            allDirections: true,
        });

        expect(zones).toHaveLength(12);
        expect(zones).not.toContainEqual([
            { x: 6, y: 5 },
            { x: 7, y: 5 },
            { x: 8, y: 5 },
        ]);
        expect(zones).toContainEqual([
            { x: 7, y: 5 },
            { x: 8, y: 5 },
            { x: 9, y: 5 },
        ]);
    });

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
