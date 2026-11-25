import type { MonsterAttack, PlacedMonster, Position } from "../types/GameTypes";
import {
    applyMonsterHit,
    canAttackEnemyBase,
    findLivingMonsterAt,
    getEnemyStart,
    getJumpLanding,
    isAttackCellInRange,
    type AttackContext,
} from "./attackRules";
import { getFacingFromMovement, isBehind, isSamePosition } from "./geometry";
import {
    canAttackMonster,
    getBuffedAttackDamage,
    hasTurnBuff,
    isAreaAttack,
    registerAttackUse,
} from "./monsterActions";
import { applySupportEffect, type SupportEffectResult } from "./statusEffects";

export interface ResolvedHit {
    target: PlacedMonster;
    damage: number;
    criticalDamageBonus: number;
    effectiveDamage: number;
    overkillDamage: number;
    camouflageSuppressed: boolean;
    camouflageTriggered: boolean;
}

export interface AttackResolution {
    hits: ResolvedHit[];
    baseHit: boolean;
    support: { target: PlacedMonster; effect: SupportEffectResult } | null;
    attackFacing: PlacedMonster["facing"];
}

export function validateAttackResolution(
    context: AttackContext,
    attacker: PlacedMonster,
    attackIndex: number,
    target: Position,
): MonsterAttack {
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) throw new Error("Attaque de monstre introuvable.");
    if (attack.targetsAlliesOnly) {
        const targetMonster = findLivingMonsterAt(context.monsters, target);
        if (!targetMonster || targetMonster.owner !== context.currentPlayer) {
            throw new Error("La cible de l'attaque de soutien est invalide.");
        }
        if (
            attack.healAmount === undefined &&
            attack.cooldownReduction === undefined &&
            !hasTurnBuff(attack)
        ) {
            throw new Error("L'attaque de soutien ne possède aucun effet.");
        }
    }
    return attack;
}

export function resolveAttack(
    context: AttackContext,
    attacker: PlacedMonster,
    attackIndex: number,
    target: Position,
    cells: readonly Position[],
): AttackResolution {
    const attack = validateAttackResolution(context, attacker, attackIndex, target);
    const damage = getBuffedAttackDamage(attacker, attack);
    const targetMonster = findLivingMonsterAt(context.monsters, target);
    registerAttackUse(attacker, attackIndex, target);
    const result: AttackResolution = {
        hits: [],
        baseHit: false,
        support: null,
        attackFacing: attacker.facing,
    };

    if (attack.targetsAlliesOnly) {
        if (!targetMonster) {
            throw new Error("La cible de l'attaque de soutien est invalide.");
        }
        const effect = applySupportEffect(attack, targetMonster);
        if (!effect) throw new Error("L'attaque de soutien ne possède aucun effet.");
        result.support = { target: targetMonster, effect };
        return result;
    }

    const hit = (victim: PlacedMonster, criticalDamageBonus = 0) => {
        const dealt = damage + criticalDamageBonus;
        result.hits.push({
            target: victim,
            damage: dealt,
            criticalDamageBonus,
            ...applyMonsterHit(attacker, attack, victim, dealt),
        });
    };
    const enemyStart = getEnemyStart(context);
    if (isAreaAttack(attack)) {
        const hitCells = cells.filter((cell) =>
            isAttackCellInRange(attacker.position, attack, cell),
        );
        if (attack.movesToZone) {
            const landing = getJumpLanding(context, attacker, cells);
            if (landing) {
                attacker.facing = getFacingFromMovement(
                    attacker.position,
                    landing,
                    attacker.facing,
                );
                attacker.position = { ...landing };
            }
        }
        for (const victim of context.monsters) {
            if (
                victim.currentHp > 0 &&
                victim.id !== attacker.id &&
                hitCells.some((cell) => isSamePosition(cell, victim.position)) &&
                (attack.hitsAllies || victim.owner !== context.currentPlayer) &&
                canAttackMonster(attacker.monster, attack, victim.monster)
            ) {
                hit(victim);
            }
        }
        result.baseHit =
            canAttackEnemyBase(context, attacker) &&
            hitCells.some((cell) => isSamePosition(cell, enemyStart));
    } else if (targetMonster && targetMonster.owner !== context.currentPlayer) {
        const bonus = attacker.monster.bonusDamageFromBehind ?? 0;
        hit(
            targetMonster,
            bonus > 0 && isBehind(targetMonster.position, attacker.position, targetMonster.facing)
                ? bonus
                : 0,
        );
    } else {
        result.baseHit =
            isSamePosition(target, enemyStart) && canAttackEnemyBase(context, attacker);
    }
    return result;
}
