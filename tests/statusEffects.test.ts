import { describe, expect, it } from "vitest";

import {
    applyStatusEffectsAtTurnStart,
    healMonster,
} from "../src/game/statusEffects";
import { MONSTERS } from "../src/data/monsters";
import { getDefaultBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import { beginTurn, performAttacks } from "../src/simulation/combat";
import { createStats, type MatchState } from "../src/simulation/matchState";
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

function createPlacedMonster(
    id: string,
    monsterId: string,
    owner: 1 | 2,
    position: { x: number; y: number },
): PlacedMonster {
    const monster = MONSTERS.find((definition) => definition.id === monsterId)!;
    return {
        id,
        monster,
        owner,
        position,
        facing: owner === 1 ? "east" : "west",
        currentHp: monster.hp,
        cells: [position],
        summonedOnTurn: 0,
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: getInitialAttackUses(monster),
        movementsUsedThisTurn: 0,
        attackCooldowns: getInitialAttackCooldowns(monster),
        statusEffects: [],
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

    it("attribue les dégâts de poison à la créature qui l'a infligé", () => {
        const source = createPlacedMonster("m1", "swamp-thing", 1, { x: 5, y: 7 });
        const target = createPlacedMonster("m2", "ghost", 2, { x: 7, y: 7 });
        source.attackCooldowns = [0, 0];
        const state: MatchState = {
            turn: 1,
            currentPlayer: 1,
            profiles: { 1: "balanced", 2: "balanced" },
            tactics: { 1: "balanced", 2: "balanced" },
            allowBaseAttackOnSummonTurn: true,
            winner: null,
            finishReason: "turnLimit",
            health: { 1: 3, 2: 3 },
            reserves: {
                1: { invocation: 0, attack: 3, movement: 0 },
                2: { invocation: 0, attack: 0, movement: 0 },
            },
            monsters: [source, target],
            history: [],
            statistics: { 1: createStats(), 2: createStats() },
            nextMonsterId: 3,
            monstersKilledForVictory: 8,
        };

        performAttacks(state, getDefaultBoard());
        expect(target.statusEffects).toHaveLength(1);
        state.turn = 2;
        beginTurn(state, getDefaultGameConfiguration(), 2);

        expect(state.statistics[1].damageDealt).toBe(2);
        expect(state.statistics[2].damageReceived).toBe(2);
        expect(state.history.find((event) => event.type === "status")).toMatchObject({
            player: 1,
            monsterTypeId: "swamp-thing",
            monsterName: "Créature des Marais",
            target: "Fantôme (J2)",
            damage: 2,
        });
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
