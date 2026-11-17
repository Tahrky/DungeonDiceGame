import { describe, expect, it } from "vitest";
import type { MonsterTurnBuffs } from "../src/types/GameTypes";

import {
    advanceAttackCooldowns,
    applyMonsterTurnBuff,
    canUseActionThisTurn,
    canAttackBaseThisTurn,
    canAttackMonster,
    canTargetMonsterOwner,
    canUseMonsterAttackThisTurn,
    clearMonsterTurnBuff,
    getAttackCost,
    getAttackDamage,
    getAttackZones,
    getAttackActionsPerTurn,
    getAttackZoneOptions,
    getGridDistance,
    getInitialAttackCooldowns,
    getInitialAttackUses,
    getMovementActionsPerTurn,
    getMovementCost,
    getMovementRange,
    hasLineOfSight,
} from "../src/game/monsterActions";
import { MONSTERS } from "../src/data/monsters";
import {
    describeMonsterTraits,
    describeMonsterAttack,
    describeMonsterMovement,
    describeMonsterStatusEffect,
    formatCost,
    formatHitPoints,
} from "../src/game/monsterDescriptions";
describe("portée des actions de monstre", () => {
    it("respecte les camps autorisés pour les cibles d'attaque", () => {
        expect(canTargetMonsterOwner({ targetsAlliesOnly: true }, 1, 1)).toBe(true);
        expect(canTargetMonsterOwner({ targetsAlliesOnly: true }, 2, 1)).toBe(false);
        expect(canTargetMonsterOwner({}, 1, 1)).toBe(false);
        expect(canTargetMonsterOwner({ hitsAllies: true }, 1, 1)).toBe(true);
        expect(canTargetMonsterOwner({ hitsAllies: true }, 2, 1)).toBe(true);
    });

    it("applique l’option d’attaque de la base au tour d’apparition", () => {
        expect(canAttackBaseThisTurn(3, 3)).toBe(true);
        expect(canAttackBaseThisTurn(3, 3, false)).toBe(false);
        expect(canAttackBaseThisTurn(3, 3, true)).toBe(true);
        expect(canAttackBaseThisTurn(2, 3)).toBe(true);
        expect(canAttackBaseThisTurn(undefined, 3)).toBe(true);
    });

    it("applique les limites d'actions et de recharge par tour", () => {
        const thief = MONSTERS.find((monster) => monster.id === "thief");
        const blackKnight = MONSTERS.find((monster) => monster.id === "black-knight");
        const archer = MONSTERS.find((monster) => monster.id === "archer");

        expect(getAttackActionsPerTurn({})).toBe(1);
        expect(getAttackActionsPerTurn(blackKnight ?? {})).toBe(2);
        expect(
            canUseActionThisTurn(1, getAttackActionsPerTurn(blackKnight ?? {})),
        ).toBe(true);
        expect(
            canUseActionThisTurn(2, getAttackActionsPerTurn(blackKnight ?? {})),
        ).toBe(false);
        expect(getMovementActionsPerTurn({})).toBe(1);
        expect(getMovementActionsPerTurn(thief ?? {})).toBe(2);
        expect(canUseActionThisTurn(0, 1)).toBe(true);
        expect(canUseActionThisTurn(1, 1)).toBe(false);
        expect(canUseActionThisTurn(1, getMovementActionsPerTurn(thief ?? {}))).toBe(true);
        expect(advanceAttackCooldowns([3, 1, 0])).toEqual([2, 0, 0]);
        expect(getInitialAttackCooldowns(archer ?? { attacks: [] })).toEqual([0, 1]);
        expect(getInitialAttackUses(archer ?? { attacks: [] })).toEqual([0, 0]);
        expect(canUseMonsterAttackThisTurn({ usesPerTurn: 1 }, 0)).toBe(true);
        expect(canUseMonsterAttackThisTurn({ usesPerTurn: 1 }, 1)).toBe(false);
        expect(canUseMonsterAttackThisTurn({}, 5)).toBe(true);
        expect(archer?.attacks[1]).toMatchObject({
            damage: 3,
            cost: 1,
            cooldownTurns: 2,
            initialCooldownTurns: 1,
            pattern: { type: "radius", range: 4 },
        });
        const chargedAttack = archer?.attacks[1];
        if (!thief || !chargedAttack) throw new Error("Profils de test indisponibles.");
        expect(describeMonsterAttack(chargedAttack)).toContain(
            "recharge : 2 tours du joueur (1 tour à l'apparition)",
        );
        expect(describeMonsterMovement(thief)).toContain("2 déplacements par tour");
    });

    it("utilise un coût de déplacement configurable avec une valeur par défaut de un", () => {
        expect(getMovementCost({})).toBe(1);
        expect(getMovementCost({ movementCost: 0 })).toBe(0);
    });

    it("applique les bonus temporaires de déplacement et d'attaque jusqu'à leur expiration", () => {
        const target: { turnBuffs?: MonsterTurnBuffs } = {};
        applyMonsterTurnBuff(target, {
            movementRangeBonus: 1,
            movementCostReduction: 1,
        });
        applyMonsterTurnBuff(target, {
            attackDamageBonus: 1,
            attackCostReduction: 1,
        });

        expect(target.turnBuffs).toEqual({
            movementRangeBonus: 1,
            movementCostReduction: 1,
            attackDamageBonus: 1,
            attackCostReduction: 1,
        });
        expect(getMovementRange({ movementRange: 2 }, target.turnBuffs?.movementRangeBonus)).toBe(
            3,
        );
        expect(getMovementCost({ movementCost: 1 }, target.turnBuffs?.movementCostReduction)).toBe(
            0,
        );
        expect(getAttackCost({ cost: 1 }, target.turnBuffs?.attackCostReduction)).toBe(0);
        expect(getAttackDamage({ damage: 1 }, target.turnBuffs?.attackDamageBonus)).toBe(2);

        clearMonsterTurnBuff(target);
        expect(target.turnBuffs).toBeUndefined();
    });

    it("affiche les coûts en symboles avant le nom et les caractéristiques", () => {
        const blackKnight = MONSTERS.find((monster) => monster.id === "black-knight");
        const ghost = MONSTERS.find((monster) => monster.id === "ghost");
        const spectre = MONSTERS.find((monster) => monster.id === "spectre");
        if (!blackKnight || !ghost || !spectre) {
            throw new Error("Profils de test indisponibles.");
        }

        expect(describeMonsterAttack(blackKnight.attacks[0])).toMatch(/^1 ⚔️ Corps à corps :/);
        expect(describeMonsterTraits(blackKnight)).toContain("2 attaques par tour");
        expect(describeMonsterTraits(ghost)).toContain("Fantomatique");
        expect(describeMonsterTraits(spectre)).toEqual(["Fantomatique", "Volant"]);
        expect(describeMonsterMovement(blackKnight)).toMatch(/^1 ➡️ Déplacement :/);
        expect(formatCost(3, "🐍")).toBe("3 🐍");
        expect(formatHitPoints(2)).toBe("2 PV");
        const poison = MONSTERS.find((monster) => monster.id === "swamp-thing")?.attacks[0]
            .statusEffect;
        if (!poison) throw new Error("Effet de poison indisponible.");
        expect(describeMonsterStatusEffect({ ...poison, remainingTurns: "untilDeath" })).toBe(
            "-2 PV / Tour",
        );
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

    it("bloque la visibilité derrière une case intermédiaire, mais pas derrière la cible", () => {
        const source = { x: 1, y: 3 };
        const target = { x: 5, y: 3 };

        expect(hasLineOfSight(source, target, [{ x: 3, y: 3 }])).toBe(false);
        expect(hasLineOfSight(source, target, [{ x: 5, y: 3 }])).toBe(true);
        expect(hasLineOfSight(source, target, [{ x: 3, y: 2 }])).toBe(true);
    });

    it("autorise une diagonale si une seule des deux cases latérales est bloquée", () => {
        expect(
            hasLineOfSight(
                { x: 1, y: 1 },
                { x: 4, y: 4 },
                [{ x: 2, y: 2 }],
            ),
        ).toBe(false);
        expect(
            hasLineOfSight(
                { x: 1, y: 1 },
                { x: 2, y: 2 },
                [{ x: 2, y: 1 }],
            ),
        ).toBe(true);
        expect(
            hasLineOfSight(
                { x: 1, y: 1 },
                { x: 2, y: 2 },
                [{ x: 2, y: 1 }, { x: 1, y: 2 }],
            ),
        ).toBe(false);
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

    it("crée une zone circulaire centrée sur le mage jusqu'à trois cases", () => {
        const center = { x: 6, y: 6 };
        const zones = getAttackZones(center, "east", { type: "selfRadius", range: 3 });
        const cells = zones.flat();

        expect(zones).toHaveLength(1);
        expect(cells).not.toContainEqual(center);
        expect(cells).toContainEqual({ x: 9, y: 6 });
        expect(cells).not.toContainEqual({ x: 10, y: 6 });
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

    it("ajoute le lanceur comme cible pour un sort autorisant l'auto-ciblage", () => {
        const attacker = { x: 5, y: 5 };
        const options = getAttackZoneOptions(
            attacker,
            "east",
            { type: "radius", range: 4 },
            true,
        );

        expect(options).toContainEqual({ target: attacker, cells: [attacker] });
    });

    it("permet d'attaquer les monstres volants, sauf ceux de haute altitude au corps à corps", () => {
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
        const highAltitudeMonster = { ...flyingMonster, highAltitude: true };
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

        expect(canAttackMonster(groundMonster, meleeAttack, flyingMonster)).toBe(true);
        expect(canAttackMonster(groundMonster, meleeAttack, highAltitudeMonster)).toBe(false);
        expect(canAttackMonster(flyingMonster, meleeAttack, highAltitudeMonster)).toBe(true);
        expect(canAttackMonster(groundMonster, rangedAttack, highAltitudeMonster)).toBe(true);
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

});
