import { describe, expect, it } from "vitest";

import {
    applyAttackStatusEffect,
    applyStatusEffectsAtTurnStart,
    applySupportEffect,
    beginMonsterTurn,
    finishMonsterTurn,
    getMonsterMovementCost,
    getMonsterMovementRange,
    healMonster,
    isMonsterAsleep,
} from "../src/game/statusEffects";
import { MONSTERS } from "../src/data/monsters";
import { applyMonsterHit } from "../src/game/attackRules";
import { getDefaultBoard, getStartingPositions } from "../src/game/boards";
import { resolveAttack } from "../src/game/combatResolution";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { describeMonsterAttack } from "../src/game/monsterDescriptions";
import {
    applyMonsterMovement,
    getInitialAttackCooldowns,
    getInitialAttackUses,
} from "../src/game/monsterActions";
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
    it("ne dissipe un effet lors d'une réduction de recharge que si l'attaque le demande", () => {
        const target = createPoisonedMonster(2);
        target.attackCooldowns = [2];
        const attack = {
            ...target.monster.attacks[0]!,
            damage: 0,
            targetsAlliesOnly: true,
            cooldownReduction: 1,
        };

        expect(applySupportEffect(attack, target)).toEqual({
            type: "cooldown",
            reduction: 1,
            reducedCooldowns: 1,
            clearedEffects: 0,
        });
        expect(target.statusEffects).toHaveLength(1);
        expect(applySupportEffect({ ...attack, clearsStatusEffects: true }, target)).toMatchObject({
            clearedEffects: 1,
        });
        expect(target.statusEffects).toEqual([]);
    });

    it("résout les dégâts, le camouflage et les effets d'une élimination", () => {
        const thief = createPlacedMonster("thief", "thief", 1, { x: 5, y: 7 });
        const target = createPlacedMonster("target", "ghost", 2, { x: 6, y: 7 });
        target.currentHp = 1;
        target.isCamouflaged = true;
        target.statusEffects = createPoisonedMonster(2).statusEffects;

        const result = applyMonsterHit(thief, thief.monster.attacks[0]!, target, 3);

        expect(result).toEqual({
            effectiveDamage: 1,
            overkillDamage: 2,
            camouflageSuppressed: true,
            camouflageTriggered: true,
        });
        expect(target.currentHp).toBe(-2);
        expect(target.statusEffects).toEqual([]);
        expect(target.isCamouflaged).toBe(false);
        expect(thief.isCamouflaged).toBe(true);
    });

    it("applique les effets avant de réinitialiser les actions du monstre", () => {
        const monster = createPoisonedMonster(2);
        monster.attacksUsedThisTurn = 1;
        monster.attackUsesThisTurn = [1];
        monster.attackCooldowns = [2];
        monster.movementsUsedThisTurn = 1;

        expect(beginMonsterTurn(monster)).toBe(2);
        expect(monster.currentHp).toBe(8);
        expect(monster.attackCooldowns).toEqual([1]);
        expect(monster.attackUsesThisTurn).toEqual([0]);
        expect(monster.attacksUsedThisTurn).toBe(0);
        expect(monster.movementsUsedThisTurn).toBe(0);
    });

    it("dissipe les anciens effets avant d'appliquer celui de l'attaque", () => {
        const source = createPlacedMonster("source", "swamp-thing", 1, { x: 5, y: 7 });
        const target = createPoisonedMonster(2);
        const attack = { ...source.monster.attacks[0]!, clearsStatusEffects: true };

        applyAttackStatusEffect(target, attack, source);

        expect(target.statusEffects).toHaveLength(1);
        expect(target.statusEffects[0]?.remainingTurns).toBe(
            attack.statusEffect?.type === "damageOverTime" ? attack.statusEffect.duration : undefined,
        );
        expect(target.statusEffects[0]?.source?.id).toBe(source.id);
        applyAttackStatusEffect(target, { ...attack, statusEffect: undefined }, source);
        expect(target.statusEffects).toEqual([]);
    });

    it("ralentit le déplacement jusqu'à ce que la cible bouge, selon sa portée de base", () => {
        const source = createPlacedMonster("archer", "arbalétrier", 1, { x: 5, y: 7 });
        const attack = source.monster.attacks[0]!;
        expect(describeMonsterAttack(attack)).toContain(
            "4 dégâts, ralentit la cible jusqu'à son prochain déplacement",
        );
        const fastTarget = createPlacedMonster("fast", "black-knight", 2, { x: 6, y: 7 });
        fastTarget.monster = {
            ...fastTarget.monster,
            movementRange: 2,
            movementCost: 1,
        };
        const slowTarget = createPlacedMonster("slow", "ghost", 2, { x: 6, y: 8 });
        slowTarget.monster = {
            ...slowTarget.monster,
            movementRange: 1,
            movementCost: 1,
        };

        applyAttackStatusEffect(fastTarget, attack, source);
        applyAttackStatusEffect(slowTarget, attack, source);

        expect(getMonsterMovementRange(fastTarget)).toBe(1);
        expect(getMonsterMovementCost(fastTarget)).toBe(1);
        expect(getMonsterMovementRange(slowTarget)).toBe(1);
        expect(getMonsterMovementCost(slowTarget)).toBe(2);
        expect(slowTarget.statusEffects[0]?.color).toBe("violet");

        applyMonsterMovement(fastTarget, [fastTarget.position, { x: 7, y: 7 }]);
        expect(fastTarget.statusEffects).toEqual([]);
    });

    it("endort la cible pendant son tour et permet au soin de dissiper le sommeil", () => {
        const source = createPlacedMonster("archer", "arbalétrier", 1, { x: 5, y: 7 });
        const target = createPlacedMonster("target", "ghost", 2, { x: 6, y: 7 });

        expect(describeMonsterAttack(source.monster.attacks[1]!)).toContain(
            "6 dégâts et endort la cible pendant 2 tours",
        );
        applyAttackStatusEffect(target, source.monster.attacks[1]!, source);
        expect(isMonsterAsleep(target)).toBe(true);
        expect(target.statusEffects[0]?.remainingTurns).toBe(2);
        beginMonsterTurn(target);
        expect(isMonsterAsleep(target)).toBe(true);
        finishMonsterTurn(target);
        expect(isMonsterAsleep(target)).toBe(true);
        expect(target.statusEffects[0]?.remainingTurns).toBe(1);
        beginMonsterTurn(target);
        expect(isMonsterAsleep(target)).toBe(true);
        finishMonsterTurn(target);
        expect(isMonsterAsleep(target)).toBe(false);

        applyAttackStatusEffect(target, source.monster.attacks[1]!, source);
        healMonster(target, 1, true);
        expect(isMonsterAsleep(target)).toBe(false);
    });

    it("laisse le Faucheur à 1 PV après un tir endormant de 6 dégâts", () => {
        const attacker = createPlacedMonster("archer", "arbalétrier", 1, { x: 5, y: 7 });
        const reaper = createPlacedMonster("reaper", "reaper", 2, { x: 6, y: 7 });
        attacker.attackCooldowns[1] = 0;
        const board = getDefaultBoard();

        const result = resolveAttack(
            {
                board,
                startingPositions: getStartingPositions(board),
                monsters: [attacker, reaper],
                currentPlayer: 1,
                turn: 2,
                allowBaseAttackOnSummonTurn: true,
            },
            attacker,
            1,
            reaper.position,
            [reaper.position],
        );

        expect(result.hits).toHaveLength(1);
        expect(result.hits[0]).toMatchObject({
            damage: 5,
            effectiveDamage: 5,
            overkillDamage: 0,
        });
        expect(reaper.currentHp).toBe(1);
        expect(isMonsterAsleep(reaper)).toBe(true);
    });

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
        target.currentHp = 10;
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
            movementStagnation: {},
            history: [],
            statistics: { 1: createStats(), 2: createStats() },
            nextMonsterId: 3,
            monstersKilledForVictory: 6,
        };

        performAttacks(state, getDefaultBoard());
        expect(target.statusEffects).toHaveLength(1);
        state.turn = 2;
        beginTurn(state, getDefaultGameConfiguration(), 2);

        expect(state.statistics[1].damageDealt).toBe(5);
        expect(state.statistics[2].damageReceived).toBe(5);
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
