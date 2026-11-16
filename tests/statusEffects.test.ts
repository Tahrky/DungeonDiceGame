import { describe, expect, it } from "vitest";

import {
    applyStatusEffectsAtTurnStart,
    healMonster,
} from "../src/game/statusEffects";
import { MONSTERS } from "../src/data/monsters";
import type { PlacedMonster } from "../src/types/GameTypes";

function createPoisonedMonster(duration: number | "untilDeath"): PlacedMonster {
    const monster = MONSTERS.find((definition) => definition.id === "ghost")!;
    const poison = MONSTERS.find((definition) => definition.id === "swamp-thing")!.attacks[0]
        .statusEffect!;
    return {
        id: "target",
        monster,
        owner: 1,
        position: { x: 0, y: 0 },
        facing: "north",
        currentHp: 10,
        cells: [{ x: 0, y: 0 }],
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: [],
        movementsUsedThisTurn: 0,
        attackCooldowns: [],
        statusEffects: [{ ...poison, remainingTurns: duration }],
    };
}

describe("effets de statut au début du tour", () => {
    it("inflige les dégâts et conserve un effet jusqu'à la mort", () => {
        const target = createPoisonedMonster("untilDeath");

        expect(applyStatusEffectsAtTurnStart(target)).toBe(2);
        expect(target.currentHp).toBe(8);
        expect(target.statusEffects[0]?.remainingTurns).toBe("untilDeath");
    });

    it("applique une durée finie exactement le nombre de tours prévu", () => {
        const target = createPoisonedMonster(2);

        expect(applyStatusEffectsAtTurnStart(target)).toBe(2);
        expect(target.statusEffects[0]?.remainingTurns).toBe(1);
        expect(applyStatusEffectsAtTurnStart(target)).toBe(2);
        expect(target.statusEffects).toEqual([]);
        expect(applyStatusEffectsAtTurnStart(target)).toBe(0);
    });

    it("supprime les effets d'un monstre mort", () => {
        const target = createPoisonedMonster("untilDeath");
        target.currentHp = 0;

        expect(applyStatusEffectsAtTurnStart(target)).toBe(0);
        expect(target.statusEffects).toEqual([]);
    });

    it("soigne sans dépasser les PV maximum et ne dissipe que si le sort le demande", () => {
        const target = createPoisonedMonster("untilDeath");
        target.currentHp = target.monster.hp - 1;

        expect(healMonster(target, 3)).toEqual({ healed: 1, clearedEffects: 0 });
        expect(target.currentHp).toBe(target.monster.hp);
        expect(target.statusEffects).toHaveLength(1);

        expect(healMonster(target, 3, true)).toEqual({ healed: 0, clearedEffects: 1 });
        expect(target.currentHp).toBe(target.monster.hp);
        expect(target.statusEffects).toEqual([]);

        const fullHealthTarget = createPoisonedMonster("untilDeath");
        fullHealthTarget.currentHp = fullHealthTarget.monster.hp;
        expect(healMonster(fullHealthTarget, 3, true)).toEqual({
            healed: 0,
            clearedEffects: 1,
        });
        expect(fullHealthTarget.statusEffects).toEqual([]);
    });
});
