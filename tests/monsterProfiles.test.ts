import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { MONSTERS } from "../src/data/monsters";
import { MONSTER_SPRITES } from "../src/data/monsterSprites";

describe("profils de monstres", () => {
    it("configure le Mage de Givre pour frapper une ligne de trois cases dans les quatre directions", () => {
        const frostMage = MONSTERS.find((monster) => monster.id === "frost-mage");

        expect(frostMage?.attacks[0]).toMatchObject({
            cost: 2,
            damage: 3,
            hitsAllies: true,
            pattern: { type: "line", range: 4, length: 3, allDirections: true },
        });
        expect(frostMage?.attacks[1]).toMatchObject({
            name: "Explosion de Givre",
            cost: 3,
            damage: 3,
            hitsAllies: true,
            pattern: { type: "selfRadius", range: 3 },
        });
    });

    it("configure l'Archer squelette et son attaque circulaire à distance", () => {
        const archer = MONSTERS.find((monster) => monster.id === "archer");

        expect(archer).toMatchObject({
            cost: 2,
            hp: 2,
            movementRange: 2,
        });
        expect(archer?.attacks[0]).toMatchObject({
            damage: 1,
            pattern: { type: "radius", range: 5 },
        });
        expect(archer?.attacks[1]).toMatchObject({
            damage: 3,
            cooldownTurns: 2,
            initialCooldownTurns: 1,
            pattern: { type: "radius", range: 5 },
            animation: "alternativeAttack1",
        });
    });

    it("associe la seconde attaque de l'Archer à son animation puissante", () => {
        expect(MONSTER_SPRITES.archer.animations).toMatchObject({
            attack: { spriteSheet: "/sprites/archer/Attack.png" },
            alternativeAttack1: { spriteSheet: "/sprites/archer/AttackPuissante.png" },
        });
    });

    it("configure le Fantôme et son déplacement gratuit", () => {
        const ghost = MONSTERS.find((monster) => monster.id === "ghost");

        expect(ghost?.movementCost).toBe(0);
        expect(ghost?.attacks).toEqual([
            {
                name: "Coup au corps à corps",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ]);
    });

    it("configure le Voleur sournois avec ses statistiques spéciales", () => {
        const thief = MONSTERS.find((monster) => monster.id === "thief");

        expect(thief).toMatchObject({
            cost: 3,
            hp: 4,
            bonusDamageFromBehind: 3,
            movementRange: 3,
        });
        expect(thief?.attacks[0]).toMatchObject({ damage: 2, cost: 1 });
    });

    it("configure le Prêtre pour soigner et réduire les recharges des alliés", () => {
        const priest = MONSTERS.find((monster) => monster.id === "priest");

        expect(priest?.attackActionsPerTurn).toBe(2);
        expect(priest?.attacks).toMatchObject([
            {
                name: "Soin",
                damage: 0,
                healAmount: 3,
                targetsAlliesOnly: true,
                clearsStatusEffects: true,
                usesPerTurn: 1,
                pattern: { type: "radius", range: 4 },
            },
            {
                name: "Récupération de sorts",
                damage: 0,
                cooldownReduction: 1,
                targetsAlliesOnly: true,
                usesPerTurn: 1,
                pattern: { type: "radius", range: 3 },
            },
        ]);
    });

    it("configure le Prêtre Buffer avec ses deux bonus temporaires", () => {
        const priestBuffer = MONSTERS.find((monster) => monster.id === "priestBuffer");

        expect(priestBuffer?.attacks).toMatchObject([
            {
                name: "Foulée bénie",
                movementRangeBonus: 1,
                movementCostReduction: 1,
                targetsAlliesOnly: true,
                targetsSelf: true,
                usesPerTurn: 1,
            },
            {
                name: "Force sacrée",
                attackDamageBonus: 1,
                attackCostReduction: 1,
                targetsAlliesOnly: true,
                usesPerTurn: 1,
            },
        ]);
    });

    it("définit le Spectre comme un monstre volant de haute altitude", () => {
        const spectre = MONSTERS.find((monster) => monster.id === "spectre");

        expect(spectre).toMatchObject({ flying: true });
    });

    it("associe les feuilles de sprites du Prêtre à ses animations", () => {
        expect(MONSTER_SPRITES.priest.animations).toMatchObject({
            idle: { spriteSheet: "/sprites/priest/Idle.png" },
            attack: { spriteSheet: "/sprites/priest/Soin.png" },
            alternativeAttack1: { spriteSheet: "/sprites/priest/Benediction.png" },
            death: { spriteSheet: "/sprites/priest/Die.png" },
            hit: { spriteSheet: "/sprites/priest/TakeDamage.png" },
            move: { spriteSheet: "/sprites/priest/Walk.png" },
        });
    });

    it("référence uniquement des feuilles de sprites présentes", () => {
        for (const definition of Object.values(MONSTER_SPRITES)) {
            for (const animation of Object.values(definition.animations)) {
                if (!animation) continue;
                const spriteFiles =
                    "spriteSheet" in animation
                        ? [animation.spriteSheet]
                        : Object.values(animation.files);
                for (const file of spriteFiles) {
                    expect(existsSync(resolve("public", file.replace(/^\/+/, "")))).toBe(true);
                }
            }
        }
    });
});
